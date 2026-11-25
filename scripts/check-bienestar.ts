// VID-07 · tensión (systems/Wellbeing) y su guardado: `node scripts/check-bienestar.ts`.
// Control positivo: si los topes no se miraran, el tercer work suma; si settle no fuera idempotente, (f) baja dos veces;
// si migrate no añadiera wellbeing, (g) carga sin la clave.
import assert from 'node:assert/strict';
import { SAVE_KEY, SAVE_VERSION } from '../src/config/constants.ts';
import { createInitialState, inspectRaw, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import {
  applyWellbeing, bonusAfterTension, parseWellbeing, settleWellbeing, SOCIAL_RELIEF, SPORT_RELIEF, startWellbeing, TENSION_START, tensionBand,
  tensionLine, WORK_DAILY_CAP, WORK_GAIN, type WellbeingState,
} from '../src/systems/Wellbeing.ts';
import { getJob } from '../src/data/jobs.ts';
import { hire, situationFor, work } from '../src/systems/Jobs.ts';
import { absMinute } from '../src/systems/Handoff.ts';

function memory(): { store: Map<string, string>; save: SaveSystem } {
  const store = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
  return { store, save: new SaveSystem(storage) };
}
const at = (tension: number): WellbeingState => ({ ...startWellbeing(0), tension });

// a · trabajo: +8, tope 16 al día, al día siguiente vuelve a sumar
{
  const w0 = startWellbeing(0);
  assert.equal(w0.tension, TENSION_START);
  const r1 = applyWellbeing(w0, 'work', WORK_GAIN, 0, 1);
  assert.equal(r1.state.tension, 28);
  assert.equal(r1.applied, 8);
  const r2 = applyWellbeing(r1.state, 'work', WORK_GAIN, 0, 1);
  const r3 = applyWellbeing(r2.state, 'work', WORK_GAIN, 0, 1);
  assert.ok(r1.applied + r2.applied + r3.applied <= WORK_DAILY_CAP, 'el trabajo pasa del tope diario');
  assert.equal(r3.applied, 0);
  const next = applyWellbeing(r3.state, 'work', WORK_GAIN, 1440, 2);
  assert.equal(next.applied, 8, 'al día siguiente el trabajo no vuelve a sumar');
  assert.equal(applyWellbeing(at(99), 'work', WORK_GAIN, 0, 1).state.tension, 100, 'pasa de 100');
}

// b · bonus
{
  const cut = bonusAfterTension(10, 'tense');
  assert.ok(cut >= 9 && cut < 10, `bonus con tensión: ${cut}`);
  assert.equal(bonusAfterTension(10, 'ok'), 10);
  assert.equal(bonusAfterTension(10, 'calm'), 10);
  assert.equal(tensionBand(at(70)), 'tense');
  assert.equal(tensionBand(at(25)), 'calm');
  assert.equal(tensionBand(at(50)), 'ok');
  for (const b of ['tense', 'ok', 'calm'] as const) assert.ok(tensionLine(b).length > 0);
}

// c · deporte: −6, tope −12 al día, nunca bajo 0
{
  const s1 = applyWellbeing(startWellbeing(0), 'sport', SPORT_RELIEF, 0, 1);
  assert.equal(s1.state.tension, 14);
  const s2 = applyWellbeing(s1.state, 'sport', SPORT_RELIEF, 0, 1);
  const s3 = applyWellbeing(s2.state, 'sport', SPORT_RELIEF, 0, 1);
  assert.equal(s3.state.tension, 8, 'el deporte pasa del tope');
  assert.equal(s3.applied, 0);
  const low = applyWellbeing(at(3), 'sport', SPORT_RELIEF, 0, 1);
  assert.equal(low.state.tension, 0);
  assert.equal(low.applied, -3);
}

// d · social: −3 una vez por NPC y día, tope −6
{
  const a = applyWellbeing(startWellbeing(0), 'social', SOCIAL_RELIEF, 0, 1, 'sara');
  assert.equal(a.state.tension, 17);
  assert.equal(applyWellbeing(a.state, 'social', SOCIAL_RELIEF, 0, 1, 'sara').applied, 0, 'el mismo NPC alivia dos veces');
  const b = applyWellbeing(a.state, 'social', SOCIAL_RELIEF, 0, 1, 'ada');
  assert.equal(b.state.tension, 14);
  assert.equal(applyWellbeing(b.state, 'social', SOCIAL_RELIEF, 0, 1, 'marco').applied, 0, 'lo social pasa del tope');
  assert.equal(applyWellbeing({ ...b.state, tension: 50 }, 'social', SOCIAL_RELIEF, 1440, 2, 'sara').applied, -3, 'al día siguiente sara vuelve a aliviar');
}

// e · caminar: −1 por llamada, tope −6
{
  let w = startWellbeing(0);
  let total = 0;
  for (let i = 0; i < 9; i++) {
    const r = applyWellbeing(w, 'walk', 1, 0, 1);
    total += r.applied;
    w = r.state;
  }
  assert.equal(total, -6);
  assert.equal(w.tension, 14);
}

// f · decay
{
  const w = startWellbeing(0);
  const s = settleWellbeing(w, 240);
  assert.equal(s.tension, 18);
  assert.equal(s.lastMinute, 240);
  assert.deepEqual(settleWellbeing(s, 240), s, 'settle dos veces con el mismo now');
  const partial = settleWellbeing(w, 250);
  assert.equal(partial.lastMinute, 240, 'lastMinute avanza sólo lo consumido');
  assert.deepEqual(settleWellbeing(partial, 250), partial);
  const back = settleWellbeing(s, 100);
  assert.equal(back.tension, 18, 'hacia atrás cambia la tensión');
  assert.equal(back.lastMinute, 100);
  assert.equal(settleWellbeing(at(1), 10_000).tension, 0, 'el decay baja de 0');
}

// g · migración v11 → v12, idempotencia, v13 newer y basura
assert.equal(SAVE_VERSION, 12);
{
  const v11 = { ...createInitialState(), day: 3, hour: 10, minute: 30, money: 55 };
  const minute = 2 * 1440 + 10 * 60 + 30;
  const a = memory();
  a.store.set(SAVE_KEY, JSON.stringify({ version: 11, savedAt: 0, state: v11 }));
  const once = a.save.load()!;
  assert.deepEqual(once.wellbeing, startWellbeing(minute));
  assert.equal(once.wellbeing!.tension, 20);
  assert.equal(once.wellbeing!.lastMinute, minute);
  assert.equal(once.money, 55);
  assert.ok(a.save.save(once));
  assert.deepEqual(a.save.load(), once, 'cargar dos veces cambia algo');
  const b = memory();
  b.store.set(SAVE_KEY, JSON.stringify({ version: 11, savedAt: 0, state: once }));
  assert.deepEqual(b.save.load(), once, 'migrar un estado ya migrado da lo mismo');
  assert.ok(((r) => r.status === 'unreadable' && r.reason === 'newer')(inspectRaw(JSON.stringify({ version: 13, savedAt: 0, state: v11 }))));
  const c = memory();
  c.store.set(SAVE_KEY, JSON.stringify({ version: 12, savedAt: 0, state: { ...v11, wellbeing: 'basura' } }));
  assert.deepEqual(c.save.load()!.wellbeing, startWellbeing(minute), 'la basura no vuelve al estado inicial');
}
for (const junk of [undefined, null, 1, 'x', [], {}, { v: 2, tension: 1, lastMinute: 0, sources: {} }, { v: 1, tension: Number.NaN, lastMinute: 0, sources: {} },
  { v: 1, tension: 10, lastMinute: 0, sources: { day: 1, work: 0, walk: 0, sport: 0, social: 'x', npcs: [] } }]) {
  assert.deepEqual(parseWellbeing(junk, 77), startWellbeing(77), JSON.stringify(junk));
}
{
  const p = parseWellbeing({ v: 1, tension: 500, lastMinute: 10, sources: { day: 2, work: -3, walk: 1, sport: 0, social: 0, npcs: ['sara', 4, ...Array.from({ length: 30 }, (_, i) => `n${i}`)] } }, 0);
  assert.equal(p.tension, 100);
  assert.equal(p.sources.work, 0);
  assert.equal(p.sources.npcs.length, 20);
  assert.ok(p.sources.npcs.every((n) => typeof n === 'string'));
}

// h · el turno con tensión (systems/Jobs.work): sin banda, igual que antes; 'tense' sólo recorta el plus.
{
  const job = getJob('decathlon');
  const p = hire(job, 1);
  const now = absMinute(3, 9, 30);
  const base = situationFor(p, 3).choices[0];
  const choice = { ...base, bonus: 10 };
  const plain = work(p, now, choice);
  assert.deepEqual(work(p, now, choice, undefined), plain, 'sin banda cambia el turno');
  assert.deepEqual(work(p, now, choice, 'ok'), plain, "con 'ok' cambia el turno");
  assert.deepEqual(work(p, now, choice, 'calm'), plain, "con 'calm' cambia el turno");
  assert.deepEqual(work(p, now, base, 'calm'), work(p, now, base), 'sin plus, la banda cambia algo');
  const tense = work(p, now, choice, 'tense');
  const lost = Math.round((plain.money - tense.money) * 100) / 100;
  assert.ok(lost > 0 && lost <= choice.bonus * 0.1 + 1e-9, `con tensión se pierde ${lost}`);
  assert.equal(work(p, now, { ...base, bonus: 0 }, 'tense').money, work(p, now, { ...base, bonus: 0 }).money, 'el sueldo base cambia con tensión');
  const shift = (o: typeof plain) => o.progress.shifts[3];
  assert.equal(shift(tense).score, shift(plain).score);
  assert.equal(tense.progress.good, plain.progress.good);
  assert.equal(tense.progress.streak, plain.progress.streak);
  assert.equal(tense.minutes, plain.minutes);
  assert.equal(tense.energy, plain.energy);
  assert.ok(tense.lines.includes('Hoy me cuesta concentrarme.'));
  assert.ok(!plain.lines.includes('Hoy me cuesta concentrarme.'));
}

console.log('check-bienestar: ok');
