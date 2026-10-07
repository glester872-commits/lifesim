// La escala del mundo (config/scale.ts): peatón < bici < coche < autobús, puertas que caben una persona, carriles
// y aceras del tamaño de lo que va por ellos, mobiliario a la medida de quien lo usa. `node scripts/check-scale.ts`.
import assert from 'node:assert/strict';
import { SCALE } from '../src/config/scale.ts';
import { BIKES } from '../src/data/bikes.ts';
import { VEHICLES } from '../src/data/vehicles.ts';
import { getLocation, STOREY_ROWS } from '../src/systems/LocationSystem.ts';
import { PROPS } from '../src/world/tiles.ts';

const T = SCALE.tile;
const big = new Set(['bus', 'coach']);
const heavy = new Set([...big, 'van', 'box-truck', 'garbage']);
const cars = VEHICLES.filter((v) => !heavy.has(v.shape));
const buses = VEHICLES.filter((v) => big.has(v.shape));
assert.ok(cars.length > 0 && buses.length > 0);

// Peatón < huella de la bici < coche < autobús.
const bikeLen = Math.max(...BIKES.map((b) => b.length));
const carMin = Math.min(...cars.map((v) => v.length));
const carMax = Math.max(...cars.map((v) => v.length));
const busMin = Math.min(...buses.map((v) => v.length));
assert.ok(SCALE.personH < carMin, 'un coche más corto que una persona alta');
assert.ok(bikeLen < carMin, `una bici (${bikeLen}) más larga que el coche más corto (${carMin})`);
assert.ok(carMax * 1.5 <= busMin, `un autobús (${busMin}) no es mucho más largo que un coche (${carMax})`);
for (const v of cars) assert.ok(v.height <= SCALE.carMaxH, `${v.id}: ${v.height} px, más alto que una persona`);
for (const v of buses) assert.ok(v.height > Math.max(...cars.map((c) => c.height)), `${v.id}: más bajo que un coche`);
for (const v of VEHICLES) assert.ok(v.height <= 1.5 * SCALE.personH, `${v.id}: ${v.height} px, un vehículo más alto que una vez y media una persona`);

// La puerta de calle: una planta, más alta que una persona y no un portón.
assert.equal(STOREY_ROWS * T, SCALE.doorH);
assert.ok(SCALE.doorH >= SCALE.personH && SCALE.doorH <= SCALE.personH * 1.6, 'puerta fuera de medida');

// Mobiliario en tiles (world/tiles.PROPS): el banco no pasa de una persona; farolas y árboles, bien por encima.
const h = (k: keyof typeof PROPS): number => (PROPS[k].tilesHigh ?? 1) * T;
assert.ok(h('bench') <= SCALE.personH && h('planter') <= SCALE.personH, 'mobiliario bajo más alto que una persona');
assert.ok(h('lamp') >= SCALE.personH && h('street-lamp') >= 2 * SCALE.personH, 'farola más baja que su gente');
assert.ok(h('tree') >= 2 * SCALE.personH, 'árbol más bajo que dos personas');
assert.ok(h('plaza-bench') <= 2 * T && (PROPS['plaza-bench'].tilesWide ?? 1) >= 2, 'banco de plaza para una persona');

// La avenida: cada carril un tile (la huella de un coche o de un bus), el carril bici en el borde y aceras anchas.
const loc = getLocation('district');
const lanes = loc.traffic!.lanes.map((l) => l.row);
const bikeRows = loc.traffic!.bikes!.lanes.map((l) => l.row);
assert.ok(lanes.length >= 4 && lanes.every((r) => Number.isInteger(r)), 'carriles de la avenida');
const col = 30;
const cell = (y: number): string => loc.ground[y][col];
const top = Math.min(...bikeRows.filter((r) => r < 40));
let sidewalk = 0;
for (let y = top - 1; y >= 0 && loc.ground[y][col] === ','; y--) sidewalk++;
assert.ok(sidewalk >= SCALE.sidewalkMin, `acera de ${sidewalk} tiles junto a la avenida`);
assert.ok(SCALE.sidewalkMin * T >= 2 * SCALE.personW, 'una acera de dos personas');
assert.ok(lanes.every((r) => cell(r) !== ','), 'carril sobre acera');
console.log(`escala: persona de ${SCALE.personH} de alto; largos bici ${bikeLen} < coche ${carMin}–${carMax} < bus ${busMin}; puerta ${SCALE.doorH}; acera ${sidewalk} tiles; carriles de ${T}`);
