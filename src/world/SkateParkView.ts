import type Phaser from 'phaser';
import { TILE } from '../config/constants';
import { BIKES } from '../data/bikes';
import { PASSENGER_LOOKS } from '../data/npcs';
import type { LocationDef } from '../types/game';
import { RIDER_H, RIDER_STOPPED, RIDER_W, riderTexture, skateFrame } from './CyclistArt';
import { phaseOf } from './Motion';

/**
 * La zona de skate de una calle (LocationDef.skate): unos cuantos patinadores que
 * ruedan de un lado a otro de la franja, empujan de vez en cuando con el pie de
 * atrás, se paran un instante en cada extremo y se dan la vuelta. Son los mismos
 * patinadores que van por el carril bici (world/CyclistArt: de pie sobre la tabla,
 * sin pasos de andar), pero aquí no cruzan el mapa: se quedan a hacer vueltas.
 *
 * Todo es función del tiempo y de la semilla de cada uno: ni estado ni
 * temporizadores. Cuántos hay depende de la hora: un par a mediodía, más por la
 * tarde y casi ninguno de madrugada.
 */

interface Rider {
  image: Phaser.GameObjects.Image;
  seed: number;
  /** Ms que tarda en ir y volver. */
  period: number;
  phase: number;
}

const SKATER = BIKES.find((b) => b.frame === 'skate');

/** Cuántos patinan a esa hora (de 0 al total). */
const crowdAt = (hour: number, total: number): number =>
  hour >= 16 && hour < 22 ? total : hour >= 22 && hour < 24 ? Math.ceil(total / 2) : hour >= 11 && hour < 16 ? Math.ceil(total / 2) : 0;

export class SkateParkView {
  private readonly riders: Rider[] = [];
  private readonly hour: () => number;
  private readonly a: number;
  private readonly b: number;
  private readonly bottom: number;

  constructor(scene: Phaser.Scene, def: LocationDef, hour: () => number) {
    this.hour = hour;
    const park = def.skate;
    this.a = (park?.tx0 ?? 0) * TILE;
    this.b = (park?.tx1 ?? 0) * TILE;
    this.bottom = (park?.row ?? 0) * TILE + TILE - 1;
    if (!park || !SKATER) return;
    const total = park.riders ?? 3;
    for (let i = 0; i < total; i++) {
      const seed = park.tx0 * 13 + park.row * 7 + i * 29;
      const look = PASSENGER_LOOKS[Math.floor(phaseOf(seed) * PASSENGER_LOOKS.length)];
      const key = riderTexture(scene, { look, bike: SKATER, color: i % SKATER.colors.length, helmet: false, pack: false });
      this.riders.push({
        image: scene.add.image(0, 0, key, 0).setOrigin(0, 0).setVisible(false),
        seed,
        period: 15_000 + Math.floor(phaseOf(seed + 3) * 9_000),
        phase: phaseOf(seed * 3 + 1),
      });
    }
  }

  update(time: number): void {
    const n = crowdAt(this.hour(), this.riders.length);
    const span = this.b - this.a;
    this.riders.forEach((r, i) => {
      const on = i < n;
      r.image.setVisible(on);
      if (!on) return;
      // Ida y vuelta: u recorre 0..1 y la posición sube y baja por la franja.
      const u = (time / r.period + r.phase) % 1;
      const tri = u < 0.5 ? u * 2 : 2 - u * 2;
      const dir = u < 0.5 ? 1 : -1;
      // Al llegar a cada extremo se para un instante antes de darse la vuelta.
      const resting = tri < 0.04 || tri > 0.96;
      const x = this.a + tri * span;
      const frame = resting ? RIDER_STOPPED : skateFrame(u * 2 * span, r.seed);
      r.image
        .setFrame(frame)
        .setFlipX(dir < 0)
        .setPosition(Math.round(x - RIDER_W / 2), this.bottom - RIDER_H)
        .setDepth(this.bottom);
    });
  }
}
