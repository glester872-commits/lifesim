import Phaser from 'phaser';
import type { EventMemory, Facing, GameStateData, PlayerIdentity } from '../types/game';
import type { Appearance } from '../data/appearance';
import type { Wallet } from '../systems/Commerce';
import type { BasketLine } from '../systems/Basket';
import { START_FITNESS, type Fitness } from '../systems/Fitness';
import { applyDelta, createSocialProfile, noteSocialMemory, type SocialProfile, type SocialState } from '../systems/Social';
import { createStory, type NamedStory, type StoryState } from '../systems/Story';
import { activePlan, createPhone, postMessage, saveNote, statusOf, type PhoneNews, type PhoneState } from '../systems/Phone';
import type { Ticket } from '../systems/Tickets';
import { policeMemory, restoreIncidents } from '../systems/Police';
import type { JobProgress } from '../systems/Jobs';
import { owed, recordMovement, type HouseholdState, type Movement, type MovementType } from '../systems/Household';
import { emptyCredit, pendingEntry, type CreditResult, type CreditState } from '../systems/Credit';
import type { RastroLedger } from '../systems/Rastro';
import { settle as settleStall, type PlayerStallState } from '../systems/PlayerStall';
import type { LeagueState } from '../systems/League';
import { emptyStudy, type StudyState } from '../systems/Study';
import { emptyParish, type ParishState } from '../systems/Parish';
import { emptyPregnancy, usePregnancies, type PregnancyState } from '../systems/Pregnancy';
import { startIdentity } from '../systems/PlayerIdentity';
import { startHousing, type HousingState } from '../systems/Housing';
import type { RoommateState } from '../systems/Roommate';
import { parseAgenda, type AgendaState } from '../systems/Agenda';
import { apply as applyReputation, settleWithReputation, zoneOf, type Reputation } from '../systems/Reputation';
import { expire as expireDelivery, type DeliveryOutcome, type DeliveryState, type Result as DeliveryResult } from '../systems/Delivery';
import { getDelivery } from '../data/deliveries';
import { bikeShareCharge, rentPublicBike as addPublicBike, type BikesState, type Spot as BikeSpot } from '../systems/Cycling';
import { BIKE_SHARE_FARE } from '../data/bikeShare';
import { addEntries, diaryFromGatherings, diaryFromJobChange, diaryFromProjects, emptyDiary, type Diary, type NewDiaryEntry } from '../systems/Diary';
import { getJob } from '../data/jobs';
import { getNpc } from '../data/npcs';
import type { ConsequenceState } from '../systems/Consequences';
import {
  cancelProject, completeIfMet, emptyLifeProjects, noteCompletions, onJobChange, onWalletChange, pauseProject, projectCatalog, resumeProject, startProject,
  type LifeProjectRequirements, type LifeProjectsState, type LifeProjectType, type ProjectResult,
} from '../systems/LifeProjects';
import { emptySocialGraph, tickSocialGraph, type SocialGraphState } from '../systems/SocialGraph';
import {
  chooseMicroStory, emptyMicroStories, offerFor, pendingMoney, storyLineFor, tickMicroStories,
  type MicroCtx, type MicroEffect, type MicroStoriesState,
} from '../systems/MicroStories';
import type { SocialEventsState } from '../systems/SocialEvents';
import { emptyNeighborhood, neighborCandidates, tickNeighborhood, type NeighborEffect, type NeighborhoodState } from '../systems/Neighborhood';
import { applyWellbeing, settleWellbeing, startWellbeing, type WellbeingSource, type WellbeingState } from '../systems/Wellbeing';
import { getHome } from '../data/housing';
import { getMate } from '../data/roommate';
import { giftsIn, giveGift } from '../systems/Gifts';

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
  metroJourney: GameStateData['metroJourney'] = null;
  /** MAP-07: reputación por barrio (systems/Reputation). Sólo cambia con addReputation. */
  reputation: Reputation = {};

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

  /**
   * BIKE-01 · en bici o a pie (systems/Cycling). Sólo en memoria: pasa de una escena a la siguiente al cruzar en bici
   * entre exteriores y no se guarda (se carga siempre a pie; parseBikes devuelve aparcada la bici montada).
   */
  ride: import('../systems/Cycling').RideState = { phase: 'ON_FOOT', speed: 0, heading: { x: 0, y: 0 }, since: 0, travelled: 0 };

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

  /** Lo realmente pagado por cada prenda del armario. Sin registro, no se puede revender (systems/Retail). */
  private _paid:
    Record<string, number>;

  /** DEC-04 · La cesta de las tiendas (systems/Basket). Sólo en memoria: snapshot no la guarda y recargar la vacía. */
  private _basket: BasketLine[] = [];

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

  /** SIM-01 · registro de consecuencias (systems/Consequences). Sin registro todavía, undefined: el snapshot no lleva la clave. */
  private _consequences: ConsequenceState | undefined;
  /** VID-01 · proyectos de vida (systems/LifeProjects). Sin proyectos todavía, undefined: el snapshot no lleva la clave. */
  private _lifeProjects: LifeProjectsState | undefined;
  /** VID-02 · relaciones entre NPC (systems/SocialGraph). Sin grafo todavía, undefined: el snapshot no lleva la clave. */
  private _socialGraph: SocialGraphState | undefined;
  /** VID-03 · microhistorias (systems/MicroStories). Sin ninguna todavía, undefined: el snapshot no lleva la clave. */
  private _microStories: MicroStoriesState | undefined;
  /** VID-05 · quedadas en casa (systems/SocialEvents). Sin ninguna todavía, undefined: el snapshot no lleva la clave. */
  private _socialEvents: SocialEventsState | undefined;
  /** VID-06 · vecindario (systems/Neighborhood). Sin nada todavía, undefined: el snapshot no lleva la clave. */
  private _neighborhood: NeighborhoodState | undefined;
  /**
   * VID-07 · tensión (systems/Wellbeing). Partida nueva sin ninguna fuente todavía: undefined y el snapshot no lleva la
   * clave (empieza en TENSION_START el minuto de la primera fuente). Una vez definida se serializa siempre.
   */
  private _wellbeing: WellbeingState | undefined;
  /** VID-10 · reparto urbano (systems/Delivery). Sin encargo ni resultado, undefined: el snapshot no lleva la clave. */
  private _delivery: DeliveryState | undefined;
  /** BIKE-01 · bicis del mundo (systems/Cycling). Lista vacía: el snapshot no lleva la clave. */
  private _bikes: BikesState;
  /** VID-11 · diario de vida (systems/Diary). Vacío, el snapshot no lleva la clave. */
  private _diary: Diary;

  /** Movimientos de la cartera, con su motivo. */
  private _ledger: Movement[];

  /** Micropréstamo (systems/Credit). */
  private _credit: CreditState;
  /** CAS-04 · rarezas del Gran Rastro vendidas en la jornada (systems/Rastro). */
  private _rastro: RastroLedger | undefined;
  /** CAS-05 · tiques de objetos de la bolsa, el más antiguo primero (systems/Retail.sellItem). */
  private _paidItems: Record<string, number[]>;
  /** CAS-09 · tu puesto en el Gran Rastro (systems/PlayerStall). Sin reserva, undefined. */
  private _playerStall: PlayerStallState | undefined;
  /** CA-05b · tu equipo en la liga del barrio (systems/League). Sin inscripción, undefined. */
  private _league: LeagueState | undefined;

  /** Habilidades, curso, encargo y desbloqueos (systems/Study). */
  private _study: StudyState;

  /** Vivienda activa y mejoras compradas (systems/Housing). */
  private _housing: HousingState;

  /** SIM-05 · compañero de piso (systems/Roommate); undefined sin convivencia. */
  private _roommate: RoommateState | undefined;

  /** HOSP-01 · turno del hospital (systems/Hospital); undefined en una partida que nunca pidió turno. */
  private _hospital: import('../types/game').HospitalState | undefined;

  /** Guía, avisos dados y señales de progreso (systems/Agenda). */
  private _agenda: AgendaState;

  /** Encuentros con hora a los que se ha ido (systems/Parish). */
  private _parish: ParishState;

  /** Embarazos de las vecinas (systems/Pregnancy). */
  private _pregnancy: PregnancyState;

  /** Quién es el jugador (systems/PlayerIdentity): hoy, su nombre. Lo fija el creador de personaje. */
  private _identity: PlayerIdentity;

  /** Motivo del cambio de dinero en curso (as()). */
  private why: string | null = null;
  /** Tipo, origen e id propio del cambio en curso (as()); sin ellos, 'other', 'wallet' e id generado. */
  private whyMeta: { type?: MovementType; source?: string; movementId?: string } | undefined = undefined;

  constructor(
    initial: GameStateData,
  ) {
    super();
    this.metroJourney = initial.metroJourney ? { ...initial.metroJourney } : null;
    this.reputation = structuredClone(initial.reputation ?? {});

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

    this._paid = {
      ...initial.paid,
    };

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
    // La comisaría recuerda lo de esta partida, no lo de otra (systems/Police guarda la única copia).
    restoreIncidents(initial.police);

    this._job = structuredClone(initial.job ?? null);

    this._household = structuredClone(initial.household ?? { since: initial.day, generated: {}, obligations: [], goal: null });
    this._consequences = initial.consequences === undefined ? undefined : structuredClone(initial.consequences);
    this._lifeProjects = initial.lifeProjects === undefined ? undefined : structuredClone(initial.lifeProjects);
    this._socialGraph = initial.socialGraph === undefined ? undefined : structuredClone(initial.socialGraph);
    this._microStories = initial.microStories === undefined ? undefined : structuredClone(initial.microStories);
    this._socialEvents = initial.socialEvents === undefined ? undefined : structuredClone(initial.socialEvents);
    this._neighborhood = initial.neighborhood === undefined ? undefined : structuredClone(initial.neighborhood);
    this._wellbeing = initial.wellbeing === undefined ? undefined : structuredClone(initial.wellbeing);
    this._delivery = initial.delivery === undefined ? undefined : structuredClone(initial.delivery);
    this._bikes = structuredClone(initial.bikes ?? { v: 1, list: [] });
    this._diary = structuredClone(initial.diary ?? emptyDiary());

    this._ledger = structuredClone(initial.ledger ?? []);

    this._credit = structuredClone(initial.credit ?? emptyCredit());
    this._rastro = initial.rastro === undefined ? undefined : structuredClone(initial.rastro);
    this._paidItems = structuredClone(initial.paidItems ?? {});
    this._playerStall = initial.playerStall === undefined ? undefined : structuredClone(initial.playerStall);
    this._league = initial.league === undefined ? undefined : structuredClone(initial.league);

    this._study = structuredClone(initial.study ?? emptyStudy());

    this._housing = structuredClone(initial.housing ?? startHousing());
    this._roommate = initial.roommate === undefined ? undefined : structuredClone(initial.roommate);
    this._hospital = initial.hospital === undefined ? undefined : structuredClone(initial.hospital);

    this._agenda = structuredClone(initial.agenda ?? parseAgenda(undefined));

    this._parish = structuredClone(initial.parish ?? emptyParish());

    this._identity = { ...(initial.identity ?? startIdentity()) };
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

  // ================================================================
  // CONSECUENCIAS (systems/Consequences, SIM-01)
  // ================================================================

  get consequences(): ConsequenceState | undefined {
    return this._consequences === undefined ? undefined : structuredClone(this._consequences);
  }

  setConsequences(c: ConsequenceState): void {
    this._consequences = structuredClone(c);
    this.emit('consequences');
  }

  // ================================================================
  // PROYECTOS DE VIDA (systems/LifeProjects, VID-01)
  // ================================================================

  get lifeProjects(): LifeProjectsState | undefined {
    return this._lifeProjects === undefined ? undefined : structuredClone(this._lifeProjects);
  }

  setLifeProjects(p: LifeProjectsState): void {
    // VID-11: todas las vías de completar (cartera, contrato, reanudar) acaban aquí; el antes/después decide.
    this.noteDiary(diaryFromProjects(this._lifeProjects, p, this.absNow()));
    this._lifeProjects = structuredClone(p);
    this.emit('lifeProjects');
  }

  // VID-02 · relaciones entre NPC (systems/SocialGraph).
  get socialGraph(): SocialGraphState | undefined {
    return this._socialGraph === undefined ? undefined : structuredClone(this._socialGraph);
  }

  setSocialGraph(g: SocialGraphState): void {
    this._socialGraph = structuredClone(g);
    this.emit('socialGraph');
  }

  // VID-03 · microhistorias (systems/MicroStories).
  get microStories(): MicroStoriesState | undefined {
    return this._microStories === undefined ? undefined : structuredClone(this._microStories);
  }

  setMicroStories(m: MicroStoriesState): void {
    this._microStories = structuredClone(m);
    this.emit('microStories');
  }

  // VID-05 · quedadas en casa (systems/SocialEvents).
  get socialEvents(): SocialEventsState | undefined {
    return this._socialEvents === undefined ? undefined : structuredClone(this._socialEvents);
  }

  setSocialEvents(s: SocialEventsState): void {
    this.noteDiary(diaryFromGatherings(this._socialEvents, s, (npc) => {
      try {
        return getNpc(npc).name;
      } catch {
        return npc;
      }
    }));
    this._socialEvents = structuredClone(s);
    this.emit('socialEvents');
  }

  // VID-06 · vecindario (systems/Neighborhood).
  get neighborhood(): NeighborhoodState | undefined {
    return this._neighborhood === undefined ? undefined : structuredClone(this._neighborhood);
  }

  setNeighborhood(s: NeighborhoodState): void {
    this._neighborhood = structuredClone(s);
    this.emit('neighborhood');
  }

  /** Cada efecto del vecindario una sola vez: si el NPC ya tiene la memoria con esa ref (su id), no se repite. */
  applyNeighborEffects(effects: readonly NeighborEffect[]): void {
    const moment = { day: this._day, hour: this._hour, minute: this._minute };
    for (const e of effects) {
      const before = this.socialOf(e.npc);
      if (before.memories.some((m) => m.id === e.memory.ref)) continue;
      const p = noteSocialMemory(
        applyDelta(before, { friendship: 0, attraction: 0, trust: 0, romance: 0, mood: 0, ...e.delta }),
        { kind: 'SHARED_EVENT', ...moment, outcome: e.memory.outcome, note: e.memory.note },
      );
      const last = p.memories.at(-1);
      if (last) last.id = e.memory.ref;
      this.setSocialProfile(e.npc, p);
    }
  }

  /** VID-06 · vecinos de la puerta de tu vivienda, sin tu compañero de piso. */
  neighborCandidates(): string[] {
    const mate = this._roommate ? [getMate(this._roommate.mate).npc] : [];
    return neighborCandidates(getHome(this._housing.home).door, mate);
  }

  /** VID-06 · el día del vecindario: candidatos de la puerta de tu vivienda (sin tu compañero de piso), sólo conocidos. */
  tickNeighbors(): void {
    const cur = this._neighborhood ?? emptyNeighborhood();
    const candidates = this.neighborCandidates();
    const r = tickNeighborhood(cur, this._day, { candidates, known: (npc) => (this._social[npc]?.encounters ?? 0) > 0 });
    if (r.state === cur) return;
    this.setNeighborhood(r.state);
    this.applyNeighborEffects(r.effects);
  }

  // VID-10 · reparto urbano (systems/Delivery).
  get delivery(): DeliveryState | undefined {
    return this._delivery === undefined ? undefined : structuredClone(this._delivery);
  }

  setDelivery(s: DeliveryState): void {
    this._delivery = structuredClone(s);
    this.emit('delivery');
  }

  // BIKE-01 · bicis del mundo (systems/Cycling).
  get bikes(): BikesState {
    return structuredClone(this._bikes);
  }

  setBikes(s: BikesState): void {
    this._bikes = structuredClone(s);
    this.emit('bikes');
  }

  // VID-11 · diario de vida (systems/Diary).
  get diary(): Diary {
    return structuredClone(this._diary);
  }

  setDiary(d: Diary): void {
    this._diary = structuredClone(d);
    this.emit('diary');
  }

  /** Apunta lo confirmado; nada nuevo (ids ya apuntados), ni copia ni aviso. */
  private noteDiary(list: readonly NewDiaryEntry[]): void {
    const next = addEntries(this._diary, list);
    if (next !== this._diary) this.setDiary(next);
  }

  /**
   * Alquila la bici compartida `bikeId` aparcada en `at`: cobra BIKE_SHARE_FARE con id fijo `bike-share:<bikeId>` y la
   * añade a las bicis. Si ese cobro ya está en el ledger (doble E), no hace nada. Devuelve si se alquiló.
   */
  rentPublicBike(bikeId: string, at: BikeSpot): boolean {
    const movementId = bikeShareCharge(this._ledger, bikeId);
    if (!movementId || this._money + 1e-9 < BIKE_SHARE_FARE) return false;
    const next = addPublicBike(this._bikes, bikeId, at);
    if (next === this._bikes) return false;
    this.as('Bici compartida', () => {
      this.money = Math.round((this._money - BIKE_SHARE_FARE) * 100) / 100;
    }, { type: 'transport', source: 'bike-share', movementId });
    this.setBikes(next);
    return true;
  }

  /**
   * Aplica un resultado de systems/Delivery. Con encargo resuelto: el estado (que lo archiva en `last` y borra `active`),
   * el cobro en el ledger y la reputación del barrio del destino (`delivery:<runId>`), todo en esta llamada. Si ese runId
   * ya es el `last` guardado, no se paga ni se apunta nada otra vez. Devuelve si se aplicó.
   */
  applyDelivery(o: DeliveryOutcome): boolean {
    if (!o.ok) return false;
    const r = o.result;
    if (r && this._delivery?.last?.runId === r.runId) return false;
    this.setDelivery(o.state);
    if (!r) return true;
    const def = getDelivery(r.defId);
    if (r.pay > 0) this.as(`Reparto · ${def?.title ?? r.defId}`, () => {
      this.money += r.pay;
    }, { type: 'income', source: `delivery:${r.defId}`, movementId: `delivery:${r.runId}` });
    if (r.rep !== 0 && def) this.addReputation(zoneOf(def.to.location), r.rep, `delivery:${r.runId}`);
    return true;
  }

  /** VID-10 · resuelve el encargo vencido, si lo hay (antes de abrir cualquier menú de reparto). */
  expireDelivery(): DeliveryResult | undefined {
    if (!this._delivery) return undefined;
    const o = expireDelivery(this._delivery, this.absNow());
    return o.ok && this.applyDelivery(o) ? o.result : undefined;
  }

  private absNow(): number {
    return (this._day - 1) * 1440 + this._hour * 60 + this._minute;
  }

  /** Minuto absoluto de juego ((día-1)*1440 + hora*60 + minuto). */
  absMinute(): number {
    return this.absNow();
  }

  // VID-07 · tensión (systems/Wellbeing).
  get wellbeing(): WellbeingState {
    return this._wellbeing === undefined ? startWellbeing(this.absNow()) : structuredClone(this._wellbeing);
  }

  setWellbeing(w: WellbeingState): void {
    this._wellbeing = structuredClone(w);
    this.emit('wellbeing');
  }

  /** Una fuente de tensión o alivio con el minuto y el día actuales; devuelve el cambio real de tensión. */
  wellbeingSource(source: WellbeingSource, amount: number, npc?: string): number {
    const r = applyWellbeing(this._wellbeing ?? startWellbeing(this.absNow()), source, amount, this.absNow(), this._day, npc);
    this.setWellbeing(r.state);
    return r.applied;
  }

  /** El decay de la tensión hasta ahora. Barato (una división); sólo emite si algo cambia. */
  settleWellbeing(): void {
    const cur = this._wellbeing;
    if (cur === undefined) return;
    const next = settleWellbeing(cur, this.absNow());
    if (next.tension === cur.tension && next.lastMinute === cur.lastMinute) return;
    this.setWellbeing(next);
  }

  /** Aplica un resultado de LifeProjects y pasa la cartera actual por el gancho (p. ej. 'saved' si ya llega el dinero). */
  private applyProject(r: ProjectResult): ProjectResult {
    if (!r.ok) return r;
    const prev = this._lifeProjects ?? emptyLifeProjects();
    const w = this.wallet;
    const now = this.absNow();
    let next = onWalletChange(r.state, this._phone, w, w, now).projects;
    // Reanudar uno con todo hecho (se compró en pausa) lo completa ya, y deja su recuerdo como las otras vías.
    for (const p of next.items) next = completeIfMet(next, p.id, now);
    const phone = noteCompletions(prev, next, this._phone, now);
    if (phone !== this._phone) this.setPhone(phone);
    this.setLifeProjects(next);
    return { ...r, state: next };
  }

  /**
   * Empieza un proyecto con los requisitos de projectCatalog (`extra` añade otros). El ascenso parte del nivel del
   * contrato en vigor (`_job.level`); sin contrato activo no lleva fromLevel y startProject lo rechaza.
   */
  startLifeProject(type: LifeProjectType, extra: LifeProjectRequirements = {}): ProjectResult {
    const job = this._job;
    const fromLevel = type === 'promotion' && job?.status === 'active' ? { fromLevel: job.level } : {};
    const reqs = { ...projectCatalog[type].requirements, ...extra, ...fromLevel };
    const has = (id: string): boolean => (this._inventory[id] ?? 0) > 0;
    return this.applyProject(startProject(this._lifeProjects ?? emptyLifeProjects(), type, this.absNow(), reqs, has));
  }

  cancelLifeProject(id: string): ProjectResult {
    return this.applyProject(cancelProject(this._lifeProjects ?? emptyLifeProjects(), id, this.absNow()));
  }

  pauseLifeProject(id: string): ProjectResult {
    return this.applyProject(pauseProject(this._lifeProjects ?? emptyLifeProjects(), id, this.absNow()));
  }

  resumeLifeProject(id: string): ProjectResult {
    return this.applyProject(resumeProject(this._lifeProjects ?? emptyLifeProjects(), id, this.absNow()));
  }

  get ledger(): Movement[] {
    return structuredClone(this._ledger);
  }

  get credit(): CreditState {
    return structuredClone(this._credit);
  }

  setCredit(c: CreditState): void {
    this._credit = structuredClone(c);
    this.emit('credit');
  }

  /**
   * Aplica un resultado de systems/Credit (take, payInstallment, cancel): dinero, préstamo y su línea con id fijo.
   * Si no es ok o su id ya está en el ledger, no hace nada (ni dinero ni línea dos veces). Devuelve si se aplicó.
   */
  applyCredit(r: CreditResult): boolean {
    const e = pendingEntry(r, this._ledger);
    if (!e) return false;
    this.as(e.label, () => {
      this.money = r.money;
    }, e);
    this.setCredit(r.credit);
    return true;
  }

  /** Lo que cambie el dinero dentro de `fn` se apunta con este motivo (sueldo, alquiler, una compra) y, si se da, su tipo, origen e id propio. */
  as<T>(label: string, fn: () => T, meta?: { type?: MovementType; source?: string; movementId?: string }): T {
    const before = this.why;
    const beforeMeta = this.whyMeta;
    this.why = label;
    this.whyMeta = meta;
    try {
      return fn();
    } finally {
      this.why = before;
      this.whyMeta = beforeMeta;
    }
  }

  /** Apunta un cambio de la cartera. Sin motivo, «Otros». Cómo se suman las líneas: systems/Household.recordMovement. */
  private record(delta: number): string | undefined {
    if (Math.abs(delta) < 0.005) return undefined;
    return recordMovement(this._ledger, { day: this._day, hour: this._hour, minute: this._minute, label: this.why ?? 'Otros', amount: delta, type: this.whyMeta?.type, source: this.whyMeta?.source, movementId: this.whyMeta?.movementId });
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

  get roommate(): RoommateState | undefined {
    return this._roommate === undefined ? undefined : structuredClone(this._roommate);
  }

  setRoommate(r: RoommateState | undefined): void {
    this._roommate = r === undefined ? undefined : structuredClone(r);
    this.emit('roommate');
  }

  /** HOSP-01 · el turno del hospital; sin registro, «sin turno». */
  get hospital(): import('../types/game').HospitalState {
    return this._hospital === undefined ? { ticket: null } : structuredClone(this._hospital);
  }

  setHospital(h: import('../types/game').HospitalState): void {
    this._hospital = structuredClone(h);
    this.emit('hospital');
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

  /** El nombre y lo demás de quién es el jugador (sólo se lee: el creador lo fija antes de la partida). */
  get identity(): PlayerIdentity {
    return { ...this._identity };
  }

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
    const before = this._job;
    this._job = structuredClone(job);
    // VID-11: sólo la firma (no el ascenso ni el repaso de turnos); al cargar no pasa por aquí.
    const hired = diaryFromJobChange(before, this._job, this.absNow(), (id) => {
      try {
        const j = getJob(id);
        return { employer: j.employer, title: j.levels[0]?.title ?? '', place: j.place };
      } catch {
        return undefined;
      }
    });
    if (hired) this.noteDiary([hired]);
    // VID-01: todo ascenso pasa por aquí (Menus aplica Jobs.promote con setJob); el gancho es idempotente.
    if (this._lifeProjects !== undefined) {
      const r = onJobChange(this._lifeProjects, this._phone, before, this._job, this.absNow());
      if (r.phone !== this._phone) this.setPhone(r.phone);
      if (r.projects !== this._lifeProjects) this.setLifeProjects(r.projects);
    }
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
    // Lo que sale del armario no deja su tique colgado.
    this._paid = Object.fromEntries(Object.entries(this._paid).filter(([id]) => ids.includes(id)));
  }

  get paid(): Record<string, number> {
    return { ...this._paid };
  }

  set paid(prices: Record<string, number>) {
    this._paid = { ...prices };
  }

  get basket(): readonly BasketLine[] {
    return this._basket.map((l) => ({ ...l }));
  }

  set basket(lines: readonly BasketLine[]) {
    this._basket = lines.map((l) => ({ ...l }));
  }

  get paidItems(): Record<string, number[]> {
    return structuredClone(this._paidItems);
  }

  set paidItems(t: Record<string, number[]>) {
    this._paidItems = structuredClone(t);
  }

  get playerStall(): PlayerStallState | undefined {
    return this._playerStall === undefined ? undefined : structuredClone(this._playerStall);
  }

  set playerStall(s: PlayerStallState | undefined) {
    this._playerStall = s === undefined ? undefined : structuredClone(s);
  }

  get league(): LeagueState | undefined {
    return this._league === undefined ? undefined : structuredClone(this._league);
  }

  set league(l: LeagueState | undefined) {
    this._league = l === undefined ? undefined : structuredClone(l);
  }

  /**
   * CAS-09 · aplica una transición de systems/PlayerStall: el dinero (si lo hay) con su línea e id fijo y el puesto
   * nuevo, juntos. Quien llama guarda justo después.
   */
  applyPlayerStall(next: PlayerStallState, money?: { label: string; delta: number; type: MovementType; movementId: string }): void {
    if (money) {
      this.as(money.label, () => {
        this.money = Math.round((this._money + money.delta) * 100) / 100;
      }, { type: money.type, source: 'player-stall', movementId: money.movementId });
    }
    this.playerStall = next;
  }

  /**
   * CAS-09 · cierra el puesto si ya toca (systems/PlayerStall.settle) y abona el reembolso con id fijo. Devuelve el
   * puesto recién cerrado, o undefined si no ha cambiado nada (repetirlo no abona dos veces). Quien llama guarda.
   */
  settlePlayerStall(): PlayerStallState | undefined {
    const r = settleStall(this._playerStall, { day: this._day, hour: this._hour, minute: this._minute });
    if (!r.ok) return undefined;
    const refund = r.stall.closed?.refund ?? 0;
    this.applyPlayerStall(r.stall, refund > 0 ? { label: 'Reembolso del puesto del Rastro', delta: refund, type: 'income', movementId: `ps-${r.stall.day}-refund` } : undefined);
    return this.playerStall;
  }

  get rastro(): RastroLedger | undefined {
    return this._rastro === undefined ? undefined : structuredClone(this._rastro);
  }

  set rastro(l: RastroLedger | undefined) {
    this._rastro = l === undefined ? undefined : structuredClone(l);
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
    const before = this.wallet;
    // VID-01: el id del movimiento del ledger de este cobro es el origen del hito 'bought' (systems/LifeProjects.onWalletChange).
    const movementId = this.record(w.money - this._money);

    this._money =
      w.money;

    this._inventory = {
      ...w.inventory,
    };

    this._cards = {
      ...w.cards,
    };

    // Todas las compras (Menus.openCatalog y openProductSheet) pasan por aquí: un único gancho idempotente.
    if (this._lifeProjects !== undefined) {
      const r = onWalletChange(this._lifeProjects, this._phone, before, this.wallet, this.absNow(), movementId);
      if (r.phone !== this._phone) this.setPhone(r.phone);
      if (r.projects !== this._lifeProjects) this.setLifeProjects(r.projects);
    }

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

    const dayChanged = day !== this._day;

    this._day =
      day;

    this._hour =
      hour;

    this._minute =
      minute;

    this.emit(
      'change',
    );
    // VID-07: la tensión baja con el tiempo; cada avance del reloj consume los tramos enteros pasados.
    this.settleWellbeing();
    // VID-02 F2: el grafo entre NPC avanza sólo cuando cambia el día, nunca por minuto ni por frame.
    if (dayChanged) this.tickSocial();
    // VID-03 F4: las microhistorias también avanzan sólo con el día.
    if (dayChanged) this.tickStories();
    // VID-06: el vecindario, igual, sólo con el día.
    if (dayChanged) this.tickNeighbors();
  }

  // VID-03 F4 · microhistorias conectadas a los sistemas reales.

  /** Lo que pregunta el reductor. El tick corre al cambiar de día (de madrugada): «dormida» se mira a mediodía de hoy. */
  private microCtx(): MicroCtx {
    const noon = (this._day - 1) * 1440 + 12 * 60;
    const now = this.absNow();
    return {
      known: (npc) => (this._social[npc]?.encounters ?? 0) > 0,
      asleep: (npc) => statusOf(npc, noon).state === 'asleep',
      busy: (npc) => this._stories[npc]?.plan?.status === 'pending' || activePlan(this._phone, npc, now) !== undefined,
    };
  }

  /** Con qué cuentas para elegir: un regalo en la bolsa y el dinero libre (cartera menos lo debido, como Opportunities). */
  private microMeans(): { hasGift: boolean; freeMoney: number } {
    return { hasGift: giftsIn(this.wallet).length > 0, freeMoney: Math.round((this._money - owed(this._household)) * 100) / 100 };
  }

  tickStories(): void {
    const cur = this._microStories ?? emptyMicroStories();
    const r = tickMicroStories(cur, this._day, this.microCtx());
    if (r.state === cur) return;
    this.setMicroStories(r.state);
    this.applyMicroEffects(r.effects);
  }

  /** La historia activa sin elegir de este NPC, con opciones y motivos de bloqueo; null si no hay. */
  microOffer(npc: string): ReturnType<typeof offerFor> {
    const m = this.microMeans();
    return offerFor(this._microStories ?? emptyMicroStories(), npc, this._day, m.hasGift, m.freeMoney);
  }

  /** La respuesta de hoy de este NPC a una historia, si la hay. */
  microLine(npc: string): string | null {
    return storyLineFor(this._microStories ?? emptyMicroStories(), npc, this._day);
  }

  chooseStory(storyId: string, optionId: string): { ok: boolean; message: string } {
    const r = chooseMicroStory(this._microStories ?? emptyMicroStories(), storyId, optionId, this._day, { ...this.microCtx(), ...this.microMeans() });
    if (!r.ok) return { ok: false, message: r.message };
    this.setMicroStories(r.state);
    this.applyMicroEffects(r.effects);
    return { ok: true, message: r.message };
  }

  /** Cada efecto con su sistema real. El reductor emite cada uno una sola vez; el dinero además se filtra por el ledger. */
  private applyMicroEffects(effects: readonly MicroEffect[]): void {
    const at = this.absNow();
    const moment = { day: this._day, hour: this._hour, minute: this._minute };
    for (const e of pendingMoney(effects, this._ledger.map((l) => l.movementId))) {
      this.as(e.why, () => {
        this.money = Math.round((this._money + e.amount) * 100) / 100;
      }, { type: 'loan', source: 'micro-story', movementId: e.movementId });
    }
    for (const e of effects) {
      if (e.kind === 'rel') {
        this.setSocialProfile(e.npc, applyDelta(this.socialOf(e.npc), { friendship: 0, attraction: 0, trust: 0, romance: 0, mood: 0, ...e.delta }));
      } else if (e.kind === 'memory') {
        this.setSocialProfile(e.npc, noteSocialMemory(this.socialOf(e.npc), { kind: 'SHARED_EVENT', ...moment, outcome: 'neutral', note: e.text }));
      } else if (e.kind === 'gift') {
        const g = giftsIn(this.wallet)[0];
        const r = g ? giveGift(this.socialOf(e.npc), this.wallet, g.id, moment) : null;
        if (r?.ok) {
          this.setSocialProfile(e.npc, r.profile);
          this.wallet = r.wallet;
        }
      } else if (e.kind === 'note') {
        this.setPhone(saveNote(this._phone, e, at));
      } else if (e.kind === 'line') {
        this.postStoryMessage(e.npc, e.text, `ms-line:${e.npc}:${this._day}`, at);
      } else if (e.kind === 'offer') {
        const pitch = storyLineFor(this._microStories ?? emptyMicroStories(), e.npc, this._day);
        if (pitch) this.postStoryMessage(e.npc, pitch, `ms-offer:${e.storyId}`, at);
      }
    }
  }

  /** Al hilo del móvil sólo si tienes su número; con id fijo, nunca dos veces. Sin notificación (news vacío). */
  private postStoryMessage(npc: string, text: string, id: string, at: number): void {
    if (!this._social[npc]?.contactExchanged) return;
    if (this._phone.threads[npc]?.messages.some((m) => m.id === id)) return;
    const phone = postMessage(this._phone, npc, 'them', text, at);
    const last = phone.threads[npc]?.messages.at(-1);
    if (last) last.id = id;
    this.setPhone(phone);
  }

  /** Avanza el grafo social hasta el día actual. O(1) si ya está al día (compara días y sale). */
  tickSocial(): void {
    const g = this._socialGraph ?? emptySocialGraph();
    if (this._day <= g.lastTickDay) return;
    const next = tickSocialGraph(g, this._day);
    if (next === g) return;
    this._socialGraph = next;
    this.emit('socialGraph');
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

  /** MAP-07: mueve la reputación de un barrio; el mismo motivo dos veces, o sin barrio, no hace nada. */
  addReputation(zoneId: string | null, delta: number, reasonId: string): void {
    this.reputation = applyReputation(this.reputation, zoneId, delta, reasonId, this._day);
  }

  /**
   * MAP-07b: repasa el contrato y lo aplica (Reputation.settleWithReputation): guarda el progreso si avanzó y la
   * reputación de cada falta nueva. `changed`: hay algo que guardar.
   */
  settleJob(now: number): { progress: JobProgress | null; missed: number[]; fired: boolean; changed: boolean } {
    const job = this._job;
    if (!job) return { progress: null, missed: [], fired: false, changed: false };
    const { progress, missed, fired, reputation } = settleWithReputation(job, this.reputation, now, this._day);
    const changed = progress.checked !== job.checked;
    if (changed) this.setJob(progress);
    this.reputation = reputation;
    return { progress, missed, fired, changed };
  }

  /**
   * Todo lo necesario para guardar la partida.
   */
  get snapshot():
    GameStateData {
    return {
      metroJourney: this.metroJourney ? { ...this.metroJourney } : null,
      reputation: structuredClone(this.reputation),
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

      paid: {
        ...this._paid,
      },

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

      police: policeMemory(),

      job: structuredClone(this._job),

      household: structuredClone(this._household),
      ...(this._consequences === undefined ? {} : { consequences: structuredClone(this._consequences) }),
      ...(this._lifeProjects === undefined ? {} : { lifeProjects: structuredClone(this._lifeProjects) }),
      ...(this._socialGraph === undefined ? {} : { socialGraph: structuredClone(this._socialGraph) }),
      ...(this._microStories === undefined ? {} : { microStories: structuredClone(this._microStories) }),
      ...(this._socialEvents === undefined || this._socialEvents.events.length === 0 ? {} : { socialEvents: structuredClone(this._socialEvents) }),
      ...(this._neighborhood === undefined || (this._neighborhood.packages.length === 0 && this._neighborhood.favors.length === 0) ? {} : { neighborhood: structuredClone(this._neighborhood) }),
      ...(this._wellbeing === undefined ? {} : { wellbeing: structuredClone(this._wellbeing) }),
      ...(this._delivery === undefined || (!this._delivery.active && !this._delivery.last) ? {} : { delivery: structuredClone(this._delivery) }),
      // La bici que se lleva montada se guarda donde está el jugador (y parseBikes la devuelve aparcada ahí).
      ...(this._bikes.list.length === 0 ? {} : {
        bikes: {
          v: 1,
          list: this._bikes.list.map((b) => (b.status === 'ridden'
            ? { ...b, location: this.locationId, x: this.position.x, y: this.position.y, facing: this.facing }
            : { ...b })),
        },
      }),
      ...(this._diary.entries.length === 0 ? {} : { diary: structuredClone(this._diary) }),

      ledger: structuredClone(this._ledger),

      credit: structuredClone(this._credit),

      ...(this._rastro === undefined ? {} : { rastro: structuredClone(this._rastro) }),
      ...(Object.keys(this._paidItems).length === 0 ? {} : { paidItems: structuredClone(this._paidItems) }),
      ...(this._playerStall === undefined ? {} : { playerStall: structuredClone(this._playerStall) }),
      ...(this._league === undefined ? {} : { league: structuredClone(this._league) }),

      study: structuredClone(this._study),

      housing: structuredClone(this._housing),
      ...(this._roommate === undefined ? {} : { roommate: structuredClone(this._roommate) }),
      ...(this._hospital === undefined ? {} : { hospital: structuredClone(this._hospital) }),

      agenda: structuredClone(this._agenda),

      parish: structuredClone(this._parish),

      pregnancy: structuredClone(this._pregnancy),
      identity: { ...this._identity },
    };
  }
}

// La partida nueva vive en systems/SaveSystem (sin Phaser: también la usan los scripts de comprobación).
export { createInitialState } from '../systems/SaveSystem';
