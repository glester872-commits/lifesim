import type Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import { make, px, shade, sprinkle, type Ctx } from './paint';

/**
 * Props de la Ribera Norte (data/ribera.ts): las barras de dominadas, la rampa y la
 * caja de la zona de skate, el quiosco de helados y las máquinas del salón
 * recreativo. Mismo idioma que PropArt: vista cenital con un poco de frente, base
 * oscura abajo, luz arriba a la izquierda, todo desde PALETTE.
 */

const NEON_PINK = '#ff6ab8';
const NEON_CYAN = '#8ff0ff';
const NEON_YELLOW = '#ffd84a';
const NEON_GREEN = '#7dff9a';

/** Barras de dominadas, 2×3: dos postes de acero, la barra alta y una más baja, sobre sus placas. */
function drawPullupBar(ctx: Ctx): void {
  for (const x of [3, 26]) {
    px(ctx, PALETTE.ink, x - 1, 46, 5, 2);
    px(ctx, PALETTE.metal, x, 7, 3, 40);
    px(ctx, PALETTE.metalLit, x, 7, 1, 40);
    px(ctx, shade(PALETTE.metal, -0.25), x + 2, 8, 1, 38);
  }
  // Barra alta (dominadas), barra media (fondos) y el travesaño de refuerzo.
  px(ctx, PALETTE.ink, 3, 6, 26, 4);
  px(ctx, PALETTE.metalLit, 3, 6, 26, 2);
  px(ctx, shade(PALETTE.metal, -0.2), 3, 8, 26, 1);
  px(ctx, PALETTE.metal, 5, 22, 22, 2);
  px(ctx, PALETTE.metalLit, 5, 22, 22, 1);
  px(ctx, shade(PALETTE.metal, -0.15), 3, 36, 26, 1);
  // Cinta del agarre, azul, en el centro de la barra alta.
  px(ctx, '#3f6f9a', 12, 6, 8, 2);
}

/** Rampa de skate, 2×2: cuarto de tubo de hormigón visto de lado, con el remate de acero y alguna pegatina. */
function drawSkateRamp(ctx: Ctx): void {
  const concrete = PALETTE.stone;
  px(ctx, 'rgba(0,0,0,0.25)', 1, 29, 30, 3);
  for (let x = 0; x < 32; x++) {
    const top = 30 - Math.round(24 * Math.pow(x / 31, 2.2));
    px(ctx, shade(concrete, -0.06 - (x / 31) * 0.1), x, top, 1, 30 - top);
    px(ctx, shade(concrete, 0.12), x, top, 1, 1);
  }
  // Remate de acero arriba del todo y el cuerpo trasero.
  px(ctx, PALETTE.metalLit, 27, 5, 5, 2);
  px(ctx, shade(PALETTE.stone, -0.22), 28, 7, 4, 23);
  // Un grafiti y una pegatina.
  px(ctx, '#ff6ab8', 8, 26, 5, 1);
  px(ctx, '#8ff0ff', 14, 24, 3, 1);
  px(ctx, PALETTE.amber, 20, 20, 2, 2);
  sprinkle(ctx, shade(concrete, -0.2), 32, 28, 5, 14);
}

/** Caja de skate, 2×1: bloque de hormigón con el canto de acero y las rozaduras de las ruedas. */
function drawSkateBox(ctx: Ctx): void {
  px(ctx, 'rgba(0,0,0,0.25)', 1, 13, 30, 3);
  px(ctx, shade(PALETTE.stone, -0.12), 1, 5, 30, 9);
  px(ctx, PALETTE.stone, 1, 3, 30, 4);
  px(ctx, PALETTE.stoneLit, 1, 3, 30, 1);
  px(ctx, PALETTE.metalLit, 1, 3, 30, 1);
  px(ctx, shade(PALETTE.stone, -0.3), 1, 13, 30, 1);
  px(ctx, '#e6e0d4', 6, 9, 5, 1);
  px(ctx, '#e6e0d4', 15, 8, 8, 1);
  sprinkle(ctx, shade(PALETTE.stone, -0.22), 30, 8, 9, 10);
}

/** Quiosco de helados, 2×2: toldo de rayas rosa y crema, ventanilla, el cucurucho de cartel y la pizarra de sabores. */
function drawIceCreamKiosk(ctx: Ctx): void {
  px(ctx, 'rgba(0,0,0,0.25)', 2, 29, 28, 3);
  // Cuerpo.
  px(ctx, PALETTE.ink, 2, 11, 28, 19);
  px(ctx, '#f0e6d2', 3, 12, 26, 17);
  px(ctx, shade('#f0e6d2', -0.12), 3, 27, 26, 2);
  // Ventanilla con el mostrador.
  px(ctx, PALETTE.ink, 6, 15, 14, 8);
  px(ctx, '#5a3a2a', 7, 16, 12, 6);
  px(ctx, '#ffb8d8', 8, 17, 3, 3);
  px(ctx, '#8ff0ff', 12, 17, 3, 3);
  px(ctx, '#ffd84a', 16, 17, 2, 3);
  px(ctx, PALETTE.wood, 5, 23, 16, 2);
  // Pizarra de sabores.
  px(ctx, '#2a2e2a', 22, 15, 6, 9);
  px(ctx, '#e6e0d4', 23, 17, 4, 1);
  px(ctx, '#ffb8d8', 23, 19, 4, 1);
  px(ctx, '#e6e0d4', 23, 21, 3, 1);
  // Toldo de rayas, algo volado.
  for (let x = 0; x < 30; x += 4) {
    px(ctx, '#e8789f', 1 + x, 6, 2, 6);
    px(ctx, '#f6ecd8', 3 + x, 6, 2, 6);
  }
  px(ctx, shade('#e8789f', -0.2), 1, 11, 30, 1);
  // Cucurucho sobre el toldo: cono, bola de fresa y bola de nata.
  px(ctx, PALETTE.ink, 13, 0, 6, 6);
  px(ctx, '#e8789f', 14, 0, 4, 2);
  px(ctx, '#f6ecd8', 14, 2, 4, 1);
  px(ctx, '#d9a45a', 15, 3, 2, 3);
}

// ------------------------------------------------------------- recreativas

const CABINETS = [
  { body: '#2a3a6b', glow: NEON_CYAN, screen: ['#1a2a8c', '#d84a5a', '#ffd84a'] },
  { body: '#6b2a4a', glow: NEON_PINK, screen: ['#2a0a2a', '#7dff9a', '#8ff0ff'] },
  { body: '#2a6b4a', glow: NEON_YELLOW, screen: ['#0a2a1a', '#ff6ab8', '#ffd84a'] },
] as const;

/** Lo común de las recreativas, 1×2: el contorno, el rótulo luminoso arriba y la sombra. */
function cabinetFrame(ctx: Ctx, body: string, glow: string): void {
  px(ctx, 'rgba(0,0,0,0.3)', 1, 29, 14, 3);
  px(ctx, PALETTE.ink, 1, 2, 14, 28);
  px(ctx, body, 2, 3, 12, 26);
  px(ctx, shade(body, 0.12), 2, 3, 2, 26);
  px(ctx, shade(body, -0.2), 12, 3, 2, 26);
  // Rótulo luminoso.
  px(ctx, shade(glow, -0.25), 3, 4, 10, 3);
  px(ctx, glow, 4, 5, 8, 1);
}

/** Recreativa de pie (lucha, plataformas, tiros), 1×2: pantalla, panel con palanca y botones, y la ranura de monedas. */
function drawCabinet(ctx: Ctx, v: number): void {
  const c = CABINETS[v % CABINETS.length];
  cabinetFrame(ctx, c.body, c.glow);
  // Pantalla: un fondo y dos "luchadores" o naves.
  px(ctx, PALETTE.ink, 3, 8, 10, 8);
  px(ctx, c.screen[0], 4, 9, 8, 6);
  px(ctx, c.screen[1], 5, 12, 2, 3);
  px(ctx, c.screen[2], 9, 11, 2, 4);
  px(ctx, '#ffffff', 7, 10, 1, 1);
  // Panel de mandos, inclinado: palanca roja y tres botones.
  px(ctx, shade(c.body, -0.3), 3, 17, 10, 4);
  px(ctx, '#c0493f', 5, 17, 2, 2);
  px(ctx, PALETTE.ink, 5, 19, 2, 1);
  px(ctx, NEON_YELLOW, 8, 18, 1, 1);
  px(ctx, NEON_CYAN, 10, 18, 1, 1);
  px(ctx, NEON_PINK, 9, 20, 1, 1);
  // Ranura de monedas.
  px(ctx, PALETTE.ink, 5, 23, 6, 4);
  px(ctx, PALETTE.amber, 7, 24, 2, 1);
}

/** Recreativa de carreras, 1×2: pantalla ancha con el camino en perspectiva, volante y pedal. */
function drawRacing(ctx: Ctx, v: number): void {
  const c = CABINETS[(v + 1) % CABINETS.length];
  cabinetFrame(ctx, c.body, c.glow);
  px(ctx, PALETTE.ink, 3, 8, 10, 9);
  px(ctx, '#3f6f9a', 4, 9, 8, 3);
  px(ctx, '#4a7a3a', 4, 12, 8, 4);
  // Carretera en perspectiva y un coche.
  px(ctx, '#5e6571', 7, 11, 2, 1);
  px(ctx, '#5e6571', 6, 12, 4, 1);
  px(ctx, '#5e6571', 5, 13, 6, 1);
  px(ctx, '#5e6571', 4, 14, 8, 2);
  px(ctx, '#d84a5a', 7, 14, 2, 1);
  // Volante y pedales.
  px(ctx, PALETTE.ink, 5, 18, 6, 1);
  px(ctx, PALETTE.ink, 4, 19, 8, 3);
  px(ctx, shade(c.body, -0.3), 5, 19, 6, 2);
  px(ctx, PALETTE.metalLit, 7, 18, 2, 1);
  px(ctx, PALETTE.ink, 5, 24, 6, 3);
  px(ctx, '#c0493f', 6, 25, 2, 1);
  px(ctx, PALETTE.metal, 9, 25, 2, 1);
}

/** Máquina de las pinzas, 1×2: vitrina de cristal con peluches, la pinza colgando y la palanca abajo. */
function drawClaw(ctx: Ctx, v: number): void {
  const body = ['#8c2f5a', '#2f5a8c', '#5a8c2f'][v % 3];
  cabinetFrame(ctx, body, NEON_YELLOW);
  // Vitrina.
  px(ctx, PALETTE.ink, 3, 8, 10, 12);
  px(ctx, '#bfe3e6', 4, 9, 8, 10);
  px(ctx, shade('#bfe3e6', -0.2), 4, 9, 1, 10);
  // Peluches de colores amontonados abajo.
  const toys = ['#e8789f', '#ffd84a', '#7dff9a', '#8ff0ff', '#c0493f'];
  for (let i = 0; i < 5; i++) px(ctx, toys[(i + v) % toys.length], 4 + i * 2, 15 + (i % 2), 2, 3 - (i % 2));
  // La pinza, colgando de su raíl.
  px(ctx, PALETTE.metalLit, 4, 9, 8, 1);
  px(ctx, PALETTE.metal, 8, 10, 1, 3);
  px(ctx, PALETTE.metalLit, 7, 13, 3, 1);
  px(ctx, PALETTE.metal, 7, 14, 1, 1);
  px(ctx, PALETTE.metal, 9, 14, 1, 1);
  // Palanca y ranura.
  px(ctx, shade(body, -0.3), 3, 21, 10, 3);
  px(ctx, '#c0493f', 5, 21, 2, 2);
  px(ctx, NEON_CYAN, 9, 22, 2, 1);
  px(ctx, PALETTE.ink, 6, 26, 4, 2);
  px(ctx, PALETTE.amber, 7, 26, 2, 1);
}

/**
 * Máquina de ritmo, 1×2: la pantalla con las flechas que bajan arriba y, en el tile de
 * abajo, la plataforma con las cuatro flechas iluminadas. Quien la usa se sube encima.
 */
function drawRhythm(ctx: Ctx): void {
  // Pantalla.
  px(ctx, PALETTE.ink, 1, 0, 14, 15);
  px(ctx, '#1a1230', 2, 1, 12, 13);
  px(ctx, NEON_PINK, 3, 3, 2, 2);
  px(ctx, NEON_CYAN, 7, 5, 2, 2);
  px(ctx, NEON_YELLOW, 11, 8, 2, 2);
  px(ctx, NEON_GREEN, 5, 10, 2, 2);
  px(ctx, shade('#1a1230', 0.3), 2, 12, 12, 1);
  // Plataforma: borde oscuro y cuatro pads.
  px(ctx, PALETTE.ink, 0, 16, 16, 16);
  px(ctx, '#2a2438', 1, 17, 14, 14);
  px(ctx, NEON_CYAN, 6, 18, 4, 4);
  px(ctx, NEON_PINK, 6, 26, 4, 4);
  px(ctx, NEON_YELLOW, 2, 22, 4, 4);
  px(ctx, NEON_GREEN, 10, 22, 4, 4);
  px(ctx, shade(NEON_CYAN, 0.3), 7, 19, 2, 1);
  px(ctx, shade(NEON_PINK, 0.3), 7, 27, 2, 1);
  px(ctx, shade(NEON_YELLOW, 0.3), 3, 23, 2, 1);
  px(ctx, shade(NEON_GREEN, 0.3), 11, 23, 2, 1);
}

export function buildRiverTextures(scene: Phaser.Scene): void {
  make(scene, 'prop-pullup-bar', TILE * 2, TILE * 3, drawPullupBar);
  make(scene, 'prop-skate-ramp', TILE * 2, TILE * 2, drawSkateRamp);
  make(scene, 'prop-skate-box', TILE * 2, TILE, drawSkateBox);
  make(scene, 'prop-ice-cream-kiosk', TILE * 2, TILE * 2, drawIceCreamKiosk);
  for (let v = 0; v < 3; v++) {
    make(scene, `prop-arcade-cabinet-${v}`, TILE, TILE * 2, (ctx) => drawCabinet(ctx, v));
    make(scene, `prop-arcade-racing-${v}`, TILE, TILE * 2, (ctx) => drawRacing(ctx, v));
    make(scene, `prop-arcade-claw-${v}`, TILE, TILE * 2, (ctx) => drawClaw(ctx, v));
  }
  make(scene, 'prop-arcade-rhythm', TILE, TILE * 2, drawRhythm);
}
