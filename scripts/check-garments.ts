// La ropa de verdad (world/Garments.ts) sólo pinta ropa: ni cara ni pelo ni piel cambian, y de perfil a la izquierda es
// el espejo exacto de la derecha. Y una prenda de tienda cambia el corte que se pinta (systems/Appearance.ts). `npm run check`.
import assert from 'node:assert/strict';
import { dress, PART_ARM, PART_BOTTOM, PART_SHOE, PART_SKIN, PART_TOP } from '../src/world/Garments.ts';
import { withAppearance } from '../src/systems/Appearance.ts';
import type { Outfit } from '../src/data/outfits.ts';

const W = 28;
const H = 42;
// Un cuerpo esquemático como el de 28 × 42: cabeza de piel, tronco, brazos, piernas y zapatos, con contorno alrededor.
const parts = new Uint8Array(W * H);
const fill = (x0: number, y0: number, x1: number, y1: number, p: number): void => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) parts[y * W + x] = p;
};
fill(9, 3, 18, 16, PART_SKIN);
fill(7, 18, 20, 29, PART_TOP);
fill(5, 19, 6, 27, PART_ARM);
fill(21, 19, 22, 27, PART_ARM);
fill(5, 28, 6, 29, PART_SKIN);
fill(21, 28, 22, 29, PART_SKIN);
fill(9, 30, 18, 38, PART_BOTTOM);
fill(9, 39, 18, 40, PART_SHOE);
const frame = (): Uint8ClampedArray => {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const solid = parts[i] || [-1, 1, -W, W].some((o) => parts[i + o]);
    if (solid) d.set([parts[i] ? 90 + parts[i] * 20 : 24, 80, 70, 255], i * 4);
  }
  return d;
};
const colors = { cloth: '#c9743f', clothDark: '#9d5730', hair: '#2a2430', skin: '#e3b692', trousers: '#3c4152', shoes: '#23262f' };
const tops: Outfit['top'][] = ['tee', 'tee-fitted', 'tee-oversized', 'shirt', 'sweatshirt', 'hoodie', 'zip-hoodie', 'bomber', 'jacket', 'denim-jacket', 'blazer', 'coat', 'sport'];
const bottoms: Outfit['bottom'][] = ['jeans', 'wide', 'trousers', 'cargo', 'joggers', 'shorts', 'track'];
const shoes: Outfit['shoes'][] = ['sneaker', 'chunky', 'runner', 'boot', 'shoe'];
const looks = new Set<string>();
for (const [i, top] of tops.entries()) {
  const outfit: Outfit = { top, bottom: bottoms[i % bottoms.length], shoes: shoes[i % shoes.length] };
  for (const facing of ['down', 'up', 'right'] as const) {
    const d = frame();
    const before = d.slice();
    dress(d, parts.slice(), W, H, facing, { ...colors, outfit }, outfit);
    for (let p = 0; p < W * H; p++) {
      // La piel de la cabeza y el cuello no se toca nunca.
      if (parts[p] === PART_SKIN && Math.floor(p / W) < 17) assert.deepEqual([...d.subarray(p * 4, p * 4 + 4)], [...before.subarray(p * 4, p * 4 + 4)], `${top} ${facing}: piel tocada en ${p}`);
    }
    looks.add(Buffer.from(d).toString('base64'));
  }
  // A la izquierda, el espejo de la derecha píxel a píxel.
  const right = frame();
  dress(right, parts.slice(), W, H, 'right', { ...colors, outfit }, outfit);
  const mirrored = new Uint8ClampedArray(W * H * 4);
  const src = frame();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mirrored.set(src.subarray((y * W + W - 1 - x) * 4, (y * W + W - x) * 4), (y * W + x) * 4);
  const mParts = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mParts[y * W + x] = parts[y * W + W - 1 - x];
  dress(mirrored, mParts, W, H, 'left', { ...colors, outfit }, outfit);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    assert.deepEqual([...mirrored.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)], [...right.subarray((y * W + W - 1 - x) * 4, (y * W + W - x) * 4)], `${top}: izquierda no es el espejo`);
  }
}
// Cada prenda se pinta distinto: ningún par de cortes sale igual.
assert.equal(looks.size, tops.length * 3, 'dos prendas se pintan igual');

// Comprar cambia el corte: la sudadera de archivo es con capucha; el vaquero, vaquero; las botas, botas.
const base = { ...colors, outfit: { top: 'tee', bottom: 'trousers', shoes: 'sneaker' } as Outfit };
const worn = withAppearance(base, { top: 'sudadera-archivo', bottom: 'vaquero-recto', shoes: 'bota-cuero' }).outfit;
assert.deepEqual([worn?.top, worn?.bottom, worn?.shoes], ['hoodie', 'jeans', 'boot']);
assert.equal(withAppearance({ ...colors }, { top: 'sudadera-archivo' }).outfit, undefined, 'sin outfit de fábrica no se inventa uno');
console.log(`check-garments: ${tops.length} cortes × 3 vistas sin tocar la piel, izquierda = espejo, compras → corte. OK`);
