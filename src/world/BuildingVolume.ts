import Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import type { BuildingDef } from '../types/game';
import { volumeGeometry } from './BuildingProjection';
import { bakeBuildings, buildingWallColor, type GlowSpot, type WindowSpot } from './BuildingArt';
import { standing } from './Layers';
import { LightDepth } from './LightDepth';
import { make, px, shade } from './paint';

/** Opt-in data only; the rest of the city still uses the ground baker. */
export function addBuildingVolume(scene: Phaser.Scene, b: BuildingDef, glows: GlowSpot[]): WindowSpot[] {
  const geo = volumeGeometry(b);
  const { width, height, roof, rise, skew, groundTop, upper, projectY } = geo;
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const ctx = source.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable for building volume');
  ctx.imageSmoothingEnabled = false;
  const glowStart = glows.length;
  const windows = bakeBuildings({
    scene,
    batchDraw(key, x, y) {
      const f = scene.textures.getFrame(key);
      ctx.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, x - b.tx * TILE, y - b.ty * TILE, f.cutWidth, f.cutHeight);
    },
  }, [b], glows);
  const key = `volume-${b.id}-${rise}-${skew}`;
  make(scene, key, width + skew, height + rise, (out) => {
    // East wall: cooler and darker than the sunlit front, drawn behind roof and facade.
    if (b.volume?.side) {
      const wall = buildingWallColor(b);
      for (let x = 0; x <= skew; x++) {
        const top = Math.round(roof * (1 - x / Math.max(1, skew)));
        const wallHeight = height + rise - roof;
        px(out, shade(wall, -0.23), width + x, top, 1, wallHeight);
        // Masonry courses follow the same projection, with no repeated checker pattern.
        for (let y = top + 10; y < top + wallHeight; y += 12) px(out, shade(wall, -0.3), width + x, y, 1, 1);
      }
    }
    for (let y = 0; y < roof; y++) {
      const offset = Math.round(skew * (1 - y / Math.max(1, roof - 1)));
      out.drawImage(source, 0, y, width, 1, offset, y, width, 1);
    }
    // Raise the upper storeys using nearest scanlines; preserve the entire lower storey 1:1.
    for (let y = roof; y < groundTop + rise; y++) {
      const sy = roof + Math.min(upper - 1, Math.floor((y - roof) * upper / (upper + rise)));
      out.drawImage(source, 0, sy, width, 1, 0, y, width, 1);
    }
    out.drawImage(source, 0, groundTop, width, height - groundTop, 0, groundTop + rise, width, height - groundTop);
    // Cornice, corner return and ambient contact under the roof. All stay on the pixel grid.
    px(out, shade(PALETTE.wallLit, 0.12), 0, roof, width, 1);
    px(out, shade(PALETTE.ink, 0.05), 0, roof + 1, width, 2);
    px(out, shade(PALETTE.wallLit, -0.06), width - 1, roof + 3, 1, height + rise - roof - 3);
  });
  const img = scene.add.image(b.tx * TILE + (width + skew) / 2, (b.ty + b.h) * TILE, key)
    .setOrigin(0.5, 1).setDepth(standing((b.ty + b.h) * TILE)).setName(`volume:${b.id}`);
  img.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  // Cache the real silhouette once, so the empty corners of the oblique roof never trigger fading.
  const texture = scene.textures.get(key) as Phaser.Textures.CanvasTexture;
  img.setData('occlusionMask', texture.getContext().getImageData(0, 0, img.width, img.height).data);
  LightDepth.of(scene).occluder(img);
  for (const g of glows.slice(glowStart)) g.depth = img.depth;
  return windows.map((w) => {
    const y = projectY(w.y - b.ty * TILE);
    const bottom = projectY(w.y + w.h - b.ty * TILE);
    return { ...w, y: b.ty * TILE + y, h: bottom - y, depth: img.depth, volume: img.name };
  });
}
