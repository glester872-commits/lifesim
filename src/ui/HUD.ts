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
      <p class="hud__card"></p>
      <p class="hud__next"></p>
      <p class="hud__saved">partida guardada</p>
    `;

    this.nextEl = this.pick(root, '.hud__next');
    this.clockEl = this.pick(root, '.hud__clock');
    this.moneyEl = this.pick(root, '.hud__money');
    this.energyEl = this.pick(root, '.hud__energy');
    this.savedEl = this.pick(root, '.hud__saved');
    this.cardEl = this.pick(root, '.hud__card');

    // El rótulo del sitio (#place) va justo debajo, crezca lo que crezca la placa.
    new ResizeObserver(() => document.documentElement.style.setProperty('--hud-bottom', `${Math.round(root.getBoundingClientRect().bottom)}px`)).observe(root);
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
  }

  /** «Próximo · Turno en Decathlon · hoy 10:00 · …»; `urgency` lo colorea: hay que salir ya o ya no se llega. */
  setNext(text: string, urgency: 'ok' | 'tight' | 'late'): void {
    if (this.nextEl.textContent === text && this.nextEl.dataset.urgency === urgency) return;
    this.nextEl.textContent = text;
    this.nextEl.dataset.urgency = urgency;
    this.nextEl.hidden = !text;
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
