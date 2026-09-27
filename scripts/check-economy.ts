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
}

console.log('\nOK: compras, céntimos, tarjeta y recargas, destinos, actividades, salto de tiempo y partidas.');
