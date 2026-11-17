// CAS-08 · el Casco Antiguo con cara de casco: `npm run check`. Falla si el estilo 'res-historic' sale de su barrio, si
// las ocho casas viejas de la Calle Mayor (cuatro por acera) cambian de sitio, puerta o fachada, si faltan los cuatro
// rincones con historia (placa, árbol del mercado, farol de gas y Rincón del Rastro) o caen en un puesto del Gran Rastro,
// una puerta o un point, o se quedan sin sitio pisable al lado, o si la Calle del Rastro deja de ser adoquín o se llena
// su fila de paso. Que los puestos no corten el paso lo vigila
// scripts/check-gran-rastro-bloqueo.ts, que recorre el barrio entero (ya con la placa nueva).
import assert from 'node:assert/strict';
import { POPUPS } from '../src/data/popups.ts';
import { allLocations, doorRow, getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { popUpStalls } from '../src/systems/PopUps.ts';

const ID = 'casco-antiguo';
const STALL_TILES = 2;
const loc = getLocation(ID);
const key = (tx: number, ty: number): string => `${tx},${ty}`;

// 1) 'res-historic' sólo en el Casco Antiguo.
for (const l of allLocations()) {
  for (const b of l.buildings ?? []) if (b.style === 'res-historic') assert.equal(l.id, ID, `${b.id} es 'res-historic' fuera del Casco Antiguo (${l.id})`);
}

// 2) Las fachadas 'res-historic': mismo sitio, misma puerta y mirando a su calle. NORTE, las cuatro de la acera norte
// (front 's', cuatro tonos distintos); SUR, las cuatro de la acera sur (CAS-08b, front 'n').
type Facade = readonly [number, number, number, number, number];
const NORTE: Record<string, Facade> = {
  'cas-res-1': [0, 2, 6, 7, 2],
  'cas-res-2': [11, 2, 5, 7, 13],
  'cas-res-3': [27, 2, 6, 7, 29],
  'cas-res-12': [45, 2, 6, 7, 47],
};
const SUR: Record<string, Facade> = {
  'cas-res-4': [0, 26, 6, 8, 3],
  'cas-res-8': [23, 26, 5, 8, 25],
  'cas-res-11': [39, 26, 5, 8, 41],
  'cas-res-13': [46, 26, 6, 8, 48],
};
const facades = (set: Record<string, Facade>, side: 's' | 'n'): (number | undefined)[] =>
  Object.entries(set).map(([id, [tx, ty, w, h, doorX]]) => {
    const b = (loc.buildings ?? []).find((x) => x.id === id);
    assert.ok(b, `falta ${id}`);
    assert.equal(b.style, 'res-historic', `${id} no es 'res-historic'`);
    assert.deepEqual([b.tx, b.ty, b.w, b.h, b.doorX, b.front], [tx, ty, w, h, doorX, side], `${id} cambió de rect, puerta o fachada`);
    assert.ok(b.tone !== undefined, `${id} 'res-historic' sin tono`);
    return b.tone;
  });
// Las del norte, cada una con su revoco: cuatro tonos fijos y distintos.
const tones = facades(NORTE, 's');
assert.equal(new Set(tones).size, tones.length, `fachadas 'res-historic' del norte con el mismo tono: ${tones.join(',')}`);
facades(SUR, 'n');
// Dos casas 'res-historic' pegadas en la misma acera no comparten tono.
const hist = (loc.buildings ?? []).filter((x) => x.style === 'res-historic');
for (const a of hist) {
  for (const c of hist) {
    if (a.front === c.front && a.ty === c.ty && a.tx + a.w === c.tx) assert.notEqual(a.tone, c.tone, `${a.id} y ${c.id}, adyacentes, con el mismo tono`);
  }
}

// El letrero de la calle, delante de una vivienda (ni escaparates ni rótulos de local).
// (La del inspect: systems/Dressing pone otras junto a los bolardos.)
const plate = (loc.inspects ?? []).find((x) => x.name === 'Placa de calle');
assert.ok(plate, 'falta el inspect de la placa');
const s = (loc.props ?? []).find((p) => p.kind === 'street-sign' && p.tx === plate.tx && p.ty === plate.ty);
assert.ok(s, `no hay 'street-sign' bajo la placa (${plate.tx},${plate.ty})`);
const front = (loc.buildings ?? []).find((b) => s.tx >= b.tx && s.tx < b.tx + b.w && b.ty + b.h <= s.ty && b.ty + b.h >= s.ty - 1);
assert.ok(front, `la placa (${s.tx},${s.ty}) no está delante de ningún edificio`);
assert.ok(front.style.startsWith('res-'), `la placa (${s.tx},${s.ty}) está delante de ${front.id}, que no es vivienda`);
assert.notEqual(s.tx, front.doorX, `la placa (${s.tx},${s.ty}) tapa la puerta de ${front.id}`);

// Y en todo el mundo (props escritos y los que ya trae puestos systems/Dressing): ningún 'street-sign' en la fila de
// acera delante de un local (estilo que no empieza por 'res-'), dentro de su tramo x. Se listan todos los que fallen.
const signClash: string[] = [];
for (const l of allLocations()) {
  for (const p of l.props ?? []) {
    if (p.kind !== 'street-sign') continue;
    for (const b of l.buildings ?? []) {
      const row = doorRow(b) + (b.front === 'n' ? -1 : 1);
      if (!b.style.startsWith('res-') && p.ty === row && p.tx >= b.tx && p.tx < b.tx + b.w) signClash.push(`${l.id}: (${p.tx},${p.ty}) delante de ${b.id} (${b.style})`);
    }
  }
}
assert.deepEqual(signClash, [], `letreros de calle delante de escaparates:\n${signClash.join('\n')}`);

// 3) Los tres rincones: existen, fuera de puestos, puertas y points, y con una tile pisable al lado.
const stalls = popUpStalls(POPUPS.find((p) => p.id === 'gran-rastro')!);
const taken = new Set<string>();
for (const s of stalls) for (let dx = 0; dx < STALL_TILES; dx++) taken.add(key(s.tx + dx, s.ty));
for (const a of loc.stallAnchors ?? []) for (let dx = 0; dx < STALL_TILES; dx++) taken.add(key(a.tx + dx, a.ty));
const doors = new Set((loc.buildings ?? []).map((b) => key(b.doorX, doorRow(b))));
const points = new Set(Object.values(loc.points ?? {}).map((p) => key(p.tx, p.ty)));
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const INSPECTS = ['Placa de calle', 'El árbol del mercado', 'Farol de gas', 'Rincón del Rastro'];
for (const name of INSPECTS) {
  const i = (loc.inspects ?? []).find((x) => x.name === name);
  assert.ok(i, `falta el inspect «${name}»`);
  const k = key(i.tx, i.ty);
  assert.ok(!taken.has(k), `«${name}» (${k}) cae en un puesto del Gran Rastro`);
  assert.ok(!doors.has(k), `«${name}» (${k}) cae en una puerta`);
  assert.ok(!points.has(k), `«${name}» (${k}) cae en un point`);
  assert.ok(DIRS.some(([dx, dy]) => isWalkable(loc, i.tx + dx, i.ty + dy)), `«${name}» (${k}) sin tile pisable al lado`);
}

// 4) La Calle del Rastro, adoquinada de punta a punta.
for (const y of [34, 35]) assert.ok(/^P+$/.test(loc.ground[y]), `la fila ${y} de la Calle del Rastro no es toda 'P'`);

// 5) El Rincón del Rastro (CAS-08b): un banco y dos macetas en la fila 34, x 19–23; la fila 35, sin props (es el paso).
const rincon = (kind: string): number => (loc.props ?? []).filter((p) => p.kind === kind && p.ty === 34 && p.tx >= 19 && p.tx <= 23).length;
assert.equal(rincon('bench'), 1, `el Rincón del Rastro no tiene exactamente 1 banco`);
assert.equal(rincon('planter-box'), 2, `el Rincón del Rastro no tiene exactamente 2 macetas`);
const row35 = (loc.props ?? []).filter((p) => p.ty === 35).map((p) => `${p.kind} (${p.tx},35)`);
assert.deepEqual(row35, [], `props en la fila 35 de la Calle del Rastro: ${row35.join(', ')}`);

console.log(`check-casco-historico: ${Object.keys(NORTE).length + Object.keys(SUR).length} fachadas 'res-historic' · ${INSPECTS.length} inspects · Calle del Rastro adoquinada con su rincón`);
