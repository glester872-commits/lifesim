// Sin Phaser: world/StreetEventView.ts lo pinta y scripts/check-street-events.ts
// lo recorre noche a noche con exactamente esta lógica.
import { PASSENGER_LOOKS } from '../data/npcs.ts';
import type { EventSlot, StreetEventDef } from '../data/streetEvents.ts';
import type { Facing, LocationDef, TilePoint } from '../types/game.ts';
import { between, hashSeed, seededRng, weekIndex, type Rng } from './MetroDaily.ts';
import { isWalkable } from './LocationSystem.ts';
import { weatherAt } from './Weather.ts';

/**
 * Un evento de calle (data/streetEvents.ts) noche a noche. No guarda estado:
 * todo sale del reloj (minutos absolutos: día × 1440 + minuto del día) y de una
 * semilla por noche. Con eso se sabe si esa noche hay, cuándo empieza, quién
 * viene y por dónde, y dónde está cada uno en cualquier momento: quien llega a
 * mitad de pelea la encuentra a mitad, quien duerme hasta el día siguiente no
 * encuentra a nadie, y el mundo no se para mientras se mira.
 */

export type EventPhase = 'none' | 'gathering' | 'fight' | 'break' | 'dispersing';
export type Role = 'fighter' | 'spectator' | 'watcher' | 'lookout';

/** Minutos de juego: corrillo antes de empezar, asalto, descanso entre asaltos y rato en que el patio se vacía. */
export const GATHER = 40;
export const ROUND = 24;
export const BREAK = 10;
export const DISPERSE = 30;
/** Paso al llegar y al irse, en tiles por minuto de juego (un minuto de juego es medio segundo); con aviso, a paso ligero. */
export const WALK = 0.75;
export const FLEE = 1.6;
/** Un golpe cada tanto: el compás de la pelea, en minutos de juego (0,6 min = 0,3 s). */
const BEAT = 0.6;
const BEATS = 8;

export interface Member {
  id: number;
  role: Role;
  slot: EventSlot;
  entry: TilePoint;
  exit: TilePoint;
  /** Minutos absolutos: cuándo llega a su sitio y cuándo se va de él. */
  arrive: number;
  leave: number;
  /** Índice en PASSENGER_LOOKS. */
  look: number;
  seed: number;
  /** Se va con el aviso del vigía: deprisa. */
  fast: boolean;
}

export interface Night {
  day: number;
  happens: boolean;
  why: 'ok' | 'weekday' | 'chance' | 'rain';
  start: number;
  fightAt: number;
  rounds: readonly (readonly [number, number])[];
  end: number;
  /** El vigía avisa: a partir de aquí todos se van. */
  raidAt: number | null;
  members: Member[];
}

export interface Presence {
  member: Member;
  /** Tiles, con decimales mientras anda. */
  x: number;
  y: number;
  dir: Facing;
  moving: boolean;
  /** Lo que hace parado: CHEER, TALK, WATCH, WAIT o FIGHT; andando, WALK. */
  state: string;
}

export interface FighterPose {
  pose: 0 | 8 | 9 | 10;
  /** Px hacia el rival (negativo: hacia atrás). */
  dx: number;
  /** En este compás un golpe llega: el destello pequeño entre los dos. */
  hit: boolean;
}

function hash(...parts: number[]): number {
  return (hashSeed(...parts) % 10_000) / 10_000;
}

const shuffled = <T>(items: readonly T[], rng: Rng): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Lo que pasa (o no) la noche que empieza el día `day`. */
export function planNight(def: StreetEventDef, loc: LocationDef, day: number): Night {
  const rng = seededRng(hashSeed(def.id, day));
  const [h0, h1] = def.window;
  const from = day * 1440 + h0 * 60;
  const to = day * 1440 + (h1 <= h0 ? h1 + 24 : h1) * 60;
  const rounds = def.rounds[0] + Math.floor(rng() * (def.rounds[1] - def.rounds[0] + 1));
  const fightLen = rounds * ROUND + (rounds - 1) * BREAK;
  const start = from + rng() * Math.max(0, to - from - GATHER - fightLen - DISPERSE);
  const fightAt = start + GATHER;
  const bouts = Array.from({ length: rounds }, (_, i) => [fightAt + i * (ROUND + BREAK), fightAt + i * (ROUND + BREAK) + ROUND] as const);
  const end = fightAt + fightLen;
  // Las tiradas de la noche, siempre en el mismo orden: cambiar una regla no cambia el resto.
  const [roll, raidRoll, raidWhen] = [rng(), rng(), rng()];
  const base = { day, start, fightAt, rounds: bouts, end, raidAt: null, members: [] };
  if (!def.days.includes(weekIndex(day))) return { ...base, happens: false, why: 'weekday' };
  if (roll >= def.chance) return { ...base, happens: false, why: 'chance' };
  const w = weatherAt(Math.floor(fightAt / 1440), (fightAt % 1440) / 60);
  if (!def.covered && w.rain >= def.weather.cancelRain) return { ...base, happens: false, why: 'rain' };

  let crowd = def.crowd[0] + Math.floor(rng() * (def.crowd[1] - def.crowd[0] + 1));
  if (!def.covered && w.rain > 0.08) crowd *= def.weather.lightRainCrowd;
  if (w.celsius < def.weather.coldBelow) crowd *= def.weather.coldCrowd;
  if (w.celsius > def.weather.warmAbove) crowd += def.weather.warmExtra;
  crowd = Math.max(2, Math.min(def.spectators.length, Math.round(crowd)));
  const raidAt = raidRoll < def.raid ? fightAt + raidWhen * (end - fightAt) * 0.8 : null;
  const stop = raidAt ?? end;

  const entries = def.entries.map((id) => loc.points?.[id]).filter((p): p is NonNullable<typeof p> => !!p);
  const looks = shuffled(PASSENGER_LOOKS.map((_, i) => i), rng);
  // Quien pelea viene en ropa de calle o de deporte.
  const fighterLooks = looks.filter((i) => ['street', 'sport'].includes(PASSENGER_LOOKS[i].style ?? ''));
  const members: Member[] = [];
  const add = (role: Role, slot: EventSlot, arrive: number, leave: number, look: number): void => {
    const entry = entries[Math.floor(rng() * entries.length)];
    const exit = entries[Math.floor(rng() * entries.length)];
    // Con aviso, nadie se queda: se va en cuanto lo oye, cada uno un poco antes o después.
    const warned = raidAt !== null && leave > raidAt;
    const left = warned ? raidAt + rng() * 1.5 : leave;
    members.push({ id: members.length + 1, role, slot, entry, exit, arrive, leave: Math.max(arrive + 4, left), look, seed: Math.floor(rng() * 1e6), fast: warned });
  };
  def.fighters.forEach((slot, i) => add('fighter', slot, start + between(rng, 8, 20), stop + between(rng, 4, 12), fighterLooks[i] ?? looks[i]));
  const taken = new Set(members.map((m) => m.look));
  const nextLook = (): number => {
    const i = looks.find((l) => !taken.has(l)) ?? looks[0];
    taken.add(i);
    return i;
  };
  for (const slot of shuffled(def.spectators, rng).slice(0, crowd)) {
    // Uno de cada cinco se va antes de que acabe.
    const early = rng() < 0.2;
    add('spectator', slot, start + rng() * (GATHER + 15), early ? fightAt + rng() * (end - fightAt) * 0.7 : end + between(rng, 2, 20), nextLook());
  }
  for (const slot of def.watchers.slice(0, 1 + Math.floor(rng() * def.watchers.length))) {
    add('watcher', slot, fightAt + between(rng, 5, 25), end - between(rng, 0, 20), nextLook());
  }
  if (def.lookout) add('lookout', def.lookout, start - 5, (raidAt ?? end) + (raidAt !== null ? 3 : 10), nextLook());
  return { ...base, raidAt, members, happens: true, why: 'ok' };
}

export function phaseAt(n: Night, t: number): EventPhase {
  if (!n.happens) return 'none';
  const stop = n.raidAt ?? n.end;
  if (t < n.start || t >= stop + DISPERSE) return 'none';
  if (t < n.fightAt) return 'gathering';
  if (t >= stop) return 'dispersing';
  return n.rounds.some(([a, b]) => t >= a && t < b) ? 'fight' : 'break';
}

/** Hacia dónde queda `to` desde `from`, en una de las cuatro direcciones. */
function toward(from: TilePoint, to: TilePoint): Facing {
  const dx = to.tx - from.tx;
  const dy = to.ty - from.ty;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'down' : 'up';
}

/**
 * La pelea, compás a compás: un ataque por ciclo de ocho compases, a veces
 * esquivado. Acercarse, golpear, encajar y retroceder, recuperar la guardia.
 * Al final de cada asalto, uno retrocede y el otro baja la guardia. Nada más.
 */
export function fighterPoses(n: Night, t: number): [FighterPose, FighterPose] {
  const phase = phaseAt(n, t);
  if (phase === 'break') return [{ pose: 0, dx: -6, hit: false }, { pose: 0, dx: -6, hit: false }];
  if (phase !== 'fight') {
    // Calentando antes de empezar: de vez en cuando se ponen en guardia.
    const pose = phase === 'gathering' && Math.floor(t / 3) % 3 === 0 ? 8 : 0;
    return [{ pose, dx: 0, hit: false }, { pose, dx: 0, hit: false }];
  }
  const round = n.rounds.findIndex(([a, b]) => t >= a && t < b);
  const r = t - n.rounds[round][0];
  if (r > ROUND - 2) {
    const loser = hash(n.day, round) < 0.5 ? 0 : 1;
    const out: [FighterPose, FighterPose] = [{ pose: 8, dx: 0, hit: false }, { pose: 8, dx: 0, hit: false }];
    out[loser] = { pose: r > ROUND - 1 ? 0 : 10, dx: -8, hit: false };
    return out;
  }
  const cycle = Math.floor(r / (BEAT * BEATS));
  const beat = Math.floor((r % (BEAT * BEATS)) / BEAT);
  const att = hash(n.day, round, cycle) < 0.5 ? 0 : 1;
  const dodge = hash(n.day, round, cycle, 7) < 0.35;
  const a: FighterPose = { pose: 8, dx: 0, hit: false };
  const d: FighterPose = { pose: 8, dx: 0, hit: false };
  if (beat === 1) a.dx = 3;
  else if (beat === 2) {
    Object.assign(a, { pose: 9, dx: 4, hit: !dodge });
    Object.assign(d, dodge ? { pose: 8, dx: -3 } : { pose: 10, dx: -2 });
  } else if (beat === 3) {
    a.dx = 2;
    Object.assign(d, dodge ? { pose: 8, dx: -2 } : { pose: 10, dx: -5 });
  } else if (beat === 4) d.dx = -3;
  else if (beat === 7) a.pose = d.pose = 0;
  return att === 0 ? [a, d] : [d, a];
}

/**
 * Un evento en su sitio: sus noches y los caminos de su gente, calculados una
 * vez; lo demás, del reloj. Los caminos rodean el corro (nadie cruza por donde
 * pelean) y, si cabe, los sitios de los demás.
 */
export class StreetEvent {
  readonly def: StreetEventDef;
  private readonly loc: LocationDef;
  private readonly nights = new Map<number, Night>();
  private readonly paths = new Map<string, TilePoint[]>();
  /** Los tiles de la pelea: los dos, lo que hay entre ellos y uno de margen a cada lado. */
  readonly ring: readonly TilePoint[];
  readonly center: TilePoint;

  constructor(def: StreetEventDef, loc: LocationDef) {
    this.def = def;
    this.loc = loc;
    const [a, b] = def.fighters;
    const [x0, x1] = [Math.min(a.tx, b.tx) - 1, Math.max(a.tx, b.tx) + 1];
    this.ring = Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ tx: x0 + i, ty: a.ty }));
    this.center = { tx: (a.tx + b.tx) / 2, ty: a.ty };
  }

  night(day: number): Night {
    let n = this.nights.get(day);
    if (!n) {
      n = planNight(this.def, this.loc, day);
      this.nights.set(day, n);
      // Sólo hacen falta la de hoy y la de ayer (que acaba de madrugada).
      for (const d of this.nights.keys()) if (d < day - 2) this.nights.delete(d);
    }
    return n;
  }

  /** La noche que toca a esta hora: la que empezó ayer y aún colea, o la de hoy. */
  nightAt(t: number): Night {
    const today = Math.floor(t / 1440);
    const yesterday = this.night(today - 1);
    // Con margen: el último en irse aún está saliendo por la Mayor.
    const tail = (yesterday.raidAt ?? yesterday.end) + DISPERSE + 180;
    return yesterday.happens && t < tail ? yesterday : this.night(today);
  }

  phase(t: number): EventPhase {
    return phaseAt(this.nightAt(t), t);
  }

  /** Camino de tile en tile sin pisar el corro; si cabe, sin pisar tampoco los sitios de los demás. */
  path(from: TilePoint, to: TilePoint): TilePoint[] {
    const key = `${from.tx},${from.ty}>${to.tx},${to.ty}`;
    let p = this.paths.get(key);
    if (!p) {
      const ring = this.ring.map((r) => `${r.tx},${r.ty}`);
      const slots = [...this.def.spectators, ...this.def.watchers, ...(this.def.lookout ? [this.def.lookout] : [])].map((s) => `${s.tx},${s.ty}`);
      p = this.bfs(from, to, new Set([...ring, ...slots])) ?? this.bfs(from, to, new Set(ring)) ?? [from, to];
      this.paths.set(key, p);
    }
    return p;
  }

  private bfs(a: TilePoint, b: TilePoint, blocked: Set<string>): TilePoint[] | null {
    const key = (p: TilePoint): string => `${p.tx},${p.ty}`;
    const goal = key(b);
    blocked.delete(goal);
    blocked.delete(key(a));
    const prev = new Map<string, TilePoint | null>([[key(a), null]]);
    const queue: TilePoint[] = [a];
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i];
      if (key(cur) === goal) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = { tx: cur.tx + dx, ty: cur.ty + dy };
        const k = key(next);
        if (prev.has(k) || blocked.has(k) || !isWalkable(this.loc, next.tx, next.ty)) continue;
        prev.set(k, cur);
        queue.push(next);
      }
    }
    if (!prev.has(goal)) return null;
    const out: TilePoint[] = [];
    for (let p: TilePoint | null | undefined = b; p; p = prev.get(key(p))) out.unshift(p);
    return out;
  }

  /** Quién está y dónde a esta hora: llegando, en su sitio o yéndose. */
  presentAt(t: number): Presence[] {
    const n = this.nightAt(t);
    if (!n.happens) return [];
    const phase = phaseAt(n, t);
    const out: Presence[] = [];
    for (const m of n.members) {
      const into = this.path(m.entry, m.slot);
      const inMin = Math.max(1, into.length - 1) / WALK;
      if (t < m.arrive - inMin) continue;
      if (t < m.arrive) {
        out.push(along(m, into, (t - (m.arrive - inMin)) / inMin));
        continue;
      }
      if (t >= m.leave) {
        const away = this.path(m.slot, m.exit);
        const outMin = Math.max(1, away.length - 1) / (m.fast ? FLEE : WALK);
        if (t < m.leave + outMin) out.push(along(m, away, (t - m.leave) / outMin));
        continue;
      }
      out.push(this.atSlot(n, m, phase, t));
    }
    return out;
  }

  /** En su sitio: mira la pelea y reacciona, cada uno a su compás. */
  private atSlot(n: Night, m: Member, phase: EventPhase, t: number): Presence {
    const face = m.slot.facing ?? toward(m.slot, this.center);
    const at = { member: m, x: m.slot.tx, y: m.slot.ty, dir: face, moving: false };
    if (m.role === 'fighter') return { ...at, state: 'FIGHT' };
    if (m.role === 'lookout') {
      // El aviso: se da la vuelta hacia el patio y lo dice.
      if (n.raidAt !== null && t >= n.raidAt - 1) return { ...at, dir: 'up', state: 'TALK' };
      return { ...at, state: 'WAIT' };
    }
    if (m.role === 'watcher') return { ...at, state: hash(m.seed, Math.floor(t / 6)) < 0.3 ? 'WAIT' : 'WATCH' };
    if (phase === 'fight') {
      const round = n.rounds.find(([a, b]) => t >= a && t < b)!;
      // Al final del asalto jalea casi todo el mundo; durante, a ratos y cada uno cuando le da.
      const cheer = t > round[1] - 2 ? 0.75 : 0.28;
      const state = hash(m.seed, Math.floor(t / 1.2)) < cheer ? 'CHEER' : 'WATCH';
      // Se acerca y se echa atrás, un cuarto de tile como mucho, despacio y a su aire.
      const lean = 0.22 * Math.sin(t / (2.5 + (m.seed % 4)) + m.seed);
      const dx = this.center.tx - m.slot.tx;
      const dy = this.center.ty - m.slot.ty;
      const len = Math.hypot(dx, dy) || 1;
      return { ...at, x: m.slot.tx + (dx / len) * lean, y: m.slot.ty + (dy / len) * lean, state };
    }
    // Esperando, entre asaltos o recogiendo: charlan con el de al lado a ratos.
    if (hash(m.seed, Math.floor(t / 4)) < 0.4) return { ...at, dir: m.seed % 2 ? 'left' : 'right', state: 'TALK' };
    return { ...at, state: 'WATCH' };
  }
}

function along(m: Member, path: readonly TilePoint[], f: number): Presence {
  if (path.length < 2) return { member: m, x: path[0].tx, y: path[0].ty, dir: 'down', moving: false, state: 'WATCH' };
  const pos = Math.min(path.length - 1, Math.max(0, f) * (path.length - 1));
  const i = Math.min(path.length - 2, Math.floor(pos));
  const a = path[i];
  const b = path[i + 1];
  const k = pos - i;
  return { member: m, x: a.tx + (b.tx - a.tx) * k, y: a.ty + (b.ty - a.ty) * k, dir: toward(a, b), moving: true, state: 'WALK' };
}
