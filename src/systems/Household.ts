// Sin Phaser: lo usan main.ts, el móvil, SaveSystem y scripts/check-household.ts y simulate-budget.ts.
import { BILLS, GOALS, GRACE_DAYS, type BillDef, type GoalDef } from '../data/household.ts';
import { getGarment, getStore } from '../data/retail.ts';
import { formatDateShort } from './Calendar.ts';
import { euros } from './Commerce.ts';

/**
 * Gastos de casa: alquiler y suministros. Cada gasto (data/household.ts) se
 * genera una vez por periodo, con su vencimiento al acabar el último día, y se
 * paga a mano desde el móvil con el dinero de la cartera. Funciones puras: quien
 * las usa aplica el resultado a GameState.
 *
 * El periodo k de un gasto empieza el día `since + k·every` (ese día se anuncia:
 * importe y vencimiento) y vence al final del día `since + (k+1)·every − 1`.
 * `generated` dice cuántos periodos de cada gasto se han creado ya: repasar el
 * calendario dos veces, recargar o saltar varios días no crea uno de más.
 *
 * Si no llega, la obligación espera: hay GRACE_DAYS de margen y luego, como mucho,
 * un recargo único. Nada de intereses, saldo negativo ni desahucio.
 */

export interface Obligation {
  bill: string;
  period: number;
  /** Último día para pagar sin retraso (vence al acabar ese día). */
  due: number;
  amount: number;
  /** Recargo ya aplicado (0 si no). */
  fee: number;
  /** Día en que se pagó. */
  paid?: number;
}

export interface HouseholdState {
  /** Día en que empiezan los periodos: el primero de la partida o el de cargar una partida antigua. */
  since: number;
  /** gasto → periodos ya creados. */
  generated: Record<string, number>;
  obligations: Obligation[];
  /** Meta de ahorro elegida (data/household.ts GOALS), o null. */
  goal: string | null;
}

export type ObligationStatus = 'paid' | 'upcoming' | 'today' | 'overdue' | 'late';

/** Pagadas que se conservan para el historial del móvil. */
const KEEP_PAID = 6;
const cents = (n: number): number => Math.round(n * 100) / 100;

export const billOf = (o: Obligation): BillDef => {
  const b = BILLS.find((x) => x.id === o.bill);
  if (!b) throw new Error(`Gasto desconocido: ${o.bill}`);
  return b;
};

export const total = (o: Obligation): number => cents(o.amount + o.fee);

export function startHousehold(today: number): HouseholdState {
  return { since: today, generated: {}, obligations: [], goal: null };
}

export function statusOf(o: Obligation, today: number): ObligationStatus {
  if (o.paid !== undefined) return 'paid';
  if (today < o.due) return 'upcoming';
  if (today === o.due) return 'today';
  return today <= o.due + GRACE_DAYS ? 'overdue' : 'late';
}

/** Lo que falta por pagar, en orden de vencimiento. */
export const unpaid = (h: HouseholdState): Obligation[] => h.obligations.filter((o) => o.paid === undefined).sort((a, b) => a.due - b.due);

export const owed = (h: HouseholdState): number => cents(unpaid(h).reduce((s, o) => s + total(o), 0));

/**
 * Pone al día los gastos hasta hoy: crea (anuncia) cada periodo que ya empezó y
 * aplica el recargo único a lo que pasó del margen. `news` son los anunciados
 * ahora y `fined` los que acaban de recibir recargo, para contarlos una vez.
 */
export function sync(h: HouseholdState, today: number, amounts: Readonly<Record<string, number>> = {}): { household: HouseholdState; news: Obligation[]; fined: Obligation[] } {
  const out: HouseholdState = structuredClone(h);
  const news: Obligation[] = [];
  const fined: Obligation[] = [];
  for (const bill of BILLS) {
    for (let k = out.generated[bill.id] ?? 0; out.since + k * bill.every <= today; k++) {
      const o: Obligation = { bill: bill.id, period: k, due: out.since + (k + 1) * bill.every - 1, amount: amounts[bill.id] ?? bill.amount, fee: 0 };
      out.obligations.push(o);
      out.generated[bill.id] = k + 1;
      news.push(o);
    }
  }
  for (const o of out.obligations) {
    const fee = billOf(o).lateFee ?? 0;
    if (fee && !o.fee && statusOf(o, today) === 'late') {
      o.fee = fee;
      fined.push(o);
    }
  }
  const paid = out.obligations.filter((o) => o.paid !== undefined).sort((a, b) => b.paid! - a.paid!);
  const drop = new Set(paid.slice(KEEP_PAID));
  out.obligations = out.obligations.filter((o) => !drop.has(o));
  return { household: out, news, fined };
}

export interface PayResult {
  ok: boolean;
  message: string;
  household: HouseholdState;
  money: number;
}

/** Pagar una obligación entera con la cartera. Con el saldo justo, se puede; sin él, sigue pendiente y se dice qué hacer. */
export function pay(h: HouseholdState, money: number, bill: string, period: number, today: number): PayResult {
  const o = h.obligations.find((x) => x.bill === bill && x.period === period);
  if (!o) return { ok: false, message: 'Ese pago no existe.', household: h, money };
  if (o.paid !== undefined) return { ok: false, message: 'Ya está pagado.', household: h, money };
  const amount = total(o);
  if (money + 1e-9 < amount) return { ok: false, message: shortfall(o, money, today), household: h, money };
  const out = structuredClone(h);
  out.obligations.find((x) => x.bill === bill && x.period === period)!.paid = today;
  return { ok: true, message: `${billOf(o).name} pagado: ${euros(amount)}. Te quedan ${euros(money - amount)}.`, household: out, money: cents(money - amount) };
}

/** Si no llega: cuánto falta, hasta cuándo sin recargo y cómo conseguirlo. */
export function shortfall(o: Obligation, money: number, today: number): string {
  const bill = billOf(o);
  const missing = euros(total(o) - money);
  const last = o.due + GRACE_DAYS;
  const margin = bill.lateFee && !o.fee && today <= last ? ` Tienes hasta el ${formatDateShort(last)} antes de un recargo único de ${euros(bill.lateFee)}.` : '';
  return `Te faltan ${missing}. La deuda espera: nadie te echa ni suma intereses.${margin} Un turno en el Decathlon (tu contrato o uno suelto) lo cubre.`;
}

export function dueLabel(o: Obligation, today: number): string {
  const s = statusOf(o, today);
  if (s === 'paid') return `pagado el ${formatDateShort(o.paid!)}`;
  if (s === 'upcoming') return `vence el ${formatDateShort(o.due)}`;
  if (s === 'today') return 'vence hoy';
  if (s === 'overdue') return `vencido · margen hasta el ${formatDateShort(o.due + GRACE_DAYS)}`;
  return `con retraso${o.fee ? ` · recargo ${euros(o.fee)}` : ''}`;
}

/** Cómo se cuenta un gasto al anunciarlo: importe, cada cuánto y vencimiento. */
export function announce(o: Obligation): string {
  const bill = billOf(o);
  return `${bill.name}: ${euros(bill.amount)} cada ${bill.every === 7 ? 'semana' : `${bill.every} días`}. Vence el ${formatDateShort(o.due)}. Se paga en el móvil, en Cuentas.`;
}

// --------------------------------------------------------------- metas

export interface GoalView {
  def: GoalDef;
  name: string;
  where: string;
  cost: number;
  /** Lo que queda libre: la cartera menos lo que se debe. */
  free: number;
  /** 0–1. */
  progress: number;
  owned: boolean;
}

export function goalView(def: GoalDef, money: number, h: HouseholdState, wardrobe: readonly string[]): GoalView {
  const store = getStore(def.store);
  const line = store.stock.find((s) => s.garment === def.garment);
  if (!line) throw new Error(`Meta ${def.id}: ${def.store} no vende ${def.garment}`);
  const free = cents(money - owed(h));
  return {
    def, name: getGarment(def.garment).name, where: store.name, cost: line.price, free,
    progress: Math.min(1, Math.max(0, free / line.price)), owned: wardrobe.includes(def.garment),
  };
}

export const goalById = (id: string | null): GoalDef | undefined => GOALS.find((g) => g.id === id);

/** Lo que se le dice al jugador de su meta: cuánto falta o, si ya llega, si comprarla ahora deja para pagar la casa. */
export function goalAdvice(v: GoalView, h: HouseholdState, today: number): string {
  if (v.owned) return `Ya tienes ${v.name.toLowerCase()}. Elige otra meta cuando quieras.`;
  if (v.free < v.cost) return `Te faltan ${euros(v.cost - v.free)} (lo que llevas menos lo que debes). Está en ${v.where}.`;
  const next = unpaid(h)[0] ?? null;
  const after = cents(v.free - v.cost);
  return `Ya te llega: está en ${v.where}. Si la compras, te quedan ${euros(after)} libres${next ? `; lo próximo es ${billOf(next).name.toLowerCase()}, ${euros(total(next))} (${dueLabel(next, today)})` : ''}. Esperar no cuesta nada.`;
}

// ------------------------------------------------------------ guardado

/** Lo guardado, validado. Sin nada (partida anterior a los gastos) empieza hoy: sólo periodos futuros, anunciados. */
export function parseHousehold(v: unknown, today: number): HouseholdState {
  if (typeof v !== 'object' || v === null) return startHousehold(today);
  const o = v as Record<string, unknown>;
  const int = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);
  if (!int(o.since) || o.since < 1) return startHousehold(today);
  const generated: Record<string, number> = {};
  if (typeof o.generated === 'object' && o.generated !== null) {
    for (const [k, n] of Object.entries(o.generated as Record<string, unknown>)) if (BILLS.some((b) => b.id === k) && int(n) && n >= 0) generated[k] = n;
  }
  const obligations: Obligation[] = [];
  for (const raw of Array.isArray(o.obligations) ? o.obligations : []) {
    const r = raw as Record<string, unknown> | null;
    if (!r || !BILLS.some((b) => b.id === r.bill) || !int(r.period) || !int(r.due) || typeof r.amount !== 'number' || typeof r.fee !== 'number') continue;
    if (r.amount < 0 || r.fee < 0 || obligations.some((x) => x.bill === r.bill && x.period === r.period)) continue;
    // Un periodo guardado sin estar en `generated` (tocado a mano) no se vuelve a crear.
    generated[r.bill as string] = Math.max(generated[r.bill as string] ?? 0, (r.period as number) + 1);
    obligations.push({ bill: r.bill as string, period: r.period, due: r.due, amount: r.amount, fee: r.fee, ...(int(r.paid) ? { paid: r.paid } : {}) });
  }
  return { since: o.since, generated, obligations, goal: typeof o.goal === 'string' && goalById(o.goal) ? o.goal : null };
}

// --------------------------------------------------------- movimientos

/**
 * Un movimiento de la cartera con su motivo (sueldo, alquiler, una compra). Lo apunta GameState al cambiar el
 * dinero, así que el importe es el cambio real: no se recalcula nada. Mismo motivo el mismo día, una línea.
 */
export interface Movement {
  day: number;
  hour: number;
  minute: number;
  label: string;
  amount: number;
}

export const LEDGER_SIZE = 40;

const QTY = /^(\d+) × (.+)$/;

/**
 * Apunta un movimiento (lo usa GameState al cambiar la cartera). El mismo motivo el mismo día suma en una línea; si el
 * motivo lleva cantidad («2 × Barra de pan»), la línea suma también la cantidad (AUD-005: antes quedaba «1 ×» con el
 * importe de dos). Se conservan los LEDGER_SIZE últimos.
 */
export function recordMovement(ledger: Movement[], m: Movement): void {
  const last = ledger.at(-1);
  const a = last ? QTY.exec(last.label) : null;
  const b = QTY.exec(m.label);
  const same = !!last && last.day === m.day && (last.label === m.label || (!!a && !!b && a[2] === b[2]));
  if (last && same) {
    last.amount = Math.round((last.amount + m.amount) * 100) / 100;
    last.hour = m.hour;
    last.minute = m.minute;
    if (a && b) last.label = `${Number(a[1]) + Number(b[1])} × ${a[2]}`;
    return;
  }
  ledger.push({ ...m, amount: Math.round(m.amount * 100) / 100 });
  if (ledger.length > LEDGER_SIZE) ledger.shift();
}

export function parseLedger(v: unknown): Movement[] {
  if (!Array.isArray(v)) return [];
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  return v.filter((m): m is Movement => typeof m === 'object' && m !== null && num(m.day) && num(m.hour) && num(m.minute) && num(m.amount) && typeof m.label === 'string')
    .map((m) => ({ day: m.day, hour: m.hour, minute: m.minute, label: m.label, amount: m.amount }))
    .slice(-LEDGER_SIZE);
}
