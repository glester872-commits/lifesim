import Phaser from 'phaser';
import { LAYER } from './Layers';

/** Tope de volutas vivas en toda la escena: el humo acompaña, no tapa. */
const MAX_ALIVE = 48;

const emitters = new WeakMap<Phaser.Scene, SmokeFx>();

/**
 * El humo de los gestos de ambiente: un solo emisor de partículas por escena,
 * compartido por todos los que fuman. Cada voluta nace donde se suelta (en el
 * mundo, no pegada a quien fuma), sube despacio, se abre, deriva con la brisa
 * y se desvanece; así, quien fuma andando deja el humo atrás. Con movimiento
 * reducido, sólo las bocanadas, a la mitad, y sin el hilo de la punta.
 */
export class SmokeFx {
  private readonly emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly reduced: boolean;

  /** El de la escena, creado al primer uso y destruido con ella (al cambiar de sitio). */
  static of(scene: Phaser.Scene): SmokeFx {
    let fx = emitters.get(scene);
    if (!fx) {
      fx = new SmokeFx(scene);
      emitters.set(scene, fx);
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        fx?.emitter.destroy();
        emitters.delete(scene);
      });
    }
    return fx;
  }

  private constructor(scene: Phaser.Scene) {
    this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.emitter = scene.add.particles(0, 0, 'fx-puff', {
      emitting: false,
      lifespan: { min: 1_500, max: 2_400 },
      speedY: { min: -11, max: -5 },
      speedX: { min: -2, max: 2 },
      // La brisa se lleva el humo hacia el este, poco a poco.
      accelerationX: 3,
      // Pequeña al salir y abriéndose al subir; de noche, bajo la luz de la hora, tiene que seguir viéndose.
      scale: { start: 0.6, end: 1.9 },
      alpha: { start: 0.6, end: 0 },
      tint: 0xe4e0d8,
      maxAliveParticles: MAX_ALIVE,
    });
    // Por encima de la gente y de los props, por debajo de techos y de la luz de la hora.
    this.emitter.setDepth(LAYER.overhead - 1);
  }

  /** Una bocanada: unas volutas a la vez, al soltar el aire. */
  puff(x: number, y: number, count: number): void {
    const n = this.reduced ? Math.floor(count / 2) : count;
    if (n > 0) this.emitter.emitParticleAt(x, y, n);
  }

  /** El hilo de la punta del cigarro: una voluta suelta. */
  wisp(x: number, y: number): void {
    if (!this.reduced) this.emitter.emitParticleAt(x, y, 1);
  }

  /** Volutas vivas ahora (depuración y pruebas). */
  get alive(): number {
    return this.emitter.getAliveParticleCount();
  }
}
