import Phaser from 'phaser';
import type { EventMemory, Facing, GameStateData } from '../types/game';
import type { Appearance } from '../data/appearance';
import type { Wallet } from '../systems/Commerce';
import { START_FITNESS, type Fitness } from '../systems/Fitness';

/**
 * Estado central de la partida.
 *
 * Emite 'change' sólo cuando cambia algo que el HUD muestra. La posición y la
 * orientación se escriben cada frame, así que son campos planos sin evento:
 * emitir ahí obligaría al HUD a redibujarse 60 veces por segundo sin motivo.
 */
export class GameState extends Phaser.Events.EventEmitter {
  private _money: number;
  private _energy: number;
  private _day: number;
  private _hour: number;
  private _minute: number;

  locationId: string;
  position: { x: number; y: number };
  facing: Facing;
  /** Memoria narrativa; la escribe MetroEventManager y no se muestra en el HUD. */
  events: EventMemory;
  private _inventory: Record<string, number>;
  private _cards: Record<string, number>;
  private _appearance: Record<string, Appearance>;
  private _wardrobe: string[];
  private _fitness: Fitness;

  constructor(initial: GameStateData) {
    super();
    this._money = initial.money;
    this._energy = initial.energy;
    this._day = initial.day;
    this._hour = initial.hour;
    this._minute = initial.minute;
    this.locationId = initial.locationId;
    this.position = { x: initial.position.x, y: initial.position.y };
    this.facing = initial.facing;
    this.events = initial.events;
    this._inventory = { ...initial.inventory };
    this._cards = { ...initial.cards };
    this._appearance = structuredClone(initial.appearance);
    this._wardrobe = [...initial.wardrobe];
    this._fitness = { ...(initial.fitness ?? START_FITNESS) };
  }

  /** Forma física: lo que han dejado las sesiones de gimnasio (systems/Fitness.ts). Se guarda con la partida. */
  get fitness(): Fitness {
    return { ...this._fitness };
  }

  set fitness(f: Fitness) {
    this._fitness = { ...f };
    this.emit('fitness');
  }

  /** Ropa del jugador: lo que ha comprado (systems/Retail.ts), se lleve o no puesto. */
  get wardrobe(): readonly string[] {
    return [...this._wardrobe];
  }

  set wardrobe(ids: readonly string[]) {
    this._wardrobe = [...ids];
  }

  /**
   * Dinero, objetos y tarjetas juntos: lo que toca una compra. systems/Commerce.ts
   * trabaja sobre una copia y devuelve la nueva; aquí sólo se aplica y se avisa.
   */
  get wallet(): Wallet {
    return { money: this._money, inventory: { ...this._inventory }, cards: { ...this._cards } };
  }

  set wallet(w: Wallet) {
    this._money = w.money;
    this._inventory = { ...w.inventory };
    this._cards = { ...w.cards };
    this.emit('change');
  }

  get money(): number {
    return this._money;
  }

  set money(value: number) {
    if (value === this._money) return;
    this._money = value;
    this.emit('change');
  }

  get energy(): number {
    return this._energy;
  }

  set energy(value: number) {
    const clamped = Phaser.Math.Clamp(value, 0, 100);
    if (clamped === this._energy) return;
    this._energy = clamped;
    this.emit('change');
  }

  get day(): number {
    return this._day;
  }

  get hour(): number {
    return this._hour;
  }

  get minute(): number {
    return this._minute;
  }

  setClock(day: number, hour: number, minute: number): void {
    if (day === this._day && hour === this._hour && minute === this._minute) return;
    this._day = day;
    this._hour = hour;
    this._minute = minute;
    this.emit('change');
  }

  /** Lo cambiado del aspecto de alguien que persiste ('player' o un personaje con nombre). */
  appearanceOf(id: string): Appearance {
    return { ...this._appearance[id] };
  }

  /** Emite 'appearance' con el id: quien pinta a esa persona la vuelve a pintar. */
  setAppearance(id: string, appearance: Appearance): void {
    this._appearance[id] = { ...appearance };
    this.emit('appearance', id);
  }

  get snapshot(): GameStateData {
    return {
      money: this._money,
      energy: this._energy,
      day: this._day,
      hour: this._hour,
      minute: this._minute,
      locationId: this.locationId,
      position: { x: this.position.x, y: this.position.y },
      facing: this.facing,
      events: structuredClone(this.events),
      inventory: { ...this._inventory },
      cards: { ...this._cards },
      appearance: structuredClone(this._appearance),
      wardrobe: [...this._wardrobe],
      fitness: { ...this._fitness },
    };
  }
}

// La partida nueva vive en systems/SaveSystem (sin Phaser: también la usan los scripts de comprobación).
export { createInitialState } from '../systems/SaveSystem';
