const VISIBLE_MS = 5_000;

/** Megafonía: una línea discreta arriba, que se desvanece sola. */
export class Announcer {
  private readonly root: HTMLElement;
  private readonly text: HTMLElement;
  private hideTimer: number | undefined;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = '<span class="announce__label">megafonía</span><span class="announce__text"></span>';
    const text = root.querySelector<HTMLElement>('.announce__text');
    if (!text) throw new Error('Announcer: falta .announce__text');
    this.text = text;
  }

  say(message: string): void {
    this.text.textContent = message;
    this.root.classList.add('is-visible');
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hide(), VISIBLE_MS);
  }

  hide(): void {
    window.clearTimeout(this.hideTimer);
    this.root.classList.remove('is-visible');
  }
}
