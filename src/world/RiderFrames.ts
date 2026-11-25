import type { Facing } from '../types/game';

/**
 * BIKE-01 · los fotogramas de la textura del ciclista (world/CyclistArt), sin Phaser ni lienzo para que un check en
 * node los pruebe. Fila 0: perfil (0–3 pedalada, 4 parado). Fila 1: de frente; fila 2: de espaldas; cada una con tres
 * de pedalada y el parado detrás.
 */
export const RIDER_FRAMES = 5;
export const RIDER_STOPPED = 4;
/** Fotogramas de pedalada de frente y de espaldas, y cuántos lleva cada fila (los de pedalada y el parado). */
export const RIDER_VERTICAL_PEDALS = 3;
export const RIDER_VERTICAL_FRAMES = RIDER_VERTICAL_PEDALS + 1;
/** Primer fotograma de la fila de frente (mirando hacia abajo) y de la de espaldas (hacia arriba). */
export const RIDER_FRONT = RIDER_FRAMES;
export const RIDER_BACK = RIDER_FRONT + RIDER_VERTICAL_FRAMES;

/**
 * El fotograma del ciclista mirando a `facing`: `pedal` es el paso de pedalada (entero; de perfil cuenta módulo 4,
 * de frente y de espaldas módulo 3) y `stopped`, con un pie en el suelo. Izquierda y derecha son el perfil (el flip lo
 * pone quien lo muestra).
 */
export function facingFrame(facing: Facing, pedal: number, stopped: boolean): number {
  const p = Math.max(0, Math.floor(pedal));
  if (facing === 'left' || facing === 'right') return stopped ? RIDER_STOPPED : p % 4;
  const row = facing === 'down' ? RIDER_FRONT : RIDER_BACK;
  return row + (stopped ? RIDER_VERTICAL_PEDALS : p % RIDER_VERTICAL_PEDALS);
}
