/**
 * Luz de forma sobre un sprite ya pintado: sólo cambia el color de los
 * píxeles opacos, nunca el alfa. La silueta sale idéntica por construcción
 * (lo comprueba scripts/check-shading.ts).
 *
 * Luz del noroeste, como el resto del mundo (design/ART_BIBLE.md):
 *  - el canto de arriba y el de la izquierda reciben un toque cálido;
 *  - el canto de la derecha cae en sombra fría, y algo menos el píxel de dentro;
 *  - bajo un cambio de material ancho (pelo sobre frente, cabeza sobre cuello,
 *    camiseta sobre pantalón) el de abajo, si es más claro, recibe sombra;
 *  - las últimas filas se oscurecen un poco: oclusión contra el suelo.
 *
 * La sombra arrojada pide 3 px de borde seguido: los ojos y los botones de
 * 1 px no ensucian la cara. Corre una vez por pose al hornear el atlas de
 * gente (decenas de miles), así que va sobre arrays planos, sin cierres.
 */
export interface ShadeOptions {
  /** Filas de abajo que se oscurecen contra el suelo (0: ninguna). */
  groundRows?: number;
  /** Intensidad global: 1 = personas. */
  strength?: number;
}

// Memoria de trabajo compartida entre llamadas: se agranda si llega un lienzo mayor.
let solid = new Uint8Array(0);
let luma = new Float32Array(0);
let src = new Uint8ClampedArray(0);

export function shadeForm(d: Uint8ClampedArray, w: number, h: number, opts?: ShadeOptions): void {
  const k = opts?.strength ?? 1;
  const groundRows = opts?.groundRows ?? 3;
  const n = w * h;
  // Máscara con un marco de un píxel: fuera del lienzo cuenta como vacío sin comprobar bordes.
  const W = w + 2;
  if (solid.length < W * (h + 2)) solid = new Uint8Array(W * (h + 2));
  else solid.fill(0, 0, W * (h + 2));
  if (luma.length < n) {
    luma = new Float32Array(n);
    src = new Uint8ClampedArray(n * 3);
  }
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    src[i * 3] = d[p];
    src[i * 3 + 1] = d[p + 1];
    src[i * 3 + 2] = d[p + 2];
    luma[i] = d[p] * 0.3 + d[p + 1] * 0.59 + d[p + 2] * 0.11;
    if (d[p + 3] > 0) solid[((i / w) | 0) * W + W + (i % w) + 1] = 1;
  }
  // ¿El de arriba es otro material, más oscuro? (pelo sobre frente, cabeza sobre cuello) En la
  // misma rejilla con marco: el marco queda a 0, así que el vecino de fuera del lienzo no cuenta.
  for (let y = 1; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const m = (y + 1) * W + x + 1;
      if (solid[m] && solid[m - W] && luma[y * w + x] - luma[(y - 1) * w + x] > 28) solid[m] = 2;
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const m = (y + 1) * W + x + 1;
      if (!solid[m]) continue;
      let f = 0;
      if (!solid[m + 1]) f -= 0.16;
      else if (x + 2 >= w || !solid[m + 2]) f -= 0.06;
      if (!solid[m - 1]) f += 0.07;
      if (!solid[m - W]) f += 0.1;
      if (solid[m - 1] === 2 && solid[m] === 2 && solid[m + 1] === 2) f -= 0.12;
      if (groundRows > 0 && y >= h - groundRows) f -= 0.05 * (y - (h - groundRows) + 1);
      f *= k;
      if (f === 0) continue;
      const i = y * w + x;
      const p = i * 4;
      const r = src[i * 3];
      const g = src[i * 3 + 1];
      const b = src[i * 3 + 2];
      if (f < 0) {
        // Sombra algo fría: el azul baja menos.
        d[p] = r * (1 + f * 1.1);
        d[p + 1] = g * (1 + f);
        d[p + 2] = b * (1 + f * 0.7);
      } else {
        // Luz algo cálida: el azul sube menos.
        d[p] = r + (255 - r) * f;
        d[p + 1] = g + (255 - g) * f * 0.9;
        d[p + 2] = b + (255 - b) * f * 0.6;
      }
    }
  }
}
