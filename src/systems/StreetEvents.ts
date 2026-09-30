// Sin Phaser: world/StreetEventView.ts lo pinta y scripts/check-street-events.ts
// lo recorre noche a noche con exactamente esta lógica.
import { PASSENGER_LOOKS } from '../data/npcs.ts';
import type { EventSlot, FighterProfile, StreetEventDef } from '../data/streetEvents.ts';
import type { Facing, LocationDef, TilePoint } from '../types/game.ts';
import { between, hashSeed, seededRng, type Rng } from './MetroDaily.ts';
import { weekIndex } from './Calendar.ts';
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
export type Role = 'fighter' | 'spectator' | 'watcher' | 'lookout' | 'bookmaker';

/** Minutos de juego: corrillo antes de empezar, asalto, descanso entre asaltos y rato en que el patio se vacía. */
export const GATHER = 40;
export const ROUND = 24;
export const BREAK = 10;
export const DISPERSE = 30;
/** Paso al llegar y al irse, en tiles por minuto de juego (un minuto de juego es medio segundo); con aviso, a paso ligero. */
export const WALK = 0.75;
export const FLEE = 1.6;
/** Un golpe cada tanto: el compás de la pelea, en minutos de juego (0,6 min = 0,3 s). */
const EXCHANGE = 2.8;

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
  /** Lado al que anima (0 rojo, 1 azul) y apuesta puramente ambiental, sin tocar la cartera del jugador. */
  support?: 0 | 1;
  bet?: { side: 0 | 1; stake: 5 | 10 | 20 };
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
  fighters: readonly [FighterProfile, FighterProfile];
  winner: 0 | 1;
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
  shout?: string;
  betting?: boolean;
}

export interface FighterPose {
  pose: 0 | 7 | 8 | 9 | 10 | 27 | 28 | 29 | 30 | 31;
  /** Px hacia el rival (negativo: retroceso), siempre dentro del collider existente. */
  dx: number;
  hit: boolean;
}

export type FightStage = 'waiting' | 'face-off' | 'argument' | 'stance' | 'exchange' | 'overwhelmed' | 'finish' | 'break' | 'ended';
export interface FightFrame {
  stage: FightStage;
  poses: [FighterPose, FighterPose];
  attacker: 0 | 1;
  strong: boolean;
  /** El golpe ya ha conectado: ventana breve para impactos y reacciones. Un esquive nunca da impacto. */
  contact: boolean;
  dodged: boolean;
  comic: 'PUNCH!' | 'POW!' | 'BAM!' | 'OUCH!' | null;
  id: string;
}

/** Adultos del mismo género. El rival más parecido prima sobre una pareja aleatoria. */
export function matchFighters(roster: readonly FighterProfile[], seed: number): [FighterProfile, FighterProfile] {
  const adults = roster.filter((p) => p.age >= 18 && (p.gender === 'man' || p.gender === 'woman') && PASSENGER_LOOKS.some((l) => l.id === p.look));
  const eligible = adults.filter((a) => adults.some((b) => a.look !== b.look && a.gender === b.gender));
  if (!eligible.length) throw new Error('Pelea clandestina: faltan dos adultos compatibles; no se usará una pareja arbitraria.');
  const rng = seededRng(seed);
  const a = eligible[Math.floor(rng() * eligible.length)];
  const candidates = adults.filter((b) => b.look !== a.look && b.gender === a.gender);
  const difference = (b: FighterProfile): number => Math.abs(a.body - b.body) * 3 + Math.abs(a.physical - b.physical);
  const best = Math.min(...candidates.map(difference));
  const nearest = candidates.filter((b) => difference(b) === best);
  return [a, nearest[Math.floor(rng() * nearest.length)]];
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

/**
 * Una noche empezada a mano (herramientas de desarrollo): empieza en `start`
 * (minutos absolutos), con `rounds` asaltos si se dice, y sin mirar el día, el
 * azar ni la lluvia. Todo lo demás (quién viene, por dónde, cómo pelean, cómo
 * se van) es exactamente lo de una noche normal.
 */
export interface ForcedStart {
  start: number;
  rounds?: number;
}

/** Lo que pasa (o no) la noche que empieza el día `day`; con `force`, la que se empieza a mano. */
export function planNight(def: StreetEventDef, loc: LocationDef, day: number, force?: ForcedStart): Night {
  const rng = seededRng(force ? hashSeed(def.id, day, 'force', Math.round(force.start)) : hashSeed(def.id, day));
  const [h0, h1] = def.window;
  const from = day * 1440 + h0 * 60;
  const to = day * 1440 + (h1 <= h0 ? h1 + 24 : h1) * 60;
  const rolled = def.rounds[0] + Math.floor(rng() * (def.rounds[1] - def.rounds[0] + 1));
  const rounds = force?.rounds ?? rolled;
  const fightLen = rounds * ROUND + (rounds - 1) * BREAK;
  const slot = rng();
  const start = force ? force.start : from + slot * Math.max(0, to - from - GATHER - fightLen - DISPERSE);
  const fightAt = start + GATHER;
  const bouts = Array.from({ length: rounds }, (_, i) => [fightAt + i * (ROUND + BREAK), fightAt + i * (ROUND + BREAK) + ROUND] as const);
  const end = fightAt + fightLen;
  // Las tiradas de la noche, siempre en el mismo orden: cambiar una regla no cambia el resto.
  const [roll, raidRoll, raidWhen] = [rng(), rng(), rng()];
  const fighters = matchFighters(def.fighterRoster, hashSeed(def.id, day, start, 'pair'));
  const advantage = (fighters[0].physical - fighters[1].physical) * 0.08;
  const winner: 0 | 1 = seededRng(hashSeed(def.id, day, start, 'result'))() < 0.5 + advantage ? 0 : 1;
  const base = { day, start, fightAt, rounds: bouts, end, raidAt: null, members: [], fighters, winner };
  if (!force && !def.days.includes(weekIndex(day))) return { ...base, happens: false, why: 'weekday' };
  if (!force && roll >= def.chance) return { ...base, happens: false, why: 'chance' };
  const w = weatherAt(Math.floor(fightAt / 1440), (fightAt % 1440) / 60);
  if (!force && !def.covered && w.rain >= def.weather.cancelRain) return { ...base, happens: false, why: 'rain' };

  let crowd = def.crowd[0] + Math.floor(rng() * (def.crowd[1] - def.crowd[0] + 1));
  if (!def.covered && w.rain > 0.08) crowd *= def.weather.lightRainCrowd;
  if (w.celsius < def.weather.coldBelow) crowd *= def.weather.coldCrowd;
  if (w.celsius > def.weather.warmAbove) crowd += def.weather.warmExtra;
  crowd = Math.max(2, Math.min(def.spectators.length, Math.round(crowd)));
  // A mano no hay aviso del vigía: la pelea dura lo que se ha pedido (y fijada, hasta que se suelte).
  const raidAt = !force && raidRoll < def.raid ? fightAt + raidWhen * (end - fightAt) * 0.8 : null;
  const stop = raidAt ?? end;

  const entries = def.entries.map((id) => loc.points?.[id]).filter((p): p is NonNullable<typeof p> => !!p);
  const looks = shuffled(PASSENGER_LOOKS.map((_, i) => i), rng);
  // El aspecto viene del perfil adulto emparejado, nunca de un fallback sin metadatos.
  const fighterLooks = fighters.map((f) => PASSENGER_LOOKS.findIndex((l) => l.id === f.look));
  const members: Member[] = [];
  const add = (role: Role, slot: EventSlot, arrive: number, leave: number, look: number): void => {
    const entry = entries[Math.floor(rng() * entries.length)];
    const exit = entries[Math.floor(rng() * entries.length)];
    // Con aviso, nadie se queda: se va en cuanto lo oye, cada uno un poco antes o después.
    const warned = raidAt !== null && leave > raidAt;
    const left = warned ? raidAt + rng() * 1.5 : leave;
    members.push({ id: members.length + 1, role, slot, entry, exit, arrive, leave: Math.max(arrive + 4, left), look, seed: Math.floor(rng() * 1e6), fast: warned });
  };
  def.fighters.forEach((slot, i) => add('fighter', slot, start + between(rng, 8, 20), stop + between(rng, 4, 12), fighterLooks[i]));
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
  if (def.bookmaker) add('bookmaker', def.bookmaker, start + 8, end + 12, nextLook());
  // Al menos dos apuestas en cada noche; el resto mira o anima sin apostar.
  let bettors = 0;
  for (const m of members) {
    if (m.role === 'fighter' || m.role === 'lookout' || m.role === 'bookmaker') continue;
    m.support = (m.seed % 2) as 0 | 1;
    if (m.role === 'spectator' && (bettors < 2 || hash(m.seed, 17) < 0.4)) {
      m.bet = { side: m.support, stake: ([5, 10, 20] as const)[m.seed % 3] };
      bettors++;
    }
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

/** Una sola secuencia para pelea natural, forzada, render y público; toda sale del reloj. */
export function fightFrame(n: Night, t: number): FightFrame {
  const phase = phaseAt(n, t);
  const ready = (dx = 8): [FighterPose, FighterPose] => [{ pose: 8, dx, hit: false }, { pose: 8, dx, hit: false }];
  const still = (pose: FighterPose['pose'], dx = 0): [FighterPose, FighterPose] => [{ pose, dx, hit: false }, { pose, dx, hit: false }];
  const base: FightFrame = { stage: 'waiting', poses: still(0), attacker: n.winner, strong: false, contact: false, dodged: false, comic: null, id: '' };
  if (phase === 'break') return { ...base, stage: 'break', poses: still(29, -2) };
  if (phase === 'gathering') {
    const left = n.fightAt - t;
    return left > 6 ? base : { ...base, stage: left > 3 ? 'face-off' : 'argument', poses: still(left > 3 ? 0 : 31, 6) };
  }
  if (phase !== 'fight') {
    const poses = still(0, -2);
    if (phase === 'dispersing' && n.raidAt === null && t < n.end + 5) {
      poses[n.winner] = { pose: 30, dx: 4, hit: false };
      poses[1 - n.winner] = { pose: 29, dx: -6, hit: false };
    }
    return { ...base, stage: 'ended', poses };
  }
  const round = n.rounds.findIndex(([a, b]) => t >= a && t < b);
  const r = t - n.rounds[round][0];
  if (r < 1.5) return { ...base, stage: 'face-off', poses: still(0, 6) };
  if (r < 3) return { ...base, stage: 'argument', poses: still(31, 6) };
  if (r < 4.5) return { ...base, stage: 'stance', poses: ready() };
  if (r >= ROUND - 2) {
    const poses = ready();
    const final = round === n.rounds.length - 1;
    poses[n.winner] = { pose: final ? 30 : 8, dx: 8, hit: false };
    poses[1 - n.winner] = { pose: 29, dx: -6, hit: false };
    return { ...base, stage: 'finish', poses };
  }
  const cycle = Math.floor((r - 4.5) / EXCHANGE);
  const beat = (r - 4.5) % EXCHANGE;
  // El atacante y la fuerza se fijan al empezar el intercambio, nunca a mitad de un golpe.
  const late = 4.5 + cycle * EXCHANGE >= ROUND - 9;
  const attacker: 0 | 1 = late ? n.winner : hash(n.day, n.start, round, cycle) < 0.5 ? 0 : 1;
  const dodge = !late && hash(n.day, n.start, round, cycle, 7) < 0.3;
  const strong = late || hash(n.day, n.start, round, cycle, 19) < 0.2;
  const a: FighterPose = { pose: 8, dx: 8, hit: false };
  const d: FighterPose = { pose: late ? 29 : 8, dx: late ? 3 : 8, hit: false };
  const contact = !dodge && beat >= 0.75 && beat < 1.55;
  if (beat < 0.75) Object.assign(a, { pose: 27, dx: 6 + beat * 4 });
  else if (beat < 1.1) {
    Object.assign(a, { pose: 9, dx: 14, hit: !dodge });
    Object.assign(d, dodge ? { pose: 28, dx: 1 } : { pose: 10, dx: 7 - (beat - 0.75) * (strong ? 24 : 12) });
  } else if (beat < 1.8) {
    Object.assign(a, { pose: 8, dx: 12 - (beat - 1.1) * 5 });
    Object.assign(d, dodge ? { pose: 28, dx: 1 + (beat - 1.1) * 6 } : { pose: strong ? 29 : 10, dx: (strong ? -4 : 2) + (beat - 1.1) * 4 });
  }
  const words = ['PUNCH!', 'POW!', 'BAM!', 'OUCH!'] as const;
  const comic = contact && hash(n.day, n.start, round, cycle, 23) < 0.48 ? words[hashSeed(n.day, round, cycle, 31) % words.length] : null;
  return { ...base, stage: late ? 'overwhelmed' : 'exchange', poses: attacker === 0 ? [a, d] : [d, a], attacker, strong, contact, dodged: dodge && beat >= 0.75 && beat < 1.8, comic, id: n.day + ':' + n.start + ':' + round + ':' + cycle };
}

export function fighterPoses(n: Night, t: number): [FighterPose, FighterPose] {
  return fightFrame(n, t).poses;
}

/** Comentarios y gestos del mismo público: las apuestas son ambiente, no una economía nueva. */
export function crowdCue(n: Night, m: Member, t: number): { state: string; shout?: string; betting?: boolean } {
  const frame = fightFrame(n, t);
  const phase = phaseAt(n, t);
  const side = m.bet?.side ?? m.support ?? 0;
  const name = n.fighters[side].nickname;
  const moment = Math.floor(t / 2);
  const talks = hash(m.seed, moment) < 0.38;
  if (m.role === 'bookmaker') {
    const settle = n.raidAt === null && t >= n.end;
    return { state: talks ? 'TALK' : 'WATCH', betting: phase === 'gathering' || phase === 'break' || settle,
      shout: talks ? n.raidAt !== null && t >= n.raidAt ? 'Guardad los billetes.' : settle ? 'Paga a ' + n.fighters[n.winner].nickname + '.' : phase === 'gathering' || phase === 'break' ? 'Cinco, diez... apuntado.' : undefined : undefined };
  }
  const finalEnd = n.rounds[n.rounds.length - 1][1];
  if (n.raidAt === null && ((phase === 'dispersing' && t < n.end + 6) || frame.stage === 'finish' && t >= finalEnd - 2)) {
    const won = side === n.winner;
    return { state: won ? 'CHEER' : 'TALK', betting: !!m.bet, shout: talks ? m.bet ? won ? '¡Cobro!' : 'Adiós a mis ' + m.bet.stake + '...' : won ? '¡' + name + '!' : 'La próxima.' : undefined };
  }
  if (phase === 'fight' && frame.contact) {
    const backing = side === frame.attacker;
    const loud = frame.strong || hash(m.seed, Math.floor(t / 0.6)) < 0.5;
    return { state: loud ? 'CHEER' : 'WATCH', shout: loud && talks ? backing ? '¡' + name + '!' : frame.strong ? '¡Aguanta, ' + name + '!' : '¡Uy!' : undefined };
  }
  if (m.bet && (phase === 'gathering' || phase === 'break') && talks) return { state: 'TALK', betting: true, shout: '€' + m.bet.stake + ' a ' + name + '.' };
  if (m.bet && phase === 'fight' && !frame.contact && talks && m.seed % 3 === moment % 3) return { state: 'TALK', betting: true, shout: '€' + m.bet.stake + ' a ' + name + '.' };
  if (frame.stage === 'argument' && talks) return { state: 'TALK', shout: '¡Basta de hablar!' };
  return { state: phase === 'fight' && hash(m.seed, moment) < 0.25 ? 'CHEER' : talks ? 'TALK' : 'WATCH', shout: phase === 'fight' && talks && m.seed % 3 === 0 ? '¡Vamos, ' + name + '!' : undefined };
}

/** Cuándo se ha ido el último: el fin (o el aviso), el rato de recoger y lo que tarda en salir andando. */
const tailOf = (n: Night): number => (n.raidAt ?? n.end) + DISPERSE + 180;

/**
 * Se deshace el corro en `t`: como el aviso del vigía, todos se van deprisa.
 * Quien aún venía de camino no desaparece: llega a su sitio y se va en el acto.
 */
function scatter(n: Night, t: number): void {
  n.raidAt = Math.min(n.raidAt ?? Infinity, t);
  for (const m of n.members) {
    if (m.leave <= t) continue;
    m.leave = Math.max(t, m.arrive) + (m.seed % 90) / 60;
    m.fast = true;
  }
}

/** Lo forzado a mano, por evento: sobrevive a cambiar de escena (cada escena crea su StreetEvent). Sólo lo toca el gancho de desarrollo. */
interface DevOverride {
  forced?: Night;
  pinned?: boolean;
  /** Hasta cuándo el sitio queda vacío (retirada a mano). */
  clearUntil?: number;
}
const DEV = new Map<string, DevOverride>();

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
    // Herramientas de desarrollo (DEV, abajo): una noche forzada manda; una retirada deja el sitio vacío.
    const dev = DEV.get(this.def.id);
    if (dev?.forced) {
      if (t < tailOf(dev.forced)) return dev.forced;
      dev.forced = undefined;
    }
    if (dev?.clearUntil !== undefined && t < dev.clearUntil) return { ...this.naturalAt(t), happens: false };
    return this.naturalAt(t);
  }

  /** La noche del calendario, sin nada de desarrollo. */
  private naturalAt(t: number): Night {
    const today = Math.floor(t / 1440);
    const yesterday = this.night(today - 1);
    // Con margen: el último en irse aún está saliendo por la Mayor.
    return yesterday.happens && t < tailOf(yesterday) ? yesterday : this.night(today);
  }

  // ------------------------------------------ herramientas de desarrollo
  // Sólo las llama el gancho de consola de main.ts (import.meta.env.DEV): en la
  // versión publicada nadie las llama y el estado de abajo se queda vacío. Una
  // pelea forzada es una noche como las demás (planNight): la misma gente, las
  // mismas poses, el mismo corro, el mismo aviso para mirar y la misma recogida.

  /** Empieza una pelea ahora: el corro ya casi formado y el primer asalto en seis minutos de juego. */
  devForce(t: number, pinned = false): Night {
    // Fijada: tantos asaltos que no acaba sola (unas 34 horas de juego) hasta que se suelte.
    const night = planNight(this.def, this.loc, Math.floor(t / 1440), { start: t - (GATHER - 6), rounds: pinned ? 60 : undefined });
    DEV.set(this.def.id, { forced: night, pinned });
    return night;
  }

  /** Fijar la pelea activa (la fuerza si no hay una forzada) o soltarla: al soltar, el corro se deshace como con el aviso del vigía. */
  devPin(t: number, on: boolean): void {
    const dev = DEV.get(this.def.id);
    if (on) {
      if (!dev?.forced || !dev.pinned || phaseAt(dev.forced, t) === 'dispersing') this.devForce(t, true);
      return;
    }
    if (!dev?.forced) return;
    dev.pinned = false;
    scatter(dev.forced, t);
  }

  /**
   * Retirar la pelea ya: nadie en el patio desde este momento (ni la forzada
   * ni la de esta noche del calendario, hasta que acabe). La recogida es la de
   * siempre: la vista suelta a cada uno en el siguiente frame.
   */
  devDespawn(t: number): void {
    const natural = this.naturalAt(t);
    DEV.set(this.def.id, { clearUntil: natural.happens ? Math.max(t, tailOf(natural)) : t });
  }

  /**
   * Volver al calendario: quita lo forzado, lo fijado y lo retirado. El evento
   * no tiene enfriamiento propio (cada noche se tira por su cuenta, sin mirar
   * la anterior); lo único que lo bloquea es haberlo retirado a mano.
   */
  devReset(): void {
    DEV.delete(this.def.id);
  }

  /** Qué hay ahora y por qué: para la consola. */
  devStatus(t: number): { phase: EventPhase; forced: boolean; pinned: boolean; cleared: boolean; tonight: string } {
    const dev = DEV.get(this.def.id);
    const natural = this.naturalAt(t);
    const hhmm = (m: number): string => `día ${Math.floor(m / 1440)} ${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
    return {
      phase: this.phase(t),
      forced: !!dev?.forced,
      pinned: !!dev?.pinned,
      cleared: dev?.clearUntil !== undefined && t < dev.clearUntil,
      tonight: natural.happens ? `sí, de ${hhmm(natural.start)} a ${hhmm(natural.raidAt ?? natural.end)}` : `no (${natural.why})`,
    };
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
      const slots = [...this.def.spectators, ...this.def.watchers, ...(this.def.bookmaker ? [this.def.bookmaker] : []), ...(this.def.lookout ? [this.def.lookout] : [])].map((s) => `${s.tx},${s.ty}`);
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
    return n.members.map((m) => this.memberAt(n, m, t)).filter((p): p is Presence => p !== null);
  }

  /**
   * Dónde está una persona de esa noche a la hora `t`, o null si todavía no ha
   * salido o ya se ha ido. Cada una puede ir con su propio retraso (quien se para
   * a hablar con el jugador sigue luego donde lo dejó: world/StreetEventView).
   */
  memberAt(n: Night, m: Member, t: number): Presence | null {
    const into = this.path(m.entry, m.slot);
    const inMin = Math.max(1, into.length - 1) / WALK;
    if (t < m.arrive - inMin) return null;
    if (t < m.arrive) return along(m, into, (t - (m.arrive - inMin)) / inMin);
    if (t >= m.leave) {
      const away = this.path(m.slot, m.exit);
      const outMin = Math.max(1, away.length - 1) / (m.fast ? FLEE : WALK);
      return t < m.leave + outMin ? along(m, away, (t - m.leave) / outMin) : null;
    }
    return this.atSlot(n, m, phaseAt(n, t), t);
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
    const cue = crowdCue(n, m, t);
    // Un paso mínimo de emoción, sin abandonar el tile ni entrar en la pelea.
    const lean = phase === 'fight' ? 0.16 * Math.sin(t / (2.5 + (m.seed % 4)) + m.seed) : 0;
    const dx = this.center.tx - m.slot.tx;
    const dy = this.center.ty - m.slot.ty;
    const len = Math.hypot(dx, dy) || 1;
    return { ...at, x: m.slot.tx + (dx / len) * lean, y: m.slot.ty + (dy / len) * lean, ...cue };
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
