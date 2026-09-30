import type { Facing, TilePoint } from '../types/game.ts';

/**
 * Cosas que pasan en la ciudad aunque no mires: sitios escondidos donde,
 * algunas noches, se junta gente. Un evento nuevo es una entrada aquí; quién
 * viene, cuándo y qué hace lo decide systems/StreetEvents.ts, y cómo se ve,
 * world/StreetEventView.ts. Ninguno tiene marca en el mapa: se encuentran
 * andando.
 *
 * Todo sale del reloj y de una semilla por noche: la misma noche es siempre la
 * misma (volver a pasar la encuentra igual) y noches distintas, distintas.
 */

export interface EventSlot extends TilePoint {
  /** Hacia dónde mira quien está ahí, si no es hacia el centro. */
  facing?: Facing;
}

/** Perfiles explícitos: nunca se deducen edad, género o nivel del pelo o de la ropa. */
export interface FighterProfile {
  look: string;
  nickname: string;
  age: number;
  gender: 'man' | 'woman';
  /** Categoría de tamaño y nivel físico: 1 ligero/iniciación, 2 medio, 3 fuerte/experimentado. */
  body: 1 | 2 | 3;
  physical: 1 | 2 | 3;
}

export const FIGHTER_PROFILES: readonly FighterProfile[] = [
  { look: 'pasajero-4', nickname: 'Muro', age: 27, gender: 'man', body: 2, physical: 2 },
  { look: 'pasajero-11', nickname: 'Sur', age: 29, gender: 'man', body: 2, physical: 2 },
  { look: 'pasajero-14', nickname: 'Cobre', age: 24, gender: 'man', body: 2, physical: 1 },
  { look: 'pasajero-17', nickname: 'Norte', age: 32, gender: 'man', body: 3, physical: 3 },
  { look: 'pasajero-24', nickname: 'Humo', age: 26, gender: 'man', body: 3, physical: 2 },
  { look: 'pasajero-12', nickname: 'Lince', age: 25, gender: 'woman', body: 2, physical: 2 },
  { look: 'pasajero-15', nickname: 'Ámbar', age: 28, gender: 'woman', body: 2, physical: 2 },
  { look: 'pasajero-18', nickname: 'Roca', age: 31, gender: 'woman', body: 3, physical: 3 },
  { look: 'pasajero-22', nickname: 'Chispa', age: 23, gender: 'woman', body: 2, physical: 1 },
  { look: 'pasajero-23', nickname: 'Trueno', age: 30, gender: 'woman', body: 3, physical: 2 },
];

export interface StreetEventDef {
  id: string;
  type: 'clandestine-fight';
  location: string;
  name: string;
  /** Dónde pasa, en tiles: dentro (o a un tile) el jugador lo tiene delante. */
  area: { tx: number; ty: number; w: number; h: number };
  /** Donde se planta el jugador a mirar: ahí sale la E. */
  vantage: TilePoint;
  /** Con techo, la lluvia no lo suspende. */
  covered: boolean;
  /** Puntos con nombre por los que llega y se va la gente (bordes del barrio). */
  entries: readonly string[];
  /** Los dos que pelean, de perfil y mirándose: el primero mira a la derecha. */
  fighters: readonly [EventSlot, EventSlot];
  /** Participantes adultos identificados, con emparejamiento compatible. */
  fighterRoster: readonly FighterProfile[];
  /** Organiza las apuestas, fuera de la pelea y sin cerrar el callejón. */
  bookmaker?: EventSlot;
  /** El corro: huecos sueltos alrededor, sin cerrar el paso. */
  spectators: readonly EventSlot[];
  /** Quien mira desde lejos, sin meterse. */
  watchers: readonly EventSlot[];
  /** El que vigila la boca del callejón. */
  lookout?: EventSlot;
  /** [desde, hasta) en horas; si hasta < desde, cruza la medianoche. */
  window: readonly [number, number];
  /** Días de la semana en que puede haber (0 lunes … 6 domingo). */
  days: readonly number[];
  /** Probabilidad de que haya una de esas noches. */
  chance: number;
  /** Corro [mín, máx] en una noche templada y seca. */
  crowd: readonly [number, number];
  rounds: readonly [number, number];
  /** Probabilidad de que el vigía avise y todo el mundo se vaya antes de tiempo. */
  raid: number;
  weather: {
    /** Con esta lluvia o más (0–1), fuera no hay pelea. */
    cancelRain: number;
    /** Con lluvia floja (más de 0,08), menos gente (factor). */
    lightRainCrowd: number;
    /** Por debajo de estos grados, menos gente (factor); la ropa de abrigo la pone el tiempo. */
    coldBelow: number;
    coldCrowd: number;
    /** Por encima, más gente (cuántos más). */
    warmAbove: number;
    warmExtra: number;
  };
  /** Lo que se lee al hablar con alguien del corro, según el momento, y lo que ve el jugador al llegar. */
  lines: {
    gathering: readonly string[];
    fight: readonly string[];
    dispersing: readonly string[];
    lookout: readonly string[];
    arrive: Readonly<Record<'gathering' | 'fight' | 'break' | 'dispersing', string>>;
  };
}

export const STREET_EVENTS: readonly StreetEventDef[] = [
  {
    id: 'patio-mayor',
    type: 'clandestine-fight',
    location: 'district',
    name: 'Patio de atrás',
    // El patio detrás de Mayor 9 y Mayor 15, y el callejón de servicio que baja a la Mayor.
    area: { tx: 68, ty: 0, w: 18, h: 4 },
    vantage: { tx: 75, ty: 3 },
    covered: false,
    entries: ['EDGE_MAYOR_E', 'EDGE_MAYOR_W'],
    fighters: [{ tx: 79, ty: 2, facing: 'right' }, { tx: 81, ty: 2, facing: 'left' }],
    fighterRoster: FIGHTER_PROFILES,
    bookmaker: { tx: 74, ty: 1, facing: 'right' },
    spectators: [
      // Detrás de los dos, en columnas alternas; delante, sólo a los lados: el hueco de delante queda libre y se les ve pelear.
      { tx: 78, ty: 1 }, { tx: 80, ty: 1 }, { tx: 82, ty: 1 }, { tx: 77, ty: 1 }, { tx: 83, ty: 1 },
      { tx: 76, ty: 2 }, { tx: 84, ty: 2 }, { tx: 77, ty: 3 }, { tx: 83, ty: 3 }, { tx: 76, ty: 3 }, { tx: 84, ty: 3 },
    ],
    watchers: [{ tx: 71, ty: 2 }, { tx: 75, ty: 6, facing: 'up' }],
    lookout: { tx: 75, ty: 14, facing: 'down' },
    window: [21, 3],
    // Jueves a domingo, como la Órbita: la noche del barrio.
    days: [3, 4, 5, 6],
    chance: 0.45,
    crowd: [5, 8],
    rounds: [2, 3],
    raid: 0.15,
    weather: { cancelRain: 0.55, lightRainCrowd: 0.6, coldBelow: 8, coldCrowd: 0.75, warmAbove: 20, warmExtra: 3 },
    lines: {
      gathering: ['No saques el móvil. Aquí no hay cartel ni entrada.', 'Son mayores, misma categoría. El de la libreta comprueba las parejas.', 'Unos miran; otros doblan un billete y eligen un lado.'],
      fight: ['¡Venga! Esa sí que ha llegado.', 'No te pongas tan cerca. Deja libre el paso.', 'Se ha agachado justo a tiempo.', 'Ahora está contra las cuerdas... bueno, contra las cajas.'],
      dispersing: ['Se acabó por hoy. Mejor no quedarse.', 'La próxima, el jueves. O no. Ya se sabrá.'],
      lookout: ['Yo no he visto nada. Tú tampoco.', 'Si viene alguien, silbo. Tú a lo tuyo.'],
      arrive: {
        gathering: 'Al fondo del callejón, gente esperando en corro. Hablan bajo.',
        fight: 'Dos se enfrentan en el patio. Un corro los anima; alguien apunta apuestas en una libreta.',
        break: 'Entre asalto y asalto: los dos respiran y el corro comenta.',
        dispersing: 'El corro se deshace. Alguien recoge los vasos.',
      },
    },
  },
];
