/**
 * Menú de opciones en DOM: comprar en una máquina, elegir destino en el tren,
 * elegir qué hacer en un sitio, usar algo de la bolsa. No sabe qué vende ni a
 * dónde lleva: recibe opciones y avisa de la elegida. La Scene le pasa las
 * teclas mientras está abierto (el reloj y el jugador se paran), salvo que se
 * abra «en vivo»: pedir en una mesa o pagar la cuenta pasa con el local en
 * marcha, como una conversación.
 */
export interface MenuOption {
  label: string;
  /** Precio, duración o saldo, alineado a la derecha. */
  detail?: string;
  /** Si no se puede elegir, por qué; se ve al intentarlo. */
  disabled?: string;
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
  private current: Open | null = null;
  private selected = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <div class="menu__panel">
        <p class="menu__title"></p>
        <p class="menu__text"></p>
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
  }

  get isOpen(): boolean {
    return this.current !== null;
  }

  /** Abierto sin parar el mundo (pedir en la mesa, pagar): el reloj y la gente siguen. */
  get isLive(): boolean {
    return this.current?.live ?? false;
  }

  /** Abre (o rehace, si ya estaba abierto) con estas opciones. `note` es el resultado de lo último. */
  open(title: string, text: string, options: readonly MenuOption[], onPick: (index: number) => void, onCancel?: () => void, note = '', selected = 0, live = false): void {
    this.current = { options, onPick, onCancel, live };
    this.selected = Math.min(Math.max(0, selected), options.length - 1);
    this.titleEl.textContent = title;
    this.textEl.textContent = text;
    this.noteEl.textContent = note;
    this.render();
    this.root.classList.add('is-open');
  }

  close(): void {
    this.current = null;
    this.root.classList.remove('is-open', 'is-peek');
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
        li.append(label, detail);
        // Con el dedo (o el ratón), tocar una opción es elegirla: lo mismo que su número.
        li.addEventListener('click', () => this.confirm(i));
        return li;
      }),
    );
  }
}
