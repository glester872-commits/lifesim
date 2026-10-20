// Contrato HD-01: no ampliar, pintar fuera, retocar tinta ni introducir ruido.
import assert from 'node:assert/strict';
import { finishMaterialPixels, type MaterialFinish } from '../src/world/MaterialFinish.ts';
const modes: MaterialFinish[] = ['masonry', 'wood', 'metal'];
const w = 20, h = 20;
const block = (): Uint8ClampedArray => {
  const p = new Uint8ClampedArray(w * h * 4);
  for (let y = 2; y < 18; y++) for (let x = 2; x < 18; x++) {
    const border = x === 2 || x === 17 || y === 2 || y === 17;
    p.set(border ? [25, 27, 30, 255] : [140, 130, 110, 255], (y * w + x) * 4);
  }
  return p;
};
for (const mode of modes) {
  const pixels = block(), before = pixels.slice();
  // Un reflejo semitransparente y un píxel de detalle permanecen idénticos.
  pixels.set([100, 120, 150, 120], (9 * w + 9) * 4);before.set(pixels.subarray((9 * w + 9) * 4, (9 * w + 9) * 4 + 4), (9 * w + 9) * 4);
  finishMaterialPixels(pixels, w, h, mode);
  for (let i = 0; i < w * h; i++) {
    assert.equal(pixels[i * 4 + 3], before[i * 4 + 3], 'alfa alterado');
    if (before[i * 4 + 3] !== 255 || before[i * 4] < 38) assert.deepEqual(pixels.slice(i * 4, i * 4 + 4), before.slice(i * 4, i * 4 + 4), 'transparencia o contorno alterado');
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(pixels[i * 4 + c] - before[i * 4 + c]) <= 10, 'tono fuera de presupuesto');
  }
  assert.deepEqual(pixels.slice((10 * w + 10) * 4, (10 * w + 10) * 4 + 4), before.slice((10 * w + 10) * 4, (10 * w + 10) * 4 + 4), 'superficie lisa modificada');
  assert.ok(pixels[(5 * w + 3) * 4] > pixels[(5 * w + 16) * 4], 'relieve NW ausente');
  const repeated = before.slice();finishMaterialPixels(repeated, w, h, mode);assert.deepEqual(pixels, repeated, 'no determinista');
}
// En una superficie uniforme y en una mota aislada no debe aparecer una rejilla.
const flat = new Uint8ClampedArray(w * h * 4);for(let i=0;i<w*h;i++)flat.set([120,110,90,255],i*4);
flat.set([175,165,145,255],(10*w+10)*4);const copy=flat.slice();finishMaterialPixels(flat,w,h,'metal');assert.deepEqual(flat,copy);
// Escritura anterior no contamina un lienzo siguiente menor (scratch compartido).
const tiny = new Uint8ClampedArray([90,80,70,255]);finishMaterialPixels(tiny,1,1,'wood');assert.deepEqual([...tiny],[90,80,70,255]);
console.log('material finish ok: alfa y contornos intactos, color acotado, relieve coherente, sin ruido ni seams en bordes');
