// Sin Phaser: lo leen systems/Protest.ts, el gancho de consola de main.ts y scripts/check-protest.ts.
import type { TilePoint } from '../types/game.ts';

/**
 * Una concentración pacífica en una plaza (systems/Protest.ts): cuándo puede
 * pasar, cuánta gente viene, por dónde entra y dónde se queda. No es una pelea:
 * no comparte StreetEventDef.
 */
export interface ProtestDef {
  id: string;
  name: string;
  location: string;
  /** El centro de la plaza: el ancla del suceso. */
  center: TilePoint;
  /** Puntos con nombre (location.points) por donde llega y se va la gente. */
  entries: readonly string[];
  /** Horas [desde, hasta]: el montaje, el acto y la dispersión caben dentro. */
  window: readonly [number, number];
  /** Índices de systems/Calendar.WEEK (0 lunes … 6 domingo). */
  days: readonly number[];
  /** Probabilidad por día permitido, antes del carácter del barrio (districtIdentity.events). */
  chance: number;
  /** Tras una, ninguna en los `cooldownDays` días siguientes. */
  cooldownDays: number;
  maxPerWeek: number;
  crowd: readonly [number, number];
  /** Agentes de policía; el sistema nunca pasa de 3. */
  police: readonly [number, number];
  /** Lluvia (0–1) a la hora de empezar que la suspende. */
  cancelRain: number;
  /** Tiles sueltos de la losa: manifestantes y policía, sin pisar props ni puntos. */
  slots: readonly TilePoint[];
  policeSlots: readonly TilePoint[];
  /** Los puestos de `slots` que llevan pancarta, separados para que no se solapen (sólo quien está en uno la lleva). */
  bannerSlots: readonly TilePoint[];
  banners: readonly string[];
  /** Versión corta de cada lema que no cabe en la pancarta (2 líneas de 16 caracteres, systems/Protest.bannerLines). */
  bannerShort: Readonly<Record<string, string>>;
  /**
   * Tramo de calzada (tiles) que se corta mientras dura (de montaje a dispersión): el tráfico para ante él como ante
   * un semáforo en rojo fijo (Traffic.close). Sin pisar el paso de cebra, y lo bastante lejos para que el coche
   * detenido no espere encima de él.
   */
  closure?: { tx: number; ty: number; w: number; h: number };
}

const t = (tx: number, ty: number): TilePoint => ({ tx, ty });

export const PROTESTS: readonly ProtestDef[] = [
  {
    id: 'plaza-mercado-vecinal',
    name: 'Concentración vecinal',
    location: 'casco-antiguo',
    center: t(21, 19),
    entries: ['EDGE_CAS_NW', 'EDGE_CAS_NE', 'EDGE_CAS_MW', 'EDGE_CAS_ME', 'EDGE_CAS_SW', 'EDGE_CAS_SE'],
    window: [17, 20],
    // Viernes y sábado.
    days: [4, 5],
    // Por viernes o sábado; con el carácter del barrio (events 0,8), 0,144: una cada cinco o seis semanas.
    chance: 0.18,
    // Dos semanas: nunca más de cuatro en ocho semanas.
    cooldownDays: 13,
    maxPerWeek: 1,
    crowd: [8, 14],
    police: [2, 3],
    cancelRain: 0.55,
    // A ambos lados de la bajada central (columnas 19–23, libres para el carrito de limpieza), lejos de
    // bancos, árboles y mesas (un tile de margen) y fuera de las filas 19–20, por donde van los puntos de estar.
    // Agrupados alrededor del centro (21,19): 7 al oeste (x16–18) y 9 al este (x24–27).
    slots: [
      t(18, 18), t(16, 21), t(17, 21), t(18, 21), t(16, 22), t(17, 22), t(18, 22),
      t(24, 18), t(24, 21), t(25, 21), t(26, 21), t(27, 21), t(24, 22), t(25, 22), t(26, 22), t(27, 22),
    ],
    // Pancartas sólo aquí (44 px, casi tres tiles): separadas tres tiles en la misma fila y en filas no contiguas (18
    // y 21), para que no se pisen. Son puestos de `slots`.
    bannerSlots: [t(18, 18), t(24, 18), t(16, 21), t(24, 21), t(27, 21)],
    // El primero, en la acera junto al corte de calzada (closure, x28–30): con police[0] ≥ 2 siempre hay quien lo explique.
    policeSlots: [t(28, 14), t(18, 23), t(24, 23)],
    banners: [
      'Vivienda asequible para quien vive aquí',
      'Alquileres que se puedan pagar',
      'Más sombra, más parques',
      'Aceras sin escalones',
      'Metro y autobús cada pocos minutos',
      'Bancos y fuentes en cada plaza',
      'El barrio se cuida entre todos',
    ],
    bannerShort: {
      'Vivienda asequible para quien vive aquí': 'Vivienda asequible',
      'Metro y autobús cada pocos minutos': 'Metro y bus frecuentes',
      'El barrio se cuida entre todos': 'Cuidemos el barrio',
    },
    // Calle Mayor (calzada en x0–43, filas 11–13), al este del paso de cebra (x20–22). tx 28 y no 24: el que viene
    // del oeste para a la izquierda del tramo, y el más largo de una calle residencial (66 px) no llega a la cebra.
    closure: { tx: 28, ty: 11, w: 3, h: 3 },
  },
];
