import Phaser from 'phaser';
import type { LocationDef } from '../types/game';
import { LAYER } from './Layers';
import { nightAt } from './Lighting';
import { make, px, type Ctx } from './paint';

/**
 * Guirnaldas de bombillas entre farolas (LocationDef.garlands): de día, un
 * cable con bolitas apagadas por encima de la gente; de noche, las bombillas
 * encendidas con su halo. El cable cuelga en catenaria (más caído en el
 * centro) y cada bombilla tiene su tono. Una imagen de cable y una de luz por
 * guirnalda, sin partículas: cuesta lo mismo de día que de noche.
 */

const BULBS = ['#ffe9b8', '#ffd58a', '#ffc27a', '#ffb0a0'] as const;
/** Por encima de la sombra de la hora: lo que brilla no se apaga con la noche. */
const GLOW_DEPTH = 900_001;
const BULB_EVERY = 11;

type Garland = NonNullable<LocationDef['garlands']>[number];

/** Dónde cae el cable en la columna x (0 … w-1): una catenaria entre los dos extremos. */
const dip = (g: Garland, x: number, w: number): number => {
  const t = w <= 1 ? 0 : x / (w - 1);
  return Math.round(4 * g.sag * t * (1 - t));
};

function drawWire(ctx: Ctx, g: Garland, w: number): void {
  for (let x = 0; x < w; x++) px(ctx, '#2a2830', x, 1 + dip(g, x, w), 1, 1);
  for (let x = 3; x < w - 2; x += BULB_EVERY) {
    const y = 2 + dip(g, x, w);
    px(ctx, '#2a2830', x, y, 1, 1);
    const c = BULBS[(x * 7 + y) % BULBS.length];
    // De día, bolita apagada: el cristal con un punto de luz del cielo.
    px(ctx, c, x, y + 1, 1, 2);
    px(ctx, '#f4f0e6', x, y + 1, 1, 1);
  }
}

function drawGlow(ctx: Ctx, g: Garland, w: number): void {
  for (let x = 3; x < w - 2; x += BULB_EVERY) {
    const y = 3 + dip(g, x, w);
    const c = BULBS[(x * 7 + (y - 1)) % BULBS.length];
    // Halo en tres anillos y el núcleo, sin degradado.
    ctx.globalAlpha = 0.1;
    px(ctx, c, x - 3, y - 2, 7, 5);
    ctx.globalAlpha = 0.22;
    px(ctx, c, x - 2, y - 1, 5, 3);
    ctx.globalAlpha = 0.9;
    px(ctx, c, x, y - 1, 1, 2);
    ctx.globalAlpha = 1;
    px(ctx, '#ffffff', x, y - 1, 1, 1);
  }
}

export class StringLightsView {
  private readonly glows: Phaser.GameObjects.Image[] = [];
  private readonly hour: () => number;

  constructor(scene: Phaser.Scene, def: LocationDef, hour: () => number) {
    this.hour = hour;
    (def.garlands ?? []).forEach((g, i) => {
      const w = Math.abs(g.x1 - g.x0) + 1;
      const h = g.sag + 8;
      const x = Math.min(g.x0, g.x1);
      const y = Math.min(g.y0, g.y1) - 1;
      const wire = `gl-wire-${def.id}-${i}`;
      const glow = `gl-glow-${def.id}-${i}`;
      make(scene, wire, w, h, (ctx) => drawWire(ctx, g, w));
      make(scene, glow, w, h, (ctx) => drawGlow(ctx, g, w));
      scene.add.image(x, y, wire).setOrigin(0, 0).setDepth(LAYER.overhead);
      this.glows.push(scene.add.image(x, y, glow).setOrigin(0, 0).setDepth(GLOW_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    });
  }

  /** Cada frame: encendidas con la noche y con un parpadeo muy lento, cada guirnalda a su ritmo. */
  update(time: number): void {
    if (this.glows.length === 0) return;
    const night = nightAt(this.hour());
    this.glows.forEach((img, i) => {
      img.setVisible(night > 0.05);
      if (night > 0.05) img.setAlpha(night * (0.86 + 0.14 * Math.sin(time / 1_400 + i * 2.1)));
    });
  }
}
