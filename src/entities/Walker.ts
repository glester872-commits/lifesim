import Phaser from 'phaser';
import type { Facing, NpcLook, Vec2 } from '../types/game';
import { PEOPLE, personFrame, personScale, personTexture, showPerson } from '../world/TextureFactory';
import type { Pose } from '../world/HumanArt';
import { TILE } from '../config/constants';
import { WALK_REF } from './Character';

export type WalkerIcon = 'phone' | 'talk' | 'alert' | null;

/**
 * NPC que camina en línea recta por una lista de puntos. No hay pathfinding:
 * las rutas vienen de los datos de la estación y ya están libres de props.
 *
 * El cuerpo es inamovible y no choca con el jugador ni con el escenario: nadie
 * lo bloquea, así que nunca se queda atascado, y él nunca empuja ni arrastra al
 * jugador. Si el jugador está en su camino, se para un momento (YIELD_MS) y
 * luego pasa despacio rozándole: ni empujones ni atascos.
 */
/** Delante y a los lados (px, pies con pies) en que el jugador le corta el paso. */
const YIELD_AHEAD = 14;
const YIELD_SIDE = 8;
/** Cuánto espera parado antes de pasar despacio (por debajo de Recovery.stallMs). */
const YIELD_MS = 1_200;
const YIELD_CRAWL = 0.4;

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
  /** Pies del jugador, si está en su misma escena (MetroSystem.update): a quien cede el paso. */
  avoid: Vec2 | null = null;
  private yielded = 0;
  private static made = 0;
  /** Cada uno a su compás: desde dónde empieza un bucle, lo rápido que respira y lo larga que es su zancada. */
  private readonly phase: number;
  private readonly tempo: number;
  private readonly stride: number;
  /** El aspecto que muestra y retiene (world/TextureFactory.showPerson); null, en el pool. */
  private shown: string | null = null;

  constructor(scene: Phaser.Scene, look: NpcLook, facing: Facing) {
    super(scene, 0, 0, personTexture(look.id), personFrame(look.id, facing));
    this.currentLook = look;
    this.dir = facing;
    const n = Walker.made++;
    this.phase = (n * 0.618034) % 1;
    this.tempo = 0.9 + (n % 5) * 0.05;
    this.stride = 0.94 + ((n * 3) % 5) * 0.03;

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
      this.shown = showPerson(this.shown, null);
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
    if (this.shown) this.shown = showPerson(this.shown, look.id);
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
    // Lo que se ve retiene su ropa de 28 × 42 (se hornea si no estaba).
    this.shown = showPerson(this.shown, this.currentLook.id);
    this.fit();
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
    // Primero se esconde: así quitarle el icono no le vuelve a poner a respirar (rest sólo anima lo que se ve).
    this.setVisible(false);
    this.shadow.setVisible(false);
    this.setIcon(null);
    this.anims.stop();
    this.speechToken++;
    this.speechEl.hidden = true;
    // En el pool suelta su ropa de 28 × 42 y no apunta a ella (se puede tirar): crear o guardar no hornea nada.
    this.shown = showPerson(this.shown, null);
    this.setTexture(PEOPLE, personFrame(this.currentLook.id, this.dir));
  }

  /** Su ropa de 28 × 42 acaba de estar lista (o se ha tirado): otra textura, la misma talla y el mismo cuerpo en el mundo. */
  protected preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (!this.shown || this.scaleX === personScale(this.currentLook.id)) return;
    this.fit();
    if (!this.moving) this.rest();
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
    this.rest(true);
  }

  /** Se sienta donde está (encima del banco), mirando hacia donde mira el asiento. Se levanta al volver a andar. */
  sit(facing: Facing): void {
    this.seated = true;
    this.face(facing);
  }

  /** Un bucle desde su propio punto (no todos a la vez); al pararse, el reposo empieza de pie y quieto. */
  private loop(key: string, timeScale: number, settle = false): void {
    if (this.anims.currentAnim?.key !== key || !this.anims.isPlaying) {
      this.anims.play(key);
      this.anims.setProgress(settle ? 0 : this.phase);
    }
    this.anims.timeScale = timeScale;
  }

  private still(pose: Pose): void {
    this.anims.stop();
    this.setTexture(personTexture(this.currentLook.id), personFrame(this.currentLook.id, this.dir, pose));
  }

  /**
   * Parado, según lo que hace de verdad (systems/PassengerAI): sentado respira; con el móvil, lo
   * sostiene en las manos (de espaldas, el brillo del icono); charlando con otro pasajero, gesticula a
   * ratos; si no, respira de pie. Hablando con el jugador, respira y escucha.
   */
  private rest(settle = false): void {
    // En el pool no se anima nada (ni se apunta a una ropa de 28 × 42 que nadie retiene).
    if (!this.visible) return;
    const id = this.currentLook.id;
    const phone = this.icon === 'phone' && this.dir !== 'up';
    if (this.seated) {
      if (phone) this.still(25);
      else this.loop(`npc-${id}-sit-${this.dir}`, this.tempo);
    } else if (phone) this.still(5);
    else if (this.icon === 'talk' && !this.currentLook.cane) this.loop(`npc-${id}-talk-${this.dir}`, this.tempo);
    else this.loop(`npc-${id}-idle-${this.dir}`, this.tempo, settle);
  }

  /** Se para y mira a quien le habla, respirando. La ruta no se pierde: sigue al despedirse. */
  talkTo(facing: Facing): void {
    this.resumeDir ??= this.dir;
    (this.body as Phaser.Physics.Arcade.Body).stop();
    this.dir = facing;
    // Sentado, se gira sin levantarse.
    this.rest();
    this.sync();
  }

  endTalk(): void {
    if (this.resumeDir === null) return;
    const dir = this.resumeDir;
    this.resumeDir = null;
    this.face(dir);
  }

  face(facing: Facing): void {
    if (this.resumeDir !== null) {
      this.resumeDir = facing;
      return;
    }
    this.dir = facing;
    if (!this.moving && this.visible) this.rest();
    this.sync();
  }

  setIcon(icon: WalkerIcon): void {
    this.icon = icon;
    if (!this.moving && this.visible) this.rest();
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
      this.rest(true);
      return true;
    }

    const pace = this.yieldPace(dx / distance, dy / distance, deltaMs);
    body.setVelocity((dx / distance) * this.speed * pace, (dy / distance) * this.speed * pace);
    this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    // El compás del paso sale de la velocidad de verdad (también al pasar despacio junto al jugador): el pie no resbala.
    const cadence = Math.min(2.4, Math.max(0.5, (this.speed * pace) / (WALK_REF * TILE))) / this.stride;
    if (pace > 0) this.loop(`npc-${this.currentLook.id}-walk-${this.dir}`, cadence);
    else this.loop(`npc-${this.currentLook.id}-idle-${this.dir}`, this.tempo, true);
    this.sync();
    return false;
  }

  /** 1 con el camino libre; 0 si el jugador le corta el paso (un momento) y luego despacio, para no atascarse. */
  private yieldPace(ux: number, uy: number, deltaMs: number): number {
    const px = this.avoid ? this.avoid.x - this.x : 0;
    const py = this.avoid ? this.avoid.y - this.y : 0;
    const ahead = px * ux + py * uy;
    if (!this.avoid || ahead <= 0 || ahead > YIELD_AHEAD || Math.abs(px * uy - py * ux) > YIELD_SIDE) {
      this.yielded = 0;
      return 1;
    }
    this.yielded += deltaMs;
    return this.yielded < YIELD_MS ? 0 : YIELD_CRAWL;
  }

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

    // Parado con el móvil de cara o de perfil, el móvil ya va pintado en sus manos (rest): sin icono encima.
    const inHands = this.icon === 'phone' && !this.moving && this.dir !== 'up';
    this.iconImage.setVisible(this.icon !== null && !inHands);
    if (!this.icon || inHands) return;
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
