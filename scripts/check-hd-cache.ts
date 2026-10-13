// La caché de la ropa de 28 × 42 (world/HdCache): `npm run check`. Con un dibujante falso que apunta lo que hace:
// retener no hornea (el pool no gasta), se hornea por celdas con presupuesto, lo guardado se reutiliza, lo retenido no
// se tira nunca, se tira lo menos usado al pasarse del límite y lo tirado se vuelve a hacer igual al volver a salir.
import assert from 'node:assert/strict';
import { HdCache, type HdBackend } from '../src/world/HdCache.ts';

const CELLS = 8;
const log: string[] = [];
const textures = new Set<string>();
/** Celdas pintadas en la textura actual de cada aspecto, y en total. */
const painted = new Map<string, number>();
let cellsPainted = 0;
const backend: HdBackend = {
  create: (id) => {
    assert.ok(!textures.has(id), `${id}: textura creada dos veces`);
    textures.add(id);
    painted.set(id, 0);
    log.push(`create ${id}`);
  },
  paint: (id, cell) => {
    assert.ok(textures.has(id), `${id}: pinta sin textura`);
    assert.ok(cell >= 0 && cell < CELLS);
    painted.set(id, (painted.get(id) ?? 0) + 1);
    cellsPainted++;
  },
  done: (id) => log.push(`done ${id}`),
  drop: (id) => {
    assert.ok(textures.delete(id), `${id}: tira lo que no existe`);
    log.push(`drop ${id}`);
  },
};
// Caben tres guardadas.
const cache = new HdCache(backend, CELLS, 100, 300);
// Un reloj falso: cada celda cuesta 1 ms.
let clock = 0;
const step = (budget: number): number => {
  const before = cellsPainted;
  const n = cache.pump(budget, () => clock);
  clock += n;
  assert.equal(cellsPainted - before, n, 'pump no cuenta bien lo que pinta');
  return n;
};
const bake = (id: string): void => {
  cache.acquire(id);
  for (let i = 0; i < 50 && !cache.ready(id); i++) step(CELLS);
  assert.ok(cache.ready(id), `${id} no llega a estar lista`);
};

// 1. Retener no hornea nada (crear sprites o guardarlos en el pool no cuesta): sólo pump.
cache.acquire('a');
assert.equal(textures.size, 0, 'retener ha creado una textura');
assert.equal(cache.ready('a'), false);
assert.equal(cache.pending, 1);

// 2. Por celdas, con presupuesto: con 3 ms (el reloj avanza 1 ms por consulta), como mucho tres; lista sólo al
// final, y `done` una vez.
const n = cache.pump(3, () => clock++);
assert.ok(n >= 1 && n <= 3, `presupuesto no respetado: ${n} celdas`);
assert.equal(cache.ready('a'), false);
while (!cache.ready('a')) step(3);
assert.equal(painted.get('a'), CELLS, 'celdas pintadas de más o de menos');
assert.deepEqual(log, ['create a', 'done a']);
// Siempre avanza: aunque el presupuesto sea 0, pinta una celda.
cache.acquire('z');
assert.equal(step(0), 1);
cache.release('z');
assert.equal(cache.pending, 0, 'lo que nadie retiene no se hornea');

// 3. Reutilizar: soltar y volver a retener no la rehace.
cache.release('a');
assert.equal(cache.ready('a'), true, 'soltada sin pasarse del límite: se queda');
cache.acquire('a');
assert.equal(cache.ready('a'), true);
assert.equal(step(10), 0, 'la ha vuelto a hornear');
assert.equal(log.filter((l) => l === 'create a').length, 1);
cache.release('a');

// 4. Lo retenido no se tira nunca, aunque se pase del límite.
log.length = 0;
for (const id of ['b', 'c', 'd', 'e']) bake(id);
assert.ok(cache.bytes > cache.limitBytes, 'debería pasarse del límite con todo retenido');
for (const id of ['b', 'c', 'd', 'e']) assert.ok(cache.ready(id) && textures.has(id), `${id}: tirada estando en uso`);
// Al pasarse se fue lo que nadie retenía (la 'z' a medias y la 'a'), y nada en uso.
assert.ok(!textures.has('a') && !textures.has('z'), 'lo suelto debería haberse tirado');
assert.ok(log.every((l) => !/^drop [bcde]$/.test(l)), `tiró algo en uso: ${log.join(', ')}`);

// 5. Soltarlas: se tira lo menos usado hasta caber, en orden.
log.length = 0;
cache.release('c');
cache.release('b');
cache.release('e');
cache.release('d');
assert.equal(cache.bytes, 300, 'no ha vuelto al límite');
assert.deepEqual(log.filter((l) => l.startsWith('drop')), ['drop c'], 'debió tirar la soltada hace más tiempo');
// Usar una la vuelve reciente: la siguiente en irse es otra.
cache.acquire('b');
cache.release('b');
bake('f');
assert.deepEqual(log.filter((l) => l.startsWith('drop')), ['drop c', 'drop e'], 'el orden no es el de menos uso');

// 6. Tirada y vuelta a salir: se hace otra vez, entera (sus celdas, y `done` rehace sus animaciones).
log.length = 0;
bake('c');
assert.deepEqual(log.filter((l) => l.endsWith(' c')), ['create c', 'done c']);
assert.equal(painted.get('c'), CELLS);

// 7. Repintar (otra apariencia, lifesim.clothes()): todas sus celdas otra vez, sin crear ni tirar.
log.length = 0;
painted.set('c', 0);
cache.repaint('c');
assert.equal(painted.get('c'), CELLS);
assert.deepEqual(log, ['done c']);

// 8. Recorrer el mundo: doscientos aspectos que salen y entran no se acumulan; lo guardado nunca pasa del límite
// más lo que se está viendo, y lo que se ve nunca se tira.
for (const id of [...textures]) cache.release(id);
let seed = 7;
const rand = (k: number): number => {
  seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
  return seed % k;
};
const onScreen = new Set<string>();
let peak = 0;
for (let t = 0; t < 4_000; t++) {
  const id = `v${rand(200)}`;
  if (onScreen.has(id)) {
    cache.release(id);
    onScreen.delete(id);
  } else if (onScreen.size < 12) {
    cache.acquire(id);
    onScreen.add(id);
  }
  step(4);
  peak = Math.max(peak, textures.size);
  assert.ok(textures.size <= Math.max(3, onScreen.size), `se acumulan: ${textures.size} texturas con ${onScreen.size} a la vista`);
  for (const s of onScreen) assert.ok(!cache.ready(s) || textures.has(s), `${s}: tirada mientras se ve`);
}
assert.equal(textures.size, cache.size, 'la caché y las texturas no cuadran');
console.log(`OK: retener no hornea, presupuesto por celdas, reutiliza, protege lo que se ve, tira por menos uso y lo rehace; paseo de 4000 pasos por 200 aspectos: pico de ${peak} texturas con hasta 12 a la vista y sitio para 3.`);
