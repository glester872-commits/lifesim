// MET-03: variaciones entre andenes de metro. `node scripts/check-station-variety.ts`. Cada andén tiene estilo
// (data/stationStyles.ts), dos cualesquiera se distinguen en 2 ejes (3 los de identidad), todo es determinista, los
// extras sólo van a la lista blanca sin cortar el paso, el trazado es el de siempre salvo el char del muro y el rótulo
// secundario se puede escribir y cabe.
import assert from 'node:assert/strict';
import { LOCATIONS, PLATFORM_GROUND, platform } from '../src/data/locations.ts';
import { SAFE_EXTRA_TILES, STATION_STYLES, WALL_TONES, stationStyle, stationWall, type StationStyle } from '../src/data/stationStyles.ts';
import { isWalkable } from '../src/systems/LocationSystem.ts';
import { PROPS, TILES } from '../src/world/tiles.ts';
import { canSpell, missingGlyphs, wordWidth } from '../src/world/paint.ts';
import { TILE } from '../src/config/constants.ts';
import type { LocationDef } from '../src/types/game.ts';

const stations = LOCATIONS.filter((l) => l.metro);
assert.ok(stations.length >= 12, `andenes encontrados: ${stations.length}`);
for (const loc of stations) stationStyle(loc.id);
assert.equal(new Set(STATION_STYLES.map((s) => s.stationId)).size, STATION_STYLES.length, 'una fila por andén');
for (const s of STATION_STYLES) assert.ok(stations.some((l) => l.id === s.stationId), `${s.stationId}: estilo sin andén`);

// Variedad: ejes en los que difieren dos estilos.
const axes = (a: StationStyle, b: StationStyle): number =>
  [a.tile !== b.tile, a.posters.join() !== b.posters.join(), JSON.stringify(a.extraProps) !== JSON.stringify(b.extraProps),
    JSON.stringify(a.subSign ?? null) !== JSON.stringify(b.subSign ?? null)].filter(Boolean).length;
for (const a of STATION_STYLES) {
  for (const b of STATION_STYLES) {
    if (a === b) continue;
    const need = a.type === 'identidad' || b.type === 'identidad' ? 3 : 2;
    assert.ok(axes(a, b) >= need, `${a.stationId} y ${b.stationId}: sólo ${axes(a, b)} ejes distintos (mínimo ${need})`);
  }
}

// Los tonos usados se distinguen a zoom de juego: dos cualesquiera, ≥20 en algún canal RGB.
const rgb = (hex: string): number[] => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const used = [...new Set(STATION_STYLES.map((s) => s.tile))];
for (const a of used) {
  for (const b of used) {
    if (a >= b) continue;
    const [ca, cb] = [rgb(WALL_TONES[a]), rgb(WALL_TONES[b])];
    const gap = Math.max(...ca.map((v, i) => Math.abs(v - cb[i])));
    assert.ok(gap >= 20, `azulejo ${a} (${WALL_TONES[a]}) y ${b} (${WALL_TONES[b]}): sólo ${gap} en el canal más distinto`);
  }
}

/** Todo {tx, ty} que aparezca en el valor (puntos de NPC, rondas, esperas, spawns, portales…). */
function points(v: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => points(x, out));
  else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.tx === 'number' && typeof o.ty === 'number') out.add(`${o.tx},${o.ty}`);
    Object.values(o).forEach((x) => points(x, out));
  }
  return out;
}

function reachable(loc: LocationDef): Set<string> {
  const start = loc.spawns.entry;
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

const key = (p: { tx: number; ty: number }): string => `${p.tx},${p.ty}`;
const wallOk = new Set(SAFE_EXTRA_TILES.wall.map(key));
const floorOk = new Set(SAFE_EXTRA_TILES.floor.map(key));
/** Celdas que dibuja un prop: su ancho y su alto hacia arriba desde la base. */
const cells = (p: { kind: keyof typeof PROPS; tx: number; ty: number }): string[] => {
  const d = PROPS[p.kind];
  const out: string[] = [];
  for (let dx = 0; dx < (d.tilesWide ?? 1); dx++) for (let dy = 0; dy < d.tilesHigh; dy++) out.push(`${p.tx + dx},${p.ty - dy}`);
  return out;
};

for (const loc of stations) {
  const style = stationStyle(loc.id);

  // Determinismo: el estilo y el andén entero salen iguales otra vez.
  assert.deepEqual(stationStyle(loc.id), style, `${loc.id}: estilo distinto en dos llamadas`);
  const exit = loc.portals.find((p) => p.id === 'exit')!;
  const board = loc.portals.find((p) => p.id === 'board')!;
  const regen = (): LocationDef =>
    platform(loc.id, loc.name, exit.to, { label: board.label, location: board.to.location }, loc.npcs, loc.metro!.guards);
  const gen = regen();
  assert.deepEqual(regen(), gen, `${loc.id}: platform() no sale igual dos veces`);

  // Trazado: el de platform() es idéntico al de referencia salvo el char del muro, que es muro sólido. En LOCATIONS
  // (con lo que el sitio añada después, p. ej. la escalera de correspondencia) no hay otro muro de andén que el suyo.
  const wall = stationWall(loc.id);
  assert.ok(TILES[wall]?.wall && TILES[wall].solid, `${loc.id}: «${wall}» no es un muro sólido en TILES`);
  assert.equal(gen.ground.length, PLATFORM_GROUND.length, `${loc.id}: alto del trazado`);
  PLATFORM_GROUND.forEach((ref, y) => {
    assert.equal(gen.ground[y], ref.split('w').join(wall), `${loc.id}: fila ${y} del trazado cambiada`);
    assert.equal(loc.ground[y].length, ref.length, `${loc.id}: ancho de la fila ${y}`);
    [...ref].forEach((ch, x) => {
      const got = loc.ground[y][x];
      if (ch === 'w' && TILES[got]?.wall) assert.equal(got, wall, `${loc.id}: muro (${x},${y}) con «${got}», no el suyo «${wall}»`);
    });
  });

  // Lo que controla MET-03 (anuncios con su variante, rótulo y extras) está tal cual en LOCATIONS.
  const styled = gen.props.filter((p) => p.kind === 'poster' || p.kind === 'metro-subsign');
  const extras = style.extraProps;
  const extraPlacements = gen.props.slice(gen.props.length - extras.length);
  for (const p of [...styled, ...extraPlacements]) {
    assert.ok(loc.props.some((q) => JSON.stringify(q) === JSON.stringify(p)), `${loc.id}: falta en LOCATIONS ${JSON.stringify(p)}`);
  }

  // Extras: sólo en la lista blanca, sin pisar otro prop ni ningún punto con nombre.
  const pending = extraPlacements.map((p) => JSON.stringify(p));
  const base = loc.props.filter((q) => {
    const i = pending.indexOf(JSON.stringify(q));
    if (i < 0) return true;
    pending.splice(i, 1);
    return false;
  });
  const named = points({ npcs: loc.npcs, metro: loc.metro, spawns: loc.spawns, portals: loc.portals, terminals: loc.terminals, points: loc.points });
  const baseCells = new Set(base.flatMap(cells));
  const baseLoc: LocationDef = { ...loc, id: `${loc.id}#sin-extras`, props: base };
  const before = reachable(baseLoc);
  for (const p of extras) {
    const k = key(p);
    if (p.kind === 'poster') {
      assert.ok(wallOk.has(k), `${loc.id}: cartel extra en ${k}, fuera de la lista blanca de muro`);
      for (const c of cells(p)) {
        const [cx, cy] = c.split(',').map(Number);
        assert.ok(TILES[loc.ground[cy]?.[cx]]?.wall, `${loc.id}: cartel extra en ${k} sale del muro (${c})`);
      }
    } else {
      assert.ok(floorOk.has(k), `${loc.id}: ${p.kind} extra en ${k}, fuera de la lista blanca de suelo`);
      assert.ok(isWalkable(baseLoc, p.tx, p.ty) && before.has(k), `${loc.id}: ${k} no era transitable antes del extra`);
      assert.ok(!named.has(k), `${loc.id}: ${k} es un punto con nombre (NPC, espera, ronda, spawn, portal)`);
    }
    for (const c of cells(p)) assert.ok(!baseCells.has(c), `${loc.id}: el extra de ${k} pisa otro prop en ${c}`);
  }
  // Con los extras puestos se llega a todo lo de antes salvo a sus tiles: andén, tornos, esperas, embarque y salida.
  const after = reachable(loc);
  const placed = new Set(extras.filter((p) => p.kind !== 'poster').map(key));
  for (const k of before) assert.ok(placed.has(k) || after.has(k), `${loc.id}: con los extras ya no se llega a ${k}`);
  for (const p of [board, exit, ...loc.metro!.waitingSpots, ...loc.metro!.gates]) {
    assert.ok(after.has(key(p)), `${loc.id}: ${key(p)} (andén, torno o salida) inalcanzable`);
  }

  // Rótulo secundario: se escribe entero y cabe en su panel (texto a 1 px + 3 px de margen a cada lado).
  if (style.subSign) {
    const t = style.subSign.text;
    assert.ok(canSpell(t), `${loc.id}: rótulo «${t}»: falta el glifo ${missingGlyphs(t).join(', ')}`);
    const room = (PROPS['metro-subsign'].tilesWide ?? 1) * TILE;
    assert.ok(wordWidth(t, 1) + 6 <= room, `${loc.id}: rótulo «${t}» ocupa ${wordWidth(t, 1) + 6} px, cabe ${room}`);
    const sub = loc.props.filter((p) => p.kind === 'metro-subsign');
    assert.equal(sub.length, 1, `${loc.id}: un rótulo secundario`);
    const others = new Set(base.filter((b) => b !== sub[0]).flatMap(cells));
    for (const c of cells(sub[0])) assert.ok(!others.has(c), `${loc.id}: el rótulo secundario pisa otro prop en ${c}`);
  } else {
    assert.ok(!loc.props.some((p) => p.kind === 'metro-subsign'), `${loc.id}: rótulo secundario sin dato`);
  }
}

console.log(`check-station-variety: ${stations.length} andenes con estilo propio, variados, deterministas y transitables`);
