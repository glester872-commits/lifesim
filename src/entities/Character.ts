import Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { Facing, NpcDef } from '../types/game';
import { findPoint } from '../systems/Navigation';
import { PEOPLE, personFrame } from '../world/TextureFactory';

/**
 * Lo que se ve hacer a alguien parado. No es IA: sale del sitio donde está
 * (una silla, una cinta) y de lo que su sistema ya dice que hace.
 */
export type Activity = 'idle' | 'sit' | 'read' | 'run' | 'lift' | 'phone' | 'talk' | 'dance' | 'eat' | 'drink';

/** La música de la sala: 120 pulsaciones. Todos bailan al mismo compás, cada uno a su manera. */
const BEAT_MS = 500;
const DANCE_TURNS: readonly Facing[] = ['down', 'left', 'down', 'right', 'up', 'down'];
/** Media repetición con las pesas. */
const LIFT_MS = 900;

/** Dónde está y cómo: lo único que necesita para pintarse. */
export interface Placement {
  /** En tiles, con decimales mientras camina. */
  tx: number;
  ty: number;
  dir: Facing;
  moving: boolean;
  activity?: Activity;
}

/** Dónde queda la mesa según hacia dónde mira quien está sentado, en px desde sus pies. */
const TABLE_OFFSET: Readonly<Record<Facing, readonly [number, number]>> = { up: [0, -TILE - 3], down: [0, TILE - 7], left: [-TILE, -7], right: [TILE, -7] };

const WAITING = new Set(['WAIT', 'QUEUE', 'REST', 'BREAK']);
const TALKING = new Set(['MEETING', 'ORDER', 'CHECK_IN', 'CHECKOUT', 'DRINK', 'TALK']);

/**
 * Actividad visible en un punto: en un asiento o un puesto de mesa, sentado;
 * en la cinta, corriendo; en una cola o un descanso, a veces con el móvil; en
 * una reunión o un mostrador, hablando. `seed` reparte el móvil sin azar.
 */
export function activityAt(point: string | undefined, state: string | undefined, seed: number): Activity {
  const p = point ? findPoint(point) : undefined;
  if (point?.includes('_DANCE_') || state === 'DANCE') return 'dance';
  // Sentado a la mesa: con plato si come, con taza o vaso si bebe.
  if (state === 'PHONE') return 'phone';
  if (p?.kind === 'seat' || point?.includes('_DESK_')) return state === 'EAT' ? 'eat' : state === 'DRINK' ? 'drink' : state === 'READ' ? 'read' : 'sit';
  if (point?.includes('TREADMILL')) return 'run';
  if (point && /^GYM_(WEIGHTS|BENCH)/.test(point)) return 'lift';
  if (p?.kind === 'meet' || (state && TALKING.has(state))) return 'talk';
  if (p?.kind === 'wait' || (state && WAITING.has(state))) return seed % 3 === 0 ? 'idle' : 'phone';
  return 'idle';
}

/**
 * Persona que se coloca cada frame desde fuera: personajes con nombre
 * (systems/Characters.ts) y gente de los locales (world/CrowdView.ts). No
 * decide nada. Sin cuerpo físico: su camino ya esquiva lo sólido y no debe
 * quedarse enganchada en el jugador.
 */
export class Character extends Phaser.GameObjects.Sprite {
  def: NpcDef;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly icon: Phaser.GameObjects.Image;
  private seed: number;

  constructor(scene: Phaser.Scene, def: NpcDef, seed = 0) {
    super(scene, 0, 0, PEOPLE, personFrame(def.id, 'down'));
    this.def = def;
    this.seed = seed;
    scene.add.existing(this);
    this.setOrigin(0.5, 1);
    this.shadow = scene.add.image(0, 0, 'fx-shadow').setOrigin(0.5, 0.5);
    this.icon = scene.add.image(0, 0, 'fx-phone').setOrigin(0.5, 1).setVisible(false);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.shadow.destroy();
      this.icon.destroy();
    });
  }

  /** El pozo de world/CrowdView: el mismo sprite pasa a ser otra persona. */
  reuse(def: NpcDef, seed: number): void {
    this.def = def;
    this.seed = seed;
    this.anims.stop();
  }

  /** Empieza un bucle desde un punto propio (por semilla), no desde el primer frame como todos. */
  private loop(key: string): void {
    if (this.anims.currentAnim?.key === key && this.anims.isPlaying) return;
    this.anims.play(key);
    this.anims.setProgress(((this.seed * 0.618034) % 1 + 1) % 1);
  }

  /** null: está en otro sitio o dentro de un edificio. */
  place(where: Placement | null, time = 0): void {
    this.setVisible(where !== null);
    this.shadow.setVisible(where !== null);
    if (!where) {
      this.icon.setVisible(false);
      this.anims.stop();
      return;
    }
    const x = where.tx * TILE + TILE / 2;
    const y = where.ty * TILE + TILE;
    this.setPosition(x, y).setDepth(y);
    this.shadow.setPosition(x, y - 1).setDepth(y - 1);

    const id = this.def.id;
    // Andando se le ve andar; si corre (un corredor del parque), correr.
    const activity = where.moving ? (where.activity === 'run' ? 'run' : 'walk') : (where.activity ?? 'idle');
    // Cada uno a su compás: ni todos respiran a la vez ni todos dan el paso al mismo tiempo.
    this.anims.timeScale = (activity === 'run' ? 1.6 : 1) * (0.9 + (this.seed % 5) * 0.05);
    if (activity === 'walk' || activity === 'run') this.loop(`npc-${id}-walk-${where.dir}`);
    else if (activity === 'sit' || activity === 'read' || activity === 'eat' || activity === 'drink') {
      this.anims.stop();
      this.setTexture(PEOPLE, personFrame(id, where.dir, 4));
    } else if (activity === 'dance') {
      // Un paso por pulso y un giro cada dos; medio pulso arriba, medio abajo.
      const beat = Math.floor(time / BEAT_MS);
      const dir = DANCE_TURNS[(Math.floor(beat / 2) + this.seed) % DANCE_TURNS.length];
      this.anims.stop();
      this.setTexture(PEOPLE, personFrame(id, dir, beat % 2 === 0 ? 1 : 2));
      this.setY(y - (time % BEAT_MS < BEAT_MS / 2 ? 1 : 0));
    } else if (activity === 'phone') {
      // Cabeza gacha y el móvil entre las manos, quieto.
      this.anims.stop();
      this.setTexture(PEOPLE, personFrame(id, where.dir, 5));
    } else if (activity === 'lift') {
      // Repeticiones: arriba y abajo, cada uno a su ritmo.
      this.anims.stop();
      const up = Math.floor((time + this.seed * 431) / LIFT_MS) % 2 === 0;
      this.setTexture(PEOPLE, personFrame(id, where.dir, up ? 6 : 0));
    } else this.loop(`npc-${id}-idle-${where.dir}`);

    // El móvil, en la mano; la charla, a ratos y cada uno a su compás.
    const talking = activity === 'talk' && Math.floor((time + this.seed * 700) / 1800) % 3 === 0;
    if (activity === 'eat' || activity === 'drink') {
      // Lo que tiene delante va sobre la mesa, en el tile hacia el que mira.
      const [ox, oy] = TABLE_OFFSET[where.dir];
      this.icon.setTexture(activity === 'eat' ? 'fx-plate' : 'fx-cup').setPosition(x + ox, y + oy).setDepth(y + oy + 12).setVisible(true);
    } else if (activity === 'phone' && where.dir === 'up') {
      // De espaldas no se ve el móvil del sprite: el brillo de la pantalla, junto a la mano.
      this.icon.setTexture('fx-phone').setPosition(x + 4, y - 9).setDepth(y + 1).setVisible(true);
    } else if (activity === 'read') {
      // El libro abierto en el regazo; de espaldas asoma a un lado.
      const side = where.dir === 'up' ? 5 : where.dir === 'left' ? -3 : 3;
      this.icon.setTexture('fx-book').setPosition(x + side, y - 6).setDepth(y + 1).setVisible(true);
    } else if (talking) {
      this.icon.setTexture('fx-talk').setPosition(x + 5, y - 24).setDepth(y + 1).setVisible(true);
    } else this.icon.setVisible(false);
  }
}
