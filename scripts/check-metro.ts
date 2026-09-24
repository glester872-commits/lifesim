// Comprobación de la máquina de estados del tren: `npm run check`.
// Simula varios ciclos a 60 fps y a framerate irregular.
import assert from 'node:assert/strict';
import { METRO_CONFIG } from '../src/config/metro.ts';
import { TrainSystem, type TrainState } from '../src/systems/TrainSystem.ts';

const ORDER: TrainState[] = [
  'APPROACHING',
  'ARRIVING',
  'STOPPED',
  'DOORS_OPENING',
  'BOARDING',
  'DOORS_CLOSING',
  'DEPARTING',
  'AWAY',
];
const track = { enterX: 360, stopX: 32, exitX: -300 };

function run(stepMs: () => number, cycles: number): void {
  const train = new TrainSystem(METRO_CONFIG, track);
  const seen: TrainState[] = [];
  train.onStateChange = (s) => seen.push(s);

  for (let t = 0; t < 10 * 60_000 && seen.length < cycles * ORDER.length; ) {
    const dt = stepMs();
    t += dt;
    train.update(dt);
    if (train.speed > 0) assert.equal(train.doorOpenness, 0, `puertas abiertas en marcha (${train.state})`);
    if (train.doorOpenness > 0) assert.equal(train.x, track.stopX, 'puertas abiertas fuera de la marca');
  }

  assert.equal(seen.length, cycles * ORDER.length, `sólo ${seen.length} transiciones`);
  seen.forEach((s, i) => assert.equal(s, ORDER[i % ORDER.length], `transición ${i}`));
}

run(() => 16.7, 4);
let seed = 7;
run(() => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return 5 + (seed / 2 ** 32) * 95;
}, 4);

const docked = new TrainSystem(METRO_CONFIG, track, true);
assert.equal(docked.doorsOpen, true, 'llegar en tren: puertas abiertas');

console.log('metro ok: 4 ciclos completos a 60 fps y a framerate irregular');
