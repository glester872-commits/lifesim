import Phaser from 'phaser';
import { PALETTE, TILE, WIDEST_VIEW } from '../config/constants';
import type { LocationDef } from '../types/game';
import { PROPS, propKey, TILES, variantKey } from './tiles';
import { LAYER, seat, standing } from './Layers';
import { solidMask } from '../systems/LocationSystem';
import { bakeBuildings, type GlowSpot, type WindowSpot } from './BuildingArt';
import { painted, paintSurfaces } from './Surfaces';
import { hex, zonesOf } from '../systems/Districts';
import { DISTRICTS } from '../data/districts';
import { bakeDetail } from './Detail';
import { finishKey, finished } from './UrbanFinish';
import { LightDepth } from './LightDepth';

/** Lado en px de la caja de colisión de un poste, al pie de su tile (PropDef.post). */
const POST_BODY = 6;

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
const WALKWAY = new Set([',', '~', 'c', 'P', 'T', 'V']);
const ROADWAY = new Set(['.', ':', '=', 'b', 'u', 'l']);
const SHADOW = 0x140f1c;
/** Matices de copa: multiplican, así que blanco es el dibujo tal cual y los demás lo desvían un poco. */
const CANOPY_TINTS = [0xffffff, 0xf2faea, 0xfff4e4, 0xeef2ec, 0xf8fff2] as const;
/** Pavimentos de plaza con cenefa donde tocan otro suelo (ART_BIBLE §8); la franja podotáctil no la corta. */
const BORDERED = new Set(['P', '~']);
const BORDER_OK = new Set(['P', '~', 'T']);

/**
 * Lo que da volumen al suelo, horneado con él: bordillo de granito donde la
 * acera toca la calzada (los pasos de cebra quedan rebajados) y la sombra de
 * contacto al pie de cada edificio y de cada prop. La sombra que echa el sol
 * (larga al amanecer, corta a mediodía, hacia el otro lado al atardecer) no se
 * hornea: la pinta world/Lighting en el mapa de luz según la hora. Una vez por
 * visita; en cada frame no cuesta nada.
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

  // Oclusión de la sala: el suelo se oscurece un poco al pie de cada muro, en degradado de cuatro
  // píxeles (a los lados, bajo la cara del fondo, que ya lleva dos, y antes del muro de delante), y
  // bajo lo sólido que está en el suelo (una barra, un mostrador). La sala deja de parecer un plano.
  if (def.kind === 'interior') {
    const floor = (x: number, y: number): boolean => !!TILES[at(x, y)] && !TILES[at(x, y)].solid;
    const wall = (x: number, y: number): boolean => at(x, y) === 'W';
    const solid = (x: number, y: number): boolean => !!TILES[at(x, y)]?.solid;
    const FALL = [0.16, 0.1, 0.06, 0.03];
    def.ground.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (!floor(x, y)) continue;
        const px = x * TILE;
        const py = y * TILE;
        if (wall(x - 1, y)) FALL.forEach((a, i) => g.fillStyle(SHADOW, a).fillRect(px + i, py, 1, TILE));
        if (wall(x + 1, y)) FALL.forEach((a, i) => g.fillStyle(SHADOW, a).fillRect(px + TILE - 1 - i, py, 1, TILE));
        if (wall(x, y - 1)) [0.12, 0.08, 0.05, 0.025].forEach((a, i) => g.fillStyle(SHADOW, a).fillRect(px, py + 2 + i, TILE, 1));
        else if (solid(x, y - 1)) [0.28, 0.14, 0.07, 0.03].forEach((a, i) => g.fillStyle(SHADOW, a).fillRect(px, py + i, TILE, 1));
        if (wall(x, y + 1)) [0.03, 0.06, 0.09].forEach((a, i) => g.fillStyle(SHADOW, a).fillRect(px, py + TILE - 3 + i, TILE, 1));
      }
    });
  }

  // Contacto: la línea oscura donde la fachada toca la acera y, debajo, la penumbra del alero que se
  // desvanece en cuatro filas (oclusión ambiental: no depende del sol, que va aparte en Lighting).
  for (const b of def.buildings ?? []) {
    const y = (b.ty + b.h) * TILE;
    // HD-02: el pie del muro asienta el edificio (antes 0,30 → 0,04 y no se leía a zoom de juego).
    g.fillStyle(SHADOW, 0.42).fillRect(b.tx * TILE, y, b.w * TILE, 1);
    [0.26, 0.17, 0.1, 0.05].forEach((a, i) => g.fillStyle(SHADOW, a).fillRect(b.tx * TILE + 1, y + 1 + i, b.w * TILE, 1));
  }

  for (const p of def.props) {
    const prop = PROPS[p.kind];
    // Lo que cuelga del techo o de la pared no toca el suelo; lo plano ya es suelo.
    if (prop.overhead || prop.flat || at(p.tx, p.ty) === 'W') continue;
    const width = (prop.tilesWide ?? 1) * TILE;
    // Lo alto echa además la sombra del sol, que cambia con la hora: la pinta Lighting.
    // Aquí sólo el contacto con el suelo, que no depende del sol.
    // Bajo una copa siempre hay penumbra, haga sol o no: el árbol no parece pegado encima del suelo.
    if (prop.castBlob) g.fillStyle(SHADOW, 0.16).fillEllipse(p.tx * TILE + width / 2, (p.ty + 1) * TILE - 5, prop.castBlob[0] * 0.75, prop.castBlob[1] * 0.8);
    const [w, h] = prop.shadow ?? [width - 4, 4];
    const cx = p.tx * TILE + width / 2 + (prop.shadow ? 2 : 0);
    const cy = (p.ty + 1) * TILE - 2;
    // Penumbra abierta y núcleo de oclusión pegado a la base: el borde se funde en vez de cortar.
    // HD-02: más honda y corrida un píxel al sureste, del lado contrario a la luz del noroeste.
    g.fillStyle(SHADOW, 0.14).fillEllipse(cx + 2, cy + 1, w + 5, h + 3);
    g.fillStyle(SHADOW, 0.24).fillEllipse(cx + 1, cy, w, h);
    g.fillStyle(SHADOW, 0.26).fillEllipse(cx, cy - 1, Math.max(2, w - 6), Math.max(1, h - 2));
  }

  rt.draw(g);
  g.destroy();
}

/**
 * El suelo de más allá del borde de un exterior. Un barrio más estrecho que la vista (Ribera mide 640 px y un portátil
 * 1366 × 768 ve 683, world/PixelScale) enseñaría el lienzo vacío: la ciudad sigue, cada tile el del borde más cercano,
 * pintado como el del mapa (world/Surfaces), hasta la vista más grande (WIDEST_VIEW). Cuatro franjas, sólo las que
 * hacen falta; sin colisión: el mundo acaba en el mapa.
 */
function bakeOutskirts(scene: Phaser.Scene, def: LocationDef): void {
  const cols = def.ground[0].length;
  const rows = def.ground.length;
  const ox = Math.max(0, Math.ceil((WIDEST_VIEW.width / TILE - cols) / 2));
  const oy = Math.max(0, Math.ceil((WIDEST_VIEW.height / TILE - rows) / 2));
  const at = (tx: number, ty: number): string => def.ground[Math.min(rows - 1, Math.max(0, ty))][Math.min(cols - 1, Math.max(0, tx))];
  const strips: [number, number, number, number][] = [[-ox, -oy, cols + 2 * ox, oy], [-ox, rows, cols + 2 * ox, oy], [-ox, 0, ox, rows], [cols, 0, ox, rows]];
  for (const [x0, y0, w, h] of strips) {
    if (!w || !h) continue;
    const ground = Array.from({ length: h }, (_, ty) => Array.from({ length: w }, (_, tx) => at(x0 + tx, y0 + ty)).join(''));
    const rt = scene.add.renderTexture(x0 * TILE, y0 * TILE, w * TILE, h * TILE).setOrigin(0, 0).setDepth(LAYER.ground);
    paintSurfaces(scene, rt, { ground, props: [], buildings: [], showcase: undefined, finish: finished(def) });
    rt.beginDraw();
    ground.forEach((row, ty) => {
      for (let tx = 0; tx < w; tx++) {
        const tile = TILES[row[tx]];
        if (tile && !painted(row[tx])) rt.batchDraw(variantKey(tile, x0 + tx, y0 + ty), tx * TILE, ty * TILE);
      }
    });
    rt.endDraw();
  }
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

  if (def.kind === 'exterior') bakeOutskirts(scene, def);
  const ground = scene.add.renderTexture(0, 0, widthPx, heightPx).setOrigin(0, 0).setDepth(LAYER.ground);
  const solids = scene.physics.add.staticGroup();

  // Losas, baldosa y asfalto se pintan en coordenadas de mundo (world/Surfaces); el resto, por tile.
  paintSurfaces(scene, ground, { ground: def.ground, props: def.props, buildings: def.buildings ?? [], showcase: def.showcase, finish: finished(def) });
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
    if (prop.flat) ground.batchDraw(finishKey(scene, def, propKey(prop, placement.tx, placement.ty), placement.tx, placement.ty), placement.tx * TILE, placement.ty * TILE);
  }
  // Velo de cada zona (data/districts.ts) sobre el suelo, debajo de edificios y props; el borde, fundido en tres tiles.
  ground.endDraw();
  for (const z of zonesOf(def)) {
    const [color, alpha] = DISTRICTS[z.profile].wash;
    // Tres capas de un tercio: en el centro, el velo entero.
    for (const inset of [0, 1, 2]) {
      ground.fill(hex(color), alpha / 3,(z.tx + inset) * TILE, (z.ty + inset) * TILE, (z.w - inset * 2) * TILE, (z.h - inset * 2) * TILE);
    }
  }
  ground.beginDraw();
  const glows: GlowSpot[] = [];
  const windows = bakeBuildings(ground, def.buildings ?? [], glows);
  ground.endDraw();
  bakeKerbsAndShadows(scene, ground, def);
  // Lo que hace que la calle parezca usada y las casas habitadas (world/Detail): cortinas, bajantes, desgaste.
  bakeDetail(scene, ground, def, windows);

  for (const placement of def.props) {
    const prop = PROPS[placement.kind];
    if (prop.flat) continue;
    const width = (prop.tilesWide ?? 1) * TILE;
    const baseY = placement.ty * TILE + TILE;
    // Lo del techo, por encima de la gente (y por debajo de la luz de world/Lighting).
    // HD-03: con el acabado del sitio, la versión nueva si la hay (world/UrbanFinish).
    const key = finishKey(scene, def, propKey(prop, placement.tx, placement.ty), placement.tx, placement.ty);
    // Una sola densidad de píxel en todo el mundo (HD-03): nada a doble densidad a media escala junto al arte de 1×.
    const img = scene.add.image(placement.tx * TILE + width / 2, baseY, key).setOrigin(0.5, 1).setDepth(prop.overhead ? LAYER.overhead : prop.mount ? seat(baseY) : standing(baseY));
    // Árboles: además de su variante de dibujo, un matiz propio (más verde, más cálido, más apagado) por sitio.
    // Sin espejo: la luz del arte viene siempre del noroeste.
    // Lo alto (árboles, farolas, marquesinas) tapa la luz que tiene detrás (world/LightDepth).
    if (!prop.overhead && prop.tilesHigh >= 2) LightDepth.of(scene).occluder(img);
    if (prop.castBlob) img.setTint(CANOPY_TINTS[(placement.tx * 7 + placement.ty * 13) % CANOPY_TINTS.length]);
    // El respaldo que queda por delante de quien se sienta (una silla vista desde detrás) va encima de él.
    if (prop.front) scene.add.image(placement.tx * TILE + width / 2, baseY, prop.front).setOrigin(0.5, 1).setDepth(standing(baseY) + 1);
  }

  // Dentro, el muro de delante (el que queda al sur de la sala) va por delante de la gente: su canto
  // tapa los pies de quien se arrima, como en una habitación vista desde arriba. La puerta, no.
  if (def.kind === 'interior') {
    const lip = scene.add.graphics().setDepth(LAYER.overhead);
    const top = Phaser.Display.Color.HexStringToColor(PALETTE.wallTop).color;
    def.ground.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== 'W' || !TILES[def.ground[y - 1]?.[x]] || TILES[def.ground[y - 1][x]].solid) continue;
        lip.fillStyle(top, 1).fillRect(x * TILE, y * TILE - 3, TILE, 4);
        lip.fillStyle(0xffffff, 0.08).fillRect(x * TILE, y * TILE - 3, TILE, 1);
      }
    });
  }

  // Terreno, edificios y muebles: el tile entero. Los postes (farolas, señales, bolardos): sólo su palo.
  for (const r of solidRects(solidMask(def, true))) addSolid(scene, solids, r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE);
  for (const p of def.props) {
    if (PROPS[p.kind].post) addSolid(scene, solids, p.tx * TILE + (TILE - POST_BODY) / 2, p.ty * TILE + TILE - POST_BODY, POST_BODY, POST_BODY);
  }

  return { widthPx, heightPx, solids, windows, glows };
}
