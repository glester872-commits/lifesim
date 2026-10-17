import { ARENA_MATCHES } from './cityEvents.ts';

/**
 * El partido que se ve desde la grada (systems/MatchPlay, world/MatchView): cómo se reparte el fútbol dentro de la fase
 * `live` del calendario de partidos (data/cityEvents.ts ARENA_MATCHES.phases.live, 110 minutos de juego desde el saque),
 * los rivales con su equipación, la formación de los muñecos y las jugadas de la biblioteca de momentos.
 *
 * Equivalencia de minutos (minutos de reloj del mundo desde el saque → minuto de fútbol), 1 a 1:
 *   0–47     primera parte: 1' … 45', y 45+1, 45+2 de añadido
 *   47–62    descanso (15 minutos)
 *   62–110   segunda parte: 46' … 90', y 90+1 … 90+3 de añadido
 *   110      final: es el fin de la fase `live`; la salida (`leaving`) empieza a la vez, como siempre.
 * Nada de esto mueve las fases del metro, los bares o la calle: todo cabe dentro de `live`.
 */
export const LIVE_END = ARENA_MATCHES.phases.live[1];
export const HALVES = {
  first: { from: 0, to: 47, base: 0, regulation: 45 },
  second: { from: 62, to: LIVE_END, base: 45, regulation: 90 },
} as const;

/** Huecos donde caen los momentos de cada parte (minutos desde el saque): el momento decisivo, con ± `JITTER`. */
export const SLOTS: readonly number[] = [10, 21, 32, 42, 73, 84, 94, 104];
export const JITTER = 1.5;
/** Momentos por partido [mín, máx] y probabilidad de que un momento acabe en gol. */
export const MOMENTS: readonly [number, number] = [5, 8];
export const GOAL_CHANCE = 0.3;
/** Ventaja de jugar en casa: probabilidad de que el momento sea del equipo local. */
export const HOME_SHARE = 0.56;
/** Cuánto dura un momento, en minutos de juego (a 2 minutos por segundo, unos 4,5 s de jugada). */
export const MOMENT_MINUTES = 9;

export interface Kit {
  /** Nombre corto para el marcador. */
  code: string;
  shirt: string;
  shorts: string;
  keeper: string;
}

export const HOME_KIT: Kit = { code: 'HAL', shirt: '#1f8f8a', shorts: '#f08a24', keeper: '#2b2b33' };

/** Los rivales de data/cityEvents.ts (ARENA_CLUB.rivals): todos ficticios, ninguno con el verde del césped. */
export const RIVAL_KITS: Readonly<Record<string, Kit>> = {
  'Deportivo Marisma': { code: 'DMA', shirt: '#2f5fb3', shorts: '#f2f2ea', keeper: '#e8d23a' },
  'Unión Cantera': { code: 'UCA', shirt: '#c23b3b', shorts: '#f2f2ea', keeper: '#3a3a44' },
  'Atlas del Valle': { code: 'ATV', shirt: '#efe9df', shorts: '#2b2b33', keeper: '#d45a9a' },
  'Racing Vereda': { code: 'RVE', shirt: '#6a3fa0', shorts: '#e8d23a', keeper: '#f08a24' },
};

/**
 * Siete por equipo (portero y seis): no es un once, es lo que se lee en un campo de 22 tiles. Posiciones en el campo
 * normalizado del equipo (x 0 = su portería, 1 = la contraria; y 0 = banda de arriba, 1 = la de abajo).
 */
export const FORMATION: readonly (readonly [number, number])[] = [
  [0.03, 0.5],
  [0.2, 0.25], [0.2, 0.75],
  [0.4, 0.5],
  [0.55, 0.2], [0.55, 0.8],
  [0.72, 0.5],
];

/** Un punto de la jugada: a qué fracción del momento (0–1) está el balón ahí y, si lo hay, qué pasa. */
export interface Beat {
  u: number;
  x: number;
  y: number;
  say?: 'shot' | 'save' | 'goal' | 'post' | 'clear' | 'wide' | 'setup';
}

export type PatternId = 'cross-goal' | 'solo-goal' | 'corner-goal' | 'shot-saved' | 'shot-wide' | 'free-kick-saved' | 'counter-cleared' | 'post';

export interface Pattern {
  id: PatternId;
  /** Lo que se cuenta en el marcador al pasar. */
  label: string;
  goal: boolean;
  /** Fracción del momento en que ocurre lo decisivo (el gol, la parada): es la hora del suceso. */
  decisive: number;
  /** Peso al elegir entre los de su clase (gol o no). */
  weight: number;
  /** El balón, atacando hacia x = 1: de dónde sale a dónde acaba (después vuelve el juego normal). Tras un gol, vuelve al centro para sacar. */
  beats: readonly Beat[];
}

/**
 * La biblioteca de momentos: ocho jugadas distintas, cada una con su arranque, lo decisivo y la vuelta al juego. El
 * balón siempre viaja de un punto al siguiente: nunca salta de lado a lado del campo.
 */
export const PATTERNS: readonly Pattern[] = [
  {
    id: 'cross-goal', label: 'gol tras un centro', goal: true, decisive: 0.72, weight: 3,
    beats: [
      { u: 0, x: 0.5, y: 0.5 }, { u: 0.2, x: 0.62, y: 0.3 }, { u: 0.38, x: 0.74, y: 0.1 }, { u: 0.52, x: 0.86, y: 0.1, say: 'setup' },
      { u: 0.64, x: 0.9, y: 0.48, say: 'shot' }, { u: 0.72, x: 1.02, y: 0.5, say: 'goal' }, { u: 0.86, x: 1.02, y: 0.5 }, { u: 1, x: 0.5, y: 0.5, say: 'setup' },
    ],
  },
  {
    id: 'solo-goal', label: 'gol tras una jugada individual', goal: true, decisive: 0.74, weight: 2,
    beats: [
      { u: 0, x: 0.42, y: 0.62 }, { u: 0.18, x: 0.56, y: 0.74 }, { u: 0.36, x: 0.68, y: 0.56 }, { u: 0.52, x: 0.8, y: 0.66 },
      { u: 0.64, x: 0.86, y: 0.58, say: 'shot' }, { u: 0.74, x: 1.02, y: 0.42, say: 'goal' }, { u: 0.86, x: 1.02, y: 0.42 }, { u: 1, x: 0.5, y: 0.5, say: 'setup' },
    ],
  },
  {
    id: 'corner-goal', label: 'gol de cabeza en un córner', goal: true, decisive: 0.7, weight: 1,
    beats: [
      { u: 0, x: 0.8, y: 0.3 }, { u: 0.2, x: 0.97, y: 0.02, say: 'setup' }, { u: 0.45, x: 0.97, y: 0.02 },
      { u: 0.6, x: 0.9, y: 0.46, say: 'shot' }, { u: 0.7, x: 1.02, y: 0.54, say: 'goal' }, { u: 0.86, x: 1.02, y: 0.54 }, { u: 1, x: 0.5, y: 0.5, say: 'setup' },
    ],
  },
  {
    id: 'shot-saved', label: 'parada del portero', goal: false, decisive: 0.66, weight: 3,
    beats: [
      { u: 0, x: 0.48, y: 0.4 }, { u: 0.22, x: 0.64, y: 0.32 }, { u: 0.44, x: 0.78, y: 0.44 }, { u: 0.56, x: 0.82, y: 0.46, say: 'shot' },
      { u: 0.66, x: 0.96, y: 0.5, say: 'save' }, { u: 0.8, x: 0.96, y: 0.5 }, { u: 1, x: 0.8, y: 0.52, say: 'clear' },
    ],
  },
  {
    id: 'shot-wide', label: 'disparo fuera', goal: false, decisive: 0.62, weight: 2,
    beats: [
      { u: 0, x: 0.52, y: 0.66 }, { u: 0.24, x: 0.66, y: 0.72 }, { u: 0.44, x: 0.76, y: 0.66 }, { u: 0.52, x: 0.78, y: 0.64, say: 'shot' },
      { u: 0.62, x: 1.03, y: 0.24, say: 'wide' }, { u: 0.8, x: 1.03, y: 0.24 }, { u: 1, x: 0.96, y: 0.4, say: 'setup' },
    ],
  },
  {
    id: 'free-kick-saved', label: 'falta directa, a córner', goal: false, decisive: 0.66, weight: 2,
    beats: [
      { u: 0, x: 0.66, y: 0.6 }, { u: 0.16, x: 0.76, y: 0.62, say: 'setup' }, { u: 0.5, x: 0.76, y: 0.62 }, { u: 0.56, x: 0.77, y: 0.62, say: 'shot' },
      { u: 0.66, x: 0.97, y: 0.36, say: 'save' }, { u: 0.78, x: 1.01, y: 0.12 }, { u: 1, x: 0.97, y: 0.02, say: 'setup' },
    ],
  },
  {
    id: 'counter-cleared', label: 'contraataque cortado', goal: false, decisive: 0.7, weight: 2,
    beats: [
      { u: 0, x: 0.22, y: 0.5 }, { u: 0.18, x: 0.42, y: 0.3 }, { u: 0.36, x: 0.6, y: 0.24 }, { u: 0.54, x: 0.76, y: 0.36 },
      { u: 0.7, x: 0.84, y: 0.44, say: 'clear' }, { u: 0.86, x: 0.56, y: 0.92 }, { u: 1, x: 0.5, y: 0.98, say: 'setup' },
    ],
  },
  {
    id: 'post', label: 'al palo', goal: false, decisive: 0.64, weight: 1,
    beats: [
      { u: 0, x: 0.56, y: 0.5 }, { u: 0.26, x: 0.7, y: 0.6 }, { u: 0.48, x: 0.82, y: 0.58 }, { u: 0.54, x: 0.84, y: 0.56, say: 'shot' },
      { u: 0.64, x: 1.0, y: 0.4, say: 'post' }, { u: 0.8, x: 0.88, y: 0.28 }, { u: 1, x: 0.7, y: 0.18, say: 'clear' },
    ],
  },
];

/** Un pase del juego normal entre momento y momento, en minutos de juego (≈ 0,7 s a la velocidad del mundo). */
export const AMBIENT_PASS = 1.4;
