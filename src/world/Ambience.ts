import Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { LocationDef, SignalDef, Vec2 } from '../types/game';
import { signalAt } from '../systems/Signals';
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
/** La línea de detención, a unos píxeles de las bandas; con ámbar, a menos de esto ya no frena. */
const STOP_GAP = 3;
const AMBER_COMMIT = TILE;
/** Cuánto acelera la llegada a la línea o al de delante: px/s por px que queda. */
const APPROACH = 2.5;
const QUEUE_GAP = 5;

interface Car {
  sprite: Phaser.GameObjects.Image;
  row: number;
  dir: 1 | -1;
  speed: number;
  /** Puesto en su carril: los de índice alto sólo salen cuando hay tráfico. */
  index: number;
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
  /** Hora del reloj con decimales: cuántos coches circulan. */
  private readonly hour: () => number;
  private readonly traffic: LocationDef['traffic'];
  private readonly signals: readonly SignalDef[];
  private readonly cars: Car[] = [];
  private readonly doors: AutoDoor[] = [];

  constructor(scene: Phaser.Scene, def: LocationDef, widthPx: number, pedestrians: () => readonly Vec2[], hour: () => number) {
    this.hour = hour;
    this.traffic = def.traffic;
    this.signals = def.signals ?? [];
    this.scene = scene;
    this.widthPx = widthPx;
    this.pedestrians = pedestrians;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    // Coches repartidos a lo largo del carril, cada uno a su ritmo.
    let n = 0;
    for (const lane of def.traffic?.lanes ?? []) {
      const count = def.traffic?.carsPerLane ?? 0;
      for (let i = 0; i < count; i++) {
        // Los que no tocan a esta hora esperan fuera del mapa.
        const parked = i >= this.carsNow();
        const x = parked ? (lane.dir > 0 ? -CAR_W : widthPx + CAR_W) : ((i + 0.5) / count) * widthPx + (n % 3) * TILE * 2;
        const y = lane.row * TILE + TILE;
        // El primero de cada carril es un taxi: de madrugada es lo único que pasa.
        const key = i === 0 ? 'prop-car-taxi' : CAR_KEYS[n % CAR_KEYS.length];
        const sprite = scene.add.image(x, y, key).setOrigin(0.5, 1).setDepth(y);
        sprite.setFlipX(lane.dir < 0);
        this.cars.push({ sprite, row: lane.row, dir: lane.dir, speed: CRUISE * (0.85 + (n % 4) * 0.08), index: i });
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

  /** Coches por carril a esta hora (TrafficDef.hourly); sin franja, todos. */
  private carsNow(): number {
    const t = this.hour();
    const band = this.traffic?.hourly?.find(([from, to]) => t >= from && t < to);
    return band ? band[2] : (this.traffic?.carsPerLane ?? 0);
  }

  update(deltaMs: number): void {
    if (this.cars.length === 0 && this.doors.length === 0) return;
    const dt = Math.min(deltaMs, 100) / 1000;
    const people = this.pedestrians();

    const active = this.carsNow();
    for (const car of this.cars) {
      const s = car.sprite;
      // Fuera de hora, un coche que ya ha salido del mapa se queda aparcado fuera hasta que vuelva a haber tráfico.
      const offMap = s.x < -CAR_W / 2 || s.x > this.widthPx + CAR_W / 2;
      s.setVisible(car.index < active || !offMap);
      if (!s.visible) continue;
      const front = s.x + car.dir * (CAR_W / 2);
      const top = car.row * TILE;
      let target = CRUISE;
      // Cede a cualquiera que esté en su carril delante de él (pies dentro del carril).
      for (const p of people) {
        const ahead = (p.x - front) * car.dir;
        if (p.y > top && p.y < top + TILE + 8 && ahead > -6 && ahead < BRAKE_PX) target = 0;
      }
      // El semáforo: en rojo para en la línea; en ámbar también, si aún le da para frenar.
      let stopLine: number | undefined;
      for (const sig of this.signals) {
        if (car.row < sig.ty || car.row >= sig.ty + sig.h) continue;
        const light = signalAt(sig, this.hour() * 60).car;
        if (light === 'green') continue;
        const line = car.dir > 0 ? sig.tx * TILE - STOP_GAP : (sig.tx + sig.w) * TILE + STOP_GAP;
        const dist = (line - front) * car.dir;
        if (dist < -1 || (light === 'amber' && dist < AMBER_COMMIT)) continue;
        if (dist < BRAKE_PX * 1.4) {
          // Se arrima despacio hasta la línea: velocidad según lo que le queda, no un frenazo lejos.
          target = Math.min(target, Math.max(0, (dist - 1) * APPROACH));
          stopLine = line;
        }
      }
      // Y guarda la distancia con el de delante.
      for (const other of this.cars) {
        if (other === car || other.row !== car.row || !other.sprite.visible) continue;
        const gap = (other.sprite.x - s.x) * car.dir - CAR_W;
        // En cola se para a un palmo del de delante, no a tres tiles.
        if (gap > 0 && gap < BRAKE_PX) target = Math.min(target, other.speed * 0.9 + Math.max(0, (gap - QUEUE_GAP) * APPROACH));
      }
      car.speed += (target - car.speed) * Math.min(1, dt * (target < car.speed ? 6 : 1.5));
      s.x += car.dir * car.speed * dt;
      // Nunca se come la línea: si la iba a pasar, se queda justo en ella.
      if (stopLine !== undefined && (s.x + car.dir * (CAR_W / 2) - stopLine) * car.dir > 0) {
        s.x = stopLine - car.dir * (CAR_W / 2);
        car.speed = 0;
      }
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
