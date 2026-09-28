import Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import type { LocationDef, SignalDef } from '../types/game';
import { signalAt } from '../systems/Signals';
import { EMISSIVE_DEPTH, nightAt } from './Lighting';
import { make, px, shade, type Ctx } from './paint';

/**
 * Semáforos de systems/Signals.ts dibujados. Por cada paso: un semáforo de
 * coches a la derecha de cada sentido, uno de peatones en cada bordillo,
 * línea de detención en cada carril y baldosa podotáctil al pie del paso.
 * Las luces van encima de la sombra de la hora (como los rótulos) y de noche
 * echan un halo de su color. Los postes no chocan: son decorado sobre la
 * acera, fuera de los sitios de espera, y la navegación no cambia.
 */

const BOX = '#1c1f24';
const POLE = PALETTE.iron;
const RED = '#ff4a3a';
const AMBER = '#ffb030';
const GREEN = '#4cff8a';
const GLOW: Readonly<Record<string, number>> = { red: 0xff4a3a, amber: 0xffb030, green: 0x4cff8a, stop: 0xff4a3a, walk: 0x4cff8a };
/** Cada cuánto parpadea el muñeco verde al acabarse el tiempo, en ms reales. */
const FLASH_MS = 350;

// ------------------------------------------------------------------ dibujo

/** Poste con la caja de tres focos, apagados. 10 × 46. */
function drawCarPole(ctx: Ctx): void {
  px(ctx, PALETTE.ink, 3, 44, 4, 2);
  px(ctx, POLE, 4, 15, 2, 29);
  px(ctx, shade(POLE, 0.14), 4, 15, 1, 29);
  px(ctx, BOX, 1, 0, 8, 16);
  px(ctx, shade(BOX, 0.12), 1, 0, 8, 1);
  for (const [y, c] of [[1, '#4a1a1a'], [6, '#4a3a12'], [11, '#123a24']] as const) {
    px(ctx, PALETTE.ink, 2, y, 6, 1); // visera
    px(ctx, c, 3, y + 1, 4, 3);
    px(ctx, c, 4, y, 2, 1);
  }
}

function drawCarLamp(ctx: Ctx, y: number, c: string): void {
  px(ctx, c, 3, y + 1, 4, 3);
  px(ctx, c, 4, y, 2, 1);
  px(ctx, shade(c, 0.25), 4, y + 1, 2, 1);
}

/** Poste de peatones: caja de dos ventanillas (muñeco rojo arriba, verde abajo). 8 × 34. */
function drawPedPole(ctx: Ctx): void {
  px(ctx, PALETTE.ink, 2, 32, 4, 2);
  px(ctx, POLE, 3, 13, 2, 19);
  px(ctx, shade(POLE, 0.14), 3, 13, 1, 19);
  px(ctx, BOX, 0, 0, 8, 14);
  px(ctx, shade(BOX, 0.12), 0, 0, 8, 1);
  px(ctx, '#2a1414', 1, 1, 6, 6);
  px(ctx, '#12261a', 1, 7, 6, 6);
}

/** Muñeco parado (rojo, arriba) o andando (verde, abajo), en su ventanilla. */
function drawPedFigure(ctx: Ctx, walking: boolean): void {
  const c = walking ? GREEN : RED;
  if (!walking) {
    px(ctx, c, 3, 1, 2, 1);
    px(ctx, c, 3, 2, 2, 3);
    px(ctx, c, 2, 3, 1, 1);
    px(ctx, c, 5, 3, 1, 1);
    px(ctx, c, 3, 5, 1, 1);
    px(ctx, c, 4, 5, 1, 1);
    return;
  }
  px(ctx, c, 4, 7, 2, 1);
  px(ctx, c, 3, 8, 2, 3);
  px(ctx, c, 5, 9, 1, 1);
  px(ctx, c, 2, 9, 1, 1);
  px(ctx, c, 2, 11, 1, 1);
  px(ctx, c, 5, 11, 1, 1);
}

function buildSignalTextures(scene: Phaser.Scene): void {
  make(scene, 'sig-car', 10, 46, drawCarPole);
  make(scene, 'sig-car-red', 10, 46, (ctx) => drawCarLamp(ctx, 1, RED));
  make(scene, 'sig-car-amber', 10, 46, (ctx) => drawCarLamp(ctx, 6, AMBER));
  make(scene, 'sig-car-green', 10, 46, (ctx) => drawCarLamp(ctx, 11, GREEN));
  make(scene, 'sig-ped', 8, 34, drawPedPole);
  make(scene, 'sig-ped-stop', 8, 34, (ctx) => drawPedFigure(ctx, false));
  make(scene, 'sig-ped-walk', 8, 34, (ctx) => drawPedFigure(ctx, true));
}

// ------------------------------------------------------------------ escena

interface Head {
  kind: 'car' | 'ped';
  /** La luz encendida, sobre el poste. */
  lamp: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  /** Pies del poste, en px. */
  x: number;
  y: number;
}

export class SignalView {
  private readonly heads = new Map<SignalDef, Head[]>();
  private readonly clock: () => number;

  /** `clock`: minuto del día con decimales (el mismo que usan peatones y coches). */
  constructor(scene: Phaser.Scene, def: LocationDef, clock: () => number) {
    this.clock = clock;
    const signals = def.signals ?? [];
    if (signals.length === 0) return;
    buildSignalTextures(scene);
    const ground = scene.add.graphics().setDepth(-9);
    for (const sig of signals) {
      const north = sig.ty - 1;
      const south = sig.ty + sig.h;
      // Baldosa podotáctil en el bordillo, frente a las bandas: se nota con el pie dónde empieza el paso.
      for (let x = sig.tx; x < sig.tx + sig.w; x++) {
        for (const y of [north, south]) scene.add.image(x * TILE, y * TILE, 'tile-tactile-0').setOrigin(0, 0).setDepth(-9);
      }
      // Línea de detención de cada carril (también el bici), blanca y gastada, antes de las bandas.
      for (const lane of [...(def.traffic?.lanes ?? []), ...(def.traffic?.bikes?.lanes ?? [])]) {
        if (lane.row < sig.ty || lane.row >= sig.ty + sig.h) continue;
        const x = lane.dir > 0 ? sig.tx * TILE - 5 : (sig.tx + sig.w) * TILE + 3;
        for (let y = lane.row * TILE + 1; y < (lane.row + 1) * TILE - 1; y++) {
          if (Math.imul(y * 31 + x, 2654435761) >>> 28 === 0) continue; // desconchón
          ground.fillStyle(0xd6d0bf, 0.9).fillRect(x, y, 2, 1);
        }
      }
      // Coches: a la derecha de cada sentido, antes del paso. Peatones: en cada bordillo, a un lado de las bandas.
      this.heads.set(sig, [
        this.head(scene, 'car', (sig.tx - 1) * TILE + 8, south * TILE + 5),
        this.head(scene, 'car', (sig.tx + sig.w) * TILE + 8, north * TILE + 15),
        this.head(scene, 'ped', (sig.tx - 1) * TILE + 8, north * TILE + 14),
        this.head(scene, 'ped', (sig.tx + sig.w) * TILE + 8, south * TILE + 6),
      ]);
    }
    this.update(0);
  }

  private head(scene: Phaser.Scene, kind: 'car' | 'ped', x: number, y: number): Head {
    scene.add.image(x, y, kind === 'car' ? 'sig-car' : 'sig-ped').setOrigin(0.5, 1).setDepth(y);
    return {
      kind,
      x,
      y,
      lamp: scene.add.image(x, y, kind === 'car' ? 'sig-car-green' : 'sig-ped-stop').setOrigin(0.5, 1).setDepth(EMISSIVE_DEPTH),
      glow: scene.add.image(x, y, 'fx-light').setScale(0.22).setBlendMode(Phaser.BlendModes.ADD).setDepth(EMISSIVE_DEPTH - 1),
    };
  }

  update(time: number): void {
    const minute = this.clock();
    const night = nightAt(minute / 60);
    for (const [sig, heads] of this.heads) {
      const state = signalAt(sig, minute);
      for (const h of heads) {
        let key: string;
        let lampY: number;
        let color: number;
        if (h.kind === 'car') {
          key = `sig-car-${state.car}`;
          lampY = h.y - 46 + (state.car === 'red' ? 3 : state.car === 'amber' ? 8 : 13);
          color = GLOW[state.car];
        } else {
          const walking = state.walk !== 'stop';
          key = walking ? 'sig-ped-walk' : 'sig-ped-stop';
          lampY = h.y - 34 + (walking ? 10 : 4);
          color = GLOW[walking ? 'walk' : 'stop'];
        }
        // Verde parpadeando: quien ya cruza termina, nadie más empieza.
        const on = h.kind === 'car' || state.walk !== 'flash' || Math.floor(time / FLASH_MS) % 2 === 0;
        h.lamp.setTexture(key).setVisible(on);
        h.glow.setPosition(h.x, lampY).setTint(color).setVisible(on && night > 0.05).setAlpha(night * 0.85);
      }
    }
  }
}
