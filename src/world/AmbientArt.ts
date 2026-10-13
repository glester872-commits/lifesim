import type Phaser from 'phaser';
import { PALETTE } from '../config/constants';
import { make, px, shade, type Ctx } from './paint';

/**
 * Lo que se lleva en la mano en los gestos de ambiente (data/ambientActions.ts):
 * el cigarro, el vaso para llevar y las bolsas de la compra, más la voluta de
 * humo de world/SmokeFx. La taza de la mesa, el plato, el libro y el móvil son
 * los de siempre (world/TextureFactory).
 */

function drawCigarette(ctx: Ctx): void {
  px(ctx, PALETTE.white, 0, 0, 3, 1);
  px(ctx, '#e0703a', 3, 0, 1, 1);
}

/** Vaso de cartón con tapa y faja: café para llevar o una bebida. */
function drawMug(ctx: Ctx): void {
  px(ctx, PALETTE.ink, 0, 0, 3, 1);
  px(ctx, PALETTE.white, 0, 1, 3, 3);
  px(ctx, PALETTE.woodDark, 0, 2, 3, 1);
  px(ctx, shade(PALETTE.white, -0.15), 2, 1, 1, 3);
}

/** Dos bolsas de papel con asa, una delante de otra. */
function drawBags(ctx: Ctx): void {
  const paper = '#c9a26b';
  px(ctx, shade(paper, -0.2), 0, 0, 1, 2);
  px(ctx, shade(paper, -0.2), 3, 0, 1, 2);
  px(ctx, paper, 0, 2, 4, 4);
  px(ctx, shade(paper, -0.12), 3, 2, 1, 4);
  px(ctx, '#8e4a50', 3, 3, 3, 3);
  px(ctx, shade('#8e4a50', -0.2), 5, 3, 1, 3);
}

/** Maleta de cabina con el asa extendida: la de quien llega o se va del hotel. */
function drawSuitcase(ctx: Ctx): void {
  const shell = '#3a3f48';
  px(ctx, PALETTE.ink, 2, 0, 1, 4);
  px(ctx, PALETTE.ink, 2, 0, 3, 1);
  px(ctx, shell, 0, 4, 6, 6);
  px(ctx, shade(shell, 0.2), 0, 4, 6, 1);
  px(ctx, shade(shell, -0.2), 5, 5, 1, 5);
  px(ctx, PALETTE.ink, 0, 10, 1, 1);
  px(ctx, PALETTE.ink, 5, 10, 1, 1);
}

/** El plano de turista, desplegado: papel claro con las calles, el verde de un parque y el punto rojo de «estás aquí». */
function drawMap(ctx: Ctx): void {
  px(ctx, PALETTE.ink, 0, 0, 9, 6);
  px(ctx, '#efe8d6', 1, 0, 7, 5);
  px(ctx, shade('#efe8d6', -0.15), 4, 0, 1, 5);
  px(ctx, '#c9b98f', 1, 2, 7, 1);
  px(ctx, '#c9b98f', 2, 0, 1, 5);
  px(ctx, '#8fb07a', 6, 3, 2, 2);
  px(ctx, '#c0443a', 3, 1, 1, 1);
}

/** Voluta de humo: un círculo de píxeles, blanco (world/SmokeFx lo tiñe y lo desvanece). */
function drawPuff(ctx: Ctx): void {
  px(ctx, '#ffffff', 1, 0, 2, 4);
  px(ctx, '#ffffff', 0, 1, 4, 2);
}

export function buildAmbientTextures(scene: Phaser.Scene): void {
  make(scene, 'fx-cigarette', 4, 1, drawCigarette);
  make(scene, 'fx-mug', 3, 4, drawMug);
  make(scene, 'fx-bags', 6, 6, drawBags);
  make(scene, 'fx-suitcase', 6, 11, drawSuitcase);
  make(scene, 'fx-map', 9, 6, drawMap);
  make(scene, 'fx-puff', 4, 4, drawPuff);
}
