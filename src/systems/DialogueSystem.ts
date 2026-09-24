import Phaser from 'phaser';

/**
 * Conversación lineal, con una elección opcional al final. No sabe nada de
 * cómo se pinta: emite eventos y la capa de UI decide.
 *
 * Eventos: 'open' (speaker, line), 'line' (line), 'close'.
 */
export class DialogueSystem extends Phaser.Events.EventEmitter {
  private lines: readonly string[] = [];
  private index = 0;
  private open = false;
  private options: readonly string[] = [];
  private onPick: ((index: number) => void) | null = null;

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

  /** Como start(), pero la última línea no se cierra con E: hay que elegir. */
  ask(speaker: string, lines: readonly string[], options: readonly string[], onPick: (index: number) => void): void {
    if (this.open || lines.length === 0 || options.length === 0) return;
    this.options = options;
    this.onPick = onPick;
    this.start(speaker, lines);
  }

  choose(index: number): void {
    const pick = this.onPick;
    if (!pick || index < 0 || index >= this.choices.length) return;
    this.close();
    pick(index);
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
    this.emit('close');
  }
}
