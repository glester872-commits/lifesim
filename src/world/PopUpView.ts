import Phaser from 'phaser';
import { TILE } from '../config/constants';
import { POPUPS, type PopUpDef } from '../data/popups';
import { piecesShown, popUpProgress, popUpStalls, stallVendors, type PopUpClock } from '../systems/PopUps';
import { isWalkable } from '../systems/LocationSystem';
import type { LocationDef } from '../types/game';
import { LAYER, standing } from './Layers';
import { EMISSIVE_DEPTH, nightAt } from './Lighting';
import { LightDepth } from './LightDepth';
import { PIECE_SIZE, pieceKey, vendorKey } from './PopUpArt';

/**
 * Pinta los eventos de la calle (data/popups.ts): crea las piezas de todos los
 * del sitio, ocultas, y muestra las del que toca según el calendario
 * (systems/PopUps), desde que se está montando hasta que se recoge. Las piezas
 * con `solid` bloquean el paso mientras están puestas (como el corro de la
 * pelea): nadie las atraviesa. De noche, el DJ y la inauguración traen su luz.
 * Una comprobación por segundo; el resto del tiempo sólo se mueven los focos.
 */

/** Por encima de la sombra de la hora: la luz de un evento no la apaga la noche. */
const LIGHT_DEPTH = LAYER.glow;
const DJ_COLORS = [0xff5ab0, 0x5ad8ff, 0xb07aff, 0xffd05a] as const;
/** Ancho de un puesto de anclas en tiles, desde el ancla hacia la derecha (el mismo tx..tx+1 que `free`). */
const STALL_TILES = 2;

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
  /** Puestos de anclas (`def.stalls`): cuántos se ven ahora, montando o recogiendo, en el orden de popUpStalls. */
  shown?: number;
  /** Cuerpo de cada puesto de anclas, en el mismo orden; sólo está activo mientras el puesto se ve. */
  stallBodies?: Phaser.GameObjects.Zone[];
  /** Puestos ya a la vista cuyo cuerpo espera a que el jugador salga de encima (índice en stallBodies). */
  pending?: Set<number>;
}

export class PopUpView {
  private readonly location: string;
  private readonly clock: () => PopUpClock;
  private readonly hour: () => number;
  private readonly groups = new Map<string, Group>();
  /** Vendedores de los puestos que venden (CAS-03), por id de ancla; se ven sólo en horario de venta. */
  private readonly vendors = new Map<string, Phaser.GameObjects.Image>();
  private current: string | null = null;
  private nextCheck = 0;
  private readonly player: Phaser.GameObjects.GameObject;

  constructor(scene: Phaser.Scene, def: LocationDef, player: Phaser.GameObjects.GameObject, clock: () => PopUpClock, hour: () => number) {
    this.location = def.id;
    this.player = player;
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
      // Gran Rastro: un puesto por ancla, dos tiles de ancho desde el ancla; corta el paso mientras se ve (reveal()).
      const stalls = popUpStalls(p);
      const stallBodies: Phaser.GameObjects.Zone[] = [];
      // Una tile lateral sirve si se puede pisar y ningún puesto del evento (tx, tx+1) la ocupa.
      const free = (tx: number, ty: number): boolean => isWalkable(def, tx, ty) && !stalls.some((o) => o.ty === ty && tx >= o.tx && tx <= o.tx + 1);
      for (const s of stalls) {
        const [w] = PIECE_SIZE[s.piece];
        const x = s.tx * TILE + w / 2;
        const baseY = (s.ty + 1) * TILE;
        const img = scene.add.image(x, baseY, pieceKey(s.piece)).setOrigin(0.5, 1).setDepth(standing(baseY)).setVisible(false);
        const shadow = scene.add.image(x, baseY - 1, 'fx-shadow').setOrigin(0.5, 0.5).setDepth(standing(baseY) - 1).setScale(Math.max(1.4, w / 15), 1.2).setAlpha(0.8).setVisible(false);
        pieces.push({ img, shadow });
        const zone = scene.add.zone(s.tx * TILE, s.ty * TILE, STALL_TILES * TILE, TILE).setOrigin(0, 0);
        scene.physics.add.existing(zone, true);
        scene.physics.add.collider(player, zone);
        (zone.body as Phaser.Physics.Arcade.StaticBody).enable = false;
        stallBodies.push(zone);
        // Quien atiende, de pie al lado del mostrador (a la derecha; si ahí no cabe, a la izquierda), pegado al puesto
        // sin pisarlo y con los pies en su misma fila. Sin cuerpo: sólo se ve, no corta el paso.
        if (s.vendor) {
          const right = free(s.tx + 2, s.ty) || !free(s.tx - 1, s.ty);
          const vx = right ? (s.tx + 2) * TILE + 5 : (s.tx - 1) * TILE + TILE - 5;
          const v = scene.add.image(vx, baseY, vendorKey(this.vendors.size)).setOrigin(0.5, 1).setDepth(standing(baseY)).setVisible(false);
          this.vendors.set(s.id, v);
        }
      }
      const group: Group = { def: p, pieces, lights: [], shown: p.stalls ? 0 : undefined };
      if (p.stalls) {
        group.stallBodies = stallBodies;
        group.pending = new Set();
      }
      if (p.glow === 'dj') {
        const booth = p.props.find((q) => q.piece === 'booth');
        if (booth) {
          group.booth = scene.add
            .image(booth.tx * TILE + TILE, (booth.ty + 1) * TILE, 'pu-booth-glow')
            .setOrigin(0.5, 1)
            .setDepth(EMISSIVE_DEPTH)
            .setVisible(false);
          // Quien baila delante de la cabina la tapa (world/LightDepth).
          LightDepth.of(scene).light(group.booth, (booth.ty + 1) * TILE);
        }
        // Tres focos de color sobre donde se baila.
        for (let i = 0; i < 3; i++) {
          group.lights.push(scene.add.image((90.5 + i * 2) * TILE, 49.5 * TILE, 'fx-light').setDepth(LIGHT_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setScale(1.1).setVisible(false));
        }
      } else if (p.glow === 'gallery') {
        // Un foco cálido sobre cada caballete.
        for (const prop of p.props) {
          const spot = scene.add.image(prop.tx * TILE + TILE / 2, (prop.ty + 1) * TILE - 18, 'fx-light').setDepth(LIGHT_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd89a).setScale(0.55).setVisible(false);
          // El foco alumbra el caballete: quien mira el cuadro desde delante lo tapa.
          LightDepth.of(scene).light(spot, (prop.ty + 1) * TILE);
          group.lights.push(spot);
        }
      }
      this.groups.set(p.id, group);
    }
  }

  private show(id: string | null): void {
    for (const [gid, g] of this.groups) {
      // Los puestos de anclas se encienden poco a poco en reveal().
      const on = gid === id && !g.def.stalls;
      if (g.def.stalls) g.shown = 0;
      for (const piece of g.pieces) {
        piece.img.setVisible(on);
        piece.shadow.setVisible(on);
        if (piece.body) (piece.body.body as Phaser.Physics.Arcade.StaticBody).enable = on;
      }
      for (const z of g.stallBodies ?? []) (z.body as Phaser.Physics.Arcade.StaticBody).enable = false;
      g.pending?.clear();
      g.booth?.setVisible(false);
      for (const l of g.lights) l.setVisible(false);
    }
    this.current = id;
  }

  /** Deja a la vista los `k` primeros puestos (montando, crecen; recogiendo, menguan). Sólo toca los que cambian. */
  private reveal(g: Group, k: number): void {
    const was = g.shown ?? 0;
    if (k === was) return;
    // Las piezas de los puestos van detrás de las de `props`.
    const offset = g.pieces.length - (g.stallBodies?.length ?? 0);
    for (let i = Math.min(k, was); i < Math.max(k, was); i++) {
      const on = i < k;
      g.pieces[offset + i].img.setVisible(on);
      g.pieces[offset + i].shadow.setVisible(on);
      const zone = g.stallBodies?.[i];
      if (!zone) continue;
      // Un puesto que se monta encima del jugador espera a que se aparte: nunca se le empuja ni se le teletransporta.
      const blocked = on && this.overlapsPlayer(zone);
      (zone.body as Phaser.Physics.Arcade.StaticBody).enable = on && !blocked;
      if (blocked) g.pending?.add(i);
      else g.pending?.delete(i);
    }
    g.shown = k;
  }

  /** Activa los puestos a la vista que esperaban a que el jugador saliera de encima. */
  private retryPending(g: Group): void {
    if (!g.pending?.size || !g.stallBodies) return;
    for (const i of [...g.pending]) {
      if (i >= (g.shown ?? 0)) g.pending.delete(i);
      else if (!this.overlapsPlayer(g.stallBodies[i])) {
        (g.stallBodies[i].body as Phaser.Physics.Arcade.StaticBody).enable = true;
        g.pending.delete(i);
      }
    }
  }

  private overlapsPlayer(zone: Phaser.GameObjects.Zone): boolean {
    const b = this.player.body as Phaser.Physics.Arcade.Body | null;
    if (!b) return false;
    return b.x < zone.x + zone.width && b.x + b.width > zone.x && b.y < zone.y + zone.height && b.y + b.height > zone.y;
  }

  /** Cada frame: ver si hay que cambiar de evento (una vez por segundo) y mover los focos del que está. */
  update(time: number): void {
    if (this.groups.size === 0) return;
    if (time >= this.nextCheck) {
      this.nextCheck = time + 1_000;
      const now = popUpProgress(this.location, this.clock());
      const id = now?.def.id ?? null;
      if (id !== this.current) this.show(id);
      const shown = id ? this.groups.get(id) : undefined;
      if (now && shown?.def.stalls) {
        this.reveal(shown, piecesShown(now.progress, shown.stallBodies?.length ?? 0));
        this.retryPending(shown);
      }
      if (this.vendors.size) {
        const open = new Set(stallVendors(this.location, this.clock()).map((s) => s.id));
        for (const [sid, v] of this.vendors) v.setVisible(open.has(sid));
      }
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
