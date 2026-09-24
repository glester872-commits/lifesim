// Sin Phaser: world/CrowdView.ts lo pinta y scripts/simulate-population.ts lo
// simula durante horas con exactamente esta lógica.
import { GAME_MINUTES_PER_REAL_SECOND } from '../config/constants.ts';
import { LEVELS, POPULATION, type Level } from '../config/population.ts';
import { POPULATION_PROFILES, type PlanStep, type PopulationProfile, type StaffRole, type VisitorRole } from '../data/population.ts';
import { PASSENGER_LOOKS } from '../data/npcs.ts';
import type { Facing, LocationDef, TilePoint } from '../types/game.ts';
import { between, hashSeed, seededRng, weekIndex, type Rng } from './MetroDaily.ts';
import { isOpen, type PlaceInfo } from './Places.ts';
import { tilePath } from './Navigation.ts';

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
  if (!isOpen(place, clock.hour, clock.minute)) return null;
  const t = clock.hour + clock.minute / 60;
  const band = profile.bands.find(([from, to]) => t >= from && t < to);
  const base = LEVELS.indexOf(band ? band[2] : 'VERY_LOW');
  const shifted = base + profile.weekday[weekIndex(clock.day)];
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
    for (const step of [...profile.visitors.flatMap((v) => v.plan), ...profile.staff]) {
      if (this.pointsMatching(step.points).length === 0) throw new Error(`[${loc.id}] ningún punto para ${step.points.join(', ')}`);
    }
  }

  get summary(): CrowdStats {
    return this.stats;
  }

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
    for (let i = 0; i < target; i++) {
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
      this.occupy(agent, point, step.state);
      agent.timer = this.duration(step) * (0.2 + this.rng() * 0.8);
    }
    this.rng = this.baseRng;
    this.refresh(clock);
  }

  // --------------------------------------------------------------- tiempo

  update(deltaMs: number, clock: Clock, player: TilePoint): void {
    this.tick -= deltaMs;
    if (this.tick <= 0) {
      this.tick = between(this.rng, ...POPULATION.tickEvery);
      this.reconcile(clock, player);
    }
    for (const agent of this.agents) this.advance(agent, deltaMs);
    for (let i = this.agents.length - 1; i >= 0; i--) {
      const a = this.agents[i];
      // Sale por la puerta. Si no encontró camino (cuenta en pathFailures), se va igual: nadie se queda atascado.
      if (a.leaving && a.path.length === 0) this.remove(i);
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
    const active = this.agents.filter((a) => a.kind === 'visitor' && !a.leaving && !a.leaveSoon);
    const diff = this.stats.target - active.length;
    const changes = Math.min(Math.abs(diff), Math.abs(diff) > 4 ? POPULATION.maxChangesPerTick : 1);
    // Por la puerta entra una persona cada vez; salir, pueden varias.
    if (diff > 0 && doorClear && this.agents.length < this.place.capacity) {
      const role = this.pickRole(clock);
      if (role) this.enterVisitor(role);
    } else if (diff < 0) {
      // Se van primero los que menos plan les queda: los que ya estaban acabando.
      active.sort((a, b) => a.plan.length - b.plan.length);
      for (const a of active.slice(0, changes)) a.leaveSoon = true;
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
    if (a.path.length > 0) {
      this.walk(a, deltaMs);
      return;
    }
    a.moving = false;
    if (a.leaving) return;
    a.timer -= deltaMs;
    if (a.timer > 0) return;
    if (a.kind === 'staff') this.nextStaffMove(a);
    else this.nextVisitorStep(a);
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
    a.timer = this.duration(step) + between(this.rng, ...POPULATION.reaction);
  }

  private nextStaffMove(a: Agent): void {
    const role = a.staffRole!;
    if (a.leaveSoon) {
      this.leave(a);
      return;
    }
    // Un puesto fijo se queda; el personal de sala da vueltas entre sus puntos.
    const point = this.pointsMatching(role.points).length > 1 ? this.freePoint(role.points, (id) => id !== a.point) : null;
    if (point) this.goTo(a, point, 'WORK');
    a.timer = between(this.rng, 8_000, 20_000);
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
    const roles = this.profile.visitors.filter((r) => !r.hours || (t >= r.hours[0] && t < r.hours[1]));
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
    const agent = this.newAgent('staff', role.role, role.label ?? '', role.line ?? '', this.pointAt(point));
    agent.npc = role.npc;
    agent.staffRole = role;
    this.occupy(agent, point, 'WORK');
    agent.timer = between(this.rng, 8_000, 20_000);
    return agent;
  }

  private enterStaff(role: StaffRole): void {
    const point = this.freePoint(role.points, () => true);
    if (!point) return;
    const agent = this.newAgent('staff', role.role, role.label ?? '', role.line ?? '', this.door);
    agent.npc = role.npc;
    agent.staffRole = role;
    this.goTo(agent, point, 'ENTER');
    agent.timer = between(this.rng, 8_000, 20_000);
  }

  private enterVisitor(role: VisitorRole): void {
    const agent = this.newAgent('visitor', role.role, role.label, role.line, this.door);
    agent.plan = this.buildPlan(role);
    agent.timer = between(this.rng, ...POPULATION.reaction);
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
    const free = this.pointsMatching(prefixes).filter((id) => !this.reserved.has(id) && ok(id));
    return free.length === 0 ? undefined : free[Math.floor(this.rng() * free.length)];
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
