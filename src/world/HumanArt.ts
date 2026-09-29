import { PALETTE } from '../config/constants';
import type { Facing, NpcLook } from '../types/game';
import { px, shade, type Ctx } from './paint';

/**
 * Personas de 16x24 con los pies en la base: jugador, personajes con nombre y
 * anónimos salen de aquí, así que comparten proporciones, luz y contorno y se
 * distinguen por pelo, piel, ropa y complementos.
 *
 * Luz del noroeste, como el resto del mundo: lado izquierdo claro, derecho en
 * sombra. El lado izquierdo es el derecho en espejo: las cuatro direcciones no
 * pueden desentonar entre sí.
 */

// El catálogo de peinados es de data/appearance.ts; aquí se dibujan.
import type { HairStyle } from '../data/appearance';
import type { InkSpot } from '../data/tattoos';
export type { HairStyle };

export interface HumanColors {
  cloth: string;
  clothDark: string;
  hair: string;
  skin: string;
  trousers: string;
  shoes: string;
  sleeves?: string;
  /** Píxeles de brazo que tapa la manga (0–5); por debajo, piel. Sin él, todo el brazo. */
  sleeveLen?: number;
  /** Tatuajes que se ven con la ropa de hoy (systems/Appearance.ts decide cuáles): dónde y de qué tinta. */
  ink?: readonly { spot: InkSpot; color: string }[];
  spots?: string;
  hairStyle?: HairStyle;
  earrings?: string;
  /** Bolso en bandolera y gorra: variedad para los anónimos. */
  bag?: string;
  cap?: string;
  /** Con frío: bufanda al cuello. Con lluvia sin paraguas: la capucha puesta. */
  scarf?: string;
  hood?: string;
}

/** Tinta en ese sitio, si se ve. */
const inkAt = (c: HumanColors, spot: InkSpot): string | undefined => c.ink?.find((i) => i.spot === spot)?.color;

/**
 * Brazo: manga arriba, piel debajo y la mano; el tatuaje del antebrazo o de la
 * mano, encima de la piel. `len` es lo que mide sin la mano.
 */
function arm(ctx: Ctx, c: HumanColors, side: 'r' | 'l', x: number, y: number, w: number, len: number, sleeve: string, skin: string): void {
  const covered = Math.min(len, c.sleeveLen ?? len);
  px(ctx, sleeve, x, y, w, covered);
  px(ctx, skin, x, y + covered, w, len + 1 - covered);
  const fore = inkAt(c, side === 'r' ? 'arm-r' : 'arm-l');
  if (fore && covered < len - 1) px(ctx, fore, x, y + len - 2, 1, 1);
  const hand = side === 'r' ? inkAt(c, 'hand-r') : undefined;
  if (hand) px(ctx, hand, x, y + len, 1, 1);
}

/**
 * 0 quieto · 1 y 2 los dos pasos · 3 respiración (el tronco baja un píxel) ·
 * 4 sentado · 5 mirando el móvil · 6 pesas arriba · 7 brazo en alto (jalear).
 * Sólo de perfil, para quien pelea (world/StreetEventView): 8 guardia · 9 golpe · 10 encaja.
 */
export type Pose = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
/** Las de la textura común de gente: todas menos las de pelea, que se hornean aparte y sólo para quien pelea. */
export const POSES: readonly Pose[] = [0, 1, 2, 3, 4, 5, 6, 7];
export const FIGHT_POSES: readonly Pose[] = [0, 8, 9, 10];

/** Cuánto baja el tronco en cada pose: al apoyar, respirar o ponerse en guardia, uno; sentado, tres. */
const drop = (pose: Pose): number => (pose === 4 ? 3 : pose === 8 || pose === 9 ? 1 : pose === 0 || pose >= 5 ? 0 : 1);

const SKINS = ['#e3b692', '#d3a17c', '#b98462', '#96654a', '#f0caa8'] as const;
const TROUSERS = ['#33374a', '#2f4563', '#5b4b3a', '#232329', '#6a6d75', '#3f4b3a'] as const;
const SHOES = ['#20232c', '#e6e0d4', '#5a3a26', '#20232c'] as const;
const STYLES: readonly HairStyle[] = ['short', 'bob', 'curly', 'bun', 'buzz', 'short', 'long'];

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/**
 * Lo que un aspecto no fija sale del id, siempre igual: los anónimos y los
 * personajes antiguos ganan variedad sin escribir un dato más.
 */
export function colorsOf(look: NpcLook): HumanColors {
  const h = hash(look.id);
  return {
    ...look,
    skin: look.skin ?? SKINS[h % SKINS.length],
    trousers: look.trousers ?? TROUSERS[(h >>> 4) % TROUSERS.length],
    shoes: SHOES[(h >>> 8) % SHOES.length],
    hairStyle: look.hairStyle ?? (look.longHair ? 'long' : STYLES[(h >>> 12) % STYLES.length]),
  };
}

export function drawHuman(ctx: Ctx, facing: Facing, pose: Pose, c: HumanColors): void {
  if (facing === 'left') {
    ctx.save();
    ctx.translate(16, 0);
    ctx.scale(-1, 1);
    drawSide(ctx, pose, c, 'l');
    ctx.restore();
  } else if (facing === 'right') drawSide(ctx, pose, c, 'r');
  else drawFrontBack(ctx, facing === 'up', pose, c);
  outline(ctx);
}

/** Pierna con sus manchas, si el pantalón las lleva. */
function leg(ctx: Ctx, c: HumanColors, color: string, x: number, y: number, w: number, h: number): void {
  px(ctx, color, x, y, w, h);
  if (!c.spots) return;
  px(ctx, c.spots, x + (y % 2), y + 1, 1, 1);
  if (h > 3) px(ctx, c.spots, x + w - 1, y + 3, 1, 1);
}

function drawFrontBack(ctx: Ctx, back: boolean, pose: Pose, c: HumanColors): void {
  const b = drop(pose);
  const liftL = pose === 1 ? 1 : 0;
  const liftR = pose === 2 ? 1 : 0;
  const inner = shade(c.trousers, -0.1);

  // Piernas y zapatos: al dar el paso, un pie se levanta un píxel.
  leg(ctx, c, c.trousers, 5, 17, 3, 5 - liftL);
  leg(ctx, c, inner, 8, 17, 3, 5 - liftR);
  px(ctx, c.shoes, 5, 22 - liftL, 3, 2);
  px(ctx, c.shoes, 8, 22 - liftR, 3, 2);

  // Brazos: se balancean al contrario que las piernas.
  const sleeve = c.sleeves ?? c.cloth;
  const armL = 11 + b - liftL + liftR;
  const armR = 11 + b - liftR + liftL;
  const sleeveDark = c.sleeves ? shade(c.sleeves, -0.08) : c.clothDark;
  if (pose === 6) {
    // Brazos estirados por encima de la cabeza.
    px(ctx, sleeve, 3, 5, 1, 6);
    px(ctx, c.skin, 3, 4, 1, 1);
    px(ctx, sleeveDark, 12, 5, 1, 6);
    px(ctx, shade(c.skin, -0.08), 12, 4, 1, 1);
  } else if (pose === 7) {
    // Jaleando: un brazo arriba con el puño cerrado; el otro, abajo.
    px(ctx, sleeve, 3, 5, 1, 6);
    px(ctx, c.skin, 3, 3, 1, 2);
    arm(ctx, c, back ? 'r' : 'l', 12, armR, 1, 5, sleeveDark, shade(c.skin, -0.08));
  } else if (pose === 5) {
    // Sólo el brazo: el antebrazo va doblado hacia el pecho y se pinta encima del tronco.
    px(ctx, sleeve, 3, 11, 1, 3);
    px(ctx, sleeveDark, 12, 11, 1, 3);
  } else {
    // De frente, el brazo derecho queda a la izquierda de la imagen; de espaldas, al revés.
    arm(ctx, c, back ? 'l' : 'r', 3, armL, 1, 5, sleeve, c.skin);
    arm(ctx, c, back ? 'r' : 'l', 12, armR, 1, 5, sleeveDark, shade(c.skin, -0.08));
  }

  // Tronco: hombros, luz a la izquierda, cintura oscura.
  px(ctx, c.cloth, 4, 10 + b, 8, 7 - b);
  px(ctx, shade(c.cloth, 0.06), 4, 10 + b, 2, 6 - b);
  px(ctx, c.clothDark, 10, 11 + b, 2, 5 - b);
  px(ctx, c.clothDark, 4, 16, 8, 1);
  if (!back) px(ctx, shade(c.skin, -0.06), 7, 10 + b, 2, 1); // escote

  // Cuello y cabeza redondeada.
  px(ctx, shade(c.skin, -0.1), 7, 9 + b, 2, 1);
  const neck = inkAt(c, 'neck');
  if (neck) px(ctx, neck, back ? 7 : 8, 9 + b, 1, 1);
  px(ctx, c.skin, 5, 2 + b, 6, 7);
  px(ctx, c.skin, 4, 3 + b, 8, 5);
  px(ctx, shade(c.skin, -0.07), 10, 3 + b, 2, 5);
  if (!back) {
    // Mirando el móvil, los ojos bajan: medio ojo, un píxel más abajo.
    const down = pose === 5 ? 1 : 0;
    px(ctx, PALETTE.outline, 6, 5 + b + down, 1, 2 - down);
    px(ctx, PALETTE.outline, 9, 5 + b + down, 1, 2 - down);
    px(ctx, shade(c.skin, -0.14), 7, 7 + b, 2, 1); // boca, apenas
  }
  hairFront(ctx, back, b, c);
  if (c.hood) {
    // Capucha: la tela cubre la coronilla y los lados; de frente queda el hueco de la cara.
    const lit = shade(c.hood, 0.1);
    px(ctx, c.hood, 4, b, 8, 3);
    px(ctx, lit, 5, b, 3, 1);
    px(ctx, c.hood, 3, 2 + b, 1, 7);
    px(ctx, shade(c.hood, -0.12), 12, 2 + b, 1, 7);
    if (back) px(ctx, c.hood, 4, 3 + b, 8, 6);
    else {
      px(ctx, c.hood, 4, 3 + b, 1, 5);
      px(ctx, c.hood, 11, 3 + b, 1, 5);
    }
  }
  if (c.scarf) {
    // Bufanda: dos vueltas al cuello, con una punta que cuelga por delante.
    px(ctx, c.scarf, 5, 9 + b, 6, 2);
    px(ctx, shade(c.scarf, 0.12), 5, 9 + b, 3, 1);
    if (!back) px(ctx, shade(c.scarf, -0.1), 9, 11 + b, 1, 3);
  }
  if (c.earrings && !back) {
    px(ctx, c.earrings, 4, 7 + b, 1, 1);
    px(ctx, c.earrings, 11, 7 + b, 1, 1);
  }
  if (c.bag) {
    // Bandolera del hombro a la cadera contraria; de espaldas, en espejo.
    const x = (i: number): number => (back ? 10 - i : 5 + i);
    for (let i = 0; i < 5; i++) px(ctx, shade(c.bag, -0.2), x(i), 10 + b + i, 1, 1);
    px(ctx, c.bag, back ? 3 : 10, 14, 3, 3);
    px(ctx, shade(c.bag, -0.2), back ? 3 : 10, 16, 3, 1);
  }
  if (pose === 5 && !back) {
    // Antebrazos hacia dentro y el móvil entre las manos, de canto: se ve su dorso.
    px(ctx, c.sleeves ?? c.cloth, 4, 13, 2, 1);
    px(ctx, c.sleeves ? shade(c.sleeves, -0.08) : c.clothDark, 10, 13, 2, 1);
    px(ctx, c.skin, 6, 13, 1, 2);
    px(ctx, shade(c.skin, -0.08), 9, 13, 1, 2);
    px(ctx, PALETTE.ink, 7, 12, 2, 3);
  }
  if (pose === 6) {
    // La barra por encima de la cabeza, con un disco a cada lado.
    px(ctx, PALETTE.metal, 1, 3, 14, 1);
    px(ctx, PALETTE.ink, 0, 1, 2, 5);
    px(ctx, PALETTE.ink, 14, 1, 2, 5);
  }
}

function hairFront(ctx: Ctx, back: boolean, b: number, c: HumanColors): void {
  const hair = c.hair;
  const lit = shade(hair, 0.1);
  const style = c.hairStyle ?? 'short';
  if (style === 'buzz') {
    px(ctx, hair, 5, 1 + b, 6, 2);
    px(ctx, hair, 4, 2 + b, 8, 1);
    if (back) px(ctx, hair, 4, 3 + b, 8, 3);
    return;
  }
  // Base: casco de pelo con brillo arriba a la izquierda.
  px(ctx, hair, 5, 1 + b, 6, 1);
  px(ctx, hair, 4, 2 + b, 8, 2);
  px(ctx, lit, 5, 2 + b, 2, 1);
  if (back) px(ctx, hair, 4, 4 + b, 8, 4);
  else {
    px(ctx, hair, 4, 4 + b, 3, 1); // flequillo de lado
    px(ctx, hair, 4, 5 + b, 1, 1);
    px(ctx, hair, 11, 4 + b, 1, 2);
  }
  if (style === 'curly') {
    px(ctx, hair, 3, 2 + b, 1, 4);
    px(ctx, hair, 12, 2 + b, 1, 4);
    px(ctx, hair, 5, b, 1, 1);
    px(ctx, hair, 8, b, 2, 1);
    px(ctx, lit, 9, 1 + b, 1, 1);
  } else if (style === 'bun') {
    px(ctx, hair, 6, b - 1, 4, 2);
    px(ctx, lit, 6, b - 1, 2, 1);
  } else if (style === 'bob') {
    px(ctx, hair, 3, 3 + b, 1, 6);
    px(ctx, hair, 12, 3 + b, 1, 6);
    if (back) px(ctx, hair, 4, 8 + b, 8, 1);
  } else if (style === 'long') {
    px(ctx, hair, 3, 3 + b, 1, 10);
    px(ctx, hair, 12, 3 + b, 1, 10);
    if (back) {
      px(ctx, hair, 4, 8 + b, 8, 5);
      px(ctx, lit, 5, 12 + b, 6, 1);
    }
  }
  if (c.cap) {
    // Gorra: copa con brillo y, de frente, la visera sobre la frente.
    px(ctx, c.cap, 4, b, 8, back ? 4 : 3);
    px(ctx, shade(c.cap, 0.12), 5, b, 2, 1);
    if (!back) px(ctx, shade(c.cap, -0.2), 4, 3 + b, 8, 1);
  }
}

/** De perfil se ve el brazo cercano: el derecho mirando a la derecha; el izquierdo, en espejo. */
function drawSide(ctx: Ctx, pose: Pose, c: HumanColors, near: 'r' | 'l'): void {
  const b = drop(pose);
  const far = shade(c.trousers, -0.12);
  // En guardia y al golpear, piernas abiertas como al dar un paso, con el pie de delante hacia el otro.
  const step = pose === 1 || pose === 2 || pose === 8 || pose === 9;

  // Piernas: juntas quieto; al andar, una delante y otra detrás; sentado, el muslo hacia delante.
  if (pose === 4) {
    leg(ctx, c, c.trousers, 6, 17, 6, 2);
    leg(ctx, c, c.trousers, 10, 19, 2, 3);
    px(ctx, c.shoes, 10, 22, 3, 2);
  } else if (step) {
    const [front, rear] = pose === 2 ? [far, c.trousers] : [c.trousers, far];
    leg(ctx, c, rear, 5, 17, 3, 2);
    leg(ctx, c, rear, 4, 19, 3, 3);
    px(ctx, c.shoes, 3, 22, 4, 2);
    leg(ctx, c, front, 8, 17, 3, 2);
    leg(ctx, c, front, 9, 19, 3, 3);
    px(ctx, c.shoes, 9, 22, 4, 2);
  } else {
    leg(ctx, c, c.trousers, 6, 17, 4, 5);
    px(ctx, far, 6, 18, 1, 4);
    px(ctx, c.shoes, 6, 22, 5, 2);
  }

  // Tronco de perfil.
  px(ctx, c.cloth, 5, 10 + b, 6, 7 - b);
  px(ctx, shade(c.cloth, 0.06), 5, 10 + b, 2, 6 - b);
  px(ctx, c.clothDark, 5, 16, 6, 1);

  // Cabeza de perfil: nuca, oreja, ojo y nariz hacia delante.
  px(ctx, shade(c.skin, -0.1), 7, 9 + b, 2, 1);
  const nape = inkAt(c, 'neck');
  if (nape) px(ctx, nape, 7, 9 + b, 1, 1);
  px(ctx, c.skin, 5, 2 + b, 7, 7);
  px(ctx, c.skin, 12, 5 + b, 1, 2);
  px(ctx, PALETTE.outline, 10, 5 + b, 1, 2);
  px(ctx, shade(c.skin, -0.12), 7, 6 + b, 1, 1);

  const hair = c.hair;
  const style = c.hairStyle ?? 'short';
  if (style === 'buzz') {
    px(ctx, hair, 5, 1 + b, 6, 2);
    px(ctx, hair, 5, 3 + b, 2, 2);
  } else {
    px(ctx, hair, 5, 1 + b, 6, 1);
    px(ctx, hair, 4, 2 + b, 8, 2);
    px(ctx, shade(hair, 0.1), 6, 2 + b, 2, 1);
    px(ctx, hair, 4, 4 + b, 3, 3);
    px(ctx, hair, 11, 4 + b, 1, 1);
    if (style === 'curly') px(ctx, hair, 3, 2 + b, 2, 5);
    if (style === 'bun') px(ctx, hair, 3, 1 + b, 2, 2);
    if (style === 'bob') px(ctx, hair, 4, 7 + b, 3, 2);
    if (style === 'long') {
      px(ctx, hair, 3, 4 + b, 3, 9);
      px(ctx, shade(hair, 0.1), 3, 12 + b, 3, 1);
    }
  }
  if (c.cap) {
    px(ctx, c.cap, 5, b, 6, 3);
    px(ctx, shade(c.cap, 0.12), 6, b, 2, 1);
    px(ctx, shade(c.cap, -0.2), 11, 2 + b, 3, 1); // visera hacia delante
  }
  if (c.hood) {
    px(ctx, c.hood, 5, b, 7, 3);
    px(ctx, shade(c.hood, 0.1), 6, b, 3, 1);
    px(ctx, c.hood, 4, 2 + b, 4, 7);
    px(ctx, shade(c.hood, -0.12), 11, 2 + b, 1, 3);
  }
  if (c.scarf) {
    px(ctx, c.scarf, 6, 9 + b, 5, 2);
    px(ctx, shade(c.scarf, 0.12), 6, 9 + b, 2, 1);
  }
  if (c.earrings && !c.hood) px(ctx, c.earrings, 7, 7 + b, 1, 1);
  if (c.bag) {
    // Correa cruzando el pecho y el bolso a la espalda, a la altura de la cadera.
    px(ctx, shade(c.bag, -0.2), 8, 10 + b, 1, 5);
    px(ctx, c.bag, 3, 13, 3, 3);
    px(ctx, shade(c.bag, -0.2), 3, 15, 3, 1);
  }

  // Brazo cercano, por encima del tronco, al contrario que la pierna delantera.
  const sleeve = c.sleeves ?? c.clothDark;
  if (pose === 5) {
    // Antebrazo levantado y el móvil delante de la cara, con la pantalla hacia ella.
    px(ctx, sleeve, 7, 11, 2, 3);
    px(ctx, sleeve, 9, 12, 2, 2);
    px(ctx, c.skin, 11, 11, 1, 2);
    px(ctx, PALETTE.ink, 12, 9, 1, 4);
    px(ctx, PALETTE.glassLit, 11, 10, 1, 1);
    // Ojo bajado: sólo su mitad de abajo.
    px(ctx, c.skin, 10, 5, 1, 1);
  } else if (pose === 6) {
    // Brazo arriba y la barra de canto: el disco sobre la cabeza.
    px(ctx, sleeve, 7, 3, 2, 8);
    px(ctx, c.skin, 7, 2, 2, 1);
    px(ctx, PALETTE.ink, 6, 0, 4, 2);
    px(ctx, PALETTE.metal, 7, 0, 2, 1);
  } else if (pose === 7) {
    // Brazo en alto, puño cerrado: jaleando.
    px(ctx, sleeve, 7, 4, 2, 7);
    px(ctx, c.skin, 7, 2, 2, 2);
  } else if (pose === 8) {
    // Guardia: el antebrazo sube y el puño queda delante de la barbilla.
    px(ctx, sleeve, 8, 11 + b, 3, 2);
    px(ctx, sleeve, 11, 9 + b, 2, 3);
    px(ctx, c.skin, 11, 7 + b, 2, 2);
  } else if (pose === 9) {
    // Golpe: el brazo estirado hacia delante a la altura del hombro.
    px(ctx, sleeve, 8, 10 + b, 5, 2);
    px(ctx, c.skin, 13, 10 + b, 2, 2);
  } else if (pose === 10) {
    // Encaja: echado atrás, el brazo se le va hacia la espalda.
    px(ctx, sleeve, 4, 11, 2, 3);
    px(ctx, c.skin, 3, 14, 2, 1);
  } else if (pose === 1) {
    arm(ctx, c, near, 5, 11 + b, 2, 4, sleeve, c.skin);
  } else if (pose === 2) {
    arm(ctx, c, near, 9, 11 + b, 2, 4, sleeve, c.skin);
  } else {
    arm(ctx, c, near, 7, 11 + b, 2, 5, sleeve, c.skin);
  }
}

/** Contorno de un píxel alrededor de la silueta: se lee sobre cualquier suelo. */
function outline(ctx: Ctx): void {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  const n = Number.parseInt(PALETTE.outline.slice(1), 16);
  const edge: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) edge.push((y * w + x) * 4);
    }
  }
  for (const i of edge) {
    d[i] = (n >> 16) & 255;
    d[i + 1] = (n >> 8) & 255;
    d[i + 2] = n & 255;
    d[i + 3] = 235;
  }
  ctx.putImageData(img, 0, 0);
}
