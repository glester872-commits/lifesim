// Sin Phaser: lo usan GameState, SaveSystem y scripts/check-quedadas.ts.
/**
 * VID-05 · Quedadas en casa (F1: modelo, guardado y regla de invitación). El jugador invita a una o dos NPC con
 * historia (STORIES) a su vivienda. Reductor de datos puro: sin reloj propio, sin azar; todo llega como hechos.
 * Los minutos son absolutos: (día - 1) * 1440 + minuto del día.
 */

import { STORIES } from '../data/saraStory.ts';
import { absMinute } from './Handoff.ts';
import type { Availability } from './Phone.ts';

export const MAX_EVENTS = 12;
export const EVENT_TTL_DAYS = 30;
export const MAX_INVITEES = 2;
export const LATE_MINUTES = 20;
/** Por debajo de este ánimo (0-100, 50 neutral) la NPC no tiene ganas de quedar. */
export const MOOD_MIN = 35;

export type InviteeStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
export type Attendance = 'on-time' | 'late' | 'absent' | 'pending';
export type EventStatus = 'open' | 'running' | 'closed' | 'cancelled';
export type EventOutcome = '' | 'bien' | 'flojo' | 'plantón' | 'cancelada';
export type PlanOutcome = 'kept' | 'missed' | 'cancelled' | 'pending';

export interface SocialEventInvitee { npc: string; status: InviteeStatus; reason: string; respondedAt: number; attendance: Attendance }
export interface SocialEvent {
  id: string;
  kind: 'home-gathering';
  host: 'player';
  venueId: string;
  invited: SocialEventInvitee[];
  start: number;
  end: number;
  created: number;
  status: EventStatus;
  playerPresence: Attendance;
  outcome: EventOutcome;
  memoryEventIds: string[];
}
export interface SocialEventsState { v: 1; events: SocialEvent[] }

/** Hechos ya calculados (por GameState/WorldScene) para decidir una invitación. */
export interface InviteFacts {
  npc: string;
  hasContact: boolean;
  relationOk: boolean;
  mood: number;
  /** Ya tiene un plan de historia pendiente o activo. */
  busyPlan: boolean;
  /** Ese día no tiene hueco (planDayFrom/freeBetween). */
  noDay: boolean;
  statusAtStart: Availability;
  /** Otra cosa de su agenda se cruza con la franja. */
  conflict: boolean;
  alreadyInvitedThatDay: boolean;
}
export interface InviteDecision { accept: boolean; reason: string }

/** Lo que se sabe de una quedada al resolverla: el plan de cada invitada y cuándo llegó el jugador (null: no llegó). */
export interface EventFacts { plans: Readonly<Record<string, PlanOutcome>>; arrivedAt: number | null }

const INVITEE_STATUSES: readonly InviteeStatus[] = ['pending', 'accepted', 'declined', 'cancelled'];
const ATTENDANCES: readonly Attendance[] = ['on-time', 'late', 'absent', 'pending'];
const EVENT_STATUSES: readonly EventStatus[] = ['open', 'running', 'closed', 'cancelled'];
const OUTCOMES: readonly EventOutcome[] = ['', 'bien', 'flojo', 'plantón', 'cancelada'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string' && v !== '';
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);
const isStoryNpc = (npc: string): boolean => Object.prototype.hasOwnProperty.call(STORIES, npc);
const terminal = (s: EventStatus): boolean => s === 'closed' || s === 'cancelled';

export const emptySocialEvents = (): SocialEventsState => ({ v: 1, events: [] });

export const eventId = (venueId: string, day: number, startMin: number): string =>
  `evt:${venueId}:${day}:${String(Math.floor(startMin / 60)).padStart(2, '0')}${String(startMin % 60).padStart(2, '0')}`;

/** Id de la memoria agrupada de una invitada: el mismo evento no deja dos recuerdos. */
export const eventMemoryId = (ev: Pick<SocialEvent, 'id'>, npc: string): string => `${ev.id}:${npc}`;

/** Ordena por inicio, aplica el TTL relativo al evento más reciente y recorta a MAX_EVENTS. */
function prune(events: SocialEvent[]): SocialEvent[] {
  if (events.length === 0) return events;
  const sorted = [...events].sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const newest = sorted[sorted.length - 1].start;
  return sorted.filter((e) => e.start >= newest - EVENT_TTL_DAYS * 1440).slice(-MAX_EVENTS);
}

function parseInvitee(v: unknown): SocialEventInvitee | null {
  if (!isRecord(v) || !str(v.npc) || !isStoryNpc(v.npc)) return null;
  if (!oneOf(INVITEE_STATUSES, v.status) || !oneOf(ATTENDANCES, v.attendance) || typeof v.reason !== 'string' || !num(v.respondedAt)) return null;
  return { npc: v.npc, status: v.status, reason: v.reason, respondedAt: v.respondedAt, attendance: v.attendance };
}

function parseEvent(v: unknown): SocialEvent | null {
  if (!isRecord(v) || !str(v.id) || v.kind !== 'home-gathering' || v.host !== 'player' || !str(v.venueId)) return null;
  if (!num(v.start) || !num(v.end) || !num(v.created) || v.start >= v.end) return null;
  if (!oneOf(EVENT_STATUSES, v.status) || !oneOf(ATTENDANCES, v.playerPresence) || !oneOf(OUTCOMES, v.outcome)) return null;
  if (!Array.isArray(v.invited) || v.invited.length === 0 || v.invited.length > MAX_INVITEES) return null;
  const invited: SocialEventInvitee[] = [];
  for (const raw of v.invited) {
    const inv = parseInvitee(raw);
    if (!inv || invited.some((i) => i.npc === inv.npc)) return null;
    invited.push(inv);
  }
  const memoryEventIds = Array.isArray(v.memoryEventIds) ? [...new Set(v.memoryEventIds.filter(str))] : [];
  return {
    id: v.id, kind: 'home-gathering', host: 'player', venueId: v.venueId, invited,
    start: v.start, end: v.end, created: v.created, status: v.status, playerPresence: v.playerPresence, outcome: v.outcome, memoryEventIds,
  };
}

/** Lee lo guardado descartando lo inválido (y los ids repetidos: gana el primero). */
export function parseSocialEvents(v: unknown): SocialEventsState {
  if (!isRecord(v) || !Array.isArray(v.events)) return emptySocialEvents();
  const seen = new Set<string>();
  const events: SocialEvent[] = [];
  for (const raw of v.events) {
    const ev = parseEvent(raw);
    if (!ev || seen.has(ev.id)) continue;
    seen.add(ev.id);
    events.push(ev);
  }
  return { v: 1, events: prune(events) };
}

/** Regla de invitación: determinista, un motivo distinto por causa, en orden de lo más fuerte a lo más blando. */
export function decideInvite(f: InviteFacts): InviteDecision {
  const no = (reason: string): InviteDecision => ({ accept: false, reason });
  if (!isStoryNpc(f.npc)) return no('No sé quién eres');
  if (!f.hasContact) return no('Todavía no nos hemos dado el número');
  if (!f.relationOk) return no('Aún no nos conocemos tanto');
  if (f.alreadyInvitedThatDay) return no('Ya me has invitado ese día');
  if (f.busyPlan) return no('Ya tengo plan ese día');
  if (f.noDay) return no('Ese día no puedo');
  if (f.statusAtStart === 'busy') return no('Trabajo a esa hora');
  if (f.statusAtStart === 'asleep') return no('A esa hora ya estoy durmiendo');
  if (f.conflict) return no('Se me cruza con otra cosa a esa hora');
  if (!(f.mood >= MOOD_MIN)) return no('Hoy no me apetece');
  return { accept: true, reason: '¡Hecho! Allí estaré' };
}

export interface CreateEventInput {
  venueId: string;
  day: number;
  /** Minuto del día (0-1439) en que empieza. */
  startMin: number;
  /** Minuto del día en que acaba; puede pasar de 1440 si cruza la medianoche (como mucho un día). */
  endMin: number;
  invitees: readonly { npc: string; decision: InviteDecision }[];
  now: number;
}
export interface CreateEventResult { state: SocialEventsState; id: string; created: boolean; reason: string }

/** Crea la quedada con las respuestas ya decididas. Idempotente: el mismo id no se duplica. Sin nadie que acepte, no se crea. */
export function createEvent(state: SocialEventsState, input: CreateEventInput): CreateEventResult {
  const { venueId, day, startMin, endMin, invitees, now } = input;
  const id = str(venueId) && num(day) && num(startMin) ? eventId(venueId, Math.floor(day), Math.floor(startMin)) : '';
  const no = (reason: string): CreateEventResult => ({ state, id, created: false, reason });
  if (!id || day < 1 || startMin < 0 || startMin >= 1440 || !num(endMin) || endMin <= startMin || endMin > startMin + 1440 || !num(now)) return no('Hora no válida');
  if (state.events.some((e) => e.id === id)) return no('Ya está organizada');
  if (invitees.length === 0 || invitees.length > MAX_INVITEES) return no(`Invita a una o ${MAX_INVITEES} personas`);
  if (new Set(invitees.map((i) => i.npc)).size !== invitees.length || invitees.some((i) => !isStoryNpc(i.npc))) return no('Invitadas no válidas');
  if (!invitees.some((i) => i.decision.accept)) return no('Nadie puede ir');
  const d = Math.floor(day);
  const ev: SocialEvent = {
    id, kind: 'home-gathering', host: 'player', venueId,
    invited: invitees.map((i) => ({
      npc: i.npc, status: i.decision.accept ? 'accepted' : 'declined', reason: i.decision.reason, respondedAt: now,
      attendance: i.decision.accept ? 'pending' : 'absent',
    })),
    start: absMinute(d, 0, Math.floor(startMin)), end: absMinute(d, 0, Math.floor(endMin)), created: now,
    status: 'open', playerPresence: 'pending', outcome: '', memoryEventIds: [],
  };
  return { state: { v: 1, events: prune([...state.events, ev]) }, id, created: true, reason: '' };
}

/**
 * Suma una invitada (ya decidida) a una quedada abierta. `capacity` son los asientos de la casa (data/housing.seatsFor):
 * se pasa desde fuera para no atar esto a la vivienda. Sin aceptar, no se suma.
 */
export function addInvitee(state: SocialEventsState, id: string, npc: string, decision: InviteDecision, now: number, capacity: number): CreateEventResult {
  const ev = state.events.find((e) => e.id === id);
  const no = (reason: string): CreateEventResult => ({ state, id, created: false, reason });
  if (!ev || ev.status !== 'open' || !num(now)) return no('Esa quedada ya no está abierta');
  if (!isStoryNpc(npc)) return no('Invitadas no válidas');
  // Sólo ocupan sitio las que siguen en 'accepted': una cancelada o rechazada deja libre su hueco.
  const accepted = ev.invited.filter((i) => i.status === 'accepted');
  if (accepted.some((i) => i.npc === npc)) return no('Ya está invitada');
  if (accepted.length >= Math.min(MAX_INVITEES, capacity)) return no('No cabe nadie más');
  if (!decision.accept) return no(decision.reason);
  // Si ya tenía una entrada no aceptada, se reemplaza (parseSocialEvents descarta duplicados).
  const next: SocialEvent = { ...ev, invited: [...ev.invited.filter((i) => i.npc !== npc), { npc, status: 'accepted', reason: decision.reason, respondedAt: now, attendance: 'pending' }] };
  return { state: { v: 1, events: state.events.map((e) => (e.id === id ? next : e)) }, id, created: true, reason: '' };
}

function presence(ev: SocialEvent,arrivedAt: number | null, closed: boolean): Attendance {
  if (arrivedAt !== null && num(arrivedAt) && arrivedAt < ev.end) return arrivedAt <= ev.start + LATE_MINUTES ? 'on-time' : 'late';
  return closed ? 'absent' : 'pending';
}

function step(ev: SocialEvent, now: number, facts: EventFacts | undefined): SocialEvent {
  if (terminal(ev.status) || (now < ev.start && !ev.invited.some((i) => facts?.plans[i.npc] === 'cancelled'))) return ev;
  const closed = now >= ev.end;
  const invited = ev.invited.map((i): SocialEventInvitee => {
    if (i.status !== 'accepted') return i;
    const plan = facts?.plans[i.npc] ?? 'pending';
    if (plan === 'cancelled') return { ...i, status: 'cancelled', attendance: 'absent', respondedAt: now };
    const attendance: Attendance = plan === 'kept' ? 'on-time' : plan === 'missed' || closed ? 'absent' : 'pending';
    return { ...i, attendance };
  });
  if (!invited.some((i) => i.status === 'accepted')) {
    return { ...ev, invited, status: 'cancelled', outcome: 'cancelada' };
  }
  if (now < ev.start) return { ...ev, invited };
  const playerPresence = presence(ev, facts?.arrivedAt ?? null, closed);
  if (!closed) return { ...ev, invited, status: 'running', playerPresence };
  const guests = invited.filter((i) => i.status === 'accepted');
  const outcome: EventOutcome = playerPresence === 'absent' ? 'plantón'
    : playerPresence === 'on-time' && guests.every((i) => i.attendance === 'on-time') ? 'bien' : 'flojo';
  return { ...ev, invited, status: 'closed', playerPresence, outcome };
}

/**
 * Avanza las quedadas por reloj: open → running al empezar, running → closed al acabar (con su outcome).
 * Una invitada cuyo plan se canceló sale de la lista; sin ninguna aceptada, la quedada se cancela.
 * closed y cancelled son terminales. Con los mismos hechos, llamarlo dos veces da lo mismo.
 */
export function resolveEvent(state: SocialEventsState, now: number, facts: Readonly<Record<string, EventFacts>> = {}): SocialEventsState {
  if (!num(now)) return state;
  let changed = false;
  const events = state.events.map((ev) => {
    const next = step(ev, now, facts[ev.id]);
    if (next !== ev && JSON.stringify(next) !== JSON.stringify(ev)) { changed = true; return next; }
    return ev;
  });
  return changed ? { v: 1, events } : state;
}

/** El jugador anula la quedada. Sólo si sigue abierta o en marcha; cancelled es terminal. */
export function cancelEvent(state: SocialEventsState, id: string, now: number): { state: SocialEventsState; ok: boolean } {
  const ev = state.events.find((e) => e.id === id);
  if (!ev || terminal(ev.status)) return { state, ok: false };
  const cancelled: SocialEvent = {
    ...ev, status: 'cancelled', outcome: 'cancelada',
    invited: ev.invited.map((i) => (i.status === 'accepted' || i.status === 'pending' ? { ...i, status: 'cancelled', attendance: 'absent', respondedAt: now } : i)),
  };
  return { state: { v: 1, events: state.events.map((e) => (e.id === id ? cancelled : e)) }, ok: true };
}
