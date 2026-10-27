/**
 * Pausa (Esc sin nada abierto, o el botón «Menú»): seguir, guardar o guardar y volver a la pantalla de inicio.
 * Abierta, main.ts para la escena (ni reloj, ni gente, ni autoguardado) y el teclado no llega al jugador.
 * Volver al inicio es recargar la página: así ninguna escena, escucha ni temporizador de la partida sobrevive.
 * Nunca dice «guardado» si el navegador no lo ha escrito.
 */
export interface PauseHooks {
  pause(): void;
  resume(): void;
  /** true sólo si se ha escrito de verdad. */
  save(): boolean;
  /** Quién juega (systems/PlayerIdentity), para el título del panel. */
  name(): string;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class PauseMenu {
  private readonly root: HTMLElement;
  private readonly hooks: PauseHooks;
  private open = false;
  private status = '';
  private quitUnsaved = false;
  private returnFocus: HTMLElement | null = null;

  constructor(root: HTMLElement, button: HTMLButtonElement, hooks: PauseHooks) {
    this.root = root;
    this.hooks = hooks;
    root.hidden = true;
    button.addEventListener('click', () => {
      button.blur();
      if (!this.open) this.show();
    });
    root.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]')?.dataset.action;
      if (action) this.act(action);
    });
    // Las teclas se quedan aquí: ni Esc, ni E, ni las flechas llegan a Phaser mientras está abierta.
    root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') return this.hide();
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const buttons = [...root.querySelectorAll<HTMLButtonElement>('button')];
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(at + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(): void {
    if (this.open) return;
    this.open = true;
    this.status = '';
    this.quitUnsaved = false;
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.hooks.pause();
    this.root.hidden = false;
    this.render();
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.root.hidden = true;
    this.root.innerHTML = '';
    this.hooks.resume();
    this.returnFocus?.focus?.();
  }

  private act(action: string): void {
    if (action === 'resume') return this.hide();
    if (action === 'save') {
      this.status = this.hooks.save() ? 'Partida guardada.' : 'No se ha podido guardar: el almacenamiento del navegador está lleno o bloqueado. La partida sigue abierta.';
    } else if (action === 'quit') {
      if (this.quitUnsaved || this.hooks.save()) {
        window.location.reload();
        return;
      }
      this.quitUnsaved = true;
      this.status = 'No se ha podido guardar. Si sales ahora, pierdes lo jugado desde el último guardado.';
    }
    this.render();
  }

  private render(): void {
    const item = (action: string, label: string): string => `<button type="button" class="title__button" data-action="${action}">${label}</button>`;
    this.root.innerHTML = `<div class="title__panel" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <h2 class="title__heading" id="pause-title">Pausa · ${esc(this.hooks.name())}</h2>
        <nav class="title__menu">
          ${item('resume', 'Seguir')}
          ${item('save', 'Guardar')}
          ${item('quit', this.quitUnsaved ? 'Salir sin guardar' : 'Guardar y volver al inicio')}
        </nav>
        <p class="${this.status.startsWith('Partida') ? 'title__save' : 'title__warn'}" role="status" aria-live="polite">${this.status}</p>
      </div>`;
    this.root.querySelector<HTMLButtonElement>(this.status ? `[data-action="${this.quitUnsaved ? 'quit' : 'save'}"]` : 'button')?.focus();
  }
}
