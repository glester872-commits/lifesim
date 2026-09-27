import Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import type { LocationDef } from '../types/game';
import { PROPS, propKey, TILES, variantKey } from './tiles';
import { solidMask } from '../systems/LocationSystem';
import { bakeBuildings, type GlowSpot, type WindowSpot } from './BuildingArt';
import { painted, paintSurfaces } from './Surfaces';

export interface BuiltLocation {
  widthPx: number;
  heightPx: number;
  solids: Phaser.Physics.Arcade.StaticGroup;
  /** Cristales de fachada: los enciende world/Lighting de noche. */
  windows: WindowSpot[];
  /** Partes de edificio que brillan de noche (rótulos, apliques). */
  glows: GlowSpot[];
}

function addSolid(
  scene: Phaser.Scene,
  solids: Phaser.Physics.Arcade.StaticGroup,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const zone = scene.add.zone(x, y, w, h).setOrigin(0, 0);
  solids.add(zone);
  (zone.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
}

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Rectángulos que cubren exactamente los tiles sólidos: tramos horizontales de
 * cada fila que se alargan hacia abajo mientras la fila siguiente repita el
 * mismo tramo. Menos cuerpos y menos juntas en las que engancharse al rozar.
 */
export function solidRects(mask: readonly (readonly boolean[])[]): Rect[] {
  const done: Rect[] = [];
  let open = new Map<string, Rect>();
  for (let y = 0; y <= mask.length; y++) {
    const row = mask[y] ?? [];
    const next = new Map<string, Rect>();
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      const start = x;
      while (x + 1 < row.length && row[x + 1]) x++;
      const key = `${start},${x - start + 1}`;
      const rect = open.get(key);
      if (rect) {
        rect.h += 1;
        open.delete(key);
        next.set(key, rect);
      } else next.set(key, { x: start, y, w: x - start + 1, h: 1 });
    }
    for (const rect of open.values()) done.push(rect);
    open = next;
  }
  return done;
}

/** Aceras y calzada, por carácter de la rejilla: donde se tocan hay bordillo. */
const WALKWAY = new Set([',', '~', 'c', 'P', 'T']);
const ROADWAY = new Set(['.', ':', '=']);
const SHADOW = 0x140f1c;
/** Pavimentos de plaza con cenefa donde tocan otro suelo (ART_BIBLE §8); la franja podotáctil no la corta. */
const BORDERED = new Set(['P', '~']);
const BORDER_OK = new Set(['P', '~', 'T']);
const OVERHEAD_DEPTH = 800_000;

/**
 * Lo que da volumen al suelo, horneado con él: bordillo de granito donde la
 * acera toca la calzada (los pasos de cebra quedan rebajados), sombra de los
 * edificios hacia el sureste (luz del noroeste) y una sombra al pie de cada
 * prop. Una vez por visita; en cada frame no cuesta nada.
 */
function bakeKerbsAndShadows(scene: Phaser.Scene, rt: Phaser.GameObjects.RenderTexture, def: LocationDef): void {
  const g = scene.make.graphics({}, false);
  const kerb = Phaser.Display.Color.HexStringToColor(PALETTE.kerb).color;
  const at = (x: number, y: number): string => def.ground[y]?.[x] ?? '';
  def.ground.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!WALKWAY.has(row[x])) continue;
      const px = x * TILE;
      const py = y * TILE;
      if (ROADWAY.has(at(x, y + 1))) {
        g.fillStyle(kerb, 1).fillRect(px, py + TILE - 2, TILE, 2);
        g.fillStyle(SHADOW, 0.35).fillRect(px, py + TILE, TILE, 1);
      }
      if (ROADWAY.has(at(x, y - 1))) {
        g.fillStyle(kerb, 1).fillRect(px, py, TILE, 2);
        g.fillStyle(SHADOW, 0.18).fillRect(px, py + 2, TILE, 1);
      }
      if (ROADWAY.has(at(x - 1, y))) g.fillStyle(kerb, 1).fillRect(px, py, 2, TILE);
      if (ROADWAY.has(at(x + 1, y))) {
        g.fillStyle(kerb, 1).fillRect(px + TILE - 2, py, 2, TILE);
        g.fillStyle(SHADOW, 0.3).fillRect(px + TILE, py, 1, TILE);
      }
    }
  });

  // Cenefa de granito oscuro donde el adoquín de plaza toca otro material.
  const border = Phaser.Display.Color.HexStringToColor(PALETTE.plaza).darken(22).color;
  def.ground.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!BORDERED.has(row[x])) continue;
      const px = x * TILE;
      const py = y * TILE;
      const edge = (dx: number, dy: number): boolean => !BORDER_OK.has(at(x + dx, y + dy));
      g.fillStyle(border, 1);
      if (edge(0, -1)) g.fillRect(px, py, TILE, 2);
      if (edge(0, 1)) g.fillRect(px, py + TILE - 2, TILE, 2);
      if (edge(-1, 0)) g.fillRect(px, py, 2, TILE);
      if (edge(1, 0)) g.fillRect(px + TILE - 2, py, 2, TILE);
    }
  });

  // Muros interiores: la última fila de muro enseña su cara hacia la sala, alicatada en hiladas
  // finas (en el metro se lee como el azulejo blanco de siempre), con zócalo y sombra al pie.
  const face = Phaser.Display.Color.HexStringToColor(PALETTE.wallFace).color;
  def.ground.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const below = at(x, y + 1);
      if (row[x] !== 'W' || below === 'W' || !TILES[below]) continue;
      const top = y * TILE + 3;
      g.fillStyle(face, 1).fillRect(x * TILE, top, TILE, 13);
      g.fillStyle(SHADOW, 0.06);
      for (let k = top + 4; k < top + 12; k += 4) g.fillRect(x * TILE, k, TILE, 1);
      g.fillStyle(SHADOW, 0.25).fillRect(x * TILE, (y + 1) * TILE - 2, TILE, 2);
      if (!TILES[below].solid) g.fillStyle(SHADOW, 0.3).fillRect(x * TILE, (y + 1) * TILE, TILE, 2);
    }
  });

  for (const b of def.buildings ?? []) {
    g.fillStyle(SHADOW, 0.2);
    g.fillRect((b.tx + b.w) * TILE, b.ty * TILE + 6, 5, b.h * TILE - 3);
    g.fillRect(b.tx * TILE + 5, (b.ty + b.h) * TILE, b.w * TILE, 3);
    g.fillStyle(SHADOW, 0.3).fillRect(b.tx * TILE, (b.ty + b.h) * TILE, b.w * TILE, 1);
  }

  for (const p of def.props) {
    const prop = PROPS[p.kind];
    // Lo que cuelga del techo o de la pared no toca el suelo; lo plano ya es suelo.
    if (prop.overhead || prop.flat || at(p.tx, p.ty) === 'W') continue;
    const width = (prop.tilesWide ?? 1) * TILE;
    // Lo alto proyecta una franja hacia el sureste (luz del noroeste) y, si tiene copa, su mancha al final.
    if (prop.cast) {
      const bx = p.tx * TILE + width / 2;
      const by = (p.ty + 1) * TILE - 2;
      const dx = prop.cast * 0.85;
      const dy = prop.cast * 0.4;
      g.fillStyle(SHADOW, 0.16).fillPoints([new Phaser.Math.Vector2(bx - 2, by), new Phaser.Math.Vector2(bx + 2, by), new Phaser.Math.Vector2(bx + 2 + dx, by + dy), new Phaser.Math.Vector2(bx - 1 + dx, by + dy)], true);
      if (prop.castBlob) g.fillStyle(SHADOW, 0.15).fillEllipse(bx + dx, by + dy - 2, prop.castBlob[0], prop.castBlob[1]);
    }
    const [w, h] = prop.shadow ?? [width - 4, 4];
    g.fillStyle(SHADOW, 0.24).fillEllipse(p.tx * TILE + width / 2 + (prop.shadow ? 2 : 0), (p.ty + 1) * TILE - 2, w, h);
  }

  rt.draw(g);
  g.destroy();
}

/**
 * Construye una localización a partir de sus datos: hornea suelo y edificios
 * en una sola RenderTexture, coloca los props ordenados por Y y genera los
 * cuerpos de colisión desde solidMask, la misma regla que valida el mundo.
 */
export function buildLocation(scene: Phaser.Scene, def: LocationDef): BuiltLocation {
  const cols = def.ground[0].length;
  const rows = def.ground.length;
  const widthPx = cols * TILE;
  const heightPx = rows * TILE;

  const ground = scene.add.renderTexture(0, 0, widthPx, heightPx).setOrigin(0, 0).setDepth(-10);
  const solids = scene.physics.add.staticGroup();

  // Losas, baldosa y asfalto se pintan en coordenadas de mundo (world/Surfaces); el resto, por tile.
  paintSurfaces(scene, ground, { ground: def.ground, props: def.props, buildings: def.buildings ?? [] });
  ground.beginDraw();
  for (let ty = 0; ty < rows; ty++) {
    const row = def.ground[ty];
    for (let tx = 0; tx < cols; tx++) {
      const tile = TILES[row[tx]];
      if (tile && !painted(row[tx])) ground.batchDraw(variantKey(tile, tx, ty), tx * TILE, ty * TILE);
    }
  }
  // Lo plano (alcantarillas, rejillas, hojas) es suelo: horneado, sin colisión y debajo de todo.
  for (const placement of def.props) {
    const prop = PROPS[placement.kind];
    if (prop.flat) ground.batchDraw(propKey(prop, placement.tx, placement.ty), placement.tx * TILE, placement.ty * TILE);
  }
  const glows: GlowSpot[] = [];
  const windows = bakeBuildings(ground, def.buildings ?? [], glows);
  ground.endDraw();
  bakeKerbsAndShadows(scene, ground, def);

  for (const placement of def.props) {
    const prop = PROPS[placement.kind];
    if (prop.flat) continue;
    const width = (prop.tilesWide ?? 1) * TILE;
    const baseY = placement.ty * TILE + TILE;
    // Lo del techo, por encima de la gente (y por debajo de la luz de world/Lighting).
    scene.add.image(placement.tx * TILE + width / 2, baseY, propKey(prop, placement.tx, placement.ty)).setOrigin(0.5, 1).setDepth(prop.overhead ? OVERHEAD_DEPTH : baseY);
  }

  for (const r of solidRects(solidMask(def))) addSolid(scene, solids, r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE);

  return { widthPx, heightPx, solids, windows, glows };
}
