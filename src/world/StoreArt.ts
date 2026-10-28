import type Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import { make, px, shade, sprinkle, type Ctx } from './paint';
import { drawParkedBike } from './CyclistArt';

/**
 * Mobiliario de la gran superficie de deporte (data/decathlon.ts, Alpha-08): suelo de nave, pista de pádel de prueba,
 * tiendas de campaña montadas, bicis en su soporte (como la pared de Segunda Vida de design/Decathlon/), muro de
 * mochilas, kayaks, jaula de balones, cañas, bolsas de golf, columnas de la nave y los carteles colgados de cada
 * sección. Mismo idioma que PropArt: frente de tres cuartos, base oscura abajo, luz arriba a la izquierda.
 */

/** Azul de la marca en la señalética (el del chaleco, data/npcs.ts). */
const SIGN_BLUE = '#3643ba';

/**
 * Familias de sección, con el color de la leyenda del plano (design/Decathlon/217426dc…png). El orden es el índice
 * de variante de `dept-sign` (data/decathlon.ts `FAMILY`). Cada una con su pictograma de 7 × 5.
 */
export const SIGN_FAMILIES: readonly { color: string; icon: readonly string[] }[] = [
  // 0 · montaña: dos picos.
  { color: '#3fae49', icon: ['...X...', '..XXX.X', '.XXXXXX', 'XXXXXXX', 'XXXXXXX'] },
  // 1 · fitness: mancuerna.
  { color: '#e05aa8', icon: ['X.....X', 'XX...XX', 'XXXXXXX', 'XX...XX', 'X.....X'] },
  // 2 · ciclismo: dos ruedas.
  { color: '#5a6ad8', icon: ['...X...', '.XX.XX.', 'X.XX..X', 'X..X..X', '.X...X.'] },
  // 3 · agua: ola.
  { color: '#2fb8c8', icon: ['.......', '.XX..XX', 'X..XX..', '.......', 'XXXXXXX'] },
  // 4 · raqueta: pala y pelota.
  { color: '#e08a2a', icon: ['.XXX...', 'XXXXX..', '.XXX..X', '..X....', '..X....'] },
  // 5 · running: zapatilla.
  { color: '#d8383a', icon: ['XX.....', 'XXX....', 'XXXXX..', 'XXXXXXX', '.......'] },
  // 6 · camping: tienda.
  { color: '#2f8a3a', icon: ['...X...', '..X.X..', '.X.X.X.', 'X..X..X', 'XXXXXXX'] },
  // 7 · salud: cruz.
  { color: '#8a3fc8', icon: ['..XXX..', 'XXXXXXX', 'XXXXXXX', '..XXX..', '.......'] },
  // 8 · material de fitness: pesa rusa.
  { color: '#c09a2a', icon: ['.XXXXX.', '.X...X.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.'] },
  // 9 · deportes colectivos: balón.
  { color: '#e0d83a', icon: ['.XXXXX.', 'XX.X.XX', 'X.XXX.X', 'XX.X.XX', '.XXXXX.'] },
  // 10 · naturaleza (caza y pesca): pez.
  { color: '#9a6a3f', icon: ['.......', 'X.XXXX.', 'XXXXX.X', 'X.XXXX.', '.......'] },
  // 11 · golf: bandera en el hoyo.
  { color: '#b8b8b8', icon: ['XXXX...', 'X.XX...', 'X......', 'X......', 'XXXXX..'] },
];

/** Hormigón pulido de nave: gris frío, alguna mota y, en una de cada dos, la junta de dilatación. */
function drawHallFloor(ctx: Ctx, v: number): void {
  const base = '#c4c8cc';
  px(ctx, base, 0, 0, TILE, TILE);
  sprinkle(ctx, shade(base, 0.04), TILE, TILE, 31 + v, 6);
  sprinkle(ctx, shade(base, -0.05), TILE, TILE, 47 + v, 4);
  if (v === 1) px(ctx, shade(base, -0.1), 0, 0, TILE, 1);
}

/** Pista de pádel de prueba, 6 × 12 tiles, pintada en el suelo: césped azul, líneas blancas y el vidrio del fondo. */
function drawPadelCourt(ctx: Ctx): void {
  const w = TILE * 6;
  const h = TILE * 12;
  const turf = '#2f62a0';
  px(ctx, shade(turf, -0.25), 0, 0, w, h);
  px(ctx, turf, 3, 3, w - 6, h - 6);
  sprinkle(ctx, shade(turf, 0.06), w, h, 5, 120);
  const line = shade(PALETTE.white, -0.05);
  // Fondo y laterales, la línea de saque a cada lado de la red y la central entre ellas.
  px(ctx, line, 3, 3, w - 6, 1);
  px(ctx, line, 3, h - 4, w - 6, 1);
  px(ctx, line, 3, 3, 1, h - 6);
  px(ctx, line, w - 4, 3, 1, h - 6);
  const service = [Math.round(h * 0.2), Math.round(h * 0.8)];
  for (const y of service) px(ctx, line, 3, y, w - 6, 1);
  px(ctx, line, w / 2, service[0], 1, service[1] - service[0]);
  // El cristal del fondo y la malla de los laterales: un borde frío con sus postes.
  for (const y of [0, h - 3]) {
    px(ctx, shade(PALETTE.glassLit, 0.1), 0, y, w, 3);
    for (let x = 0; x < w; x += 16) px(ctx, PALETTE.metal, x, y, 2, 3);
  }
  for (const x of [0, w - 3]) for (let y = 0; y < h; y += 16) px(ctx, PALETTE.metal, x, y, 3, 2);
}

/** La red de la pista, de poste a poste: banda oscura de malla con la cinta blanca arriba. */
function drawPadelNet(ctx: Ctx): void {
  const w = TILE * 6;
  px(ctx, 'rgba(0,0,0,0.25)', 2, 13, w - 4, 2);
  for (let x = 4; x < w - 4; x++) for (let y = 7; y < 13; y++) if ((x + y) % 2 === 0) px(ctx, '#23262e', x, y);
  px(ctx, PALETTE.white, 3, 6, w - 6, 1);
  for (const x of [1, w - 4]) {
    px(ctx, PALETTE.metal, x, 3, 3, 11);
    px(ctx, PALETTE.metalLit, x, 3, 1, 11);
  }
}

/** Tienda de campaña montada en la exposición, 3 × 2: cúpula, lado en sombra, puerta con cremallera y vientos. */
function drawCampingTent(ctx: Ctx, v: number): void {
  // La tercera, blanca con el doble techo gris oscuro: la de la foto de camping (design/Decathlon/97bd2945…png).
  const body = ['#4f8a3a', '#d8803a', '#e4e8ea'][v];
  const fly = ['#2f5a2a', '#a8582a', '#3f464f'][v];
  const w = TILE * 3;
  px(ctx, 'rgba(0,0,0,0.25)', 3, 28, w - 6, 3);
  // Cúpula en filas: cada fila un poco más ancha hasta la base; la mitad derecha, en sombra.
  for (let y = 6; y < 29; y++) {
    const half = Math.min(21, 6 + Math.round((y - 6) * 0.9));
    const x0 = 24 - half;
    px(ctx, body, x0, y, half * 2, 1);
    px(ctx, shade(body, -0.18), 24, y, half, 1);
    px(ctx, PALETTE.outline, x0 - 1, y, 1, 1);
    px(ctx, PALETTE.outline, x0 + half * 2, y, 1, 1);
  }
  px(ctx, PALETTE.outline, 18, 5, 12, 1);
  px(ctx, shade(body, 0.16), 19, 6, 6, 1);
  // Varillas cruzadas del doble techo.
  for (let y = 7; y < 28; y++) {
    px(ctx, fly, 24 - Math.round((y - 7) * 0.45), y, 1, 1);
    px(ctx, fly, 24 + Math.round((y - 7) * 0.45), y, 1, 1);
  }
  // Puerta en arco, oscura, con la cremallera clara.
  for (let y = 16; y < 28; y++) {
    const half = Math.min(7, 2 + (y - 16));
    px(ctx, '#1c1e22', 24 - half, y, half * 2, 1);
  }
  px(ctx, shade(PALETTE.white, -0.2), 24, 16, 1, 12);
  // Piquetas y el cartel de precio al pie.
  px(ctx, shade(PALETTE.white, -0.3), 1, 27, 2, 1);
  px(ctx, shade(PALETTE.white, -0.3), w - 3, 27, 2, 1);
  px(ctx, '#ffd84a', 34, 25, 7, 4);
  px(ctx, PALETTE.ink, 35, 27, 5, 1);
}

/** Soporte de bicis, 3 × 2: tres bicis de perfil sobre su riel, una de cada color (como la foto de Segunda Vida). */
function drawBikeStand(ctx: Ctx, v: number): void {
  const sets = [['#c0393a', '#2f6fa8', '#4fae49'], ['#e6e0d4', '#1c1e22', '#d8803a'], ['#5a6ad8', '#c8d84a', '#8a3fc8']][v];
  const w = TILE * 3;
  px(ctx, 'rgba(0,0,0,0.25)', 1, 29, w - 2, 3);
  px(ctx, PALETTE.metal, 1, 28, w - 2, 2);
  px(ctx, PALETTE.metalLit, 1, 28, w - 2, 1);
  sets.forEach((color, i) => drawParkedBike(ctx, 1 + i * 15, 28 - (i % 2) * 2, color, 5, 12));
  // Etiqueta de precio colgada del primer manillar.
  px(ctx, PALETTE.white, 14, 12, 4, 3);
}

/** Muro de mochilas, 2 × 2: panel perforado y dos filas de mochilas colgadas, por litros. */
function drawBackpackWall(ctx: Ctx): void {
  const w = TILE * 2;
  px(ctx, shade(PALETTE.wallLit, -0.1), 0, 0, w, 30);
  for (let y = 2; y < 29; y += 3) for (let x = 2; x < w - 1; x += 3) px(ctx, shade(PALETTE.wallLit, -0.22), x, y);
  const bags = ['#2f5a2a', '#3643ba', '#c0393a', '#d8803a', '#4a4f57', '#2fb8c8'];
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < 3; i++) {
      const c = bags[(i + r * 3) % bags.length];
      const x = 2 + i * 10;
      const y = 3 + r * 13;
      px(ctx, PALETTE.outline, x, y, 8, 11);
      px(ctx, c, x + 1, y + 1, 6, 9);
      px(ctx, shade(c, 0.15), x + 1, y + 1, 6, 1);
      px(ctx, shade(c, -0.2), x + 2, y + 6, 4, 3);
      px(ctx, PALETTE.ink, x + 3, y, 2, 1);
    }
  }
  px(ctx, PALETTE.metal, 0, 30, w, 2);
}

/** Kayak sobre sus caballetes, 3 × 1: casco alargado, bañera oscura y la línea de luz del lomo. */
function drawKayak(ctx: Ctx, v: number): void {
  const hull = ['#e0c83a', '#d8383a'][v];
  const w = TILE * 3;
  px(ctx, 'rgba(0,0,0,0.25)', 4, 13, w - 8, 3);
  for (const x of [10, 36]) px(ctx, PALETTE.woodDark, x, 9, 3, 6);
  for (let x = 2; x < w - 2; x++) {
    const t = Math.abs(x - w / 2) / (w / 2 - 2);
    const half = Math.max(1, Math.round(4 * (1 - t * t)));
    px(ctx, PALETTE.outline, x, 8 - half - 1, 1, half * 2 + 2);
    px(ctx, hull, x, 8 - half, 1, half * 2);
    px(ctx, shade(hull, -0.2), x, 8, 1, half);
  }
  px(ctx, shade(hull, 0.25), 8, 5, w - 16, 1);
  px(ctx, '#1c1e22', 20, 6, 8, 4);
  px(ctx, PALETTE.metal, 19, 5, 10, 1);
}

/** Cartel colgado del techo, 3 × 2: dos cables, banda azul de la marca, la franja y el pictograma de la sección. */
function drawDeptSign(ctx: Ctx, v: number): void {
  const fam = SIGN_FAMILIES[v];
  const w = TILE * 3;
  px(ctx, PALETTE.metal, 8, 0, 1, 6);
  px(ctx, PALETTE.metal, w - 9, 0, 1, 6);
  px(ctx, PALETTE.outline, 2, 6, w - 4, 14);
  px(ctx, SIGN_BLUE, 3, 7, w - 6, 9);
  px(ctx, shade(SIGN_BLUE, 0.2), 3, 7, w - 6, 1);
  px(ctx, fam.color, 3, 16, w - 6, 3);
  px(ctx, shade(fam.color, -0.25), 3, 18, w - 6, 1);
  fam.icon.forEach((row, y) => [...row].forEach((c, x) => c === 'X' && px(ctx, PALETTE.white, 20 + x, 9 + y)));
}

/** Jaula de balones, 1 × 2: rejilla metálica con balones de fútbol, baloncesto y voleibol asomando. */
function drawBallCage(ctx: Ctx): void {
  px(ctx, 'rgba(0,0,0,0.25)', 1, 29, 14, 3);
  const balls = ['#f2f2f2', '#d8803a', '#e0d83a', '#2f6fa8', '#f2f2f2', '#c0393a'];
  balls.forEach((c, i) => {
    const x = 2 + (i % 3) * 4;
    const y = 10 + Math.floor(i / 3) * 8 + (i % 2) * 2;
    px(ctx, c, x, y, 4, 4);
    px(ctx, shade(c, -0.25), x + 2, y + 2, 2, 2);
    if (c === '#f2f2f2') px(ctx, PALETTE.ink, x + 1, y + 1, 2, 1);
  });
  for (let x = 1; x < 15; x += 3) px(ctx, PALETTE.metal, x, 7, 1, 23);
  for (let y = 7; y < 30; y += 5) px(ctx, PALETTE.metal, 1, y, 14, 1);
  px(ctx, PALETTE.metalLit, 1, 7, 14, 1);
}

/** Expositor de cañas, 2 × 2: base de madera y las cañas de pie, cada una con su carrete. */
function drawFishingRods(ctx: Ctx): void {
  const w = TILE * 2;
  px(ctx, 'rgba(0,0,0,0.25)', 1, 29, w - 2, 3);
  px(ctx, PALETTE.woodDark, 1, 24, w - 2, 6);
  px(ctx, PALETTE.wood, 1, 24, w - 2, 1);
  const rods = ['#1c1e22', '#2f5a2a', '#9a6a3f', '#3643ba', '#1c1e22', '#c0393a', '#4a4f57'];
  rods.forEach((c, i) => {
    const x = 3 + i * 4;
    const top = 1 + (i % 3) * 2;
    px(ctx, c, x, top, 1, 24 - top);
    px(ctx, shade(c, 0.3), x, top, 1, 1);
    px(ctx, PALETTE.metal, x - 1, 18, 2, 2);
  });
}

/** Bolsa de golf, 1 × 2: la bolsa de pie y las cabezas de los palos asomando. */
function drawGolfBag(ctx: Ctx, v: number): void {
  const c = ['#2f5a2a', '#e6e0d4'][v];
  px(ctx, 'rgba(0,0,0,0.25)', 2, 29, 12, 3);
  px(ctx, PALETTE.outline, 4, 9, 8, 21);
  px(ctx, c, 5, 10, 6, 19);
  px(ctx, shade(c, 0.15), 5, 10, 2, 19);
  px(ctx, PALETTE.ink, 5, 20, 6, 2);
  for (const [x, y] of [[5, 4], [7, 2], [9, 5]] as const) {
    px(ctx, PALETTE.metal, x, y + 2, 1, 8 - y);
    px(ctx, PALETTE.metalLit, x, y, 2, 2);
  }
}

/**
 * Producto de góndola por familia: cajas y blísteres de colores apretados, como el pasillo de la foto
 * (design/Decathlon/9cb4e2ad…png). Cada variante, una gama (azules y negros, rojos, verdes, mezcla).
 */
const SHELF_SETS: readonly (readonly string[])[] = [
  ['#2f4fa8', '#1c1e22', '#5a8ad8', '#e6e8ea', '#3a3f48', '#2fb8c8'],
  ['#c0393a', '#e6e8ea', '#1c1e22', '#d8803a', '#8a2f2f', '#f2c84a'],
  ['#3fae49', '#2f5a2a', '#e6e8ea', '#9a6a3f', '#1c1e22', '#2f8a6a'],
  ['#e05aa8', '#2fb8c8', '#f2c84a', '#5a6ad8', '#e6e8ea', '#d8383a'],
];

/** Tramo de góndola visto desde arriba, 1 × 1 (para las filas norte-sur): espina de metal y producto denso a cada lado. */
function drawShelfRun(ctx: Ctx, v: number): void {
  const set = SHELF_SETS[v];
  px(ctx, PALETTE.outline, 0, 0, TILE, TILE);
  px(ctx, '#8a8f96', 1, 0, 14, TILE);
  px(ctx, '#b4b8bc', 7, 0, 2, TILE);
  // Cajas de fondos distintos a cada lado (suman 16 px): la junta entre tramos no se lee como una escalera repetida.
  const sides: readonly [number, readonly number[], number][] = [[1, [3, 2, 4, 2, 3, 2], v], [10, [2, 4, 3, 2, 2, 3], v * 3 + 2]];
  for (const [x, rows, start] of sides) {
    let y = 0;
    rows.forEach((h, i) => {
      const c = set[(i + start) % set.length];
      px(ctx, c, x, y, 5, h);
      px(ctx, shade(c, 0.18), x, y, 5, 1);
      if (h > 2) px(ctx, shade(c, -0.2), x, y + h - 1, 5, 1);
      y += h;
    });
  }
  px(ctx, 'rgba(0,0,0,0.25)', 6, 0, 1, TILE);
}

/** Góndola de frente, 1 × 2 (para las filas este-oeste): cuatro baldas llenas, el larguero y el zócalo. */
function drawShelfFront(ctx: Ctx, v: number): void {
  const set = SHELF_SETS[v];
  px(ctx, PALETTE.outline, 0, 2, TILE, 29);
  px(ctx, '#b4b8bc', 0, 2, TILE, 2);
  px(ctx, '#5a5f66', 1, 4, 14, 24);
  for (let s = 0; s < 4; s++) {
    const y = 5 + s * 6;
    for (let x = 1; x < 15; x += 3) {
      const c = set[(x + s * 2 + v) % set.length];
      const h = 4 - ((x + s) % 2);
      px(ctx, c, x, y + 4 - h, 3, h);
      px(ctx, shade(c, 0.2), x, y + 4 - h, 3, 1);
    }
    px(ctx, '#d8dadc', 1, y + 4, 14, 1);
  }
  px(ctx, '#3a3f48', 0, 28, TILE, 3);
  px(ctx, 'rgba(0,0,0,0.25)', 0, 31, TILE, 1);
}

/** Cubo de promoción amarillo, 1 × 2: lleno hasta arriba de producto blanco y con su cartel de precio (la foto de raqueta). */
function drawPromoBin(ctx: Ctx): void {
  const yellow = '#f2c84a';
  px(ctx, 'rgba(0,0,0,0.25)', 1, 29, 15, 3);
  px(ctx, PALETTE.outline, 1, 14, 14, 17);
  px(ctx, yellow, 2, 15, 12, 15);
  px(ctx, shade(yellow, 0.15), 2, 15, 12, 1);
  px(ctx, shade(yellow, -0.2), 10, 16, 4, 14);
  for (let i = 0; i < 6; i++) px(ctx, i % 2 ? '#e6e8ea' : '#c8ccd0', 2 + (i % 3) * 4, 10 + Math.floor(i / 3) * 3, 4, 4);
  // Cartel: la cifra en negro sobre amarillo, en la cara del cubo.
  px(ctx, PALETTE.white, 4, 21, 8, 5);
  px(ctx, PALETTE.ink, 5, 23, 2, 2);
  px(ctx, PALETTE.ink, 8, 23, 3, 2);
}

/** Columna de la nave, 1 × 3: hormigón pintado, la franja azul a la altura de los ojos y el zócalo. */
function drawPillar(ctx: Ctx): void {
  const h = TILE * 3;
  px(ctx, 'rgba(0,0,0,0.25)', 1, h - 3, 15, 3);
  px(ctx, PALETTE.outline, 2, 0, 12, h - 2);
  px(ctx, '#d8dadc', 3, 0, 10, h - 3);
  px(ctx, '#eef0f2', 3, 0, 3, h - 3);
  px(ctx, shade('#d8dadc', -0.12), 11, 0, 2, h - 3);
  px(ctx, SIGN_BLUE, 3, 18, 10, 5);
  px(ctx, shade(SIGN_BLUE, 0.2), 3, 18, 10, 1);
  px(ctx, '#7a7e84', 3, h - 7, 10, 4);
}

export function buildStoreTextures(scene: Phaser.Scene): void {
  for (let v = 0; v < 2; v++) make(scene, `tile-floor-hall-${v}`, TILE, TILE, (ctx) => drawHallFloor(ctx, v));
  make(scene, 'prop-padel-court', TILE * 6, TILE * 12, drawPadelCourt);
  make(scene, 'prop-padel-net', TILE * 6, TILE, drawPadelNet);
  for (let v = 0; v < 3; v++) make(scene, `prop-camping-tent-${v}`, TILE * 3, TILE * 2, (ctx) => drawCampingTent(ctx, v));
  for (let v = 0; v < 3; v++) make(scene, `prop-bike-stand-${v}`, TILE * 3, TILE * 2, (ctx) => drawBikeStand(ctx, v));
  make(scene, 'prop-backpack-wall', TILE * 2, TILE * 2, drawBackpackWall);
  for (let v = 0; v < 2; v++) make(scene, `prop-kayak-${v}`, TILE * 3, TILE, (ctx) => drawKayak(ctx, v));
  SIGN_FAMILIES.forEach((_, v) => make(scene, `prop-dept-sign-${v}`, TILE * 3, TILE * 2, (ctx) => drawDeptSign(ctx, v)));
  make(scene, 'prop-ball-cage', TILE, TILE * 2, drawBallCage);
  make(scene, 'prop-fishing-rods', TILE * 2, TILE * 2, drawFishingRods);
  for (let v = 0; v < 2; v++) make(scene, `prop-golf-bag-${v}`, TILE, TILE * 2, (ctx) => drawGolfBag(ctx, v));
  make(scene, 'prop-pillar', TILE, TILE * 3, drawPillar);
  SHELF_SETS.forEach((_, v) => {
    make(scene, `prop-shelf-run-${v}`, TILE, TILE, (ctx) => drawShelfRun(ctx, v));
    make(scene, `prop-shelf-front-${v}`, TILE, TILE * 2, (ctx) => drawShelfFront(ctx, v));
  });
  make(scene, 'prop-promo-bin', TILE, TILE * 2, drawPromoBin);
}
