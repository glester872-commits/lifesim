import type Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import type { BuildingDef, BuildingStyle } from '../types/game';
import { glow, make, px, shade, sprinkle, type Ctx } from './paint';
import { batch, hash as noise, mix } from './Surfaces';

/**
 * Fachadas, tejados y rótulos de los edificios. Cada estilo se reconoce sin
 * leer: el gimnasio es una banda de cristal con neón, la tienda de ropa un
 * escaparate corrido con toldo negro, el súper cristal y toldo verde, la
 * cafetería madera y toldo ámbar. El rótulo es un icono, no una palabra: a
 * 16 px por tile una palabra no se lee y fingir que sí es peor que no ponerla.
 */

type Shop = 'windows' | 'display' | 'glass' | 'shutter' | 'arched' | 'metro';
type Upper = 'windows' | 'balcony' | 'glass' | 'band';
type Sign = 'house' | 'dumbbell' | 'cup' | 'hanger' | 'basket' | 'fork' | 'cross' | 'scissors' | 'euro' | 'apple' | 'key' | 'drop' | 'book' | 'flag' | 'plate' | 'note';
type Door = 'glass' | 'wood' | 'metal' | 'stairs' | 'home';

interface Look {
  roof: string;
  roofLit: string;
  wall: string;
  shop: Shop;
  upper: Upper;
  /** Hueco iluminado. */
  lit: string;
  door: Door;
  awning?: readonly [string, string];
  sign?: Sign;
}

const RUST = '#c0493f';
const NEON_PINK = '#ff6ab8';
const NEON_CYAN = '#8ff0ff';

const LOOKS: Readonly<Record<BuildingStyle, Look>> = {
  // Tu portal: el único bloque con puerta verde, todo encendido y plantas en cada balcón.
  home: { roof: PALETTE.roofB, roofLit: PALETTE.roofBLit, wall: shade(PALETTE.wallLit, 0.06), shop: 'windows', upper: 'balcony', lit: PALETTE.amber, door: 'home', sign: 'house' },
  'res-brick': { roof: PALETTE.roofA, roofLit: PALETTE.roofALit, wall: PALETTE.brick, shop: 'windows', upper: 'balcony', lit: PALETTE.amberDim, door: 'wood' },
  'res-stone': { roof: PALETTE.roofB, roofLit: PALETTE.roofBLit, wall: PALETTE.stone, shop: 'windows', upper: 'windows', lit: PALETTE.amberDim, door: 'wood' },
  'res-plaster': { roof: PALETTE.roofA, roofLit: PALETTE.roofALit, wall: shade(PALETTE.wallLit, 0.05), shop: 'windows', upper: 'balcony', lit: PALETTE.amber, door: 'wood' },
  metro: { roof: PALETTE.night, roofLit: shade(PALETTE.night, 0.06), wall: PALETTE.night, shop: 'metro', upper: 'windows', lit: PALETTE.amber, door: 'stairs' },
  gym: { roof: PALETTE.roofBLit, roofLit: shade(PALETTE.roofBLit, 0.05), wall: PALETTE.metal, shop: 'glass', upper: 'band', lit: PALETTE.glassLit, door: 'glass', sign: 'dumbbell' },
  cafe: { roof: PALETTE.roofB, roofLit: PALETTE.roofBLit, wall: PALETTE.wood, shop: 'windows', upper: 'windows', lit: PALETTE.amber, door: 'glass', awning: [PALETTE.amberDim, PALETTE.white], sign: 'cup' },
  fashion: { roof: PALETTE.roofALit, roofLit: shade(PALETTE.roofALit, 0.05), wall: shade(PALETTE.white, -0.12), shop: 'display', upper: 'windows', lit: PALETTE.white, door: 'glass', awning: [PALETTE.ink, shade(PALETTE.ink, 0.12)], sign: 'hanger' },
  super: { roof: PALETTE.roofA, roofLit: PALETTE.roofALit, wall: PALETTE.stoneLit, shop: 'glass', upper: 'windows', lit: PALETTE.white, door: 'glass', awning: [PALETTE.leafLit, PALETTE.white], sign: 'basket' },
  restaurant: { roof: PALETTE.roofB, roofLit: PALETTE.roofBLit, wall: PALETTE.brick, shop: 'windows', upper: 'windows', lit: PALETTE.amber, door: 'wood', awning: [PALETTE.rug, PALETTE.rugLit], sign: 'fork' },
  office: { roof: PALETTE.stone, roofLit: PALETTE.stoneLit, wall: PALETTE.glass, shop: 'glass', upper: 'glass', lit: PALETTE.glassLit, door: 'glass', sign: 'plate' },
  study: { roof: PALETTE.roofALit, roofLit: shade(PALETTE.roofALit, 0.04), wall: PALETTE.stoneLit, shop: 'arched', upper: 'windows', lit: PALETTE.glassLit, door: 'wood', sign: 'book' },
  pharmacy: { roof: PALETTE.roofA, roofLit: PALETTE.roofALit, wall: PALETTE.stone, shop: 'glass', upper: 'windows', lit: PALETTE.white, door: 'glass', sign: 'cross' },
  hair: { roof: PALETTE.roofBLit, roofLit: shade(PALETTE.roofBLit, 0.04), wall: PALETTE.wallLit, shop: 'display', upper: 'balcony', lit: PALETTE.amber, door: 'glass', awning: ['#3f6f78', PALETTE.white], sign: 'scissors' },
  bank: { roof: PALETTE.roofB, roofLit: PALETTE.roofBLit, wall: PALETTE.stoneLit, shop: 'glass', upper: 'windows', lit: PALETTE.white, door: 'glass', sign: 'euro' },
  // La discoteca: fachada negra, cristal teñido de neón y la nota musical.
  club: { roof: PALETTE.roofB, roofLit: PALETTE.roofBLit, wall: PALETTE.night, shop: 'glass', upper: 'windows', lit: NEON_PINK, door: 'metal', sign: 'note' },
  fruit: { roof: PALETTE.roofB, roofLit: PALETTE.roofBLit, wall: PALETTE.wallLit, shop: 'display', upper: 'windows', lit: PALETTE.amber, door: 'glass', awning: [PALETTE.leaf, PALETTE.leafLit], sign: 'apple' },
  hardware: { roof: PALETTE.roofA, roofLit: PALETTE.roofALit, wall: PALETTE.metal, shop: 'windows', upper: 'windows', lit: PALETTE.amber, door: 'metal', awning: [PALETTE.amberDim, PALETTE.ink], sign: 'key' },
  laundry: { roof: PALETTE.roofBLit, roofLit: shade(PALETTE.roofBLit, 0.04), wall: shade(PALETTE.white, -0.2), shop: 'display', upper: 'windows', lit: PALETTE.glassLit, door: 'glass', sign: 'drop' },
  civic: { roof: PALETTE.roofA, roofLit: PALETTE.roofALit, wall: PALETTE.stoneLit, shop: 'arched', upper: 'windows', lit: PALETTE.glassLit, door: 'wood', sign: 'flag' },
  works: { roof: PALETTE.ballast, roofLit: PALETTE.metal, wall: PALETTE.metal, shop: 'shutter', upper: 'windows', lit: PALETTE.amber, door: 'metal' },
  backdrop: { roof: PALETTE.roofA, roofLit: PALETTE.roofALit, wall: PALETTE.wall, shop: 'windows', upper: 'windows', lit: PALETTE.amberDim, door: 'wood' },
};

const STYLES = Object.keys(LOOKS) as BuildingStyle[];

// ------------------------------------------------------------- piezas

/** Tres tonos por estilo: dos bloques vecinos del mismo tipo no comparten tejado. */
const ROOF_TONES = [-0.035, 0, 0.035] as const;

/**
 * Material de tejado: el de un edificio entero, pintado de una vez en sus
 * coordenadas y no por tile. Así una teja cruza la junta del tile, la
 * intemperie va por manchas amplias (lo que da el sol se aclara, lo que
 * encharca se oscurece) y dos manzanas con el mismo estilo no se repiten.
 * El remate cuenta la altura: albardilla de piedra y su sombra en azotea;
 * alero con la luz del noroeste en teja.
 */
function drawRoofArea(ctx: Ctx, look: Look, style: BuildingStyle, tone: number, w: number, h: number, seed: number, capSouth: boolean): void {
  const base = shade(look.roof, ROOF_TONES[tone]);
  const n = Number.parseInt(base.slice(1), 16);
  const tiled = ((n >> 16) & 255) > (n & 255) + 24;
  const weather = (x: number, y: number): number => batch(x, y, 36, seed) * 0.05 + batch(x, y, 11, seed + 3) * 0.02;

  if (tiled) {
    // Teja árabe al tresbolillo; una cumbrera parte el faldón en dos aguas.
    const ridge = h >= TILE * 3 ? Math.floor((h * 0.42) / 4) * 4 : -1;
    for (let y = 0; y < h; y += 4) {
      const slope = ridge < 0 ? 0 : y < ridge ? 0.025 : -0.02;
      const shift = ((y / 4) % 2) * 2;
      for (let x = -shift; x < w; x += 4) {
        const r = (k: number): number => noise(seed + x, y, k);
        let t = shade(base, weather(x, y) + slope + (r(1) - 0.5) * 0.045);
        if (r(2) < 0.025) t = mix(t, '#c9784e', 0.4); // teja repuesta
        else if (r(2) > 0.965) t = shade(t, -0.07); // teja vieja
        else if (r(2) > 0.94 && y > h * 0.5) t = mix(t, '#7d8a4a', 0.35); // líquen del lado húmedo
        px(ctx, t, x, y, 4, 3);
        px(ctx, shade(t, 0.07), x + 1, y, 1, 2);
        px(ctx, shade(t, -0.1), x, y + 3, 4, 1);
      }
    }
    if (ridge >= 0) {
      const cap = shade(base, 0.03);
      px(ctx, shade(base, -0.14), 0, ridge + 3, w, 1);
      px(ctx, cap, 0, ridge, w, 3);
      px(ctx, shade(cap, 0.08), 0, ridge, w, 1);
      for (let x = 0; x < w; x += 6) px(ctx, shade(cap, -0.06), x, ridge + 1, 1, 2);
    }
    // Alero: luz arriba e izquierda, sombra abajo y a la derecha.
    px(ctx, shade(base, 0.1), 0, 0, w, 1);
    px(ctx, shade(base, 0.06), 0, 0, 1, h);
    px(ctx, shade(base, -0.16), w - 2, 0, 2, h);
    if (capSouth) px(ctx, shade(base, -0.18), 0, h - 2, w, 2);
  } else {
    // Azotea: losas de 8 px con tanda y matiz, manchas de agua y algún parche de tela asfáltica.
    for (let y = 0; y < h; y += 8) {
      for (let x = 0; x < w; x += 8) {
        const r = (k: number): number => noise(seed + x, y, k);
        const t = shade(base, weather(x, y) + (r(1) - 0.5) * 0.04);
        px(ctx, t, x, y, 8, 8);
        px(ctx, shade(t, 0.03), x, y, 8, 1);
        px(ctx, shade(t, -0.06), x, y + 7, 8, 1);
        px(ctx, shade(t, -0.05), x + 7, y, 1, 7);
        if (r(2) < 0.05) px(ctx, shade(t, -0.07), x + 1, y + 2, 6, 4); // parche sellado
        else if (r(2) < 0.22) px(ctx, look.roofLit, x + 1 + Math.floor(r(3) * 6), y + 1 + Math.floor(r(4) * 6));
      }
    }
    // Cercos de agua: donde encharca, el barro se oscurece en manchas, no en recuadros.
    ctx.globalAlpha = 0.06;
    for (let y = 3; y < h - 3; y++) {
      for (let x = 3; x < w - 3; x++) if (batch(x, y, 14, seed + 9) > 0.55) px(ctx, PALETTE.ink, x, y);
    }
    ctx.globalAlpha = 1;
    // Sumidero en una esquina, con su rejilla.
    const dx = seed % 2 ? w - 9 : 5;
    px(ctx, shade(PALETTE.ink, 0.05), dx, h - 9, 4, 4);
    px(ctx, PALETTE.metal, dx + 1, h - 8, 1, 2);
    px(ctx, PALETTE.metal, dx + 2, h - 8, 1, 2);
    if (style !== 'metro') {
      // La albardilla del pretil tira sombra hacia dentro: más al norte y al oeste (luz del noroeste).
      for (let d = 0; d < 4; d++) {
        ctx.globalAlpha = 0.22 - d * 0.05;
        px(ctx, PALETTE.ink, 3, 3 + d, w - 6, 1);
        px(ctx, PALETTE.ink, 3 + d, 3, 1, h - 6);
      }
      ctx.globalAlpha = 1;
      const stone = shade(PALETTE.stoneLit, 0.02);
      px(ctx, stone, 0, 0, w, 3);
      px(ctx, stone, 0, 0, 3, h);
      px(ctx, shade(stone, -0.1), w - 3, 0, 3, h);
      if (capSouth) px(ctx, shade(stone, -0.14), 0, h - 3, w, 3);
      px(ctx, shade(stone, 0.08), 0, 0, w, 1);
      px(ctx, shade(stone, -0.25), 3, 3, w - 6, 1);
      // Juntas de la albardilla, una por tile.
      for (let x = TILE; x < w; x += TILE) px(ctx, shade(stone, -0.12), x, 0, 1, 3);
    }
  }
  if (style === 'works') {
    for (let i = 0; i < w; i += 5) px(ctx, PALETTE.amberDim, i, 0, 1, h);
    for (let y = 4; y < h; y += 8) px(ctx, PALETTE.metalLit, 0, y, w, 1);
  }
}

function drawAwning(ctx: Ctx, look: Look): void {
  if (!look.awning) return;
  const [a, b] = look.awning;
  for (let x = 0; x < TILE; x += 4) {
    px(ctx, a, x, 0, 2, 4);
    px(ctx, b, x + 2, 0, 2, 4);
  }
  px(ctx, shade(a, -0.2), 0, 4, TILE, 1);
}

/** Planta baja: muro, alero y el hueco propio del tipo de local. variant 0 = muro. */
function drawFront(ctx: Ctx, look: Look, variant: number): void {
  const eave = shade(look.wall, 0.08);
  px(ctx, look.wall, 0, 0, TILE, TILE);
  px(ctx, eave, 0, 0, TILE, 2);
  px(ctx, shade(look.wall, -0.1), 0, 15, TILE, 1);
  sprinkle(ctx, shade(look.wall, 0.04), TILE, TILE, 61 + variant, 6);
  const dark = variant === 2;
  switch (look.shop) {
    case 'windows':
      if (variant === 0) break;
      px(ctx, shade(look.wall, -0.14), 3, 5, 10, 8);
      px(ctx, dark ? PALETTE.glass : shade(look.lit, -0.35), 4, 6, 8, 6);
      if (!dark) {
        px(ctx, look.lit, 4, 6, 8, 1);
        px(ctx, look.lit, 4, 6, 1, 6);
      }
      px(ctx, shade(look.wall, 0.1), 3, 13, 10, 1);
      break;
    case 'display':
      if (variant === 0) break;
      px(ctx, PALETTE.ink, 0, 4, TILE, 11);
      px(ctx, shade(PALETTE.glass, 0.1), 1, 5, 14, 9);
      glow(ctx, 8, 8, 7, 0.14, look.lit);
      // Siluetas de lo expuesto: prendas en la moda, frutas en la frutería, tambores en la lavandería.
      if (dark) {
        px(ctx, '#8c5a6e', 3, 7, 3, 6);
        px(ctx, PALETTE.white, 4, 5, 1, 2);
        px(ctx, '#5c6fa8', 10, 7, 3, 6);
        px(ctx, PALETTE.white, 11, 5, 1, 2);
      } else {
        px(ctx, PALETTE.amber, 3, 10, 3, 3);
        px(ctx, RUST, 7, 10, 3, 3);
        px(ctx, PALETTE.leafLit, 11, 10, 3, 3);
        px(ctx, shade(look.lit, -0.2), 4, 6, 8, 2);
      }
      px(ctx, look.lit, 1, 5, 14, 1);
      break;
    case 'glass':
      if (variant === 0) {
        px(ctx, shade(look.wall, -0.06), 0, 3, TILE, 12);
        break;
      }
      px(ctx, PALETTE.ink, 0, 3, TILE, 12);
      px(ctx, dark ? PALETTE.glass : shade(PALETTE.glass, 0.12), 1, 4, 14, 10);
      px(ctx, shade(look.lit, dark ? -0.3 : 0), 1, 4, 14, 1);
      px(ctx, shade(PALETTE.glassLit, -0.3), 3, 6, 1, 6);
      px(ctx, PALETTE.ink, 8, 4, 1, 10);
      break;
    case 'shutter':
      px(ctx, PALETTE.metal, 1, 3, 14, 12);
      for (let y = 4; y < 15; y += 2) px(ctx, shade(PALETTE.metal, variant === 2 ? -0.12 : -0.06), 1, y, 14, 1);
      if (variant === 2) px(ctx, PALETTE.ink, 1, 12, 14, 3);
      break;
    case 'arched':
      if (variant === 0) break;
      px(ctx, shade(look.wall, -0.14), 4, 3, 8, 12);
      px(ctx, dark ? PALETTE.glass : shade(look.lit, -0.35), 5, 5, 6, 10);
      px(ctx, look.wall, 5, 4, 1, 1);
      px(ctx, look.wall, 10, 4, 1, 1);
      px(ctx, shade(look.lit, dark ? -0.3 : -0.1), 5, 5, 6, 1);
      break;
    case 'metro':
      px(ctx, PALETTE.night, 0, 0, TILE, TILE);
      px(ctx, shade(PALETTE.night, 0.08), 0, 0, TILE, 3);
      px(ctx, shade(PALETTE.night, 0.04), 2, 6, 12, 8);
      break;
  }
  if (look.shop !== 'metro') drawAwning(ctx, look);
}

/** Primera planta: ventanas con alféizar, balcones o cristal corrido. */
function drawUpper(ctx: Ctx, look: Look, variant: number): void {
  px(ctx, look.wall, 0, 0, TILE, TILE);
  px(ctx, shade(look.wall, 0.1), 0, 0, TILE, 1);
  sprinkle(ctx, shade(look.wall, 0.05), TILE, TILE, 31 + variant, 5);
  const lit = variant === 1;
  switch (look.upper) {
    case 'glass':
      px(ctx, PALETTE.ink, 0, 2, TILE, 12);
      px(ctx, shade(PALETTE.glass, lit ? 0.14 : 0.04), 1, 3, 14, 10);
      if (lit) px(ctx, PALETTE.glassLit, 1, 3, 14, 1);
      px(ctx, PALETTE.ink, 8, 3, 1, 10);
      return;
    case 'band':
      px(ctx, PALETTE.ink, 0, 5, TILE, 7);
      px(ctx, shade(PALETTE.glass, 0.12), 0, 6, TILE, 5);
      px(ctx, PALETTE.glassLit, 0, 12, TILE, 1);
      glow(ctx, 8, 12, 6, 0.12, PALETTE.glassLit);
      return;
    case 'windows':
    case 'balcony':
      if (variant === 0) return;
      px(ctx, shade(look.wall, -0.14), 4, 3, 8, 9);
      px(ctx, lit ? shade(look.lit, -0.3) : PALETTE.glass, 5, 4, 6, 7);
      if (lit) px(ctx, look.lit, 5, 4, 6, 1);
      px(ctx, shade(look.wall, 0.12), 3, 12, 10, 1);
      if (look.upper === 'balcony' && variant === 2) {
        px(ctx, PALETTE.metal, 1, 11, 14, 1);
        for (let x = 2; x < 15; x += 3) px(ctx, PALETTE.metal, x, 11, 1, 4);
        px(ctx, PALETTE.metal, 1, 14, 14, 1);
        px(ctx, PALETTE.leaf, 11, 9, 3, 2);
        px(ctx, PALETTE.brick, 11, 11, 3, 2);
      }
  }
}

function drawDoor(ctx: Ctx, look: Look): void {
  px(ctx, look.wall, 0, 0, TILE, TILE);
  px(ctx, shade(look.wall, 0.08), 0, 0, TILE, 2);
  switch (look.door) {
    case 'glass':
      px(ctx, PALETTE.ink, 2, 3, 12, 13);
      px(ctx, shade(PALETTE.glass, 0.15), 3, 4, 10, 12);
      px(ctx, PALETTE.ink, 8, 4, 1, 12);
      px(ctx, shade(look.lit, -0.1), 3, 4, 10, 1);
      glow(ctx, 8, 12, 6, 0.18, look.lit);
      break;
    case 'wood':
      px(ctx, PALETTE.woodDark, 2, 2, 12, 14);
      px(ctx, PALETTE.wood, 3, 3, 10, 13);
      px(ctx, PALETTE.woodLit, 3, 3, 10, 1);
      px(ctx, shade(PALETTE.amber, -0.35), 5, 5, 6, 4);
      px(ctx, PALETTE.amber, 5, 5, 6, 1);
      px(ctx, PALETTE.amber, 11, 11, 1, 2);
      break;
    case 'metal':
      px(ctx, PALETTE.metal, 2, 3, 12, 13);
      for (let y = 4; y < 16; y += 2) px(ctx, shade(PALETTE.metal, -0.08), 2, y, 12, 1);
      break;
    case 'home':
      px(ctx, PALETTE.woodDark, 2, 2, 12, 14);
      px(ctx, '#3f6f78', 3, 3, 10, 13);
      px(ctx, shade('#3f6f78', 0.1), 3, 3, 10, 1);
      px(ctx, shade(PALETTE.amber, -0.3), 5, 5, 6, 3);
      px(ctx, PALETTE.amber, 5, 5, 6, 1);
      px(ctx, PALETTE.amber, 11, 10, 1, 2);
      px(ctx, PALETTE.leaf, 0, 11, 2, 4);
      px(ctx, PALETTE.leaf, 14, 11, 2, 4);
      break;
    case 'stairs':
      px(ctx, PALETTE.ink, 2, 2, 12, 14);
      for (let y = 5; y < 16; y += 3) px(ctx, shade(PALETTE.night, 0.1 - y * 0.005), 3, y, 10, 1);
      px(ctx, PALETTE.amber, 4, 2, 8, 1);
      break;
  }
  // El umbral es acera: se entra caminando.
  px(ctx, PALETTE.pavement, 0, 15, TILE, 1);
  if (look.shop !== 'metro' && look.shop !== 'shutter') drawAwning(ctx, look);
}

/** Puerta de cristal abierta: las hojas corridas a los lados y la luz de dentro en el umbral. */
function drawDoorOpen(ctx: Ctx, look: Look): void {
  px(ctx, look.wall, 0, 0, TILE, TILE);
  px(ctx, shade(look.wall, 0.08), 0, 0, TILE, 2);
  px(ctx, PALETTE.ink, 2, 3, 12, 13);
  px(ctx, shade(look.lit, -0.25), 4, 4, 8, 12);
  glow(ctx, 8, 14, 7, 0.3, look.lit);
  px(ctx, shade(PALETTE.glass, 0.15), 2, 4, 2, 12);
  px(ctx, shade(PALETTE.glass, 0.15), 12, 4, 2, 12);
  px(ctx, PALETTE.pavement, 0, 15, TILE, 1);
  drawAwning(ctx, look);
}

/** Placa del rótulo: fondo oscuro, icono en claro, un borde de color. */
function drawSign(ctx: Ctx, sign: Sign): void {
  const edge: Readonly<Record<Sign, string>> = {
    house: PALETTE.amber, dumbbell: PALETTE.glassLit, cup: PALETTE.amber, hanger: PALETTE.white, basket: PALETTE.leafLit, fork: PALETTE.rugLit,
    cross: PALETTE.leafLit, scissors: PALETTE.glassLit, euro: PALETTE.amber, apple: RUST, key: PALETTE.amber,
    drop: PALETTE.glassLit, book: PALETTE.white, flag: PALETTE.amber, plate: PALETTE.white, note: NEON_PINK,
  };
  const c = edge[sign];
  px(ctx, PALETTE.ink, 2, 2, 12, 12);
  px(ctx, c, 2, 2, 12, 1);
  px(ctx, shade(c, -0.25), 2, 13, 12, 1);
  const ic = sign === 'cross' ? PALETTE.leafLit : PALETTE.white;
  const p = (x: number, y: number, w = 1, h = 1): void => px(ctx, ic, x, y, w, h);
  switch (sign) {
    case 'house': p(7, 3, 2, 1); p(5, 4, 6, 1); p(4, 5, 8, 1); p(5, 6, 6, 6); px(ctx, PALETTE.amber, 7, 9, 2, 3); break;
    case 'dumbbell': p(4, 7, 8, 2); p(4, 5, 2, 6); p(10, 5, 2, 6); break;
    case 'cup': p(4, 6, 6, 5); p(10, 7, 2, 2); p(5, 4, 1, 1); p(7, 3, 1, 2); px(ctx, PALETTE.amber, 5, 7, 4, 1); break;
    case 'hanger': p(7, 4, 2, 1); p(8, 5, 1, 2); p(5, 7, 6, 1); p(4, 8, 2, 1); p(10, 8, 2, 1); p(3, 9, 10, 1); break;
    case 'basket': p(4, 7, 8, 1); p(5, 8, 6, 4); p(6, 4, 1, 3); p(9, 4, 1, 3); p(6, 4, 4, 1); break;
    case 'fork': p(5, 4, 1, 8); p(4, 4, 1, 3); p(6, 4, 1, 3); p(10, 4, 2, 4); p(10, 8, 1, 4); break;
    case 'cross': p(7, 4, 2, 8); p(4, 7, 8, 2); break;
    case 'scissors': p(4, 4, 1, 1); p(5, 5, 1, 1); p(6, 6, 4, 1); p(10, 5, 1, 1); p(11, 4, 1, 1); p(5, 8, 2, 2); p(9, 8, 2, 2); break;
    case 'euro': p(6, 4, 4, 1); p(5, 5, 1, 6); p(6, 11, 4, 1); p(4, 7, 5, 1); p(4, 9, 5, 1); break;
    case 'apple': px(ctx, RUST, 5, 6, 6, 6); px(ctx, RUST, 4, 7, 8, 4); p(8, 4, 1, 2); px(ctx, PALETTE.leafLit, 9, 4, 2, 1); break;
    case 'key': p(4, 5, 4, 4); px(ctx, PALETTE.ink, 5, 6, 2, 2); p(8, 7, 5, 1); p(11, 8, 1, 2); break;
    case 'drop': p(7, 4, 2, 2); p(6, 6, 4, 2); p(5, 8, 6, 3); p(6, 11, 4, 1); break;
    case 'book': p(4, 5, 4, 6); p(8, 5, 4, 6); px(ctx, PALETTE.ink, 8, 5, 1, 6); break;
    case 'flag': p(5, 4, 1, 8); px(ctx, RUST, 6, 4, 5, 2); px(ctx, PALETTE.amber, 6, 6, 5, 2); break;
    case 'plate': p(4, 6, 8, 1); p(4, 9, 8, 1); px(ctx, PALETTE.glassLit, 4, 7, 3, 2); break;
    case 'note': px(ctx, NEON_CYAN, 4, 9, 3, 3); px(ctx, NEON_CYAN, 9, 8, 3, 3); p(6, 4, 1, 6); p(11, 3, 1, 6); p(6, 3, 6, 2); break;
  }
}


function drawAtm(ctx: Ctx): void {
  px(ctx, PALETTE.stoneLit, 0, 0, TILE, TILE);
  px(ctx, PALETTE.ink, 3, 3, 10, 12);
  px(ctx, PALETTE.glassLit, 5, 5, 6, 3);
  px(ctx, PALETTE.amber, 5, 10, 6, 1);
  px(ctx, PALETTE.metal, 5, 12, 6, 1);
}

type Deco = 'chimney' | 'ac' | 'skylight' | 'solar' | 'tank';

function drawDeco(ctx: Ctx, deco: Deco): void {
  switch (deco) {
    case 'chimney':
      px(ctx, PALETTE.brick, 5, 3, 6, 10);
      px(ctx, PALETTE.brickLit, 5, 3, 6, 2);
      px(ctx, PALETTE.ink, 6, 3, 4, 1);
      break;
    case 'ac':
      px(ctx, shade(PALETTE.white, -0.25), 2, 4, 12, 9);
      px(ctx, shade(PALETTE.white, -0.1), 2, 4, 12, 1);
      px(ctx, PALETTE.metal, 4, 6, 6, 5);
      px(ctx, PALETTE.ink, 6, 8, 2, 1);
      break;
    case 'skylight':
      px(ctx, PALETTE.metal, 2, 2, 12, 12);
      px(ctx, shade(PALETTE.glass, 0.1), 3, 3, 10, 10);
      px(ctx, PALETTE.glassLit, 3, 3, 10, 1);
      break;
    case 'solar':
      px(ctx, PALETTE.ink, 1, 3, 14, 10);
      for (let x = 2; x < 15; x += 4) for (let y = 4; y < 13; y += 3) px(ctx, '#2a3d6b', x, y, 3, 2);
      break;
    case 'tank':
      px(ctx, PALETTE.metalLit, 3, 3, 10, 10);
      px(ctx, PALETTE.metal, 4, 4, 8, 8);
      px(ctx, PALETTE.metalLit, 4, 4, 8, 1);
      break;
  }
}

export function buildBuildingTextures(scene: Phaser.Scene): void {
  for (const style of STYLES) {
    const look = LOOKS[style];
    for (let v = 0; v < 3; v++) {
      make(scene, `bs-${style}-front-${v}`, TILE, TILE, (ctx) => drawFront(ctx, look, v));
      make(scene, `bs-${style}-upper-${v}`, TILE, TILE, (ctx) => drawUpper(ctx, look, v));
    }
    make(scene, `bs-${style}-door`, TILE, TILE, (ctx) => drawDoor(ctx, look));
    if (look.door === 'glass') make(scene, `bs-${style}-door-open`, TILE, TILE, (ctx) => drawDoorOpen(ctx, look));
  }
  const signs: Sign[] = ['house', 'dumbbell', 'cup', 'hanger', 'basket', 'fork', 'cross', 'scissors', 'euro', 'apple', 'key', 'drop', 'book', 'flag', 'plate', 'note'];
  for (const s of signs) make(scene, `bs-sign-${s}`, TILE, TILE, (ctx) => drawSign(ctx, s));
  for (const d of ['chimney', 'ac', 'skylight', 'solar', 'tank'] as const) make(scene, `bs-deco-${d}`, TILE, TILE, (ctx) => drawDeco(ctx, d));
  make(scene, 'bs-atm', TILE, TILE, drawAtm);
}

// --------------------------------------------------------------- horneado

/** Hash estable del id: la misma calle se ve igual en cada partida. */
function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const DECO_BY_STYLE: Partial<Record<BuildingStyle, readonly Deco[]>> = {
  gym: ['ac', 'solar', 'skylight'],
  office: ['solar', 'ac', 'skylight'],
  super: ['ac', 'ac', 'skylight'],
  study: ['skylight', 'chimney'],
  metro: [],
  works: [],
};

/**
 * Pinta los edificios sobre la RenderTexture del suelo: tejado, planta alta,
 * planta baja con puerta, rótulo y cosas en el tejado. Horneado una vez por
 * visita; en cada frame no cuesta nada.
 */
/** Hueco acristalado de una fachada, en px de mundo: world/Lighting lo enciende de noche. */
export interface WindowSpot {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Dónde está el cristal de cada pieza de fachada, en px dentro del tile (ver drawFront y drawUpper). */
const SHOP_PANE: Partial<Record<Shop, readonly [number, number, number, number]>> = {
  windows: [4, 6, 8, 6],
  display: [1, 5, 14, 9],
  glass: [1, 4, 14, 10],
  arched: [5, 5, 6, 10],
};
const UPPER_PANE: Readonly<Record<Upper, readonly [number, number, number, number]>> = {
  windows: [5, 4, 6, 7],
  balcony: [5, 4, 6, 7],
  glass: [1, 3, 14, 10],
  band: [0, 6, 16, 5],
};

/** Parte de un edificio que brilla de noche (rótulo, apliques): world/Lighting la pone encima de la oscuridad. */
export interface GlowSpot {
  key: string;
  x: number;
  y: number;
}

export function bakeBuildings(rt: Phaser.GameObjects.RenderTexture, buildings: readonly BuildingDef[], glows: GlowSpot[] = []): WindowSpot[] {
  const windows: WindowSpot[] = [];
  const pane = (p: readonly [number, number, number, number] | undefined, tx: number, ty: number): void => {
    if (p) windows.push({ x: tx * TILE + p[0], y: ty * TILE + p[1], w: p[2], h: p[3] });
  };
  for (const b of buildings) {
    // Boca de metro de 3 × 3 (Visual V2, world/UrbanArt): marquesina, rótulo y escalera en una pieza.
    if (b.style === 'metro' && b.w === 3 && b.h === 3) {
      rt.batchDraw('bs-metro-entrance', b.tx * TILE, b.ty * TILE);
      glows.push({ key: 'bs-metro-entrance-glow', x: b.tx * TILE, y: b.ty * TILE });
      continue;
    }
    const look = LOOKS[b.style];
    const seed = hash(b.id);
    const tone = seed % ROOF_TONES.length;
    const floors = b.front === 's' ? (b.floors ?? 1) : b.front === 'n' ? 1 : 0;
    const frontRow = b.front === 'n' ? b.ty : b.ty + b.h - 1;
    const upperRow = floors === 2 ? frontRow - 1 : -1;
    const draw = (key: string, tx: number, ty: number): void => {
      rt.batchDraw(key, tx * TILE, ty * TILE);
    };

    for (let y = b.ty; y < b.ty + b.h; y++) {
      for (let x = b.tx; x < b.tx + b.w; x++) {
        const i = x - b.tx;
        const edge = i === 0 || i === b.w - 1;
        const r = (seed >>> (i % 16)) & 3;
        if (y === frontRow && b.front) {
          if (x === b.doorX) draw(`bs-${b.style}-door`, x, y);
          else {
            // Los escaparates y el cristal corren de lado a lado; las viviendas alternan huecos.
            let v: number;
            if (look.shop === 'shutter') v = r === 0 ? 2 : 1;
            else if (look.shop === 'display' || look.shop === 'glass' || look.shop === 'metro') v = edge ? 0 : i % 3 === 1 ? 2 : 1;
            else if (b.style === 'home') v = i % 2 === 1 ? 1 : 0;
            else v = i % 2 === 1 ? (r === 3 ? 2 : 1) : 0;
            draw(`bs-${b.style}-front-${v}`, x, y);
            if (v !== 0) pane(SHOP_PANE[look.shop], x, y);
          }
        } else if (y === upperRow) {
          let v: number;
          if (look.upper === 'glass' || look.upper === 'band') v = r === 2 ? 2 : 1;
          else if (b.style === 'home') v = i % 2 === 1 ? 2 : 0;
          else v = i % 2 === 1 ? (r & 1 ? 1 : 2) : 0;
          draw(`bs-${b.style}-upper-${v}`, x, y);
          if (v !== 0 || look.upper === 'glass' || look.upper === 'band') pane(UPPER_PANE[look.upper], x, y);
        }
      }
    }

    // Tejado entero de una pieza, con su pretil: sin él, los bloques vecinos se funden en una losa.
    const roofTop = b.front === 'n' ? b.ty + 1 : b.ty;
    const roofBottom = b.front === 's' ? frontRow - floors : b.ty + b.h - 1;
    if (roofBottom >= roofTop) {
      const rw = b.w * TILE;
      const rh = (roofBottom - roofTop + 1) * TILE;
      const key = `bs-roof-${b.id}-${rw}x${rh}`;
      make(rt.scene, key, rw, rh, (ctx) => drawRoofArea(ctx, look, b.style, tone, rw, rh, seed, b.front !== 's'));
      draw(key, b.tx, roofTop);
    }

    // Rótulo: sobre la puerta si hay planta alta, junto a ella si no.
    if (look.sign && b.doorX !== undefined) {
      if (upperRow >= 0) draw(`bs-sign-${look.sign}`, b.doorX, upperRow);
      else {
        const side = b.doorX + 1 < b.tx + b.w ? b.doorX + 1 : b.doorX - 1;
        draw(`bs-sign-${look.sign}`, side, frontRow);
      }
    }
    if (b.style === 'bank' && b.doorX !== undefined && b.doorX - 1 >= b.tx) draw('bs-atm', b.doorX - 1, frontRow);

    // Cosas en el tejado, lejos de los bordes: rompen la repetición de bloques iguales.
    const deco = DECO_BY_STYLE[b.style] ?? (['chimney', 'tank', 'ac', 'chimney'] as const);
    const roofRows = b.h - floors;
    if (deco.length === 0 || b.w < 4 || roofRows < 3) continue;
    const count = Math.min(4, Math.max(1, Math.floor((b.w * roofRows) / 28)));
    for (let k = 0; k < count; k++) {
      const s = hash(`${b.id}:${k}`);
      const x = b.tx + 1 + (s % (b.w - 2));
      const y = roofTop + 1 + ((s >>> 8) % Math.max(1, roofRows - 2));
      draw(`bs-deco-${deco[(s >>> 16) % deco.length]}`, x, y);
    }
  }
  return windows;
}
