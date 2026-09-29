import type Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import { make, px, shade, sprinkle, type Ctx } from './paint';

/**
 * El gimnasio: suelo de caucho, espejos, máquinas y lo que hay por medio. Mismo
 * idioma que PropArt (luz del noroeste, base oscura, sin contornos negros).
 *
 * Las máquinas a las que se sube alguien (cinta, bici, remo, banco, jaula)
 * están dibujadas para la persona que las usa: el sillín, la banda o el banco
 * caen justo donde entities/Character pone el cuerpo en cada pose. Si se toca
 * una pose de world/HumanArt, hay que mirar su máquina.
 */

/** Rojo de la casa (el del uniforme del personal) y el cian de las pantallas. */
const FORJA = '#b8423a';
const SCREEN = '#7fe3d6';
const RUBBER = '#353a46';
const PAD = '#34282c';

// ----------------------------------------------------------------- suelo

/**
 * Caucho de losetas con grano de colores (EPDM): motas grises, azuladas y
 * alguna teja, con la junta apenas marcada. Las motas salen de ruido por
 * variante, así que no se leen como lunares.
 */
function drawGymFloor(ctx: Ctx, variant: number): void {
  px(ctx, RUBBER, 0, 0, TILE, TILE);
  sprinkle(ctx, shade(RUBBER, 0.05), TILE, TILE, 11 + variant * 17, 22);
  sprinkle(ctx, '#3a4556', TILE, TILE, 5 + variant * 29, 7);
  sprinkle(ctx, '#463238', TILE, TILE, 41 + variant * 13, 3);
  sprinkle(ctx, shade(RUBBER, -0.04), TILE, TILE, 71 + variant * 7, 10);
  px(ctx, shade(RUBBER, -0.035), 0, 0, TILE, 1);
  px(ctx, shade(RUBBER, -0.035), 0, 0, 1, TILE);
}

// -------------------------------------------------------------- pared

/**
 * Espejo de gimnasio: marco fino, cristal que aclara hacia arriba, el reflejo
 * del caucho abajo, el de un tubo fluorescente arriba y dos brillos en diagonal
 * que cambian de sitio según la variante (los espejos van en fila).
 */
function drawMirror(ctx: Ctx, variant: number): void {
  const w = TILE * 2;
  px(ctx, PALETTE.metal, 1, 1, w - 2, 14);
  px(ctx, PALETTE.metalLit, 1, 1, w - 2, 1);
  const glass = shade(PALETTE.glass, 0.1);
  px(ctx, glass, 2, 2, w - 4, 12);
  px(ctx, shade(glass, 0.05), 2, 2, w - 4, 4);
  px(ctx, shade(glass, 0.09), 2, 2, w - 4, 1);
  // Lo que refleja: el suelo de la sala abajo y la luz del techo arriba.
  px(ctx, shade(RUBBER, 0.08), 2, 11, w - 4, 3);
  px(ctx, shade(glass, 0.2), 4 + variant * 5, 3, 7, 1);
  // Brillos: dos trazos en diagonal.
  const sheen = shade(PALETTE.glassLit, -0.08);
  for (const [x0, len] of [[5 + variant * 7, 8], [11 + variant * 7, 5]] as const) {
    for (let i = 0; i < len; i++) px(ctx, sheen, ((x0 + i) % (w - 5)) + 2, 12 - i, 1, 1);
  }
}

/** Letras de 3x5 para el rótulo. */
const LETTERS: Readonly<Record<string, readonly string[]>> = {
  F: ['XXX', 'X..', 'XX.', 'X..', 'X..'],
  O: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
  R: ['XX.', 'X.X', 'XX.', 'X.X', 'X.X'],
  J: ['..X', '..X', '..X', 'X.X', 'XXX'],
  A: ['XXX', 'X.X', 'XXX', 'X.X', 'X.X'],
};

/** Rótulo de la casa en la pared: placa oscura, franja roja, la barra en blanco y FORJA. */
function drawGymSign(ctx: Ctx): void {
  const w = TILE * 3;
  px(ctx, PALETTE.ink, 1, 2, w - 2, 12);
  px(ctx, shade(PALETTE.ink, 0.08), 1, 2, w - 2, 1);
  px(ctx, FORJA, 1, 2, 3, 12);
  // Pictograma: una barra con dos discos.
  px(ctx, PALETTE.white, 7, 8, 11, 1);
  px(ctx, PALETTE.white, 8, 5, 2, 7);
  px(ctx, PALETTE.white, 15, 5, 2, 7);
  let x = 22;
  for (const ch of 'FORJA') {
    LETTERS[ch].forEach((row, y) => [...row].forEach((c, i) => c === 'X' && px(ctx, PALETTE.white, x + i, 6 + y, 1, 1)));
    x += 4;
  }
  px(ctx, SCREEN, 22, 12, 19, 1);
}

// --------------------------------------------------------------- cardio

/**
 * Cinta de correr vista desde atrás, 1x2: consola con pantalla y pasamanos
 * arriba, y la banda en el tile de abajo, donde pisa quien corre.
 */
function drawTreadmill(ctx: Ctx): void {
  // Postes, pasamanos y consola.
  px(ctx, PALETTE.metal, 2, 6, 1, 14);
  px(ctx, PALETTE.metal, 13, 6, 1, 14);
  px(ctx, PALETTE.metalLit, 2, 10, 2, 1);
  px(ctx, PALETTE.metalLit, 12, 10, 2, 1);
  px(ctx, PALETTE.ink, 2, 2, 12, 7);
  px(ctx, shade(PALETTE.ink, 0.1), 2, 2, 12, 1);
  px(ctx, shade(SCREEN, -0.35), 5, 3, 6, 3);
  px(ctx, SCREEN, 5, 3, 3, 1);
  px(ctx, FORJA, 2, 8, 12, 1);
  // Motor delante y plataforma.
  px(ctx, shade(PALETTE.metal, -0.1), 2, 13, 12, 4);
  px(ctx, FORJA, 3, 14, 10, 1);
  px(ctx, PALETTE.metal, 2, 17, 12, 14);
  px(ctx, PALETTE.metalLit, 2, 17, 1, 14);
  px(ctx, shade(PALETTE.metal, -0.12), 13, 17, 1, 14);
  belt(ctx, 4, 17, 0);
  px(ctx, PALETTE.metalLit, 3, 30, 10, 1);
}

/** La banda: goma oscura con listones que avanzan dos píxeles por fase. */
function belt(ctx: Ctx, x: number, y: number, phase: number): void {
  px(ctx, PALETTE.ink, x, y, 8, 13);
  for (let row = (phase * 2) % 4; row < 13; row += 4) px(ctx, shade(PALETTE.ink, 0.1), x, y + row, 8, 1);
}

/**
 * Bici estática desde atrás, 1x2: consola arriba, carenado rojo del volante,
 * manillar, sillín a la altura de la cadera de quien pedalea y base con patas.
 */
function drawExerciseBike(ctx: Ctx): void {
  px(ctx, PALETTE.ink, 4, 3, 8, 5);
  px(ctx, shade(SCREEN, -0.35), 5, 4, 6, 2);
  px(ctx, SCREEN, 5, 4, 2, 1);
  px(ctx, PALETTE.metal, 7, 8, 2, 6);
  px(ctx, PALETTE.metalLit, 2, 12, 12, 1);
  px(ctx, PALETTE.ink, 2, 11, 2, 3);
  px(ctx, PALETTE.ink, 12, 11, 2, 3);
  // Volante con su carenado.
  px(ctx, FORJA, 4, 14, 8, 7);
  px(ctx, shade(FORJA, 0.1), 4, 14, 8, 1);
  px(ctx, shade(FORJA, -0.15), 10, 15, 2, 6);
  px(ctx, PALETTE.metalLit, 7, 16, 2, 2);
  // Tija, sillín y bielas.
  px(ctx, PALETTE.metal, 7, 21, 2, 7);
  px(ctx, PALETTE.ink, 5, 22, 6, 3);
  px(ctx, shade(PALETTE.ink, 0.12), 5, 22, 6, 1);
  px(ctx, PALETTE.metal, 3, 26, 10, 1);
  px(ctx, PALETTE.ink, 2, 25, 2, 2);
  px(ctx, PALETTE.ink, 12, 25, 2, 2);
  // Base.
  px(ctx, PALETTE.metal, 1, 29, 14, 2);
  px(ctx, PALETTE.metalLit, 1, 29, 14, 1);
  px(ctx, PALETTE.ink, 1, 30, 2, 2);
  px(ctx, PALETTE.ink, 13, 30, 2, 2);
}

/**
 * Remo de perfil, 2x1: el carro con el asiento en el tile izquierdo (donde se
 * sienta), reposapiés en medio y el volante con su pantalla a la derecha.
 */
function drawRower(ctx: Ctx): void {
  px(ctx, PALETTE.metal, 2, 12, 22, 2);
  px(ctx, PALETTE.metalLit, 2, 12, 22, 1);
  px(ctx, PALETTE.ink, 1, 13, 3, 3);
  // Asiento.
  px(ctx, PALETTE.ink, 5, 9, 6, 3);
  px(ctx, shade(PALETTE.ink, 0.14), 5, 9, 6, 1);
  // Reposapiés.
  px(ctx, FORJA, 14, 8, 2, 5);
  px(ctx, shade(FORJA, -0.2), 16, 9, 1, 4);
  // Volante: carcasa redonda con rejilla, y la pantalla en su brazo.
  px(ctx, PALETTE.ink, 21, 4, 9, 10);
  px(ctx, PALETTE.ink, 20, 6, 11, 6);
  px(ctx, shade(PALETTE.ink, 0.12), 22, 4, 6, 1);
  for (const y of [6, 8, 10]) px(ctx, shade(PALETTE.metal, -0.1), 23, y, 5, 1);
  px(ctx, FORJA, 20, 11, 11, 1);
  px(ctx, PALETTE.metal, 18, 2, 1, 6);
  px(ctx, PALETTE.ink, 16, 0, 5, 3);
  px(ctx, shade(SCREEN, -0.3), 17, 1, 3, 1);
  // El tirador en su gancho y el pie de delante.
  px(ctx, PALETTE.metalLit, 19, 8, 1, 3);
  px(ctx, PALETTE.ink, 27, 14, 4, 2);
}

// ------------------------------------------------------------ peso libre

/** Barra olímpica: la barra y un disco a cada lado, de canto. `x0` es el borde izquierdo del disco. */
function barbell(ctx: Ctx, x0: number, y: number, w: number): void {
  px(ctx, PALETTE.metalLit, x0, y, w, 1);
  for (const x of [x0, x0 + w - 2]) {
    px(ctx, PALETTE.ink, x, y - 3, 2, 7);
    px(ctx, shade(PALETTE.ink, 0.16), x, y - 3, 2, 1);
  }
}

/**
 * Banco de press, 1x2: la jaula de dos postes en la cabecera (arriba) con la
 * barra en sus ganchos, y el banco largo donde se tumba quien lo usa. Sin la
 * barra es la versión que se pinta mientras alguien la tiene en las manos.
 */
function drawBenchPress(ctx: Ctx, racked: boolean): void {
  for (const x of [1, 13]) {
    px(ctx, PALETTE.metal, x, 1, 2, 14);
    px(ctx, PALETTE.metalLit, x, 1, 1, 14);
    px(ctx, PALETTE.ink, x === 1 ? 2 : 13, 7, 1, 2);
    px(ctx, PALETTE.metal, x - 1, 14, 4, 2);
  }
  if (racked) barbell(ctx, 0, 8, 16);
  // Banco: tapizado oscuro con la luz arriba, patas y el travesaño de los pies.
  px(ctx, PAD, 5, 9, 6, 16);
  px(ctx, shade(PAD, 0.1), 5, 9, 6, 1);
  px(ctx, shade(PAD, 0.05), 5, 10, 2, 14);
  px(ctx, PALETTE.metal, 7, 25, 2, 4);
  px(ctx, PALETTE.metal, 4, 28, 8, 2);
  px(ctx, PALETTE.metalLit, 4, 28, 8, 1);
}

/**
 * Jaula de sentadillas, 1x3, sobre su tarima de madera: dos postes altos con
 * travesaño y barra de dominadas, ganchos a la altura del hombro, brazos de
 * seguridad y discos guardados abajo. Sin barra, la versión en uso.
 */
function drawSquatRack(ctx: Ctx, racked: boolean): void {
  // Tarima.
  px(ctx, PALETTE.wood, 0, 40, 16, 8);
  px(ctx, PALETTE.woodLit, 0, 40, 16, 1);
  px(ctx, PALETTE.woodDark, 0, 44, 16, 1);
  px(ctx, PALETTE.woodDark, 7, 40, 1, 8);
  for (const x of [0, 14]) {
    px(ctx, PALETTE.metal, x, 2, 2, 44);
    px(ctx, PALETTE.metalLit, x, 2, 1, 44);
    for (let y = 8; y < 40; y += 4) px(ctx, shade(PALETTE.metal, -0.15), x + 1, y, 1, 1);
    // Gancho y brazo de seguridad.
    px(ctx, PALETTE.ink, x === 0 ? 2 : 13, 32, 1, 3);
    px(ctx, PALETTE.metalLit, x === 0 ? 1 : 12, 39, 3, 1);
  }
  px(ctx, PALETTE.metal, 0, 2, 16, 2);
  px(ctx, PALETTE.metalLit, 0, 2, 16, 1);
  px(ctx, PALETTE.metalLit, 2, 6, 12, 1);
  if (racked) barbell(ctx, 0, 33, 16);
  // Discos guardados en los postes.
  px(ctx, PALETTE.ink, 0, 42, 2, 5);
  px(ctx, PALETTE.ink, 14, 41, 2, 6);
}

/**
 * Polea, 1x3: torre con dos poleas arriba, la pila de placas en medio con su
 * pasador y los cables bajando hacia quien tira, delante.
 */
function drawCableMachine(ctx: Ctx): void {
  for (const x of [1, 13]) {
    px(ctx, PALETTE.metal, x, 2, 2, 44);
    px(ctx, PALETTE.metalLit, x, 2, 1, 44);
  }
  px(ctx, PALETTE.metal, 1, 2, 14, 3);
  px(ctx, PALETTE.metalLit, 1, 2, 14, 1);
  // Poleas y cables.
  px(ctx, PALETTE.ink, 3, 5, 2, 2);
  px(ctx, PALETTE.ink, 11, 5, 2, 2);
  px(ctx, shade(PALETTE.ink, 0.25), 4, 7, 1, 32);
  px(ctx, shade(PALETTE.ink, 0.25), 11, 7, 1, 32);
  // Guías y pila de placas, con el pasador rojo.
  px(ctx, PALETTE.metalLit, 6, 8, 1, 34);
  px(ctx, PALETTE.metalLit, 9, 8, 1, 34);
  for (let y = 24; y < 42; y += 2) {
    px(ctx, PALETTE.ink, 5, y, 6, 1);
    px(ctx, shade(PALETTE.ink, 0.12), 5, y + 1, 6, 1);
  }
  px(ctx, FORJA, 10, 30, 2, 1);
  px(ctx, PALETTE.metal, 0, 44, 16, 3);
  px(ctx, PALETTE.metalLit, 0, 44, 16, 1);
  // Los agarres cuelgan a la altura de la mano.
  px(ctx, PALETTE.ink, 3, 39, 3, 1);
  px(ctx, PALETTE.ink, 10, 39, 3, 1);
}

/**
 * Estante de mancuernas, 3x2, contra el espejo: dos baldas con pares de menos
 * a más peso (las pequeñas, de goma de color).
 */
function drawDumbbellRack(ctx: Ctx): void {
  const w = TILE * 3;
  for (const x of [2, 23, 44]) {
    px(ctx, PALETTE.metal, x, 10, 2, 21);
    px(ctx, PALETTE.metalLit, x, 10, 1, 21);
  }
  const light = ['#4f6fa8', '#c9a13a', FORJA];
  for (const [y, heavy] of [[12, false], [21, true]] as const) {
    px(ctx, PALETTE.metal, 1, y + 3, w - 2, 2);
    px(ctx, PALETTE.metalLit, 1, y + 3, w - 2, 1);
    for (let i = 0; i < 7; i++) {
      const x = 3 + i * 6;
      const head = heavy ? PALETTE.ink : light[i % 3];
      const h = heavy ? 3 + (i % 3 === 2 ? 1 : 0) : 2 + (i % 2);
      const top = y + 3 - h;
      px(ctx, PALETTE.metal, x + 1, y + 1, 3, 1);
      px(ctx, head, x, top, 1, h);
      px(ctx, head, x + 4, top, 1, h);
      px(ctx, shade(head, 0.14), x, top, 1, 1);
    }
  }
}

/** Árbol de discos, 1x2: poste con pegs y discos de varios tamaños a los lados. */
function drawPlateTree(ctx: Ctx): void {
  px(ctx, PALETTE.metal, 7, 6, 2, 24);
  px(ctx, PALETTE.metalLit, 7, 6, 1, 24);
  px(ctx, PALETTE.metal, 3, 29, 10, 2);
  for (const [x, y, w, h] of [[2, 10, 5, 12], [9, 12, 4, 9], [3, 22, 4, 7], [9, 22, 4, 7]] as const) {
    px(ctx, PALETTE.ink, x, y, w, h);
    px(ctx, shade(PALETTE.ink, 0.14), x, y, w, 1);
    px(ctx, PALETTE.metal, x + Math.floor(w / 2), y + Math.floor(h / 2), 1, 1);
  }
}

/** Fila de pesas rusas sobre una esterilla de goma, cada peso de su color. */
function drawKettlebells(ctx: Ctx): void {
  px(ctx, shade(RUBBER, -0.05), 0, 9, TILE * 2, 7);
  px(ctx, shade(RUBBER, 0.05), 0, 9, TILE * 2, 1);
  ['#4f6fa8', '#c9a13a', FORJA, PALETTE.ink, PALETTE.ink].forEach((c, i) => {
    const x = 2 + i * 6;
    const s = i < 3 ? 0 : 1;
    px(ctx, c, x, 9 - s, 5, 5 + s);
    px(ctx, shade(c, 0.14), x, 9 - s, 2, 1);
    px(ctx, PALETTE.metal, x + 1, 6 - s, 3, 1);
    px(ctx, PALETTE.metal, x + 1, 7 - s, 1, 2);
    px(ctx, PALETTE.metal, x + 3, 7 - s, 1, 2);
  });
}

// ------------------------------------------------------------ por el suelo

const MATS = ['#3f7f86', '#6b4f8c', '#8a5a44'] as const;

/** Esterilla desenrollada, a lo largo del tile, con el extremo de arriba algo enrollado. */
function drawYogaMat(ctx: Ctx, variant: number): void {
  const c = MATS[variant % MATS.length];
  px(ctx, c, 3, 1, 10, 15);
  px(ctx, shade(c, 0.08), 3, 1, 10, 1);
  px(ctx, shade(c, -0.1), 3, 2, 10, 1);
  px(ctx, shade(c, 0.05), 3, 3, 1, 13);
  for (let i = 0; i < 6; i++) px(ctx, shade(c, -0.04), 4 + ((i * 5 + variant) % 9), 4 + ((i * 7) % 11), 1, 1);
}

/** Lo que deja la gente: una toalla con botella, una botella tumbada o un disco suelto. */
function drawGymTowel(ctx: Ctx, variant: number): void {
  if (variant === 2) {
    px(ctx, PALETTE.ink, 5, 7, 6, 6);
    px(ctx, PALETTE.ink, 4, 8, 8, 4);
    px(ctx, shade(PALETTE.ink, 0.16), 5, 7, 4, 1);
    px(ctx, PALETTE.metal, 7, 9, 2, 2);
    return;
  }
  const bottle = shade(PALETTE.waterLit, 0.05);
  if (variant === 0) {
    // Toalla doblada con la raya de la casa y una botella de pie al lado.
    px(ctx, PALETTE.white, 3, 8, 7, 5);
    px(ctx, shade(PALETTE.white, -0.12), 3, 11, 7, 2);
    px(ctx, FORJA, 3, 9, 7, 1);
    px(ctx, bottle, 11, 6, 3, 6);
    px(ctx, PALETTE.white, 11, 6, 1, 5);
    px(ctx, PALETTE.ink, 11, 5, 3, 1);
  } else {
    // Botella tumbada.
    px(ctx, bottle, 5, 9, 6, 3);
    px(ctx, PALETTE.white, 5, 9, 5, 1);
    px(ctx, PALETTE.ink, 11, 9, 1, 3);
  }
}

/** Dos bolsas de deporte en el suelo, junto a las taquillas. */
function drawGymBags(ctx: Ctx): void {
  px(ctx, PALETTE.ink, 2, 8, 13, 7);
  px(ctx, shade(PALETTE.ink, 0.14), 2, 8, 13, 1);
  px(ctx, FORJA, 2, 11, 13, 1);
  px(ctx, PALETTE.metal, 6, 6, 5, 1);
  px(ctx, PALETTE.metal, 6, 7, 1, 1);
  px(ctx, PALETTE.metal, 10, 7, 1, 1);
  const grey = '#5a6070';
  px(ctx, grey, 17, 9, 12, 6);
  px(ctx, shade(grey, 0.12), 17, 9, 12, 1);
  px(ctx, shade(grey, -0.15), 26, 10, 3, 5);
  px(ctx, PALETTE.ink, 20, 8, 6, 1);
}

export function buildGymTextures(scene: Phaser.Scene): void {
  for (let v = 0; v < 2; v++) make(scene, `tile-gym-floor-${v}`, TILE, TILE, (ctx) => drawGymFloor(ctx, v));
  for (let v = 0; v < 3; v++) {
    make(scene, `prop-mirror-${v}`, TILE * 2, TILE, (ctx) => drawMirror(ctx, v));
    make(scene, `prop-yoga-mat-${v}`, TILE, TILE, (ctx) => drawYogaMat(ctx, v));
    make(scene, `prop-gym-towel-${v}`, TILE, TILE, (ctx) => drawGymTowel(ctx, v));
  }
  make(scene, 'prop-gym-sign', TILE * 3, TILE, drawGymSign);
  make(scene, 'prop-treadmill', TILE, TILE * 2, drawTreadmill);
  make(scene, 'prop-exercise-bike', TILE, TILE * 2, drawExerciseBike);
  make(scene, 'prop-rower', TILE * 2, TILE, drawRower);
  make(scene, 'prop-bench-press', TILE, TILE * 2, (ctx) => drawBenchPress(ctx, true));
  make(scene, 'prop-bench-press-empty', TILE, TILE * 2, (ctx) => drawBenchPress(ctx, false));
  make(scene, 'prop-squat-rack', TILE, TILE * 3, (ctx) => drawSquatRack(ctx, true));
  make(scene, 'prop-squat-rack-empty', TILE, TILE * 3, (ctx) => drawSquatRack(ctx, false));
  make(scene, 'prop-cable-machine', TILE, TILE * 3, drawCableMachine);
  make(scene, 'prop-weights', TILE * 3, TILE * 2, drawDumbbellRack);
  make(scene, 'prop-plate-tree', TILE, TILE * 2, drawPlateTree);
  make(scene, 'prop-kettlebells', TILE * 2, TILE, drawKettlebells);
  make(scene, 'prop-gym-bags', TILE * 2, TILE, drawGymBags);
  // Lo que se mueve mientras alguien usa la máquina (entities/Character): la barra en las manos y la banda.
  make(scene, 'fx-barbell', 18, 7, (ctx) => barbell(ctx, 0, 3, 18));
  for (let v = 0; v < 2; v++) make(scene, `fx-belt-${v}`, 8, 13, (ctx) => belt(ctx, 0, 0, v));
}
