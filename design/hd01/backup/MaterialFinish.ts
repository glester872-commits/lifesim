/**
 * Relieve de las uniones que YA existen en un material. No escala ni crea geometría:
 * conserva todo el alfa, los contornos y los detalles de un píxel. Sólo actúa en
 * fronteras interiores continuas de tres píxeles; no añade grano, halos ni ruido.
 * Se ejecuta al hornear texturas seleccionadas, nunca en update ni sobre personas.
 */
export type MaterialFinish = 'masonry' | 'wood' | 'metal';
const DEPTH: Readonly<Record<MaterialFinish, number>> = { masonry: 5, wood: 7, metal: 10 };
let source = new Uint8ClampedArray(0);
let luminance = new Float32Array(0);

export function finishMaterialPixels(data: Uint8ClampedArray, w: number, h: number, kind: MaterialFinish): void {
  if (w < 3 || h < 3 || data.length !== w * h * 4) return;
  const count = w * h;
  if (source.length < data.length) source = new Uint8ClampedArray(data.length);
  if (luminance.length < count) luminance = new Float32Array(count);
  source.set(data);
  for (let i = 0; i < count; i++) luminance[i] = (source[i * 4] * 3 + source[i * 4 + 1] * 6 + source[i * 4 + 2]) / 10;
  const depth = DEPTH[kind];
  // El borde de la textura no es una junta: evita seams al repetir tiles.
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const value = luminance[i];
    // Proteger sombra, tinta y luces; no reforzar contornos ni señales emisivas.
    if (source[i * 4 + 3] !== 255 || value < 38 || value > 232) continue;
    let amount = 0;
    for (let direction = 0; direction < 4; direction++) {
      const offset = direction === 0 ? -w : direction === 1 ? -1 : direction === 2 ? w : 1;
      const tangent = direction % 2 === 0 ? 1 : w;
      const j = i + offset;
      if (source[j * 4 + 3] !== 255) continue;
      const difference = value - luminance[j];
      if (Math.abs(difference) < 18) continue;
      // Tres pares contiguos del mismo material; una mota o una letra no es una unión.
      let continuous = true;
      for (const side of [-tangent, tangent]) {
        if (source[(i + side) * 4 + 3] !== 255 || source[(j + side) * 4 + 3] !== 255 ||
          Math.abs(value - luminance[i + side]) > 12 || Math.abs(luminance[j] - luminance[j + side]) > 12) { continuous = false; break; }
      }
      if (!continuous) continue;
      const facing = direction < 2 ? 1 : -1;
      amount += facing * Math.sign(difference) * depth;
    }
    const shift = Math.max(-depth, Math.min(depth, amount));
    if (!shift) continue;
    // Mismo desplazamiento RGB: tono derivado del original, sin otra paleta.
    for (let c = 0; c < 3; c++) data[i * 4 + c] = source[i * 4 + c] + shift;
  }
}
