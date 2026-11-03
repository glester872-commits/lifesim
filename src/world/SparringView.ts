import type Phaser from 'phaser';
import { TILE } from '../config/constants';
import { UNIFORM_LOOKS } from '../data/npcs';
import { colorsOf, drawHuman, kickPose, type Pose } from './HumanArt';
import { MOVES, movePhase, type Bout, type Fighter } from '../systems/Sparring';

/** Un rival y diez texturas pequeñas, horneadas una vez; no amplía el atlas global. */
export class SparringView {
  private readonly scene: Phaser.Scene;
  private readonly image: Phaser.GameObjects.Image;
  private readonly keys: string[] = [];
  private readonly origin: { x: number; y: number };
  constructor(scene: Phaser.Scene, tx: number, ty: number, look: string) {
    this.scene = scene;
    this.origin = { x: tx * TILE + TILE / 2, y: (ty + 1) * TILE };
    const colors = colorsOf(UNIFORM_LOOKS.find(l => l.id === look) ?? UNIFORM_LOOKS[0]!);
    for (const pose of [8, 9, 38, 39, 40, 41, 42, 43, 44, 45] as const) {
      const key = 'spar-rival-' + pose;
      scene.textures.remove(key);
      const texture = scene.textures.createCanvas(key, 16, 24);
      if (!texture) throw new Error('No se pudo preparar el rival');
      drawHuman(texture.getContext(), 'left', pose, colors);
      texture.refresh();
      this.keys.push(key);
    }
    this.image = scene.add.image(this.origin.x, this.origin.y, 'spar-rival-8').setOrigin(0.5, 1).setDepth(this.origin.y + 0.1);
  }
  render(b: Bout): void {
    this.image.setTexture('spar-rival-' + sparPose(b.o, b.t, false));
    this.image.setPosition(Math.round(this.origin.x + b.o.x * TILE), this.origin.y);
    this.image.setTint(b.t < b.o.stunUntil ? 0xffc890 : 0xffffff);
  }
  destroy(): void {
    this.image.destroy();
    for (const key of this.keys) this.scene.textures.remove(key);
  }
}

export function sparPose(f: Fighter, t: number, right: boolean): Pose {
  const phase = movePhase(f, t);
  const m = f.move;
  if (!phase || !m) return 8;
  if (m.id === 'front' || m.id === 'round' || m.id === 'side') {
    // El impacto llega al final de la extensión, con la misma pierna que se eligió.
    const extending = t - m.start >= MOVES[m.id].windupMs - 90 && phase !== 'recover';
    return kickPose(extending ? m.id : 'chamber', (m.side === 'R') === right);
  }
  return phase === 'hold' ? 9 : 8;
}
