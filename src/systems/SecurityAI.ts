import type { MetroConfig } from '../config/metro';
import type { Facing, Vec2 } from '../types/game';
import type { Walker } from '../entities/Walker';
import type { TrainSystem } from './TrainSystem';
import { rand, trainHere } from './PassengerAI.ts';
import type { RecoveryLevel } from './Recovery';

export type SecurityState =
  | 'IDLE'
  | 'PATROL'
  | 'OBSERVE'
  | 'RETURN_TO_POSITION'
  | 'CHASE'
  | 'DETAIN'
  | 'ESCORT';

const LOOK_AROUND: readonly Facing[] = [
  'up',
  'left',
  'right',
  'down',
];

/**
 * Vigilante del metro.
 *
 * Tiene una rutina normal de puesto/ronda y una rutina prioritaria
 * para incidencias: persecución, detención y escolta.
 *
 * Los cambios de turno nunca interrumpen una incidencia activa.
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
    opts: {
      patrols: boolean;
      onPlatform: boolean;
    },
    cfg: MetroConfig,
  ) {
    this.walker = walker;
    this.post = post;
    this.postFacing = postFacing;
    this.patrol = patrol;
    this.patrols = opts.patrols;
    this.onPlatform = opts.onPlatform;
    this.cfg = cfg;

    walker.place(
      post,
      postFacing,
    );

    this.idle();
  }

  get label(): string {
    return `${this.patrols ? 'ronda' : 'fijo'} ${this.state}`;
  }

  /**
   * Una incidencia nunca debe ser interrumpida por el cambio de turno.
   */
  get handlingIncident(): boolean {
    return (
      this.state === 'CHASE' ||
      this.state === 'DETAIN' ||
      this.state === 'ESCORT'
    );
  }

  /** Libre para una incidencia nueva (no está ya persiguiendo, reteniendo ni escoltando a nadie). */
  get available(): boolean {
    return !this.handlingIncident;
  }

  /**
   * Un peldaño de systems/Recovery. 1: vuelve a echar a andar hacia donde iba (en una persecución, la
   * próxima vuelta ya apunta al sospechoso). 2 y 3: deja la incidencia cerrada como si hubiera acabado
   * (persecución → se escapa; escolta → ya fuera: el sospechoso sale de escena) y vuelve a su puesto
   * (2) o retoma el turno donde está (3); nadie queda retenido para siempre. 4 (sólo si `unseen`):
   * igual, y aparece en su puesto, que está validado fuera de la vía (scripts/check-regression).
   */
  recover(level: RecoveryLevel, unseen: boolean): void {
    if (!this.walker.visible) return;
    if (level === 1) {
      const dest = this.walker.destination;
      if (dest) this.walker.walk([dest], this.cfg.npcWalkingSpeed);
      return;
    }
    if (level === 4 && !unseen) return;
    this.closeIncident();
    this.cancelRoutine();
    if (level === 2) {
      this.returnToPost();
      return;
    }
    if (level === 4) this.walker.place(this.post, this.postFacing);
    this.idle();
  }

  /** Cierra la incidencia en curso por el final que le toca (escapado o escoltado) y la limpia. */
  private closeIncident(): void {
    if (!this.handlingIncident) return;
    const done = this.state === 'ESCORT' ? this.escorted : this.state === 'CHASE' ? this.escaped : null;
    this.clearIncident();
    done?.();
  }

  // ------------------------------------------------------------- turnos

  /**
   * Empieza el turno de este vigilante.
   *
   * Aparece en su puesto y comienza su rutina normal.
   */
  startShift(): void {
    this.cancelRoutine();
    this.clearIncident();

    this.walker.place(
      this.post,
      this.postFacing,
    );

    this.idle();
  }

  /**
   * Intenta finalizar el turno.
   *
   * Si está resolviendo una incidencia devuelve false y permanece
   * trabajando hasta terminarla.
   */
  endShift(): boolean {
    if (this.handlingIncident) {
      return false;
    }

    this.cancelRoutine();
    this.clearIncident();

    this.walker.hide();

    this.state = 'IDLE';

    return true;
  }

  // ------------------------------------------------------------- rutina

  /** Ronda extraordinaria por el andén. */
  sweep(
    route: readonly Vec2[],
  ): boolean {
    if (
      this.state !== 'IDLE' ||
      !this.onPlatform ||
      !this.walker.visible
    ) {
      return false;
    }

    this.startRoute(route);

    return true;
  }

  /** Acude a un punto fijo. */
  respond(at: Vec2): boolean {
    if (!this.walker.visible) {
      return false;
    }

    this.cancelRoutine();

    this.urgent = true;

    this.walker.setIcon(
      'alert',
    );

    this.startRoute([
      at,
    ]);

    return true;
  }

  // ------------------------------------------------------- persecución

  /**
   * Persigue a un Walker real.
   *
   * Cada frame recalcula la posición del sospechoso.
   */
  chase(
    target: Walker,
    onCaught: () => void,
    onEscaped: () => void,
  ): boolean {
    if (
      !this.walker.visible ||
      !target.visible
    ) {
      return false;
    }

    this.cancelRoutine();

    // Limpia cualquier dato residual de una incidencia anterior.
    this.chaseTarget = target;
    this.caught = onCaught;
    this.escaped = onEscaped;

    this.escortTarget = null;
    this.escortRoute = [];
    this.escorted = null;
    this.escortGuardArrived = false;

    this.urgent = true;
    this.state = 'CHASE';

    this.walker.setIcon(
      'alert',
    );

    this.walker.say(
      '¡Alto! ¡Seguridad!',
      2_500,
    );

    return true;
  }

  /**
   * Guarda la ruta que se utilizará después de DETAIN.
   */
  prepareEscort(
    target: Walker,
    route: readonly Vec2[],
    onEscorted: () => void,
  ): void {
    this.escortTarget =
      target;

    this.escortRoute =
      route;

    this.escorted =
      onEscorted;
  }

  // ------------------------------------------------------------- update

  update(
    deltaMs: number,
    train: TrainSystem,
  ): void {
    // Los vigilantes fuera de turno no consumen lógica.
    if (!this.walker.visible) {
      return;
    }

    switch (this.state) {
      // ----------------------------------------------------- persecución

      case 'CHASE': {
        const target =
          this.chaseTarget;

        if (
          !target ||
          !target.visible
        ) {
          const callback =
            this.escaped;

          this.clearIncident();

          callback?.();

          this.returnToPost();

          return;
        }

        const dx =
          target.x -
          this.walker.x;

        const dy =
          target.y -
          this.walker.y;

        const distance =
          Math.hypot(
            dx,
            dy,
          );

        // -------------------------------------------------- captura

        if (distance <= 13) {
          this.walker.halt();

          const facing: Facing =
            Math.abs(dx) >
            Math.abs(dy)
              ? dx > 0
                ? 'right'
                : 'left'
              : dy > 0
                ? 'down'
                : 'up';

          this.walker.face(
            facing,
          );

          this.walker.say(
            'Quieto. Seguridad.',
            2_800,
          );

          const callback =
            this.caught;

          // Solo puede ejecutarse una vez.
          this.caught = null;
          this.escaped = null;

          this.state =
            'DETAIN';

          // Pausa visible antes de llevárselo.
          this.timer =
            3_000;

          callback?.();

          return;
        }

        // Sigue la posición ACTUAL del carterista.
        this.walker.walk(
          [
            {
              x: target.x,
              y: target.y,
            },
          ],
          this.cfg.npcWalkingSpeed *
            1.75,
        );

        this.walker.step(
          deltaMs,
        );

        return;
      }

      // ---------------------------------------------------------- DETAIN

      case 'DETAIN': {
        this.timer -=
          deltaMs;

        if (
          this.timer > 0
        ) {
          return;
        }

        if (
          this.escortTarget &&
          this.escortTarget.visible &&
          this.escortRoute.length >
            0
        ) {
          this.startEscort();

          return;
        }

        // Nunca se queda bloqueado aquí.
        this.clearIncident();

        this.returnToPost();

        return;
      }

      // ---------------------------------------------------------- ESCORT

      case 'ESCORT': {
        const target =
          this.escortTarget;

        if (
          !target ||
          !target.visible
        ) {
          const callback =
            this.escorted;

          callback?.();

          this.clearIncident();

          this.returnToPost();

          return;
        }

        /*
         * PassengerAI actualiza el Walker del sospechoso.
         * Aquí únicamente avanzamos al vigilante.
         */
        if (
          !this
            .escortGuardArrived
        ) {
          this.escortGuardArrived =
            this.walker.step(
              deltaMs,
            );
        }

        /*
         * La escena termina cuando ambos han llegado.
         */
        if (
          this
            .escortGuardArrived &&
          !target.moving
        ) {
          const callback =
            this.escorted;

          callback?.();

          this.clearIncident();

          this.returnToPost();
        }

        return;
      }

      // ------------------------------------------------------------ IDLE

      case 'IDLE': {
        if (
          trainHere(train) &&
          this.observedCycle !==
            train.cycle
        ) {
          this.observedCycle =
            train.cycle;

          this.observe(
            'up',
          );

          return;
        }

        this.timer -=
          deltaMs;

        if (
          this.timer > 0
        ) {
          return;
        }

        if (
          this.patrols &&
          this.patrol.length >
            0
        ) {
          this.startRoute(
            this.patrol,
          );
        } else {
          this.walker.face(
            Math.random() <
              0.6
              ? this
                  .postFacing
              : LOOK_AROUND[
                  Math.floor(
                    Math.random() *
                      LOOK_AROUND.length,
                  )
                ],
          );

          this.timer =
            rand(
              ...this.cfg
                .guardIdle,
            );
        }

        return;
      }

      // ---------------------------------------------------------- PATROL

      case 'PATROL': {
        if (
          this.walker.step(
            deltaMs,
          )
        ) {
          this.next++;

          this.observe(
            LOOK_AROUND[
              Math.floor(
                Math.random() *
                  LOOK_AROUND.length,
              )
            ],
          );
        }

        return;
      }

      // --------------------------------------------------------- OBSERVE

      case 'OBSERVE': {
        this.timer -=
          deltaMs;

        if (
          this.timer > 0
        ) {
          return;
        }

        if (
          !this.patrolling
        ) {
          this.idle();
        } else if (
          this.next <
          this.route.length
        ) {
          this.walkToNext();
        } else {
          this.patrolling =
            false;

          this.returnToPost();
        }

        return;
      }

      // ----------------------------------------------- RETURN_TO_POSITION

      case 'RETURN_TO_POSITION': {
        if (
          this.walker.step(
            deltaMs,
          )
        ) {
          this.idle();
        }

        return;
      }
    }
  }

  // --------------------------------------------------------- incidencia

  /**
   * Empieza la fase de escolta.
   *
   * Vigilante y sospechoso recorren la misma ruta
   * manteniendo una pequeña separación horizontal.
   */
  private startEscort(): void {
    const target =
      this.escortTarget;

    if (
      !target ||
      !target.visible ||
      this.escortRoute.length ===
        0
    ) {
      this.clearIncident();

      this.returnToPost();

      return;
    }

    this.state =
      'ESCORT';

    this.escortGuardArrived =
      false;

    this.walker.setIcon(
      'alert',
    );

    this.walker.say(
      'Vamos. Acompáñame.',
      2_500,
    );

    // Cualquier movimiento residual queda cancelado.
    target.halt();

    target.say(
      'Vale...',
      1_800,
    );

    const side =
      this.walker.x <=
      target.x
        ? -7
        : 7;

    // Carterista hacia la salida.
    target.walk(
      [
        ...this
          .escortRoute,
      ],
      this.cfg.npcWalkingSpeed *
        0.78,
    );

    // Vigilante ligeramente a su lado.
    this.walker.walk(
      this.escortRoute.map(
        (point) => ({
          x:
            point.x +
            side,

          y:
            point.y,
        }),
      ),

      this.cfg.npcWalkingSpeed *
        0.82,
    );
  }

  /**
   * Limpia toda la incidencia.
   *
   * Es importante para permitir futuros robos.
   */
  private clearIncident(): void {
    this.chaseTarget =
      null;

    this.caught =
      null;

    this.escaped =
      null;

    this.escortTarget =
      null;

    this.escortRoute =
      [];

    this.escorted =
      null;

    this.escortGuardArrived =
      false;

    this.urgent =
      false;

    this.walker.setIcon(
      null,
    );
  }

  // ------------------------------------------------------------- rutina

  private cancelRoutine(): void {
    this.walker.halt();

    this.route =
      [];

    this.next = 0;

    this.patrolling =
      false;
  }

  private returnToPost(): void {
    // Si por cualquier motivo el turno terminó,
    // no intentamos mover un Walker oculto.
    if (
      !this.walker.visible
    ) {
      return;
    }

    this.walker.walk(
      [
        this.post,
      ],

      this.cfg.npcWalkingSpeed *
        0.9,
    );

    this.state =
      'RETURN_TO_POSITION';
  }

  private startRoute(
    route: readonly Vec2[],
  ): void {
    if (
      route.length === 0
    ) {
      this.idle();

      return;
    }

    this.route =
      route;

    this.patrolling =
      true;

    this.next = 0;

    this.walkToNext();
  }

  private idle(): void {
    if (
      !this.walker.visible
    ) {
      return;
    }

    this.urgent =
      false;

    this.walker.setIcon(
      null,
    );

    this.walker.face(
      this.postFacing,
    );

    this.timer =
      rand(
        ...this.cfg.guardIdle,
      );

    this.state =
      'IDLE';
  }

  private observe(
    facing: Facing,
  ): void {
    this.walker.face(
      facing,
    );

    this.timer =
      rand(
        ...this.cfg
          .guardObserve,
      );

    this.state =
      'OBSERVE';
  }

  private walkToNext(): void {
    if (
      this.next >=
      this.route.length
    ) {
      this.patrolling =
        false;

      this.returnToPost();

      return;
    }

    const speed =
      this.cfg.npcWalkingSpeed *
      (
        this.urgent
          ? 1.35
          : 0.8
      );

    this.walker.walk(
      [
        this.route[
          this.next
        ],
      ],

      speed,
    );

    this.state =
      'PATROL';
  }
}