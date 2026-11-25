// CAS-06b · Anticuario Ventura (Casco Antiguo, data/cascoAntiguoVenues.ts): la puerta de cas-rastro-3 entra y vuelve, se
// llega a pie desde el metro, el mostrador vende lo corriente del Rastro (nada raro) y cobra lo justo, abre de lunes a
// sábado, la compra sobrevive a guardar y cargar, y las otras dos fachadas nuevas no tienen puerta. Sin Phaser.
import assert from 'node:assert/strict';
import { getCatalog } from '../src/data/catalogs.ts';
import { purchase, type Wallet } from '../src/systems/Commerce.ts';
import { getLocation, isWalkable, validate } from '../src/systems/LocationSystem.ts';
import { tilePath } from '../src/systems/Navigation.ts';
import { isOpen, placeForInterior } from '../src/systems/Places.ts';
import { createInitialState, restore, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import type { Clock } from '../src/systems/Crowd.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { activePopUp } from '../src/systems/PopUps.ts';
import { StreetLife, streetProfileFor } from '../src/systems/StreetLife.ts';
import { forceWeather } from '../src/systems/Weather.ts';

const ID = 'cas-anticuario';
const BUILDING = 'cas-rastro-3';
const street = getLocation('casco-antiguo');
const inside = getLocation(ID);
validate(inside);

// (a) Ida y vuelta: la puerta de cas-rastro-3 lleva dentro, y la salida devuelve delante de la fachada.
const door = street.buildings!.find((b) => b.id === BUILDING)!;
assert.equal(door.enter?.location, ID, 'cas-rastro-3 no entra en el anticuario');
const entry = inside.spawns[door.enter!.spawn];
assert.ok(entry && isWalkable(inside, entry.tx, entry.ty), 'la entrada del anticuario no es transitable');
const exit = inside.portals.find((p) => p.to.location === 'casco-antiguo');
assert.ok(exit && exit.to.spawn === BUILDING, 'el anticuario no devuelve a su fachada');
const back = street.spawns[BUILDING];
assert.ok(back && isWalkable(street, back.tx, back.ty), 'la vuelta a la calle no es transitable');

const station = getLocation('casco-antiguo-station');
const out = station.portals.find((p) => !p.train)!;
const walk = tilePath(street, street.spawns[out.to.spawn], back);
assert.ok(walk && walk.length > 3, 'del metro al anticuario no se llega andando');
const till = inside.points?.CASANT_TILL;
assert.ok(till, 'el anticuario no tiene caja');
assert.ok(tilePath(inside, entry, till), 'de la entrada a la caja no se llega andando');

// (b) El mostrador: los cuatro objetos corrientes del Rastro, ninguna rareza.
const CATALOG = 'cas-anticuario-mostrador';
assert.ok((inside.terminals ?? []).some((t) => t.catalog === CATALOG), 'el mostrador no vende su catálogo');
const catalog = getCatalog(CATALOG);
const RARE = new Set(['rastro-book-signed', 'rastro-vinyl-first', 'rastro-camera-slr', 'rastro-figure']);
assert.equal(catalog.products.length, 4, `${catalog.products.length} productos`);
for (const p of catalog.products) {
  assert.ok('item' in p.effect, `${p.id} no es un objeto`);
  assert.ok(p.effect.item.startsWith('rastro-'), `${p.id} no es del Rastro`);
  assert.ok(!RARE.has(p.effect.item), `${p.id} es una rareza`);
}

// (c) Horario (systems/Places.isOpen; el día 1 es lunes, el 7 domingo).
const place = placeForInterior(ID);
assert.ok(place, 'el anticuario no tiene lugar en data/places.ts');
assert.ok(isOpen(place, 2, 11, 0), 'cerrado el martes a las 11:00');
assert.ok(isOpen(place, 6, 12, 0), 'cerrado el sábado a las 12:00');
assert.ok(!isOpen(place, 7, 12, 0), 'abierto el domingo a las 12:00');
assert.ok(!isOpen(place, 2, 22, 0), 'abierto el martes a las 22:00');

// (d) Comprar: cobra el precio exacto y suma uno; sin saldo, el fallo de siempre y la cartera intacta.
const book = catalog.products[0];
const itemId = (book.effect as { item: string }).item;
const rich: Wallet = { money: 50, inventory: {}, cards: {} };
const bought = purchase(rich, book);
assert.ok(bought.ok, bought.message);
assert.ok(Math.abs(bought.wallet.money - (50 - book.price)) < 1e-6, 'cobra otra cosa');
assert.equal(bought.wallet.inventory[itemId], 1, 'no suma el objeto');
const broke: Wallet = { money: book.price - 0.01, inventory: {}, cards: {} };
const refused = purchase(broke, book);
assert.equal(refused.ok, false, 'se compra sin dinero');
assert.equal(refused.reason, 'money');
assert.deepEqual(refused.wallet, broke, 'la cartera cambia sin comprar');

// (e) Guardar después de comprar y cargar: el dinero y el objeto siguen ahí.
const store = new Map<string, string>();
const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
const save = new SaveSystem(storage);
assert.ok(save.save({ ...createInitialState(), money: bought.wallet.money, inventory: { ...bought.wallet.inventory } }), 'no se guarda');
const loaded = restore(save.load());
assert.ok(Math.abs(loaded.money - bought.wallet.money) < 1e-6, 'al cargar cambia el dinero');
assert.equal(loaded.inventory[itemId], 1, 'al cargar se pierde la compra');

// (f) Discos y Taller, sólo fachada; en el barrio, cinco puertas con interior (LOC-01: el Ultramarinos Mayor).
for (const id of ['cas-rastro-4', 'cas-rastro-6']) assert.equal(street.buildings!.find((b) => b.id === id)?.enter, undefined, `${id} lleva enter`);
const doors = street.buildings!.filter((b) => b.enter).length;
assert.equal(doors, 5, `${doors} puertas con interior`);

// (g) Un martes por la mañana no hay Rastro y la calle tiene gente.
assert.equal(activePopUp('casco-antiguo', { day: 2, hour: 11, minute: 0 }), undefined, 'el martes a las 11:00 hay pop-up');
forceWeather({ rain: 0, cloud: 0, celsius: 22, wet: 0 });
const STEP_MS = 100;
const MS_PER_MIN = 500;
const PLAYER = { tx: 10, ty: 15 };
const addMinutes = (c: Clock, m: number): Clock => {
  const total = c.hour * 60 + c.minute + m;
  return { day: c.day + Math.floor(total / 1440), hour: Math.floor((total % 1440) / 60), minute: total % 60 };
};
const life = new StreetLife(street, streetProfileFor('casco-antiguo')!, seededRng(7));
let clock: Clock = { day: 2, hour: 10, minute: 0 };
life.populate(clock, PLAYER);
const walkers: number[] = [];
let elapsed = 0;
for (let i = 0; i < Math.ceil((3 * 60 * MS_PER_MIN) / STEP_MS); i++) {
  life.update(STEP_MS, clock, PLAYER);
  elapsed += STEP_MS;
  if (elapsed >= MS_PER_MIN) {
    elapsed -= MS_PER_MIN;
    clock = addMinutes(clock, 1);
  }
  walkers.push(life.summary.walkers);
}
forceWeather(null);
const mean = walkers.reduce((n, x) => n + x, 0) / Math.max(1, walkers.length);
assert.ok(mean > 0, 'el martes de 10 a 13 no pasa nadie por el barrio');
assert.equal(life.pathFailures, 0, 'martes: rutas no encontradas');

console.log(`check-casco-anticuario: ok (${catalog.products.length} productos, puerta en x ${door.doorX}, ${doors} puertas) · paseantes martes 10–13 ${mean.toFixed(1)}`);
