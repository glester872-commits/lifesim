/**
 * Etiqueta de la puerta que tienes delante: a dónde lleva y, si cuesta algo,
 * cuánto. El precio se ve antes de pagarlo, no después.
 */
export class TargetHint {
  private readonly root: HTMLElement;
  private current = '';

  constructor(root: HTMLElement) {
    this.root = root;
  }

  show(text: string): void {
    if (text === this.current) return;
    this.current = text;
    this.root.textContent = text;
    this.root.classList.add('is-visible');
  }

  hide(): void {
    if (this.current === '') return;
    this.current = '';
    this.root.classList.remove('is-visible');
  }
}
