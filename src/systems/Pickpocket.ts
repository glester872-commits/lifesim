import type { MetroConfig } from '../config/metro';
import type { Vec2 } from '../types/game';
import type { CrowdLevel } from './MetroDaily';
import type { PassengerAI, StationLayout } from './PassengerAI';
import type { SecurityAI } from './SecurityAI';
import { eventId, type EventInfo, type Lifecycle } from './WorldEvents.ts';

/**
 * Carteristas en el andén del metro: raros, sólo con gente, y siempre con
 * final. Quien hace de carterista sale al azar entre quien espera de pie (un
 * papel del momento, nunca del aspecto) y la víctima es alguien cerca o el
 * jugador. Se acerca, lo intenta, sale bien o mal, alguien se da cuenta o no,
 * un vigilante (systems/SecurityAI) acude si lo ve o le avisan, y todo acaba
 * con el carterista fuera de la estación y cada cual en lo suyo.
 *
 *   APPROACH → ATTEMPT → (RESPONSE) → RESOLVED → recogido y descanso
 *
 * Al jugador sólo se le quita efectivo (la tarjeta y la bolsa no se tocan), una
 * cantidad acotada, y si el vigilante lo pilla se le devuelve.
 */
export type CrimePhase = 'APPROACH' | 'ATTEMPT' | 'RESPONSE' | 'RESOLVED';
export type CrimeOutcome = 'success' | 'fail';

/** Lo que el robo necesita del jugador (scenes/WorldScene). */
export interface PickpocketHost {
  /** Dónde tiene los pies el jugador (px) o null si no está en escena. */
  player(): Vec2 | null;
  /** Quita hasta `amount` euros en efectivo y dice cuántos ha quitado. */
  takeCash(amount: number): number;
  returnCash(amount: number): void;
  /** Le cuenta algo; false si ahora no se puede (un diálogo o un menú abiertos) y se vuelve a intentar. */
  tell(lines: readonly string[]): boolean;
}

/** Para probar (lifesim.crime.forcePickpocket): a quién, cómo sale y si lo ve un vigilante. */
export interface ForceOptions {
  victim?: 'player' | 'npc';
  outcome?: CrimeOutcome;
  seen?: boolean;
}

interface Incident {
  offender: PassengerAI;
  victim: PassengerAI | 'player';
  phase: CrimePhase;
  ms: number;
  outcome: CrimeOutcome | null;
  noticed: boolean;
  guardSaw: boolean;
  guard: SecurityAI | null;
  taken: number;
  forced: ForceOptions | null;
  resolution: string;
}

const pickOne = <T>(items: readonly T[]): T | undefined => items[Math.floor(Math.random() * items.length)];
const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
const feet = (who: PassengerAI | SecurityAI): Vec2 => ({ x: who.walker.x, y: who.walker.y });

/**
 * Lo que sobrevive a la escena, por estación: el enfriamiento y los últimos robos. Cada vez que se entra en
 * la estación se crea otro Pickpocket; sin esto, salir y volver a entrar se saltaba el enfriamiento.
 */
const SHARED = new Map<string, { cooldown: number; log: string[] }>();

export class Pickpocket {
  private incident: Incident | null = null;
  private readonly shared: { cooldown: number; log: string[] };
  private rollTimer = 1_000;
  /** Lo que se le contará al jugador más tarde (darse cuenta de que le falta dinero) o cuando se pueda. */
  private told: { lines: readonly string[]; delay: number }[] = [];
  private readonly cfg: MetroConfig;
  private readonly host: PickpocketHost;
  private readonly layout: StationLayout;
  private readonly mapWidth: number;
  private readonly note: (text: string) => void;
  private readonly station: string;

  /** Los últimos robos, para el estado de depuración. */
  get log(): string[] {
    return this.shared.log;
  }

  constructor(cfg: MetroConfig, host: PickpocketHost, layout: StationLayout, mapWidth: number, note: (text: string) => void, station = 'metro') {
    this.station = station;
    let shared = SHARED.get(station);
    if (!shared) SHARED.set(station, (shared = { cooldown: 0, log: [] }));
    this.shared = shared;
    this.cfg = cfg;
    this.host = host;
    this.layout = layout;
    this.mapWidth = mapWidth;
    this.note = note;
  }

  update(deltaMs: number, level: CrowdLevel, passengers: readonly PassengerAI[], guards: readonly SecurityAI[]): void {
    this.flushTold(deltaMs);
    if (this.incident) {
      this.step(deltaMs);
      return;
    }
    this.shared.cooldown = Math.max(0, this.shared.cooldown - deltaMs);
    this.rollTimer -= deltaMs;
    if (this.rollTimer > 0) return;
    this.rollTimer = 1_000;
    const pp = this.cfg.pickpocket;
    if (this.shared.cooldown > 0) return;
    // Sólo con el andén lleno: entre poca gente, ni se intenta.
    if (passengers.filter((p) => p.state === 'WAITING').length < pp.minWaiting) return;
    if (Math.random() < pp.perSecond[level]) this.start(passengers, guards, null);
  }

  /** Empieza uno ya (depuración). Devuelve qué ha pasado o por qué no. */
  force(passengers: readonly PassengerAI[], guards: readonly SecurityAI[], opts: ForceOptions = {}): string {
    if (this.incident) return `ya hay uno en curso (${this.incident.phase})`;
    this.shared.cooldown = 0;
    return this.start(passengers, guards, opts);
  }

  resetCooldown(): void {
    this.shared.cooldown = 0;
  }

  status(): Record<string, unknown> {
    const i = this.incident;
    return {
      phase: i?.phase ?? 'NONE',
      offender: i ? `${i.offender.walker.look.id} (${i.offender.state} · ${i.offender.activity})` : null,
      victim: i ? (i.victim === 'player' ? 'jugador' : `${i.victim.walker.look.id} (${i.victim.activity})`) : null,
      outcome: i?.outcome ?? null,
      noticed: i?.noticed ?? null,
      guardSaw: i?.guardSaw ?? null,
      guard: i?.guard ? `${i.guard.walker.look.id} ${i.guard.state}` : null,
      taken: i?.taken ?? 0,
      resolution: i?.resolution || null,
      cooldownS: Math.round(this.shared.cooldown / 1000),
      log: [...this.log],
    };
  }

  // ------------------------------------------------------------------ fases

  private start(passengers: readonly PassengerAI[], guards: readonly SecurityAI[], forced: ForceOptions | null): string {
    const pp = this.cfg.pickpocket;
    const offender = pickOne(passengers.filter((p) => p.freeToSteal));
    if (!offender) return 'nadie esperando de pie que pueda hacerlo';
    const player = this.host.player();
    const playerHere = player !== null && this.onPlatform(player);
    const wantPlayer = forced?.victim === 'player' || (!forced?.victim && playerHere && Math.random() < pp.playerShare);
    let victim: PassengerAI | 'player' | undefined;
    if (wantPlayer) {
      if (!playerHere) return 'el jugador no está en el andén';
      victim = 'player';
    } else {
      // Alguien cerca de quien lo va a hacer: el carterista no cruza el andén entero.
      const from = feet(offender);
      const near = passengers.filter((p) => p !== offender && p.canBeRobbed).sort((a, b) => dist(feet(a), from) - dist(feet(b), from));
      victim = pickOne(near.slice(0, 3));
      if (!victim) return 'nadie a quien robar';
      victim.freeze();
    }
    this.incident = { offender, victim, phase: 'APPROACH', ms: 0, outcome: null, noticed: false, guardSaw: false, guard: null, taken: 0, forced, resolution: '' };
    const target = victim === 'player' ? (player as Vec2) : feet(victim);
    offender.sneakTo(this.beside(target, feet(offender), 14), () => this.arrived(guards));
    this.note('alguien se acerca demasiado a alguien');
    return `en marcha: ${offender.walker.look.id} → ${victim === 'player' ? 'jugador' : victim.walker.look.id}`;
  }

  private arrived(guards: readonly SecurityAI[]): void {
    const i = this.incident;
    if (!i || i.phase !== 'APPROACH') return;
    if (i.victim === 'player') {
      // El jugador se ha ido: lo deja y vuelve a esperar como uno más.
      const player = this.host.player();
      if (!player || dist(player, feet(i.offender)) > 26) {
        this.abort('el jugador se ha movido');
        return;
      }
    }
    i.phase = 'ATTEMPT';
    i.offender.pause(900, 'mete la mano', () => this.attempt(guards));
  }

  private attempt(guards: readonly SecurityAI[]): void {
    const i = this.incident;
    if (!i || i.phase !== 'ATTEMPT') return;
    const pp = this.cfg.pickpocket;
    const at = feet(i.offender);
    i.outcome = i.forced?.outcome ?? (Math.random() < pp.success ? 'success' : 'fail');
    // Si falla, la víctima se da cuenta; si sale bien, a veces también.
    i.noticed = i.outcome === 'fail' || Math.random() < pp.victimNotices;
    const guard = guards.filter((g) => g.available).sort((a, b) => dist(feet(a), at) - dist(feet(b), at))[0] ?? null;
    i.guardSaw = guard !== null && (i.forced?.seen ?? (dist(feet(guard), at) <= pp.guardRange && Math.random() < pp.guardNotices));

    if (i.victim === 'player') this.playerReacts(i);
    else if (i.noticed) i.victim.noticeFrom(at.x, 2_600);
    else i.victim.release();

    const detected = i.noticed || i.guardSaw;
    if (detected && guard) {
      // El vigilante acude; el carterista, que se sabe visto, disimula un momento y, si tarda, se va.
      i.phase = 'RESPONSE';
      i.guard = guard;
      const { path, back } = this.guardRoute(guard, this.beside(at, feet(guard), 12));
      // El aviso es de ESTE robo: si al llegar ya es otro (este se cerró por tiempo), no resuelve aquel.
      guard.respond(path, back, () => this.caught(i));
      i.offender.pause(9_000, 'disimula', () => {
        if (this.incident === i && i.phase === 'RESPONSE') {
          i.offender.escape(true, 'se escapa');
          this.resolve('se escapa antes de que llegue el vigilante');
        }
      });
      this.note(i.guardSaw ? 'seguridad ve un robo y acude' : 'alguien grita: seguridad acude');
      return;
    }
    i.offender.escape(detected, detected ? 'se escapa' : 'se va como si nada');
    this.resolve(detected ? 'se escapa: no hay vigilante cerca' : i.outcome === 'success' ? 'nadie se da cuenta' : 'falla y se va');
  }

  /** Lo que nota y pierde el jugador. */
  private playerReacts(i: Incident): void {
    const pp = this.cfg.pickpocket;
    if (i.outcome === 'success') {
      const [lo, hi] = pp.cash;
      i.taken = this.host.takeCash(lo + Math.floor(Math.random() * (hi - lo + 1)));
    }
    if (i.outcome === 'fail') this.say(['Notas una mano en el bolsillo y te apartas. Quien era se aleja deprisa.', 'No te falta nada.']);
    else if (i.noticed) this.say(['Un tirón en el bolsillo. Al girarte, alguien se aleja deprisa.', i.taken > 0 ? `Te faltan €${i.taken}.` : 'No llevabas efectivo: no se ha llevado nada.']);
    else if (i.taken > 0) this.told.push({ lines: ['Echas mano al bolsillo y algo no cuadra.', `Te faltan €${i.taken} en efectivo. Ni lo has notado.`], delay: 25_000 });
  }

  /** El vigilante llega a donde estaba el carterista. */
  private caught(which: Incident): void {
    const i = this.incident;
    if (!i || i !== which || i.phase !== 'RESPONSE') return;
    i.offender.escape(false, 'sale acompañado');
    if (i.victim === 'player' && i.taken > 0) {
      this.host.returnCash(i.taken);
      // Si aún no se había dado cuenta, ya no hace falta contárselo así.
      this.told = [];
      this.say(['El vigilante habla un momento con alguien y vuelve hacia ti.', `«Esto es tuyo.» Te devuelve los €${i.taken}.`]);
      i.taken = 0;
    }
    this.resolve('el vigilante lo acompaña a la salida');
  }

  private resolve(text: string): void {
    const i = this.incident;
    if (!i) return;
    i.phase = 'RESOLVED';
    i.resolution = text;
    const who = i.victim === 'player' ? 'jugador' : i.victim.walker.look.id;
    this.log.unshift(`${i.outcome === 'success' ? 'robo' : 'intento'} a ${who}: ${text}`);
    this.log.length = Math.min(this.log.length, 5);
    this.note(`carterista: ${text}`);
  }

  private abort(why: string): void {
    const i = this.incident;
    if (!i) return;
    i.offender.release();
    if (i.victim !== 'player') i.victim.release();
    this.log.unshift(`intento abandonado: ${why}`);
    this.log.length = Math.min(this.log.length, 5);
    this.incident = null;
    this.shared.cooldown = 30_000;
  }

  // ------------------------------------------- ciclo común (systems/WorldEvents)

  /**
   * APPROACH → SPAWNING, ATTEMPT → ACTIVE, RESPONSE → RESOLUTION (el vigilante
   * acude), RESOLVED → CLEANUP (el carterista sale, el vigilante vuelve) y,
   * cerrado, COOLDOWN hasta que puede volver a pasar en esta estación.
   */
  lifecycle(): EventInfo {
    const i = this.incident;
    const map: Record<CrimePhase, Lifecycle> = { APPROACH: 'SPAWNING', ATTEMPT: 'ACTIVE', RESPONSE: 'RESOLUTION', RESOLVED: 'CLEANUP' };
    const cd = this.shared.cooldown;
    const who = (p: PassengerAI | 'player'): string => (p === 'player' ? 'jugador' : p.walker.look.id);
    return {
      id: eventId('pickpocket', this.station),
      type: 'pickpocket',
      location: this.station,
      anchor: null,
      lifecycle: i ? map[i.phase] : cd > 0 ? 'COOLDOWN' : 'ELIGIBLE',
      phase: i?.phase ?? 'NONE',
      age: i ? Math.round(i.ms / 1000) : null,
      maxLeft: i ? Math.max(0, Math.round((this.cfg.pickpocket.maxDurationMs - i.ms) / 1000)) : null,
      unit: 's',
      participants: i ? [{ id: who(i.offender), role: 'offender' }, { id: who(i.victim), role: 'victim' }] : [],
      responders: i?.guard ? [`${i.guard.walker.look.id} (${i.guard.state})`] : [],
      cooldownLeft: Math.round(cd / 1000),
      forced: !!i?.forced,
    };
  }

  /** Depuración: lo resuelve ya por el camino normal (el carterista se va; si acude un vigilante, lo acompaña). */
  devResolve(): string {
    const i = this.incident;
    if (!i) return 'no hay robo en curso';
    if (i.phase === 'RESOLVED') return 'ya está resuelto: recogiendo';
    if (i.phase === 'RESPONSE') {
      this.caught(i);
      return 'el vigilante lo acompaña a la salida';
    }
    i.offender.escape(false, 'se va');
    if (i.victim !== 'player') i.victim.release();
    this.resolve('resuelto a mano');
    return 'resuelto: el carterista se va';
  }

  /** Depuración: lo cancela (todos vuelven a lo suyo y el vigilante a su puesto), con el enfriamiento de un intento. */
  devCancel(): string {
    const i = this.incident;
    if (!i) return 'no hay robo en curso';
    if (i.guard?.state === 'RESPOND') i.guard.recover(2, false);
    this.abort('cancelado a mano');
    return 'cancelado';
  }

  /**
   * Fin de escena (MetroSystem.shutdown): el robo en curso se cancela (sus
   * pasajeros y vigilantes desaparecen con la escena) y el enfriamiento, que es
   * de la estación, sigue contando a la vuelta.
   */
  shutdown(): void {
    const i = this.incident;
    if (!i) return;
    this.log.unshift(`cancelado al salir de la estación (${i.phase})`);
    this.log.length = Math.min(this.log.length, 5);
    this.incident = null;
    this.shared.cooldown = Math.max(this.shared.cooldown, this.cfg.pickpocket.cooldownMs);
  }

  /** ¿Hay un robo en curso? */
  get active(): boolean {
    return this.incident !== null;
  }

  /** Cuenta el tiempo y recoge: el incidente se cierra cuando el carterista ha salido y el vigilante está libre. */
  private step(deltaMs: number): void {
    const i = this.incident;
    if (!i) return;
    const pp = this.cfg.pickpocket;
    i.ms += deltaMs;
    if (i.phase === 'APPROACH' && i.ms > pp.approachTimeoutMs) {
      this.abort('no llega a la víctima');
      return;
    }
    const gone = i.offender.state === 'OFFSTAGE';
    const guardFree = !i.guard || i.guard.available;
    const late = i.ms > pp.maxDurationMs;
    if ((i.phase === 'RESOLVED' && gone && guardFree) || late) {
      // Si algo se quedó a medias (no debería), nadie se queda colgado: el carterista se va y la víctima vuelve a lo suyo.
      if (late && !gone && i.offender.state !== 'LEAVING_STATION') i.offender.escape(false, 'se va');
      if (late && i.victim !== 'player' && i.victim.activity === '¡eh!') i.victim.release();
      this.incident = null;
      this.shared.cooldown = pp.cooldownMs;
    }
  }

  // ------------------------------------------------------------- utilidades

  private say(lines: readonly string[]): void {
    this.told.unshift({ lines, delay: 0 });
  }

  private flushTold(deltaMs: number): void {
    for (const t of this.told) t.delay -= deltaMs;
    const ready = this.told.findIndex((t) => t.delay <= 0);
    if (ready < 0) return;
    if (this.host.tell(this.told[ready].lines)) this.told.splice(ready, 1);
    else this.told[ready].delay = 1_000;
  }

  /** Del andén: entre el borde (la vía queda por encima) y los torniquetes. */
  private onPlatform(p: Vec2): boolean {
    const gateY = this.layout.gates[0]?.gate.y ?? Infinity;
    return p.y >= this.layout.walkY - 8 && p.y < gateY - 4;
  }

  /** Un sitio al lado de `target`, por el lado de `from`, siempre en el andén (nunca hacia la vía). */
  private beside(target: Vec2, from: Vec2, gap: number): Vec2 {
    const side = from.x < target.x ? -gap : gap;
    return { x: Math.max(24, Math.min(this.mapWidth - 24, target.x + side)), y: Math.max(target.y, this.layout.walkY) };
  }

  /**
   * Por dónde acude un vigilante: del andén, recto (los dos puntos están en el
   * andén); del vestíbulo, por el torniquete más cercano. La vuelta, igual al
   * revés. Ningún punto queda por encima de la fila de paso: la vía no se pisa.
   */
  private guardRoute(guard: SecurityAI, target: Vec2): { path: Vec2[]; back: Vec2[] } {
    if (guard.onPlatform) return { path: [target], back: [] };
    const from = feet(guard);
    const g = this.layout.gates.reduce((a, b) => (Math.abs(a.gate.x - from.x) <= Math.abs(b.gate.x - from.x) ? a : b));
    const up = { x: g.gate.x, y: this.layout.walkY + 16 };
    return { path: [g.lobby, g.gate, up, target], back: [up, g.gate, g.lobby] };
  }
}
