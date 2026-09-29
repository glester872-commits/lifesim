import type Phaser from 'phaser';
import { PALETTE } from '../config/constants';
import { make, px, shade, type Ctx } from './paint';

/**
 * Árboles por generador, no a mano: una especie (tamaño, tronco, pie) y una
 * semilla dan un árbol distinto con el mismo idioma. Copa de racimos que se
 * solapan en 3/4 (el de delante tapa y ensombrece al de detrás), siete verdes
 * de la sombra honda al brillo, luz del noroeste, borde irregular y grano de
 * hoja. Cada prop con `variants` elige el suyo por posición (world/tiles.ts).
 */

/** Del hueco más hondo al brillo de sol. */
const GREENS = ['#223a1c', '#2e4d25', '#3d6430', '#4f7a38', '#658f42', '#7fa94f', '#a0c465'] as const;
const WARM_LEAF = '#9aa447';
const COOL_LEAF = '#3f7a5c';
const BARK = '#8a7d62';
const BARK_DARK = '#5e5341';
const BARK_LIT = '#b8ab88';

export interface Species {
  key: string;
  w: number;
  h: number;
  /** Pie: rejilla de hierro de alcorque (calle), tierra con raíces (parque) o parterre elevado con flores (plaza). */
  foot: 'grate' | 'soil' | 'bed';
  variants: number;
}

export const TREE: Species = { key: 'prop-tree', w: 44, h: 60, foot: 'soil', variants: 4 };
export const PLANE_TREE: Species = { key: 'prop-plane-tree', w: 56, h: 80, foot: 'grate', variants: 3 };
/** El mismo plátano en su parterre elevado de granito: el árbol de plaza. */
export const BED_TREE: Species = { key: 'prop-bed-tree', w: 56, h: 85, foot: 'bed', variants: 3 };

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + seed * 2246822519, 3266489917);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

function mix(a: string, b: string, k: number): string {
  const pa = Number.parseInt(a.slice(1), 16);
  const pb = Number.parseInt(b.slice(1), 16);
  const ch = (s: number): number => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * k);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

interface Cluster {
  x: number;
  y: number;
  r: number;
}

/** `sway`: px que se desplaza la copa (el tronco no): el fotograma de racha de viento. */
function drawTree(ctx: Ctx, sp: Species, seed: number, sway = 0): void {
  const { w, h } = sp;
  let s = (seed * 2654435761) >>> 0 || 1;
  const rnd = (): number => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const cx = w / 2;
  const k = w / 56; // escala de la especie

  // Pie del árbol.
  const footY = h - (sp.foot === 'bed' ? 11 : 6);
  if (sp.foot === 'bed') {
    // Parterre elevado de granito (design/visual-reference): tierra con flores y matas, canto al sol y frente con juntas.
    const bw = Math.round(28 * k);
    const bx = Math.round(cx - bw / 2);
    px(ctx, shade(PALETTE.plaza, 0.06), bx - 1, footY - 3, bw + 2, 2);
    px(ctx, '#3f3226', bx, footY - 1, bw, 3);
    for (let i = 0; i < 9; i++) {
      const fx = bx + 1 + Math.floor(rnd() * (bw - 3));
      const lump = rnd() < 0.5;
      px(ctx, lump ? GREENS[3] : GREENS[4], fx, footY - 3 - (lump ? 1 : 0), 3, 3);
      px(ctx, GREENS[5], fx + 1, footY - 4 - (lump ? 1 : 0), 1, 1);
    }
    for (let i = 0; i < 7; i++) {
      const fx = bx + 1 + Math.floor(rnd() * (bw - 2));
      px(ctx, ['#e06a8a', PALETTE.white, '#f0c060', '#c77adb'][i % 4], fx, footY - 3 - Math.floor(rnd() * 2), 1, 1);
    }
    px(ctx, shade(PALETTE.plaza, -0.05), bx - 1, footY + 2, bw + 2, 7);
    px(ctx, shade(PALETTE.plaza, 0.1), bx - 1, footY + 2, bw + 2, 1);
    for (let x = bx + 6; x < bx + bw; x += 8) px(ctx, shade(PALETTE.plaza, -0.16), x, footY + 3, 1, 5);
    px(ctx, shade(PALETTE.plaza, -0.2), bx + bw - 1, footY + 2, 2, 7);
    px(ctx, shade(PALETTE.plaza, -0.26), bx - 1, footY + 8, bw + 2, 1);
  } else if (sp.foot === 'grate') {
    px(ctx, shade(PALETTE.plaza, -0.2), cx - 10, footY - 1, 20, 7);
    px(ctx, PALETTE.iron, cx - 9, footY, 18, 5);
    for (let x = cx - 8; x < cx + 9; x += 2) px(ctx, shade(PALETTE.iron, 0.12), x, footY + 1, 1, 3);
    px(ctx, '#4b3a2c', cx - 3, footY + 1, 6, 2);
  } else {
    px(ctx, '#4b3a2c', cx - 7, footY + 1, 14, 3);
    px(ctx, '#5c4833', cx - 5, footY + 1, 10, 1);
    px(ctx, BARK_DARK, cx - 6, footY + 2, 3, 1);
    px(ctx, BARK_DARK, cx + 3, footY + 2, 3, 1);
  }

  // Tronco con placas de corteza y dos ramas que se abren hacia la copa.
  const trunkTop = Math.round(h * 0.56);
  const tw = Math.max(3, Math.round(5 * k));
  const tx = cx - Math.floor(tw / 2);
  px(ctx, BARK, tx, trunkTop, tw, footY + 2 - trunkTop);
  px(ctx, BARK_DARK, tx + tw - 2, trunkTop, 2, footY + 2 - trunkTop);
  for (let y = trunkTop + 3; y < footY - 1; y += 4 + Math.floor(rnd() * 3)) px(ctx, BARK_LIT, tx + Math.floor(rnd() * (tw - 2)), y, 2, 2);
  for (const dir of [-1, 1]) {
    let bx = cx;
    for (let y = trunkTop + 2; y > trunkTop - 8 * k; y--) {
      bx += dir * (rnd() < 0.6 ? 1 : 0);
      px(ctx, BARK_DARK, bx, y, 2, 1);
    }
  }

  // Copa: racimos dentro de un óvalo, ordenados de atrás (arriba) a delante (abajo).
  const canopyCy = Math.round(h * 0.38);
  const rx = w / 2 - 2;
  const ry = h * 0.3;
  const clusters: Cluster[] = [];
  const n = Math.round(20 * k + 4);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * 0.86;
    clusters.push({ x: cx + sway + Math.cos(a) * rx * d, y: canopyCy + Math.sin(a) * ry * d, r: (5.5 + rnd() * 4.5) * Math.max(0.8, k) });
  }
  clusters.push({ x: cx + sway, y: canopyCy, r: 10 * k + 3 });
  clusters.sort((p, q) => p.y - q.y);
  const front = (x: number, y: number): number => {
    for (let i = clusters.length - 1; i >= 0; i--) {
      const c = clusters[i];
      if ((x + 0.5 - c.x) ** 2 + (y + 0.5 - c.y) ** 2 <= c.r * c.r) return i;
    }
    return -1;
  };
  // Cada árbol tira un poco a cálido o a frío: dos vecinos no son del mismo verde.
  const hueShift = rnd();
  const tones = GREENS.map((g) => (hueShift < 0.4 ? mix(g, WARM_LEAF, 0.14 * (1 - hueShift / 0.4)) : hueShift > 0.7 ? mix(g, COOL_LEAF, 0.16) : g));

  const top = Math.floor(canopyCy - ry - 11 * k);
  const bottom = Math.ceil(canopyCy + ry + 11 * k);
  for (let y = Math.max(0, top); y < Math.min(h, bottom); y++) {
    for (let x = 0; x < w; x++) {
      const f = front(x, y);
      if (f < 0) continue;
      const edge = front(x - 1, y) < 0 || front(x + 1, y) < 0 || front(x, y - 1) < 0 || front(x, y + 1) < 0;
      // Borde deshilachado: no un círculo limpio.
      if (edge && hash2(x, y, seed) < 0.28) continue;
      const c = clusters[f];
      const local = ((x + 0.5 - c.x) * 0.55 + (y + 0.5 - c.y) * 0.85) / c.r;
      const global = ((x - cx) / rx) * 0.3 + ((y - canopyCy) / ry) * 0.5;
      const t = local * 0.62 + global * 0.55 + (hash2(x, y, seed + 7) - 0.5) * 0.32;
      let i = Math.round(2.5 - t * 3);
      // Sombra de contacto: donde empieza un racimo de delante, el de detrás queda hondo.
      if (front(x, y + 1) > f) i -= 2;
      else if (front(x, y + 2) > f) i -= 1;
      if (edge) i = Math.min(i, 4);
      px(ctx, tones[Math.max(0, Math.min(6, i))], x, y);
    }
  }
  // Brillos: grupitos de hoja al sol en la cara noroeste de algunos racimos.
  for (const c of clusters) {
    if (rnd() < 0.35) continue;
    const x = Math.round(c.x - c.r * 0.45);
    const y = Math.round(c.y - c.r * 0.5);
    if (front(x, y) < 0) continue;
    px(ctx, tones[6], x, y, 2, 1);
    px(ctx, tones[5], x - 1, y + 1, 2, 1);
  }
  // Algún hueco por el que se ve rama.
  for (let i = 0; i < 3; i++) {
    const c = clusters[Math.floor(rnd() * clusters.length)];
    const x = Math.round(c.x + c.r * 0.2);
    const y = Math.round(c.y + c.r * 0.55);
    if (front(x, y) < 0 || front(x + 1, y) < 0) continue;
    px(ctx, tones[0], x, y, 2, 1);
    px(ctx, BARK_DARK, x, y + 1, 1, 1);
  }
}

export function buildVegetationTextures(scene: Phaser.Scene): void {
  for (const sp of [TREE, PLANE_TREE, BED_TREE]) {
    for (let v = 0; v < sp.variants; v++) {
      make(scene, `${sp.key}-${v}`, sp.w, sp.h, (ctx) => drawTree(ctx, sp, v * 97 + sp.w));
      // La misma copa un píxel a sotavento: world/Ambience alterna los dos con las rachas.
      make(scene, `${sp.key}-${v}-gust`, sp.w, sp.h, (ctx) => drawTree(ctx, sp, v * 97 + sp.w, 1));
    }
  }
}
