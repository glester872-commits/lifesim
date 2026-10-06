import type Phaser from 'phaser';
import { PALETTE } from '../config/constants';
import type { Belonging } from '../data/streetSurvival';
import { PASSENGER_LOOKS } from '../data/npcs';
import { colorsOf } from './HumanArt';
import { blob, make, px, shade } from './paint';

/**
 * Lo que lleva consigo quien vive en la calle (data/streetSurvival.ts) y cómo
 * se le ve dormir: todo a la escala del peatón (16 × 24), con el mismo contorno
 * y la luz arriba a la izquierda. Nada grotesco: una manta, unas bolsas, un
 * carro de la compra, un cartón. Lo pinta world/CrowdView a su lado.
 */

/** Mantas de colores de casa: cada uno la suya, por su id. */
const BLANKETS = ['#6b4f6e', '#5a6e4f', '#7a5a3c', '#3f5a7a', '#8a4a45'] as const;

export function belongingKey(b: Belonging): string {
  return `surv-${b}`;
}

/** Textura del que duerme tapado, con la cabeza de su aspecto y su manta. */
export function sleeperTexture(scene: Phaser.Scene, look: number, blanket: number): string {
  const key = `surv-sleeper-${look}-${blanket}`;
  make(scene, key, 26, 11, (ctx) => {
    const c = colorsOf(PASSENGER_LOOKS[look % PASSENGER_LOOKS.length]);
    const cover = BLANKETS[blanket % BLANKETS.length];
    // Sombra de contacto y el bulto bajo la manta, de lado: hombro, cadera y los pies al fondo.
    px(ctx, 'rgba(12,10,20,0.3)', 2, 9, 23, 2);
    blob(ctx, PALETTE.outline, 2, [[8, 9], [7, 15], [6, 18], [6, 19], [6, 19], [6, 19], [7, 18]]);
    blob(ctx, cover, 3, [[8, 7], [7, 14], [7, 17], [7, 17], [7, 17], [8, 16]]);
    px(ctx, shade(cover, 0.16), 8, 3, 6, 1);
    px(ctx, shade(cover, 0.1), 15, 4, 6, 1);
    px(ctx, shade(cover, -0.18), 7, 8, 17, 1);
    // Pliegue de la manta y el borde doblado bajo la barbilla.
    px(ctx, shade(cover, -0.12), 14, 5, 1, 3);
    px(ctx, shade(cover, 0.22), 7, 4, 1, 4);
    // La cabeza sobre la mochila que hace de almohada: pelo arriba, la cara de lado, ojos cerrados.
    px(ctx, PALETTE.outline, 0, 6, 6, 4);
    px(ctx, '#3a4f6e', 1, 7, 4, 2);
    px(ctx, PALETTE.outline, 1, 1, 7, 6);
    px(ctx, c.skin, 2, 3, 5, 3);
    px(ctx, c.hair, 2, 2, 5, 2);
    px(ctx, c.hair, 2, 3, 1, 2);
    px(ctx, shade(c.skin, -0.25), 5, 4, 1, 1);
  });
  return key;
}

/** Las cosas, una vez por partida. */
export function buildSurvivalTextures(scene: Phaser.Scene): void {
  // Manta doblada en rollo, atada con una cuerda.
  make(scene, belongingKey('blanket'), 12, 6, (ctx) => {
    px(ctx, PALETTE.outline, 0, 0, 12, 6);
    px(ctx, BLANKETS[0], 1, 1, 10, 4);
    px(ctx, shade(BLANKETS[0], 0.18), 1, 1, 10, 1);
    px(ctx, shade(BLANKETS[0], -0.2), 1, 4, 10, 1);
    px(ctx, '#c9b98f', 4, 1, 1, 4);
    px(ctx, '#c9b98f', 8, 1, 1, 4);
  });
  // Dos bolsas de plástico, una blanca y otra azul, con sus asas.
  make(scene, belongingKey('bags'), 11, 9, (ctx) => {
    px(ctx, PALETTE.outline, 0, 2, 6, 7);
    px(ctx, '#e6e2d8', 1, 3, 4, 5);
    px(ctx, shade('#e6e2d8', -0.15), 1, 6, 4, 2);
    px(ctx, PALETTE.outline, 1, 0, 1, 3);
    px(ctx, PALETTE.outline, 4, 0, 1, 3);
    px(ctx, PALETTE.outline, 5, 3, 6, 6);
    px(ctx, '#3f6f9a', 6, 4, 4, 4);
    px(ctx, shade('#3f6f9a', 0.2), 6, 4, 4, 1);
  });
  make(scene, belongingKey('backpack'), 8, 9, (ctx) => {
    px(ctx, PALETTE.outline, 0, 1, 8, 8);
    px(ctx, '#3a4f6e', 1, 2, 6, 6);
    px(ctx, shade('#3a4f6e', 0.18), 1, 2, 6, 1);
    px(ctx, shade('#3a4f6e', -0.25), 2, 5, 4, 2);
    px(ctx, PALETTE.outline, 3, 0, 2, 2);
  });
  // Cartón aplanado en el suelo: se sienta o duerme encima.
  make(scene, belongingKey('cardboard'), 20, 7, (ctx) => {
    px(ctx, shade('#a8834e', -0.3), 0, 0, 20, 7);
    px(ctx, '#a8834e', 1, 1, 18, 5);
    px(ctx, shade('#a8834e', 0.12), 1, 1, 18, 1);
    px(ctx, shade('#a8834e', -0.15), 9, 1, 1, 5);
    px(ctx, shade('#a8834e', -0.1), 3, 3, 4, 1);
  });
  // Carro de la compra con sus cosas dentro, de perfil: cesta de rejilla, asa y dos ruedas.
  make(scene, belongingKey('cart'), 15, 14, (ctx) => {
    const wire = shade(PALETTE.metal, 0.35);
    px(ctx, '#e6e2d8', 3, 2, 9, 4);
    px(ctx, '#3f6f9a', 6, 1, 4, 3);
    px(ctx, BLANKETS[2], 3, 3, 3, 3);
    px(ctx, PALETTE.outline, 2, 4, 11, 1);
    for (let x = 2; x <= 12; x += 2) px(ctx, wire, x, 4, 1, 6);
    px(ctx, wire, 2, 9, 11, 1);
    px(ctx, wire, 2, 6, 11, 1);
    px(ctx, wire, 12, 1, 1, 4);
    px(ctx, wire, 12, 1, 3, 1);
    px(ctx, wire, 3, 10, 1, 2);
    px(ctx, wire, 11, 10, 1, 2);
    px(ctx, PALETTE.ink, 2, 12, 3, 2);
    px(ctx, PALETTE.ink, 10, 12, 3, 2);
  });
  // Vaso de papel para las monedas.
  make(scene, belongingKey('cup'), 4, 5, (ctx) => {
    px(ctx, PALETTE.outline, 0, 0, 4, 5);
    px(ctx, '#e6e2d8', 1, 1, 2, 3);
    px(ctx, '#c9a13a', 1, 1, 2, 1);
  });
}

/** Su manta, siempre la misma: sale de su id. */
export function blanketOf(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % BLANKETS.length;
}
