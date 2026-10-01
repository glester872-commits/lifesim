import Phaser from 'phaser';
import { TILE } from '../config/constants';
import { POPUPS, type PopUpDef } from '../data/popups';
import { visiblePopUp, type PopUpClock } from '../systems/PopUps';
import type { LocationDef } from '../types/game';
import { standing } from './Layers';
import { EMISSIVE_DEPTH, nightAt } from './Lighting';
import { PIECE_SIZE, pieceKey } from './PopUpArt';

/**
 * Pinta los eventos de la calle (data/popups.ts): crea las piezas de todos los
 * del sitio, ocultas, y muestra las del que toca según el calendario
 * (systems/PopUps), desde que se está montando hasta que se recoge. Las piezas
 * con `solid` bloquean el paso mientras están puestas (como el corro de la
 * pelea): nadie las atraviesa. De noche, el DJ y la inauguración traen su luz.
 * Una comprobación por segundo; el resto del tiempo sólo se mueven los focos.
 */

/** Por encima de la sombra de la hora: la luz de un evento no la apaga la noche. */
const LIGHT_DEPTH = 900_001;
const DJ_COLORS = [0xff5ab0, 0x5ad8ff, 0xb07aff, 0xffd05a] as const;

interface Piece {
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  body?: Phaser.GameObjects.Zone;
}

interface Group {
  def: PopUpDef;
  pieces: Piece[];
  /** Luz de la cabina (sólo el DJ). */
  booth?: Phaser.GameObjects.Image;
  lights: Phaser.GameObjects.Image[];
}

export class PopUpView {
  private readonly location: string;
  private readonly clock: () => PopUpClock;
  private readonly hour: () => number;
  private readonly groups = new Map<string, Group>();
  private current: string | null = null;
  private nextCheck = 0;

  constructor(scene: Phaser.Scene, def: LocationDef, player: Phaser.GameObjects.GameObject, clock: () => PopUpClock, hour: () => number) {
    this.location = def.id;
    this.clock = clock;
    this.hour = hour;
    for (const p of POPUPS) {
      if (p.location !== def.id) continue;
      const pieces: Piece[] = p.props.map((prop) => {
        const [w] = PIECE_SIZE[prop.piece];
        const wTiles = prop.solid ?? Math.max(1, Math.round(w / TILE));
        const x = prop.tx * TILE + (wTiles * TILE) / 2;
        const baseY = (prop.ty + 1) * TILE;
        const img = scene.add.image(x, baseY, pieceKey(prop.piece)).setOrigin(0.5, 1).setDepth(standing(baseY)).setVisible(false);
        // Sombra de contacto ancha y suave: el puesto no flota sobre el granito.
        const shadow = scene.add.image(x, baseY - 1, 'fx-shadow').setOrigin(0.5, 0.5).setDepth(standing(baseY) - 1).setScale(Math.max(1.4, w / 15), 1.2).setAlpha(0.8).setVisible(false);
        let body: Phaser.GameObjects.Zone | undefined;
        if (prop.solid) {
          body = scene.add.zone(prop.tx * TILE, prop.ty * TILE, prop.solid * TILE, TILE).setOrigin(0, 0);
          scene.physics.add.existing(body, true);
          scene.physics.add.collider(player, body);
          (body.body as Phaser.Physics.Arcade.StaticBody).enable = false;
        }
        return { img, shadow, body };
      });
      const group: Group = { def: p, pieces, lights: [] };
      if (p.glow === 'dj') {
        const booth = p.props.find((q) => q.piece === 'booth');
        if (booth) {
          group.booth = scene.add
            .image(booth.tx * TILE + TILE, (booth.ty + 1) * TILE, 'pu-booth-glow')
            .setOrigin(0.5, 1)
            .setDepth(EMISSIVE_DEPTH)
            .setVisible(false);
        }
        // Tres focos de color sobre donde se baila.
        for (let i = 0; i < 3; i++) {
          group.lights.push(scene.add.image((90.5 + i * 2) * TILE, 49.5 * TILE, 'fx-light').setDepth(LIGHT_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setScale(1.1).setVisible(false));
        }
      } else if (p.glow === 'gallery') {
        // Un foco cálido sobre cada caballete.
        for (const prop of p.props) {
          group.lights.push(scene.add.image(prop.tx * TILE + TILE / 2, (prop.ty + 1) * TILE - 18, 'fx-light').setDepth(LIGHT_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd89a).setScale(0.55).setVisible(false));
        }
      }
      this.groups.set(p.id, group);
    }
  }

  private show(id: string | null): void {
    for (const [gid, g] of this.groups) {
      const on = gid === id;
      for (const piece of g.pieces) {
        piece.img.setVisible(on);
        piece.shadow.setVisible(on);
        if (piece.body) (piece.body.body as Phaser.Physics.Arcade.StaticBody).enable = on;
      }
      g.booth?.setVisible(false);
      for (const l of g.lights) l.setVisible(false);
    }
    this.current = id;
  }

  /** Cada frame: ver si hay que cambiar de evento (una vez por segundo) y mover los focos del que está. */
  update(time: number): void {
    if (this.groups.size === 0) return;
    if (time >= this.nextCheck) {
      this.nextCheck = time + 1_000;
      const id = visiblePopUp(this.location, this.clock())?.id ?? null;
      if (id !== this.current) this.show(id);
    }
    const g = this.current ? this.groups.get(this.current) : undefined;
    if (!g || !g.def.glow) return;
    const night = nightAt(this.hour());
    const on = night > 0.2;
    g.booth?.setVisible(on).setAlpha(night * (0.75 + 0.25 * Math.sin(time / 180)));
    const beat = Math.floor(time / 500);
    g.lights.forEach((l, i) => {
      l.setVisible(on);
      if (!on) return;
      if (g.def.glow === 'dj') {
        // Cada foco cambia de color y se desplaza un poco con el compás, y late entre pulso y pulso.
        l.setTint(DJ_COLORS[(beat + i) % DJ_COLORS.length]);
        l.setPosition((90.5 + i * 2 + Math.sin(time / 700 + i * 2) * 0.8) * TILE, 49.5 * TILE + Math.cos(time / 900 + i) * 4);
        l.setAlpha(night * (0.5 + 0.3 * Math.abs(Math.sin(time / 250 + i))));
      } else l.setAlpha(night * 0.6);
    });
  }
}
