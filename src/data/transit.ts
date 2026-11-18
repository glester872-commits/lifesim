import { METRO_FARE, METRO_MINUTES } from '../config/constants.ts';

/**
 * Transporte: líneas y paradas. Una parada puede ser una estación con mapa
 * (`station`, la localización con andén y spawn 'train') o un sitio que todavía
 * no tiene mapa (`offMap`, data/activities.ts). Decathlon lo fue hasta Alpha-09: ahora su parada es una
 * estación más (Polígono Norte, data/poligonoNorte.ts) y el tren, el pago y la elección de destino no cambiaron.
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
  /** Servicio continuo de gameplay; la espera real la dirige MetroDaily/TrainSystem. */
  hours: readonly [number, number];
  /** MET-01: char del muro de sus andenes (world/tiles.ts): su `trim` es el color de la cenefa y de la placa. */
  wall: string;
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
  { id: 'L2', name: 'Línea 2', card: 'transport', fare: METRO_FARE, minutesPerStop: METRO_MINUTES, hours: [0, 24], wall: 'w' },
  { id: 'L3', name: 'Línea 3 · exprés', card: 'transport', fare: METRO_FARE, minutesPerStop: METRO_MINUTES, hours: [0, 24], wall: 'x' },
];

export const STOPS: readonly TransitStop[] = [
  // Cuatro Ríos, la parada de antes de Vallesco: a una de Vallesco y a dos de la Ribera. Los trayectos de antes no cambian.
  // Velaria, la cabecera: a una de Cuatro Ríos y a dos de Vallesco. Los trayectos de antes no cambian.
  // Puerta Central, la nueva cabecera: a una de Velaria. La estación más llena de la línea. Los trayectos de antes no cambian.
  // El Arena, una más allá del intercambiador: en día de partido, media ciudad hace transbordo en Puerta Central.
  // Campo Alto, una más allá del Arena (data/campoAlto.ts). Los trayectos de antes no cambian.
  { id: 'campo-alto', name: 'Campo Alto', line: 'L2', order: -5, station: 'campo-alto-station' },
  { id: 'arena', name: 'Arena · Estadio del Halcón', line: 'L2', order: -4, station: 'arena-station' },
  { id: 'puerta-central', name: 'Puerta Central', line: 'L2', order: -3, station: 'puerta-central-station', hub: 1 },
  { id: 'velaria', name: 'Velaria', line: 'L2', order: -2, station: 'velaria-station' },
  { id: 'cuatro-rios', name: 'Cuatro Ríos', line: 'L2', order: -1, station: 'cuatro-rios-station' },
  { id: 'vallesco', name: 'Vallesco', line: 'L2', order: 0, station: 'vallesco-station' },
  { id: 'ribera', name: 'Ribera Norte', line: 'L2', order: 1, station: 'ribera-station' },
  { id: 'decathlon', name: 'Polígono Norte · Decathlon', line: 'L2', order: 2, station: 'decathlon-station' },
  // Casco Antiguo, una más allá del Polígono Norte (data/cascoAntiguo.ts). Los trayectos de antes no cambian.
  { id: 'casco-antiguo', name: 'Casco Antiguo', line: 'L2', order: 3, station: 'casco-antiguo-station' },
  // Luna, una más allá del Casco Antiguo (data/luna.ts). Los trayectos de antes no cambian.
  { id: 'luna', name: 'Luna', line: 'L2', order: 4, station: 'luna-station' },
  { id: 'puerta-central-l3', name: 'Puerta Central · L3', line: 'L3', order: 0, station: 'puerta-central-l3-station', hub: 1 },
  { id: 'decathlon-l3', name: 'Polígono Norte · Decathlon · L3', line: 'L3', order: 1, station: 'decathlon-l3-station' },
];

/** Nombre de la placa de un andén: el de su parada sin los apellidos («· L3», «· Decathlon», «· Estadio del Halcón»). */
const signName = (stop: TransitStop): string => stop.name.split(' · ')[0];

/** Línea principal del andén `station`: la de su primera parada en STOPS. Sin parada o sin línea, error al cargar. */
export function stationLine(station: string): TransitLine {
  const stop = STOPS.find((s) => s.station === station);
  const line = stop && LINES.find((l) => l.id === stop.line);
  if (!line) throw new Error(`${station}: andén sin parada o sin línea en STOPS/LINES`);
  return line;
}

/** Placa de un andén: el nombre de la parada y el char del muro de su línea (de ahí sale el color). */
export interface StationSign {
  name: string;
  wall: string;
}

/** MET-01: un rótulo por nombre de parada y línea (world/TextureFactory: `prop-metro-sign-<índice>`). */
export const STATION_SIGNS: readonly StationSign[] = [
  ...new Map(
    STOPS.filter((s) => s.station).map((s): [string, StationSign] => {
      const wall = stationLine(s.station as string).wall;
      return [`${signName(s)}|${wall}`, { name: signName(s), wall }];
    }),
  ).values(),
];

/** Índice de la placa del andén `station` (id de la localización). */
export function stationSign(station: string): number {
  const stop = STOPS.find((s) => s.station === station);
  const wall = stationLine(station).wall;
  const i = stop ? STATION_SIGNS.findIndex((s) => s.name === signName(stop) && s.wall === wall) : -1;
  if (i < 0) throw new Error(`${station}: andén sin placa en STATION_SIGNS`);
  return i;
}

/** Cada parada identifica un andén, también cuando comparte estación con otra línea. */
export const TRANSFERS = [
  { from: 'puerta-central', to: 'puerta-central-l3', minutes: 2 },
  { from: 'decathlon', to: 'decathlon-l3', minutes: 2 },
] as const;
