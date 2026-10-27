import { PALETTE, TILE } from '../config/constants';
import { despeckle, materialTone, px, shade, type Ctx } from './paint';
import { batch, hash, mix } from './Surfaces';

/**
 * Acabado HD-03 de una casa de vecinos (BuildingDef.finish): la fachada y la
 * azotea se pintan enteras, en una textura por edificio, y no a piezas de 16 px.
 * Así cada sillar, cada junta y cada mancha salen de su sitio y la fachada no
 * se repite cada dos tiles. La huella, la puerta, el portal y los huecos de
 * cristal (los que encienden Lighting y visten Detail) quedan donde estaban.
 *
 * Luz del noroeste, como todo el mundo: lo que vuela echa su sombra abajo y a
 * la derecha, los cantos de arriba y de la izquierda reciben luz.
 *
 *   - Planta baja de piedra almohadillada sobre zócalo de granito, imposta de
 *     piedra artificial; plantas altas de sillería caliza, más clara y cálida.
 *   - Huecos con recercado, dintel volado con clave, jamba al sol y en sombra,
 *     sombra del dintel en el vidrio, carpintería blanca y alféizar con su
 *     sombra; balconcillos de forja en algunos, rejas en el bajo.
 *   - Portal con recercado y dintel, montante con su reja, hojas de cuarterones,
 *     placa con el número, hueco en sombra y escalón.
 *   - Suciedad contenida: churretes bajo los alféizares, humedad en el pie.
 */

const STOREY = TILE * 2;

export interface FacadeBay {
  ground: 'wall' | 'window' | 'door';
  /** Hueco del bajo con luz dentro (de día se ve el interior cálido). */
  groundLit: boolean;
  /** Una por planta alta, de abajo arriba. */
  upper: readonly { window: boolean; lit: boolean; blind: number }[];
}

export interface FacadePlan {
  bays: readonly FacadeBay[];
  floors: number;
  wall: string;
  lit: string;
  seed: number;
  /** Número de portal (la placa del dintel). */
  number: number;
  /** Sillería caliza (Olmo 11), revoco de cal con esquinas de piedra (tu portal) o ladrillo sobre bajo de piedra. */
  mat: 'ashlar' | 'stucco' | 'brick';
  /** Balcón de forja en cada hueco alto (la sillería noble de Velaria y la Puerta). */
  balconies?: boolean;
  /** Contraventanas de lamas abiertas a los lados de los huecos altos. */
  shutter: string;
  /** Hoja del portal: la puerta verde es la tuya. */
  leaf: string;
  /** Balcón con geranios en cada hueco alto. */
  flowers: boolean;
  /** Acabado de pixel art clásico (Alpha-03, BuildingDef.art 'clasico'): rampas por material escogidas a mano (MATERIAL_RAMPS) y sin píxeles huérfanos. */
  classic?: boolean;
}

export interface RoofOpts {
  clay: boolean;
  laundry: boolean;
  bare?: boolean;
  classic?: boolean;
}

const r = (seed: number, a: number, b: number, k: number): number => hash(seed + a * 7919 + k * 104729, b, k);


/**
 * Cómo se aclara u oscurece cada tono mientras se pinta una pieza: `shade` (RGB, el de siempre) o, con el acabado
 * clásico, la rampa con desplazamiento de tono en escalones. Lo fija `classicly` sólo mientras dura el dibujo.
 */
let sh: (hex: string, amount: number) => string = shade;

/** Pinta con el acabado clásico si `on`: rampa en escalones durante el dibujo y, al acabar, la textura sin huérfanos. */
function classicly(ctx: Ctx, on: boolean | undefined, w: number, h: number, paint: () => void): void {
  if (!on) {
    paint();
    return;
  }
  sh = materialTone;
  try {
    paint();
  } finally {
    sh = shade;
  }
  const img = ctx.getImageData(0, 0, w, h);
  if (despeckle(img.data, w, h) > 0) ctx.putImageData(img, 0, 0);
}

export function drawResidentialFacade(ctx: Ctx, plan: FacadePlan): void {
  classicly(ctx, plan.classic, plan.bays.length * TILE, plan.floors * STOREY, () => paintFacade(ctx, plan));
}

export function drawResidentialRoof(ctx: Ctx, w: number, h: number, base: string, seed: number, opts: RoofOpts = { clay: false, laundry: false }): void {
  classicly(ctx, opts.classic, w, h, () => paintRoof(ctx, w, h, base, seed, opts));
}

function ink(ctx: Ctx, alpha: number, x: number, y: number, w: number, h: number): void {
  if (w <= 0 || h <= 0) return;
  ctx.globalAlpha = alpha;
  px(ctx, PALETTE.ink, x, y, w, h);
  ctx.globalAlpha = 1;
}

/**
 * Aparejo de piedra a matajunta. Largo y tono de cada pieza salen de su hilada
 * y su índice dentro del edificio: no hay dos tramos iguales. Almohadillado:
 * canto biselado al sol y llaga honda; sillería fina: junta delgada.
 */
function masonry(ctx: Ctx, x0: number, y0: number, w: number, h: number, base: string, seed: number, course: number, minLen: number, maxLen: number, rustic: boolean): void {
  for (let row = 0, y = y0; y < y0 + h; row++, y += course) {
    const ch = Math.min(course, y0 + h - y);
    let x = x0 - Math.floor(r(seed, row, 0, 1) * maxLen);
    for (let k = 0; x < x0 + w; k++) {
      const len = minLen + Math.floor(r(seed, row, k, 2) * (maxLen - minLen + 1));
      const a = Math.max(x, x0);
      const e = Math.min(x + len, x0 + w);
      if (e > a) {
        let tone = sh(base, (r(seed, row, k, 3) - 0.5) * 0.07 + (r(seed, row, k, 4) < 0.05 ? -0.05 : 0));
        if (r(seed, row, k, 5) < 0.04) tone = mix(tone, '#c9b48e', 0.25); // pieza repuesta, más cálida
        px(ctx, tone, a, y, e - a, ch);
        if (rustic) {
          px(ctx, sh(tone, 0.1), a, y, e - a, 1);
          if (a === x) px(ctx, sh(tone, 0.05), a, y + 1, 1, Math.max(0, ch - 3));
          px(ctx, sh(tone, -0.07), a, y + ch - 2, e - a, 1);
          px(ctx, sh(base, -0.22), a, y + ch - 1, e - a, 1);
          if (x + len <= x0 + w) px(ctx, sh(base, -0.2), x + len - 1, y, 1, ch - 1);
        } else {
          px(ctx, sh(tone, 0.05), a, y, e - a, 1);
          px(ctx, sh(base, -0.15), a, y + ch - 1, e - a, 1);
          if (x + len <= x0 + w) px(ctx, sh(base, -0.13), x + len - 1, y, 1, ch - 1);
        }
      }
      x += len;
    }
  }
}

/** Churretes de lluvia bajo un vuelo: pocos, finos y cortos. */
function streaks(ctx: Ctx, x: number, y: number, w: number, seed: number, maxLen: number): void {
  for (let k = 0; k < 2; k++) {
    if (r(seed, x, y, 30 + k) < 0.35) continue;
    const sx = x + Math.floor(r(seed, x, y, 40 + k) * w);
    const len = 3 + Math.floor(r(seed, x, y, 50 + k) * maxLen);
    ink(ctx, 0.07, sx, y, 1, len);
    ink(ctx, 0.04, sx, y + len, 1, 2);
  }
}

function frameAndGlass(ctx: Ctx, x: number, y: number, w: number, h: number, on: boolean, lit: string, blind: number): void {
  const glass = on ? sh(lit, -0.32) : '#2e4650';
  px(ctx, glass, x, y, w, h);
  if (on) {
    px(ctx, sh(lit, -0.14), x + 1, y + 2, w - 2, h - 3);
    px(ctx, lit, x + 1, y + h - 5, w - 2, 3);
  } else {
    // El cielo en el cristal: dos rayas en diagonal, una más viva.
    const sky = mix(glass, PALETTE.glassLit, 0.42);
    for (let i = 0; i < Math.min(w, h - 3); i++) {
      px(ctx, sky, x + i, y + h - 2 - i * 2, 1, 2);
      if (i < w - 2) px(ctx, mix(glass, PALETTE.glassLit, 0.2), x + i + 2, y + h - 2 - i * 2, 1, 2);
    }
  }
  const frame = '#ece6da';
  const tr = y + Math.floor(h / 3);
  px(ctx, frame, x, y, w, 1);
  px(ctx, frame, x, y, 1, h);
  px(ctx, frame, x + w - 1, y, 1, h);
  px(ctx, frame, x, y + h - 1, w, 1);
  px(ctx, frame, x + Math.floor(w / 2) - 1, y, 1, h);
  px(ctx, frame, x, tr, w, 1);
  px(ctx, sh(frame, -0.24), x + Math.floor(w / 2), y + 1, 1, h - 1);
  if (blind > 0) {
    const slat = '#cdbb9c';
    px(ctx, slat, x, y, w, blind);
    for (let yy = y + 1; yy < y + blind; yy += 2) px(ctx, sh(slat, -0.16), x, yy, w, 1);
    px(ctx, sh(slat, -0.32), x, y + blind, w, 1);
  }
  // El dintel y la jamba izquierda tapan el sol; la jamba derecha recibe luz en su canto.
  ink(ctx, 0.46, x, y, w, 2);
  ink(ctx, 0.2, x, y + 2, w, 1);
  ink(ctx, 0.3, x, y + 2, 1, h - 2);
}

/** Recercado con jambas, dintel volado (y clave en las plantas altas). */
function surround(ctx: Ctx, trim: string, x: number, y: number, w: number, h: number, keystone: boolean): void {
  px(ctx, trim, x - 2, y - 1, w + 4, h + 1);
  px(ctx, sh(trim, 0.09), x - 2, y - 1, 1, h + 1);
  px(ctx, sh(trim, -0.17), x + w + 1, y - 1, 1, h + 1);
  px(ctx, sh(trim, 0.04), x - 3, y - 4, w + 6, 3);
  px(ctx, sh(trim, 0.17), x - 3, y - 4, w + 6, 1);
  px(ctx, sh(trim, -0.22), x - 3, y - 2, w + 6, 1);
  ink(ctx, 0.24, x - 2, y - 1, w + 5, 1);
  if (keystone) {
    px(ctx, sh(trim, 0.2), x + Math.floor(w / 2) - 1, y - 4, 2, 3);
    px(ctx, sh(trim, -0.12), x + Math.floor(w / 2), y - 3, 1, 2);
  }
  // Canto interior de la jamba derecha, de cara al oeste: luz.
  px(ctx, sh(trim, 0.15), x + w, y + 1, 1, h - 1);
}

function sill(ctx: Ctx, trim: string, x: number, y: number, w: number): void {
  px(ctx, sh(trim, 0.2), x - 3, y, w + 6, 1);
  px(ctx, sh(trim, -0.08), x - 3, y + 1, w + 6, 1);
  ink(ctx, 0.36, x - 2, y + 2, w + 5, 1);
  ink(ctx, 0.15, x - 1, y + 3, w + 4, 1);
}

/** Balconcillo de forja: losa volada con su sombra y barandilla de barrotes con la suya sobre el vidrio. */
function balconette(ctx: Ctx, trim: string, x: number, y: number, w: number): void {
  const iron = PALETTE.iron;
  ink(ctx, 0.3, x - 2, y - 5, w + 5, 1);
  for (let bx = x - 2; bx < x + w + 3; bx += 2) ink(ctx, 0.26, bx + 1, y - 4, 1, 4);
  px(ctx, sh(iron, 0.42), x - 3, y - 7, w + 6, 1);
  px(ctx, iron, x - 3, y - 6, w + 6, 1);
  for (let bx = x - 3; bx < x + w + 3; bx += 2) px(ctx, iron, bx, y - 5, 1, 5);
  // Volutas en las esquinas: un píxel curvado a cada lado.
  px(ctx, iron, x - 2, y - 4, 1, 1);
  px(ctx, iron, x + w + 1, y - 4, 1, 1);
  px(ctx, sh(trim, 0.18), x - 4, y, w + 8, 1);
  px(ctx, trim, x - 4, y + 1, w + 8, 1);
  px(ctx, sh(trim, -0.24), x - 4, y + 2, w + 8, 1);
  ink(ctx, 0.42, x - 3, y + 3, w + 7, 1);
  ink(ctx, 0.18, x - 2, y + 4, w + 5, 1);
}

/** Reja del bajo, de forja y volada: barrotes, travesaños y su sombra corrida en el vidrio y el muro. */
function grille(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  const iron = PALETTE.iron;
  const bars = [x, x + 2, x + 5, x + 7];
  for (const bx of bars) ink(ctx, 0.3, bx + 1, y + 1, 1, h);
  ink(ctx, 0.3, x - 1, y + 3, w + 2, 1);
  ink(ctx, 0.3, x - 1, y + h - 2, w + 2, 1);
  for (const bx of bars) px(ctx, iron, bx, y - 1, 1, h + 1);
  px(ctx, iron, x - 2, y + 2, w + 4, 1);
  px(ctx, iron, x - 2, y + h - 3, w + 4, 1);
  px(ctx, sh(iron, 0.35), x - 2, y + 2, w + 4, 1);
}

function door(ctx: Ctx, trim: string, x: number, top: number, number: number, leaf: string): void {
  const H = top + STOREY;
  // El portal va metido en el muro: la jamba de fuera echa sombra en el muro de al lado.
  ink(ctx, 0.22, x + TILE, top + 3, 1, STOREY - 5);
  // Recercado y dintel con su placa.
  px(ctx, trim, x, top + 2, TILE, STOREY - 4);
  px(ctx, sh(trim, 0.1), x, top + 2, 1, STOREY - 4);
  px(ctx, sh(trim, -0.18), x + TILE - 1, top + 2, 1, STOREY - 4);
  px(ctx, sh(trim, 0.05), x, top + 1, TILE, 4);
  px(ctx, sh(trim, 0.18), x, top + 1, TILE, 1);
  px(ctx, sh(trim, -0.22), x, top + 4, TILE, 1);
  px(ctx, '#2c3d55', x + 6, top + 2, 4, 2);
  // El número del portal, en blanco: un trazo de 1 × 2 por dígito.
  const digits = String(number).slice(0, 2).length;
  for (let i = 0; i < digits; i++) px(ctx, '#e9e3d6', x + 7 + i * 2 - (digits - 1), top + 2, 1, 2);
  // Hueco, montante con su reja y hojas de cuarterones.
  px(ctx, PALETTE.woodDark, x + 2, top + 5, TILE - 4, STOREY - 8);
  px(ctx, sh(PALETTE.amber, -0.32), x + 3, top + 5, TILE - 6, 4);
  px(ctx, PALETTE.amber, x + 3, top + 7, TILE - 6, 2);
  for (const bx of [x + 5, x + 8, x + 10]) px(ctx, PALETTE.woodDark, bx, top + 5, 1, 4);
  px(ctx, PALETTE.woodDark, x + 3, top + 7, TILE - 6, 1);
  px(ctx, leaf, x + 3, top + 10, TILE - 6, STOREY - 14);
  px(ctx, sh(leaf, 0.1), x + 3, top + 10, TILE - 6, 1);
  for (const py of [top + 12, top + 20]) {
    for (const lx of [x + 4, x + 9]) {
      px(ctx, sh(leaf, -0.05), lx, py, 3, 6);
      px(ctx, sh(leaf, 0.17), lx, py, 3, 1);
      px(ctx, sh(leaf, 0.09), lx, py, 1, 6);
      px(ctx, sh(leaf, -0.25), lx, py + 5, 3, 1);
      px(ctx, sh(leaf, -0.18), lx + 2, py + 1, 1, 5);
    }
  }
  px(ctx, sh(leaf, -0.32), x + 8, top + 10, 1, STOREY - 14);
  px(ctx, '#c9a45a', x + 7, top + 18, 1, 2);
  px(ctx, '#c9a45a', x + 9, top + 18, 1, 2);
  px(ctx, '#f0d896', x + 9, top + 18, 1, 1);
  // Sombra del dintel y de la jamba dentro del hueco.
  ink(ctx, 0.5, x + 2, top + 5, TILE - 4, 1);
  ink(ctx, 0.25, x + 2, top + 6, TILE - 4, 1);
  ink(ctx, 0.32, x + 2, top + 6, 1, STOREY - 10);
  // Escalón de piedra, y delante la acera: se entra caminando.
  px(ctx, sh(PALETTE.stoneLit, 0.06), x + 1, H - 4, TILE - 2, 1);
  px(ctx, sh(PALETTE.stone, -0.1), x + 1, H - 3, TILE - 2, 1);
  ink(ctx, 0.3, x + 1, H - 2, TILE - 1, 1);
  px(ctx, PALETTE.pavement, x, H - 1, TILE, 1);
}

function paintFacade(ctx: Ctx, plan: FacadePlan): void {
  const { bays, floors, seed } = plan;
  const W = bays.length * TILE;
  const H = floors * STOREY;
  const g0 = H - STOREY;
  const stucco = plan.mat === 'stucco';
  // Ladrillo: el bajo, el recercado y las esquinas, de piedra; el ladrillo, sólo en las plantas altas.
  const brick = plan.mat === 'brick';
  const lime = sh(mix(plan.wall, '#cfc6b2', 0.4), 0.03);
  const rustic = brick ? sh(mix(PALETTE.stone, plan.wall, 0.15), 0.02) : sh(mix(plan.wall, '#9c998f', 0.25), 0.01);
  const granite = mix(brick ? PALETTE.stone : plan.wall, '#6c7079', 0.55);
  const trim = brick ? sh(PALETTE.stoneLit, 0.06) : sh(mix(plan.wall, '#ddd6c6', 0.65), 0.04);

  // Muro: sillería caliza (o revoco de cal) arriba, almohadillado en el bajo, zócalo de granito. Primero el
  // fondo entero: ninguna fila de la fachada puede quedar transparente (dejaría ver el suelo bajo la sombra).
  px(ctx, lime, 0, 0, W, g0);
  px(ctx, rustic, 0, g0, W, STOREY);
  if (stucco) {
    limeWash(ctx, 0, 0, W, g0, plan.wall, seed);
    limeWash(ctx, 0, g0, W, STOREY, sh(plan.wall, -0.03), seed + 1);
    // Bajo de revoco almohadillado: llagas corridas, hondas, con su canto de luz debajo.
    for (let y = g0 + 8; y < H - 8; y += 5) {
      px(ctx, sh(plan.wall, -0.2), 0, y, W, 1);
      ink(ctx, 0.08, 0, y + 1, W, 1);
      px(ctx, sh(plan.wall, 0.05), 0, y + 2, W, 1);
    }
  } else {
    if (g0 > 0 && brick) brickBond(ctx, W, g0, plan.wall, seed);
    else if (g0 > 0) masonry(ctx, 0, 0, W, g0, lime, seed, 4, 7, 13, false);
    masonry(ctx, 0, g0 + 4, W, STOREY - 10, rustic, seed + 1, 5, 10, 16, true);
  }
  masonry(ctx, 0, H - 6, W, 6, granite, seed + 2, 6, 12, 22, true);
  px(ctx, sh(granite, 0.22), 0, H - 6, W, 1);
  px(ctx, sh(granite, 0.1), 0, H - 5, W, 1);
  // La humedad sube por el pie del bajo, por encima del zócalo, a manchas.
  for (let x = 0; x < W; x++) {
    const up = 3 + Math.floor(batch(x, 0, 9, seed + 3) * 7);
    ink(ctx, 0.07, x, H - 6 - up, 1, up);
  }
  // Esquinas de sillares a soga y tizón: el borde del edificio se lee como volumen, no como recorte.
  const quoin = brick ? trim : stucco ? sh(mix(plan.wall, '#d8d2c4', 0.7), 0.02) : sh(lime, 0.06);
  quoins(ctx, 0, 0, H - 6, quoin, seed, false);
  quoins(ctx, W - 7, 0, H - 6, quoin, seed, true);
  // Imposta de piedra entre el bajo y la planta alta: vuela 4 px y deja su sombra en el muro.
  px(ctx, sh(trim, 0.2), 0, g0 - 1, W, 1);
  px(ctx, sh(trim, 0.06), 0, g0, W, 1);
  px(ctx, trim, 0, g0 + 1, W, 1);
  px(ctx, sh(trim, -0.26), 0, g0 + 2, W, 1);
  ink(ctx, 0.36, 0, g0 + 3, W, 1);
  ink(ctx, 0.18, 0, g0 + 4, W, 1);
  ink(ctx, 0.07, 0, g0 + 5, W, 1);
  // Entre plantas altas, una imposta más fina.
  for (let f = 2; f < floors; f++) {
    const y = (floors - f) * STOREY;
    px(ctx, sh(trim, 0.14), 0, y, W, 1);
    px(ctx, sh(trim, -0.2), 0, y + 1, W, 1);
    ink(ctx, 0.28, 0, y + 2, W, 1);
    ink(ctx, 0.1, 0, y + 3, W, 1);
  }
  // La cornisa de la azotea vuela sobre la fachada: su sombra cae honda en las primeras filas.
  [0.58, 0.42, 0.27, 0.15, 0.06].forEach((a, i) => ink(ctx, a, 0, i, W, 1));

  // Bajante de zinc en un extremo sin huecos; el último tramo, de fundición, entra en la acera.
  const pipeX = bays[0]?.upper.some((u) => u.window) ? W - 11 : 8;
  downpipe(ctx, pipeX, 1, g0 + 6, H);
  const acBay = bays.findIndex((b, i) => i >= 2 + (seed % 3) && i < bays.length - 1 && b.upper.length > 0 && !b.upper[0].window);

  bays.forEach((bay, i) => {
    const x = i * TILE;
    bay.upper.forEach((u, k) => {
      const top = (floors - 2 - k) * STOREY;
      if (!u.window) {
        // Un aparato de aire en un paño ciego, uno por casa: chapa, rejilla y su churrete.
        if (i === acBay && k === 0) acUnit(ctx, x + 3, top + 11);
        return;
      }
      const wx = x + 4;
      const wy = top + 7;
      const balcony = plan.flowers || plan.balconies || r(seed, i, k, 60) < 0.45;
      if (wx - 6 >= 7 && wx + 14 <= W - 7) shutters(ctx, plan.shutter, wx, wy, 8, 16);
      surround(ctx, trim, wx, wy, 8, 16, true);
      frameAndGlass(ctx, wx, wy, 8, 16, u.lit, plan.lit, u.blind);
      if (balcony) {
        if (plan.flowers) geraniums(ctx, wx, wy + 16, 8, seed + i * 5 + k);
        balconette(ctx, trim, wx, wy + 16, 8);
        streaks(ctx, wx - 2, wy + 21, 12, seed + i * 7 + k, 5);
      } else {
        sill(ctx, trim, wx, wy + 16, 8);
        streaks(ctx, wx - 2, wy + 20, 12, seed + i * 3 + k, 4);
      }
    });
    if (bay.ground === 'door') door(ctx, trim, x, g0, plan.number, plan.leaf);
    else if (bay.ground === 'window') {
      const wx = x + 4;
      const wy = g0 + 10;
      surround(ctx, trim, wx, wy, 8, 14, false);
      frameAndGlass(ctx, wx, wy, 8, 14, bay.groundLit, plan.lit, 0);
      grille(ctx, wx, wy, 8, 14);
      sill(ctx, trim, wx, wy + 14, 8);
    }
  });
}

/** Revoco de cal a llana: tandas anchas y tenues de tono, nunca grano suelto. */
function limeWash(ctx: Ctx, x0: number, y0: number, w: number, h: number, base: string, seed: number): void {
  px(ctx, base, x0, y0, w, h);
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const b = batch(x, y, 13, seed);
      if (b > 0.7) px(ctx, sh(base, 0.03), x, y);
      else if (b < 0.22) px(ctx, sh(base, -0.035), x, y);
    }
  }
}

/** Esquina de sillares alternos (7 y 4 px): canto al sol, cara en sombra y la sombra del vuelo en el muro. */
function quoins(ctx: Ctx, x: number, top: number, bottom: number, stone: string, seed: number, right: boolean): void {
  for (let y = top, k = 0; y < bottom; y += 6, k++) {
    const len = k % 2 ? 7 : 4;
    const qx = right ? x + 7 - len : x;
    const ch = Math.min(6, bottom - y);
    const t = sh(stone, (r(seed, k, right ? 1 : 0, 140) - 0.5) * 0.06);
    px(ctx, t, qx, y, len, ch);
    px(ctx, sh(t, 0.13), qx, y, len, 1);
    px(ctx, sh(t, 0.06), qx, y + 1, 1, ch - 2);
    px(ctx, sh(t, -0.16), qx + len - 1, y + 1, 1, ch - 2);
    px(ctx, sh(stone, -0.3), qx, y + ch - 1, len, 1);
    if (!right) ink(ctx, 0.2, qx + len, y + 1, 1, ch - 1);
    else ink(ctx, 0.1, qx - 1, y + 1, 1, ch - 1);
  }
}

/** Contraventanas de lamas abiertas contra el muro, a los dos lados del recercado, con su sombra. */
function shutters(ctx: Ctx, color: string, x: number, y: number, w: number, h: number): void {
  for (const sx of [x - 6, x + w + 3]) {
    ink(ctx, 0.3, sx + 3, y, 1, h + 1);
    ink(ctx, 0.14, sx + 1, y + h, 3, 1);
    px(ctx, color, sx, y - 1, 3, h + 1);
    for (let yy = y + 1; yy < y + h - 1; yy += 2) px(ctx, sh(color, -0.22), sx, yy, 3, 1);
    px(ctx, sh(color, 0.22), sx, y - 1, 3, 1);
    px(ctx, sh(color, 0.12), sx, y - 1, 1, h + 1);
    px(ctx, sh(color, -0.34), sx + 2, y, 1, h);
    px(ctx, sh(color, -0.3), sx, y + h - 1, 3, 1);
  }
}

/** Geranios detrás de la barandilla: macetas de barro, mata verde y flor roja que asoma. */
function geraniums(ctx: Ctx, x: number, y: number, w: number, seed: number): void {
  const pot = '#a8553a';
  for (const mx of [x - 2, x + w - 3]) {
    px(ctx, pot, mx, y - 4, 5, 4);
    px(ctx, sh(pot, 0.16), mx, y - 4, 5, 1);
    px(ctx, sh(pot, -0.24), mx + 4, y - 3, 1, 3);
    px(ctx, '#2e4d25', mx - 1, y - 8, 7, 4);
    px(ctx, '#4f7a38', mx, y - 9, 5, 3);
    px(ctx, '#7fa94f', mx, y - 9, 2, 1);
    for (let k = 0; k < 3; k++) {
      const fx = mx + Math.floor(r(seed, mx, k, 150) * 5);
      const fy = y - 10 + Math.floor(r(seed, mx, k, 151) * 3);
      px(ctx, '#d8423a', fx, fy, 2, 1);
      px(ctx, '#f07a62', fx, fy, 1, 1);
      px(ctx, '#9c2a2a', fx + 1, fy + 1, 1, 1);
    }
  }
}

/** Bajante: zinc con canto al sol y cara en sombra, abrazaderas, y el pie de fundición que entra en la acera. */
function downpipe(ctx: Ctx, x: number, top: number, cast: number, bottom: number): void {
  const zinc = '#949aa0';
  const iron = '#4c4f55';
  ink(ctx, 0.28, x + 3, top + 2, 1, bottom - top - 3);
  ink(ctx, 0.12, x + 4, top + 3, 1, bottom - top - 4);
  for (const [c, y0, y1] of [[zinc, top, cast], [iron, cast, bottom]] as const) {
    px(ctx, c, x, y0, 3, y1 - y0);
    px(ctx, sh(c, 0.28), x, y0, 1, y1 - y0);
    px(ctx, sh(c, -0.32), x + 2, y0, 1, y1 - y0);
  }
  for (let y = top + 8; y < bottom - 4; y += 13) {
    px(ctx, sh(iron, 0.2), x - 1, y, 5, 1);
    px(ctx, iron, x - 1, y + 1, 5, 1);
  }
  px(ctx, sh(iron, 0.3), x - 1, cast - 1, 5, 1);
  px(ctx, sh(iron, -0.2), x - 1, cast, 5, 1);
}

/** Aparato de aire acondicionado colgado del muro: caja, rejilla del ventilador, escuadras y su churrete. */
function acUnit(ctx: Ctx, x: number, y: number): void {
  ink(ctx, 0.3, x + 2, y + 7, 10, 2);
  ink(ctx, 0.22, x + 10, y + 1, 2, 7);
  px(ctx, '#d9d7d0', x, y, 10, 7);
  px(ctx, '#f0efea', x, y, 10, 1);
  px(ctx, '#b0aea7', x + 9, y + 1, 1, 6);
  px(ctx, '#a6a49d', x, y + 6, 10, 1);
  for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 5; xx++) if ((xx - 2) ** 2 + (yy - 2) ** 2 <= 5) px(ctx, (xx + yy) % 2 ? '#5b5e65' : '#43464c', x + 1 + xx, y + 1 + yy);
  px(ctx, '#9a988f', x + 7, y + 2, 1, 3);
  px(ctx, PALETTE.iron, x + 1, y + 7, 1, 2);
  px(ctx, PALETTE.iron, x + 8, y + 7, 1, 2);
  ink(ctx, 0.1, x + 3, y + 9, 1, 6);
}

/**
 * Azotea de la casa: baldosa de 16 px a matajunta con tandas de tono, pretil de
 * albardilla con juntas irregulares y su sombra hacia dentro, cornisa con
 * dentículos sobre la fachada, junta de dilatación, dos sumideros con su cerco
 * de suciedad, musgo en el rincón húmedo y los aparatos (condensadora, chimenea
 * de ventilación, trampilla y antena) con su sombra al sureste.
 */
function paintRoof(ctx: Ctx, w: number, h: number, base: string, seed: number, opts: RoofOpts): void {
  const stone = sh(PALETTE.stoneLit, 0.02);
  if (opts.clay) clayTiles(ctx, w, h, mix(base, '#b8704f', 0.62), seed);
  // Baldosa.
  else for (let y = 0, row = 0; y < h; y += 16, row++) {
    for (let x = row % 2 ? -8 : 0, k = 0; x < w; x += 16, k++) {
      const t = sh(base, 0.05 + batch(x, y, 48, seed) * 0.05 + (r(seed, row, k, 70) - 0.5) * 0.04);
      const x0 = Math.max(0, x);
      const pw = Math.min(w, x + 16) - x0;
      const ph = Math.min(h, y + 16) - y;
      px(ctx, sh(t, -0.15), x0, y, pw, ph);
      px(ctx, t, x0, y, pw - (x + 16 <= w ? 1 : 0), ph - 1);
      px(ctx, sh(t, 0.04), x0, y, pw - 1, 1);
      if (x >= 0) px(ctx, sh(t, 0.025), x0, y + 1, 1, ph - 2);
      for (let g = 0; g < 3; g++) px(ctx, sh(t, g ? -0.05 : 0.04), x0 + 1 + Math.floor(r(seed, row, k, 80 + g) * (pw - 2)), y + 1 + Math.floor(r(seed, row, k, 90 + g) * 13));
    }
  }
  // Suciedad contenida: manchas amplias y tenues donde se queda el agua.
  for (let y = 5; y < h - 6; y++) for (let x = 5; x < w - 5; x++) if (batch(x, y, 17, seed + 5) > 0.66) ink(ctx, 0.05, x, y, 1, 1);
  // Junta de dilatación: sellado oscuro con su canto.
  const xj = Math.floor(w * 0.48 + r(seed, 1, 1, 100) * 12);
  px(ctx, sh(base, -0.15), xj, 5, 1, h - 11);
  px(ctx, sh(base, 0.06), xj + 1, 5, 1, h - 11);

  // Sumideros con su cerco de suciedad y el reguero que llega a ellos.
  for (const [dx, dy] of [[w - 13, 9], [9, h - 16]] as const) {
    for (let d = 7; d > 0; d--) ink(ctx, 0.025, dx - d + 2, dy - d + 2, d * 2, d * 2);
    ink(ctx, 0.08, dx - 6, dy + 1, 6, 1);
    // Rejilla cuadrada: marco metálico con su canto de luz y la cruz de pletinas sobre el hueco oscuro.
    px(ctx, PALETTE.metal, dx, dy, 6, 6);
    px(ctx, PALETTE.metalLit, dx, dy, 6, 1);
    px(ctx, PALETTE.metalLit, dx, dy, 1, 6);
    px(ctx, '#2a2c31', dx + 1, dy + 1, 4, 4);
    px(ctx, sh(PALETTE.metal, -0.08), dx + 1, dy + 3, 4, 1);
    px(ctx, sh(PALETTE.metal, -0.08), dx + 3, dy + 1, 1, 4);
  }

  // Sin «bare», los aparatos; con él, sólo la base (las cubiertas de oficina, gimnasio o súper ponen los suyos).
  if (!opts.bare) {
    // Aparatos, con su sombra al sureste (antes que ellos, debajo).
    const hv = { x: 16 + Math.floor(r(seed, 2, 2, 110) * 10), y: 16 };
    ink(ctx, 0.32, hv.x + 3, hv.y + 3, 14, 10);
    ink(ctx, 0.14, hv.x + 4, hv.y + 13, 14, 2);
    px(ctx, '#d6d4cd', hv.x, hv.y, 14, 3);
    px(ctx, '#ecebe6', hv.x, hv.y, 14, 1);
    px(ctx, '#b4b2ab', hv.x, hv.y + 3, 14, 7);
    px(ctx, '#8f8d87', hv.x + 13, hv.y + 3, 1, 7);
    for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 5; xx++) if ((xx - 2) ** 2 + (yy - 2) ** 2 <= 5) px(ctx, (xx + yy) % 2 ? '#55585f' : '#3d4046', hv.x + 2 + xx, hv.y + 4 + yy);
    for (let yy = hv.y + 4; yy < hv.y + 9; yy++) px(ctx, '#8f8d87', hv.x + 9, yy, 3, 1);
    ink(ctx, 0.12, hv.x + 2, hv.y + 10, 10, 2); // el agua del condensado
    // Tubo del aparato hasta el pretil, con su sombra y abrazaderas.
    px(ctx, PALETTE.metalLit, hv.x + 6, 5, 1, hv.y - 5);
    ink(ctx, 0.22, hv.x + 7, 6, 1, hv.y - 6);
    for (let yy = 7; yy < hv.y; yy += 4) px(ctx, PALETTE.metal, hv.x + 5, yy, 3, 1);

    const vx = Math.floor(w * 0.4);
    const vy = 18;
    ink(ctx, 0.3, vx + 2, vy + 2, 6, 6);
    px(ctx, '#7d828a', vx, vy, 6, 6);
    px(ctx, '#a3a8af', vx, vy, 6, 1);
    px(ctx, '#a3a8af', vx, vy, 1, 6);
    px(ctx, '#2f3238', vx + 1, vy + 1, 4, 4);
    px(ctx, '#5b6068', vx + 2, vy + 2, 2, 2);

    const hx = Math.floor(w * 0.45);
    const hy = h - 30;
    ink(ctx, 0.3, hx + 3, hy + 3, 13, 11);
    px(ctx, '#6a6f78', hx, hy, 13, 11);
    px(ctx, '#8c929b', hx + 1, hy + 1, 11, 9);
    px(ctx, '#a9aeb5', hx + 1, hy + 1, 11, 1);
    for (let k = 0; k < 6; k++) px(ctx, '#9ca1a9', hx + 2 + k, hy + 7 - k, 1, 1);
    px(ctx, '#5a5f67', hx + 1, hy + 9, 11, 1);
    ctx.globalAlpha = 0.35;
    px(ctx, '#8a5a32', hx + 10, hy + 11, 1, 4); // churrete de óxido de la bisagra
    ctx.globalAlpha = 1;

    // Casetón de la escalera: el volumen más alto de la azotea, con su puerta al sur y la antena encima.
    if (h >= 64 && w >= 112) {
      const cx = w - 66;
      housing(ctx, cx, 9, 42, 16, 12, base, seed);
      const ax = cx + 34;
      const ay = 6;
      for (let k = 0; k < 12; k++) ink(ctx, 0.22, ax + 1 + k, ay + 10 + Math.floor(k / 2), 1, 1);
      px(ctx, '#4b4f57', ax, ay, 1, 11);
      px(ctx, '#4b4f57', ax - 3, ay + 2, 7, 1);
      px(ctx, '#4b4f57', ax - 2, ay + 5, 5, 1);
      px(ctx, '#7b818a', ax - 3, ay + 2, 1, 1);
      tank(ctx, w - 60, 50);
      tank(ctx, w - 45, 53);
    }
    if (opts.laundry && h >= 64) laundry(ctx, 12, 58, 44, seed);
  }

  // Pretil al norte, al oeste y al este: albardilla con juntas irregulares.
  px(ctx, stone, 0, 0, w, 4);
  px(ctx, sh(stone, 0.1), 0, 0, w, 1);
  px(ctx, sh(stone, -0.12), 4, 3, w - 8, 1);
  px(ctx, stone, 0, 0, 4, h - 6);
  px(ctx, sh(stone, 0.08), 0, 0, 1, h - 6);
  px(ctx, sh(stone, -0.12), 3, 4, 1, h - 10);
  px(ctx, sh(stone, -0.09), w - 4, 0, 4, h - 6);
  px(ctx, sh(stone, -0.24), w - 1, 0, 1, h - 6);
  px(ctx, sh(stone, 0.12), w - 4, 4, 1, h - 10);
  for (let x = 6 + Math.floor(r(seed, 3, 3, 120) * 8); x < w - 4; x += 12 + Math.floor(r(seed, x, 0, 121) * 9)) px(ctx, sh(stone, -0.17), x, 0, 1, 3);
  for (let y = 7 + Math.floor(r(seed, 4, 4, 122) * 8); y < h - 8; y += 12 + Math.floor(r(seed, 0, y, 123) * 9)) {
    px(ctx, sh(stone, -0.17), 0, y, 3, 1);
    px(ctx, sh(stone, -0.24), w - 4, y, 4, 1);
  }
  // Sombra de los pretiles del norte y del oeste hacia dentro; la base del del este, en penumbra.
  [0.4, 0.3, 0.22, 0.14, 0.08, 0.04].forEach((a, d) => {
    ink(ctx, a, 4, 4 + d, w - 8, 1);
    ink(ctx, a, 4 + d, 5 + d, 1, h - 11 - d);
  });
  ink(ctx, 0.1, w - 6, 5, 1, h - 11);
  // Musgo en el rincón húmedo (noroeste, a la sombra), cada vez más ralo.
  for (let y = 4; y < 12; y++) for (let x = 4; x < 40; x++) {
    const near = (x - 4) + (y - 4) * 2;
    if (near < 18 && r(seed, x, y, 130) < 0.32 - near * 0.015) {
      ctx.globalAlpha = 0.6;
      px(ctx, r(seed, x, y, 131) < 0.5 ? '#56653a' : '#6d7d45', x, y);
      ctx.globalAlpha = 1;
    }
  }
  // Cornisa sobre la fachada: albardilla al sol, frente, dentículos y vuelo en sombra.
  px(ctx, sh(stone, 0.12), 0, h - 7, w, 1);
  px(ctx, sh(stone, 0.16), 0, h - 6, w, 1);
  px(ctx, stone, 0, h - 5, w, 1);
  for (let x = 0; x < w; x += 3) {
    px(ctx, sh(stone, -0.2), x, h - 4, 2, 1);
    px(ctx, sh(stone, 0.06), x + 2, h - 4, 1, 1);
  }
  px(ctx, sh(stone, -0.08), 0, h - 3, w, 1);
  px(ctx, sh(stone, -0.24), 0, h - 2, w, 1);
  px(ctx, sh(stone, -0.4), 0, h - 1, w, 1);
}

/**
 * Rasilla de barro de 8 px en cuadrícula: cada pieza su tono (y alguna más
 * cocida o más lavada por el sol), llaga clara de mortero y canto de luz al
 * noroeste. Tandas amplias de sol y de agua encima, nunca grano suelto.
 */
function clayTiles(ctx: Ctx, w: number, h: number, clay: string, seed: number): void {
  const mortar = mix(clay, '#cdbfa6', 0.3);
  px(ctx, mortar, 0, 0, w, h);
  for (let y = 0, row = 0; y < h; y += 8, row++) {
    for (let x = 0, k = 0; x < w; x += 8, k++) {
      const v = r(seed, row, k, 160);
      let t = sh(clay, (v - 0.5) * 0.1 + (batch(x, y, 40, seed + 9) - 0.5) * 0.12);
      if (v < 0.06) t = sh(t, -0.1);
      else if (v > 0.95) t = mix(t, '#d9b48e', 0.3);
      const x0 = Math.max(0, x);
      const pw = Math.min(w, x + 7) - x0;
      if (pw <= 0) continue;
      px(ctx, t, x0, y, pw, 7);
      px(ctx, sh(t, 0.08), x0, y, pw, 1);
      if (x >= 0) px(ctx, sh(t, 0.04), x0, y + 1, 1, 5);
      px(ctx, sh(t, -0.09), x0, y + 6, pw, 1);
    }
  }
}

/**
 * Casetón de la escalera (cw × top de losa vista desde arriba, y wall px de
 * muro al sur): losa con su pretil al sol, muro de revoco con la puerta de
 * chapa y la rejilla, y la sombra que echa al sureste sobre la azotea.
 */
function housing(ctx: Ctx, x: number, y: number, cw: number, top: number, wall: number, base: string, seed: number): void {
  const bottom = y + top + wall;
  // Sombra arrojada: a la derecha y abajo, núcleo y penumbra.
  ink(ctx, 0.34, x + cw, y + 4, 6, top + wall - 1);
  ink(ctx, 0.34, x + 4, bottom, cw + 2, 5);
  ink(ctx, 0.14, x + cw + 6, y + 6, 2, top + wall + 2);
  ink(ctx, 0.14, x + 6, bottom + 5, cw + 2, 2);
  // Losa: el techo del casetón, más claro que la azotea, con su albardilla.
  const slab = sh(mix(base, PALETTE.stoneLit, 0.55), 0.06);
  px(ctx, slab, x, y, cw, top);
  for (let yy = y + 2; yy < y + top - 1; yy++) for (let xx = x + 2; xx < x + cw - 2; xx++) if (batch(xx, yy, 7, seed + 21) > 0.72) px(ctx, sh(slab, -0.03), xx, yy);
  px(ctx, sh(slab, 0.16), x, y, cw, 2);
  px(ctx, sh(slab, 0.1), x, y, 2, top);
  px(ctx, sh(slab, -0.14), x + cw - 2, y, 2, top);
  ink(ctx, 0.18, x + 2, y + 2, cw - 4, 1);
  ink(ctx, 0.12, x + 2, y + 2, 1, top - 3);
  // Canto de la losa sobre el muro.
  px(ctx, sh(slab, 0.04), x - 1, y + top - 1, cw + 2, 1);
  px(ctx, sh(slab, -0.2), x - 1, y + top, cw + 2, 1);
  // Muro al sur: revoco, con la sombra del canto arriba.
  const face = sh(mix(base, '#d8d0c0', 0.6), -0.04);
  px(ctx, face, x, y + top + 1, cw, wall - 1);
  ink(ctx, 0.3, x, y + top + 1, cw, 1);
  ink(ctx, 0.12, x, y + top + 2, cw, 1);
  px(ctx, sh(face, -0.16), x + cw - 1, y + top + 1, 1, wall - 1);
  // Puerta de chapa con su marco, y la rejilla de ventilación.
  const dx = x + 8;
  const steel = '#5f6f6a';
  px(ctx, sh(steel, -0.3), dx - 1, y + top + 2, 9, wall - 2);
  px(ctx, steel, dx, y + top + 3, 7, wall - 3);
  px(ctx, sh(steel, 0.2), dx, y + top + 3, 7, 1);
  px(ctx, sh(steel, 0.1), dx, y + top + 3, 1, wall - 3);
  px(ctx, '#c9c2b0', dx + 5, y + top + 7, 1, 1);
  for (let k = 0; k < 3; k++) px(ctx, '#3e4246', x + cw - 12, y + top + 4 + k * 2, 6, 1);
  px(ctx, sh(face, 0.08), x + cw - 12, y + top + 3, 6, 1);
  // El pie contra la azotea.
  px(ctx, sh(face, -0.24), x, bottom - 1, cw, 1);
}

/** Depósito de agua de fibra: tapa elíptica al sol, cuerpo cilíndrico de cuatro tonos y su sombra. */
function tank(ctx: Ctx, x: number, y: number): void {
  for (let k = 0; k < 4; k++) ink(ctx, 0.3 - k * 0.05, x + 4 + k, y + 11 + k, 11, 1);
  ink(ctx, 0.28, x + 12, y + 3, 3, 9);
  const body = '#c9cbc6';
  px(ctx, body, x, y + 3, 12, 9);
  px(ctx, sh(body, 0.12), x + 1, y + 3, 2, 9);
  px(ctx, sh(body, -0.12), x + 8, y + 3, 2, 9);
  px(ctx, sh(body, -0.26), x + 10, y + 3, 2, 9);
  px(ctx, sh(body, -0.06), x, y + 7, 12, 1);
  px(ctx, sh(body, -0.3), x + 1, y + 11, 10, 1);
  const lid = '#e4e5e0';
  px(ctx, lid, x + 2, y, 8, 1);
  px(ctx, lid, x, y + 1, 12, 2);
  px(ctx, '#f4f4f0', x + 1, y + 1, 5, 1);
  px(ctx, sh(lid, -0.14), x + 7, y + 2, 5, 1);
  px(ctx, '#8b8e90', x + 5, y + 1, 2, 1);
}

/** Tendedero: dos postes, el cordel y la ropa colgada, cada prenda con su canto y su sombra en el suelo. */
function laundry(ctx: Ctx, x0: number, x1: number, y: number, seed: number): void {
  const clothes = ['#f2efe6', '#5d7fa8', '#d8a03c', '#f2efe6', '#b8483e', '#8fb0a0', '#e6dcc0'];
  // Sombras primero: al sureste, sobre la baldosa.
  ink(ctx, 0.22, x0 + 2, y + 3, x1 - x0, 1);
  for (let x = x0 + 3, k = 0; x < x1 - 4; k++) {
    const pw = 4 + Math.floor(r(seed, k, 0, 170) * 4);
    const ph = 4 + Math.floor(r(seed, k, 1, 171) * 4);
    ink(ctx, 0.24, x + 2, y + 3, pw, ph);
    x += pw + 2;
  }
  for (const x of [x0, x1]) {
    ink(ctx, 0.3, x + 1, y + 1, 1, 10);
    px(ctx, PALETTE.iron, x, y - 1, 1, 11);
    px(ctx, sh(PALETTE.iron, 0.4), x, y - 1, 1, 1);
  }
  px(ctx, '#d6d4cc', x0, y, x1 - x0 + 1, 1);
  for (let x = x0 + 3, k = 0; x < x1 - 4; k++) {
    const pw = 4 + Math.floor(r(seed, k, 0, 170) * 4);
    const ph = 4 + Math.floor(r(seed, k, 1, 171) * 4);
    const c = clothes[(k + seed) % clothes.length];
    px(ctx, c, x, y + 1, pw, ph);
    px(ctx, sh(c, 0.12), x, y + 1, pw, 1);
    px(ctx, sh(c, -0.18), x + pw - 1, y + 2, 1, ph - 1);
    px(ctx, sh(c, -0.1), x, y + ph, pw, 1);
    px(ctx, '#c9a45a', x + 1, y, 1, 1);
    px(ctx, '#c9a45a', x + pw - 2, y, 1, 1);
    x += pw + 2;
  }
}

/**
 * Ladrillo visto a soga: hiladas de 3 px (2 de pieza y 1 de tendel claro),
 * piezas de 4 a 6 con su llaga, tono propio y canto de luz arriba; alguna más
 * cocida. Tandas amplias de tono encima: nada de grano suelto.
 */
function brickBond(ctx: Ctx, w: number, h: number, base: string, seed: number): void {
  const mortar = mix(base, '#d6cbb8', 0.55);
  px(ctx, mortar, 0, 0, w, h);
  for (let y = 0, row = 0; y < h; y += 3, row++) {
    let x = -Math.floor(r(seed, row, 0, 180) * 5);
    for (let k = 0; x < w; k++) {
      const len = 4 + Math.floor(r(seed, row, k, 181) * 3);
      let t = sh(base, (r(seed, row, k, 182) - 0.5) * 0.12 + (batch(x, y, 30, seed + 4) - 0.5) * 0.08);
      if (r(seed, row, k, 183) < 0.07) t = sh(t, -0.14);
      const a = Math.max(0, x);
      const e = Math.min(w, x + len - 1);
      if (e > a) {
        px(ctx, t, a, y, e - a, 2);
        px(ctx, sh(t, 0.07), a, y, e - a, 1);
      }
      x += len;
    }
  }
}
