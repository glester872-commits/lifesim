// Sin Phaser: lo usan scenes/Menus.ts, systems/Crowd.ts, systems/StreetLife.ts y scripts/check-parish.ts.
import { CHOIR, type GatheringDef, type GatheringEffect } from '../data/parish.ts';
import { formatDate, weekIndex } from './Calendar.ts';
import { hashSeed, seededRng } from './MetroDaily.ts';
import { IDENTITIES, relationsOf } from './People.ts';
import { workingAt } from './Places.ts';
import { applyDelta, noteSocialMemory, type SocialMoment, type SocialProfile } from './Social.ts';

/**
 * Encuentros con hora en un sitio (CV-05; hoy, el ensayo del coro de la Parroquia de San Blas). Todo sale del reloj:
 * cada ensayo es `${id}-${día}`, un id estable que no se guarda hasta que el jugador va. Ir es voluntario y se
 * resuelve una sola vez por ensayo (`attended`): dormir, trabajar, recargar o saltar días no lo repiten ni lo dan
 * por hecho. Quien viene del barrio sale de las identidades de siempre (systems/People), nunca de quien está en su
 * trabajo a esa hora. Puras: devuelven estado nuevo y quien llama lo aplica.
 */

export const GATHERINGS: readonly GatheringDef[] = [CHOIR];

export interface Attendance {
  id: string;
  day: number;
  /** Hasta el final desde el principio, o un rato (salida anticipada o llegada tarde). */
  stay: 'full' | 'partial';
  minutes: number;
}

export interface ParishState {
  /** Los últimos ensayos a los que se fue (los más recientes al final). */
  attended: Attendance[];
}

/** Lo que se recuerda: más que de sobra para saber si ya se fue al de hoy y contar el último. */
const KEEP = 12;

export const emptyParish = (): ParishState => ({ attended: [] });

/** Minutos absolutos de juego, como el resto del juego ((día-1)·1440 + minutos del día). */
const abs = (day: number, hour: number): number => (day - 1) * 1440 + Math.round(hour * 60);
const dayOf = (now: number): number => Math.floor(now / 1440) + 1;
export const hhmm = (hour: number): string => `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;
const clockAt = (now: number): string => hhmm((now % 1440) / 60);

export interface Occurrence {
  id: string;
  day: number;
  /** Minutos absolutos. */
  start: number;
  end: number;
}

export const gatheringAt = (place: string): GatheringDef | undefined => GATHERINGS.find((g) => g.place === place);
export const getGathering = (id: string): GatheringDef | undefined => GATHERINGS.find((g) => g.id === id);

/** El ensayo de ese día, si ese día de la semana hay. */
export function occurrenceOn(g: GatheringDef, day: number): Occurrence | null {
  if (!g.days.includes(weekIndex(day))) return null;
  const start = abs(day, g.start);
  return { id: `${g.id}-${day}`, day, start, end: start + g.minutes };
}

/** El que empieza después de ahora (nunca el que ya va por la mitad). */
export function nextOccurrence(g: GatheringDef, now: number): Occurrence {
  for (let day = dayOf(now); ; day++) {
    const o = occurrenceOn(g, day);
    if (o && o.start > now) return o;
  }
}

export const occurrenceLabel = (g: GatheringDef, o: Occurrence): string => `${formatDate(o.day, false)} a las ${hhmm(g.start)}`;

export const attendedTo = (s: ParishState, id: string): Attendance | undefined => s.attended.find((a) => a.id === id);

/** Por qué no se puede entrar al ensayo ahora, siempre con la siguiente oportunidad; null si se puede. */
export function joinBlocker(g: GatheringDef, s: ParishState, now: number): string | null {
  const today = occurrenceOn(g, dayOf(now));
  const next = `El próximo: ${occurrenceLabel(g, nextOccurrence(g, now))}.`;
  if (today && attendedTo(s, today.id)) return `Ya has estado en el de hoy. ${next}`;
  if (!today) return `Hoy no hay ensayo. ${next}`;
  if (now < today.start) return `Empieza a las ${hhmm(g.start)} (faltan ${today.start - now} min): puedes esperar dentro.`;
  if (now >= today.end) return `El de hoy terminó a las ${clockAt(today.end)}. ${next}`;
  if (now > today.start + g.lateMax) return `Va muy avanzado: se entra hasta las ${clockAt(today.start + g.lateMax)}. ${next}`;
  return null;
}

export interface GatheringOutcome {
  parish: ParishState;
  /** Perfil social de quien lo lleva, ya con el cambio y el recuerdo. */
  host: SocialProfile;
  energy: number;
  minutes: number;
  stay: Attendance['stay'];
  effect: GatheringEffect;
  lines: string[];
}

/**
 * Ir al ensayo de ahora: 'full' se queda hasta el final; 'short', un rato (GatheringDef.shortStay) y se va antes.
 * Llegar pasados `onTime` minutos cuenta como un rato aunque se quede al final. Quien llama comprueba joinBlocker.
 */
export function attend(g: GatheringDef, s: ParishState, host: SocialProfile, now: number, choice: 'full' | 'short'): GatheringOutcome {
  const blocked = joinBlocker(g, s, now);
  if (blocked) throw new Error(blocked);
  const o = occurrenceOn(g, dayOf(now))!;
  const left = o.end - now;
  const minutes = choice === 'full' ? left : Math.min(g.shortStay, left);
  const stay: Attendance['stay'] = choice === 'full' && now <= o.start + g.onTime ? 'full' : 'partial';
  const effect = stay === 'full' ? g.full : g.partial;
  const endAt = now + minutes;
  const moment: SocialMoment = { day: dayOf(endAt), hour: Math.floor((endAt % 1440) / 60), minute: endAt % 60 };
  const changed = applyDelta(host, { friendship: effect.friendship, trust: effect.trust, mood: effect.mood, romance: 0, attraction: 0 });
  const remembered = noteSocialMemory(changed, { kind: 'SHARED_EVENT', ...moment, outcome: 'positive', note: `${g.id}: ${stay === 'full' ? 'hasta el final' : 'un rato'}` });
  const names = guestsOf(g, o.day).slice(0, 2).map((i) => IDENTITIES[i].name);
  const met = names.length === 2 ? `Cantas junto a ${names[0]} y ${names[1]}, del barrio.` : '';
  const late = choice === 'full' && stay === 'partial' ? 'Llegas con el ensayo empezado: te sientas al fondo y te unes a mitad de canción.' : '';
  return {
    parish: { attended: [...s.attended, { id: o.id, day: o.day, stay, minutes }].slice(-KEEP) },
    host: remembered,
    energy: effect.energy,
    minutes,
    stay,
    effect,
    lines: [late, ...(stay === 'full' ? g.fullLines : g.partialLines), met].filter(Boolean),
  };
}

/** Lo último que pasó: se consulta en el tablón o hablando con quien lo lleva. */
export function lastAttendance(g: GatheringDef, s: ParishState): string | null {
  const a = [...s.attended].reverse().find((x) => x.id.startsWith(`${g.id}-`));
  if (!a) return null;
  return `Tu último ensayo: ${formatDate(a.day, false)}, ${a.stay === 'full' ? 'hasta el final' : `un rato (${a.minutes} min)`}.`;
}

// ------------------------------------------------------------ quién viene

/** Trabajo y desplazamiento tienen prioridad durante toda la ventana del encuentro. */
function busy(work: string | undefined, day: number, from: number, minutes: number): boolean {
  const start = abs(day, from) - ARRIVE_EARLY;
  for (let t = start; t <= abs(day, from) + minutes + 30; t++) if (workingAt(work, t)) return true;
  return false;
}

/**
 * Quien viene del barrio a ese ensayo (índices de IDENTITIES): gente que vive aquí y no trabaja a esa hora, con más
 * peso quien sale más (sociability), quien es mayor y quien tiene la música entre sus intereses. Siempre los mismos
 * para el mismo día: se puede salir y volver a entrar.
 */
export function guestsOf(g: GatheringDef, day: number): number[] {
  if (!occurrenceOn(g, day)) return [];
  // La calle y los locales lo preguntan a cada alta: se calcula una vez por ensayo.
  const key = `${g.id}-${day}`;
  const hit = GUESTS.get(key);
  if (hit) return [...hit];
  if (GUESTS.size > 16) GUESTS.clear();
  const out = pickGuests(g, day);
  GUESTS.set(key, out);
  return [...out];
}

const GUESTS = new Map<string, readonly number[]>();

function pickGuests(g: GatheringDef, day: number): number[] {
  const rng = seededRng(hashSeed('gathering', g.id, day));
  // Un coro de barrio de domingo a mediodía: sobre todo gente de 45 para arriba y a quien le gusta la música; quien
  // a esa hora sale (noche, skate, videojuegos) casi nunca. Así no se lleva a las pandas del Carmen (systems/StreetLife).
  const pool = IDENTITIES.filter((p) => p.resident && !busy(p.work, day, g.start, g.minutes)).map((p) => ({
    index: p.index,
    w: (0.1 + (p.age >= 60 ? 1.6 : p.age >= 45 ? 1 : 0) + (p.interests.includes('music') ? 0.7 : 0) + 0.3 * p.sociability)
      * (p.interests.some((i) => i === 'nightlife' || i === 'skating' || i === 'gaming') ? 0.2 : 1)
      // Quien tiene pareja suele pasar el domingo con ella (los paseos en pareja de systems/StreetLife).
      * (relationsOf(p.index).some((r) => r.type === 'couple' || r.type === 'married' || r.type === 'dating') ? 0.25 : 1),
  }));
  const n = g.guests[0] + Math.floor(rng() * (g.guests[1] - g.guests[0] + 1));
  const out: number[] = [];
  while (out.length < n && pool.length > 0) {
    let r = rng() * pool.reduce((t, p) => t + p.w, 0);
    const k = Math.max(0, pool.findIndex((p) => (r -= p.w) < 0));
    out.push(pool.splice(k, 1)[0].index);
  }
  return out;
}

/** Llegan un poco antes de empezar: desde entonces hasta el final están dentro, no en la calle. */
export const ARRIVE_EARLY = 15;

/** Quien está dentro de ese sitio por un encuentro ahora mismo (para Crowd), hasta cuándo y de qué encuentro. */
export function guestsInside(place: string, now: number): { looks: number[]; until: number; gathering?: GatheringDef } {
  const g = gatheringAt(place);
  const o = g ? occurrenceOn(g, dayOf(now)) : null;
  if (!g || !o || now < o.start - ARRIVE_EARLY || now >= o.end) return { looks: [], until: 0 };
  return { looks: guestsOf(g, o.day), until: o.end, gathering: g };
}

/** Todas las caras que ahora están en un encuentro, en cualquier sitio: la calle no las saca (StreetLife.usedLooks). */
export function gatheringLooks(now: number): number[] {
  return GATHERINGS.flatMap((g) => guestsInside(g.place, now).looks);
}

/** Ida y vuelta: esas identidades no empiezan un recado incompatible antes/después del encuentro. */
export function gatheringReservedLooks(now: number): number[] {
  return GATHERINGS.flatMap((g) => {
    const o = occurrenceOn(g, dayOf(now));
    return o && now >= o.start - ARRIVE_EARLY - 30 && now < o.end + 30 ? guestsOf(g, o.day) : [];
  });
}

export function parseParish(v: unknown): ParishState {
  const raw = (v && typeof v === 'object' ? v : {}) as { attended?: unknown };
  const attended = Array.isArray(raw.attended)
    ? raw.attended.filter((a): a is Attendance => !!a && typeof a.id === 'string' && Number.isFinite(a.day) && (a.stay === 'full' || a.stay === 'partial') && Number.isFinite(a.minutes))
    : [];
  return { attended: attended.slice(-KEEP) };
}
