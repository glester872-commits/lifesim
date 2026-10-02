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
  | 'DETAIN'
  | 'ESCORT';

const LOOK_AROUND: readonly Facing[] = ['up', 'left', 'right', 'down'];

/**
 * Vigilante del metro.
 *
 * Su rutina normal es puesto/ronda, pero una incidencia tiene prioridad:
 * puede abandonar lo que esté haciendo, perseguir al sospechoso,
 * detenerlo y escoltarlo fuera de la zona.
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

  // ------------------------------------------------------- persecución

  private chaseTarget: Walker | null = null;
  private caught: (() => void) | null = null;
  private escaped: (() => void) | null = null;

  // ----------------------------------------------------------- escolta

  private escortTarget: Walker | null = null;
  private escortRoute: readonly Vec2[] = [];
  private escorted: (() => void) | null = null;
  private escortGuardArrived = false;

  // ------------------------------------------------------------ puesto

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
   * Persigue a un Walker real.
   * La posición del sospechoso se recalcula cada frame.
   */
  chase(
    target: Walker,
    onCaught: () => void,
    onEscaped: () => void,
  ): boolean {
    if (!target.visible) return false;

    this.cancelRoutine();

    // Limpia datos que pudieran quedar de una incidencia anterior.
    this.chaseTarget = target;
    this.caught = onCaught;
    this.escaped = onEscaped;

    this.escortTarget = null;
    this.escortRoute = [];
    this.escorted = null;
    this.escortGuardArrived = false;

    this.urgent = true;
    this.state = 'CHASE';

    this.walker.setIcon('alert');
    this.walker.say('¡Alto! ¡Seguridad!', 2_500);

    return true;
  }

  /**
   * Se llama después de que el sospechoso haya sido alcanzado.
   * Guarda la ruta que ambos utilizarán para salir de la zona.
   */
  prepareEscort(
    target: Walker,
    route: readonly Vec2[],
    onEscorted: () => void,
  ): void {
    this.escortTarget = target;
    this.escortRoute = route;
    this.escorted = onEscorted;
  }

  update(deltaMs: number, train: TrainSystem): void {
    switch (this.state) {
      // ------------------------------------------------------- persecución

      case 'CHASE': {
        const target = this.chaseTarget;

        if (!target || !target.visible) {
          const callback = this.escaped;

          this.clearIncident();
          callback?.();
          this.returnToPost();

          return;
        }

        const dx = target.x - this.walker.x;
        const dy = target.y - this.walker.y;
        const distance = Math.hypot(dx, dy);

        // El seguridad ha alcanzado al carterista.
        if (distance <= 13) {
          this.walker.halt();

          const facing: Facing =
            Math.abs(dx) > Math.abs(dy)
              ? dx > 0
                ? 'right'
                : 'left'
              : dy > 0
                ? 'down'
                : 'up';

          this.walker.face(facing);
          this.walker.say('Quieto. Seguridad.', 2_800);

          const callback = this.caught;

          // El callback de captura solo puede ejecutarse una vez.
          this.caught = null;
          this.escaped = null;

          this.state = 'DETAIN';

          // Da tiempo para que la captura sea visible.
          this.timer = 3_000;

          callback?.();
          return;
        }

        // Persigue la posición ACTUAL del sospechoso.
        this.walker.walk(
          [
            {
              x: target.x,
              y: target.y,
            },
          ],
          this.cfg.npcWalkingSpeed * 1.75,
        );

        this.walker.step(deltaMs);
        return;
      }

      // ---------------------------------------------------------- detenido

      case 'DETAIN':
        this.timer -= deltaMs;

        if (this.timer > 0) return;

        // Si MetroSystem ha preparado una ruta, comienza la escolta.
        if (
          this.escortTarget &&
          this.escortTarget.visible &&
          this.escortRoute.length > 0
        ) {
          this.startEscort();
          return;
        }

        // Fallback: nunca debe quedarse bloqueado en DETAIN.
        this.clearIncident();
        this.returnToPost();
        return;

      // ------------------------------------------------------------ escolta

      case 'ESCORT': {
        const target = this.escortTarget;

        if (!target || !target.visible) {
          const callback = this.escorted;

          callback?.();

          this.clearIncident();
          this.returnToPost();
          return;
        }

        // PassengerAI actualiza el movimiento del Walker del sospechoso.
        // SecurityAI actualiza únicamente al vigilante.
        if (!this.escortGuardArrived) {
          this.escortGuardArrived = this.walker.step(deltaMs);
        }

        // La escena termina cuando los dos han completado sus rutas.
        if (this.escortGuardArrived && !target.moving) {
          const callback = this.escorted;

          callback?.();

          this.clearIncident();
          this.returnToPost();
        }

        return;
      }

      // -------------------------------------------------------------- normal

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
              : LOOK_AROUND[
                  Math.floor(Math.random() * LOOK_AROUND.length)
                ],
          );

          this.timer = rand(...this.cfg.guardIdle);
        }

        return;

      case 'PATROL':
        if (this.walker.step(deltaMs)) {
          this.next++;

          this.observe(
            LOOK_AROUND[
              Math.floor(Math.random() * LOOK_AROUND.length)
            ],
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
        if (this.walker.step(deltaMs)) {
          this.idle();
        }

        return;
    }
  }

  // --------------------------------------------------------- incidencia

  /**
   * Empieza la fase de escolta.
   * Sospechoso y vigilante recorren la misma ruta,
   * con una pequeña separación horizontal.
   */
  private startEscort(): void {
    const target = this.escortTarget;

    if (
      !target ||
      !target.visible ||
      this.escortRoute.length === 0
    ) {
      this.clearIncident();
      this.returnToPost();
      return;
    }

    this.state = 'ESCORT';
    this.escortGuardArrived = false;

    this.walker.setIcon('alert');
    this.walker.say('Vamos. Acompáñame.', 2_500);

    // El carterista ya no puede continuar su antigua ruta de huida.
    target.halt();

    target.say('Vale...', 1_800);

    const side =
      this.walker.x <= target.x
        ? -7
        : 7;

    // Sospechoso hacia la salida.
    target.walk(
      [...this.escortRoute],
      this.cfg.npcWalkingSpeed * 0.78,
    );

    // Seguridad ligeramente a su lado.
    this.walker.walk(
      this.escortRoute.map((point) => ({
        x: point.x + side,
        y: point.y,
      })),
      this.cfg.npcWalkingSpeed * 0.82,
    );
  }

  /**
   * Limpia completamente una incidencia para que pueda
   * producirse otra posteriormente.
   */
  private clearIncident(): void {
    this.chaseTarget = null;
    this.caught = null;
    this.escaped = null;

    this.escortTarget = null;
    this.escortRoute = [];
    this.escorted = null;
    this.escortGuardArrived = false;

    this.urgent = false;

    this.walker.setIcon(null);
  }

  // ------------------------------------------------------------- rutina

  private cancelRoutine(): void {
    this.walker.halt();

    this.route = [];
    this.next = 0;
    this.patrolling = false;
  }

  private returnToPost(): void {
    this.walker.walk(
      [this.post],
      this.cfg.npcWalkingSpeed * 0.9,
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
      this.cfg.npcWalkingSpeed *
      (this.urgent ? 1.35 : 0.8);

    this.walker.walk(
      [this.route[this.next]],
      speed,
    );

    this.state = 'PATROL';
  }
}