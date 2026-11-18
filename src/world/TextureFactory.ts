import Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import { FACINGS, type Facing, type NpcLook } from '../types/game';
import { NPC_DEFS, PASSENGER_LOOKS, UNIFORM_LOOKS } from '../data/npcs';
import { blob, drawWord, make, px, shade, sprinkle, wordWidth, type Ctx } from './paint';
import { LINES, STATION_SIGNS } from '../data/transit.ts';
import { POSTER_ADS, SUB_SIGNS, type PosterAd, type SubSign } from '../data/stationStyles.ts';
import { ARENA_CLUB } from '../data/cityEvents.ts';
import { drawWord as writeSign, wordWidth as signWidth } from './paint.ts';
import { TILES } from './tiles.ts';
import { buildBuildingTextures } from './BuildingArt';
import { buildBoxingTextures } from './BoxingArt';
import { buildDojangTextures } from './DojangArt';
import { buildPropTextures } from './PropArt';
import { buildUrbanTextures } from './UrbanArt';
import { buildVegetationTextures } from './Vegetation';
import { buildStreetTextures } from './StreetArt';
import { buildArenaTextures } from './ArenaArt';
import { buildVehicleTextures } from './VehicleArt';
import { buildUrbanFinishTextures } from './UrbanFinish';
import { buildWeatherTextures } from './WeatherView';
import { buildAtmosphereTextures } from './Atmosphere';
import { buildAmbientTextures } from './AmbientArt';
import { buildPopUpTextures } from './PopUpArt';
import { colorsOf, drawHuman, PLAYER_POSES, POSES, type HumanColors, type Pose } from './HumanArt';
import { drawPersonFine, setPremium } from './HumanArtHD';
import { HdCache, type HdBackend } from './HdCache';
import type { Appearance } from '../data/appearance';
import { withAppearance, withUniform } from '../systems/Appearance';
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

/**
 * Borde de andén (MET-01): canto de 1 px, franja amarilla de seguridad de 3 px y, tras 1 px de suelo, la banda táctil
 * oscura de botones; el resto, la baldosa del andén (world/Surfaces: metroFloor). Se pisa entero.
 */
function drawPlatformEdge(ctx: Ctx): void {
  const floor = shade(PALETTE.stoneLit, 0.04);
  px(ctx, floor, 0, 0, TILE, TILE);
  px(ctx, shade(PALETTE.stone, -0.25), 0, 0, TILE, 1);
  px(ctx, PALETTE.floorTape, 0, 1, TILE, 3);
  px(ctx, shade(PALETTE.floorTape, 0.08), 0, 1, TILE, 1);
  px(ctx, PALETTE.metal, 0, 5, TILE, 2);
  for (let x = 0; x < TILE; x += 2) px(ctx, shade(PALETTE.metal, 0.14), x + ((x >> 1) & 1), 5 + ((x >> 1) & 1), 1, 1);
  px(ctx, shade(floor, -0.06), 0, 7, TILE, 1);
  sprinkle(ctx, shade(floor, -0.04), TILE, 8, 63, 4);
}

/** Quiosco de metro: panel oscuro con el disco de la red. */
function drawMetro(ctx: Ctx, variant: number): void {
  px(ctx, PALETTE.night, 0, 0, TILE, TILE);
  px(ctx, shade(PALETTE.night, 0.08), 0, 0, TILE, 3);
  px(ctx, shade(PALETTE.night, -0.03), 0, 3, TILE, 1);
  px(ctx, shade(PALETTE.night, variant === 0 ? 0.04 : -0.02), 2, 6, 12, 8);
  sprinkle(ctx, shade(PALETTE.night, 0.05), TILE, TILE, 29 + variant, 5);
}


/** Ancho de la placa del andén, en px (PROPS['metro-sign'].tilesWide). */
const SIGN_W = TILE * 6;

/**
 * Texto de la placa que cabe: en mayúsculas; si no entra con 2 px entre letras, con 1; si aún no, las palabras de
 * delante se quedan en su inicial con punto («P. NORTE»). Nunca se corta.
 */
function signText(name: string): { text: string; gap: number } {
  const room = SIGN_W - 10;
  const full = name.toUpperCase();
  for (const gap of [2, 1]) if (wordWidth(full, gap) <= room) return { text: full, gap };
  const words = full.split(' ');
  return { text: [...words.slice(0, -1).map((w) => `${w[0]}.`), words[words.length - 1]].join(' '), gap: 1 };
}

/** Placa del andén (MET-01): del color de la línea (el de su cenefa) con el nombre de la parada en blanco. */
function drawMetroSign(ctx: Ctx, name: string, color: string): void {
  const w = SIGN_W;
  const { text, gap } = signText(name);
  px(ctx, shade(color, -0.18), 0, 2, w, 13);
  px(ctx, color, 1, 3, w - 2, 11);
  px(ctx, shade(color, 0.08), 1, 3, w - 2, 1);
  px(ctx, shade(color, -0.08), 1, 13, w - 2, 1);
  for (const x of [2, w - 4]) px(ctx, shade(PALETTE.metal, 0.1), x, 4, 2, 2);
  drawWord(ctx, text, Math.floor((w - wordWidth(text, gap)) / 2), 5, PALETTE.white, gap);
  ctx.globalAlpha = 0.3;
  px(ctx, PALETTE.ink, 1, 15, w - 1, 1);
  ctx.globalAlpha = 1;
}

/** Pilar del andén (MET-01): fuste alicatado, rodapié y cinta amarilla y negra a la altura de quien pasa. */
function drawMetroPillar(ctx: Ctx): void {
  const cream = PALETTE.metroCream;
  px(ctx, shade(cream, -0.16), 2, 0, 12, 46);
  px(ctx, cream, 3, 0, 9, 46);
  px(ctx, shade(cream, 0.04), 3, 0, 1, 46);
  px(ctx, shade(cream, -0.07), 10, 0, 2, 46);
  for (let y = 5; y < 26; y += 5) px(ctx, shade(cream, -0.06), 3, y, 9, 1);
  for (let y = 27; y < 34; y++) {
    for (let x = 2; x < 14; x++) px(ctx, ((x + y) >> 1) % 2 ? PALETTE.floorTape : PALETTE.ink, x, y);
  }
  px(ctx, PALETTE.wallTop, 2, 41, 12, 5);
  px(ctx, shade(PALETTE.wallTop, 0.08), 2, 41, 12, 1);
  px(ctx, shade(PALETTE.wallTop, -0.06), 2, 46, 12, 2);
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

/**
 * Cartel publicitario enmarcado (MET-03: uno por anuncio ficticio de data/stationStyles.ts, sin marcas ni texto real).
 * A este tamaño el texto es una mancha, y así se dibuja; manda la imagen. Panel útil: x 3–12, y 5–28.
 */
function drawPoster(ctx: Ctx, ad: PosterAd): void {
  px(ctx, PALETTE.ink, 2, 4, 12, 26);
  const [teal, orange] = ARENA_CLUB.home;
  const copy = (color: string): void => {
    px(ctx, color, 4, 23, 8, 1);
    px(ctx, shade(color, -0.25), 4, 25, 5, 1);
  };
  switch (ad) {
    case 'clasico': // El de siempre, sin tocar: el de las fachadas y oficinas.
      px(ctx, shade(PALETTE.stone, -0.12), 3, 5, 10, 24);
      px(ctx, PALETTE.rug, 4, 6, 8, 11);
      px(ctx, PALETTE.amber, 5, 8, 4, 4);
      px(ctx, PALETTE.white, 4, 19, 8, 1);
      px(ctx, PALETTE.white, 4, 21, 6, 1);
      px(ctx, shade(PALETTE.white, -0.3), 4, 23, 7, 1);
      px(ctx, PALETTE.glassLit, 4, 26, 5, 2);
      return;
    case 'zapatillas': // Zapatilla genérica sobre fondo claro, con su raya de movimiento.
      px(ctx, PALETTE.glassLit, 3, 5, 10, 24);
      px(ctx, shade(PALETTE.glassLit, -0.15), 3, 5, 10, 3);
      px(ctx, PALETTE.white, 5, 13, 5, 3);
      px(ctx, PALETTE.white, 4, 16, 8, 2);
      px(ctx, PALETTE.rug, 6, 14, 3, 1);
      px(ctx, PALETTE.ink, 4, 18, 8, 1);
      px(ctx, PALETTE.amber, 3, 10, 3, 1);
      copy(PALETTE.ink);
      break;
    case 'concierto': // Escenario de noche: dos focos y una silueta con micro.
      px(ctx, PALETTE.night, 3, 5, 10, 24);
      for (let i = 0; i < 6; i++) {
        px(ctx, shade(PALETTE.amber, -0.3), 4 + i, 6 + i * 2, 1, 2);
        px(ctx, shade(PALETTE.amber, -0.3), 11 - i, 6 + i * 2, 1, 2);
      }
      px(ctx, PALETTE.ink, 7, 14, 2, 2);
      px(ctx, PALETTE.ink, 6, 16, 4, 4);
      px(ctx, PALETTE.amber, 3, 20, 10, 1);
      copy(PALETTE.amber);
      break;
    case 'museo': // Fachada de templo: frontón y columnas en piedra.
      px(ctx, shade(PALETTE.stone, 0.15), 3, 5, 10, 24);
      px(ctx, shade(PALETTE.stone, -0.2), 5, 9, 6, 1);
      px(ctx, shade(PALETTE.stone, -0.2), 4, 10, 8, 1);
      for (const x of [4, 7, 10]) px(ctx, PALETTE.white, x, 11, 2, 7);
      px(ctx, shade(PALETTE.stone, -0.2), 4, 18, 8, 1);
      copy(PALETTE.ink);
      break;
    case 'refresco': // Botella sin marca sobre rojo, con burbujas.
      px(ctx, PALETTE.rug, 3, 5, 10, 24);
      px(ctx, PALETTE.white, 7, 7, 2, 3);
      px(ctx, PALETTE.white, 6, 10, 4, 10);
      px(ctx, PALETTE.amber, 6, 13, 4, 3);
      px(ctx, shade(PALETTE.rug, 0.25), 4, 8, 1, 1);
      px(ctx, shade(PALETTE.rug, 0.25), 11, 12, 1, 1);
      px(ctx, shade(PALETTE.rug, 0.25), 10, 7, 1, 1);
      copy(PALETTE.white);
      break;
    case 'ciudad': // Turismo: cielo, sol y perfil de tejados.
      px(ctx, PALETTE.glassLit, 3, 5, 10, 16);
      px(ctx, PALETTE.amber, 9, 7, 3, 3);
      px(ctx, PALETTE.roofA, 3, 15, 3, 6);
      px(ctx, PALETTE.brick, 6, 12, 3, 9);
      px(ctx, PALETTE.roofB, 9, 14, 4, 7);
      px(ctx, PALETTE.white, 3, 21, 10, 8);
      copy(PALETTE.metroBlue);
      break;
    case 'club': // CD Halcones: turquesa con franja naranja y el ala del halcón.
      px(ctx, teal, 3, 5, 10, 24);
      for (let i = 0; i < 10; i++) px(ctx, orange, 3 + i, 19 - i, 1, 3);
      px(ctx, PALETTE.white, 5, 9, 5, 1);
      px(ctx, PALETTE.white, 6, 10, 4, 1);
      px(ctx, PALETTE.white, 8, 11, 2, 1);
      copy(PALETTE.white);
      break;
    case 'club-escudo': // CD Halcones: escudo turquesa sobre naranja.
      px(ctx, orange, 3, 5, 10, 24);
      px(ctx, PALETTE.white, 4, 8, 8, 9);
      px(ctx, teal, 5, 9, 6, 7);
      px(ctx, PALETTE.white, 6, 17, 4, 1);
      px(ctx, teal, 7, 18, 2, 1);
      px(ctx, orange, 7, 11, 2, 3);
      copy(PALETTE.ink);
      break;
  }
  // Reflejo del cristal del marco.
  px(ctx, shade(PALETTE.white, -0.1), 11, 6, 1, 3);
}

/**
 * MET-03: rótulo secundario colgado del techo (data/stationStyles.ts: SUB_SIGNS). Panel del color de la línea a la que
 * lleva (neutro sin ella), letra blanca de la fuente de placas, centrado en sus seis tiles y con dos tirantes.
 */
function drawSubSign(ctx: Ctx, sign: SubSign, w: number): void {
  const wall = LINES.find((l) => l.id === sign.line)?.wall;
  const color = (wall && TILES[wall]?.trim) || PALETTE.night;
  const tw = signWidth(sign.text, 1);
  const pw = tw + 6;
  const x0 = Math.floor((w - pw) / 2);
  // El techo liso en todo el tramo del rótulo: el tubo (world/Surfaces.metroWall, filas 9–12 del tile) no queda
  // asomando a los lados ni tapado detrás; sólo pasa donde cuelga un rótulo.
  px(ctx, PALETTE.wallTop, 0, 9, w, 4);
  px(ctx, PALETTE.metal, x0 + 3, 0, 1, 4);
  px(ctx, PALETTE.metal, x0 + pw - 4, 0, 1, 4);
  px(ctx, shade(color, -0.3), x0, 4, pw, 11);
  px(ctx, color, x0 + 1, 4, pw - 2, 10);
  px(ctx, shade(color, 0.12), x0 + 1, 4, pw - 2, 1);
  writeSign(ctx, sign.text, x0 + 3, 6, PALETTE.white, 1);
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

export function drawBench(ctx: Ctx): void {
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
export function drawLamp(ctx: Ctx): void {
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

/**
 * Barra o mostrador: encimera de madera con el canto al sol y su grosor, la
 * sombra que echa el vuelo sobre el frente, frente de madera oscura en paneles
 * y zócalo en sombra. Se lee como un mueble con volumen, no como una franja
 * más del suelo.
 */
function drawCounter(ctx: Ctx): void {
  px(ctx, PALETTE.wood, 0, 3, TILE, 4);
  px(ctx, PALETTE.woodLit, 0, 3, TILE, 1);
  px(ctx, shade(PALETTE.wood, -0.14), 0, 6, TILE, 1);
  px(ctx, PALETTE.woodDark, 0, 7, TILE, 8);
  px(ctx, shade(PALETTE.woodDark, -0.28), 0, 7, TILE, 1);
  px(ctx, shade(PALETTE.woodDark, 0.1), 2, 9, 5, 4);
  px(ctx, shade(PALETTE.woodDark, 0.1), 9, 9, 5, 4);
  px(ctx, shade(PALETTE.woodDark, -0.32), 0, 15, TILE, 1);
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

/** MET-02: carrocería blanco roto (el gris claro de los muros interiores), franja azul oscuro con filete claro. */
const TRAIN_BODY = PALETTE.wallFace;
const TRAIN_STRIPE = shade(PALETTE.metroBlue, -0.3);
const TRAIN_NOSE = shade(PALETTE.metal, -0.18);
const TRAIN_RED = shade(PALETTE.brickLit, 0.15);
/** Filas del costado (coordenadas del coche): filete claro y franja azul de 4 px en la mitad baja. */
const STRIPE_TRIM = 36;
const STRIPE_TOP = 37;
const STRIPE_H = 4;

/**
 * Coche visto en 3/4 como las fachadas: techo arriba y costado hacia el andén.
 * Los huecos de puerta son negros con marco; las hojas son sprites aparte que se deslizan.
 * `cab`: morro oscuro a la izquierda (la cola se espeja). `panel`: texto ámbar del panel de destino
 * (la línea) y faro encendido; sin él es la cola: panel apagado (nunca texto al revés al espejarla), faro
 * apagado y pilotos rojos.
 */
function drawCar(ctx: Ctx, cab: boolean, panel = ''): void {
  // Techo: gris con luz arriba, rejillas de ventilación y sombra sobre el costado.
  px(ctx, PALETTE.metal, 0, 1, CAR_W, 13);
  px(ctx, PALETTE.metalLit, 0, 1, CAR_W, 1);
  px(ctx, shade(PALETTE.metal, 0.06), 0, 2, CAR_W, 3);
  for (let x = 16; x < CAR_W - 12; x += 26) {
    px(ctx, PALETTE.metalLit, x, 4, 14, 1);
    px(ctx, shade(PALETTE.metal, -0.2), x, 5, 14, 5);
    for (let y = 6; y < 10; y += 2) px(ctx, shade(PALETTE.metal, -0.38), x + 1, y, 12, 1);
  }
  px(ctx, shade(PALETTE.metal, -0.14), 0, 12, CAR_W, 1);
  px(ctx, shade(PALETTE.metal, -0.3), 0, 13, CAR_W, 2);

  // Costado por bandas: luz alta, cuerpo, filete, franja y faldón en sombra.
  px(ctx, TRAIN_BODY, 0, 15, CAR_W, 31);
  px(ctx, shade(TRAIN_BODY, 0.06), 0, 15, CAR_W, 2);
  px(ctx, shade(TRAIN_BODY, -0.06), 0, 32, CAR_W, 4);
  px(ctx, PALETTE.white, 0, STRIPE_TRIM, CAR_W, 1);
  px(ctx, TRAIN_STRIPE, 0, STRIPE_TOP, CAR_W, STRIPE_H);
  px(ctx, shade(TRAIN_BODY, -0.12), 0, 41, CAR_W, 5);
  px(ctx, shade(TRAIN_BODY, -0.24), 0, 45, CAR_W, 1);

  // Ventanas oscuras corridas entre puertas, con marco y un reflejo diagonal de 1 px.
  // En la cabina, el tramo entre el morro y la primera puerta queda en carrocería (una ventana de 3 px no se lee).
  const windows: [number, number][] = [...(cab ? [] : [[4, 11] as [number, number]]), [33, 30], [81, 11]];
  for (const [x, w] of windows) {
    px(ctx, shade(TRAIN_BODY, -0.22), x - 1, 18, w + 2, 14);
    px(ctx, PALETTE.night, x, 19, w, 12);
    px(ctx, PALETTE.ink, x, 19, w, 1);
    for (const start of [x + 2, x + Math.round(w * 0.6)]) {
      for (let i = 0; i < 9; i++) {
        const sx = start + i;
        if (sx < x + w) px(ctx, PALETTE.glass, sx, 29 - i, 1, 1);
      }
    }
  }

  if (cab) {
    // Morro de 10 px: techo y frontal más oscuros, canto de luz en la junta con el costado.
    px(ctx, shade(TRAIN_NOSE, 0.1), 0, 1, 10, 13);
    px(ctx, TRAIN_NOSE, 0, 15, 10, 31);
    px(ctx, shade(TRAIN_NOSE, 0.18), 9, 15, 1, 31);
    // Parabrisas inclinado: el borde delantero retrocede hacia arriba.
    for (let r = 0; r < 15; r++) {
      const xs = 1 + Math.floor((14 - r) / 4);
      px(ctx, PALETTE.night, xs, 17 + r, 9 - xs, 1);
      px(ctx, PALETTE.ink, xs, 17 + r, 1, 1);
    }
    for (let i = 0; i < 6; i++) px(ctx, shade(PALETTE.glassLit, -0.2), 6 - i, 19 + i, 2, 1);
    // La franja da la vuelta al morro, más oscura.
    px(ctx, shade(TRAIN_STRIPE, -0.15), 0, STRIPE_TOP, 9, STRIPE_H);
    if (panel) {
      // Cabeza: faro bajo blanco-ámbar y piloto rojo, 2×2 cada uno.
      px(ctx, PALETTE.white, 1, 42, 2, 1);
      px(ctx, PALETTE.amber, 1, 43, 2, 1);
      px(ctx, TRAIN_RED, 5, 42, 2, 2);
    } else {
      // Cola (sin panel, se espeja): faro apagado y dos pilotos rojos de 2×2.
      px(ctx, shade(PALETTE.amberDim, -0.35), 1, 42, 2, 2);
      px(ctx, TRAIN_RED, 5, 42, 2, 2);
      px(ctx, TRAIN_RED, 1, 33, 2, 2);
    }
    // Panel de destino sobre el parabrisas: marco oscuro y la línea en ámbar.
    px(ctx, PALETTE.ink, 0, 3, 15, 11);
    px(ctx, shade(PALETTE.ink, 0.12), 1, 4, 13, 9);
    if (panel) drawWord(ctx, panel, 2, 5, PALETTE.amber, 1);
  } else {
    // Fuelle: junta oscura de 2 px en cada extremo del coche intermedio.
    px(ctx, PALETTE.ink, 0, 13, 2, 33);
    px(ctx, PALETTE.ink, CAR_W - 2, 13, 2, 33);
  }

  // Huecos de puerta con marco y umbral.
  for (const cx of DOOR_CENTERS) {
    px(ctx, shade(TRAIN_BODY, -0.3), cx - DOOR_LEAF_W - 1, DOOR_TOP - 1, DOOR_LEAF_W * 2 + 2, DOOR_H + 1);
    // Interior tenue tras las hojas: fondo gris oscuro, suelo y una barra vertical clara.
    px(ctx, shade(PALETTE.night, 0.18), cx - DOOR_LEAF_W, DOOR_TOP, DOOR_LEAF_W * 2, DOOR_H);
    px(ctx, shade(PALETTE.metal, -0.35), cx - DOOR_LEAF_W, DOOR_TOP + DOOR_H - 5, DOOR_LEAF_W * 2, 3);
    px(ctx, shade(PALETTE.metalLit, -0.1), cx - 3, DOOR_TOP + 1, 1, DOOR_H - 6);
    px(ctx, shade(PALETTE.amberDim, -0.2), cx - DOOR_LEAF_W, DOOR_TOP + DOOR_H - 2, DOOR_LEAF_W * 2, 1);
  }

  px(ctx, PALETTE.ink, 0, 46, CAR_W, 2);
}

/** Hoja de puerta: clara, ventanilla oscura con marco y la franja a la altura de la del coche. */
function drawDoorLeaf(ctx: Ctx): void {
  px(ctx, shade(TRAIN_BODY, 0.03), 0, 0, DOOR_LEAF_W, DOOR_H);
  px(ctx, shade(TRAIN_BODY, -0.12), 0, DOOR_H - 4, DOOR_LEAF_W, 4);
  px(ctx, shade(TRAIN_BODY, -0.22), 1, 2, DOOR_LEAF_W - 2, 12);
  px(ctx, PALETTE.night, 2, 3, DOOR_LEAF_W - 3, 10);
  px(ctx, PALETTE.glass, 3, 4, 1, 3);
  px(ctx, PALETTE.white, 0, STRIPE_TRIM - DOOR_TOP, DOOR_LEAF_W, 1);
  px(ctx, TRAIN_STRIPE, 0, STRIPE_TOP - DOOR_TOP, DOOR_LEAF_W, STRIPE_H);
  px(ctx, shade(TRAIN_BODY, -0.3), 0, 0, 1, DOOR_H);
  px(ctx, shade(TRAIN_BODY, -0.18), DOOR_LEAF_W - 1, 0, 1, DOOR_H);
}

function drawDoorLight(ctx: Ctx): void {
  px(ctx, shade(PALETTE.amber, -0.1), 0, 0, 6, 2);
  px(ctx, shade(PALETTE.amber, 0.25), 1, 0, 4, 1);
  px(ctx, PALETTE.white, 2, 0, 2, 1);
}

// ------------------------------------------------------------- personajes

/**
 * Sombra de contacto bajo los pies (ART_BIBLE §5): tres anillos escalonados,
 * el núcleo oscuro justo donde apoyan los pies (la oclusión) y un borde que se
 * funde con el suelo. La persona pisa, no flota.
 */
function drawShadow(ctx: Ctx): void {
  const w = 18;
  const h = 6;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2));
      // HD-03: el núcleo, un píxel al sureste (la luz del mundo viene del noroeste); la penumbra, centrada.
      const core = Math.hypot((x - 0.5 - w / 2) / (w / 2), (y - 0.5 - h / 2) / (h / 2));
      // Núcleo denso de oclusión bajo los pies y penumbra que se abre: la de antes ni se veía a zoom de juego.
      const a = core < 0.5 ? 0.58 : d < 0.75 ? 0.36 : d < 1 ? 0.15 : 0;
      if (a === 0) continue;
      ctx.globalAlpha = a;
      px(ctx, PALETTE.ink, x, y);
    }
  }
  ctx.globalAlpha = 1;
}

/** Sombra de farola (world/LampShadows): nace en los pies (izquierda) y se deshace hacia la punta. */
function drawLongShadow(ctx: Ctx): void {
  const w = 20;
  const h = 5;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const across = Math.abs(y + 0.5 - h / 2) / (h / 2);
      if (across > 1 - (x / w) * 0.4) continue;
      ctx.globalAlpha = 0.5 * (1 - x / w) * (across < 0.5 ? 1 : 0.55);
      px(ctx, PALETTE.ink, x, y);
    }
  }
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
  // Sudadera con capucha, vaquero recto y zapatillas (world/Garments); lo que compre cambia cada prenda.
  outfit: { top: 'hoodie', bottom: 'jeans', shoes: 'sneaker' },
};

/** Clave de la textura de una pose del jugador. */
export const humanKey = (prefix: string, facing: Facing, pose: Pose): string => `${prefix}-${facing}-${pose}`;

/**
 * Vuelve a pintar a alguien que persiste con su aspecto de hoy: el jugador
 * ('player') en sus texturas, o un personaje con nombre en su fila del atlas de
 * gente. Se pinta encima de lo que había, así que sus animaciones siguen
 * valiendo. La gente anónima no persiste y no se repinta nunca.
 *
 * El jugador lleva además su complexión (systems/Fitness.buildOf): la misma
 * deformación que la gente (world/HumanArt.reshape), debajo de la ropa.
 */
let playerBuild: HumanColors['build'];
/**
 * El uniforme de trabajo puesto encima de lo de siempre (systems/Jobs.onShift): sólo la ropa del uniforme; el pelo,
 * la piel y la complexión siguen siendo los del jugador. No es apariencia guardada: se quita y vuelve lo de antes.
 */
let playerUniform: NpcLook | null = null;

export function setPlayerUniform(scene: Phaser.Scene, look: NpcLook | null, changes: Appearance): void {
  if ((playerUniform?.id ?? null) === (look?.id ?? null)) return;
  playerUniform = look;
  repaintPerson(scene, 'player', changes);
}

export const playerUniformId = (): string | null => playerUniform?.id ?? null;
export function repaintPerson(scene: Phaser.Scene, id: string, changes: Appearance, build: HumanColors['build'] = playerBuild): void {
  if (id === 'player') {
    playerBuild = build;
    const colors = withUniform({
      ...withAppearance(PLAYER_COLORS, changes),
      build,
    }, playerUniform);
    for (const facing of FACINGS) {
      for (const pose of PLAYER_POSES) {
        const tex = scene.textures.get(humanKey('player', facing, pose)) as Phaser.Textures.CanvasTexture;
        const ctx = tex.getContext();
        drawPersonFine(ctx, facing, pose, colors);
        tex.refresh();
      }
    }
    return;
  }
  const look = NPC_DEFS.find((n) => n.id === id);
  // Con el acabado: se hornea (o se repinta ya, si tiene textura) con la apariencia de hoy.
  if (FINE_LOOKS.has(id)) {
    fineAppearance.set(id, changes);
    fineCache.repaint(id);
  }
  const page = PAGE_OF.get(id) ?? PEOPLE;
  if (!look || !scene.textures.exists(page)) return;
  const atlas = scene.textures.get(page) as Phaser.Textures.CanvasTexture;
  repaintRow(atlas, id, withAppearance(colorsOf(look), changes));
  atlas.refresh();
}

/** Las poses de alguien en su fila del atlas de gente (el dibujo simple, la reserva), otra vez. */
function repaintRow(atlas: Phaser.Textures.CanvasTexture, id: string, colors: HumanColors): void {
  const ctx = atlas.getContext();
  const c = personCell();
  for (const facing of FACINGS) {
    for (const pose of POSES) {
      const frame = atlas.get(personFrame(id, facing, pose));
      c.clearRect(0, 0, PLAYER_W, PLAYER_H);
      drawHuman(c, facing, pose, colors);
      ctx.clearRect(frame.cutX, frame.cutY, PLAYER_W, PLAYER_H);
      ctx.drawImage(c.canvas, frame.cutX, frame.cutY);
    }
  }
}

/** Cada pose se dibuja sola en un lienzo suelto de 16 × 24: el contorno de una no invade la celda de al lado. */
let cell: CanvasRenderingContext2D | null = null;
function personCell(): CanvasRenderingContext2D {
  if (!cell) {
    const canvas = document.createElement('canvas');
    canvas.width = PLAYER_W;
    canvas.height = PLAYER_H;
    cell = canvas.getContext('2d', { willReadFrequently: true });
    if (!cell) throw new Error('Sin canvas 2D');
  }
  return cell;
}

/**
 * Toda la gente que no es el jugador (personajes, uniformes, anónimos) vive en
 * una sola textura: la calle llena se pinta sin cambiar de textura entre una
 * persona y otra. Una fila por aspecto, una celda por dirección y pose.
 */
export const PEOPLE = 'people';
/** Lado máximo del atlas de gente, en px. */
const ATLAS_MAX = 4096;
export const personFrame = (id: string, facing: Facing, pose: Pose = 0): string => `${id}-${facing}-${pose}`;

/** El primero con ropa de verdad que sale a la calle (lo usan lifesim.scaleCompare y lifesim.lineup). */
export const HD_PERSON = PASSENGER_LOOKS.find((l) => l.outfit)?.id;

/**
 * HD-03, escala coherente: toda la gente (personajes con nombre, uniformes, anónimos y sus versiones de abrigo,
 * verano, capucha y gimnasio) a 16 × 24 y escala 1, la misma densidad de píxel que el mundo y que el jugador, con el
 * acabado de world/HumanArtHD.drawPersonFine (y la ropa de verdad, world/Garments, quien lleva `outfit`). Antes, quien
 * llevaba ropa iba a 28 × 42 a escala 16/28, nítido a ningún zoom entero.
 *
 * Hornear todo al arrancar son unas 51 000 celdas (unos 10 s): el atlas de siempre (PEOPLE) se pinta con el dibujo
 * simple, rápido, y el acabado de cada aspecto se hace cuando alguien va a salir en escena (world/HdCache: entities/
 * Character, Walker y NPC lo retienen con showPerson mientras se ven), en una textura suya de una fila. Mientras se
 * hornea, esa persona se ve con el dibujo simple: misma talla, mismo sitio, mismas poses. Ni rutinas, ni diálogos, ni
 * el cuerpo de colisión cambian.
 */
const FINE_LOOKS: ReadonlyMap<string, NpcLook> = new Map(
  [...NPC_DEFS, ...PASSENGER_LOOKS, ...UNIFORM_LOOKS, ...WEATHER_LOOKS].map((l) => [l.id, l]),
);
const fineKey = (id: string): string => `person-fine:${id}`;
const FINE_ROW_W = FACINGS.length * POSES.length * PLAYER_W;
/** Lo que se guarda, como mucho, de lo que ya nadie muestra (unos 130 aspectos). Lo que se ve no se tira nunca. */
export const FINE_CACHE_MB = 24;
/** La apariencia de hoy de quien persiste (repaintPerson): se hornea con ella. */
const fineAppearance = new Map<string, Appearance>();
/** Texturas y animaciones son del juego, no de una escena: sobreviven a los cambios de escena. */
let fineGame: Phaser.Game | null = null;

const fineBackend: HdBackend = {
  create(id) {
    const atlas = fineGame!.textures.createCanvas(fineKey(id), FINE_ROW_W, PLAYER_H)!;
    FACINGS.forEach((facing, f) => POSES.forEach((pose, i) => atlas.add(personFrame(id, facing, pose), 0, (f * POSES.length + i) * PLAYER_W, 0, PLAYER_W, PLAYER_H)));
  },
  paint(id, cell) {
    const look = FINE_LOOKS.get(id)!;
    const changes = fineAppearance.get(id);
    const c = personCell();
    drawPersonFine(c, FACINGS[Math.floor(cell / POSES.length)], POSES[cell % POSES.length], changes ? withAppearance(colorsOf(look), changes) : colorsOf(look));
    const ctx = (fineGame!.textures.get(fineKey(id)) as Phaser.Textures.CanvasTexture).getContext();
    ctx.clearRect(cell * PLAYER_W, 0, PLAYER_W, PLAYER_H);
    ctx.drawImage(c.canvas, cell * PLAYER_W, 0);
  },
  done(id) {
    (fineGame!.textures.get(fineKey(id)) as Phaser.Textures.CanvasTexture).refresh();
    personAnims(fineGame!.anims, id);
  },
  drop(id) {
    // Primero sus animaciones vuelven al atlas de siempre; luego se borra la textura (nadie la muestra: world/HdCache).
    personAnims(fineGame!.anims, id);
    fineGame!.textures.remove(fineKey(id));
  },
};
export const fineCache = new HdCache(fineBackend, FACINGS.length * POSES.length, FINE_ROW_W * PLAYER_H * 4, FINE_CACHE_MB * 2 ** 20);

/** La textura de alguien ahora: la suya con el acabado, si ya está, o su página del atlas de siempre. */
/**
 * Una patada de alguien de la gente (world/HumanArt 38–45; no está en el atlas común): su propia textura, horneada la
 * primera vez que se usa (los del dojang, en su puesto) y guardada. La cara sale del mismo catálogo que el atlas.
 */
export function kickTexture(scene: Phaser.Scene, id: string, facing: Facing, pose: Pose): string {
  const key = `kick-${id}-${facing}-${pose}`;
  if (scene.textures.exists(key)) return key;
  const look = [...NPC_DEFS, ...PASSENGER_LOOKS, ...UNIFORM_LOOKS, ...WEATHER_LOOKS].find((l) => l.id === id);
  if (!look) return personTexture(id);
  make(scene, key, PLAYER_W, PLAYER_H, (ctx) => drawHuman(ctx, facing, pose, colorsOf(look)));
  return key;
}

export const personTexture = (id: string): string => (fineCache.ready(id) ? fineKey(id) : (PAGE_OF.get(id) ?? PEOPLE));
/** Siempre 1: un píxel de arte es uno de mundo (la firma se queda para entities/*). */
export const personScale = (_id: string): number => 1;
/** En qué página del atlas de gente está cada aspecto (buildPeople). */
const PAGE_OF = new Map<string, string>();

/**
 * Un sprite deja de mostrar a `prev` y pasa a mostrar a `next` (null: se esconde). Devuelve `next` para guardarlo:
 * `this.shown = showPerson(this.shown, id)`.
 */
export function showPerson(prev: string | null, next: string | null): string | null {
  if (prev === next) return next;
  if (next && FINE_LOOKS.has(next)) fineCache.acquire(next);
  if (prev && FINE_LOOKS.has(prev)) fineCache.release(prev);
  return next;
}

/** Hornea un poco de lo pendiente (scenes/WorldScene, cada frame). */
export const pumpPeopleFine = (budgetMs: number): number => (fineGame ? fineCache.pump(budgetMs) : 0);

/** Desarrollo (lifesim.lineup, lifesim.hdCompare): lo deja hecho ya, retenido hasta recargar. */
export function preparePerson(id: string): void {
  if (!FINE_LOOKS.has(id) || !fineGame) return;
  fineCache.acquire(id);
  fineCache.finish(id);
}

/**
 * Alpha-06: alguien conectado desde otro navegador (world/RemotePlayers), pintado como el jugador con su aspecto
 * (ids de catálogo ya validados) en sus propias texturas `${key}-…` y con las mismas animaciones. Repintar (cambia
 * de ropa al volver) limpia antes; dropRemote lo quita todo al irse de la sala.
 */
export function paintRemote(scene: Phaser.Scene, key: string, look: Appearance): void {
  const colors = withAppearance(PLAYER_COLORS, look);
  for (const facing of FACINGS) {
    for (const pose of POSES) {
      const id = humanKey(key, facing, pose);
      const tex = (scene.textures.exists(id) ? scene.textures.get(id) : scene.textures.createCanvas(id, PLAYER_W, PLAYER_H)) as Phaser.Textures.CanvasTexture | null;
      if (!tex) continue;
      const ctx = tex.getContext();
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, PLAYER_W, PLAYER_H);
      drawPersonFine(ctx, facing, pose, colors);
      tex.refresh();
    }
  }
  humanAnims(scene.anims, key, (facing, pose) => ({ key: humanKey(key, facing, pose) }));
}

export function dropRemote(scene: Phaser.Scene, key: string): void {
  for (const facing of FACINGS) {
    for (const kind of ['walk', 'run', 'idle']) scene.anims.remove(`${key}-${kind}-${facing}`);
    for (const pose of POSES) if (scene.textures.exists(humanKey(key, facing, pose))) scene.textures.remove(humanKey(key, facing, pose));
  }
}

/**
 * Desarrollo (lifesim.clothes()): ropa de verdad o la de siempre, en el jugador y
 * en la gente que la lleva, para comparar en el mismo sitio con la misma luz.
 */
export function setPremiumClothes(scene: Phaser.Scene, on: boolean, player: Appearance): void {
  setPremium(on);
  repaintPerson(scene, 'player', player);
  fineCache.repaint();
}

function buildPeople(scene: Phaser.Scene): void {
  if (scene.textures.exists(PEOPLE)) return;
  // Con las versiones de abrigo, verano y capucha de cada cara (world/WeatherLooks): se hornean una vez.
  const looks = [...NPC_DEFS, ...PASSENGER_LOOKS, ...UNIFORM_LOOKS, ...WEATHER_LOOKS];
  // Las filas se reparten en columnas y en páginas para no pasar de 4096 px de lado (el tope de muchos móviles):
  // antes, una sola textura de 5760 px de ancho. Phaser pinta varias texturas en el mismo lote.
  const rowW = FACINGS.length * POSES.length * PLAYER_W;
  const perPage = Math.floor(ATLAS_MAX / rowW) * Math.floor(ATLAS_MAX / PLAYER_H);
  const c = personCell();
  for (let start = 0, page = 0; start < looks.length; start += perPage, page++) {
    const part = looks.slice(start, start + perPage);
    const columns = Math.ceil((part.length * PLAYER_H) / ATLAS_MAX);
    const perColumn = Math.ceil(part.length / columns);
    const key = page === 0 ? PEOPLE : `${PEOPLE}-${page}`;
    const atlas = scene.textures.createCanvas(key, columns * rowW, perColumn * PLAYER_H);
    if (!atlas) return;
    const ctx = atlas.getContext();
    ctx.imageSmoothingEnabled = false;
    part.forEach((look, row) => {
      PAGE_OF.set(look.id, key);
      const colors = colorsOf(look);
      FACINGS.forEach((facing, f) =>
        POSES.forEach((pose, i) => {
          c.clearRect(0, 0, PLAYER_W, PLAYER_H);
          drawHuman(c, facing, pose, colors);
          const x = Math.floor(row / perColumn) * rowW + (f * POSES.length + i) * PLAYER_W;
          const y = (row % perColumn) * PLAYER_H;
          ctx.drawImage(c.canvas, x, y);
          atlas.add(personFrame(look.id, facing, pose), 0, x, y, PLAYER_W, PLAYER_H);
        }),
      );
    });
    atlas.refresh();
  }
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
  STATION_SIGNS.forEach((s, i) =>
    make(scene, `prop-metro-sign-${i}`, SIGN_W, TILE, (ctx) => drawMetroSign(ctx, s.name, TILES[s.wall]?.trim ?? PALETTE.metroBlue)),
  );
  make(scene, 'prop-metro-pillar', TILE, TILE * 3, drawMetroPillar);
  make(scene, 'prop-line-map', TILE * 3, TILE, drawLineMap);
  POSTER_ADS.forEach((ad, i) => make(scene, `prop-poster-${i}`, TILE, TILE * 2, (ctx) => drawPoster(ctx, ad)));
  SUB_SIGNS.forEach((s, i) => make(scene, `prop-metro-subsign-${i}`, TILE * 6, TILE, (ctx) => drawSubSign(ctx, s, TILE * 6)));
  make(scene, 'prop-parasol', TILE, TILE * 2, drawParasol);
  make(scene, 'prop-cafe-table', TILE, TILE, drawCafeTable);

  for (const facing of FACINGS) {
    for (const pose of PLAYER_POSES) {
      // HD-03: a 16 × 24 y escala 1, la densidad del mundo (antes 28 × 42 a escala 16/28).
      make(scene, humanKey('player', facing, pose), PLAYER_W, PLAYER_H, (ctx) => drawPersonFine(ctx, facing, pose, PLAYER_COLORS));
    }
  }

  make(scene, 'prop-turnstile', TILE, TILE, drawTurnstile);
  // MET-02: la cola (espejada) lleva el panel apagado; la cabina delantera, una variante por línea con su id.
  make(scene, 'train-car-cab', CAR_W, CAR_H, (ctx) => drawCar(ctx, true));
  for (const line of LINES) make(scene, `train-car-cab-${line.id}`, CAR_W, CAR_H, (ctx) => drawCar(ctx, true, line.id));
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
  // Bebidas del bar (PopulationProfile.drinks): una caña con su espuma, una copa de vino, un refresco con pajita y un agua.
  make(scene, 'fx-glass-beer', 4, 6, (ctx) => {
    px(ctx, '#f7f2e6', 0, 0, 4, 1);
    px(ctx, '#d9921c', 0, 1, 4, 4);
    px(ctx, '#f0c050', 1, 2, 1, 2);
    px(ctx, '#9aa6ad', 0, 5, 4, 1);
  });
  make(scene, 'fx-glass-wine', 4, 6, (ctx) => {
    px(ctx, '#d8c3c8', 0, 0, 4, 1);
    px(ctx, '#8e2b3d', 0, 1, 4, 2);
    px(ctx, '#cfd8dc', 1, 3, 2, 2);
    px(ctx, '#cfd8dc', 0, 5, 4, 1);
  });
  make(scene, 'fx-glass-soft', 4, 6, (ctx) => {
    px(ctx, '#e8c040', 3, 0, 1, 3);
    px(ctx, '#e8eef2', 0, 1, 4, 4);
    px(ctx, '#b3412f', 0, 2, 3, 3);
    px(ctx, '#9aa6ad', 0, 5, 4, 1);
  });
  make(scene, 'fx-glass-water', 4, 6, (ctx) => {
    px(ctx, '#dfeaf0', 0, 1, 4, 4);
    px(ctx, '#a9d3e6', 0, 2, 4, 3);
    px(ctx, '#ffffff', 1, 2, 1, 1);
    px(ctx, '#9aa6ad', 0, 5, 4, 1);
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

  // Alerta breve sobre una persona: incidentes, sustos y reacciones.
  make(scene, 'fx-alert', 7, 9, (ctx) => {
    px(ctx, PALETTE.ink, 0, 0, 7, 7);
    px(ctx, PALETTE.amber, 1, 1, 5, 5);
    px(ctx, PALETTE.ink, 3, 2, 1, 2);
    px(ctx, PALETTE.ink, 3, 5, 1, 1);
    px(ctx, PALETTE.ink, 2, 7, 3, 1);
    px(ctx, PALETTE.ink, 3, 8, 1, 1);
  });
  // Un libro abierto: tapas de color y las dos páginas.
  make(scene, 'fx-book', 6, 4, (ctx) => {
    px(ctx, '#8e4a50', 0, 0, 6, 4);
    px(ctx, PALETTE.white, 0, 0, 3, 3);
    px(ctx, shade(PALETTE.white, -0.1), 3, 0, 3, 3);
    px(ctx, shade(PALETTE.white, -0.3), 1, 1, 1, 1);
    px(ctx, shade(PALETTE.white, -0.3), 4, 1, 1, 1);
  });
  make(scene, 'fx-shadow', 18, 6, drawShadow);
  make(scene, 'fx-shadow-long', 20, 5, drawLongShadow);
  make(scene, 'ui-prompt', TILE, TILE, drawPrompt);

  buildPropTextures(scene);
  buildBoxingTextures(scene);
  buildDojangTextures(scene);
  buildUrbanTextures(scene);
  buildPopUpTextures(scene);
  buildVegetationTextures(scene);
  buildStreetTextures(scene);
  buildArenaTextures(scene);
  buildBuildingTextures(scene);
  buildVehicleTextures(scene);
  // HD-03: las versiones con acabado de la manzana piloto (world/UrbanFinish).
  buildUrbanFinishTextures(scene);
  buildWeatherTextures(scene);
  buildAtmosphereTextures(scene);
  buildAmbientTextures(scene);
}

/**
 * Paso en cuatro tiempos (pie, paso, pie, paso) y respiración en reposo: el
 * tronco baja un píxel cada par de segundos. Mismo ritmo para todos.
 */
function humanAnims(anims: Phaser.Animations.AnimationManager, prefix: string, at: (facing: Facing, pose: Pose) => Phaser.Types.Animations.AnimationFrame): void {
  for (const facing of FACINGS) {
    const frame = (pose: Pose): Phaser.Types.Animations.AnimationFrame => at(facing, pose);
    if (!anims.exists(`${prefix}-walk-${facing}`)) {
      anims.create({ key: `${prefix}-walk-${facing}`, frames: [frame(1), frame(0), frame(2), frame(0)], frameRate: 8, repeat: -1 });
    }
    // Corriendo: zancada en el aire y apoyo, a un lado y al otro (world/HumanArt, 36 y 37); al compás de andar.
    if (!anims.exists(`${prefix}-run-${facing}`)) {
      anims.create({ key: `${prefix}-run-${facing}`, frames: [frame(36), frame(1), frame(37), frame(2)], frameRate: 8, repeat: -1 });
    }
    if (!anims.exists(`${prefix}-idle-${facing}`)) {
      anims.create({ key: `${prefix}-idle-${facing}`, frames: [{ ...frame(0), duration: 1100 }, frame(3)], frameRate: 2, repeat: -1 });
    }
  }
}

/**
 * Sólo gente (el jugador no): hablar de pie, con la mano arriba a ratos y una respiración entre frase y
 * frase; y sentado esperando, respirando (la 24 suelta el aire). Quien las usa les da su propio punto de
 * partida y su compás (por semilla): nadie gesticula ni respira a la vez que el de al lado.
 */
function npcAnims(anims: Phaser.Animations.AnimationManager, id: string): void {
  for (const facing of FACINGS) {
    const frame = (pose: Pose, duration: number): Phaser.Types.Animations.AnimationFrame => ({ key: personTexture(id), frame: personFrame(id, facing, pose), duration });
    const talk = `npc-${id}-talk-${facing}`;
    if (!anims.exists(talk)) {
      anims.create({ key: talk, frames: [frame(0, 700), frame(35, 520), frame(0, 900), frame(3, 420), frame(35, 640), frame(0, 500)], frameRate: 1, repeat: -1 });
    }
    const sit = `npc-${id}-sit-${facing}`;
    if (!anims.exists(sit)) anims.create({ key: sit, frames: [frame(4, 3_300), frame(24, 520)], frameRate: 1, repeat: -1 });
  }
}

/**
 * Las animaciones de alguien, hacia la textura que le toca ahora (personTexture): el atlas de siempre o la suya con el
 * acabado. Se rehacen al terminar de hornearla y al tirarla (world/HdCache); quien las estuviera reproduciendo se para
 * (Phaser) y la vuelve a pedir: entities/Character en cada frame, entities/Walker y entities/NPC al notar el cambio.
 */
function personAnims(anims: Phaser.Animations.AnimationManager, id: string): void {
  for (const facing of FACINGS) for (const kind of ['walk', 'run', 'idle', 'talk', 'sit']) anims.remove(`npc-${id}-${kind}-${facing}`);
  humanAnims(anims, `npc-${id}`, (facing, pose) => ({ key: personTexture(id), frame: personFrame(id, facing, pose) }));
  npcAnims(anims, id);
}

export function registerAnimations(scene: Phaser.Scene): void {
  fineGame = scene.game;
  humanAnims(scene.anims, 'player', (facing, pose) => ({ key: humanKey('player', facing, pose) }));
  for (const npc of [...NPC_DEFS, ...PASSENGER_LOOKS, ...UNIFORM_LOOKS, ...WEATHER_LOOKS]) {
    humanAnims(scene.anims, `npc-${npc.id}`, (facing, pose) => ({ key: personTexture(npc.id), frame: personFrame(npc.id, facing, pose) }));
    npcAnims(scene.anims, npc.id);
  }
}
