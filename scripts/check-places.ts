// ¿Por qué entraría el jugador? Cada lugar con `why` (data/places.ts) tiene que
// poder responderlo dentro: algo que comprar o hacer, alcanzable a pie, personal,
// gente según la hora y luz propia. `node scripts/check-places.ts`.
import assert from 'node:assert/strict';
import { PLACES } from '../src/data/places.ts';
import { POPULATION_PROFILES } from '../src/data/population.ts';
import { CATALOGS, getCatalog } from '../src/data/catalogs.ts';
import { getActivity } from '../src/data/activities.ts';
import { getItem } from '../src/data/items.ts';
import { LOCATIONS } from '../src/data/locations.ts';
import { getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { PROPS } from '../src/world/tiles.ts';
import { getOffer } from '../src/data/services.ts';
import { HAIRSTYLES } from '../src/data/appearance.ts';
import { getStore } from '../src/data/retail.ts';
import { TATTOO_DESIGNS } from '../src/data/tattoos.ts';
import { identity } from '../src/systems/Service.ts';
import type { LocationDef } from '../src/types/game.ts';

/** Tiles a los que se llega a pie desde la entrada del interior. */
function reachable(loc: LocationDef): Set<string> {
  const start = loc.spawns.entry ?? Object.values(loc.spawns)[0];
  const seen = new Set([`${start.tx},${start.ty}`]);
  const stack = [[start.tx, start.ty]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const k = `${nx},${ny}`;
      if (seen.has(k) || !isWalkable(loc, nx, ny)) continue;
      seen.add(k);
      stack.push([nx, ny]);
    }
  }
  return seen;
}

/** Se puede usar si el tile, o uno de al lado, se pisa llegando desde la puerta. */
const usable = (walk: Set<string>, tx: number, ty: number): boolean =>
  [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => walk.has(`${tx + dx},${ty + dy}`));

const interiorOf = (buildingId: string | undefined): LocationDef | undefined => {
  const building = LOCATIONS.flatMap((loc) => loc.buildings ?? []).find((b) => b.id === buildingId);
  return building?.enter ? getLocation(building.enter.location) : undefined;
};

const rows: string[] = [];
let ready = 0;
for (const place of PLACES) {
  const interior = interiorOf(place.building);
  const profile = POPULATION_PROFILES.find((p) => p.place === place.id);
  const terminals = interior?.terminals ?? [];
  const spots = interior?.spots ?? [];
  const lights = (interior?.props ?? []).filter((p) => PROPS[p.kind].light).length;
  // Personal al que se le pide algo (la barbera, la barra): también es algo que hacer dentro.
  const offers = (profile?.staff ?? []).flatMap((s) => {
    const offer = identity(s).offers;
    return offer ? [{ offer, points: s.points }] : [];
  });
  const status = place.why ? 'LISTO' : interior ? 'pendiente' : 'fachada';
  rows.push(`${status.padEnd(10)} ${place.id.padEnd(15)} interior:${interior ? 'sí' : 'no'}  compra:${terminals.length}  hacer:${spots.length + offers.length}  personal:${profile?.staff.length ?? 0}  luces:${lights}${place.why ? `  → ${place.why}` : ''}`);
  if (!place.why) continue;
  ready++;

  const who = `[${place.id}]`;
  assert.ok(interior, `${who} tiene "why" pero no se puede entrar`);
  assert.ok(terminals.length + spots.length + offers.length > 0, `${who} no hay nada que comprar ni que hacer dentro`);
  const walk = reachable(interior);
  for (const t of terminals) {
    assert.ok(getCatalog(t.catalog).products.length > 0, `${who} ${t.name}: catálogo vacío`);
    assert.ok(usable(walk, t.tx, t.ty), `${who} ${t.name}: no se llega a pie`);
  }
  for (const s of spots) {
    for (const a of s.activities) getActivity(a);
    assert.ok(usable(walk, s.tx, s.ty), `${who} ${s.name}: no se llega a pie`);
  }
  for (const { offer, points } of offers) {
    const def = getOffer(offer);
    if (def.kind === 'activities') for (const a of def.activities) getActivity(a);
    else if (def.kind === 'retail') assert.ok(getStore(def.store).stock.length > 0, `${who} ${offer}: tienda sin género`);
    else if (def.slot === 'tattoos') assert.ok(TATTOO_DESIGNS.length > 0, `${who} ${offer}: no hay diseños`);
    else assert.ok(HAIRSTYLES.some((h) => h.price !== undefined), `${who} ${offer}: no hay nada que ofrecer`);
    // A quien ofrece se llega a pie: su puesto está junto a algo pisable desde la puerta.
    for (const id of points) {
      const pt = interior.points?.[id];
      assert.ok(pt && usable(walk, pt.tx, pt.ty), `${who} ${offer}: no se llega a ${id}`);
    }
  }
  assert.ok(lights > 0, `${who} sin luz propia dentro`);
  if (place.type === 'business') {
    assert.ok(place.hours, `${who} negocio sin horario`);
    assert.ok(profile, `${who} sin perfil de gente (data/population.ts)`);
    assert.ok(profile.staff.length > 0, `${who} sin personal`);
    assert.ok(profile.visitors.length > 0 && profile.bands.length > 0, `${who} sin clientes según la hora`);
  }
}

// El ciclo se cierra: lo que una actividad gasta se vende en algún sitio.
const sold = new Set(CATALOGS.flatMap((c) => c.products.map((p) => ('item' in p.effect ? p.effect.item : ''))));
for (const place of PLACES) {
  for (const s of interiorOf(place.building)?.spots ?? []) {
    for (const id of s.activities) {
      const c = getActivity(id).consumes;
      if (c) assert.ok(sold.has(c.item), `${id} gasta ${getItem(c.item).name}, que no se vende en ningún sitio`);
    }
  }
}

console.log(rows.join('\n'));
assert.ok(ready >= 5, 'menos lugares listos que antes');
console.log(`\nOK: ${ready} lugares responden por qué entrar; el resto, pendientes a la vista.`);
