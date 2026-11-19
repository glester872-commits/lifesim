import { TILE } from '../config/constants.ts';
import type { BuildingDef } from '../types/game.ts';
import { facadeRows } from '../systems/LocationSystem.ts';

/** Proyección visual en píxeles enteros; la planta baja y la puerta conservan su posición. */
export function volumeGeometry(b: BuildingDef) {
  const width = b.w * TILE;
  const height = b.h * TILE;
  const facade = facadeRows(b) * TILE;
  const roof = height - facade;
  const rise = Math.max(0, Math.round(b.volume?.rise ?? 0));
  const skew = Math.max(0, Math.round(b.volume?.skew ?? 0));
  const groundTop = height - TILE * 2;
  const upper = groundTop - roof;
  if (b.front !== 's' || upper <= 0 || roof <= 0) throw new Error(`Volumen no compatible: ${b.id} necesita cubierta y dos o más plantas al sur`);
  const projectY = (y: number): number => y >= groundTop ? y : y < roof ? y - rise : roof - rise + Math.round((y - roof) * (upper + rise) / upper);
  return { width, height, roof, rise, skew, groundTop, upper, projectY };
}
