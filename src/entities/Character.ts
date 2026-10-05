import Phaser from 'phaser';
import { lampShadow } from '../world/LampShadows';
import { every } from '../world/Motion';
import { TILE } from '../config/constants';
import type { Facing, NpcDef } from '../types/game';
import { findPoint } from '../systems/Navigation';
import { personFrame, personScale, personTexture } from '../world/TextureFactory';
import type { Pose } from '../world/HumanArt';
import { getStation, STATIONS, type Motion, type StationDef } from '../data/stations';
import type { SeatIdle } from '../data/seating';
import { seatAt, seatIdle } from '../systems/Seating';
import type { AmbientFrame } from '../systems/AmbientActions';
import type { AmbientLook, AmbientProp } from '../data/ambientActions';
import { SmokeFx } from '../world/SmokeFx';

/**
 * Lo que se ve hacer a alguien parado. No es IA: sale del sitio donde está
 * (una silla, una cinta) y de lo que su sistema ya dice que hace.
 */
export type Activity =
  | 'idle' | 'sit' | 'read' | 'run' | 'lift' | 'phone' | 'talk' | 'dance' | 'eat' | 'drink' | 'sip' | 'cheer'
  | 'sit-phone' | 'sit-talk' | 'watch' | 'dine'
  | Motion;

/** La música de la sala: 120 pulsaciones. Todos bailan al mismo compás, cada uno a su manera. */
const BEAT_MS = 500;
const DANCE_TURNS: readonly Facing[] = ['down', 'left', 'down', 'right', 'up', 'down'];
/** Media repetición con las pesas. */
const LIFT_MS = 900;

/** El puesto de cada movimiento (data/stations.ts): cada máquina tiene el suyo. */
const STATION_OF = new Map<string, StationDef>(Object.values(STATIONS).map((s: StationDef) => [s.motion, s]));
/** Al llegar a un puesto: colocarse, ajustar el asiento, cargar la barra. Luego empieza. */
export const SETUP_MS = 1_300;

/**
 * Repeticiones en un puesto: las dos poses entre las que va y cuánto dura cada
 * mitad. Cada uno arranca en su punto del movimiento (por semilla).
 */
export const REPS: Readonly<Record<string, readonly [Pose, Pose, number]>> = {
  bike: [13, 14, 190],
  row: [19, 20, 760],
  bench: [11, 12, 1_050],
  squat: [17, 18, 1_250],
  curl: [15, 16, 950],
  cable: [23, 0, 1_100],
  // Al aire libre y en el salón recreativo: dominadas, tiros a canasta, pulsar botones y pisar la máquina de ritmo.
  hang: [23, 16, 1_100],
  shoot: [6, 15, 650],
  play: [5, 0, 400],
  step: [1, 2, 260],
};

/** Mientras se levanta la barra, la jaula se pinta vacía encima de la de verdad (world/PropArt). */
export const RACK_EMPTY: Readonly<Record<string, string>> = { bench: 'prop-bench-press-empty', squat: 'prop-squat-rack-empty' };
/** Altura de la barra del banco en px desde arriba de la celda, con los brazos doblados y estirados. */
export const BENCH_BAR = [6, 4] as const;

/** Dónde está y cómo: lo único que necesita para pintarse. */
export interface Placement {
  /** En tiles, con decimales mientras camina. */
  tx: number;
  ty: number;
  dir: Facing;
  moving: boolean;
  activity?: Activity;
  /** Sentado en algo alto (un taburete): px que sube el cuerpo. La sombra se queda en el suelo. */
  lift?: number;
  /** Lo que lleva en las manos quien sirve (systems/TableService): la bandeja o la vajilla sucia. */
  carry?: 'tray' | 'dishes';
  /** Un gesto de ambiente en curso (systems/AmbientActions): manda sobre la actividad al pintarse. */
  ambient?: AmbientPlacement;
}

/** El tramo del gesto, cuándo empezó (para soltar cada bocanada una sola vez) y hacia dónde queda quien acompaña. */
export interface AmbientPlacement {
  frame: AmbientFrame;
  start: number;
  companion?: Facing;
  /** Sentado a una mesa o una barra (no en un banco): no se gira a mirar a otro lado. */
  table?: boolean;
}

/** El dibujo de cada cosa que se lleva en un gesto (world/AmbientArt y los de siempre). */
const PROP_TEXTURE: Readonly<Record<AmbientProp, string>> = {
  cigarette: 'fx-cigarette', cup: 'fx-cup', mug: 'fx-mug', plate: 'fx-plate', book: 'fx-book', bags: 'fx-bags', glow: 'fx-phone',
};

/** Hacia dónde mira en un tramo: a un lado (cada uno el suyo), al otro, o hacia quien le acompaña. */
function lookTowards(look: AmbientLook | undefined, base: Facing, companion: Facing | undefined, seed: number): Facing {
  if (!look) return base;
  if (look === 'companion') return companion ?? base;
  const vertical = base === 'up' || base === 'down';
  const aside: Facing = vertical ? (seed % 2 ? 'left' : 'right') : 'down';
  if (look === 'aside') return aside;
  // Al otro lado; de perfil, vuelve a mirar al frente.
  return vertical ? (aside === 'left' ? 'right' : 'left') : base;
}

/** Dónde queda la mesa según hacia dónde mira quien está sentado, en px desde sus pies. */
const TABLE_OFFSET: Readonly<Record<Facing, readonly [number, number]>> = { up: [0, -TILE - 3], down: [0, TILE - 7], left: [-TILE, -7], right: [TILE, -7] };

/**
 * Sentado (data/seating.ts): descansando, leyendo, comiendo o bebiendo a la
 * mesa, con el móvil, charlando, fumando o mirando pasar a la gente.
 */
const SEATED: ReadonlySet<Activity> = new Set(['sit', 'read', 'eat', 'drink', 'sit-phone', 'sit-talk', 'watch', 'dine']);
const WAITING = new Set(['WAIT', 'QUEUE', 'REST', 'BREAK']);
// Quien atiende una mesa también habla: toma nota, sirve, cobra (systems/TableService).
const TALKING = new Set(['MEETING', 'ORDER', 'CHECK_IN', 'CHECKOUT', 'TALK', 'TAKING_ORDER', 'TAKING_PAYMENT', 'SERVING']);
/** Lo que se hace sentado sin nada más que hacer, como se ve. */
const SEAT_IDLE: Readonly<Record<SeatIdle, Activity>> = { rest: 'sit', phone: 'sit-phone', watch: 'watch', read: 'read', talk: 'sit-talk' };
/** Al llegar al asiento, un instante a medio sentarse antes de apoyarse del todo. */
const SIT_DOWN_MS = 260;
/** Al levantarse, un instante de pie antes de echar a andar. */
const RISE_MS = 220;
/** Una media vuelta pasa por un perfil durante esto. */
const TURN_MS = 90;
/**
 * Velocidad (tiles/s) a la que el paso de 8 fps no resbala: cuatro pasos por
 * segundo de medio tile. Corriendo, la zancada es más larga.
 */
const WALK_REF = 2;
const RUN_REF = 2.6;
const OPPOSITE: Readonly<Record<Facing, Facing>> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/**
 * Actividad visible en un punto: en un asiento o un puesto de mesa, sentado;
 * en la cinta, corriendo; en una cola o un descanso, a veces con el móvil; en
 * una reunión o un mostrador, hablando. `seed` reparte el móvil sin azar.
 */
export function activityAt(point: string | undefined, state: string | undefined, seed: number): Activity {
  const p = point ? findPoint(point) : undefined;
  // Un puesto de uso manda: la cinta es correr y el banco, press. Al acabar (FINISH), se incorpora.
  const station = p?.use ? getStation(p.use) : undefined;
  if (station) return state === 'FINISH' ? station.settle : station.motion;
  if (point?.includes('_DANCE_') || state === 'DANCE') return 'dance';
  if (state === 'CHEER') return 'cheer';
  // Sentado: a la mesa, con plato si come y con taza si bebe; si no, lo que dé de sí su asiento
  // (en un banco de la calle, el móvil, un cigarro o mirar pasar a la gente; en una silla, charlar).
  if (p?.kind === 'seat' || point?.includes('_DESK_')) {
    if (state === 'EAT' || state === 'DRINK' || state === 'READ') return state === 'EAT' ? 'eat' : state === 'DRINK' ? 'drink' : 'read';
    // A la mesa con servicio: lo que tiene delante lo pone world/ServiceView; aquí, el gesto de comer.
    if (state === 'DINE') return 'dine';
    if (state === 'PHONE') return 'sit-phone';
    if (state && TALKING.has(state)) return 'sit-talk';
    const seat = seatAt(point);
    return seat ? SEAT_IDLE[seatIdle(seat, seed)] : 'sit';
  }
  if (state === 'PHONE') return 'phone';
  // Bebiendo de pie (en un corro, en la barra): con la copa en la mano.
  if (state === 'DRINK') return 'sip';
  if (p?.kind === 'meet' || (state && TALKING.has(state))) return 'talk';
  if (p?.kind === 'wait' || (state && WAITING.has(state))) return seed % 3 === 0 ? 'idle' : 'phone';
  return 'idle';
}

/**
 * Persona que se coloca cada frame desde fuera: personajes con nombre
 * (systems/Characters.ts) y gente de los locales (world/CrowdView.ts). No
 * decide nada. Sin cuerpo físico: su camino ya esquiva lo sólido y no debe
 * quedarse enganchada en el jugador.
 */
export class Character extends Phaser.GameObjects.Sprite {
  def: NpcDef;
  /** La capa visual puede cambiar sin cambiar la identidad ni el diálogo. */
  private lookId: string;
  /**
   * Hacia dónde está el jugador mientras hablan. Sólo cambia cómo se le ve:
   * quien lo mueve (Crowd, StreetLife, WorldScene) es quien lo tiene quieto.
   */
  talkingTo: Facing | null = null;
  private readonly shadow: Phaser.GameObjects.Image;
  /** De noche, la sombra larga que le echa la farola más cercana (world/LampShadows). */
  private readonly lampShade: Phaser.GameObjects.Image;
  private readonly icon: Phaser.GameObjects.Image;
  /** Paraguas abierto (world/WeatherView lo dibuja; world/CrowdView decide quién lo lleva). */
  private readonly umbrellaImg: Phaser.GameObjects.Image;
  /** Qué paraguas lleva abierto ahora, o null. */
  umbrella: number | null = null;
  private seed: number;
  /** Lo que se le pidió hacer y desde cuándo: en un puesto, cuánto lleva (colocarse, series, descansos). */
  private doing: Activity | 'walk' | null = null;
  private since = 0;
  /** Lo que va con la máquina mientras se usa: debajo de la persona (jaula vacía, banda) y encima (la barra). Se crean al usarse. */
  private under?: Phaser.GameObjects.Image;
  private over?: Phaser.GameObjects.Image;
  /** El último tramo que soltó humo y el último compás del hilo de la punta: cada bocanada, una vez. */
  private puffToken = '';
  private trailBeat = -1;
  /** El paso: dónde estaba el frame anterior y a qué velocidad va de verdad (tiles/s, suavizada). */
  private lastPos: { tx: number; ty: number; time: number } | null = null;
  private speed = 0;
  /** Media vuelta: hacia dónde mira de verdad, por qué perfil pasa y hasta cuándo. */
  private facing: Facing | null = null;
  private turnVia: Facing = 'left';
  private turnUntil = 0;
  /** Se acaba de levantar de un asiento: hasta cuándo se le ve incorporarse antes de andar. */
  private riseUntil = 0;
  private wasSeated = false;
  /** Acaba de pararse: el reposo empieza de pie y quieto, no a mitad de una respiración. */
  private settle = false;

  constructor(scene: Phaser.Scene, def: NpcDef, seed = 0) {
    super(scene, 0, 0, personTexture(def.id), personFrame(def.id, 'down'));
    this.def = def;
    this.lookId = def.id;
    this.seed = seed;
    scene.add.existing(this);
    this.setOrigin(0.5, 1);
    this.shadow = scene.add.image(0, 0, 'fx-shadow').setOrigin(0.5, 0.5);
    this.lampShade = scene.add.image(0, 0, 'fx-shadow-long').setOrigin(0, 0.5).setVisible(false);
    this.icon = scene.add.image(0, 0, 'fx-phone').setOrigin(0.5, 1).setVisible(false);
    this.umbrellaImg = scene.add.image(0, 0, 'fx-umbrella-0').setOrigin(0.5, 1).setVisible(false);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.shadow.destroy();
      this.lampShade.destroy();
      this.icon.destroy();
      this.umbrellaImg.destroy();
      this.under?.destroy();
      this.over?.destroy();
    });
  }

  /** Enseña (o esconde, con key null) lo que va con la máquina: debajo de la persona o encima. */
  private gear(which: 'under' | 'over', key: string | null, x = 0, y = 0, depth = 0): void {
    let img = which === 'under' ? this.under : this.over;
    if (!key) {
      img?.setVisible(false);
      return;
    }
    if (!img) {
      img = this.scene.add.image(0, 0, key).setOrigin(0.5, which === 'under' ? 1 : 0.5);
      if (which === 'under') this.under = img;
      else this.over = img;
    }
    img.setTexture(key).setPosition(x, y).setDepth(depth).setVisible(true);
  }

  /** Por series: si a los `t` ms de empezar está entre una y otra. Cada uno con su ritmo (por semilla). */
  private resting(station: StationDef, t: number): boolean {
    if (!station.sets) return false;
    const f = (n: number): number => ((this.seed * n) % 997) / 997;
    const lerp = ([a, b]: readonly [number, number], k: number): number => a + (b - a) * k;
    const work = lerp(station.sets.work, f(389));
    const rest = lerp(station.sets.rest, f(577));
    return t % (work + rest) >= work;
  }

  /**
   * Desplaza a la persona `dx` px después de colocarla (quien pelea se adelanta
   * al golpear y retrocede al encajar): su sombra de contacto va con ella.
   */
  shiftX(dx: number): void {
    this.setX(this.x + dx);
    this.shadow.setX(this.shadow.x + dx);
  }

  /** Cambia sólo el aspecto; conserva charla, actividad y posición. */
  setLook(id: string): void {
    this.lookId = id;
  }

  /** El pozo de world/CrowdView: el mismo sprite pasa a ser otra persona. */
  reuse(def: NpcDef, seed: number): void {
    this.def = def;
    this.lookId = def.id;
    this.seed = seed;
    this.talkingTo = null;
    this.umbrella = null;
    this.doing = null;
    this.puffToken = '';
    this.lastPos = null;
    this.speed = 0;
    this.facing = null;
    this.wasSeated = false;
    this.anims.stop();
  }

  /**
   * Empieza un bucle desde un punto propio (por semilla), no desde el primer
   * frame como todos; salvo al pararse, que el reposo empieza de pie y quieto.
   */
  private loop(key: string): void {
    if (this.anims.currentAnim?.key === key && this.anims.isPlaying) return;
    this.anims.play(key);
    this.anims.setProgress(this.settle ? 0 : ((this.seed * 0.618034) % 1 + 1) % 1);
    this.settle = false;
  }

  /**
   * El compás del paso sale de la velocidad a la que va de verdad: quien pasea
   * da pasos más lentos que quien tiene prisa, y el pie no resbala sobre el
   * suelo. Cada uno con su zancada (por semilla).
   */
  private cadence(run: boolean): number {
    const stride = 0.94 + (this.seed % 5) * 0.03;
    return Math.min(2.4, Math.max(0.5, this.speed / (run ? RUN_REF : WALK_REF))) / stride;
  }

  /**
   * Hacia dónde se le ve mirar: una media vuelta (de subir a bajar, de ir a
   * la izquierda a ir a la derecha) pasa un instante por un perfil en vez de
   * darse la vuelta de golpe.
   */
  private turned(dir: Facing, time: number): Facing {
    if (this.facing && dir === OPPOSITE[this.facing] && time >= this.turnUntil) {
      this.turnVia = dir === 'up' || dir === 'down' ? (this.seed % 2 ? 'left' : 'right') : 'down';
      this.turnUntil = time + TURN_MS;
    }
    this.facing = dir;
    return time < this.turnUntil ? this.turnVia : dir;
  }

  /** Recién levantado: de pie, un instante, antes de echar a andar. */
  private rising(where: Placement, time: number): boolean {
    if (!where.moving || time >= this.riseUntil) return false;
    this.anims.stop();
    this.setTexture(personTexture(this.lookId), personFrame(this.lookId, where.dir, 3));
    return true;
  }

  /** null: está en otro sitio o dentro de un edificio. */
  place(where: Placement | null, time = 0): void {
    // El aspecto de 28 × 42 (world/HumanArtHD) va a escala 16/28: mide lo mismo que los de 16 × 24.
    const scale = personScale(this.lookId);
    if (this.scaleX !== scale) this.setScale(scale);
    this.setVisible(where !== null);
    this.shadow.setVisible(where !== null);
    if (!where) this.lampShade.setVisible(false);
    if (!where) {
      this.icon.setVisible(false);
      this.umbrellaImg.setVisible(false);
      this.gear('under', null);
      this.gear('over', null);
      this.doing = null;
      this.lastPos = null;
      this.facing = null;
      this.anims.stop();
      return;
    }
    // El icono es de todos (móvil, plato, bocadillo): sólo lo que se sostiene en un gesto va en espejo.
    this.icon.setFlipX(false);
    // La velocidad de verdad, de un frame a otro (un salto de más de un tile y medio es aparecer, no andar).
    const dt = this.lastPos ? time - this.lastPos.time : 0;
    if (this.lastPos && dt > 0 && dt < 250) {
      const d = Math.hypot(where.tx - this.lastPos.tx, where.ty - this.lastPos.ty);
      if (d < 1.5) this.speed += ((d / dt) * 1000 - this.speed) * Math.min(1, dt / 120);
    }
    this.lastPos = { tx: where.tx, ty: where.ty, time };
    // En un puesto: primero se coloca (de pie o sentado en la máquina), luego trabaja y,
    // si va por series, descansa entre una y otra sin bajarse; con el móvil, a veces.
    const asked = where.moving ? 'walk' : (where.activity ?? 'idle');
    if (asked !== this.doing) {
      // Al pararse, el reposo empieza de pie; al levantarse de un asiento, se incorpora antes de andar.
      if (this.doing === 'walk') this.settle = true;
      if (asked === 'walk' && this.wasSeated) this.riseUntil = time + RISE_MS;
      this.doing = asked;
      this.since = time;
    }
    this.wasSeated = !where.moving && SEATED.has(where.activity ?? 'idle');
    // Media vuelta por un perfil (sentado se gira el cuerpo entero, no hace falta).
    if (!this.wasSeated) {
      const dir = this.turned(where.dir, time);
      if (dir !== where.dir) where = { ...where, dir };
    } else this.facing = where.dir;
    const station = where.moving || this.talkingTo ? undefined : STATION_OF.get(asked);
    if (station) {
      const t = time - this.since;
      const working = t >= SETUP_MS && !this.resting(station, t - SETUP_MS);
      if (!working) where = { ...where, activity: station.settle === 'sit' ? 'sit' : t >= SETUP_MS && this.seed % 3 === 0 ? 'phone' : 'idle' };
    }
    // Hablando: de pie y de cara; sentado, sigue sentado y mirando a su mesa.
    if (this.talkingTo && !(SEATED.has(where.activity ?? 'idle') && !where.moving)) {
      where = { ...where, moving: false, activity: 'idle', dir: this.talkingTo };
    }
    const x = where.tx * TILE + TILE / 2;
    const y = where.ty * TILE + TILE;
    this.setPosition(x, y).setDepth(y);
    this.shadow.setPosition(x, y - 1).setDepth(y - 1);
    lampShadow(this.lampShade, x, y);
    const lift = !where.moving && SEATED.has(where.activity ?? 'idle') ? (where.lift ?? 0) : 0;
    // El paraguas va por encima de la cabeza, andando o de pie; sentado en una mesa, cerrado.
    const seated = SEATED.has(where.activity ?? 'idle') && !where.moving;
    if (this.umbrella !== null && !seated) this.umbrellaImg.setTexture(`fx-umbrella-${this.umbrella}`).setPosition(x, y - 19).setDepth(y + 2).setVisible(true);
    else this.umbrellaImg.setVisible(false);

    const id = this.lookId;
    // Un gesto de ambiente lo pinta todo a su manera; hablando con el jugador, no.
    if (where.ambient && !this.talkingTo) {
      this.drawAmbient(where, where.ambient, x, y, lift, time);
      return;
    }
    // Andando se le ve andar; si corre (un corredor del parque), correr.
    const activity = where.moving ? (where.activity === 'run' ? 'run' : 'walk') : (where.activity ?? 'idle');
    // Cada uno a su compás: ni todos respiran a la vez ni todos dan el paso al mismo tiempo.
    // En la cinta, uno de cada tres camina a paso ligero; los demás corren.
    const pace = activity === 'run' ? 1.6 : activity === 'treadmill' ? (this.seed % 3 === 0 ? 1.05 : 1.75) : 1;
    // Andando o corriendo por el suelo, el compás sale de la velocidad; en la cinta, del ritmo de la máquina.
    this.anims.timeScale = where.moving ? this.cadence(activity === 'run') : pace * (0.9 + (this.seed % 5) * 0.05);
    const reps = REPS[activity];
    let under: string | null = null;
    let over: string | null = null;
    let barY = 0;
    if (activity === 'walk' && this.rising(where, time)) {
      // Recién levantado: de pie un instante (rising ya pone la pose).
    } else if (activity === 'walk' || activity === 'run' || activity === 'treadmill') {
      this.loop(`npc-${id}-walk-${where.dir}`);
      // La banda corre hacia atrás bajo los pies, al paso de quien va encima.
      if (activity === 'treadmill') under = `fx-belt-${Math.floor(time / (pace > 1.5 ? 70 : 120)) % 2}`;
    } else if (reps) {
      // Repeticiones: de una pose a la otra, cada uno a su ritmo y desde su punto.
      this.anims.stop();
      const half = Math.floor((time + this.seed * 431) / (reps[2] * (0.92 + (this.seed % 4) * 0.05))) % 2;
      this.setTexture(personTexture(id), personFrame(id, where.dir, half ? reps[1] : reps[0]));
      under = RACK_EMPTY[activity] ?? null;
      // La barra del banco va en las manos: abajo en el pecho o arriba con los brazos estirados.
      if (activity === 'bench') {
        over = 'fx-barbell';
        barY = BENCH_BAR[half];
      }
      // La pelota va en las manos: arriba al tirar, a la altura del pecho al recogerla.
      if (activity === 'shoot') {
        over = 'fx-ball';
        barY = half ? 12 : -4;
      }
    } else if (activity === 'stretch') {
      // Unos estiran en el suelo (y respiran); otros de pie, subiendo los brazos y soltando.
      this.anims.stop();
      const hold = Math.floor((time + this.seed * 613) / 2_600) % 2;
      if (this.seed % 2 === 0) {
        this.setTexture(personTexture(id), personFrame(id, where.dir, 22));
        if (hold) this.setY(y - 1);
      } else this.setTexture(personTexture(id), personFrame(id, where.dir, hold ? 21 : 0));
    } else if (SEATED.has(activity)) {
      // Sentado: al llegar, un instante a medio sentarse; luego respira (el tronco baja un píxel de vez en cuando).
      // Con el móvil, cabeza gacha; mirando pasar a la gente, se gira de lado un momento.
      this.anims.stop();
      const settling = time - this.since < SIT_DOWN_MS;
      const breath = every(time, this.seed, 3_600 + (this.seed % 4) * 350, 520);
      const bite = activity === 'dine' && every(time, this.seed * 5, 1_700 + (this.seed % 5) * 200, 650);
      const pose: Pose = settling ? 3 : activity === 'sit-phone' ? 25 : bite ? 26 : breath ? 24 : 4;
      const glance = activity === 'watch' && every(time, this.seed * 7 + 3, 6_500 + (this.seed % 3) * 1_700, 1_500);
      const dir: Facing = glance ? (where.dir === 'up' || where.dir === 'down' ? (this.seed % 2 ? 'left' : 'right') : 'down') : where.dir;
      this.setTexture(personTexture(id), personFrame(id, dir, pose));
    } else if (activity === 'dance') {
      // La misma música para todos, pero cada uno la baila a su manera: unos a cada
      // pulso, otros a medio tiempo y otros a contratiempo; y cada uno gira cuando le da.
      const style = this.seed % 3;
      const t = style === 2 ? time + BEAT_MS / 2 : time;
      const step = BEAT_MS * (style === 1 ? 2 : 1);
      const beat = Math.floor(t / step);
      const turnEvery = 2 + (this.seed % 2);
      const dir = DANCE_TURNS[(Math.floor(beat / turnEvery) + this.seed) % DANCE_TURNS.length];
      this.anims.stop();
      this.setTexture(personTexture(id), personFrame(id, dir, beat % 2 === 0 ? 1 : 2));
      this.setY(y - (t % step < step / 2 ? 1 : 0));
    } else if (activity === 'phone') {
      // Cabeza gacha y el móvil entre las manos, quieto.
      this.anims.stop();
      this.setTexture(personTexture(id), personFrame(id, where.dir, 5));
    } else if (activity === 'cheer') {
      // Jalea: el puño arriba y abajo, cada uno a su compás, con un salto de un píxel al subir.
      this.anims.stop();
      const up = Math.floor((time + this.seed * 263) / 320) % 2 === 0;
      this.setTexture(personTexture(id), personFrame(id, where.dir, up ? 7 : 0));
      if (up) this.setY(y - 1);
    } else if (activity === 'lift') {
      // Repeticiones: arriba y abajo, cada uno a su ritmo.
      this.anims.stop();
      const up = Math.floor((time + this.seed * 431) / LIFT_MS) % 2 === 0;
      this.setTexture(personTexture(id), personFrame(id, where.dir, up ? 6 : 0));
    } else if (activity === 'idle' && !this.talkingTo && every(time, this.seed, 6500 + (this.seed % 5) * 1100, 1100)) {
      // De pie sin nada que hacer, de vez en cuando mira a un lado: el personal, a la estantería; la gente, a la calle.
      const side = where.dir === 'up' || where.dir === 'down' ? (this.seed % 2 ? 'left' : 'right') : 'down';
      this.loop(`npc-${id}-idle-${side}`);
    } else this.loop(`npc-${id}-idle-${where.dir}`);
    // Hablando contigo asiente de vez en cuando: un píxel, a su compás.
    if (this.talkingTo && every(time, this.seed, 2300, 240)) this.setY(y - 1);
    if (lift) this.setY(this.y - lift);
    // Lo que va con el cuerpo (el móvil, el cigarro, el bocadillo de la charla), a su altura.
    const top = y - lift;

    // El móvil, en la mano; la charla, a ratos y cada uno a su compás.
    const talking = (activity === 'talk' || activity === 'sit-talk') && Math.floor((time + this.seed * 700) / 1800) % 3 === 0;
    if (activity === 'eat' || activity === 'drink') {
      // Lo que tiene delante va sobre la mesa, en el tile hacia el que mira.
      const [ox, oy] = TABLE_OFFSET[where.dir];
      this.icon.setTexture(activity === 'eat' ? 'fx-plate' : 'fx-cup').setPosition(x + ox, y + oy).setDepth(y + oy + 12).setVisible(true);
    } else if ((activity === 'phone' || activity === 'sit-phone') && where.dir === 'up') {
      // De espaldas no se ve el móvil del sprite: el brillo de la pantalla, junto a la mano.
      this.icon.setTexture('fx-phone').setPosition(x + 4, top - (activity === 'sit-phone' ? 6 : 9)).setDepth(y + 1).setVisible(true);
    } else if (activity === 'read') {
      // El libro abierto en el regazo; de espaldas asoma a un lado.
      const side = where.dir === 'up' ? 5 : where.dir === 'left' ? -3 : 3;
      this.icon.setTexture('fx-book').setPosition(x + side, y - 6).setDepth(y + 1).setVisible(true);
    } else if (activity === 'sip') {
      // De pie con la copa en la mano; cada uno da un trago cuando le toca, no todos a la vez.
      const raised = Math.floor((time + this.seed * 977) / 1400) % 5 === 0;
      const side = where.dir === 'left' ? -4 : where.dir === 'up' ? 5 : 4;
      this.icon.setTexture('fx-cup').setPosition(x + side, y - (raised ? 13 : 9)).setDepth(y + 1).setVisible(true);
    } else if (talking) {
      this.icon.setTexture('fx-talk').setPosition(x + 5, top - (SEATED.has(activity) ? 21 : 24)).setDepth(y + 1).setVisible(true);
    } else this.icon.setVisible(false);

    // La máquina en uso: entre la máquina (y - 1) y la persona (y) va lo de debajo; delante de ella, lo que sostiene.
    this.gear('under', under, x, under?.startsWith('fx-belt') ? y - 2 : y, y - 0.5);
    // La bandeja (o la vajilla) delante, a la altura de las manos; de espaldas queda detrás del cuerpo.
    if (where.carry) {
      const side = where.dir === 'left' ? -5 : where.dir === 'right' ? 5 : 0;
      this.gear('under', null);
      over = `fx-${where.carry}`;
      this.gear('over', over, x + side, y - 12, where.dir === 'up' ? y - 0.5 : y + 0.5);
      return;
    }
    this.gear('over', over, x, y - 24 + barY, y + 0.5);
  }

  /**
   * Un gesto de ambiente (data/ambientActions.ts): la pose del tramo, hacia
   * dónde mira, lo que lleva y dónde (la mano, la boca, la mesa, el regazo) y
   * el humo. Andando sigue andando y sólo cambia lo que lleva en la mano.
   */
  private drawAmbient(where: Placement, amb: AmbientPlacement, x: number, y: number, lift: number, time: number): void {
    const { step } = amb.frame;
    const id = this.lookId;
    const seated = !where.moving && SEATED.has(where.activity ?? 'idle');
    // A una mesa no se da la espalda al plato: sentado ahí sólo se gira hacia quien le acompaña.
    const look = seated && amb.table && step.look !== 'companion' ? undefined : step.look;
    const dir = where.moving ? where.dir : lookTowards(look, where.dir, amb.companion, this.seed);
    const top = y - lift;
    this.anims.timeScale = where.moving ? this.cadence(false) : 0.9 + (this.seed % 5) * 0.05;
    if (where.moving) {
      if (!this.rising(where, time)) this.loop(`npc-${id}-walk-${dir}`);
    }
    else if (seated) {
      // Sentado: al llegar, un instante a medio sentarse; luego la pose del tramo o respirar.
      this.anims.stop();
      const settling = time - this.since < SIT_DOWN_MS;
      const breath = every(time, this.seed, 3_600 + (this.seed % 4) * 350, 520);
      this.setTexture(personTexture(id), personFrame(id, dir, settling ? 3 : (step.sitPose ?? (breath ? 24 : 4))));
      if (lift) this.setY(this.y - lift);
    } else if (step.pose !== undefined) {
      this.anims.stop();
      this.setTexture(personTexture(id), personFrame(id, dir, step.pose));
    } else this.loop(`npc-${id}-idle-${dir}`);

    // La mano cercana, la boca y la mesa, en px desde los pies (sentado, tres más abajo el tronco).
    // Sacado de los píxeles de world/HumanArt: de frente y de espaldas las manos cuelgan en las
    // columnas 3 y 12 (±4 px del centro); de perfil, el brazo cercano cae junto al tronco (±2, un
    // poco adelantado para que lo que sostiene asome por delante). Con la mano en la boca (32/33),
    // la mano llega a la columna 6 de frente y a la 11 de perfil.
    const side = dir === 'left' ? -2 : dir === 'right' ? 2 : dir === 'up' ? 4 : -4;
    const hand = { x: x + side, y: top - (seated ? 6 : 8) };
    // En la boca, lo que se sostiene sale de la mano hacia fuera: de frente, hacia un lado; de perfil, por delante de la cara.
    const mouth = { x: x + (dir === 'left' ? -6 : dir === 'right' ? 6 : dir === 'up' ? 4 : -4), y: top - (seated ? 12 : 15) };
    // De espaldas, lo que va en la boca queda tras la cabeza; lo de la mano, no: la mano asoma por fuera del tronco.
    const front = y + 1;
    let at: { x: number; y: number; depth: number } | null = null;
    if (step.at === 'hand') at = { ...hand, y: hand.y + (step.prop === 'bags' ? 6 : 0), depth: front };
    else if (step.at === 'mouth') at = { ...mouth, depth: dir === 'up' ? y - 0.5 : front };
    else if (step.at === 'table') {
      const [ox, oy] = TABLE_OFFSET[where.dir];
      at = { x: x + ox, y: y + oy, depth: y + oy + 12 };
    } else if (step.at === 'lap') at = { x: x + (where.dir === 'up' ? 5 : where.dir === 'left' ? -3 : 3), y: y - 6, depth: y + 1 };

    // El móvil ya va dibujado en las manos de frente y de perfil: de espaldas o andando, su brillo.
    const glowHidden = step.prop === 'glow' && !where.moving && dir !== 'up';
    // Lo que se sostiene apunta hacia fuera (la brasa del cigarro, el asa): hacia la izquierda si está a la izquierda del cuerpo.
    const outward = step.at === 'mouth' ? dir === 'left' || dir === 'down' : step.at === 'hand' && side < 0;
    if (step.prop && at && !glowHidden) this.icon.setTexture(PROP_TEXTURE[step.prop]).setPosition(at.x, at.y).setDepth(at.depth).setFlipX(outward).setVisible(true);
    else if (step.talk && Math.floor((time + this.seed * 700) / 1800) % 3 !== 2) {
      this.icon.setTexture('fx-talk').setPosition(x + 5, top - (seated ? 21 : 24)).setDepth(y + 1).setVisible(true);
    } else this.icon.setVisible(false);

    // El humo: una bocanada al empezar el tramo que la tiene; un hilo suelto de la punta mientras se sostiene.
    if (step.puff || step.trail) {
      const smoke = SmokeFx.of(this.scene);
      const token = `${amb.start}|${amb.frame.key}`;
      if (step.puff && token !== this.puffToken) {
        this.puffToken = token;
        smoke.puff(mouth.x, mouth.y - 1, step.puff);
      }
      const beat = Math.floor((time + this.seed * 97) / 520);
      if (step.trail && at && beat !== this.trailBeat) {
        this.trailBeat = beat;
        smoke.wisp(at.x + (side > 0 ? 2 : -2), at.y - 1);
      }
    }
    this.gear('under', null);
    this.gear('over', null);
  }
}
