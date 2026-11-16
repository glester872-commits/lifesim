// CA-01 (data/campoAlto.ts): la pista del barrio y la calistenia del parque de Campo Alto. Datos como en la Ribera,
// se llega andando desde el metro y el café, y se entrena con systems/Fitness de siempre.
import assert from 'node:assert/strict';
import { getLocation, validate } from '../src/systems/LocationSystem.ts';
import { tilePath } from '../src/systems/Navigation.ts';
import { parseFitness, quote, START_FITNESS, train } from '../src/systems/Fitness.ts';

const ID = 'campo-alto';
const street = getLocation(ID);
validate(street);

// Suelo: la pista ('k') y el caucho de la calistenia ('m').
const ground = street.ground.join('');
assert.ok(ground.includes('k') && ground.includes('m'), 'falta el suelo de la pista o de la calistenia');

// Props: canastas en la pista, barras y bancos en la calistenia.
const props = street.props ?? [];
const inBox = (x0: number, y0: number, x1: number, y1: number) => (p: { tx: number; ty: number }): boolean => p.tx >= x0 && p.tx <= x1 && p.ty >= y0 && p.ty <= y1;
const court = inBox(5, 16, 11, 20);
const cali = inBox(32, 17, 38, 23);
assert.ok(props.filter((p) => p.kind === 'hoop' && court(p)).length >= 2, 'menos de dos canastas en la pista');
assert.ok(props.filter((p) => p.kind === 'pullup-bar' && cali(p)).length >= 2, 'menos de dos barras');
assert.ok(props.filter((p) => p.kind === 'bench' && cali(p)).length >= 2, 'menos de dos bancos en la calistenia');

// Los árboles del parque siguen donde estaban.
// El árbol de (8,21) tapaba el borde de la pista: se movió a (1,21), al borde oeste del parque.
const TREES = [[3, 18], [1, 21], [4, 22], [12, 17], [36, 17], [40, 20], [44, 18], [38, 22], [45, 22]] as const;
for (const [x, y] of TREES) assert.ok(props.some((p) => p.kind === 'tree' && p.tx === x && p.ty === y), `falta el árbol (${x},${y})`);

// Sólo colisiona la fila base de cada prop (world/tiles.ts). Ancho: la barra ocupa dos tiles; el resto de los de aquí, uno.
// ponytail: anchos copiados de world/tiles.ts para no arrastrar Phaser al script; si cambian, actualizar aquí.
const WIDE: Readonly<Record<string, number>> = { 'pullup-bar': 2 };
const blocked = new Set(props.flatMap((p) => Array.from({ length: WIDE[p.kind] ?? 1 }, (_, i) => `${p.tx + i},${p.ty}`)));

// Los puestos: interact con su `use`, sin prop encima.
const points = street.points ?? {};
const stations = Object.entries(points).filter(([id]) => /^CA_(HOOPS|PULLUP)_\d+$/.test(id));
assert.equal(stations.filter(([id]) => id.startsWith('CA_HOOPS_')).length, 2, 'faltan tiradores');
assert.equal(stations.filter(([id]) => id.startsWith('CA_PULLUP_')).length, 4, 'faltan puestos de dominadas');
for (const [id, pt] of stations) {
  assert.equal(pt.kind, 'interact', `${id} no es interact`);
  assert.ok(pt.use === 'hoops' || pt.use === 'pullup', `${id} sin use válido`);
  assert.ok(!blocked.has(`${pt.tx},${pt.ty}`), `${id} está debajo de un prop`);
}

// Ni las puertas del café y del metro quedan tapadas.
const cafe = street.buildings!.find((b) => b.id === 'ca-cafe')!;
const station = getLocation('campo-alto-station');
const out = station.portals.find((p) => !p.train)!;
const metroSpawn = street.spawns[out.to.spawn];
const cafeSpawn = street.spawns[cafe.id];
assert.ok(metroSpawn && cafeSpawn, 'faltan los spawns del metro o del café');
for (const s of [metroSpawn, cafeSpawn]) assert.ok(!blocked.has(`${s.tx},${s.ty}`), 'un prop tapa una puerta');

// Se llega andando desde el metro y desde el café a cada puesto, y de cada puesto se sale por un borde.
const edges = Object.values(points).filter((p) => p.kind === 'edge');
assert.ok(edges.length > 0, 'sin bordes');
for (const [id, pt] of stations) {
  assert.ok(tilePath(street, metroSpawn, pt), `${id}: no se llega desde el metro`);
  assert.ok(tilePath(street, cafeSpawn, pt), `${id}: no se llega desde el café`);
  assert.ok(edges.some((e) => tilePath(street, pt, e)), `${id}: no se sale a ningún borde`);
}

// Fitness: se puede entrenar en los dos puestos y deja huella.
for (const st of ['pullup', 'hoops'] as const) {
  const q = quote(START_FITNESS, st, 'normal', 100);
  assert.ok(q.minutes > 0 && q.energy > 0 && q.blocked === null, `${st}: quote ${JSON.stringify(q)}`);
  const { next } = train(START_FITNESS, st, 'normal', 1, 600, 1, 100);
  assert.ok(next.fatigue > START_FITNESS.fatigue, `${st}: no cansa`);
  const gained = st === 'pullup'
    ? next.strength > START_FITNESS.strength
    : next.fitness + next.stamina > START_FITNESS.fitness + START_FITNESS.stamina;
  assert.ok(gained, `${st}: no sube lo que entrena`);
  assert.deepEqual(parseFitness(JSON.parse(JSON.stringify(next))), next, `${st}: el guardado no da la vuelta`);
}
for (const raw of [undefined, {}]) {
  const f = parseFitness(raw);
  assert.ok(Number.isFinite(f.fitness) && Number.isFinite(f.strength) && Number.isFinite(f.fatigue), 'parseFitness inválido');
}

console.log(`check-campo-alto-sport: ok (${stations.length} puestos, pista y calistenia alcanzables, fitness pullup/hoops)`);
