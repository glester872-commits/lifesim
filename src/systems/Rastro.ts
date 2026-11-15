// Sin Phaser: lo usan Menus, SaveSystem y scripts/check-rastro-rarities.ts.
import { hashSeed, seededRng } from './MetroDaily.ts';

/**
 * CAS-04 · rarezas del Gran Rastro: cada puesto puede sacar sus piezas únicas un domingo sí y otro no (weekStock),
 * y lo que se vende queda apuntado en el registro de esa jornada (RastroLedger). Sin él, un regalo dado o una prenda
 * vendida en Segunda Vuelta volvían a estar a la venta el mismo día.
 */

/** Clave = id del catálogo o de la tienda del puesto → ids de sus rarezas. */
export const RARE_BY_VENDOR: Readonly<Record<string, readonly string[]>> = {
  'rastro-discos': ['rastro-vinyl-first'],
  'rastro-libros': ['rastro-book-signed'],
  'rastro-camaras': ['rastro-camera-slr'],
  'rastro-retro': ['rastro-figure'],
  'rastro-vintage': ['cazadora-ante'],
};

const RARE_IDS = new Set(Object.values(RARE_BY_VENDOR).flat());

/** Probabilidad de que una rareza salga en una jornada. */
const RARE_CHANCE = 0.5;

/** `edition` = día de la jornada; `sold` = rarezas ya vendidas en ella; `haggled` = precio pactado (segmento B). */
export type RastroLedger = { edition: number; sold: string[]; haggled: Record<string, number> };

export const isRare = (id: string): boolean => RARE_IDS.has(id);

/** Las rarezas que saca este puesto en esta jornada: determinista por (key, day). */
export function weekStock(key: string, day: number): string[] {
  const rare = RARE_BY_VENDOR[key];
  if (!rare) return [];
  const rng = seededRng(hashSeed('rastro-stock', key, day));
  return rare.filter(() => rng() < RARE_CHANCE);
}

/** El registro de esta jornada: vacío si no lo hay o es de otra. */
export function ledgerFor(l: RastroLedger | undefined, day: number): RastroLedger {
  if (!l || l.edition !== day) return { edition: day, sold: [], haggled: {} };
  return l;
}

/** Apunta una rareza vendida en la jornada `day`, sin duplicados. */
export function markSold(l: RastroLedger | undefined, day: number, id: string): RastroLedger {
  const cur = ledgerFor(l, day);
  return { edition: day, sold: cur.sold.includes(id) ? [...cur.sold] : [...cur.sold, id], haggled: { ...cur.haggled } };
}

/**
 * Cómo está `id` en el puesto `key` esta jornada: 'common' si no es rareza de ese puesto (todo igual que antes);
 * 'hidden' si hoy no la saca o no se mira desde el puesto (`atStall`); 'sold' si ya se vendió; si no, 'available'.
 */
export function rareStatus(key: string, id: string, day: number, l: RastroLedger | undefined, atStall: boolean): 'common' | 'hidden' | 'sold' | 'available' {
  if (!RARE_BY_VENDOR[key]?.includes(id)) return 'common';
  if (!atStall || !weekStock(key, day).includes(id)) return 'hidden';
  return ledgerFor(l, day).sold.includes(id) ? 'sold' : 'available';
}

/** Carácter del vendedor al regatear: cuánto rebaja como mucho. */
export type Mood = 'duro' | 'normal' | 'blando';
export const MAX_DISCOUNT: Readonly<Record<Mood, number>> = { duro: 0.05, normal: 0.12, blando: 0.2 };

/** Clave = id del catálogo o de la tienda del puesto. Los puestos sin entrada no regatean. */
export const MOOD_BY_VENDOR: Readonly<Record<string, Mood>> = {
  'rastro-camaras': 'duro',
  'rastro-discos': 'normal',
  'rastro-libros': 'blando',
  'rastro-retro': 'normal',
  'rastro-vintage': 'duro',
};

export const HAGGLE_OFFERS = [0.1, 0.2, 0.3] as const;
export type HaggleOutcome = 'accept' | 'counter' | 'reject';

const round2 = (n: number): number => Math.round(n * 100) / 100;

const HAGGLE_LINES: Readonly<Record<Mood, Record<HaggleOutcome, string>>> = {
  duro: {
    accept: 'Vale, venga. Pero no se lo digas a nadie.',
    counter: 'Ni hablar. Como mucho te lo dejo en esto, y ya me duele.',
    reject: 'Esto vale lo que pone. Si no, ahí tienes la calle.',
  },
  normal: {
    accept: 'Hecho, que es domingo y hay que mover género.',
    counter: 'Tanto no. Te hago este precio y quedamos bien.',
    reject: 'Uf, así no. Lo dejo en lo que marca.',
  },
  blando: {
    accept: '¡Para ti! Que lo disfrutes, que tiene historia.',
    counter: 'Ay, tanto no puedo... ¿te va esto?',
    reject: 'Perdona, pero así pierdo dinero. Te lo dejo como está.',
  },
};

/**
 * Regateo de una rareza: hasta el máximo del mood acepta la oferta; hasta el doble contraoferta con su suelo;
 * por encima, rechaza y mantiene la lista. El precio nunca sale de [suelo, base].
 */
export function haggle(base: number, mood: Mood, offerPct: number): { outcome: HaggleOutcome; price: number; line: string } {
  const b = Number.isFinite(base) && base > 0 ? base : 0.01;
  const maxDisc = MAX_DISCOUNT[mood];
  const floor = Math.max(0.01, round2(b * (1 - maxDisc)));
  const offer = Number.isFinite(offerPct) ? offerPct : 1;
  let outcome: HaggleOutcome;
  let raw: number;
  if (offer <= maxDisc + 1e-9) { outcome = 'accept'; raw = round2(b * (1 - offer)); }
  else if (offer <= 2 * maxDisc + 1e-9) { outcome = 'counter'; raw = floor; }
  else { outcome = 'reject'; raw = b; }
  const price = Math.min(b, Math.max(floor, raw));
  return { outcome, price, line: HAGGLE_LINES[mood][outcome] };
}

/** Precio pactado de `id` en la jornada `day`, si se regateó. */
export function agreedPrice(l: RastroLedger | undefined, day: number, id: string): number | undefined {
  return ledgerFor(l, day).haggled[id];
}

/** Apunta el precio pactado, inmutable y en la jornada `day`. */
export function markHaggled(l: RastroLedger | undefined, day: number, id: string, price: number): RastroLedger {
  const cur = ledgerFor(l, day);
  return { edition: day, sold: [...cur.sold], haggled: { ...cur.haggled, [id]: price } };
}

/** Lee un registro guardado; lo que no cuadra se descarta. */
export function parseRastro(raw: unknown): RastroLedger {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const edition = Number.isInteger(o.edition) && (o.edition as number) >= 0 ? (o.edition as number) : 0;
  const sold = Array.isArray(o.sold) ? [...new Set(o.sold.filter((id): id is string => typeof id === 'string' && isRare(id)))] : [];
  const haggled: Record<string, number> = {};
  if (o.haggled && typeof o.haggled === 'object') {
    for (const [id, v] of Object.entries(o.haggled as Record<string, unknown>)) {
      if (isRare(id) && typeof v === 'number' && Number.isFinite(v) && v >= 0.01) haggled[id] = v;
    }
  }
  return { edition, sold, haggled };
}
