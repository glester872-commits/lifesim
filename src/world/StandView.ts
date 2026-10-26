import Phaser from 'phaser';
import { TILE } from '../config/constants';
import { QUALITY } from '../config/quality';
import { ARENA_CLUB } from '../data/cityEvents';
import { RIVAL_KITS } from '../data/matchPlay';
import { APRON_TILES, FLAG_TILES, SIDE_TILES, STAND_BUDGET } from '../data/standLife';
import { hashSeed } from '../systems/MetroDaily';
import type { Chant, StandMood } from '../systems/StandLife';
import { LAYER } from './Layers';
import { make, px, shade, sprinkle, type Ctx } from './paint';

/**
 * El resto del estadio, lo que asoma por los lados de la cámara (data/standLife.ts SIDE_TILES): los fondos junto al
 * césped y la tribuna que sigue a izquierda y derecha. No es gente: un bloque horneado por lado con seis dibujos
 * (vacío, a medias, en calma y su vaivén, de pie y con las bufandas arriba) que se cambian según el humor de la grada
 * (systems/StandLife). Dos imágenes y unas pocas banderas (STAND_BUDGET), nada que se simule.
 *
 * En el fondo de la derecha, una esquina con los colores del rival: los que vienen con él.
 */
type Frame = 'empty' | 'half' | 'calm0' | 'calm1' | 'up' | 'scarves';
const ROWS = 24;
const STEP = '#a9afb3';
const WALL = '#6d7378';
const [TEAL, ORANGE] = ARENA_CLUB.home;
const SKINS = ['#e0b08c', '#c48a64', '#8d5a3c', '#f0c8a8'];
const NEUTRAL = ['#3d4a5c', '#6b5a48', '#e9e4da', '#2b2b33', '#7a8f6a', '#9a4f5c'];

const unit = (...parts: (string | number)[]): number => (hashSeed(...parts) % 1000) / 1000;

function drawBlock(ctx: Ctx, side: 'L' | 'R', frame: Frame, away: string | null): void {
  const w = SIDE_TILES * TILE;
  // Gradas de hormigón hasta el muro (y 17) y, debajo, el muro del vestíbulo.
  for (let ty = 0; ty < 17; ty++) {
    px(ctx, STEP, 0, ty * TILE, w, TILE);
    sprinkle(ctx, shade(STEP, -0.05), w, TILE, 71 + ty, 14);
    for (let y = ty * TILE; y < (ty + 1) * TILE; y += 8) px(ctx, shade(STEP, -0.2), 0, y + 6, w, 2);
  }
  px(ctx, shade(TEAL, -0.2), 0, 7 * TILE + 4, w, 8);
  px(ctx, WALL, 0, 17 * TILE, w, (ROWS - 17) * TILE);
  px(ctx, shade(WALL, 0.12), 0, 17 * TILE, w, 1);
  if (frame === 'empty') return;
  const fill = frame === 'half' ? 0.5 : 0.93;
  // Una cabeza cada 4 px y una fila cada 8 (sentados en su escalón), menos en la valla (y 7).
  for (let y = 4; y < 17 * TILE; y += 8) {
    if (Math.floor(y / TILE) === 7) continue;
    // Una fila sí y otra no, medio hueco a un lado: sin la rejilla de lunares.
    for (let x = 1 + ((y >> 3) % 2) * 2; x < w - 2; x += 4) {
      const id = `${side}:${x}:${y}`;
      if (unit('seat', id) >= fill) continue;
      // Del rival, una esquina del fondo de la derecha; los demás, del Halcón casi todos.
      const visitor = !!away && side === 'R' && y < 7 * TILE && x > w / 2;
      const r = unit('shirt', id);
      const shirt = visitor && away ? away : r < 0.4 ? TEAL : r < 0.6 ? ORANGE : NEUTRAL[Math.floor(unit('neutral', id) * NEUTRAL.length)];
      const skin = SKINS[Math.floor(unit('skin', id) * SKINS.length)];
      const sway = frame === 'calm1' && unit('sway', id) < 0.35 ? 1 : 0;
      const stood = frame === 'up' || frame === 'scarves';
      const top = y - (stood ? 2 : 0);
      px(ctx, shirt, x + sway, top + 2, 3, stood ? 4 : 3);
      px(ctx, shade(shirt, -0.2), x + sway, top + 4, 3, 1);
      px(ctx, skin, x + sway + 1, top, 2, 2);
      if (frame === 'up' && unit('arms', id) < 0.6) {
        px(ctx, skin, x + sway, top - 2, 1, 2);
        px(ctx, skin, x + sway + 2, top - 2, 1, 2);
      }
      // La bufanda en alto, con los brazos: los de casa con la suya.
      if (frame === 'scarves' && !visitor && r < 0.6 && unit('scarf', id) < 0.8) {
        px(ctx, TEAL, x + sway - 1, top - 2, 3, 1);
        px(ctx, ORANGE, x + sway + 2, top - 2, 2, 1);
      }
    }
  }
}

function drawFlag(ctx: Ctx, color: string, stripe: string, v: number): void {
  px(ctx, '#3a3d42', 0, 0, 1, 12);
  // Ondea: la tela cae un píxel distinto en cada dibujo.
  for (let x = 1; x < 9; x++) {
    const dy = (x + v) % 3 === 0 ? 1 : 0;
    px(ctx, color, x, dy, 1, 6);
    px(ctx, stripe, x, dy + 2, 1, 2);
  }
}

export class StandView {
  private readonly blocks: Phaser.GameObjects.Image[];
  private readonly flags: Phaser.GameObjects.Image[] = [];
  private readonly scene: Phaser.Scene;
  private readonly reduced: boolean;
  private rival = '';
  private frame: Frame | null = null;

  constructor(scene: Phaser.Scene, mapWidthPx: number, reduced: boolean) {
    this.scene = scene;
    this.reduced = reduced;
    const w = SIDE_TILES * TILE;
    this.blocks = [-w, mapWidthPx].map((x) => scene.add.image(x, 0, '__DEFAULT').setOrigin(0, 0).setDepth(LAYER.decal).setVisible(false));
    // Arriba y abajo, el muro del recinto de lado a lado: una pantalla alta no ve el vacío por encima del césped.
    const apronW = mapWidthPx + 2 * w;
    const apronH = APRON_TILES * TILE;
    make(scene, `stand-apron-${apronW}`, apronW, apronH, (ctx) => {
      px(ctx, WALL, 0, 0, apronW, apronH);
      sprinkle(ctx, shade(WALL, -0.06), apronW, apronH, 97, 40);
    });
    for (const y of [-apronH, ROWS * TILE]) scene.add.image(-w, y, `stand-apron-${apronW}`).setOrigin(0, 0).setDepth(LAYER.decal);
    for (let v = 0; v < 2; v++) {
      make(scene, `stand-flag-home-${v}`, 9, 12, (ctx) => drawFlag(ctx, TEAL, ORANGE, v));
      make(scene, `stand-flag-orange-${v}`, 9, 12, (ctx) => drawFlag(ctx, ORANGE, TEAL, v));
    }
    const n = STAND_BUDGET[QUALITY.level].flags;
    for (let i = 0; i < n; i++) {
      const left = i % 2 === 0;
      const k = Math.floor(i / 2);
      const x = left ? -FLAG_TILES * TILE + 12 + k * 26 : mapWidthPx + 10 + k * 22;
      this.flags.push(scene.add.image(x, 18 + ((k * 37) % 60), 'stand-flag-home-0').setOrigin(0, 1).setDepth(LAYER.decal + 0.5).setVisible(false));
    }
  }

  /** Objetos que pinta (para medir): siempre los mismos. */
  get objects(): number {
    return this.blocks.length + this.flags.length;
  }

  get shown(): string | null {
    return this.frame;
  }

  update(mood: StandMood, chant: Chant | null, rival: string, now: number): void {
    const frame = this.frameOf(mood, chant, now);
    if (rival !== this.rival) {
      this.rival = rival;
      this.frame = null;
    }
    if (frame !== this.frame) {
      this.frame = frame;
      const kit = RIVAL_KITS[rival];
      this.blocks.forEach((b, i) => {
        const side = i === 0 ? 'L' : 'R';
        // Se hornea la primera vez que hace falta y se queda en caché (make no repite una textura que ya existe).
        const key = `stand-${side}-${side === 'R' ? (kit?.code ?? 'XXX') : 'H'}-${frame}`;
        make(this.scene, key, SIDE_TILES * TILE, ROWS * TILE, (ctx) => drawBlock(ctx, side, frame, kit?.shirt ?? null));
        b.setTexture(key).setVisible(true);
      });
    }
    // Las banderas, sólo con el partido en marcha (o celebrándolo); cada una a su ritmo.
    const flying = mood.kind !== 'off' && mood.kind !== 'break' && frame !== 'half';
    const sway = STAND_BUDGET[QUALITY.level].swayMs;
    this.flags.forEach((f, i) => {
      const v = this.reduced ? 0 : Math.floor((now + i * 311) / (sway / 2)) % 2;
      const key = i % 3 === 1 ? `stand-flag-orange-${v}` : `stand-flag-home-${v}`;
      f.setTexture(key).setVisible(flying);
    });
  }

  /** El dibujo de cada momento: vacío fuera de hora, a medias al llenarse, en el descanso y al irse. */
  private frameOf(m: StandMood, chant: Chant | null, now: number): Frame {
    const sway = STAND_BUDGET[QUALITY.level].swayMs;
    const beat = (a: Frame, b: Frame, ms: number): Frame => (this.reduced || Math.floor(now / ms) % 2 === 0 ? a : b);
    switch (m.kind) {
      case 'off': return 'empty';
      case 'break': return m.id.endsWith(':after') && m.since > 20 ? 'empty' : 'half';
      case 'goal': return m.side === 'home' ? (m.strength > 0.4 ? beat('up', 'scarves', 600) : 'scarves') : 'calm0';
      case 'attack': return m.side === 'home' && m.strength > 0.6 ? 'up' : 'calm0';
      case 'miss': return 'calm0';
      case 'final': return m.side === 'home' ? beat('up', 'scarves', 600) : m.side === 'away' ? 'half' : 'calm0';
      default:
        // Antes del saque la grada se va llenando; con el balón en juego, el vaivén y los cánticos.
        if (m.id.endsWith(':pre') && m.since < 45) return 'half';
        if (chant?.by === 'home') return beat('scarves', 'calm0', 560);
        return beat('calm0', 'calm1', sway);
    }
  }
}
