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
export type VehicleShape = 'city' | 'hatch' | 'sedan' | 'wagon' | 'suv-compact' | 'suv' | 'van' | 'bus' | 'coach' | 'box-truck' | 'garbage' | 'pickup';

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
  /** Autobuses: la línea que lleva el letrero de cada variante (una por color, en orden). */
  routes?: readonly string[];
}

/** Banda y horario del taxi: más de madrugada y de noche, menos por calles de barrio. */
const TAXI = { colors: ['#f2f0ea'], trim: { stripe: '#c8202a', roof: 'taxi' as const }, bands: { dawn: 3, night: 2.5, evening: 1.4, morning: 0.8 }, roads: { residential: 0.6 } };

export const VEHICLES: readonly VehicleType[] = [
  // Turismos: muchos utilitarios y compactos, berlinas y familiares, SUV compactos; los grandes y los premium, pocos.
  {
    id: 'city', shape: 'city', length: 35, height: 19, pace: 0.95,
    colors: ['#e6e2da', '#8a3f45', '#3f6f78', '#c9b25a', '#2b2d33', '#9ab0c4'],
    weight: 14, bands: { morning: 1.1, evening: 1.1, night: 0.8, dawn: 0.5 }, weekend: 1.1, roads: { residential: 1.3 },
  },
  {
    id: 'compact', shape: 'hatch', length: 38, height: 19, pace: 1,
    colors: ['#8a3f45', '#3f6f78', '#c49a3a', '#6d7078', '#e8e4dc', '#2a3550', '#1f2126'],
    weight: 22, bands: { morning: 1.2, evening: 1.2, night: 0.8, dawn: 0.5 }, weekend: 1.1,
  },
  {
    id: 'sedan', shape: 'sedan', length: 42, height: 19, pace: 1.05,
    colors: ['#7a4a52', '#b8b2a6', '#2f3f5e', '#3d5a45', '#1f2126', '#e6e2d8'],
    weight: 14, bands: { morning: 1.2, evening: 1.2, night: 0.9, dawn: 0.5 }, weekend: 1.1,
  },
  {
    id: 'wagon', shape: 'wagon', length: 43, height: 20, pace: 1.05,
    colors: ['#5a6470', '#2b2d33', '#b8b2a6', '#3a4f6e'],
    weight: 8, bands: { morning: 1.2, evening: 1.1, night: 0.7, dawn: 0.5 }, weekend: 1.2,
  },
  {
    id: 'suv-compact', shape: 'suv-compact', length: 40, height: 21, pace: 1,
    colors: ['#9aa0a6', '#e6e2d8', '#7a2f30', '#2f3f5e', '#5a6048', '#c9c2b2'],
    weight: 12, bands: { dawn: 0.5 }, weekend: 1.2,
  },
  {
    id: 'suv', shape: 'suv', length: 44, height: 23, pace: 1,
    colors: ['#2b2d33', '#9aa0a6', '#5a6048'],
    weight: 5, bands: { dawn: 0.4 }, weekend: 1.3,
  },
  {
    id: 'premium', shape: 'sedan', length: 45, height: 19, pace: 1.1,
    colors: ['#14161a', '#3a3f48', '#e8e8ec'],
    weight: 2.5, bands: { dawn: 0.5, night: 1.2 }, roads: { residential: 0.5 },
  },
  // Taxis de Madrid: blancos con la banda roja en diagonal y el piloto en el techo, sobre varias carrocerías.
  { ...TAXI, id: 'taxi', shape: 'sedan', length: 42, height: 19, pace: 1.1, weight: 4 },
  { ...TAXI, id: 'taxi-wagon', shape: 'wagon', length: 43, height: 20, pace: 1.1, weight: 2 },
  { ...TAXI, id: 'taxi-suv', shape: 'suv-compact', length: 40, height: 21, pace: 1.1, weight: 2 },
  { ...TAXI, id: 'taxi-hybrid', shape: 'hatch', length: 38, height: 19, pace: 1.1, weight: 2 },
  {
    id: 'van', shape: 'van', length: 48, height: 25, pace: 0.95,
    colors: ['#dcd8cf', '#d9b13b', '#7b5a3c', '#e8e6e0'], trim: { stripe: '#4c8a54' },
    weight: 10, bands: { morning: 2.2, midday: 1.2, evening: 0.5, night: 0.1, dawn: 0.2 }, weekend: 0.4, roads: { residential: 1.2 },
  },
  // Autobús urbano azul, de piso bajo y tres puertas; un color por línea (el letrero lleva su número).
  {
    id: 'bus', shape: 'bus', length: 100, height: 32, pace: 0.8,
    colors: ['#1f5fae', '#1f5fae', '#1f5fae', '#1f5fae'], routes: ['27', '34', '58', '74'],
    weight: 4, bands: { dawn: 0.3, night: 0.6 }, weekend: 0.8, roads: { residential: 0 },
  },
  // Interurbano verde: sólo por la avenida (sale del barrio hacia la periferia), menos que el urbano.
  {
    id: 'interurban', shape: 'coach', length: 104, height: 33, pace: 0.85,
    colors: ['#2e9a48', '#2e9a48', '#2e9a48'], routes: ['521', '561', '652'],
    weight: 1.6, bands: { morning: 1.3, evening: 1.2, night: 0.5, dawn: 0.4 }, weekend: 0.7, roads: { residential: 0 },
  },
  {
    id: 'small-truck', shape: 'box-truck', length: 54, height: 26, pace: 0.9,
    colors: ['#dcd8cf', '#a8432f'], trim: { box: '#e8e4da' },
    weight: 5, bands: { morning: 1.6, evening: 0.4, night: 0.1, dawn: 0.1 }, weekend: 0.3, roads: { residential: 0.6 },
  },
  {
    id: 'delivery-truck', shape: 'box-truck', length: 66, height: 29, pace: 0.8,
    colors: ['#3a4f6e', '#dcd8cf'], trim: { box: '#d9d3c4', stripe: '#c0493f' },
    weight: 3, bands: { morning: 1.8, evening: 0.3, night: 0, dawn: 0.3 }, weekend: 0.3, roads: { residential: 0.3 },
  },
  {
    id: 'garbage', shape: 'garbage', length: 66, height: 29, pace: 0.7,
    colors: ['#e6e2d8'], trim: { stripe: '#4c8a54', box: '#e6e2d8' },
    weight: 1.5, bands: { dawn: 4, night: 3, morning: 0.5, midday: 0.2, evening: 0.2 },
  },
  {
    id: 'service', shape: 'pickup', length: 46, height: 21, pace: 0.9,
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
