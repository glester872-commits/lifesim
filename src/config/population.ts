/**
 * Ritmo de la gente dentro de los locales. Los perfiles de cada sitio están en
 * data/population.ts; aquí sólo lo que es común a todos. Sin imports de valor:
 * scripts/simulate-population.ts lo carga tal cual.
 */
export const POPULATION = {
  /** DEBUG_LOCATIONS: panel con hora, apertura, objetivo y ocupación. Sólo en desarrollo. */
  debug: import.meta.env?.DEV ?? false,

  /**
   * Visitantes a la vez por nivel. Cada local además tiene su tope
   * (maxVisitors) y su aforo: un café pequeño no se llena con 20 personas.
   */
  levels: {
    VERY_LOW: [0, 2],
    LOW: [2, 4],
    MEDIUM: [4, 8],
    HIGH: [8, 14],
    VERY_HIGH: [14, 20],
  },

  /** Cada cuánto (ms reales) el local decide si entra o sale alguien. Aleatorio en el rango. */
  tickEvery: [2_500, 5_000] as const,
  /** Si la diferencia con el objetivo es grande, se mueve más de una persona por decisión. */
  maxChangesPerTick: 2,
  /** Tiles por segundo; cada NPC tiene la suya. El jugador va a 4,75. */
  walkSpeed: [1.7, 2.6] as const,
  /** Pausa antes de empezar a moverse hacia el siguiente sitio, en ms reales. */
  reaction: [250, 1_400] as const,
  /** Distancia (tiles) de la puerta a la que el jugador bloquea las entradas. */
  doorClearance: 1.5,
  /** Distancia mínima (tiles) entre el jugador y un NPC que aparece al cargar. */
  spawnClearance: 2,
} as const;

export type Level = keyof typeof POPULATION.levels;
export const LEVELS = Object.keys(POPULATION.levels) as Level[];
