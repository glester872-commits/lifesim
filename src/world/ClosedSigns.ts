import Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import type { GameState } from '../state/GameState';
import { doorRow } from '../systems/LocationSystem';
import { isOpen, placesOfType, type PlaceInfo } from '../systems/Places';
import type { BuildingDef, LocationDef } from '../types/game';
import { standing } from './Layers';
import { make, px, shade } from './paint';

const KEY = 'fx-closed-sign';

/** El cartelito de «cerrado» colgado de la puerta: placa roja con su raya blanca y el cordel. Sin texto ni marca. */
function build(scene: Phaser.Scene): void {
  make(scene, KEY, 10, 9, (ctx) => {
    px(ctx, PALETTE.metal, 2, 0, 1, 2);
    px(ctx, PALETTE.metal, 7, 0, 1, 2);
    px(ctx, PALETTE.outline, 0, 2, 10, 7);
    px(ctx, '#b8423a', 1, 3, 8, 5);
    px(ctx, shade('#b8423a', 0.2), 1, 3, 8, 1);
    px(ctx, '#e6e2d8', 2, 5, 6, 1);
  });
}

/**
 * Lo que dice la fachada de un negocio cerrado, sea cual sea su tipo (no a todos se les puede bajar una persiana):
 * el cartel en la puerta. La luz del escaparate ya la apaga world/Lighting. Una imagen por puerta, hecha al montar
 * la escena; sólo cambia cuando cambia el reloj (el estado avisa con 'change') y la apertura es la de Places.isOpen.
 */
export class ClosedSigns {
  private readonly signs: { place: PlaceInfo; img: Phaser.GameObjects.Image }[] = [];
  private readonly state: GameState;
  private last = '';

  constructor(scene: Phaser.Scene, def: LocationDef, state: GameState) {
    this.state = state;
    if (def.kind !== 'exterior') return;
    build(scene);
    const places = placesOfType('business').filter((p) => p.hours && p.building);
    for (const b of def.buildings ?? []) {
      const place = places.find((p) => p.building === b.id);
      if (!place || b.doorX === undefined || !b.front) continue;
      this.signs.push({ place, img: this.sign(scene, b) });
    }
    if (this.signs.length === 0) return;
    const update = (): void => this.update();
    state.on('change', update);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => state.off('change', update));
    this.update();
  }

  /** Cuántos carteles se ven ahora (para comprobarlo desde la consola). */
  get shown(): number {
    return this.signs.filter((s) => s.img.visible).length;
  }

  private sign(scene: Phaser.Scene, b: BuildingDef): Phaser.GameObjects.Image {
    const row = doorRow(b);
    return scene.add.image(b.doorX! * TILE + TILE / 2, row * TILE + 3, KEY).setOrigin(0.5, 0).setDepth(standing((row + 1) * TILE) - 2);
  }

  private update(): void {
    const { day, hour, minute } = this.state;
    const open = this.signs.map((s) => isOpen(s.place, day, hour, minute));
    const key = open.join();
    if (key === this.last) return;
    this.last = key;
    this.signs.forEach((s, i) => s.img.setVisible(!open[i]));
  }
}
