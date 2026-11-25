// BIKE-01 · la bici del jugador: fases de montar y bajar, física del pedaleo y el estado guardable de las bicis.
// Puro: sin Phaser, sin Math.random ni Date.now; `now` es el reloj que pase quien llama. Imports .ts para los scripts de node.
import { TILE } from '../config/constants.ts';
import { CYCLING } from '../config/cycling.ts';
import { euros } from './Commerce.ts';
import type { BikeFrame } from '../data/bikes.ts';
import type { Facing, LocationDef } from '../types/game.ts';

/** 'public': la de alquiler de una estación (data/bikeShare.ts); es tuya hasta devolverla en una estación. */
export type BikeOwner = 'player' | 'company' | 'public' | `npc:${string}`;
/** 'returned' es transitorio: returnCompanyBike la quita de la lista y parseBikes no la recupera. */
export type BikeStatus = 'parked' | 'ridden' | 'returned';
export interface BikeState {
  id: string;
  owner: BikeOwner;
  location: string;
  x: number;
  y: number;
  facing: Facing;
  status: BikeStatus;
  frame: BikeFrame;
  color: number;
}
export interface BikesState { v: 1; list: BikeState[] }

export type RidePhase = 'ON_FOOT' | 'MOUNTING' | 'CYCLING' | 'BRAKING' | 'DISMOUNTING';
export interface RideState {
  phase: RidePhase;
  bikeId?: string;
  /** px/s, siempre en [0, MAX_SPEED]. */
  speed: number;
  /** Dirección unitaria de la marcha ({0,0} a pie). */
  heading: { x: number; y: number };
  /** `now` del último cambio de fase. */
  since: number;
  /** px recorridos en esta salida. */
  travelled: number;
  /** Freno de emergencia en curso (al intentar bajarse rápido): frena con EMERGENCY_BRAKE hasta parar e ignora la entrada. */
  emergency?: boolean;
}
export interface Spot { location: string; x: number; y: number; facing: Facing }
export interface RideInput { x: number; y: number; brake: boolean }
export interface RideCtx { energy: number; onRoad: boolean }
export interface StepResult { ride: RideState; vx: number; vy: number; energyCost: number }
/** Si falla, `ride` y `bike` son los mismos objetos recibidos, salvo el freno de emergencia de dismount (ride cambia). */
export type RideOutcome =
  | { ok: true; ride: RideState; bike: BikeState }
  | { ok: false; ride: RideState; bike: BikeState; reason: string };

export const PLAYER_BIKE_ID = 'player-bike';
/** Por debajo de esto (px/s) el rozamiento la da por parada: exp() nunca llega a 0. */
const STOP_SPEED = 1;
const FACING_VEC: Record<Facing, { x: number; y: number }> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};
const FRAMES: Record<BikeFrame, true> = { city: true, road: true, rental: true, skate: true, scooter: true };

export const onFoot = (): RideState => ({ phase: 'ON_FOOT', speed: 0, heading: { x: 0, y: 0 }, since: 0, travelled: 0 });

const riding = (r: RideState): boolean => r.phase === 'CYCLING' || r.phase === 'BRAKING';

export function mount(ride: RideState, bike: BikeState, now: number): RideOutcome {
  const fail = (reason: string): RideOutcome => ({ ok: false, ride, bike, reason });
  if (ride.phase !== 'ON_FOOT') return fail('Ya estás con una bici.');
  if (bike.owner.startsWith('npc:')) return fail('Esa bici no es tuya.');
  if (bike.status !== 'parked') return fail('Esa bici no está libre.');
  return {
    ok: true,
    ride: { phase: 'MOUNTING', bikeId: bike.id, speed: 0, heading: { ...FACING_VEC[bike.facing] }, since: now, travelled: 0 },
    bike: { ...bike, status: 'ridden' },
  };
}

export function tick(ride: RideState, now: number): RideState {
  if (ride.phase === 'MOUNTING' && now - ride.since >= CYCLING.MOUNT_MS) return { ...ride, phase: 'CYCLING', since: now };
  if (ride.phase === 'DISMOUNTING' && now - ride.since >= CYCLING.DISMOUNT_MS) return { ...onFoot(), since: now };
  return ride;
}

export function dismount(ride: RideState, bike: BikeState, at: Spot, now: number): RideOutcome {
  const fail = (reason: string, r = ride): RideOutcome => ({ ok: false, ride: r, bike, reason });
  if (!riding(ride)) return fail('No vas en bici.');
  if (ride.bikeId !== bike.id) return fail('No es la bici que llevas.');
  if (ride.speed > CYCLING.DISMOUNT_MAX) return fail('Frena antes de bajarte', { ...ride, phase: 'BRAKING', emergency: true });
  return {
    ok: true,
    ride: { ...ride, phase: 'DISMOUNTING', speed: 0, since: now, emergency: undefined },
    bike: { ...bike, location: at.location, x: at.x, y: at.y, facing: at.facing, status: 'parked' },
  };
}

/** Fracción conservada al girar `deg` grados: lineal 1→TURN_KEEP_90 hasta 90° y TURN_KEEP_90→TURN_KEEP_180 hasta 180°. */
function turnKeep(deg: number): number {
  if (deg <= 90) return 1 - (1 - CYCLING.TURN_KEEP_90) * (deg / 90);
  return CYCLING.TURN_KEEP_90 - (CYCLING.TURN_KEEP_90 - CYCLING.TURN_KEEP_180) * ((deg - 90) / 90);
}

/**
 * Un paso de física. vx/vy es la velocidad a aplicar al cuerpo durante dt; la distancia (y el coste) se mide como speed × dt
 * con la velocidad del final del paso, igual que la integra el motor.
 */
export function step(ride: RideState, input: RideInput, dtMs: number, ctx: RideCtx): StepResult {
  if (!riding(ride)) return { ride, vx: 0, vy: 0, energyCost: 0 };
  const dt = Math.max(0, Math.min(dtMs, CYCLING.MAX_DT_MS)) / 1000;
  const len = Math.hypot(input.x, input.y);
  const has = len > 0;
  const dir = has ? { x: input.x / len, y: input.y / len } : null;
  const max = CYCLING.MAX_SPEED * (ctx.onRoad ? 1 : CYCLING.PEDESTRIAN_FACTOR)
    * (ctx.energy < CYCLING.LOW_ENERGY_AT ? CYCLING.LOW_ENERGY_FACTOR : 1);
  let speed = ride.speed;
  let heading = ride.heading;
  let emergency = ride.emergency === true;

  if (emergency) {
    speed = Math.max(0, speed - CYCLING.EMERGENCY_BRAKE * dt);
    if (speed === 0) emergency = false;
  } else if (input.brake) {
    speed = Math.max(0, speed - CYCLING.BRAKE * dt);
  } else {
    if (dir) {
      const dot = heading.x * dir.x + heading.y * dir.y;
      if (speed > 0 && (heading.x !== 0 || heading.y !== 0)) {
        speed *= turnKeep((Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI);
      }
      heading = dir;
    }
    if (speed > max) speed = Math.max(max, speed - CYCLING.BRAKE * dt);
    else if (dir && ctx.energy >= CYCLING.MIN_ENERGY) speed = Math.min(max, speed + CYCLING.ACCEL * dt);
    else {
      speed *= Math.exp(-CYCLING.DRAG * dt);
      if (speed < STOP_SPEED) speed = 0;
    }
  }
  speed = Math.max(0, Math.min(CYCLING.MAX_SPEED, speed));

  const dist = speed * dt;
  const mult = speed > 0.8 * CYCLING.MAX_SPEED ? CYCLING.HIGH_SPEED_ENERGY_MULT : 1;
  const braking = input.brake || emergency || (!has && speed > 0);
  return {
    ride: {
      ...ride, phase: braking ? 'BRAKING' : 'CYCLING', speed, heading, travelled: ride.travelled + dist,
      emergency: emergency || undefined,
    },
    vx: heading.x * speed,
    vy: heading.y * speed,
    energyCost: (dist / TILE) * CYCLING.ENERGY_PER_TILE * mult,
  };
}

// --- bicis del mundo ---

export function lendCompanyBike(state: BikesState, id: string, at: Spot, frame: BikeFrame, color: number): BikesState {
  if (state.list.some((b) => b.id === id)) return state;
  return { v: 1, list: [...state.list, { id, owner: 'company', ...at, status: 'parked', frame, color }] };
}

/**
 * Devolver la bici de empresa la quita de la lista (pasa por 'returned' y no se guarda), así la lista no crece y el mismo
 * id se puede volver a prestar. No se devuelve una bici que alguien lleva montada ('ridden'): primero hay que bajarse.
 */
export function returnCompanyBike(state: BikesState, id: string): BikesState {
  const bike = state.list.find((b) => b.id === id);
  if (!bike || bike.owner !== 'company' || bike.status === 'ridden') return state;
  return { v: 1, list: state.list.filter((b) => b.id !== id) };
}

// --- bici compartida (data/bikeShare.ts) ---

export const publicBike = (state: BikesState): BikeState | undefined => state.list.find((b) => b.owner === 'public');

/** Añade la de alquiler aparcada en `at` (la monta la Scene). Si ya hay una pública o ese id, nada cambia. */
export function rentPublicBike(state: BikesState, id: string, at: Spot, color = 0xc8553d): BikesState {
  if (publicBike(state) || state.list.some((b) => b.id === id)) return state;
  return { v: 1, list: [...state.list, { id, owner: 'public', ...at, status: 'parked', frame: 'rental', color }] };
}

/** La devuelve (la quita); montada no: primero hay que bajarse. */
export function returnPublicBike(state: BikesState, id: string): BikesState {
  const bike = state.list.find((b) => b.id === id);
  if (!bike || bike.owner !== 'public' || bike.status === 'ridden') return state;
  return { v: 1, list: state.list.filter((b) => b.id !== id) };
}

/** Por qué no se puede alquilar ahora (null si se puede). `fare` en euros. */
export function rentBlocker(state: BikesState, money: number, fare: number, onShift: boolean, riding: boolean): string | null {
  if (riding) return 'Ya vas en bici.';
  if (publicBike(state)) return 'Ya tienes una bici alquilada: devuélvela en una estación.';
  if (onShift) return 'Estás de turno: usa la bici de la empresa.';
  if (money + 1e-9 < fare) return `Te falta ${euros(fare - money)}.`;
  return null;
}

export const bikeShareMovementId = (bikeId: string): string => `bike-share:${bikeId}`;
/** El id del cobro, o null si ya está en el ledger (doble E): así el dinero no se mueve dos veces. */
export function bikeShareCharge(ledger: readonly { movementId?: string }[], bikeId: string): string | null {
  const id = bikeShareMovementId(bikeId);
  return ledger.some((m) => m.movementId === id) ? null : id;
}

/**
 * Id de la próxima pública: `public-<abs>`, o con sufijo `-2`, `-3`… si ese alquiler ya está cobrado (devolver y volver a
 * alquilar en el mismo minuto). La doble E no llega aquí: rentBlocker ya frena con una pública activa.
 */
export function nextPublicBikeId(ledger: readonly { movementId?: string }[], abs: number): string {
  const base = `public-${abs}`;
  if (bikeShareCharge(ledger, base)) return base;
  let n = 2;
  while (!bikeShareCharge(ledger, `${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export const playerBike = (state: BikesState): BikeState | undefined => state.list.find((b) => b.owner === 'player');

/** La bici propia (urbana, color '#3f6f78' de data/bikes.ts) aparece aparcada en `at` si se tiene y aún no existe. */
export function ensurePlayerBike(state: BikesState, owns: boolean, at: Spot): BikesState {
  if (!owns || playerBike(state) || state.list.some((b) => b.id === PLAYER_BIKE_ID)) return state;
  return {
    v: 1,
    list: [...state.list, { id: PLAYER_BIKE_ID, owner: 'player', ...at, status: 'parked', frame: 'city', color: 0x3f6f78 }],
  };
}

export function moveBike(state: BikesState, id: string, location: string, x: number, y: number): BikesState {
  if (!state.list.some((b) => b.id === id)) return state;
  return { v: 1, list: state.list.map((b) => (b.id === id ? { ...b, location, x, y } : b)) };
}

const isRecord = (o: unknown): o is Record<string, unknown> => typeof o === 'object' && o !== null && !Array.isArray(o);
const isOwner = (o: unknown): o is BikeOwner =>
  o === 'player' || o === 'company' || o === 'public' || (typeof o === 'string' && o.startsWith('npc:') && o.length > 4);
const fin = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * Tolerante: lo que no es una bici válida se descarta (id vacío o repetido, owner o status desconocidos, frame o facing
 * fuera de lista, coordenadas no finitas). Una 'ridden' vuelve 'parked' en su x/y: la partida se carga siempre a pie.
 * Las 'returned' no vuelven (ver returnCompanyBike).
 */
export function parseBikes(raw: unknown): BikesState {
  if (!isRecord(raw) || raw.v !== 1 || !Array.isArray(raw.list)) return { v: 1, list: [] };
  const seen = new Set<string>();
  const list: BikeState[] = [];
  for (const b of raw.list) {
    if (!isRecord(b)) continue;
    const { id, owner, location, x, y, facing, status, frame, color } = b;
    if (typeof id !== 'string' || !id || seen.has(id) || !isOwner(owner)) continue;
    if (typeof location !== 'string' || !location || !fin(x) || !fin(y) || !fin(color)) continue;
    if (typeof facing !== 'string' || !Object.hasOwn(FACING_VEC, facing)) continue;
    if (typeof frame !== 'string' || !Object.hasOwn(FRAMES, frame)) continue;
    if (status !== 'parked' && status !== 'ridden') continue;
    seen.add(id);
    list.push({ id, owner, location, x, y, facing: facing as Facing, status: 'parked', frame: frame as BikeFrame, color });
  }
  return { v: 1, list };
}

/** Se pasa en bici de una ubicación a otra sólo entre exteriores y nunca por el metro. */
export const canRideThrough = (fromKind: LocationDef['kind'], toKind: LocationDef['kind'], isMetro: boolean): boolean =>
  fromKind === 'exterior' && toKind === 'exterior' && !isMetro;
