// Sin Phaser: lo usan systems/StreetLife.ts (dónde está y qué hace cada uno), scenes/WorldScene.ts (qué dice)
// y scripts/check-street-survival.ts.
import { COVERED, STREET_SURVIVORS, type StreetSurvivor, type SurvivalState } from '../data/streetSurvival.ts';
import { hashSeed, seededRng } from './MetroDaily.ts';
import type { Weather } from './Weather.ts';

/** Con esta lluvia, quien está al raso se va a cubierto. */
export const SHELTER_RAIN = 0.3;
/** De madrugada aún cuenta el día anterior: quien se durmió anoche sigue siendo «de ayer». */
const DAY_TURNS_AT = 6;

export interface SurvivalClock {
  day: number;
  hour: number;
  minute: number;
}

/** Dónde le toca estar (sus sitios, por orden de preferencia) y qué hacer allí. */
export interface SurvivalPlan {
  spots: readonly string[];
  state: SurvivalState;
  /** Se ha movido por la lluvia. */
  sheltered: boolean;
}

export function survivorsOf(location: string): readonly StreetSurvivor[] {
  return STREET_SURVIVORS.filter((s) => s.location === location);
}

/** Si hoy anda por el barrio: cada día se decide igual para todos (misma semilla), sin guardar nada. */
export function presentOn(s: StreetSurvivor, clock: SurvivalClock): boolean {
  const day = clock.hour < DAY_TURNS_AT ? clock.day - 1 : clock.day;
  return seededRng(hashSeed('street-survivor', s.id, day))() < s.presence;
}

/**
 * Su plan a esta hora con este tiempo, o null si no está (no es su hora, o hoy
 * no ha venido). Con lluvia, de un sitio al raso a uno cubierto: quien dormía
 * sigue durmiendo (a cubierto) y quien estaba, se resguarda.
 */
export function planFor(s: StreetSurvivor, clock: SurvivalClock, weather: Pick<Weather, 'rain'>): SurvivalPlan | null {
  if (!presentOn(s, clock)) return null;
  const h = clock.hour + clock.minute / 60;
  const slot = s.day.find((t) => h >= t.from && h < t.to);
  if (!slot) return null;
  if (weather.rain >= SHELTER_RAIN && !slot.spots.some((p) => COVERED.has(p))) {
    return { spots: s.shelter, state: slot.state === 'SLEEP' ? 'SLEEP' : 'SHELTER', sheltered: true };
  }
  return { spots: slot.spots, state: slot.state, sheltered: false };
}

// ------------------------------------------------------------------ voz

/** Lo que el jugador sabe de esta persona (EventMemory.importantNPCsMet, que se guarda). */
export interface SurvivorMemory {
  encounters: number;
  /** Monedas dadas. */
  affinity: number;
  lastDay: number;
}

/** Lo que pasa al acercarse: si se deja hablar, lo que dice primero y si pide algo. */
export interface SurvivorOpening {
  /** Duerme o no le apetece: una línea y ya. */
  closed: boolean;
  lines: string[];
  asks: boolean;
}

/** Una frase de la lista, rotando con lo que ya habéis hablado: nunca la misma dos veces seguidas. */
function rotate(list: readonly string[], turn: number): string {
  return list[((turn % list.length) + list.length) % list.length];
}

export function memoryKey(s: StreetSurvivor): string {
  return `street:${s.id}`;
}

/**
 * Lo primero al acercarse. Dormido no se le despierta. Despierto, a veces no
 * le apetece (más a quien es más reservado; sale del día, la hora y las veces
 * que habéis hablado, así que no es siempre igual). Si ya te conoce, te saluda
 * como a alguien conocido; si está pidiendo, pide.
 */
export function openingFor(s: StreetSurvivor, state: string, clock: SurvivalClock, memory: SurvivorMemory | undefined): SurvivorOpening {
  if (state === 'SLEEP') return { closed: true, lines: ['(Duerme tapado con la manta. Mejor no despertarle.)'], asks: false };
  const met = memory?.encounters ?? 0;
  const mood = seededRng(hashSeed('street-mood', s.id, clock.day, clock.hour, met))();
  // Con quien ya le ha ayudado alguna vez, la reserva baja a la mitad.
  const reserve = (memory?.affinity ?? 0) > 0 ? s.reserve / 2 : s.reserve;
  if (mood < reserve) return { closed: true, lines: [rotate(s.voice.refuse, met + clock.day)], asks: false };
  const hello = met > 0 ? rotate(s.voice.known, met) : rotate(s.voice.greet, clock.day);
  const asks = state === 'ASK';
  return { closed: false, lines: asks ? [hello, rotate(s.voice.ask, met)] : [hello], asks };
}

/** Un poco de charla: cada vez una cosa distinta, en orden, empezando por donde lo dejasteis. */
export function chatLine(s: StreetSurvivor, memory: SurvivorMemory | undefined): string {
  return rotate(s.voice.chat, memory?.encounters ?? 0);
}

export function thanksLine(s: StreetSurvivor, memory: SurvivorMemory | undefined): string {
  return rotate(s.voice.thanks, memory?.affinity ?? 0);
}
