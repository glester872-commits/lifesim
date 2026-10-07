// Sin Phaser: lo lleva StreetLife (la gente de la calle), lo cuenta el ciclo común de sucesos (systems/WorldEvents), lo mueve el
// gancho de consola de main.ts (lifesim.events, lifesim.crime) y lo recorre scripts/check-pickpocket.ts.
import { METRO_CONFIG } from '../config/metro.ts';
import type { ZoneDef, ZoneType } from '../data/zones.ts';
import type { TilePoint } from '../types/game.ts';
import { seededRng, type Rng } from './MetroDaily.ts';
import { eventId, type EventInfo, type Lifecycle } from './WorldEvents.ts';

/**
 * El carterista en la calle: el mismo suceso que el del metro (MetroSystem.startPickpocket: un papel del momento entre la gente,
 * acercarse, el tirón, que salga bien o mal, que la víctima lo note, la huida, y el mismo ciclo de vida de WorldEvents) y las
 * mismas cifras (METRO_CONFIG.pickpocket: probabilidades de éxito y de que se note, efectivo, tiempos). Lo que cambia es dónde:
 * en el metro hay un andén lleno y un vigilante; en la calle, gente de StreetLife, sin más vigilancia que los demás.
 *
 * Sólo sale donde hay gente de verdad: se cuenta quién hay alrededor de cada persona (`radius`) y hace falta un mínimo
 * (`minCrowd`) en una zona que lo permita (plazas, calles de tiendas, el metro, la noche, un evento). Una calle de barrio con
 * poca gente, nunca; la probabilidad crece con la densidad hasta `fullCrowd`. Y es raro: en la práctica unas cinco veces menos
 * que en el andén más lleno, con un descanso largo después de cada uno.
 *
 * Quién hace de carterista sale al azar entre quien anda por la calle: un papel del momento, nunca del aspecto, el
 * género, la ropa, el color de piel ni el origen. Quien responde: en la calle no hay vigilancia (la del metro no sale de su
 * estación); si algún día hay un puesto de calle, entra por `responders`.
 */

const P = METRO_CONFIG.pickpocket;

export const STREET_PICKPOCKET = {
  /** A cuántos tiles se cuenta la gente de alrededor, cuántos hacen falta como mínimo y a cuántos la probabilidad es la plena. */
  radius: 6,
  minCrowd: 6,
  fullCrowd: 14,
  /** Cuánto permite cada tipo de zona (0 o sin entrada: nunca). Sale de la zona (data/zones.ts), no de un nombre de barrio. */
  zoneWeight: { plaza: 1, commercial: 1, metro: 1.2, nightlife: 0.8, special_event_area: 0.6 } as Readonly<Partial<Record<ZoneType, number>>>,
  /**
   * Probabilidad por segundo con la densidad plena en una zona de peso 1: la del andén de hora punta. La media real sale unas cinco
   * veces menor que la del metro (mucha menos gente junta: un grupo así existe un cuarto del tiempo y rara vez a densidad plena).
   */
  perSecond: P.perSecond.RUSH_HOUR,
  /** Descanso tras cada uno (ms): tres veces el del metro. */
  cooldownMs: P.cooldownMs * 3,
  /** Hasta dónde llega el jugador para contar como víctima posible (tiles) y qué parte de los robos de un grupo va a por él. */
  playerRange: 5,
  playerShare: P.playerShare,
  /** Cuánto dura el tirón (ms) y cuánto se tarda como mucho en llegar a la víctima. */
  attemptMs: 2_000,
  approachTimeoutMs: P.approachTimeoutMs,
  maxDurationMs: P.maxDurationMs,
} as const;

/** Lo que el carterista necesita saber de quien anda por la calle (StreetLife.Walker lo cumple). */
export interface Person {
  id: number;
  kind: 'staff' | 'visitor' | 'street';
  x: number;
  y: number;
  path: readonly TilePoint[];
  vanish: boolean;
  staying: boolean;
  settled: boolean;
  moving: boolean;
  leader?: unknown;
  delay: number;
  line: string;
  incident?: 'thief' | 'victim';
}

/** Lo que StreetLife pone a su disposición: la gente, las zonas y cómo se mueve alguien sin romper su viaje. */
export interface PickpocketHost {
  location: string;
  people(): readonly Person[];
  zoneAt(tx: number, ty: number): ZoneDef | undefined;
  /** Camino hasta un tile junto a `at` (sin pisar la calzada ni obstáculos); false si no hay. */
  approach(thief: Person, at: TilePoint): boolean;
  /** Se va por el borde más cercano (andando, o corriendo si `run`) y desaparece. */
  leave(thief: Person, run: boolean): boolean;
  /** Se ve su grito: lo que dice quien lo ve. */
  shout?(who: Person, text: string): void;
  /** Quien acude a la calle, si hay (ahora, nadie). */
  responders?(): string[];
}

type Phase = 'APPROACH' | 'ATTEMPT' | 'FLEE' | 'LEAVE';
interface Incident {
  thief: Person;
  victim: Person | 'player';
  phase: Phase;
  since: number;
  phaseAt: number;
  noticed: boolean;
  success: boolean;
  /** Con cuánta gente alrededor se decidió, y cuándo se volvió a apuntar al que anda (ms). */
  crowd: number;
  aimAt: number;
  forced: boolean;
}

export interface Robbery {
  amount: number;
  noticed: boolean;
}

const dist = (a: { x: number; y: number }, b: TilePoint): number => Math.hypot(a.x - b.tx, a.y - b.ty);

/** Densidad 0–1 de un grupo de `n` personas: nada por debajo del mínimo, plena a `fullCrowd`. */
export const crowdFactor = (n: number): number => Math.max(0, Math.min(1, (n - STREET_PICKPOCKET.minCrowd + 1) / (STREET_PICKPOCKET.fullCrowd - STREET_PICKPOCKET.minCrowd + 1)));

export class StreetPickpocket {
  private readonly host: PickpocketHost;
  private rng: Rng;
  private incident: Incident | null = null;
  private elapsed = 0;
  private tick = 0;
  private cooldownUntil = 0;
  /** El jugador ha sido robado: la escena le quita el dinero y se lo dice. */
  onRobbed: ((r: Robbery) => void) | null = null;
  /** Cuántos ha habido: intentos, robos con éxito, vistos, al jugador, rechazados y sin llegar (consola y pruebas). */
  readonly stats = { started: 0, rejected: 0, stolen: 0, noticed: 0, player: 0, aborted: 0 };

  constructor(host: PickpocketHost, rng: Rng = Math.random) {
    this.host = host;
    this.rng = rng;
  }

  /** Cambiar la semilla (las pruebas: el mismo reloj, el mismo suceso). */
  seed(n: number): void {
    this.rng = seededRng(n);
  }

  /** Gente alrededor de un punto (quien anda por la calle, sin el personal ni quien vive en ella). */
  private around(tx: number, ty: number): Person[] {
    return this.host.people().filter((p) => p.kind === 'visitor' && !p.vanish && Math.hypot(p.x - tx, p.y - ty) <= STREET_PICKPOCKET.radius);
  }

  /** El peso de la zona de ese punto: fuera de toda zona (o en una calle de barrio o un parque), 0. */
  private zoneOk(tx: number, ty: number): number {
    const z = this.host.zoneAt(tx, ty);
    return z ? (STREET_PICKPOCKET.zoneWeight[z.type] ?? 0) : 0;
  }

  /** El mejor sitio para un robo ahora: el punto con más gente alrededor en una zona que lo permita (densidad × peso de zona). */
  private best(near?: TilePoint): { at: TilePoint; crowd: number; score: number } | null {
    let best: { at: TilePoint; crowd: number; score: number } | null = null;
    for (const p of this.host.people()) {
      if (p.kind !== 'visitor' || p.vanish || p.leader) continue;
      // Sólo los grupos junto al jugador, si se pide (el robo es a él).
      if (near && dist(p, near) > STREET_PICKPOCKET.playerRange + STREET_PICKPOCKET.radius / 2) continue;
      const w = this.zoneOk(Math.round(p.x), Math.round(p.y));
      if (w <= 0) continue;
      const n = this.around(p.x, p.y).length;
      const score = crowdFactor(n) * w;
      if (score > 0 && (!best || score > best.score)) best = { at: { tx: Math.round(p.x), ty: Math.round(p.y) }, crowd: n, score };
    }
    return best;
  }

  update(deltaMs: number, player: TilePoint): void {
    this.elapsed += deltaMs;
    const inc = this.incident;
    if (inc) {
      this.advance(inc, player);
      return;
    }
    if (this.elapsed < this.cooldownUntil) return;
    // Una tirada por segundo: nunca por frame.
    this.tick -= deltaMs;
    if (this.tick > 0) return;
    this.tick = 1_000;
    const spot = this.best();
    if (!spot) return;
    if (this.rng() < STREET_PICKPOCKET.perSecond * spot.score) this.start(spot, player, false);
  }

  /** Desarrollo: lo fuerza en el mejor sitio, pero con las mismas reglas de densidad y de zona. */
  force(player: TilePoint, nearPlayer = false): { ok: boolean; reason: string } {
    if (this.incident) return { ok: false, reason: 'ya hay un robo en curso' };
    const spot = this.best(nearPlayer ? player : undefined);
    if (!spot) {
      this.stats.rejected++;
      const n = Math.max(0, ...this.host.people().filter((p) => p.kind === 'visitor').map((p) => this.around(p.x, p.y).length));
      return { ok: false, reason: `rechazado: sin gente suficiente${nearPlayer ? ' junto a ti' : ''} en una zona que lo permita (máximo ${n} alrededor de alguien; hacen falta ${STREET_PICKPOCKET.minCrowd})` };
    }
    this.cooldownUntil = 0;
    return this.start(spot, player, true) ? { ok: true, reason: `en marcha con ${spot.crowd} personas alrededor` } : { ok: false, reason: 'nadie libre para robar o ser robado' };
  }

  /** Desarrollo: lo fuerza yendo a por el jugador (si hay gente suficiente cerca de él). */
  forceOnPlayer(player: TilePoint): { ok: boolean; reason: string } {
    const saved = this.rng;
    this.rng = () => 0; // la tirada de «a por el jugador» (playerShare) sale siempre
    const r = this.force(player, true);
    this.rng = saved;
    return r;
  }

  private start(spot: { at: TilePoint; crowd: number }, player: TilePoint, forced: boolean): boolean {
    const near = this.around(spot.at.tx, spot.at.ty).filter((p) => !p.leader && p.delay <= 0 && !p.incident);
    if (near.length < 2) return false;
    // A por el jugador, si está cerca del grupo y le toca; si no, a por alguien que esté quieto.
    const playerNear = dist({ x: spot.at.tx, y: spot.at.ty }, player) <= STREET_PICKPOCKET.playerRange + STREET_PICKPOCKET.radius / 2;
    const toPlayer = playerNear && this.rng() < STREET_PICKPOCKET.playerShare;
    // Quien está quieto (en una cola, un banco, un escaparate) y, si no hay nadie quieto, quien anda: el carterista le sale al paso.
    const still = near.filter((p) => !p.moving && p.path.length === 0);
    const walking = near.filter((p) => p.path.length > 0 && !p.incident);
    const pool0 = still.length > 0 ? still : walking;
    const victim: Person | 'player' | undefined = toPlayer ? 'player' : pool0[Math.floor(this.rng() * pool0.length)];
    if (!victim) return false;
    const pool = near.filter((p) => p !== victim);
    const thief = pool[Math.floor(this.rng() * pool.length)];
    if (!thief) return false;
    // A quien anda se le sale al paso: al siguiente tile de su camino, no al que deja atrás.
    const target = victim === 'player' ? player : victim.path.length > 0 ? victim.path[0] : { tx: Math.round(victim.x), ty: Math.round(victim.y) };
    if (!this.host.approach(thief, target)) return false;
    thief.incident = 'thief';
    if (victim !== 'player') victim.incident = 'victim';
    this.incident = { thief, victim, phase: 'APPROACH', since: this.elapsed, phaseAt: this.elapsed, noticed: false, success: false, crowd: spot.crowd, aimAt: this.elapsed, forced };
    this.stats.started++;
    return true;
  }

  private advance(inc: Incident, player: TilePoint): void {
    const alive = this.host.people().includes(inc.thief);
    // Pase lo que pase, en este tiempo el incidente está cerrado y recogido.
    if (this.elapsed - inc.since > STREET_PICKPOCKET.maxDurationMs || !alive) {
      this.finish(inc);
      return;
    }
    const target = inc.victim === 'player' ? player : { tx: inc.victim.x, ty: inc.victim.y };
    if (inc.phase === 'APPROACH') {
      if (inc.victim !== 'player' && !this.host.people().includes(inc.victim)) return this.abort(inc);
      if (dist(inc.thief, target) <= 1.5) {
        inc.phase = 'ATTEMPT';
        inc.phaseAt = this.elapsed;
        // Los dos se quedan quietos el tirón (la víctima NPC); el jugador sigue a lo suyo.
        inc.thief.delay = STREET_PICKPOCKET.attemptMs;
        if (inc.victim !== 'player') inc.victim.delay = STREET_PICKPOCKET.attemptMs;
      } else if (this.elapsed - inc.phaseAt > STREET_PICKPOCKET.approachTimeoutMs) {
        return this.abort(inc);
      } else if (inc.victim === 'player' && inc.thief.path.length === 0) {
        // El jugador se ha movido: vuelve a ir hacia él.
        if (!this.host.approach(inc.thief, player)) return this.abort(inc);
      } else if (inc.victim !== 'player' && inc.victim.path.length > 0 && this.elapsed - inc.aimAt > 1_500) {
        // Quien anda sigue andando: se le vuelve a salir al paso, al siguiente tile de su camino.
        inc.aimAt = this.elapsed;
        if (!this.host.approach(inc.thief, inc.victim.path[0])) return this.abort(inc);
      }
      return;
    }
    if (inc.phase === 'ATTEMPT') {
      if (this.elapsed - inc.phaseAt < STREET_PICKPOCKET.attemptMs) return;
      inc.success = this.rng() < P.success;
      // La víctima lo nota aun saliendo bien (P.victimNotices); si sale mal, se nota siempre.
      inc.noticed = !inc.success || this.rng() < P.victimNotices;
      if (inc.success) this.stats.stolen++;
      if (inc.noticed) this.stats.noticed++;
      if (inc.victim === 'player') {
        this.stats.player++;
        if (inc.success) this.onRobbed?.({ amount: this.cash(), noticed: inc.noticed });
      } else if (inc.noticed) {
        inc.victim.line = '¡Eh! ¡Me han robado!';
        this.host.shout?.(inc.victim, '¡Eh! ¡Me han robado!');
      }
      // Lo han visto: huye corriendo. Si no, se aleja como cualquiera.
      inc.phase = inc.noticed ? 'FLEE' : 'LEAVE';
      inc.phaseAt = this.elapsed;
      if (!this.host.leave(inc.thief, inc.noticed)) this.finish(inc);
    }
    // FLEE / LEAVE: hasta que sale del mapa (lo detecta `alive`).
  }

  /** Euros en efectivo que se lleva: entre el mínimo y el máximo de la configuración. */
  cash(): number {
    const [lo, hi] = P.cash;
    return Math.round((lo + this.rng() * (hi - lo)) * 100) / 100;
  }

  private abort(inc: Incident): void {
    this.stats.aborted++;
    this.finish(inc);
  }

  private finish(inc: Incident): void {
    this.release(inc);
    this.incident = null;
    // Uno en el que no llegó a nada descansa menos; uno de verdad, el descanso entero.
    this.cooldownUntil = this.elapsed + (inc.phase === 'APPROACH' ? STREET_PICKPOCKET.cooldownMs / 4 : STREET_PICKPOCKET.cooldownMs);
  }

  private release(inc: Incident): void {
    inc.thief.incident = undefined;
    inc.thief.delay = Math.min(inc.thief.delay, 0);
    if (inc.victim !== 'player') {
      inc.victim.incident = undefined;
      inc.victim.delay = Math.min(inc.victim.delay, 0);
    }
    // Si aún sigue en la calle sin camino (no llegó): se va como cualquiera, sin quedarse a medias.
    if (this.host.people().includes(inc.thief) && inc.thief.path.length === 0 && !inc.thief.vanish) this.host.leave(inc.thief, false);
  }

  /** Depuración: lo cierra ya y lo deja enfriar. */
  resolve(): string {
    if (!this.incident) return 'no hay robo en curso';
    this.finish(this.incident);
    return 'resuelto: el carterista se va y la víctima sigue a lo suyo';
  }

  cancel(): string {
    if (!this.incident) return 'no hay robo en curso';
    this.finish(this.incident);
    return 'cancelado';
  }

  /** Quita el descanso para poder forzar otro. */
  resetCooldown(): void {
    this.cooldownUntil = 0;
  }

  /** El robo en el ciclo común: acercándose (SPAWNING), el tirón (ACTIVE), huida si lo han visto (RESOLUTION), salida (CLEANUP), descanso (COOLDOWN). */
  lifecycle(): EventInfo {
    const c = this.incident;
    let lifecycle: Lifecycle = this.elapsed < this.cooldownUntil ? 'COOLDOWN' : 'ELIGIBLE';
    let phase = 'NONE';
    if (c) {
      [lifecycle, phase] = c.phase === 'APPROACH' ? ['SPAWNING', 'APPROACH'] : c.phase === 'ATTEMPT' ? ['ACTIVE', 'ATTEMPT'] : c.phase === 'FLEE' ? ['RESOLUTION', 'FLEE'] : ['CLEANUP', 'LEAVE'];
    }
    return {
      id: eventId('pickpocket', this.host.location),
      type: 'pickpocket',
      location: this.host.location,
      anchor: c ? { tx: Math.round(c.thief.x), ty: Math.round(c.thief.y) } : null,
      lifecycle,
      phase,
      age: c ? Math.round((this.elapsed - c.since) / 1000) : null,
      maxLeft: c ? Math.max(0, Math.round((STREET_PICKPOCKET.maxDurationMs - (this.elapsed - c.since)) / 1000)) : null,
      unit: 's',
      participants: c ? [{ id: `#${c.thief.id}`, role: 'carterista' }, { id: c.victim === 'player' ? 'jugador' : `#${c.victim.id}`, role: 'víctima' }] : [],
      responders: this.host.responders?.() ?? [],
      cooldownLeft: Math.max(0, Math.round((this.cooldownUntil - this.elapsed) / 1000)),
      forced: c?.forced ?? false,
    };
  }

  get active(): boolean {
    return this.incident !== null;
  }
}
