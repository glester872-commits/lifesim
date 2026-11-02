// ALPHA-08 · Ronda de la Vía (data/vallesco.ts, data/ronda.ts): se llega andando desde tu portal, el parque de bomberos
// se entra y se sale y su guardia ofrece algo de verdad, y las dos viviendas nuevas se alquilan una sola vez y quedan
// guardadas. `npm run check`. Falla si algo no se cumple.
import assert from 'node:assert/strict';
import { HOMES, getHome } from '../src/data/housing.ts';
import { getActivity } from '../src/data/activities.ts';
import { getOffer, SERVICE_ROLES } from '../src/data/services.ts';
import { POPULATION_PROFILES } from '../src/data/population.ts';
import { getLocation, getSpawn, isWalkable } from '../src/systems/LocationSystem.ts';
import { homeDoor, homeEntry, installAll, move, moveBlocker, reaches, startHousing } from '../src/systems/Housing.ts';
import { placeInfo, isOpen } from '../src/systems/Places.ts';
import { route } from '../src/systems/Navigation.ts';
import { createInitialState, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';

const street = getLocation('district');
const start = street.spawns.start;

// ----------------------------------------------- la calle: de tu portal a cada puerta nueva, andando
for (const door of ['ronda-bomberos', 'ronda-8', 'res-mayor-17']) {
  const s = getSpawn(street, door);
  assert.ok(isWalkable(street, s.tx, s.ty), `${door}: la puerta da a un tile bloqueado`);
  assert.ok(reaches(street, start, s), `${door}: no se llega andando desde Olmo 7`);
}
// El paso a nivel es la única entrada: la vía sigue siendo sólida a ambos lados.
const railRow = street.ground.findIndex((r) => r.startsWith('RRRR'));
assert.ok(railRow > 0 && !isWalkable(street, 10, railRow) && isWalkable(street, 50, railRow), 'el paso a nivel no está o la vía se cruza por cualquier sitio');
// La gente tiene ruta por el grafo: del parque a la Ronda y de una punta a otra.
for (const [a, b] of [['park-b1', 'BOMBEROS_ENTRANCE'], ['HOME_ENTRANCE', 'RONDA_8_ENTRANCE'], ['EDGE_RONDA_W', 'EDGE_RONDA_E'], ['RONDA_30_ENTRANCE', 'PARK_COURT']]) {
  assert.ok(route(a, b), `sin ruta de ${a} a ${b}`);
}
// Lo de antes no se ha movido: tu portal, el metro y el estudio siguen donde estaban.
assert.deepEqual([getSpawn(street, 'home-door').tx, getSpawn(street, 'home-door').ty], [41, 51], 'tu portal se ha movido');
assert.deepEqual([getSpawn(street, 'res-olmo-11').tx, getSpawn(street, 'res-olmo-11').ty], [50, 51], 'el estudio se ha movido');

// ----------------------------------------------- el parque de bomberos
const fire = getLocation('bomberos');
const entry = fire.spawns.entry;
for (const [id, p] of Object.entries(fire.points ?? {})) assert.ok(reaches(fire, entry, p), `bomberos: no se llega a ${id}`);
for (const q of fire.inspects ?? []) assert.ok(reaches(fire, entry, q), `bomberos: no se llega a mirar ${q.name}`);
assert.equal(fire.portals[0].to.location, 'district');
assert.ok(getSpawn(street, fire.portals[0].to.spawn), 'bomberos: la salida no lleva a la Ronda');
assert.ok(fire.props.some((p) => p.kind === 'fire-engine') && !fire.props.some((p) => p.kind === 'register'), 'bomberos: sin autobomba o con caja');
const place = placeInfo('bomberos');
assert.ok(place && isOpen(place, 3, 3, 0) && isOpen(place, 3, 15, 0), 'bomberos: la guardia es de 24 horas');
const profile = POPULATION_PROFILES.find((p) => p.place === 'bomberos');
assert.ok(profile?.staff.some((s) => s.service === 'firefighter'), 'bomberos: sin guardia');
const offer = getOffer(SERVICE_ROLES.firefighter.offers);
assert.ok(offer.kind === 'activities' && offer.activities.length >= 1, 'la guardia no ofrece nada');
for (const id of offer.activities) {
  const a = getActivity(id);
  // Gratis y sin efectos inventados: no hay sistema de emergencias que premie nada.
  assert.ok(!a.cost && !a.effects.money && !a.effects.energy && a.lines.length > 0 && a.minutes > 0, `${id}: promete algo que no hay`);
}

// ----------------------------------------------- las viviendas nuevas: alquilar una vez, guardar, volver
const fresh = (): SaveSystem => {
  const store = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
  return new SaveSystem(storage);
};
const rents = HOMES.map((h) => h.rent);
assert.equal(new Set(rents).size, rents.length, 'dos viviendas con el mismo alquiler: no se distinguen');
for (const id of ['ronda8', 'mayor17']) {
  const home = getHome(id);
  const fee = home.move!.fee;
  const h = startHousing();
  // Sin llegar a la meta, ni se cobra ni se muda; con la meta justa, se cobra una vez y el dinero no baja de cero.
  assert.ok(moveBlocker(h, id, home.move!.free - 1, false), `${id}: deja mudarse sin la meta`);
  const r = move(h, id, home.move!.free, home.move!.free, false);
  assert.ok(r.ok && r.housing.home === id && Math.abs(r.money - (home.move!.free - fee)) < 1e-9 && r.money >= 0, `${id}: la mudanza no cobra exactamente ${fee}`);
  assert.equal(move(r.housing, id, r.money, r.money, false).ok, false, `${id}: se puede volver a pagar la misma casa`);
  // La puerta de vuelta y la entrada son las de la casa nueva.
  assert.deepEqual(homeDoor(r.housing), { location: 'district', spawn: home.door });
  assert.deepEqual(homeEntry(r.housing), { location: home.location, spawn: 'entry' });
  // Guardado y recargado: la casa, el dinero y la bolsa siguen; recargar no cobra otra vez.
  const save = fresh();
  save.save({ ...createInitialState(), money: r.money, inventory: { water: 2 }, housing: r.housing, locationId: home.location });
  const loaded = save.load()!;
  assert.equal(loaded.housing.home, id, `${id}: tras recargar vuelves a la casa de antes`);
  assert.equal(loaded.money, r.money, `${id}: recargar cambia el dinero`);
  assert.deepEqual(loaded.inventory, { water: 2 }, `${id}: la mudanza pierde la bolsa`);
  assert.equal(loaded.locationId, home.location, `${id}: tras recargar no apareces en casa`);
}
installAll(startHousing());

console.log(`OK: Ronda de la Vía a pie desde Olmo 7 por el paso a nivel · parque de bomberos (${offer.activities.length} cosas que hacer con la guardia, 24 h) · ${HOMES.length} viviendas con alquiler distinto · mudanza a Ronda 8 y Mayor 17 cobrada una vez y guardada.`);
