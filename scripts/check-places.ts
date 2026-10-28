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
  // Un interior sin calle (Decathlon, PlaceDef.interior) también se revisa entero.
  const interior = interiorOf(place.building) ?? (place.interior ? getLocation(place.interior) : undefined);
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
  // Sentarse a una mesa con servicio (systems/TableService) también es algo que hacer: se pide, se come y se paga.
  const served = profile?.tableService && (interior.tables?.length ?? 0) > 0 ? 1 : 0;
  assert.ok(terminals.length + spots.length + offers.length + served > 0, `${who} no hay nada que comprar ni que hacer dentro`);
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

// Abierto o cerrado: una sola fuente (Places.isOpen) y lo que dice la puerta cerrada sale de ese mismo horario.
// Día 1 = lunes: el 13 es sábado y el 14 domingo.
{
  const { placeInfo, isOpen, nextOpening, closedLines, hoursLabel } = await import('../src/systems/Places.ts');
  const p = (id: string) => placeInfo(id)!;
  // Cruce de medianoche y la noche de ayer: la discoteca del sábado sigue a las 00:00 y a las 05:59 del domingo.
  assert.ok(isOpen(p('nightclub'), 13, 23, 59) && isOpen(p('nightclub'), 14, 0, 0) && isOpen(p('nightclub'), 14, 5, 59));
  assert.ok(!isOpen(p('nightclub'), 14, 6, 0));
  assert.deepEqual(nextOpening(p('nightclub'), 14, 6, 0), { day: 18, hour: 21 }, 'la discoteca reabre el jueves');
  assert.match(closedLines(p('nightclub'), 14, 6, 0).join(' '), /Hoy no abre\. Abre el jueves a las 21:00\./);
  // Cierre a las 00:00: abierto a las 23:59, cerrado a las 00:00 y «abre hoy» a mediodía.
  assert.ok(isOpen(p('restaurant'), 9, 23, 59) && !isOpen(p('restaurant'), 10, 0, 0));
  assert.match(closedLines(p('restaurant'), 10, 0, 0).join(' '), /Todavía no ha abierto\. Abre hoy a las 12:00\./);
  // Horario propio del domingo: el súper cierra a las 15:00 y abre el lunes a las 09:00.
  assert.ok(isOpen(p('supermarket'), 14, 14, 59) && !isOpen(p('supermarket'), 14, 15, 0));
  assert.match(closedLines(p('supermarket'), 14, 16, 0).join(' '), /Ya ha cerrado por hoy\. Abre mañana a las 09:00\./);
  // Lunes cerrado, pero la noche del domingo sigue: la vinoteca a las 00:30 del lunes está abierta; a las 18:00, no.
  assert.ok(isOpen(p('wine-bar'), 8, 0, 30) && !isOpen(p('wine-bar'), 8, 18, 0));
  assert.match(closedLines(p('wine-bar'), 8, 18, 0).join(' '), /Hoy no abre\. Abre mañana a las 18:00\./);
  // 24 horas: siempre abierto y lo dice así; nunca una próxima apertura inventada.
  for (let h = 0; h < 24; h++) assert.ok(isOpen(p('vl-hotel'), 14, h, 30));
  assert.match(hoursLabel(p('vl-hotel')), /24 horas/);
  // Fuera de la ventana, la próxima apertura nunca es antes de ahora y es una hora de apertura de verdad.
  for (const place of PLACES.filter((x) => x.type === 'business' && x.hours).map((x) => p(x.id))) {
    for (let day = 8; day <= 14; day++) for (let h = 0; h < 24; h++) {
      if (isOpen(place, day, h, 0)) continue;
      const next = nextOpening(place, day, h, 0);
      assert.ok(next && (next.day > day || next.hour > h), `${place.id}: próxima apertura ${JSON.stringify(next)} desde ${day} ${h}h`);
      assert.ok(isOpen(place, next.day, Math.floor(next.hour), Math.round((next.hour % 1) * 60)), `${place.id}: no abre a la hora que dice`);
    }
  }
  // Un mostrador en la calle con lugar se rige por su horario (la heladería a las 03:00, cerrada).
  for (const loc of LOCATIONS) for (const t of loc.terminals ?? []) if (t.place) assert.ok(placeInfo(t.place), `${loc.id}: ${t.name} con lugar desconocido ${t.place}`);
  assert.equal(getLocation('ribera').terminals?.find((t) => t.catalog === 'ice-cream-kiosk')?.place, 'heladeria');
  assert.ok(!isOpen(p('heladeria'), 10, 3, 0));
  console.log('OK: horarios, medianoche, noche anterior, fin de semana, 24 h y próxima apertura.');
}
