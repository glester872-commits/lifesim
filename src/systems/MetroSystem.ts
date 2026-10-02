import Phaser from 'phaser';
import { GAME_MINUTES_PER_REAL_SECOND, MAX_FRAME_MS, TILE } from '../config/constants';
import { CROWD_PROFILES, type MetroConfig } from '../config/metro';
import { DEBUG } from '../config/debug';
import type { MetroDef, NpcDef, NpcLook, TilePoint, Vec2 } from '../types/game';
import { getNpc, PASSENGER_LOOKS } from '../data/npcs';
import { ANNOUNCEMENTS } from '../data/announcements';
import { Walker } from '../entities/Walker';
import { Train, TRAIN_DOOR_OFFSETS, TRAIN_LENGTH } from '../entities/Train';
import type { MetroDebug } from '../ui/MetroDebug';
import type { Announcer } from '../ui/Announcer';
import { TrainSystem, type TrainState } from './TrainSystem';
import { PassengerAI, rand, type PassengerWorld, type SpotPreference, type StationLayout } from './PassengerAI';
import { SecurityAI } from './SecurityAI';
import {
  activeTarget,
  crowdAt,
  hourTag,
  metroDay,
  MicroEventClock,
  pickArchetype,
  securityFor,
  trainWait,
  weekday,
  type CrowdLevel,
  type DelayKind,
  type HourTag,
  type MetroDailyState,
  type MicroEvent,
} from './MetroDaily';

/** Pies del NPC dentro de un tile: centrado en x, casi en el borde inferior. */
const at = (p: TilePoint): Vec2 => ({ x: p.tx * TILE + TILE / 2, y: p.ty * TILE + 13 });
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

const EVENT_LABEL: Readonly<Record<TrainState, string>> = {
  APPROACHING: 'tren en el túnel',
  ARRIVING: 'tren entrando',
  STOPPED: 'tren detenido',
  DOORS_OPENING: 'apertura de puertas',
  BOARDING: 'suben y bajan',
  DOORS_CLOSING: 'aviso de cierre',
  DEPARTING: 'tren saliendo',
  AWAY: 'vía libre',
};

const DEBUG_REFRESH_MS = 250;
/** Cada cuánto se relee el reloj del juego para ajustar la afluencia. */
const CONTEXT_REFRESH_MS = 5_000;

/** Lo que la estación lee del juego: el reloj. GameState lo cumple. */
export interface MetroClock {
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

/**
 * Estación viva: tren, pasajeros y vigilancia de una localización con `metro`.
 * La crea WorldScene y muere con ella. El pool de pasajeros se crea una vez
 * por visita y se recicla: nadie se destruye ni se crea mientras se juega.
 *
 * Rutina + probabilidad + contexto: MetroDailyState fija el carácter del día
 * (determinista por día), la hora del reloj fija la afluencia, y dentro de eso
 * cada visita se juega con azar normal. Los cambios de estado del tren y los
 * microeventos entran por onTrainState() y runEvent(): es donde colgar eventos
 * de estación más adelante.
 */
export class MetroSystem {
  readonly train: TrainSystem;
  /** Puertas con el tren detenido: donde se ofrece subir. */
  readonly doorSpots: readonly Vec2[];
  readonly walkers: readonly Walker[];
  readonly talkers: readonly { sprite: Walker; def: NpcDef }[];
  readonly daily: MetroDailyState;

  private readonly view: Train;
  private readonly passengers: PassengerAI[];
  private readonly guards: SecurityAI[];
  private readonly events: MicroEventClock;
  private readonly layout: StationLayout;
  private readonly cfg: MetroConfig;
  private readonly clock: MetroClock;
  private readonly debug: MetroDebug | null;
  private readonly announcer: Announcer;
  private readonly mapWidth: number;

  private level: CrowdLevel;
  private tag: HourTag;
  private target: number;
  private lastDelay: { kind: DelayKind; delayMs: number } = { kind: 'PUNTUAL', delayMs: 0 };
  private readonly log: string[] = [];
  private contextTimer = CONTEXT_REFRESH_MS;
  private debugTimer = 0;
  /** Plazas del andén ocupadas o reservadas: las comparten pasajeros y jugador (systems/Seating). */
  private seatTaken: boolean[] = [];

  constructor(
    scene: Phaser.Scene,
    stationId: string,
    def: MetroDef,
    mapWidth: number,
    cfg: MetroConfig,
    clock: MetroClock,
    ui: { debug: MetroDebug | null; announcer: Announcer },
    arrivedByTrain: boolean,
  ) {
    this.cfg = cfg;
    this.clock = clock;
    this.debug = ui.debug;
    this.announcer = ui.announcer;
    this.mapWidth = mapWidth;

    this.daily = metroDay(clock.day);
    this.level = crowdAt(this.daily, clock.hour, clock.minute);
    this.tag = hourTag(this.daily, clock.hour, clock.minute);
    this.target = activeTarget(Math.random, this.level);
    this.events = new MicroEventClock(Math.random, this.daily);

    const stopX = Math.round((mapWidth - TRAIN_LENGTH) / 2);
    this.train = new TrainSystem(
      cfg,
      { enterX: mapWidth + TILE, stopX, exitX: -TRAIN_LENGTH - TILE },
      arrivedByTrain,
    );
    this.train.onStateChange = (state) => this.onTrainState(state);
    // La primera espera también varía: nadie entra justo cuando "toca".
    this.train.setWait(rand(cfg.firstArrivalDelay * 0.6, cfg.firstArrivalDelay * 2));

    const top = def.trackRow * TILE;
    this.view = new Train(scene, top, mapWidth, top + TILE * 3);

    const edgeY = def.edgeRow * TILE + 12;
    this.doorSpots = TRAIN_DOOR_OFFSETS.map((offset) => ({ x: stopX + offset, y: edgeY }));

    const walkY = at({ tx: 0, ty: def.walkRow }).y;
    const gateRow = def.gates[0]?.ty ?? Infinity;
    this.layout = {
      entrance: at(def.entrance),
      gates: def.gates.map((g) => ({ gate: at(g), lobby: at({ tx: g.tx, ty: g.ty + 1 }) })),
      walkY,
      edgeY,
      spots: def.waitingSpots.map((p) => ({ at: at(p), front: p.ty === def.walkRow })),
      // Los pies a ras del suelo del banco, como cualquiera sentado (data/seating.ts): la cadera cae en el asiento.
      seats: def.seats.map((p) => ({ x: p.tx * TILE + TILE / 2, y: p.ty * TILE + TILE })),
      signs: def.signSpots.map((s) => ({ at: at(s), facing: s.facing, platform: s.ty < gateRow })),
      doorXs: this.doorSpots.map((d) => d.x),
    };

    const world = this.world();
    this.passengers = Array.from(
      { length: cfg.passengerPool },
      (_, i) => new PassengerAI(new Walker(scene, PASSENGER_LOOKS[i % PASSENGER_LOOKS.length], 'up'), world),
    );
    this.populate();

    const sec = securityFor(this.daily, stationId, this.tag, this.level, def.guards.length);
    const posts = def.guards.slice(0, sec.count);
    this.guards = posts.map(
      (g) =>
        new SecurityAI(
          new Walker(scene, getNpc(g.id), g.facing),
          at(g.post),
          g.facing,
          g.patrol.map(at),
          { patrols: sec.patrols, onPlatform: g.post.ty < gateRow },
          cfg,
        ),
    );
    this.talkers = posts.map((g, i) => ({ sprite: this.guards[i].walker, def: getNpc(g.id) }));
    this.walkers = [...this.passengers.map((p) => p.walker), ...this.guards.map((g) => g.walker)];

    if (arrivedByTrain) this.releaseAlighting(0);
  }

  update(deltaMs: number, timeMs: number): void {
    const dt = Math.min(deltaMs, MAX_FRAME_MS);
    this.train.update(dt);
    this.view.update(this.train, timeMs);
    for (const p of this.passengers) p.update(dt);
    for (const g of this.guards) g.update(dt, this.train);

    this.contextTimer -= dt;
    if (this.contextTimer <= 0) {
      this.contextTimer = CONTEXT_REFRESH_MS;
      this.refreshContext();
    }

    const event = this.events.update(dt, this.level);
    if (event) this.runEvent(event);

    if (!this.debug) return;
    if (!DEBUG.mode) {
      this.debug.hide();
      return;
    }
    this.debugTimer -= dt;
    if (this.debugTimer > 0) return;
    this.debugTimer = DEBUG_REFRESH_MS;
    this.debug.show(this.debugText());
  }

  shutdown(): void {
    this.announcer.hide();
  }

  // --------------------------------------------------------------- contexto

  private refreshContext(): void {
    const { hour, minute } = this.clock;
    this.tag = hourTag(this.daily, hour, minute);
    const level = crowdAt(this.daily, hour, minute);
    if (level === this.level) return;
    this.level = level;
    this.target = activeTarget(Math.random, level);
    this.note(`afluencia → ${level}`);
  }

  /** Arranque: una parte ya espera; otros vienen en el próximo tren o a pie. */
  private populate(): void {
    const profile = CROWD_PROFILES[this.level];
    const waiting = Phaser.Math.Clamp(
      Math.round(this.target * profile.waitingShare + rand(-1, 1)),
      0,
      this.target,
    );
    const riders = profile.alighting[1];
    this.passengers.forEach((p, i) => {
      if (i < waiting) p.startWaiting();
      else if (i < waiting + riders) p.startOffstage(Infinity);
      else p.startOffstage(rand(profile.respawn[0], profile.respawn[1]) * (0.3 + (i - waiting - riders) * 0.25));
    });
  }

  /** Si alguien (un pasajero o el jugador) tiene esa plaza del andén. */
  isSeatTaken(index: number): boolean {
    return this.seatTaken[index] ?? true;
  }

  /** El jugador se sienta en el andén: la misma reserva que la de los pasajeros, que ya no la cogen. */
  takeSeat(index: number): void {
    this.seatTaken[index] = true;
  }

  freeSeat(index: number): void {
    this.seatTaken[index] = false;
  }

  /** Vista compartida de la estación para todos los pasajeros. Se crea una vez. */
  private world(): PassengerWorld {
    const spotTaken = this.layout.spots.map(() => false);
    const seatTaken = (this.seatTaken = this.layout.seats.map(() => false));
    const free = (taken: boolean[], ok: (i: number) => boolean = () => true): number[] =>
      taken.flatMap((t, i) => (!t && ok(i) ? [i] : []));
    const system = this;

    return {
      train: this.train,
      layout: this.layout,
      cfg: this.cfg,
      get profile() {
        return CROWD_PROFILES[system.level];
      },
      get mood() {
        return system.daily.stationMood;
      },
      claimSpot: (pref: SpotPreference) => {
        const spots = this.layout.spots;
        const wanted = free(spotTaken, (i) => pref === 'any' || spots[i].front === (pref === 'front'));
        const any = wanted.length > 0 ? wanted : free(spotTaken);
        // ponytail: sin sitio libre se comparte uno; hay 12 sitios + 4 bancos para 11 activos.
        const index = any.length > 0 ? pick(any) : Phaser.Math.Between(0, spots.length - 1);
        spotTaken[index] = true;
        return index;
      },
      releaseSpot: (index) => {
        if (index >= 0) spotTaken[index] = false;
      },
      claimSeat: () => {
        const seats = free(seatTaken);
        if (seats.length === 0) return -1;
        const index = pick(seats);
        seatTaken[index] = true;
        return index;
      },
      releaseSeat: (index) => {
        if (index >= 0) seatTaken[index] = false;
      },
      canEnter: () => this.passengers.filter((p) => p.walker.visible).length < this.target,
      newcomer: () => ({ archetype: pickArchetype(Math.random, this.daily, this.tag), look: this.freshLook() }),
      talkPartner: (asker) => {
        let best: PassengerAI | null = null;
        let bestDistance = 44;
        for (const p of this.passengers) {
          if (p === asker || !p.idleWaiting) continue;
          const d = Phaser.Math.Distance.Between(p.walker.x, p.walker.y, asker.walker.x, asker.walker.y);
          if (d < bestDistance) {
            bestDistance = d;
            best = p;
          }
        }
        return best;
      },
      exitingNear: (x) =>
        this.passengers.some(
          (p) => p.state === 'EXITING_TRAIN' && Math.abs(p.walker.x - x) < 16 && p.walker.y < this.layout.walkY + 7,
        ),
      note: (text) => this.note(text),
    };
  }

  /** Aspecto que ahora mismo nadie lleva en escena, si queda alguno. */
  private freshLook(): NpcLook {
    const inUse = new Set(this.passengers.filter((p) => p.walker.visible).map((p) => p.walker.look.id));
    const unused = PASSENGER_LOOKS.filter((l) => !inUse.has(l.id));
    return pick(unused.length > 0 ? unused : PASSENGER_LOOKS);
  }

  // --------------------------------------------------------------------- tren

  private onTrainState(state: TrainState): void {
    if (state === 'AWAY') {
      this.refreshContext();
      this.target = activeTarget(Math.random, this.level);
      const wait = trainWait(Math.random, this.daily, this.level);
      this.train.setWait(wait.waitMs);
      this.lastDelay = wait;
      if (wait.kind === 'RETRASO_MODERADO' || (wait.kind === 'RETRASO' && Math.random() < 0.5)) {
        this.say('delay');
      }
    }
    if (state === 'BOARDING') {
      this.releaseAlighting(0);
      const event = this.events.arrival(this.level);
      if (event) this.runEvent(event);
    }
  }

  /** Bajan del tren algunos pasajeros del pool, repartidos por las puertas. */
  private releaseAlighting(extra: number): number {
    const [min, max] = CROWD_PROFILES[this.level].alighting;
    const offstage = this.passengers.filter((p) => p.state === 'OFFSTAGE');
    // Primero los que "venían en el tren"; luego cualquiera del pool.
    const pool = [
      ...Phaser.Utils.Array.Shuffle(offstage.filter((p) => p.waitingForTrain)),
      ...Phaser.Utils.Array.Shuffle(offstage.filter((p) => !p.waitingForTrain)),
    ];
    const doors = Phaser.Utils.Array.Shuffle(this.doorSpots.map((d) => d.x));
    const count = Math.min(pool.length, Phaser.Math.Between(min, max) + extra);
    for (let i = 0; i < count; i++) pool[i].alight(doors[i % doors.length]);
    return count;
  }

  // ------------------------------------------------------------ microeventos

  /** Desarrollo: intenta iniciar ahora mismo el evento de carterista. */
  debugPickpocket(): boolean {
    return this.startPickpocket();
  }

  /** Herramienta de desarrollo: fuerza un microevento sin esperar al azar. */
  debugEvent(event: MicroEvent): void {
    this.runEvent(event);
  }

  private startPickpocket(): boolean {
    const people = Phaser.Utils.Array.Shuffle(
      this.passengers.filter((p) => p.idleWaiting),
    );

    if (people.length < 2) {
      this.note(
        `carterista cancelado: sólo ${people.length} pasajero(s) libre(s)`,
      );
      return false;
    }

    const thief = people[0];
    const victim = people[1];

    const noticeChance = {
      COMMUTER: 0.60,
      STUDENT: 0.50,
      TOURIST: 0.45,
      DISTRACTED: 0.20,
      RUSHED: 0.35,
      CALM: 0.70,
      ELDERLY: 0.55,
    } as const;

    const victimNotices =
      Math.random() < noticeChance[victim.archetype];

    const possibleWitnesses = Phaser.Utils.Array.Shuffle(
      this.passengers.filter((p) => {
        if (p === thief || p === victim || !p.idleWaiting) return false;

        return Phaser.Math.Distance.Between(
          p.walker.x,
          p.walker.y,
          victim.walker.x,
          victim.walker.y,
        ) <= 72;
      }),
    );

    const witness = victimNotices
      ? undefined
      : possibleWitnesses.find(
          (p) => Math.random() < noticeChance[p.archetype] * 0.55,
        );

    const observer = victimNotices ? victim : witness;
    const noticed = observer !== undefined;

    const started = thief.pickpocket(
      victim,
      noticed,
      () => {
        // Nadie lo vio: no hay grito ni intervención.
        if (!observer) {
          this.note('carterista: nadie se da cuenta');
          return;
        }

        // -------------------------------------------------- EL GRITO
        if (observer === victim) {
          observer.reactToIncident(
            '¡se da cuenta del robo!',
            '¡Eh! ¡Me han robado!',
          );
          this.note('la víctima grita');
        } else {
          observer.reactToIncident(
            '¡ve al carterista!',
            '¡Eh! ¡Carterista!',
          );
          this.note('un testigo grita');
        }

        // Algunas personas cercanas miran al oír el grito.
        const reactions = Phaser.Utils.Array.Shuffle(
          this.passengers.filter((p) => {
            if (
              p === thief ||
              p === victim ||
              p === observer ||
              !p.idleWaiting
            ) return false;

            return Phaser.Math.Distance.Between(
              p.walker.x,
              p.walker.y,
              victim.walker.x,
              victim.walker.y,
            ) <= 90;
          }),
        ).slice(0, 3);

        for (const p of reactions) {
          p.reactToShout({
            x: thief.walker.x,
            y: thief.walker.y,
          });
        }

        // ------------------------------------------------ SEGURIDAD
        const guard =
          this.guards.length === 0
            ? undefined
            : this.guards.reduce((best, candidate) => {
                const bestD = Phaser.Math.Distance.Between(
                  best.walker.x,
                  best.walker.y,
                  thief.walker.x,
                  thief.walker.y,
                );

                const candidateD = Phaser.Math.Distance.Between(
                  candidate.walker.x,
                  candidate.walker.y,
                  thief.walker.x,
                  thief.walker.y,
                );

                return candidateD < bestD ? candidate : best;
              });

        if (!guard) {
          this.note('detectan al carterista pero no hay seguridad');
          return;
        }

        // Ahora persigue AL CARTERISTA, no a la víctima.
        guard.chase(
          thief.walker,

          // Lo alcanza.
          () => {
            thief.detain();

            observer.reactToIncident(
              'seguridad lo ha detenido',
              '¡Ese es!',
            );

            this.note('seguridad detiene al carterista');
          },

          // El sospechoso consigue llegar a la salida.
          () => {
            if (observer.walker.visible) {
              observer.reactToIncident(
                'el carterista escapa',
                '¡Se ha escapado!',
              );
            }

            this.note('el carterista escapa de seguridad');
          },
        );
      },
    );

    if (started) {
      this.note('carterista: acercándose a una víctima');
    }

    return started;
  }

  private runEvent(event: MicroEvent): void {
    switch (event) {
      case 'ANNOUNCEMENT': {
        const busy = this.level === 'HIGH' || this.level === 'RUSH_HOUR';
        this.say(this.tag === 'night' ? 'night' : busy && Math.random() < 0.6 ? 'busy' : 'general');
        return;
      }
      case 'ZONE_CHANGE': {
        const idle = this.passengers.filter((p) => p.idleWaiting);
        if (idle.length > 0 && pick(idle).changeZone()) this.note('alguien cambia de zona');
        return;
      }
      case 'GUARD_SWEEP': {
        const guard = this.guards.find((g) => g.onPlatform && g.state === 'IDLE');
        if (!guard) return;
        const y = this.layout.walkY + 18;
        const left = { x: 2 * TILE, y };
        const right = { x: this.mapWidth - 2 * TILE, y };
        const farFirst = guard.walker.x < this.mapWidth / 2 ? [right, left] : [left, right];
        if (guard.sweep(farFirst)) this.note('seguridad cruza el andén');
        return;
      }
      case 'PICKPOCKET':
        this.startPickpocket();
        return;
      case 'LATE_RUNNER': {
        const late = this.passengers.find((p) => p.state === 'OFFSTAGE' && !p.waitingForTrain);
        if (!late) return;
        late.enter(true);
        this.note('alguien llega tarde');
        return;
      }
      case 'CROWD_SURGE': {
        const count = this.releaseAlighting(2);
        this.say('surge');
        this.note(`tren muy lleno (bajan ${count})`);
        return;
      }
    }
  }

  private say(kind: keyof typeof ANNOUNCEMENTS): void {
    const minutes = Math.max(1, Math.round((this.train.nextArrivalMs / 1000) * GAME_MINUTES_PER_REAL_SECOND));
    const text = pick(ANNOUNCEMENTS[kind]).replace('{min}', String(minutes));
    this.announcer.say(text);
    this.note(`megafonía (${kind})`);
  }

  private note(text: string): void {
    const hh = String(this.clock.hour).padStart(2, '0');
    const mm = String(this.clock.minute).padStart(2, '0');
    this.log.unshift(`${hh}:${mm} ${text}`);
    this.log.length = Math.min(this.log.length, 4);
  }

  // -------------------------------------------------------------------- debug

  private debugText(): string {
    const { train, daily } = this;
    const visible = this.passengers.filter((p) => p.walker.visible).length;
    const riding = this.passengers.filter((p) => p.state === 'RIDING').length;
    const delay = this.lastDelay.kind === 'PUNTUAL' ? '' : ` (${this.lastDelay.kind} +${(this.lastDelay.delayMs / 1000).toFixed(1)} s)`;
    const next = train.state === 'AWAY' ? `${(train.nextArrivalMs / 1000).toFixed(1)} s${delay}` : 'en curso';
    return [
      `METRO · DEBUG · día ${daily.day} (${weekday(daily.day)})`,
      `día        ${daily.crowdLevel} · ${daily.stationMood} · ${daily.compositionTheme} · retrasos ${Math.round(daily.trainDelayProbability * 100)} %`,
      `ahora      ${this.tag} → ${this.level} · objetivo ${this.target} · en estación ${visible} · a bordo ${riding}`,
      `tren       ${train.state} · siguiente ${next}`,
      `seguridad  ${this.guards.length === 0 ? 'nadie' : this.guards.map((g) => `${g.walker.look.id} ${g.label}`).join(', ')}`,
      `evento     ${this.log[0] ?? EVENT_LABEL[train.state]}`,
      ...this.log.slice(1).map((l) => `           ${l}`),
      '',
      ...this.passengers.filter((p) => p.state !== 'OFFSTAGE').map((p) => `${p.walker.look.id.padEnd(12)}${p.label}`),
    ].join('\n');
  }
}
