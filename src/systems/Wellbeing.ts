// VID-07 · Tensión del jugador. Puro: sin Phaser, sin reloj real ni azar. El minuto es el absoluto de la partida
// ((día-1)*1440 + hora*60 + minuto). No toca la energía: es otra cosa.

export interface WellbeingSources { day: number; work: number; walk: number; sport: number; social: number; npcs: string[] }
export interface WellbeingState { v: 1; tension: number; lastMinute: number; sources: WellbeingSources }
export type WellbeingSource = 'work' | 'walk' | 'sport' | 'social';
export type TensionBand = 'calm' | 'ok' | 'tense';

export const TENSION_START = 20;
export const TENSION_MIN = 0;
export const TENSION_MAX = 100;
/** −1 de tensión cada tantos minutos de juego. */
export const DECAY_EVERY_MIN = 120;
export const WORK_GAIN = 8;
export const WORK_LATE_GAIN = 12;
export const WORK_DAILY_CAP = 16;
export const SPORT_RELIEF = 6;
export const SPORT_DAILY_CAP = 12;
export const WALK_TILES_PER_POINT = 40;
export const WALK_DAILY_CAP = 6;
export const SOCIAL_RELIEF = 3;
export const SOCIAL_DAILY_CAP = 6;
export const TENSE_AT = 70;
export const CALM_AT = 25;
export const TENSE_BONUS_CUT = 0.10;
/** Cuántos NPC distintos recuerda el día para no repetir el alivio social. */
const MAX_NPCS = 20;

const CAPS: Record<WellbeingSource, number> = { work: WORK_DAILY_CAP, walk: WALK_DAILY_CAP, sport: SPORT_DAILY_CAP, social: SOCIAL_DAILY_CAP };

const clampTension = (t: number): number => Math.min(TENSION_MAX, Math.max(TENSION_MIN, t));

function emptySources(day: number): WellbeingSources {
  return { day, work: 0, walk: 0, sport: 0, social: 0, npcs: [] };
}

export function startWellbeing(nowMinute: number): WellbeingState {
  return { v: 1, tension: TENSION_START, lastMinute: Math.max(0, Math.floor(nowMinute)), sources: emptySources(0) };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Lo guardado, validado; cualquier cosa que no cuadre vuelve al estado inicial en `nowMinute`. */
export function parseWellbeing(v: unknown, nowMinute: number): WellbeingState {
  if (!isRecord(v) || v.v !== 1 || !isFiniteNum(v.tension) || !isFiniteNum(v.lastMinute) || !isRecord(v.sources)) return startWellbeing(nowMinute);
  const s = v.sources;
  if (!isFiniteNum(s.day) || !isFiniteNum(s.work) || !isFiniteNum(s.walk) || !isFiniteNum(s.sport) || !isFiniteNum(s.social) || !Array.isArray(s.npcs)) {
    return startWellbeing(nowMinute);
  }
  const npcs = s.npcs.filter((n): n is string => typeof n === 'string').slice(0, MAX_NPCS);
  return {
    v: 1,
    tension: clampTension(v.tension),
    lastMinute: Math.max(0, Math.floor(v.lastMinute)),
    sources: { day: Math.max(0, Math.floor(s.day)), work: Math.max(0, s.work), walk: Math.max(0, s.walk), sport: Math.max(0, s.sport), social: Math.max(0, s.social), npcs },
  };
}

/** Baja 1 por cada DECAY_EVERY_MIN enteros pasados; lastMinute avanza sólo lo consumido. Idempotente para un mismo now. */
export function settleWellbeing(w: WellbeingState, nowMinute: number): WellbeingState {
  if (nowMinute < w.lastMinute) return { ...w, lastMinute: nowMinute };
  const steps = Math.floor((nowMinute - w.lastMinute) / DECAY_EVERY_MIN);
  if (steps <= 0) return w;
  return { ...w, tension: clampTension(w.tension - steps), lastMinute: w.lastMinute + steps * DECAY_EVERY_MIN };
}

/**
 * Una fuente de tensión o de alivio. `amount` es la magnitud (positiva): work suma, walk/sport/social restan.
 * Los topes diarios cuentan lo concedido por fuente; `applied` es el cambio real de tensión (con signo).
 */
export function applyWellbeing(
  w: WellbeingState, source: WellbeingSource, amount: number, nowMinute: number, day: number, npc?: string,
): { state: WellbeingState; applied: number } {
  const settled = settleWellbeing(w, nowMinute);
  const sources: WellbeingSources = settled.sources.day === day
    ? { ...settled.sources, npcs: [...settled.sources.npcs] }
    : emptySources(day);
  if (!Number.isFinite(amount) || amount <= 0) return { state: { ...settled, sources }, applied: 0 };
  if (source === 'social' && npc !== undefined) {
    if (sources.npcs.includes(npc)) return { state: { ...settled, sources }, applied: 0 };
    if (sources.npcs.length < MAX_NPCS) sources.npcs.push(npc);
  }
  const granted = Math.min(amount, Math.max(0, CAPS[source] - sources[source]));
  sources[source] += granted;
  const sign = source === 'work' ? 1 : -1;
  const tension = clampTension(settled.tension + sign * granted);
  return { state: { ...settled, tension, sources }, applied: tension - settled.tension };
}

export function tensionBand(w: WellbeingState): TensionBand {
  if (w.tension >= TENSE_AT) return 'tense';
  if (w.tension <= CALM_AT) return 'calm';
  return 'ok';
}

export function tensionLine(band: TensionBand): string {
  if (band === 'tense') return 'Llevas días con mucha tensión encima.';
  if (band === 'calm') return 'Te notas en calma.';
  return 'Ni fu ni fa.';
}

/** Con mucha tensión, el plus rinde algo menos. */
export function bonusAfterTension(bonus: number, band: TensionBand): number {
  return band === 'tense' ? Math.round(bonus * (1 - TENSE_BONUS_CUT)) : bonus;
}
