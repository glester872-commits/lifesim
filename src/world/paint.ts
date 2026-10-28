import type Phaser from 'phaser';
import { PALETTE } from '../config/constants.ts';

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

/** Tono hacia el que va la luz (amarillo cálido) y hacia el que va la sombra (azul violáceo), en grados. */
const LIGHT_HUE = 48;
const SHADOW_HUE = 236;

/**
 * Como `shade` (mismo `amount`: + aclara, − oscurece), pero con desplazamiento de tono, la rampa clásica del pixel
 * art: la luz sube hacia el amarillo cálido y pierde algo de saturación; la sombra baja hacia el azul violáceo y gana
 * saturación. Con `shade` la sombra sólo es el mismo color más gris. Hasta 24° de giro, proporcional a `amount`; un
 * gris neutro coge un poco del color de su lado (la sombra de la piedra, algo azulada; su luz, algo cálida).
 */
export function ramp(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let l = (max + min) / 2;
  const d = max - min;
  let s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = d === 0 ? (amount < 0 ? SHADOW_HUE : LIGHT_HUE) : max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  const k = Math.min(1, Math.abs(amount) * 5);
  const target = amount < 0 ? SHADOW_HUE : LIGHT_HUE;
  // Por el camino más corto del círculo de color. Un color ya saturado (un acento: el interior de una ventana, una
  // contraventana) gira menos: su identidad es el tono. Primera versión, con 24° y +0,12 de saturación: las juntas
  // del almohadillado salían en rayas rojas; así se queda en una sombra algo más fría y algo más rica, sin saltar.
  const delta = ((target - h + 540) % 360) - 180;
  h = (h + Math.sign(delta) * Math.min(Math.abs(delta), 14 * k * (1 - 0.6 * s)) + 360) % 360;
  s = Math.max(0, Math.min(1, s + (amount < 0 ? 0.04 : -0.04) * k + (d === 0 ? 0.04 * k : 0)));
  l = Math.max(0, Math.min(1, l + amount));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [rr, gg, bb] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[rr, gg, bb].map((v) => Math.round(Math.max(0, Math.min(1, v + m)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Limpieza de píxeles huérfanos en un dibujo ya hecho (una vez, al hornear la textura; no es post-proceso de pantalla):
 * un píxel opaco cuyos cuatro vecinos son opacos, iguales entre sí y distintos de él no describe nada (ni línea, ni
 * borde, ni volumen: es ruido) y toma el color de sus vecinos. Las líneas de un píxel no se tocan: a lo largo tienen
 * vecinos de su color. Devuelve cuántos ha limpiado.
 */
export function despeckle(data: Uint8ClampedArray, w: number, h: number): number {
  const src = data.slice();
  const at = (x: number, y: number): number => (y * w + x) * 4;
  const same = (a: number, b: number): boolean => src[a] === src[b] && src[a + 1] === src[b + 1] && src[a + 2] === src[b + 2] && src[a + 3] === src[b + 3];
  let cleaned = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = at(x, y);
      if (src[i + 3] !== 255) continue;
      const [n, s, e, o] = [at(x, y - 1), at(x, y + 1), at(x + 1, y), at(x - 1, y)];
      if (src[n + 3] !== 255 || !same(n, s) || !same(n, e) || !same(n, o) || same(i, n)) continue;
      data.set(src.subarray(n, n + 4), i);
      cleaned++;
    }
  }
  return cleaned;
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
 * Rampas por material, escogidas a mano (design/ART_BIBLE §16): hondo, sombra, base, luz. La sombra baja hacia el frío
 * (topo, gris violáceo, vino, azul petróleo) y gana algo de saturación; la luz sube hacia el cálido y la pierde. Cada
 * material tiene sólo estos cuatro tonos: la superficie se lee en manchas, no en grano.
 */
export const MATERIAL_RAMPS: Readonly<Record<'stucco' | 'stone' | 'roof' | 'clay' | 'glass', readonly [string, string, string, string]>> = {
  // Revoco crema de tu portal (wallLit +6 %).
  stucco: ['#9a8478', '#c4ad8f', '#e7cfaa', '#f6e6c6'],
  // Sillería caliza (PALETTE.stone / stoneLit).
  stone: ['#625f66', '#857f80', '#a8a194', '#c8bfa9'],
  // Azotea de baldosa (PALETTE.roofB).
  roof: ['#3f3d4a', '#57545f', '#737078', '#8e8a8c'],
  // Teja cerámica (roofB mezclada con barro).
  clay: ['#5e3b3c', '#80524a', '#9e705f', '#bf8a6a'],
  // Cristal de los huecos (PALETTE.glass).
  glass: ['#1f2f3f', '#2e4756', '#3d5f6b', '#6f97a0'],
};

const rgbOf = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lumOf = (hex: string): number => {
  const [r, g, b] = rgbOf(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};
const RAMPS = Object.values(MATERIAL_RAMPS);
/** Distancia de color (RGB) por debajo de la cual un tono pertenece a un material. */
const MATERIAL_NEAR = 14;

/**
 * El tono de material para `shade(hex, amount)`: si `hex` es de un material (cerca de algún tono de su rampa), el
 * tono de esa rampa con la claridad más parecida a la pedida; si no (un acento: geranios, contraventanas, el interior
 * encendido), el de siempre. Así el material sólo tiene sus cuatro tonos y los acentos conservan su color.
 */
export function materialTone(hex: string, amount: number): string {
  const c = rgbOf(hex);
  let best: readonly string[] | null = null;
  let bestD = MATERIAL_NEAR;
  for (const r of RAMPS) {
    for (const t of r) {
      const o = rgbOf(t);
      const d = Math.hypot(c[0] - o[0], c[1] - o[1], c[2] - o[2]);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
  }
  if (!best) return shade(hex, amount);
  const want = lumOf(hex) + amount * 255;
  return best.reduce((a, b) => (Math.abs(lumOf(b) - want) < Math.abs(lumOf(a) - want) ? b : a));
}
