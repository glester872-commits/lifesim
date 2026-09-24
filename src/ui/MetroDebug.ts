/** Panel de depuración de la estación. Sólo se usa si METRO_CONFIG.debug. */
export class MetroDebug {
  private readonly root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  show(text: string): void {
    if (this.root.textContent !== text) this.root.textContent = text;
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
