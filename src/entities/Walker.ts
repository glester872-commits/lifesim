import Phaser from 'phaser';
import type { Facing, NpcLook, Vec2 } from '../types/game';

export type WalkerIcon = 'phone' | 'talk' | null;

/**
 * NPC que camina en línea recta por una lista de puntos. No hay pathfinding:
 * las rutas vienen de los datos de la estación y ya están libres de props.
 *
 * El cuerpo es inamovible: empuja al jugador, pero nada puede bloquearlo, así
 * que un NPC nunca se queda atascado. No choca con el escenario: no lo necesita.
 */
export class Walker extends Phaser.Physics.Arcade.Sprite {
  private currentLook: NpcLook;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly iconImage: Phaser.GameObjects.Image;
  private icon: WalkerIcon = null;
  private path: Vec2[] = [];
  private speed = 0;
  private dir: Facing;

  constructor(scene: Phaser.Scene, look: NpcLook, facing: Facing) {
    super(scene, 0, 0, `npc-${look.id}-${facing}`);
    this.currentLook = look;
    this.dir = facing;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(12, 8);
    body.setOffset(2, this.height - 8);
    body.setImmovable(true);
    body.pushable = false;

    this.shadow = scene.add.image(0, 0, 'fx-shadow').setOrigin(0.5, 0.5);
    this.iconImage = scene.add.image(0, 0, 'fx-phone').setOrigin(0.5, 1).setVisible(false);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.shadow.destroy();
      this.iconImage.destroy();
    });
    this.hide();
  }

  get look(): NpcLook {
    return this.currentLook;
  }

  get moving(): boolean {
    return this.path.length > 0;
  }

  get facing(): Facing {
    return this.dir;
  }

  /** El pool se recicla con otra cara: sólo mientras está fuera de escena. */
  setLook(look: NpcLook): void {
    this.currentLook = look;
  }

  /** Aparece en un punto (sale del pool). */
  place(at: Vec2, facing: Facing): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    this.setVisible(true);
    this.shadow.setVisible(true);
    body.enable = true;
    body.reset(at.x, at.y);
    this.face(facing);
    this.sync();
  }

  /** Vuelve al pool: sin cuerpo ni render, y sin coste por frame. */
  hide(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    this.path = [];
    body.stop();
    body.enable = false;
    this.anims.stop();
    this.setIcon(null);
    this.setVisible(false);
    this.shadow.setVisible(false);
  }

  walk(path: Vec2[], speed: number): void {
    this.path = path.slice();
    this.speed = speed;
  }

  /** Corta la ruta en seco. */
  halt(): void {
    this.path = [];
    (this.body as Phaser.Physics.Arcade.Body).stop();
    this.anims.stop();
    this.setTexture(`npc-${this.currentLook.id}-${this.dir}`);
  }

  face(facing: Facing): void {
    this.dir = facing;
    if (!this.moving) this.setTexture(`npc-${this.currentLook.id}-${facing}`);
    this.sync();
  }

  setIcon(icon: WalkerIcon): void {
    this.icon = icon;
    this.iconImage.setVisible(icon !== null);
    if (icon) this.iconImage.setTexture(icon === 'phone' ? 'fx-phone' : 'fx-talk');
    this.sync();
  }

  /** Avanza por la ruta. Devuelve true el frame en que llega al final. */
  step(deltaMs: number): boolean {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const target = this.path[0];
    if (!target) return false;

    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.hypot(dx, dy);
    // Alcance de este frame: sin él, un frame largo se pasaría de largo.
    if (distance <= Math.max(1, (this.speed * deltaMs) / 1000)) {
      body.reset(target.x, target.y);
      this.path.shift();
      this.sync();
      if (this.path.length > 0) return false;
      this.anims.stop();
      this.setTexture(`npc-${this.currentLook.id}-${this.dir}`);
      return true;
    }

    body.setVelocity((dx / distance) * this.speed, (dy / distance) * this.speed);
    this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    this.anims.play(`npc-${this.currentLook.id}-walk-${this.dir}`, true);
    this.sync();
    return false;
  }

  /** Profundidad por Y, igual que el jugador. */
  private sync(): void {
    this.setDepth(this.y);
    this.shadow.setPosition(this.x, this.y - 1).setDepth(this.y - 1);
    if (!this.icon) return;
    if (this.icon === 'phone') {
      // En la mano, del lado hacia el que mira.
      const side = this.dir === 'left' ? -4 : this.dir === 'right' ? 4 : 3;
      this.iconImage.setPosition(this.x + side, this.y - 7).setDepth(this.y + 1);
    } else {
      this.iconImage.setPosition(this.x + 5, this.y - 24).setDepth(this.y + 1);
    }
  }
}
