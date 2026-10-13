// Sin Phaser: lo usa scenes/WorldScene y lo prueba scripts/check-event-cues.ts.
import { ALLEY_LINES, ALLEY_SPOTS } from '../data/alleyDeals.ts';
import { STREET_EVENTS } from '../data/streetEvents.ts';
import { planDay } from './AlleyDeals.ts';
import { getLocation, hasLocation } from './LocationSystem.ts';
import { hashSeed } from './MetroDaily.ts';
import { planNight } from './StreetEvents.ts';

/**
 * Pistas de los sucesos escondidos (pelea del patio, trapicheo): nada en el mapa,
 * sólo lo que se oye cerca y lo que cuenta la gente. Sale de los mismos planes
 * que los sucesos (planNight, planDay): un rumor sólo habla de algo que de verdad
 * va a pasar ese día, y un ruido sólo suena con el suceso en marcha.
 */

/** Hasta dónde se oye una pelea (tiles) y un trapicheo, que es callado. */
export const HEAR_FIGHT = 26;
export const HEAR_ALLEY = 9;
/** Qué parte de la gente de la calle suelta el rumor de la pelea / del trapicheo (no todo el mundo lo sabe). */
const RUMOR_FIGHT = 0.4;
const RUMOR_ALLEY = 0.15;
/** Con cuánta antelación se habla de la pelea (min de juego): ese mismo día. */
const AHEAD = 14 * 60;

const pick = <T>(items: readonly T[], seed: number): T => items[seed % items.length];
const roll = (...parts: (string | number)[]): number => (hashSeed(...parts) % 1000) / 1000;

/**
 * Lo que suelta una persona anónima de la calle (`who`, estable) al charlar en
 * `location` al minuto absoluto `t`, o null. Determinista: la misma persona el
 * mismo día dice lo mismo.
 */
export function rumorFor(location: string, t: number, who: string): string | null {
  if (!hasLocation(location)) return null;
  const loc = getLocation(location);
  const day = Math.floor(t / 1440);
  for (const def of STREET_EVENTS) {
    if (def.location !== location || roll('rumor', def.id, who, day) >= RUMOR_FIGHT) continue;
    // La de esta noche, o la que empezó anoche y aún sigue de madrugada.
    for (const d of [day, day - 1]) {
      const n = planNight(def, loc, d);
      if (n.happens && t < n.fightAt && n.start - t < AHEAD) return pick(def.lines.rumor, hashSeed(who, d));
    }
  }
  for (const spot of ALLEY_SPOTS) {
    if (spot.location !== location || roll('rumor', spot.id, who, day) >= RUMOR_ALLEY) continue;
    if (planDay(spot, loc, day).episodes.some((ep) => t < ep.end)) return pick(ALLEY_LINES.rumor, hashSeed(who, day)).replace('{name}', spot.name);
  }
  return null;
}

/** Lo que se oye de un trapicheo en marcha en `spotName`; la misma línea todo el rato. */
export const alleyHeard = (spotName: string, seed: number): string => pick(ALLEY_LINES.hear, seed).replace('{name}', spotName);

/** Distancia de un tile al rectángulo de un suceso (0 dentro). */
export function distanceTo(area: { tx: number; ty: number; w: number; h: number }, p: { tx: number; ty: number }): number {
  const dx = Math.max(area.tx - p.tx, 0, p.tx - (area.tx + area.w - 1));
  const dy = Math.max(area.ty - p.ty, 0, p.ty - (area.ty + area.h - 1));
  return Math.hypot(dx, dy);
}
