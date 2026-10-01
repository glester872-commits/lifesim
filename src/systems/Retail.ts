// Sin Phaser: lo usan scenes/Menus.ts y scripts/check-economy.ts.
import type { Appearance } from '../data/appearance.ts';
import { getGarment, getStore, type GarmentCategory, type GarmentDef, type StockLine } from '../data/retail.ts';
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
export function buyGarment(w: Wallet, wardrobe: readonly string[], current: Appearance, storeId: string, garment: string, equip = true): Purchase {
  const store = getStore(storeId);
  const line = store.stock.find((l) => l.garment === garment);
  const refuse = (message: string): Purchase => ({ ok: false, wallet: w, wardrobe, appearance: current, message });
  if (!line) return refuse('Eso no lo tenemos.');
  const def = getGarment(garment);
  if (wardrobe.includes(garment)) return refuse(def.unique ? 'Era la única y ya es tuya.' : 'Ya tienes una igual.');
  if (w.money + 1e-9 < line.price) return refuse(`No te llega: cuesta ${euros(line.price)}.`);
  return {
    ok: true,
    wallet: { money: Math.round((w.money - line.price) * 100) / 100, inventory: { ...w.inventory }, cards: { ...w.cards } },
    wardrobe: [...wardrobe, garment],
    appearance: equip ? wear(current, garment) : current,
    message: store.thanks,
  };
}
