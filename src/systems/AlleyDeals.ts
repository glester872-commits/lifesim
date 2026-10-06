// Sin Phaser: world/AlleyDealView.ts lo pinta y scripts/check-alley-deals.ts lo recorre día a día con esta misma lógica.
import { PASSENGER_LOOKS } from '../data/npcs.ts';
import { ALLEY_SPOTS, type AlleySpotDef } from '../data/alleyDeals.ts';
import { STREET_EVENTS, type EventSlot } from '../data/streetEvents.ts';
import type { Facing, LocationDef, TilePoint } from '../types/game.ts';
import { between, hashSeed, seededRng, type Rng } from './MetroDaily.ts';
import { weekIndex } from './Calendar.ts';
import { ROADWAY, isWalkable } from './LocationSystem.ts';
import { phaseAt as fightPhaseAt, planNight } from './StreetEvents.ts';
import { weatherAt } from './Weather.ts';
import { eventId, type EventInfo, type Lifecycle } from './WorldEvents.ts';

/**
 * Trapicheo en un callejón (data/alleyDeals.ts), como los eventos de calle
 * (systems/StreetEvents.ts): cada día se decide de una vez, con una semilla por
 * sitio y día, si hay algún rato y cuándo, quién viene y por dónde. Lo que pasa
 * en cada momento sale del reloj (minutos absolutos: día × 1440 + minuto).
 *
 * Lo único que no sale del reloj es lo que interrumpe: el jugador que se queda
 * mirando o alguien de uniforme que se acerca. Entonces todos se van deprisa y
 * el sitio queda en enfriamiento: esa parte se guarda aquí (no en la partida) y
 * sobrevive a cambiar de escena.
 */

export type DealRole = 'seller' | 'lookout' | 'associate' | 'buyer';
export type DealPhase = 'none' | 'waiting' | 'exchange' | 'dispersing';
export type Interruption = 'player' | 'authority' | 'dev';

/** Franjas del día en que puede haber un rato, en horas. Por la mañana y a mediodía, nunca. */
export const SLOTS = { late: [0.5, 3.5], afternoon: [16, 19], evening: [20, 23.5] } as const;
/** Lo que dura un rato, en minutos de juego. */
const LENGTH: readonly [number, number] = [35, 60];
/** Lo que se queda quien compra junto al vendedor: un momento. */
export const EXCHANGE = 1.6;
/** Paso al llegar y al irse, en tiles por minuto de juego; con prisa, más. */
const WALK = 0.7;
const FLEE = 1.5;
/** El jugador muy cerca (tiles) durante tanto (minutos de juego): se dan cuenta. */
export const NOTICE_TILES = 2.6;
export const LINGER_MIN = 5;
/** Alguien de uniforme a esta distancia (tiles) del vendedor: se van sin decir nada. */
export const AWARE_TILES = 7;
/** Al darse cuenta del jugador, le miran un momento antes de irse. */
export const GLARE = 1.5;
/** Tras una interrupción, el sitio se queda vacío un buen rato. */
export const COOLDOWN = 240;
/** Con este chaparrón, en la calle no hay nadie. */
const CANCEL_RAIN = 0.55;

export interface DealMember {
  id: number;
  role: DealRole;
  slot: EventSlot;
  entry: TilePoint;
  exit: TilePoint;
  /** Minutos absolutos: cuándo está en su sitio y cuándo se va de él. */
  arrive: number;
  leave: number;
  /** Índice en PASSENGER_LOOKS: al azar, sin mirar quién es. */
  look: number;
  seed: number;
  fast: boolean;
  /** No llegó a salir: la interrupción le pilló antes de echar a andar. */
  cancelled?: boolean;
}

export interface Episode {
  spot: AlleySpotDef;
  day: number;
  slot: keyof typeof SLOTS;
  start: number;
  end: number;
  members: DealMember[];
  interrupted?: { at: number; why: Interruption; from?: TilePoint };
}

export interface DayPlan {
  day: number;
  episodes: Episode[];
  /** Por qué no hay en cada franja (para la consola y las pruebas). */
  skipped: Partial<Record<keyof typeof SLOTS, 'chance' | 'rain' | 'busy'>>;
}

export interface DealPresence {
  member: DealMember;
  x: number;
  y: number;
  dir: Facing;
  moving: boolean;
  /** WAIT, WATCH o TALK parado; WALK andando. */
  state: string;
}

const shuffled = <T>(items: readonly T[], rng: Rng): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

function toward(from: TilePoint, to: TilePoint): Facing {
  const dx = to.tx - from.tx;
  const dy = to.ty - from.ty;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'down' : 'up';
}

/** Camino de tile en tile por suelo pisable que no sea calzada: nadie atraviesa la avenida para llegar. */
export function alleyPath(loc: LocationDef, a: TilePoint, b: TilePoint): TilePoint[] | null {
  const key = (p: TilePoint): string => `${p.tx},${p.ty}`;
  const ok = (x: number, y: number): boolean => isWalkable(loc, x, y) && !ROADWAY.has(loc.ground[y]?.[x] ?? '');
  const prev = new Map<string, TilePoint | null>([[key(a), null]]);
  const queue: TilePoint[] = [a];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    if (cur.tx === b.tx && cur.ty === b.ty) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { tx: cur.tx + dx, ty: cur.ty + dy };
      if (prev.has(key(next)) || !ok(next.tx, next.ty)) continue;
      prev.set(key(next), cur);
      queue.push(next);
    }
  }
  if (!prev.has(key(b))) return null;
  const out: TilePoint[] = [];
  for (let p: TilePoint | null | undefined = b; p; p = prev.get(key(p))) out.unshift(p);
  return out;
}

/** Si ese evento de calle (la pelea del patio) ocupa el sitio entre `from` y `to`. */
function busy(spot: AlleySpotDef, loc: LocationDef, from: number, to: number): boolean {
  const def = STREET_EVENTS.find((e) => e.id === spot.yieldsTo);
  if (!def) return false;
  const day = Math.floor(from / 1440);
  for (const d of [day - 1, day]) {
    const n = planNight(def, loc, d);
    if (!n.happens) continue;
    for (let t = from - 10; t <= to + 10; t += 5) if (fightPhaseAt(n, t) !== 'none') return true;
  }
  return false;
}

/** El reparto de un rato: vendedor, vigía, a veces un acompañante y de dos a cuatro que vienen, de uno en uno. */
function members(spot: AlleySpotDef, start: number, end: number, rng: Rng): DealMember[] {
  const looks = shuffled(PASSENGER_LOOKS.map((_, i) => i), rng);
  const out: DealMember[] = [];
  const entry = (): TilePoint => spot.entries[Math.floor(rng() * spot.entries.length)];
  const add = (role: DealRole, slot: EventSlot, arrive: number, leave: number): void => {
    out.push({ id: out.length + 1, role, slot, entry: entry(), exit: entry(), arrive, leave, look: looks[out.length % looks.length], seed: Math.floor(rng() * 1e6), fast: false });
  };
  add('seller', spot.seller, start, end);
  add('lookout', spot.lookout, start - 2, end + 1);
  if (spot.associate && rng() < 0.5) add('associate', spot.associate, start + between(rng, 2, 6), end - between(rng, 0, 10));
  const buyers = 2 + Math.floor(rng() * 3);
  const room = (end - start - 14) / buyers;
  for (let i = 0; i < buyers; i++) {
    const at = start + 8 + i * room + rng() * Math.max(0, room - EXCHANGE - 2);
    add('buyer', spot.meet, at, at + EXCHANGE);
  }
  return out;
}

/** Lo que trae el día `day` a este sitio: en cada franja, un rato o ninguno. */
export function planDay(spot: AlleySpotDef, loc: LocationDef, day: number): DayPlan {
  const rng = seededRng(hashSeed('alley', spot.id, day));
  const plan: DayPlan = { day, episodes: [], skipped: {} };
  const dow = weekIndex(day);
  for (const slot of ['late', 'afternoon', 'evening'] as const) {
    // Las tiradas siempre en el mismo orden: cambiar una regla no mueve el resto.
    const [roll, when, len] = [rng(), rng(), rng()];
    // Viernes y sábado por la noche (y su madrugada), algo más.
    const weekend = (slot === 'evening' && (dow === 4 || dow === 5)) || (slot === 'late' && (dow === 5 || dow === 6));
    const chance = spot.odds[slot] * (weekend ? 1.5 : 1);
    if (roll >= chance) {
      plan.skipped[slot] = 'chance';
      continue;
    }
    const [h0, h1] = SLOTS[slot];
    const length = LENGTH[0] + len * (LENGTH[1] - LENGTH[0]);
    const start = day * 1440 + h0 * 60 + when * Math.max(0, (h1 - h0) * 60 - length);
    const end = start + length;
    if (weatherAt(day, (start % 1440) / 60).rain >= CANCEL_RAIN) {
      plan.skipped[slot] = 'rain';
      continue;
    }
    if (busy(spot, loc, start, end)) {
      plan.skipped[slot] = 'busy';
      continue;
    }
    plan.episodes.push({ spot, day, slot, start, end, members: members(spot, start, end, seededRng(hashSeed('alley-cast', spot.id, day, slot))) });
  }
  return plan;
}

/** Lo que se guarda de cada sitio fuera de la semilla: los días ya planeados (con sus interrupciones), el enfriamiento y lo forzado. */
interface SpotState {
  plans: Map<number, DayPlan>;
  cooldownUntil: number;
  forced?: Episode;
  /** Minutos que lleva el jugador muy cerca, en el rato en curso. */
  linger: number;
  lastT?: number;
}
const STATE = new Map<string, SpotState>();

/**
 * Un sitio con sus ratos. Varios objetos del mismo sitio (una escena nueva cada
 * vez que se entra) comparten el mismo estado: lo interrumpido sigue
 * interrumpido y el enfriamiento sigue contando.
 */
export class AlleyDeal {
  readonly spot: AlleySpotDef;
  private readonly loc: LocationDef;
  private readonly paths = new Map<string, TilePoint[]>();

  constructor(spot: AlleySpotDef, loc: LocationDef) {
    this.spot = spot;
    this.loc = loc;
  }

  private get state(): SpotState {
    let s = STATE.get(this.spot.id);
    if (!s) STATE.set(this.spot.id, (s = { plans: new Map(), cooldownUntil: -Infinity, linger: 0 }));
    return s;
  }

  plan(day: number): DayPlan {
    const s = this.state;
    let p = s.plans.get(day);
    if (!p) {
      p = planDay(this.spot, this.loc, day);
      s.plans.set(day, p);
      for (const d of s.plans.keys()) if (d < day - 1) s.plans.delete(d);
    }
    return p;
  }

  /** El rato que hay a esta hora (llegando, en marcha o recogiendo), o ninguno. */
  episodeAt(t: number): Episode | undefined {
    const s = this.state;
    if (s.forced) {
      if (t < tailOf(s.forced)) return s.forced;
      // Acabado el forzado, el rato del calendario que ya había empezado no aparece a medias detrás: un rato por sitio.
      s.cooldownUntil = Math.max(s.cooldownUntil, t);
      s.forced = undefined;
    }
    const ep = this.plan(Math.floor(t / 1440)).episodes.find((e) => t >= e.start - 15 && t < tailOf(e));
    // En enfriamiento no empieza ninguno nuevo; el interrumpido sí termina de irse.
    if (ep && !ep.interrupted && ep.start - 15 < s.cooldownUntil) return undefined;
    return ep;
  }

  phase(t: number): DealPhase {
    const ep = this.episodeAt(t);
    if (!ep) return 'none';
    const stop = ep.interrupted?.at ?? ep.end;
    if (t >= stop) return 'dispersing';
    if (t < ep.start) return 'none';
    return ep.members.some((m) => m.role === 'buyer' && !m.cancelled && t >= m.arrive && t < m.leave) ? 'exchange' : 'waiting';
  }

  /** Cuándo vuelve a poder haber algo aquí (minutos absolutos), si está en enfriamiento. */
  cooldownUntil(): number {
    return this.state.cooldownUntil;
  }

  /** Cómo se cortó el rato en curso, si se cortó. */
  interruption(t: number): Episode['interrupted'] {
    return this.episodeAt(t)?.interrupted;
  }

  /**
   * Se acabó por ahora: el jugador se ha quedado mirando (le miran un momento y
   * se van), alguien de uniforme se acerca (se van sin más) o se retira a mano.
   * Quien aún no había salido ya no viene; quien venía de camino llega y se va.
   */
  interrupt(t: number, why: Interruption, from?: TilePoint): void {
    const ep = this.episodeAt(t);
    if (!ep || ep.interrupted || t >= ep.end) return;
    ep.interrupted = { at: t, why, from };
    const wait = why === 'player' ? GLARE : 0;
    for (const m of ep.members) {
      if (m.leave <= t) continue;
      const walkIn = (this.path(m.entry, m.slot).length - 1) / WALK;
      if (t < m.arrive - walkIn) {
        m.cancelled = true;
        continue;
      }
      m.leave = Math.max(t + wait, m.arrive) + (m.seed % 60) / 60;
      m.fast = true;
    }
    this.state.cooldownUntil = t + COOLDOWN;
    this.state.linger = 0;
  }

  /**
   * Cada frame, con el jugador y quien lleve uniforme cerca: si el jugador se
   * queda muy cerca un rato, o alguien de uniforme entra en su radio, se
   * interrumpe. Fuera de eso, sólo se mira.
   */
  observe(t: number, player: TilePoint, authorities: readonly TilePoint[] = []): void {
    const s = this.state;
    // Un fotograma son centésimas de minuto: un salto mayor (otra escena, dormir, el reloj adelantado) no cuenta como quedarse mirando.
    const dt = s.lastT === undefined ? 0 : Math.max(0, Math.min(0.25, t - s.lastT));
    s.lastT = t;
    const ep = this.episodeAt(t);
    if (!ep || ep.interrupted || t < ep.start || t >= ep.end) {
      s.linger = 0;
      return;
    }
    const seller = ep.spot.seller;
    if (authorities.some((a) => Math.hypot(a.tx - seller.tx, a.ty - seller.ty) <= AWARE_TILES)) {
      this.interrupt(t, 'authority');
      return;
    }
    const near = this.presentAt(t).some((p) => !p.moving && Math.hypot(p.x - player.tx, p.y - player.ty) <= NOTICE_TILES);
    s.linger = near ? s.linger + dt : 0;
    if (s.linger >= LINGER_MIN) this.interrupt(t, 'player', player);
  }

  /** Quién está y dónde a esta hora. */
  presentAt(t: number): DealPresence[] {
    const ep = this.episodeAt(t);
    if (!ep) return [];
    return ep.members.map((m) => this.memberAt(ep, m, t)).filter((p): p is DealPresence => p !== null);
  }

  /** Camino entre dos tiles, una vez por par. */
  path(from: TilePoint, to: TilePoint): TilePoint[] {
    const key = `${from.tx},${from.ty}>${to.tx},${to.ty}`;
    let p = this.paths.get(key);
    if (!p) this.paths.set(key, (p = alleyPath(this.loc, from, to) ?? [from, to]));
    return p;
  }

  private memberAt(ep: Episode, m: DealMember, t: number): DealPresence | null {
    if (m.cancelled) return null;
    const into = this.path(m.entry, m.slot);
    const inMin = Math.max(1, into.length - 1) / WALK;
    if (t < m.arrive - inMin) return null;
    if (t < m.arrive) return along(m, into, (t - (m.arrive - inMin)) / inMin);
    if (t >= m.leave) {
      const away = this.path(m.slot, m.exit);
      const outMin = Math.max(1, away.length - 1) / (m.fast ? FLEE : WALK);
      return t < m.leave + outMin ? along(m, away, (t - m.leave) / outMin) : null;
    }
    const at = { member: m, x: m.slot.tx, y: m.slot.ty, moving: false };
    // Se han dado cuenta del jugador: le miran un momento antes de irse.
    const cut = ep.interrupted;
    if (cut?.why === 'player' && cut.from && t >= cut.at) return { ...at, dir: toward(m.slot, cut.from), state: 'WAIT' };
    const buyerHere = ep.members.find((b) => b.role === 'buyer' && !b.cancelled && t >= b.arrive && t < b.leave);
    if (m.role === 'seller') return buyerHere ? { ...at, dir: toward(m.slot, ep.spot.meet), state: 'TALK' } : { ...at, dir: m.slot.facing ?? 'down', state: 'WAIT' };
    if (m.role === 'buyer') return { ...at, dir: toward(m.slot, ep.spot.seller), state: 'TALK' };
    if (m.role === 'associate') return buyerHere ? { ...at, dir: m.slot.facing ?? 'down', state: 'WAIT' } : { ...at, dir: toward(m.slot, ep.spot.seller), state: 'TALK' };
    // El vigía mira a una boca y a la otra, cada uno a su ritmo.
    const turn = Math.floor((t + (m.seed % 7)) / 3) % 3 === 2;
    return { ...at, dir: turn ? (ep.spot.scan ?? 'up') : (m.slot.facing ?? 'down'), state: 'WATCH' };
  }

  // ------------------------------------------ herramientas de desarrollo
  // Sólo las llama el gancho de consola de main.ts (import.meta.env.DEV).

  /** Empieza un rato ahora mismo, como uno del calendario (mismo reparto, mismos caminos). */
  devForce(t: number): Episode {
    const s = this.state;
    s.cooldownUntil = -Infinity;
    const start = t + 2;
    const end = start + LENGTH[1];
    s.forced = { spot: this.spot, day: Math.floor(t / 1440), slot: 'evening', start, end, members: members(this.spot, start, end, seededRng(hashSeed('alley-force', this.spot.id, Math.round(t)))) };
    return s.forced;
  }

  devStatus(t: number): { phase: DealPhase; cooldown: string; today: string; interrupted?: Interruption } {
    const ep = this.episodeAt(t);
    const hhmm = (m: number): string => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
    const plan = this.plan(Math.floor(t / 1440));
    const cd = this.state.cooldownUntil;
    return {
      phase: this.phase(t),
      cooldown: cd > t ? `hasta las ${hhmm(cd)}` : 'no',
      today: plan.episodes.length ? plan.episodes.map((e) => `${hhmm(e.start)}–${hhmm(e.end)}${e.interrupted ? ` (cortado: ${e.interrupted.why})` : ''}`).join(', ') : `ninguno (${Object.entries(plan.skipped).map(([k, v]) => `${k}: ${v}`).join(', ')})`,
      interrupted: ep?.interrupted?.why,
    };
  }

  /** Olvidar lo interrumpido y el enfriamiento de este sitio (vuelve al calendario puro). */
  devReset(): void {
    STATE.delete(this.spot.id);
  }

  /**
   * Dónde está en el ciclo común (systems/WorldEvents): llegando (SPAWNING),
   * esperando o vendiendo (ACTIVE), cortado y mirando al jugador (RESOLUTION),
   * saliendo (CLEANUP) y, tras un corte, COOLDOWN (COOLDOWN minutos).
   */
  lifecycle(t: number): EventInfo {
    const ep = this.episodeAt(t);
    const phase = this.phase(t);
    const present = ep ? this.presentAt(t) : [];
    const cut = ep?.interrupted;
    let lifecycle: Lifecycle;
    if (!ep) lifecycle = this.state.cooldownUntil > t ? 'COOLDOWN' : 'ELIGIBLE';
    else if (cut && t < cut.at + (cut.why === 'player' ? GLARE : 0) + 1) lifecycle = 'RESOLUTION';
    else if (phase === 'dispersing') lifecycle = 'CLEANUP';
    else if (phase === 'none') lifecycle = 'SPAWNING';
    else lifecycle = 'ACTIVE';
    return {
      id: eventId('alley', this.spot.id),
      type: 'alley',
      location: this.spot.location,
      anchor: this.spot.seller,
      lifecycle,
      phase,
      age: ep ? t - (ep.start - 15) : null,
      maxLeft: ep ? tailOf(ep) - t : null,
      unit: 'min',
      participants: present.map((p) => ({ id: `${this.spot.id}#${p.member.id}`, role: p.member.role })),
      responders: [],
      cooldownLeft: Math.max(0, this.state.cooldownUntil - t),
      forced: !!this.state.forced,
    };
  }

  /** Depuración: lo resuelve como cuando se acerca alguien de uniforme: se van y empieza el enfriamiento. */
  devResolve(t: number): string {
    const ep = this.episodeAt(t);
    if (!ep || ep.interrupted || t >= ep.end) return 'no hay rato en marcha';
    this.interrupt(t, 'dev');
    return 'cortado: se van y empieza el enfriamiento';
  }

  /** Depuración: lo cancela ya (nadie en el callejón desde este momento), con enfriamiento. */
  devCancel(t: number): string {
    const ep = this.episodeAt(t);
    if (!ep) return 'no hay rato en marcha';
    if (!ep.interrupted) this.interrupt(t, 'dev');
    for (const m of ep.members) m.cancelled = true;
    if (this.state.forced === ep) this.state.forced = undefined;
    this.state.cooldownUntil = Math.max(this.state.cooldownUntil, t + COOLDOWN);
    return 'cancelado: el callejón queda vacío';
  }
}

/** Cuándo se ha ido el último: lo que tarda en salir andando el que más, con margen. */
export function tailOf(ep: Episode): number {
  return Math.max(...ep.members.filter((m) => !m.cancelled).map((m) => m.leave)) + 30;
}

function along(m: DealMember, path: readonly TilePoint[], f: number): DealPresence {
  if (path.length < 2) return { member: m, x: path[0].tx, y: path[0].ty, dir: 'down', moving: false, state: 'WAIT' };
  const pos = Math.min(path.length - 1, Math.max(0, f) * (path.length - 1));
  const i = Math.min(path.length - 2, Math.floor(pos));
  const a = path[i];
  const b = path[i + 1];
  const k = pos - i;
  return { member: m, x: a.tx + (b.tx - a.tx) * k, y: a.ty + (b.ty - a.ty) * k, dir: toward(a, b), moving: true, state: 'WALK' };
}

export function alleySpotsOf(location: string): readonly AlleySpotDef[] {
  return ALLEY_SPOTS.filter((s) => s.location === location);
}
