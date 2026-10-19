import type { QualityLevel } from '../config/quality.ts';

/**
 * La grada en día de partido (systems/StandLife, world/StandView, world/CrowdView): cuánto dura cada reacción, los
 * cánticos y lo que se permite pintar. Todo en minutos de reloj del mundo desde el saque, como systems/MatchPlay:
 * a la velocidad normal (2 minutos por segundo) un minuto de juego es medio segundo real.
 *
 * La gente de la grada sigue siendo la del local (data/stadium.ts STADIUM_PROFILE, systems/Crowd): ambiente y de
 * paso, nadie con nombre. Lo que hay detrás de los muros (los fondos y el resto de la tribuna) es decoración
 * horneada: unos pocos bloques con cuatro dibujos cada uno, no gente.
 */

/** Cuánto dura cada reacción tras lo decisivo (minutos de juego): el gol, fuerte y luego a menos; una ocasión, un «uy». */
export const REACTION = {
  goal: 10,
  miss: 3,
  /** Tras el pitido final, la respuesta al resultado; luego la gente se va (la salida de siempre). */
  final: 12,
  /** Lo que tarda cada cual en reaccionar como mucho (cada uno el suyo, por semilla). */
  lag: 1.2,
} as const;

/** Un cántico: cada cuánto [mín, máx] entre uno y otro con el balón en juego y cuánto dura. */
export const CHANT = { every: [9, 15] as const, length: 7 };

/** Lo que se canta, inventado: la grada de casa y, si los hay, los que vienen con el rival (`{rival}`). */
export const CHANTS_HOME: readonly string[] = [
  '¡Hal-co-nes, Hal-co-nes!',
  '¡Vamos, Halcones, vamos!',
  '¡Turquesa y naranja, turquesa y naranja!',
  '¡Esta grada no se calla!',
  '¡Arriba ese Halcón!',
];
export const CHANTS_GOAL: readonly string[] = ['¡Gooool, gol, gol!', '¡Así, así, así gana el Halcón!'];
export const CHANTS_AWAY: readonly string[] = ['¡Vamos, {rival}!', '¡Aquí está la gente del {rival}!'];

/** Parte de la afición con camiseta que viene con el rival (los demás, del Halcón). */
export const AWAY_SHARE = 0.12;

/**
 * En el descanso, cuántos bajan de su asiento (`from`) al vestíbulo [mín, máx], cuánto se quedan allí y cuánto ven
 * luego de la segunda parte (minutos de juego; al pitido final se van con todos). Sólo si se ve empezar el descanso
 * (`window` minutos): quien llega a mitad lo encuentra como está.
 */
export const HALFTIME_ERRAND = {
  count: [2, 4] as const,
  // Corto: bajar y subir andando ya se come casi todo el descanso (15 minutos de juego son 7,5 s reales).
  minutes: [3, 6] as const,
  points: ['ESTADIO_CONCOURSE_'],
  from: 'ESTADIO_SEAT_',
  back: [55, 70] as const,
  window: 5,
};

/**
 * Al pitido final, la mayoría (`share` de los sentados en `from`) se levanta en oleada, cada grupo a su ritmo dentro
 * de `stagger` ms reales (2 minutos de juego por segundo: entre los 4 y los 24 minutos tras el final, mientras se
 * aplaude o se protesta) y baja a la puerta. El resto se queda un rato y sale por su plan antes del cierre. Una vez por
 * partido, se vea o no el pitido.
 */
export const FULLTIME_EXIT = {
  share: 0.7,
  from: 'ESTADIO_SEAT_',
  stagger: [2_000, 12_000] as const,
};

/**
 * Lo que puede pintar la grada según la calidad (config/quality.ts): banderas sueltas sobre los fondos y cada cuánto
 * cambia de dibujo un bloque de decoración en calma. La gente de verdad (los agentes) la limita el propio local
 * (STADIUM_PROFILE.maxVisitors, 20 como mucho por los niveles de config/population.ts), dentro de config/budgets.ts.
 */
export const STAND_BUDGET: Readonly<Record<QualityLevel, { flags: number; swayMs: number }>> = {
  high: { flags: 6, swayMs: 900 },
  medium: { flags: 4, swayMs: 1_200 },
  low: { flags: 2, swayMs: 1_800 },
};

/** Columnas de decoración a cada lado del recinto (tiles): lo que asoma por los lados de la cámara. */
export const SIDE_TILES = 6;
