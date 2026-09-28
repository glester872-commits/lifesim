import type Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { BikeType } from '../data/bikes';
import { PASSENGER_LOOKS } from '../data/npcs';
import type { Traffic, Vehicle } from '../systems/Traffic';
import { EMISSIVE_DEPTH, nightAt } from './Lighting';
import { RIDER_H, RIDER_LAMPS, RIDER_STOPPED, RIDER_W, riderTexture, type RiderLook } from './CyclistArt';

/** Px recorridos por cada cuarto de vuelta de pedal. */
const STROKE_PX = 3;

interface Parts {
  body: Phaser.GameObjects.Image;
  head: Phaser.GameObjects.Image;
  tail: Phaser.GameObjects.Image;
}

/** Quién monta esta bici: sale del azar fijo de cada ciclista, así que no cambia mientras cruza. */
export function riderOf(v: Vehicle<BikeType>): RiderLook {
  const roll = (shift: number): number => ((v.seed >>> shift) % 100) / 100;
  return {
    look: PASSENGER_LOOKS[v.seed % PASSENGER_LOOKS.length],
    bike: v.type,
    color: v.color,
    helmet: roll(7) < v.type.helmet,
    pack: roll(14) < v.type.pack,
  };
}

/**
 * Pinta las bicis de systems/Traffic.ts: la pedalada va con lo que avanza
 * (parado, un pie al suelo), y de noche el faro blanco delante y el piloto
 * rojo detrás.
 */
export class CyclistView {
  private readonly scene: Phaser.Scene;
  private readonly traffic: Traffic<BikeType>;
  private readonly hour: () => number;
  private readonly parts = new Map<Vehicle<BikeType>, Parts>();
  private readonly pool: Parts[] = [];

  constructor(scene: Phaser.Scene, traffic: Traffic<BikeType>, hour: () => number) {
    this.scene = scene;
    this.traffic = traffic;
    this.hour = hour;
    this.sync();
  }

  sync(): void {
    const lit = nightAt(this.hour()) > 0.25;
    const alive = new Set(this.traffic.vehicles);
    for (const [v, parts] of this.parts) {
      if (alive.has(v)) continue;
      for (const img of Object.values(parts)) img.setVisible(false);
      this.pool.push(parts);
      this.parts.delete(v);
    }
    for (const v of this.traffic.vehicles) {
      const p = this.parts.get(v) ?? this.take(v);
      const flip = v.dir < 0;
      const bottom = v.row * TILE + TILE - 1;
      const left = Math.round(v.x - RIDER_W / 2);
      const top = bottom - RIDER_H;
      const frame = v.speed < 0.5 ? RIDER_STOPPED : Math.floor(Math.abs(v.x) / STROKE_PX) % 4;
      // Al pedalear el cuerpo sube y baja un píxel con cada pedalada; parado, quieto.
      const bob = frame !== RIDER_STOPPED && frame % 2 === 1 ? 1 : 0;
      p.body.setFrame(frame).setPosition(left, top + bob).setDepth(bottom).setVisible(true);
      const at = ([lx, ly]: readonly [number, number]): [number, number] => [left + (flip ? RIDER_W - 1 - lx : lx), top + ly];
      p.head.setPosition(...at(RIDER_LAMPS.head)).setVisible(lit);
      p.tail.setPosition(...at(RIDER_LAMPS.tail)).setVisible(lit || v.braking).setAlpha(v.braking ? 1 : 0.7);
    }
  }

  private take(v: Vehicle<BikeType>): Parts {
    const s = this.scene;
    const key = riderTexture(s, riderOf(v));
    const p = this.pool.pop() ?? {
      body: s.add.image(0, 0, key, 0).setOrigin(0, 0),
      head: s.add.image(0, 0, 'veh-head').setOrigin(0, 0).setDepth(EMISSIVE_DEPTH),
      tail: s.add.image(0, 0, 'veh-tail').setOrigin(0, 0).setDepth(EMISSIVE_DEPTH),
    };
    p.body.setTexture(key, 0).setFlipX(v.dir < 0);
    this.parts.set(v, p);
    return p;
  }
}
