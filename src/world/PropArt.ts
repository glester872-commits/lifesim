import type Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import { glow, make, px, shade, sprinkle, type Ctx } from './paint';
import { getVehicle } from '../data/vehicles';
import { drawVehicle } from './VehicleArt';
import { buildGymTextures } from './GymArt';
import { buildSeatTextures } from './SeatArt';
import { buildDiningTextures } from './DiningArt';

/**
 * Terreno y props del barrio y de los interiores nuevos. Mismo idioma que
 * TextureFactory: vista cenital con un poco de frente, base oscura abajo, luz
 * arriba a la izquierda, sin contornos negros.
 */

// ---------------------------------------------------------------- terreno

const NEON_PINK = '#ff6ab8';
const NEON_CYAN = '#8ff0ff';

/** Pista de baile: losas oscuras con reflejos de los focos, sin rejilla que se lea a lunares. */
function drawDanceFloor(ctx: Ctx, variant: number): void {
  const base = '#241d33';
  px(ctx, base, 0, 0, TILE, TILE);
  px(ctx, shade(base, 0.06), 0, 0, TILE, 1);
  px(ctx, shade(base, 0.06), 0, 0, 1, TILE);
  sprinkle(ctx, shade(base, 0.08), TILE, TILE, 91 + variant, 14);
  sprinkle(ctx, shade(NEON_PINK, -0.45), TILE, TILE, 17 + variant * 5, 3);
  sprinkle(ctx, shade(NEON_CYAN, -0.5), TILE, TILE, 29 + variant * 7, 2);
}

/** Cabina del DJ: tres tiles de mesa con platos y una franja de luz al frente. */
function drawDjBooth(ctx: Ctx): void {
  const w = TILE * 3;
  px(ctx, 'rgba(0,0,0,0.35)', 1, 13, w - 2, 3);
  px(ctx, PALETTE.ink, 0, 3, w, 11);
  px(ctx, shade(PALETTE.night, 0.12), 0, 3, w, 3);
  for (const x of [5, 31]) {
    px(ctx, PALETTE.metal, x, 3, 9, 3);
    px(ctx, PALETTE.ink, x + 3, 4, 3, 1);
  }
  px(ctx, PALETTE.metalLit, 20, 3, 8, 3);
  px(ctx, NEON_PINK, 2, 9, w - 4, 1);
  px(ctx, shade(NEON_PINK, -0.4), 2, 10, w - 4, 1);
}

/** Altavoz de pie: dos conos en una caja negra. */
function drawSpeaker(ctx: Ctx): void {
  px(ctx, 'rgba(0,0,0,0.35)', 2, 29, 12, 3);
  px(ctx, PALETTE.ink, 2, 8, 12, 22);
  px(ctx, shade(PALETTE.night, 0.1), 2, 8, 12, 1);
  for (const [y, r] of [[14, 3], [23, 4]] as const) {
    px(ctx, PALETTE.metal, 8 - r, y - r, r * 2, r * 2);
    px(ctx, PALETTE.ink, 7, y - 1, 2, 2);
  }
}

/**
 * Sillón de barbero visto por detrás (quien se sienta mira al espejo): respaldo
 * de cuero con reposacabezas, reposabrazos cromados, columna hidráulica y el
 * plato redondo del suelo. Quien lo ocupa se pinta delante y tapa el centro.
 */
function drawBarberChair(ctx: Ctx): void {
  const leather = '#6e2f2c';
  const chrome = shade(PALETTE.metal, 0.35);
  px(ctx, 'rgba(0,0,0,0.3)', 2, 29, 13, 3);
  // Plato y columna.
  px(ctx, PALETTE.outline, 2, 28, 12, 3);
  px(ctx, chrome, 3, 28, 10, 2);
  px(ctx, shade(chrome, 0.2), 4, 28, 5, 1);
  px(ctx, PALETTE.outline, 6, 21, 4, 7);
  px(ctx, chrome, 7, 21, 2, 7);
  // Asiento y reposabrazos.
  px(ctx, PALETTE.outline, 1, 17, 14, 5);
  px(ctx, shade(leather, -0.15), 2, 18, 12, 3);
  px(ctx, chrome, 1, 16, 2, 2);
  px(ctx, chrome, 13, 16, 2, 2);
  // Respaldo y reposacabezas.
  px(ctx, PALETTE.outline, 3, 5, 10, 13);
  px(ctx, leather, 4, 6, 8, 11);
  px(ctx, shade(leather, 0.15), 4, 6, 8, 1);
  for (const y of [9, 12, 15]) px(ctx, shade(leather, -0.2), 5, y, 6, 1);
  px(ctx, PALETTE.outline, 5, 1, 6, 4);
  px(ctx, leather, 6, 2, 4, 2);
  px(ctx, shade(leather, 0.15), 6, 2, 4, 1);
}

// ------------------------------------------------ Calle del Carmen

/**
 * Camilla de tatuaje vista desde los pies: respaldo reclinado de skai negro,
 * reposabrazos a un lado para apoyar el antebrazo y la base de pistón. Quien
 * se tatúa se sienta encima.
 */
function drawTattooChair(ctx: Ctx): void {
  const vinyl = '#26242c';
  const chrome = shade(PALETTE.metal, 0.3);
  px(ctx, 'rgba(0,0,0,0.3)', 1, 29, 14, 3);
  px(ctx, PALETTE.outline, 5, 22, 6, 8);
  px(ctx, chrome, 6, 22, 4, 7);
  px(ctx, PALETTE.outline, 1, 14, 14, 9);
  px(ctx, vinyl, 2, 15, 12, 7);
  px(ctx, shade(vinyl, 0.12), 2, 15, 12, 1);
  px(ctx, PALETTE.outline, 3, 2, 10, 13);
  px(ctx, vinyl, 4, 3, 8, 11);
  px(ctx, shade(vinyl, 0.14), 4, 3, 8, 1);
  for (const y of [6, 9, 12]) px(ctx, shade(vinyl, -0.1), 5, y, 6, 1);
  // Reposabrazos acolchado para el antebrazo.
  px(ctx, PALETTE.outline, 12, 11, 4, 4);
  px(ctx, vinyl, 13, 12, 3, 2);
  px(ctx, chrome, 13, 15, 1, 5);
}

/** Carrito del tatuador: bandejas de acero, la máquina, tintas de colores y un flexo encendido. */
function drawTattooCart(ctx: Ctx): void {
  const steel = shade(PALETTE.metal, 0.2);
  px(ctx, 'rgba(0,0,0,0.3)', 2, 29, 12, 3);
  px(ctx, PALETTE.outline, 3, 14, 10, 15);
  px(ctx, steel, 4, 15, 8, 13);
  for (const y of [19, 24]) px(ctx, shade(steel, -0.2), 4, y, 8, 1);
  // Tintas en fila y la máquina encima.
  [PALETTE.ink, '#b8423a', '#2f4a8c', '#c8d84a', PALETTE.amber].forEach((c, i) => px(ctx, c, 4 + i * 2 - (i > 3 ? 1 : 0), 16, 1, 2));
  px(ctx, PALETTE.ink, 7, 21, 4, 2);
  px(ctx, steel, 10, 22, 2, 1);
  // Flexo.
  px(ctx, PALETTE.ink, 11, 4, 1, 11);
  px(ctx, PALETTE.ink, 7, 3, 5, 1);
  px(ctx, PALETTE.outline, 5, 3, 4, 3);
  px(ctx, PALETTE.white, 6, 5, 2, 1);
  glow(ctx, 7, 7, 5, 0.18, PALETTE.white);
  // Ruedas.
  px(ctx, PALETTE.ink, 3, 28, 2, 2);
  px(ctx, PALETTE.ink, 11, 28, 2, 2);
}

/** Pared de flash: láminas de diseños tradicionales clavadas en fila (golondrina, rosa, corazón, ancla). */
function drawFlashWall(ctx: Ctx): void {
  const sheets = ['#e6dcc0', PALETTE.white, '#e6dcc0', PALETTE.white];
  sheets.forEach((c, i) => {
    const x = 1 + i * 8;
    const y = 2 + (i % 2);
    px(ctx, 'rgba(0,0,0,0.3)', x + 1, y + 1, 6, 10);
    px(ctx, c, x, y, 6, 10);
    px(ctx, PALETTE.ink, x + 2, y, 2, 1); // la chincheta
    const ink = [['#2f4a8c', PALETTE.ink], ['#b8423a', '#4f7d3a'], ['#b8423a', PALETTE.amber], [PALETTE.ink, '#2f4a8c']][i];
    px(ctx, ink[0], x + 1, y + 3, 4, 3);
    px(ctx, ink[1], x + 2, y + 6, 2, 2);
    px(ctx, PALETTE.ink, x + 1, y + 8, 4, 1);
  });
}

/** Pared de zapatillas: baldas con pares de colores a contraluz, las de colección arriba. */
function drawSneakerWall(ctx: Ctx): void {
  const colors = [PALETTE.white, NEON_CYAN, '#c8d84a', '#b8423a', PALETTE.ink, '#e6dcc0'];
  for (const [row, y] of [[0, 4], [1, 11]] as const) {
    px(ctx, PALETTE.metalLit, 1, y + 3, 30, 1);
    for (let i = 0; i < 5; i++) {
      const c = colors[(i * 5 + row * 3) % colors.length];
      const x = 2 + i * 6;
      px(ctx, c, x, y, 4, 3);
      px(ctx, shade(c, -0.25), x, y + 2, 4, 1);
      px(ctx, PALETTE.white, x, y + 2, 4, 1);
    }
  }
  glow(ctx, 16, 8, 12, 0.08, NEON_CYAN);
}

/** Cajón del ropero al peso: un montón de ropa revuelta en un cajón de madera, con su cartel. */
function drawBargainBin(ctx: Ctx): void {
  const w = TILE * 2;
  px(ctx, 'rgba(0,0,0,0.3)', 1, 13, w - 2, 3);
  px(ctx, PALETTE.outline, 0, 5, w, 10);
  px(ctx, PALETTE.woodDark, 1, 8, w - 2, 6);
  px(ctx, PALETTE.wood, 1, 8, w - 2, 1);
  const cloth = ['#8c3f3f', '#5c6fa8', '#8aa05a', '#e6e0d4', '#b8923f', '#4f6a8c', '#7b5a3d'];
  for (let i = 0; i < 12; i++) px(ctx, cloth[(i * 5) % cloth.length], 1 + ((i * 7) % 27), 3 + (i % 3), 4, 4);
  // Cartel de precio clavado en el borde.
  px(ctx, PALETTE.white, 24, 9, 6, 4);
  px(ctx, '#b8423a', 25, 10, 4, 1);
  px(ctx, PALETTE.ink, 25, 12, 3, 1);
}

/**
 * Columna de carteles: cilindro de hierro verde con capas de carteles pegados
 * unos encima de otros y pegatinas abajo, donde llega la mano. Sombra hacia el
 * sureste, como todo lo alto de la calle.
 */
function drawPosterColumn(ctx: Ctx): void {
  const iron = '#2f4a3a';
  px(ctx, PALETTE.outline, 2, 2, 12, 45);
  px(ctx, iron, 3, 3, 10, 43);
  // Remate y base.
  px(ctx, shade(iron, 0.1), 2, 1, 12, 3);
  px(ctx, shade(iron, 0.2), 4, 0, 8, 2);
  px(ctx, shade(iron, -0.1), 2, 42, 12, 5);
  // Carteles: papel de colores, luz a la izquierda, curvatura a la derecha.
  const papers = [PALETTE.white, NEON_PINK, '#e6dcc0', PALETTE.amber, '#c8d84a', NEON_CYAN, '#b8423a'];
  let y = 6;
  for (let i = 0; y < 36; i++) {
    const h = 5 + ((i * 3) % 4);
    const c = papers[(i * 3) % papers.length];
    px(ctx, c, 3, y, 10, h - 1);
    px(ctx, shade(c, -0.18), 11, y, 2, h - 1);
    px(ctx, PALETTE.ink, 4, y + 1, 4 + (i % 3), 1);
    if (h > 5) px(ctx, shade(c, -0.35), 4, y + 3, 5, 1);
    y += h;
  }
  // Pegatinas a la altura de la mano.
  [[4, 37, NEON_PINK], [8, 38, PALETTE.white], [6, 40, '#c8d84a'], [10, 39, NEON_CYAN]].forEach(([x, yy, c]) => px(ctx, c as string, x as number, yy as number, 2, 2));
}

/** Botellero de vinoteca: celosía de madera en rombos con botellas acostadas, verdes y granates. */
function drawWineRack(ctx: Ctx): void {
  const wood = shade(PALETTE.wood, -0.1);
  px(ctx, PALETTE.outline, 0, 0, 16, 32);
  px(ctx, shade(wood, -0.35), 1, 1, 14, 30);
  const bottles = ['#2f4a2e', '#5a1f2a', '#3a5a3a', '#6e2433', '#24361f'];
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 3; x++) {
      const cx = 2 + x * 5 + (y % 2 ? 2 : 0);
      const cy = 2 + y * 4;
      if (cx > 12) continue;
      // El culo de la botella asomando, con un brillo arriba a la izquierda.
      const c = bottles[(x * 3 + y * 7) % bottles.length];
      px(ctx, c, cx, cy + 1, 3, 2);
      px(ctx, shade(c, 0.35), cx, cy + 1, 1, 1);
    }
  }
  // La celosía por encima: diagonales de madera.
  for (let i = -16; i < 32; i += 5) {
    for (let t = 0; t < 32; t++) {
      const a = i + t;
      const b = i + 16 - t;
      if (a >= 1 && a < 15 && t >= 1 && t < 31) px(ctx, wood, a, t);
      if (b >= 1 && b < 15 && t >= 1 && t < 31) px(ctx, shade(wood, 0.12), b, t);
    }
  }
  px(ctx, PALETTE.woodLit, 1, 1, 14, 1);
}

/** Botellero de pared: dos baldas con botellas de colores a contraluz. */
function drawBottles(ctx: Ctx): void {
  const colors = [PALETTE.leafLit, PALETTE.amber, PALETTE.glassLit, '#c0493f', PALETTE.white, NEON_PINK];
  for (const y of [5, 12]) {
    px(ctx, PALETTE.woodLit, 1, y + 2, 30, 1);
    for (let x = 2, i = y; x < 29; x += 3, i++) {
      const c = colors[(i * 7) % colors.length];
      px(ctx, shade(c, -0.25), x, y - 3, 2, 5);
      px(ctx, c, x, y - 3, 1, 3);
      px(ctx, shade(c, -0.4), x, y - 5, 1, 2);
    }
  }
}

function drawCourt(ctx: Ctx, variant: number): void {
  const base = shade(PALETTE.rug, -0.05);
  px(ctx, base, 0, 0, TILE, TILE);
  sprinkle(ctx, shade(base, 0.04), TILE, TILE, 9 + variant, 10);
  if (variant === 1) px(ctx, shade(PALETTE.white, -0.15), 0, 8, TILE, 1);
}

/** Moqueta de oficina: pizarra con trama fina, nada de alfombra de casa. */
function drawOfficeCarpet(ctx: Ctx, variant: number): void {
  const base = shade(PALETTE.glass, 0.04);
  px(ctx, base, 0, 0, TILE, TILE);
  for (let y = variant * 2; y < TILE; y += 4) px(ctx, shade(base, 0.03), 0, y, TILE, 1);
  sprinkle(ctx, shade(base, -0.04), TILE, TILE, 71 + variant, 10);
}

// ------------------------------------------------------------------ calle

function drawFountain(ctx: Ctx): void {
  const w = TILE * 3;
  px(ctx, PALETTE.stone, 1, 8, w - 2, 23);
  px(ctx, PALETTE.stoneLit, 1, 8, w - 2, 2);
  px(ctx, shade(PALETTE.stone, -0.1), 1, 29, w - 2, 2);
  px(ctx, PALETTE.water, 4, 11, w - 8, 16);
  sprinkle(ctx, PALETTE.waterLit, w - 8, 16, 5, 30);
  px(ctx, PALETTE.stoneLit, 21, 4, 6, 16);
  px(ctx, PALETTE.stone, 21, 18, 6, 2);
  px(ctx, PALETTE.waterLit, 22, 1, 4, 4);
  px(ctx, PALETTE.white, 23, 0, 2, 3);
  px(ctx, shade(PALETTE.waterLit, 0.15), 18, 5, 2, 6);
  px(ctx, shade(PALETTE.waterLit, 0.15), 28, 5, 2, 6);
}

function drawKiosk(ctx: Ctx): void {
  const w = TILE * 2;
  px(ctx, PALETTE.leaf, 1, 10, w - 2, 21);
  px(ctx, shade(PALETTE.leaf, -0.1), 1, 28, w - 2, 3);
  px(ctx, PALETTE.amber, 0, 6, w, 5);
  px(ctx, PALETTE.amberDim, 0, 10, w, 1);
  px(ctx, shade(PALETTE.leaf, 0.08), 3, 2, w - 6, 5);
  const mags = ['#c06a5a', PALETTE.glassLit, PALETTE.white, '#8a7ac0', PALETTE.amber];
  for (let i = 0; i < 6; i++) px(ctx, mags[i % mags.length], 4 + i * 4, 14, 3, 5);
  for (let i = 0; i < 5; i++) px(ctx, mags[(i + 2) % mags.length], 6 + i * 4, 21, 3, 4);
}

function drawBusStop(ctx: Ctx): void {
  const w = TILE * 3;
  px(ctx, PALETTE.metal, 2, 6, 2, 25);
  px(ctx, PALETTE.metal, w - 4, 6, 2, 25);
  px(ctx, PALETTE.metalLit, 0, 4, w, 3);
  ctx.globalAlpha = 0.45;
  px(ctx, PALETTE.glassLit, 4, 8, w - 8, 14);
  ctx.globalAlpha = 1;
  px(ctx, PALETTE.ink, 30, 9, 12, 12);
  px(ctx, PALETTE.amber, 31, 10, 10, 10);
  px(ctx, PALETTE.white, 33, 12, 6, 1);
  px(ctx, PALETTE.white, 33, 15, 4, 1);
  px(ctx, PALETTE.wood, 5, 24, 20, 3);
  px(ctx, PALETTE.woodLit, 5, 24, 20, 1);
}

/**
 * Coche aparcado: el mismo dibujo que los que circulan (world/VehicleArt.ts),
 * centrado en sus 2 tiles y con las ruedas en el borde de abajo.
 */
function drawParked(ctx: Ctx, id: string, color: number): void {
  const t = getVehicle(id);
  ctx.save();
  ctx.translate(Math.round((TILE * 2 - t.length) / 2), TILE - t.height);
  drawVehicle(ctx, t, t.colors[color]);
  ctx.restore();
}

function drawVan(ctx: Ctx): void {
  const w = TILE * 3;
  const body = shade(PALETTE.white, -0.12);
  px(ctx, 'rgba(0,0,0,0.35)', 2, 29, w - 3, 3);
  px(ctx, shade(body, -0.12), 1, 8, w - 2, 21);
  px(ctx, body, 1, 7, w - 2, 20);
  px(ctx, PALETTE.white, 2, 7, w - 4, 1);
  px(ctx, PALETTE.leafLit, 4, 14, 26, 5);
  px(ctx, PALETTE.glass, 34, 9, 11, 8);
  px(ctx, PALETTE.glassLit, 34, 9, 11, 1);
  px(ctx, PALETTE.ink, 5, 26, 6, 4);
  px(ctx, PALETTE.ink, w - 11, 26, 6, 4);
}

function drawBike(ctx: Ctx): void {
  px(ctx, PALETTE.metal, 1, 9, 14, 1);
  for (const cx of [4, 12]) {
    px(ctx, PALETTE.ink, cx - 3, 8, 6, 6);
    px(ctx, shade(PALETTE.metal, -0.1), cx - 2, 9, 4, 4);
  }
  px(ctx, '#c0493f', 5, 6, 7, 2);
  px(ctx, PALETTE.ink, 5, 4, 3, 2);
  px(ctx, PALETTE.metalLit, 11, 3, 3, 1);
}

function drawBin(ctx: Ctx): void {
  px(ctx, shade(PALETTE.leaf, -0.1), 4, 5, 8, 10);
  px(ctx, PALETTE.leaf, 4, 5, 8, 2);
  px(ctx, PALETTE.leafLit, 5, 5, 3, 1);
  px(ctx, PALETTE.ink, 6, 6, 4, 1);
  px(ctx, PALETTE.metal, 7, 14, 2, 2);
}

function drawVending(ctx: Ctx): void {
  px(ctx, '#a33f3f', 1, 4, 14, 27);
  px(ctx, '#bd5454', 1, 4, 14, 2);
  px(ctx, PALETTE.ink, 3, 7, 8, 14);
  const cans = [PALETTE.glassLit, PALETTE.amber, PALETTE.white, '#8a7ac0'];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) px(ctx, cans[(r + c) % 4], 4 + c * 2, 8 + r * 4, 1, 3);
  px(ctx, PALETTE.glassLit, 12, 8, 2, 4);
  px(ctx, PALETTE.ink, 3, 24, 8, 4);
  glow(ctx, 7, 14, 7, 0.12, PALETTE.glassLit);
}

/** Máquina de billetes del metro: pantalla, ranura de tarjeta y el azul de la línea. */
function drawTicketMachine(ctx: Ctx): void {
  px(ctx, 'rgba(0,0,0,0.35)', 2, 29, 12, 3);
  px(ctx, PALETTE.metal, 2, 5, 12, 25);
  px(ctx, PALETTE.metalLit, 2, 5, 12, 1);
  px(ctx, '#3f5fa8', 2, 6, 12, 3);
  px(ctx, PALETTE.ink, 4, 11, 8, 7);
  px(ctx, PALETTE.glassLit, 5, 12, 6, 1);
  px(ctx, shade(PALETTE.glassLit, -0.3), 5, 14, 4, 1);
  px(ctx, shade(PALETTE.glassLit, -0.3), 5, 16, 5, 1);
  px(ctx, PALETTE.ink, 5, 21, 6, 1);
  px(ctx, PALETTE.amber, 10, 21, 1, 1);
  px(ctx, PALETTE.ink, 5, 25, 6, 2);
  glow(ctx, 8, 14, 6, 0.12, PALETTE.glassLit);
}

function drawProduce(ctx: Ctx): void {
  for (const [x, y, fruit] of [[1, 7, '#c0493f'], [8, 7, PALETTE.amber], [4, 2, PALETTE.leafLit]] as const) {
    px(ctx, PALETTE.woodDark, x, y + 3, 7, 5);
    px(ctx, PALETTE.wood, x, y + 3, 7, 1);
    for (let i = 0; i < 3; i++) px(ctx, fruit, x + 1 + i * 2, y + 1, 2, 2);
    px(ctx, shade(fruit, 0.15), x + 1, y + 1, 1, 1);
  }
}

function drawMenuBoard(ctx: Ctx): void {
  px(ctx, PALETTE.woodDark, 3, 2, 10, 13);
  px(ctx, PALETTE.ink, 4, 3, 8, 9);
  px(ctx, PALETTE.white, 5, 5, 6, 1);
  px(ctx, shade(PALETTE.white, -0.3), 5, 7, 5, 1);
  px(ctx, shade(PALETTE.white, -0.3), 5, 9, 4, 1);
  px(ctx, PALETTE.amber, 9, 9, 2, 1);
}

function drawHoop(ctx: Ctx): void {
  px(ctx, PALETTE.metal, 7, 10, 2, 22);
  px(ctx, PALETTE.white, 2, 1, 12, 8);
  px(ctx, shade(PALETTE.white, -0.2), 2, 8, 12, 1);
  px(ctx, '#c0493f', 5, 4, 6, 3);
  px(ctx, PALETTE.amber, 5, 9, 6, 2);
}

// ------------------------------------------------------------- interiores

function drawWardrobe(ctx: Ctx): void {
  px(ctx, PALETTE.woodDark, 1, 2, 14, 30);
  px(ctx, PALETTE.wood, 2, 3, 12, 28);
  px(ctx, PALETTE.woodLit, 2, 3, 12, 1);
  px(ctx, PALETTE.woodDark, 7, 4, 1, 26);
  px(ctx, PALETTE.amber, 5, 16, 1, 3);
  px(ctx, PALETTE.amber, 9, 16, 1, 3);
}

function drawSofa(ctx: Ctx): void {
  const c = '#4f6f8a';
  px(ctx, shade(c, -0.12), 0, 3, TILE * 2, 12);
  px(ctx, c, 1, 3, TILE * 2 - 2, 6);
  px(ctx, shade(c, 0.08), 3, 9, 12, 4);
  px(ctx, shade(c, 0.08), 17, 9, 12, 4);
  px(ctx, shade(c, 0.12), 1, 3, TILE * 2 - 2, 1);
}

function drawWeightBench(ctx: Ctx): void {
  px(ctx, PALETTE.metal, 3, 11, 2, 4);
  px(ctx, PALETTE.metal, 11, 11, 2, 4);
  px(ctx, PALETTE.ink, 2, 6, 12, 5);
  px(ctx, shade(PALETTE.ink, 0.1), 2, 6, 12, 1);
  px(ctx, PALETTE.metalLit, 0, 3, TILE, 1);
  px(ctx, PALETTE.ink, 0, 1, 2, 5);
  px(ctx, PALETTE.ink, 14, 1, 2, 5);
}

function drawLockers(ctx: Ctx): void {
  const w = TILE * 2;
  px(ctx, shade(PALETTE.glassLit, -0.35), 0, 2, w, 30);
  for (let i = 0; i < 4; i++) {
    const x = i * 8;
    px(ctx, shade(PALETTE.glassLit, -0.25), x + 1, 3, 6, 27);
    px(ctx, shade(PALETTE.glassLit, -0.1), x + 1, 3, 6, 1);
    px(ctx, PALETTE.ink, x + 2, 6, 4, 1);
    px(ctx, PALETTE.ink, x + 2, 8, 4, 1);
    px(ctx, PALETTE.metalLit, x + 5, 16, 1, 3);
  }
}

function drawClothesRack(ctx: Ctx): void {
  const w = TILE * 2;
  px(ctx, PALETTE.metal, 2, 6, 1, 25);
  px(ctx, PALETTE.metal, w - 3, 6, 1, 25);
  px(ctx, PALETTE.metalLit, 2, 6, w - 4, 1);
  const cloth = ['#5c6fa8', '#c08a4a', PALETTE.white, '#8c5a6e', PALETTE.leafLit, PALETTE.ink, '#c0493f'];
  for (let i = 0; i < 7; i++) {
    const c = cloth[i % cloth.length];
    px(ctx, c, 4 + Math.round(i * 3.5), 8, 3, 14 + (i % 3) * 2);
    px(ctx, shade(c, 0.12), 4 + Math.round(i * 3.5), 8, 3, 1);
  }
  px(ctx, PALETTE.metal, 1, 30, w - 2, 1);
}

function drawMannequin(ctx: Ctx): void {
  px(ctx, shade(PALETTE.white, -0.15), 6, 2, 4, 4);
  px(ctx, shade(PALETTE.white, -0.15), 7, 6, 2, 2);
  px(ctx, '#8c5a6e', 4, 8, 8, 10);
  px(ctx, shade('#8c5a6e', 0.12), 4, 8, 8, 1);
  px(ctx, PALETTE.ink, 5, 18, 6, 6);
  px(ctx, PALETTE.metal, 7, 24, 2, 6);
  px(ctx, PALETTE.metal, 4, 29, 8, 2);
}

function drawFittingRoom(ctx: Ctx): void {
  px(ctx, PALETTE.woodDark, 0, 2, TILE, 30);
  px(ctx, PALETTE.metalLit, 1, 4, 14, 1);
  const curtain = '#7a4a52';
  px(ctx, curtain, 2, 5, 12, 25);
  for (let x = 3; x < 14; x += 3) px(ctx, shade(curtain, -0.08), x, 5, 1, 25);
  px(ctx, shade(curtain, 0.1), 2, 5, 12, 1);
}

function drawRegister(ctx: Ctx): void {
  px(ctx, PALETTE.stone, 0, 6, TILE, 10);
  px(ctx, PALETTE.wood, 0, 4, TILE, 3);
  px(ctx, PALETTE.woodLit, 0, 4, TILE, 1);
  px(ctx, PALETTE.ink, 4, 0, 8, 5);
  px(ctx, PALETTE.glassLit, 5, 1, 6, 2);
  px(ctx, PALETTE.metal, 5, 5, 6, 1);
}

function drawFridge(ctx: Ctx): void {
  px(ctx, PALETTE.metal, 1, 2, 14, 30);
  px(ctx, PALETTE.metalLit, 1, 2, 14, 2);
  px(ctx, shade(PALETTE.glass, 0.1), 2, 5, 12, 24);
  const items = [PALETTE.white, PALETTE.amber, '#c0493f', PALETTE.glassLit, PALETTE.leafLit];
  for (let r = 0; r < 4; r++) {
    px(ctx, PALETTE.metal, 2, 10 + r * 5, 12, 1);
    for (let c = 0; c < 5; c++) px(ctx, items[(r * 2 + c) % items.length], 3 + c * 2, 7 + r * 5, 1, 3);
  }
  glow(ctx, 8, 16, 9, 0.1, PALETTE.glassLit);
}

/** Góndola vista desde arriba: el pasillo se lee por los colores de los productos. */
function drawGondola(ctx: Ctx): void {
  px(ctx, PALETTE.metal, 1, 1, 14, 14);
  px(ctx, PALETTE.metalLit, 1, 1, 14, 1);
  px(ctx, shade(PALETTE.metal, -0.1), 7, 2, 2, 12);
  const items = ['#c0493f', PALETTE.amber, PALETTE.glassLit, PALETTE.white, '#5c6fa8', PALETTE.leafLit];
  for (let r = 0; r < 5; r++) {
    px(ctx, items[r % items.length], 2, 3 + r * 2, 4, 1);
    px(ctx, items[(r + 3) % items.length], 10, 3 + r * 2, 4, 1);
  }
}

/** Mesa de reuniones de tres tiles con sillas a los lados largos. */
function drawMeetingTable(ctx: Ctx): void {
  const w = TILE * 3;
  for (let x = 6; x < w - 4; x += 9) {
    px(ctx, PALETTE.ink, x, 0, 6, 3);
    px(ctx, PALETTE.ink, x, 13, 6, 3);
  }
  px(ctx, PALETTE.woodDark, 1, 3, w - 2, 10);
  px(ctx, PALETTE.wood, 2, 3, w - 4, 8);
  px(ctx, PALETTE.woodLit, 2, 3, w - 4, 1);
  px(ctx, PALETTE.white, 10, 6, 5, 3);
  px(ctx, PALETTE.white, 30, 5, 4, 4);
  px(ctx, PALETTE.glassLit, 21, 6, 6, 3);
}

/** Chorro de la fuente: se anima en Ambience; la base del prop ya tiene el agua. */
function drawSpray(ctx: Ctx): void {
  px(ctx, shade(PALETTE.waterLit, 0.2), 3, 0, 2, 3);
  px(ctx, PALETTE.white, 3, 0, 2, 1);
  px(ctx, shade(PALETTE.waterLit, 0.12), 1, 2, 2, 4);
  px(ctx, shade(PALETTE.waterLit, 0.12), 5, 2, 2, 4);
  px(ctx, PALETTE.waterLit, 0, 5, 1, 2);
  px(ctx, PALETTE.waterLit, 7, 5, 1, 2);
}

function drawCooler(ctx: Ctx): void {
  px(ctx, PALETTE.white, 4, 16, 8, 15);
  px(ctx, shade(PALETTE.white, -0.15), 4, 29, 8, 2);
  px(ctx, PALETTE.ink, 7, 20, 2, 2);
  px(ctx, shade(PALETTE.glassLit, -0.1), 5, 4, 6, 12);
  px(ctx, PALETTE.glassLit, 5, 4, 6, 2);
  px(ctx, PALETTE.white, 6, 6, 1, 8);
}

// ------------------------------------------------ pared, barra y techo

/** Ventana de interior sobre la cara del muro: marco, cielo y visillos. */
function drawWindow(ctx: Ctx): void {
  px(ctx, PALETTE.woodDark, 2, 2, 28, 13);
  px(ctx, '#9cc3d6', 4, 4, 24, 9);
  px(ctx, '#bcd8e4', 4, 4, 24, 3);
  px(ctx, PALETTE.woodDark, 15, 4, 2, 9);
  px(ctx, PALETTE.white, 4, 4, 4, 9);
  px(ctx, PALETTE.white, 24, 4, 4, 9);
  px(ctx, shade(PALETTE.white, -0.08), 7, 4, 1, 9);
  px(ctx, shade(PALETTE.white, -0.08), 24, 4, 1, 9);
  px(ctx, PALETTE.woodLit, 1, 14, 30, 2);
}

function drawPainting(ctx: Ctx): void {
  px(ctx, PALETTE.woodDark, 2, 3, 12, 10);
  px(ctx, '#e7d8b4', 3, 4, 10, 8);
  px(ctx, '#7aa0b8', 3, 4, 10, 4);
  px(ctx, PALETTE.leaf, 3, 8, 10, 4);
  px(ctx, PALETTE.amber, 9, 5, 2, 2);
}

function drawClock(ctx: Ctx): void {
  px(ctx, PALETTE.ink, 5, 3, 6, 8);
  px(ctx, PALETTE.ink, 4, 4, 8, 6);
  px(ctx, PALETTE.white, 5, 4, 6, 6);
  px(ctx, PALETTE.ink, 8, 5, 1, 3);
  px(ctx, PALETTE.ink, 8, 7, 2, 1);
}

/** Pizarra de carta en la pared: tiza blanca y un precio en ámbar. */
function drawChalkboard(ctx: Ctx): void {
  px(ctx, PALETTE.woodDark, 1, 2, 30, 13);
  px(ctx, '#27302b', 2, 3, 28, 11);
  for (let y = 5; y < 13; y += 2) {
    px(ctx, shade(PALETTE.white, -0.2), 4, y, 12 + ((y * 3) % 7), 1);
    px(ctx, PALETTE.amber, 24, y, 3, 1);
  }
  px(ctx, PALETTE.white, 4, 4, 9, 1);
}

/** Rótulo de neón del gimnasio: dos trazos que brillan con luz propia. */
function drawNeon(ctx: Ctx): void {
  px(ctx, PALETTE.ink, 1, 4, 30, 9);
  px(ctx, '#8ff0ff', 4, 6, 10, 1);
  px(ctx, '#8ff0ff', 4, 6, 1, 5);
  px(ctx, '#8ff0ff', 4, 8, 7, 1);
  px(ctx, '#ff7ab8', 17, 6, 1, 5);
  px(ctx, '#ff7ab8', 17, 10, 11, 1);
  px(ctx, '#ff7ab8', 27, 6, 1, 5);
}

/** Balda de pared con ropa doblada por colores. */
function drawWallShelf(ctx: Ctx): void {
  const piles = ['#c9743f', '#3f6f78', PALETTE.white, '#8c5a6e', '#2a2430', '#b98a52', '#5c7c3e'];
  for (const y of [5, 12]) {
    px(ctx, PALETTE.woodLit, 1, y + 2, 30, 1);
    px(ctx, PALETTE.woodDark, 1, y + 3, 30, 1);
    piles.forEach((c, i) => {
      px(ctx, c, 2 + i * 4, y - 1, 3, 3);
      px(ctx, shade(c, 0.12), 2 + i * 4, y - 1, 3, 1);
    });
  }
}

/** Cafetera de barra: cuerpo de acero, dos grupos y tazas encima. */
function drawEspresso(ctx: Ctx): void {
  px(ctx, PALETTE.metal, 2, 2, 12, 7);
  px(ctx, PALETTE.metalLit, 2, 2, 12, 1);
  px(ctx, PALETTE.ink, 4, 6, 2, 2);
  px(ctx, PALETTE.ink, 10, 6, 2, 2);
  px(ctx, '#c0493f', 7, 4, 2, 1);
  px(ctx, PALETTE.white, 3, 0, 2, 2);
  px(ctx, PALETTE.white, 11, 0, 2, 2);
}

/** Vitrina de dulces: cristal sobre bandejas de colores. */
function drawPastryCase(ctx: Ctx): void {
  px(ctx, shade(PALETTE.glass, 0.25), 1, 1, 14, 8);
  px(ctx, '#bcd8e4', 1, 1, 14, 1);
  for (let x = 2; x < 14; x += 3) {
    px(ctx, PALETTE.amber, x, 4, 2, 2);
    px(ctx, '#8c5a3a', x, 7, 2, 1);
  }
  px(ctx, PALETTE.metal, 1, 9, 14, 1);
}

/** Lámpara colgante: cable y pantalla una baldosa por encima de su base. */
function drawPendant(ctx: Ctx): void {
  px(ctx, PALETTE.ink, 7, 0, 1, 10);
  px(ctx, PALETTE.woodDark, 4, 10, 8, 2);
  px(ctx, PALETTE.amberDim, 3, 12, 10, 3);
  px(ctx, '#f6e2b0', 5, 15, 6, 1);
}

/** Tubo fluorescente: una regleta larga y fría. */
function drawTubeLight(ctx: Ctx): void {
  px(ctx, PALETTE.ink, 7, 0, 1, 8);
  px(ctx, PALETTE.ink, 24, 0, 1, 8);
  px(ctx, PALETTE.metal, 3, 8, 26, 3);
  px(ctx, '#eaf6ff', 4, 10, 24, 2);
}

/** Lámpara de pie: pie de hierro y pantalla de tela encendida por dentro. */
function drawFloorLamp(ctx: Ctx): void {
  px(ctx, PALETTE.ink, 4, 29, 8, 2);
  px(ctx, PALETTE.metal, 7, 11, 2, 18);
  px(ctx, PALETTE.metalLit, 7, 11, 1, 18);
  px(ctx, PALETTE.amberDim, 3, 3, 10, 8);
  px(ctx, PALETTE.amber, 4, 3, 4, 7);
  px(ctx, '#f6e2b0', 4, 10, 8, 1);
}

/** Mesa baja de tienda: madera y montones de ropa doblada, cada uno de su color y altura. */
function drawDisplayTable(ctx: Ctx): void {
  const w = TILE * 2;
  px(ctx, PALETTE.woodDark, 1, 6, w - 2, 9);
  px(ctx, PALETTE.wood, 2, 6, w - 4, 6);
  px(ctx, PALETTE.woodLit, 2, 6, w - 4, 1);
  const folds = [PALETTE.white, '#5c6fa8', '#b8423a', '#8aa05a', '#2a2830'];
  folds.forEach((color, i) => {
    const h = 2 + ((i * 2) % 3);
    const x = 4 + i * 5;
    px(ctx, color, x, 10 - h, 4, h);
    px(ctx, shade(color, 0.12), x, 10 - h, 4, 1);
    px(ctx, shade(color, -0.18), x, 10, 4, 1);
  });
}

/**
 * Perchero de calle, 16 × 32: dos patas abiertas con ruedas, la barra a la altura del pecho y prendas colgadas,
 * cada surtido con sus colores y su largo (el vintage no cuelga todo igual), y una etiqueta de precio.
 */
function drawStreetRack(ctx: Ctx, v: number): void {
  const sets: readonly (readonly string[])[] = [
    ['#4f6a8c', '#d8b04a', '#c0493f', '#e6dcc0', '#6a7a3f', '#2b2d33'],
    ['#7a3f5a', '#3f6f78', '#e6dcc0', '#b8674a', '#4f6a8c', '#d8b04a'],
    ['#232329', '#c0493f', '#8aa05a', '#e6e0d4', '#5a4a7a', '#c9a27a'],
  ];
  const colors = sets[v % sets.length];
  // Patas y ruedas.
  px(ctx, PALETTE.metal, 2, 28, 1, 2);
  px(ctx, PALETTE.metal, 13, 28, 1, 2);
  px(ctx, PALETTE.metal, 3, 27, 10, 1);
  px(ctx, PALETTE.ink, 1, 30, 3, 2);
  px(ctx, PALETTE.ink, 12, 30, 3, 2);
  // Montantes y barra.
  px(ctx, PALETTE.metalLit, 2, 8, 1, 20);
  px(ctx, PALETTE.metalLit, 13, 8, 1, 20);
  px(ctx, PALETTE.metalLit, 2, 8, 12, 1);
  px(ctx, shade(PALETTE.metal, -0.2), 2, 9, 12, 1);
  // Prendas: cada una con su percha, su luz a la izquierda y su sombra a la derecha.
  for (let i = 0; i < 6; i++) {
    const x = 3 + i * 2;
    const c = colors[i];
    const h = 9 + ((i * 5 + v * 3) % 5);
    px(ctx, PALETTE.metal, x, 9, 1, 1);
    px(ctx, c, x, 10, 2, h);
    px(ctx, shade(c, 0.18), x, 10, 1, h);
    px(ctx, shade(c, -0.22), x + 1, 12, 1, h - 2);
  }
  // Etiqueta de precio colgada del extremo.
  px(ctx, PALETTE.white, 12, 11, 2, 3);
  px(ctx, '#c0493f', 12, 11, 2, 1);
}

/** Pizarra de bar en A, 16 × 32: dos patas de madera, el tablero con una caña y una raya de tiza, y el marco. */
function drawSandwichBoard(ctx: Ctx): void {
  px(ctx, PALETTE.woodDark, 2, 22, 2, 9);
  px(ctx, PALETTE.woodDark, 12, 22, 2, 9);
  px(ctx, PALETTE.outline, 1, 8, 14, 19);
  px(ctx, '#2a2e2a', 2, 9, 12, 17);
  px(ctx, shade('#2a2e2a', 0.12), 2, 9, 12, 1);
  // Una caña con espuma, el asa y dos líneas de precios.
  px(ctx, '#e6e0d4', 4, 11, 5, 2);
  px(ctx, PALETTE.amber, 4, 13, 5, 5);
  px(ctx, shade(PALETTE.amber, 0.25), 5, 13, 1, 5);
  px(ctx, '#e6e0d4', 9, 14, 2, 1);
  px(ctx, '#e6e0d4', 10, 15, 1, 2);
  px(ctx, '#e6e0d4', 9, 17, 2, 1);
  px(ctx, '#e6e0d4', 4, 20, 8, 1);
  px(ctx, '#c9a27a', 4, 22, 5, 1);
  px(ctx, PALETTE.woodDark, 1, 27, 14, 1);
}

export function buildPropTextures(scene: Phaser.Scene): void {
  for (let v = 0; v < 3; v++) make(scene, `prop-street-rack-${v}`, TILE, TILE * 2, (ctx) => drawStreetRack(ctx, v));
  make(scene, 'prop-sandwich-board', TILE, TILE * 2, drawSandwichBoard);
  buildGymTextures(scene);
  buildSeatTextures(scene);
  buildDiningTextures(scene);
  make(scene, 'prop-floor-lamp', TILE, TILE * 2, drawFloorLamp);
  make(scene, 'prop-display-table', TILE * 2, TILE, drawDisplayTable);
  make(scene, 'prop-window', TILE * 2, TILE, drawWindow);
  make(scene, 'prop-painting', TILE, TILE, drawPainting);
  make(scene, 'prop-clock', TILE, TILE, drawClock);
  make(scene, 'prop-chalkboard', TILE * 2, TILE, drawChalkboard);
  make(scene, 'prop-neon', TILE * 2, TILE, drawNeon);
  make(scene, 'prop-wall-shelf', TILE * 2, TILE, drawWallShelf);
  make(scene, 'prop-espresso', TILE, TILE, drawEspresso);
  make(scene, 'prop-pastry-case', TILE, TILE, drawPastryCase);
  make(scene, 'prop-pendant', TILE, TILE * 2, drawPendant);
  make(scene, 'prop-tube-light', TILE * 2, TILE * 2, drawTubeLight);

  for (let v = 0; v < 2; v++) {
    make(scene, `tile-court-${v}`, TILE, TILE, (ctx) => drawCourt(ctx, v));
    make(scene, `tile-office-carpet-${v}`, TILE, TILE, (ctx) => drawOfficeCarpet(ctx, v));
  }
  for (let v = 0; v < 3; v++) make(scene, `tile-dance-floor-${v}`, TILE, TILE, (ctx) => drawDanceFloor(ctx, v));
  make(scene, 'prop-dj-booth', TILE * 3, TILE, drawDjBooth);
  make(scene, 'prop-speaker', TILE, TILE * 2, drawSpeaker);
  make(scene, 'prop-bottles', TILE * 2, TILE, drawBottles);
  make(scene, 'prop-wine-rack', TILE, TILE * 2, drawWineRack);
  make(scene, 'prop-barber-chair', TILE, TILE * 2, drawBarberChair);
  make(scene, 'prop-tattoo-chair', TILE, TILE * 2, drawTattooChair);
  make(scene, 'prop-tattoo-cart', TILE, TILE * 2, drawTattooCart);
  make(scene, 'prop-flash-wall', TILE * 2, TILE, drawFlashWall);
  make(scene, 'prop-sneaker-wall', TILE * 2, TILE, drawSneakerWall);
  make(scene, 'prop-bargain-bin', TILE * 2, TILE, drawBargainBin);
  make(scene, 'prop-poster-column', TILE, TILE * 3, drawPosterColumn);
  make(scene, 'prop-car-taxi', TILE * 2, TILE, (ctx) => drawParked(ctx, 'taxi', 0));
  make(scene, 'prop-ticket-machine', TILE, TILE * 2, drawTicketMachine);

  make(scene, 'prop-fountain', TILE * 3, TILE * 2, drawFountain);
  make(scene, 'prop-kiosk', TILE * 2, TILE * 2, drawKiosk);
  make(scene, 'prop-bus-stop', TILE * 3, TILE * 2, drawBusStop);
  make(scene, 'prop-car', TILE * 2, TILE, (ctx) => drawParked(ctx, 'sedan', 0));
  make(scene, 'prop-car-b', TILE * 2, TILE, (ctx) => drawParked(ctx, 'sedan', 1));
  make(scene, 'prop-car-c', TILE * 2, TILE, (ctx) => drawParked(ctx, 'compact', 1));
  make(scene, 'prop-van', TILE * 3, TILE * 2, drawVan);
  make(scene, 'prop-bike', TILE, TILE, drawBike);
  make(scene, 'prop-bin', TILE, TILE, drawBin);
  make(scene, 'prop-vending', TILE, TILE * 2, drawVending);
  make(scene, 'prop-produce', TILE, TILE, drawProduce);
  make(scene, 'prop-menu-board', TILE, TILE, drawMenuBoard);
  make(scene, 'prop-hoop', TILE, TILE * 2, drawHoop);

  make(scene, 'prop-wardrobe', TILE, TILE * 2, drawWardrobe);
  make(scene, 'prop-sofa', TILE * 2, TILE, drawSofa);
  make(scene, 'prop-weight-bench', TILE, TILE, drawWeightBench);
  make(scene, 'prop-lockers', TILE * 2, TILE * 2, drawLockers);
  make(scene, 'prop-clothes-rack', TILE * 2, TILE * 2, drawClothesRack);
  make(scene, 'prop-mannequin', TILE, TILE * 2, drawMannequin);
  make(scene, 'prop-fitting-room', TILE, TILE * 2, drawFittingRoom);
  make(scene, 'prop-register', TILE, TILE, drawRegister);
  make(scene, 'prop-fridge', TILE, TILE * 2, drawFridge);
  make(scene, 'prop-gondola', TILE, TILE, drawGondola);
  make(scene, 'prop-cooler', TILE, TILE * 2, drawCooler);
  make(scene, 'prop-meeting-table', TILE * 3, TILE, drawMeetingTable);
  make(scene, 'fx-spray', 8, 7, drawSpray);
}
