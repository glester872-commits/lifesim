// Montón (moda a precio de montón) y Almacenes Velarde (hogar y regalos), CV-03: `npm run check`. Falla si algo no se
// cumple: surtido y precios, prendas que se dibujan, comprar una vez, ranuras de casa (elegir, ocupada, recolocar sin
// copias, rutas con cada colocación), regalos en el perfil social y partidas antiguas.
import assert from 'node:assert/strict';
import { STORES, getGarment, getStore } from '../src/data/retail.ts';
import { getCatalog } from '../src/data/catalogs.ts';
import { getItem } from '../src/data/items.ts';
import { HOMES, UPGRADES, getHome } from '../src/data/housing.ts';
import { LOCATIONS } from '../src/data/locations.ts';
import { buyGarment, wear } from '../src/systems/Retail.ts';
import { checkout, consume } from '../src/systems/Commerce.ts';
import { buy, buyBlocker, freeSlots, installAll, installedIn, layout, optionsOf, parseHousing, reaches, relocate, startHousing, storedIn, type HousingState } from '../src/systems/Housing.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { GIFTS, giftBlocker, giftsIn, giveGift } from '../src/systems/Gifts.ts';
import { createSocialProfile, parseSocialState, resolveSocialAction } from '../src/systems/Social.ts';
import { placeInfo } from '../src/systems/Places.ts';

const wallet = (money: number, inventory: Record<string, number> = {}) => ({ money, inventory, cards: {} });

// ------------------------------------------------------------- Montón

const monton = getStore('monton');
assert.ok(monton.stock.length >= 6, 'Montón: al menos seis prendas');
for (const line of monton.stock) assert.ok(['top', 'bottom', 'shoes'].includes(getGarment(line.garment).slot), `${line.garment}: no se dibuja`);
// La ropa nueva más barata de la ciudad: su media por debajo de la de cualquier otra tienda (menos Segunda Vuelta, que
// es de segunda mano y al peso).
const avg = (id: string): number => getStore(id).stock.reduce((s, l) => s + l.price, 0) / getStore(id).stock.length;
for (const s of STORES) if (s.id !== 'monton' && s.id !== 'vuelta') assert.ok(avg('monton') < avg(s.id), `Montón no es más barata que ${s.name}`);
// Se entra desde la calle y sus percheros venden lo suyo.
const montonRoom = LOCATIONS.find((l) => l.id === 'pc-monton')!;
assert.ok(montonRoom.racks?.length && montonRoom.racks.every((r) => r.store === 'monton'), 'Montón sin percheros propios');
assert.ok(getLocation('puerta-central').portals.some((p) => p.to.location === 'pc-monton'), 'Montón sin puerta en la plaza');
assert.ok(placeInfo('pc-monton')?.interior === 'pc-monton', 'Montón sin horario');

// Comprar concede propiedad una vez; vestir no cobra; lo de antes vuelve al armario.
const first = buyGarment(wallet(20), [], {}, 'monton', 'camiseta-raya', false);
assert.ok(first.ok && first.wallet.money === 16 && first.wardrobe.includes('camiseta-raya') && !first.appearance.top, 'comprar en el perchero: cobra, guarda, no viste');
const again = buyGarment(first.wallet, first.wardrobe, first.appearance, 'monton', 'camiseta-raya');
assert.ok(!again.ok && again.wallet.money === 16 && again.wardrobe.length === 1, 'la misma prenda se cobra dos veces');
const poor = buyGarment(wallet(18.99), [], {}, 'monton', 'plumifero-rojo');
assert.ok(!poor.ok && poor.wallet.money === 18.99, 'saldo insuficiente cobra');
assert.equal(wear({ top: 'camiseta-raya' }, 'sudadera-lila').top, 'sudadera-lila', 'vestir ocupa su hueco');
// Una pieza única ya comprada no se vende más.
const unique = STORES.flatMap((s) => s.stock.map((l) => ({ store: s.id, garment: l.garment }))).find((x) => getGarment(x.garment).unique)!;
const owned = buyGarment(wallet(500), [], {}, unique.store, unique.garment);
assert.ok(owned.ok && !buyGarment(owned.wallet, owned.wardrobe, owned.appearance, unique.store, unique.garment).ok, 'pieza única vendida dos veces');

// ------------------------------------------------------------- Velarde

const velardeRoom = LOCATIONS.find((l) => l.id === 'pc-velarde')!;
assert.ok(getLocation('puerta-central').portals.some((p) => p.to.location === 'pc-velarde'), 'Velarde sin puerta en la plaza');
assert.ok(velardeRoom.spots?.some((s) => s.housing === 'velarde'), 'Velarde sin departamento de hogar');
const regalos = getCatalog('velarde-regalos');
assert.ok(velardeRoom.terminals?.some((t) => t.catalog === 'velarde-regalos') && regalos.checkout, 'Velarde sin caja de regalos');
const hogar = UPGRADES.filter((u) => u.sold?.includes('velarde'));
assert.ok(hogar.length >= 2 && hogar.length + regalos.products.length >= 4, 'Velarde: al menos cuatro productos con uso');
for (const p of regalos.products) assert.ok('item' in p.effect && p.effect.item in GIFTS && getItem(p.effect.item).kind === 'gift', `${p.id}: regalo sin efecto`);
assert.ok(!consume(wallet(0, { 'gift-chocolates': 1 }), 'gift-chocolates').ok, 'un regalo se come');

// Ranuras: la planta va donde se elija, de sus ranuras libres. Con la lámpara en la esquina, sólo queda el rincón.
const at = (home: string, own: string[], slots?: Record<string, string>): HousingState => ({ home, owned: own, ...(slots ? { slots } : {}) });
let h = at('olmo7', ['lampara-pie']);
assert.deepEqual(freeSlots(h, 'monstera').map((p) => p.slot), ['salon-lectura'], 'la esquina está ocupada por la lámpara');
assert.match(buyBlocker(h, 'monstera', 100, 'esquina-salon')!, /ya la ocupa lámpara de pie/, 'ranura ocupada');
assert.ok(!buy(h, 'monstera', 100, 'esquina-salon').ok, 'compra en una ranura ocupada');
const bought = buy(h, 'monstera', 100, 'salon-lectura');
assert.ok(bought.ok && bought.money === 61 && bought.housing.slots?.monstera === 'salon-lectura', 'comprar la planta en el rincón');
h = bought.housing;
assert.ok(!buy(h, 'monstera', 100).ok, 'la planta se compra dos veces');
// Con el sofá en el rincón y la lámpara en la esquina, no queda sitio: se dice y no se cobra.
assert.match(buyBlocker(at('olmo7', ['lampara-pie', 'sofa-lectura']), 'monstera', 100)!, /No queda sitio/);
// Recolocar mueve, no duplica; a una ranura ocupada, no.
const lone = at('olmo7', ['monstera'], { monstera: 'salon-lectura' });
const moved = relocate(lone, 'monstera', 'esquina-salon');
assert.ok(moved.ok && moved.housing.owned.length === 1 && layout(moved.housing).get('esquina-salon')?.id === 'monstera' && !layout(moved.housing).has('salon-lectura'), 'recolocar duplica o no mueve');
assert.ok(!relocate(h, 'monstera', 'esquina-salon').ok, 'recolocar encima de la lámpara');
// La lámpara (una sola ranura) con la planta en la esquina: no cabe y no cobra.
assert.ok(!buy(moved.housing, 'lampara-pie', 100).ok, 'la lámpara entra en una esquina ocupada');

// Cada colocación de la planta, en cada casa, deja llegar a lo esencial.
for (const home of HOMES) {
  for (const p of optionsOf(UPGRADES.find((u) => u.id === 'monstera')!, home.id)) {
    installAll(at(home.id, ['monstera'], { monstera: p.slot }));
    const loc = getLocation(home.location);
    assert.ok(loc.props.some((q) => p.props.some((r) => r.kind === q.kind && r.tx === q.tx && r.ty === q.ty)), `${home.id}/${p.slot}: la planta no está`);
    const from = loc.spawns.entry;
    for (const [pid, pt] of Object.entries(loc.points ?? {})) if (/_(EXIT|BED|KITCHEN|WARDROBE|SHOWER|SOFA_02|GUEST)$/.test(pid)) assert.ok(reaches(loc, from, pt), `${home.id}/${p.slot}: no se llega a ${pid}`);
    for (const s of loc.spots ?? []) assert.ok(reaches(loc, from, s), `${home.id}/${p.slot}: no se llega a ${s.name}`);
  }
}
installAll(startHousing());

// Partida antigua: sin ranuras elegidas, todo sigue donde estaba; las elegidas se guardan y se leen.
const old = parseHousing({ home: 'olmo7', owned: ['lampara-pie', 'cuadro-carmen'] });
assert.deepEqual(old, { home: 'olmo7', owned: ['lampara-pie', 'cuadro-carmen'] }, 'una partida antigua cambia al cargar');
assert.deepEqual(installedIn(old), ['lampara-pie', 'cuadro-carmen']);
assert.deepEqual(parseHousing(JSON.parse(JSON.stringify(h))), h, 'la ranura elegida no vuelve al cargar');
assert.deepEqual(parseHousing({ home: 'olmo7', owned: ['monstera'], slots: { monstera: 'salon-lectura', nada: 'x', sofa: 3 } }).slots, { monstera: 'salon-lectura' }, 'ranuras basura al cargar');
// Mudarse al estudio: la planta cabe (en una de sus ranuras), no va al trastero.
assert.deepEqual(storedIn({ ...h, home: 'estudio' }), [], 'la planta no cabe en el estudio');

// ------------------------------------------------------------- regalos

const regalo = checkout(wallet(50), regalos, 'gift-chocolates', 2);
assert.ok(regalo.ok && regalo.wallet.inventory['gift-chocolates'] === 2 && regalo.wallet.money === 22, 'comprar dos cajas de bombones');
assert.deepEqual(giftsIn(regalo.wallet), [{ id: 'gift-chocolates', qty: 2 }]);
assert.match(giftBlocker(createSocialProfile(), 3)!, /no os conocéis/, 'se regala a un desconocido');
const friend = { ...createSocialProfile(), encounters: 2 };
const moment = { day: 3, hour: 18, minute: 0 };
const given = giveGift(friend, regalo.wallet, 'gift-chocolates', moment);
assert.ok(given.ok && given.wallet.inventory['gift-chocolates'] === 1, 'regalar no gasta una caja');
assert.ok(given.profile.friendship === friend.friendship + GIFTS['gift-chocolates'].friendship && given.profile.mood > friend.mood, 'regalar no sube la amistad ni el ánimo');
assert.ok(given.profile.memories.some((m) => m.day === 3 && m.note === 'regalo: caja de bombones'), 'el regalo no se recuerda');
const twice = giveGift(given.profile, given.wallet, 'gift-chocolates', moment);
assert.ok(!twice.ok && twice.wallet === given.wallet && twice.profile === given.profile, 'dos regalos el mismo día: suma o gasta');
assert.ok(giveGift(given.profile, given.wallet, 'gift-chocolates', { ...moment, day: 4 }).ok, 'al día siguiente se puede');
assert.ok(!giveGift(friend, wallet(0), 'gift-cologne', moment).ok, 'regalar algo que no llevas');
// AUD-006 (CV-08): el límite es por persona y día, y no se pierde con 40 charlas más ese día ni al guardar y cargar.
{
  let talked = given.profile;
  for (let i = 0; i < 40; i++) talked = resolveSocialAction(talked, 'compliment', { day: 3, hour: 19, minute: i, place: 'street', act: 'idle', mood: 'neutral' } as never, () => 0.01).profile;
  assert.ok(!talked.memories.some((m) => m.note === 'regalo: caja de bombones'), 'la prueba necesita que el recuerdo del regalo se haya perdido');
  const again = giveGift(talked, given.wallet, 'gift-chocolates', { ...moment, hour: 20 });
  assert.ok(!again.ok && again.wallet === given.wallet && again.wallet.inventory['gift-chocolates'] === 1, 'tras 40 charlas el mismo día se regala otra vez o se pierde la caja');
  const reloaded = parseSocialState(JSON.parse(JSON.stringify({ sara: talked }))).sara;
  assert.equal(reloaded.giftDay, 3, 'guardar y cargar olvida el día del regalo');
  assert.ok(!giveGift(reloaded, given.wallet, 'gift-chocolates', moment).ok, 'recargar deja regalar otra vez el mismo día');
  assert.ok(giveGift(reloaded, given.wallet, 'gift-chocolates', { ...moment, day: 4 }).ok, 'al día siguiente, tras cargar, no se puede');
  assert.ok(giveGift({ ...friend, encounters: 2 }, given.wallet, 'gift-chocolates', moment).ok, 'el límite de una persona bloquea a otra');
  assert.equal(parseSocialState({ ana: { ...createSocialProfile(), giftDay: 'ayer' } }).ana.giftDay, undefined, 'un día de regalo inválido entra al cargar');
}

console.log(`OK: Montón (${monton.stock.length} prendas, media €${avg('monton').toFixed(2)}, la más barata), Velarde (${hogar.length} de hogar + ${regalos.products.length} regalos), ranuras elegidas/ocupadas/recolocadas sin copias en ${HOMES.map((x) => getHome(x.id).name).join(' y ')}, regalos una vez al día y partida antigua intacta.`);
