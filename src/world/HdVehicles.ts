import Phaser from 'phaser';
import { VEHICLES, type VehicleShape, type VehicleType } from '../data/vehicles';
import { ellipse, HD_SCALE, line, makeHd, poly, rect, rgba, rrect, softShadow, tone, vgrad, type Ctx } from './HdKit';
import type { VehicleLamps } from './VehicleArt';

/**
 * Vehículos Visual V3 (design/VISUAL_V3.md): el mismo catálogo de data/vehicles
 * —un tipo nuevo sigue siendo una entrada de datos—, dibujado a 4× con
 * volumen: chapa con reflejo del cielo arriba y sombra abajo, cristales con su
 * brillo, llantas, juntas de puertas, pilotos con forma y sombra de contacto.
 *
 * Y a la escala de la gente de V3: con personas de 28 px, un turismo de 26 px
 * era un juguete. Aquí mide 1,6 veces más de largo y 1,3 de alto (sigue
 * comprimido para que quepa en su carril). systems/Traffic lee ese largo, así
 * que la distancia entre coches cuadra con lo que se ve.
 */

const LONG = 1.6;
const TALL = 1.3;

/** El catálogo de tráfico a la escala V3: mismos tipos, mismos pesos, más largos. */
export const HD_VEHICLES: readonly VehicleType[] = VEHICLES.map((t) => ({ ...t, length: Math.round(t.length * LONG), height: Math.round(t.height * TALL) }));

/** Perfil de cada silueta, en fracciones del largo (x, desde atrás) y del alto (y, desde arriba). */
interface Profile {
  /** Cabina: pie del montante trasero, techo de atrás, techo de delante, pie del parabrisas. */
  cabin: readonly [number, number, number, number];
  /** Altura del techo y de la línea de cintura. */
  roof: number;
  belt: number;
  /** Caja trasera (camión, basura, furgón de pick-up abierto): de 0 a `box` del largo, hasta `boxTop` de alto. */
  box?: number;
  boxTop?: number;
}

const PROFILES: Record<VehicleShape, Profile> = {
  hatch: { cabin: [0.07, 0.14, 0.6, 0.76], roof: 0.06, belt: 0.5 },
  sedan: { cabin: [0.16, 0.27, 0.6, 0.75], roof: 0.08, belt: 0.52 },
  suv: { cabin: [0.05, 0.08, 0.66, 0.78], roof: 0.05, belt: 0.5 },
  van: { cabin: [0.03, 0.04, 0.8, 0.92], roof: 0.04, belt: 0.52 },
  bus: { cabin: [0.03, 0.03, 0.97, 0.985], roof: 0.06, belt: 0.56 },
  'box-truck': { cabin: [0.74, 0.75, 0.9, 0.97], roof: 0.22, belt: 0.55, box: 0.72, boxTop: 0.02 },
  garbage: { cabin: [0.76, 0.77, 0.9, 0.97], roof: 0.22, belt: 0.55, box: 0.74, boxTop: 0.04 },
  pickup: { cabin: [0.4, 0.44, 0.66, 0.78], roof: 0.1, belt: 0.52, box: 0.38 },
};

/** Una rueda vista de lado: neumático, llanta de radios con su brillo, buje y la sombra del paso de rueda. */
function wheel(ctx: Ctx, x: number, y: number, r: number): void {
  ellipse(ctx, '#0c0b10', x, y - 0.4, r + 1.1, r + 0.9);
  ellipse(ctx, '#1d1c22', x, y, r, r);
  ellipse(ctx, '#2c2b32', x - 0.3, y - 0.3, r * 0.92, r * 0.92);
  ellipse(ctx, '#8a9096', x, y, r * 0.58, r * 0.58);
  ellipse(ctx, '#b9c0c6', x - 0.25, y - 0.25, r * 0.48, r * 0.48);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    line(ctx, '#6c727a', 0.45, [x, y, x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5]);
  }
  ellipse(ctx, '#4a4f56', x, y, r * 0.16, r * 0.16);
}

/** Cristal con el reflejo del cielo y una raya de luz en diagonal. */
function glass(ctx: Ctx, pts: readonly number[], h: number): void {
  poly(ctx, '#1e2a36', pts);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.clip();
  const ys = pts.filter((_, i) => i % 2 === 1);
  const xs = pts.filter((_, i) => i % 2 === 0);
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  vgrad(ctx, x0, y0, x1 - x0, y1 - y0, '#6f8fa6', '#22303d');
  for (let x = x0 + (x1 - x0) * 0.3; x < x1; x += (x1 - x0) * 0.45) poly(ctx, rgba('#ffffff', 0.18), [x, y0, x + h * 0.25, y0, x - h * 0.1, y1, x - h * 0.35, y1]);
  ctx.restore();
}

/** Dibuja un vehículo de perfil (morro a la derecha) y devuelve dónde van sus luces. */
function drawHdVehicle(ctx: Ctx, t: VehicleType, color: string): VehicleLamps {
  const L = t.length;
  const H = t.height;
  const p = PROFILES[t.shape];
  const X = (f: number): number => f * L;
  const Y = (f: number): number => f * H;
  const r = Math.max(2.6, Math.min(5, H * 0.17));
  const ground = H - 1.2;
  const wy = ground - r;
  const big = t.shape === 'bus' || !!p.box;
  const wheels = t.shape === 'bus' ? [0.17, 0.78] : big ? [0.16, 0.5, 0.84].slice(t.shape === 'pickup' ? 1 : 0) : [0.17, 0.81];
  if (t.shape === 'pickup') wheels.unshift(0.17);
  const bodyTop = Y(p.belt);
  const sill = ground - r * 0.55;
  const lit = tone(color, 0.18);
  const dark = tone(color, -0.32);

  // Sombra de contacto: el coche pesa sobre el asfalto.
  softShadow(ctx, L / 2, ground + 0.4, L * 0.52, 1.6, 0.55);

  // Caja o carrocería trasera alta.
  if (p.box !== undefined && p.boxTop !== undefined) {
    const bx1 = X(p.box);
    const boxColor = t.trim?.box ?? color;
    rrect(ctx, tone(boxColor, -0.25), 0.4, Y(p.boxTop), bx1, sill - Y(p.boxTop) + 0.6, 1);
    vgrad(ctx, 0.8, Y(p.boxTop) + 0.4, bx1 - 0.8, sill - Y(p.boxTop) - 1, tone(boxColor, 0.12), tone(boxColor, -0.12));
    // Techo de la caja (el filo que se ve desde arriba) y nervios de chapa.
    rect(ctx, tone(boxColor, 0.25), 0.8, Y(p.boxTop) + 0.4, bx1 - 0.8, 1.2);
    for (let x = 4; x < bx1 - 2; x += 6) rect(ctx, rgba('#000000', 0.08), x, Y(p.boxTop) + 2, 0.5, sill - Y(p.boxTop) - 3);
    if (t.shape === 'garbage') {
      // Compactador redondeado detrás y el escudo municipal.
      ellipse(ctx, tone(boxColor, -0.2), 2.5, (Y(p.boxTop) + sill) / 2, 3, (sill - Y(p.boxTop)) / 2);
      rect(ctx, t.trim?.stripe ?? '#4c8a54', 0.8, sill - 6, bx1 - 0.8, 2.2);
      rrect(ctx, '#2f5e3a', bx1 * 0.45, Y(0.3), 6, 6, 1);
    } else if (t.trim?.stripe) rect(ctx, t.trim.stripe, 0.8, sill - 7, bx1 - 0.8, 1.6);
  }

  // Carrocería baja: de parachoques a parachoques, con el hombro iluminado.
  const nose = t.shape === 'bus' || t.shape === 'van' ? 0.6 : 2.2;
  const tail = t.shape === 'bus' || t.shape === 'van' ? 0.6 : 1.6;
  const lowerX0 = p.box !== undefined && p.boxTop !== undefined ? X(p.box) - 1 : 0.4;
  rrect(ctx, dark, lowerX0, bodyTop - 0.4, L - 0.4 - lowerX0, sill - bodyTop + 1.4, Math.min(nose, 2));
  vgrad(ctx, lowerX0 + 0.6, bodyTop, L - 1.6 - lowerX0, sill - bodyTop, lit, tone(color, -0.18));
  rect(ctx, rgba('#ffffff', 0.35), lowerX0 + tail, bodyTop + 0.5, L - lowerX0 - tail - nose, 0.4);
  // Faldón oscuro y la línea de sombra de la puerta.
  rect(ctx, tone(color, -0.45), lowerX0 + 0.6, sill - 1.4, L - 1.6 - lowerX0, 1.4);
  if (t.shape === 'pickup' && p.box !== undefined) {
    // Caja abierta: el borde y el fondo que se ve desde arriba.
    rect(ctx, tone(color, -0.5), 1, bodyTop - 2, X(p.box) - 1.4, 2);
    rect(ctx, lit, 1, bodyTop - 2.6, X(p.box) - 1.4, 0.7);
  }

  // Cabina: montantes de chapa y cristales.
  const [c0, c1, c2, c3] = p.cabin.map(X);
  const roofY = Y(p.roof);
  if (t.shape === 'bus') {
    rrect(ctx, dark, 0.4, roofY, L - 0.8, bodyTop - roofY + 1, 1.6);
    vgrad(ctx, 0.8, roofY + 0.4, L - 1.6, bodyTop - roofY, lit, color);
    // Techo (el filo del aire acondicionado) y la ventana corrida con montantes.
    rect(ctx, tone(color, 0.3), 2, roofY + 0.2, L - 4, 1.6);
    rrect(ctx, '#d8dde0', L * 0.3, roofY - 1.2, L * 0.3, 1.6, 0.6);
    const gy0 = roofY + 3;
    const gy1 = bodyTop - 1.5;
    glass(ctx, [2, gy0, L - 2.6, gy0, L - 1.2, gy1, 2, gy1], gy1 - gy0);
    for (let x = 2 + 11; x < L - 6; x += 11) rect(ctx, '#11161c', x, gy0, 0.8, gy1 - gy0);
    // Puertas dobles y el rótulo de destino.
    for (const dx of [0.42, 0.9]) {
      rect(ctx, '#11161c', X(dx) - 4, gy0, 0.5, sill - gy0);
      rect(ctx, '#11161c', X(dx) + 4, gy0, 0.5, sill - gy0);
      rect(ctx, '#11161c', X(dx), gy0, 0.3, sill - gy0);
    }
    rrect(ctx, '#1b1c1f', L - 14, roofY + 0.6, 11, 2.2, 0.4);
    ctx.font = 'bold 1.8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffb13a';
    ctx.fillText('27 VALLESCO', L - 8.5, roofY + 2.3);
    if (t.trim?.stripe) rect(ctx, t.trim.stripe, 0.8, bodyTop + 2.5, L - 1.6, 1.4);
  } else {
    poly(ctx, dark, [c0 - 0.6, bodyTop, c1 - 0.6, roofY - 0.4, c2 + 0.6, roofY - 0.4, c3 + 0.8, bodyTop]);
    poly(ctx, color, [c0, bodyTop, c1, roofY, c2, roofY, c3, bodyTop]);
    // Techo visto desde arriba: una franja más clara.
    poly(ctx, tone(color, 0.28), [c1, roofY, c2, roofY, c2 - 0.6, roofY + 1.3, c1 + 0.6, roofY + 1.3]);
    const inset = 1;
    const gTop = roofY + 1.6;
    const gBot = bodyTop - 0.6;
    const k = (y: number, a: number, b: number): number => a + (b - a) * ((y - bodyTop) / (roofY - bodyTop));
    const gx0 = k(gTop, c0, c1) + inset;
    const gx3 = k(gTop, c3, c2) - inset;
    const bx0 = k(gBot, c0, c1) + inset;
    const bx3 = k(gBot, c3, c2) - inset;
    glass(ctx, [gx0, gTop, gx3, gTop, bx3, gBot, bx0, gBot], gBot - gTop);
    // Montante central (pilar B) y, en los largos, el C.
    const mid = (c1 + c2) / 2;
    rect(ctx, tone(color, -0.5), mid - 0.5, gTop, 1, gBot - gTop);
    if (t.shape === 'van' || t.shape === 'suv') rect(ctx, tone(color, -0.5), c1 + (c2 - c1) * 0.2, gTop, 0.8, gBot - gTop);
    // Puertas: juntas, tiradores y el retrovisor.
    rect(ctx, rgba('#000000', 0.35), mid - 0.2, bodyTop, 0.35, sill - bodyTop - 1.5);
    rect(ctx, rgba('#000000', 0.3), k(gBot, c3, c2) - 0.6, bodyTop, 0.35, sill - bodyTop - 1.5);
    for (const hx of [mid - 3, k(gBot, c3, c2) - 3.6]) rrect(ctx, tone(color, -0.4), hx, bodyTop + 1.4, 2, 0.6, 0.3);
    poly(ctx, tone(color, -0.25), [c3 - 1, bodyTop - 0.4, c3 + 1.4, bodyTop - 1.6, c3 + 1.8, bodyTop + 0.4, c3 - 0.6, bodyTop + 0.6]);
    if (t.trim?.stripe && t.trim.roof === 'taxi') {
      // Taxi de Madrid: la franja roja en diagonal de la puerta delantera.
      poly(ctx, t.trim.stripe, [mid + 1, sill - 1.5, mid + 2.4, sill - 1.5, mid + 6.6, bodyTop + 0.6, mid + 5.2, bodyTop + 0.6]);
    } else if (t.trim?.stripe) rect(ctx, t.trim.stripe, lowerX0 + 1, bodyTop + 3.2, L - lowerX0 - 3, 1.2);
  }

  // Pilotos y faros con forma; el parachoques, más oscuro.
  const lampY = bodyTop + 1.2;
  rrect(ctx, '#7a1414', 0.2, lampY, 1.6, 2.4, 0.4);
  rect(ctx, '#e04a44', 0.5, lampY + 0.4, 0.8, 1.2);
  rrect(ctx, '#d8dde0', L - 1.8, lampY, 1.6, 2, 0.4);
  rect(ctx, '#fff6d8', L - 1.4, lampY + 0.4, 0.9, 1.1);
  rect(ctx, '#e0a040', L - 1.5, lampY + 2.3, 1, 0.6);
  rrect(ctx, '#1c1d22', L - 2.4, sill - 3, 2.2, 3, 0.6);
  rrect(ctx, '#1c1d22', 0.2, sill - 3, 2, 3, 0.6);
  // Matrícula (blanca con la franja azul).
  rect(ctx, '#e8e8e2', L - 0.8, sill - 2.6, 0.6, 1.4);

  for (const f of wheels) {
    // Paso de rueda: un arco oscuro en la chapa.
    ellipse(ctx, '#121116', X(f), wy, r + 1.1, r + 1.1);
    wheel(ctx, X(f), wy, r);
  }

  // Lo del techo: la luz verde del taxi, la rotativa del servicio.
  let roofLamp: [number, number] | undefined;
  if (t.trim?.roof === 'taxi' || t.trim?.roof === 'beacon') {
    const rx = (c1 + c2) / 2;
    if (t.trim.roof === 'taxi') {
      rrect(ctx, '#e8e6de', rx - 2.4, roofY - 1.8, 4.8, 1.8, 0.5);
      rect(ctx, '#3c8a4a', rx - 0.8, roofY - 1.6, 1.6, 1.2);
    } else {
      rrect(ctx, '#2a2b2f', rx - 3, roofY - 1, 6, 1, 0.3);
      rrect(ctx, '#e08a2c', rx - 1.6, roofY - 2.4, 3.2, 1.6, 0.6);
    }
    roofLamp = [rx - 1, roofY - 2];
  }
  return { head: [L - 1.4, lampY + 0.2], tail: [0.4, lampY], roof: roofLamp };
}

const lamps = new Map<string, VehicleLamps>();

/** La textura HD de un tipo y color (dibujada una vez por sesión) y sus luces. */
export function hdVehicleKey(scene: Phaser.Scene, t: VehicleType, color: number): string {
  const key = `hdveh-${t.id}-${color}`;
  if (!scene.textures.exists(key)) {
    makeHd(scene, key, t.length, t.height, (ctx) => lamps.set(t.id, drawHdVehicle(ctx, t, t.colors[color] ?? t.colors[0])));
  } else if (!lamps.has(t.id)) {
    // Textura ya hecha en otra sesión de la escena: recalcula las luces en un lienzo de usar y tirar.
    const c = document.createElement('canvas').getContext('2d');
    if (c) lamps.set(t.id, drawHdVehicle(c, t, t.colors[0]));
  }
  return key;
}

export function hdLampsOf(t: VehicleType): VehicleLamps {
  const l = lamps.get(t.id);
  if (!l) throw new Error(`Vehículo HD sin textura: ${t.id}`);
  return l;
}

export const HD_VEHICLE_SCALE = HD_SCALE;
