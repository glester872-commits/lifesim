import type { Facing, LocationDef, PointDef, PropKind, PropPlacement } from '../types/game.ts';
import { PROPS } from '../world/tiles.ts';

/**
 * Muebles para sentarse: bancos, sillas, taburetes, sofás, sillones. Un
 * asiento no se escribe a mano: lo define su mueble. Cada tile de la fila base
 * del mueble es una plaza (un banco de dos tiles, dos plazas; un sofá, dos), y
 * cada plaza es un punto `kind: 'seat'` encima de ese tile, con su ocupación
 * independiente.
 *
 * Lo usan igual el jugador (scenes/WorldScene) y la gente (systems/Crowd,
 * StreetLife, Characters, MetroSystem): el mismo sitio, la misma orientación,
 * la misma altura de asiento y la misma reserva. Un mueble nuevo es una entrada
 * aquí, su PropKind en world/tiles.ts (con `mount`) y su dibujo.
 */

/** Lo que se hace sentado sin nada que hacer: entities/Character lo anima. */
export type SeatIdle = 'rest' | 'phone' | 'watch' | 'smoke' | 'read' | 'talk';

export interface SeatDef {
  name: string;
  /** Hacia dónde se mira sentado. Sin ella (un taburete), la que diga el punto. */
  facing?: Facing;
  /** Px que sube el cuerpo sobre la pose de sentado: un taburete es más alto que una silla. */
  lift?: number;
  /** Lo que se le ve hacer a quien no tiene otra cosa: por semilla, uno de estos. */
  idle: readonly SeatIdle[];
}

const INDOOR: readonly SeatIdle[] = ['rest', 'phone', 'read', 'talk'];
const STREET: readonly SeatIdle[] = ['rest', 'phone', 'watch', 'smoke', 'read'];

export const SEATS: Partial<Record<PropKind, SeatDef>> = {
  // Banco de calle con el respaldo al norte: se sienta mirando al sur. 'bench-up', al revés.
  bench: { name: 'Banco', facing: 'down', idle: STREET },
  'bench-up': { name: 'Banco', facing: 'up', idle: STREET },
  'plaza-bench': { name: 'Banco', facing: 'down', idle: STREET },
  sofa: { name: 'Sofá', facing: 'down', idle: INDOOR },
  // Sillas de mesa, una por orientación (el respaldo va detrás de quien se sienta).
  'chair-up': { name: 'Silla', facing: 'up', idle: INDOOR },
  'chair-down': { name: 'Silla', facing: 'down', idle: INDOOR },
  'chair-left': { name: 'Silla', facing: 'left', idle: INDOOR },
  'chair-right': { name: 'Silla', facing: 'right', idle: INDOOR },
  // Taburete de barra: sin respaldo, mira a donde diga su punto y está más alto.
  stool: { name: 'Taburete', lift: 4, idle: ['rest', 'phone', 'talk'] },
  'barber-chair': { name: 'Sillón', facing: 'up', idle: ['rest'] },
  'tattoo-chair': { name: 'Camilla', facing: 'up', idle: ['rest'] },
};

/** El mueble para sentarse que ocupa ese tile, si alguno. */
export function furnitureAt(loc: LocationDef, tx: number, ty: number): { placement: PropPlacement; def: SeatDef } | undefined {
  for (const placement of loc.props) {
    const def = SEATS[placement.kind];
    if (def && placement.ty === ty && tx >= placement.tx && tx < placement.tx + (PROPS[placement.kind].tilesWide ?? 1)) return { placement, def };
  }
  return undefined;
}

/** La silla en la que se sienta quien mira hacia ahí. */
export const chairFacing = (facing: Facing): PropKind => `chair-${facing}` as PropKind;

/**
 * Los muebles de unos asientos de mesa o de barra, sacados de sus puntos: una
 * silla (o un taburete) debajo de cada uno, mirando hacia donde mira el punto.
 * Así una mesa nueva es su punto, y la silla sale sola y bien orientada.
 */
export function seatsFurniture(points: Readonly<Record<string, PointDef>>, kind: 'chair' | 'stool' = 'chair'): PropPlacement[] {
  return Object.values(points)
    .filter((p) => p.kind === 'seat')
    .map((p) => ({ kind: kind === 'stool' ? 'stool' : chairFacing(p.facing ?? 'down'), tx: p.tx, ty: p.ty }));
}
