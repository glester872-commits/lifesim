// Sin Phaser: lo usan GameState y SaveSystem, y lo prueban scripts/check-household.ts y simulate-budget.ts.
import { CREDIT } from '../data/credit.ts';
import { GRACE_DAYS } from '../data/household.ts';
import { formatDateShort } from './Calendar.ts';
import { euros } from './Commerce.ts';
import {
  pay, recordMovement, statusOf as billStatus, sync, unpaid, type HouseholdState, type Movement, type MovementType, type ObligationStatus,
} from './Household.ts';
import { levelOf, scheduled, situationFor, work, type JobProgress } from './Jobs.ts';

/**
 * Micropréstamo (data/credit.ts). Funciones puras: quien las usa aplica el resultado (GameState.applyCredit o
 * commitCredit), que apunta cada movimiento con un id fijo (`loan:<id>:principal`, `loan:<id>:<n>`, `loan:<id>:cancel`).
 *
 * Cuotas con el patrón de Household.sync: la cuota n (1…installments) se anuncia el día `since + (n−1)·every` y vence al
 * acabar el día `since + n·every − 1`. `generated` dice cuántas hay ya: repasar, dormir, saltar días o recargar no crea
 * una de más. Una cuota sin pagar espera; pasado GRACE_DAYS lleva un recargo único (CREDIT.lateFee) y nada más.
 * Nada se cobra solo y el dinero nunca baja de 0.
 */

export interface LoanObligation {
  /** Número de cuota, desde 1. */
  n: number;
  /** Último día para pagar sin retraso. */
  due: number;
  amount: number;
  /** Recargo ya aplicado (0 si no). */
  fee: number;
  /** Día en que se pagó (o se liquidó con el préstamo). */
  paid?: number;
}

export interface Loan {
  /** `c<día en que se pidió>`. */
  id: string;
  since: number;
  principal: number;
  cost: number;
  installments: number;
  every: number;
  generated: number;
  obligations: LoanObligation[];
  status: 'active' | 'repaid' | 'cancelled';
}

export interface CreditState {
  loans: Loan[];
  /** Primer día en que se puede pedir otro. */
  cooldownUntil: number;
}

export interface CreditInput {
  job: JobProgress | null;
  household: HouseholdState;
  credit: CreditState;
  today: number;
}

/** Lo que se apunta en el ledger al aplicar un resultado. */
export interface CreditEntry {
  movementId: string;
  label: string;
  type: MovementType;
  source: string;
}

export interface CreditResult {
  ok: boolean;
  reason?: 'blocked' | 'no-loan' | 'not-due' | 'paid' | 'insufficient';
  message: string;
  credit: CreditState;
  money: number;
  /** Sólo si ok. */
  entry?: CreditEntry;
}

/** Préstamos cerrados que se conservan. */
const KEEP_CLOSED = 3;
const cents = (n: number): number => Math.round(n * 100) / 100;

export const emptyCredit = (): CreditState => ({ loans: [], cooldownUntil: 0 });
export const activeLoan = (c: CreditState): Loan | undefined => c.loans.find((l) => l.status === 'active');

const principalShare = (l: Loan): number => cents(l.principal / l.installments);
const costShare = (l: Loan): number => cents(l.cost / l.installments);
// ponytail: reparto exacto con las cifras de data/credit.ts; con importes que no dividen, la última cuota debería absorber el resto.
export const installmentOf = (l: Loan): number => cents(principalShare(l) + costShare(l));
export const totalOf = (o: LoanObligation): number => cents(o.amount + o.fee);

/** Mismo criterio que Household.statusOf. */
export function loanStatus(o: LoanObligation, today: number): ObligationStatus {
  if (o.paid !== undefined) return 'paid';
  if (today < o.due) return 'upcoming';
  if (today === o.due) return 'today';
  return today <= o.due + GRACE_DAYS ? 'overdue' : 'late';
}

/** Por qué no se puede pedir ahora, o null. */
export function creditBlocker(i: CreditInput): string | null {
  if (!i.job || i.job.status !== 'active') return 'El préstamo sólo se ofrece con un contrato activo.';
  // Decisión «solo tras ascenso» (BALANCE-LV10.md): el nivel 0 no ahorra; el préstamo no tapa el bucle básico.
  if (i.job.level < 1) return 'El préstamo sólo se ofrece tras un ascenso en tu contrato.';
  if (activeLoan(i.credit)) return 'Ya tienes un préstamo abierto: termina de pagarlo o liquídalo antes.';
  if (i.today < i.credit.cooldownUntil) return `Podrás pedir otro el ${formatDateShort(i.credit.cooldownUntil)}.`;
  if (i.household.obligations.some((o) => billStatus(o, i.today) === 'late')) return 'Tienes un pago de casa con retraso: ponlo al día antes.';
  return null;
}

/** Pone al día las cuotas del préstamo abierto: crea cada una una sola vez y aplica el recargo único. */
export function syncCredit(c: CreditState, today: number): { credit: CreditState; news: LoanObligation[]; fined: LoanObligation[] } {
  const out = structuredClone(c);
  const news: LoanObligation[] = [];
  const fined: LoanObligation[] = [];
  const loan = activeLoan(out);
  if (loan) {
    for (let n = loan.generated + 1; n <= loan.installments && loan.since + (n - 1) * loan.every <= today; n++) {
      const o: LoanObligation = { n, due: loan.since + n * loan.every - 1, amount: installmentOf(loan), fee: 0 };
      loan.obligations.push(o);
      loan.generated = n;
      news.push(o);
    }
    for (const o of loan.obligations) {
      if (CREDIT.lateFee && !o.fee && loanStatus(o, today) === 'late') {
        o.fee = CREDIT.lateFee;
        fined.push(o);
      }
    }
  }
  return { credit: out, news, fined };
}

/** Abre el préstamo de la oferta (sin mirar el bloqueo: eso es de take). */
function open(c: CreditState, today: number): CreditState {
  const out = structuredClone(c);
  out.loans = out.loans.filter((l) => l.status !== 'active').slice(-KEEP_CLOSED);
  out.loans.push({
    id: `c${today}`, since: today, principal: CREDIT.principal, cost: CREDIT.cost, installments: CREDIT.installments, every: CREDIT.every,
    generated: 0, obligations: [], status: 'active',
  });
  return syncCredit(out, today).credit;
}

function close(c: CreditState, loan: Loan, status: 'repaid' | 'cancelled', today: number): void {
  loan.status = status;
  c.cooldownUntil = today + CREDIT.cooldown;
}

const entryOf = (l: Loan, key: string, label: string): CreditEntry => ({ movementId: `loan:${l.id}:${key}`, label, type: 'loan', source: `loan:${l.id}` });
const lastWithdrawalDay = (l: Loan): number => l.since + CREDIT.withdrawalDays - 1;

/** Pedir el préstamo: suma el principal. */
export function take(i: CreditInput, money: number): CreditResult {
  const why = creditBlocker(i);
  if (why) return { ok: false, reason: 'blocked', message: why, credit: i.credit, money };
  const credit = open(i.credit, i.today);
  const loan = activeLoan(credit)!;
  return {
    ok: true,
    message: `Recibes ${euros(loan.principal)}. Devuelves ${euros(loan.principal + loan.cost)} (coste fijo ${euros(loan.cost)}) en ${loan.installments} cuotas semanales de ${euros(installmentOf(loan))}. ` +
      `Hasta el ${formatDateShort(lastWithdrawalDay(loan))} puedes devolverlo entero sin coste.`,
    credit, money: cents(money + loan.principal), entry: entryOf(loan, 'principal', 'Préstamo recibido'),
  };
}

/** Pagar la cuota n con la cartera. Si no llega, nada cambia y se dice cuánto falta. */
export function payInstallment(c: CreditState, money: number, n: number, today: number): CreditResult {
  const fail = (reason: CreditResult['reason'], message: string): CreditResult => ({ ok: false, reason, message, credit: c, money });
  const out = syncCredit(c, today).credit;
  const loan = activeLoan(out);
  if (!loan) return fail('no-loan', 'No tienes ningún préstamo abierto.');
  const o = loan.obligations.find((x) => x.n === n);
  if (!o) return fail('not-due', 'Esa cuota aún no ha llegado.');
  if (o.paid !== undefined) return fail('paid', 'Esa cuota ya está pagada.');
  const amount = totalOf(o);
  if (money + 1e-9 < amount) {
    const margin = CREDIT.lateFee && !o.fee && today <= o.due + GRACE_DAYS ? ` Tienes hasta el ${formatDateShort(o.due + GRACE_DAYS)} antes de un recargo único de ${euros(CREDIT.lateFee)}.` : '';
    return fail('insufficient', `Te faltan ${euros(amount - money)} para la cuota ${n}. La cuota espera: nadie suma intereses.${margin}`);
  }
  o.paid = today;
  const done = loan.generated === loan.installments && loan.obligations.every((x) => x.paid !== undefined);
  if (done) close(out, loan, 'repaid', today);
  return {
    ok: true, message: `Cuota ${n}/${loan.installments} pagada: ${euros(amount)}.${done ? ' Préstamo devuelto entero.' : ''} Te quedan ${euros(money - amount)}.`,
    credit: out, money: cents(money - amount), entry: entryOf(loan, String(n), `Cuota ${n}/${loan.installments} del préstamo`),
  };
}

/**
 * Lo que cuesta cerrar hoy el préstamo abierto (ya al día con syncCredit). En el desistimiento, el principal menos lo ya
 * pagado (coste €0); después, el principal pendiente más el coste y los recargos de las cuotas ya generadas sin pagar:
 * el coste de las que aún no se han generado no se cobra.
 */
function closingAmount(l: Loan, today: number): number {
  const paid = l.obligations.filter((o) => o.paid !== undefined);
  if (today <= lastWithdrawalDay(l)) return Math.max(0, cents(l.principal - paid.reduce((s, o) => s + o.amount, 0)));
  const owing = l.obligations.filter((o) => o.paid === undefined);
  return cents(l.principal - paid.length * principalShare(l) + owing.length * costShare(l) + owing.reduce((s, o) => s + o.fee, 0));
}

/** Cuánto costaría cancelarlo hoy, o null sin préstamo abierto. */
export function cancelQuote(c: CreditState, today: number): number | null {
  const loan = activeLoan(syncCredit(c, today).credit);
  return loan ? closingAmount(loan, today) : null;
}

/** Desistimiento (los CREDIT.withdrawalDays primeros días, coste €0) o liquidación anticipada. */
export function cancel(c: CreditState, money: number, today: number): CreditResult {
  const out = syncCredit(c, today).credit;
  const loan = activeLoan(out);
  if (!loan) return { ok: false, reason: 'no-loan', message: 'No tienes ningún préstamo abierto.', credit: c, money };
  const amount = closingAmount(loan, today);
  if (money + 1e-9 < amount) return { ok: false, reason: 'insufficient', message: `Te faltan ${euros(amount - money)} para devolverlo hoy. Las cuotas siguen como estaban.`, credit: c, money };
  const withdrawal = today <= lastWithdrawalDay(loan);
  for (const o of loan.obligations) o.paid ??= today;
  close(out, loan, 'cancelled', today);
  return {
    ok: true, message: `${withdrawal ? 'Desistes del préstamo' : 'Liquidas el préstamo'}: ${euros(amount)}. Te quedan ${euros(money - amount)}.`,
    credit: out, money: cents(money - amount), entry: entryOf(loan, 'cancel', withdrawal ? 'Préstamo devuelto (desistimiento)' : 'Préstamo liquidado'),
  };
}

// ------------------------------------------------------------ aplicar

/** Lo que hay que apuntar de un resultado, o null si no es ok o su id ya está en el ledger (ya aplicado: ni dinero ni línea). */
export function pendingEntry(r: CreditResult, ledger: readonly Movement[]): CreditEntry | null {
  return r.ok && r.entry && !ledger.some((l) => l.movementId === r.entry!.movementId) ? r.entry : null;
}

export interface CreditBook {
  money: number;
  credit: CreditState;
  ledger: Movement[];
}

/**
 * Aplica un resultado a cartera, préstamo y ledger, una sola vez (misma guarda que GameState.applyCredit).
 * ponytail: la guarda es el id del ledger vivo (LEDGER_SIZE); un resultado viejo reaplicado tras expulsarse su línea
 * no se detecta aquí. Recalcular la operación sobre el estado nuevo sí lo rechaza (cuota ya pagada).
 */
export function commitCredit(book: CreditBook, r: CreditResult, at: { day: number; hour: number; minute: number }): CreditBook {
  const e = pendingEntry(r, book.ledger);
  if (!e) return book;
  const ledger = structuredClone(book.ledger);
  recordMovement(ledger, { ...at, ...e, amount: cents(r.money - book.money) });
  return { money: r.money, credit: structuredClone(r.credit), ledger };
}

// ------------------------------------------------------------ vista

/** Texto de estado para el móvil (Fase 3b): cuánto se debe, la próxima cuota y si va al día. */
export function creditView(c: CreditState, today: number): string {
  const synced = syncCredit(c, today).credit;
  const loan = activeLoan(synced);
  if (!loan) return c.cooldownUntil > today ? `Sin préstamo. Podrás pedir otro el ${formatDateShort(c.cooldownUntil)}.` : 'Sin préstamo.';
  const pending = loan.obligations.filter((o) => o.paid === undefined).sort((a, b) => a.due - b.due);
  const owed = cents(pending.reduce((s, o) => s + totalOf(o), 0) + (loan.installments - loan.generated) * installmentOf(loan));
  const next = pending[0];
  const parts = [`Debes ${euros(owed)} del préstamo de ${euros(loan.principal)}.`];
  if (next) {
    const s = loanStatus(next, today);
    const when = s === 'upcoming' ? `vence el ${formatDateShort(next.due)}` : s === 'today' ? 'vence hoy' : `venció el ${formatDateShort(next.due)}`;
    parts.push(`Próxima cuota: ${next.n}/${loan.installments}, ${euros(totalOf(next))}, ${when}.`);
  } else {
    const n = loan.generated + 1;
    parts.push(`Próxima cuota: ${n}/${loan.installments}, ${euros(installmentOf(loan))}, vence el ${formatDateShort(loan.since + n * loan.every - 1)}.`);
  }
  const states = pending.map((o) => loanStatus(o, today));
  if (states.includes('late')) parts.push(`Con retraso: recargo único de ${euros(CREDIT.lateFee)} aplicado; no sube más.`);
  else if (states.includes('overdue')) parts.push(`Con retraso: tienes hasta el ${formatDateShort(next!.due + GRACE_DAYS)} antes de un recargo único de ${euros(CREDIT.lateFee)}.`);
  else parts.push('Al día.');
  const quote = closingAmount(loan, today);
  parts.push(today <= lastWithdrawalDay(loan) ? `Hasta el ${formatDateShort(lastWithdrawalDay(loan))} puedes devolverlo sin coste: ${euros(quote)}.` : `Liquidarlo hoy: ${euros(quote)}.`);
  return parts.join(' ');
}

// ------------------------------------------------------------ simulación

export interface CreditSimInput {
  job: JobProgress;
  household: HouseholdState;
  money: number;
  today: number;
  /** Gasto de cada día (comida), si llega. */
  daily?: number;
  /** Ida y vuelta al trabajo por turno. */
  commute?: number;
  /** Importes de casa (Housing.rentsOf). */
  amounts?: Readonly<Record<string, number>>;
}

export interface CreditScenario {
  name: 'favorable' | 'intermedio' | 'desfavorable';
  installment: number;
  /** Coste fijo más recargos. */
  totalCost: number;
  finalMoney: number;
  /** Lo que queda por devolver al acabar. */
  remaining: number;
  houseLate: boolean;
  loanLate: boolean;
}

/**
 * El préstamo pedido hoy y CREDIT.term días con el contrato: todos los turnos, uno perdido por semana o ninguno. Paga
 * casa y cuotas al vencer si llega, con las funciones del juego (work, sync, pay, syncCredit, payInstallment).
 */
export function simulateCredit(i: CreditSimInput): CreditScenario[] {
  return (['favorable', 'intermedio', 'desfavorable'] as const).map((name) => {
    let credit = open(emptyCredit(), i.today);
    const id = activeLoan(credit)!.id;
    let cash = cents(i.money + activeLoan(credit)!.principal);
    let house = i.household;
    let job = i.job;
    let houseLate = false;
    let loanLate = false;
    const missedWeek = new Set<number>();
    for (let day = i.today; day < i.today + CREDIT.term; day++) {
      house = sync(house, day, i.amounts).household;
      credit = syncCredit(credit, day).credit;
      if (i.daily && cash + 1e-9 >= i.daily) cash = cents(cash - i.daily);
      if (scheduled(job, day)) {
        const week = Math.floor((day - i.today) / 7);
        let go = name === 'favorable';
        if (name === 'intermedio') {
          go = missedWeek.has(week);
          missedWeek.add(week);
        }
        const commute = i.commute ?? 0;
        if (go && cash + 1e-9 >= commute) {
          const out = work(job, (day - 1) * 1440 + levelOf(job).start * 60, situationFor(job, day).choices[0]);
          job = out.progress;
          cash = cents(cash - commute + out.money);
        }
      }
      for (const o of unpaid(house).filter((x) => x.due <= day)) {
        const r = pay(house, cash, o.bill, o.period, day);
        if (r.ok) [house, cash] = [r.household, r.money];
      }
      for (const o of activeLoan(credit)?.obligations.filter((x) => x.paid === undefined && x.due <= day) ?? []) {
        const r = payInstallment(credit, cash, o.n, day);
        if (r.ok) [credit, cash] = [r.credit, r.money];
      }
      if (unpaid(house).some((o) => billStatus(o, day) === 'late')) houseLate = true;
      if (activeLoan(credit)?.obligations.some((o) => loanStatus(o, day) === 'late')) loanLate = true;
    }
    const loan = credit.loans.find((l) => l.id === id)!;
    const left = loan.obligations.filter((o) => o.paid === undefined);
    return {
      name, installment: installmentOf(loan), totalCost: cents(loan.cost + loan.obligations.reduce((s, o) => s + o.fee, 0)), finalMoney: cash,
      remaining: cents(left.reduce((s, o) => s + totalOf(o), 0) + (loan.installments - loan.generated) * installmentOf(loan)), houseLate, loanLate,
    };
  });
}

// ------------------------------------------------------------ guardado

const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);
const isAmount = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;

/** Un préstamo guardado, o null si está dañado (ese préstamo no se conserva). */
function parseLoan(raw: unknown, today: number): Loan | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const l = raw as Record<string, unknown>;
  if (typeof l.id !== 'string' || !/^c\d+$/.test(l.id) || !isInt(l.since) || l.since < 1 || l.since > today) return null;
  if (!isAmount(l.principal) || !isAmount(l.cost) || !isInt(l.installments) || l.installments < 1 || !isInt(l.every) || l.every < 1) return null;
  if (!isInt(l.generated) || l.generated < 0 || l.generated > l.installments || !Array.isArray(l.obligations) || l.obligations.length !== l.generated) return null;
  if (l.status !== 'active' && l.status !== 'repaid' && l.status !== 'cancelled') return null;
  const obligations: LoanObligation[] = [];
  for (const ro of l.obligations) {
    const o = ro as Record<string, unknown> | null;
    if (!o || !isInt(o.n) || o.n < 1 || o.n > l.generated || obligations.some((x) => x.n === o.n)) return null;
    if (!isInt(o.due) || !isAmount(o.amount) || !isAmount(o.fee) || (o.paid !== undefined && !isInt(o.paid))) return null;
    obligations.push({ n: o.n, due: o.due, amount: o.amount, fee: o.fee, ...(isInt(o.paid) ? { paid: o.paid } : {}) });
  }
  return { id: l.id, since: l.since, principal: l.principal, cost: l.cost, installments: l.installments, every: l.every, generated: l.generated, obligations, status: l.status };
}

/**
 * Lo guardado, validado por préstamo: los válidos se conservan y sólo se descarta el dañado (o el id repetido, o un
 * segundo préstamo vivo). Si se descarta alguno, el cooldown queda como mínimo en today + CREDIT.cooldown, para que un
 * guardado roto no dé permiso para pedir otro enseguida. El dinero nunca se toca aquí.
 */
export function parseCredit(v: unknown, today: number): CreditState {
  if (typeof v !== 'object' || v === null) return emptyCredit();
  const s = v as Record<string, unknown>;
  const loans: Loan[] = [];
  let dropped = false;
  for (const raw of Array.isArray(s.loans) ? s.loans : []) {
    const loan = parseLoan(raw, today);
    if (!loan || loans.some((x) => x.id === loan.id || (x.status === 'active' && loan.status === 'active'))) {
      dropped = true;
      continue;
    }
    loans.push(loan);
  }
  const cooldown = isInt(s.cooldownUntil) && s.cooldownUntil >= 0 ? Math.min(s.cooldownUntil, today + CREDIT.cooldown) : 0;
  return { loans, cooldownUntil: dropped ? Math.max(cooldown, today + CREDIT.cooldown) : cooldown };
}
