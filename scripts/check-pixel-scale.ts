// Escala de píxel entera (world/PixelScale, HD-03): en cualquier pantalla un píxel del mundo mide un número entero de
// píxeles físicos, el más cercano al encuadre de diseño (VIEW_WIDTH × VIEW_HEIGHT), y la resolución del arte no cambia. `node scripts/check-pixel-scale.ts`.
import assert from 'node:assert/strict';
import { CAMERA_ZOOM, MAX_CAMERA_ZOOM, VIEW_HEIGHT, VIEW_WIDTH } from '../src/config/constants.ts';
import { pixelZoom } from '../src/world/PixelScale.ts';

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
console.log('check-pixel-scale: OK —', Object.entries(screens).map(([n, [w, h]]) => `${n} ×${pixelZoom(w, h)}`).join(' · '));
