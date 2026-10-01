import { PALETTE } from '../config/constants';
import type { Facing, NpcLook } from '../types/game';
import { px, shade, type Ctx } from './paint';

/**
 * Personas de 16x24 con los pies en la base (unas 3,5 cabezas de alto, ver drawFrontBack): jugador, personajes con nombre y
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
const drop = (pose: Pose): number => (pose === 28 ? 4 : pose === 29 ? 2 : pose === 24 ? 4 : pose === 4 || pose === 25 || pose === 26 || pose === 33 || pose === 13 || pose === 14 ? 3 : (pose >= 1 && pose <= 3) || pose === 8 || pose === 9 ? 1 : 0);
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
    px(ctx, '#5a3a26', x, 14, 1, 10);
    px(ctx, '#7b5a3d', x, 14, 1, 1);
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
  // Filas de la anatomía (drawFrontBack): hombros 9, pecho 10–12, cintura 13, cadera 14, piernas 15–21.
  if (build === 'thin') narrow(9, 21);
  else if (build === 'athletic') widen(9, 12);
  else if (build === 'muscular') {
    widen(9, 14);
    widen(9, 11);
  } else if (build === 'stocky') widen(9, 21);
  else if (build === 'curvy') {
    // Cintura marcada y cadera ancha: se ensancha de la cadera a los muslos.
    widen(14, 18);
    narrow(13, 13);
  } else if (build === 'heavy') {
    widen(10, 17);
    widen(12, 15);
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

/**
 * Cara: cejas, mandíbula, barba, gafas y pendiente; de frente o de perfil. Encima de la piel y debajo del pelo.
 * Cara de 6 px de ancho (columnas 5–10): ojos en la fila 4, boca en la 6, barbilla en la 7.
 */
function face(ctx: Ctx, side: boolean, b: number, c: HumanColors): void {
  const hair = c.hair;
  const skinShade = shade(c.skin, -0.18);
  if (side) {
    if (c.facialHair === 'beard') {
      px(ctx, hair, 7, 5 + b, 1, 2);
      px(ctx, hair, 8, 6 + b, 3, 1);
      px(ctx, hair, 7, 7 + b, 3, 1);
    } else if (c.facialHair === 'moustache') px(ctx, hair, 10, 5 + b, 1, 1);
    else if (c.facialHair === 'stubble') {
      px(ctx, skinShade, 8, 6 + b, 2, 1);
      px(ctx, skinShade, 7, 7 + b, 3, 1);
    }
    if (c.brows === 'thick') px(ctx, hair, 9, 3 + b, 2, 1);
    if (c.glasses) px(ctx, c.glasses === 'dark' ? PALETTE.ink : '#3a3a44', 8, 4 + b, 3, 1);
    if (c.piercing === 'nose') px(ctx, '#d8d2c4', 11, 5 + b, 1, 1);
    if (c.headphones) px(ctx, c.headphones, 6, 3 + b, 2, 3);
    return;
  }
  if (c.jaw === 'square') {
    px(ctx, c.skin, 5, 7 + b, 1, 1);
    px(ctx, shade(c.skin, -0.1), 10, 7 + b, 1, 1);
  } else if (c.jaw === 'narrow') {
    ctx.clearRect(6, 7 + b, 1, 1);
    ctx.clearRect(9, 7 + b, 1, 1);
    px(ctx, shade(c.skin, -0.1), 7, 7 + b, 2, 1);
  }
  if (c.facialHair === 'beard') {
    px(ctx, hair, 5, 5 + b, 1, 2);
    px(ctx, hair, 10, 5 + b, 1, 2);
    px(ctx, hair, 6, 6 + b, 4, 2);
    px(ctx, shade(hair, 0.12), 6, 6 + b, 1, 1);
    px(ctx, shade(c.skin, -0.25), 7, 6 + b, 2, 1);
  } else if (c.facialHair === 'moustache') px(ctx, hair, 6, 5 + b, 4, 1);
  else if (c.facialHair === 'stubble') {
    px(ctx, skinShade, 6, 7 + b, 4, 1);
    px(ctx, skinShade, 5, 6 + b, 1, 1);
    px(ctx, skinShade, 10, 6 + b, 1, 1);
  }
  if (c.brows === 'thick') {
    px(ctx, hair, 5, 3 + b, 2, 1);
    px(ctx, hair, 9, 3 + b, 2, 1);
  } else if (c.brows === 'fine') {
    px(ctx, shade(c.skin, -0.25), 6, 3 + b, 1, 1);
    px(ctx, shade(c.skin, -0.25), 9, 3 + b, 1, 1);
  }
  if (c.glasses === 'dark') {
    px(ctx, PALETTE.ink, 5, 4 + b, 2, 1);
    px(ctx, PALETTE.ink, 9, 4 + b, 2, 1);
    px(ctx, PALETTE.ink, 7, 4 + b, 2, 1);
  } else if (c.glasses) {
    px(ctx, '#2e2e38', 5, 4 + b, 6, 1);
    px(ctx, '#b4c4d2', 5, 4 + b, 1, 1);
    px(ctx, '#b4c4d2', 9, 4 + b, 1, 1);
  }
  if (c.piercing === 'nose') px(ctx, '#d8d2c4', 8, 5 + b, 1, 1);
  else if (c.piercing === 'brow') px(ctx, '#d8d2c4', 10, 3 + b, 1, 1);
  if (c.headphones) {
    px(ctx, c.headphones, 4, 3 + b, 1, 3);
    px(ctx, c.headphones, 11, 3 + b, 1, 3);
    px(ctx, shade(c.headphones, -0.2), 5, 1 + b, 6, 1);
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
  const inner = shade(c.trousers, -0.12);
  if (pose === 18) {
    lowered(ctx, 3, 18, () => plain(17));
    if (side) {
      // De perfil: el muslo hacia delante y la rodilla por delante del pie.
      leg(ctx, c, c.trousers, 6, 18, 6, 2);
      leg(ctx, c, c.trousers, 9, 20, 3, 2);
      shoe(ctx, c, 8, 22, 5);
    } else {
      // Rodillas abiertas hacia fuera, pies bien apoyados.
      leg(ctx, c, c.trousers, 3, 18, 4, 2);
      leg(ctx, c, inner, 9, 18, 4, 2);
      px(ctx, c.trousers, 4, 20, 2, 2);
      px(ctx, inner, 10, 20, 2, 2);
      shoe(ctx, c, 3, 22, 4);
      shoe(ctx, c, 9, 22, 4);
    }
  } else if (pose === 22) {
    if (side) {
      // Sentado con las piernas estiradas y los brazos hacia las puntas de los pies.
      lowered(ctx, 6, 20, () => plain(9));
      leg(ctx, c, c.trousers, 6, 20, 8, 2);
      px(ctx, c.shoes, 13, 19, 2, 3);
    } else {
      // Mariposa: rodillas abiertas en el suelo, plantas juntas y las manos en los tobillos.
      lowered(ctx, 5, 20, () => plain(0));
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
    lowered(ctx, 6, 20, () => plain(finish ? 10 : 9), finish ? -1 : 1);
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

/**
 * Zapato de `w` px: empeine con su brillo y la suela, más oscura, que pisa.
 * La suela es lo que ancla a la persona al suelo: sin ella parece flotar.
 */
function shoe(ctx: Ctx, c: HumanColors, x: number, y: number, w: number): void {
  px(ctx, c.shoes, x, y, w, 2);
  px(ctx, shade(c.shoes, -0.35), x, y + 1, w, 1);
  px(ctx, shade(c.shoes, 0.3), x, y, 1, 1);
}

/**
 * Anatomía de pie (b = 0), la misma en todas las poses: pelo 1–3, cara 3–7
 * (ojos en la 4), cuello 8, hombros 9, pecho 10–12, cintura 13, cadera 14,
 * piernas 15–21 y zapatos 22–23. Unas 3,5 cabezas de alto: la cabeza (6 px) es
 * más estrecha que los hombros (8), los brazos cuelgan aparte hasta la cadera
 * y las piernas son más de un tercio de la figura.
 */
function drawFrontBack(ctx: Ctx, back: boolean, pose: Pose, c: HumanColors): void {
  const b = drop(pose);
  const stepL = pose === 1 ? 1 : 0;
  const stepR = pose === 2 ? 1 : 0;
  // Pedaleando, la rodilla que sube lleva el pie tres píxeles arriba.
  const liftL = stepL + (pose === 13 ? 3 : 0);
  const liftR = stepR + (pose === 14 ? 3 : 0);
  const inner = shade(c.trousers, -0.12);
  const sit = seated(pose);

  // Piernas: al dar el paso, el pie que se levanta sube un píxel y la pierna se acorta.
  leg(ctx, c, c.trousers, 5, 15, 3, 7 - liftL);
  leg(ctx, c, inner, 8, 15, 3, 7 - liftR);
  // La sombra entre las piernas las separa; la luz del noroeste, en el canto de la izquierda.
  px(ctx, shade(c.trousers, -0.28), 7, 16, 1, 6 - liftL);
  if (!sit && pose !== 13 && pose !== 14) px(ctx, shade(c.trousers, 0.12), 5, 16, 1, 5 - liftL);
  // Sentado de frente, las rodillas vienen hacia la cámara: dos manchas de luz.
  if (sit) {
    px(ctx, shade(c.trousers, 0.14), 5, 18, 2, 1);
    px(ctx, shade(c.trousers, 0.04), 9, 18, 2, 1);
  }
  shoe(ctx, c, 5, 22 - liftL, 3);
  shoe(ctx, c, 8, 22 - liftR, 3);

  // Brazos: se balancean al contrario que las piernas; cuelgan aparte del tronco, hasta la cadera.
  const sleeve = c.sleeves ?? c.cloth;
  const armL = 10 + b - stepL + stepR;
  const armR = 10 + b - stepR + stepL;
  const sleeveDark = c.sleeves ? shade(c.sleeves, -0.1) : c.clothDark;
  const skinDark = shade(c.skin, -0.1);
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
    arm(ctx, c, back ? 'l' : 'r', 3, 10, 1, 5, sleeve, c.skin);
    arm(ctx, c, back ? 'r' : 'l', 12, 10, 1, 5, sleeveDark, skinDark);
  } else if (pose === 16) {
    // Curl, arriba: el antebrazo sube y la mancuerna queda a la altura del hombro.
    px(ctx, sleeve, 3, 10, 1, 3);
    px(ctx, sleeveDark, 12, 10, 1, 3);
    px(ctx, c.skin, 3, 9, 1, 1);
    px(ctx, skinDark, 12, 9, 1, 1);
  } else if (pose === 17) {
    // Barra a la espalda: los codos abajo y las manos arriba, agarrándola junto a los hombros.
    px(ctx, sleeve, 3, 9, 1, 3);
    px(ctx, sleeveDark, 12, 9, 1, 3);
    px(ctx, c.skin, 3, 8, 1, 1);
    px(ctx, skinDark, 12, 8, 1, 1);
  } else if (pose === 21) {
    // Estirando: los dos brazos por encima de la cabeza, las manos juntas.
    px(ctx, sleeve, 3, 1, 1, 9);
    px(ctx, sleeveDark, 12, 1, 1, 9);
    px(ctx, c.skin, 4, 0, 8, 1);
  } else if (pose === 23) {
    // Polea: los brazos arriba, estirados, con un agarre en cada mano.
    px(ctx, sleeve, 3, 3, 1, 7);
    px(ctx, sleeveDark, 12, 3, 1, 7);
    px(ctx, c.skin, 3, 1, 1, 2);
    px(ctx, skinDark, 12, 1, 1, 2);
    px(ctx, PALETTE.ink, 2, 0, 3, 1);
    px(ctx, PALETTE.ink, 11, 0, 3, 1);
  } else if (pose === 6) {
    // Brazos estirados por encima de la cabeza.
    px(ctx, sleeve, 3, 4, 1, 6);
    px(ctx, c.skin, 3, 3, 1, 1);
    px(ctx, sleeveDark, 12, 4, 1, 6);
    px(ctx, skinDark, 12, 3, 1, 1);
  } else if (pose === 7) {
    // Jaleando: un brazo arriba con el puño cerrado; el otro, abajo.
    px(ctx, sleeve, 3, 4, 1, 6);
    px(ctx, c.skin, 3, 2, 1, 2);
    arm(ctx, c, back ? 'r' : 'l', 12, armR, 1, 5, sleeveDark, skinDark);
  } else if (pose === 34) {
    // Foto: los dos brazos suben y las manos quedan delante de la cara (se pintan al final).
    px(ctx, sleeve, 3, 8 + b, 1, 3);
    px(ctx, sleeveDark, 12, 8 + b, 1, 3);
  } else if (onPhone(pose)) {
    // Sólo el brazo: el antebrazo va doblado hacia el pecho y se pinta encima del tronco.
    px(ctx, sleeve, 3, 10 + b, 1, 3);
    px(ctx, sleeveDark, 12, 10 + b, 1, 3);
  } else {
    // De frente, el brazo derecho queda a la izquierda de la imagen; de espaldas, al revés.
    arm(ctx, c, back ? 'l' : 'r', 3, armL, 1, 5, sleeve, c.skin);
    arm(ctx, c, back ? 'r' : 'l', 12, armR, 1, 5, sleeveDark, skinDark);
  }

  // Tronco: hombros que caen (la fila de arriba más estrecha), pecho, cintura y cadera.
  const t = 9 + b;
  px(ctx, c.cloth, 5, t, 6, 1);
  px(ctx, c.cloth, 4, t + 1, 8, 3);
  px(ctx, c.cloth, 5, t + 4, 6, 1);
  // Luz del noroeste: hombro y costado izquierdos con luz, el derecho en sombra; la axila separa el brazo.
  px(ctx, shade(c.cloth, 0.16), 5, t, 3, 1);
  px(ctx, shade(c.cloth, 0.07), 4, t + 1, 2, 3);
  px(ctx, c.clothDark, 10, t + 1, 2, 3);
  px(ctx, shade(c.clothDark, -0.06), 9, t + 4, 2, 1);
  px(ctx, shade(c.cloth, -0.16), 4, t + 3, 1, 1);
  px(ctx, shade(c.clothDark, -0.16), 11, t + 3, 1, 1);
  if (!back) {
    // Escote y un pliegue al centro: un píxel cada cosa, se lee sin recargar.
    px(ctx, shade(c.skin, -0.08), 7, t, 2, 1);
    px(ctx, shade(c.cloth, -0.22), 6, t, 1, 1);
    px(ctx, shade(c.cloth, -0.22), 9, t, 1, 1);
    if (b < 3) px(ctx, shade(c.cloth, -0.08), 8, t + 2, 1, 2);
  } else px(ctx, shade(c.cloth, -0.1), 7, t + 1, 2, 2); // la columna en la espalda
  // Cadera: el cinturón marca dónde acaba el tronco.
  px(ctx, shade(c.trousers, -0.3), 5, t + 5, 6, 1);
  px(ctx, shade(c.trousers, -0.05), 7, t + 5, 2, 1);

  // Cuello y cabeza: 6 px de ancho, con la mejilla derecha en sombra y la barbilla más estrecha.
  px(ctx, shade(c.skin, -0.14), 7, 8 + b, 2, 1);
  const neck = inkAt(c, 'neck');
  if (neck) px(ctx, neck, back ? 7 : 8, 8 + b, 1, 1);
  px(ctx, c.skin, 6, 2 + b, 4, 1);
  px(ctx, c.skin, 5, 3 + b, 6, 4);
  px(ctx, c.skin, 6, 7 + b, 4, 1);
  px(ctx, shade(c.skin, -0.08), 10, 3 + b, 1, 4);
  px(ctx, shade(c.skin, -0.08), 9, 7 + b, 1, 1);
  const style = c.hairStyle ?? 'short';
  const ears = !c.hood && (style === 'short' || style === 'buzz' || style === 'bald' || style === 'ponytail' || style === 'bun');
  if (ears) {
    px(ctx, shade(c.skin, -0.1), 4, 4 + b, 1, 2);
    px(ctx, shade(c.skin, -0.2), 11, 4 + b, 1, 2);
  }
  if (!back) {
    // Mirando el móvil, los ojos bajan un píxel.
    const down = onPhone(pose) ? 1 : 0;
    px(ctx, PALETTE.outline, 6, 4 + b + down, 1, 1);
    px(ctx, PALETTE.outline, 9, 4 + b + down, 1, 1);
    px(ctx, shade(c.skin, -0.12), 8, 5 + b, 1, 1); // la sombra de la nariz
    px(ctx, shade(c.skin, -0.2), 7, 6 + b, 2, 1); // boca
    face(ctx, false, b, c);
  }
  hairFront(ctx, back, b, c);
  if (c.hood) {
    // Capucha: la tela cubre la coronilla y los lados; de frente queda el hueco de la cara.
    const lit = shade(c.hood, 0.1);
    px(ctx, c.hood, 5, b + 1, 6, 2);
    px(ctx, lit, 6, b + 1, 3, 1);
    px(ctx, c.hood, 4, 2 + b, 1, 7);
    px(ctx, shade(c.hood, -0.12), 11, 2 + b, 1, 7);
    if (back) px(ctx, c.hood, 5, 3 + b, 6, 6);
    else {
      px(ctx, c.hood, 5, 3 + b, 1, 4);
      px(ctx, c.hood, 10, 3 + b, 1, 4);
    }
  }
  if (c.scarf) {
    // Bufanda: dos vueltas al cuello, con una punta que cuelga por delante.
    px(ctx, c.scarf, 5, 8 + b, 6, 2);
    px(ctx, shade(c.scarf, 0.12), 5, 8 + b, 3, 1);
    if (!back) px(ctx, shade(c.scarf, -0.1), 9, 10 + b, 1, 3);
  }
  if (c.earrings && !back) {
    px(ctx, c.earrings, 4, 6 + b, 1, 1);
    px(ctx, c.earrings, 11, 6 + b, 1, 1);
  }
  if (c.bag) {
    // Bandolera del hombro a la cadera contraria; de espaldas, en espejo.
    const x = (i: number): number => (back ? 10 - i : 5 + i);
    for (let i = 0; i < 5; i++) px(ctx, shade(c.bag, -0.2), x(i), 9 + b + i, 1, 1);
    px(ctx, c.bag, back ? 3 : 10, 13, 3, 3);
    px(ctx, shade(c.bag, 0.12), back ? 3 : 10, 13, 3, 1);
    px(ctx, shade(c.bag, -0.25), back ? 3 : 10, 15, 3, 1);
  }
  if (onPhone(pose) && !back) {
    // Antebrazos hacia dentro y el móvil entre las manos, de canto: se ve su dorso.
    px(ctx, c.sleeves ?? c.cloth, 4, 12 + b, 2, 1);
    px(ctx, c.sleeves ? shade(c.sleeves, -0.1) : c.clothDark, 10, 12 + b, 2, 1);
    px(ctx, c.skin, 6, 12 + b, 1, 2);
    px(ctx, skinDark, 9, 12 + b, 1, 2);
    px(ctx, PALETTE.ink, 7, 11 + b, 2, 3);
  }
  if (pose === 6) {
    // La barra por encima de la cabeza, con un disco a cada lado.
    px(ctx, PALETTE.metal, 1, 2, 14, 1);
    px(ctx, PALETTE.ink, 0, 0, 2, 5);
    px(ctx, PALETTE.ink, 14, 0, 2, 5);
  }
  if (toMouth(pose)) {
    // Un bocado: el antebrazo sube a la boca con el tenedor; de espaldas asoma por un lado.
    const hand = back ? 12 : 3;
    px(ctx, sleeve, hand, 9 + b, 1, 3);
    // El antebrazo cruza por delante del pecho: en el tono oscuro de la manga, para que se lea sobre el tronco.
    px(ctx, sleeveDark, back ? 11 : 4, 8 + b, 2, 1);
    if (!back) {
      px(ctx, c.skin, 6, 6 + b, 1, 2);
      if (pose === 26) px(ctx, PALETTE.metalLit, 6, 4 + b, 1, 2);
    }
  }
  if (pose === 34) {
    // El móvil en alto delante de la cara: de frente se ve su dorso; de espaldas, la pantalla encendida.
    px(ctx, sleeve, 4, 7 + b, 2, 1);
    px(ctx, sleeve, 10, 7 + b, 2, 1);
    px(ctx, c.skin, 5, 5 + b, 1, 2);
    px(ctx, c.skin, 10, 5 + b, 1, 2);
    px(ctx, PALETTE.ink, 6, 3 + b, 4, 3);
    if (back) px(ctx, PALETTE.glassLit, 7, 4 + b, 2, 1);
  }
  if (pose === 15 || pose === 16) {
    // Las mancuernas, por encima del tronco: junto a la cadera o a la altura del hombro.
    const y = pose === 15 ? 15 : 8;
    dumbbell(ctx, 3, y);
    dumbbell(ctx, 12, y);
  }
  if (pose === 17) {
    // La barra cruzada sobre los hombros, por detrás del cuello, con sus discos.
    px(ctx, PALETTE.metalLit, 0, 8, 16, 1);
    plate(ctx, 0, 5);
    plate(ctx, 14, 5);
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

/**
 * Pelo de frente o de espaldas sobre una cabeza de 6 px (columnas 5–10): la
 * coronilla en la fila 1, el flequillo en la 3 dejando ver la frente, y el
 * volumen de cada peinado por fuera de la cara sólo donde el peinado lo tiene.
 */
function hairFront(ctx: Ctx, back: boolean, b: number, c: HumanColors): void {
  const hair = c.hair;
  const lit = shade(hair, 0.14);
  const dark = shade(hair, -0.16);
  const style = c.hairStyle ?? 'short';
  if (style === 'buzz') {
    px(ctx, hair, 6, 1 + b, 4, 1);
    px(ctx, hair, 5, 2 + b, 6, 1);
    px(ctx, lit, 6, 2 + b, 2, 1);
    if (back) px(ctx, hair, 5, 3 + b, 6, 3);
    else {
      px(ctx, hair, 5, 3 + b, 1, 1);
      px(ctx, hair, 10, 3 + b, 1, 1);
    }
    hat(ctx, back, b, c);
    return;
  }
  if (style === 'bald') {
    // Calvo: pelo sólo a los lados, sobre las orejas; de espaldas, la nuca. Un brillo en la coronilla.
    px(ctx, hair, 5, 4 + b, 1, 2);
    px(ctx, hair, 10, 4 + b, 1, 2);
    if (back) px(ctx, hair, 5, 5 + b, 6, 2);
    px(ctx, shade(c.skin, 0.14), 6, 2 + b, 2, 1);
    hat(ctx, back, b, c);
    return;
  }
  if (style === 'afro') {
    // Volumen redondo alrededor de la cabeza; la cara queda al aire.
    px(ctx, hair, 5, b, 6, 1);
    px(ctx, hair, 4, 1 + b, 8, 1);
    px(ctx, hair, 3, 2 + b, 10, 2);
    px(ctx, hair, 3, 4 + b, 2, 3);
    px(ctx, hair, 11, 4 + b, 2, 3);
    px(ctx, lit, 5, 1 + b, 3, 1);
    px(ctx, lit, 4, 2 + b, 1, 1);
    px(ctx, dark, 11, 3 + b, 2, 3);
    if (back) px(ctx, hair, 3, 3 + b, 10, 5);
    hat(ctx, back, b, c);
    return;
  }
  // Base: casco de pelo con el brillo arriba a la izquierda y la raya al lado.
  px(ctx, hair, 6, 1 + b, 4, 1);
  px(ctx, hair, 5, 2 + b, 6, 1);
  px(ctx, lit, 6, 1 + b, 2, 1);
  px(ctx, lit, 5, 2 + b, 2, 1);
  px(ctx, shade(hair, 0.26), 6, 1 + b, 1, 1);
  if (back) {
    px(ctx, hair, 5, 3 + b, 6, 4);
    px(ctx, dark, 9, 3 + b, 2, 4);
    px(ctx, lit, 6, 3 + b, 1, 2);
  } else {
    // Flequillo de lado: la frente asoma a la derecha.
    px(ctx, hair, 5, 3 + b, 3, 1);
    px(ctx, dark, 9, 2 + b, 2, 1);
    px(ctx, hair, 10, 3 + b, 1, 1);
    px(ctx, hair, 5, 4 + b, 1, 1);
  }
  if (style === 'braids' || style === 'locs') {
    // Trenzas largas y finas o rastas más gruesas y cortas: mechones con su brillo alterno.
    const len = style === 'braids' ? 9 : 7;
    const w = style === 'braids' ? 1 : 2;
    px(ctx, hair, 5 - w, 3 + b, w, len);
    px(ctx, hair, 11, 3 + b, w, len);
    for (let y = 4; y < 3 + len; y += 2) {
      px(ctx, lit, 5 - w, y + b, 1, 1);
      px(ctx, lit, 11, y + b, 1, 1);
    }
    if (back) {
      px(ctx, hair, 5, 7 + b, 6, len - 4);
      for (let x = 5; x < 11; x += 2) px(ctx, lit, x, 8 + b, 1, len - 6);
    }
  } else if (style === 'ponytail') {
    if (back) {
      px(ctx, hair, 7, 4 + b, 2, 7);
      px(ctx, lit, 7, 5 + b, 1, 5);
      px(ctx, shade(hair, -0.3), 7, 4 + b, 2, 1); // la goma
    } else px(ctx, hair, 11, 3 + b, 1, 3); // la cola asoma por un lado
  } else if (style === 'curly') {
    px(ctx, hair, 4, 2 + b, 1, 4);
    px(ctx, hair, 11, 2 + b, 1, 4);
    px(ctx, hair, 5, b, 2, 1);
    px(ctx, hair, 8, b, 2, 1);
    px(ctx, lit, 4, 2 + b, 1, 1);
    px(ctx, lit, 8, b, 1, 1);
    px(ctx, dark, 11, 4 + b, 1, 2);
    if (!back) px(ctx, hair, 8, 3 + b, 2, 1);
    else px(ctx, hair, 4, 6 + b, 8, 1);
  } else if (style === 'bun') {
    px(ctx, hair, 6, b - 1, 4, 2);
    px(ctx, lit, 6, b - 1, 2, 1);
    px(ctx, dark, 9, b, 1, 1);
  } else if (style === 'bob') {
    // Media melena a la altura de la mandíbula, con el flequillo recto.
    px(ctx, hair, 4, 3 + b, 1, 5);
    px(ctx, hair, 11, 3 + b, 1, 5);
    px(ctx, dark, 11, 5 + b, 1, 3);
    if (back) px(ctx, hair, 5, 7 + b, 6, 1);
    else px(ctx, hair, 8, 3 + b, 2, 1);
  } else if (style === 'long') {
    // Melena larga: cae por detrás de los hombros y asoma por los lados hasta el pecho.
    px(ctx, hair, 4, 3 + b, 1, 9);
    px(ctx, hair, 11, 3 + b, 1, 9);
    px(ctx, lit, 4, 4 + b, 1, 3);
    px(ctx, dark, 11, 6 + b, 1, 6);
    if (back) {
      px(ctx, hair, 5, 7 + b, 6, 5);
      px(ctx, lit, 6, 8 + b, 1, 3);
      px(ctx, dark, 5, 11 + b, 6, 1);
    }
  }
  hat(ctx, back, b, c);
}

function hat(ctx: Ctx, back: boolean, b: number, c: HumanColors): void {
  if (!c.cap) return;
  // Gorra: copa con brillo y, de frente, la visera sobre la frente.
  px(ctx, c.cap, 5, 1 + b, 6, back ? 3 : 2);
  px(ctx, shade(c.cap, 0.14), 6, 1 + b, 2, 1);
  if (!back) px(ctx, shade(c.cap, -0.22), 4, 3 + b, 8, 1);
}

/**
 * De perfil se ve el brazo cercano: el derecho mirando a la derecha; el izquierdo, en espejo.
 * Misma anatomía que de frente: cabeza 5–10 con la nariz en la 11, tronco 6–10 con el pecho
 * adelantado, y al andar las piernas forman una V desde la cadera, con el talón de atrás levantado.
 */
function drawSide(ctx: Ctx, pose: Pose, c: HumanColors, near: 'r' | 'l'): void {
  const b = drop(pose);
  const far = shade(c.trousers, -0.14);
  // En guardia y al golpear, piernas abiertas como al dar un paso, con el pie de delante hacia el otro.
  const step = pose === 1 || pose === 2 || pose === 8 || pose === 9 || pose === 27;

  if (seated(pose)) {
    // Sentado: el muslo hacia delante, la espinilla cae y el pie apoyado.
    leg(ctx, c, c.trousers, 7, 17, 5, 2);
    px(ctx, shade(c.trousers, 0.12), 7, 17, 5, 1);
    leg(ctx, c, c.trousers, 10, 19, 2, 3);
    shoe(ctx, c, 10, 22, 3);
  } else if (step) {
    // La pierna de atrás, en sombra, con el talón levantado; la de delante pisa con el talón.
    const [front, rear] = pose === 2 ? [far, c.trousers] : [c.trousers, far];
    leg(ctx, c, rear, 6, 15, 3, 2);
    leg(ctx, c, rear, 5, 17, 3, 3);
    leg(ctx, c, rear, 4, 20, 3, 2);
    px(ctx, c.shoes, 3, 22, 4, 1);
    px(ctx, shade(c.shoes, -0.35), 4, 23, 3, 1);
    leg(ctx, c, front, 8, 15, 3, 2);
    leg(ctx, c, front, 9, 17, 3, 3);
    leg(ctx, c, front, 10, 20, 3, 2);
    shoe(ctx, c, 10, 22, 4);
  } else {
    // Quieto: las dos piernas juntas, la de detrás un tono más oscura.
    leg(ctx, c, c.trousers, 6, 15, 4, 7);
    px(ctx, far, 6, 16, 1, 6);
    px(ctx, shade(c.trousers, 0.1), 7, 16, 1, 5);
    shoe(ctx, c, 6, 22, 5);
  }

  // Tronco de perfil: hombro redondeado, pecho adelantado, espalda recta y el cinturón.
  const t = 9 + b;
  px(ctx, c.cloth, 6, t, 4, 1);
  px(ctx, c.cloth, 6, t + 1, 5, 3);
  px(ctx, c.cloth, 6, t + 4, 4, 1);
  px(ctx, shade(c.cloth, 0.16), 6, t, 3, 1);
  px(ctx, shade(c.cloth, 0.07), 6, t + 1, 1, 3);
  px(ctx, shade(c.cloth, -0.12), 10, t + 2, 1, 2);
  px(ctx, shade(c.trousers, -0.3), 6, t + 5, 4, 1);

  // Cabeza de perfil: nuca, oreja, ojo, nariz hacia delante y la barbilla.
  px(ctx, shade(c.skin, -0.14), 7, 8 + b, 2, 1);
  const nape = inkAt(c, 'neck');
  if (nape) px(ctx, nape, 7, 8 + b, 1, 1);
  px(ctx, c.skin, 6, 2 + b, 4, 1);
  px(ctx, c.skin, 5, 3 + b, 6, 4);
  px(ctx, c.skin, 7, 7 + b, 3, 1);
  px(ctx, c.skin, 11, 4 + b, 1, 2);
  px(ctx, shade(c.skin, -0.1), 11, 5 + b, 1, 1);
  px(ctx, PALETTE.outline, 9, 4 + b, 1, 1);
  px(ctx, shade(c.skin, -0.2), 10, 6 + b, 1, 1); // boca
  px(ctx, shade(c.skin, -0.16), 7, 4 + b, 1, 2); // oreja
  px(ctx, shade(c.skin, -0.08), 6, 6 + b, 2, 1); // la sombra de la mandíbula
  face(ctx, true, b, c);

  const hair = c.hair;
  const lit = shade(hair, 0.14);
  const style = c.hairStyle ?? 'short';
  if (style === 'buzz') {
    px(ctx, hair, 6, 1 + b, 4, 1);
    px(ctx, hair, 5, 2 + b, 5, 1);
    px(ctx, hair, 5, 3 + b, 2, 2);
    px(ctx, lit, 6, 1 + b, 2, 1);
  } else if (style === 'bald') {
    px(ctx, hair, 5, 4 + b, 2, 2);
    px(ctx, shade(c.skin, 0.14), 7, 2 + b, 2, 1);
  } else if (style === 'afro') {
    px(ctx, hair, 5, b, 5, 1);
    px(ctx, hair, 4, 1 + b, 7, 2);
    px(ctx, hair, 3, 3 + b, 4, 4);
    px(ctx, hair, 7, 3 + b, 3, 1);
    px(ctx, lit, 5, 1 + b, 3, 1);
  } else {
    px(ctx, hair, 6, 1 + b, 4, 1);
    px(ctx, hair, 5, 2 + b, 6, 1);
    px(ctx, hair, 5, 3 + b, 5, 1);
    px(ctx, hair, 5, 4 + b, 2, 3);
    px(ctx, lit, 6, 1 + b, 3, 1);
    px(ctx, shade(hair, -0.16), 5, 5 + b, 1, 2);
    if (style === 'curly') {
      px(ctx, hair, 4, 2 + b, 2, 5);
      px(ctx, hair, 7, b, 2, 1);
    }
    if (style === 'braids' || style === 'locs') {
      const len = style === 'braids' ? 9 : 7;
      px(ctx, hair, 4, 4 + b, style === 'braids' ? 2 : 3, len);
      for (let y = 5; y < 4 + len; y += 2) px(ctx, lit, 4, y + b, 1, 1);
    }
    if (style === 'ponytail') {
      px(ctx, shade(hair, -0.3), 4, 3 + b, 1, 1);
      px(ctx, hair, 3, 3 + b, 1, 1);
      px(ctx, hair, 2, 4 + b, 2, 5);
      px(ctx, lit, 3, 4 + b, 1, 3);
    }
    if (style === 'bun') {
      px(ctx, hair, 3, 1 + b, 3, 2);
      px(ctx, lit, 3, 1 + b, 2, 1);
    }
    if (style === 'bob') px(ctx, hair, 5, 7 + b, 3, 1);
    if (style === 'long') {
      px(ctx, hair, 4, 4 + b, 3, 8);
      px(ctx, lit, 5, 5 + b, 1, 4);
      px(ctx, shade(hair, -0.16), 4, 11 + b, 3, 1);
    }
  }
  if (c.cap) {
    px(ctx, c.cap, 5, 1 + b, 6, 2);
    px(ctx, shade(c.cap, 0.14), 6, 1 + b, 2, 1);
    px(ctx, shade(c.cap, -0.22), 10, 3 + b, 3, 1); // visera hacia delante
  }
  if (c.hood) {
    px(ctx, c.hood, 5, 1 + b, 6, 2);
    px(ctx, shade(c.hood, 0.1), 6, 1 + b, 3, 1);
    px(ctx, c.hood, 4, 2 + b, 4, 7);
    px(ctx, shade(c.hood, -0.12), 10, 2 + b, 1, 2);
  }
  if (c.scarf) {
    px(ctx, c.scarf, 6, 8 + b, 5, 2);
    px(ctx, shade(c.scarf, 0.12), 6, 8 + b, 2, 1);
  }
  if (c.earrings && !c.hood) px(ctx, c.earrings, 7, 6 + b, 1, 1);
  if (c.bag) {
    // Correa cruzando el pecho y el bolso a la espalda, a la altura de la cadera.
    px(ctx, shade(c.bag, -0.2), 8, 9 + b, 1, 5);
    px(ctx, c.bag, 3, 12, 3, 3);
    px(ctx, shade(c.bag, 0.12), 3, 12, 3, 1);
    px(ctx, shade(c.bag, -0.25), 3, 14, 3, 1);
  }

  // Brazo cercano, por encima del tronco, al contrario que la pierna delantera.
  const sleeve = c.sleeves ?? c.clothDark;
  if (toMouth(pose)) {
    // Un bocado: el antebrazo sube y la mano llega a la boca.
    px(ctx, sleeve, 7, 10 + b, 2, 3);
    px(ctx, sleeve, 9, 8 + b, 2, 2);
    px(ctx, c.skin, 11, 6 + b, 1, 2);
    if (pose === 26) px(ctx, PALETTE.metalLit, 12, 5 + b, 1, 1);
  } else if (pose === 34) {
    // Foto: el brazo estirado hacia delante a la altura de los ojos y el móvil de canto.
    px(ctx, sleeve, 7, 9 + b, 2, 2);
    px(ctx, sleeve, 9, 7 + b, 3, 2);
    px(ctx, c.skin, 12, 6 + b, 1, 2);
    px(ctx, PALETTE.ink, 13, 3 + b, 1, 5);
  } else if (onPhone(pose)) {
    // Antebrazo levantado y el móvil delante de la cara, con la pantalla hacia ella.
    px(ctx, sleeve, 7, 10 + b, 2, 3);
    px(ctx, sleeve, 9, 11 + b, 2, 2);
    px(ctx, c.skin, 11, 10 + b, 1, 2);
    px(ctx, PALETTE.ink, 12, 8 + b, 1, 4);
    px(ctx, PALETTE.glassLit, 11, 9 + b, 1, 1);
    // Ojo bajado: un píxel más abajo.
    px(ctx, c.skin, 9, 4 + b, 1, 1);
    px(ctx, PALETTE.outline, 9, 5 + b, 1, 1);
  } else if (pose === 6) {
    // Brazo arriba y la barra de canto: el disco sobre la cabeza.
    px(ctx, sleeve, 7, 2, 2, 8);
    px(ctx, c.skin, 7, 1, 2, 1);
    px(ctx, PALETTE.ink, 6, 0, 4, 1);
  } else if (pose === 7) {
    // Brazo en alto, puño cerrado: jaleando.
    px(ctx, sleeve, 7, 3, 2, 7);
    px(ctx, c.skin, 7, 1, 2, 2);
  } else if (pose === 8) {
    // Guardia: el antebrazo sube y el puño queda delante de la barbilla.
    px(ctx, sleeve, 8, 10 + b, 3, 2);
    px(ctx, sleeve, 11, 8 + b, 2, 3);
    px(ctx, c.skin, 11, 6 + b, 2, 2);
  } else if (pose === 27) {
    // Carga visible: puño atrás, el otro protege la barbilla.
    px(ctx, sleeve, 4, 9 + b, 3, 2);
    px(ctx, sleeve, 4, 7 + b, 2, 3);
    px(ctx, c.skin, 3, 6 + b, 3, 2);
    px(ctx, c.skin, 11, 7 + b, 2, 2);
  } else if (pose === 28) {
    // Se agacha con ambos antebrazos protegiendo la cabeza.
    px(ctx, sleeve, 9, 9 + b, 3, 2);
    px(ctx, sleeve, 11, 7 + b, 2, 3);
    px(ctx, c.skin, 11, 6 + b, 3, 2);
  } else if (pose === 29) {
    // Cansado/acorralado: hombros bajos y mano en el costado, sin heridas.
    px(ctx, sleeve, 7, 10 + b, 2, 4);
    px(ctx, c.skin, 8, 13 + b, 3, 2);
    px(ctx, c.clothDark, 9, 10 + b, 2, 3);
  } else if (pose === 30) {
    // Victoria: ambos puños arriba, piernas quietas; no hay derribo ni sangre.
    px(ctx, sleeve, 4, 3, 2, 7);
    px(ctx, c.skin, 4, 1, 2, 2);
    px(ctx, sleeve, 10, 3, 2, 7);
    px(ctx, c.skin, 10, 1, 2, 2);
  } else if (pose === 31) {
    // Discusión breve: palma abierta, un gesto hacia el rival.
    px(ctx, sleeve, 8, 10, 4, 2);
    px(ctx, c.skin, 11, 7, 2, 4);
    px(ctx, c.skin, 13, 7, 1, 2);
  } else if (pose === 9) {
    // Golpe: el brazo estirado hacia delante a la altura del hombro.
    px(ctx, sleeve, 8, 9 + b, 5, 2);
    px(ctx, c.skin, 13, 9 + b, 2, 2);
  } else if (pose === 10) {
    // Encaja: echado atrás, el brazo se le va hacia la espalda.
    px(ctx, sleeve, 4, 10, 2, 3);
    px(ctx, c.skin, 3, 13, 2, 1);
  } else if (pose === 1) {
    // El brazo va hacia atrás cuando avanza la pierna cercana: codo atrás, mano junto a la cadera.
    px(ctx, sleeve, 7, 10 + b, 2, 2);
    arm(ctx, c, near, 6, 12 + b, 2, 2, sleeve, c.skin);
  } else if (pose === 2) {
    px(ctx, sleeve, 7, 10 + b, 2, 2);
    arm(ctx, c, near, 9, 12 + b, 2, 2, sleeve, c.skin);
  } else {
    arm(ctx, c, near, 7, 10 + b, 2, 5, sleeve, c.skin);
  }
}

/**
 * Contorno de un píxel alrededor de la silueta, del color de lo que bordea
 * oscurecido (selout): el pelo castaño se cierra en castaño oscuro, la camisa
 * clara en su sombra. Se lee sobre cualquier suelo sin la línea negra de
 * pegatina; bajo los pies, sí casi negro, que es lo que la asienta.
 */
function outline(ctx: Ctx): void {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  const n = Number.parseInt(PALETTE.outline.slice(1), 16);
  const [or, og, ob] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const edge: { i: number; from: number; under: boolean }[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      // El vecino del que toma el color: primero el de arriba (bajo los pies), luego los lados y el de abajo.
      const from = solid(x, y - 1) ? [x, y - 1] : solid(x - 1, y) ? [x - 1, y] : solid(x + 1, y) ? [x + 1, y] : solid(x, y + 1) ? [x, y + 1] : null;
      if (from) edge.push({ i: (y * w + x) * 4, from: (from[1] * w + from[0]) * 4, under: solid(x, y - 1) && !solid(x, y + 1) && y > h - 4 });
    }
  }
  for (const { i, from, under } of edge) {
    const k = under ? 0.15 : 0.42;
    d[i] = Math.round(d[from] * k + or * (1 - k));
    d[i + 1] = Math.round(d[from + 1] * k + og * (1 - k));
    d[i + 2] = Math.round(d[from + 2] * k + ob * (1 - k));
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
