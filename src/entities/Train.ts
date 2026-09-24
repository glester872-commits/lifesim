import Phaser from 'phaser';
import type { TrainSystem } from '../systems/TrainSystem';
import { CAR_W, DOOR_CENTERS, DOOR_LEAF_W, DOOR_TOP } from '../world/TextureFactory';

export const TRAIN_CARS = 3;
export const TRAIN_LENGTH = CAR_W * TRAIN_CARS;

/** Desplazamiento de cada puerta respecto al borde izquierdo del tren. */
export const TRAIN_DOOR_OFFSETS: readonly number[] = Array.from({ length: TRAIN_CARS }, (_, car) =>
  DOOR_CENTERS.map((cx) => car * CAR_W + cx),
).flat();

const BLINK_MS = 180;

/**
 * Render del tren. No decide nada: lee TrainSystem cada frame. Un Container
 * enmascarado al mapa para que asome del túnel y no por el margen negro.
 */
export class Train {
  private readonly root: Phaser.GameObjects.Container;
  private readonly leaves: { left: Phaser.GameObjects.Image; right: Phaser.GameObjects.Image; cx: number }[] = [];
  private readonly lights: Phaser.GameObjects.Image[] = [];
  private lastOpenness = -1;

  constructor(scene: Phaser.Scene, top: number, mapWidth: number, depth: number) {
    this.root = scene.add.container(0, top).setDepth(depth).setVisible(false);

    for (let car = 0; car < TRAIN_CARS; car++) {
      const cab = car === 0 || car === TRAIN_CARS - 1;
      const image = scene.add.image(car * CAR_W, 0, cab ? 'train-car-cab' : 'train-car').setOrigin(0, 0);
      // El coche de cola lleva la cabina al otro lado.
      if (car === TRAIN_CARS - 1) image.setFlipX(true);
      this.root.add(image);
    }

    for (const cx of TRAIN_DOOR_OFFSETS) {
      const left = scene.add.image(0, DOOR_TOP, 'train-door-leaf').setOrigin(0, 0);
      const right = scene.add.image(0, DOOR_TOP, 'train-door-leaf').setOrigin(0, 0).setFlipX(true);
      const light = scene.add.image(cx - 3, DOOR_TOP - 3, 'train-door-light').setOrigin(0, 0).setVisible(false);
      this.leaves.push({ left, right, cx });
      this.lights.push(light);
      this.root.add([left, right, light]);
    }

    const shape = scene.make.graphics({}, false);
    shape.fillRect(0, top, mapWidth, 200);
    this.root.setMask(shape.createGeometryMask());
  }

  update(train: TrainSystem, timeMs: number): void {
    const visible = train.state !== 'AWAY';
    this.root.setVisible(visible);
    if (!visible) return;

    this.root.x = Math.round(train.x);

    const open = train.doorOpenness;
    if (open !== this.lastOpenness) {
      this.lastOpenness = open;
      const slide = Math.round(open * (DOOR_LEAF_W - 1));
      for (const { left, right, cx } of this.leaves) {
        left.x = cx - DOOR_LEAF_W - slide;
        right.x = cx + slide;
      }
    }

    const blinkOn = train.closingWarning && Math.floor(timeMs / BLINK_MS) % 2 === 0;
    for (const light of this.lights) light.setVisible(blinkOn);
  }
}
