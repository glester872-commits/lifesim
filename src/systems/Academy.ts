// Sin Phaser: lo usan systems/Fitness (si una clase está cubierta), scenes/Menus (bono) y scenes/WorldScene (cobro al
// empezar), y lo prueba scripts/check-academies.ts.
import type { AcademyDef } from '../data/academies.ts';
import { dateOf, dayOfDate } from './Calendar.ts';

/**
 * La ficha del jugador en una academia (data/academies.ts), guardada con su forma física (Fitness.academies): clases
 * que le quedan del bono y la última clase pagada, por su minuto absoluto de comienzo. Con eso, una clase se paga una
 * vez: volver a empezar en la misma (cortar y retomar, salir y entrar, recargar) no cobra otra.
 */
export interface Membership {
  pass: number;
  /** Minuto absoluto (día × 1440 + minuto) en que empezó la última clase pagada; -1 si ninguna. */
  paid: number;
  /** La cuota mensual, si se contrató alguna vez (data/academies.ts `monthly`). */
  plan?: Plan;
}

/**
 * Cuota mensual: del día `from` al `until` (incluido), un mes del calendario del juego. `auto`: se renueva sola al
 * vencer si hay dinero (desactivada al contratar). `keys`: los periodos ya pagados (academia:monthly:día de inicio):
 * volver a comprobar, dormir o cargar no cobra dos veces el mismo. `status`: activa, cancelada (sin renovación, con
 * acceso hasta `until`) o vencida (sin acceso; se renueva a mano desde el día en que se paga).
 */
export interface Plan {
  from: number;
  until: number;
  auto: boolean;
  keys: string[];
  status: 'active' | 'cancelled' | 'lapsed';
}

export const NO_MEMBERSHIP: Membership = { pass: 0, paid: -1 };

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** El comienzo de la clase en la que aún se puede entrar ahora (minuto absoluto), o null si no hay ninguna abierta. */
export function classSlot(a: AcademyDef, absMinute: number): number | null {
  // El reloj de la escena lleva decimales: la clase se cuenta por minutos enteros, o la misma clase no se reconoce al
  // compararla con la guardada (que se lee redondeada) y se cobraría otra vez.
  const now = Math.floor(absMinute);
  const minute = ((now % 1440) + 1440) % 1440;
  const [open, close] = a.hours.map((h) => h * 60);
  if (minute < open || minute >= close) return null;
  const offset = (minute - open) % a.every;
  return offset < a.grace ? now - offset : null;
}

/**
 * La clase que se está dando ahora (su comienzo), se pueda entrar aún o no. Para quien ya la pagó, la reserva vale
 * mientras dure: puede volver a ella (recargar, salir y entrar) sin pagar, también pasado el margen de entrada.
 */
export function currentClass(a: AcademyDef, absMinute: number): number | null {
  const now = Math.floor(absMinute);
  const minute = ((now % 1440) + 1440) % 1440;
  const [open, close] = a.hours.map((h) => h * 60);
  if (minute < open || minute >= close) return null;
  return now - ((minute - open) % a.every);
}

/** Si la clase de ahora ya la tiene pagada (reserva válida). */
export const holdsClass = (a: AcademyDef, m: Membership, absMinute: number): boolean => m.paid >= 0 && m.paid === currentClass(a, absMinute);

export type Charge =
  | { ok: true; via: 'paid' | 'plan' | 'pass' | 'fee'; money: number; membership: Membership; message: string }
  | { ok: false; message: string };

/** Entrar en la clase de ahora: ya pagada, con una del bono o pagando la suelta. Sin dinero ni bono, no. */
export function charge(a: AcademyDef, m: Membership, money: number, absMinute: number): Charge {
  // Ya pagada y aún en curso: se vuelve sin pagar, aunque haya pasado el margen de entrada.
  if (holdsClass(a, m, absMinute)) return { ok: true, via: 'paid', money, membership: m, message: 'Esta clase ya la tienes pagada.' };
  const slot = classSlot(a, absMinute);
  if (slot === null) return { ok: false, message: 'Ahora no empieza ninguna clase.' };
  // Con la cuota del mes, la clase no cuesta nada (y queda reservada como cualquier pagada).
  if (covered(m, Math.floor(absMinute / 1440) + 1)) return { ok: true, via: 'plan', money, membership: { ...m, paid: slot }, message: 'Clase incluida en tu cuota.' };
  if (m.pass > 0) return { ok: true, via: 'pass', money, membership: { pass: m.pass - 1, paid: slot }, message: `Una clase del bono: te quedan ${m.pass - 1}.` };
  if (money < a.fee) return { ok: false, message: `La clase cuesta €${a.fee}; no te llega.` };
  return { ok: true, via: 'fee', money: round2(money - a.fee), membership: { ...m, paid: slot }, message: `Clase pagada: €${a.fee}.` };
}

// ------------------------------------------------------------------ cuota mensual

const daysIn = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * El mes que cubre una cuota que empieza el día `from`: hasta la víspera del mismo día del mes siguiente; si el mes
 * siguiente no tiene ese día (un 31, un 30 hacia febrero), hasta su último día. Calendario del juego, no 30 días.
 */
export function periodFrom(from: number): { from: number; until: number } {
  const d = dateOf(from);
  const y = d.month === 12 ? d.year + 1 : d.year;
  const m = d.month === 12 ? 1 : d.month + 1;
  return { from, until: d.dom <= daysIn(y, m) ? dayOfDate(y, m, d.dom) - 1 : dayOfDate(y, m, daysIn(y, m)) };
}

/** Si la cuota cubre ese día (activa o cancelada pero aún pagada). */
export const covered = (m: Membership, day: number): boolean => !!m.plan && m.plan.status !== 'lapsed' && day >= m.plan.from && day <= m.plan.until;

const periodKey = (a: AcademyDef, from: number): string => `${a.id}:monthly:${from}`;

/**
 * Contratar (o renovar a mano, ya vencida) la cuota desde hoy: el mes completo, con dinero. Con una cuota que aún cubre
 * hoy, no: no se paga dos veces el mismo tiempo. Renovar a mano no cobra los meses en que no hubo cuota.
 */
export function subscribe(a: AcademyDef, m: Membership, money: number, day: number): { ok: true; money: number; membership: Membership; from: number; until: number; message: string } | { ok: false; message: string } {
  if (!a.monthly) return { ok: false, message: 'Aquí no hay cuota mensual.' };
  if (covered(m, day)) return { ok: false, message: 'Ya tienes la cuota pagada para hoy.' };
  const p = periodFrom(day);
  const key = periodKey(a, p.from);
  if (m.plan?.keys.includes(key)) return { ok: false, message: 'Ese periodo ya está pagado.' };
  if (money < a.monthly.price) return { ok: false, message: `La cuota cuesta €${a.monthly.price}; no te llega.` };
  const plan: Plan = { ...p, auto: false, keys: [...(m.plan?.keys ?? []), key].slice(-24), status: 'active' };
  return { ok: true, money: round2(money - a.monthly.price), membership: { ...m, plan }, ...p, message: `Cuota pagada: €${a.monthly.price}.` };
}

/** Renovación automática: activarla o cancelarla. Cancelar no quita el acceso hasta el final de lo pagado. */
export function setAutoRenew(m: Membership, on: boolean): Membership {
  if (!m.plan || m.plan.status === 'lapsed') return m;
  return { ...m, plan: { ...m.plan, auto: on, status: on ? 'active' : 'cancelled' } };
}

/**
 * Al pasar los días (dormir, saltar varios, cargar partida): cuotas vencidas. Con renovación automática y dinero, el mes
 * siguiente, y el otro si también pasó; sin dinero, vencida y sin deuda. Sin renovación, vencida. Idempotente: cada
 * periodo tiene su ficha y no se cobra dos veces aunque se llame mil.
 */
export function settlePlan(a: AcademyDef, m: Membership, money: number, day: number): { membership: Membership; money: number; charged: { from: number; until: number; amount: number }[]; lapsed: boolean } {
  const charged: { from: number; until: number; amount: number }[] = [];
  let plan = m.plan;
  if (!plan || !a.monthly || plan.status === 'lapsed' || day <= plan.until) return { membership: m, money, charged, lapsed: false };
  let cash = money;
  while (plan.until < day) {
    if (!plan.auto) {
      plan = { ...plan, status: 'lapsed' };
      break;
    }
    const next = periodFrom(plan.until + 1);
    const key = periodKey(a, next.from);
    if (plan.keys.includes(key)) {
      plan = { ...plan, ...next };
      continue;
    }
    if (cash < a.monthly.price) {
      plan = { ...plan, auto: false, status: 'lapsed' };
      break;
    }
    cash = round2(cash - a.monthly.price);
    charged.push({ ...next, amount: a.monthly.price });
    plan = { ...plan, ...next, keys: [...plan.keys, key].slice(-24) };
  }
  return { membership: { ...m, plan }, money: cash, charged, lapsed: plan.status === 'lapsed' };
}

/** Comprar el bono: se suma a lo que quede. Sin dinero, no. */
export function buyPass(a: AcademyDef, m: Membership, money: number): { ok: true; money: number; membership: Membership; message: string } | { ok: false; message: string } {
  if (money < a.pass.price) return { ok: false, message: `El bono cuesta €${a.pass.price}; no te llega.` };
  const pass = m.pass + a.pass.classes;
  return { ok: true, money: round2(money - a.pass.price), membership: { ...m, pass }, message: `Bono de ${a.pass.classes} clases: €${a.pass.price}. Te quedan ${pass}.` };
}

/** Lee una ficha guardada: lo que no cuadre vuelve a sin bono ni clase pagada; nunca rompe la carga. */
export function parseMembership(v: unknown): Membership {
  if (typeof v !== 'object' || v === null) return { ...NO_MEMBERSHIP };
  const r = v as Record<string, unknown>;
  const int = (x: unknown, lo: number, hi: number, fallback: number): number => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : fallback);
  const base: Membership = { pass: int(r.pass, 0, 1000, 0), paid: int(r.paid, -1, Number.MAX_SAFE_INTEGER, -1) };
  // La cuota, si la hay y tiene sentido; una mal formada se descarta (sin cuota, nada que cobrar).
  const p = r.plan as Record<string, unknown> | undefined;
  if (!p || typeof p !== 'object') return base;
  const from = int(p.from, 1, Number.MAX_SAFE_INTEGER, 0);
  const until = int(p.until, 1, Number.MAX_SAFE_INTEGER, 0);
  const status = p.status === 'active' || p.status === 'cancelled' || p.status === 'lapsed' ? p.status : null;
  if (!from || !until || until < from || !status) return base;
  const keys = Array.isArray(p.keys) ? p.keys.filter((k): k is string => typeof k === 'string').slice(-24) : [];
  return { ...base, plan: { from, until, auto: p.auto === true && status !== 'lapsed', keys, status } };
}
