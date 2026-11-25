// CA-03 · Taller Biciclo (Campo Alto, data/campoAltoVenues.ts): la puerta de ca-taller entra y vuelve, se llega a pie
// desde el metro, el mostrador vende agua, algo de comer, dos accesorios de regalo y una bici (VID-01: se vende como
// artículo y todavía no se puede montar; nada de reparar), cobra lo
// justo, abre de lunes a sábado, la compra sobrevive a guardar y cargar, y tiene gente que atiende. Sin Phaser.
import assert from 'node:assert/strict';
import { getCatalog } from '../src/data/catalogs.ts';
import { ITEMS } from '../src/data/items.ts';
import { POPULATION_PROFILES } from '../src/data/population.ts';
import { purchase, type Wallet } from '../src/systems/Commerce.ts';
import { GIFTS } from '../src/systems/Gifts.ts';
import { getLocation, isWalkable, validate } from '../src/systems/LocationSystem.ts';
import { tilePath } from '../src/systems/Navigation.ts';
import { isOpen, placeForInterior } from '../src/systems/Places.ts';
import { createInitialState, restore, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';

const ID = 'ca-taller';
const street = getLocation('campo-alto');
const inside = getLocation(ID);
validate(inside);

// (a) Ida y vuelta: la puerta de ca-taller lleva dentro, y la salida devuelve delante de la fachada.
const door = street.buildings!.find((b) => b.id === ID)!;
assert.ok(door, 'no hay fachada ca-taller');
assert.equal(door.enter?.location, ID, 'ca-taller no entra en el taller');
const entry = inside.spawns[door.enter!.spawn];
assert.ok(entry && isWalkable(inside, entry.tx, entry.ty), 'la entrada del taller no es transitable');
const exit = inside.portals.find((p) => p.to.location === 'campo-alto');
assert.ok(exit && exit.to.spawn === ID, 'el taller no devuelve a su fachada');
const back = street.spawns[ID];
assert.ok(back && isWalkable(street, back.tx, back.ty), 'la vuelta a la calle no es transitable');

// (b) Del metro a la puerta, y de la entrada a la caja.
const station = getLocation('campo-alto-station');
const out = station.portals.find((p) => !p.train)!;
const walk = tilePath(street, street.spawns[out.to.spawn], back);
assert.ok(walk && walk.length > 3, 'del metro al taller no se llega andando');
const till = inside.points?.CATALLER_TILL;
assert.ok(till, 'el taller no tiene caja');
assert.ok(tilePath(inside, entry, till), 'de la entrada a la caja no se llega andando');

// (c) El mostrador: seis productos que existen, sólo venta; los accesorios son regalos con efecto. La bici (VID-01) se
// vende como artículo, una sola en la bolsa, y todavía no se puede montar.
const CATALOG = 'ca-taller-mostrador';
assert.ok((inside.terminals ?? []).some((t) => t.catalog === CATALOG), 'el mostrador no vende su catálogo');
const catalog = getCatalog(CATALOG);
assert.equal(catalog.products.length, 6, `${catalog.products.length} productos`);
const bikeProduct = catalog.products.find((p) => 'item' in p.effect && p.effect.item === 'bike');
assert.ok(bikeProduct, 'el taller no vende la bici');
assert.equal(bikeProduct.price, 180, `la bici cuesta ${bikeProduct.price}`);
assert.equal(ITEMS.find((i) => i.id === 'bike')?.max, 1, 'la bici no lleva max 1');
const itemIds = new Set(ITEMS.map((i) => i.id));
for (const p of catalog.products) {
  assert.ok('item' in p.effect, `${p.id} no es un objeto`);
  const it = p.effect.item;
  assert.ok(itemIds.has(it), `${it} no existe en ITEMS`);
  for (const s of [p.id, p.label, it]) {
    assert.ok(!/repar/i.test(s), `${s} ofrece reparar`);
    assert.ok(it === 'bike' || it.startsWith('gift-bike-') || !/bici|bike/i.test(s), `${s} es una bicicleta`);
  }
  if (it.startsWith('gift-')) assert.ok(GIFTS[it], `${it} no está en GIFTS`);
}
assert.ok(catalog.products.some((p) => p.id === 'gift-bike-bell') && catalog.products.some((p) => p.id === 'gift-bike-light'), 'faltan el timbre o la luz');

// (d) Horario (systems/Places.isOpen; el día 1 es lunes, el 7 domingo).
const place = placeForInterior(ID);
assert.ok(place, 'el taller no tiene lugar en data/places.ts');
assert.ok(isOpen(place, 1, 11, 0), 'cerrado el lunes a las 11:00');
assert.ok(isOpen(place, 6, 12, 0), 'cerrado el sábado a las 12:00');
assert.ok(!isOpen(place, 7, 12, 0), 'abierto el domingo a las 12:00');
assert.ok(!isOpen(place, 2, 22, 0), 'abierto el martes a las 22:00');

// (e) Comprar: cobra el precio exacto y suma uno; sin saldo, el fallo de siempre y la cartera intacta.
const light = catalog.products.find((p) => p.id === 'gift-bike-light')!;
const itemId = (light.effect as { item: string }).item;
const rich: Wallet = { money: 50, inventory: {}, cards: {} };
const bought = purchase(rich, light);
assert.ok(bought.ok, bought.message);
assert.ok(Math.abs(bought.wallet.money - (50 - light.price)) < 1e-6, 'cobra otra cosa');
assert.equal(bought.wallet.inventory[itemId], 1, 'no suma el objeto');
const broke: Wallet = { money: light.price - 0.01, inventory: {}, cards: {} };
const refused = purchase(broke, light);
assert.equal(refused.ok, false, 'se compra sin dinero');
assert.equal(refused.reason, 'money');
assert.deepEqual(refused.wallet, broke, 'la cartera cambia sin comprar');

// (f) Guardar después de comprar y cargar: el dinero y el objeto siguen ahí.
const store = new Map<string, string>();
const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
const save = new SaveSystem(storage);
assert.ok(save.save({ ...createInitialState(), money: bought.wallet.money, inventory: { ...bought.wallet.inventory } }), 'no se guarda');
const loaded = restore(save.load());
assert.ok(Math.abs(loaded.money - bought.wallet.money) < 1e-6, 'al cargar cambia el dinero');
assert.equal(loaded.inventory[itemId], 1, 'al cargar se pierde la compra');

// (g) La pizarra avisa de que aún no se repara, y nada del interior lo ofrece.
const board = (inside.inspects ?? []).find((i) => i.name === 'Pizarra del taller');
assert.ok(board && board.lines.join(' ').includes('todavía no'), 'la pizarra no dice «todavía no»');
for (const t of inside.terminals ?? []) assert.ok(!/repar/i.test(`${t.name} ${t.catalog}`), `${t.name} ofrece reparar`);
for (const i of inside.inspects ?? []) {
  if (i === board) continue;
  assert.ok(!/repar/i.test(`${i.name} ${i.lines.join(' ')}`), `${i.name} ofrece reparar`);
}

// (h) En el barrio, puertas con interior.
// CA-04: café, taller, panadería y metro.
const doors = street.buildings!.filter((b) => b.enter).length;
assert.equal(doors, 5,`${doors} puertas con interior`);

// (i) Alguien atiende y alguien compra.
assert.ok(POPULATION_PROFILES.some((p) => p.place === ID), 'el taller no tiene perfil de población');

console.log(`check-campo-alto-taller: ok (${catalog.products.length} productos, puerta en x ${door.doorX}, ${doors} puertas)`);
