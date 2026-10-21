/**
 * Las texturas con el acabado HD-03 de la gente (16 × 24, world/TextureFactory), hechas cuando alguien va a salir en
 * escena y no al arrancar. Una por aspecto (la ropa de calle, el abrigo, el verano, la capucha o el gimnasio son
 * aspectos distintos: sólo se hace el que se ve).
 *
 * Cada sprite que la muestra la retiene (acquire) y la suelta al esconderse (release). Se hornea por celdas, unas
 * pocas cada frame (pump), sin parar el juego; mientras, se ve el dibujo simple de la misma persona. Lo que
 * nadie retiene se queda guardado para la próxima vez y, si se pasa del límite de memoria, se tira lo que lleva
 * más tiempo sin usarse. Lo retenido no se tira nunca, aunque haya que pasarse del límite.
 *
 * Sin Phaser: quien dibuja y registra es el `backend` (world/TextureFactory); así se prueba en node (scripts/check-hd-cache).
 */
export interface HdBackend {
  /** Reserva la textura vacía de un aspecto. */
  create(id: string): void;
  /** Pinta una celda (una dirección y una pose) de su textura. */
  paint(id: string, cell: number): void;
  /** La textura está completa: súbela y apunta sus animaciones a ella. */
  done(id: string): void;
  /** Ya no está: devuelve sus animaciones al dibujo simple y borra la textura. */
  drop(id: string): void;
}

interface Entry {
  refs: number;
  /** Celdas pintadas (-1: aún sin textura); está lista cuando llega a `cells`. */
  painted: number;
  /** Último uso (un contador, no un reloj): el menor es el primero en irse. */
  used: number;
}

export class HdCache {
  private readonly entries = new Map<string, Entry>();
  private tick = 0;
  private readonly backend: HdBackend;
  /** Celdas por aspecto (direcciones × poses). */
  readonly cells: number;
  /** Lo que ocupa una textura, en bytes. */
  readonly bytesEach: number;
  /** Límite de memoria de lo guardado; lo retenido puede pasarlo. */
  readonly limitBytes: number;

  constructor(backend: HdBackend, cells: number, bytesEach: number, limitBytes: number) {
    this.backend = backend;
    this.cells = cells;
    this.bytesEach = bytesEach;
    this.limitBytes = limitBytes;
  }

  /** Un sprite va a mostrar este aspecto: se queda hasta que lo suelte. Barato: el horneado va en pump. */
  acquire(id: string): void {
    let e = this.entries.get(id);
    if (!e) {
      e = { refs: 0, painted: -1, used: 0 };
      this.entries.set(id, e);
    }
    e.refs++;
    e.used = ++this.tick;
  }

  /** Ese sprite ya no lo muestra. Si nadie lo retiene, puede irse cuando falte memoria. */
  release(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.refs = Math.max(0, e.refs - 1);
    e.used = ++this.tick;
    this.trim();
  }

  ready(id: string): boolean {
    const e = this.entries.get(id);
    return !!e && e.painted >= this.cells;
  }

  refs(id: string): number {
    return this.entries.get(id)?.refs ?? 0;
  }

  /** Aspectos con textura reservada (lista o a medias). */
  get size(): number {
    let n = 0;
    for (const e of this.entries.values()) if (e.painted >= 0) n++;
    return n;
  }

  get bytes(): number {
    return this.size * this.bytesEach;
  }

  /** Pendientes de hornear para alguien que los muestra. */
  get pending(): number {
    let n = 0;
    for (const e of this.entries.values()) if (e.refs > 0 && e.painted < this.cells) n++;
    return n;
  }

  /**
   * Hornea lo pendiente hasta gastar `budgetMs` (al menos una celda, para que siempre avance), primero lo que lleva
   * más tiempo esperando. Lo que ya nadie retiene no se hornea. Devuelve las celdas pintadas.
   */
  pump(budgetMs: number, now: () => number = () => performance.now()): number {
    const start = now();
    let n = 0;
    const queue = [...this.entries].filter(([, e]) => e.refs > 0 && e.painted < this.cells).sort((a, b) => a[1].used - b[1].used);
    for (const [id, e] of queue) {
      if (e.painted < 0) {
        this.backend.create(id);
        e.painted = 0;
      }
      while (e.painted < this.cells) {
        if (n > 0 && now() - start >= budgetMs) return n;
        this.backend.paint(id, e.painted++);
        n++;
      }
      this.backend.done(id);
    }
    if (n > 0) this.trim();
    return n;
  }

  /** Lo hornea ya, entero (herramientas de desarrollo y repintados). */
  finish(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    if (e.painted < 0) this.backend.create(id);
    for (let c = Math.max(0, e.painted); c < this.cells; c++) this.backend.paint(id, c);
    e.painted = this.cells;
    this.backend.done(id);
  }

  /** Vuelve a pintar lo que ya tiene textura (otra apariencia, la ropa de siempre para comparar). */
  repaint(id?: string): void {
    for (const [key, e] of this.entries) {
      if ((id !== undefined && key !== id) || e.painted < 0) continue;
      e.painted = 0;
      this.finish(key);
    }
  }

  /** Mientras se pase del límite, tira lo que nadie retiene, lo usado hace más tiempo primero. */
  private trim(): void {
    while (this.bytes > this.limitBytes) {
      let victim: string | null = null;
      let oldest = Infinity;
      for (const [id, e] of this.entries) {
        if (e.refs === 0 && e.painted >= 0 && e.used < oldest) {
          oldest = e.used;
          victim = id;
        }
      }
      if (victim === null) return;
      this.entries.delete(victim);
      this.backend.drop(victim);
    }
    // Lo que nadie retiene y nunca llegó a tener textura no ocupa: fuera de la lista.
    for (const [id, e] of this.entries) if (e.refs === 0 && e.painted < 0) this.entries.delete(id);
  }
}
