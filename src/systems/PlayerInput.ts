/**
 * La entrada del jugador que no es teclado: el joystick y los botones táctiles
 * (ui/MobileControls). Aquí sólo hay estado; los eventos táctiles lo escriben
 * y el bucle de scenes/WorldScene lo lee junto al teclado, con los mismos
 * nombres de tecla ('up', 'interact', 'map'…). No mueve nada por sí mismo: no
 * hay un segundo sistema de movimiento.
 */

/** Por debajo de esto, el stick está en reposo (el pulgar tiembla). */
const DEAD_ZONE = 0.18;
/** Más allá de esto en un eje, cuenta como flecha: elegir en un menú, mirar a un lado sentado. */
const ARROW = 0.55;

/** Lo que se le puede hacer ahora: el texto del botón de acción y si hay que ofrecer «volver». */
export interface TouchContext {
  /** Texto del botón de acción (Hablar, Entrar…); null si no hay nada cerca. */
  action: string | null;
  /** Hay un menú abierto: se ofrece volver (lo mismo que Esc). */
  back: boolean;
  /** Diálogo, menú o mapa abiertos: el joystick se aparta. */
  busy: boolean;
}

export class PlayerInput {
  /** El stick, de -1 a 1 en cada eje y de largo como mucho 1; 0 en reposo. */
  readonly stick = { x: 0, y: 0 };
  private readonly held = new Set<string>();
  /** Pulsaciones que aún no ha leído el bucle, con los frames que llevan esperando. */
  private readonly pending = new Map<string, number>();
  private context: TouchContext = { action: null, back: false, busy: false };
  private listener: ((c: TouchContext) => void) | null = null;

  /** El joystick, en coordenadas de pantalla (y hacia abajo). También hace de flechas. */
  setStick(x: number, y: number): void {
    const length = Math.hypot(x, y);
    const k = length > 1 ? 1 / length : 1;
    const rest = length < DEAD_ZONE;
    this.stick.x = rest ? 0 : x * k;
    this.stick.y = rest ? 0 : y * k;
    this.toggle('up', this.stick.y < -ARROW);
    this.toggle('down', this.stick.y > ARROW);
    this.toggle('left', this.stick.x < -ARROW);
    this.toggle('right', this.stick.x > ARROW);
  }

  press(name: string): void {
    if (this.held.has(name)) return;
    this.held.add(name);
    this.pending.set(name, 0);
  }

  release(name: string): void {
    this.held.delete(name);
  }

  /** Suelta todo (se han ocultado los controles o la ventana ha perdido el foco). */
  releaseAll(): void {
    this.held.clear();
    this.pending.clear();
    this.stick.x = 0;
    this.stick.y = 0;
  }

  isHeld(name: string): boolean {
    return this.held.has(name);
  }

  /** Si se pulsó desde el último frame; la pulsación se gasta al leerla, como JustDown. */
  consume(name: string): boolean {
    return this.pending.delete(name);
  }

  /**
   * Al empezar cada frame del juego: una pulsación que nadie ha leído en el
   * frame siguiente a producirse se descarta. Un toque con un diálogo recién
   * cerrado no se queda guardado para más tarde.
   */
  beginFrame(): void {
    for (const [name, age] of this.pending) {
      if (age >= 1) this.pending.delete(name);
      else this.pending.set(name, age + 1);
    }
  }

  /** Lo decide el mundo cada frame; sólo avisa a quien lo pinta cuando cambia. */
  setContext(c: TouchContext): void {
    const was = this.context;
    if (was.action === c.action && was.back === c.back && was.busy === c.busy) return;
    this.context = c;
    this.listener?.(c);
  }

  onContext(listener: (c: TouchContext) => void): void {
    this.listener = listener;
    listener(this.context);
  }

  private toggle(name: string, on: boolean): void {
    if (on) this.press(name);
    else this.release(name);
  }
}
