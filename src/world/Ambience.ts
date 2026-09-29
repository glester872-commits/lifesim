import Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { LocationDef, Vec2 } from '../types/game';
import { PROPS } from './tiles';
import { doorRow, STOREY_ROWS } from '../systems/LocationSystem';
import { gust } from './Motion';

/**
 * Lo poco que se mueve solo en un sitio y no es gente ni tráfico: el agua de
 * una fuente y las puertas de cristal que se abren al acercarse. Todo sale de
 * los datos (PropDef.ambient, puertas de cristal con interior); no hay ni una
 * comprobación de localización. El tráfico es de systems/Traffic.ts.
 */

const DOOR_RANGE = TILE * 1.6;

interface AutoDoor {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  open: boolean;
}

export class Ambience {
  private readonly scene: Phaser.Scene;
  /** Pies de quien anda por aquí: las puertas se abren para cualquiera. */
  private readonly pedestrians: () => readonly Vec2[];
  private readonly doors: AutoDoor[] = [];
  /** Árboles con fotograma de racha: la copa se mece cuando pasa el viento. */
  private readonly trees: { img: Phaser.GameObjects.Image; still: string; windy: string }[] = [];

  constructor(scene: Phaser.Scene, def: LocationDef, pedestrians: () => readonly Vec2[]) {
    this.scene = scene;
    this.pedestrians = pedestrians;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    // Copas: cada árbol ya colocado que tenga fotograma de racha. Con movimiento reducido, quietos.
    if (!calm) {
      for (const o of scene.children.list) {
        if (!(o instanceof Phaser.GameObjects.Image)) continue;
        const key = o.texture.key;
        if (/^prop-(plane-|bed-)?tree-\d+$/.test(key) && scene.textures.exists(`${key}-gust`)) this.trees.push({ img: o, still: key, windy: `${key}-gust` });
      }
    }

    // El agua: un chorro que respira despacio. Con movimiento reducido, quieto.
    for (const p of def.props) {
      const prop = PROPS[p.kind];
      if (prop.ambient !== 'spray') continue;
      const x = p.tx * TILE + ((prop.tilesWide ?? 1) * TILE) / 2;
      const y = (p.ty + 1 - prop.tilesHigh) * TILE + 6;
      const spray = scene.add.image(x, y, 'fx-spray').setOrigin(0.5, 1).setDepth((p.ty + 1) * TILE + 1);
      if (!calm) {
        scene.tweens.add({ targets: spray, scaleY: { from: 0.75, to: 1.2 }, alpha: { from: 0.7, to: 1 }, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    }

    // Puertas de cristal con interior: se abren cuando alguien llega a ellas.
    for (const b of def.buildings ?? []) {
      if (!b.enter || b.doorX === undefined || !scene.textures.exists(`bs-${b.style}-door-open`)) continue;
      const row = doorRow(b);
      // Al sur, la puerta es de planta entera (dos filas): la abierta, también.
      const tall = b.front === 's' && scene.textures.exists(`bs-${b.style}-door-open-t`);
      const sprite = scene.add
        .image(b.doorX * TILE, (tall ? row - (STOREY_ROWS - 1) : row) * TILE, `bs-${b.style}-door-open${tall ? '-t' : ''}`)
        .setOrigin(0, 0)
        .setDepth(-9)
        .setAlpha(0);
      this.doors.push({ sprite, x: b.doorX * TILE + TILE / 2, y: (row + 1) * TILE, open: false });
    }
  }

  update(): void {
    const now = this.scene.time.now;
    for (const t of this.trees) {
      const key = gust(now, t.img.x) ? t.windy : t.still;
      if (t.img.texture.key !== key) t.img.setTexture(key);
    }
    if (this.doors.length === 0) return;
    const people = this.pedestrians();
    for (const door of this.doors) {
      const near = people.some((p) => Math.abs(p.x - door.x) < DOOR_RANGE && Math.abs(p.y - door.y) < DOOR_RANGE);
      if (near === door.open) continue;
      door.open = near;
      this.scene.tweens.killTweensOf(door.sprite);
      // Abrir responde rápido; cerrar se toma su tiempo.
      this.scene.tweens.add({ targets: door.sprite, alpha: near ? 1 : 0, duration: near ? 140 : 260, ease: near ? 'Cubic.easeOut' : 'Sine.easeInOut' });
    }
  }
}
