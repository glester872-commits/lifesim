import type Phaser from 'phaser';
import { PALETTE } from '../config/constants';

/**
 * Primitivas de dibujo compartidas por TextureFactory, BuildingArt y PropArt.
 * Todo el arte sale de aquí y de PALETTE: ni un píxel binario.
 */
export type Ctx = CanvasRenderingContext2D;

export const px = (ctx: Ctx, color: string, x: number, y: number, w = 1, h = 1): void => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};

/** Aclara (amount > 0) u oscurece (amount < 0) un color de la paleta. */
export function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(v + amount * 255))),
  );
  return `#${channels.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Ruido determinista: la misma semilla produce siempre el mismo grano. */
export function sprinkle(ctx: Ctx, color: string, w: number, h: number, seed: number, count: number): void {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    px(ctx, color, Math.floor(next() * w), Math.floor(next() * h));
  }
}

/** Halo circular translucido: la luz no tiene esquinas. */
export function glow(ctx: Ctx, cx: number, cy: number, radius: number, alpha: number, color: string = PALETTE.amber): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx) => void): void {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, w, h);
  if (!texture) return;
  const ctx = texture.getContext();
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  texture.refresh();
}

/** Dibuja una silueta irregular fila a fila: [x inicial, ancho] por cada y. */
export function blob(ctx: Ctx, color: string, top: number, rows: readonly [number, number][]): void {
  rows.forEach(([x, w], i) => px(ctx, color, x, top + i, w, 1));
}

/** Fuente de 5x7 para el rótulo de las bocas de metro. Sólo las letras que usa. */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  M: ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X', 'X...X', 'X...X'],
  E: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
  T: ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', '..X..'],
  R: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X.X..', 'X..X.', 'X...X'],
  O: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
};

export function drawWord(ctx: Ctx, word: string, x: number, y: number, color: string): void {
  let cursor = x;
  for (const letter of word) {
    const glyph = GLYPHS[letter];
    if (!glyph) continue;
    glyph.forEach((row, ry) => {
      [...row].forEach((cell, rx) => {
        if (cell === 'X') px(ctx, color, cursor + rx, y + ry, 1, 1);
      });
    });
    cursor += 7;
  }
}

/**
 * Fuente de 3x5 para carteles de local. A zoom de juego sale a 9x15 px de
 * pantalla: se lee una palabra corta, no una frase. Sólo las letras que se usan.
 */
const MICRO: Readonly<Record<string, string>> = {
  S: 'XXXX..XXX..XXXX', E: 'XXXX..XXXX..XXX', A: '.X.X.XXXXX.XX.X', L: 'X..X..X..X..XXX',
  Q: '.X.X.XX.XXXX.XX', U: 'X.XX.XX.XX.XXXX', I: 'XXX.X..X..X.XXX',
};

export function drawMicro(ctx: Ctx, text: string, x: number, y: number, color: string): void {
  let cursor = x;
  for (const ch of text) {
    const glyph = MICRO[ch];
    if (glyph) {
      for (let i = 0; i < 15; i++) if (glyph[i] === 'X') px(ctx, color, cursor + (i % 3), y + Math.floor(i / 3));
    }
    cursor += 4;
  }
}

export const microWidth = (text: string): number => text.length * 4 - 1;
