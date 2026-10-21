// Sin Phaser: lo usan WorldScene y scripts/check-economy.ts.
import { CARRY_MAX, getItem } from '../data/items.ts';
import type { Catalog, Product } from '../data/catalogs.ts';

/**
 * Transacciones. Todo lo que se paga pasa por aquí: una compra en una
 * máquina, en una barra o en la taquilla, y el billete al subir al tren. Son
 * funciones puras sobre una cartera: no tocan el estado, devuelven la cartera
 * nueva y qué pasó, y quien llama la aplica (GameState.wallet). Así se prueban
 * sin juego y un sitio nuevo que venda algo no necesita código propio.
 */

export interface Wallet {
  money: number;
  /** Objeto → unidades. */
  inventory: Record<string, number>;
  /** Tarjeta → saldo en euros. Sin clave, no la tiene. */
  cards: Record<string, number>;
}

/** Por qué no se pudo. */
export type Refusal = 'money' | 'no-card' | 'has-card' | 'no-balance' | 'no-item' | 'qty' | 'full' | 'not-sold';

export interface TxResult {
  ok: boolean;
  reason?: Refusal;
  /** La cartera después (igual que antes si no se pudo). */
  wallet: Wallet;
  /** Lo que se le cuenta al jugador. */
  message: string;
  /** Energía que devuelve lo consumido. */
  energy?: number;
}

/** Céntimos exactos: 1,20 + 1,30 no puede dar 2,4999. */
const cents = (n: number): number => Math.round(n * 100) / 100;

/** Como en el HUD: €1.200, €12,50. */
export const euros = (n: number): string => {
  const v = cents(n);
  const digits = Number.isInteger(v) ? 0 : 2;
  return `€${new Intl.NumberFormat('es-ES', { useGrouping: true, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v)}`;
};

const copy = (w: Wallet): Wallet => ({ money: w.money, inventory: { ...w.inventory }, cards: { ...w.cards } });

/** Si se puede comprar ahora, null; si no, por qué. Sirve para apagar opciones antes de elegir. */
export function refusal(w: Wallet, p: Product): Refusal | null {
  if ('card' in p.effect) {
    const has = p.effect.card in w.cards;
    if (p.effect.issue && has) return 'has-card';
    if (!p.effect.issue && !has) return 'no-card';
  }
  return w.money + 1e-9 < p.price ? 'money' : null;
}

const WHY: Readonly<Record<Refusal, (p?: Product) => string>> = {
  money: (p) => `No te llega: cuesta ${euros(p!.price)}.`,
  'no-card': () => 'Primero necesitas la tarjeta.',
  'has-card': () => 'Ya tienes tarjeta: sólo hace falta recargarla.',
  'no-balance': () => 'No queda saldo suficiente en la tarjeta.',
  'no-item': () => 'No te queda.',
  qty: () => 'Esa cantidad no vale: de una unidad en adelante.',
  full: (p) => `No te cabe más ${getItem((p!.effect as { item: string }).item).name.toLowerCase()} en la bolsa.`,
  'not-sold': () => 'Aquí no se vende eso.',
};

/** Unidades de un objeto que caben en la bolsa (data/items.ts max, o CARRY_MAX). */
export const carryMax = (itemId: string): number => getItem(itemId).max ?? CARRY_MAX;

/** Cuántas de un producto se pueden pagar ahora: lo que llega con el dinero y lo que cabe en la bolsa. 0 si ninguna. */
export function maxQty(w: Wallet, p: Product): number {
  if (!('item' in p.effect)) return 0;
  const per = p.effect.qty ?? 1;
  const room = Math.floor((carryMax(p.effect.item) - (w.inventory[p.effect.item] ?? 0)) / per);
  const affordable = Math.floor(cents(w.money + 1e-9) / p.price + 1e-9);
  return Math.max(0, Math.min(room, affordable));
}

/**
 * Pagar en caja: `qty` unidades de un producto de ese catálogo, todo o nada. Se comprueba aquí (no en el botón) que el
 * producto se vende ahí y al precio de la lista, que la cantidad es un entero ≥ 1, que llega el dinero y que cabe en la
 * bolsa; si algo falla, la cartera vuelve igual. Si no, una cartera nueva con el cobro y lo comprado a la vez.
 */
export function checkout(w: Wallet, catalog: Catalog, productId: string, qty: number): TxResult & { total?: number } {
  const p = catalog.products.find((x) => x.id === productId);
  if (!p || !('item' in p.effect)) return { ok: false, reason: 'not-sold', wallet: w, message: WHY['not-sold']() };
  if (!Number.isInteger(qty) || qty < 1) return { ok: false, reason: 'qty', wallet: w, message: WHY.qty() };
  const total = cents(p.price * qty);
  if (w.money + 1e-9 < total) return { ok: false, reason: 'money', wallet: w, message: `No te llega: son ${euros(total)} y llevas ${euros(w.money)}.` };
  const id = p.effect.item;
  const units = (p.effect.qty ?? 1) * qty;
  const have = w.inventory[id] ?? 0;
  if (have + units > carryMax(id)) {
    return { ok: false, reason: 'full', wallet: w, message: `${WHY.full(p)} Llevas ${have} y caben ${carryMax(id)}.` };
  }
  const next = copy(w);
  next.money = cents(next.money - total);
  next.inventory[id] = have + units;
  return { ok: true, wallet: next, total, message: `${qty} × ${p.label}: ${euros(total)}. Te quedan ${euros(next.money)}.` };
}

/** Qué hace un producto, para leerlo antes de comprarlo: la energía al tomarlo, o dónde se usa. */
export function productUse(p: Product): string {
  if (!('item' in p.effect)) return 'saldo en la tarjeta';
  const item = getItem(p.effect.item);
  const per = p.effect.qty && p.effect.qty > 1 ? `${p.effect.qty} usos · ` : '';
  if (item.where) return `${per}${item.where}`;
  return `${per}+${item.energy ?? 0} ⚡ al ${item.kind === 'drink' ? 'beberlo' : 'comerlo'} (bolsa, I)`;
}

export function purchase(w: Wallet, p: Product): TxResult {
  const why = refusal(w, p);
  if (why) return { ok: false, reason: why, wallet: w, message: WHY[why](p) };
  const next = copy(w);
  next.money = cents(next.money - p.price);
  const e = p.effect;
  let message: string;
  if ('item' in e) {
    next.inventory[e.item] = (next.inventory[e.item] ?? 0) + (e.qty ?? 1);
    message = `${getItem(e.item).name}: ${euros(p.price)}.`;
  } else {
    next.cards[e.card] = cents((next.cards[e.card] ?? 0) + e.load);
    message = `${getItem(e.card).name}: saldo ${euros(next.cards[e.card])}.`;
  }
  return { ok: true, wallet: next, message };
}

/** Paga un trayecto con la tarjeta de ese transporte. */
export function payFare(w: Wallet, card: string, fare: number): TxResult {
  if (!(card in w.cards)) return { ok: false, reason: 'no-card', wallet: w, message: `Hace falta la ${getItem(card).name.toLowerCase()}. La venden en la máquina del vestíbulo.` };
  if (w.cards[card] + 1e-9 < fare) {
    return { ok: false, reason: 'no-balance', wallet: w, message: `Saldo insuficiente: quedan ${euros(w.cards[card])} y el viaje cuesta ${euros(fare)}. Se recarga en la máquina.` };
  }
  const next = copy(w);
  next.cards[card] = cents(next.cards[card] - fare);
  return { ok: true, wallet: next, message: `Viaje pagado. Saldo: ${euros(next.cards[card])}.` };
}

/** Se come o se bebe uno: sale del inventario y devuelve su energía. */
export function consume(w: Wallet, itemId: string): TxResult {
  const item = getItem(itemId);
  if (!w.inventory[itemId] || item.kind === 'card') return { ok: false, reason: 'no-item', wallet: w, message: WHY['no-item']() };
  // Lo de cocinar no se come tal cual: se usa en la cocina.
  if (item.kind === 'ingredient') return { ok: false, reason: 'no-item', wallet: w, message: 'Así no se come. Hay que cocinarlo.' };
  if (item.kind === 'hygiene') return { ok: false, reason: 'no-item', wallet: w, message: `Se usa ${item.where ?? 'en casa'}.` };
  if (item.kind === 'gift') return { ok: false, reason: 'no-item', wallet: w, message: `Es para regalar: ${item.where ?? 'a alguien que conozcas'}.` };
  const next = copy(w);
  next.inventory[itemId] -= 1;
  if (next.inventory[itemId] === 0) delete next.inventory[itemId];
  return { ok: true, wallet: next, message: item.use ?? item.name, energy: item.energy ?? 0 };
}

/** Saca unidades de la bolsa (lo que gasta una actividad). */
export function spend(w: Wallet, itemId: string, qty = 1): Wallet {
  const next = copy(w);
  next.inventory[itemId] = (next.inventory[itemId] ?? 0) - qty;
  if (next.inventory[itemId] <= 0) delete next.inventory[itemId];
  return next;
}
