import Phaser from 'phaser';
import type { EventMemory, Facing, GameStateData } from '../types/game';
import type { Appearance } from '../data/appearance';
import type { Wallet } from '../systems/Commerce';
import { START_FITNESS, type Fitness } from '../systems/Fitness';
import { createSocialProfile, type SocialProfile, type SocialState } from '../systems/Social';
import { createStory, type NamedStory, type StoryState } from '../systems/Story';
import { createPhone, type PhoneNews, type PhoneState } from '../systems/Phone';
import type { Ticket } from '../systems/Tickets';
import type { JobProgress } from '../systems/Jobs';
import { LEDGER_SIZE, type HouseholdState, type Movement } from '../systems/Household';
import { emptyStudy, type StudyState } from '../systems/Study';
import { emptyParish, type ParishState } from '../systems/Parish';
import { emptyPregnancy, usePregnancies, type PregnancyState } from '../systems/Pregnancy';
import { startHousing, type HousingState } from '../systems/Housing';
import { parseAgenda, type AgendaState } from '../systems/Agenda';

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
   * En un sitio sin mapa (el menú de Decathlon, scenes/Menus.offMap): su parada. La escena sigue siendo la
   * estación de la que se salió; esto sólo lo lee la agenda para estimar viajes. No se guarda: al recargar se
   * vuelve a la estación. Lo borra la escena al cambiar de sitio.
   */
  private _offMap: string | null = null;

  get offMap(): string | null {
    return this._offMap;
  }

  setOffMap(stop: string | null): void {
    if (stop === this._offMap) return;
    this._offMap = stop;
    this.emit('change');
  }

  /**
   * Probándose una prenda (scenes/Menus.openGarment): el outfit de antes. No se guarda, y el snapshot guarda esto en
   * vez de la prueba, la guarde quien la guarde (la escena, el cierre de la pestaña): sin pagar, no se queda puesta.
   */
  private _fitting: Appearance | null = null;

  get fitting(): Appearance | null {
    return this._fitting;
  }

  setFitting(outfit: Appearance | null): void {
    this._fitting = outfit ? { ...outfit } : null;
  }

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

  /** id del Named Character -> su historia con el jugador (systems/Story). */
  private _stories:
    StoryState;

  /** El móvil (systems/Phone): hilos, planes y respuestas pendientes. */
  private _phone: PhoneState;

  /** Entradas de partido (systems/Tickets). */
  private _tickets: Ticket[];

  /** Contrato (systems/Jobs). */
  private _job: JobProgress | null;

  /** Gastos de casa y meta de ahorro (systems/Household). */
  private _household: HouseholdState;

  /** Movimientos de la cartera, con su motivo. */
  private _ledger: Movement[];

  /** Habilidades, curso, encargo y desbloqueos (systems/Study). */
  private _study: StudyState;

  /** Vivienda activa y mejoras compradas (systems/Housing). */
  private _housing: HousingState;

  /** Guía, avisos dados y señales de progreso (systems/Agenda). */
  private _agenda: AgendaState;

  /** Encuentros con hora a los que se ha ido (systems/Parish). */
  private _parish: ParishState;

  /** Embarazos de las vecinas (systems/Pregnancy). */
  private _pregnancy: PregnancyState;

  /** Motivo del cambio de dinero en curso (as()). */
  private why: string | null = null;

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

    this._stories =
      structuredClone(
        initial.stories ?? {},
      );

    this._phone = structuredClone(initial.phone ?? createPhone());

    this._tickets = structuredClone(initial.tickets ?? []);

    this._job = structuredClone(initial.job ?? null);

    this._household = structuredClone(initial.household ?? { since: initial.day, generated: {}, obligations: [], goal: null });

    this._ledger = structuredClone(initial.ledger ?? []);

    this._study = structuredClone(initial.study ?? emptyStudy());

    this._housing = structuredClone(initial.housing ?? startHousing());

    this._agenda = structuredClone(initial.agenda ?? parseAgenda(undefined));

    this._parish = structuredClone(initial.parish ?? emptyParish());

    this._pregnancy = structuredClone(initial.pregnancy ?? emptyPregnancy());
    usePregnancies(this._pregnancy);
  }

  // ================================================================
  // AGENDA (systems/Agenda)
  // ================================================================

  get agenda(): AgendaState {
    return structuredClone(this._agenda);
  }

  /** Lo avisado y la guía: se guarda con la partida para que nada se repita al recargar. */
  setAgenda(a: AgendaState): void {
    this._agenda = structuredClone(a);
    this.emit('agenda');
  }

  // ================================================================
  // CUENTAS (systems/Household)
  // ================================================================

  get household(): HouseholdState {
    return structuredClone(this._household);
  }

  setHousehold(h: HouseholdState): void {
    this._household = structuredClone(h);
    this.emit('household');
  }

  get ledger(): Movement[] {
    return structuredClone(this._ledger);
  }

  /** Lo que cambie el dinero dentro de `fn` se apunta con este motivo (sueldo, alquiler, una compra). */
  as<T>(label: string, fn: () => T): T {
    const before = this.why;
    this.why = label;
    try {
      return fn();
    } finally {
      this.why = before;
    }
  }

  /** Apunta un cambio de la cartera. Sin motivo, «Otros». El mismo motivo el mismo día suma en una línea. */
  private record(delta: number): void {
    if (Math.abs(delta) < 0.005) return;
    const label = this.why ?? 'Otros';
    const last = this._ledger.at(-1);
    if (last && last.label === label && last.day === this._day) {
      last.amount = Math.round((last.amount + delta) * 100) / 100;
      last.hour = this._hour;
      last.minute = this._minute;
    } else {
      this._ledger.push({ day: this._day, hour: this._hour, minute: this._minute, label, amount: Math.round(delta * 100) / 100 });
      if (this._ledger.length > LEDGER_SIZE) this._ledger.shift();
    }
  }

  // ================================================================
  // VIVIENDA (systems/Housing)
  // ================================================================

  get housing(): HousingState {
    return structuredClone(this._housing);
  }

  /** Cambia la vivienda (comprar, mudarse) y avisa. Dinero y colocación se aplican aparte, antes de guardar. */
  setHousing(h: HousingState): void {
    this._housing = structuredClone(h);
    this.emit('housing');
  }

  // ================================================================
  // ESTUDIOS (systems/Study)
  // ================================================================

  get study(): StudyState {
    return structuredClone(this._study);
  }

  /** Cambia el progreso de estudios y avisa (el móvil lo repinta). Dinero y energía se aplican aparte. */
  setStudy(s: StudyState): void {
    this._study = structuredClone(s);
    this.emit('study');
  }

  // ================================================================
  // ENCUENTROS (systems/Parish)
  // ================================================================

  get parish(): ParishState {
    return structuredClone(this._parish);
  }

  /** Apunta un encuentro al que se ha ido. Energía y perfil de quien lo lleva se aplican aparte. */
  setParish(p: ParishState): void {
    this._parish = structuredClone(p);
    this.emit('parish');
  }

  // ================================================================
  // EMBARAZOS (systems/Pregnancy)
  // ================================================================

  get pregnancy(): PregnancyState {
    return structuredClone(this._pregnancy);
  }

  /** Lo resuelto por systems/Pregnancy.resolve; también refresca la fase que consultan las rutinas. */
  setPregnancy(p: PregnancyState): void {
    this._pregnancy = structuredClone(p);
    usePregnancies(this._pregnancy);
    this.emit('pregnancy');
  }

  // ================================================================
  // EMPLEO (systems/Jobs)
  // ================================================================

  /** El contrato del jugador (copia), o null si nunca ha firmado. */
  get job(): JobProgress | null {
    return structuredClone(this._job);
  }

  /** Cambia el contrato y avisa (el móvil lo repinta). El dinero y la energía del turno se aplican aparte, antes de guardar. */
  setJob(job: JobProgress | null): void {
    this._job = structuredClone(job);
    this.emit('job');
  }

  // ================================================================
  // ENTRADAS (systems/Tickets)
  // ================================================================

  /** Las entradas de partido del jugador (copia). */
  get tickets(): Ticket[] {
    return structuredClone(this._tickets);
  }

  /**
   * Cobra y emite de una vez (systems/Tickets.buyTicket) o marca una entrada como usada: el dinero y las entradas
   * cambian juntos, así que ningún guardado queda con el cobro sin la entrada ni al revés.
   */
  setTickets(tickets: readonly Ticket[], money = this._money): void {
    this._tickets = structuredClone([...tickets]);
    this.money = money;
  }

  // ================================================================
  // MÓVIL (systems/Phone)
  // ================================================================

  /** Copia del móvil: se cambia con systems/Phone y se devuelve con setPhone. */
  get phone(): PhoneState {
    return structuredClone(this._phone);
  }

  /** Guarda el móvil y avisa (ui/Phone se repinta; `news` son los mensajes nuevos, para notificarlos una vez). */
  setPhone(phone: PhoneState, news: readonly PhoneNews[] = []): void {
    this._phone = structuredClone(phone);
    this.emit('phone', news);
  }

  // ================================================================
  // HISTORIAS (systems/Story)
  // ================================================================

  /** Copia de su historia; si aún no tiene, una nueva con su ánimo de siempre. */
  storyOf(
    id: string,
    baseMood: number,
  ): NamedStory {
    const story =
      this._stories[id];

    return story
      ? structuredClone(
          story,
        )
      : createStory({
          baseMood,
        });
  }

  setStory(
    id: string,
    story: NamedStory,
  ): void {
    this._stories[id] =
      structuredClone(
        story,
      );

    this.emit(
      'story',
      id,
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
    this.record(w.money - this._money);

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

    this.record(value - this._money);

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
    // Un reloj sin número (setClock(undefined, …), una fecha mal escrita en la consola) no se aplica: se guardaría y la
    // partida entera se apartaría como ilegible al cargar.
    if (![day, hour, minute].every(Number.isFinite)) return;
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
          this._fitting ? { ...this._appearance, player: this._fitting } : this._appearance,
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

      stories:
        structuredClone(
          this._stories,
        ),

      phone: structuredClone(this._phone),

      tickets: structuredClone(this._tickets),

      job: structuredClone(this._job),

      household: structuredClone(this._household),

      ledger: structuredClone(this._ledger),

      study: structuredClone(this._study),

      housing: structuredClone(this._housing),

      agenda: structuredClone(this._agenda),

      parish: structuredClone(this._parish),

      pregnancy: structuredClone(this._pregnancy),
    };
  }
}

// La partida nueva vive en systems/SaveSystem (sin Phaser: también la usan los scripts de comprobación).
export { createInitialState } from '../systems/SaveSystem';
