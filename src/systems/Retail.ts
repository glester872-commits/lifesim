// Sin Phaser: lo usan scenes/Menus.ts y scripts/check-economy.ts.
import type { Appearance } from '../data/appearance.ts';
import { getGarment, getStore, STORES, type GarmentCategory, type GarmentDef, type StockLine } from '../data/retail.ts';
import { euros, type Wallet } from './Commerce.ts';

/**
 * Tiendas de ropa: una sola regla para todas. Qué hay y a cuánto lo dice la
 * tienda (data/retail.ts); aquí se decide si se puede comprar, qué pasa con el
 * armario y qué te pones. Puras, como systems/Commerce.ts: devuelven cartera,
 * armario y aspecto nuevos y quien llama los aplica.
 */

export interface Purchase {
  ok: boolean;
  wallet: Wallet;
  /** Prendas tuyas (ids de data/retail.ts), en orden de compra. */
  wardrobe: readonly string[];
  /** El aspecto después: lo comprado, puesto. */
  appearance: Appearance;
  /** Lo cobrado por la prenda; 0 si no se compró. */
  paid: number;
  message: string;
}

/** Ponerse una prenda: ocupa su hueco (arriba o abajo) y aparta lo que hubiera. */
export function wear(current: Appearance, garment: string): Appearance {
  return { ...current, [getGarment(garment).slot]: garment };
}

/** Volver a la ropa de siempre en un hueco. */
export function takeOff(current: Appearance, slot: GarmentDef['slot']): Appearance {
  const out = { ...current };
  delete out[slot];
  return out;
}

export interface StockView extends StockLine {
  def: GarmentDef;
  /** Ya es tuya: ponérsela no cuesta nada. */
  owned: boolean;
  /** La llevas puesta ahora. */
  wearing: boolean;
}

/**
 * Lo que enseña la tienda a quien entra, con lo que ya tiene y lo que lleva.
 * Un perchero sólo enseña las categorías que le tocan (`only`); sin ellas, todo.
 */
export function stockOf(storeId: string, wardrobe: readonly string[], current: Appearance, only?: readonly GarmentCategory[]): StockView[] {
  return getStore(storeId).stock.flatMap((line) => {
    const def = getGarment(line.garment);
    if (only && !only.includes(def.category)) return [];
    return [{ ...line, def, owned: wardrobe.includes(line.garment), wearing: current[def.slot] === line.garment }];
  });
}

/**
 * Comprar en esta tienda: se paga su precio, entra en el armario y, por
 * defecto, se sale con ella puesta (en el perchero se compra sin ponérsela:
 * `equip` falso). Una pieza única que ya es tuya no se vuelve a vender, y
 * nada se cobra dos veces: lo que ya está en el armario se rechaza.
 */
export function buyGarment(w: Wallet, wardrobe: readonly string[], current: Appearance, storeId: string, garment: string, equip = true, factor = 1): Purchase {
  const store = getStore(storeId);
  const line = store.stock.find((l) => l.garment === garment);
  const refuse = (message: string): Purchase => ({ ok: false, wallet: w, wardrobe, appearance: current, paid: 0, message });
  if (!line) return refuse('Eso no lo tenemos.');
  const def = getGarment(garment);
  if (wardrobe.includes(garment)) return refuse(def.unique ? 'Era la única y ya es tuya.' : 'Ya tienes una igual.');
  // MAP-07: el precio con la reputación del barrio (systems/Reputation.priceFactor); la reventa sale de `paid`.
  const price = Math.round(line.price * factor * 100) / 100;
  if (w.money + 1e-9 < price) return refuse(`No te llega: cuesta ${euros(price)}.`);
  return {
    ok: true,
    wallet: { money: Math.round((w.money - price) * 100) / 100, inventory: { ...w.inventory }, cards: { ...w.cards } },
    wardrobe: [...wardrobe, garment],
    appearance: equip ? wear(current, garment) : current,
    paid: price,
    message: store.thanks,
  };
}

export const RESALE_RATE = 0.4;
export const RESALE_CAP = 40;

/** Lo que dan por una prenda según lo realmente pagado: siempre menos de eso. Sin registro, nada. */
export function resaleValue(paid: number | undefined): number {
  if (paid === undefined || !Number.isFinite(paid) || paid <= 0.01) return 0;
  return Math.min(RESALE_CAP, Math.floor(paid * RESALE_RATE * 100) / 100, Math.round((paid - 0.01) * 100) / 100);
}

export interface Sale {
  ok: boolean;
  wallet: Wallet;
  wardrobe: readonly string[];
  appearance: Appearance;
  paid: Record<string, number>;
  amount: number;
  message: string;
}

/**
 * Vender una prenda a una tienda que compra usado. Es una pieza: sale del
 * armario, y si la llevabas, de encima. Lo vendido ya no está en el armario,
 * así que una segunda venta se rechaza sin tocar nada.
 */
export function sellGarment(w: Wallet, wardrobe: readonly string[], current: Appearance, paid: Record<string, number>, storeId: string, garment: string): Sale {
  const refuse = (message: string): Sale => ({ ok: false, wallet: w, wardrobe, appearance: current, paid, amount: 0, message });
  if (!STORES.find((s) => s.id === storeId)?.buysBack) return refuse('Aquí no compran ropa.');
  if (!wardrobe.includes(garment)) return refuse('Eso no es tuyo.');
  const amount = resaleValue(paid[garment]);
  if (amount <= 0) return refuse('Sin tique no la quieren.');
  const { slot } = getGarment(garment);
  const left = { ...paid };
  delete left[garment];
  return {
    ok: true,
    wallet: { money: Math.round((w.money + amount) * 100) / 100, inventory: { ...w.inventory }, cards: { ...w.cards } },
    wardrobe: wardrobe.filter((g) => g !== garment),
    appearance: current[slot] === garment ? takeOff(current, slot) : current,
    paid: left,
    amount,
    message: 'Anotado. La pone a la venta mañana.',
  };
}

/** ¿Esta tienda compra este objeto? `buysItems` admite ids exactos o prefijos acabados en '*'. */
export function buysItem(storeId: string, itemId: string): boolean {
  const accepts = STORES.find((s) => s.id === storeId)?.buysItems ?? [];
  return accepts.some((p) => (p.endsWith('*') ? itemId.startsWith(p.slice(0, -1)) : itemId === p));
}

export type ItemSale =
  | { ok: true; wallet: Wallet; paidItems: Record<string, number[]>; amount: number }
  | { ok: false; message: string };

/**
 * CAS-05 · vender un objeto de la bolsa con tique. Sale una unidad y su tique
 * más antiguo (FIFO); se paga resaleValue de ese tique. Pura: quien llama aplica.
 */
export function sellItem(w: Wallet, paidItems: Record<string, number[]>, storeId: string, itemId: string, reserved = 0): ItemSale {
  if (!buysItem(storeId, itemId)) return { ok: false, message: 'Aquí no compran eso.' };
  const have = w.inventory[itemId] ?? 0;
  if (have < 1) return { ok: false, message: 'No lo llevas.' };
  // ECO-01 · CAS-09 no aparta lo listado en tu puesto: la tienda deja al menos tantas unidades como listados.
  if (have - reserved < 1) return { ok: false, message: 'Está en tu puesto del Rastro: retíralo primero.' };
  const tiques = paidItems[itemId] ?? [];
  const amount = resaleValue(tiques[0]);
  if (amount <= 0) return { ok: false, message: 'Sin tique no lo quieren.' };
  const inventory = { ...w.inventory };
  if (have - 1 > 0) inventory[itemId] = have - 1;
  else delete inventory[itemId];
  const left = { ...paidItems };
  if (tiques.length > 1) left[itemId] = tiques.slice(1);
  else delete left[itemId];
  return {
    ok: true,
    wallet: { money: Math.round((w.money + amount) * 100) / 100, inventory, cards: { ...w.cards } },
    paidItems: left,
    amount,
  };
}

/**
 * ECO-01 · Quién compraría este objeto y por cuánto: la primera tienda con `buysItems` que lo acepta, con el tique
 * más antiguo (el que consumiría sellItem) y el mismo importe. Sin comprador, undefined; sin tique, amount 0.
 */
export function resaleOffer(itemId: string, paidItems: Readonly<Record<string, readonly number[]>>): { store: string; storeId: string; paid?: number; amount: number } | undefined {
  const store = STORES.find((s) => s.buysItems && buysItem(s.id, itemId));
  if (!store) return undefined;
  const paid = paidItems[itemId]?.[0];
  return { store: store.name, storeId: store.id, ...(paid === undefined ? {} : { paid }), amount: resaleValue(paid) };
}
