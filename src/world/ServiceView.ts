import type Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { Facing, LocationDef } from '../types/game';
import type { TableService } from '../systems/TableService';
import { isDrink } from './DiningArt';

/** Dónde queda lo que se sirve según hacia dónde mira quien se sienta, en px desde sus pies (como en entities/Character). */
const ON_TABLE: Readonly<Record<Facing, readonly [number, number]>> = { up: [0, -TILE - 3], down: [0, TILE - 7], left: [-TILE + 2, -7], right: [TILE - 2, -7] };
/** El vaso, al lado del plato: a la derecha si se mira de frente o de espaldas; detrás si de lado. */
const GLASS: Readonly<Record<Facing, readonly [number, number]>> = { up: [5, -1], down: [5, 0], left: [0, -4], right: [0, -4] };

/**
 * Lo que se ve del servicio de mesa (systems/TableService): en cada mesa, el
 * plato y el vaso de cada comensal (llenos al servir, rebañados al acabar, y
 * ahí siguen hasta que recogen); en el pase, lo que ha salido de cocina y
 * espera al camarero; y en la cocina, vapor mientras haya algo al fuego. No
 * decide nada: pinta el estado del servicio cada frame.
 */
export class ServiceView {
  private readonly scene: Phaser.Scene;
  private readonly service: TableService;
  private readonly loc: LocationDef;
  private readonly images: Phaser.GameObjects.Image[] = [];
  private used = 0;
  private readonly pass: { x: number; y: number };
  private readonly kitchen: { x: number; y: number };

  constructor(scene: Phaser.Scene, service: TableService, loc: LocationDef, points: { pass: string; kitchen: string }) {
    this.scene = scene;
    this.service = service;
    this.loc = loc;
    const at = (id: string) => loc.points![id];
    // Lo que sale, sobre la barra, justo encima del pase; el vapor, sobre los fogones de detrás de quien cocina.
    this.pass = { x: at(points.pass).tx * TILE + TILE / 2, y: at(points.pass).ty * TILE - 4 };
    this.kitchen = { x: at(points.kitchen).tx * TILE + 4, y: at(points.kitchen).ty * TILE - 6 };
  }

  sync(time: number): void {
    this.used = 0;
    for (const t of this.service.tables) {
      // Lo servido está en la mesa hasta que se recoge: lleno mientras se come, vacío después.
      if (!t.served) continue;
      for (const p of t.plates) {
        const seat = this.loc.points?.[p.seat];
        if (!seat) continue;
        const facing = seat.facing ?? 'up';
        const [ox, oy] = ON_TABLE[facing];
        const [gx, gy] = isDrink(p.item.dish) ? GLASS[facing] : [0, 0];
        const feet = seat.ty * TILE + TILE;
        this.put(`fx-${p.item.dish}-${p.left > 0 ? 'full' : 'empty'}`, seat.tx * TILE + TILE / 2 + ox + gx, feet + oy + gy, feet + oy + 12);
      }
    }
    // En el pase, un plato por mesa que espera a que la lleven.
    this.service.tables.filter((t) => t.ready && !t.served && t.state === 'ORDERED').slice(0, 3).forEach((t, i) => {
      const food = t.plates.find((p) => !isDrink(p.item.dish)) ?? t.plates[0];
      if (food) this.put(`fx-${food.item.dish}-full`, this.pass.x - 6 + i * 6, this.pass.y, this.pass.y + 20);
    });
    // Vapor en la cocina mientras haya algo al fuego.
    if (this.service.cooking > 0) this.put(`fx-steam-${Math.floor(time / 380) % 2}`, this.kitchen.x, this.kitchen.y, this.kitchen.y + 30);
    for (let i = this.used; i < this.images.length; i++) this.images[i].setVisible(false);
  }

  /** Una imagen del pozo, con su textura, en su sitio y a su profundidad. */
  private put(key: string, x: number, y: number, depth: number): void {
    let img = this.images[this.used];
    if (!img) {
      img = this.scene.add.image(0, 0, key).setOrigin(0.5, 0.5);
      this.images.push(img);
    }
    img.setTexture(key).setPosition(Math.round(x), Math.round(y)).setDepth(depth).setVisible(true);
    this.used++;
  }
}
