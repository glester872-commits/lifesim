// Sin Phaser: lo pintan world/TrafficView.ts y lo recorre scripts/check-traffic.ts.
import { TILE } from '../config/constants.ts';
import { bandAt, type MoverType } from '../data/vehicles.ts';
import type { LaneFlow, SignalDef, Vec2 } from '../types/game.ts';
import { between, dayFactor, type Rng } from './MetroDaily.ts';
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
    // Un tipo con permiso (MoverType.gated) sólo pesa si el carril lo trae: sin eso, 0.
    t.weight * (t.bands?.[band] ?? 1) * (weekend ? (t.weekend ?? 1) : 1) * (t.roads?.[def.road] ?? 1) * (def.mix?.[t.id] ?? 1) * (zone?.[t.id] ?? (t.gated ? 0 : 1)) * (lane?.bias?.[t.id] ?? lane?.bias?.['*'] ?? 1),
  ]);
}

/** Cuántos modelos recientes se recuerdan y cuánto pesa uno que acaba de salir. */
const RECENT_MODELS = 4;
const REPEAT_WEIGHT = 0.35;
/** Mismo modelo y color a menos de esto (px) de otro coche cuenta como clon; intentos de otro color antes de rendirse. */
const CLONE_RANGE = 320;
const COLOR_TRIES = 6;

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
    this.peak = Math.max(def.perLane, ...(def.hourly ?? []).map((h) => h[2]));
    this.channel = `traffic:${def.road}:${def.lanes.map((l) => l.row).join(',')}`;
    this.spawnIn = def.lanes.map(() => between(rng, ...SPAWN_EVERY));
  }

  /**
   * Cuántos por carril a esta hora (LaneFlow.hourly); sin franja, perLane. Con lluvia, menos si el flujo la nota. Con
   * día, el tráfico de ese día: ±25 % según el día y ±15 % más según el tramo de cuatro horas (el mismo martes a la
   * misma hora no es siempre igual); nunca sin coches si lo normal es que haya, ni por encima de la hora punta del flujo.
   */
  target(hour: number, day?: number, lane?: Lane): number {
    const band = this.def.hourly?.find(([from, to]) => hour >= from && hour < to);
    const base = band ? band[2] : this.def.perLane;
    // El carril de un barrio con más (o menos) tráfico (systems/Districts.withDistrictLanes: data/districtIdentity.ts).
    const district = lane?.density ?? 1;
    if (day === undefined) return base > 0 ? Math.min(this.peak, Math.max(1, Math.round(base * district))) : 0;
    const rain = this.def.rainShy ? 1 - this.def.rainShy * weatherAt(day, hour).rain : 1;
    const varied = base * rain * district * this.dayMix(day, Math.floor(hour / 4));
    return base > 0 ? Math.min(this.peak, Math.max(1, Math.round(varied))) : 0;
  }

  /** Lo más que lleva el flujo a su hora punta: nunca más coches de los que el carril aguanta. */
  private readonly peak: number;
  private readonly channel: string;
  /** El factor del día y el tramo, calculado una vez (target() se llama cada frame). */
  private readonly mixes = new Map<number, number>();
  private dayMix(day: number, block: number): number {
    const key = day * 8 + block;
    let m = this.mixes.get(key);
    if (m === undefined) {
      m = dayFactor(day, this.channel, 0.25) * dayFactor(day, this.channel, 0.15, block);
      if (this.mixes.size > 64) this.mixes.clear();
      this.mixes.set(key, m);
    }
    return m;
  }

  /** Al entrar en el sitio, el tráfico ya está a mitad de camino: repartido por cada carril. */
  populate(clock: TrafficClock): void {
    this.def.lanes.forEach((lane, i) => {
      const n = this.target(clock.minuteOfDay / 60, clock.day, lane);
      for (let k = 0; k < n; k++) {
        const x = ((k + 0.5) / n) * this.widthPx + (i % 2) * TILE * 3;
        this.spawn(lane, x, clock);
      }
    });
  }

  update(deltaMs: number, clock: TrafficClock, pedestrians: readonly Vec2[]): void {
    const dt = Math.min(deltaMs, 100) / 1000;
    this.def.lanes.forEach((lane, i) => {
      const target = this.target(clock.minuteOfDay / 60, clock.day, lane);
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
  /** Los últimos modelos que salieron (cualquier carril): el mismo coche tres veces seguidas se nota. */
  private readonly recent: string[] = [];

  /**
   * Desarrollo (lifesim.scooter): saca uno de ese tipo por el borde de un carril que lo admita (con peso > 0 ahora
   * mismo). Devuelve si salió: en un barrio que no lo permite, nunca.
   */
  forceSpawn(typeId: string, clock: TrafficClock): boolean {
    const forced = this.catalog.find((t) => t.id === typeId);
    if (!forced) return false;
    for (const lane of this.def.lanes) {
      const w = vehicleWeights(this.def, this.catalog, clock.day, clock.minuteOfDay / 60, lane).find(([t]) => t === forced)?.[1] ?? 0;
      if (w <= 0 || !this.entryClear(lane)) continue;
      const before = this.vehicles.length;
      this.spawn(lane, 0, clock, true, forced);
      if (this.vehicles.length > before) return true;
    }
    return false;
  }

  private spawn(lane: Lane, x: number, clock: TrafficClock, atEdge = false, forced?: T): void {
    // Un modelo que acaba de salir pesa menos (un tercio): sin tiradas de más, el reparto de la hora sigue siendo el suyo.
    // Los grandes (autobuses, camiones) y los pocos que hay de un tipo (taxis) no entran: ya salen de uno en uno.
    const weights = vehicleWeights(this.def, this.catalog, clock.day, clock.minuteOfDay / 60, lane).map(
      ([t, w]): [T, number] => [t, t.length < 50 && w >= 4 && this.recent.includes(t.id) ? w * REPEAT_WEIGHT : w],
    );
    const type = forced ?? pick(weights, this.rng);
    this.recent.push(type.id);
    if (this.recent.length > RECENT_MODELS) this.recent.shift();
    const half = type.length / 2;
    const at = atEdge ? (lane.dir > 0 ? -half : this.widthPx + half) : x;
    // Al repartir, nadie encima de otro: si no cabe, no sale.
    if (this.inLane(lane).some((o) => Math.abs(o.x - at) < (o.type.length + type.length) / 2 + QUEUE_GAP)) return;
    const cruise = CRUISE * type.pace * between(this.rng, 0.9, 1.1);
    // El color: blancos, negros y grises casi siempre; azul, rojo y verde de vez en cuando (VehicleType.colorWeight).
    // Nunca el mismo modelo y color a la vista de otro, en cualquier carril: se vuelve a tirar (hasta COLOR_TRIES veces) y,
    // si no hay manera, el menos repetido. A la vista = a menos de CLONE_RANGE px, que es lo que cabe en pantalla.
    const palette = (type as unknown as { colorWeight?: readonly number[] }).colorWeight;
    const draw = (): number => (palette && palette.length === type.colors.length ? pick(palette.map((w, i): [number, number] => [i, w]), this.rng) : Math.floor(this.rng() * type.colors.length));
    const clones = (c: number): number => this.vehicles.filter((o) => o.type === type && o.color === c && Math.abs(o.x - at) < CLONE_RANGE).length;
    let color = draw();
    for (let tries = 1; tries < COLOR_TRIES && clones(color) > 0; tries++) color = draw();
    if (clones(color) > 0) {
      let best = color;
      for (let c = 0; c < type.colors.length; c++) if (clones(c) < clones(best)) best = c;
      color = best;
    }
    this.vehicles.push({
      id: this.nextId++,
      type,
      color,
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
