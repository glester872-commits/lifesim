import type Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { LocationDef } from '../types/game';
import { make, type Ctx } from './paint';

/**
 * Arte a doble densidad para la escena de muestra (LocationDef.showcase,
 * design/ART_BIBLE §16). Cada cosa mide lo mismo en el mundo, pero se dibuja
 * con el doble de píxeles por lado y se pone a media escala: más detalle sin
 * cambiar la escala ni el suelo que pisa. Fuera de la escena, el arte de siempre.
 *
 * Una textura HD se llama como la normal con «@hd» detrás; quien la pinta mira
 * hasHD() y, si la hay, la usa con setScale(1 / HD).
 */
export const HD = 2;

const registered = new Set<string>();

export const hdKey = (key: string): string => `${key}@hd`;
export const hasHD = (key: string): boolean => registered.has(key);

/** Hace la versión HD de `key`: `w` × `h` son px del mundo; se dibuja en `w·HD` × `h·HD`. */
export function makeHD(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx) => void): void {
  make(scene, hdKey(key), w * HD, h * HD, draw);
  registered.add(key);
}

/** Si el punto (px de mundo) cae en la escena de muestra. */
export function inShowcase(def: LocationDef, x: number, y: number): boolean {
  const s = def.showcase;
  return !!s && x >= s.tx * TILE && x < (s.tx + s.w) * TILE && y >= s.ty * TILE && y < (s.ty + s.h) * TILE;
}
