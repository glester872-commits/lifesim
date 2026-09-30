import Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { LocationDef } from '../types/game';
import type { Weather } from '../systems/Weather';
import { make, px, shade } from './paint';
import { EMISSIVE_DEPTH, nightAt } from './Lighting';
import { UMBRELLAS } from './WeatherLooks';
import { LAYER } from './Layers';

/**
 * El tiempo que se ve en la calle (sólo fuera: dentro no llueve). Todo sale de
 * systems/Weather.ts y del suelo del mapa, sin nada escrito a mano:
 *
 * - lluvia: trazos inclinados en un pozo fijo, sólo alrededor de la cámara;
 *   cuántos, según la intensidad;
 * - salpicaduras donde cae cada gota y goteo al pie de las fachadas;
 * - charcos donde el agua se queda (cunetas junto al bordillo, adoquín de
 *   plaza), que aparecen con el suelo mojado, se secan despacio y hacen ondas
 *   mientras llueve;
 * - con mucho frío, el vaho de la gente.
 *
 * El suelo oscuro y los brillos del mojado son de world/Lighting (mapa de luz y
 * reflejos): aquí no se oscurece nada. Sin bloom ni reflejos a pantalla completa.
 */

/** Gotas como mucho en pantalla, con chaparrón en una ventana grande. */
const MAX_DROPS = 260;
const MAX_SPLASHES = 48;
/** Caída en px/s y viento hacia el este. */
const FALL: readonly [number, number] = [300, 420];
const WIND = 70;
const SPLASH_MS = 220;

const UMBRELLA_COLORS = ['#1f2029', '#b8423a', '#2f4a8c', '#e0b23a', '#3f7a5a', '#e6e0d4'] as const;

/** Texturas del tiempo: gota, salpicadura, onda, charcos, vaho y paraguas. Una vez, al arrancar. */
export function buildWeatherTextures(scene: Phaser.Scene): void {
  make(scene, 'fx-rain', 2, 7, (ctx) => {
    px(ctx, '#ffffff', 1, 0, 1, 2);
    px(ctx, '#ffffff', 0, 2, 1, 5);
  });
  make(scene, 'fx-splash', 7, 3, (ctx) => {
    px(ctx, '#ffffff', 0, 2, 1, 1);
    px(ctx, '#ffffff', 2, 0, 1, 2);
    px(ctx, '#ffffff', 4, 0, 1, 2);
    px(ctx, '#ffffff', 6, 2, 1, 1);
  });
  make(scene, 'fx-ripple', 9, 5, (ctx) => {
    px(ctx, '#ffffff', 2, 0, 5, 1);
    px(ctx, '#ffffff', 0, 1, 2, 3);
    px(ctx, '#ffffff', 7, 1, 2, 3);
    px(ctx, '#ffffff', 2, 4, 5, 1);
  });
  make(scene, 'fx-puff', 4, 3, (ctx) => {
    px(ctx, '#ffffff', 1, 0, 2, 1);
    px(ctx, '#ffffff', 0, 1, 4, 1);
    px(ctx, '#ffffff', 1, 2, 2, 1);
  });
  // Charcos: agua que refleja el cielo, no un agujero. Borde mojado más oscuro que el suelo, el agua
  // gris azulada, una franja de cielo en diagonal y el canto de luz arriba a la izquierda. Escalonado, sin degradado.
  const puddle = (key: string, w: number, h: number): void =>
    make(scene, key, w, h, (ctx) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const d = Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2));
          if (d >= 1) continue;
          const rim = d > 0.74 && (y < h / 2 || x < w / 3);
          // El cielo se refleja en una banda que cruza en diagonal, más ancha que un píxel.
          const band = Math.abs((x / w) * 1.6 - y / h - 0.35) < 0.18 && d < 0.8;
          px(ctx, rim ? '#9fb0c6' : d > 0.84 ? '#2c3444' : band ? '#6f7e98' : '#465269', x, y);
        }
      }
    });
  puddle('fx-puddle-0', 22, 8);
  puddle('fx-puddle-1', 30, 10);
  puddle('fx-puddle-2', 14, 6);
  // Paraguas vistos desde arriba y un poco de frente: cúpula lisa, o a gajos de dos colores.
  for (let i = 0; i < UMBRELLAS; i++) {
    make(scene, `fx-umbrella-${i}`, 18, 9, (ctx) => {
      const c = UMBRELLA_COLORS[i];
      const striped = i >= 3;
      const rows: readonly [number, number][] = [[6, 6], [3, 12], [1, 16], [0, 18], [0, 18], [1, 16]];
      rows.forEach(([x, w], y) => {
        for (let k = 0; k < w; k++) {
          const seg = Math.floor(((x + k) / 18) * 4);
          const base = striped && seg % 2 === 1 ? shade(c, -0.28) : c;
          px(ctx, y === 0 || k === 0 ? shade(base, 0.14) : k === w - 1 ? shade(base, -0.16) : base, x + k, y);
        }
      });
      for (const x of [4, 9, 13]) px(ctx, shade(c, -0.2), x, 3, 1, 3);
      px(ctx, shade(c, -0.25), 1, 6, 16, 1);
      px(ctx, '#1c1620', 9, 7, 1, 2);
    });
  }
}

interface Drop {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  /** Dónde toca el suelo (px de mundo). */
  floor: number;
}

interface Burst {
  img: Phaser.GameObjects.Image;
  left: number;
  life: number;
  rise: number;
}

/** Hash de un tile: dónde se forma un charco es siempre el mismo sitio. */
const tileHash = (x: number, y: number): number => ((Math.imul((x * 73856093) ^ (y * 19349663), 2654435761) >>> 0) % 10000) / 10000;

export class WeatherView {
  private readonly scene: Phaser.Scene;
  private readonly weather: () => Weather;
  private readonly hour: () => number;
  private readonly drops: Drop[] = [];
  private readonly bursts: Burst[] = [];
  private readonly puddles: Phaser.GameObjects.Image[] = [];
  private readonly facades: { x: number; w: number; y: number }[] = [];
  private readonly people: () => readonly Phaser.GameObjects.Sprite[];
  private dripClock = 0;
  private rippleClock = 0;
  private breathClock = 0;

  constructor(scene: Phaser.Scene, def: LocationDef, weather: () => Weather, hour: () => number, people: () => readonly Phaser.GameObjects.Sprite[]) {
    this.scene = scene;
    this.weather = weather;
    this.hour = hour;
    this.people = people;
    this.placePuddles(def);
    // Goteo: al pie de las fachadas que dan al sur (el alero, el toldo), sobre la acera.
    for (const b of def.buildings ?? []) if (b.front === 's') this.facades.push({ x: b.tx * TILE, w: b.w * TILE, y: (b.ty + b.h) * TILE + 2 });
    this.update(0);
  }

  /**
   * Charcos donde el agua se queda: la cuneta (calzada pegada al bordillo) y el
   * adoquín de las plazas y los caminos. Pocos y siempre los mismos.
   */
  private placePuddles(def: LocationDef): void {
    const g = def.ground;
    const at = (x: number, y: number): string => g[y]?.[x] ?? '';
    const covered = new Set<string>();
    for (const b of def.buildings ?? []) for (let y = b.ty; y < b.ty + b.h; y++) for (let x = b.tx; x < b.tx + b.w; x++) covered.add(`${x},${y}`);
    for (let y = 1; y < g.length - 1; y++) {
      for (let x = 1; x < g[y].length - 1; x++) {
        if (covered.has(`${x},${y}`)) continue;
        const ch = at(x, y);
        const gutter = (ch === '.' || ch === 'b') && [',', 'P', 'c', '~'].some((s) => at(x, y - 1) === s || at(x, y + 1) === s);
        const paving = ch === 'P' || ch === '~' || ch === 'c';
        const r = tileHash(x, y);
        if (!((gutter && r < 0.05) || (paving && r < 0.014))) continue;
        const kind = Math.floor(tileHash(y, x) * 3);
        this.puddles.push(this.scene.add.image(x * TILE + TILE / 2, y * TILE + TILE / 2, `fx-puddle-${kind}`).setDepth(LAYER.decal).setAlpha(0).setVisible(false));
      }
    }
  }

  private burst(key: string, x: number, y: number, life: number, alpha: number, depth: number, rise = 0): void {
    let b = this.bursts.find((s) => s.left <= 0);
    if (!b) {
      if (this.bursts.length >= MAX_SPLASHES) return;
      b = { img: this.scene.add.image(0, 0, key), left: 0, life, rise };
      this.bursts.push(b);
    }
    b.img.setTexture(key).setPosition(x, y).setDepth(depth).setAlpha(alpha).setVisible(true);
    b.left = life;
    b.life = life;
    b.rise = rise;
  }

  update(deltaMs: number): void {
    const w = this.weather();
    const night = nightAt(this.hour());
    const view = this.scene.cameras.main.worldView;
    const dt = Math.min(deltaMs, 100) / 1000;

    // Charcos: se llenan con el suelo mojado y se secan con él.
    const puddle = Phaser.Math.Clamp((w.wet - 0.2) / 0.5, 0, 1);
    for (const p of this.puddles) p.setVisible(puddle > 0.02).setAlpha(puddle * 0.8);

    // Gotas: tantas como pide la lluvia para el trozo de ciudad que se ve.
    const area = Math.min(1.4, (view.width * view.height) / (480 * 270));
    const wanted = Math.round(MAX_DROPS * area * Math.min(1, w.rain * 1.15));
    const tint = night > 0.5 ? 0x9fb0cc : 0xdfe7f2;
    const alpha = (night > 0.5 ? 0.32 : 0.42) * (0.6 + 0.4 * Math.min(1, w.rain * 1.5));
    while (this.drops.length < wanted) {
      const d: Drop = { img: this.scene.add.image(0, 0, 'fx-rain').setDepth(EMISSIVE_DEPTH - 1).setOrigin(0.5, 1), vx: 0, vy: 0, floor: 0 };
      this.respawn(d, view, true);
      this.drops.push(d);
    }
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      if (i >= wanted) {
        d.img.setVisible(false);
        continue;
      }
      d.img.setVisible(true).setTint(tint).setAlpha(alpha);
      d.img.x += d.vx * dt;
      d.img.y += d.vy * dt;
      if (d.img.y >= d.floor) {
        // Una de cada tres deja salpicadura: con todas, el suelo parecería hervir.
        if (Math.random() < 0.35) this.burst('fx-splash', d.img.x, d.floor, SPLASH_MS, alpha * 1.3, d.floor);
        this.respawn(d, view, false);
      } else if (d.img.x > view.right + 20 || d.img.y > view.bottom + 20) this.respawn(d, view, false);
    }

    if (w.rain > 0.08) {
      // Goteo de aleros y toldos que se ven.
      this.dripClock -= deltaMs;
      if (this.dripClock <= 0) {
        this.dripClock = 700 / (0.3 + w.rain);
        const seen = this.facades.filter((f) => f.y > view.y && f.y < view.bottom && f.x + f.w > view.x && f.x < view.right);
        const f = seen[Math.floor(Math.random() * seen.length)];
        if (f) this.burst('fx-splash', f.x + Math.random() * f.w, f.y, SPLASH_MS, 0.5, f.y);
      }
      // Ondas en los charcos a la vista.
      this.rippleClock -= deltaMs;
      if (this.rippleClock <= 0 && puddle > 0.1) {
        this.rippleClock = 260 / (0.3 + w.rain);
        const seen = this.puddles.filter((p) => view.contains(p.x, p.y));
        const p = seen[Math.floor(Math.random() * seen.length)];
        if (p) this.burst('fx-ripple', p.x + (Math.random() - 0.5) * p.width * 0.5, p.y + (Math.random() - 0.5) * p.height * 0.4, 420, 0.35, -8);
      }
    }

    // Vaho: con mucho frío, a quien se ve se le escapa una nube pequeña de vez en cuando.
    this.breathClock -= deltaMs;
    if (w.celsius < 7 && this.breathClock <= 0) {
      this.breathClock = 350;
      const near = this.people().filter((s) => s.visible && view.contains(s.x, s.y));
      const s = near[Math.floor(Math.random() * near.length)];
      if (s) this.burst('fx-puff', s.x + (s.flipX ? -3 : 3), s.y - 19, 700, 0.55, s.y + 3, 10);
    }

    for (const b of this.bursts) {
      if (b.left <= 0) continue;
      b.left -= deltaMs;
      if (b.left <= 0) {
        b.img.setVisible(false);
        continue;
      }
      b.img.setAlpha(b.img.alpha * 0.92);
      if (b.rise) b.img.y -= (b.rise * deltaMs) / b.life;
    }
  }

  /** Una gota nueva arriba de la vista (o en cualquier punto al empezar), con su suelo debajo. */
  private respawn(d: Drop, view: Phaser.Geom.Rectangle, anywhere: boolean): void {
    const x = view.x - 60 + Math.random() * (view.width + 60);
    const floor = view.y + Math.random() * (view.height + 30);
    const y = anywhere ? floor - Math.random() * view.height : view.y - 10 - Math.random() * 40;
    d.vy = FALL[0] + Math.random() * (FALL[1] - FALL[0]);
    d.vx = WIND * (0.8 + Math.random() * 0.4);
    d.floor = Math.max(floor, y + 8);
    d.img.setPosition(x, y);
  }
}
