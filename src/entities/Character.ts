import Phaser from 'phaser';
import { every } from '../world/Motion';
import { TILE } from '../config/constants';
import type { Facing, NpcDef } from '../types/game';
import { findPoint } from '../systems/Navigation';
import { PEOPLE, personFrame } from '../world/TextureFactory';
import type { Pose } from '../world/HumanArt';
import { getStation, STATIONS, type Motion, type StationDef } from '../data/stations';
import type { SeatIdle } from '../data/seating';
import { seatAt, seatIdle } from '../systems/Seating';

/**
 * Lo que se ve hacer a alguien parado. No es IA: sale del sitio donde está
 * (una silla, una cinta) y de lo que su sistema ya dice que hace.
 */
export type Activity =
  | 'idle' | 'sit' | 'read' | 'run' | 'lift' | 'phone' | 'talk' | 'dance' | 'eat' | 'drink' | 'sip' | 'cheer'
  | 'sit-phone' | 'sit-talk' | 'smoke' | 'watch' | 'dine'
  | Motion;

/** La música de la sala: 120 pulsaciones. Todos bailan al mismo compás, cada uno a su manera. */
const BEAT_MS = 500;
const DANCE_TURNS: readonly Facing[] = ['down', 'left', 'down', 'right', 'up', 'down'];
/** Media repetición con las pesas. */
const LIFT_MS = 900;

/** El puesto de cada movimiento (data/stations.ts): cada máquina tiene el suyo. */
const STATION_OF = new Map<string, StationDef>(Object.values(STATIONS).map((s: StationDef) => [s.motion, s]));
/** Al llegar a un puesto: colocarse, ajustar el asiento, cargar la barra. Luego empieza. */
const SETUP_MS = 1_300;

/**
 * Repeticiones en un puesto: las dos poses entre las que va y cuánto dura cada
 * mitad. Cada uno arranca en su punto del movimiento (por semilla).
 */
const REPS: Readonly<Record<string, readonly [Pose, Pose, number]>> = {
  bike: [13, 14, 190],
  row: [19, 20, 760],
  bench: [11, 12, 1_050],
  squat: [17, 18, 1_250],
  curl: [15, 16, 950],
  cable: [23, 0, 1_100],
};

/** Mientras se levanta la barra, la jaula se pinta vacía encima de la de verdad (world/PropArt). */
const RACK_EMPTY: Readonly<Record<string, string>> = { bench: 'prop-bench-press-empty', squat: 'prop-squat-rack-empty' };
/** Altura de la barra del banco en px desde arriba de la celda, con los brazos doblados y estirados. */
const BENCH_BAR = [6, 4] as const;

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
}

/** Dónde queda la mesa según hacia dónde mira quien está sentado, en px desde sus pies. */
const TABLE_OFFSET: Readonly<Record<Facing, readonly [number, number]>> = { up: [0, -TILE - 3], down: [0, TILE - 7], left: [-TILE, -7], right: [TILE, -7] };

/**
 * Sentado (data/seating.ts): descansando, leyendo, comiendo o bebiendo a la
 * mesa, con el móvil, charlando, fumando o mirando pasar a la gente.
 */
const SEATED: ReadonlySet<Activity> = new Set(['sit', 'read', 'eat', 'drink', 'sit-phone', 'sit-talk', 'smoke', 'watch', 'dine']);
const WAITING = new Set(['WAIT', 'QUEUE', 'REST', 'BREAK']);
// Quien atiende una mesa también habla: toma nota, sirve, cobra (systems/TableService).
const TALKING = new Set(['MEETING', 'ORDER', 'CHECK_IN', 'CHECKOUT', 'TALK', 'TAKING_ORDER', 'TAKING_PAYMENT', 'SERVING']);
/** Lo que se hace sentado sin nada más que hacer, como se ve. */
const SEAT_IDLE: Readonly<Record<SeatIdle, Activity>> = { rest: 'sit', phone: 'sit-phone', watch: 'watch', smoke: 'smoke', read: 'read', talk: 'sit-talk' };
/** Al llegar al asiento, un instante a medio sentarse antes de apoyarse del todo. */
const SIT_DOWN_MS = 260;

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
  /**
   * Hacia dónde está el jugador mientras hablan. Sólo cambia cómo se le ve:
   * quien lo mueve (Crowd, StreetLife, WorldScene) es quien lo tiene quieto.
   */
  talkingTo: Facing | null = null;
  private readonly shadow: Phaser.GameObjects.Image;
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

  constructor(scene: Phaser.Scene, def: NpcDef, seed = 0) {
    super(scene, 0, 0, PEOPLE, personFrame(def.id, 'down'));
    this.def = def;
    this.seed = seed;
    scene.add.existing(this);
    this.setOrigin(0.5, 1);
    this.shadow = scene.add.image(0, 0, 'fx-shadow').setOrigin(0.5, 0.5);
    this.icon = scene.add.image(0, 0, 'fx-phone').setOrigin(0.5, 1).setVisible(false);
    this.umbrellaImg = scene.add.image(0, 0, 'fx-umbrella-0').setOrigin(0.5, 1).setVisible(false);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.shadow.destroy();
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

  /** El pozo de world/CrowdView: el mismo sprite pasa a ser otra persona. */
  reuse(def: NpcDef, seed: number): void {
    this.def = def;
    this.seed = seed;
    this.talkingTo = null;
    this.umbrella = null;
    this.doing = null;
    this.anims.stop();
  }

  /** Empieza un bucle desde un punto propio (por semilla), no desde el primer frame como todos. */
  private loop(key: string): void {
    if (this.anims.currentAnim?.key === key && this.anims.isPlaying) return;
    this.anims.play(key);
    this.anims.setProgress(((this.seed * 0.618034) % 1 + 1) % 1);
  }

  /** null: está en otro sitio o dentro de un edificio. */
  place(where: Placement | null, time = 0): void {
    this.setVisible(where !== null);
    this.shadow.setVisible(where !== null);
    if (!where) {
      this.icon.setVisible(false);
      this.umbrellaImg.setVisible(false);
      this.gear('under', null);
      this.gear('over', null);
      this.doing = null;
      this.anims.stop();
      return;
    }
    // En un puesto: primero se coloca (de pie o sentado en la máquina), luego trabaja y,
    // si va por series, descansa entre una y otra sin bajarse; con el móvil, a veces.
    const asked = where.moving ? 'walk' : (where.activity ?? 'idle');
    if (asked !== this.doing) {
      this.doing = asked;
      this.since = time;
    }
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
    const lift = !where.moving && SEATED.has(where.activity ?? 'idle') ? (where.lift ?? 0) : 0;
    // El paraguas va por encima de la cabeza, andando o de pie; sentado en una mesa, cerrado.
    const seated = SEATED.has(where.activity ?? 'idle') && !where.moving;
    if (this.umbrella !== null && !seated) this.umbrellaImg.setTexture(`fx-umbrella-${this.umbrella}`).setPosition(x, y - 19).setDepth(y + 2).setVisible(true);
    else this.umbrellaImg.setVisible(false);

    const id = this.def.id;
    // Andando se le ve andar; si corre (un corredor del parque), correr.
    const activity = where.moving ? (where.activity === 'run' ? 'run' : 'walk') : (where.activity ?? 'idle');
    // Cada uno a su compás: ni todos respiran a la vez ni todos dan el paso al mismo tiempo.
    // En la cinta, uno de cada tres camina a paso ligero; los demás corren.
    const pace = activity === 'run' ? 1.6 : activity === 'treadmill' ? (this.seed % 3 === 0 ? 1.05 : 1.75) : 1;
    this.anims.timeScale = pace * (0.9 + (this.seed % 5) * 0.05);
    const reps = REPS[activity];
    let under: string | null = null;
    let over: string | null = null;
    let barY = 0;
    if (activity === 'walk' || activity === 'run' || activity === 'treadmill') {
      this.loop(`npc-${id}-walk-${where.dir}`);
      // La banda corre hacia atrás bajo los pies, al paso de quien va encima.
      if (activity === 'treadmill') under = `fx-belt-${Math.floor(time / (pace > 1.5 ? 70 : 120)) % 2}`;
    } else if (reps) {
      // Repeticiones: de una pose a la otra, cada uno a su ritmo y desde su punto.
      this.anims.stop();
      const half = Math.floor((time + this.seed * 431) / (reps[2] * (0.92 + (this.seed % 4) * 0.05))) % 2;
      this.setTexture(PEOPLE, personFrame(id, where.dir, half ? reps[1] : reps[0]));
      under = RACK_EMPTY[activity] ?? null;
      // La barra del banco va en las manos: abajo en el pecho o arriba con los brazos estirados.
      if (activity === 'bench') {
        over = 'fx-barbell';
        barY = BENCH_BAR[half];
      }
    } else if (activity === 'stretch') {
      // Unos estiran en el suelo (y respiran); otros de pie, subiendo los brazos y soltando.
      this.anims.stop();
      const hold = Math.floor((time + this.seed * 613) / 2_600) % 2;
      if (this.seed % 2 === 0) {
        this.setTexture(PEOPLE, personFrame(id, where.dir, 22));
        if (hold) this.setY(y - 1);
      } else this.setTexture(PEOPLE, personFrame(id, where.dir, hold ? 21 : 0));
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
      this.setTexture(PEOPLE, personFrame(id, dir, pose));
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
      this.setTexture(PEOPLE, personFrame(id, dir, beat % 2 === 0 ? 1 : 2));
      this.setY(y - (t % step < step / 2 ? 1 : 0));
    } else if (activity === 'phone') {
      // Cabeza gacha y el móvil entre las manos, quieto.
      this.anims.stop();
      this.setTexture(PEOPLE, personFrame(id, where.dir, 5));
    } else if (activity === 'cheer') {
      // Jalea: el puño arriba y abajo, cada uno a su compás, con un salto de un píxel al subir.
      this.anims.stop();
      const up = Math.floor((time + this.seed * 263) / 320) % 2 === 0;
      this.setTexture(PEOPLE, personFrame(id, where.dir, up ? 7 : 0));
      if (up) this.setY(y - 1);
    } else if (activity === 'lift') {
      // Repeticiones: arriba y abajo, cada uno a su ritmo.
      this.anims.stop();
      const up = Math.floor((time + this.seed * 431) / LIFT_MS) % 2 === 0;
      this.setTexture(PEOPLE, personFrame(id, where.dir, up ? 6 : 0));
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
    } else if (activity === 'smoke') {
      // El cigarro en la mano, que sube a la boca de vez en cuando; al bajarlo, una bocanada que se va.
      const drag = every(time, this.seed * 11, 5_200 + (this.seed % 4) * 600, 900);
      const side = where.dir === 'left' ? -5 : 5;
      this.icon.setTexture('fx-cigarette').setPosition(x + side, top - (drag ? 12 : 7)).setDepth(y + 1).setVisible(true);
      if (every(time + 900, this.seed * 11, 5_200 + (this.seed % 4) * 600, 1_400)) over = 'fx-smoke';
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
    this.gear('over', over, over === 'fx-smoke' ? x + (where.dir === 'left' ? -3 : 3) : x, over === 'fx-smoke' ? top - 25 : y - 24 + barY, y + 0.5);
  }
}
