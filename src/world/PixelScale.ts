import { CAMERA_ZOOM, MAX_CAMERA_ZOOM, VIEW_HEIGHT, VIEW_WIDTH, WIDEST_VIEW, ZOOM_FINE, ZOOM_STEPS_IN } from '../config/constants.ts';

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
 *   1366 × 768 → 2 · 1920 × 1080 → 3 · 2560 × 1440 → 4 · 3840 × 2160 → 5
 *   móvil 390 × 844 a 2× → 2 · a 3× → 3
 *
 * Móvil: 1 px de CSS por píxel de mundo (zoom 2 a DPR 2, 3 a DPR 3). Acercar un
 * 8–12 % pediría 2,2 / 3,3 px físicos por píxel de mundo: un zoom no entero
 * rompe esta regla (píxeles de 3 y 4 px alternos, temblor al andar, Phaser
 * apaga renderRoundPixels), y el entero siguiente ya es +33 % / +50 %. Se
 * mantiene el actual: el espacio para el mundo en móvil se gana quitando
 * superficie al HUD y a los botones (barra de una línea, fila de iconos), no
 * con la cámara por defecto. El jugador puede acercar (playerZoom): el primer
 * paso es fino, ZOOM_FINE (×1,1), y ése SÍ es fraccionario: decisión del
 * usuario (ALPHA-09) aceptando que en él el arte tiemble algo al andar. Los
 * demás pasos son enteros. Puntos de ajuste: CAMERA_ZOOM, ZOOM_STEPS_IN y
 * ZOOM_FINE (config/constants).
 */
export function pixelZoom(width: number, height: number): number {
  const [long, short] = width >= height ? [width, height] : [height, width];
  const fit = Math.min(long / VIEW_WIDTH, short / VIEW_HEIGHT);
  return Math.max(CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, Math.round(fit)));
}

/**
 * Hasta dónde puede mover el zoom el jugador, siempre en enteros. Acercar: ZOOM_STEPS_IN pasos. Alejar: sólo mientras
 * lo que se ve siga dentro de WIDEST_VIEW (lo que se pinta alrededor de un sitio pequeño no llega más lejos); nunca
 * por encima de `base`.
 */
export function zoomRange(width: number, height: number): { min: number; max: number; base: number } {
  const base = pixelZoom(width, height);
  let min = CAMERA_ZOOM;
  while (min < base && (width / min > WIDEST_VIEW.width || height / min > WIDEST_VIEW.height)) min++;
  return { min, max: Math.min(MAX_CAMERA_ZOOM, base + ZOOM_STEPS_IN), base };
}

/**
 * Los niveles que recorre el jugador: enteros de min a base, el paso fino base × ZOOM_FINE (si cae por debajo del
 * siguiente entero) y enteros hasta max. `step` es la posición respecto a base (0 = el zoom de siempre).
 */
export function zoomLevels(width: number, height: number): { levels: number[]; baseIndex: number } {
  const { min, max, base } = zoomRange(width, height);
  const levels: number[] = [];
  for (let z = min; z <= max; z++) {
    levels.push(z);
    if (z === base && base * ZOOM_FINE < Math.min(base + 1, max) && ZOOM_FINE > 1) levels.push(base * ZOOM_FINE);
  }
  return { levels, baseIndex: levels.indexOf(base) };
}

/** `step` recortado a los niveles de esta pantalla. */
export function clampZoomStep(width: number, height: number, step: number): number {
  const { levels, baseIndex } = zoomLevels(width, height);
  return Math.max(-baseIndex, Math.min(levels.length - 1 - baseIndex, Math.trunc(step)));
}

/** El zoom de la pantalla movido `step` niveles por el jugador (zoomLevels), recortado. */
export function playerZoom(width: number, height: number, step: number): number {
  const { levels, baseIndex } = zoomLevels(width, height);
  return levels[baseIndex + clampZoomStep(width, height, step)];
}
