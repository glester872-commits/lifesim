import type { TilePoint } from '../types/game.ts';
import type { Level } from '../config/population.ts';

/**
 * DEC-02 · Distribución de la nave de Decathlon (data/decathlon.ts) como datos: departamentos del plano
 * (design/Decathlon/217426dc…png), pasillos con su ancho mínimo, cajas con su cola y su salida, y la puerta.
 * Sólo datos y tipos: data/decathlon.ts deriva de aquí los pasillos, los mostradores, los puntos de caja y los turnos.
 */

/** Rectángulo en tiles, extremos incluidos. */
export interface Rect { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }

export type Zone = 'NW' | 'N' | 'NE' | 'C' | 'SW' | 'SE';

export interface Department { readonly id: string; readonly name: string; readonly zone: Zone; readonly sectorIds: readonly string[] }
export interface Aisle { readonly id: string; readonly name: string; readonly rect: Rect; readonly minWidth: number }
export interface Checkout {
  readonly id: string;
  readonly kind: 'staffed' | 'self';
  /** Donde se para quien paga. */
  readonly till: TilePoint;
  /** Quien cobra, al otro lado del mostrador. Sin él, autopago. */
  readonly staff?: TilePoint;
  /** De la primera a la última plaza de la cola. */
  readonly queue: readonly TilePoint[];
  /** Por dónde se va quien ya ha pagado, hacia el pasillo de salida. */
  readonly exit: TilePoint;
  /**
   * Cuándo está abierta: días (0 lunes, 6 domingo), afluencia mínima y turno en horas [entra, sale) del cajero
   * (systems/Crowd.staffOnShift). Sin él, siempre.
   */
  readonly open?: { readonly days?: readonly number[]; readonly minLevel?: Level; readonly hours?: readonly [number, number] };
}
export interface StoreLayout {
  readonly version: 1;
  readonly storeId: string;
  readonly departments: readonly Department[];
  readonly aisles: readonly Aisle[];
  readonly checkouts: readonly Checkout[];
  readonly entrances: readonly { readonly id: string; readonly tile: TilePoint }[];
  readonly exits: readonly { readonly id: string; readonly tile: TilePoint }[];
}

const R = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x0, y0, x1, y1 });
const t = (tx: number, ty: number): TilePoint => ({ tx, ty });

/** Fila de quien paga en las cajas; la cola sube dos filas, la salida baja al pasillo. */
const TILL_Y = 46;
const WEEKEND = [4, 5, 6] as const;
/** Turnos (AFLUENCIA-DEC02): apertura, intermedio y cierre. La caja 1 no lleva: cubre todo el horario. */
const OPENING = [9, 15.5] as const;
const MIDDLE = [12, 18] as const;
const CLOSING = [14.5, 21] as const;
const STAFFED_OPEN: readonly (Checkout['open'] | undefined)[] = [
  undefined,
  { minLevel: 'LOW', hours: OPENING },
  { minLevel: 'MEDIUM', hours: CLOSING },
  { minLevel: 'MEDIUM', days: WEEKEND, hours: MIDDLE },
  { minLevel: 'HIGH', days: WEEKEND, hours: CLOSING },
  { minLevel: 'VERY_HIGH', hours: CLOSING },
];

/** Seis cajas con cajero bajo natación, a la izquierda de la puerta: cliente (c), mostrador (c+1), cajero (c+2). */
const STAFFED: readonly Checkout[] = [47, 50, 53, 56, 59, 62].map((c, i): Checkout => ({
  id: `caja-${i + 1}`, kind: 'staffed',
  till: t(c, TILL_Y), staff: t(c + 2, TILL_Y),
  queue: [t(c, TILL_Y - 1), t(c, TILL_Y - 2)],
  exit: t(c, TILL_Y + 1),
  ...(STAFFED_OPEN[i] ? { open: STAFFED_OPEN[i] } : {}),
}));

/** Autopago: la máquina debajo de quien paga, sin personal. Decorado hasta DEC-04 (no hay cobro por caja). */
const SELF: readonly Checkout[] = [
  { id: 'auto-1', kind: 'self', till: t(42, TILL_Y), queue: [t(42, TILL_Y - 1), t(42, TILL_Y - 2)], exit: t(41, TILL_Y) },
  { id: 'auto-2', kind: 'self', till: t(44, TILL_Y), queue: [t(44, TILL_Y - 1), t(44, TILL_Y - 2)], exit: t(45, TILL_Y), open: { minLevel: 'MEDIUM' } },
];

export const DECATHLON_LAYOUT: StoreLayout = {
  version: 1,
  storeId: 'decathlon-tienda',
  departments: [
    { id: 'dep-running-raqueta', name: 'Running y raqueta', zone: 'NW', sectorIds: ['raqueta-padel', 'running', 'sportswear', 'probadores', 'raqueta'] },
    { id: 'dep-montana-camping-agua', name: 'Montaña, camping y agua', zone: 'N', sectorIds: ['montana-jr', 'montana-mujer', 'montana-hombre', 'camping', 'camping-2', 'agua', 'kayak'] },
    { id: 'dep-ciclismo', name: 'Ciclismo', zone: 'NE', sectorIds: ['segunda-vida', 'ciclismo'] },
    { id: 'dep-calzado-mochilas-equip', name: 'Calzado, mochilas y equipamiento', zone: 'C', sectorIds: ['calzado-mujer', 'calzado-hombre', 'escalada', 'accesorios', 'mochilas', 'minoritarios', 'caza', 'pesca', 'salud', 'golf', 'equitacion'] },
    { id: 'dep-futbol-fitness-colectivos', name: 'Fútbol, fitness y colectivos', zone: 'SW', sectorIds: ['fitness-mujer', 'fitness-mat', 'fitness-hombre', 'kids', 'roller', 'baloncesto', 'futbol', 'colectivos'] },
    { id: 'dep-natacion', name: 'Natación', zone: 'SE', sectorIds: ['natacion'] },
  ],
  aisles: [
    { id: 'norte', name: 'Pasillo norte', rect: R(9, 11, 62, 13), minWidth: 3 },
    { id: 'sur', name: 'Pasillo sur', rect: R(9, 29, 62, 31), minWidth: 3 },
    { id: 'izquierdo', name: 'Lateral izquierdo', rect: R(9, 11, 10, 40), minWidth: 2 },
    { id: 'derecho', name: 'Lateral derecho', rect: R(61, 2, 62, 43), minWidth: 2 },
    { id: 'cajas-acceso', name: 'Acceso a cajas', rect: R(1, 41, 74, 43), minWidth: 3 },
    { id: 'transversal', name: 'Transversal', rect: R(11, 21, 60, 22), minWidth: 2 },
    { id: 'escalada', name: 'Corte de escalada', rect: R(30, 14, 31, 28), minWidth: 2 },
    { id: 'camping', name: 'Corte de camping', rect: R(45, 14, 46, 28), minWidth: 2 },
    { id: 'kayak', name: 'Paso del kayak', rect: R(26, 32, 27, 40), minWidth: 2 },
    { id: 'natacion', name: 'Paso de natación', rect: R(48, 32, 50, 40), minWidth: 2 },
    // Debajo de las cajas, hasta la puerta. Empieza en x 45: las máquinas de autopago (42 y 44, fila 47) quedan fuera.
    { id: 'salida', name: 'Salida', rect: R(45, 47, 66, 49), minWidth: 3 },
  ],
  checkouts: [...STAFFED, ...SELF],
  // Una sola puerta automática, de entrada y salida (portal 'exit' de data/decathlon.ts).
  entrances: [{ id: 'entrada-clientes', tile: t(67, 50) }],
  exits: [{ id: 'salida-cajas', tile: t(67, 50) }],
};
