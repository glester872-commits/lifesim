// Compras, tarjeta de transporte, destinos, actividades y el salto de tiempo:
// `npm run check`. Falla si algo no se cumple.
import assert from 'node:assert/strict';
import { CATALOGS, getCatalog, type Product } from '../src/data/catalogs.ts';
import { ACTIVITIES, getActivity } from '../src/data/activities.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { consume, payFare, purchase, type Wallet } from '../src/systems/Commerce.ts';
import { blocker, perform, type ActivityContext } from '../src/systems/Activities.ts';
import { destinationsFrom, getStop, stopAtStation } from '../src/systems/Transit.ts';
import { whereabouts } from '../src/systems/Characters.ts';
import { levelAt, profileFor } from '../src/systems/Crowd.ts';
import { streetProfileFor, streetTargetAt } from '../src/systems/StreetLife.ts';
import { placeInfo } from '../src/systems/Places.ts';
import { SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import { SAVE_KEY } from '../src/config/constants.ts';
import { getItem } from '../src/data/items.ts';
import { haircut, tattoo, visibleTattoos, withAppearance } from '../src/systems/Appearance.ts';
import { buyGarment, stockOf, takeOff, wear } from '../src/systems/Retail.ts';
import { CATEGORIES, STORES } from '../src/data/retail.ts';
import { LOCATIONS } from '../src/data/locations.ts';
import type { Appearance } from '../src/data/appearance.ts';

const empty = (money: number): Wallet => ({ money, inventory: {}, cards: {} });
const product = (catalog: string, id: string): Product => getCatalog(catalog).products.find((p) => p.id === id)!;

// ------------------------------------------------------------- catálogos

for (const c of CATALOGS) {
  for (const p of c.products) {
    assert.ok(p.price > 0, `${c.id}/${p.id}: precio`);
    getItem('item' in p.effect ? p.effect.item : p.effect.card);
  }
}

// ---------------------------------------------------------------- compras

{
  // Céntimos exactos: refresco + patatas + agua desde €5.
  let w = empty(5);
  for (const id of ['cola', 'chips', 'water']) {
    const r = purchase(w, product('vending', id));
    assert.ok(r.ok, r.message);
    w = r.wallet;
  }
  assert.equal(w.money, 1.5);
  assert.deepEqual(w.inventory, { cola: 1, chips: 1, water: 1 });
  // Sin dinero no hay compra y la cartera no cambia.
  const broke = purchase(w, product('vending', 'sandwich'));
  assert.equal(broke.ok, false);
  assert.equal(broke.reason, 'money');
  assert.equal(broke.wallet, w);
  // Comer devuelve energía y gasta el objeto; lo que no se tiene no se come.
  const ate = consume(w, 'chips');
  assert.ok(ate.ok && ate.energy === getItem('chips').energy);
  assert.equal(ate.wallet.inventory.chips, undefined);
  assert.equal(consume(ate.wallet, 'chips').reason, 'no-item');
  console.log(`máquina: 3 compras → ${w.money} €, bolsa ${JSON.stringify(w.inventory)}; sin dinero: «${broke.message}»`);
}

// ----------------------------------------------------- tarjeta de transporte

{
  const line = destinationsFrom(getStop('vallesco'))[0].line;
  let w = empty(40);
  // Sin tarjeta no se sube; recargar sin tarjeta tampoco.
  assert.equal(payFare(w, line.card, line.fare).reason, 'no-card');
  assert.equal(purchase(w, product('transport-machine', 'transport-10')).reason, 'no-card');
  const bought = purchase(w, product('transport-machine', 'transport-new'));
  assert.ok(bought.ok);
  w = bought.wallet;
  assert.equal(w.cards.transport, 10);
  assert.equal(w.money, 27.5);
  // Una segunda tarjeta no: se recarga la que hay.
  assert.equal(purchase(w, product('transport-machine', 'transport-new')).reason, 'has-card');
  // Cinco viajes gastan la tarjeta; el sexto no pasa.
  for (let i = 0; i < 5; i++) {
    const r = payFare(w, line.card, line.fare);
    assert.ok(r.ok, r.message);
    w = r.wallet;
  }
  assert.equal(w.cards.transport, 0);
  const stuck = payFare(w, line.card, line.fare);
  assert.equal(stuck.reason, 'no-balance');
  w = purchase(w, product('transport-machine', 'transport-10')).wallet;
  assert.ok(payFare(w, line.card, line.fare).ok, 'tras recargar se puede viajar');
  console.log(`tarjeta: €12,50 con €10 de saldo, 5 viajes, sin saldo: «${stuck.message}»`);
}

// -------------------------------------------------------------- destinos

{
  const from = stopAtStation('vallesco-station')!;
  const dests = destinationsFrom(from);
  const byId = Object.fromEntries(dests.map((d) => [d.stop.id, d]));
  assert.ok(!byId.vallesco, 'no se viaja a donde ya se está');
  assert.equal(byId.ribera.minutes, 15);
  assert.equal(byId.decathlon.minutes, 30);
  assert.ok(byId.decathlon.stop.offMap && !byId.decathlon.stop.station, 'Decathlon aún no tiene mapa');
  assert.equal(destinationsFrom(getStop('decathlon')).find((d) => d.stop.id === 'vallesco')!.minutes, 30, 'la vuelta tarda lo mismo');
  console.log(`destinos desde Vallesco: ${dests.map((d) => `${d.stop.name} ${d.minutes} min`).join(' · ')}`);
}

// ------------------------------------------------------------ actividades

{
  const work = getActivity('work-decathlon');
  const at = (day: number, hour: number, energy = 100): ActivityContext => ({ day, hour, minute: 0, money: 0, energy });
  assert.equal(blocker(work, at(1, 11)), null, 'un lunes a las 11 se puede trabajar');
  assert.ok(blocker(work, at(7, 11)), 'el domingo no hay turno');
  assert.ok(blocker(work, at(1, 7)), 'a las 7 no se empieza');
  assert.ok(blocker(work, at(1, 11, 20)), 'sin energía no se trabaja');
  const out = perform(work);
  assert.deepEqual([out.minutes, out.money, out.energy], [360, 54, -35]);
  for (const a of ACTIVITIES) assert.ok(a.minutes > 0 && a.lines.length > 0, `${a.id}: duración y texto`);
}

// ------------------------------------------------ salir a trabajar y volver

/**
 * Lunes 10:00: metro a Decathlon (30 min), turno (6 h), metro de vuelta
 * (30 min). Al volver son las 17:00 y todo lo que se ve sale de esa hora: los
 * personajes están donde les toca a las 17:00, las tiendas con la gente de las
 * 17:00 y la calle con la de las 17:00. No se congela nada porque nada guarda
 * la hora de cuando el jugador se fue.
 */
{
  const day = 1;
  const start = 10 * 60;
  const trip = destinationsFrom(getStop('vallesco')).find((d) => d.stop.id === 'decathlon')!.minutes;
  const back = start + trip + perform(getActivity('work-decathlon')).minutes + trip;
  assert.equal(back, 17 * 60, 'se vuelve a las 17:00');
  const clock = (m: number) => ({ day, hour: Math.floor(m / 60), minute: m % 60 });

  const sara = CHARACTERS[0];
  const before = whereabouts(sara, (day - 1) * 1440 + start);
  const after = whereabouts(sara, (day - 1) * 1440 + back);
  assert.notEqual(before.stop.point, after.stop.point, 'Sara sigue su día mientras el jugador trabaja');

  const shop = placeInfo('clothing-store')!;
  const shopLevel = (m: number) => levelAt(shop, profileFor('clothing-store')!, clock(m));
  assert.notEqual(shopLevel(start), shopLevel(back), 'la tienda tiene otra afluencia a las 17:00');
  const street = streetProfileFor('district')!;
  console.log(
    `trabajo: 10:00 → 17:00 · Sara ${before.stop.point} → ${after.stop.point} · ` +
      `tienda ${shopLevel(start)} → ${shopLevel(back)} · calle ${streetTargetAt(street, clock(start))} → ${streetTargetAt(street, clock(back))} personas`,
  );
}

// ------------------------------------------------------ partidas guardadas

{
  const store = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
  const save = new SaveSystem(storage);
  // Una partida de antes, sin bolsa ni tarjetas: carga con los bolsillos vacíos, no se pierde.
  const old = { money: 900, energy: 70, day: 3, hour: 12, minute: 5, locationId: 'district', position: { x: 10, y: 10 }, facing: 'down' };
  store.set(SAVE_KEY, JSON.stringify({ version: 1, savedAt: 0, state: old }));
  const loaded = save.load()!;
  assert.ok(loaded, 'una partida antigua tiene que cargar');
  assert.deepEqual([loaded.inventory, loaded.cards, loaded.money], [{}, {}, 900]);
  // Y lo que se compra, se guarda.
  save.save({ ...loaded, inventory: { water: 2 }, cards: { transport: 8.5 } });
  const again = save.load()!;
  assert.deepEqual([again.inventory, again.cards], [{ water: 2 }, { transport: 8.5 }]);
  // Una partida de antes del aspecto: carga con el de siempre.
  assert.deepEqual(loaded.appearance, {});
  // El corte se guarda y vuelve igual: el jugador y un personaje con nombre; un peinado que no existe se olvida.
  save.save({ ...again, appearance: { player: { hair: 'buzz' }, nati: { hair: 'bob' }, bruno: { hair: 'crest' as never } } });
  assert.deepEqual(save.load()!.appearance, { player: { hair: 'buzz' }, nati: { hair: 'bob' } });
}

// ------------------------------------------------------------ barbería

{
  // Cortarse el pelo: cobra el corte, cambia el peinado y no toca nada más.
  const wallet: Wallet = { money: 30, inventory: { water: 1 }, cards: { transport: 5 } };
  const cut = haircut(wallet, {}, 'short', 'buzz');
  assert.ok(cut.ok, cut.message);
  assert.deepEqual([cut.wallet.money, cut.wallet.inventory, cut.wallet.cards, cut.appearance], [20, { water: 1 }, { transport: 5 }, { hair: 'buzz' }]);
  assert.equal(wallet.money, 30, 'la cartera de antes no se toca: es pura');
  // Lo que ya lleva, lo que no se hace en una barbería y lo que no se puede pagar: no.
  assert.ok(!haircut(wallet, {}, 'short', 'short').ok, 'cortar lo mismo que ya lleva');
  assert.ok(!haircut(wallet, {}, 'short', 'long').ok, 'una melena no se corta');
  const broke = haircut(empty(5), {}, 'short', 'curly');
  assert.ok(!broke.ok && broke.wallet.money === 5 && broke.appearance.hair === undefined, 'sin dinero no hay corte');
  // El aspecto guardado va encima del de fábrica; sin cambios, sale el de siempre.
  assert.equal(withAppearance({ hairStyle: 'short' as const }, { hair: 'bun' }).hairStyle, 'bun');
  assert.equal(withAppearance({ hairStyle: 'short' as const }, undefined).hairStyle, 'short');
  // La barbería sólo tiene gente en su horario: cerrada, nadie; abierta, alguien.
  const salon = placeInfo('hair-salon');
  assert.equal(levelAt(salon, profileFor('hair-salon')!, { day: 1, hour: 22, minute: 0 }), null, 'la barbería abierta de noche');
  assert.notEqual(levelAt(salon, profileFor('hair-salon')!, { day: 1, hour: 18, minute: 0 }), null, 'la barbería cerrada por la tarde');
  assert.equal(levelAt(salon, profileFor('hair-salon')!, { day: 7, hour: 12, minute: 0 }), null, 'la barbería abierta en domingo');
}

// ------------------------------------------------------ tiendas de ropa

{
  // Una tienda cobra su precio, guarda la prenda en el armario y te la pone; la cartera de antes no se toca.
  const wallet: Wallet = { money: 100, inventory: { water: 1 }, cards: { transport: 5 } };
  const bought = buyGarment(wallet, [], {}, 'vuelta', 'camiseta-grafica');
  assert.ok(bought.ok, bought.message);
  assert.deepEqual([bought.wallet.money, bought.wallet.inventory, bought.wallet.cards], [94, { water: 1 }, { transport: 5 }]);
  assert.deepEqual([bought.wardrobe, bought.appearance], [['camiseta-grafica'], { top: 'camiseta-grafica' }]);
  assert.equal(wallet.money, 100, 'pura');
  // La misma prenda cuesta distinto según la tienda.
  const archivo = buyGarment(wallet, [], {}, 'archivo', 'camiseta-grafica');
  assert.equal(archivo.wallet.money, 70, 'precio de la tienda, no de la prenda');
  // Lo que ya tienes no se vuelve a vender (y la pieza única ya no está); lo que no hay, tampoco; sin dinero, no.
  assert.ok(!buyGarment(bought.wallet, bought.wardrobe, bought.appearance, 'archivo', 'camiseta-grafica').ok, 'dos veces la misma');
  const unique = buyGarment(empty(200), [], {}, 'retales', 'cazadora-ante');
  assert.ok(unique.ok && !buyGarment(unique.wallet, unique.wardrobe, unique.appearance, 'retales', 'cazadora-ante').ok, 'la pieza única se vende una vez');
  assert.ok(!buyGarment(wallet, [], {}, 'hilo', 'cargo-negro').ok, 'lo que la tienda no tiene');
  assert.ok(!buyGarment(empty(10), [], {}, 'archivo', 'anorak-neon').ok, 'sin dinero');
  // El escaparate sabe lo que es tuyo y lo que llevas puesto.
  const view = stockOf('vuelta', bought.wardrobe, bought.appearance).find((l) => l.garment === 'camiseta-grafica')!;
  assert.ok(view.owned && view.wearing);
  // Cambiarse: cada prenda en su hueco; quitársela vuelve a la ropa de siempre.
  const outfit = wear(wear({ hair: 'bob' }, 'cargo-negro'), 'jersey-rombos');
  assert.deepEqual(outfit, { hair: 'bob', bottom: 'cargo-negro', top: 'jersey-rombos' });
  assert.deepEqual(takeOff(outfit, 'top'), { hair: 'bob', bottom: 'cargo-negro' });
  for (const s of STORES) assert.ok(s.stock.length > 0 && s.stock.every((l) => l.price > 0), `${s.id}: género y precios`);
}

// ------------------------------------------------------------- tatuajes

{
  const base = { cloth: '#000000', clothDark: '#000000', hair: '#000000', skin: '#e3b692', trousers: '#000000', shoes: '#000000' };
  const done = tattoo(empty(200), {}, 'forearm-r', 'golondrina');
  assert.ok(done.ok, done.message);
  assert.deepEqual([done.wallet.money, done.appearance.tattoos], [110, [{ zone: 'forearm-r', design: 'golondrina' }]]);
  // Una zona, un tatuaje; un diseño que no cabe ahí, no; sin dinero, no.
  assert.ok(!tattoo(done.wallet, done.appearance, 'forearm-r', 'luna').ok, 'encima de otro');
  assert.ok(!tattoo(empty(500), {}, 'hand-r', 'rosa').ok, 'una rosa no cabe en la mano');
  assert.ok(!tattoo(empty(10), {}, 'neck', 'luna').ok, 'sin dinero');
  // Se ve según la ropa: con la manga larga de fábrica no; con manga corta, sí; el pecho, nunca.
  assert.equal(visibleTattoos(base, done.appearance).length, 0, 'manga larga lo tapa');
  const shortSleeve = { ...done.appearance, top: 'camisa-hawai' };
  assert.deepEqual(visibleTattoos(base, shortSleeve), [{ spot: 'arm-r', color: '#2f4a8c' }]);
  assert.equal(visibleTattoos(base, { tattoos: [{ zone: 'chest', design: 'rosa' }], top: 'camiseta-tirantes' }).length, 0, 'el pecho va bajo la ropa');
  assert.equal(visibleTattoos(base, { tattoos: [{ zone: 'neck', design: 'luna' }] }).length, 1, 'el cuello siempre se ve');
  // Lo que pinta HumanArt: la manga corta deja dos píxeles de manga y la tinta que se ve.
  const painted = withAppearance(base, shortSleeve);
  assert.deepEqual([painted.cloth, painted.sleeveLen, painted.ink?.length], ['#3f8c86', 2, 1]);
}

// ---------------------------------------------------- armario y partida

{
  const store = new Map<string, string>();
  const save = new SaveSystem({ read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) });
  const state = {
    money: 50, energy: 80, day: 2, hour: 11, minute: 0, locationId: 'district', position: { x: 10, y: 10 }, facing: 'down' as const,
    events: undefined as never, inventory: {}, cards: {},
    appearance: { player: { hair: 'bob' as const, top: 'camisa-hawai', bottom: 'vaquero-70', tattoos: [{ zone: 'forearm-r' as const, design: 'golondrina' }] } },
    wardrobe: ['camisa-hawai', 'vaquero-70'],
  };
  save.save(state);
  const loaded = save.load()!;
  assert.deepEqual([loaded.appearance, loaded.wardrobe], [state.appearance, state.wardrobe], 'ropa, armario y tatuajes vuelven igual');
  // Lo que ya no existe se olvida sin romper la carga; una prenda en el hueco equivocado, también.
  save.save({ ...state, wardrobe: ['camisa-hawai', 'capa-invisible'], appearance: { player: { top: 'vaquero-70', tattoos: [{ zone: 'forehead' as never, design: 'luna' }] } } });
  const odd = save.load()!;
  assert.deepEqual([odd.wardrobe, odd.appearance], [['camisa-hawai'], {}]);
}

// ------------------------------------- percheros, probador y varias tiendas

{
  // Cada tienda con tienda de verdad: su interior tiene percheros, cada uno con algo que enseñar.
  for (const s of STORES) {
    const places = LOCATIONS.filter((l) => l.racks?.some((r) => r.store === s.id));
    assert.equal(places.length, 1, `${s.id}: un interior con percheros`);
    const racks = places[0].racks!.filter((r) => r.store === s.id);
    const seen = new Set<string>();
    for (const r of racks) {
      const lines = stockOf(s.id, [], {}, r.categories);
      assert.ok(lines.length > 0, `${s.id}/${r.name}: perchero vacío`);
      assert.ok(lines.every((l) => l.def.slot && l.def.description && CATEGORIES[l.def.category].slot), `${s.id}: prenda sin ficha o sin dibujo`);
      assert.ok(Object.values(places[0].points ?? {}).some((p) => p.tx === r.tx && p.ty === r.ty), `${s.id}/${r.name}: de pie sobre un punto del suelo`);
      for (const l of lines) seen.add(l.garment);
    }
    assert.deepEqual([...seen].sort(), s.stock.map((l) => l.garment).sort(), `${s.id}: todo el género está en algún perchero`);
  }
  // No todas venden lo mismo, ni lo mismo a lo mismo.
  const stocks = STORES.map((s) => s.stock.map((l) => l.garment).sort().join());
  assert.equal(new Set(stocks).size, STORES.length, 'catálogos distintos');
  assert.ok(STORES.find((s) => s.id === 'vuelta')!.stock.some((l) => l.price <= 10) && STORES.find((s) => s.id === 'hilo')!.stock.some((l) => l.price >= 100), 'precios de cada estilo');

  // Probar: se guarda lo de antes, se ve la prenda y cancelar lo deja como estaba (lo que hace Menus.openGarment).
  const before: Appearance = { hair: 'bob', top: 'camisa-cuadros', shoes: 'bota-cuero' };
  const trying = wear(before, 'anorak-neon');
  assert.equal(trying.top, 'anorak-neon');
  const plain = { cloth: '#000', clothDark: '#000', hair: '#000', skin: '#fff', trousers: '#000', shoes: '#000' };
  assert.equal(withAppearance(plain, trying).cloth, '#c8d84a', 'se ve sobre el jugador');
  assert.deepEqual(before, { hair: 'bob', top: 'camisa-cuadros', shoes: 'bota-cuero' }, 'probar no toca el outfit guardado');

  // Comprar en el perchero: cobra una vez, entra en el armario y no cambia lo que llevas; equiparla es otra cosa.
  const first = buyGarment(empty(150), [], before, 'suela', 'zapatilla-blanca', false);
  assert.ok(first.ok, first.message);
  assert.deepEqual([first.wallet.money, first.wardrobe, first.appearance], [55, ['zapatilla-blanca'], before]);
  // Sin duplicar el cobro: repetir la compra se rechaza y la cartera no se mueve.
  const again = buyGarment(first.wallet, first.wardrobe, first.appearance, 'suela', 'zapatilla-blanca', false);
  assert.ok(!again.ok && again.wallet.money === 55 && again.wardrobe.length === 1, 'dos veces la misma');
  // Saldo insuficiente: no se cobra ni se guarda nada.
  const poor = buyGarment(empty(50), [], before, 'suela', 'zapatilla-edicion', false);
  assert.ok(!poor.ok && poor.wallet.money === 50 && poor.wardrobe.length === 0 && /No te llega/.test(poor.message), 'sin saldo');
  // Equipar luego (el armario): zapatilla en el hueco de los pies; quitarla vuelve al zapato de fábrica.
  const equipped = wear(first.appearance, 'zapatilla-blanca');
  assert.equal(equipped.shoes, 'zapatilla-blanca');
  assert.equal(takeOff(equipped, 'shoes').shoes, undefined);
  assert.equal(withAppearance(plain, equipped).shoes, '#e8e6e0');

  // Varias tiendas en la misma partida, y vuelven tras guardar y cargar.
  const store = new Map<string, string>();
  const save = new SaveSystem({ read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) });
  let wallet = empty(400);
  let wardrobe: readonly string[] = [];
  let look: Appearance = {};
  for (const [shop, garment] of [['hilo', 'blazer-entallado'], ['retales', 'vaquero-70'], ['suela', 'zapatilla-retro']] as const) {
    const r = buyGarment(wallet, wardrobe, look, shop, garment);
    assert.ok(r.ok, r.message);
    ({ wallet, wardrobe, appearance: look } = r);
  }
  assert.equal(wallet.money, 400 - 89 - 39 - 79);
  save.save({
    money: wallet.money, energy: 80, day: 1, hour: 9, minute: 0, locationId: 'district', position: { x: 1, y: 1 }, facing: 'down' as const,
    events: undefined as never, inventory: {}, cards: {}, appearance: { player: look }, wardrobe: [...wardrobe],
  });
  const back = save.load()!;
  assert.deepEqual([back.money, back.wardrobe, back.appearance.player], [193, ['blazer-entallado', 'vaquero-70', 'zapatilla-retro'], { top: 'blazer-entallado', bottom: 'vaquero-70', shoes: 'zapatilla-retro' }]);
}

console.log('\nOK: compras, céntimos, tarjeta y recargas, destinos, actividades, salto de tiempo, partidas, barbería, tiendas de ropa, percheros y probador, tatuajes y armario.');
