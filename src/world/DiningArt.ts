import type Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import { make, px, shade, type Ctx } from './paint';
import type { Dish } from '../data/menus';

/**
 * Comedor (systems/TableService, world/ServiceView): la mesa con mantel, los
 * fogones, lo que se sirve (cada plato y cada bebida, lleno y acabado), la
 * bandeja del camarero, la vajilla sucia y el vapor de la cocina. Mismo idioma
 * que PropArt: luz del noroeste, sin contornos negros.
 */

const CLOTH = '#ede6d6';
const CHECK = '#b8423a';
const PLATE = '#f4f0e6';

/** Mesa con mantel de cuadros: el tablero, la caída del mantel por delante y un salero con una flor. */
function drawDiningTable(ctx: Ctx): void {
  px(ctx, 'rgba(0,0,0,0.18)', 1, 13, 14, 2);
  px(ctx, CLOTH, 1, 2, 14, 9);
  px(ctx, shade(CLOTH, 0.04), 1, 2, 14, 1);
  // Cuadros rojos en el borde del mantel.
  for (let x = 1; x < 15; x += 2) {
    px(ctx, CHECK, x, 2, 1, 1);
    px(ctx, CHECK, x + 1, 10, 1, 1);
  }
  for (let y = 4; y < 10; y += 2) {
    px(ctx, CHECK, 1, y, 1, 1);
    px(ctx, CHECK, 14, y, 1, 1);
  }
  // La caída del mantel, en sombra, y las patas asomando.
  px(ctx, shade(CLOTH, -0.14), 1, 11, 14, 2);
  px(ctx, shade(CLOTH, -0.2), 1, 12, 14, 1);
  px(ctx, PALETTE.woodDark, 3, 13, 1, 2);
  px(ctx, PALETTE.woodDark, 12, 13, 1, 2);
  // Florero y salero en el centro.
  px(ctx, '#6f8fa8', 7, 5, 2, 2);
  px(ctx, PALETTE.leafLit, 7, 4, 1, 1);
  px(ctx, '#d8574a', 8, 3, 1, 1);
  px(ctx, PALETTE.white, 10, 6, 1, 1);
}

/** Fogones de dos tiles contra la pared: cuatro fuegos, una olla y una sartén, y el frente de acero. */
function drawStove(ctx: Ctx): void {
  const steel = shade(PALETTE.metal, 0.12);
  px(ctx, PALETTE.ink, 0, 12, 32, 20);
  px(ctx, steel, 1, 12, 30, 8);
  px(ctx, shade(steel, 0.12), 1, 12, 30, 1);
  for (const x of [4, 12, 20, 26]) px(ctx, PALETTE.ink, x, 14, 4, 3);
  // Olla con su tapa y sartén con mango.
  px(ctx, shade(PALETTE.metal, 0.3), 3, 8, 7, 7);
  px(ctx, shade(PALETTE.metal, 0.45), 3, 8, 7, 1);
  px(ctx, PALETTE.ink, 6, 7, 1, 1);
  px(ctx, PALETTE.ink, 19, 13, 6, 3);
  px(ctx, '#c9a13a', 20, 13, 4, 1);
  px(ctx, PALETTE.ink, 25, 14, 4, 1);
  // Frente: horno con su cristal y los mandos.
  px(ctx, shade(steel, -0.08), 1, 20, 30, 11);
  px(ctx, shade(PALETTE.glass, -0.1), 5, 23, 22, 5);
  px(ctx, shade(PALETTE.glassLit, -0.3), 6, 23, 6, 1);
  for (const x of [4, 10, 16, 22, 27]) px(ctx, PALETTE.ink, x, 21, 1, 1);
}

/** Lo que hay en cada plato o vaso: dos colores. */
const FOOD: Readonly<Record<Dish, readonly [string, string]>> = {
  stew: ['#8a5a2e', '#b77a3e'],
  fish: ['#e8d2a0', '#c9a13a'],
  tortilla: ['#e6c14a', '#c79a2e'],
  croquettes: ['#b87a3a', '#8a5a2e'],
  cake: ['#f0e2b8', '#c9a13a'],
  water: ['#bfe3f0', '#8fd6e8'],
  beer: ['#e2a93a', PALETTE.white],
  wine: ['#7a1f2e', '#a8354a'],
  soda: ['#3a2a24', '#6a4a3a'],
  coffee: ['#4a2f20', '#e8d8c0'],
  // Cafetería: bollería, tostada, bocadillo, zumo, té y chocolate.
  pastry: ['#d9a24a', '#f0c878'],
  toast: ['#d9a86a', '#c0392b'],
  sandwich: ['#e8c890', '#8a5a2e'],
  juice: ['#f0a030', '#ffd070'],
  tea: ['#b86a2a', '#e8d8c0'],
  cocoa: ['#5a3020', '#e8d8c0'],
  // Vinoteca: quesos, embutido, aceitunas, una tapa en salsa, el blanco, el rosado y la botella.
  cheese: ['#f0d070', '#e8b840'],
  ham: ['#b03a3a', '#f0d8c8'],
  olives: ['#6a7a2a', '#8a9a3a'],
  tapa: ['#e0a040', '#c0392b'],
  'wine-white': ['#e8dc90', '#f4ecb8'],
  'wine-rose': ['#e88a90', '#f4b0b4'],
  bottle: ['#2a3a2a', '#7a1f2e'],
  // Pizzería, hamburguesería y sushi (data/foodItems.ts).
  pizza: ['#d9a24a', '#c0392b'],
  burger: ['#8a5a2e', '#6aa84f'],
  fries: ['#f0d070', '#e8b840'],
  sushi: ['#f4f0e0', '#e8785a'],
  nigiri: ['#f4f0e0', '#e8a090'],
};
const DRINKS: ReadonlySet<Dish> = new Set(['water', 'beer', 'wine', 'wine-white', 'wine-rose', 'bottle', 'soda', 'juice', 'coffee', 'tea', 'cocoa']);

/** Un plato visto desde arriba, con su comida o ya rebañado (migas y el tenedor cruzado). */
function drawPlate(ctx: Ctx, dish: Dish, full: boolean): void {
  px(ctx, shade(PLATE, -0.12), 0, 1, 7, 4);
  px(ctx, PLATE, 1, 0, 5, 5);
  px(ctx, PLATE, 0, 1, 7, 3);
  const [a, b] = FOOD[dish];
  if (full) {
    px(ctx, a, 2, 1, 3, 3);
    px(ctx, b, 2, 1, 1, 1);
    if (dish === 'croquettes') px(ctx, b, 4, 3, 1, 1);
  } else {
    px(ctx, shade(a, 0.1), 2, 2, 1, 1);
    px(ctx, shade(a, 0.1), 4, 3, 1, 1);
    px(ctx, PALETTE.metalLit, 1, 3, 5, 1);
  }
}

/** Un vaso, una caña, una copa de vino o una taza: llenos o con el fondo que queda. */
function drawGlass(ctx: Ctx, dish: Dish, full: boolean): void {
  const [a, b] = FOOD[dish];
  if (dish === 'coffee' || dish === 'tea' || dish === 'cocoa') {
    px(ctx, PLATE, 0, 3, 5, 2);
    px(ctx, PALETTE.white, 1, 1, 3, 3);
    px(ctx, full ? a : shade(a, 0.3), 1, 1, 3, 1);
    px(ctx, PALETTE.white, 4, 2, 1, 1);
    return;
  }
  const glass = 'rgba(210,235,245,0.75)';
  if (dish === 'bottle') {
    // Botella de pie con su etiqueta clara; vacía, el cristal oscuro sin vino al trasluz.
    px(ctx, a, 2, 0, 1, 1);
    px(ctx, a, 1, 1, 3, 4);
    px(ctx, '#e8dcc0', 1, 2, 3, 1);
    if (full) px(ctx, b, 3, 3, 1, 2);
    return;
  }
  if (dish === 'wine' || dish === 'wine-white' || dish === 'wine-rose') {
    // Copa: el cáliz, el tallo y el pie.
    px(ctx, glass, 1, 0, 3, 3);
    px(ctx, glass, 2, 3, 1, 1);
    px(ctx, glass, 1, 4, 3, 1);
    if (full) px(ctx, a, 1, 1, 3, 2);
    else px(ctx, b, 2, 2, 1, 1);
    return;
  }
  px(ctx, glass, 1, 0, 3, 5);
  if (full) {
    px(ctx, a, 1, 1, 3, 4);
    px(ctx, b, 1, 0, 3, 1);
  } else px(ctx, a, 1, 4, 3, 1);
}

/** La bandeja redonda del camarero con lo que lleva: un plato y una copa. */
function drawTray(ctx: Ctx): void {
  px(ctx, shade(PALETTE.metal, 0.3), 0, 3, 10, 2);
  px(ctx, shade(PALETTE.metal, 0.45), 1, 3, 8, 1);
  px(ctx, PLATE, 1, 1, 5, 2);
  px(ctx, '#b77a3e', 2, 1, 3, 1);
  px(ctx, 'rgba(210,235,245,0.8)', 7, 0, 2, 3);
  px(ctx, '#a8354a', 7, 1, 2, 2);
}

/** La vajilla recogida: platos apilados con un vaso encima. */
function drawDishes(ctx: Ctx): void {
  px(ctx, shade(PLATE, -0.14), 0, 3, 8, 2);
  px(ctx, PLATE, 0, 2, 8, 1);
  px(ctx, shade(PLATE, -0.06), 1, 1, 6, 1);
  px(ctx, '#8a5a2e', 3, 1, 1, 1);
  px(ctx, 'rgba(210,235,245,0.8)', 5, 0, 2, 2);
}

/** Vapor de la cocina: tres volutas que suben, en dos fases. */
function drawSteam(ctx: Ctx, phase: number): void {
  ctx.globalAlpha = 0.5;
  const dx = phase ? 1 : 0;
  px(ctx, '#e8e6e0', 1 + dx, 7, 2, 2);
  px(ctx, '#efede8', 2 - dx, 4, 2, 2);
  px(ctx, '#f6f4f0', 1 + dx, 1, 2, 2);
  ctx.globalAlpha = 1;
}

/** Si ese plato es una bebida (va en vaso) o comida (va en plato). */
export const isDrink = (dish: Dish): boolean => DRINKS.has(dish);

export function buildDiningTextures(scene: Phaser.Scene): void {
  make(scene, 'prop-dining-table', TILE, TILE, drawDiningTable);
  make(scene, 'prop-stove', TILE * 2, TILE * 2, drawStove);
  for (const dish of Object.keys(FOOD) as Dish[]) {
    for (const full of [true, false]) {
      const key = `fx-${dish}-${full ? 'full' : 'empty'}`;
      if (isDrink(dish)) make(scene, key, 5, 5, (ctx) => drawGlass(ctx, dish, full));
      else make(scene, key, 7, 5, (ctx) => drawPlate(ctx, dish, full));
    }
  }
  make(scene, 'fx-tray', 10, 5, drawTray);
  make(scene, 'fx-dishes', 8, 5, drawDishes);
  for (let v = 0; v < 2; v++) make(scene, `fx-steam-${v}`, 5, 9, (ctx) => drawSteam(ctx, v));
}
