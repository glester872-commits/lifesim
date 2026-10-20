import type Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import type { BuildingDef, PropKind, PropPlacement } from '../types/game';
import { px, shade, type Ctx } from './paint';

/**
 * Biblioteca de materiales de suelo. Cada material es uno o varios caracteres
 * de la rejilla y se pinta en coordenadas de mundo, no por tile: una losa
 * cruza la junta, el grano no se repite cada 16 px y cualquier sitio que use
 * ese carácter (un distrito nuevo, un interior) lo recibe igual.
 *
 * Para que parezca hecho a mano y no ruido:
 * - la variación va por "tandas": zonas amplias algo más claras u oscuras
 *   (ruido de baja frecuencia), como un tramo de acera puesto otro año;
 * - los accidentes son raros y tienen motivo: grietas junto al bordillo,
 *   hojas bajo los árboles, manchas alrededor de bancos y veladores;
 * - los bordes cuentan: rejilla de desagüe en la cuneta, tierra pisada donde
 *   la hierba toca el camino, suciedad al pie de las fachadas.
 *
 * Se pinta una vez al construir el sitio y se hornea en el suelo: no cuesta
 * nada por frame. La colisión no se entera: sigue saliendo de world/tiles.ts.
 */

/** Lo que un material sabe del sitio que pinta. */
export interface Site {
  ground: readonly string[];
  props: readonly PropPlacement[];
  buildings: readonly BuildingDef[];
  /** Escena de muestra (LocationDef.showcase): su acera usa la baldosa grande. */
  showcase?: { tx: number; ty: number; w: number; h: number };
  /** HD-03, manzana piloto (LocationDef.pilot): calzada, acera, bordillo, mediana y hierba con el acabado nuevo. */
  pilot?: { tx: number; ty: number; w: number; h: number };
}

interface Paint {
  ctx: Ctx;
  /** Caja en px de mundo de las celdas de este material. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  at: (tx: number, ty: number) => string;
  built: (tx: number, ty: number) => boolean;
  cells: readonly (readonly [number, number])[];
  showcase?: Site['showcase'];
  /** Si la celda es de la manzana piloto (HD-03). */
  fine: (tx: number, ty: number) => boolean;
}

interface Material {
  chars: string;
  paint: (p: Paint) => void;
}

// ------------------------------------------------------------ utilidades

export function hash(a: number, b = 0, c = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x1b873593, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Ruido de valor suave: tandas amplias de tono, no motas. */
export function batch(x: number, y: number, cell: number, seed: number): number {
  const gx = x / cell;
  const gy = y / cell;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const v = (i: number, j: number): number => hash(i, j, seed);
  const top = v(ix, iy) + (v(ix + 1, iy) - v(ix, iy)) * sx;
  const bottom = v(ix, iy + 1) + (v(ix + 1, iy + 1) - v(ix, iy + 1)) * sx;
  return (top + (bottom - top) * sy) * 2 - 1;
}

/** Mezcla dos colores: variación de matiz, no sólo de brillo. */
export function mix(a: string, b: string, k: number): string {
  const pa = Number.parseInt(a.slice(1), 16);
  const pb = Number.parseInt(b.slice(1), 16);
  const ch = (s: number): number => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * k);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

const WARM_TINT = '#b8966a';
const COOL_TINT = '#8a93a3';
const DIRT = '#7a6248';
const LEAF_FALL = ['#b88046', '#9a6a3a', '#c9a13a', '#8d7a3c'] as const;

/** Por donde se camina fuera: donde la calzada los toca hay bordillo y cuneta. */
const WALKWAY = new Set([',', 'P', 'c', '~', 'T', 'V']);
const ROAD = new Set(['.', ':', '=', 'z', 'b', 'u', 'l']);
/** Carriles de circulación: parches, grietas y tapas de registro. */
const LANE = new Set(['.', 'u', 'l']);

// --------------------------------------------------------- losas y baldosas

interface SlabStyle {
  base: string;
  course: number;
  lengths: readonly number[];
  seed: number;
  /** Cuánto se aparta cada pieza del tono de su tanda. */
  spread: number;
  /** Granito: px² por mota de sal y pimienta (sin él, sólo el grano de `slab`). */
  grain?: number;
}

/** Una pieza con junta, bisel (luz arriba-izquierda) y, a veces, un accidente. */
function slab(ctx: Ctx, x: number, y: number, sw: number, sh: number, tone: string, r: (k: number) => number, crackChance: number, bevel = 1): void {
  // Bisel marcado: a zoom 2 un 3 % no se ve y la acera se lee como una lámina.
  px(ctx, tone, x, y, sw, sh);
  px(ctx, shade(tone, 0.06 * bevel), x, y, sw, 1);
  px(ctx, shade(tone, 0.035 * bevel), x, y, 1, sh);
  px(ctx, shade(tone, -0.065 * bevel), x, y + sh - 1, sw, 1);
  px(ctx, shade(tone, -0.035 * bevel), x + sw - 1, y + 1, 1, sh - 1);
  // Grano de piedra: dos o tres motas, nunca en el mismo sitio.
  for (let k = 0; k < 3; k++) px(ctx, shade(tone, k === 0 ? 0.045 : -0.045), x + 1 + Math.floor(r(10 + k) * Math.max(1, sw - 2)), y + 1 + Math.floor(r(20 + k) * Math.max(1, sh - 2)));
  const d = r(4);
  if (d < crackChance && sw > 6 && sh > 4) {
    // Grieta: un zigzag que baja cruzando la pieza.
    let cx = x + 2 + Math.floor(r(5) * (sw - 5));
    for (let cy = y + 1; cy < y + sh - 1; cy++) {
      px(ctx, shade(tone, -0.1), cx, cy);
      cx += r(30 + cy) < 0.45 ? 1 : r(40 + cy) < 0.2 ? -1 : 0;
    }
  } else if (d < crackChance + 0.06) {
    // Mancha: borrón irregular algo más oscuro.
    const mx = x + 1 + Math.floor(r(6) * Math.max(1, sw - 4));
    const my = y + 1 + Math.floor(r(7) * Math.max(1, sh - 3));
    px(ctx, shade(tone, -0.035), mx, my, 3, 2);
    px(ctx, shade(tone, -0.035), mx + 1, my + 2, 1, 1);
  }
}

/** Losas a matajunta de largo variable, con tandas de tono y algo de matiz. */
function slabs(style: SlabStyle): Material['paint'] {
  const { base, course, lengths, seed, spread } = style;
  return ({ ctx, x0, y0, x1, y1 }) => {
    px(ctx, shade(base, -0.16), x0, y0, x1 - x0, y1 - y0);
    const first = Math.floor(y0 / course);
    for (let row = first; row * course < y1; row++) {
      const y = row * course;
      let x = -Math.floor(hash(seed, row) * lengths[lengths.length - 1]);
      for (let i = 0; x < x1; i++) {
        const r = (k: number): number => hash(seed * 31 + row, i, k);
        const len = lengths[Math.floor(r(1) * lengths.length)];
        if (x + len > x0) {
          let tone = shade(base, batch(x, y, 72, seed) * 0.05 + (r(3) - 0.5) * spread * 0.085);
          const t = r(2);
          if (t < 0.14) tone = mix(tone, WARM_TINT, 0.16);
          else if (t > 0.9) tone = mix(tone, COOL_TINT, 0.14);
          slab(ctx, x, y, len - 1, course - 1, tone, r, 0.05, SIDEWALK_BEVEL);
          if (style.grain) {
            // Sal y pimienta del granito: sobre todo motas oscuras, alguna clara y, rara, un brillo de mica.
            const n = Math.floor(((len - 3) * (course - 3)) / style.grain);
            for (let k = 0; k < n; k++) {
              const g = r(100 + k);
              const c = g < 0.62 ? shade(tone, -0.085) : g < 0.95 ? shade(tone, 0.06) : mix(tone, '#fff4dc', 0.35);
              px(ctx, c, x + 1 + Math.floor(r(200 + k) * (len - 3)), y + 1 + Math.floor(r(300 + k) * (course - 3)));
            }
          }
        }
        x += len;
      }
    }
  };
}

/** HD-02: la junta de la acera se lee a zoom de juego (antes, ±3–6 %). */
const SIDEWALK_BEVEL = 1.8;

/**
 * Bordillo de granito con volumen. Al sur de la acera (la calzada debajo): canto
 * al sol, arista y cara en sombra. Al norte (la calzada encima): la cara mira
 * al noroeste y recibe luz. La sombra que deja en la cuneta la pinta asphalt.
 */
function kerbEdge(ctx: Ctx, X: number, Y: number, roadBelow: boolean, roadAbove: boolean): void {
  if (roadBelow) {
    px(ctx, shade(PALETTE.kerb, 0.04), X, Y + 13, TILE, 1);
    px(ctx, shade(PALETTE.kerb, -0.04), X, Y + 14, TILE, 1);
    px(ctx, shade(PALETTE.kerb, -0.34), X, Y + 15, TILE, 1);
    for (let x = X + 7; x < X + TILE; x += 16) px(ctx, shade(PALETTE.kerb, -0.22), x, Y + 13, 1, 2);
  }
  if (roadAbove) {
    px(ctx, shade(PALETTE.kerb, 0.1), X, Y, TILE, 1);
    px(ctx, PALETTE.kerb, X, Y + 1, TILE, 1);
    px(ctx, shade(PALETTE.kerb, -0.16), X, Y + 2, TILE, 1);
  }
}

/**
 * Acera: baldosa cuadrada de 8 px en tandas. Junto al bordillo, una hilada de
 * piezas largas; al pie de una fachada, la mugre de la pared; y de vez en
 * cuando una baldosa cambiada, más nueva que sus vecinas.
 */
function sidewalk({ ctx, cells, at, built, showcase, fine }: Paint): void {
  const base = PALETTE.pavement;
  const inShow = (tx: number, ty: number): boolean => !fine(tx, ty) && !!showcase && tx >= showcase.tx && tx < showcase.tx + showcase.w && ty >= showcase.ty && ty < showcase.ty + showcase.h;
  sidewalkV3(ctx, cells.filter(([x, y]) => inShow(x, y)), at, built);
  sidewalkFine(ctx, cells.filter(([x, y]) => fine(x, y)), at, built);
  for (const [tx, ty] of cells) {
    if (inShow(tx, ty) || fine(tx, ty)) continue;
    const X = tx * TILE;
    const Y = ty * TILE;
    px(ctx, shade(base, -0.15), X, Y, TILE, TILE);
    const kerbBelow = ROAD.has(at(tx, ty + 1));
    for (let row = 0; row < 2; row++) {
      const y = Y + row * 8;
      const long = row === 1 && kerbBelow;
      // Las piezas largas van a matajunta con la rejilla: empiezan en 16k + 8 y cruzan el tile.
      const pieces = long ? [[X - 8, 16], [X + 8, 16]] : [[X, 8], [X + 8, 8]];
      for (const [x, len] of pieces) {
        const r = (k: number): number => hash(x, y, k + 7);
        let tone = shade(base, batch(x, y, 56, 3) * 0.05 + (r(1) - 0.5) * 0.05);
        if (r(2) < 0.018) tone = mix(shade(base, 0.05), COOL_TINT, 0.2); // baldosa repuesta
        else if (r(2) > 0.93) tone = mix(tone, WARM_TINT, 0.12);
        // Junto al bordillo se agrieta más: pasan ruedas y raíces.
        const cx = Math.max(x, X);
        const w = Math.min(x + len, X + TILE) - cx - (x + len <= X + TILE ? 1 : 0);
        if (w > 0) slab(ctx, cx, y, w, 7, tone, r, kerbBelow ? 0.07 : 0.035, SIDEWALK_BEVEL);
      }
    }
    kerbEdge(ctx, X, Y, kerbBelow, ROAD.has(at(tx, ty - 1)));
    // Mugre al pie de la fachada: la pared salpica y nadie friega ahí.
    if (built(tx, ty - 1)) {
      ctx.globalAlpha = 0.28;
      px(ctx, PALETTE.ink, X, Y, TILE, 1);
      ctx.globalAlpha = 0.14;
      px(ctx, PALETTE.ink, X, Y + 1, TILE, 2);
      ctx.globalAlpha = 1;
    }
  }
}

/**
 * Acera de la escena de muestra: baldosa grande en hiladas de 8 px con piezas
 * de 12 a 24 px a matajunta, que no caen nunca en la rejilla de los tiles (cada
 * hilada empieza en su sitio). Junta suave, tono por pieza, alguna repuesta y
 * más desgaste junto al bordillo. Deja de leerse como cuadrícula.
 */
function sidewalkV3(ctx: Ctx, cells: readonly (readonly [number, number])[], at: Paint['at'], built: Paint['built']): void {
  const base = PALETTE.pavement;
  const LENGTHS = [12, 16, 20, 24, 16, 20] as const;
  for (const [tx, ty] of cells) {
    const X = tx * TILE;
    const Y = ty * TILE;
    px(ctx, shade(base, -0.12), X, Y, TILE, TILE);
    const kerbBelow = ROAD.has(at(tx, ty + 1));
    for (let row = 0; row < 2; row++) {
      const y = Y + row * 8;
      const course = y / 8;
      // Junto al bordillo, la hilada de piezas largas de siempre (bordillo de acera).
      const lengths = row === 1 && kerbBelow ? ([32, 28] as const) : LENGTHS;
      let x = -Math.floor(hash(course, 3, 901) * 24);
      let k = 0;
      while (x < X + TILE) {
        const len = lengths[Math.floor(hash(course, k, 907) * lengths.length)];
        if (x + len > X) {
          const r = (n: number): number => hash(x, y, n + 911);
          let tone = shade(base, batch(x, y, 64, 5) * 0.045 + (r(1) - 0.5) * 0.045);
          if (r(2) < 0.02) tone = mix(shade(base, 0.05), COOL_TINT, 0.18);
          else if (r(2) > 0.94) tone = mix(tone, WARM_TINT, 0.1);
          const cx = Math.max(x, X);
          const w = Math.min(x + len, X + TILE) - cx - (x + len <= X + TILE ? 1 : 0);
          if (w > 0) slab(ctx, cx, y, w, 7, tone, r, kerbBelow ? 0.05 : 0.025, SIDEWALK_BEVEL);
        }
        x += len;
        k++;
      }
    }
    kerbEdge(ctx, X, Y, kerbBelow, ROAD.has(at(tx, ty - 1)));
    if (built(tx, ty - 1)) {
      ctx.globalAlpha = 0.22;
      px(ctx, PALETTE.ink, X, Y, TILE, 1);
      ctx.globalAlpha = 0.1;
      px(ctx, PALETTE.ink, X, Y + 1, TILE, 3);
      ctx.globalAlpha = 1;
    }
  }
}

/**
 * HD-03, acera de la manzana piloto: losa de 8 px de alto a matajunta, de 8 a
 * 24 px de largo (múltiplos de 8: las juntas caen en la retícula de la losa y
 * la acera se lee como baldosa puesta, no como ruido), cada hilada corrida a su
 * aire. Junta entera de un píxel, bisel nítido con la luz del noroeste y tono
 * por pieza en tandas; alguna repuesta, alguna con la esquina saltada. Al pie de
 * la fachada, la mugre se mete en las juntas. El bordillo es kerbFine.
 */
function sidewalkFine(ctx: Ctx, cells: readonly (readonly [number, number])[], at: Paint['at'], built: Paint['built']): void {
  const base = PALETTE.pavement;
  const joint = shade(base, -0.21);
  const LENGTHS = [16, 16, 24, 8, 16, 24, 16] as const;
  for (const [tx, ty] of cells) {
    const X = tx * TILE;
    const Y = ty * TILE;
    px(ctx, joint, X, Y, TILE, TILE);
    const kerbBelow = ROAD.has(at(tx, ty + 1));
    const kerbAbove = ROAD.has(at(tx, ty - 1));
    for (let row = 0; row < 2; row++) {
      const y = Y + row * 8;
      const course = y / 8;
      let x = -8 * Math.floor(hash(course, 5, 941) * 3);
      let k = 0;
      while (x < X + TILE) {
        const len = LENGTHS[Math.floor(hash(course, k, 947) * LENGTHS.length)];
        if (x + len > X) {
          const r = (n: number): number => hash(x, y, n + 953);
          let tone = shade(base, batch(x, y, 64, 7) * 0.05 + (r(1) - 0.5) * 0.05);
          if (r(2) < 0.025) tone = mix(shade(base, 0.06), COOL_TINT, 0.2); // losa repuesta
          else if (r(2) > 0.93) tone = mix(tone, WARM_TINT, 0.12);
          const cx = Math.max(x, X);
          const w = Math.min(x + len, X + TILE) - cx - (x + len <= X + TILE ? 1 : 0);
          if (w > 0) {
            slab(ctx, cx, y, w, 7, tone, r, kerbBelow ? 0.05 : 0.025, 1.6);
            // Esquina saltada: la junta se come un píxel de la arista de abajo a la derecha.
            if (r(8) < 0.05 && x + len <= X + TILE) px(ctx, joint, cx + w - 1, y + 6);
          }
        }
        x += len;
        k++;
      }
    }
    kerbFine(ctx, X, Y, kerbBelow, kerbAbove);
    if (built(tx, ty - 1)) {
      // Mugre al pie del muro: velo de tres filas y, sobre todo, en las juntas de la primera hilada.
      ctx.globalAlpha = 0.24;
      px(ctx, PALETTE.ink, X, Y, TILE, 1);
      ctx.globalAlpha = 0.1;
      px(ctx, PALETTE.ink, X, Y + 1, TILE, 2);
      ctx.globalAlpha = 1;
      for (let x = X; x < X + TILE; x++) if (hash(x, Y, 961) < 0.3) px(ctx, shade(joint, -0.12), x, Y + 7);
    }
  }
}

/** Juntas del bordillo: piezas de granito de 24 a 40 px, cada calle a su ritmo; no caen cada tile. */
function kerbJoint(x: number, y: number): boolean {
  let p = -Math.floor(hash(y, 3, 971) * 32);
  for (let i = 0; p <= x; i++) {
    if (p === x) return true;
    p += 24 + 8 * Math.floor(hash(y, i, 977) * 3);
  }
  return false;
}

/**
 * HD-03, bordillo de la manzana piloto. Al sur de la acera: arista al sol, canto
 * con su grano, el morro redondeado y la cara en sombra; piezas de largo variable
 * con su junta. Al norte, la cara que mira al noroeste: arista clara, canto y la
 * junta con la losa. La sombra que deja en la cuneta la pinta asphalt.
 */
function kerbFine(ctx: Ctx, X: number, Y: number, roadBelow: boolean, roadAbove: boolean): void {
  const k = PALETTE.kerb;
  const grain = (y: number, tone: string): void => {
    for (let x = X; x < X + TILE; x++) {
      const v = hash(x, y, 983);
      if (v < 0.12) px(ctx, shade(tone, -0.07), x, y);
      else if (v > 0.95) px(ctx, shade(tone, 0.06), x, y);
    }
  };
  if (roadBelow) {
    px(ctx, shade(PALETTE.pavement, -0.24), X, Y + 11, TILE, 1);
    px(ctx, shade(k, 0.12), X, Y + 12, TILE, 1);
    px(ctx, shade(k, 0.03), X, Y + 13, TILE, 1);
    grain(Y + 13, shade(k, 0.03));
    px(ctx, shade(k, -0.1), X, Y + 14, TILE, 1);
    px(ctx, shade(k, -0.36), X, Y + 15, TILE, 1);
    for (let x = X; x < X + TILE; x++) {
      if (!kerbJoint(x, Y + 12)) continue;
      px(ctx, shade(k, -0.26), x, Y + 12, 1, 3);
      px(ctx, shade(k, 0.08), x + 1, Y + 13, 1, 1);
    }
  }
  if (roadAbove) {
    px(ctx, shade(k, 0.14), X, Y, TILE, 1);
    px(ctx, shade(k, 0.04), X, Y + 1, TILE, 1);
    grain(Y + 1, shade(k, 0.04));
    px(ctx, shade(k, -0.12), X, Y + 2, TILE, 1);
    px(ctx, shade(PALETTE.pavement, -0.24), X, Y + 3, TILE, 1);
    for (let x = X; x < X + TILE; x++) if (kerbJoint(x, Y)) px(ctx, shade(k, -0.24), x, Y, 1, 3);
  }
}

// --------------------------------------------------------------- calzada

/**
 * Asfalto y todo lo que se pinta encima: tandas de reasfaltado, árido fino en
 * grupitos (no píxeles sueltos), parches sellados, grietas con su alquitrán,
 * cuneta de hormigón con imbornales junto al bordillo, tapas de registro y las
 * marcas viales gastadas (línea continua, discontinua, paso de cebra).
 */
function asphalt({ ctx, cells, at, fine }: Paint): void {
  const base = PALETTE.asphalt;
  for (const [tx, ty] of cells) {
    const X = tx * TILE;
    const Y = ty * TILE;
    if (fine(tx, ty)) {
      asphaltFine(ctx, tx, ty, at(tx, ty));
      continue;
    }
    px(ctx, shade(base, batch(X, Y, 96, 11) * 0.022), X, Y, TILE, TILE);
    // Árido: grupitos de 1–2 px, de poco contraste, más claros en la rodada.
    for (let k = 0; k < 9; k++) {
      const r = (n: number): number => hash(tx * 16 + k, ty, n + 3);
      const light = r(3) < 0.55;
      px(ctx, shade(base, light ? 0.028 : -0.03), X + Math.floor(r(1) * 15), Y + Math.floor(r(2) * 15), r(4) < 0.5 ? 2 : 1, 1);
    }
  }
  // Parches y grietas: por celda, con semilla fija; nunca encima de una marca.
  for (const [tx, ty] of cells) {
    const ch = at(tx, ty);
    const r = (k: number): number => hash(tx, ty, k + 51);
    const X = tx * TILE;
    const Y = ty * TILE;
    if (LANE.has(ch) && r(1) < 0.035) {
      const w = 12 + Math.floor(r(2) * 18);
      const h = 7 + Math.floor(r(3) * 7);
      // Parche: apenas más oscuro, con el borde sellado y las esquinas mordidas.
      px(ctx, shade(base, -0.014), X + 1, Y + 2, w, h);
      ctx.globalAlpha = 0.5;
      px(ctx, shade(base, -0.045), X + 2, Y + 2, w - 2, 1);
      px(ctx, shade(base, -0.045), X + 2, Y + 1 + h, w - 3, 1);
      px(ctx, shade(base, -0.045), X + 1, Y + 3, 1, h - 2);
      ctx.globalAlpha = 1;
    } else if (LANE.has(ch) && r(1) < 0.08) {
      // Grieta larga sellada con alquitrán: más oscura y algo brillante.
      let x = X + Math.floor(r(4) * 8);
      let y = Y + Math.floor(r(5) * 10);
      const len = 10 + Math.floor(r(6) * 16);
      for (let s = 0; s < len; s++) {
        px(ctx, shade(base, -0.07), x, y);
        if (s % 5 === 2) px(ctx, shade(base, -0.035), x, y + 1);
        const step = hash(tx, ty, 200 + s);
        x += step < 0.7 ? 1 : 0;
        y += step > 0.55 ? 1 : step < 0.12 ? -1 : 0;
      }
    }
  }
  for (const [tx, ty] of cells) {
    const X = tx * TILE;
    const Y = ty * TILE;
    const ch = at(tx, ty);
    const kerbAbove = WALKWAY.has(at(tx, ty - 1));
    const kerbBelow = WALKWAY.has(at(tx, ty + 1));
    // Carril bici: rojo teja encima del asfalto (el árido sigue asomando). En un paso de
    // cebra que lo cruza, el rojo sigue entre las bandas: se ve que el carril continúa.
    const bikeRow = ch === 'b' || (ch === 'z' && bikeCrossing(at, tx, ty));
    if (bikeRow) {
      ctx.globalAlpha = 0.62;
      if (ch === 'b') px(ctx, PALETTE.bikeLane, X, Y, TILE, TILE);
      else for (const [y, h] of [[Y, 1], [Y + 6, 3], [Y + 14, 2]]) px(ctx, PALETTE.bikeLane, X, y, TILE, h);
      ctx.globalAlpha = 1;
    }
    const hd = fine(tx, ty);
    if (hd) gutterFine(ctx, at, tx, ty, kerbAbove, kerbBelow);
    // Cuneta de hormigón junto al bordillo, con su junta cada 16 px e imbornal de vez en cuando.
    for (const [yes, gy] of [[kerbAbove, Y], [kerbBelow, Y + TILE - 3]] as const) {
      if (!yes || hd) continue;
      px(ctx, shade(PALETTE.kerb, -0.2), X, gy, TILE, 3);
      px(ctx, shade(PALETTE.kerb, -0.28), X + 7, gy, 1, 3);
      px(ctx, shade(PALETTE.kerb, -0.12), X, gy === Y ? gy : gy + 2, TILE, 1);
      if (hash(tx, gy, 91) < 0.055) {
        px(ctx, PALETTE.iron, X + 3, gy === Y ? Y + 1 : gy - 2, 10, 4);
        for (let x = X + 4; x < X + 12; x += 2) px(ctx, PALETTE.ink, x, gy === Y ? Y + 2 : gy - 1, 1, 2);
        px(ctx, shade(PALETTE.iron, 0.14), X + 3, gy === Y ? Y + 1 : gy - 2, 10, 1);
      }
    }
    // El bordillo de la acera de arriba tapa el sol del noroeste: su sombra cae en la cuneta.
    if (kerbAbove && !hd) {
      ctx.globalAlpha = 0.34;
      px(ctx, PALETTE.ink, X, Y, TILE, 1);
      ctx.globalAlpha = 0.14;
      px(ctx, PALETTE.ink, X, Y + 1, TILE, 2);
      ctx.globalAlpha = 1;
    }
    // Tapa de registro: en mitad de carril, pocas y sin pisar marcas ni cunetas.
    if (LANE.has(ch) && !kerbAbove && !kerbBelow && hash(tx, ty, 77) < 0.03 && hd) manholeFine(ctx, X + 8, Y + 8);
    else if (LANE.has(ch) && !kerbAbove && !kerbBelow && hash(tx, ty, 77) < 0.03) {
      const cx = X + 8;
      const cy = Y + 8;
      for (let y = -5; y <= 5; y++) {
        for (let x = -5; x <= 5; x++) {
          const d = Math.hypot(x, y);
          if (d > 5.2) continue;
          px(ctx, d > 4.3 ? shade(PALETTE.iron, 0.08) : (x + y) % 2 === 0 ? PALETTE.iron : shade(PALETTE.iron, 0.05), cx + x, cy + y);
        }
      }
      px(ctx, shade(PALETTE.iron, 0.2), cx - 3, cy - 4, 3, 1);
    }
    // Marcas viales: pintura gastada, con saltos y tierra de las ruedas.
    const paint = (x: number, y: number, w: number, h: number): void => {
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          const v = hash(xx, yy, 13);
          if (hd) {
            // HD-03: pintura nueva, de borde limpio; asoma algún grano del árido y, rara, una mota gastada.
            px(ctx, v < 0.035 ? shade(PALETTE.roadLine, -0.3) : v > 0.94 ? shade(PALETTE.roadLine, -0.08) : PALETTE.roadLine, xx, yy);
            continue;
          }
          if (v < 0.07) continue; // desconchón
          px(ctx, v > 0.9 ? shade(PALETTE.roadLine, -0.16) : v > 0.8 ? shade(PALETTE.roadLine, -0.07) : PALETTE.roadLine, xx, yy);
        }
      }
    };
    if (ch === '=') paint(X, Y + 14, TILE, 2);
    // Separación entre dos carriles del mismo sentido: discontinua larga en el borde de abajo.
    if (ch === 'l' && tx % 3 !== 2) paint(X, Y + 15, TILE, 1);
    if (ch === 'u') {
      // Bus-taxi: línea ancha continua del lado de los otros carriles, y BUS / TAXI pintado de tanto en tanto.
      if (LANE.has(at(tx, ty - 1))) paint(X, Y, TILE, 2);
      if (LANE.has(at(tx, ty + 1))) paint(X, Y + 14, TILE, 2);
      const word = tx % 16 === 3 ? 'BUS' : tx % 16 === 11 ? 'TAXI' : null;
      if (word) [...word].forEach((l, i) => LETTERS[l].forEach((row, y) => [...row].forEach((c, x) => c === 'X' && paint(X + 1 + i * 4 + x, Y + 5 + y, 1, 1))));
    }
    if (ch === ':' && tx % 2 === 0) paint(X + 2, Y + 7, 12, 2);
    if (ch === 'z') {
      paint(X + 1, Y + 1, 14, 5);
      paint(X + 1, Y + 9, 14, 5);
      if (hd) zebraWear(ctx, X, Y);
      else {
        // La rodada ensucia la banda por el centro del carril.
        ctx.globalAlpha = 0.18;
        px(ctx, PALETTE.ink, X + 1, Y + 3, 14, 1);
        px(ctx, PALETTE.ink, X + 1, Y + 11, 14, 1);
        ctx.globalAlpha = 1;
      }
    }
    if (ch === 'b') {
      // Línea continua del lado de los coches: el carril bici no se pisa.
      if (kerbAbove) paint(X, Y + TILE - 2, TILE, 2);
      if (kerbBelow) paint(X, Y, TILE, 2);
      // La bici y la flecha del sentido, cada tantos tiles. Se circula por la derecha:
      // el carril del bordillo norte va al oeste.
      const glyph = tx % 12 === 5 ? BIKE_GLYPH : tx % 12 === 7 ? (kerbAbove ? ARROW_WEST : ARROW_EAST) : null;
      const top = Y + (kerbAbove ? 4 : 6);
      glyph?.forEach((row, y) => [...row].forEach((c, x) => c === 'X' && paint(X + 2 + x, top + y, 1, 1)));
    }
  }
}

/**
 * HD-03, asfalto de la manzana piloto. El tono va en bloques de 4 px con dos
 * escalas de tanda (la del reasfaltado y una más corta, muy suave): sin
 * escalones de tile. Árido en grupitos de tres tonos y, raras, piedras claras.
 * En los carriles, la rodada: dos bandas algo más lisas y claras donde pisan las
 * ruedas y, entre ellas, la mancha de aceite. Encima, lo de siempre: parches,
 * grietas, cuneta, tapas y marcas.
 */
function asphaltFine(ctx: Ctx, tx: number, ty: number, ch: string): void {
  const base = PALETTE.asphalt;
  const X = tx * TILE;
  const Y = ty * TILE;
  for (let by = 0; by < TILE; by += 4) {
    for (let bx = 0; bx < TILE; bx += 4) {
      const t = batch(X + bx, Y + by, 96, 11) * 0.022 + batch(X + bx, Y + by, 30, 17) * 0.01;
      px(ctx, shade(base, Math.round(t / 0.006) * 0.006), X + bx, Y + by, 4, 4);
    }
  }
  const lane = LANE.has(ch);
  if (lane) {
    // Rodada: las ruedas pulen el árido (más claro y liso) y el motor gotea en medio.
    for (const y of [Y + 3, Y + 12]) px(ctx, shade(base, 0.014), X, y, TILE, 2);
    for (let x = X; x < X + TILE; x++) {
      const v = hash(x >> 1, Y, 991);
      if (v < 0.55) px(ctx, shade(base, -0.035), x, Y + 7 + (v < 0.2 ? 1 : 0), 1, 1);
    }
  }
  for (let k = 0; k < 15; k++) {
    const r = (n: number): number => hash(tx * 16 + k, ty, n + 997);
    const x = X + Math.floor(r(1) * 15);
    const y = Y + Math.floor(r(2) * 15);
    // En la rodada asoma menos árido: el neumático lo ha aplanado.
    if (lane && (y - Y === 3 || y - Y === 4 || y - Y === 12 || y - Y === 13) && r(5) < 0.6) continue;
    const g = r(3);
    const c = g < 0.5 ? shade(base, 0.03) : g < 0.9 ? shade(base, -0.032) : shade(base, 0.075);
    px(ctx, c, x, y, g < 0.9 && r(4) < 0.45 ? 2 : 1, 1);
  }
}

/**
 * HD-03, cuneta de la manzana piloto: losas de hormigón de 32 a 48 px con su
 * junta, la sombra del bordillo graduada y, cada tanto (y siempre aguas arriba
 * de un paso de cebra), un imbornal con su marco al sol, las barras y el negro
 * de dentro; a su lado, la mancha de agua que arrastra.
 */
function gutterFine(ctx: Ctx, at: Paint['at'], tx: number, ty: number, kerbAbove: boolean, kerbBelow: boolean): void {
  const X = tx * TILE;
  const Y = ty * TILE;
  const kerb = PALETTE.kerb;
  for (const [yes, gy, top] of [[kerbAbove, Y, true], [kerbBelow, Y + TILE - 3, false]] as const) {
    if (!yes) continue;
    // Hormigón: la fila pegada al bordillo es la más honda; la de fuera, el canto con el asfalto.
    px(ctx, shade(kerb, -0.2), X, gy, TILE, 3);
    px(ctx, shade(kerb, -0.13), X, top ? gy + 2 : gy, TILE, 1);
    px(ctx, shade(PALETTE.asphalt, -0.06), X, top ? gy + 3 : gy - 1, TILE, 1);
    let p = -Math.floor(hash(gy, 7, 1009) * 40);
    for (let i = 0; p < X + TILE; i++) {
      if (p >= X) px(ctx, shade(kerb, -0.3), p, gy, 1, 3);
      p += 32 + 8 * Math.floor(hash(gy, i, 1013) * 3);
    }
    if (top) {
      // El bordillo de arriba tapa el sol del noroeste: su sombra se funde en tres filas.
      ctx.globalAlpha = 0.3;
      px(ctx, PALETTE.ink, X, Y, TILE, 1);
      ctx.globalAlpha = 0.16;
      px(ctx, PALETTE.ink, X, Y + 1, TILE, 1);
      ctx.globalAlpha = 0.07;
      px(ctx, PALETTE.ink, X, Y + 2, TILE, 1);
      ctx.globalAlpha = 1;
    }
    const upstream = at(tx + 1, ty) === 'z' || at(tx - 1, ty) === 'z';
    if (at(tx, ty) === 'z' || !(upstream || hash(tx, gy, 1019) < 0.07)) continue;
    const iy = top ? Y + 1 : gy - 2;
    px(ctx, shade(PALETTE.iron, -0.1), X + 2, iy, 12, 5);
    px(ctx, PALETTE.ink, X + 3, iy + 1, 10, 3);
    for (let x = X + 4; x < X + 13; x += 2) px(ctx, PALETTE.iron, x, iy + 1, 1, 3);
    px(ctx, shade(PALETTE.iron, 0.2), X + 2, iy, 12, 1);
    px(ctx, shade(PALETTE.iron, 0.12), X + 2, iy, 1, 5);
    // El agua que llega al imbornal oscurece el asfalto de al lado.
    ctx.globalAlpha = 0.12;
    px(ctx, PALETTE.ink, X + 14, iy + 1, 2, 3);
    px(ctx, PALETTE.ink, X, iy + 2, 2, 2);
    ctx.globalAlpha = 1;
  }
}

/** HD-03, tapa de registro: aro con la luz arriba a la izquierda, rejilla de rombos y el cerco de asfalto sellado. */
function manholeFine(ctx: Ctx, cx: number, cy: number): void {
  for (let y = -6; y <= 6; y++) {
    for (let x = -6; x <= 6; x++) {
      const d = Math.hypot(x, y);
      if (d > 6.4) continue;
      let c: string;
      if (d > 5.5) c = shade(PALETTE.asphalt, -0.06);
      else if (d > 4.5) c = x + y < -1 ? shade(PALETTE.iron, 0.22) : x + y > 1 ? shade(PALETTE.iron, -0.12) : shade(PALETTE.iron, 0.08);
      else c = (x + y + 20) % 3 === 0 || (x - y + 20) % 3 === 0 ? shade(PALETTE.iron, -0.08) : shade(PALETTE.iron, 0.04);
      px(ctx, c, cx + x, cy + y);
    }
  }
}

/** HD-03, paso de cebra: las ruedas gastan las bandas por la rodada; la mugre va en puntos, no en raya. */
function zebraWear(ctx: Ctx, X: number, Y: number): void {
  for (const y of [Y + 3, Y + 11]) {
    for (let x = X + 1; x < X + 15; x++) {
      const v = hash(x, y, 1021);
      if (v < 0.08) px(ctx, shade(PALETTE.roadLine, -0.22), x, y);
      else if (v < 0.22) px(ctx, shade(PALETTE.roadLine, -0.08), x, y);
    }
  }
}

/** Bici del carril, en pintura blanca: dos ruedas y el cuadro. */
const BIKE_GLYPH = ['...X...XX..', '....X.X....', '.XXXXXXX.X.', 'X..XX..XX.X', 'X...X...X.X', '.XXX.....X.'];
const ARROW_EAST = ['...X..', '....X.', 'XXXXXX', '....X.', '...X..'];
const ARROW_WEST = ARROW_EAST.map((r) => [...r].reverse().join(''));

/** Letras de 3 × 5 para lo pintado en el carril bus-taxi. */
const LETTERS: Readonly<Record<string, readonly string[]>> = {
  B: ['XXX', 'X.X', 'XX.', 'X.X', 'XXX'], U: ['X.X', 'X.X', 'X.X', 'X.X', 'XXX'], S: ['XXX', 'X..', 'XXX', '..X', 'XXX'],
  T: ['XXX', '.X.', '.X.', '.X.', '.X.'], A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'], X: ['X.X', 'X.X', '.X.', 'X.X', 'X.X'], I: ['XXX', '.X.', '.X.', '.X.', 'XXX'],
};

/**
 * Mediana de la avenida: bordillo de granito a cada lado y, en medio, un seto
 * bajo sobre tierra, en matas. Junto a un paso de cebra, el refugio acaba en
 * morro: el bordillo dobla y el seto se recoge.
 */
function median({ ctx, cells, at, fine }: Paint): void {
  const kerb = PALETTE.kerb;
  for (const [tx, ty] of cells) {
    const X = tx * TILE;
    const Y = ty * TILE;
    if (fine(tx, ty)) {
      medianFine(ctx, at, tx, ty);
      continue;
    }
    px(ctx, shade(DIRT, -0.05), X, Y, TILE, TILE);
    px(ctx, kerb, X, Y, TILE, 3);
    px(ctx, shade(kerb, 0.08), X, Y, TILE, 1);
    px(ctx, shade(kerb, -0.12), X, Y + TILE - 3, TILE, 3);
    px(ctx, shade(kerb, -0.22), X, Y + TILE - 1, TILE, 1);
    const left = at(tx - 1, ty) !== 'V';
    const right = at(tx + 1, ty) !== 'V';
    if (left) px(ctx, kerb, X, Y, 3, TILE - 1);
    if (right) px(ctx, shade(kerb, -0.06), X + TILE - 3, Y, 3, TILE - 1);
    // Seto en matas: oscuro abajo, verde en medio y la luz arriba; se recoge en los morros.
    const x0 = X + (left ? 4 : 0);
    const x1 = X + TILE - (right ? 4 : 0);
    for (let x = x0; x < x1; x += 3) {
      const r = hash(x, ty, 301);
      const top = Y + 3 + Math.floor(r * 2);
      const w = Math.min(3, x1 - x);
      px(ctx, PALETTE.grassDark, x, top + 2, w, Y + TILE - 4 - (top + 2));
      px(ctx, PALETTE.grass, x, top + 1, w, 3);
      px(ctx, PALETTE.leafLit, x + (r < 0.5 ? 0 : 1), top, Math.min(2, w), 1);
    }
  }
}

/**
 * HD-03, mediana de la manzana piloto: el mismo bordillo con arista y cara, y el
 * seto en matas redondas de 5 px con su cara al sol, su sombra al sureste y la
 * tierra que asoma entre ellas.
 */
function medianFine(ctx: Ctx, at: Paint['at'], tx: number, ty: number): void {
  const kerb = PALETTE.kerb;
  const X = tx * TILE;
  const Y = ty * TILE;
  px(ctx, shade(DIRT, -0.12), X, Y, TILE, TILE);
  px(ctx, shade(kerb, 0.12), X, Y, TILE, 1);
  px(ctx, kerb, X, Y + 1, TILE, 2);
  px(ctx, shade(kerb, -0.06), X, Y + TILE - 3, TILE, 1);
  px(ctx, shade(kerb, -0.14), X, Y + TILE - 2, TILE, 1);
  px(ctx, shade(kerb, -0.34), X, Y + TILE - 1, TILE, 1);
  const left = at(tx - 1, ty) !== 'V';
  const right = at(tx + 1, ty) !== 'V';
  if (left) px(ctx, kerb, X, Y, 3, TILE - 1);
  if (right) px(ctx, shade(kerb, -0.08), X + TILE - 3, Y, 3, TILE - 1);
  const x0 = X + (left ? 4 : 0);
  const x1 = X + TILE - (right ? 4 : 0);
  const tones = [shade(PALETTE.grassDark, -0.18), PALETTE.grassDark, PALETTE.grass, PALETTE.grassLit, PALETTE.leafLit];
  // Matas de atrás a delante: cada una pisa la sombra de la anterior.
  for (let x = x0 - 2 - Math.floor(hash(ty, 1, 1031) * 3); x < x1; x += 4) {
    const r = (n: number): number => hash(x, ty, n + 1033);
    const cx = x + 2;
    const cy = Y + 7 + Math.floor(r(1) * 2);
    for (let y = -3; y <= 3; y++) {
      for (let dx = -3; dx <= 3; dx++) {
        const xx = cx + dx;
        if (xx < x0 || xx >= x1 || dx * dx * 0.8 + y * y > 8.5) continue;
        const t = (dx * 0.5 + y * 0.9) / 3 + (hash(xx, cy + y, 1039) - 0.5) * 0.5;
        px(ctx, tones[Math.max(0, Math.min(4, Math.round(2.2 - t * 1.8)))], xx, cy + y);
      }
    }
  }
}

/** Un paso de cebra que corta un carril bici: a un lado del paso, en su misma fila, sigue el carril. */
function bikeCrossing(at: (tx: number, ty: number) => string, tx: number, ty: number): boolean {
  let x = tx;
  while (at(x, ty) === 'z') x--;
  return at(x, ty) === 'b';
}

// ------------------------------------------------------ adoquín y caminos

/**
 * Adoquín: piedras pequeñas en hiladas de 5 px, de ancho variable y esquinas
 * romas, cada una con su tono. Alguna falta y deja ver tierra.
 */
function cobble({ ctx, x0, y0, x1, y1 }: Paint): void {
  const base = PALETTE.cobble;
  px(ctx, shade(base, -0.12), x0, y0, x1 - x0, y1 - y0);
  for (let row = Math.floor(y0 / 5); row * 5 < y1; row++) {
    const y = row * 5;
    let x = x0 - Math.floor(hash(row, 3) * 6);
    for (let i = 0; x < x1; i++) {
      const r = (k: number): number => hash(row, i + Math.floor(x0 / 4), k + 17);
      const w = 4 + Math.floor(r(1) * 3);
      if (r(8) < 0.012) {
        // Adoquín que falta: tierra y, a veces, una brizna.
        px(ctx, DIRT, x, y, w - 1, 4);
        if (r(9) < 0.5) px(ctx, PALETTE.grassLit, x + 1, y + 1, 1, 2);
      } else {
        let tone = shade(base, batch(x, y, 64, 23) * 0.04 + (r(2) - 0.5) * 0.035);
        if (r(3) < 0.12) tone = mix(tone, WARM_TINT, 0.14);
        else if (r(3) > 0.93) tone = mix(tone, COOL_TINT, 0.12);
        px(ctx, tone, x + 1, y, w - 3, 4);
        px(ctx, tone, x, y + 1, w - 1, 2);
        px(ctx, shade(tone, 0.03), x + 1, y, Math.max(1, w - 4), 1);
        px(ctx, shade(tone, -0.03), x + 1, y + 3, w - 3, 1);
      }
      x += w;
    }
  }
}

// ----------------------------------------------------------------- hierba

/**
 * Hierba en tandas de verde, briznas en matas (no una por píxel), algún
 * trébol y flores de pocas en pocas. Donde toca un camino, tierra pisada.
 */
function grass({ ctx, cells, at, fine }: Paint): void {
  const tones = [PALETTE.grassDark, shade(PALETTE.grass, -0.02), PALETTE.grass, shade(PALETTE.grass, 0.025), PALETTE.grassLit];
  for (const [tx, ty] of cells) {
    const X = tx * TILE;
    const Y = ty * TILE;
    if (fine(tx, ty)) grassFine(ctx, tx, ty, tones);
    // Tanda por cuadrantes de 8 px: los parches no tienen forma de tile.
    else for (let q = 0; q < 4; q++) {
      const qx = X + (q % 2) * 8;
      const qy = Y + Math.floor(q / 2) * 8;
      const b = batch(qx, qy, 44, 31);
      px(ctx, tones[Math.max(0, Math.min(4, Math.round(2 + b * 1.6)))], qx, qy, 8, 8);
    }
    // Matas: tres o cuatro briznas juntas, oscuras abajo y claras arriba.
    for (let k = 0; k < (fine(tx, ty) ? 0 : 5); k++) {
      const r = (n: number): number => hash(tx * 8 + k, ty, n + 61);
      const x = X + Math.floor(r(1) * 14);
      const y = Y + 2 + Math.floor(r(2) * 12);
      const b = batch(x, y, 44, 31);
      const dark = tones[Math.max(0, Math.round(1 + b))];
      const lit = tones[Math.min(4, Math.round(3 + b))];
      px(ctx, dark, x, y, 1, 2);
      px(ctx, lit, x + 1, y - 1, 1, 2);
      if (r(3) < 0.5) px(ctx, dark, x + 2, y, 1, 2);
    }
    const r = (n: number): number => hash(tx, ty, n + 71);
    if (r(1) < 0.035) {
      // Florecillas: un corro de tres a cinco, blancas o amarillas.
      const c = r(2) < 0.6 ? '#efe9df' : '#e8c86a';
      for (let k = 0; k < 3 + Math.floor(r(3) * 3); k++) px(ctx, c, X + 3 + Math.floor(hash(tx, ty, 80 + k) * 10), Y + 3 + Math.floor(hash(tx, ty, 90 + k) * 10));
    } else if (r(1) < 0.06) {
      // Trébol: una mancha redonda de verde más frío.
      const c = mix(PALETTE.grass, '#4f8a5a', 0.4);
      px(ctx, c, X + 5, Y + 6, 5, 3);
      px(ctx, c, X + 6, Y + 5, 3, 5);
    }
    // Borde con camino: tierra pisada de 1–3 px, irregular.
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      const n = at(tx + dx, ty + dy);
      if (!WALKWAY.has(n) && n !== 'd') continue;
      for (let i = 0; i < TILE; i++) {
        const depth = 1 + Math.floor(hash(tx * 16 + i, ty + dx * 3 + dy * 7, 5) * 2.6);
        for (let d = 0; d < depth; d++) {
          const c = d === depth - 1 ? mix(DIRT, PALETTE.grassDark, 0.5) : DIRT;
          if (dy === -1) px(ctx, c, X + i, Y + d);
          if (dy === 1) px(ctx, c, X + i, Y + TILE - 1 - d);
          if (dx === -1) px(ctx, c, X + d, Y + i);
          if (dx === 1) px(ctx, c, X + TILE - 1 - d, Y + i);
        }
      }
    }
  }
}

/**
 * HD-03, hierba de la manzana piloto: las mismas tandas de verde, pero en
 * bloques de 2 px con dos escalas (la mancha amplia y una corta y suave): el
 * contorno de cada mancha es orgánico y no tiene forma de cuadrante. Matas de
 * tres briznas con su raíz oscura y la punta al sol, más en las manchas claras
 * (hierba más alta) que en las oscuras.
 */
function grassFine(ctx: Ctx, tx: number, ty: number, base: readonly string[]): void {
  const X = tx * TILE;
  const Y = ty * TILE;
  // Siete tonos (los cinco de siempre, uno más hondo y uno más claro) y, encima, las calvas secas: manchas
  // amplias que tiran a paja. Dos escalas de mancha y la seca, todas de baja frecuencia: varía sin ruido.
  const tones = [shade(PALETTE.grassDark, -0.07), ...base, shade(PALETTE.grassLit, 0.04)];
  const DRY = '#9a9a52';
  for (let by = 0; by < TILE; by += 2) {
    for (let bx = 0; bx < TILE; bx += 2) {
      const b = batch(X + bx, Y + by, 44, 31) * 1.9 + batch(X + bx, Y + by, 13, 37) * 0.7;
      let c = tones[Math.max(0, Math.min(6, Math.round(3 + b)))];
      const dry = batch(X + bx, Y + by, 70, 41);
      if (dry > 0.42) c = mix(c, DRY, dry > 0.62 ? 0.3 : 0.16);
      px(ctx, c, X + bx, Y + by, 2, 2);
    }
  }
  for (let k = 0; k < 10; k++) {
    const r = (n: number): number => hash(tx * 8 + k, ty, n + 1051);
    const x = X + 1 + Math.floor(r(1) * 13);
    const y = Y + 3 + Math.floor(r(2) * 11);
    const b = batch(x, y, 44, 31);
    if (b < -0.3 && r(4) < 0.5) continue;
    const root = tones[Math.max(0, Math.round(1.5 + b * 1.4))];
    const tip = tones[Math.min(6, Math.round(4.6 + b * 1.4))];
    // En las manchas claras la hierba está más alta: la brizna del centro crece un píxel.
    if (b > 0.25) px(ctx, tip, x + 1, y - 3, 1, 1);
    px(ctx, root, x, y, 3, 1);
    px(ctx, root, x + 1, y - 1, 1, 1);
    px(ctx, tip, x, y - 1, 1, 1);
    px(ctx, tip, x + 1, y - 2, 1, 1);
    px(ctx, tip, x + 2, y - 1, 1, 1);
  }
}

/** Tierra: parda en tandas, con chinas y alguna huella seca. Para solares y alcorques grandes. */
function dirt({ ctx, cells }: Paint): void {
  for (const [tx, ty] of cells) {
    const X = tx * TILE;
    const Y = ty * TILE;
    px(ctx, shade(DIRT, batch(X, Y, 40, 41) * 0.04), X, Y, TILE, TILE);
    for (let k = 0; k < 7; k++) {
      const r = (n: number): number => hash(tx * 8 + k, ty, n + 101);
      const c = r(3) < 0.4 ? shade(DIRT, 0.08) : r(3) < 0.7 ? shade(DIRT, -0.06) : '#9a917f';
      px(ctx, c, X + Math.floor(r(1) * 15), Y + Math.floor(r(2) * 15), r(4) < 0.3 ? 2 : 1, 1);
    }
  }
}

// ---------------------------------------------------------------- suelos de dentro

/**
 * Tarima: tablas de 4 px a lo largo, de largo variable y a matajunta, cada
 * una con su tono, vetas y algún nudo. La tanda la da la luz de la sala.
 */
function wood({ ctx, x0, y0, x1, y1 }: Paint): void {
  const base = PALETTE.wood;
  px(ctx, shade(base, -0.1), x0, y0, x1 - x0, y1 - y0);
  for (let row = Math.floor(y0 / 4); row * 4 < y1; row++) {
    const y = row * 4;
    let x = x0 - Math.floor(hash(row, 5) * 40);
    for (let i = 0; x < x1; i++) {
      const r = (k: number): number => hash(row, i, k + 131);
      const len = 20 + Math.floor(r(1) * 30);
      let tone = shade(base, batch(x, y, 80, 43) * 0.025 + (r(2) - 0.5) * 0.05);
      if (r(3) < 0.2) tone = mix(tone, '#9a6a3a', 0.2);
      px(ctx, tone, x, y, len - 1, 3);
      px(ctx, shade(tone, 0.03), x, y, len - 1, 1);
      // Vetas: trazos largos y finos, un tono más oscuros.
      for (let v = 0; v < 2; v++) {
        const vx = x + 2 + Math.floor(r(10 + v) * Math.max(1, len - 12));
        px(ctx, shade(tone, -0.035), vx, y + 1 + v, 4 + Math.floor(r(20 + v) * 8), 1);
      }
      if (r(4) < 0.12) px(ctx, shade(tone, -0.08), x + 3 + Math.floor(r(5) * Math.max(1, len - 8)), y + 1, 2, 1); // nudo
      x += len;
    }
  }
}

/** Baldosa de interior: cuadrada de 16 px con llaga fina; alguna con la esquina saltada. */
function stoneFloor({ ctx, cells }: Paint): void {
  const base = PALETTE.tile;
  for (const [tx, ty] of cells) {
    const X = tx * TILE;
    const Y = ty * TILE;
    const r = (k: number): number => hash(tx, ty, k + 151);
    const tone = shade(base, batch(X, Y, 64, 53) * 0.02 + (r(1) - 0.5) * 0.025);
    px(ctx, shade(base, -0.09), X, Y, TILE, TILE);
    px(ctx, tone, X, Y, TILE - 1, TILE - 1);
    px(ctx, shade(tone, 0.03), X, Y, TILE - 1, 1);
    // Brillo del pulido: una diagonal corta y tenue.
    for (let k = 0; k < 4; k++) px(ctx, shade(tone, 0.02), X + 3 + k, Y + 9 - k);
    if (r(2) < 0.05) px(ctx, shade(tone, -0.07), X + TILE - 3, Y + TILE - 3, 2, 2);
    if (r(3) < 0.06) px(ctx, shade(tone, -0.03), X + 4 + Math.floor(r(4) * 7), Y + 4 + Math.floor(r(5) * 7), 2, 1);
  }
}

// ------------------------------------------------------------- biblioteca

/** Los materiales, por caracteres de la rejilla (world/tiles.ts). */
export const MATERIALS: readonly Material[] = [
  // Plaza de granito (plazuela del metro): losas grandes a matajunta.
  { chars: 'P', paint: slabs({ base: PALETTE.plaza, course: 12, lengths: [16, 20, 24, 28], seed: 17, spread: 1, grain: 14 }) },
  // Plaza mayor: losa de caliza más grande y más clara, de hiladas anchas.
  { chars: '~', paint: slabs({ base: shade(PALETTE.plaza, 0.03), course: 16, lengths: [16, 24, 32], seed: 29, spread: 0.8 }) },
  { chars: ',', paint: sidewalk },
  { chars: '.:=zblu', paint: asphalt },
  { chars: 'V', paint: median },
  { chars: 'c', paint: cobble },
  { chars: 'g', paint: grass },
  { chars: 'd', paint: dirt },
  { chars: 'f', paint: wood },
  { chars: 't', paint: stoneFloor },
];

const PAINTED = new Set(MATERIALS.flatMap((m) => [...m.chars]));
/** Si un carácter lo pinta la biblioteca: su tile no hace falta. */
export const painted = (ch: string): boolean => PAINTED.has(ch);

/** Lo que deja rastro en el suelo de alrededor. */
const LEAVES_UNDER: ReadonlySet<PropKind> = new Set(['tree', 'plane-tree']);
const STAINS_AROUND: ReadonlySet<PropKind> = new Set(['bench', 'plaza-bench', 'cafe-table', 'bin', 'kiosk', 'vending', 'bus-stop', 'parasol']);

/**
 * Detalles con motivo, encima de los materiales: hojas bajo los árboles y
 * manchas (chicle, café) alrededor de bancos, veladores y papeleras. Sólo
 * sobre suelo exterior pintado.
 */
function accents(ctx: Ctx, site: Site, at: (tx: number, ty: number) => string): void {
  const onGround = (x: number, y: number): boolean => {
    const ch = at(Math.floor(x / TILE), Math.floor(y / TILE));
    return WALKWAY.has(ch) || ch === 'g';
  };
  for (const p of site.props) {
    const cx = p.tx * TILE + 8;
    const cy = (p.ty + 1) * TILE - 4;
    if (LEAVES_UNDER.has(p.kind)) {
      for (let k = 0; k < 10; k++) {
        const r = (n: number): number => hash(p.tx * 31 + k, p.ty, n + 171);
        const a = r(1) * Math.PI * 2;
        const d = Math.sqrt(r(2));
        const x = Math.round(cx + Math.cos(a) * 30 * d);
        const y = Math.round(cy + Math.sin(a) * 14 * d);
        // En la hierba se pierden entre las briznas: se ven pocas.
        if (!onGround(x, y) || (at(Math.floor(x / TILE), Math.floor(y / TILE)) === 'g' && r(4) < 0.7)) continue;
        const c = LEAF_FALL[Math.floor(r(3) * LEAF_FALL.length)];
        px(ctx, c, x, y, 2, 1);
        px(ctx, shade(c, -0.12), x + 1, y + 1, 1, 1);
      }
    } else if (STAINS_AROUND.has(p.kind)) {
      for (let k = 0; k < 5; k++) {
        const r = (n: number): number => hash(p.tx * 37 + k, p.ty, n + 191);
        const x = Math.round(cx - 12 + r(1) * 26);
        const y = Math.round(cy - 4 + r(2) * 14);
        if (!onGround(x, y)) continue;
        ctx.globalAlpha = 0.22;
        px(ctx, PALETTE.ink, x, y, r(3) < 0.6 ? 1 : 2, 1);
        ctx.globalAlpha = 1;
      }
    }
  }
}

/**
 * Pinta los materiales del sitio en un lienzo del tamaño del mapa, cada uno
 * recortado a sus celdas, añade los detalles y lo hornea en el suelo.
 */
export function paintSurfaces(scene: Phaser.Scene, rt: Phaser.GameObjects.RenderTexture, site: Site): void {
  const { ground } = site;
  const w = ground[0].length * TILE;
  const h = ground.length * TILE;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const layer = document.createElement('canvas');
  layer.width = w;
  layer.height = h;
  const ctx = canvas.getContext('2d');
  const lctx = layer.getContext('2d');
  if (!ctx || !lctx) return;
  const at = (tx: number, ty: number): string => ground[ty]?.[tx] ?? '';
  const pilot = site.pilot;
  const fine = (tx: number, ty: number): boolean => !!pilot && tx >= pilot.tx && tx < pilot.tx + pilot.w && ty >= pilot.ty && ty < pilot.ty + pilot.h;
  const inBuilding = new Set<string>();
  for (const b of site.buildings) for (let y = b.ty; y < b.ty + b.h; y++) for (let x = b.tx; x < b.tx + b.w; x++) inBuilding.add(`${x},${y}`);
  // Muro: edificios del barrio, muros de interior y las fachadas por tile de los distritos antiguos.
  const built = (tx: number, ty: number): boolean => inBuilding.has(`${tx},${ty}`) || 'WHKEC'.includes(at(tx, ty) || '-');

  let any = false;
  for (const m of MATERIALS) {
    const cells: [number, number][] = [];
    let [cx0, cy0, cx1, cy1] = [Infinity, Infinity, -Infinity, -Infinity];
    ground.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) {
        if (!m.chars.includes(row[tx]) || inBuilding.has(`${tx},${ty}`)) continue;
        cells.push([tx, ty]);
        cx0 = Math.min(cx0, tx);
        cy0 = Math.min(cy0, ty);
        cx1 = Math.max(cx1, tx + 1);
        cy1 = Math.max(cy1, ty + 1);
      }
    });
    if (cells.length === 0) continue;
    any = true;
    const box = { x0: cx0 * TILE, y0: cy0 * TILE, x1: cx1 * TILE, y1: cy1 * TILE };
    lctx.clearRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
    m.paint({ ctx: lctx, ...box, at, built, cells, showcase: site.showcase, fine });
    // Sólo sus celdas pasan al lienzo final.
    ctx.save();
    ctx.beginPath();
    for (const [x, y] of cells) ctx.rect(x * TILE, y * TILE, TILE, TILE);
    ctx.clip();
    ctx.drawImage(layer, box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0, box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
    ctx.restore();
  }
  if (!any) return;
  accents(ctx, site, at);
  const key = '__surfaces';
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
  rt.draw(key, 0, 0);
  scene.textures.remove(key);
}
