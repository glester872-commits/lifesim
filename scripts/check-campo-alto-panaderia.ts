// CA-04 · Panadería Cuatro Hornos (Campo Alto, data/campoAltoVenues.ts): la puerta de ca-panaderia entra y vuelve, se
// llega a pie desde el metro y desde los otros locales, el mostrador vende pan y bollería algo más barato que el café,
// abre por la mañana (el domingo, de 8 a 13), cobra lo justo, la compra sobrevive a guardar y cargar, tiene quien
// atienda y la calle manda vecinos a por el pan. Sin Phaser.
import assert from 'node:assert/strict';
import { getCatalog } from '../src/data/catalogs.ts';
import { ITEMS } from '../src/data/items.ts';
import { POPULATION_PROFILES } from '../src/data/population.ts';
import { STREET_PROFILES } from '../src/data/streets.ts';
import { purchase, type Wallet } from '../src/systems/Commerce.ts';
import { getLocation, isWalkable, validate } from '../src/systems/LocationSystem.ts';
import { tilePath } from '../src/systems/Navigation.ts';
import { isOpen, placeForInterior } from '../src/systems/Places.ts';
import { createInitialState, restore, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';

const ID = 'ca-panaderia';
const BUILDING = 'ca-panaderia';
const street = getLocation('campo-alto');
const inside = getLocation(ID);
validate(inside);

// (a) Ida y vuelta: la puerta entra en la panadería y la salida devuelve delante de la fachada.
const door = street.buildings!.find((b) => b.id === BUILDING)!;
assert.ok(door, 'no hay fachada ca-panaderia');
assert.equal(door.enter?.location, ID, 'ca-panaderia no entra en la panadería');
const entry = inside.spawns[door.enter!.spawn];
assert.ok(entry && isWalkable(inside, entry.tx, entry.ty), 'la entrada de la panadería no es transitable');
const exit = inside.portals.find((p) => p.to.location === 'campo-alto');
assert.ok(exit && exit.to.spawn === BUILDING, 'la panadería no devuelve a su fachada');
const back = street.spawns[BUILDING];
assert.ok(back && isWalkable(street, back.tx, back.ty), 'la vuelta a la calle no es transitable');

// (b) Del metro a la puerta, de la entrada a la caja, desde el taller y el café, y hasta la pista del parque.
const station = getLocation('campo-alto-station');
const out = station.portals.find((p) => !p.train)!;
assert.ok(tilePath(street, street.spawns[out.to.spawn], back)?.length, 'del metro a la panadería no se llega andando');
const till = inside.points?.CAPAN_TILL;
assert.ok(till, 'la panadería no tiene caja');
assert.ok(tilePath(inside, entry, till), 'de la entrada a la caja no se llega andando');
for (const from of ['ca-taller', 'ca-cafe']) {
  const s = street.spawns[from];
  assert.ok(s, `no hay spawn ${from}`);
  assert.ok(tilePath(street, s, back), `de ${from} a la panadería no se llega andando`);
}
const pitch = street.points?.CA_FUTSAL_WAIT_01;
assert.ok(pitch && tilePath(street, back, pitch), 'de la panadería a la pista no se llega andando');

// (c) El mostrador: seis productos que existen, cada uno no más caro que en la barra del café.
const CATALOG = 'ca-panaderia-mostrador';
assert.ok((inside.terminals ?? []).some((t) => t.catalog === CATALOG), 'el mostrador no vende su catálogo');
const catalog = getCatalog(CATALOG);
assert.equal(catalog.products.length, 6, `${catalog.products.length} productos`);
const itemIds = new Set(ITEMS.map((i) => i.id));
const cafe = getCatalog('cafe-counter');
const itemOf = (p: { effect: object }): string | undefined => ('item' in p.effect ? (p.effect as { item: string }).item : undefined);
for (const p of catalog.products) {
  const it = itemOf(p);
  assert.ok(it && itemIds.has(it), `${p.id} no es un objeto de ITEMS`);
  const ref = cafe.products.find((c) => itemOf(c) === it);
  assert.ok(ref, `${it} no está en la barra del café`);
  assert.ok(p.price <= ref.price, `${it} cuesta más que en el café (${p.price} > ${ref.price})`);
}

// (d) Horario (systems/Places.isOpen; el día 1 es lunes, el 7 domingo).
const place = placeForInterior(ID);
assert.ok(place, 'la panadería no tiene lugar en data/places.ts');
assert.ok(isOpen(place, 1, 7, 0), 'cerrada el lunes a las 7:00');
assert.ok(isOpen(place, 1, 8, 0), 'cerrada el lunes a las 8:00');
assert.ok(!isOpen(place, 1, 15, 0), 'abierta el lunes a las 15:00');
assert.ok(isOpen(place, 6, 13, 30), 'cerrada el sábado a las 13:30');
assert.ok(isOpen(place, 7, 8, 30), 'cerrada el domingo a las 8:30');
assert.ok(!isOpen(place, 7, 13, 30), 'abierta el domingo a las 13:30');
const cafePlace = placeForInterior('ca-cafe');
const tallerPlace = placeForInterior('ca-taller');
assert.ok(cafePlace && tallerPlace, 'faltan el café o el taller en data/places.ts');
assert.ok(isOpen(cafePlace, 1, 20, 0) && !isOpen(place, 1, 20, 0), 'el lunes a las 20:00 la panadería no se distingue del café');
assert.ok(!isOpen(tallerPlace, 7, 12, 0) && isOpen(place, 7, 12, 0), 'el domingo a las 12:00 la panadería no se distingue del taller');

// (e) Comprar una barra: cobra el precio exacto y suma uno; sin saldo, el fallo de siempre y la cartera intacta.
const bread = catalog.products.find((p) => itemOf(p) === 'bread')!;
assert.ok(bread, 'no se vende pan');
const rich: Wallet = { money: 20, inventory: {}, cards: {} };
const bought = purchase(rich, bread);
assert.ok(bought.ok, bought.message);
assert.ok(Math.abs(bought.wallet.money - (20 - bread.price)) < 1e-6, 'cobra otra cosa');
assert.equal(bought.wallet.inventory.bread, 1, 'no suma la barra');
const broke: Wallet = { money: bread.price - 0.01, inventory: {}, cards: {} };
const refused = purchase(broke, bread);
assert.equal(refused.ok, false, 'se compra sin dinero');
assert.equal(refused.reason, 'money');
assert.deepEqual(refused.wallet, broke, 'la cartera cambia sin comprar');

// (f) Guardar después de comprar y cargar: el dinero y la barra siguen ahí.
const store = new Map<string, string>();
const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
const save = new SaveSystem(storage);
assert.ok(save.save({ ...createInitialState(), money: bought.wallet.money, inventory: { ...bought.wallet.inventory } }), 'no se guarda');
const loaded = restore(save.load());
assert.ok(Math.abs(loaded.money - bought.wallet.money) < 1e-6, 'al cargar cambia el dinero');
assert.equal(loaded.inventory.bread, 1, 'al cargar se pierde la barra');

// (g) Alguien atiende y alguien compra.
const profile = POPULATION_PROFILES.find((p) => p.place === ID);
assert.ok(profile, 'la panadería no tiene perfil de población');
assert.ok(profile.staff && profile.staff.length > 0, 'nadie atiende la panadería');

// (h) En el barrio, cuatro puertas con interior: café, taller, panadería y metro.
const doors = street.buildings!.filter((b) => b.enter).length;
assert.equal(doors, 4, `${doors} puertas con interior`);

// (i) La calle manda vecinos a por el pan y, el fin de semana, familias hacia el parque.
const life = STREET_PROFILES.find((p) => p.location === 'campo-alto');
assert.ok(life, 'campo-alto no tiene perfil de calle');
const errands = life.trips.find((t) => t.role === 'errands');
assert.ok(errands?.to.points?.includes('CA_PANADERIA_ENTRANCE'), 'nadie va a por el pan');
const family = life.trips.find((t) => t.role === 'park-family');
assert.ok(family?.rhythms?.includes('saturday-day') && family.rhythms.includes('sunday-day'), 'la familia del parque no sale el fin de semana');

console.log(`check-campo-alto-panaderia: ok (${catalog.products.length} productos, puerta en x ${door.doorX}, ${doors} puertas)`);
