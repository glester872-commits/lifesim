// Sin Phaser: lo usan Crowd, StreetLife, MetroSystem, WorldScene y scripts/check-recovery.ts.
import type { TilePoint } from '../types/game.ts';

/**
 * Recuperación de NPC atascados. No mueve a nadie ni sustituye la navegación:
 * vigila a quien debería estar avanzando y, si no avanza, le dice a su sistema
 * qué peldaño probar. Cada sistema sabe cómo se sube cada peldaño:
 *
 *   1 · recalcula el camino           2 · va al tile alcanzable más cerca del destino
 *   3 · deja lo que hacía y vuelve a su plan / su puesto
 *   4 · reaparece en el punto válido más cercano FUERA DE CÁMARA (si se le ve, espera)
 *
 * Sólo vigila a quien tiene un camino en marcha: quien habla, espera en un
 * semáforo, está sentado, en cola o atendiendo no tiene camino o se marca como
 * inactivo, así que nunca cuenta como atascado (falsos positivos).
 */
export const RECOVERY = {
  /** Ms sin avanzar con camino en marcha antes del peldaño 1. */
  stallMs: 4_000,
  /** Ms entre un peldaño y el siguiente (y entre reintentos del 4 mientras se le vea). */
  stepMs: 2_500,
  /** Tiles que hay que moverse para que cuente como avance. */
  progress: 0.35,
  /**
   * Ms que se recuerda el peldaño de quien se queda quieto tras un peldaño (el 3 lo para): si vuelve a
   * atascarse sin haber avanzado, sigue escalando en vez de empezar de cero. Sin esto, alguien encerrado
   * daría vueltas del 1 al 3 para siempre y nunca llegaría al 4.
   */
  memoryMs: 20_000,
  /** Esperando un semáforo más de esto, ya no es esperar: cuenta como atascado. */
  holdMs: 150_000,
  /** Medio ancho y medio alto de la cámara en tiles, con margen: más lejos, no se le ve. */
  view: { tx: 12, ty: 10 },
} as const;

export type RecoveryLevel = 0 | 1 | 2 | 3 | 4;
export type WatchKey = number | string;

export interface WatchEntry {
  x: number;
  y: number;
  /** Ms que lleva sin avanzar con camino en marcha. */
  stall: number;
  level: RecoveryLevel;
  /** Ms hasta el próximo peldaño (o reintento del 4). */
  next: number;
  /** Forzado desde depuración: el peldaño 4 puede hacerse a la vista. */
  forced?: boolean;
  /** Ms quieto a propósito desde el último peldaño (RECOVERY.memoryMs). */
  idle?: number;
}

export interface WatchStats {
  /** Veces que alguien volvió a avanzar tras al menos un peldaño. */
  recovered: number;
  /** Peldaños intentados, por nivel (índice 1–4). */
  attempts: [number, number, number, number, number];
}

export class StuckWatch {
  readonly entries = new Map<WatchKey, WatchEntry>();
  readonly stats: WatchStats = { recovered: 0, attempts: [0, 0, 0, 0, 0] };

  /**
   * Cada frame, por NPC. `active`: debería estar avanzando. Devuelve el peldaño
   * que hay que intentar ahora mismo, o 0. Al volver a avanzar se olvida todo.
   */
  check(key: WatchKey, x: number, y: number, active: boolean, deltaMs: number): RecoveryLevel {
    const e = this.entries.get(key);
    if (!active) {
      // Quieto a propósito (sentado, hablando, en el semáforo): nada que vigilar. Tras un peldaño, se recuerda un rato.
      if (e && !e.forced) {
        e.idle = (e.idle ?? 0) + deltaMs;
        if (e.level === 0 || e.idle > RECOVERY.memoryMs) this.settle(key, e);
      }
      return 0;
    }
    if (!e) {
      this.entries.set(key, { x, y, stall: 0, level: 0, next: RECOVERY.stallMs });
      return 0;
    }
    if (Math.hypot(x - e.x, y - e.y) >= RECOVERY.progress) {
      this.settle(key, e);
      this.entries.set(key, { x, y, stall: 0, level: 0, next: RECOVERY.stallMs });
      return 0;
    }
    e.idle = 0;
    e.stall += deltaMs;
    e.next -= deltaMs;
    if (e.next > 0) return 0;
    e.level = Math.min(4, e.level + 1) as RecoveryLevel;
    e.next = RECOVERY.stepMs;
    this.stats.attempts[e.level]++;
    return e.level;
  }

  /** Depuración: lo da por atascado ya; el siguiente check intenta el peldaño 1. */
  force(key: WatchKey, x: number, y: number): void {
    this.entries.set(key, { x, y, stall: RECOVERY.stallMs, level: 0, next: 0, forced: true });
  }

  /** ¿Puede reaparecer a la vista? Sólo si lo forzó la depuración. */
  forced(key: WatchKey): boolean {
    return this.entries.get(key)?.forced === true;
  }

  forget(key: WatchKey): void {
    this.entries.delete(key);
  }

  /** Depuración: borra el estado de recuperación (de uno o de todos). */
  reset(key?: WatchKey): void {
    if (key === undefined) this.entries.clear();
    else this.entries.delete(key);
  }

  /** Cuántos llevan ahora mismo parados más de `stallMs` con camino en marcha. */
  stuckCount(): number {
    let n = 0;
    for (const e of this.entries.values()) if (e.stall >= RECOVERY.stallMs) n++;
    return n;
  }

  private settle(key: WatchKey, e: WatchEntry): void {
    if (e.level > 0) this.stats.recovered++;
    this.entries.delete(key);
  }
}

export const tileKey = (p: TilePoint): string => `${Math.round(p.tx)},${Math.round(p.ty)}`;

/**
 * ¿El tile en el que va a entrar (camino de `at` hacia `target`) está cortado?
 * Mira el tile de delante, no el final del tramo: los tramos del grafo cruzan
 * muchos tiles. El tile donde ya está nunca cuenta (si no, no podría salir).
 */
export function aheadBlocked(blocked: ReadonlySet<string>, at: TilePoint, target: TilePoint): boolean {
  if (blocked.size === 0) return false;
  const dx = target.tx - at.tx;
  const dy = target.ty - at.ty;
  const d = Math.hypot(dx, dy);
  const step = Math.min(d, 0.6);
  const ahead = d === 0 ? target : { tx: at.tx + (dx / d) * step, ty: at.ty + (dy / d) * step };
  const k = tileKey(ahead);
  return k !== tileKey(at) && blocked.has(k);
}

/** Fuera del encuadre del jugador (con margen): ahí sí se puede reaparecer. */
export function offCamera(at: TilePoint, player: TilePoint): boolean {
  return Math.abs(at.tx - player.tx) > RECOVERY.view.tx || Math.abs(at.ty - player.ty) > RECOVERY.view.ty;
}

/**
 * Anchura primero desde `from` por tiles que cumplen `ok` (4 vecinos, hasta
 * `radius`). Devuelve el camino (sin `from`) al tile alcanzable que más puntúa
 * `best` (menor es mejor) y que cumple `accept`, o null. Peldaño 2 (más cerca
 * del destino) y 4 (el sitio válido más cercano fuera de cámara).
 */
export function nearestReachable(
  from: TilePoint,
  ok: (t: TilePoint) => boolean,
  best: (t: TilePoint) => number,
  accept: (t: TilePoint) => boolean = () => true,
  radius = 24,
): TilePoint[] | null {
  const start = { tx: Math.round(from.tx), ty: Math.round(from.ty) };
  const prev = new Map<string, TilePoint | null>([[tileKey(start), null]]);
  const queue: TilePoint[] = [start];
  let goal: TilePoint | null = null;
  let score = Infinity;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur !== start && accept(cur)) {
      const s = best(cur);
      if (s < score) {
        score = s;
        goal = cur;
      }
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { tx: cur.tx + dx, ty: cur.ty + dy };
      const k = tileKey(next);
      if (prev.has(k) || Math.abs(next.tx - start.tx) + Math.abs(next.ty - start.ty) > radius || !ok(next)) continue;
      prev.set(k, cur);
      queue.push(next);
    }
  }
  if (!goal) return null;
  const path: TilePoint[] = [];
  for (let p: TilePoint | null | undefined = goal; p && p !== start; p = prev.get(tileKey(p))) path.unshift(p);
  return path;
}

/** Retraso (minutos de horario) a partir del cual un personaje con nombre se pone al día fuera de cámara. */
export const NAMED_LAG_CAP = 180;

/**
 * Personaje con nombre (WorldScene): su sitio sale del horario, así que no se
 * atasca contra nada; lo que puede quedarse colgado es su estado. Una charla
 * que ya no existe lo suelta (y el retraso pasa a `lag`, como al despedirse);
 * un retraso enorme se pone al día, pero sólo donde no se le ve: el horario
 * manda y nadie salta delante del jugador. Devuelve qué se ha hecho.
 */
export function settleNamed(c: { heldAt: number | null; lag: number }, now: number, talking: boolean, offCam: boolean): 'released' | 'resynced' | null {
  if (c.heldAt !== null && !talking) {
    c.lag = Math.max(0, now - c.heldAt);
    c.heldAt = null;
    return 'released';
  }
  if (c.heldAt === null && c.lag > NAMED_LAG_CAP && offCam) {
    c.lag = 0;
    return 'resynced';
  }
  return null;
}
