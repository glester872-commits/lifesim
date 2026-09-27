import type Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import { glow, make, px, shade, sprinkle, type Ctx } from './paint';

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

function drawGymFloor(ctx: Ctx, variant: number): void {
  const base = shade(PALETTE.night, 0.1);
  px(ctx, base, 0, 0, TILE, TILE);
  px(ctx, shade(base, -0.03), 0, 0, TILE, 1);
  px(ctx, shade(base, -0.03), 0, 0, 1, TILE);
  sprinkle(ctx, shade(base, 0.05), TILE, TILE, 3 + variant, 18);
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

/** Taxi: el blanco de siempre con la franja roja y la luz verde de libre en el techo. */
function drawTaxi(ctx: Ctx): void {
  drawCar(ctx, PALETTE.white);
  px(ctx, '#c0493f', 1, 9, TILE * 2 - 2, 1);
  px(ctx, PALETTE.leafLit, 15, 2, 2, 1);
}

function drawCar(ctx: Ctx, body: string): void {
  const w = TILE * 2;
  px(ctx, 'rgba(0,0,0,0.35)', 2, 13, w - 3, 3);
  px(ctx, shade(body, -0.12), 1, 4, w - 2, 10);
  px(ctx, body, 1, 3, w - 2, 9);
  px(ctx, shade(body, 0.1), 2, 3, w - 4, 1);
  px(ctx, PALETTE.glass, 9, 4, 12, 6);
  px(ctx, PALETTE.glassLit, 9, 4, 12, 1);
  px(ctx, shade(body, -0.05), 14, 4, 1, 6);
  px(ctx, PALETTE.ink, 4, 12, 4, 3);
  px(ctx, PALETTE.ink, w - 8, 12, 4, 3);
  px(ctx, PALETTE.amber, w - 2, 5, 1, 2);
  px(ctx, '#c0493f', 1, 5, 1, 2);
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

function drawTreadmill(ctx: Ctx): void {
  px(ctx, PALETTE.metal, 3, 2, 10, 5);
  px(ctx, PALETTE.ink, 4, 3, 8, 3);
  px(ctx, PALETTE.glassLit, 5, 4, 3, 1);
  px(ctx, PALETTE.metalLit, 2, 6, 1, 8);
  px(ctx, PALETTE.metalLit, 13, 6, 1, 8);
  px(ctx, PALETTE.ink, 3, 10, 10, 20);
  px(ctx, shade(PALETTE.ink, 0.08), 4, 11, 8, 18);
  for (let y = 13; y < 29; y += 3) px(ctx, shade(PALETTE.ink, 0.14), 4, y, 8, 1);
  px(ctx, PALETTE.metal, 3, 29, 10, 2);
}

function drawWeights(ctx: Ctx): void {
  px(ctx, PALETTE.metal, 2, 4, 2, 27);
  px(ctx, PALETTE.metal, 12, 4, 2, 27);
  for (const y of [8, 15, 22]) {
    px(ctx, PALETTE.metalLit, 2, y + 3, 12, 1);
    px(ctx, PALETTE.ink, 4, y, 3, 4);
    px(ctx, PALETTE.ink, 9, y, 3, 4);
  }
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

function drawMirror(ctx: Ctx): void {
  const w = TILE * 2;
  px(ctx, PALETTE.metal, 1, 1, w - 2, 14);
  px(ctx, shade(PALETTE.glass, 0.12), 2, 2, w - 4, 12);
  px(ctx, shade(PALETTE.glassLit, -0.1), 4, 3, 2, 10);
  px(ctx, shade(PALETTE.glassLit, -0.25), 7, 3, 1, 10);
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

export function buildPropTextures(scene: Phaser.Scene): void {
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
    make(scene, `tile-gym-floor-${v}`, TILE, TILE, (ctx) => drawGymFloor(ctx, v));
    make(scene, `tile-court-${v}`, TILE, TILE, (ctx) => drawCourt(ctx, v));
    make(scene, `tile-office-carpet-${v}`, TILE, TILE, (ctx) => drawOfficeCarpet(ctx, v));
  }
  for (let v = 0; v < 3; v++) make(scene, `tile-dance-floor-${v}`, TILE, TILE, (ctx) => drawDanceFloor(ctx, v));
  make(scene, 'prop-dj-booth', TILE * 3, TILE, drawDjBooth);
  make(scene, 'prop-speaker', TILE, TILE * 2, drawSpeaker);
  make(scene, 'prop-bottles', TILE * 2, TILE, drawBottles);
  make(scene, 'prop-car-taxi', TILE * 2, TILE, drawTaxi);
  make(scene, 'prop-ticket-machine', TILE, TILE * 2, drawTicketMachine);

  make(scene, 'prop-fountain', TILE * 3, TILE * 2, drawFountain);
  make(scene, 'prop-kiosk', TILE * 2, TILE * 2, drawKiosk);
  make(scene, 'prop-bus-stop', TILE * 3, TILE * 2, drawBusStop);
  make(scene, 'prop-car', TILE * 2, TILE, (ctx) => drawCar(ctx, '#7a4a52'));
  make(scene, 'prop-car-b', TILE * 2, TILE, (ctx) => drawCar(ctx, PALETTE.stoneLit));
  make(scene, 'prop-car-c', TILE * 2, TILE, (ctx) => drawCar(ctx, '#3f6f78'));
  make(scene, 'prop-van', TILE * 3, TILE * 2, drawVan);
  make(scene, 'prop-bike', TILE, TILE, drawBike);
  make(scene, 'prop-bin', TILE, TILE, drawBin);
  make(scene, 'prop-vending', TILE, TILE * 2, drawVending);
  make(scene, 'prop-produce', TILE, TILE, drawProduce);
  make(scene, 'prop-menu-board', TILE, TILE, drawMenuBoard);
  make(scene, 'prop-hoop', TILE, TILE * 2, drawHoop);

  make(scene, 'prop-wardrobe', TILE, TILE * 2, drawWardrobe);
  make(scene, 'prop-sofa', TILE * 2, TILE, drawSofa);
  make(scene, 'prop-treadmill', TILE, TILE * 2, drawTreadmill);
  make(scene, 'prop-weights', TILE, TILE * 2, drawWeights);
  make(scene, 'prop-weight-bench', TILE, TILE, drawWeightBench);
  make(scene, 'prop-lockers', TILE * 2, TILE * 2, drawLockers);
  make(scene, 'prop-mirror', TILE * 2, TILE, drawMirror);
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
