import type Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import { drawWord, glow, make, px, shade, type Ctx } from './paint';

/**
 * Piezas urbanas de Visual V2 (design/ART_BIBLE.md). La plazuela del metro es
 * la escena de referencia; cualquier zona que se mejore después usa estas
 * mismas piezas. Luz del noroeste: arriba-izquierda claro, abajo-derecha oscuro.
 * Lo que brilla de noche va en una textura aparte (`glow-*`) que world/Lighting
 * pone encima de la sombra de la hora.
 */

const IRON = PALETTE.iron;
const IRON_LIT = shade(PALETTE.iron, 0.14);
const STEEL = PALETTE.metal;
const STEEL_LIT = PALETTE.metalLit;
const GRANITE = PALETTE.plaza;
const LINE_RED = '#c0493f';
const LINE_BLUE = '#2f4f8f';
const WARM = '#ffd89a';

/** Ruido determinista por entero: el mismo tile, siempre el mismo grano. */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ suelo

/** Franja podotáctil: baldosa ocre con botones en relieve delante de un acceso de transporte. */
function drawTactile(ctx: Ctx): void {
  // Ocre sucio, no amarillo de señal: se lee sin robarle protagonismo a la boca de metro.
  const base = '#a8915a';
  px(ctx, shade(base, -0.18), 0, 0, TILE, TILE);
  px(ctx, base, 0, 0, TILE - 1, TILE - 1);
  for (let y = 2; y < TILE - 2; y += 4) {
    for (let x = 2; x < TILE - 2; x += 4) {
      px(ctx, shade(base, 0.12), x, y, 2, 1);
      px(ctx, shade(base, -0.12), x, y + 1, 2, 1);
    }
  }
}

// ------------------------------------------------------------- calcomanías

function drawManhole(ctx: Ctx): void {
  const ring = shade(IRON, 0.06);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 6.5) continue;
      px(ctx, d > 5.5 ? shade(GRANITE, -0.2) : d > 4.6 ? ring : (x + y) % 3 === 0 ? shade(IRON, 0.1) : IRON, x, y);
    }
  }
  px(ctx, shade(IRON, 0.2), 4, 3, 3, 1);
}

function drawDrain(ctx: Ctx): void {
  px(ctx, shade(GRANITE, -0.2), 2, 5, 12, 7);
  px(ctx, IRON, 3, 6, 10, 5);
  for (let x = 4; x < 13; x += 2) px(ctx, PALETTE.ink, x, 7, 1, 3);
  px(ctx, IRON_LIT, 3, 6, 10, 1);
}

/** Hojas caídas bajo los árboles: sólo ahí, nunca por todo el suelo. */
function drawLeaves(ctx: Ctx): void {
  const colors = ['#b88046', '#9a6a3a', '#c9a13a', shade(PALETTE.leaf, 0.05)];
  for (let i = 0; i < 9; i++) {
    const x = 1 + Math.floor(hash(i * 11 + 1) * 13);
    const y = 1 + Math.floor(hash(i * 17 + 5) * 13);
    const c = colors[i % colors.length];
    px(ctx, c, x, y, 2, 1);
    px(ctx, shade(c, -0.1), x + 1, y + 1, 1, 1);
  }
}

// ----------------------------------------------------------------- objetos

/** Banco de plaza: respaldo de listones, asiento de madera y costados de fundición. */
function drawPlazaBench(ctx: Ctx): void {
  const w = TILE * 2;
  const wood = PALETTE.wood;
  // Respaldo: tres listones con su luz.
  for (const y of [4, 7, 10]) {
    px(ctx, wood, 3, y, w - 6, 2);
    px(ctx, PALETTE.woodLit, 3, y, w - 6, 1);
  }
  // Asiento visto desde arriba y su canto.
  px(ctx, PALETTE.woodLit, 2, 14, w - 4, 3);
  px(ctx, shade(PALETTE.woodLit, 0.05), 2, 14, w - 4, 1);
  for (let x = 6; x < w - 4; x += 6) px(ctx, PALETTE.wood, x, 14, 1, 3);
  px(ctx, PALETTE.woodDark, 2, 17, w - 4, 2);
  // Costados: fundición con voluta, patas al suelo.
  for (const x of [1, w - 4]) {
    px(ctx, IRON, x, 3, 3, 19);
    px(ctx, IRON_LIT, x, 3, 1, 12);
    px(ctx, IRON, x - 1, 21, 5, 2);
  }
  px(ctx, IRON, 4, 19, w - 8, 1);
}

/** Farola fernandina alta: basa, fuste con anillos, cruceta y linterna de cristal. */
function drawStreetLamp(ctx: Ctx): void {
  // Basa.
  px(ctx, IRON, 4, 49, 8, 7);
  px(ctx, IRON_LIT, 4, 49, 8, 1);
  px(ctx, IRON_LIT, 4, 50, 1, 6);
  px(ctx, IRON, 5, 46, 6, 3);
  // Fuste.
  px(ctx, IRON, 7, 15, 3, 32);
  px(ctx, IRON_LIT, 7, 15, 1, 32);
  for (const y of [22, 34, 44]) px(ctx, IRON, 6, y, 5, 1);
  // Cruceta y linterna.
  px(ctx, IRON, 5, 13, 7, 2);
  px(ctx, IRON, 8, 0, 1, 1);
  px(ctx, IRON, 6, 1, 5, 1);
  px(ctx, IRON, 4, 2, 9, 1);
  px(ctx, IRON, 4, 3, 1, 8);
  px(ctx, IRON, 12, 3, 1, 8);
  px(ctx, '#e8d9a8', 5, 3, 7, 8);
  px(ctx, WARM, 5, 3, 3, 5);
  px(ctx, IRON, 8, 3, 1, 8);
  px(ctx, IRON, 4, 11, 9, 1);
  px(ctx, IRON, 6, 12, 5, 1);
}

/** Una bici de lado, pequeña: ruedas, cuadro de su color y sillín. */
function bike(ctx: Ctx, x: number, y: number, frame: string): void {
  for (const cx of [x + 2, x + 9]) {
    px(ctx, PALETTE.ink, cx - 2, y + 4, 5, 5);
    px(ctx, shade(STEEL, -0.05), cx - 1, y + 5, 3, 3);
    px(ctx, PALETTE.ink, cx, y + 6, 1, 1);
  }
  px(ctx, frame, x + 3, y + 4, 6, 1);
  px(ctx, frame, x + 5, y + 2, 1, 3);
  px(ctx, frame, x + 8, y + 2, 1, 3);
  px(ctx, PALETTE.ink, x + 4, y + 1, 3, 1);
  px(ctx, STEEL_LIT, x + 8, y + 1, 3, 1);
}

/** Aparcabicis: tres arcos de acero y tres bicis distintas, escalonadas. */
function drawBikeRack(ctx: Ctx): void {
  for (const x of [3, 13, 23]) {
    px(ctx, STEEL, x, 6, 1, 13);
    px(ctx, STEEL, x + 6, 6, 1, 13);
    px(ctx, STEEL_LIT, x, 5, 7, 1);
  }
  bike(ctx, 1, 9, LINE_RED);
  bike(ctx, 11, 8, '#3f8f8a');
  bike(ctx, 21, 10, PALETTE.amber);
}

/** Jardinera de madera con arbusto y flores en dos colores. */
function drawPlanterBox(ctx: Ctx): void {
  const w = TILE * 2;
  // Arbusto por lóbulos.
  const lobes = [[8, 9, 6], [16, 7, 7], [24, 9, 6]] as const;
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < w; x++) {
      const inside = lobes.some(([cx, cy, r]) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r);
      if (!inside) continue;
      const t = (x - 16) * 0.4 + (y - 7);
      px(ctx, t < -3 ? PALETTE.leafLit : t < 3 ? PALETTE.leaf : shade(PALETTE.leaf, -0.1), x, y);
    }
  }
  for (let k = 0; k < 10; k++) {
    const x = 4 + Math.floor(hash(k * 5 + 9) * 24);
    const y = 3 + Math.floor(hash(k * 3 + 1) * 8);
    px(ctx, k % 2 === 0 ? '#e06a8a' : PALETTE.white, x, y, 1, 1);
  }
  // Caja: canto superior al sol, tablas y sombra abajo.
  px(ctx, '#4b3a2c', 2, 12, w - 4, 2);
  px(ctx, PALETTE.woodLit, 1, 13, w - 2, 2);
  px(ctx, PALETTE.wood, 1, 15, w - 2, 8);
  for (let y = 17; y < 23; y += 3) px(ctx, PALETTE.woodDark, 1, y, w - 2, 1);
  px(ctx, shade(PALETTE.woodDark, -0.05), 1, 22, w - 2, 2);
}

/** Tótem de metro: poste de acero y rótulo con la M; el rótulo brilla de noche. */
function drawTotemSign(ctx: Ctx, lit: boolean): void {
  const face = lit ? '#fff4d8' : PALETTE.white;
  px(ctx, PALETTE.ink, 2, 1, 12, 15);
  px(ctx, LINE_BLUE, 3, 2, 10, 13);
  // Rombo rojo con la M blanca.
  for (let i = 0; i < 5; i++) px(ctx, LINE_RED, 8 - i - 1, 4 + i, (i + 1) * 2, 1);
  for (let i = 0; i < 4; i++) px(ctx, LINE_RED, 8 - 4 + i, 9 + i, (4 - i) * 2, 1);
  px(ctx, face, 5, 6, 1, 5);
  px(ctx, face, 10, 6, 1, 5);
  px(ctx, face, 6, 7, 1, 1);
  px(ctx, face, 9, 7, 1, 1);
  px(ctx, face, 7, 8, 2, 1);
}

function drawMetroTotem(ctx: Ctx): void {
  px(ctx, STEEL, 7, 16, 2, 29);
  px(ctx, STEEL_LIT, 7, 16, 1, 29);
  px(ctx, STEEL, 5, 44, 6, 4);
  px(ctx, STEEL_LIT, 5, 44, 6, 1);
  drawTotemSign(ctx, false);
}

function drawMetroTotemGlow(ctx: Ctx): void {
  drawTotemSign(ctx, true);
  glow(ctx, 8, 8, 8, 0.18, '#9fd8ff');
}

/** Plano del barrio: dos postes, tejadillo y un mapa retroiluminado con el «estás aquí». */
function drawMapFace(ctx: Ctx, lit: boolean): void {
  const k = lit ? 0.08 : 0;
  px(ctx, shade('#e8e0c8', k), 2, 5, 12, 13);
  px(ctx, shade(PALETTE.leafLit, k), 3, 6, 4, 3);
  px(ctx, shade(PALETTE.stone, k), 8, 6, 5, 4);
  px(ctx, shade(PALETTE.stone, k), 3, 11, 5, 5);
  px(ctx, shade(LINE_BLUE, k), 3, 10, 10, 1);
  px(ctx, shade(LINE_BLUE, k), 9, 10, 1, 7);
  px(ctx, LINE_RED, 9, 12, 2, 2);
}

function drawInfoBoard(ctx: Ctx): void {
  px(ctx, IRON, 2, 17, 2, 15);
  px(ctx, IRON, 12, 17, 2, 15);
  px(ctx, IRON, 1, 3, 14, 2);
  px(ctx, IRON_LIT, 1, 3, 14, 1);
  px(ctx, IRON, 1, 5, 1, 14);
  px(ctx, IRON, 14, 5, 1, 14);
  px(ctx, IRON, 1, 18, 14, 1);
  drawMapFace(ctx, false);
}

function drawInfoBoardGlow(ctx: Ctx): void {
  drawMapFace(ctx, true);
}

// ------------------------------------------------------- boca de metro

/**
 * Boca de metro de 3 × 3 tiles: marquesina de cristal vista desde arriba, frontal
 * con el rótulo METRO y la franja de la línea, y la escalera que baja entre dos
 * murettes de granito con barandilla. La fila de abajo es la de la puerta.
 */
function drawMetroEntrance(ctx: Ctx): void {
  const w = TILE * 3;
  // Marquesina: bastidor de acero y paños de cristal con reflejo en diagonal.
  px(ctx, STEEL, 0, 0, w, 18);
  px(ctx, STEEL_LIT, 0, 0, w, 1);
  for (let i = 0; i < 4; i++) {
    const x = 2 + i * 11;
    px(ctx, PALETTE.glass, x, 2, 10, 14);
    px(ctx, shade(PALETTE.glass, 0.08), x, 2, 10, 1);
    for (let d = 0; d < 5; d++) px(ctx, shade(PALETTE.glassLit, -0.25), x + 2 + d, 12 - d * 2, 1, 1);
  }
  // Frontal: rótulo sobre la franja de la línea, con aire arriba y abajo.
  px(ctx, PALETTE.ink, 0, 16, w, 12);
  px(ctx, shade(PALETTE.night, 0.06), 1, 17, w - 2, 9);
  drawWord(ctx, 'METRO', 7, 18, PALETTE.amberDim);
  px(ctx, LINE_RED, 0, 27, w, 1);
  // Escalera en perspectiva: los peldaños se estrechan y oscurecen hasta la boca negra del túnel.
  px(ctx, PALETTE.ink, 10, 28, w - 20, 20);
  for (let k = 0; k < 6; k++) {
    const y = 29 + k * 3;
    const inset = Math.floor(k * 0.8);
    px(ctx, shade(PALETTE.stone, -0.06 - k * 0.08), 11 + inset, y, w - 22 - inset * 2, 2);
    px(ctx, shade(PALETTE.stone, 0.02 - k * 0.08), 11 + inset, y, w - 22 - inset * 2, 1);
  }
  // Pasamanos a los dos lados de la bajada.
  px(ctx, STEEL_LIT, 12, 29, 1, 17);
  px(ctx, STEEL_LIT, w - 13, 29, 1, 17);
  // Murettes de granito con su barandilla y los postes de la marquesina.
  for (const x of [0, w - 10]) {
    px(ctx, GRANITE, x, 28, 10, 20);
    px(ctx, shade(GRANITE, 0.05), x, 28, 10, 1);
    px(ctx, shade(GRANITE, -0.12), x, 46, 10, 2);
    for (let y = 31; y < 46; y += 5) px(ctx, shade(GRANITE, -0.07), x, y, 10, 1);
  }
  for (const x of [9, w - 10]) {
    px(ctx, STEEL_LIT, x, 28, 1, 20);
    for (let y = 30; y < 46; y += 4) px(ctx, STEEL, x, y, 1, 1);
  }
  px(ctx, STEEL, 1, 16, 2, 32);
  px(ctx, STEEL, w - 3, 16, 2, 32);
  // Apliques en los murettes.
  px(ctx, PALETTE.amberDim, 4, 34, 2, 2);
  px(ctx, PALETTE.amberDim, w - 6, 34, 2, 2);
}

/** Lo que brilla de la boca de metro: el rótulo, los apliques y la luz que baja por la escalera. */
function drawMetroEntranceGlow(ctx: Ctx): void {
  const w = TILE * 3;
  drawWord(ctx, 'METRO', 7, 18, PALETTE.amber);
  px(ctx, '#ff7a6a', 0, 27, w, 1);
  px(ctx, WARM, 4, 34, 2, 2);
  px(ctx, WARM, w - 6, 34, 2, 2);
  glow(ctx, 5, 35, 4, 0.25, PALETTE.amber);
  glow(ctx, w - 5, 35, 4, 0.25, PALETTE.amber);
  // Luz de dentro de la estación subiendo por los primeros escalones.
  for (let k = 0; k < 4; k++) {
    ctx.globalAlpha = 0.3 - k * 0.07;
    px(ctx, '#bfe8ff', 11 + k, 29 + k * 3, w - 22 - k * 2, 1);
  }
  ctx.globalAlpha = 1;
}

/**
 * Parterre de flores suelto, 2 × 1 tiles: el mismo granito que el de los
 * árboles de plaza, bajo, con matas y flores de cuatro colores en montículo.
 */
function drawFlowerBed(ctx: Ctx): void {
  const w = TILE * 2;
  px(ctx, shade(GRANITE, 0.06), 1, 4, w - 2, 2);
  px(ctx, '#3f3226', 2, 5, w - 4, 3);
  for (let i = 0; i < 12; i++) {
    const x = 2 + Math.floor(hash(i * 7 + 3) * (w - 6));
    const y = 1 + Math.floor(hash(i * 5 + 1) * 4);
    px(ctx, i % 3 === 0 ? PALETTE.leafLit : PALETTE.leaf, x, y, 3, 4);
  }
  for (let i = 0; i < 10; i++) {
    const x = 3 + Math.floor(hash(i * 11 + 7) * (w - 6));
    const y = 1 + Math.floor(hash(i * 13 + 2) * 5);
    px(ctx, ['#e06a8a', PALETTE.white, '#f0c060', '#c77adb'][i % 4], x, y, 1, 1);
  }
  px(ctx, shade(GRANITE, -0.04), 1, 8, w - 2, 7);
  px(ctx, shade(GRANITE, 0.1), 1, 8, w - 2, 1);
  for (let x = 8; x < w - 2; x += 8) px(ctx, shade(GRANITE, -0.16), x, 9, 1, 5);
  px(ctx, shade(GRANITE, -0.2), w - 3, 8, 2, 7);
  px(ctx, shade(GRANITE, -0.28), 1, 14, w - 2, 1);
}

// ------------------------------------------------ boca de metro principal

/** Ancho y alto de la boca principal, en px: 5 × 4 tiles (la escala de una planta de fachada). */
const HERO_W = TILE * 5;
const HERO_H = TILE * 4;
const NAVY = '#1c2c52';

/** Logo del metro: cuadrado azul con borde blanco y la M blanca. `lit` lo aclara para la noche. */
function metroLogo(ctx: Ctx, x: number, y: number, lit: boolean): void {
  const face = lit ? '#fff4d8' : PALETTE.white;
  px(ctx, face, x, y, 11, 11);
  px(ctx, lit ? '#3f6fc8' : LINE_BLUE, x + 1, y + 1, 9, 9);
  // M de trazo ancho.
  px(ctx, face, x + 2, y + 2, 1, 7);
  px(ctx, face, x + 8, y + 2, 1, 7);
  px(ctx, face, x + 3, y + 3, 1, 2);
  px(ctx, face, x + 7, y + 3, 1, 2);
  px(ctx, face, x + 4, y + 5, 1, 1);
  px(ctx, face, x + 6, y + 5, 1, 1);
  px(ctx, face, x + 5, y + 6, 1, 1);
}

/** El plano de la red en la pared: fondo claro, cuatro líneas de colores que se cruzan y el «usted está aquí». */
function networkMap(ctx: Ctx, x: number, y: number, lit: boolean): void {
  const k = lit ? 0.1 : 0;
  px(ctx, PALETTE.ink, x - 1, y - 1, 15, 20);
  px(ctx, shade('#e8e0c8', k), x, y, 13, 18);
  px(ctx, shade(LINE_RED, k), x + 2, y + 2, 1, 14);
  px(ctx, shade(LINE_RED, k), x + 3, y + 8, 7, 1);
  px(ctx, shade('#e0b23a', k), x + 9, y + 2, 1, 8);
  px(ctx, shade('#e0b23a', k), x + 5, y + 10, 5, 1);
  px(ctx, shade('#3f8a54', k), x + 5, y + 10, 1, 6);
  px(ctx, shade(LINE_BLUE, k), x + 2, y + 13, 9, 1);
  px(ctx, PALETTE.white, x + 8, y + 7, 3, 3);
  px(ctx, LINE_RED, x + 9, y + 8, 1, 1);
}

/** Horarios: panel oscuro con renglones ámbar. */
function timetable(ctx: Ctx, x: number, y: number, lit: boolean): void {
  px(ctx, PALETTE.ink, x - 1, y - 1, 15, 20);
  px(ctx, shade(PALETTE.night, lit ? 0.12 : 0.04), x, y, 13, 18);
  for (let r = 0; r < 6; r++) {
    const c = r === 0 ? (lit ? '#fff4d8' : PALETTE.white) : lit ? PALETTE.amber : PALETTE.amberDim;
    px(ctx, c, x + 2, y + 2 + r * 3, r === 0 ? 9 : 6 + (r % 3), 1);
    if (r > 0) px(ctx, c, x + 10, y + 2 + r * 3, 2, 1);
  }
}

/**
 * Boca de metro principal, 5 × 4 tiles: el foco de la plazuela (design/visual-reference).
 * Un pórtico de granito con el dintel y la banda azul del rótulo (logo y METRO),
 * dos tubos de luz en el techo, el plano de la red a la izquierda y los horarios
 * a la derecha, y la escalera que baja entre dos pretiles de granito con su
 * barandilla. Los peldaños de abajo son la calle; se oscurecen al bajar hacia
 * la boca del túnel, donde vuelve la luz de la estación. La fila de abajo, en
 * el centro, es la puerta.
 */
function drawMetroHero(ctx: Ctx): void {
  const W = HERO_W;
  const H = HERO_H;
  const stone = shade(GRANITE, -0.04);
  // Fondo del hueco: la oscuridad de dentro.
  px(ctx, shade(PALETTE.night, -0.05), 8, 12, W - 16, H - 12);
  // Pilares del pórtico, con su canto al sol (izquierda) y juntas cada 8 px.
  for (const x of [0, W - 9]) {
    px(ctx, stone, x, 0, 9, H);
    px(ctx, shade(stone, 0.08), x, 0, 2, H);
    px(ctx, shade(stone, -0.14), x + 7, 0, 2, H);
    for (let y = 8; y < H; y += 8) px(ctx, shade(stone, -0.08), x, y, 9, 1);
    px(ctx, shade(stone, -0.2), x, H - 2, 9, 2);
  }
  // Dintel y banda del rótulo.
  px(ctx, stone, 0, 0, W, 4);
  px(ctx, shade(stone, 0.1), 0, 0, W, 1);
  px(ctx, PALETTE.ink, 9, 3, W - 18, 12);
  // Marco de acero de la banda del rótulo: se lee como una caja con fondo, no como una pegatina.
  px(ctx, STEEL, 9, 3, W - 18, 1);
  px(ctx, STEEL_LIT, 9, 3, W - 18, 1);
  px(ctx, shade(STEEL, -0.3), 9, 14, W - 18, 1);
  px(ctx, NAVY, 10, 4, W - 20, 10);
  px(ctx, shade(NAVY, 0.1), 10, 4, W - 20, 1);
  px(ctx, shade(NAVY, -0.15), 10, 13, W - 20, 1);
  metroLogo(ctx, 16, 4, false);
  drawWord(ctx, 'METRO', 32, 5, shade(PALETTE.white, -0.15));
  px(ctx, LINE_RED, 9, 14, W - 18, 1);
  // Techo del vestíbulo con dos tubos de luz (apagados de día).
  px(ctx, shade(PALETTE.night, 0.05), 9, 15, W - 18, 3);
  px(ctx, shade(PALETTE.amberDim, -0.2), 16, 16, 12, 1);
  px(ctx, shade(PALETTE.amberDim, -0.2), W - 28, 16, 12, 1);
  // Paneles: el plano a la izquierda y los horarios a la derecha.
  networkMap(ctx, 12, 21, false);
  timetable(ctx, W - 25, 21, false);
  // Boca del túnel al fondo de la escalera.
  const sx = 26;
  const sw = W - 52;
  px(ctx, PALETTE.ink, sx, 26, sw, 10);
  px(ctx, shade(PALETTE.stone, -0.3), sx + 6, 34, sw - 12, 2);
  // Escalera: de abajo (la calle, clara) hacia arriba (la boca, oscura). Cada peldaño con el canto al
  // sol, la sombra de su vuelo sobre el de debajo, el centro gastado de tanto pisar y los extremos
  // oscuros donde tocan las paredes de la bajada.
  for (let k = 0; k < 9; k++) {
    const y = H - 3 - k * 3;
    const tone = -0.02 - k * 0.075;
    px(ctx, shade(PALETTE.stone, tone), sx, y - 2, sw, 3);
    px(ctx, shade(PALETTE.stone, tone + 0.07), sx, y - 2, sw, 1);
    px(ctx, shade(PALETTE.stone, tone - 0.1), sx, y, sw, 1);
    px(ctx, shade(PALETTE.stone, tone + 0.03), sx + Math.floor(sw / 2) - 3, y - 1, 6, 1);
    px(ctx, shade(PALETTE.stone, tone - 0.14), sx, y - 2, 2, 3);
    px(ctx, shade(PALETTE.stone, tone - 0.1), sx + sw - 2, y - 2, 2, 3);
  }
  // Las paredes de la bajada, por dentro: la de la izquierda en sombra (luz del noroeste).
  ctx.globalAlpha = 0.35;
  px(ctx, PALETTE.ink, sx, 30, 2, H - 32);
  ctx.globalAlpha = 0.18;
  px(ctx, PALETTE.ink, sx + 2, 30, 1, H - 32);
  ctx.globalAlpha = 1;
  // Pretiles de granito a los dos lados de la bajada, con su barandilla de acero.
  for (const x of [9, W - 26]) {
    px(ctx, GRANITE, x, 42, 17, H - 42);
    px(ctx, shade(GRANITE, 0.07), x, 42, 17, 1);
    px(ctx, shade(GRANITE, -0.14), x, H - 2, 17, 2);
    for (let y = 47; y < H - 2; y += 5) px(ctx, shade(GRANITE, -0.06), x, y, 17, 1);
  }
  for (const x of [sx - 1, sx + sw]) {
    px(ctx, STEEL, x, 30, 1, H - 30);
    px(ctx, STEEL_LIT, x, 30, 1, 1);
    for (let y = 34; y < H; y += 6) px(ctx, STEEL_LIT, x, y, 1, 1);
  }
  // Pasamanos que bajan con la escalera, con su sombra en los peldaños.
  px(ctx, STEEL_LIT, sx + 2, 32, 1, H - 34);
  px(ctx, STEEL_LIT, sx + sw - 3, 32, 1, H - 34);
  ctx.globalAlpha = 0.25;
  px(ctx, PALETTE.ink, sx + 3, 33, 1, H - 35);
  px(ctx, PALETTE.ink, sx + sw - 2, 33, 1, H - 35);
  ctx.globalAlpha = 1;
  // Los pilares por dentro del hueco, en sombra: el pórtico tiene fondo.
  ctx.globalAlpha = 0.3;
  px(ctx, PALETTE.ink, 9, 15, 2, 27);
  px(ctx, PALETTE.ink, W - 11, 15, 2, 27);
  ctx.globalAlpha = 1;
  // Apliques al pie de los pilares.
  px(ctx, PALETTE.ink, 10, 46, 4, 4);
  px(ctx, PALETTE.amberDim, 11, 47, 2, 2);
  px(ctx, PALETTE.ink, W - 14, 46, 4, 4);
  px(ctx, PALETTE.amberDim, W - 13, 47, 2, 2);
}

/** Lo que brilla de la boca principal: rótulo, tubos, paneles, apliques y la luz que sube por la escalera. */
function drawMetroHeroGlow(ctx: Ctx): void {
  const W = HERO_W;
  const H = HERO_H;
  metroLogo(ctx, 16, 4, true);
  drawWord(ctx, 'METRO', 32, 5, '#fff0c8');
  px(ctx, '#ff7a6a', 9, 14, W - 18, 1);
  px(ctx, WARM, 16, 16, 12, 1);
  px(ctx, WARM, W - 28, 16, 12, 1);
  glow(ctx, 22, 19, 9, 0.22, PALETTE.amber);
  glow(ctx, W - 22, 19, 9, 0.22, PALETTE.amber);
  networkMap(ctx, 12, 21, true);
  timetable(ctx, W - 25, 21, true);
  px(ctx, WARM, 11, 47, 2, 2);
  px(ctx, WARM, W - 13, 47, 2, 2);
  glow(ctx, 12, 48, 5, 0.3, PALETTE.amber);
  glow(ctx, W - 12, 48, 5, 0.3, PALETTE.amber);
  // La estación, encendida abajo: luz fría que sube por los peldaños de la boca.
  for (let k = 0; k < 5; k++) {
    ctx.globalAlpha = 0.34 - k * 0.06;
    px(ctx, '#bfe8ff', 27, 35 - k, W - 54, 1);
  }
  // La luz fría sube por los peldaños de arriba, cada vez más débil hacia la calle.
  for (let k = 0; k < 5; k++) {
    ctx.globalAlpha = 0.2 - k * 0.035;
    px(ctx, '#cfeeff', 27, 37 + k * 3, W - 54, 1);
  }
  ctx.globalAlpha = 0.18;
  px(ctx, WARM, 26, 42, W - 52, H - 44);
  ctx.globalAlpha = 1;
}

export function buildUrbanTextures(scene: Phaser.Scene): void {
  make(scene, 'bs-metro-hero', HERO_W, HERO_H, drawMetroHero);
  make(scene, 'bs-metro-hero-glow', HERO_W, HERO_H, drawMetroHeroGlow);
  make(scene, 'prop-flower-bed', TILE * 2, TILE, drawFlowerBed);
  make(scene, 'tile-tactile-0', TILE, TILE, drawTactile);
  make(scene, 'prop-manhole', TILE, TILE, drawManhole);
  make(scene, 'prop-drain', TILE, TILE, drawDrain);
  make(scene, 'prop-leaves', TILE, TILE, drawLeaves);
  make(scene, 'prop-plaza-bench', TILE * 2, 24, drawPlazaBench);
  make(scene, 'prop-street-lamp', TILE, 56, drawStreetLamp);
  make(scene, 'prop-bike-rack', TILE * 2, 20, drawBikeRack);
  make(scene, 'prop-planter-box', TILE * 2, 24, drawPlanterBox);
  make(scene, 'prop-metro-totem', TILE, 48, drawMetroTotem);
  make(scene, 'glow-metro-totem', TILE, 48, drawMetroTotemGlow);
  make(scene, 'prop-info-board', TILE, 32, drawInfoBoard);
  make(scene, 'glow-info-board', TILE, 32, drawInfoBoardGlow);
  make(scene, 'bs-metro-entrance', TILE * 3, TILE * 3, drawMetroEntrance);
  make(scene, 'bs-metro-entrance-glow', TILE * 3, TILE * 3, drawMetroEntranceGlow);
}
