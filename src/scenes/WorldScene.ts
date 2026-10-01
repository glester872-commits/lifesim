import Phaser from 'phaser';
import {
  AUTOSAVE_INTERVAL_MS,
  CAMERA_LERP,
  CAMERA_LOOK_UP,
  CAMERA_ZOOM,
  GAME_MINUTES_PER_REAL_SECOND,
  INTERACT_RADIUS,
  MAX_CAMERA_ZOOM,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  PALETTE,
  TILE,
  TRANSITION_MS,
} from '../config/constants';
import type { Facing, NpcDef, PortalDef, TilePoint, Vec2 } from '../types/game';
import type { MetroEventDef, RideContext } from '../systems/MetroEventManager';
import { doorRow, getLocation, getSpawn, spawnToWorld } from '../systems/LocationSystem';
import { Ambience } from '../world/Ambience';
import { Traffic } from '../systems/Traffic';
import { withDistrictLanes } from '../systems/Districts';
import { TrafficView } from '../world/TrafficView';
import { CyclistView } from '../world/CyclistView';
import { VEHICLES, type VehicleType } from '../data/vehicles';
import { BIKES, type BikeType } from '../data/bikes';
import type { OfferId } from '../data/services';
import { identity } from '../systems/Service';
import { Lighting } from '../world/Lighting';
import { MetroSystem } from '../systems/MetroSystem';
import { METRO_CONFIG } from '../config/metro';
import { buildLocation } from '../world/LocationBuilder';
import { Player } from '../entities/Player';
import { atTable, seatAt, seatsIn, type Seat } from '../systems/Seating';
import { NPC } from '../entities/NPC';
import { Walker } from '../entities/Walker';
import { getNpc } from '../data/npcs';
import { CHARACTERS, type CharacterDef } from '../data/characters';
import { catchUp, whereabouts, type Whereabouts } from '../systems/Characters';
import { Character, activityAt } from '../entities/Character';
import { Crowd, profileFor, type Clock } from '../systems/Crowd';
import { StreetLife, streetProfileFor } from '../systems/StreetLife';
import { hoursLabel, isOpen, placeForInterior, placeOfPoint } from '../systems/Places';
import { AmbientDirector, ambientFrame, ambientSituation, facingTowards } from '../systems/AmbientActions';
import type { AmbientPlacement, Placement } from '../entities/Character';
import { stopAtStation } from '../systems/Transit';
import { Menus } from './Menus';
import { CrowdView } from '../world/CrowdView';
import { ServiceView } from '../world/ServiceView';
import type { PlayerCall, TableService } from '../systems/TableService';
import { euros } from '../systems/Commerce';
import { WeatherView } from '../world/WeatherView';
import { characterLook, umbrellaFor } from '../world/WeatherLooks';
import { hashSeed } from '../systems/MetroDaily';
import { Atmosphere } from '../world/Atmosphere';
import { StreetEventView } from '../world/StreetEventView';
import { STREET_EVENTS } from '../data/streetEvents';
import { Occlusion } from '../world/Occlusion';
import { ZoneDebugView } from '../world/ZoneDebugView';
import { PopulationInspector } from '../world/PopulationInspector';
import { ForegroundView } from '../world/Foreground';
import { PopUpView } from '../world/PopUpView';
import { StringLightsView } from '../world/StringLights';
import { DEBUG } from '../config/debug';
import { weatherAt } from '../systems/Weather';
import { WildlifeView } from '../world/WildlifeView';
import { SignalView } from '../world/SignalView';
import { PLAYER_H } from '../world/TextureFactory';
import type { Services } from '../services';

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
  | { kind: 'inspect'; x: number; y: number; name: string; lines: readonly string[] }
  | { kind: 'terminal'; x: number; y: number; name: string; catalog: string }
  | { kind: 'spot'; x: number; y: number; name: string; activities: readonly string[]; wardrobe?: true }
  | { kind: 'event'; x: number; y: number; view: StreetEventView }
  | { kind: 'seat'; x: number; y: number; seat: Seat };

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
  private leaving = false;
  private mapWidth = 0;
  private mapHeight = 0;
  private metro: MetroSystem | null = null;
  private ambience: Ambience | null = null;
  /** Coches, furgonetas y autobuses de la calle (TrafficDef), y quien los pinta. */
  private traffic: Traffic<VehicleType> | null = null;
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
  /** Gestos de ambiente de los personajes con nombre (systems/AmbientActions), igual que la gente de CrowdView. */
  private characterAmbient: AmbientDirector | null = null;
  /** Suelta a quien atiende al jugador: al cerrar el diálogo vuelve a lo suyo. */
  private endTalk: (() => void) | null = null;
  /** Gente del local (data/population.ts), sólo en interiores con perfil y mientras el jugador está dentro. */
  private crowd: Crowd | null = null;
  /** Gente de la calle (data/streets.ts), sólo en exteriores con perfil. */
  private street: StreetLife | null = null;
  /** Perros y palomas de la calle (sólo donde hay calle con gente). */
  private wildlife: WildlifeView | null = null;
  private signals: SignalView | null = null;
  /** Lluvia, charcos y vaho: sólo fuera. */
  private weatherView: WeatherView | null = null;
  private atmosphere: Atmosphere | null = null;
  private streetEvents: StreetEventView[] = [];
  private ringBodies: Phaser.GameObjects.Zone[] = [];
  /** Mirando un evento: la cámara encuadra el corro hasta que el jugador se mueve. */
  private watching = false;
  /** Sentado: en qué asiento (data/seating.ts) y desde dónde se sentó, que es a donde vuelve al levantarse. */
  private seatedOn: { seat: Seat; from: Vec2 } | null = null;
  /** Asientos que un personaje con nombre ocupa o a los que va ahora mismo: el jugador no se sienta ahí. */
  private charactersOn: ReadonlySet<string> = new Set();
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
  /** Lo que hay en las mesas, el pase y la cocina de un local con servicio de mesa. */
  private serviceView: ServiceView | null = null;
  /** Sentado a una mesa con servicio y ya apuntado en ella: el camarero sabe que está. */
  private dining = false;
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
    const built = buildLocation(this, def);

    this.leaving = false;
    this.activeTarget = null;
    this.endTalk = null;
    // Un mapa abierto es del sitio de antes: al llegar a otro, cerrado (se vuelve a abrir con M).
    this.services.map.close();
    this.interactables = [];
    this.seatedOn = null;
    this.characters = CHARACTERS.map((c, i) => {
      const entry = { def: c, sprite: new Character(this, getNpc(c.npc), i), now: null as Whereabouts | null, heldAt: null as number | null, lag: 0 };
      // Lo que dice depende de dónde está o a dónde va.
      const lines = (): readonly string[] => (entry.now?.moving ? entry.now.stop.going : entry.now?.stop.lines) ?? entry.sprite.def.lines;
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
          { debug: this.services.metroDebug, announcer: this.services.announcer },
          data.byTrain ?? false,
        )
      : null;
    if (this.metro) {
      this.physics.add.collider(this.player, [...this.metro.walkers]);
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
      this.interactables.push({ kind: 'inspect', x: item.tx * TILE + TILE / 2, y: item.ty * TILE + TILE / 2, name: item.name, lines: item.lines });
    }
    for (const b of def.buildings ?? []) {
      if (!b.inspect || b.doorX === undefined) continue;
      this.interactables.push({ kind: 'inspect', x: b.doorX * TILE + TILE / 2, y: doorRow(b) * TILE + TILE / 2, name: b.name, lines: b.inspect });
    }
    // Donde se compra: máquinas y mostradores, cada uno con su catálogo.
    for (const t of def.terminals ?? []) {
      this.interactables.push({ kind: 'terminal', x: t.tx * TILE + TILE / 2, y: t.ty * TILE + TILE / 2, name: t.name, catalog: t.catalog });
    }
    // Donde se hace algo que lleva un rato: la cama, la cocina, una mesa.
    for (const s of def.spots ?? []) {
      this.interactables.push({ kind: 'spot', x: s.tx * TILE + TILE / 2, y: s.ty * TILE + TILE / 2, name: s.name, activities: s.activities, wardrobe: s.wardrobe });
    }
    // Donde sentarse: los mismos asientos que usa la gente (bancos, sillas, sofás, el andén).
    for (const seat of seatsIn(def)) {
      this.interactables.push({ kind: 'seat', x: seat.tx * TILE + TILE / 2, y: seat.ty * TILE + TILE / 2, seat });
    }
    this.menus = new Menus(this.services, {
      persist: () => this.persist(),
      arriveByTrain: (locationId) => this.arriveByTrain(locationId),
      fadeOut: () => this.cameras.main.fadeOut(TRANSITION_MS, 0, 0, 0),
    });

    this.physics.add.collider(this.player, built.solids);

    // Al entrar, la gente ya está a mitad de lo suyo: Crowd la reconstruye desde la hora.
    const place = placeForInterior(def.id);
    const profile = place ? profileFor(place.id) : undefined;
    this.crowd = place && profile ? new Crowd(def, place, profile) : null;
    const streetProfile = streetProfileFor(def.id);
    this.street = streetProfile ? new StreetLife(def, streetProfile) : null;
    // Los personajes, primero: nadie de la gente anónima aparece sentado en su sitio.
    this.placeCharacters();
    this.crowd?.populate(this.clockNow(), this.playerTile());
    // Servicio de mesa (systems/TableService): lo que hay en las mesas y lo que el camarero le dice al jugador.
    this.dining = false;
    // Dentro, el servicio del comedor; fuera, el de la terraza (la calle lleva el suyo): el mismo TableService y el mismo flujo.
    const service = this.tableService;
    this.serviceView = service ? new ServiceView(this, service, def, profile?.tableService ?? null) : null;
    if (service) service.onPlayer = (call) => this.tableCall(call);
    this.street?.populate(this.clockNow(), this.playerTile());
    const weather = (): ReturnType<typeof weatherAt> => weatherAt(this.services.state.day, this.services.state.hour + this.services.state.minute / 60);
    const hourNow = (): number => this.services.state.hour + this.services.state.minute / 60;
    this.crowdViews = [this.crowd, this.street].filter((c) => c !== null).map((c) => new CrowdView(this, c, weather, c === this.street, hourNow));
    // Lo que pasa en sitios escondidos algunas noches (data/streetEvents.ts): su corro es gente como la de la calle.
    this.streetEvents = STREET_EVENTS.filter((e) => e.location === def.id).map((e) => new StreetEventView(this, def, e, weather));
    this.crowdViews.push(...this.streetEvents.map((e) => e.crowd));
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
    const now = this.clockNow();
    this.wildlife = this.street ? new WildlifeView(this, def, this.street, now.day, now.hour + now.minute / 60, this.playerTile()) : null;
    this.crowdTargets = new WeakMap();

    // La hora con la fracción del minuto en curso: los semáforos cambian a su segundo, no a saltos de minuto.
    this.ambience = new Ambience(this, def, () => this.pedestrians);
    const hour = (): number => this.services.clock.minuteOfDay / 60;
    this.traffic = def.traffic ? new Traffic(withDistrictLanes(def, def.traffic), VEHICLES, def.signals ?? [], built.widthPx) : null;
    this.traffic?.populate(this.trafficClock());
    this.trafficView = this.traffic ? new TrafficView(this, this.traffic, hour, () => weatherAt(state.day, hour()).wet) : null;
    this.bikes = def.traffic?.bikes ? new Traffic(withDistrictLanes(def, def.traffic.bikes), BIKES, def.signals ?? [], built.widthPx) : null;
    this.bikes?.populate(this.trafficClock());
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
    // La hora se ve en la calle; dentro manda la luz del local.
    this.lighting = new Lighting(this, def, built, state);
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

    // Lo que pasó en el trayecto se cuenta al bajar, cuando ya se ve la estación.
    const ridden = data.byTrain ? this.services.metroEvents.takePending() : null;
    if (ridden) this.time.delayedCall(TRANSITION_MS + 250, () => this.presentRideEvent(ridden));

    const onResize = (): void => this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);

    this.prompt = this.add.image(0, 0, 'ui-prompt').setDepth(1_000_000).setVisible(false);

    this.bindKeys();

    state.locationId = def.id;
    clock.setPaused(false);
    this.services.place.show(def.name);

    // Hablar no para el mundo: sólo a quien atiende, que vuelve a lo suyo al despedirse.
    const onDialogueClose = (): void => {
      this.endTalk?.();
      this.endTalk = null;
    };
    dialogue.on('close', onDialogueClose);

    const autosave = this.time.addEvent({
      delay: AUTOSAVE_INTERVAL_MS,
      loop: true,
      callback: () => this.persist(),
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      dialogue.off('close', onDialogueClose);
      this.services.hint.hide();
      this.scale.off(Phaser.Scale.Events.RESIZE, onResize);
      autosave.remove();
      this.services.metroDebug?.hide();
      this.metro?.shutdown();
      this.zoneDebug?.destroy();
      this.zoneDebug = null;
      this.inspector?.destroy();
      this.inspector = null;
    });
  }

  update(time: number, delta: number): void {
    const { clock, dialogue, menu, map, input } = this.services;
    input.beginFrame();

    // El mapa es un modo de interfaz, como el menú: el jugador se para, nada responde a la E y el
    // mundo espera (ni reloj ni gente) hasta cerrarlo. M o Esc lo cierran; su botón, también.
    if (map.isOpen) {
      this.player.halt();
      this.prompt.setVisible(false);
      this.services.hint.hide();
      input.setContext({ action: null, back: false, busy: true });
      if (this.pressedAny(['map', 'cancel'])) map.close();
      return;
    }
    if (!menu.isOpen && !dialogue.isOpen && this.pressedAny(['map'])) {
      this.player.halt();
      map.open();
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
      if (!liveMenu) return;
    }

    // Con un diálogo abierto el jugador escucha, quieto; el resto del mundo sigue a lo suyo.
    const talking = dialogue.isOpen;
    if (talking) {
      this.player.halt();
      this.prompt.setVisible(false);
      this.services.hint.hide();
      // Con opciones se elige tocándolas (ui/DialogueBox); si no, el botón de acción sigue.
      input.setContext({ action: dialogue.choices.length > 0 ? null : 'Seguir', back: false, busy: true });
      const picked = ['one', 'two', 'three'].findIndex((name) => this.pressedAny([name]));
      if (picked >= 0) dialogue.choose(picked);
      else if (this.pressedAny(['interact', 'advance', 'advanceAlt'])) dialogue.advance();
    }

    clock.update(delta);
    this.metro?.update(delta, time);
    this.placeCharacters(delta);
    this.crowd?.update(delta, this.clockNow(), this.playerTile());
    this.street?.update(delta, this.clockNow(), this.playerTile());
    for (const view of this.crowdViews) view.sync(time);
    this.serviceView?.sync(time);
    const { hour, minute } = this.services.state;
    this.wildlife?.update(delta, time, hour + minute / 60, this.playerTile(), (this.player.body as Phaser.Physics.Arcade.Body).speed > 1);
    this.gatherPedestrians();
    this.ambience?.update();
    this.traffic?.update(delta, this.trafficClock(), this.pedestrians);
    this.trafficView?.sync(time);
    this.bikes?.update(delta, this.trafficClock(), this.pedestrians);
    this.cyclistView?.sync();
    this.signals?.update(time);
    this.weatherView?.update(delta);
    this.atmosphere?.update(delta);
    // Los eventos de calle siguen su reloj aunque el jugador mire: minutos absolutos, los de systems/StreetEvents.
    const eventMinute = this.services.state.day * 1440 + this.services.clock.minuteOfDay;
    this.streetEvents.forEach((e, i) => {
      e.update(eventMinute, time);
      (this.ringBodies[i].body as Phaser.Physics.Arcade.StaticBody).enable = e.ringActive;
    });
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
      this.characters.filter((c) => c.sprite.visible).map((c) => ({ name: c.sprite.def.name, tx: c.sprite.x / TILE, ty: c.sprite.y / TILE })),
    );
    if (talking || liveMenu) {
      // Sentado, sigue respirando (y comiendo) mientras habla o elige.
      if (this.player.isSeated) this.player.seatedFrame(time, null, this.tableService?.playerEating ?? false);
      return;
    }
    if (this.player.isSeating) {
      this.updateSeated(time);
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

    const target = this.nearestInteractable();
    this.updatePrompt(target);
    input.setContext({ action: this.actionLabel(target), back: false, busy: false });

    if (target && this.pressedAny(['interact'])) {
      this.interact(target);
    } else if (this.pressedAny(['bag'])) {
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
    // En vertical el encuadre gira: el lado largo de la pantalla lleva el lado
    // largo del encuadre. Si no, un móvil de pie ve el triple de mundo y la gente sale diminuta.
    const [long, short] = width >= height ? [width, height] : [height, width];
    // A medios pasos: entre 3 y 4 hay un 3,5 (ver VIEW_WIDTH).
    const zoom = Phaser.Math.Clamp(Math.round(Math.min(long / VIEW_WIDTH, short / VIEW_HEIGHT) * 2) / 2, CAMERA_ZOOM, MAX_CAMERA_ZOOM);
    camera.setZoom(zoom);

    const boundsWidth = Math.max(this.mapWidth, width / zoom);
    const boundsHeight = Math.max(this.mapHeight, height / zoom);
    camera.setBounds(
      (this.mapWidth - boundsWidth) / 2,
      (this.mapHeight - boundsHeight) / 2,
      boundsWidth,
      boundsHeight,
    );
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
      case 'terminal': return 'Comprar';
      case 'spot': return target.wardrobe ? 'Cambiarse' : 'Usar';
      case 'inspect':
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
    for (const c of this.characters) {
      if (c.heldAt === null && c.lag > 0) c.lag = catchUp(c.def, now, c.lag, (GAME_MINUTES_PER_REAL_SECOND * deltaMs) / 1000, here);
      const w = whereabouts(c.def, c.heldAt ?? now - c.lag);
      c.now = w;
      const visible = w.location === here && !w.inside;
      const seed = hashSeed('weather', c.def.npc);
      const look = outdoor ? characterLook(c.sprite.def, seed, weather) : c.sprite.def;
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
    this.crowd?.claim(claimed);
    this.street?.claim(claimed);
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
  private trafficClock(): { day: number; minuteOfDay: number } {
    return { day: this.services.state.day, minuteOfDay: this.services.clock.minuteOfDay };
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
      if (agent) agent.talking = true;
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
    if (!this.dining && service?.tableOf(on.seat.id)) {
      service.seatPlayer(on.seat.id);
      this.dining = true;
    }
    this.player.seatedFrame(time, look, service?.playerEating ?? false);

    const target = this.nearestInteractable();
    this.updatePrompt(target);
    if (!target) {
      // A la mesa, qué pasa con lo tuyo; si no, sólo cómo levantarse.
      const status = this.dining ? this.tableService?.playerStatus() : null;
      this.services.hint.show(status ? `${status} · levantarse` : 'Levantarse');
      this.prompt.setPosition(this.player.x, this.player.y - PLAYER_H - 8).setVisible(true);
    }
    this.services.input.setContext({ action: target ? this.actionLabel(target) : 'Levantarse', back: false, busy: false });
    if (this.pressedAny(['interact'])) {
      if (target) this.interact(target);
      else this.standUp();
    } else if (this.pressedAny(['cancel', 'cancelAlt'])) this.standUp();
    else if (this.pressedAny(['bag'])) this.menus.openBag();
  }

  /** El servicio de mesa de donde está el jugador: el del comedor si está dentro, el de la terraza si está en la calle. */
  private get tableService(): TableService | null {
    return this.crowd?.service ?? this.street?.service ?? null;
  }

  /** Si alguien tiene ese asiento: la gente del local o de la calle (va o está), un personaje con nombre o, en el andén, un pasajero. */
  private seatTaken(seat: Seat): boolean {
    if (seat.id.startsWith('metro:')) return this.metro?.isSeatTaken(Number(seat.id.slice(6))) ?? true;
    // Una mesa con servicio es de un grupo hasta que se va y la recogen.
    const table = this.tableService?.tableOf(seat.id);
    if (table && (table.party !== null || table.state !== 'AVAILABLE')) return true;
    return this.charactersOn.has(seat.id) || (this.crowd !== null && this.crowd.occupancy(seat.id) !== 'FREE') || (this.street?.isTaken(seat.id) ?? false);
  }

  /** Se sienta: reserva el asiento donde lo reserva la gente, da los pasos hasta él y se sienta mirando hacia donde se mira ahí. */
  private sitDown(seat: Seat): void {
    if (this.seatTaken(seat)) return;
    this.seatedOn = { seat, from: { x: this.player.x, y: this.player.y } };
    if (seat.id.startsWith('metro:')) this.metro?.takeSeat(Number(seat.id.slice(6)));
    this.prompt.setVisible(false);
    this.services.hint.hide();
    this.player.sitOn(seat.tx * TILE + TILE / 2, seat.ty * TILE + TILE, seat.facing, seat.lift);
  }

  /** Se levanta, vuelve andando a donde estaba y suelta el asiento. */
  private standUp(): void {
    const on = this.seatedOn;
    if (!on || !this.player.isSeated) return;
    this.prompt.setVisible(false);
    this.services.hint.hide();
    // Levantarse de la mesa sin haber pagado es dejar el dinero encima: se cobra lo pedido.
    if (this.dining) {
      this.dining = false;
      const owed = this.tableService?.playerStands() ?? 0;
      if (owed > 0) {
        this.services.state.money -= owed;
        this.persist();
        this.services.dialogue.start('Casa', [`Dejas ${euros(owed)} en la mesa y te levantas.`]);
      }
    }
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
    if (call.kind === 'order') {
      const hello = state.hour < 14 ? 'Buenos días' : state.hour < 21 ? 'Buenas tardes' : 'Buenas noches';
      dialogue.start(waiter, [`${hello}. ¿Qué te apetece tomar?`]);
      dialogue.once('close', () =>
        this.menus.openOrder(service.menu, call.items, waiter, (picked) => {
          service.playerOrder(picked);
          dialogue.start(waiter, [picked.length > 0 ? `${picked.map((i) => i.name.toLowerCase()).join(' y ')}. Marchando.` : 'Sin prisa. Vuelvo en un rato.']);
        }),
      );
    } else if (call.kind === 'served') {
      dialogue.start(waiter, [`Aquí tienes: ${call.plates.map((i) => i.name.toLowerCase()).join(' y ')}. ¡Que aproveche!`]);
    } else if (call.kind === 'finished') {
      state.energy += call.energy;
      this.persist();
    } else if (call.kind === 'bill') {
      dialogue.start(waiter, ['Aquí tienes la cuenta, cuando quieras.']);
      dialogue.once('close', () =>
        this.menus.openBill(call.total, (amount) => {
          if (amount === null) {
            service.playerPay(true);
            dialogue.start(waiter, ['Tranquilo, vuelvo luego.']);
            return;
          }
          service.playerPay();
          state.money -= amount;
          this.persist();
          dialogue.start(waiter, [amount > call.total ? '¡Gracias! Hasta la próxima.' : 'Gracias. ¡Hasta pronto!']);
        }),
      );
    }
  }

  private nearestInteractable(): Interactable | null {
    const originX = this.player.x;
    const originY = this.player.y - 8;
    let best: Interactable | null = null;
    let bestDistance = INTERACT_RADIUS;

    // Un evento de calle se ofrece cuando ya lo tienes delante, sin marca que lo anuncie de lejos: en su
    // mirador (StreetEventDef.vantage), no pegado al jugador; dentro del patio mandan las cajas y la gente.
    const events: Interactable[] = this.streetEvents
      .filter((e) => e.noticedFrom(this.playerTile()))
      .map((e) => ({ kind: 'event', x: e.def.vantage.tx * TILE + TILE / 2, y: e.def.vantage.ty * TILE + TILE / 2, view: e }));
    for (const item of [...this.interactables, ...this.crowdInteractables(), ...events]) {
      // Sentado sólo se habla con quien esté cerca; un asiento ocupado no se ofrece.
      if (this.player.isSeating && item.kind !== 'npc') continue;
      if (item.kind === 'seat' && this.seatTaken(item.seat)) continue;
      if (item.kind === 'portal' && item.portal.train && !this.metro?.train.doorsOpen) continue;
      if (item.kind === 'npc' && !item.sprite.visible) continue;
      const { x, y } = anchor(item);
      const distance = Phaser.Math.Distance.Between(originX, originY, x, y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = item;
      }
    }
    return best;
  }

  private updatePrompt(target: Interactable | null): void {
    if (!target) {
      this.prompt.setVisible(false);
      this.services.hint.hide();
      this.activeTarget = null;
      return;
    }

    const toll =
      target.kind === 'portal' ? describePortal(target.portal) + (this.closedPlace(target.portal) ? ' · cerrado' : '')
      : target.kind === 'terminal' || target.kind === 'spot' ? target.name
      : target.kind === 'seat' ? `Sentarse · ${target.seat.def.name}`
      : '';
    if (toll) this.services.hint.show(toll);
    else this.services.hint.hide();

    // Por encima de lo más alto en juego: ni tapa al jugador cuando el objetivo
    // está bajo sus pies (una puerta) ni al NPC cuando lo tiene justo encima.
    const targetTop = target.kind === 'npc' ? target.sprite.y - PLAYER_H : target.y - 8;
    const top = Math.min(this.player.y - PLAYER_H, targetTop);
    const anchorX = target.kind === 'npc' ? target.sprite.x : this.player.x;
    this.prompt.setPosition(anchorX, top - 8).setVisible(true);
    if (target === this.activeTarget) return;

    this.activeTarget = target;
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
    if (target.kind === 'portal') {
      this.travel(target.portal);
      return;
    }
    this.player.halt();
    if (target.kind === 'terminal') this.menus.openCatalog(target.name, target.catalog);
    else if (target.kind === 'spot') {
      if (target.wardrobe) this.menus.openWardrobe();
      else this.menus.openSpot(target.name, target.activities);
    }
    else if (target.kind === 'event') this.approachEvent(target.view);
    else if (target.kind === 'npc') {
      // Personal con algo que ofrecer (la barbera, la barra): se le pide; el resto, se charla.
      const offer = this.offerOf(target.sprite);
      if (offer) this.menus.openOffer(offer, target.def.name);
      else {
        this.startTalk(target.sprite);
        this.openDialogue(target.def.name, target.lines?.() ?? target.def.lines);
      }
    }
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
    });
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

  /** Lo que ofrece esta persona si es personal de un local con servicio (data/services.ts). */
  private offerOf(sprite: Phaser.GameObjects.Sprite): OfferId | undefined {
    if (!(sprite instanceof Character)) return undefined;
    const agent = this.crowdViews.map((v) => v.agentOf(sprite)).find((a) => a !== undefined);
    return agent?.staffRole ? identity(agent.staffRole).offers : undefined;
  }

  private openDialogue(speaker: string, lines: readonly string[]): void {
    this.services.dialogue.start(speaker, lines);
  }

  private travel(portal: PortalDef): void {
    if (this.leaving) return;
    this.player.halt();

    // Subir al tren: se elige destino y paga la tarjeta (scenes/Menus.ts, systems/Transit.ts).
    if (portal.train) {
      const stop = stopAtStation(this.services.state.locationId);
      if (stop) this.menus.board(stop);
      return;
    }

    // Fuera de horario, la puerta está cerrada: se dice cuándo abre y no se entra.
    const closed = this.closedPlace(portal);
    if (closed) {
      this.openDialogue(closed.name, ['Está cerrado.', hoursLabel(closed)]);
      return;
    }
    if (portal.minutes) this.services.clock.advanceMinutes(portal.minutes);
    this.go(portal.to.location, portal.to.spawn, false);
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

  /** Cambia de localización: guarda, funde a negro y rehace la Scene a la hora que sea ya. */
  private go(locationId: string, spawnId: string, byTrain: boolean): void {
    if (this.leaving) return;
    const { state, hint } = this.services;
    this.leaving = true;
    this.player.halt();
    this.prompt.setVisible(false);
    hint.hide();

    const target = getLocation(locationId);
    const spawn = getSpawn(target, spawnId);
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
    if (save.save(state.snapshot)) state.emit('saved');
  }
}
