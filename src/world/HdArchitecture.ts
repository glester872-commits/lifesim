import { TILE } from '../config/constants';
import type { BuildingDef } from '../types/game';
import type { WindowSpot } from './BuildingArt';
import { blend, ellipse, hash, hgrad, line, poly, rect, rgba, rng, rrect, smooth, softShadow, speckle, tone, vgrad, type Ctx } from './HdKit';

/**
 * Fachadas Visual V3 (design/VISUAL_V3.md): arquitectura construida, no
 * rectángulos decorados. Cada casa tiene base (zócalo, planta baja con portal o
 * local, imposta), cuerpo (tres plantas en el mismo ritmo de huecos) y remate
 * (cornisa con ménsulas). Los huecos están rehundidos: jamba y dintel echan
 * sombra dentro (luz del noroeste), el alféizar sobresale y gotea, y los
 * balcones vuelan con su forjado, su barandilla y su sombra sobre el muro.
 *
 * Planta baja de 40 px (una puerta de 2 m para personas de 28 px) y plantas de
 * 22: un bloque de 7 tiles es una casa de cuatro alturas con su cornisa.
 */

export interface Material {
  wall: string;
  /** Piedra de zócalo, impostas, recercados y cornisa. */
  trim: string;
  /** Carpintería y contraventanas. */
  joinery: string;
  shutter?: string;
  /** Aparejo del muro. */
  kind: 'brick' | 'plaster' | 'stone';
  curtains: readonly string[];
  /** Balcones en las plantas: 'all' en todos los huecos, 'center' sólo los del centro, 'first' sólo en la primera. */
  balconies: 'all' | 'center' | 'first';
}

/** Materiales por estilo de edificio: el carácter de cada casa. */
export function materialOf(b: BuildingDef): Material {
  switch (b.style) {
    case 'res-brick':
    case 'restaurant':
      return { wall: '#a8553e', trim: '#d9cdb5', joinery: '#f0ebe0', shutter: '#3f5e4a', kind: 'brick', curtains: ['#e8dcc4', '#c96b4a', '#f2efe6'], balconies: 'all' };
    case 'pharmacy':
    case 'res-stone':
      return { wall: '#c9bda5', trim: '#e6dcc8', joinery: '#3a3d44', kind: 'stone', curtains: ['#f2efe6', '#9fb3c4', '#e8dcc4'], balconies: 'center' };
    default:
      return { wall: '#d4a96c', trim: '#ece2cc', joinery: '#5a3f2c', shutter: '#5a3f2c', kind: 'plaster', curtains: ['#f2efe6', '#b84a4a', '#e8d6a8', '#6f8f6a'], balconies: 'first' };
  }
}

const GROUND_FLOOR = 40;
const FLOOR = 22;
const CORNICE = 6;

// ------------------------------------------------------------------ muro

function wallTexture(ctx: Ctx, m: Material, x: number, y: number, w: number, h: number, seed: number): void {
  rect(ctx, m.wall, x, y, w, h);
  if (m.kind === 'brick') {
    // Ladrillo visto a soga: hiladas de 2 px, piezas de 5, cada una con su tono.
    for (let yy = y; yy < y + h; yy += 2) {
      const off = ((yy - y) / 2) % 2 ? 2.5 : 0;
      for (let xx = x - off; xx < x + w; xx += 5) {
        const n = (hash(Math.floor(xx * 3), Math.floor(yy * 5), seed) - 0.5) * 0.12 + smooth(xx, yy, 40, seed) * 0.05;
        rect(ctx, tone(m.wall, n), xx + 0.25, yy + 0.25, 4.5, 1.5);
      }
    }
    // Llagas: mortero claro.
    for (let yy = y; yy < y + h; yy += 2) rect(ctx, rgba('#e9dccb', 0.35), x, yy, w, 0.25);
  } else if (m.kind === 'stone') {
    // Sillería: hiladas de 7 px con juntas finas y bordes con luz.
    for (let yy = y; yy < y + h; yy += 7) {
      const off = ((yy - y) / 7) % 2 ? 7 : 0;
      for (let xx = x - off; xx < x + w; xx += 14) {
        const n = (hash(Math.floor(xx), Math.floor(yy), seed) - 0.5) * 0.06 + smooth(xx, yy, 50, seed) * 0.04;
        const c = tone(m.wall, n);
        rect(ctx, c, xx + 0.3, yy + 0.3, 13.4, 6.4);
        rect(ctx, tone(c, 0.08), xx + 0.3, yy + 0.3, 13.4, 0.5);
        rect(ctx, tone(c, -0.08), xx + 0.3, yy + 6.2, 13.4, 0.5);
      }
    }
    speckle(ctx, rgba('#5a5246', 0.18), x, y, w, h, Math.floor(w * h * 0.08), seed);
  } else {
    // Revoco: manchas amplias de tono, desconchones y el grano de la llana.
    for (let yy = y; yy < y + h; yy += 2) {
      for (let xx = x; xx < x + w; xx += 2) {
        const n = smooth(xx, yy, 34, seed) * 0.05 + smooth(xx, yy, 9, seed + 1) * 0.02;
        rect(ctx, tone(m.wall, n), xx, yy, 2, 2);
      }
    }
    const r = rng(seed);
    for (let i = 0; i < w * h * 0.0012; i++) {
      const cx = x + r() * w;
      const cy = y + r() * h;
      ellipse(ctx, tone(m.wall, -0.1), cx, cy, 1.5 + r() * 2.5, 1 + r() * 1.5);
      ellipse(ctx, tone(m.wall, 0.05), cx - 0.4, cy - 0.4, 1 + r() * 1.5, 0.6 + r());
    }
    speckle(ctx, rgba('#6a5034', 0.12), x, y, w, h, Math.floor(w * h * 0.1), seed + 2);
  }
}

// ------------------------------------------------------------------ huecos

interface Opening {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Recercado de piedra del hueco: jambas, dintel con clave y el alféizar volado con su sombra. */
function surround(ctx: Ctx, m: Material, o: Opening, sill: boolean): void {
  const t = 1.6;
  rect(ctx, tone(m.trim, -0.08), o.x - t, o.y - t - 0.6, o.w + t * 2, t + 0.6);
  rect(ctx, m.trim, o.x - t, o.y - t - 0.6, o.w + t * 2, t);
  rect(ctx, tone(m.trim, 0.12), o.x - t, o.y - t - 0.6, o.w + t * 2, 0.45);
  // Clave del dintel.
  poly(ctx, tone(m.trim, 0.05), [o.x + o.w / 2 - 1.2, o.y - t - 1.2, o.x + o.w / 2 + 1.2, o.y - t - 1.2, o.x + o.w / 2 + 0.8, o.y - 0.4, o.x + o.w / 2 - 0.8, o.y - 0.4]);
  rect(ctx, m.trim, o.x - t, o.y, t, o.h);
  rect(ctx, tone(m.trim, 0.1), o.x - t, o.y, 0.45, o.h);
  rect(ctx, tone(m.trim, -0.12), o.x + o.w, o.y, t, o.h);
  if (sill) {
    rect(ctx, tone(m.trim, -0.15), o.x - t - 0.8, o.y + o.h, o.w + t * 2 + 1.6, 1.8);
    rect(ctx, tone(m.trim, 0.1), o.x - t - 0.8, o.y + o.h, o.w + t * 2 + 1.6, 0.6);
    // La sombra del alféizar sobre el muro y el churrete que deja la lluvia.
    vgrad(ctx, o.x - t - 0.4, o.y + o.h + 1.8, o.w + t * 2 + 0.8, 2.2, rgba('#120e1a', 0.35), rgba('#120e1a', 0));
    vgrad(ctx, o.x + 1, o.y + o.h + 2.5, o.w - 2, 6, rgba('#3d3226', 0.16), rgba('#3d3226', 0));
  }
}

/**
 * Ventana o balconera rehundida: el fondo del hueco en sombra, cristal con
 * reflejo, carpintería en cruz, cortina o persiana a medio bajar. Devuelve el
 * cristal (para encenderlo de noche).
 */
function windowIn(ctx: Ctx, m: Material, o: Opening, seed: number, door: boolean): Opening {
  const r = rng(seed);
  // Fondo del hueco (el grosor del muro) y su sombra: arriba y a la izquierda (luz del noroeste).
  rect(ctx, tone(m.wall, -0.45), o.x, o.y, o.w, o.h);
  const glass: Opening = { x: o.x + 1.1, y: o.y + 1.1, w: o.w - 1.6, h: o.h - 1.4 };
  // Cristal: un azul de cielo apagado con el reflejo diagonal.
  vgrad(ctx, glass.x, glass.y, glass.w, glass.h, '#5d7088', '#2d3746');
  const curtain = m.curtains[Math.floor(r() * m.curtains.length)];
  const style = r();
  if (style < 0.4) {
    // Cortinas recogidas a los lados.
    poly(ctx, rgba(curtain, 0.9), [glass.x, glass.y, glass.x + glass.w * 0.32, glass.y, glass.x + glass.w * 0.2, glass.y + glass.h, glass.x, glass.y + glass.h]);
    poly(ctx, rgba(curtain, 0.9), [glass.x + glass.w, glass.y, glass.x + glass.w * 0.68, glass.y, glass.x + glass.w * 0.8, glass.y + glass.h, glass.x + glass.w, glass.y + glass.h]);
    for (const k of [0.1, 0.2, 0.8, 0.9]) line(ctx, rgba(tone(curtain, -0.2), 0.6), 0.25, [glass.x + glass.w * k, glass.y, glass.x + glass.w * k, glass.y + glass.h]);
  } else if (style < 0.7) {
    // Visillo corrido: el cristal se ve lechoso.
    rect(ctx, rgba('#f2efe6', 0.45), glass.x, glass.y, glass.w, glass.h);
  }
  // Persiana enrollable a media altura (muy de Madrid), con su caja arriba.
  if (r() < 0.45) {
    const down = glass.h * (0.2 + r() * 0.45);
    rect(ctx, '#d8d0c0', glass.x - 0.2, glass.y, glass.w + 0.4, down);
    for (let yy = glass.y + 0.6; yy < glass.y + down; yy += 0.8) rect(ctx, '#b8ae9c', glass.x - 0.2, yy, glass.w + 0.4, 0.25);
    rect(ctx, '#9c927f', glass.x - 0.2, glass.y + down - 0.5, glass.w + 0.4, 0.5);
  }
  // Reflejo del cielo en diagonal.
  ctx.save();
  ctx.beginPath();
  ctx.rect(glass.x, glass.y, glass.w, glass.h);
  ctx.clip();
  poly(ctx, rgba('#ffffff', 0.16), [glass.x + glass.w * 0.25, glass.y, glass.x + glass.w * 0.55, glass.y, glass.x + glass.w * 0.05, glass.y + glass.h, glass.x - glass.w * 0.25, glass.y + glass.h]);
  ctx.restore();
  // Carpintería: marco, peinazo y montante.
  ctx.strokeStyle = m.joinery;
  ctx.lineWidth = 0.55;
  ctx.strokeRect(glass.x, glass.y, glass.w, glass.h);
  line(ctx, m.joinery, 0.5, [glass.x + glass.w / 2, glass.y, glass.x + glass.w / 2, glass.y + glass.h], 'butt');
  line(ctx, m.joinery, 0.45, [glass.x, glass.y + glass.h * (door ? 0.28 : 0.36), glass.x + glass.w, glass.y + glass.h * (door ? 0.28 : 0.36)], 'butt');
  // Sombra del dintel y de la jamba dentro del hueco (el muro tiene grosor).
  vgrad(ctx, o.x, o.y, o.w, 2.6, rgba('#0e0b12', 0.55), rgba('#0e0b12', 0));
  hgrad(ctx, o.x, o.y, 1.8, o.h, rgba('#0e0b12', 0.45), rgba('#0e0b12', 0));
  return glass;
}

/** Contraventanas de lamas abiertas a los lados del hueco. */
function shutters(ctx: Ctx, color: string, o: Opening): void {
  for (const [x, flip] of [[o.x - 1.6 - o.w * 0.48, false], [o.x + o.w + 1.6, true]] as const) {
    const w = o.w * 0.48;
    rect(ctx, tone(color, -0.25), x + 0.3, o.y + 0.3, w, o.h);
    rect(ctx, color, x, o.y, w, o.h);
    for (let yy = o.y + 1; yy < o.y + o.h - 0.5; yy += 1.1) rect(ctx, tone(color, -0.18), x + 0.5, yy, w - 1, 0.35);
    rect(ctx, tone(color, flip ? -0.12 : 0.12), flip ? x + w - 0.5 : x, o.y, 0.5, o.h);
  }
}

/**
 * Balcón volado: el forjado (losa con canto y su sombra sobre el muro de
 * abajo) y la barandilla de forja delante de la balconera, con macetas en
 * algunos.
 */
function balcony(ctx: Ctx, o: Opening, seed: number): void {
  const r = rng(seed);
  const x0 = o.x - 3.2;
  const x1 = o.x + o.w + 3.2;
  const slab = o.y + o.h;
  // Sombra que echa el vuelo sobre el muro de abajo (sureste).
  poly(ctx, rgba('#120e1a', 0.32), [x0 + 1.5, slab + 1.6, x1 + 2.2, slab + 1.6, x1 + 2.2, slab + 5.5, x0 + 3.2, slab + 4.2]);
  // Losa: canto con luz y panza en sombra; ménsulas debajo.
  rect(ctx, '#d8cfbd', x0, slab - 0.4, x1 - x0, 1.2);
  rect(ctx, '#f1eadb', x0, slab - 0.4, x1 - x0, 0.4);
  rect(ctx, '#7f7666', x0, slab + 0.8, x1 - x0, 0.9);
  for (const bx of [x0 + 1.4, x1 - 2.4]) poly(ctx, '#b3aa98', [bx, slab + 1.6, bx + 1, slab + 1.6, bx + 1, slab + 3.4]);
  // Barandilla: pasamanos, barrotes y el zócalo del balcón.
  const top = slab - 6.2;
  const iron = '#1f2421';
  rect(ctx, rgba('#0e0b12', 0.18), x0 + 0.6, top + 0.8, x1 - x0, 6);
  for (let x = x0 + 0.8; x < x1 - 0.4; x += 1.25) {
    line(ctx, iron, 0.38, [x, top + 0.4, x, slab - 0.4], 'butt');
    if (Math.round((x - x0) / 1.25) % 4 === 2) ellipse(ctx, 'transparent', x, top + 3, 0, 0);
  }
  // Una greca en S cada pocos barrotes.
  for (let x = x0 + 3; x < x1 - 3; x += 5) {
    ctx.strokeStyle = iron;
    ctx.lineWidth = 0.32;
    ctx.beginPath();
    ctx.arc(x, top + 2.2, 0.9, Math.PI * 0.2, Math.PI * 1.6);
    ctx.stroke();
  }
  rect(ctx, iron, x0 + 0.3, top, x1 - x0 - 0.6, 0.7);
  rect(ctx, rgba('#ffffff', 0.18), x0 + 0.3, top, x1 - x0 - 0.6, 0.2);
  // Macetas con geranios en algunos balcones.
  if (r() < 0.55) {
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const px = x0 + 1.5 + r() * (x1 - x0 - 4);
      rrect(ctx, '#a8553e', px, slab - 2.4, 2.4, 2, 0.4);
      for (let k = 0; k < 6; k++) ellipse(ctx, k % 3 ? '#4f7d3a' : '#6a9a4a', px + 1.2 + (r() - 0.5) * 3, slab - 3.4 - r() * 2.2, 0.9, 0.7);
      for (let k = 0; k < 3; k++) ellipse(ctx, r() < 0.5 ? '#d8423a' : '#f0e6d8', px + 1.2 + (r() - 0.5) * 2.6, slab - 4 - r() * 1.6, 0.45, 0.45);
    }
  }
}

// ------------------------------------------------------------------ planta baja

/** Portal de vecinos: puerta de madera de dos hojas con montante acristalado, recercado de piedra y el número. */
function portal(ctx: Ctx, m: Material, x: number, y: number, seed: number): Opening {
  const w = 13;
  const h = 34;
  const o = { x: x - w / 2, y: y - h, w, h };
  rect(ctx, tone(m.trim, -0.1), o.x - 2.2, o.y - 3, w + 4.4, h + 3);
  rect(ctx, m.trim, o.x - 2, o.y - 2.8, w + 4, 2.4);
  rect(ctx, tone(m.trim, 0.1), o.x - 2, o.y - 2.8, w + 4, 0.5);
  rect(ctx, '#140f16', o.x, o.y, w, h);
  // Montante de hierro y cristal.
  rect(ctx, '#2f3a46', o.x + 0.6, o.y + 0.6, w - 1.2, 6);
  for (let k = 1; k < 4; k++) line(ctx, '#1b1f1c', 0.4, [o.x + (w * k) / 4, o.y + 0.6, o.x + (w * k) / 4, o.y + 6.6], 'butt');
  ctx.strokeStyle = '#1b1f1c';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.arc(o.x + w / 2, o.y + 6.6, 4.2, Math.PI, 0);
  ctx.stroke();
  // Hojas de madera con cuarterones.
  const wood = '#5b3a24';
  for (const hx of [o.x + 0.6, o.x + w / 2 + 0.1]) {
    const hw = w / 2 - 0.7;
    rect(ctx, wood, hx, o.y + 7.2, hw, h - 7.4);
    for (const [py, ph] of [[o.y + 8.6, 10], [o.y + 20.4, 11.6]] as const) {
      rect(ctx, tone(wood, -0.25), hx + 1, py, hw - 2, ph);
      rect(ctx, tone(wood, 0.12), hx + 1.3, py + 0.3, hw - 2.6, ph - 0.6);
      rect(ctx, tone(wood, -0.05), hx + 1.6, py + 0.8, hw - 3.2, ph - 1.6);
    }
    rect(ctx, tone(wood, 0.2), hx, o.y + 7.2, 0.4, h - 7.4);
  }
  ellipse(ctx, '#d6b35a', o.x + w / 2 - 1.2, o.y + 20, 0.5, 0.5);
  ellipse(ctx, '#d6b35a', o.x + w / 2 + 1.2, o.y + 20, 0.5, 0.5);
  // Número en azulejo.
  rrect(ctx, '#f1ece0', o.x + w + 2.8, o.y + 4, 4.5, 3.6, 0.5);
  rrect(ctx, '#2f5f9e', o.x + w + 3.1, o.y + 4.3, 3.9, 3, 0.4);
  ctx.font = 'bold 2.4px sans-serif';
  ctx.fillStyle = '#f1ece0';
  ctx.textAlign = 'center';
  ctx.fillText(String(1 + (seed % 9)), o.x + w + 5.05, o.y + 6.7);
  // Escalón de piedra.
  rect(ctx, tone(m.trim, -0.05), o.x - 1.5, y - 1.2, w + 3, 1.2);
  rect(ctx, tone(m.trim, 0.15), o.x - 1.5, y - 1.2, w + 3, 0.35);
  vgrad(ctx, o.x, o.y + 7, w, 5, rgba('#0e0b12', 0.4), rgba('#0e0b12', 0));
  return o;
}

/**
 * Escaparate de local: marco de madera o aluminio, cristal hondo con el
 * interior encendido (barra, lámparas, estantes), rótulo en la faja y toldo.
 */
function shopfront(ctx: Ctx, b: BuildingDef, m: Material, x0: number, x1: number, base: number, doorX: number, glassOut: Opening[]): void {
  const cafe = b.style === 'cafe';
  const frame = cafe ? '#3d2a1e' : '#2f5b3e';
  const top = base - 33;
  // Faja del rótulo.
  rect(ctx, tone(frame, -0.2), x0, top - 6, x1 - x0, 6);
  rect(ctx, frame, x0 + 0.4, top - 5.6, x1 - x0 - 0.8, 5.2);
  rect(ctx, rgba('#ffffff', 0.14), x0 + 0.4, top - 5.6, x1 - x0 - 0.8, 0.45);
  ctx.font = cafe ? 'bold 3.4px serif' : 'bold 3.2px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = cafe ? '#e8c27a' : '#e9f2ea';
  ctx.fillText(cafe ? 'CAFÉ  ANDÉN' : 'FARMACIA', (x0 + x1) / 2, top - 1.8);
  // Marco y cristal hondo.
  rect(ctx, frame, x0, top, x1 - x0, base - top);
  const glass = { x: x0 + 1.4, y: top + 1.4, w: x1 - x0 - 2.8, h: base - top - 5 };
  // Interior: fondo cálido (café) o blanco frío (farmacia), con lo que hay dentro.
  vgrad(ctx, glass.x, glass.y, glass.w, glass.h, cafe ? '#6b4a33' : '#cfe0dc', cafe ? '#3a2618' : '#93aaa6');
  if (cafe) {
    // Barra, botellero y lámparas colgantes.
    rect(ctx, '#2a1a10', glass.x, glass.y + glass.h * 0.62, glass.w, glass.h * 0.38);
    rect(ctx, '#8a6a48', glass.x, glass.y + glass.h * 0.6, glass.w, 1.2);
    for (let x = glass.x + 2; x < glass.x + glass.w - 2; x += 2.2) rrect(ctx, ['#4a6a3a', '#7a2a2a', '#c9a13a'][Math.floor(hash(Math.floor(x), 3) * 3)], x, glass.y + glass.h * 0.3, 1, 3, 0.3);
    for (let x = glass.x + 6; x < glass.x + glass.w - 4; x += 12) {
      line(ctx, '#1a120c', 0.25, [x, glass.y, x, glass.y + 4]);
      ellipse(ctx, '#f6c870', x, glass.y + 4.6, 1.6, 1);
      ellipse(ctx, rgba('#ffd89a', 0.35), x, glass.y + 7, 4, 3);
    }
  } else {
    // Estanterías con cajitas y el mostrador.
    for (let y = glass.y + 3; y < glass.y + glass.h * 0.6; y += 4.2) {
      rect(ctx, '#f4f6f2', glass.x + 1, y, glass.w - 2, 0.5);
      for (let x = glass.x + 1.5; x < glass.x + glass.w - 2; x += 1.6) rect(ctx, ['#e05a5a', '#5a8ae0', '#f0f0e8', '#6ac08a'][Math.floor(hash(Math.floor(x * 3), Math.floor(y)) * 4)], x, y - 2.2, 1.1, 2.2);
    }
    rect(ctx, '#e8ece6', glass.x + 3, glass.y + glass.h * 0.66, glass.w - 6, glass.h * 0.34);
  }
  glassOut.push({ ...glass });
  // Reflejo de la calle en el cristal y montantes del marco.
  ctx.save();
  ctx.beginPath();
  ctx.rect(glass.x, glass.y, glass.w, glass.h);
  ctx.clip();
  for (let k = 0; k < 3; k++) poly(ctx, rgba('#ffffff', 0.1 + k * 0.03), [glass.x + glass.w * (0.1 + k * 0.32), glass.y, glass.x + glass.w * (0.2 + k * 0.32), glass.y, glass.x + glass.w * (0.04 + k * 0.32), glass.y + glass.h, glass.x + glass.w * (-0.06 + k * 0.32), glass.y + glass.h]);
  ctx.restore();
  for (let x = glass.x + glass.w / 3; x < glass.x + glass.w - 1; x += glass.w / 3) rect(ctx, frame, x - 0.4, glass.y, 0.8, glass.h);
  // Puerta acristalada en su sitio.
  const dx = doorX * TILE + 8;
  rect(ctx, tone(frame, -0.15), dx - 5, top + 1, 10, base - top - 1);
  vgrad(ctx, dx - 4, top + 2, 8, base - top - 3, cafe ? '#8a6040' : '#dfeee8', cafe ? '#4a3020' : '#a8bcb6');
  rect(ctx, '#c9b27a', dx + 2.3, top + 15, 0.5, 4);
  // Zócalo del escaparate.
  rect(ctx, tone(m.trim, -0.2), x0, base - 3.6, x1 - x0, 3.6);
  rect(ctx, tone(m.trim, -0.05), x0, base - 3.6, x1 - x0, 0.5);
  // Toldo: lona a rayas con su faldón ondulado; la sombra cae sobre el escaparate.
  if (cafe) awning(ctx, x0 - 1, x1 + 1, top - 1, ['#7a2a2a', '#efe6d2']);
  else {
    // La cruz verde en banderola: brilla de noche.
    greenCross(ctx, x1 - 5, top - 13);
  }
}

/** Toldo plegable visto en 3/4: lona inclinada hacia la calle, rayas, faldón y la sombra que echa. */
export function awning(ctx: Ctx, x0: number, x1: number, y: number, [a, b]: readonly [string, string]): void {
  const drop = 9;
  // Sombra sobre el escaparate.
  vgrad(ctx, x0, y + 1, x1 - x0, 12, rgba('#120e1a', 0.45), rgba('#120e1a', 0));
  const stripe = 3.2;
  for (let x = x0, i = 0; x < x1; x += stripe, i++) {
    const c = i % 2 ? b : a;
    poly(ctx, c, [x, y - 2, Math.min(x1, x + stripe), y - 2, Math.min(x1, x + stripe) + 0.6, y + drop, x + 0.6, y + drop]);
    poly(ctx, rgba('#000000', 0.12), [x, y + drop - 2.5, Math.min(x1, x + stripe), y + drop - 2.5, Math.min(x1, x + stripe) + 0.6, y + drop, x + 0.6, y + drop]);
  }
  rect(ctx, rgba('#ffffff', 0.18), x0, y - 2, x1 - x0, 0.6);
  // Faldón ondulado.
  for (let x = x0, i = 0; x < x1; x += stripe, i++) {
    ctx.fillStyle = i % 2 ? tone(b, -0.08) : tone(a, -0.08);
    ctx.beginPath();
    ctx.moveTo(x + 0.6, y + drop);
    ctx.lineTo(x + stripe + 0.6, y + drop);
    ctx.quadraticCurveTo(x + stripe / 2 + 0.6, y + drop + 3.2, x + 0.6, y + drop);
    ctx.fill();
  }
  line(ctx, '#2a2a2e', 0.4, [x0 + 0.6, y + drop, x1 + 0.6, y + drop], 'butt');
}

/** Cruz de farmacia en banderola: caja verde con su soporte. */
function greenCross(ctx: Ctx, x: number, y: number): void {
  line(ctx, '#2a2e2b', 0.7, [x - 3, y + 6, x + 1, y + 6], 'butt');
  rrect(ctx, '#1d3a26', x, y, 10, 10, 1);
  const g = '#3bd16a';
  rect(ctx, g, x + 3.6, y + 1.5, 2.8, 7);
  rect(ctx, g, x + 1.5, y + 3.6, 7, 2.8);
  rect(ctx, rgba('#ffffff', 0.35), x + 3.6, y + 1.5, 2.8, 0.6);
}

/** Lo que brilla de noche en una fachada (para world/Lighting): rótulos y la cruz. */
export interface HdGlow {
  x: number;
  y: number;
  w: number;
  h: number;
  draw: (ctx: Ctx) => void;
}

// ------------------------------------------------------------------ casa

/**
 * Pinta una casa entera (fachada sur, de su fila de arriba a la de la puerta)
 * en el lienzo HD y devuelve los cristales que pueden encenderse y lo que brilla.
 */
export function drawHdBuilding(ctx: Ctx, b: BuildingDef, seed: number): { windows: WindowSpot[]; glows: HdGlow[] } {
  const m = materialOf(b);
  const x0 = b.tx * TILE;
  const x1 = (b.tx + b.w) * TILE;
  const top = b.ty * TILE;
  const base = (b.ty + b.h) * TILE;
  const w = x1 - x0;
  const windows: WindowSpot[] = [];
  const glows: HdGlow[] = [];
  const spot = (o: Opening, shop: boolean): void => {
    windows.push({ x: o.x, y: o.y, w: o.w, h: o.h, building: b.id, shop, tone: shop ? 0xffd89a : 0xffc27a });
  };

  // Muro entero y zócalo.
  wallTexture(ctx, m, x0, top, w, base - top, seed);
  // Humedad del zócalo y hollín bajo la cornisa: el edificio tiene años.
  vgrad(ctx, x0, base - 14, w, 14, rgba('#2a2018', 0), rgba('#2a2018', 0.22));
  vgrad(ctx, x0, top + CORNICE, w, 10, rgba('#2a2420', 0.18), rgba('#2a2420', 0));

  const ground = base - GROUND_FLOOR;
  // Imposta entre planta baja y principal.
  rect(ctx, tone(m.trim, -0.15), x0, ground - 3, w, 3.4);
  rect(ctx, m.trim, x0, ground - 3, w, 2.4);
  rect(ctx, tone(m.trim, 0.14), x0, ground - 3, w, 0.5);
  vgrad(ctx, x0, ground + 0.4, w, 3, rgba('#120e1a', 0.3), rgba('#120e1a', 0));

  // Ritmo de huecos: crujías de unos 22 px, centradas.
  const bays = Math.max(2, Math.round(w / 22));
  const bayW = w / bays;
  const centers = Array.from({ length: bays }, (_, i) => x0 + bayW * (i + 0.5));

  // Plantas: de abajo arriba, principal (con balcones), segunda, tercera.
  for (let f = 0; f < 3; f++) {
    const fy = ground - 3 - FLOOR * (f + 1);
    if (fy < top + CORNICE) break;
    centers.forEach((cx, i) => {
      const center = Math.abs(i - (bays - 1) / 2) <= 0.6;
      const hasBalcony = m.balconies === 'all' || (m.balconies === 'center' && center) || (m.balconies === 'first' && f === 0);
      const ow = 8.4;
      const oh = hasBalcony ? 16.5 : 12.5;
      const o = { x: cx - ow / 2, y: fy + (hasBalcony ? 3.2 : 4.4), w: ow, h: oh };
      surround(ctx, m, o, !hasBalcony);
      const glass = windowIn(ctx, m, o, seed * 31 + f * 7 + i, hasBalcony);
      if (m.shutter && !hasBalcony) shutters(ctx, m.shutter, o);
      if (hasBalcony) balcony(ctx, o, seed * 17 + f * 5 + i);
      spot(glass, false);
    });
    // Línea de forjado: una moldura fina entre plantas.
    rect(ctx, rgba('#120e1a', 0.1), x0, fy + FLOOR - 0.6, w, 0.6);
  }

  // Cornisa: vuelo con ménsulas y su sombra; el alero remata contra el cielo.
  rect(ctx, tone(m.trim, -0.18), x0, top, w, CORNICE);
  rect(ctx, m.trim, x0, top, w, CORNICE - 2);
  rect(ctx, tone(m.trim, 0.14), x0, top, w, 0.6);
  for (let x = x0 + 3; x < x1 - 2; x += 6) {
    rect(ctx, tone(m.trim, -0.06), x, top + CORNICE - 2, 2, 2.4);
    rect(ctx, tone(m.trim, 0.1), x, top + CORNICE - 2, 0.5, 2.4);
  }
  vgrad(ctx, x0, top + CORNICE + 0.4, w, 4, rgba('#120e1a', 0.35), rgba('#120e1a', 0));

  // Planta baja.
  const doorX = (b.doorX ?? b.tx + Math.floor(b.w / 2)) * TILE + 8;
  if (b.style === 'cafe' || b.style === 'pharmacy') {
    const shopGlass: Opening[] = [];
    const sx0 = x0 + 4;
    const sx1 = x1 - 4;
    shopfront(ctx, b, m, sx0, sx1, base, b.doorX ?? b.tx + 1, shopGlass);
    // El escaparate de noche no es un rectángulo de color: es el local encendido, más luz arriba, la barra en sombra.
    const [hi, lo] = b.style === 'pharmacy' ? ['#effff6', '#9fe0c0'] : ['#ffe2a8', '#e89a4a'];
    for (const g of shopGlass) {
      glows.push({ x: g.x, y: g.y, w: g.w, h: g.h, draw: (c) => {
        vgrad(c, g.x, g.y, g.w, g.h, rgba(hi, 0.5), rgba(lo, 0.16));
        rect(c, rgba('#ffffff', 0.35), g.x, g.y, g.w, 0.5);
        for (let x = g.x + 3; x < g.x + g.w - 2; x += 7) ellipse(c, rgba('#fff4d0', 0.55), x, g.y + 1.6, 1.2, 0.7);
      } });
    }
    if (b.style === 'pharmacy') {
      const cx = sx1 - 5;
      const cy = base - 33 - 13;
      glows.push({ x: cx - 1, y: cy - 1, w: 12, h: 12, draw: (g) => greenCross(g, cx, cy) });
    } else {
      glows.push({ x: sx0, y: base - 40, w: sx1 - sx0, h: 6, draw: (g) => {
        g.font = 'bold 3.4px serif';
        g.textAlign = 'center';
        g.fillStyle = '#ffd890';
        g.fillText('CAFÉ  ANDÉN', (sx0 + sx1) / 2, base - 33 - 1.8);
      } });
    }
  } else {
    // Portal de vecinos y, a los lados, ventanas de planta baja con reja.
    const o = portal(ctx, m, doorX, base, seed);
    spot({ x: o.x + 0.6, y: o.y + 0.6, w: o.w - 1.2, h: 6 }, false);
    // Farolillo junto al portal.
    rect(ctx, '#1f2421', doorX + 9, base - 30, 0.6, 3);
    rrect(ctx, '#2a2e2b', doorX + 8.2, base - 27.5, 2.2, 3, 0.4);
    rect(ctx, '#f6d28a', doorX + 8.6, base - 27, 1.4, 2);
    glows.push({ x: doorX + 7.5, y: base - 28.5, w: 4, h: 5, draw: (g) => rect(g, '#ffe0a0', doorX + 8.6, base - 27, 1.4, 2) });
    centers.forEach((cx, i) => {
      if (Math.abs(cx - doorX) < 16) return;
      const ow = 8.4;
      const oh = 15;
      const oo = { x: cx - ow / 2, y: ground + 7, w: ow, h: oh };
      surround(ctx, m, oo, true);
      const glass = windowIn(ctx, m, oo, seed * 13 + i, false);
      // Reja de forja de planta baja.
      for (let x = oo.x + 0.8; x < oo.x + oo.w; x += 1.4) line(ctx, '#1f2421', 0.35, [x, oo.y - 0.4, x, oo.y + oo.h + 0.4], 'butt');
      rect(ctx, '#1f2421', oo.x - 0.6, oo.y + oo.h * 0.5, oo.w + 1.2, 0.4);
      spot(glass, false);
    });
  }
  // Zócalo de piedra.
  rect(ctx, tone(m.trim, -0.22), x0, base - 4, w, 4);
  rect(ctx, tone(m.trim, -0.08), x0, base - 4, w, 0.6);
  speckle(ctx, rgba('#2a241e', 0.3), x0, base - 4, w, 4, w * 2, seed + 9);

  // Bajantes en las medianeras, con sus abrazaderas y el codo al pie.
  for (const px of [x0 + 1.2, x1 - 2.6]) {
    rect(ctx, '#4a4f4c', px, top + 2, 1.4, base - top - 4);
    rect(ctx, rgba('#ffffff', 0.18), px, top + 2, 0.4, base - top - 4);
    for (let y = top + 10; y < base - 6; y += 14) rect(ctx, '#2a2e2b', px - 0.3, y, 2, 0.7);
    rect(ctx, '#4a4f4c', px - 0.6, base - 3, 2.6, 1.4);
  }
  // Medianera: una línea de sombra entre casas.
  rect(ctx, rgba('#120e1a', 0.35), x1 - 0.5, top, 0.5, base - top);
  softShadow(ctx, (x0 + x1) / 2, base + 1, w * 0.52, 2.2, 0.0);
  return { windows, glows };
}

/** Separación de color: una casa al lado de otra no se funde (la luz del día cambia un poco por material). */
export const facadeTone = (m: Material): string => blend(m.wall, m.trim, 0.3);
