// Sin Phaser: lo usan WorldScene y scripts/check-economy.ts.
import type { ActivityDef } from '../data/activities.ts';
import { weekIndex } from './Calendar.ts';
import { euros } from './Commerce.ts';
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
  /** Lo que sale de la bolsa. */
  consumes?: { item: string; qty: number };
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
  if (def.consumes && (ctx.inventory?.[def.consumes.item] ?? 0) < (def.consumes.qty ?? 1)) return `Te falta: ${getItem(def.consumes.item).name.toLowerCase()}.`;
  return null;
}

/** Qué pasa al hacerla. No toca nada: quien la lanza aplica el resultado y adelanta el reloj. */
export function perform(def: ActivityDef): ActivityOutcome {
  return {
    minutes: def.minutes,
    money: (def.effects.money ?? 0) - (def.cost ?? 0),
    energy: def.effects.energy ?? 0,
    lines: def.lines,
    consumes: def.consumes && { item: def.consumes.item, qty: def.consumes.qty ?? 1 },
  };
}
