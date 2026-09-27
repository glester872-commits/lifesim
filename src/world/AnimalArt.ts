import type Phaser from 'phaser';
import { PALETTE } from '../config/constants';
import { DOG_LOOKS } from '../data/wildlife';
import { shade } from './paint';

/**
 * Perros y palomas, dibujados a mano píxel a píxel: cada pose es una rejilla
 * de caracteres y cada carácter un color de la paleta del animal. Mirando a
 * la derecha; a la izquierda, en espejo. Todo en una textura ('animals'), con
 * un frame por animal, pelaje y pose.
 */

type Grid = readonly string[];

// ------------------------------------------------------------------ perro
// b cuerpo · d cuerpo en sombra · o ojo · n trufa · e oreja · t cola · c collar · p pata · s mancha

const DOG: Readonly<Record<string, Grid>> = {
  stand: [
    '..........ee..',
    '.........bbbb.',
    '.........bobbn',
    't.......cbbbb.',
    'tbbbbbbbbbbb..',
    '.bbbsbbbbbbb..',
    '.dbbbbbbbbbd..',
    '..d.b....d.b..',
    '..d.b....d.b..',
    '..p.p....p.p..',
  ],
  walk1: [
    '..........ee..',
    '.........bbbb.',
    '.........bobbn',
    't.......cbbbb.',
    'tbbbbbbbbbbb..',
    '.bbbsbbbbbbb..',
    '.dbbbbbbbbbd..',
    '..db.....db...',
    '.d...b..d...b.',
    '.p....p.p....p',
  ],
  walk2: [
    '..........ee..',
    '.........bbbb.',
    't........bobbn',
    't.......cbbbb.',
    '.bbbbbbbbbbb..',
    '.bbbsbbbbbbb..',
    '.dbbbbbbbbbd..',
    '...bd.....bd..',
    '...b.d....b.d.',
    '...p.p....p.p.',
  ],
  sniff: [
    '..............',
    '..............',
    't.............',
    't.............',
    '.bbbbbbbbbee..',
    '.bbbsbbbbcbbb.',
    '.dbbbbbbbbbobn',
    '..d.b....d.b..',
    '..d.b....d.b..',
    '..p.p....p.p..',
  ],
  sit: [
    '..............',
    '.........ee...',
    '........bbbb..',
    '........bobbn.',
    '........cbbb..',
    '......bbbbb...',
    '.....bbsbbb...',
    '...tbbbbbdb...',
    '..t.dbbbbdb...',
    '....pppp.pp...',
  ],
};

/** [cuerpo, oreja, mancha]: marrón, negro, crema y blanco con manchas. */
const COATS: readonly (readonly [string, string, string | null])[] = [
  ['#8a5a36', '#5e3a22', null],
  ['#2e2a2c', '#1a1719', null],
  ['#d8c49a', '#a88a5e', null],
  ['#e6e0d4', '#3a3230', '#3a3230'],
];

// ----------------------------------------------------------------- paloma
// b cuerpo · w ala · k cabeza · g cuello tornasol · y ojo · l pico · f patas · t cola

const PIGEON: Readonly<Record<string, Grid>> = {
  stand: [
    '.....kk..',
    '....kykl.',
    '..bbgg...',
    'tbbwwbb..',
    'tbwwwbb..',
    '..bbbb...',
    '...f.f...',
  ],
  peck: [
    '.........',
    '.........',
    '..bbb....',
    'tbbwwbkk.',
    'tbwwwbgky',
    '..bbbb.l.',
    '...f.f...',
  ],
  walk1: [
    '.....kk..',
    '....kykl.',
    '..bbgg...',
    'tbbwwbb..',
    'tbwwwbb..',
    '..bbbb...',
    '..f...f..',
  ],
  walk2: [
    '......kk.',
    '.....kykl',
    '..bbbgg..',
    'tbbwwbb..',
    'tbwwwbb..',
    '..bbbb...',
    '....ff...',
  ],
  fly1: [
    '.ww..ww..',
    '..wwww...',
    '..bbbgkk.',
    'tbbbbbkyl',
    '..bbbb...',
    '.........',
    '.........',
  ],
  fly2: [
    '.........',
    '.........',
    '..bbbgkk.',
    'tbbbbbkyl',
    'wwbbbbww.',
    '.ww..ww..',
    '.........',
  ],
};

/** [cuerpo, ala, cabeza]: gris de siempre, oscura, casi blanca. */
const PLUMES: readonly (readonly [string, string, string])[] = [
  ['#8e939e', '#646b78', '#565d6b'],
  ['#5c606b', '#43474f', '#3b3f47'],
  ['#d4cfc5', '#aaa59b', '#b8b3a9'],
];

const DOG_FRAMES = Object.keys(DOG);
const PIGEON_FRAMES = Object.keys(PIGEON);
const DOG_W = 14;
const DOG_H = 10;
const PIGEON_W = 9;
const PIGEON_H = 7;

export const dogFrame = (look: number, pose: string): string => `dog-${look}-${pose}`;
export const pigeonFrame = (look: number, pose: string): string => `pigeon-${look}-${pose}`;

function paint(ctx: CanvasRenderingContext2D, grid: Grid, colors: Readonly<Record<string, string>>, ox: number, oy: number): void {
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = colors[row[x]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  });
}

export function buildAnimalTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('animals')) return;
  const w = Math.max(DOG_FRAMES.length * DOG_W, PIGEON_FRAMES.length * PIGEON_W);
  const h = DOG_LOOKS * DOG_H + PLUMES.length * PIGEON_H;
  const atlas = scene.textures.createCanvas('animals', w, h);
  if (!atlas) return;
  const ctx = atlas.getContext();

  COATS.slice(0, DOG_LOOKS).forEach(([body, ear, spot], look) => {
    const colors = {
      b: body, d: shade(body, -0.12), e: ear, t: body, p: shade(body, -0.2),
      o: PALETTE.ink, n: PALETTE.ink, c: '#c0493f', s: spot ?? body,
    };
    DOG_FRAMES.forEach((pose, i) => {
      paint(ctx, DOG[pose], colors, i * DOG_W, look * DOG_H);
      atlas.add(dogFrame(look, pose), 0, i * DOG_W, look * DOG_H, DOG_W, DOG_H);
    });
  });
  PLUMES.forEach(([body, wing, head], look) => {
    const colors = {
      b: body, w: wing, k: head, g: '#5a8a7a', y: PALETTE.ink, l: '#c9b8a0', f: '#c8726a', t: shade(wing, -0.1),
    };
    const oy = DOG_LOOKS * DOG_H + look * PIGEON_H;
    PIGEON_FRAMES.forEach((pose, i) => {
      paint(ctx, PIGEON[pose], colors, i * PIGEON_W, oy);
      atlas.add(pigeonFrame(look, pose), 0, i * PIGEON_W, oy, PIGEON_W, PIGEON_H);
    });
  });
  atlas.refresh();
}
