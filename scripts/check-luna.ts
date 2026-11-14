// Luna (data/luna.ts): el barrio existe, se recorre desde el andén hasta el bar y la tienda, su parada es L2 order 4, la
// calle está cerrada, la copa cuesta y cansa lo que dice, y los trayectos de antes cuestan lo mismo.
import assert from 'node:assert/strict';
import { getActivity } from '../src/data/activities.ts';
import { LOCATION_DISTRICT } from '../src/data/districtIdentity.ts';
import { STOPS } from '../src/data/transit.ts';
import { SAVE_VERSION } from '../src/config/constants.ts';
import { blocker, perform } from '../src/systems/Activities.ts';
import { estimateTrip } from '../src/systems/Agenda.ts';
import { getLocation, hasLocation, isWalkable, spawnToWorld, validate } from '../src/systems/LocationSystem.ts';
import { route, tilePath } from '../src/systems/Navigation.ts';
import { isOpen, placeInfo } from '../src/systems/Places.ts';
import { createInitialState, restore } from '../src/systems/SaveSystem.ts';
import { destinationsFrom, getStop, prepareRide } from '../src/systems/Transit.ts';
import { auditVenues } from '../src/systems/VenueAudit.ts';

const ID = 'luna';
const street = getLocation(ID);
validate(street);
assert.equal(LOCATION_DISTRICT[ID], ID);
for (const r of auditVenues(ID)) assert.deepEqual(r.problems, [], `${r.name}: ${r.problems.join(' | ')}`);

// Parada: L2, order 4, una más allá del Casco Antiguo (que no se movió).
const stop = STOPS.find((s) => s.id === ID)!;
assert.ok(stop && stop.line === 'L2' && stop.order === 4 && stop.station === 'luna-station', 'parada mal definida');
assert.equal(STOPS.find((s) => s.id === 'casco-antiguo')?.order, 3);
const minutes = (a: string, b: string): number => destinationsFrom(getStop(a)).find((d) => d.stop.id === b)!.minutes;
assert.equal(minutes('vallesco', ID), 60);
assert.equal(minutes('vallesco', 'arena'), 60, 'Vallesco–Arena cambió');
assert.equal(minutes('vallesco', 'ribera'), 15, 'Vallesco–Ribera cambió');
assert.equal(minutes('vallesco', 'casco-antiguo'), 45, 'Vallesco–Casco cambió');

// La estación sale a la calle y tiene su andén.
const station = getLocation('luna-station');
assert.ok(station.spawns.train, 'sin spawn train');
const out = station.portals.find((p) => !p.train)!;
assert.ok(out && out.to.location === ID && out.to.spawn === 'lu-metro' && street.spawns[out.to.spawn], 'el andén no sale a la calle');

// Los portales de la calle resuelven a spawns existentes.
for (const p of street.portals) {
  assert.ok(hasLocation(p.to.location) && getLocation(p.to.location).spawns[p.to.spawn], `portal ${p.id} sin destino`);
}
assert.equal(street.buildings!.filter((b) => b.enter).length, 3, 'sólo el bar, la tienda y el metro llevan enter');

// Los dos locales: vuelven a la calle, la tienda cobra en su caja, en el bar se pide la copa, y se llega andando desde el metro.
for (const id of ['lu-bar', 'lu-abierto']) {
  const inside = getLocation(id);
  assert.ok(inside.portals.some((p) => p.to.location === ID && street.spawns[p.to.spawn]), `${id} no devuelve a la calle`);
  const walk = tilePath(street, street.spawns['lu-metro'], street.spawns[id]);
  assert.ok(walk && walk.length > 3, `del metro a ${id} no se llega andando`);
}
assert.ok(getLocation('lu-abierto').terminals?.length, 'la tienda no tiene caja');
assert.ok(getLocation('lu-bar').spots?.some((s) => s.activities.includes('lu-copa')), 'en el bar no se puede pedir la copa');

// La actividad: se puede con dinero, no sin él, y hace lo que dice.
const copa = getActivity('lu-copa');
const ctx = { day: 6, hour: 23, minute: 0, energy: 50, money: 10 };
assert.equal(blocker(copa, ctx), null);
assert.notEqual(blocker(copa, { ...ctx, money: 1 }), null, 'la copa no pide dinero');
const done = perform(copa);
assert.deepEqual([done.minutes, done.money, done.energy], [20, -6, 4]);

// El horario del bar: el sábado a las 23:00 abierto; a mediodía, cerrado.
const bar = placeInfo('lu-bar')!;
assert.ok(isOpen(bar, 6, 23), 'el bar cerrado a las 23:00');
assert.ok(!isOpen(bar, 6, 12), 'el bar abierto a las 12:00');

// Los bordes: sin coches y sin salida andando. Desde el metro nunca se pisa fuera de la calle.
assert.equal(street.traffic, undefined);
const origin = street.spawns['lu-metro'];
const seen = new Set([`${origin.tx},${origin.ty}`]);
const queue = [{ tx: origin.tx, ty: origin.ty }];
while (queue.length) {
  const { tx, ty } = queue.shift()!;
  assert.ok(tx >= 3 && tx <= 30 && ty >= 8 && ty <= 16, `se llega a pie a ${tx},${ty}, fuera de la calle`);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const k = `${tx + dx},${ty + dy}`;
    if (seen.has(k) || !isWalkable(street, tx + dx, ty + dy)) continue;
    seen.add(k);
    queue.push({ tx: tx + dx, ty: ty + dy });
  }
}
assert.equal(Object.values(street.points!).filter((p) => p.kind === 'edge').length, 2, 'dos umbrales de salida, ni uno más');
assert.ok(route('EDGE_LU_W', 'EDGE_LU_E'), 'los dos umbrales no se conectan');

// Ida y vuelta en metro: 2 euros por viaje y una hora de reloj cada una.
const ida = prepareRide({ money: 20, cards: { transport: 10 }, inventory: {} }, null, getStop('vallesco'), getStop(ID), 22);
assert.ok(ida.ok);
assert.equal(ida.minutes, 60);
assert.equal(ida.station, 'luna-station');
const vuelta = prepareRide(ida.wallet, null, getStop(ID), getStop('vallesco'), 23);
assert.ok(vuelta.ok);
assert.equal(vuelta.wallet.cards.transport, 6);

// La agenda sabe llegar desde la calle de Vallesco hasta la puerta del bar.
const trip = estimateTrip({ location: 'district', ...spawnToWorld(getLocation('district').spawns.start) }, { name: 'Bar', location: ID, tile: street.points!.LU_BAR_ENTRANCE });
assert.notEqual(trip.totalMin, null, trip.text);
assert.ok(trip.tramos.some((t) => t.kind === 'metro'), 'sin tramo de metro');

// Una partida guardada dentro del bar se recupera dentro del bar, y la versión de guardado no cambió.
assert.equal(restore({ ...createInitialState(), locationId: 'lu-bar', position: spawnToWorld(getLocation('lu-bar').spawns.entry) }).locationId, 'lu-bar');
assert.equal(SAVE_VERSION, 4); // LV-10 subió el esquema (ledger con movementId); Luna no lo cambia.

console.log('check-luna: ok');
