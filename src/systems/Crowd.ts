// Sin Phaser: world/CrowdView.ts lo pinta y scripts/simulate-population.ts lo
// simula durante horas con exactamente esta lógica.
import { GAME_MINUTES_PER_REAL_SECOND } from '../config/constants.ts';
import { LEVELS, POPULATION, type Level } from '../config/population.ts';
import { POPULATION_PROFILES, type PlanStep, type PopulationProfile, type StaffRole, type VisitorRole } from '../data/population.ts';
import { PASSENGER_LOOKS } from '../data/npcs.ts';
import type { Facing, LocationDef, TilePoint } from '../types/game.ts';
import { between, hashSeed, seededRng, type Rng } from './MetroDaily.ts';
import { weekIndex } from './Calendar.ts';
import { outdoorAppeal, weatherAt } from './Weather.ts';
import { isOpen, openingDay, type PlaceInfo } from './Places.ts';
import { tilePath } from './Navigation.ts';
import { besideTile, identity, nextCustomer } from './Service.ts';
import { getStation, type Occupancy, type StationDef } from '../data/stations.ts';
import { TableService } from './TableService.ts';
import { SeatRegistry } from './SeatRegistry.ts';
import { IDENTITIES } from './People.ts';
import { isWalkable } from './LocationSystem.ts';
import { aheadBlocked, nearestReachable, offCamera, StuckWatch, tileKey, type RecoveryLevel } from './Recovery.ts';

/** Una reserva a la que no se llega en este tiempo (ms de reloj de la sala) se da por perdida. */
const RESERVE_TTL_MS = 90_000;

export interface Clock {
  day: number;
  hour: number;
  minute: number;
}

const MS_PER_GAME_MINUTE = 1000 / GAME_MINUTES_PER_REAL_SECOND;

export function profileFor(placeId: string): PopulationProfile | undefined {
  return POPULATION_PROFILES.find((p) => p.place === placeId);
}

/** Nivel de afluencia a esa hora de ese día, o null si está cerrado. */
export function levelAt(place: PlaceInfo, profile: PopulationProfile, clock: Clock): Level | null {
  if (!isOpen(place, clock.day, clock.hour, clock.minute)) return null;
  const t = clock.hour + clock.minute / 60;
  const band = profile.bands.find(([from, to]) => t >= from && t < to);
  const base = LEVELS.indexOf(band ? band[2] : 'VERY_LOW');
  // La madrugada del sábado cuenta como noche del viernes.
  const shifted = base + profile.weekday[weekIndex(openingDay(place, clock.day, clock.hour, clock.minute))];
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, shifted))];
}

const onShift = (role: StaffRole, level: Level | null): boolean =>
  level !== null && (!role.minLevel || LEVELS.indexOf(level) >= LEVELS.indexOf(role.minLevel));

/**
 * Visitantes que debería haber. Dentro del rango del nivel, el número sale de
 * una semilla por lugar, día y media hora: el mismo momento del mismo día
 * siempre da lo mismo, y dos días distintos casi nunca.
 */
export function targetAt(place: PlaceInfo, profile: PopulationProfile, clock: Clock): number {
  const level = levelAt(place, profile, clock);
  if (level === null) return 0;
  const [lo, hi] = POPULATION.levels[level];
  const slot = Math.floor((clock.hour * 60 + clock.minute) / 30);
  const rng = seededRng(hashSeed('crowd', place.id, clock.day, slot));
  const staff = profile.staff.filter((r) => onShift(r, level)).length;
  // Con mal tiempo, los sitios a cubierto (bares, tiendas, la discoteca) se llenan un poco más.
  const sheltered = place.tags.some((t) => t === 'food' || t === 'nightlife' || t === 'shop' || t === 'social');
  const shelter = sheltered ? 1 + Math.max(0, 1 - outdoorAppeal(weatherAt(clock.day, clock.hour + clock.minute / 60))) * 0.35 : 1;
  const wanted = Math.round((lo + Math.floor(rng() * (hi - lo + 1))) * shelter);
  return Math.max(0, Math.min(wanted, profile.maxVisitors, place.capacity - staff));
}

// ---------------------------------------------------------------- agentes

export interface Agent {
  id: number;
  /** `street`: quien vive en la calle (systems/StreetSurvival): no hace viajes ni cuenta para la gente que pasa. */
  kind: 'staff' | 'visitor' | 'street';
  role: string;
  /** Personaje con nombre que ocupa el puesto (sólo personal). */
  npc?: string;
  label: string;
  line: string;
  /** Índice en PASSENGER_LOOKS para los anónimos. */
  look: number;
  /** Posición en tiles (centro del tile = número entero). */
  x: number;
  y: number;
  dir: Facing;
  moving: boolean;
  state: string;
  speed: number;
  path: TilePoint[];
  /** Punto reservado: nadie más se para ahí. */
  point?: string;
  /** Ms que le quedan en la actividad o esperando. */
  timer: number;
  plan: PlanStep[];
  /** Terminar lo que hace e irse. */
  leaveSoon: boolean;
  leaving: boolean;
  staffRole?: StaffRole;
  /** Uniforme del personal anónimo (id en UNIFORM_LOOKS), sacado de su oficio. */
  uniform?: string;
  /** Viene con alguien: le sigue a su mesa y se va con él. */
  leader?: Agent;
  /** Cómo se le ve moverse: corriendo (un corredor del parque). Sólo lo usa quien lo pinta. */
  gait?: 'jog';
  /** Ms que lleva andando sin pararse: el arranque va de menos a más (stride). */
  walkMs?: number;
  /** Punto del que lleva el grupo al que ya ha respondido. */
  following?: string;
  /** Prefijos del paso en curso: el grupo busca sitio del mismo tipo, al lado. */
  stepPoints?: readonly string[];
  /** Acompañantes que todavía no han cruzado la puerta. */
  pendingParty?: number;
  /** Al llegar, se gira hacia aquí: el camarero, hacia el cliente. */
  face?: TilePoint;
  /** Hablando con el jugador: no da un paso ni pasa a lo siguiente hasta despedirse. */
  talking?: boolean;
  /** Lo que lleva en las manos quien sirve: la bandeja con lo pedido o la vajilla sucia (systems/TableService). */
  carry?: 'tray' | 'dishes';
  /** Lo que lleva consigo quien vive en la calle (mantas, bolsas, carro...): world/CrowdView lo pinta a su lado. */
  belongings?: readonly import('../data/streetSurvival.ts').Belonging[];
  /** Lleva la ropa de entrenar (se la ha puesto en el vestuario). Su aspecto de calle no se toca: es `look`. */
  sport?: boolean;
  /** Se cambia en el paso que hace ahora (PlanStep.outfit): la ropa cambia a mitad, o al acabar el paso, siempre en su sitio. */
  pendingOutfit?: 'gym' | 'street';
  /** Ms que lleva en el sitio antes de que se note el cambio de ropa. */
  changeLeft?: number;
  /** El punto de cambio donde dejó su ropa: vuelve a él si sigue libre. */
  locker?: string;
  /** Ya va de camino a recuperar la ropa de calle antes de irse (PopulationProfile.changeBack). */
  rescued?: boolean;
  /** Veces seguidas que no encontró sitio para un paso que no se puede saltar (un cambio de ropa). */
  waits?: number;
  /** Rodeo de recuperación (systems/Recovery, peldaño 2): al acabarlo, sigue hacia aquí. */
  resume?: TilePoint;
}

export interface CrowdStats {
  open: boolean;
  level: Level | null;
  target: number;
  staff: number;
  visitors: number;
  entering: number;
  leaving: number;
}

/**
 * La gente de un interior mientras el jugador está dentro. Fuera no existe:
 * al volver a entrar se reconstruye desde la semilla del momento, así que no
 * hay nada que simular ni guardar para los locales que no se ven.
 */
export class Crowd {
  readonly agents: Agent[] = [];
  private readonly loc: LocationDef;
  private readonly place: PlaceInfo;
  private readonly profile: PopulationProfile;
  private rng: Rng;
  private readonly baseRng: Rng;
  private readonly door: TilePoint;
  /** Quién tiene cada asiento (reservado de camino u ocupado): uno, nunca dos. */
  readonly seats = new SeatRegistry();
  private nextId = 1;
  private tick = 0;
  private stats: CrowdStats = { open: false, level: null, target: 0, staff: 0, visitors: 0, entering: 0, leaving: 0 };
  /** Rutas que no se encontraron: debe quedarse en cero (lo comprueba la simulación). */
  pathFailures = 0;
  /** Vigía de atascos (systems/Recovery): quien tiene camino y no avanza sube peldaños hasta salir. */
  readonly watch = new StuckWatch();
  /** Obstáculos temporales (un tile cortado): nadie entra en ellos y las rutas los rodean. */
  readonly blocked = new Set<string>();
  private player: TilePoint = { tx: -999, ty: -999 };

  constructor(loc: LocationDef, place: PlaceInfo, profile: PopulationProfile, rng: Rng = Math.random) {
    this.loc = loc;
    this.place = place;
    this.profile = profile;
    this.rng = rng;
    this.baseRng = rng;
    const exit = loc.portals.find((p) => p.to.location !== loc.id);
    if (!exit) throw new Error(`[${loc.id}] sin puerta de salida para la gente`);
    this.door = { tx: exit.tx, ty: exit.ty };
    const prefixes = [...profile.visitors.flatMap((v) => v.plan.map((s) => s.points)), ...profile.staff.flatMap((s) => [s.points, s.serves ?? []])];
    for (const points of prefixes) {
      // `{s}`: el vestuario de cada cual (M o F); los dos tienen que existir.
      const both = points.flatMap((p) => (p.includes('{s}') ? [p.replace('{s}', 'M'), p.replace('{s}', 'F')] : [p]));
      if (points.length > 0 && both.some((p) => this.pointsMatching([p]).length === 0)) throw new Error(`[${loc.id}] ningún punto para ${points.join(', ')}`);
    }
    // Servicio de mesa (systems/TableService.ts): si el local lo tiene, sus camareros y sus mesas van por él.
    this.service = profile.tableService && loc.tables
      ? new TableService(loc, profile.tableService, {
          agents: this.agents,
          walk: (a, to, face) => {
            a.path = this.route(a, to);
            a.face = face;
            // Ya estaba ahí: se gira sin dar un paso.
            if (a.path.length === 0 && face) a.dir = facingTo({ tx: Math.round(a.x), ty: Math.round(a.y) }, face);
          },
          pointAt: (id) => this.pointAt(id),
        }, () => this.rng())
      : null;
  }

  /** El servicio de mesa del local, si lo tiene: mesas, cocina y camareros. */
  readonly service: TableService | null;

  /** Si ese asiento se puede coger: fuera de una mesa con servicio, siempre; en una, si es libre o de su grupo. */
  private seatOk(id: string, a?: Agent): boolean {
    const table = this.service?.tableOf(id);
    if (!table) return true;
    return a ? this.service!.canSit(id, a) : table.party === null && table.state === 'AVAILABLE';
  }

  get summary(): CrowdStats {
    return this.stats;
  }

  /**
   * Puntos donde está un personaje con nombre: nadie más los coge, y quien ya
   * estaba ahí sentado se levanta y sigue con lo suyo.
   */
  claim(points: ReadonlySet<string>): void {
    this.claimed = points;
    for (const a of this.agents) {
      if (a.point && points.has(a.point) && !a.leaving) {
        // Quien iba de camino hacia ahí también cancela: se para donde esté y busca otro sitio.
        this.release(a);
        a.path = [];
        a.moving = false;
        a.timer = 0;
      }
    }
  }
  private claimed: ReadonlySet<string> = new Set();
  /** Ms desde que el jugador entró: el reloj del personal que sirve mesas. */
  private elapsed = 0;
  /** Cliente → ms en que alguien le atendió por última vez. */
  private readonly served = new Map<number, number>();

  // ------------------------------------------------------------- llegada

  /**
   * Al entrar el jugador: la gente ya está, a mitad de lo suyo. Todo sale de
   * la semilla del momento, así que entrar y salir en el mismo minuto enseña
   * a las mismas personas en los mismos sitios.
   */
  populate(clock: Clock, player: TilePoint): void {
    const slot = Math.floor((clock.hour * 60 + clock.minute) / 30);
    const seed = seededRng(hashSeed('populate', this.place.id, clock.day, slot));
    this.rng = seed;
    const level = levelAt(this.place, this.profile, clock);
    const far = (id: string): boolean => this.distance(this.pointAt(id), player) >= POPULATION.spawnClearance && this.seatOk(id);

    for (const role of this.profile.staff) {
      if (!onShift(role, level)) continue;
      const point = this.freePoint(role.points, far);
      if (point) this.addStaff(role, point);
    }
    const target = targetAt(this.place, this.profile, clock);
    let placed = 0;
    for (let tries = 0; placed < target && tries < target * 2; tries++) {
      const role = this.pickRole(clock);
      if (!role) break;
      const plan = this.buildPlan(role);
      // Entra a mitad del plan: unos acaban de llegar, otros están a punto de irse.
      // Si en ese paso no queda sitio (la recepción es una), prueba en los demás.
      const start = Math.floor(this.rng() * plan.length);
      // La cara primero: de su identidad sale el vestuario que le toca.
      const look = this.pickLook();
      let skip = -1;
      let point: string | undefined;
      for (let k = 0; k < plan.length && !point; k++) {
        skip = (start + k) % plan.length;
        point = this.freePoint(this.expand(plan[skip].points, look), far);
      }
      if (!point) continue;
      const step = plan[skip];
      const agent = this.newAgent('visitor', role.role, role.label, role.line, this.pointAt(point), look);
      agent.plan = plan.slice(skip + 1);
      agent.stepPoints = step.points;
      this.occupy(agent, point, step.state);
      this.dressFor(agent, plan, skip);
      agent.timer = this.duration(step, point) * (0.2 + this.rng() * 0.8);
      this.service?.adopt(point, agent);
      placed++;
      // Su grupo, ya sentado a su lado (en una mesa con servicio, en la misma mesa).
      for (let k = 1; k < this.partySize(role, target - placed + 1); k++) {
        const mateLook = this.pickLook();
        const near = this.service?.tableOf(point)
          ? this.service.mateSeat(agent, (s) => this.seats.has(s) || this.claimed.has(s))
          : this.freePointNear(this.expand(step.points, mateLook), this.pointAt(point), far);
        if (!near) break;
        const mate = this.newAgent('visitor', role.role, role.label, role.line, this.pointAt(near), mateLook);
        mate.leader = agent;
        mate.following = point;
        mate.sport = agent.sport;
        mate.pendingOutfit = agent.pendingOutfit;
        this.occupy(mate, near, step.state);
        this.service?.adopt(near, mate);
        placed++;
      }
    }
    this.rng = this.baseRng;
    this.refresh(clock);
  }

  // --------------------------------------------------------------- tiempo

  update(deltaMs: number, clock: Clock, player: TilePoint): void {
    this.elapsed += deltaMs;
    this.seats.tick(deltaMs);
    this.tick -= deltaMs;
    if (this.tick <= 0) {
      this.tick = between(this.rng, ...POPULATION.tickEvery);
      this.sweepSeats();
      this.reconcile(clock, player);
    }
    this.service?.update(deltaMs, clock.hour + clock.minute / 60);
    this.player = player;
    for (const agent of this.agents) this.advance(agent, deltaMs);
    // Atascos: sólo cuenta quien tiene camino y no está hablando (sentado, en cola o sirviendo no tiene camino).
    for (const a of [...this.agents]) {
      const level = this.watch.check(a.id, a.x, a.y, a.path.length > 0 && !a.talking, deltaMs);
      if (level) this.recover(a, level);
    }
    for (let i = this.agents.length - 1; i >= 0; i--) {
      const a = this.agents[i];
      // Sale por la puerta. Si no encontró camino (cuenta en pathFailures), se va igual: nadie se queda atascado.
      if (a.leaving && a.path.length === 0 && !a.talking) this.remove(i);
    }
  }

  /** Acerca la ocupación al objetivo poco a poco: nadie aparece ni desaparece de golpe. */
  private reconcile(clock: Clock, player: TilePoint): void {
    const level = levelAt(this.place, this.profile, clock);
    const doorClear = this.distance(this.door, player) >= POPULATION.doorClearance && !this.agents.some((a) => !a.leaving && this.atDoor(a));

    // Personal: el que toca entra por la puerta; el que ya no toca, se va.
    for (const role of this.profile.staff) {
      const here = this.agents.filter((a) => a.staffRole === role && !a.leaving);
      if (onShift(role, level) && here.length === 0 && doorClear) this.enterStaff(role);
      if (!onShift(role, level)) for (const a of here) a.leaveSoon = true;
    }

    this.refresh(clock);
    // Cerrado: nadie acaba la canción. Primero salen los clientes; el personal, cuando ya no queda nadie.
    if (!this.stats.open) {
      const visitors = this.agents.some((a) => a.kind === 'visitor');
      for (const a of this.agents) {
        if (a.leaving || (a.kind === 'staff' && visitors)) continue;
        a.leaveSoon = true;
        a.timer = Math.min(a.timer, between(this.rng, ...POPULATION.reaction));
      }
    }
    const active = this.agents.filter((a) => a.kind === 'visitor' && !a.leaving && !a.leaveSoon);
    const diff = this.stats.target - active.length;
    const changes = Math.min(Math.abs(diff), Math.abs(diff) > 4 ? POPULATION.maxChangesPerTick : 1);
    // Por la puerta entra una persona cada vez: primero el resto de un grupo que ya está dentro.
    const party = this.agents.find((a) => (a.pendingParty ?? 0) > 0 && !a.leaving && !a.leaveSoon);
    if (party && doorClear && this.agents.length < this.place.capacity) {
      party.pendingParty!--;
      const mate = this.newAgent('visitor', party.role, party.label, party.line, this.door);
      mate.leader = party;
    } else if (diff > 0 && doorClear && this.agents.length < this.place.capacity) {
      const role = this.pickRole(clock);
      if (role) this.enterVisitor(role, diff);
    } else if (diff < 0) {
      // Se van primero los que menos plan les queda; un grupo se va entero con quien lo lleva.
      // Quien está a mitad de comer en una mesa con servicio acaba y paga antes.
      const leaders = active.filter((a) => !a.leader && !this.service?.holds(a)).sort((a, b) => a.plan.length - b.plan.length);
      for (const a of leaders.slice(0, changes)) a.leaveSoon = true;
    }
    this.refresh(clock);
  }

  private refresh(clock: Clock): void {
    const level = levelAt(this.place, this.profile, clock);
    const visitors = this.agents.filter((a) => a.kind === 'visitor');
    this.stats = {
      open: level !== null,
      level,
      target: targetAt(this.place, this.profile, clock),
      staff: this.agents.filter((a) => a.kind === 'staff').length,
      visitors: visitors.length,
      entering: visitors.filter((a) => a.state === 'ENTER').length,
      leaving: this.agents.filter((a) => a.leaving).length,
    };
  }

  private advance(a: Agent, deltaMs: number): void {
    if (a.talking) {
      a.moving = false;
      return;
    }
    if (a.path.length > 0) {
      this.walk(a, deltaMs);
      return;
    }
    // Acabó el rodeo de recuperación: sigue hacia donde iba.
    if (a.resume) {
      const to = a.resume;
      a.resume = undefined;
      a.path = this.route(a, to);
      if (a.path.length > 0) return;
    }
    a.moving = false;
    // Llegó a su asiento: de reservado a ocupado.
    if (a.point) this.seats.occupy(a.point, a.id);
    // Cambiándose de ropa: pasado un momento en su taquilla, ya lleva la otra.
    if (a.pendingOutfit) {
      a.changeLeft = (a.changeLeft ?? 900) - deltaMs;
      if (a.changeLeft <= 0) this.applyOutfit(a);
    }
    if (a.leaving) return;
    // Camarero de un servicio de mesa: decide él qué hace (systems/TableService).
    if (this.service?.drives(a)) {
      this.service.stepWaiter(a, deltaMs);
      return;
    }
    if (a.leader && !a.leaveSoon) {
      this.followParty(a);
      return;
    }
    // Comiendo en una mesa con servicio: no se va por su reloj, sino al pagar.
    if (this.service?.holds(a)) return;
    a.timer -= deltaMs;
    if (a.timer > 0) return;
    if (a.kind === 'staff') this.nextStaffMove(a);
    else this.nextVisitorStep(a);
  }

  /** Quien viene en grupo no decide: cuando quien lo lleva cambia de sitio, se sienta a su lado; cuando se va, se va. */
  private followParty(a: Agent): void {
    const lead = a.leader!;
    if (lead.leaving || !this.agents.includes(lead)) {
      a.leaveSoon = true;
      a.timer = between(this.rng, ...POPULATION.reaction);
      return;
    }
    if (!lead.point || lead.point === a.following || !lead.stepPoints) return;
    a.following = lead.point;
    // En una mesa con servicio, a otra silla de la misma mesa; si no, al sitio libre más cercano.
    // Si se estaba cambiando de ropa, acaba el cambio antes de seguirle: nadie se pone el chándal a medio pasillo.
    this.applyOutfit(a);
    const near = this.service?.tableOf(lead.point)
      ? this.service.mateSeat(lead, (s) => s === a.point || this.seats.has(s) || this.claimed.has(s))
      : this.freePointNear(this.expand(lead.stepPoints, a.look), this.pointAt(lead.point), (id) => id !== a.point);
    if (!near) return;
    if (!this.goTo(a, near, lead.state)) {
      a.following = undefined;
      return;
    }
    this.service?.reserve(near, a);
    a.pendingOutfit = lead.pendingOutfit;
    a.changeLeft = undefined;
  }

  private walk(a: Agent, deltaMs: number): void {
    const target = a.path[0];
    // Un obstáculo temporal en el siguiente tile: espera (y el vigía de atascos decide).
    if (aheadBlocked(this.blocked, { tx: a.x, ty: a.y }, target)) {
      a.moving = false;
      return;
    }
    const dx = target.tx - a.x;
    const dy = target.ty - a.y;
    const dist = Math.hypot(dx, dy);
    const reach = stride(a, deltaMs, a.path.length === 1 ? dist : Infinity);
    a.moving = true;
    if (dist > 0) a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    if (dist <= reach) {
      a.x = target.tx;
      a.y = target.ty;
      a.path.shift();
      if (a.path.length === 0) {
        a.moving = false;
        if (a.point) this.seats.occupy(a.point, a.id);
        // Hacia quien iba (el camarero, a la mesa) antes que hacia donde mira su punto.
        const facing = a.point ? this.loc.points?.[a.point]?.facing : undefined;
        if (a.face) a.dir = facingTo(target, a.face);
        else if (facing) a.dir = facing;
        a.face = undefined;
      }
      return;
    }
    a.x += (dx / dist) * reach;
    a.y += (dy / dist) * reach;
  }

  // -------------------------------------------------------------- planes

  private nextVisitorStep(a: Agent): void {
    // Acaba el paso en el que se cambiaba: lo que quede por ponerse, puesto (sigue en su taquilla).
    this.applyOutfit(a);
    // Antes de dejar una máquina, se incorpora, recoge y se baja: nadie sale andando de una postura tumbado.
    if (a.point && a.state !== 'FINISH' && this.stationOf(a.point)) {
      a.state = 'FINISH';
      a.timer = between(this.rng, 900, 1_700);
      return;
    }
    // Nadie sale a la calle en ropa de deporte: si tiene que irse (cierra el local, se va quien lo lleva) o acabó el
    // plan con ella puesta, primero vuelve a su vestuario a cambiarse.
    if ((a.leaveSoon || a.plan.length === 0) && a.sport && !a.rescued && this.profile.changeBack) {
      a.rescued = true;
      a.leaveSoon = false;
      a.leader = undefined;
      a.plan = [this.profile.changeBack];
    }
    if (a.leaveSoon || a.plan.length === 0) {
      this.leave(a);
      return;
    }
    const step = a.plan[0];
    const prefixes = this.expand(step.points, a.look);
    // Su taquilla de antes, si sigue libre; si no, otra del mismo vestuario.
    const own = step.outfit === 'street' && a.locker && !this.seats.has(a.locker) && !this.claimed.has(a.locker) ? a.locker : undefined;
    const point = own ?? this.freePoint(prefixes, (id) => id !== a.point && this.seatOk(id, a));
    if (!point && !a.point) {
      // Acaba de entrar y no hay sitio: se da la vuelta en vez de quedarse en la puerta.
      this.leave(a);
      return;
    }
    if (!point) {
      // Todo ocupado: espera en su sitio y lo vuelve a intentar; si sigue, se salta el paso. Un cambio de ropa no se
      // salta (esperaría con la ropa equivocada): espera su turno y, si no llega, se va.
      a.state = 'WAIT';
      a.timer = between(this.rng, 1_500, 3_500);
      if (step.outfit) {
        a.waits = (a.waits ?? 0) + 1;
        if (a.waits > 14) {
          a.plan = [];
          a.rescued = true;
        }
      } else if (this.rng() < 0.25) a.plan.shift();
      return;
    }
    a.waits = 0;
    if (!this.goTo(a, point, step.state)) {
      // Se le adelantaron o no hay ruta: sin asiento, espera un momento y lo intenta con otro.
      a.state = 'WAIT';
      a.timer = between(this.rng, 800, 1_600);
      return;
    }
    a.plan.shift();
    this.service?.reserve(point, a);
    a.stepPoints = step.points;
    a.pendingOutfit = step.outfit;
    a.changeLeft = undefined;
    if (step.outfit === 'gym') a.locker = point;
    a.timer = this.duration(step, point) + between(this.rng, ...POPULATION.reaction);
  }

  // ------------------------------------------------------------- vestuario

  /** El vestuario de cada cual, de su identidad (género); sin él (no binario), de donde le toque por su cara, siempre el mismo. */
  private sideOfLook(look: number): 'M' | 'F' {
    const gender = IDENTITIES[look]?.gender;
    return gender === 'woman' ? 'F' : gender === 'man' ? 'M' : look % 2 === 0 ? 'M' : 'F';
  }

  /** Los prefijos de un paso, con `{s}` vuelto M o F según quien lo hace. */
  private expand(prefixes: readonly string[], look: number): readonly string[] {
    if (!prefixes.some((p) => p.includes('{s}'))) return prefixes;
    const side = this.sideOfLook(look);
    return prefixes.map((p) => p.replace('{s}', side));
  }

  /** Ponerse lo que tocaba en el paso que acaba: la ropa de entrenar, o la de calle. */
  private applyOutfit(a: Agent): void {
    if (!a.pendingOutfit) return;
    a.sport = a.pendingOutfit === 'gym';
    a.pendingOutfit = undefined;
    a.changeLeft = undefined;
  }

  /**
   * Con qué ropa aparece quien entra a mitad de su plan: la de entrenar si ya
   * pasó por el cambio de ida y aún no por el de vuelta; y, si está en pleno
   * cambio, con la que lleva al empezarlo (el cambio se nota a mitad).
   */
  private dressFor(a: Agent, plan: readonly PlanStep[], at: number): void {
    let sport = false;
    for (let i = 0; i < at; i++) if (plan[i].outfit) sport = plan[i].outfit === 'gym';
    a.sport = sport;
    a.pendingOutfit = plan[at].outfit;
    if (a.pendingOutfit) a.locker = a.point;
  }

  /**
   * El personal trabaja según su oficio (data/services.ts): en su puesto, de
   * ronda entre sus puntos o sirviendo mesas. El que sirve va junto al cliente
   * sentado que lleva más rato sin que nadie pase, le atiende y vuelve.
   */
  private nextStaffMove(a: Agent): void {
    const role = a.staffRole!;
    if (a.leaveSoon) {
      this.leave(a);
      return;
    }
    const how = identity(role).activity;
    if (how === 'serve' && role.serves && a.state !== 'SERVE') {
      const seated = this.agents.filter((c) => c.kind === 'visitor' && !c.moving && !c.leaving && c.path.length === 0 && c.point && role.serves!.some((p) => c.point!.startsWith(p)));
      const customer = nextCustomer(seated.map((c) => ({ id: c.id, x: c.x, y: c.y })), this.served, this.elapsed);
      const tile = customer && besideTile(this.loc, { tx: customer.x, ty: customer.y }, this.takenTiles());
      // Un hueco al que no hay camino desde donde está (una mesa arrinconada) no vale: no va, no se cuenta como ruta fallida.
      const reachable = tile && tilePath(this.loc, { tx: Math.round(a.x), ty: Math.round(a.y) }, tile) !== null;
      if (customer && tile && reachable) {
        this.served.set(customer.id, this.elapsed);
        this.release(a);
        a.state = 'SERVE';
        a.face = { tx: customer.x, ty: customer.y };
        a.path = this.route(a, tile);
        a.timer = between(this.rng, 2_500, 4_500);
        return;
      }
    }
    if (how === 'serve' && a.state === 'SERVE') {
      // Vuelve a la barra o a su sitio de sala.
      const home = this.freePoint(role.points, () => true);
      if (home) this.goTo(a, home, 'WORK');
      a.timer = between(this.rng, 3_000, 8_000);
      return;
    }
    // Un puesto fijo se queda; las rondas (y el camarero sin mesas que atender) cambian de punto.
    const point = how !== 'post' && this.pointsMatching(role.points).length > 1 ? this.freePoint(role.points, (id) => id !== a.point) : null;
    if (point) this.goTo(a, point, 'WORK');
    a.timer = how === 'serve' ? between(this.rng, 4_000, 9_000) : between(this.rng, 8_000, 20_000);
  }

  /** Tamaño del grupo que entra, sin pasar de lo que cabe. */
  private partySize(role: VisitorRole, room: number): number {
    const [lo, hi] = role.party ?? [1, 1];
    return Math.max(1, Math.min(room, lo + Math.floor(this.rng() * (hi - lo + 1))));
  }

  /** Tiles con alguien encima o a donde va alguien: ahí no se pone el camarero. */
  private takenTiles(): Set<string> {
    const taken = new Set<string>();
    for (const a of this.agents) {
      const end = a.path[a.path.length - 1] ?? { tx: Math.round(a.x), ty: Math.round(a.y) };
      taken.add(`${end.tx},${end.ty}`);
    }
    for (const id of this.seats.seats()) {
      const p = this.pointAt(id);
      taken.add(`${p.tx},${p.ty}`);
    }
    return taken;
  }

  private buildPlan(role: VisitorRole): PlanStep[] {
    const plan: PlanStep[] = [];
    for (const step of role.plan) {
      if (step.chance !== undefined && this.rng() > step.chance) continue;
      const [lo, hi] = step.repeat ?? [1, 1];
      const times = lo + Math.floor(this.rng() * (hi - lo + 1));
      for (let i = 0; i < times; i++) plan.push(step);
    }
    return plan;
  }

  private pickRole(clock: Clock): VisitorRole | undefined {
    const t = clock.hour + clock.minute / 60;
    // Una franja que pasa de medianoche ([23, 5]) vale a ambos lados.
    const inHours = ([from, to]: readonly [number, number]): boolean => (from <= to ? t >= from && t < to : t >= from || t < to);
    const roles = this.profile.visitors.filter((r) => !r.hours || inHours(r.hours));
    const total = roles.reduce((s, r) => s + r.weight, 0);
    let roll = this.rng() * total;
    for (const r of roles) {
      roll -= r.weight;
      if (roll < 0) return r;
    }
    return roles[roles.length - 1];
  }

  /** Lo que dura un paso: lo que pida el puesto (una cinta, un banco) o, si no es un puesto, el plan. */
  private duration(step: PlanStep, point: string): number {
    const [lo, hi] = this.stationOf(point)?.minutes ?? step.minutes;
    return between(this.rng, lo, hi) * MS_PER_GAME_MINUTE;
  }

  private stationOf(point: string): StationDef | undefined {
    const use = this.loc.points?.[point]?.use;
    return use ? getStation(use) : undefined;
  }

  /**
   * Libre, reservado (alguien va de camino) o en uso (alguien está encima). Un
   * personaje con nombre que está ahí también lo ocupa. Nadie coge un punto que
   * no está libre: lo decide `freePoints`, que mira las mismas reservas.
   */
  occupancy(point: string): Occupancy {
    const state = this.seats.state(point);
    if (state === 'available') return this.claimed.has(point) ? 'IN_USE' : 'FREE';
    return state === 'occupied' ? 'IN_USE' : 'RESERVED';
  }

  /**
   * Reservas huérfanas: de alguien que ya no está, que ya no va a ese asiento,
   * que se quedó sin camino sin llegar o que lleva demasiado de camino. Se
   * sueltan y quien siguiera ahí vuelve a decidir: ningún asiento queda bloqueado.
   */
  private sweepSeats(): void {
    const freed = this.seats.sweep((owner, seat, state, age) => {
      const a = this.agents.find((x) => x.id === owner);
      if (!a || a.leaving || a.point !== seat) return false;
      if (state === 'reserved') return a.path.length > 0 && age < RESERVE_TTL_MS;
      return a.path.length === 0;
    });
    for (const { owner } of freed) {
      const a = this.agents.find((x) => x.id === owner);
      if (a && a.point) {
        a.point = undefined;
        a.path = [];
        a.timer = 0;
      }
    }
  }

  // -------------------------------------------------------- altas y bajas

  /** Una cara que no esté ya en la sala mientras haya: dos gemelos en el mismo local se notan. */
  private pickLook(): number {
    const used = new Set(this.agents.map((a) => a.look));
    let look = Math.floor(this.rng() * PASSENGER_LOOKS.length);
    for (let i = 0; i < PASSENGER_LOOKS.length && used.has(look); i++) look = (look + 1) % PASSENGER_LOOKS.length;
    return look;
  }

  private newAgent(kind: Agent['kind'], role: string, label: string, line: string, at: TilePoint, chosen?: number): Agent {
    const look = chosen ?? this.pickLook();
    const agent: Agent = {
      id: this.nextId++, kind, role, label, line, look,
      x: at.tx, y: at.ty, dir: 'up', moving: false, state: 'ENTER',
      speed: between(this.rng, ...POPULATION.walkSpeed), path: [], timer: 0, plan: [], leaveSoon: false, leaving: false,
    };
    this.agents.push(agent);
    return agent;
  }

  private addStaff(role: StaffRole, point: string): Agent {
    const who = identity(role);
    const agent = this.newAgent('staff', role.service, who.label, who.line, this.pointAt(point));
    agent.npc = role.npc;
    agent.staffRole = role;
    agent.uniform = who.look;
    this.occupy(agent, point, 'WORK');
    agent.timer = between(this.rng, 8_000, 20_000);
    return agent;
  }

  private enterStaff(role: StaffRole): void {
    const point = this.freePoint(role.points, () => true);
    if (!point) return;
    const who = identity(role);
    const agent = this.newAgent('staff', role.service, who.label, who.line, this.door);
    agent.npc = role.npc;
    agent.staffRole = role;
    agent.uniform = who.look;
    this.goTo(agent, point, 'ENTER');
    agent.timer = between(this.rng, 8_000, 20_000);
  }

  /** Entra por la puerta; si viene en grupo, los demás cruzan detrás, de uno en uno. */
  private enterVisitor(role: VisitorRole, room: number): void {
    const agent = this.newAgent('visitor', role.role, role.label, role.line, this.door);
    agent.plan = this.buildPlan(role);
    agent.timer = between(this.rng, ...POPULATION.reaction);
    agent.pendingParty = this.partySize(role, room) - 1;
  }

  private leave(a: Agent): void {
    this.release(a);
    a.leaving = true;
    a.state = 'LEAVE';
    a.path = this.route(a, this.door);
  }

  private remove(index: number): void {
    this.release(this.agents[index]);
    this.watch.forget(this.agents[index].id);
    this.agents.splice(index, 1);
  }

  // ------------------------------------------------------- atascos (Recovery)

  /** Tile donde se puede estar: pisable, sin obstáculo temporal y dentro del mapa (isWalkable ya mira los bordes). */
  private standable(t: TilePoint): boolean {
    return isWalkable(this.loc, t.tx, t.ty) && !this.blocked.has(tileKey(t));
  }

  /**
   * Un peldaño de la escalera de systems/Recovery. 1: ruta nueva que rodea los
   * obstáculos. 2: al tile alcanzable más cerca del destino, y de ahí sigue.
   * 3: deja el paso en curso y vuelve a decidir con su plan (quien se iba,
   * sigue yéndose). 4: fuera de cámara, reaparece en el tile válido más cercano
   * que no se vea (o sale si ya se iba); a la vista, espera y lo reintenta.
   */
  private recover(a: Agent, level: RecoveryLevel): void {
    const dest = a.resume ?? a.path[a.path.length - 1];
    const here = { tx: Math.round(a.x), ty: Math.round(a.y) };
    if (level === 1 && dest) {
      const path = tilePath(this.loc, here, dest, this.blocked);
      if (path && path.length > 1) a.path = path.slice(1);
      return;
    }
    if (level === 2 && dest) {
      const near = nearestReachable(here, (t) => this.standable(t), (t) => this.distance(t, dest), undefined, 12);
      if (near && near.length > 0) {
        a.path = near;
        a.resume = dest;
      }
      return;
    }
    if (level === 3) {
      a.resume = undefined;
      if (a.leaving) {
        // Quien ya se iba sólo puede irse: por la puerta, rodeando lo que haya. Sin rodeo conserva su camino
        // (un camino vacío lo borraría aquí mismo, a la vista): el peldaño 4 lo saca fuera de cámara.
        const out = tilePath(this.loc, here, this.door, this.blocked);
        if (out && out.length > 1) a.path = out.slice(1);
        return;
      }
      a.path = [];
      a.moving = false;
      this.release(a);
      a.leader = undefined;
      a.state = 'IDLE';
      a.timer = 0;
      return;
    }
    if (level !== 4) return;
    const seen = !offCamera(here, this.player) && !this.watch.forced(a.id);
    if (seen) return;
    if (a.leaving) {
      // Fuera de cámara y yéndose: sale ya.
      a.path = [];
      a.x = this.door.tx;
      a.y = this.door.ty;
      return;
    }
    const spot = nearestReachable(
      here,
      () => true,
      (t) => this.distance(t, here),
      (t) => this.standable(t) && (this.watch.forced(a.id) || offCamera(t, this.player)),
      64,
    );
    const to = spot?.[spot.length - 1] ?? (offCamera(this.door, this.player) ? this.door : undefined);
    if (!to) return;
    this.release(a);
    a.x = to.tx;
    a.y = to.ty;
    a.path = [];
    a.resume = undefined;
    a.state = 'IDLE';
    a.timer = 0;
  }

  /** Depuración: corta el tile al que va el más cercano que esté andando y lo da por atascado. Devuelve su id. */
  devForceStuck(near: TilePoint): number | null {
    const walking = this.agents.filter((a) => a.path.length > 0 && !a.talking);
    const a = walking.sort((p, q) => this.distance({ tx: p.x, ty: p.y }, near) - this.distance({ tx: q.x, ty: q.y }, near))[0];
    if (!a) return null;
    this.blocked.add(tileKey(a.path[0]));
    this.watch.force(a.id, a.x, a.y);
    return a.id;
  }

  /** Depuración: quita los obstáculos temporales y el estado de recuperación. */
  devResetRecovery(): void {
    this.blocked.clear();
    this.watch.reset();
  }

  // --------------------------------------------------------- puntos y rutas

  /**
   * Va a un punto: lo reserva en el acto y camina. Si ya es de otro, o no hay
   * ruta, no va: queda donde está sin asiento y vuelve a decidir enseguida.
   */
  private goTo(a: Agent, point: string, state: string): boolean {
    this.release(a);
    if (!this.seats.reserve(point, a.id) || this.claimed.has(point)) {
      this.seats.release(point, a.id);
      a.path = [];
      a.timer = 0;
      return false;
    }
    const failures = this.pathFailures;
    a.point = point;
    a.state = state;
    a.path = this.route(a, this.pointAt(point));
    if (this.pathFailures > failures) {
      this.release(a);
      a.timer = 0;
      return false;
    }
    return true;
  }

  private occupy(a: Agent, point: string, state: string): void {
    this.seats.occupy(point, a.id);
    a.point = point;
    a.state = state;
    const facing = this.loc.points?.[point]?.facing;
    if (facing) a.dir = facing;
  }

  private release(a: Agent): void {
    if (a.point) this.seats.release(a.point, a.id);
    a.point = undefined;
  }

  private route(a: Agent, to: TilePoint): TilePoint[] {
    const from = { tx: Math.round(a.x), ty: Math.round(a.y) };
    // Rodea los obstáculos temporales si puede; si no, la ruta de siempre (y el vigía de atascos se encarga).
    const path = (this.blocked.size > 0 ? tilePath(this.loc, from, to, this.blocked) : null) ?? tilePath(this.loc, from, to);
    if (!path) {
      this.pathFailures++;
      return [];
    }
    return path.slice(1);
  }

  private pointsMatching(prefixes: readonly string[]): string[] {
    return Object.keys(this.loc.points ?? {}).filter((id) => prefixes.some((p) => id.startsWith(p)));
  }

  private freePoint(prefixes: readonly string[], ok: (id: string) => boolean): string | undefined {
    const free = this.freePoints(prefixes, ok);
    return free.length === 0 ? undefined : free[Math.floor(this.rng() * free.length)];
  }

  private freePoints(prefixes: readonly string[], ok: (id: string) => boolean): string[] {
    return this.pointsMatching(prefixes).filter((id) => !this.seats.has(id) && !this.claimed.has(id) && ok(id));
  }

  /** El sitio libre más cercano: la silla de al lado, la mesa contigua. */
  private freePointNear(prefixes: readonly string[], near: TilePoint, ok: (id: string) => boolean): string | undefined {
    let best: string | undefined;
    let bestD = Infinity;
    for (const id of this.freePoints(prefixes, ok)) {
      const d = this.distance(this.pointAt(id), near);
      if (d < bestD) {
        best = id;
        bestD = d;
      }
    }
    return best;
  }

  private pointAt(id: string): TilePoint {
    const p = this.loc.points?.[id];
    if (!p) throw new Error(`[${this.loc.id}] punto desconocido ${id}`);
    return { tx: p.tx, ty: p.ty };
  }

  private atDoor(a: Agent): boolean {
    return Math.round(a.x) === this.door.tx && Math.round(a.y) === this.door.ty;
  }

  private distance(a: TilePoint, b: TilePoint): number {
    return Math.hypot(a.tx - b.tx, a.ty - b.ty);
  }
}

/** Del paso inicial al de crucero, en ms; y a cuántos tiles del final empieza a frenar. */
const ACCEL_MS = 280;
const BRAKE_TILES = 0.6;

/**
 * Lo que avanza alguien este frame: arranca a un tercio y llega a su paso en
 * ACCEL_MS; en el último tramo frena hasta la mitad antes de pararse. Nadie
 * pasa de quieto a paso de crucero (ni al revés) de un frame a otro.
 * `remaining`: lo que le queda hasta pararse (Infinity si aún quedan tramos).
 */
export function stride(a: Agent, deltaMs: number, remaining: number): number {
  a.walkMs = a.moving ? (a.walkMs ?? 0) + deltaMs : deltaMs;
  const start = Math.min(1, 0.35 + (0.65 * a.walkMs) / ACCEL_MS);
  const brake = remaining < BRAKE_TILES ? Math.max(0.5, remaining / BRAKE_TILES) : 1;
  return (a.speed * Math.min(start, brake) * deltaMs) / 1000;
}

function facingTo(from: TilePoint, to: TilePoint): Facing {
  const dx = to.tx - from.tx;
  const dy = to.ty - from.ty;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}
