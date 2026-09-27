import type Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import { make, px, shade, type Ctx } from './paint';

/**
 * Mobiliario menudo de la calle: contenedores de reciclaje, buzón, bolardos,
 * señales, armario del semáforo, patinetes de alquiler, mupi, vallas de obra,
 * contenedor de escombros y basura del suelo. Mismo idioma que el resto:
 * vista cenital con un poco de frente, luz del noroeste, base oscura abajo.
 * Dónde va cada cosa lo decide systems/Dressing.ts, no el azar.
 */

const IRON = PALETTE.iron;

/** Contenedores de colores: amarillo (envases), azul (papel), verde (vidrio), gris (resto). */
const BINS = ['#d9b43a', '#3f63a8', '#4f8a4a', '#6a6f78'] as const;

function drawContainer(ctx: Ctx, v: number): void {
  const c = BINS[v];
  if (v === 2) {
    // El de vidrio es el iglú: redondo, con dos bocas.
    px(ctx, shade(c, -0.2), 2, 18, 12, 2);
    px(ctx, c, 2, 8, 12, 10);
    px(ctx, c, 4, 6, 8, 2);
    px(ctx, shade(c, 0.12), 3, 8, 3, 8);
    px(ctx, shade(c, -0.12), 11, 8, 3, 10);
    px(ctx, PALETTE.ink, 5, 10, 2, 2);
    px(ctx, PALETTE.ink, 9, 10, 2, 2);
    return;
  }
  px(ctx, PALETTE.ink, 2, 18, 3, 2);
  px(ctx, PALETTE.ink, 11, 18, 3, 2);
  px(ctx, c, 1, 7, 14, 11);
  px(ctx, shade(c, 0.12), 1, 7, 3, 10);
  px(ctx, shade(c, -0.14), 12, 7, 3, 11);
  px(ctx, shade(c, -0.2), 0, 4, 16, 3); // tapa
  px(ctx, shade(c, -0.08), 1, 4, 14, 1);
  px(ctx, PALETTE.ink, 5, 9, 6, 1); // boca
  px(ctx, PALETTE.white, 7, 12, 2, 2); // pegatina del símbolo
}

/** Buzón de correos amarillo sobre su pie. */
function drawMailbox(ctx: Ctx): void {
  const y = '#e6b422';
  px(ctx, IRON, 6, 16, 4, 6);
  px(ctx, y, 3, 5, 10, 11);
  px(ctx, y, 4, 4, 8, 1);
  px(ctx, shade(y, 0.14), 4, 5, 2, 10);
  px(ctx, shade(y, -0.16), 11, 5, 2, 11);
  px(ctx, PALETTE.ink, 5, 8, 6, 1); // ranura
  px(ctx, '#2f4f8f', 7, 11, 2, 2); // la corneta
}

/** Bolardo de fundición con su anillo claro. */
function drawBollard(ctx: Ctx): void {
  px(ctx, PALETTE.ink, 5, 13, 6, 1);
  px(ctx, IRON, 6, 4, 4, 9);
  px(ctx, shade(IRON, 0.16), 6, 4, 1, 9);
  px(ctx, IRON, 5, 3, 6, 2);
  px(ctx, PALETTE.kerb, 6, 6, 4, 1);
}

function pole(ctx: Ctx, top: number, h: number): void {
  px(ctx, PALETTE.ink, 6, h - 2, 4, 2);
  px(ctx, PALETTE.metal, 7, top, 2, h - top - 2);
  px(ctx, PALETTE.metalLit, 7, top, 1, h - top - 2);
}

/** Señal de aparcamiento: la P blanca sobre azul. */
function drawParkingSign(ctx: Ctx): void {
  pole(ctx, 10, 36);
  px(ctx, '#2f5aa8', 2, 0, 12, 12);
  px(ctx, shade('#2f5aa8', 0.14), 2, 0, 12, 1);
  px(ctx, PALETTE.white, 6, 3, 2, 7);
  px(ctx, PALETTE.white, 6, 3, 4, 1);
  px(ctx, PALETTE.white, 9, 4, 1, 2);
  px(ctx, PALETTE.white, 6, 6, 4, 1);
}

/** Placa con el nombre de la calle: blanca, con dos renglones que no hace falta leer. */
function drawStreetSign(ctx: Ctx): void {
  pole(ctx, 6, 36);
  px(ctx, PALETTE.ink, 0, 0, 16, 7);
  px(ctx, PALETTE.white, 1, 1, 14, 5);
  px(ctx, '#2f4f8f', 3, 2, 10, 1);
  px(ctx, '#2f4f8f', 4, 4, 7, 1);
}

/** Armario del semáforo: gris verdoso, con rejilla y una pegatina que alguien pegó. */
function drawUtilityBox(ctx: Ctx): void {
  const c = '#7d857a';
  px(ctx, PALETTE.ink, 2, 20, 12, 2);
  px(ctx, c, 2, 4, 12, 16);
  px(ctx, shade(c, 0.1), 2, 4, 12, 1);
  px(ctx, shade(c, -0.12), 12, 5, 2, 15);
  for (let y = 7; y < 12; y += 2) px(ctx, shade(c, -0.18), 4, y, 6, 1);
  px(ctx, '#c0493f', 5, 14, 4, 3);
  px(ctx, PALETTE.white, 6, 15, 2, 1);
}

/** Patinete de alquiler aparcado, del color de su empresa. */
function drawScooter(ctx: Ctx, v: number): void {
  const brand = v === 0 ? '#4cc07a' : '#f08a3a';
  px(ctx, PALETTE.ink, 3, 16, 3, 2);
  px(ctx, PALETTE.ink, 11, 16, 3, 2);
  px(ctx, IRON, 4, 14, 9, 2); // plataforma
  px(ctx, brand, 5, 13, 7, 1);
  px(ctx, IRON, 11, 3, 2, 12); // barra
  px(ctx, IRON, 9, 3, 6, 1); // manillar
  px(ctx, brand, 11, 6, 2, 3);
}

function drawPoster(ctx: Ctx): void {
  px(ctx, '#e6d9c4', 3, 4, 10, 26);
  px(ctx, '#c0493f', 3, 4, 10, 9);
  px(ctx, '#f0b46a', 5, 7, 6, 4);
  px(ctx, '#2f4f8f', 4, 16, 8, 2);
  px(ctx, '#23262e', 4, 20, 6, 1);
  px(ctx, '#23262e', 4, 22, 8, 1);
  px(ctx, '#4f8a4a', 8, 25, 4, 3);
}

/** Mupi: marco oscuro y un cartel de colores. El cartel se enciende de noche. */
function drawAdPanel(ctx: Ctx): void {
  px(ctx, PALETTE.ink, 3, 33, 10, 3);
  px(ctx, '#23262e', 1, 2, 14, 31);
  px(ctx, shade('#23262e', 0.12), 1, 2, 14, 1);
  drawPoster(ctx);
}

/** Valla de obra: panel a rayas rojas y blancas sobre dos pies de hormigón. */
function drawBarrier(ctx: Ctx): void {
  const w = TILE * 2;
  px(ctx, '#8a8378', 2, 13, 6, 3);
  px(ctx, '#8a8378', w - 8, 13, 6, 3);
  px(ctx, IRON, 4, 3, 1, 10);
  px(ctx, IRON, w - 5, 3, 1, 10);
  for (let x = 1; x < w - 1; x++) px(ctx, Math.floor((x + 3) / 4) % 2 === 0 ? '#c0493f' : PALETTE.white, x, 4, 1, 5);
  px(ctx, PALETTE.ink, 1, 9, w - 2, 1);
}

/** Contenedor de escombros: amarillo, con cascotes asomando. */
function drawSkip(ctx: Ctx): void {
  const w = TILE * 2;
  const c = '#d9a82a';
  px(ctx, PALETTE.ink, 2, 18, w - 4, 2);
  px(ctx, c, 1, 7, w - 2, 11);
  px(ctx, shade(c, 0.12), 1, 7, w - 2, 1);
  px(ctx, shade(c, -0.18), 1, 15, w - 2, 3);
  // Cascotes: ladrillo, yeso, un tablón.
  px(ctx, PALETTE.brick, 5, 5, 5, 3);
  px(ctx, '#d8d2c4', 11, 4, 6, 4);
  px(ctx, PALETTE.wood, 18, 3, 9, 2);
  px(ctx, '#8a8378', 20, 5, 6, 3);
}

/** Basura del suelo, plana: un papel arrugado, colillas o un flyer pisado. */
function drawDebris(ctx: Ctx, v: number): void {
  if (v === 0) {
    px(ctx, '#e6e0d4', 5, 7, 4, 3);
    px(ctx, '#b3ad9f', 6, 8, 2, 1);
    px(ctx, '#e6e0d4', 11, 12, 2, 1);
  } else if (v === 1) {
    for (const [x, y] of [[4, 5], [9, 7], [6, 11], [12, 10]] as const) {
      px(ctx, '#e6e0d4', x, y, 2, 1);
      px(ctx, '#c98a3f', x + 2, y, 1, 1);
    }
  } else {
    px(ctx, '#ff6ab8', 4, 6, 6, 4);
    px(ctx, '#23262e', 5, 7, 4, 1);
    px(ctx, shade('#ff6ab8', -0.2), 4, 9, 6, 1);
  }
}

export function buildStreetTextures(scene: Phaser.Scene): void {
  for (let v = 0; v < BINS.length; v++) make(scene, `prop-container-${v}`, TILE, 20, (ctx) => drawContainer(ctx, v));
  make(scene, 'prop-mailbox', TILE, 22, drawMailbox);
  make(scene, 'prop-bollard', TILE, 14, drawBollard);
  make(scene, 'prop-parking-sign', TILE, 36, drawParkingSign);
  make(scene, 'prop-street-sign', TILE, 36, drawStreetSign);
  make(scene, 'prop-utility-box', TILE, 22, drawUtilityBox);
  for (let v = 0; v < 2; v++) make(scene, `prop-scooter-${v}`, TILE, 18, (ctx) => drawScooter(ctx, v));
  make(scene, 'prop-ad-panel', TILE, 36, drawAdPanel);
  make(scene, 'glow-ad-panel', TILE, 36, drawPoster);
  make(scene, 'prop-barrier', TILE * 2, TILE, drawBarrier);
  make(scene, 'prop-skip', TILE * 2, 20, drawSkip);
  for (let v = 0; v < 3; v++) make(scene, `prop-debris-${v}`, TILE, TILE, (ctx) => drawDebris(ctx, v));
}
