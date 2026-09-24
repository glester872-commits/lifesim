import Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { LocationDef } from '../types/game';
import { PROPS, TILES, variantKey } from './tiles';
import { solidMask } from '../systems/LocationSystem';
import { bakeBuildings } from './BuildingArt';

export interface BuiltLocation {
  widthPx: number;
  heightPx: number;
  solids: Phaser.Physics.Arcade.StaticGroup;
}

function addSolid(
  scene: Phaser.Scene,
  solids: Phaser.Physics.Arcade.StaticGroup,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const zone = scene.add.zone(x, y, w, h).setOrigin(0, 0);
  solids.add(zone);
  (zone.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
}

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Rectángulos que cubren exactamente los tiles sólidos: tramos horizontales de
 * cada fila que se alargan hacia abajo mientras la fila siguiente repita el
 * mismo tramo. Menos cuerpos y menos juntas en las que engancharse al rozar.
 */
export function solidRects(mask: readonly (readonly boolean[])[]): Rect[] {
  const done: Rect[] = [];
  let open = new Map<string, Rect>();
  for (let y = 0; y <= mask.length; y++) {
    const row = mask[y] ?? [];
    const next = new Map<string, Rect>();
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      const start = x;
      while (x + 1 < row.length && row[x + 1]) x++;
      const key = `${start},${x - start + 1}`;
      const rect = open.get(key);
      if (rect) {
        rect.h += 1;
        open.delete(key);
        next.set(key, rect);
      } else next.set(key, { x: start, y, w: x - start + 1, h: 1 });
    }
    for (const rect of open.values()) done.push(rect);
    open = next;
  }
  return done;
}

/**
 * Construye una localización a partir de sus datos: hornea suelo y edificios
 * en una sola RenderTexture, coloca los props ordenados por Y y genera los
 * cuerpos de colisión desde solidMask, la misma regla que valida el mundo.
 */
export function buildLocation(scene: Phaser.Scene, def: LocationDef): BuiltLocation {
  const cols = def.ground[0].length;
  const rows = def.ground.length;
  const widthPx = cols * TILE;
  const heightPx = rows * TILE;

  const ground = scene.add.renderTexture(0, 0, widthPx, heightPx).setOrigin(0, 0).setDepth(-10);
  const solids = scene.physics.add.staticGroup();

  ground.beginDraw();
  for (let ty = 0; ty < rows; ty++) {
    const row = def.ground[ty];
    for (let tx = 0; tx < cols; tx++) {
      const tile = TILES[row[tx]];
      if (tile) ground.batchDraw(variantKey(tile, tx, ty), tx * TILE, ty * TILE);
    }
  }
  bakeBuildings(ground, def.buildings ?? []);
  ground.endDraw();

  for (const placement of def.props) {
    const prop = PROPS[placement.kind];
    const width = (prop.tilesWide ?? 1) * TILE;
    const baseY = placement.ty * TILE + TILE;
    scene.add.image(placement.tx * TILE + width / 2, baseY, prop.key).setOrigin(0.5, 1).setDepth(baseY);
  }

  for (const r of solidRects(solidMask(def))) addSolid(scene, solids, r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE);

  return { widthPx, heightPx, solids };
}
