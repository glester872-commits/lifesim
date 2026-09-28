import type Phaser from 'phaser';
import type { Agent } from '../systems/Crowd';
import { Character, activityAt } from '../entities/Character';
import { getNpc, PASSENGER_LOOKS, UNIFORM_LOOKS } from '../data/npcs';
import type { NpcDef } from '../types/game';

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

  constructor(scene: Phaser.Scene, crowd: { readonly agents: readonly Agent[] }) {
    this.scene = scene;
    this.crowd = crowd;
    this.sync(0);
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
    const view = this.scene.cameras.main.worldView;
    for (const a of this.crowd.agents) {
      const px = a.x * 16 + 8;
      const py = a.y * 16 + 16;
      if (px < view.x - MARGIN || px > view.right + MARGIN || py < view.y - MARGIN || py > view.bottom + MARGIN + 24) continue;
      here.add(a.id);
      let sprite = this.sprites.get(a.id);
      if (!sprite) {
        sprite = this.pool.pop();
        if (sprite) sprite.reuse(defOf(a), a.id);
        else sprite = new Character(this.scene, defOf(a), a.id);
        this.sprites.set(a.id, sprite);
      }
      // Sólo quien ha llegado a su sitio hace algo; entrando o saliendo, camina.
      const settled = !a.moving && !a.leaving && a.path.length === 0;
      // Esperando (un semáforo, una pausa): el móvil, casi siempre; quien corre, sigue trotando en el sitio.
      const waiting = !a.moving && a.state === 'WAIT';
      const activity = settled ? activityAt(a.point, a.state, a.id) : a.gait === 'jog' ? 'run' : waiting ? activityAt(undefined, 'WAIT', a.id) : 'idle';
      sprite.place({ tx: a.x, ty: a.y, dir: a.dir, moving: a.moving, activity }, time);
    }
    for (const [id, sprite] of this.sprites) {
      if (here.has(id)) continue;
      sprite.place(null);
      this.pool.push(sprite);
      this.sprites.delete(id);
    }
  }
}

/** Personal con nombre: su personaje; personal anónimo: su uniforme; clientes: una cara de la lista. */
function defOf(a: Agent): NpcDef {
  if (a.npc) return getNpc(a.npc);
  const uniform = a.uniform ? UNIFORM_LOOKS.find((l) => l.id === a.uniform) : undefined;
  const look = uniform ?? PASSENGER_LOOKS[a.look % PASSENGER_LOOKS.length];
  return { ...look, name: a.label, lines: [a.line] };
}
