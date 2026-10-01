import Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { LocationDef } from '../types/game';
import type { WindowSpot } from './BuildingArt';
import { backRows, facadeRows } from '../systems/LocationSystem';
import { PROPS } from './tiles';

/**
 * El último pase del horneado (ART_BIBLE §11: lo que no se mueve, horneado):
 * lo que hace que una calle parezca usada y una fachada, habitada. Se pinta
 * una vez al entrar, encima del suelo y de los edificios; por frame no cuesta
 * nada.
 *
 *   - Ventanas de casa: cortinas, persianas a medias, una maceta en el
 *     alféizar, algún aparato de aire. Cada ventana tiene su «manera» fija
 *     (windowKind), la misma que usa world/Lighting de noche: la de cortinas
 *     de día es la de cortinas encendida.
 *   - Bajantes de pluviales en las esquinas de las fachadas de vecinos.
 *   - Desgaste del suelo: manchas tenues en la acera, más delante de las
 *     puertas; la cuneta junto al bordillo; manchas de aceite en la calzada.
 *
 * Todo en tonos del suelo y con poca opacidad (ART_BIBLE §8: ±3 %): se nota
 * que hay vida, no que haya ruido.
 */

/** Número fijo (0–1) de cada ventana: decide a qué hora se apaga y cómo está. */
export const windowRank = (i: number): number => ((Math.imul(i + 1, 2654435761) >>> 0) % 1000) / 1000;

/** Cómo está cada casa: de más a menos común. De día se ve igual que de noche. */
export const WINDOW_KINDS = ['warm', 'warm', 'warm', 'warm', 'curtain', 'curtain', 'dim', 'dim', 'tv', 'blinds'] as const;
export type WindowKind = (typeof WINDOW_KINDS)[number];
export const windowKind = (i: number): WindowKind => WINDOW_KINDS[Math.floor(windowRank(i * 7 + 3) * WINDOW_KINDS.length)];

const INK = 0x140f1c;
const CURTAINS = [0xe8dcc8, 0xc9a27a, 0xb86a5a, 0x7a8cb0, 0xd8c890] as const;
const WALKWAY = new Set([',', '~', 'c', 'P', 'T']);
const ROADWAY = new Set(['.', ':', '=', 'b']);
/** Estilos de vecinos: los que llevan bajante (un local de cristal, no). */
const HOUSING = /^(res-|home|backdrop)/;

/** Ruido fijo por posición: el mismo sitio, la misma mancha, en cada visita. */
function rnd(x: number, y: number, k: number): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + k * 2147483647, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function bakeDetail(scene: Phaser.Scene, rt: Phaser.GameObjects.RenderTexture, def: LocationDef, windows: readonly WindowSpot[]): void {
  if (def.kind === 'interior') return;
  const g = scene.make.graphics({}, false);
  dressWindows(g, windows);
  downpipes(g, def);
  wear(g, def);
  if (def.showcase) showcaseDepth(g, def, windows, def.showcase);
  for (const z of def.zones ?? []) if (z.profile === 'vintage') streetArt(g, def, z);
  rt.draw(g);
  g.destroy();
}

const SPRAY = [0xff6ab8, 0x5ad8ff, 0xd8b04a, 0x8ff0ff, 0xc0493f, 0xb07aff] as const;
/** Estilos de local que se llenan de pegatinas y firmas en el zócalo. */
const TAGGED = new Set(['tattoo', 'records', 'streetwear', 'piercing', 'bar', 'thrift', 'sneaker', 'vintage']);

/**
 * Arte de calle de la zona vintage (data/districts.ts): lo que deja la gente que pasa, pintado con el suelo.
 *   - Plantillas de spray en el suelo de la acera, pocas y descoloridas: una mancha con sus gotas, una firma en zigzag,
 *     una estrella. Sólo donde no hay un prop encima.
 *   - Firmas y pegatinas en el zócalo de las tiendas, a un lado de la puerta, nunca sobre un escaparate ni la puerta.
 * Determinista: el mismo sitio, la misma firma, en cada visita. Nada de manchas negras: color con poca opacidad.
 */
function streetArt(g: Phaser.GameObjects.Graphics, def: LocationDef, z: NonNullable<LocationDef['zones']>[number]): void {
  const taken = new Set(def.props.map((p) => `${p.tx},${p.ty}`));
  for (let ty = z.ty; ty < z.ty + z.h; ty++) {
    for (let tx = z.tx; tx < z.tx + z.w; tx++) {
      if (def.ground[ty]?.[tx] !== 'P' || taken.has(`${tx},${ty}`) || rnd(tx, ty, 41) >= 0.02) continue;
      const c = SPRAY[Math.floor(rnd(tx, ty, 42) * SPRAY.length)];
      const x = tx * TILE + 3 + Math.floor(rnd(tx, ty, 43) * 8);
      const y = ty * TILE + 3 + Math.floor(rnd(tx, ty, 44) * 8);
      g.fillStyle(c, 0.5);
      const kind = Math.floor(rnd(tx, ty, 45) * 3);
      if (kind === 0) {
        // Mancha con tres gotas.
        g.fillCircle(x, y, 3).fillRect(x - 1, y + 3, 1, 3).fillRect(x + 2, y + 3, 1, 2).fillRect(x, y + 3, 1, 1);
        g.fillStyle(0xffffff, 0.14).fillRect(x - 2, y - 2, 2, 1);
      } else if (kind === 1) {
        // Firma en zigzag, con un subrayado.
        for (let i = 0; i < 7; i++) g.fillRect(x + i, y + (i % 2 === 0 ? 0 : 2), 1, 2);
        g.fillRect(x, y + 4, 8, 1);
      } else {
        // Estrella de cinco puntas muy esquemática.
        g.fillRect(x, y - 3, 1, 7).fillRect(x - 3, y, 7, 1).fillRect(x - 2, y - 2, 1, 1).fillRect(x + 2, y - 2, 1, 1).fillRect(x - 2, y + 2, 1, 1).fillRect(x + 2, y + 2, 1, 1);
      }
    }
  }
  for (const b of def.buildings ?? []) {
    if (!TAGGED.has(b.style) || b.tx < z.tx || b.tx >= z.tx + z.w || b.ty < z.ty || b.ty >= z.ty + z.h) continue;
    // La línea del zócalo: al pie de la fachada al sur, o en la fila de canto de la fachada al norte.
    const y0 = b.front === 's' ? (b.ty + b.h) * TILE - 12 : b.front === 'n' ? b.ty * TILE + 8 : -1;
    if (y0 < 0) continue;
    for (let k = 0; k < 3; k++) {
      const cx = b.tx + Math.floor(rnd(b.tx, b.ty, 50 + k) * b.w);
      if (b.doorX !== undefined && Math.abs(cx - b.doorX) <= 1) continue;
      const x = cx * TILE + 2 + Math.floor(rnd(cx, b.ty, 55 + k) * 6);
      const c = SPRAY[Math.floor(rnd(cx, b.ty, 60 + k) * SPRAY.length)];
      if (k === 0) {
        // Pegatina rectangular con borde blanco.
        g.fillStyle(0xe6e0d4, 0.85).fillRect(x, y0, 5, 4);
        g.fillStyle(c, 0.9).fillRect(x + 1, y0 + 1, 3, 2);
      } else {
        // Firma: tres trazos en el color, y su sombra.
        g.fillStyle(INK, 0.18).fillRect(x + 1, y0 + 5, 7, 1);
        g.fillStyle(c, 0.85);
        for (let i = 0; i < 7; i++) g.fillRect(x + i, y0 + (i % 3 === 1 ? 0 : 2), 1, 2 + (i % 2));
      }
    }
  }
}

/**
 * Escena de muestra (LocationDef.showcase): profundidad de fachada y oclusión
 * más rica, antes de llevarla al resto del mapa. Todo suave (α ≤ 0,3), en el
 * color de la sombra de siempre; nada de manchas negras.
 *
 *   - Ventanas con hueco: el dintel y la jamba izquierda echan sombra sobre el
 *     cristal (luz del noroeste), el dintel recibe luz, el alféizar vuela y deja
 *     su sombra en el muro; debajo de alguna, el churrete de la lluvia.
 *   - Fachadas: la imposta de la planta baja marcada con su sombra, la sombra
 *     del alero bajo el tejado y la humedad que sube por el zócalo.
 *   - Suelo: la oclusión al pie de los edificios llega más lejos y más suave, y
 *     también a los lados; bajo cada prop y cada copa, anillos de sombra que
 *     se funden con el suelo.
 */
function showcaseDepth(g: Phaser.GameObjects.Graphics, def: LocationDef, windows: readonly WindowSpot[], s: NonNullable<LocationDef['showcase']>): void {
  const x0 = s.tx * TILE;
  const y0 = s.ty * TILE;
  const x1 = (s.tx + s.w) * TILE;
  const y1 = (s.ty + s.h) * TILE;
  const inside = (x: number, y: number): boolean => x >= x0 && x < x1 && y >= y0 && y < y1;

  windows.forEach((w, i) => {
    if (!inside(w.x, w.y)) return;
    g.fillStyle(INK, 0.3).fillRect(w.x, w.y, w.w, 1);
    g.fillStyle(INK, 0.15).fillRect(w.x, w.y + 1, w.w, 1);
    if (w.shop) return;
    g.fillStyle(INK, 0.2).fillRect(w.x, w.y + 1, 1, w.h - 1);
    g.fillStyle(0xffffff, 0.12).fillRect(w.x - 1, w.y - 2, w.w + 2, 1);
    g.fillStyle(INK, 0.2).fillRect(w.x - 2, w.y + w.h + 3, w.w + 4, 1);
    g.fillStyle(INK, 0.09).fillRect(w.x - 1, w.y + w.h + 4, w.w + 2, 1);
    if (windowRank(i * 23 + 9) < 0.35) {
      const x = w.x + Math.floor(windowRank(i * 29) * w.w);
      g.fillStyle(INK, 0.06).fillRect(x, w.y + w.h + 4, 1, 4 + Math.floor(windowRank(i * 31) * 6));
    }
  });

  for (const b of def.buildings ?? []) {
    const bx = b.tx * TILE;
    const by = b.ty * TILE;
    const bw = b.w * TILE;
    const bottom = (b.ty + b.h) * TILE;
    if (bx + bw < x0 || bx > x1 || bottom < y0 || by > y1) continue;
    const rows = b.front === 's' ? facadeRows(b) : backRows(b);
    if (rows > 0) {
      const top = bottom - rows * TILE;
      // Sombra del alero sobre la fachada.
      [0.2, 0.11, 0.05].forEach((a, k) => g.fillStyle(INK, a).fillRect(bx, top + k, bw, 1));
      // Imposta de la planta baja: el vuelo con luz arriba y su sombra debajo.
      if (b.front === 's' && (b.floors ?? 1) >= 2) {
        const band = bottom - 2 * TILE;
        g.fillStyle(0xffffff, 0.1).fillRect(bx, band - 1, bw, 1);
        [0.22, 0.12, 0.05].forEach((a, k) => g.fillStyle(INK, a).fillRect(bx, band + 1 + k, bw, 1));
      }
      // Humedad que sube por la base del muro, por encima del zócalo.
      g.fillStyle(INK, 0.05).fillRect(bx, bottom - 10, bw, 6);
    }
    // Oclusión al pie, más larga y suave que la de todo el mapa (que ya pone cuatro filas).
    [0.05, 0.04, 0.03, 0.02, 0.015].forEach((a, k) => g.fillStyle(INK, a).fillRect(bx - 2, bottom + 5 + k, bw + 4, 1));
    // Y a los lados, donde el muro toca la acera.
    [0.1, 0.06, 0.03].forEach((a, k) => {
      g.fillStyle(INK, a).fillRect(bx - 1 - k, by, 1, bottom - by);
      g.fillStyle(INK, a).fillRect(bx + bw + k, by, 1, bottom - by);
    });
  }

  for (const p of def.props) {
    const prop = PROPS[p.kind];
    if (prop.flat || prop.overhead) continue;
    const width = (prop.tilesWide ?? 1) * TILE;
    const cx = p.tx * TILE + width / 2;
    const cy = (p.ty + 1) * TILE - 2;
    if (!inside(cx, cy)) continue;
    if (prop.castBlob) {
      const [bw, bh] = prop.castBlob;
      g.fillStyle(INK, 0.04).fillEllipse(cx, cy - 3, bw * 1.05, bh * 1.2);
      g.fillStyle(INK, 0.05).fillEllipse(cx, cy - 3, bw * 0.55, bh * 0.6);
    }
    const [w, h] = prop.shadow ?? [width - 4, 4];
    g.fillStyle(INK, 0.07).fillEllipse(cx + 1, cy, w * 1.35, h * 2.2);
    g.fillStyle(INK, 0.1).fillEllipse(cx, cy, w * 0.7, Math.max(2, h * 0.8));
  }
}

function dressWindows(g: Phaser.GameObjects.Graphics, windows: readonly WindowSpot[]): void {
  windows.forEach((w, i) => {
    if (w.shop || w.w < 3 || w.h < 4) return;
    const kind = windowKind(i);
    const cloth = CURTAINS[Math.floor(windowRank(i * 11 + 1) * CURTAINS.length)];
    if (kind === 'curtain') {
      // Cortinas recogidas a los lados, con su pliegue.
      g.fillStyle(cloth, 0.9).fillRect(w.x, w.y, 1, w.h).fillRect(w.x + w.w - 1, w.y, 1, w.h);
      g.fillStyle(cloth, 0.55).fillRect(w.x + 1, w.y, 1, Math.ceil(w.h * 0.7)).fillRect(w.x + w.w - 2, w.y, 1, Math.ceil(w.h * 0.7));
    } else if (kind === 'blinds') {
      // Persiana bajada hasta la mitad: lamas claras con su sombra.
      const down = Math.ceil(w.h * 0.55);
      g.fillStyle(0xd8d2c4, 0.92).fillRect(w.x, w.y, w.w, down);
      g.fillStyle(INK, 0.18);
      for (let y = w.y + 1; y < w.y + down; y += 2) g.fillRect(w.x, y, w.w, 1);
    } else if (kind === 'dim' && windowRank(i * 5 + 2) < 0.5) {
      // Visillo: el cristal se ve lechoso.
      g.fillStyle(0xf0ece4, 0.28).fillRect(w.x, w.y + 1, w.w, w.h - 1);
    }
    // Maceta en el alféizar, en una de cada cinco.
    if (windowRank(i * 3 + 7) < 0.2) {
      const x = w.x + Math.floor(windowRank(i * 17) * Math.max(1, w.w - 3));
      g.fillStyle(0xa0563a, 1).fillRect(x, w.y + w.h - 2, 3, 2);
      g.fillStyle(0x4f7d3a, 1).fillRect(x, w.y + w.h - 4, 3, 2);
      g.fillStyle(0x7aa84a, 1).fillRect(x + 1, w.y + w.h - 5, 1, 1);
    }
    // Aparato de aire bajo alguna ventana ancha, con el churrete de agua en el muro.
    if (w.w >= 6 && windowRank(i * 19 + 4) < 0.12) {
      const x = w.x + w.w - 4;
      const y = w.y + w.h + 4;
      g.fillStyle(0xc4c0b6, 1).fillRect(x, y, 6, 4);
      g.fillStyle(0xe0dcd2, 1).fillRect(x, y, 6, 1);
      g.fillStyle(0x6a6d75, 1).fillRect(x + 1, y + 2, 4, 1);
      g.fillStyle(INK, 0.22).fillRect(x + 6, y + 1, 1, 4).fillRect(x + 1, y + 4, 6, 1);
      g.fillStyle(INK, 0.1).fillRect(x + 4, y + 5, 1, 5);
    }
  });
}

/** Bajante de pluviales en cada esquina de las fachadas de vecinos que se ven: tubo, abrazaderas y zapata. */
function downpipes(g: Phaser.GameObjects.Graphics, def: LocationDef): void {
  for (const b of def.buildings ?? []) {
    if (!HOUSING.test(b.style) || b.w < 4) continue;
    const rows = b.front === 's' ? facadeRows(b) : backRows(b);
    if (rows === 0) continue;
    const top = (b.ty + b.h - rows) * TILE;
    const bottom = (b.ty + b.h) * TILE;
    for (const tx of [b.tx, b.tx + b.w - 1]) {
      if (b.doorX === tx) continue;
      const x = tx === b.tx ? tx * TILE + 1 : (tx + 1) * TILE - 3;
      g.fillStyle(0x6a6d75, 1).fillRect(x, top, 2, bottom - top - 1);
      g.fillStyle(0x9a9ca2, 1).fillRect(x, top, 1, bottom - top - 1);
      g.fillStyle(INK, 0.2).fillRect(x + 2, top + 1, 1, bottom - top - 2);
      for (let y = top + 6; y < bottom - 4; y += 12) g.fillStyle(0x4a4c54, 1).fillRect(x - 1, y, 4, 1);
      g.fillStyle(0x4a4c54, 1).fillRect(x - 1, bottom - 3, 4, 2);
    }
  }
}

function wear(g: Phaser.GameObjects.Graphics, def: LocationDef): void {
  const at = (x: number, y: number): string => def.ground[y]?.[x] ?? '';
  // Delante de cada puerta el suelo se gasta más: por ahí entra y sale todo el mundo.
  const doors = new Set((def.buildings ?? []).filter((b) => b.doorX !== undefined).map((b) => `${b.doorX},${b.front === 'n' ? b.ty - 1 : b.ty + b.h}`));
  def.ground.forEach((row, ty) => {
    for (let tx = 0; tx < row.length; tx++) {
      const c = row[tx];
      const x = tx * TILE;
      const y = ty * TILE;
      if (WALKWAY.has(c)) {
        if (doors.has(`${tx},${ty}`)) g.fillStyle(INK, 0.05).fillEllipse(x + 8, y + 8, 14, 10);
        // Una mancha tenue en uno de cada ocho tiles; chicle o un papel en uno de cada veinte.
        if (rnd(tx, ty, 1) < 0.125) g.fillStyle(INK, 0.045 + rnd(tx, ty, 2) * 0.03).fillEllipse(x + 3 + rnd(tx, ty, 3) * 10, y + 3 + rnd(tx, ty, 4) * 10, 3 + rnd(tx, ty, 5) * 5, 2 + rnd(tx, ty, 6) * 3);
        if (rnd(tx, ty, 7) < 0.05) g.fillStyle(0x3a3a44, 0.35).fillRect(x + Math.floor(rnd(tx, ty, 8) * 14), y + Math.floor(rnd(tx, ty, 9) * 14), 1, 1);
        if (rnd(tx, ty, 10) < 0.03) g.fillStyle(0xe6e0d4, 0.5).fillRect(x + Math.floor(rnd(tx, ty, 11) * 13), y + Math.floor(rnd(tx, ty, 12) * 14), 2, 1);
      } else if (ROADWAY.has(c)) {
        // Cuneta: donde la calzada toca el bordillo se queda el agua y la tierra.
        if (WALKWAY.has(at(tx, ty - 1))) {
          g.fillStyle(INK, 0.1).fillRect(x, y + 1, TILE, 2);
          if (rnd(tx, ty, 13) < 0.3) g.fillStyle(0x6b5a3f, 0.35).fillRect(x + Math.floor(rnd(tx, ty, 14) * 13), y + 1, 2, 1);
        }
        if (WALKWAY.has(at(tx, ty + 1))) g.fillStyle(INK, 0.08).fillRect(x, y + TILE - 3, TILE, 2);
        // Aceite donde paran los coches: manchas oscuras y alargadas, pocas.
        if (rnd(tx, ty, 15) < 0.06) g.fillStyle(0x0e0c12, 0.07).fillEllipse(x + 8, y + 8, 7 + rnd(tx, ty, 16) * 5, 3);
      }
    }
  });
}
