/**
 * Etiqueta de la puerta que tienes delante: a dónde lleva y, si cuesta algo,
 * cuánto. El precio se ve antes de pagarlo, no después.
 */
/**
 * Verbos con los que empieza la etiqueta y que el botón de acción táctil ya dice (WorldScene.actionLabel y el
 * «Levantarse» sentado): en táctil se ocultan (style.css, .hint__verb), y si no queda nada más, el aviso entero.
 */
const ACTION_VERBS = ['Sentarse', 'Entrenar', 'Tirar a canasta', 'Levantarse'];

export class TargetHint {
  private readonly root: HTMLElement;
  private current = '';

  constructor(root: HTMLElement) {
    this.root = root;
  }

  show(text: string): void {
    if (text === this.current) return;
    this.current = text;
    const verb = ACTION_VERBS.find((v) => text === v || text.startsWith(`${v} · `));
    this.root.toggleAttribute('data-verb-only', text === verb);
    if (verb && text !== verb) {
      const lead = document.createElement('span');
      lead.className = 'hint__verb';
      lead.textContent = `${verb} · `;
      this.root.replaceChildren(lead, text.slice(lead.textContent.length));
    } else {
      this.root.textContent = text;
    }
    this.root.classList.add('is-visible');
  }

  hide(): void {
    if (this.current === '') return;
    this.current = '';
    this.root.classList.remove('is-visible');
  }
}
