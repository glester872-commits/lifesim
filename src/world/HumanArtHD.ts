import type Phaser from 'phaser';
import { PALETTE } from '../config/constants';
import type { Facing } from '../types/game';
import type { Ctx } from './paint';
import { dress, markerColors, partOf, tone } from './Garments';
import { drawHuman, drop, type HumanColors, type Pose } from './HumanArt';

/**
 * Personas a 28 × 42 en vez de 16 × 24: el jugador y quien lleva ropa de verdad
 * (`outfit`, world/TextureFactory). Miden lo mismo en el mundo: el sprite va a
 * escala 16/28 (a zoom 3,5, dos píxeles de pantalla por píxel de arte).
 *
 * La persona es el dibujo de 16 × 24 de siempre llevado a 28 × 42 tal cual
 * (cara, pelo y silueta idénticos), pulido por dentro (polish) y, si lleva
 * `outfit`, vestido con world/Garments: la ropa con su corte, sus costuras y su
 * tejido. Lo que la ropa abulta (capucha, abrigo, pernera ancha) entra en la
 * silueta; el contorno va en su borde.
 */
export const HD_W = 28;
export const HD_H = 42;
export const HD_SCALE = 16 / HD_W;

/**
 * Recorta a la silueta de 16 × 24 escalada, rellena huecos y pone el contorno
 * en su borde, teñido del color que tiene al lado (más limpio que un negro plano).
 */
function finish(ctx: Ctx, mask: Uint8Array): void {
  const img = ctx.getImageData(0, 0, HD_W, HD_H);
  const d = img.data;
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < HD_W && y < HD_H;
  for (let i = 0; i < HD_W * HD_H; i++) if (!mask[i]) d[i * 4 + 3] = 0;
  // Huecos: el color del vecino pintado (varias pasadas, del borde hacia dentro).
  for (let pass = 0; pass < 10; pass++) {
    let left = 0;
    for (let y = 0; y < HD_H; y++) {
      for (let x = 0; x < HD_W; x++) {
        const i = (y * HD_W + x) * 4;
        if (!mask[y * HD_W + x] || d[i + 3]) continue;
        const n = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].find(([a, b]) => inside(a, b) && d[(b * HD_W + a) * 4 + 3] === 255);
        if (!n) {
          left++;
          continue;
        }
        const j = (n[1] * HD_W + n[0]) * 4;
        d[i] = d[j];
        d[i + 1] = d[j + 1];
        d[i + 2] = d[j + 2];
        d[i + 3] = 254;
      }
    }
    for (let i = 3; i < d.length; i += 4) if (d[i] === 254) d[i] = 255;
    if (!left) break;
  }
  // Contorno selectivo en el borde de la máscara: el oscuro del contorno con un poco del color que encierra.
  const o = Number.parseInt(PALETTE.outline.slice(1), 16);
  const out = (a: number, b: number): boolean => inside(a, b) && !mask[b * HD_W + a];
  const edge: number[] = [];
  for (let y = 0; y < HD_H; y++) {
    for (let x = 0; x < HD_W; x++) {
      if (mask[y * HD_W + x] && (out(x - 1, y) || out(x + 1, y) || out(x, y - 1) || out(x, y + 1))) edge.push((y * HD_W + x) * 4);
    }
  }
  for (const i of edge) {
    d[i] = Math.round(((o >> 16) & 255) * 0.72 + d[i] * 0.45 * 0.28);
    d[i + 1] = Math.round(((o >> 8) & 255) * 0.72 + d[i + 1] * 0.45 * 0.28);
    d[i + 2] = Math.round((o & 255) * 0.72 + d[i + 2] * 0.45 * 0.28);
    d[i + 3] = 245;
  }
  ctx.putImageData(img, 0, 0);
}

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
 * Para el jugador: la misma ampliación, con otro reparto de columnas. De 16 a 28, cuatro columnas
 * ocupan un píxel y las demás dos. Con el reparto de arriba (1, 5, 9 y 13) el ojo izquierdo (columna 6)
 * salía de dos píxeles y el derecho (columna 9) de uno, y la cara cambiaba. Aquí son la 1, la 5, la 10 y
 * la 13: la cara (columnas 4 a 11) queda simétrica, los dos ojos del mismo ancho y a la misma distancia, y
 * el cuerpo mide lo mismo que antes (21 píxeles de las columnas 2 a 13).
 */
const NARROW: ReadonlySet<number> = new Set([1, 5, 10, 13]);
const PLAYER_COLS: readonly number[] = Array.from({ length: 16 }, (_, x) => (NARROW.has(x) ? [x] : [x, x])).flat();
const srcPlayer = (x: number, y: number): number => Math.floor(((y + 0.5) * 24) / HD_H) * 16 + PLAYER_COLS[x];
/** El dibujo de siempre llevado a 28 × 42 (sin pintar) y su silueta. */
function scaled(a: Uint8ClampedArray): { img: Uint8ClampedArray<ArrayBuffer>; mask: Uint8Array } {
  const img = new Uint8ClampedArray(HD_W * HD_H * 4);
  const mask = new Uint8Array(HD_W * HD_H);
  for (let i = 0; i < HD_W * HD_H; i++) {
    const s = srcPlayer(i % HD_W, Math.floor(i / HD_W)) * 4;
    img.set(a.subarray(s, s + 4), i * 4);
    mask[i] = a[s + 3] > 0 ? 1 : 0;
  }
  return { img, mask };
}

/** Mapa de partes (world/Garments): el dibujo de siempre con los colores testigo, ampliado igual. */
function partsHD(facing: Facing, pose: Pose, c: HumanColors): Uint8Array {
  const a = oldPixels(facing, pose, markerColors(c));
  const parts = new Uint8Array(HD_W * HD_H);
  for (let i = 0; i < HD_W * HD_H; i++) {
    const s = srcPlayer(i % HD_W, Math.floor(i / HD_W)) * 4;
    parts[i] = partOf(a[s], a[s + 1], a[s + 2], a[s + 3]);
  }
  return parts;
}

/** Ropa de verdad (world/Garments) o la de siempre pulida: el interruptor de desarrollo lifesim.clothes(). */
let premium = true;
export const setPremium = (on: boolean): void => {
  premium = on;
};

type Region = 'out' | 'line' | 'feature' | 'hair' | 'skin' | 'cloth' | 'dark' | 'sleeve' | 'trousers' | 'shoes';

const rgb = (hex: string): readonly [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * El jugador: su dibujo de 16 × 24 de siempre, llevado a 28 × 42 tal cual (cada
 * píxel donde estaba: cara, pelo, ropa y silueta idénticos) y pulido sólo por
 * dentro. Cada píxel se reconoce por la zona a la que pertenece (pelo, piel,
 * camiseta, manga, pantalón, zapatos) y coge luz o sombra en el borde de su
 * zona: luz arriba y a la izquierda (de donde viene el sol), sombra abajo y a
 * la derecha, el brillo del pelo arriba y la sombra que deja el flequillo en la
 * frente. Los rasgos de la cara (ojos, boca) y las líneas de dentro no se
 * tocan; el contorno se tiñe del color que encierra. Vale para todas las poses.
 */
export function drawPlayerHD(ctx: Ctx, facing: Facing, pose: Pose, c: HumanColors): void {
  const { img, mask } = scaled(oldPixels(facing, pose, c));
  ctx.clearRect(0, 0, HD_W, HD_H);
  ctx.putImageData(new ImageData(img, HD_W, HD_H), 0, 0);
  // La cabeza (hasta el cuello, 10 filas de 16 × 24 más lo que baje el tronco) no se pule salvo el pelo: la cara queda tal cual.
  polish(ctx, c, Math.round((10 + drop(pose)) * (HD_H / 24)));
  if (premium && c.outfit) {
    // La ropa como ropa: corte, costuras y tejido sobre los píxeles de ropa; lo que abulta entra en la silueta.
    const dressed = ctx.getImageData(0, 0, HD_W, HD_H);
    const extra = dress(dressed.data, partsHD(facing, pose, c), HD_W, HD_H, facing, c, c.outfit);
    ctx.putImageData(dressed, 0, 0);
    for (let i = 0; i < mask.length; i++) mask[i] |= extra[i];
  }
  finish(ctx, mask);
}

function polish(ctx: Ctx, c: HumanColors, headRows: number): void {
  const img = ctx.getImageData(0, 0, HD_W, HD_H);
  const d = img.data;
  const bases: readonly (readonly [Region, readonly [number, number, number]])[] = [
    ['hair', rgb(c.hair)], ['skin', rgb(c.skin)], ['cloth', rgb(c.cloth)], ['dark', rgb(c.clothDark)],
    ['sleeve', rgb(c.sleeves ?? c.cloth)], ['trousers', rgb(c.trousers)], ['shoes', rgb(c.shoes)],
  ];
  const line = rgb(PALETTE.outline);
  const dist = (i: number, [r, g, b]: readonly [number, number, number]): number => Math.hypot(d[i] - r, d[i + 1] - g, d[i + 2] - b);
  const at = (x: number, y: number): number => (y * HD_W + x) * 4;
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < HD_W && y < HD_H;
  // Qué es cada píxel: fuera, contorno o línea de dentro, un rasgo (lejos de todo color de zona) o su zona.
  const region: Region[] = [];
  for (let y = 0; y < HD_H; y++) {
    for (let x = 0; x < HD_W; x++) {
      const i = at(x, y);
      if (!d[i + 3]) {
        region.push('out');
        continue;
      }
      if (dist(i, line) < 34) {
        region.push('line');
        continue;
      }
      let best: Region = 'feature';
      let bestD = 70;
      for (const [r, col] of bases) {
        const dd = dist(i, col);
        if (dd < bestD) {
          bestD = dd;
          best = r;
        }
      }
      region.push(best);
    }
  }
  const reg = (x: number, y: number): Region => (inside(x, y) ? region[y * HD_W + x] : 'out');
  // El anillo del contorno: línea que toca el exterior. Las líneas de dentro (los ojos) no son borde de nada.
  const ring = (x: number, y: number): boolean =>
    reg(x, y) === 'out' || (reg(x, y) === 'line' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => reg(x + a, y + b) === 'out'));
  const other = (k: Region, x: number, y: number): Region | null => {
    const q = reg(x, y);
    if (q === k || q === 'feature' || (q === 'line' && !ring(x, y))) return null;
    // El pelo no se toca donde da a la cara: ahí el flequillo enmarca los ojos (más el izquierdo, como en el
    // de siempre) y oscurecerlo o aclararlo cambiaría cómo se leen.
    if (k === 'hair' && q === 'skin') return null;
    return q;
  };
  const out = new Uint8ClampedArray(d);
  for (let y = 0; y < HD_H; y++) {
    for (let x = 0; x < HD_W; x++) {
      const k = reg(x, y);
      if (k === 'out' || k === 'line' || k === 'feature') continue;
      if (y < headRows && k !== 'hair') continue;
      const hair = k === 'hair';
      let amount = 0;
      const up = other(k, x, y - 1);
      if (up) amount += k === 'skin' && up === 'hair' ? -0.08 : hair ? 0.2 : 0.06;
      if (other(k, x - 1, y)) amount += hair ? 0.1 : 0.08;
      if (other(k, x + 1, y)) amount -= 0.12;
      if (other(k, x, y + 1)) amount -= hair ? 0.14 : 0.1;
      if (!amount) continue;
      const i = at(x, y);
      const hex = `#${[d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      const [r, g, b] = rgb(tone(hex, Math.max(-0.22, Math.min(0.26, amount))));
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
    }
  }
  img.data.set(out);
  ctx.putImageData(img, 0, 0);
}

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
