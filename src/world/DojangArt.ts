import type Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import { make, px, shade, type Ctx } from './paint';

/**
 * La Escuela de Taekwondo Vallesco (data/academyRooms.ts): el tatami de placas, los paos de pie a los que se patea y el
 * rótulo de la sala. Todo por código, como el resto: el pao tiene dos dibujos, quieto y encajando el golpe (se ve
 * moverse cuando una patada llega de verdad: scenes/WorldScene, systems/Taekwondo).
 */

const RED = '#b8323a';
const BLUE = '#2f5f9e';
/** Las placas de goma del tatami, en damero: azul y rojo apagados, como las de un dojang de barrio. */
const MAT_A = '#3f6488';
const MAT_B = '#8a3a3f';

function tatami(ctx: Ctx, variant: number): void {
  const base = variant === 0 ? MAT_A : MAT_B;
  px(ctx, base, 0, 0, TILE, TILE);
  px(ctx, shade(base, 0.08), 0, 0, TILE, 1);
  px(ctx, shade(base, 0.08), 0, 0, 1, TILE);
  // La junta en puzle de las placas: dientes en los bordes.
  for (const t of [3, 9]) {
    px(ctx, shade(base, -0.22), t, TILE - 1, 3, 1);
    px(ctx, shade(base, -0.22), TILE - 1, t, 1, 3);
  }
  px(ctx, shade(base, -0.14), TILE - 1, 0, 1, TILE);
  px(ctx, shade(base, -0.14), 0, TILE - 1, TILE, 1);
}

/** El pao de pie: base redonda, mástil y el escudo de goma a la altura de la cintura, con la diana del centro. */
function pad(ctx: Ctx, hit: boolean): void {
  const lean = hit ? 1 : 0;
  px(ctx, '#1f232b', 3, 28, 10, 3);
  px(ctx, '#3a3f4a', 4, 27, 8, 2);
  px(ctx, PALETTE.metal, 7, 14, 2, 14);
  px(ctx, '#1f232b', 3 + lean, 3, 10, 13);
  px(ctx, RED, 4 + lean, 4, 8, 11);
  px(ctx, shade(RED, 0.2), 4 + lean, 4, 2, 10);
  px(ctx, shade(RED, -0.3), 11 + lean, 5, 1, 10);
  px(ctx, '#eee1cc', 6 + lean, 8, 4, 3);
  px(ctx, BLUE, 7 + lean, 9, 2, 1);
  if (hit) {
    // Encaja el golpe: se va un píxel hacia atrás y salta el polvo de la goma.
    for (const [x, y] of [[1, 5], [0, 9], [1, 12]] as const) px(ctx, '#f4efe2', x, y, 1, 1);
  }
}

/** Rótulo de la sala: el taegeuk (rojo y azul) y la escala de cinturones, sin letras. */
function sign(ctx: Ctx): void {
  px(ctx, '#1d2430', 0, 0, 64, 16);
  px(ctx, RED, 0, 14, 64, 2);
  px(ctx, '#f0e9da', 4, 3, 10, 10);
  px(ctx, RED, 5, 4, 8, 4);
  px(ctx, BLUE, 5, 8, 8, 4);
  px(ctx, RED, 9, 8, 3, 1);
  px(ctx, BLUE, 6, 7, 3, 1);
  ['#f2efe6', '#e8c33a', '#3f8f4a', BLUE, RED, '#141414'].forEach((c, i) => px(ctx, c, 20 + i * 7, 6, 6, 4));
}

export function buildDojangTextures(scene: Phaser.Scene): void {
  for (const v of [0, 1]) make(scene, `tile-tatami-${v}`, TILE, TILE, (c) => tatami(c, v));
  make(scene, 'prop-kick-pad', TILE, TILE * 2, (c) => pad(c, false));
  make(scene, 'prop-kick-pad-hit', TILE, TILE * 2, (c) => pad(c, true));
  make(scene, 'prop-dojang-sign', 64, 16, sign);
}
