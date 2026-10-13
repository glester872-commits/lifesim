import Phaser from 'phaser';
import { PALETTE } from '../config/constants';
import { hashSeed } from '../systems/MetroDaily';
import type { Litter, LitterKind } from '../systems/Litter';
import { make, px, shade } from './paint';

/**
 * La basura de la calle (systems/Litter): objetos pequeños de 4–7 px en el suelo, sin colisión. Una imagen por
 * pieza (como mucho LITTER_CAP) que aparece al caer y se va al recogerla; no hay nada más que simular aquí.
 */
const key = (k: LitterKind): string => `litter-${k}`;

function build(scene: Phaser.Scene): void {
  make(scene, key('paper'), 6, 4, (ctx) => {
    px(ctx, shade('#e6e2d8', -0.35), 0, 0, 6, 4);
    px(ctx, '#e6e2d8', 1, 0, 4, 3);
    px(ctx, shade('#e6e2d8', -0.2), 3, 1, 2, 1);
  });
  make(scene, key('cup'), 4, 5, (ctx) => {
    px(ctx, PALETTE.outline, 0, 0, 4, 5);
    px(ctx, '#e6e2d8', 1, 1, 2, 3);
    px(ctx, '#b8423a', 1, 2, 2, 1);
  });
  make(scene, key('wrapper'), 5, 3, (ctx) => {
    px(ctx, PALETTE.outline, 0, 0, 5, 3);
    px(ctx, '#c9a13a', 1, 0, 3, 2);
    px(ctx, '#b8423a', 2, 1, 1, 1);
  });
  make(scene, key('can'), 4, 6, (ctx) => {
    px(ctx, PALETTE.outline, 0, 0, 4, 6);
    px(ctx, '#9aa4ad', 1, 1, 2, 4);
    px(ctx, '#3f6f9a', 1, 2, 2, 2);
    px(ctx, shade('#9aa4ad', 0.25), 1, 1, 2, 1);
  });
  make(scene, key('takeaway'), 7, 5, (ctx) => {
    px(ctx, PALETTE.outline, 0, 0, 7, 5);
    px(ctx, '#e6e2d8', 1, 1, 5, 3);
    px(ctx, '#7a5a3c', 2, 1, 3, 1);
    px(ctx, shade('#e6e2d8', -0.2), 1, 3, 5, 1);
  });
}

export class LitterView {
  private readonly images = new Map<number, Phaser.GameObjects.Image>();

  private readonly scene: Phaser.Scene;
  private readonly litter: Litter;

  constructor(scene: Phaser.Scene, litter: Litter) {
    this.scene = scene;
    this.litter = litter;
    build(scene);
  }

  sync(): void {
    const live = new Set<number>();
    for (const it of this.litter.items) {
      live.add(it.id);
      if (this.images.has(it.id)) continue;
      // Cada pieza algo descolocada dentro de su tile, siempre igual para la misma.
      const h = hashSeed('litter-view', it.id);
      const x = it.tx * 16 + 8 + ((h % 7) - 3);
      const y = it.ty * 16 + 11 + (((h >>> 4) % 5) - 2);
      const img = this.scene.add.image(x, y, key(it.kind)).setOrigin(0.5, 0.5).setDepth(it.ty * 16 + 4).setFlipX((h & 1) === 1);
      img.setAlpha(0);
      this.scene.tweens.add({ targets: img, alpha: 1, duration: 400 });
      this.images.set(it.id, img);
    }
    for (const [id, img] of this.images) {
      if (live.has(id)) continue;
      img.destroy();
      this.images.delete(id);
    }
  }

  destroy(): void {
    for (const img of this.images.values()) img.destroy();
    this.images.clear();
  }
}
