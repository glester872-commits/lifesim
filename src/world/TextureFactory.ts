import Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import { FACINGS, type Facing } from '../types/game';
import { NPC_DEFS, PASSENGER_LOOKS, UNIFORM_LOOKS } from '../data/npcs';
import { blob, drawWord, make, px, shade, sprinkle, type Ctx } from './paint';
import { buildBuildingTextures } from './BuildingArt';
import { buildPropTextures } from './PropArt';
import { buildUrbanTextures } from './UrbanArt';
import { buildVegetationTextures } from './Vegetation';
import { buildStreetTextures } from './StreetArt';
import { buildVehicleTextures } from './VehicleArt';
import { buildWeatherTextures } from './WeatherView';
import { colorsOf, drawHuman, POSES, type HumanColors, type Pose } from './HumanArt';
import type { Appearance } from '../data/appearance';
import { withAppearance } from '../systems/Appearance';
import { WEATHER_LOOKS } from './WeatherLooks';

export const PLAYER_W = 16;
export const PLAYER_H = 24;

// ---------------------------------------------------------------- terreno

function drawRoof(ctx: Ctx, base: string, lit: string, variant: number): void {
  const seam = shade(base, -0.05);
  px(ctx, base, 0, 0, TILE, TILE);
  px(ctx, seam, 0, variant === 0 ? 7 : 3, TILE, 1);
  px(ctx, seam, variant === 0 ? 7 : 11, 0, 1, TILE);
  sprinkle(ctx, lit, TILE, TILE, 13 + variant, 8);
  sprinkle(ctx, seam, TILE, TILE, 88 + variant, 5);
}

/** Fachada genérica: alero superior, muro y (en la variante 0) un hueco iluminado. */
function drawFacade(
  ctx: Ctx,
  wall: string,
  eave: string,
  glass: string,
  glowColor: string,
  variant: number,
  win: { x: number; y: number; w: number; h: number },
): void {
  px(ctx, wall, 0, 0, TILE, TILE);
  px(ctx, eave, 0, 0, TILE, 3);
  px(ctx, shade(eave, -0.12), 0, 3, TILE, 1);
  sprinkle(ctx, shade(wall, 0.04), TILE, TILE, 61 + variant, 6);
  if (variant !== 0) return;
  px(ctx, shade(wall, -0.12), win.x - 1, win.y - 1, win.w + 2, win.h + 2);
  px(ctx, glass, win.x, win.y, win.w, win.h);
  px(ctx, glowColor, win.x, win.y, win.w, 1);
  px(ctx, glowColor, win.x, win.y, 1, win.h);
}

function drawDoor(ctx: Ctx): void {
  px(ctx, PALETTE.wallDark, 0, 0, TILE, TILE);
  px(ctx, PALETTE.ink, 2, 2, 12, 12);
  ctx.globalAlpha = 0.35;
  px(ctx, PALETTE.amber, 3, 8, 10, 6);
  ctx.globalAlpha = 1;
  px(ctx, PALETTE.amber, 4, 12, 8, 2);
  px(ctx, PALETTE.pavement, 0, 14, TILE, 2);
  px(ctx, PALETTE.pavementLit, 0, 14, TILE, 1);
}

/** Cabeza del muro vista desde arriba; su cara hacia la sala la pinta LocationBuilder donde toca suelo. */
function drawWall(ctx: Ctx, variant: number): void {
  px(ctx, PALETTE.wallTop, 0, 0, TILE, TILE);
  px(ctx, shade(PALETTE.wallTop, 0.05), 0, variant === 0 ? 7 : 3, TILE, 1);
  px(ctx, shade(PALETTE.wallTop, -0.04), variant === 0 ? 5 : 11, 0, 1, TILE);
}

function drawRug(ctx: Ctx, variant: number): void {
  px(ctx, PALETTE.rug, 0, 0, TILE, TILE);
  for (let y = variant; y < TILE; y += 4) px(ctx, PALETTE.rugLit, 0, y, TILE, 1);
  sprinkle(ctx, shade(PALETTE.rug, -0.06), TILE, TILE, 67 + variant, 8);
}

function drawWater(ctx: Ctx, variant: number): void {
  px(ctx, PALETTE.water, 0, 0, TILE, TILE);
  sprinkle(ctx, shade(PALETTE.water, -0.05), TILE, TILE, 37 + variant, 10);
  px(ctx, PALETTE.waterLit, variant === 0 ? 2 : 8, 5, 5, 1);
  px(ctx, PALETTE.waterLit, variant === 0 ? 9 : 3, 11, 4, 1);
  sprinkle(ctx, PALETTE.waterLit, TILE, TILE, 83 + variant, 3);
}

/** Borde del canal: pretil de piedra con barandilla; cierra el paso al agua. */
function drawQuay(ctx: Ctx, variant: number): void {
  px(ctx, PALETTE.water, 0, 0, TILE, TILE);
  px(ctx, PALETTE.stone, 0, 0, TILE, 9);
  px(ctx, PALETTE.stoneLit, 0, 0, TILE, 1);
  px(ctx, shade(PALETTE.stone, -0.1), 0, 8, TILE, 1);
  px(ctx, PALETTE.metal, 0, 2, TILE, 1);
  px(ctx, PALETTE.metal, variant === 0 ? 3 : 11, 2, 2, 6);
  sprinkle(ctx, PALETTE.stoneLit, TILE, 8, 57 + variant, 4);
}

function drawRail(ctx: Ctx, variant: number): void {
  px(ctx, PALETTE.ballast, 0, 0, TILE, TILE);
  sprinkle(ctx, shade(PALETTE.ballast, 0.07), TILE, TILE, 47 + variant, 14);
  for (let x = variant * 4; x < TILE; x += 8) px(ctx, PALETTE.sleeper, x, 3, 3, 10);
  px(ctx, PALETTE.metalLit, 0, 5, TILE, 1);
  px(ctx, PALETTE.metalLit, 0, 11, TILE, 1);
  px(ctx, shade(PALETTE.metal, -0.1), 0, 6, TILE, 1);
  px(ctx, shade(PALETTE.metal, -0.1), 0, 12, TILE, 1);
}

/** Borde de anden: franja tactil ambar del lado de la via. */
function drawPlatformEdge(ctx: Ctx): void {
  px(ctx, PALETTE.tile, 0, 0, TILE, TILE);
  px(ctx, shade(PALETTE.tile, -0.12), 0, 0, TILE, 2);
  px(ctx, PALETTE.amberDim, 0, 2, TILE, 3);
  for (let x = 1; x < TILE; x += 3) px(ctx, shade(PALETTE.amberDim, 0.12), x, 3, 1, 1);
  px(ctx, shade(PALETTE.tile, -0.06), 0, 9, TILE, 1);
  sprinkle(ctx, PALETTE.tileLit, TILE, TILE, 63, 5);
}

/** Quiosco de metro: panel oscuro con el disco de la red. */
function drawMetro(ctx: Ctx, variant: number): void {
  px(ctx, PALETTE.night, 0, 0, TILE, TILE);
  px(ctx, shade(PALETTE.night, 0.08), 0, 0, TILE, 3);
  px(ctx, shade(PALETTE.night, -0.03), 0, 3, TILE, 1);
  px(ctx, shade(PALETTE.night, variant === 0 ? 0.04 : -0.02), 2, 6, 12, 8);
  sprinkle(ctx, shade(PALETTE.night, 0.05), TILE, TILE, 29 + variant, 5);
}


/** Rótulo de 3x1 tiles: la boca de metro tiene que decir qué es. */
function drawMetroSign(ctx: Ctx): void {
  const w = TILE * 3;
  px(ctx, PALETTE.ink, 0, 1, w, 14);
  px(ctx, shade(PALETTE.night, 0.05), 1, 2, w - 2, 12);
  px(ctx, PALETTE.amberDim, 1, 2, w - 2, 1);
  px(ctx, PALETTE.amberDim, 1, 13, w - 2, 1);
  drawWord(ctx, 'METRO', 9, 5, PALETTE.amber);
}

/** Diagrama de la línea: cinco paradas y el trazado. */
function drawLineMap(ctx: Ctx): void {
  const w = TILE * 3;
  px(ctx, PALETTE.ink, 0, 1, w, 14);
  px(ctx, shade(PALETTE.night, 0.06), 1, 2, w - 2, 12);
  px(ctx, PALETTE.white, 4, 4, w - 8, 1);
  px(ctx, PALETTE.glassLit, 4, 8, w - 8, 2);
  for (let i = 0; i < 5; i++) {
    const cx = 5 + i * ((w - 10) / 4);
    px(ctx, PALETTE.white, Math.round(cx) - 1, 7, 3, 4);
  }
  px(ctx, PALETTE.amber, 4, 12, 10, 1);
  px(ctx, shade(PALETTE.white, -0.25), 18, 12, 14, 1);
}

/** Cartel publicitario: a este tamaño el texto es una mancha, y así se dibuja. */
function drawPoster(ctx: Ctx): void {
  px(ctx, PALETTE.ink, 2, 4, 12, 26);
  px(ctx, shade(PALETTE.stone, -0.12), 3, 5, 10, 24);
  px(ctx, PALETTE.rug, 4, 6, 8, 11);
  px(ctx, PALETTE.amber, 5, 8, 4, 4);
  px(ctx, PALETTE.white, 4, 19, 8, 1);
  px(ctx, PALETTE.white, 4, 21, 6, 1);
  px(ctx, shade(PALETTE.white, -0.3), 4, 23, 7, 1);
  px(ctx, PALETTE.glassLit, 4, 26, 5, 2);
}

/** Mesa de terraza con sombrilla: el toldo ocupa el tile de arriba. */
function drawParasol(ctx: Ctx): void {
  px(ctx, PALETTE.metal, 7, 18, 2, 10);
  px(ctx, PALETTE.woodDark, 5, 24, 6, 7);
  px(ctx, PALETTE.wood, 4, 26, 8, 4);
  px(ctx, PALETTE.woodLit, 5, 26, 4, 1);
  px(ctx, PALETTE.woodDark, 1, 27, 3, 3);
  px(ctx, PALETTE.woodDark, 12, 27, 3, 3);

  const canopy: [number, number][] = [
    [6, 4], [4, 8], [2, 12], [1, 14], [0, 16], [0, 16], [1, 14], [3, 10], [6, 4],
  ];
  canopy.forEach(([x, w], i) => {
    for (let dx = 0; dx < w; dx++) {
      const stripe = Math.floor((x + dx) / 3) % 2 === 0;
      px(ctx, stripe ? PALETTE.white : PALETTE.rug, x + dx, 6 + i, 1, 1);
    }
  });
  px(ctx, shade(PALETTE.rug, -0.2), 0, 15, TILE, 1);
}

function drawCafeTable(ctx: Ctx): void {
  px(ctx, PALETTE.woodDark, 2, 9, 3, 3);
  px(ctx, PALETTE.woodDark, 11, 9, 3, 3);
  px(ctx, PALETTE.metal, 7, 10, 2, 4);
  px(ctx, PALETTE.woodDark, 4, 6, 8, 6);
  px(ctx, PALETTE.wood, 5, 7, 6, 4);
  px(ctx, PALETTE.woodLit, 6, 7, 3, 1);
}

// ------------------------------------------------------------------ props

/** Puesto de mercado: toldo a rayas sobre el mostrador. */
function drawStall(ctx: Ctx): void {
  px(ctx, PALETTE.metal, 2, 20, 2, 12);
  px(ctx, PALETTE.metal, 12, 20, 2, 12);
  px(ctx, PALETTE.wood, 1, 20, TILE - 2, 5);
  px(ctx, PALETTE.woodLit, 1, 20, TILE - 2, 1);
  px(ctx, shade(PALETTE.wood, -0.08), 1, 24, TILE - 2, 1);
  px(ctx, PALETTE.leaf, 3, 18, 3, 2);
  px(ctx, PALETTE.amber, 7, 18, 3, 2);
  px(ctx, PALETTE.rug, 11, 18, 3, 2);
  px(ctx, PALETTE.ink, 0, 10, TILE, 2);
  for (let x = 0; x < TILE; x += 4) {
    px(ctx, PALETTE.rug, x, 12, 2, 5);
    px(ctx, PALETTE.white, x + 2, 12, 2, 5);
  }
  px(ctx, shade(PALETTE.rug, -0.15), 0, 17, TILE, 1);
}


const BUSH_BODY: readonly [number, number][] = [
  [5, 6], [3, 10], [2, 12], [1, 14], [1, 14], [1, 14], [2, 12], [2, 12],
  [3, 10], [5, 6],
];

function drawBush(ctx: Ctx): void {
  const dark = shade(PALETTE.leaf, -0.08);
  blob(ctx, dark, 6, BUSH_BODY);
  blob(ctx, PALETTE.leaf, 5, BUSH_BODY.slice(0, 8));
  px(ctx, PALETTE.leafLit, 4, 8, 4, 3);
  sprinkle(ctx, dark, TILE, TILE, 29, 5);
}

function drawBench(ctx: Ctx): void {
  px(ctx, PALETTE.metal, 2, 10, 2, 5);
  px(ctx, PALETTE.metal, 12, 10, 2, 5);
  px(ctx, PALETTE.wood, 0, 4, TILE, 2);
  px(ctx, PALETTE.wood, 0, 8, TILE, 3);
  px(ctx, PALETTE.woodLit, 0, 8, TILE, 1);
  px(ctx, PALETTE.woodDark, 0, 10, TILE, 1);
}

/**
 * Farola fernandina: hierro verde casi negro, basa moldurada, anillos en el
 * fuste y farol de cuatro caras. De día el cristal está apagado; la luz la
 * enciende world/Lighting al anochecer.
 */
function drawLamp(ctx: Ctx): void {
  const iron = PALETTE.iron;
  const lit = shade(iron, 0.12);
  px(ctx, iron, 7, 10, 2, 18);
  px(ctx, lit, 7, 10, 1, 18);
  px(ctx, iron, 6, 14, 4, 1);
  px(ctx, iron, 6, 21, 4, 1);
  px(ctx, iron, 6, 26, 4, 2);
  px(ctx, iron, 5, 28, 6, 4);
  px(ctx, lit, 5, 28, 6, 1);
  px(ctx, lit, 5, 29, 1, 3);
  // Farol: sombrerete, cristal y copa.
  px(ctx, iron, 7, 0, 2, 1);
  px(ctx, iron, 6, 1, 4, 1);
  px(ctx, iron, 5, 2, 6, 1);
  px(ctx, iron, 5, 3, 1, 5);
  px(ctx, iron, 10, 3, 1, 5);
  px(ctx, '#dcd2b0', 6, 3, 4, 5);
  px(ctx, '#efe7c9', 6, 3, 2, 3);
  px(ctx, iron, 8, 3, 1, 5);
  px(ctx, iron, 5, 8, 6, 1);
  px(ctx, iron, 6, 9, 4, 1);
}

function drawSign(ctx: Ctx): void {
  px(ctx, PALETTE.metal, 7, 16, 2, 16);
  px(ctx, PALETTE.metalLit, 7, 16, 1, 16);
  px(ctx, PALETTE.ink, 2, 5, 12, 11);
  px(ctx, PALETTE.stone, 3, 6, 10, 9);
  px(ctx, PALETTE.stoneLit, 3, 6, 10, 1);
  px(ctx, PALETTE.amberDim, 4, 8, 8, 1);
  px(ctx, PALETTE.amberDim, 4, 10, 6, 1);
  px(ctx, PALETTE.amberDim, 4, 12, 7, 1);
}

function drawPlanter(ctx: Ctx): void {
  px(ctx, PALETTE.stone, 3, 8, 10, 8);
  px(ctx, PALETTE.stoneLit, 3, 8, 10, 1);
  px(ctx, shade(PALETTE.stone, -0.08), 3, 15, 10, 1);
  px(ctx, shade(PALETTE.leaf, -0.07), 4, 3, 8, 6);
  px(ctx, PALETTE.leaf, 5, 4, 6, 4);
  px(ctx, PALETTE.leafLit, 6, 4, 2, 2);
}

function drawBed(ctx: Ctx): void {
  px(ctx, PALETTE.woodDark, 2, 4, 12, 28);
  px(ctx, PALETTE.wood, 3, 5, 10, 26);
  px(ctx, PALETTE.white, 4, 6, 8, 8);
  px(ctx, shade(PALETTE.white, -0.1), 4, 13, 8, 1);
  px(ctx, '#3f6f78', 3, 15, 10, 15);
  px(ctx, '#4d838d', 3, 15, 10, 2);
  px(ctx, shade('#3f6f78', -0.08), 3, 29, 10, 1);
}

function drawDesk(ctx: Ctx): void {
  px(ctx, PALETTE.ink, 4, 2, 8, 6);
  px(ctx, PALETTE.glass, 5, 3, 6, 4);
  px(ctx, PALETTE.glassLit, 5, 3, 6, 1);
  px(ctx, PALETTE.wood, 1, 8, 14, 4);
  px(ctx, PALETTE.woodLit, 1, 8, 14, 1);
  px(ctx, PALETTE.woodDark, 2, 12, 2, 4);
  px(ctx, PALETTE.woodDark, 12, 12, 2, 4);
}

function drawShelf(ctx: Ctx): void {
  px(ctx, PALETTE.woodDark, 2, 4, 12, 28);
  px(ctx, PALETTE.wood, 3, 5, 10, 26);
  const books = ['#7a4a52', '#4f8a7a', '#c08a4a', '#5c6fa8'];
  for (let i = 0; i < 3; i++) {
    const y = 7 + i * 8;
    px(ctx, PALETTE.woodDark, 3, y + 5, 10, 1);
    for (let b = 0; b < 4; b++) {
      px(ctx, books[(i + b) % books.length], 4 + b * 2, y, 2, 5);
    }
  }
}

function drawPlant(ctx: Ctx): void {
  const leaf = shade(PALETTE.leaf, -0.04);
  px(ctx, PALETTE.brick, 5, 11, 6, 5);
  px(ctx, PALETTE.brickLit, 5, 11, 6, 1);
  px(ctx, shade(leaf, -0.07), 4, 3, 8, 9);
  px(ctx, leaf, 5, 4, 6, 7);
  px(ctx, leaf, 3, 6, 10, 4);
  px(ctx, shade(PALETTE.leafLit, -0.04), 6, 5, 3, 2);
}

function drawTable(ctx: Ctx): void {
  px(ctx, PALETTE.woodDark, 4, 3, 8, 11);
  px(ctx, PALETTE.woodDark, 2, 5, 12, 7);
  px(ctx, PALETTE.wood, 4, 4, 8, 9);
  px(ctx, PALETTE.wood, 3, 6, 10, 5);
  px(ctx, PALETTE.woodLit, 5, 5, 4, 2);
}

function drawCounter(ctx: Ctx): void {
  px(ctx, PALETTE.stone, 0, 6, TILE, 10);
  px(ctx, PALETTE.wood, 0, 4, TILE, 3);
  px(ctx, PALETTE.woodLit, 0, 4, TILE, 1);
  px(ctx, shade(PALETTE.stone, -0.08), 0, 10, TILE, 1);
  px(ctx, shade(PALETTE.stone, -0.08), 8, 11, 1, 5);
}

/** Torniquete: cuerpo metálico a la altura de la cadera y piloto de validación. */
function drawTurnstile(ctx: Ctx): void {
  px(ctx, PALETTE.metal, 3, 5, 10, 10);
  px(ctx, PALETTE.metalLit, 3, 5, 10, 2);
  px(ctx, shade(PALETTE.metal, -0.12), 3, 14, 10, 1);
  px(ctx, PALETTE.ink, 5, 8, 6, 3);
  px(ctx, PALETTE.glassLit, 6, 9, 2, 1);
  px(ctx, PALETTE.metalLit, 0, 9, 3, 1);
  px(ctx, PALETTE.metalLit, 13, 9, 3, 1);
}

// ------------------------------------------------------------------- tren

export const CAR_W = TILE * 6;
export const CAR_H = TILE * 3;
/** Centro de cada puerta dentro de un coche. */
export const DOOR_CENTERS = [24, 72] as const;
export const DOOR_LEAF_W = 6;
export const DOOR_TOP = 17;
export const DOOR_H = 28;

const TRAIN_BODY = shade(PALETTE.metalLit, 0.12);

/**
 * Coche visto en 3/4 como las fachadas: techo arriba y costado hacia el andén.
 * Los huecos de puerta son negros; las hojas son sprites aparte que se deslizan.
 */
function drawCar(ctx: Ctx, cab: boolean): void {
  px(ctx, PALETTE.metal, 0, 1, CAR_W, 13);
  px(ctx, PALETTE.metalLit, 0, 1, CAR_W, 1);
  px(ctx, shade(PALETTE.metal, -0.06), 0, 7, CAR_W, 1);
  for (let x = 10; x < CAR_W - 8; x += 22) px(ctx, shade(PALETTE.metal, -0.1), x, 3, 8, 3);
  px(ctx, shade(PALETTE.metal, -0.18), 0, 14, CAR_W, 1);

  px(ctx, TRAIN_BODY, 0, 15, CAR_W, 31);
  px(ctx, shade(TRAIN_BODY, 0.06), 0, 15, CAR_W, 1);
  px(ctx, PALETTE.glassLit, 0, 38, CAR_W, 2);
  px(ctx, shade(PALETTE.glassLit, -0.25), 0, 40, CAR_W, 1);

  const windows: [number, number][] = [
    [4, 12],
    [34, 28],
    [82, 10],
  ];
  for (const [x, w] of windows) {
    px(ctx, PALETTE.glass, x, 19, w, 11);
    px(ctx, shade(PALETTE.glass, 0.1), x, 19, w, 1);
    px(ctx, shade(PALETTE.glassLit, -0.35), x + 2, 21, 2, 6);
  }

  for (const cx of DOOR_CENTERS) {
    px(ctx, PALETTE.ink, cx - DOOR_LEAF_W, DOOR_TOP, DOOR_LEAF_W * 2, DOOR_H);
    px(ctx, shade(PALETTE.amberDim, -0.2), cx - DOOR_LEAF_W, DOOR_TOP + DOOR_H - 2, DOOR_LEAF_W * 2, 1);
  }

  if (cab) {
    px(ctx, shade(PALETTE.metal, -0.2), 0, 1, 5, 13);
    px(ctx, PALETTE.glass, 0, 17, 3, 14);
    px(ctx, PALETTE.amber, 0, 41, 2, 2);
  } else {
    px(ctx, PALETTE.ink, 0, 15, 1, 31);
  }

  px(ctx, PALETTE.ink, 0, 46, CAR_W, 2);
  sprinkle(ctx, shade(TRAIN_BODY, -0.05), CAR_W, 12, 311, 16);
}

function drawDoorLeaf(ctx: Ctx): void {
  px(ctx, shade(TRAIN_BODY, -0.04), 0, 0, DOOR_LEAF_W, DOOR_H);
  px(ctx, PALETTE.glass, 1, 3, DOOR_LEAF_W - 2, 10);
  px(ctx, PALETTE.glassLit, 0, 21, DOOR_LEAF_W, 2);
  px(ctx, shade(TRAIN_BODY, -0.15), 0, 0, 1, DOOR_H);
}

function drawDoorLight(ctx: Ctx): void {
  px(ctx, PALETTE.amber, 0, 0, 6, 2);
  px(ctx, shade(PALETTE.amber, 0.2), 1, 0, 4, 1);
}

// ------------------------------------------------------------- personajes

/** Sombra de contacto bajo los pies: núcleo más oscuro y borde suave, en dos tonos (ART_BIBLE §5). */
function drawShadow(ctx: Ctx): void {
  ctx.globalAlpha = 0.2;
  px(ctx, PALETTE.ink, 2, 0, 10, 5);
  px(ctx, PALETTE.ink, 0, 1, 14, 3);
  ctx.globalAlpha = 0.22;
  px(ctx, PALETTE.ink, 3, 1, 8, 3);
  ctx.globalAlpha = 1;
}

function drawPrompt(ctx: Ctx): void {
  px(ctx, PALETTE.ink, 1, 1, 14, 14);
  px(ctx, PALETTE.night, 2, 2, 12, 11);
  px(ctx, shade(PALETTE.night, 0.06), 2, 2, 12, 1);
  px(ctx, PALETTE.amber, 5, 4, 2, 8);
  px(ctx, PALETTE.amber, 5, 4, 6, 2);
  px(ctx, PALETTE.amber, 5, 7, 4, 2);
  px(ctx, PALETTE.amber, 5, 10, 6, 2);
}

// ----------------------------------------------------------------- registro

/** El jugador de fábrica; lo que cambie (el peinado) va encima, desde GameState.appearance. */
export const PLAYER_COLORS: HumanColors = {
  cloth: '#c9743f',
  clothDark: '#9d5730',
  hair: PALETTE.hair,
  skin: PALETTE.skin,
  trousers: '#3c4152',
  shoes: '#23262f',
  hairStyle: 'short',
};

/** Clave de la textura de una pose del jugador. */
export const humanKey = (prefix: string, facing: Facing, pose: Pose): string => `${prefix}-${facing}-${pose}`;

/**
 * Vuelve a pintar a alguien que persiste con su aspecto de hoy: el jugador
 * ('player') en sus texturas, o un personaje con nombre en su fila del atlas de
 * gente. Se pinta encima de lo que había, así que sus animaciones siguen
 * valiendo. La gente anónima no persiste y no se repinta nunca.
 */
export function repaintPerson(scene: Phaser.Scene, id: string, changes: Appearance): void {
  if (id === 'player') {
    const colors = withAppearance(PLAYER_COLORS, changes);
    for (const facing of FACINGS) {
      for (const pose of POSES) {
        const tex = scene.textures.get(humanKey('player', facing, pose)) as Phaser.Textures.CanvasTexture;
        const ctx = tex.getContext();
        ctx.clearRect(0, 0, PLAYER_W, PLAYER_H);
        drawHuman(ctx, facing, pose, colors);
        tex.refresh();
      }
    }
    return;
  }
  const look = NPC_DEFS.find((n) => n.id === id);
  if (!look || !scene.textures.exists(PEOPLE)) return;
  const atlas = scene.textures.get(PEOPLE) as Phaser.Textures.CanvasTexture;
  const ctx = atlas.getContext();
  const cell = document.createElement('canvas');
  cell.width = PLAYER_W;
  cell.height = PLAYER_H;
  const c = cell.getContext('2d', { willReadFrequently: true });
  if (!c) return;
  const colors = withAppearance(colorsOf(look), changes);
  for (const facing of FACINGS) {
    for (const pose of POSES) {
      const frame = atlas.get(personFrame(id, facing, pose));
      c.clearRect(0, 0, PLAYER_W, PLAYER_H);
      drawHuman(c, facing, pose, colors);
      ctx.clearRect(frame.cutX, frame.cutY, PLAYER_W, PLAYER_H);
      ctx.drawImage(cell, frame.cutX, frame.cutY);
    }
  }
  atlas.refresh();
}

/**
 * Toda la gente que no es el jugador (personajes, uniformes, anónimos) vive en
 * una sola textura: la calle llena se pinta sin cambiar de textura entre una
 * persona y otra. Una fila por aspecto, una celda por dirección y pose.
 */
export const PEOPLE = 'people';
export const personFrame = (id: string, facing: Facing, pose: Pose = 0): string => `${id}-${facing}-${pose}`;

function buildPeople(scene: Phaser.Scene): void {
  if (scene.textures.exists(PEOPLE)) return;
  // Con las versiones de abrigo, verano y capucha de cada cara (world/WeatherLooks): se hornean una vez.
  const looks = [...NPC_DEFS, ...PASSENGER_LOOKS, ...UNIFORM_LOOKS, ...WEATHER_LOOKS];
  const atlas = scene.textures.createCanvas(PEOPLE, FACINGS.length * POSES.length * PLAYER_W, looks.length * PLAYER_H);
  if (!atlas) return;
  const ctx = atlas.getContext();
  ctx.imageSmoothingEnabled = false;
  // Cada pose se dibuja sola en un lienzo suelto: el contorno de una no invade la celda de al lado.
  const cell = document.createElement('canvas');
  cell.width = PLAYER_W;
  cell.height = PLAYER_H;
  const c = cell.getContext('2d', { willReadFrequently: true });
  if (!c) return;
  looks.forEach((look, row) => {
    const colors = colorsOf(look);
    FACINGS.forEach((facing, f) =>
      POSES.forEach((pose, i) => {
        c.clearRect(0, 0, PLAYER_W, PLAYER_H);
        drawHuman(c, facing, pose, colors);
        const x = (f * POSES.length + i) * PLAYER_W;
        const y = row * PLAYER_H;
        ctx.drawImage(cell, x, y);
        atlas.add(personFrame(look.id, facing, pose), 0, x, y, PLAYER_W, PLAYER_H);
      }),
    );
  });
  atlas.refresh();
}

export function buildTextures(scene: Phaser.Scene): void {
  const tile = (key: string, draw: (ctx: Ctx) => void): void => make(scene, key, TILE, TILE, draw);


  for (let v = 0; v < 2; v++) {
    tile(`tile-roof-a-${v}`, (ctx) => drawRoof(ctx, PALETTE.roofA, PALETTE.roofALit, v));
    tile(`tile-roof-b-${v}`, (ctx) => drawRoof(ctx, PALETTE.roofB, PALETTE.roofBLit, v));
    tile(`tile-wall-${v}`, (ctx) => drawWall(ctx, v));
    tile(`tile-rug-${v}`, (ctx) => drawRug(ctx, v));

    tile(`tile-facade-office-${v}`, (ctx) =>
      drawFacade(ctx, PALETTE.stone, PALETTE.stoneLit, PALETTE.glass, PALETTE.glassLit, v, {
        x: 3,
        y: 6,
        w: 10,
        h: 7,
      }),
    );
    tile(`tile-facade-school-${v}`, (ctx) =>
      drawFacade(
        ctx,
        shade(PALETTE.stone, 0.05),
        PALETTE.stoneLit,
        PALETTE.glass,
        PALETTE.glassLit,
        v,
        { x: 5, y: 5, w: 6, h: 9 },
      ),
    );
    tile(`tile-facade-home-${v}`, (ctx) =>
      drawFacade(ctx, PALETTE.brick, PALETTE.brickLit, shade(PALETTE.amber, -0.35), PALETTE.amber, v, {
        x: 5,
        y: 6,
        w: 6,
        h: 6,
      }),
    );
    tile(`tile-facade-cafe-${v}`, (ctx) => {
      drawFacade(ctx, PALETTE.wall, PALETTE.wallLit, shade(PALETTE.amber, -0.4), PALETTE.amber, v, {
        x: 4,
        y: 8,
        w: 8,
        h: 5,
      });
      for (let x = 0; x < TILE; x += 4) {
        px(ctx, PALETTE.amberDim, x, 0, 2, 4);
        px(ctx, PALETTE.white, x + 2, 0, 2, 4);
      }
      px(ctx, shade(PALETTE.amberDim, -0.2), 0, 4, TILE, 1);
    });
    tile(`tile-water-${v}`, (ctx) => drawWater(ctx, v));
    tile(`tile-quay-${v}`, (ctx) => drawQuay(ctx, v));
    tile(`tile-rail-${v}`, (ctx) => drawRail(ctx, v));
    tile(`tile-metro-${v}`, (ctx) => drawMetro(ctx, v));
  }

  tile('tile-platform-edge-0', drawPlatformEdge);
  tile('tile-door-0', drawDoor);

  make(scene, 'prop-bush', TILE, TILE, drawBush);
  make(scene, 'prop-bench', TILE, TILE, drawBench);
  make(scene, 'prop-lamp', TILE, TILE * 2, drawLamp);
  make(scene, 'prop-sign', TILE, TILE * 2, drawSign);
  make(scene, 'prop-planter', TILE, TILE, drawPlanter);
  make(scene, 'prop-bed', TILE, TILE * 2, drawBed);
  make(scene, 'prop-desk', TILE, TILE, drawDesk);
  make(scene, 'prop-shelf', TILE, TILE * 2, drawShelf);
  make(scene, 'prop-plant', TILE, TILE, drawPlant);
  make(scene, 'prop-table', TILE, TILE, drawTable);
  make(scene, 'prop-counter', TILE, TILE, drawCounter);
  make(scene, 'prop-stall', TILE, TILE * 2, drawStall);
  make(scene, 'prop-metro-sign', TILE * 3, TILE, drawMetroSign);
  make(scene, 'prop-line-map', TILE * 3, TILE, drawLineMap);
  make(scene, 'prop-poster', TILE, TILE * 2, drawPoster);
  make(scene, 'prop-parasol', TILE, TILE * 2, drawParasol);
  make(scene, 'prop-cafe-table', TILE, TILE, drawCafeTable);

  for (const facing of FACINGS) {
    for (const pose of POSES) {
      make(scene, humanKey('player', facing, pose), PLAYER_W, PLAYER_H, (ctx) => drawHuman(ctx, facing, pose, PLAYER_COLORS));
    }
  }

  make(scene, 'prop-turnstile', TILE, TILE, drawTurnstile);
  make(scene, 'train-car-cab', CAR_W, CAR_H, (ctx) => drawCar(ctx, true));
  make(scene, 'train-car', CAR_W, CAR_H, (ctx) => drawCar(ctx, false));
  make(scene, 'train-door-leaf', DOOR_LEAF_W, DOOR_H, drawDoorLeaf);
  make(scene, 'train-door-light', 6, 2, drawDoorLight);

  buildPeople(scene);

  // Charco de luz: anillos escalonados, sin degradado suave. Blanco: world/Lighting lo tiñe (farola cálida, tubo frío).
  make(scene, 'fx-light', 56, 56, (ctx) => {
    for (let y = 0; y < 56; y++) {
      for (let x = 0; x < 56; x++) {
        const d = Math.hypot(x - 27.5, y - 27.5);
        const a = d < 5 ? 0.4 : d < 11 ? 0.26 : d < 19 ? 0.13 : d < 27 ? 0.05 : 0;
        if (a === 0) continue;
        ctx.globalAlpha = a;
        px(ctx, '#ffffff', x, y);
      }
    }
    ctx.globalAlpha = 1;
  });

  // Sobre la mesa: una taza con su plato y un plato con comida.
  make(scene, 'fx-cup', 5, 5, (ctx) => {
    px(ctx, PALETTE.white, 0, 3, 5, 1);
    px(ctx, PALETTE.white, 1, 0, 3, 3);
    px(ctx, PALETTE.woodDark, 1, 0, 3, 1);
    px(ctx, PALETTE.white, 4, 1, 1, 1);
  });
  make(scene, 'fx-plate', 7, 4, (ctx) => {
    px(ctx, PALETTE.white, 0, 1, 7, 2);
    px(ctx, shade(PALETTE.white, -0.15), 1, 3, 5, 1);
    px(ctx, PALETTE.amber, 2, 1, 2, 1);
    px(ctx, PALETTE.leafLit, 4, 1, 1, 1);
    px(ctx, '#c0493f', 3, 0, 2, 1);
  });
  // Móvil: una pantalla que brilla en la mano. Charla: un bocadillo de tres puntos.
  make(scene, 'fx-phone', 3, 4, (ctx) => {
    px(ctx, PALETTE.ink, 0, 0, 3, 4);
    px(ctx, PALETTE.glassLit, 1, 1, 1, 2);
  });
  make(scene, 'fx-talk', 9, 7, (ctx) => {
    px(ctx, PALETTE.ink, 0, 0, 9, 5);
    px(ctx, PALETTE.white, 1, 1, 7, 3);
    px(ctx, PALETTE.ink, 2, 2, 1, 1);
    px(ctx, PALETTE.ink, 4, 2, 1, 1);
    px(ctx, PALETTE.ink, 6, 2, 1, 1);
    px(ctx, PALETTE.ink, 2, 5, 2, 1);
    px(ctx, PALETTE.ink, 2, 6, 1, 1);
  });
  // Un libro abierto: tapas de color y las dos páginas.
  make(scene, 'fx-book', 6, 4, (ctx) => {
    px(ctx, '#8e4a50', 0, 0, 6, 4);
    px(ctx, PALETTE.white, 0, 0, 3, 3);
    px(ctx, shade(PALETTE.white, -0.1), 3, 0, 3, 3);
    px(ctx, shade(PALETTE.white, -0.3), 1, 1, 1, 1);
    px(ctx, shade(PALETTE.white, -0.3), 4, 1, 1, 1);
  });
  make(scene, 'fx-shadow', 14, 5, drawShadow);
  make(scene, 'ui-prompt', TILE, TILE, drawPrompt);

  buildPropTextures(scene);
  buildUrbanTextures(scene);
  buildVegetationTextures(scene);
  buildStreetTextures(scene);
  buildBuildingTextures(scene);
  buildVehicleTextures(scene);
  buildWeatherTextures(scene);
}

/**
 * Paso en cuatro tiempos (pie, paso, pie, paso) y respiración en reposo: el
 * tronco baja un píxel cada par de segundos. Mismo ritmo para todos.
 */
function humanAnims(scene: Phaser.Scene, prefix: string, at: (facing: Facing, pose: Pose) => Phaser.Types.Animations.AnimationFrame): void {
  for (const facing of FACINGS) {
    const frame = (pose: Pose): Phaser.Types.Animations.AnimationFrame => at(facing, pose);
    if (!scene.anims.exists(`${prefix}-walk-${facing}`)) {
      scene.anims.create({ key: `${prefix}-walk-${facing}`, frames: [frame(1), frame(0), frame(2), frame(0)], frameRate: 8, repeat: -1 });
    }
    if (!scene.anims.exists(`${prefix}-idle-${facing}`)) {
      scene.anims.create({ key: `${prefix}-idle-${facing}`, frames: [{ ...frame(0), duration: 1100 }, frame(3)], frameRate: 2, repeat: -1 });
    }
  }
}

export function registerAnimations(scene: Phaser.Scene): void {
  humanAnims(scene, 'player', (facing, pose) => ({ key: humanKey('player', facing, pose) }));
  for (const npc of [...NPC_DEFS, ...PASSENGER_LOOKS, ...UNIFORM_LOOKS, ...WEATHER_LOOKS]) {
    humanAnims(scene, `npc-${npc.id}`, (facing, pose) => ({ key: PEOPLE, frame: personFrame(npc.id, facing, pose) }));
  }
}
