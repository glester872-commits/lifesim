// Sin Phaser: lo usan scenes, ui/DialogueBox y scripts/check-interaction.ts.

type Listener = (...args: never[]) => void;

/** Lo mínimo de un emisor de eventos (on / once / off / emit): lo único que usa quien escucha un diálogo. */
class Emitter {
  private readonly listeners = new Map<string, { fn: Listener; once: boolean }[]>();

  on(event: string, fn: Listener): this {
    this.add(event, fn, false);
    return this;
  }

  once(event: string, fn: Listener): this {
    this.add(event, fn, true);
    return this;
  }

  off(event: string, fn: Listener): this {
    const list = this.listeners.get(event);
    if (list) this.listeners.set(event, list.filter((l) => l.fn !== fn));
    return this;
  }

  protected emit(event: string, ...args: unknown[]): void {
    // Copia: quien escucha puede soltarse o añadirse mientras se avisa.
    for (const l of [...(this.listeners.get(event) ?? [])]) {
      if (l.once) this.off(event, l.fn);
      (l.fn as (...a: unknown[]) => void)(...args);
    }
  }

  private add(event: string, fn: Listener, once: boolean): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), { fn, once }]);
  }
}

/**
 * Conversación lineal, con una elección opcional al final. No sabe nada de
 * cómo se pinta: emite eventos y la capa de UI decide.
 *
 * Eventos: 'open' (speaker, line), 'line' (line), 'close'.
 *
 * Cómo se sale (igual con teclado, ratón y móvil): E / «Seguir» avanza y, en la
 * última línea, cierra; Esc / «Volver» cierra una charla sin opciones y, en una
 * pregunta, elige su despedida (`ask(..., cancel)`); una pregunta sin despedida
 * es una decisión y hay que responderla.
 */
export class DialogueSystem extends Emitter {
  private lines: readonly string[] = [];
  private index = 0;
  private open = false;
  private options: readonly string[] = [];
  private onPick: ((index: number) => void) | null = null;
  /** La opción que equivale a irse (la despedida): Esc o «Volver» la eligen. Sin ella, la pregunta es una decisión y no se salta. */
  private cancelIndex: number | null = null;

  get isOpen(): boolean {
    return this.open;
  }

  get hasMore(): boolean {
    return this.open && this.index < this.lines.length - 1;
  }

  /** Opciones visibles: sólo en la última línea de una pregunta. */
  get choices(): readonly string[] {
    return this.open && this.index === this.lines.length - 1 ? this.options : [];
  }

  /**
   * Si Esc / «Volver» hacen algo ahora: siempre en una charla sin opciones (se cierra,
   * como despedirse); en una pregunta, sólo si tiene opción de irse.
   */
  get canCancel(): boolean {
    return this.open && (this.options.length === 0 || this.cancelIndex !== null);
  }

  /**
   * Como start(), pero la última línea no se cierra con E: hay que elegir. `cancel`: la opción
   * que es irse; Esc o «Volver» la eligen aunque aún no se vean las opciones.
   */
  ask(speaker: string, lines: readonly string[], options: readonly string[], onPick: (index: number) => void, cancel?: number): void {
    if (this.open || lines.length === 0 || options.length === 0) return;
    this.options = options;
    this.onPick = onPick;
    this.cancelIndex = cancel !== undefined && cancel >= 0 && cancel < options.length ? cancel : null;
    this.start(speaker, lines);
  }

  choose(index: number): void {
    const pick = this.onPick;
    if (!pick || index < 0 || index >= this.choices.length) return;
    this.close();
    pick(index);
  }

  /** Esc / «Volver»: cierra una charla; en una pregunta con despedida, la elige. Devuelve si hizo algo. */
  cancel(): boolean {
    if (!this.canCancel) return false;
    if (this.options.length === 0) {
      this.close();
      return true;
    }
    const pick = this.onPick;
    const index = this.cancelIndex!;
    this.close();
    pick?.(index);
    return true;
  }

  start(speaker: string, lines: readonly string[]): void {
    if (this.open || lines.length === 0) return;
    this.lines = lines;
    this.index = 0;
    this.open = true;
    this.emit('open', speaker, lines[0]);
  }

  advance(): void {
    if (!this.open) return;
    if (this.index >= this.lines.length - 1) {
      if (this.options.length === 0) this.close();
      return;
    }
    this.index += 1;
    this.emit('line', this.lines[this.index]);
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.lines = [];
    this.index = 0;
    this.options = [];
    this.onPick = null;
    this.cancelIndex = null;
    this.emit('close');
  }
}
