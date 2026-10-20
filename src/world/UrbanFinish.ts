import type Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import { getVehicle } from '../data/vehicles';
import type { LocationDef } from '../types/game';
import { make, px, shade, type Ctx } from './paint';
import { drawMetroHero, drawTotemSign, HERO_H, HERO_W } from './UrbanArt';
import { drawVehicle } from './VehicleArt';

/**
 * HD-03, acabado urbano de la manzana piloto (LocationDef.pilot). Las mismas
 * piezas de siempre, del mismo tamaño y con el mismo pie (colisión, asiento,
 * luz y sombra no cambian), pintadas con el lenguaje de Olmo 11: volumen por
 * tonos con la luz del noroeste (canto claro arriba a la izquierda, cara en
 * sombra abajo a la derecha), materiales que se distinguen (hierro, acero,
 * madera, granito, plástico) y contacto con el suelo. Ni brillo añadido ni más
 * objetos: cada textura es la versión `-hd03` de una que ya existe, y sólo se
 * usa dentro de la manzana. El suelo va en world/Surfaces, los árboles en
 * world/Vegetation, los coches en world/VehicleArt y los semáforos en
 * world/SignalView.
 */

type Rect = NonNullable<LocationDef['pilot']>;

/** Si el tile cae en la manzana piloto. */
export function inPilot(pilot: Rect | undefined, tx: number, ty: number): boolean {
  return !!pilot && tx >= pilot.tx && tx < pilot.tx + pilot.w && ty >= pilot.ty && ty < pilot.ty + pilot.h;
}

/** La textura de una pieza en ese tile: dentro de la manzana, su versión `-hd03` si la hay. */
export function pilotKey(scene: Phaser.Scene, def: LocationDef, key: string, tx: number, ty: number): string {
  const fine = `${key}-hd03`;
  return inPilot(def.pilot, tx, ty) && scene.textures.exists(fine) ? fine : key;
}

const IRON = PALETTE.iron;
const IRON_LIT = shade(IRON, 0.16);
const IRON_HI = shade(IRON, 0.32);
const IRON_DK = shade(IRON, -0.32);
const STEEL = PALETTE.metal;
const STEEL_LIT = PALETTE.metalLit;
const GRANITE = PALETTE.plaza;
const WOOD = PALETTE.wood;
const WOOD_LIT = PALETTE.woodLit;
const WOOD_DK = PALETTE.woodDark;
const GLASS_DAY = '#d6caa0';

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + seed * 2246822519, 3266489917);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** Una pieza cilíndrica vista de frente: canto al sol, cuerpo, y la cara en sombra (más honda cuanto más ancha). */
function column(ctx: Ctx, x: number, y: number, w: number, h: number, c: string): void {
  px(ctx, c, x, y, w, h);
  px(ctx, shade(c, 0.18), x, y, 1, h);
  if (w >= 4) px(ctx, shade(c, -0.12), x + w - 2, y, 1, h);
  if (w >= 2) px(ctx, shade(c, -0.3), x + w - 1, y, 1, h);
}

/** Moldura o anillo de hierro: la arista de arriba al sol y la sombra que deja debajo. */
function ring(ctx: Ctx, x: number, y: number, w: number): void {
  column(ctx, x, y, w, 1, IRON);
  px(ctx, IRON_HI, x, y, Math.ceil(w / 2), 1);
}

/** Un racimo de hoja en matas de 2 × 2 (como las copas): `t` < 0 es la cara al sol. */
function leafTone(tones: readonly string[], t: number, x: number, y: number, seed: number): string {
  const clump = hash(x >> 1, y >> 1, seed) - 0.5;
  return tones[Math.max(0, Math.min(tones.length - 1, Math.round(2.2 - (t + clump * 0.45) * 1.7)))];
}

const LEAVES = [shade(PALETTE.leaf, -0.32), shade(PALETTE.leaf, -0.16), PALETTE.leaf, PALETTE.leafLit, shade(PALETTE.leafLit, 0.14)] as const;

// ---------------------------------------------------------------- farolas

/** Cristal del farol de día: el paño de la izquierda coge el cielo, el de la derecha queda en sombra. */
function lanternGlass(ctx: Ctx, x0: number, x1: number, y0: number, h: number, left: boolean): void {
  px(ctx, left ? GLASS_DAY : shade(GLASS_DAY, -0.14), x0, y0, x1 - x0, h);
  if (left) {
    px(ctx, shade(GLASS_DAY, 0.14), x0, y0, x1 - x0 - 1, 1);
    px(ctx, shade(GLASS_DAY, 0.14), x0, y0 + 1, 1, 1);
  }
  // La bombilla, apagada, se adivina detrás del cristal.
  px(ctx, shade('#e8c27a', left ? 0 : -0.12), left ? x1 - 1 : x0, y0 + Math.floor(h / 2), 1, 2);
}

/** Farola fernandina alta (16 × 56): misma silueta y el farol en el mismo sitio (la luz, a 46 px de la base). */
function drawStreetLampFine(ctx: Ctx): void {
  // Basa: zócalo, moldura y cuello, cada uno con su canto al sol.
  column(ctx, 4, 52, 8, 4, IRON);
  px(ctx, IRON_HI, 4, 52, 7, 1);
  px(ctx, IRON_DK, 4, 55, 8, 1);
  column(ctx, 5, 49, 6, 3, IRON);
  px(ctx, IRON_HI, 5, 49, 5, 1);
  column(ctx, 6, 46, 4, 3, IRON);
  px(ctx, IRON_HI, 6, 46, 3, 1);
  // Fuste acanalado con tres anillos; cada anillo deja su sombra en el fuste.
  column(ctx, 7, 15, 3, 31, IRON);
  px(ctx, shade(IRON, -0.12), 8, 27, 1, 18);
  for (const y of [22, 34, 43]) {
    ring(ctx, 6, y, 5);
    px(ctx, shade(IRON, -0.2), 7, y + 1, 3, 1);
  }
  // Cruceta con sus volutas.
  px(ctx, IRON, 3, 13, 11, 1);
  px(ctx, IRON_HI, 3, 13, 5, 1);
  px(ctx, IRON, 3, 14, 1, 1);
  px(ctx, IRON_DK, 13, 14, 1, 1);
  px(ctx, IRON_DK, 7, 14, 3, 1);
  // Farol: remate, sombrerete con su ala, la sombra del ala en el cristal, dos paños y la copa.
  px(ctx, IRON_HI, 8, 0, 1, 1);
  px(ctx, IRON, 6, 1, 5, 1);
  px(ctx, IRON_HI, 6, 1, 2, 1);
  px(ctx, IRON, 4, 2, 9, 1);
  px(ctx, IRON_HI, 4, 2, 4, 1);
  px(ctx, IRON_DK, 4, 3, 9, 1);
  lanternGlass(ctx, 5, 8, 4, 7, true);
  lanternGlass(ctx, 9, 12, 4, 7, false);
  px(ctx, IRON_LIT, 4, 4, 1, 7);
  px(ctx, IRON, 8, 4, 1, 7);
  px(ctx, IRON_DK, 12, 4, 1, 7);
  px(ctx, IRON, 4, 11, 9, 1);
  px(ctx, IRON_LIT, 4, 11, 3, 1);
  px(ctx, IRON, 6, 12, 5, 1);
  px(ctx, IRON_DK, 10, 12, 1, 1);
}

/** Farola fernandina baja (16 × 32), la del parque: la misma familia a menor escala. */
function drawLampFine(ctx: Ctx): void {
  column(ctx, 5, 28, 6, 4, IRON);
  px(ctx, IRON_HI, 5, 28, 5, 1);
  px(ctx, IRON_DK, 5, 31, 6, 1);
  column(ctx, 6, 26, 4, 2, IRON);
  px(ctx, IRON_HI, 6, 26, 3, 1);
  column(ctx, 7, 10, 2, 16, IRON);
  for (const y of [14, 21]) {
    ring(ctx, 6, y, 4);
    px(ctx, shade(IRON, -0.22), 7, y + 1, 2, 1);
  }
  px(ctx, IRON_HI, 7, 0, 2, 1);
  px(ctx, IRON, 6, 1, 4, 1);
  px(ctx, IRON_HI, 6, 1, 2, 1);
  px(ctx, IRON, 5, 2, 6, 1);
  px(ctx, IRON_HI, 5, 2, 3, 1);
  px(ctx, IRON_DK, 6, 3, 4, 1);
  lanternGlass(ctx, 6, 8, 4, 4, true);
  lanternGlass(ctx, 9, 10, 4, 4, false);
  px(ctx, IRON_LIT, 5, 3, 1, 5);
  px(ctx, IRON, 8, 4, 1, 4);
  px(ctx, IRON_DK, 10, 3, 1, 5);
  px(ctx, IRON, 5, 8, 6, 1);
  px(ctx, IRON_LIT, 5, 8, 2, 1);
  px(ctx, IRON, 6, 9, 4, 1);
}

// ----------------------------------------------------------------- bancos

/** Vetas de un listón: trazos cortos un tono más oscuros, cada listón a su aire. */
function grain(ctx: Ctx, x: number, y: number, w: number, tone: string, seed: number): void {
  for (let k = 0; k < Math.floor(w / 7); k++) px(ctx, shade(tone, -0.07), x + 1 + Math.floor(hash(k, y, seed) * (w - 4)), y, 2 + Math.floor(hash(k, y, seed + 1) * 2), 1);
}

/** Banco de plaza (32 × 24): respaldo de tres listones con su hueco, asiento visto desde arriba, costados de fundición y su sombra debajo. */
function drawPlazaBenchFine(ctx: Ctx): void {
  const w = TILE * 2;
  // Montantes del respaldo, por detrás de los listones.
  px(ctx, IRON, 4, 3, 1, 11);
  px(ctx, IRON, w - 5, 3, 1, 11);
  for (const y of [3, 6, 9]) {
    px(ctx, WOOD_LIT, 3, y, w - 6, 1);
    px(ctx, WOOD, 3, y + 1, w - 6, 1);
    grain(ctx, 3, y + 1, w - 6, WOOD, 7 + y);
    px(ctx, WOOD_DK, 3, y, 1, 2);
    px(ctx, WOOD_DK, w - 4, y, 1, 2);
  }
  // Asiento: dos tablas a lo largo con su junta, y el canto en sombra.
  px(ctx, shade(WOOD_LIT, 0.06), 2, 13, w - 4, 1);
  px(ctx, WOOD_LIT, 2, 14, w - 4, 1);
  grain(ctx, 2, 14, w - 4, WOOD_LIT, 31);
  px(ctx, WOOD_DK, 2, 15, w - 4, 1);
  px(ctx, WOOD, 2, 16, w - 4, 1);
  px(ctx, WOOD_DK, 2, 17, w - 4, 1);
  px(ctx, shade(WOOD_DK, -0.14), 2, 18, w - 4, 1);
  // Bajo el asiento, la sombra en el suelo entre las patas.
  ctx.globalAlpha = 0.34;
  px(ctx, PALETTE.ink, 4, 19, w - 8, 2);
  ctx.globalAlpha = 0.16;
  px(ctx, PALETTE.ink, 4, 21, w - 7, 1);
  ctx.globalAlpha = 1;
  px(ctx, IRON, 4, 19, w - 8, 1);
  // Costados de fundición: brazo, patas con su voluta y zapata.
  for (const x of [1, w - 4]) {
    px(ctx, IRON, x, 10, 3, 2);
    px(ctx, IRON_HI, x, 10, 3, 1);
    px(ctx, IRON_LIT, x, 12, 1, 10);
    px(ctx, IRON, x + 1, 13, 1, 7);
    px(ctx, IRON_DK, x + 2, 12, 1, 10);
    px(ctx, IRON_HI, x + 1, 15, 1, 1);
    px(ctx, IRON_DK, x + 1, 18, 1, 1);
    px(ctx, IRON, x - 1, 21, 5, 1);
    px(ctx, IRON_DK, x - 1, 22, 5, 1);
  }
}

/** Banco del parque (16 × 16): dos listones de respaldo, asiento con canto y patas de acero. */
function drawBenchFine(ctx: Ctx): void {
  px(ctx, STEEL, 2, 3, 1, 6);
  px(ctx, STEEL, 13, 3, 1, 6);
  px(ctx, WOOD_LIT, 0, 3, TILE, 1);
  px(ctx, WOOD, 0, 4, TILE, 1);
  px(ctx, WOOD, 0, 6, TILE, 1);
  px(ctx, WOOD_DK, 0, 7, TILE, 1);
  px(ctx, shade(WOOD_LIT, 0.06), 0, 8, TILE, 1);
  px(ctx, WOOD_LIT, 0, 9, TILE, 1);
  grain(ctx, 0, 9, TILE, WOOD_LIT, 41);
  px(ctx, WOOD_DK, 0, 10, TILE, 1);
  px(ctx, shade(WOOD_DK, -0.14), 0, 11, TILE, 1);
  ctx.globalAlpha = 0.3;
  px(ctx, PALETTE.ink, 1, 12, TILE - 2, 2);
  ctx.globalAlpha = 1;
  for (const x of [2, 12]) {
    px(ctx, STEEL_LIT, x, 11, 1, 4);
    px(ctx, shade(STEEL, -0.2), x + 1, 11, 1, 4);
    px(ctx, shade(STEEL, -0.35), x - 1, 15, 4, 1);
  }
}

// -------------------------------------------------------------- papeleras

/** Papelera baja (16 × 16): cubo verde en cilindro, aro con la boca, fleje y pie. */
function drawBinFine(ctx: Ctx): void {
  const g = shade(PALETTE.leaf, -0.1);
  column(ctx, 4, 6, 8, 8, g);
  px(ctx, shade(g, 0.08), 5, 6, 1, 8);
  px(ctx, shade(g, -0.2), 4, 10, 8, 1);
  px(ctx, shade(g, 0.08), 4, 11, 8, 1);
  px(ctx, shade(PALETTE.leaf, 0.12), 4, 4, 8, 1);
  px(ctx, PALETTE.leaf, 4, 5, 8, 1);
  px(ctx, PALETTE.ink, 5, 5, 6, 1);
  px(ctx, STEEL_LIT, 6, 14, 1, 1);
  px(ctx, STEEL, 7, 14, 3, 1);
  px(ctx, shade(STEEL, -0.35), 5, 15, 6, 1);
}

const BIN_GREEN = '#2f4a3c';

/** Papelera alta (16 × 32): el mismo cuerpo antracita, ahora un cilindro con lamas, la boca con algo dentro y el pie anclado. */
function drawBinTallFine(ctx: Ctx): void {
  px(ctx, PALETTE.outline, 3, 11, 10, 19);
  column(ctx, 4, 12, 8, 17, BIN_GREEN);
  px(ctx, shade(BIN_GREEN, 0.08), 5, 12, 1, 17);
  for (const x of [7, 9]) px(ctx, shade(BIN_GREEN, -0.22), x, 15, 1, 12);
  px(ctx, shade(BIN_GREEN, -0.2), 4, 20, 8, 1);
  px(ctx, shade(BIN_GREEN, 0.06), 4, 21, 8, 1);
  // Aro de la boca al sol y, dentro, el negro con la esquina de un periódico.
  px(ctx, shade(BIN_GREEN, 0.36), 3, 11, 10, 1);
  px(ctx, PALETTE.ink, 4, 12, 8, 1);
  px(ctx, shade('#d8d4cc', -0.25), 8, 12, 2, 1);
  px(ctx, STEEL, 5, 29, 6, 2);
  px(ctx, STEEL_LIT, 5, 29, 2, 1);
  px(ctx, shade(STEEL, -0.35), 4, 31, 8, 1);
}

const CONTAINER = ['#d9b43a', '#3f63a8', '#4f8a4a', '#6a6f78'] as const;

/** Contenedor (16 × 20): cuerpo con nervios, tapa con su labio en sombra, ruedas; el de vidrio, el iglú en volumen. */
function drawContainerFine(ctx: Ctx, v: number): void {
  const c = CONTAINER[v];
  if (v === 2) {
    for (let y = 5; y < 19; y++) {
      for (let x = 1; x < 15; x++) {
        const dx = (x + 0.5 - 8) / 6.5;
        const dy = (y + 0.5 - 12.5) / 7;
        if (dx * dx + dy * dy > 1 || y > 18) continue;
        const t = dx * 0.55 + dy * 0.8;
        px(ctx, t < -0.45 ? shade(c, 0.16) : t < 0.1 ? c : t < 0.55 ? shade(c, -0.12) : shade(c, -0.24), x, y);
      }
    }
    px(ctx, shade(c, -0.36), 2, 18, 12, 1);
    for (const x of [5, 9]) {
      px(ctx, PALETTE.ink, x, 10, 2, 2);
      px(ctx, shade(c, 0.2), x, 12, 2, 1);
    }
    return;
  }
  px(ctx, PALETTE.ink, 2, 18, 3, 2);
  px(ctx, PALETTE.ink, 11, 18, 3, 2);
  px(ctx, '#3a3a42', 3, 18, 1, 1);
  px(ctx, '#3a3a42', 12, 18, 1, 1);
  column(ctx, 1, 7, 14, 11, c);
  px(ctx, shade(c, 0.08), 2, 7, 1, 11);
  for (const x of [5, 9]) {
    px(ctx, shade(c, -0.14), x, 8, 1, 8);
    px(ctx, shade(c, 0.07), x + 1, 8, 1, 8);
  }
  px(ctx, shade(c, -0.3), 1, 17, 14, 1);
  // Tapa: la cara de arriba al sol, el labio que sombrea el cuerpo y el asa.
  px(ctx, shade(c, -0.22), 0, 4, 16, 3);
  px(ctx, shade(c, -0.02), 1, 4, 14, 1);
  px(ctx, shade(c, -0.42), 0, 6, 16, 1);
  px(ctx, '#2a2b31', 6, 5, 4, 1);
  px(ctx, PALETTE.ink, 5, 9, 4, 1);
  px(ctx, PALETTE.white, 11, 12, 2, 2);
}

// ---------------------------------------------------------------- señales

/** Señal de aparcamiento (16 × 36): placa con su ribete blanco y su canto, la P, la abrazadera y el poste en cilindro. */
function drawParkingSignFine(ctx: Ctx): void {
  const blue = '#2f5aa8';
  px(ctx, shade(STEEL, -0.35), 6, 34, 4, 1);
  px(ctx, PALETTE.ink, 6, 35, 4, 1);
  column(ctx, 7, 12, 2, 22, STEEL);
  px(ctx, STEEL_LIT, 6, 12, 4, 1);
  px(ctx, shade(STEEL, -0.3), 6, 13, 4, 1);
  // Placa: ribete blanco, campo azul con su luz arriba y el canto de la chapa abajo a la derecha.
  px(ctx, '#e8e6e0', 2, 0, 12, 12);
  px(ctx, '#a9a7a0', 13, 1, 1, 11);
  px(ctx, '#a9a7a0', 3, 11, 11, 1);
  px(ctx, blue, 3, 1, 9, 9);
  px(ctx, shade(blue, 0.12), 3, 1, 9, 1);
  px(ctx, shade(blue, -0.12), 3, 9, 9, 1);
  const white = '#f4f2ec';
  px(ctx, white, 5, 3, 2, 6);
  px(ctx, white, 7, 3, 2, 1);
  px(ctx, white, 9, 4, 1, 2);
  px(ctx, white, 7, 6, 2, 1);
}

/** Tótem de metro (16 × 48): el rótulo de siempre (su brillo encaja encima), con la cara de arriba, el canto y un poste de acero con zapata. */
function drawMetroTotemFine(ctx: Ctx): void {
  column(ctx, 7, 16, 2, 28, STEEL);
  px(ctx, STEEL_LIT, 6, 16, 4, 1);
  column(ctx, 5, 44, 6, 3, STEEL);
  px(ctx, shade(STEEL_LIT, 0.1), 5, 44, 5, 1);
  px(ctx, shade(STEEL, -0.4), 4, 47, 8, 1);
  drawTotemSign(ctx, false);
  px(ctx, '#56638a', 2, 0, 12, 1);
  ctx.globalAlpha = 0.5;
  px(ctx, PALETTE.ink, 14, 1, 1, 15);
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------ decorativos

/** Una bici pequeña (11 × 9): ruedas en aro (se ve el suelo por dentro), cuadro con su luz, sillín y manillar. */
function bikeFine(ctx: Ctx, x: number, y: number, frame: string): void {
  for (const cx of [x + 2, x + 9]) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > 2.2 && d < 3.2) px(ctx, dy < -1 ? '#3a3a42' : PALETTE.ink, cx + dx, y + 6 + dy);
      }
    }
    px(ctx, STEEL_LIT, cx, y + 6, 1, 1);
  }
  px(ctx, frame, x + 3, y + 5, 6, 1);
  px(ctx, shade(frame, 0.25), x + 4, y + 2, 4, 1);
  px(ctx, frame, x + 4, y + 3, 1, 2);
  px(ctx, shade(frame, -0.2), x + 8, y + 2, 1, 3);
  px(ctx, PALETTE.ink, x + 3, y + 1, 3, 1);
  px(ctx, '#3a3a42', x + 3, y + 1, 1, 1);
  px(ctx, STEEL_LIT, x + 8, y + 1, 3, 1);
}

/** Aparcabicis (32 × 20): tres arcos de tubo con su luz arriba y la pata de la derecha en sombra, y las tres bicis de siempre. */
function drawBikeRackFine(ctx: Ctx): void {
  for (const x of [3, 13, 23]) {
    px(ctx, STEEL, x, 7, 1, 12);
    px(ctx, shade(STEEL, -0.25), x + 6, 7, 1, 12);
    px(ctx, STEEL, x, 6, 1, 1);
    px(ctx, shade(STEEL, -0.15), x + 6, 6, 1, 1);
    px(ctx, STEEL_LIT, x + 1, 5, 5, 1);
    px(ctx, shade(STEEL_LIT, 0.18), x + 1, 5, 2, 1);
    px(ctx, shade(STEEL, -0.35), x - 1, 18, 3, 1);
    px(ctx, shade(STEEL, -0.35), x + 5, 18, 3, 1);
  }
  bikeFine(ctx, 1, 9, '#c0493f');
  bikeFine(ctx, 11, 8, '#3f8f8a');
  bikeFine(ctx, 21, 10, PALETTE.amber);
}

/** Flores en corros de un mismo color, no confeti. */
function flowers(ctx: Ctx, spots: readonly (readonly [number, number, string])[]): void {
  for (const [x, y, c] of spots) {
    px(ctx, c, x, y, 1, 1);
    px(ctx, c, x + 1, y + 1, 1, 1);
    px(ctx, c, x - 1, y + 1, 1, 1);
    px(ctx, shade(c, 0.22), x, y + 1, 1, 1);
  }
}

/** Jardinera (32 × 24): arbusto en matas con su cara al sol y su panza en sombra; caja de tablas con postes, clavos y su sombra. */
function drawPlanterBoxFine(ctx: Ctx): void {
  const w = TILE * 2;
  const lobes = [[8, 9, 6], [16, 7, 7], [24, 9, 6]] as const;
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < w; x++) {
      let best = -1;
      let bd = 2;
      lobes.forEach(([cx, cy, r], i) => {
        const d = ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) / (r * r);
        if (d <= 1 && (best < 0 || cy >= lobes[best][1] || d < bd)) {
          best = i;
          bd = d;
        }
      });
      if (best < 0 || (bd > 0.8 && hash(x, y, 51) < 0.25)) continue;
      const [cx, cy, r] = lobes[best];
      const t = ((x + 0.5 - cx) * 0.6 + (y + 0.5 - cy) * 0.8) / r + (y >= 11 ? 0.5 : 0);
      px(ctx, leafTone(LEAVES, t, x, y, 53), x, y);
    }
  }
  flowers(ctx, [[6, 5, '#e06a8a'], [19, 3, PALETTE.white], [26, 6, '#e06a8a'], [13, 8, '#f0c060']]);
  px(ctx, '#3b2c20', 2, 12, w - 4, 1);
  px(ctx, shade(WOOD_LIT, 0.08), 1, 13, w - 2, 1);
  px(ctx, WOOD_LIT, 1, 14, w - 2, 1);
  px(ctx, WOOD, 1, 15, w - 2, 7);
  for (const y of [17, 20]) {
    px(ctx, WOOD_DK, 1, y, w - 2, 1);
    grain(ctx, 3, y - 1, w - 6, WOOD, 61 + y);
  }
  px(ctx, shade(WOOD_LIT, 0.05), 1, 14, 1, 8);
  px(ctx, WOOD_DK, 2, 14, 1, 8);
  px(ctx, WOOD_DK, w - 3, 14, 1, 8);
  px(ctx, shade(WOOD_DK, -0.18), w - 2, 14, 1, 8);
  for (const [x, y] of [[4, 16], [w - 5, 16], [4, 19], [w - 5, 19]] as const) px(ctx, shade(WOOD, -0.28), x, y, 1, 1);
  px(ctx, shade(WOOD_DK, -0.1), 1, 22, w - 2, 1);
  ctx.globalAlpha = 0.35;
  px(ctx, PALETTE.ink, 1, 23, w - 2, 1);
  ctx.globalAlpha = 1;
}

/** Parterre de flores (32 × 16): canto de granito con juntas y bisel, tierra, matas en montículo y flores en corros. */
function drawFlowerBedFine(ctx: Ctx): void {
  const w = TILE * 2;
  px(ctx, shade(GRANITE, 0.1), 1, 4, w - 2, 1);
  px(ctx, '#3a2d22', 2, 5, w - 4, 3);
  for (let y = 0; y < 8; y++) {
    for (let x = 2; x < w - 2; x++) {
      const mound = 5.5 - Math.abs(x + 0.5 - w / 2) / 4.2;
      if (y < 7 - mound || hash(x, y, 71) < 0.12) continue;
      const t = (x - w / 2) / 14 + (y - 4) / 3;
      px(ctx, leafTone(LEAVES, t, x, y, 73), x, y);
    }
  }
  flowers(ctx, [[6, 3, '#e06a8a'], [11, 1, PALETTE.white], [16, 2, '#f0c060'], [21, 1, '#c77adb'], [26, 3, PALETTE.white]]);
  px(ctx, shade(GRANITE, -0.04), 1, 8, w - 2, 6);
  px(ctx, shade(GRANITE, 0.14), 1, 8, w - 2, 1);
  for (const x of [8, 19, 27]) {
    px(ctx, shade(GRANITE, -0.18), x, 9, 1, 5);
    px(ctx, shade(GRANITE, 0.05), x + 1, 9, 1, 5);
  }
  for (let k = 0; k < 14; k++) px(ctx, shade(GRANITE, -0.12), 2 + Math.floor(hash(k, 1, 79) * (w - 5)), 9 + Math.floor(hash(k, 2, 79) * 5));
  px(ctx, shade(GRANITE, -0.22), w - 3, 8, 2, 6);
  px(ctx, shade(GRANITE, -0.3), 1, 14, w - 2, 1);
}

/** Arbusto (16 × 16): matas con la cara al sol arriba a la izquierda y la panza en sombra; el borde casi limpio. */
function drawBushFine(ctx: Ctx): void {
  for (let y = 2; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const dx = (x + 0.5 - 8) / 7;
      const dy = (y + 0.5 - 9.5) / 6;
      const d = dx * dx + dy * dy;
      if (d > 1 || (d > 0.8 && hash(x, y, 83) < 0.3)) continue;
      px(ctx, leafTone(LEAVES, dx * 0.55 + dy * 0.85 + (y >= 13 ? 0.4 : 0), x, y, 89), x, y);
    }
  }
  flowers(ctx, [[5, 6, PALETTE.white]]);
}

// ------------------------------------------------------------ calcomanías

/** Rejilla de desagüe en la plaza (16 × 16): cerco de granito, marco con su canto al sol y las barras. */
function drawDrainFine(ctx: Ctx): void {
  px(ctx, shade(GRANITE, -0.24), 2, 5, 12, 7);
  px(ctx, IRON, 3, 6, 10, 5);
  px(ctx, PALETTE.ink, 4, 7, 8, 3);
  for (let x = 5; x < 12; x += 2) px(ctx, IRON, x, 7, 1, 3);
  px(ctx, IRON_HI, 3, 6, 10, 1);
  px(ctx, IRON_LIT, 3, 6, 1, 5);
  px(ctx, IRON_DK, 3, 10, 10, 1);
  px(ctx, IRON_DK, 12, 6, 1, 5);
}

/** Tapa de registro en la plaza (16 × 16): cerco, aro al sol por el noroeste, rombos y los dos agujeros de la llave. */
function drawManholeFine(ctx: Ctx): void {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      const d = Math.hypot(dx, dy);
      if (d > 6.5) continue;
      let c: string;
      if (d > 5.6) c = shade(GRANITE, -0.22);
      else if (d > 4.6) c = dx + dy < -1 ? IRON_HI : dx + dy > 1 ? IRON_DK : IRON_LIT;
      else c = (x + y) % 3 === 0 || (x - y + 30) % 3 === 0 ? shade(IRON, -0.1) : shade(IRON, 0.05);
      px(ctx, c, x, y);
    }
  }
  px(ctx, PALETTE.ink, 5, 7, 1, 1);
  px(ctx, PALETTE.ink, 10, 8, 1, 1);
}

// ---------------------------------------------------------------- metro

/**
 * Boca principal del metro (80 × 64), sobre la de siempre: pilares de sillares a
 * matajunta con su bisel, albardilla en los pretiles y mamperlán claro en cada
 * peldaño (más gastado cuanto más abajo). La geometría es la misma: su brillo
 * de noche (bs-metro-hero-glow) encaja encima.
 */
function drawMetroHeroFine(ctx: Ctx): void {
  drawMetroHero(ctx);
  const W = HERO_W;
  const H = HERO_H;
  const stone = shade(GRANITE, -0.04);
  for (const x of [0, W - 9]) {
    for (let y = 8; y < H - 2; y += 8) {
      px(ctx, shade(stone, -0.16), x, y, 9, 1);
      px(ctx, shade(stone, 0.06), x + 1, y + 1, 6, 1);
      const jx = x + ((y / 8) % 2 === 0 ? 3 : 6);
      px(ctx, shade(stone, -0.14), jx, y + 1, 1, 7);
      px(ctx, shade(stone, 0.05), jx + 1, y + 1, 1, 7);
    }
  }
  const sx = 26;
  const sw = W - 52;
  for (let k = 0; k < 9; k++) {
    const y = H - 3 - k * 3;
    const tone = -0.02 - k * 0.075;
    px(ctx, shade('#c9bd96', tone * 1.2), sx + 2, y - 2, sw - 4, 1);
  }
  for (const x of [9, W - 26]) {
    px(ctx, shade(GRANITE, 0.14), x, 42, 17, 1);
    px(ctx, shade(GRANITE, -0.1), x, 43, 17, 1);
    for (let y = 47; y < H - 2; y += 5) {
      const jx = x + 3 + Math.floor(hash(x, y, 97) * 10);
      px(ctx, shade(GRANITE, -0.08), jx, y + 1, 1, 4);
    }
  }
}

// ---------------------------------------------------------------- coches

/** Coche aparcado con el acabado de los turismos (world/VehicleArt): el mismo encuadre de 3 × 2 tiles. */
function drawParkedFine(ctx: Ctx, id: string, color: number): void {
  const t = getVehicle(id);
  ctx.save();
  ctx.translate(Math.round((TILE * 3 - t.length) / 2), TILE * 2 - t.height);
  drawVehicle(ctx, t, t.colors[color], 0, true);
  ctx.restore();
}

export function buildUrbanFinishTextures(scene: Phaser.Scene): void {
  make(scene, 'prop-street-lamp-hd03', TILE, 56, drawStreetLampFine);
  make(scene, 'prop-lamp-hd03', TILE, TILE * 2, drawLampFine);
  make(scene, 'prop-plaza-bench-hd03', TILE * 2, 24, drawPlazaBenchFine);
  make(scene, 'prop-bench-hd03', TILE, TILE, drawBenchFine);
  make(scene, 'prop-bin-hd03', TILE, TILE, drawBinFine);
  make(scene, 'prop-bin-tall-hd03', TILE, TILE * 2, drawBinTallFine);
  CONTAINER.forEach((_, v) => make(scene, `prop-container-${v}-hd03`, TILE, 20, (ctx) => drawContainerFine(ctx, v)));
  make(scene, 'prop-parking-sign-hd03', TILE, 36, drawParkingSignFine);
  make(scene, 'prop-metro-totem-hd03', TILE, 48, drawMetroTotemFine);
  make(scene, 'prop-bike-rack-hd03', TILE * 2, 20, drawBikeRackFine);
  make(scene, 'prop-planter-box-hd03', TILE * 2, 24, drawPlanterBoxFine);
  make(scene, 'prop-flower-bed-hd03', TILE * 2, TILE, drawFlowerBedFine);
  make(scene, 'prop-bush-hd03', TILE, TILE, drawBushFine);
  make(scene, 'prop-drain-hd03', TILE, TILE, drawDrainFine);
  make(scene, 'prop-manhole-hd03', TILE, TILE, drawManholeFine);
  make(scene, 'bs-metro-hero-hd03', HERO_W, HERO_H, drawMetroHeroFine);
  for (const [key, id, color] of [['prop-car', 'sedan', 0], ['prop-car-b', 'sedan', 1], ['prop-car-c', 'compact', 1], ['prop-car-taxi', 'taxi', 0]] as const) {
    make(scene, `${key}-hd03`, TILE * 3, TILE * 2, (ctx) => drawParkedFine(ctx, id, color));
  }
}
