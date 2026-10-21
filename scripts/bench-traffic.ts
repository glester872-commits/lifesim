// Coste de systems/Traffic.update en el escenario fijo de QA (district, semilla 5, día 3 desde las 07:00, 20 000 frames de 16 ms,
// peatones cruzando por los pasos). Sólo mide; no está en `check`. `node scripts/bench-traffic.ts`.
import { VEHICLES } from '../src/data/vehicles.ts';
import { withDistrictLanes } from '../src/systems/Districts.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { Traffic } from '../src/systems/Traffic.ts';

const def = getLocation('district');
const width = def.ground[0].length * 16;
const t = new Traffic(withDistrictLanes(def, def.traffic!), VEHICLES, def.signals ?? [], width, seededRng(5));
t.populate({ day: 3, minuteOfDay: 420 });
const rows = def.traffic!.lanes.map((l) => l.row);
const peds = Array.from({ length: 40 }, (_, i) => ({ x: (i * 97) % width, y: (rows[i % rows.length] * 16) + 8 }));
const N = 20_000;
let max = 0, n = 0, peak = 0;
const t0 = performance.now();
for (let f = 0; f < N; f++) {
  const s = performance.now();
  // Los peatones se mueven: nadie se queda plantado en la calzada.
  for (const p of peds) p.x = (p.x + 0.6) % width;
  t.update(16, { day: 3, minuteOfDay: 420 + (f * 16) / 500 }, peds);
  const d = performance.now() - s;
  if (f > 100 && d > max) max = d;
  n += t.vehicles.length;
  peak = Math.max(peak, t.vehicles.length);
}
const total = performance.now() - t0;
console.log(`bench-traffic: ${N} frames, ${(total / N * 1000).toFixed(1)} µs/frame de media, máx ${(max * 1000).toFixed(0)} µs, ${(n / N).toFixed(1)} vehículos de media (pico ${peak})`);
