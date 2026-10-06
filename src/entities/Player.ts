import Phaser from 'phaser';
import { lampShadow } from '../world/LampShadows';
import { PLAYER_BODY, PLAYER_SPEED } from '../config/constants';
import type { Facing } from '../types/game';
import { PLAYER_H } from '../world/TextureFactory';
import { HD_H, HD_SCALE, HD_W } from '../world/HumanArtHD';
import { every } from '../world/Motion';
import { BENCH_BAR, RACK_EMPTY, REPS, SETUP_MS } from './Character';
import type { Motion } from '../data/stations';

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
  /** De noche, la sombra larga de la farola más cercana (world/LampShadows). */
  private readonly lampShade: Phaser.GameObjects.Image;
  /** Sentado o yendo a sentarse o a levantarse: no anda con las teclas. */
  private seat: { facing: Facing; lift: number; since: number; settled: boolean } | null = null;
  /** Entrenando en una máquina o en su sitio (data/stations.ts), o yendo a ella: tampoco anda con las teclas. */
  private training: { motion: Motion | 'basket'; facing: Facing; sits: boolean; sets: boolean; since: number; settled: boolean; x: number; y: number } | null = null;
  /** Lo que se ve de la máquina mientras se usa: la banda, la jaula vacía (debajo) y la barra (encima). */
  private gearUnder?: Phaser.GameObjects.Image;
  private gearOver?: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, facing: Facing) {
    super(scene, x, y, `player-${facing}-0`);
    this.dir = facing;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    // Sus texturas son de 28 × 42 (world/HumanArtHD): a escala 16/28 mide lo mismo que siempre en el mundo.
    this.setScale(HD_SCALE);

    // El cuerpo se da en píxeles de la textura y Phaser lo escala con el sprite: en el mundo, el de siempre.
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(PLAYER_BODY.width / HD_SCALE, PLAYER_BODY.height / HD_SCALE);
    body.setOffset((HD_W - PLAYER_BODY.width / HD_SCALE) / 2, HD_H - PLAYER_BODY.height / HD_SCALE);
    body.setCollideWorldBounds(true);

    this.shadow = scene.add.image(x, y, 'fx-shadow').setOrigin(0.5, 0.5);
    this.lampShade = scene.add.image(x, y, 'fx-shadow-long').setOrigin(0, 0.5).setVisible(false);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.shadow.destroy();
      this.lampShade.destroy();
      this.gearUnder?.destroy();
      this.gearOver?.destroy();
    });
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

  /** Entrenando del todo (ya en su sitio, no a medio camino). */
  get isTraining(): boolean {
    return this.training?.settled ?? false;
  }

  /** Yendo a una máquina, entrenando o volviendo de ella: las teclas de andar no le mueven. */
  get isBusyTraining(): boolean {
    return this.training !== null;
  }

  move(input: MoveInput): void {
    if (this.seat || this.training) return;
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
    // Sentado sigue sentado aunque se abra un menú o una conversación; entrenando, también.
    if (this.seat || this.training) return;
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

  /**
   * Va al puesto que tiene los pies en (x, y) y empieza a entrenar de cara a `facing`: se sube a la máquina o se
   * coloca delante, con el mismo cuerpo, poses y repeticiones que la gente del gimnasio (entities/Character).
   * Sin cuerpo desde el primer paso: la máquina es sólida y va a subirse a ella.
   */
  startTraining(x: number, y: number, facing: Facing, motion: Motion | 'basket', sits: boolean, sets: boolean): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.enable = false;
    this.training = { motion, facing, sits, sets, since: 0, settled: false, x, y };
    this.glide(x, y, () => {
      if (!this.training) return;
      this.anims.stop();
      this.training = { ...this.training, since: this.scene.time.now, settled: true };
    });
  }

  /** Acaba (o corta) el entrenamiento: baja de la máquina, vuelve andando a (x, y) y recupera el cuerpo. */
  stopTraining(x: number, y: number, then?: () => void): void {
    if (!this.training) return;
    this.training.settled = false;
    this.gear('under', null);
    this.gear('over', null);
    this.setOrigin(0.5, 1);
    this.glide(x, y, () => {
      this.training = null;
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.enable = true;
      body.reset(x, y);
      this.halt();
      then?.();
    });
  }

  /**
   * Entrenando, cada frame: primero se coloca (ajusta el asiento, carga la barra), luego repite el movimiento de su
   * máquina y, si va por series, descansa entre una y otra sin bajarse. Es el mismo movimiento que ve el jugador
   * en la gente (entities/Character), con las mismas poses y los mismos accesorios.
   */
  trainingFrame(time: number, sets?: { work: number; rest: number }): void {
    const tr = this.training;
    if (!tr?.settled) return;
    const t = time - tr.since;
    const dir = tr.facing;
    // Siempre desde su sitio de verdad: lo que se mueve un píxel (respirar al estirar) no se acumula.
    const x = tr.x;
    const y = tr.y;
    this.setPosition(x, y);
    let working = t >= SETUP_MS;
    if (working && tr.sets && sets) working = (t - SETUP_MS) % (sets.work + sets.rest) < sets.work;
    let under: string | null = null;
    let over: string | null = null;
    let barY = 0;
    this.dir = dir;
    const reps = REPS[tr.motion];
    if (!working) {
      // Colocándose o entre series: de pie, o sentado en la máquina.
      this.anims.stop();
      this.setTexture(`player-${dir}-${tr.sits ? 4 : 0}`);
    } else if (tr.motion === 'treadmill') {
      this.anims.play(`player-walk-${dir}`, true);
      this.anims.timeScale = 1.75;
      under = `fx-belt-${Math.floor(time / 70) % 2}`;
    } else if (reps) {
      this.anims.stop();
      const half = Math.floor(time / reps[2]) % 2;
      this.setTexture(`player-${dir}-${half ? reps[1] : reps[0]}`);
      under = RACK_EMPTY[tr.motion] ?? null;
      if (tr.motion === 'bench') {
        over = 'fx-barbell';
        barY = BENCH_BAR[half];
      }
      if (tr.motion === 'shoot') {
        over = 'fx-ball';
        barY = half ? 12 : -4;
      }
    } else if (tr.motion === 'stretch') {
      // Estirando en el suelo, respirando; de vez en cuando suelta el estiramiento.
      this.anims.stop();
      const hold = Math.floor(time / 2_600) % 2;
      this.setTexture(`player-${dir}-22`);
      if (hold) this.setY(y - 1);
    }
    this.anims.timeScale = tr.motion === 'treadmill' && working ? 1.75 : 1;
    this.gear('under', under, x, under?.startsWith('fx-belt') ? y - 2 : y, y - 0.5);
    this.gear('over', over, x, y - 24 + barY, y + 0.5);
    this.sync();
  }

  /**
   * Tirando a canasta (systems/Basketball): la pose del momento (de pie, preparado, suelta, sigue la mano) y lo que
   * sube del suelo al saltar. Siempre desde su sitio de verdad, mirando a la canasta.
   */
  courtFrame(pose: number, lift: number): void {
    const tr = this.training;
    if (!tr?.settled) return;
    this.dir = tr.facing;
    this.anims.stop();
    this.setTexture(`player-${tr.facing}-${pose}`);
    this.setPosition(tr.x, tr.y - lift);
    this.gear('under', null);
    this.gear('over', null);
    this.sync();
  }

  /** Un accesorio de la máquina (la banda, la jaula vacía, la barra), o fuera si no hay. */
  private gear(which: 'under' | 'over', key: string | null, x = 0, y = 0, depth = 0): void {
    let img = which === 'under' ? this.gearUnder : this.gearOver;
    if (!key) {
      img?.setVisible(false);
      return;
    }
    if (!img) {
      img = this.scene.add.image(0, 0, key).setOrigin(0.5, which === 'under' ? 1 : 0.5);
      if (which === 'under') this.gearUnder = img;
      else this.gearOver = img;
    }
    img.setTexture(key).setPosition(Math.round(x), Math.round(y)).setDepth(depth).setVisible(true);
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
    lampShadow(this.lampShade, this.x, this.y, this.visible);
  }
}
