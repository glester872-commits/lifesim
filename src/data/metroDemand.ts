import { METRO_CONFIG } from '../config/metro.ts';

/**
 * MOV-01: demanda de viajes del metro. Sólo datos; la lógica está en systems/MetroDemand.ts.
 * Las paradas son ids de STOPS (data/transit.ts). Nada aquí depende de una estación concreta.
 */

export const TRIP_PHASES = ['llegando', 'esperando', 'abordando', 'transbordando', 'bajando', 'saliendo'] as const;

export interface DemandProfile {
  id: string;
  /** Franjas [desde, hasta) en horas del día. */
  bands: readonly (readonly [number, number])[];
  /** Viajes por hora dentro de la franja, antes de pesos y factores. */
  base: number;
  weekday: number;
  weekend: number;
  homes: readonly string[];
  destinations: readonly string[];
  /** Viajes por hora que salen de CADA parada con estación hacia un destino alcanzable; no cuentan para el tope. */
  perStop?: number;
}

const HOMES = ['luna', 'vallesco', 'cuatro-rios', 'velaria', 'campo-alto', 'ribera'] as const;
const WORK = ['puerta-central', 'decathlon'] as const;
const LEISURE = ['arena', 'casco-antiguo', 'puerta-central'] as const;

export const PROFILES: readonly DemandProfile[] = [
  // Fondo: el metro circula las 24 h (LINES.hours en data/transit.ts), así que cada andén con estación tiene un
  // viaje que sale de él cada hora (perStop). Sin viajes casa-centro aparte: 12/h de valle, la punta muy por encima.
  { id: 'base', bands: [[0, 24]], base: 0, weekday: 1, weekend: 1, homes: [], destinations: [], perStop: 1 },
  { id: 'casa-trabajo', bands: [[7, 10]], base: 120, weekday: 1, weekend: 0.2, homes: HOMES, destinations: WORK },
  // El regreso: de donde se trabaja a casa, así que las listas van al revés.
  { id: 'regreso', bands: [[17, 20]], base: 110, weekday: 1, weekend: 0.3, homes: WORK, destinations: HOMES },
  { id: 'ocio', bands: [[11, 14], [19, 23]], base: 40, weekday: 0.6, weekend: 1.5, homes: HOMES, destinations: LEISURE },
  { id: 'recados', bands: [[10, 13], [16, 19]], base: 30, weekday: 1, weekend: 0.8, homes: HOMES, destinations: [...WORK, 'casco-antiguo'] },
];

export const DEMAND_BUDGET = { maxTripsPerBand: 400, maxVisible: METRO_CONFIG.maxPassengers } as const;

/** Con lluvia, más gente coge el metro en vez de andar. */
export const RAIN_FACTOR = 1.2;
/** En día de partido, peso extra de los destinos del estadio al elegir destino. */
export const MATCH_FACTOR = 6;
export const MATCH_DESTINATIONS: readonly string[] = ['arena'];
