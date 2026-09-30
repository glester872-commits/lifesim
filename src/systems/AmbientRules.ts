// Sin Phaser: lo usan world/Atmosphere.ts y scripts/check-ambience.ts.
import type { Weather } from './Weather.ts';

/**
 * Cuándo sale cada efecto de ambiente que depende del agua, del fuego o de una
 * cocina: reglas puras, comprobables sin pintar nada. world/Atmosphere.ts
 * las usa para decidir; scripts/check-ambience.ts las recorre y falla si un
 * efecto sale sin motivo.
 *
 * Todas devuelven cuánto toca ahora (0 = nada): ritmo por segundo o fuerza de
 * 0 a 1, según diga cada una.
 */

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Frío que se ve (vaho, vapor, humo): 0 a partir de 13 °C, 1 por debajo de 4 °C. */
export const coldness = (w: Weather): number => clamp01((13 - w.celsius) / 9);

/** Horas de cocinar: desayunos, comidas y cenas. */
export function cooking(hour: number): boolean {
  return (hour >= 7 && hour < 10.5) || (hour >= 12.5 && hour < 15.5) || (hour >= 19.5 && hour < 23);
}

/**
 * El extractor del tejado de un local de comida (0–1): humea con el local
 * abierto y a la hora de cocinar, haga el tiempo que haga; con frío se ve más.
 */
export function kitchenSteam(hour: number, w: Weather, open: boolean): number {
  return open && cooking(hour) ? 0.6 + coldness(w) * 0.4 : 0;
}

/** Agua que levantan las ruedas (por segundo): calzada mojada y algo de velocidad; cuanto más rápido, más. */
export function sprayRate(speed: number, w: Weather): number {
  return w.wet > 0.3 && speed > 35 ? 4 * w.wet * clamp01(speed / 120) : 0;
}

/** Pisadas en el suelo encharcado (por segundo): quien anda con el suelo muy mojado; lloviendo, algo más. */
export function splashRate(moving: boolean, w: Weather): number {
  return moving && w.wet > 0.4 ? 0.6 * w.wet * (w.rain > 0.08 ? 1.3 : 1) : 0;
}

/**
 * Destello en el mojado bajo una luz (0–1): sólo con el suelo mojado y de
 * noche, cuando hay algo que reflejar. `night`: 0 de día, 1 noche cerrada.
 */
export function glintLevel(w: Weather, night: number): number {
  return w.wet > 0.25 && night > 0.3 ? w.wet * night : 0;
}

/**
 * Chispas del freno del tren (por segundo): durante todo el frenado de entrada,
 * que dura menos de un segundo, más cuanto más muerde el freno. Al arrancar o
 * parado, ninguna.
 */
export function sparkRate(state: string, speed: number, cruise = 170): number {
  return state === 'ARRIVING' && speed > 4 ? 22 + (1 - clamp01(speed / cruise)) * 26 : 0;
}
