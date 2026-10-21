import type Phaser from 'phaser';
import { PALETTE } from '../config/constants';
import type { Facing } from '../types/game';
import type { Ctx } from './paint';
import { dress, markerColors, partOf } from './Garments';
import { drawHuman, type HumanColors, type Pose } from './HumanArt';

/**
 * La gente con el acabado HD-03, a 16 × 24 y escala 1 (world/TextureFactory): el dibujo de siempre
 * (world/HumanArt) con la ropa de verdad (world/Garments) dentro de su silueta y un contorno selectivo.
 */

let small: CanvasRenderingContext2D | null = null;
/** El dibujo de siempre (16 × 24, con su contorno) en un lienzo suelto. */
function oldPixels(facing: Facing, pose: Pose, c: HumanColors): Uint8ClampedArray {
  if (!small) {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 24;
    small = canvas.getContext('2d', { willReadFrequently: true });
    if (!small) throw new Error('Sin canvas 2D');
  }
  small.clearRect(0, 0, 16, 24);
  drawHuman(small, facing, pose, c);
  return small.getImageData(0, 0, 16, 24).data;
}

/**
 * HD-03, escala coherente: la persona a 16 × 24 y a escala 1, la misma
 * densidad de píxel que el mundo. Un píxel de arte es un píxel de mundo: nítido a cualquier zoom entero (el de
 * 28 × 42 a escala 16/28 no lo es a ninguno). Sobre el dibujo de siempre (cara, pelo, silueta y proporciones
 * idénticas), la ropa de verdad (world/Garments) a ese tamaño y un contorno selectivo: el borde toma un tono hondo
 * del color que encierra, más claro arriba a la izquierda (la luz del noroeste) y más oscuro abajo a la derecha.
 */
export function drawPersonFine(ctx: Ctx, facing: Facing, pose: Pose, c: HumanColors): void {
  const W = 16;
  const H = 24;
  ctx.clearRect(0, 0, W, H);
  drawHuman(ctx, facing, pose, c);
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  if (premium && c.outfit) {
    const a = oldPixels(facing, pose, markerColors(c));
    const parts = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) parts[i] = partOf(a[i * 4], a[i * 4 + 1], a[i * 4 + 2], a[i * 4 + 3]);
    // Lo que la prenda abulta, a este tamaño, ensancha a la persona (la capucha y las mangas llegan al borde de la
    // celda): la ropa va dentro de la silueta de siempre y las proporciones no cambian.
    const before = d.slice();
    dress(d, parts, W, H, facing, c, c.outfit);
    for (let i = 0; i < W * H * 4; i += 4) if (before[i + 3] < 255) d.set(before.subarray(i, i + 4), i);
  }
  selectiveOutline(d, W, H);
  ctx.putImageData(img, 0, 0);
}

function selectiveOutline(d: Uint8ClampedArray, W: number, H: number): void {
  const o = rgb(PALETTE.outline);
  const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 0;
  const body = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] === 255;
  const isLine = (i: number): boolean => d[i + 3] > 0 && d[i + 3] < 255;
  // Lo que la ropa abulta cruzó el contorno: se cierra por fuera.
  const close: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!solid(x, y) && (body(x - 1, y) || body(x + 1, y) || body(x, y - 1) || body(x, y + 1))) close.push((y * W + x) * 4);
  for (const i of close) {
    d[i] = o[0];
    d[i + 1] = o[1];
    d[i + 2] = o[2];
    d[i + 3] = 235;
  }
  // Cada píxel de contorno, del color de lo que tiene dentro.
  const out: [number, number, number, number][] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (!isLine(i)) continue;
      const n = [[x - 1, y], [x, y - 1], [x + 1, y], [x, y + 1]].find(([a, b]) => body(a, b));
      if (!n) continue;
      const j = (n[1] * W + n[0]) * 4;
      // Con la persona a la derecha o debajo, es el canto de arriba o de la izquierda: el que da al sol.
      const lit = (body(x + 1, y) || body(x, y + 1)) && !(body(x - 1, y) || body(x, y - 1));
      const k = lit ? 0.62 : 0.8;
      out.push([i, d[j] + (o[0] - d[j]) * k, d[j + 1] + (o[1] - d[j + 1]) * k, d[j + 2] + (o[2] - d[j + 2]) * k]);
    }
  }
  for (const [i, r, g, b] of out) {
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = 255;
  }
}

/** Ropa de verdad (world/Garments) o la de siempre pulida: el interruptor de desarrollo lifesim.clothes(). */
let premium = true;
export const setPremium = (on: boolean): void => {
  premium = on;
};

const rgb = (hex: string): readonly [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export interface ComparePerson {
  label: string;
  colors: HumanColors;
  /** Su textura de verdad en el juego (la que usa su sprite): clave y, en un atlas, fotograma. */
  live: (facing: Facing, pose: Pose) => { key: string; frame?: string };
}

/**
 * Herramienta de desarrollo (lifesim.hdCompare()): junto al jugador, cada
 * persona en las cuatro direcciones dos veces, arriba OLD (el dibujo de 16 × 24
 * de siempre) y abajo NEW (la textura que usa su sprite en el juego), a la
 * escala del mundo. Sin cuerpo ni lógica; otra llamada lo quita.
 */
let shown: Phaser.GameObjects.GameObject[] = [];
export function hdCompare(scene: Phaser.Scene, at: { x: number; y: number }, people: readonly ComparePerson[]): string {
  if (shown.length) {
    shown.forEach((o) => o.destroy());
    shown = [];
    return 'quitado';
  }
  const views: readonly (readonly [Facing, Pose])[] = [['down', 0], ['down', 1], ['right', 0], ['right', 1], ['up', 0], ['left', 0]];
  const label = (text: string, x: number, y: number): void => {
    shown.push(scene.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '24px', color: '#ffffff', backgroundColor: '#000000aa' }).setScale(0.25).setOrigin(1, 1).setDepth(at.y + 100));
  };
  // Por parejas, en la misma fila: a la izquierda ORIGINAL (16 × 24), a la derecha HD (la textura de su sprite).
  const oldKey = (person: ComparePerson, facing: Facing, pose: Pose): string => {
    const key = `old-${person.label}-${facing}-${pose}`;
    if (!scene.textures.exists(key)) {
      const tex = scene.textures.createCanvas(key, 16, 24);
      if (tex) {
        drawHuman(tex.getContext(), facing, pose, person.colors);
        tex.refresh();
      }
    }
    return key;
  };
  let y = at.y;
  for (const person of people) {
    const x0 = at.x - (views.length * 40) / 2;
    label(`ORIGINAL | HD · ${person.label}`, x0 + 30, y - 26);
    views.forEach(([facing, pose], i) => {
      const x = x0 + i * 40;
      const live = person.live(facing, pose);
      const pair: readonly (readonly [string, string | undefined, number])[] = [[oldKey(person, facing, pose), undefined, x], [live.key, live.frame, x + 17]];
      for (const [key, frame, px0] of pair) {
        const img = scene.add.image(px0, y, key, frame).setOrigin(0.5, 1).setDepth(y);
        // El de 28 × 42 a la escala del mundo: la misma que le pone su entidad en el juego.
        img.setScale(16 / img.width);
        shown.push(scene.add.image(px0, y - 1, 'fx-shadow').setDepth(y - 1), img);
      }
    });
    y += 34;
  }
  return 'por parejas: a la izquierda ORIGINAL (16 × 24), a la derecha HD (la textura que usa su sprite en el juego)';
}
