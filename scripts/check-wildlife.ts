// Perros y palomas con la misma lógica que el juego (systems/Wildlife.ts):
// `node scripts/check-wildlife.ts`. Falla si algo no se cumple.
import assert from 'node:assert/strict';
import { getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { findPoint } from '../src/systems/Navigation.ts';
import { StreetLife, streetProfileFor } from '../src/systems/StreetLife.ts';
import { Dogs, LEASH, Pigeons } from '../src/systems/Wildlife.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import type { Clock } from '../src/systems/Crowd.ts';
import type { TilePoint } from '../src/types/game.ts';

const loc = getLocation('district');
const ROADWAY = new Set(['.', '=', ':', 'z']);
const STEP = 50;
const FAR: TilePoint = { tx: 72, ty: 53 };
const onGround = (x: number, y: number): boolean => isWalkable(loc, Math.round(x), Math.round(y)) && !ROADWAY.has(loc.ground[Math.round(y)][Math.round(x)]);

// ------------------------------------------------------------------ perros
// Por la mañana y al anochecer, una hora de juego cada vez: los perros van con
// su dueño y no pisan nada que no pise él.
let dogsSeen = 0;
let sniffs = 0;
let ahead = 0;
for (const [day, hour] of [[1, 7], [2, 19], [3, 8]] as const) {
  const street = new StreetLife(loc, streetProfileFor('district')!, seededRng(day * 101 + hour));
  const dogs = new Dogs(loc, seededRng(day));
  let clock: Clock = { day, hour, minute: 0 };
  street.populate(clock, FAR);
  const ids = new Set<number>();
  for (let ms = 0; ms < 60 * 500; ms += STEP) {
    street.update(STEP, clock, FAR);
    dogs.update(STEP, street.agents);
    if (ms % 500 === 0) clock = { ...clock, minute: Math.min(59, clock.minute + 1) };
    for (const d of dogs.dogs.values()) {
      ids.add(d.owner);
      if (d.state === 'sniff') sniffs++;
      assert.ok(isWalkable(loc, Math.round(d.x), Math.round(d.y)), `perro en algo sólido en ${d.x.toFixed(1)},${d.y.toFixed(1)}`);
      if (d.orphan) continue;
      const o = street.agents.find((a) => a.id === d.owner)!;
      const gap = Math.hypot(o.x - d.x, o.y - d.y);
      // Cuando el dueño echa a andar la correa se estira un momento; nunca se pierde.
      assert.ok(gap < LEASH + 1.2, `perro a ${gap.toFixed(2)} tiles de su dueño`);
      if (o.moving && d.lead > 0.3) ahead++;
    }
  }
  dogsSeen += ids.size;
  assert.equal(street.pathFailures, 0, 'caminos que no se encontraron');
}
assert.ok(dogsSeen >= 3, `pocos perros: ${dogsSeen}`);
assert.ok(sniffs > 0, 'ningún perro se para a olfatear');
assert.ok(ahead > 0, 'ningún perro se adelanta nunca');

// ----------------------------------------------------------------- palomas
const pigeons = new Pigeons(loc, seededRng(7));
pigeons.populate(12, FAR);
const flockOf = pigeons.birds[0].flock;
const grounded = (): number => pigeons.birds.filter((b) => pigeons.grounded(b)).length;
assert.ok(grounded() >= 20, `pocas palomas a mediodía: ${grounded()}`);
for (const b of pigeons.birds) if (pigeons.grounded(b)) assert.ok(onGround(b.x, b.y), `paloma en sitio malo ${b.x},${b.y}`);

// Se deja estar un minuto: picotean y se mueven sin salirse de su zona.
const states = new Set<string>();
for (let ms = 0; ms < 60_000; ms += STEP) {
  pigeons.update(STEP, 12, [], FAR);
  for (const b of pigeons.birds) {
    states.add(b.state);
    if (pigeons.grounded(b)) assert.ok(onGround(b.x, b.y), `paloma pisando donde no debe ${b.x.toFixed(1)},${b.y.toFixed(1)}`);
  }
}
assert.ok(grounded() >= 20, 'sin nada que las asuste, se quedan');
for (const s of ['idle', 'peck', 'walk', 'turn', 'hop']) assert.ok(states.has(s), `ninguna paloma hace ${s}`);

// Alguien cruza la plaza por delante de la fuente: se van, cada una a su tiempo.
const fountain = findPoint('PLAZA_FOUNTAIN')!;
const flock = pigeons.birds.filter((b) => b.flock === flockOf && pigeons.grounded(b));
const took = new Map<number, number>();
for (let ms = 0, x = fountain.tx - 5; ms < 6_000; ms += STEP, x += (2.2 * STEP) / 1000) {
  pigeons.update(STEP, 12, [{ tx: x, ty: fountain.ty }], FAR);
  for (const b of flock) if (b.state === 'flee' && !took.has(b.id)) took.set(b.id, ms);
}
assert.ok(took.size >= Math.ceil(flock.length * 0.7), `se asustan pocas: ${took.size}/${flock.length}`);
assert.ok(new Set(took.values()).size >= 3, 'se van todas en el mismo instante');

// Al rato vuelven.
for (let ms = 0; ms < 120_000; ms += STEP) pigeons.update(STEP, 12, [], FAR);
const back = pigeons.birds.filter((b) => b.flock === flockOf && pigeons.grounded(b)).length;
assert.ok(back >= Math.ceil(pigeons.wanted(flockOf, 12) * 0.7), `no vuelven: ${back}`);

// De noche, a dormir: la plaza se queda sin palomas.
const night = new Pigeons(loc, seededRng(9));
night.populate(2, FAR);
for (let ms = 0; ms < 30_000; ms += STEP) night.update(STEP, 2, [], FAR);
assert.equal(night.birds.filter((b) => night.grounded(b)).length, 0, 'palomas de madrugada');

console.log(`perros: ${dogsSeen} paseos, ${sniffs} pasos olfateando · palomas: ${pigeons.birds.length} en ${pigeons.flockCount} bandadas, ${took.size}/${flock.length} huyen en ${new Set(took.values()).size} momentos distintos, vuelven ${back}`);
console.log('OK: perros con su dueño y en suelo pisable; palomas en su sitio, se asustan escalonadas, vuelven y duermen.');
