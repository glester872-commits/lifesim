import type Phaser from 'phaser';
import { PALETTE } from '../config/constants';
import type { PopUpPiece } from '../data/popups';
import { make, px, shade, type Ctx } from './paint';
import { drawHuman } from './HumanArt';
import { VENDOR_LOOKS, type VendorLook } from '../data/vendorLooks';

/**
 * Las piezas de los eventos de la Calle del Carmen (data/popups.ts), dibujadas
 * desde PALETTE como todo lo demás: puestos con toldo y percha, una carpa, la
 * cabina del DJ, caballetes, la pizarra de una cola y cajas de zapatillas. Cada
 * pieza crece hacia arriba desde su fila base y lleva la luz del noroeste; la
 * sombra de contacto la pone world/PopUpView.
 */

const CLOTHES = ['#4f6a8c', '#d8b04a', '#c0493f', '#6a7a3f', '#e6dcc0', '#7a3f5a', '#3f6f78', '#2b2d33'] as const;
const CANVAS = ['#ff6ab8', '#5ad8ff', '#d8b04a', '#8c3f6a', '#3f6f5a', '#e6e0d4'] as const;

export const pieceKey = (piece: PopUpPiece): string => `pu-${piece}`;
export const PIECE_SIZE: Readonly<Record<PopUpPiece, readonly [number, number]>> = {
  'stall-vintage': [32, 30],
  'stall-fashion': [32, 30],
  tent: [48, 38],
  booth: [32, 30],
  easel: [16, 30],
  'sign-sneaker': [16, 28],
  boxes: [16, 22],
  carpet: [48, 20],
  'stall-fruit': [32, 30],
  'stall-clothes': [32, 30],
  'stall-books': [32, 30],
  'stall-junk': [32, 30],
};

/** Ruido determinista para la mercancía del Gran Rastro: cada familia con su grano, sin recuadros alternos. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Postes del toldo, de la fila 7 al suelo. */
function posts(ctx: Ctx): void {
  for (const x of [1, 30]) {
    px(ctx, shade(PALETTE.woodDark, 0.1), x, 7, 1, 23);
    px(ctx, shade(PALETTE.woodDark, 0.3), x, 7, 1, 1);
  }
}

/** Mesa de caballetes: tablero con luz en `top`, frente en sombra hasta la fila 28 y patas. */
function table(ctx: Ctx, top: number): void {
  px(ctx, PALETTE.woodDark, 1, top + 2, 30, 27 - top);
  px(ctx, shade(PALETTE.woodDark, -0.18), 1, 28, 30, 1);
  px(ctx, PALETTE.wood, 1, top, 30, 2);
  px(ctx, shade(PALETTE.wood, 0.18), 1, top, 30, 1);
  px(ctx, PALETTE.woodDark, 2, 29, 2, 1);
  px(ctx, PALETTE.woodDark, 28, 29, 2, 1);
}

/** Fruta: toldo verde y blanco, tres cajas inclinadas con su montón, pizarrita de precio y la balanza colgada. */
function drawFruitStall(ctx: Ctx): void {
  const r = lcg(0xf7a1);
  const FRUIT = [PALETTE.brick, PALETTE.amber, PALETTE.floorTape, PALETTE.leafLit, PALETTE.rug] as const;
  posts(ctx);
  awning(ctx, 32, PALETTE.leaf, PALETTE.white);
  px(ctx, PALETTE.metal, 24, 11, 5, 1);
  px(ctx, PALETTE.metalLit, 26, 9, 1, 2);
  table(ctx, 21);
  [2, 12, 22].forEach((x0, k) => {
    const c = FRUIT[(k * 2 + Math.floor(r() * 2)) % FRUIT.length];
    for (let i = 0; i < 10; i++) {
      const x = x0 + Math.floor(r() * 8);
      const y = 14 + Math.floor(r() * 2) + (Math.abs(x - x0 - 4) > 2 ? 1 : 0);
      px(ctx, c, x, y, 2, 2);
      px(ctx, shade(c, 0.25), x, y, 1, 1);
    }
    px(ctx, PALETTE.woodLit, x0, 17, 9, 4);
    px(ctx, PALETTE.woodDark, x0, 18, 9, 1);
    px(ctx, shade(PALETTE.woodLit, -0.2), x0, 20, 9, 1);
  });
  px(ctx, PALETTE.ink, 13, 23, 6, 4);
  px(ctx, PALETTE.white, 14, 24, 3, 1);
  px(ctx, PALETTE.white, 14, 25, 2, 1);
}

/** Ropa: toldo liso con festón, una barra larga de prendas hasta abajo, cajón de lo doblado y un espejo de pie. */
function drawClothesStall(ctx: Ctx): void {
  const r = lcg(0xc107);
  const c0 = PALETTE.brick;
  posts(ctx);
  px(ctx, c0, 0, 1, 32, 6);
  px(ctx, shade(c0, 0.14), 0, 1, 32, 1);
  px(ctx, shade(c0, -0.12), 0, 5, 32, 2);
  for (let x = 0; x < 32; x += 4) {
    px(ctx, shade(c0, -0.12), x, 7, 4, 1);
    px(ctx, shade(c0, -0.12), x + 1, 8, 2, 1);
  }
  ctx.globalAlpha = 0.28;
  px(ctx, PALETTE.ink, 0, 9, 32, 3);
  ctx.globalAlpha = 1;
  px(ctx, PALETTE.metalLit, 2, 11, 23, 1);
  for (let x = 3; x < 24; x += 3) {
    const c = CLOTHES[Math.floor(r() * CLOTHES.length)];
    const h = 8 + Math.floor(r() * 6);
    px(ctx, PALETTE.metal, x + 1, 10, 1, 1);
    px(ctx, c, x, 12, 3, h);
    px(ctx, shade(c, 0.16), x, 12, 1, h);
    px(ctx, shade(c, -0.2), x + 2, 12, 1, h);
  }
  px(ctx, PALETTE.woodDark, 3, 24, 20, 5);
  px(ctx, PALETTE.wood, 3, 24, 20, 1);
  for (let x = 4; x < 21; x += 4) px(ctx, CLOTHES[Math.floor(r() * CLOTHES.length)], x, 22, 3, 2);
  px(ctx, PALETTE.woodDark, 26, 12, 4, 17);
  px(ctx, PALETTE.glass, 27, 13, 2, 14);
  px(ctx, PALETTE.glassLit, 27, 14, 1, 4);
  px(ctx, PALETTE.woodDark, 25, 29, 6, 1);
}

/** Libros y antigüedades: sombrilla redonda, mesa con lomos de colores, un cuadro apoyado y un quinqué. */
function drawBooksStall(ctx: Ctx): void {
  const r = lcg(0xb00c);
  const SPINES = [PALETTE.brick, PALETTE.rug, PALETTE.glass, PALETTE.leaf, PALETTE.woodLit, PALETTE.white, PALETTE.amberDim] as const;
  const top = PALETTE.rug;
  px(ctx, PALETTE.metal, 15, 8, 2, 12);
  for (let i = 0; i < 7; i++) {
    const w = 12 + i * 3;
    const x0 = Math.floor((32 - w) / 2);
    const half = Math.floor(w * 0.55);
    px(ctx, i < 2 ? shade(top, 0.14) : top, x0, 2 + i, half, 1);
    px(ctx, shade(top, -0.14), x0 + half, 2 + i, w - half, 1);
  }
  for (let x = 2; x < 30; x += 3) px(ctx, shade(top, -0.24), x, 9, 2, 1);
  px(ctx, PALETTE.metalLit, 15, 1, 2, 1);
  table(ctx, 19);
  for (let x = 2; x < 22; ) {
    const c = SPINES[Math.floor(r() * SPINES.length)];
    const h = 3 + Math.floor(r() * 3);
    const w = 1 + Math.floor(r() * 2);
    px(ctx, c, x, 19 - h, w, h);
    px(ctx, shade(c, 0.2), x, 19 - h, w, 1);
    x += w;
  }
  px(ctx, PALETTE.metal, 25, 16, 3, 3);
  px(ctx, PALETTE.amber, 25, 13, 3, 3);
  px(ctx, shade(PALETTE.amber, 0.2), 25, 13, 1, 1);
  px(ctx, PALETTE.woodLit, 3, 21, 9, 8);
  px(ctx, PALETTE.leaf, 4, 22, 7, 6);
  px(ctx, PALETTE.floorTape, 7, 23, 3, 2);
}

/** Segunda mano: lona inclinada sobre dos palos, mesa baja con lámpara, radio y jarrón, y cajas en el suelo. */
function drawJunkStall(ctx: Ctx): void {
  const r = lcg(0x5ec0);
  const tarp = PALETTE.glass;
  for (const [x, y] of [[1, 4], [30, 9]] as const) px(ctx, PALETTE.metal, x, y, 1, 30 - y);
  for (let x = 0; x < 32; x++) {
    const y = 2 + Math.floor(x / 5);
    px(ctx, x < 14 ? shade(tarp, 0.1) : tarp, x, y, 1, 5);
    px(ctx, shade(tarp, -0.2), x, y + 5, 1, 1);
  }
  ctx.globalAlpha = 0.28;
  for (let x = 0; x < 32; x++) px(ctx, PALETTE.ink, x, 8 + Math.floor(x / 5), 1, 2);
  ctx.globalAlpha = 1;
  table(ctx, 22);
  // Lámpara de pie de mesa, radio con rejilla y un jarrón.
  px(ctx, PALETTE.metal, 5, 16, 1, 6);
  px(ctx, PALETTE.amberDim, 3, 13, 5, 3);
  px(ctx, shade(PALETTE.amberDim, 0.2), 3, 13, 5, 1);
  px(ctx, PALETTE.wood, 10, 17, 8, 5);
  px(ctx, PALETTE.metalLit, 11, 18, 4, 3);
  px(ctx, PALETTE.amber, 16, 18, 1, 1);
  px(ctx, PALETTE.brick, 21, 16, 3, 6);
  px(ctx, shade(PALETTE.brick, 0.2), 21, 16, 1, 6);
  // Lo que no cabe en la mesa, en cajas al pie.
  for (let i = 0; i < 4; i++) {
    const x = 18 + Math.floor(r() * 9);
    px(ctx, PALETTE.white, x, 24 + Math.floor(r() * 2), 2, 1);
  }
  px(ctx, PALETTE.woodLit, 24, 25, 6, 4);
  px(ctx, shade(PALETTE.woodLit, -0.2), 24, 28, 6, 1);
}

export { VENDOR_LOOKS };
/** Como cualquier persona del juego (world/HumanArt, 16 × 24 con los pies en la base). */
export const VENDOR_SIZE = [16, 24] as const;
/** PopUpView elige una por puesto, sin azar; hay más looks que vendedores, así que ninguno se repite. */
export const vendorKey = (i: number): string => `pu-vendor-${i % VENDOR_LOOKS.length}`;

/** Quien atiende, de pie y de frente junto a su puesto: el mismo dibujo que el resto de la gente. */
function drawVendor(ctx: Ctx, look: VendorLook): void {
  drawHuman(ctx, 'down', 0, { ...look, clothDark: shade(look.cloth, -0.2) });
}

function awning(ctx: Ctx, w: number, a: string, b: string): void {
  for (let x = 0; x < w; x += 4) {
    px(ctx, a, x, 1, 2, 6);
    px(ctx, b, x + 2, 1, 2, 6);
  }
  px(ctx, shade(a, 0.14), 0, 1, w, 1);
  // Faldón: una lengüeta por raya y la sombra del toldo en lo que queda debajo.
  for (let x = 0; x < w; x += 4) {
    px(ctx, shade(a, -0.16), x, 7, 2, 1);
    px(ctx, shade(b, -0.16), x + 2, 7, 2, 1);
  }
  ctx.globalAlpha = 0.28;
  px(ctx, PALETTE.ink, 0, 8, w, 3);
  ctx.globalAlpha = 1;
}

/** Puesto de ropa: toldo a rayas, percha con prendas, mesa con pilas dobladas y una caja. */
function drawStall(ctx: Ctx, vintage: boolean): void {
  const W = 32;
  const [a, b] = vintage ? (['#e6dcc0', '#b8674a'] as const) : (['#232329', '#e6e0d4'] as const);
  for (const x of [1, 30]) {
    px(ctx, shade(PALETTE.woodDark, 0.1), x, 7, 1, 23);
    px(ctx, shade(PALETTE.woodDark, 0.3), x, 7, 1, 1);
  }
  awning(ctx, W, a, b);
  px(ctx, PALETTE.metalLit, 3, 11, 26, 1);
  for (let i = 0; i < 7; i++) {
    const x = 4 + Math.floor(i * 3.5);
    const c = CLOTHES[(i * 3 + (vintage ? 0 : 2)) % CLOTHES.length];
    const h = 7 + (i % 3);
    px(ctx, PALETTE.metal, x + 1, 10, 1, 1);
    px(ctx, c, x, 12, 3, h);
    px(ctx, shade(c, 0.16), x, 12, 1, h);
    px(ctx, shade(c, -0.2), x + 2, 12, 1, h);
  }
  // Mesa: tablero con luz y frente en sombra, y encima lo doblado.
  px(ctx, PALETTE.woodDark, 1, 23, 30, 6);
  px(ctx, shade(PALETTE.woodDark, -0.18), 1, 28, 30, 1);
  px(ctx, PALETTE.wood, 1, 21, 30, 2);
  px(ctx, shade(PALETTE.wood, 0.18), 1, 21, 30, 1);
  for (const [x, c] of [[3, '#4f6a8c'], [8, '#d8b04a'], [13, '#c0493f'], [20, '#e6dcc0']] as const) {
    px(ctx, c, x, 18, 4, 3);
    px(ctx, shade(c, 0.2), x, 18, 4, 1);
    px(ctx, shade(c, -0.2), x, 20, 4, 1);
  }
  px(ctx, PALETTE.woodDark, 25, 16, 5, 5);
  px(ctx, PALETTE.amber, 26, 17, 3, 2);
  if (!vintage) {
    // Rótulo del pop-up: rosa de neón sobre negro, sin palabras.
    px(ctx, PALETTE.ink, 11, 22, 10, 5);
    px(ctx, '#ff6ab8', 12, 24, 8, 1);
    px(ctx, '#ff6ab8', 15, 23, 2, 3);
  }
  // Patas.
  px(ctx, PALETTE.woodDark, 2, 29, 2, 1);
  px(ctx, PALETTE.woodDark, 28, 29, 2, 1);
}

/** Carpa blanca de dos aguas con el frente abierto: dentro, percheros y un maniquí. */
function drawTent(ctx: Ctx): void {
  const W = 48;
  // Techo a dos aguas, visto desde delante: estrecho en la cumbrera y cada vez más ancho hacia el alero,
  // con la mitad de la derecha en sombra (luz del noroeste) y una cumbrera clara.
  for (let i = 0; i < 12; i++) {
    const w = 8 + Math.round(i * 3.3);
    const x0 = Math.floor((W - w) / 2);
    const half = Math.floor(w * 0.58);
    px(ctx, i < 3 ? '#f4f0e6' : '#e6e0d4', x0, 2 + i, half, 1);
    px(ctx, shade('#e6e0d4', -0.14), x0 + half, 2 + i, w - half, 1);
  }
  px(ctx, '#ffffff', 21, 2, 6, 1);
  px(ctx, PALETTE.metal, 23, 0, 2, 2);
  // Faldón con festón.
  px(ctx, '#e6e0d4', 2, 14, W - 4, 4);
  px(ctx, '#f4f0e6', 2, 14, W - 4, 1);
  for (let x = 2; x < W - 2; x += 4) px(ctx, shade('#e6e0d4', -0.2), x, 18, 2, 1);
  ctx.globalAlpha = 0.3;
  px(ctx, PALETTE.ink, 2, 19, W - 4, 4);
  ctx.globalAlpha = 1;
  for (const x of [3, W - 4]) px(ctx, PALETTE.metal, x, 14, 1, 24);
  // Interior: fondo oscuro, un perchero, un maniquí y la mesa de cobro.
  px(ctx, shade(PALETTE.night, 0.03), 4, 19, W - 8, 15);
  px(ctx, PALETTE.metalLit, 7, 22, 14, 1);
  for (let i = 0; i < 5; i++) {
    const c = CLOTHES[(i * 2 + 1) % CLOTHES.length];
    px(ctx, c, 8 + i * 3, 23, 2, 8);
    px(ctx, shade(c, 0.15), 8 + i * 3, 23, 1, 8);
  }
  px(ctx, PALETTE.white, 32, 21, 2, 2);
  px(ctx, '#8c5a6e', 31, 23, 4, 8);
  px(ctx, shade('#8c5a6e', 0.15), 31, 23, 1, 8);
  px(ctx, PALETTE.metal, 32, 31, 2, 3);
  px(ctx, PALETTE.woodDark, 4, 32, W - 8, 5);
  px(ctx, PALETTE.wood, 4, 31, W - 8, 2);
  px(ctx, shade(PALETTE.wood, 0.18), 4, 31, W - 8, 1);
}

/** Cabina del DJ: dos torres de altavoces con su cono, la mesa con dos platos y un portátil; `glow`: lo que brilla. */
function drawBooth(ctx: Ctx, glow = false): void {
  const W = 32;
  if (glow) {
    px(ctx, '#ff6ab8', 8, 26, 16, 1);
    px(ctx, '#5ad8ff', 8, 27, 16, 1);
    px(ctx, '#ffd8f0', 15, 14, 2, 1);
    px(ctx, '#5ad8ff', 12, 16, 1, 1);
    px(ctx, '#5ad8ff', 21, 16, 1, 1);
    px(ctx, '#ff6ab8', 3, 5, 2, 1);
    px(ctx, '#ff6ab8', 27, 5, 2, 1);
    return;
  }
  for (const x of [0, W - 8]) {
    px(ctx, PALETTE.outline, x, 3, 8, 26);
    px(ctx, '#2a2830', x + 1, 4, 6, 24);
    px(ctx, '#3a3a44', x + 1, 4, 6, 1);
    for (const y of [8, 19]) {
      px(ctx, PALETTE.ink, x + 2, y, 4, 4);
      px(ctx, '#4a4a56', x + 3, y + 1, 2, 2);
    }
  }
  px(ctx, PALETTE.woodDark, 8, 19, 16, 9);
  px(ctx, PALETTE.wood, 8, 17, 16, 2);
  px(ctx, shade(PALETTE.wood, 0.18), 8, 17, 16, 1);
  for (const x of [10, 19]) {
    px(ctx, PALETTE.ink, x, 15, 5, 3);
    px(ctx, PALETTE.metalLit, x + 1, 15, 3, 1);
  }
  px(ctx, '#3a3a44', 14, 12, 4, 4);
  px(ctx, '#5ad8ff', 15, 13, 2, 1);
  px(ctx, PALETTE.ink, 8, 28, 16, 1);
}

/** Caballete de madera con un lienzo de colores, apoyado en el suelo; una pinza de luz arriba. */
function drawEasel(ctx: Ctx): void {
  px(ctx, PALETTE.woodDark, 2, 12, 1, 18);
  px(ctx, PALETTE.woodDark, 13, 12, 1, 18);
  px(ctx, PALETTE.woodDark, 7, 12, 2, 16);
  px(ctx, PALETTE.outline, 1, 3, 14, 17);
  px(ctx, '#e6e0d4', 2, 4, 12, 15);
  // Una pintura abstracta: bloques de color y una línea que los cruza.
  px(ctx, CANVAS[0], 3, 5, 5, 6);
  px(ctx, CANVAS[1], 8, 5, 5, 4);
  px(ctx, CANVAS[2], 3, 11, 4, 6);
  px(ctx, CANVAS[3], 7, 9, 6, 8);
  px(ctx, PALETTE.ink, 3, 14, 10, 1);
  px(ctx, shade('#e6e0d4', -0.2), 2, 18, 12, 1);
  px(ctx, PALETTE.woodDark, 1, 20, 14, 1);
  px(ctx, PALETTE.metal, 7, 1, 2, 2);
  px(ctx, PALETTE.metal, 8, 2, 4, 1);
}

/** Pizarra en A de la cola de una zapatilla: dos patas, el tablero con una zapatilla en tiza y unas rayas. */
function drawSneakerSign(ctx: Ctx): void {
  px(ctx, PALETTE.woodDark, 2, 18, 2, 10);
  px(ctx, PALETTE.woodDark, 12, 18, 2, 10);
  px(ctx, PALETTE.outline, 1, 3, 14, 18);
  px(ctx, '#26343a', 2, 4, 12, 16);
  px(ctx, shade('#26343a', 0.1), 2, 4, 12, 1);
  px(ctx, '#e6e0d4', 4, 10, 3, 5);
  px(ctx, '#e6e0d4', 7, 13, 5, 2);
  px(ctx, '#e6e0d4', 4, 15, 8, 1);
  px(ctx, '#ffb14a', 5, 14, 5, 1);
  px(ctx, '#e6e0d4', 4, 6, 8, 1);
  px(ctx, '#e6e0d4', 4, 18, 5, 1);
  px(ctx, PALETTE.woodDark, 1, 21, 14, 1);
}

/** Torre de cajas de zapatillas: naranja, blanca y negra, con la de arriba más pequeña. */
function drawBoxes(ctx: Ctx): void {
  const rows: readonly (readonly [number, number, string])[] = [
    [1, 16, '#c9743f'],
    [3, 12, '#e6e0d4'],
    [5, 8, '#232329'],
    [2, 6, '#ffb14a'],
  ];
  let y = 21;
  rows.forEach(([x, w, c], i) => {
    const h = i === 3 ? 3 : 5;
    y -= h;
    px(ctx, PALETTE.outline, x - 1, y - 1, w + 2, h + 2);
    px(ctx, c, x, y, w, h);
    px(ctx, shade(c, 0.2), x, y, w, 1);
    px(ctx, shade(c, -0.2), x + w - 1, y, 1, h);
    px(ctx, shade(c, -0.12), x + 2, y + h - 2, w - 4, 1);
  });
}

/** Alfombra granate con filo dorado y dos postes de latón con su cordón: la entrada de una gala o de un lanzamiento. */
function drawCarpet(ctx: Ctx): void {
  const brass = '#c9a45a';
  px(ctx, '#6a1f2a', 8, 12, 32, 8);
  px(ctx, shade('#6a1f2a', 0.18), 8, 12, 32, 1);
  px(ctx, brass, 8, 13, 32, 1);
  px(ctx, brass, 8, 18, 32, 1);
  for (const x of [2, 44]) {
    px(ctx, brass, x, 4, 2, 15);
    px(ctx, shade(brass, 0.3), x - 1, 3, 4, 2);
    px(ctx, shade(brass, -0.3), x - 1, 18, 4, 2);
  }
  // El cordón: cuelga entre los postes por detrás de la alfombra.
  for (let x = 4; x < 44; x++) px(ctx, '#8c2f3f', x, 6 + Math.round(Math.sin(((x - 4) / 40) * Math.PI) * 3), 1, 1);
}

export function buildPopUpTextures(scene: Phaser.Scene): void {
  const [sw, sh] = PIECE_SIZE['stall-vintage'];
  make(scene, pieceKey('stall-vintage'), sw, sh, (ctx) => drawStall(ctx, true));
  make(scene, pieceKey('stall-fashion'), sw, sh, (ctx) => drawStall(ctx, false));
  make(scene, pieceKey('tent'), PIECE_SIZE.tent[0], PIECE_SIZE.tent[1], drawTent);
  make(scene, pieceKey('booth'), PIECE_SIZE.booth[0], PIECE_SIZE.booth[1], (ctx) => drawBooth(ctx));
  make(scene, 'pu-booth-glow', PIECE_SIZE.booth[0], PIECE_SIZE.booth[1], (ctx) => drawBooth(ctx, true));
  make(scene, pieceKey('easel'), PIECE_SIZE.easel[0], PIECE_SIZE.easel[1], drawEasel);
  make(scene, pieceKey('sign-sneaker'), PIECE_SIZE['sign-sneaker'][0], PIECE_SIZE['sign-sneaker'][1], drawSneakerSign);
  make(scene, pieceKey('boxes'), PIECE_SIZE.boxes[0], PIECE_SIZE.boxes[1], drawBoxes);
  make(scene, pieceKey('carpet'), PIECE_SIZE.carpet[0], PIECE_SIZE.carpet[1], drawCarpet);
  make(scene, pieceKey('stall-fruit'), sw, sh, drawFruitStall);
  make(scene, pieceKey('stall-clothes'), sw, sh, drawClothesStall);
  make(scene, pieceKey('stall-books'), sw, sh, drawBooksStall);
  make(scene, pieceKey('stall-junk'), sw, sh, drawJunkStall);
  VENDOR_LOOKS.forEach((look, i) => make(scene, vendorKey(i), VENDOR_SIZE[0], VENDOR_SIZE[1], (ctx) => drawVendor(ctx, look)));
}
