import type Phaser from 'phaser';
import { PALETTE } from '../config/constants';
import type { ActProp } from '../data/streetActs';
import { make, px, shade } from './paint';

/**
 * Lo que lleva quien vende o actúa en la calle (data/streetActs.ts), a la escala del peatón y con la luz arriba a la
 * izquierda: la manta en el suelo con su género (o vacía, montando y recogiendo), el hatillo a la espalda, la bandeja,
 * la guitarra y su funda abierta, el altavoz y la peana de la estatua. Lo pinta world/CrowdView.
 */

/** La manta extendida, sin nada encima (montando o recogiendo) y hecha un hatillo (de camino). */
export type ActExtra = 'cloth' | 'bundle';

export function actKey(p: ActProp | ActExtra): string {
  return `act-${p}`;
}

const CLOTH = '#3a4a6e';

/** La manta: tela con el borde más oscuro, 20 × 10, extendida en el suelo. */
function cloth(ctx: CanvasRenderingContext2D): void {
  px(ctx, shade(CLOTH, -0.3), 0, 1, 20, 9);
  px(ctx, CLOTH, 1, 1, 18, 8);
  px(ctx, shade(CLOTH, 0.15), 1, 1, 18, 1);
  px(ctx, shade(CLOTH, -0.12), 1, 8, 18, 1);
}

/** Una vez por partida. */
export function buildActTextures(scene: Phaser.Scene): void {
  make(scene, actKey('cloth'), 20, 10, cloth);
  // Bisutería: pulseras de colores en fila, collares y unas gafas de sol.
  make(scene, actKey('blanket-trinkets'), 20, 10, (ctx) => {
    cloth(ctx);
    const beads = ['#e8c25a', '#c0443a', '#8fb07a', '#efe8d6', '#6fa8c8'];
    for (let i = 0; i < 5; i++) {
      px(ctx, beads[i], 2 + i * 3, 3, 2, 1);
      px(ctx, beads[(i + 2) % 5], 2 + i * 3, 6, 2, 1);
    }
    px(ctx, PALETTE.ink, 15, 4, 4, 1);
    px(ctx, PALETTE.ink, 15, 5, 1, 1);
    px(ctx, PALETTE.ink, 18, 5, 1, 1);
  });
  // Ropa: camisetas dobladas en montones y dos gorras.
  make(scene, actKey('blanket-clothes'), 20, 10, (ctx) => {
    cloth(ctx);
    const tees = ['#f2efe8', '#c0443a', '#2a3550', '#e8c25a'];
    tees.forEach((c, i) => {
      px(ctx, c, 2 + i * 4, 2, 3, 3);
      px(ctx, shade(c, -0.18), 2 + i * 4, 4, 3, 1);
    });
    px(ctx, '#232329', 3, 6, 4, 2);
    px(ctx, '#232329', 7, 7, 2, 1);
    px(ctx, '#3f6f9a', 11, 6, 4, 2);
    px(ctx, '#3f6f9a', 15, 7, 2, 1);
  });
  // Recuerdos: abanicos abiertos, imanes y llaveros.
  make(scene, actKey('blanket-souvenirs'), 20, 10, (ctx) => {
    cloth(ctx);
    px(ctx, '#c0443a', 2, 3, 4, 2);
    px(ctx, '#e8c25a', 3, 2, 2, 1);
    px(ctx, '#e8c25a', 7, 3, 4, 2);
    px(ctx, '#c0443a', 8, 2, 2, 1);
    const magnets = ['#f2efe8', '#6fa8c8', '#8fb07a', '#e8c25a', '#c9a45a', '#efe8d6'];
    magnets.forEach((c, i) => px(ctx, c, 12 + (i % 3) * 2, 3 + Math.floor(i / 3) * 2, 1, 1));
    px(ctx, PALETTE.metalLit, 3, 6, 1, 2);
    px(ctx, PALETTE.metalLit, 6, 6, 1, 2);
    px(ctx, '#c9a45a', 3, 7, 1, 1);
    px(ctx, '#c9a45a', 6, 7, 1, 1);
  });
  // El hatillo: la manta atada por las cuatro puntas, con el género dentro.
  make(scene, actKey('bundle'), 10, 9, (ctx) => {
    px(ctx, PALETTE.outline, 0, 2, 10, 7);
    px(ctx, CLOTH, 1, 3, 8, 5);
    px(ctx, shade(CLOTH, 0.18), 1, 3, 8, 1);
    px(ctx, shade(CLOTH, -0.15), 2, 6, 6, 1);
    px(ctx, CLOTH, 3, 0, 4, 3);
    px(ctx, PALETTE.outline, 4, 1, 2, 1);
  });
  // La bandeja colgada del cuello: gafas de sol y abanicos.
  make(scene, actKey('tray'), 12, 6, (ctx) => {
    px(ctx, PALETTE.outline, 0, 1, 12, 5);
    px(ctx, PALETTE.wood, 1, 2, 10, 3);
    px(ctx, PALETTE.woodLit, 1, 2, 10, 1);
    px(ctx, PALETTE.ink, 2, 3, 3, 1);
    px(ctx, PALETTE.ink, 6, 3, 3, 1);
    px(ctx, '#c0443a', 9, 2, 2, 2);
    px(ctx, PALETTE.outline, 1, 0, 1, 1);
    px(ctx, PALETTE.outline, 10, 0, 1, 1);
  });
  // La guitarra, en diagonal: caja, boca, mástil y clavijero.
  make(scene, actKey('guitar'), 8, 15, (ctx) => {
    const wood = '#b8782e';
    px(ctx, PALETTE.outline, 0, 7, 7, 8);
    px(ctx, wood, 1, 8, 5, 6);
    px(ctx, shade(wood, 0.2), 1, 8, 5, 1);
    px(ctx, PALETTE.ink, 3, 10, 2, 2);
    px(ctx, '#5a3a20', 4, 1, 2, 7);
    px(ctx, PALETTE.ink, 5, 0, 3, 2);
  });
  // La funda abierta delante, con las monedas.
  make(scene, actKey('case'), 14, 6, (ctx) => {
    px(ctx, PALETTE.outline, 0, 0, 14, 6);
    px(ctx, '#7a2a3a', 1, 1, 12, 4);
    px(ctx, shade('#7a2a3a', -0.2), 1, 4, 12, 1);
    px(ctx, '#e8c25a', 4, 2, 1, 1);
    px(ctx, PALETTE.metalLit, 7, 3, 1, 1);
    px(ctx, '#e8c25a', 9, 2, 1, 1);
  });
  // El altavoz de quien baila, en el suelo.
  make(scene, actKey('speaker'), 8, 11, (ctx) => {
    px(ctx, PALETTE.outline, 0, 0, 8, 11);
    px(ctx, '#2b2d33', 1, 1, 6, 9);
    px(ctx, PALETTE.ink, 2, 5, 4, 4);
    px(ctx, PALETTE.metal, 3, 6, 2, 2);
    px(ctx, PALETTE.metal, 3, 2, 2, 2);
    px(ctx, '#6fd0c8', 1, 1, 1, 1);
  });
  // La peana de la estatua: una caja pintada de piedra, con la gorra para las monedas delante.
  make(scene, actKey('pedestal'), 16, 9, (ctx) => {
    px(ctx, PALETTE.outline, 1, 0, 14, 8);
    px(ctx, PALETTE.stone, 2, 1, 12, 6);
    px(ctx, PALETTE.stoneLit, 2, 1, 12, 1);
    px(ctx, shade(PALETTE.stone, -0.15), 11, 2, 3, 5);
    px(ctx, PALETTE.outline, 0, 7, 5, 2);
    px(ctx, '#3a4f6e', 1, 7, 3, 1);
  });
}
