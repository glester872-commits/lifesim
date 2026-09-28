// Sin Phaser: lo usan StreetLife, Characters, world/Ambience (coches),
// world/SignalView y scripts/check-signals.ts, con el mismo reloj.
import { GAME_MINUTES_PER_REAL_SECOND } from '../config/constants.ts';
import type { LocationDef, SignalDef, TilePoint } from '../types/game.ts';
import { ROADWAY, isWalkable } from './LocationSystem.ts';

/**
 * Semáforos de los pasos de peatones. El estado es una función del minuto del
 * día (con decimales): no hay nada que simular ni guardar, y peatones,
 * personajes con nombre, coches y dibujo ven siempre la misma luz. El ciclo
 * divide el día exacto, así que a medianoche no salta.
 */

export type CarLight = 'green' | 'amber' | 'red';
/** walk: se puede cruzar · flash: verde parpadeando, quien está cruzando acaba · stop: esperar. */
export type WalkLight = 'walk' | 'flash' | 'stop';

/** Fases en ms reales: verde para coches, ámbar, todo rojo, verde para peatones, parpadeo, todo rojo. */
export const PHASES: readonly (readonly [CarLight, WalkLight, number])[] = [
  ['green', 'stop', 11_000],
  ['amber', 'stop', 2_500],
  ['red', 'stop', 1_000],
  ['red', 'walk', 6_000],
  ['red', 'flash', 2_500],
  ['red', 'stop', 1_000],
];
export const CYCLE_MS = PHASES.reduce((s, [, , ms]) => s + ms, 0);
export const MS_PER_GAME_MINUTE = 1000 / GAME_MINUTES_PER_REAL_SECOND;

export interface SignalState {
  car: CarLight;
  walk: WalkLight;
  /** Ms que le quedan a esta fase. */
  left: number;
}

/** Ms dentro del ciclo a ese minuto del día. */
function cycleMs(sig: SignalDef, minuteOfDay: number): number {
  const ms = (((minuteOfDay % 1440) + 1440) % 1440) * MS_PER_GAME_MINUTE + (sig.offset ?? 0);
  return ((ms % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
}

export function signalAt(sig: SignalDef, minuteOfDay: number): SignalState {
  let t = cycleMs(sig, minuteOfDay);
  for (const [car, walk, ms] of PHASES) {
    if (t < ms) return { car, walk, left: ms - t };
    t -= ms;
  }
  return { car: 'green', walk: 'stop', left: 0 };
}

const WALK_START = PHASES.slice(0, PHASES.findIndex(([, w]) => w === 'walk')).reduce((s, [, , ms]) => s + ms, 0);
const WALK_MS = PHASES.find(([, w]) => w === 'walk')![2];

/** Minutos de juego hasta que se pueda empezar a cruzar (0 si ya se puede). */
export function minutesUntilWalk(sig: SignalDef, minuteOfDay: number): number {
  const t = cycleMs(sig, minuteOfDay);
  if (t >= WALK_START && t < WALK_START + WALK_MS) return 0;
  return ((WALK_START - t + CYCLE_MS) % CYCLE_MS) / MS_PER_GAME_MINUTE;
}

const inside = (sig: SignalDef, x: number, y: number): boolean =>
  x >= sig.tx - 0.5 && x < sig.tx + sig.w - 0.5 && y >= sig.ty - 0.5 && y < sig.ty + sig.h - 0.5;

/** Si está pisando las bandas de un paso con semáforo. */
export function onCrossing(signals: readonly SignalDef[], p: TilePoint): SignalDef | undefined {
  return signals.find((s) => inside(s, p.tx, p.ty));
}

export interface CrossingHit {
  signal: SignalDef;
  /** Fracción del tramo a la que se pisan las bandas (0–1). */
  enter: number;
  /** Hacia dónde cruza: +1 de norte a sur, −1 de sur a norte. */
  dir: 1 | -1;
}

/**
 * Si el tramo a→b entra en las bandas de un paso con semáforo desde fuera.
 * Muestreo cada cuarto de tile: los tramos del grafo son rectos y cortos.
 */
export function crossingOf(signals: readonly SignalDef[], a: TilePoint, b: TilePoint): CrossingHit | undefined {
  if (signals.length === 0 || onCrossing(signals, a)) return undefined;
  const steps = Math.max(1, Math.ceil(Math.hypot(b.tx - a.tx, b.ty - a.ty) * 4));
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const sig = onCrossing(signals, { tx: a.tx + (b.tx - a.tx) * k, ty: a.ty + (b.ty - a.ty) * k });
    if (sig) return { signal: sig, enter: k, dir: b.ty >= a.ty ? 1 : -1 };
  }
  return undefined;
}


/**
 * Sitios de espera en el bordillo de un lado (dir +1: el norte, de donde se
 * sale hacia el sur): primero la fila del bordillo frente a las bandas, luego
 * la de detrás, un poco más ancha. Sólo tiles pisables fuera de la calzada.
 */
export function waitSpots(loc: LocationDef, sig: SignalDef, dir: 1 | -1): TilePoint[] {
  const curb = dir === 1 ? sig.ty - 1 : sig.ty + sig.h;
  const back = curb - dir;
  const spots: TilePoint[] = [];
  for (let x = sig.tx; x < sig.tx + sig.w; x++) spots.push({ tx: x, ty: curb });
  for (let x = sig.tx - 1; x <= sig.tx + sig.w; x++) spots.push({ tx: x, ty: back });
  // Con mucha gente, se abren a los lados: en el bordillo, pasados los postes; detrás, un poco más.
  spots.push({ tx: sig.tx - 2, ty: curb }, { tx: sig.tx + sig.w + 1, ty: curb }, { tx: sig.tx - 2, ty: back }, { tx: sig.tx + sig.w + 1, ty: back });
  return spots.filter((p) => isWalkable(loc, p.tx, p.ty) && !ROADWAY.has(loc.ground[p.ty]?.[p.tx] ?? ''));
}
