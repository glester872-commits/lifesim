// Sin Phaser: world/CrowdView.ts lo pinta y scripts/simulate-streets.ts lo
// simula durante días con exactamente esta lógica.
import { GAME_MINUTES_PER_REAL_SECOND } from '../config/constants.ts';
import { LEVELS, POPULATION, type Level } from '../config/population.ts';
import { STREET_PROFILES, type Ends, type StreetPost, type StreetProfile, type TripRule } from '../data/streets.ts';
import { PASSENGER_LOOKS } from '../data/npcs.ts';
import { PLACES } from '../data/places.ts';
import type { Facing, LocationDef, SignalDef, TilePoint } from '../types/game.ts';
import { between, hashSeed, seededRng, type Rng } from './MetroDaily.ts';
import { nightOwner, rhythmAt, weekIndex } from './Calendar.ts';
import { isOpen, placeInfo, placeOfPoint, type PlaceInfo } from './Places.ts';
import { route, tilePath } from './Navigation.ts';
import { besideTile, identity, nextCustomer } from './Service.ts';
import { ROADWAY, isWalkable } from './LocationSystem.ts';
import { levelAt, profileFor, stride, type Agent, type Clock } from './Crowd.ts';
import { DOG_LOOKS } from '../data/wildlife.ts';
import { lookWeights, profileAt } from './Districts.ts';
import { crossingOf, signalAt, waitSpots } from './Signals.ts';
import { HEAVY_RAIN, outdoorAppeal, weatherAt, type Weather } from './Weather.ts';

/**
 * El tiempo en la calle: con lluvia o frío hay menos gente (quien puede, se
 * queda dentro); con calor, algo más. Chaparrón: menos de dos tercios.
 */
export function streetWeatherScale(w: Weather): number {
  const rain = w.rain > HEAVY_RAIN ? 0.6 : w.rain > 0.08 ? 0.8 : 1;
  return rain * (w.temp === 'cold' ? 0.85 : w.temp === 'warm' ? 1.1 : 1);
}

/** Viaje de estar fuera: sentarse en una terraza o un banco, pasear, correr, mirar escaparates. */
const outdoorLeisure = (rule: TripRule): boolean => (!!rule.stay && !!rule.to.points) || rule.pace !== undefined;
/** Viaje a cubierto: un bar, una tienda, la discoteca, el metro. */
const toShelter = (rule: TripRule): boolean =>
  !!rule.to.tags?.some((t) => t === 'food' || t === 'nightlife' || t === 'shop') ||
  !!rule.to.types?.includes('transit') ||
  // Un viaje a la puerta de un sitio (el restaurante, el café, el gimnasio) también es meterse dentro.
  !!rule.to.points?.some((p) => p.endsWith('_ENTRANCE'));

/**
 * Cuánto pesa un viaje con este tiempo: lo de estar fuera sigue a las ganas de
 * estar fuera (poca terraza con lluvia, mucha con calor); lo de meterse en
 * algún sitio, al revés. Lo demás (ir a trabajar, volver a casa) no cambia.
 */
export function weatherBias(rule: TripRule, w: Weather): number {
  const appeal = outdoorAppeal(w);
  if (outdoorLeisure(rule)) return appeal;
  if (toShelter(rule)) return 1 + Math.max(0, 1 - appeal) * 0.8;
  return 1;
}

const MS_PER_GAME_MINUTE = 1000 / GAME_MINUTES_PER_REAL_SECOND;
/** Nadie se queda parado en la calzada, aunque se pueda pisar. */
/** Cada cuánto (ms reales) la calle decide si sale alguien más. */
const TICK: readonly [number, number] = [1_200, 2_600];
/** Quien va solo a veces se para un momento a mitad de camino (el móvil, un escaparate). */
const PAUSE_CHANCE = 0.2;
/** Tiles por segundo al trotar y al pasear (quien va a algo, POPULATION.walkSpeed). */
const JOG_SPEED: readonly [number, number] = [3.8, 4.6];
const STROLL_SPEED: readonly [number, number] = [1.2, 1.6];

/** Hasta las 6 la madrugada es de la noche anterior: el sábado a las 3 sigue siendo viernes (systems/Calendar). */
export const logicalDay = (c: Clock): number => nightOwner(c.day, c.hour);
const hourOf = (c: Clock): number => c.hour + c.minute / 60;
const inHours = (hours: readonly [number, number] | undefined, t: number): boolean =>
  !hours || (hours[0] <= hours[1] ? t >= hours[0] && t < hours[1] : t >= hours[0] || t < hours[1]);

export function streetProfileFor(location: string): StreetProfile | undefined {
  return STREET_PROFILES.find((p) => p.location === location);
}

/** Nivel de la calle a esa hora de ese día, contando la madrugada con la noche anterior. */
export function streetLevelAt(profile: StreetProfile, clock: Clock): Level {
  const t = hourOf(clock);
  const band = profile.bands.find(([from, to]) => t >= from && t < to);
  const base = LEVELS.indexOf(band ? band[2] : 'VERY_LOW');
  const shifted = base + profile.weekday[weekIndex(logicalDay(clock))];
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, shifted))];
}

/**
 * Cuánto tira un lugar de la gente: 0 cerrado, 1 sin perfil de afluencia
 * (un portal, la plaza) y, con perfil, de 1/3 vacío a 5/3 lleno.
 */
export function pull(place: PlaceInfo | undefined, clock: Clock): number {
  if (!place) return 1;
  if (!isOpen(place, clock.day, clock.hour, clock.minute)) return 0;
  const profile = profileFor(place.id);
  if (!profile) return 1;
  const level = levelAt(place, profile, clock);
  return level === null ? 0 : (LEVELS.indexOf(level) + 1) / 3;
}

/** Gente que debería haber en la calle: el nivel de la hora más lo que atraen los locales llenos. */
export function streetTargetAt(profile: StreetProfile, clock: Clock): number {
  const [lo, hi] = POPULATION.levels[streetLevelAt(profile, clock)];
  const slot = Math.floor((clock.hour * 60 + clock.minute) / 30);
  const rng = seededRng(hashSeed('street', profile.location, clock.day, slot));
  let wanted = Math.round((lo + rng() * (hi - lo)) * profile.scale);
  for (const d of profile.draws ?? []) {
    const place = placeInfo(d.place);
    // pull va de 1/3 a 5/3: de uno a cinco niveles.
    const levels = place ? Math.round(pull(place, clock) * 3) : 0;
    wanted += levels * d.perLevel;
  }
  wanted = Math.round(wanted * streetWeatherScale(weatherAt(clock.day, clock.hour + clock.minute / 60)));
  return Math.min(wanted, profile.maxWalkers);
}

// ---------------------------------------------------------------- paseantes

/** Alguien que cruza la calle: los campos de Agent para pintarse, más su viaje. */
export interface Walker extends Agent {
  /** El viaje que hace; el personal de terraza no hace viajes. */
  rule?: TripRule;
  /** Personal: su puesto en la calle. */
  post?: StreetPost;
  /** Donde se queda un rato, si el viaje lo tiene (y lo tiene reservado). */
  stayPoint?: string;
  staying: boolean;
  /** Al acabar el camino desaparece: ha entrado en un sitio o ha salido del barrio. */
  vanish: boolean;
  /** Ms antes de echar a andar: el grupo sale en fila. */
  delay: number;
  /** Si va en grupo y no es quien lo lleva, a quién sigue. */
  leader?: Walker;
  /** Ya está a su lado, en su sitio del corrillo. */
  settled: boolean;
  /** Se para un momento cuando le quedan tantos tramos; -1, no. */
  pauseAt: number;
  /** Lleva perro: su aspecto (systems/Wildlife.ts lo pasea detrás). */
  dog?: number;
  /** Semáforos: el sitio del bordillo al que va a esperar, o el semáforo al que espera. */
  waitAt?: TilePoint;
  hold?: SignalDef;
  /** El paso con semáforo del tramo en curso (y para qué tramo se calculó). */
  cross?: { signal: SignalDef; dir: 1 | -1; at: TilePoint };
  crossFor?: TilePoint;
}

export interface StreetStats {
  level: Level;
  target: number;
  walkers: number;
  staying: number;
}

interface Candidate {
  id: string;
  weight: number;
}

/**
 * La gente de una calle mientras el jugador está en ella. Igual que Crowd en
 * los locales: fuera de cámara no se simula nada, al volver se reconstruye
 * desde la semilla del momento. Todos caminan por el grafo de peatones de la
 * localización (aceras y pasos de cebra, ya validados), así que no pisan
 * vías, fachadas ni carriles salvo para cruzar.
 */
export class StreetLife {
  readonly agents: Walker[] = [];
  /** Rutas que no se encontraron: debe quedarse en cero (lo comprueba la simulación). */
  pathFailures = 0;
  private readonly loc: LocationDef;
  private readonly profile: StreetProfile;
  private readonly places: PlaceInfo[];
  private readonly graph: Set<string>;
  private readonly edges: string[];
  private rng: Rng;
  private readonly baseRng: Rng;
  private readonly reserved = new Map<string, number>();
  private claimed: ReadonlySet<string> = new Set();
  private nextId = 1;
  private tick = 0;
  /** El tiempo de ahora: decide qué viajes apetecen y a qué paso se va. */
  private weather: Weather = weatherAt(1, 12);
  private stats: StreetStats = { level: 'VERY_LOW', target: 0, walkers: 0, staying: 0 };
  /** Ms desde que el jugador llegó: el reloj del camarero de la terraza. */
  private elapsed = 0;
  /** Cliente → ms en que se le atendió. */
  private readonly served = new Map<number, number>();
  private readonly signals: readonly SignalDef[];
  private readonly spots = new Map<string, TilePoint[]>();
  /** Minuto del día con decimales: el reloj de los semáforos, el mismo que ven coches y personajes. */
  private signalMinute = 0;
  private signalBase = -1;
  /** Oleadas del metro: gente por salir, ms hasta la siguiente y el último tren que llegó. */
  private readonly waves: { pending: number; release: number; train: number }[];

  constructor(loc: LocationDef, profile: StreetProfile, rng: Rng = Math.random) {
    this.loc = loc;
    this.profile = profile;
    this.rng = rng;
    this.baseRng = rng;
    this.graph = new Set((loc.links ?? []).flat());
    this.signals = loc.signals ?? [];
    this.waves = (profile.bursts ?? []).map(() => ({ pending: 0, release: 0, train: -1 }));
    this.edges = [...this.graph].filter((id) => loc.points?.[id]?.kind === 'edge');
    this.places = PLACES.map((p) => placeInfo(p.id)!).filter((p) => p.locationId === loc.id);
    for (const trip of profile.trips) {
      for (const ends of [trip.from, trip.to, trip.then]) {
        for (const prefix of ends?.points ?? []) {
          if (!this.graphPoints([prefix]).length) throw new Error(`[${loc.id}] ningún punto del grafo para ${prefix} (${trip.role})`);
        }
      }
    }
  }

  get summary(): StreetStats {
    return this.stats;
  }

  /** Puntos donde está un personaje con nombre: nadie los coge, y quien estaba ahí se va. */
  /** Si alguien tiene ese punto (va hacia él, está en él o es de un personaje con nombre o del jugador). */
  isTaken(point: string): boolean {
    return this.reserved.has(point) || this.claimed.has(point);
  }

  claim(points: ReadonlySet<string>): void {
    this.claimed = points;
    for (const a of this.agents) if (a.staying && a.stayPoint && points.has(a.stayPoint)) a.timer = 0;
  }

  // ------------------------------------------------------------- llegada

  /** Al entrar el jugador: la gente ya está a mitad de camino o sentada. Mismo minuto, misma calle. */
  populate(clock: Clock, player: TilePoint): void {
    this.weather = weatherAt(clock.day, clock.hour + clock.minute / 60);
    this.tickSignals(clock, 0);
    const slot = Math.floor((clock.hour * 60 + clock.minute) / 30);
    this.rng = seededRng(hashSeed('street-populate', this.loc.id, clock.day, slot));
    const target = streetTargetAt(this.profile, clock);
    this.staffShift(clock);
    for (let tries = 0; this.walkers().length < target && tries < target * 4; tries++) this.startTrip(clock, player, target, true);
    this.rng = this.baseRng;
    this.refresh(clock);
  }

  // --------------------------------------------------------------- tiempo

  update(deltaMs: number, clock: Clock, player: TilePoint): void {
    this.weather = weatherAt(clock.day, clock.hour + clock.minute / 60);
    this.tickSignals(clock, deltaMs);
    this.metroWaves(deltaMs, clock, player);
    this.elapsed += deltaMs;
    this.tick -= deltaMs;
    if (this.tick <= 0) {
      this.tick = between(this.rng, ...TICK);
      this.reconcile(clock, player);
    }
    for (const a of this.agents) {
      // Hablando con el jugador: quieto donde está; su plan sigue al despedirse.
      if (a.talking) a.moving = false;
      else if (a.kind === 'staff') this.advanceStaff(a, deltaMs);
      else this.advance(a, deltaMs, clock);
    }
    for (let i = this.agents.length - 1; i >= 0; i--) {
      const a = this.agents[i];
      if (a.vanish && a.path.length === 0 && a.delay <= 0 && !a.talking) {
        this.release(a);
        this.agents.splice(i, 1);
      }
    }
  }

  /** Acerca la gente al objetivo poco a poco: sale uno (o un grupo) cada vez; si sobran, se acortan las paradas. */
  private reconcile(clock: Clock, player: TilePoint): void {
    this.refresh(clock);
    this.staffShift(clock);
    const { target } = this.stats;
    const walking = this.walkers().length;
    if (walking < target) this.startTrip(clock, player, target, false);
    else if (walking > target + 2) {
      const staying = this.agents.filter((a) => a.staying && !a.leader).sort((a, b) => b.timer - a.timer);
      for (const a of staying.slice(0, 2)) a.timer = Math.min(a.timer, 1_500);
    }
    this.refresh(clock);
  }

  /**
   * El metro: cada vez que llega un tren (cada `every` minutos, según la hora)
   * se apunta gente por salir, y sale de una en una por la boca, con su propio
   * viaje. Siempre dentro del tope de la calle.
   */
  private metroWaves(deltaMs: number, clock: Clock, player: TilePoint): void {
    (this.profile.bursts ?? []).forEach((b, i) => {
      const w = this.waves[i];
      const hour = this.signalMinute / 60;
      const band = b.every.find(([from, to]) => hour >= from && hour < to);
      if (band) {
        const train = Math.floor(this.signalMinute / band[2]);
        if (train !== w.train) {
          if (w.train >= 0) w.pending += b.size[0] + Math.floor(this.rng() * (b.size[1] - b.size[0] + 1));
          w.train = train;
        }
      }
      w.release -= deltaMs;
      if (w.pending <= 0 || w.release > 0) return;
      w.pending--;
      w.release = between(this.rng, 700, 1_600);
      if (this.walkers().length < this.profile.maxWalkers) this.startTrip(clock, player, this.profile.maxWalkers, false, b.point);
    });
  }

  /** Avanza el reloj de los semáforos con el tiempo real, sin pasarse del minuto que marca el juego. */
  private tickSignals(clock: Clock, deltaMs: number): void {
    const base = clock.hour * 60 + clock.minute;
    if (base !== this.signalBase) {
      this.signalBase = base;
      this.signalMinute = base;
    } else this.signalMinute = Math.min(base + 0.999, this.signalMinute + deltaMs / MS_PER_GAME_MINUTE);
  }

  private refresh(clock: Clock): void {
    this.stats = {
      level: streetLevelAt(this.profile, clock),
      target: streetTargetAt(this.profile, clock),
      walkers: this.walkers().length,
      staying: this.agents.filter((a) => a.staying || a.settled).length,
    };
  }

  private advance(a: Walker, deltaMs: number, clock: Clock): void {
    if (a.delay > 0) {
      a.delay -= deltaMs;
      a.moving = false;
      return;
    }
    if (a.timer > 0 && !a.staying && !a.settled) {
      // Parada breve a mitad de camino.
      a.timer -= deltaMs;
      a.moving = false;
      if (a.timer <= 0) a.state = 'WALK';
      return;
    }
    if (a.path.length > 0) {
      this.walk(a, deltaMs);
      // Si acaba de llegar, decide ya: nadie se queda un frame encima de otro.
      if (a.path.length > 0) return;
    }
    a.moving = false;
    if (a.vanish) return;
    if (a.leader) {
      this.followLeader(a, clock);
      return;
    }
    if (!a.staying) {
      this.arrive(a);
      return;
    }
    // Nadie del grupo se queda atrás: la parada empieza a contar cuando han llegado todos.
    if (this.companions(a).some((c) => !c.settled)) return;
    a.timer -= deltaMs;
    if (a.timer <= 0) this.moveOn(a, clock);
  }

  /** Llega al final del camino: si es un sitio para estar, se queda; si no, entra o se va. */
  private arrive(a: Walker): void {
    if (!a.stayPoint) {
      a.vanish = true;
      return;
    }
    a.staying = true;
    a.point = a.stayPoint;
    a.state = a.rule!.stayState ?? 'STAY';
    const facing = this.loc.points?.[a.stayPoint]?.facing;
    if (facing) a.dir = facing;
    const [lo, hi] = a.rule!.stay ?? [3, 10];
    a.timer = between(this.rng, lo, hi) * MS_PER_GAME_MINUTE;
  }

  /**
   * Quien acompaña: al llegar se pone al lado; si el grupo entraba en algún
   * sitio, entra detrás. Si al lado no cabe nadie, se despide y sigue solo.
   */
  private followLeader(a: Walker, clock: Clock): void {
    const leader = a.leader!;
    if (a.settled) return;
    if (!leader.stayPoint) {
      a.vanish = true;
      return;
    }
    const at = this.pointAt(leader.stayPoint);
    const side = this.sideTile(at);
    if (!side) {
      const to = this.pickEnd({ types: ['residence'], edge: true }, clock, leader.stayPoint, false);
      const path = to ? route(leader.stayPoint, to) : null;
      if (!path) this.pathFailures++;
      a.leader = undefined;
      a.vanish = true;
      a.path = path ? path.slice(1) : [];
      return;
    }
    a.settled = true;
    a.state = 'TALK';
    a.path = [side];
    a.dir = facingTo(side, at);
  }

  /** Se acaba la parada: a otro sitio (then) o a casa o fuera; el grupo detrás, en fila. */
  private moveOn(a: Walker, clock: Clock): void {
    const from = a.stayPoint!;
    const to = this.pickEnd(a.rule!.then ?? { types: ['residence'], edge: true }, clock, from, false);
    const path = to ? route(from, to) : null;
    this.release(a);
    a.staying = false;
    a.state = 'WALK';
    a.vanish = true;
    if (!path) this.pathFailures++;
    a.path = path ? path.slice(1) : [];
    const at = this.pointAt(from);
    this.companions(a).forEach((c, i) => {
      c.leader = undefined;
      c.settled = false;
      c.vanish = true;
      c.state = 'WALK';
      c.point = undefined;
      c.path = [at, ...(path ? path.slice(1) : [])];
      c.delay = (i + 1) * between(this.rng, 350, 650);
    });
  }

  private walk(a: Walker, deltaMs: number): void {
    if (this.atCrossing(a)) return;
    const target = a.path[0];
    const dx = target.tx - a.x;
    const dy = target.ty - a.y;
    const dist = Math.hypot(dx, dy);
    const reach = stride(a, deltaMs, a.path.length === 1 ? dist : Infinity);
    a.moving = true;
    if (dist > 0) a.dir = facingTo({ tx: a.x, ty: a.y }, target);
    if (dist > reach) {
      a.x += (dx / dist) * reach;
      a.y += (dy / dist) * reach;
      return;
    }
    a.x = target.tx;
    a.y = target.ty;
    a.path.shift();
    if (a.waitAt === target) {
      // En su sitio del bordillo: espera mirando a la calzada hasta que el muñeco se ponga verde.
      a.waitAt = undefined;
      a.hold = a.cross!.signal;
      a.dir = a.cross!.dir === 1 ? 'down' : 'up';
      a.moving = false;
      a.state = 'WAIT';
      return;
    }
    if (a.path.length === 0) {
      a.moving = false;
      if (a.settled && a.leader?.stayPoint) a.dir = facingTo(target, this.pointAt(a.leader.stayPoint));
      if (a.face) a.dir = facingTo(target, a.face);
      a.face = undefined;
    } else if (a.path.length === a.pauseAt && !this.onRoadway(target)) {
      a.pauseAt = -1;
      a.moving = false;
      a.state = 'WAIT';
      a.timer = between(this.rng, 1_500, 4_000);
    }
  }

  /**
   * Semáforos: quien espera sigue esperando hasta el verde; quien se acerca a
   * unas bandas con el muñeco en rojo (o parpadeando) va a un sitio libre del
   * bordillo y espera allí. Con verde sigue su camino de siempre. Devuelve si
   * se queda quieto este frame.
   */
  private atCrossing(a: Walker): boolean {
    if (a.hold) {
      if (signalAt(a.hold, this.signalMinute).walk !== 'walk') {
        a.moving = false;
        return true;
      }
      a.hold = undefined;
      a.state = 'WALK';
    }
    if (this.signals.length === 0 || a.waitAt) return false;
    const target = a.path[0];
    if (a.crossFor !== target) {
      a.crossFor = target;
      const hit = crossingOf(this.signals, { tx: a.x, ty: a.y }, target);
      a.cross = hit && { signal: hit.signal, dir: hit.dir, at: { tx: a.x + (target.tx - a.x) * hit.enter, ty: a.y + (target.ty - a.y) * hit.enter } };
    }
    const c = a.cross;
    if (!c || Math.hypot(c.at.tx - a.x, c.at.ty - a.y) > 1.6) return false;
    if (signalAt(c.signal, this.signalMinute).walk === 'walk') return false;
    // Sin sitio libre en el bordillo, espera donde está si es acera y nadie más está ahí.
    const spot = this.waitSpot(c.signal, c.dir, c.at) ?? this.standHere(a);
    if (!spot) return false;
    a.waitAt = spot;
    a.path.unshift(spot);
    return false;
  }

  /** Su propio tile, si vale para quedarse quieto: pisable, fuera de la calzada y libre. */
  private standHere(a: Walker): TilePoint | undefined {
    const tile = { tx: Math.round(a.x), ty: Math.round(a.y) };
    if (!isWalkable(this.loc, tile.tx, tile.ty) || this.onRoadway(tile) || this.occupiedTiles().has(`${tile.tx},${tile.ty}`)) return undefined;
    return tile;
  }

  /** El sitio libre del bordillo más cerca de por donde iba a cruzar. */
  private waitSpot(sig: SignalDef, dir: 1 | -1, near: TilePoint): TilePoint | undefined {
    const key = `${sig.id}:${dir}`;
    let spots = this.spots.get(key);
    if (!spots) this.spots.set(key, (spots = waitSpots(this.loc, sig, dir)));
    const taken = this.occupiedTiles();
    return spots
      .filter((p) => !taken.has(`${p.tx},${p.ty}`))
      .sort((p, q) => Math.hypot(p.tx - near.tx, p.ty - near.ty) - Math.hypot(q.tx - near.tx, q.ty - near.ty))[0];
  }

  // ------------------------------------------------------ personal de terraza

  private walkers(): Walker[] {
    return this.agents.filter((a) => a.kind !== 'staff');
  }

  /**
   * El camarero de la terraza sale por la puerta de su local cuando abre (y,
   * con minLevel, cuando hay gente dentro) y entra al cerrar. Sólo trabaja
   * fuera: dentro ya está el suyo (data/population.ts).
   */
  private staffShift(clock: Clock): void {
    for (const post of this.profile.staff ?? []) {
      const place = placeInfo(post.place)!;
      const profile = profileFor(post.place);
      const level = profile ? levelAt(place, profile, clock) : isOpen(place, clock.day, clock.hour, clock.minute) ? 'MEDIUM' : null;
      const onDuty = level !== null && (!post.minLevel || LEVELS.indexOf(level) >= LEVELS.indexOf(post.minLevel));
      const here = this.agents.find((a) => a.post === post && !a.vanish);
      if (onDuty && !here) this.addStaff(post);
      if (!onDuty && here) {
        here.state = 'WALK';
        here.vanish = true;
        here.path = this.gridPath(here, this.pointAt(post.base));
      }
    }
  }

  private addStaff(post: StreetPost): void {
    const who = identity(post);
    const w = this.newWalker(undefined, this.pointAt(post.base), []);
    Object.assign(w, { kind: 'staff', role: post.service, label: who.label, line: who.line, uniform: who.look, post, state: 'WORK', dir: 'down' });
    w.timer = between(this.rng, 2_000, 5_000);
  }

  /** Espera en la puerta; cada poco, va junto al cliente de la terraza que lleva más rato sin que le atiendan y vuelve. */
  private advanceStaff(a: Walker, deltaMs: number): void {
    if (a.path.length > 0) {
      this.walk(a, deltaMs);
      if (a.path.length > 0) return;
    }
    a.moving = false;
    if (a.vanish) return;
    a.timer -= deltaMs;
    if (a.timer > 0) return;
    const post = a.post!;
    if (a.state === 'SERVE') {
      a.state = 'WORK';
      a.path = this.gridPath(a, this.pointAt(post.base));
      a.timer = between(this.rng, 4_000, 9_000);
      return;
    }
    const seated = this.agents.filter((c) => c.staying && c.stayPoint && post.serves.some((p) => c.stayPoint!.startsWith(p)));
    const customer = nextCustomer(seated.map((c) => ({ id: c.id, x: c.x, y: c.y })), this.served, this.elapsed);
    const taken = this.occupiedTiles();
    const tile = customer && besideTile(this.loc, { tx: customer.x, ty: customer.y }, taken);
    if (customer && tile && !this.onRoadway(tile)) {
      this.served.set(customer.id, this.elapsed);
      a.state = 'SERVE';
      a.face = { tx: customer.x, ty: customer.y };
      a.path = this.gridPath(a, tile);
      a.timer = between(this.rng, 2_500, 4_000);
      return;
    }
    a.timer = between(this.rng, 3_000, 7_000);
  }

  /** Camino por tiles (el personal no sigue el grafo: va de la puerta a la mesa y vuelve). */
  private gridPath(a: Walker, to: TilePoint): TilePoint[] {
    const path = tilePath(this.loc, { tx: Math.round(a.x), ty: Math.round(a.y) }, to);
    if (!path) this.pathFailures++;
    return path ? path.slice(1) : [];
  }

  // -------------------------------------------------------------- viajes

  /** Sale alguien (o un grupo) a hacer un viaje que tenga sentido ahora. Midway: ya iba de camino. */
  private startTrip(clock: Clock, player: TilePoint, target: number, midway: boolean, fromPoint?: string): void {
    const rule = this.pickRule(clock, fromPoint);
    if (!rule) return;
    const from = fromPoint ?? this.pickEnd(rule.from, clock, undefined, false);
    if (!from) return;
    const to = this.pickEnd(rule.to, clock, from, true);
    if (!to) return;
    // Nadie sale por la puerta que tapa el jugador.
    if (!midway && distance(this.pointAt(from), player) < POPULATION.doorClearance) return;
    // Con `via`, el viaje pasa por esos puntos (en un sentido o en el otro): el paseo cruza el parque.
    const stops = rule.via ? [from, ...(this.rng() < 0.5 ? rule.via : [...rule.via].reverse()), to] : [from, to];
    const full = routeThrough(stops);
    if (!full || full.length < 2) {
      if (!full) this.pathFailures++;
      return;
    }
    const stays = !['entrance', 'edge'].includes(this.loc.points?.[to]?.kind ?? '');
    const [gLo, gHi] = rule.group ?? [1, 1];
    const size = Math.max(1, Math.min(gLo + Math.floor(this.rng() * (gHi - gLo + 1)), target - this.walkers().length));

    // A mitad de viaje: parados ya en su sitio, o en un tramo del camino.
    let path = full.slice(1);
    let at: TilePoint = full[0];
    let seated = false;
    if (midway) {
      if (stays && this.rng() < 0.45) {
        at = full[full.length - 1];
        path = [];
        seated = true;
      } else {
        const k = Math.floor(this.rng() * (full.length - 1));
        const t = this.rng();
        at = { tx: full[k].tx + (full[k + 1].tx - full[k].tx) * t, ty: full[k].ty + (full[k + 1].ty - full[k].ty) * t };
        path = full.slice(k + 1);
      }
      if (distance(at, player) < POPULATION.spawnClearance) return;
    }

    const leader = this.newWalker(rule, at, path);
    if (stays) {
      leader.stayPoint = to;
      this.reserved.set(to, leader.id);
    }
    if (rule.pace === 'jog') {
      leader.speed = between(this.rng, ...JOG_SPEED);
      leader.gait = 'jog';
    } else if (rule.pace === 'stroll') leader.speed = between(this.rng, ...STROLL_SPEED);
    if (rule.dog) leader.dog = Math.floor(this.rng() * DOG_LOOKS);
    if (size === 1 && !seated && path.length > 2 && this.rng() < (rule.pause ?? PAUSE_CHANCE)) {
      leader.pauseAt = 1 + Math.floor(this.rng() * (path.length - 2));
    }
    if (seated) {
      this.arrive(leader);
      leader.timer *= 0.2 + this.rng() * 0.8;
    }

    for (let i = 1; i < size; i++) {
      const c = this.newWalker(rule, at, [...path]);
      c.leader = leader;
      c.speed = leader.speed;
      c.delay = seated ? 0 : i * between(this.rng, 350, 650);
      if (seated) {
        // Ya en el corrillo: directamente en su sitio al lado (o, si no cabe, ya de camino a otra parte).
        this.followLeader(c, clock);
        if (c.settled) {
          const side = c.path.pop()!;
          c.x = side.tx;
          c.y = side.ty;
        }
      }
    }
  }

  /** Un viaje que tenga sentido ahora (y, con `fromPoint`, que pueda empezar ahí: quien sale del metro). */
  private pickRule(clock: Clock, fromPoint?: string): TripRule | undefined {
    const t = hourOf(clock);
    const weekend = weekIndex(logicalDay(clock)) >= 5;
    const rhythm = rhythmAt(clock.day, clock.hour);
    const weighted: [TripRule, number][] = [];
    for (const rule of this.profile.trips) {
      if (!inHours(rule.hours, t)) continue;
      if (rule.days === 'weekday' && weekend) continue;
      if (rule.days === 'weekend' && !weekend) continue;
      if (rule.rhythms && !rule.rhythms.includes(rhythm)) continue;
      // Tope por tipo: el escaparate o la boca del metro no se llenan de golpe.
      if (rule.max && this.agents.filter((a) => a.rule === rule && !a.leader).length >= rule.max) continue;
      // Un viaje pesa lo que su regla por lo que tiran sus extremos: a una discoteca vacía no va nadie.
      const from = this.candidates(rule.from, clock, false);
      if (fromPoint && !from.some((c) => c.id === fromPoint)) continue;
      const to = this.candidates(rule.to, clock, true);
      if (from.length === 0 || to.length === 0) continue;
      weighted.push([rule, rule.weight * mean(from) * mean(to) * weatherBias(rule, this.weather)]);
    }
    return pick(this.rng, weighted);
  }

  private pickEnd(ends: Ends, clock: Clock, not: string | undefined, destination: boolean): string | undefined {
    const options = this.candidates(ends, clock, destination).filter((c) => c.id !== not);
    return pick(this.rng, options.map((c) => [c.id, c.weight] as const));
  }

  /** Puntos del grafo que valen como extremo ahora mismo, con lo que tira cada uno. */
  private candidates(ends: Ends, clock: Clock, destination: boolean): Candidate[] {
    const out: Candidate[] = [];
    if (ends.edge) for (const id of this.edges) out.push({ id, weight: 1 });
    for (const place of this.places) {
      const matches = ends.types?.includes(place.type) || ends.tags?.some((tag) => place.tags.includes(tag));
      if (!matches) continue;
      const weight = pull(place, clock);
      if (weight > 0) for (const id of place.entrances) if (this.graph.has(id)) out.push({ id, weight });
    }
    for (const id of this.graphPoints(ends.points ?? [])) {
      const weight = pull(placeOfPoint(id), clock);
      if (weight > 0) out.push({ id, weight });
    }
    // Un sitio para estar tiene que estar libre (ni reservado ni con alguien del corrillo encima); una puerta o un borde, no.
    if (!destination) return out;
    const busy = this.occupiedTiles();
    return out.filter((c) => {
      const p = this.loc.points![c.id];
      const stay = p.kind !== 'entrance' && p.kind !== 'edge';
      return !stay || (!this.reserved.has(c.id) && !this.claimed.has(c.id) && !busy.has(`${p.tx},${p.ty}`));
    });
  }

  // -------------------------------------------------------- altas y bajas

  private newWalker(rule: TripRule | undefined, at: TilePoint, path: TilePoint[]): Walker {
    // Cada zona atrae su ropa (data/districts.ts, crowd): se mira a dónde va. Mejor alguien que aún no está en la calle.
    const used = new Set(this.agents.map((a) => a.look));
    const dest = path[path.length - 1] ?? at;
    const weights = lookWeights(PASSENGER_LOOKS, profileAt(this.loc, Math.round(dest.tx), Math.round(dest.ty)));
    const free = weights.map((w, i) => (used.has(i) ? 0 : w));
    const look = pick(this.rng, (free.some((w) => w > 0) ? free : weights).map((w, i) => [i, w] as const)) ?? 0;
    const walker: Walker = {
      id: this.nextId++, kind: 'visitor', role: rule?.role ?? '', label: rule?.label ?? '', line: rule?.line ?? '', look,
      x: at.tx, y: at.ty, dir: 'down', moving: false, state: 'WALK',
      // Con lluvia se aprieta el paso.
      speed: between(this.rng, ...POPULATION.walkSpeed) * (this.weather.rain > 0.08 ? 1.2 : 1), path, timer: 0, plan: [], leaveSoon: false, leaving: false,
      rule, staying: false, vanish: false, delay: 0, settled: false, pauseAt: -1,
    };
    this.agents.push(walker);
    return walker;
  }

  private release(a: Walker): void {
    if (a.stayPoint && this.reserved.get(a.stayPoint) === a.id) this.reserved.delete(a.stayPoint);
    a.stayPoint = undefined;
    a.point = undefined;
  }

  private companions(a: Walker): Walker[] {
    return this.agents.filter((c) => c.leader === a);
  }

  // --------------------------------------------------------- puntos y tiles

  /** Tiles donde está quien está quieto y a donde va quien camina. */
  private occupiedTiles(): Set<string> {
    const taken = new Set<string>();
    for (const a of this.agents) {
      // Quien espera en un semáforo, o va a esperar, ocupa su sitio del bordillo.
      if (a.waitAt) taken.add(`${a.waitAt.tx},${a.waitAt.ty}`);
      if (a.hold) taken.add(`${Math.round(a.x)},${Math.round(a.y)}`);
      const end = a.path[a.path.length - 1] ?? { tx: Math.round(a.x), ty: Math.round(a.y) };
      taken.add(`${end.tx},${end.ty}`);
    }
    return taken;
  }

  /** Un tile libre junto al punto para quien acompaña: pisable, fuera de la calzada y sin nadie. */
  private sideTile(at: TilePoint): TilePoint | undefined {
    const taken = this.occupiedTiles();
    for (const id of [...this.reserved.keys(), ...this.claimed]) {
      const p = this.loc.points?.[id];
      if (p) taken.add(`${p.tx},${p.ty}`);
    }
    const around: readonly (readonly [number, number])[] = [[-1, 0], [1, 0], [0, 1], [0, -1], [-1, 1], [1, 1], [-1, -1], [1, -1]];
    for (const [dx, dy] of around) {
      const tile = { tx: at.tx + dx, ty: at.ty + dy };
      if (!isWalkable(this.loc, tile.tx, tile.ty) || this.onRoadway(tile) || taken.has(`${tile.tx},${tile.ty}`)) continue;
      // En diagonal, sólo si no hay que atravesar una esquina.
      if (dx !== 0 && dy !== 0 && (!isWalkable(this.loc, at.tx + dx, at.ty) || !isWalkable(this.loc, at.tx, at.ty + dy))) continue;
      return tile;
    }
    return undefined;
  }

  private onRoadway(tile: TilePoint): boolean {
    return ROADWAY.has(this.loc.ground[Math.round(tile.ty)]?.[Math.round(tile.tx)] ?? '');
  }

  /**
   * Destinos de un viaje por prefijo. El puesto de quien trabaja nunca lo es:
   * MOLINILLO_TERRACE_ vale por las mesas, no por MOLINILLO_TERRACE_WAITER.
   */
  private graphPoints(prefixes: readonly string[]): string[] {
    const points = this.loc.points ?? {};
    return [...this.graph].filter((id) => points[id]?.kind !== 'work' && prefixes.some((p) => id.startsWith(p)));
  }

  private pointAt(id: string): TilePoint {
    const p = this.loc.points?.[id];
    if (!p) throw new Error(`[${this.loc.id}] punto desconocido ${id}`);
    return { tx: p.tx, ty: p.ty };
  }
}

/** Camino por el grafo que pasa por cada parada en orden; null si algún tramo no existe. */
function routeThrough(stops: readonly string[]): TilePoint[] | null {
  let full: TilePoint[] = [];
  for (let i = 1; i < stops.length; i++) {
    if (stops[i] === stops[i - 1]) continue;
    const leg = route(stops[i - 1], stops[i]);
    if (!leg) return null;
    full = full.length ? [...full, ...leg.slice(1)] : leg;
  }
  return full.length ? full : null;
}

function facingTo(from: TilePoint, to: TilePoint): Facing {
  const dx = to.tx - from.tx;
  const dy = to.ty - from.ty;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}

function distance(a: TilePoint, b: TilePoint): number {
  return Math.hypot(a.tx - b.tx, a.ty - b.ty);
}

function mean(list: readonly Candidate[]): number {
  return list.reduce((s, c) => s + c.weight, 0) / list.length;
}

function pick<T>(rng: Rng, weighted: readonly (readonly [T, number])[]): T | undefined {
  const total = weighted.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return undefined;
  let roll = rng() * total;
  for (const [item, w] of weighted) {
    roll -= w;
    if (roll < 0) return item;
  }
  return weighted[weighted.length - 1][0];
}
