// Vecinas embarazadas (CV-06): las reglas de systems/Pregnancy.ts sin Phaser. Adultez, fases en orden, nacimiento una
// sola vez (también en un salto que lo cruza todo), recargar sin duplicar, partida antigua, rutinas y aspecto por fase.
// Llamado desde la cadena `check` de package.json. `node scripts/check-pregnancy.ts`.
import assert from 'node:assert/strict';
import { BIRTH_DAY, PREGNANCIES } from '../src/data/pregnancy.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { getNpc } from '../src/data/npcs.ts';
import { NAMED_PEOPLE } from '../src/data/namedPeople.ts';
import { routineFor, whereabouts } from '../src/systems/Characters.ts';
import { bumpOf, parsePregnancy, phaseAt, phaseOn, resolve, usePregnancies, type PregnancyEvent, type PregnancyState } from '../src/systems/Pregnancy.ts';
import { createInitialState, SaveSystem } from '../src/systems/SaveSystem.ts';
import { SAVE_KEY, SAVE_VERSION } from '../src/config/constants.ts';
import type { GameStateData } from '../src/types/game.ts';

// ------------------------------------------------------------ quiénes
assert.ok(PREGNANCIES.length >= 2);
for (const p of PREGNANCIES) {
  assert.ok(NAMED_PEOPLE[p.npc].age >= 18, `${p.npc} no es adulta`);
  assert.ok(CHARACTERS.some((c) => c.npc === p.npc), `${p.npc} sin rutina`);
  assert.ok(getNpc(p.npc), `${p.npc} sin aspecto`);
}
const homes = new Set(PREGNANCIES.map((p) => CHARACTERS.find((c) => c.npc === p.npc)!.home));
assert.equal(homes.size, PREGNANCIES.length, 'cada una en su casa');
const looks = new Set(PREGNANCIES.map((p) => getNpc(p.npc).cloth + getNpc(p.npc).hair));
assert.equal(looks.size, PREGNANCIES.length, 'aspectos distintos');
// No todas a la vez: al menos una empieza más tarde (frecuente, no omnipresente).
assert.ok(PREGNANCIES.some((p) => p.offset < 0) && PREGNANCIES.some((p) => p.offset >= 0));

// ------------------------------------------------------------ fases
assert.equal(phaseAt(10, 9), 'waiting');
assert.deepEqual([0, 9, 10, 19, 20, 27, 28, 48, 49, 400].map((d) => phaseAt(0, d)), ['early', 'early', 'mid', 'mid', 'late', 'late', 'post', 'post', 'done', 'done']);
assert.deepEqual((['waiting', 'early', 'mid', 'late', 'post', 'done'] as const).map(bumpOf), [0, 1, 2, 3, 0, 0]);

// ------------------------------------------------------------ primer día: registros sin eventos, y repetirlo no cambia nada
const DAY = 665; // una partida antigua, cargada por primera vez con este sistema
const first = resolve({}, DAY);
assert.equal(first.events.length, 0, 'no se cuenta lo de antes de conocerla');
for (const p of PREGNANCIES) assert.equal(first.state[p.npc].start, DAY - p.offset);
assert.equal(first.state.noa.phase, 'mid');
assert.equal(first.state.amaia.phase, 'early');
assert.equal(first.state.yasmin.phase, 'waiting');
assert.equal(resolve(first.state, DAY).state, first.state, 'repetir el mismo día no cambia nada');

// ------------------------------------------------------------ salto que lo cruza todo frente a día a día
const END = DAY + 120;
const jump = resolve(first.state, END);
let daily: PregnancyState = first.state;
const dailyEvents: PregnancyEvent[] = [];
for (let d = DAY + 1; d <= END; d++) {
  const r = resolve(daily, d);
  daily = r.state;
  dailyEvents.push(...r.events);
}
assert.deepEqual(jump.state, daily, 'el salto acaba igual que día a día');
assert.deepEqual(jump.events, PREGNANCIES.flatMap((p) => dailyEvents.filter((e) => e.npc === p.npc)), 'mismos eventos y en orden');
const ALL = ['early', 'mid', 'late', 'post', 'done'];
for (const p of PREGNANCIES) {
  const mine = jump.events.filter((e) => e.npc === p.npc).map((e) => e.phase);
  assert.deepEqual(mine, ALL.slice(ALL.indexOf(first.state[p.npc].phase) + 1), `${p.npc}: fases en orden`);
  const births = jump.events.filter((e) => e.npc === p.npc && e.birth);
  assert.equal(births.length, 1, `${p.npc}: un nacimiento`);
  assert.equal(births[0].birth!.day, first.state[p.npc].start + BIRTH_DAY, 'con su día de verdad');
  assert.deepEqual(jump.state[p.npc].born!.baby, { id: `bebe-${p.npc}`, name: p.baby.name });
}
assert.equal(resolve(jump.state, END).events.length, 0);
assert.equal(resolve(jump.state, END + 300).events.length, 0, 'después no vuelve a nacer nadie');

// ------------------------------------------------------------ guardar y cargar (antes y después del nacimiento)
for (const s of [first.state, resolve(first.state, DAY + 20).state, jump.state]) {
  const back = parsePregnancy(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back, s, 'vuelve igual');
  assert.equal(resolve(back, END).events.filter((e) => e.birth).length, PREGNANCIES.filter((p) => !s[p.npc].born).length, 'sin duplicar nacimientos');
}
assert.deepEqual(parsePregnancy({ nadie: { start: 1, phase: 'mid' }, noa: { start: 'x', phase: 'mid' }, amaia: { start: 3, phase: 'raro' } }), {}, 'lo inválido se descarta');
// Partida nueva y partida anterior a este sistema: sin registros (main.ts los empieza al cargar).
assert.deepEqual(createInitialState().pregnancy, {});
const store = new Map<string, string>();
const disk = new SaveSystem({ read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) });
const old = { ...createInitialState(), day: DAY } as Partial<GameStateData>;
delete old.pregnancy;
store.set(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, savedAt: 0, state: old }));
assert.deepEqual(disk.load()?.pregnancy, {}, 'una partida anterior carga sin registros');
assert.ok(disk.save({ ...(old as GameStateData), pregnancy: jump.state }));
assert.deepEqual(disk.load()?.pregnancy, jump.state, 'el bebé vuelve igual del disco');

// ------------------------------------------------------------ rutina por fase
usePregnancies(first.state);
const noa = CHARACTERS.find((c) => c.npc === 'noa')!;
const start = first.state.noa.start;
/** El primer día de esa fase que cae en ese día de la semana (0 lunes; el día 1 es lunes). */
const dayOf = (phase: string, weekday: number): number => {
  for (let d = start; d < start + 120; d++) if (phaseAt(start, d) === phase && (d - 1) % 7 === weekday) return d;
  throw new Error(`sin ${phase}/${weekday}`);
};
assert.equal(routineFor(noa, dayOf('mid', 0)).id, 'cole', 'mitad, lunes: al cole');
assert.equal(routineFor(noa, dayOf('mid', 1)).id, 'preparacion-noa', 'mitad, martes: clase de preparación');
assert.equal(routineFor(noa, dayOf('late', 2)).id, 'baja-noa', 'final: de baja');
assert.equal(routineFor(noa, dayOf('post', 3)).id, 'postparto-noa');
assert.ok(['cole', 'claustro'].includes(routineFor(noa, dayOf('done', 2)).id), 'después, su vida de siempre');
assert.equal(phaseOn('noa', dayOf('late', 2)), 'late');
// Al final va más despacio, y todos los días del ciclo cuadran: a las 06:00 en casa.
for (const def of CHARACTERS.filter((c) => PREGNANCIES.some((p) => p.npc === c.npc))) {
  assert.ok(def.routines.filter((r) => r.stage?.includes('late')).every((r) => (r.pace ?? 1) < 1), `${def.npc}: al final, más despacio`);
  for (let d = DAY; d < DAY + 90; d++) {
    assert.equal(whereabouts(def, (d - 1) * 1440 + 6 * 60).stop.point, def.home, `${def.npc} día ${d}: a las 06:00 en casa`);
    for (let m = 0; m < 1440; m += 30) whereabouts(def, (d - 1) * 1440 + m);
  }
}

// El aspecto de cada fase (world/WeatherLooks.pregnantLook, ~p1…~p3 con sus capas de tiempo) usa imports de Vite y se
// comprueba en el navegador (QA.md, CV-06).

console.log(`embarazos OK · ${PREGNANCIES.length} vecinas · ${jump.events.length} pasos en un salto de ${END - DAY} días · ${jump.events.filter((e) => e.birth).length} nacimientos`);
