// Recorre el mundo con las mismas reglas de colisión que el juego: `npm run check`.
// Importar LocationSystem ya valida cada localización; aquí se comprueba además
// que todo lo que importa se alcanza a pie y que el grafo de peatones conecta.
import assert from 'node:assert/strict';
import { allLocations, isWalkable, ROADWAY } from '../src/systems/LocationSystem.ts';
import { findPoint, pointsOfKind, route, worldRoute } from '../src/systems/Navigation.ts';
import { isOpen, placeInfo, placeOfPoint, placesOfType } from '../src/systems/Places.ts';
import type { LocationDef, TilePoint } from '../src/types/game.ts';

// Juego: PLAYER_SPEED 76 px/s, TILE 16 → 4,75 tiles/s; el reloj corre 2 min por segundo.
const TILES_PER_S = 76 / 16;

/** Tiles alcanzables a pie desde un punto, en cuatro direcciones; con withNpcs, los NPC estorban. */
function reach(loc: LocationDef, from: TilePoint, withNpcs: boolean): Set<string> {
  const npcs = new Set(withNpcs ? loc.npcs.map((n) => `${n.tx},${n.ty}`) : []);
  const seen = new Set<string>([`${from.tx},${from.ty}`]);
  const queue: TilePoint[] = [from];
  while (queue.length > 0) {
    const { tx, ty } = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + dx;
      const ny = ty + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key) || npcs.has(key) || !isWalkable(loc, nx, ny)) continue;
      seen.add(key);
      queue.push({ tx: nx, ty: ny });
    }
  }
  return seen;
}

let tiles = 0;
for (const loc of allLocations()) {
  const origin = loc.spawns.start ?? loc.spawns.entry ?? Object.values(loc.spawns)[0];
  assert.ok(origin, `[${loc.id}] sin spawn de entrada`);
  // Puertas y spawns, con los NPC en su sitio: uno mal puesto bloquearía al jugador.
  // Los puntos, sin ellos: un puesto de trabajo es precisamente donde está el NPC.
  const player = reach(loc, origin, true);
  const free = reach(loc, origin, false);
  tiles += player.size;
  const check = (set: Set<string>, what: string, p: TilePoint): void =>
    assert.ok(set.has(`${p.tx},${p.ty}`), `[${loc.id}] no se llega a pie a ${what} (${p.tx},${p.ty})`);
  const must = (what: string, p: TilePoint): void => check(player, what, p);

  for (const [id, s] of Object.entries(loc.spawns)) must(`spawn ${id}`, s);
  // Las puertas del tren dependen de dónde pare; su fila de borde de andén sí debe alcanzarse.
  for (const portal of loc.portals) must(`portal ${portal.id}`, portal.train ? { tx: 11, ty: portal.ty } : portal);
  for (const [id, pt] of Object.entries(loc.points ?? {})) check(free, `punto ${id}`, pt);
}

// El grafo del barrio conecta cada destino con cada borde.
const destinations = [...pointsOfKind('entrance', 'district'), ...pointsOfKind('seat', 'district'), ...pointsOfKind('meet', 'district'), ...pointsOfKind('wait', 'district')];
for (const d of destinations) {
  assert.ok(route('HOME_ENTRANCE', d.id), `sin camino de casa a ${d.id}`);
  assert.ok(route(d.id, 'EDGE_AVENIDA_NE'), `sin camino de ${d.id} a la ciudad`);
}
for (const id of ['HOME_EXIT', 'CAFE_TABLE_01', 'GYM_TRAINING_ZONE', 'CLOTHING_STORE_TILL', 'METRO_ENTRANCE', 'OFFICE_ENTRANCE', 'PARK_BENCH_01']) {
  assert.ok(findPoint(id), `falta el punto ${id}`);
}

const length = (path: TilePoint[]): number =>
  path.slice(1).reduce((sum, q, i) => sum + Math.hypot(q.tx - path[i].tx, q.ty - path[i].ty), 0);
console.log(`${allLocations().length} localizaciones · ${tiles} tiles alcanzables · ${destinations.length} destinos en el barrio\n`);
for (const [label, a, b] of [
  ['casa → metro', 'HOME_ENTRANCE', 'METRO_ENTRANCE'],
  ['casa → cafetería', 'HOME_ENTRANCE', 'CAFE_ENTRANCE'],
  ['casa → gimnasio', 'HOME_ENTRANCE', 'GYM_ENTRANCE'],
  ['casa → súper', 'HOME_ENTRANCE', 'SUPERMARKET_ENTRANCE'],
  ['casa → oficinas', 'HOME_ENTRANCE', 'OFFICE_ENTRANCE'],
  ['metro → tienda de ropa', 'METRO_ENTRANCE', 'CLOTHING_STORE_ENTRANCE'],
  ['oficinas → restaurante', 'OFFICE_ENTRANCE', 'RESTAURANT_ENTRANCE'],
  ['gimnasio → cafetería', 'GYM_ENTRANCE', 'CAFE_ENTRANCE'],
  ['casa → parque', 'HOME_ENTRANCE', 'PARK_BENCH_01'],
]) {
  const path = route(a, b);
  assert.ok(path, `sin camino ${label}`);
  const s = length(path) / TILES_PER_S;
  console.log(`${label.padEnd(26)} ${String(Math.round(length(path))).padStart(3)} tiles  ${s.toFixed(0).padStart(2)} s  ${String(Math.round(s * 2)).padStart(2)} min de juego`);
}
// ------------------------------------------------------ preparación para NPC

// Metadata: cada lugar se resuelve y tiene por dónde entrar y a dónde ir.
for (const type of ['home', 'residence', 'business', 'transit', 'public'] as const) {
  for (const place of placesOfType(type)) {
    assert.ok(place.entrances.length > 0, `${place.id}: sin entrada`);
    assert.ok(!place.interior || place.type === 'transit' || place.npcDestinations.length > 0, `${place.id}: interior sin destinos`);
  }
}
// Cualquier vivienda llega a cualquier negocio y al metro, y vuelve.
for (const home of [...placesOfType('home'), ...placesOfType('residence')]) {
  for (const target of [...placesOfType('business'), ...placesOfType('transit'), ...placesOfType('public')]) {
    assert.ok(worldRoute(home.entrances[0], target.entrances[0]), `${home.id} → ${target.id}`);
    assert.ok(worldRoute(target.entrances[0], home.entrances[0]), `${target.id} → ${home.id}`);
  }
}

/**
 * Cinco días tipo, escritos como los escribirá el sistema de personajes: hora
 * y punto con nombre. Cada tramo tiene que existir y el lugar tiene que estar
 * abierto al llegar. Si esto falla, el mundo no está listo para ellos.
 */
const ROUTINES: Record<string, [string, string][]> = {
  'vecina de Olmo 11 (el ejemplo)': [['08:00', 'RES_OLMO_11_ENTRANCE'], ['08:10', 'CAFE_TABLE_02'], ['08:40', 'METRO_ENTRANCE'], ['18:30', 'METRO_ENTRANCE'], ['18:45', 'GYM_TREADMILL_01'], ['20:00', 'RES_OLMO_11_ENTRANCE']],
  'cajera del súper': [['08:20', 'RES_MAYOR_9_ENTRANCE'], ['08:30', 'SUPERMARKET_CASHIER'], ['14:00', 'RESTAURANT_TABLE_03'], ['15:00', 'SUPERMARKET_CASHIER'], ['21:50', 'RES_MAYOR_9_ENTRANCE']],
  'oficinista que llega en metro': [['08:40', 'METRO_ENTRANCE'], ['08:50', 'OFFICE_DESK_03'], ['13:30', 'RESTAURANT_TABLE_01'], ['14:30', 'OFFICE_DESK_03'], ['18:20', 'METRO_ENTRANCE']],
  'jubilado de Avenida 20': [['10:00', 'RES_AVENIDA_20_ENTRANCE'], ['10:15', 'PLAZA_BENCH_02'], ['11:00', 'NEWS_KIOSK'], ['12:00', 'PARK_BENCH_02'], ['13:30', 'RES_AVENIDA_20_ENTRANCE']],
  'estudiante de Olmo 3': [['08:30', 'RES_OLMO_3_ENTRANCE'], ['09:00', 'STUDY_CENTER_ENTRANCE'], ['14:00', 'CAFE_COUNTER'], ['17:00', 'CLOTHING_STORE_RACK_02'], ['19:00', 'PARK_COURT'], ['21:00', 'RES_OLMO_3_ENTRANCE']],
};
const lateness: string[] = [];
const minutes = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
console.log('');
for (const [who, steps] of Object.entries(ROUTINES)) {
  let walked = 0;
  for (let i = 1; i < steps.length; i++) {
    const [, from] = steps[i - 1];
    const [at, to] = steps[i];
    const legs = worldRoute(from, to);
    assert.ok(legs, `${who}: no hay camino de ${from} a ${to}`);
    const tiles = legs.reduce((sum, leg) => sum + length(leg.path), 0);
    const walk = Math.round((tiles / TILES_PER_S) * 2);
    walked += walk;
    const place = placeOfPoint(to);
    const arrive = minutes(at);
    // El personal entra antes de abrir: sólo a los clientes se les exige que esté abierto.
    const staff = findPoint(to)?.kind === 'work';
    assert.ok(staff || !place || isOpen(place, 1, Math.floor(arrive / 60), arrive % 60), `${who}: ${place?.name} está cerrado a las ${at}`);
    // Llegar tarde no rompe el mundo, pero hay que saberlo antes de escribir horarios.
    const late = minutes(steps[i - 1][0]) + walk - arrive;
    if (late > 0) lateness.push(`  ${who}: llega a ${to} ${late} min tarde (${walk} min andando)`);
  }
  console.log(`rutina ${who.padEnd(32)} ${steps.length - 1} tramos · ${walked} min andando`);
}
if (lateness.length > 0) console.log(`\nhorarios más cortos que el paseo:\n${lateness.join('\n')}`);
assert.ok(placeInfo('cafe')?.npcDestinations.includes('CAFE_TERRACE_01'), 'la terraza es del café');
// El grafo de peatones no pisa calzada salvo en un paso de peatones: quien lo sigue (vecinos, personajes,
// gente de la calle) no camina por el asfalto ni por el carril bici.
for (const loc of allLocations()) {
  const pts = loc.points ?? {};
  for (const [a, b] of loc.links ?? []) {
    const pa = pts[a];
    const pb = pts[b];
    const steps = Math.max(1, Math.ceil(Math.hypot(pb.tx - pa.tx, pb.ty - pa.ty) * 4));
    for (let i = 0; i <= steps; i++) {
      const x = Math.floor(pa.tx + 0.5 + ((pb.tx - pa.tx) * i) / steps);
      const y = Math.floor(pa.ty + 0.5 + ((pb.ty - pa.ty) * i) / steps);
      const ch = loc.ground[y][x];
      assert.ok(!ROADWAY.has(ch) || ch === 'z', `[${loc.id}] el tramo ${a}–${b} va por la calzada en ${x},${y} («${ch}»)`);
    }
  }
  for (const [id, p] of Object.entries(pts)) {
    if (p.kind !== 'path') assert.ok(!ROADWAY.has(loc.ground[p.ty][p.tx]), `[${loc.id}] ${id} (${p.kind}) está en la calzada`);
  }
}

console.log('\nOK: todo alcanzable, grafo conectado y por la acera, lugares resueltos, rutinas posibles.');
