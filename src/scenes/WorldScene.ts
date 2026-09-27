import Phaser from 'phaser';
import {
  AUTOSAVE_INTERVAL_MS,
  CAMERA_LERP,
  CAMERA_ZOOM,
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
import { Lighting } from '../world/Lighting';
import { MetroSystem } from '../systems/MetroSystem';
import { METRO_CONFIG } from '../config/metro';
import { buildLocation } from '../world/LocationBuilder';
import { Player } from '../entities/Player';
import { NPC } from '../entities/NPC';
import { getNpc } from '../data/npcs';
import { CHARACTERS, type CharacterDef } from '../data/characters';
import { whereabouts, type Whereabouts } from '../systems/Characters';
import { Character, activityAt } from '../entities/Character';
import { Crowd, profileFor, type Clock } from '../systems/Crowd';
import { StreetLife, streetProfileFor } from '../systems/StreetLife';
import { hoursLabel, isOpen, placeForInterior } from '../systems/Places';
import { stopAtStation } from '../systems/Transit';
import { Menus } from './Menus';
import { CrowdView } from '../world/CrowdView';
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
  | { kind: 'spot'; x: number; y: number; name: string; activities: readonly string[] };

function anchor(item: Interactable): Vec2 {
  return item.kind === 'npc' ? { x: item.sprite.x, y: item.sprite.y - 10 } : item;
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
  /** Pies de quien camina por aquí (jugador, personajes y gente): los coches frenan y las puertas se abren. */
  private readonly pedestrians: Vec2[] = [];
  /** Personajes que van de un sitio a otro según la hora; se ven sólo si están aquí. */
  private characters: { def: CharacterDef; sprite: Character; now: Whereabouts | null }[] = [];
  /** Gente del local (data/population.ts), sólo en interiores con perfil y mientras el jugador está dentro. */
  private crowd: Crowd | null = null;
  /** Gente de la calle (data/streets.ts), sólo en exteriores con perfil. */
  private street: StreetLife | null = null;
  /** Perros y palomas de la calle (sólo donde hay calle con gente). */
  private wildlife: WildlifeView | null = null;
  private signals: SignalView | null = null;
  private crowdViews: CrowdView[] = [];
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
    this.interactables = [];
    this.characters = CHARACTERS.map((c, i) => {
      const entry = { def: c, sprite: new Character(this, getNpc(c.npc), i), now: null as Whereabouts | null };
      // Lo que dice depende de dónde está o a dónde va.
      const lines = (): readonly string[] => (entry.now?.moving ? entry.now.stop.going : entry.now?.stop.lines) ?? entry.sprite.def.lines;
      this.interactables.push({ kind: 'npc', sprite: entry.sprite, def: entry.sprite.def, lines });
      return entry;
    });

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
      this.interactables.push({ kind: 'spot', x: s.tx * TILE + TILE / 2, y: s.ty * TILE + TILE / 2, name: s.name, activities: s.activities });
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
    this.street?.populate(this.clockNow(), this.playerTile());
    this.crowdViews = [this.crowd, this.street].filter((c) => c !== null).map((c) => new CrowdView(this, c));
    const now = this.clockNow();
    this.wildlife = this.street ? new WildlifeView(this, def, this.street, now.day, now.hour + now.minute / 60, this.playerTile()) : null;
    this.crowdTargets = new WeakMap();

    // La hora con la fracción del minuto en curso: los semáforos cambian a su segundo, no a saltos de minuto.
    this.ambience = new Ambience(this, def, built.widthPx, () => this.pedestrians, () => this.services.clock.minuteOfDay / 60);
    this.signals = def.signals?.length ? new SignalView(this, def, () => this.services.clock.minuteOfDay) : null;
    // La hora se ve en la calle; dentro manda la luz del local.
    new Lighting(this, def, built, state);

    const camera = this.cameras.main;
    camera.setBackgroundColor(PALETTE.ink);
    camera.setRoundPixels(true);
    camera.startFollow(this.player, true, CAMERA_LERP, CAMERA_LERP);
    camera.setFollowOffset(0, 12);
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

    const onDialogueClose = (): void => clock.setPaused(false);
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
    });
  }

  update(time: number, delta: number): void {
    const { clock, dialogue, menu } = this.services;

    // Un menú abierto para el mundo como un diálogo: se elige con W/S y E, o con 1–9.
    if (menu.isOpen && !dialogue.isOpen) {
      this.player.halt();
      this.prompt.setVisible(false);
      this.services.hint.hide();
      if (this.pressedAny(['up', 'upAlt'])) menu.move(-1);
      else if (this.pressedAny(['down', 'downAlt'])) menu.move(1);
      else if (this.pressedAny(['interact', 'advance', 'advanceAlt'])) menu.confirm();
      else if (this.pressedAny(['cancel', 'cancelAlt'])) menu.cancel();
      else {
        const digit = DIGITS.findIndex((name) => this.pressedAny([name]));
        if (digit >= 0) menu.confirm(digit);
      }
      return;
    }

    if (dialogue.isOpen) {
      this.player.halt();
      this.prompt.setVisible(false);
      this.services.hint.hide();
      const picked = ['one', 'two', 'three'].findIndex((name) => this.pressedAny([name]));
      if (picked >= 0) dialogue.choose(picked);
      else if (this.pressedAny(['interact', 'advance', 'advanceAlt'])) dialogue.advance();
      return;
    }

    clock.update(delta);
    this.metro?.update(delta, time);
    this.placeCharacters();
    this.crowd?.update(delta, this.clockNow(), this.playerTile());
    this.street?.update(delta, this.clockNow(), this.playerTile());
    for (const view of this.crowdViews) view.sync(time);
    const { hour, minute } = this.services.state;
    this.wildlife?.update(delta, time, hour + minute / 60, this.playerTile(), (this.player.body as Phaser.Physics.Arcade.Body).speed > 1);
    this.gatherPedestrians();
    this.ambience?.update(delta);
    this.signals?.update(time);

    this.player.move({
      up: this.held('up') || this.held('upAlt'),
      down: this.held('down') || this.held('downAlt'),
      left: this.held('left') || this.held('leftAlt'),
      right: this.held('right') || this.held('rightAlt'),
    });

    this.syncState();

    const target = this.nearestInteractable();
    this.updatePrompt(target);

    if (target && Phaser.Input.Keyboard.JustDown(this.keys.interact)) {
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
    const zoom = Phaser.Math.Clamp(Math.round(Math.min(width / VIEW_WIDTH, height / VIEW_HEIGHT)), CAMERA_ZOOM, MAX_CAMERA_ZOOM);
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
    }) as Keys;
  }

  private held(name: string): boolean {
    return this.keys[name]?.isDown ?? false;
  }

  private pressedAny(names: string[]): boolean {
    return names.some((name) => {
      const key = this.keys[name];
      return key ? Phaser.Input.Keyboard.JustDown(key) : false;
    });
  }

  /**
   * Cada personaje con nombre, donde le toca a esta hora: aquí se ve; en otro
   * sitio o en casa, no. El sitio donde está parado es suyo: la gente del local
   * y de la calle no se sienta encima.
   */
  private placeCharacters(): void {
    const { day } = this.services.state;
    const minute = (day - 1) * 24 * 60 + this.services.clock.minuteOfDay;
    const here = this.services.state.locationId;
    const claimed = new Set<string>();
    for (const c of this.characters) {
      const w = whereabouts(c.def, minute);
      c.now = w;
      const visible = w.location === here && !w.inside;
      if (visible && !w.moving) claimed.add(w.stop.point);
      // Parado en un semáforo: de pie, sin la actividad del sitio al que va.
      c.sprite.place(visible ? { ...w, moving: w.moving && !w.waiting, activity: w.waiting ? 'idle' : activityAt(w.stop.point, undefined, 0) } : null, this.time.now);
    }
    this.crowd?.claim(claimed);
    this.street?.claim(claimed);
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
    state.position.x = this.player.x;
    state.position.y = this.player.y;
    state.facing = this.player.facing;
  }

  private nearestInteractable(): Interactable | null {
    const originX = this.player.x;
    const originY = this.player.y - 8;
    let best: Interactable | null = null;
    let bestDistance = INTERACT_RADIUS;

    for (const item of [...this.interactables, ...this.crowdInteractables()]) {
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
    if (target.kind === 'portal') {
      this.travel(target.portal);
      return;
    }
    this.player.halt();
    if (target.kind === 'terminal') this.menus.openCatalog(target.name, target.catalog);
    else if (target.kind === 'spot') this.menus.openSpot(target.name, target.activities);
    else if (target.kind === 'npc') this.openDialogue(target.def.name, target.lines?.() ?? target.def.lines);
    else this.openDialogue(target.name, target.lines);
  }

  private openDialogue(speaker: string, lines: readonly string[]): void {
    this.services.clock.setPaused(true);
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
    this.services.clock.setPaused(true);
    dialogue.ask(speaker, ev.lines, choices.map((c) => c.label), (i) => settle(choices[i].id));
  }

  private persist(): void {
    const { save, state } = this.services;
    if (save.save(state.snapshot)) state.emit('saved');
  }
}
