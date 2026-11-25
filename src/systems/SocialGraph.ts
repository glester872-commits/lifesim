// Sin Phaser: lo usan GameState, SaveSystem y scripts/check-social-graph.ts.
/**
 * VID-02 · Relaciones autónomas entre NPC (F1: modelo y guardado). Un grafo pequeño y acotado de aristas entre
 * personajes con nombre (data/npcs.ts). Se siembra desde NAMED_RELATIONSHIPS (data/namedPeople.ts), sin copiarlo:
 * sólo los pares de trabajo son simulables; parejas, matrimonios y exes son historias protegidas y no entran.
 * Estado serializable y con topes fijos, pensado para un reloj compartido (multijugador).
 */

import { NPC_DEFS } from '../data/npcs.ts';
import { NAMED_RELATIONSHIPS, type NamedRelationship } from '../data/namedPeople.ts';
import type { RelationType } from '../data/identity.ts';
import { STORIES } from '../data/saraStory.ts';
import { PREGNANCIES } from '../data/pregnancy.ts';
import { MATES } from '../data/roommate.ts';
import { SOCIAL_CAUSES, SOCIAL_LINES, type SocialLineKey } from '../data/socialCauses.ts';
import { hashSeed, seededRng } from './MetroDaily.ts';

export type SocialTie = 'friend' | 'acquaintance' | 'tension' | 'rift';

export interface SocialEdge {
  /** `${min}|${max}` con los ids ordenados (edgeIdOf). */
  edgeId: string;
  npcA: string;
  npcB: string;
  type: SocialTie;
  /** Entero de -100 a 100. */
  weight: number;
  /** Día de juego del último cambio. */
  lastChangedAt: number;
  /** Como mucho MAX_ORIGINS, los más recientes (FIFO). */
  originEventIds: string[];
}

export interface SocialGraphEvent {
  id: string;
  day: number;
  edgeId: string;
  cause: string;
  delta: number;
}

export interface SocialGraphState {
  v: 1;
  edges: SocialEdge[];
  events: SocialGraphEvent[];
  /** Por NPC: la última causa que recuerda, el día en que pasó y el día en que lo contó. */
  memory: Record<string, { cause: string; day: number; spokenDay: number }>;
  lastTickDay: number;
}

export const MAX_EDGES = 12;
export const MAX_EDGES_PER_NPC = 3;
export const MAX_EVENTS = 24;
export const MAX_EVENTS_PER_TICK = 2;
export const MAX_CATCHUP_DAYS = 3;
export const EVENT_TTL_DAYS = 30;
const MAX_ORIGINS = 4;

const TIES: readonly SocialTie[] = ['friend', 'acquaintance', 'tension', 'rift'];
/** Relaciones de pareja: protegidas, quien las tiene no entra en la simulación. */
const PARTNER: readonly RelationType[] = ['couple', 'married', 'dating'];
/** Pares que nunca se simulan aunque los dos estén libres. */
const PROTECTED_PAIRS: readonly RelationType[] = ['couple', 'married', 'dating', 'exes'];
/** Relación escrita → arista inicial. Sólo el trabajo es simulable (coworkerPairs). */
const SEED: Partial<Record<RelationType, { type: SocialTie; weight: number }>> = {
  coworkers: { type: 'acquaintance', weight: 0 },
};

/**
 * Quien no entra nunca: Sara, Ada y Amaia y todo el que tenga historia (data/saraStory STORIES), embarazo
 * (data/pregnancy), compañero de piso (data/roommate) o pareja en NAMED_RELATIONSHIPS. Sale de los datos, no a mano.
 */
export const EXCLUDED_NPCS: ReadonlySet<string> = new Set([
  'sara', 'ada', 'amaia',
  ...Object.values(STORIES).map((s) => s.npc),
  ...PREGNANCIES.map((p) => p.npc),
  ...MATES.map((m) => m.npc),
  ...NAMED_RELATIONSHIPS.filter((r) => PARTNER.includes(r.type)).flatMap((r) => [r.a, r.b]),
]);

const KNOWN: ReadonlySet<string> = new Set(NPC_DEFS.map((n) => n.id));
const simulable = (id: string): boolean => KNOWN.has(id) && !EXCLUDED_NPCS.has(id);

export const edgeIdOf = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const emptySocialGraph = (): SocialGraphState => ({ v: 1, edges: [], events: [], memory: {}, lastTickDay: 0 });

/** Los pares simulables: relaciones de trabajo de NAMED_RELATIONSHIPS entre dos NPC no excluidos. */
export function coworkerPairs(): NamedRelationship[] {
  return NAMED_RELATIONSHIPS.filter((r) => SEED[r.type] !== undefined && !PROTECTED_PAIRS.includes(r.type) && r.a !== r.b && simulable(r.a) && simulable(r.b));
}

/** El grafo inicial desde unos pares (por defecto, coworkerPairs). Lo que no esté en SEED o no sea simulable, fuera. */
export function seedSocialGraph(pairs: readonly NamedRelationship[] = coworkerPairs()): SocialGraphState {
  const edges = pairs.flatMap((r): SocialEdge[] => {
    const seed = SEED[r.type];
    if (!seed || PROTECTED_PAIRS.includes(r.type)) return [];
    const [npcA, npcB] = r.a < r.b ? [r.a, r.b] : [r.b, r.a];
    return [{ edgeId: edgeIdOf(npcA, npcB), npcA, npcB, type: seed.type, weight: seed.weight, lastChangedAt: 0, originEventIds: [] }];
  });
  return parseSocialGraph({ ...emptySocialGraph(), edges });
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const day = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const int = (v: unknown, lo: number, hi: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 0;

function parseEdge(v: unknown): SocialEdge | null {
  if (!isRecord(v) || typeof v.npcA !== 'string' || typeof v.npcB !== 'string' || v.npcA === v.npcB) return null;
  if (!simulable(v.npcA) || !simulable(v.npcB)) return null;
  const [npcA, npcB] = v.npcA < v.npcB ? [v.npcA, v.npcB] : [v.npcB, v.npcA];
  const origins = Array.isArray(v.originEventIds) ? [...new Set(v.originEventIds.filter((o): o is string => typeof o === 'string'))] : [];
  return {
    edgeId: edgeIdOf(npcA, npcB), npcA, npcB,
    type: TIES.includes(v.type as SocialTie) ? (v.type as SocialTie) : 'acquaintance',
    weight: int(v.weight, -100, 100),
    lastChangedAt: day(v.lastChangedAt),
    originEventIds: origins.slice(-MAX_ORIGINS),
  };
}

/** Lo guardado, validado: basura → vacío; ids repetidos, el primero; excluidos o desconocidos, fuera; recortado a los topes. */
export function parseSocialGraph(v: unknown): SocialGraphState {
  if (!isRecord(v)) return emptySocialGraph();
  const lastTickDay = day(v.lastTickDay);
  const edges: SocialEdge[] = [];
  const perNpc = new Map<string, number>();
  for (const raw of Array.isArray(v.edges) ? v.edges : []) {
    const e = parseEdge(raw);
    if (!e || edges.length >= MAX_EDGES || edges.some((x) => x.edgeId === e.edgeId)) continue;
    if ((perNpc.get(e.npcA) ?? 0) >= MAX_EDGES_PER_NPC || (perNpc.get(e.npcB) ?? 0) >= MAX_EDGES_PER_NPC) continue;
    perNpc.set(e.npcA, (perNpc.get(e.npcA) ?? 0) + 1);
    perNpc.set(e.npcB, (perNpc.get(e.npcB) ?? 0) + 1);
    edges.push(e);
  }
  const edgeIds = new Set(edges.map((e) => e.edgeId));
  const seen = new Set<string>();
  const events: SocialGraphEvent[] = [];
  for (const raw of Array.isArray(v.events) ? v.events : []) {
    if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id === '' || seen.has(raw.id)) continue;
    if (typeof raw.edgeId !== 'string' || !edgeIds.has(raw.edgeId) || typeof raw.cause !== 'string') continue;
    const d = day(raw.day);
    if (d < lastTickDay - EVENT_TTL_DAYS) continue;
    seen.add(raw.id);
    events.push({ id: raw.id, day: d, edgeId: raw.edgeId, cause: raw.cause, delta: int(raw.delta, -200, 200) });
  }
  // Las claves salen de los ids conocidos: nunca se escribe una clave arbitraria (p. ej. __proto__).
  const memory: SocialGraphState['memory'] = {};
  const mem = isRecord(v.memory) ? v.memory : {};
  for (const id of KNOWN) {
    const m = mem[id];
    if (!simulable(id) || !Object.prototype.hasOwnProperty.call(mem, id) || !isRecord(m) || typeof m.cause !== 'string') continue;
    memory[id] = { cause: m.cause, day: day(m.day), spokenDay: day(m.spokenDay) };
  }
  return { v: 1, edges, events: events.slice(-MAX_EVENTS), memory, lastTickDay };
}

// ── F2 · simulación acotada ─────────────────────────────────────────────────────────────────────────────────────

/** Probabilidad de que un turno compartido deje un evento. */
const EVENT_CHANCE = 0.6;
/** Días mínimos desde la última causa NEGATIVA de la arista para que quepa una disculpa. */
export const REPAIR_AFTER_NEG_DAYS = 2;

/** Día de la última causa con delta < 0 de la arista en `events`; si no queda ninguna, su lastChangedAt. */
export function lastNegativeDay(events: readonly SocialGraphEvent[], e: SocialEdge): number {
  let last = -1;
  for (const ev of events) if (ev.edgeId === e.edgeId && ev.delta < 0 && ev.day > last) last = ev.day;
  return last >= 0 ? last : e.lastChangedAt;
}

export const tieOf = (w: number): SocialTie => (w >= 30 ? 'friend' : w <= -40 ? 'rift' : w < -10 ? 'tension' : 'acquaintance');

/**
 * Un tick del grafo hasta `today`: pura y determinista. Procesa los días (lastTickDay, today], como mucho los
 * MAX_CATCHUP_DAYS más recientes (sólo `today` si nunca hubo tick). Un turno por día y par; el azar sale de
 * hashSeed('social-graph', edgeId, d). Si no hay nada que procesar devuelve la MISMA referencia.
 */
export function tickSocialGraph(state: SocialGraphState, today: number, pairs: readonly NamedRelationship[] = coworkerPairs()): SocialGraphState {
  if (!Number.isFinite(today) || today < 1 || today <= state.lastTickDay) return state;
  const from = state.lastTickDay <= 0 ? today : Math.max(state.lastTickDay + 1, today - MAX_CATCHUP_DAYS + 1);

  // Siembra lo que falte de los pares (parse conserva la primera arista de cada id y aplica los topes).
  const seeded = seedSocialGraph(pairs).edges;
  const base = seeded.some((s) => !state.edges.some((e) => e.edgeId === s.edgeId))
    ? parseSocialGraph({ ...state, edges: [...state.edges, ...seeded] })
    : state;
  const active = new Set(seeded.map((s) => s.edgeId));
  const edges = base.edges.map((e) => ({ ...e, originEventIds: [...e.originEventIds] }));
  const events = [...base.events];
  const known = new Set(events.map((e) => e.id));
  const memory: SocialGraphState['memory'] = {};
  for (const [id, m] of Object.entries(base.memory)) memory[id] = { ...m };
  let added = 0;

  for (let d = from; d <= today; d++) {
    for (const e of edges) {
      if (!active.has(e.edgeId)) continue;
      const rng = seededRng(hashSeed('social-graph', e.edgeId, d));
      const happens = rng() < EVENT_CHANCE && added < MAX_EVENTS_PER_TICK;
      // En conflicto la disculpa elegible entra dos veces; en rift no se suman más causas negativas.
      const conflict = e.type === 'tension' || e.type === 'rift';
      const canRepair = conflict && d - lastNegativeDay(events, e) >= REPAIR_AFTER_NEG_DAYS;
      const pool = SOCIAL_CAUSES.flatMap((c) => (c.repair ? (canRepair ? [c, c] : []) : e.type === 'rift' && c.delta < 0 ? [] : [c]));
      const cause = pool[Math.floor(rng() * pool.length)];
      if (!happens || !cause) {
        // Deriva hacia 0 también en rift: si no, un rift a −100 nunca se acercaría al umbral que una disculpa puede cruzar.
        if (conflict) e.weight += Math.sign(-e.weight);
        e.type = tieOf(e.weight);
        continue;
      }
      const id = `sg:${d}:${e.edgeId}:${cause.id}`;
      if (known.has(id)) continue;
      known.add(id);
      added++;
      events.push({ id, day: d, edgeId: e.edgeId, cause: cause.id, delta: cause.delta });
      e.weight = Math.min(100, Math.max(-100, e.weight + cause.delta));
      e.type = tieOf(e.weight);
      e.lastChangedAt = d;
      e.originEventIds = [...e.originEventIds, id].slice(-MAX_ORIGINS);
      for (const npc of [e.npcA, e.npcB]) memory[npc] = { cause: cause.id, day: d, spokenDay: memory[npc]?.spokenDay ?? 0 };
    }
  }
  const live = events.filter((ev) => ev.day >= today - EVENT_TTL_DAYS).slice(-MAX_EVENTS);
  return { v: 1, edges, events: live, memory, lastTickDay: today };
}

// ── F3 · consecuencias observables ──────────────────────────────────────────────────────────────────────────────

/** Días que una causa sigue «reciente» para mencionarla (y una disculpa cuenta como reconciliación). */
export const RECENT_CAUSE_DAYS = 3;

/**
 * Lo que dice hoy `npc` de su compañero de arista, una vez al día. Pura y determinista (hashSeed('sg-line', npc, day)).
 * null si no tiene arista, si ya lo dijo hoy o si es 'acquaintance' sin causa reciente. Devuelve el estado con spokenDay = day.
 */
export function socialLineFor(state: SocialGraphState, npc: string, today: number): { line: string; state: SocialGraphState } | null {
  const e = state.edges.find((x) => x.npcA === npc || x.npcB === npc);
  if (!e) return null;
  const mem = Object.prototype.hasOwnProperty.call(state.memory, npc) ? state.memory[npc] : undefined;
  if (mem?.spokenDay === today) return null;
  const recentCause = mem !== undefined && today >= mem.day && today - mem.day <= RECENT_CAUSE_DAYS ? mem.cause : '';
  const cause = SOCIAL_CAUSES.find((c) => c.id === recentCause);
  const key: SocialTie | SocialLineKey = cause?.id === 'disculpa' ? 'reconciled' : e.type;
  const pool = [...(key === 'acquaintance' ? [] : SOCIAL_LINES[key]), ...(cause && key !== 'reconciled' ? [cause.line] : [])];
  if (pool.length === 0) return null;
  const otherId = e.npcA === npc ? e.npcB : e.npcA;
  const other = NPC_DEFS.find((n) => n.id === otherId)?.name ?? otherId;
  const line = pool[Math.floor(seededRng(hashSeed('sg-line', npc, today))() * pool.length)].split('{other}').join(other);
  return { line, state: { ...state, memory: { ...state.memory, [npc]: { cause: mem?.cause ?? '', day: mem?.day ?? 0, spokenDay: today } } } };
}

/** Trazabilidad: «Día N:<causa> (delta ±x) → <type>» por cada origen de la arista que siga en events. */
export function explainEdge(state: SocialGraphState, edgeId: string): string[] {
  const e = state.edges.find((x) => x.edgeId === edgeId);
  if (!e) return [];
  const name = (id: string): string => NPC_DEFS.find((n) => n.id === id)?.name ?? id;
  let w = e.weight;
  const origins = e.originEventIds.map((id) => state.events.find((ev) => ev.id === id)).filter((ev): ev is SocialGraphEvent => ev !== undefined);
  // El type tras cada evento sale del weight de entonces: se reconstruye hacia atrás desde el actual (aproximado si hubo recuperación).
  const after: SocialTie[] = [];
  for (let i = origins.length - 1; i >= 0; i--) {
    after[i] = i === origins.length - 1 ? e.type : tieOf(w);
    w -= origins[i].delta;
  }
  return origins.map((ev, i) => {
    const text = (SOCIAL_CAUSES.find((c) => c.id === ev.cause)?.text ?? ev.cause).replace('{a}', name(e.npcA)).replace('{b}', name(e.npcB));
    return `Día ${ev.day}: ${text} (delta ${ev.delta >= 0 ? '+' : ''}${ev.delta}) → ${after[i]}`;
  });
}
