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
import { zoneAt, zonePull } from './Zones.ts';
import { StreetPickpocket } from './Pickpocket.ts';
import { activePopUp, popUpCrowd } from './PopUps.ts';
import { bondMates, IDENTITIES, OUTFIT_CLASH, outfitOf, outfitsOf, paceOf, relationLine, roleAffinity } from './People.ts';
import type { Bond, RelationType } from '../data/identity.ts';
import { crossingOf, signalAt, waitSpots } from './Signals.ts';
import { SeatRegistry } from './SeatRegistry.ts';
import { TableService } from './TableService.ts';
import { FREEZING_BELOW, HEAVY_RAIN, outdoorAppeal, SCORCHING_ABOVE, weatherAt, type Weather } from './Weather.ts';
import type { StreetSurvivor, SurvivalState } from '../data/streetSurvival.ts';
import { planFor, survivorsOf, type SurvivalPlan } from './StreetSurvival.ts';
import { aheadBlocked, nearestReachable, offCamera, RECOVERY, StuckWatch, tileKey, type RecoveryLevel } from './Recovery.ts';
import { absMinute, dueOut, enterPlace, insideLooks, type Handoff } from './Handoff.ts';

/**
 * El tiempo en la calle: con lluvia o frío hay menos gente (quien puede, se
 * queda dentro); con calor, algo más. Chaparrón: menos de dos tercios.
 */
export function streetWeatherScale(w: Weather): number {
  const rain = w.rain > HEAVY_RAIN ? 0.6 : w.rain > 0.08 ? 0.8 : 1;
  // Helada u ola de calor (mediodía de julio): menos aún; el frío y el calor normales, como siempre.
  const temp = w.celsius < FREEZING_BELOW ? 0.7 : w.celsius >= SCORCHING_ABOVE ? 0.8 : w.temp === 'cold' ? 0.85 : w.temp === 'warm' ? 1.1 : 1;
  return rain * temp;
}

/** Viaje de estar fuera: sentarse en una terraza o un banco, pasear, correr, mirar escaparates. */
const outdoorLeisure = (rule: TripRule): boolean => (!!rule.stay && !!rule.to.points) || rule.pace !== undefined;
/** Una reserva a la que no se llega en este tiempo (ms de reloj de la calle) se da por perdida. */
const RESERVE_TTL_MS = 300_000;

/** Viaje a cubierto: un bar,una tienda, la discoteca, el metro. */
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
  // Un evento en la calle (mercadillo, cola, DJ) trae gente de más, y el tope sube con él.
  const extra = popUpCrowd(profile.location, clock);
  return Math.min(wanted + extra, profile.maxWalkers + extra);
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
  /** Lejos del jugador: ms acumulados hasta su siguiente paso grueso. */
  farMs?: number;
  /** En grupo: qué tipo de grupo es y, para quien acompaña, qué es de quien lo lleva (systems/People). */
  bond?: Bond;
  tie?: RelationType;
  /** Quien vive en la calle: quién es (data/streetSurvival.ts) y qué va a hacer al llegar a su sitio. */
  survivor?: StreetSurvivor;
  goal?: SurvivalState;
  /** Ms que lleva esperando en un semáforo: pasado RECOVERY.holdMs, ya no es esperar (systems/Recovery). */
  heldMs?: number;
  /** Punto al que va cuando no se queda (una puerta o un borde): al cruzar una puerta con interior, entra (systems/Handoff). */
  dest?: string;
  /** Hace de carterista o de víctima de un robo en curso (systems/Pickpocket): su viaje espera hasta que acabe. */
  incident?: 'thief' | 'victim';
}

/**
 * Simulación completa sólo cerca del jugador (en tiles, por eje: más que media
 * pantalla a cualquier zoom de juego). Más lejos, cada paseante avanza cada
 * FAR_STEP_MS con el tiempo acumulado: mismo camino, menos trabajo por frame.
 */
const FULL_SIM_RADIUS = 30;
const FAR_STEP_MS = 150;
/** Hasta dónde (tiles) el jugador ve a alguien entrar por una puerta: más o menos lo que cabe en pantalla. */
const WITNESS_TILES = 14;

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
  /** Vigía de atascos (systems/Recovery). */
  readonly watch = new StuckWatch();
  /** Obstáculos temporales (un tile cortado): nadie entra en ellos y los rodeos los esquivan. */
  readonly blocked = new Set<string>();
  private player: TilePoint = { tx: -999, ty: -999 };
  /** Minuto absoluto de juego (systems/Handoff.absMinute). */
  private now = 0;
  /** Calzada, carril bici y vías sin paso de cebra: ningún rodeo de recuperación pasa por ahí. */
  private roadTiles?: Set<string>;
  private readonly loc: LocationDef;
  private readonly profile: StreetProfile;
  private readonly places: PlaceInfo[];
  private readonly graph: Set<string>;
  private readonly edges: string[];
  private rng: Rng;
  private readonly baseRng: Rng;
  /** Quién tiene cada asiento o sitio para estar (reservado de camino u ocupado): uno, nunca dos. */
  readonly seats = new SeatRegistry();
  /** Servicio de mesa de la terraza (el mismo que dentro): mesas, comandas, cuenta y su camarero. Null si la calle no tiene. */
  readonly service: TableService | null;
  private claimed: ReadonlySet<string> = new Set();
  /** Personas (índice de aspecto = identidad) que ahora mismo están en otro sitio de la escena: el corro de una pelea, un trapicheo. */
  private elsewhere: ReadonlySet<number> = new Set();
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

  /** Los robos de la calle (systems/Pickpocket): raros, sólo con mucha gente alrededor y en zonas que lo permiten. */
  readonly pickpocket: StreetPickpocket;

  constructor(loc: LocationDef, profile: StreetProfile, rng: Rng = Math.random) {
    this.loc = loc;
    this.pickpocket = new StreetPickpocket({
      location: loc.id,
      people: () => this.agents,
      zoneAt: (tx, ty) => zoneAt(loc.id, tx, ty),
      approach: (thief, at) => {
        const a = thief as Walker;
        const side = this.sideTile(at) ?? at;
        const path = this.detour({ tx: a.x, ty: a.y }, side);
        if (!path) return false;
        // Deja lo que hacía (un banco, una parada) y va hacia la víctima: su viaje espera (Walker.incident).
        this.release(a);
        a.staying = false;
        a.settled = false;
        a.timer = 0;
        a.delay = 0;
        a.state = 'WALK';
        a.path = path;
        return true;
      },
      leave: (thief, run) => {
        const a = thief as Walker;
        const edge = this.nearestEdge({ tx: a.x, ty: a.y });
        const path = edge ? this.detour({ tx: a.x, ty: a.y }, this.pointAt(edge)) : null;
        if (!path) return false;
        this.release(a);
        a.staying = false;
        a.settled = false;
        a.timer = 0;
        a.delay = 0;
        a.state = 'WALK';
        a.vanish = true;
        a.path = path;
        // Lo han visto: corre. Si no, se aleja como cualquiera.
        if (run) {
          a.gait = 'jog';
          a.speed = Math.max(a.speed, between(this.rng, ...JOG_SPEED));
        }
        return true;
      },
    });
    this.loc = loc;
    this.profile = profile;
    this.rng = rng;
    this.baseRng = rng;
    this.graph = new Set((loc.links ?? []).flat());
    this.signals = loc.signals ?? [];
    this.waves = (profile.bursts ?? []).map(() => ({ pending: 0, release: 0, train: -1 }));
    this.edges = [...this.graph].filter((id) => loc.points?.[id]?.kind === 'edge');
    this.places = PLACES.map((p) => placeInfo(p.id)!).filter((p) => p.locationId === loc.id);
    const terrace = profile.tableService;
    this.service = terrace && loc.tables
      ? new TableService(loc, terrace, {
          agents: this.agents,
          walk: (a, to, face) => {
            const w = a as Walker;
            w.path = this.gridPath(w, to);
            w.face = face;
            if (w.path.length === 0 && face) w.dir = facingTo({ tx: Math.round(w.x), ty: Math.round(w.y) }, face);
          },
          pointAt: (id) => this.pointAt(id),
          isWaiter: (a) => (a as Walker).post?.place === terrace.place,
          // Quien viene a sentarse ya tiene su mesa desde que sale, no sólo al llegar.
          seatOf: (a) => (a as Walker).stayPoint,
        }, () => this.rng())
      : null;
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
    return this.seats.has(point) || this.claimed.has(point);
  }

  claim(points: ReadonlySet<string>): void {
    this.claimed = points;
    for (const a of this.agents) {
      if (!a.stayPoint || !points.has(a.stayPoint)) continue;
      if (a.staying) a.timer = 0;
      else {
        // Iba de camino hacia ahí: cancela, suelta la reserva y no llega; acaba el tramo en que está y se va.
        this.release(a);
        a.path = a.path.slice(0, 1);
      }
    }
  }

  /**
   * Quién está ahora en otro sitio de esta escena (el corro de una pelea, un trapicheo): cada índice de
   * aspecto es una persona (data/identity.ts) y no puede estar en dos sitios a la vez. Quien sale a la calle
   * ya no es nadie de esos; quien ya andaba por ahí con esa cara pasa a ser otra persona, pero sólo fuera
   * de cámara: nadie cambia de cara delante del jugador.
   */
  claimLooks(looks: ReadonlySet<number>): void {
    this.elsewhere = looks;
    if (looks.size === 0) return;
    for (const a of this.agents) {
      if (a.kind !== 'visitor' || a.leader || !looks.has(a.look) || !offCamera({ tx: a.x, ty: a.y }, this.player)) continue;
      const used = this.usedLooks();
      a.look = this.pickLook(a.rule, a.path[a.path.length - 1] ?? { tx: a.x, ty: a.y }, used);
      // Quien iba con esa persona sigue siendo quien era: el grupo ya no es «de» nadie concreto.
      a.bond = undefined;
      a.tie = undefined;
    }
  }

  /** Aspectos que no se pueden repetir: los de la calle, los de quien está en otro sitio de la escena y los de quien está dentro de un local. */
  private usedLooks(): Set<number> {
    const used = new Set(this.agents.map((a) => a.look));
    for (const l of this.elsewhere) used.add(l);
    for (const l of insideLooks(this.now)) used.add(l);
    return used;
  }

  /**
   * Al cruzar una puerta con interior (un local con gente, el metro) delante del jugador, entra de verdad: deja su
   * ficha (systems/Handoff) y, si el jugador entra detrás, está dentro. Quien entra lejos de la vista no la deja.
   */
  private handOff(a: Walker): void {
    if (!a.dest || a.kind !== 'visitor' || this.loc.points?.[a.dest]?.kind !== 'entrance') return;
    const door = this.pointAt(a.dest);
    if (Math.hypot(a.x - door.tx, a.y - door.ty) > 1.5 || distance(door, this.player) > WITNESS_TILES) return;
    enterPlace({
      place: placeOfPoint(a.dest)?.id ?? '', from: this.loc.id, door: a.dest, look: a.look, dressSeed: a.dressSeed ?? a.id,
      role: a.role, label: a.label, line: a.line, at: this.now, roll: this.rng(),
    });
  }

  /** Sale del local por la puerta por la que entró y se va a casa o fuera del barrio. */
  private emerge(h: Handoff, clock: Clock): void {
    // Sólo choca con otro paseante con su cara: el personal va de uniforme y quien vive en la calle tiene la suya.
    if (!this.graph.has(h.door) || this.agents.some((a) => a.kind === 'visitor' && a.look === h.look)) return;
    const to = this.pickEnd({ types: ['residence'], edge: true }, clock, h.door, false);
    const path = to ? route(h.door, to) : null;
    if (!path) return;
    const w = this.newWalker(undefined, this.pointAt(h.door), path.slice(1), h.look);
    Object.assign(w, { role: h.role, label: h.label, line: h.line, dressSeed: h.dressSeed, vanish: true, dest: to });
  }

  /**
   * Reservas huérfanas: de alguien que ya no está, que ya no va a ese sitio o
   * que lleva demasiado reservado sin llegar. Se sueltan; si el dueño seguía
   * por ahí, deja de tener destino y se va al llegar. Nada queda bloqueado.
   */
  private sweepSeats(): void {
    const freed = this.seats.sweep((owner, seat, state, age) => {
      const a = this.agents.find((x) => x.id === owner);
      if (!a || a.vanish || a.stayPoint !== seat) return false;
      // Quien vive en la calle tiene su sitio aunque tarde en llegar (viene andando desde el otro lado del barrio).
      if (a.kind === 'street') return true;
      return state === 'occupied' ? a.staying : age < RESERVE_TTL_MS;
    });
    for (const { owner } of freed) {
      const a = this.agents.find((x) => x.id === owner);
      if (a) {
        a.stayPoint = undefined;
        a.point = undefined;
        if (a.staying) a.timer = 0;
      }
    }
  }

  // ------------------------------------------------------------- llegada

  /** Al entrar el jugador: la gente ya está a mitad de camino o sentada. Mismo minuto, misma calle. */
  populate(clock: Clock, player: TilePoint): void {
    this.now = absMinute(clock.day, clock.hour, clock.minute);
    this.weather = weatherAt(clock.day, clock.hour + clock.minute / 60);
    this.tickSignals(clock, 0);
    const slot = Math.floor((clock.hour * 60 + clock.minute) / 30);
    this.rng = seededRng(hashSeed('street-populate', this.loc.id, clock.day, slot));
    const target = streetTargetAt(this.profile, clock);
    this.staffShift(clock);
    this.survivorShift(clock, true);
    // Quien sale ahora mismo de un local por su puerta, antes que nadie: su cara no se la queda otro.
    for (const h of dueOut(this.loc.id, this.now)) this.emerge(h, clock);
    for (let tries = 0; this.walkers().length < target && tries < target * 4; tries++) this.startTrip(clock, player, target, true);
    this.rng = this.baseRng;
    this.refresh(clock);
  }

  // --------------------------------------------------------------- tiempo

  update(deltaMs: number, clock: Clock, player: TilePoint): void {
    this.pickpocket.update(deltaMs, player);
    this.weather = weatherAt(clock.day, clock.hour + clock.minute / 60);
    this.tickSignals(clock, deltaMs);
    this.metroWaves(deltaMs, clock, player);
    this.elapsed += deltaMs;
    this.seats.tick(deltaMs);
    this.service?.update(deltaMs, hourOf(clock));
    this.tick -= deltaMs;
    if (this.tick <= 0) {
      this.tick = between(this.rng, ...TICK);
      this.sweepSeats();
      this.reconcile(clock, player);
    }
    this.player = player;
    for (const a of [...this.agents]) {
      // Atascos: quien tiene camino y no avanza. Hablar, la pausa del grupo o una parada breve no cuentan;
      // el semáforo, sólo si la espera pasa de RECOVERY.holdMs (un semáforo que no cambia nunca).
      a.heldMs = a.hold ? (a.heldMs ?? 0) + deltaMs : 0;
      const pausing = a.delay > 0 || (a.timer > 0 && !a.staying && !a.settled && a.kind !== 'staff');
      const active = a.path.length > 0 && !a.talking && !pausing && (!a.hold || a.heldMs > RECOVERY.holdMs);
      const level = this.watch.check(a.id, a.x, a.y, active, deltaMs);
      if (level) this.recover(a, level);
    }
    for (const a of this.agents) {
      // Hablando con el jugador: quieto donde está; su plan sigue al despedirse.
      if (a.talking) a.moving = false;
      else if (a.kind === 'staff') this.advanceStaff(a, deltaMs);
      else if (a.kind === 'street') this.advanceSurvivor(a, deltaMs);
      else if (Math.abs(a.x - player.tx) > FULL_SIM_RADIUS || Math.abs(a.y - player.ty) > FULL_SIM_RADIUS) {
        // Lejos del jugador (y fuera de cámara): el mismo viaje, a pasos gruesos. Nadie lo ve dar saltos.
        a.farMs = (a.farMs ?? 0) + deltaMs;
        if (a.farMs >= FAR_STEP_MS) {
          this.advance(a, a.farMs, clock);
          a.farMs = 0;
        }
      } else {
        if (a.farMs) this.advance(a, a.farMs, clock);
        a.farMs = 0;
        this.advance(a, deltaMs, clock);
      }
    }
    // Quien sale ahora de un local por su puerta (systems/Handoff): la misma persona que entró.
    this.now = absMinute(clock.day, clock.hour, clock.minute);
    for (const h of dueOut(this.loc.id, this.now)) this.emerge(h, clock);
    for (let i = this.agents.length - 1; i >= 0; i--) {
      const a = this.agents[i];
      if (a.vanish && a.path.length === 0 && a.delay <= 0 && !a.talking) {
        this.handOff(a);
        this.release(a);
        this.watch.forget(a.id);
        this.agents.splice(i, 1);
      }
    }
  }

  /** Acerca la gente al objetivo poco a poco: sale uno (o un grupo) cada vez; si sobran, se acortan las paradas. */
  private reconcile(clock: Clock, player: TilePoint): void {
    this.refresh(clock);
    this.staffShift(clock);
    this.survivorShift(clock, false);
    const { target } = this.stats;
    const walking = this.walkers().length;
    if (walking < target) this.startTrip(clock, player, target, false);
    else if (walking > target + 2) {
      const staying = this.agents.filter((a) => a.staying && !a.leader && a.kind === 'visitor').sort((a, b) => b.timer - a.timer);
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
    // En un robo: llegar al final del camino no es irse (systems/Pickpocket decide cuándo).
    if (a.incident) return;
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
    // Comiendo en una mesa con servicio: no se va por su reloj, sino al pagar (si hay quien atienda).
    if (this.service?.holds(a) && this.agents.some((w) => w.kind === 'staff' && !w.vanish && this.service!.drives(w))) return;
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
    this.seats.occupy(a.stayPoint, a.id);
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
    // Un obstáculo temporal justo delante: espera (y el vigía de atascos decide).
    if (aheadBlocked(this.blocked, { tx: a.x, ty: a.y }, target)) {
      a.moving = false;
      return;
    }
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
    // Acabó el rodeo de recuperación: sigue hacia donde iba, por la acera.
    if (a.path.length === 0 && a.resume) {
      const to = a.resume;
      a.resume = undefined;
      a.path = this.detour(target, to) ?? [];
    }
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
    return this.agents.filter((a) => a.kind === 'visitor');
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
        // Se va con la mesa a medias: la suelta (otro camarero no hay) y quien comía se levanta por su reloj.
        here.leaveSoon = true;
        this.service?.drives(here);
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
    // El camarero de las mesas con servicio (Casa Tomás) las atiende como el de dentro: comanda, cocina, mesa, cuenta.
    if (this.service?.drives(a)) {
      this.service.stepWaiter(a, deltaMs);
      return;
    }
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

  // -------------------------------------------------- quien vive en la calle

  /**
   * Quien vive en la calle (data/streetSurvival.ts): sus sitios por horas y, con
   * lluvia, uno a cubierto (systems/StreetSurvival.planFor). Aquí sólo se le
   * lleva: al llegar el jugador ya está en su sitio; si no, entra por el borde
   * más cercano. Va de un sitio a otro por el grafo, como cualquiera (aceras y
   * pasos de cebra, esperando al verde), y cuando no le toca estar se va por un
   * borde. Estados: MOVE andando y, en su sitio, el del plan (SLEEP, SIT, REST,
   * ASK, SHELTER, IDLE). No cuenta para la gente que pasa ni hace viajes.
   */
  private survivorShift(clock: Clock, instant: boolean): void {
    for (const s of survivorsOf(this.loc.id)) {
      const plan = planFor(s, clock, this.weather);
      const a = this.agents.find((w) => w.survivor === s && !w.vanish);
      if (!plan) {
        if (a && !a.talking) this.survivorLeaves(a);
        continue;
      }
      if (!a) {
        this.addSurvivor(s, plan, instant);
        continue;
      }
      a.goal = plan.state;
      // De camino o hablando: el cambio de sitio, al llegar o al despedirse.
      if (a.talking || a.path.length > 0) continue;
      const spot = a.point && plan.spots.includes(a.point) ? a.point : this.freeSpot(plan, a.id);
      if (!spot || spot === a.point) continue;
      const path = a.point ? routeThrough([a.point, spot]) : null;
      this.claimSpot(a, spot);
      a.path = path ? path.slice(1) : this.gridPath(a, this.pointAt(spot));
      a.state = 'MOVE';
      a.staying = false;
    }
  }

  /** El primero de sus sitios que esté libre: ni otro sentado ahí ni otro que vaya. */
  private freeSpot(plan: SurvivalPlan, owner: number): string | undefined {
    return plan.spots.find((id) => (!this.seats.has(id) || this.seats.heldBy(id, owner)) && !this.agents.some((o) => o.id !== owner && (o.point === id || o.stayPoint === id)));
  }

  private claimSpot(a: Walker, spot: string): void {
    if (a.stayPoint) this.seats.release(a.stayPoint, a.id);
    a.point = spot;
    a.stayPoint = spot;
    this.seats.reserve(spot, a.id);
  }

  private addSurvivor(s: StreetSurvivor, plan: SurvivalPlan, instant: boolean): void {
    const spot = this.freeSpot(plan, -1);
    if (!spot) return;
    const at = this.pointAt(spot);
    const edge = this.nearestEdge(at);
    // Su aspecto, el de cualquier vecino: sale de su id, no de quién es.
    const look = Math.abs(hashSeed('street-look', s.id)) % PASSENGER_LOOKS.length;
    // Con su propio azar: que esté o no esté no cambia a nadie más de la calle (ni las simulaciones con semilla).
    const shared = this.rng;
    this.rng = seededRng(hashSeed('street-survivor-walk', s.id));
    const a = this.newWalker(undefined, instant || !edge ? at : this.pointAt(edge), [], look);
    this.rng = shared;
    Object.assign(a, { kind: 'street', role: `street-${s.profiles[0]}`, label: s.label, survivor: s, belongings: s.belongings, dog: s.dog, goal: plan.state });
    a.speed *= 0.8;
    this.claimSpot(a, spot);
    if (instant || !edge) {
      this.settleSurvivor(a);
      return;
    }
    const path = routeThrough([edge, spot]);
    a.path = path ? path.slice(1) : this.gridPath(a, at);
    a.state = 'MOVE';
  }

  /** Recoge y se va por el borde más cercano; si iba de camino, primero llega a donde iba. */
  private survivorLeaves(a: Walker): void {
    const edge = this.nearestEdge({ tx: Math.round(a.x), ty: Math.round(a.y) });
    const out = a.point && edge ? routeThrough([a.point, edge]) : null;
    this.release(a);
    a.vanish = true;
    a.staying = false;
    a.state = 'MOVE';
    a.path = [...a.path, ...(out ? out.slice(1) : [])];
  }

  private settleSurvivor(a: Walker): void {
    a.moving = false;
    a.staying = true;
    if (a.point) {
      this.seats.occupy(a.point, a.id);
      a.dir = this.loc.points?.[a.point]?.facing ?? a.dir;
    }
    a.state = a.goal ?? 'IDLE';
  }

  private advanceSurvivor(a: Walker, deltaMs: number): void {
    if (a.path.length > 0) {
      this.walk(a, deltaMs);
      // Tras cruzar con el verde, el semáforo lo deja en WALK: para quien vive en la calle, andar es MOVE.
      if (a.state === 'WALK') a.state = 'MOVE';
      if (a.path.length > 0 || a.vanish) return;
    }
    if (a.vanish) return;
    if (!a.staying) this.settleSurvivor(a);
    else a.state = a.goal ?? a.state;
  }

  /** El borde del barrio más cerca de ese tile. */
  private nearestEdge(at: TilePoint): string | undefined {
    let best: string | undefined;
    let bestD = Infinity;
    for (const [id, p] of Object.entries(this.loc.points ?? {})) {
      if (p.kind !== 'edge') continue;
      const d = Math.hypot(p.tx - at.tx, p.ty - at.ty);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  // -------------------------------------------------------------- viajes

  /** Sale alguien (o un grupo) a hacer un viaje que tenga sentido ahora. Midway: ya iba de camino. */
  private startTrip(clock: Clock, player: TilePoint, target: number, midway: boolean, fromPoint?: string): void {
    const rule = this.pickRule(clock, fromPoint);
    if (!rule) return;
    const from = fromPoint ?? this.pickEnd(rule.from, clock, undefined, false);
    if (!from) return;
    const to = this.pickEnd(rule.to, clock, from, true, rule.role);
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
    // Un sitio para estar con dueño (de camino o sentado) no se vuelve a elegir, ni en el mismo fotograma.
    if (stays && (this.seats.has(to) || this.claimed.has(to))) return;
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

    // Quién va (data/identity.ts, systems/People.ts): a quien le pega el viaje y, si es en grupo,
    // quien tiene con quién ir; los demás del grupo salen de sus relaciones de ese tipo.
    const dest = full[full.length - 1];
    const bonds = size > 1 ? (rule.bond ?? ['friends']) : undefined;
    const used = this.usedLooks();
    // Primero qué grupo es (el primero de la regla, el más típico, pesa más); luego alguien que tenga con quién.
    const bond = bonds ? pick(this.rng, bonds.map((b, i) => [b, bonds.length - i] as const)) : undefined;
    const leaderLook = this.pickLook(rule, dest, used, bond, size);
    used.add(leaderLook);
    const company = bonds && bond ? this.company(leaderLook, [bond, ...bonds.filter((b) => b !== bond)], size - 1, used) : { bond: undefined, mates: [] };
    const leader = this.newWalker(rule, at, path, leaderLook);
    leader.bond = company.bond;
    if (!stays) leader.dest = to;
    if (stays) {
      leader.stayPoint = to;
      this.seats.reserve(to, leader.id);
      // Se sienta a una mesa con servicio: es suya desde que sale (al llegar, el camarero vendrá).
      if (!seated) this.service?.reserve(to, leader);
    }
    if (rule.pace === 'jog') {
      leader.speed = between(this.rng, ...JOG_SPEED);
      leader.gait = 'jog';
    } else if (rule.pace === 'stroll') leader.speed = between(this.rng, ...STROLL_SPEED);
    // Cada cual a su paso; el grupo, al de quien lo lleva.
    leader.speed *= paceOf(IDENTITIES[leaderLook]);
    if (rule.dog) leader.dog = Math.floor(this.rng() * DOG_LOOKS);
    if (size === 1 && !seated && path.length > 2 && this.rng() < (rule.pause ?? PAUSE_CHANCE)) {
      leader.pauseAt = 1 + Math.floor(this.rng() * (path.length - 2));
    }
    if (seated) {
      this.arrive(leader);
      this.service?.adopt(to, leader);
      leader.timer *= 0.2 + this.rng() * 0.8;
    }

    for (let i = 1; i < size; i++) {
      const mate = company.mates[i - 1];
      const c = this.newWalker(rule, at, [...path], mate?.index);
      if (mate) {
        // Al hablarle nombra a quien lleva el grupo: así se sabe qué son.
        c.tie = mate.type;
        c.bond = company.bond;
        c.line = relationLine(mate.type, IDENTITIES[leaderLook], c.id);
      }
      c.leader = leader;
      c.dest = leader.dest;
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
    // Un evento de la calle en marcha (data/popups.ts): sus viajes sólo valen entonces y los demás siguen igual.
    const popup = activePopUp(this.loc.id, clock)?.id;
    for (const rule of this.profile.trips) {
      if (rule.popup && rule.popup !== popup) continue;
      if (!inHours(rule.hours, t)) continue;
      if (rule.days === 'weekday' && weekend) continue;
      if (rule.days === 'weekend' && !weekend) continue;
      if (rule.rhythms && !rule.rhythms.includes(rhythm)) continue;
      // Tope por tipo: el escaparate o la boca del metro no se llenan de golpe.
      if (rule.max && this.agents.filter((a) => a.rule === rule && !a.leader).length >= rule.max) continue;
      // Un viaje pesa lo que su regla por lo que tiran sus extremos: a una discoteca vacía no va nadie.
      const from = this.candidates(rule.from, clock, false);
      if (fromPoint && !from.some((c) => c.id === fromPoint)) continue;
      const to = this.candidates(rule.to, clock, true, rule.role);
      if (from.length === 0 || to.length === 0) continue;
      weighted.push([rule, rule.weight * mean(from) * mean(to) * weatherBias(rule, this.weather)]);
    }
    return pick(this.rng, weighted);
  }

  private pickEnd(ends: Ends, clock: Clock, not: string | undefined, destination: boolean, role?: string): string | undefined {
    const options = this.candidates(ends, clock, destination, role).filter((c) => c.id !== not);
    return pick(this.rng, options.map((c) => [c.id, c.weight] as const));
  }

  /** Puntos del grafo que valen como extremo ahora mismo, con lo que tira cada uno. */
  private candidates(ends: Ends, clock: Clock, destination: boolean, role?: string): Candidate[] {
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
    // La zona del destino (data/zones.ts) pesa según su hora y su gente: al parque, corredores por la tarde; a la Órbita, de madrugada.
    // Volver a casa o irse del barrio no depende de lo animada que esté la zona: sólo pesa a donde se va a estar.
    if (role !== undefined) {
      for (const c of out) {
        const p = this.loc.points![c.id];
        const type = placeOfPoint(c.id)?.type;
        if (p.kind === 'edge' || type === 'residence' || type === 'home') continue;
        const zone = zoneAt(this.loc.id, p.tx, p.ty);
        if (zone) c.weight *= zonePull(zone, role, clock);
      }
    }
    const busy = this.occupiedTiles();
    return out.filter((c) => {
      const p = this.loc.points![c.id];
      const stay = p.kind !== 'entrance' && p.kind !== 'edge';
      if (!stay) return true;
      // Una mesa con servicio sólo se elige si está libre: es de un grupo hasta que se va y la recogen.
      const table = this.service?.tableOf(c.id);
      if (table && (table.party !== null || table.state !== 'AVAILABLE')) return false;
      return !this.seats.has(c.id) && !this.claimed.has(c.id) && !busy.has(`${p.tx},${p.ty}`);
    });
  }

  // -------------------------------------------------------- quién va

  /**
   * Quién hace el viaje: la ropa que atrae la zona del destino (data/districts.ts,
   * crowd), por lo que le pega a cada cual (edad, intereses, bastón: People.roleAffinity)
   * y, si va en grupo, por tener con quién ir. Nunca alguien que ya está en la calle,
   * si queda otra persona.
   */
  private pickLook(rule: TripRule | undefined, dest: TilePoint, used: ReadonlySet<number>, bond?: Bond, size = 1): number {
    const profile = profileAt(this.loc, Math.round(dest.tx), Math.round(dest.ty));
    const style = lookWeights(PASSENGER_LOOKS, profile).map((w, i) => w * (profile?.fashion?.[IDENTITIES[i].fashion] ?? 1));
    // Ni la misma cara ni la misma ropa que quien ya está en la calle (la cara de lejos es la ropa).
    const worn = outfitsOf(used);
    const weights = style.map((w, i) => {
      if (used.has(i)) return 0;
      let k = w * (rule ? roleAffinity(IDENTITIES[i], rule.role) : 1);
      // En un grupo manda con quién se tiene relación (los acompañantes salen de ella): ahí la ropa no se mira.
      if (!(bond && size > 1) && worn.has(outfitOf(i))) k *= OUTFIT_CLASH;
      if (bond && size > 1 && bondMates(i, bond).every((m) => used.has(m.index))) k *= 0.05;
      return k;
    });
    return pick(this.rng, (weights.some((w) => w > 0) ? weights : style).map((w, i) => [i, w] as const)) ?? 0;
  }

  /** Con quién va: el primer tipo de grupo de la lista para el que tiene gente libre. */
  private company(leader: number, bonds: readonly Bond[], n: number, used: Set<number>): { bond?: Bond; mates: { index: number; type: RelationType }[] } {
    for (const bond of bonds) {
      const free = bondMates(leader, bond).filter((m) => !used.has(m.index));
      if (free.length === 0) continue;
      const mates = free.slice(0, n);
      for (const m of mates) used.add(m.index);
      return { bond, mates };
    }
    return { mates: [] };
  }

  // -------------------------------------------------------- altas y bajas

  private newWalker(rule: TripRule | undefined, at: TilePoint, path: TilePoint[], chosen?: number): Walker {
    const look = chosen ?? this.pickLook(rule, path[path.length - 1] ?? at, this.usedLooks());
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
    if (a.stayPoint) this.seats.release(a.stayPoint, a.id);
    a.stayPoint = undefined;
    a.point = undefined;
  }

  private companions(a: Walker): Walker[] {
    return this.agents.filter((c) => c.leader === a);
  }

  // ------------------------------------------------------- atascos (Recovery)

  /** Tiles que un rodeo no pisa: calzada y carriles (salvo el paso de cebra) y los obstáculos temporales. */
  private avoid(): Set<string> {
    if (!this.roadTiles) {
      this.roadTiles = new Set();
      this.loc.ground.forEach((row, ty) => [...row].forEach((ch, tx) => ROADWAY.has(ch) && ch !== 'z' && this.roadTiles!.add(`${tx},${ty}`)));
    }
    return new Set([...this.roadTiles, ...this.blocked]);
  }

  /** Para quedarse o reaparecer: pisable, en la acera (ni calzada ni carril), sin obstáculo y dentro del mapa. */
  private standable(t: TilePoint): boolean {
    return isWalkable(this.loc, t.tx, t.ty) && !this.onRoadway(t) && !this.blocked.has(tileKey(t));
  }

  /** Camino por tiles de `from` a `to` sin pisar la calzada ni los obstáculos (sin `from`). */
  private detour(from: TilePoint, to: TilePoint): TilePoint[] | null {
    const path = tilePath(this.loc, { tx: Math.round(from.tx), ty: Math.round(from.ty) }, { tx: Math.round(to.tx), ty: Math.round(to.ty) }, this.avoid());
    return path && path.length > 1 ? path.slice(1) : null;
  }

  /**
   * Un peldaño de systems/Recovery. 1: rodeo por la acera hasta donde iba.
   * 2: al tile de acera alcanzable más cerca del destino, y de ahí sigue.
   * 3: deja lo que hacía: quien pasea se va por el borde más cercano, quien
   * vive en la calle se marcha (su horario lo trae luego), el personal vuelve
   * a su puesto. 4: fuera de cámara, quien pasea o vive en la calle sale de
   * la escena y el personal reaparece en su puesto; a la vista, espera.
   */
  private recover(a: Walker, level: RecoveryLevel): void {
    const dest = a.resume ?? a.path[a.path.length - 1];
    const here = { tx: Math.round(a.x), ty: Math.round(a.y) };
    // Quien espera un semáforo que no cambia deja de esperarlo.
    a.hold = undefined;
    a.waitAt = undefined;
    if (level === 1 && dest) {
      const path = this.detour(here, dest);
      if (path) a.path = path;
      return;
    }
    if (level === 2 && dest) {
      const avoid = this.avoid();
      const near = nearestReachable(here, (t) => isWalkable(this.loc, t.tx, t.ty) && !avoid.has(tileKey(t)), (t) => Math.hypot(t.tx - dest.tx, t.ty - dest.ty), (t) => this.standable(t), 12);
      if (near && near.length > 0) {
        a.path = near;
        a.resume = dest;
      }
      return;
    }
    if (level === 3) {
      a.resume = undefined;
      if (a.kind === 'staff') {
        a.path = this.detour(here, this.pointAt(a.post!.base)) ?? [];
        a.state = 'WORK';
        a.timer = 0;
        return;
      }
      if (a.kind === 'street') {
        a.path = [];
        this.survivorLeaves(a);
        if (a.path.length > 0) a.path = this.detour(here, a.path[a.path.length - 1]) ?? a.path;
        return;
      }
      const edge = this.nearestEdge(here);
      this.release(a);
      a.leader = undefined;
      a.staying = false;
      a.vanish = true;
      a.state = 'WALK';
      // Sin rodeo hasta el borde, se queda con el camino que tenía: el peldaño 4 lo saca fuera de cámara.
      a.path = (edge && this.detour(here, this.pointAt(edge))) || a.path;
      return;
    }
    if (level !== 4) return;
    const forced = this.watch.forced(a.id);
    if (!forced && !offCamera(here, this.player)) return;
    if (a.kind === 'staff') {
      const base = this.pointAt(a.post!.base);
      if (!forced && !offCamera(base, this.player)) return;
      a.x = base.tx;
      a.y = base.ty;
      a.path = [];
      a.state = 'WORK';
      a.timer = 0;
      return;
    }
    // Fuera de cámara: sale de escena (el horario o el siguiente viaje traen a otro).
    this.release(a);
    a.vanish = true;
    a.path = [];
    a.delay = 0;
    a.talking = false;
  }

  /** Depuración: corta el tile de delante del más cercano que esté andando y lo da por atascado. Devuelve su id. */
  devForceStuck(near: TilePoint): number | null {
    const walking = this.agents.filter((a) => a.path.length > 0 && !a.talking && !a.hold && a.delay <= 0);
    const d = (a: Walker): number => Math.hypot(a.x - near.tx, a.y - near.ty);
    const a = walking.sort((p, q) => d(p) - d(q))[0];
    if (!a) return null;
    const t = a.path[0];
    const len = Math.hypot(t.tx - a.x, t.ty - a.y) || 1;
    this.blocked.add(tileKey({ tx: a.x + ((t.tx - a.x) / len) * 0.6, ty: a.y + ((t.ty - a.y) / len) * 0.6 }));
    this.watch.force(a.id, a.x, a.y);
    return a.id;
  }

  /** Depuración: quita los obstáculos temporales y el estado de recuperación. */
  devResetRecovery(): void {
    this.blocked.clear();
    this.watch.reset();
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
    for (const id of [...this.seats.seats(), ...this.claimed]) {
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
