import Phaser from 'phaser';

/**
 * Kit de dibujo del arte en alta definición (Visual V3, design/VISUAL_V3.md).
 *
 * Todo se dibuja en coordenadas de MUNDO (un tile = 16) sobre un lienzo `HD`
 * veces más grande: un trazo de 0,25 es un píxel de textura. Los bordes salen
 * suaves (el lienzo antialiasa los caminos) y la textura se filtra en lineal al
 * reducirse: ilustración en alta resolución con detalle a nivel de píxel, no
 * retro de baja resolución. Sigue sin haber ni un byte de arte binario: todo
 * sale de código.
 */

/** Píxeles de textura por píxel de mundo. */
export const HD = 4;
/** Escala con la que se pinta una textura HD para que ocupe su tamaño de mundo. */
export const HD_SCALE = 1 / HD;

export type Ctx = CanvasRenderingContext2D;

/** Crea (una vez) una textura HD de `w` × `h` px de mundo y la dibuja en coordenadas de mundo. */
export function makeHd(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx) => void): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, Math.ceil(w * HD), Math.ceil(h * HD));
  if (!tex) return key;
  const ctx = tex.getContext();
  ctx.save();
  ctx.scale(HD, HD);
  draw(ctx);
  ctx.restore();
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}

// ------------------------------------------------------------------ color

const parse = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

/** Aclara (k > 0) u oscurece (k < 0) hacia blanco o negro, conservando el matiz. */
export function tone(hex: string, k: number): string {
  const [r, g, b] = parse(hex);
  return k >= 0 ? toHex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k) : toHex(r * (1 + k), g * (1 + k), b * (1 + k));
}

/** Mezcla dos colores. */
export function blend(a: string, b: string, k: number): string {
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  return toHex(ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k);
}

/** El mismo color con alfa, para fillStyle. */
export function rgba(hex: string, a: number): string {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// ------------------------------------------------------------------ azar fijo

/** Hash determinista de enteros a [0, 1). */
export function hash(a: number, b = 0, c = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x1b873593, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Generador con semilla: la misma pieza sale igual en cada visita. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Ruido de valor suave en [-1, 1]: manchas amplias, no motas. */
export function smooth(x: number, y: number, cell: number, seed: number): number {
  const gx = x / cell;
  const gy = y / cell;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const v = (i: number, j: number): number => hash(i, j, seed);
  const top = v(ix, iy) + (v(ix + 1, iy) - v(ix, iy)) * sx;
  const bottom = v(ix, iy + 1) + (v(ix + 1, iy + 1) - v(ix, iy + 1)) * sx;
  return (top + (bottom - top) * sy) * 2 - 1;
}

// ------------------------------------------------------------------ formas

export function rect(ctx: Ctx, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

export function rrect(ctx: Ctx, color: string, x: number, y: number, w: number, h: number, r: number): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  ctx.fill();
}

export function ellipse(ctx: Ctx, color: string, cx: number, cy: number, rx: number, ry: number, rot = 0): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2);
  ctx.fill();
}

/** Polígono por puntos [x, y, x, y, …]. */
export function poly(ctx: Ctx, color: string, pts: readonly number[]): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fill();
}

export function line(ctx: Ctx, color: string, width: number, pts: readonly number[], cap: CanvasLineCap = 'round'): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = cap;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.stroke();
}

/** Degradado vertical en bandas finas (sin costura visible a 4×). */
export function vgrad(ctx: Ctx, x: number, y: number, w: number, h: number, top: string, bottom: string): void {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

export function hgrad(ctx: Ctx, x: number, y: number, w: number, h: number, left: string, right: string): void {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, left);
  g.addColorStop(1, right);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

/** Sombra blanda: elipse con caída radial, para el contacto con el suelo y la oclusión. */
export function softShadow(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, alpha: number, color = '#120e1a'): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.55, rgba(color, alpha * 0.7));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Recorta lo que se dibuje en `draw` a la forma de `clip` (un camino ya trazado). */
export function clipped(ctx: Ctx, clip: () => void, draw: () => void): void {
  ctx.save();
  ctx.beginPath();
  clip();
  ctx.clip();
  draw();
  ctx.restore();
}

/** Motas de grano: `n` puntos de `size` al azar fijo dentro del rectángulo. */
export function speckle(ctx: Ctx, color: string, x: number, y: number, w: number, h: number, n: number, seed: number, size = 0.25): void {
  const r = rng(seed);
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) ctx.fillRect(x + r() * w, y + r() * h, size, size);
}

/**
 * Contorno de silueta: dibuja `draw` en un lienzo aparte, lo estampa en el color
 * del contorno desplazado alrededor y encima el dibujo. Da a personas y coches
 * un borde limpio de medio píxel de mundo que los separa del fondo.
 */
export function outlined(ctx: Ctx, w: number, h: number, color: string, width: number, draw: (c: Ctx) => void): void {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * HD);
  c.height = Math.ceil(h * HD);
  const cc = c.getContext('2d');
  if (!cc) return;
  cc.scale(HD, HD);
  draw(cc);
  // Silueta teñida.
  const s = document.createElement('canvas');
  s.width = c.width;
  s.height = c.height;
  const sc = s.getContext('2d');
  if (!sc) return;
  sc.drawImage(c, 0, 0);
  sc.globalCompositeOperation = 'source-in';
  sc.fillStyle = color;
  sc.fillRect(0, 0, s.width, s.height);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const d = width * HD;
  for (const [dx, dy] of [[-d, 0], [d, 0], [0, -d], [0, d], [-d * 0.7, -d * 0.7], [d * 0.7, -d * 0.7], [-d * 0.7, d * 0.7], [d * 0.7, d * 0.7]]) ctx.drawImage(s, dx, dy);
  ctx.drawImage(c, 0, 0);
  ctx.restore();
}
