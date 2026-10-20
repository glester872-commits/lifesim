import { CAMERA_ZOOM, MAX_CAMERA_ZOOM, VIEW_HEIGHT, VIEW_WIDTH } from '../config/constants.ts';

/**
 * Escala de píxel (HD-03): cuántos píxeles físicos mide un píxel del mundo.
 *
 * El mundo se dibuja siempre a su resolución nativa (16 px por tile, sprites a
 * su tamaño); una pantalla Full HD, 1440p o 4K sólo cambia cuántos píxeles
 * físicos le tocan a cada píxel del mundo, nunca la resolución del arte. Y ese
 * número es entero: con 2,5 o 5,5 un píxel de arte ocupaba 2 o 3 (5 o 6)
 * píxeles alternos, temblaba al caminar, y Phaser apagaba además el redondeo
 * de posiciones (Camera.renderRoundPixels sólo vale con zoom entero).
 *
 * El entero es el más cercano al que encaja VIEW_WIDTH × VIEW_HEIGHT de mundo
 * (en vertical, girado): la gente mide en pantalla lo más parecido posible a lo
 * diseñado, nunca más de medio paso de diferencia. Lo mismo en todos los
 * sitios: cruzar una puerta no cambia el tamaño de nadie.
 *
 *   1366 × 768 → 3 · 1920 × 1080 → 4 · 2560 × 1440 → 5 · 3840 × 2160 → 8
 *   móvil 390 × 844 a 2× → 3 · a 3× → 4
 */
export function pixelZoom(width: number, height: number): number {
  const [long, short] = width >= height ? [width, height] : [height, width];
  const fit = Math.min(long / VIEW_WIDTH, short / VIEW_HEIGHT);
  return Math.max(CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, Math.round(fit)));
}
