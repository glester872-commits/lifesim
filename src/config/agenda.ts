// Números de la estimación de viaje de la agenda (systems/Agenda, LV-04). Cada margen es incertidumbre en minutos de
// reloj: se suma aparte (marginMin) y no cambia el total. Calibrados con las medidas de las Fases 2 y 3 (AGENDA-ESTIMACIONES-LV04.md).
import { GAME_MINUTES_PER_REAL_SECOND, PLAYER_SPEED, TILE } from './constants.ts';
import { METRO_CONFIG } from './metro.ts';

export const AGENDA = {
  /** Minutos de reloj por casilla recta a pie (TILE / PLAYER_SPEED). Medido en la Fase 2: 0,41 por casilla de tilePath. */
  WALK_PER_TILE: (TILE / PLAYER_SPEED) * GAME_MINUTES_PER_REAL_SECOND,
  /** Sólo si tilePath no encuentra camino: Manhattan × este rodeo (supuesto, no medido). */
  WALK_MANHATTAN_DETOUR: 1.3,
  /** Margen a pie por el camino real: ±max(WALK_MARGIN_MIN, ceil(WALK_MARGIN_PCT × minutos)). */
  WALK_MARGIN_PCT: 0.15,
  WALK_MARGIN_MIN: 1,
  /** Margen a pie por Manhattan (sin camino): ±max(WALK_MANHATTAN_MARGIN_MIN, ceil(WALK_MANHATTAN_MARGIN_PCT × minutos)). */
  WALK_MANHATTAN_MARGIN_PCT: 0.3,
  WALK_MANHATTAN_MARGIN_MIN: 2,
  /**
   * Espera del tren, valor central: medio intervalo entre trenes (METRO_CONFIG.trainArrivalInterval), lo que se espera
   * de media si se llega al andén a una hora cualquiera. Medido (LV-04, Fase 3): 2-30 min, unos 15-20 de media en los
   * viajes de calle a calle. Con la primera llegada (firstArrivalDelay, 8 min) los viajes en metro salían 9-12 min cortos.
   */
  METRO_WAIT: Math.round((METRO_CONFIG.trainArrivalInterval / 1000) * GAME_MINUTES_PER_REAL_SECOND / 2),
  /** Margen de la espera en valle y en punta (franja 'rush' de HOUR_BANDS): de un tren en el andén a uno que se va. */
  WAIT_MARGIN_OFF_PEAK: 10,
  WAIT_MARGIN_PEAK: 12,
  /** Puerta de estación ↔ andén, en cada extremo del viaje. Sin margen propio. */
  STATION_WALK: 5,
  /** Transbordo (pasillo de TRANSFERS). El trayecto en metro (15 min por parada) no lleva margen. */
  TRANSFER_MARGIN: 2,
  /** Ventana de 'tight' cuando el tramo no trae margen propio (travelHint sin marginMin). */
  TIGHT_WINDOW: 20,
  /** Niveles de incertidumbre: baja hasta LOW_MAX, media hasta MEDIUM_MAX, alta por encima. */
  LOW_MAX: 2,
  MEDIUM_MAX: 5,
  /** Tope de la caché de longitudes de camino (systems/Agenda). */
  PATH_CACHE_MAX: 256,
} as const;
