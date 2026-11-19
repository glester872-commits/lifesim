// SIM-01 · Registro de consecuencias (systems/Consequences) con los sistemas reales: `node scripts/check-consequences.ts`.
// Control positivo: si register no fuera idempotente, (1)/(2) fallan; si los diferidos no se marcaran done, (4) repite el
// aviso; si el ascenso no leyera el registro, (5) ve 'ascenso' con un retraso vivo; si la poda tocara activas, (9) falla.
import assert from 'node:assert/strict';
import { SAVE_KEY, SAVE_VERSION } from '../src/config/constants.ts';
import { JOBS } from '../src/data/jobs.ts';
import { STORIES } from '../src/data/saraStory.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { getNpc } from '../src/data/npcs.ts';
import { MAX_ACTIVE, MAX_ARCHIVED, NOTICE_TEXT } from '../src/data/consequences.ts';
import { hire, levelOf, scheduled, settle, situationFor, work, type JobProgress } from '../src/systems/Jobs.ts';
import { settleWithReputation } from '../src/systems/Reputation.ts';
import { pay, startHousehold, sync as syncBills, unpaid, type HouseholdState } from '../src/systems/Household.ts';
import { createInitialState, inspectRaw, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import { MemoryStorage, slotKey, slotSave } from '../src/systems/SaveSlots.ts';
import { opportunities, opportunityInput } from '../src/systems/Opportunities.ts';
import { emptyStudy } from '../src/systems/Study.ts';
import { euros } from '../src/systems/Commerce.ts';
import { formatDateShort } from '../src/systems/Calendar.ts';
import { routineFor } from '../src/systems/Characters.ts';
import { createSocialProfile } from '../src/systems/Social.ts';
import { beatAfterTalk, chooseBeat, createStory, dayStart, minuteOf, offerBeat, phoneStory, presentBeat, applyEffect, watchPlan, type Applied, type StoryDef, type StoryState } from '../src/systems/Story.ts';
import {
  coverage, emptyConsequences, parseConsequences, reconcile,
  type Consequence, type ConsequenceInput, type ConsequenceState,
} from '../src/systems/Consequences.ts';
import type { GameStateData } from '../src/types/game.ts';

const abs = (day: number, h = 0, m = 0): number => (day - 1) * 1440 + h * 60 + m;
const endOf = (day: number): number => abs(day, 23, 59);
const def0 = JOBS[0];
const find = (s: ConsequenceState, id: string): Consequence | undefined => s.items.find((c): c is Consequence => c.consequenceId === id && c.status !== 'archived');
const input = (job: JobProgress | null, extra: Partial<ConsequenceInput> = {}): ConsequenceInput => ({ job, stories: {}, household: startHousehold(1), money: 1000, ...extra });

function memory(): { store: Map<string, string>; save: SaveSystem } {
  const store = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
  return { store, save: new SaveSystem(storage) };
}

function shiftDays(p: JobProgress, n: number): number[] {
  const out: number[] = [];
  for (let d = p.from; out.length < n; d++) if (scheduled(p, d)) out.push(d);
  return out;
}

/** El turno de ese día con la mejor decisión, `lateBy` minutos tarde (0, puntual). */
function doShift(p: JobProgress, day: number, lateBy = 0): ReturnType<typeof work> {
  const now = abs(day, levelOf(p).start) + lateBy;
  const settled = settle(p, now).progress;
  const choice = [...situationFor(settled, day).choices].sort((a, b) => b.score - a.score)[0];
  return work(settled, now, choice);
}

function opps(s: Partial<GameStateData>, now: number): string[] {
  const day = Math.floor(now / 1440) + 1;
  return opportunities(opportunityInput({ ...createInitialState(), day, hour: Math.floor((now % 1440) / 60), minute: now % 60, ...s }, now)).map((o) => o.id);
}

const counts: Record<string, number> = {};
const pass = (k: string): void => void (counts[k] = (counts[k] ?? 0) + 1);

// ------------------------------------------------------------ 5 · A: faltas, retrasos y despido con Jobs real
const lateCase = (() => {
  // Falta vía settle (y la referencia de reputación real).
  let p = hire(def0, 1);
  const [d1, d2, d3] = shiftDays(p, 3);
  const sr = settleWithReputation(p, {}, endOf(d1), d1);
  assert.deepEqual(sr.missed, [d1]);
  p = sr.progress;
  assert.equal(p.strikes, 1);
  const before = structuredClone(p);
  const repBefore = structuredClone(sr.reputation);
  const r = reconcile(emptyConsequences(), input(p), d1, endOf(d1));
  const c = find(r.state, `shift-missed:${def0.id}:${d1}`)!;
  assert.ok(c && c.status === 'active');
  assert.deepEqual(c.immediateEffects.map((e) => `${e.system}:${e.ref}`), ['jobs:strike', `reputation:missed:${def0.id}:${d1}`]);
  assert.deepEqual(p, before, 'reconcile no toca strikes ni streak');
  assert.deepEqual(sr.reputation, repBefore, 'reconcile no toca la reputación');
  assert.equal(r.notices.length, 1);
  assert.deepEqual([r.notices[0].channel.title, r.notices[0].text], ['Trabajo', NOTICE_TEXT.work]);
  assert.ok(opps({ job: p, consequences: r.state }, endOf(d1)).includes('ascenso-retrasado'));
  // Dos turnos buenos seguidos: resuelta, la oportunidad se va.
  p = doShift(doShift(p, d2).progress, d3).progress;
  assert.equal(p.strikes, 0, 'Jobs perdona la falta');
  const ok = reconcile(r.state, input(p), d3, endOf(d3));
  assert.equal(find(ok.state, c.consequenceId)!.status, 'resolved');
  assert.ok(!opps({ job: p, consequences: ok.state }, endOf(d3)).includes('ascenso-retrasado'));
  pass('A-falta');

  // Retraso vía work: paga prorrateada, sin falta; el ascenso espera mientras esté viva.
  let q = hire(def0, 1);
  const days = shiftDays(q, def0.promoteAfter + 2);
  for (const d of days.slice(0, def0.promoteAfter)) q = doShift(q, d).progress;
  const L = days[def0.promoteAfter];
  const full = doShift(q, L).money;
  const late = doShift(q, L, Math.min(def0.grace + 5, def0.late - 1));
  assert.ok(late.late && late.money < full, 'llegar tarde cobra lo trabajado');
  assert.equal(late.progress.strikes, q.strikes, 'un retraso no es falta');
  q = late.progress;
  const next = def0.levels[1];
  const study = { ...emptyStudy(), unlocks: next?.requires ? [next.requires.unlock] : [] };
  const lr = reconcile(emptyConsequences(), input(q), L, abs(L, 20));
  const lc = find(lr.state, `shift-late:${def0.id}:${L}`)!;
  assert.deepEqual(lc.immediateEffects.map((e) => `${e.system}:${e.ref}`), [`jobs:pay:${L}`]);
  assert.ok(opps({ job: q, study }, abs(L, 20)).includes('ascenso'), 'control: sin registro sale el ascenso');
  const withLate = opps({ job: q, study, consequences: lr.state }, abs(L, 20));
  assert.ok(withLate.includes('ascenso-retrasado') && !withLate.includes('ascenso'));
  const q2 = doShift(q, days[def0.promoteAfter + 1]).progress;
  const lok = reconcile(lr.state, input(q2), days[def0.promoteAfter + 1], abs(days[def0.promoteAfter + 1], 20));
  assert.equal(find(lok.state, lc.consequenceId)!.status, 'resolved');
  const after = opps({ job: q2, study, consequences: lok.state }, abs(days[def0.promoteAfter + 1], 20));
  assert.ok(after.includes('ascenso') && !after.includes('ascenso-retrasado'));
  pass('A-retraso');

  // Despido: maxStrikes faltas.
  const f = hire(def0, 1);
  const fd = shiftDays(f, def0.maxStrikes);
  const fired = settle(f, endOf(fd[fd.length - 1]));
  assert.ok(fired.fired);
  const X = fired.progress.ended!;
  const fr = reconcile(emptyConsequences(), input(fired.progress), X, endOf(X));
  assert.ok(fr.state.items.some((c) => c.consequenceId === `dismissal:${def0.id}:${X}`));
  pass('A-despido');
  return { q, L, lr, fired: fired.progress, X };
})();

// ------------------------------------------------------------ 6 · B: plantón, perdón y arreglo con Story real
const now = (day: number) => ({ day, minute: 12 * 60 });
function friends(def: StoryDef): Applied {
  return { story: { ...createStory(def), flags: { [def.metFlag!]: 1, [def.friendFlag!]: 1 } }, profile: { ...createSocialProfile(), friendship: 45, trust: 35, encounters: 8, contactExchanged: true } };
}
function talk(a: Applied, def: StoryDef, day: number, id: string, choice = 0): Applied {
  const beat = beatAfterTalk(a.story, def, a.profile, now(day), day);
  assert.equal(beat?.id, id, `${def.npc}, día ${day}: esperaba ${id}`);
  const story = presentBeat(a.story, beat!, now(day));
  return beat!.choices ? chooseBeat(story, a.profile, def, beat!, choice, now(day)) : applyEffect(story, a.profile, beat!.then!, now(day));
}
function attend(a: Applied, def: StoryDef, present: boolean): Applied {
  const p = a.story.plan!;
  const plan = def.plans[p.id];
  const c = CHARACTERS.find((x) => x.npc === def.npc)!;
  const started = dayStart(a.story, a.profile, def, { day: p.day, rainy: false, pick: (forced) => routineFor(c, p.day, { forced }).id });
  const result = watchPlan(started.story, started.profile, def, { day: p.day, minute: minuteOf(present ? plan.from : plan.until) }, present);
  assert.ok(result && result.kept === present);
  return result;
}
for (const npc of ['sara', 'ada', 'amaia']) {
  const def = STORIES[npc];
  const base = friends(def);
  const sent = phoneStory(base.story, def, base.profile, now(2), 2)!;
  const yes = chooseBeat(sent.story, sent.profile, def, offerBeat(sent.story, def, now(2), 2)!, 0, now(2));
  const missed = attend(yes, def, false);
  assert.ok(missed.profile.trust < yes.profile.trust, `${npc}: el plantón baja la confianza (Social)`);
  const D = missed.story.plan!.day;
  const stories = (s: Applied): StoryState => ({ [npc]: s.story });
  const r = reconcile(emptyConsequences(), input(null, { stories: stories(missed) }), D, abs(D, 23));
  const id = `planton:${npc}:${D}`;
  assert.equal(find(r.state, id)?.status, 'active');
  assert.deepEqual(r.notices.map((n) => n.text), [NOTICE_TEXT.planton.replace('{persona}', getNpc(npc).name)]);
  const o = opportunities(opportunityInput({ ...createInitialState(), day: D, stories: stories(missed), social: { [npc]: missed.profile }, consequences: r.state }, abs(D, 12)));
  const arreglo = o.find((x) => x.id === 'planton-arreglo');
  assert.ok(arreglo && arreglo.title.includes(getNpc(npc).name), `${npc}: planton-arreglo con su nombre`);
  // Perdón → reparando; venir al plan → resuelta, y la confianza sube por los datos (Story), no por el registro.
  const repair = talk(missed, def, D + 1, 'reconciliar');
  const rr = reconcile(r.state, input(null, { stories: stories(repair) }), D + 1, abs(D + 1, 13));
  assert.equal(find(rr.state, id)?.status, 'repairing');
  const healed = attend(repair, def, true);
  assert.ok(healed.profile.trust > repair.profile.trust);
  const hd = healed.story.plan!.day;
  const hr = reconcile(rr.state, input(null, { stories: stories(healed) }), hd, abs(hd, 23));
  assert.equal(find(hr.state, id)?.status, 'resolved');
  assert.ok(!opportunities(opportunityInput({ ...createInitialState(), day: hd, consequences: hr.state }, abs(hd, 23))).some((x) => x.id === 'planton-arreglo'));
  // Sin reparar: +10 días, caducada, sin tocar la historia ni la confianza.
  const untouched = structuredClone(missed);
  const ex = reconcile(r.state, input(null, { stories: stories(missed) }), D + 10, abs(D + 10, 12));
  assert.equal(find(ex.state, id)?.status, 'expired');
  assert.deepEqual(missed, untouched);
  pass('B');
}

// ------------------------------------------------------------ 7 · C: caída de ingresos y facturas
const scenarioC = (): { first: ReturnType<typeof reconcile>; h: HouseholdState } => {
  const { fired, X } = lateCase;
  const h = syncBills(startHousehold(X - 1), X).household;
  const cov = coverage(h, 0, X);
  assert.ok(cov.due > 0, 'hay obligaciones esta semana');
  const first = reconcile(emptyConsequences(), input(fired, { household: h, money: 0 }), X, endOf(X));
  return { first, h };
};
const { first: cFirst, h: cHouse } = scenarioC();
{
  const { fired, X } = lateCase;
  const cov = coverage(cHouse, 0, X);
  const money = cFirst.notices.filter((n) => n.channel.title === 'Cuentas');
  assert.equal(money.length, 1);
  assert.ok(money[0].text.includes(euros(cov.missing)) && money[0].text.includes(euros(cov.due)));
  assert.ok(money[0].text.includes('vas justo') && money[0].text.includes('vence el') && !money[0].text.includes('venció'), 'antes del vencimiento: «vence el»');
  const rich = reconcile(emptyConsequences(), input(fired, { household: cHouse, money: 100000 }), X, endOf(X));
  assert.equal(rich.notices.length, 0, 'con dinero suficiente, ningún aviso');
  // 'gastos-apuro' aparece; tras cobrar y pagar, desaparece.
  assert.ok(opps({ job: fired, household: cHouse, money: 0, consequences: cFirst.state }, endOf(X)).includes('gastos-apuro'));
  let h = cHouse;
  let wallet = cov.due + 50;
  for (const o of unpaid(h)) {
    const paid = pay(h, wallet, o.bill, o.period, X);
    if (!paid.ok) continue;
    h = paid.household;
    wallet = paid.money;
  }
  assert.ok(!opps({ job: fired, household: h, money: wallet, consequences: cFirst.state }, endOf(X)).includes('gastos-apuro'));
  pass('C');

  // C-vencido: facturas reales que vencen el día D = X−1 sin pagar, despido real el día X, sync en D+2.
  let late: HouseholdState | null = null;
  for (let since = X - 40; since < X && !late; since++) {
    const hh = syncBills(startHousehold(since), X + 1).household;
    if (unpaid(hh)[0]?.due === X - 1) late = hh;
  }
  assert.ok(late, 'hay un periodo de facturas que vence el día anterior al despido');
  const D = X - 1;
  const overdue = reconcile(emptyConsequences(), input(fired, { household: late, money: 0 }), D + 2, abs(D + 2, 10));
  const cuentas = overdue.notices.filter((n) => n.channel.title === 'Cuentas');
  assert.equal(cuentas.length, 1);
  assert.ok(cuentas[0].text.includes('venció') && cuentas[0].text.includes(formatDateShort(D)), cuentas[0].text);
  assert.ok(!cuentas[0].text.includes('vas justo') && !cuentas[0].text.includes('vence el'), cuentas[0].text);
  pass('C-vencido');

  // 2 · doble sync el mismo día: un aviso y un registro por id.
  const again = reconcile(cFirst.state, input(fired, { household: cHouse, money: 0 }), X, endOf(X));
  assert.equal(again.notices.length, 0);
  assert.equal(again.changed, false);
  const ids = again.state.items.map((c) => c.consequenceId);
  assert.equal(new Set(ids).size, ids.length);
  pass('2');

  // Cooldown de 3 días (global) y 4 · recarga con un diferido pendiente.
  const story = { ...createStory(STORIES.sara), events: [{ id: 'planton', day: X + 1, minute: 0 }] };
  const inp = input(fired, { household: cHouse, money: 0, stories: { sara: story } });
  const d1 = reconcile(cFirst.state, inp, X + 1, abs(X + 1, 9));
  assert.equal(d1.notices.length, 0, 'en cooldown no avisa');
  const pending = find(d1.state, `planton:sara:${X + 1}`)!.deferredEffects.find((d) => d.kind === 'notice')!;
  assert.equal(pending.done, false);
  assert.equal(reconcile(d1.state, inp, X + 2, abs(X + 2, 9)).notices.length, 0);
  const { save } = memory();
  assert.ok(save.save({ ...createInitialState(), consequences: d1.state }));
  const loaded = save.load()!.consequences!;
  assert.deepEqual(loaded, d1.state);
  const d3 = reconcile(loaded, inp, X + 3, abs(X + 3, 9));
  assert.deepEqual(d3.notices.map((n) => n.channel.title), ['Gente']);
  assert.ok(save.save({ ...createInitialState(), consequences: d3.state }));
  assert.equal(reconcile(save.load()!.consequences!, inp, X + 3, abs(X + 3, 10)).notices.length, 0, 'tras recargar no se repite');
  pass('cooldown');
  pass('4');
}

// ------------------------------------------------------------ 1 · idempotencia y recargas
{
  const s = cFirst.state;
  const a = reconcile(s, input(lateCase.fired, { household: cHouse, money: 0 }), lateCase.X, endOf(lateCase.X));
  const b = reconcile(a.state, input(lateCase.fired, { household: cHouse, money: 0 }), lateCase.X, endOf(lateCase.X));
  assert.deepEqual(a.state, b.state);
  assert.equal(b.notices.length, 0);
  assert.deepEqual(parseConsequences(JSON.parse(JSON.stringify(s))), s);
  const { save } = memory();
  assert.ok(save.save({ ...createInitialState(), consequences: s }));
  assert.deepEqual(save.load()!.consequences, s);
  pass('1');
}

// ------------------------------------------------------------ 3 · salto de 30 h = ir día a día
{
  const { q, L, lr } = lateCase;
  let s = lr.state;
  for (let d = L + 1; d <= L + 6; d++) s = reconcile(s, input(q), d, abs(d)).state;
  s = reconcile(s, input(q), L + 6, abs(L + 6, 10)).state;
  const step = reconcile(reconcile(s, input(q), L + 7, abs(L + 7)).state, input(q), L + 7, abs(L + 7, 16)).state;
  const jump = reconcile(s, input(q), L + 7, abs(L + 7, 16)).state;
  assert.deepEqual(jump, step);
  assert.equal(find(jump, `shift-late:${def0.id}:${L}`)?.status, 'expired', 'el retraso caduca a los 7 días');
  pass('3');
}

// ------------------------------------------------------------ 8 · migración v5 → v6
{
  const { fired, X } = lateCase;
  const v5 = { ...createInitialState(), job: fired, stories: { sara: createStory(STORIES.sara) }, household: cHouse, day: X };
  const m5 = memory();
  m5.store.set(SAVE_KEY, JSON.stringify({ version: 5, savedAt: 0, state: v5 }));
  const l5 = m5.save.load()!;
  assert.deepEqual(l5.consequences, emptyConsequences());
  const m6 = memory();
  m6.store.set(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, savedAt: 0, state: v5 }));
  const { consequences: _drop, ...rest } = l5;
  assert.deepEqual(rest, m6.save.load(), 'el resto de la v5 carga igual');
  assert.equal(SAVE_VERSION, 6);
  const newer = inspectRaw(JSON.stringify({ version: 7, savedAt: 0, state: v5 }));
  assert.ok(newer.status === 'unreadable' && newer.reason === 'newer');
  const junk = memory();
  junk.store.set(SAVE_KEY, JSON.stringify({ version: 6, savedAt: 0, state: { ...v5, consequences: { items: [1, 'x', { consequenceId: 'a' }, null], lastNoticeDay: Infinity } } }));
  assert.deepEqual(junk.save.load()!.consequences, emptyConsequences());
  junk.store.set(SAVE_KEY, JSON.stringify({ version: 6, savedAt: 0, state: { ...v5, consequences: 'basura' } }));
  assert.deepEqual(junk.save.load()!.consequences, emptyConsequences());
  const mem = new MemoryStorage();
  for (const slot of [1, 2, 3] as const) mem.write(slotKey(slot, SAVE_KEY), JSON.stringify({ version: 5, savedAt: 0, state: { ...v5, money: 100 + slot } }));
  for (const slot of [1, 2, 3] as const) {
    const l = slotSave(mem, slot).load()!;
    assert.deepEqual([l.money, l.consequences], [100 + slot, emptyConsequences()], `ranura ${slot}`);
  }
  pass('8');
}

// ------------------------------------------------------------ 9 · poda
{
  const item = (i: number, status: 'active' | 'resolved', day: number): Consequence => ({
    consequenceId: `planton:p${String(i).padStart(2, '0')}:${day}`, origin: { kind: 'planton', ref: `p${i}`, day }, timestamp: abs(day),
    affectedSystems: ['social'], immediateEffects: [], deferredEffects: [{ id: 'expire', kind: 'expire', dueDay: 1000, done: false }],
    status, ...(status === 'resolved' ? { resolvedDay: day } : {}),
  });
  const resolved = parseConsequences({ items: Array.from({ length: 40 }, (_, i) => item(i, 'resolved', 1 + i)), lastNoticeDay: 0 });
  const r = reconcile(resolved, input(null), 200, abs(200));
  assert.equal(r.state.items.length, MAX_ARCHIVED);
  assert.ok(r.state.items.every((c) => c.status === 'archived' && !('deferredEffects' in c)));
  const actives = { items: Array.from({ length: MAX_ACTIVE + 5 }, (_, i) => item(i, 'active', 50)), lastNoticeDay: 0 };
  const a = reconcile(parseConsequences(actives), input(null), 60, abs(60));
  assert.equal(a.state.items.filter((c) => c.status === 'active').length, MAX_ACTIVE + 5, 'ninguna activa perdida');
  assert.ok(JSON.stringify(r.state).length < 20 * 1024 && JSON.stringify(a.state).length < 20 * 1024);
  pass('9');
}

// ------------------------------------------------------------ 10 · regresión: los propietarios, igual con y sin registro
{
  let p = hire(def0, 1);
  const [d1] = shiftDays(p, 1);
  const alone = settleWithReputation(structuredClone(p), {}, endOf(d1), d1);
  p = alone.progress;
  reconcile(emptyConsequences(), input(p), d1, endOf(d1));
  assert.deepEqual(settleWithReputation(hire(def0, 1), {}, endOf(d1), d1), alone);
  const h0 = syncBills(startHousehold(lateCase.X - 1), lateCase.X);
  reconcile(emptyConsequences(), input(lateCase.fired, { household: h0.household, money: 0 }), lateCase.X, endOf(lateCase.X));
  assert.deepEqual(syncBills(startHousehold(lateCase.X - 1), lateCase.X), h0);
  const o = unpaid(h0.household)[0];
  assert.deepEqual(pay(h0.household, 1000, o.bill, o.period, lateCase.X), pay(cHouse, 1000, o.bill, o.period, lateCase.X));
  assert.equal(JSON.stringify(scenarioC()), JSON.stringify(scenarioC()), 'dos ejecuciones, el mismo JSON');
  pass('10');
}

console.log(`check-consequences: OK (${Object.entries(counts).map(([k, n]) => `${k}×${n}`).join(' · ')}; ids deterministas, diferidos una vez, cooldown ${3} días, v5→v6)`);
