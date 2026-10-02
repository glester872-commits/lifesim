import type { MetroConfig } from '../config/metro';
import type { Facing, Vec2 } from '../types/game';
import type { Walker } from '../entities/Walker';
import type { TrainSystem } from './TrainSystem';
import { rand, trainHere } from './PassengerAI';

export type SecurityState =
  | 'IDLE'
  | 'PATROL'
  | 'OBSERVE'
  | 'RETURN_TO_POSITION'
  | 'CHASE'
  | 'DETAIN';

const LOOK_AROUND: readonly Facing[] = ['up', 'left', 'right', 'down'];

/**
 * Vigilante del metro.
 *
 * Su rutina normal es puesto/ronda, pero una incidencia tiene prioridad:
 * puede abandonar lo que esté haciendo y perseguir a una persona en movimiento.
 */
export class SecurityAI {
  state: SecurityState = 'IDLE';
  readonly walker: Walker;
  readonly onPlatform: boolean;

  private timer = 0;
  private next = 0;
  private route: readonly Vec2[] = [];
  private patrolling = false;
  private urgent = false;
  private observedCycle = 0;

  private chaseTarget: Walker | null = null;
  private caught: (() => void) | null = null;
  private escaped: (() => void) | null = null;

  private readonly post: Vec2;
  private readonly postFacing: Facing;
  private readonly patrol: readonly Vec2[];
  private readonly patrols: boolean;
  private readonly cfg: MetroConfig;

  constructor(
    walker: Walker,
    post: Vec2,
    postFacing: Facing,
    patrol: readonly Vec2[],
    opts: { patrols: boolean; onPlatform: boolean },
    cfg: MetroConfig,
  ) {
    this.walker = walker;
    this.post = post;
    this.postFacing = postFacing;
    this.patrol = patrol;
    this.patrols = opts.patrols;
    this.onPlatform = opts.onPlatform;
    this.cfg = cfg;

    walker.place(post, postFacing);
    this.idle();
  }

  get label(): string {
    return `${this.patrols ? 'ronda' : 'fijo'} ${this.state}`;
  }

  /** Ronda extraordinaria por el andén. */
  sweep(route: readonly Vec2[]): boolean {
    if (this.state !== 'IDLE' || !this.onPlatform) return false;
    this.startRoute(route);
    return true;
  }

  /** Acude a un punto fijo. */
  respond(at: Vec2): boolean {
    this.cancelRoutine();
    this.urgent = true;
    this.walker.setIcon('alert');
    this.startRoute([at]);
    return true;
  }

  /**
   * Persigue a un Walker real, no una coordenada antigua.
   * Cada frame recalcula dónde está el sospechoso.
   */
  chase(
    target: Walker,
    onCaught: () => void,
    onEscaped: () => void,
  ): boolean {
    if (!target.visible) return false;

    this.cancelRoutine();

    this.urgent = true;
    this.chaseTarget = target;
    this.caught = onCaught;
    this.escaped = onEscaped;
    this.state = 'CHASE';

    this.walker.setIcon('alert');
    this.walker.say('¡Alto! ¡Seguridad!', 3_000);

    return true;
  }

  update(deltaMs: number, train: TrainSystem): void {
    switch (this.state) {
      case 'CHASE': {
        const target = this.chaseTarget;

        if (!target || !target.visible) {
          const callback = this.escaped;
          this.clearChase();
          callback?.();
          this.returnToPost();
          return;
        }

        const dx = target.x - this.walker.x;
        const dy = target.y - this.walker.y;
        const distance = Math.hypot(dx, dy);

        // Lo ha alcanzado.
        if (distance <= 13) {
          this.walker.halt();

          const facing: Facing =
            Math.abs(dx) > Math.abs(dy)
              ? dx > 0 ? 'right' : 'left'
              : dy > 0 ? 'down' : 'up';

          this.walker.face(facing);
          this.walker.say('Quieto. Seguridad.', 3_500);

          const callback = this.caught;
          this.caught = null;
          this.escaped = null;

          this.state = 'DETAIN';
          this.timer = 3_500;

          callback?.();
          return;
        }

        // Persigue su posición ACTUAL, no donde estaba cuando dieron la alarma.
        this.walker.walk(
          [{ x: target.x, y: target.y }],
          this.cfg.npcWalkingSpeed * 1.75,
        );
        this.walker.step(deltaMs);
        return;
      }

      case 'DETAIN':
        this.timer -= deltaMs;
        if (this.timer <= 0) {
          this.clearChase();
          this.returnToPost();
        }
        return;

      case 'IDLE':
        if (trainHere(train) && this.observedCycle !== train.cycle) {
          this.observedCycle = train.cycle;
          this.observe('up');
          return;
        }

        this.timer -= deltaMs;
        if (this.timer > 0) return;

        if (this.patrols && this.patrol.length > 0) {
          this.startRoute(this.patrol);
        } else {
          this.walker.face(
            Math.random() < 0.6
              ? this.postFacing
              : LOOK_AROUND[Math.floor(Math.random() * LOOK_AROUND.length)],
          );
          this.timer = rand(...this.cfg.guardIdle);
        }
        return;

      case 'PATROL':
        if (this.walker.step(deltaMs)) {
          this.next++;
          this.observe(
            LOOK_AROUND[Math.floor(Math.random() * LOOK_AROUND.length)],
          );
        }
        return;

      case 'OBSERVE':
        this.timer -= deltaMs;
        if (this.timer > 0) return;

        if (!this.patrolling) {
          this.idle();
        } else if (this.next < this.route.length) {
          this.walkToNext();
        } else {
          this.patrolling = false;
          this.returnToPost();
        }
        return;

      case 'RETURN_TO_POSITION':
        if (this.walker.step(deltaMs)) this.idle();
        return;
    }
  }

  private cancelRoutine(): void {
    this.walker.halt();
    this.route = [];
    this.next = 0;
    this.patrolling = false;
  }

  private clearChase(): void {
    this.chaseTarget = null;
    this.caught = null;
    this.escaped = null;
    this.urgent = false;
    this.walker.setIcon(null);
  }

  private returnToPost(): void {
    this.walker.walk(
      [this.post],
      this.cfg.npcWalkingSpeed * (this.urgent ? 1 : 0.8),
    );
    this.state = 'RETURN_TO_POSITION';
  }

  private startRoute(route: readonly Vec2[]): void {
    this.route = route;
    this.patrolling = true;
    this.next = 0;
    this.walkToNext();
  }

  private idle(): void {
    this.urgent = false;
    this.walker.setIcon(null);
    this.walker.face(this.postFacing);
    this.timer = rand(...this.cfg.guardIdle);
    this.state = 'IDLE';
  }

  private observe(facing: Facing): void {
    this.walker.face(facing);
    this.timer = rand(...this.cfg.guardObserve);
    this.state = 'OBSERVE';
  }

  private walkToNext(): void {
    const speed =
      this.cfg.npcWalkingSpeed * (this.urgent ? 1.35 : 0.8);

    this.walker.walk([this.route[this.next]], speed);
    this.state = 'PATROL';
  }
}
