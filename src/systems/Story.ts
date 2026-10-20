// Sin Phaser: lo usan WorldScene y scripts/check-story.ts.
import type { Mood } from '../data/chat.ts';
import { hashSeed, seededRng } from './MetroDaily.ts';
import { formatDate, WEEKDAY_LABEL, weekdayOf, weekIndex } from './Calendar.ts';
import {
  applyDelta,
  grantContact,
  relationshipState,
  type RelationshipState,
  type SocialDelta,
  type SocialProfile,
} from './Social.ts';

/**
 * La historia de un personaje con nombre con el jugador, encima de su relación (systems/Social: friendship,
 * attraction, trust, romance, mood). Lo social mide cuánto se quieren; esto guarda lo que ha pasado: flags
 * narrativas, su ánimo propio (no hacia el jugador), lo vivido, lo que se decidió, el plan que tienen y qué
 * rutina hace cada día.
 *
 * Dónde está sigue siendo una función del reloj (systems/Characters): la historia sólo decide, al empezar
 * cada día, qué rutina le toca ese día (un plan con el jugador, un día gris tras un plantón) y la deja fijada
 * hasta el siguiente. Así nunca cambia de sitio de golpe y, al volver horas después, está donde le toca.
 *
 * El contenido de cada personaje (sus flags, planes y microeventos) es un StoryDef en data/ (data/saraStory.ts).
 */

const DAY = 24 * 60;
const MAX_EVENTS = 40;
/** Cuánto vuelve su ánimo hacia el de siempre cada día. */
const MOOD_DRIFT = 10;

// ================================================================
// ESTADO (se guarda con la partida)
// ================================================================

export type PlanStatus = 'pending' | 'kept' | 'missed' | 'cancelled';

export interface StoryEvent {
  id: string;
  day: number;
  minute: number;
  /** Dónde fue, dicho como lo diría ella («la terraza del Pausa»). */
  note?: string;
}

export interface StoryPlan {
  /** Id del PlanDef. */
  id: string;
  /** Día del personaje (systems/Characters.characterDay) en que han quedado. */
  day: number;
  status: PlanStatus;
}

/** Dónde estaba la última vez que se miró: un registro, no la fuente (la fuente es el reloj). */
export interface StoryWhere {
  day: number;
  minute: number;
  location: string;
  /** Su parada: donde está o, si camina, adonde va. */
  point: string;
  moving: boolean;
  inside: boolean;
  routine: string;
}

export interface NamedStory {
  /** Flag → día en que se activó. */
  flags: Record<string, number>;
  /** Su ánimo propio, 0–100: se mueve con lo que le pasa y vuelve poco a poco al de siempre. */
  mood: number;
  events: StoryEvent[];
  /** Decisión → lo que se eligió («planton» → «perdon»). */
  decisions: Record<string, string>;
  plan: StoryPlan | null;
  /** Día → id de la rutina fijada ese día. */
  routines: Record<string, string>;
  /** Microevento → último día que salió. */
  beats: Record<string, number>;
  /** Último día ya empezado (dayStart). */
  dayDone: number;
  /** Último día que saludó ella primero. */
  greetedDay: number;
  where: StoryWhere | null;
  /**
   * Una propuesta suya sin contestar (un microevento con plan, o pasar un plan que se llevó la lluvia): la misma
   * se contesta en persona o por el móvil, y la primera respuesta la cierra.
   */
  offer: StoryOffer | null;
}

export interface StoryOffer {
  /** Id del microevento, o RESCHEDULE (pasar un plan que se llevó la lluvia). */
  beat: string;
  /** El plan que propone: el día se calcula al contestar (el primero posible desde el día siguiente). */
  plan: string;
  /** Día en que lo propuso. */
  day: number;
  /** El día que propuso (se conserva al contestar, mientras siga siendo futuro). */
  planDay?: number;
  /** Ya lo mandó por el móvil. */
  sent?: true;
}

export const RESCHEDULE = 'reschedule';

// ================================================================
// CONTENIDO (data/)
// ================================================================

/** Condiciones de un microevento o una frase; todas opcionales. */
export interface Cond {
  flags?: readonly string[];
  notFlags?: readonly string[];
  /** Relación mínima con el jugador (systems/Social.relationshipState). */
  minState?: RelationshipState;
  minMood?: number;
  maxMood?: number;
  /** El plan: sin ninguno pendiente, o en ese estado. */
  plan?: 'none' | PlanStatus;
  /** El plan pendiente es hoy (0) o mañana (1). */
  planIn?: 0 | 1;
  /** Le ha pasado esto hace como mucho `days` días (0 = hoy). */
  recent?: { event: string; days: number };
  /** Días sin repetir este mismo microevento. */
  cooldown?: number;
  /** Tirada con semilla por día: el mismo día, la misma respuesta. */
  chance?: number;
  /** La flag lleva puesta al menos `days` días: los hitos de un arco caen en días distintos. */
  since?: { flag: string; days: number };
  /** Le pasó esto hace justo `days` días (1 = ayer): el seguimiento del día siguiente. */
  ago?: { event: string; days: number };
  /** Lo que se eligió en esa decisión (Effect.decision). */
  decision?: readonly [string, string];
  /** Si ya tenéis vuestros números (systems/Social.contactExchanged). */
  contact?: boolean;
  /** Vives en esa casa (data/housing.ts HOMES). */
  home?: string;
  /** Tienes esa mejora instalada en tu casa de ahora (data/housing.ts UPGRADES). */
  has?: string;
}

export interface Effect {
  set?: readonly string[];
  clear?: readonly string[];
  /** Su ánimo propio. */
  mood?: number;
  /** Su relación con el jugador. */
  social?: Partial<SocialDelta>;
  /** Lo vivido, con `note` como sitio. */
  event?: string;
  decision?: readonly [string, string];
  /** Os dais los números (systems/Social.grantContact), con esta nota en su memoria. Una sola vez. */
  contact?: string;
}

export interface Choice {
  label: string;
  reply: readonly string[];
  then: Effect;
  /** Elegir esto deja quedado este plan (el primer día posible desde mañana): la reparación de un plantón. */
  plan?: string;
}

/** Un microevento: lo que dice y, si hay que decidir, las opciones. */
export interface Beat {
  id: string;
  when: Cond;
  /** Sólo una vez en la partida. */
  once?: true;
  say: readonly string[];
  then?: Effect;
  choices?: readonly Choice[];
  /** Propone este plan: la primera opción lo acepta ({cuando} es el primer día posible desde mañana). */
  offer?: string;
  /** También puede llegar por el móvil, si tenéis los números: lo escribe y se contesta allí o en persona. */
  phone?: true;
}

/** Algo que escribe por el móvil cuando se cumple (el seguimiento de lo vivido): una vez cada `cooldown` días. */
export interface StoryMessage {
  id: string;
  when: Cond;
  text: readonly string[];
}

export interface PlanDef {
  /** Rutina (Routine.story) de ese día: va al punto a su hora y espera allí. */
  routine: string;
  point: string;
  /** Mientras está esperando allí, HH:MM: si el jugador llega, ha venido. */
  from: string;
  until: string;
  /** Cómo lo dice ella: «la terraza del Pausa». */
  place: string;
  /** Cómo lo propone en una invitación suelta; {cuando} es «mañana a las 20:30». Sin él, sólo lo propone un hito. */
  ask?: string;
  /** Días de la semana en que se puede (0 lunes). */
  days: readonly number[];
  /** Al aire libre: si llueve, lo cancela sin culpa de nadie y propone pasarlo (StoryDef.rain). */
  outdoor?: true;
  /** Sólo entra en sus invitaciones si se cumple (p. ej. si aceptaste jugar los viernes). */
  requires?: Cond;
  /** Lo que pasa si vas o si faltas, en vez de lo de siempre (StoryDef.kept/missed): un hito, una reparación. */
  kept?: { say: readonly string[]; then: Effect };
  missed?: Effect;
}

export interface Opener {
  when: Cond;
  text: readonly string[];
}

export interface StoryDef {
  npc: string;
  /** Flag de «ya es de su gente»: una historia nueva en una partida donde ya lo eran la trae puesta (migrateStory). */
  friendFlag?: string;
  /** Todas las flags que existen, con lo que significan: una flag que no esté aquí es un error. */
  flags: Readonly<Record<string, string>>;
  baseMood: number;
  /** La flag de «ya se conocen»: una partida de antes de las historias en la que ya habían hablado la trae puesta. */
  metFlag?: string;
  /** Rutina (Routine.story) de un día gris. */
  greyRoutine: string;
  /** Por debajo de este ánimo, el día es gris (y un plan de ese día se cancela). */
  greyBelow: number;
  /** Con esta flag, un día de cada tantos es gris aunque el ánimo aguante. */
  greyFlag?: { flag: string; chance: number };
  plans: Readonly<Record<string, PlanDef>>;
  invite: {
    when: Cond;
    say: readonly string[];
    accept: { label: string; reply: readonly string[]; then: Effect };
    decline: { label: string; reply: readonly string[]; then: Effect };
  };
  /** Al acabar una charla, el primero que encaje (después, la invitación). */
  beats: readonly Beat[];
  /** Lo primero que saca al hablar, el primero que encaje. */
  openers: readonly Opener[];
  /** Al cruzarse, saluda ella primero. */
  hello: { distance: number; options: readonly { when: Cond; lines: readonly string[] }[] };
  kept: { say: readonly string[]; then: Effect };
  missed: Effect;
  /** Cancela ella porque no tiene el día (ánimo bajo): es suyo, y se disculpa. */
  cancelled: Effect;
  /** Un plan de fuera y llueve: lo dice ({lugar}, {cuando} es el día nuevo) y propone pasarlo, sin culpa. */
  rain: { say: readonly string[]; accept: { label: string; reply: readonly string[] }; decline: { label: string; reply: readonly string[] } };
  /** Lo que escribe por el móvil cuando toca (sin microevento): seguimientos y noticias. */
  messages?: readonly StoryMessage[];
}

// ================================================================
// CREAR Y LEER
// ================================================================

export function createStory(def: Pick<StoryDef, 'baseMood'>): NamedStory {
  return { flags: {}, mood: def.baseMood, events: [], decisions: {}, plan: null, routines: {}, beats: {}, dayDone: 0, greetedDay: 0, where: null, offer: null };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const clamp = (v: number): number => Math.max(0, Math.min(100, v));
const STATUSES: readonly PlanStatus[] = ['pending', 'kept', 'missed', 'cancelled'];

function numbers(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (isRecord(v)) for (const [k, x] of Object.entries(v)) if (typeof x === 'number' && Number.isFinite(x)) out[k] = x;
  return out;
}

function strings(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (isRecord(v)) for (const [k, x] of Object.entries(v)) if (typeof x === 'string') out[k] = x;
  return out;
}

/** Una historia guardada, o una nueva si no hay o viene rota: nunca tumba la carga de la partida. */
export function parseStory(raw: unknown, baseMood = 60): NamedStory {
  if (!isRecord(raw)) return createStory({ baseMood });
  const events: StoryEvent[] = Array.isArray(raw.events)
    ? raw.events.flatMap((e): StoryEvent[] => {
        if (!isRecord(e) || typeof e.id !== 'string') return [];
        const note = str(e.note);
        return [{ id: e.id, day: num(e.day, 0), minute: num(e.minute, 0), ...(note ? { note } : {}) }];
      }).slice(-MAX_EVENTS)
    : [];
  const p = raw.plan;
  const plan: StoryPlan | null = isRecord(p) && typeof p.id === 'string' && STATUSES.includes(p.status as PlanStatus)
    ? { id: p.id, day: num(p.day, 0), status: p.status as PlanStatus }
    : null;
  const w = raw.where;
  const where: StoryWhere | null = isRecord(w) && typeof w.location === 'string' && typeof w.point === 'string'
    ? { day: num(w.day, 0), minute: num(w.minute, 0), location: w.location, point: w.point, moving: w.moving === true, inside: w.inside === true, routine: str(w.routine) ?? '' }
    : null;
  return {
    flags: numbers(raw.flags),
    mood: clamp(num(raw.mood, baseMood)),
    events,
    decisions: strings(raw.decisions),
    plan,
    routines: strings(raw.routines),
    beats: numbers(raw.beats),
    dayDone: num(raw.dayDone, 0),
    greetedDay: num(raw.greetedDay, 0),
    where,
    offer: parseOffer(raw.offer),
  };
}

/** Una propuesta guardada; rota o de otra versión, ninguna (no hay nada que contestar). */
function parseOffer(o: unknown): StoryOffer | null {
  if (!isRecord(o) || typeof o.beat !== 'string' || typeof o.plan !== 'string') return null;
  return { beat: o.beat, plan: o.plan, day: num(o.day, 0), ...(typeof o.planDay === 'number' ? { planDay: o.planDay } : {}), ...(o.sent === true ? { sent: true as const } : {}) };
}

export type StoryState = Record<string, NamedStory>;

export function parseStories(raw: unknown): StoryState {
  const out: StoryState = {};
  if (isRecord(raw)) for (const [id, s] of Object.entries(raw)) out[id] = parseStory(s);
  return out;
}

// ================================================================
// CONSULTAS
// ================================================================

export const hasFlag = (s: NamedStory, flag: string): boolean => flag in s.flags;

/** Lo que el chat necesita (systems/Chat, ChatInput.flags). */
export const chatFlags = (s: NamedStory): string[] => Object.keys(s.flags);

/** Su ánimo propio en el idioma del chat: sólo cuando se nota. */
export function chatMood(s: NamedStory): Mood | undefined {
  if (s.mood < 35) return 'down';
  if (s.mood >= 78) return 'good';
  return undefined;
}

const RANK: Readonly<Record<RelationshipState, number>> = {
  STRANGER: 0,
  ACQUAINTANCE: 1,
  FRIEND: 2,
  ATTRACTION: 2,
  CLOSE_FRIEND: 3,
  ROMANTIC_INTEREST: 3,
  PARTNER: 4,
};

/**
 * Una historia recién creada para una relación que ya existía (una partida anterior): no se vuelve a presentar ni
 * a «hacerse amiga» con la escena de siempre, y los hitos del arco empiezan al día siguiente. Una historia con
 * recorrido (días empezados o cosas vividas) no se toca.
 */
export function migrateStory(source: NamedStory, def: StoryDef, profile: SocialProfile, day: number): NamedStory {
  if (source.dayDone > 0 || source.events.length > 0 || Object.keys(source.beats).length > 0) return source;
  const s = structuredClone(source);
  if (def.metFlag && profile.encounters > 0) s.flags[def.metFlag] ??= day;
  if (def.friendFlag && RANK[relationshipState(profile)] >= RANK.FRIEND) s.flags[def.friendFlag] ??= day;
  return s;
}

export const minuteOf = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

export interface StoryNow {
  /** Día del personaje (systems/Characters.characterDay). */
  day: number;
  /** Minuto del día de reloj, 0–1439. */
  minute: number;
  /** La casa donde vive el jugador y lo que tiene instalado (GameState.housing): lo que condiciona visitas y comentarios. */
  home?: string;
  owned?: readonly string[];
}

/** Si se cumple. `salt` separa las tiradas y las esperas de cosas distintas el mismo día. */
export function matches(s: NamedStory, c: Cond, profile: SocialProfile, now: StoryNow, salt: string): boolean {
  if (c.flags && !c.flags.every((f) => hasFlag(s, f))) return false;
  if (c.notFlags?.some((f) => hasFlag(s, f))) return false;
  if (c.minState && RANK[relationshipState(profile)] < RANK[c.minState]) return false;
  if (c.minMood !== undefined && s.mood < c.minMood) return false;
  if (c.maxMood !== undefined && s.mood > c.maxMood) return false;
  if (c.plan) {
    const status = s.plan?.status;
    if (c.plan === 'none' ? status === 'pending' : status !== c.plan) return false;
  }
  if (c.planIn !== undefined && (s.plan?.status !== 'pending' || s.plan.day - now.day !== c.planIn)) return false;
  const recent = c.recent;
  if (recent && !s.events.some((e) => e.id === recent.event && now.day - e.day <= recent.days)) return false;
  if (c.cooldown !== undefined && s.beats[salt] !== undefined && now.day - s.beats[salt] < c.cooldown) return false;
  if (c.since && !(hasFlag(s, c.since.flag) && now.day - s.flags[c.since.flag] >= c.since.days)) return false;
  const ago = c.ago;
  if (ago && !s.events.some((e) => e.id === ago.event && now.day - e.day === ago.days)) return false;
  if (c.decision && s.decisions[c.decision[0]] !== c.decision[1]) return false;
  if (c.contact !== undefined && profile.contactExchanged !== c.contact) return false;
  if (c.home && now.home !== c.home) return false;
  if (c.has && !now.owned?.includes(c.has)) return false;
  if (c.chance !== undefined && seededRng(hashSeed('story', salt, now.day))() >= c.chance) return false;
  return true;
}

/** El primer día desde `from` (incluido) en que se puede ese plan. */
export function planDayFrom(plan: PlanDef, from: number): number {
  for (let d = from; d < from + 7; d++) if (plan.days.includes(weekIndex(d))) return d;
  return from;
}

/** «hoy a las 20:30» o «mañana a las 20:30», según el día de reloj de ahora (de madrugada aún es el día anterior). */
function whenWords(planDay: number, from: string, gameDay: number): string {
  return `${planDay === gameDay ? 'hoy' : planDay === gameDay + 1 ? 'mañana' : `el ${formatDate(planDay)}`} a las ${from}`;
}

/** Sustituye {lugar}, {hora}, {cuando} y {sitio} con lo que toca. */
function fill(text: string, s: NamedStory, def: StoryDef, gameDay: number): string {
  const plan = s.plan && def.plans[s.plan.id];
  // {sitio}: donde hablaron la última vez (o, si no, lo último que pasó con sitio).
  const back = [...s.events].reverse();
  const lastNote = (back.find((e) => e.id === 'charla' && e.note) ?? back.find((e) => e.note))?.note ?? 'el barrio';
  return text
    .replaceAll('{lugar}', plan?.place ?? lastNote)
    .replaceAll('{hora}', plan?.from ?? '')
    .replaceAll('{cuando}', plan && s.plan ? whenWords(s.plan.day, plan.from, gameDay) : '')
    .replaceAll('{sitio}', lastNote);
}

const pickOf = <T>(items: readonly T[], seed: string): T => items[Math.floor(seededRng(hashSeed(seed))() * items.length)];

// ================================================================
// EFECTOS
// ================================================================

export interface Applied {
  story: NamedStory;
  profile: SocialProfile;
}

const ZERO: SocialDelta = { friendship: 0, attraction: 0, trust: 0, romance: 0, mood: 0 };

/** Anota algo vivido (sobre la copia que se le pase). */
export function noteEvent(s: NamedStory, id: string, now: StoryNow, note?: string): void {
  s.events.push({ id, day: now.day, minute: now.minute, ...(note ? { note } : {}) });
  if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);
}

/** Aplica un efecto: devuelve copias nuevas, no toca las de entrada. */
export function applyEffect(source: NamedStory, profile: SocialProfile, e: Effect, now: StoryNow, note?: string): Applied {
  const s = structuredClone(source);
  for (const f of e.set ?? []) s.flags[f] ??= now.day;
  for (const f of e.clear ?? []) delete s.flags[f];
  if (e.mood) s.mood = clamp(s.mood + e.mood);
  if (e.decision) s.decisions[e.decision[0]] = e.decision[1];
  if (e.event) noteEvent(s, e.event, now, note);
  const social = e.social ? applyDelta(profile, { ...ZERO, ...e.social }) : profile;
  return { story: s, profile: e.contact ? grantContact(social, { day: now.day, hour: Math.floor(now.minute / 60), minute: now.minute % 60 }, e.contact) : social };
}

// ================================================================
// EL DÍA
// ================================================================

export interface DayInput {
  day: number;
  rainy: boolean;
  /** Fija la rutina del día: con `forced`, esa; sin ella, la del calendario y el tiempo. Devuelve su id. */
  pick: (forced?: string) => string;
}

function missPlan(s: NamedStory, p: SocialProfile, def: StoryDef, now: StoryNow): Applied {
  const plan = def.plans[s.plan!.id];
  const next: NamedStory = { ...s, plan: { ...s.plan!, status: 'missed' } };
  return applyEffect(next, p, plan?.missed ?? def.missed, now, plan?.place);
}

/**
 * Empieza el día `day` (una vez): el ánimo vuelve hacia el de siempre, un plan de días anteriores sin cumplir
 * es un plantón, uno de hoy puede cancelarse (llueve y es fuera, o está de bajón: cambia de opinión) y se fija
 * la rutina de hoy, gris si el ánimo o lo pasado lo piden. Devuelve la historia nueva y los cambios sociales.
 */
export function dayStart(source: NamedStory, profile: SocialProfile, def: StoryDef, input: DayInput): Applied {
  let s = structuredClone(source);
  let p = profile;
  if (s.dayDone >= input.day) return { story: s, profile: p };
  const now: StoryNow = { day: input.day, minute: 6 * 60 };
  const passed = s.dayDone > 0 ? Math.min(7, input.day - s.dayDone) : 0;
  for (let i = 0; i < passed; i++) s.mood += Math.sign(def.baseMood - s.mood) * Math.min(MOOD_DRIFT, Math.abs(def.baseMood - s.mood));

  // Un plan de otro día que sigue pendiente: no fue.
  if (s.plan?.status === 'pending' && s.plan.day < input.day) ({ story: s, profile: p } = missPlan(s, p, def, now));

  let forced: string | undefined;
  const plan = s.plan?.status === 'pending' && s.plan.day === input.day ? def.plans[s.plan.id] : undefined;
  if (plan && s.plan) {
    if (plan.outdoor && input.rainy) {
      // Llueve: no es culpa de nadie. Se anula sin tocar su ánimo ni la relación y propone pasarlo a otro día.
      s.plan = { ...s.plan, status: 'cancelled' };
      noteEvent(s, 'plan-lluvia', now, plan.place);
      s.offer = { beat: RESCHEDULE, plan: s.plan.id, day: input.day };
    } else if (s.mood < def.greyBelow) {
      // De bajón no sale: cambia de opinión, y eso sí es suyo (se disculpará).
      s.plan = { ...s.plan, status: 'cancelled' };
      ({ story: s, profile: p } = applyEffect(s, p, def.cancelled, now, plan.place));
    } else forced = plan.routine;
  }
  if (!forced) {
    const grey = s.mood < def.greyBelow || (!!def.greyFlag && hasFlag(s, def.greyFlag.flag) && seededRng(hashSeed('gris', def.npc, input.day))() < def.greyFlag.chance);
    if (grey) {
      forced = def.greyRoutine;
      noteEvent(s, 'dia-gris', now);
    }
  }
  s.routines[String(input.day)] = input.pick(forced);
  // Las rutinas viejas ya no se leen: se queda la de ayer (su madrugada) y las futuras.
  for (const d of Object.keys(s.routines)) if (Number(d) < input.day - 1) delete s.routines[d];
  s.dayDone = input.day;
  return { story: s, profile: p };
}

/** La rutina fijada para ese día, si hay. */
export const routineOn = (s: NamedStory, day: number): string | undefined => s.routines[String(day)];

/**
 * El plan de hoy, mirado cada poco: si el jugador está con ella en la hora del plan, ha venido; si se le pasa
 * la hora, no. Devuelve null si no cambia nada.
 */
export function watchPlan(s: NamedStory, profile: SocialProfile, def: StoryDef, now: StoryNow, together: boolean): (Applied & { kept: boolean; say: readonly string[] }) | null {
  if (s.plan?.status !== 'pending' || s.plan.day !== now.day) return null;
  const plan = def.plans[s.plan.id];
  if (!plan) return null;
  const during = now.minute >= minuteOf(plan.from) && now.minute < minuteOf(plan.until);
  if (during && together) {
    const kept = plan.kept ?? def.kept;
    const next: NamedStory = { ...structuredClone(s), plan: { ...s.plan, status: 'kept' } };
    return { ...applyEffect(next, profile, kept.then, now, plan.place), kept: true, say: kept.say };
  }
  if (now.minute >= minuteOf(plan.until)) return { ...missPlan(s, profile, def, now), kept: false, say: [] };
  return null;
}

// ================================================================
// CHARLAS
// ================================================================

/** Lo primero que dice al hablar, si su historia tiene algo que sacar. */
export function openerFor(s: NamedStory, def: StoryDef, profile: SocialProfile, now: StoryNow, gameDay: number): string | undefined {
  const o = def.openers.find((x) => matches(s, x.when, profile, now, `opener:${x.text[0]}`));
  return o && fill(pickOf(o.text, `${def.npc}:opener:${now.day}:${now.minute}`), s, def, gameDay);
}

/** Una opción lista: el texto rellenado y, si deja un plan quedado, cuál y qué día. */
export interface ReadyChoice extends Omit<Choice, 'plan'> {
  plan?: { id: string; day: number };
}

/** Un microevento listo para mostrar: el texto ya rellenado y sus opciones. */
export interface ReadyBeat {
  id: string;
  say: string[];
  then?: Effect;
  choices?: ReadyChoice[];
  /** El plan que propone (la invitación, un hito, pasar uno que se llevó la lluvia). */
  plan?: { id: string; day: number };
  /** Se queda como propuesta (StoryOffer) hasta que se conteste, aquí o por el móvil. */
  offer?: true;
}

/** Las propuestas viejas se olvidan sin más: nadie espera respuesta una semana. */
const OFFER_DAYS = 4;
const liveOffer = (s: NamedStory, now: StoryNow): StoryOffer | null => (s.offer && now.day - s.offer.day <= OFFER_DAYS ? s.offer : null);

/** Rellena {lugar} y {cuando} con un plan propuesto (aún no quedado) y lo demás con lo de siempre. */
function fillWith(text: string, s: NamedStory, def: StoryDef, gameDay: number, plan?: { id: string; day: number }): string {
  const p = plan && def.plans[plan.id];
  const t = p && plan ? text.replaceAll('{lugar}', p.place).replaceAll('{cuando}', whenWords(plan.day, p.from, gameDay)).replaceAll('{hora}', p.from) : text;
  return fill(t, s, def, gameDay);
}

/** Un microevento de los datos, listo: un plan propuesto cae en el primer día posible desde mañana. */
function ready(b: Beat, s: NamedStory, def: StoryDef, now: StoryNow, gameDay: number, fixed?: { id: string; day: number }): ReadyBeat {
  // Lo que ya propuso sigue en su día mientras sea futuro y se pueda; si no, el primer día posible desde mañana.
  const planFor = (id: string): { id: string; day: number } =>
    fixed && fixed.id === id && fixed.day > now.day && def.plans[id].days.includes(weekIndex(fixed.day)) ? fixed : { id, day: planDayFrom(def.plans[id], now.day + 1) };
  const offered = b.offer ? planFor(b.offer) : undefined;
  return {
    id: b.id,
    say: b.say.map((t) => fillWith(t, s, def, gameDay, offered)),
    then: b.then,
    ...(offered ? { plan: offered, offer: true as const } : {}),
    choices: b.choices?.map((c, i) => {
      const plan = c.plan ? planFor(c.plan) : i === 0 ? offered : undefined;
      return { label: c.label, then: c.then, reply: c.reply.map((t) => fillWith(t, s, def, gameDay, plan ?? offered)), ...(plan ? { plan } : {}) };
    }),
  };
}

/** La propuesta pendiente, otra vez lista para contestar (en persona o por el móvil). */
export function offerBeat(s: NamedStory, def: StoryDef, now: StoryNow, gameDay: number): ReadyBeat | null {
  const o = liveOffer(s, now);
  if (!o || !def.plans[o.plan]) return null;
  if (o.beat !== RESCHEDULE) {
    const b = def.beats.find((x) => x.id === o.beat);
    return b ? ready(b, s, def, now, gameDay, o.planDay ? { id: o.plan, day: o.planDay } : undefined) : null;
  }
  // La lluvia: lo dice y propone el siguiente día posible. Decir que no tampoco tiene culpa.
  const fixed = o.planDay && o.planDay > now.day && def.plans[o.plan].days.includes(weekIndex(o.planDay)) ? o.planDay : planDayFrom(def.plans[o.plan], now.day + 1);
  const plan = { id: o.plan, day: fixed };
  const { rain } = def;
  const say = (t: string): string => fillWith(t, s, def, gameDay, plan);
  return {
    id: RESCHEDULE,
    say: rain.say.map(say),
    plan,
    offer: true,
    choices: [
      { label: say(rain.accept.label), reply: rain.accept.reply.map(say), then: { event: 'plan-pasado' }, plan },
      { label: say(rain.decline.label), reply: rain.decline.reply.map(say), then: {} },
    ],
  };
}

/**
 * Al acabar una charla: una propuesta suya sin contestar (la misma que quizá mandó por el móvil); si no, el primer
 * microevento que encaje y, si ninguno, quizá una invitación. Uno como mucho: una charla no se convierte en una
 * ristra de escenas.
 */
export function beatAfterTalk(s: NamedStory, def: StoryDef, profile: SocialProfile, now: StoryNow, gameDay: number): ReadyBeat | null {
  const pending = offerBeat(s, def, now, gameDay);
  if (pending) return pending;
  const busy = s.plan?.status === 'pending';
  for (const b of def.beats) {
    if (b.once && s.beats[b.id] !== undefined) continue;
    // Con un plan quedado no propone otro: primero ese.
    if ((b.offer || b.choices?.some((c) => c.plan)) && busy) continue;
    if (!matches(s, b.when, profile, now, b.id)) continue;
    return ready(b, s, def, now, gameDay);
  }
  if (!matches(s, def.invite.when, profile, now, 'invite')) return null;
  const tomorrow = now.day + 1;
  // Sólo los planes que se proponen sueltos (con `ask`) y que hoy están a su alcance (`requires`).
  const options = Object.entries(def.plans).filter(([, p]) => p.ask && p.days.includes(weekIndex(tomorrow)) && (!p.requires || matches(s, p.requires, profile, now, 'plan')));
  if (options.length === 0) return null;
  const [id, plan] = options[Math.floor(seededRng(hashSeed('plan', def.npc, now.day))() * options.length)];
  const when = whenWords(tomorrow, plan.from, gameDay);
  const { accept, decline } = def.invite;
  const picked = { id, day: tomorrow };
  return {
    id: 'invite',
    say: [...def.invite.say, plan.ask!.replaceAll('{cuando}', when)],
    plan: picked,
    choices: [
      { label: accept.label, reply: accept.reply.map((t) => t.replaceAll('{lugar}', plan.place).replaceAll('{cuando}', when)), then: accept.then, plan: picked },
      { label: decline.label, reply: decline.reply.map((t) => t.replaceAll('{lugar}', plan.place)), then: decline.then },
    ],
  };
}

/**
 * Se ha dicho (en persona o por el móvil): queda contado para `once`/`cooldown` y, si propone un plan, queda como
 * propuesta hasta que se conteste. `sent`: lo mandó por el móvil.
 */
export function presentBeat(source: NamedStory, beat: ReadyBeat, now: StoryNow, sent = false): NamedStory {
  const s = structuredClone(source);
  if (beat.id !== RESCHEDULE) s.beats[beat.id] = now.day;
  if (beat.offer && beat.plan) s.offer = { beat: beat.id, plan: beat.plan.id, day: s.offer?.day ?? now.day, planDay: s.offer?.planDay ?? beat.plan.day, ...(sent || s.offer?.sent ? { sent: true as const } : {}) };
  return s;
}

/**
 * Contestar a un microevento, por donde sea: lo mismo en persona que por el móvil. Cierra la propuesta, deja el
 * plan quedado si la opción lo trae y aplica su efecto, una sola vez.
 */
export function chooseBeat(source: NamedStory, profile: SocialProfile, def: StoryDef, beat: ReadyBeat, index: number, now: StoryNow, note?: string): Applied & { reply: string[] } {
  // Una respuesta tardía desde otra superficie no puede volver a resolver la propuesta.
  const current = beat.offer ? offerBeat(source, def, now, now.minute < 6 * 60 ? now.day + 1 : now.day) : beat;
  if (!current || current.id !== beat.id || (beat.offer && current.plan?.id !== beat.plan?.id)) return { story: source, profile, reply: [] };
  const choice = current.choices?.[index];
  if (!choice) return { story: source, profile, reply: [] };
  let s = structuredClone(source);
  s.offer = null;
  if (choice.plan) s = acceptPlan(s, def, choice.plan);
  const applied = applyEffect(s, profile, choice.then, now, choice.plan ? def.plans[choice.plan.id]?.place : note);
  return { ...applied, reply: [...choice.reply] };
}

/**
 * Lo que escribe por el móvil ahora, si algo: la propuesta pendiente que aún no mandó, un microevento que puede
 * llegar por mensaje o un seguimiento de lo vivido. Uno cada vez. Sin vuestros números, nada (lo dirá en persona).
 */
export function phoneStory(source: NamedStory, def: StoryDef, profile: SocialProfile, now: StoryNow, gameDay: number): (Applied & { text: string }) | null {
  if (!profile.contactExchanged) return null;
  const offer = liveOffer(source, now);
  if (offer) {
    if (offer.sent) return null;
    const b = offerBeat(source, def, now, gameDay);
    return b ? { story: presentBeat(source, b, now, true), profile, text: b.say.join(' ') } : null;
  }
  const busy = source.plan?.status === 'pending';
  for (const b of def.beats) {
    if (!b.phone || (b.once && source.beats[b.id] !== undefined)) continue;
    // Por mensaje sólo lo que se contesta con sí o no: una propuesta, o una noticia sin opciones.
    if (b.choices && !b.offer) continue;
    if (b.offer && busy) continue;
    if (!matches(source, b.when, profile, now, b.id)) continue;
    const r = ready(b, source, def, now, gameDay);
    const story = presentBeat(source, r, now, true);
    const applied = r.then && !r.offer ? applyEffect(story, profile, r.then, now) : { story, profile };
    return { ...applied, text: r.say.join(' ') };
  }
  for (const m of def.messages ?? []) {
    const key = `msg:${m.id}`;
    if (source.beats[key] === now.day || !matches(source, m.when, profile, now, key)) continue;
    const story = markBeat(source, key, now);
    return { story, profile, text: fill(pickOf(m.text, `${def.npc}:${key}:${now.day}`), source, def, gameDay) };
  }
  return null;
}

/** Marca un microevento como salido hoy (para `once` y `cooldown`). */
export function markBeat(source: NamedStory, id: string, now: StoryNow): NamedStory {
  const s = structuredClone(source);
  s.beats[id] = now.day;
  return s;
}

/** Acepta un plan: queda pendiente ese día y fija ya su rutina (ese día aún no ha empezado). */
export function acceptPlan(source: NamedStory, def: StoryDef, plan: { id: string; day: number }): NamedStory {
  const s = structuredClone(source);
  s.plan = { id: plan.id, day: plan.day, status: 'pending' };
  s.routines[String(plan.day)] = def.plans[plan.id].routine;
  return s;
}

/** Al cruzarse: si hoy le toca saludar primero, lo que dice. Una vez al día como mucho. */
export function helloFor(s: NamedStory, def: StoryDef, profile: SocialProfile, now: StoryNow): string | null {
  if (s.greetedDay === now.day) return null;
  const o = def.hello.options.find((x, i) => matches(s, x.when, profile, now, `hello:${i}`));
  return o ? pickOf(o.lines, `${def.npc}:hello:${now.day}`) : null;
}

/** El día de reloj y el minuto del día de un minuto absoluto ((día − 1)·1440 + minuto). */
export const clockOf = (absMinute: number): { gameDay: number; minute: number } => ({
  gameDay: Math.floor(absMinute / DAY) + 1,
  minute: Math.floor(((absMinute % DAY) + DAY) % DAY),
});

// ================================================================
// CANCELAR Y VER EL PLAN
// ================================================================

/** El plan quedado, dicho como lo vería el jugador: «tu piso · mañana a las 19:30» (con día de la semana si no es hoy ni mañana). */
export function planSummary(s: NamedStory, def: StoryDef, gameDay: number): string | null {
  if (s.plan?.status !== 'pending') return null;
  const plan = def.plans[s.plan.id];
  if (!plan) return null;
  const day = s.plan.day === gameDay ? 'hoy' : s.plan.day === gameDay + 1 ? 'mañana' : `el ${WEEKDAY_LABEL[weekdayOf(s.plan.day)]}`;
  return `${plan.place} · ${day} a las ${plan.from}`;
}

/**
 * El jugador cancela el plan quedado (por el móvil): las mismas reglas que al cancelar un plan del móvil (systems/Phone):
 * cuesta más cancelarlo el mismo día que con tiempo. Si el plan es de otro día, su rutina se suelta y ese día hace lo de
 * siempre; si es de hoy, ya está en marcha y sigue. Se anota para que lo recuerde. No deja propuesta colgada.
 */
export function cancelStoryPlan(source: NamedStory, profile: SocialProfile, def: StoryDef, now: StoryNow): Applied | null {
  if (source.plan?.status !== 'pending') return null;
  const s = structuredClone(source);
  const plan = def.plans[s.plan!.id];
  const late = s.plan!.day === now.day;
  s.plan = { ...s.plan!, status: 'cancelled' };
  if (!late) delete s.routines[String(s.plan.day)];
  noteEvent(s, 'plan-cancelado', now, plan?.place);
  return { story: s, profile: applyDelta(profile, { ...ZERO, friendship: -1, trust: late ? -3 : -1, mood: late ? -6 : -3 }) };
}
