import type Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import { ARENA_CLUB } from '../data/cityEvents';
import { make, px, shade, sprinkle, type Ctx } from './paint';

/**
 * El mobiliario del Distrito Arena (data/arena.ts): taquilla, puesto de comida, puesto de bufandas, mástil con la
 * bandera del club y torre de focos. Mismo idioma que StreetArt: vista cenital con un poco de frente, luz del
 * noroeste, base oscura abajo. Los colores del club salen de ARENA_CLUB: ni un escudo de verdad.
 */

const [TEAL, ORANGE] = ARENA_CLUB.home;
const CONCRETE = '#a7abaf';

/** Taquilla: caseta de hormigón con el frente turquesa, ventanilla con rejilla y la franja naranja del club. */
function drawTicketBooth(ctx: Ctx): void {
  const w = TILE * 2;
  px(ctx, PALETTE.ink, 2, 29, w - 4, 3);
  px(ctx, shade(CONCRETE, -0.08), 1, 4, w - 2, 3); // tejadillo
  px(ctx, shade(CONCRETE, 0.1), 1, 4, w - 2, 1);
  px(ctx, TEAL, 2, 7, w - 4, 22);
  px(ctx, shade(TEAL, 0.12), 2, 7, 2, 22);
  px(ctx, shade(TEAL, -0.15), w - 4, 7, 2, 22);
  px(ctx, ORANGE, 2, 9, w - 4, 2);
  // Dos ventanillas con su rejilla y el mostrador delante.
  for (const x of [5, 18]) {
    px(ctx, PALETTE.ink, x, 13, 9, 8);
    px(ctx, PALETTE.glassLit, x + 1, 14, 7, 1);
    for (let k = 0; k < 3; k++) px(ctx, PALETTE.metal, x + 1 + k * 3, 15, 1, 6);
    px(ctx, CONCRETE, x - 1, 21, 11, 2);
  }
  px(ctx, shade(TEAL, -0.25), 2, 26, w - 4, 3);
}

/** Puesto de comida: mostrador con toldo a rayas naranja y blanco, la plancha y el cartel de bocadillos. */
function drawFoodStall(ctx: Ctx): void {
  const w = TILE * 2;
  px(ctx, PALETTE.ink, 2, 29, w - 4, 3);
  for (let x = 1; x < w - 1; x++) px(ctx, Math.floor((x + 1) / 4) % 2 === 0 ? ORANGE : PALETTE.white, x, 3, 1, 6);
  px(ctx, shade(ORANGE, -0.25), 1, 9, w - 2, 1);
  px(ctx, PALETTE.metal, 2, 10, 1, 12);
  px(ctx, PALETTE.metal, w - 3, 10, 1, 12);
  // La plancha con lo que se hace y el vapor que sube.
  px(ctx, PALETTE.ink, 5, 15, 12, 3);
  px(ctx, '#b8643a', 6, 15, 3, 1);
  px(ctx, '#b8643a', 10, 15, 4, 1);
  px(ctx, '#d6d2c8', 7, 12, 1, 2);
  px(ctx, '#d6d2c8', 11, 11, 1, 2);
  // Cartel de precios y el mostrador.
  px(ctx, PALETTE.white, 20, 12, 8, 6);
  for (let y = 13; y < 17; y += 2) px(ctx, PALETTE.ink, 21, y, 6, 1);
  px(ctx, TEAL, 1, 20, w - 2, 7);
  px(ctx, shade(TEAL, 0.14), 1, 20, w - 2, 1);
  px(ctx, shade(TEAL, -0.2), 1, 26, w - 2, 1);
}

/** Puesto de bufandas: un bastidor del que cuelgan bufandas a rayas de los dos colores, y gorros encima. */
function drawScarfStand(ctx: Ctx): void {
  const w = TILE * 2;
  px(ctx, PALETTE.ink, 2, 29, w - 4, 3);
  px(ctx, PALETTE.iron, 2, 6, 1, 23);
  px(ctx, PALETTE.iron, w - 3, 6, 1, 23);
  px(ctx, PALETTE.iron, 2, 6, w - 4, 1);
  for (let i = 0; i < 6; i++) {
    const x = 4 + i * 4;
    const len = 14 + ((i * 5) % 6);
    for (let y = 7; y < 7 + len; y++) px(ctx, Math.floor((y - 7) / 3) % 2 === 0 ? (i % 2 ? ORANGE : TEAL) : PALETTE.white, x, y, 3, 1);
    px(ctx, shade(i % 2 ? ORANGE : TEAL, -0.2), x, 7 + len, 3, 1); // flecos
  }
  // Gorros de lana sobre la barra de arriba.
  for (const [x, c] of [[6, TEAL], [14, ORANGE], [22, TEAL]] as const) {
    px(ctx, c, x, 2, 5, 4);
    px(ctx, PALETTE.white, x + 2, 1, 1, 1);
  }
}

/** Mástil con la bandera del club: turquesa con la franja naranja y unas alas blancas (el halcón, sin escudo). */
function drawFlagPole(ctx: Ctx): void {
  px(ctx, PALETTE.ink, 5, 61, 6, 3);
  px(ctx, PALETTE.metalLit, 7, 2, 2, 60);
  px(ctx, shade(PALETTE.metalLit, -0.2), 8, 2, 1, 60);
  px(ctx, PALETTE.white, 7, 1, 2, 1);
  // La bandera, de un lado: ondea un poco (el borde no es recto).
  for (let x = 0; x < 7; x++) {
    const dy = x % 3 === 1 ? 1 : 0;
    px(ctx, TEAL, 9 + x, 3 + dy, 1, 12);
    px(ctx, ORANGE, 9 + x, 8 + dy, 1, 2);
  }
  px(ctx, PALETTE.white, 11, 5, 3, 1);
  px(ctx, PALETTE.white, 10, 6, 1, 1);
  px(ctx, PALETTE.white, 14, 6, 1, 1);
}

/** Torre de focos: celosía de acero y, arriba, el panel de focos (de noche, la luz fría que cae sobre la explanada). */
function drawFloodlight(ctx: Ctx): void {
  px(ctx, PALETTE.ink, 3, 61, 10, 3);
  px(ctx, PALETTE.metal, 5, 12, 1, 50);
  px(ctx, PALETTE.metal, 10, 12, 1, 50);
  for (let y = 14; y < 60; y += 6) {
    px(ctx, shade(PALETTE.metal, 0.15), 6, y, 4, 1);
    px(ctx, shade(PALETTE.metal, -0.1), 6, y + 3, 4, 1);
  }
  px(ctx, PALETTE.iron, 1, 2, 14, 10);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) px(ctx, '#e8f2ff', 2 + x * 3, 3 + y * 4, 2, 3);
  px(ctx, shade(PALETTE.iron, 0.2), 1, 2, 14, 1);
}

// ------------------------------------------------------------------ el estadio por dentro (data/stadium.ts)

const STAND = '#a9afb3';
const TURF = '#3f8a4a';
const TURF_LIT = '#4a9a55';

/** Césped a franjas de corte: media tile clara, media oscura; de lado a lado del campo se leen como franjas. */
function drawPitch(ctx: Ctx, v: number): void {
  px(ctx, TURF_LIT, 0, 0, TILE, TILE / 2);
  px(ctx, TURF, 0, TILE / 2, TILE, TILE / 2);
  sprinkle(ctx, shade(TURF_LIT, 0.05), TILE, TILE / 2, 31 + v, 6);
  sprinkle(ctx, shade(TURF, -0.05), TILE, TILE, 47 + v, 6);
}

/** La banda: el césped con la línea blanca, y un borde de césped oscuro hasta las vallas. */
function drawPitchLine(ctx: Ctx): void {
  drawPitch(ctx, 0);
  px(ctx, PALETTE.white, 0, 9, TILE, 2);
  px(ctx, '#2f6a3a', 0, 13, TILE, 3);
}

/** Valla de publicidad: el canto de arriba y la cara que mira a la grada, a paneles turquesa y naranja. */
function drawAdBoard(ctx: Ctx, v: number): void {
  const face = v === 0 ? TEAL : ORANGE;
  const text = v === 0 ? ORANGE : PALETTE.white;
  px(ctx, shade(face, -0.35), 0, 0, TILE, 4);
  px(ctx, face, 0, 4, TILE, 10);
  px(ctx, shade(face, 0.12), 0, 4, TILE, 1);
  // Las letras del anunciante: bloques que no se leen.
  for (let x = 2; x < TILE - 2; x += 4) px(ctx, text, x, 7, 3, 4);
  px(ctx, shade(face, -0.3), 0, 14, TILE, 2);
}

/** Escalón de la grada: hormigón con el canto del escalón y su sombra. */
function drawStandStep(ctx: Ctx, v: number): void {
  px(ctx, STAND, 0, 0, TILE, TILE);
  sprinkle(ctx, shade(STAND, -0.05), TILE, TILE, 61 + v, 9);
  px(ctx, shade(STAND, 0.08), 0, 0, TILE, 1);
  px(ctx, shade(STAND, -0.22), 0, TILE - 2, TILE, 2);
}

/** La escalera de la grada: peldaños cortos con su banda amarilla de seguridad en el borde. */
function drawStandStairs(ctx: Ctx): void {
  px(ctx, shade(STAND, -0.04), 0, 0, TILE, TILE);
  for (let y = 0; y < TILE; y += 4) {
    px(ctx, '#d9b23a', 0, y, TILE, 1);
    px(ctx, shade(STAND, -0.2), 0, y + 3, TILE, 1);
  }
}

/** Asiento abatible bajado: el asiento y su soporte (el respaldo es la capa de delante). */
function drawStadiumSeat(ctx: Ctx): void {
  px(ctx, shade(TEAL, -0.25), 3, 6, 10, 5);
  px(ctx, TEAL, 3, 6, 10, 4);
  px(ctx, shade(TEAL, 0.15), 3, 6, 10, 1);
  px(ctx, PALETTE.metal, 7, 11, 2, 3);
}

/** El respaldo, delante de la espalda de quien se sienta mirando al campo. */
function drawStadiumSeatFront(ctx: Ctx): void {
  px(ctx, TEAL, 3, 3, 10, 5);
  px(ctx, shade(TEAL, 0.15), 3, 3, 10, 1);
  px(ctx, shade(TEAL, -0.25), 3, 7, 10, 1);
}

export function buildArenaTextures(scene: Phaser.Scene): void {
  make(scene, 'prop-ticket-booth', TILE * 2, TILE * 2, drawTicketBooth);
  make(scene, 'prop-food-stall', TILE * 2, TILE * 2, drawFoodStall);
  make(scene, 'prop-scarf-stand', TILE * 2, TILE * 2, drawScarfStand);
  make(scene, 'prop-flag-pole', TILE, TILE * 4, drawFlagPole);
  make(scene, 'prop-floodlight', TILE, TILE * 4, drawFloodlight);
  for (let v = 0; v < 2; v++) {
    make(scene, `tile-pitch-${v}`, TILE, TILE, (ctx) => drawPitch(ctx, v));
    make(scene, `tile-ad-board-${v}`, TILE, TILE, (ctx) => drawAdBoard(ctx, v));
    make(scene, `tile-stand-step-${v}`, TILE, TILE, (ctx) => drawStandStep(ctx, v));
  }
  make(scene, 'tile-pitch-line-0', TILE, TILE, drawPitchLine);
  make(scene, 'tile-stand-stairs-0', TILE, TILE, drawStandStairs);
  make(scene, 'prop-stadium-seat', TILE, TILE, drawStadiumSeat);
  make(scene, 'prop-stadium-seat-front', TILE, TILE, drawStadiumSeatFront);
}
