// Sin Phaser: lo usan WorldScene, ui/Phone y scripts/check-phone.ts.
import type { Mood } from '../data/chat.ts';
import { CHARACTERS } from '../data/characters.ts';
import { NAMED_PEOPLE } from '../data/namedPeople.ts';
import { PHONE_LINES, type PhoneTier } from '../data/phoneLines.ts';
import { WEEK, WEEKDAY_LABEL, weekIndex } from './Calendar.ts';
import { whereabouts, type RoutinePicker } from './Characters.ts';
import { hashSeed, seededRng } from './MetroDaily.ts';
import { isOpen, placeInfo, placeOfPoint } from './Places.ts';
import {
  applyDelta,
  availableSocialActions,
  contactState,
  noteSocialMemory,
  relationshipState,
  resolveSocialAction,
  type ContactState,
  type RelationshipState,
  type SocialActionId,
  type SocialMemory,
  type SocialOutcome,
  type SocialProfile,
  type SocialState,
} from './Social.ts';

/**
 * El móvil del jugador: hilos de mensajes con la gente que conoce, los planes que se hacen (por el móvil o en
 * persona) y lo que escriben ellos primero. No hay una segunda relación: cada mensaje se resuelve con la misma
 * tirada que en persona (systems/Social.resolveSocialAction) sobre el mismo perfil, y lo importante queda en su
 * memoria social. Lo que se guarda aquí es sólo lo propio del móvil: mensajes, sin leer, respuestas pendientes
 * y planes.
 *
 * Todo va con el reloj del juego en minutos absolutos ((día - 1) · 1440 + minuto del día, como
 * systems/Characters): nadie contesta en tiempo real, sino cuando el reloj llega a su hora, y eso se guarda.
 */

const DAY = 24 * 60;
/** Mensajes que se guardan por hilo: los más viejos se olvidan. */
const MAX_MESSAGES = 60;
const MAX_PLANS = 30;
/** Mensajes al día a la misma persona antes de que se agobie. */
const DAILY_LIMIT = 8;
/** Mínimo entre dos mensajes que empieza la misma persona. */
const INIT_COOLDOWN = 20 * 60;
/** Cada cuánto se mira si alguien escribe primero. */
export const INIT_SLOT = 30;
/** Un plan sigue «en curso» hasta este rato después de su hora. */
const PLAN_GRACE = 120;

// ================================================================
// ESTADO (se guarda con la partida)
// ================================================================

export interface PhoneMessage {
  from: 'me' | 'them';
  text: string;
  /** Minuto absoluto. */
  at: number;
}

export type Availability = 'free' | 'home' | 'busy' | 'commuting' | 'asleep';

export interface PendingReply {
  action: PhoneActionId;
  sent: number;
  /** Cuándo contesta. */
  due: number;
  /** Cómo le pilló el mensaje: si estaba liada, lo dice al contestar. */
  why: Availability;
  /** Veces que ya le habías mandado esto hoy, y mensajes de hoy (para no farmear). */
  repeat: number;
  volume: number;
  plan?: string;
}

export interface PhoneThread {
  messages: PhoneMessage[];
  unread: number;
  pending?: PendingReply;
  /** Lo que le has mandado hoy y cuántas charlas han contado ya (rendimientos decrecientes). */
  today: { day: number; actions: PhoneActionId[]; gains: number };
  /** La última vez que escribió primero. */
  lastInit?: number;
}

export type PlanKind = 'cafe' | 'drink' | 'gym' | 'food' | 'night' | 'walk' | 'date';
/**
 * proposed: propuesto, sin respuesta. accepted: quedáis. rejected: dijo (o dijiste) que no. cancelled: alguien lo
 * anuló. past: pasó su hora (si fuisteis o no lo decidirá el sistema de quedadas cuando exista). expired: nadie
 * contestó a tiempo.
 */
export type PlanStatus = 'proposed' | 'accepted' | 'rejected' | 'cancelled' | 'past' | 'expired';

/** Un plan con alguien: datos limpios para un calendario, rutas y plantones más adelante. */
export interface SocialPlan {
  id: string;
  npc: string;
  kind: PlanKind;
  /** Día de la partida y hora HH:MM. */
  day: number;
  at: string;
  /** Id de data/places. */
  place: string;
  status: PlanStatus;
  by: 'player' | 'npc';
  via: 'phone' | 'talk';
  created: number;
  confirmed?: true;
  reminded?: true;
}

export interface PhoneState {
  threads: Record<string, PhoneThread>;
  plans: SocialPlan[];
}

export const createPhone = (): PhoneState => ({ threads: {}, plans: [] });

const emptyThread = (): PhoneThread => ({ messages: [], unread: 0, today: { day: 0, actions: [], gains: 0 } });

// ================================================================
// DATOS
// ================================================================

export type PhoneActionId =
  | 'greet' | 'doing' | 'howru' | 'casual' | 'joke' | 'flirt'
  | 'invite-coffee' | 'invite-drink' | 'propose-plan' | 'propose-date'
  | 'confirm-plan' | 'cancel-plan' | 'accept-invite' | 'decline-invite' | 'bye';

interface ActionDef {
  label: string;
  /** Lo que escribe el jugador. */
  text: readonly string[];
  /** La misma acción social que en persona, si la hay. */
  social?: SocialActionId;
}

export const PHONE_ACTIONS: Readonly<Record<PhoneActionId, ActionDef>> = {
  greet: { label: 'Saludar', text: ['¡Hola!', 'Ey, ¿qué tal?'], social: 'greet' },
  doing: { label: '¿Qué haces?', text: ['¿Qué haces?', '¿Qué andas haciendo?'], social: 'question' },
  howru: { label: '¿Cómo estás?', text: ['¿Cómo estás?', '¿Qué tal el día?'], social: 'howru' },
  casual: { label: 'Hablar un rato', text: ['¿Qué te cuentas?', 'Cuéntame algo, que me aburro.'], social: 'casual' },
  joke: { label: 'Mandar una broma', text: ['¿Qué hace una abeja en el gimnasio? ¡Zum-ba!', 'He visto un vídeo de un gato tocando el piano. Casi mejor que yo.'], social: 'joke' },
  flirt: { label: 'Coquetear', text: ['No dejo de pensar en la última vez que te vi.', 'Hoy el barrio está más bonito. Será que me has escrito.'], social: 'flirt' },
  'invite-coffee': { label: 'Proponer café', text: ['¿Un café {cuando}? {lugar}, a las {hora}.'], social: 'invite-coffee' },
  'invite-drink': { label: 'Proponer tomar algo', text: ['¿Tomamos algo {cuando}? {lugar}, a las {hora}.'], social: 'invite-drink' },
  'propose-plan': { label: 'Proponer un plan', text: ['¿Te apetece {plan} {cuando}? {lugar}, a las {hora}.'], social: 'propose-plan' },
  'propose-date': { label: 'Proponer una cita', text: ['¿Y si quedamos {cuando}, tú y yo? {lugar}, a las {hora}. Como una cita.'], social: 'propose-date' },
  'confirm-plan': { label: 'Confirmar el plan', text: ['¿Sigue en pie lo de {cuando}? {lugar}, {hora}.'] },
  'cancel-plan': { label: 'Cancelar el plan', text: ['Oye, lo de {cuando} no voy a poder. Lo siento.'] },
  'accept-invite': { label: 'Aceptar', text: ['¡Vale! Allí estaré.', '¡Hecho! Nos vemos.'] },
  'decline-invite': { label: 'Decir que no', text: ['Esta vez no puedo, lo siento.'] },
  bye: { label: 'Despedirse', text: ['Hablamos luego.', '¡Chao!'], social: 'bye' },
};

/** Charla: lo que cansa si se repite y sube cada vez menos en el mismo día. */
const CHATTY = new Set<PhoneActionId>(['greet', 'doing', 'howru', 'casual', 'joke', 'flirt']);
const INVITES: Readonly<Partial<Record<PhoneActionId, PlanKind | 'interest'>>> = {
  'invite-coffee': 'cafe',
  'invite-drink': 'drink',
  'propose-plan': 'interest',
  'propose-date': 'date',
};

interface KindDef { name: string; place: string; at: string }

export const PLAN_KINDS: Readonly<Record<PlanKind, KindDef>> = {
  cafe: { name: 'un café', place: 'cafe', at: '18:00' },
  drink: { name: 'tomar algo', place: 'wine-bar', at: '21:00' },
  gym: { name: 'ir al gimnasio', place: 'gym', at: '19:00' },
  food: { name: 'comer', place: 'restaurant', at: '14:00' },
  night: { name: 'salir por la noche', place: 'bar-ribera', at: '22:30' },
  walk: { name: 'dar un paseo', place: 'plaza', at: '19:30' },
  date: { name: 'una cita', place: 'wine-bar', at: '21:00' },
};

/** «Un plan» depende de con quién: a quien le gusta el gimnasio le propones gimnasio. */
function interestKind(npc: string): PlanKind {
  const interests = NAMED_PEOPLE[npc]?.interests ?? [];
  if (interests.includes('fitness')) return 'gym';
  if (interests.includes('nightlife')) return 'night';
  if (interests.includes('food')) return 'food';
  return 'walk';
}

/** Lo que se acepta en persona deja su plan (las notas exactas de systems/Social.memoryNoteFor). */
const TALK_PLANS: Readonly<Record<string, PlanKind | 'interest'>> = {
  'aceptó tomar un café': 'cafe',
  'aceptó tomar algo': 'drink',
  'aceptó hacer un plan juntos': 'interest',
  'aceptó una cita': 'date',
};

// ================================================================
// TIEMPO Y SITIO
// ================================================================

const minuteOf = (at: string): number => Number(at.slice(0, 2)) * 60 + Number(at.slice(3, 5));
export const dayOfAbs = (abs: number): number => Math.floor(abs / DAY) + 1;
const minuteOfAbs = (abs: number): number => ((abs % DAY) + DAY) % DAY;
export const planStart = (p: SocialPlan): number => (p.day - 1) * DAY + minuteOf(p.at);

const two = (n: number): string => String(n).padStart(2, '0');
const hhmm = (m: number): string => `${two(Math.floor(m / 60) % 24)}:${two(Math.floor(m % 60))}`;

/** «hoy», «mañana» o «el jueves». */
export function whenLabel(day: number, today: number): string {
  if (day === today) return 'hoy';
  if (day === today + 1) return 'mañana';
  return `el ${WEEKDAY_LABEL[WEEK[weekIndex(day)]]}`;
}

/** Hora de un mensaje como la pone un móvil: «14:05», «ayer», «lunes». */
export function stampLabel(at: number, now: number): string {
  const d = dayOfAbs(at);
  const today = dayOfAbs(now);
  if (d === today) return hhmm(minuteOfAbs(at));
  if (d === today - 1) return 'ayer';
  return WEEKDAY_LABEL[WEEK[weekIndex(d)]];
}

export const placeName = (id: string): string => (id === 'plaza' ? 'la plaza' : placeInfo(id)?.name.split(' · ')[0] ?? id);

/** El primer día desde mañana en que el sitio está abierto a esa hora. */
function planDay(place: string, at: string, today: number): number {
  const info = placeInfo(place);
  const m = minuteOf(at);
  for (let d = today + 1; d <= today + 4; d++) if (!info || isOpen(info, d, Math.floor(m / 60), m % 60)) return d;
  return today + 1;
}

export interface NpcStatus {
  state: Availability;
  /** Donde está, si está en un sitio con nombre. */
  where?: string;
}

/**
 * Qué está haciendo según su rutina (systems/Characters), sin inventar nada: andando va de camino, dentro de un
 * edificio que no es su casa está liada (clase, trabajo), en casa de madrugada duerme.
 */
export function statusOf(npc: string, abs: number, pick?: RoutinePicker): NpcStatus {
  const hour = minuteOfAbs(abs) / 60;
  const def = CHARACTERS.find((c) => c.npc === npc);
  if (!def) return { state: hour >= 8 && hour < 23 ? 'free' : 'asleep' };
  const w = whereabouts(def, abs, pick);
  if (w.moving) return { state: 'commuting' };
  if (w.inside && w.stop.point === def.home) return { state: hour < 8 || hour >= 23.5 ? 'asleep' : 'home' };
  if (w.inside) return { state: 'busy' };
  const where = placeOfPoint(w.stop.point)?.name.split(' · ')[0];
  return { state: 'free', where };
}

/** Cuánto tarda en contestar: según lo que esté haciendo, cuánto os conocéis, cómo está contigo y su carácter. */
export function replyDelay(npc: string, status: NpcStatus, profile: SocialProfile, sent: number): number {
  const r = seededRng(hashSeed('phone-delay', npc, sent))();
  if (status.state === 'asleep') {
    const m = minuteOfAbs(sent);
    const wake = 8 * 60 + 20;
    return (m < wake ? wake - m : DAY - m + wake) + Math.round(r * 50);
  }
  let d = status.state === 'busy' ? 40 + r * 80 : status.state === 'commuting' ? 8 + r * 17 : 2 + r * 8;
  const rank = relationshipState(profile);
  if (rank === 'CLOSE_FRIEND' || rank === 'ROMANTIC_INTEREST' || rank === 'PARTNER') d *= 0.6;
  if (profile.mood < 35) d *= 2.5;
  const temper = NAMED_PEOPLE[npc]?.temperament;
  if (temper === 'reservado') d *= 1.4;
  else if (temper === 'extrovertido') d *= 0.8;
  return Math.max(1, Math.round(d));
}

// ================================================================
// RELACIÓN, CON PALABRAS
// ================================================================

export function tierOf(state: RelationshipState): PhoneTier {
  if (state === 'PARTNER') return 'partner';
  if (state === 'ATTRACTION' || state === 'ROMANTIC_INTEREST') return 'romance';
  if (state === 'FRIEND' || state === 'CLOSE_FRIEND') return 'friend';
  return 'acq';
}

/** La etiqueta que ve el jugador; sale de systems/Social.relationshipState, nunca de los números. */
export function relationLabel(profile: SocialProfile, npc: string): string {
  const p = NAMED_PEOPLE[npc]?.pronouns;
  const e = p === 'él' ? 'o' : p === 'elle' ? 'e' : 'a';
  switch (relationshipState(profile)) {
    case 'STRANGER': return `Desconocid${e}`;
    case 'ACQUAINTANCE': return `Conocid${e}`;
    case 'FRIEND': return `Amig${e}`;
    case 'CLOSE_FRIEND': return `Amig${e} cercan${e}`;
    case 'ATTRACTION': return 'Hay atracción';
    case 'ROMANTIC_INTEREST': return 'Interés romántico';
    case 'PARTNER': return 'Pareja';
  }
}

export interface Contact {
  npc: string;
  label: string;
  canMessage: boolean;
  /** Cómo está lo del número (systems/Social.contactState). */
  contact: ContactState;
  unread: number;
  last?: PhoneMessage;
  /** Último minuto en que os visteis o escribisteis. */
  lastContact?: number;
}

/**
 * La agenda: sólo quien conoces (con algún encuentro de verdad). Conocer a alguien no da su número: escribirle
 * pide contactExchanged, el mismo de la charla en persona.
 */
export function contactsOf(social: SocialState, met: Readonly<Record<string, unknown>>, phone: PhoneState, day = 1): Contact[] {
  return Object.keys(NAMED_PEOPLE)
    .filter((npc) => (social[npc]?.encounters ?? 0) > 0 || met[npc] !== undefined)
    .map((npc) => {
      const profile = social[npc];
      const t = phone.threads[npc];
      const last = t?.messages.at(-1);
      const seen = profile?.lastInteraction ? (profile.lastInteraction.day - 1) * DAY + profile.lastInteraction.hour * 60 + profile.lastInteraction.minute : -1;
      const lastContact = Math.max(seen, last?.at ?? -1);
      return {
        npc,
        // Sin perfil (sólo el registro antiguo de importantNPCsMet): os conocéis, nada más.
        label: profile ? relationLabel(profile, npc) : relationLabel({ ...EMPTY, encounters: 2 }, npc),
        canMessage: profile?.contactExchanged === true,
        contact: profile ? contactState(profile, day) : 'KNOWN',
        unread: t?.unread ?? 0,
        last,
        lastContact: lastContact >= 0 ? lastContact : undefined,
      };
    })
    .sort((a, b) => Number(b.canMessage) - Number(a.canMessage) || b.unread - a.unread || (b.lastContact ?? -1) - (a.lastContact ?? -1));
}

const EMPTY: SocialProfile = { friendship: 0, attraction: 0, trust: 0, romance: 0, mood: 50, encounters: 0, contactExchanged: false, datesAccepted: 0, datesRejected: 0, flirtSuccesses: 0, flirtFailures: 0, memories: [] };

// ================================================================
// FRASES
// ================================================================

const cap = (s: string): string => s.replace(/^([¿¡]?)(\p{Ll})/u, (_, p: string, c: string) => p + c.toUpperCase());

interface Fill { plan?: Omit<SocialPlan, 'id'>; today: number; where?: string }

function fill(text: string, f: Fill): string {
  const p = f.plan;
  const out = text
    .replaceAll('{plan}', p ? PLAN_KINDS[p.kind].name : 'algo')
    .replaceAll('{lugar}', p ? placeName(p.place) : 'el sitio de siempre')
    .replaceAll('{hora}', p?.at ?? '')
    .replaceAll('{cuando}', p ? whenLabel(p.day, f.today) : 'otro día')
    .replaceAll('{sitio}', f.where ?? 'por ahí');
  // Una frase empieza en mayúscula, también tras «¿» o después de un punto.
  return cap(out).replace(/([.!?] [¿¡]?)(\p{Ll})/gu, (_, a: string, c: string) => a + c.toUpperCase());
}

/** Una línea de su voz y su trato; si no tiene voz para eso, la genérica. */
export function lineFor(key: string, npc: string, tier: PhoneTier, rng: () => number): string {
  const all = PHONE_LINES[key] ?? [];
  const own = all.filter((l) => l.n === npc);
  const pool = own.length ? own : all.filter((l) => !l.n);
  const tiered = pool.filter((l) => l.t?.includes(tier)).flatMap((l) => l.text);
  const base = pool.filter((l) => !l.t).flatMap((l) => l.text);
  // Las del trato justo pesan el doble que las de siempre.
  const texts = [...tiered, ...tiered, ...base];
  return texts.length ? texts[Math.floor(rng() * texts.length)] : '...';
}

// ================================================================
// QUÉ SE LE PUEDE MANDAR
// ================================================================

export interface PhoneOption {
  id: PhoneActionId;
  label: string;
}

/** Un plan vivo con esta persona: aceptado y aún no pasado, o propuesto sin respuesta. */
export function activePlan(phone: PhoneState, npc: string, now: number): SocialPlan | undefined {
  return phone.plans.find((p) => p.npc === npc && (p.status === 'accepted' || p.status === 'proposed') && planStart(p) + PLAN_GRACE > now);
}

/**
 * Lo que tiene sentido mandarle ahora, con las mismas reglas que en persona (systems/Social.availableSocialActions)
 * y lo propio del móvil: confirmar o cancelar lo que tenéis, contestar a lo que te propone. Sin su número, nada;
 * esperando su respuesta, tampoco (no se le bombardea).
 */
export function phoneOptions(phone: PhoneState, npc: string, profile: SocialProfile, now: number): PhoneOption[] {
  if (!profile.contactExchanged || phone.threads[npc]?.pending) return [];
  const m = minuteOfAbs(now);
  const social = availableSocialActions(profile, {
    day: dayOfAbs(now),
    hour: Math.floor(m / 60),
    minute: m % 60,
    place: 'indoors',
    act: 'relax',
    mood: 'neutral',
    temperament: NAMED_PEOPLE[npc]?.temperament ?? 'tranquilo',
  });
  const plan = activePlan(phone, npc, now);
  const ids: PhoneActionId[] = [];
  if (plan?.status === 'proposed' && plan.by === 'npc') ids.push('accept-invite', 'decline-invite');
  for (const id of Object.keys(PHONE_ACTIONS) as PhoneActionId[]) {
    const s = PHONE_ACTIONS[id].social;
    if (!s || s === 'bye' || !social.includes(s)) continue;
    if (INVITES[id] && plan) continue;
    // Una cita rechazada hace poco se recuerda: no se vuelve a pedir enseguida.
    if (id === 'propose-date' && profile.memories.some((mem) => mem.kind === 'DATE' && mem.outcome === 'negative' && dayOfAbs(now) - mem.day < 4)) continue;
    ids.push(id);
  }
  if (plan?.status === 'accepted') {
    if (!plan.confirmed) ids.push('confirm-plan');
    ids.push('cancel-plan');
  }
  ids.push('bye');
  return ids.map((id) => ({ id, label: PHONE_ACTIONS[id].label }));
}

// ================================================================
// MANDAR Y CONTESTAR
// ================================================================

export interface PhoneNews {
  npc: string;
  text: string;
  /** Una propuesta suya o la respuesta a un plan: la notificación lo dice. */
  plan?: boolean;
}

export interface PhoneResult {
  phone: PhoneState;
  /** Perfiles que han cambiado: se guardan con GameState.setSocialProfile, la misma relación de siempre. */
  profiles: Record<string, SocialProfile>;
  news: PhoneNews[];
}

function threadIn(phone: PhoneState, npc: string, today: number): PhoneThread {
  const t = (phone.threads[npc] ??= emptyThread());
  if (t.today.day !== today) t.today = { day: today, actions: [], gains: 0 };
  return t;
}

function push(t: PhoneThread, msg: PhoneMessage): void {
  t.messages.push(msg);
  if (t.messages.length > MAX_MESSAGES) t.messages.splice(0, t.messages.length - MAX_MESSAGES);
  if (msg.from === 'them') t.unread += 1;
}

function addPlan(phone: PhoneState, plan: Omit<SocialPlan, 'id'>): SocialPlan {
  const full = { id: `${plan.npc}:${plan.created}:${phone.plans.length}`, ...plan };
  phone.plans.push(full);
  // Lo que ya pasó se olvida antes que lo que viene.
  if (phone.plans.length > MAX_PLANS) phone.plans.splice(0, phone.plans.length - MAX_PLANS);
  return full;
}

const momentOf = (abs: number): Pick<SocialMemory, 'day' | 'hour' | 'minute'> => {
  const m = minuteOfAbs(abs);
  return { day: dayOfAbs(abs), hour: Math.floor(m / 60), minute: m % 60 };
};

const planNote = (p: SocialPlan, today: number): string => `${PLAN_KINDS[p.kind].name} ${whenLabel(p.day, today)} en ${placeName(p.place)}`;

function remember(profile: SocialProfile, kind: SocialMemory['kind'], outcome: SocialOutcome, now: number, note: string): SocialProfile {
  return noteSocialMemory(profile, { kind, outcome, ...momentOf(now), note: note.slice(0, 160) });
}

const NO_DELTA = { friendship: 0, attraction: 0, trust: 0, romance: 0, mood: 0 };

/**
 * El jugador manda algo. Su mensaje sale ya; la respuesta queda pendiente hasta que el reloj llegue a su hora
 * (replyDelay). Aceptar, rechazar, confirmar o cancelar un plan cuenta al momento: lo has dicho tú.
 */
export function sendMessage(source: PhoneState, profile: SocialProfile, npc: string, action: PhoneActionId, now: number, status: NpcStatus): PhoneResult {
  const phone = structuredClone(source);
  const today = dayOfAbs(now);
  const t = threadIn(phone, npc, today);
  const rng = seededRng(hashSeed('phone-send', npc, now, action));
  let next = profile;
  let plan = activePlan(phone, npc, now);

  const invite = INVITES[action];
  if (invite) {
    const kind = invite === 'interest' ? interestKind(npc) : invite;
    const def = PLAN_KINDS[kind];
    plan = addPlan(phone, { npc, kind, day: planDay(def.place, def.at, today), at: def.at, place: def.place, status: 'proposed', by: 'player', via: 'phone', created: now });
  } else if (plan && action === 'accept-invite') {
    plan.status = 'accepted';
    next = remember(applyDelta(next, { ...NO_DELTA, friendship: 2, trust: 1, romance: plan.kind === 'date' ? 2 : 0, mood: 3 }), 'PROMISE', 'positive', now, `quedasteis por el móvil: ${planNote(plan, today)}`);
    if (plan.kind === 'date') next = { ...next, datesAccepted: next.datesAccepted + 1 };
  } else if (plan && action === 'decline-invite') {
    plan.status = 'rejected';
    next = remember(applyDelta(next, { ...NO_DELTA, mood: -2 }), 'INVITATION', 'negative', now, `le dijiste que no a ${PLAN_KINDS[plan.kind].name} por el móvil`);
  } else if (plan && action === 'cancel-plan') {
    // Cancelar el mismo día duele más.
    const late = plan.day === today;
    plan.status = 'cancelled';
    next = remember(applyDelta(next, { ...NO_DELTA, friendship: -1, trust: late ? -3 : -1, mood: late ? -6 : -3 }), 'PROMISE', 'negative', now, `cancelaste ${planNote(plan, today)}`);
  } else if (plan && action === 'confirm-plan') {
    plan.confirmed = true;
    next = applyDelta(next, { ...NO_DELTA, trust: 1, mood: 1 });
  }

  const texts = PHONE_ACTIONS[action].text;
  push(t, { from: 'me', text: fill(texts[Math.floor(rng() * texts.length)], { plan, today }), at: now });
  const repeat = CHATTY.has(action) ? t.today.actions.filter((a) => a === action).length : 0;
  t.today.actions.push(action);
  t.pending = { action, sent: now, due: now + replyDelay(npc, status, next, now), why: status.state, repeat, volume: t.today.actions.length, ...(plan ? { plan: plan.id } : {}) };
  return { phone, profiles: next === profile ? {} : { [npc]: next }, news: [] };
}

/** Cuánto cuenta una charla según cuántas han contado ya hoy: la primera entera, luego menos. */
const GAIN = [1, 0.6, 0.3, 0];

interface Reply { profile: SocialProfile; text: string; plan: boolean }

function reply(phone: PhoneState, npc: string, t: PhoneThread, p: PendingReply, profile: SocialProfile, at: NpcStatus, mood: Mood): Reply {
  const today = dayOfAbs(p.due);
  const rng = seededRng(hashSeed('phone-reply', npc, p.sent, p.action));
  const tier = tierOf(relationshipState(profile));
  const line = (key: string): string => lineFor(key, npc, tier, rng);
  const plan = phone.plans.find((x) => x.id === p.plan);
  const f: Fill = { plan, today, where: at.where };
  // Si le pilló liada (y tardó), lo dice antes.
  const prefix = p.due - p.sent > 20 && p.why !== 'free' && p.why !== 'home' ? `${line(p.why)} ` : '';
  const done = (next: SocialProfile, key: string, isPlan = false): Reply => ({ profile: next, text: prefix + fill(line(key), f), plan: isPlan });

  if (p.action === 'accept-invite') return done(profile, 'invite-accepted', true);
  if (p.action === 'decline-invite') return done(profile, 'invite-declined', true);
  if (p.action === 'confirm-plan') return done(profile, 'confirm', true);
  if (p.action === 'cancel-plan') return done(profile, plan && plan.day === today ? 'cancel:late' : 'cancel', true);

  // Pesado: escribir sin parar o repetir lo mismo en el día no suma nada y cansa.
  if (p.volume > DAILY_LIMIT) return done(applyDelta(profile, { ...NO_DELTA, trust: p.volume > DAILY_LIMIT + 3 ? -1 : 0, mood: -3 }), 'spam');
  if (p.repeat > 0) return done(applyDelta(profile, { ...NO_DELTA, trust: p.repeat > 1 ? -1 : 0, mood: -2 }), 'repeat');

  const m = minuteOfAbs(p.due);
  const res = resolveSocialAction(profile, PHONE_ACTIONS[p.action].social!, {
    day: today,
    hour: Math.floor(m / 60),
    minute: m % 60,
    place: 'indoors',
    act: p.why === 'busy' ? 'work' : 'relax',
    mood,
    temperament: NAMED_PEOPLE[npc]?.temperament ?? 'tranquilo',
  }, rng);

  // Por el móvil la charla sube menos cada vez que se repite en el día; las invitaciones cuentan enteras y lo
  // malo siempre cuenta entero.
  const chatty = CHATTY.has(p.action);
  const k = chatty ? GAIN[Math.min(GAIN.length - 1, t.today.gains)] : 1;
  if (chatty) t.today.gains += 1;
  const d = res.delta;
  const scale = (v: number): number => (v > 0 ? Math.round(v * k) : v);
  const stats = applyDelta(profile, { friendship: scale(d.friendship), attraction: scale(d.attraction), trust: scale(d.trust), romance: scale(d.romance), mood: scale(d.mood) });
  let next: SocialProfile = {
    ...res.profile,
    friendship: stats.friendship,
    attraction: stats.attraction,
    trust: stats.trust,
    romance: stats.romance,
    mood: stats.mood,
    // Escribirse no es verse: la última vez que os visteis sigue siendo la de antes.
    lastInteraction: profile.lastInteraction,
  };
  // Lo que recuerda de esto, sabiendo que fue por el móvil.
  const last = next.memories.at(-1);
  if (res.memory && last?.id === res.memory.id) next.memories[next.memories.length - 1] = { ...last, note: `${last.note ?? ''} (por el móvil)`.slice(0, 160) };

  const o = res.outcome;
  if (INVITES[p.action] && plan) {
    plan.status = o === 'positive' ? 'accepted' : 'rejected';
    if (o === 'positive') next = remember(next, 'PROMISE', 'positive', p.due, `quedasteis por el móvil: ${planNote(plan, today)}`);
    return done(next, `${p.action === 'propose-date' ? 'date' : 'invite'}:${o}`, true);
  }
  if (profile.mood < 25 && p.action !== 'bye') return done(next, 'upset');
  switch (p.action) {
    case 'flirt':
      return done(next, o === 'positive' ? 'flirt' : `flirt:${o}`);
    case 'doing':
      if (o === 'negative') return done(next, 'howru:negative');
      if (at.state === 'commuting') return done(next, 'doing:commuting');
      return done(next, at.where && at.state === 'free' ? 'doing:free' : 'doing:home');
    case 'bye':
      return done(next, 'bye');
    default:
      return done(next, o === 'negative' ? `${p.action}:negative` : p.action);
  }
}

export interface PhoneEnv {
  /** Qué hace esa persona a esa hora (statusOf con la rutina del día que le fije su historia). */
  status: (npc: string, abs: number) => NpcStatus;
  /** Su ánimo de hoy, si tiene historia (systems/Story.chatMood). */
  mood?: (npc: string) => Mood | undefined;
}

/**
 * El reloj avanza: contesta quien tenga que contestar, los planes pasados se cierran y, en cada franja de
 * INIT_SLOT minutos, alguien quizá escribe primero. `lastSlot` es la última franja ya mirada.
 */
export function phoneTick(source: PhoneState, social: SocialState, now: number, lastSlot: number, env: PhoneEnv): PhoneResult {
  let phone = source;
  const profiles: Record<string, SocialProfile> = {};
  const news: PhoneNews[] = [];
  const profileOf = (npc: string): SocialProfile => profiles[npc] ?? social[npc];
  const edit = (): PhoneState => (phone === source ? (phone = structuredClone(source)) : phone);

  for (const [npc, t0] of Object.entries(source.threads)) {
    const p = t0.pending;
    if (!p || p.due > now || !social[npc]) continue;
    const t = threadIn(edit(), npc, dayOfAbs(p.due));
    delete t.pending;
    const r = reply(phone, npc, t, p, profileOf(npc), env.status(npc, p.due), env.mood?.(npc) ?? 'neutral');
    profiles[npc] = r.profile;
    push(t, { from: 'them', text: r.text, at: p.due });
    news.push({ npc, text: r.text, plan: r.plan });
  }

  for (const plan of source.plans) {
    if ((plan.status === 'accepted' || plan.status === 'proposed') && planStart(plan) + PLAN_GRACE <= now) {
      const own = edit().plans.find((x) => x.id === plan.id)!;
      own.status = plan.status === 'accepted' ? 'past' : 'expired';
    }
  }

  const slot = Math.floor(now / INIT_SLOT);
  if (slot > lastSlot) {
    for (const npc of Object.keys(social)) {
      const profile = profileOf(npc);
      if (!profile.contactExchanged) continue;
      const msg = initiation(phone, npc, profile, now, slot, env);
      if (!msg) continue;
      const t = threadIn(edit(), npc, dayOfAbs(now));
      if (msg.plan) addPlan(phone, msg.plan);
      if (msg.reminded) phone.plans.find((x) => x.id === msg.reminded)!.reminded = true;
      push(t, { from: 'them', text: msg.text, at: now });
      t.lastInit = now;
      news.push({ npc, text: msg.text, plan: !!msg.plan });
    }
  }
  return { phone, profiles, news };
}

// ================================================================
// ESCRIBEN ELLOS
// ================================================================

/** Probabilidad por franja de que escriba primero, según el trato. */
const INIT_CHANCE: Readonly<Record<RelationshipState, number>> = {
  STRANGER: 0,
  ACQUAINTANCE: 0.004,
  FRIEND: 0.02,
  CLOSE_FRIEND: 0.03,
  ATTRACTION: 0.03,
  ROMANTIC_INTEREST: 0.045,
  PARTNER: 0.06,
};
const INIT_TEMPER: Readonly<Record<string, number>> = { extrovertido: 1.6, bromista: 1.2, curioso: 1.1, tranquilo: 0.9, reservado: 0.6 };

interface Initiation { text: string; plan?: Omit<SocialPlan, 'id'>; reminded?: string }

/**
 * Si escribe primero y qué. Nunca de madrugada, ni liada, ni dos veces seguidas sin respuesta, ni enfadada, ni si
 * acabáis de hablar. Un recordatorio del plan de hoy sale siempre; lo demás, según el trato y su carácter.
 */
function initiation(phone: PhoneState, npc: string, profile: SocialProfile, now: number, slot: number, env: PhoneEnv): Initiation | undefined {
  const t = phone.threads[npc];
  const m = minuteOfAbs(now);
  const today = dayOfAbs(now);
  if (m < 9 * 60 || m >= 23 * 60) return undefined;
  if (t?.pending || (t && t.unread > 0)) return undefined;
  if (t?.lastInit !== undefined && now - t.lastInit < INIT_COOLDOWN) return undefined;
  const last = t?.messages.at(-1);
  if (last && now - last.at < 180) return undefined;
  if (profile.mood < 30) return undefined;
  const status = env.status(npc, now);
  if (status.state !== 'free' && status.state !== 'home') return undefined;

  const state = relationshipState(profile);
  const tier = tierOf(state);
  const rng = seededRng(hashSeed('phone-init', npc, slot));
  const line = (key: string, plan?: Omit<SocialPlan, 'id'>): string => fill(lineFor(key, npc, tier, rng), { plan, today, where: status.where });

  const plan = activePlan(phone, npc, now);
  if (plan?.status === 'accepted' && plan.day === today && !plan.reminded) {
    const until = minuteOf(plan.at) - m;
    if (until >= 60 && until <= 360) return { text: line('init:reminder', plan), reminded: plan.id };
  }

  const chance = INIT_CHANCE[state] * (INIT_TEMPER[NAMED_PEOPLE[npc]?.temperament ?? ''] ?? 1);
  if (rng() >= chance) return undefined;

  const seenDay = profile.lastInteraction?.day;
  const lastContact = Math.max(last?.at ?? -1, seenDay !== undefined ? (seenDay - 1) * DAY : -1);
  const romantic = tier === 'romance' || tier === 'partner';
  if (plan?.status === 'accepted' && plan.kind === 'date' && romantic) return { text: line('init:date-ahead') };
  if (seenDay === today - 1 && rng() < 0.5) return { text: line('init:remember') };
  if (tier !== 'acq' && (weekIndex(today) === 4 || weekIndex(today) === 5) && m >= 17 * 60 && rng() < 0.5) return { text: line('init:tonight') };
  if (tier !== 'acq' && !plan && rng() < 0.4) {
    const kind: PlanKind = romantic && profile.attraction >= 45 && rng() < 0.4 ? 'date' : rng() < 0.5 ? 'cafe' : interestKind(npc);
    const def = PLAN_KINDS[kind];
    const invite: Omit<SocialPlan, 'id'> = { npc, kind, day: planDay(def.place, def.at, today), at: def.at, place: def.place, status: 'proposed', by: 'npc', via: 'phone', created: now };
    return { text: line(kind === 'date' ? 'init:invite-date' : 'init:invite', invite), plan: invite };
  }
  if (lastContact >= 0 && now - lastContact >= 3 * DAY) return { text: line('init:checkin') };
  if (tier !== 'acq') return { text: line('init:what') };
  return undefined;
}

// ================================================================
// PLANES DESDE LA CHARLA EN PERSONA
// ================================================================

/**
 * Lo aceptado en persona (un café, una cita) también es un plan: la misma lista que los del móvil, con su día y
 * su sitio. Se llama con cada memoria nueva que deja systems/Social.resolveSocialAction.
 */
export function planFromTalk(source: PhoneState, npc: string, memory: SocialMemory, now: number): PhoneState {
  const what = memory.outcome === 'positive' ? TALK_PLANS[memory.note ?? ''] : undefined;
  if (!what || activePlan(source, npc, now)) return source;
  const phone = structuredClone(source);
  const kind = what === 'interest' ? interestKind(npc) : what;
  const def = PLAN_KINDS[kind];
  addPlan(phone, { npc, kind, day: planDay(def.place, def.at, dayOfAbs(now)), at: def.at, place: def.place, status: 'accepted', by: 'player', via: 'talk', created: now });
  return phone;
}

/** Al abrir su conversación, lo suyo queda leído. */
export function markRead(source: PhoneState, npc: string): PhoneState {
  if (!source.threads[npc]?.unread) return source;
  const phone = structuredClone(source);
  phone.threads[npc].unread = 0;
  return phone;
}

export const unreadTotal = (phone: PhoneState): number => Object.values(phone.threads).reduce((s, t) => s + t.unread, 0);

// ================================================================
// GUARDADO
// ================================================================

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const ACTIONS = new Set<string>(Object.keys(PHONE_ACTIONS));
const KINDS = new Set<string>(Object.keys(PLAN_KINDS));
const STATUSES = new Set<string>(['proposed', 'accepted', 'rejected', 'cancelled', 'past', 'expired']);
const AVAIL = new Set<string>(['free', 'home', 'busy', 'commuting', 'asleep']);

function parseThread(v: unknown): PhoneThread | null {
  if (!isRecord(v)) return null;
  const t = emptyThread();
  if (Array.isArray(v.messages)) {
    t.messages = v.messages
      .filter((m): m is Record<string, unknown> => isRecord(m) && (m.from === 'me' || m.from === 'them') && typeof m.text === 'string')
      .map((m) => ({ from: m.from as 'me' | 'them', text: (m.text as string).slice(0, 400), at: num(m.at) }))
      .slice(-MAX_MESSAGES);
  }
  t.unread = Math.max(0, Math.min(t.messages.filter((m) => m.from === 'them').length, Math.floor(num(v.unread))));
  if (isRecord(v.today) && Array.isArray(v.today.actions)) {
    t.today = { day: num(v.today.day), actions: v.today.actions.filter((a): a is PhoneActionId => ACTIONS.has(a as string)), gains: num(v.today.gains) };
  }
  if (typeof v.lastInit === 'number') t.lastInit = v.lastInit;
  const p = v.pending;
  if (isRecord(p) && ACTIONS.has(p.action as string) && typeof p.due === 'number') {
    t.pending = {
      action: p.action as PhoneActionId,
      sent: num(p.sent, p.due),
      due: p.due,
      why: AVAIL.has(p.why as string) ? (p.why as Availability) : 'free',
      repeat: num(p.repeat),
      volume: num(p.volume, 1),
      ...(typeof p.plan === 'string' ? { plan: p.plan } : {}),
    };
  }
  return t;
}

function parsePlan(v: unknown): SocialPlan | null {
  if (!isRecord(v) || typeof v.id !== 'string' || typeof v.npc !== 'string' || !KINDS.has(v.kind as string)) return null;
  if (typeof v.at !== 'string' || !/^\d\d:\d\d$/.test(v.at) || typeof v.place !== 'string' || !STATUSES.has(v.status as string)) return null;
  return {
    id: v.id,
    npc: v.npc,
    kind: v.kind as PlanKind,
    day: Math.max(1, Math.floor(num(v.day, 1))),
    at: v.at,
    place: v.place,
    status: v.status as PlanStatus,
    by: v.by === 'npc' ? 'npc' : 'player',
    via: v.via === 'talk' ? 'talk' : 'phone',
    created: num(v.created),
    ...(v.confirmed === true ? { confirmed: true as const } : {}),
    ...(v.reminded === true ? { reminded: true as const } : {}),
  };
}

/** Una partida de antes del móvil (o con el móvil roto) empieza con el móvil vacío; nunca falla. */
export function parsePhone(v: unknown): PhoneState {
  if (!isRecord(v)) return createPhone();
  const threads: Record<string, PhoneThread> = {};
  if (isRecord(v.threads)) {
    for (const [npc, t] of Object.entries(v.threads)) {
      const parsed = parseThread(t);
      if (parsed) threads[npc] = parsed;
    }
  }
  const plans = Array.isArray(v.plans) ? v.plans.map(parsePlan).filter((p): p is SocialPlan => p !== null).slice(-MAX_PLANS) : [];
  return { threads, plans };
}
