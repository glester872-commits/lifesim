import { PALETTE } from '../config/constants';
import type { Facing, NpcLook } from '../types/game';
import { px, shade, type Ctx } from './paint';
import { shadeForm } from './Shading';

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
  /** Franja vertical por fuera de cada pernera (uniforme de seguridad del metro). */
  stripe?: string;
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
  /** Cuerpo y rasgos (NpcLook): reshape() y face() los pintan sobre cualquier pose. */
  build?: NpcLook['build'];
  height?: NpcLook['height'];
  posture?: NpcLook['posture'];
  facialHair?: NpcLook['facialHair'];
  brows?: NpcLook['brows'];
  jaw?: NpcLook['jaw'];
  glasses?: NpcLook['glasses'];
  piercing?: NpcLook['piercing'];
  headphones?: string;
  cane?: boolean;
  /** Qué prenda es cada cosa (data/outfits.ts): con él, world/Garments la pinta como ropa a 28 × 42. */
  outfit?: import('../data/outfits').Outfit;
}

/**
 * Rampa con matiz para pelo, piel y ropa: la luz sube algo cálida y la sombra baja algo fría, en vez
 * de sólo sumar o restar brillo (`shade`), que a 16 px deja los tonos lavados.
 */
function tone(hex: string, k: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const out = k >= 0
    ? [r + (255 - r) * k, g + (255 - g) * k * 0.88, b + (255 - b) * k * 0.65]
    : [r * (1 + k * 1.12), g * (1 + k), b * (1 + k * 0.72)];
  return `#${out.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** Mezcla dos colores (`k` = cuánto del segundo). */
function blend(a: string, b: string, k: number): string {
  const pa = Number.parseInt(a.slice(1), 16);
  const pb = Number.parseInt(b.slice(1), 16);
  const ch = (s: number): number => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * k);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

/** Rubor de las mejillas: un punto, nunca una mancha. */
const BLUSH = '#d9735f';

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
  if (w >= 2) {
    // De perfil el brazo tiene dos píxeles: el de fuera con luz, el de dentro en sombra (cilindro).
    px(ctx, tone(sleeve, 0.1), x, y, 1, covered);
    px(ctx, tone(sleeve, -0.12), x + w - 1, y, 1, covered);
    px(ctx, tone(skin, -0.1), x + w - 1, y + covered, 1, len + 1 - covered);
  }
  const fore = inkAt(c, side === 'r' ? 'arm-r' : 'arm-l');
  if (fore && covered < len - 1) px(ctx, fore, x, y + len - 2, 1, 1);
  const hand = side === 'r' ? inkAt(c, 'hand-r') : undefined;
  if (hand) px(ctx, hand, x, y + len, 1, 1);
}

/**
 * 0 quieto · 1 y 2 los dos pasos · 3 respiración (el tronco baja un píxel) ·
 * 4 sentado · 5 mirando el móvil · 6 pesas arriba · 7 brazo en alto (jalear).
 * Sólo de perfil, para quien pelea (world/StreetEventView): 8 guardia · 9 golpe · 10 encaja.
 *
 * Las de los puestos de uso (data/stations.ts), a pares, uno por mitad del movimiento:
 * 11 y 12 tumbado en el banco, brazos doblados y estirados (da igual hacia dónde mire) ·
 * 13 y 14 pedaleando, sentado · 15 y 16 curl, mancuernas abajo y arriba ·
 * 17 y 18 sentadilla, barra a la espalda, arriba y abajo · 19 y 20 remo, de perfil,
 * recogido y estirado · 21 estirando con los brazos arriba · 22 estirando sentado en el suelo ·
 * 23 los dos brazos arriba agarrando la polea.
 *
 * Sentado (data/seating.ts): 24 la 4 soltando el aire (el tronco baja uno más: respira sin
 * parecer congelado) · 25 sentado mirando el móvil · 26 sentado llevándose el tenedor a la boca.
 *
 * Gestos de ambiente (data/ambientActions.ts): 32 de pie con la mano en la boca (un cigarro, un
 * café, un bocado) · 33 lo mismo sentado · 34 de pie con el móvil en alto, haciendo una foto.
 */
export type Pose = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34;
/** Las de la textura común de gente: todas menos las de pelea, que se hornean aparte y sólo para quien pelea. */
export const POSES: readonly Pose[] = [0, 1, 2, 3, 4, 5, 6, 7, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 32, 33, 34];
/** Sólo la pelea existente: carga del golpe, esquive, cansancio, victoria y discusión. */
export const FIGHT_POSES: readonly Pose[] = [0, 7, 8, 9, 10, 27, 28, 29, 30, 31];

/** Cuánto baja el tronco en cada pose: al apoyar, respirar o ponerse en guardia, uno; sentado (también en la bici), tres. */
export const drop = (pose: Pose): number => (pose === 28 ? 4 : pose === 29 ? 2 : pose === 24 ? 4 : pose === 4 || pose === 25 || pose === 26 || pose === 33 || pose === 13 || pose === 14 ? 3 : (pose >= 1 && pose <= 3) || pose === 8 || pose === 9 ? 1 : 0);
/** Mirando el móvil, de pie o sentado. */
const onPhone = (pose: Pose): boolean => pose === 5 || pose === 25;
/** Sentado: las piernas de la 4, sea lo que sea lo que haga arriba. */
const seated = (pose: Pose): boolean => pose === 4 || pose === 24 || pose === 25 || pose === 26 || pose === 33;
/** Un antebrazo sube a la boca: el tenedor (26) o, sin cubierto, el cigarro o la taza que pinta entities/Character. */
const toMouth = (pose: Pose): boolean => pose === 26 || pose === 32 || pose === 33;

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
    shoes: look.shoes ?? SHOES[(h >>> 8) % SHOES.length],
    hairStyle: look.hairStyle ?? (look.longHair ? 'long' : STYLES[(h >>> 12) % STYLES.length]),
    // El pañuelo a la cabeza se dibuja como la capucha (cara al aire); con capucha de verdad, manda la capucha.
    hood: look.hood ?? look.headscarf,
  };
}

export function drawHuman(ctx: Ctx, facing: Facing, pose: Pose, c: HumanColors): void {
  if (pose === 11 || pose === 12) drawLying(ctx, pose === 12, c);
  else if (facing === 'left') {
    ctx.save();
    ctx.translate(16, 0);
    ctx.scale(-1, 1);
    drawBody(ctx, true, false, 'l', pose, c);
    ctx.restore();
  } else drawBody(ctx, facing === 'right', facing === 'up', 'r', pose, c);
  if (c.cane && CANE_POSES.has(pose)) {
    // Bastón en la mano de fuera, del puño al suelo.
    const x = facing === 'left' ? 3 : facing === 'right' ? 12 : facing === 'up' ? 13 : 2;
    px(ctx, '#5a3a26', x, 15, 1, 9);
    px(ctx, '#7b5a3d', x, 15, 1, 1);
  }
  reshape(ctx, facing, pose, c);
  outline(ctx);
}

/** De pie o andando: con bastón. Sentado, en el gimnasio o peleando, no. */
const CANE_POSES: ReadonlySet<Pose> = new Set<Pose>([0, 1, 2, 3, 5, 32, 34]);

/**
 * El cuerpo de cada cual sobre el mismo dibujo, para todas las poses a la vez:
 * se mueven filas y columnas de píxeles ya pintados. Más ancho de hombros, de
 * cadera o de tronco (duplicando el centro), más estrecho (quitándolo), más
 * alto o más bajo (el tronco sube o baja un píxel sobre las piernas) y la
 * espalda algo cargada de perfil. Tumbado no cambia. Sólo en lienzos de 16×24.
 */
function reshape(ctx: Ctx, facing: Facing, pose: Pose, c: HumanColors): void {
  const build = c.build ?? 'average';
  const height = c.height ?? 'average';
  const stoop = c.posture === 'stooped' && (facing === 'left' || facing === 'right');
  if ((build === 'average' && height === 'average' && !stoop) || pose === 11 || pose === 12) return;
  const { width: w, height: h } = ctx.canvas;
  if (w !== 16 || h !== 24) return;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const row = (y: number): Uint8ClampedArray => d.slice(y * w * 4, (y + 1) * w * 4);
  const put = (y: number, r: Uint8ClampedArray): void => d.set(r, y * w * 4);
  const px4 = (r: Uint8ClampedArray, x: number): Uint8ClampedArray => (x < 0 || x >= w ? new Uint8ClampedArray(4) : r.slice(x * 4, x * 4 + 4));
  const remap = (y0: number, y1: number, from: (x: number) => number): void => {
    for (let y = y0; y <= y1; y++) {
      const old = row(y);
      const out = new Uint8ClampedArray(w * 4);
      for (let x = 0; x < w; x++) out.set(px4(old, from(x)), x * 4);
      put(y, out);
    }
  };
  // Ensanchar: la mitad izquierda sale un píxel a la izquierda y la derecha, a la derecha; el centro se repite.
  const widen = (y0: number, y1: number): void => remap(y0, y1, (x) => (x < 7 ? x + 1 : x > 8 ? x - 1 : x));
  // Estrechar: las dos mitades se juntan un píxel cada una; el centro desaparece.
  const narrow = (y0: number, y1: number): void => remap(y0, y1, (x) => (x < 8 ? x - 1 : x + 1));
  if (build === 'thin') narrow(10, 21);
  else if (build === 'athletic') widen(10, 13);
  else if (build === 'muscular') {
    widen(10, 16);
    widen(10, 12);
  } else if (build === 'stocky') widen(10, 21);
  else if (build === 'curvy') widen(14, 19);
  else if (build === 'heavy') {
    widen(11, 18);
    widen(13, 16);
  }
  if (height === 'tall') for (let y = 0; y < 16; y++) put(y, row(y + 1));
  else if (height === 'short') for (let y = 17; y > 0; y--) put(y, row(y - 1));
  if (height === 'short') put(0, new Uint8ClampedArray(w * 4));
  if (stoop) {
    // Cabeza y hombros un píxel hacia delante.
    const dx = facing === 'right' ? 1 : -1;
    remap(0, 10, (x) => x - dx);
  }
  ctx.putImageData(img, 0, 0);
}

/** Cara: cejas, mandíbula, barba, gafas y pendiente; de frente o de perfil. Encima de la piel y debajo del pelo. */
function face(ctx: Ctx, side: boolean, b: number, c: HumanColors): void {
  const hair = c.hair;
  const skinShade = shade(c.skin, -0.18);
  if (side) {
    if (c.facialHair === 'beard') px(ctx, hair, 8, 7 + b, 4, 2);
    else if (c.facialHair === 'moustache') px(ctx, hair, 11, 7 + b, 1, 1);
    else if (c.facialHair === 'stubble') px(ctx, skinShade, 8, 7 + b, 4, 2);
    if (c.brows === 'thick') px(ctx, hair, 10, 4 + b, 2, 1);
    if (c.glasses) px(ctx, c.glasses === 'dark' ? PALETTE.ink : '#3a3a44', 9, 5 + b, 4, 1);
    if (c.piercing === 'nose') px(ctx, '#d8d2c4', 12, 6 + b, 1, 1);
    if (c.headphones) px(ctx, c.headphones, 6, 4 + b, 2, 3);
    return;
  }
  if (c.jaw === 'square') {
    px(ctx, c.skin, 4, 8 + b, 1, 1);
    px(ctx, shade(c.skin, -0.07), 11, 8 + b, 1, 1);
  } else if (c.jaw === 'narrow') {
    ctx.clearRect(5, 8 + b, 1, 1);
    ctx.clearRect(10, 8 + b, 1, 1);
  }
  if (c.facialHair === 'beard') {
    px(ctx, hair, 4, 6 + b, 1, 2);
    px(ctx, hair, 11, 6 + b, 1, 2);
    px(ctx, hair, 5, 7 + b, 6, 2);
    px(ctx, shade(c.skin, -0.2), 7, 7 + b, 2, 1);
  } else if (c.facialHair === 'moustache') px(ctx, hair, 6, 7 + b, 4, 1);
  else if (c.facialHair === 'stubble') {
    px(ctx, skinShade, 5, 8 + b, 6, 1);
    px(ctx, skinShade, 6, 7 + b, 1, 1);
    px(ctx, skinShade, 9, 7 + b, 1, 1);
  }
  if (c.brows === 'thick') {
    px(ctx, hair, 5, 4 + b, 2, 1);
    px(ctx, hair, 9, 4 + b, 2, 1);
  } else if (c.brows === 'fine') {
    px(ctx, shade(c.skin, -0.25), 6, 4 + b, 1, 1);
    px(ctx, shade(c.skin, -0.25), 9, 4 + b, 1, 1);
  }
  if (c.glasses === 'dark') {
    px(ctx, PALETTE.ink, 5, 5 + b, 2, 2);
    px(ctx, PALETTE.ink, 9, 5 + b, 2, 2);
    px(ctx, PALETTE.ink, 7, 5 + b, 2, 1);
  } else if (c.glasses) px(ctx, '#3a3a44', 5, 5 + b, 6, 1);
  if (c.piercing === 'nose') px(ctx, '#d8d2c4', 8, 6 + b, 1, 1);
  else if (c.piercing === 'brow') px(ctx, '#d8d2c4', 10, 4 + b, 1, 1);
  if (c.headphones) {
    px(ctx, c.headphones, 3, 4 + b, 1, 3);
    px(ctx, c.headphones, 12, 4 + b, 1, 3);
    px(ctx, shade(c.headphones, -0.2), 5, b, 6, 1);
  }
}

/**
 * Las poses agachadas (sentadilla abajo, sentado en el suelo, en el remo) son
 * el cuerpo de pie bajado unos píxeles con las piernas cortadas y dobladas
 * encima: las mismas proporciones, la misma cabeza y la misma ropa que al
 * andar, sin dibujar a nadie dos veces.
 */
function drawBody(ctx: Ctx, side: boolean, back: boolean, near: 'r' | 'l', pose: Pose, c: HumanColors): void {
  const plain = (p: Pose): void => (side ? drawSide(ctx, p, c, near) : drawFrontBack(ctx, back, p, c));
  const inner = shade(c.trousers, -0.1);
  if (pose === 18) {
    lowered(ctx, 3, 20, () => plain(17));
    if (side) {
      // De perfil: el muslo hacia delante y la rodilla por delante del pie.
      leg(ctx, c, c.trousers, 6, 19, 6, 2);
      leg(ctx, c, c.trousers, 9, 21, 2, 1);
      px(ctx, c.shoes, 7, 22, 5, 2);
    } else {
      // Rodillas abiertas hacia fuera, pies bien apoyados.
      leg(ctx, c, c.trousers, 3, 19, 4, 2);
      leg(ctx, c, inner, 9, 19, 4, 2);
      px(ctx, c.trousers, 4, 21, 2, 1);
      px(ctx, inner, 10, 21, 2, 1);
      px(ctx, c.shoes, 3, 22, 4, 2);
      px(ctx, c.shoes, 9, 22, 4, 2);
    }
  } else if (pose === 22) {
    if (side) {
      // Sentado con las piernas estiradas y los brazos hacia las puntas de los pies.
      lowered(ctx, 5, 20, () => plain(9));
      leg(ctx, c, c.trousers, 6, 20, 8, 2);
      px(ctx, c.shoes, 13, 19, 2, 3);
    } else {
      // Mariposa: rodillas abiertas en el suelo, plantas juntas y las manos en los tobillos.
      lowered(ctx, 4, 20, () => plain(0));
      leg(ctx, c, c.trousers, 1, 20, 6, 2);
      leg(ctx, c, inner, 9, 20, 6, 2);
      px(ctx, c.shoes, 6, 21, 2, 2);
      px(ctx, c.shoes, 8, 21, 2, 2);
      px(ctx, c.skin, 5, 20, 1, 1);
      px(ctx, shade(c.skin, -0.08), 10, 20, 1, 1);
    }
  } else if (pose === 19 || pose === 20) {
    // Remo: sentado abajo, en el carro. Recogido, rodillas arriba y brazos estirados
    // hacia el tirador; estirado, piernas planas, echado atrás y el tirador en el pecho.
    const finish = pose === 20;
    lowered(ctx, 5, 20, () => plain(finish ? 10 : 9), finish ? -1 : 1);
    if (finish) {
      leg(ctx, c, c.trousers, 6, 20, 8, 2);
      px(ctx, c.shoes, 13, 18, 2, 4);
      px(ctx, c.skin, 9, 17, 1, 1);
    } else {
      leg(ctx, c, c.trousers, 6, 19, 4, 2);
      leg(ctx, c, c.trousers, 9, 17, 2, 3);
      leg(ctx, c, c.trousers, 10, 20, 2, 2);
      px(ctx, c.shoes, 11, 20, 3, 2);
    }
  } else plain(pose);
}

/** Dibuja la parte de arriba bajada `dy` píxeles (y corrida `dx`) y cortada en la fila `clip`: ahí van las piernas dobladas. */
function lowered(ctx: Ctx, dy: number, clip: number, upper: () => void, dx = 0): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 16, clip);
  ctx.clip();
  ctx.translate(dx, dy);
  upper();
  ctx.restore();
}

/**
 * Tumbado boca arriba en el banco, visto desde arriba: la cabeza hacia la
 * jaula, el tronco sobre el banco y las piernas a los lados con los pies en el
 * suelo. Los brazos doblados con las manos a la altura del pecho o estirados
 * hacia arriba (hacia la cámara, así que suben en pantalla). Lo que levanta
 * (la barra) lo pone entities/Character: el mismo cuerpo vale para cualquier peso.
 */
function drawLying(ctx: Ctx, pressed: boolean, c: HumanColors): void {
  const inner = shade(c.trousers, -0.1);
  const sleeve = c.sleeves ?? c.cloth;
  const sleeveDark = c.sleeves ? shade(c.sleeves, -0.08) : c.clothDark;
  // Tumbado se ve más corto que de pie (el suelo se ve en escorzo) y con las
  // rodillas abiertas a los lados del banco: lo que lo distingue de alguien de pie.
  // Piernas: muslos abiertos desde la cadera, espinillas hacia el suelo y los pies apoyados fuera del banco.
  leg(ctx, c, c.trousers, 3, 14, 3, 2);
  leg(ctx, c, inner, 10, 14, 3, 2);
  leg(ctx, c, c.trousers, 2, 16, 2, 3);
  leg(ctx, c, inner, 12, 16, 2, 3);
  px(ctx, c.shoes, 1, 19, 3, 2);
  px(ctx, c.shoes, 12, 19, 3, 2);
  px(ctx, c.trousers, 5, 12, 6, 3);
  px(ctx, inner, 8, 12, 3, 3);
  // Tronco ancho de hombros, con la luz a la izquierda como de pie.
  px(ctx, c.cloth, 4, 7, 8, 6);
  px(ctx, c.cloth, 3, 8, 10, 3);
  px(ctx, shade(c.cloth, 0.06), 4, 7, 2, 5);
  px(ctx, c.clothDark, 10, 8, 2, 4);
  // Cabeza sobre el banco, el pelo hacia la jaula y la cara mirando al techo.
  px(ctx, c.skin, 5, 3, 6, 4);
  px(ctx, shade(c.skin, -0.07), 10, 3, 1, 4);
  px(ctx, c.hair, 5, 2, 6, 2);
  px(ctx, shade(c.hair, 0.1), 6, 2, 2, 1);
  px(ctx, PALETTE.outline, 6, 5, 1, 1);
  px(ctx, PALETTE.outline, 9, 5, 1, 1);
  if (pressed) {
    // Brazos estirados hacia el techo: desde el hombro suben en pantalla, las manos sobre la cara.
    px(ctx, sleeve, 3, 5, 2, 4);
    px(ctx, sleeveDark, 11, 5, 2, 4);
    px(ctx, c.skin, 3, 4, 2, 1);
    px(ctx, shade(c.skin, -0.08), 11, 4, 2, 1);
  } else {
    // Codos abiertos a los lados y los antebrazos arriba: la barra, en el pecho.
    px(ctx, sleeve, 0, 8, 3, 2);
    px(ctx, sleeveDark, 13, 8, 3, 2);
    px(ctx, c.skin, 1, 6, 1, 2);
    px(ctx, shade(c.skin, -0.08), 14, 6, 1, 2);
  }
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
  const stepL = pose === 1 ? 1 : 0;
  const stepR = pose === 2 ? 1 : 0;
  // Pedaleando, la rodilla que sube lleva el pie tres píxeles arriba.
  const liftL = stepL + (pose === 13 ? 3 : 0);
  const liftR = stepR + (pose === 14 ? 3 : 0);
  const inner = shade(c.trousers, -0.1);

  // Piernas y zapatos: al dar el paso, un pie se levanta un píxel.
  leg(ctx, c, c.trousers, 5, 17, 3, 5 - liftL);
  leg(ctx, c, inner, 8, 17, 3, 5 - liftR);
  px(ctx, c.shoes, 5, 22 - liftL, 3, 2);
  px(ctx, c.shoes, 8, 22 - liftR, 3, 2);
  // La entrepierna separa las dos piernas; la suela, más oscura que el empeine, asienta el pie.
  px(ctx, tone(inner, -0.22), 8, 18, 1, 4 - liftR);
  px(ctx, tone(inner, -0.1), 10, 18, 1, 4 - liftR);
  px(ctx, tone(c.shoes, -0.3), 5, 23 - liftL, 3, 1);
  px(ctx, tone(c.shoes, -0.3), 8, 23 - liftR, 3, 1);
  // Uniforme: la franja baja por el canto de fuera de cada pernera, de la cadera al tobillo.
  if (c.stripe) {
    px(ctx, c.stripe, 5, 18, 1, 4 - liftL);
    px(ctx, c.stripe, 10, 18, 1, 4 - liftR);
  }

  // Brazos: se balancean al contrario que las piernas.
  const sleeve = c.sleeves ?? c.cloth;
  const armL = 11 + b - stepL + stepR;
  const armR = 11 + b - stepR + stepL;
  const sleeveDark = c.sleeves ? shade(c.sleeves, -0.08) : c.clothDark;
  const skinDark = shade(c.skin, -0.08);
  if (toMouth(pose)) {
    // Comiendo: sólo el brazo que no sube (el que sube se pinta encima del tronco, al final).
    if (back) arm(ctx, c, 'l', 3, armL, 1, 5, sleeve, c.skin);
    else arm(ctx, c, 'l', 12, armR, 1, 5, sleeveDark, skinDark);
  } else if (pose === 13 || pose === 14) {
    // En la bici: los brazos, cortos y hacia dentro, van al manillar.
    arm(ctx, c, back ? 'l' : 'r', 3, armL, 1, 3, sleeve, c.skin);
    arm(ctx, c, back ? 'r' : 'l', 12, armR, 1, 3, sleeveDark, skinDark);
  } else if (pose === 15) {
    // Curl, abajo: brazos estirados y una mancuerna en cada mano.
    arm(ctx, c, back ? 'l' : 'r', 3, 11, 1, 5, sleeve, c.skin);
    arm(ctx, c, back ? 'r' : 'l', 12, 11, 1, 5, sleeveDark, skinDark);
  } else if (pose === 16) {
    // Curl, arriba: el antebrazo sube y la mancuerna queda a la altura del hombro.
    px(ctx, sleeve, 3, 11, 1, 3);
    px(ctx, sleeveDark, 12, 11, 1, 3);
    px(ctx, c.skin, 3, 10, 1, 1);
    px(ctx, skinDark, 12, 10, 1, 1);
  } else if (pose === 17) {
    // Barra a la espalda: los codos abajo y las manos arriba, agarrándola junto a los hombros.
    px(ctx, sleeve, 3, 10, 1, 3);
    px(ctx, sleeveDark, 12, 10, 1, 3);
    px(ctx, c.skin, 3, 9, 1, 1);
    px(ctx, skinDark, 12, 9, 1, 1);
  } else if (pose === 21) {
    // Estirando: los dos brazos por encima de la cabeza, las manos juntas.
    px(ctx, sleeve, 3, 1, 1, 10);
    px(ctx, sleeveDark, 12, 1, 1, 10);
    px(ctx, c.skin, 4, 0, 8, 1);
  } else if (pose === 23) {
    // Polea: los brazos arriba, estirados, con un agarre en cada mano.
    px(ctx, sleeve, 3, 4, 1, 7);
    px(ctx, sleeveDark, 12, 4, 1, 7);
    px(ctx, c.skin, 3, 2, 1, 2);
    px(ctx, skinDark, 12, 2, 1, 2);
    px(ctx, PALETTE.ink, 2, 1, 3, 1);
    px(ctx, PALETTE.ink, 11, 1, 3, 1);
  } else if (pose === 6) {
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
  } else if (pose === 34) {
    // Foto: los dos brazos suben y las manos quedan delante de la cara (se pintan al final).
    px(ctx, sleeve, 3, 9 + b, 1, 3);
    px(ctx, sleeveDark, 12, 9 + b, 1, 3);
  } else if (onPhone(pose)) {
    // Sólo el brazo: el antebrazo va doblado hacia el pecho y se pinta encima del tronco.
    px(ctx, sleeve, 3, 11 + b, 1, 3);
    px(ctx, sleeveDark, 12, 11 + b, 1, 3);
  } else {
    // De frente, el brazo derecho queda a la izquierda de la imagen; de espaldas, al revés.
    arm(ctx, c, back ? 'l' : 'r', 3, armL, 1, 5, sleeve, c.skin);
    arm(ctx, c, back ? 'r' : 'l', 12, armR, 1, 5, sleeveDark, shade(c.skin, -0.08));
  }

  // Tronco: hombros, luz a la izquierda, cintura oscura.
  // Rampa de cuatro pasos de izquierda a derecha: luz, base, semisombra y sombra. La tela tiene
  // volumen redondo en vez de dos franjas planas.
  px(ctx, c.cloth, 4, 10 + b, 8, 7 - b);
  px(ctx, tone(c.cloth, 0.12), 4, 10 + b, 2, 6 - b);
  px(ctx, tone(c.cloth, -0.07), 9, 11 + b, 1, 5 - b);
  px(ctx, c.clothDark, 10, 11 + b, 2, 5 - b);
  px(ctx, c.clothDark, 4, 16, 8, 1);
  if (!back) px(ctx, shade(c.skin, -0.06), 7, 10 + b, 2, 1); // escote
  // Volumen de la ropa: el hombro con luz, el cuello marcado, un pliegue al centro y el cinturón que
  // separa tronco y piernas. Un píxel cada cosa: se lee a distancia sin recargar.
  px(ctx, tone(c.cloth, 0.2), 4, 10 + b, 3, 1);
  if (back) px(ctx, tone(c.cloth, 0.1), 7, 10 + b, 1, 1);
  // Bajo el brazo de la sombra, la tela se hunde: separa brazo y tronco.
  px(ctx, tone(c.clothDark, -0.2), 11, 11 + b, 1, 2);
  if (!back) {
    px(ctx, tone(c.cloth, -0.24), 6, 10 + b, 1, 1);
    px(ctx, tone(c.cloth, -0.24), 9, 10 + b, 1, 1);
    // Pliegues que bajan del hombro de luz hacia la cintura, en diagonal: tela, no un bloque.
    if (b < 3) {
      px(ctx, tone(c.cloth, -0.12), 7, 13 + b, 1, 1);
      px(ctx, tone(c.cloth, -0.12), 8, 14 + b, 1, 1);
      px(ctx, tone(c.cloth, 0.08), 6, 12 + b, 1, 1);
      px(ctx, tone(c.cloth, -0.08), 9, 12 + b, 1, 1);
    }
  } else if (b < 3) {
    // De espaldas: la columna, un surco suave en la tela.
    px(ctx, tone(c.cloth, -0.08), 8, 12 + b, 1, 3);
  }
  if (b < 3) px(ctx, tone(c.trousers, -0.34), 5, 17, 6, 1);
  if (!seated(pose) && pose !== 13 && pose !== 14) {
    // El canto de la pierna de la luz; con uniforme, ahí va su franja (ver arriba).
    px(ctx, c.stripe ?? tone(c.trousers, 0.12), 5, 18, 1, 4 - stepL);
    px(ctx, tone(c.shoes, 0.32), 5, 22 - liftL, 1, 1);
    px(ctx, tone(c.shoes, 0.32), 8, 22 - liftR, 1, 1);
    // Al dar el paso, la rodilla que avanza coge luz: el paso se lee aunque el pie sólo suba un píxel.
    if (stepL) px(ctx, tone(c.trousers, 0.16), 6, 19, 1, 1);
    if (stepR) px(ctx, tone(inner, 0.14), 9, 19, 1, 1);
  }

  // Cuello y cabeza redondeada.
  px(ctx, shade(c.skin, -0.1), 7, 9 + b, 2, 1);
  const neck = inkAt(c, 'neck');
  if (neck) px(ctx, neck, back ? 7 : 8, 9 + b, 1, 1);
  px(ctx, c.skin, 5, 2 + b, 6, 7);
  px(ctx, c.skin, 4, 3 + b, 8, 5);
  px(ctx, shade(c.skin, -0.07), 10, 3 + b, 2, 5);
  if (!back) {
    // Modelado de la cara, por debajo de rasgos y pelo: la barbilla en sombra, la cuenca del ojo, la
    // nariz que echa su sombra a la derecha (luz del noroeste) y un punto de rubor en cada mejilla.
    px(ctx, tone(c.skin, -0.08), 5, 8 + b, 6, 1);
    px(ctx, tone(c.skin, -0.05), 6, 4 + b, 1, 1);
    px(ctx, tone(c.skin, -0.06), 9, 4 + b, 1, 1);
    px(ctx, tone(c.skin, 0.08), 5, 5 + b, 1, 1);
    px(ctx, tone(c.skin, -0.12), 8, 6 + b, 1, 1);
    px(ctx, blend(c.skin, BLUSH, 0.2), 5, 7 + b, 1, 1);
    px(ctx, blend(tone(c.skin, -0.07), BLUSH, 0.18), 10, 7 + b, 1, 1);
    // Mirando el móvil, los ojos bajan: medio ojo, un píxel más abajo. Los ojos, del oscuro del
    // contorno entero: a 16 px es lo que más se lee de la cara.
    const down = onPhone(pose) ? 1 : 0;
    px(ctx, PALETTE.outline, 6, 5 + b + down, 1, 2 - down);
    px(ctx, PALETTE.outline, 9, 5 + b + down, 1, 2 - down);
    // Boca: la comisura de la luz más marcada que la de la sombra.
    px(ctx, tone(c.skin, -0.24), 7, 7 + b, 1, 1);
    px(ctx, tone(c.skin, -0.14), 8, 7 + b, 1, 1);
    face(ctx, false, b, c);
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
  if (onPhone(pose) && !back) {
    // Antebrazos hacia dentro y el móvil entre las manos, de canto: se ve su dorso.
    px(ctx, c.sleeves ?? c.cloth, 4, 13 + b, 2, 1);
    px(ctx, c.sleeves ? shade(c.sleeves, -0.08) : c.clothDark, 10, 13 + b, 2, 1);
    px(ctx, c.skin, 6, 13 + b, 1, 2);
    px(ctx, shade(c.skin, -0.08), 9, 13 + b, 1, 2);
    px(ctx, PALETTE.ink, 7, 12 + b, 2, 3);
  }
  if (pose === 6) {
    // La barra por encima de la cabeza, con un disco a cada lado.
    px(ctx, PALETTE.metal, 1, 3, 14, 1);
    px(ctx, PALETTE.ink, 0, 1, 2, 5);
    px(ctx, PALETTE.ink, 14, 1, 2, 5);
  }
  if (toMouth(pose)) {
    // Un bocado: el antebrazo sube a la boca con el tenedor; de espaldas asoma por un lado.
    const hand = back ? 12 : 3;
    px(ctx, sleeve, hand, 10 + b, 1, 3);
    // El antebrazo cruza por delante del pecho: en el tono oscuro de la manga, para que se lea sobre el tronco.
    px(ctx, sleeveDark, back ? 11 : 4, 9 + b, 2, 1);
    if (!back) {
      px(ctx, c.skin, 6, 8 + b, 1, 2);
      if (pose === 26) px(ctx, PALETTE.metalLit, 6, 6 + b, 1, 2);
    }
  }
  if (pose === 34) {
    // El móvil en alto delante de la cara: de frente se ve su dorso; de espaldas, la pantalla encendida.
    px(ctx, sleeve, 4, 8 + b, 2, 1);
    px(ctx, sleeve, 10, 8 + b, 2, 1);
    px(ctx, c.skin, 5, 6 + b, 1, 2);
    px(ctx, c.skin, 10, 6 + b, 1, 2);
    px(ctx, PALETTE.ink, 6, 4 + b, 4, 3);
    if (back) px(ctx, PALETTE.glassLit, 7, 5 + b, 2, 1);
  }
  if (pose === 15 || pose === 16) {
    // Las mancuernas, por encima del tronco: junto a la cadera o a la altura del hombro.
    const y = pose === 15 ? 16 : 9;
    dumbbell(ctx, 3, y);
    dumbbell(ctx, 12, y);
  }
  if (pose === 17) {
    // La barra cruzada sobre los hombros, por detrás del cuello, con sus discos.
    px(ctx, PALETTE.metalLit, 0, 9, 16, 1);
    plate(ctx, 0, 6);
    plate(ctx, 14, 6);
  }
}

/** Mancuerna en la mano: la empuñadura en `x` y un disco oscuro a cada lado. */
function dumbbell(ctx: Ctx, x: number, y: number): void {
  px(ctx, PALETTE.metal, x - 1, y, 3, 1);
  px(ctx, PALETTE.ink, x - 2, y - 1, 1, 3);
  px(ctx, PALETTE.ink, x + 2, y - 1, 1, 3);
}

/** Disco de barra de canto: dos píxeles de ancho, con el borde de arriba con luz. */
function plate(ctx: Ctx, x: number, y: number): void {
  px(ctx, PALETTE.ink, x, y, 2, 7);
  px(ctx, shade(PALETTE.ink, 0.14), x, y, 2, 1);
}

function hairFront(ctx: Ctx, back: boolean, b: number, c: HumanColors): void {
  const hair = c.hair;
  const lit = shade(hair, 0.1);
  const style = c.hairStyle ?? 'short';
  if (style === 'buzz') {
    px(ctx, hair, 5, 1 + b, 6, 2);
    px(ctx, hair, 4, 2 + b, 8, 1);
    px(ctx, tone(hair, 0.14), 6, 1 + b, 2, 1);
    px(ctx, tone(hair, -0.12), 10, 2 + b, 2, 1);
    if (back) {
      px(ctx, hair, 4, 3 + b, 8, 3);
      px(ctx, tone(hair, -0.14), 4, 5 + b, 8, 1);
    }
    return;
  }
  if (style === 'bald') {
    // Calvo: pelo sólo a los lados, sobre las orejas; de espaldas, la nuca. Un brillo en la coronilla.
    px(ctx, hair, 4, 4 + b, 1, 2);
    px(ctx, hair, 11, 4 + b, 1, 2);
    if (back) px(ctx, hair, 4, 5 + b, 8, 2);
    px(ctx, shade(c.skin, 0.1), 6, 2 + b, 2, 1);
    hat(ctx, back, b, c);
    return;
  }
  if (style === 'afro') {
    // Volumen redondo alrededor de la cabeza; la cara queda al aire.
    crown(ctx, hair, 4, b - 1, 8, 1);
    crown(ctx, hair, 3, b, 10, 3);
    px(ctx, hair, 2, 1 + b, 2, 6);
    px(ctx, hair, 12, 1 + b, 2, 6);
    crown(ctx, lit, 4, b, 3, 1);
    // Volumen: brillo arriba a la izquierda, la masa de la derecha y la de abajo en sombra.
    crown(ctx, tone(hair, 0.2), 5, b, 1, 1);
    px(ctx, tone(hair, 0.08), 2, 2 + b, 1, 3);
    px(ctx, tone(hair, -0.16), 12, 4 + b, 2, 3);
    if (back) {
      px(ctx, hair, 3, 3 + b, 10, 6);
      px(ctx, tone(hair, -0.16), 3, 8 + b, 10, 1);
      px(ctx, tone(hair, -0.08), 10, 3 + b, 3, 5);
    }
    hat(ctx, back, b, c);
    return;
  }
  // Base: casco de pelo con brillo arriba a la izquierda, un mechón de luz y el borde de abajo en sombra (volumen).
  px(ctx, hair, 5, 1 + b, 6, 1);
  px(ctx, hair, 4, 2 + b, 8, 2);
  // Brillo en arco sobre la coronilla (más fuerte arriba, se apaga hacia los lados) y la masa de la
  // derecha en sombra fría: el casco pasa a tener volumen.
  px(ctx, tone(hair, 0.12), 5, 2 + b, 1, 1);
  px(ctx, tone(hair, 0.18), 6, 2 + b, 1, 1);
  px(ctx, tone(hair, 0.26), 6, 1 + b, 2, 1);
  px(ctx, tone(hair, 0.1), 8, 1 + b, 1, 1);
  px(ctx, tone(hair, -0.1), 10, 1 + b, 1, 1);
  px(ctx, tone(hair, -0.12), 11, 2 + b, 1, 1);
  if (back) {
    // De espaldas, la nuca: brillo arriba a la izquierda, un mechón central y la sombra abajo (sin la
    // franja oscura de la fila 3, que de espaldas se leía como una raja en la cabeza).
    px(ctx, hair, 4, 4 + b, 8, 4);
    px(ctx, tone(hair, 0.1), 5, 3 + b, 2, 2);
    px(ctx, tone(hair, -0.1), 8, 4 + b, 1, 3);
    px(ctx, tone(hair, -0.12), 10, 3 + b, 2, 4);
    px(ctx, tone(hair, -0.2), 4, 7 + b, 8, 1);
  } else {
    px(ctx, tone(hair, -0.18), 9, 3 + b, 3, 1);
    px(ctx, hair, 4, 4 + b, 3, 1); // flequillo de lado
    px(ctx, hair, 4, 5 + b, 1, 1);
    px(ctx, hair, 11, 4 + b, 1, 2);
    // Puntas del flequillo y la patilla, en sombra: el pelo cae sobre la frente.
    px(ctx, tone(hair, -0.12), 6, 4 + b, 1, 1);
    px(ctx, tone(hair, -0.14), 4, 5 + b, 1, 1);
    px(ctx, tone(hair, -0.16), 11, 5 + b, 1, 1);
  }
  if (style === 'braids' || style === 'locs') {
    // Trenzas largas y finas o rastas más gruesas y cortas: mechones con su brillo alterno.
    const len = style === 'braids' ? 10 : 8;
    const w = style === 'braids' ? 1 : 2;
    px(ctx, hair, 4 - w, 3 + b, w, len);
    px(ctx, hair, 12, 3 + b, w, len);
    for (let y = 4; y < 3 + len; y += 2) {
      px(ctx, lit, 4 - w, y + b, 1, 1);
      px(ctx, lit, 12, y + b, 1, 1);
    }
    if (back) {
      px(ctx, hair, 4, 8 + b, 8, len - 4);
      for (let x = 5; x < 12; x += 2) px(ctx, lit, x, 9 + b, 1, len - 6);
    }
  } else if (style === 'ponytail') {
    if (back) {
      px(ctx, hair, 7, 5 + b, 2, 7);
      px(ctx, lit, 7, 6 + b, 1, 5);
    }
  } else if (style === 'curly') {
    px(ctx, hair, 3, 2 + b, 1, 4);
    px(ctx, hair, 12, 2 + b, 1, 4);
    crown(ctx, hair, 5, b, 1, 1);
    crown(ctx, hair, 8, b, 2, 1);
    px(ctx, lit, 9, 1 + b, 1, 1);
    // Rizos: puntos de luz sueltos a la izquierda y el lado de la sombra más hundido.
    px(ctx, tone(hair, 0.16), 3, 3 + b, 1, 1);
    px(ctx, tone(hair, -0.16), 12, 3 + b, 1, 3);
  } else if (style === 'bun') {
    crown(ctx, hair, 6, b - 1, 4, 2);
    crown(ctx, lit, 6, b - 1, 2, 1);
  } else if (style === 'bob' || style === 'long') {
    // Melena: el lado de la luz con su brillo arriba, el de la sombra más oscuro y las puntas cerradas.
    const len = style === 'bob' ? 6 : 10;
    px(ctx, hair, 3, 3 + b, 1, len);
    px(ctx, hair, 12, 3 + b, 1, len);
    px(ctx, tone(hair, 0.12), 3, 3 + b, 1, 2);
    px(ctx, tone(hair, -0.14), 12, 3 + b, 1, len);
    px(ctx, tone(hair, -0.12), 3, 2 + len + b, 1, 1);
    if (back && style === 'bob') px(ctx, tone(hair, -0.14), 4, 8 + b, 8, 1);
    if (back && style === 'long') {
      px(ctx, hair, 4, 8 + b, 8, 5);
      px(ctx, lit, 5, 12 + b, 6, 1);
      // Mechones que bajan por la espalda.
      px(ctx, tone(hair, -0.12), 7, 8 + b, 1, 4);
      px(ctx, tone(hair, -0.12), 10, 9 + b, 1, 3);
      px(ctx, tone(hair, 0.08), 5, 8 + b, 1, 3);
    }
  }
  hat(ctx, back, b, c);
}

function hat(ctx: Ctx, back: boolean, b: number, c: HumanColors): void {
  if (!c.cap) return;
  // Gorra: copa con brillo y, de frente, la visera sobre la frente.
  px(ctx, c.cap, 4, b, 8, back ? 4 : 3);
  px(ctx, shade(c.cap, 0.12), 5, b, 2, 1);
  if (!back) px(ctx, shade(c.cap, -0.2), 4, 3 + b, 8, 1);
}

/** De perfil se ve el brazo cercano: el derecho mirando a la derecha; el izquierdo, en espejo. */
function drawSide(ctx: Ctx, pose: Pose, c: HumanColors, near: 'r' | 'l'): void {
  const b = drop(pose);
  const far = shade(c.trousers, -0.12);
  // En guardia y al golpear, piernas abiertas como al dar un paso, con el pie de delante hacia el otro.
  const step = pose === 1 || pose === 2 || pose === 8 || pose === 9 || pose === 27;

  // Piernas: juntas quieto; al andar, una delante y otra detrás; sentado, el muslo hacia delante.
  // Suela más oscura que el empeine en cada zapato: el pie se asienta.
  if (seated(pose)) {
    leg(ctx, c, c.trousers, 6, 17, 6, 2);
    leg(ctx, c, c.trousers, 10, 19, 2, 3);
    px(ctx, c.shoes, 10, 22, 3, 2);
    px(ctx, tone(c.trousers, 0.14), 10, 17, 2, 1);
    px(ctx, tone(c.shoes, -0.3), 10, 23, 3, 1);
  } else if (step) {
    const [front, rear] = pose === 2 ? [far, c.trousers] : [c.trousers, far];
    leg(ctx, c, rear, 5, 17, 3, 2);
    leg(ctx, c, rear, 4, 19, 3, 3);
    px(ctx, c.shoes, 3, 22, 4, 2);
    leg(ctx, c, front, 8, 17, 3, 2);
    leg(ctx, c, front, 9, 19, 3, 3);
    px(ctx, c.shoes, 9, 22, 4, 2);
    // La rodilla de delante coge luz y la pierna de atrás se hunde: el paso se lee de lejos.
    px(ctx, tone(front, 0.14), 10, 19, 1, 1);
    px(ctx, tone(rear, -0.12), 4, 20, 1, 2);
    px(ctx, tone(c.shoes, -0.3), 3, 23, 4, 1);
    px(ctx, tone(c.shoes, -0.3), 9, 23, 4, 1);
    // Uniforme: la franja de la pierna de cerca (la que da a la cámara), siguiendo su línea.
    if (c.stripe) {
      if (pose === 2) {
        px(ctx, c.stripe, 6, 18, 1, 1);
        px(ctx, c.stripe, 5, 19, 1, 3);
      } else {
        px(ctx, c.stripe, 9, 18, 1, 1);
        px(ctx, c.stripe, 10, 19, 1, 3);
      }
    }
  } else {
    leg(ctx, c, c.trousers, 6, 17, 4, 5);
    px(ctx, far, 6, 18, 1, 4);
    px(ctx, c.shoes, 6, 22, 5, 2);
    px(ctx, c.stripe ?? tone(c.trousers, 0.1), 8, 18, 1, c.stripe ? 4 : 3);
    px(ctx, tone(c.shoes, -0.3), 6, 23, 5, 1);
  }

  // Tronco de perfil, con el hombro al sol y el cinturón.
  px(ctx, c.cloth, 5, 10 + b, 6, 7 - b);
  px(ctx, tone(c.cloth, 0.12), 5, 10 + b, 2, 6 - b);
  px(ctx, c.clothDark, 5, 16, 6, 1);
  px(ctx, shade(c.cloth, 0.16), 5, 10 + b, 4, 1);
  px(ctx, shade(c.cloth, -0.1), 10, 11 + b, 1, 5 - Math.min(b, 4));
  if (b < 3) px(ctx, shade(c.trousers, -0.32), 5, 17, 6, 1);
  if (!seated(pose)) px(ctx, shade(c.shoes, 0.3), step ? 12 : 10, 22, 1, 1);

  // Cabeza de perfil: nuca, oreja, ojo y nariz hacia delante.
  px(ctx, shade(c.skin, -0.1), 7, 9 + b, 2, 1);
  const nape = inkAt(c, 'neck');
  if (nape) px(ctx, nape, 7, 9 + b, 1, 1);
  px(ctx, c.skin, 5, 2 + b, 7, 7);
  px(ctx, c.skin, 12, 5 + b, 1, 2);
  // Modelado de perfil: la mandíbula en sombra, la oreja con su hueco, la mejilla con rubor, la
  // punta de la nariz con su sombra debajo y la boca, que antes no se veía.
  px(ctx, tone(c.skin, -0.08), 8, 8 + b, 4, 1);
  px(ctx, tone(c.skin, -0.06), 7, 5 + b, 1, 1);
  px(ctx, tone(c.skin, 0.08), 11, 4 + b, 1, 1);
  px(ctx, blend(c.skin, BLUSH, 0.2), 10, 7 + b, 1, 1);
  px(ctx, tone(c.skin, -0.1), 12, 6 + b, 1, 1);
  px(ctx, tone(c.skin, -0.2), 11, 7 + b, 1, 1);
  px(ctx, PALETTE.outline, 10, 5 + b, 1, 2);
  px(ctx, tone(c.skin, -0.14), 7, 6 + b, 1, 1);
  face(ctx, true, b, c);

  const hair = c.hair;
  const style = c.hairStyle ?? 'short';
  if (style === 'buzz') {
    px(ctx, hair, 5, 1 + b, 6, 2);
    px(ctx, hair, 5, 3 + b, 2, 2);
    px(ctx, tone(hair, 0.14), 7, 1 + b, 2, 1);
    px(ctx, tone(hair, -0.12), 5, 4 + b, 2, 1);
  } else if (style === 'bald') {
    px(ctx, hair, 5, 4 + b, 2, 2);
    px(ctx, shade(c.skin, 0.1), 7, 2 + b, 2, 1);
  } else if (style === 'afro') {
    crown(ctx, hair, 4, b - 1, 8, 1);
    crown(ctx, hair, 3, b, 9, 3);
    px(ctx, hair, 2, 1 + b, 4, 7);
    crown(ctx, shade(hair, 0.1), 5, b, 3, 1);
    px(ctx, tone(hair, -0.16), 2, 5 + b, 3, 2);
  } else {
    px(ctx, hair, 5, 1 + b, 6, 1);
    px(ctx, hair, 4, 2 + b, 8, 2);
    // Brillo en arco sobre la coronilla, la frente del pelo en sombra y la nuca más oscura abajo.
    px(ctx, tone(hair, 0.14), 6, 2 + b, 2, 1);
    px(ctx, tone(hair, 0.26), 7, 1 + b, 2, 1);
    px(ctx, tone(hair, -0.12), 10, 3 + b, 2, 1);
    px(ctx, hair, 4, 4 + b, 3, 3);
    px(ctx, tone(hair, -0.18), 4, 6 + b, 3, 1);
    px(ctx, tone(hair, -0.08), 6, 4 + b, 1, 2);
    px(ctx, hair, 11, 4 + b, 1, 1);
    if (style === 'curly') px(ctx, hair, 3, 2 + b, 2, 5);
    if (style === 'braids' || style === 'locs') {
      const len = style === 'braids' ? 10 : 8;
      px(ctx, hair, 3, 4 + b, style === 'braids' ? 2 : 3, len);
      for (let y = 5; y < 4 + len; y += 2) px(ctx, shade(hair, 0.1), 3, y + b, 1, 1);
    }
    if (style === 'ponytail') {
      px(ctx, hair, 2, 3 + b, 2, 1);
      px(ctx, hair, 1, 4 + b, 2, 5);
    }
    if (style === 'bun') px(ctx, hair, 3, 1 + b, 2, 2);
    if (style === 'bob') px(ctx, hair, 4, 7 + b, 3, 2);
    if (style === 'long') {
      px(ctx, hair, 3, 4 + b, 3, 9);
      px(ctx, shade(hair, 0.1), 3, 12 + b, 3, 1);
      // Mechones: el de fuera con luz, una raya de sombra entre medias y el pegado a la nuca, oscuro.
      px(ctx, tone(hair, 0.1), 3, 5 + b, 1, 4);
      px(ctx, tone(hair, -0.12), 4, 7 + b, 1, 5);
      px(ctx, tone(hair, -0.18), 5, 6 + b, 1, 6);
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
  if (toMouth(pose)) {
    // Un bocado: el antebrazo sube y la mano llega a la boca.
    px(ctx, sleeve, 7, 11 + b, 2, 3);
    px(ctx, sleeve, 9, 10 + b, 2, 2);
    px(ctx, c.skin, 11, 8 + b, 1, 2);
    if (pose === 26) px(ctx, PALETTE.metalLit, 12, 7 + b, 1, 1);
  } else if (pose === 34) {
    // Foto: el brazo estirado hacia delante a la altura de los ojos y el móvil de canto.
    px(ctx, sleeve, 7, 10 + b, 2, 2);
    px(ctx, sleeve, 9, 8 + b, 3, 2);
    px(ctx, c.skin, 12, 7 + b, 1, 2);
    px(ctx, PALETTE.ink, 13, 4 + b, 1, 5);
  } else if (onPhone(pose)) {
    // Antebrazo levantado y el móvil delante de la cara, con la pantalla hacia ella.
    px(ctx, sleeve, 7, 11 + b, 2, 3);
    px(ctx, sleeve, 9, 12 + b, 2, 2);
    px(ctx, c.skin, 11, 11 + b, 1, 2);
    px(ctx, PALETTE.ink, 12, 9 + b, 1, 4);
    px(ctx, PALETTE.glassLit, 11, 10 + b, 1, 1);
    // Ojo bajado: sólo su mitad de abajo.
    px(ctx, c.skin, 10, 5 + b, 1, 1);
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
  } else if (pose === 27) {
    // Carga visible: puño atrás, el otro protege la barbilla.
    px(ctx, sleeve, 4, 10 + b, 3, 2);
    px(ctx, sleeve, 4, 8 + b, 2, 3);
    px(ctx, c.skin, 3, 7 + b, 3, 2);
    px(ctx, c.skin, 11, 8 + b, 2, 2);
  } else if (pose === 28) {
    // Se agacha con ambos antebrazos protegiendo la cabeza.
    px(ctx, sleeve, 9, 10 + b, 3, 2);
    px(ctx, sleeve, 11, 8 + b, 2, 3);
    px(ctx, c.skin, 11, 7 + b, 3, 2);
  } else if (pose === 29) {
    // Cansado/acorralado: hombros bajos y mano en el costado, sin heridas.
    px(ctx, sleeve, 7, 11 + b, 2, 4);
    px(ctx, c.skin, 8, 14 + b, 3, 2);
    px(ctx, c.clothDark, 9, 11 + b, 2, 3);
  } else if (pose === 30) {
    // Victoria: ambos puños arriba, piernas quietas; no hay derribo ni sangre.
    px(ctx, sleeve, 4, 4, 2, 7);
    px(ctx, c.skin, 4, 2, 2, 2);
    px(ctx, sleeve, 10, 4, 2, 7);
    px(ctx, c.skin, 10, 2, 2, 2);
  } else if (pose === 31) {
    // Discusión breve: palma abierta, un gesto hacia el rival.
    px(ctx, sleeve, 8, 11, 4, 2);
    px(ctx, c.skin, 11, 8, 2, 4);
    px(ctx, c.skin, 13, 8, 1, 2);
  } else if (pose === 9) {
    // Golpe: el brazo estirado hacia delante a la altura del hombro.
    px(ctx, sleeve, 8, 10 + b, 5, 2);
    px(ctx, c.skin, 13, 10 + b, 2, 2);
  } else if (pose === 10) {
    // Encaja: echado atrás, el brazo se le va hacia la espalda.
    px(ctx, sleeve, 4, 11, 2, 3);
    px(ctx, c.skin, 3, 14, 2, 1);
  } else if (pose === 1) {
    // El brazo echa su sombra en el tronco, del lado contrario a la luz: se separa de la tela.
    px(ctx, tone(c.cloth, -0.14), 7, 12 + b, 1, Math.max(0, Math.min(3, 4 - b)));
    arm(ctx, c, near, 5, 11 + b, 2, 4, sleeve, c.skin);
  } else if (pose === 2) {
    arm(ctx, c, near, 9, 11 + b, 2, 4, sleeve, c.skin);
  } else {
    px(ctx, tone(c.cloth, -0.14), 9, 12 + b, 1, Math.max(0, Math.min(3, 4 - b)));
    arm(ctx, c, near, 7, 11 + b, 2, 5, sleeve, c.skin);
  }
}

/**
 * Luz de forma por dentro (world/Shading: no toca el alfa, la silueta no cambia) y contorno de un
 * píxel alrededor: se lee sobre cualquier suelo. Las dos en la misma lectura del lienzo, que el
 * atlas de gente tiene decenas de miles de poses.
 */
function outline(ctx: Ctx): void {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  shadeForm(d, w, h);
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

/**
 * Copa de un peinado alto (afro, moño, rizos): nunca por encima de la fila 1.
 * La fila 0 no tiene dónde pintar el contorno y la -1 queda fuera del lienzo
 * de 16×24, así que se recortaba la copa. Se baja el borde de arriba y la base
 * del volumen se queda donde estaba.
 */
function crown(ctx: Ctx, color: string, x: number, y: number, w: number, h: number): void {
  const top = Math.max(1, y);
  if (h - (top - y) > 0) px(ctx, color, x, top, w, h - (top - y));
}
