import Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { VehicleType } from '../data/vehicles';
import type { Traffic, Vehicle } from '../systems/Traffic';
import { EMISSIVE_DEPTH, nightAt } from './Lighting';
import { lampsOf, vehicleKey } from './VehicleArt';

/** Media vuelta de la rotativa, en ms. */
const BEACON_MS = 420;

interface Parts {
  body: Phaser.GameObjects.Image;
  head: Phaser.GameObjects.Image;
  tail: Phaser.GameObjects.Image;
  roof: Phaser.GameObjects.Image;
  /** El haz de los faros en el suelo, de noche. */
  beam: Phaser.GameObjects.Image;
  /** Con el asfalto mojado, el faro y el piloto repetidos en el agua: una raya vertical tenue. */
  glint: Phaser.GameObjects.Image;
  tailGlint: Phaser.GameObjects.Image;
}

/**
 * Pinta systems/Traffic.ts, que no sabe de Phaser: un sprite por vehículo,
 * sacado de un pozo, y encima sus luces. Los faros y los pilotos se encienden
 * al caer la tarde; el freno, siempre que frena; la rotativa, girando.
 */
export class TrafficView {
  private readonly scene: Phaser.Scene;
  private readonly traffic: Traffic<VehicleType>;
  private readonly hour: () => number;
  private readonly parts = new Map<Vehicle<VehicleType>, Parts>();
  private readonly pool: Parts[] = [];
  /** Cuánto de mojado está el suelo (0–1): sin él, seco. */
  private readonly wet: () => number;

  constructor(scene: Phaser.Scene, traffic: Traffic<VehicleType>, hour: () => number, wet: () => number = () => 0) {
    this.scene = scene;
    this.traffic = traffic;
    this.hour = hour;
    this.wet = wet;
    this.sync(0);
  }

  sync(time: number): void {
    const night = nightAt(this.hour());
    const wet = this.wet();
    const glinting = night > 0.25 && wet > 0.25;
    const alive = new Set(this.traffic.vehicles);
    for (const [v, parts] of this.parts) {
      if (alive.has(v)) continue;
      for (const img of Object.values(parts)) img.setVisible(false);
      this.pool.push(parts);
      this.parts.delete(v);
    }
    for (const v of this.traffic.vehicles) {
      const p = this.parts.get(v) ?? this.take(v);
      const L = v.type.length;
      const flip = v.dir < 0;
      const bottom = v.row * TILE + TILE;
      const left = Math.round(v.x - L / 2);
      const top = bottom - v.type.height;
      // Un turismo cabecea al frenar; un autobús o un camión, más pesados, no se inmutan.
      const dip = v.braking && v.speed > 6 && L < 48 ? 1 : 0;
      p.body.setPosition(left, top + dip).setDepth(bottom).setVisible(true);

      // Luces: en px del sprite mirando a la derecha; hacia el oeste, en espejo.
      const lamps = lampsOf(v.type);
      const at = ([lx, ly]: readonly [number, number], w: number): [number, number] => [left + (flip ? L - lx - w : lx), top + ly];
      const [hx, hy] = at(lamps.head, 1);
      const [tx, ty] = at(lamps.tail, 1);
      p.head.setPosition(hx, hy).setVisible(night > 0.25);
      p.tail.setPosition(tx, ty).setVisible(v.braking || night > 0.25).setAlpha(v.braking ? 1 : 0.6);
      p.beam.setPosition(hx + v.dir * 14, bottom - 3).setVisible(night > 0.25).setAlpha(night * (0.5 + wet * 0.25));
      p.glint.setPosition(hx + v.dir * 3, bottom + 5).setVisible(glinting).setAlpha(night * wet * 0.55);
      p.tailGlint.setPosition(tx, bottom + 4).setVisible(glinting).setAlpha(night * wet * (v.braking ? 0.5 : 0.28));
      if (lamps.roof) {
        const [rx, ry] = at(lamps.roof, 2);
        // La rotativa gira siempre; el verde de libre del taxi, de noche.
        const beacon = v.type.trim?.roof === 'beacon';
        const on = beacon ? Math.floor((time + v.id * 97) / BEACON_MS) % 2 === 0 : night > 0.25;
        p.roof.setPosition(rx, ry).setVisible(on);
      } else p.roof.setVisible(false);
    }
  }

  private take(v: Vehicle<VehicleType>): Parts {
    const s = this.scene;
    const p = this.pool.pop() ?? {
      body: s.add.image(0, 0, vehicleKey(v.type, v.color)).setOrigin(0, 0),
      head: s.add.image(0, 0, 'veh-head').setOrigin(0, 0).setDepth(EMISSIVE_DEPTH),
      tail: s.add.image(0, 0, 'veh-tail').setOrigin(0, 0).setDepth(EMISSIVE_DEPTH),
      roof: s.add.image(0, 0, 'veh-roof-taxi').setOrigin(0, 0).setDepth(EMISSIVE_DEPTH),
      beam: s.add.image(0, 0, 'fx-light').setScale(0.5, 0.18).setTint(0xfff0c8).setBlendMode(Phaser.BlendModes.ADD).setDepth(EMISSIVE_DEPTH - 1),
      glint: s.add.image(0, 0, 'fx-light').setScale(0.07, 0.42).setTint(0xfff0c8).setBlendMode(Phaser.BlendModes.ADD).setDepth(EMISSIVE_DEPTH - 1),
      tailGlint: s.add.image(0, 0, 'fx-light').setScale(0.06, 0.32).setTint(0xff5a44).setBlendMode(Phaser.BlendModes.ADD).setDepth(EMISSIVE_DEPTH - 1),
    };
    p.body.setTexture(vehicleKey(v.type, v.color)).setFlipX(v.dir < 0);
    p.roof.setTexture(v.type.trim?.roof === 'beacon' ? 'veh-roof-beacon' : 'veh-roof-taxi');
    this.parts.set(v, p);
    return p;
  }
}
