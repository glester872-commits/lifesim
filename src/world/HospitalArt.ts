import type Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import { drawWord, make, px, shade, wordWidth, type Ctx } from './paint';

/**
 * HOSP-01 · Mobiliario del Hospital General (data/hospitalVenues.ts) y la ambulancia de la Ronda. El mismo idioma que
 * world/PropArt: vista cenital con algo de frente, base oscura abajo, luz arriba a la izquierda, sin contorno negro.
 * Metal claro, colchoneta azul grisácea y blanco clínico; el rojo sólo en urgencias.
 */

const STEEL = '#b9c1c8';
const STEEL_DARK = '#7f8a94';
const RED = '#c8302a';
const SCRUB = '#7fb4d6';

const shadow = (ctx: Ctx, w: number, y: number): void => px(ctx, 'rgba(0,0,0,0.28)', 1, y, w - 2, 2);

/**
 * Camilla de exploración (no una cama): tapizado vinílico verde clínico, estrecha, con el cabecero inclinado (más claro
 * arriba, sin almohada), el rollo de papel blanco corrido a lo largo, cuatro patas de acero a la vista y el escalón.
 */
function drawExamBed(ctx: Ctx): void {
  const vinyl = '#3f8f7f';
  shadow(ctx, TILE, 29);
  // Patas y travesaño, bien visibles bajo el tablero.
  for (const x of [3, 11]) px(ctx, STEEL_DARK, x, 20, 2, 9);
  px(ctx, STEEL, 3, 25, 10, 1);
  // Tablero estrecho con su canto de acero.
  px(ctx, STEEL, 2, 4, 11, 17);
  px(ctx, vinyl, 3, 5, 9, 15);
  // Cabecero inclinado: el tercio de arriba, con la luz de la pendiente y la junta.
  px(ctx, shade(vinyl, 0.2), 3, 5, 9, 5);
  px(ctx, shade(vinyl, 0.32), 3, 5, 9, 1);
  px(ctx, shade(vinyl, -0.25), 3, 10, 9, 1);
  // Papel del rollo a lo largo (más estrecho que el tapizado) y el rollo en la cabecera.
  px(ctx, PALETTE.white, 5, 6, 5, 14);
  px(ctx, shade(PALETTE.white, -0.08), 5, 10, 5, 1);
  px(ctx, '#e4e8ea', 4, 2, 7, 3);
  px(ctx, PALETTE.white, 4, 2, 7, 1);
  px(ctx, STEEL_DARK, 3, 3, 1, 1);
  px(ctx, STEEL_DARK, 11, 3, 1, 1);
  // El escalón de dos peldaños, a la derecha.
  px(ctx, STEEL_DARK, 13, 22, 3, 7);
  px(ctx, STEEL, 13, 22, 3, 1);
  px(ctx, STEEL, 13, 26, 3, 1);
}

/** Camilla de urgencias: más alta, con barandillas a los lados y ruedas. */
function drawErBed(ctx: Ctx): void {
  shadow(ctx, TILE, 29);
  for (const x of [2, 12]) {
    px(ctx, STEEL_DARK, x, 24, 2, 5);
    px(ctx, PALETTE.ink, x, 28, 2, 2);
  }
  px(ctx, STEEL, 1, 4, 14, 21);
  px(ctx, '#d9dee3', 2, 5, 12, 19);
  px(ctx, PALETTE.white, 3, 6, 10, 4);
  px(ctx, '#a9c3d6', 3, 11, 10, 12);
  px(ctx, shade('#a9c3d6', -0.12), 3, 22, 10, 1);
  // Barandillas.
  for (const x of [0, 15]) {
    px(ctx, STEEL_DARK, x, 8, 1, 14);
    px(ctx, STEEL, x, 8, 1, 1);
  }
}

/** Bancada metálica de dos plazas: respaldo al norte, asientos perforados y brazos en los extremos y en medio. */
function drawWaitSeat(ctx: Ctx): void {
  const w = TILE * 2;
  shadow(ctx, w, 14);
  px(ctx, STEEL_DARK, 0, 1, w, 4);
  px(ctx, STEEL, 0, 1, w, 1);
  for (const x of [1, 17]) {
    px(ctx, '#4f6f8c', x, 5, 14, 7);
    px(ctx, shade('#4f6f8c', 0.14), x, 5, 14, 1);
    for (let k = 0; k < 4; k++) px(ctx, shade('#4f6f8c', -0.18), x + 2 + k * 3, 8, 1, 1);
  }
  for (const x of [0, 15, 31]) px(ctx, STEEL, x, 4, 1, 9);
  for (const x of [3, 28]) px(ctx, STEEL_DARK, x, 12, 1, 3);
}

/** Cortina de box: riel arriba y pliegues verticales de tela verde agua. */
function drawCurtain(ctx: Ctx): void {
  px(ctx, STEEL, 0, 1, TILE, 1);
  const cloth = '#9cc8bf';
  for (let x = 1; x < 15; x++) px(ctx, x % 3 === 0 ? shade(cloth, -0.14) : x % 3 === 1 ? shade(cloth, 0.08) : cloth, x, 2, 1, 27);
  px(ctx, shade(cloth, -0.22), 1, 28, 14, 2);
}

/** Carro de curas: dos bandejas de acero y la de arriba con gasas y frascos; ruedas. */
function drawCart(ctx: Ctx): void {
  shadow(ctx, TILE, 29);
  px(ctx, STEEL_DARK, 2, 10, 1, 18);
  px(ctx, STEEL_DARK, 13, 10, 1, 18);
  px(ctx, STEEL, 1, 8, 14, 3);
  px(ctx, STEEL, 1, 19, 14, 2);
  px(ctx, PALETTE.white, 3, 6, 4, 2);
  px(ctx, SCRUB, 9, 4, 2, 4);
  px(ctx, '#e8c86a', 12, 5, 1, 3);
  px(ctx, '#d9dee3', 3, 16, 10, 3);
  for (const x of [1, 13]) px(ctx, PALETTE.ink, x, 28, 2, 2);
}

/** Armario de material: blanco, dos puertas con tirador y el estante de cristal arriba. */
function drawCabinet(ctx: Ctx): void {
  shadow(ctx, TILE, 29);
  px(ctx, '#dfe4e8', 1, 2, 14, 27);
  px(ctx, PALETTE.white, 1, 2, 14, 1);
  px(ctx, PALETTE.glass, 3, 4, 10, 8);
  px(ctx, PALETTE.glassLit, 3, 4, 3, 1);
  px(ctx, PALETTE.white, 4, 8, 2, 3);
  px(ctx, SCRUB, 8, 7, 3, 4);
  px(ctx, shade('#dfe4e8', -0.16), 8, 14, 1, 14);
  for (const x of [6, 10]) px(ctx, STEEL_DARK, x, 20, 1, 3);
}

/** Dispensador de gel en su pie: botella blanca con la etiqueta azul y el pulsador. */
function drawSanitizer(ctx: Ctx): void {
  shadow(ctx, TILE, 29);
  px(ctx, STEEL_DARK, 7, 14, 2, 15);
  px(ctx, STEEL, 5, 28, 6, 2);
  px(ctx, PALETTE.white, 5, 5, 6, 10);
  px(ctx, '#2f6f9a', 5, 9, 6, 3);
  px(ctx, STEEL_DARK, 6, 3, 4, 2);
}

/** Monitor de constantes en su pie: pantalla oscura con la línea verde. */
function drawMonitor(ctx: Ctx): void {
  shadow(ctx, TILE, 29);
  px(ctx, STEEL_DARK, 7, 16, 2, 13);
  px(ctx, STEEL, 4, 28, 8, 2);
  px(ctx, '#3a3f48', 2, 4, 12, 12);
  px(ctx, '#11161c', 3, 5, 10, 9);
  const trace = [10, 10, 10, 7, 12, 10, 10, 9, 10, 10];
  trace.forEach((y, i) => px(ctx, '#6fe08a', 3 + i, y, 1, 1));
  px(ctx, '#e8c86a', 11, 6, 1, 1);
}

/** Rótulo de servicio en la pared: placa con la palabra a la escala de la fuente del metro (paint.drawWord). */
function drawSign(ctx: Ctx, word: string, plate: string, ink: string): void {
  const w = TILE * 4;
  px(ctx, shade(plate, -0.2), 1, 2, w - 2, 13);
  px(ctx, plate, 1, 2, w - 2, 12);
  px(ctx, shade(plate, 0.12), 1, 2, w - 2, 1);
  const gap = wordWidth(word, 2) <= w - 6 ? 2 : 1;
  // La tilde de ADMISIÓN, por encima de la letra (paint.drawWord `raised`), dentro de la placa.
  drawWord(ctx, word, Math.floor((w - wordWidth(word, gap)) / 2), 6, ink, gap, true);
}

/**
 * Ambulancia vista desde arriba, en una sola fila (no asoma a la de encima: nadie se dibuja sobre su techo): techo
 * blanco con la cruz, la barra de luces, el parabrisas al oeste y la banda roja con cuadros por los costados. Decorado.
 */
function drawAmbulance(ctx: Ctx): void {
  const w = TILE * 4;
  px(ctx, 'rgba(0,0,0,0.3)', 3, 14, w - 6, 2);
  px(ctx, '#dfe3e6', 2, 1, w - 4, 13);
  px(ctx, '#eef1f2', 14, 2, w - 17, 11);
  px(ctx, PALETTE.white, 14, 2, w - 17, 1);
  // Cabina y parabrisas (morro al oeste).
  px(ctx, PALETTE.glass, 5, 3, 7, 9);
  px(ctx, PALETTE.glassLit, 6, 4, 2, 1);
  // Bandas de los costados: roja y de cuadros amarillos.
  px(ctx, RED, 2, 1, w - 4, 1);
  px(ctx, RED, 2, 13, w - 4, 1);
  for (let x = 15; x < w - 4; x += 5) {
    px(ctx, '#f2c230', x, 2, 2, 1);
    px(ctx, '#f2c230', x + 2, 12, 2, 1);
  }
  // Barra de luces y la cruz en el techo.
  px(ctx, '#5aa8ff', 14, 4, 2, 7);
  px(ctx, RED, 16, 4, 1, 7);
  px(ctx, RED, 36, 4, 3, 7);
  px(ctx, RED, 34, 6, 7, 3);
}

/** Dársena de ambulancias pintada en la calzada: recuadro amarillo con rayado y la palabra, plano en el suelo. */
function drawAmbulanceBay(ctx: Ctx): void {
  const w = TILE * 6;
  const paint = '#e0b832';
  px(ctx, paint, 0, 1, w, 1);
  px(ctx, paint, 0, 14, w, 1);
  px(ctx, paint, 0, 1, 1, 14);
  px(ctx, paint, w - 1, 1, 1, 14);
  // Rayado en los dos extremos (lo que la ambulancia no tapa), en diagonal.
  for (const x0 of [2, w - 14]) {
    for (let k = 0; k < 12; k += 4) for (let i = 0; i < 12; i++) if (i + k < 12) px(ctx, paint, x0 + i + k, 13 - i, 1, 1);
  }
  drawWord(ctx, 'AMBULANCIAS', Math.round((w - wordWidth('AMBULANCIAS', 1)) / 2), 4, shade(paint, -0.1), 1);
}

// ---------------------------------------------------------------- el edificio (BuildingArt.bakeBuildings)
//
// Frente al norte: la fila de arriba es la fachada de canto que da a la acera (entrada, marquesina y letrero); el resto
// es azotea y, en las dos filas de abajo, la espalda que ve la cámara. Ahí va el volumen: el bloque alto con sus dos
// cintas de ventanal y las alas bajas a los lados, más cortas de fachada y con la sombra del bloque encima.

/** Ruido determinista por píxel: rompe el gris sin repetir cada dos tiles. */
const noise = (x: number, y: number, seed: number): number => ((Math.imul(x * 374761393 + y * 668265263 + seed * 2246822519, 1274126177) >>> 0) % 1000) / 1000;

const FACADE = '#eef1f2';
const FACADE_SHADE = '#cfd5d9';
const RIBBON = '#34495a';
const FRAME = '#9aa4ab';
const ROOF_LOW = '#a7abae';
const ROOF_HIGH = '#8c9195';
const CANOPY = '#8a9096';
const BLUE = '#2f6f9a';

/** Una azotea de grava con su pretil claro, con manchas de ruido (no losetas). */
function roof(ctx: Ctx, x: number, y: number, w: number, h: number, base: string, seed: number): void {
  px(ctx, base, x, y, w, h);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const v = noise(x + xx, y + yy, seed);
    if (v > 0.93) px(ctx, shade(base, 0.08), x + xx, y + yy);
    else if (v < 0.07) px(ctx, shade(base, -0.08), x + xx, y + yy);
  }
  px(ctx, shade(base, 0.22), x, y, w, 1);
  px(ctx, shade(base, 0.12), x, y, 1, h);
  px(ctx, shade(base, -0.2), x, y + h - 1, w, 1);
}

/** Una cinta de ventanal oscuro con su marco y montantes a paso irregular (sale del ruido, no de una rejilla). */
function ribbon(ctx: Ctx, x: number, y: number, w: number, h: number, seed: number): void {
  px(ctx, FRAME, x - 1, y - 1, w + 2, h + 2);
  px(ctx, RIBBON, x, y, w, h);
  px(ctx, shade(RIBBON, 0.18), x, y, w, 1);
  let at = x + 3 + Math.floor(noise(x, y, seed) * 5);
  while (at < x + w - 2) {
    px(ctx, FRAME, at, y, 1, h);
    // Algún reflejo suelto en el cristal.
    if (noise(at, y, seed + 1) > 0.6) px(ctx, PALETTE.glassLit, at + 2, y + 1, 2, 1);
    at += 9 + Math.floor(noise(at, y, seed + 2) * 7);
  }
}

/**
 * Lo que hay encima de la fachada de un cuerpo bajo, en la espalda: su azotea hasta el borde y la cornisa clara con su
 * sombra suave sobre la pared. Antes quedaba sin pintar y se leía como una banda negra.
 */
function lowBack(ctx: Ctx, x: number, back: number, w: number, seed: number): void {
  roof(ctx, x, back, w, 8, ROOF_LOW, seed);
  px(ctx, PALETTE.stoneLit, x, back + 8, w, 1);
  px(ctx, FACADE_SHADE, x, back + 9, w, 1);
}

/** Puertas dobles de cristal con marco claro, centradas en `cx`, y el felpudo con la rampa delante. */
function doubleDoor(ctx: Ctx, cx: number, top: number, leaf: number): void {
  const frame = '#e6eaec';
  px(ctx, frame, cx - leaf - 1, top, leaf * 2 + 2, TILE - top - 2);
  for (const x of [cx - leaf, cx + 1]) {
    px(ctx, PALETTE.glass, x, top + 1, leaf - 1, TILE - top - 4);
    px(ctx, PALETTE.glassLit, x + 1, top + 2, 2, 1);
  }
  px(ctx, STEEL_DARK, cx - 2, top + 5, 1, 2);
  px(ctx, STEEL_DARK, cx + 2, top + 5, 1, 2);
  // Felpudo gris y la rampa, un poco más ancha, con su canto claro.
  px(ctx, '#9aa0a4', cx - leaf - 4, TILE - 2, leaf * 2 + 9, 2);
  px(ctx, '#5f666b', cx - leaf, TILE - 2, leaf * 2 + 1, 2);
}

/** Marquesina de color volada sobre una entrada, centrada en `cx`, con la cruz en su placa y los dos pilares. */
function porch(ctx: Ctx, cx: number, half: number, color: string, cross: string, badge: string): void {
  px(ctx, color, cx - half, 0, half * 2, 5);
  px(ctx, shade(color, 0.22), cx - half, 0, half * 2, 1);
  px(ctx, shade(color, -0.3), cx - half, 5, half * 2, 1);
  for (const x of [cx - half + 2, cx + half - 3]) px(ctx, FRAME, x, 6, 1, TILE - 8);
  px(ctx, badge, cx - 3, 0, 7, 5);
  px(ctx, cross, cx, 0, 1, 5);
  px(ctx, cross, cx - 2, 2, 5, 1);
}

/** El Hospital General: bloque alto en medio con alas bajas, entrada acristalada con marquesina y el letrero. */
export function drawHospital(ctx: Ctx, w: number, h: number, col: number): void {
  const door = col * TILE;
  // Bloque alto: de un tercio a cinco sextos del ancho; las alas, a los lados.
  const t0 = Math.round(w * 0.24);
  const t1 = Math.round(w * 0.78);
  const back = h - TILE * 2;
  // Azotea: las alas bajas y, más oscura, la del bloque alto, que da sombra sobre el ala de la derecha.
  roof(ctx, 0, TILE, w, back - TILE, ROOF_LOW, 11);
  roof(ctx, t0, TILE + 3, t1 - t0, back - TILE - 3, ROOF_HIGH, 23);
  px(ctx, 'rgba(0,0,0,0.22)', t1, TILE + 6, 6, back - TILE - 6);
  // En la azotea alta: el helipuerto con la H y dos máquinas de clima.
  const hx = Math.round((t0 + t1) / 2) - 10;
  px(ctx, '#7a7f83', hx, TILE + 7, 20, 18);
  px(ctx, '#e8c86a', hx + 1, TILE + 8, 18, 1);
  px(ctx, '#e8c86a', hx + 1, TILE + 23, 18, 1);
  drawWord(ctx, 'H', hx + 8, TILE + 12, PALETTE.white);
  for (const ax of [t0 + 8, t1 - 22]) {
    px(ctx, '#c4c9cc', ax, TILE + 9, 12, 8);
    px(ctx, '#6f767b', ax + 2, TILE + 11, 8, 4);
  }
  // Espalda (lo que ve la cámara): el bloque alto, de arriba abajo con dos cintas de ventanal; las alas, más bajas.
  px(ctx, FACADE, t0, back, t1 - t0, TILE * 2);
  px(ctx, FACADE_SHADE, t0, back + TILE * 2 - 2, t1 - t0, 2);
  ribbon(ctx, t0 + 3, back + 4, t1 - t0 - 6, 6, 5);
  ribbon(ctx, t0 + 3, back + 16, t1 - t0 - 6, 6, 9);
  for (const [x0, x1] of [[0, t0], [t1, w]] as const) {
    // Las alas son más bajas: su azotea sigue hasta la cornisa y la fachada empieza debajo (sin hueco sin pintar).
    lowBack(ctx, x0, back, x1 - x0, 11 + x0);
    px(ctx, shade(FACADE, -0.04), x0, back + 10, x1 - x0, TILE * 2 - 10);
    px(ctx, FACADE_SHADE, x0, back + TILE * 2 - 2, x1 - x0, 2);
    ribbon(ctx, x0 + 3, back + 17, x1 - x0 - 6, 6, x0 + 3);
  }
  // Las aristas del bloque alto, para que se lea de otra altura.
  px(ctx, shade(FACADE, 0.06), t0, back, 1, TILE * 2);
  px(ctx, FACADE_SHADE, t1 - 1, back, 1, TILE * 2);
  // Frente (la acera): zócalo blanco, la cinta de cristal y la entrada bajo la marquesina gris.
  px(ctx, FACADE, 0, 0, w, TILE);
  px(ctx, FACADE_SHADE, 0, TILE - 2, w, 2);
  // La entrada, centrada en la columna de la puerta (x 28 del barrio): cristal fijo a los lados, puertas dobles en
  // medio, felpudo y rampa, y encima la marquesina azul con la cruz.
  const cx = door + 8;
  ribbon(ctx, 2, 6, cx - 30, 6, 3);
  ribbon(ctx, cx + 28, 6, w - cx - 30, 6, 7);
  px(ctx, '#e6eaec', cx - 22, 6, 44, 8);
  px(ctx, '#3d5566', cx - 21, 7, 42, 6);
  for (const x of [cx - 14, cx + 13]) px(ctx, '#e6eaec', x, 7, 1, 6);
  px(ctx, PALETTE.glassLit, cx - 19, 8, 3, 1);
  doubleDoor(ctx, cx, 6, 7);
  porch(ctx, cx, 26, BLUE, RED, PALETTE.white);
  // Bajo la marquesina, su canto gris de chapa.
  px(ctx, CANOPY, cx - 26, 5, 52, 1);
  // El letrero sobre la cinta de la izquierda: placa azul, letras blancas, la cruz roja delante.
  const sign = 'HOSPITAL GENERAL';
  const sw = wordWidth(sign, 1);
  const sx = Math.max(14, Math.round((door - 32 - sw) / 2) + 6);
  px(ctx, BLUE, sx - 3, 3, sw + 6, 11);
  px(ctx, shade(BLUE, 0.15), sx - 3, 3, sw + 6, 1);
  drawWord(ctx, sign, sx, 5, PALETTE.white, 1);
  px(ctx, PALETTE.white, sx - 13, 3, 9, 9);
  px(ctx, RED, sx - 10, 4, 3, 7);
  px(ctx, RED, sx - 12, 6, 7, 3);
}

/** El ala de urgencias: franja roja corrida, letrero URGENCIAS y la puerta ancha de ambulancias. */
export function drawEmergencyWing(ctx: Ctx, w: number, h: number, col: number): void {
  const door = col * TILE;
  const back = h - TILE * 2;
  roof(ctx, 0, TILE, w, back - TILE, ROOF_LOW, 31);
  // La cruz roja pintada en la azotea: se ve desde arriba, como en los techos de urgencias.
  const cx = Math.round(w / 2);
  px(ctx, PALETTE.white, cx - 9, TILE + 6, 18, 18);
  px(ctx, RED, cx - 3, TILE + 8, 6, 14);
  px(ctx, RED, cx - 7, TILE + 12, 14, 6);
  // Espalda baja: la azotea hasta la cornisa y, debajo, la fachada con su franja roja.
  lowBack(ctx, 0, back, w, 37);
  px(ctx, shade(FACADE, -0.04), 0, back + 10, w, TILE * 2 - 10);
  px(ctx, RED, 0, back + 10, w, 3);
  px(ctx, FACADE_SHADE, 0, back + TILE * 2 - 2, w, 2);
  ribbon(ctx, 3, back + 17, w - 6, 6, 13);
  // Frente: franja roja arriba, el letrero y la puerta ancha.
  px(ctx, FACADE, 0, 0, w, TILE);
  px(ctx, RED, 0, 0, w, 3);
  px(ctx, shade(RED, -0.25), 0, 3, w, 1);
  px(ctx, FACADE_SHADE, 0, TILE - 2, w, 2);
  const word = 'URGENCIAS';
  const ww = wordWidth(word, 1);
  const wx = Math.max(3, Math.round((door - 6 - ww) / 2));
  px(ctx, RED, wx - 2, 5, ww + 4, 9);
  drawWord(ctx, word, wx, 6, PALETTE.white, 1);
  // El acceso de urgencias, centrado en su columna: puertas dobles, felpudo y rampa bajo una marquesina roja más corta.
  const dx = door + 8;
  doubleDoor(ctx, dx, 6, 6);
  porch(ctx, dx, 13, shade(RED, -0.12), RED, PALETTE.white);
  ribbon(ctx, dx + 16, 6, w - dx - 18, 6, 17);
}

/** Lo que brilla de noche: los ventanales del frente y de la espalda y los dos letreros. */
export function drawHospitalGlow(ctx: Ctx, w: number, h: number, col: number, wing: boolean): void {
  const door = col * TILE;
  const back = h - TILE * 2;
  const lit = 'rgba(190,230,255,0.55)';
  if (wing) {
    px(ctx, 'rgba(255,90,80,0.7)', 0, 0, w, 3);
    px(ctx, lit, door + 2, 7, 12, 6);
    px(ctx, lit, 3, back + 17, w - 6, 6);
    return;
  }
  const t0 = Math.round(w * 0.24);
  const t1 = Math.round(w * 0.78);
  for (let x = t0 + 3; x < t1 - 3; x++) {
    if (noise(x >> 3, 0, 41) > 0.35) px(ctx, lit, x, back + 4, 1, 6);
    if (noise(x >> 3, 1, 43) > 0.45) px(ctx, lit, x, back + 16, 1, 6);
  }
  px(ctx, lit, door - 13, 7, 42, 6);
  px(ctx, 'rgba(160,210,255,0.6)', 14, 3, Math.max(0, door - 46), 11);
}

export function buildHospitalTextures(scene: Phaser.Scene): void {
  make(scene, 'prop-hosp-bed', TILE, TILE * 2, drawExamBed);
  make(scene, 'prop-er-bed', TILE, TILE * 2, drawErBed);
  make(scene, 'prop-hosp-seat', TILE * 2, TILE, drawWaitSeat);
  make(scene, 'prop-curtain', TILE, TILE * 2, drawCurtain);
  make(scene, 'prop-med-cart', TILE, TILE * 2, drawCart);
  make(scene, 'prop-med-cabinet', TILE, TILE * 2, drawCabinet);
  make(scene, 'prop-sanitizer', TILE, TILE * 2, drawSanitizer);
  make(scene, 'prop-monitor-stand', TILE, TILE * 2, drawMonitor);
  make(scene, 'prop-hosp-sign-0', TILE * 4, TILE, (ctx) => drawSign(ctx, 'URGENCIAS', RED, PALETTE.white));
  make(scene, 'prop-hosp-sign-1', TILE * 4, TILE, (ctx) => drawSign(ctx, 'CONSULTAS', '#2f6f9a', PALETTE.white));
  make(scene, 'prop-hosp-sign-2', TILE * 4, TILE, (ctx) => drawSign(ctx, 'ADMISIÓN', '#2f6f9a', PALETTE.white));
  make(scene, 'prop-hosp-sign-3', TILE * 4, TILE, (ctx) => drawSign(ctx, 'CONSULTA 1', '#2f6f9a', PALETTE.white));
  make(scene, 'prop-hosp-sign-4', TILE * 4, TILE, (ctx) => drawSign(ctx, 'CONSULTA 2', '#2f6f9a', PALETTE.white));
  make(scene, 'prop-ambulance', TILE * 4, TILE, drawAmbulance);
  make(scene, 'prop-ambulance-bay', TILE * 6, TILE, drawAmbulanceBay);
}
