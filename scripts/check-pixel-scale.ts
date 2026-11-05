// Escala de píxel entera (world/PixelScale, HD-03): en cualquier pantalla un píxel del mundo mide un número entero de
// píxeles físicos, el más cercano al encuadre de diseño (VIEW_WIDTH × VIEW_HEIGHT), y la resolución del arte no cambia. `node scripts/check-pixel-scale.ts`.
import assert from 'node:assert/strict';
import { CAMERA_ZOOM, MAX_CAMERA_ZOOM, VIEW_HEIGHT, VIEW_WIDTH, WIDEST_VIEW, ZOOM_FINE, ZOOM_STEPS_IN } from '../src/config/constants.ts';
import { clampZoomStep, playerZoom, pixelZoom, zoomRange } from '../src/world/PixelScale.ts';

// Pantallas en píxeles físicos (CSS × devicePixelRatio).
const screens: Record<string, [number, number, number]> = {
  'portátil 1366 × 768': [1366, 768, 2],
  'Full HD': [1920, 1080, 3],
  'Full HD al 125 %': [Math.round(1536 * 1.25), Math.round(864 * 1.25), 3],
  '1440p': [2560, 1440, 4],
  'MacBook 2560 × 1600': [2560, 1600, 4],
  '4K': [3840, 2160, 5],
  '4K al 150 %': [Math.round(2560 * 1.5), Math.round(1440 * 1.5), 5],
  '5K': [5120, 2880, 7],
  'móvil de pie 390 × 844 a 3×': [1170, 2532, 3],
  'móvil tumbado 844 × 390 a 3×': [2532, 1170, 3],
  'tableta 820 × 1180 a 2×': [1640, 2360, 4],
  'ventana de revisión 1100 × 680': [1100, 680, 2],
  'móvil de pie 390 × 844 a 2×': [780, 1688, 2],
};
for (const [name, [w, h, expected]] of Object.entries(screens)) {
  const z = pixelZoom(w, h);
  assert.ok(Number.isInteger(z), `${name}: zoom ${z} no es entero`);
  assert.equal(z, expected, `${name}: zoom ${z}, esperado ${expected}`);
  const [long, short] = w >= h ? [w, h] : [h, w];
  // A menos de medio paso del encaje de diseño: la gente mide en pantalla lo más parecido a lo diseñado.
  const fit = Math.min(long / VIEW_WIDTH, short / VIEW_HEIGHT);
  if (z > CAMERA_ZOOM && z < MAX_CAMERA_ZOOM) assert.ok(Math.abs(z - fit) <= 0.5, `${name}: zoom ${z} a más de medio paso de ${fit.toFixed(2)}`);
}
// Barrido: de 320 a 8000 px físicos, siempre entero, dentro de los límites y monótono con el tamaño.
let last = 0;
for (let w = 320; w <= 8000; w += 7) {
  const z = pixelZoom(w, Math.round(w * 9 / 16));
  assert.ok(Number.isInteger(z) && z >= CAMERA_ZOOM && z <= MAX_CAMERA_ZOOM, `${w}: ${z}`);
  assert.ok(z >= last, `${w}: el zoom baja al crecer la pantalla`);
  last = z;
}
// WIDEST_VIEW cubre toda vista: escritorios de 16:9 a 32:9 y móviles de 16:9 a 20:9, de pie y tumbados.
let widest = [0, 0];
const view = (w: number, h: number): void => {
  const z = pixelZoom(w, h);
  widest = [Math.max(widest[0], w / z), Math.max(widest[1], h / z)];
  assert.ok(w / z <= WIDEST_VIEW.width && h / z <= WIDEST_VIEW.height, `${w} × ${h}: se ven ${w / z} × ${h / z} px, más que WIDEST_VIEW`);
};
for (const r of [16 / 9, 16 / 10, 64 / 27, 32 / 9]) for (let h = 600; h <= 2880; h++) view(Math.round(h * r), h);
for (const r of [16 / 9, 2, 2.167, 20 / 9]) for (let css = 360; css <= 440; css++) for (const dpr of [2, 2.625, 2.75, 3]) {
  const [w, h] = [Math.round(css * dpr), Math.round(css * r * dpr)];
  view(w, h);
  view(h, w);
}
// Zoom del jugador (playerZoom/zoomRange): paso 0 = pixelZoom, max = base + ZOOM_STEPS_IN, min respeta WIDEST_VIEW; entero salvo el paso fino.
for (const [name, [w, h]] of Object.entries(screens)) {
  const { min, max, base } = zoomRange(w, h);
  assert.equal(playerZoom(w, h, 0), pixelZoom(w, h), `${name}: paso 0 distinto de pixelZoom`);
  assert.equal(max, Math.min(MAX_CAMERA_ZOOM, base + ZOOM_STEPS_IN), `${name}: max`);
  assert.ok(Number.isInteger(min) && min >= CAMERA_ZOOM && min <= base, `${name}: min ${min}`);
  assert.ok(min === CAMERA_ZOOM || w / (min - 1) > WIDEST_VIEW.width || h / (min - 1) > WIDEST_VIEW.height, `${name}: min no es el menor`);
  assert.ok(w / min <= WIDEST_VIEW.width || min === base, `${name}: alejar al min enseña más que WIDEST_VIEW`);
  assert.ok(h / min <= WIDEST_VIEW.height || min === base, `${name}: alejar al min enseña más de alto que WIDEST_VIEW`);
  // Todo entero salvo el primer paso al acercar, que es base × ZOOM_FINE; y siempre creciente.
  let prev = 0;
  for (let s = -6; s <= 6; s++) {
    const z = playerZoom(w, h, s);
    const fine = clampZoomStep(w, h, s) === 1 && base < max;
    assert.ok(z >= min && z <= max && z >= prev, `${name}: paso ${s} da ${z}`);
    assert.ok(fine ? Math.abs(z - base * ZOOM_FINE) < 1e-9 : Number.isInteger(z), `${name}: paso ${s} da ${z} (¿fino?)`);
    prev = z;
  }
  if (base < max) assert.ok(base * ZOOM_FINE > base * 1.08 - 1e-9 && base * ZOOM_FINE < base * 1.12 + 1e-9, `${name}: el paso fino no es +8–12 %`);
  // Control positivo: sin el clamp, un paso enorme daría base + 99 y esto fallaría.
  assert.equal(playerZoom(w, h, 99), max, `${name}: el paso 99 no se recorta`);
  assert.equal(playerZoom(w, h, -99), min, `${name}: el paso -99 no se recorta`);
}
// 390 × 844 a 3×: alejar a 2 enseñaría 1266 de alto > 1125, así que el mínimo es 3.
assert.equal(zoomRange(1170, 2532).min, 3);
assert.equal(playerZoom(1170, 2532, -1), 3);
assert.ok(Math.abs(playerZoom(1170, 2532, 1) - 3.3) < 1e-9);
assert.equal(playerZoom(1170, 2532, 2), 4);
console.log('check-pixel-scale: OK — vista más grande', widest.map(Math.ceil).join(' × '), '·', Object.entries(screens).map(([n, [w, h]]) => `${n} ×${pixelZoom(w, h)}`).join(' · '));
