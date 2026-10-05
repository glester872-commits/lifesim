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
const WALKWAY = new Set([',', 'P', 'c', '~', 'T']);
const ROAD = new Set(['.', ':', '=', 'z', 'b']);

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
function slab(ctx: Ctx, x: number, y: number, sw: number, sh: number, tone: string, r: (k: number) => number, crackChance: number): void {
  // Bisel marcado: a zoom 2 un 3 % no se ve y la acera se lee como una lámina.
  px(ctx, tone, x, y, sw, sh);
  px(ctx, shade(tone, 0.06), x, y, sw, 1);
  px(ctx, shade(tone, 0.035), x, y, 1, sh);
  px(ctx, shade(tone, -0.065), x, y + sh - 1, sw, 1);
  px(ctx, shade(tone, -0.035), x + sw - 1, y + 1, 1, sh - 1);
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
          slab(ctx, x, y, len - 1, course - 1, tone, r, 0.05);
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

/**
 * Acera: baldosa cuadrada de 8 px en tandas. Junto al bordillo, una hilada de
 * piezas largas; al pie de una fachada, la mugre de la pared; y de vez en
 * cuando una baldosa cambiada, más nueva que sus vecinas.
 */
function sidewalk({ ctx, cells, at, built, showcase }: Paint): void {
  const base = PALETTE.pavement;
  const inShow = (tx: number, ty: number): boolean => !!showcase && tx >= showcase.tx && tx < showcase.tx + showcase.w && ty >= showcase.ty && ty < showcase.ty + showcase.h;
  sidewalkV3(ctx, cells.filter(([x, y]) => inShow(x, y)), at, built);
  for (const [tx, ty] of cells) {
    if (inShow(tx, ty)) continue;
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
        if (w > 0) slab(ctx, cx, y, w, 7, tone, r, kerbBelow ? 0.07 : 0.035);
      }
    }
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
          if (w > 0) slab(ctx, cx, y, w, 7, tone, r, kerbBelow ? 0.05 : 0.025);
        }
        x += len;
        k++;
      }
    }
    if (built(tx, ty - 1)) {
      ctx.globalAlpha = 0.22;
      px(ctx, PALETTE.ink, X, Y, TILE, 1);
      ctx.globalAlpha = 0.1;
      px(ctx, PALETTE.ink, X, Y + 1, TILE, 3);
      ctx.globalAlpha = 1;
    }
  }
}

// --------------------------------------------------------------- calzada

/**
 * Asfalto y todo lo que se pinta encima: tandas de reasfaltado, árido fino en
 * grupitos (no píxeles sueltos), parches sellados, grietas con su alquitrán,
 * cuneta de hormigón con imbornales junto al bordillo, tapas de registro y las
 * marcas viales gastadas (línea continua, discontinua, paso de cebra).
 */
function asphalt({ ctx, cells, at }: Paint): void {
  const base = PALETTE.asphalt;
  for (const [tx, ty] of cells) {
    const X = tx * TILE;
    const Y = ty * TILE;
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
    if (ch === '.' && r(1) < 0.035) {
      const w = 12 + Math.floor(r(2) * 18);
      const h = 7 + Math.floor(r(3) * 7);
      // Parche: apenas más oscuro, con el borde sellado y las esquinas mordidas.
      px(ctx, shade(base, -0.014), X + 1, Y + 2, w, h);
      ctx.globalAlpha = 0.5;
      px(ctx, shade(base, -0.045), X + 2, Y + 2, w - 2, 1);
      px(ctx, shade(base, -0.045), X + 2, Y + 1 + h, w - 3, 1);
      px(ctx, shade(base, -0.045), X + 1, Y + 3, 1, h - 2);
      ctx.globalAlpha = 1;
    } else if (ch === '.' && r(1) < 0.08) {
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
    // Cuneta de hormigón junto al bordillo, con su junta cada 16 px e imbornal de vez en cuando.
    for (const [yes, gy] of [[kerbAbove, Y], [kerbBelow, Y + TILE - 3]] as const) {
      if (!yes) continue;
      px(ctx, shade(PALETTE.kerb, -0.2), X, gy, TILE, 3);
      px(ctx, shade(PALETTE.kerb, -0.28), X + 7, gy, 1, 3);
      px(ctx, shade(PALETTE.kerb, -0.12), X, gy === Y ? gy : gy + 2, TILE, 1);
      if (hash(tx, gy, 91) < 0.055) {
        px(ctx, PALETTE.iron, X + 3, gy === Y ? Y + 1 : gy - 2, 10, 4);
        for (let x = X + 4; x < X + 12; x += 2) px(ctx, PALETTE.ink, x, gy === Y ? Y + 2 : gy - 1, 1, 2);
        px(ctx, shade(PALETTE.iron, 0.14), X + 3, gy === Y ? Y + 1 : gy - 2, 10, 1);
      }
    }
    // Tapa de registro: en mitad de carril, pocas y sin pisar marcas ni cunetas.
    if (ch === '.' && !kerbAbove && !kerbBelow && hash(tx, ty, 77) < 0.03) {
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
          if (v < 0.07) continue; // desconchón
          px(ctx, v > 0.9 ? shade(PALETTE.roadLine, -0.16) : v > 0.8 ? shade(PALETTE.roadLine, -0.07) : PALETTE.roadLine, xx, yy);
        }
      }
    };
    if (ch === '=') paint(X, Y + 14, TILE, 2);
    if (ch === ':' && tx % 2 === 0) paint(X + 2, Y + 7, 12, 2);
    if (ch === 'z') {
      paint(X + 1, Y + 1, 14, 5);
      paint(X + 1, Y + 9, 14, 5);
      // La rodada ensucia la banda por el centro del carril.
      ctx.globalAlpha = 0.18;
      px(ctx, PALETTE.ink, X + 1, Y + 3, 14, 1);
      px(ctx, PALETTE.ink, X + 1, Y + 11, 14, 1);
      ctx.globalAlpha = 1;
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

/** Bici del carril, en pintura blanca: dos ruedas y el cuadro. */
const BIKE_GLYPH = ['...X...XX..', '....X.X....', '.XXXXXXX.X.', 'X..XX..XX.X', 'X...X...X.X', '.XXX.....X.'];
const ARROW_EAST = ['...X..', '....X.', 'XXXXXX', '....X.', '...X..'];
const ARROW_WEST = ARROW_EAST.map((r) => [...r].reverse().join(''));

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
function grass({ ctx, cells, at }: Paint): void {
  const tones = [PALETTE.grassDark, shade(PALETTE.grass, -0.02), PALETTE.grass, shade(PALETTE.grass, 0.025), PALETTE.grassLit];
  for (const [tx, ty] of cells) {
    const X = tx * TILE;
    const Y = ty * TILE;
    // Tanda por cuadrantes de 8 px: los parches no tienen forma de tile.
    for (let q = 0; q < 4; q++) {
      const qx = X + (q % 2) * 8;
      const qy = Y + Math.floor(q / 2) * 8;
      const b = batch(qx, qy, 44, 31);
      px(ctx, tones[Math.max(0, Math.min(4, Math.round(2 + b * 1.6)))], qx, qy, 8, 8);
    }
    // Matas: tres o cuatro briznas juntas, oscuras abajo y claras arriba.
    for (let k = 0; k < 5; k++) {
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
  { chars: '.:=zb', paint: asphalt },
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
    m.paint({ ctx: lctx, ...box, at, built, cells, showcase: site.showcase });
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
