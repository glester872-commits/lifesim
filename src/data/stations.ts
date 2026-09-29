import type { PropKind } from '../types/game.ts';

/**
 * Puestos de uso: lo que se hace en un punto que no es sólo estar. Una cinta,
 * una bici, un banco de press, una esterilla, la fuente de agua. Un punto de
 * un interior dice qué puesto es con `use` (data/interiors.ts); el perfil de
 * población (data/population.ts) sólo dice a qué tipo de puntos va cada uno.
 *
 * Aquí está todo lo que el puesto impone a quien lo usa, igual en cualquier
 * local: cuánto se queda, qué se le ve hacer, si se sube a la máquina y si
 * trabaja por series. Un puesto nuevo (una mesa de billar, una barra de bar,
 * un columpio) es una entrada más y, si su movimiento no existe, una pose en
 * world/HumanArt.ts.
 *
 * Un punto es un puesto: lo ocupa una persona. Lo que admite a varias (la zona
 * de estiramientos) lleva varios puntos, uno por hueco.
 */

/** Lo que se le ve hacer mientras lo usa (entities/Character.ts lo anima). */
export type Motion = 'treadmill' | 'bike' | 'row' | 'bench' | 'squat' | 'curl' | 'cable' | 'stretch' | 'sip';

export interface StationDef {
  name: string;
  motion: Motion;
  /** Minutos de juego que se queda [mín, máx]; mandan sobre los del paso del plan. */
  minutes: readonly [number, number];
  /**
   * Máquina a la que se sube: el punto está sobre su tile. La máquina es sólida
   * para el jugador y para quien pasa; sólo quien va a usarla se sube.
   */
  mount?: PropKind;
  /** Cómo está al llegar, entre series y antes de irse: de pie o sentado en la máquina. */
  settle: 'idle' | 'sit';
  /** Por series: ms reales de trabajo y de descanso. Sin ellas, sin pausa (el cardio). */
  sets?: { work: readonly [number, number]; rest: readonly [number, number] };
}

const STRENGTH = { work: [4_500, 7_500], rest: [3_000, 6_000] } as const;

export const STATIONS = {
  treadmill: { name: 'Cinta de correr', motion: 'treadmill', minutes: [14, 32], mount: 'treadmill', settle: 'idle' },
  bike: { name: 'Bici estática', motion: 'bike', minutes: [12, 26], mount: 'exercise-bike', settle: 'sit' },
  rower: { name: 'Remo', motion: 'row', minutes: [8, 16], mount: 'rower', settle: 'sit' },
  'bench-press': { name: 'Press de banca', motion: 'bench', minutes: [8, 16], mount: 'bench-press', settle: 'sit', sets: STRENGTH },
  'squat-rack': { name: 'Jaula de sentadillas', motion: 'squat', minutes: [8, 14], mount: 'squat-rack', settle: 'idle', sets: STRENGTH },
  dumbbells: { name: 'Mancuernas', motion: 'curl', minutes: [6, 12], settle: 'idle', sets: STRENGTH },
  cable: { name: 'Polea', motion: 'cable', minutes: [6, 12], settle: 'idle', sets: STRENGTH },
  stretch: { name: 'Estiramientos', motion: 'stretch', minutes: [5, 12], settle: 'idle' },
  water: { name: 'Fuente de agua', motion: 'sip', minutes: [1, 2], settle: 'idle' },
} as const satisfies Record<string, StationDef>;

export type StationId = keyof typeof STATIONS;

export function getStation(id: string): StationDef | undefined {
  return (STATIONS as Record<string, StationDef>)[id];
}

/** Quién tiene un puesto: libre, alguien va de camino o alguien lo está usando. */
export type Occupancy = 'FREE' | 'RESERVED' | 'IN_USE';
