// Tráfico con la misma lógica que el juego (systems/Traffic.ts): una semana de
// avenida con semáforos y gente cruzando, para los coches y para las bicis del
// carril bici. `node scripts/check-traffic.ts`.
import assert from 'node:assert/strict';
import { TILE } from '../src/config/constants.ts';
import { BIKES } from '../src/data/bikes.ts';
import { VEHICLES, bandAt, type MoverType, type TrafficBand } from '../src/data/vehicles.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { signalAt } from '../src/systems/Signals.ts';
import { Traffic, vehicleWeights, type Vehicle } from '../src/systems/Traffic.ts';
import type { LaneFlow, Vec2 } from '../src/types/game.ts';

const loc = getLocation('district');
const def = loc.traffic!;
const bikes = def.bikes!;
const signals = loc.signals ?? [];
const width = loc.ground[0].length;
const widthPx = width * TILE;
const CAR_ROAD = new Set(['.', '=', ':', 'z']);
const BIKE_ROAD = new Set(['b', 'z']);

// ------------------------------------------------------------ la calzada
// Cada carril es de lo suyo de punta a punta: ni acera, ni edificio, ni vía de tren, ni nada aparcado encima.
function checkLanes(flow: LaneFlow, allowed: ReadonlySet<string>, what: string): void {
  for (const lane of flow.lanes) {
    for (let x = 0; x < width; x++) assert.ok(allowed.has(loc.ground[lane.row][x]), `${what} ${lane.row}: (${x}) es «${loc.ground[lane.row][x]}»`);
    for (const b of loc.buildings ?? []) assert.ok(lane.row < b.ty || lane.row >= b.ty + b.h, `${what} ${lane.row} atraviesa ${b.name}`);
    for (const p of loc.props) assert.ok(p.ty !== lane.row, `${what} ${lane.row}: ${p.kind} en (${p.tx}, ${p.ty})`);
  }
}
checkLanes(def, CAR_ROAD, 'carril');
checkLanes(bikes, BIKE_ROAD, 'carril bici');
// Un carril bici junto a uno de coches va en su mismo sentido; sin coches al lado es una calle sólo de bicis (el Carmen).
for (const lane of bikes.lanes) {
  assert.ok(!def.lanes.some((l) => l.row === lane.row), `carril bici ${lane.row} compartido con coches`);
  const car = def.lanes.find((l) => Math.abs(l.row - lane.row) === 1);
  if (car) assert.ok(car.dir === lane.dir, `carril bici ${lane.row}: a contramano del carril de coches de al lado`);
}
// Ningún tile de carril bici fuera de los carriles bici: si no, alguien pintó uno a medias.
loc.ground.forEach((row, y) => [...row].forEach((ch, x) => ch === 'b' && assert.ok(bikes.lanes.some((l) => l.row === y), `carril bici suelto en (${x}, ${y})`)));

// ------------------------------------------------------------ los pesos
for (const t of VEHICLES) assert.ok(t.length >= 26 && t.length <= 96, `${t.id}: largo raro`);
assert.equal(vehicleWeights({ ...def, road: 'residential' }, VEHICLES, 3, 12).find(([t]) => t.id === 'bus')![1], 0, 'autobús en calle de barrio');

// ------------------------------------------------------------ una semana
interface Week {
  exits: number;
  busiest: number;
  jayChecks: number;
  usPerStep: number;
  spawned: Map<TrafficBand, Map<string, number>>;
}

function week(flow: LaneFlow, catalog: readonly MoverType[], seed: number): Week {
  const DT = 50;
  const rng = seededRng(seed);
  const traffic = new Traffic(flow, catalog, signals, widthPx, rng);
  const spawned = new Map<TrafficBand, Map<string, number>>();
  const seen = new Set<number>();
  let exits = 0;
  let steps = 0;
  let busiest = 0;
  let jayChecks = 0;
  let jaywalker: (Vec2 & { until: number }) | null = null;
  /** Quién tenía el morro a más de dos tiles del peatón cuando éste pisó el carril: ése no puede pasarle. */
  let mustYield = new Set<Vehicle>();
  const front = (v: Vehicle): number => v.x + v.dir * (v.type.length / 2);

  const t0 = performance.now();
  for (let day = 1; day <= 7; day++) {
    traffic.vehicles.length = 0;
    traffic.populate({ day, minuteOfDay: 0 });
    for (let ms = 0; ms < 24 * 60 * 30_000; ms += DT) {
      const minuteOfDay = ms / 30_000;
      const before = new Map(traffic.vehicles.map((v) => [v, front(v)]));

      // De vez en cuando, alguien pisa el carril por donde no debe y se queda unos segundos.
      if (!jaywalker && rng() < 0.002) {
        const lane = flow.lanes[Math.floor(rng() * flow.lanes.length)];
        const at = { x: 40 + rng() * (widthPx - 80), y: lane.row * TILE + 10, until: ms + 3_000 };
        jaywalker = at;
        mustYield = new Set(traffic.vehicles.filter((v) => v.row === lane.row && (at.x - front(v)) * v.dir > TILE * 2));
      }
      if (jaywalker && ms > jaywalker.until) jaywalker = null;

      traffic.update(DT, { day, minuteOfDay }, jaywalker ? [jaywalker] : []);
      steps++;

      const ids = new Set(traffic.vehicles.map((v) => v.id));
      for (const id of seen) if (!ids.has(id)) exits++;
      seen.clear();
      for (const id of ids) seen.add(id);

      const band = bandAt(minuteOfDay / 60);
      for (const v of traffic.vehicles) {
        const prev = before.get(v);
        if (prev === undefined) {
          const byType = spawned.get(band) ?? new Map<string, number>();
          byType.set(v.type.id, (byType.get(v.type.id) ?? 0) + 1);
          spawned.set(band, byType);
          continue;
        }
        // En rojo nadie pisa la línea de detención (en ámbar puede, si ya no le daba para frenar).
        for (const sig of signals) {
          if (v.row < sig.ty || v.row >= sig.ty + sig.h || signalAt(sig, minuteOfDay).car !== 'red') continue;
          const line = v.dir > 0 ? sig.tx * TILE - 3 : (sig.tx + sig.w) * TILE + 3;
          assert.ok(!((prev - line) * v.dir < -0.01 && (front(v) - line) * v.dir > 0.01), `día ${day} ${minuteOfDay.toFixed(1)}: ${v.type.id} se salta el rojo en ${sig.id}`);
        }
        if (jaywalker && mustYield.has(v)) {
          jayChecks++;
          assert.ok((jaywalker.x - front(v)) * v.dir > -6, `día ${day}: ${v.type.id} atropella a quien cruza`);
        }
      }

      // Nadie se monta encima de otro: entre parachoques (o ruedas) siempre hay aire.
      for (const lane of flow.lanes) {
        const inLane = traffic.vehicles.filter((v) => v.row === lane.row).sort((a, b) => a.x - b.x);
        busiest = Math.max(busiest, inLane.length);
        for (let i = 1; i < inLane.length; i++) {
          const gap = inLane[i].x - inLane[i - 1].x - (inLane[i].type.length + inLane[i - 1].type.length) / 2;
          assert.ok(gap > 0, `día ${day} ${minuteOfDay.toFixed(1)}: ${inLane[i - 1].type.id} y ${inLane[i].type.id} se solapan (${gap.toFixed(1)} px)`);
        }
      }
    }
  }
  return { exits, busiest, jayChecks, spawned, usPerStep: ((performance.now() - t0) / steps) * 1000 };
}

function report(what: string, w: Week, flow: LaneFlow): (band: TrafficBand, ids: readonly string[]) => number {
  console.log(`${what}, entradas por franja:`);
  for (const [band, byType] of w.spawned) {
    console.log(`  ${band.padEnd(8)} ${[...byType].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${n}`).join(', ')}`);
  }
  console.log(`  ${w.exits} cruzan en 7 días; ${w.usPerStep.toFixed(1)} µs por paso.\n`);
  assert.ok(w.busiest <= flow.perLane, `${what}: un carril con ${w.busiest}`);
  assert.ok(w.jayChecks > 0, `${what}: nadie pisó el carril por donde no debía`);
  return (band, ids) => {
    const byType = w.spawned.get(band)!;
    const total = [...byType.values()].reduce((s, n) => s + n, 0);
    return ids.reduce((s, id) => s + (byType.get(id) ?? 0), 0) / total;
  };
}

const cars = week(def, VEHICLES, 7);
const carShare = report('coches', cars, def);
const delivery = ['van', 'small-truck', 'delivery-truck'];
assert.ok(carShare('morning', delivery) > 2 * carShare('night', delivery), 'por la mañana, más reparto que de noche');
assert.ok(carShare('night', ['taxi']) > 1.5 * carShare('morning', ['taxi']), 'de noche, más taxis');
assert.ok(carShare('dawn', ['garbage']) > carShare('midday', ['garbage']), 'la basura se recoge de madrugada');
assert.ok(cars.exits > 7 * 200, `sólo ${cars.exits} coches cruzan la avenida en una semana: atasco`);

const riders = week(bikes, BIKES, 11);
const bikeShare = report('bicis', riders, bikes);
assert.ok(bikeShare('morning', ['commuter']) > bikeShare('midday', ['commuter']), 'quien va al trabajo, por la mañana');
assert.ok(bikeShare('midday', ['courier']) > bikeShare('morning', ['courier']), 'el reparto, a la hora de comer');
assert.ok(riders.exits > 7 * 100, `sólo ${riders.exits} bicis cruzan en una semana: atasco`);

console.log('OK: carriles de coches y bici sobre su calzada, rojo respetado, sin solapes, ceden al peatón, mezcla por hora y día, sin atascos.');
