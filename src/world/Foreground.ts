import Phaser from 'phaser';
import { TILE } from '../config/constants';
import { QUALITY } from '../config/quality';
import type { LocationDef } from '../types/game';
import { make, px, shade, type Ctx } from './paint';
import { LAMP_LIGHT } from './LampShadows';

/**
 * Primer plano (LocationDef.foreground): copas de árbol que asoman por el
 * borde de la cámara, más cerca de ella que la calle. Van con paralaje (se
 * mueven un 15 % más deprisa que el mundo) y por encima de todo, teñidas con
 * el color del cielo de la hora: de día, verde en sombra; de noche, siluetas
 * que tapan las ventanas encendidas de detrás.
 * Si tapan al jugador, casi desaparecen. Pocas y en las esquinas:
 * dan profundidad, no estorban. En calidad baja no se ponen.
 */

/** Por encima de todo: del mundo, de la luz de la hora y de lo que brilla (lo más cerca de la cámara). */
const DEPTH = 900_010;
const PARALLAX = 1.15;

const LEAF = ['#1f3a22', '#284a2a', '#325a31', '#3f6b39'] as const;

/** Masa de hojas por lóbulos: oscura abajo, un poco de luz del noroeste en los de arriba, borde recortado. */
function drawCanopy(ctx: Ctx, w: number, h: number, seed: number): void {
  const r = (k: number): number => {
    const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const lobes: [number, number, number][] = [];
  for (let k = 0; k < 26; k++) lobes.push([w * (0.08 + r(k) * 0.84), h * (0.18 + r(k + 50) * 0.7), Math.min(w, h) * (0.14 + r(k + 90) * 0.16)]);
  lobes.sort((a, b) => a[1] - b[1]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let inside = -1;
      for (let i = lobes.length - 1; i >= 0; i--) {
        const [lx, ly, lr] = lobes[i];
        if (Math.hypot(x - lx, (y - ly) * 1.15) < lr) {
          inside = i;
          break;
        }
      }
      if (inside < 0) continue;
      const [lx, ly, lr] = lobes[inside];
      // Luz dentro de cada lóbulo: más clara arriba a la izquierda, más oscura abajo; y la copa entera, más oscura abajo.
      const light = (lx - x + (ly - y)) / (lr * 2) + (0.5 - y / h) * 0.6;
      const noise = r(x * 7 + y * 131) * 0.35;
      const i = Math.max(0, Math.min(LEAF.length - 1, Math.floor((light + noise + 0.4) * 2.2)));
      px(ctx, LEAF[i], x, y);
    }
  }
  // Racimos de luz sueltos en la parte alta de los lóbulos.
  for (let k = 0; k < 14; k++) {
    const [lx, ly, lr] = lobes[Math.floor(r(k + 300) * lobes.length)];
    px(ctx, shade(LEAF[3], 0.12), Math.round(lx - lr * 0.4), Math.round(ly - lr * 0.5), 2, 1);
  }
}

export class ForegroundView {
  private readonly items: { img: Phaser.GameObjects.Image; x: number; y: number }[] = [];
  private readonly scene: Phaser.Scene;
  private readonly ref: { x: number; y: number };
  private placed = false;

  constructor(scene: Phaser.Scene, def: LocationDef) {
    this.scene = scene;
    const s = def.showcase;
    this.ref = s ? { x: (s.tx + s.w / 2) * TILE, y: (s.ty + s.h / 2) * TILE } : { x: 0, y: 0 };
    if (!def.foreground || QUALITY.level === 'low') return;
    make(scene, 'fg-canopy', 104, 58, (ctx) => drawCanopy(ctx, 104, 58, 3));
    make(scene, 'fg-canopy-small', 64, 36, (ctx) => drawCanopy(ctx, 64, 36, 11));
    for (const f of def.foreground) {
      const img = scene.add.image(0, 0, `fg-${f.kind}`).setDepth(DEPTH).setScrollFactor(PARALLAX).setFlipX(!!f.flip);
      this.items.push({ img, x: f.x, y: f.y });
    }
  }

  /** Cada frame: su sitio con el paralaje (una vez hecho el encuadre) y, si tapa al jugador, casi transparente. */
  update(player: { x: number; y: number }, delta: number): void {
    if (this.items.length === 0) return;
    const cam = this.scene.cameras.main;
    if (!this.placed) {
      // Con la cámara centrada en la escena, cada copa se ve donde dicen los datos.
      const scrollX = this.ref.x - cam.width / 2;
      const scrollY = this.ref.y - cam.height / 2;
      for (const it of this.items) it.img.setPosition(it.x + scrollX * (PARALLAX - 1), it.y + scrollY * (PARALLAX - 1));
      this.placed = true;
    }
    // Dónde se ve el jugador y dónde cada copa, en la misma escala de pantalla.
    const psx = (player.x - cam.scrollX) * cam.zoom;
    const psy = (player.y - 12 - cam.scrollY) * cam.zoom;
    // Más cerca de la cámara, algo más oscuro que la calle: el cielo de la hora, un punto más apagado.
    const tint = LAMP_LIGHT.sky;
    const sky = (((tint >> 16) & 255) * 0.82) << 16 | (((tint >> 8) & 255) * 0.82) << 8 | ((tint & 255) * 0.86);
    for (const it of this.items) {
      const img = it.img.setTint(sky);
      const sx = (img.x - cam.scrollX * PARALLAX) * cam.zoom;
      const sy = (img.y - cam.scrollY * PARALLAX) * cam.zoom;
      const hw = (img.width / 2) * cam.zoom;
      const hh = (img.height / 2) * cam.zoom;
      const covers = Math.abs(psx - sx) < hw && Math.abs(psy - sy) < hh;
      // Si tapa al jugador, casi desaparece: a medias, una masa de hojas se lee como una mancha.
      const target = covers ? 0.15 : 1;
      img.setAlpha(img.alpha + (target - img.alpha) * Math.min(1, delta / 150));
    }
  }
}
