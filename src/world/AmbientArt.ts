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

/** Voluta de humo: un círculo de píxeles, blanco (world/SmokeFx lo tiñe y lo desvanece). */
function drawPuff(ctx: Ctx): void {
  px(ctx, '#ffffff', 1, 0, 2, 4);
  px(ctx, '#ffffff', 0, 1, 4, 2);
}

export function buildAmbientTextures(scene: Phaser.Scene): void {
  make(scene, 'fx-cigarette', 4, 1, drawCigarette);
  make(scene, 'fx-mug', 3, 4, drawMug);
  make(scene, 'fx-bags', 6, 6, drawBags);
  make(scene, 'fx-puff', 4, 4, drawPuff);
}
