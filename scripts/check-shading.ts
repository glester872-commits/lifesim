// La luz de forma (world/Shading.ts) no puede cambiar la silueta de nadie: `npm run check`.
import assert from 'node:assert/strict';
import { shadeForm } from '../src/world/Shading.ts';

const W = 16;
const H = 24;
const rand = (() => {
  let s = 7;
  return (): number => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
})();

for (let n = 0; n < 200; n++) {
  // Una silueta cualquiera: manchas opacas de colores al azar sobre transparente.
  const d = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    if (rand() < 0.55) d.set([rand() * 255, rand() * 255, rand() * 255, 255], i * 4);
  }
  const before = d.slice();
  shadeForm(d, W, H);
  for (let i = 0; i < W * H; i++) {
    assert.equal(d[i * 4 + 3], before[i * 4 + 3], `alfa cambiado en ${i % W},${Math.floor(i / W)}`);
    if (before[i * 4 + 3] === 0) assert.deepEqual([...d.slice(i * 4, i * 4 + 3)], [...before.slice(i * 4, i * 4 + 3)], 'pintó fuera de la silueta');
  }
}

// La luz viene del noroeste: en un bloque liso, el canto derecho queda más oscuro que el izquierdo.
const block = new Uint8ClampedArray(W * H * 4);
for (let y = 4; y < 20; y++) for (let x = 4; x < 12; x++) block.set([150, 120, 100, 255], (y * W + x) * 4);
shadeForm(block, W, H);
const at = (x: number, y: number): number => block[(y * W + x) * 4];
assert.ok(at(11, 10) < at(7, 10), 'el canto derecho no está en sombra');
assert.ok(at(4, 10) > at(7, 10), 'el canto izquierdo no recibe luz');
assert.ok(at(7, 4) > at(7, 10), 'el canto de arriba no recibe luz');

console.log('shading ok: 200 siluetas al azar con el alfa intacto; luz del noroeste');
