// VID-03 F1 · Microhistorias (systems/MicroStories) y su guardado: `node scripts/check-micro-stories.ts`.
// Control positivo: si migrate no añadiera microStories, (2) falla; si el parse no deduplicara, (3) ve la historia
// dos veces; sin el filtro de excluidos, (4) carga a Sara; sin el tope de activas, (5) deja dos activas.
import assert from 'node:assert/strict';
import { SAVE_KEY, SAVE_VERSION } from '../src/config/constants.ts';
import { createInitialState, inspectRaw, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import {
  chooseMicroStory, COOLDOWN_STORY_DAYS, eligibleActor, emptyMicroStories, EXPIRE_OPTION, explainStory, MAX_ACTIVE, MAX_STEPS,
  MAX_STORIES, offerFor, parseMicroStories, pendingMoney, RESPONSE_WINDOW_DAYS, shortfallSignal, storyLineFor, tickMicroStories,
  type MicroCtx, type MicroEffect, type MicroStoriesState, type MicroStory,
} from '../src/systems/MicroStories.ts';
import { MICRO_STORIES, type MicroStoryDef } from '../src/data/microStories.ts';
import { POPULATION_PROFILES } from '../src/data/population.ts';
import { hoursOn, placeInfo } from '../src/systems/Places.ts';
import { weekIndex } from '../src/systems/Calendar.ts';

function memory(): { store: Map<string, string>; save: SaveSystem } {
  const store = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
  return { store, save: new SaveSystem(storage) };
}
const story = (id: string, extra: Partial<MicroStory> = {}): MicroStory => ({
  id, defId: 'def-a', trigger: { kind: 'npc-shortfall', npc: 'marco' }, actors: ['marco'], state: 'resolved',
  steps: [{ id: `${id}-s0`, day: 1, kind: 'offer' }], deadlines: { respondBy: 4 }, consequences: [], sourceEventId: `ev-${id}`, ...extra,
});

// 1 · basura → vacío
for (const junk of [undefined, null, 1, 'x', [], {}, { items: 'no' }, { v: 1, items: [1, null, 'x', { id: 'a' }, { ...story('b'), actors: [] }] }]) {
  assert.deepEqual(parseMicroStories(junk), emptyMicroStories(), JSON.stringify(junk));
}

// 2 · SAVE_VERSION 12 (VID-07 subió el esquema); migración v8 → v9 idempotente; v13 → 'newer'
assert.equal(SAVE_VERSION, 12);
{
  const v8 = { ...createInitialState(), money: 88 };
  const a = memory();
  a.store.set(SAVE_KEY, JSON.stringify({ version: 8, savedAt: 0, state: v8 }));
  const once = a.save.load()!;
  assert.deepEqual(once.microStories, emptyMicroStories());
  assert.equal(once.money, 88);
  assert.ok(a.save.save(once));
  assert.deepEqual(a.save.load(), once, 'migrar y volver a cargar no cambia nada');
  const b = memory();
  b.store.set(SAVE_KEY, JSON.stringify({ version: 8, savedAt: 0, state: once }));
  assert.deepEqual(b.save.load(), once, 'migrar un estado ya migrado da lo mismo');
  const newer = inspectRaw(JSON.stringify({ version: 13, savedAt: 0, state: v8 }));
  assert.ok(newer.status === 'unreadable' && newer.reason === 'newer');
}

// 3 · ida y vuelta por SaveSystem sin duplicados
{
  const m: MicroStoriesState = {
    v: 1, lastTickDay: 5,
    items: [story('s1', { state: 'active', choice: 'prestar', consequences: [{ id: 'c1', appliedAt: 3, movementId: 'mv-1' }] })],
  };
  const { store, save } = memory();
  assert.ok(save.save({ ...createInitialState(), microStories: m }));
  assert.deepEqual(save.load()!.microStories, m);
  const file = JSON.parse(store.get(SAVE_KEY)!) as { state: { microStories: MicroStoriesState } };
  const first = file.state.microStories.items[0];
  first.consequences.push(structuredClone(first.consequences[0]));
  file.state.microStories.items.push({ ...structuredClone(first), state: 'expired' });
  store.set(SAVE_KEY, JSON.stringify(file));
  assert.deepEqual(save.load()!.microStories, m, 'repetidos: una sola vez, el primero');
}

// 4 · excluidos, desconocidos y defId desconocido fuera; normalización y topes
{
  const raw = {
    lastTickDay: 2.7,
    items: [
      story('x-sara', { actors: ['sara'] }),
      story('x-nadie', { actors: ['marco', 'nadie'] }),
      story('x-trig', { trigger: { kind: 'npc-shortfall', npc: 'sara' } }),
      story('x-def', { defId: 'def-desconocida' }),
      { ...story('ok'), state: 'raro', deadlines: { respondBy: -3.5, responseDue: 6.9 }, steps: Array.from({ length: MAX_STEPS + 4 }, (_, i) => ({ id: `st${i}`, day: i, kind: 'choice' })) },
    ],
  };
  const known = new Set(['def-a']);
  const p = parseMicroStories(raw, known);
  assert.deepEqual(p.items.map((s) => s.id), ['ok']);
  const ok = p.items[0];
  assert.equal(ok.state, 'expired');
  assert.deepEqual(ok.deadlines, { respondBy: 0, responseDue: 6 });
  assert.equal(ok.steps.length, MAX_STEPS);
  assert.equal(p.lastTickDay, 2);
  // Sin knownDefIds, la de defId desconocido entra (F1: el catálogo aún no existe).
  assert.ok(parseMicroStories(raw).items.some((s) => s.id === 'x-def'));

  const many = parseMicroStories({ items: Array.from({ length: MAX_STORIES + 5 }, (_, i) => story(`m${i}`)) });
  assert.equal(many.items.length, MAX_STORIES);
  assert.equal(many.items[0].id, 'm5', 'se quedan las más recientes');
  assert.equal(many.items[MAX_STORIES - 1].id, `m${MAX_STORIES + 4}`);
}

// 5 · con dos activas, sólo queda MAX_ACTIVE (la más reciente); el sobrante pasa a 'expired'
{
  const p = parseMicroStories({ items: [story('old', { state: 'active' }), story('new', { state: 'active', actors: ['rocio'], trigger: { kind: 'npc-shortfall', npc: 'rocio' } })] });
  assert.equal(p.items.filter((s) => s.state === 'active').length, MAX_ACTIVE);
  assert.deepEqual(p.items.map((s) => [s.id, s.state]), [['old', 'expired'], ['new', 'active']]);
}

// ---------------------------------------------------------------- F2/F3 · reductor
// Control positivo: sin el tope por tick, (11) crea más de una; sin appliedAt, (9) aplica 'ignore' dos veces;
// sin la guarda de lastTickDay, (10) repite effects.
const yes = (): boolean => true;
const no = (): boolean => false;
const CTX: MicroCtx = { known: yes, asleep: no, busy: no };
const firstSignal = (from: number, npc = 'nati'): number => {
  for (let d = from; d < from + 400; d++) if (shortfallSignal(d, npc)) return d;
  throw new Error('sin señal');
};
/** Tick día a día desde lastTickDay+1 hasta `to`; devuelve el estado y los effects por día. */
function run(s: MicroStoriesState, to: number, ctx: MicroCtx = CTX, defs: readonly MicroStoryDef[] = MICRO_STORIES): { s: MicroStoriesState; log: Map<number, MicroEffect[]> } {
  const log = new Map<number, MicroEffect[]>();
  for (let d = s.lastTickDay + 1; d <= to; d++) {
    const r = tickMicroStories(s, d, ctx, defs);
    s = r.state;
    log.set(d, r.effects);
  }
  return { s, log };
}
const active = (s: MicroStoriesState): MicroStory[] => s.items.filter((x) => x.state === 'active');

// 6 · catálogo y señal: 'nati' existe, no está excluida, la señal sólo en fin de ciclo
{
  assert.ok(MICRO_STORIES.some((d) => d.id === 'rent-nati' && d.options.some((o) => o.id === EXPIRE_OPTION)));
  for (let d = 0; d < 300; d++) if (shortfallSignal(d, 'nati')) assert.ok(d % 30 >= 26, `señal fuera de ventana: ${d}`);
  assert.ok(eligibleActor('nati', CTX));
  assert.ok(!eligibleActor('sara', CTX), 'excluida');
  assert.ok(!eligibleActor('nadie', CTX), 'no existe');
}

// 7 · trigger real: nace exactamente una el primer día con señal; no nace si el actor no es elegible
const B = firstSignal(1);
{
  const { s, log } = run(emptyMicroStories(), B);
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0].id, `rent-nati#${B}`);
  assert.equal(s.items[0].sourceEventId, `ms:rent-nati:${B}`);
  assert.equal(s.items[0].deadlines.respondBy, B + RESPONSE_WINDOW_DAYS);
  assert.deepEqual(log.get(B), [{ kind: 'offer', npc: 'nati', storyId: `rent-nati#${B}` }]);
  for (let d = 1; d < B; d++) assert.deepEqual(log.get(d), []);
  assert.equal(storyLineFor(s, 'nati', B), MICRO_STORIES[0].pitch);
  for (const ctx of [{ ...CTX, known: no }, { ...CTX, asleep: yes }, { ...CTX, busy: yes }]) {
    assert.equal(run(emptyMicroStories(), B + 60, ctx).s.items.length, 0);
  }
  const excluded: MicroStoryDef = { ...MICRO_STORIES[0], id: 'rent-sara', actors: ['sara'], trigger: { kind: 'npc-shortfall', npc: 'sara' } };
  assert.equal(run(emptyMicroStories(), B + 60, CTX, [excluded]).s.items.length, 0, 'excluido');
}

const born = run(emptyMicroStories(), B).s;
const SID = `rent-nati#${B}`;
const kinds = (e: readonly MicroEffect[]): string[] => e.map((x) => x.kind);

// 8 · las tres opciones dan effects distintos
{
  const lend = chooseMicroStory(born, SID, 'lend', B, { ...CTX, hasGift: false, freeMoney: 100 });
  assert.ok(lend.ok);
  const out = lend.effects.find((e) => e.kind === 'money');
  assert.ok(out && out.kind === 'money' && out.amount === -30 && out.movementId === `ms:${SID}:lend`);
  assert.deepEqual(kinds(lend.effects), ['money', 'rel', 'memory']);
  const next = tickMicroStories(lend.state, B + 1, CTX);
  const back = next.effects.find((e) => e.kind === 'money');
  assert.ok(back && back.kind === 'money' && back.amount === 36 && back.movementId !== out.movementId);
  assert.ok(next.effects.some((e) => e.kind === 'note' && e.id === `ms-${SID}` && e.title.length <= 60 && e.body.includes(`Día ${B}`)));
  assert.equal(next.state.items[0].state, 'resolved');
  assert.equal(storyLineFor(next.state, 'nati', B + 1), MICRO_STORIES[0].options[0].respond.line);
  assert.ok(explainStory(next.state, SID).length === 3);
  // dos veces: nada cambia
  const again = chooseMicroStory(lend.state, SID, 'lend', B, { ...CTX, hasGift: false, freeMoney: 100 });
  assert.ok(!again.ok && again.state === lend.state && again.effects.length === 0);

  const poor = chooseMicroStory(born, SID, 'lend', B, { ...CTX, hasGift: false, freeMoney: 10 });
  assert.ok(!poor.ok && poor.state === born && poor.message.length > 0);
  const noGift = chooseMicroStory(born, SID, 'gift', B, { ...CTX, hasGift: false, freeMoney: 100 });
  assert.ok(!noGift.ok && noGift.state === born);

  const gift = chooseMicroStory(born, SID, 'gift', B, { ...CTX, hasGift: true, freeMoney: 0 });
  assert.ok(gift.ok);
  assert.deepEqual(kinds(gift.effects), ['gift']);
  const g2 = run(gift.state, B + 2);
  assert.ok(!kinds(g2.log.get(B + 2)!).includes('money') && kinds(g2.log.get(B + 2)!).includes('line'));
  assert.deepEqual(g2.log.get(B + 1), []);

  const ign = chooseMicroStory(born, SID, 'ignore', B, { ...CTX, hasGift: false, freeMoney: 0 });
  assert.ok(ign.ok && !kinds(ign.effects).includes('money'));
  const rel = ign.effects.find((e) => e.kind === 'rel');
  assert.ok(rel && rel.kind === 'rel' && Object.values(rel.delta).every((v) => (v ?? 0) < 0));
}

// 9 · sin elección: expira con los effects de 'ignore' una vez; la siguiente no antes del cooldown
{
  const { s, log } = run(born, B + 120);
  const first = s.items.find((x) => x.id === SID)!;
  assert.equal(first.state, 'expired');
  assert.equal(first.choice, EXPIRE_OPTION);
  for (let d = B + 1; d <= B + RESPONSE_WINDOW_DAYS; d++) assert.deepEqual(log.get(d), [], `aún en plazo: ${d}`);
  const exp = B + RESPONSE_WINDOW_DAYS + 1;
  assert.deepEqual(kinds(log.get(exp)!), ['rel', 'memory', 'note']);
  const all = [...log.values()].flat();
  assert.equal(all.filter((e) => e.kind === 'memory').length, s.items.filter((x) => x.state === 'expired').length, 'una memoria por expirada');
  assert.ok(s.items.length >= 2, 'nace otra tras el cooldown');
  const second = s.items[1];
  const start2 = second.steps[0].day;
  assert.ok(start2 >= exp + COOLDOWN_STORY_DAYS, `antes del cooldown: ${start2}`);
  assert.equal(start2, firstSignal(exp + COOLDOWN_STORY_DAYS));
}

// 10 · idempotencia: tick(tick(s,d),d) y serialize→parse→tick
{
  const a = tickMicroStories(born, B + 2, CTX);
  const b = tickMicroStories(a.state, B + 2, CTX);
  assert.ok(b.state === a.state && b.effects.length === 0);
  const reparsed = parseMicroStories(JSON.parse(JSON.stringify(a.state)), new Set(MICRO_STORIES.map((d) => d.id)));
  assert.deepEqual(reparsed, a.state);
  assert.equal(tickMicroStories(reparsed, B + 2, CTX).effects.length, 0);
}

// 11 · dos defs: nunca más de una activa; un hueco de 30 días crea como mucho una
{
  const other: MicroStoryDef = { ...MICRO_STORIES[0], id: 'zz-test', priority: 5, actors: ['marco'], trigger: { kind: 'npc-shortfall', npc: 'marco' } };
  const defs = [MICRO_STORIES[0], other];
  let s = emptyMicroStories();
  for (let d = 1; d <= 400; d++) {
    s = tickMicroStories(s, d, CTX, defs).state;
    assert.ok(active(s).length <= MAX_ACTIVE, `día ${d}`);
  }
  assert.ok(s.items.some((x) => x.defId === 'zz-test') && s.items.some((x) => x.defId === 'rent-nati'));
  const gap = tickMicroStories({ ...emptyMicroStories(), lastTickDay: 1 }, 31 + 30 * 5, CTX, defs);
  assert.ok(gap.state.items.length <= 1 && gap.effects.filter((e) => e.kind === 'offer').length <= 1);
  assert.ok(explainStory(s, s.items[0].id).every((l) => l.startsWith('Día ')));
}

// 12 · F4: dinero idempotente por movementId (ya en el ledger o repetido en la lista, no se aplica) y oferta por NPC
{
  const m = (movementId: string, amount: number): MicroEffect => ({ kind: 'money', amount, movementId, why: 't' });
  const effects: MicroEffect[] = [m('ms:a:lend', -30), { kind: 'memory', npc: 'nati', text: 'x' }, m('ms:a:repay', 36), m('ms:a:lend', -30)];
  assert.deepEqual(pendingMoney(effects, []).map((e) => e.movementId), ['ms:a:lend', 'ms:a:repay']);
  assert.deepEqual(pendingMoney(effects, ['ms:a:lend']).map((e) => e.movementId), ['ms:a:repay']);
  assert.equal(pendingMoney(effects, ['ms:a:lend', 'ms:a:repay']).length, 0);
  const off = offerFor(born, 'nati', B, false, 10);
  assert.ok(off && off.storyId === SID);
  assert.ok(off.options.find((o) => o.id === 'lend')?.blocked && off.options.find((o) => o.id === 'gift')?.blocked);
  assert.equal(off.options.find((o) => o.id === EXPIRE_OPTION)?.blocked, null);
  assert.equal(offerFor(born, 'marco', B, true, 100), null);
  assert.equal(offerFor(born, 'nati', B + RESPONSE_WINDOW_DAYS + 1, true, 100), null);
}

// 13 · «Ahora no» (no elegir) no gasta la historia: sigue activa y la oferta sigue en pie al día siguiente
{
  const later = run(born, B + 1).s;
  assert.equal(later.items.find((x) => x.id === SID)?.state, 'active');
  assert.equal(offerFor(later, 'nati', B + 1, false, 0)?.storyId, SID);
}

// 14 · el concepto del ledger es texto de datos, nunca el id interno de la def
{
  const lendDef = MICRO_STORIES[0].options.find((o) => o.id === 'lend')!;
  const lend = chooseMicroStory(born, SID, 'lend', B, { ...CTX, hasGift: false, freeMoney: 100 });
  const back = tickMicroStories(lend.state, B + 1, CTX).effects;
  const whys = [...lend.effects, ...back].flatMap((e) => (e.kind === 'money' ? [e.why] : []));
  assert.deepEqual(whys, [lendDef.effects.ledger, lendDef.respond.ledger]);
  assert.ok(whys.every((w) => w !== undefined && !w.includes('rent-nati')), JSON.stringify(whys));
}

// 15 · cada señal de Nati deja al menos un día con su barbería abierta dentro de la ventana de respuesta.
// El place se busca por datos: el perfil de población cuyo staff lleva npc 'nati'; los días, con Places.hoursOn.
{
  const placeId = POPULATION_PROFILES.find((p) => p.staff?.some((s) => s.npc === 'nati'))?.place;
  const place = placeId ? placeInfo(placeId) : undefined;
  assert.ok(place, 'el local de Nati sale de population');
  for (let d = 1; d <= 120; d++) {
    if (!shortfallSignal(d, 'nati')) continue;
    const opens = Array.from({ length: RESPONSE_WINDOW_DAYS + 1 }, (_, k) => d + k).some((x) => hoursOn(place, weekIndex(x)) !== null);
    assert.ok(opens, `señal del día ${d} sin ningún día abierto en [${d}, ${d + RESPONSE_WINDOW_DAYS}]`);
  }
}

console.log('check-micro-stories: OK (basura, SAVE_VERSION 9, migración v8→v9, newer, ida y vuelta, excluidos y topes, MAX_ACTIVE, trigger, opciones, expiración y cooldown, idempotencia, dos defs y hueco, dinero F4 y oferta, «Ahora no», concepto del ledger, ventana con la barbería abierta)');
