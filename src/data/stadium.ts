import type { LocationDef, PointDef, PropPlacement } from '../types/game.ts';
import type { PopulationProfile } from './population.ts';
import { ARENA_CLUB, ARENA_MATCHES } from './cityEvents.ts';
import { at, many, p } from './interiors.ts';

/**
 * El Estadio del Halcón por dentro (data/arena.ts, la fachada; systems/Tickets, las reglas de la entrada). No es el
 * estadio entero: es la parte a la que se llega con una entrada de Tribuna. La Puerta 3 da al vestíbulo; por la boca
 * del centro se sube a la grada, tres filas de asientos con su escalera, y desde ahí se ve el césped. El césped no se
 * pisa.
 *
 *   y 0–6   el césped, con la línea de banda abajo
 *   y 7     las vallas de publicidad (turquesa y naranja): de la grada no se baja al campo
 *   y 8–16  la grada: tres filas de asientos (y 8, 11, 14), cada una con un pasillo de dos detrás (se pasa sin
 *           rozar los asientos); la escalera baja por el centro (x 11–12) y hay paso por los dos lados (x 1 y 22)
 *   y 17    el muro de la grada con la boca de acceso (la escalera)
 *   y 18–21 el vestíbulo: el acomodador, papeleras y el cartel de la grada
 *   y 22    la Puerta 3 (se sale a la explanada, al pie de los tornos)
 */
const W = 24;
const H = 24;
const STAIRS: readonly number[] = [11, 12];
/** Las filas de asientos (y) y sus columnas: nueve a cada lado de la escalera. */
const SEAT_ROWS = [8, 11, 14] as const;
const SEAT_COLS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 18, 19, 20, 21] as const;

function ground(): string[] {
  const rows: string[] = [];
  for (let y = 0; y < H; y++) {
    let r = '';
    for (let x = 0; x < W; x++) {
      const edge = x === 0 || x === W - 1;
      if (y <= 6) r += edge ? 'W' : y === 6 ? 'J' : 'G';
      else if (y === 7) r += edge ? 'W' : 'A';
      else if (y <= 16) r += edge ? 'W' : STAIRS.includes(x) ? 'Y' : 'O';
      else if (y === 17) r += STAIRS.includes(x) ? 'Y' : 'W';
      else if (y <= 21) r += edge ? 'W' : 't';
      else if (y === 22) r += x === 12 ? 'D' : 'W';
      else r += 'W';
    }
    rows.push(r);
  }
  return rows;
}

/** Cada asiento: su punto, su fila (1 la de delante) y su número (de izquierda a derecha mirando al campo). */
export interface StadiumSeat {
  point: string;
  row: number;
  number: number;
}

export const STADIUM_SEATS: readonly StadiumSeat[] = SEAT_ROWS.flatMap((_, r) =>
  SEAT_COLS.map((__, i) => ({ point: `ESTADIO_SEAT_F${r + 1}_${String(i + 1).padStart(2, '0')}`, row: r + 1, number: i + 1 })),
);

const SEAT_POINTS: Record<string, PointDef> = Object.fromEntries(
  SEAT_ROWS.flatMap((y, r) => SEAT_COLS.map((x, i) => [STADIUM_SEATS[r * SEAT_COLS.length + i].point, p(x, y, 'seat', 'up')] as const)),
);

const PROPS: readonly PropPlacement[] = [
  ...SEAT_ROWS.flatMap((y) => SEAT_COLS.map((x) => at('stadium-seat', x, y))),
  ...many('bin', [[3, 19], [20, 19]]),
  ...many('ad-panel', [[6, 18], [17, 18]]),
];

export const STADIUM: LocationDef = {
  id: 'ar-estadio',
  name: 'Estadio del Halcón · Tribuna',
  kind: 'interior',
  ground: ground(),
  props: PROPS,
  ambient: '#eef3f6',
  venue: 'estadio-halcon',
  // El partido se juega en el césped de arriba (y 0–6, sin la franja de banda): systems/MatchPlay y world/MatchView.
  pitch: { tx: 1, ty: 0, w: 22, h: 6.5 },
  portals: [{ id: 'exit', tx: 12, ty: 22, label: 'Salir a la explanada', to: { location: 'arena', spawn: 'ar-estadio' } }],
  spawns: { entry: { tx: 12, ty: 21, facing: 'up' } },
  npcs: [],
  inspects: [
    { tx: 14, ty: 17, name: 'Acceso a grada', lines: ['«Tribuna · Filas 1 a 3». La fila y el asiento vienen en la entrada; los números van de izquierda a derecha mirando al campo.'] },
  ],
  points: {
    ESTADIO_EXIT: p(12, 21, 'exit', 'up'),
    ESTADIO_STEWARD_01: p(10, 19, 'work', 'down'),
    ...SEAT_POINTS,
  },
};

/**
 * Las reglas de la entrada (systems/Tickets). Los tiempos son minutos desde el saque y salen de las fases del partido
 * (data/cityEvents.ts): las puertas abren con la llegada de la afición, se puede entrar tarde hasta que acaba el
 * partido y el estadio se vacía al acabar la salida.
 */
export interface VenueDef {
  id: string;
  name: string;
  /** El equipo de casa, como se anuncia. */
  home: string;
  /** La localización de dentro (la que lleva `venue`). */
  interior: string;
  /** Por dónde se entra. */
  gate: string;
  /** A dónde se sale, y a dónde vuelve quien carga una partida dentro sin derecho a estar. */
  exit: { location: string; spawn: string };
  sector: string;
  /** Precio de la única entrada que se vende (general de Tribuna). */
  price: number;
  /** Entradas a la venta por partido: tantas como asientos tiene la grada (lo comprueba scripts/check-stadium.ts). */
  capacity: number;
  /** Asientos en el orden en que se venden: de la fila de delante a la de atrás, del centro a los lados. */
  seats: readonly StadiumSeat[];
  /** Horario de la taquilla [abre, cierra] en horas; el día de partido no cierra hasta que acaba el plazo de entrada. */
  sales: readonly [number, number];
  /** Cuántos días vista se vende. */
  horizon: number;
  /** Puertas abiertas, último acceso y cierre del estadio, en minutos desde el saque. */
  doors: number;
  lastEntry: number;
  closes: number;
}

const centre = (n: number): number => Math.abs(n - (SEAT_COLS.length + 1) / 2);

export const ESTADIO_HALCON: VenueDef = {
  id: 'estadio-halcon',
  name: 'Estadio del Halcón',
  home: ARENA_CLUB.short,
  interior: 'ar-estadio',
  gate: 'Puerta 3 · Tribuna',
  exit: { location: 'arena', spawn: 'ar-estadio' },
  sector: 'Tribuna',
  price: 25,
  capacity: 54,
  seats: [...STADIUM_SEATS].sort((a, b) => a.row - b.row || centre(a.number) - centre(b.number) || a.number - b.number),
  sales: [10, 21],
  horizon: 7,
  doors: ARENA_MATCHES.phases.arrival[0],
  lastEntry: ARENA_MATCHES.phases.live[1],
  closes: ARENA_MATCHES.phases.leaving[1],
};

export const VENUES: Readonly<Record<string, VenueDef>> = { [ESTADIO_HALCON.id]: ESTADIO_HALCON };

/**
 * La gente de la grada: sólo en día de partido. Llega con las puertas, llena la grada durante el partido y se va al
 * pitido final. Cada uno a un asiento libre: el de la entrada del jugador no lo coge nadie (WorldScene lo reclama
 * mientras su entrada vale).
 */
export const STADIUM_PROFILE: PopulationProfile = {
  place: 'ar-estadio',
  bands: [],
  weekday: [0, 0, 0, 0, 0, 0, 0],
  match: { arrival: 2, live: 3, leaving: 1, after: -1 },
  fans: 0.85,
  maxVisitors: 20,
  staff: [
    { service: 'security', label: 'Acomodador', line: 'Fila y asiento, en tu entrada. Se sube por la escalera del centro.', points: ['ESTADIO_STEWARD_'] },
  ],
  visitors: [
    { role: 'fan', label: 'Aficionado', line: '¡Hoy se gana, ya verás!', weight: 3, party: [1, 3], plan: [{ state: 'WATCH', points: ['ESTADIO_SEAT_'], minutes: [90, 140] }] },
    { role: 'fan-early', label: 'Aficionada', line: 'Vengo pronto para ver calentar a los míos.', weight: 1, plan: [{ state: 'WATCH', points: ['ESTADIO_SEAT_'], minutes: [120, 170] }] },
  ],
};
