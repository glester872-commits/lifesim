import type { MetroConfig } from '../config/metro';
import type { Facing, Vec2 } from '../types/game';
import type { Walker } from '../entities/Walker';
import type { TrainSystem } from './TrainSystem';
import { rand, trainHere } from './PassengerAI';

export type SecurityState = 'IDLE' | 'PATROL' | 'OBSERVE' | 'RETURN_TO_POSITION' | 'RESPOND' | 'RESOLVE';

/** Lo que tarda en resolver un aviso al llegar: hablar con quien sea y acompañarle hacia la salida. */
const RESOLVE_MS = 2_600;

const LOOK_AROUND: readonly Facing[] = ['up', 'left', 'right', 'down'];

/**
 * Vigilante: espera en su puesto y, si ese día toca patrullar, hace rondas
 * cortas parándose a mirar en cada punto. Si entra un tren mientras está en el
 * puesto, lo observa. Ante un aviso (un carterista, systems/Pickpocket.ts)
 * deja lo que haga, acude, lo resuelve y vuelve a su puesto.
 */
export class SecurityAI {
  state: SecurityState = 'IDLE';
  readonly walker: Walker;
  /** Su puesto está en el andén: puede cruzarlo de punta a punta. */
  readonly onPlatform: boolean;

  private timer = 0;
  private next = 0;
  private route: readonly Vec2[] = [];
  private patrolling = false;
  private observedCycle = 0;
  /** Aviso en curso: qué hacer al llegar y por dónde volver (el torniquete, si viene del vestíbulo). */
  private onArrive: (() => void) | null = null;
  private back: readonly Vec2[] = [];
  readonly post: Vec2;
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

  /** Cruza el andén entero y vuelve (microevento). Sólo desde el puesto. */
  sweep(route: readonly Vec2[]): boolean {
    if (this.state !== 'IDLE' || !this.onPlatform) return false;
    this.startRoute(route);
    return true;
  }

  /** Libre para acudir a un aviso: no está ya en otro. */
  get available(): boolean {
    return this.state !== 'RESPOND' && this.state !== 'RESOLVE';
  }

  /**
   * Acude a un aviso: deja la ronda, va por `path` (que nunca baja del andén a
   * la vía: lo da systems/Pickpocket), hace `onArrive` al llegar, se queda
   * resolviendo un momento y vuelve a su puesto por `back`.
   */
  respond(path: readonly Vec2[], back: readonly Vec2[], onArrive: () => void): boolean {
    if (!this.available || path.length === 0) return false;
    this.patrolling = false;
    this.onArrive = onArrive;
    this.back = back;
    this.walker.walk([...path], this.cfg.npcWalkingSpeed * 1.25);
    this.state = 'RESPOND';
    return true;
  }

  update(deltaMs: number, train: TrainSystem): void {
    switch (this.state) {
      case 'RESPOND':
        if (this.walker.step(deltaMs)) {
          this.state = 'RESOLVE';
          this.timer = RESOLVE_MS;
          const arrive = this.onArrive;
          this.onArrive = null;
          arrive?.();
        }
        return;

      case 'RESOLVE':
        this.timer -= deltaMs;
        if (this.timer > 0) return;
        this.walker.walk([...this.back, this.post], this.cfg.npcWalkingSpeed * 0.8);
        this.state = 'RETURN_TO_POSITION';
        return;

      case 'IDLE':
        if (trainHere(train) && this.observedCycle !== train.cycle) {
          this.observedCycle = train.cycle;
          this.observe('up');
          return;
        }
        this.timer -= deltaMs;
        if (this.timer > 0) return;
        if (this.patrols && this.patrol.length > 0) this.startRoute(this.patrol);
        else {
          // Fijo: sólo cambia hacia dónde mira.
          this.walker.face(Math.random() < 0.6 ? this.postFacing : LOOK_AROUND[Math.floor(Math.random() * 4)]);
          this.timer = rand(...this.cfg.guardIdle);
        }
        return;

      case 'PATROL':
        if (this.walker.step(deltaMs)) {
          this.next++;
          this.observe(LOOK_AROUND[Math.floor(Math.random() * LOOK_AROUND.length)]);
        }
        return;

      case 'OBSERVE':
        this.timer -= deltaMs;
        if (this.timer > 0) return;
        if (!this.patrolling) this.idle();
        else if (this.next < this.route.length) this.walkToNext();
        else {
          this.patrolling = false;
          this.walker.walk([this.post], this.cfg.npcWalkingSpeed * 0.8);
          this.state = 'RETURN_TO_POSITION';
        }
        return;

      case 'RETURN_TO_POSITION':
        if (this.walker.step(deltaMs)) this.idle();
        return;
    }
  }

  private startRoute(route: readonly Vec2[]): void {
    this.route = route;
    this.patrolling = true;
    this.next = 0;
    this.walkToNext();
  }

  private idle(): void {
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
    this.walker.walk([this.route[this.next]], this.cfg.npcWalkingSpeed * 0.8);
    this.state = 'PATROL';
  }
}
