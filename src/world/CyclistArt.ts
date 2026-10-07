import type Phaser from 'phaser';
import { PALETTE } from '../config/constants';
import type { BikeType } from '../data/bikes';
import type { NpcLook } from '../types/game';
import { colorsOf, drawHuman, type HumanColors } from './HumanArt';
import { px, shade, type Ctx } from './paint';

/**
 * Ciclistas de perfil, mirando a la derecha: la bici y encima una persona
 * cualquiera (su aspecto de NpcLook, el mismo que la pinta a pie), sentada y
 * pedaleando. Cualquier aspecto sobre cualquier bici: el día que un personaje
 * con nombre o el jugador monten, se pide su textura con su propio aspecto.
 */

export const RIDER_W = 22;
/** Alto de la celda: TOP_PAD px más que la bici para que la cabeza (que se pinta desde y=-5) no se recorte. */
export const RIDER_H = 31;
/** Cuánto se baja todo el dibujo dentro de la celda. */
const TOP_PAD = 5;
/** Cuatro fotogramas de pedalada y uno parado, con un pie en el suelo. */
export const RIDER_FRAMES = 5;
export const RIDER_STOPPED = 4;
/** Luces de la bici en la celda (mirando a la derecha): se encienden de noche encima. */
export const RIDER_LAMPS = { head: [18, 12 + TOP_PAD], tail: [4, 15 + TOP_PAD] } as const;

type Pt = readonly [number, number];
const REAR: Pt = [6, 21];
const FRONT: Pt = [16, 21];
const CRANK: Pt = [10, 21];
const SEAT: Pt = [8, 14];
/** Pedal cercano en cada fotograma de pedalada (un cuarto de vuelta cada uno), y su rodilla. */
const PEDALS: readonly Pt[] = [[13, 21], [10, 24], [7, 21], [10, 18]];
const KNEES: readonly Pt[] = [[12, 16], [11, 18], [10, 17], [12, 15]];
const HELMETS = ['#e6e2d8', '#2b2d33', '#c0493f', '#3f6f78'] as const;
const PACKS = ['#3a4f6e', '#5b4b3a', '#2b2d33', '#7a4a52'] as const;
const RENTAL_BLUE = '#2f6fa8';

/** Quién monta qué: todo lo que hace falta para pintarlo. */
export interface RiderLook {
  look: NpcLook;
  bike: BikeType;
  /** Índice en bike.colors. */
  color: number;
  helmet: boolean;
  pack: boolean;
}

export function riderKey(r: RiderLook): string {
  return `rider-${r.bike.id}-${r.color}-${r.look.id}-${r.helmet ? 'h' : ''}${r.pack ? 'p' : ''}`;
}

/**
 * Las texturas de ciclista pintadas, de la usada hace más tiempo a la última. Cada combinación de cara, bici, color,
 * casco y mochila es una textura (≈ 14 KB) y salen miles posibles: sin tope, crecían con cada escena y cada bici nueva.
 */
const BAKED: string[] = [];
/** Las que se guardan al cambiar de escena: de sobra para la avenida en hora punta. */
const KEEP_BAKED = 48;

/**
 * Al montar una escena (WorldScene.create, antes de las vistas), suelta las texturas de ciclista que pasen del tope:
 * la escena anterior ya destruyó sus imágenes, así que ninguna se queda sin textura.
 * ponytail: sólo poda al cambiar de escena; una sesión larga en la misma calle sigue sumando (unas 7 por minuto).
 */
export function pruneRiderTextures(scene: Phaser.Scene): void {
  while (BAKED.length > KEEP_BAKED) {
    const key = BAKED.shift()!;
    if (scene.textures.exists(key)) scene.textures.remove(key);
  }
}

/** La textura del ciclista con sus cinco fotogramas (0–4); se pinta la primera vez que hace falta. */
export function riderTexture(scene: Phaser.Scene, r: RiderLook): string {
  const key = riderKey(r);
  const at = BAKED.indexOf(key);
  if (at >= 0) BAKED.splice(at, 1);
  BAKED.push(key);
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, RIDER_W * RIDER_FRAMES, RIDER_H);
  if (!tex) return key;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  // Con casco, sin gorra: el casco va encima de la cabeza, no de la visera.
  const colors: HumanColors = { ...colorsOf(r.look), ...(r.helmet ? { cap: undefined } : {}) };
  const body = seated(colors);
  for (let f = 0; f < RIDER_FRAMES; f++) {
    ctx.save();
    ctx.translate(f * RIDER_W, TOP_PAD);
    drawRider(ctx, r, colors, body, f);
    ctx.restore();
    tex.add(f, 0, f * RIDER_W, 0, RIDER_W, RIDER_H);
  }
  tex.refresh();
  return key;
}

/** La persona sentada de perfil, con su contorno, en un lienzo suelto: de ahí se recortan cabeza y tronco. */
function seated(c: HumanColors): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 24;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) drawHuman(ctx, 'right', 4, c);
  return canvas;
}

/**
 * Patinador: la misma persona de pie (cada fotograma, un paso o el cuerpo quieto), sobre una tabla baja y corta
 * (13 × 3 px: unos 0,8 m al lado de una persona de 23 px) con sus ruedas. Sin luces: no lleva.
 * La tabla pesaba 19 × 6 px y el conjunto medía 30 de alto, más que una bici (25) y mucho más que una persona (23).
 */
function drawSkater(ctx: Ctx, r: RiderLook, c: HumanColors, f: number): void {
  const deck = r.bike.colors[r.color];
  // Las ruedas apoyan en la misma línea que las de una bici (fila 25 de la celda).
  ctx.translate(0, 3);
  px(ctx, 'rgba(0,0,0,0.3)', 4, 22, 15, 1);
  // Tabla: la cara de arriba con la gráfica y debajo el canto, sobre dos ruedas.
  px(ctx, PALETTE.outline, 5, 20, 13, 2);
  px(ctx, deck, 6, 20, 11, 1);
  px(ctx, PALETTE.white, 10, 20, 3, 1);
  for (const x of [7, 15]) px(ctx, PALETTE.ink, x - 1, 22, 3, 1);
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 24;
  const bctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!bctx) return;
  // Tronco y cabeza de la persona quieta; las piernas de andar se quitan (de la fila 18 abajo) y se
  // pintan las de patinar: así los pies nunca dan pasos sobre la tabla.
  drawHuman(bctx, 'right', 0, c);
  bctx.clearRect(0, 18, 16, 6);
  ctx.drawImage(canvas, 3, -5);
  const [back, front] = SKATE_STANCE[f === RIDER_STOPPED ? 0 : f];
  skateLeg(ctx, shade(c.trousers, -0.18), shade(c.shoes, -0.1), [9, 13], back[0], back[1]);
  skateLeg(ctx, c.trousers, c.shoes, [12, 13], front[0], front[1]);
}

/**
 * Fotograma del patinador según lo recorrido: casi siempre rueda con los dos
 * pies en la tabla y de vez en cuando se da un empujón con el de atrás
 * (1 apoya, 2 suelta, 3 vuelve a la tabla). El `seed` descompasa a unos de otros.
 */
export function skateFrame(travelled: number, seed: number): number {
  const u = (((travelled + seed * 37) % 150) + 150) % 150;
  return u < 9 ? 1 : u < 14 ? 2 : u < 19 ? 3 : 0;
}

/** [rodilla, pie] de la pierna de atrás y de la de delante en cada fotograma; los pies sobre la tabla están en y=19, el suelo en 22. */
const SKATE_STANCE: readonly (readonly [readonly [Pt, Pt], readonly [Pt, Pt]])[] = [
  [[[8, 16], [7, 19]], [[13, 16], [15, 19]]],
  [[[6, 18], [3, 21]], [[13, 16], [15, 19]]],
  [[[5, 17], [2, 19]], [[13, 16], [15, 19]]],
  [[[7, 16], [5, 19]], [[13, 16], [15, 19]]],
];

/** Una pierna de perfil con su contorno: de la cadera a la rodilla y de ahí al pie, y la zapatilla plantada. */
function skateLeg(ctx: Ctx, color: string, shoe: string, hip: Pt, knee: Pt, foot: Pt): void {
  const seg = (col: string, w: number, o: number): void => {
    line(ctx, col, hip[0] - o, hip[1] - o, knee[0] - o, knee[1] - o, w);
    line(ctx, col, knee[0] - o, knee[1] - o, foot[0] - o, foot[1] - 1 - o, w);
  };
  seg(PALETTE.outline, 4, 1);
  seg(color, 2, 0);
  px(ctx, PALETTE.outline, foot[0] - 2, foot[1] - 1, 5, 3);
  px(ctx, shoe, foot[0] - 1, foot[1], 3, 1);
}

function drawRider(ctx: Ctx, r: RiderLook, c: HumanColors, body: HTMLCanvasElement, f: number): void {
  if (r.bike.frame === 'skate') {
    drawSkater(ctx, r, c, f);
    return;
  }
  const stopped = f === RIDER_STOPPED;
  const lean = r.bike.lean ? 1 : 0;
  const bar: Pt = r.bike.frame === 'road' ? [16, 12] : [15, 11];

  px(ctx, 'rgba(0,0,0,0.3)', 4, 24, 15, 2);
  // Pierna de detrás: detrás de todo, más oscura.
  const far = stopped ? 0 : (f + 2) % 4;
  leg(ctx, shade(c.trousers, -0.18), shade(c.shoes, -0.1), KNEES[far], PEDALS[far]);
  wheel(ctx, REAR, f);
  wheel(ctx, FRONT, f);
  frame(ctx, r.bike, r.bike.colors[r.color], bar);

  // Al pedalear, el cuerpo baja un píxel en los fotogramas impares: sólo tronco, cabeza, casco, mochila y hombro.
  // Ruedas, cuadro, manillar, pedales y sombra no se mueven en ningún fotograma: la bici no despega del carril.
  const b = !stopped && f % 2 === 1 ? 1 : 0;
  // Tronco y cabeza, de la persona sentada; quien va con prisa, con la cabeza un poco adelantada.
  ctx.drawImage(body, 0, 12, 16, 5, 1, 9 + b, 16, 5);
  ctx.drawImage(body, 0, 0, 16, 12, 1 + lean, -3 + b, 16, 12);
  if (r.helmet) {
    const hx = 6 + lean;
    const color = HELMETS[(r.look.id.length + r.color) % HELMETS.length];
    px(ctx, PALETTE.outline, hx - 2, b, 10, 4);
    px(ctx, color, hx - 1, b, 8, 3);
    px(ctx, shade(color, 0.18), hx, b, 4, 1);
    px(ctx, shade(color, -0.3), hx + 1, 1 + b, 1, 1);
    px(ctx, shade(color, -0.3), hx + 4, 1 + b, 1, 1);
  }
  if (r.bike.cube) {
    // La caja del reparto, cuadrada y enorme, con su asa: va a la espalda, sube y baja con el cuerpo.
    px(ctx, PALETTE.outline, 0, 1 + b, 8, 10);
    px(ctx, r.bike.cube, 1, 2 + b, 6, 8);
    px(ctx, shade(r.bike.cube, 0.15), 1, 2 + b, 6, 1);
    px(ctx, shade(r.bike.cube, -0.25), 1, 9 + b, 6, 1);
    px(ctx, PALETTE.ink, 3, 5 + b, 2, 2);
  } else if (r.pack) {
    const pack = PACKS[(r.look.id.length * 3 + r.color) % PACKS.length];
    px(ctx, PALETTE.outline, 3, 6 + b, 4, 7);
    px(ctx, pack, 4, 7 + b, 3, 5);
    px(ctx, shade(pack, 0.15), 4, 7 + b, 3, 1);
    px(ctx, shade(pack, -0.25), 4, 11 + b, 3, 1);
  }
  // Brazo al manillar: el hombro va con el cuerpo, la mano se queda en el manillar.
  const sleeve = c.sleeves ?? c.clothDark;
  line(ctx, sleeve, 8 + lean, 10 + b, bar[0] - 1, bar[1] + 1, 2);
  px(ctx, c.skin, bar[0] - 1, bar[1], 2, 2);
  // Pierna de delante: en el pedal o, parado, con el pie en el suelo.
  if (stopped) leg(ctx, c.trousers, c.shoes, [11, 19], [12, 24]);
  else leg(ctx, c.trousers, c.shoes, KNEES[f], PEDALS[f]);
  px(ctx, PALETTE.ink, CRANK[0], CRANK[1], 1, 1);
}

function leg(ctx: Ctx, color: string, shoe: string, knee: Pt, foot: Pt): void {
  line(ctx, color, SEAT[0], SEAT[1] + 1, knee[0], knee[1], 2);
  line(ctx, color, knee[0], knee[1], foot[0], foot[1] - 1, 2);
  px(ctx, shoe, foot[0] - 1, foot[1], 3, 1);
}

/** Rueda de radio 3,5 (unos 70 cm a la escala del peatón): cubierta, llanta y dos radios que giran con la pedalada. */
function wheel(ctx: Ctx, [cx, cy]: Pt, f: number): void {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > 2.8 && d <= 3.7) px(ctx, PALETTE.ink, cx + dx, cy + dy);
      else if (d > 2 && d <= 2.8) px(ctx, shade(PALETTE.metal, 0.25), cx + dx, cy + dy);
    }
  }
  const a = (f * Math.PI) / 4;
  for (const s of [1, -1]) px(ctx, shade(PALETTE.metal, 0.1), cx + Math.round(s * 2 * Math.cos(a)), cy + Math.round(s * 2 * Math.sin(a)));
  px(ctx, PALETTE.metal, cx, cy);
}

function frame(ctx: Ctx, bike: BikeType, color: string, bar: Pt): void {
  const head: Pt = [bar[0] - 1, bar[1] + 2];
  line(ctx, color, REAR[0], REAR[1], CRANK[0], CRANK[1]);
  line(ctx, color, REAR[0], REAR[1], SEAT[0], SEAT[1] + 1);
  line(ctx, color, CRANK[0], CRANK[1], SEAT[0], SEAT[1]);
  line(ctx, color, head[0], head[1], FRONT[0], FRONT[1]);
  if (bike.frame === 'road') {
    // Cuadro de diamante, manillar bajo.
    line(ctx, color, SEAT[0], SEAT[1] + 1, head[0], head[1]);
    line(ctx, color, CRANK[0], CRANK[1], head[0], head[1] + 1);
    px(ctx, PALETTE.ink, bar[0], bar[1], 2, 1);
    px(ctx, PALETTE.ink, bar[0] + 1, bar[1] + 1, 1, 1);
  } else {
    // Cuadro abierto de paseo, guardabarros y manillar alto.
    line(ctx, color, CRANK[0], CRANK[1] - 1, head[0], head[1] + 2);
    px(ctx, color, REAR[0] - 3, REAR[1] - 4, 6, 1);
    px(ctx, color, FRONT[0] - 3, FRONT[1] - 4, 6, 1);
    px(ctx, PALETTE.ink, bar[0] - 1, bar[1], 3, 1);
    if (bike.frame === 'rental') {
      // La del servicio público: batería azul en el tubo y portabultos delante.
      px(ctx, RENTAL_BLUE, 11, 17, 3, 2);
      px(ctx, shade(PALETTE.metal, 0.2), bar[0] + 1, bar[1] + 1, 4, 2);
      px(ctx, RENTAL_BLUE, bar[0] + 1, bar[1] + 1, 4, 1);
    }
  }
  if (bike.basket) {
    px(ctx, '#6e5234', bar[0] + 1, bar[1], 4, 4);
    px(ctx, '#8a6a42', bar[0] + 1, bar[1], 4, 1);
    px(ctx, '#5a4228', bar[0] + 2, bar[1] + 1, 1, 3);
  }
  // Sillín.
  px(ctx, PALETTE.ink, SEAT[0] - 2, SEAT[1] - 1, 4, 1);
}

/** Línea de píxeles (Bresenham), de `w` px de grosor. */
function line(ctx: Ctx, color: string, x0: number, y0: number, x1: number, y1: number, w = 1): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  for (;;) {
    px(ctx, color, x, y, w, w);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}
