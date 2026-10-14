import { METRO_FARE, METRO_MINUTES } from '../config/constants.ts';

/**
 * Transporte: líneas y paradas. Una parada puede ser una estación con mapa
 * (`station`, la localización con andén y spawn 'train') o un sitio que todavía
 * no tiene mapa (`offMap`, data/activities.ts). Cuando Decathlon tenga mapa,
 * su parada pasa de `offMap` a `station` y nada más cambia: el tren, el pago y
 * la elección de destino ya son los mismos.
 */

export interface TransitLine {
  id: string;
  name: string;
  /** Tarjeta con la que se paga (data/items.ts). */
  card: string;
  /** Euros por viaje, se vaya a donde se vaya. */
  fare: number;
  /** Minutos de reloj entre dos paradas seguidas. */
  minutesPerStop: number;
}

export interface TransitStop {
  id: string;
  name: string;
  line: string;
  /**
   * Niveles de gente de más en el andén (systems/MetroDaily.crowdAt): la estación de un centro de la ciudad va siempre
   * más llena que las de barrio a la misma hora. Sin él, ninguno.
   */
  hub?: number;
  /** Posición en la línea: los minutos salen de la distancia entre paradas. */
  order: number;
  /** Localización con andén (y spawn 'train'). */
  station?: string;
  /** Sitio sin mapa todavía: id en OFF_MAP_PLACES. */
  offMap?: string;
}

export const LINES: readonly TransitLine[] = [
  { id: 'L2', name: 'Línea 2', card: 'transport', fare: METRO_FARE, minutesPerStop: METRO_MINUTES },
];

export const STOPS: readonly TransitStop[] = [
  // Cuatro Ríos, la parada de antes de Vallesco: a una de Vallesco y a dos de la Ribera. Los trayectos de antes no cambian.
  // Velaria, la cabecera: a una de Cuatro Ríos y a dos de Vallesco. Los trayectos de antes no cambian.
  // Puerta Central, la nueva cabecera: a una de Velaria. La estación más llena de la línea. Los trayectos de antes no cambian.
  // El Arena, una más allá del intercambiador: en día de partido, media ciudad hace transbordo en Puerta Central.
  { id: 'arena', name: 'Arena · Estadio del Halcón', line: 'L2', order: -4, station: 'arena-station' },
  { id: 'puerta-central', name: 'Puerta Central', line: 'L2', order: -3, station: 'puerta-central-station', hub: 1 },
  { id: 'velaria', name: 'Velaria', line: 'L2', order: -2, station: 'velaria-station' },
  { id: 'cuatro-rios', name: 'Cuatro Ríos', line: 'L2', order: -1, station: 'cuatro-rios-station' },
  { id: 'vallesco', name: 'Vallesco', line: 'L2', order: 0, station: 'vallesco-station' },
  { id: 'ribera', name: 'Ribera Norte', line: 'L2', order: 1, station: 'ribera-station' },
  { id: 'decathlon', name: 'Polígono Norte · Decathlon', line: 'L2', order: 2, offMap: 'decathlon' },
];
