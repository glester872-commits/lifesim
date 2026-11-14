// Sin Phaser: lo usan MetroSystem (pone un viaje a cada pasajero visible) y scripts/check-metro-demand.ts.
import { STOPS } from '../data/transit.ts';
import { DEMAND_BUDGET, MATCH_DESTINATIONS, MATCH_FACTOR, PROFILES, RAIN_FACTOR, TRIP_PHASES, type DemandProfile } from '../data/metroDemand.ts';
import { isWeekend } from './Calendar.ts';
import { absMinute } from './Handoff.ts';
import { matchOn } from './Match.ts';
import { hashSeed, seededRng, weighted } from './MetroDaily.ts';
import { routeBetween } from './Transit.ts';
import { weatherAt } from './Weather.ts';
import type { PassengerState } from './PassengerAI.ts';

/**
 * MOV-01: quién viaja, de dónde a dónde y a qué hora. Una función del reloj, como MetroDaily.
 *
 * ponytail: los viajes no se guardan. Se regeneran con semilla (día, hora) y el reloj, así que recargar da los
 * mismos tripId y nadie se duplica al volver a una estación. Persistirlos sólo hará falta cuando un viaje
 * dependa de algo que el reloj no reconstruye (p. ej. un pasajero que el jugador haya retenido).
 */

export type TripPhase = (typeof TRIP_PHASES)[number];

export interface Trip {
  tripId: string;
  passengerId: string;
  profile: string;
  originId: string;
  destinationId: string;
  /** absMinute (systems/Handoff). */
  scheduledTime: number;
  state: TripPhase;
  /** Andenes del recorrido unidos con '>': origen, transbordos y destino. */
  routeId: string;
}

export interface Passenger {
  passengerId: string;
  profile: string;
  originId: string;
  destinationId: string;
  scheduledTime: number;
  state: TripPhase;
  routeId: string;
  isVisible: boolean;
}

const routes = new Map<string, string | null>();
/** El recorrido como '>'-cadena, o null si no hay. Memo: el grafo no cambia en una partida. */
function routeIdOf(from: string, to: string): string | null {
  const key = `${from}|${to}`;
  if (!routes.has(key)) {
    const r = from === to ? null : routeBetween(from, to);
    routes.set(key, r ? [from, ...r.legs.map((l) => l.to)].join('>') : null);
  }
  return routes.get(key)!;
}

const STATION_STOPS = STOPS.filter((s) => s.station).map((s) => s.id);

const inBand = (hour: number, bands: readonly (readonly [number, number])[]) => bands.some(([a, b]) => hour >= a && hour < b);

let memo: { key: string; trips: readonly Trip[] } | null = null;

export function tripsFor(day: number, hour: number): readonly Trip[] {
  const key = `${day}:${hour}`;
  if (memo?.key === key) return memo.trips;
  const rng = seededRng(hashSeed('metro-demand', day, hour));
  const weekend = isWeekend(day);
  const rain = weatherAt(day, hour).rain > 0 ? RAIN_FACTOR : 1;
  const match = matchOn(day) !== null;
  const trips: Trip[] = [];
  let n = 0;
  const push = (p: DemandProfile, originId: string, destinationId: string, routeId: string) => {
    const id = `${day}:${hour}:${n++}`;
    trips.push({ tripId: id, passengerId: `p-${id}`, profile: p.id, originId, destinationId,
      scheduledTime: absMinute(day, hour, Math.floor(rng() * 60)), state: 'llegando', routeId });
  };
  // Cobertura (perStop): cada andén con estación sale como origen en cada hora de la franja. Va antes que el
  // resto y fuera del tope, para que maxTripsPerBand no deje un andén sin viajeros.
  for (const p of PROFILES) {
    if (!p.perStop || !inBand(hour, p.bands)) continue;
    for (const o of STATION_STOPS) {
      const dests = STATION_STOPS.filter((d) => routeIdOf(o, d) !== null);
      for (let i = 0; i < p.perStop && dests.length > 0; i++) {
        const d = dests[Math.floor(rng() * dests.length)];
        push(p, o, d, routeIdOf(o, d)!);
      }
    }
  }
  const cap = trips.length + DEMAND_BUDGET.maxTripsPerBand;
  for (const p of PROFILES) {
    if (!inBand(hour, p.bands)) continue;
    const count = Math.round(p.base * (weekend ? p.weekend : p.weekday) * rain);
    const dests = p.destinations.map((d) => [d, match && MATCH_DESTINATIONS.includes(d) ? MATCH_FACTOR : 1] as const);
    for (let i = 0; i < count && trips.length < cap; i++) {
      const originId = p.homes[Math.floor(rng() * p.homes.length)];
      const destinationId = weighted(rng, dests);
      const routeId = routeIdOf(originId, destinationId);
      if (routeId) push(p, originId, destinationId, routeId);
    }
  }
  memo = { key, trips };
  return trips;
}

export function validateTrip(t: Trip): boolean {
  const known = (id: string) => STOPS.some((s) => s.id === id);
  return known(t.originId) && known(t.destinationId) && t.originId !== t.destinationId
    && routeBetween(t.originId, t.destinationId) !== null && (TRIP_PHASES as readonly string[]).includes(t.state);
}

/** Los viajes de esa hora cuyo recorrido pasa por ese andén (origen, transbordo o destino). */
export function tripsAt(stopId: string, day: number, hour: number): Trip[] {
  return tripsFor(day, hour).filter((t) => t.routeId.split('>').includes(stopId));
}

/** El andén es un punto intermedio del recorrido: sólo puede ser un transbordo. */
function transfersAt(trip: Trip, stopId: string): boolean {
  const nodes = trip.routeId.split('>');
  const i = nodes.indexOf(stopId);
  return i > 0 && i < nodes.length - 1;
}

export function phaseOf(state: PassengerState, trip: Trip, stopId: string): TripPhase {
  switch (state) {
    case 'ENTERING_STATION':
    case 'WALKING_TO_PLATFORM':
      return 'llegando';
    case 'WAITING':
    case 'REACTING_TO_TRAIN':
      return transfersAt(trip, stopId) ? 'transbordando' : 'esperando';
    case 'BOARDING':
    case 'RIDING':
      return 'abordando';
    case 'EXITING_TRAIN':
      return 'bajando';
    default:
      return 'saliendo';
  }
}
