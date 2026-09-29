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
 * Presupuesto: un pozo fijo de sprites que se reutilizan (ninguno se crea ni
 * se destruye en marcha), sólo cuentan las fuentes que caen cerca de la cámara,
 * se decide a 10 Hz y no a cada frame, y con el pozo lleno simplemente no sale
 * nada más. Con movimiento reducido, no hay ambiente.
 */

/** Sprites en el pozo: el techo de partículas vivas a la vez. */
export const MAX_PARTICLES = 72;
/** Cada cuánto se decide qué emite (ms reales). */
const TICK_MS = 100;
/** Margen alrededor de la cámara en el que una fuente cuenta. */
const MARGIN = TILE * 3;

type Kind = 'leaf' | 'paper' | 'steam' | 'mist' | 'mote' | 'exhaust' | 'grit' | 'hiss';

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
  opened: (p: PlaceInfo | undefined) => boolean;
}

export interface AtmosphereFeeds {
  weather: () => Weather;
  hour: () => number;
  day: () => number;
  traffic: () => Traffic | null;
  train: () => { train: TrainSystem; doors: readonly Vec2[]; edgeY: number } | null;
}

/** Texturas del ambiente. Una vez, al arrancar. */
export function buildAtmosphereTextures(scene: Phaser.Scene): void {
  make(scene, 'fx-leaf', 3, 2, (ctx) => {
    px(ctx, '#ffffff', 0, 0, 2, 1);
    px(ctx, '#ffffff', 1, 1, 2, 1);
  });
  make(scene, 'fx-paper', 3, 2, (ctx) => px(ctx, '#ffffff', 0, 0, 3, 2));
  make(scene, 'fx-dot', 1, 1, (ctx) => px(ctx, '#ffffff', 0, 0, 1, 1));
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
  /** Para medir: cuántas partículas hay vivas y cuántas fuentes hay en el sitio. */
  live = 0;

  constructor(scene: Phaser.Scene, def: LocationDef, feeds: AtmosphereFeeds) {
    this.scene = scene;
    this.feeds = feeds;
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
      } else if (!outdoor && p.kind === 'window') {
        // Polvo en el haz: de día, con sol, en la franja de suelo bajo la ventana.
        this.sources.push({
          kind: 'mote', x: cx, y: foot + TILE * 1.5, rate: 2.2,
          when: (c) => (c.hour > 8 && c.hour < 19 && c.opened(room) ? Math.max(0, 1 - c.w.cloud * 1.2) : 0),
        });
      }
    }
  }

  // --------------------------------------------------------------- pozo

  private spawn(kind: Kind, x: number, y: number, init: Partial<Particle>, texture: string, tint: number, depth: number): void {
    const p = this.pool.find((q) => !q.alive);
    // Pozo lleno: no sale. Es el techo de coste, no un error.
    if (!p) return;
    Object.assign(p, { kind, alive: true, age: 0, x, y, vx: 0, vy: 0, floor: y, alpha: 1, grow: 0, life: 1000 }, init);
    p.img.setTexture(texture).setTint(tint).setPosition(x, y).setScale(1).setAngle(0).setAlpha(0).setDepth(depth).setVisible(true);
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
        opened: (p) => !p || !p.hours || isOpen(p, day, Math.floor(hour), Math.floor((hour % 1) * 60)),
      };
      for (const s of this.sources) {
        if (!inView(s.x, s.y)) continue;
        const k = s.when(c);
        if (k > 0 && Math.random() < s.rate * k * dt) this.emit(s);
      }
      this.exhaust(c, inView);
      this.trainAir(inView);
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

  /** El tren: al abrir, un soplido en cada puerta; al entrar y salir, arenilla y algún papel levantados en el borde del andén. */
  private trainAir(inView: (x: number, y: number) => boolean): void {
    const t = this.feeds.train();
    if (!t) return;
    const { train, doors, edgeY } = t;
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
