import type { MetroConfig } from '../config/metro';

export type TrainState =
  | 'APPROACHING'
  | 'ARRIVING'
  | 'STOPPED'
  | 'DOORS_OPENING'
  | 'BOARDING'
  | 'DOORS_CLOSING'
  | 'DEPARTING'
  | 'AWAY';

/** Posiciones del borde izquierdo del tren, en px. El tren circula hacia la izquierda. */
export interface TrackGeometry {
  enterX: number;
  stopX: number;
  exitX: number;
}

type Timing = Pick<
  MetroConfig,
  | 'trainArrivalInterval'
  | 'firstArrivalDelay'
  | 'trainStopDuration'
  | 'doorOpenDelay'
  | 'doorOpeningDuration'
  | 'doorCloseWarning'
  | 'doorClosingDuration'
  | 'trainCruiseSpeed'
  | 'trainBraking'
  | 'trainAcceleration'
>;

/** Velocidad mínima al frenar: sin ella el último medio píxel se arrastra. */
const CRAWL_SPEED = 6;

/**
 * Máquina de estados del tren, horario y puertas. Sin Phaser: sólo números,
 * para poder comprobar ciclos completos desde node (scripts/check-metro.ts).
 *
 * Las puertas no tienen estado propio: su apertura se deriva del estado del
 * tren, así que es imposible que se abran en marcha.
 */
export class TrainSystem {
  state: TrainState = 'AWAY';
  /** Borde izquierdo del tren en px. */
  x: number;
  /** px/s hacia la izquierda. */
  speed = 0;
  /** Número de llegadas; los pasajeros lo usan para reaccionar una vez por tren. */
  cycle = 0;
  onStateChange: ((state: TrainState) => void) | null = null;

  private timer: number;
  private readonly cfg: Timing;
  private readonly track: TrackGeometry;

  constructor(cfg: Timing, track: TrackGeometry, atPlatform = false) {
    this.cfg = cfg;
    this.track = track;
    if (atPlatform) {
      this.state = 'BOARDING';
      this.x = track.stopX;
      this.timer = cfg.trainStopDuration;
      this.cycle = 1;
    } else {
      this.x = track.enterX;
      this.timer = cfg.firstArrivalDelay;
    }
  }

  /** 0 cerradas, 1 abiertas del todo. */
  get doorOpenness(): number {
    const { doorOpeningDuration, doorClosingDuration } = this.cfg;
    switch (this.state) {
      case 'DOORS_OPENING':
        return 1 - this.timer / doorOpeningDuration;
      case 'BOARDING':
        return 1;
      case 'DOORS_CLOSING':
        return Math.min(1, this.timer / doorClosingDuration);
      default:
        return 0;
    }
  }

  /** Se puede subir o bajar: puertas abiertas del todo, antes del aviso. */
  get doorsOpen(): boolean {
    return this.state === 'BOARDING';
  }

  /** Durante el aviso de cierre las puertas siguen abiertas pero ya no se entra. */
  get closingWarning(): boolean {
    return this.state === 'DOORS_CLOSING' && this.timer > this.cfg.doorClosingDuration;
  }

  /** Milisegundos hasta que el tren asome por el túnel; 0 si ya está en camino o en el andén. */
  get nextArrivalMs(): number {
    return this.state === 'AWAY' ? Math.max(0, this.timer) : 0;
  }

  /**
   * Fija cuánto falta para el siguiente tren. Sólo con la vía vacía: el horario
   * (frecuencia del día, retrasos) lo decide quien conoce el contexto.
   */
  setWait(ms: number): void {
    if (this.state === 'AWAY') this.timer = ms;
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    const { cfg, track } = this;

    switch (this.state) {
      case 'AWAY':
        this.timer -= deltaMs;
        if (this.timer <= 0) {
          this.x = track.enterX;
          this.speed = cfg.trainCruiseSpeed;
          this.cycle++;
          this.enter('APPROACHING');
        }
        return;

      case 'APPROACHING': {
        this.x -= this.speed * dt;
        const distance = this.x - track.stopX;
        const brakingDistance = (this.speed * this.speed) / (2 * cfg.trainBraking);
        if (distance <= brakingDistance) this.enter('ARRIVING');
        return;
      }

      case 'ARRIVING': {
        // v = sqrt(2·a·d): la curva de frenado acaba exactamente en la marca.
        const distance = Math.max(0, this.x - track.stopX);
        this.speed = Math.max(CRAWL_SPEED, Math.sqrt(2 * cfg.trainBraking * distance));
        this.x -= this.speed * dt;
        if (this.x - track.stopX <= 0.5) {
          this.x = track.stopX;
          this.speed = 0;
          this.enter('STOPPED', cfg.doorOpenDelay);
        }
        return;
      }

      case 'STOPPED':
        if (this.tick(deltaMs)) this.enter('DOORS_OPENING', cfg.doorOpeningDuration);
        return;

      case 'DOORS_OPENING':
        if (this.tick(deltaMs)) this.enter('BOARDING', cfg.trainStopDuration);
        return;

      case 'BOARDING':
        if (this.tick(deltaMs)) {
          this.enter('DOORS_CLOSING', cfg.doorCloseWarning + cfg.doorClosingDuration);
        }
        return;

      case 'DOORS_CLOSING':
        if (this.tick(deltaMs)) this.enter('DEPARTING');
        return;

      case 'DEPARTING':
        this.speed = Math.min(cfg.trainCruiseSpeed, this.speed + cfg.trainAcceleration * dt);
        this.x -= this.speed * dt;
        if (this.x <= track.exitX) {
          this.speed = 0;
          this.enter('AWAY', cfg.trainArrivalInterval);
        }
        return;
    }
  }

  private tick(deltaMs: number): boolean {
    this.timer -= deltaMs;
    return this.timer <= 0;
  }

  private enter(state: TrainState, timer = 0): void {
    this.state = state;
    this.timer = timer;
    this.onStateChange?.(state);
  }
}
