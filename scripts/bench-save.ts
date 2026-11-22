import { performance } from 'node:perf_hooks';
import { createInitialState, SaveSystem } from '../src/systems/SaveSystem.ts';
import { MemoryStorage, slotSave } from '../src/systems/SaveSlots.ts';

const ROUNDS = Number(process.argv[2] ?? 1000);
if (!Number.isSafeInteger(ROUNDS) || ROUNDS < 1) throw new Error('Uso: node scripts/bench-save.ts [iteraciones]');

const base = createInitialState();
base.identity = { ...base.identity, name: 'Benchmark' };
base.money = 1234.56;

function bench(label: string, save: SaveSystem): void {
  const start = performance.now();
  for (let i = 0; i < ROUNDS; i++) {
    if (!save.save({ ...base, minute: i % 60 })) throw new Error(`${label}: guardado rechazado`);
  }
  const elapsed = performance.now() - start;
  console.log(`${label}: ${ROUNDS} guardados en ${elapsed.toFixed(1)} ms · ${(elapsed / ROUNDS).toFixed(3)} ms/guardado`);
}

bench('simple', new SaveSystem(new MemoryStorage()));
bench('ranura', slotSave(new MemoryStorage(), 2));
