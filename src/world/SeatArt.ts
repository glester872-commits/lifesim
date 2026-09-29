import type Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import { make, px, shade, type Ctx } from './paint';

/**
 * Asientos (data/seating.ts): sillas por orientación, taburete y el banco que
 * mira al norte. Van dibujados para la pose de sentado de world/HumanArt (la
 * 4): el asiento cae justo bajo la cadera de quien se sienta (fila 16–18 de su
 * celda) y las patas llegan al suelo; así nadie flota ni se hunde.
 *
 * Lo que queda por delante de quien se sienta de espaldas (el respaldo de una
 * silla vista desde detrás) es otra textura, `-front`, que se pinta encima de la
 * persona (PropDef.front).
 */

const WOOD = PALETTE.wood;
const WOOD_LIT = PALETTE.woodLit;
const WOOD_DARK = PALETTE.woodDark;

/** Silla de frente (quien se sienta mira al sur): respaldo detrás, asiento y patas. 1x2. */
function drawChairDown(ctx: Ctx): void {
  // Respaldo: dos largueros y el travesaño de arriba, asomando por los lados de la espalda.
  px(ctx, WOOD_DARK, 3, 11, 2, 13);
  px(ctx, WOOD_DARK, 11, 11, 2, 13);
  px(ctx, WOOD, 3, 11, 10, 3);
  px(ctx, WOOD_LIT, 3, 11, 10, 1);
  // Asiento a la altura de la cadera y patas.
  seat(ctx, 23);
  legs(ctx, 27);
}

/** Silla de espaldas (quien se sienta mira al norte): asiento y patas; el respaldo es la capa de delante. 1x1. */
function drawChairUp(ctx: Ctx): void {
  seat(ctx, 7);
  legs(ctx, 11);
}

/** El respaldo que tapa la parte baja de la espalda de quien se sienta mirando al norte. */
function drawChairUpFront(ctx: Ctx): void {
  px(ctx, WOOD, 3, 4, 10, 4);
  px(ctx, WOOD_LIT, 3, 4, 10, 1);
  px(ctx, WOOD_DARK, 3, 7, 10, 1);
  px(ctx, WOOD_DARK, 3, 8, 2, 3);
  px(ctx, WOOD_DARK, 11, 8, 2, 3);
}

/**
 * Silla de perfil (quien se sienta mira al este): el asiento bajo el muslo y el
 * respaldo al oeste, detrás de la espalda. Mirando al oeste es la misma en espejo. 1x2.
 */
function drawChairSide(ctx: Ctx, left: boolean): void {
  if (left) {
    ctx.save();
    ctx.translate(TILE, 0);
    ctx.scale(-1, 1);
  }
  px(ctx, WOOD_DARK, 2, 17, 2, 14);
  px(ctx, WOOD, 3, 17, 1, 10);
  px(ctx, WOOD_LIT, 2, 17, 2, 1);
  px(ctx, WOOD, 3, 26, 9, 2);
  px(ctx, WOOD_LIT, 3, 26, 9, 1);
  px(ctx, WOOD_DARK, 3, 28, 9, 1);
  px(ctx, WOOD_DARK, 10, 29, 2, 2);
  px(ctx, WOOD_DARK, 3, 29, 1, 2);
  if (left) ctx.restore();
}

/** Tablero del asiento: canto con luz arriba y sombra abajo, de lado a lado de la cadera. */
function seat(ctx: Ctx, y: number): void {
  px(ctx, WOOD, 2, y, 12, 3);
  px(ctx, WOOD_LIT, 2, y, 12, 1);
  px(ctx, WOOD_DARK, 2, y + 3, 12, 1);
}

/** Cuatro patas vistas desde arriba y un poco de frente: las de delante, más largas. */
function legs(ctx: Ctx, y: number): void {
  px(ctx, WOOD_DARK, 2, y, 2, 4);
  px(ctx, WOOD_DARK, 12, y, 2, 4);
  px(ctx, shade(WOOD_DARK, -0.1), 4, y, 1, 2);
  px(ctx, shade(WOOD_DARK, -0.1), 11, y, 1, 2);
}

/**
 * Taburete alto de barra: asiento redondo, pie cromado y aro para los pies a la
 * altura de los zapatos de quien se sienta (data/seating.ts: lift 4).
 */
function drawStool(ctx: Ctx): void {
  const chrome = shade(PALETTE.metal, 0.3);
  px(ctx, PALETTE.ink, 4, 13, 8, 2);
  px(ctx, chrome, 5, 13, 6, 1);
  px(ctx, chrome, 7, 5, 2, 8);
  px(ctx, chrome, 4, 10, 8, 1);
  px(ctx, shade(chrome, -0.2), 4, 11, 8, 1);
  px(ctx, '#6e2f2c', 4, 2, 8, 3);
  px(ctx, '#8a4440', 4, 2, 8, 1);
  px(ctx, '#4f2220', 5, 5, 6, 1);
}

/** Banco que mira al norte: el asiento y las patas; el respaldo va en su capa de delante. */
function drawBenchUp(ctx: Ctx): void {
  px(ctx, PALETTE.metal, 2, 10, 2, 5);
  px(ctx, PALETTE.metal, 12, 10, 2, 5);
  px(ctx, WOOD, 0, 7, TILE, 3);
  px(ctx, WOOD_LIT, 0, 7, TILE, 1);
  px(ctx, WOOD_DARK, 0, 9, TILE, 1);
}

/** Su respaldo, al sur: dos listones sobre la espalda de quien se sienta, con los soportes de fundición. */
function drawBenchUpFront(ctx: Ctx): void {
  px(ctx, WOOD, 0, 4, TILE, 2);
  px(ctx, WOOD_LIT, 0, 4, TILE, 1);
  px(ctx, WOOD, 0, 7, TILE, 1);
  px(ctx, PALETTE.metal, 2, 4, 2, 6);
  px(ctx, PALETTE.metal, 12, 4, 2, 6);
}

/** El cigarro en la mano: papel blanco y la brasa. */
function drawCigarette(ctx: Ctx): void {
  px(ctx, PALETTE.white, 0, 0, 3, 1);
  px(ctx, '#e0703a', 3, 0, 1, 1);
}

/** Una bocanada de humo que sube: tres volutas grises, más claras arriba. */
function drawSmoke(ctx: Ctx): void {
  ctx.globalAlpha = 0.55;
  px(ctx, '#c9c6c0', 2, 5, 3, 2);
  px(ctx, '#d8d5cf', 1, 3, 2, 2);
  px(ctx, '#e6e3de', 3, 0, 2, 2);
  ctx.globalAlpha = 1;
}

export function buildSeatTextures(scene: Phaser.Scene): void {
  make(scene, 'fx-cigarette', 4, 1, drawCigarette);
  make(scene, 'fx-smoke', 6, 7, drawSmoke);
  make(scene, 'prop-chair-down', TILE, TILE * 2, drawChairDown);
  make(scene, 'prop-chair-up', TILE, TILE, drawChairUp);
  make(scene, 'prop-chair-up-front', TILE, TILE, drawChairUpFront);
  make(scene, 'prop-chair-right', TILE, TILE * 2, (ctx) => drawChairSide(ctx, false));
  make(scene, 'prop-chair-left', TILE, TILE * 2, (ctx) => drawChairSide(ctx, true));
  make(scene, 'prop-stool', TILE, TILE, drawStool);
  make(scene, 'prop-bench-up', TILE, TILE, drawBenchUp);
  make(scene, 'prop-bench-up-front', TILE, TILE, drawBenchUpFront);
}
