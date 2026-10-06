// Sin Phaser: lo usan scenes/WorldScene (el bucle de E), ui y scripts/check-interaction.ts.
import { INTERACT_RADIUS, TILE } from '../config/constants.ts';
import { doorRow } from './LocationSystem.ts';
import { TILES } from '../world/tiles.ts';
import type { Facing, LocationDef, Vec2 } from '../types/game.ts';

/**
 * Las reglas de «qué se me ofrece ahora» en un solo sitio. WorldScene sólo
 * reúne a los candidatos (personas, puertas, máquinas, asientos...) y esto
 * decide, igual para todos y sin depender del orden en que se crearon:
 *
 *   1. Alcance: INTERACT_RADIUS (px) desde el cuerpo del jugador, el mismo para todo.
 *   2. Paredes: no se ofrece nada que quede al otro lado de una pared o fachada
 *      (el agua y el muelle se ven a través; los muebles y barras no estorban:
 *      se habla por encima del mostrador).
 *   3. Elección: gana el que menos puntúa = distancia, con una pequeña ventaja
 *      para lo que se tiene delante (hacia donde mira el jugador).
 *   4. Empate (misma franja de `tie` px): manda el tipo (PRIORITY) y, si aún
 *      empatan, el id; nunca el orden de llegada.
 *   5. Estabilidad: el que ya se ofrecía se mantiene mientras no lo supere otro
 *      por más de STICKY px, así el aviso no parpadea entre dos cosas pegadas.
 */
export const INTERACTION = {
  range: INTERACT_RADIUS,
  /** Ventaja en px de lo que está delante, al elegir. */
  frontBonus: 4,
  /** Lo que tiene que ganar otro candidato al que ya se ofrece para quitarle el puesto. */
  sticky: 3,
  /** Anchura (px) de la franja en que dos candidatos cuentan como igual de cerca. */
  tie: 1.5,
} as const;

export type InteractKind = 'portal' | 'npc' | 'terminal' | 'rack' | 'spot' | 'station' | 'court' | 'seat' | 'inspect' | 'event';

/** Quién gana en un empate: salir y entrar primero, luego personas, luego lo que se usa, luego sentarse, y lo que sólo se mira, lo último. */
export const PRIORITY: Readonly<Record<InteractKind, number>> = {
  portal: 0,
  npc: 1,
  terminal: 2,
  rack: 3,
  spot: 4,
  station: 5,
  court: 6,
  seat: 7,
  inspect: 8,
  event: 9,
};

export interface Candidate {
  /** Estable entre frames y único: desempata sin depender del orden de la lista. */
  id: string;
  kind: InteractKind;
  x: number;
  y: number;
}

const FORWARD: Readonly<Record<Facing, Vec2>> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

/** Lo que se ve a través: el agua y el muelle; el resto de terreno sólido y las fachadas, no. */
const SEE_THROUGH = new Set(['a', 'q']);

const opaque = new Map<string, boolean[][]>();
/** Tiles que tapan la vista y el paso: terreno sólido (menos agua) y huella de edificios (menos su puerta). */
export function opaqueMask(loc: LocationDef): boolean[][] {
  let m = opaque.get(loc.id);
  if (m) return m;
  m = loc.ground.map((row) => [...row].map((ch) => (TILES[ch]?.solid ?? true) && !SEE_THROUGH.has(ch)));
  for (const b of loc.buildings ?? []) {
    for (let y = b.ty; y < b.ty + b.h; y++) for (let x = b.tx; x < b.tx + b.w; x++) if (m[y]?.[x] !== undefined) m[y][x] = true;
    if (b.doorX !== undefined && b.front) m[doorRow(b)][b.doorX] = false;
  }
  opaque.set(loc.id, m);
  return m;
}

/**
 * ¿Hay una pared entre el jugador y el objetivo? Mira cada 2 px del tramo,
 * sin contar el tile del objetivo (una cartelera o un neón vive en la pared) ni
 * donde está el jugador: quien se pega a una puerta o a un cartel no se bloquea a sí mismo.
 */
export function wallBetween(loc: LocationDef, from: Vec2, to: Vec2): boolean {
  const mask = opaqueMask(loc);
  const tile = (v: Vec2): [number, number] => [Math.floor(v.x / TILE), Math.floor(v.y / TILE)];
  const [ax, ay] = tile(from);
  const [bx, by] = tile(to);
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 2));
  for (let i = 0; i <= steps; i++) {
    const [tx, ty] = tile({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps });
    if ((tx === ax && ty === ay) || (tx === bx && ty === by)) continue;
    if (mask[ty]?.[tx]) return true;
  }
  return false;
}

export interface PickOptions<T extends Candidate> {
  /** Hacia dónde mira el jugador: lo de delante gana a lo de la espalda. */
  facing?: Facing;
  /** El que se ofrecía en el frame anterior, para no parpadear. */
  current?: T | null;
  /** Sentado o en otro estado en que sólo algunos tipos valen. */
  allow?: (c: T) => boolean;
  /** ¿Lo tapa una pared? (WorldScene lo cierra sobre la localización.) */
  blocked?: (c: T) => boolean;
}

/** Distancia desde el jugador, restada la ventaja de tenerlo delante. Menos es mejor. */
function score(origin: Vec2, c: Candidate, facing: Facing | undefined): number {
  const dx = c.x - origin.x;
  const dy = c.y - origin.y;
  const d = Math.hypot(dx, dy);
  if (!facing || d < 1) return d;
  const f = FORWARD[facing];
  // Delante: dentro de unos 70° de la mirada (o debajo de los pies, que no tiene "delante").
  return (dx * f.x + dy * f.y) / d > 0.35 ? d - INTERACTION.frontBonus : d;
}

const compare = (a: { c: Candidate; band: number }, b: { c: Candidate; band: number }): number =>
  a.band - b.band || PRIORITY[a.c.kind] - PRIORITY[b.c.kind] || (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0);

/**
 * El mejor candidato válido, o null. Pura: mismo jugador y mismos candidatos,
 * mismo resultado, venga la lista en el orden que venga (las franjas de empate
 * dan un orden total: nada depende de con quién se compare primero).
 */
export function pickTarget<T extends Candidate>(origin: Vec2, items: readonly T[], opts: PickOptions<T> = {}): T | null {
  const ranked = items
    .filter((c) => Math.hypot(c.x - origin.x, c.y - origin.y) < INTERACTION.range && (opts.allow?.(c) ?? true) && !(opts.blocked?.(c) ?? false))
    .map((c) => {
      const s = score(origin, c, opts.facing);
      return { c, s, band: Math.floor(s / INTERACTION.tie) };
    })
    .sort(compare);
  if (ranked.length === 0) return null;
  const best = ranked[0];
  const keep = opts.current ? ranked.find((r) => r.c.id === opts.current!.id) : undefined;
  return keep && keep.s <= best.s + INTERACTION.sticky ? keep.c : best.c;
}
