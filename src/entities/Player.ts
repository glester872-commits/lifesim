import Phaser from 'phaser';
import { PLAYER_BODY, PLAYER_SPEED } from '../config/constants';
import type { Facing } from '../types/game';
import { PLAYER_H, PLAYER_W } from '../world/TextureFactory';
import { every } from '../world/Motion';

export interface MoveInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /**
   * El joystick táctil (systems/PlayerInput): dirección en 360° y cuánto se
   * empuja (largo de 0 a 1). Sólo cuenta si no hay teclas pulsadas.
   */
  analog?: { readonly x: number; readonly y: number };
}

/** Con el stick apenas empujado se anda despacio; a fondo, al paso de siempre. */
const MIN_ANALOG_PACE = 0.35;

/** Al llegar al asiento, un instante a medio sentarse antes de apoyarse del todo (lo mismo que la gente). */
const SIT_DOWN_MS = 260;
/** Lo que tarda como mucho en dar los pasos que le separan del asiento: no es un teletransporte. */
const MAX_GLIDE_MS = 420;

/**
 * El sprite se ancla por los pies (origen inferior) y su cuerpo de colisión
 * ocupa sólo esa franja: así se puede pasar por detrás de árboles y farolas
 * sin que la cabeza choque con nada.
 *
 * Sentarse (data/seating.ts) es el mismo asiento que usa la gente: el jugador
 * da los pasos que le faltan hasta el mueble (sin cuerpo, que el mueble es
 * sólido), se gira, se sienta y respira; al levantarse vuelve andando a donde
 * estaba y recupera el cuerpo.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  private dir: Facing;
  private readonly shadow: Phaser.GameObjects.Image;
  /** Sentado o yendo a sentarse o a levantarse: no anda con las teclas. */
  private seat: { facing: Facing; lift: number; since: number; settled: boolean } | null = null;

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

  /** Sentado del todo (no a medio camino del asiento). */
  get isSeated(): boolean {
    return this.seat?.settled ?? false;
  }

  /** Sentado, sentándose o levantándose: las teclas de andar no le mueven. */
  get isSeating(): boolean {
    return this.seat !== null;
  }

  move(input: MoveInput): void {
    if (this.seat) return;
    let vx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let vy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    // Las teclas mandan; sin ellas, el stick: su dirección y, según lo que se empuje, más o menos deprisa.
    let pace = 1;
    let fromStick = false;
    const push = input.analog ? Math.hypot(input.analog.x, input.analog.y) : 0;
    if (vx === 0 && vy === 0 && input.analog && push > 0) {
      vx = input.analog.x;
      vy = input.analog.y;
      pace = MIN_ANALOG_PACE + (1 - MIN_ANALOG_PACE) * Math.min(1, push);
      fromStick = true;
    }

    if (vx === 0 && vy === 0) {
      this.halt();
      return;
    }

    const length = Math.hypot(vx, vy);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity((vx / length) * PLAYER_SPEED * pace, (vy / length) * PLAYER_SPEED * pace);

    // Con teclas, el lado manda en diagonal (como siempre); con el stick, el eje hacia el que más se empuja.
    const horizontal = fromStick ? Math.abs(vx) >= Math.abs(vy) : vx !== 0;
    this.dir = horizontal ? (vx > 0 ? 'right' : 'left') : vy > 0 ? 'down' : 'up';
    this.anims.play(`player-walk-${this.dir}`, true);
    // El paso, al compás de la velocidad: despacio no resbalan los pies.
    this.anims.timeScale = pace;
    this.sync();
  }

  halt(): void {
    // Sentado sigue sentado aunque se abra un menú o una conversación.
    if (this.seat) return;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    // Quieto no es congelado: respira (a su ritmo, aunque viniera andando despacio con el stick).
    this.anims.timeScale = 1;
    this.anims.play(`player-idle-${this.dir}`, true);
    this.sync();
  }

  /**
   * Va al asiento que tiene los pies en (x, y) y se sienta mirando a `facing`.
   * Sin cuerpo desde el primer paso: el mueble es sólido y él va a subirse.
   */
  sitOn(x: number, y: number, facing: Facing, lift: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.enable = false;
    this.seat = { facing, lift, since: 0, settled: false };
    this.glide(x, y, () => {
      if (!this.seat) return;
      this.anims.stop();
      this.seat = { facing, lift, since: this.scene.time.now, settled: true };
      this.seatedFrame(this.scene.time.now, null);
    });
  }

  /** Se levanta y vuelve andando a (x, y), donde estaba antes de sentarse; ahí recupera el cuerpo. */
  standTo(x: number, y: number, then?: () => void): void {
    if (!this.seat) return;
    this.seat.settled = false;
    this.setOrigin(0.5, 1);
    this.glide(x, y, () => {
      this.seat = null;
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.enable = true;
      body.reset(x, y);
      this.halt();
      then?.();
    });
  }

  /**
   * Sentado, cada frame: respira (el tronco baja un píxel de vez en cuando) y,
   * si se le pide, mira hacia un lado sin levantarse. `look` null: al frente.
   * Comiendo, se lleva el tenedor (o el vaso) a la boca cada poco.
   */
  seatedFrame(time: number, look: Facing | null, eating = false): void {
    if (!this.seat?.settled) return;
    const settling = time - this.seat.since < SIT_DOWN_MS;
    const bite = eating && every(time, 5, 1_900, 700);
    const pose = settling ? 3 : bite ? 26 : every(time, 1, 3_800, 520) ? 24 : 4;
    this.dir = look ?? this.seat.facing;
    this.setTexture(`player-${this.dir}-${pose}`);
    // Más alto (un taburete): el cuerpo sube; los pies, la sombra y la profundidad se quedan en el asiento.
    this.setOrigin(0.5, (PLAYER_H + this.seat.lift) / PLAYER_H);
    this.sync();
  }

  /** Los pasos cortos hasta (x, y) andando, mirando hacia donde va; luego `then`. */
  private glide(x: number, y: number, then: () => void): void {
    const dx = x - this.x;
    const dy = y - this.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 0.5) {
      this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      this.anims.play(`player-walk-${this.dir}`, true);
    }
    this.scene.tweens.add({
      targets: this,
      x,
      y,
      duration: Math.min(MAX_GLIDE_MS, Math.max(90, (distance / PLAYER_SPEED) * 1000)),
      onUpdate: () => this.sync(),
      onComplete: then,
    });
  }

  /** Profundidad por Y: lo que está más abajo se dibuja delante. */
  private sync(): void {
    this.setDepth(this.y);
    this.shadow.setPosition(this.x, this.y - 1).setDepth(this.y - 1);
  }
}
