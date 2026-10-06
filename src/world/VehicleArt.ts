import type Phaser from 'phaser';
import { PALETTE } from '../config/constants';
import { VEHICLES, type VehicleShape, type VehicleType } from '../data/vehicles';
import { make, px, shade, type Ctx } from './paint';

/**
 * Vehículos de perfil, en 3/4 hacia el sur (design/ART_BIBLE.md): filo de
 * techo arriba, costado sur, ruedas asomando y sombra hacia el sureste. Mira a
 * la derecha; hacia el oeste se voltea.
 *
 * Estándar de vehículo: un turismo no es un bloque, es un PERFIL (CarProfile):
 * dónde empiezan y acaban el capó, el parabrisas, el techo y la luneta, a qué
 * altura van la cintura, el capó y el maletero, y dónde caen los montantes.
 * El mismo pintor saca de cada perfil la carrocería con su degradado de chapa,
 * el cristal con sus reflejos, los pasos de rueda, las ruedas con llanta, faros,
 * pilotos, paragolpes, retrovisor y un contorno fino. Una familia nueva es un
 * perfil; un modelo nuevo, un tipo en data/vehicles.ts que lo usa. Autobús
 * urbano y autocar interurbano tienen su propio pintor (franja de cristal,
 * puertas, letrero de línea). Se hornea una textura por tipo y color.
 */

/** Dónde van las luces en el sprite (mirando a la derecha), para encenderlas encima. */
export interface VehicleLamps {
  head: readonly [number, number];
  tail: readonly [number, number];
  /** Luz del techo: el verde de libre del taxi, la rotativa del servicio. */
  roof?: readonly [number, number];
}

const SHADOW = 'rgba(12,10,20,0.36)';
const SHADOW_SOFT = 'rgba(12,10,20,0.16)';
const HEAD = '#f4ecd0';
const TAIL = '#b0302a';
const TINT = shade(PALETTE.glass, -0.32);
const TINT_LIT = shade(PALETTE.glass, -0.08);
const TYRE = '#18171c';
const RIM = '#767c86';
const LED = '#ffb43a';

interface Paint {
  ctx: Ctx;
  L: number;
  H: number;
  body: string;
}

// -------------------------------------------------------------- turismos

/**
 * Perfil de una familia de turismo, en fracciones del largo desde la trasera
 * (x) y en px desde arriba (y). La cabina va de `rearBase` (base de la luneta)
 * a `wsBase` (base del parabrisas); el techo, de `roofRear` a `roofFront`.
 */
interface CarProfile {
  rearBase: number;
  roofRear: number;
  roofFront: number;
  wsBase: number;
  roof: number;
  belt: number;
  hood: number;
  deck: number;
  /** Montantes entre ventanillas (fracciones): B, y C en un familiar. */
  pillars: readonly number[];
  /** Ejes (fracciones). */
  wheels: readonly [number, number];
  /** Desde dónde hay cristal en el costado: una furgoneta sólo lo lleva en la cabina. */
  glassFrom?: number;
}

const PROFILES: Partial<Record<VehicleShape, CarProfile>> = {
  // Utilitario: corto, morro breve, portón casi vertical.
  city: { rearBase: 0.06, roofRear: 0.14, roofFront: 0.5, wsBase: 0.68, roof: 2, belt: 7, hood: 8, deck: 7, pillars: [0.36], wheels: [0.18, 0.82] },
  hatch: { rearBase: 0.06, roofRear: 0.17, roofFront: 0.54, wsBase: 0.72, roof: 2, belt: 7, hood: 8, deck: 7, pillars: [0.38], wheels: [0.19, 0.8] },
  // Berlina: tres volúmenes, la luneta tumbada y el maletero.
  sedan: { rearBase: 0.16, roofRear: 0.31, roofFront: 0.58, wsBase: 0.74, roof: 2, belt: 7, hood: 8, deck: 7, pillars: [0.46], wheels: [0.2, 0.8] },
  // Familiar: techo largo hasta atrás y una ventanilla más.
  wagon: { rearBase: 0.04, roofRear: 0.08, roofFront: 0.57, wsBase: 0.73, roof: 2, belt: 7, hood: 8, deck: 7, pillars: [0.27, 0.47], wheels: [0.19, 0.8] },
  'suv-compact': { rearBase: 0.05, roofRear: 0.1, roofFront: 0.57, wsBase: 0.71, roof: 1, belt: 8, hood: 9, deck: 8, pillars: [0.41], wheels: [0.19, 0.8] },
  suv: { rearBase: 0.03, roofRear: 0.06, roofFront: 0.6, wsBase: 0.72, roof: 1, belt: 9, hood: 9, deck: 8, pillars: [0.27, 0.48], wheels: [0.18, 0.8] },
  // Furgoneta: caja alta, morro corto y cristal sólo en la cabina.
  van: { rearBase: 0.02, roofRear: 0.03, roofFront: 0.78, wsBase: 0.9, roof: 1, belt: 8, hood: 12, deck: 1, pillars: [], wheels: [0.17, 0.82], glassFrom: 0.72 },
};

/** Lo de arriba de la carrocería en esa columna: techo, cristales inclinados, capó o maletero. */
function topAt(pr: CarProfile, x: number, L: number): number {
  const f = x / L;
  let y: number;
  if (f >= pr.wsBase) y = pr.hood;
  else if (f >= pr.roofFront) y = pr.roof + ((pr.belt - pr.roof) * (f - pr.roofFront)) / (pr.wsBase - pr.roofFront);
  else if (f >= pr.roofRear) y = pr.roof;
  else if (f >= pr.rearBase) y = pr.roof + ((pr.deck - pr.roof) * (pr.roofRear - f)) / (pr.roofRear - pr.rearBase);
  else y = pr.deck;
  // Esquinas redondeadas: el morro y la trasera caen un poco.
  if (x >= L - 3) y += x - (L - 4);
  if (x <= 2) y += 3 - x;
  return Math.round(y);
}

function wheel(ctx: Ctx, cx: number, cy: number, r: number): void {
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.round(Math.sqrt(r * r - dy * dy) + 0.3);
    px(ctx, TYRE, cx - w, cy + dy, w * 2, 1);
  }
  // Llanta con su luz arriba a la izquierda y el buje.
  const ri = Math.max(1, r - 2);
  for (let dy = -ri; dy <= ri; dy++) {
    const w = Math.round(Math.sqrt(ri * ri - dy * dy) + 0.2);
    px(ctx, RIM, cx - w, cy + dy, w * 2, 1);
  }
  px(ctx, shade(RIM, 0.35), cx - ri, cy - ri + 1, Math.max(1, ri), 1);
  px(ctx, shade(RIM, -0.35), cx - 1, cy, 2, 1);
}

/** Paso de rueda: el hueco oscuro en la chapa encima de la rueda. */
function arch(ctx: Ctx, cx: number, cy: number, r: number, bottom: number): void {
  for (let dy = -r; dy <= 0; dy++) {
    const w = Math.round(Math.sqrt(r * r - dy * dy));
    if (cy + dy <= bottom) px(ctx, '#121116', cx - w, cy + dy, w * 2, 1);
  }
}

function car(p: Paint, t: VehicleType, base: CarProfile): VehicleLamps {
  const { ctx, L, H, body } = p;
  // Los perfiles están medidos para 16 px de alto; uno más alto los estira en vertical (cristal y chapa a la vez).
  const k = (H - 4) / 12;
  const pr: CarProfile = { ...base, roof: Math.round(base.roof * k), belt: Math.round(base.belt * k), hood: Math.round(base.hood * k), deck: Math.round(base.deck * k) };
  const bottom = H - 4;
  const glassFrom = Math.max(pr.rearBase, pr.glassFrom ?? 0);
  for (let x = 1; x < L - 1; x++) {
    const top = topAt(pr, x, L);
    const f = x / L;
    const cabin = f >= pr.rearBase && f < pr.wsBase;
    const glassCol = cabin && f >= glassFrom && pr.pillars.every((q) => Math.abs(f - q) * L >= 1);
    for (let y = top; y <= bottom; y++) {
      let c: string;
      if (y === top) c = shade(body, cabin ? 0.18 : 0.26);
      else if (cabin && y < pr.belt) {
        if (!glassCol) c = shade(body, -0.28);
        else {
          // Cristal: más claro arriba (cielo), oscuro abajo, con dos reflejos en diagonal.
          const k = (y - top) / Math.max(1, pr.belt - top);
          c = k < 0.3 ? TINT_LIT : TINT;
          if ((x + y) % 9 === 0 || (x + y) % 9 === 1) c = shade(TINT_LIT, 0.18);
        }
      } else if (y < pr.belt) c = shade(body, 0.1);
      else if (y === pr.belt) c = shade(body, 0.22);
      else {
        const k = (y - pr.belt) / Math.max(1, bottom - pr.belt);
        c = k < 0.42 ? body : k < 0.78 ? shade(body, -0.09) : shade(body, -0.22);
      }
      px(ctx, c, x, y, 1, 1);
    }
  }
  // Paragolpes: los extremos en tono más oscuro y una línea de plástico abajo.
  px(ctx, shade(body, -0.16), 1, pr.belt + 2, 1, bottom - pr.belt - 2);
  px(ctx, shade(body, -0.16), L - 2, pr.hood + 2, 1, bottom - pr.hood - 2);
  px(ctx, '#2a2a30', 1, bottom - 1, 3, 1);
  px(ctx, '#2a2a30', L - 4, bottom - 1, 3, 1);
  // Puertas: la junta delantera y la de cada montante, con su tirador.
  const doorLines = [pr.wsBase - 0.02, ...pr.pillars].map((q) => Math.round(q * L));
  for (const dx of doorLines) {
    px(ctx, shade(body, -0.22), dx, pr.belt + 1, 1, bottom - pr.belt - 2);
    px(ctx, shade(body, 0.3), dx - 3, pr.belt + 2, 2, 1);
  }
  // Retrovisor en la base del parabrisas.
  const mx = Math.round(pr.wsBase * L) - 1;
  px(ctx, shade(body, -0.2), mx, pr.belt - 1, 2, 2);
  px(ctx, shade(body, 0.2), mx, pr.belt - 1, 1, 1);
  // Faro (alargado, con su carcasa y el punto de luz) y piloto envolvente.
  px(ctx, '#2a2a30', L - 4, pr.hood + 1, 3, 2);
  px(ctx, HEAD, L - 3, pr.hood + 1, 2, 1);
  px(ctx, '#ffffff', L - 2, pr.hood + 1, 1, 1);
  px(ctx, TAIL, 1, pr.deck + 1, 2, 2);
  px(ctx, shade(TAIL, 0.35), 1, pr.deck + 1, 1, 1);
  if (t.trim?.stripe) {
    // Taxi: la banda roja en diagonal sobre la puerta delantera.
    const x0 = Math.round((pr.wsBase - 0.06) * L);
    for (let y = pr.belt + 1; y < bottom - 1; y++) px(ctx, t.trim.stripe, x0 - Math.round((y - pr.belt) * 0.7), y, 3, 1);
  }
  // Ruedas en sus pasos.
  const r = Math.round(H / 5);
  const cy = H - r - 1;
  for (const q of pr.wheels) {
    const cx = Math.round(q * L);
    arch(ctx, cx, cy, r + 1, bottom);
    wheel(ctx, cx, cy, r);
  }
  const lamps: VehicleLamps = { head: [L - 2, pr.hood + 1], tail: [1, pr.deck + 1] };
  if (t.trim?.roof !== 'taxi') return lamps;
  // El piloto de techo: caja blanca con el verde de libre.
  const mid = Math.round(((pr.roofRear + pr.roofFront) / 2) * L) - 2;
  px(ctx, PALETTE.outline, mid - 1, pr.roof - 2, 6, 2);
  px(ctx, '#f4f2ec', mid, pr.roof - 2, 4, 1);
  px(ctx, PALETTE.leafLit, mid + 3, pr.roof - 2, 1, 1);
  return { ...lamps, roof: [mid + 3, pr.roof - 2] };
}

// ----------------------------------------------------- autobús y autocar

/** Cifras de 3 × 5 para el letrero de línea. */
const DIGITS: Readonly<Record<string, readonly string[]>> = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
};

/** Letrero LED ámbar: el número de línea y, al lado, el destino en puntos (no se lee a esta escala; se ve que lo hay). */
function sign(ctx: Ctx, x: number, y: number, w: number, route: string): void {
  px(ctx, '#121116', x, y, w, 7);
  let cx = x + 1;
  for (const d of route) {
    const g = DIGITS[d];
    if (!g) continue;
    g.forEach((row, ry) => [...row].forEach((b, rx) => b === '1' && px(ctx, LED, cx + rx, y + 1 + ry, 1, 1)));
    cx += 4;
  }
  for (let dx = cx + 1; dx < x + w - 1; dx += 2) {
    px(ctx, shade(LED, -0.25), dx, y + 2, 1, 1);
    px(ctx, shade(LED, -0.25), dx + 1, y + 4, 1, 1);
  }
}

/**
 * Autobús urbano de piso bajo (azul) o autocar interurbano (verde): caja larga
 * con las esquinas redondeadas, techo claro con el equipo de aire, una franja
 * de cristal oscuro casi de punta a punta, parabrisas alto, letrero de línea
 * y puertas de cristal. El urbano lleva tres puertas y el cristal bajo; el
 * interurbano, dos puertas, ventanillas más altas y los maleteros abajo.
 */
function bus(p: Paint, route: string, coach: boolean): VehicleLamps {
  const { ctx, L, H, body } = p;
  const bottom = H - 4;
  const top = 2;
  // Carrocería con las esquinas de arriba redondeadas (la delantera más).
  for (let x = 1; x < L - 1; x++) {
    const round = x >= L - 4 ? x - (L - 5) : x <= 2 ? 3 - x : 0;
    const y0 = top + round;
    for (let y = y0; y <= bottom; y++) {
      const k = (y - y0) / (bottom - y0);
      px(ctx, y === y0 ? shade(body, 0.3) : k < 0.55 ? body : k < 0.85 ? shade(body, -0.1) : shade(body, -0.24), x, y, 1, 1);
    }
  }
  // Techo claro con el equipo de aire acondicionado.
  px(ctx, '#e4e2dc', 3, top, L - 8, 2);
  px(ctx, '#c9c6be', Math.round(L * 0.3), top - 2, Math.round(L * 0.22), 2);
  px(ctx, '#f0eee8', Math.round(L * 0.3), top - 2, Math.round(L * 0.22), 1);
  // Franja de cristal oscuro: el urbano, baja (piso bajo); el autocar, alta y más estrecha.
  const w0 = coach ? 4 : 5;
  const w1 = coach ? 14 : 17;
  px(ctx, TINT, 3, w0, L - 11, w1 - w0);
  px(ctx, TINT_LIT, 3, w0, L - 11, 1);
  for (let x = 4; x < L - 9; x++) if ((x * 3) % 17 === 0) px(ctx, shade(TINT_LIT, 0.15), x, w0 + 2, 1, w1 - w0 - 3);
  for (let x = 12; x < L - 12; x += coach ? 11 : 10) px(ctx, '#0d0c11', x, w0, 1, w1 - w0);
  // Parabrisas alto delante, inclinado en el autocar.
  for (let y = 3; y <= bottom - 6; y++) {
    const inset = coach ? Math.max(0, 2 - Math.floor((y - 3) / 3)) : 0;
    px(ctx, y < 6 ? TINT_LIT : TINT, L - 6 + inset, y, 5 - inset, 1);
  }
  // Puertas de cristal hasta abajo, con la junta de las hojas: urbano tres, autocar dos.
  const doors = coach ? [L - 14, Math.round(L * 0.52)] : [L - 14, Math.round(L * 0.5), Math.round(L * 0.24)];
  for (const dx of doors) {
    px(ctx, '#0d0c11', dx - 1, w0, 7, bottom - w0);
    px(ctx, TINT, dx, w0 + 1, 5, bottom - w0 - 2);
    px(ctx, TINT_LIT, dx, w0 + 1, 5, 1);
    px(ctx, '#0d0c11', dx + 2, w0 + 2, 1, bottom - w0 - 3);
  }
  // Letrero lateral junto a la puerta delantera, y el de delante (un filo ámbar sobre el parabrisas).
  sign(ctx, L - 32, w0 + 1, 17, route);
  px(ctx, LED, L - 5, 3, 3, 1);
  if (coach) {
    // Maleteros: paneles con sus juntas entre los ejes.
    for (let x = Math.round(L * 0.3); x < Math.round(L * 0.68); x += 8) px(ctx, shade(body, -0.25), x, w1 + 2, 1, bottom - w1 - 4);
    px(ctx, shade(body, 0.18), 3, w1 + 1, L - 10, 1);
  } else {
    // Filete claro bajo la franja de cristal.
    px(ctx, '#e8e6e0', 3, w1, L - 11, 1);
  }
  // Faros, pilotos y paragolpes.
  px(ctx, '#2a2a30', L - 4, bottom - 6, 3, 3);
  px(ctx, HEAD, L - 3, bottom - 5, 2, 1);
  px(ctx, TAIL, 1, bottom - 7, 2, 3);
  px(ctx, '#26252b', 1, bottom - 1, L - 2, 1);
  const r = 5;
  const cy = H - r - 1;
  for (const cx of [L - 21, Math.round(L * (coach ? 0.2 : 0.17))]) {
    arch(ctx, cx, cy, r + 1, bottom);
    wheel(ctx, cx, cy, r);
  }
  return { head: [L - 2, bottom - 5], tail: [1, bottom - 6] };
}

// ------------------------------------------------- camiones (de siempre)

function slab(p: Paint, x: number, y: number, w: number, h: number, color = p.body): void {
  px(p.ctx, color, x, y, w, h);
  px(p.ctx, shade(color, 0.14), x, y, w, 1);
  px(p.ctx, shade(color, -0.16), x, y + h - 2, w, 2);
}

function cabover(p: Paint, rear: (w: number) => void): VehicleLamps {
  const { ctx, L, H } = p;
  const cab = 12;
  const x = L - cab - 1;
  slab(p, x, H - 17, cab, 13);
  px(ctx, TINT, L - 5, H - 15, 3, 5);
  px(ctx, TINT_LIT, L - 5, H - 15, 3, 1);
  px(ctx, TINT, x + 2, H - 15, 5, 4);
  const w = L - cab - 4;
  rear(w);
  const r = 4;
  const cy = H - r - 1;
  for (const cx of [Math.round(L * 0.18), ...(L >= 50 ? [Math.round(L * 0.18) + 7] : []), L - 7]) {
    arch(ctx, cx, cy, r + 1, H - 4);
    wheel(ctx, cx, cy, r);
  }
  px(ctx, HEAD, L - 3, H - 9, 2, 1);
  px(ctx, TAIL, 1, H - 9, 1, 2);
  return { head: [L - 2, H - 9], tail: [1, H - 9] };
}

function boxTruck(p: Paint, t: VehicleType): VehicleLamps {
  return cabover(p, (w) => {
    const box = t.trim?.box ?? p.body;
    slab(p, 1, 1, w, p.H - 5, box);
    for (let x = 9; x < w; x += 9) px(p.ctx, shade(box, -0.1), x, 3, 1, p.H - 9);
    if (t.trim?.stripe) px(p.ctx, t.trim.stripe, 1, p.H - 11, w, 2);
  });
}

function garbage(p: Paint, t: VehicleType): VehicleLamps {
  return cabover(p, (w) => {
    const box = t.trim?.box ?? p.body;
    slab(p, 1, 3, w, p.H - 7, box);
    if (t.trim?.stripe) px(p.ctx, t.trim.stripe, 1, p.H - 11, w, 3);
    px(p.ctx, shade(PALETTE.metal, -0.1), 1, p.H - 14, 5, 8);
  });
}

function pickup(p: Paint, t: VehicleType): VehicleLamps {
  const pr: CarProfile = { rearBase: 0.36, roofRear: 0.4, roofFront: 0.62, wsBase: 0.74, roof: 2, belt: 8, hood: 9, deck: 9, pillars: [], wheels: [0.2, 0.8] };
  const lamps = car(p, t, pr);
  if (t.trim?.stripe) for (let x = 1; x < p.L - 2; x += 2) px(p.ctx, t.trim.stripe, x, p.H - 7, 1, 1);
  if (t.trim?.roof !== 'beacon') return lamps;
  const mid = Math.round(p.L * 0.5);
  px(p.ctx, PALETTE.outline, mid - 1, 0, 4, 2);
  px(p.ctx, PALETTE.amber, mid, 0, 2, 1);
  return { ...lamps, roof: [mid, 0] };
}

/** Contorno fino alrededor de lo pintado: la silueta se lee sobre cualquier asfalto. */
function outline(ctx: Ctx, w: number, h: number): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] === 255;
  const ring: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) ring.push((y * w + x) * 4);
  const n = Number.parseInt(PALETTE.outline.slice(1), 16);
  for (const i of ring) {
    d[i] = (n >> 16) & 255;
    d[i + 1] = (n >> 8) & 255;
    d[i + 2] = n & 255;
    d[i + 3] = 210;
  }
  ctx.putImageData(img, 0, 0);
}

/** Dibuja el tipo con esa carrocería (y, si lleva letrero, esa línea) y devuelve dónde quedan sus luces. */
export function drawVehicle(ctx: Ctx, t: VehicleType, body: string, variant = 0): VehicleLamps {
  const p: Paint = { ctx, L: t.length, H: t.height, body };
  const route = t.routes?.[variant % t.routes.length] ?? '';
  const profile = PROFILES[t.shape];
  let lamps: VehicleLamps;
  if (profile) lamps = car(p, t, profile);
  else if (t.shape === 'bus' || t.shape === 'coach') lamps = bus(p, route, t.shape === 'coach');
  else if (t.shape === 'box-truck') lamps = boxTruck(p, t);
  else if (t.shape === 'garbage') lamps = garbage(p, t);
  else lamps = pickup(p, t);
  // El contorno, sobre lo que hay; la sombra de contacto, debajo de todo (núcleo bajo las ruedas y borde que se funde).
  outline(ctx, p.L, p.H);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  px(ctx, SHADOW, 3, p.H - 3, p.L - 4, 2);
  px(ctx, SHADOW_SOFT, 0, p.H - 4, p.L + 1, 4);
  ctx.restore();
  return lamps;
}

const LAMPS = new Map<string, VehicleLamps>();

export function vehicleKey(t: VehicleType, color: number): string {
  return `veh-${t.id}-${color}`;
}

/** Luces del tipo; las fija buildVehicleTextures. */
export function lampsOf(t: VehicleType): VehicleLamps {
  const lamps = LAMPS.get(t.id);
  if (!lamps) throw new Error(`Vehículo sin textura: ${t.id}`);
  return lamps;
}

export function buildVehicleTextures(scene: Phaser.Scene): void {
  for (const t of VEHICLES) {
    t.colors.forEach((c, i) => make(scene, vehicleKey(t, i), t.length, t.height, (ctx) => LAMPS.set(t.id, drawVehicle(ctx, t, c, i))));
  }
  // Luces encendidas: van encima de la sombra de la noche.
  make(scene, 'veh-head', 1, 2, (ctx) => px(ctx, '#fff6d8', 0, 0, 1, 2));
  make(scene, 'veh-tail', 1, 2, (ctx) => px(ctx, '#ff5a44', 0, 0, 1, 2));
  make(scene, 'veh-roof-taxi', 2, 1, (ctx) => px(ctx, '#7cff8a', 0, 0, 2, 1));
  make(scene, 'veh-roof-beacon', 2, 1, (ctx) => px(ctx, '#ffb13a', 0, 0, 2, 1));
}
