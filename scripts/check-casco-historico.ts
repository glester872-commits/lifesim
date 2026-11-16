// CAS-08 · el Casco Antiguo con cara de casco: `npm run check`. Falla si el estilo 'res-historic' sale de su barrio, si
// las cuatro casas viejas de la Calle Mayor cambian de sitio, puerta o fachada, si faltan los tres rincones con historia
// (placa, árbol del mercado y farol de gas) o caen en un puesto del Gran Rastro, una puerta o un point, o se quedan sin
// sitio pisable al lado, o si la Calle del Rastro deja de ser adoquín. Que los puestos no corten el paso lo vigila
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

// 2) Las cuatro fachadas de la acera norte: mismo sitio, misma puerta, mirando a la calle.
const FACADES: Record<string, readonly [number, number, number, number, number]> = {
  'cas-res-1': [0, 2, 6, 7, 2],
  'cas-res-2': [11, 2, 5, 7, 13],
  'cas-res-3': [27, 2, 6, 7, 29],
  'cas-res-12': [45, 2, 6, 7, 47],
};
for (const [id, [tx, ty, w, h, doorX]] of Object.entries(FACADES)) {
  const b = (loc.buildings ?? []).find((x) => x.id === id);
  assert.ok(b, `falta ${id}`);
  assert.equal(b.style, 'res-historic', `${id} no es 'res-historic'`);
  assert.deepEqual([b.tx, b.ty, b.w, b.h, b.doorX, b.front], [tx, ty, w, h, doorX, 's'], `${id} cambió de rect, puerta o fachada`);
}
// Cada una con su revoco: cuatro tonos fijos y distintos.
const tones = Object.keys(FACADES).map((id) => (loc.buildings ?? []).find((x) => x.id === id)?.tone);
assert.ok(tones.every((t) => t !== undefined), `alguna fachada 'res-historic' sin tono: ${tones.join(',')}`);
assert.equal(new Set(tones).size, tones.length, `fachadas 'res-historic' con el mismo tono: ${tones.join(',')}`);

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

// 3) Los tres rincones: existen, fuera de puestos, puertas y points, y con una tile pisable al lado.
const stalls = popUpStalls(POPUPS.find((p) => p.id === 'gran-rastro')!);
const taken = new Set<string>();
for (const s of stalls) for (let dx = 0; dx < STALL_TILES; dx++) taken.add(key(s.tx + dx, s.ty));
for (const a of loc.stallAnchors ?? []) for (let dx = 0; dx < STALL_TILES; dx++) taken.add(key(a.tx + dx, a.ty));
const doors = new Set((loc.buildings ?? []).map((b) => key(b.doorX, doorRow(b))));
const points = new Set(Object.values(loc.points ?? {}).map((p) => key(p.tx, p.ty)));
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
for (const name of ['Placa de calle', 'El árbol del mercado', 'Farol de gas']) {
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

console.log(`check-casco-historico: ${Object.keys(FACADES).length} fachadas 'res-historic' · 3 inspects · Calle del Rastro adoquinada`);
