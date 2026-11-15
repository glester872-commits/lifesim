// Casco Antiguo (data/cascoAntiguo.ts): el barrio existe, se recorre desde el andén hasta la frutería, su parada es L2
// order 3 y los trayectos de antes cuestan lo mismo.
import assert from 'node:assert/strict';
import { LOCATION_DISTRICT } from '../src/data/districtIdentity.ts';
import { STOPS } from '../src/data/transit.ts';
import { PROTESTS } from '../src/data/protests.ts';
import { getLocation, hasLocation, isWalkable, safePosition, validate } from '../src/systems/LocationSystem.ts';
import { route, tilePath } from '../src/systems/Navigation.ts';
import { destinationsFrom, getStop } from '../src/systems/Transit.ts';
import { auditVenues } from '../src/systems/VenueAudit.ts';
import { METRO_MINUTES, TILE } from '../src/config/constants.ts';

const ID = 'casco-antiguo';
const street = getLocation(ID);
validate(street);
assert.equal(LOCATION_DISTRICT[ID], ID);
for (const r of auditVenues(ID)) assert.deepEqual(r.problems, [], `${r.name}: ${r.problems.join(' | ')}`);

// Parada: L2, order 3, una más allá del Polígono Norte (que no se movió).
const stop = STOPS.find((s) => s.id === ID)!;
assert.ok(stop && stop.line === 'L2' && stop.order === 3 && stop.station === 'casco-antiguo-station', 'parada mal definida');
assert.equal(STOPS.find((s) => s.id === 'decathlon')?.order, 2);
assert.equal(STOPS.find((s) => s.id === 'vallesco')?.order, 0);
const minutes = (a: string, b: string): number => destinationsFrom(getStop(a)).find((d) => d.stop.id === b)!.minutes;
assert.equal(minutes('vallesco', 'arena'), 60, 'Vallesco–Arena cambió');
assert.equal(minutes('vallesco', 'ribera'), METRO_MINUTES);
assert.equal(minutes('vallesco', 'ribera'), 15, 'Vallesco–Ribera cambió');
assert.equal(minutes('vallesco', ID), 45);

// La estación sale a la calle y tiene su andén.
const station = getLocation('casco-antiguo-station');
assert.ok(station.spawns.train, 'sin spawn train');
const out = station.portals.find((p) => !p.train)!;
assert.ok(out && out.to.location === ID && street.spawns[out.to.spawn], 'el andén no sale a la calle');

// Los portales de la calle resuelven a spawns existentes.
for (const p of street.portals) {
  assert.ok(hasLocation(p.to.location) && getLocation(p.to.location).spawns[p.to.spawn], `portal ${p.id} sin destino`);
}

// La frutería: puerta con interior y caja, que vuelve a su fachada, y camino desde el andén hasta ella.
const shop = street.buildings!.find((b) => b.id === 'cas-fruteria')!;
assert.ok(shop.enter && hasLocation(shop.enter.location), 'la frutería no tiene interior');
const inside = getLocation(shop.enter!.location);
assert.ok(inside.terminals?.length, 'la frutería no tiene caja');
assert.ok(inside.spawns[shop.enter!.spawn] && inside.portals.some((p) => p.to.location === ID && street.spawns[p.to.spawn]), 'la frutería no devuelve a la calle');
// CAS-06: taberna en cas-cafe (cambio intencionado de puertas)
assert.ok(street.buildings!.filter((b) => b.enter).length === 3, 'sólo la frutería, la taberna y el metro llevan enter');
const walk = tilePath(street, street.spawns[out.to.spawn], street.spawns[shop.id]);
assert.ok(walk && walk.length > 3, 'del metro a la puerta de la frutería no se llega andando');

// CAS-01: el barrio crece al este (+8) y al sur (+10) para el futuro Gran Rastro, sin mover nada de lo de antes.
// a) La red llega, ida y vuelta, desde la boca de metro a la frutería, a las dos bajadas por la plaza y a la Calle del Rastro.
for (const id of ['CAS_FRUIT_ENTRANCE', 'cas-plaza', 'cas-plaza-e', 'cas-r17', 'cas-r44', 'EDGE_CAS_RW', 'EDGE_CAS_RE']) {
  assert.ok(route('CAS_METRO_ENTRANCE', id), `la red no llega del metro a ${id}`);
  assert.ok(route(id, 'CAS_METRO_ENTRANCE'), `la red no vuelve de ${id} al metro`);
}

// b) Ningún nodo de paso es un callejón sin salida: grado 2 o más; en especial el Pasaje, el Callejón y la bajada este.
const degree = new Map<string, number>();
for (const [a, b] of street.links ?? []) for (const id of [a, b]) degree.set(id, (degree.get(id) ?? 0) + 1);
for (const [id, pt] of Object.entries(street.points!)) {
  if (pt.kind === 'path') assert.ok((degree.get(id) ?? 0) >= 2, `${id} tiene grado ${degree.get(id) ?? 0}`);
}
for (const id of ['cas-s17', 'cas-s44', 'cas-r17', 'cas-r44', 'cas-plaza-e']) {
  assert.equal(street.points![id]?.kind, 'path', `falta el nodo ${id}`);
  assert.ok((degree.get(id) ?? 0) >= 2, `${id} sin dos tramos`);
}

// c) Desde la salida del metro se llega a pie a todo el suelo de calle (no el césped), y hay entre +25 y +40 % de él.
const origin = street.spawns['cas-metro'];
const seen = new Set([`${origin.tx},${origin.ty}`]);
const queue = [{ tx: origin.tx, ty: origin.ty }];
while (queue.length) {
  const { tx, ty } = queue.shift()!;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const k = `${tx + dx},${ty + dy}`;
    if (seen.has(k) || !isWalkable(street, tx + dx, ty + dy)) continue;
    seen.add(k);
    queue.push({ tx: tx + dx, ty: ty + dy });
  }
}
let useful = 0;
for (let y = 0; y < street.ground.length; y++) {
  for (let x = 0; x < street.ground[y].length; x++) {
    if (street.ground[y][x] === 'g' || !isWalkable(street, x, y)) continue;
    useful++;
    assert.ok(seen.has(`${x},${y}`), `tile aislado en ${x},${y}`);
  }
}
// 44×34 medido en eb9b0e3: tiles transitables no-'g' (842 transitables en total)
const BASE = 686;
const USEFUL_MIN = Math.ceil(BASE * 1.25);
const USEFUL_MAX = Math.floor(BASE * 1.4);
console.log(`check-casco-antiguo: ${useful} tiles útiles (antes ${BASE}, +${(((useful - BASE) / BASE) * 100).toFixed(1)} %)`);
assert.ok(useful >= USEFUL_MIN && useful <= USEFUL_MAX, `tiles útiles fuera de rango [${USEFUL_MIN}, ${USEFUL_MAX}]: ${useful}`);

// d) Anclas de puestos: cuántas, con qué nombre, y fuera de los puntos, de la bajada central y de la concentración.
const stalls = street.stallAnchors ?? [];
assert.ok(stalls.length >= 30 && stalls.length <= 45, `${stalls.length} anclas`);
const protest = PROTESTS.find((p) => p.id === 'plaza-mercado-vecinal')!;
const pointAt = new Set(Object.values(street.points!).map((pt) => `${pt.tx},${pt.ty}`));
const slotAt = new Set(protest.slots.map((s) => `${s.tx},${s.ty}`));
const tally = new Map<string, number>();
for (const s of stalls) {
  const k = `${s.tx},${s.ty}`;
  assert.match(s.id, /^casco\.(plaza|calleMayor|calleSecundaria)\.(market|stall|access)\.\d{2}$/, `id de ancla: ${s.id}`);
  assert.ok(!pointAt.has(k), `${s.id} encima de un punto`);
  assert.ok(s.tx < 19 || s.tx > 23, `${s.id} en la bajada central (columnas 19–23)`);
  assert.ok(!slotAt.has(k), `${s.id} en un puesto de la concentración`);
  assert.ok(seen.has(k), `${s.id} no se alcanza desde el metro`);
  const group = s.id.split('.').slice(1, 3).join('.');
  tally.set(group, (tally.get(group) ?? 0) + 1);
}
assert.ok((tally.get('plaza.market') ?? 0) >= 10, 'menos de 10 anclas en la plaza');
console.log(`check-casco-antiguo: anclas ${[...tally].map(([g, n]) => `${g} ${n}`).join(', ')}`);

// e) Una partida guardada en el mapa antiguo aparece exactamente donde estaba. (17,30) era la huella de cas-res-7, que
// no se pisaba: en su lugar (17,25), en la acera sur.
for (const [tx, ty] of [[40, 9], [18, 9], [21, 20], [34, 20], [43, 10], [43, 15], [43, 24], [43, 5], [17, 25]]) {
  const pos = { x: tx * TILE + TILE / 2, y: ty * TILE + TILE };
  assert.deepEqual(safePosition(ID, pos, 'cas-metro'), pos, `la posición guardada ${tx},${ty} se mueve`);
}

// f) Ningún local nuevo con interior.
// CAS-06: taberna en cas-cafe (cambio intencionado de puertas)
assert.equal(street.buildings!.filter((b) => b.enter).length, 3, 'sólo la frutería, la taberna y el metro llevan enter');

console.log('check-casco-antiguo: ok');
