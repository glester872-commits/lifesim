import Phaser from 'phaser';
import { TILE } from '../config/constants';
import { QUALITY } from '../config/quality';
import type { LocationDef } from '../types/game';
import { LAYER } from './Layers';
import { nightAt } from './Lighting';
import { phaseOf, wave } from './Motion';
import { PROPS } from './tiles';

/**
 * El agua de un canal o un río (los tiles 'a'): destellos que se desplazan
 * despacio sobre la superficie y, cuando cae la noche, el reflejo alargado de las
 * farolas del muelle. No hay nada que simular: todo es función del tiempo (como
 * world/Motion), sin estado, y lo que queda fuera de cámara no se dibuja.
 *
 * Dos capas: los destellos van sobre el suelo y por debajo de todo lo que se
 * levanta (la luz de la hora los oscurece con el resto del mundo); el reflejo de
 * las farolas va encima de esa luz, aditivo, como los reflejos del suelo mojado
 * (world/Lighting) y con el mismo interruptor de calidad.
 */

interface Glint {
  x: number;
  y: number;
  w: number;
  phase: number;
  period: number;
  drift: number;
}

/** Farola con luz cuya base cae junto al agua: de ellas sale un reflejo. */
interface Lamp {
  x: number;
  /** Fila de agua más cercana, en px. */
  top: number;
  phase: number;
}

const SPARK = 0xdcefff;
const GLOW = 0xffcf8a;
const REFLECT_ROWS = 12;

export class WaterView {
  private readonly scene: Phaser.Scene;
  private readonly hour: () => number;
  private readonly glints: Glint[] = [];
  private readonly lamps: Lamp[] = [];
  private readonly shimmer: Phaser.GameObjects.Graphics | null;
  private readonly glow: Phaser.GameObjects.Graphics | null;
  private readonly calm: boolean;
  private last = -1;

  constructor(scene: Phaser.Scene, def: LocationDef, hour: () => number) {
    this.scene = scene;
    this.hour = hour;
    this.calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    // Las filas de agua de cada columna: la primera es la que toca el pretil.
    const top = new Map<number, number>();
    def.ground.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== 'a') continue;
        if (!top.has(x)) top.set(x, y);
        // Dos destellos posibles por tile, con su sitio, su largo y su compás: siempre los mismos.
        for (let k = 0; k < 2; k++) {
          const seed = x * 31 + y * 17 + k * 7;
          this.glints.push({
            x: x * TILE + Math.floor(phaseOf(seed) * (TILE - 6)),
            y: y * TILE + 2 + Math.floor(phaseOf(seed * 3 + 1) * (TILE - 4)),
            w: 3 + Math.floor(phaseOf(seed * 5 + 2) * 4),
            phase: phaseOf(seed * 7 + 3),
            period: 2600 + Math.floor(phaseOf(seed * 11 + 4) * 3200),
            drift: phaseOf(seed * 13 + 5) < 0.5 ? 1 : -1,
          });
        }
      }
    });
    for (const p of def.props) {
      if (!PROPS[p.kind].light) continue;
      const water = top.get(p.tx);
      if (water !== undefined && p.ty < water) this.lamps.push({ x: p.tx * TILE + TILE / 2, top: water * TILE, phase: phaseOf(p.tx * 5 + p.ty) });
    }
    if (this.glints.length === 0) {
      this.shimmer = null;
      this.glow = null;
      return;
    }
    this.shimmer = scene.add.graphics().setDepth(LAYER.decal + 0.5);
    this.glow = QUALITY.reflections && this.lamps.length > 0 ? scene.add.graphics().setDepth(LAYER.light + 2).setBlendMode(Phaser.BlendModes.ADD) : null;
  }

  /** Cada fotograma: destellos que aparecen, se desplazan un píxel y se apagan; y, de noche, el reflejo de cada farola. */
  update(time: number): void {
    if (!this.shimmer) return;
    // El agua no necesita más de unos diez fotogramas por segundo: se ve igual y no cuesta nada en un móvil.
    if (time - this.last < 90) return;
    this.last = time;
    const view = this.scene.cameras.main.worldView;
    const g = this.shimmer.clear();
    for (const s of this.glints) {
      if (s.y < view.y - TILE || s.y > view.bottom + TILE || s.x < view.x - TILE || s.x > view.right + TILE) continue;
      // Encendido un rato de cada periodo; se desplaza hacia un lado mientras brilla.
      const t = this.calm ? 0.17 : (time / s.period + s.phase) % 1;
      if (t > 0.34) continue;
      const k = Math.sin((t / 0.34) * Math.PI);
      g.fillStyle(SPARK, 0.12 + 0.4 * k).fillRect(s.x + (this.calm ? 0 : Math.floor(t * 8 * s.drift)), s.y, s.w, 1);
    }
    if (!this.glow) return;
    const night = nightAt(this.hour());
    const out = this.glow.clear();
    if (night < 0.12) return;
    for (const lamp of this.lamps) {
      if (lamp.x < view.x - 2 * TILE || lamp.x > view.right + 2 * TILE || lamp.top > view.bottom + TILE || lamp.top + REFLECT_ROWS * 4 < view.y) continue;
      // Una columna de trazos que se ensancha, se parte y se apaga hacia abajo, ondulando con el agua.
      for (let i = 0; i < REFLECT_ROWS; i++) {
        const y = lamp.top + 2 + i * 4;
        const sway = this.calm ? 0 : Math.sin(time / 520 + i * 0.9 + lamp.phase * 6.28) * 1.6;
        const w = 3 + (i % 3) * 2;
        const a = night * 0.85 * (1 - i / REFLECT_ROWS) * (0.6 + 0.4 * wave(time, 900, lamp.phase + i * 0.17));
        out.fillStyle(GLOW, a).fillRect(Math.round(lamp.x - w / 2 + sway), y, w, 2);
      }
    }
  }
}
