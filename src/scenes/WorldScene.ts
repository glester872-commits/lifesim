import Phaser from 'phaser';
import {
  AUTOSAVE_INTERVAL_MS,
  CAMERA_LERP,
  CAMERA_ZOOM,
  INTERACT_RADIUS,
  MAX_CAMERA_ZOOM,
  PALETTE,
  TILE,
  TRANSITION_MS,
} from '../config/constants';
import type { Facing, NpcDef, PortalDef, Vec2 } from '../types/game';
import type { MetroEventDef, RideContext } from '../systems/MetroEventManager';
import { doorRow, getLocation, getSpawn, spawnToWorld } from '../systems/LocationSystem';
import { Ambience } from '../world/Ambience';
import { MetroSystem } from '../systems/MetroSystem';
import { METRO_CONFIG } from '../config/metro';
import { buildLocation } from '../world/LocationBuilder';
import { Player } from '../entities/Player';
import { NPC } from '../entities/NPC';
import { getNpc } from '../data/npcs';
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
  | { kind: 'npc'; sprite: Phaser.GameObjects.Sprite; def: NpcDef }
  | { kind: 'portal'; x: number; y: number; portal: PortalDef }
  | { kind: 'inspect'; x: number; y: number; name: string; lines: readonly string[] };

function anchor(item: Interactable): Vec2 {
  return item.kind === 'npc' ? { x: item.sprite.x, y: item.sprite.y - 10 } : item;
}

type Keys = Record<string, Phaser.Input.Keyboard.Key>;

/** A dónde lleva un portal y, si cuesta algo, cuánto: se ve antes de pagarlo. */
function describePortal(portal: PortalDef): string {
  const parts: string[] = [];
  if (portal.fare) parts.push(`€${portal.fare}`);
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
  /** Pies de quien camina por la calle; hoy sólo el jugador. */
  private readonly pedestrians: Vec2[] = [{ x: 0, y: 0 }];

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

    this.physics.add.collider(this.player, built.solids);
    this.ambience = new Ambience(this, def, built.widthPx, () => this.pedestrians);

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
    const { clock, dialogue } = this.services;

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
    this.pedestrians[0].x = this.player.x;
    this.pedestrians[0].y = this.player.y;
    this.ambience?.update(delta);

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
    }
  }

  /**
   * El zoom sube en enteros hasta cubrir la ventana, con tope para que el pixel
   * art no se vuelva gigante en interiores pequeños. Si aun asi el mapa no llena
   * el viewport, se ensanchan los limites de camara para que quede centrado en
   * lugar de pegado a una esquina.
   */
  private fitCamera(): void {
    const camera = this.cameras.main;
    const { width, height } = this.scale.gameSize;
    const needed = Math.max(width / this.mapWidth, height / this.mapHeight);
    const zoom = Phaser.Math.Clamp(Math.ceil(needed), CAMERA_ZOOM, MAX_CAMERA_ZOOM);
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

    for (const item of this.interactables) {
      if (item.kind === 'portal' && item.portal.train && !this.metro?.train.doorsOpen) continue;
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

    const toll = target.kind === 'portal' ? describePortal(target.portal) : '';
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
    if (target.kind === 'npc') this.openDialogue(target.def.name, target.def.lines);
    else this.openDialogue(target.name, target.lines);
  }

  private openDialogue(speaker: string, lines: readonly string[]): void {
    this.services.clock.setPaused(true);
    this.services.dialogue.start(speaker, lines);
  }

  private travel(portal: PortalDef): void {
    if (this.leaving) return;

    const { state, clock, hint } = this.services;
    const fare = portal.fare ?? 0;

    if (state.money < fare) {
      this.player.halt();
      this.openDialogue('Torniquete', [
        `El billete cuesta €${fare} y ahora mismo no te llega.`,
        'Vuelve cuando lo tengas.',
      ]);
      return;
    }

    this.leaving = true;
    this.player.halt();
    this.prompt.setVisible(false);
    hint.hide();

    if (fare > 0) state.money -= fare;
    // El evento se decide al salir, con la hora de salida; se cuenta al llegar.
    if (portal.train) this.services.metroEvents.onRide({ ...this.rideContext(), to: portal.to.location });
    if (portal.minutes) clock.advanceMinutes(portal.minutes);

    const target = getLocation(portal.to.location);
    const spawn = getSpawn(target, portal.to.spawn);
    const position = spawnToWorld(spawn);

    state.locationId = target.id;
    state.position.x = position.x;
    state.position.y = position.y;
    state.facing = spawn.facing;
    this.persist();

    const camera = this.cameras.main;
    camera.fadeOut(TRANSITION_MS, 0, 0, 0);
    camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.restart({ locationId: target.id, spawnId: portal.to.spawn, byTrain: portal.train });
    });
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
