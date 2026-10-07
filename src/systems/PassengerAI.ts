import { ARCHETYPES, type MetroConfig } from '../config/metro.ts';
import type { RecoveryLevel } from './Recovery';
import type { Facing, NpcLook, Vec2 } from '../types/game';
import type { Walker } from '../entities/Walker';
import type { TrainSystem } from './TrainSystem';
import { weighted, type Archetype, type ArchetypeParams, type CrowdProfile, type StationMood } from './MetroDaily.ts';

export type PassengerState =
  /** En el pool, fuera de escena. No cuesta nada por frame. */
  | 'OFFSTAGE'
  | 'ENTERING_STATION'
  | 'WALKING_TO_PLATFORM'
  | 'WAITING'
  | 'REACTING_TO_TRAIN'
  | 'BOARDING'
  | 'RIDING'
  | 'EXITING_TRAIN'
  | 'LEAVING_STATION'
  | 'DETAINED';

export type SpotPreference = 'front' | 'back' | 'any';

/** Trazado de la estación ya convertido a píxeles. */
export interface StationLayout {
  entrance: Vec2;
  /** Hueco del torniquete y el punto del vestíbulo justo debajo. */
  gates: readonly { gate: Vec2; lobby: Vec2 }[];
  walkY: number;
  edgeY: number;
  spots: readonly { at: Vec2; front: boolean }[];
  seats: readonly Vec2[];
  signs: readonly { at: Vec2; facing: Facing; platform: boolean }[];
  doorXs: readonly number[];
}

/** Lo que un pasajero necesita del resto de la estación. */
export interface PassengerWorld {
  readonly train: TrainSystem;
  readonly layout: StationLayout;
  readonly cfg: MetroConfig;
  readonly profile: CrowdProfile;
  readonly mood: StationMood;
  claimSpot(pref: SpotPreference): number;
  releaseSpot(index: number): void;
  /** -1 si no queda banco libre. */
  claimSeat(): number;
  releaseSeat(index: number): void;
  /** Hay hueco para otro pasajero con la afluencia de ahora. */
  canEnter(): boolean;
  newcomer(): { archetype: Archetype; look: NpcLook };
  talkPartner(asker: PassengerAI): PassengerAI | null;
  /** Aún sale gente por la puerta más cercana a x. */
  exitingNear(x: number): boolean;
  /** Deja constancia de algo visible (panel de debug). */
  note(text: string): void;
}

export const rand = (min: number, max: number): number => min + Math.random() * (max - min);
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

/** El tren está entrando o en el andén: momento de reaccionar. */
export function trainHere(train: TrainSystem): boolean {
  return (
    train.state === 'ARRIVING' ||
    train.state === 'STOPPED' ||
    train.state === 'DOORS_OPENING' ||
    train.state === 'BOARDING'
  );
}

type Ambient = 'idle' | 'phone' | 'tracks' | 'look' | 'shift' | 'stroll' | 'sign' | 'talk' | 'sit';

/**
 * Un pasajero: máquina de estados sobre un Walker del pool. Cada vez que entra
 * en escena es otra persona (arquetipo y aspecto nuevos), con su propio ritmo.
 *
 * Las acciones se encadenan con go()/hold(): "camina hasta aquí y luego...".
 * Lo que el jugador ve como microeventos (alguien que corre, que pierde el tren,
 * que deja salir antes de entrar) sale de estos parámetros, no de un guion.
 */
export class PassengerAI {
  state: PassengerState = 'OFFSTAGE';
  /** Bajó desde la calle delante del jugador (systems/Handoff): su ficha. */
  handoff?: string;
  /** Qué está haciendo dentro del estado; sólo para leerlo en el debug. */
  activity = '';
  archetype: Archetype = 'CALM';
  readonly walker: Walker;

  private params: ArchetypeParams = ARCHETYPES.CALM;
  private speed = 0;
  private reflex = 1;
  private readonly lane: number;

  private timer = 0;
  private ambientTimer = 0;
  private holdMs = 0;
  private next: (() => void) | null = null;

  private spot = -1;
  private seat = -1;
  private gate: { gate: Vec2; lobby: Vec2 };
  private patience = 0;
  private reactedCycle = 0;
  private willBoard = false;
  private approached = false;
  private doorX = 0;
  private decidedRun = false;
  private forceRun = false;
  private running = false;
  private readonly world: PassengerWorld;

  constructor(walker: Walker, world: PassengerWorld) {
    this.walker = walker;
    this.world = world;
    this.lane = Math.round(rand(-3, 3));
    this.gate = world.layout.gates[0];
  }

  get label(): string {
    return `${this.archetype.slice(0, 4)} ${this.state}${this.activity ? ` · ${this.activity}` : ''}`;
  }

  /** Está en el andén sin hacer nada que no se pueda interrumpir. */
  get idleWaiting(): boolean {
    return this.state === 'WAITING' && !this.walker.moving && this.holdMs <= 0 && this.next === null;
  }

  // ------------------------------------------------------------ arranques

  /** Arranque de escena: ya estaba esperando en el andén. Con `look`, es esa persona (entró desde la calle: systems/Handoff). */
  startWaiting(look?: NpcLook): void {
    this.becomeNewcomer();
    if (look) this.walker.setLook(look);
    this.gate = pick(this.world.layout.gates);
    this.spot = this.world.claimSpot(this.spotPreference());
    this.walker.place(this.world.layout.spots[this.spot].at, 'up');
    this.beginWaiting();
    // Quien ya estaba no reacciona al tren con el que ha llegado el jugador.
    this.reactedCycle = this.world.train.cycle;
    this.ambientTimer = rand(300, 4_000);
  }

  /** Delay Infinity: sólo vuelve bajando de un tren. */
  startOffstage(delay: number): void {
    // Se fue en un tren o por la salida: quien vuelva a salir de este hueco será otra persona.
    this.handoff = undefined;
    this.state = 'OFFSTAGE';
    this.activity = '';
    this.timer = delay;
    this.next = null;
  }

  get waitingForTrain(): boolean {
    return this.state === 'OFFSTAGE' && this.timer === Infinity;
  }

  /** Entra por el vestíbulo. `rush`: llega tarde y va a por el tren que hay. Con `look`, es esa persona (systems/Handoff). */
  enter(rush = false, look?: NpcLook): void {
    this.becomeNewcomer(rush ? 'RUSHED' : undefined);
    if (look) this.walker.setLook(look);
    const { layout } = this.world;
    this.gate = pick(layout.gates);
    this.forceRun = rush;
    this.decidedRun = false;
    this.running = false;
    this.walker.place(layout.entrance, 'up');
    this.state = 'ENTERING_STATION';
    this.activity = rush ? 'con prisa' : '';

    const throughGate = (): void =>
      this.go([this.gateLobby(), this.gatePoint()], () => this.walkToSpot());

    const sign = layout.signs.filter((s) => !s.platform);
    if (!rush && sign.length > 0 && Math.random() < this.params.signInterest) {
      const s = pick(sign);
      this.go([s.at], () => {
        this.activity = 'mira el cartel';
        this.walker.face(s.facing);
        this.hold(rand(1_500, 3_000), throughGate);
      });
      return;
    }
    throughGate();
  }

  /** Baja del tren por una puerta y se va hacia la salida. */
  alight(doorX: number): void {
    this.becomeNewcomer();
    const { layout } = this.world;
    this.gate = pick(layout.gates);
    this.state = 'EXITING_TRAIN';
    this.activity = '';
    this.walker.place({ x: doorX + this.lane, y: layout.edgeY }, 'down');
    this.go([{ x: doorX + this.lane, y: layout.walkY + 8 }], () => this.leave());
  }

  // --------------------------------------------------------------- bucle

  update(deltaMs: number): void {
    if (this.state !== 'OFFSTAGE' && this.state !== 'RIDING') {
      if (this.walker.moving) {
        if (this.walker.step(deltaMs)) this.resume();
      } else if (this.holdMs > 0) {
        this.holdMs -= deltaMs;
        if (this.holdMs <= 0) this.resume();
      }
    }
    this.think(deltaMs);
  }

  private think(deltaMs: number): void {
    const { train } = this.world;

    switch (this.state) {
      case 'OFFSTAGE':
        this.timer -= deltaMs;
        if (this.timer > 0) return;
        if (this.world.canEnter()) this.enter();
        else this.timer = 1_500;
        return;

      case 'RIDING':
        // La mitad vuelve más tarde a pie; la otra, bajando de algún tren.
        if (train.state === 'AWAY') this.startOffstage(Math.random() < 0.5 ? Infinity : this.respawnDelay());
        return;

      case 'ENTERING_STATION':
      case 'WALKING_TO_PLATFORM':
        this.maybeRunForTrain();
        return;

      case 'WAITING':
        if (trainHere(train) && this.reactedCycle !== train.cycle) {
          this.react();
          return;
        }
        if (!this.idleWaiting) return;
        this.ambientTimer -= deltaMs;
        if (this.ambientTimer <= 0) this.ambient();
        return;

      case 'REACTING_TO_TRAIN':
        if (train.state === 'DEPARTING' || train.state === 'AWAY') {
          this.trainGone();
          return;
        }
        if (!this.willBoard || !this.approached || !train.doorsOpen) return;
        if (this.walker.moving || this.holdMs > 0 || this.next) return;
        if (this.world.exitingNear(this.doorX)) {
          // Deja salir antes de entrar.
          this.activity = 'deja salir';
          this.hold(350, null);
          return;
        }
        // La prioridad decide quién se adelanta; los tranquilos ceden el paso.
        this.hold(rand(150, 900) * (1.5 - this.params.trainBoardingPriority), () => this.board());
        return;

      case 'BOARDING':
        // Durante el aviso aún se cuela; con las puertas moviéndose, ya no.
        if (!train.doorsOpen && !train.closingWarning) this.missTrain();
        return;

      case 'EXITING_TRAIN':
      case 'LEAVING_STATION':
        return;
    }
  }

  // ---------------------------------------------------------- andén y tren

  private walkToSpot(): void {
    const { layout } = this.world;
    this.state = 'WALKING_TO_PLATFORM';
    this.activity = '';

    if (this.seat < 0 && this.spot < 0 && this.params.waitingPositionPreference === 'seat') {
      this.seat = this.world.claimSeat();
    }
    if (this.seat >= 0) {
      const seat = layout.seats[this.seat];
      this.go([...this.toPlatform(), { x: seat.x, y: layout.walkY + 8 }, { x: seat.x, y: seat.y - 12 }, seat], () =>
        this.sit(),
      );
      return;
    }

    if (this.spot < 0) this.spot = this.world.claimSpot(this.spotPreference());
    const spot = layout.spots[this.spot].at;
    const walkY = layout.walkY + this.lane;
    this.go(
      [...this.toPlatform(), { x: this.walker.x, y: walkY }, { x: spot.x, y: walkY }, spot],
      () => this.beginWaiting(),
    );
  }

  private beginWaiting(): void {
    if (this.patience <= 0) {
      const [min, max] = this.world.cfg.patienceTrains;
      this.patience = min + Math.floor(Math.random() * (max - min + 1));
    }
    this.state = 'WAITING';
    this.activity = this.seat >= 0 ? 'sentado' : '';
    if (this.seat < 0) this.walker.face('up');
    this.ambientTimer = this.ambientDelay();
  }

  private sit(): void {
    this.walker.sit('down');
    this.beginWaiting();
  }

  private react(): void {
    const { train, cfg, profile } = this.world;
    this.reactedCycle = train.cycle;
    this.state = 'REACTING_TO_TRAIN';
    this.activity = '';
    this.approached = false;
    this.walker.halt();
    this.next = null;
    this.holdMs = 0;

    const priority = this.params.trainBoardingPriority;
    this.willBoard = Math.random() < Math.min(0.95, profile.boardChance * (0.75 + 0.5 * priority));

    // Los despistados siguen con el móvil un poco más.
    this.hold(cfg.npcReactionDelay * this.reflex, () => {
      this.walker.setIcon(null);
      if (this.seat < 0) this.walker.face('up');
      if (this.willBoard) this.approach();
      else this.activity = 'mira el tren';
    });
  }

  /** Se acerca a una puerta, a un lado para no tapar a los que bajan. */
  private approach(): void {
    const { layout } = this.world;
    const x = this.walker.x;
    this.doorX = layout.doorXs.reduce((best, d) => (Math.abs(d - x) < Math.abs(best - x) ? d : best));
    const side = x < this.doorX ? -1 : 1;
    const close = this.params.trainBoardingPriority > 0.5 ? 2 : 10;
    const target = { x: this.doorX + side * (8 + Math.abs(this.lane)), y: layout.walkY + close };
    this.leaveSeatAndSpot();
    this.activity = 'se acerca';
    this.go([{ x, y: Math.max(layout.walkY, Math.min(this.walker.y, layout.walkY + 8)) }, target], () => {
      this.approached = true;
      this.activity = 'espera la puerta';
      this.walker.face('up');
    });
  }

  private board(): void {
    const { layout } = this.world;
    this.state = 'BOARDING';
    this.activity = '';
    this.go(
      [
        { x: this.doorX + this.lane, y: layout.walkY },
        { x: this.doorX + this.lane, y: layout.edgeY },
      ],
      () => {
        this.walker.hide();
        this.state = 'RIDING';
        this.activity = '';
        this.running = false;
      },
      1.15,
    );
  }

  /** Entra en la estación con el tren ya abierto: a correr, o no. */
  private maybeRunForTrain(): void {
    const { train } = this.world;
    if (this.decidedRun || !(train.state === 'DOORS_OPENING' || train.doorsOpen)) return;
    this.decidedRun = true;
    if (!this.forceRun && Math.random() >= this.params.runningProbability) return;

    const { layout } = this.world;
    const x = this.gatePoint().x;
    this.doorX = layout.doorXs.reduce((best, d) => (Math.abs(d - x) < Math.abs(best - x) ? d : best));
    this.running = true;
    this.state = 'BOARDING';
    this.activity = 'corre';
    this.leaveSeatAndSpot();
    this.world.note('alguien corre hacia el tren');
    this.go(
      [
        ...this.toPlatform(),
        { x: this.doorX + this.lane, y: layout.walkY },
        { x: this.doorX + this.lane, y: layout.edgeY },
      ],
      () => {
        this.walker.hide();
        this.state = 'RIDING';
        this.activity = '';
        this.running = false;
      },
      2,
    );
  }

  private missTrain(): void {
    this.walker.halt();
    this.walker.face('up');
    this.activity = 'pierde el tren';
    if (this.running) this.world.note('alguien pierde el tren');
    this.running = false;
    this.state = 'WALKING_TO_PLATFORM';
    this.hold(rand(1_200, 2_400), () => this.walkToSpot());
  }

  private trainGone(): void {
    this.walker.setIcon(null);
    if (!this.willBoard) this.patience--;
    if (this.patience <= 0) {
      this.leave();
      return;
    }
    this.walker.halt();
    this.next = null;
    this.holdMs = 0;
    const home = this.seat >= 0 ? this.world.layout.seats[this.seat] : this.spot >= 0 ? this.world.layout.spots[this.spot].at : null;
    if (home && Math.hypot(home.x - this.walker.x, home.y - this.walker.y) < 2) this.beginWaiting();
    else this.walkToSpot();
  }

  private leave(speedScale = 1): void {
    const { layout } = this.world;
    this.leaveSeatAndSpot();
    this.walker.setIcon(null);
    this.patience = 0;
    this.state = 'LEAVING_STATION';
    this.activity = '';
    this.gate = pick(layout.gates);
    const walkY = layout.walkY + this.lane;
    this.go(
      [
        { x: this.walker.x, y: walkY },
        { x: this.gatePoint().x, y: walkY },
        this.gatePoint(),
        this.gateLobby(),
        layout.entrance,
      ],
      () => {
        this.walker.hide();
        this.startOffstage(this.respawnDelay());
      },
      speedScale,
    );
  }

  // ------------------------------------------------------------ ambiente

  private ambient(): void {
    const p = this.params;
    const calm = this.world.mood === 'CALM';
    const hectic = this.world.mood === 'HECTIC';
    const seated = this.seat >= 0;
    const table: [Ambient, number][] = [
      ['idle', 30 + (calm ? 15 : 0)],
      ['phone', 55 * p.phoneUsageProbability],
      ['tracks', seated ? 0 : 10],
      ['look', 10],
      ['shift', seated ? 0 : 8],
      ['stroll', seated ? 0 : 4 + (hectic ? 4 : 0)],
      ['sign', seated ? 0 : 60 * p.signInterest],
      ['talk', 30 * p.talkInterest + (calm ? 8 : 0)],
      ['sit', seated ? 0 : 35 * p.seatInterest],
    ];
    this.ambientTimer = this.ambientDelay();
    this.walker.setIcon(null);
    this.activity = seated ? 'sentado' : '';
    const { layout } = this.world;
    const home = (): Vec2 => (seated ? layout.seats[this.seat] : layout.spots[this.spot].at);

    switch (weighted(Math.random, table)) {
      case 'idle':
        return;
      case 'phone':
        this.activity = 'móvil';
        this.walker.face('down');
        this.walker.setIcon('phone');
        return;
      case 'tracks':
        this.walker.face('up');
        return;
      case 'look':
        this.walker.face(Math.random() < 0.5 ? 'left' : 'right');
        return;
      case 'shift': {
        const at = home();
        this.go([{ x: at.x + rand(-5, 5), y: at.y + rand(-3, 2) }], () => this.walker.face('up'));
        return;
      }
      case 'stroll': {
        const at = home();
        const dx = (Math.random() < 0.5 ? -1 : 1) * rand(18, 40);
        const x = Math.min(Math.max(at.x + dx, 24), layout.doorXs[layout.doorXs.length - 1] + 24);
        this.activity = 'da unos pasos';
        this.go([{ x, y: layout.walkY + rand(0, 14) }], () =>
          this.hold(rand(800, 1_800), () => this.go([at], () => this.walker.face('up'))),
        );
        return;
      }
      case 'sign': {
        const signs = layout.signs.filter((s) => s.platform);
        if (signs.length === 0) return;
        const at = home();
        const s = signs.reduce((a, b) => (Math.abs(a.at.x - at.x) < Math.abs(b.at.x - at.x) ? a : b));
        this.activity = 'mira el cartel';
        this.go([s.at], () => {
          this.walker.face(s.facing);
          this.hold(rand(2_000, 4_000), () => this.go([at], () => this.walker.face('up')));
        });
        return;
      }
      case 'talk': {
        const other = this.world.talkPartner(this);
        if (!other) return;
        this.chatWith(other, true);
        other.chatWith(this, false);
        return;
      }
      case 'sit': {
        const seat = this.world.claimSeat();
        if (seat < 0) return;
        this.world.releaseSpot(this.spot);
        this.spot = -1;
        this.seat = seat;
        const s = layout.seats[seat];
        this.activity = 'va a sentarse';
        this.go([{ x: s.x, y: s.y - 12 }, s], () => this.sit());
        return;
      }
    }
  }

  chatWith(other: PassengerAI, speaks: boolean): void {
    this.activity = 'charla';
    const dx = other.walker.x - this.walker.x;
    this.walker.face(Math.abs(dx) > 4 ? (dx > 0 ? 'right' : 'left') : 'up');
    if (speaks) this.walker.setIcon('talk');
    this.ambientTimer = rand(3_000, 5_000);
  }

  /**
   * Microevento de carterista.
   *
   * Si nadie detecta el intento, se aleja como otro pasajero cualquiera.
   * Si alguien lo detecta, sale corriendo hacia la salida.
   */
  pickpocket(
    victim: PassengerAI,
    noticed: boolean,
    onAttempt: () => void,
  ): boolean {
    if (!this.idleWaiting || !victim.idleWaiting || victim === this) return false;

    const { layout } = this.world;

    this.leaveSeatAndSpot();
    this.walker.setIcon(null);
    this.state = 'WALKING_TO_PLATFORM';
    this.activity = 'se acerca a alguien';

    const side = this.walker.x <= victim.walker.x ? -7 : 7;
    const near = {
      x: victim.walker.x + side,
      y: victim.walker.y,
    };

    this.go(
      [
        { x: this.walker.x, y: layout.walkY },
        { x: near.x, y: layout.walkY },
        near,
      ],
      () => {
        this.activity = 'demasiado cerca';
        this.walker.face(side < 0 ? 'right' : 'left');

        this.hold(2_000, () => {
          onAttempt();

          // Nadie se ha dado cuenta: intenta mezclarse con el flujo normal.
          if (!noticed) {
            this.activity = 'se aleja';
            this.leave();
            return;
          }

          // Lo han descubierto: huida evidente.
          this.activity = 'huye';
          this.walker.setIcon('alert');

          this.gate = pick(layout.gates);
          const walkY = layout.walkY + this.lane;

          this.go(
            [
              { x: this.walker.x, y: walkY },
              { x: this.gatePoint().x, y: walkY },
              this.gatePoint(),
              this.gateLobby(),
              layout.entrance,
            ],
            () => {
              this.walker.setIcon(null);
              this.walker.hide();
              this.startOffstage(this.respawnDelay());
            },
            1.55,
          );
        });
      },
      1.15,
    );

    return true;
  }

  /** Quien descubre el robo reacciona y puede gritar. */
  reactToIncident(label: string, speech?: string): void {
    this.activity = label;
    this.walker.setIcon('alert');

    if (speech) this.walker.say(speech, 3_400);

    // window.setTimeout sobrevive a la escena: si se ha cambiado de sitio, el sprite ya no existe (active = false).
    window.setTimeout(() => {
      if (!this.walker.active || !this.walker.visible) return;

      this.walker.setIcon(null);

      if (this.state === 'WAITING') {
        this.activity = '';
        this.walker.face('up');
      }
    }, 3_800);
  }

  /** Al oír un grito, algunos pasajeros cercanos miran hacia el incidente. */
  reactToShout(at: Vec2): void {
    if (!this.idleWaiting) return;

    const dx = at.x - this.walker.x;
    const dy = at.y - this.walker.y;

    const facing: Facing =
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0 ? 'right' : 'left'
        : dy > 0 ? 'down' : 'up';

    this.activity = 'mira el incidente';
    this.walker.face(facing);
    this.walker.setIcon('alert');

    window.setTimeout(() => {
      if (!this.walker.active || !this.walker.visible || this.state !== 'WAITING') return;
      this.walker.setIcon(null);
      this.activity = '';
    }, 2_800);
  }

  /** Seguridad ha alcanzado al sospechoso: deja de huir. */
   /** Seguridad ha alcanzado al sospechoso: cancela completamente la huida. */
  detain(): void {
    this.leaveSeatAndSpot();

    // Cancela cualquier ruta, espera o callback pendiente de la fuga.
    this.holdMs = 0;
    this.next = null;
    this.timer = 0;
    this.ambientTimer = 0;

    this.forceRun = false;
    this.decidedRun = false;
    this.running = false;

    this.walker.halt();
    this.walker.setIcon('alert');

    this.state = 'DETAINED';
    this.activity = 'retenido por seguridad';
  }

  /**
   * La escolta ha terminado.
   * El sospechoso sale de escena y podrá reaparecer más adelante
   * como otro pasajero del pool.
   */
  removeAfterDetention(): void {
    if (this.state !== 'DETAINED') return;

    this.holdMs = 0;
    this.next = null;
    this.timer = 0;
    this.ambientTimer = 0;

    this.forceRun = false;
    this.decidedRun = false;
    this.running = false;

    this.walker.halt();
    this.walker.setIcon(null);
    this.walker.hide();

    this.startOffstage(this.respawnDelay());
  }

  /** Cambia de zona del andén (microevento). */
  changeZone(): boolean {
    if (!this.idleWaiting || this.seat >= 0) return false;
    const { layout } = this.world;
    const old = this.spot;
    const next = this.world.claimSpot('any');
    this.world.releaseSpot(old);
    if (next === old) return false;
    this.spot = next;
    const spot = layout.spots[next].at;
    this.activity = 'cambia de sitio';
    this.walker.setIcon(null);
    this.state = 'WALKING_TO_PLATFORM';
    this.go([{ x: this.walker.x, y: layout.walkY }, { x: spot.x, y: layout.walkY }, spot], () => this.beginWaiting());
    return true;
  }

  // ------------------------------------------------------------- utilidades

  /** Retenido o escoltado por seguridad (MetroSystem.startPickpocket): manda el vigilante, la recuperación de atascos no lo toca. */
  get inIncident(): boolean {
    return this.state === 'DETAINED';
  }

  /**
   * Un peldaño de systems/Recovery. 1–2: vuelve a echar a andar recto hacia
   * donde iba (el andén es abierto: no hay más ruta que esa); lo que tenía que
   * hacer al llegar sigue en pie. 3: deja lo que hacía y se va de la estación.
   * 4 (sólo si `unseen`): desaparece y vuelve a entrar más tarde.
   */
  recover(level: RecoveryLevel, unseen: boolean): void {
    if (this.inIncident || this.state === 'OFFSTAGE' || this.state === 'RIDING') return;
    const dest = this.walker.destination;
    if (level <= 2) {
      if (dest) this.walker.walk([dest], this.speed || this.world.cfg.npcWalkingSpeed);
      return;
    }
    if (level === 3) {
      if (this.state !== 'LEAVING_STATION') this.leave();
      else if (dest) this.walker.walk([dest], this.speed || this.world.cfg.npcWalkingSpeed);
      return;
    }
    if (!unseen) return;
    this.leaveSeatAndSpot();
    this.walker.halt();
    this.walker.hide();
    this.startOffstage(this.respawnDelay());
  }

  private go(path: Vec2[], then: (() => void) | null, speedScale = 1): void {
    this.holdMs = 0;
    this.next = then;
    this.walker.walk(path, this.speed * speedScale);
  }

  private hold(ms: number, then: (() => void) | null): void {
    this.holdMs = ms;
    this.next = then;
  }

  private resume(): void {
    const next = this.next;
    this.next = null;
    next?.();
  }

  private becomeNewcomer(force?: Archetype): void {
    const { archetype, look } = this.world.newcomer();
    this.archetype = force ?? archetype;
    this.params = ARCHETYPES[this.archetype];
    this.walker.setLook(look);
    this.speed = this.world.cfg.npcWalkingSpeed * this.params.walkingSpeed * rand(0.9, 1.1);
    this.reflex = this.params.reactionDelay * rand(0.7, 1.3);
    this.patience = 0;
    this.spot = -1;
    this.seat = -1;
  }

  private spotPreference(): SpotPreference {
    const pref = this.params.waitingPositionPreference;
    return pref === 'front' ? 'front' : pref === 'any' ? 'any' : 'back';
  }

  private gatePoint(): Vec2 {
    return { x: this.gate.gate.x + this.lane, y: this.gate.gate.y };
  }

  private gateLobby(): Vec2 {
    return { x: this.gate.lobby.x + this.lane, y: this.gate.lobby.y };
  }

  /** Si aún está en el vestíbulo, la ruta pasa por su torniquete. */
  private toPlatform(): Vec2[] {
    const gate = this.gatePoint();
    if (this.walker.y < gate.y - 2) return [];
    return [{ x: gate.x, y: Math.max(gate.y, this.walker.y) }, gate];
  }

  private leaveSeatAndSpot(): void {
    if (this.spot >= 0) this.world.releaseSpot(this.spot);
    if (this.seat >= 0) this.world.releaseSeat(this.seat);
    this.spot = -1;
    this.seat = -1;
  }

  private respawnDelay(): number {
    const [min, max] = this.world.profile.respawn;
    return rand(min, max);
  }

  private ambientDelay(): number {
    const [min, max] = this.world.cfg.ambientEvery;
    const mood = this.world.mood;
    return rand(min, max) * (mood === 'HECTIC' ? 0.7 : mood === 'CALM' ? 1.3 : 1);
  }
}
