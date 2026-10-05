import type Phaser from 'phaser';
import { PALETTE } from '../config/constants';
import type { Facing } from '../types/game';
import { px, type Ctx } from './paint';
import { drawHuman, drop, type HumanColors, type Pose } from './HumanArt';

/**
 * Personas a 28 × 42 en vez de 16 × 24 (prototipo en el juego: el jugador y
 * un anónimo, world/TextureFactory). Miden lo mismo en el mundo: el sprite va a
 * escala 16/28 (a zoom 3,5, dos píxeles de pantalla por píxel de arte).
 *
 * La silueta no se inventa: la de 16 × 24 escalada manda. Lo que el dibujo
 * nuevo pinte fuera se recorta, los huecos de dentro se rellenan con el color
 * vecino y el contorno es el borde de esa misma máscara. Sólo cambia lo de
 * dentro: cara, pelo, ropa, zapatos, piel.
 *
 * Con dibujo propio: quieto, los dos pasos y la respiración (poses 0–3) en las
 * cuatro direcciones, peinados 'short' y 'bob' y, de complementos, sólo la bandolera. Todo lo
 * demás es el dibujo de 16 × 24 de siempre llevado a 28 × 42 por vecino más
 * cercano: se ve igual que antes y la escala del sprite no cambia de un
 * fotograma a otro.
 */
export const HD_W = 28;
export const HD_H = 42;
export const HD_SCALE = 16 / HD_W;

const BLUSH = '#d9735f';
const IRIS = '#2a2230';

/** Las poses con dibujo propio: quieto, los dos pasos y la respiración. */
const HD_POSES: ReadonlySet<Pose> = new Set<Pose>([0, 1, 2, 3]);

/** Lo que el dibujo de 28 × 42 sabe pintar: si un aspecto lleva algo más, se queda entero con el de siempre. */
export function hdReady(c: HumanColors): boolean {
  return (
    (c.hairStyle === undefined || c.hairStyle === 'short' || c.hairStyle === 'bob') &&
    !c.cap && !c.hood && !c.scarf && !c.glasses && !c.facialHair && !c.headphones && !c.earrings &&
    !c.spots && !c.stripe && !c.cane && !c.piercing && !c.brows && !c.jaw && !c.ink?.length && c.sleeveLen === undefined &&
    (c.build ?? 'average') === 'average' && (c.height ?? 'average') === 'average' && c.posture !== 'stooped'
  );
}

function tone(hex: string, k: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const out = k >= 0
    ? [r + (255 - r) * k, g + (255 - g) * k * 0.88, b + (255 - b) * k * 0.65]
    : [r * (1 + k * 1.12), g * (1 + k), b * (1 + k * 0.72)];
  return `#${out.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}

function blend(a: string, b: string, k: number): string {
  const pa = Number.parseInt(a.slice(1), 16);
  const pb = Number.parseInt(b.slice(1), 16);
  const ch = (s: number): number => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * k);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

/** Zapato visto de frente o de lado: empeine, puntera con luz, cordones, canto en sombra y suela. */
function shoe(ctx: Ctx, color: string, x: number, y: number, w: number, toeRight = false): void {
  px(ctx, color, x, y, w, 4);
  px(ctx, tone(color, 0.32), toeRight ? x + w - 3 : x, y, toeRight ? 3 : 2, 1);
  px(ctx, tone(color, 0.18), x + Math.floor(w / 2), y + 1, 1, 1);
  px(ctx, tone(color, -0.18), toeRight ? x : x + w - 1, y, 1, 3);
  px(ctx, tone(color, -0.38), x, y + 3, w, 1);
}

/** Zapato visto por detrás: el talón (contrafuerte) más oscuro arriba y la suela. */
function heel(ctx: Ctx, color: string, x: number, y: number, w: number): void {
  px(ctx, color, x, y, w, 4);
  px(ctx, tone(color, -0.22), x, y, w, 1);
  px(ctx, tone(color, 0.16), x + 1, y + 1, 1, 1);
  px(ctx, tone(color, -0.4), x, y + 3, w, 1);
}

/** Brazo de frente o de espaldas, 2 px: manga con su luz y su puño, mano con el canto en sombra. */
function armFront(ctx: Ctx, sleeve: string, skin: string, x: number, y: number, lit: boolean): void {
  px(ctx, sleeve, x, y, 2, 8);
  px(ctx, tone(sleeve, lit ? 0.14 : -0.1), lit ? x : x + 1, y, 1, 7);
  px(ctx, tone(sleeve, -0.2), x, y + 7, 2, 1);
  px(ctx, skin, x, y + 8, 2, 3);
  px(ctx, tone(skin, -0.14), x + 1, y + 8, 1, 3);
}

/**
 * Ojo de siempre (el de 16 × 24): una rayita vertical oscura, sin ceja, párpado, blanco ni brillo.
 * Aquí, 1 × 3: dos píxeles oscuros (algo menos que el contorno, para que no se coma la cara) y el de
 * abajo fundido con la piel. Es la misma persona; sólo se ve más limpia.
 */
function eye(ctx: Ctx, skin: string, x: number, y: number): void {
  px(ctx, blend(IRIS, skin, 0.18), x, y, 1, 2);
  px(ctx, blend(IRIS, skin, 0.55), x, y + 2, 1, 1);
}

function hairFrontHD(ctx: Ctx, c: HumanColors, B: number): void {
  const H = c.hair;
  if (c.hairStyle === 'bob') {
    // Melena: cae por los lados hasta la mandíbula; la de la sombra, más oscura.
    px(ctx, H, 5, 6 + B, 2, 10);
    px(ctx, H, 21, 6 + B, 2, 10);
    px(ctx, tone(H, 0.14), 5, 6 + B, 1, 4);
    px(ctx, tone(H, -0.18), 21, 6 + B, 2, 10);
    px(ctx, tone(H, -0.12), 6, 12 + B, 1, 4);
  }
  px(ctx, H, 9, 2 + B, 10, 2);
  px(ctx, H, 8, 3 + B, 12, 1);
  px(ctx, H, 7, 4 + B, 14, 3);
  // Flequillo de lado, hacia la izquierda, y el pelo sobre la oreja derecha.
  px(ctx, H, 7, 7 + B, 7, 1);
  px(ctx, H, 7, 8 + B, 4, 1);
  px(ctx, H, 7, 9 + B, 2, 2);
  px(ctx, H, 19, 7 + B, 2, 4);
  // Brillo en arco sobre la coronilla, mechones y la masa de la derecha en sombra fría.
  px(ctx, tone(H, 0.3), 11, 3 + B, 4, 1);
  px(ctx, tone(H, 0.2), 10, 4 + B, 2, 1);
  px(ctx, tone(H, 0.14), 15, 4 + B, 1, 1);
  px(ctx, tone(H, 0.1), 8, 5 + B, 2, 1);
  px(ctx, tone(H, -0.12), 13, 5 + B, 1, 2);
  px(ctx, tone(H, -0.12), 16, 4 + B, 1, 2);
  px(ctx, tone(H, -0.18), 17, 5 + B, 4, 2);
  px(ctx, tone(H, -0.22), 19, 8 + B, 2, 3);
  px(ctx, tone(H, -0.14), 10, 8 + B, 1, 1);
  px(ctx, tone(H, -0.14), 7, 10 + B, 2, 1);
  px(ctx, tone(H, -0.1), 13, 7 + B, 1, 1);
}

/** Cuánto baja el tronco (2 px aquí, 1 en 16 × 24) y qué pie y qué brazo se mueven en cada pose de andar. */
function gait(pose: Pose): { B: number; L: number; R: number; armL: number; armR: number } {
  const B = pose >= 1 && pose <= 3 ? 2 : 0;
  // Paso izquierdo (1): sube el pie de la izquierda de la imagen y baja el brazo de la derecha; el 2, al revés.
  return { B, L: pose === 1 ? 2 : 0, R: pose === 2 ? 2 : 0, armL: 19 + (pose === 2 ? 4 : pose === 3 ? 2 : 0), armR: 19 + (pose === 1 ? 4 : pose === 3 ? 2 : 0) };
}

/** Piernas de frente o de espaldas: la de la izquierda con luz en el canto, la de dentro en sombra, la entrepierna. */
function legsFrontBack(ctx: Ctx, c: HumanColors, L: number, R: number, back: boolean): void {
  const T = c.trousers;
  const Ti = tone(T, -0.12);
  px(ctx, T, 9, 30, 5, 8 - L);
  px(ctx, Ti, 14, 30, 5, 8 - R);
  px(ctx, tone(T, 0.14), 9, 31, 1, 6 - L);
  px(ctx, tone(Ti, -0.16), 18, 31, 1, 7 - R);
  px(ctx, tone(Ti, -0.26), 14, 31, 1, 7 - R);
  if (back) {
    // Por detrás no hay rodilla: la corva en sombra y el bajo.
    px(ctx, tone(T, -0.1), 10, 34 - L, 2, 1);
    px(ctx, tone(Ti, -0.1), 15, 34 - R, 2, 1);
  } else {
    // La rodilla, más marcada la que avanza.
    px(ctx, tone(T, L ? 0.2 : 0.08), 10, 34 - L, 2, 1);
    px(ctx, tone(Ti, R ? 0.16 : 0.06), 15, 34 - R, 2, 1);
  }
  px(ctx, tone(T, -0.22), 9, 37 - L, 5, 1);
  px(ctx, tone(Ti, -0.22), 14, 37 - R, 5, 1);
  if (back) {
    heel(ctx, c.shoes, 9, 38 - L, 5);
    heel(ctx, c.shoes, 14, 38 - R, 5);
  } else {
    shoe(ctx, c.shoes, 9, 38 - L, 5);
    shoe(ctx, c.shoes, 14, 38 - R, 5);
  }
}

/**
 * Bandolera, donde la pone el dibujo de siempre: de frente, del hombro a la cadera contraria con el bolso
 * delante; de espaldas, en espejo; de perfil, la correa sobre el pecho y el bolso a la espalda.
 */
function bagHD(ctx: Ctx, c: HumanColors, view: 'front' | 'back' | 'side', B: number): void {
  if (!c.bag) return;
  const strap = tone(c.bag, -0.22);
  if (view === 'side') {
    px(ctx, strap, 14, 18 + B, 1, 8);
    px(ctx, c.bag, 5, 23, 5, 5);
    px(ctx, tone(c.bag, 0.16), 5, 23, 5, 1);
    px(ctx, tone(c.bag, -0.24), 5, 27, 5, 1);
    return;
  }
  for (let i = 0; i < 9; i++) px(ctx, strap, view === 'front' ? 9 + i : 18 - i, 18 + B + i, 1, 1);
  const x = view === 'front' ? 18 : 5;
  px(ctx, c.bag, x, 25, 5, 5);
  px(ctx, tone(c.bag, 0.16), x, 25, 5, 1);
  px(ctx, tone(c.bag, 0.08), x + 2, 27, 1, 1);
  px(ctx, tone(c.bag, -0.24), x, 29, 5, 1);
}

/**
 * Cabeza de frente. La cara es la de 16 × 24 punto por punto (dos rayitas por ojos, la nariz un píxel
 * de sombra, la boca dos píxeles a la izquierda, un toque de rubor en cada mejilla, sin cejas); lo que
 * mejora es el modelado de la cabeza, las orejas y la barbilla. Encima, el pelo.
 */
function headFront(ctx: Ctx, c: HumanColors, B: number): void {
  const S = c.skin;
  px(ctx, tone(S, -0.14), 12, 16 + B, 4, 2);
  px(ctx, S, 9, 4 + B, 10, 12);
  px(ctx, S, 8, 5 + B, 12, 10);
  px(ctx, S, 7, 6 + B, 14, 8);
  // Modelado: la mitad de la sombra, las orejas, la barbilla y la mejilla de la luz.
  px(ctx, tone(S, -0.1), 18, 6 + B, 2, 8);
  px(ctx, tone(S, -0.16), 20, 7 + B, 1, 6);
  px(ctx, tone(S, 0.08), 8, 9 + B, 1, 4);
  px(ctx, tone(S, -0.08), 7, 9 + B, 1, 3);
  px(ctx, tone(S, -0.22), 20, 9 + B, 1, 3);
  px(ctx, tone(S, -0.1), 10, 15 + B, 8, 1);
  px(ctx, tone(S, -0.14), 18, 14 + B, 1, 1);
  // Un leve hundido sobre cada ojo, como en el de siempre; los ojos, la nariz, la boca y el rubor.
  px(ctx, tone(S, -0.05), 11, 8 + B, 1, 1);
  px(ctx, tone(S, -0.06), 16, 8 + B, 1, 1);
  eye(ctx, S, 11, 9 + B);
  eye(ctx, tone(S, -0.06), 16, 9 + B);
  px(ctx, tone(S, -0.12), 14, 11 + B, 1, 1);
  px(ctx, tone(S, -0.22), 12, 13 + B, 2, 1);
  px(ctx, tone(S, -0.12), 14, 13 + B, 1, 1);
  px(ctx, blend(S, BLUSH, 0.2), 9, 13 + B, 1, 1);
  px(ctx, blend(tone(S, -0.08), BLUSH, 0.18), 18, 13 + B, 1, 1);
  hairFrontHD(ctx, c, B);
}

/** De frente: quieto, los dos pasos o respirando. */
function front(ctx: Ctx, c: HumanColors, pose: Pose): void {
  const { B, L, R, armL, armR } = gait(pose);
  const T = c.trousers;
  const S = c.skin;
  const C = c.cloth;
  const Cd = c.clothDark;
  const sleeve = c.sleeves ?? C;
  const sleeveDark = c.sleeves ? tone(c.sleeves, -0.1) : Cd;

  legsFrontBack(ctx, c, L, R, false);
  // Brazos: el de la luz (izquierda de la imagen) y el de la sombra; al andar, se balancean.
  armFront(ctx, sleeve, S, 5, armL, true);
  armFront(ctx, sleeveDark, tone(S, -0.08), 21, armR, false);

  // Tronco: rampa luz → base → semisombra → sombra, hombros con luz, cuello en pico y un pliegue.
  px(ctx, C, 7, 18 + B, 14, 12 - B);
  px(ctx, tone(C, 0.14), 7, 18 + B, 3, 11 - B);
  px(ctx, tone(C, 0.06), 10, 18 + B, 1, 11 - B);
  px(ctx, tone(C, -0.08), 17, 19 + B, 1, 10 - B);
  px(ctx, Cd, 18, 19 + B, 3, 10 - B);
  px(ctx, tone(Cd, -0.16), 20, 20 + B, 1, 8 - B);
  px(ctx, tone(C, 0.24), 7, 18 + B, 5, 1);
  px(ctx, tone(C, 0.1), 12, 18 + B, 4, 1);
  px(ctx, tone(S, -0.1), 12, 18 + B, 4, 1);
  px(ctx, tone(S, -0.16), 13, 19 + B, 2, 1);
  px(ctx, tone(C, -0.3), 11, 18 + B, 1, 2);
  px(ctx, tone(C, -0.3), 16, 18 + B, 1, 2);
  px(ctx, tone(C, -0.07), 12, 22 + B, 1, 1);
  px(ctx, tone(C, -0.07), 13, 23 + B, 1, 2);
  px(ctx, tone(C, -0.06), 14, 25 + B, 1, 1);
  px(ctx, tone(C, -0.12), 7, 28, 14, 1);
  px(ctx, Cd, 7, 29, 14, 1);
  px(ctx, tone(T, -0.36), 9, 30, 10, 1);
  bagHD(ctx, c, 'front', B);
  headFront(ctx, c, B);
}

/** De espaldas: la nuca, el pelo entero, la espalda de la camiseta con su costura y los talones. */
function back(ctx: Ctx, c: HumanColors, pose: Pose): void {
  const { B, L, R, armL, armR } = gait(pose);
  const T = c.trousers;
  const S = c.skin;
  const H = c.hair;
  const C = c.cloth;
  const Cd = c.clothDark;
  const sleeve = c.sleeves ?? C;
  const sleeveDark = c.sleeves ? tone(c.sleeves, -0.1) : Cd;

  legsFrontBack(ctx, c, L, R, true);
  armFront(ctx, sleeve, S, 5, armL, true);
  armFront(ctx, sleeveDark, tone(S, -0.08), 21, armR, false);

  // Espalda: la misma rampa de luz, el cuello redondo por detrás, la costura del centro y los omóplatos.
  px(ctx, C, 7, 18 + B, 14, 12 - B);
  px(ctx, tone(C, 0.14), 7, 18 + B, 3, 11 - B);
  px(ctx, tone(C, -0.08), 17, 19 + B, 1, 10 - B);
  px(ctx, Cd, 18, 19 + B, 3, 10 - B);
  px(ctx, tone(Cd, -0.16), 20, 20 + B, 1, 8 - B);
  px(ctx, tone(C, 0.24), 7, 18 + B, 5, 1);
  px(ctx, tone(C, -0.22), 11, 18 + B, 6, 1);
  px(ctx, tone(C, -0.06), 14, 20 + B, 1, 7 - B);
  px(ctx, tone(C, -0.08), 10, 21 + B, 2, 1);
  px(ctx, tone(C, -0.08), 16, 21 + B, 2, 1);
  px(ctx, tone(C, -0.12), 7, 28, 14, 1);
  px(ctx, Cd, 7, 29, 14, 1);
  px(ctx, tone(T, -0.36), 9, 30, 10, 1);
  bagHD(ctx, c, 'back', B);

  // Nuca y cuello, las orejas asomando y el pelo encima.
  px(ctx, tone(S, -0.12), 12, 16 + B, 4, 2);
  px(ctx, S, 9, 4 + B, 10, 12);
  px(ctx, S, 8, 5 + B, 12, 10);
  px(ctx, S, 7, 6 + B, 14, 8);
  px(ctx, tone(S, -0.12), 10, 13 + B, 8, 3);
  px(ctx, H, 9, 2 + B, 10, 2);
  px(ctx, H, 8, 3 + B, 12, 1);
  px(ctx, H, 7, 4 + B, 14, 9);
  px(ctx, H, 8, 13 + B, 12, 1);
  if (c.hairStyle === 'bob') {
    px(ctx, H, 5, 6 + B, 2, 10);
    px(ctx, H, 21, 6 + B, 2, 10);
    px(ctx, H, 7, 13 + B, 14, 3);
    px(ctx, tone(H, -0.18), 21, 6 + B, 2, 10);
    px(ctx, tone(H, -0.2), 7, 15 + B, 14, 1);
  }
  // Orejas a los lados del pelo; brillo de coronilla, mechones que bajan y la nuca en sombra.
  px(ctx, tone(S, -0.04), 7, 9 + B, 1, 3);
  px(ctx, tone(S, -0.2), 20, 9 + B, 1, 3);
  px(ctx, tone(H, 0.28), 11, 3 + B, 5, 1);
  px(ctx, tone(H, 0.16), 9, 4 + B, 3, 1);
  px(ctx, tone(H, 0.08), 8, 6 + B, 2, 2);
  px(ctx, tone(H, -0.1), 12, 6 + B, 1, 4);
  px(ctx, tone(H, -0.1), 15, 5 + B, 1, 5);
  px(ctx, tone(H, -0.12), 10, 9 + B, 1, 3);
  px(ctx, tone(H, -0.18), 17, 4 + B, 4, 8);
  px(ctx, tone(H, -0.24), 9, 12 + B, 10, 1);
}

/** De perfil, mirando a la derecha: quieto, los dos pasos o respirando. */
function side(ctx: Ctx, c: HumanColors, pose: Pose): void {
  const { B } = gait(pose);
  const T = c.trousers;
  const S = c.skin;
  const C = c.cloth;
  const H = c.hair;
  const sleeve = c.sleeves ?? c.clothDark;

  if (pose === 1 || pose === 2) {
    // Paso: una pierna delante y otra detrás; la de cerca con luz, la de lejos hundida.
    const near = T;
    const far = tone(T, -0.16);
    const [fwd, rear] = pose === 2 ? [far, near] : [near, far];
    px(ctx, rear, 9, 30, 5, 3);
    px(ctx, rear, 7, 33, 5, 5);
    px(ctx, tone(rear, -0.12), 8, 34, 1, 3);
    shoe(ctx, c.shoes, 5, 38, 7, true);
    px(ctx, fwd, 13, 30, 5, 3);
    px(ctx, fwd, 15, 33, 5, 5);
    px(ctx, tone(fwd, 0.14), 17, 33, 1, 1);
    shoe(ctx, c.shoes, 15, 38, 8, true);
  } else {
    // Piernas juntas: la de lejos asoma detrás, la de cerca con luz y rodilla.
    px(ctx, T, 10, 30, 7, 8);
    px(ctx, tone(T, -0.16), 10, 31, 2, 7);
    px(ctx, tone(T, 0.12), 14, 31, 1, 6);
    px(ctx, tone(T, 0.1), 15, 33, 1, 1);
    px(ctx, tone(T, -0.22), 10, 37, 7, 1);
    shoe(ctx, c.shoes, 10, 38, 9, true);
  }

  // Tronco: la espalda (izquierda) al sol, el pecho en semisombra, cinturón.
  px(ctx, C, 9, 18 + B, 10, 12 - B);
  px(ctx, tone(C, 0.14), 9, 18 + B, 3, 11 - B);
  px(ctx, tone(C, -0.1), 17, 19 + B, 2, 10 - B);
  px(ctx, tone(C, 0.24), 9, 18 + B, 6, 1);
  px(ctx, c.clothDark, 9, 28, 10, 2);
  px(ctx, tone(T, -0.36), 10, 30, 7, 1);
  // El brazo echa su sombra en el tronco; el brazo, un cilindro con su puño y la mano.
  px(ctx, tone(C, -0.16), 16, 20 + B, 1, 6);
  px(ctx, sleeve, 12, 19 + B, 4, 8);
  px(ctx, tone(sleeve, 0.14), 12, 19 + B, 1, 7);
  px(ctx, tone(sleeve, -0.14), 15, 19 + B, 1, 8);
  px(ctx, tone(sleeve, -0.2), 12, 26 + B, 4, 1);
  px(ctx, S, 12, 27 + B, 4, 3);
  px(ctx, tone(S, 0.08), 12, 27 + B, 1, 2);
  px(ctx, tone(S, -0.14), 15, 27 + B, 1, 3);
  bagHD(ctx, c, 'side', B);

  // Cuello, cabeza y nariz.
  px(ctx, tone(S, -0.14), 12, 16 + B, 4, 2);
  px(ctx, S, 9, 4 + B, 12, 12);
  px(ctx, S, 21, 9 + B, 2, 4);
  px(ctx, tone(S, -0.1), 15, 15 + B, 6, 1);
  px(ctx, tone(S, -0.08), 19, 13 + B, 2, 2);
  // La cara de perfil de siempre: oreja con su hueco, el ojo en rayita vertical, la punta de la nariz
  // con su sombra debajo, la boca un píxel y el rubor; sin ceja.
  px(ctx, tone(S, -0.08), 12, 9 + B, 2, 4);
  px(ctx, tone(S, -0.22), 13, 10 + B, 1, 2);
  // De perfil el ojo es lo que más se ve en el de siempre: más oscuro que de frente.
  px(ctx, blend(IRIS, S, 0.06), 18, 9 + B, 1, 2);
  px(ctx, blend(IRIS, S, 0.45), 18, 11 + B, 1, 1);
  px(ctx, tone(S, 0.08), 20, 8 + B, 1, 1);
  px(ctx, tone(S, -0.1), 21, 11 + B, 2, 1);
  px(ctx, tone(S, -0.2), 20, 13 + B, 1, 1);
  px(ctx, blend(S, BLUSH, 0.2), 18, 13 + B, 1, 1);

  // Pelo: casco, nuca que baja por detrás de la oreja y patilla; brillo, mechones, sombra abajo.
  px(ctx, H, 9, 2 + B, 10, 2);
  px(ctx, H, 8, 3 + B, 12, 1);
  px(ctx, H, 7, 4 + B, 14, 3);
  px(ctx, H, 7, 7 + B, 6, 5);
  px(ctx, H, 19, 7 + B, 2, 2);
  if (c.hairStyle === 'bob') {
    px(ctx, H, 7, 12 + B, 5, 4);
    px(ctx, tone(H, -0.18), 7, 15 + B, 5, 1);
  }
  px(ctx, tone(H, 0.3), 11, 3 + B, 5, 1);
  px(ctx, tone(H, 0.18), 9, 4 + B, 4, 1);
  px(ctx, tone(H, -0.12), 10, 6 + B, 1, 3);
  px(ctx, tone(H, -0.12), 14, 5 + B, 1, 2);
  px(ctx, tone(H, -0.2), 7, 11 + B, 6, 1);
  px(ctx, tone(H, -0.16), 18, 6 + B, 3, 1);
  px(ctx, tone(H, -0.1), 19, 8 + B, 2, 1);
}

/**
 * Recorta a la silueta de 16 × 24 escalada, rellena huecos y pone el contorno
 * en su borde, teñido del color que tiene al lado (más limpio que un negro plano).
 */
function finish(ctx: Ctx, mask: Uint8Array): void {
  const img = ctx.getImageData(0, 0, HD_W, HD_H);
  const d = img.data;
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < HD_W && y < HD_H;
  for (let i = 0; i < HD_W * HD_H; i++) if (!mask[i]) d[i * 4 + 3] = 0;
  // Huecos: el color del vecino pintado (varias pasadas, del borde hacia dentro).
  for (let pass = 0; pass < 10; pass++) {
    let left = 0;
    for (let y = 0; y < HD_H; y++) {
      for (let x = 0; x < HD_W; x++) {
        const i = (y * HD_W + x) * 4;
        if (!mask[y * HD_W + x] || d[i + 3]) continue;
        const n = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].find(([a, b]) => inside(a, b) && d[(b * HD_W + a) * 4 + 3] === 255);
        if (!n) {
          left++;
          continue;
        }
        const j = (n[1] * HD_W + n[0]) * 4;
        d[i] = d[j];
        d[i + 1] = d[j + 1];
        d[i + 2] = d[j + 2];
        d[i + 3] = 254;
      }
    }
    for (let i = 3; i < d.length; i += 4) if (d[i] === 254) d[i] = 255;
    if (!left) break;
  }
  // Contorno selectivo en el borde de la máscara: el oscuro del contorno con un poco del color que encierra.
  const o = Number.parseInt(PALETTE.outline.slice(1), 16);
  const out = (a: number, b: number): boolean => inside(a, b) && !mask[b * HD_W + a];
  const edge: number[] = [];
  for (let y = 0; y < HD_H; y++) {
    for (let x = 0; x < HD_W; x++) {
      if (mask[y * HD_W + x] && (out(x - 1, y) || out(x + 1, y) || out(x, y - 1) || out(x, y + 1))) edge.push((y * HD_W + x) * 4);
    }
  }
  for (const i of edge) {
    d[i] = Math.round(((o >> 16) & 255) * 0.72 + d[i] * 0.45 * 0.28);
    d[i + 1] = Math.round(((o >> 8) & 255) * 0.72 + d[i + 1] * 0.45 * 0.28);
    d[i + 2] = Math.round((o & 255) * 0.72 + d[i + 2] * 0.45 * 0.28);
    d[i + 3] = 245;
  }
  ctx.putImageData(img, 0, 0);
}

let small: CanvasRenderingContext2D | null = null;
/** El dibujo de siempre (16 × 24, con su contorno) en un lienzo suelto. */
function oldPixels(facing: Facing, pose: Pose, c: HumanColors): Uint8ClampedArray {
  if (!small) {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 24;
    small = canvas.getContext('2d', { willReadFrequently: true });
    if (!small) throw new Error('Sin canvas 2D');
  }
  small.clearRect(0, 0, 16, 24);
  drawHuman(small, facing, pose, c);
  return small.getImageData(0, 0, 16, 24).data;
}

/** El píxel de 16 × 24 que cae debajo de cada píxel de 28 × 42 (vecino más cercano). */
const src = (x: number, y: number): number => Math.floor(((y + 0.5) * 24) / HD_H) * 16 + Math.floor(((x + 0.5) * 16) / HD_W);

/**
 * Para el jugador: la misma ampliación, con otro reparto de columnas. De 16 a 28, cuatro columnas
 * ocupan un píxel y las demás dos. Con el reparto de arriba (1, 5, 9 y 13) el ojo izquierdo (columna 6)
 * salía de dos píxeles y el derecho (columna 9) de uno, y la cara cambiaba. Aquí son la 1, la 5, la 10 y
 * la 13: la cara (columnas 4 a 11) queda simétrica, los dos ojos del mismo ancho y a la misma distancia, y
 * el cuerpo mide lo mismo que antes (21 píxeles de las columnas 2 a 13).
 */
const NARROW: ReadonlySet<number> = new Set([1, 5, 10, 13]);
const PLAYER_COLS: readonly number[] = Array.from({ length: 16 }, (_, x) => (NARROW.has(x) ? [x] : [x, x])).flat();
const srcPlayer = (x: number, y: number): number => Math.floor(((y + 0.5) * 24) / HD_H) * 16 + PLAYER_COLS[x];
type PixelMap = (x: number, y: number) => number;

/** La silueta de siempre llevada a 28 × 42. */
export function silhouetteHD(facing: Facing, pose: Pose, c: HumanColors, map: PixelMap = src): Uint8Array {
  const a = oldPixels(facing, pose, c);
  const mask = new Uint8Array(HD_W * HD_H);
  for (let y = 0; y < HD_H; y++) for (let x = 0; x < HD_W; x++) mask[y * HD_W + x] = a[map(x, y) * 4 + 3] > 0 ? 1 : 0;
  return mask;
}

/** Lo que no tiene dibujo propio: el de siempre, tal cual, en el lienzo de 28 × 42. */
function oldScaled(ctx: Ctx, facing: Facing, pose: Pose, c: HumanColors, map: PixelMap = src): void {
  const a = oldPixels(facing, pose, c);
  const img = ctx.createImageData(HD_W, HD_H);
  for (let i = 0; i < HD_W * HD_H; i++) img.data.set(a.subarray(map(i % HD_W, Math.floor(i / HD_W)) * 4, map(i % HD_W, Math.floor(i / HD_W)) * 4 + 4), i * 4);
  ctx.putImageData(img, 0, 0);
}

type Region = 'out' | 'line' | 'feature' | 'hair' | 'skin' | 'cloth' | 'dark' | 'sleeve' | 'trousers' | 'shoes';

const rgb = (hex: string): readonly [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * El jugador: su dibujo de 16 × 24 de siempre, llevado a 28 × 42 tal cual (cada
 * píxel donde estaba: cara, pelo, ropa y silueta idénticos) y pulido sólo por
 * dentro. Cada píxel se reconoce por la zona a la que pertenece (pelo, piel,
 * camiseta, manga, pantalón, zapatos) y coge luz o sombra en el borde de su
 * zona: luz arriba y a la izquierda (de donde viene el sol), sombra abajo y a
 * la derecha, el brillo del pelo arriba y la sombra que deja el flequillo en la
 * frente. Los rasgos de la cara (ojos, boca) y las líneas de dentro no se
 * tocan; el contorno se tiñe del color que encierra. Vale para todas las poses.
 */
export function drawPlayerHD(ctx: Ctx, facing: Facing, pose: Pose, c: HumanColors): void {
  ctx.clearRect(0, 0, HD_W, HD_H);
  oldScaled(ctx, facing, pose, c, srcPlayer);
  // La cabeza (hasta el cuello, 10 filas de 16 × 24 más lo que baje el tronco) no se pule salvo el pelo: la cara queda tal cual.
  polish(ctx, c, Math.round((10 + drop(pose)) * (HD_H / 24)));
  finish(ctx, silhouetteHD(facing, pose, c, srcPlayer));
}

function polish(ctx: Ctx, c: HumanColors, headRows: number): void {
  const img = ctx.getImageData(0, 0, HD_W, HD_H);
  const d = img.data;
  const bases: readonly (readonly [Region, readonly [number, number, number]])[] = [
    ['hair', rgb(c.hair)], ['skin', rgb(c.skin)], ['cloth', rgb(c.cloth)], ['dark', rgb(c.clothDark)],
    ['sleeve', rgb(c.sleeves ?? c.cloth)], ['trousers', rgb(c.trousers)], ['shoes', rgb(c.shoes)],
  ];
  const line = rgb(PALETTE.outline);
  const dist = (i: number, [r, g, b]: readonly [number, number, number]): number => Math.hypot(d[i] - r, d[i + 1] - g, d[i + 2] - b);
  const at = (x: number, y: number): number => (y * HD_W + x) * 4;
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < HD_W && y < HD_H;
  // Qué es cada píxel: fuera, contorno o línea de dentro, un rasgo (lejos de todo color de zona) o su zona.
  const region: Region[] = [];
  for (let y = 0; y < HD_H; y++) {
    for (let x = 0; x < HD_W; x++) {
      const i = at(x, y);
      if (!d[i + 3]) {
        region.push('out');
        continue;
      }
      if (dist(i, line) < 34) {
        region.push('line');
        continue;
      }
      let best: Region = 'feature';
      let bestD = 70;
      for (const [r, col] of bases) {
        const dd = dist(i, col);
        if (dd < bestD) {
          bestD = dd;
          best = r;
        }
      }
      region.push(best);
    }
  }
  const reg = (x: number, y: number): Region => (inside(x, y) ? region[y * HD_W + x] : 'out');
  // El anillo del contorno: línea que toca el exterior. Las líneas de dentro (los ojos) no son borde de nada.
  const ring = (x: number, y: number): boolean =>
    reg(x, y) === 'out' || (reg(x, y) === 'line' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => reg(x + a, y + b) === 'out'));
  const other = (k: Region, x: number, y: number): Region | null => {
    const q = reg(x, y);
    if (q === k || q === 'feature' || (q === 'line' && !ring(x, y))) return null;
    // El pelo no se toca donde da a la cara: ahí el flequillo enmarca los ojos (más el izquierdo, como en el
    // de siempre) y oscurecerlo o aclararlo cambiaría cómo se leen.
    if (k === 'hair' && q === 'skin') return null;
    return q;
  };
  const out = new Uint8ClampedArray(d);
  for (let y = 0; y < HD_H; y++) {
    for (let x = 0; x < HD_W; x++) {
      const k = reg(x, y);
      if (k === 'out' || k === 'line' || k === 'feature') continue;
      if (y < headRows && k !== 'hair') continue;
      const hair = k === 'hair';
      let amount = 0;
      const up = other(k, x, y - 1);
      if (up) amount += k === 'skin' && up === 'hair' ? -0.08 : hair ? 0.2 : 0.06;
      if (other(k, x - 1, y)) amount += hair ? 0.1 : 0.08;
      if (other(k, x + 1, y)) amount -= 0.12;
      if (other(k, x, y + 1)) amount -= hair ? 0.14 : 0.1;
      if (!amount) continue;
      const i = at(x, y);
      const hex = `#${[d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      const [r, g, b] = rgb(tone(hex, Math.max(-0.22, Math.min(0.26, amount))));
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
    }
  }
  img.data.set(out);
  ctx.putImageData(img, 0, 0);
}

/** Una persona a 28 × 42 en cualquier dirección y pose: dibujo propio donde lo hay, el de siempre donde no. */
export function drawPersonHD(ctx: Ctx, facing: Facing, pose: Pose, c: HumanColors): void {
  ctx.clearRect(0, 0, HD_W, HD_H);
  if (!hdReady(c) || !HD_POSES.has(pose)) {
    oldScaled(ctx, facing, pose, c);
    return;
  }
  if (facing === 'down') front(ctx, c, pose);
  else if (facing === 'up') back(ctx, c, pose);
  else if (facing === 'right') side(ctx, c, pose);
  else {
    // A la izquierda, el perfil derecho en espejo (como el dibujo de siempre).
    ctx.save();
    ctx.translate(HD_W, 0);
    ctx.scale(-1, 1);
    side(ctx, c, pose);
    ctx.restore();
  }
  if (facing !== 'up') faceFromOld(ctx, facing, pose, c);
  finish(ctx, silhouetteHD(facing, pose, c));
}

/**
 * La cara es la de toda la gente del juego: la del dibujo de 16 × 24, píxel a
 * píxel, llevada a 28 × 42 por vecino más cercano (ojos, nariz, boca, rubor y
 * barbilla). Así el jugador y quien lleve el dibujo nuevo son la misma persona
 * que los demás; lo nuevo es el pelo, la ropa y el cuerpo. Recuadro en px de
 * 16 × 24, bajo el flequillo; baja con el tronco al andar.
 */
function faceFromOld(ctx: Ctx, facing: Facing, pose: Pose, c: HumanColors): void {
  const b = pose >= 1 && pose <= 3 ? 1 : 0;
  const [x0, x1] = facing === 'down' ? [5, 10] : facing === 'right' ? [8, 12] : [3, 7];
  const [y0, y1] = [5 + b, 8 + b];
  const old = oldPixels(facing, pose, c);
  const img = ctx.getImageData(0, 0, HD_W, HD_H);
  for (let y = 0; y < HD_H; y++) {
    for (let x = 0; x < HD_W; x++) {
      const s = src(x, y);
      const sx = s % 16;
      const sy = Math.floor(s / 16);
      if (sx < x0 || sx > x1 || sy < y0 || sy > y1 || !old[s * 4 + 3]) continue;
      img.data.set(old.subarray(s * 4, s * 4 + 4), (y * HD_W + x) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
}

export interface ComparePerson {
  label: string;
  colors: HumanColors;
  /** Su textura de verdad en el juego (la que usa su sprite): clave y, en un atlas, fotograma. */
  live: (facing: Facing, pose: Pose) => { key: string; frame?: string };
}

/**
 * Herramienta de desarrollo (lifesim.hdCompare()): junto al jugador, cada
 * persona en las cuatro direcciones dos veces, arriba OLD (el dibujo de 16 × 24
 * de siempre) y abajo NEW (la textura que usa su sprite en el juego), a la
 * escala del mundo. Sin cuerpo ni lógica; otra llamada lo quita.
 */
let shown: Phaser.GameObjects.GameObject[] = [];
export function hdCompare(scene: Phaser.Scene, at: { x: number; y: number }, people: readonly ComparePerson[]): string {
  if (shown.length) {
    shown.forEach((o) => o.destroy());
    shown = [];
    return 'quitado';
  }
  const views: readonly (readonly [Facing, Pose])[] = [['down', 0], ['down', 1], ['right', 0], ['right', 1], ['up', 0], ['left', 0]];
  const label = (text: string, x: number, y: number): void => {
    shown.push(scene.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '24px', color: '#ffffff', backgroundColor: '#000000aa' }).setScale(0.25).setOrigin(1, 1).setDepth(at.y + 100));
  };
  // Por parejas, en la misma fila: a la izquierda ORIGINAL (16 × 24), a la derecha HD (la textura de su sprite).
  const oldKey = (person: ComparePerson, facing: Facing, pose: Pose): string => {
    const key = `old-${person.label}-${facing}-${pose}`;
    if (!scene.textures.exists(key)) {
      const tex = scene.textures.createCanvas(key, 16, 24);
      if (tex) {
        drawHuman(tex.getContext(), facing, pose, person.colors);
        tex.refresh();
      }
    }
    return key;
  };
  let y = at.y;
  for (const person of people) {
    const x0 = at.x - (views.length * 40) / 2;
    label(`ORIGINAL | HD · ${person.label}`, x0 + 30, y - 26);
    views.forEach(([facing, pose], i) => {
      const x = x0 + i * 40;
      const live = person.live(facing, pose);
      const pair: readonly (readonly [string, string | undefined, number])[] = [[oldKey(person, facing, pose), undefined, x], [live.key, live.frame, x + 17]];
      for (const [key, frame, px0] of pair) {
        const img = scene.add.image(px0, y, key, frame).setOrigin(0.5, 1).setDepth(y);
        // El de 28 × 42 a la escala del mundo: la misma que le pone su entidad en el juego.
        img.setScale(16 / img.width);
        shown.push(scene.add.image(px0, y - 1, 'fx-shadow').setDepth(y - 1), img);
      }
    });
    y += 34;
  }
  return 'por parejas: a la izquierda ORIGINAL (16 × 24), a la derecha HD (la textura que usa su sprite en el juego)';
}
