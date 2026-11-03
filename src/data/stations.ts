import type { PropKind } from '../types/game.ts';
import type { Discipline } from './academies.ts';

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
export type Motion = 'tkd-front' | 'tkd-round' | 'tkd-side' | 'tkd-form' | 'mma-ground' | 'dance-step' | 'dance-arms' | 'treadmill' | 'bike' | 'row' | 'bench' | 'squat' | 'curl' | 'cable' | 'stretch' | 'sip' | 'hang' | 'shoot' | 'play' | 'step' | 'boxing-guard' | 'boxing-footwork' | 'boxing-punch' | 'boxing-coordinate' | 'boxing-rope';

export interface StationDef {
  name: string;
  /** Clase de una academia (data/academies.ts: horario, precio, bono, técnica). Sin ello, entrenamiento libre. */
  training?: { academy: Discipline };
  /**
   * Se practica a mano y no pasa sola: 'kicks' es la clase de patadas de taekwondo (systems/Taekwondo), con el pao que
   * tiene delante a dos tiles. El reloj y el cobro son los de cualquier clase; lo que se gana sale de lo bien hecho.
   */
  drill?: 'kicks' | 'punches' | 'steps';
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

const BOXING_SESSION = { academy: 'boxing' } as const;
const STRENGTH = { work: [4_500, 7_500], rest: [3_000, 6_000] } as const;

export const STATIONS = {
  'boxing-guard': { name: 'Guardia y defensa', motion: 'boxing-guard', minutes: [10, 16], settle: 'idle', training: BOXING_SESSION },
  'boxing-footwork': { name: 'Juego de pies', motion: 'boxing-footwork', minutes: [10, 16], settle: 'idle', training: BOXING_SESSION },
  // El saco se trabaja a mano (systems/Taekwondo, juego 'punches'): jab con la izquierda, directo con la derecha,
  // combinaciones y guardia, cada uno en su instante y a su distancia.
  'boxing-bag': { name: 'Técnica de saco', motion: 'boxing-punch', minutes: [10, 18], settle: 'idle', training: BOXING_SESSION, drill: 'punches' },
  'boxing-coordination': { name: 'Coordinación y combinaciones', motion: 'boxing-coordinate', minutes: [8, 14], settle: 'idle', training: BOXING_SESSION },
  'boxing-resistance': { name: 'Resistencia con comba', motion: 'boxing-rope', minutes: [10, 16], settle: 'idle', training: BOXING_SESSION },
  // Academias (data/academyRooms.ts). MMA: saco y pies con guantes (las poses del boxeo), y el suelo del tatami.
  'mma-bag': { name: 'Saco: manos y rodillas', motion: 'boxing-punch', minutes: [10, 18], settle: 'idle', training: { academy: 'mma' } },
  'mma-ground': { name: 'Derribos y suelo', motion: 'mma-ground', minutes: [10, 16], settle: 'idle', training: { academy: 'mma' } },
  'mma-footwork': { name: 'Desplazamientos', motion: 'boxing-footwork', minutes: [8, 14], settle: 'idle', training: { academy: 'mma' } },
  'mma-conditioning': { name: 'Acondicionamiento: comba y pesa rusa', motion: 'boxing-rope', minutes: [8, 14], settle: 'idle', training: { academy: 'mma' } },
  // Taekwondo (Escuela de Taekwondo Vallesco): tres líneas de paos, una por patada para quien practica solo (la gente
  // las alterna con su movimiento); el jugador, en cualquiera, hace la clase de patadas entera (drill). La demostración
  // es del ayudante: no se entrena en ella.
  'tkd-kicks-front': { name: 'Paos · frontal', motion: 'tkd-front', minutes: [10, 16], settle: 'idle', training: { academy: 'taekwondo' }, drill: 'kicks' },
  'tkd-kicks-round': { name: 'Paos · circular', motion: 'tkd-round', minutes: [10, 16], settle: 'idle', training: { academy: 'taekwondo' }, drill: 'kicks' },
  'tkd-kicks-side': { name: 'Paos · lateral', motion: 'tkd-side', minutes: [10, 16], settle: 'idle', training: { academy: 'taekwondo' }, drill: 'kicks' },
  'tkd-demo': { name: 'Demostración', motion: 'tkd-side', minutes: [20, 40], settle: 'idle' },
  'tkd-forms': { name: 'Formas (poomsae)', motion: 'tkd-form', minutes: [10, 16], settle: 'idle', training: { academy: 'taekwondo' } },
  'tkd-stretch': { name: 'Flexibilidad', motion: 'stretch', minutes: [6, 12], settle: 'idle', training: { academy: 'taekwondo' } },
  // Baile: pasos, coreografía con los brazos y estiramientos.
  'dance-steps': { name: 'Pasos básicos', motion: 'dance-step', minutes: [10, 16], settle: 'idle', training: { academy: 'dance' }, drill: 'steps' },
  'dance-choreo': { name: 'Coreografía', motion: 'dance-arms', minutes: [10, 18], settle: 'idle', training: { academy: 'dance' }, drill: 'steps' },
  'dance-stretch': { name: 'Estiramientos', motion: 'stretch', minutes: [6, 12], settle: 'idle', training: { academy: 'dance' } },
  treadmill: { name: 'Cinta de correr', motion: 'treadmill', minutes: [14, 32], mount: 'treadmill', settle: 'idle' },
  bike: { name: 'Bici estática', motion: 'bike', minutes: [12, 26], mount: 'exercise-bike', settle: 'sit' },
  rower: { name: 'Remo', motion: 'row', minutes: [8, 16], mount: 'rower', settle: 'sit' },
  'bench-press': { name: 'Press de banca', motion: 'bench', minutes: [8, 16], mount: 'bench-press', settle: 'sit', sets: STRENGTH },
  'squat-rack': { name: 'Jaula de sentadillas', motion: 'squat', minutes: [8, 14], mount: 'squat-rack', settle: 'idle', sets: STRENGTH },
  dumbbells: { name: 'Mancuernas', motion: 'curl', minutes: [6, 12], settle: 'idle', sets: STRENGTH },
  cable: { name: 'Polea', motion: 'cable', minutes: [6, 12], settle: 'idle', sets: STRENGTH },
  stretch: { name: 'Estiramientos', motion: 'stretch', minutes: [5, 12], settle: 'idle' },
  water: { name: 'Fuente de agua', motion: 'sip', minutes: [1, 2], settle: 'idle' },
  // Al aire libre (data/ribera.ts): dominadas en las barras y tiros en la pista; el mismo movimiento lo ve el jugador y la gente.
  pullup: { name: 'Barras de dominadas', motion: 'hang', minutes: [6, 14], settle: 'idle', sets: STRENGTH },
  hoops: { name: 'Canasta', motion: 'shoot', minutes: [12, 28], settle: 'idle' },
  // Salón recreativo: de pie delante de la máquina, pulsando botones; la de ritmo, con los pies.
  arcade: { name: 'Recreativa', motion: 'play', minutes: [8, 20], settle: 'idle' },
  rhythm: { name: 'Máquina de ritmo', motion: 'step', minutes: [6, 12], mount: 'arcade-rhythm', settle: 'idle' },
} as const satisfies Record<string, StationDef>;

export type StationId = keyof typeof STATIONS;

export function getStation(id: string): StationDef | undefined {
  return (STATIONS as Record<string, StationDef>)[id];
}

/** Quién tiene un puesto: libre, alguien va de camino o alguien lo está usando. */
export type Occupancy = 'FREE' | 'RESERVED' | 'IN_USE';
