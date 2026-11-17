// Sin Phaser: lo usan scenes/Menus.ts y scripts/check-checkout-basket.ts.
import type { Appearance } from '../data/appearance.ts';
import { getGarment } from '../data/retail.ts';
import type { Wallet } from './Commerce.ts';
import { buyGarment, SOLD_OUT, soldOutToday } from './Retail.ts';

/**
 * DEC-04 · La cesta de una tienda de ropa: lo que se coge en los percheros y se paga junto en caja o en el autopago.
 * Puras: devuelven la cesta o el estado nuevo y quien llama lo aplica. La cesta no se guarda con la partida.
 */

export interface BasketLine {
  store: string;
  garment: string;
  /** Precio con el factor del barrio, en euros redondeados a céntimos (como Menus.priced). */
  price: number;
}

export type BasketAdd = { ok: true; basket: readonly BasketLine[]; message: string } | { ok: false; basket: readonly BasketLine[]; message: string };

/** Una prenda por línea: ni repetida en la cesta ni ya en el armario. */
export function addLine(basket: readonly BasketLine[], line: BasketLine, wardrobe: readonly string[], day?: number): BasketAdd {
  if (wardrobe.includes(line.garment)) return { ok: false, basket, message: 'Ya es tuya: no hace falta llevarla a caja.' };
  if (day !== undefined && soldOutToday(line.store, line.garment, day, wardrobe)) return { ok: false, basket, message: SOLD_OUT };
  if (basket.some((l) => l.store === line.store && l.garment === line.garment)) return { ok: false, basket, message: 'Ya está en la cesta.' };
  return { ok: true, basket: [...basket, { ...line }], message: `${getGarment(line.garment).name}, a la cesta.` };
}

export function removeLine(basket: readonly BasketLine[], store: string, garment: string): BasketLine[] {
  return basket.filter((l) => !(l.store === store && l.garment === garment));
}

/** Las líneas de una tienda. */
export function linesOf(basket: readonly BasketLine[], store: string): BasketLine[] {
  return basket.filter((l) => l.store === store);
}

/** Total exacto: se suma en céntimos enteros. */
export function total(lines: readonly BasketLine[]): number {
  return lines.reduce((c, l) => c + Math.round(l.price * 100), 0) / 100;
}

export type BasketPayment =
  | { ok: true; wallet: Wallet; wardrobe: readonly string[]; paid: Record<string, number>; charged: number; message: string }
  | { ok: false; message: string };

/**
 * Pagar la cesta: buyGarment línea a línea sobre copias (sin ponérsela). Si una falla (saldo, ya la tienes), no se
 * aplica nada y se dice por qué; si todas valen, el estado completo para aplicarlo de una vez. Cesta vacía: no cobra.
 */
export function payBasket(w: Wallet, wardrobe: readonly string[], current: Appearance, paid: Readonly<Record<string, number>>, lines: readonly BasketLine[], factor = 1, day?: number): BasketPayment {
  if (lines.length === 0) return { ok: false, message: 'La cesta está vacía.' };
  let wallet = w;
  let owned = wardrobe;
  const tiques: Record<string, number> = { ...paid };
  let charged = 0;
  let message = '';
  for (const line of lines) {
    const r = buyGarment(wallet, owned, current, line.store, line.garment, false, factor, day);
    if (!r.ok) return { ok: false, message: `${getGarment(line.garment).name}: ${r.message}` };
    wallet = r.wallet;
    owned = r.wardrobe;
    tiques[line.garment] = r.paid;
    charged += Math.round(r.paid * 100);
    message = r.message;
  }
  return { ok: true, wallet, wardrobe: owned, paid: tiques, charged: charged / 100, message };
}
