// Imports con extensión .ts a propósito: este módulo no toca Phaser y los
// scripts de node (npm run simulate) lo cargan tal cual.
import {
  ARCHETYPE_BOOST,
  ARCHETYPES,
  CROWD_LEVELS,
  CROWD_PROFILES,
  DAILY_WEIGHTS,
  HOUR_BANDS,
  METRO_CONFIG,
  MICRO_EVENTS,
} from '../config/metro.ts';

export type CrowdLevel = (typeof CROWD_LEVELS)[number];
export type CrowdProfile = (typeof CROWD_PROFILES)[CrowdLevel];
export type Archetype = keyof typeof ARCHETYPES;
export type ArchetypeParams = (typeof ARCHETYPES)[Archetype];
export type StationMood = (typeof DAILY_WEIGHTS.stationMood)[number][0];
export type CompositionTheme = (typeof DAILY_WEIGHTS.compositionTheme)[number][0];
export type HourTag = (typeof HOUR_BANDS)[number]['tag'];

type EventRow =
  | (typeof MICRO_EVENTS.tick)[number]
  | (typeof MICRO_EVENTS.arrival)[number];

export type MicroEvent = Exclude<EventRow['event'], 'NONE'>;

export type Rng = () => number;

// ---------------------------------------------------------------- azar

/** mulberry32: rápido, 32 bits, suficiente para decidir el humor de una estación. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;

    let t = a;

    t = Math.imul(
      t ^ (t >>> 15),
      t | 1,
    );

    t ^=
      t +
      Math.imul(
        t ^ (t >>> 7),
        t | 61,
      );

    return (
      ((t ^ (t >>> 14)) >>> 0) /
      4294967296
    );
  };
}

/** Semilla estable a partir de cualquier combinación de partes (FNV-1a). */
export function hashSeed(
  ...parts: (string | number)[]
): number {
  let h = 0x811c9dc5;

  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(
      h,
      0x01000193,
    );
  }

  return h >>> 0;
}

/** Elección ponderada sobre pares [valor, peso]. */
export function weighted<T>(
  rng: Rng,
  table: readonly (
    readonly [T, number]
  )[],
): T {
  const total = table.reduce(
    (sum, [, w]) => sum + w,
    0,
  );

  let roll = rng() * total;

  for (const [value, w] of table) {
    roll -= w;

    if (roll < 0) {
      return value;
    }
  }

  return table[
    table.length - 1
  ][0];
}

export const between = (
  rng: Rng,
  min: number,
  max: number,
): number =>
  min +
  rng() * (max - min);

export const intBetween = (
  rng: Rng,
  min: number,
  max: number,
): number =>
  Math.min(
    max,
    Math.floor(
      between(
        rng,
        min,
        max + 1,
      ),
    ),
  );

// ---------------------------------------------------------- estado diario

export interface MetroDailyState {
  day: number;
  weekend: boolean;

  /** Nivel base del día en horas normales; la franja horaria lo sube o baja. */
  crowdLevel: CrowdLevel;

  crowdShift: number;

  /** Multiplica el intervalo entre trenes: < 1 pasan más. */
  trainFrequency: number;

  trainDelayProbability: number;

  /** Vigilantes base del día, antes del contexto. */
  securityPresence: number;

  securityPatrols: boolean;

  compositionTheme: CompositionTheme;

  /** Pesos de arquetipo del día, sin la franja horaria. */
  passengerComposition: Readonly<
    Record<Archetype, number>
  >;

  /** Multiplica microeventos inusuales y excepcionales. */
  specialEventProbability: number;

  stationMood: StationMood;

  /** Desplazamiento de las franjas horarias en minutos. */
  bandShiftMin: number;
}

// El día de la semana es del calendario del mundo.
export { weekIndex } from './Calendar.ts';

import {
  WEEKDAY_LABEL,
  weekIndex,
  weekdayOf,
} from './Calendar.ts';

/** El nombre del día, en minúsculas: «lunes». El día 1 es lunes. */
export function weekday(
  day: number,
): string {
  return WEEKDAY_LABEL[
    weekdayOf(day)
  ];
}

function rollDay(
  day: number,
  salt = '',
): MetroDailyState {
  const rng = seededRng(
    hashSeed(
      'metro-day',
      day,
      salt,
    ),
  );

  const weekend =
    weekIndex(day) >= 5;

  const crowdShift =
    weighted(
      rng,
      DAILY_WEIGHTS.crowdShift,
    );

  const trainDelayProbability =
    weighted(
      rng,
      DAILY_WEIGHTS.trainDelayProbability,
    );

  // El ambiente no es independiente:
  // un día lleno o con retrasos tira a tenso.
  const tension =
    crowdShift +
    (
      trainDelayProbability > 0.2
        ? 1
        : 0
    );

  const moodTable =
    DAILY_WEIGHTS.stationMood.map(
      ([mood, w]): [
        StationMood,
        number,
      ] => [
        mood,

        mood === 'HECTIC'
          ? w *
            Math.max(
              0.3,
              1 +
                tension *
                  0.8,
            )

          : mood === 'CALM'
            ? w *
              Math.max(
                0.3,
                1 -
                  tension *
                    0.5,
              )

            : w,
      ],
    );

  const compositionTheme =
    weighted(
      rng,
      DAILY_WEIGHTS.compositionTheme,
    );

  return {
    day,

    weekend,

    crowdLevel:
      CROWD_LEVELS[
        2 + crowdShift
      ],

    crowdShift,

    trainFrequency:
      weighted(
        rng,
        DAILY_WEIGHTS.trainFrequency,
      ),

    trainDelayProbability,

    securityPresence:
      weighted(
        rng,
        DAILY_WEIGHTS.securityPresence,
      ),

    securityPatrols:
      weighted(
        rng,
        DAILY_WEIGHTS.securityPatrols,
      ),

    compositionTheme,

    passengerComposition:
      composition(
        compositionTheme,
        weekend,
      ),

    specialEventProbability:
      weighted(
        rng,
        DAILY_WEIGHTS.specialEventProbability,
      ),

    stationMood:
      weighted(
        rng,
        moodTable,
      ),

    bandShiftMin:
      Math.round(
        between(
          rng,
          -DAILY_WEIGHTS.bandShiftMin,
          DAILY_WEIGHTS.bandShiftMin,
        ),
      ),
  };
}

function composition(
  theme: CompositionTheme,
  weekend: boolean,
): Record<Archetype, number> {
  const themeBoost:
    Partial<
      Record<
        Archetype,
        number
      >
    > =
    ARCHETYPE_BOOST.theme[
      theme
    ];

  const weekendBoost:
    Partial<
      Record<
        Archetype,
        number
      >
    > =
    weekend
      ? ARCHETYPE_BOOST.weekend
      : {};

  const out =
    {} as Record<
      Archetype,
      number
    >;

  for (
    const key of
    Object.keys(
      ARCHETYPES,
    ) as Archetype[]
  ) {
    out[key] =
      ARCHETYPES[key].weight *
      (
        themeBoost[key] ??
        1
      ) *
      (
        weekendBoost[key] ??
        1
      );
  }

  return out;
}

/** Huella de un día: lo que el jugador percibiría a simple vista. */
export function daySignature(
  s: MetroDailyState,
): string[] {
  return [
    s.crowdLevel,

    s.stationMood,

    String(
      s.securityPresence,
    ),

    s.compositionTheme,

    s.trainDelayProbability >
    0.1
      ? 'retrasos'
      : 'puntual',

    String(
      s.trainFrequency,
    ),
  ];
}

export function similarity(
  a: MetroDailyState,
  b: MetroDailyState,
): number {
  const sb =
    daySignature(b);

  return daySignature(
    a,
  ).filter(
    (v, i) =>
      v === sb[i],
  ).length;
}

/** A partir de cuántos rasgos iguales (de 6) dos días seguidos se sienten repetidos. */
export const REPEAT_THRESHOLD =
  5;

/** Mismo nivel y mismo perfil de gente: lo primero que el jugador nota. */
const sameFeel = (
  a: MetroDailyState,
  b: MetroDailyState,
): boolean =>
  a.crowdLevel ===
    b.crowdLevel &&
  a.compositionTheme ===
    b.compositionTheme;

function feelsRepeated(
  state: MetroDailyState,
  prev:
    | MetroDailyState
    | null,
  prev2:
    | MetroDailyState
    | null,
): boolean {
  if (!prev) {
    return false;
  }

  if (
    similarity(
      state,
      prev,
    ) >=
    REPEAT_THRESHOLD
  ) {
    return true;
  }

  // Dos días típicos seguidos es normal;
  // tres ya se nota.
  return (
    prev2 !== null &&
    sameFeel(
      state,
      prev,
    ) &&
    sameFeel(
      prev,
      prev2,
    )
  );
}

const cache =
  new Map<
    number,
    MetroDailyState
  >();

/**
 * Estado del metro para un día.
 *
 * Determinista: entrar y salir diez veces el mismo día
 * da el mismo día.
 */
export function metroDay(
  day: number,
): MetroDailyState {
  const hit =
    cache.get(day);

  if (hit) {
    return hit;
  }

  const prev =
    day > 1
      ? metroDay(
          day - 1,
        )
      : null;

  const prev2 =
    day > 2
      ? metroDay(
          day - 2,
        )
      : null;

  let state =
    rollDay(day);

  for (
    let salt = 1;
    salt < 8 &&
    feelsRepeated(
      state,
      prev,
      prev2,
    );
    salt++
  ) {
    state =
      rollDay(
        day,
        `varía-${salt}`,
      );
  }

  cache.set(
    day,
    state,
  );

  return state;
}

// --------------------------------------------------------------- la hora

function bandAt(
  daily: MetroDailyState,
  minuteOfDay: number,
): (typeof HOUR_BANDS)[number] {
  let current:
    (typeof HOUR_BANDS)[number] =
    HOUR_BANDS[0];

  for (
    const band of
    HOUR_BANDS
  ) {
    const from =
      band.from === 0
        ? 0
        : band.from +
          daily.bandShiftMin;

    if (
      minuteOfDay >=
      from
    ) {
      current = band;
    }
  }

  return current;
}

export function hourTag(
  daily: MetroDailyState,
  hour: number,
  minute: number,
): HourTag {
  return bandAt(
    daily,
    hour * 60 + minute,
  ).tag;
}

export function crowdAt(
  daily: MetroDailyState,
  hour: number,
  minute: number,
): CrowdLevel {
  const band =
    bandAt(
      daily,
      hour * 60 + minute,
    );

  const offset =
    daily.weekend
      ? band.weekend
      : band.offset;

  const index =
    Math.max(
      0,
      Math.min(
        CROWD_LEVELS.length -
          1,

        2 +
          daily.crowdShift +
          offset,
      ),
    );

  return CROWD_LEVELS[
    index
  ];
}

export function pickArchetype(
  rng: Rng,
  daily: MetroDailyState,
  tag: HourTag,
): Archetype {
  const tagBoost:
    Partial<
      Record<
        Archetype,
        number
      >
    > =
    ARCHETYPE_BOOST.byTag[
      tag
    ];

  const table =
    (
      Object.keys(
        ARCHETYPES,
      ) as Archetype[]
    ).map(
      (
        key,
      ): [
        Archetype,
        number,
      ] => [
        key,

        daily
          .passengerComposition[
          key
        ] *
          (
            tagBoost[
              key
            ] ??
            1
          ),
      ],
    );

  return weighted(
    rng,
    table,
  );
}

/** Pasajeros activos a la vez para un nivel, con su variación natural. */
export function activeTarget(
  rng: Rng,
  level: CrowdLevel,
): number {
  const [
    min,
    max,
  ] =
    CROWD_PROFILES[
      level
    ].active;

  const n =
    intBetween(
      rng,
      min,
      max,
    );

  return Math.max(
    METRO_CONFIG.minPassengers,

    Math.min(
      METRO_CONFIG.maxPassengers,
      n,
    ),
  );
}

// ------------------------------------------------------------------ trenes

export type DelayKind =
  | 'PUNTUAL'
  | 'RETRASO'
  | 'RETRASO_MODERADO';

/**
 * Espera hasta el siguiente tren.
 * Nunca sale del clamp configurado.
 */
export function trainWait(
  rng: Rng,
  daily: MetroDailyState,
  level: CrowdLevel,
): {
  waitMs: number;
  delayMs: number;
  kind: DelayKind;
} {
  const cfg =
    METRO_CONFIG;

  const [
    min,
    max,
  ] =
    cfg.trainIntervalClamp;

  const base =
    cfg.trainArrivalInterval *
    daily.trainFrequency *
    CROWD_PROFILES[level]
      .trainFrequency;

  const jitter =
    between(
      rng,
      -1_500,
      1_500,
    );

  let kind:
    DelayKind =
    'PUNTUAL';

  let delayMs = 0;

  if (
    rng() <
    daily.trainDelayProbability
  ) {
    const moderate =
      rng() <
      cfg.trainDelay
        .moderateShare;

    const [
      a,
      b,
    ] =
      moderate
        ? cfg.trainDelay
            .moderate
        : cfg.trainDelay
            .small;

    kind =
      moderate
        ? 'RETRASO_MODERADO'
        : 'RETRASO';

    delayMs =
      between(
        rng,
        a,
        b,
      );
  }

  const waitMs =
    Math.max(
      min,

      Math.min(
        max,

        base +
          jitter +
          delayMs,
      ),
    );

  return {
    waitMs,
    delayMs,
    kind,
  };
}

// --------------------------------------------------------------- seguridad

/**
 * Vigilantes de una estación en una franja concreta.
 *
 * PROMPT 52:
 *
 * - Si la estación dispone de algún puesto de seguridad,
 *   siempre existe exactamente UN vigilante de servicio.
 *
 * - Nunca queda la estación sin seguridad, tampoco de noche.
 *
 * - No se generan dos vigilantes simultáneos.
 *
 * - La rotación de qué vigilante concreto está trabajando
 *   se gestiona en MetroSystem.
 *
 * - La patrulla sí continúa variando según día,
 *   franja y contexto para que el comportamiento no sea idéntico.
 */
export function securityFor(
  daily: MetroDailyState,
  stationId: string,
  tag: HourTag,
  level: CrowdLevel,
  posts: number,
): {
  count: number;
  patrols: boolean;
} {
  const rng =
    seededRng(
      hashSeed(
        'metro-security',
        daily.day,
        stationId,
        tag,
      ),
    );

  // ------------------------------------------------------------
  // Siempre exactamente un vigilante si existe al menos un puesto.
  // ------------------------------------------------------------

  const count =
    posts > 0
      ? 1
      : 0;

  // ------------------------------------------------------------
  // La persona siempre está de servicio,
  // pero puede estar fija o haciendo ronda.
  // ------------------------------------------------------------

  const busy =
    level === 'HIGH' ||
    level ===
      'RUSH_HOUR';

  let patrols =
    daily.securityPatrols;

  // En horas de mucha afluencia se favorecen las rondas.
  if (busy) {
    patrols = true;
  }

  // De noche sigue existiendo seguridad,
  // pero es más frecuente que permanezca en su puesto.
  if (
    tag === 'night' &&
    rng() < 0.6
  ) {
    patrols = false;
  }

  return {
    count,
    patrols,
  };
}

// ------------------------------------------------------------ microeventos

export type EventMoment =
  | 'tick'
  | 'arrival';

/**
 * Reloj de microeventos:
 * decide cada cierto tiempo si pasa algo
 * y guarda la calma después.
 */
export class MicroEventClock {
  private untilTick: number;

  private quiet = 0;

  private readonly rng: Rng;

  private readonly daily:
    MetroDailyState;

  constructor(
    rng: Rng,
    daily: MetroDailyState,
  ) {
    this.rng = rng;
    this.daily = daily;

    this.untilTick =
      this.nextTick();
  }

  /**
   * Avanza el reloj.
   * Devuelve un evento de rutina cuando toca, o null.
   */
  update(
    deltaMs: number,
    level: CrowdLevel,
  ): MicroEvent | null {
    this.quiet -= deltaMs;

    this.untilTick -=
      deltaMs;

    if (
      this.untilTick >
      0
    ) {
      return null;
    }

    this.untilTick =
      this.nextTick();

    return this.pick(
      'tick',
      level,
    );
  }

  /** Llamar al abrirse las puertas. */
  arrival(
    level: CrowdLevel,
  ): MicroEvent | null {
    return this.pick(
      'arrival',
      level,
    );
  }

  private pick(
    moment: EventMoment,
    level: CrowdLevel,
  ): MicroEvent | null {
    if (
      this.quiet > 0
    ) {
      return null;
    }

    const rows:
      readonly EventRow[] =
      MICRO_EVENTS[
        moment
      ];

    const special =
      this.daily
        .specialEventProbability;

    const scale =
      CROWD_PROFILES[
        level
      ].eventScale;

    const table =
      rows.map(
        (
          row,
        ): [
          EventRow,
          number,
        ] => [
          row,

          row.event ===
          'NONE'
            ? row.weight

            : row.weight *
              scale *
              (
                row.tier ===
                  'UNUSUAL' ||
                row.tier ===
                  'EXCEPTIONAL'
                  ? special
                  : 1
              ),
        ],
      );

    const row =
      weighted(
        this.rng,
        table,
      );

    if (
      row.event ===
      'NONE'
    ) {
      return null;
    }

    this.quiet =
      MICRO_EVENTS.quietAfter[
        row.tier
      ];

    return row.event;
  }

  private nextTick(): number {
    const [
      min,
      max,
    ] =
      MICRO_EVENTS.tickEvery;

    const mood =
      this.daily.stationMood;

    return (
      between(
        this.rng,
        min,
        max,
      ) *
      (
        mood === 'HECTIC'
          ? 0.75

          : mood === 'CALM'
            ? 1.3

            : 1
      )
    );
  }
}