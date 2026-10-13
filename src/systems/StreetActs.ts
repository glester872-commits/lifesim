// Sin Phaser: lo usan systems/StreetLife.ts (quién llega, monta, trabaja, recoge y se va) y scripts/check-puerta-central.ts.
import { STREET_ACTS, type ActState, type StreetAct } from '../data/streetActs.ts';
import { weekIndex } from './Calendar.ts';
import { hashSeed, seededRng } from './MetroDaily.ts';
import { SHELTER_RAIN } from './StreetSurvival.ts';
import type { Weather } from './Weather.ts';

/** Ms reales que tarda en extender la manta o sacar la guitarra, y en recogerlo todo. Con lluvia, la mitad. */
export const SETUP_MS: readonly [number, number] = [6_000, 10_000];
export const PACK_MS: readonly [number, number] = [5_000, 8_000];

export interface ActClock {
  day: number;
  hour: number;
  minute: number;
}

export function actsOf(location: string): readonly StreetAct[] {
  return STREET_ACTS.filter((a) => a.location === location);
}

/** Lo que hace en su sitio cuando ya ha montado: vender o actuar. */
export const workState = (act: StreetAct): ActState => (act.kind === 'vendor' ? 'SELL' : 'PERFORM');

/** Montado y trabajando (no montando ni recogiendo): sólo entonces se para la gente a comprar o a mirar. */
export const working = (state: string): boolean => state === 'SELL' || state === 'PERFORM';

/**
 * Si le toca estar ahora: viene ese día (misma semilla para todos, sin guardar nada), es uno de sus días, es su
 * tramo y no llueve. Cada día llega y se va un poco distinto: hasta media hora tarde y hasta un cuarto de hora antes.
 */
export function actOn(act: StreetAct, clock: ActClock, weather: Pick<Weather, 'rain'>): boolean {
  if (act.days && !act.days.includes(weekIndex(clock.day))) return false;
  const rng = seededRng(hashSeed('street-act', act.id, clock.day));
  if (rng() >= act.presence) return false;
  if (weather.rain >= SHELTER_RAIN) return false;
  const late = rng() * 0.5;
  const early = rng() * 0.25;
  const h = clock.hour + clock.minute / 60;
  return act.shifts.some(([from, to]) => h >= from + late && h < to - early);
}
