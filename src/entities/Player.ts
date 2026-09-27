import Phaser from 'phaser';
import { PLAYER_BODY, PLAYER_SPEED } from '../config/constants';
import type { Facing } from '../types/game';
import { PLAYER_H, PLAYER_W } from '../world/TextureFactory';

export interface MoveInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/**
 * El sprite se ancla por los pies (origen inferior) y su cuerpo de colisión
 * ocupa sólo esa franja: así se puede pasar por detrás de árboles y farolas
 * sin que la cabeza choque con nada.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  private dir: Facing;
  private readonly shadow: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, facing: Facing) {
    super(scene, x, y, `player-${facing}-0`);
    this.dir = facing;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(PLAYER_BODY.width, PLAYER_BODY.height);
    body.setOffset((PLAYER_W - PLAYER_BODY.width) / 2, PLAYER_H - PLAYER_BODY.height);
    body.setCollideWorldBounds(true);

    this.shadow = scene.add.image(x, y, 'fx-shadow').setOrigin(0.5, 0.5);
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.shadow.destroy());
    this.sync();
  }

  get facing(): Facing {
    return this.dir;
  }

  move(input: MoveInput): void {
    const vx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const vy = (input.down ? 1 : 0) - (input.up ? 1 : 0);

    if (vx === 0 && vy === 0) {
      this.halt();
      return;
    }

    const length = Math.hypot(vx, vy);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity((vx / length) * PLAYER_SPEED, (vy / length) * PLAYER_SPEED);

    this.dir = vx !== 0 ? (vx > 0 ? 'right' : 'left') : vy > 0 ? 'down' : 'up';
    this.anims.play(`player-walk-${this.dir}`, true);
    this.sync();
  }

  halt(): void {
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    // Quieto no es congelado: respira.
    this.anims.play(`player-idle-${this.dir}`, true);
    this.sync();
  }

  /** Profundidad por Y: lo que está más abajo se dibuja delante. */
  private sync(): void {
    this.setDepth(this.y);
    this.shadow.setPosition(this.x, this.y - 1).setDepth(this.y - 1);
  }
}
