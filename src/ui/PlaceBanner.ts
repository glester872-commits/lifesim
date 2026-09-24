const VISIBLE_MS = 2_600;

/**
 * Nombre del sitio al llegar, bajo el HUD. Sólo cuando cambias de sitio: al
 * pasear no aparece, y así cuando aparece se lee.
 */
export class PlaceBanner {
  private readonly root: HTMLElement;
  private current = '';
  private hideTimer: number | undefined;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  show(name: string): void {
    if (name === this.current) return;
    this.current = name;
    this.root.textContent = name;
    // Reinicia la animación de la barra aunque el nodo ya estuviera visible.
    this.root.classList.remove('is-visible');
    void this.root.offsetWidth;
    this.root.classList.add('is-visible');
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.root.classList.remove('is-visible'), VISIBLE_MS);
  }
}
