// Sin Phaser: lo usan GameState, SaveSystem y scripts/check-micro-stories.ts.
/**
 * VID-03 · Microhistorias (F1: modelo y guardado). Historias cortas de varios pasos con un NPC con nombre, con plazos,
 * topes fijos y consecuencias trazables. Estado serializable, pensado para un reloj compartido (multijugador).
 *
 * DECLARACIÓN: no existe empleo funcional de NPC (en namedPeople `work` es texto, `staff` de population sólo coloca, y
 * Jobs.ts y data/jobs.ts son del jugador), así que la historia vertical es la alternativa «El alquiler de Nati»,
 * basada en dinero/ledger, regalos, SocialProfile, teléfono y notas. Tampoco hay director global de eventos:
 * WorldEvents, StreetEvents y MetroEventManager son ciclos por sitio y Opportunities es derivada. Este módulo es un
 * reductor de datos y no un motor paralelo.
 */

import { MICRO_STORIES, type MicroOptionDef, type MicroOptionEffects, type MicroStoryDef } from '../data/microStories.ts';
import { NPC_DEFS } from '../data/npcs.ts';
import { hashSeed, seededRng } from './MetroDaily.ts';
import type { SocialDelta } from './Social.ts';
import { EXCLUDED_NPCS } from './SocialGraph.ts';

export type MicroStoryState = 'planned' | 'active' | 'resolved' | 'expired';
export type MicroTrigger = { kind: 'npc-shortfall'; npc: string };
export interface MicroStep { id: string; day: number; kind: 'offer' | 'choice' | 'response'; option?: string }
export interface MicroConsequence { id: string; appliedAt?: number; movementId?: string; memoryRef?: string }
export interface MicroStory {
  id: string;
  defId: string;
  trigger: MicroTrigger;
  actors: string[];
  state: MicroStoryState;
  steps: MicroStep[];
  deadlines: { respondBy: number; responseDue?: number };
  consequences: MicroConsequence[];
  resolvedAt?: number;
  sourceEventId: string;
  choice?: string;
}
export interface MicroStoriesState { v: 1; items: MicroStory[]; lastTickDay: number }

export const MAX_ACTIVE = 1;
export const COOLDOWN_STORY_DAYS = 14;
export const COOLDOWN_ACTOR_DAYS = 10;
export const COOLDOWN_GLOBAL_DAYS = 3;
export const RESPONSE_WINDOW_DAYS = 3;
export const MAX_STORIES = 12;
export const MAX_STEPS = 8;
export const MAX_CATCHUP_DAYS = 3;

const STATES: readonly MicroStoryState[] = ['planned', 'active', 'resolved', 'expired'];
const STEP_KINDS: readonly MicroStep['kind'][] = ['offer', 'choice', 'response'];
const KNOWN: ReadonlySet<string> = new Set(NPC_DEFS.map((n) => n.id));
const eligible = (id: string): boolean => KNOWN.has(id) && !EXCLUDED_NPCS.has(id);

export const emptyMicroStories = (): MicroStoriesState => ({ v: 1, items: [], lastTickDay: 0 });

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string' && v !== '';
const day = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const optDay = (v: unknown): number | undefined => (v === undefined ? undefined : day(v));

function parseStep(v: unknown): MicroStep | null {
  if (!isRecord(v) || !str(v.id) || !STEP_KINDS.includes(v.kind as MicroStep['kind'])) return null;
  return { id: v.id, day: day(v.day), kind: v.kind as MicroStep['kind'], ...(str(v.option) ? { option: v.option } : {}) };
}

function parseConsequence(v: unknown): MicroConsequence | null {
  if (!isRecord(v) || !str(v.id)) return null;
  const appliedAt = optDay(v.appliedAt);
  return {
    id: v.id,
    ...(appliedAt === undefined ? {} : { appliedAt }),
    ...(str(v.movementId) ? { movementId: v.movementId } : {}),
    ...(str(v.memoryRef) ? { memoryRef: v.memoryRef } : {}),
  };
}

function parseStory(v: unknown, knownDefIds?: ReadonlySet<string>): MicroStory | null {
  if (!isRecord(v) || !str(v.id) || !str(v.defId) || typeof v.sourceEventId !== 'string') return null;
  if (knownDefIds && !knownDefIds.has(v.defId)) return null;
  const t = v.trigger;
  if (!isRecord(t) || t.kind !== 'npc-shortfall' || !str(t.npc) || !eligible(t.npc)) return null;
  if (!Array.isArray(v.actors) || v.actors.length === 0) return null;
  if (!v.actors.every((a): a is string => typeof a === 'string' && eligible(a))) return null;
  const steps = (Array.isArray(v.steps) ? v.steps : []).map(parseStep).filter((s): s is MicroStep => s !== null);
  const consequences: MicroConsequence[] = [];
  for (const raw of Array.isArray(v.consequences) ? v.consequences : []) {
    const c = parseConsequence(raw);
    if (c && !consequences.some((x) => x.id === c.id)) consequences.push(c);
  }
  const dl = isRecord(v.deadlines) ? v.deadlines : {};
  const responseDue = optDay(dl.responseDue);
  const resolvedAt = optDay(v.resolvedAt);
  return {
    id: v.id,
    defId: v.defId,
    trigger: { kind: 'npc-shortfall', npc: t.npc },
    actors: [...new Set(v.actors as string[])],
    state: STATES.includes(v.state as MicroStoryState) ? (v.state as MicroStoryState) : 'expired',
    steps: steps.slice(0, MAX_STEPS),
    deadlines: { respondBy: day(dl.respondBy), ...(responseDue === undefined ? {} : { responseDue }) },
    consequences,
    ...(resolvedAt === undefined ? {} : { resolvedAt }),
    sourceEventId: v.sourceEventId,
    ...(str(v.choice) ? { choice: v.choice } : {}),
  };
}

/**
 * Lo guardado, validado: basura → vacío; ids repetidos, el primero; defId desconocido (si se da knownDefIds),
 * actores excluidos o que no existen, fuera; recortado a MAX_STORIES (las más recientes, al final de la lista) y,
 * si hay más de MAX_ACTIVE activas, las más antiguas pasan a 'expired'.
 */
export function parseMicroStories(v: unknown, knownDefIds?: ReadonlySet<string>): MicroStoriesState {
  if (!isRecord(v)) return emptyMicroStories();
  const seen = new Set<string>();
  const items: MicroStory[] = [];
  for (const raw of Array.isArray(v.items) ? v.items : []) {
    const s = parseStory(raw, knownDefIds);
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    items.push(s);
  }
  // Recorrido de la más reciente a la más antigua: las primeras MAX_ACTIVE activas se quedan.
  let active = 0;
  const kept = items.slice(-MAX_STORIES).reverse()
    .map((s): MicroStory => (s.state === 'active' && ++active > MAX_ACTIVE ? { ...s, state: 'expired' } : s))
    .reverse();
  return { v: 1, items: kept, lastTickDay: day(v.lastTickDay) };
}

// ---------------------------------------------------------------- F2/F3 · reductor puro

/** Lo que F4 aplica con los sistemas reales (ledger, applyDelta, noteSocialMemory, giveGift, saveNote, postMessage). */
export type MicroEffect =
  | { kind: 'money'; amount: number; movementId: string; why: string }
  | { kind: 'rel'; npc: string; delta: Partial<SocialDelta> }
  | { kind: 'memory'; npc: string; text: string }
  | { kind: 'gift'; npc: string }
  | { kind: 'note'; id: string; title: string; body: string }
  | { kind: 'line'; npc: string; text: string }
  | { kind: 'offer'; npc: string; storyId: string };

/** F4 decide cómo se calcula cada pregunta; aquí sólo se consulta. */
export interface MicroCtx {
  known: (npc: string) => boolean;
  asleep: (npc: string) => boolean;
  busy: (npc: string) => boolean;
}

/** La opción que se aplica si nadie elige antes de respondBy. Toda def debe tenerla. */
export const EXPIRE_OPTION = 'ignore';
const SHORTFALL_FROM = 26;
const SHORTFALL_P = 0.5;

/** Fin de ciclo (`day % 30 >= 26`) y, de esos días, ~la mitad por azar determinista (npc, día). */
export function shortfallSignal(d: number, npc: string): boolean {
  return d % 30 >= SHORTFALL_FROM && seededRng(hashSeed('ms-shortfall', npc, d))() < SHORTFALL_P;
}

export function eligibleActor(npc: string, ctx: MicroCtx): boolean {
  return eligible(npc) && ctx.known(npc) && !ctx.asleep(npc) && !ctx.busy(npc);
}

const triggerFires = (t: MicroTrigger, d: number): boolean => t.kind === 'npc-shortfall' && shortfallSignal(d, t.npc);
const defOf = (defs: readonly MicroStoryDef[], id: string): MicroStoryDef | undefined => defs.find((x) => x.id === id);
const optionOf = (def: MicroStoryDef | undefined, id: string | undefined): MicroOptionDef | undefined => def?.options.find((o) => o.id === id);
const startOf = (s: MicroStory): number => s.steps.find((x) => x.kind === 'offer')?.day ?? s.deadlines.respondBy - RESPONSE_WINDOW_DAYS;
/** Cuándo dejó de ocupar: resolvedAt; si no hay, el plazo de respuesta. Activa: nunca (Infinity). */
const endOf = (s: MicroStory): number => (s.state === 'active' ? Infinity : s.resolvedAt ?? s.deadlines.respondBy);
const cid = (s: MicroStory, part: string): string => `${s.id}:${part}`;
const applied = (s: MicroStory, part: string): boolean => s.consequences.some((c) => c.id === cid(s, part) && c.appliedAt !== undefined);
const mark = (s: MicroStory, part: string, d: number, movementId?: string): void => {
  s.consequences = s.consequences.filter((c) => c.id !== cid(s, part));
  s.consequences.push({ id: cid(s, part), appliedAt: d, ...(movementId ? { movementId } : {}) });
};
const movementIdOf = (s: MicroStory, movement = 'money'): string => `ms:${s.id}:${movement}`;

function optionEffects(s: MicroStory, o: MicroOptionDef): { effects: MicroEffect[]; movementId?: string } {
  const npc = s.actors[0];
  const e: MicroOptionEffects = o.effects;
  const out: MicroEffect[] = [];
  let movementId: string | undefined;
  if (e.money) {
    movementId = movementIdOf(s, e.movement);
    out.push({ kind: 'money', amount: e.money, movementId, why: e.ledger ?? o.label });
  }
  if (e.rel) out.push({ kind: 'rel', npc, delta: { ...e.rel } });
  if (e.memory) out.push({ kind: 'memory', npc, text: e.memory });
  if (e.gift) out.push({ kind: 'gift', npc });
  return { effects: out, ...(movementId ? { movementId } : {}) };
}

const noteOf = (s: MicroStory, o: MicroOptionDef, d: number): MicroEffect =>
  ({ kind: 'note', id: `ms-${s.id}`, title: o.texts.recall.title.slice(0, 60), body: o.texts.recall.body.replace(/\{day\}/g, String(d)) });

function emitNote(s: MicroStory, o: MicroOptionDef, d: number, out: MicroEffect[]): void {
  if (applied(s, 'note')) return;
  const at = s.steps.find((x) => x.kind === 'choice')?.day ?? d;
  out.push(noteOf(s, o, at));
  mark(s, 'note', d);
}

function canStart(items: readonly MicroStory[], def: MicroStoryDef, d: number, ctx: MicroCtx): boolean {
  if (items.length && d - Math.max(...items.map(startOf)) < COOLDOWN_GLOBAL_DAYS) return false;
  const storyCd = Math.max(def.cooldownDays, COOLDOWN_STORY_DAYS);
  if (items.some((s) => s.defId === def.id && d - endOf(s) < storyCd)) return false;
  if (items.some((s) => s.actors.some((a) => def.actors.includes(a)) && d - endOf(s) < COOLDOWN_ACTOR_DAYS)) return false;
  return def.actors.length > 0 && def.actors.every((a) => eligibleActor(a, ctx)) && triggerFires(def.trigger, d);
}

/**
 * Un tick por día de juego. Idempotente: `today <= lastTickDay` devuelve la misma referencia. Recupera como mucho
 * MAX_CATCHUP_DAYS días; en cada uno expira, entrega respuestas y, como mucho una vez por tick, hace nacer una historia.
 */
export function tickMicroStories(
  state: MicroStoriesState, today: number, ctx: MicroCtx, defs: readonly MicroStoryDef[] = MICRO_STORIES,
): { state: MicroStoriesState; effects: MicroEffect[] } {
  if (today <= state.lastTickDay) return { state, effects: [] };
  const next: MicroStoriesState = structuredClone(state);
  const effects: MicroEffect[] = [];
  const ranked = [...defs].sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let born = false;
  for (let d = Math.max(state.lastTickDay + 1, today - MAX_CATCHUP_DAYS + 1); d <= today; d++) {
    for (const s of next.items) {
      const def = defOf(defs, s.defId);
      // a · sin elección y fuera de plazo: se aplica 'ignore' una vez.
      if (s.state === 'active' && s.choice === undefined && s.deadlines.respondBy < d) {
        const o = optionOf(def, EXPIRE_OPTION);
        s.state = 'expired';
        s.choice = EXPIRE_OPTION;
        s.resolvedAt = d;
        s.steps.push({ id: cid(s, 'expire'), day: d, kind: 'choice', option: EXPIRE_OPTION });
        if (def && o && !applied(s, 'choice')) {
          const r = optionEffects(s, o);
          effects.push(...r.effects);
          mark(s, 'choice', d, r.movementId);
          s.deadlines.responseDue = d + o.responseInDays;
          emitNote(s, o, d, effects);
        }
      }
      // b · respuestas debidas.
      const due = s.deadlines.responseDue;
      if (s.choice !== undefined && due !== undefined && due <= d && s.state !== 'planned' && !applied(s, 'response')) {
        const o = optionOf(def, s.choice);
        const npc = s.actors[0];
        if (o) {
          if (o.respond.money) {
            const movementId = movementIdOf(s, o.respond.movement);
            effects.push({ kind: 'money', amount: o.respond.money, movementId, why: o.respond.ledger ?? o.label });
            mark(s, 'response', d, movementId);
          } else mark(s, 'response', d);
          effects.push({ kind: 'line', npc, text: o.respond.line });
          s.steps.push({ id: cid(s, 'response'), day: d, kind: 'response', option: o.id });
          if (s.state === 'active') {
            s.state = 'resolved';
            s.resolvedAt = d;
            emitNote(s, o, d, effects);
          }
        }
      }
    }
    // c · como mucho una historia nueva por tick.
    if (born || next.items.filter((s) => s.state === 'active').length >= MAX_ACTIVE) continue;
    const def = ranked.find((x) => canStart(next.items, x, d, ctx));
    if (!def) continue;
    const id = `${def.id}#${d}`;
    if (next.items.some((s) => s.id === id)) continue;
    next.items.push({
      id, defId: def.id, trigger: { ...def.trigger }, actors: [...def.actors], state: 'active',
      steps: [{ id: `${id}:offer`, day: d, kind: 'offer' }], deadlines: { respondBy: d + RESPONSE_WINDOW_DAYS },
      consequences: [], sourceEventId: `ms:${def.id}:${d}`,
    });
    effects.push({ kind: 'offer', npc: def.actors[0], storyId: id });
    born = true;
  }
  next.items = next.items.slice(-MAX_STORIES);
  next.lastTickDay = today;
  return { state: next, effects };
}

/** Por qué no se puede elegir una opción ahora (null si sí). Sale de los datos de la opción, no de su id. */
function blockedBy(o: MicroOptionDef, hasGift: boolean, freeMoney: number): string | null {
  if (o.effects.money !== undefined && o.effects.money < 0 && freeMoney < -o.effects.money) return `No tienes ${-o.effects.money} € libres.`;
  if (o.effects.gift && !hasGift) return 'No llevas ningún regalo en la bolsa.';
  return null;
}

/** F4 · La historia activa sin elegir de este NPC, con sus opciones y por qué no se puede cada una (null si sí). */
export function offerFor(
  state: MicroStoriesState, npc: string, today: number, hasGift: boolean, freeMoney: number, defs: readonly MicroStoryDef[] = MICRO_STORIES,
): { storyId: string; pitch: string; options: { id: string; label: string; blocked: string | null }[] } | null {
  const s = state.items.find((x) => x.state === 'active' && x.choice === undefined && x.actors.includes(npc) && today <= x.deadlines.respondBy);
  const def = s && defOf(defs, s.defId);
  if (!s || !def) return null;
  return { storyId: s.id, pitch: def.pitch, options: def.options.map((o) => ({ id: o.id, label: o.label, blocked: blockedBy(o, hasGift, freeMoney) })) };
}

/**
 * F4 · Los efectos de dinero que aún hay que aplicar: los que no tienen su movementId en el ledger (ni repetido en la
 * propia lista). Así una recarga o un doble tick nunca cobran ni pagan dos veces.
 */
export function pendingMoney(effects: readonly MicroEffect[], ledgerIds: Iterable<string>): Extract<MicroEffect, { kind: 'money' }>[] {
  const seen = new Set(ledgerIds);
  const out: Extract<MicroEffect, { kind: 'money' }>[] = [];
  for (const e of effects) {
    if (e.kind !== 'money' || seen.has(e.movementId)) continue;
    seen.add(e.movementId);
    out.push(e);
  }
  return out;
}

/** Elegir una opción. Puro e idempotente: sólo actúa sobre una historia activa sin elección. */
export function chooseMicroStory(
  state: MicroStoriesState, storyId: string, optionId: string, today: number,
  ctx: MicroCtx & { hasGift: boolean; freeMoney: number }, defs: readonly MicroStoryDef[] = MICRO_STORIES,
): { ok: boolean; state: MicroStoriesState; effects: MicroEffect[]; message: string } {
  const no = (message: string): { ok: false; state: MicroStoriesState; effects: MicroEffect[]; message: string } => ({ ok: false, state, effects: [], message });
  const cur = state.items.find((s) => s.id === storyId);
  if (!cur || cur.state !== 'active' || cur.choice !== undefined) return no('Eso ya está decidido.');
  if (today > cur.deadlines.respondBy) return no('Ya es tarde para eso.');
  const def = defOf(defs, cur.defId);
  const o = optionOf(def, optionId);
  if (!def || !o) return no('Esa opción no existe.');
  const why = blockedBy(o, ctx.hasGift, ctx.freeMoney);
  if (why) return no(why);
  const next: MicroStoriesState = structuredClone(state);
  const s = next.items.find((x) => x.id === storyId)!;
  const r = optionEffects(s, o);
  s.choice = o.id;
  s.steps.push({ id: cid(s, 'choice'), day: today, kind: 'choice', option: o.id });
  mark(s, 'choice', today, r.movementId);
  s.deadlines.responseDue = today + o.responseInDays;
  return { ok: true, state: next, effects: r.effects, message: o.texts.offer };
}

const REL_NAMES: Readonly<Record<keyof SocialDelta, string>> = { friendship: 'amistad', attraction: 'atracción', trust: 'confianza', romance: 'romance', mood: 'ánimo' };
const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);
function describe(e: MicroOptionEffects): string {
  const parts: string[] = [];
  if (e.money) parts.push(`${signed(e.money)} €`);
  for (const [k, v] of Object.entries(e.rel ?? {}) as [keyof SocialDelta, number][]) parts.push(`${REL_NAMES[k]} ${signed(v)}`);
  if (e.gift) parts.push('regalo');
  return parts.join(', ') || 'nada';
}

/** La traza: «Día N: opción → efecto → recuerdo», un renglón por paso. */
export function explainStory(state: MicroStoriesState, id: string, defs: readonly MicroStoryDef[] = MICRO_STORIES): string[] {
  const s = state.items.find((x) => x.id === id);
  if (!s) return [];
  const def = defOf(defs, s.defId);
  return s.steps.map((st) => {
    if (st.kind === 'offer') return `Día ${st.day}: planteamiento → ${s.actors.join(', ')} → ${def?.pitch ?? s.defId}`;
    const o = optionOf(def, st.option);
    if (st.kind === 'choice') {
      const label = st.id === cid(s, 'expire') ? `sin respuesta (${o?.label ?? st.option})` : o?.label ?? st.option ?? '?';
      return `Día ${st.day}: ${label} → ${o ? describe(o.effects) : '?'} → ${o?.effects.memory ?? 'sin recuerdo'}`;
    }
    const back = o?.respond.money ? `${signed(o.respond.money)} €` : 'sin dinero';
    return `Día ${st.day}: respuesta → ${back} → «${o?.respond.line ?? ''}»`;
  });
}

/** La línea pendiente al hablar con el NPC: la oferta si está activa sin elegir, o la respuesta aplicada hoy. */
export function storyLineFor(state: MicroStoriesState, npc: string, today: number, defs: readonly MicroStoryDef[] = MICRO_STORIES): string | null {
  for (let i = state.items.length - 1; i >= 0; i--) {
    const s = state.items[i];
    if (!s.actors.includes(npc)) continue;
    const def = defOf(defs, s.defId);
    if (s.state === 'active' && s.choice === undefined && def) return def.pitch;
    const r = s.consequences.find((c) => c.id === cid(s, 'response'));
    if (r?.appliedAt === today) return optionOf(def, s.choice)?.respond.line ?? null;
  }
  return null;
}
