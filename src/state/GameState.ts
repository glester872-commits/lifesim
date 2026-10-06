import Phaser from 'phaser';
import type { EventMemory, Facing, GameStateData } from '../types/game';
import type { Appearance } from '../data/appearance';
import type { Wallet } from '../systems/Commerce';
import { START_FITNESS, type Fitness } from '../systems/Fitness';
import { createSocialProfile, type SocialProfile, type SocialState } from '../systems/Social';

/**
 * Estado central de la partida.
 *
 * Prompt 57 añade aquí el estado social persistente
 * de los personajes con nombre.
 */
export class GameState extends Phaser.Events.EventEmitter {
  private _money: number;
  private _energy: number;

  private _day: number;
  private _hour: number;
  private _minute: number;

  locationId: string;

  position: {
    x: number;
    y: number;
  };

  facing: Facing;

  /**
   * Memoria narrativa del metro.
   */
  events: EventMemory;

  private _inventory:
    Record<string, number>;

  private _cards:
    Record<string, number>;

  private _appearance:
    Record<string, Appearance>;

  private _wardrobe:
    string[];

  private _fitness:
    Fitness;

  /**
   * Prompt 57.
   *
   * id del Named Character -> relación con el jugador.
   */
  private _social:
    SocialState;

  constructor(
    initial: GameStateData,
  ) {
    super();

    this._money =
      initial.money;

    this._energy =
      initial.energy;

    this._day =
      initial.day;

    this._hour =
      initial.hour;

    this._minute =
      initial.minute;

    this.locationId =
      initial.locationId;

    this.position = {
      x:
        initial.position.x,

      y:
        initial.position.y,
    };

    this.facing =
      initial.facing;

    this.events =
      initial.events;

    this._inventory = {
      ...initial.inventory,
    };

    this._cards = {
      ...initial.cards,
    };

    this._appearance =
      structuredClone(
        initial.appearance,
      );

    this._wardrobe = [
      ...initial.wardrobe,
    ];

    this._fitness = {
      ...(
        initial.fitness ??
        START_FITNESS
      ),
    };

    this._social =
      structuredClone(
        initial.social ?? {},
      );
  }

  // ================================================================
  // FITNESS
  // ================================================================

  /**
   * Forma física acumulada.
   */
  get fitness(): Fitness {
    return {
      ...this._fitness,
    };
  }

  set fitness(
    f: Fitness,
  ) {
    this._fitness = {
      ...f,
    };

    this.emit(
      'fitness',
    );
  }

  // ================================================================
  // SOCIAL
  // ================================================================

  /**
   * Devuelve una COPIA segura del perfil social.
   *
   * Si nunca hemos hablado con esa persona,
   * comienza desde cero.
   */
  socialOf(
    id: string,
  ): SocialProfile {
    const profile =
      this._social[id];

    if (!profile) {
      return createSocialProfile();
    }

    return structuredClone(
      profile,
    );
  }

  /**
   * Guarda el perfil social completo de un Named Character.
   */
  setSocialProfile(
    id: string,
    profile: SocialProfile,
  ): void {
    this._social[id] =
      structuredClone(
        profile,
      );

    this.emit(
      'social',
      id,
    );
  }

  /**
   * Estado social completo.
   *
   * Se devuelve clonado para impedir modificaciones
   * accidentales fuera del GameState.
   */
  get social(): SocialState {
    return structuredClone(
      this._social,
    );
  }

  // ================================================================
  // INVENTARIO / ROPA
  // ================================================================

  /**
   * Ropa comprada por el jugador.
   */
  get wardrobe():
    readonly string[] {
    return [
      ...this._wardrobe,
    ];
  }

  set wardrobe(
    ids: readonly string[],
  ) {
    this._wardrobe = [
      ...ids,
    ];
  }

  /**
   * Dinero, objetos y tarjetas.
   */
  get wallet(): Wallet {
    return {
      money:
        this._money,

      inventory: {
        ...this._inventory,
      },

      cards: {
        ...this._cards,
      },
    };
  }

  set wallet(
    w: Wallet,
  ) {
    this._money =
      w.money;

    this._inventory = {
      ...w.inventory,
    };

    this._cards = {
      ...w.cards,
    };

    this.emit(
      'change',
    );
  }

  // ================================================================
  // DINERO / ENERGÍA
  // ================================================================

  get money(): number {
    return this._money;
  }

  set money(
    value: number,
  ) {
    if (
      value ===
      this._money
    ) {
      return;
    }

    this._money =
      value;

    this.emit(
      'change',
    );
  }

  get energy(): number {
    return this._energy;
  }

  set energy(
    value: number,
  ) {
    const clamped =
      Phaser.Math.Clamp(
        value,
        0,
        100,
      );

    if (
      clamped ===
      this._energy
    ) {
      return;
    }

    this._energy =
      clamped;

    this.emit(
      'change',
    );
  }

  // ================================================================
  // RELOJ
  // ================================================================

  get day(): number {
    return this._day;
  }

  get hour(): number {
    return this._hour;
  }

  get minute(): number {
    return this._minute;
  }

  setClock(
    day: number,
    hour: number,
    minute: number,
  ): void {
    if (
      day === this._day &&
      hour === this._hour &&
      minute === this._minute
    ) {
      return;
    }

    this._day =
      day;

    this._hour =
      hour;

    this._minute =
      minute;

    this.emit(
      'change',
    );
  }

  // ================================================================
  // APARIENCIA
  // ================================================================

  /**
   * Cambios persistentes de aspecto de una persona.
   */
  appearanceOf(
    id: string,
  ): Appearance {
    return {
      ...this._appearance[id],
    };
  }

  /**
   * Actualiza el aspecto persistente.
   */
  setAppearance(
    id: string,
    appearance: Appearance,
  ): void {
    this._appearance[id] = {
      ...appearance,
    };

    this.emit(
      'appearance',
      id,
    );
  }

  // ================================================================
  // SNAPSHOT
  // ================================================================

  /**
   * Todo lo necesario para guardar la partida.
   */
  get snapshot():
    GameStateData {
    return {
      money:
        this._money,

      energy:
        this._energy,

      day:
        this._day,

      hour:
        this._hour,

      minute:
        this._minute,

      locationId:
        this.locationId,

      position: {
        x:
          this.position.x,

        y:
          this.position.y,
      },

      facing:
        this.facing,

      events:
        structuredClone(
          this.events,
        ),

      inventory: {
        ...this._inventory,
      },

      cards: {
        ...this._cards,
      },

      appearance:
        structuredClone(
          this._appearance,
        ),

      wardrobe: [
        ...this._wardrobe,
      ],

      fitness: {
        ...this._fitness,
      },

      social:
        structuredClone(
          this._social,
        ),
    };
  }
}

// La partida nueva vive en systems/SaveSystem (sin Phaser: también la usan los scripts de comprobación).
export { createInitialState } from '../systems/SaveSystem';
