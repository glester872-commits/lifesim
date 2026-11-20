// Sin Phaser: lo usan MetroSystem (pone un viaje a cada pasajero visible) y scripts/check-metro-demand.ts.
import { STOPS, TRANSFERS } from '../data/transit.ts';
import { DEMAND_BUDGET, MATCH_DESTINATIONS, MATCH_FACTOR, PROFILES, RAIN_FACTOR, TRIP_PHASES, type DemandProfile } from '../data/metroDemand.ts';
import { isWeekend } from './Calendar.ts';
import { absMinute } from './Handoff.ts';
import { matchPhase } from './Match.ts';
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
  // SIM-03: el plus de ida al estadio sólo en build-up/arrival (matchPhase ya resuelve la madrugada como partido de ayer).
  // leaving/after son vuelta: tripsFor no genera viajes de vuelta desde el estadio.
  const phase = matchPhase({ day, hour, minute: 30 });
  const match = phase === 'build-up' || phase === 'arrival';
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

/**
 * MOV-02: un viaje para el visible número `seq` de ese andén y esa hora, cuando tripsAt ya está repartido.
 * Reusa el recorrido de un viaje que pasa por aquí (o inventa uno con semilla si no hay ninguno) con un tripId
 * propio: `…:f<seq>` no sale nunca de tripsFor, cuyos ids son `día:hora:n`.
 */
export function tripFor(stopId: string, day: number, hour: number, seq: number, want?: TripWant): Trip | null {
  // MOV-03: sobre la lista balanceada, para que rotar con `seq` alterne sentidos y no repita siempre el mismo.
  const here = balancedDepartures(tripsAt(stopId, day, hour), stopId);
  // Propio y coherente: para 'arrive' el andén es el destino; si no, el origen, y con 'depart' su primer tramo
  // sale en tren de la misma línea desde aquí (no un transbordo a pie).
  const arrive = want === 'arrive';
  const ends = STATION_STOPS.filter((o) => {
    const r = arrive ? routeIdOf(o, stopId) : routeIdOf(stopId, o);
    if (r === null) return false;
    return want !== 'depart' || departsOnLine(r.split('>')[1], stopId);
  });
  // MOV-03: con 'depart', el sentido sale de la paridad de seq (par +1, impar -1) si hay destinos en él; en una
  // cabecera no los hay y se queda sin sentido fijo. Vale para el trip base y para el relleno.
  const heading = seq % 2 === 0 ? 1 : -1;
  const ahead = want === 'depart' ? ends.filter((o) => departsOnLine(routeIdOf(stopId, o)!.split('>')[1], stopId, heading)) : [];
  const dir = ahead.length ? heading : 0;
  let base: Trip | undefined;
  // Desde `seq` hacia delante, el primero que encaja con la fase pedida (sin `want`, el de `seq`).
  for (let k = 0; k < here.length && !base; k++) {
    const t = here[(seq + k) % here.length];
    if (!want || (tripFitsPhase(t, stopId, want) && (!dir || headingOf(t, stopId) === dir))) base = t;
  }
  if (!base) {
    if (!ends.length) return null;
    const pick = ahead.length ? ahead : ends;
    const rng = seededRng(hashSeed('metro-demand-fill', day, hour, seq));
    const other = pick[Math.floor(rng() * pick.length)];
    const [originId, destinationId] = arrive ? [other, stopId] : [stopId, other];
    const id = `${day}:${hour}:${arrive ? 'xa' : 'x'}-${stopId}`;
    base = { tripId: id, passengerId: `p-${id}`, profile: PROFILES[Math.floor(rng() * PROFILES.length)].id,
      originId, destinationId, scheduledTime: absMinute(day, hour, Math.floor(rng() * 60)),
      state: 'llegando', routeId: routeIdOf(originId, destinationId)! };
  }
  const tripId = `${base.tripId}:f${seq}`;
  return { ...base, tripId, passengerId: `p-${tripId}` };
}

/**
 * Hacia dónde va el tren que para en ese andén: +1 hacia mayor `order` de su línea, -1 hacia menor.
 * ponytail: modelo determinista por paridad de ciclo, no una línea real con trenes en ambos sentidos; en las
 * cabeceras sólo cabe un sentido. Cuando TrainSystem lleve dirección, se lee de ahí.
 */
export function trainHeadingFor(stopId: string, cycle: number): 1 | -1 {
  const stop = STOPS.find((s) => s.id === stopId);
  if (!stop) return 1;
  const orders = STOPS.filter((s) => s.line === stop.line).map((s) => s.order);
  if (stop.order === Math.min(...orders)) return 1;
  if (stop.order === Math.max(...orders)) return -1;
  return cycle % 2 === 0 ? 1 : -1;
}

/** El nodo que sigue a ese andén en el recorrido, o null si es el destino (o no está en él). */
export function nextStopOf(trip: Trip, stopId: string): string | null {
  const nodes = trip.routeId.split('>');
  const i = nodes.indexOf(stopId);
  return i >= 0 && i < nodes.length - 1 ? nodes[i + 1] : null;
}

/** Ese tren le sirve: su siguiente nodo está en la misma línea y en el sentido del tren. */
export function tripWantsTrain(trip: Trip, stopId: string, heading: 1 | -1): boolean {
  return departsOnLine(nextStopOf(trip, stopId), stopId, heading);
}

/** `next` es la siguiente parada en tren desde `stopId`: misma línea, no un TRANSFER y (si se da) en ese sentido. */
function departsOnLine(next: string | null | undefined, stopId: string, heading?: 1 | -1): boolean {
  if (!next || TRANSFERS.some((t) => (t.from === stopId && t.to === next) || (t.to === stopId && t.from === next))) return false;
  const here = STOPS.find((s) => s.id === stopId);
  const there = STOPS.find((s) => s.id === next);
  if (!here || !there || here.line !== there.line || there.order === here.order) return false;
  return heading === undefined || Math.sign(there.order - here.order) === heading;
}

export type TripWant = 'depart' | 'arrive';

/**
 * MOV-02: el viaje cuadra con lo que hace el pasajero en ese andén. 'depart': su siguiente paso desde aquí es
 * un tren de esta misma línea (un transbordo a pie hacia otro andén no cuenta: ese pasajero no sube aquí).
 * 'arrive': termina aquí o transborda aquí (el par con el nodo anterior o el siguiente es un TRANSFER).
 */
export function tripFitsPhase(trip: Trip, stopId: string, want: TripWant): boolean {
  if (want === 'depart') return departsOnLine(nextStopOf(trip, stopId), stopId);
  const nodes = trip.routeId.split('>');
  const i = nodes.indexOf(stopId);
  if (i < 0) return false;
  if (i === nodes.length - 1) return true;
  const linked = (n: string | undefined) =>
    !!n && TRANSFERS.some((t) => (t.from === stopId && t.to === n) || (t.to === stopId && t.from === n));
  return linked(nodes[i - 1]) || linked(nodes[i + 1]);
}

/** Sentido del siguiente tramo en tren desde ese andén (+1/-1), o 0 si no sale en tren de aquí. */
function headingOf(trip: Trip, stopId: string): 1 | -1 | 0 {
  const next = nextStopOf(trip, stopId);
  if (!departsOnLine(next, stopId)) return 0;
  const here = STOPS.find((s) => s.id === stopId)!;
  const there = STOPS.find((s) => s.id === next)!;
  return there.order > here.order ? 1 : -1;
}

/**
 * MOV-03: los que salen en tren desde aquí, alternando +1 y -1 (el sobrante de un sentido al final de ellos);
 * detrás, el resto en su orden. Permutación de `trips`: assignTrip los consume en orden y así los dos trenes
 * encuentran a alguien que quiera subir.
 */
export function balancedDepartures(trips: readonly Trip[], stopId: string): Trip[] {
  const up: Trip[] = [];
  const down: Trip[] = [];
  const rest: Trip[] = [];
  for (const t of trips) {
    const h = headingOf(t, stopId);
    (h === 1 ? up : h === -1 ? down : rest).push(t);
  }
  const out: Trip[] = [];
  for (let i = 0; i < Math.max(up.length, down.length); i++) {
    if (i < up.length) out.push(up[i]);
    if (i < down.length) out.push(down[i]);
  }
  return [...out, ...rest];
}

/**
 * MOV-03: orden de bajada del tren. Primero los que esperan tren y su viaje acaba (o transborda) aquí, luego el
 * resto de los que esperan tren, luego los demás; barajados dentro de cada grupo. Permutación de `list`.
 */
export function orderAlighting<T extends { waitingForTrain: boolean; trip?: Trip }>(
  list: readonly T[], stopId: string, shuffle: <U>(a: U[]) => U[],
): T[] {
  const first: T[] = [];
  const waiting: T[] = [];
  const rest: T[] = [];
  for (const p of list) {
    if (!p.waitingForTrain) rest.push(p);
    else if (p.trip && tripFitsPhase(p.trip, stopId, 'arrive')) first.push(p);
    else waiting.push(p);
  }
  return [...shuffle(first), ...shuffle(waiting), ...shuffle(rest)];
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
