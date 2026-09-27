// Sin Phaser: lo usan WorldScene y scripts/check-economy.ts.
import { LINES, STOPS, type TransitLine, type TransitStop } from '../data/transit.ts';
import { getOffMapPlace } from '../data/activities.ts';
import { hasLocation } from './LocationSystem.ts';

/** Un destino desde una parada: a dónde, cuánto se tarda y cuánto cuesta. */
export interface Destination {
  stop: TransitStop;
  line: TransitLine;
  minutes: number;
  fare: number;
}

// Validado al arrancar: una parada lleva a una estación que existe o a un sitio sin mapa conocido.
for (const stop of STOPS) {
  if (!LINES.some((l) => l.id === stop.line)) throw new Error(`Parada ${stop.id}: línea desconocida ${stop.line}`);
  if (!!stop.station === !!stop.offMap) throw new Error(`Parada ${stop.id}: o estación o sitio sin mapa, no las dos`);
  if (stop.station && !hasLocation(stop.station)) throw new Error(`Parada ${stop.id}: estación desconocida ${stop.station}`);
  if (stop.offMap) getOffMapPlace(stop.offMap);
}

export function getStop(id: string): TransitStop {
  const stop = STOPS.find((s) => s.id === id);
  if (!stop) throw new Error(`Parada desconocida: ${id}`);
  return stop;
}

/** La parada cuyo andén es esta localización. */
export function stopAtStation(locationId: string): TransitStop | undefined {
  return STOPS.find((s) => s.station === locationId);
}

/** Todas las paradas de su línea menos ella misma, con minutos y tarifa. */
export function destinationsFrom(from: TransitStop): Destination[] {
  const line = LINES.find((l) => l.id === from.line)!;
  return STOPS.filter((s) => s.line === from.line && s.id !== from.id).map((stop) => ({
    stop,
    line,
    minutes: Math.abs(stop.order - from.order) * line.minutesPerStop,
    fare: line.fare,
  }));
}
