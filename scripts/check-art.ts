// Acabado de pixel art clásico (Alpha-03): `npm run check`. La rampa de world/paint.ts desplaza el tono (la sombra se
// enfría, la luz se calienta) sin romper el orden de claridad, y la limpieza de huérfanos quita el ruido sin tocar las
// líneas de un píxel, las esquinas ni los bordes. Y el acabado sólo se enciende donde los datos lo piden.
import assert from 'node:assert/strict';
import { despeckle, MATERIAL_RAMPS, materialTone, ramp, shade } from '../src/world/paint.ts';
import { LOCATIONS } from '../src/data/locations.ts';

const rgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hue = (hex: string): number => {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return (h + 360) % 360;
};
const lum = (hex: string): number => {
  const [r, g, b] = rgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
// Cuánto se acerca un tono a otro por el camino corto (grados).
const towards = (from: number, to: number, target: number): number => {
  const before = Math.abs(((target - from + 540) % 360) - 180);
  const after = Math.abs(((target - to + 540) % 360) - 180);
  return before - after;
};

// 1 · La rampa: la sombra gira hacia el frío y la luz hacia el cálido; shade no gira nada.
for (const [name, base] of [['caliza', '#d8c9a8'], ['ladrillo', '#a85a3c'], ['hoja', '#4f7a3a'], ['tejado', '#8c5a44'], ['granito', '#6c7079']] as const) {
  const h0 = hue(base);
  assert.ok(towards(h0, hue(ramp(base, -0.12)), 236) > 4, `${name}: la sombra no se enfría`);
  assert.ok(Math.abs(hue(shade(base, -0.12)) - h0) < 2, `${name}: shade debería mantener el tono (es la referencia)`);
  if (name !== 'granito') assert.ok(towards(h0, hue(ramp(base, 0.08)), 48) > 3, `${name}: la luz no se calienta`);
  // Orden de claridad: más oscuro cuanto más negativo, sin saltos ni inversiones.
  const steps = [-0.2, -0.12, -0.06, 0, 0.06, 0.12].map((k) => lum(ramp(base, k)));
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i] > steps[i - 1], `${name}: la rampa no es monótona en ${i}`);
}
// Sin cambio, el mismo color (±1 por redondeo).
for (const base of ['#d8c9a8', '#4f7a3a', '#808080']) rgb(ramp(base, 0)).forEach((v, i) => assert.ok(Math.abs(v - rgb(base)[i]) <= 1, `${base}: ramp(0) cambia el color`));

// 1b · Rampas por material, a mano: cuatro tonos de oscuro a claro; la sombra más fría que la base y la luz más cálida;
// un tono del material cae siempre en su rampa; un acento (lejos de todo material) se pinta como siempre.
for (const [name, tones] of Object.entries(MATERIAL_RAMPS)) {
  assert.equal(tones.length, 4, `${name}: no son cuatro tonos`);
  for (let i = 1; i < 4; i++) assert.ok(lum(tones[i]) > lum(tones[i - 1]), `${name}: la rampa no va de oscuro a claro en ${i}`);
  const [deep, shadow, base, light] = tones;
  assert.ok(towards(hue(base), hue(shadow), 236) > 0 || towards(hue(base), hue(deep), 236) > 0, `${name}: la sombra no se enfría`);
  assert.ok(towards(hue(base), hue(light), 48) > 0, `${name}: la luz no se calienta`);
  for (const k of [-0.2, -0.1, -0.04, 0, 0.04, 0.1]) assert.ok((tones as readonly string[]).includes(materialTone(base, k)), `${name}: ${k} se sale de su rampa`);
  assert.equal(materialTone(base, -0.3), deep, `${name}: lo más oscuro no es su hondo`);
  assert.equal(materialTone(base, 0.2), light, `${name}: lo más claro no es su luz`);
}
// Acentos y otros materiales que no tienen rampa propia: geranio, contraventanas, luz de ventana y la madera de la puerta
// (con un umbral más ancho, la puerta de Olmo 11 cogía la rampa de la teja y salía rosa).
for (const accent of ['#c8323a', '#3f6f78', '#6e5038', '#f0b46a', '#7b5a3d']) assert.equal(materialTone(accent, -0.1), shade(accent, -0.1), `${accent}: un acento no debe cambiar`);

// 2 · Limpieza de huérfanos.
const W = 9;
const H = 7;
const canvas = (fill: [number, number, number]): Uint8ClampedArray => {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) d.set([...fill, 255], i * 4);
  return d;
};
const put = (d: Uint8ClampedArray, x: number, y: number, c: [number, number, number, number?]): void => d.set([c[0], c[1], c[2], c[3] ?? 255], (y * W + x) * 4);
const get = (d: Uint8ClampedArray, x: number, y: number): string => [...d.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)].join(',');
{
  const d = canvas([200, 190, 170]);
  put(d, 2, 2, [90, 80, 70]); // huérfano: se va
  for (let x = 4; x < 8; x++) put(d, x, 4, [40, 30, 50]); // línea de un píxel: se queda
  put(d, 6, 1, [40, 30, 50]); // esquina: dos píxeles en L, se queda
  put(d, 7, 1, [40, 30, 50]);
  put(d, 6, 2, [40, 30, 50]);
  const cleaned = despeckle(d, W, H);
  assert.equal(cleaned, 1, `limpia ${cleaned}, no sólo el huérfano`);
  assert.equal(get(d, 2, 2), '200,190,170,255', 'el huérfano sigue');
  for (let x = 4; x < 8; x++) assert.equal(get(d, x, 4), '40,30,50,255', `la línea pierde el píxel ${x}`);
  assert.equal(get(d, 6, 1), '40,30,50,255', 'la esquina pierde un píxel');
  assert.equal(get(d, 6, 2), '40,30,50,255', 'la esquina pierde un píxel');
}
{
  // Un píxel junto a lo transparente (un borde, un hueco) no se toca: no es ruido, es silueta.
  const d = canvas([200, 190, 170]);
  put(d, 3, 3, [90, 80, 70]);
  put(d, 3, 2, [0, 0, 0, 0]);
  assert.equal(despeckle(d, W, H), 0, 'toca un píxel de borde');
  // Los bordes de la textura no se miran (no tienen cuatro vecinos).
  const e = canvas([200, 190, 170]);
  put(e, 0, 3, [90, 80, 70]);
  assert.equal(despeckle(e, W, H), 0, 'toca el borde de la textura');
}

// 3 · El acabado sólo donde los datos lo piden: el piloto (la calle residencial de Vallesco), nada más.
const classic = LOCATIONS.flatMap((l) => (l.buildings ?? []).filter((b) => b.art === 'clasico').map((b) => `${l.id}/${b.id}`));
assert.deepEqual(classic.sort(), ['district/home-door', 'district/res-olmo-11'], `acabado clásico fuera del piloto: ${classic.join(', ')}`);

console.log('check-art: OK (rampa con desplazamiento de tono y monótona, limpieza de huérfanos sin tocar líneas ni bordes, piloto acotado)');
