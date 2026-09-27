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

  private readonly state: GameState;

  constructor(root: HTMLElement, state: GameState) {
    this.state = state;
    root.innerHTML = `
      <p class="hud__mark">LIFE<i>//</i>SIM</p>
      <p class="hud__clock"></p>
      <p class="hud__vitals"><span class="hud__money"></span><span class="hud__energy"></span></p>
      <p class="hud__card"></p>
      <p class="hud__saved">partida guardada</p>
    `;

    this.clockEl = this.pick(root, '.hud__clock');
    this.moneyEl = this.pick(root, '.hud__money');
    this.energyEl = this.pick(root, '.hud__energy');
    this.savedEl = this.pick(root, '.hud__saved');
    this.cardEl = this.pick(root, '.hud__card');

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
    this.moneyEl.textContent = money(cash);
    this.energyEl.textContent = `⚡ ${energy}`;
    const card = this.state.wallet.cards.transport;
    this.cardEl.textContent = card === undefined ? '' : `tarjeta · ${money(card)}`;
    this.cardEl.hidden = card === undefined;
  }

  private flashSaved(): void {
    this.savedEl.classList.add('is-visible');
    window.clearTimeout(this.savedTimer);
    this.savedTimer = window.setTimeout(() => {
      this.savedEl.classList.remove('is-visible');
    }, 1400);
  }
}
