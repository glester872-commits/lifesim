import type Phaser from 'phaser';
import type { Agent } from '../systems/Crowd';
import { Character, activityAt } from '../entities/Character';
import { atTable, seatAt } from '../systems/Seating';
import { getNpc, PASSENGER_LOOKS, UNIFORM_LOOKS } from '../data/npcs';
import type { NpcDef } from '../types/game';
import type { Weather } from '../systems/Weather';
import { dressedLook, gymLook, umbrellaFor } from './WeatherLooks';
import { AmbientDirector, ambientFrame, ambientSituation, facingTowards } from '../systems/AmbientActions';
import { placeOfPoint } from '../systems/Places';
import type { AmbientPlacement } from '../entities/Character';
import type { Belonging } from '../data/streetSurvival';
import { belongingKey, blanketOf, buildSurvivalTextures, sleeperTexture } from './SurvivalArt';

/** Margen en px alrededor de la cámara dentro del cual la gente ya tiene sprite. */
const MARGIN = 96;

/**
 * Pinta la gente de un local (systems/Crowd.ts) o de la calle
 * (systems/StreetLife.ts), que no saben de Phaser: un Character por agente
 * mientras está a la vista. La lógica sigue siendo toda de ellos; aquí sólo se
 * decide qué cara tiene y qué se le ve hacer.
 *
 * Sólo tiene sprite quien está cerca de la cámara (con un margen para que nadie
 * aparezca de golpe en el borde): la calle entera se sigue simulando, pero lo
 * que no se ve no se pinta. Los sprites salen de un pozo y vuelven a él: un
 * mismo Character es hoy un vecino y mañana alguien que sale del metro.
 */
export class CrowdView {
  private readonly scene: Phaser.Scene;
  private readonly crowd: { readonly agents: readonly Agent[] };
  private readonly sprites = new Map<number, Character>();
  private readonly pool: Character[] = [];
  /** Quién lleva ahora la ropa de entrenar en pantalla: para cambiarle el aspecto al sprite cuando se cambia. */
  private readonly sportOn = new Set<number>();
  /** El tiempo que hace: la ropa de quien aparece y, fuera, quién abre el paraguas. */
  private readonly weather: () => Weather;
  /** En la calle: con lluvia, paraguas. Dentro de un local, nadie lo lleva abierto. */
  private readonly outdoor: boolean;

  /** Gestos de ambiente (systems/AmbientActions): sólo si quien crea la vista da la hora. El corro de una pelea lleva los suyos. */
  private readonly ambient: AmbientDirector | null;
  /** Las cosas de quien vive en la calle (y su figura dormida), por agente; y a quién se le han pintado este frame. */
  private readonly kits = new Map<number, Map<string, Phaser.GameObjects.Image>>();
  private readonly kitShown = new Set<number>();

  constructor(scene: Phaser.Scene, crowd: { readonly agents: readonly Agent[] }, weather: () => Weather, outdoor: boolean, hour?: () => number) {
    this.scene = scene;
    this.crowd = crowd;
    this.weather = weather;
    this.outdoor = outdoor;
    this.ambient = hour ? new AmbientDirector(hour) : null;
    this.sync(0);
  }

  /** Decisiones de gesto tomadas (depuración: no debe crecer cada frame). */
  get ambientDecisions(): number {
    return this.ambient?.decisions ?? 0;
  }

  /** Quien está ahora en la sala, para hablar con ellos. */
  get people(): readonly Character[] {
    return [...this.sprites.values()];
  }

  /** El agente que pinta este sprite ahora mismo: con él se habla. */
  agentOf(sprite: Character): Agent | undefined {
    for (const [id, s] of this.sprites) if (s === sprite) return this.crowd.agents.find((a) => a.id === id);
    return undefined;
  }

  sync(time: number): void {
    const here = new Set<number>();
    const w = this.weather();
    const view = this.scene.cameras.main.worldView;
    for (const a of this.crowd.agents) {
      const px = a.x * 16 + 8;
      const py = a.y * 16 + 16;
      if (px < view.x - MARGIN || px > view.right + MARGIN || py < view.y - MARGIN || py > view.bottom + MARGIN + 24) continue;
      // En la ducha no se ve: la puerta del cubículo la tapa (sale cuando acaba, ya andando).
      if (a.state === 'SHOWER' && !a.moving && a.path.length === 0) continue;
      // Quien vive en la calle y duerme: tumbado bajo su manta (world/SurvivalArt), no de pie. No se le despierta.
      const asleep = a.kind === 'street' && a.state === 'SLEEP' && !a.moving && a.path.length === 0;
      if (a.belongings) this.kitOf(a, px, py, asleep);
      if (asleep) continue;
      here.add(a.id);
      let sprite = this.sprites.get(a.id);
      if (!sprite) {
        sprite = this.pool.pop();
        if (sprite) sprite.reuse(defOf(a, w), a.id);
        else sprite = new Character(this.scene, defOf(a, w), a.id);
        this.sprites.set(a.id, sprite);
        if (a.sport) this.sportOn.add(a.id);
        else this.sportOn.delete(a.id);
      }
      // Se ha cambiado de ropa en el vestuario: el mismo sprite pasa a la ropa de entrenar, o vuelve a la de calle.
      if (!!a.sport !== this.sportOn.has(a.id)) {
        const base = PASSENGER_LOOKS[a.look % PASSENGER_LOOKS.length];
        sprite.setLook((a.sport ? gymLook(base) : dressedLook(base, a.dressSeed ?? a.id, w)).id);
        if (a.sport) this.sportOn.add(a.id);
        else this.sportOn.delete(a.id);
      }
      // Sólo quien ha llegado a su sitio hace algo; entrando o saliendo, camina.
      const settled = !a.moving && !a.leaving && a.path.length === 0;
      // Esperando (un semáforo, una pausa): el móvil, casi siempre; quien corre, sigue trotando en el sitio.
      const waiting = !a.moving && a.state === 'WAIT';
      const activity = settled
        ? a.kind === 'street'
          ? streetActivity(a)
          : activityAt(a.point, a.state, a.id)
        : a.gait === 'jog'
          ? 'run'
          : waiting
            ? activityAt(undefined, 'WAIT', a.id)
            : 'idle';
      // El paraguas se abre al empezar a llover y se cierra al parar; la capucha no lleva paraguas.
      sprite.umbrella = this.outdoor && !a.staffRole ? umbrellaFor(a.id, w, sprite.def.id.endsWith('~hood')) : null;
      const ambient = this.ambientOf(a, activity, time);
      sprite.place({ tx: a.x, ty: a.y, dir: a.dir, moving: a.moving, activity, lift: settled ? seatAt(a.point)?.lift : 0, carry: a.carry, drink: a.drink, ambient }, time);
    }
    // Las cosas de quien ya no está a la vista (o se ha ido del barrio), fuera.
    for (const [id, kit] of this.kits) {
      if (this.kitShown.has(id)) continue;
      for (const img of kit.values()) img.destroy();
      this.kits.delete(id);
    }
    this.kitShown.clear();
    for (const [id, sprite] of this.sprites) {
      if (here.has(id)) continue;
      // Fuera de la vista no se lleva su gesto: al volver, elige otro a mitad.
      this.ambient?.forget(id);
      sprite.place(null);
      this.pool.push(sprite);
      this.sprites.delete(id);
    }
  }

  /**
   * Su gesto de ambiente, si le toca: la gente que va a lo suyo (no quien
   * trabaja, lleva la bandeja o habla con el jugador). El director sólo decide
   * al aparecer, al cambiar de situación o al acabar el gesto; el resto de
   * frames devuelve el que ya tenía.
   */
  private ambientOf(a: Agent, activity: string, time: number): AmbientPlacement | undefined {
    if (!this.ambient || a.kind === 'staff' || a.staffRole || a.carry || a.talking) return undefined;
    const situation = ambientSituation(activity, a.state, a.moving);
    if (!situation) return undefined;
    const context = `${situation.posture}|${situation.context}|${a.point ?? ''}`;
    const choice = this.ambient.at(a.id, context, time, () => ({
      ...situation,
      seed: a.id,
      outdoor: this.outdoor,
      tags: a.point ? (placeOfPoint(a.point)?.tags ?? []) : [],
      role: a.role,
      companion: situation.posture === 'walk' ? undefined : this.companionOf(a),
    }));
    return choice && { frame: ambientFrame(choice, time), start: choice.start, companion: choice.companion, table: atTable(a.point) };
  }

  /**
   * Lo que lleva quien vive en la calle, a su lado y a sus pies: el cartón
   * debajo, la manta enrollada, las bolsas y la mochila al lado, el vaso delante
   * si está pidiendo y el carro, también andando (delante, empujándolo). Dormido,
   * él mismo tumbado bajo la manta. Seis personas como mucho: imágenes sueltas.
   */
  private kitOf(a: Agent, px: number, py: number, asleep: boolean): void {
    buildSurvivalTextures(this.scene);
    this.kitShown.add(a.id);
    const kit = this.kits.get(a.id) ?? new Map<string, Phaser.GameObjects.Image>();
    this.kits.set(a.id, kit);
    const settled = !a.moving && a.path.length === 0;
    const has = (b: Belonging): boolean => !!a.belongings?.includes(b);
    const lift = settled ? (seatAt(a.point)?.lift ?? 0) : 0;
    const show = (key: string, texture: string, on: boolean, x: number, y: number, depth: number, flip = false): void => {
      let img = kit.get(key);
      if (!on) {
        img?.setVisible(false);
        return;
      }
      if (!img || img.texture.key !== texture) {
        img?.destroy();
        img = this.scene.add.image(0, 0, texture).setOrigin(0.5, 1);
        kit.set(key, img);
      }
      img.setPosition(Math.round(x), Math.round(y)).setDepth(depth).setFlipX(flip).setVisible(true);
    };
    show('cardboard', belongingKey('cardboard'), has('cardboard') && settled && lift === 0, px + (asleep ? 4 : 0), py + 1, py - 14);
    show('sleeper', sleeperTexture(this.scene, a.look, blanketOf(a.label)), asleep, px + 5, py - lift, py + 1);
    const awake = settled && !asleep;
    show('blanket', belongingKey('blanket'), has('blanket') && awake, px + 9, py, py);
    show('bags', belongingKey('bags'), has('bags') && settled, px - (asleep ? 6 : 10), py, py);
    show('backpack', belongingKey('backpack'), has('backpack') && awake, px + (has('blanket') ? 15 : 9), py, py);
    show('cup', belongingKey('cup'), has('cup') && awake && a.state === 'ASK', px + 6, py + 3, py + 3);
    // El carro: aparcado a su lado o, andando, delante en la dirección en la que va.
    const side = a.dir === 'left' || a.dir === 'right';
    const cx = settled ? px - 13 : px + (a.dir === 'left' ? -12 : a.dir === 'right' ? 12 : 10);
    const cy = py + (settled || side ? 0 : a.dir === 'down' ? 6 : -4);
    show('cart', belongingKey('cart'), has('cart'), cx, cy, cy, a.dir === 'left');
  }

  /** Hacia dónde queda quien viene con él (su grupo), si está parado a su lado. */
  private companionOf(a: Agent): ReturnType<typeof facingTowards> | undefined {
    let best: Agent | undefined;
    let bestD = 2.6;
    for (const o of this.crowd.agents) {
      if (o === a || o.moving) continue;
      const together = o.leader === a || a.leader === o || (!!a.leader && o.leader === a.leader);
      const d = Math.hypot(o.x - a.x, o.y - a.y);
      if (together && d < bestD) {
        best = o;
        bestD = d;
      }
    }
    return best && facingTowards(a, best);
  }
}

/**
 * Lo que se le ve hacer en su sitio a quien vive en la calle: en un banco, lo
 * de cualquiera sentado (mirar pasar a la gente, el móvil...); en el suelo,
 * sentado en su cartón o su manta, o de pie si está recogiendo o sin nada.
 */
function streetActivity(a: Agent): ReturnType<typeof activityAt> {
  if (seatAt(a.point)) return activityAt(a.point, a.state === 'ASK' ? undefined : a.state, a.id);
  const seated = a.state === 'SIT' || a.state === 'REST' || a.state === 'ASK' || (a.state === 'SHELTER' && !!a.belongings?.some((b) => b === 'cardboard' || b === 'blanket'));
  return seated ? 'sit' : 'idle';
}

/**
 * Personal con nombre: su personaje; personal anónimo: su uniforme; clientes y
 * gente de la calle: una cara de la lista, vestida para el tiempo que hace.
 */
function defOf(a: Agent, w: Weather): NpcDef {
  if (a.npc) return getNpc(a.npc);
  const uniform = a.uniform ? UNIFORM_LOOKS.find((l) => l.id === a.uniform) : undefined;
  const base = PASSENGER_LOOKS[a.look % PASSENGER_LOOKS.length];
  // Quien viene de la calle (systems/Handoff) trae su semilla de ropa: el mismo abrigo dentro que fuera.
  const look = uniform ?? (a.sport ? gymLook(base) : dressedLook(base, a.dressSeed ?? a.id, w));
  return { ...look, name: a.label, lines: [a.line] };
}
