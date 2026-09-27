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
  { id: 'vallesco', name: 'Vallesco', line: 'L2', order: 0, station: 'vallesco-station' },
  { id: 'ribera', name: 'Ribera Norte', line: 'L2', order: 1, station: 'ribera-station' },
  { id: 'decathlon', name: 'Polígono Norte · Decathlon', line: 'L2', order: 2, offMap: 'decathlon' },
];
