import type Phaser from 'phaser';
import { PALETTE } from '../config/constants';
import { VEHICLES, type VehicleType } from '../data/vehicles';
import { make, px, shade, type Ctx } from './paint';

/**
 * Vehículos de perfil, en 3/4 hacia el sur (design/ART_BIBLE.md): filo de
 * techo arriba, costado sur, ruedas asomando y sombra hacia el sureste. Mira a
 * la derecha; hacia el oeste se voltea. Una silueta por familia
 * (VehicleShape): un tipo nuevo con una silueta que ya existe no pide arte.
 */

/** Dónde van las luces en el sprite (mirando a la derecha), para encenderlas encima. */
export interface VehicleLamps {
  head: readonly [number, number];
  tail: readonly [number, number];
  /** Luz del techo: el verde de libre del taxi, la rotativa del servicio. */
  roof?: readonly [number, number];
}

const SHADOW = 'rgba(12,10,20,0.34)';
const SHADOW_SOFT = 'rgba(12,10,20,0.16)';
const HEAD = '#f4ecd0';
const TAIL = '#9e2f2a';
const TINT = shade(PALETTE.glass, -0.25);

interface Paint {
  ctx: Ctx;
  L: number;
  H: number;
  body: string;
  lit: string;
  dark: string;
}

/** Bloque con contorno: la silueta se lee a cualquier zoom. */
function slab(p: Paint, x: number, y: number, w: number, h: number, color = p.body): void {
  px(p.ctx, PALETTE.outline, x - 1, y - 1, w + 2, h + 2);
  px(p.ctx, color, x, y, w, h);
  px(p.ctx, shade(color, 0.12), x, y, w, 1);
}

/** Rueda: neumático con su flanco, llanta con luz arriba a la izquierda y el paso de rueda en sombra encima. */
function wheel(p: Paint, cx: number): void {
  const y = p.H - 5;
  px(p.ctx, shade(p.body, -0.34), cx - 4, y - 1, 8, 1);
  px(p.ctx, PALETTE.ink, cx - 3, y + 1, 6, 3);
  px(p.ctx, PALETTE.ink, cx - 2, y, 4, 5);
  px(p.ctx, shade(PALETTE.ink, 0.16), cx - 3, y + 1, 1, 2);
  px(p.ctx, PALETTE.metal, cx - 1, y + 1, 2, 2);
  px(p.ctx, shade(PALETTE.metal, 0.3), cx - 1, y + 1, 1, 1);
  px(p.ctx, shade(PALETTE.metal, -0.25), cx, y + 2, 1, 1);
}

/** Faros, pilotos y parachoques a la altura `y` del costado. */
function ends(p: Paint, y: number): VehicleLamps {
  // Faro con su carcasa y piloto con el cristal más oscuro abajo: se leen apagados, de día.
  px(p.ctx, shade(p.body, -0.3), p.L - 3, y - 1, 2, 4);
  px(p.ctx, HEAD, p.L - 2, y, 1, 2);
  px(p.ctx, '#ffffff', p.L - 2, y, 1, 1);
  px(p.ctx, shade(p.body, -0.3), 1, y - 1, 2, 4);
  px(p.ctx, TAIL, 1, y, 1, 2);
  px(p.ctx, shade(TAIL, 0.3), 1, y, 1, 1);
  px(p.ctx, shade(PALETTE.metal, -0.2), p.L - 2, p.H - 6, 2, 2);
  px(p.ctx, shade(PALETTE.metal, -0.2), 0, p.H - 6, 2, 2);
  return { head: [p.L - 2, y], tail: [1, y] };
}

/** Turismo: cabina de cristal entre `a` y `b` (fracciones del largo), capó y maletero. */
function car(p: Paint, t: VehicleType, a: number, b: number, bodyTop: number): VehicleLamps {
  const { ctx, L, H } = p;
  const xa = Math.round(L * a);
  const xb = Math.round(L * b);
  slab(p, xa, 1, xb - xa, bodyTop);
  px(ctx, p.lit, xa + 1, 1, xb - xa - 2, 1);
  // Cristal: más oscuro abajo, dos reflejos del cielo en diagonal y el pilar entre puertas.
  px(ctx, TINT, xa + 1, 2, xb - xa - 2, bodyTop - 2);
  px(ctx, shade(TINT, -0.2), xa + 1, bodyTop - 1, xb - xa - 2, 1);
  px(ctx, PALETTE.glassLit, xa + 1, 2, xb - xa - 3, 1);
  for (let i = 0; i < bodyTop - 3; i++) {
    px(ctx, shade(PALETTE.glassLit, -0.15), xa + 3 + i, 3 + i, 1, 1);
    px(ctx, shade(PALETTE.glassLit, -0.3), xa + 5 + i, 3 + i, 1, 1);
  }
  px(ctx, shade(p.body, -0.1), xa + Math.round((xb - xa) / 2), 2, 1, bodyTop - 2);
  slab(p, 1, bodyTop, L - 2, H - 4 - bodyTop);
  // Volumen del costado: el filo de arriba con luz, la línea de cintura, la parte baja en sombra.
  px(ctx, shade(p.body, 0.2), 2, bodyTop, L - 4, 1);
  px(ctx, shade(p.body, 0.08), 2, bodyTop + 2, L - 4, 1);
  px(ctx, shade(p.body, -0.08), 1, H - 9, L - 2, 2);
  px(ctx, p.dark, 1, H - 7, L - 2, 2);
  px(ctx, p.dark, xa + Math.round((xb - xa) / 2), bodyTop + 1, 1, H - 8 - bodyTop);
  // Tiradores y retrovisor.
  px(ctx, shade(p.body, 0.3), xa + Math.round((xb - xa) / 2) + 3, bodyTop + 3, 2, 1);
  px(ctx, shade(p.body, 0.3), xa + 2, bodyTop + 3, 2, 1);
  px(ctx, PALETTE.outline, xb, bodyTop - 1, 2, 2);
  px(ctx, p.body, xb, bodyTop - 1, 1, 1);
  if (t.trim?.stripe) {
    // La banda roja en diagonal de las puertas delanteras.
    const x0 = Math.round(L * 0.55);
    for (let i = 0; i < 3; i++) px(ctx, t.trim.stripe, x0 - i, bodyTop + 1 + i, 5, 1);
  }
  wheel(p, Math.round(L * 0.22));
  wheel(p, Math.round(L * 0.78));
  const lamps = ends(p, bodyTop + 1);
  if (t.trim?.roof !== 'taxi') return lamps;
  const mid = Math.round((xa + xb) / 2) - 1;
  px(ctx, PALETTE.outline, mid - 1, 0, 4, 1);
  px(ctx, PALETTE.leafLit, mid, 0, 2, 1);
  return { ...lamps, roof: [mid, 0] };
}

function van(p: Paint, t: VehicleType): VehicleLamps {
  const { ctx, L, H } = p;
  slab(p, 1, 1, L - 3, H - 5);
  px(ctx, p.lit, 2, 1, L - 7, 2);
  px(ctx, TINT, L - 7, 4, 5, 6);
  px(ctx, PALETTE.glassLit, L - 7, 4, 5, 1);
  px(ctx, TINT, L - 14, 4, 5, 5);
  px(ctx, p.dark, Math.round(L * 0.45), 4, 1, H - 10);
  px(ctx, p.dark, L - 15, 4, 1, H - 10);
  if (t.trim?.stripe) px(ctx, t.trim.stripe, 1, H - 11, L - 3, 2);
  px(ctx, p.dark, 1, H - 7, L - 3, 2);
  wheel(p, Math.round(L * 0.2));
  wheel(p, Math.round(L * 0.8));
  return ends(p, H - 10);
}

function bus(p: Paint, t: VehicleType): VehicleLamps {
  const { ctx, L, H } = p;
  slab(p, 1, 1, L - 2, H - 5);
  px(ctx, p.lit, 2, 1, L - 4, 3);
  px(ctx, shade(p.body, 0.05), Math.round(L * 0.3), 1, 18, 2);
  // Rótulo de destino, sobre el parabrisas.
  px(ctx, PALETTE.ink, L - 17, 4, 14, 3);
  px(ctx, PALETTE.amber, L - 16, 5, 12, 1);
  for (let x = 5; x < L - 20; x += 9) {
    px(ctx, TINT, x, 7, 8, 8);
    px(ctx, PALETTE.glassLit, x, 7, 8, 1);
  }
  px(ctx, TINT, L - 7, 7, 5, 11);
  px(ctx, PALETTE.glassLit, L - 7, 7, 5, 1);
  // Puertas: delantera y central, de cristal hasta abajo, con su marco y la junta de las hojas.
  for (const x of [L - 15, Math.round(L * 0.5)]) {
    px(ctx, p.dark, x - 1, 7, 7, H - 13);
    px(ctx, TINT, x, 7, 5, H - 14);
    px(ctx, PALETTE.glassLit, x, 7, 5, 1);
    px(ctx, p.dark, x + 2, 8, 1, H - 15);
  }
  if (t.trim?.stripe) px(ctx, t.trim.stripe, 1, 16, L - 2, 2);
  px(ctx, p.dark, 1, H - 9, L - 2, 3);
  wheel(p, Math.round(L * 0.16));
  wheel(p, Math.round(L * 0.8));
  return ends(p, H - 11);
}

/** Cabina delante (a la derecha) y, detrás, lo que dibuje `rear` en el ancho que queda. */
function cabover(p: Paint, rear: (w: number) => void): VehicleLamps {
  const { ctx, L, H } = p;
  const cab = 12;
  const x = L - cab - 1;
  slab(p, x, H - 16, cab, 11);
  px(ctx, p.lit, x + 1, H - 16, cab - 2, 1);
  px(ctx, TINT, L - 5, H - 14, 3, 5);
  px(ctx, PALETTE.glassLit, L - 5, H - 14, 3, 1);
  px(ctx, TINT, x + 2, H - 14, 5, 4);
  px(ctx, p.dark, x, H - 7, cab, 2);
  const w = L - cab - 4;
  px(ctx, PALETTE.ink, 1, H - 7, w + 1, 2);
  rear(w);
  wheel(p, Math.round(L * 0.18));
  if (L >= 50) wheel(p, Math.round(L * 0.18) + 7);
  wheel(p, L - 7);
  return ends(p, H - 9);
}

function boxTruck(p: Paint, t: VehicleType): VehicleLamps {
  return cabover(p, (w) => {
    const box = t.trim?.box ?? p.body;
    slab(p, 1, 1, w, p.H - 9, box);
    px(p.ctx, shade(box, 0.1), 1, 1, w, 2);
    for (let x = 9; x < w; x += 9) px(p.ctx, shade(box, -0.1), x, 3, 1, p.H - 12);
    if (t.trim?.stripe) px(p.ctx, t.trim.stripe, 1, p.H - 13, w, 2);
  });
}

function garbage(p: Paint, t: VehicleType): VehicleLamps {
  return cabover(p, (w) => {
    const box = t.trim?.box ?? p.body;
    slab(p, 1, 3, w, p.H - 11, box);
    // Lomo redondeado: las esquinas de arriba, en contorno.
    px(p.ctx, PALETTE.outline, 1, 3, 1, 1);
    px(p.ctx, PALETTE.outline, w, 3, 1, 1);
    px(p.ctx, shade(box, 0.1), 2, 3, w - 2, 2);
    if (t.trim?.stripe) px(p.ctx, t.trim.stripe, 1, p.H - 13, w, 3);
    // La tolva de atrás, más baja y oscura.
    px(p.ctx, PALETTE.outline, 0, p.H - 16, 7, 10);
    px(p.ctx, shade(PALETTE.metal, -0.1), 1, p.H - 15, 5, 8);
  });
}

function pickup(p: Paint, t: VehicleType): VehicleLamps {
  const { ctx, L, H } = p;
  const cx = Math.round(L * 0.38);
  const cw = Math.round(L * 0.34);
  slab(p, 1, 8, cx, H - 12);
  px(ctx, p.dark, 2, 8, cx - 2, 2);
  slab(p, cx + cw - 1, 7, L - cx - cw, H - 11);
  slab(p, cx, 2, cw, H - 6);
  px(ctx, p.lit, cx + 1, 2, cw - 2, 1);
  px(ctx, TINT, cx + 2, 3, cw - 4, 4);
  px(ctx, PALETTE.glassLit, cx + 2, 3, cw - 4, 1);
  if (t.trim?.stripe) for (let x = 1; x < L - 2; x += 2) px(ctx, t.trim.stripe, x, H - 8, 1, 1);
  px(ctx, p.dark, 1, H - 7, L - 2, 1);
  wheel(p, Math.round(L * 0.2));
  wheel(p, Math.round(L * 0.8));
  const lamps = ends(p, 8);
  if (t.trim?.roof !== 'beacon') return lamps;
  const mid = cx + Math.round(cw / 2) - 1;
  px(ctx, PALETTE.outline, mid - 1, 0, 4, 2);
  px(ctx, PALETTE.amber, mid, 0, 2, 1);
  return { ...lamps, roof: [mid, 0] };
}

/** Dibuja el tipo con esa carrocería y devuelve dónde quedan sus luces. */
export function drawVehicle(ctx: Ctx, t: VehicleType, body: string): VehicleLamps {
  const p: Paint = { ctx, L: t.length, H: t.height, body, lit: shade(body, 0.14), dark: shade(body, -0.16) };
  // Sombra de contacto en dos tonos: el núcleo bajo las ruedas y el borde que se funde con el asfalto.
  px(ctx, SHADOW_SOFT, 1, p.H - 4, p.L + 1, 4);
  px(ctx, SHADOW, 3, p.H - 3, p.L - 4, 2);
  switch (t.shape) {
    case 'hatch': return car(p, t, 0.16, 0.66, 6);
    case 'sedan': return car(p, t, 0.3, 0.72, 6);
    case 'suv': return car(p, t, 0.1, 0.76, 8);
    case 'van': return van(p, t);
    case 'bus': return bus(p, t);
    case 'box-truck': return boxTruck(p, t);
    case 'garbage': return garbage(p, t);
    case 'pickup': return pickup(p, t);
  }
}

const LAMPS = new Map<string, VehicleLamps>();

export function vehicleKey(t: VehicleType, color: number): string {
  return `veh-${t.id}-${color}`;
}

/** Luces del tipo; las fija buildVehicleTextures. */
export function lampsOf(t: VehicleType): VehicleLamps {
  const lamps = LAMPS.get(t.id);
  if (!lamps) throw new Error(`Vehículo sin textura: ${t.id}`);
  return lamps;
}

export function buildVehicleTextures(scene: Phaser.Scene): void {
  for (const t of VEHICLES) {
    t.colors.forEach((c, i) => make(scene, vehicleKey(t, i), t.length, t.height, (ctx) => LAMPS.set(t.id, drawVehicle(ctx, t, c))));
  }
  // Luces encendidas: van encima de la sombra de la noche.
  make(scene, 'veh-head', 1, 2, (ctx) => px(ctx, '#fff6d8', 0, 0, 1, 2));
  make(scene, 'veh-tail', 1, 2, (ctx) => px(ctx, '#ff5a44', 0, 0, 1, 2));
  make(scene, 'veh-roof-taxi', 2, 1, (ctx) => px(ctx, '#7cff8a', 0, 0, 2, 1));
  make(scene, 'veh-roof-beacon', 2, 1, (ctx) => px(ctx, '#ffb13a', 0, 0, 2, 1));
}
