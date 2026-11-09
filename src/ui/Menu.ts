/**
 * Menú de opciones en DOM: comprar en una máquina, elegir destino en el tren,
 * elegir qué hacer en un sitio, usar algo de la bolsa. No sabe qué vende ni a
 * dónde lleva: recibe opciones y avisa de la elegida. La Scene le pasa las
 * teclas mientras está abierto (el reloj y el jugador se paran), salvo que se
 * abra «en vivo»: pedir en una mesa o pagar la cuenta pasa con el local en
 * marcha, como una conversación.
 */
import { PICK_LOCK_MS } from '../config/constants.ts';

export interface MenuOption {
  label: string;
  /** Precio, duración o saldo, alineado a la derecha. */
  detail?: string;
  /** Si no se puede elegir, por qué; se ve al intentarlo. */
  disabled?: string;
  /** Dibujo de lo que se compra (ui/ItemIcons: data URL de 12 × 12), a la izquierda del nombre. Decorativo. */
  icon?: string;
}

interface Open {
  options: readonly MenuOption[];
  onPick: (index: number) => void;
  onCancel?: () => void;
  live: boolean;
}

export class Menu {
  private readonly root: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly noteEl: HTMLElement;
  private readonly figureEl: HTMLElement;
  private current: Open | null = null;
  private selected = 0;
  /** Identidad de la pantalla a la vista y cuándo apareció: una nueva no acepta elecciones durante PICK_LOCK_MS. */
  private shownScreen = '';
  private shownAt = -Infinity;
  /** Avisa al cerrarse, por donde sea (Esc, Cerrar, cambio de escena): una prueba de ropa no sobrevive al menú. */
  onClosed?: () => void;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <div class="menu__panel">
        <p class="menu__title"></p>
        <p class="menu__text"></p>
        <div class="menu__figure" hidden></div>
        <ol class="menu__list"></ol>
        <p class="menu__note"></p>
        <p class="menu__hint">W/S elegir · E aceptar · Esc salir</p>
      </div>
    `;
    const pick = (s: string): HTMLElement => {
      const el = root.querySelector<HTMLElement>(s);
      if (!el) throw new Error(`Menú: falta ${s}`);
      return el;
    };
    this.titleEl = pick('.menu__title');
    this.textEl = pick('.menu__text');
    this.listEl = pick('.menu__list');
    this.noteEl = pick('.menu__note');
    this.figureEl = pick('.menu__figure');
  }

  get isOpen(): boolean {
    return this.current !== null;
  }

  /** Abierto sin parar el mundo (pedir en la mesa, pagar): el reloj y la gente siguen. */
  get isLive(): boolean {
    return this.current?.live ?? false;
  }

  /** Abre o rehace el menú. `note` es el resultado de lo último; `screenId` distingue pantallas con el mismo título. */
  open(title: string, text: string, options: readonly MenuOption[], onPick: (index: number) => void, onCancel?: () => void, note = '', selected = 0, live = false, screenId = title): void {
    // Rehacer la misma pantalla (cantidad, una nota) no bloquea; otra pantalla, sí.
    if (!this.current || screenId !== this.shownScreen) this.shownAt = performance.now();
    this.shownScreen = screenId;
    this.current = { options, onPick, onCancel, live };
    this.selected = Math.min(Math.max(0, selected), options.length - 1);
    this.clearFigure();
    this.titleEl.textContent = title;
    this.textEl.textContent = text;
    this.noteEl.textContent = note;
    this.render();
    this.root.classList.add('is-open');
  }

  close(): void {
    this.current = null;
    this.clearFigure();
    this.root.classList.remove('is-open', 'is-peek');
    this.onClosed?.();
  }

  /** Una imagen entre el texto y las opciones (el antes y después de un cambio de aspecto). Se quita con la pantalla. */
  figure(el: HTMLElement): void {
    this.figureEl.replaceChildren(el);
    this.figureEl.hidden = false;
    this.root.classList.add('has-figure');
  }

  private clearFigure(): void {
    this.figureEl.replaceChildren();
    this.figureEl.hidden = true;
    this.root.classList.remove('has-figure');
  }

  /** Baja el menú al borde de la pantalla para ver lo que hay detrás (el probador). Se quita al cerrar. */
  peek(on: boolean): void {
    this.root.classList.toggle('is-peek', on);
  }

  get index(): number {
    return this.selected;
  }

  move(delta: number): void {
    if (!this.current) return;
    const n = this.current.options.length;
    this.selected = (this.selected + delta + n) % n;
    this.render();
  }

  /** Elige la marcada, o la n-ésima (teclas 1–9). Una apagada sólo dice por qué. */
  confirm(index = this.selected): void {
    const open = this.current;
    if (!open || index < 0 || index >= open.options.length) return;
    if (performance.now() - this.shownAt < PICK_LOCK_MS) return;
    this.selected = index;
    const option = open.options[index];
    if (option.disabled) {
      this.noteEl.textContent = option.disabled;
      this.render();
      return;
    }
    open.onPick(index);
  }

  cancel(): void {
    const open = this.current;
    if (!open) return;
    this.close();
    open.onCancel?.();
  }

  private render(): void {
    const open = this.current;
    if (!open) return;
    this.listEl.replaceChildren(
      ...open.options.map((o, i) => {
        const li = document.createElement('li');
        li.className = `menu__item${i === this.selected ? ' is-selected' : ''}${o.disabled ? ' is-disabled' : ''}`;
        const label = document.createElement('span');
        label.textContent = `${i + 1}. ${o.label}`;
        const detail = document.createElement('span');
        detail.className = 'menu__detail';
        detail.textContent = o.detail ?? '';
        if (o.icon) {
          const img = document.createElement('img');
          img.className = 'menu__icon';
          img.src = o.icon;
          img.alt = '';
          label.prepend(img);
        }
        li.append(label, detail);
        // Con el dedo (o el ratón), tocar una opción es elegirla: lo mismo que su número.
        li.addEventListener('click', () => this.confirm(i));
        return li;
      }),
    );
    // En una lista que se desplaza, la marcada siempre a la vista (W/S por debajo del borde).
    this.listEl.children[this.selected]?.scrollIntoView({ block: 'nearest' });
  }
}
