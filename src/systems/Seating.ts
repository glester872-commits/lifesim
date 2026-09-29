// Sin Phaser: lo usan el juego y los scripts de comprobación.
import type { Facing, LocationDef, PropKind } from '../types/game.ts';
import { furnitureAt, type SeatDef, type SeatIdle } from '../data/seating.ts';
import { findPoint } from './Navigation.ts';
import { getLocation } from './LocationSystem.ts';

/**
 * Un sitio para sentarse ya resuelto: dónde, hacia dónde se mira, cuánto se
 * sube el cuerpo y qué se hace ahí. Sale del punto `kind: 'seat'` y del mueble
 * que tiene debajo (data/seating.ts), o de un asiento del andén del metro.
 * Jugador y gente usan exactamente esto: nadie tiene su propia idea de dónde
 * cae un banco.
 */
export interface Seat {
  /** Id del punto (PARK_BENCH_01) o, en el andén, `metro:<índice>`. */
  id: string;
  tx: number;
  ty: number;
  facing: Facing;
  /** Px que sube el cuerpo sobre la pose de sentado (un taburete). */
  lift: number;
  furniture: PropKind;
  def: SeatDef;
}

function resolve(loc: LocationDef, id: string, tx: number, ty: number, facing?: Facing): Seat | undefined {
  const under = furnitureAt(loc, tx, ty);
  if (!under) return undefined;
  return { id, tx, ty, facing: under.def.facing ?? facing ?? 'down', lift: under.def.lift ?? 0, furniture: under.placement.kind, def: under.def };
}

const cache = new Map<string, Seat | null>();

/** El asiento de un punto, o undefined si el punto no es un asiento. */
export function seatAt(pointId: string | undefined): Seat | undefined {
  if (!pointId) return undefined;
  let seat = cache.get(pointId);
  if (seat === undefined) {
    const p = findPoint(pointId);
    seat = p?.kind === 'seat' ? (resolve(getLocation(p.location), pointId, p.tx, p.ty, p.facing) ?? null) : null;
    cache.set(pointId, seat);
  }
  return seat ?? undefined;
}

/** Todos los sitios para sentarse de una localización: sus puntos de asiento y, en una estación, los del andén. */
export function seatsIn(loc: LocationDef): Seat[] {
  const seats: Seat[] = [];
  for (const [id, p] of Object.entries(loc.points ?? {})) {
    const seat = p.kind === 'seat' ? seatAt(id) : undefined;
    if (seat) seats.push(seat);
  }
  loc.metro?.seats.forEach((s, i) => {
    const seat = resolve(loc, `metro:${i}`, s.tx, s.ty);
    if (seat) seats.push(seat);
  });
  return seats;
}

/** Lo que hace sentado quien no tiene otra cosa que hacer: uno de los del mueble, siempre el mismo para la misma persona. */
export function seatIdle(seat: Seat, seed: number): SeatIdle {
  return seat.def.idle[Math.abs(seed) % seat.def.idle.length];
}
