// Sin Phaser: world/CrowdView.ts lo pinta y scripts/simulate-population.ts lo
// simula durante horas con exactamente esta lógica.
import { GAME_MINUTES_PER_REAL_SECOND } from '../config/constants.ts';
import { LEVELS, POPULATION, type Level } from '../config/population.ts';
import { POPULATION_PROFILES, type PlanStep, type PopulationProfile, type StaffRole, type VisitorRole } from '../data/population.ts';
import { PASSENGER_LOOKS } from '../data/npcs.ts';
import type { Facing, LocationDef, TilePoint } from '../types/game.ts';
import { between, hashSeed, seededRng, weekIndex, type Rng } from './MetroDaily.ts';
import { isOpen, openingDay, type PlaceInfo } from './Places.ts';
import { tilePath } from './Navigation.ts';
import { besideTile, identity, nextCustomer } from './Service.ts';

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
  const wanted = lo + Math.floor(rng() * (hi - lo + 1));
  return Math.max(0, Math.min(wanted, profile.maxVisitors, place.capacity - staff));
}

// ---------------------------------------------------------------- agentes

export interface Agent {
  id: number;
  kind: 'staff' | 'visitor';
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
  private readonly reserved = new Map<string, number>();
  private nextId = 1;
  private tick = 0;
  private stats: CrowdStats = { open: false, level: null, target: 0, staff: 0, visitors: 0, entering: 0, leaving: 0 };
  /** Rutas que no se encontraron: debe quedarse en cero (lo comprueba la simulación). */
  pathFailures = 0;

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
      if (points.length > 0 && this.pointsMatching(points).length === 0) throw new Error(`[${loc.id}] ningún punto para ${points.join(', ')}`);
    }
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
      if (a.point && points.has(a.point) && a.path.length === 0 && !a.leaving) {
        this.release(a);
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
    const far = (id: string): boolean => this.distance(this.pointAt(id), player) >= POPULATION.spawnClearance;

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
      let skip = -1;
      let point: string | undefined;
      for (let k = 0; k < plan.length && !point; k++) {
        skip = (start + k) % plan.length;
        point = this.freePoint(plan[skip].points, far);
      }
      if (!point) continue;
      const step = plan[skip];
      const agent = this.newAgent('visitor', role.role, role.label, role.line, this.pointAt(point));
      agent.plan = plan.slice(skip + 1);
      agent.stepPoints = step.points;
      this.occupy(agent, point, step.state);
      agent.timer = this.duration(step) * (0.2 + this.rng() * 0.8);
      placed++;
      // Su grupo, ya sentado a su lado.
      for (let k = 1; k < this.partySize(role, target - placed + 1); k++) {
        const near = this.freePointNear(step.points, this.pointAt(point), far);
        if (!near) break;
        const mate = this.newAgent('visitor', role.role, role.label, role.line, this.pointAt(near));
        mate.leader = agent;
        mate.following = point;
        this.occupy(mate, near, step.state);
        placed++;
      }
    }
    this.rng = this.baseRng;
    this.refresh(clock);
  }

  // --------------------------------------------------------------- tiempo

  update(deltaMs: number, clock: Clock, player: TilePoint): void {
    this.elapsed += deltaMs;
    this.tick -= deltaMs;
    if (this.tick <= 0) {
      this.tick = between(this.rng, ...POPULATION.tickEvery);
      this.reconcile(clock, player);
    }
    for (const agent of this.agents) this.advance(agent, deltaMs);
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
      const leaders = active.filter((a) => !a.leader).sort((a, b) => a.plan.length - b.plan.length);
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
    a.moving = false;
    if (a.leaving) return;
    if (a.leader && !a.leaveSoon) {
      this.followParty(a);
      return;
    }
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
    const near = this.freePointNear(lead.stepPoints, this.pointAt(lead.point), (id) => id !== a.point);
    if (near) this.goTo(a, near, lead.state);
  }

  private walk(a: Agent, deltaMs: number): void {
    const target = a.path[0];
    const dx = target.tx - a.x;
    const dy = target.ty - a.y;
    const dist = Math.hypot(dx, dy);
    const reach = (a.speed * deltaMs) / 1000;
    a.moving = true;
    if (dist > 0) a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    if (dist <= reach) {
      a.x = target.tx;
      a.y = target.ty;
      a.path.shift();
      if (a.path.length === 0) {
        a.moving = false;
        const facing = a.point ? this.loc.points?.[a.point]?.facing : undefined;
        if (facing) a.dir = facing;
        else if (a.face) a.dir = facingTo(target, a.face);
        a.face = undefined;
      }
      return;
    }
    a.x += (dx / dist) * reach;
    a.y += (dy / dist) * reach;
  }

  // -------------------------------------------------------------- planes

  private nextVisitorStep(a: Agent): void {
    if (a.leaveSoon || a.plan.length === 0) {
      this.leave(a);
      return;
    }
    const step = a.plan[0];
    const point = this.freePoint(step.points, (id) => id !== a.point);
    if (!point && !a.point) {
      // Acaba de entrar y no hay sitio: se da la vuelta en vez de quedarse en la puerta.
      this.leave(a);
      return;
    }
    if (!point) {
      // Todo ocupado: espera en su sitio y lo vuelve a intentar; si sigue, se salta el paso.
      a.state = 'WAIT';
      a.timer = between(this.rng, 1_500, 3_500);
      if (this.rng() < 0.25) a.plan.shift();
      return;
    }
    a.plan.shift();
    this.goTo(a, point, step.state);
    a.stepPoints = step.points;
    a.timer = this.duration(step) + between(this.rng, ...POPULATION.reaction);
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
      if (customer && tile) {
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
    for (const id of this.reserved.keys()) {
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

  private duration(step: PlanStep): number {
    return between(this.rng, step.minutes[0], step.minutes[1]) * MS_PER_GAME_MINUTE;
  }

  // -------------------------------------------------------- altas y bajas

  private newAgent(kind: Agent['kind'], role: string, label: string, line: string, at: TilePoint): Agent {
    const used = new Set(this.agents.map((a) => a.look));
    let look = Math.floor(this.rng() * PASSENGER_LOOKS.length);
    // Caras distintas mientras haya: dos gemelos en la misma sala se notan.
    for (let i = 0; i < PASSENGER_LOOKS.length && used.has(look); i++) look = (look + 1) % PASSENGER_LOOKS.length;
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
    this.agents.splice(index, 1);
  }

  // --------------------------------------------------------- puntos y rutas

  private goTo(a: Agent, point: string, state: string): void {
    this.release(a);
    this.reserved.set(point, a.id);
    a.point = point;
    a.state = state;
    a.path = this.route(a, this.pointAt(point));
  }

  private occupy(a: Agent, point: string, state: string): void {
    this.reserved.set(point, a.id);
    a.point = point;
    a.state = state;
    const facing = this.loc.points?.[point]?.facing;
    if (facing) a.dir = facing;
  }

  private release(a: Agent): void {
    if (a.point && this.reserved.get(a.point) === a.id) this.reserved.delete(a.point);
    a.point = undefined;
  }

  private route(a: Agent, to: TilePoint): TilePoint[] {
    const from = { tx: Math.round(a.x), ty: Math.round(a.y) };
    const path = tilePath(this.loc, from, to);
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
    return this.pointsMatching(prefixes).filter((id) => !this.reserved.has(id) && !this.claimed.has(id) && ok(id));
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

function facingTo(from: TilePoint, to: TilePoint): Facing {
  const dx = to.tx - from.tx;
  const dy = to.ty - from.ty;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}
