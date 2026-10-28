import Phaser from 'phaser';
import { ARENA_CLUB, ARENA_MATCHES } from '../data/cityEvents';
import { LOCATION_DISTRICT } from '../data/districtIdentity';
import { kickoffLabel, matchNow, matchOn } from '../systems/Match';
import { isPolice, patrolLines } from '../systems/Police';
import { PLACES } from '../data/places';
import {
  AUTOSAVE_INTERVAL_MS,
  CAMERA_LERP,
  CAMERA_LOOK_UP,
  GAME_MINUTES_PER_REAL_SECOND,
  PALETTE,
  TILE,
  TRANSITION_MS,
} from '../config/constants';
import type { Facing, LocationDef, NpcDef, PortalDef, RackDef, SpawnDef, TerminalDef, TilePoint, Vec2 } from '../types/game';
import type { MetroEventDef, RideContext } from '../systems/MetroEventManager';
import { allLocations, doorRow, getLocation, getSpawn, isStandable, isWalkable, spawnToWorld } from '../systems/LocationSystem';
import { QUALITY, type QualityLevel } from '../config/quality';
import { BUDGETS, type Budget } from '../config/budgets';
import { Ambience } from '../world/Ambience';
import { PROPS } from '../world/tiles';
import { crowdLevel, metroLevel, mix, terraceEmitters, vehicleLevel, type Emitter } from '../systems/Soundscape';
import { ClosedSigns } from '../world/ClosedSigns';
import { Traffic } from '../systems/Traffic';
import { withDistrictLanes } from '../systems/Districts';
import { TrafficView } from '../world/TrafficView';
import { pruneRiderTextures } from '../world/CyclistArt';
import { CyclistView } from '../world/CyclistView';
import { VEHICLES, type VehicleType } from '../data/vehicles';
import { BIKES, type BikeType } from '../data/bikes';
import type { OfferId } from '../data/services';
import { identity } from '../systems/Service';
import { Lighting } from '../world/Lighting';
import { MetroSystem } from '../systems/MetroSystem';
import { METRO_CONFIG } from '../config/metro';
import { buildLocation } from '../world/LocationBuilder';
import { pixelZoom } from '../world/PixelScale';
import { Player } from '../entities/Player';
import { atTable, seatAt, seatsIn, type Seat } from '../systems/Seating';
import { STATIONS, getStation, type StationId } from '../data/stations';
import { COURTS, type ShootingSpot } from '../data/courts';
import { SHOOTING, ShootingSession, type BallState, type Geometry, type Shot } from '../systems/Basketball';
import { KIND_OF, afterLine, summary, train, type Intensity } from '../systems/Fitness';
import { NPC } from '../entities/NPC';
import { Walker } from '../entities/Walker';
import { getNpc, PASSENGER_LOOKS, UNIFORM_LOOKS } from '../data/npcs';
import { getJob as jobDef } from '../data/jobs';
import { onShift } from '../systems/Jobs';
import { CHARACTERS, type CharacterDef } from '../data/characters';
import { catchUp, characterDay, routineFor, whereabouts, type RoutinePicker, type Whereabouts } from '../systems/Characters';
import { STORIES } from '../data/saraStory';
import { TOUR } from '../data/tour';
import { freeBetween } from '../systems/Agenda';
import { homeEntry, installedIn } from '../systems/Housing';
import {
  applyEffect,
  beatAfterTalk,
  chatFlags,
  chatMood,
  chooseBeat,
  clockOf,
  dayStart,
  helloFor,
  migrateStory,
  noteEvent,
  offerBeat,
  openerFor,
  phoneStory,
  planSummary,
  planForInvite,
  cancelStoryPlan,
  presentBeat,
  routineOn,
  watchPlan,
  type Effect,
  type NamedStory,
  type ReadyBeat,
  type StoryNow,
} from '../systems/Story';
import { offCamera, settleNamed, type StuckWatch } from '../systems/Recovery';
import { pickTarget, tileAhead, wallBetween, type Candidate as PickCandidate } from '../systems/Interaction';
import { recordTransitionError } from '../systems/VenueAudit';
import { Character, activityAt } from '../entities/Character';
import { Crowd, profileFor, type Agent, type Clock } from '../systems/Crowd';
import { crowdBudget, StreetLife, streetProfileFor, type Walker as StreetWalker } from '../systems/StreetLife';
import { chatLine, memoryKey, openingFor, thanksLine } from '../systems/StreetSurvival';
import { closedLines, isOpen, placeForInterior, placeInfo, placeOfPoint, type PlaceInfo } from '../systems/Places';
import { admit, heldSeat, mayStay, venueOf } from '../systems/Tickets';
import { fixtureAt, nextMoment, stageAt, stateAt, timelineOf, type Timeline } from '../systems/MatchPlay';
import { fanLine, fanMoment, kioskService, reactionTopic } from '../systems/Concourse';
import { FAN_TURNS, type FanTopic } from '../data/concourse';
import { MatchView } from '../world/MatchView';
import { chantAt, spectatorPose, standCues, standMood, supporterOf, type Chant, type StandMood } from '../systems/StandLife';
import { FULLTIME_EXIT, HALFTIME_ERRAND } from '../data/standLife';
import { StandView } from '../world/StandView';
import type { MenuOption } from '../ui/Menu';
import { AmbientDirector, ambientFrame, ambientSituation, facingTowards } from '../systems/AmbientActions';
import type { AmbientPlacement, Placement } from '../entities/Character';
import { stopAtStation } from '../systems/Transit';
import { Menus } from './Menus';
import { CrowdView, type StandHook } from '../world/CrowdView';
import { LitterView } from '../world/LitterView';
import { ServiceView } from '../world/ServiceView';
import type { PlayerCall, TableService } from '../systems/TableService';
import { say, type MenuItem, type MoreOption } from '../data/menus';
import { euros } from '../systems/Commerce';
import { WeatherView } from '../world/WeatherView';
import { awayFanLook, characterLook, pregnantLook, umbrellaFor } from '../world/WeatherLooks';
import { bumpOf, phaseOn, pregnancyLine } from '../systems/Pregnancy';
import { hashSeed, seededRng, type Rng } from '../systems/MetroDaily';
import { Atmosphere } from '../world/Atmosphere';
import { StreetEventView } from '../world/StreetEventView';
import { AlleyDealView } from '../world/AlleyDealView';
import { alleySpotsOf } from '../systems/AlleyDeals';
import { STREET_EVENTS } from '../data/streetEvents';
import { Occlusion } from '../world/Occlusion';
import { ZoneDebugView } from '../world/ZoneDebugView';
import { PopulationInspector } from '../world/PopulationInspector';
import { WaterView } from '../world/WaterView';
import { SkateParkView } from '../world/SkateParkView';
import { ForegroundView } from '../world/Foreground';
import { PopUpView } from '../world/PopUpView';
import { StringLightsView } from '../world/StringLights';
import { DEBUG } from '../config/debug';
import { weatherAt } from '../systems/Weather';
import { ChatLog, Conversation, placeOf, weatherKind, type ChatTurn } from '../systems/Chat';
import {
  applyDelta,
  chatRelationLevel,
  CONTACT_OFFER_NOTE,
  contactOfferChance,
  grantContact,
  noteSocialEncounter,
  noteSocialMemory,
  relationshipState,
  type SocialProfile,
} from '../systems/Social';
import { NAMED_PEOPLE } from '../data/namedPeople';
import { NAMED_VOICES } from '../data/chatNamed';
import { getItem } from '../data/items';
import { giftBlocker, giftsIn, giveGift } from '../systems/Gifts';
import { INIT_SLOT, activePlan, lineFor, markRead, tierOf, phoneTick, planFromTalk, postMessage, sendMessage, statusOf, whenLabel, type NpcStatus, type PhoneActionId, type PhoneEnv, type PhoneNews, type PhoneResult } from '../systems/Phone';
import { zoneAt } from '../systems/Zones';
import { WildlifeView } from '../world/WildlifeView';
import { SignalView } from '../world/SignalView';
import { PLAYER_H, pumpPeopleFine, setPlayerUniform } from '../world/TextureFactory';
import type { Services } from '../services';
import { LAYER } from '../world/Layers';

/** Lo que se le da a quien pide en la calle: una moneda. */
const SURVIVOR_COIN = 0.5;

export interface WorldSceneData {
  locationId: string;
  spawnId?: string;
  /** Posición exacta; la usa la carga de partida, que no entra por un spawn. */
  position?: Vec2;
  facing?: Facing;
  /** Se llega en tren: la estación arranca con el tren en el andén y las puertas abiertas. */
  byTrain?: boolean;
}

/**
 * Todo lo que responde a E pasa por aquí: personas, puertas y cosas que se
 * miran. Ningún sitio tiene su propio código de interacción; lo decide el dato.
 * Los NPC se leen en vivo: el vigilante camina y su punto de interacción con él.
 */
type Interactable =
  | { kind: 'npc'; sprite: Phaser.GameObjects.Sprite; def: NpcDef; lines?: () => readonly string[] }
  | { kind: 'portal'; x: number; y: number; portal: PortalDef }
  | { kind: 'inspect'; x: number; y: number; name: string; lines: readonly string[]; board?: { tx: number; ty: number }; venue?: string }
  | { kind: 'terminal'; x: number; y: number; name: string; catalog: string; place?: string; serves?: TerminalDef['serves']; staff?: string }
  | { kind: 'rack'; x: number; y: number; rack: RackDef }
  | { kind: 'spot'; x: number; y: number; name: string; activities: readonly string[]; wardrobe?: true; study?: string; gathering?: string; housing?: true | string; job?: string; lines?: readonly string[] }
  | { kind: 'event'; x: number; y: number; view: StreetEventView }
  | { kind: 'seat'; x: number; y: number; seat: Seat }
  | { kind: 'station'; x: number; y: number; point: string; station: StationId; facing: Facing }
  | { kind: 'court'; x: number; y: number; name: string; point: string; spot: ShootingSpot };

/** Lo que se dice de un tiro, sin más: dentro (limpio o rebotado) o fuera (y por dónde). */
function shotCue(shot: Shot): string {
  switch (shot.kind) {
    case 'swish': return '¡Limpia!';
    case 'rim-in': return '¡Dentro, rebotando en el aro!';
    case 'board-in': return '¡Dentro, de tablero!';
    case 'short': return 'Corto';
    case 'long': return 'Largo';
    case 'left': return 'Se va a la izquierda';
    case 'right': return 'Se va a la derecha';
  }
}

/** Tras cambiar de escena, el fundido (TRANSITION_MS) y lo que tarda un doble toque: E / «acción» se gastan sin hacer nada. */
const ARRIVAL_LOCK_MS = 450;
/** Cada cuánto se recalcula lo que suena: los fundidos de audio/CityAudio rellenan lo de en medio. */
const SOUND_EVERY_MS = 250;
/**
 * Lo que se gasta cada frame horneando el acabado de quien aparece (world/HdCache; unos 24 ms cada aspecto): en
 * juego, poco (cabe en el frame, y quien llega por el borde se hornea antes de verse); al entrar en una escena (el
 * fundido y su primer segundo), mucho, para que quien ya está allí salga con su acabado enseguida.
 */
const FINE_BAKE_MS = 4;
const FINE_BAKE_ENTRY_MS = 40;
const FINE_ENTRY_MS = 1_200;

function anchor(item: Interactable): Vec2 {
  return item.kind === 'npc' ? { x: item.sprite.x, y: item.sprite.y - 10 } : item;
}

/** Lo que queda a la espalda de quien mira hacia un lado: sentado, no se gira hacia el respaldo. */
const BEHIND: Readonly<Record<Facing, Facing>> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** Hacia dónde mira quien está en `from` para ver a quien está en `to`. */
function facingTo(from: Vec2, to: Vec2): Facing {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}

type Keys = Record<string, Phaser.Input.Keyboard.Key>;
const DIGITS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'] as const;

/** A dónde lleva un portal y, si lleva un rato, cuánto: se ve antes de cruzarlo. */
function describePortal(portal: PortalDef): string {
  const parts: string[] = [];
  if (portal.minutes) parts.push(`${portal.minutes} min`);
  return parts.length === 0 ? portal.label : `${portal.label} (${parts.join(', ')})`;
}

/**
 * Una sola Scene sirve cualquier localización: calle, piso o cafetería salen
 * del mismo constructor alimentado por datos. Añadir un sitio nuevo es añadir
 * una entrada en data/locations.ts, no una Scene.
 */
export class WorldScene extends Phaser.Scene {
  private player!: Player;
  private prompt!: Phaser.GameObjects.Image;
  private keys!: Keys;
  private interactables: Interactable[] = [];
  private activeTarget: Interactable | null = null;
  /** Id (systems/Interaction) de lo que se ofrece: el aviso sólo se anima al cambiar de objetivo, no en cada frame. */
  private activeId: string | null = null;
  private readonly npcSerial = new WeakMap<object, number>();
  private npcCount = 0;
  /** Hasta cuándo (reloj de la escena) no se acepta E / «acción» tras llegar: el fundido y un doble toque. */
  private readyAt = 0;
  private leaving = false;
  /**
   * La puerta de calle por la que se entró al sitio de ahora. Un interior con dos puertas a la misma calle (las dos
   * bocas del metro de Puerta Central) devuelve por la de entrada, no por la que diga su salida. Sobrevive al
   * restart de la escena (es la misma instancia); el tren lo borra.
   */
  private cameIn: { from: string; door: string; into: string } | null = null;
  private mapWidth = 0;
  private mapHeight = 0;
  private metro: MetroSystem | null = null;

  /** Depuración (lifesim.npc): atascados ahora, peldaños intentados y recuperaciones de cada sistema. */
  recoveryStatus(): Record<string, unknown> {
    const sum = (w: StuckWatch | undefined) => w && { stuck: w.stuckCount(), recovered: w.stats.recovered, attempts: w.stats.attempts.slice(1), watching: [...w.entries].map(([k, e]) => ({ npc: k, level: e.level, stalledMs: Math.round(e.stall), forced: !!e.forced })) };
    return { crowd: sum(this.crowd?.watch), street: sum(this.street?.watch), metro: sum(this.metro?.watch), named: { ...this.namedRecovered }, obstacles: [...(this.crowd?.blocked ?? []), ...(this.street?.blocked ?? [])] };
  }

  /** Depuración (lifesim.npc.force): corta el paso al NPC que anda más cerca del jugador y lo da por atascado. */
  forceStuck(): string {
    const at = this.playerTile();
    const id = this.crowd?.devForceStuck(at) ?? this.street?.devForceStuck(at) ?? this.metro?.devForceStuck(this.player.x, this.player.y);
    return id === null || id === undefined ? 'nadie andando cerca' : `atascado a la fuerza: ${id}`;
  }

  /** Depuración (lifesim.npc.reset): quita obstáculos temporales y el estado de recuperación. */
  resetRecovery(): void {
    this.crowd?.devResetRecovery();
    this.street?.devResetRecovery();
    this.metro?.watch.reset();
  }

  /** El metro de la escena, para las órdenes de depuración (lifesim.crime). */
  get metroSystem(): MetroSystem | null {
    return this.metro;
  }
  /** La gente de la calle de aquí, si la hay (desarrollo: sus carteristas). */
  get streetSystem(): StreetLife | null {
    return this.street;
  }

  /**
   * Lo que cuesta el sitio ahora, contra su presupuesto (config/budgets.ts): lifesim.perf(). Sólo cuenta lo que hay;
   * los demás barrios no están en memoria (systems/World.ts los calcula del reloj).
   */
  perfStats(): { location: string; interior: boolean; fps: number; quality: QualityLevel; counts: Budget; over: string[]; far: number; budgetScale: number } {
    const p = this.playerTile();
    const people = [...(this.street?.agents ?? []), ...(this.crowd?.agents ?? [])];
    const near = people.filter((a) => Math.abs(a.x - p.tx) <= 30 && Math.abs(a.y - p.ty) <= 30).length;
    const def = getLocation(this.services.state.locationId);
    const counts: Budget = {
      agents: people.length + (this.metro?.onStage ?? 0),
      near: near + (this.metro?.onStage ?? 0),
      vehicles: (this.traffic?.vehicles.length ?? 0) + (this.bikes?.vehicles.length ?? 0),
      particles: this.atmosphere?.live ?? 0,
      tweens: this.tweens.getTweens().length,
      objects: this.children.length,
      interiors: def.kind === 'interior' ? 1 : 0,
    };
    const budget = BUDGETS[QUALITY.level];
    const over = (Object.keys(budget) as (keyof Budget)[]).filter((k) => counts[k] > budget[k]).map((k) => `${k} ${counts[k]}/${budget[k]}`);
    return { location: def.id, interior: def.kind === 'interior', fps: Math.round(this.game.loop.actualFps), quality: QUALITY.level, counts, over, far: people.length - near, budgetScale: this.street?.budget ?? 1 };
  }
  private ambience: Ambience | null = null;
  /** Coches, furgonetas y autobuses de la calle (TrafficDef), y quien los pinta. */
  private traffic: Traffic<VehicleType> | null = null;
  /** Cuándo toca volver a decidir qué suena (updateSound) y las fuentes fijas de este sitio, una vez por escena. */
  private soundAt = 0;
  private soundSources: { fixed: Emitter[]; terraces: PlaceInfo[]; inside: PlaceInfo | null } | null = null;
  /** El partido que se ve en el césped de aquí (LocationDef.pitch), si lo hay. */
  private matchView: MatchView | null = null;
  /** La cámara está encuadrando el campo desde la grada (frameMatch). */
  private matchFramed = false;
  /** El resto del estadio por los lados (world/StandView), donde hay partido. */
  private standView: StandView | null = null;
  /** El humor de la grada en este fotograma (systems/StandLife), una vez para todos; null sin partido. */
  private standNow: { tl: Timeline; mood: StandMood; chant: Chant | null } | null = null;
  /** El último minuto mirado (standCues: cada aviso una vez) y el descanso cuyo recado ya se hizo. */
  private standLast: number | null = null;
  private errandFor = '';
  /** El saque del partido cuya salida en oleada ya se ha dado, el último t visto y el final pendiente de preguntar. */
  private exitFor = -1;
  private standLastT = -Infinity;
  private fulltimeAsk: Timeline | null = null;
  /** prefers-reduced-motion: la grada reacciona igual, pero quieta. */
  private reducedMotion = false;
  private trafficView: TrafficView | null = null;
  /** Bicis del carril bici (TrafficDef.bikes): la misma lógica de carril, otro catálogo. */
  private bikes: Traffic<BikeType> | null = null;
  private cyclistView: CyclistView | null = null;
  /** Pies de quien camina por aquí (jugador, personajes y gente): los coches frenan y las puertas se abren. */
  private readonly pedestrians: Vec2[] = [];
  /** Personajes que van de un sitio a otro según la hora; se ven sólo si están aquí. */
  private characters: {
    def: CharacterDef;
    sprite: Character;
    now: Whereabouts | null;
    /** Minuto de su horario en que se paró a hablar: mientras dura la charla, no pasa de ahí. */
    heldAt: number | null;
    /** Minutos que va por detrás de su horario desde la última charla. */
    lag: number;
  }[] = [];
  /**
   * Historias de los personajes con nombre que la tienen (systems/Story, data/saraStory.ts), leídas de GameState
   * una vez y olvidadas cuando cambian ahí (evento 'story'): la rutina del día se consulta cada fotograma.
   */
  private readonly stories = new Map<string, NamedStory>();
  /** Lo que su historia tiene que decir (un microevento, un saludo, «¡has venido!»): sale en cuanto el jugador está libre. */
  private storyQueue: (() => void)[] = [];
  /** El móvil (systems/Phone): el último minuto y la última franja ya mirados. */
  private phoneMinute = -1;
  closedSigns: ClosedSigns | null = null;
  /** Si el local donde está el jugador estaba abierto la última vez que se miró (closingTick): avisa al cerrar. */
  private roomOpen = false;
  private phoneSlot = -1;
  /** Gestos de ambiente de los personajes con nombre (systems/AmbientActions), igual que la gente de CrowdView. */
  private characterAmbient: AmbientDirector | null = null;
  /** Suelta a quien atiende al jugador: al cerrar el diálogo vuelve a lo suyo. */
  private endTalk: (() => void) | null = null;
  /** Hay alguien de un local vuelto hacia el jugador mientras su menú está abierto (openOffer). */
  private offerTalk = false;
  /** Gente del local (data/population.ts), sólo en interiores con perfil y mientras el jugador está dentro. */
  private crowd: Crowd | null = null;
  /** Gente de la calle (data/streets.ts), sólo en exteriores con perfil. */
  private street: StreetLife | null = null;
  /** Perros y palomas de la calle (sólo donde hay calle con gente). */
  private wildlife: WildlifeView | null = null;
  private signals: SignalView | null = null;
  /** Lluvia, charcos y vaho: sólo fuera. */
  private weatherView: WeatherView | null = null;
  private water: WaterView | null = null;
  private skatePark: SkateParkView | null = null;
  private atmosphere: Atmosphere | null = null;
  private streetEvents: StreetEventView[] = [];
  private alleyDeals: AlleyDealView[] = [];
  private ringBodies: Phaser.GameObjects.Zone[] = [];
  /** Mirando un evento: la cámara encuadra el corro hasta que el jugador se mueve. */
  private watching = false;
  /** Sentado: en qué asiento (data/seating.ts) y desde dónde se sentó, que es a donde vuelve al levantarse. */
  private seatedOn: { seat: Seat; from: Vec2 } | null = null;
  /** Asientos que un personaje con nombre ocupa o a los que va ahora mismo: el jugador no se sienta ahí. */
  private charactersOn: ReadonlySet<string> = new Set();
  /** Con quién se habla ahora (startTalk): un personaje con nombre parado sin charla se suelta solo (systems/Recovery). */
  private talkSprite: Phaser.GameObjects.Sprite | null = null;
  /** Personajes con nombre recuperados (systems/Recovery.settleNamed): charlas colgadas soltadas y retrasos puestos al día. */
  private readonly namedRecovered = { released: 0, resynced: 0 };
  private lighting: Lighting | null = null;
  /** Lo alto que tapa al jugador se aclara mientras le tapa. */
  private occlusion: Occlusion | null = null;
  /** Copas en primer plano con paralaje (LocationDef.foreground). */
  private foreground: ForegroundView | null = null;
  /** Los eventos de la calle (data/popups.ts): puestos, carpa, cabina del DJ… según el calendario. */
  private popUps: PopUpView | null = null;
  /** Guirnaldas de bombillas (LocationDef.garlands). */
  private garlands: StringLightsView | null = null;
  /** Bordes y datos de las zonas (data/zones.ts): sólo con el modo depuración (config/debug.ts). */
  private zoneDebug: ZoneDebugView | null = null;
  /** Inspector de gente (world/PopulationInspector): también sólo con el modo depuración. */
  private inspector: PopulationInspector | null = null;
  private crowdViews: CrowdView[] = [];
  /**
   * Trabajo medio del frame (ms, de empezar el update a acabar de pintar), suavizado: decide el presupuesto de gente
   * de la calle (StreetLife.budget). No el tiempo entre frames: en una pantalla a 30 Hz (un móvil en ahorro de
   * batería) son 33 ms aunque el frame cueste 2, y la calle se vaciaba sin motivo.
   */
  private frameMs = 1000 / 60;
  private frameStart = 0;
  private readonly measureFrame = (): void => {
    if (this.frameStart) this.frameMs += (Math.min(performance.now() - this.frameStart, 100) - this.frameMs) * 0.02;
  };
  private litterView: LitterView | null = null;
  /** Lo que hay en las mesas, el pase y la cocina de un local con servicio de mesa. */
  private serviceViews: ServiceView[] = [];
  /** Sentado a una mesa con servicio y ya apuntado en ella: el camarero sabe que está. */
  private dining = false;
  /** Lo que pidió el jugador desde la mesa (otra bebida, otra tapa...): por dónde se abre la carta cuando llega el camarero. */
  private nextOrder: MoreOption | null = null;
  /** El último vino pedido en esta visita: «otra copa» es otra de ese. */
  private lastWine: MenuItem | null = null;
  /** Lo que se ha dicho en las charlas de calle (systems/Chat): la gente anónima se olvida al cambiar de sitio; quien tiene nombre, no. */
  private readonly chatLog = new ChatLog();
  /** Cierra ya la charla de calle en curso (Esc o Q), sin pasar por ninguna respuesta. Sólo mientras hay una. */
  private chatEnd: (() => void) | null = null;
  /** Lo último que se ha oído en la grada (talkSpectator), de lo más viejo a lo último: se repite lo que hace más que no se oye. */
  private fanRecent: string[] = [];
  /**
   * Lo que el jugador está entrenando ahora (systems/Fitness): el puesto es suyo desde que lo elige hasta que baja
   * de él (para la gente, `claimed`), aunque se corte antes. `releasing`: ya acabó y está bajando.
   */
  /** Tirando a canasta (systems/Basketball): una actividad propia, no un entrenamiento; sus cosas se crean al empezar y se destruyen al acabar. */
  private court: {
    point: string;
    spot: ShootingSpot;
    session: ShootingSession;
    geo: Geometry;
    from: Vec2;
    ball: Phaser.GameObjects.Image;
    meter: Phaser.GameObjects.Graphics;
    net: Phaser.GameObjects.Graphics;
    releasing: boolean;
    /** Hasta que se suelta la tecla con la que se empezó, no se carga un tiro. */
    needRelease: boolean;
    cue: { text: string; until: number } | null;
    hintAt: number;
  } | null = null;
  private workout: { point: string; station: StationId; intensity: Intensity; minutes: number; startMinute: number; from: Vec2; releasing: boolean; hintAt: number } | null = null;
  /** Un interactuable estable por persona del local: el indicador de E no se reinicia cada frame. */
  private crowdTargets = new WeakMap<Character, Interactable>();
  /** Compras, bolsa, destino del tren y sitios sin mapa. */
  private menus!: Menus;

  private readonly services: Services;

  constructor(services: Services) {
    super({ key: 'World' });
    this.services = services;
  }

  create(data: WorldSceneData): void {
    const { state, clock, dialogue } = this.services;
    const def = getLocation(data.locationId);
    pruneRiderTextures(this);
    const built = buildLocation(this, def);
    // Donde hay un campo, el partido del calendario jugándose en él (systems/MatchPlay): el mismo se mire o no.
    this.matchView = def.pitch ? new MatchView(this, def.pitch) : null;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.standView = def.pitch ? new StandView(this, built.widthPx, this.reducedMotion) : null;
    // Llegar (o recargar) no repite avisos ni recados: se empieza a contar desde ahora.
    this.standNow = null;
    this.standLast = null;
    this.errandFor = '';
    this.exitFor = -1;
    this.standLastT = -Infinity;
    this.fulltimeAsk = null;

    this.leaving = false;
    this.activeTarget = null;
    this.activeId = null;
    this.endTalk = null;
    this.talkSprite = null;
    // Un mapa abierto es del sitio de antes: al llegar a otro, cerrado (se vuelve a abrir con M).
    this.services.map.close();
    this.interactables = [];
    this.seatedOn = null;
    this.characters = CHARACTERS.map((c, i) => {
      const entry = { def: c, sprite: new Character(this, getNpc(c.npc), i), now: null as Whereabouts | null, heldAt: null as number | null, lag: 0 };
      // Lo que dice depende de dónde está o a dónde va.
      const lines = (): readonly string[] => {
        const said = (entry.now?.moving ? entry.now.stop.going : entry.now?.stop.lines) ?? entry.sprite.def.lines;
        // Su embarazo (systems/Pregnancy): lo que cuenta en la fase de hoy, después de lo de su parada.
        const day = characterDay(this.absMinute());
        const extra = pregnancyLine(c.npc, phaseOn(c.npc, day), day);
        return extra ? [...said, extra] : said;
      };
      this.interactables.push({ kind: 'npc', sprite: entry.sprite, def: entry.sprite.def, lines });
      return entry;
    });
    this.characterAmbient = new AmbientDirector(() => this.services.state.hour + this.services.state.minute / 60);

    let position: Vec2;
    let facing: Facing;
    if (data.position) {
      position = data.position;
      facing = data.facing ?? 'down';
    } else {
      const spawn = getSpawn(def, data.spawnId ?? 'entry');
      position = spawnToWorld(spawn);
      facing = spawn.facing;
    }

    this.mapWidth = built.widthPx;
    this.mapHeight = built.heightPx;
    this.physics.world.setBounds(0, 0, built.widthPx, built.heightPx);
    this.player = new Player(this, position.x, position.y, facing);

    for (const placement of def.npcs) {
      const npc = new NPC(
        this,
        placement.tx * TILE + TILE / 2,
        placement.ty * TILE + TILE,
        getNpc(placement.id),
        placement.facing,
      );
      built.solids.add(npc);
      this.interactables.push({ kind: 'npc', sprite: npc, def: npc.def });
    }

    this.metro = def.metro
      ? new MetroSystem(
          this,
          def.id,
          def.metro,
          built.widthPx,
          METRO_CONFIG,
          state,
          {
            debug: this.services.metroDebug,
            announcer: this.services.announcer,
          },
          data.byTrain ?? false,
        )
      : null;
    if (this.metro) {
      // Sin collider con pasajeros ni guardias: un cuerpo inamovible en marcha arrastraba al jugador.
      // Ellos le ceden el paso (Walker.avoid); las paredes siguen chocando.
      for (const { sprite, def: npcDef } of this.metro.talkers) {
        this.interactables.push({ kind: 'npc', sprite, def: npcDef });
      }
    }

    for (const portal of def.portals) {
      // Subir al tren se ofrece en cada puerta; LocationSystem garantiza que hay metro.
      const xs = portal.train && this.metro
        ? this.metro.doorSpots.map((d) => d.x)
        : [portal.tx * TILE + TILE / 2];
      for (const x of xs) {
        this.interactables.push({ kind: 'portal', x, y: portal.ty * TILE + TILE / 2, portal });
      }
    }

    // Cosas que se miran: carteles sueltos y las puertas de los locales sin interior.
    for (const item of def.inspects ?? []) {
      this.interactables.push({ kind: 'inspect', x: item.tx * TILE + TILE / 2, y: item.ty * TILE + TILE / 2, name: item.name, lines: item.lines, venue: item.venue });
    }
    // Las papeleras (PropDef.waste), de cualquier tipo: se miran como un cartel.
    for (const p of def.props) {
      const waste = PROPS[p.kind].waste;
      if (waste) this.interactables.push({ kind: 'inspect', x: p.tx * TILE + ((PROPS[p.kind].tilesWide ?? 1) * TILE) / 2, y: p.ty * TILE + TILE / 2, name: waste.name, lines: waste.lines });
      // El tablón del barrio: lo que hay cerca y cuándo, calculado al consultarlo (systems/Boards).
      if (PROPS[p.kind].board) this.interactables.push({ kind: 'inspect', x: p.tx * TILE + TILE / 2, y: p.ty * TILE + TILE / 2, name: 'Tablón del barrio', lines: [], board: { tx: p.tx, ty: p.ty } });
    }
    for (const b of def.buildings ?? []) {
      if (b.study && b.doorX !== undefined) {
        this.interactables.push({ kind: 'spot', x: b.doorX * TILE + TILE / 2, y: doorRow(b) * TILE + TILE / 2, name: b.name, activities: [], study: b.study, lines: b.inspect });
        continue;
      }
      if (!b.inspect || b.doorX === undefined) continue;
      this.interactables.push({ kind: 'inspect', x: b.doorX * TILE + TILE / 2, y: doorRow(b) * TILE + TILE / 2, name: b.name, lines: b.inspect });
    }
    // Percheros de las tiendas de ropa: se ve la prenda, se prueba y se compra.
    for (const rack of def.racks ?? []) {
      this.interactables.push({ kind: 'rack', x: rack.tx * TILE + TILE / 2, y: rack.ty * TILE + TILE / 2, rack });
    }
    // Donde se compra: máquinas y mostradores, cada uno con su catálogo.
    for (const t of def.terminals ?? []) {
      this.interactables.push({ kind: 'terminal', x: t.tx * TILE + TILE / 2, y: t.ty * TILE + TILE / 2, name: t.name, catalog: t.catalog, place: t.place, serves: t.serves, staff: t.staff });
    }
    // Donde se hace algo que lleva un rato: la cama, la cocina, una mesa.
    for (const s of def.spots ?? []) {
      this.interactables.push({ kind: 'spot', x: s.tx * TILE + TILE / 2, y: s.ty * TILE + TILE / 2, name: s.name, activities: s.activities, wardrobe: s.wardrobe, study: s.study, gathering: s.gathering, housing: s.housing, job: s.job });
    }
    // Donde entrenar: los mismos puestos que usa la gente del gimnasio (data/stations.ts), cada uno en su punto.
    for (const [id, p] of Object.entries(def.points ?? {})) {
      // Una canasta no es una máquina del gimnasio: tirar tiene su propia actividad (systems/Basketball).
      const spot = COURTS[def.id]?.[id];
      if (spot) this.interactables.push({ kind: 'court', x: p.tx * TILE + TILE / 2, y: p.ty * TILE + TILE / 2, name: 'Canasta', point: id, spot });
      else if (p.use && KIND_OF[p.use]) this.interactables.push({ kind: 'station', x: p.tx * TILE + TILE / 2, y: p.ty * TILE + TILE / 2, point: id, station: p.use as StationId, facing: p.facing ?? 'up' });
    }
    // Donde sentarse: los mismos asientos que usa la gente (bancos, sillas, sofás, el andén).
    for (const seat of seatsIn(def)) {
      this.interactables.push({ kind: 'seat', x: seat.tx * TILE + TILE / 2, y: seat.ty * TILE + TILE / 2, seat });
    }
    this.menus = new Menus(this.services, {
      persist: () => this.persist(),
      arriveByTrain: (locationId) => this.arriveByTrain(locationId),
      enter: (locationId) => this.go(locationId, 'entry', false),
      fadeOut: () => this.cameras.main.fadeOut(TRANSITION_MS, 0, 0, 0),
      refreshHome: () => this.refreshHome(),
      movedHome: () => this.movedHome(),
    });

    this.physics.add.collider(this.player, built.solids);

    // Al entrar, la gente ya está a mitad de lo suyo: Crowd la reconstruye desde la hora.
    const place = placeForInterior(def.id);
    const profile = place ? profileFor(place.id) : undefined;
    this.crowd = place && profile ? new Crowd(def, place, profile) : null;
    const streetProfile = streetProfileFor(def.id);
    this.street = streetProfile ? new StreetLife(def, streetProfile) : null;
    // El presupuesto de la calidad (config/budgets.ts) es un tope de verdad, no sólo una medida.
    if (this.street) this.street.ceiling = BUDGETS[QUALITY.level].agents;
    // Un carterista de la calle (systems/Pickpocket) va a por el jugador: se lleva efectivo, nunca más de lo que lleva.
    if (this.street) {
      // Devuelve lo que de verdad se llevó: es lo que consta si se avisa a la patrulla (systems/Police).
      this.street.pickpocket.onRobbed = ({ amount, noticed }): number => {
        const state = this.services.state;
        const took = Math.min(amount, Math.max(0, state.money));
        if (took <= 0) return 0;
        state.as('Te han robado', () => {
          state.money = Math.round((state.money - took) * 100) / 100;
        });
        // Si lo nota, lo sabe en el momento; si no, lo verá en la cartera (el dinero del HUD baja igual).
        if (noticed) this.services.dialogue.start('Tú', [`¡Eh! ¡Alguien te ha metido la mano en el bolsillo! Te faltan ${euros(took)}.`]);
        return took;
      };
    }
    // Los personajes, primero: nadie de la gente anónima aparece sentado en su sitio.
    this.placeCharacters();
    this.crowd?.populate(this.clockNow(), this.playerTile());
    // Servicio de mesa (systems/TableService): lo que hay en las mesas y lo que el camarero le dice al jugador.
    this.dining = false;
    this.chatLog.forgetCrowd();
    // Dentro, el servicio del comedor; fuera, el de la terraza (la calle lleva el suyo): el mismo TableService y el mismo flujo.
    const services = this.crowd?.service ? [this.crowd.service] : (this.street?.services ?? []);
    this.serviceViews = services.map((s) => new ServiceView(this, s, def, this.crowd?.service ? (profile?.tableService ?? null) : null));
    for (const s of services) s.onPlayer = (call) => this.tableCall(call);
    this.street?.populate(this.clockNow(), this.playerTile());
    const weather = (): ReturnType<typeof weatherAt> => weatherAt(this.services.state.day, this.services.state.hour + this.services.state.minute / 60);
    const hourNow = (): number => this.services.state.hour + this.services.state.minute / 60;
    // La basura de la calle: se rehace con la escena (StreetLife.populate), así que al volver no queda nada de la otra vez.
    this.litterView = this.street ? new LitterView(this, this.street.litter) : null;
    // Donde se juega un partido, la gente del local es la grada: reacciona a lo que pasa en el campo (systems/StandLife).
    const stand = this.matchView ? this.standHook() : null;
    this.crowdViews = [this.crowd, this.street].filter((c) => c !== null).map((c) => new CrowdView(this, c, weather, c === this.street, hourNow, (x, y) => isStandable(def, x, y), c === this.crowd ? stand : null));
    // Lo que pasa en sitios escondidos algunas noches (data/streetEvents.ts): su corro es gente como la de la calle.
    this.streetEvents = STREET_EVENTS.filter((e) => e.location === def.id).map((e) => new StreetEventView(this, def, e, weather));
    this.crowdViews.push(...this.streetEvents.map((e) => e.crowd));
    // Algún rato de trapicheo en un callejón escondido (data/alleyDeals.ts): gente de la calle, una CrowdView más.
    this.alleyDeals = alleySpotsOf(def.id).map((s) => new AlleyDealView(this, def, s, weather));
    this.crowdViews.push(...this.alleyDeals.map((a) => a.crowd));
    // Donde pelean no se entra: un cuerpo sólido sobre el corro mientras pelean.
    this.ringBodies = this.streetEvents.map((e) => {
      const r = e.ringRect;
      const zone = this.add.zone(r.x, r.y, r.width, r.height).setOrigin(0, 0);
      this.physics.add.existing(zone, true);
      this.physics.add.collider(this.player, zone);
      (zone.body as Phaser.Physics.Arcade.StaticBody).enable = false;
      return zone;
    });
    this.watching = false;
    this.matchFramed = false;
    this.services.hud.setWatching(false);
    const now = this.clockNow();
    this.wildlife = this.street ? new WildlifeView(this, def, this.street, now.day, now.hour + now.minute / 60, this.playerTile()) : null;
    this.crowdTargets = new WeakMap();

    // La hora con la fracción del minuto en curso: los semáforos cambian a su segundo, no a saltos de minuto.
    this.ambience = new Ambience(this, def, () => this.pedestrians);
    const hour = (): number => this.services.clock.minuteOfDay / 60;
    // Con la semilla del lugar, el día y la media hora (como la gente de la calle y de los locales): salir y volver a
    // entrar en el mismo rato enseña el mismo tráfico, y otro día, otro.
    const slot = Math.floor(this.services.clock.minuteOfDay / 30);
    const trafficRng = (flow: string): Rng => seededRng(hashSeed('traffic', def.id, flow, state.day, slot));
    this.traffic = def.traffic ? new Traffic(withDistrictLanes(def, def.traffic), VEHICLES, def.signals ?? [], built.widthPx, trafficRng('cars')) : null;
    // Ningún coche aparece encima del jugador ni de quien ya está en la calle (al volver a la escena, tampoco).
    this.gatherPedestrians();
    this.traffic?.populate(this.trafficClock(), this.pedestrians);
    // Las recogidas de taxi/VTC de la calle piden su coche a este tráfico (StreetLife.advanceRides, Traffic.hail).
    if (this.street) this.street.traffic = this.traffic;
    this.trafficView = this.traffic ? new TrafficView(this, this.traffic, hour, () => weatherAt(state.day, hour()).wet) : null;
    this.bikes = def.traffic?.bikes ? new Traffic(withDistrictLanes(def, def.traffic.bikes), BIKES, def.signals ?? [], built.widthPx, trafficRng('bikes')) : null;
    this.bikes?.populate(this.trafficClock(), this.pedestrians);
    this.cyclistView = this.bikes ? new CyclistView(this, this.bikes, hour) : null;
    this.signals = def.signals?.length ? new SignalView(this, def, () => this.services.clock.minuteOfDay) : null;
    this.occlusion = new Occlusion(this);
    this.foreground = new ForegroundView(this, def);
    this.garlands = new StringLightsView(this, def, () => state.hour + state.minute / 60);
    this.popUps = new PopUpView(this, def, this.player, () => this.clockNow(), () => state.hour + state.minute / 60);
    // Dentro no llueve: al entrar en un local el tiempo se queda en la calle, y el mundo sigue.
    this.weatherView = def.kind === 'exterior'
      ? new WeatherView(this, def, () => weatherAt(state.day, state.hour + state.minute / 60), () => state.hour + state.minute / 60, () => [...this.crowdViews.flatMap((v) => v.people), ...this.characters.map((c) => c.sprite)])
      : null;
    // El agua de un canal (destellos y, de noche, el reflejo de las farolas) y los patinadores de una zona de skate.
    this.water = def.kind === 'exterior' ? new WaterView(this, def, () => state.hour + state.minute / 60) : null;
    this.skatePark = def.skate ? new SkateParkView(this, def, () => state.hour + state.minute / 60) : null;
    // La hora se ve en la calle; dentro manda la luz del local.
    this.lighting = new Lighting(this, def, built, state);
    // Y en la puerta de cada negocio, si está cerrado, su cartel (world/ClosedSigns): lo mismo que dice Places.isOpen.
    this.closedSigns = new ClosedSigns(this, def, state);
    // Lo pequeño que se mueve solo: hojas, vaho, vapor, polvo, humo, el aire del tren (world/Atmosphere).
    const edgeY = def.metro ? def.metro.edgeRow * TILE + 12 : 0;
    this.atmosphere = new Atmosphere(this, def, {
      weather: () => weatherAt(state.day, state.hour + state.minute / 60),
      hour: () => state.hour + state.minute / 60,
      day: () => state.day,
      traffic: () => this.traffic,
      train: () => (this.metro ? { train: this.metro.train, doors: this.metro.doorSpots, edgeY } : null),
    });

    const camera = this.cameras.main;
    camera.setBackgroundColor(PALETTE.ink);
    camera.setRoundPixels(true);
    camera.startFollow(this.player, true, CAMERA_LERP, CAMERA_LERP);
    camera.setFollowOffset(0, CAMERA_LOOK_UP);
    this.fitCamera();
    camera.fadeIn(TRANSITION_MS, 0, 0, 0);
    // Al llegar, un momento sin acción: un doble toque en la puerta no te vuelve a sacar (o meter) nada más entrar.
    this.readyAt = this.time.now + ARRIVAL_LOCK_MS;

    // Lo que pasó en el trayecto se cuenta al bajar, cuando ya se ve la estación.
    const ridden = data.byTrain ? this.services.metroEvents.takePending() : null;
    if (ridden) this.time.delayedCall(TRANSITION_MS + 250, () => this.presentRideEvent(ridden));

    const onResize = (): void => this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);

    this.prompt = this.add.image(0, 0, 'ui-prompt').setDepth(LAYER.prompt).setVisible(false);

    this.bindKeys();

    state.locationId = def.id;
    state.setOffMap(null);
    clock.setPaused(false);
    // En el barrio del estadio, el día de partido se anuncia al llegar (systems/Match): rival y hora del saque; empezado,
    // el marcador de ese momento (systems/MatchPlay, el mismo que en la grada); acabado, el resultado.
    const game = LOCATION_DISTRICT[def.id] === ARENA_MATCHES.district ? (matchNow(state) ?? matchOn(state.day)) : null;
    const live = game ? stateAt(timelineOf(game), this.absMinute()) : null;
    const score = live && live.stage !== 'pre' && game ? `${ARENA_CLUB.short} ${live.score[0]} – ${live.score[1]} ${game.rival}` : '';
    this.services.place.show(!game ? def.name : !score ? `${def.name} · hoy ${ARENA_CLUB.short} – ${game.rival}, ${kickoffLabel(game.kickoff)}` : live!.stage === 'full' ? `${def.name} · final: ${score}` : `${def.name} · ${score} (${live!.clock})`);

    // Hablar no para el mundo: sólo a quien atiende, que vuelve a lo suyo al despedirse.
    const onDialogueClose = (): void => {
      this.endTalk?.();
      this.endTalk = null;
      this.talkSprite = null;
      this.chatEnd = null;
    };
    dialogue.on('close', onDialogueClose);
    // Una historia cambiada en GameState (aquí o desde la consola de desarrollo) se vuelve a leer.
    const onStory = (id: string): void => {
      this.stories.delete(id);
    };
    state.on('story', onStory);
    // El uniforme de trabajo, ya al entrar (y fuera de su sitio, la ropa de siempre).
    this.dressForWork();
    this.services.phone.attach({
      now: () => Math.floor(this.absMinute()),
      status: (npc) => this.phoneEnv().status(npc, Math.floor(this.absMinute())),
      send: (npc, action) => this.sendPhone(npc, action),
      offer: (npc) => {
        const beat = this.storyOfferFor(npc);
        if (beat?.choices) return { accept: beat.choices[0].label, decline: beat.choices[1].label };
        return this.storyOf(npc)?.plan?.status === 'pending' ? { cancel: true } : undefined;
      },
      planLine: (npc) => {
        const story = this.storyOf(npc);
        const def = STORIES[npc];
        return story && def ? planSummary(story, def, this.services.state.day) ?? undefined : undefined;
      },
      read: (npc) => {
        const phone = this.services.state.phone;
        const read = markRead(phone, npc);
        if (read !== phone) this.services.state.setPhone(read);
      },
      persist: () => this.persist(),
      // Un campo del móvil con foco: Phaser no lee teclas ni les quita su efecto (WASD, Espacio, Intro se escriben);
      // al soltarlo, todo vuelve como estaba y sin teclas «pegadas» de antes.
      typing: (on) => {
        const keyboard = this.input.keyboard;
        if (!keyboard) return;
        keyboard.resetKeys();
        this.services.input.releaseAll();
        keyboard.enabled = !on;
        if (on) keyboard.disableGlobalCapture();
        else keyboard.enableGlobalCapture();
      },
    });

    // Partida nueva: la guía del principio, cuando ya se ve la calle (data/tour.ts). Una partida de antes no la ve.
    this.time.delayedCall(TRANSITION_MS + 500, () => this.offerTour());
    // La pantalla de inicio (title.ts) se quita con la calle ya montada.
    this.game.events.emit('lifesim:world-ready');

    const autosave = this.time.addEvent({
      delay: AUTOSAVE_INTERVAL_MS,
      loop: true,
      callback: () => this.persist(),
    });

    this.game.events.on(Phaser.Core.Events.POST_RENDER, this.measureFrame);
    // Alpha-06: quien esté en la sala online y en esta zona, con su aspecto (ui/OnlinePanel guarda la sala entre escenas).
    const remotes = new RemotePlayers(this, () => zoneOf(state.locationId), this.services.online.isBlocked);
    this.services.online.bind(remotes);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.services.online.bind(null);
      remotes.clear();
      this.game.events.off(Phaser.Core.Events.POST_RENDER, this.measureFrame);
      dialogue.off('close', onDialogueClose);
      state.off('story', onStory);
      this.services.phone.attach(null);
      // Lo que su historia iba a decir aquí se pierde con la escena: lo importante (flags, plan) ya está guardado.
      this.storyQueue = [];
      // Nada abierto se queda de la escena de antes: ni una charla (con quien hablaba, soltado) ni un menú, ni el aviso ni el botón táctil.
      this.endTalk?.();
      this.endTalk = null;
      this.talkSprite = null;
      this.chatEnd = null;
      dialogue.close();
      if (this.services.menu.isOpen) this.services.menu.close();
      this.services.input.releaseAll();
      this.services.input.setContext({ action: null, back: false, busy: false });
      // Si se cambia de escena entrenando, lo hecho hasta ahora cuenta y el puesto se suelta.
      this.abortTraining();
      this.destroyCourt();
      this.services.hint.hide();
      this.scale.off(Phaser.Scale.Events.RESIZE, onResize);
      autosave.remove();
      this.services.metroDebug?.hide();
      this.crowd?.rememberVisitors(this.clockNow());
      this.metro?.shutdown();
      // Lo que sonaba aquí se apaga con un fundido corto: el sitio nuevo sube lo suyo. Las capas son las mismas, no se crean otras.
      this.services.audio.silence();
      this.soundSources = null;
      this.matchView?.destroy();
      this.matchView = null;
      this.standView = null;
      this.standNow = null;
      this.litterView?.destroy();
      this.litterView = null;
      this.zoneDebug?.destroy();
      this.zoneDebug = null;
      this.inspector?.destroy();
      this.inspector = null;
    });
  }

  private dressedAt = 0;

  /**
   * En el lugar de trabajo (LocationDef.workplace) con el turno abierto (systems/Jobs.onShift), el uniforme del empleo
   * (data/jobs.ts `uniform`); hecho el turno o fuera de ahí, lo de siempre. No toca la apariencia guardada: es una
   * capa encima (world/TextureFactory.setPlayerUniform), y sólo repinta cuando cambia.
   */
  private dressForWork(): void {
    const { state } = this.services;
    const place = getLocation(state.locationId).workplace;
    const job = place ? jobDef(place) : null;
    const wearing = job?.uniform && onShift(state.job, job.id, state.day, Math.floor(this.absMinute())) ? (UNIFORM_LOOKS.find((l) => l.id === job.uniform) ?? null) : null;
    setPlayerUniform(this, wearing, state.appearanceOf('player'));
  }

  update(time: number, delta: number): void {
    this.frameStart = performance.now();
    const { clock, dialogue, menu, map, input, phone } = this.services;
    input.beginFrame();
    if (time - this.dressedAt > 500) {
      this.dressedAt = time;
      this.dressForWork();
    }
    this.updateSound(time);
    this.matchView?.update(this.absMinute(), time);
    this.updateStand(time);
    // El acabado de quien acaba de aparecer, a ratos (world/HdCache): más mientras la escena entra.
    pumpPeopleFine(this.cameras.main.fadeEffect.isRunning || time - this.time.startTime < FINE_ENTRY_MS ? FINE_BAKE_ENTRY_MS : FINE_BAKE_MS);

    // Tras un salto (dormir, un turno, el metro) el reloj espera a que se lea lo que ha pasado; sin nada abierto, sigue.
    if (clock.isHeld && !dialogue.isOpen && !menu.isOpen && !this.leaving) clock.release();
    // Cerrado el menú de quien atiende (y sin nada más abierto), vuelve a lo suyo.
    if (this.offerTalk && !menu.isOpen && !dialogue.isOpen) {
      this.offerTalk = false;
      this.endTalk?.();
      this.endTalk = null;
      this.talkSprite = null;
    }
    // Junto a la hora se dice si corre: el mapa, un menú que no es «en vivo» y la lectura tras un salto lo paran; el móvil, no.
    const stopped = map.isOpen || clock.isHeld || clock.isPaused || (menu.isOpen && !menu.isLive && !dialogue.isOpen);
    this.services.hud.setClockMode(stopped ? 'paused' : phone.isOpen ? 'phone' : 'running');

    // El mapa es un modo de interfaz, como el menú: el jugador se para, nada responde a la E y el
    // mundo espera (ni reloj ni gente) hasta cerrarlo. M o Esc lo cierran; su botón, también.
    if (map.isOpen) {
      this.player.halt();
      this.prompt.setVisible(false);
      this.services.hint.hide();
      input.setContext({ action: null, back: false, busy: true });
      if (this.pressedAny(['map', 'cancel', 'cancelAlt'])) map.close();
      return;
    }
    if (!menu.isOpen && !dialogue.isOpen && !phone.isOpen && this.pressedAny(['map'])) {
      this.player.halt();
      map.open();
      return;
    }

    // El móvil (ui/Phone): el jugador se para y el mundo sigue, así las respuestas llegan mientras mira. P lo
    // cierra; Esc vuelve atrás. Si algo abre un diálogo o un menú (un aviso del andén), el móvil se guarda.
    if (phone.isOpen && (dialogue.isOpen || menu.isOpen)) phone.close();
    if (phone.isOpen) {
      this.player.halt();
      this.prompt.setVisible(false);
      this.services.hint.hide();
      input.setContext({ action: 'Elegir', back: true, busy: true });
      if (phone.isTyping) {
        // Escribiendo en el móvil, las teclas son letras: ni cierra, ni elige, ni mueve (Phaser ya no lee el teclado).
      } else if (this.pressedAny(['phone'])) phone.close();
      else if (this.pressedAny(['cancel', 'cancelAlt'])) phone.back();
      else if (this.pressedAny(['up', 'upAlt', 'left', 'leftAlt'])) phone.move(-1);
      else if (this.pressedAny(['down', 'downAlt', 'right', 'rightAlt'])) phone.move(1);
      else if (this.pressedAny(['interact', 'advance', 'advanceAlt'])) phone.confirm();
      else {
        const digit = DIGITS.findIndex((name) => this.pressedAny([name]));
        if (digit >= 0) phone.pick(digit);
      }
    } else if (!menu.isOpen && !dialogue.isOpen && !this.court && !this.workout && !this.player.isBusyTraining && this.time.now >= this.readyAt && this.pressedAny(['phone'])) {
      this.player.halt();
      phone.open();
    } else if (!menu.isOpen && !dialogue.isOpen && !this.court && !this.workout && !this.player.isBusyTraining && !this.seatedOn && !this.player.isSeated && !this.leaving && this.time.now >= this.readyAt && this.pressedAny(['cancel', 'cancelAlt'])) {
      // Esc (o Q) sin nada que cerrar ni de lo que levantarse: la pausa (ui/PauseMenu, la monta main.ts).
      this.player.halt();
      this.game.events.emit('lifesim:pause');
      return;
    }

    // Un menú abierto para el mundo: se elige con W/S y E, o con 1–9. Uno «en vivo» (pedir en la
    // mesa, pagar la cuenta) deja al local seguir: el jugador se queda quieto y el resto, no.
    const liveMenu = menu.isOpen && !dialogue.isOpen && menu.isLive;
    if (menu.isOpen && !dialogue.isOpen) {
      this.player.halt();
      this.prompt.setVisible(false);
      this.services.hint.hide();
      input.setContext({ action: 'Elegir', back: true, busy: true });
      if (this.pressedAny(['up', 'upAlt'])) menu.move(-1);
      else if (this.pressedAny(['down', 'downAlt'])) menu.move(1);
      else if (this.pressedAny(['interact', 'advance', 'advanceAlt'])) menu.confirm();
      else if (this.pressedAny(['cancel', 'cancelAlt'])) menu.cancel();
      else {
        const digit = DIGITS.findIndex((name) => this.pressedAny([name]));
        if (digit >= 0) menu.confirm(digit);
      }
      // El mundo espera, pero quien atiende acaba de girarse hacia el jugador: sólo se pinta (no se simula), así la media
      // vuelta termina en vez de quedarse en el perfil mientras el menú esté abierto.
      if (!liveMenu && this.offerTalk) for (const view of this.crowdViews) view.sync(time);
      if (!liveMenu) return;
    }

    // Con un diálogo abierto el jugador escucha, quieto; el resto del mundo sigue a lo suyo.
    const talking = dialogue.isOpen;
    if (talking) {
      this.player.halt();
      this.prompt.setVisible(false);
      this.services.hint.hide();
      // Con opciones se elige tocándolas (ui/DialogueBox); si no, el botón de acción sigue.
      // «Volver» (Esc) también en el móvil, donde haya algo que cancelar: cerrar la charla o despedirse.
      input.setContext({ action: dialogue.choices.length > 0 ? null : 'Seguir', back: !!this.chatEnd || dialogue.canCancel, busy: true });
      // Cada respuesta tiene su número (la despedida es la última, y ya no se queda sin tecla). Esc o Q: la charla
      // de calle se cierra anotando que os visteis; cualquier otra se cierra, o elige su despedida si es una pregunta.
      const picked = DIGITS.findIndex((name) => this.pressedAny([name]));
      if (picked >= 0) dialogue.choose(picked);
      else if (this.pressedAny(['cancel', 'cancelAlt'])) {
        if (this.chatEnd) this.chatEnd();
        else dialogue.cancel();
      } else if (this.pressedAny(['interact', 'advance', 'advanceAlt'])) dialogue.advance();
    }

    clock.update(delta);
    this.phoneTick();
    this.closingTick();
    this.metro?.update(delta, time, this.player);
    this.placeCharacters(delta);
    this.crowd?.update(delta, this.clockNow(), this.playerTile());
    // LOD de gente: si los frames cuestan más, sale menos gente de paso; si sobra, vuelve (systems/StreetLife.crowdBudget).
    if (this.street) this.street.budget = crowdBudget(this.street.budget, this.frameMs);
    this.street?.update(delta, this.clockNow(), this.playerTile());
    for (const view of this.crowdViews) view.sync(time);
    this.litterView?.sync();
    for (const view of this.serviceViews) view.sync(time);
    // Se acaba el turno (cierra el local, se va el camarero) con el jugador esperando a la mesa: nadie vendrá.
    // Se mira cada frame, también con el menú de la mesa abierto (es «en vivo»: el mundo sigue): se cierra ese
    // menú, se cierra su cuenta como al levantarse (lo comido se paga) y sigue sentado, sin servicio. Comiendo, acaba su plato.
    const tables = this.tableService;
    if (this.dining && tables && !tables.staffed && tables.playerTable?.state !== 'SERVED') {
      if (menu.isOpen && menu.isLive) menu.close();
      // Con la cuenta ya pagada no hay nada que contar: se acaba el servicio sin aviso.
      this.leaveTable(tables.playerTable?.state === 'PAID' ? undefined : 'Ya no queda nadie atendiendo.');
    }
    const { hour, minute } = this.services.state;
    this.wildlife?.update(delta, time, hour + minute / 60, this.playerTile(), (this.player.body as Phaser.Physics.Arcade.Body).speed > 1);
    this.gatherPedestrians();
    this.ambience?.update();
    // Lo que enseña la cámara: un atascado sólo se va fuera de ella (Traffic.update).
    const seen = this.cameras.main.worldView;
    const view = [seen.x, seen.right] as const;
    this.traffic?.update(delta, this.trafficClock(), this.pedestrians, view);
    this.trafficView?.sync(time);
    this.bikes?.update(delta, this.trafficClock(), this.pedestrians, view);
    this.cyclistView?.sync();
    this.signals?.update(time);
    this.weatherView?.update(delta);
    this.water?.update(time);
    this.skatePark?.update(time);
    this.atmosphere?.update(delta);
    // Los eventos de calle siguen su reloj aunque el jugador mire: minutos absolutos, los de systems/StreetEvents.
    const eventMinute = this.services.state.day * 1440 + this.services.clock.minuteOfDay;
    this.streetEvents.forEach((e, i) => {
      e.update(eventMinute, time);
      (this.ringBodies[i].body as Phaser.Physics.Arcade.StaticBody).enable = e.ringActive;
    });
    // Trapicheo en callejones (systems/AlleyDeals): con el mismo reloj; se cortan si el jugador se queda mirando.
    this.alleyDeals.forEach((a) => {
      a.update(eventMinute, this.playerTile());
    });
    // Quien está en el corro o en el callejón no anda a la vez por la calle (la misma persona en dos sitios).
    if (this.street && (this.streetEvents.length || this.alleyDeals.length)) {
      this.street.claimLooks(new Set([...this.streetEvents.flatMap((e) => e.looks), ...this.alleyDeals.flatMap((a) => a.agents.map((g) => g.look))]));
    }
    // Mirando: en cuanto el jugador se mueve, la cámara vuelve a él.
    if (this.watching && (this.player.body as Phaser.Physics.Arcade.Body).speed > 1) this.stopWatching();
    this.lighting?.tick(time);
    this.occlusion?.update(this.player, delta);
    this.foreground?.update(this.player, delta);
    this.popUps?.update(time);
    this.garlands?.update(time);
    // Modo depuración (F3 en desarrollo): se crea al encenderlo y desaparece del todo al apagarlo.
    if (DEBUG.mode && !this.zoneDebug) this.zoneDebug = new ZoneDebugView(this, this.services.state.locationId);
    else if (!DEBUG.mode && this.zoneDebug) {
      this.zoneDebug.destroy();
      this.zoneDebug = null;
    }
    this.zoneDebug?.update(this.playerTile(), this.clockNow());
    if (DEBUG.mode && !this.inspector) this.inspector = new PopulationInspector();
    else if (!DEBUG.mode && this.inspector) {
      this.inspector.destroy();
      this.inspector = null;
    }
    this.inspector?.update(
      this.playerTile(),
      this.services.state.locationId,
      this.clockNow(),
      [...(this.street?.agents ?? []), ...(this.crowd?.agents ?? [])],
      { stuck: (this.street?.watch.stuckCount() ?? 0) + (this.crowd?.watch.stuckCount() ?? 0) + (this.metro?.watch.stuckCount() ?? 0), entry: (a) => (this.street?.agents.includes(a as StreetWalker) ? this.street.watch : this.crowd?.watch)?.entries.get(a.id) },
      // Los personajes con nombre: los que van por el barrio con su rutina y los que están en su puesto (la barra, el mostrador).
      [
        ...this.characters.filter((c) => c.sprite.visible).map((c) => c.sprite),
        ...this.interactables.flatMap((i) => (i.kind === 'npc' && i.sprite.visible ? [i.sprite] : [])),
      ].map((s) => ({ id: (s as Character).def.id, name: (s as Character).def.name, tx: s.x / TILE, ty: s.y / TILE })),
    );
    if (talking || liveMenu || phone.isOpen) {
      // Sentado, sigue respirando (y comiendo) mientras habla o elige.
      if (this.player.isSeated) this.player.seatedFrame(time, null, this.tableService?.playerEating ?? false);
      return;
    }
    if (this.player.isSeating) {
      this.updateSeated(time);
      return;
    }
    if (this.court) {
      this.updateCourt(time, delta);
      return;
    }
    if (this.player.isBusyTraining || this.workout) {
      this.updateTraining(time);
      return;
    }

    // Teclas y joystick, al mismo movimiento: las teclas por su lado y el stick, analógico.
    this.player.move({
      up: this.keyHeld('up') || this.keyHeld('upAlt'),
      down: this.keyHeld('down') || this.keyHeld('downAlt'),
      left: this.keyHeld('left') || this.keyHeld('leftAlt'),
      right: this.keyHeld('right') || this.keyHeld('rightAlt'),
      analog: input.stick,
    });

    this.syncState();

    // Lo que su historia tiene que decir (systems/Story): de uno en uno y sólo con el jugador libre. Si no hay
    // nada pendiente, quizá le salude ella primero al cruzarse.
    if (!dialogue.isOpen && !menu.isOpen && this.time.now >= this.readyAt) {
      const next = this.storyQueue.shift();
      if (next) {
        next();
        return;
      }
      this.storyHello();
      if (dialogue.isOpen) return;
    }

    const target = this.nearestInteractable();
    this.updatePrompt(target);
    const arriving = this.time.now < this.readyAt;
    input.setContext({ action: arriving ? null : this.actionLabel(target), back: false, busy: false });

    // Una sola cosa por pulsación: si algo abrió un diálogo o un menú en este mismo frame (un aviso del andén),
    // la pulsación se gasta sin abrir otro encima.
    const free = !dialogue.isOpen && !menu.isOpen && !arriving;
    if (this.pressedAny(['interact'])) {
      if (target && free) this.interact(target);
    } else if (this.pressedAny(['bag'])) {
      if (!free) return;
      this.player.halt();
      this.menus.openBag();
    }
  }

  /**
   * Un píxel del juego mide lo mismo en todas partes: el zoom sale de la
   * ventana (en enteros de píxel físico, al menos VIEW_WIDTH × VIEW_HEIGHT de mundo), no del sitio. Así
   * nadie cambia de tamaño al cruzar una puerta. Si el mapa no llena el
   * viewport, se ensanchan los límites de cámara para que quede centrado en
   * lugar de pegado a una esquina.
   */
  private fitCamera(): void {
    const camera = this.cameras.main;
    const { width, height } = this.scale.gameSize;
    // En vertical el encuadre gira (pixelZoom): si no, un móvil de pie ve el triple de mundo y la gente sale diminuta.
    // Escala de píxel entera (world/PixelScale): un píxel del mundo, siempre los mismos píxeles físicos.
    const zoom = pixelZoom(width, height);
    camera.setZoom(zoom);

    const boundsWidth = Math.max(this.mapWidth, width / zoom);
    const boundsHeight = Math.max(this.mapHeight, height / zoom);
    // Viendo el partido (frameMatch), la cámara puede subir por encima del mapa lo que tapan el HUD y los botones.
    const above = this.matchFramed ? this.topReserve() : 0;
    camera.setBounds(
      (this.mapWidth - boundsWidth) / 2,
      (this.mapHeight - boundsHeight) / 2 - above,
      boundsWidth,
      boundsHeight + above,
    );
  }

  /** Lo que tapan arriba el HUD y los botones de las esquinas (ui/HUD.topInset), en píxeles de mundo, con un margen. */
  private topReserve(): number {
    const css = this.services.hud.topInset() - this.game.canvas.getBoundingClientRect().top;
    return Math.max(0, css + 8) * (this.scale.gameSize.width / this.scale.displaySize.width) / this.cameras.main.zoom;
  }

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('LIFE//SIM necesita teclado.');
    this.keys = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      upAlt: Phaser.Input.Keyboard.KeyCodes.UP,
      downAlt: Phaser.Input.Keyboard.KeyCodes.DOWN,
      leftAlt: Phaser.Input.Keyboard.KeyCodes.LEFT,
      rightAlt: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      interact: Phaser.Input.Keyboard.KeyCodes.E,
      advance: Phaser.Input.Keyboard.KeyCodes.SPACE,
      advanceAlt: Phaser.Input.Keyboard.KeyCodes.ENTER,
      one: Phaser.Input.Keyboard.KeyCodes.ONE,
      two: Phaser.Input.Keyboard.KeyCodes.TWO,
      three: Phaser.Input.Keyboard.KeyCodes.THREE,
      four: Phaser.Input.Keyboard.KeyCodes.FOUR,
      five: Phaser.Input.Keyboard.KeyCodes.FIVE,
      six: Phaser.Input.Keyboard.KeyCodes.SIX,
      seven: Phaser.Input.Keyboard.KeyCodes.SEVEN,
      eight: Phaser.Input.Keyboard.KeyCodes.EIGHT,
      nine: Phaser.Input.Keyboard.KeyCodes.NINE,
      cancel: Phaser.Input.Keyboard.KeyCodes.ESC,
      cancelAlt: Phaser.Input.Keyboard.KeyCodes.Q,
      bag: Phaser.Input.Keyboard.KeyCodes.I,
      map: Phaser.Input.Keyboard.KeyCodes.M,
      phone: Phaser.Input.Keyboard.KeyCodes.P,
    }) as Keys;
  }

  /** Sólo el teclado: andar con teclas (el stick entra aparte, analógico, en Player.move). */
  private keyHeld(name: string): boolean {
    return this.keys[name]?.isDown ?? false;
  }

  /** Teclado o controles táctiles (systems/PlayerInput): mismos nombres, misma acción. */
  private held(name: string): boolean {
    return this.keyHeld(name) || this.services.input.isHeld(name);
  }

  private pressedAny(names: string[]): boolean {
    return names.some((name) => {
      const key = this.keys[name];
      return (key ? Phaser.Input.Keyboard.JustDown(key) : false) || this.services.input.consume(name);
    });
  }

  /**
   * Qué hace ahora el botón táctil de acción, con lo que tiene cerca: el mismo
   * objetivo al que respondería la E. Un solo botón que cambia de nombre, no
   * uno por cada cosa.
   */
  private actionLabel(target: Interactable | null): string | null {
    if (!target) return null;
    switch (target.kind) {
      case 'npc': return 'Hablar';
      case 'portal': return target.portal.train ? 'Subir' : target.portal.label?.startsWith('Salir') ? 'Salir' : 'Entrar';
      case 'seat': return 'Sentarse';
      case 'station': return 'Entrenar';
      case 'court': return 'Tirar a canasta';
      case 'terminal': return 'Comprar';
      case 'rack': return 'Ver prenda';
      case 'spot': return target.wardrobe ? 'Cambiarse' : 'Usar';
      case 'inspect': return target.board || target.venue ? 'Consultar' : 'Mirar';
      case 'event': return 'Mirar';
    }
  }

  /**
   * Cada personaje con nombre, donde le toca a esta hora: aquí se ve; en otro
   * sitio o en casa, no. El sitio donde está parado es suyo: la gente del local
   * y de la calle no se sienta encima.
   */
  private placeCharacters(deltaMs = 0): void {
    const now = this.absMinute();
    const here = this.services.state.locationId;
    const outdoor = getLocation(here).kind === 'exterior';
    const weather = weatherAt(this.services.state.day, this.services.clock.minuteOfDay / 60);
    const claimed = new Set<string>();
    const heading = new Set<string>();
    const player = this.playerTile();
    for (const c of this.characters) {
      // Quien tiene historia empieza su día (una vez) y sigue la rutina que ese día le ha fijado.
      const pick = this.storyPicker(c.def, now);
      // Estado colgado (systems/Recovery): una charla que ya no existe o un retraso enorme donde no se le ve.
      const seenNow = c.now !== null && c.now.location === here && !c.now.inside && !offCamera(c.now, player);
      const fixed = settleNamed(c, now, this.talkSprite === c.sprite, !seenNow);
      if (fixed) this.namedRecovered[fixed]++;
      if (c.heldAt === null && c.lag > 0) c.lag = catchUp(c.def, now, c.lag, (GAME_MINUTES_PER_REAL_SECOND * deltaMs) / 1000, here, pick);
      const w = whereabouts(c.def, c.heldAt ?? now - c.lag, pick);
      c.now = w;
      this.watchStoryPlan(c, w, player);
      const visible = w.location === here && !w.inside;
      const seed = hashSeed('weather', c.def.npc);
      // Con el vientre de su fase de hoy (systems/Pregnancy): sale de lo guardado, nunca de una tirada al entrar.
      const body = pregnantLook(c.sprite.def, bumpOf(phaseOn(c.def.npc, characterDay(now))));
      const look = outdoor ? characterLook(body, seed, weather) : body;
      c.sprite.setLook(look.id);
      c.sprite.umbrella = outdoor ? umbrellaFor(seed, weather, !!look.hood) : null;
      if (visible && !w.moving) claimed.add(w.stop.point);
      if (visible && seatAt(w.stop.point)) heading.add(w.stop.point);
      // Parado en un semáforo: de pie, sin la actividad del sitio al que va. Cada uno, su semilla y la altura de su asiento.
      const activity = w.waiting ? 'idle' : activityAt(w.stop.point, undefined, this.characters.indexOf(c));
      const where: Placement | null = visible ? { ...w, moving: w.moving && !w.waiting, activity, lift: w.moving ? 0 : seatAt(w.stop.point)?.lift } : null;
      if (where) where.ambient = this.characterAmbientOf(c.def.npc, where, w.stop.point, outdoor);
      else this.characterAmbient?.forget(c.def.npc);
      c.sprite.place(where, this.time.now);
    }
    this.charactersOn = heading;
    // Un personaje con nombre viene a su sitio de siempre y el jugador está sentado ahí: se levanta.
    if (this.seatedOn && this.player.isSeated && heading.has(this.seatedOn.seat.id)) this.standUp();
    // El asiento del jugador es suyo mientras esté sentado: la gente del local y de la calle no lo coge.
    if (this.seatedOn && !this.seatedOn.seat.id.startsWith('metro:')) claimed.add(this.seatedOn.seat.id);
    // El puesto de quien entrena es suyo: la gente del gimnasio no lo coge (y quien estuviera, ya se ha ido).
    if (this.workout) claimed.add(this.workout.point);
    if (this.court) claimed.add(this.court.point);
    // En un recinto con entrada, el asiento de la entrada del jugador (systems/Tickets): nadie de la grada lo coge.
    const ticketSeat = this.ticketSeat();
    if (ticketSeat) claimed.add(ticketSeat);
    this.crowd?.claim(claimed);
    this.street?.claim(claimed);
  }

  // ================================================================
  // HISTORIAS (systems/Story, data/saraStory.ts)
  // ================================================================

  /** Su historia (de la caché o de GameState). */
  // ================================================================
  // MÓVIL (systems/Phone, ui/Phone)
  // ================================================================

  /** Lo que el móvil necesita del mundo: qué hace cada uno (con la rutina que le fije su historia) y su ánimo. */
  private phoneEnv(): PhoneEnv {
    return {
      status: (npc, at): NpcStatus => {
        const def = CHARACTERS.find((c) => c.npc === npc);
        return statusOf(npc, at, def ? this.storyPicker(def, at) : undefined);
      },
      mood: (npc) => {
        const story = this.storyOf(npc);
        return story ? chatMood(story) : undefined;
      },
    };
  }

  /** Cada minuto de juego: contesta quien toque, se cierran los planes pasados y quizá alguien escribe primero. */
  private phoneTick(): void {
    const now = Math.floor(this.absMinute());
    if (now === this.phoneMinute) return;
    this.phoneMinute = now;
    const slot = Math.floor(now / INIT_SLOT);
    // Al llegar a la escena no se recuperan las franjas de antes: nadie escribe de golpe al cargar.
    if (this.phoneSlot < 0) this.phoneSlot = slot;
    const { state } = this.services;
    const phone = state.phone;
    const fresh = slot > this.phoneSlot;
    const result = phoneTick(phone, state.social, now, this.phoneSlot, this.phoneEnv());
    this.phoneSlot = slot;
    if (result.phone !== phone) this.applyPhone(result);
    if (fresh) this.storyPhone(now);
  }

  /**
   * Lo que escribe por su historia (systems/Story.phoneStory): una propuesta, un hito o el seguimiento de lo vivido.
   * Con vuestros números, despierta y libre, sin mensajes suyos por leer: lo que se lea luego no se amontona.
   */
  private storyPhone(now: number): void {
    const { state } = this.services;
    const { minute } = clockOf(now);
    if (minute < 9 * 60 || minute >= 23 * 60) return;
    for (const npc of Object.keys(STORIES)) {
      const profile = state.social[npc];
      const thread = state.phone.threads[npc];
      if (!profile?.contactExchanged || thread?.pending || (thread?.unread ?? 0) > 0) continue;
      const status = this.phoneEnv().status(npc, now);
      if (status.state !== 'free' && status.state !== 'home') continue;
      const story = this.storyOf(npc);
      if (!story) continue;
      const out = phoneStory(story, STORIES[npc], profile, this.storyNow(), state.day);
      if (!out) continue;
      this.saveStory(npc, out.story, out.profile !== profile ? out.profile : undefined);
      state.setPhone(postMessage(state.phone, npc, 'them', out.text, now), [{ npc, text: out.text, plan: !!out.story.offer }]);
      this.persistSoon();
    }
  }

  /** Su propuesta pendiente, si ya la mandó por el móvil: el móvil la enseña con sus opciones. */
  private storyOfferFor(npc: string): ReadyBeat | null {
    const story = this.storyOf(npc);
    const def = STORIES[npc];
    if (!story?.offer?.sent || !def) return null;
    return offerBeat(story, def, this.storyNow(), this.services.state.day);
  }

  /** Lo que cambia el móvil va a la misma relación de siempre (GameState.setSocialProfile) y se guarda. */
  private applyPhone(result: PhoneResult): void {
    const { state } = this.services;
    for (const [npc, profile] of Object.entries(result.profiles)) state.setSocialProfile(npc, profile);
    state.setPhone(result.phone, result.news);
    this.bridgePlans();
    this.persistSoon();
  }

  /**
   * Un plan aceptado (por el móvil o en persona) con quien tiene historia pasa a ser uno de sus planes de siempre
   * (systems/Story.planForInvite): su rutina de ese día la lleva al sitio, y ir o faltar lo resuelve su historia (el
   * recuerdo, el ánimo y lo que escribe después). Ella lo dice por el móvil: dónde y cuándo. Si ya teníais otro plan
   * quedado, se queda ése. El plan del móvil se cierra: la agenda y Hoy enseñan el de su historia.
   */
  private bridgePlans(): void {
    const { state } = this.services;
    const now = Math.floor(this.absMinute());
    const today = this.storyNow().day;
    let phone = state.phone;
    const news: PhoneNews[] = [];
    for (const plan of state.phone.plans) {
      const def = STORIES[plan.npc];
      const story = plan.status === 'accepted' && def ? this.storyOf(plan.npc) : undefined;
      if (!story || !def) continue;
      const out = planForInvite(story, def, Math.max(plan.day, today + 1), this.storyNow().free);
      phone = structuredClone(phone);
      phone.plans.find((p) => p.id === plan.id)!.status = 'cancelled';
      let text: string;
      if (out) {
        this.saveStory(plan.npc, out.story);
        const p = def.plans[out.id];
        text = out.day === plan.day
          ? `Hecho. Te espero ${whenLabel(out.day, today)} en ${p.place} a las ${p.from}: allí suelo estar.`
          : `Cambio de planes: ${whenLabel(plan.day, today)} no me cuadra. Mejor ${whenLabel(out.day, today)} en ${p.place}, a las ${p.from}; allí suelo estar.`;
      } else if (story.plan?.status === 'pending') text = `Ya tenemos algo quedado: ${planSummary(story, def, today)}. Lo dejamos para entonces, ¿vale?`;
      else text = 'Esta semana no encuentro un hueco que nos cuadre a los dos. Propónmelo más adelante, ¿vale?';
      phone = postMessage(phone, plan.npc, 'them', text, now);
      news.push({ npc: plan.npc, text, plan: true });
    }
    if (news.length) {
      state.setPhone(phone, news);
      this.persistSoon();
    }
  }

  private sendPhone(npc: string, action: PhoneActionId): void {
    const { state } = this.services;
    const now = Math.floor(this.absMinute());
    // Cancelar por el móvil el plan quedado con su historia (una visita a casa): las mismas reglas que cancelar uno del móvil.
    if (action === 'cancel-plan' && !activePlan(state.phone, npc, now) && this.storyOf(npc)?.plan?.status === 'pending') {
      const profile = state.socialOf(npc);
      const late = this.storyOf(npc)?.plan?.day === this.storyNow().day;
      const out = cancelStoryPlan(this.storyOf(npc)!, profile, STORIES[npc], this.storyNow());
      if (out) {
        this.saveStory(npc, out.story, out.profile);
        const line = lineFor(late ? 'cancel:late' : 'cancel', npc, tierOf(relationshipState(profile)), seededRng(hashSeed('story-cancel', npc, now)));
        state.setPhone(postMessage(postMessage(state.phone, npc, 'me', 'Tengo que cancelar lo que teníamos quedado. Lo siento.', now), npc, 'them', line, now + 1), [{ npc, text: line, plan: true }]);
        this.persistSoon();
        return;
      }
    }
    // Contestar por el móvil a una propuesta de su historia es lo mismo que contestarla en persona (answerStory).
    const beat = action === 'accept-invite' || action === 'decline-invite' ? this.storyOfferFor(npc) : null;
    if (beat?.choices) {
      const i = action === 'accept-invite' ? 0 : 1;
      const reply = this.answerStory(npc, beat, i).join(' ');
      const phone = postMessage(postMessage(state.phone, npc, 'me', beat.choices[i].label, now), npc, 'them', reply, now + 1);
      state.setPhone(phone, [{ npc, text: reply, plan: true }]);
      this.persistSoon();
      return;
    }
    this.applyPhone(sendMessage(state.phone, state.socialOf(npc), npc, action, now, this.phoneEnv().status(npc, now)));
  }

  /** Lo que pasa en persona llega al móvil: lo aceptado (un café, una cita) es un plan, y un número dado se avisa. */
  private phoneFromTalk(npc: string, before: SocialProfile, after: SocialProfile): void {
    const { state } = this.services;
    const known = new Set(before.memories.map((m) => m.id));
    const now = Math.floor(this.absMinute());
    const start = state.phone;
    let phone = start;
    for (const memory of after.memories) if (!known.has(memory.id)) phone = planFromTalk(phone, npc, memory, now);
    if (phone !== start) {
      state.setPhone(phone);
      this.bridgePlans();
    }
    if (!before.contactExchanged && after.contactExchanged) this.services.phone.notify(npc, 'Te ha dado su número. Ya podéis escribiros.');
  }

  private storyOf(npc: string): NamedStory | undefined {
    const def = STORIES[npc];
    if (!def) return undefined;
    let story = this.stories.get(npc);
    if (!story) {
      story = this.services.state.storyOf(npc, def.baseMood);
      // Una partida de antes de las historias en la que ya se conocían: no se vuelve a presentar.
      const met = this.services.state.events.importantNPCsMet[npc];
      if (met && def.metFlag && !(def.metFlag in story.flags)) story.flags[def.metFlag] = met.firstDay;
      // Una relación que ya existía no repite su presentación ni su «ya eres de mi gente».
      story = migrateStory(story, def, this.services.state.socialOf(npc), this.storyNow().day);
      this.stories.set(npc, story);
    }
    return story;
  }

  /** Guarda su historia (y su relación, si ha cambiado) en GameState. */
  private saveStory(npc: string, story: NamedStory, profile?: SocialProfile): void {
    const { state } = this.services;
    state.setStory(npc, story);
    this.stories.set(npc, story);
    if (profile) state.setSocialProfile(npc, profile);
  }

  /** Su día (empieza a las 06:00) y el minuto del reloj. */
  private storyNow(): StoryNow {
    const { housing, job, study } = this.services.state;
    return {
      day: characterDay(this.absMinute()), minute: Math.floor(this.services.clock.minuteOfDay), home: housing.home, owned: installedIn(housing),
      // Lo que proponga no cae encima de un turno ni de una clase (systems/Agenda.freeBetween).
      free: (day, from, until) => freeBetween(job, study, day, from, until),
    };
  }

  /** Si ese día llueve por la mañana: lo que decide una rutina de lluvia o cancelar un plan de fuera. */
  private rainyDay(day: number): boolean {
    return weatherAt(day, 10).sky.endsWith('rain');
  }

  /**
   * La rutina de cada día para quien tiene historia: la que su historia fijó ese día; sin fijar (un día de antes
   * de la partida), la del calendario. Empieza su día si aún no ha empezado: una vez, al principio, para no
   * cambiarla nunca a medias.
   */
  private storyPicker(def: CharacterDef, now: number): RoutinePicker | undefined {
    const storyDef = STORIES[def.npc];
    let story = this.storyOf(def.npc);
    if (!storyDef || !story) return undefined;
    const today = characterDay(now);
    if (story.dayDone < today) {
      const rainy = this.rainyDay(today);
      const profile = this.services.state.socialOf(def.npc);
      const started = dayStart(story, profile, storyDef, { day: today, rainy, pick: (forced) => routineFor(def, today, { rainy, forced }).id });
      this.saveStory(def.npc, started.story, started.profile !== profile ? started.profile : undefined);
      story = started.story;
      this.persistSoon();
    }
    const fixed = story;
    return (day) => routineFor(def, day, { rainy: this.rainyDay(day), forced: routineOn(fixed, day) });
  }

  /** Si hoy han quedado: el jugador a su lado en la hora del plan es que ha venido; pasada la hora, que no. */
  private watchStoryPlan(c: (typeof this.characters)[number], w: Whereabouts, player: TilePoint): void {
    const def = STORIES[c.def.npc];
    const story = this.storyOf(c.def.npc);
    if (!def || story?.plan?.status !== 'pending') return;
    const together = w.location === this.services.state.locationId && !w.inside && Math.hypot(w.tx - player.tx, w.ty - player.ty) <= 3;
    const profile = this.services.state.socialOf(c.def.npc);
    const result = watchPlan(story, profile, def, this.storyNow(), together);
    if (!result) return;
    this.saveStory(c.def.npc, result.story, result.profile);
    this.persistSoon();
    if (result.kept) this.storyQueue.push(() => this.storyLines(c.sprite, result.say));
  }

  /** Al cruzarse: si hoy le toca saludar primero, para al jugador ella. */
  private storyHello(): void {
    const here = this.services.state.locationId;
    const player = this.playerTile();
    for (const c of this.characters) {
      const def = STORIES[c.def.npc];
      const w = c.now;
      if (!def || !w || w.location !== here || w.inside || !c.sprite.visible) continue;
      if (Math.hypot(w.tx - player.tx, w.ty - player.ty) > def.hello.distance) continue;
      const story = this.storyOf(c.def.npc)!;
      const now = this.storyNow();
      const line = helloFor(story, def, this.services.state.socialOf(c.def.npc), now);
      if (!line) continue;
      this.saveStory(c.def.npc, { ...story, greetedDay: now.day });
      const name = c.sprite.def.name;
      this.player.halt();
      this.startTalk(c.sprite);
      this.services.dialogue.ask(name, [line], ['Pararse a hablar', 'Ahora no'], (i) => {
        if (i === 0) {
          this.startTalk(c.sprite);
          const talk = this.conversationWith(c.sprite);
          if (talk) this.say(name, c.sprite, talk, talk.open(), c.def.npc);
          return;
        }
        // No para: lo recuerda, sin más.
        const s = structuredClone(this.storyOf(c.def.npc)!);
        noteEvent(s, 'saludo-sin-parar', now, getLocation(here).name);
        this.saveStory(c.def.npc, s);
      });
      return;
    }
  }

  /** Dice algo de su historia, parándose a decirlo. */
  private storyLines(sprite: Character, lines: readonly string[]): void {
    this.player.halt();
    this.startTalk(sprite);
    this.services.dialogue.start(sprite.def.name, lines);
  }

  /** Aplica un efecto de su historia (flags, ánimo, lo vivido, decisión y relación) y lo guarda. */
  private applyStory(npc: string, effect: Effect, note?: string): void {
    const story = this.storyOf(npc);
    const def = STORIES[npc];
    if (!story || !def) return;
    const before = this.services.state.socialOf(npc);
    const { story: next, profile } = applyEffect(story, before, effect, this.storyNow(), note);
    this.saveStory(npc, next, profile);
    // Su historia también puede daros los números (Effect.contact): el móvil lo avisa.
    if (!before.contactExchanged && profile.contactExchanged) this.services.phone.notify(npc, 'Te ha dado su número. Ya podéis escribiros.');
  }

  /**
   * Al acabar una charla, quizá te ofrece su número sin pedírselo (systems/Social.contactOfferChance). Va a la
   * cola de su historia, de uno en uno y con el jugador libre; al llegar su turno se mira otra vez, por si su
   * historia ya os los dio. Decir que no es un «ahora no»: no rompe nada, y lo puedes pedir tú más adelante.
   */
  private contactOffer(npc: string, sprite: Character): void {
    const { state } = this.services;
    const profile = state.socialOf(npc);
    const chance = contactOfferChance(profile, NAMED_PEOPLE[npc]?.temperament ?? 'tranquilo', state.day);
    if (!chance || seededRng(hashSeed('contact-offer', npc, state.day, profile.encounters))() >= chance) return;
    this.storyQueue.push(() => {
      const current = state.socialOf(npc);
      if (current.contactExchanged || !sprite.visible) return;
      const rng = seededRng(hashSeed('contact-offer-line', npc, state.day, current.encounters));
      const line = (key: string): string => lineFor(key, npc, tierOf(relationshipState(current)), rng);
      const name = sprite.def.name;
      this.player.halt();
      this.startTalk(sprite);
      this.services.dialogue.ask(name, [line('offer')], ['Sí, pásamelo', 'Ahora no'], (i) => {
        const moment = { day: state.day, hour: state.hour, minute: state.minute };
        const before = state.socialOf(npc);
        const after =
          i === 0
            ? grantContact(before, moment, `${CONTACT_OFFER_NOTE} tras una charla`)
            : noteSocialMemory(applyDelta(before, { friendship: 0, attraction: 0, trust: 0, romance: 0, mood: -2 }), { kind: 'CONTACT_REQUEST', outcome: 'neutral', ...moment, note: `${CONTACT_OFFER_NOTE} y le dijiste que ahora no` });
        state.setSocialProfile(npc, after);
        if (i === 0) this.services.phone.notify(npc, 'Te ha dado su número. Ya podéis escribiros.');
        this.persist();
        this.startTalk(sprite);
        this.services.dialogue.start(name, [line(i === 0 ? 'offer-yes' : 'offer-no')]);
      });
    });
  }

  /** Un microevento al acabar una charla: lo dice y, si hay que elegir, aplica lo elegido. */
  private showStoryBeat(npc: string, sprite: Character, beat: ReadyBeat): void {
    const { dialogue } = this.services;
    const name = sprite.def.name;
    const note = getLocation(this.services.state.locationId).name;
    // Dicho: cuenta para `once` y, si propone un plan, queda como propuesta (la misma que el móvil) hasta contestar.
    this.saveStory(npc, presentBeat(this.storyOf(npc)!, beat, this.storyNow()));
    this.persist();
    this.player.halt();
    this.startTalk(sprite);
    if (!beat.choices?.length) {
      if (beat.then) this.applyStory(npc, beat.then, note);
      dialogue.start(name, beat.say);
      this.persist();
      return;
    }
    const choices = beat.choices;
    dialogue.ask(name, [beat.say.join(' ')], choices.map((c) => c.label), (i) => {
      const reply = this.answerStory(npc, beat, i, note);
      this.startTalk(sprite);
      dialogue.start(name, reply);
    });
  }

  /**
   * Contestar a algo de su historia, en persona o por el móvil: el mismo cambio (systems/Story.chooseBeat), una
   * vez. Devuelve lo que contesta ella.
   */
  private answerStory(npc: string, beat: ReadyBeat, index: number, note?: string): string[] {
    const before = this.services.state.socialOf(npc);
    const result = chooseBeat(this.storyOf(npc)!, before, STORIES[npc], beat, index, this.storyNow(), note);
    this.saveStory(npc, result.story, result.profile);
    if (!before.contactExchanged && result.profile.contactExchanged) this.services.phone.notify(npc, 'Te ha dado su número. Ya podéis escribiros.');
    this.persist();
    return result.reply;
  }

  /** Guarda en cuanto acabe este fotograma: placeCharacters también corre mientras se monta la escena. */
  private persistSoon(): void {
    this.time.delayedCall(0, () => this.persist());
  }

  /** Para la consola de desarrollo (main.ts, lifesim.story): su historia, dónde está y qué rutina hace hoy. */
  debugStory(npc = 'sara'): { story: NamedStory | undefined; where: Whereabouts | null } {
    return { story: this.storyOf(npc), where: this.characters.find((c) => c.def.npc === npc)?.now ?? null };
  }

  /**
   * El gesto de ambiente de un personaje con nombre: el mismo sistema que la
   * gente de la calle, con su rasgo fijo (sale de su id) y su compañía (otro
   * personaje parado a su lado, p. ej. en la cena del viernes).
   */
  private characterAmbientOf(npc: string, where: Placement, point: string, outdoor: boolean): AmbientPlacement | undefined {
    const situation = this.characterAmbient && ambientSituation(where.activity ?? 'idle', undefined, where.moving);
    if (!situation || !this.characterAmbient) return undefined;
    const context = `${situation.posture}|${situation.context}|${where.moving ? '' : point}`;
    const choice = this.characterAmbient.at(npc, context, this.time.now, () => {
      const mate = where.moving
        ? undefined
        : this.characters.find((o) => o.def.npc !== npc && o.now && !o.now.moving && !o.now.inside && Math.hypot(o.now.tx - where.tx, o.now.ty - where.ty) < 2.6);
      return {
        ...situation,
        seed: hashSeed('ambient', npc),
        outdoor,
        tags: where.moving ? [] : (placeOfPoint(point)?.tags ?? []),
        companion: mate?.now ? facingTowards({ x: where.tx, y: where.ty }, { x: mate.now.tx, y: mate.now.ty }) : undefined,
      };
    });
    return choice && { frame: ambientFrame(choice, this.time.now), start: choice.start, companion: choice.companion, table: !where.moving && atTable(point) };
  }

  /** Día y minuto con la fracción en curso: el semáforo cambia a su segundo, no a saltos de minuto. */
  /**
   * Desarrollo (lifesim.scooter): saca un patinete eléctrico por el borde de un carril bici de aquí. Sólo si el barrio lo
   * permite (DistrictIdentity.scooters): en Vallesco, nunca; y dice cuántos hay ahora.
   */
  /**
   * Desarrollo (lifesim.crime.forceStreet / forceOnPlayer): un robo de calle ya, con las reglas de siempre (densidad y zona).
   * En un sitio sin calle de gente, o sin gente suficiente, lo rechaza y lo dice.
   */
  debugStreetPickpocket(onPlayer: boolean): { ok: boolean; reason: string } {
    if (!this.street) return { ok: false, reason: 'aquí no hay calle con gente' };
    const p = this.playerTile();
    return onPlayer ? this.street.pickpocket.forceOnPlayer(p) : this.street.pickpocket.force(p);
  }

  /**
   * Los servicios de mesa de aquí (lifesim.terrace.status()): de qué local es cada uno, su carta, si hay quien atienda,
   * cada mesa con su estado, quién la tiene, qué pide y el camarero que lo lleva; y la mesa del jugador.
   */
  debugTerrace(): object {
    const services = this.crowd?.service ? [this.crowd.service] : (this.street?.services ?? []);
    const agents = this.street?.agents ?? [];
    return {
      dining: this.dining,
      playerTable: this.tableService?.playerTable?.def.id ?? null,
      services: services.map((s) => ({
        place: this.street?.placeOf(s) ?? 'interior',
        menu: s.menu.id,
        staffed: s.staffed,
        waiters: agents.filter((a) => a.kind === 'staff' && a.post?.place === this.street?.placeOf(s)).map((a) => ({ id: a.id, state: s.waiterState(a.id) ?? 'IDLE', at: `${a.x.toFixed(1)},${a.y.toFixed(1)}` })),
        tables: s.tables.map((t) => ({ id: t.def.id, state: t.state, party: t.party === -1 ? 'jugador' : t.party, job: t.job, waiter: t.waiter, plates: t.plates.map((p) => p.item.id) })),
      })),
    };
  }

  /** Lleva al jugador al sitio del camarero junto a la mesa de ese asiento de terraza, en el sitio que la tenga. */
  debugTerraceGoto(seat: string): string {
    const loc = allLocations().find((l) => l.tables?.some((t) => t.seats.includes(seat)));
    const table = loc?.tables?.find((t) => t.seats.includes(seat));
    if (!loc || !table) return `ninguna mesa con el asiento ${seat}`;
    this.teleport(loc.id, table.service, 'up');
    return `${loc.id}: junto a ${table.id}`;
  }

  debugScooter():{ spawned: boolean; message: string; now: number } {
    const now = (): number => this.bikes?.vehicles.filter((v) => v.type.id === 'scooter').length ?? 0;
    if (!this.bikes) return { spawned: false, message: 'aquí no hay carril bici', now: 0 };
    const spawned = this.bikes.forceSpawn('scooter', this.trafficClock());
    return { spawned, message: spawned ? 'sale un patinete eléctrico por el borde del carril bici' : 'este barrio no admite patinetes eléctricos (o no hay hueco en la entrada)', now: now() };
  }

  private trafficClock(): { day: number; minuteOfDay: number } {
    return { day: this.services.state.day, minuteOfDay: this.services.clock.minuteOfDay };
  }

  /**
   * La guía del principio (data/tour.ts): cinco pasos cortos, cada uno con «Siguiente» o «Saltar la guía» (Esc
   * también la salta). Se apunta en la partida al acabar o al saltarla, así que no vuelve; el texto sigue en el
   * móvil (Hoy). Con algo abierto, espera a la próxima vez que se entre en un sitio.
   */
  private offerTour(step = 0): void {
    const { state, dialogue, menu } = this.services;
    if (state.agenda.tour !== 'new' || this.leaving) return;
    if (step === 0 && (dialogue.isOpen || menu.isOpen || this.services.phone.isOpen || this.services.map.isOpen)) return;
    // Leer la guía no gasta el día: el reloj espera hasta acabarla o saltarla (al cambiar de sitio, create lo suelta).
    this.services.clock.setPaused(true);
    const finish = (tour: 'done' | 'skipped'): void => {
      this.services.clock.setPaused(false);
      state.setAgenda({ ...state.agenda, tour });
      this.persist();
    };
    const last = step === TOUR.length - 1;
    const s = TOUR[step];
    dialogue.ask(`Guía ${step + 1}/${TOUR.length} · ${s.title}`, [s.text], last ? ['Empezar'] : ['Siguiente', 'Saltar la guía'], (i) => {
      if (last) finish('done');
      else if (i === 0) this.offerTour(step + 1);
      else finish('skipped');
    }, last ? 0 : 1);
  }

  /** Minuto absoluto de la partida, con la fracción en curso: el que lee el horario de los personajes. */
  private absMinute(): number {
    return (this.services.state.day - 1) * 24 * 60 + this.services.clock.minuteOfDay;
  }

  /**
   * Quien atiende al jugador se para y le mira; el resto del mundo, no. Cada
   * clase de persona se para a su manera y `endTalk` la devuelve a lo suyo
   * desde donde está: la ruta que llevaba, o la que su sistema decida ahora.
   */
  private startTalk(sprite: Phaser.GameObjects.Sprite): void {
    this.endTalk?.();
    this.talkSprite = sprite;
    const dir = facingTo(sprite, this.player);
    if (sprite instanceof NPC) {
      sprite.look(dir);
      this.endTalk = () => sprite.look();
    } else if (sprite instanceof Walker) {
      sprite.talkTo(dir);
      this.endTalk = () => sprite.endTalk();
    } else if (sprite instanceof Character) {
      const named = this.characters.find((c) => c.sprite === sprite);
      const agent = named ? undefined : this.crowdViews.map((v) => v.agentOf(sprite)).find((a) => a !== undefined);
      sprite.talkingTo = dir;
      if (named) named.heldAt ??= this.absMinute() - named.lag;
      if (agent) {
        agent.talking = true;
        // Se vuelve ya: con un menú abierto el mundo no se mueve y, sin esto, seguiría de espaldas hasta cerrarlo.
        for (const view of this.crowdViews) view.sync(this.time.now);
      }
      this.endTalk = () => {
        sprite.talkingTo = null;
        if (agent) agent.talking = false;
        if (named && named.heldAt !== null) {
          named.lag = this.absMinute() - named.heldAt;
          named.heldAt = null;
        }
      };
    }
  }

  /** Pies de todo el que anda por aquí: los coches frenan por ellos igual que por el jugador. */
  private gatherPedestrians(): void {
    const feet = this.pedestrians;
    feet.length = 0;
    feet.push({ x: this.player.x, y: this.player.y });
    for (const c of this.characters) if (c.sprite.visible) feet.push({ x: c.sprite.x, y: c.sprite.y });
    for (const view of this.crowdViews) for (const p of view.people) feet.push({ x: p.x, y: p.y });
  }

  private clockNow(): Clock {
    const { day, hour, minute } = this.services.state;
    return { day, hour, minute };
  }

  /** Tile de los pies del jugador: Crowd no aparece encima de él ni le tapa la puerta. */
  private playerTile(): TilePoint {
    return { tx: Math.floor(this.player.x / TILE), ty: Math.floor((this.player.y - 1) / TILE) };
  }

  /** Personas del local a las que se puede hablar, con su interactuable de siempre. */
  private crowdInteractables(): Interactable[] {
    return this.crowdViews.flatMap((view) => view.people).map((sprite) => {
      let item = this.crowdTargets.get(sprite);
      if (!item) {
        item = { kind: 'npc', sprite, def: sprite.def };
        this.crowdTargets.set(sprite, item);
      }
      // El sprite sale de un pozo: hoy es una persona y mañana otra.
      if (item.kind === 'npc') item.def = sprite.def;
      return item;
    });
  }

  private syncState(): void {
    const { state } = this.services;
    // Sentado se guarda donde estaba de pie: al volver a la partida se aparece ahí, no encima del banco.
    const at = this.seatedOn?.from ?? this.player;
    state.position.x = at.x;
    state.position.y = at.y;
    state.facing = this.player.facing;
  }

  /**
   * Sentado: las teclas de andar miran alrededor sin levantarse (nunca hacia el
   * respaldo); E habla con quien esté cerca o, si no hay nadie, levanta; Esc
   * también levanta. Mientras se sienta o se levanta, nada responde.
   */
  private updateSeated(time: number): void {
    this.syncState();
    const on = this.seatedOn;
    if (!on || !this.player.isSeated) {
      this.prompt.setVisible(false);
      this.services.hint.hide();
      return;
    }
    const held: [Facing, boolean][] = [
      ['left', this.held('left') || this.held('leftAlt')],
      ['right', this.held('right') || this.held('rightAlt')],
      ['up', this.held('up') || this.held('upAlt')],
      ['down', this.held('down') || this.held('downAlt')],
    ];
    const look = held.find(([dir, down]) => down && dir !== BEHIND[on.seat.facing])?.[0] ?? null;
    // A una mesa con servicio: se apunta en cuanto se ha sentado del todo (el camarero vendrá).
    const service = this.tableService;
    if (!this.dining && service?.tableOf(on.seat.id) && service.staffed) {
      service.seatPlayer(on.seat.id);
      // Sólo es comensal si la mesa es suya de verdad (si la cogió otro grupo, sigue sentado sin servicio y E le levanta).
      this.dining = service.playerTable !== undefined;
    }
    this.player.seatedFrame(time, look, service?.playerEating ?? false);

    // Viendo un partido (LocationDef.pitch): E abre el partido, no el asiento de al lado; con la gente se sigue hablando.
    const watching = this.matchOn();
    // Desde la grada la cámara mira al césped (si no, desde las filas de atrás sólo se ve la banda); al acabar, vuelve.
    if (watching !== this.matchFramed) this.frameMatch(watching);
    else if (this.matchFramed) this.followBall();
    const near = this.nearestInteractable();
    const target = watching && near?.kind !== 'npc' ? null : near;
    this.updatePrompt(target);
    if (!target) {
      // A la mesa, qué pasa con lo tuyo; viendo el partido, sus opciones; si no, sólo cómo levantarse.
      const status = this.dining ? this.tableService?.playerStatus() : null;
      this.services.hint.show(status ? `${status} · E: opciones · Esc: levantarse` : watching ? 'Viendo el partido · E: opciones · Esc: levantarse' : 'Levantarse');
      this.prompt.setPosition(this.player.x, this.player.y - PLAYER_H - 8).setVisible(true);
    }
    // Esc levanta: en el móvil, «Volver» hace lo mismo (el botón de acción puede estar ocupado hablando con alguien).
    this.services.input.setContext({ action: target ? this.actionLabel(target) : this.dining || watching ? 'Opciones' : 'Levantarse', back: true, busy: false });
    // Si algo abrió un diálogo o un menú en este mismo frame (un aviso del andén), la pulsación se gasta sin hacer nada: no se abren dos a la vez.
    const free = !this.services.dialogue.isOpen && !this.services.menu.isOpen && this.time.now >= this.readyAt;
    if (this.pressedAny(['interact'])) {
      if (!free) return;
      if (target) this.interact(target);
      else if (this.dining && service) this.tableOptions(service);
      else if (watching) this.matchOptions();
      else this.standUp();
    } else if (this.pressedAny(['cancel', 'cancelAlt'])) {
      if (free) this.standUp();
    } else if (this.pressedAny(['bag'])) {
      if (free) this.menus.openBag();
    }
  }

  /** Si aquí se juega un partido y aún no ha acabado (del calentamiento al final): lo que se ve desde la grada. */
  private matchOn(): boolean {
    if (!this.matchView) return false;
    const abs = this.absMinute();
    const tl = this.matchView.timeline(abs);
    return !!tl && nextMoment(tl, abs) !== null && abs >= tl.kickoff - 90;
  }

  /**
   * La grada a la hora del mundo (systems/StandLife): el humor de todos, una vez por fotograma; los fondos
   * (world/StandView); lo que suena y se lee al pasar cada cosa (silbatos, ocasiones, goles, cánticos), una vez cada
   * una y nunca al llegar; y el recado del descanso, si se ve empezar.
   */
  private updateStand(time: number): void {
    if (!this.matchView || !this.standView) return;
    const abs = this.absMinute();
    const tl = this.matchView.timeline(abs);
    if (!tl) {
      this.standNow = null;
      this.standLast = abs;
      this.standView.update({ kind: 'off', side: null, strength: 0, since: 0, id: 'off' }, null, '', time);
      return;
    }
    const t = abs - tl.kickoff;
    const before = this.standNow?.mood.id;
    const mood = standMood(tl, t);
    const chant = chantAt(tl, t);
    this.standNow = { tl, mood, chant };
    this.standView.update(mood, chant, tl.match.rival, time);
    for (const cue of standCues(tl, this.standLast, abs)) {
      this.services.audio.cue(cue.kind);
      if (cue.text) this.matchView.say(cue.text);
    }
    this.standLast = abs;
    // El descanso empieza mirando (no al llegar ni al recargar): unos pocos bajan al vestíbulo y luego vuelven.
    const halftime = mood.kind === 'break' && mood.id.endsWith(':half');
    if (halftime && before !== undefined && before !== mood.id && mood.since < HALFTIME_ERRAND.window && this.errandFor !== mood.id && this.crowd) {
      this.errandFor = mood.id;
      const [lo, hi] = HALFTIME_ERRAND.count;
      const n = lo + Math.floor(seededRng(hashSeed('halftime', mood.id))() * (hi - lo + 1));
      this.crowd.errand(n, HALFTIME_ERRAND.from, { state: 'WAIT', points: HALFTIME_ERRAND.points, minutes: HALFTIME_ERRAND.minutes }, { state: 'WATCH', points: [HALFTIME_ERRAND.from], minutes: HALFTIME_ERRAND.back });
    }
    // El pitido final: la mayoría se levanta en oleada hacia la puerta, una vez por partido (se vea o se llegue después).
    // Si se ve pitar, se pregunta si quedarse un rato o salir con la gente; con algo abierto, en cuanto se cierre.
    if (stageAt(t) === 'full' && this.crowd && this.exitFor !== tl.kickoff) {
      this.exitFor = tl.kickoff;
      const leaders = this.crowd.agents.filter((a) => a.kind === 'visitor' && !a.leader && a.point?.startsWith(FULLTIME_EXIT.from)).length;
      this.crowd.disperse(Math.ceil(leaders * FULLTIME_EXIT.share), FULLTIME_EXIT.from, FULLTIME_EXIT.stagger);
      if (before !== undefined && stageAt(this.standLastT) !== 'full') this.fulltimeAsk = tl;
    }
    this.standLastT = t;
    if (this.fulltimeAsk && !this.services.dialogue.isOpen && !this.services.menu.isOpen) this.offerFulltime(this.fulltimeAsk);
  }

  /** Al pitido final, visto desde dentro: quedarse un rato (hasta el cierre) o levantarse y salir andando con la gente. */
  private offerFulltime(tl: Timeline): void {
    this.fulltimeAsk = null;
    const s = stateAt(tl, this.absMinute());
    const venue = venueOf(getLocation(this.services.state.locationId).venue);
    const closes = venue ? ` El estadio cierra a las ${kickoffLabel((tl.kickoff + venue.closes) % 1440)}.` : '';
    this.services.dialogue.ask(`Final · ${ARENA_CLUB.short} ${s.score[0]} – ${s.score[1]} ${tl.match.rival}`, ['Pitido final. La gente empieza a recoger y a bajar hacia la salida.'], ['Quedarse un rato', 'Salir con la gente'], (i) => {
      if (i === 0) {
        this.openDialogue('Grada', [`Te quedas un rato ${this.player.isSeated ? 'en tu asiento' : 'en la grada'}.${closes}`]);
        return;
      }
      this.standUp();
      this.openDialogue('Grada', ['Escalera abajo y por la puerta del vestíbulo. Fuera, la explanada se llena y el metro del Arena va hasta arriba un buen rato.']);
    });
  }

  /** Lo que la grada le pide a la gente del local (world/CrowdView): cómo reacciona quien mira y con qué camiseta viene. */
  private standHook(): StandHook {
    return {
      react: (a, time) => {
        const s = this.standNow;
        if (!s || a.kind !== 'visitor' || a.state !== 'WATCH' || !a.point?.startsWith(HALFTIME_ERRAND.from)) return undefined;
        const pose = spectatorPose(s.mood, supporterOf(a.id, !!a.fan), a.id, time, this.reducedMotion, s.chant);
        if (pose === null) return undefined;
        return { frame: { step: { name: 'grada', ms: [0, 0], sitPose: pose }, key: `grada-${pose}`, t: 0 }, start: 0 };
      },
      dress: (a) => {
        if (supporterOf(a.id, !!a.fan) !== 'away') return undefined;
        const tl = this.matchView?.timeline(this.absMinute());
        const look = tl ? awayFanLook(a.id, tl.match.rival) : null;
        return look ? { look, line: `Venimos con el ${tl!.match.rival}. Aquí se nos oye, ¿eh?` } : undefined;
      },
    };
  }

  /**
   * Sentado viendo el partido: seguir mirando, levantarse o pasar el rato hasta el próximo momento (el saque, la
   * próxima ocasión, la segunda parte o el final; nunca más allá). El tiempo avanza por el reloj de siempre
   * (TimeSystem.advanceMinutes, como dormir o el metro), así que la ciudad y el calendario avanzan con él; el ritmo
   * del reloj no cambia. Se puede volver a elegir entre un momento y el siguiente, o irse.
   */
  private matchOptions(): void {
    const { clock, menu, dialogue } = this.services;
    if (dialogue.isOpen || menu.isOpen || !this.matchView) return;
    const abs = this.absMinute();
    const tl = this.matchView.timeline(abs);
    if (!tl) return;
    const s = stateAt(tl, abs);
    const next = nextMoment(tl, abs);
    const options: MenuOption[] = [
      next ? { label: `Ver hasta ${next.what}`, detail: `+${next.minutes} min` } : { label: 'Ver hasta el próximo momento', disabled: 'El partido ha terminado.' },
      { label: 'Seguir mirando' },
      { label: 'Levantarse' },
    ];
    const title = `${ARENA_CLUB.short} ${s.score[0]} – ${s.score[1]} ${tl.match.rival} · ${s.clock}`;
    menu.open(title, 'Pasar el rato adelanta el reloj, como cualquier rato: lo que pase mientras, pasa igual.', options, (i) => {
      menu.close();
      // El reloj sigue corriendo con el menú abierto: el salto se calcula al elegir, no al abrir, o se pasaría de largo.
      const jump = i === 0 ? nextMoment(tl, this.absMinute()) : null;
      if (jump) {
        // Lo mismo que cuando se pasa el rato en cualquier sitio: el reloj del mundo, y se guarda.
        clock.advanceMinutes(jump.minutes);
        this.persist();
      } else if (i === 2) this.standUp();
    });
  }

  /**
   * Encuadra el campo (LocationDef.pitch) desde el asiento, con el mismo followOffset que `watch`: el centro del
   * césped, sin que el jugador salga por abajo. `false` devuelve la cámara a su sitio.
   */
  private frameMatch(on: boolean): void {
    const pitch = getLocation(this.services.state.locationId).pitch;
    this.matchFramed = on && !!pitch;
    this.services.hud.setWatching(this.matchFramed);
    this.fitCamera();
    const cam = this.cameras.main;
    this.tweens.killTweensOf(cam.followOffset);
    if (!this.matchFramed || !pitch) {
      this.tweens.add({ targets: cam.followOffset, x: 0, y: CAMERA_LOOK_UP, duration: 350, ease: 'Sine.easeOut' });
      return;
    }
    const cx = (pitch.tx + pitch.w / 2) * TILE;
    // El césped, centrado si cabe bajo el HUD y los botones de arriba; si no, justo debajo de ellos (en una ventana
    // estrecha lo tapaban casi entero: ARENA 07). Sin que el jugador salga por abajo.
    const halfView = cam.height / cam.zoom / 2;
    const belowUi = pitch.ty * TILE - this.topReserve() + halfView;
    const cy = Math.max(Math.min((pitch.ty + pitch.h / 2) * TILE, belowUi), this.player.y - halfView + PLAYER_H);
    this.tweens.add({ targets: cam.followOffset, x: this.player.x - cx, y: this.player.y - cy, duration: 600, ease: 'Sine.easeInOut' });
  }

  /**
   * Con la pantalla más estrecha que el campo (un móvil de pie), el encuadre de la grada se desliza despacio hacia el
   * balón sin salirse del césped: la jugada no se va por un lado. Si cabe entero, no se mueve.
   */
  private followBall(): void {
    const pitch = getLocation(this.services.state.locationId).pitch;
    const cam = this.cameras.main;
    const viewW = cam.width / cam.zoom;
    const ball = this.matchView?.ballX ?? null;
    if (!pitch || ball === null || viewW >= pitch.w * TILE || this.tweens.isTweening(cam.followOffset)) return;
    const cx = Phaser.Math.Clamp(ball, pitch.tx * TILE + viewW / 2, (pitch.tx + pitch.w) * TILE - viewW / 2);
    const k = Math.min(1, this.game.loop.delta / 700);
    cam.followOffset.x += (this.player.x - cx - cam.followOffset.x) * k;
  }

  /** Desarrollo (lifesim.match): el partido de aquí, su estado, el coste de pintarlo y esconderlo para medir. */
  debugMatch(hide?: boolean): object | null {
    if (!this.matchView) return null;
    if (hide !== undefined) this.matchView.setHidden(hide);
    const abs = this.absMinute();
    const tl = this.matchView.timeline(abs);
    const s = tl ? stateAt(tl, abs) : null;
    return {
      ...this.matchView.stats,
      fixture: tl ? `${tl.match.day} ${tl.match.rival}` : null,
      stage: s?.stage, clock: s?.clock, score: s?.score, final: tl?.final,
      moments: tl?.moments.map((m) => `${m.minute} ${m.side} ${m.pattern.id}${m.goal ? ' GOL' : ''}`),
      next: tl ? nextMoment(tl, abs) : null,
      stand: this.standStats(),
    };
  }

  /** La grada ahora (lifesim.match().stand): humor, cuántos hay sentados, cuántos reaccionan y lo que pinta el resto. */
  private standStats(): object | null {
    const s = this.standNow;
    const agents = this.crowd?.agents ?? [];
    const seated = agents.filter((a) => a.kind === 'visitor' && a.state === 'WATCH' && !a.moving && a.point?.startsWith(HALFTIME_ERRAND.from));
    const now = this.time.now;
    return {
      mood: s ? `${s.mood.kind} ${s.mood.side ?? ''} ${s.mood.strength.toFixed(2)}`.trim() : 'off',
      id: s?.mood.id ?? null,
      chant: s?.chant?.line ?? null,
      agents: agents.length,
      seated: seated.length,
      reacting: s ? seated.filter((a) => spectatorPose(s.mood, supporterOf(a.id, !!a.fan), a.id, now, this.reducedMotion, s.chant) !== null).length : 0,
      away: agents.filter((a) => supporterOf(a.id, !!a.fan) === 'away').length,
      concourse: agents.filter((a) => a.point?.startsWith(HALFTIME_ERRAND.points[0])).length,
      decor: this.standView ? { objects: this.standView.objects, frame: this.standView.shown } : null,
    };
  }

  /**
   * Sentado a una mesa con servicio, sin levantarse: seguir pidiendo (lo que
   * ofrece el local: otra bebida, otra copa, otra tapa...), la cuenta o irse.
   * Pedir llama al camarero; si están todos ocupados, la mesa espera su turno.
   */
  private tableOptions(service: TableService): void {
    if (this.services.dialogue.isOpen || this.services.menu.isOpen) return;
    this.menus.openTableOptions(service.menu, service.playerStatus() ?? '', (choice) => {
      if (choice.kind === 'stand') return this.standUp();
      const why = service.playerAsk(choice.kind === 'bill' ? 'bill' : 'order');
      if (why) this.services.dialogue.start('Camarero', [why]);
      else if (choice.kind === 'order') this.nextOrder = choice.more;
    });
  }

  /** El servicio de mesa de donde está sentado el jugador: el del comedor si está dentro, el de su terraza si está en la calle. */
  private get tableService(): TableService | null {
    return this.serviceFor(this.seatedOn?.seat.id);
  }

  /** El servicio al que pertenece ese asiento: dentro, el del comedor; fuera, el de la terraza de ese local (cada una el suyo). */
  private serviceFor(seat: string | undefined): TableService | null {
    return this.crowd?.service ?? this.street?.serviceAt(seat) ?? null;
  }

  /** Si alguien tiene ese puesto: quien lo usa, quien va de camino, un personaje con nombre o el propio jugador. */
  private stationBusy(point: string): boolean {
    return this.charactersOn.has(point) || this.workout?.point === point || this.court?.point === point || (this.crowd !== null && this.crowd.occupancy(point) !== 'FREE') || (this.street?.isTaken(point) ?? false);
  }

  /** Delante de una máquina del gimnasio: libre, se elige cuánto entrenar; ocupada, no. */
  private openTraining(target: Extract<Interactable, { kind: 'station' }>): void {
    this.player.halt();
    if (this.workout) return;
    if (this.stationBusy(target.point)) {
      this.services.dialogue.start(STATIONS[target.station].name, ['Está ocupada. Cuando se libere, o prueba con otra.']);
      return;
    }
    this.menus.openTraining(target.station, (intensity, minutes) => this.startWorkout(target, intensity, minutes));
  }

  /** Reserva el puesto en el acto y echa a andar hacia él: desde aquí es del jugador. */
  private startWorkout(target: Extract<Interactable, { kind: 'station' }>, intensity: Intensity, minutes: number): void {
    if (this.workout || this.stationBusy(target.point)) return;
    const def = getStation(target.station)!;
    this.workout = { point: target.point, station: target.station, intensity, minutes, startMinute: this.absMinute(), from: { x: this.player.x, y: this.player.y }, releasing: false, hintAt: 0 };
    // La gente lo sabe ya: quien iba de camino a ese puesto lo cancela, sin esperar al siguiente fotograma.
    this.placeCharacters(0);
    this.prompt.setVisible(false);
    const p = getLocation(this.services.state.locationId).points![target.point];
    this.player.startTraining(p.tx * TILE + TILE / 2, p.ty * TILE + TILE, target.facing, def.motion, def.settle === 'sit', !!def.sets);
  }

  /** Cada fotograma entrenando: el movimiento, lo que queda, y E o Esc para terminar. */
  private updateTraining(time: number): void {
    this.syncState();
    const w = this.workout;
    if (!w) return;
    // Bajando de la máquina (o yendo a ella): sólo se espera.
    if (w.releasing || !this.player.isTraining) return;
    const def = getStation(w.station)!;
    this.player.trainingFrame(time, def.sets ? { work: (def.sets.work[0] + def.sets.work[1]) / 2, rest: (def.sets.rest[0] + def.sets.rest[1]) / 2 } : undefined);
    const done = this.absMinute() - w.startMinute;
    const left = Math.max(0, Math.ceil(w.minutes - done));
    if (time - w.hintAt > 400) {
      w.hintAt = time;
      this.services.hint.show(`Entrenando · ${def.name} · quedan ${left} min · terminar`);
    }
    this.services.input.setContext({ action: 'Terminar', back: false, busy: false });
    if (done >= w.minutes) this.finishWorkout(1);
    else if (this.pressedAny(['interact', 'cancel', 'cancelAlt'])) this.finishWorkout(done / w.minutes);
  }

  /** Acaba la sesión (entera o cortada): se aplica lo hecho, baja de la máquina y suelta el puesto. */
  private finishWorkout(fraction: number): void {
    const w = this.workout;
    if (!w || w.releasing) return;
    w.releasing = true;
    const lines = this.applyWorkout(w, fraction);
    this.services.hint.hide();
    this.player.stopTraining(w.from.x, w.from.y, () => {
      // De pie otra vez: el puesto vuelve a ser de todos.
      this.workout = null;
      this.services.input.setContext({ action: null, back: false, busy: false });
      this.services.dialogue.start(STATIONS[w.station].name, lines);
    });
  }

  /** Lo que deja lo entrenado hasta ahora: forma física y energía (se guarda). Devuelve lo que se le dice al jugador. */
  private applyWorkout(w: NonNullable<typeof this.workout>, fraction: number): string[] {
    const { state } = this.services;
    const out = train(state.fitness, w.station, w.intensity, Math.min(1, Math.max(0, fraction)), this.absMinute(), state.day, state.energy);
    state.fitness = out.next;
    state.energy = state.energy - out.energy;
    this.persist();
    if (fraction < 0.25) return ['Lo dejas por hoy.'];
    const lead = fraction >= 0.99 ? 'Sesión terminada.' : 'Lo dejas a medias.';
    return [`${lead} ${afterLine(out.delta, w.station)}`, summary(out.next)];
  }

  /** Delante de una canasta: libre, se empieza a tirar; ocupada o sin fuerzas, se dice. */
  private openCourt(target: Extract<Interactable, { kind: 'court' }>): void {
    this.player.halt();
    if (this.court || this.workout) return;
    if (this.stationBusy(target.point)) {
      this.services.dialogue.start('Canasta', ['Hay alguien tirando ahí. Espera o prueba otro sitio.']);
      return;
    }
    if (this.services.state.energy < SHOOTING.minEnergy) {
      this.services.dialogue.start('Canasta', ['No tienes fuerzas ni para levantar el balón. Descansa un rato.']);
      return;
    }
    try {
      this.startCourt(target);
    } catch (error) {
      // Sin balón o sin dibujo, un error claro y fuera: nunca se cae a un entrenamiento cualquiera.
      console.error('[basket] no se puede empezar:', error);
      this.destroyCourt();
      this.services.dialogue.start('Canasta', ['No se encuentra el balón.']);
    }
  }

  /** Reserva el sitio, va a él mirando a la canasta y crea lo que se ve: el balón, el medidor y la red. */
  private startCourt(target: Extract<Interactable, { kind: 'court' }>): void {
    if (!this.textures.exists('fx-ball')) throw new Error('falta el dibujo del balón (fx-ball)');
    const p = getLocation(this.services.state.locationId).points![target.point];
    const feet = { x: p.tx * TILE + TILE / 2, y: p.ty * TILE + TILE };
    const hx = target.spot.hoop.tx * TILE + TILE / 2;
    const hy = (target.spot.hoop.ty + 1) * TILE;
    // El aro está a unos 22 px del suelo de su pie (world/PropArt, drawHoop); las manos, a la altura del pecho.
    const geo: Geometry = { hands: { x: feet.x + 3, y: feet.y - 13 }, rim: { x: hx, y: hy - 22 }, floor: { x: hx, y: hy }, feet };
    const session = new ShootingSession(target.spot, geo, Math.random, 0.5);
    const ball = this.add.image(geo.hands.x, geo.hands.y, 'fx-ball').setOrigin(0.5, 0.5).setVisible(false);
    const meter = this.add.graphics().setDepth(LAYER.overhead);
    const net = this.add.graphics().setDepth(hy + 0.3).setVisible(false);
    net.lineStyle(1, 0xe8eef2, 1);
    net.lineBetween(-4, 0, -2, 6).lineBetween(4, 0, 2, 6).lineBetween(-2, 6, 2, 6).lineBetween(-4, 0, 4, 0);
    net.setPosition(hx, hy - 22);
    this.court = { point: target.point, spot: target.spot, session, geo, from: { x: this.player.x, y: this.player.y }, ball, meter, net, releasing: false, needRelease: true, cue: null, hintAt: 0 };
    this.placeCharacters(0);
    this.prompt.setVisible(false);
    this.player.startTraining(feet.x, feet.y, 'up', 'basket', false, false);
  }

  /** Cada fotograma tirando: el medidor, el balón, el jugador y lo que pasa con cada tiro. Esc o «volver», para acabar. */
  private updateCourt(time: number, delta: number): void {
    this.syncState();
    const c = this.court;
    if (!c || c.releasing || !this.player.isTraining) return;
    this.services.input.setContext({ action: 'Tirar', back: true, busy: false });
    if (this.pressedAny(['cancel', 'cancelAlt'])) {
      this.finishCourt();
      return;
    }
    let down = this.held('interact');
    if (c.needRelease) {
      if (down) down = false;
      else c.needRelease = false;
    }
    for (const event of c.session.update(delta, down)) {
      if (event.type === 'release') {
        this.services.state.energy = Math.max(0, this.services.state.energy - SHOOTING.energyPerShot);
        this.services.clock.advanceMinutes(SHOOTING.minutesPerShot);
      } else if (event.type === 'result') {
        c.cue = { text: shotCue(event.shot), until: time + 1_600 };
        if (event.shot.made) this.swayNet(c.net);
        this.persist();
      }
    }
    const pose = c.session.pose();
    this.player.courtFrame(pose.pose, pose.lift);
    this.drawBall(c, c.session.ball());
    this.drawMeter(c);
    if (time - c.hintAt > 150) {
      c.hintAt = time;
      const tally = `${c.session.makes}/${c.session.attempts}`;
      const live = c.cue && c.cue.until > time ? c.cue.text : c.session.phase === 'charging' ? 'Suelta en la franja verde' : 'Mantén E para cargar y suéltalo para tirar';
      this.services.hint.show(`Canasta · ${c.spot.label} · ${tally} · ${live} · Esc terminar`);
    }
    // Sin fuerzas, se acabó por hoy.
    if (c.session.phase === 'ready' && this.services.state.energy < SHOOTING.minEnergy) this.finishCourt();
  }

  private drawBall(c: NonNullable<typeof this.court>, b: BallState | null): void {
    if (!b) {
      c.ball.setVisible(false);
      return;
    }
    const hoopY = c.geo.floor.y;
    // Por delante del jugador y del aro, salvo cuando pasa por detrás del tablero o rueda por el suelo.
    const depth = b.layer === 'behind' ? hoopY - 1 : b.layer === 'floor' ? Math.max(b.y + 2, c.geo.feet.y + 0.5) : 4_000 - 1;
    c.ball.setPosition(b.x, b.y).setScale(b.scale).setDepth(depth).setVisible(true);
  }

  /** El medidor sobre la cabeza: la franja buena de este sitio y lo que se ha cargado. */
  private drawMeter(c: NonNullable<typeof this.court>): void {
    const g = c.meter.clear();
    const { phase, power } = c.session;
    if (phase === 'flight' || phase === 'done') return;
    const w = 28;
    const x = this.player.x - w / 2;
    const y = this.player.y - 40;
    const good = SHOOTING.window * 0.4;
    g.fillStyle(0x10141c, 0.85).fillRect(x - 1, y - 1, w + 2, 6);
    g.fillStyle(0x4fae6a, 1).fillRect(x + Math.max(0, (c.spot.ideal - good) * w), y, Math.min(w, 2 * good * w), 4);
    g.fillStyle(0xf2ecdc, 1).fillRect(x, y + 1, power * w, 2);
    g.fillStyle(0xe05a47, 1).fillRect(x + power * w, y - 1, 1, 6);
  }

  /** La red se mece un momento cuando entra. */
  private swayNet(net: Phaser.GameObjects.Graphics): void {
    this.tweens.killTweensOf(net);
    net.setVisible(true).setScale(1, 1);
    this.tweens.add({ targets: net, scaleY: 1.5, scaleX: 0.85, duration: 110, yoyo: true, repeat: 1, onComplete: () => net.setVisible(false) });
  }

  /** Acaba la sesión: el balón y el medidor se van, el jugador vuelve a donde estaba y el sitio queda libre. */
  private finishCourt(): void {
    const c = this.court;
    if (!c || c.releasing) return;
    c.releasing = true;
    const { makes, attempts } = c.session;
    c.session.cancel();
    this.destroyCourt(true);
    this.services.hint.hide();
    this.persist();
    this.player.stopTraining(c.from.x, c.from.y, () => {
      this.court = null;
      this.services.input.setContext({ action: null, back: false, busy: false });
      if (attempts > 0) this.services.dialogue.start('Canasta', [`Has metido ${makes} de ${attempts}.`, makes * 2 >= attempts ? 'No está mal para un rato en la pista.' : 'Mañana saldrá mejor.']);
    });
  }

  /** Quita lo que se ve de la sesión; con `keep`, deja el registro (el jugador aún está volviendo). */
  private destroyCourt(keep = false): void {
    const c = this.court;
    if (!c) return;
    this.tweens.killTweensOf(c.net);
    c.ball.destroy();
    c.meter.destroy();
    c.net.destroy();
    if (!keep) this.court = null;
  }

  /** Si se corta de golpe (cambio de escena): se cuenta lo hecho y se suelta el puesto, sin transición. */
  private abortTraining(): void {
    const w = this.workout;
    if (!w) return;
    const done = (this.absMinute() - w.startMinute) / w.minutes;
    if (!w.releasing && this.player.isTraining) this.applyWorkout(w, done);
    this.workout = null;
  }

  /** El asiento de la entrada del jugador en este recinto, mientras vale (systems/Tickets.heldSeat). */
  private ticketSeat(): string | undefined {
    const venue = venueOf(getLocation(this.services.state.locationId).venue);
    return venue ? heldSeat(venue, this.services.state.tickets, this.services.state) : undefined;
  }

  /** Si alguien tiene ese asiento: la gente del local o de la calle (va o está), un personaje con nombre o, en el andén, un pasajero. */
  private seatTaken(seat: Seat): boolean {
    if (seat.id.startsWith('metro:')) return this.metro?.isSeatTaken(Number(seat.id.slice(6))) ?? true;
    // El asiento de su entrada es suyo: apartado para él, nunca ocupado por otro.
    if (seat.id === this.ticketSeat()) return false;
    // Una mesa con servicio es de un grupo hasta que se va y la recogen.
    const table = this.serviceFor(seat.id)?.tableOf(seat.id);
    if (table && (table.party !== null || table.state !== 'AVAILABLE')) return true;
    return this.charactersOn.has(seat.id) || (this.crowd !== null && this.crowd.occupancy(seat.id) !== 'FREE') || (this.street?.isTaken(seat.id) ?? false);
  }

  /** Se sienta: reserva el asiento donde lo reserva la gente, da los pasos hasta él y se sienta mirando hacia donde se mira ahí. */
  private sitDown(seat: Seat): void {
    if (this.seatTaken(seat)) return;
    // Una mesa con servicio se reserva al echar a andar hacia ella, no al acabar de sentarse: si no, un
    // grupo que entra en ese momento se la queda y el jugador acaba sentado sin camarero.
    const service = this.serviceFor(seat.id);
    // Sólo se es comensal si hay quien atienda ahora; si no, es una silla más (y se puede volver cuando abran).
    if (service?.tableOf(seat.id) && service.staffed) {
      service.seatPlayer(seat.id);
      this.dining = service.playerTable !== undefined;
    }
    this.seatedOn = { seat, from: { x: this.player.x, y: this.player.y } };
    if (seat.id.startsWith('metro:')) this.metro?.takeSeat(Number(seat.id.slice(6)));
    this.prompt.setVisible(false);
    this.services.hint.hide();
    this.player.sitOn(seat.tx * TILE + TILE / 2, seat.ty * TILE + TILE, seat.facing, seat.lift);
  }

  /**
   * Deja de ser comensal: lo pedido y no pagado se deja en la mesa (se cobra) y la mesa se libera. Al
   * levantarse, o si se acaba el servicio con el jugador esperando (`why`: se le dice por qué).
   */
  private leaveTable(why?: string): void {
    if (!this.dining) return;
    this.dining = false;
    this.nextOrder = null;
    this.lastWine = null;
    const owed = this.tableService?.playerStands() ?? 0;
    const lines: string[] = [];
    if (why) lines.push(why);
    if (owed > 0) {
      this.services.state.as('Cuenta en la mesa', () => {
        this.services.state.money -= owed;
      });
      this.persist();
      lines.push(why ? `Dejas ${euros(owed)} en la mesa por lo que has tomado.` : `Dejas ${euros(owed)} en la mesa y te levantas.`);
    }
    if (lines.length) this.services.dialogue.start('Casa', lines);
  }

  /** Se levanta, vuelve andando a donde estaba y suelta el asiento. */
  private standUp(): void {
    const on = this.seatedOn;
    if (!on || !this.player.isSeated) return;
    this.prompt.setVisible(false);
    this.services.hint.hide();
    // Levantarse de la mesa sin haber pagado es dejar el dinero encima: se cobra lo pedido.
    this.leaveTable();
    if (this.matchFramed) this.frameMatch(false);
    this.player.standTo(on.from.x, on.from.y, () => {
      if (on.seat.id.startsWith('metro:')) this.metro?.freeSeat(Number(on.seat.id.slice(6)));
      this.seatedOn = null;
    });
  }

  /**
   * El camarero llega a la mesa del jugador (systems/TableService): a tomar
   * nota, a servir, a cobrar; o se acaba lo que había en la mesa. Todo en
   * conversación y menús en vivo: el local sigue mientras tanto.
   */
  private tableCall(call: PlayerCall): void {
    const service = this.tableService;
    if (!service || !this.dining) return;
    const { state, dialogue } = this.services;
    const waiter = 'Camarero';
    // Lo que dice depende del local (data/menus.ts: la carta lleva sus frases), nunca de su nombre.
    const lines = service.menu.lines;
    const named = (i: MenuItem): string => (i.wine ? `${i.wine.serving === 'bottle' ? 'la botella' : 'la copa'} de ${i.name}` : i.name.toLowerCase());
    if (call.kind === 'order') {
      dialogue.start(waiter, [say(call.again ? lines.again : lines.greet)]);
      // Por dónde se abre la carta: lo que se pidió desde la mesa; «otra copa», el mismo vino si se sirve.
      const more = this.nextOrder;
      this.nextOrder = null;
      const wine = more?.sameWine && this.lastWine ? call.items.find((i) => i.id === this.lastWine?.id && i.wine?.serving === 'glass') ?? call.items.find((i) => i.wine?.wine === this.lastWine?.wine?.wine && i.wine?.serving === 'glass') : undefined;
      const category = more?.sameWine && this.lastWine && !wine ? this.lastWine.category : more?.category;
      dialogue.once('close', () =>
        this.menus.openOrder(service.menu, call.items, waiter, (picked) => {
          service.playerOrder(picked);
          const lastWine = [...picked].reverse().find((i) => i.wine);
          if (lastWine) this.lastWine = lastWine;
          dialogue.start(waiter, [picked.length > 0 ? `${picked.map(named).join(', ')}. ${say(lines.confirm)}` : say(lines.later)]);
        }, { wine, category }),
      );
    } else if (call.kind === 'served') {
      dialogue.start(waiter, [`${say(lines.serve)} ${call.plates.length > 0 ? `(${call.plates.map(named).join(', ')})` : ''}`.trim()]);
    } else if (call.kind === 'finished') {
      state.energy += call.energy;
      this.persist();
    } else if (call.kind === 'bill') {
      dialogue.start(waiter, [say(lines.bill)]);
      dialogue.once('close', () =>
        this.menus.openBill(call.total, (amount) => {
          if (amount === null) {
            service.playerPay(true);
            dialogue.start(waiter, [say(lines.later)]);
            return;
          }
          // playerPay sólo cobra una vez lo que quede sin pagar; si ya estaba pagado devuelve 0 y no se descuenta nada.
          if (service.playerPay() === 0) return;
          state.as('Cuenta en la mesa', () => {
            state.money -= amount;
          });
          this.persist();
          dialogue.start(waiter, [say(lines.thanks)]);
        }),
      );
    }
  }

  /** Id estable de cada cosa con la que se interactúa: desempata y evita que el aviso se reinicie por crearse el objeto otra vez. */
  /**
   * Qué suena aquí ahora (systems/Soundscape → audio/CityAudio), cuatro veces por segundo. Las fuentes salen de los
   * datos: los props que suenan (la fuente), los lugares con anclajes en la calle (una terraza, la cola de la sala)
   * según estén abiertos y con gente sentada o parada en ellos, el local en el que se está según su gente, los coches
   * que pasan según su velocidad, y el metro: su andén según el tren, y la boca desde la calle.
   */
  private updateSound(time: number): void {
    if (time < this.soundAt) return;
    this.soundAt = time + SOUND_EVERY_MS;
    const { state } = this.services;
    const here = state.locationId;
    if (!this.soundSources) {
      const def = getLocation(here);
      this.soundSources = {
        fixed: [
          ...def.props.flatMap((p) => {
            const s = PROPS[p.kind].sound;
            return s ? [{ layer: s.layer, x: p.tx + (PROPS[p.kind].tilesWide ?? 1) / 2, y: p.ty + 0.5, level: s.level }] : [];
          }),
          // La boca del metro se oye desde la calle, poco: el andén queda abajo.
          ...def.portals.filter((p) => getLocation(p.to.location).metro).map((p) => ({ layer: 'metro' as const, x: p.tx + 0.5, y: p.ty + 0.5, level: 0.35 })),
        ],
        terraces: PLACES.map((p) => placeInfo(p.id)!).filter((p) => p.locationId === here && p.anchors?.length && p.type === 'business'),
        inside: placeForInterior(here) ?? null,
      };
    }
    const { fixed, terraces, inside } = this.soundSources;
    const emitters: Emitter[] = [...fixed];
    const agents = this.street?.agents ?? [];
    for (const place of terraces) {
      const spots = place.anchors!.map((a) => getLocation(here).points?.[a]).filter((p): p is NonNullable<typeof p> => !!p);
      emitters.push(...terraceEmitters(spots, isOpen(place, state.day, state.hour, state.minute), agents));
    }
    // Dentro de un local: su gente, la que hay de verdad (Crowd), y sólo si está abierto.
    const crowd = this.crowd?.summary;
    if (inside && crowd) emitters.push({ layer: 'murmur', level: 0.8 * crowdLevel(crowd.open, crowd.visitors, inside.capacity) });
    for (const v of this.traffic?.vehicles ?? []) emitters.push({ layer: 'traffic', x: v.x / TILE, y: v.row + 0.5, level: vehicleLevel(v.speed, v.cruise) });
    if (this.metro) emitters.push({ layer: 'metro', level: metroLevel(this.metro.train.state) });
    this.services.audio.setMix(mix({ x: this.player.x / TILE, y: this.player.y / TILE }, emitters));
  }

  private idOf(item: Interactable): string {
    const where = anchor(item);
    const at = `${Math.round(where.x)},${Math.round(where.y)}`;
    switch (item.kind) {
      case 'npc': {
        let n = this.npcSerial.get(item.sprite);
        if (n === undefined) this.npcSerial.set(item.sprite, (n = ++this.npcCount));
        return `npc:${n}`;
      }
      case 'portal': return `portal:${item.portal.id}@${at}`;
      case 'rack': return `rack:${item.rack.name}@${at}`;
      case 'seat': return `seat:${item.seat.id}`;
      case 'station': return `station:${item.point}`;
      case 'event': return `event:${item.view.def.id}`;
      default: return `${item.kind}:${item.name}@${at}`;
    }
  }

  /**
   * Con quién se interactúa ahora (systems/Interaction): lo reúne todo y deja que
   * una sola regla decida (alcance, paredes, lo de delante, tipo, id), sin depender del orden de la lista.
   */
  private nearestInteractable(): Interactable | null {
    const origin = { x: this.player.x, y: this.player.y - 8 };
    const loc = getLocation(this.services.state.locationId);

    // Un evento de calle se ofrece cuando ya lo tienes delante, sin marca que lo anuncie de lejos: en su
    // mirador (StreetEventDef.vantage), no pegado al jugador; dentro del patio mandan las cajas y la gente.
    const events: Interactable[] = this.streetEvents
      .filter((e) => e.noticedFrom(this.playerTile()))
      .map((e) => ({ kind: 'event', x: e.def.vantage.tx * TILE + TILE / 2, y: e.def.vantage.ty * TILE + TILE / 2, view: e }));
    // Quien atiende un local (personal: vende, da fichas, recibe denuncias): delante del jugador, gana al cliente que paga a su lado.
    const wrap = (item: Interactable): PickCandidate & { item: Interactable } => ({ id: this.idOf(item), kind: item.kind, ...anchor(item), serves: item.kind === 'npc' && this.attends(item.sprite), item });
    const cands = [...this.interactables, ...this.crowdInteractables(), ...events]
      // Un asiento ocupado no se ofrece; las puertas del tren, sólo con las puertas abiertas; un NPC oculto, no existe.
      .filter((item) => !(item.kind === 'seat' && this.seatTaken(item.seat)) && !(item.kind === 'portal' && item.portal.train && !this.metro?.train.doorsOpen) && !(item.kind === 'npc' && !item.sprite.visible))
      .map(wrap);
    const ahead = tileAhead(this.playerTile(), this.player.facing);
    const best = pickTarget(origin, cands, {
      facing: this.player.facing,
      ahead,
      // Delante, un mostrador (no se pisa): quien atiende al otro lado se alcanza por encima.
      across: isWalkable(loc, ahead.tx, ahead.ty) ? undefined : tileAhead(ahead, this.player.facing),
      current: this.activeTarget ? wrap(this.activeTarget) : null,
      // Sentado sólo se habla con quien esté cerca.
      allow: (c) => !(this.player.isSeating && c.kind !== 'npc'),
      blocked: (c) => wallBetween(loc, origin, c),
    });
    return best?.item ?? null;
  }

  private updatePrompt(target: Interactable | null): void {
    if (!target) {
      this.prompt.setVisible(false);
      this.services.hint.hide();
      this.activeTarget = null;
      this.activeId = null;
      return;
    }

    // Todo lo que se ofrece dice qué es: una puerta, adónde lleva; una máquina, su nombre; una persona, quién es
    // (la gente sin nombre sólo se anuncia con «Hablar», en el botón).
    const toll =
      target.kind === 'portal' ? describePortal(target.portal) + (this.closedPlace(target.portal) ? ' · cerrado' : '')
      : target.kind === 'terminal' || target.kind === 'spot' ? target.name + (this.shutFor(target) || (target.kind === 'terminal' && this.stallClosed(target)) ? ' · cerrado' : '')
      : target.kind === 'inspect' ? target.name
      : target.kind === 'rack' ? target.rack.name
      : target.kind === 'event' ? target.view.def.name
      : target.kind === 'npc' ? target.def.name
      : target.kind === 'seat' ? `Sentarse · ${target.seat.def.name}`
      : target.kind === 'court' ? `Tirar a canasta · ${target.spot.label}${this.stationBusy(target.point) ? ' · ocupada' : ''}`
      : target.kind === 'station' ? `Entrenar · ${STATIONS[target.station].name}${this.stationBusy(target.point) ? ' · ocupada' : ''}`
      : '';
    if (toll) this.services.hint.show(toll);
    else this.services.hint.hide();

    // Por encima de lo más alto en juego: ni tapa al jugador cuando el objetivo
    // está bajo sus pies (una puerta) ni al NPC cuando lo tiene justo encima.
    const targetTop = target.kind === 'npc' ? target.sprite.y - PLAYER_H : target.y - 8;
    const top = Math.min(this.player.y - PLAYER_H, targetTop);
    const anchorX = target.kind === 'npc' ? target.sprite.x : this.player.x;
    this.prompt.setPosition(anchorX, top - 8).setVisible(true);
    // Por id, no por objeto: un evento de calle se crea de nuevo cada frame y reiniciaría la animación sin parar.
    this.activeTarget = target;
    const id = this.idOf(target);
    if (id === this.activeId) return;
    this.activeId = id;
    this.tweens.add({
      targets: this.prompt,
      scale: { from: 0.6, to: 1 },
      duration: 110,
      ease: 'Back.easeOut',
    });
  }

  private interact(target: Interactable): void {
    if (target.kind === 'seat') {
      this.sitDown(target.seat);
      return;
    }
    if (target.kind === 'station') {
      this.openTraining(target);
      return;
    }
    if (target.kind === 'court') {
      this.openCourt(target);
      return;
    }
    if (target.kind === 'portal') {
      this.travel(target.portal);
      return;
    }
    this.player.halt();
    // Un puesto que atiende a ratos del partido (el quiosco del estadio): cerrado, dice por qué y cuándo abre; abierto,
    // se compra con el partido en marcha (menú en vivo) y deja de cobrar si cierra con el menú abierto.
    if (target.kind === 'terminal' && target.serves) {
      const closed = this.stallClosed(target);
      if (closed) this.openDialogue(target.name, closed);
      else this.menus.openCatalog(target.name, target.catalog, '', 0, undefined, { closed: () => this.stallClosed(target)?.[0] ?? null });
      return;
    }
    // Negocio cerrado (con el jugador aún dentro, o el mostrador de la calle): ni se compra ni se pide nada nuevo.
    const shut = this.shutFor(target);
    if (shut) {
      const { day, hour, minute } = this.services.state;
      this.openDialogue(shut.name, ['Ya no se atiende: no se cobra nada más.', ...closedLines(shut, day, hour, minute).slice(1)]);
      return;
    }
    if (target.kind === 'terminal') this.menus.openCatalog(target.name, target.catalog);
    else if (target.kind === 'rack') this.menus.openRack(target.rack);
    else if (target.kind === 'spot') {
      if (target.wardrobe) this.menus.openWardrobe();
      else if (target.study) this.menus.openStudy(target.study, target.name, target.lines ?? []);
      else if (target.gathering) this.menus.openGathering(target.gathering, target.name);
      else if (target.job) this.menus.openJob(target.job, target.name);
      else if (target.housing) this.menus.openHousing(target.name, typeof target.housing === 'string' ? target.housing : undefined);
      else this.menus.openSpot(target.name, target.activities);
    }
    else if (target.kind === 'event') this.approachEvent(target.view);
    else if (target.kind === 'npc') {
      // Personal con algo que ofrecer (la barbera, la barra): se le pide; el resto, se charla.
      const offer = this.offerOf(target.sprite);
      const survivor = this.survivorOf(target.sprite);
      const officer = this.officerOf(target.sprite);
      if (offer) {
        // Quien atiende se vuelve hacia el jugador mientras dura su menú (lo suelta el bucle al cerrarse).
        this.startTalk(target.sprite);
        this.offerTalk = true;
        this.menus.openOffer(offer, target.def.name);
      }
      else if (officer) {
        // Un agente de patrulla: saludo, cómo está la calle ahora y el robo de hoy si lo hay (systems/Police). No charla.
        this.startTalk(target.sprite);
        const { state } = this.services;
        const station = PLACES.find((p) => p.tags.includes('police'))?.name;
        this.openDialogue(target.def.name, patrolLines(state.locationId, state, Math.floor(this.absMinute()), station));
      } else if (survivor) {
        this.startTalk(target.sprite);
        this.talkSurvivor(target.def.name, target.sprite, survivor);
      } else if (this.spectatorOf(target.sprite)) {
        this.startTalk(target.sprite);
        this.talkSpectator(target.def.name, target.sprite, this.spectatorOf(target.sprite)!);
      } else {
        const talk = this.conversationWith(target.sprite);
        this.startTalk(target.sprite);
        if (talk) this.say(target.def.name, target.sprite, talk, talk.open(), target.def.id);
        else this.openDialogue(target.def.name, target.lines?.() ?? target.def.lines);
      }
    }
    else if (target.board) this.menus.openBoard(this.services.state.locationId, target.board.tx, target.board.ty);
    else if (target.venue) this.menus.openTickets(target.venue);
    else this.openDialogue(target.name, target.lines);
  }

  /**
   * Delante de un evento de calle: lo que ve y qué hace. Mirar encuadra el
   * corro (sin parar nada: el reloj y la pelea siguen); hablar, con quien esté
   * más cerca; irse, nada. Participar no existe todavía: cuando haya combate,
   * será otra opción aquí.
   */
  private approachEvent(view: StreetEventView): void {
    const phase = view.phaseNow === 'none' ? 'dispersing' : view.phaseNow;
    this.services.dialogue.ask(view.def.name, [view.def.lines.arrive[phase]], ['Mirar', 'Hablar con alguien', 'Irse'], (pick) => {
      if (pick === 0) this.watch(view);
      else if (pick === 1) {
        const who = view.nearestPerson(this.player.x, this.player.y);
        if (!who) return;
        this.startTalk(who);
        this.openDialogue(who.def.name, who.def.lines);
      }
    }, 2);
  }

  private watch(view: StreetEventView): void {
    const r = view.ringRect;
    const cam = this.cameras.main;
    this.watching = true;
    // followOffset se resta al objetivo: para centrar el corro, la distancia del jugador al corro (con el mismo CAMERA_LOOK_UP de siempre).
    this.tweens.add({ targets: cam.followOffset, x: this.player.x - r.centerX, y: this.player.y - r.centerY + CAMERA_LOOK_UP, duration: 600, ease: 'Sine.easeInOut' });
  }

  private stopWatching(): void {
    this.watching = false;
    this.tweens.killTweensOf(this.cameras.main.followOffset);
    this.tweens.add({ targets: this.cameras.main.followOffset, x: 0, y: CAMERA_LOOK_UP, duration: 350, ease: 'Sine.easeOut' });
  }

  /** Si esta persona vive en la calle (data/streetSurvival.ts): su agente, con quién es. */
  private survivorOf(sprite: Phaser.GameObjects.Sprite): StreetWalker | undefined {
    if (!(sprite instanceof Character)) return undefined;
    const agent = this.crowdViews.map((v) => v.agentOf(sprite)).find((a) => a !== undefined) as StreetWalker | undefined;
    return agent?.kind === 'street' && agent.survivor ? agent : undefined;
  }

  /**
   * Hablar con quien vive en la calle (systems/StreetSurvival): a veces no le
   * apetece; si no, saluda (como a alguien conocido si ya habéis hablado) y, si
   * está pidiendo, pide. Se puede charlar un poco, darle una moneda o seguir.
   * Lo que habéis hablado y las monedas se guardan (EventMemory, como con los
   * personajes con nombre): la próxima vez se acuerda y no repite lo mismo.
   */
  private talkSurvivor(speaker: string, sprite: Phaser.GameObjects.Sprite, agent: StreetWalker): void {
    const s = agent.survivor!;
    const { state, dialogue } = this.services;
    const key = memoryKey(s);
    const memory = state.events.importantNPCsMet[key];
    const opening = openingFor(s, agent.state, { day: state.day, hour: state.hour, minute: state.minute }, memory);
    if (opening.closed) {
      dialogue.start(speaker, opening.lines);
      return;
    }
    const remember = (coin: boolean): void => {
      const met = (state.events.importantNPCsMet[key] ??= { name: s.label, firstDay: state.day, lastDay: state.day, encounters: 0, affinity: 0 });
      met.encounters += 1;
      met.lastDay = state.day;
      if (coin) met.affinity += 1;
      this.persist();
    };
    const options = [
      { id: 'chat', label: 'Charlar un poco' },
      ...(state.money >= SURVIVOR_COIN ? [{ id: 'coin', label: `Darle una moneda (${SURVIVOR_COIN.toFixed(2).replace('.', ',')} €)` }] : []),
      { id: 'bye', label: 'Seguir mi camino' },
    ];
    dialogue.ask(speaker, [opening.lines.join(' ')], options.map((o) => o.label), (i) => {
      const pick = options[i].id;
      if (pick === 'bye') {
        remember(false);
        return;
      }
      this.startTalk(sprite);
      if (pick === 'coin') {
        state.money = Math.round((state.money - SURVIVOR_COIN) * 100) / 100;
        dialogue.start(speaker, [thanksLine(s, memory)]);
        remember(true);
      } else {
        dialogue.start(speaker, [chatLine(s, memory)]);
        remember(false);
      }
    });
    this.chatEnd = () => {
      remember(false);
      dialogue.close();
    };
  }

  /** Lo que ofrece esta persona si es personal de un local con servicio (data/services.ts). */
  private offerOf(sprite: Phaser.GameObjects.Sprite): OfferId | undefined {
    if (!(sprite instanceof Character)) return undefined;
    const agent = this.crowdViews.map((v) => v.agentOf(sprite)).find((a) => a !== undefined);
    return agent?.staffRole ? identity(agent.staffRole).offers : undefined;
  }

  /** Personal de un local (tiene puesto): quien atiende el mostrador, venda algo o no. */
  private attends(sprite: Phaser.GameObjects.Sprite): boolean {
    if (!(sprite instanceof Character)) return false;
    return this.crowdViews.some((v) => !!v.agentOf(sprite)?.staffRole);
  }

  /** Un agente de policía de la calle (patrulla o puesto del partido, systems/Police), no personal de un local. */
  private officerOf(sprite: Phaser.GameObjects.Sprite): boolean {
    if (!(sprite instanceof Character)) return false;
    const agent = this.crowdViews.map((v) => v.agentOf(sprite)).find((a) => a !== undefined);
    return !!agent && !agent.staffRole && isPolice(agent.role);
  }

  private openDialogue(speaker: string, lines: readonly string[]): void {
    this.services.dialogue.start(speaker, lines);
  }

  /**
   * La charla de calle con esta persona (systems/Chat): una persona anónima de la calle o de un local, o un personaje
   * con rutina que tiene voz propia (data/chatNamed.ts). Con el resto (personal con nombre, vigilantes...), no hay:
   * dicen lo suyo de siempre.
   */
    /**
   * La charla de calle con esta persona.
   *
   * Prompt 57:
   * los Named Characters reciben también su perfil social persistente.
   */
  private conversationWith(
    sprite: Phaser.GameObjects.Sprite,
  ): Conversation | null {
    if (
      !(sprite instanceof Character)
    ) {
      return null;
    }

    const {
      state,
    } = this.services;

    const w =
      weatherAt(
        state.day,
        state.hour +
          state.minute /
            60,
      );

    const when = {
      day:
        state.day,

      hour:
        state.hour,

      minute:
        state.minute,

      weather:
        weatherKind(
          w,
        ),
    };

    const tile = {
      tx:
        Math.floor(
          sprite.x /
            TILE,
        ),

      ty:
        Math.floor(
          sprite.y /
            TILE,
        ),
    };

    const place =
      placeOf(
        state.locationId,

        zoneAt(
          state.locationId,
          tile.tx,
          tile.ty,
        )?.type,
      );

    // ============================================================
    // NAMED CHARACTER
    // ============================================================

    const named =
      this.characters.find(
        (c) =>
          c.sprite ===
          sprite,
      );

    if (named) {
      const id =
        named.def.npc;

      /*
       * Por ahora sólo los personajes con una voz dinámica
       * definida en chatNamed utilizan Conversation.
       *
       * Esto conserva el comportamiento anterior.
       */
      if (
        !NAMED_VOICES[
          id
        ]
      ) {
        return null;
      }

      /*
       * Sistema antiguo.
       *
       * Lo mantenemos para compatibilidad con partidas anteriores.
       */
      const met =
        state.events
          .importantNPCsMet[
          id
        ];

      const legacyRel:
        0 | 1 | 2 =
        met &&
        (
          met.encounters >=
            5 ||
          met.affinity >= 3
        )
          ? 2
          : met &&
              met.encounters >=
                2
            ? 1
            : 0;

      /*
       * Prompt 57.
       */
      const social =
        state.socialOf(
          id,
        );

      /*
       * Migración suave.
       *
       * Si esta partida ya conocía al personaje antes del Prompt 57,
       * conservamos como mínimo el número de encuentros anterior.
       *
       * No inventamos attraction, romance o trust.
       */
      if (
        met &&
        social.encounters <
          met.encounters
      ) {
        social.encounters =
          met.encounters;
      }

      const socialRel =
        chatRelationLevel(
          social,
        );

      const rel =
        Math.max(
          legacyRel,
          socialRel,
        ) as
          | 0
          | 1
          | 2;

      // Su historia (systems/Story): lo vivido abre frases, su ánimo de hoy manda y quizá saca algo primero.
      const story =
        this.storyOf(
          id,
        );

      const storyDef =
        STORIES[
          id
        ];

      const told =
        story &&
        storyDef
          ? {
              flags:
                chatFlags(
                  story,
                ),

              mood:
                chatMood(
                  story,
                ),

              opener:
                openerFor(
                  story,
                  storyDef,
                  social,
                  this.storyNow(),
                  state.day,
                ),
            }
          : {};

      return new Conversation(
        {
          who:
            id,

          named:
            id,

          role:
            named.now?.moving
              ? 'stroller'
              : 'park-talk',

          place,

          group:
            false,

          rel,

          social,

          ...told,

          ...when,
        },

        this.chatLog,
      );
    }

    // ============================================================
    // NPC ANÓNIMO
    // ============================================================

    const agent =
      this.crowdViews
        .map(
          (v) =>
            v.agentOf(
              sprite,
            ),
        )
        .find(
          (a) =>
            a !==
            undefined,
        );

    if (
      !agent ||
      agent.npc ||
      agent.staffRole ||
      // La gente de un trapicheo (world/AlleyDealView) no charla: dice su frase seca y se va.
      agent.role.startsWith('alley-')
    ) {
      return null;
    }

    const key =
      `c:${state.locationId}:${agent.id}`;

    const together =
      agent.leader !==
        undefined ||
      [
        ...(
          this.crowd
            ?.agents ??
          []
        ),

        ...(
          this.street
            ?.agents ??
          []
        ),
      ].some(
        (o) =>
          o.leader ===
          agent,
      );

    return new Conversation(
      {
        who:
          key,

        identity:
          agent.look,

        role:
          agent.role,

        state:
          agent.state,

        place,

        group:
          together,

        rel:
          this.chatLog.chatsWith(
            key,
          ) > 0
            ? 1
            : 0,

        ...when,
      },

      this.chatLog,
    );
  }

  /**
   * Una vuelta de conversación.
   *
   * Prompt 57:
   * después de cada acción social sincronizamos el perfil con GameState,
   * para no perder un coqueteo, contacto o cita si el juego se cierra
   * antes de terminar toda la conversación.
   */
  private say(
    speaker: string,
    sprite: Phaser.GameObjects.Sprite,
    talk: Conversation,
    turn: ChatTurn,
    namedId?: string,
  ): void {
    const {
      dialogue,
    } = this.services;

    // ------------------------------------------------------------
    // FIN NATURAL DE LA CONVERSACIÓN
    // ------------------------------------------------------------

    if (
      turn.options.length ===
      0
    ) {
      dialogue.start(
        speaker,
        turn.lines,
      );

      this.noteMeeting(
        talk,
        namedId,
      );

      return;
    }

    // ------------------------------------------------------------
    // ELECCIÓN DEL JUGADOR
    // ------------------------------------------------------------

    // Un regalo de la bolsa (systems/Gifts), a alguien con nombre: una opción más, al final.
    const gifts = namedId && NAMED_VOICES[namedId] ? giftsIn(this.services.state.wallet) : [];

    dialogue.ask(
      speaker,

      [
        turn.lines.join(
          ' ',
        ),
      ],

      [...turn.options.map((o) => o.label), ...(gifts.length ? ['Dar un regalo'] : [])],

      (i) => {
        if (i >= turn.options.length) {
          this.offerGift(speaker, sprite, talk, namedId!);
          return;
        }
        /*
         * Elegir una respuesta cierra DialogueSystem temporalmente.
         * Volvemos a parar al NPC antes de continuar.
         */
        this.startTalk(
          sprite,
        );

        const option =
          turn.options[
            i
          ];

        const nextTurn =
          talk.choose(
            option.id,
          );

        /*
         * Persistir inmediatamente los cambios sociales.
         */
        this.syncSocialProfile(
          talk,
          namedId,
        );

        this.say(
          speaker,
          sprite,
          talk,
          nextTurn,
          namedId,
        );
      },
    );

    // ------------------------------------------------------------
    // EL JUGADOR CIERRA MANUALMENTE CON ESC / Q
    // ------------------------------------------------------------

    this.chatEnd =
      () => {
        this.noteMeeting(
          talk,
          namedId,
        );

        dialogue.close();
      };
  }

  /**
   * Dar un regalo (systems/Gifts). La charla se da por terminada antes (noteMeeting la anota con lo hablado) y el regalo
   * va encima del perfil ya guardado: así la copia del perfil que llevaba la conversación no lo pisa al cerrar.
   */
  private offerGift(speaker: string, sprite: Phaser.GameObjects.Sprite, talk: Conversation, id: string): void {
    const { state, dialogue } = this.services;
    this.noteMeeting(talk, id);
    this.startTalk(sprite);
    // Esc ya no vuelve a anotar la charla: sólo cierra.
    this.chatEnd = () => dialogue.close();
    const blocked = giftBlocker(state.socialOf(id), state.day);
    if (blocked) {
      dialogue.start(speaker, [blocked]);
      return;
    }
    const gifts = giftsIn(state.wallet);
    dialogue.ask(speaker, ['¿Qué le das?'], [...gifts.map((g) => `${getItem(g.id).name} (llevas ${g.qty})`), 'Nada, otro día'], (i) => {
      this.startTalk(sprite);
      if (i >= gifts.length) return;
      const r = giveGift(state.socialOf(id), state.wallet, gifts[i].id, { day: state.day, hour: state.hour, minute: state.minute });
      if (r.ok) {
        state.wallet = r.wallet;
        state.setSocialProfile(id, r.profile);
        this.persist();
      }
      dialogue.start(speaker, r.ok ? [r.message, '¿Para mí? No hacía falta... Gracias, de verdad. Me lo quedo.'] : [r.message]);
    }, gifts.length);
  }

  /**
   * Copia al GameState el perfil social actual de la conversación.
   *
   * No incrementa encuentros: eso sólo ocurre una vez cuando la charla
   * termina en noteMeeting().
   */
  private syncSocialProfile(
    talk: Conversation,
    id?: string,
  ): void {
    if (
      !id ||
      !NAMED_VOICES[
        id
      ] ||
      !talk.socialChanged
    ) {
      return;
    }

    const profile =
      talk.social;

    if (!profile) {
      return;
    }

    const before =
      this.services.state.socialOf(
        id,
      );

    this.services.state
      .setSocialProfile(
        id,
        profile,
      );

    this.phoneFromTalk(
      id,
      before,
      profile,
    );

    /*
     * Una acción importante debe sobrevivir aunque el jugador
     * cierre LifeSim antes de que termine toda la conversación.
     */
    this.persist();
  }

  /**
   * Al terminar una charla con un Named Character:
   *
   * - mantiene importantNPCsMet para compatibilidad;
   * - suma exactamente un encuentro social;
   * - guarda las estadísticas del Prompt 57;
   * - persiste la partida.
   */
  private noteMeeting(
    talk: Conversation,
    id?: string,
  ): void {
    const named =
      this.characters.find(
        (c) =>
          c.def.npc ===
          id,
      );

    if (
      !named ||
      !id ||
      !NAMED_VOICES[
        id
      ]
    ) {
      return;
    }

    const {
      state,
    } = this.services;

    // ============================================================
    // SISTEMA LEGACY
    // ============================================================

    const met =
      (
        state.events
          .importantNPCsMet[
          id
        ] ??= {
          name:
            named.sprite
              .def.name,

          firstDay:
            state.day,

          lastDay:
            state.day,

          encounters:
            0,

          affinity:
            0,
        }
      );

    met.encounters +=
      1;

    met.lastDay =
      state.day;

    met.affinity +=
      talk.positives *
      0.25;

    // ============================================================
    // PROMPT 57
    // ============================================================

    /*
     * Si hubo acciones sociales, talk.social contiene el perfil nuevo.
     * Si fue una conversación normal, usamos el perfil actual del estado.
     */
    const base =
      talk.social ??
      state.socialOf(
        id,
      );

    const next =
      noteSocialEncounter(
        base,
        {
          day:
            state.day,

          hour:
            state.hour,

          minute:
            state.minute,
        },
      );

    state.setSocialProfile(
      id,
      next,
    );

    this.storyAfterTalk(
      id,
      named.sprite,
      next,
    );

    this.contactOffer(
      id,
      named.sprite,
    );

    this.persist();
  }

  /**
   * Su historia al acabar una charla: primero mira si tiene algo que sacar (con lo que había antes de esta
   * charla), luego anota la charla de hoy con el sitio, una vez al día, y que hoy ya no hace falta que salude.
   */
  private storyAfterTalk(
    id: string,
    sprite: Character,
    profile: SocialProfile,
  ): void {
    const def =
      STORIES[
        id
      ];

    const before =
      this.storyOf(
        id,
      );

    if (
      !def ||
      !before
    ) {
      return;
    }

    const now =
      this.storyNow();

    const beat =
      beatAfterTalk(
        before,
        def,
        profile,
        now,
        this.services.state.day,
      );

    const story =
      structuredClone(
        before,
      );

    if (
      !story.events.some(
        (e) =>
          e.id ===
            'charla' &&
          e.day ===
            now.day,
      )
    ) {
      noteEvent(
        story,
        'charla',
        now,
        getLocation(
          this.services.state.locationId,
        ).name,
      );
    }

    story.greetedDay =
      now.day;

    this.saveStory(
      id,
      story,
    );

    if (beat) {
      this.storyQueue.push(
        () =>
          this.showStoryBeat(
            id,
            sprite,
            beat,
          ),
      );
    }
  }

  private travel(portal: PortalDef): void {
    if (this.leaving) return;
    this.player.halt();

    // Salir a un sitio sin mapa (el aparcamiento de Decathlon): su menú, con el metro de vuelta (scenes/Menus.leaveTo).
    if (portal.offMap) {
      this.menus.leaveTo(portal.offMap);
      return;
    }

    // Subir al tren: se elige destino y paga la tarjeta (scenes/Menus.ts, systems/Transit.ts).
    if (portal.train) {
      const stop = stopAtStation(this.services.state.locationId);
      if (stop) this.menus.board(stop);
      return;
    }

    // La puerta de una vivienda que no es la tuya: se ofrece mudarse (coste, requisitos y consecuencias), no se entra.
    const homeId = getLocation(portal.to.location).home;
    if (homeId && homeId !== this.services.state.housing.home) {
      this.menus.openHomeOffer(homeId);
      return;
    }
    // Fuera de horario, la puerta está cerrada: se dice cuándo abre y no se entra.
    const closed = this.closedPlace(portal);
    if (closed) {
      const { day, hour, minute } = this.services.state;
      this.openDialogue(closed.name, closedLines(closed, day, hour, minute));
      return;
    }
    // Un recinto con entrada (data/stadium.ts): la puerta mira la entrada del partido de ahora (systems/Tickets). Sin
    // derecho a pasar, se dice por qué y se queda fuera; con él, se pasa al elegirlo, y sólo entonces cuenta como usada.
    const venue = venueOf(getLocation(portal.to.location).venue);
    if (venue) {
      const { state, dialogue } = this.services;
      const gate = admit(venue, state.tickets, state);
      if (!gate.ok) {
        this.openDialogue(venue.gate, gate.lines);
        return;
      }
      dialogue.ask(venue.gate, gate.lines, ['Pasar', 'Ahora no'], (i) => {
        if (i !== 0) return;
        const now = admit(venue, state.tickets, state);
        if (!now.ok) {
          this.openDialogue(venue.gate, now.lines);
          return;
        }
        state.setTickets(now.tickets);
        this.passThrough(portal);
      }, 1);
      return;
    }
    this.passThrough(portal);
  }

  /** Cruza la puerta: el rato que lleva, la vuelta por la misma puerta por la que se entró y el cambio de sitio. */
  private passThrough(portal: PortalDef): void {
    if (portal.minutes) this.services.clock.advanceMinutes(portal.minutes);
    const here = this.services.state.locationId;
    const via = this.cameIn;
    const spawn = via && via.into === here && via.from === portal.to.location && getLocation(via.from).spawns[via.door] ? via.door : portal.to.spawn;
    this.cameIn = { from: here, door: portal.id, into: portal.to.location };
    this.go(portal.to.location, spawn, false);
  }

  /**
   * Desarrollo (lifesim.handoff): quién de la cola de traspasos (systems/Handoff) está ahora en esta sala o en el
   * metro, con su id de aquí dentro, dónde está y qué hace.
   */
  handoffOccupancy(): readonly { persona: string; id: number | string; ficha: string; estado: string; tile: string }[] {
    const crowd = this.crowd?.agents.filter((a) => a.handoff).map((a) => ({ persona: PASSENGER_LOOKS[a.look]?.id ?? '?', id: a.id, ficha: a.handoff!, estado: a.leaving ? 'saliendo' : a.state, tile: `${a.x.toFixed(1)},${a.y.toFixed(1)}` })) ?? [];
    const metro = this.metro?.handoffPassengers().map((p) => ({ persona: p.walker.look.id, id: 'metro', ficha: p.handoff!, estado: p.state, tile: `${(p.walker.x / TILE).toFixed(1)},${(p.walker.y / TILE).toFixed(1)}` })) ?? [];
    return [...crowd, ...metro];
  }

  /** Desarrollo: fuerza el microevento de carterista en la estación actual. */
  debugMetroPickpocket(): boolean {
    return this.metro?.debugPickpocket() ?? false;
  }

  /** Llega en tren a un andén: el tren sigue en la vía al bajar y el trayecto cuenta su evento. */
  private arriveByTrain(locationId: string): void {
    this.go(locationId, 'train', true);
  }

  /**
   * Pone al jugador en un tile de una localización (herramientas de desarrollo:
   * lifesim.fight.goto()). En la misma, lo mueve; en otra, rehace la Scene con
   * esa posición, igual que al cargar una partida.
   */
  teleport(locationId: string, tile: TilePoint, facing: Facing = 'up'): void {
    const position = { x: tile.tx * TILE + TILE / 2, y: (tile.ty + 1) * TILE - 2 };
    const { state } = this.services;
    state.locationId = locationId;
    state.position.x = position.x;
    state.position.y = position.y;
    state.facing = facing;
    if ((this.scene.settings.data as WorldSceneData | undefined)?.locationId === locationId) {
      this.player.setPosition(position.x, position.y);
      this.cameras.main.centerOn(position.x, position.y);
      return;
    }
    this.scene.restart({ locationId, position, facing });
  }

  /** Se ha instalado algo en casa: guarda y rehace la Scene en el mismo sitio, con la casa ya como queda. */
  private refreshHome(): void {
    const { state } = this.services;
    this.persist();
    this.scene.restart({ locationId: state.locationId, position: { x: state.position.x, y: state.position.y }, facing: state.facing });
  }

  /** Mudanza hecha: a la entrada de la casa nueva (la vivienda de ahora, por los datos de systems/Housing). */
  private movedHome(): void {
    const entry = homeEntry(this.services.state.housing);
    this.go(entry.location, entry.spawn, false);
  }

  /** Cambia de localización: guarda, funde a negro y rehace la Scene a la hora que sea ya. */
  private go(locationId: string, spawnId: string, byTrain: boolean): void {
    if (this.leaving) return;
    const { state, hint } = this.services;
    this.leaving = true;
    this.player.halt();
    this.prompt.setVisible(false);
    hint.hide();

    // Una puerta mal escrita (destino o spawn que no existen) no deja al jugador a medio salir: se queda donde
    // estaba, se le dice, y el auditor de desarrollo (lifesim.venues) lo apunta como último error de transición.
    let target: LocationDef;
    let spawn: SpawnDef;
    try {
      target = getLocation(locationId);
      spawn = getSpawn(target, spawnId);
    } catch (error) {
      recordTransitionError(`${this.services.state.locationId} → ${locationId}/${spawnId}`, error);
      this.leaving = false;
      this.openDialogue('Puerta', ['Por aquí no se puede pasar ahora.']);
      return;
    }
    if (byTrain) this.cameIn = null;
    const position = spawnToWorld(spawn);
    state.locationId = target.id;
    state.position.x = position.x;
    state.position.y = position.y;
    state.facing = spawn.facing;
    this.persist();

    const camera = this.cameras.main;
    const restart = (): void => {
      this.scene.restart({ locationId: target.id, spawnId, byTrain });
    };
    // Si ya está a negro (volviendo de un sitio sin mapa), no hay fundido que esperar.
    if (camera.fadeEffect.isComplete && camera.fadeEffect.direction === false) restart();
    else {
      camera.fadeOut(TRANSITION_MS, 0, 0, 0);
      camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, restart);
    }
  }

  /**
   * El negocio cerrado al que pertenece lo que se compra o se pide ahí (mostrador, perchero, actividad, personal con
   * oferta): el del mostrador de la calle (TerminalDef.place) o el de este interior. Mirar o charlar, sí se puede.
   */
  private shutFor(target: Interactable): PlaceInfo | undefined {
    const commerce = target.kind === 'terminal' || target.kind === 'rack' || target.kind === 'spot' || (target.kind === 'npc' && !!this.offerOf(target.sprite));
    if (!commerce) return undefined;
    const place = target.kind === 'terminal' && target.place ? placeInfo(target.place) : placeForInterior(this.services.state.locationId);
    const { day, hour, minute } = this.services.state;
    return place?.type === 'business' && !isOpen(place, day, hour, minute) ? place : undefined;
  }

  /**
   * Quien ha venido a ver el partido que se juega aquí (gente anónima del local, nunca un personaje con nombre ni el
   * personal): con el partido en curso o recién acabado, se habla de él.
   */
  private spectatorOf(sprite: Phaser.GameObjects.Sprite): Agent | undefined {
    if (!this.matchView || !(sprite instanceof Character) || !fixtureAt(this.absMinute())) return undefined;
    const agent = this.crowdViews.map((v) => v.agentOf(sprite)).find((a) => a !== undefined);
    return agent?.kind === 'visitor' && !agent.npc ? agent : undefined;
  }

  /**
   * Charla en la grada (systems/Concourse, data/concourse.ts): de lo que pasa en el partido ahora, desde el lado de quien
   * habla, sin repetir lo que ya le ha dicho (la memoria de charla de siempre, ChatLog, que se olvida al salir). Se puede
   * animar, celebrar si hay algo que celebrar, seguir hablando unas vueltas o despedirse. Cada vuelta mira el partido
   * otra vez: si entra un gol a mitad de charla, se habla del gol. Nada de esto suma relación ni se guarda.
   */
  private talkSpectator(name: string, sprite: Phaser.GameObjects.Sprite, agent: Agent): void {
    const { dialogue } = this.services;
    const who = supporterOf(agent.id, !!agent.fan);
    const heard = this.chatLog.mem(`c:${this.services.state.locationId}:${agent.id}`).lines;
    const line = (topic?: FanTopic): string => {
      const abs = this.absMinute();
      const tl = fixtureAt(abs);
      if (!tl) return agent.line;
      const m = fanMoment(tl, abs, who);
      const l = fanLine(topic ?? m.topic, m, who, agent.id, heard, this.fanRecent);
      heard.push(l.id);
      if (heard.length > 40) heard.shift();
      this.fanRecent.push(l.id);
      if (this.fanRecent.length > 40) this.fanRecent.shift();
      return l.text;
    };
    let turns = 0;
    const step = (text: string): void => {
      const abs = this.absMinute();
      const tl = fixtureAt(abs);
      const m = tl ? fanMoment(tl, abs, who) : null;
      const options = [
        ...(m?.cheer ? [{ id: 'cheer', label: 'Animar' }] : []),
        ...(m?.celebrate ? [{ id: 'celebrate', label: 'Celebrar' }] : []),
        ...(turns < FAN_TURNS ? [{ id: 'talk', label: 'Hablar del partido' }] : []),
        { id: 'bye', label: 'Despedirse' },
      ] as const;
      dialogue.ask(name, [text], options.map((o) => o.label), (i) => {
        this.startTalk(sprite);
        const id = options[i].id;
        turns++;
        if (id === 'bye') dialogue.start(name, [line('bye')]);
        else step(id === 'talk' ? line() : line(reactionTopic(id as 'cheer' | 'celebrate', who)));
      });
      this.chatEnd = () => dialogue.close();
    };
    step(line());
  }

  /**
   * Por qué no atiende ahora un puesto que va con el partido (TerminalDef.serves: systems/Concourse.kioskService) o
   * que no tiene a nadie detrás (TerminalDef.staff), o null si atiende.
   */
  private stallClosed(t: Extract<Interactable, { kind: 'terminal' }>): string[] | null {
    if (!t.serves) return null;
    const abs = this.absMinute();
    const service = kioskService(t.serves, fixtureAt(abs), abs);
    if (!service.open) return service.lines;
    const staffed = !t.staff || (this.crowd?.agents ?? []).some((a) => a.kind === 'staff' && !a.moving && !a.leaving && a.point?.startsWith(t.staff!));
    return staffed ? null : ['No hay nadie detrás del mostrador ahora mismo. Vuelve en un momento.'];
  }

  /**
   * Dentro de un negocio a la hora de cierre: se avisa una vez de que cierra y de que la puerta sigue abierta para
   * salir (closedPlace sólo cierra la entrada). El personal y la gente se van solos por sus turnos (Crowd).
   */
  private closingTick(): void {
    // Un recinto con entrada (el estadio): cuando se acaba el derecho a estar dentro, se avisa una vez; salir, siempre.
    const venue = venueOf(getLocation(this.services.state.locationId).venue);
    if (venue) {
      const stay = mayStay(venue, this.services.state.tickets, this.services.state);
      if (this.roomOpen && !stay) {
        if (this.services.dialogue.isOpen || this.services.menu.isOpen) return;
        this.openDialogue(venue.name, ['El estadio cierra: el partido ha terminado y se desaloja. La salida, por la Puerta 3.']);
      }
      this.roomOpen = stay;
      return;
    }
    const place = placeForInterior(this.services.state.locationId);
    if (place?.type !== 'business') return;
    const { day, hour, minute } = this.services.state;
    const open = isOpen(place, day, hour, minute);
    if (this.roomOpen && !open) {
      // Con algo abierto (hablando, un menú), el aviso espera a que se cierre; se da una sola vez.
      if (this.services.dialogue.isOpen || this.services.menu.isOpen) return;
      this.openDialogue(place.name, ['Vamos cerrando: ya no se cobra nada más. La puerta sigue abierta para salir.', ...closedLines(place, day, hour, minute).slice(1, 2)]);
    }
    this.roomOpen = open;
  }

  /** Lugar al que lleva el portal si ahora está cerrado. Salir siempre se puede. */
  private closedPlace(portal: PortalDef) {
    const place = placeForInterior(portal.to.location);
    const { day, hour, minute } = this.services.state;
    return place && !isOpen(place, day, hour, minute) ? place : undefined;
  }

  private rideContext(): RideContext {
    const { day, hour, minute, money, energy } = this.services.state;
    return { day, hour, minute, money, energy };
  }

  private presentRideEvent(ev: MetroEventDef): void {
    const { metroEvents, dialogue } = this.services;
    const speaker = ev.speaker ?? 'Línea 2';
    this.player.halt();

    const settle = (choiceId?: string): void => {
      const out = metroEvents.resolve(ev, this.rideContext(), choiceId);
      const { state, clock } = this.services;
      if (out.money) state.money += out.money;
      if (out.energy) state.energy += out.energy;
      if (out.minutes) clock.advanceMinutes(out.minutes);
      this.persist();
      if (out.lines.length > 0) this.openDialogue(speaker, out.lines);
    };

    if (!ev.choices) {
      settle();
      this.openDialogue(speaker, ev.lines);
      return;
    }
    const choices = ev.choices;
    dialogue.ask(speaker, ev.lines, choices.map((c) => c.label), (i) => settle(choices[i].id));
  }

  private persist(): void {
    const { save, state } = this.services;
    // Probándose una prenda, el snapshot ya lleva lo de antes, no la prueba (state/GameState.fitting).
    if (save.save(state.snapshot)) state.emit('saved');
  }
}
