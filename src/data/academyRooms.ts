import type { LocationDef, PointDef, PropKind, PropPlacement } from '../types/game.ts';
import { ACADEMIES, type Discipline } from './academies.ts';
import type { PopulationProfile, StaffRole, VisitorRole } from './population.ts';

/**
 * Las salas de las academias nuevas (data/academies.ts): anexos de un gimnasio de barrio, como el club de boxeo de
 * Forja. Una planta común (tatami, espejos al norte, bancos y agua junto a la puerta) y lo propio de cada disciplina
 * en datos: qué puestos hay, dónde y qué cuelga del techo. Ningún código por disciplina: academyRoom() las monta.
 *
 *   MMA · Forja (Vallesco), al lado del boxeo · Baile · Velaria Club (Velaria) · Taekwondo · local propio en Vallesco:
 *   la Escuela de Taekwondo Vallesco (Ronda de la Vía 34), con tatami, paos y la puerta a la calle.
 */

const W = 20;
const H = 14;
const DOOR = 10;

type Facing = PointDef['facing'];
interface RoomSpec {
  academy: Discipline;
  /** Prefijo de sus puntos (TKD_, MMA_, DANCE_). */
  pre: string;
  ambient: string;
  /** Suelo de la zona de práctica ('m' suelo de gimnasio; 'Q' tatami). */
  floor?: string;
  /** El gimnasio por el que se entra y el sitio donde se reaparece al volver. */
  back: { location: string; spawn: string; label: string };
  props: readonly PropPlacement[];
  /** Puestos: id de punto (sin prefijo) → [tx, ty, puesto de data/stations.ts, hacia dónde mira]. */
  stations: Readonly<Record<string, readonly [number, number, string, Facing]>>;
  coach: readonly [number, number, Facing];
  board: readonly string[];
}

const ground = (floor = 'm'): string[] =>
  Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      if (y < 2 || y === H - 1 || x === 0 || x === W - 1) return 'W';
      if (y === H - 2) return x === DOOR ? 'D' : 'W';
      return x >= 2 && x <= 17 && y >= 3 && y <= 9 ? floor : 't';
    }).join(''),
  );

const at = (kind: PropKind, tx: number, ty: number): PropPlacement => ({ kind, tx, ty });

function academyRoom(s: RoomSpec): LocationDef {
  const a = ACADEMIES[s.academy]!;
  const point = (tx: number, ty: number, kind: PointDef['kind'], facing: Facing, use?: string): PointDef => ({ tx, ty, kind, facing, ...(use ? { use } : {}) });
  return {
    id: a.location,
    name: a.name,
    kind: 'interior',
    ground: ground(s.floor),
    ambient: s.ambient,
    props: [
      at('clock', 16, 1),
      ...[3, 9, 15].map((tx) => at('tube-light', tx, 3)),
      at('bench', 2, 11), at('bench', 3, 11),
      at('gym-bags', 13, 11),
      at('cooler', 18, 11),
      ...s.props,
    ],
    portals: [{ id: 'exit', tx: DOOR, ty: H - 2, label: s.back.label, to: { location: s.back.location, spawn: s.back.spawn } }],
    spawns: { entry: { tx: DOOR, ty: H - 3, facing: 'up' } },
    npcs: [],
    points: {
      [`${s.pre}EXIT`]: { tx: DOOR, ty: H - 2, kind: 'exit' },
      [`${s.pre}COACH_01`]: point(s.coach[0], s.coach[1], 'work', s.coach[2]),
      ...Object.fromEntries(Object.entries(s.stations).map(([id, [tx, ty, use, facing]]) => [`${s.pre}${id}`, point(tx, ty, 'interact', facing, use)])),
      [`${s.pre}WATER`]: point(17, 11, 'interact', 'right', 'water'),
      ...Object.fromEntries([5, 6, 7].map((tx, i) => [`${s.pre}REST_0${i + 1}`, point(tx, 11, 'wait', 'up')])),
    },
    inspects: [{ tx: 16, ty: 11, name: `${a.name} · horario`, lines: [...s.board] }],
  };
}

/** Lo que pone el tablón: horario, precio y bono, sacados de la academia; y lo propio de cada una. */
const board = (id: Discipline, extra: string): string[] => {
  const a = ACADEMIES[id]!;
  const hh = (h: number): string => `${String(h).padStart(2, '0')}:00`;
  return [`${a.name}. Cada día de ${hh(a.hours[0])} a ${hh(a.hours[1])}, una clase cada ${a.every} minutos y ${a.grace} para entrar. €${a.fee} la clase o bono de ${a.pass.classes} por €${a.pass.price}. Habla con ${a.instructor}.`, extra];
};

export const MMA_ROOM = academyRoom({
  academy: 'mma', pre: 'MMA_', ambient: '#e8e2d8',
  back: { location: 'gym', spawn: 'mma', label: 'Volver al Gimnasio Forja' },
  props: [
    ...[3, 7, 11].map((tx) => at('boxing-bag', tx, 4)),
    at('yoga-mat', 5, 8), at('yoga-mat', 9, 8),
    at('mirror', 14, 1), at('mirror', 5, 1),
  ],
  stations: {
    BAG_01: [3, 5, 'mma-bag', 'up'], BAG_02: [7, 5, 'mma-bag', 'up'], BAG_03: [11, 5, 'mma-bag', 'up'],
    GROUND_01: [5, 8, 'mma-ground', 'up'], GROUND_02: [9, 8, 'mma-ground', 'up'],
    FEET_01: [14, 8, 'mma-footwork', 'left'],
  },
  coach: [15, 5, 'left'],
  board: board('mma', 'Saco con guantes, derribos y suelo sobre tatami, y desplazamientos. Sin sparring: nadie golpea a nadie.'),
});

/**
 * La Escuela de Taekwondo Vallesco: tatami entero, cinco calles de paos (el pao a dos tiles del puesto, en la dirección en
 * que se mira, con sitio para acercarse y alejarse sin pisar a nadie), la demostración del ayudante, formas y
 * flexibilidad, y la zona de espera con bancos junto a la puerta. Se sale a la acera de la Ronda de la Vía.
 */
export const TKD_ROOM = academyRoom({
  academy: 'taekwondo', pre: 'TKD_', ambient: '#eef0f4', floor: 'Q',
  back: { location: 'district', spawn: 'tkd-door', label: 'Salir a la Ronda de la Vía' },
  props: [
    at('dojang-sign', 8, 1),
    at('mirror', 3, 1), at('mirror', 14, 1),
    ...([[5, 4], [5, 6], [5, 8], [12, 4], [12, 7], [10, 4]] as const).map(([tx, ty]) => at('kick-pad', tx, ty)),
    at('yoga-mat', 9, 9),
  ],
  stations: {
    KICK_01: [3, 4, 'tkd-kicks-round', 'right'], KICK_02: [3, 6, 'tkd-kicks-front', 'right'], KICK_03: [3, 8, 'tkd-kicks-side', 'right'],
    KICK_04: [14, 4, 'tkd-kicks-round', 'left'], KICK_05: [14, 7, 'tkd-kicks-side', 'left'],
    DEMO_01: [8, 4, 'tkd-demo', 'right'],
    FORM_01: [8, 7, 'tkd-forms', 'down'],
    FLEX_01: [9, 9, 'tkd-stretch', 'up'],
  },
  coach: [14, 10, 'up'],
  board: board('taekwondo', 'Patadas con las dos piernas sobre paos (frontal, circular y lateral), formas y flexibilidad. Cinturones con examen cuando toca: asistencia y técnica. Descalzos en el tatami.'),
});

export const DANCE_ROOM = academyRoom({
  academy: 'dance', pre: 'DANCE_', ambient: '#fbeef0',
  back: { location: 'vl-gym', spawn: 'dance', label: 'Volver a Velaria Club' },
  props: [
    ...[2, 5, 8, 11, 14].map((tx) => at('mirror', tx, 1)),
    at('yoga-mat', 15, 9),
  ],
  stations: {
    STEP_01: [4, 5, 'dance-steps', 'up'], STEP_02: [8, 5, 'dance-steps', 'up'], STEP_03: [12, 5, 'dance-steps', 'up'],
    CHOREO_01: [6, 8, 'dance-choreo', 'up'], CHOREO_02: [10, 8, 'dance-choreo', 'up'],
    FLEX_01: [15, 9, 'dance-stretch', 'up'],
  },
  coach: [15, 5, 'left'],
  board: board('dance', 'Pasos básicos, coreografía y estiramientos frente al espejo. Ropa cómoda; zapatillas limpias.'),
});

export const ACADEMY_ROOMS: readonly LocationDef[] = [MMA_ROOM, TKD_ROOM, DANCE_ROOM];

// ------------------------------------------------------------------ gente

/** Un alumno: de un ejercicio a otro, con su descanso y su trago de agua. */
const student = (pre: string, role: string, label: string, line: string, steps: readonly [string, string][]): VisitorRole => ({
  role, label, line, weight: 2,
  plan: [
    ...steps.map(([state, p]) => ({ state, points: [`${pre}${p}`], minutes: [7, 13] as const })),
    { state: 'REST', points: [`${pre}REST_`], minutes: [2, 4] as const },
    { state: 'DRINK', points: [`${pre}WATER`], minutes: [1, 2] as const, chance: 0.6 },
  ],
});

/**
 * Quién hay en cada sala. Como en el boxeo, la gente deja siempre un hueco al jugador (cupo − 1) y no se clona a
 * nadie; `regulars`: las caras fijas de la academia, las mismas de una clase a otra (systems/Crowd).
 */
const profile = (id: Discipline, pre: string, offers: string, coach: string, coachLine: string, roles: VisitorRole[], extra: StaffRole[] = [], coachLook?: string): PopulationProfile => ({
  place: ACADEMIES[id]!.location,
  bands: [[ACADEMIES[id]!.hours[0], 12, 'LOW'], [12, 17, 'LOW'], [17, 21, 'MEDIUM'], [21, ACADEMIES[id]!.hours[1], 'LOW']],
  weekday: [0, 0, 0, 0, 0, 0, -1],
  maxVisitors: ACADEMIES[id]!.capacity - 1,
  regulars: 8,
  staff: [{ service: 'gym-staff', label: coach, line: coachLine, points: [`${pre}COACH_01`], offers: offers as never, ...(coachLook ? { look: coachLook } : {}) }, ...extra],
  visitors: roles,
});

export const ACADEMY_PROFILES: readonly PopulationProfile[] = [
  profile('mma', 'MMA_', 'mma-coach', 'Rubén · entrenador', 'Primero la base: si te tiran, te levantas. Luego, todo lo demás.', [
    student('MMA_', 'mma_striking', 'Alumno al saco', 'Mano, mano, rodilla. Y vuelve a cubrirte.', [['BAG', 'BAG_'], ['FOOTWORK', 'FEET_']]),
    student('MMA_', 'mma_ground', 'Alumna en el tatami', 'En el suelo manda la cadera, no los brazos.', [['GROUND', 'GROUND_'], ['BAG', 'BAG_']]),
  ]),
  profile('taekwondo', 'TKD_', 'tkd-coach', 'Min-ji · maestra', 'La patada sale de la cadera. Y vuelve igual de rápido.', [
    student('TKD_', 'tkd_kicks', 'Alumno pateando el pao', 'Rodilla arriba, extiende, recoge. Y la otra pierna.', [['KICK', 'KICK_'], ['KICK', 'KICK_']]),
    student('TKD_', 'tkd_forms', 'Alumna con la forma', 'La forma entera sin mirar al espejo. Casi.', [['FORM', 'FORM_'], ['KICK', 'KICK_'], ['FLEX', 'FLEX_']]),
  ], [{ service: 'gym-staff', label: 'Dani · cinturón negro', look: 'dobok-negro', line: 'Mira la cadera: gira antes que la pierna. Y el pie de apoyo, quieto.', points: ['TKD_DEMO_01'] }], 'dobok-negro'),
  profile('dance', 'DANCE_', 'dance-coach', 'Lucía · profesora', 'Primero el ritmo en los pies; los brazos vienen solos.', [
    student('DANCE_', 'dance_steps', 'Alumna con los pasos', 'Cinco, seis, siete, ocho... y otra vez desde arriba.', [['STEP', 'STEP_'], ['CHOREO', 'CHOREO_']]),
    student('DANCE_', 'dance_choreo', 'Alumno en la coreografía', 'Me sé la mitad. La otra mitad la improviso con estilo.', [['CHOREO', 'CHOREO_'], ['FLEX', 'FLEX_']]),
  ]),
];
