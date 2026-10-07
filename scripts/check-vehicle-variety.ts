// Variedad del tráfico (data/vehicles.ts colorWeight, systems/Traffic.spawn): varias carrocerías, colores de calle de
// Madrid (blancos, negros y grises casi siempre; azul, rojo y verde de vez en cuando) y nada de clones cerca. La misma
// lógica que el juego, sin Phaser. Llamado desde la cadena `check` de package.json. `node scripts/check-vehicle-variety.ts`.
import assert from 'node:assert/strict';
import { VEHICLES, type VehicleType } from '../src/data/vehicles.ts';
import { withDistrictLanes } from '../src/systems/Districts.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { Traffic } from '../src/systems/Traffic.ts';
import type { LaneFlow } from '../src/types/game.ts';

/** Blanco, negro, gris o plata: casi sin croma (máximo menos mínimo de los canales). El HSV no vale: un negro azulado sale «saturado». */
const neutral = (hex: string): boolean => {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return Math.max(...ch) - Math.min(...ch) <= 23;
};

// ------------------------------------------------- 1. el catálogo: carrocerías y colores
const CARS = VEHICLES.filter((v) => !v.id.startsWith('taxi') && ['city', 'hatch', 'sedan', 'wagon', 'suv-compact', 'suv', 'van'].includes(v.shape));
{
  const shapes = new Set(CARS.map((v) => v.shape));
  assert.ok(shapes.size >= 7, `carrocerías de calle: ${[...shapes].join(', ')}`);
  for (const v of CARS) {
    assert.ok(v.colorWeight && v.colorWeight.length === v.colors.length, `${v.id}: un peso por color`);
    const total = v.colorWeight!.reduce((a, b) => a + b, 0);
    const grey = v.colors.reduce((s, c, i) => s + (neutral(c) ? v.colorWeight![i] : 0), 0) / total;
    assert.ok(grey >= (v.id === 'van' ? 0.8 : 0.7), `${v.id}: sólo ${Math.round(grey * 100)} % de blancos, negros y grises`);
    // Ningún color vistoso pasa del 10 % de su modelo.
    v.colors.forEach((c, i) => {
      if (!neutral(c)) assert.ok(v.colorWeight![i] / total <= 0.1, `${v.id}: ${c} pesa ${Math.round((v.colorWeight![i] / total) * 100)} %`);
    });
    // Los neutros que se piden: blanco, negro, gris oscuro, plata y gris claro entre los modelos corrientes.
    if (['city', 'hatch', 'sedan'].includes(v.shape)) assert.ok(v.colors.filter(neutral).length >= 4, `${v.id}: pocos neutros distintos`);
  }
  const all = new Set(CARS.flatMap((v) => v.colors.filter(neutral)));
  assert.ok(all.size >= 8, `neutros distintos en la calle: ${all.size}`);
  assert.ok(CARS.some((v) => v.colors.some((c) => !neutral(c))), 'ningún color de vez en cuando');
  // El taxi sigue blanco con su banda y el autobús, azul: no se tocan.
  assert.deepEqual(VEHICLES.find((v) => v.id === 'taxi')!.colors, ['#f2f0ea']);
  assert.ok(VEHICLES.find((v) => v.id === 'bus')!.colors.every((c) => c === '#1f5fae'));
}

// ------------------------------------------------- 2. el tráfico de verdad: la avenida y una calle de barrio
interface Sample { cars: number; neutral: number; bodies: Map<string, number>; clones: number; colored: Map<string, number>; sequence: string }
function run(flow: LaneFlow, widthPx: number, seed: number, days = 6): Sample {
  const t = new Traffic(flow, VEHICLES, [], widthPx, seededRng(seed));
  const seen = new Set<number>();
  const out: Sample = { cars: 0, neutral: 0, bodies: new Map(), clones: 0, colored: new Map(), sequence: '' };
  for (let day = 2; day < 2 + days; day++) {
    for (let min = 0; min < 24 * 60; min++) {
      t.update(1_000, { day, minuteOfDay: min }, []);
      for (const v of t.vehicles) {
        if (seen.has(v.id)) continue;
        seen.add(v.id);
        const ty = v.type as VehicleType;
        if (!CARS.some((c) => c.id === ty.id)) continue;
        out.cars++;
        const c = ty.colors[v.color];
        if (neutral(c)) out.neutral++;
        else out.colored.set(c, (out.colored.get(c) ?? 0) + 1);
        out.bodies.set(ty.shape, (out.bodies.get(ty.shape) ?? 0) + 1);
        // Un clon: otro igual (modelo y color) a la vista, en cualquier carril, al salir.
        if (t.vehicles.some((o) => o !== v && o.type === v.type && o.color === v.color && Math.abs(o.x - v.x) < 320)) out.clones++;
        if (out.cars <= 40) out.sequence += `${ty.id}:${v.color},`;
      }
    }
  }
  return out;
}
const district = getLocation('district');
const width = district.ground[0].length * 16;
const avenue = run(withDistrictLanes(district, district.traffic!), width, 5);
// Una calle de barrio: los mismos carriles con el tipo de vía residencial (menos autobuses y camiones, más utilitarios y furgonetas).
const street = run({ ...withDistrictLanes(district, district.traffic!), road: 'residential' }, width, 9);
for (const [name, r] of [['avenida', avenue], ['calle de barrio', street]] as const) {
  assert.ok(r.cars >= 60, `${name}: muestra pequeña (${r.cars})`);
  assert.ok(r.neutral / r.cars >= 0.65, `${name}: sólo ${Math.round((r.neutral / r.cars) * 100)} % de blancos, negros y grises`);
  assert.ok(r.bodies.size >= 6, `${name}: carrocerías vistas: ${[...r.bodies.keys()].join(', ')}`);
  assert.ok(Math.max(...r.bodies.values()) / r.cars <= 0.3, `${name}: una carrocería domina (${[...r.bodies].map(([k, n]) => `${k} ${n}`).join(', ')})`);
  for (const [c, n] of r.colored) assert.ok(n / r.cars <= 0.07, `${name}: ${c} es el ${Math.round((n / r.cars) * 100)} % del tráfico`);
  assert.ok(r.clones / r.cars <= 0.03, `${name}: ${r.clones} de ${r.cars} coches con un clon a la vista`);
}
// Determinista: la misma semilla, el mismo tráfico; otra, otro.
const lanes = withDistrictLanes(district, district.traffic!);
assert.equal(run(lanes, width, 5, 1).sequence, run(lanes, width, 5, 1).sequence, 'el tráfico no es reproducible');
assert.notEqual(run(lanes, width, 5, 1).sequence, run(lanes, width, 6, 1).sequence, 'dos semillas, el mismo tráfico');

const pct = (r: Sample): string => `${Math.round((r.neutral / r.cars) * 100)} % neutros, ${r.bodies.size} carrocerías, ${r.clones} clones de ${r.cars}`;
console.log(`check-vehicle-variety: avenida ${pct(avenue)} · calle de barrio ${pct(street)}; ${new Set(CARS.map((v) => v.shape)).size} carrocerías y ${new Set(CARS.flatMap((v) => v.colors)).size} colores en el catálogo, OK`);
