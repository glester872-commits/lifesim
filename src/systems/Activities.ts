// Sin Phaser: lo usan WorldScene y scripts/check-economy.ts.
import { ingredientsOf, type ActivityDef } from '../data/activities.ts';
import { weekIndex } from './Calendar.ts';
import { euros, produce, spend, type Wallet } from './Commerce.ts';
import { getItem } from '../data/items.ts';

/** Lo que una actividad necesita saber del jugador para decidir si se puede. */
export interface ActivityContext {
  day: number;
  hour: number;
  minute: number;
  money: number;
  energy: number;
  /** Lo que lleva encima: hace falta si la actividad gasta algo. */
  inventory?: Readonly<Record<string, number>>;
}

/** Lo que cambia al hacerla: el reloj, el dinero y la energía. */
export interface ActivityOutcome {
  minutes: number;
  money: number;
  energy: number;
  lines: readonly string[];
  /** Lo que sale de la bolsa (vacío si nada). */
  consumes: { item: string; qty: number }[];
  /** Lo que entra en la bolsa. */
  produces?: { item: string; qty: number };
}

const hh = (h: number): string => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/** Por qué no se puede empezar ahora, o null si se puede. */
export function blocker(def: ActivityDef, ctx: ActivityContext): string | null {
  const r = def.requires;
  const t = ctx.hour + ctx.minute / 60;
  if (r?.days && !r.days.includes(weekIndex(ctx.day))) return 'Hoy no toca.';
  if (r?.start && (t < r.start[0] || t >= r.start[1])) return `Sólo se empieza entre las ${hh(r.start[0])} y las ${hh(r.start[1])}.`;
  if (r?.energy !== undefined && ctx.energy < r.energy) return 'Estás demasiado cansado.';
  if (def.cost && ctx.money < def.cost) return `No te llega: cuesta ${euros(def.cost)}.`;
  const missing = ingredientsOf(def).find((c) => (ctx.inventory?.[c.item] ?? 0) < c.qty);
  if (missing) return `Te falta: ${getItem(missing.item).name.toLowerCase()}.`;
  if (def.produces) {
    const r = produce({ money: ctx.money, inventory: { ...ctx.inventory }, cards: {} }, def.produces.item, def.produces.qty);
    if (!r.ok) return r.message;
  }
  return null;
}

/**
 * Lo que la actividad hace en la cartera, de una vez: el dinero, todos los ingredientes y lo que sale. Pura; si lo
 * producido no cabe, la misma cartera y ok false (nada a medias). Quien llama asigna `wallet` una sola vez.
 */
export function applyOutcome(w: Wallet, out: ActivityOutcome): { ok: boolean; wallet: Wallet; message: string } {
  let next: Wallet = { ...w, money: w.money + out.money };
  for (const c of out.consumes) {
    if ((next.inventory[c.item] ?? 0) < c.qty) return { ok: false, wallet: w, message: `Te falta: ${getItem(c.item).name.toLowerCase()}.` };
    next = spend(next, c.item, c.qty);
  }
  if (out.produces) {
    const r = produce(next, out.produces.item, out.produces.qty);
    if (!r.ok) return { ok: false, wallet: w, message: r.message };
    next = r.wallet;
  }
  return { ok: true, wallet: next, message: '' };
}

/** Qué pasa al hacerla. No toca nada: quien la lanza aplica el resultado y adelanta el reloj. */
export function perform(def: ActivityDef): ActivityOutcome {
  return {
    minutes: def.minutes,
    money: (def.effects.money ?? 0) - (def.cost ?? 0),
    energy: def.effects.energy ?? 0,
    lines: def.lines,
    consumes: ingredientsOf(def),
    produces: def.produces && { ...def.produces },
  };
}
