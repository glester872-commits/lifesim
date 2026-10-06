import Phaser from 'phaser';
import type { Facing, NpcLook, Vec2 } from '../types/game';
import { personFrame, personScale, personTexture } from '../world/TextureFactory';

export type WalkerIcon = 'phone' | 'talk' | 'alert' | null;

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
  /** Frase breve visible sobre el NPC: gritos y reacciones del mundo. */
  private readonly speechEl: HTMLDivElement;
  private speechToken = 0;
  private icon: WalkerIcon = null;
  private path: Vec2[] = [];
  private speed = 0;
  private dir: Facing;
  /** Hablando con el jugador: hacia dónde miraría si no. Su IA sigue mandando; se aplica al despedirse. */
  private resumeDir: Facing | null = null;
  /** Sentado en un banco del andén (data/seating.ts): la pose 4 hasta que vuelva a andar. */
  private seated = false;

  constructor(scene: Phaser.Scene, look: NpcLook, facing: Facing) {
    super(scene, 0, 0, personTexture(look.id), personFrame(look.id, facing));
    this.currentLook = look;
    this.dir = facing;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);

    const body = this.body as Phaser.Physics.Arcade.Body;
    this.fit();
    body.setImmovable(true);
    body.pushable = false;

    this.shadow = scene.add.image(0, 0, 'fx-shadow').setOrigin(0.5, 0.5);
    this.iconImage = scene.add.image(0, 0, 'fx-phone').setOrigin(0.5, 1).setVisible(false);

    // El texto vive en HTML, fuera del canvas pixelado:
    // así se mantiene pequeño y nítido independientemente del zoom.
    this.speechEl = document.createElement('div');
    this.speechEl.className = 'world-speech';
    this.speechEl.hidden = true;
    (document.querySelector('#overlay') ?? document.body).appendChild(this.speechEl);

    scene.events.on(
      Phaser.Scenes.Events.POST_UPDATE,
      this.syncSpeech,
      this,
    );

    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.shadow.destroy();
      this.iconImage.destroy();
      scene.events.off(
        Phaser.Scenes.Events.POST_UPDATE,
        this.syncSpeech,
        this,
      );
      this.speechEl.remove();
    });
    this.hide();
  }

  get look(): NpcLook {
    return this.currentLook;
  }

  get moving(): boolean {
    return this.path.length > 0;
  }

  /** Parado hablando con el jugador: su ruta espera (systems/Recovery no lo cuenta como atascado). */
  get talking(): boolean {
    return this.resumeDir !== null;
  }

  /** Último punto de su ruta, si va a alguna parte. */
  get destination(): Vec2 | undefined {
    return this.path[this.path.length - 1];
  }

  get facing(): Facing {
    return this.dir;
  }

  /** El pool se recicla con otra cara: sólo mientras está fuera de escena. */
  setLook(look: NpcLook): void {
    this.currentLook = look;
    this.fit();
  }

  /**
   * Escala y cuerpo según el aspecto: el de 28 × 42 (world/HumanArtHD) va a 16/28 y su cuerpo, que
   * Phaser escala con el sprite, se da en píxeles de su textura. En el mundo, los dos miden igual.
   */
  private fit(): void {
    const s = personScale(this.currentLook.id);
    this.setTexture(personTexture(this.currentLook.id), personFrame(this.currentLook.id, this.dir ?? 'down'));
    this.setScale(s);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(12 / s, 8 / s);
    body.setOffset((this.width - 12 / s) / 2, this.height - 8 / s);
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
    this.speechToken++;
    this.speechEl.hidden = true;
    this.setVisible(false);
    this.shadow.setVisible(false);
  }

  walk(path: Vec2[], speed: number): void {
    this.seated = false;
    this.path = path.slice();
    this.speed = speed;
  }

  /** Corta la ruta en seco. */
  halt(): void {
    this.path = [];
    (this.body as Phaser.Physics.Arcade.Body).stop();
    this.anims.stop();
    this.setTexture(personTexture(this.currentLook.id), personFrame(this.currentLook.id, this.dir, this.pose));
  }

  /** Se sienta donde está (encima del banco), mirando hacia donde mira el asiento. Se levanta al volver a andar. */
  sit(facing: Facing): void {
    this.seated = true;
    this.anims.stop();
    this.face(facing);
  }

  /** De pie o sentado. */
  private get pose(): 0 | 4 {
    return this.seated ? 4 : 0;
  }

  /** Se para y mira a quien le habla, respirando. La ruta no se pierde: sigue al despedirse. */
  talkTo(facing: Facing): void {
    this.resumeDir ??= this.dir;
    (this.body as Phaser.Physics.Arcade.Body).stop();
    this.dir = facing;
    // Sentado, se gira sin levantarse.
    if (this.seated) this.setTexture(personTexture(this.currentLook.id), personFrame(this.currentLook.id, facing, 4));
    else this.anims.play(`npc-${this.currentLook.id}-idle-${facing}`, true);
    this.sync();
  }

  endTalk(): void {
    if (this.resumeDir === null) return;
    const dir = this.resumeDir;
    this.resumeDir = null;
    this.anims.stop();
    this.face(dir);
  }

  face(facing: Facing): void {
    if (this.resumeDir !== null) {
      this.resumeDir = facing;
      return;
    }
    this.dir = facing;
    if (!this.moving) this.setTexture(personTexture(this.currentLook.id), personFrame(this.currentLook.id, facing, this.pose));
    this.sync();
  }

  setIcon(icon: WalkerIcon): void {
    this.icon = icon;
    this.iconImage.setVisible(icon !== null);
    if (icon) {
      this.iconImage.setTexture(
        icon === 'phone' ? 'fx-phone' :
        icon === 'alert' ? 'fx-alert' :
        'fx-talk',
      );
    }
    this.sync();
  }

  /** Enseña una frase breve sobre la cabeza del NPC. */
  say(text: string, duration = 3_200): void {
    const token = ++this.speechToken;

    this.speechEl.textContent = text;
    this.speechEl.hidden = false;
    this.syncSpeech();

    this.scene.time.delayedCall(duration, () => {
      if (token !== this.speechToken) return;
      this.speechEl.hidden = true;
    });
  }

  /** Avanza por la ruta. Devuelve true el frame en que llega al final. */
  step(deltaMs: number): boolean {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const target = this.path[0];
    if (!target || this.resumeDir !== null) return false;

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
      this.setTexture(personTexture(this.currentLook.id), personFrame(this.currentLook.id, this.dir));
      return true;
    }

    body.setVelocity((dx / distance) * this.speed, (dy / distance) * this.speed);
    this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    this.anims.play(`npc-${this.currentLook.id}-walk-${this.dir}`, true);
    this.sync();
    return false;
  }

  /** Profundidad por Y, igual que el jugador. */
  /** Mantiene el bocadillo HTML encima del NPC mientras la cámara se mueve. */
  private syncSpeech(): void {
    if (this.speechEl.hidden || !this.visible) return;

    const camera = this.scene.cameras.main;
    const canvas = this.scene.game.canvas;
    const rect = canvas.getBoundingClientRect();

    const scaleX = rect.width / this.scene.scale.width;
    const scaleY = rect.height / this.scene.scale.height;

    const screenX =
      rect.left +
      (camera.x + (this.x - camera.worldView.x) * camera.zoom) * scaleX;

    const screenY =
      rect.top +
      (camera.y + (this.y - 27 - camera.worldView.y) * camera.zoom) * scaleY;

    const speechWidth = this.speechEl.offsetWidth;
    const speechHeight = this.speechEl.offsetHeight;

    const left = Math.round(screenX - speechWidth / 2);
    const top = Math.round(screenY - speechHeight - 3);

    this.speechEl.style.left = `${left}px`;
    this.speechEl.style.top = `${top}px`;
  }

  private sync(): void {
    this.setDepth(this.y);
    this.shadow.setPosition(this.x, this.y - 1).setDepth(this.y - 1);

    if (!this.icon) return;
    if (this.icon === 'phone') {
      // En la mano, del lado hacia el que mira.
      const side = this.dir === 'left' ? -4 : this.dir === 'right' ? 4 : 3;
      this.iconImage.setPosition(this.x + side, this.y - 7).setDepth(this.y + 1);
    } else {
      this.iconImage
        .setPosition(this.x + 5, this.y - 24)
        .setDepth(this.y + 1);
    }
  }
}
