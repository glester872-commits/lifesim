import Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { LocationDef, Vec2 } from '../types/game';
import { PROPS } from './tiles';
import { doorRow } from '../systems/LocationSystem';

/**
 * Lo poco que se mueve solo en una calle: coches que pasan y ceden el paso,
 * el agua de una fuente y las puertas de cristal que se abren al acercarse.
 * Todo sale de los datos (traffic, PropDef.ambient, puertas de cristal con
 * interior); no hay ni una comprobación de localización.
 *
 * Los peatones llegan como posiciones de pies: hoy sólo el jugador; los NPC
 * se sumarán a la misma lista sin tocar el tráfico ni las puertas.
 */

const CAR_KEYS = ['prop-car', 'prop-car-b', 'prop-car-c'] as const;
const CAR_W = TILE * 2;
/** px/s. Despacio: es una calle de barrio, no una autopista. */
const CRUISE = 46;
/** Distancia a la que un coche empieza a frenar por un peatón o por el de delante. */
const BRAKE_PX = TILE * 3;
const DOOR_RANGE = TILE * 1.6;

interface Car {
  sprite: Phaser.GameObjects.Image;
  row: number;
  dir: 1 | -1;
  speed: number;
}

interface AutoDoor {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  open: boolean;
}

export class Ambience {
  private readonly scene: Phaser.Scene;
  private readonly widthPx: number;
  private readonly pedestrians: () => readonly Vec2[];
  private readonly cars: Car[] = [];
  private readonly doors: AutoDoor[] = [];

  constructor(scene: Phaser.Scene, def: LocationDef, widthPx: number, pedestrians: () => readonly Vec2[]) {
    this.scene = scene;
    this.widthPx = widthPx;
    this.pedestrians = pedestrians;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    // Coches repartidos a lo largo del carril, cada uno a su ritmo.
    let n = 0;
    for (const lane of def.traffic?.lanes ?? []) {
      const count = def.traffic?.carsPerLane ?? 0;
      for (let i = 0; i < count; i++) {
        const x = ((i + 0.5) / count) * widthPx + (n % 3) * TILE * 2;
        const y = lane.row * TILE + TILE;
        const sprite = scene.add.image(x, y, CAR_KEYS[n % CAR_KEYS.length]).setOrigin(0.5, 1).setDepth(y);
        sprite.setFlipX(lane.dir < 0);
        this.cars.push({ sprite, row: lane.row, dir: lane.dir, speed: CRUISE * (0.85 + (n % 4) * 0.08) });
        n++;
      }
    }

    // El agua: un chorro que respira despacio. Con movimiento reducido, quieto.
    for (const p of def.props) {
      const prop = PROPS[p.kind];
      if (prop.ambient !== 'spray') continue;
      const x = p.tx * TILE + ((prop.tilesWide ?? 1) * TILE) / 2;
      const y = (p.ty + 1 - prop.tilesHigh) * TILE + 6;
      const spray = scene.add.image(x, y, 'fx-spray').setOrigin(0.5, 1).setDepth((p.ty + 1) * TILE + 1);
      if (!calm) {
        scene.tweens.add({ targets: spray, scaleY: { from: 0.75, to: 1.2 }, alpha: { from: 0.7, to: 1 }, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    }

    // Puertas de cristal con interior: se abren cuando alguien llega a ellas.
    for (const b of def.buildings ?? []) {
      if (!b.enter || b.doorX === undefined || !scene.textures.exists(`bs-${b.style}-door-open`)) continue;
      const row = doorRow(b);
      const sprite = scene.add.image(b.doorX * TILE, row * TILE, `bs-${b.style}-door-open`).setOrigin(0, 0).setDepth(-9).setAlpha(0);
      this.doors.push({ sprite, x: b.doorX * TILE + TILE / 2, y: (row + 1) * TILE, open: false });
    }
  }

  update(deltaMs: number): void {
    if (this.cars.length === 0 && this.doors.length === 0) return;
    const dt = Math.min(deltaMs, 100) / 1000;
    const people = this.pedestrians();

    for (const car of this.cars) {
      const s = car.sprite;
      const front = s.x + car.dir * (CAR_W / 2);
      const top = car.row * TILE;
      let target = CRUISE;
      // Cede a cualquiera que esté en su carril delante de él (pies dentro del carril).
      for (const p of people) {
        const ahead = (p.x - front) * car.dir;
        if (p.y > top && p.y < top + TILE + 8 && ahead > -6 && ahead < BRAKE_PX) target = 0;
      }
      // Y guarda la distancia con el de delante.
      for (const other of this.cars) {
        if (other === car || other.row !== car.row) continue;
        const gap = (other.sprite.x - s.x) * car.dir - CAR_W;
        if (gap > 0 && gap < BRAKE_PX) target = Math.min(target, other.speed * 0.9);
      }
      car.speed += (target - car.speed) * Math.min(1, dt * (target < car.speed ? 6 : 1.5));
      s.x += car.dir * car.speed * dt;
      // Sale por un lado y vuelve a entrar por el otro, fuera de cámara.
      if (car.dir > 0 && s.x > this.widthPx + CAR_W) s.x = -CAR_W;
      if (car.dir < 0 && s.x < -CAR_W) s.x = this.widthPx + CAR_W;
    }

    for (const door of this.doors) {
      const near = people.some((p) => Math.abs(p.x - door.x) < DOOR_RANGE && Math.abs(p.y - door.y) < DOOR_RANGE);
      if (near === door.open) continue;
      door.open = near;
      this.scene.tweens.killTweensOf(door.sprite);
      // Abrir responde rápido; cerrar se toma su tiempo.
      this.scene.tweens.add({ targets: door.sprite, alpha: near ? 1 : 0, duration: near ? 140 : 260, ease: near ? 'Cubic.easeOut' : 'Sine.easeInOut' });
    }
  }
}
