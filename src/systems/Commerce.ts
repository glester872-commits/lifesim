// Sin Phaser: lo usan WorldScene y scripts/check-economy.ts.
import { getItem } from '../data/items.ts';
import type { Product } from '../data/catalogs.ts';

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
export type Refusal = 'money' | 'no-card' | 'has-card' | 'no-balance' | 'no-item';

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
};

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
