import type Phaser from 'phaser';
import { TILE } from '../config/constants';
import { UNIFORM_LOOKS } from '../data/npcs';
import { colorsOf, drawHuman, kickPose, type Pose } from './HumanArt';
import { movePhase, specOf, type Bout } from '../systems/Sparring';

/** Las poses del rival: guardia, golpe, patadas y, para la lucha de MMA, tumbado (11) e incorporándose (22). */
const RIVAL_POSES = [8, 9, 11, 22, 38, 39, 40, 41, 42, 43, 44, 45] as const;

/** Un rival y doce texturas pequeñas, horneadas una vez; no amplía el atlas global. */
export class SparringView {
  private readonly scene: Phaser.Scene;
  private readonly image: Phaser.GameObjects.Image;
  private readonly keys: string[] = [];
  private readonly origin: { x: number; y: number };
  constructor(scene: Phaser.Scene, tx: number, ty: number, look: string) {
    this.scene = scene;
    this.origin = { x: tx * TILE + TILE / 2, y: (ty + 1) * TILE };
    const colors = colorsOf(UNIFORM_LOOKS.find(l => l.id === look) ?? UNIFORM_LOOKS[0]!);
    for (const pose of RIVAL_POSES) {
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
    const { pose, dy } = sparPose(b, 'o', false);
    this.image.setTexture('spar-rival-' + pose);
    this.image.setPosition(Math.round(this.origin.x + b.o.x * TILE), this.origin.y + dy);
    // Quien queda arriba en el suelo se pinta delante de quien está abajo.
    this.image.setDepth(this.origin.y + (b.grip.phase !== 'ground' ? 0.1 : b.grip.top === 'o' ? 0.3 : -0.3));
    this.image.setTint(b.t < b.o.stunUntil ? 0xffc890 : 0xffffff);
  }
  destroy(): void {
    this.image.destroy();
    for (const key of this.keys) this.scene.textures.remove(key);
  }
}

/**
 * La pose de cada uno y cuánto baja (px). De pie: guardia, golpe o patada con la pierna elegida. MMA: en el clinch, los
 * dos agarrados (brazos delante) y el derribo se prepara bajando el nivel; en el suelo, quien está abajo tumbado (y medio
 * incorporado al escapar) y quien está arriba agachado encima, más abajo aún al fijar.
 */
export function sparPose(b: Bout, who: 'p' | 'o', right: boolean): { pose: Pose; dy: number } {
  const f = b[who];
  const phase = movePhase(f, b.t, b.style);
  const m = phase ? f.move : null;
  if (b.grip.phase === 'ground') {
    if (b.grip.top === who) return m?.id === 'pin' && phase !== 'recover' ? { pose: 9, dy: 5 } : { pose: 8, dy: 3 };
    return m?.id === 'escape' && phase !== 'recover' ? { pose: 22, dy: 0 } : { pose: 11, dy: 0 };
  }
  if (b.grip.phase === 'clinch') return m?.id === 'takedown' && phase === 'windup' ? { pose: 9, dy: 3 } : { pose: 9, dy: 0 };
  if (!m) return { pose: 8, dy: 0 };
  if (m.id === 'front' || m.id === 'round' || m.id === 'side') {
    // El impacto llega al final de la extensión, con la misma pierna que se eligió.
    const extending = b.t - m.start >= specOf(b.style, m.id, m.side).windupMs - 90 && phase !== 'recover';
    return { pose: kickPose(extending ? m.id : 'chamber', (m.side === 'R') === right), dy: 0 };
  }
  // La entrada al clinch se ve venir: el cuerpo baja y los brazos van delante.
  if (m.id === 'clinch') return { pose: phase === 'recover' ? 8 : 9, dy: phase === 'windup' ? 2 : 0 };
  return { pose: phase === 'hold' ? 9 : 8, dy: 0 };
}
