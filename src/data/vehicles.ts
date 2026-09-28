/**
 * Vehículos de la calle. Un tipo nuevo es una entrada aquí: el tráfico
 * (systems/Traffic.ts) sólo lee su largo, su ritmo y sus pesos, y el arte
 * (world/VehicleArt.ts) su silueta. Ni una línea de lógica por tipo.
 *
 * Escala de calzada comprimida, la misma de siempre: un turismo ocupa 2 tiles
 * de carril; el resto va en proporción (un autobús, dos coches y medio).
 * De perfil y en 3/4 hacia el sur: se ve el costado sur y un filo de techo.
 */

/** Silueta: cómo se reparte el perfil entre capó, cabina y caja. */
export type VehicleShape = 'hatch' | 'sedan' | 'suv' | 'van' | 'bus' | 'box-truck' | 'garbage' | 'pickup';

/** Franjas del día con tráfico distinto. */
export type TrafficBand = 'dawn' | 'morning' | 'midday' | 'evening' | 'night';

/** Tipo de vía: una avenida lleva autobuses y camiones; una calle de barrio, poco más que coches. */
export type RoadKind = 'avenue' | 'residential';

/**
 * Lo único que systems/Traffic.ts sabe de quien va por un carril: cuánto ocupa,
 * a qué ritmo va y cuánto abunda. Coches y bicis (data/bikes.ts) lo extienden
 * con su arte; la lógica de carril es la misma para todos.
 */
export interface MoverType {
  id: string;
  /** Largo en px: lo que ocupa en el carril, de parachoques a parachoques (o de rueda a rueda). */
  length: number;
  /** Ritmo de crucero relativo: un camión va más despacio que un utilitario. */
  pace: number;
  /** Colores posibles; cada uno sale con uno. */
  colors: readonly string[];
  /** Peso base en el tráfico. */
  weight: number;
  /** Multiplicador por franja (1 si no se dice). */
  bands?: Partial<Record<TrafficBand, number>>;
  /** Multiplicador en fin de semana. */
  weekend?: number;
  /** Multiplicador por tipo de vía. */
  roads?: Partial<Record<RoadKind, number>>;
}

export interface VehicleType extends MoverType {
  shape: VehicleShape;
  /** Alto del sprite en px, del techo a las ruedas. */
  height: number;
  /** Lo que lo distingue: la franja del taxi, la caja del camión, la rotativa del servicio. */
  trim?: { stripe?: string; box?: string; roof?: 'taxi' | 'beacon' | 'sign' };
}

export const VEHICLES: readonly VehicleType[] = [
  {
    id: 'compact', shape: 'hatch', length: 26, height: 15, pace: 1,
    colors: ['#8a3f45', '#3f6f78', '#c49a3a', '#6d7078'],
    weight: 22, bands: { morning: 1.2, evening: 1.2, night: 0.8, dawn: 0.5 }, weekend: 1.1,
  },
  {
    id: 'sedan', shape: 'sedan', length: 32, height: 15, pace: 1.05,
    colors: ['#7a4a52', '#b8b2a6', '#2f3f5e', '#3d5a45'],
    weight: 22, bands: { morning: 1.2, evening: 1.2, night: 0.9, dawn: 0.5 }, weekend: 1.1,
  },
  {
    id: 'suv', shape: 'suv', length: 32, height: 18, pace: 1,
    colors: ['#2b2d33', '#9aa0a6', '#5a6048'],
    weight: 12, bands: { dawn: 0.4 }, weekend: 1.3,
  },
  {
    id: 'taxi', shape: 'sedan', length: 32, height: 16, pace: 1.1,
    colors: ['#eeeae0'], trim: { stripe: '#c0493f', roof: 'taxi' },
    weight: 8, bands: { dawn: 3, night: 2.5, evening: 1.4, morning: 0.8 }, roads: { residential: 0.6 },
  },
  {
    id: 'van', shape: 'van', length: 38, height: 21, pace: 0.95,
    colors: ['#dcd8cf', '#d9b13b', '#7b5a3c'], trim: { stripe: '#4c8a54' },
    weight: 10, bands: { morning: 2.2, midday: 1.2, evening: 0.5, night: 0.1, dawn: 0.2 }, weekend: 0.4, roads: { residential: 1.2 },
  },
  {
    id: 'bus', shape: 'bus', length: 80, height: 29, pace: 0.8,
    colors: ['#2f6fa8'], trim: { stripe: '#eeeae0', roof: 'sign' },
    weight: 5, bands: { dawn: 0.3, night: 0.6 }, weekend: 0.8, roads: { residential: 0 },
  },
  {
    id: 'small-truck', shape: 'box-truck', length: 44, height: 22, pace: 0.9,
    colors: ['#dcd8cf', '#a8432f'], trim: { box: '#e8e4da' },
    weight: 5, bands: { morning: 1.6, evening: 0.4, night: 0.1, dawn: 0.1 }, weekend: 0.3, roads: { residential: 0.6 },
  },
  {
    id: 'delivery-truck', shape: 'box-truck', length: 56, height: 26, pace: 0.8,
    colors: ['#3a4f6e', '#dcd8cf'], trim: { box: '#d9d3c4', stripe: '#c0493f' },
    weight: 3, bands: { morning: 1.8, evening: 0.3, night: 0, dawn: 0.3 }, weekend: 0.3, roads: { residential: 0.3 },
  },
  {
    id: 'garbage', shape: 'garbage', length: 56, height: 26, pace: 0.7,
    colors: ['#e6e2d8'], trim: { stripe: '#4c8a54', box: '#e6e2d8' },
    weight: 1.5, bands: { dawn: 4, night: 3, morning: 0.5, midday: 0.2, evening: 0.2 },
  },
  {
    id: 'service', shape: 'pickup', length: 36, height: 19, pace: 0.9,
    colors: ['#e6e2d8'], trim: { stripe: '#e08a2c', roof: 'beacon' },
    weight: 2.5, bands: { morning: 1.3, midday: 1.2, night: 0.5, dawn: 0.3 }, weekend: 0.6,
  },
];

export function getVehicle(id: string): VehicleType {
  const v = VEHICLES.find((t) => t.id === id);
  if (!v) throw new Error(`Vehículo desconocido: ${id}`);
  return v;
}

export function bandAt(hour: number): TrafficBand {
  if (hour < 6.5) return 'dawn';
  if (hour < 11) return 'morning';
  if (hour < 17) return 'midday';
  if (hour < 21) return 'evening';
  return 'night';
}
