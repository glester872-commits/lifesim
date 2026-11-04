// Casco Antiguo (data/cascoAntiguo.ts): el barrio existe, se recorre desde el andén hasta la frutería, su parada es L2
// order 3 y los trayectos de antes cuestan lo mismo.
import assert from 'node:assert/strict';
import { LOCATION_DISTRICT } from '../src/data/districtIdentity.ts';
import { STOPS } from '../src/data/transit.ts';
import { getLocation, hasLocation, validate } from '../src/systems/LocationSystem.ts';
import { tilePath } from '../src/systems/Navigation.ts';
import { destinationsFrom, getStop } from '../src/systems/Transit.ts';
import { auditVenues } from '../src/systems/VenueAudit.ts';
import { METRO_MINUTES } from '../src/config/constants.ts';

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
assert.ok(street.buildings!.filter((b) => b.enter).length === 2, 'sólo la frutería y el metro llevan enter');
const walk = tilePath(street, street.spawns[out.to.spawn], street.spawns[shop.id]);
assert.ok(walk && walk.length > 3, 'del metro a la puerta de la frutería no se llega andando');

console.log('check-casco-antiguo: ok');
