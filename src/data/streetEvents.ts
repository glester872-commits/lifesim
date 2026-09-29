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
      gathering: ['Todavía no ha empezado. Espera, que ahora viene el otro.', 'Tú no eres de aquí, ¿no? Tranquilo, mientras no saques el móvil.'],
      fight: ['¡Venga, venga! Uy, esa ha dolido.', 'No te pongas tan cerca, que no es un espectáculo.', 'El del gris lleva dos noches ganando.'],
      dispersing: ['Se acabó por hoy. Mejor no quedarse.', 'La próxima, el jueves. O no. Ya se sabrá.'],
      lookout: ['Yo no he visto nada. Tú tampoco.', 'Si viene alguien, silbo. Tú a lo tuyo.'],
      arrive: {
        gathering: 'Al fondo del callejón, gente esperando en corro. Hablan bajo.',
        fight: 'En el patio de atrás, un corro alrededor de dos que pelean. Nadie grita demasiado.',
        break: 'Entre asalto y asalto: los dos respiran y el corro comenta.',
        dispersing: 'El corro se deshace. Alguien recoge los vasos.',
      },
    },
  },
];
