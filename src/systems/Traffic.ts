// Sin Phaser: lo pintan world/TrafficView.ts y lo recorre scripts/check-traffic.ts.
import { TILE } from '../config/constants.ts';
import { bandAt, type MoverType } from '../data/vehicles.ts';
import type { LaneFlow, SignalDef, Vec2 } from '../types/game.ts';
import { between, type Rng } from './MetroDaily.ts';
import { weekIndex } from './Calendar.ts';
import { signalAt } from './Signals.ts';
import { weatherAt } from './Weather.ts';

/** px/s de un turismo. Despacio: es una calle de barrio, no una autopista. */
const CRUISE = 46;
/** Distancia a la que se empieza a frenar por un peatón o por el de delante. */
const BRAKE_PX = TILE * 3;
/** La línea de detención, a unos píxeles de las bandas; con ámbar, a menos de esto ya no frena. */
const STOP_GAP = 3;
const AMBER_COMMIT = TILE;
/** Cuánto acelera la llegada a la línea o al de delante: px/s por px que queda. */
const APPROACH = 2.5;
/** En cola, a un palmo del de delante. */
const QUEUE_GAP = 5;
/** Hueco libre en el borde del mapa para que entre otro por ese carril. */
const ENTRY_GAP = TILE * 2;
/** Entre dos entradas por el mismo carril, en ms. */
const SPAWN_EVERY: readonly [number, number] = [1_200, 5_000];

export interface Vehicle<T extends MoverType = MoverType> {
  id: number;
  type: T;
  /** Índice en type.colors. */
  color: number;
  /** Azar fijo de cada uno: de él sale lo que varía al pintarlo (quién monta la bici, casco, mochila). */
  seed: number;
  row: number;
  dir: 1 | -1;
  /** Centro, en px. */
  x: number;
  speed: number;
  cruise: number;
  /** Frenando o parado: luces de freno encendidas. */
  braking: boolean;
}

export interface TrafficClock {
  day: number;
  /** Minuto del día con decimales: el semáforo cambia a su segundo. */
  minuteOfDay: number;
}

type Lane = LaneFlow['lanes'][number];

/** Peso de cada tipo en esta vía, a esta hora y este día; con carril, también lo que ponen las zonas que cruza. */
export function vehicleWeights<T extends MoverType>(def: LaneFlow, catalog: readonly T[], day: number, hour: number, lane?: Lane): [T, number][] {
  const band = bandAt(hour);
  const weekend = weekIndex(day) >= 5;
  const zone = lane?.mix?.[band];
  return catalog.map((t): [T, number] => [
    t,
    t.weight * (t.bands?.[band] ?? 1) * (weekend ? (t.weekend ?? 1) : 1) * (t.roads?.[def.road] ?? 1) * (def.mix?.[t.id] ?? 1) * (zone?.[t.id] ?? 1),
  ]);
}

function pick<T>(weights: readonly [T, number][], rng: Rng): T {
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [t, w] of weights) if ((r -= w) < 0) return t;
  return weights[weights.length - 1][0];
}

/**
 * Tráfico de una calle: vehículos que entran por un borde, siguen su carril,
 * paran en la línea con el semáforo en rojo, ceden a quien pisa la calzada y
 * guardan la distancia con el de delante según lo que mide cada uno. Salen por
 * el otro borde y, si a esa hora toca, entra otro en su lugar.
 *
 * Ningún tipo tiene lógica propia: un autobús es un vehículo más largo y más
 * lento (data/vehicles.ts), y una bici, uno corto que va por el carril bici
 * (data/bikes.ts). Coches y bicis son dos Traffic sobre la misma calle, cada
 * uno con sus carriles: no se cruzan, y los dos paran en el mismo semáforo.
 */
export class Traffic<T extends MoverType = MoverType> {
  readonly vehicles: Vehicle<T>[] = [];
  private readonly def: LaneFlow;

  /** Sus carriles, para quien los pinta o los depura. */
  get lanes(): LaneFlow['lanes'] {
    return this.def.lanes;
  }
  private readonly catalog: readonly T[];
  private readonly signals: readonly SignalDef[];
  private readonly widthPx: number;
  private readonly rng: Rng;
  private readonly spawnIn: number[];
  private nextId = 0;

  constructor(def: LaneFlow, catalog: readonly T[], signals: readonly SignalDef[], widthPx: number, rng: Rng = Math.random) {
    this.catalog = catalog;
    this.def = def;
    this.signals = signals;
    this.widthPx = widthPx;
    this.rng = rng;
    this.spawnIn = def.lanes.map(() => between(rng, ...SPAWN_EVERY));
  }

  /** Cuántos por carril a esta hora (LaneFlow.hourly); sin franja, perLane. Con lluvia, menos si el flujo la nota. */
  target(hour: number, day?: number): number {
    const band = this.def.hourly?.find(([from, to]) => hour >= from && hour < to);
    const base = band ? band[2] : this.def.perLane;
    if (!this.def.rainShy || day === undefined) return base;
    return Math.round(base * (1 - this.def.rainShy * weatherAt(day, hour).rain));
  }

  /** Al entrar en el sitio, el tráfico ya está a mitad de camino: repartido por cada carril. */
  populate(clock: TrafficClock): void {
    const n = this.target(clock.minuteOfDay / 60, clock.day);
    this.def.lanes.forEach((lane, i) => {
      for (let k = 0; k < n; k++) {
        const x = ((k + 0.5) / n) * this.widthPx + (i % 2) * TILE * 3;
        this.spawn(lane, x, clock);
      }
    });
  }

  update(deltaMs: number, clock: TrafficClock, pedestrians: readonly Vec2[]): void {
    const dt = Math.min(deltaMs, 100) / 1000;
    const target = this.target(clock.minuteOfDay / 60, clock.day);

    this.def.lanes.forEach((lane, i) => {
      this.spawnIn[i] -= deltaMs;
      if (this.spawnIn[i] > 0 || this.inLane(lane).length >= target || !this.entryClear(lane)) return;
      this.spawnIn[i] = between(this.rng, ...SPAWN_EVERY);
      this.spawn(lane, 0, clock, true);
    });

    for (const v of this.vehicles) this.drive(v, dt, clock.minuteOfDay, pedestrians);

    // Sale del todo por el borde: fuera.
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      const half = v.type.length / 2;
      if ((v.dir > 0 && v.x - half > this.widthPx) || (v.dir < 0 && v.x + half < 0)) this.vehicles.splice(i, 1);
    }
  }

  private drive(v: Vehicle<T>, dt: number, minuteOfDay: number, pedestrians: readonly Vec2[]): void {
    const half = v.type.length / 2;
    const front = v.x + v.dir * half;
    const top = v.row * TILE;
    let target = v.cruise;

    // Cede a quien tenga los pies en su carril, delante.
    for (const p of pedestrians) {
      const ahead = (p.x - front) * v.dir;
      if (p.y > top && p.y < top + TILE + 8 && ahead > -6 && ahead < BRAKE_PX) target = 0;
    }

    // El semáforo: en rojo para en la línea; en ámbar también, si aún le da para frenar.
    let stopLine: number | undefined;
    for (const sig of this.signals) {
      if (v.row < sig.ty || v.row >= sig.ty + sig.h) continue;
      const light = signalAt(sig, minuteOfDay).car;
      if (light === 'green') continue;
      const line = v.dir > 0 ? sig.tx * TILE - STOP_GAP : (sig.tx + sig.w) * TILE + STOP_GAP;
      const dist = (line - front) * v.dir;
      if (dist < -1 || (light === 'amber' && dist < AMBER_COMMIT)) continue;
      if (dist < BRAKE_PX * 1.4) {
        // Se arrima despacio: velocidad según lo que le queda, no un frenazo lejos.
        target = Math.min(target, Math.max(0, (dist - 1) * APPROACH));
        stopLine = line;
      }
    }

    // La distancia con el de delante, de parachoques a parachoques: un autobús ocupa lo que mide.
    const leader = this.leaderOf(v);
    if (leader) {
      const gap = this.gap(v, leader);
      if (gap < BRAKE_PX) target = Math.min(target, leader.speed * 0.9 + Math.max(0, (gap - QUEUE_GAP) * APPROACH));
    }

    const before = v.speed;
    // Frena rápido y arranca con calma; lo grande, con más calma todavía.
    const rate = target < v.speed ? 6 : 1.5 * Math.min(1, v.type.pace + 0.1);
    v.speed += (target - v.speed) * Math.min(1, dt * rate);
    v.x += v.dir * v.speed * dt;
    v.braking = v.speed < before - 0.05 || (v.speed < 1 && target < 1);

    // Nunca se come la línea ni al de delante.
    if (stopLine !== undefined && (v.x + v.dir * half - stopLine) * v.dir > 0) {
      v.x = stopLine - v.dir * half;
      v.speed = 0;
    }
    if (leader && this.gap(v, leader) < 1) {
      v.x = leader.x - v.dir * (leader.type.length / 2 + half + 1);
      v.speed = Math.min(v.speed, leader.speed);
    }
  }

  /** El más cercano delante en su carril. */
  private leaderOf(v: Vehicle<T>): Vehicle<T> | undefined {
    let best: Vehicle<T> | undefined;
    let bestAhead = Infinity;
    for (const o of this.vehicles) {
      if (o === v || o.row !== v.row) continue;
      const ahead = (o.x - v.x) * v.dir;
      if (ahead > 0 && ahead < bestAhead) {
        bestAhead = ahead;
        best = o;
      }
    }
    return best;
  }

  /** Hueco entre el parachoques de delante de `v` y el de detrás de `leader`. */
  private gap(v: Vehicle<T>, leader: Vehicle<T>): number {
    return (leader.x - v.x) * v.dir - (leader.type.length + v.type.length) / 2;
  }

  private inLane(lane: Lane): Vehicle<T>[] {
    return this.vehicles.filter((v) => v.row === lane.row && v.dir === lane.dir);
  }

  /** Nadie en los primeros tiles del carril: el que entra no aparece encima de otro. */
  private entryClear(lane: Lane): boolean {
    return this.inLane(lane).every((v) => {
      const rear = lane.dir > 0 ? v.x - v.type.length / 2 : this.widthPx - (v.x + v.type.length / 2);
      return rear >= ENTRY_GAP;
    });
  }

  /** `atEdge`: entra por el borde con el morro justo fuera del mapa. */
  private spawn(lane: Lane, x: number, clock: TrafficClock, atEdge = false): void {
    const type = pick(vehicleWeights(this.def, this.catalog, clock.day, clock.minuteOfDay / 60, lane), this.rng);
    const half = type.length / 2;
    const at = atEdge ? (lane.dir > 0 ? -half : this.widthPx + half) : x;
    // Al repartir, nadie encima de otro: si no cabe, no sale.
    if (this.inLane(lane).some((o) => Math.abs(o.x - at) < (o.type.length + type.length) / 2 + QUEUE_GAP)) return;
    const cruise = CRUISE * type.pace * between(this.rng, 0.9, 1.1);
    this.vehicles.push({
      id: this.nextId++,
      type,
      color: Math.floor(this.rng() * type.colors.length),
      seed: Math.floor(this.rng() * 2 ** 31),
      row: lane.row,
      dir: lane.dir,
      x: at,
      speed: atEdge ? cruise : cruise * 0.8,
      cruise,
      braking: false,
    });
  }
}
