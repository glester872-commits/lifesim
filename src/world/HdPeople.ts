import Phaser from 'phaser';
import type { Facing } from '../types/game';
import type { HumanColors, Pose } from './HumanArt';
import { blend, ellipse, HD, HD_SCALE, line, outlined, poly, rgba, rrect, tone, type Ctx } from './HdKit';

/**
 * Personas en alta definición (Visual V3, design/VISUAL_V3.md): las mismas
 * caras, ropa, peinados y poses que world/HumanArt, dibujadas a 4× con cuerpo
 * articulado (hombros, codos, caderas, rodillas), proporciones de adulto,
 * capas de ropa con sus sombras, cara con rasgos y un contorno limpio que las
 * separa del fondo. Miden 28 px de mundo de los pies a la coronilla (≈ 1,75 m):
 * más presencia que las de 24, sin salirse de la escala de puertas y coches.
 *
 * Luz del noroeste, como el resto del mundo: lado izquierdo claro, derecho en
 * sombra. Perfil izquierdo = derecho en espejo.
 *
 * Las celdas se dibujan cuando hacen falta (la primera vez que alguien adopta
 * esa pose) en hojas de atlas que crecen solas: la escena sólo paga por la
 * gente que de verdad se ve.
 */

/** Celda de una persona en px de mundo: un poco más ancha que el cuerpo, por brazos, bolso y paraguas. */
export const HD_PERSON_W = 18;
export const HD_PERSON_H = 30;
/** Pies: la base de la celda (el origen del sprite es el centro de abajo). */
const FOOT = HD_PERSON_H - 0.5;
const CX = HD_PERSON_W / 2;
const OUTLINE = '#1b1520';

// ------------------------------------------------------------- poses

type Legs = 'stand' | 'stepA' | 'stepB' | 'sit' | 'floor' | 'squat' | 'pedalA' | 'pedalB';
type Arm = 'down' | 'fwd' | 'back' | 'phone' | 'mouth' | 'up' | 'photo' | 'curl' | 'rest' | 'reach';

interface PoseSpec {
  legs: Legs;
  /** Cuánto baja el tronco (respirar, apoyarse). */
  drop: number;
  armNear: Arm;
  armFar: Arm;
}

/** Cada pose de HumanArt, como posición del cuerpo. */
function spec(pose: Pose): PoseSpec {
  switch (pose) {
    case 1: return { legs: 'stepA', drop: 0.25, armNear: 'back', armFar: 'fwd' };
    case 2: return { legs: 'stepB', drop: 0.25, armNear: 'fwd', armFar: 'back' };
    case 3: return { legs: 'stand', drop: 0.3, armNear: 'down', armFar: 'down' };
    case 4: return { legs: 'sit', drop: 0, armNear: 'rest', armFar: 'rest' };
    case 5: return { legs: 'stand', drop: 0, armNear: 'phone', armFar: 'phone' };
    case 6: return { legs: 'stand', drop: 0, armNear: 'up', armFar: 'up' };
    case 7: return { legs: 'stand', drop: 0, armNear: 'up', armFar: 'down' };
    case 11: case 12: return { legs: 'floor', drop: 0, armNear: 'rest', armFar: 'rest' };
    case 13: return { legs: 'pedalA', drop: 0, armNear: 'reach', armFar: 'reach' };
    case 14: return { legs: 'pedalB', drop: 0, armNear: 'reach', armFar: 'reach' };
    case 15: return { legs: 'stand', drop: 0, armNear: 'down', armFar: 'down' };
    case 16: return { legs: 'stand', drop: 0, armNear: 'curl', armFar: 'curl' };
    case 17: return { legs: 'stand', drop: 0, armNear: 'up', armFar: 'up' };
    case 18: return { legs: 'squat', drop: 0, armNear: 'up', armFar: 'up' };
    case 19: return { legs: 'sit', drop: 0, armNear: 'curl', armFar: 'curl' };
    case 20: return { legs: 'sit', drop: 0, armNear: 'reach', armFar: 'reach' };
    case 21: return { legs: 'stand', drop: 0, armNear: 'up', armFar: 'up' };
    case 22: return { legs: 'floor', drop: 0, armNear: 'reach', armFar: 'reach' };
    case 23: return { legs: 'stand', drop: 0, armNear: 'up', armFar: 'up' };
    case 24: return { legs: 'sit', drop: 0.3, armNear: 'rest', armFar: 'rest' };
    case 25: return { legs: 'sit', drop: 0, armNear: 'phone', armFar: 'phone' };
    case 26: return { legs: 'sit', drop: 0, armNear: 'mouth', armFar: 'rest' };
    case 32: return { legs: 'stand', drop: 0, armNear: 'mouth', armFar: 'down' };
    case 33: return { legs: 'sit', drop: 0, armNear: 'mouth', armFar: 'rest' };
    case 34: return { legs: 'stand', drop: 0, armNear: 'photo', armFar: 'photo' };
    default: return { legs: 'stand', drop: 0, armNear: 'down', armFar: 'down' };
  }
}

// ------------------------------------------------------------- cuerpo

interface Body {
  /** Escala vertical (estatura) y anchos (complexión). */
  tall: number;
  shoulders: number;
  waist: number;
  hips: number;
  stoop: number;
}

function bodyOf(c: HumanColors): Body {
  const tall = c.height === 'short' ? 0.94 : c.height === 'tall' ? 1.05 : 1;
  const b = c.build ?? 'average';
  const sh = { thin: 0.88, average: 1, athletic: 1.1, muscular: 1.16, stocky: 1.1, curvy: 0.98, heavy: 1.14 }[b];
  const wa = { thin: 0.85, average: 1, athletic: 0.95, muscular: 1.05, stocky: 1.18, curvy: 0.92, heavy: 1.3 }[b];
  const hi = { thin: 0.9, average: 1, athletic: 0.98, muscular: 1.02, stocky: 1.1, curvy: 1.18, heavy: 1.24 }[b];
  return { tall, shoulders: sh, waist: wa, hips: hi, stoop: c.posture === 'stooped' ? 0.6 : c.posture === 'relaxed' ? 0.25 : 0 };
}

/** Las alturas del cuerpo de pie, en px de mundo desde arriba de la celda. */
interface Frame {
  hip: number;
  shoulder: number;
  neck: number;
  headY: number;
  headR: number;
}

function frameOf(b: Body, drop: number, seatedDrop: number): Frame {
  const k = b.tall;
  const hip = FOOT - 1.6 - 9.6 * k + seatedDrop;
  const shoulder = hip - 7.8 * k + drop;
  const neck = shoulder - 1.1;
  const headR = 2.85;
  return { hip: hip + drop, shoulder, neck, headY: neck - headR - 0.3 + b.stoop * 0.4, headR };
}

const darker = (c: string, k = 0.22): string => tone(c, -k);
const lighter = (c: string, k = 0.14): string => tone(c, k);

/** Un miembro: tramo grueso con su luz a la izquierda y su sombra a la derecha. */
function limb(ctx: Ctx, color: string, width: number, pts: readonly number[]): void {
  line(ctx, darker(color, 0.18), width, pts);
  ctx.save();
  ctx.translate(-width * 0.12, 0);
  line(ctx, color, width * 0.78, pts);
  ctx.restore();
  ctx.save();
  ctx.translate(-width * 0.26, -0.05);
  line(ctx, lighter(color, 0.1), width * 0.28, pts);
  ctx.restore();
}

/** Brazo de hombro a mano: manga hasta donde llegue, luego piel y la mano. */
function arm(ctx: Ctx, c: HumanColors, sx: number, sy: number, ex: number, ey: number, hx: number, hy: number, far: boolean): void {
  const sleeve = far ? darker(c.sleeves ?? c.cloth, 0.12) : c.sleeves ?? c.cloth;
  const skin = far ? darker(c.skin, 0.1) : c.skin;
  // sleeveLen (0–5 en HumanArt): 5 o sin dato, manga larga; 0, tirantes.
  const len = c.sleeveLen ?? 5;
  const k = len / 5;
  const pts = [sx, sy, ex, ey, hx, hy];
  limb(ctx, skin, 1.55, pts);
  if (k > 0) {
    // La manga cubre una parte del recorrido: la parte de arriba hasta el codo y, larga, el antebrazo.
    if (k >= 0.9) limb(ctx, sleeve, 1.85, [sx, sy, ex, ey, hx + (ex - hx) * 0.18, hy + (ey - hy) * 0.18]);
    else {
      const t = Math.min(1, k * 1.6);
      limb(ctx, sleeve, 1.9, [sx, sy, sx + (ex - sx) * t, sy + (ey - sy) * t]);
    }
  }
  const ink = c.ink?.find((i) => i.spot === (far ? 'arm-l' : 'arm-r'))?.color;
  if (ink && k < 0.9) ellipse(ctx, rgba(ink, 0.7), (ex + hx) / 2, (ey + hy) / 2, 0.45, 0.6);
  ellipse(ctx, darker(skin, 0.12), hx, hy + 0.15, 0.95, 1.0);
  ellipse(ctx, skin, hx - 0.15, hy, 0.8, 0.85);
}

/** Pierna de cadera a tobillo y el zapato. `dir`: hacia dónde apunta el pie (de perfil). */
function leg(ctx: Ctx, c: HumanColors, hx: number, hy: number, kx: number, ky: number, ax: number, ay: number, far: boolean, dir: number, w = 2.35): void {
  const tr = far ? darker(c.trousers, 0.14) : c.trousers;
  limb(ctx, tr, w, [hx, hy, kx, ky, ax, ay]);
  if (c.spots) {
    for (let i = 0; i < 4; i++) {
      const t = 0.15 + i * 0.22;
      const x = i < 2 ? hx + (kx - hx) * t * 2 : kx + (ax - kx) * (t - 0.4) * 2;
      const y = i < 2 ? hy + (ky - hy) * t * 2 : ky + (ay - ky) * (t - 0.4) * 2;
      ellipse(ctx, rgba(c.spots, 0.85), x + (i % 2 ? 0.4 : -0.4), y, 0.35, 0.3);
    }
  }
  // Zapato: suela clara, empeine con su brillo.
  const shoe = far ? darker(c.shoes, 0.12) : c.shoes;
  const len = dir === 0 ? 1.3 : 2.4;
  const sx = ax + dir * 0.6;
  rrect(ctx, darker(shoe, 0.25), sx - len, ay - 0.2, len * 2, 1.7, 0.7);
  rrect(ctx, shoe, sx - len + 0.15, ay - 0.35, len * 2 - 0.3, 1.35, 0.65);
  rrect(ctx, lighter(shoe, 0.35), sx - len + 0.3, ay + 1.0, len * 2 - 0.6, 0.35, 0.15);
  ellipse(ctx, rgba('#ffffff', 0.18), sx - len * 0.4, ay + 0.1, len * 0.45, 0.25);
}

// ------------------------------------------------------------- cabeza

function hairBack(ctx: Ctx, c: HumanColors, f: Frame, side: boolean, back: boolean): void {
  if (c.hood) return;
  const h = c.hair;
  const x = CX + (side ? -0.4 : 0);
  const y = f.headY;
  const r = f.headR;
  switch (c.hairStyle) {
    case 'long':
      poly(ctx, darker(h, 0.15), [x - r - 0.3, y - 0.5, x + r + 0.3, y - 0.5, x + r + 0.6, y + r + 4.6, x - r - 0.6, y + r + 4.6]);
      break;
    case 'braids':
    case 'locs':
      for (let i = -2; i <= 2; i++) line(ctx, darker(h, 0.1 + (i % 2) * 0.06), 0.9, [x + i * 1.1, y, x + i * 1.25, y + r + 4.8]);
      break;
    case 'bob':
      ellipse(ctx, darker(h, 0.15), x, y + 0.9, r + 0.75, r + 0.6);
      break;
    case 'afro':
      ellipse(ctx, darker(h, 0.12), x, y - 0.4, r + 2.2, r + 1.9);
      break;
    case 'ponytail':
      if (back || side) line(ctx, darker(h, 0.1), 1.3, [x + (side ? -r : 0), y + 0.2, x + (side ? -r - 1.2 : 0), y + r + 2.8]);
      break;
    default:
      break;
  }
}

/** Cara, pelo, gorra o capucha, gafas y pendientes. `side`: de perfil (mirando a la derecha); `back`: de espaldas. */
function head(ctx: Ctx, c: HumanColors, f: Frame, side: boolean, back: boolean): void {
  const r = f.headR;
  const x = CX + (side ? 0.3 : 0);
  const y = f.headY;
  const skin = c.skin;
  const hood = c.hood;
  // Cuello y cabeza.
  rrect(ctx, darker(skin, 0.18), CX - 0.95, f.neck - 0.4, 1.9, 1.9, 0.5);
  if (hood) ellipse(ctx, darker(hood, 0.18), x, y + 0.3, r + 1.2, r + 1.15);
  ellipse(ctx, darker(skin, 0.14), x + 0.15, y + 0.15, r, r * 1.06);
  ellipse(ctx, skin, x - 0.15, y - 0.05, r * 0.92, r * 0.98);
  if (!back) {
    if (side) {
      // Perfil: nariz, ojo, oreja, boca.
      poly(ctx, skin, [x + r - 0.4, y - 0.4, x + r + 0.75, y + 0.65, x + r - 0.2, y + 0.95]);
      ellipse(ctx, '#2a2026', x + r * 0.42, y - 0.25, 0.32, 0.42);
      ellipse(ctx, darker(skin, 0.2), x - r * 0.25, y + 0.2, 0.6, 0.85);
      line(ctx, darker(skin, 0.35), 0.28, [x + r * 0.35, y + 1.5, x + r * 0.7, y + 1.45]);
      if (c.brows) line(ctx, darker(c.hair, 0.1), c.brows === 'thick' ? 0.45 : 0.25, [x + r * 0.2, y - 1.05, x + r * 0.72, y - 1.0]);
      if (c.earrings) ellipse(ctx, c.earrings, x - r * 0.25, y + 1.05, 0.28, 0.28);
    } else {
      // De frente: dos ojos con su brillo, cejas, la sombra de la nariz y la boca.
      for (const s of [-1, 1]) {
        ellipse(ctx, '#2a2026', x + s * 1.05, y - 0.15, 0.36, 0.46);
        ellipse(ctx, rgba('#ffffff', 0.6), x + s * 1.05 - 0.12, y - 0.32, 0.1, 0.1);
        line(ctx, darker(c.hair, 0.05), c.brows === 'thick' ? 0.42 : 0.26, [x + s * 0.55, y - 1.15, x + s * 1.55, y - 1.05 - (c.brows === 'fine' ? 0.1 : 0)]);
        ellipse(ctx, darker(skin, 0.12), x + s * (r - 0.15), y + 0.3, 0.42, 0.75);
        if (c.earrings) ellipse(ctx, c.earrings, x + s * (r - 0.05), y + 1.2, 0.28, 0.28);
      }
      line(ctx, darker(skin, 0.2), 0.3, [x + 0.05, y + 0.2, x + 0.25, y + 0.95]);
      line(ctx, darker(skin, 0.38), 0.32, [x - 0.55, y + 1.55, x + 0.55, y + 1.55]);
      ellipse(ctx, rgba('#d0605a', 0.14), x - 1.4, y + 0.85, 0.6, 0.35);
      ellipse(ctx, rgba('#d0605a', 0.14), x + 1.4, y + 0.85, 0.6, 0.35);
      if (c.glasses) {
        const g = c.glasses === 'dark' ? '#15131a' : rgba('#d8e8f0', 0.35);
        for (const s of [-1, 1]) {
          ctx.strokeStyle = '#2a2430';
          ctx.lineWidth = 0.22;
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.roundRect(x + s * 1.05 - 0.75, y - 0.65, 1.5, 1.05, 0.3);
          ctx.fill();
          ctx.stroke();
        }
      }
      if (c.piercing === 'nose') ellipse(ctx, '#e8e4dc', x + 0.35, y + 0.75, 0.13, 0.13);
    }
    // Barba, bigote, sombra de barba.
    if (c.facialHair === 'beard') poly(ctx, darker(c.hair, 0.05), side ? [x + 0.2, y + 0.9, x + r, y + 1.0, x + r - 0.4, y + r + 0.4, x - 0.2, y + r - 0.2] : [x - r + 0.3, y + 0.6, x + r - 0.3, y + 0.6, x + 1.2, y + r + 0.5, x - 1.2, y + r + 0.5]);
    else if (c.facialHair === 'moustache') line(ctx, darker(c.hair, 0.05), 0.42, side ? [x + r * 0.35, y + 1.2, x + r * 0.75, y + 1.2] : [x - 0.75, y + 1.25, x + 0.75, y + 1.25]);
    else if (c.facialHair === 'stubble') ellipse(ctx, rgba(c.hair, 0.22), x + (side ? r * 0.35 : 0), y + 1.6, side ? 1.3 : 1.9, 0.9);
  }
  // El pelo de arriba (o la capucha, o la gorra).
  if (hood) {
    poly(ctx, hood, [x - r - 0.7, y + 1.5, x - r - 0.4, y - r + 0.2, x, y - r - 0.9, x + r + 0.4, y - r + 0.2, x + r + 0.7, y + 1.5, x + r - 0.5, y + 0.2, x + r - 0.6, y - 1.6, x, y - r + 0.6, x - r + 0.6, y - 1.6, x - r + 0.5, y + 0.2]);
    if (back) ellipse(ctx, hood, x, y, r + 1.1, r + 1.1);
    return;
  }
  hairTop(ctx, c, x, y, r, side, back);
  if (c.cap) {
    const cap = c.cap;
    ellipse(ctx, darker(cap, 0.12), x, y - r * 0.45, r + 0.25, r * 0.7);
    ellipse(ctx, cap, x - 0.25, y - r * 0.55, r - 0.1, r * 0.55);
    if (!back) {
      if (side) poly(ctx, darker(cap, 0.25), [x + r * 0.3, y - r * 0.25, x + r + 2.2, y - r * 0.05, x + r + 2.0, y + 0.25, x + r * 0.3, y - 0.1]);
      else ellipse(ctx, darker(cap, 0.28), x, y - r * 0.2, r + 0.7, 0.75);
    }
  }
  if (c.headphones) {
    line(ctx, c.headphones, 0.55, [x - r - 0.1, y, x - r * 0.5, y - r - 0.3, x + r * 0.5, y - r - 0.3, x + r + 0.1, y]);
    ellipse(ctx, c.headphones, side ? x - r * 0.25 : x - r - 0.1, y + 0.2, 0.75, 1.0);
    if (!side) ellipse(ctx, c.headphones, x + r + 0.1, y + 0.2, 0.75, 1.0);
  }
}

/** El pelo encima de la cabeza, por peinado. */
function hairTop(ctx: Ctx, c: HumanColors, x: number, y: number, r: number, side: boolean, back: boolean): void {
  const h = c.hair;
  const dark = darker(h, 0.18);
  const lit = lighter(h, 0.18);
  const style = c.hairStyle ?? 'short';
  if (style === 'bald') {
    ellipse(ctx, rgba('#ffffff', 0.18), x - 0.9, y - r * 0.6, 0.9, 0.5);
    return;
  }
  const cover = back ? 1 : 0;
  // El casco del pelo: más bajo de espaldas (tapa la nuca) y con flequillo de frente.
  const cap = (extra: number, low: number): void => {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(x + 0.15, y - 0.35, r + extra + 0.15, r + extra + 0.1, 0, Math.PI, 0);
    ctx.lineTo(x + r + extra, y + low);
    ctx.lineTo(x - r - extra, y + low);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = h;
    ctx.beginPath();
    ctx.ellipse(x - 0.1, y - 0.5, r + extra - 0.1, r + extra - 0.15, 0, Math.PI, 0);
    ctx.lineTo(x - r - extra + 0.1, y - 0.5);
    ctx.closePath();
    ctx.fill();
  };
  switch (style) {
    case 'buzz':
      cap(0.05, back ? 0.8 : -1.4);
      break;
    case 'short':
    case 'ponytail':
    case 'bun':
      cap(0.35, back ? 1.6 : -0.9);
      if (!back && !side) poly(ctx, h, [x - r - 0.2, y - 0.6, x + 0.6, y - r - 0.1, x + r * 0.9, y - 1.0, x + 0.4, y - 1.5]);
      if (side && !back) poly(ctx, h, [x - r - 0.3, y - 0.2, x + r * 0.6, y - r - 0.2, x + r * 0.75, y - 1.2, x - r * 0.3, y + 0.6]);
      if (style === 'bun') {
        ellipse(ctx, dark, x - (side ? 1.2 : 0), y - r - 1.0, 1.55, 1.35);
        ellipse(ctx, h, x - (side ? 1.4 : 0.2), y - r - 1.2, 1.2, 1.0);
      }
      break;
    case 'curly':
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + (i / 8) * Math.PI;
        ellipse(ctx, i % 2 ? dark : h, x + Math.cos(a) * (r + 0.4), y - 0.4 + Math.sin(a) * (r + 0.3), 1.15, 1.1);
      }
      cap(0.4, back ? 1.8 : -1.0);
      break;
    case 'afro':
      ellipse(ctx, dark, x, y - 0.6, r + 2.0, r + 1.7);
      ellipse(ctx, h, x - 0.3, y - 0.95, r + 1.6, r + 1.35);
      if (!back) ellipse(ctx, rgba('#000000', 0), x, y, 0, 0);
      break;
    case 'bob':
    case 'long':
    case 'braids':
    case 'locs':
      cap(0.45, back ? 2.6 : -0.6);
      if (!back) {
        // Melena a los lados de la cara.
        const l = style === 'bob' ? 2.4 : 4.4;
        if (!side) {
          poly(ctx, dark, [x - r - 0.5, y - 0.8, x - r + 0.7, y - 0.6, x - r + 0.6, y + l, x - r - 0.6, y + l - 0.4]);
          poly(ctx, dark, [x + r + 0.5, y - 0.8, x + r - 0.7, y - 0.6, x + r - 0.6, y + l, x + r + 0.6, y + l - 0.4]);
        } else poly(ctx, dark, [x - r - 0.5, y - 0.8, x - r * 0.1, y - 0.6, x - r * 0.3, y + l, x - r - 0.7, y + l]);
        poly(ctx, h, [x - r, y - 0.9, x + 0.2, y - r - 0.2, x + r * 0.95, y - 1.1, x - 0.3, y - 1.9]);
      }
      if (style === 'braids' || style === 'locs') for (let i = -2; i <= 2; i++) ellipse(ctx, lit, x + i * 1.0, y - r * 0.55 + Math.abs(i) * 0.35, 0.3, 0.25);
      break;
    default:
      cap(0.3, -1);
  }
  // Brillo del pelo arriba a la izquierda.
  ellipse(ctx, rgba(lit, 0.8), x - r * 0.35, y - r * 0.72 - cover * 0.1, r * 0.4, 0.42);
}

// ------------------------------------------------------------- tronco

/** El tronco con la ropa: hombros redondeados, cintura, bajo; luz a la izquierda y sombra a la derecha. */
function torso(ctx: Ctx, c: HumanColors, b: Body, f: Frame, side: boolean, back: boolean): void {
  const half = side ? 2.25 * b.waist : 3.55 * b.shoulders;
  const waist = side ? 2.05 * b.waist : 2.85 * b.waist;
  const hem = f.hip + 0.6;
  const top = f.shoulder;
  const cx = CX + (side ? -0.2 + b.stoop * 0.3 : 0);
  const body = (): void => {
    ctx.beginPath();
    ctx.moveTo(cx - half + 0.7, top - 0.15);
    ctx.quadraticCurveTo(cx - half - 0.1, top + 0.1, cx - half, top + 1.4);
    ctx.lineTo(cx - waist, hem - 1.8);
    ctx.lineTo(cx - waist - 0.15 * b.hips, hem);
    ctx.lineTo(cx + waist + 0.15 * b.hips, hem);
    ctx.lineTo(cx + waist, hem - 1.8);
    ctx.lineTo(cx + half, top + 1.4);
    ctx.quadraticCurveTo(cx + half + 0.1, top + 0.1, cx + half - 0.7, top - 0.15);
    ctx.closePath();
  };
  ctx.fillStyle = c.cloth;
  body();
  ctx.fill();
  ctx.save();
  body();
  ctx.clip();
  // Sombra del lado derecho y del bajo; luz del hombro izquierdo.
  ctx.fillStyle = c.clothDark;
  ctx.fillRect(cx + half * 0.35, top - 1, half, hem - top + 2);
  ctx.fillStyle = rgba(c.clothDark, 0.55);
  ctx.fillRect(cx - half, hem - 1.2, half * 2, 1.2);
  ctx.fillStyle = rgba('#ffffff', 0.13);
  ctx.fillRect(cx - half, top - 1, half * 0.55, hem - top + 2);
  // Pliegues: dos trazos suaves a la altura de la cintura.
  line(ctx, rgba(c.clothDark, 0.6), 0.25, [cx - waist * 0.5, hem - 2.4, cx - waist * 0.2, hem - 1.6]);
  line(ctx, rgba(c.clothDark, 0.6), 0.25, [cx + waist * 0.15, hem - 2.6, cx + waist * 0.45, hem - 1.7]);
  if (!back && !side) {
    // Cuello de la camiseta o solapa de la chaqueta y la línea del cierre.
    const jacket = c.sleeves !== undefined && c.sleeves !== c.cloth && c.sleeveLen === undefined;
    ellipse(ctx, darker(c.skin, 0.1), cx, top + 0.15, 1.15, 0.85);
    line(ctx, darker(c.cloth, 0.3), 0.3, [cx - 1.25, top + 0.1, cx, top + 1.25, cx + 1.25, top + 0.1]);
    if (jacket || c.cloth !== c.clothDark) line(ctx, rgba(c.clothDark, 0.85), 0.25, [cx + 0.1, top + 1.3, cx + 0.1, hem - 0.4]);
  }
  ctx.restore();
  // Bufanda.
  if (c.scarf) {
    rrect(ctx, darker(c.scarf, 0.2), cx - (side ? 1.6 : 2.0), top - 0.9, side ? 3.4 : 4.0, 1.8, 0.8);
    rrect(ctx, c.scarf, cx - (side ? 1.5 : 1.9), top - 1.0, side ? 3.1 : 3.7, 1.4, 0.7);
    if (!back) rrect(ctx, c.scarf, cx + (side ? -0.2 : 0.6), top + 0.4, 1.1, 3.2, 0.4);
  }
  // Bolso en bandolera: correa en diagonal y el bolso en la cadera.
  if (c.bag) {
    if (!side) line(ctx, darker(c.bag, 0.15), 0.45, back ? [cx - half + 0.6, top + 0.3, cx + waist, hem - 0.8] : [cx + half - 0.6, top + 0.3, cx - waist, hem - 0.8]);
    const bx = side ? cx - 0.4 : back ? cx + waist + 0.4 : cx - waist - 0.4;
    rrect(ctx, darker(c.bag, 0.2), bx - 1.4, hem - 2.2, 2.8, 2.6, 0.6);
    rrect(ctx, c.bag, bx - 1.3, hem - 2.25, 2.6, 2.1, 0.55);
    line(ctx, lighter(c.bag, 0.2), 0.2, [bx - 1.0, hem - 1.7, bx + 1.0, hem - 1.7]);
  }
}

// ------------------------------------------------------------- dibujo

interface Joints {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  hx: number;
  hy: number;
}

/** Codo y mano de un brazo según lo que hace, en el sistema de una vista. `out`: hacia fuera del cuerpo (+1 derecha). */
function armJoints(a: Arm, sx: number, sy: number, out: number, side: boolean, f: Frame): Joints {
  const L1 = 3.5;
  const L2 = 3.6;
  const chest = f.shoulder + 3.2;
  switch (a) {
    case 'fwd':
      return side ? { sx, sy, ex: sx + 1.4, ey: sy + L1 - 0.3, hx: sx + 2.9, hy: sy + L1 + L2 - 0.9 } : { sx, sy, ex: sx + out * 0.25, ey: sy + L1, hx: sx - out * 0.2, hy: sy + L1 + L2 + 0.35 };
    case 'back':
      return side ? { sx, sy, ex: sx - 1.2, ey: sy + L1 - 0.2, hx: sx - 2.4, hy: sy + L1 + L2 - 1.0 } : { sx, sy, ex: sx + out * 0.35, ey: sy + L1 - 0.15, hx: sx + out * 0.45, hy: sy + L1 + L2 - 0.6 };
    case 'phone':
      return side ? { sx, sy, ex: sx + 0.6, ey: sy + L1, hx: sx + 2.6, hy: chest } : { sx, sy, ex: sx + out * 0.4, ey: sy + L1, hx: CX + out * 0.7, hy: chest };
    case 'mouth':
      return side ? { sx, sy, ex: sx + 1.2, ey: sy + L1 - 0.4, hx: sx + 2.3, hy: f.headY + 1.4 } : { sx, sy, ex: sx + out * 1.0, ey: sy + L1 - 0.6, hx: CX + out * 0.9, hy: f.headY + 1.6 };
    case 'up':
      return { sx, sy, ex: sx + out * 0.6, ey: sy - L1 + 0.3, hx: sx + out * 0.9, hy: sy - L1 - L2 + 0.8 };
    case 'photo':
      return side ? { sx, sy, ex: sx + 1.6, ey: sy + 0.4, hx: sx + 3.4, hy: f.headY + 0.8 } : { sx, sy, ex: sx + out * 1.2, ey: sy + 0.8, hx: CX + out * 0.9, hy: f.headY + 1.0 };
    case 'curl':
      return side ? { sx, sy, ex: sx + 0.2, ey: sy + L1, hx: sx + 1.6, hy: sy + 1.4 } : { sx, sy, ex: sx + out * 0.4, ey: sy + L1, hx: sx + out * 0.3, hy: sy + 1.6 };
    case 'rest':
      return side ? { sx, sy, ex: sx + 0.4, ey: sy + L1, hx: sx + 2.8, hy: f.hip + 0.6 } : { sx, sy, ex: sx + out * 0.4, ey: sy + L1, hx: sx - out * 0.6, hy: f.hip + 0.8 };
    case 'reach':
      return side ? { sx, sy, ex: sx + 2.2, ey: sy + 1.5, hx: sx + 5.2, hy: sy + 2.0 } : { sx, sy, ex: sx + out * 0.2, ey: sy + L1 - 0.6, hx: sx - out * 0.5, hy: sy + L1 + L2 - 1.8 };
    default:
      return side ? { sx, sy, ex: sx + 0.1, ey: sy + L1, hx: sx + 0.25, hy: sy + L1 + L2 } : { sx, sy, ex: sx + out * 0.45, ey: sy + L1, hx: sx + out * 0.4, hy: sy + L1 + L2 };
  }
}

/** Piernas de frente o de espaldas según el paso: la que va delante baja un poco, la de atrás levanta el talón. */
function legsFront(ctx: Ctx, c: HumanColors, b: Body, f: Frame, legs: Legs): void {
  const gap = 1.25 * b.hips;
  const ay = FOOT - 1.5;
  const L = (x: number, near: boolean, lift: number, spread = 0): void => {
    const hx = CX + x * gap;
    const ax = hx + x * (0.15 + spread);
    leg(ctx, c, hx, f.hip, (hx + ax) / 2, (f.hip + ay - lift) / 2, ax, ay - lift, !near, 0, 2.4 * Math.max(0.9, b.hips * 0.95));
  };
  if (legs === 'sit' || legs === 'pedalA' || legs === 'pedalB' || legs === 'squat') {
    // Sentado de frente: los muslos vienen hacia quien mira (se acortan), las rodillas bajan a los pies.
    for (const x of [-1, 1]) {
      const hx = CX + x * gap;
      const kneeY = f.hip + 1.6;
      const up = legs === 'pedalA' ? (x < 0 ? 1.2 : 0) : legs === 'pedalB' ? (x > 0 ? 1.2 : 0) : 0;
      limb(ctx, c.trousers, 2.9, [hx, f.hip, hx + x * 0.35, kneeY]);
      leg(ctx, c, hx + x * 0.35, kneeY, hx + x * 0.4, (kneeY + ay) / 2 - up, hx + x * 0.45, ay - up, false, 0);
      ellipse(ctx, lighter(c.trousers, 0.12), hx + x * 0.25 - 0.3, kneeY - 0.2, 1.1, 0.7);
    }
    return;
  }
  if (legs === 'floor') {
    for (const x of [-1, 1]) leg(ctx, c, CX + x * gap, f.hip, CX + x * (gap + 1.2), f.hip + 2, CX + x * (gap + 2.4), f.hip + 3.2, x < 0, 0);
    return;
  }
  if (legs === 'stepA') {
    L(-1, false, 0.9);
    L(1, true, -0.25);
  } else if (legs === 'stepB') {
    L(1, false, 0.9);
    L(-1, true, -0.25);
  } else {
    L(-1, true, 0);
    L(1, true, 0);
  }
}

/** Piernas de perfil (mirando a la derecha): zancada en A al andar; sentado, muslo al frente. */
function legsSide(ctx: Ctx, c: HumanColors, b: Body, f: Frame, legs: Legs): void {
  const hx = CX - 0.3;
  const ay = FOOT - 1.5;
  const w = 2.45 * Math.max(0.9, b.hips * 0.95);
  if (legs === 'sit' || legs === 'pedalA' || legs === 'pedalB' || legs === 'squat') {
    const kx = hx + 3.6;
    const ky = f.hip + 0.3;
    const lift = legs === 'pedalA' ? 1.3 : 0;
    leg(ctx, c, hx, f.hip, kx - 0.4, ky - 0.2 - lift, kx, ay - lift, true, 1, w);
    leg(ctx, c, hx + 0.3, f.hip, kx + 0.2, ky, kx + 0.7, ay - (legs === 'pedalB' ? 1.3 : 0), false, 1, w);
    return;
  }
  if (legs === 'floor') {
    leg(ctx, c, hx, f.hip, hx + 3, f.hip + 0.6, hx + 6, f.hip + 1.0, false, 1, w);
    return;
  }
  const stride = legs === 'stepA' || legs === 'stepB' ? 2.4 : 0.35;
  // Pierna de atrás (lejana) y de delante (cercana); en B se cruzan.
  const farFwd = legs === 'stepB';
  const fwd = (near: boolean): number => ((near ? !farFwd : farFwd) ? 1 : -1);
  for (const near of [false, true]) {
    const d = fwd(near) * stride;
    const kx = hx + d * 0.55 + (near ? 0.2 : 0);
    const lift = d < 0 && stride > 1 ? 0.7 : 0;
    leg(ctx, c, hx + (near ? 0.25 : -0.1), f.hip, kx, (f.hip + ay) / 2 - 0.2, hx + d, ay - lift, !near, 1, w);
  }
}

/** Dibuja una persona en su celda (px de mundo), sin contorno. */
function drawPerson(ctx: Ctx, facing: Facing, pose: Pose, c: HumanColors): void {
  const p = spec(pose);
  const b = bodyOf(c);
  const seatedDrop = p.legs === 'sit' || p.legs === 'pedalA' || p.legs === 'pedalB' ? 3.6 : p.legs === 'squat' ? 3 : p.legs === 'floor' ? 7.5 : 0;
  const f = frameOf(b, p.drop, seatedDrop);
  const side = facing === 'left' || facing === 'right';
  const back = facing === 'up';
  if (facing === 'left') {
    ctx.translate(HD_PERSON_W, 0);
    ctx.scale(-1, 1);
  }
  if (side) {
    const sx = CX - 0.1 + b.stoop * 0.3;
    const sy = f.shoulder + 0.9;
    const far = armJoints(p.armFar, sx - 0.5, sy, 1, true, f);
    arm(ctx, c, far.sx, far.sy, far.ex, far.ey, far.hx, far.hy, true);
    hairBack(ctx, c, f, true, false);
    legsSide(ctx, c, b, f, p.legs);
    torso(ctx, c, b, f, true, false);
    head(ctx, c, f, true, false);
    const near = armJoints(p.armNear, sx + 0.2, sy, 1, true, f);
    arm(ctx, c, near.sx, near.sy, near.ex, near.ey, near.hx, near.hy, false);
    if (p.armNear === 'phone') phoneIn(ctx, near.hx + 0.4, near.hy - 0.6, false);
    if (p.armNear === 'photo') phoneIn(ctx, near.hx + 0.3, near.hy - 1.2, true);
    return;
  }
  const half = 3.55 * b.shoulders;
  const sy = f.shoulder + 0.85;
  if (back) {
    hairBack(ctx, c, f, false, true);
    legsFront(ctx, c, b, f, p.legs);
    torso(ctx, c, b, f, false, true);
    for (const s of [-1, 1] as const) {
      const a = armJoints(s < 0 ? p.armFar : p.armNear, CX + s * (half - 0.6), sy, s, false, f);
      arm(ctx, c, a.sx, a.sy, a.ex, a.ey, a.hx, a.hy, s > 0);
    }
    head(ctx, c, f, false, true);
    return;
  }
  hairBack(ctx, c, f, false, false);
  legsFront(ctx, c, b, f, p.legs);
  torso(ctx, c, b, f, false, false);
  head(ctx, c, f, false, false);
  for (const s of [-1, 1] as const) {
    const a = armJoints(s < 0 ? p.armNear : p.armFar, CX + s * (half - 0.6), sy, s, false, f);
    arm(ctx, c, a.sx, a.sy, a.ex, a.ey, a.hx, a.hy, s > 0);
  }
  if (p.armNear === 'phone') phoneIn(ctx, CX, f.shoulder + 2.6, false);
  if (p.armNear === 'photo') phoneIn(ctx, CX, f.headY + 0.6, true);
}

/** El móvil en las manos: pantalla encendida mirando a quien lo usa (de frente se ve el dorso). */
function phoneIn(ctx: Ctx, x: number, y: number, photo: boolean): void {
  rrect(ctx, '#1d1f26', x - 0.75, y - 1.1, 1.5, 2.3, 0.3);
  if (photo) rrect(ctx, rgba('#bfe8ff', 0.85), x - 0.55, y - 0.9, 1.1, 1.8, 0.2);
  else ellipse(ctx, rgba('#9fd8ff', 0.5), x, y, 0.4, 0.2);
}

// ------------------------------------------------------------- atlas

const PAGE = 2048;
const CELL_W = HD_PERSON_W * HD;
const CELL_H = HD_PERSON_H * HD;
const COLS = Math.floor(PAGE / CELL_W);
const ROWS = Math.floor(PAGE / CELL_H);

let pages = 0;
let used = 0;
/** id → colores con los que se pinta (para repintar al cambiar de peinado o de ropa). */
const palette = new Map<string, HumanColors>();
/** frame → hoja donde está. */
const where = new Map<string, string>();
let resolver: ((id: string) => HumanColors | undefined) | null = null;
let on = false;

/** Activa o apaga el arte HD de personas para la escena que arranca (LocationDef.art). */
export function setHdPeople(enabled: boolean): void {
  on = enabled;
}
export const hdPeopleOn = (): boolean => on;

/** Quién sabe los colores de cada id (world/TextureFactory, que conoce todos los aspectos). */
export function setHdResolver(fn: (id: string) => HumanColors | undefined): void {
  resolver = fn;
}

/** Al cambiar el aspecto de alguien (peluquería, armario), sus celdas HD se rehacen la próxima vez. */
export function forgetHdPerson(id: string, colors: HumanColors): void {
  palette.set(id, colors);
  for (const key of [...where.keys()]) if (key.startsWith(`${id}|`)) where.delete(key);
}

/** La hoja y el fotograma HD de alguien en una pose; se dibuja la primera vez que se pide. */
export function hdFrame(scene: Phaser.Scene, id: string, facing: Facing, pose: Pose): [string, string] {
  const name = `${id}|${facing}|${pose}`;
  const done = where.get(name);
  if (done && scene.textures.exists(done) && scene.textures.get(done).has(name)) return [done, name];
  const colors = palette.get(id) ?? resolver?.(id);
  if (!colors) return ['__MISSING', '__BASE'];
  if (used >= COLS * ROWS * pages) {
    const key = `people-hd-${pages}`;
    const tex = scene.textures.createCanvas(key, PAGE, PAGE);
    tex?.setFilter(Phaser.Textures.FilterMode.LINEAR);
    pages++;
  }
  const page = Math.floor(used / (COLS * ROWS));
  const slot = used % (COLS * ROWS);
  used++;
  const key = `people-hd-${page}`;
  const tex = scene.textures.get(key) as Phaser.Textures.CanvasTexture;
  const x = (slot % COLS) * CELL_W;
  const y = Math.floor(slot / COLS) * CELL_H;
  const cell = document.createElement('canvas');
  cell.width = CELL_W;
  cell.height = CELL_H;
  const cctx = cell.getContext('2d');
  if (cctx) {
    outlined(cctx, HD_PERSON_W, HD_PERSON_H, OUTLINE, 0.42, (g) => drawPerson(g, facing, pose, colors));
    // Ropa con un punto de luz fría arriba y calor abajo: la gente se funde con la luz de la calle.
    const ctx = tex.getContext();
    ctx.clearRect(x, y, CELL_W, CELL_H);
    ctx.drawImage(cell, x, y);
  }
  tex.add(name, 0, x, y, CELL_W, CELL_H);
  tex.refresh();
  where.set(name, key);
  return [key, name];
}

/** Escala de un sprite de persona HD (para que mida lo que mide en el mundo). */
export const HD_PERSON_SCALE = HD_SCALE;

/** El tono medio de la ropa, por si algo tiene que casar con ella (un reflejo, una sombra de color). */
export const clothTone = (c: HumanColors): string => blend(c.cloth, c.clothDark, 0.5);
