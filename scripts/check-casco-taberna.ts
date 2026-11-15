// CAS-06 · Taberna La Lonja (Casco Antiguo, data/cascoAntiguoVenues.ts): la puerta de cas-cafe entra y vuelve, se llega
// a pie desde el metro, la barra vende tapas con efecto y cobra lo justo, abre según su horario (el domingo, después del
// Rastro) y una partida guardada dentro sigue dentro. Fase B: la terraza de la plaza (asientos con servicio, nadie con
// dos dueños) y la Sobremesa del Rastro del domingo (más gente, suspendida con lluvia, compatible con el Rastro). Sin Phaser.
import assert from 'node:assert/strict';
import { TILE } from '../src/config/constants.ts';
import { getCatalog } from '../src/data/catalogs.ts';
import { getItem } from '../src/data/items.ts';
import { purchase, type Wallet } from '../src/systems/Commerce.ts';
import { getLocation, isStandable, isWalkable, validate } from '../src/systems/LocationSystem.ts';
import { tilePath } from '../src/systems/Navigation.ts';
import { isOpen, placeForInterior } from '../src/systems/Places.ts';
import { createInitialState, restore, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import type { Clock } from '../src/systems/Crowd.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { activePopUp, weekPlan } from '../src/systems/PopUps.ts';
import { StreetLife, streetProfileFor } from '../src/systems/StreetLife.ts';
import { forceWeather } from '../src/systems/Weather.ts';

const ID = 'cas-taberna';
const street = getLocation('casco-antiguo');
const inside = getLocation(ID);
validate(inside);

// Ida y vuelta: la puerta de cas-cafe lleva dentro, y la salida devuelve delante de la fachada.
const door = street.buildings!.find((b) => b.id === 'cas-cafe')!;
assert.equal(door.enter?.location, ID, 'cas-cafe no entra en la taberna');
assert.ok(door.doorX! < 17 || door.doorX! > 23, 'la puerta cae en el Pasaje o en la ruta de limpieza');
const entry = inside.spawns[door.enter!.spawn];
assert.ok(entry && isWalkable(inside, entry.tx, entry.ty), 'la entrada de la taberna no es transitable');
const exit = inside.portals.find((p) => p.to.location === 'casco-antiguo');
assert.ok(exit && exit.to.spawn === 'cas-cafe', 'la taberna no devuelve a su fachada');
const back = street.spawns['cas-cafe'];
assert.ok(back && isWalkable(street, back.tx, back.ty), 'la vuelta a la calle no es transitable');

// A pie desde la salida del metro hasta la puerta.
const station = getLocation('casco-antiguo-station');
const out = station.portals.find((p) => !p.train)!;
const walk = tilePath(street, street.spawns[out.to.spawn], back);
assert.ok(walk && walk.length > 3, 'del metro a la taberna no se llega andando');

// La carta: 3-5 tapas y bebidas, cada una un objeto de verdad que se come o se bebe.
const terminal = (inside.terminals ?? []).find((t) => t.catalog === 'cas-taberna-tapas');
assert.ok(terminal, 'la barra no vende la carta');
const catalog = getCatalog('cas-taberna-tapas');
assert.ok(catalog.products.length >= 3 && catalog.products.length <= 5, `${catalog.products.length} productos`);
for (const p of catalog.products) {
  assert.ok('item' in p.effect, `${p.id} no es un objeto`);
  const it = getItem(p.effect.item);
  assert.ok((it.kind === 'food' || it.kind === 'drink') && (it.energy ?? 0) > 0, `${p.id} sin efecto`);
  assert.ok(p.price >= 1.5 && p.price <= 6, `${p.id}: ${p.price} € no es precio de bar`);
}

// Comprar: cobra el precio exacto; sin saldo, el fallo de siempre y la cartera intacta.
const tapa = catalog.products[0];
const rich: Wallet = { money: 20, inventory: {}, cards: {} };
const bought = purchase(rich, tapa);
assert.ok(bought.ok, bought.message);
assert.ok(Math.abs(bought.wallet.money - (20 - tapa.price)) < 1e-6, 'cobra otra cosa');
const broke: Wallet = { money: tapa.price - 0.01, inventory: {}, cards: {} };
const refused = purchase(broke, tapa);
assert.equal(refused.ok, false, 'se compra sin dinero');
assert.equal(refused.reason, 'money');
assert.deepEqual(refused.wallet, broke, 'la cartera cambia sin comprar');

// Horario (systems/Places.isOpen; el día 1 es lunes, el 7 domingo).
const place = placeForInterior(ID);
assert.ok(place, 'la taberna no tiene lugar en data/places.ts');
assert.ok(isOpen(place, 7, 16, 0), 'cerrada el domingo a las 16:00');
assert.ok(isOpen(place, 3, 12, 30), 'cerrada un laborable a las 12:30');
assert.ok(!isOpen(place, 3, 3, 0), 'abierta a las 03:00');
assert.ok(!isOpen(place, 7, 11, 0), 'abierta el domingo a las 11:00, en pleno Rastro');

// Guardar con el jugador dentro y cargar: sigue en la taberna, en el mismo sitio.
const store = new Map<string, string>();
const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
const save = new SaveSystem(storage);
const position = { x: entry.tx * TILE + TILE / 2, y: entry.ty * TILE + TILE };
assert.ok(save.save({ ...createInitialState(), locationId: ID, position, facing: 'up' }), 'no se guarda');
const loaded = restore(save.load());
assert.equal(loaded.locationId, ID, 'al cargar ya no está en la taberna');
assert.deepEqual(loaded.position, position, 'al cargar se ha movido');

// ------------------------------------------------ CAS-06 fase B: la terraza de La Lonja y la Sobremesa del Rastro
const TERRACE = 'CAS_TABERNA_TERRACE_';
const points = street.points ?? {};
const tables = street.tables ?? [];
const seatIds = tables.flatMap((t) => t.seats);
const waiter = points[`${TERRACE}WAITER`];
assert.ok(waiter && seatIds.length === 2 && seatIds.every((s) => s.startsWith(TERRACE)), 'la terraza no tiene sus dos mesas y su camarero');

// (a) Asientos, camarero y sitios de servicio: se pisan, y quedan fuera de las anclas del Rastro (±1), de las columnas de
// la limpieza (19–23) y de la calle con sus aceras (filas 9–15).
const spots: { what: string; tx: number; ty: number; seat: boolean }[] = [
  ...seatIds.map((s) => ({ what: s, tx: points[s].tx, ty: points[s].ty, seat: true })),
  { what: 'camarero', tx: waiter.tx, ty: waiter.ty, seat: false },
  ...tables.map((t) => ({ what: `servicio de ${t.id}`, tx: t.service.tx, ty: t.service.ty, seat: false })),
];
for (const s of spots) {
  assert.ok(s.seat ? isStandable(street, s.tx, s.ty) : isWalkable(street, s.tx, s.ty), `${s.what} en ${s.tx},${s.ty} no se pisa`);
  for (const a of street.stallAnchors ?? []) assert.ok(Math.abs(a.tx - s.tx) > 1 || Math.abs(a.ty - s.ty) > 1, `${s.what} pegado al ancla ${a.id}`);
  assert.ok(s.tx < 19 || s.tx > 23, `${s.what} en la ruta de limpieza (x ${s.tx})`);
  assert.ok(s.ty < 9 || s.ty > 15, `${s.what} en la calle (y ${s.ty})`);
}

// (b) Ninguna mesa de terraza de la plaza sin su silla en `tables`.
for (const p of street.props.filter((q) => q.kind === 'cafe-table')) {
  assert.ok(seatIds.some((s) => Math.abs(points[s].tx - p.tx) <= 1 && Math.abs(points[s].ty - p.ty) <= 1), `mesa en ${p.tx},${p.ty} sin asiento con servicio`);
}

// (c) Un domingo de 15:00 a 21:00 en la calle: nunca dos en una silla, alguien se sienta en la terraza y se levanta, y al
// final ninguna silla es de alguien que ya no está. (d) De paso, los paseantes de 17:00 a 20:00 contra un martes.
forceWeather({ rain: 0, cloud: 0, celsius: 22, wet: 0 });
const STEP_MS = 100;
const MS_PER_MIN = 500;
const PLAYER = { tx: 10, ty: 15 };
const addMinutes = (c: Clock, m: number): Clock => {
  const total = c.hour * 60 + c.minute + m;
  return { day: c.day + Math.floor(total / 1440), hour: Math.floor((total % 1440) / 60), minute: total % 60 };
};
/** Simula la calle `minutes` minutos de juego desde `from`; `each` se llama en cada paso. */
const simulate = (seed: number, from: Clock, minutes: number, each: (life: StreetLife, c: Clock) => void): StreetLife => {
  const life = new StreetLife(street, streetProfileFor('casco-antiguo')!, seededRng(seed));
  let clock = from;
  life.populate(clock, PLAYER);
  let elapsed = 0;
  for (let i = 0; i < Math.ceil((minutes * MS_PER_MIN) / STEP_MS); i++) {
    life.update(STEP_MS, clock, PLAYER);
    elapsed += STEP_MS;
    if (elapsed >= MS_PER_MIN) {
      elapsed -= MS_PER_MIN;
      clock = addMinutes(clock, 1);
    }
    each(life, clock);
  }
  return life;
};
const inWindow = (c: Clock, from: number, to: number): boolean => c.hour + c.minute / 60 >= from && c.hour + c.minute / 60 < to;
const sat = new Set<number>();
const stood = new Set<number>();
const sundayWalkers: number[] = [];
const sunday = simulate(7, { day: 7, hour: 15, minute: 0 }, 6 * 60, (life, c) => {
  const bySeat = new Map<string, number[]>();
  for (const a of life.agents) {
    if (a.vanish || !a.staying || !a.stayPoint) continue;
    bySeat.set(a.stayPoint, [...(bySeat.get(a.stayPoint) ?? []), a.id]);
  }
  for (const [seat, who] of bySeat) {
    if (!seat.startsWith(TERRACE)) continue;
    assert.equal(who.length, 1, `${seat} con ${who.length} dueños (${who.join(', ')})`);
  }
  for (const seat of seatIds) {
    const owner = life.seats.ownerOf(seat);
    const sitter = bySeat.get(seat)?.[0];
    if (sitter !== undefined) assert.equal(owner, sitter, `${seat}: sentado ${sitter}, dueño ${owner}`);
  }
  for (const id of sat) if (!life.agents.some((a) => a.id === id && a.staying && a.stayPoint?.startsWith(TERRACE))) stood.add(id);
  for (const a of life.agents) if (a.staying && a.stayPoint?.startsWith(TERRACE)) sat.add(a.id);
  if (inWindow(c, 17, 20)) sundayWalkers.push(life.summary.walkers);
});
assert.ok(sat.size > 0, 'en toda la tarde del domingo nadie se sienta en la terraza de La Lonja');
assert.ok(stood.size > 0, 'quien se sienta en la terraza no se levanta nunca');
for (const seat of sunday.seats.seats()) {
  const owner = sunday.seats.ownerOf(seat);
  assert.ok(sunday.agents.some((a) => a.id === owner && !a.vanish), `${seat} sigue reservado por ${owner}, que ya no está`);
}
assert.equal(sunday.pathFailures, 0, 'domingo: rutas no encontradas');

// (d) Con la Sobremesa del Rastro, el domingo de 17:00 a 20:00 hay más gente que un martes a esa hora.
const tuesdayWalkers: number[] = [];
simulate(7, { day: 2, hour: 17, minute: 0 }, 3 * 60, (life, c) => {
  if (inWindow(c, 17, 20)) tuesdayWalkers.push(life.summary.walkers);
});
const mean = (xs: readonly number[]): number => xs.reduce((n, x) => n + x, 0) / Math.max(1, xs.length);
assert.ok(mean(sundayWalkers) > mean(tuesdayWalkers), `domingo ${mean(sundayWalkers).toFixed(1)} paseantes, martes ${mean(tuesdayWalkers).toFixed(1)}`);

// (e) Con lluvia fuerte no hay sobremesa en la plaza.
assert.equal(activePopUp('casco-antiguo', { day: 7, hour: 18, minute: 0 })?.id, 'sobremesa-rastro', 'el domingo a las 18:00 no hay sobremesa');
forceWeather({ rain: 0.9, cloud: 1, celsius: 12, wet: 0.9 });
assert.equal(activePopUp('casco-antiguo', { day: 7, hour: 18, minute: 0 }), undefined, 'con lluvia fuerte hay sobremesa');
forceWeather(null);

// (f) El Rastro y su sobremesa caben el mismo domingo, semana tras semana (weekPlan no los descarta por solape).
for (let week = 0; week < 8; week++) {
  const ids = weekPlan('casco-antiguo', week).map((s) => s.def.id);
  assert.ok(ids.includes('gran-rastro') && ids.includes('sobremesa-rastro'), `semana ${week}: ${ids.join(', ')}`);
}

console.log(
  `check-casco-taberna: ok (${catalog.products.length} productos, puerta en x ${door.doorX}) · terraza: ${sat.size} se sientan, ${stood.size} se levantan · ` +
    `paseantes 17–20 domingo ${mean(sundayWalkers).toFixed(1)} / martes ${mean(tuesdayWalkers).toFixed(1)}`,
);
