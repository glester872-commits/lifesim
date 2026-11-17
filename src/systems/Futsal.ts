// Sin Phaser: lo usan scenes/WorldScene (la portería de Campo Alto), systems/Fitness y scripts/check-campo-alto-futsal.ts.
import type { Vec2 } from '../types/game.ts';
import { DAYS_PER_WEEK, weekIndex } from './Calendar.ts';

/**
 * Penaltis con los del barrio (CA-02): una tanda de cinco tiros contra un portero que se mueve solo. Arriba y abajo
 * apuntan, mantener carga la potencia y soltar chuta. Lo que pasa sale de dónde se apunta, de dónde está el portero
 * al soltar, de la potencia y de un poco de suerte acotada. Este módulo no sabe de pantallas: da el resultado, dónde
 * está el balón y el portero, y la máquina de la tanda; la escena sólo los pinta. Todos los números están aquí.
 */
export const FUTSAL = {
  /** Tiros de una tanda. */
  shots: 5,
  /** Lo que tarda en llenarse el medidor (ms) y lo que se aguanta lleno antes de chutar solo (ms). */
  chargeMs: 1_000,
  overholdMs: 220,
  /** Menos que esto es un toque sin querer: no se chuta. */
  minPower: 0.15,
  /** Por debajo de esto, el balón llega muerto: el portero lo recoge. */
  weakPower: 0.35,
  /** Lo que se mueve la puntería por segundo (de −1 a 1 es toda la portería). */
  aimSpeed: 1.6,
  /** Lo que va y viene el portero por segundo (en la misma escala que la puntería). */
  keeperSpeed: 0.9,
  /** Hasta dónde llega el portero desde donde está. */
  keeperReach: 0.28,
  /** La franja junto a cada palo: ahí se da al palo o se va fuera. */
  postBand: 0.08,
  /** Con el portero encima, esta parte se le escapa igual. */
  keeperSlip: 0.12,
  /** Tiempos de la escena (ms): el vuelo más lento y más rápido, y lo que se queda viendo el resultado. */
  slowMs: 900,
  fastMs: 380,
  settleMs: 750,
  /** Coste de cada tiro: minutos de reloj y energía (modesto). */
  minutesPerShot: 1,
  energyPerShot: 0.6,
  /** Por debajo de esta energía, no hay fuerzas para chutar. */
  minEnergy: 4,
} as const;

export interface Pitch {
  id: string;
  /** Punto de data/campoAlto.ts en el que se pone el jugador; se reserva igual que cualquier otro puesto. */
  point: string;
  label: string;
  /** La portería (el prop 'futsal-goal'): su tile base y lo que ocupa hacia arriba. */
  goal: { tx: number; ty: number; tilesHigh: number };
  /** Cuándo se juega: día de la semana (Calendar.weekIndex, 5 = sábado) y horas [from, to). */
  open: { weekday: number; from: number; to: number };
}

export type KickKind = 'goal' | 'saved' | 'post' | 'wide' | 'weak';

export interface Kick {
  kind: KickKind;
  scored: boolean;
  /** −1 (palo de arriba) a 1 (palo de abajo). */
  aim: number;
  power: number;
  /** Dónde estaba el portero al soltar, en la misma escala. */
  keeper: number;
}

/** Si se juega ahora: el día de la semana y la franja. */
export const isOpen = (p: Pitch, day: number, hour: number): boolean => weekIndex(day) === p.open.weekday && hour >= p.open.from && hour < p.open.to;

/** La semana de la partida (0 = la del día 1): el mejor resultado se cuenta por semana. */
export const futsalWeek = (day: number): number => Math.floor((day - 1) / DAYS_PER_WEEK);

/** El resultado de un penalti. Pura: la suerte, inyectada. */
export function kickOutcome(aim: number, power: number, keeper: number, rng: () => number): Kick {
  const base = { aim, power, keeper };
  if (power < FUTSAL.weakPower) return { kind: 'weak', scored: false, ...base };
  if (Math.abs(aim) > 1 - FUTSAL.postBand) {
    const kind: KickKind = rng() < 0.5 ? 'post' : 'wide';
    return { kind, scored: false, ...base };
  }
  if (Math.abs(aim - keeper) <= FUTSAL.keeperReach && rng() >= FUTSAL.keeperSlip) return { kind: 'saved', scored: false, ...base };
  return { kind: 'goal', scored: true, ...base };
}

// ------------------------------------------------------------------ la tanda

export interface Geometry {
  /** Pies del jugador, el centro de la boca de la portería (en el suelo) y media boca, en px del mundo. */
  feet: Vec2;
  goalCenter: Vec2;
  goalHalfHeight: number;
}

export type Phase = 'aim' | 'charging' | 'flight' | 'done';
export type SessionEvent = { type: 'release' | 'result'; kick: Kick } | { type: 'ready' } | { type: 'over' };

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const lerp = (a: Vec2, b: Vec2, k: number): Vec2 => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

export class PenaltySession {
  phase: Phase = 'aim';
  aim = 0;
  /** 0–1 mientras se carga. */
  power = 0;
  goals = 0;
  taken = 0;
  last: Kick | null = null;
  private held = 0;
  private t = 0;
  private flightMs = 0;
  private resulted = false;
  /** El reloj del portero (ms): sólo corre mientras se prepara el tiro, así su vaivén es determinista. */
  private clock = 0;
  private keeperAt = 0;
  private readonly g: Geometry;
  private readonly rng: () => number;
  /** Tiros de la sesión: la tanda del sábado (FUTSAL.shots) o un partido de liga (systems/League MATCH_SHOTS). */
  readonly shots: number;

  constructor(geometry: Geometry, rng: () => number, shots: number = FUTSAL.shots) {
    this.g = geometry;
    this.rng = rng;
    this.shots = shots;
  }

  /** Cada frame: `aim` es arriba (−1), abajo (1) o nada; `down`, si se está pulsando el botón de chutar. */
  update(dtMs: number, input: { aim: -1 | 0 | 1; down: boolean }): SessionEvent[] {
    const out: SessionEvent[] = [];
    if (this.phase === 'aim' || this.phase === 'charging') {
      this.aim = clamp(this.aim + input.aim * FUTSAL.aimSpeed * (dtMs / 1000), -1, 1);
      this.clock += dtMs;
      this.keeperAt = Math.sin((this.clock / 1000) * FUTSAL.keeperSpeed * Math.PI) * 0.8;
    }
    if (this.phase === 'aim' && input.down) {
      this.phase = 'charging';
      this.power = 0;
      this.held = 0;
    } else if (this.phase === 'charging') {
      this.held += dtMs;
      this.power = Math.min(1, this.held / FUTSAL.chargeMs);
      const over = this.held > FUTSAL.chargeMs + FUTSAL.overholdMs;
      if (!input.down || over) {
        if (this.power < FUTSAL.minPower) {
          this.phase = 'aim';
          this.power = 0;
        } else {
          const kick = kickOutcome(this.aim, this.power, this.keeperAt, this.rng);
          this.last = kick;
          this.taken++;
          this.t = 0;
          this.resulted = false;
          this.flightMs = FUTSAL.slowMs - (FUTSAL.slowMs - FUTSAL.fastMs) * this.power;
          this.phase = 'flight';
          out.push({ type: 'release', kick });
        }
      }
    } else if (this.phase === 'flight') {
      this.t += dtMs;
      if (!this.resulted && this.t >= this.flightMs) {
        this.resulted = true;
        if (this.last?.scored) this.goals++;
        out.push({ type: 'result', kick: this.last! });
      }
      if (this.t >= this.flightMs + FUTSAL.settleMs) {
        this.power = 0;
        if (this.taken >= this.shots) {
          this.phase = 'done';
          out.push({ type: 'over' });
        } else {
          this.phase = 'aim';
          out.push({ type: 'ready' });
        }
      }
    }
    return out;
  }

  /** Dónde está el portero, de −1 a 1. */
  keeper(): number {
    return this.keeperAt;
  }

  /** El portero en px del mundo (y de sus pies): en la boca, donde le toca. */
  keeperY(): number {
    return this.g.goalCenter.y + this.keeperAt * this.g.goalHalfHeight;
  }

  /** Adónde va el balón y dónde se queda, según lo que ha pasado. */
  private legs(k: Kick): { hit: Vec2; rest: Vec2 } {
    const { goalCenter: c, goalHalfHeight: h, feet } = this.g;
    const side = k.aim < 0 ? -1 : 1;
    const keeper = { x: c.x - 4, y: this.keeperY() };
    switch (k.kind) {
      case 'goal': return { hit: { x: c.x + 6, y: c.y + k.aim * h * 0.9 }, rest: { x: c.x + 9, y: c.y + k.aim * h * 0.9 } };
      case 'saved': return { hit: keeper, rest: { x: keeper.x - 14, y: keeper.y + 4 } };
      case 'weak': return { hit: keeper, rest: keeper };
      case 'post': {
        const post = { x: c.x, y: c.y + side * h };
        return { hit: post, rest: lerp(post, feet, 0.4) };
      }
      case 'wide': return { hit: { x: c.x + 6, y: c.y + side * (h + 8) }, rest: { x: c.x + 14, y: c.y + side * (h + 10) } };
    }
  }

  /** El balón ahora (px del mundo, en el suelo): delante del pie mientras se prepara; luego, su camino. */
  ball(): Vec2 | null {
    if (this.phase === 'done') return null;
    const start = { x: this.g.feet.x + 7, y: this.g.feet.y - 1 };
    if (this.phase !== 'flight' || !this.last) return start;
    const { hit, rest } = this.legs(this.last);
    if (this.t < this.flightMs) return lerp(start, hit, this.t / this.flightMs);
    return lerp(hit, rest, Math.min(1, (this.t - this.flightMs) / (FUTSAL.settleMs * 0.5)));
  }

  /** Cortar en seco (Esc, cambio de escena): el balón desaparece y la tanda no vuelve a hacer nada. */
  cancel(): void {
    this.phase = 'done';
    this.power = 0;
  }
}

// ------------------------------------------------------------------ lo que se guarda

/** El mejor resultado de la semana y cuántas tandas se han jugado en ella (Fitness.futsal). */
export interface FutsalRecord {
  week: number;
  best: number;
  tandas: number;
}

/** Suma una tanda: en una semana nueva se empieza de cero; en la misma, se queda el mejor. */
export function recordTanda(prev: FutsalRecord | undefined, week: number, goals: number): FutsalRecord {
  if (!prev || prev.week !== week) return { week, best: goals, tandas: 1 };
  return { week, best: Math.max(prev.best, goals), tandas: prev.tandas + 1 };
}

/** Lee lo guardado; cualquier cosa rara es «sin registro», nunca un error. */
export function parseFutsal(v: unknown): FutsalRecord | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const r = v as Record<string, unknown>;
  const ok = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  if (!ok(r.week) || !ok(r.best) || !ok(r.tandas)) return undefined;
  return { week: Math.floor(r.week), best: Math.min(FUTSAL.shots, Math.floor(r.best)), tandas: Math.floor(r.tandas) };
}
