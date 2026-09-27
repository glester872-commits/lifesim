// Sin Phaser: world/WildlifeView.ts lo pinta y scripts/check-wildlife.ts lo
// comprueba con exactamente esta lógica.
import { FOOD_HOURS, PIGEON_HOURS, PIGEON_SPOTS } from '../data/wildlife.ts';
import type { LocationDef, TilePoint } from '../types/game.ts';
import { isWalkable } from './LocationSystem.ts';
import type { Rng } from './MetroDaily.ts';
import type { Walker } from './StreetLife.ts';

/**
 * Animales de la calle: nada de IA, estados sencillos que se leen como vida.
 * No tienen cuerpo ni reservan sitio: ni la gente ni el jugador los esquivan,
 * y la navegación de los humanos no sabe que existen.
 */

/** Nadie se queda quieto en la calzada; una paloma, tampoco. */
const ROADWAY = new Set(['.', '=', ':', 'z']);

function walkable(loc: LocationDef, x: number, y: number): boolean {
  const tx = Math.round(x);
  const ty = Math.round(y);
  return isWalkable(loc, tx, ty) && !ROADWAY.has(loc.ground[ty]?.[tx] ?? '');
}

// ------------------------------------------------------------------ perros

export type DogState = 'walk' | 'trot' | 'sniff' | 'stand' | 'sit';

export interface Dog {
  owner: number;
  look: number;
  x: number;
  y: number;
  dir: 'left' | 'right';
  state: DogState;
  moving: boolean;
  /** Ms que le quedan olfateando, o de pie antes de sentarse. */
  timer: number;
  /** Tiles por delante (+) o por detrás (−) del dueño, y hacia dónde va cambiando. */
  lead: number;
  leadGoal: number;
  leadTimer: number;
  /** Por dónde ha pasado el dueño: el perro sólo pisa ese rastro o el camino que le queda. */
  trail: TilePoint[];
  /** El dueño ya ha entrado: llega hasta donde lo vio y desaparece con él. */
  orphan: boolean;
}

/** Tiles de correa: más lejos, el perro deja lo que hace y alcanza al dueño. */
export const LEASH = 1.7;
const TRAIL = 48;

/** Punto a `dist` tiles hacia atrás por el rastro (el último punto es el dueño). */
function alongTrail(trail: readonly TilePoint[], dist: number): TilePoint {
  let left = dist;
  for (let i = trail.length - 1; i > 0; i--) {
    const a = trail[i];
    const b = trail[i - 1];
    const seg = Math.hypot(a.tx - b.tx, a.ty - b.ty);
    if (seg >= left) return { tx: a.tx + ((b.tx - a.tx) * left) / seg, ty: a.ty + ((b.ty - a.ty) * left) / seg };
    left -= seg;
  }
  return trail[0];
}

/** Punto a `dist` tiles hacia delante por el camino que le queda al dueño. */
function alongPath(o: Walker, dist: number): TilePoint {
  let from: TilePoint = { tx: o.x, ty: o.y };
  let left = dist;
  for (const to of o.path) {
    const seg = Math.hypot(to.tx - from.tx, to.ty - from.ty);
    if (seg >= left && seg > 0) return { tx: from.tx + ((to.tx - from.tx) * left) / seg, ty: from.ty + ((to.ty - from.ty) * left) / seg };
    left -= seg;
    from = to;
  }
  return from;
}

/**
 * Perros de quien los pasea (viajes con `dog`). Van por el rastro del dueño
 * un poco por detrás o, a ratos, por su camino un poco por delante; olfatean,
 * trotan para alcanzarle y se sientan a su lado si se para.
 */
export class Dogs {
  readonly dogs = new Map<number, Dog>();
  private readonly loc: LocationDef;
  private readonly rng: Rng;

  constructor(loc: LocationDef, rng: Rng) {
    this.loc = loc;
    this.rng = rng;
  }

  update(dt: number, walkers: readonly Walker[]): void {
    const seen = new Set<number>();
    for (const o of walkers) {
      if (o.dog === undefined) continue;
      seen.add(o.id);
      let d = this.dogs.get(o.id);
      if (!d) {
        d = this.spawn(o);
        this.dogs.set(o.id, d);
      }
      this.step(d, o, dt);
    }
    for (const [id, d] of this.dogs) {
      if (seen.has(id)) continue;
      // El dueño ha entrado o se ha ido del barrio: el perro llega a donde lo vio por última vez y se va con él.
      d.orphan = true;
      d.state = 'trot';
      if (this.moveTo(d, d.trail[d.trail.length - 1], 2.4, dt) < 0.1) this.dogs.delete(id);
    }
  }

  private spawn(o: Walker): Dog {
    return {
      owner: o.id, look: o.dog!, x: o.x, y: o.y, dir: 'right', state: 'walk', moving: false, timer: 0,
      lead: -0.8, leadGoal: -0.8, leadTimer: 0, trail: [{ tx: o.x, ty: o.y }], orphan: false,
    };
  }

  private step(d: Dog, o: Walker, dt: number): void {
    const last = d.trail[d.trail.length - 1];
    if (Math.hypot(o.x - last.tx, o.y - last.ty) > 0.08) {
      d.trail.push({ tx: o.x, ty: o.y });
      if (d.trail.length > TRAIL) d.trail.shift();
    }
    const toOwner = Math.hypot(o.x - d.x, o.y - d.y);

    if (!o.moving) {
      // Quieto el dueño (un banco, una parada): al lado, de pie un momento y luego sentado.
      if (d.state !== 'stand' && d.state !== 'sit') d.timer = 1_200 + this.rng() * 1_800;
      if (this.moveTo(d, this.besideOwner(o, d), Math.max(o.speed, 1.4), dt) < 0.08) {
        d.moving = false;
        d.timer -= dt;
        d.state = d.timer > 0 ? 'stand' : 'sit';
      } else d.state = 'walk';
      return;
    }

    // Olfateando: se queda hasta que se le acaba el rato o tira la correa.
    if (d.state === 'sniff') {
      d.timer -= dt;
      if (d.timer > 0 && toOwner < LEASH) {
        d.moving = false;
        return;
      }
      d.state = 'trot';
    } else if (toOwner < 1.1 && this.rng() < (dt / 1000) * 0.14) {
      d.state = 'sniff';
      d.timer = 700 + this.rng() * 1_600;
      d.moving = false;
      return;
    }

    // Delante o detrás: cambia de idea cada pocos segundos, casi siempre detrás.
    d.leadTimer -= dt;
    if (d.leadTimer <= 0) {
      d.leadGoal = this.rng() < 0.25 ? 0.5 + this.rng() * 0.5 : -(0.5 + this.rng() * 0.7);
      d.leadTimer = 2_000 + this.rng() * 3_500;
    }
    d.lead += (d.leadGoal - d.lead) * Math.min(1, dt / 900);
    const target = d.lead >= 0 ? alongPath(o, d.lead) : alongTrail(d.trail, -d.lead);
    const far = Math.hypot(target.tx - d.x, target.ty - d.y) > 0.9 || toOwner > LEASH * 0.8;
    d.state = far ? 'trot' : 'walk';
    this.moveTo(d, target, Math.max(o.speed, 1.2) * (far ? 1.7 : 1.05), dt);
  }

  /** Avanza hacia un punto; devuelve lo que queda. */
  private moveTo(d: Dog, to: TilePoint, speed: number, dt: number): number {
    const dx = to.tx - d.x;
    const dy = to.ty - d.y;
    const dist = Math.hypot(dx, dy);
    const reach = (speed * dt) / 1000;
    if (dist < 0.01) {
      d.moving = false;
      return 0;
    }
    if (Math.abs(dx) > 0.02) d.dir = dx > 0 ? 'right' : 'left';
    d.moving = true;
    if (dist <= reach) {
      d.x = to.tx;
      d.y = to.ty;
      return 0;
    }
    d.x += (dx / dist) * reach;
    d.y += (dy / dist) * reach;
    return dist - reach;
  }

  /** Junto al dueño parado: a un lado si se puede pisar; si no, al otro; si tampoco, detrás, en su rastro. */
  private besideOwner(o: Walker, d: Dog): TilePoint {
    for (const side of d.dir === 'left' ? [-0.7, 0.7] : [0.7, -0.7]) {
      if (walkable(this.loc, o.x + side, o.y + 0.15)) return { tx: o.x + side, ty: o.y + 0.15 };
    }
    return alongTrail(d.trail, 0.6);
  }
}

// ----------------------------------------------------------------- palomas

export type PigeonState = 'idle' | 'peck' | 'walk' | 'turn' | 'hop' | 'flee' | 'away' | 'land';

export interface Pigeon {
  id: number;
  flock: number;
  look: number;
  x: number;
  y: number;
  /** Altura sobre el suelo, en px: al saltar y al volar. */
  z: number;
  dir: -1 | 1;
  state: PigeonState;
  timer: number;
  vx: number;
  vy: number;
  /** Ms hasta echar a volar (se asusta un poco después de verlo, cada una a su tiempo); −1, tranquila. */
  alarm: number;
  /** Radio de susto propio, en tiles: unas son más confiadas que otras. */
  nerve: number;
  /** Fuera: ms que tardará en volver cuando se pierda de vista. */
  away: number;
  /** Aterrizando: de dónde viene y a dónde va. */
  from?: TilePoint;
  to?: TilePoint;
}

interface Flock {
  at: TilePoint;
  radius: number;
  count: number;
  food: boolean;
  /** Ms hasta que puede volver otra: no aterrizan todas a la vez. */
  cool: number;
}

const FLIGHT_Z = 28;
const LAND_MS = 750;

const inBand = (t: number, a: number, b: number): boolean => t >= a && t < b;

/** Parte de la bandada que hay en el suelo a esa hora. */
export function pigeonShare(hour: number): number {
  return PIGEON_HOURS.find(([a, b]) => inBand(hour, a, b))?.[2] ?? 0;
}

/**
 * Bandadas de palomas en los sitios de data/wildlife.ts. Picotean, dan dos
 * pasos, se giran, saltan; si algo que se mueve se acerca, se asustan (cada
 * una a su tiempo, y el susto se contagia a las de al lado) y se van volando.
 * Al rato vuelven, de una en una, a un sitio libre de su zona.
 */
export class Pigeons {
  readonly birds: Pigeon[] = [];
  private readonly flocks: Flock[] = [];
  private readonly loc: LocationDef;
  private readonly rng: Rng;

  constructor(loc: LocationDef, rng: Rng) {
    this.loc = loc;
    this.rng = rng;
    let id = 1;
    for (const s of PIGEON_SPOTS[loc.id] ?? []) {
      const p = loc.points?.[s.point];
      if (!p) throw new Error(`[${loc.id}] punto de palomas desconocido ${s.point}`);
      const flock = this.flocks.push({ at: { tx: p.tx, ty: p.ty }, radius: s.radius, count: s.count, food: !!s.food, cool: 0 }) - 1;
      // El pozo: las de más para la hora de comer, si es sitio de comida.
      for (let i = 0; i < Math.ceil(s.count * (s.food ? 1.4 : 1)); i++) {
        this.birds.push({
          id: id++, flock, look: Math.floor(rng() * 3), x: p.tx, y: p.ty, z: 0, dir: rng() < 0.5 ? -1 : 1,
          state: 'away', timer: 0, vx: 0, vy: 0, alarm: -1, nerve: 1.3 + rng() * 0.8, away: 0,
        });
      }
    }
  }

  /** Cuántas de una bandada quiere haber en el suelo a esa hora. */
  wanted(flock: number, hour: number): number {
    const f = this.flocks[flock];
    const food = f.food && FOOD_HOURS.some(([a, b]) => inBand(hour, a, b)) ? 1.4 : 1;
    return Math.round(f.count * pigeonShare(hour) * food);
  }

  get flockCount(): number {
    return this.flocks.length;
  }

  grounded(b: Pigeon): boolean {
    return b.state !== 'away' && b.state !== 'flee' && b.state !== 'land';
  }

  /** Al llegar el jugador: las que tocan ya están en el suelo, sin aterrizar delante de él. */
  populate(hour: number, player: TilePoint): void {
    this.flocks.forEach((_, i) => {
      let placed = 0;
      const want = this.wanted(i, hour);
      for (const b of this.birds.filter((x) => x.flock === i)) {
        b.state = 'away';
        b.timer = 0;
        const spot = placed < want ? this.freeTile(i, player) : undefined;
        if (!spot) continue;
        Object.assign(b, { x: spot.tx, y: spot.ty, z: 0, state: 'idle', timer: this.rng() * 2_000, alarm: -1 });
        placed++;
      }
    });
  }

  /** `threats`: lo que se mueve (gente andando, perros, el jugador si camina). */
  update(dt: number, hour: number, threats: readonly TilePoint[], player: TilePoint): void {
    const fleeing = this.birds.filter((b) => b.state === 'flee');
    for (const b of this.birds) {
      if (this.grounded(b)) this.watch(b, threats, fleeing, dt);
      this.act(b, dt);
    }
    this.flocks.forEach((f, i) => {
      f.cool -= dt;
      if (f.cool > 0) return;
      const want = this.wanted(i, hour);
      const mine = this.birds.filter((b) => b.flock === i);
      const present = mine.filter((b) => b.state !== 'away' && b.state !== 'flee');
      if (present.length < want) {
        // Vuelve una que ya haya pasado su rato fuera.
        const back = mine.find((b) => b.state === 'away' && b.timer <= 0);
        const to = back && this.freeTile(i, player);
        if (back && to) this.land(back, to);
        f.cool = 900 + this.rng() * 2_200;
      } else if (present.length > want) {
        // Se hace tarde: se va una, tranquila, sin que nadie la asuste.
        const leaving = present.find((b) => this.grounded(b));
        if (leaving) this.flee(leaving, undefined, 60_000);
        f.cool = 2_000 + this.rng() * 3_000;
      }
    });
  }

  private watch(b: Pigeon, threats: readonly TilePoint[], fleeing: readonly Pigeon[], dt: number): void {
    if (b.alarm < 0) {
      // La que lo ve se asusta tras un respingo; las de al lado, al ver volar a una.
      if (threats.some((t) => Math.hypot(t.tx - b.x, t.ty - b.y) < b.nerve)) b.alarm = this.rng() * 450;
      else if (fleeing.some((f) => Math.hypot(f.x - b.x, f.y - b.y) < 1.4)) b.alarm = 120 + this.rng() * 520;
    }
    if (b.alarm < 0) return;
    b.alarm -= dt;
    if (b.alarm > 0) return;
    b.alarm = -1;
    let threat: TilePoint | undefined;
    for (const t of threats) if (!threat || Math.hypot(t.tx - b.x, t.ty - b.y) < Math.hypot(threat.tx - b.x, threat.ty - b.y)) threat = t;
    this.flee(b, threat, 18_000 + this.rng() * 40_000);
  }

  /** Echa a volar, lejos de lo que la asusta (o hacia cualquier lado), y pasa un rato fuera. */
  private flee(b: Pigeon, from: TilePoint | undefined, away: number): void {
    let angle = this.rng() * Math.PI * 2;
    if (from) angle = Math.atan2(b.y - from.ty, b.x - from.tx) + (this.rng() - 0.5) * 1.4;
    const speed = 5 + this.rng() * 2.5;
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
    b.dir = b.vx >= 0 ? 1 : -1;
    b.state = 'flee';
    b.timer = 900 + this.rng() * 600;
    b.away = away;
  }

  private land(b: Pigeon, to: TilePoint): void {
    const angle = this.rng() * Math.PI * 2;
    b.from = { tx: to.tx + Math.cos(angle) * 4, ty: to.ty + Math.sin(angle) * 2.5 };
    b.to = to;
    b.x = b.from.tx;
    b.y = b.from.ty;
    b.z = FLIGHT_Z;
    b.dir = to.tx >= b.from.tx ? 1 : -1;
    b.state = 'land';
    b.timer = LAND_MS;
  }

  private act(b: Pigeon, dt: number): void {
    b.timer -= dt;
    switch (b.state) {
      case 'away':
        return;
      case 'flee':
        b.x += (b.vx * dt) / 1000;
        b.y += (b.vy * dt) / 1000;
        b.z = Math.min(FLIGHT_Z + 8, b.z + (40 * dt) / 1000);
        if (b.timer <= 0) {
          // Fuera de vista: el rato que pase fuera empieza a contar ahora.
          b.state = 'away';
          b.timer = b.away;
          b.z = 0;
        }
        return;
      case 'land': {
        const k = Math.min(1, 1 - b.timer / LAND_MS);
        b.x = b.from!.tx + (b.to!.tx - b.from!.tx) * k;
        b.y = b.from!.ty + (b.to!.ty - b.from!.ty) * k;
        b.z = FLIGHT_Z * (1 - k) * (1 - k);
        if (k >= 1) {
          b.z = 0;
          b.state = 'idle';
          b.timer = 400 + this.rng() * 1_200;
        }
        return;
      }
      case 'walk':
        this.stepTo(b, dt);
        break;
      case 'hop':
        b.z = Math.sin((1 - Math.max(0, b.timer) / 260) * Math.PI) * 3;
        this.stepTo(b, dt);
        break;
      default:
        break;
    }
    if (b.timer > 0) return;
    b.z = 0;
    this.nextGroundState(b);
  }

  /** Un paso en su velocidad, si no se sale de su zona ni pisa donde no debe; si no, se para. */
  private stepTo(b: Pigeon, dt: number): void {
    const nx = b.x + (b.vx * dt) / 1000;
    const ny = b.y + (b.vy * dt) / 1000;
    if (this.inside(b.flock, nx, ny)) {
      b.x = nx;
      b.y = ny;
    } else b.timer = 0;
  }

  /** Qué hace ahora una paloma en el suelo: casi siempre picotear o quedarse, a veces andar, girarse o saltar. */
  private nextGroundState(b: Pigeon): void {
    const r = this.rng();
    if (r < 0.3) {
      b.state = 'idle';
      b.timer = 500 + this.rng() * 1_800;
    } else if (r < 0.65) {
      b.state = 'peck';
      b.timer = 400 + this.rng() * 1_300;
    } else if (r < 0.86) {
      const a = this.rng() * Math.PI * 2;
      const speed = 0.5 + this.rng() * 0.4;
      b.vx = Math.cos(a) * speed;
      b.vy = Math.sin(a) * speed * 0.7;
      b.dir = b.vx >= 0 ? 1 : -1;
      b.state = 'walk';
      b.timer = 300 + this.rng() * 600;
    } else if (r < 0.94) {
      b.dir = b.dir === 1 ? -1 : 1;
      b.state = 'turn';
      b.timer = 250 + this.rng() * 400;
    } else {
      b.vx = b.dir * (0.9 + this.rng() * 0.5);
      b.vy = (this.rng() - 0.5) * 0.6;
      b.state = 'hop';
      b.timer = 260;
    }
  }

  /** Dentro de su zona y en suelo donde una paloma se puede quedar. */
  private inside(flock: number, x: number, y: number): boolean {
    const f = this.flocks[flock];
    return Math.hypot(x - f.at.tx, y - f.at.ty) <= f.radius * 1.15 && walkable(this.loc, x, y);
  }

  /** Un sitio libre de la zona, no pegado a otra paloma ni al jugador. */
  private freeTile(flock: number, player: TilePoint): TilePoint | undefined {
    const f = this.flocks[flock];
    for (let tries = 0; tries < 14; tries++) {
      const a = this.rng() * Math.PI * 2;
      const d = Math.sqrt(this.rng()) * f.radius;
      const x = f.at.tx + Math.cos(a) * d;
      const y = f.at.ty + Math.sin(a) * d * 0.8;
      if (!walkable(this.loc, x, y) || Math.hypot(x - player.tx, y - player.ty) < 2.5) continue;
      if (this.birds.some((o) => o.state !== 'away' && Math.hypot(o.x - x, o.y - y) < 0.45)) continue;
      return { tx: x, ty: y };
    }
    return undefined;
  }
}
