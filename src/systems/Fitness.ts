// Sin Phaser: lo usan state/GameState, systems/SaveSystem, scenes/Menus y scenes/WorldScene, y lo prueba scripts/check-fitness.ts.

/**
 * La forma física del jugador, lo justo para que entrenar sirva de algo sin
 * convertir el juego en un RPG: tres atributos de 0 a 100 que suben despacio y
 * un cansancio que baja con el tiempo. Cardio sube resistencia y forma; pesas,
 * fuerza y algo de forma; estirar quita cansancio. Cada atributo cuesta más
 * cuanto más alto está, y a partir de la segunda sesión del día se gana cada vez
 * menos: una tarde de gimnasio no cambia a nadie, hacen falta semanas.
 */

export type Intensity = 'soft' | 'normal' | 'hard';
export type WorkoutKind = 'cardio' | 'strength' | 'mobility';

export interface Fitness {
  /** Forma general, de 0 a 100. */
  fitness: number;
  /** Fuerza (pesas). */
  strength: number;
  /** Resistencia (cardio). */
  stamina: number;
  /** Cansancio de entrenar: sube con la sesión, baja con las horas. No es la energía. */
  fatigue: number;
  /** Minuto absoluto del juego al que está puesta al día la fatiga. */
  at: number;
  /** Día de la última sesión y cuántas llevaba ese día. */
  day: number;
  sessions: number;
  /** Sesiones hechas en total. */
  total: number;
}

export const START_FITNESS: Fitness = { fitness: 18, strength: 12, stamina: 16, fatigue: 0, at: 0, day: 0, sessions: 0, total: 0 };

/** Qué clase de ejercicio es cada puesto del gimnasio (data/stations.ts). Lo que no está aquí no se entrena. */
export const KIND_OF: Readonly<Record<string, WorkoutKind>> = {
  treadmill: 'cardio',
  bike: 'cardio',
  rower: 'cardio',
  'bench-press': 'strength',
  'squat-rack': 'strength',
  dumbbells: 'strength',
  cable: 'strength',
  stretch: 'mobility',
};

export const INTENSITIES: Readonly<Record<Intensity, { label: string; minutes: number; energy: number; gain: number; fatigue: number }>> = {
  soft: { label: 'Suave', minutes: 15, energy: 5, gain: 0.55, fatigue: 0.6 },
  normal: { label: 'Normal', minutes: 30, energy: 11, gain: 1, fatigue: 1 },
  hard: { label: 'Intenso', minutes: 50, energy: 20, gain: 1.7, fatigue: 1.8 },
};
export const INTENSITY_ORDER: readonly Intensity[] = ['soft', 'normal', 'hard'];

/** Estirar es más corto y cansa mucho menos. */
const KIND_SCALE: Readonly<Record<WorkoutKind, { minutes: number; energy: number }>> = {
  cardio: { minutes: 1, energy: 1 },
  strength: { minutes: 1, energy: 1 },
  mobility: { minutes: 0.5, energy: 0.3 },
};

/** Lo que sube una sesión normal completa de cada clase, antes de los rendimientos decrecientes. */
const GAIN: Readonly<Record<WorkoutKind, { fitness: number; strength: number; stamina: number }>> = {
  cardio: { fitness: 0.35, strength: 0, stamina: 0.6 },
  strength: { fitness: 0.25, strength: 0.6, stamina: 0 },
  mobility: { fitness: 0.1, strength: 0, stamina: 0 },
};

/** Cansancio que deja una sesión normal; estirar lo quita. */
const FATIGUE: Readonly<Record<WorkoutKind, number>> = { cardio: 7, strength: 8, mobility: -7 };

/** Cuánto vale la sesión según cuántas lleva ya hoy: de la tercera en adelante, cada vez menos. */
const DAILY = [1, 1, 0.6, 0.35, 0.15] as const;

const clamp = (v: number, lo = 0, hi = 100): number => Math.min(hi, Math.max(lo, v));
const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Lo que cuesta subir más cuanto más alto estás. */
const room = (value: number): number => Math.pow(1 - value / 100, 1.4);

/** La fatiga ya recuperada con el paso del tiempo: se va más despacio cuando es mucha. */
export function settle(f: Fitness, nowMinute: number): Fitness {
  const hours = Math.max(0, nowMinute - f.at) / 60;
  const rate = f.fatigue > 60 ? 2 : 3;
  return { ...f, fatigue: round2(clamp(f.fatigue - hours * rate)), at: nowMinute };
}

export interface Quote {
  minutes: number;
  energy: number;
  /** Por qué no se puede ahora, o null. */
  blocked: string | null;
}

/** Cuánto dura y cuánta energía cuesta, con el cansancio de ahora; y si hoy se puede. */
export function quote(f: Fitness, station: string, intensity: Intensity, energy: number): Quote {
  const kind = KIND_OF[station];
  const i = INTENSITIES[intensity];
  const scale = KIND_SCALE[kind ?? 'cardio'];
  const minutes = Math.round(i.minutes * scale.minutes);
  // Más cansado cuesta más; más resistencia, algo menos.
  const cost = Math.round(i.energy * scale.energy * (1 + f.fatigue / 250) * (1 - f.stamina / 400));
  let blocked: string | null = null;
  if (!kind) blocked = 'Aquí no se entrena.';
  else if (energy < cost) blocked = 'No tienes fuerzas para tanto.';
  else if (intensity === 'hard' && f.fatigue >= 85) blocked = 'Estás muy cansado: algo más suave.';
  return { minutes, energy: cost, blocked };
}

export interface Outcome {
  next: Fitness;
  /** Lo que ha cambiado de cada cosa. */
  delta: { fitness: number; strength: number; stamina: number; fatigue: number };
  /** Energía que se gasta de verdad (proporcional a lo hecho). */
  energy: number;
}

/**
 * Lo que deja una sesión: `fraction` es lo que se llegó a hacer (de 0 a 1; si se corta antes, se gana y se gasta
 * en proporción). Las que se cortan a menos de la mitad no cuentan para el límite del día.
 */
export function train(f0: Fitness, station: string, intensity: Intensity, fraction: number, nowMinute: number, day: number, energy: number): Outcome {
  const f = settle(f0, nowMinute);
  const kind = KIND_OF[station];
  if (!kind || fraction <= 0) return { next: f, delta: { fitness: 0, strength: 0, stamina: 0, fatigue: 0 }, energy: 0 };
  const i = INTENSITIES[intensity];
  const today = f.day === day ? f.sessions : 0;
  const daily = DAILY[Math.min(today, DAILY.length - 1)];
  const fresh = 1 - (f.fatigue / 100) * 0.5;
  const k = i.gain * fraction * daily * fresh;
  const g = GAIN[kind];
  const gainOf = (base: number, value: number): number => round2(base * k * room(value));
  const delta = {
    fitness: gainOf(g.fitness, f.fitness),
    strength: gainOf(g.strength, f.strength),
    stamina: gainOf(g.stamina, f.stamina),
    fatigue: round2(FATIGUE[kind] * i.fatigue * fraction),
  };
  const counts = fraction >= 0.5;
  const next: Fitness = {
    fitness: round2(clamp(f.fitness + delta.fitness)),
    strength: round2(clamp(f.strength + delta.strength)),
    stamina: round2(clamp(f.stamina + delta.stamina)),
    fatigue: round2(clamp(f.fatigue + delta.fatigue)),
    at: nowMinute,
    day: counts ? day : f.day,
    sessions: counts ? today + 1 : f.day === day ? f.sessions : 0,
    total: f.total + (counts ? 1 : 0),
  };
  const spent = Math.min(energy, quote(f, station, intensity, 100).energy * fraction);
  return { next, delta, energy: Math.round(spent * 10) / 10 };
}

/**
 * Para el cuerpo del jugador cuando se pueda dibujar (hoy no: el aspecto de quien
 * persiste es ropa, pelo y tatuajes, y su cuerpo es uno). De 0 a 1 cada cosa, subiendo despacio:
 * más atlético con la forma, más musculado con la fuerza, mejor postura con las dos.
 */
export function bodyProgress(f: Fitness): { athletic: number; muscular: number; posture: number } {
  const unit = (v: number): number => clamp(v, 0, 1);
  return {
    athletic: unit((f.fitness - 25) / 60),
    muscular: unit((f.strength - 25) / 60),
    posture: unit((f.fitness + f.strength - 50) / 120),
  };
}

const word = (v: number): string => (v < 20 ? 'baja' : v < 40 ? 'regular' : v < 60 ? 'buena' : v < 80 ? 'muy buena' : 'de atleta');

/** Una línea para el menú: cómo está cada cosa. */
export function summary(f: Fitness): string {
  const tired = f.fatigue < 15 ? 'descansado' : f.fatigue < 40 ? 'algo cansado' : f.fatigue < 70 ? 'cansado' : 'agotado';
  return `Forma ${word(f.fitness)} · fuerza ${word(f.strength)} · resistencia ${word(f.stamina)} · ${tired}.`;
}

/** Lo que se nota al acabar, en una frase: sólo si ha cambiado algo. */
export function afterLine(delta: Outcome['delta'], station: string): string {
  const kind = KIND_OF[station];
  if (kind === 'mobility') return 'Sales más suelto: se te ha ido parte del cansancio.';
  if (delta.stamina > 0.05 && delta.strength <= 0.05) return 'Notas el corazón y los pulmones trabajados.';
  if (delta.strength > 0.05) return 'Los músculos te piden descanso: buen trabajo.';
  return 'Una sesión más. Se nota con el tiempo, no de golpe.';
}

const num = (v: unknown, fallback: number, lo = 0, hi = 100): number => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback);

/** Lee lo guardado: partidas anteriores no lo tienen (se empieza de cero) y un campo mal formado se repone, no rompe la carga. */
export function parseFitness(value: unknown): Fitness {
  if (typeof value !== 'object' || value === null) return { ...START_FITNESS };
  const v = value as Record<string, unknown>;
  return {
    fitness: num(v.fitness, START_FITNESS.fitness),
    strength: num(v.strength, START_FITNESS.strength),
    stamina: num(v.stamina, START_FITNESS.stamina),
    fatigue: num(v.fatigue, 0),
    at: num(v.at, 0, 0, Number.MAX_SAFE_INTEGER),
    day: num(v.day, 0, 0, Number.MAX_SAFE_INTEGER),
    sessions: Math.round(num(v.sessions, 0, 0, 1000)),
    total: Math.round(num(v.total, 0, 0, 1_000_000)),
  };
}
