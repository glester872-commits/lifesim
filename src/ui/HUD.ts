import type { GameState } from '../state/GameState';
import { formatClock } from '../systems/TimeSystem';

// es-ES omite el punto en cifras de cuatro digitos; el formato pedido lo lleva.
const MONEY = new Intl.NumberFormat('es-ES', {
  useGrouping: true,
  maximumFractionDigits: 0,
});
// Con céntimos sólo cuando los hay: €1.200, pero €1.198,80 tras un refresco.
const CENTS = new Intl.NumberFormat('es-ES', {
  useGrouping: true,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const money = (n: number): string => `€${(Number.isInteger(n) ? MONEY : CENTS).format(n)}`;

/**
 * HUD en DOM, no en canvas: el texto queda nítido a cualquier zoom y las
 * Scenes no cargan con responsabilidades de interfaz.
 */
export class HUD {
  private readonly clockEl: HTMLElement;
  private readonly moneyEl: HTMLElement;
  private readonly energyEl: HTMLElement;
  private readonly savedEl: HTMLElement;
  /** Saldo de la tarjeta de transporte; no se ve hasta tenerla. */
  private readonly cardEl: HTMLElement;
  private savedTimer: number | undefined;
  /** Lo próximo de la agenda (systems/Agenda), con su sitio y el viaje; vacío si no hay nada. */
  private readonly nextEl: HTMLElement;
  /** Móvil: botón y desplegable con la tarjeta y lo próximo. */
  private readonly moreBtn: HTMLButtonElement;
  private readonly moreEl: HTMLElement;
  /** Si el reloj corre o está parado ahora (un menú o el mapa lo paran; el móvil, no). */
  private clockMode: 'running' | 'paused' | 'phone' = 'running';

  private readonly state: GameState;
  private readonly root: HTMLElement;

  constructor(root: HTMLElement, state: GameState) {
    this.state = state;
    this.root = root;
    root.innerHTML = `
      <p class="hud__mark">LIFE<i>//</i>SIM</p>
      <p class="hud__clock"></p>
      <p class="hud__vitals"><span class="hud__money"></span><span class="hud__energy"></span></p>
      <button type="button" class="hud__more-btn" id="hud-more-button" aria-expanded="false" aria-controls="hud-more" aria-label="Detalles: agenda y tarjeta" title="Detalles: agenda y tarjeta" hidden><span aria-hidden="true">▾</span></button>
      <div class="hud__more" id="hud-more">
        <p class="hud__card"></p>
        <p class="hud__next"></p>
      </div>
      <p class="hud__saved">partida guardada</p>
    `;

    // Móvil (style.css): tarjeta y agenda van a un desplegable bajo la barra. En escritorio el botón no se ve y
    // .hud__more es display: contents, así que la placa queda como siempre.
    this.moreBtn = this.pick(root, '.hud__more-btn') as HTMLButtonElement;
    this.moreEl = this.pick(root, '.hud__more');
    this.moreBtn.addEventListener('click', () => {
      this.moreBtn.blur();
      this.setMore(!this.moreEl.classList.contains('is-open'));
    });
    document.addEventListener('pointerdown', (e) => {
      if (!root.contains(e.target as Node)) this.setMore(false);
    }, true);
    // En captura y antes de Phaser (el HUD se construye antes que el juego): Esc cierra el desplegable y no abre además la pausa.
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.moreEl.classList.contains('is-open')) {
        this.setMore(false);
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    }, true);

    this.nextEl = this.pick(root, '.hud__next');
    this.clockEl = this.pick(root, '.hud__clock');
    this.moneyEl = this.pick(root, '.hud__money');
    this.energyEl = this.pick(root, '.hud__energy');
    this.savedEl = this.pick(root, '.hud__saved');
    this.cardEl = this.pick(root, '.hud__card');

    // El rótulo del sitio (#place) va justo debajo, crezca lo que crezca la placa.
    // --top-inset: lo más bajo de la placa y los botones (topInset); en móvil los avisos van debajo, sin tapar los iconos.
    const sync = (): void => {
      const css = document.documentElement.style;
      css.setProperty('--hud-bottom', `${Math.round(root.getBoundingClientRect().bottom)}px`);
      css.setProperty('--top-inset', `${Math.round(this.topInset())}px`);
    };
    new ResizeObserver(sync).observe(root);
    window.addEventListener('resize', sync);
    state.on('change', () => this.render());
    state.on('saved', () => this.flashSaved());
    this.render();
  }

  private pick(root: HTMLElement, selector: string): HTMLElement {
    const el = root.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`HUD: falta ${selector}`);
    return el;
  }

  private render(): void {
    const { day, hour, minute, money: cash, energy } = this.state;
    this.clockEl.textContent = formatClock(day, hour, minute);
    this.clockEl.dataset.mode = this.clockMode;
    this.moneyEl.textContent = money(cash);
    this.energyEl.textContent = `⚡ ${energy}`;
    const card = this.state.wallet.cards.transport;
    this.cardEl.textContent = card === undefined ? '' : `tarjeta · ${money(card)}`;
    this.cardEl.hidden = card === undefined;
    this.syncMore();
  }

  /** Sin nada que desplegar, no hay botón: ninguna afordancia vacía. */
  private syncMore(): void {
    const empty = this.cardEl.hidden && !this.nextEl.textContent;
    this.moreBtn.hidden = empty;
    if (empty) this.setMore(false);
  }

  private setMore(open: boolean): void {
    this.moreEl.classList.toggle('is-open', open);
    this.moreBtn.setAttribute('aria-expanded', String(open));
  }

  /** «Próximo · Turno en Decathlon · hoy 10:00 · …»; `urgency` lo colorea: hay que salir ya o ya no se llega. */
  setNext(text: string, urgency: 'ok' | 'tight' | 'late'): void {
    if (this.nextEl.textContent === text && this.nextEl.dataset.urgency === urgency) return;
    // « (P)» va en un span que el táctil oculta (body.has-touch .hud__key): nodos, nunca innerHTML.
    const parts = text.split(/(\s\((?:[A-Z]|Esc)\))/);
    this.nextEl.replaceChildren(...parts.map((p, i) => {
      if (i % 2 === 0) return document.createTextNode(p);
      const key = document.createElement('span');
      key.className = 'hud__key';
      key.textContent = p;
      return key;
    }));
    this.nextEl.dataset.urgency = urgency;
    this.nextEl.hidden = !text;
    // Con el desplegable cerrado, la urgencia se ve en el botón (un punto) y se dice en su nombre.
    this.moreBtn.dataset.urgency = urgency;
    const label = `Detalles: agenda y tarjeta${urgency === 'tight' ? ' · aviso: hay que salir ya' : urgency === 'late' ? ' · aviso: llegas tarde' : ''}`;
    this.moreBtn.setAttribute('aria-label', label);
    this.moreBtn.title = label;
    this.syncMore();
  }

  /**
   * Viendo un partido desde la grada (WorldScene.frameMatch): la placa se queda en la hora, el dinero y la energía, sin
   * rótulo, tarjeta ni agenda, para no tapar el área de la portería izquierda (EST-004). Al levantarse, vuelve entera.
   */
  setWatching(on: boolean): void {
    this.root.toggleAttribute('data-watch', on);
  }

  /** Hasta dónde baja (px de CSS desde arriba) lo que tapa la parte de arriba: esta placa y los botones de las esquinas. */
  topInset(): number {
    const corner = ['#map-button', '#phone-button', '#sound-button', '#bag-button'].map((s) => document.querySelector(s));
    return Math.max(0, ...[this.root, ...corner].map((el) => (el instanceof HTMLElement && el.offsetParent ? el.getBoundingClientRect().bottom : 0)));
  }

  /** El reloj parado (menú, mapa, leyendo lo que ha pasado) o corriendo con el móvil abierto: se dice junto a la hora. */
  setClockMode(mode: 'running' | 'paused' | 'phone'): void {
    if (mode === this.clockMode) return;
    this.clockMode = mode;
    this.clockEl.dataset.mode = mode;
  }

  private flashSaved(): void {
    this.savedEl.classList.add('is-visible');
    window.clearTimeout(this.savedTimer);
    this.savedTimer = window.setTimeout(() => {
      this.savedEl.classList.remove('is-visible');
    }, 1400);
  }
}
