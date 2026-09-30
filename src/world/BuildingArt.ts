import type Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import type { BuildingDef, BuildingStyle } from '../types/game';
import { glow, make, px, shade, sprinkle, type Ctx } from './paint';
import { batch, hash as noise, mix } from './Surfaces';
import { backRows, facadeRows, STOREY_ROWS } from '../systems/LocationSystem';

/** Alto de una planta de fachada al sur, en px (dos tiles): la escala del mundo (LocationSystem.STOREY_ROWS). */
const STOREY = TILE * STOREY_ROWS;

/**
 * Fachadas, tejados y rótulos de los edificios. Cada estilo se reconoce sin
 * leer: el gimnasio es una banda de cristal con neón, la tienda de ropa un
 * escaparate corrido con toldo negro, el súper cristal y toldo verde, la
 * cafetería madera y toldo ámbar. El rótulo es un icono, no una palabra: a
 * 16 px por tile una palabra no se lee y fingir que sí es peor que no ponerla.
 */

type Shop = 'windows' | 'display' | 'glass' | 'shutter' | 'arched' | 'metro';
type Upper = 'windows' | 'balcony' | 'glass' | 'band';
type Sign = 'house' | 'dumbbell' | 'cup' | 'hanger' | 'basket' | 'fork' | 'cross' | 'scissors' | 'euro' | 'apple' | 'key' | 'drop' | 'book' | 'flag' | 'plate' | 'note' | 'wine' | 'dress' | 'cap' | 'tag' | 'heart' | 'disc';
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
  /**
   * Lo pintado en el muro ciego de la planta baja: un mural encargado (el
   * grafiti con permiso de la Calle del Carmen) o carteles pegados. Sólo en los
   * paños sin hueco: nunca tapa un escaparate ni una puerta.
   */
  wallArt?: 'mural' | 'posters';
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
  // Vinoteca en la antigua obra: fachada granate, carpintería de madera y luz cálida detrás del cristal.
  wine: { roof: PALETTE.roofA, roofLit: PALETTE.roofALit, wall: shade(PALETTE.rug, -0.3), shop: 'windows', upper: 'windows', lit: PALETTE.amber, door: 'wood', awning: [shade(PALETTE.rug, -0.15), PALETTE.white], sign: 'wine' },
  // Calle del Carmen: cada tienda se reconoce desde la acera sin leer un rótulo.
  // Retales, vintage: verde botella, toldo de rayas crema y óxido, escaparate con maniquíes y el vestido.
  vintage: { roof: PALETTE.roofA, roofLit: PALETTE.roofALit, wall: '#2f5d50', shop: 'display', upper: 'balcony', lit: PALETTE.amber, door: 'wood', awning: ['#e6dcc0', RUST], sign: 'dress' },
  // Archivo, streetwear: hormigón oscuro, cristal corrido con luz fría y la gorra.
  streetwear: { roof: PALETTE.stone, roofLit: PALETTE.stoneLit, wall: '#3a3d44', shop: 'glass', upper: 'band', lit: NEON_CYAN, door: 'glass', sign: 'cap' },
  // Segunda Vuelta, al peso: revoco amarillo, toldo verde y la etiqueta de precio.
  thrift: { roof: PALETTE.roofB, roofLit: PALETTE.roofBLit, wall: '#d8b04a', shop: 'display', upper: 'windows', lit: PALETTE.amber, door: 'glass', awning: [PALETTE.leaf, PALETTE.white], sign: 'tag', wallArt: 'posters' },
  // Tinta Carmen: negro, luz rosa detrás del cristal, el corazón con banda y un mural al lado.
  tattoo: { roof: PALETTE.roofB, roofLit: PALETTE.roofBLit, wall: PALETTE.night, shop: 'windows', upper: 'windows', lit: NEON_PINK, door: 'metal', sign: 'heart', wallArt: 'mural' },
  // Café Molinillo: terracota, toldo verde oscuro y la taza.
  coffee: { roof: PALETTE.roofA, roofLit: PALETTE.roofALit, wall: '#b8674a', shop: 'windows', upper: 'balcony', lit: PALETTE.amber, door: 'glass', awning: ['#2f4a3a', '#e6dcc0'], sign: 'cup' },
  // Discos Surco: persiana pintada de arriba abajo (con permiso) y el vinilo.
  records: { roof: PALETTE.roofB, roofLit: PALETTE.roofBLit, wall: '#4a3f5a', shop: 'windows', upper: 'windows', lit: PALETTE.amber, door: 'wood', sign: 'disc', wallArt: 'mural' },
  // Serigrafía: taller de carteles, con sus propios carteles en la fachada.
  print: { roof: PALETTE.roofA, roofLit: PALETTE.roofALit, wall: shade(PALETTE.white, -0.16), shop: 'windows', upper: 'windows', lit: PALETTE.white, door: 'metal', wallArt: 'posters' },
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
function drawRoofArea(ctx: Ctx, look: Look, style: BuildingStyle, tone: number, w: number, h: number, seed: number, capSouth: boolean, ridgeAt = 0.42): void {
  const base = shade(look.roof, ROOF_TONES[tone]);
  const n = Number.parseInt(base.slice(1), 16);
  const tiled = ((n >> 16) & 255) > (n & 255) + 24;
  const weather = (x: number, y: number): number => batch(x, y, 36, seed) * 0.05 + batch(x, y, 11, seed + 3) * 0.02;

  if (tiled) {
    // Teja árabe al tresbolillo; una cumbrera parte el faldón en dos aguas.
    const ridge = h >= TILE * 3 ? Math.floor((h * ridgeAt) / 4) * 4 : -1;
    for (let y = 0; y < h; y += 4) {
      // Dos aguas: la del norte, al sol del noroeste; la del sur, en sombra. Se lee el volumen, no una alfombra.
      const slope = ridge < 0 ? 0 : y < ridge ? 0.05 : -0.05;
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
    else {
      // Alero sobre la fachada: el canto de la teja al sol y la sombra que deja debajo.
      px(ctx, shade(base, 0.14), 0, h - 3, w, 1);
      px(ctx, shade(base, -0.28), 0, h - 2, w, 2);
    }
  } else {
    // Azotea: losas de 8 px con tanda y matiz, manchas de agua y algún parche de tela asfáltica.
    for (let y = 0; y < h; y += 8) {
      for (let x = 0; x < w; x += 8) {
        const r = (k: number): number => noise(seed + x, y, k);
        // Más intemperie que en la teja: la azotea es grande y plana, y sin manchas amplias se lee como una rejilla.
        const t = shade(base, weather(x, y) * 1.8 + (r(1) - 0.5) * 0.035);
        px(ctx, t, x, y, 8, 8);
        px(ctx, shade(t, 0.03), x, y, 8, 1);
        px(ctx, shade(t, -0.06), x, y + 7, 8, 1);
        px(ctx, shade(t, -0.05), x + 7, y, 1, 7);
        // Parche sellado: pocos y de forma irregular (a pares de losas cuadradas se leían como lunares).
        if (r(2) < 0.012) {
          px(ctx, shade(t, -0.05), x + 1, y + 2, 5 + Math.floor(r(5) * 5), 3);
          px(ctx, shade(t, -0.05), x + 2, y + 5, 3, 1);
        }
        else if (r(2) < 0.22) px(ctx, look.roofLit, x + 1 + Math.floor(r(3) * 6), y + 1 + Math.floor(r(4) * 6));
      }
    }
    // Cercos de agua: donde encharca, el barro se oscurece en manchas, no en recuadros.
    ctx.globalAlpha = 0.06;
    for (let y = 3; y < h - 3; y++) {
      for (let x = 3; x < w - 3; x++) if (batch(x, y, 14, seed + 9) > 0.55) px(ctx, PALETTE.ink, x, y);
    }
    ctx.globalAlpha = 1;
    // Una canalización que cruza la azotea hasta el pretil, con su sombra: tubo de luz y soporte cada dos losas.
    if (style !== 'metro' && w >= TILE * 4 && h >= TILE * 3) {
      const cy = 10 + ((seed >>> 4) % Math.max(1, h - 20));
      const x0 = 6 + ((seed >>> 9) % Math.max(1, Math.floor(w / 3)));
      px(ctx, shade(PALETTE.metal, 0.05), x0, cy, w - x0 - 4, 1);
      px(ctx, PALETTE.metalLit, x0, cy - 1, w - x0 - 4, 1);
      ctx.globalAlpha = 0.2;
      px(ctx, PALETTE.ink, x0 + 1, cy + 1, w - x0 - 5, 1);
      ctx.globalAlpha = 1;
      for (let x = x0 + 4; x < w - 6; x += 16) px(ctx, shade(PALETTE.metal, -0.2), x, cy - 1, 1, 3);
    }
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
      else {
        // Cornisa sobre la fachada: piedra clara con su vuelo en sombra.
        px(ctx, shade(stone, 0.04), 0, h - 3, w, 2);
        px(ctx, shade(stone, -0.3), 0, h - 1, w, 1);
      }
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

/** Toldo a rayas; `y`, dónde cuelga. En las fachadas altas, con el faldón festoneado y su sombra en el muro. */
function drawAwning(ctx: Ctx, look: Look, y = 0, tall = false): void {
  if (!look.awning) return;
  const [a, b] = look.awning;
  for (let x = 0; x < TILE; x += 4) {
    px(ctx, a, x, y, 2, tall ? 5 : 4);
    px(ctx, b, x + 2, y, 2, tall ? 5 : 4);
  }
  if (!tall) {
    px(ctx, shade(a, -0.2), 0, y + 4, TILE, 1);
    return;
  }
  px(ctx, shade(a, 0.12), 0, y, TILE, 1);
  // Faldón: una lengüeta por raya, y la sombra del toldo en lo que queda debajo.
  for (let x = 0; x < TILE; x += 4) {
    px(ctx, shade(a, -0.15), x, y + 5, 2, 1);
    px(ctx, shade(b, -0.15), x + 2, y + 5, 2, 1);
  }
  ctx.globalAlpha = 0.25;
  px(ctx, PALETTE.ink, 0, y + 6, TILE, 2);
  ctx.globalAlpha = 1;
}

// --------------------------------------------------- fachadas a escala

/**
 * Lo común a cada planta alta de fachada al sur: el paño, la imposta que la
 * separa de la de arriba (luz arriba, sombra debajo) y el muro con su grano.
 */
function storeyWall(ctx: Ctx, wall: string, seed: number): void {
  px(ctx, wall, 0, 0, TILE, STOREY);
  sprinkle(ctx, shade(wall, 0.045), TILE, STOREY, seed, 9);
  px(ctx, shade(wall, 0.12), 0, 0, TILE, 1);
  px(ctx, shade(wall, -0.14), 0, 1, TILE, 1);
}

/** Hueco de ventana con su marco, cristal (encendido o no), reflejo, parteluz y alféizar. */
function windowHole(ctx: Ctx, wall: string, lit: string, x: number, y: number, w: number, h: number, on: boolean): void {
  px(ctx, shade(wall, -0.18), x - 1, y - 1, w + 2, h + 2);
  px(ctx, on ? shade(lit, -0.3) : PALETTE.glass, x, y, w, h);
  if (on) {
    px(ctx, lit, x, y, w, 1);
    px(ctx, lit, x, y, 1, h);
  } else {
    // El cielo en el cristal: una raya de luz en diagonal.
    px(ctx, shade(PALETTE.glassLit, -0.25), x + 1, y + 2, 1, 3);
    px(ctx, shade(PALETTE.glassLit, -0.25), x + 2, y + 1, 1, 1);
  }
  px(ctx, shade(wall, -0.22), x + Math.floor(w / 2), y, 1, h);
  px(ctx, shade(wall, 0.14), x - 2, y + h + 1, w + 4, 1);
  px(ctx, shade(wall, -0.2), x - 2, y + h + 2, w + 4, 1);
}

/**
 * Planta baja de una fachada al sur, 16 × 32: la imposta arriba, el zócalo de
 * piedra abajo y, en medio, el hueco que dice qué es el local: ventana con
 * reja, escaparate con su rótulo corrido, cristal, cierre metálico o arco.
 */
function drawGround(ctx: Ctx, look: Look, variant: number): void {
  const H = STOREY;
  storeyWall(ctx, look.wall, 61 + variant);
  // Zócalo de piedra: aguanta los golpes de la acera.
  px(ctx, shade(PALETTE.stone, -0.1), 0, H - 4, TILE, 4);
  px(ctx, shade(PALETTE.stone, 0.05), 0, H - 4, TILE, 1);
  px(ctx, shade(PALETTE.stone, -0.22), 0, H - 1, TILE, 1);
  const dark = variant === 2;
  switch (look.shop) {
    case 'windows':
      if (variant === 0) break;
      windowHole(ctx, look.wall, look.lit, 4, 10, 8, 14, !dark);
      // Reja de planta baja: tres barrotes.
      for (const x of [5, 8, 10]) px(ctx, PALETTE.iron, x, 10, 1, 14);
      break;
    case 'display':
      if (variant === 0) break;
      // Rótulo corrido del local encima del escaparate, y el escaparate hasta el zócalo.
      px(ctx, shade(look.wall, -0.3), 0, 7, TILE, 3);
      px(ctx, PALETTE.ink, 0, 10, TILE, H - 14);
      px(ctx, shade(PALETTE.glass, 0.1), 1, 11, 14, H - 16);
      glow(ctx, 8, 18, 8, dark ? 0.1 : 0.16, look.lit);
      // Lo expuesto no va aquí: es de cada tienda (drawGoods), encima de este cristal.
      px(ctx, look.lit, 1, 11, 14, 1);
      px(ctx, PALETTE.ink, 15, 10, 1, H - 14);
      break;
    case 'glass':
      if (variant === 0) {
        px(ctx, shade(look.wall, -0.07), 0, 6, TILE, H - 10);
        px(ctx, shade(look.wall, 0.05), 0, 6, TILE, 1);
        break;
      }
      px(ctx, PALETTE.ink, 0, 6, TILE, H - 10);
      px(ctx, dark ? PALETTE.glass : shade(PALETTE.glass, 0.12), 1, 7, 14, H - 12);
      px(ctx, shade(look.lit, dark ? -0.3 : 0), 1, 7, 14, 1);
      px(ctx, shade(PALETTE.glassLit, -0.3), 3, 9, 1, 8);
      px(ctx, shade(PALETTE.glassLit, -0.3), 4, 9, 1, 3);
      px(ctx, PALETTE.ink, 8, 7, 1, H - 12);
      px(ctx, PALETTE.ink, 1, 17, 14, 1);
      break;
    case 'shutter':
      px(ctx, shade(PALETTE.metal, -0.1), 0, 7, TILE, 2);
      px(ctx, PALETTE.metal, 1, 9, 14, H - 13);
      for (let y = 10; y < H - 4; y += 2) px(ctx, shade(PALETTE.metal, variant === 2 ? -0.12 : -0.06), 1, y, 14, 1);
      if (variant === 2) px(ctx, PALETTE.ink, 1, H - 9, 14, 5);
      break;
    case 'arched':
      if (variant === 0) break;
      px(ctx, shade(look.wall, -0.16), 3, 7, 10, H - 11);
      px(ctx, dark ? PALETTE.glass : shade(look.lit, -0.35), 4, 9, 8, H - 14);
      // Arco: las esquinas de arriba, del color del muro, y la clave.
      px(ctx, look.wall, 4, 9, 2, 1);
      px(ctx, look.wall, 4, 10, 1, 1);
      px(ctx, look.wall, 10, 9, 2, 1);
      px(ctx, look.wall, 11, 10, 1, 1);
      px(ctx, shade(look.wall, 0.15), 7, 6, 2, 2);
      px(ctx, shade(look.lit, dark ? -0.3 : -0.1), 6, 9, 4, 1);
      px(ctx, shade(look.wall, -0.22), 8, 9, 1, H - 14);
      break;
    case 'metro':
      px(ctx, PALETTE.night, 0, 0, TILE, H);
      break;
  }
  if (variant === 0 && look.wallArt) {
    ctx.save();
    ctx.translate(0, 9);
    drawWallArt(ctx, look.wallArt, look.wall);
    ctx.restore();
  }
  // El toldo no va aquí: es de cada local (bs-awn-*), con su estilo, encima de la fachada.
}

/**
 * Planta alta, 16 × 32: ventana alta con persiana a media altura (cada una
 * bajada a su manera), balcón de hierro con maceta, o cristal corrido con el
 * canto del forjado.
 */
function drawUpperTall(ctx: Ctx, look: Look, variant: number, seed: number): void {
  const H = STOREY;
  storeyWall(ctx, look.wall, 31 + variant + seed * 7);
  const lit = variant === 1;
  switch (look.upper) {
    case 'glass':
      px(ctx, PALETTE.ink, 0, 3, TILE, H - 5);
      px(ctx, shade(PALETTE.glass, lit ? 0.14 : 0.04), 1, 4, 14, H - 7);
      if (lit) px(ctx, PALETTE.glassLit, 1, 4, 14, 1);
      px(ctx, PALETTE.ink, 8, 4, 1, H - 7);
      px(ctx, shade(PALETTE.metal, 0.1), 0, 17, TILE, 1);
      px(ctx, shade(PALETTE.glassLit, -0.3), 3, 6, 1, 6);
      return;
    case 'band':
      px(ctx, PALETTE.ink, 0, 9, TILE, 13);
      px(ctx, shade(PALETTE.glass, 0.12), 0, 10, TILE, 11);
      px(ctx, PALETTE.glassLit, 0, 21, TILE, 1);
      glow(ctx, 8, 21, 7, 0.12, PALETTE.glassLit);
      return;
    case 'windows':
    case 'balcony': {
      if (variant === 0) {
        // Paño ciego: a veces la bajante de pluviales.
        if (seed % 3 === 0) {
          px(ctx, shade(PALETTE.metal, -0.1), 12, 0, 2, H);
          px(ctx, shade(PALETTE.metal, 0.1), 12, 0, 1, H);
        }
        return;
      }
      windowHole(ctx, look.wall, look.lit, 4, 7, 8, 16, lit);
      // Persiana enrollable, bajada un tanto distinto en cada ventana; y su cajón.
      const blind = [3, 6, 9, 5][seed % 4];
      px(ctx, shade(look.wall, 0.06), 3, 5, 10, 2);
      px(ctx, '#c9b9a0', 4, 7, 8, blind);
      for (let y = 8; y < 7 + blind; y += 2) px(ctx, shade('#c9b9a0', -0.12), 4, y, 8, 1);
      if (look.upper === 'balcony' && variant === 2) {
        // Balcón: losa, barandilla de hierro y una maceta.
        px(ctx, shade(PALETTE.stone, 0.04), 0, 25, TILE, 2);
        px(ctx, shade(PALETTE.stone, -0.2), 0, 27, TILE, 1);
        px(ctx, PALETTE.iron, 1, 18, 14, 1);
        for (let x = 2; x < 15; x += 2) px(ctx, PALETTE.iron, x, 19, 1, 6);
        px(ctx, PALETTE.brick, 11, 16, 3, 3);
        px(ctx, PALETTE.leafLit, 11, 14, 3, 2);
        px(ctx, PALETTE.leaf, 12, 13, 2, 1);
      }
    }
  }
}

/** Puerta de planta baja, 16 × 32: 26 px de hoja (más alta que quien entra), montante encima y umbral de acera. */
function drawDoorTall(ctx: Ctx, look: Look, open: boolean): void {
  const H = STOREY;
  storeyWall(ctx, look.wall, 71);
  px(ctx, shade(look.wall, -0.2), 1, 4, 14, H - 4);
  if (open) {
    px(ctx, PALETTE.ink, 2, 5, 12, H - 5);
    px(ctx, shade(look.lit, -0.25), 4, 6, 8, H - 6);
    glow(ctx, 8, H - 3, 8, 0.32, look.lit);
    px(ctx, shade(PALETTE.glass, 0.15), 2, 6, 2, H - 6);
    px(ctx, shade(PALETTE.glass, 0.15), 12, 6, 2, H - 6);
  } else {
    switch (look.door) {
      case 'glass':
        px(ctx, PALETTE.ink, 2, 5, 12, H - 5);
        px(ctx, shade(PALETTE.glass, 0.15), 3, 6, 10, H - 6);
        px(ctx, PALETTE.ink, 8, 6, 1, H - 6);
        px(ctx, shade(look.lit, -0.1), 3, 6, 10, 1);
        px(ctx, PALETTE.metalLit, 6, 17, 1, 4);
        px(ctx, PALETTE.metalLit, 9, 17, 1, 4);
        glow(ctx, 8, H - 6, 7, 0.18, look.lit);
        break;
      case 'wood':
      case 'home': {
        const leaf = look.door === 'home' ? '#3f6f78' : PALETTE.wood;
        px(ctx, PALETTE.woodDark, 2, 4, 12, H - 4);
        px(ctx, leaf, 3, 5, 10, H - 5);
        px(ctx, shade(leaf, 0.12), 3, 5, 10, 1);
        // Montante de cristal con luz del portal, y cuarterones.
        px(ctx, shade(PALETTE.amber, -0.35), 4, 6, 8, 4);
        px(ctx, PALETTE.amber, 4, 6, 8, 1);
        px(ctx, PALETTE.woodDark, 3, 11, 10, 1);
        for (const y of [13, 22]) {
          px(ctx, shade(leaf, -0.14), 4, y, 3, 7);
          px(ctx, shade(leaf, -0.14), 9, y, 3, 7);
        }
        px(ctx, PALETTE.amber, 11, 19, 1, 2);
        if (look.door === 'home') {
          px(ctx, PALETTE.leaf, 0, H - 9, 2, 5);
          px(ctx, PALETTE.leafLit, 14, H - 9, 2, 5);
        }
        break;
      }
      case 'metal':
        px(ctx, PALETTE.metal, 2, 5, 12, H - 5);
        for (let y = 7; y < H; y += 2) px(ctx, shade(PALETTE.metal, -0.08), 2, y, 12, 1);
        px(ctx, PALETTE.metalLit, 11, 18, 1, 3);
        break;
      case 'stairs':
        px(ctx, PALETTE.ink, 2, 4, 12, H - 4);
        for (let y = 8; y < H; y += 3) px(ctx, shade(PALETTE.night, 0.1 - y * 0.003), 3, y, 10, 1);
        px(ctx, PALETTE.amber, 4, 4, 8, 1);
        break;
    }
  }
  // El umbral es acera: se entra caminando.
  px(ctx, PALETTE.pavement, 0, H - 1, TILE, 1);
  // El toldo, como en el resto de la planta baja, lo pone cada local (bs-awn-*).
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
  if (variant === 0 && look.wallArt) drawWallArt(ctx, look.wallArt, look.wall);
  if (look.shop !== 'metro') drawAwning(ctx, look);
}

/**
 * Grafiti controlado y cartelería: manchas de color con contorno en el mural,
 * papeles superpuestos y medio arrancados en los carteles. Por debajo del alero.
 */
function drawWallArt(ctx: Ctx, art: 'mural' | 'posters', wall: string): void {
  if (art === 'mural') {
    const ink = [NEON_PINK, NEON_CYAN, PALETTE.amber, '#c8d84a', PALETTE.white];
    px(ctx, shade(wall, 0.05), 0, 3, TILE, 12);
    // Tres pompas de letras que se montan: contorno oscuro, relleno y un brillo.
    for (const [x, y, w, h, k] of [[1, 5, 6, 6, 0], [6, 4, 6, 7, 1], [10, 7, 5, 6, 2]] as const) {
      px(ctx, PALETTE.ink, x, y, w, h);
      px(ctx, ink[k], x + 1, y + 1, w - 2, h - 2);
      px(ctx, shade(ink[k], 0.2), x + 1, y + 1, w - 3, 1);
    }
    // Gotas y firma.
    px(ctx, ink[0], 3, 11, 1, 3);
    px(ctx, ink[3], 12, 13, 1, 2);
    px(ctx, ink[4], 2, 13, 4, 1);
    return;
  }
  const papers = [PALETTE.white, '#e6dcc0', NEON_PINK, '#c8d84a', PALETTE.amber];
  for (const [x, y, w, h, k] of [[1, 4, 6, 8, 0], [6, 5, 5, 7, 2], [10, 3, 5, 9, 1], [3, 9, 5, 5, 3]] as const) {
    px(ctx, shade(papers[k], -0.25), x + 1, y + 1, w, h);
    px(ctx, papers[k], x, y, w, h);
    px(ctx, PALETTE.ink, x + 1, y + 1, w - 2, 1);
    px(ctx, shade(papers[k], -0.3), x + 1, y + 3, w - 3, 1);
  }
  // Una esquina arrancada.
  px(ctx, wall, 14, 3, 1, 2);
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

// ----------------------------------------------- lo que es de cada local

/**
 * Toldo de un local, 16 × 10, encima de su planta baja: tres maneras de tener
 * toldo con los mismos dos colores del estilo. 0 a rayas con faldón; 1 liso con
 * el faldón festoneado en claro; 2 marquesina de chapa, estrecha, con la luz
 * de debajo. Dos tiendas del mismo tipo no se visten igual.
 */
function drawAwningStyle(ctx: Ctx, look: Look, k: number): void {
  const [a, b] = look.awning ?? [PALETTE.metal, PALETTE.metalLit];
  if (k === 0) {
    drawAwning(ctx, look, 0, true);
    return;
  }
  if (k === 1) {
    px(ctx, a, 0, 0, TILE, 5);
    px(ctx, shade(a, 0.14), 0, 0, TILE, 1);
    px(ctx, shade(a, -0.12), 0, 4, TILE, 1);
    // Faldón festoneado: medias lunas del color claro.
    for (let x = 0; x < TILE; x += 4) {
      px(ctx, b, x, 5, 4, 1);
      px(ctx, b, x + 1, 6, 2, 1);
    }
    ctx.globalAlpha = 0.25;
    px(ctx, PALETTE.ink, 0, 7, TILE, 2);
    ctx.globalAlpha = 1;
    return;
  }
  // Marquesina: canto de chapa oscura, filo claro y un tubo de luz debajo.
  px(ctx, shade(PALETTE.ink, 0.12), 0, 1, TILE, 3);
  px(ctx, shade(b, 0.05), 0, 1, TILE, 1);
  px(ctx, shade(a, -0.1), 0, 4, TILE, 1);
  ctx.globalAlpha = 0.35;
  px(ctx, look.lit, 1, 5, TILE - 2, 1);
  ctx.globalAlpha = 0.2;
  px(ctx, PALETTE.ink, 0, 6, TILE, 2);
  ctx.globalAlpha = 1;
}

/** Lo que se expone en un escaparate (14 × 16), según el oficio y la tienda. */
type Goods = 'rack' | 'mannequins' | 'sale' | 'crates' | 'machines' | 'chair' | 'shelves' | 'plants';
const GOODS_BY_STYLE: Partial<Record<BuildingStyle, readonly Goods[]>> = {
  fashion: ['mannequins', 'rack', 'sale', 'mannequins'],
  vintage: ['rack', 'mannequins', 'plants', 'rack'],
  thrift: ['rack', 'sale', 'shelves', 'rack'],
  hair: ['chair', 'plants', 'chair', 'shelves'],
  fruit: ['crates', 'crates', 'shelves', 'plants'],
  laundry: ['machines', 'machines', 'sale', 'machines'],
};
const GOODS: readonly Goods[] = ['rack', 'mannequins', 'sale', 'crates', 'machines', 'chair', 'shelves', 'plants'];

function drawGoods(ctx: Ctx, g: Goods): void {
  const shelf = shade(PALETTE.wood, 0.1);
  switch (g) {
    case 'rack':
      // Barra de colgar con cuatro prendas de colores distintos.
      px(ctx, PALETTE.metalLit, 1, 2, 12, 1);
      for (const [x, c] of [[1, '#8c5a6e'], [4, '#3f6f78'], [7, '#e6dcc0'], [10, RUST]] as const) {
        px(ctx, c, x, 3, 3, 8);
        px(ctx, shade(c, -0.18), x + 2, 3, 1, 8);
      }
      px(ctx, PALETTE.metal, 1, 14, 12, 1);
      break;
    case 'mannequins':
      for (const [x, c] of [[2, '#8c5a6e'], [9, '#5c6fa8']] as const) {
        px(ctx, PALETTE.white, x + 1, 1, 1, 2);
        px(ctx, c, x, 3, 3, 7);
        px(ctx, shade(c, 0.12), x, 3, 1, 7);
        px(ctx, shade(PALETTE.metal, -0.1), x + 1, 10, 1, 5);
      }
      break;
    case 'sale':
      // Cartel grande de rebajas y algo apilado delante.
      px(ctx, PALETTE.white, 2, 1, 10, 8);
      px(ctx, RUST, 3, 2, 8, 6);
      px(ctx, PALETTE.white, 4, 3, 1, 1);
      px(ctx, PALETTE.white, 8, 6, 1, 1);
      px(ctx, PALETTE.white, 5, 5, 3, 1);
      px(ctx, shelf, 1, 12, 12, 1);
      px(ctx, '#c8d84a', 2, 10, 3, 2);
      px(ctx, PALETTE.amber, 8, 10, 4, 2);
      break;
    case 'crates':
      for (const [x, y, c] of [[1, 9, PALETTE.amber], [7, 9, RUST], [4, 4, PALETTE.leafLit]] as const) {
        px(ctx, PALETTE.woodDark, x, y + 3, 6, 2);
        px(ctx, c, x, y, 6, 3);
        px(ctx, shade(c, 0.2), x + 1, y, 2, 1);
      }
      break;
    case 'machines':
      // Lavadoras: puerta redonda con la ropa dando vueltas.
      for (const x of [1, 8]) {
        px(ctx, shade(PALETTE.white, -0.1), x, 3, 6, 11);
        px(ctx, PALETTE.metal, x + 1, 6, 4, 4);
        px(ctx, '#5c6fa8', x + 2, 7, 2, 2);
      }
      break;
    case 'chair':
      // Sillón de barbero y el espejo detrás.
      px(ctx, shade(PALETTE.glassLit, -0.2), 3, 1, 8, 5);
      px(ctx, PALETTE.ink, 4, 7, 6, 5);
      px(ctx, shade(PALETTE.rug, 0.1), 4, 7, 6, 2);
      px(ctx, PALETTE.metalLit, 6, 12, 2, 3);
      break;
    case 'shelves':
      for (const y of [4, 9, 14]) px(ctx, shelf, 1, y, 12, 1);
      for (const [x, y, c] of [[2, 2, PALETTE.white], [6, 2, '#3f6f78'], [10, 2, PALETTE.amber], [3, 7, RUST], [8, 7, '#c8d84a'], [5, 12, '#8c5a6e']] as const) px(ctx, c, x, y, 3, 2);
      break;
    case 'plants':
      for (const [x, h] of [[1, 6], [6, 9], [10, 5]] as const) {
        px(ctx, PALETTE.brick, x, 11, 4, 3);
        px(ctx, PALETTE.leaf, x, 11 - h, 4, h);
        px(ctx, PALETTE.leafLit, x + 1, 11 - h, 2, 2);
      }
      break;
  }
}

/**
 * Espalda de un edificio con la puerta al norte, 16 × 32: la sombra del alero,
 * ventanas pequeñas de patio y, según el paño, tendedero con ropa, aparato de
 * aire, o la bajante. Sin puertas: por aquí no se entra.
 */
function drawBack(ctx: Ctx, look: Look, v: number): void {
  const H = STOREY;
  px(ctx, look.wall, 0, 0, TILE, H);
  sprinkle(ctx, shade(look.wall, 0.04), TILE, H, 91 + v, 9);
  // Sombra del alero, arriba.
  ctx.globalAlpha = 0.3;
  px(ctx, PALETTE.ink, 0, 0, TILE, 3);
  ctx.globalAlpha = 1;
  px(ctx, shade(PALETTE.stone, -0.12), 0, H - 3, TILE, 3);
  if (v === 0) {
    px(ctx, shade(PALETTE.metal, -0.1), 3, 0, 2, H - 3);
    px(ctx, shade(PALETTE.metal, 0.1), 3, 0, 1, H - 3);
    return;
  }
  windowHole(ctx, look.wall, look.lit, 5, 8, 6, 8, false);
  if (v === 2) {
    // Tendedero: una cuerda y la ropa colgada.
    px(ctx, PALETTE.metalLit, 1, 19, 14, 1);
    for (const [x, w, c] of [[2, 3, PALETTE.white], [6, 2, '#5c6fa8'], [9, 4, '#c98a8a'], [13, 2, '#e6dcc0']] as const) px(ctx, c, x, 20, w, 3 + (x % 2));
  } else if (v === 3) {
    // Aparato de aire bajo la ventana, con su goteo.
    px(ctx, shade(PALETTE.white, -0.2), 4, 19, 8, 5);
    px(ctx, shade(PALETTE.white, -0.05), 4, 19, 8, 1);
    px(ctx, PALETTE.metal, 5, 21, 4, 2);
    px(ctx, shade(PALETTE.metal, -0.2), 11, 24, 1, 3);
  }
}

/** Buhardilla: un tejadillo a dos aguas con su ventana, sentado en la teja junto al alero. */
function drawDormer(ctx: Ctx): void {
  px(ctx, PALETTE.wallLit, 4, 6, 8, 8);
  px(ctx, PALETTE.glass, 6, 8, 4, 5);
  px(ctx, shade(PALETTE.glassLit, -0.3), 6, 8, 1, 2);
  for (let i = 0; i < 5; i++) {
    px(ctx, PALETTE.roofALit, 3 + i, 5 - i, 1, 2);
    px(ctx, PALETTE.roofA, 12 - i, 5 - i, 1, 2);
  }
  px(ctx, PALETTE.roofALit, 7, 1, 2, 1);
  ctx.globalAlpha = 0.3;
  px(ctx, PALETTE.ink, 12, 7, 2, 7);
  ctx.globalAlpha = 1;
}

/** Antena de televisión: mástil, dos travesaños y la sombra del mástil en el tejado. */
function drawAntenna(ctx: Ctx): void {
  ctx.globalAlpha = 0.25;
  px(ctx, PALETTE.ink, 8, 12, 5, 1);
  ctx.globalAlpha = 1;
  px(ctx, PALETTE.metalLit, 7, 1, 1, 12);
  px(ctx, PALETTE.metalLit, 3, 3, 9, 1);
  px(ctx, PALETTE.metal, 4, 6, 7, 1);
  for (const x of [3, 5, 9, 11]) px(ctx, PALETTE.metal, x, 3, 1, 2);
}

/** Terraza de azotea: macetas, una sombrilla y una silla de plástico. */
function drawTerrace(ctx: Ctx): void {
  px(ctx, shade(PALETTE.stoneLit, 0.05), 1, 1, 14, 14);
  px(ctx, PALETTE.brick, 1, 1, 3, 3);
  px(ctx, PALETTE.leafLit, 1, 0, 3, 2);
  px(ctx, PALETTE.brick, 12, 1, 3, 3);
  px(ctx, PALETTE.leaf, 12, 0, 3, 2);
  px(ctx, '#c0493f', 5, 6, 7, 5);
  px(ctx, PALETTE.white, 7, 6, 3, 5);
  px(ctx, shade('#c0493f', 0.15), 5, 6, 7, 1);
  px(ctx, PALETTE.white, 3, 12, 3, 2);
}

/** Patio de luces, 32 × 32: el pozo oscuro entre viviendas, con la luz del noroeste en sus paredes de dentro. */
function drawPatio(ctx: Ctx): void {
  px(ctx, shade(PALETTE.stone, 0.05), 0, 0, 32, 32);
  px(ctx, shade(PALETTE.wall, -0.25), 3, 3, 26, 26);
  px(ctx, shade(PALETTE.wall, -0.05), 3, 3, 26, 5);
  px(ctx, shade(PALETTE.wall, -0.4), 22, 8, 7, 21);
  px(ctx, shade(PALETTE.ink, 0.08), 8, 12, 14, 17);
  for (const [x, y] of [[5, 4], [12, 4], [19, 4]] as const) px(ctx, PALETTE.glass, x, y, 3, 3);
  px(ctx, PALETTE.metalLit, 9, 14, 12, 1);
  px(ctx, PALETTE.white, 10, 15, 2, 2);
  px(ctx, '#5c6fa8', 14, 15, 3, 2);
}

/** Muro cortafuegos entre dos casas de la misma manzana: sobresale del tejado, luz a un lado y sombra al otro. */
function drawFirewall(ctx: Ctx): void {
  px(ctx, shade(PALETTE.stone, 0.08), 0, 0, 2, TILE);
  px(ctx, shade(PALETTE.stone, 0.2), 0, 0, 1, TILE);
  ctx.globalAlpha = 0.3;
  px(ctx, PALETTE.ink, 2, 0, 2, TILE);
  ctx.globalAlpha = 1;
}

/** Pilastra entre dos casas en la fachada: la junta de una medianera. */
function drawPilaster(ctx: Ctx): void {
  px(ctx, shade(PALETTE.stone, 0.06), 0, 0, 2, STOREY);
  px(ctx, shade(PALETTE.stone, 0.18), 0, 0, 1, STOREY);
  px(ctx, shade(PALETTE.stone, -0.2), 1, 0, 1, STOREY);
}

/** Placa del rótulo: fondo oscuro, icono en claro, un borde de color. */
function drawSign(ctx: Ctx, sign: Sign): void {
  const edge: Readonly<Record<Sign, string>> = {
    house: PALETTE.amber, dumbbell: PALETTE.glassLit, cup: PALETTE.amber, hanger: PALETTE.white, basket: PALETTE.leafLit, fork: PALETTE.rugLit,
    cross: PALETTE.leafLit, scissors: PALETTE.glassLit, euro: PALETTE.amber, apple: RUST, key: PALETTE.amber,
    drop: PALETTE.glassLit, book: PALETTE.white, flag: PALETTE.amber, plate: PALETTE.white, note: NEON_PINK, wine: PALETTE.rugLit,
    dress: '#e6dcc0', cap: NEON_CYAN, tag: PALETTE.leafLit, heart: NEON_PINK, disc: PALETTE.amber,
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
    case 'dress': p(7, 3, 2, 2); p(6, 5, 4, 2); p(5, 7, 6, 2); p(4, 9, 8, 3); px(ctx, RUST, 6, 7, 4, 1); break;
    case 'cap': p(5, 5, 6, 4); p(4, 7, 1, 2); p(10, 8, 4, 2); px(ctx, NEON_CYAN, 6, 5, 2, 1); break;
    case 'tag': p(6, 4, 6, 7); p(5, 5, 1, 5); p(4, 6, 1, 3); px(ctx, PALETTE.ink, 6, 7, 1, 1); px(ctx, PALETTE.ink, 8, 6, 3, 1); px(ctx, PALETTE.ink, 8, 8, 2, 1); break;
    case 'heart': px(ctx, RUST, 4, 5, 3, 3); px(ctx, RUST, 9, 5, 3, 3); px(ctx, RUST, 4, 7, 8, 2); px(ctx, RUST, 5, 9, 6, 1); px(ctx, RUST, 6, 10, 4, 1); px(ctx, RUST, 7, 11, 2, 1); p(3, 7, 10, 1); break;
    case 'disc': p(5, 4, 6, 8); p(4, 5, 8, 6); px(ctx, PALETTE.ink, 5, 5, 6, 6); px(ctx, PALETTE.amber, 7, 7, 2, 2); px(ctx, shade(PALETTE.ink, 0.15), 6, 5, 2, 1); break;
    case 'wine': p(5, 3, 6, 1); p(5, 4, 1, 3); p(10, 4, 1, 3); px(ctx, PALETTE.rugLit, 6, 5, 4, 2); p(6, 7, 4, 1); p(7, 8, 2, 3); p(5, 11, 6, 1); break;
  }
}


function drawAtm(ctx: Ctx): void {
  px(ctx, PALETTE.stoneLit, 0, 0, TILE, TILE);
  px(ctx, PALETTE.ink, 3, 3, 10, 12);
  px(ctx, PALETTE.glassLit, 5, 5, 6, 3);
  px(ctx, PALETTE.amber, 5, 10, 6, 1);
  px(ctx, PALETTE.metal, 5, 12, 6, 1);
}

type Deco = 'chimney' | 'ac' | 'skylight' | 'solar' | 'tank' | 'vent' | 'hatch' | 'antenna' | 'terrace';

/**
 * Sombra de algo que sobresale del tejado: hacia el sureste (luz del noroeste,
 * ART_BIBLE §5), dos píxeles a la derecha y dos debajo, sin negro.
 */
function dropShadow(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.globalAlpha = 0.26;
  px(ctx, PALETTE.ink, x + w, y + 1, 2, h);
  px(ctx, PALETTE.ink, x + 1, y + h, w + 1, 2);
  ctx.globalAlpha = 0.12;
  px(ctx, PALETTE.ink, x + w + 2, y + 2, 1, h);
  ctx.globalAlpha = 1;
}

/**
 * Lo que hay encima de un tejado, con volumen: la cara de arriba con la luz,
 * la del sur más oscura (la que se ve de canto) y su sombra en el tejado.
 */
function drawDeco(ctx: Ctx, deco: Deco): void {
  switch (deco) {
    case 'chimney': {
      // Chimenea de ladrillo: la boca arriba, el cañón con sus hiladas y el sombrerete.
      dropShadow(ctx, 5, 3, 6, 10);
      px(ctx, PALETTE.brick, 5, 6, 6, 7);
      for (let y = 7; y < 13; y += 2) px(ctx, shade(PALETTE.brick, -0.12), 5, y, 6, 1);
      px(ctx, shade(PALETTE.brick, -0.2), 10, 6, 1, 7);
      px(ctx, PALETTE.brickLit, 5, 3, 6, 3);
      px(ctx, shade(PALETTE.brickLit, 0.1), 5, 3, 6, 1);
      px(ctx, PALETTE.ink, 6, 4, 4, 1);
      px(ctx, shade(PALETTE.stone, 0.05), 4, 2, 8, 1);
      break;
    }
    case 'ac': {
      // Condensadora: tapa clara, frente con el ventilador y la rejilla, y el tubo que baja.
      dropShadow(ctx, 2, 4, 12, 9);
      px(ctx, shade(PALETTE.white, -0.12), 2, 4, 12, 3);
      px(ctx, shade(PALETTE.white, -0.02), 2, 4, 12, 1);
      px(ctx, shade(PALETTE.white, -0.3), 2, 7, 12, 6);
      px(ctx, shade(PALETTE.white, -0.42), 13, 7, 1, 6);
      px(ctx, PALETTE.metal, 4, 8, 5, 4);
      px(ctx, shade(PALETTE.metal, -0.2), 5, 9, 3, 2);
      px(ctx, PALETTE.metalLit, 6, 9, 1, 1);
      for (let y = 8; y < 12; y += 1) px(ctx, shade(PALETTE.white, -0.38), 10, y, 2, 1);
      px(ctx, shade(PALETTE.metal, -0.1), 14, 10, 1, 4);
      break;
    }
    case 'skylight': {
      // Claraboya: marco levantado y el cielo en el cristal, en diagonal.
      dropShadow(ctx, 2, 3, 12, 10);
      px(ctx, PALETTE.metalLit, 2, 3, 12, 10);
      px(ctx, PALETTE.metal, 2, 12, 12, 1);
      px(ctx, PALETTE.metal, 13, 3, 1, 10);
      px(ctx, shade(PALETTE.glass, 0.08), 3, 4, 10, 8);
      for (let i = 0; i < 5; i++) px(ctx, shade(PALETTE.glassLit, -0.2), 4 + i, 10 - i, 2, 1);
      px(ctx, PALETTE.glassLit, 3, 4, 10, 1);
      px(ctx, PALETTE.metal, 8, 4, 1, 8);
      break;
    }
    case 'solar': {
      // Placa inclinada hacia el sur: celdas con su cuadrícula, el canto de arriba con luz y las patas.
      dropShadow(ctx, 1, 3, 14, 10);
      px(ctx, PALETTE.metal, 2, 12, 1, 2);
      px(ctx, PALETTE.metal, 13, 12, 1, 2);
      px(ctx, PALETTE.ink, 1, 3, 14, 10);
      for (let x = 2; x < 15; x += 3) for (let y = 4; y < 12; y += 2) px(ctx, (x + y) % 4 ? '#2a3d6b' : '#324a80', x, y, 2, 1);
      px(ctx, '#5a74b0', 1, 3, 14, 1);
      px(ctx, shade(PALETTE.ink, 0.2), 1, 12, 14, 1);
      break;
    }
    case 'tank': {
      // Depósito redondo: tapa elíptica con luz, cuerpo con dos zunchos, escalerilla.
      dropShadow(ctx, 3, 3, 10, 10);
      px(ctx, PALETTE.metal, 3, 6, 10, 7);
      px(ctx, shade(PALETTE.metal, -0.15), 11, 6, 2, 7);
      px(ctx, shade(PALETTE.metal, -0.2), 3, 8, 10, 1);
      px(ctx, shade(PALETTE.metal, -0.2), 3, 11, 10, 1);
      px(ctx, PALETTE.metalLit, 4, 3, 8, 3);
      px(ctx, PALETTE.metalLit, 3, 4, 10, 2);
      px(ctx, shade(PALETTE.metalLit, 0.12), 5, 3, 4, 1);
      px(ctx, PALETTE.ink, 2, 6, 1, 7);
      for (let y = 7; y < 13; y += 2) px(ctx, PALETTE.ink, 1, y, 2, 1);
      break;
    }
    case 'vent': {
      // Tubo de ventilación con su sombrerete, y un segundo más pequeño.
      dropShadow(ctx, 6, 5, 4, 8);
      px(ctx, PALETTE.metal, 7, 7, 2, 6);
      px(ctx, PALETTE.metalLit, 7, 7, 1, 6);
      px(ctx, PALETTE.metalLit, 5, 5, 6, 2);
      px(ctx, shade(PALETTE.metal, -0.15), 5, 6, 6, 1);
      dropShadow(ctx, 11, 10, 2, 3);
      px(ctx, PALETTE.metal, 11, 10, 2, 3);
      px(ctx, PALETTE.metalLit, 11, 10, 2, 1);
      break;
    }
    case 'hatch': {
      // Trampilla de acceso: una caja baja con la tapa en pendiente y el asa.
      dropShadow(ctx, 3, 4, 10, 8);
      px(ctx, shade(PALETTE.stone, -0.05), 3, 8, 10, 4);
      px(ctx, shade(PALETTE.stone, -0.2), 12, 8, 1, 4);
      px(ctx, PALETTE.metalLit, 3, 4, 10, 4);
      px(ctx, shade(PALETTE.metalLit, 0.1), 3, 4, 10, 1);
      px(ctx, PALETTE.ink, 7, 6, 2, 1);
      break;
    }
  }
}

/**
 * Casas de vecinos de una misma manzana: cada una con su color de fachada. El
 * del estilo es el del medio; a los lados, dos parientes (ladrillo más oscuro
 * o más anaranjado, piedra más fría, revoco salmón o gris). Sólo en los estilos
 * que forman manzana.
 */
const WALL_TONES: Partial<Record<BuildingStyle, readonly [string, string]>> = {
  'res-brick': ['#94503c', '#b8704f'],
  'res-stone': ['#b5ab98', '#9da3a2'],
  'res-plaster': ['#d9a98a', '#d4cdb8'],
  backdrop: ['#bfa57f', '#d2c3a6'],
};
const toned = (style: BuildingStyle, t: number): Look => {
  const alt = WALL_TONES[style];
  return t === 1 || !alt ? LOOKS[style] : { ...LOOKS[style], wall: alt[t === 0 ? 0 : 1] };
};
/** Sufijo de la textura para el tono `t` (1, el del estilo, no lleva). */
const tk = (t: number): string => (t === 1 ? '' : `-k${t}`);

export function buildBuildingTextures(scene: Phaser.Scene): void {
  for (const style of STYLES) {
    for (const t of WALL_TONES[style] ? [0, 1, 2] : [1]) {
      const look = toned(style, t);
      const k = tk(t);
      for (let v = 0; v < 3; v++) {
        make(scene, `bs-${style}-front-${v}${k}`, TILE, TILE, (ctx) => drawFront(ctx, look, v));
        // Fachadas al sur, a escala: una planta son dos tiles. Las altas, con cuatro persianas distintas.
        make(scene, `bs-${style}-front-${v}-t${k}`, TILE, STOREY, (ctx) => drawGround(ctx, look, v));
        for (let s = 0; s < 4; s++) make(scene, `bs-${style}-upper-${v}-${s}-t${k}`, TILE, STOREY, (ctx) => drawUpperTall(ctx, look, v, s));
      }
      for (let v = 0; v < 4; v++) make(scene, `bs-${style}-back-${v}${k}`, TILE, STOREY, (ctx) => drawBack(ctx, look, v));
      make(scene, `bs-${style}-door${k}`, TILE, TILE, (ctx) => drawDoor(ctx, look));
      make(scene, `bs-${style}-door-t${k}`, TILE, STOREY, (ctx) => drawDoorTall(ctx, look, false));
    }
    const look = LOOKS[style];
    if (look.door === 'glass') {
      make(scene, `bs-${style}-door-open`, TILE, TILE, (ctx) => drawDoorOpen(ctx, look));
      make(scene, `bs-${style}-door-open-t`, TILE, STOREY, (ctx) => drawDoorTall(ctx, look, true));
    }
    if (look.awning) for (let k = 0; k < 3; k++) make(scene, `bs-awn-${style}-${k}`, TILE, 10, (ctx) => drawAwningStyle(ctx, look, k));
  }
  const signs = [...new Set(STYLES.flatMap((s) => (LOOKS[s].sign ? [LOOKS[s].sign] : [])))];
  for (const s of signs) make(scene, `bs-sign-${s}`, TILE, TILE, (ctx) => drawSign(ctx, s));
  for (const d of ['chimney', 'ac', 'skylight', 'solar', 'tank', 'vent', 'hatch'] as const) make(scene, `bs-deco-${d}`, TILE, TILE, (ctx) => drawDeco(ctx, d));
  make(scene, 'bs-deco-dormer', TILE, TILE, drawDormer);
  make(scene, 'bs-deco-antenna', TILE, TILE, drawAntenna);
  make(scene, 'bs-deco-terrace', TILE, TILE, drawTerrace);
  make(scene, 'bs-patio', TILE * 2, TILE * 2, drawPatio);
  make(scene, 'bs-firewall', 4, TILE, drawFirewall);
  make(scene, 'bs-pilaster', 2, STOREY, drawPilaster);
  for (const g of GOODS) make(scene, `bs-goods-${g}`, 14, 16, (ctx) => drawGoods(ctx, g));
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
  gym: ['ac', 'solar', 'skylight', 'vent', 'ac'],
  office: ['solar', 'ac', 'skylight', 'hatch', 'ac'],
  super: ['ac', 'ac', 'skylight', 'vent'],
  study: ['skylight', 'chimney'],
  metro: [],
  works: [],
};

/** Ventana de la espalda (drawBack): la luz de casa, de noche. */
const BACK_PANE = [5, 8, 6, 8] as const;

/** Qué hueco lleva cada columna de planta baja: escaparate corrido, cristal, o ventanas alternas con paño. */
function groundVariant(look: Look, style: BuildingStyle, i: number, edge: boolean, r: number): number {
  if (look.shop === 'shutter') return r === 0 ? 2 : 1;
  if (look.shop === 'display' || look.shop === 'glass' || look.shop === 'metro') return edge ? 0 : i % 3 === 1 ? 2 : 1;
  if (style === 'home') return i % 2 === 1 ? 1 : 0;
  return i % 2 === 1 ? (r === 3 ? 2 : 1) : 0;
}

/** Teja o azotea: la misma prueba que drawRoofArea (el rojo manda sobre el azul). */
function isTiled(look: Look, tone: number): boolean {
  const n = Number.parseInt(shade(look.roof, ROOF_TONES[tone]).slice(1), 16);
  return ((n >> 16) & 255) > (n & 255) + 24;
}

interface RowHouse {
  x0: number;
  w: number;
  /** Tono de fachada (0–2; 1 es el del estilo). */
  tone: number;
  roof: Look;
  roofTone: number;
  /** Dónde cae la cumbrera, en fracción del faldón. */
  ridge: number;
  seed: number;
}

/**
 * Las casas de una manzana: un bloque de vecinos de 10 tiles o más se parte
 * en casas de 4 a 7 de ancho, siempre igual para el mismo edificio. Cada una
 * saca de su semilla el color de fachada, si tiene teja o azotea, el tono y la
 * altura de la cumbrera. Lo demás (locales, oficinas, casas sueltas) es una
 * sola pieza, como hasta ahora.
 */
function rowHouses(b: BuildingDef): RowHouse[] {
  const look = LOOKS[b.style];
  const seed = hash(b.id);
  if (!WALL_TONES[b.style] || b.w < 10) return [{ x0: b.tx, w: b.w, tone: 1, roof: look, roofTone: seed % ROOF_TONES.length, ridge: 0.42, seed }];
  const out: RowHouse[] = [];
  let x = b.tx;
  let left = b.w;
  for (let k = 0; left > 0; k++) {
    const s = hash(`${b.id}#${k}`);
    let w = 4 + (s % 4);
    if (left - w < 4) w = left;
    const roofKind = (s >>> 4) % 3;
    const roof = roofKind === 2 ? look : { ...look, roof: roofKind === 0 ? PALETTE.roofA : PALETTE.roofB, roofLit: roofKind === 0 ? PALETTE.roofALit : PALETTE.roofBLit };
    // Dos casas vecinas nunca del mismo color.
    const tone = (s + (out.length ? out[out.length - 1].tone + 1 : 0)) % 3;
    out.push({ x0: x, w, tone, roof, roofTone: (s >>> 8) % ROOF_TONES.length, ridge: 0.3 + ((s >>> 12) % 4) * 0.06, seed: s });
    x += w;
    left -= w;
  }
  return out;
}

/**
 * Pinta los edificios sobre la RenderTexture del suelo: tejado, planta alta,
 * planta baja con puerta, rótulo y cosas en el tejado. Horneado una vez por
 * visita; en cada frame no cuesta nada.
 */
/**
 * Hueco acristalado de una fachada, en px de mundo: world/Lighting decide si se
 * enciende. El escaparate de la planta baja es del local (luz si está abierto);
 * las ventanas de arriba son de casas (luz si hay alguien, según la hora).
 */
export interface WindowSpot {
  x: number;
  y: number;
  w: number;
  h: number;
  building: string;
  /** Escaparate o cristal de la planta baja: el local. */
  shop: boolean;
  /** Color de la luz de dentro (Look.lit): ámbar de café, blanco de oficina, rosa de discoteca. */
  tone: number;
}

/** Dónde está el cristal de cada pieza de fachada, en px dentro del tile (ver drawFront y drawUpper). */
const SHOP_PANE: Partial<Record<Shop, readonly [number, number, number, number]>> = {
  windows: [4, 6, 8, 6],
  display: [1, 5, 14, 9],
  glass: [1, 4, 14, 10],
  arched: [5, 5, 6, 10],
};
/** Los mismos huecos en las fachadas a escala (16 × 32). */
const SHOP_PANE_T: Partial<Record<Shop, readonly [number, number, number, number]>> = {
  windows: [4, 10, 8, 14],
  display: [1, 11, 14, 17],
  glass: [1, 7, 14, 20],
  arched: [4, 9, 8, 18],
};
const UPPER_PANE_T: Readonly<Record<Upper, readonly [number, number, number, number]>> = {
  windows: [4, 7, 8, 16],
  balcony: [4, 7, 8, 16],
  glass: [1, 4, 14, 25],
  band: [0, 10, 16, 11],
};

/** Parte de un edificio que brilla de noche (rótulo, apliques): world/Lighting la pone encima de la oscuridad. */
export interface GlowSpot {
  key: string;
  x: number;
  y: number;
  /** Rótulo de un local: sólo brilla con el local abierto. Sin él, siempre (la boca de metro). */
  building?: string;
}

export function bakeBuildings(rt: Phaser.GameObjects.RenderTexture, buildings: readonly BuildingDef[], glows: GlowSpot[] = []): WindowSpot[] {
  const windows: WindowSpot[] = [];
  const pane = (b: BuildingDef, shop: boolean, p: readonly [number, number, number, number] | undefined, tx: number, ty: number): void => {
    const tone = Number.parseInt(LOOKS[b.style].lit.slice(1), 16);
    if (p) windows.push({ x: tx * TILE + p[0], y: ty * TILE + p[1], w: p[2], h: p[3], building: b.id, shop, tone });
  };
  for (const b of buildings) {
    // Boca de metro de 3 × 3 (Visual V2, world/UrbanArt): marquesina, rótulo y escalera en una pieza.
    // Boca principal de 5 × 4 (la de la plazuela de referencia): pórtico, rótulo, paneles y escalera en una pieza.
    if (b.style === 'metro' && b.w === 5 && b.h === 4) {
      rt.batchDraw('bs-metro-hero', b.tx * TILE, b.ty * TILE);
      glows.push({ key: 'bs-metro-hero-glow', x: b.tx * TILE, y: b.ty * TILE });
      continue;
    }
    if (b.style === 'metro' && b.w === 3 && b.h === 3) {
      rt.batchDraw('bs-metro-entrance', b.tx * TILE, b.ty * TILE);
      glows.push({ key: 'bs-metro-entrance-glow', x: b.tx * TILE, y: b.ty * TILE });
      continue;
    }
    const look = LOOKS[b.style];
    const seed = hash(b.id);
    const rows = facadeRows(b);
    const frontRow = b.front === 'n' ? b.ty : b.ty + b.h - 1;
    const draw = (key: string, tx: number, ty: number): void => {
      rt.batchDraw(key, tx * TILE, ty * TILE);
    };

    // Una manzana de vecinos larga no es un solo edificio: se parte en casas de 4 a 7 tiles, cada una con
    // su color de fachada, su tejado (teja o azotea), su cumbrera, y un cortafuegos entre ellas.
    const segs = rowHouses(b);
    const back = backRows(b);
    const floors = b.front === 's' ? (b.floors ?? 1) : 0;
    const roofTop = b.front === 'n' ? b.ty + 1 : b.ty;
    const roofBottom = b.ty + b.h - 1 - (b.front === 's' ? rows : back);
    const roofRows = roofBottom - roofTop + 1;
    const groundTop = frontRow - (STOREY_ROWS - 1);
    const backTop = b.ty + b.h - back;
    // Cada local su toldo (rayas, liso festoneado o marquesina) y su escaparate, aunque sean del mismo oficio.
    const awning = look.awning ? hash(`${b.id}:awn`) % 3 : -1;
    const goods = look.shop === 'display' ? GOODS_BY_STYLE[b.style] : undefined;
    const business = !b.style.startsWith('res-') && b.style !== 'home' && b.style !== 'backdrop';

    let patioDone = false;
    for (const seg of segs) {
      const k = tk(seg.tone);
      for (let x = seg.x0; x < seg.x0 + seg.w; x++) {
        const i = x - b.tx;
        const edge = i === 0 || i === b.w - 1;
        const r = (seed >>> (i % 16)) & 3;
        const v = groundVariant(look, b.style, i, edge, r);
        if (b.front === 's') {
          // Planta baja de dos filas con la puerta y, encima, cada planta de dos filas.
          if (x === b.doorX) draw(`bs-${b.style}-door-t${k}`, x, groundTop);
          else {
            draw(`bs-${b.style}-front-${v}-t${k}`, x, groundTop);
            if (v !== 0) {
              pane(b, business, SHOP_PANE_T[look.shop], x, groundTop);
              if (goods) rt.batchDraw(`bs-goods-${goods[(hash(`${b.id}:${i}`) >>> 3) % goods.length]}`, x * TILE + 1, groundTop * TILE + 11);
            }
          }
          if (awning >= 0) rt.batchDraw(`bs-awn-${b.style}-${awning}`, x * TILE, groundTop * TILE + 3);
          for (let f = 1; f < floors; f++) {
            const top = groundTop - f * STOREY_ROWS;
            // Cada planta alterna huecos y paños a su manera; la persiana, distinta en cada ventana.
            const q = (seed >>> ((i + f * 5) % 16)) & 3;
            let u: number;
            if (look.upper === 'glass' || look.upper === 'band') u = q === 2 ? 2 : 1;
            else if (b.style === 'home') u = i % 2 === 1 ? 2 : 0;
            else u = i % 2 === 1 ? (q & 1 ? 1 : 2) : 0;
            draw(`bs-${b.style}-upper-${u}-${(q + i + f) % 4}-t${k}`, x, top);
            if (u !== 0 || look.upper === 'glass' || look.upper === 'band') pane(b, look.upper === 'glass' || look.upper === 'band', UPPER_PANE_T[look.upper], x, top);
          }
        } else if (b.front === 'n') {
          // Al norte: la franja de la calle con su puerta y, al fondo, la espalda del edificio.
          if (x === b.doorX) draw(`bs-${b.style}-door${k}`, x, frontRow);
          else {
            draw(`bs-${b.style}-front-${v}${k}`, x, frontRow);
            if (v !== 0) pane(b, business, SHOP_PANE[look.shop], x, frontRow);
          }
          if (back) {
            const q = hash(`${b.id}:b:${i}`) % 5;
            const bv = q === 0 ? 0 : q < 3 ? 1 : q === 3 ? 2 : 3;
            draw(`bs-${b.style}-back-${bv}${k}`, x, backTop);
            if (bv !== 0) pane(b, false, BACK_PANE, x, backTop);
          }
        }
      }

      if (roofRows <= 0) continue;
      const rw = seg.w * TILE;
      const rh = roofRows * TILE;
      const key = `bs-roof-${b.id}-${seg.x0}-${rw}x${rh}`;
      make(rt.scene, key, rw, rh, (ctx) => drawRoofArea(ctx, seg.roof, b.style, seg.roofTone, rw, rh, seg.seed, !b.front || (b.front === 'n' && back === 0), seg.ridge));
      draw(key, seg.x0, roofTop);

      // Encima del tejado, según el tejado: en teja chimeneas, antenas y buhardillas junto al alero; en azotea
      // aparatos, depósitos, placas y alguna terraza con macetas; en las casas grandes, el patio de luces.
      const tiled = isTiled(seg.roof, seg.roofTone);
      if (tiled && b.front === 's' && seg.w >= 4 && b.style !== 'works') {
        draw('bs-deco-dormer', seg.x0 + 1 + (seg.seed % (seg.w - 2)), roofBottom);
      }
      const decos = DECO_BY_STYLE[b.style] ?? (tiled ? (['chimney', 'antenna', 'chimney', 'skylight', 'vent'] as const) : (['ac', 'tank', 'antenna', 'terrace', 'solar', 'ac', 'vent', 'hatch', 'ac'] as const));
      if (decos.length === 0 || seg.w < 4 || roofRows < 3) continue;
      // Patio de luces: como mucho uno por edificio, en la mitad de ellos, y cada uno en su sitio del tejado.
      const hasPatio = !patioDone && seg.w >= 6 && roofRows >= 5 && seg.seed % 2 === 0;
      const patio = hasPatio ? { tx: seg.x0 + 1 + (seg.seed >>> 5) % (seg.w - 3), ty: roofTop + 1 + (seg.seed >>> 9) % (roofRows - 3) } : null;
      if (patio) patioDone = true;
      if (patio) rt.batchDraw('bs-patio', patio.tx * TILE, patio.ty * TILE);
      // Una pieza cada doce tiles de tejado, hasta ocho; nunca una encima de otra (un tile libre alrededor).
      const count = Math.min(8, Math.max(1, Math.floor((seg.w * roofRows) / 12)));
      const placed: { x: number; y: number }[] = [];
      for (let n = 0; n < count * 2 && placed.length < count; n++) {
        const s = hash(`${b.id}:${seg.x0}:${n}`);
        const x = seg.x0 + 1 + (s % Math.max(1, seg.w - 2));
        const y = roofTop + 1 + ((s >>> 8) % Math.max(1, roofRows - 3));
        if (patio && x >= patio.tx - 1 && x <= patio.tx + 2 && y >= patio.ty - 1 && y <= patio.ty + 2) continue;
        if (placed.some((p) => Math.abs(p.x - x) <= 1 && Math.abs(p.y - y) <= 1)) continue;
        placed.push({ x, y });
        draw(`bs-deco-${decos[(s >>> 16) % decos.length]}`, x, y);
      }
    }

    // Juntas entre casas: el cortafuegos que asoma en el tejado y la pilastra en cada planta de fachada.
    for (const seg of segs.slice(1)) {
      for (let y = roofTop; y <= roofBottom; y++) rt.batchDraw('bs-firewall', seg.x0 * TILE - 2, y * TILE);
      if (b.doorX === seg.x0 || b.doorX === seg.x0 - 1) continue;
      for (let f = 0; f < floors; f++) rt.batchDraw('bs-pilaster', seg.x0 * TILE - 1, (groundTop - f * STOREY_ROWS) * TILE);
      if (back) rt.batchDraw('bs-pilaster', seg.x0 * TILE - 1, backTop * TILE);
    }

    // Rótulo: al sur, placa en banderola junto a la puerta a la altura del dintel; al norte, en la franja de fachada.
    if (look.sign && b.doorX !== undefined) {
      const side = b.doorX + 1 < b.tx + b.w ? b.doorX + 1 : b.doorX - 1;
      const [sx, sy] = b.front === 's' ? [side, groundTop] : [side, frontRow];
      draw(`bs-sign-${look.sign}`, sx, sy);
      // De noche, el rótulo de un local abierto se enciende: la misma placa, encima de la oscuridad.
      glows.push({ key: `bs-sign-${look.sign}`, x: sx * TILE, y: sy * TILE, building: b.id });
    }
    if (b.style === 'bank' && b.doorX !== undefined && b.doorX - 1 >= b.tx) draw('bs-atm', b.doorX - 1, frontRow);
  }
  return windows;
}
