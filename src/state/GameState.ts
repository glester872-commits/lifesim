import Phaser from 'phaser';
import type { EventMemory, Facing, GameStateData } from '../types/game';
import { emptyMemory } from '../systems/MetroEventManager';
import { INITIAL_CLOCK, INITIAL_ENERGY, INITIAL_MONEY, TILE } from '../config/constants';
import { LOCATIONS, START_LOCATION, START_SPAWN } from '../data/locations';

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
    };
  }
}

export function createInitialState(): GameStateData {
  const start = LOCATIONS.find((loc) => loc.id === START_LOCATION);
  if (!start) throw new Error(`Localizacion inicial desconocida: ${START_LOCATION}`);
  const spawn = start.spawns[START_SPAWN];
  if (!spawn) throw new Error(`Spawn inicial desconocido: ${START_SPAWN}`);

  return {
    money: INITIAL_MONEY,
    energy: INITIAL_ENERGY,
    day: INITIAL_CLOCK.day,
    hour: INITIAL_CLOCK.hour,
    minute: INITIAL_CLOCK.minute,
    locationId: start.id,
    position: { x: spawn.tx * TILE + TILE / 2, y: spawn.ty * TILE + TILE },
    facing: spawn.facing,
    events: emptyMemory(),
  };
}
