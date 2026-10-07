import type { MoverType } from './vehicles.ts';

/**
 * Bicis de la calle. Van por el carril bici con la misma lógica que los coches
 * (systems/Traffic.ts): paran en la línea con el semáforo en rojo, ceden al
 * peatón y guardan la distancia. Una bici no es un peatón rápido: es un
 * vehículo corto con su carril.
 *
 * Quien la monta sale de un aspecto de persona (NpcLook) y de estas
 * probabilidades; world/CyclistArt.ts pinta cualquier aspecto sobre cualquier
 * bici, así que un personaje con nombre o el jugador podrán montar la suya.
 */

/**
 * Cuadro: urbana de paseo (cesta, guardabarros), de carretera (fina, manillar bajo), de alquiler público o
 * monopatín (de pie sobre la tabla: no es una bici, pero va por su carril con las mismas reglas) o patinete eléctrico
 * (de pie sobre una plataforma estrecha, con su columna y su manillar: tampoco es una bici, ni un monopatín, ni una moto).
 */
export type BikeFrame = 'city' | 'road' | 'rental' | 'skate' | 'scooter';

export interface BikeType extends MoverType {
  frame: BikeFrame;
  /** Probabilidad de casco y de mochila de quien la monta (0–1). */
  helmet: number;
  pack: number;
  /** Caja térmica del reparto a la espalda, en lugar de mochila. */
  cube?: string;
  /** Cesta delante del manillar. */
  basket?: boolean;
  /** Echado hacia delante (quien va con prisa) o erguido (de paseo). */
  lean: boolean;
}

export const BIKES: readonly BikeType[] = [
  {
    id: 'commuter', frame: 'road', length: 20, pace: 0.9, colors: ['#2b2d33', '#8a3f45', '#3f6f78'],
    helmet: 0.75, pack: 0.7, lean: true,
    weight: 10, bands: { morning: 2, evening: 1.8, dawn: 0.3, night: 0.5 }, weekend: 0.4,
  },
  {
    id: 'casual', frame: 'city', length: 20, pace: 0.62, colors: ['#5f7f5a', '#c9b98f', '#6c5a7a'],
    helmet: 0.15, pack: 0.2, basket: true, lean: false,
    weight: 8, bands: { midday: 1.6, dawn: 0.1, night: 0.4 }, weekend: 2,
  },
  {
    id: 'rental', frame: 'rental', length: 20, pace: 0.75, colors: ['#e6e2d8'],
    helmet: 0.1, pack: 0.3, lean: false,
    weight: 6, bands: { evening: 1.3, dawn: 0.3 },
  },
  {
    // Patinadores: de pie sobre la tabla, despacio, sobre todo por la tarde y el fin de semana. Pocos en general: en el Carmen y el parque, más (data/districts.ts).
    id: 'skater', frame: 'skate', length: 20, pace: 0.5, colors: ['#c0493f', '#3f6f78', '#d8b04a', '#2b2d33'],
    helmet: 0, pack: 0, lean: false,
    weight: 1.5, bands: { midday: 1.4, evening: 2.2, dawn: 0.05, night: 0.5, morning: 0.3 }, weekend: 2.5,
  },
  {
    // Patinete eléctrico: de pie, estrecho (14 px de largo, menos que una bici), a paso ligero. Ocasional y sólo donde el barrio
    // lo permite (DistrictIdentity.scooters: Vallesco no, la Ribera sí); sin eso, nunca.
    id: 'scooter', frame: 'scooter', length: 14, pace: 0.8, colors: ['#2b2d33', '#9aa0a6', '#e6e2d8', '#3f6f78', '#c0493f'],
    helmet: 0.35, pack: 0.25, lean: false, gated: true,
    weight: 2.6, bands: { evening: 1.8, midday: 1.2, morning: 0.4, dawn: 0.05, night: 0.8 }, weekend: 1.8,
  },
  {
    id: 'courier', frame: 'road', length: 20, pace: 0.95, colors: ['#2b2d33', '#4c4f57'],
    helmet: 0.8, pack: 0, cube: '#e2b93b', lean: true,
    weight: 4, bands: { midday: 1.8, evening: 2, morning: 0.4, dawn: 0.2, night: 1.2 },
  },
];
