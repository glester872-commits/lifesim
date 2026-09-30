import Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { LocationDef, PropKind, Vec2 } from '../types/game';
import type { Weather } from '../systems/Weather';
import type { Traffic } from '../systems/Traffic';
import type { TrainSystem } from '../systems/TrainSystem';
import type { AmbientFx } from '../data/districts';
import { isOpen, placeForInterior, placesOfType, type PlaceInfo } from '../systems/Places';
import { profileAt } from '../systems/Districts';
import { PROPS } from './tiles';
import { LAYER, standing } from './Layers';
import { gust } from './Motion';
import { make, px } from './paint';
import { EMISSIVE_DEPTH, nightAt } from './Lighting';
import { glintLevel, kitchenSteam, sparkRate, splashRate, sprayRate } from '../systems/AmbientRules';

/**
 * Ambiente de ciudad: lo pequeño que cuenta qué pasa sin decirlo. Una hoja que
 * cruza el parque con la racha, vaho de una alcantarilla una mañana fría, el
 * café humeando en la terraza abierta, polvo en el haz de una ventana, humo de
 * un coche parado en el semáforo, el aire que levanta el tren al entrar.
 *
 * Nada sale "porque sí": cada fuente se saca de los datos al entrar (props,
 * locales, carriles, el andén) y sólo emite si su contexto lo pide (hora,
 * tiempo, zona de data/districts.ts, local abierto, tráfico parado, tren en
 * marcha). Sin filtros de pantalla ni bloom: partículas de 1–4 px, tenues.
 *
 * Con el agua, el fuego y las cocinas (reglas puras en systems/AmbientRules.ts,
 * comprobadas por scripts/check-ambience.ts): el extractor de cada cocina a la
 * hora de cocinar, el agua que levantan las ruedas y las pisadas en el suelo
 * encharcado, destellos en el mojado bajo farolas y locales abiertos de noche,
 * chispas mientras el tren frena, y plumas cuando una paloma echa a volar.
 *
 * Presupuesto: un pozo fijo de sprites que se reutilizan (ninguno se crea ni
 * se destruye en marcha), sólo cuentan las fuentes que caen cerca de la cámara,
 * se decide a 10 Hz y no a cada frame, y con el pozo lleno simplemente no sale
 * nada más. Los efectos que salen a ráfagas (chispas, agua, destellos, plumas)
 * tienen además su tope propio (CAPS): no pueden quedarse el pozo de las hojas
 * y el vaho. Con movimiento reducido, no hay ambiente.
 */

/** Sprites en el pozo: el techo de partículas vivas a la vez. */
export const MAX_PARTICLES = 72;
/** Cada cuánto se decide qué emite (ms reales). */
const TICK_MS = 100;
/** Margen alrededor de la cámara en el que una fuente cuenta. */
const MARGIN = TILE * 3;

type Kind = 'leaf' | 'paper' | 'steam' | 'mist' | 'mote' | 'exhaust' | 'grit' | 'hiss' | 'kitchen' | 'glint' | 'spark' | 'spray' | 'splash' | 'feather';

/** Tope a la vez de los efectos que salen a ráfagas. */
const CAPS: Readonly<Partial<Record<Kind, number>>> = { spark: 16, spray: 12, splash: 8, glint: 10, feather: 8 };
const LAMPS: readonly PropKind[] = ['lamp', 'street-lamp'];

interface Particle {
  img: Phaser.GameObjects.Image;
  kind: Kind;
  alive: boolean;
  age: number;
  life: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Donde toca el suelo lo que cae (hoja, arenilla): a partir de ahí se arrastra. */
  floor: number;
  alpha: number;
  grow: number;
  seed: number;
}

interface Source {
  kind: Kind;
  x: number;
  y: number;
  /** Emisiones por segundo en el mejor caso, ya con el peso de la zona. */
  rate: number;
  /** Cuánto del máximo toca ahora (0 = nada). */
  when: (c: Ctx) => number;
}

interface Ctx {
  time: number;
  hour: number;
  w: Weather;
  /** 0 de día, 1 noche cerrada (dentro, siempre 0). */
  night: number;
  opened: (p: PlaceInfo | undefined) => boolean;
}

export interface AtmosphereFeeds {
  weather: () => Weather;
  hour: () => number;
  day: () => number;
  traffic: () => Traffic | null;
  train: () => { train: TrainSystem; doors: readonly Vec2[]; edgeY: number; wheelsY: number; bogies: readonly number[] } | null;
  /** Pies de quien anda por la calle (px) y si anda: las pisadas en el suelo encharcado. */
  walkers?: () => readonly { x: number; y: number; moving: boolean }[];
}

/** Texturas del ambiente. Una vez, al arrancar. */
export function buildAtmosphereTextures(scene: Phaser.Scene): void {
  make(scene, 'fx-leaf', 3, 2, (ctx) => {
    px(ctx, '#ffffff', 0, 0, 2, 1);
    px(ctx, '#ffffff', 1, 1, 2, 1);
  });
  make(scene, 'fx-paper', 3, 2, (ctx) => px(ctx, '#ffffff', 0, 0, 3, 2));
  make(scene, 'fx-dot', 1, 1, (ctx) => px(ctx, '#ffffff', 0, 0, 1, 1));
  // Chispa: un trazo corto, como la ve el ojo en movimiento. Destello: una raya horizontal de luz sobre el agua.
  make(scene, 'fx-spark', 2, 1, (ctx) => px(ctx, '#ffffff', 0, 0, 2, 1));
  make(scene, 'fx-glint', 5, 1, (ctx) => px(ctx, '#ffffff', 1, 0, 3, 1));
}

const TREES: readonly PropKind[] = ['tree', 'plane-tree'];
const LITTER: readonly PropKind[] = ['debris', 'bin', 'bus-stop', 'poster-column'];
const VENTS: readonly PropKind[] = ['manhole', 'drain'];
const LEAF_TINTS = [0x6a9a4a, 0x8a9a3a, 0xc49a3a, 0xa8743a] as const;

/** Viento de 0 a 1: el tiempo no tiene viento propio, así que sale de las nubes y la lluvia. */
const windOf = (w: Weather): number => Math.min(1, 0.3 + w.cloud * 0.4 + w.rain * 0.4);

export class Atmosphere {
  private readonly scene: Phaser.Scene;
  private readonly feeds: AtmosphereFeeds;
  private readonly pool: Particle[] = [];
  private readonly sources: Source[] = [];
  private readonly off: boolean;
  private clock = 0;
  private lastTrain = '';
  /** Última bocanada de cada coche (id → ms), para que no eche humo a cada tick. */
  private readonly puffed = new Map<number, number>();
  /** Vivas de cada tipo (se rehace en cada paso): para los topes de CAPS. */
  private readonly kindLive = new Map<Kind, number>();
  private readonly outdoor: boolean;
  /** Para medir: cuántas partículas hay vivas y cuántas fuentes hay en el sitio. */
  live = 0;

  constructor(scene: Phaser.Scene, def: LocationDef, feeds: AtmosphereFeeds) {
    this.scene = scene;
    this.feeds = feeds;
    this.outdoor = def.kind === 'exterior';
    this.off = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (this.off) return;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const img = scene.add.image(0, 0, 'fx-dot').setVisible(false);
      this.pool.push({ img, kind: 'mote', alive: false, age: 0, life: 1, x: 0, y: 0, vx: 0, vy: 0, floor: 0, alpha: 1, grow: 0, seed: i });
    }
    this.collect(def);
  }

  get sourceCount(): number {
    return this.sources.length;
  }

  // ------------------------------------------------------------- fuentes

  private collect(def: LocationDef): void {
    const outdoor = def.kind === 'exterior';
    const room = placeForInterior(def.id);
    const zone = (tx: number, ty: number, fx: AmbientFx): number => profileAt(def, tx, ty)?.ambience?.[fx] ?? 1;
    const placeOf = new Map((['business', 'public'] as const).flatMap((t) => placesOfType(t)).flatMap((p) => (p.building ? [[p.building, p] as const] : [])));
    // El local de comida cuya puerta está a menos de 6 tiles: su terraza humea si está abierto.
    const food = (tx: number, ty: number): PlaceInfo | undefined => {
      for (const b of def.buildings ?? []) {
        const place = placeOf.get(b.id);
        if (!place?.tags.includes('food') || b.doorX === undefined) continue;
        if (Math.hypot(b.doorX - tx, (b.front === 'n' ? b.ty : b.ty + b.h) - ty) < 6) return place;
      }
      return undefined;
    };

    for (const p of def.props) {
      const prop = PROPS[p.kind];
      const cx = p.tx * TILE + ((prop.tilesWide ?? 1) * TILE) / 2;
      const foot = (p.ty + 1) * TILE;
      if (outdoor && TREES.includes(p.kind)) {
        // Hojas: alguna suelta siempre, muchas más con la racha encima; con chaparrón se quedan pegadas.
        this.sources.push({
          kind: 'leaf', x: cx, y: foot - TILE * 2, rate: 0.12 * zone(p.tx, p.ty, 'leaf'),
          when: (c) => (gust(c.time, cx) ? 3 : 0.25) * windOf(c.w) * (c.w.rain > 0.55 ? 0.3 : 1),
        });
      } else if (outdoor && LITTER.includes(p.kind)) {
        // Papeles: sólo con la racha encima y el suelo seco (mojados no vuelan).
        this.sources.push({
          kind: 'paper', x: cx, y: foot - 3, rate: 0.5 * zone(p.tx, p.ty, 'paper'),
          when: (c) => (gust(c.time, cx) && c.w.wet < 0.35 ? windOf(c.w) : 0),
        });
      } else if (outdoor && VENTS.includes(p.kind)) {
        // Vaho de alcantarilla: con frío, de madrugada o con el suelo mojado secándose. Nunca en pleno día de calor.
        this.sources.push({
          kind: 'mist', x: cx, y: foot - 6, rate: 1.4 * zone(p.tx, p.ty, 'steam'),
          when: (c) => Math.min(1, (c.w.celsius < 12 ? (12 - c.w.celsius) / 8 : 0) + (c.hour < 8 || c.hour > 22 ? 0.35 : 0) + (c.w.wet > 0.4 && c.w.rain < 0.1 ? 0.5 : 0)),
        });
      } else if (outdoor && p.kind === 'cafe-table') {
        const place = food(p.tx, p.ty);
        if (!place) continue;
        // La taza de la terraza: con el local abierto; se ve más con fresco y casi nada bajo la lluvia.
        this.sources.push({
          kind: 'steam', x: cx, y: foot - 11, rate: 0.9 * zone(p.tx, p.ty, 'steam'),
          when: (c) => (c.opened(place) ? (c.w.celsius < 18 ? 1 : 0.35) * (c.w.rain > 0.3 ? 0.2 : 1) : 0),
        });
      } else if (!outdoor && p.kind === 'espresso') {
        this.sources.push({ kind: 'steam', x: cx, y: foot - 14, rate: 1.2, when: (c) => (c.opened(room) ? 1 : 0) });
      } else if (!outdoor && (p.kind === 'table' || p.kind === 'cafe-table') && room?.tags.includes('food')) {
        // Un plato caliente en alguna mesa del restaurante o del café.
        this.sources.push({ kind: 'steam', x: cx, y: foot - 10, rate: 0.35, when: (c) => (c.opened(room) ? 1 : 0) });
      } else if (outdoor && LAMPS.includes(p.kind)) {
        // Destellos en el charco bajo la farola: sólo mojado y de noche.
        const gx = cx + 3;
        const gy = foot + 6;
        this.sources.push({ kind: 'glint', x: gx, y: gy, rate: 1.1 * zone(p.tx, p.ty, 'glint'), when: (c) => glintLevel(c.w, c.night) });
      } else if (!outdoor && p.kind === 'window') {
        // Polvo en el haz: de día, con sol, en la franja de suelo bajo la ventana.
        this.sources.push({
          kind: 'mote', x: cx, y: foot + TILE * 1.5, rate: 2.2,
          when: (c) => (c.hour > 8 && c.hour < 19 && c.opened(room) ? Math.max(0, 1 - c.w.cloud * 1.2) : 0),
        });
      }
    }

    if (!outdoor) return;
    for (const b of def.buildings ?? []) {
      const place = placeOf.get(b.id);
      if (!place || b.doorX === undefined || !b.front) continue;
      const doorY = b.front === 'n' ? b.ty * TILE - 4 : (b.ty + b.h) * TILE + 8;
      const frontTy = b.front === 'n' ? b.ty - 1 : b.ty + b.h;
      // La puerta de un local abierto también se refleja en la acera mojada.
      this.sources.push({ kind: 'glint', x: b.doorX * TILE + 8, y: doorY, rate: 0.7 * zone(b.doorX, frontTy, 'glint'), when: (c) => (c.opened(place) ? glintLevel(c.w, c.night) : 0) });
      // La cocina: el extractor del tejado, a un par de tiles de la fachada y del lado de la puerta.
      if (place.tags.includes('food') && b.w >= 4) {
        const floors = b.front === 's' ? (b.floors ?? 1) : 1;
        const roofY = (b.front === 'n' ? b.ty + 2 : b.ty + b.h - floors - 1) * TILE;
        const vx = Math.min(b.tx + b.w - 2, b.doorX + 2) * TILE + 8;
        this.sources.push({ kind: 'kitchen', x: vx, y: roofY, rate: 1.1 * zone(b.doorX, frontTy, 'steam'), when: (c) => kitchenSteam(c.hour, c.w, c.opened(place)) });
      }
    }
  }

  /** Una ráfaga suelta desde fuera (una paloma que echa a volar): `n` plumas y polvo en ese punto (px). */
  burst(kind: 'feather', x: number, y: number, n: number): void {
    if (this.off) return;
    for (let i = 0; i < n; i++) {
      const r = Math.random;
      const dot = r() < 0.4;
      this.spawn(kind, x + (r() - 0.5) * 6, y - 3, { vx: (r() - 0.5) * 28, vy: -10 - r() * 8, floor: y + 3 + r() * 4, life: 600 + r() * 500, alpha: 0.8, seed: r() * 1000 },
        dot ? 'fx-dot' : 'fx-spark', r() < 0.5 ? 0xc8c8cc : 0x9aa0a8, standing(y + 4));
    }
  }

  // --------------------------------------------------------------- pozo

  /** `light`: suma luz y va encima de la sombra de la hora (chispas, destellos); el resto se oscurece con la noche. */
  private spawn(kind: Kind, x: number, y: number, init: Partial<Particle>, texture: string, tint: number, depth: number, light = false): void {
    const cap = CAPS[kind];
    if (cap !== undefined && (this.kindLive.get(kind) ?? 0) >= cap) return;
    const p = this.pool.find((q) => !q.alive);
    // Pozo lleno: no sale. Es el techo de coste, no un error.
    if (!p) return;
    Object.assign(p, { kind, alive: true, age: 0, x, y, vx: 0, vy: 0, floor: y, alpha: 1, grow: 0, life: 1000 }, init);
    p.img.setTexture(texture).setTint(tint).setPosition(x, y).setScale(1).setAngle(0).setAlpha(0).setDepth(light ? EMISSIVE_DEPTH - 1 : depth).setVisible(true)
      .setBlendMode(light ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    this.kindLive.set(kind, (this.kindLive.get(kind) ?? 0) + 1);
  }

  private emit(s: Source): void {
    const r = Math.random;
    switch (s.kind) {
      case 'leaf': {
        const fall = s.y + TILE * (1.2 + r() * 1.6);
        this.spawn('leaf', s.x + (r() - 0.5) * 18, s.y + (r() - 0.5) * 8,
          { vx: 10 + r() * 16, vy: 9 + r() * 6, floor: fall, life: 3200 + r() * 2200, alpha: 0.95, seed: r() * 1000 },
          'fx-leaf', LEAF_TINTS[Math.floor(r() * LEAF_TINTS.length)], standing(fall + 1));
        break;
      }
      case 'paper':
        this.spawn('paper', s.x + (r() - 0.5) * 10, s.y, { vx: 22 + r() * 22, life: 1400 + r() * 1200, alpha: 0.9, seed: r() * 1000 },
          'fx-paper', r() < 0.5 ? 0xefe9df : 0xd8cfa8, LAYER.decal + 1);
        break;
      case 'mist':
        this.spawn('mist', s.x + (r() - 0.5) * 6, s.y, { vx: 3 + r() * 4, vy: -7 - r() * 5, life: 1800 + r() * 900, alpha: 0.28, grow: 1.4 },
          'fx-puff', 0xe8ecf0, standing(s.y + 6));
        break;
      case 'steam':
        this.spawn('steam', s.x + (r() - 0.5) * 3, s.y, { vx: (r() - 0.5) * 3, vy: -6 - r() * 4, life: 1300 + r() * 700, alpha: 0.32, grow: 0.8 },
          'fx-puff', 0xffffff, standing(s.y + 12));
        break;
      case 'kitchen':
        // El extractor: bocanadas más gordas que las de una taza, que suben y se abren sobre el tejado.
        this.spawn('kitchen', s.x + (r() - 0.5) * 4, s.y, { vx: 3 + r() * 5, vy: -9 - r() * 5, life: 1600 + r() * 900, alpha: 0.3, grow: 1.8 },
          'fx-puff', 0xf0f2f4, standing(s.y + 2));
        break;
      case 'glint':
        this.spawn('glint', s.x + (r() - 0.5) * 28, s.y + (r() - 0.5) * 8, { life: 500 + r() * 400, alpha: 0.5 },
          'fx-glint', r() < 0.5 ? 0xffd9a0 : 0xfff4e0, 0, true);
        break;
      case 'mote':
        this.spawn('mote', s.x + (r() - 0.5) * TILE * 1.6, s.y + (r() - 0.5) * TILE * 2, { vx: (r() - 0.5) * 4, vy: -1 + r() * 2.5, life: 3500 + r() * 2500, alpha: 0.55 },
          'fx-dot', 0xfff0c8, LAYER.overhead - 1);
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------ marcha

  update(deltaMs: number): void {
    if (this.off) return;
    const view = this.scene.cameras.main.worldView;
    const inView = (x: number, y: number): boolean => x > view.x - MARGIN && x < view.right + MARGIN && y > view.y - MARGIN && y < view.bottom + MARGIN;
    this.clock += deltaMs;
    if (this.clock >= TICK_MS) {
      const dt = this.clock / 1000;
      this.clock = 0;
      const day = this.feeds.day();
      const hour = this.feeds.hour();
      const c: Ctx = {
        time: this.scene.time.now, hour, w: this.feeds.weather(),
        night: this.outdoor ? nightAt(hour) : 0,
        opened: (p) => !p || !p.hours || isOpen(p, day, Math.floor(hour), Math.floor((hour % 1) * 60)),
      };
      for (const s of this.sources) {
        if (!inView(s.x, s.y)) continue;
        const k = s.when(c);
        if (k > 0 && Math.random() < s.rate * k * dt) this.emit(s);
      }
      this.exhaust(c, inView);
      this.water(c, dt, inView);
      this.trainAir(inView, dt);
    }
    this.step(deltaMs, inView);
  }

  /** Humo del tubo de escape: coches parados o frenando y, con frío, también en marcha. Con calor y en marcha, nada. */
  private exhaust(c: Ctx, inView: (x: number, y: number) => boolean): void {
    const traffic = this.feeds.traffic();
    if (!traffic) return;
    const cold = c.w.celsius < 10;
    for (const v of traffic.vehicles) {
      const bottom = v.row * TILE + TILE;
      const tail = v.x - v.dir * (v.type.length / 2);
      if (!inView(tail, bottom)) continue;
      const idle = v.braking || v.speed < v.cruise * 0.3;
      if (!idle && !cold) continue;
      if (c.time - (this.puffed.get(v.id) ?? -1e9) < (idle ? 650 : 1100)) continue;
      this.puffed.set(v.id, c.time);
      this.spawn('exhaust', tail - v.dir * 2, bottom - 4, { vx: -v.dir * (6 + Math.random() * 6), vy: -4 - Math.random() * 3, life: 900 + Math.random() * 500, alpha: cold ? 0.3 : 0.18, grow: 1.1 },
        'fx-puff', 0xc8ccd4, standing(bottom + 1));
    }
    // Los que ya se fueron: fuera de la cuenta.
    if (this.puffed.size > 64) {
      const here = new Set(traffic.vehicles.map((v) => v.id));
      for (const id of this.puffed.keys()) if (!here.has(id)) this.puffed.delete(id);
    }
  }

  /** Cuántos salen en este paso para un ritmo por segundo: la parte entera y, el resto, a suertes. */
  private static count(rate: number, dt: number): number {
    const n = rate * dt;
    return Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
  }

  /** El agua del suelo: lo que levantan las ruedas de los coches y las pisadas de quien anda por lo encharcado. */
  private water(c: Ctx, dt: number, inView: (x: number, y: number) => boolean): void {
    if (c.w.wet <= 0.3) return;
    for (const v of this.feeds.traffic()?.vehicles ?? []) {
      const bottom = v.row * TILE + TILE - 2;
      const rear = v.x - v.dir * (v.type.length / 2) + v.dir * 4;
      if (!inView(rear, bottom)) continue;
      for (let n = Atmosphere.count(sprayRate(v.speed, c.w), dt); n > 0; n--) {
        this.spawn('spray', rear, bottom, { vx: -v.dir * (4 + Math.random() * 10), vy: -12 - Math.random() * 10, floor: bottom, life: 200 + Math.random() * 120, alpha: 0.5 },
          'fx-splash', 0xdfe7f2, standing(bottom + 1));
      }
    }
    for (const p of this.feeds.walkers?.() ?? []) {
      if (!inView(p.x, p.y)) continue;
      for (let n = Atmosphere.count(splashRate(p.moving, c.w), dt); n > 0; n--) {
        this.spawn('splash', p.x + (Math.random() - 0.5) * 4, p.y - 1, { life: 160 + Math.random() * 80, alpha: 0.45 }, 'fx-splash', 0xdfe7f2, standing(p.y));
      }
    }
  }

  /**
   * El tren: al abrir, un soplido en cada puerta; al entrar y salir, arenilla y
   * algún papel levantados en el borde del andén; y mientras frena, chispas bajo
   * los bogies, que saltan hacia atrás.
   */
  private trainAir(inView: (x: number, y: number) => boolean, dt: number): void {
    const t = this.feeds.train();
    if (!t) return;
    const { train, doors, edgeY } = t;
    for (let n = Atmosphere.count(sparkRate(train.state, train.speed), dt); n > 0; n--) {
      const x = train.x + t.bogies[Math.floor(Math.random() * t.bogies.length)];
      if (!inView(x, t.wheelsY)) continue;
      this.spawn('spark', x, t.wheelsY, { vx: 30 + Math.random() * 50, vy: -15 - Math.random() * 30, floor: t.wheelsY + 8, life: 160 + Math.random() * 200, alpha: 1 },
        Math.random() < 0.7 ? 'fx-spark' : 'fx-dot', [0xffd27a, 0xfff2d0, 0xffa84a][Math.floor(Math.random() * 3)], 0, true);
    }
    if (train.state !== this.lastTrain) {
      if (train.state === 'DOORS_OPENING') {
        for (const d of doors) {
          if (!inView(d.x, d.y)) continue;
          for (const side of [-1, 1]) {
            this.spawn('hiss', d.x + side * 4, d.y - 6, { vx: side * 8, vy: -3, life: 600, alpha: 0.3, grow: 1.5 }, 'fx-puff', 0xe8ecf0, standing(d.y + 2));
          }
        }
      }
      this.lastTrain = train.state;
    }
    if ((train.state !== 'ARRIVING' && train.state !== 'DEPARTING') || train.speed < 30) return;
    // El tren va hacia la izquierda: entrando, el morro empuja el aire; saliendo, la cola lo arrastra.
    const x = train.state === 'ARRIVING' ? train.x + 6 : train.x + 180;
    for (let i = 0; i < 2; i++) {
      const gx = x + Math.random() * 60;
      if (!inView(gx, edgeY)) continue;
      const paper = Math.random() < 0.15;
      this.spawn('grit', gx, edgeY + Math.random() * 8, { vx: -(20 + Math.random() * 30) * Math.min(1.5, train.speed / 120), vy: -6 - Math.random() * 6, floor: edgeY + 10, life: 700 + Math.random() * 500, alpha: paper ? 0.9 : 0.6 },
        paper ? 'fx-paper' : 'fx-dot', paper ? 0xefe9df : 0xb8b0a4, standing(edgeY + 12));
    }
  }

  private step(deltaMs: number, inView: (x: number, y: number) => boolean): void {
    const dt = deltaMs / 1000;
    let live = 0;
    this.kindLive.clear();
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.age += deltaMs;
      const t = p.age / p.life;
      if (t >= 1 || !inView(p.x, p.y)) {
        p.alive = false;
        p.img.setVisible(false);
        continue;
      }
      live++;
      this.kindLive.set(p.kind, (this.kindLive.get(p.kind) ?? 0) + 1);
      switch (p.kind) {
        case 'leaf':
          // Baja meciéndose; en el suelo, se arrastra y frena.
          if (p.y < p.floor) {
            p.x += (p.vx + Math.sin(p.age / 260 + p.seed) * 14) * dt;
            p.y += p.vy * dt;
            p.img.setAngle(Math.sin(p.age / 200 + p.seed) * 35);
          } else {
            p.vx *= 0.96;
            p.x += p.vx * 0.4 * dt;
          }
          break;
        case 'paper':
          // A saltitos: avanza con la racha y rebota un poco.
          p.x += p.vx * dt;
          p.y = p.floor - Math.abs(Math.sin(p.age / 170 + p.seed)) * 3;
          p.vx *= 0.985;
          p.img.setAngle(Math.sin(p.age / 120) * 20);
          break;
        case 'grit':
          p.x += p.vx * dt;
          p.vy += 30 * dt;
          p.y = Math.min(p.floor, p.y + p.vy * dt);
          break;
        case 'spark':
        case 'spray':
        case 'feather': {
          // Salen despedidas y caen; la pluma, además, se mece al bajar.
          const g = p.kind === 'spark' ? 260 : p.kind === 'spray' ? 90 : 20;
          p.vy += g * dt;
          p.x += (p.vx + (p.kind === 'feather' ? Math.sin(p.age / 150 + p.seed) * 10 : 0)) * dt;
          p.y = Math.min(p.floor, p.y + p.vy * dt);
          if (p.y >= p.floor) p.vx *= 0.9;
          break;
        }
        default:
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.grow) p.img.setScale(1 + p.grow * t);
      }
      // Entra y sale fundido: nunca aparece ni desaparece de golpe.
      const fade = Math.min(1, t * 5, (1 - t) * 3);
      p.img.setPosition(Math.round(p.x), Math.round(p.y)).setAlpha(p.alpha * fade);
    }
    this.live = live;
  }
}
