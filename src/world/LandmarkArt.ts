import type Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants.ts';
import { colosseumGround, colosseumWalls, COLOSSEUM_DEPTH } from './ColosseumArt.ts';
import type { LandmarkDef } from '../types/game.ts';
import type { GlowSpot } from './BuildingArt.ts';
import { contact, LAYER, standing } from './Layers.ts';
import { make, px, shade, type Ctx } from './paint.ts';

const STONE = PALETTE.wall;
const CAP = shade(PALETTE.wallLit, 0.08);
const MASONRY = shade(PALETTE.brickLit, -0.04);
const SHAFT = shade(MASONRY, -0.09);
const DARK = shade(PALETTE.woodDark, -0.14);
const GROUND = shade(PALETTE.stone, -0.13);

function triumphalArch(ctx: Ctx, width: number, height: number): void {
  const foot = height - 8;
  px(ctx, shade(GROUND, -0.05), 3, foot - 3, width - 3, 7);
  px(ctx, shade(STONE, -0.18), 3, foot - 40, width - 6, 40);
  px(ctx, STONE, 4, foot - 40, width - 12, 36);
  px(ctx, shade(STONE, 0.037), 4, foot - 34, width - 12, 29);
  px(ctx, shade(STONE, -0.072), width - 13, foot - 40, 7, 36);
  for (let row = 7; row < 37; row += 4) {
    px(ctx, shade(STONE, -0.1), 5, foot - row, width - 13, 1);
    for (let seam = 9 + row % 7; seam < width - 15; seam += 11) {
      px(ctx, shade(STONE, -0.078), seam, foot - row, 1, 3);
    }
  }
  for (const [center, radius, rise] of [[22, 6, 19], [46, 11, 28], [71, 6, 19]]) {
    const curve = radius * 0.73;
    for (let row = 0; row < rise; row++) {
      const t = Math.max(0, (row + 0.5 - (rise - curve)) / curve);
      const size = Math.max(1, Math.round(radius * Math.sqrt(1 - t * t)));
      const y = foot - row - 1;
      px(ctx, row % 3 ? CAP : STONE, center - size - 2, y, size * 2 + 4, 1);
      px(ctx, DARK, center - size, y, size * 2, 1);
      px(ctx, row < 3 ? shade(GROUND, -0.22) : PALETTE.wallDark, center - size, y, Math.min(2, size), 1);
    }
  }
  for (const x of [10, 33, 59, 82]) {
    px(ctx, shade(STONE, -0.14), x - 2, foot - 35, 7, 33);
    px(ctx, CAP, x - 2, foot - 36, 7, 3);
    px(ctx, PALETTE.wallLit, x, foot - 33, 3, 28);
    px(ctx, CAP, x, foot - 31, 1, 24);
    px(ctx, STONE, x - 2, foot - 7, 8, 5);
    px(ctx, CAP, x - 2, foot - 7, 7, 1);
  }
  px(ctx, shade(STONE, -0.14), 2, foot - 39, width - 5, 4);
  px(ctx, CAP, 1, foot - 40, width - 2, 2);
  px(ctx, shade(STONE, -0.08), 5, foot - 52, width - 11, 12);
  px(ctx, STONE, 7, foot - 52, width - 18, 11);
  px(ctx, CAP, 3, foot - 54, width - 7, 2);
  px(ctx, shade(STONE, 0.09), 31, foot - 50, 29, 7);
  for (let row = 0; row < 3; row++) {
    px(ctx, shade(STONE, -0.12), 35 + row % 2, foot - 49 + row * 2, 19 - row, 1);
  }
  for (const x of [13, 23, 65, 76]) {
    px(ctx, shade(STONE, -0.13), x, foot - 49, 6, 6);
    px(ctx, shade(STONE, 0.06), x + 2, foot - 49, 2, 4);
  }
}

function temple(ctx: Ctx, width: number, height: number): void {
  const foot = height - 11;
  px(ctx, GROUND, 0, foot - 37, width, 38);
  px(ctx, PALETTE.wallDark, 2, foot - 39, width - 4, 35);
  for (let row = 10; row < 39; row += 5) {
    px(ctx, shade(PALETTE.wallDark, -0.12), 3, foot - row, width - 6, 1);
    for (let seam = 5 + row % 3 * 5; seam < width - 6; seam += 17) {
      px(ctx, shade(PALETTE.wallDark, -0.08), seam, foot - row, 1, 4);
    }
  }
  px(ctx, CAP, 2, foot - 8, width - 4, 2);
  px(ctx, STONE, 2, foot - 6, width - 4, 3);
  px(ctx, CAP, 0, foot - 3, width, 2);
  px(ctx, SHAFT, 12, foot - 49, 53, 31);
  px(ctx, MASONRY, 13, foot - 53, 51, 27);
  for (let row = 0; row < 22; row++) {
    const half = Math.min(17, 7 + row * 2);
    px(ctx, shade(MASONRY, row < 7 ? 0.04 : -0.08), 37 - half - 2, foot - 51 + row, (half + 2) * 2, 1);
    px(ctx, shade(SHAFT, row < 7 ? -0.07 : 0.03), 37 - half, foot - 51 + row, half * 2, 1);
  }
  for (let row = 1; row < 23; row += 3) px(ctx, shade(MASONRY, -0.125), 15, foot - 52 + row, 9, 1);
  for (const x of [11, 29, 46, 64, 98, 116]) {
    const tall = x % 3 !== 1;
    px(ctx, STONE, x, foot - (tall ? 28 : 16), 5, tall ? 19 : 7);
    px(ctx, PALETTE.wallDark, x + 4, foot - (tall ? 25 : 15), 2, tall ? 17 : 6);
    px(ctx, CAP, x, foot - (tall ? 29 : 17), 3, tall ? 20 : 8);
    px(ctx, CAP, x - 2, foot - 10, 9, 2);
    if (tall) {
      px(ctx, PALETTE.wallLit, x - 1, foot - 31, 7, 3);
      px(ctx, CAP, x - 1, foot - 32, 6, 1);
    }
  }
}

export function addLandmarks(scene: Phaser.Scene, landmarks: readonly LandmarkDef[], glows: GlowSpot[]): void {
  for (const { kind, tx, ty, w, h } of landmarks) {
    const x = tx * TILE;
    const y = ty * TILE;
    const width = w * TILE;
    const height = h * TILE;
    const key = `landmark-${kind}-${w}x${h}`;
    const layer = (name: string, depth: number, draw: (ctx: Ctx) => void): void => {
      make(scene, name, width, height, draw);
      scene.add.image(x, y, name).setOrigin(0, 0).setDepth(depth);
    };
    if (kind === 'colosseum') {
      layer(`${key}-arena`, LAYER.decal + 1, colosseumGround);
      layer(`${key}-north`, standing(y + COLOSSEUM_DEPTH.north), (ctx) => colosseumWalls(ctx, 'north'));
      layer(`${key}-south`, standing(y + COLOSSEUM_DEPTH.south), (ctx) => colosseumWalls(ctx, 'south'));
      const glow = `${key}-night`;
      make(scene, glow, width, height, (ctx) => {
        colosseumWalls(ctx, 'north', true);
        colosseumWalls(ctx, 'south', true);
      });
      glows.push({ key: glow, x, y, cast: false });
    } else {
      const draw = kind === 'triumphal-arch' ? triumphalArch : temple;
      layer(key, contact(y + (kind === 'triumphal-arch' ? height - 8 : height - 11)), (ctx) => draw(ctx, width, height));
    }
  }
}
