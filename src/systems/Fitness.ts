// Sin Phaser: lo usan state/GameState, systems/SaveSystem, scenes/Menus y scenes/WorldScene, y lo prueba scripts/check-fitness.ts.

/**
 * La forma física del jugador, lo justo para que entrenar sirva de algo sin
 * convertir el juego en un RPG: tres atributos de 0 a 100 que suben despacio y
 * un cansancio que baja con el tiempo. Cardio sube resistencia y forma; pesas,
 * fuerza y algo de forma; estirar quita cansancio. Cada atributo cuesta más
 * cuanto más alto está, y a partir de la segunda sesión del día se gana cada vez
 * menos: una tarde de gimnasio no cambia a nadie, hacen falta semanas.
 */

import { getAcademy } from '../data/academies.ts';
import { getStation } from '../data/stations.ts';
import { classSlot, covered, holdsClass, NO_MEMBERSHIP, parseMembership, type Membership } from './Academy.ts';
import { parseTkd, type TkdProgress } from './Taekwondo.ts';
import { parseEntries, parseRecords, type Entry, type FightRecord } from './Tournaments.ts';

export type Intensity = 'soft' | 'normal' | 'hard';
export type WorkoutKind = 'cardio' | 'strength' | 'mobility';

export interface Fitness {
  /** Técnica de cada disciplina (data/academies.ts), de 0 a 100; sin entrada, cero. Los guardados de antes traían `boxing`. */
  skills?: Record<string, number>;
  /** La ficha en cada academia: bono y última clase pagada (systems/Academy). */
  academies?: Record<string, Membership>;
  /** Taekwondo (systems/Taekwondo): coordinación, flexibilidad, equilibrio, cinturón y asistencia. */
  taekwondo?: TkdProgress;
  /** Torneo de cada disciplina (systems/Tournaments): el de su día y la fase a la que se llegó. */
  tournaments?: Partial<Record<'taekwondo' | 'boxing', Entry>>;
  /** Combates hechos, ganados y títulos, por disciplina (en MMA, ejercicios por parejas). */
  fights?: Partial<Record<'taekwondo' | 'boxing' | 'mma', FightRecord>>;
  /** MMA: lo practicado por parejas en cada parte (puños, patadas, lucha), de 0 a 100, y sesiones hechas. */
  mma?: MmaProgress;
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

export interface MmaProgress {
  punches: number;
  kicks: number;
  grappling: number;
  sessions: number;
}

export const START_FITNESS: Fitness = { fitness: 18, strength: 12, stamina: 16, fatigue: 0, at: 0, day: 0, sessions: 0, total: 0 };

/** Qué clase de ejercicio es cada puesto del gimnasio (data/stations.ts). Lo que no está aquí no se entrena. */
export const KIND_OF: Readonly<Record<string, WorkoutKind>> = {
  'boxing-guard': 'mobility',
  'boxing-footwork': 'cardio',
  'boxing-bag': 'strength',
  'boxing-coordination': 'cardio',
  'boxing-resistance': 'cardio',
  'mma-bag': 'strength',
  'mma-ground': 'strength',
  'mma-footwork': 'cardio',
  'mma-conditioning': 'cardio',
  'tkd-kicks-front': 'cardio',
  'tkd-kicks-round': 'cardio',
  'tkd-kicks-side': 'cardio',
  'tkd-forms': 'mobility',
  'tkd-stretch': 'mobility',
  'dance-steps': 'cardio',
  'dance-choreo': 'cardio',
  'dance-stretch': 'mobility',
  treadmill: 'cardio',
  bike: 'cardio',
  rower: 'cardio',
  'bench-press': 'strength',
  'squat-rack': 'strength',
  dumbbells: 'strength',
  cable: 'strength',
  stretch: 'mobility',
  // Al aire libre (data/ribera.ts): dominadas y tiros a canasta.
  pullup: 'strength',
  hoops: 'cardio',
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
  fee: number;
  wait: number;
  minutes: number;
  energy: number;
  /** Por qué no se puede ahora, o null. */
  blocked: string | null;
}

/** Cuánto dura y cuánta energía cuesta, con el cansancio de ahora; y si hoy se puede. */
/**
 * `context.at`: minuto absoluto de ahora. Con él, una clase de academia ya pagada o con bono no pide dinero (systems/Academy);
 * sin él, se pide el precio de la suelta.
 */
export function quote(f: Fitness, station: string, intensity: Intensity, energy: number, context?: { money: number; hour: number; minute: number; at?: number }): Quote {
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
  const academy = getAcademy(getStation(station)?.training?.academy ?? '');
  let wait = 0;
  let fee = academy?.fee ?? 0;
  if (academy && context) {
    // Lo que ya impedía entrenar (energía, cansancio) antes de mirar el horario.
    const before = blocked;
    const now = context.hour * 60 + context.minute;
    const [open, close] = academy.hours.map(h => h * 60);
    const offset = ((now - open) % academy.every + academy.every) % academy.every;
    wait = now < open ? open - now : offset < academy.grace ? 0 : academy.every - offset;
    if (now >= close || now + wait + minutes > close) { blocked = 'No queda tiempo antes del cierre; vuelve mañana.'; wait = 0; }
    else if (wait > 0) blocked = 'La próxima sesión empieza en ' + wait + ' min. Puedes esperar aquí.';
    // Ya pagada (esta misma clase) o con bono: no se paga otra vez. Pagada y aún en curso: se vuelve a ella ya, sin
    // esperar a la siguiente (la reserva vale hasta que empieza otra).
    const m = f.academies?.[academy.id] ?? NO_MEMBERSHIP;
    const held = context.at !== undefined && holdsClass(academy, m, context.at);
    if (held) {
      blocked = before;
      wait = 0;
    }
    const slot = context.at === undefined ? null : classSlot(academy, context.at);
    // Con la cuota del mes, tampoco (el día sale del minuto absoluto, como en systems/Academy.charge).
    const plan = context.at !== undefined && covered(m, Math.floor(context.at / 1440) + 1);
    if (held || plan || (slot !== null && m.pass > 0)) fee = 0;
    if (context.money < fee) blocked = 'La sesión cuesta €' + fee + '; no te llega.';
  }
  return { minutes, energy: cost, blocked, fee, wait };
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
  // La técnica de la disciplina, si el puesto es de una academia: también cuesta más cuanto más alta, y con el límite del día.
  const academy = getStation(station)?.training?.academy;
  const skill = academy ? (f.skills?.[academy] ?? 0) : 0;
  const skills = academy ? { ...f.skills, [academy]: round2(clamp(skill + 0.8 * k * room(skill))) } : f.skills;
  const next: Fitness = {
    ...(skills ? { skills } : {}),
    ...(f.academies ? { academies: f.academies } : {}),
    ...(f.taekwondo ? { taekwondo: f.taekwondo } : {}),
    ...(f.tournaments ? { tournaments: f.tournaments } : {}),
    ...(f.fights ? { fights: f.fights } : {}),
    ...(f.mma ? { mma: f.mma } : {}),
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
 * El cuerpo del jugador, de 0 a 1 cada cosa, subiendo despacio: más atlético con la forma, más musculado con la
 * fuerza, mejor postura con las dos. Se dibuja por tramos (buildOf) y se cuenta en una frase (bodyLine).
 */
export function bodyProgress(f: Fitness): { athletic: number; muscular: number; posture: number } {
  const unit = (v: number): number => clamp(v, 0, 1);
  return {
    athletic: unit((f.fitness - 25) / 60),
    muscular: unit((f.strength - 25) / 60),
    posture: unit((f.fitness + f.strength - 50) / 120),
  };
}

/**
 * La complexión que se dibuja (world/HumanArt.reshape, la misma que la de la gente): sin cambio hasta que el
 * entrenamiento se nota, luego hombros algo más anchos ('athletic') y, con mucha fuerza, también los brazos
 * ('muscular'). Por tramos y no continuo: el cuerpo cambia en dos momentos que se ven, no un píxel cada día.
 */
export function buildOf(f: Fitness): 'athletic' | 'muscular' | undefined {
  const b = bodyProgress(f);
  if (b.muscular >= 0.6) return 'muscular';
  if (b.athletic >= 0.25 || b.muscular >= 0.25) return 'athletic';
  return undefined;
}

/** Cuánto falta para que se note (o qué se nota ya), en una frase. */
export function bodyLine(f: Fitness): string {
  const build = buildOf(f);
  if (build === 'muscular') return 'hombros y brazos marcados; la postura, firme.';
  if (build === 'athletic') {
    const toMuscle = Math.max(1, Math.ceil(25 + 0.6 * 60 - f.strength));
    return `hombros más anchos que al empezar. Con ${toMuscle} puntos más de fuerza se marcarán los brazos.`;
  }
  const toShow = Math.max(1, Math.ceil(Math.min(40 - f.fitness, 40 - f.strength)));
  return `aún no se nota. Con ${toShow} puntos más de forma o de fuerza se te verá en los hombros.`;
}

const word = (v: number): string => (v < 20 ? 'baja' : v < 40 ? 'regular' : v < 60 ? 'buena' : v < 80 ? 'muy buena' : 'de atleta');

/** Una línea para el menú: cómo está cada cosa. */
export function summary(f: Fitness): string {
  const tired = f.fatigue < 15 ? 'descansado' : f.fatigue < 40 ? 'algo cansado' : f.fatigue < 70 ? 'cansado' : 'agotado';
  const skills = Object.entries(f.skills ?? {}).map(([id, v]) => ` ${getAcademy(id)?.skill ?? id} ${v.toFixed(1)}/100.`).join('');
  return `Forma ${word(f.fitness)} · fuerza ${word(f.strength)} · resistencia ${word(f.stamina)} · ${tired}.${skills}`;
}

/** Lo que se nota al acabar, en una frase: sólo si ha cambiado algo. */
export function afterLine(delta: Outcome['delta'], station: string): string {
  const kind = KIND_OF[station];
  const academy = getAcademy(getStation(station)?.training?.academy ?? '');
  if (academy) return academy.lines.after;
  if (kind === 'mobility') return 'Sales más suelto: se te ha ido parte del cansancio.';
  if (delta.stamina > 0.05 && delta.strength <= 0.05) return 'Notas el corazón y los pulmones trabajados.';
  if (delta.strength > 0.05) return 'Los músculos te piden descanso: buen trabajo.';
  return 'Una sesión más. Se nota con el tiempo, no de golpe.';
}

const num = (v: unknown, fallback: number, lo = 0, hi = 100): number => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback);

/** La técnica guardada; un guardado de antes de las academias traía sólo `boxing` y pasa a skills.boxing. */
function parseSkills(v: Record<string, unknown>): Pick<Fitness, 'skills'> {
  const raw = typeof v.skills === 'object' && v.skills !== null ? (v.skills as Record<string, unknown>) : {};
  const skills: Record<string, number> = {};
  for (const [id, x] of Object.entries(raw)) if (getAcademy(id)) skills[id] = num(x, 0);
  if (v.boxing !== undefined && skills.boxing === undefined) skills.boxing = num(v.boxing, 0);
  return Object.keys(skills).length ? { skills } : {};
}

function parseAcademies(v: unknown): Pick<Fitness, 'academies'> {
  if (typeof v !== 'object' || v === null) return {};
  const academies: Record<string, Membership> = {};
  for (const [id, m] of Object.entries(v)) if (getAcademy(id)) academies[id] = parseMembership(m);
  return Object.keys(academies).length ? { academies } : {};
}

/**
 * Lo que deja un ejercicio por parejas de MMA (systems/Sparring): sólo sube cada parte por lo que se practicó de verdad
 * (contactos a distancia: golpes que llegan o se paran, intentos de lucha que se resuelven); lo que no se tocó no se mueve.
 * Cada técnica suma poco, con tope por sesión, y cuesta más cuanto más alta. La técnica de MMA (skills.mma) sube con el total.
 */
export function practiceMma(f: Fitness, tech: { punches: number; kicks: number; grappling: number }): { next: Fitness; gained: Record<'punches' | 'kicks' | 'grappling', number> } {
  const base = f.mma ?? { punches: 0, kicks: 0, grappling: 0, sessions: 0 };
  const gain = (n: number, value: number): number => round2(Math.min(1.5, 0.12 * Math.max(0, n)) * room(value));
  const gained = { punches: gain(tech.punches, base.punches), kicks: gain(tech.kicks, base.kicks), grappling: gain(tech.grappling, base.grappling) };
  const total = tech.punches + tech.kicks + tech.grappling;
  const skill = f.skills?.mma ?? 0;
  const mma: MmaProgress = {
    punches: round2(clamp(base.punches + gained.punches)),
    kicks: round2(clamp(base.kicks + gained.kicks)),
    grappling: round2(clamp(base.grappling + gained.grappling)),
    sessions: base.sessions + (total > 0 ? 1 : 0),
  };
  const skills = total > 0 ? { ...f.skills, mma: round2(clamp(skill + Math.min(1, 0.04 * total) * room(skill))) } : f.skills;
  return { next: { ...f, mma, ...(skills ? { skills } : {}) }, gained };
}

function parseMma(v: unknown): Pick<Fitness, 'mma'> {
  if (typeof v !== 'object' || v === null) return {};
  const r = v as Record<string, unknown>;
  return { mma: { punches: num(r.punches, 0), kicks: num(r.kicks, 0), grappling: num(r.grappling, 0), sessions: Math.round(num(r.sessions, 0, 0, 1_000_000)) } };
}

/** Lee lo guardado: partidas anteriores no lo tienen (se empieza de cero) y un campo mal formado se repone, no rompe la carga. */
export function parseFitness(value: unknown): Fitness {
  if (typeof value !== 'object' || value === null) return { ...START_FITNESS };
  const v = value as Record<string, unknown>;
  return {
    ...parseSkills(v),
    ...parseAcademies(v.academies),
    ...(parseTkd(v.taekwondo) ? { taekwondo: parseTkd(v.taekwondo) } : {}),
    ...(parseEntries(v.tournaments) ? { tournaments: parseEntries(v.tournaments) } : {}),
    ...(parseRecords(v.fights) ? { fights: parseRecords(v.fights) } : {}),
    ...parseMma(v.mma),
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
