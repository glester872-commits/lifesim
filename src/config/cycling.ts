// Números de la bici del jugador (systems/Cycling, BIKE-01). Velocidades en px/s, aceleraciones en px/s², tiempos en ms
// de reloj real y energía en los puntos de la necesidad (0-100).
import { PLAYER_SPEED } from './constants.ts';

export const CYCLING = {
  /** Velocidad máxima en la calzada: 2,5 veces la del jugador a pie. */
  MAX_SPEED: 2.5 * PLAYER_SPEED,
  /** Aceleración lineal al pedalear. De 0 al máximo en MAX_SPEED / ACCEL segundos. */
  ACCEL: 160,
  /** Deceleración del freno, y la que baja hacia el máximo efectivo cuando se va por encima. */
  BRAKE: 380,
  /** Deceleración del freno de emergencia (al intentar bajarse demasiado rápido). */
  EMERGENCY_BRAKE: 900,
  /** Rozamiento sin pedalear: speed × exp(−DRAG × dt en segundos). */
  DRAG: 1.2,
  /** Fracción de velocidad que se conserva al girar 90°. */
  TURN_KEEP_90: 0.8,
  /** Fracción de velocidad que se conserva al girar 180° (dar media vuelta). */
  TURN_KEEP_180: 0.4,
  /** Lo que se tarda en subirse a la bici. */
  MOUNT_MS: 300,
  /** Lo que se tarda en bajarse. */
  DISMOUNT_MS: 250,
  /** Velocidad máxima (px/s) a la que se permite bajarse; por encima, freno de emergencia. */
  DISMOUNT_MAX: 30,
  /** Energía gastada por casilla recorrida. */
  ENERGY_PER_TILE: 0.02,
  /** Por debajo de esta energía no se acelera. */
  MIN_ENERGY: 3,
  /** Tope del paso de tiempo de un tick: un frame largo (pestaña en segundo plano) no hace saltar la bici. */
  MAX_DT_MS: 50,
  /** Multiplica la velocidad máxima fuera de la calzada (acera, plaza, parque). */
  PEDESTRIAN_FACTOR: 0.5,
  /** Multiplica el coste de energía cuando speed > 0,8 × MAX_SPEED. */
  HIGH_SPEED_ENERGY_MULT: 1.5,
  /** Con energía por debajo de esto, la velocidad máxima se multiplica por LOW_ENERGY_FACTOR. */
  LOW_ENERGY_AT: 15,
  /** Factor de la velocidad máxima con poca energía. */
  LOW_ENERGY_FACTOR: 0.6,
} as const;

/** km/h que se enseñan por cada px/s: calibrado para que MAX_SPEED se lea como 20 km/h (el reloj del HUD, BIKE-01). */
export const KMH_PER_PXS = 20 / CYCLING.MAX_SPEED;
