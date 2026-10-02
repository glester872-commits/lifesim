/**
 * Ritmo de las estaciones de metro. Todos los tiempos en milisegundos reales;
 * velocidades en px/s. Sin imports de valor: los scripts de node lo cargan tal cual.
 *
 * Ojo: el reloj del juego corre a 2 min por segundo real, así que un intervalo
 * de 20 s son 40 minutos de juego. Es ritmo de gameplay, no de horario real.
 */
export const METRO_CONFIG = {
  /** Panel de depuración de la estación. Apagado en producción. */
  debug: import.meta.env?.DEV ?? false,

  /** Intervalo base con la vía vacía; lo modulan el día y la hora (ver trainIntervalClamp). */
  trainArrivalInterval: 20_000,
  /** Primera llegada al entrar en la estación: nadie quiere esperar un ciclo entero. */
  firstArrivalDelay: 4_000,
  /** Puertas abiertas del todo: el hueco para subir y bajar. */
  trainStopDuration: 6_000,
  /** Pausa entre que el tren se detiene y empiezan a abrirse las puertas. */
  doorOpenDelay: 600,
  doorOpeningDuration: 700,
  /** Aviso de cierre (luces parpadeando) antes de que las puertas se muevan. */
  doorCloseWarning: 1_400,
  doorClosingDuration: 800,

  trainCruiseSpeed: 170,
  trainBraking: 95,
  trainAcceleration: 70,
  /** Ningún intervalo, retraso incluido, sale de aquí: el ritmo de juego manda. */
  trainIntervalClamp: [14_000, 34_000] as const,
  /** Retrasos: casi siempre pequeños; los moderados son la excepción. */
  trainDelay: { small: [3_000, 7_000], moderate: [8_000, 13_000], moderateShare: 0.15 } as const,

  /** Límites de pasajeros activos (entran y esperan). Los que bajan del tren van aparte: salen enseguida. */
  minPassengers: 1,
  maxPassengers: 11,
  /** Walkers creados una vez por visita; se reciclan. Cubre máximo + los que bajan. */
  passengerPool: 15,
  /** Trenes que deja pasar un pasajero que no sube antes de irse del andén. */
  patienceTrains: [1, 3] as const,

  /** Tope de vigilantes a la vez (lo reparte MetroDailyState). */
  securityCount: 2,
  guardIdle: [3_000, 6_000] as const,
  guardObserve: [1_200, 2_600] as const,

  npcWalkingSpeed: 34,
  /** Retraso base; cada arquetipo lo multiplica y cada NPC añade su ±30 %. */
  npcReactionDelay: 700,
  /** Cada cuánto un pasajero que espera se plantea hacer algo. */
  ambientEvery: [3_500, 8_000] as const,
};

export type MetroConfig = typeof METRO_CONFIG;

// ------------------------------------------------------------ afluencia

export const CROWD_LEVELS = ['VERY_LOW', 'LOW', 'NORMAL', 'HIGH', 'RUSH_HOUR'] as const;

/**
 * Por nivel: pasajeros activos a la vez, ritmo de llegadas, parte que ya espera
 * al entrar, bajadas por tren, probabilidad de subir, frecuencia de trenes
 * (multiplica el intervalo: < 1 pasan más trenes) y cuánto pasa (eventScale:
 * con la estación vacía casi nunca ocurre nada).
 */
export const CROWD_PROFILES = {
  VERY_LOW: { active: [1, 3], respawn: [9_000, 16_000], waitingShare: 0.5, alighting: [0, 1], boardChance: 0.5, trainFrequency: 1.3, eventScale: 0.35 },
  LOW: { active: [2, 4], respawn: [6_000, 11_000], waitingShare: 0.55, alighting: [0, 2], boardChance: 0.6, trainFrequency: 1.15, eventScale: 0.65 },
  NORMAL: { active: [4, 6], respawn: [3_500, 8_000], waitingShare: 0.6, alighting: [1, 3], boardChance: 0.65, trainFrequency: 1, eventScale: 1 },
  HIGH: { active: [6, 8], respawn: [2_000, 5_000], waitingShare: 0.7, alighting: [2, 4], boardChance: 0.75, trainFrequency: 0.9, eventScale: 1.2 },
  RUSH_HOUR: { active: [8, 11], respawn: [800, 2_800], waitingShare: 0.8, alighting: [3, 5], boardChance: 0.85, trainFrequency: 0.8, eventScale: 1.4 },
} as const;

/**
 * Franjas horarias. `offset` desplaza el nivel base del día (NORMAL ± lo que
 * toque); `weekend` sustituye al offset sábados y domingos. Cada día mueve las
 * fronteras hasta ±bandShiftMin minutos, así la hora punta no empieza al segundo.
 * `tag` sirve para variar la composición de pasajeros.
 */
export const HOUR_BANDS = [
  { from: 0, offset: -2, weekend: -2, tag: 'night' },
  { from: 6 * 60, offset: -1, weekend: -2, tag: 'ramp' },
  { from: 7 * 60, offset: 0, weekend: -1, tag: 'ramp' },
  { from: 8 * 60, offset: 2, weekend: 0, tag: 'rush' },
  { from: 10 * 60, offset: 0, weekend: 0, tag: 'midday' },
  { from: 13 * 60, offset: 1, weekend: 1, tag: 'lunch' },
  { from: 15 * 60, offset: 0, weekend: 0, tag: 'midday' },
  { from: 18 * 60, offset: 2, weekend: 1, tag: 'rush' },
  { from: 20 * 60 + 30, offset: -1, weekend: 0, tag: 'evening' },
  { from: 23 * 60, offset: -2, weekend: -1, tag: 'night' },
] as const;

// ----------------------------------------------------------- arquetipos

/**
 * Pequeños parámetros por arquetipo. walkingSpeed y reactionDelay multiplican
 * los valores base; el resto son probabilidades o prioridades de 0 a 1.
 * waitingPositionPreference: front (junto al borde), back, seat, sign, any.
 */
export const ARCHETYPES = {
  COMMUTER: { weight: 30, walkingSpeed: 1.1, waitingPositionPreference: 'front', phoneUsageProbability: 0.45, runningProbability: 0.35, trainBoardingPriority: 0.8, reactionDelay: 0.8, signInterest: 0.02, seatInterest: 0.1, talkInterest: 0.08 },
  STUDENT: { weight: 14, walkingSpeed: 1.05, waitingPositionPreference: 'any', phoneUsageProbability: 0.7, runningProbability: 0.3, trainBoardingPriority: 0.6, reactionDelay: 1, signInterest: 0.03, seatInterest: 0.15, talkInterest: 0.35 },
  TOURIST: { weight: 8, walkingSpeed: 0.8, waitingPositionPreference: 'sign', phoneUsageProbability: 0.3, runningProbability: 0.05, trainBoardingPriority: 0.3, reactionDelay: 1.4, signInterest: 0.5, seatInterest: 0.15, talkInterest: 0.25 },
  DISTRACTED: { weight: 14, walkingSpeed: 0.9, waitingPositionPreference: 'any', phoneUsageProbability: 0.85, runningProbability: 0.1, trainBoardingPriority: 0.4, reactionDelay: 2.3, signInterest: 0.02, seatInterest: 0.2, talkInterest: 0.05 },
  RUSHED: { weight: 10, walkingSpeed: 1.3, waitingPositionPreference: 'front', phoneUsageProbability: 0.2, runningProbability: 0.85, trainBoardingPriority: 1, reactionDelay: 0.55, signInterest: 0.01, seatInterest: 0, talkInterest: 0.02 },
  CALM: { weight: 16, walkingSpeed: 1, waitingPositionPreference: 'any', phoneUsageProbability: 0.3, runningProbability: 0.08, trainBoardingPriority: 0.5, reactionDelay: 1, signInterest: 0.06, seatInterest: 0.3, talkInterest: 0.2 },
  ELDERLY: { weight: 8, walkingSpeed: 0.65, waitingPositionPreference: 'seat', phoneUsageProbability: 0.05, runningProbability: 0, trainBoardingPriority: 0.2, reactionDelay: 1.6, signInterest: 0.1, seatInterest: 0.85, talkInterest: 0.3 },
} as const;

/** Multiplicadores del peso de cada arquetipo según la franja y el día. */
export const ARCHETYPE_BOOST = {
  byTag: {
    night: { DISTRACTED: 1.5, CALM: 1.3, ELDERLY: 0.3, COMMUTER: 0.6 },
    ramp: { COMMUTER: 1.5, TOURIST: 0.4 },
    rush: { COMMUTER: 2, RUSHED: 1.8, TOURIST: 0.5, ELDERLY: 0.4 },
    midday: { ELDERLY: 1.6, TOURIST: 1.5, COMMUTER: 0.7 },
    lunch: { STUDENT: 2.2, COMMUTER: 0.8 },
    evening: { STUDENT: 1.3, CALM: 1.3, COMMUTER: 0.8 },
  },
  weekend: { COMMUTER: 0.4, TOURIST: 2, CALM: 1.5, STUDENT: 0.8 },
  theme: {
    HABITUAL: {},
    ESTUDIANTES: { STUDENT: 2.5 },
    TURISTAS: { TOURIST: 3, CALM: 1.3 },
    MAYORES: { ELDERLY: 2.5, CALM: 1.5 },
    PRISAS: { RUSHED: 2.2, DISTRACTED: 1.4 },
  },
} as const;

// ------------------------------------------------------------ día a día

/** Tablas ponderadas del estado diario: [valor, peso]. Lo normal pesa más. */
export const DAILY_WEIGHTS = {
  crowdShift: [[-1, 20], [0, 60], [1, 20]],
  trainFrequency: [[0.9, 25], [1, 55], [1.12, 20]],
  trainDelayProbability: [[0.04, 55], [0.12, 33], [0.25, 12]],
  securityPresence: [[0, 22], [1, 60], [2, 18]],
  securityPatrols: [[true, 70], [false, 30]],
  specialEventProbability: [[0.6, 30], [1, 55], [1.8, 15]],
  stationMood: [['CALM', 30], ['ORDINARY', 50], ['HECTIC', 20]],
  compositionTheme: [['HABITUAL', 55], ['ESTUDIANTES', 14], ['TURISTAS', 12], ['MAYORES', 9], ['PRISAS', 10]],
  bandShiftMin: 20,
} as const;

// ------------------------------------------------------ eventos de viaje

/**
 * Límites globales de los eventos de viaje (data/metroEvents.ts). Cada evento
 * tiene su probabilidad y su cooldown; esto evita que se encadenen entre sí.
 */
export const METRO_EVENT_RULES = {
  /** Tras cualquier evento, este número de viajes seguidos sin nada. */
  quietRides: 1,
  /** Horas de juego entre dos eventos que no sean ambientales. */
  narrativeGapHours: 20,
  /** Días que una continuación programada sigue esperando su hueco. */
  followUpWindowDays: 21,
} as const;

// ---------------------------------------------------------- microeventos

/**
 * Microeventos: casi siempre no pasa nada. Los inusuales y excepcionales se
 * multiplican por specialEventProbability del día. Tras uno, la estación queda
 * en calma un rato: los momentos tranquilos son parte del ritmo.
 */
export const MICRO_EVENTS = {
  tickEvery: [12_000, 20_000],
  quietAfter: { MINOR: 25_000, UNUSUAL: 60_000, EXCEPTIONAL: 120_000 },
  /** Cada cierto tiempo, con el andén en su rutina. */
  tick: [
    { event: 'NONE', tier: 'NORMAL', weight: 70 },
    { event: 'ANNOUNCEMENT', tier: 'MINOR', weight: 11 },
    { event: 'ZONE_CHANGE', tier: 'MINOR', weight: 12 },
    { event: 'GUARD_SWEEP', tier: 'UNUSUAL', weight: 6 },
    { event: 'PICKPOCKET', tier: 'UNUSUAL', weight: 3 },
  ],
  /** Cuando se abren las puertas. */
  arrival: [
    { event: 'NONE', tier: 'NORMAL', weight: 72 },
    { event: 'LATE_RUNNER', tier: 'MINOR', weight: 20 },
    { event: 'CROWD_SURGE', tier: 'EXCEPTIONAL', weight: 2 },
  ],
} as const;
