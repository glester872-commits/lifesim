import Phaser from 'phaser';
import type { PropKind } from '../types/game';
import { clipped, ellipse, HD_SCALE, line, makeHd, poly, rect, rgba, rng, rrect, speckle, tone, vgrad, type Ctx } from './HdKit';

/**
 * Props Visual V3 (design/VISUAL_V3.md): las mismas piezas de la calle —árbol,
 * farola, banco, aparcabicis, jardinera, papelera, tótem, plano—, dibujadas de
 * nuevo a 4× con volumen (luz del noroeste, sombra propia, brillo), materiales
 * que se reconocen (forja, madera, acero, granito) y el tamaño de su escala:
 * un plátano adulto es la masa verde de la calle, no un sello.
 *
 * Cada pieza es una textura de su tamaño de mundo, anclada abajo al centro como
 * las de siempre; la sombra de contacto va horneada en el suelo (world/HdGround).
 */

export interface HdPropArt {
  key: string;
  /** Tamaño de mundo de la textura. */
  w: number;
  h: number;
}

const IRON = '#1f2622';
const IRON_LIT = '#3d4a43';

// ------------------------------------------------------------------ árbol

/**
 * Plátano de sombra: tronco moteado (la corteza que se cae a placas), ramas que
 * se ven entre la copa, y la copa por masas de hoja en cinco tonos con la luz
 * arriba a la izquierda, sombra interior abajo a la derecha y un borde
 * irregular, nunca un círculo.
 */
function drawPlaneTree(ctx: Ctx, w: number, h: number, v: number): void {
  const r = rng(101 + v * 977);
  const cx = w / 2;
  const base = h - 1;
  const crownY = 30 + v * 3;
  const crownRx = 26 + v * 2.5;
  const crownRy = 22 + (v % 2) * 3;
  const greens = [['#2c4a26', '#3d6131', '#4f7a3a', '#6b9a4a', '#93bd62'], ['#2a4428', '#3a5a32', '#4c7440', '#678f52', '#8db36c'], ['#33492a', '#466236', '#5b7b3e', '#7a9a4c', '#a4bf6a']][v % 3];
  // Tronco: base ensanchada, corteza a placas (gris verdoso, crema y ocre).
  const trunkTop = crownY + 8;
  poly(ctx, '#5e5a48', [cx - 2.6, base, cx + 2.8, base, cx + 2.1, base - 4, cx + 1.7, trunkTop, cx - 1.6, trunkTop, cx - 2, base - 4]);
  clipped(ctx, () => {
    ctx.moveTo(cx - 2.6, base);
    ctx.lineTo(cx + 2.8, base);
    ctx.lineTo(cx + 1.7, trunkTop);
    ctx.lineTo(cx - 1.6, trunkTop);
    ctx.closePath();
  }, () => {
    for (let i = 0; i < 40; i++) ellipse(ctx, ['#c9c2a4', '#8d8a6c', '#a59a74', '#6f6c58'][Math.floor(r() * 4)], cx - 2.5 + r() * 5, trunkTop + r() * (base - trunkTop), 0.6 + r() * 0.9, 0.9 + r() * 1.6);
    rect(ctx, rgba('#120e1a', 0.35), cx + 0.6, trunkTop, 3, base - trunkTop);
    rect(ctx, rgba('#ffffff', 0.12), cx - 2.2, trunkTop, 0.8, base - trunkTop);
  });
  // Ramas principales que se abren hacia la copa.
  const branch = (x: number, y: number, tx: number, ty: number, wd: number): void => {
    line(ctx, '#4e4a3c', wd, [x, y, (x + tx) / 2 + (r() - 0.5) * 3, (y + ty) / 2, tx, ty]);
    line(ctx, rgba('#c9c2a4', 0.45), wd * 0.35, [x - wd * 0.2, y, tx - wd * 0.2, ty]);
  };
  branch(cx, trunkTop + 2, cx - crownRx * 0.55, crownY + 2, 1.6);
  branch(cx, trunkTop + 1, cx + crownRx * 0.5, crownY - 1, 1.5);
  branch(cx, trunkTop, cx - 2, crownY - crownRy * 0.6, 1.4);
  branch(cx - 1, trunkTop + 3, cx - crownRx * 0.85, crownY + 8, 1.1);
  // Masas de hoja: racimos dentro de una elipse irregular, de atrás adelante.
  const clusters: [number, number, number][] = [];
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r());
    const x = cx + Math.cos(a) * crownRx * d * 0.92;
    const y = crownY + Math.sin(a) * crownRy * d * 0.92 - (1 - d) * 3;
    clusters.push([x, y, 4.2 + r() * 4.8]);
  }
  clusters.sort((p, q) => p[1] - q[1]);
  // Sombra interior: todo un poco más grande en el tono más oscuro.
  for (const [x, y, s] of clusters) ellipse(ctx, greens[0], x + 0.8, y + 1.2, s + 1.1, s * 0.85 + 1);
  for (const [x, y, s] of clusters) {
    // Cada racimo: medio, luz arriba a la izquierda y el brillo de las hojas al sol.
    const lit = (cx - x) / crownRx * 0.6 + (crownY - y) / crownRy * 0.8;
    const base1 = lit > 0.45 ? greens[3] : lit > -0.1 ? greens[2] : greens[1];
    ellipse(ctx, base1, x, y, s, s * 0.82);
    ellipse(ctx, lit > 0.2 ? greens[4] : greens[3], x - s * 0.3, y - s * 0.32, s * 0.55, s * 0.42);
    // Hojas sueltas en el borde: el contorno no es una curva limpia.
    for (let k = 0; k < 5; k++) {
      const a = r() * Math.PI * 2;
      ellipse(ctx, lit > 0.3 ? greens[3] : greens[1], x + Math.cos(a) * s * 0.95, y + Math.sin(a) * s * 0.78, 1.1, 0.8, a);
    }
  }
  // Huecos entre masas por los que asoma una rama.
  for (let i = 0; i < 4; i++) {
    const x = cx + (r() - 0.5) * crownRx * 1.1;
    const y = crownY + (r() - 0.1) * crownRy * 0.6;
    ellipse(ctx, greens[0], x, y, 2.2, 1.5);
    line(ctx, '#4e4a3c', 0.6, [x - 1.8, y + 0.6, x + 1.6, y - 0.4]);
  }
  // Brillos sueltos de hoja al sol, arriba a la izquierda.
  for (let i = 0; i < 70; i++) {
    const a = Math.PI * (1.0 + r() * 0.75);
    const d = 0.35 + r() * 0.62;
    ellipse(ctx, rgba(greens[4], 0.9), cx + Math.cos(a) * crownRx * d, crownY + Math.sin(a) * crownRy * d, 0.7, 0.5);
  }
  // Sombra de la copa sobre su propio borde inferior.
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  vgrad(ctx, 0, crownY + crownRy * 0.2, w, crownRy, rgba('#0e1a10', 0), rgba('#0e1a10', 0.35));
  ctx.restore();
}

/** Arbusto: mata redonda por racimos, con flor en una de las variantes. */
function drawBush(ctx: Ctx, w: number, h: number, v: number): void {
  const r = rng(301 + v * 131);
  const cx = w / 2;
  const base = h - 1;
  const greens = ['#2c4a26', '#3e6431', '#557f3c', '#76a050', '#9ac26a'];
  const clusters: [number, number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const a = Math.PI + r() * Math.PI;
    const d = Math.sqrt(r());
    clusters.push([cx + Math.cos(a) * 8 * d, base - 5 + Math.sin(a) * 6 * d, 2.6 + r() * 2.4]);
  }
  clusters.sort((p, q) => p[1] - q[1]);
  for (const [x, y, s] of clusters) ellipse(ctx, greens[0], x + 0.6, y + 0.8, s + 0.8, s * 0.8 + 0.6);
  for (const [x, y, s] of clusters) {
    const lit = (cx - x) / 10 + (base - 6 - y) / 6;
    ellipse(ctx, lit > 0.4 ? greens[3] : greens[2], x, y, s, s * 0.82);
    ellipse(ctx, lit > 0.2 ? greens[4] : greens[3], x - s * 0.3, y - s * 0.3, s * 0.5, s * 0.38);
  }
  if (v === 1) for (let i = 0; i < 14; i++) ellipse(ctx, r() < 0.5 ? '#e8c86a' : '#f2eadc', cx + (r() - 0.5) * 14, base - 4 - r() * 8, 0.6, 0.6);
  if (v === 2) for (let i = 0; i < 10; i++) ellipse(ctx, '#c95a7a', cx + (r() - 0.5) * 14, base - 4 - r() * 8, 0.65, 0.55);
}

// ------------------------------------------------------------------ farola

/**
 * Farola fernandina de Madrid: basa moldurada, fuste acanalado con anillos,
 * capitel y el farol de cuatro caras con su tejadillo y el remate. El cristal
 * se ve apagado de día; de noche lo enciende world/Lighting.
 */
function drawStreetLamp(ctx: Ctx, w: number, h: number): void {
  const cx = w / 2;
  const base = h - 0.5;
  // Basa.
  rrect(ctx, IRON, cx - 3.2, base - 4, 6.4, 4, 0.8);
  rect(ctx, IRON_LIT, cx - 3.2, base - 4, 1.2, 4);
  rrect(ctx, IRON, cx - 2.4, base - 7, 4.8, 3.4, 0.6);
  rect(ctx, IRON_LIT, cx - 2.4, base - 7, 0.9, 3.4);
  // Fuste acanalado que se estrecha.
  const top = 18;
  poly(ctx, IRON, [cx - 1.4, base - 7, cx + 1.4, base - 7, cx + 0.9, top + 4, cx - 0.9, top + 4]);
  for (const dx of [-0.7, 0, 0.7]) line(ctx, dx < 0 ? IRON_LIT : tone(IRON, -0.3), 0.22, [cx + dx * 1.6, base - 7.5, cx + dx, top + 5], 'butt');
  for (const y of [base - 16, base - 26, top + 8]) {
    rrect(ctx, IRON, cx - 1.6, y, 3.2, 1.2, 0.4);
    rect(ctx, IRON_LIT, cx - 1.6, y, 3.2, 0.3);
  }
  // Capitel y brazo corto.
  rrect(ctx, IRON, cx - 2.2, top + 2, 4.4, 2.4, 0.6);
  // Farol: cuatro caras, cristal con su marco.
  poly(ctx, IRON, [cx - 3.6, top - 8, cx + 3.6, top - 8, cx + 2.4, top + 2, cx - 2.4, top + 2]);
  poly(ctx, '#d9c99a', [cx - 2.9, top - 7.2, cx + 2.9, top - 7.2, cx + 1.9, top + 1.2, cx - 1.9, top + 1.2]);
  poly(ctx, rgba('#8a7a52', 0.6), [cx + 0.4, top - 7.2, cx + 2.9, top - 7.2, cx + 1.9, top + 1.2, cx + 0.3, top + 1.2]);
  line(ctx, IRON, 0.5, [cx, top - 7.2, cx, top + 1.2], 'butt');
  rect(ctx, rgba('#ffffff', 0.35), cx - 2.5, top - 6.8, 0.6, 6);
  // Tejadillo y remate.
  poly(ctx, IRON, [cx - 4.4, top - 8, cx + 4.4, top - 8, cx + 1.6, top - 11.5, cx - 1.6, top - 11.5]);
  rect(ctx, IRON_LIT, cx - 4.4, top - 8.6, 8.8, 0.6);
  ellipse(ctx, IRON, cx, top - 12.5, 0.9, 1.3);
  line(ctx, IRON, 0.4, [cx, top - 14, cx, top - 16]);
}

/** El cristal del farol encendido: lo pinta world/Lighting encima de la noche. */
function drawLampGlow(ctx: Ctx, w: number): void {
  const cx = w / 2;
  const top = 18;
  poly(ctx, '#ffe2a6', [cx - 2.9, top - 7.2, cx + 2.9, top - 7.2, cx + 1.9, top + 1.2, cx - 1.9, top + 1.2]);
  poly(ctx, '#fff6dc', [cx - 1.6, top - 6, cx + 1.6, top - 6, cx + 1, top - 0.5, cx - 1, top - 0.5]);
}

// ------------------------------------------------------------------ mobiliario

/** Banco de plaza: listones de madera sobre patas de fundición, respaldo inclinado; el asiento a 7 px del suelo. */
function drawBench(ctx: Ctx, w: number, h: number): void {
  const base = h - 0.5;
  const wood = '#8a5a34';
  // Patas de fundición con su voluta.
  for (const x of [3.5, w - 5.5]) {
    poly(ctx, IRON, [x, base, x + 2, base, x + 2.4, base - 7, x + 1.2, base - 15, x + 0.2, base - 15, x + 0.8, base - 7]);
    rect(ctx, IRON_LIT, x, base - 7, 0.5, 7);
  }
  // Respaldo: tres listones.
  for (let i = 0; i < 3; i++) {
    const y = base - 18 + i * 2.4;
    rrect(ctx, tone(wood, -0.25), 1.2, y + 0.3, w - 2.4, 1.9, 0.5);
    rrect(ctx, tone(wood, i === 0 ? 0.12 : 0.04), 1.2, y, w - 2.4, 1.7, 0.5);
    rect(ctx, rgba('#ffffff', 0.12), 1.6, y + 0.2, w - 3.2, 0.3);
  }
  // Asiento: listones vistos desde arriba, con su canto en sombra.
  for (let i = 0; i < 3; i++) {
    const y = base - 9.4 + i * 1.5;
    rrect(ctx, tone(wood, 0.08 - i * 0.06), 0.8, y, w - 1.6, 1.3, 0.4);
  }
  rect(ctx, tone(wood, -0.35), 0.8, base - 5, w - 1.6, 1);
  speckle(ctx, rgba('#3a2414', 0.3), 1, base - 18, w - 2, 13, 40, 7);
}

/** Aparcabicis: tres arcos de acero y dos bicis aparcadas, cada una de su color, con radios y sillín. */
function drawBikeRack(ctx: Ctx, _w: number, h: number): void {
  const base = h - 0.5;
  const steel = '#9aa3a8';
  for (const x of [5, 16, 27]) {
    ctx.strokeStyle = tone(steel, -0.3);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x - 3, base);
    ctx.lineTo(x - 3, base - 7);
    ctx.arc(x, base - 7, 3, Math.PI, 0);
    ctx.lineTo(x + 3, base);
    ctx.stroke();
    ctx.strokeStyle = rgba('#ffffff', 0.5);
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    ctx.arc(x - 0.3, base - 7.3, 2.8, Math.PI * 1.05, Math.PI * 1.6);
    ctx.stroke();
  }
  bike(ctx, 2, base, '#2f6f9e', false);
  bike(ctx, 13, base, '#c0493f', true);
}

/** Bici de perfil: dos ruedas con radios, cuadro, sillín, manillar y cesta. */
export function bike(ctx: Ctx, x: number, base: number, color: string, basket: boolean): void {
  const wy = base - 3.6;
  for (const wx of [x + 3.6, x + 13.4]) {
    ctx.strokeStyle = '#1a1c20';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(wx, wy, 3.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = rgba('#c8ccd0', 0.6);
    ctx.lineWidth = 0.15;
    for (let a = 0; a < 8; a++) line(ctx, rgba('#c8ccd0', 0.55), 0.14, [wx, wy, wx + Math.cos((a * Math.PI) / 4) * 3, wy + Math.sin((a * Math.PI) / 4) * 3]);
    ellipse(ctx, '#c8ccd0', wx, wy, 0.5, 0.5);
  }
  line(ctx, color, 0.8, [x + 3.6, wy, x + 7.6, wy - 4.8, x + 12, wy - 4.6, x + 13.4, wy]);
  line(ctx, color, 0.8, [x + 3.6, wy, x + 8.6, wy, x + 7.6, wy - 4.8]);
  line(ctx, color, 0.8, [x + 8.6, wy, x + 12, wy - 4.6]);
  line(ctx, rgba('#ffffff', 0.35), 0.25, [x + 7.6, wy - 5, x + 12, wy - 4.8]);
  rrect(ctx, '#1d1a1a', x + 6.4, wy - 6.4, 2.8, 0.9, 0.4);
  line(ctx, '#2a2c30', 0.5, [x + 12, wy - 4.6, x + 12.4, wy - 7, x + 13.8, wy - 7.4]);
  if (basket) {
    rrect(ctx, '#6a4a2a', x + 13.2, wy - 7.4, 3.2, 2.4, 0.4);
    for (let k = 0; k < 4; k++) line(ctx, '#3a2414', 0.18, [x + 13.4 + k * 0.8, wy - 7.4, x + 13.4 + k * 0.8, wy - 5]);
  }
}

/** Jardinera de acero corten con matas, gramíneas y flor. */
function drawPlanter(ctx: Ctx, w: number, h: number): void {
  const base = h - 0.5;
  const r = rng(55);
  const top = base - 9;
  // Plantas por detrás del borde.
  for (let i = 0; i < 26; i++) {
    const x = 3 + r() * (w - 6);
    const y = top - r() * 9;
    ellipse(ctx, ['#2e4c27', '#46703a', '#5f8c48', '#86b05c'][Math.floor(r() * 4)], x, y, 2 + r() * 2, 1.6 + r() * 1.5);
  }
  for (let i = 0; i < 16; i++) {
    const x = 4 + r() * (w - 8);
    line(ctx, r() < 0.5 ? '#9ab866' : '#6a8f48', 0.35, [x, top + 1, x + (r() - 0.5) * 3, top - 9 - r() * 4]);
  }
  for (let i = 0; i < 12; i++) ellipse(ctx, ['#e8c86a', '#f2eadc', '#d8604a'][Math.floor(r() * 3)], 4 + r() * (w - 8), top - 3 - r() * 8, 0.65, 0.65);
  // Caja de corten: el óxido con sus vetas, canto con luz.
  rect(ctx, '#7a3e22', 1.5, top, w - 3, base - top);
  for (let x = 1.5; x < w - 1.5; x += 1) rect(ctx, rgba(r() < 0.5 ? '#9a5432' : '#5e2e18', 0.5), x, top + r() * 2, 1, base - top - r() * 2);
  rect(ctx, '#a8603a', 1.5, top, w - 3, 0.8);
  rect(ctx, rgba('#120e1a', 0.35), w - 4, top, 2.5, base - top);
  rect(ctx, '#3a2a1a', 2.2, top + 0.8, w - 4.4, 0.8);
}

/** Papelera de Madrid: cubo verde oscuro en su poste, con tapa y la bolsa asomando. */
function drawBin(ctx: Ctx, w: number, h: number): void {
  const cx = w / 2;
  const base = h - 0.5;
  rect(ctx, IRON, cx - 0.6, base - 12, 1.2, 12);
  const body = '#2e4a3a';
  rrect(ctx, tone(body, -0.25), cx - 4, base - 12.5, 8, 9, 1.4);
  rrect(ctx, body, cx - 3.8, base - 12.6, 7, 8.6, 1.3);
  for (let x = cx - 3; x < cx + 3; x += 1.4) rect(ctx, tone(body, -0.12), x, base - 11.5, 0.5, 6.5);
  rect(ctx, rgba('#ffffff', 0.18), cx - 3.6, base - 12.4, 0.8, 8);
  rrect(ctx, '#e8e4dc', cx - 3.6, base - 13.6, 7.2, 1.6, 0.6);
  rrect(ctx, tone(body, 0.12), cx - 4.4, base - 14, 8.8, 1.4, 0.7);
}

/** Tótem del metro: poste de acero con el rombo rojo y la banda azul de METRO arriba. */
function drawTotem(ctx: Ctx, w: number, h: number): void {
  const cx = w / 2;
  const base = h - 0.5;
  rrect(ctx, '#3a3f45', cx - 2, base - 3, 4, 3, 0.6);
  rect(ctx, '#8a929a', cx - 0.9, base - 36, 1.8, 33);
  rect(ctx, '#c8d0d6', cx - 0.9, base - 36, 0.5, 33);
  metroLogo(ctx, cx, base - 41, 7.2);
}

/** El logo del metro: rombo rojo con la banda azul y la palabra. */
export function metroLogo(ctx: Ctx, cx: number, cy: number, r: number): void {
  poly(ctx, '#7a1414', [cx, cy - r - 0.5, cx + r + 0.5, cy, cx, cy + r + 0.5, cx - r - 0.5, cy]);
  poly(ctx, '#d4202a', [cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy]);
  poly(ctx, '#e8484f', [cx, cy - r, cx - r, cy, cx - r + 1.2, cy, cx, cy - r + 1.2]);
  rect(ctx, '#1d3f8f', cx - r - 1.6, cy - r * 0.28, (r + 1.6) * 2, r * 0.56);
  rect(ctx, rgba('#ffffff', 0.25), cx - r - 1.6, cy - r * 0.28, (r + 1.6) * 2, 0.4);
  ctx.font = `bold ${(r * 0.48).toFixed(2)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('METRO', cx, cy + r * 0.17);
}

/** Panel del plano del barrio: dos patas, marco de acero, el plano con calles y el punto rojo. */
function drawInfoBoard(ctx: Ctx, w: number, h: number): void {
  const base = h - 0.5;
  for (const x of [2.5, w - 3.5]) {
    rect(ctx, '#3a3f45', x, base - 12, 1.2, 12);
    rect(ctx, '#7a838c', x, base - 12, 0.4, 12);
  }
  rrect(ctx, '#2e3338', 0.5, base - 29, w - 1, 18, 1);
  rect(ctx, '#ece7da', 1.6, base - 27.8, w - 3.2, 15.6);
  // Calles, manzanas, el parque y la línea de metro.
  rect(ctx, '#d6cfbe', 2.2, base - 27, w - 4.4, 14);
  for (let i = 0; i < 6; i++) rect(ctx, '#f6f2e8', 2.2, base - 25.5 + i * 2.3, w - 4.4, 0.6);
  for (let i = 0; i < 4; i++) rect(ctx, '#f6f2e8', 3.5 + i * 3.2, base - 27, 0.6, 14);
  rect(ctx, '#9ac26a', 9, base - 18.5, 4, 3);
  line(ctx, '#d4202a', 0.6, [2.5, base - 15, 7, base - 20, 13, base - 22]);
  ellipse(ctx, '#d4202a', 7, base - 20, 1, 1);
  rect(ctx, '#1d3f8f', 1.6, base - 27.8, w - 3.2, 2);
  rect(ctx, rgba('#ffffff', 0.2), 1.6, base - 27.8, 1.2, 15.6);
}

// ------------------------------------------------------------------ catálogo

/** Lo que mide cada pieza HD (px de mundo) y cuántas variantes tiene. */
const SIZES: Partial<Record<PropKind, { w: number; h: number; variants?: number; draw: (ctx: Ctx, w: number, h: number, v: number) => void; glow?: (ctx: Ctx, w: number) => void }>> = {
  'plane-tree': { w: 64, h: 96, variants: 3, draw: drawPlaneTree },
  tree: { w: 64, h: 96, variants: 3, draw: drawPlaneTree },
  bush: { w: 22, h: 16, variants: 3, draw: drawBush },
  'street-lamp': { w: 16, h: 64, draw: (c, w, h) => drawStreetLamp(c, w, h), glow: drawLampGlow },
  'plaza-bench': { w: 32, h: 22, draw: (c, w, h) => drawBench(c, w, h) },
  'bike-rack': { w: 32, h: 16, draw: (c, w, h) => drawBikeRack(c, w, h) },
  'planter-box': { w: 32, h: 26, draw: (c, w, h) => drawPlanter(c, w, h) },
  bin: { w: 16, h: 16, draw: (c, w, h) => drawBin(c, w, h) },
  'metro-totem': { w: 16, h: 52, draw: (c, w, h) => drawTotem(c, w, h), glow: (c, w) => metroLogo(c, w / 2, 52 - 0.5 - 41, 7.2) },
  'info-board': { w: 16, h: 32, draw: (c, w, h) => drawInfoBoard(c, w, h) },
};

/** Si hay pieza HD para este prop (las planas, manhole y drain, van pintadas en el suelo). */
export const hasHdProp = (kind: PropKind): boolean => kind in SIZES;

/** La textura HD de un prop en su sitio (la variante sale de la posición, siempre la misma). */
export function hdProp(scene: Phaser.Scene, kind: PropKind, tx: number, ty: number): HdPropArt | null {
  const s = SIZES[kind];
  if (!s) return null;
  const v = s.variants ? (tx * 7 + ty * 13) % s.variants : 0;
  const key = makeHd(scene, `hd-${kind}-${v}`, s.w, s.h, (ctx) => s.draw(ctx, s.w, s.h, v));
  return { key, w: s.w, h: s.h };
}

/** Lo que brilla de un prop de noche (el farol, el rombo del metro), si lo tiene. */
export function hdPropGlow(scene: Phaser.Scene, kind: PropKind): string | null {
  const s = SIZES[kind];
  if (!s?.glow) return null;
  return makeHd(scene, `hd-${kind}-glow`, s.w, s.h, (ctx) => s.glow!(ctx, s.w));
}

export const HD_PROP_SCALE = HD_SCALE;
/** Tonos de copa por sitio: el mismo árbol no se repite idéntico. */
export const CANOPY_TINTS_HD = [0xffffff, 0xf4fff0, 0xfff8ec, 0xeef6f0] as const;
