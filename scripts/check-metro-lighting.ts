// MET-05: luz de los andenes. `node scripts/check-metro-lighting.ts`. Todo andén lleva los tubos de stationLighting,
// cada uno sobre baldosa transitable y fuera de puntos con nombre, portales, spawns y tornos; el tubo no tiene cuerpo
// ni cambia lo que se alcanza; el ambiente sigue siendo el fijo de interior (QA-06) y las sombras son discretas.
import assert from 'node:assert/strict';
import { LOCATIONS, PLATFORM_GROUND } from '../src/data/locations.ts';
import { METRO_AMBIENT, METRO_LIGHT_KIND, METRO_SHADOW, TUNNEL_CONTRAST, stationLighting } from '../src/data/stationLighting.ts';
import { isWalkable } from '../src/systems/LocationSystem.ts';
import { PROPS } from '../src/world/tiles.ts';
import type { LocationDef } from '../src/types/game.ts';

const key = (p: { tx: number; ty: number }): string => `${p.tx},${p.ty}`;

/** Toda coordenada con nombre: NPC, rondas, esperas, asientos, puntos, portales, spawns, terminales. */
function named(v: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => named(x, out));
  else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.tx === 'number' && typeof o.ty === 'number') out.add(`${o.tx},${o.ty}`);
    Object.values(o).forEach((x) => named(x, out));
  }
  return out;
}

function reachable(loc: LocationDef): Set<string> {
  const start = loc.spawns.entry;
  const seen = new Set([key(start)]);
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

const light = PROPS[METRO_LIGHT_KIND];
assert.ok(light.overhead, `${METRO_LIGHT_KIND}: sin overhead, tendría cuerpo y sombra`);
assert.ok(!light.post && !light.foot && !light.mount && !light.flat, `${METRO_LIGHT_KIND}: con caja de choque`);
assert.equal(METRO_LIGHT_KIND, 'metro-light', 'la luz del andén es el prop invisible metro-light');
assert.ok(light.light?.cool, `${METRO_LIGHT_KIND}: sin luz fría`);
assert.ok(light.light?.pool, `${METRO_LIGHT_KIND}: sin charco en el suelo`);
assert.equal(METRO_AMBIENT, '#dbe7f2', 'ambiente del andén cambiado (QA-06)');
assert.ok(METRO_SHADOW.train > 0 && METRO_SHADOW.train <= 0.3, `sombra del tren ${METRO_SHADOW.train}`);
assert.ok(METRO_SHADOW.lip > 0 && METRO_SHADOW.lip <= 0.3, `labio del andén ${METRO_SHADOW.lip}`);
for (const c of TUNNEL_CONTRAST) assert.ok(c >= -0.4 && c <= 0, `contraste de túnel ${c} fuera de [−0,4, 0]`);
TUNNEL_CONTRAST.slice(1).forEach((c, i) => assert.ok(TUNNEL_CONTRAST[i] < c, 'cada columna de la boca, más oscura que la siguiente'));

const stations = LOCATIONS.filter((l) => l.metro);
assert.ok(stations.length >= 12, `andenes encontrados: ${stations.length}`);
const rows: string[] = [];
for (const loc of stations) {
  const lit = stationLighting(loc.id);
  assert.deepEqual(stationLighting(loc.id), lit, `${loc.id}: luz distinta en dos llamadas`);
  assert.equal(lit.stationId, loc.id);
  assert.equal(loc.ambient, lit.ambientColor, `${loc.id}: ambiente ≠ stationLighting`);
  assert.equal(loc.ambient, '#dbe7f2', `${loc.id}: ambiente cambiado (QA-06)`);

  const placed = loc.props.filter((p) => p.kind === lit.kind).map(key).sort();
  assert.deepEqual(placed, lit.lights.map(key).sort(), `${loc.id}: tubos ≠ stationLighting`);

  const spots = named({ npcs: loc.npcs, metro: loc.metro, spawns: loc.spawns, portals: loc.portals, terminals: loc.terminals, points: loc.points });
  const others = new Set(loc.props.filter((p) => p.kind !== lit.kind).map(key));
  for (const l of lit.lights) {
    const k = key(l);
    assert.equal(PLATFORM_GROUND[l.ty]?.[l.tx], 'p', `${loc.id}: luz ${k} fuera de la baldosa del andén`);
    assert.ok(isWalkable(loc, l.tx, l.ty), `${loc.id}: luz ${k} en tile no transitable`);
    assert.ok(!spots.has(k), `${loc.id}: luz ${k} sobre un punto con nombre, portal o spawn`);
    assert.ok(!others.has(k), `${loc.id}: luz ${k} sobre otro prop (torno, banco…)`);
  }

  const without: LocationDef = { ...loc, id: `${loc.id}#sin-luces`, props: loc.props.filter((p) => p.kind !== lit.kind) };
  assert.deepEqual([...reachable(loc)].sort(), [...reachable(without)].sort(), `${loc.id}: las luces cambian lo alcanzable`);
  rows.push(`${loc.id}: ${lit.lights.map(key).join(' ')}`);
}

console.log(rows.join('\n'));
console.log(`check-metro-lighting: ${stations.length} andenes, ${stations.length * stationLighting('x').lights.length} tubos, ambiente ${METRO_AMBIENT}, sombras ${METRO_SHADOW.train}/${METRO_SHADOW.lip}, túnel ${TUNNEL_CONTRAST.join('/')}`);
