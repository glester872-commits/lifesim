import { BOTTOM_MAT, SHOE_MAT, TOP_MAT, type Material, type Outfit } from '../data/outfits.ts';
import type { Facing } from '../types/game';
import type { HumanColors } from './HumanArt';

/**
 * La ropa pintada como ropa (data/outfits.ts), a 28 × 42, encima de la persona
 * de siempre ya ampliada (world/HumanArtHD.drawPlayerHD): cara, pelo, piel y
 * silueta del cuerpo no se tocan. Sólo se repintan los píxeles que el dibujo de
 * siempre puso de ropa, y alguno de fuera donde la prenda abulta (capucha,
 * abrigo largo, pernera ancha, suela gorda).
 *
 * Qué píxel es de qué prenda no se adivina por el color: el dibujo de siempre
 * se pinta otra vez con colores testigo (markerColors) y de ahí sale el mapa de
 * partes (camiseta, manga, pantalón, zapato, piel). Vale para cualquier pose y
 * dirección sin coordenadas a mano, y cada detalle (cremallera, bolsillo, bajo)
 * se ancla a la caja de su parte en ese fotograma: al andar se mueve con ella.
 *
 * Luz del noroeste como el resto: canto de la izquierda con luz, el de la
 * derecha en sombra (a la izquierda, en espejo, como el dibujo de siempre).
 * Cada tejido tiene su rampa de cinco tonos (hondo, sombra, base, luz, brillo).
 */

export const PART_TOP = 1;
export const PART_ARM = 2;
export const PART_BOTTOM = 3;
export const PART_SHOE = 4;
export const PART_SKIN = 5;

const NEUTRAL = '#808080';

/** Colores testigo, uno por parte: el dibujo de siempre con ellos es el mapa de partes. */
export function markerColors(c: HumanColors): HumanColors {
  const bare = c.sleeves !== undefined && c.sleeves === c.skin;
  return { ...c, cloth: '#e00000', clothDark: '#b00000', sleeves: bare ? '#e0e000' : '#e000e0', trousers: '#0000e0', shoes: '#00e000', skin: '#e0e000', spots: undefined,
    // Todo lo demás, gris: un gorro rojo o un pelo cobrizo no son la camiseta.
    ...Object.fromEntries((['hair', 'cap', 'bag', 'scarf', 'hood', 'earrings', 'headphones', 'stripe'] as const).filter((k) => c[k]).map((k) => [k, NEUTRAL])),
    ink: c.ink?.map((i) => ({ ...i, color: NEUTRAL })) };
}

/** La parte de un píxel del dibujo testigo (0: nada, contorno o complemento). */
export function partOf(r: number, g: number, b: number, a: number): number {
  if (!a) return 0;
  const hi = Math.max(r, g, b);
  if (hi < 60 || hi - Math.min(r, g, b) < 70) return 0;
  if (r > g * 2 && b > g * 2) return PART_ARM;
  if (r > g * 2 && r > b * 2) return PART_TOP;
  if (b > r * 2 && b > g * 2) return PART_BOTTOM;
  if (g > r * 2 && g > b * 2) return PART_SHOE;
  if (r > b * 2 && g > b * 2) return PART_SKIN;
  return 0;
}

// ------------------------------------------------------------------ color

const hex = (n: readonly number[]): string => `#${n.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const rgbOf = (h: string): [number, number, number] => {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Luz algo cálida, sombra algo fría (la rampa de HumanArt). */
export function tone(h: string, k: number): string {
  const [r, g, b] = rgbOf(h);
  return k >= 0
    ? hex([r + (255 - r) * k, g + (255 - g) * k * 0.88, b + (255 - b) * k * 0.65])
    : hex([r * (1 + k * 1.12), g * (1 + k), b * (1 + k * 0.72)]);
}

export function blend(a: string, b: string, k: number): string {
  const pa = rgbOf(a);
  const pb = rgbOf(b);
  return hex(pa.map((v, i) => v + (pb[i] - v) * k));
}

const lum = (h: string): number => {
  const [r, g, b] = rgbOf(h);
  return 0.3 * r + 0.59 * g + 0.11 * b;
};

/**
 * Cada tejido: cuánto bajan el hondo y la sombra y cuánto suben la luz y el brillo.
 * Algodón mate y blando; vaquero firme; nailon y cuero con brillo duro; punto
 * apagado; deporte limpio con algo de brillo.
 */
const MATS: Readonly<Record<Material | 'skin', readonly [number, number, number, number]>> = {
  cotton: [-0.36, -0.17, 0.1, 0.18],
  denim: [-0.44, -0.22, 0.13, 0.24],
  nylon: [-0.42, -0.2, 0.18, 0.5],
  leather: [-0.56, -0.3, 0.12, 0.55],
  knit: [-0.28, -0.13, 0.07, 0.12],
  sport: [-0.34, -0.16, 0.13, 0.34],
  skin: [-0.24, -0.11, 0.06, 0.1],
};
const HARD: ReadonlySet<Material | 'skin'> = new Set<Material | 'skin'>(['denim', 'nylon', 'leather']);

/** [hondo, sombra, base, luz, brillo]. El negro no es negro ni el blanco, blanco: se tiene que ver la forma. */
function ramp(base: string, m: Material | 'skin'): readonly string[] {
  let b = base;
  const l = lum(b);
  if (l < 42) b = blend(b, '#4a4e5c', ((42 - l) / 42) * 0.5);
  else if (l > 226) b = tone(b, -0.07);
  const [kd, ks, kl, kh] = MATS[m];
  return [tone(b, kd), tone(b, ks), b, tone(b, kl), tone(b, kh)];
}

const METAL = '#b4b8c0';
const BRASS = '#c4a060';

// ------------------------------------------------------------------ pintar

/** Quién es dueño de cada píxel tras vestir: decide su rampa. */
const TOP = 1;
const ARM = 2;
const BOT = 3;
const SHOE = 4;
const SKIN = 5;
const INNER = 6;
const SOLE = 7;

interface Box { l: number; r: number; t: number; b: number }

/**
 * Viste el fotograma: `d` es el RGBA de 28 × 42 ya pintado, `parts` su mapa de
 * partes. Devuelve los píxeles que la ropa añade fuera de la silueta.
 */
export function dress(d: Uint8ClampedArray, parts: Uint8Array, W: number, H: number, facing: Facing, c: HumanColors, o: Outfit): Uint8Array {
  if (facing === 'left') {
    // El perfil izquierdo es el derecho en espejo (como el dibujo de siempre): se viste de derecho y se vuelve.
    flip(d, W, H, 4);
    flip(parts, W, H, 1);
    const extra = dress(d, parts, W, H, 'right', c, o);
    flip(d, W, H, 4);
    flip(parts, W, H, 1);
    flip(extra, W, H, 1);
    return extra;
  }
  const view: 'front' | 'back' | 'side' = facing === 'down' ? 'front' : facing === 'up' ? 'back' : 'side';
  const N = W * H;
  const own = new Int8Array(N);
  const tn = new Int8Array(N).fill(-1);
  const fix: (string | undefined)[] = new Array(N);
  const extra = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const p = parts[i];
    own[i] = p === PART_TOP ? TOP : p === PART_ARM ? ARM : p === PART_BOTTOM ? BOT : p === PART_SHOE ? SHOE : 0;
  }
  const ok = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H;
  const ix = (x: number, y: number): number => y * W + x;
  const ownAt = (x: number, y: number): number => (ok(x, y) ? own[ix(x, y)] : 0);
  const empty = (x: number, y: number): boolean => ok(x, y) && !own[ix(x, y)] && parts[ix(x, y)] !== PART_SKIN && (d[ix(x, y) * 4 + 3] === 0 || parts[ix(x, y)] === 0);
  const box = (k: number): Box | null => {
    let l = W, r = -1, t = H, b = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (own[ix(x, y)] === k) {
      l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y);
    }
    return r < 0 ? null : { l, r, t, b };
  };
  /** Pone tono (0–4) a un píxel de esas prendas (o de cualquiera). */
  const T = (x: number, y: number, t: number, ...k: number[]): void => {
    if (!ok(x, y)) return;
    const i = ix(x, y);
    if (own[i] && (!k.length || k.includes(own[i]))) tn[i] = t;
  };
  /** Color fijo (cremallera, botón, cordón) sobre un píxel de prenda. */
  const F = (x: number, y: number, h: string, ...k: number[]): void => {
    if (!ok(x, y)) return;
    const i = ix(x, y);
    if (own[i] && (!k.length || k.includes(own[i]))) fix[i] = h;
  };
  /** Pasa un píxel de prenda a otra (el abrigo tapa el pantalón, la bota sube por la pernera). */
  const O = (x: number, y: number, to: number, ...from: number[]): void => {
    if (!ok(x, y)) return;
    const i = ix(x, y);
    if (own[i] && (!from.length || from.includes(own[i]))) {
      own[i] = to;
      tn[i] = -1;
    }
  };
  /** Ocupa un píxel de contorno o vacío: la prenda abulta. Lo vacío pasa a la silueta. */
  const claim = (x: number, y: number, to: number, t = -1): boolean => {
    if (!empty(x, y)) return false;
    const i = ix(x, y);
    own[i] = to;
    tn[i] = t;
    if (d[i * 4 + 3] === 0) extra[i] = 1;
    return true;
  };
  /** Abulta un píxel hacia fuera desde el canto de esa prenda en la fila `y`: cruza el contorno y lo deja detrás. */
  const grow = (y: number, from: number, dx: number, k: number): void => {
    let x = from + dx;
    for (let s = 0; s < 3 && ok(x, y) && own[ix(x, y)] === 0 && d[ix(x, y) * 4 + 3] && parts[ix(x, y)] === 0; s++, x += dx) claim(x, y, k);
    if (ok(x, y) && d[ix(x, y) * 4 + 3] === 0) claim(x, y, k);
  };
  /** Tramos de una prenda en una fila. */
  const runs = (y: number, k: number): { l: number; r: number }[] => {
    const out: { l: number; r: number }[] = [];
    for (let x = 0; x < W; x++) {
      if (own[ix(x, y)] !== k) continue;
      const l = x;
      while (x + 1 < W && own[ix(x + 1, y)] === k) x++;
      out.push({ l, r: x });
    }
    return out;
  };

  const topMat = o.topMat ?? TOP_MAT[o.top];
  const botMat = o.bottomMat ?? BOTTOM_MAT[o.bottom];
  const shoeMat = SHOE_MAT[o.shoes];
  const sleeveBase = c.sleeves && c.sleeves !== c.skin ? c.sleeves : c.cloth;
  const P: Record<number, readonly string[]> = {
    [TOP]: ramp(c.cloth, topMat),
    [ARM]: ramp(sleeveBase, topMat),
    [BOT]: ramp(c.trousers, botMat),
    [SHOE]: ramp(c.shoes, shoeMat),
    [SKIN]: ramp(c.skin, 'skin'),
    [INNER]: ramp(o.inner ?? '#e6e0d4', 'cotton'),
    [SOLE]: ramp(o.shoes === 'boot' || o.shoes === 'shoe' ? '#3a2e26' : lum(c.shoes) > 200 ? '#d8d4ca' : '#eeeae0', 'cotton'),
  };
  const MAT_OF: Record<number, Material | 'skin'> = { [TOP]: topMat, [ARM]: topMat, [BOT]: botMat, [SHOE]: shoeMat, [SKIN]: 'skin', [INNER]: 'cotton', [SOLE]: 'cotton' };
  const accent = o.accent ?? (lum(c.cloth) > 170 ? '#2b2d33' : '#ecebe6');
  const string = lum(c.cloth) > 150 ? P[TOP][0] : '#e9e4d8';

  const torso = box(TOP);
  const legs0 = box(BOT);

  // ---------------------------------------------------------- arriba
  if (torso) {
    const { l: TL, r: TR, t: TT } = torso;
    let TB = torso.b;
    const cx = view === 'side' ? TR - 2 : Math.floor((TL + TR) / 2);
    const k = o.top;
    const hooded = k === 'hoodie' || k === 'zip-hoodie';
    const tailored = k === 'blazer' || k === 'coat';
    const ribbed = k === 'sweatshirt' || hooded || k === 'bomber';

    /** Bajo más largo: tapa el pantalón y rellena hasta el ancho del tronco. */
    const lengthen = (n: number, flare: boolean): void => {
      for (let y = TB + 1; y <= Math.min(H - 5, TB + n); y++) {
        const spread = flare && y > TB + n - 3 ? 1 : 0;
        for (let x = TL - spread; x <= TR + spread; x++) {
          if (ownAt(x, y) === BOT) O(x, y, TOP, BOT);
          else claim(x, y, TOP);
        }
      }
      TB = Math.min(H - 5, TB + n);
    };
    if (k === 'coat') lengthen(view === 'side' ? 7 : 8, true);
    else if (k === 'tee-oversized') lengthen(2, false);
    else if (k === 'blazer') lengthen(1, false);

    // Mangas: cada brazo con su caja; la camiseta deja la piel por debajo de la manga.
    const arms: Box[] = [];
    const armBox = box(ARM);
    if (armBox) {
      if (view === 'side') arms.push(armBox);
      else {
        const mid = (TL + TR) / 2;
        for (const left of [true, false]) {
          let l = W, r = -1, t = H, b = -1;
          for (let y = armBox.t; y <= armBox.b; y++) for (let x = armBox.l; x <= armBox.r; x++) {
            if (own[ix(x, y)] !== ARM || (x < mid) !== left) continue;
            l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y);
          }
          if (r >= 0) arms.push({ l, r, t, b });
        }
      }
    }
    const shortSleeve = k === 'tee' || k === 'tee-fitted' || k === 'sport' ? 3 : k === 'tee-oversized' ? 5 : 0;
    arms.forEach((a, n) => {
      const outward = view === 'side' ? 0 : n === 0 ? -1 : 1;
      const edge = n === 0 ? a.l : a.r;
      if (shortSleeve) {
        const cut = a.t + shortSleeve;
        for (let y = cut + 1; y <= a.b; y++) for (let x = a.l; x <= a.r; x++) O(x, y, SKIN, ARM);
        for (let x = a.l; x <= a.r; x++) T(x, cut, 1, ARM);
        if (k === 'tee-oversized' && outward) for (let y = a.t + 1; y <= cut; y++) grow(y, edge, outward, ARM);
        if (k === 'sport') for (let y = a.t; y < cut; y++) F(n === 0 || view === 'side' ? a.l : a.r, y, accent, ARM);
        return;
      }
      // Manga larga: puño en las dos últimas filas; con volumen (sudaderas, bomber, abrigo), un píxel más ancha.
      if (outward && (ribbed || tailored || k === 'jacket')) for (let y = a.t + 2; y <= a.b - 2; y++) grow(y, edge, outward, ARM);
      const cuffRows = ribbed ? 2 : 1;
      for (let y = a.b - cuffRows + 1; y <= a.b; y++) for (let x = a.l - 1; x <= a.r + 1; x++) T(x, y, ribbed ? ((x + y) % 2 ? 1 : 2) : 1, ARM);
      if (ribbed) for (let x = a.l - 1; x <= a.r + 1; x++) T(x, a.b - 2, 0, ARM);
      if (k === 'bomber' && n === 0) F(a.r, a.t + 3, METAL, ARM);
      if (k === 'denim-jacket' || k === 'shirt') F(n === 0 ? a.r : a.l, a.b, k === 'shirt' ? P[TOP][4] : BRASS, ARM);
      // Pliegue del codo.
      const elbow = a.t + Math.round((a.b - a.t) * 0.55);
      T(n === 0 ? a.l : a.r, elbow, 3, ARM);
      T(n === 0 ? a.r : a.l, elbow + 1, 0, ARM);
    });

    // Cuello: lo que toca la piel en las dos primeras filas.
    const neck: number[] = [];
    for (let y = TT; y <= TT + 1; y++) for (let x = TL; x <= TR; x++) {
      if (ownAt(x, y) === TOP && [[1, 0], [-1, 0], [0, -1]].some(([a, b]) => ok(x + a, y + b) && parts[ix(x + a, y + b)] === PART_SKIN)) neck.push(x, y);
    }
    const eachNeck = (fn: (x: number, y: number) => void): void => {
      for (let i = 0; i < neck.length; i += 2) fn(neck[i], neck[i + 1]);
    };

    if (view === 'front') {
      // Hombros: luz en el de la izquierda, costura donde empieza la manga.
      for (let x = TL; x < cx - 2; x++) T(x, TT, 3, TOP);
      if (!hooded && !tailored && k !== 'bomber') {
        T(TL + 1, TT + 1, 1, TOP);
        T(TR - 1, TT + 1, 0, TOP);
      }
      if (k === 'tee' || k === 'tee-fitted' || k === 'tee-oversized' || k === 'sport' || k === 'sweatshirt') {
        eachNeck((x, y) => (k === 'sport' ? F(x, y, accent, TOP) : T(x, y, 1, TOP)));
        if (k === 'sweatshirt') eachNeck((x, y) => T(x, y + 1, 1, TOP));
      }
      if (k === 'tee' || k === 'tee-oversized' || k === 'tee-fitted') {
        // Pliegues en diagonal del hombro de la luz a la cintura y uno más en la sombra.
        T(TL + 4, TT + 4, 1, TOP); T(TL + 5, TT + 5, 1, TOP); T(TL + 5, TT + 6, 1, TOP); T(TL + 3, TT + 5, 3, TOP);
        T(TR - 4, TT + 6, 1, TOP); T(TR - 4, TT + 7, 1, TOP);
        if (k === 'tee-fitted') {
          // Por dentro del pantalón, con cinturón y hebilla.
          for (let x = TL; x <= TR; x++) F(x, TB, '#2a2622', TOP);
          F(cx, TB, METAL, TOP); F(cx + 1, TB, METAL, TOP);
        }
      }
      if (k === 'sweatshirt') {
        // Raglán: la costura baja en diagonal del cuello a la axila.
        for (let s = 0; s < 4; s++) { T(cx - 3 - s, TT + 1 + s, 1, TOP); T(cx + 4 + s, TT + 1 + s, 0, TOP); }
      }
      if (k === 'shirt') {
        // Cuello de dos picos, tapeta con botones y un bolsillo de pecho.
        T(cx - 3, TT, 4, TOP); T(cx - 2, TT, 4, TOP); T(cx - 2, TT + 1, 4, TOP);
        T(cx + 3, TT, 3, TOP); T(cx + 4, TT, 3, TOP); T(cx + 3, TT + 1, 3, TOP);
        for (let y = TT + 2; y <= TB; y++) { T(cx, y, 3, TOP); T(cx + 1, y, 1, TOP); }
        for (let y = TT + 3; y < TB; y += 3) F(cx, y, P[TOP][0], TOP);
        for (let x = TL + 2; x <= TL + 4; x++) { T(x, TT + 3, 1, TOP); T(x, TT + 6, 1, TOP); }
        T(TL + 2, TT + 4, 1, TOP); T(TL + 2, TT + 5, 1, TOP);
      }
      if (hooded) {
        // Capucha caída: rodea el cuello y abulta por detrás de él (sin tocar la barbilla).
        for (let x = TL + 2; x <= cx - 2; x++) claim(x, TT - 1, TOP, x < cx - 3 ? 3 : 2);
        for (let x = cx + 3; x <= TR - 2; x++) claim(x, TT - 1, TOP, 1);
        for (let x = TL + 1; x <= TR - 1; x++) if (ownAt(x, TT) === TOP) T(x, TT, x <= cx ? 3 : 1, TOP);
        eachNeck((x, y) => T(x, y, 0, TOP));
        // Cordones.
        for (let y = TT + 1; y <= TT + 4; y++) { F(cx - 1, y, string, TOP); F(cx + 2, y, string, TOP); }
        // Bolsillo canguro.
        const y0 = TB - 6;
        for (let x = cx - 3; x <= cx + 4; x++) T(x, y0, 1, TOP);
        for (let y = y0 + 1; y <= TB - 3; y++) { T(cx - 4, y, 1, TOP); T(cx + 5, y, 0, TOP); }
        for (let x = cx - 3; x <= cx + 4; x++) T(x, y0 + 1, 3, TOP);
      }
      if (k === 'zip-hoodie' || k === 'bomber' || k === 'jacket') {
        for (let y = TT + 1; y <= TB - (k === 'bomber' ? 2 : 0); y++) F(cx, y, y === TT + 2 ? '#e4e6ea' : METAL, TOP);
        T(cx + 1, TT + 2, 0, TOP);
      }
      if (k === 'bomber') {
        // Cuello y cintura de punto elástico, más oscuros; brillo duro en el hombro.
        const rib = (x: number, y: number): void => F(x, y, x % 2 ? P[TOP][0] : tone(P[TOP][0], -0.25), TOP);
        eachNeck(rib);
        eachNeck((x, y) => rib(x, y + 1));
        for (let y = TB - 1; y <= TB; y++) for (let x = TL; x <= TR; x++) rib(x, y);
        for (let x = TL + 1; x <= TL + 3; x++) T(x, TT + 1, 4, TOP);
        T(TL + 2, TT + 5, 3, TOP); T(TL + 3, TT + 6, 1, TOP); T(TR - 3, TT + 5, 1, TOP);
      }
      if (k === 'jacket') {
        // Cuello alto, bolsillo de pecho con cremallera y el tirador del bajo.
        for (const x of [cx - 3, cx - 2]) claim(x, TT - 1, TOP, 3);
        for (const x of [cx + 3, cx + 4]) claim(x, TT - 1, TOP, 1);
        eachNeck((x, y) => T(x, y, 1, TOP));
        F(TL + 3, TT + 5, METAL, TOP); F(TL + 4, TT + 4, METAL, TOP); F(TL + 5, TT + 3, METAL, TOP);
        F(TL + 1, TB, '#e4e6ea', TOP);
        T(TL + 2, TT + 8, 3, TOP); T(TR - 3, TT + 7, 1, TOP);
      }
      if (k === 'denim-jacket') {
        // Abierta: asoma la camiseta. Cuello vuelto, dos bolsillos de pecho con botón, costuras y pretina.
        for (let y = TT + 1; y <= TB; y++) { O(cx, y, INNER, TOP); O(cx + 1, y, INNER, TOP); }
        T(cx - 3, TT, 4, TOP); T(cx - 2, TT + 1, 4, TOP); T(cx - 1, TT + 2, 3, TOP);
        T(cx + 4, TT, 3, TOP); T(cx + 3, TT + 1, 1, TOP); T(cx + 2, TT + 2, 1, TOP);
        for (const [x0, lit] of [[TL + 2, true], [TR - 4, false]] as const) {
          for (let x = x0; x <= x0 + 2; x++) T(x, TT + 4, lit ? 1 : 0, TOP);
          F(x0 + 1, TT + 5, BRASS, TOP);
          for (let y = TT + 6; y <= TB - 2; y++) T(x0 + 1, y, lit ? 3 : 1, TOP);
        }
        for (let x = TL; x <= TR; x++) T(x, TB - 1, 1, TOP);
        F(TL + 2, TB, BRASS, TOP); F(TR - 2, TB, BRASS, TOP);
      }
      if (tailored) {
        // Escote en pico con la camisa dentro, solapas, botón, cierre y bolsillos con tapa.
        for (let s = 0; s <= 5; s++) {
          const w = Math.max(0, 3 - Math.floor(s / 2));
          for (let x = cx - w + 1; x <= cx + w; x++) O(x, TT + s, INNER, TOP);
          T(cx - w, TT + s, 4, TOP); T(cx - w - 1, TT + s, 3, TOP);
          T(cx + w + 1, TT + s, 1, TOP); T(cx + w + 2, TT + s, 0, TOP);
        }
        for (let y = TT + 6; y <= TB; y++) T(cx, y, 1, TOP);
        F(cx + 1, TT + 7, P[TOP][0], TOP);
        if (k === 'coat') F(cx + 1, TT + 11, P[TOP][0], TOP);
        const pocket = k === 'coat' ? torso.b + 2 : TB - 3;
        for (let x = TL + 2; x <= TL + 4; x++) T(x, pocket, 1, TOP);
        for (let x = TR - 4; x <= TR - 2; x++) T(x, pocket, 0, TOP);
        if (k === 'coat') {
          // El paño cae: dos pliegues largos y una abertura abajo.
          for (let y = torso.b + 1; y < TB; y++) { T(TL + 3, y, 3, TOP); T(TR - 3, y, 1, TOP); }
          T(cx, TB, 0, TOP); T(cx, TB - 1, 0, TOP);
        }
      }
      if (k === 'sport') {
        // Paneles laterales de contraste y una marca pequeña (inventada) en el pecho.
        for (let y = TT + 2; y <= TB; y++) { F(TL + 1, y, accent, TOP); F(TR - 1, y, tone(accent, -0.25), TOP); }
        F(TL + 4, TT + 4, accent, TOP); F(TL + 5, TT + 3, accent, TOP);
      }
      if (ribbed && k !== 'bomber') {
        // Pretina de punto: costura encima y canalé.
        for (let x = TL; x <= TR; x++) { T(x, TB - 2, 1, TOP); T(x, TB - 1, x % 2 ? 1 : 2, TOP); T(x, TB, x % 2 ? 1 : 2, TOP); }
      }
    } else if (view === 'back') {
      for (let x = TL; x < cx - 2; x++) T(x, TT, 3, TOP);
      if (hooded) {
        // La capucha cae sobre la espalda: un óvalo con su canto de luz y su sombra debajo.
        for (let x = cx - 4; x <= cx + 4; x++) claim(x, TT - 1, TOP, x <= cx ? 3 : 1);
        for (let x = cx - 4; x <= cx + 4; x++) T(x, TT - 1, x <= cx ? 3 : 1, TOP);
        for (let y = TT; y <= TT + 4; y++) {
          const w = y === TT + 4 ? 2 : 4;
          for (let x = cx - w; x <= cx + w + 1; x++) T(x, y, y === TT ? 3 : 2, TOP);
          T(cx - w - 1, y, 1, TOP); T(cx + w + 2, y, 0, TOP);
        }
        for (let x = cx - 2; x <= cx + 3; x++) T(x, TT + 5, 0, TOP);
      } else if (k === 'shirt' || k === 'denim-jacket' || tailored) {
        // Canesú (o cuello del abrigo) y, en el abrigo, la costura y la abertura del centro.
        for (let x = TL + 1; x <= TR - 1; x++) T(x, TT + 3, 1, TOP);
        eachNeck((x, y) => T(x, y, 3, TOP));
        if (tailored) for (let y = TT + 4; y <= TB; y++) T(cx, y, y > TB - 3 ? 0 : 1, TOP);
      } else if (k === 'bomber') {
        const rib = (x: number, y: number): void => F(x, y, x % 2 ? P[TOP][0] : tone(P[TOP][0], -0.25), TOP);
        eachNeck(rib);
        for (let y = TB - 1; y <= TB; y++) for (let x = TL; x <= TR; x++) rib(x, y);
        for (let x = TL + 1; x <= TL + 3; x++) T(x, TT + 1, 4, TOP);
      } else {
        eachNeck((x, y) => (k === 'sport' ? F(x, y, accent, TOP) : T(x, y, 1, TOP)));
        T(cx, TT + 3, 1, TOP); T(cx, TT + 4, 1, TOP);
      }
      if (k === 'sport') for (let y = TT + 2; y <= TB; y++) { F(TL + 1, y, accent, TOP); F(TR - 1, y, tone(accent, -0.25), TOP); }
      if (ribbed && k !== 'bomber') for (let x = TL; x <= TR; x++) { T(x, TB - 2, 1, TOP); T(x, TB - 1, x % 2 ? 1 : 2, TOP); T(x, TB, x % 2 ? 1 : 2, TOP); }
      if (k === 'tee-fitted') for (let x = TL; x <= TR; x++) F(x, TB, '#2a2622', TOP);
    } else {
      // De perfil, mirando a la derecha: el pecho es el canto de la derecha.
      for (let x = TL; x <= TR - 2; x++) T(x, TT, 3, TOP);
      if (hooded) {
        for (let x = TL; x <= TL + 2; x++) claim(x, TT - 1, TOP, 3);
        for (let y = TT; y <= TT + 3; y++) { T(TL + 1, y, 3, TOP); T(TL + 2, y, 1, TOP); }
        for (let x = TR - 4; x <= TR - 1; x++) T(x, TB - 6, 1, TOP);
        T(TR - 4, TB - 5, 1, TOP); T(TR - 4, TB - 4, 1, TOP);
        F(TR - 1, TT + 1, string, TOP); F(TR - 1, TT + 2, string, TOP); F(TR - 1, TT + 3, string, TOP);
      }
      if (k === 'zip-hoodie' || k === 'bomber' || k === 'jacket') for (let y = TT + 1; y <= TB; y++) F(TR - 1, y, METAL, TOP);
      if (k === 'jacket') { claim(TR - 2, TT - 1, TOP, 3); claim(TR - 1, TT - 1, TOP, 1); }
      if (k === 'denim-jacket') {
        for (let y = TT + 1; y <= TB; y++) O(TR - 1, y, INNER, TOP);
        for (let x = TR - 4; x <= TR - 2; x++) T(x, TT + 4, 1, TOP);
        F(TR - 3, TT + 5, BRASS, TOP);
      }
      if (tailored) {
        for (let s = 0; s <= 4; s++) { O(TR - 1, TT + s, INNER, TOP); if (s < 3) O(TR - 2, TT + s, INNER, TOP); T(TR - 3, TT + s, 4, TOP); }
        for (let y = TT + 5; y <= TB; y++) T(TR - 1, y, 1, TOP);
        for (let y = torso.b + 1; y < TB; y++) T(TL + 2, y, 3, TOP);
      }
      if (k === 'shirt') { T(TR - 2, TT, 4, TOP); for (let y = TT + 2; y < TB; y += 3) F(TR - 1, y, P[TOP][0], TOP); }
      if (k === 'sport') for (let y = TT + 1; y <= TB; y++) F(TL + 1, y, accent, TOP);
      if (k === 'bomber') for (let y = TB - 1; y <= TB; y++) for (let x = TL; x <= TR; x++) F(x, y, x % 2 ? P[TOP][0] : tone(P[TOP][0], -0.25), TOP);
      else if (ribbed) for (let x = TL; x <= TR; x++) { T(x, TB - 2, 1, TOP); T(x, TB - 1, x % 2 ? 1 : 2, TOP); T(x, TB, x % 2 ? 1 : 2, TOP); }
      if (k === 'tee-fitted') for (let x = TL; x <= TR; x++) F(x, TB, '#2a2622', TOP);
    }
  }

  // ---------------------------------------------------------- abajo
  const legs = box(BOT) ?? legs0;
  if (legs) {
    const WT = legs.t;
    const k = o.bottom;
    const bottomOf = (x: number): number => {
      for (let y = H - 1; y >= 0; y--) if (own[ix(x, y)] === BOT) return y;
      return -1;
    };
    const outer = (y: number, fn: (x: number, dx: number) => void): void => {
      const rs = runs(y, BOT);
      if (!rs.length) return;
      fn(rs[0].l, -1);
      fn(rs[rs.length - 1].r, 1);
    };
    const cx = Math.floor((legs.l + legs.r) / 2);
    const LB = legs.b;

    if (k === 'shorts') {
      // Por debajo del muslo, pierna al aire; el bajo, algo abierto.
      const hem = WT + 4;
      for (let y = hem + 1; y <= LB; y++) for (let x = legs.l; x <= legs.r; x++) O(x, y, SKIN, BOT);
      for (let y = WT + 2; y <= hem; y++) outer(y, (x, dx) => grow(y, x, dx, BOT));
      for (let x = 0; x < W; x++) T(x, hem, 1, BOT);
    }
    if (k === 'wide') {
      // Pernera ancha: se abre desde la rodilla y cae sobre el zapato.
      for (let y = WT + 4; y <= LB; y++) {
        outer(y, (x, dx) => grow(y, x, dx, BOT));
        if (y >= LB - 1) outer(y, (x, dx) => grow(y, x, dx, BOT));
      }
      for (let x = 0; x < W; x++) {
        const y = bottomOf(x);
        if (y >= 0 && ownAt(x, y + 1) === SHOE) O(x, y + 1, BOT, SHOE);
      }
    }
    if (k === 'cargo') {
      // Bolsillos de muslo que abultan por fuera.
      for (let y = WT + 3; y <= WT + 6; y++) outer(y, (x, dx) => grow(y, x, dx, BOT));
    }
    // Pretina.
    if (k === 'joggers' || k === 'track') {
      for (let x = legs.l; x <= legs.r; x++) { T(x, WT, x % 2 ? 1 : 2, BOT); T(x, WT + 1, 1, BOT); }
      if (view === 'front') { F(cx - 1, WT + 1, string, BOT); F(cx - 1, WT + 2, string, BOT); F(cx + 2, WT + 1, string, BOT); F(cx + 2, WT + 2, string, BOT); }
    } else if (k === 'trousers') {
      for (let x = legs.l; x <= legs.r; x++) F(x, WT, '#2a2622', BOT);
      if (view === 'front') { F(cx, WT, METAL, BOT); F(cx + 1, WT, METAL, BOT); }
    } else {
      for (let x = legs.l; x <= legs.r; x++) T(x, WT, 3, BOT);
    }
    if (view === 'front' && (k === 'jeans' || k === 'wide' || k === 'cargo' || k === 'shorts')) {
      F(cx, WT, k === 'jeans' || k === 'wide' ? BRASS : METAL, BOT);
      for (let y = WT + 1; y <= WT + 3; y++) T(cx, y, 0, BOT);
      // Bolsillos delanteros en curva.
      T(legs.l + 3, WT + 1, 1, BOT); T(legs.l + 2, WT + 2, 1, BOT); T(legs.l + 1, WT + 3, 1, BOT);
      T(legs.r - 3, WT + 1, 0, BOT); T(legs.r - 2, WT + 2, 0, BOT); T(legs.r - 1, WT + 3, 0, BOT);
    }
    if (view === 'back' && (k === 'jeans' || k === 'wide' || k === 'trousers' || k === 'cargo')) {
      // Canesú en V y los bolsillos de atrás.
      for (const [x0, lit] of [[legs.l + 1, true], [legs.r - 3, false]] as const) {
        for (let x = x0; x <= x0 + 2; x++) { T(x, WT + 2, lit ? 1 : 0, BOT); T(x, WT + 4, lit ? 1 : 0, BOT); }
        T(x0, WT + 3, 1, BOT); T(x0 + 2, WT + 3, lit ? 1 : 0, BOT);
      }
      T(cx, WT + 1, 0, BOT); T(cx + 1, WT + 1, 0, BOT);
    }
    if (view === 'side' && (k === 'jeans' || k === 'wide' || k === 'trousers')) {
      for (let x = legs.l + 1; x <= legs.l + 2; x++) { T(x, WT + 2, 1, BOT); T(x, WT + 3, 1, BOT); }
    }
    // Rodillas, costuras, raya y bajos, pierna a pierna (tramo a tramo: sigue al paso).
    const knee = WT + Math.round((LB - WT) * 0.55);
    for (let y = WT + 1; y <= LB; y++) {
      for (const run of runs(y, BOT)) {
        const len = run.r - run.l + 1;
        if (k === 'trousers' && len >= 3 && y > WT + 1) T(run.l + Math.floor(len / 2) - (len > 4 ? 1 : 0), y, 3, BOT);
        if (k === 'track' && y < LB - 1) F(run.l, y, accent, BOT);
        if (y === knee && k !== 'shorts' && k !== 'trousers') { T(run.l + 1, y, 3, BOT); T(run.l + 2, y, 3, BOT); T(run.l + 1, y + 1, 1, BOT); }
        if (k === 'cargo' && y >= WT + 3 && y <= WT + 6) {
          // El bolsillo: tapa oscura arriba, el fuelle con luz.
          const x0 = run.l <= cx ? run.l : run.r - 2;
          for (let x = x0; x <= x0 + 2; x++) T(x, y, y === WT + 3 ? 0 : y === WT + 6 ? 1 : x === x0 ? 3 : 2, BOT);
        }
        if (k === 'joggers' && (y === WT + 4 || y === WT + 6)) { T(run.l + 1, y, 3, BOT); T(run.r - 1, y + 1, 1, BOT); }
      }
    }
    for (let x = 0; x < W; x++) {
      const y = bottomOf(x);
      if (y < 0 || y <= WT + 1) continue;
      if (k === 'joggers' || k === 'track') {
        // Puño elástico con la tela fruncida encima.
        T(x, y, x % 2 ? 0 : 1, BOT); T(x, y - 1, x % 2 ? 1 : 0, BOT); T(x, y - 2, 3, BOT);
      } else if (k === 'jeans' || k === 'wide') {
        T(x, y, 3, BOT); T(x, y - 1, 1, BOT);
      } else if (k === 'cargo') {
        T(x, y, 0, BOT);
      } else if (k === 'trousers') {
        T(x, y, 1, BOT);
      }
    }
  }

  // ---------------------------------------------------------- calzado
  const feet = box(SHOE);
  if (feet) {
    const k = o.shoes;
    const soleOf = (x: number): number => {
      for (let y = H - 1; y >= 0; y--) if (own[ix(x, y)] === SHOE) return y;
      return -1;
    };
    const topOf = (x: number): number => {
      for (let y = 0; y < H; y++) if (own[ix(x, y)] === SHOE) return y;
      return -1;
    };
    if (k === 'boot' || k === 'chunky') {
      // La bota sube dos filas por la pernera; la de suela gorda, una.
      for (let x = feet.l; x <= feet.r; x++) {
        const t = topOf(x);
        if (t < 0) continue;
        O(x, t - 1, SHOE, BOT);
        if (k === 'boot') O(x, t - 2, SHOE, BOT);
      }
    }
    if (k === 'chunky') {
      // Suela alta que sobresale por los lados.
      for (let y = feet.b - 1; y <= feet.b; y++) {
        const rs = runs(y, SHOE);
        if (rs.length) {
          grow(y, rs[0].l, -1, SHOE);
          grow(y, rs[rs.length - 1].r, 1, SHOE);
        }
      }
    }
    const midsole = o.accent ?? '#e86a3a';
    for (let x = 0; x < W; x++) {
      const s = soleOf(x);
      if (s < 0) continue;
      O(x, s, SOLE, SHOE);
      if (k === 'chunky') { O(x, s - 1, SOLE, SHOE); T(x, s, 1, SOLE); T(x, s - 1, 3, SOLE); }
      if (k === 'runner') F(x, s, view === 'side' && x % 3 === 0 ? tone(midsole, -0.2) : midsole, SOLE);
      if (k === 'boot' || k === 'shoe') T(x, s, 1, SOLE);
    }
    // Empeine: puntera con luz, cordones o tira de color.
    const y0 = box(SHOE)?.t ?? feet.t;
    const yb = box(SHOE)?.b ?? feet.b;
    for (let y = y0; y <= yb; y++) {
      for (const run of runs(y, SHOE)) {
        const len = run.r - run.l + 1;
        const toe = view === 'side' ? run.r : run.l;
        if (y === y0 && len >= 3) {
          if ((k === 'sneaker' || k === 'chunky' || k === 'runner' || k === 'boot') && view !== 'back') {
            const lace = lum(c.shoes) > 150 ? P[SHOE][1] : '#e6e2d8';
            if (view === 'front') F(run.l + Math.floor(len / 2), y, lace, SHOE);
            else for (let x = run.l + 2; x < run.r; x += 2) F(x, y, lace, SHOE);
          }
          if (view === 'back') T(run.l + Math.floor(len / 2), y, 0, SHOE);
        }
        if (k === 'runner' && len >= 3 && y === y0 + 1) F(run.l + 1, y, midsole, SHOE);
        if (k === 'chunky' && len >= 4 && y === y0 + 1 && view !== 'back') T(run.l + 1, y, 1, SHOE);
        if (view !== 'back' && y === y0 + (view === 'side' ? 1 : 0)) T(toe, y, 4, SHOE);
      }
    }
  }

  // ---------------------------------------------------------- color
  const boxes: Record<number, Box | null> = {};
  for (const k of [TOP, ARM, BOT, SHOE, SKIN, INNER, SOLE]) boxes[k] = box(k);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = ix(x, y);
      const k = own[i];
      if (!k) continue;
      const pal = P[k];
      const m = MAT_OF[k];
      let t = tn[i];
      let col: string | undefined = fix[i];
      if (!col && t < 0) {
        // Luz de forma: el canto de la izquierda con luz, el de la derecha en sombra, arriba luz, abajo sombra.
        let l = x;
        let r = x;
        while (l > 0 && own[ix(l - 1, y)] === k) l--;
        while (r < W - 1 && own[ix(r + 1, y)] === k) r++;
        const len = r - l + 1;
        t = 2;
        if (len >= 3 && x === l) t = 3;
        else if (x === r && len >= 2) t = HARD.has(m) ? 0 : 1;
        else if (len >= 7 && x === r - 1) t = 1;
        const above = ownAt(x, y - 1);
        const below = ownAt(x, y + 1);
        if (t === 2 && above !== k && above !== TOP && above !== ARM) t = 3;
        else if (t === 2 && below !== k && below !== 0) t = 1;
        // Brillo de los tejidos duros y del deporte, cerca del hombro.
        const b = boxes[k];
        if (t === 2 && len >= 5 && x === l + 1 && b && (m === 'nylon' || m === 'leather') && y - b.t <= 2) t = 4;
        if (t === 2 && len >= 5 && x === l + 1 && m === 'sport') t = 3;
        if (t === 2 && b) {
          // Textura: el vaquero desteñido a motas, el punto en canalé horizontal.
          const u = x - b.l;
          const v = y - b.t;
          if (m === 'denim') {
            const h = (u * 7 + v * 13) % 11;
            if (h === 0) col = blend(pal[2], pal[3], 0.5);
          } else if (m === 'knit' && v % 2 === 1) col = blend(pal[2], pal[1], 0.3);
        }
      }
      const out = rgbOf(col ?? pal[Math.max(0, Math.min(4, t))]);
      d[i * 4] = out[0];
      d[i * 4 + 1] = out[1];
      d[i * 4 + 2] = out[2];
      d[i * 4 + 3] = 255;
    }
  }
  return extra;
}

/** Espejo horizontal en sitio de un buffer de `ch` canales por píxel. */
function flip(a: Uint8Array | Uint8ClampedArray, W: number, H: number, ch: number): void {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W / 2; x++) {
      const i = (y * W + x) * ch;
      const j = (y * W + (W - 1 - x)) * ch;
      for (let k = 0; k < ch; k++) {
        const t = a[i + k];
        a[i + k] = a[j + k];
        a[j + k] = t;
      }
    }
  }
}
