// Gastos de casa y metas (systems/Household): un cargo por periodo, pago exacto, insuficiente y repetido,
// recargar, saltos de reloj, partidas antiguas y progreso de la meta. `npm run check`.
import assert from 'node:assert/strict';
import { BILLS, GOALS, GRACE_DAYS } from '../src/data/household.ts';
import {
  goalAdvice, goalView, LEDGER_SIZE, owed, parseHousehold, parseLedger, pay, recordMovement, startHousehold, statusOf, sync, total, unpaid, type HouseholdState, type Movement,
} from '../src/systems/Household.ts';
import { createInitialState, SaveSystem } from '../src/systems/SaveSystem.ts';
import { SAVE_KEY } from '../src/config/constants.ts';
import { CREDIT } from '../src/data/credit.ts';
import { getJob } from '../src/data/jobs.ts';
import { hire, promote, quit } from '../src/systems/Jobs.ts';
import {
  activeLoan, cancel, commitCredit, creditBlocker, creditView, emptyCredit, parseCredit, payInstallment, syncCredit, take, type CreditInput, type CreditState,
} from '../src/systems/Credit.ts';

// AUD-005 (CV-08): dos compras iguales el mismo día suman importe y cantidad; otro producto u otro día, línea aparte.
{
  const ledger: Movement[] = [];
  const at = (day: number, minute: number, label: string, amount: number): Movement => ({ day, hour: 10, minute, label, amount });
  recordMovement(ledger, at(5, 0, '1 × Barra de pan', -0.9));
  recordMovement(ledger, at(5, 2, '1 × Barra de pan', -0.9));
  recordMovement(ledger, at(5, 3, '2 × Barra de pan', -1.8));
  assert.deepEqual(ledger.map((m) => [m.label, m.amount]), [['4 × Barra de pan', -3.6]], 'la cantidad de la línea no cuadra con su importe');
  recordMovement(ledger, at(5, 4, '1 × Sándwich envasado', -2.2));
  recordMovement(ledger, at(6, 0, '1 × Sándwich envasado', -2.2));
  recordMovement(ledger, at(6, 1, 'Alquiler', -45));
  recordMovement(ledger, at(6, 2, 'Alquiler', -10));
  assert.deepEqual(ledger.map((m) => [m.day, m.label, m.amount]), [[5, '4 × Barra de pan', -3.6], [5, '1 × Sándwich envasado', -2.2], [6, '1 × Sándwich envasado', -2.2], [6, 'Alquiler', -55]]);
}

// LV-10 · ids deterministas, fusión sólo con mismo tipo y origen, financieros aparte e idempotencia.
{
  const ledger: Movement[] = [];
  const at = (minute: number, label: string, amount: number, extra: Partial<Movement> = {}) => ({ day: 5, hour: 10, minute, label, amount, ...extra });
  const pan = recordMovement(ledger, at(0, '1 × Barra de pan', -0.9));
  assert.equal(pan, 'm-5-1');
  assert.equal(recordMovement(ledger, at(1, '1 × Barra de pan', -0.9)), pan, 'la línea fusionada conserva el id de la primera');
  assert.equal(recordMovement(ledger, at(2, '1 × Barra de pan', -0.9, { type: 'purchase' })), 'm-5-2', 'otro tipo, otra línea');
  assert.equal(recordMovement(ledger, at(3, '1 × Barra de pan', -0.9, { type: 'purchase', source: 'shop:super' })), 'm-5-3', 'otro origen, otra línea');
  const loans = [recordMovement(ledger, at(4, 'Préstamo', 50, { type: 'loan' })), recordMovement(ledger, at(4, 'Préstamo', 50, { type: 'loan' }))];
  assert.deepEqual(loans, ['m-5-4', 'm-5-5'], 'dos préstamos iguales el mismo día son dos líneas');
  assert.deepEqual(ledger.map((m) => [m.movementId, m.amount, m.type, m.source, m.status]), [
    ['m-5-1', -1.8, 'other', 'wallet', 'posted'], ['m-5-2', -0.9, 'purchase', 'wallet', 'posted'], ['m-5-3', -0.9, 'purchase', 'shop:super', 'posted'],
    ['m-5-4', 50, 'loan', 'wallet', 'posted'], ['m-5-5', 50, 'loan', 'wallet', 'posted'],
  ]);
  // Un id propio no se fusiona; repetirlo no duplica ni línea ni importe.
  assert.equal(recordMovement(ledger, at(5, 'Préstamo', 50, { type: 'loan', movementId: 'loan:a:1' })), 'loan:a:1');
  const before = structuredClone(ledger);
  assert.equal(recordMovement(ledger, at(6, 'Préstamo', 50, { type: 'loan', movementId: 'loan:a:1' })), 'loan:a:1');
  assert.deepEqual(ledger, before, 'un id ya apuntado no cambia nada');
  assert.equal(recordMovement(ledger, at(7, 'Préstamo', 50, { movementId: 'm-5-9' })), 'm-5-9');
  assert.equal(recordMovement(ledger, at(8, 'Café', -1.5)), 'm-5-10', 'el contador sigue al mayor sufijo del día');
  assert.ok(ledger.every((m) => /^(m-\d+-\d+|loan:a:1)$/.test(m.movementId)));
}
{
  // 60 apuntes el mismo día (más que LEDGER_SIZE): ningún id se repite, ni vivo ni ya visto.
  const ledger: Movement[] = [];
  const ids: string[] = [];
  for (let i = 0; i < 60; i++) ids.push(recordMovement(ledger, { day: 9, hour: 12, minute: i % 60, label: `Cosa ${i}`, amount: -1 }));
  assert.equal(new Set(ids).size, 60);
  assert.ok(ids.every((id, i) => id === `m-9-${i + 1}`));
  assert.equal(ledger.length, LEDGER_SIZE);
  assert.equal(new Set(ledger.map((m) => m.movementId)).size, LEDGER_SIZE);
  // Límite documentado: los ids sólo son únicos en el ledger vivo. Con el reloj hacia delante el último apunte del día
  // actual siempre sigue dentro, así que no se repiten; sólo un apunte en un día pasado ya expulsado podría reusar m-<día>-1.
  for (let i = 0; i < LEDGER_SIZE; i++) recordMovement(ledger, { day: 10, hour: 12, minute: 0, label: `Otra ${i}`, amount: -1 });
  assert.ok(!ledger.some((m) => m.day === 9));
  assert.equal(new Set(ledger.map((m) => m.movementId)).size, LEDGER_SIZE);
}
{
  // parseLedger: v3 sin ids → legacy-<índice> sin chocar; ids duplicados, tipos y estados desconocidos fuera.
  const base = { day: 3, hour: 9, minute: 0, label: 'x', amount: -1 };
  const parsed = parseLedger([
    { ...base, label: 'a' }, { ...base, movementId: 'legacy-2', label: 'b', type: 'bill', source: 'bill:rent', status: 'posted' },
    { ...base, label: 'c' }, { ...base, movementId: 'legacy-2', label: 'dup' }, { ...base, movementId: 'm-3-1', label: 'tipo', type: 'robo' },
    { ...base, movementId: 'm-3-2', label: 'estado', status: 'quizá' }, { ...base, amount: 'mucho' }, null,
  ]);
  assert.deepEqual(parsed.map((m) => [m.movementId, m.label, m.type, m.source, m.status]), [
    ['legacy-0', 'a', 'other', 'legacy', 'posted'], ['legacy-2', 'b', 'bill', 'bill:rent', 'posted'], ['legacy-2-2', 'c', 'other', 'legacy', 'posted'],
  ]);
  assert.deepEqual(parseLedger(JSON.parse(JSON.stringify(parsed))), parsed, 'releer no cambia ids');
  assert.equal(parseLedger(Array.from({ length: 50 }, () => base)).length, LEDGER_SIZE);
  assert.equal(parseLedger(Array.from({ length: 50 }, () => base))[0].movementId, 'legacy-10', 'el índice es el del array de origen');
}
{
  // Partida v3 con ledger sin ids: carga con legacy-*, y save → load → save → load deja los mismos ids sin duplicar.
  const store = new Map<string, string>();
  const save = new SaveSystem({ read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) });
  const v3 = { ...createInitialState(), ledger: [{ day: 4, hour: 9, minute: 0, label: 'Sueldo', amount: 60 }, { day: 4, hour: 20, minute: 5, label: 'Alquiler', amount: -45 }] };
  store.set(SAVE_KEY, JSON.stringify({ version: 3, savedAt: 0, state: v3 }));
  const first = save.load()!;
  assert.deepEqual(first.ledger!.map((m) => [m.movementId, m.type, m.source, m.status, m.amount]), [['legacy-0', 'other', 'legacy', 'posted', 60], ['legacy-1', 'other', 'legacy', 'posted', -45]]);
  assert.ok(save.save(first));
  assert.equal(JSON.parse(store.get(SAVE_KEY)!).version, 4);
  const second = save.load()!;
  assert.ok(save.save(second));
  const third = save.load()!;
  assert.deepEqual(second.ledger, first.ledger);
  assert.deepEqual(third.ledger, first.ledger);
  // Un apunte nuevo tras cargar sigue la numeración del día y no choca con los legacy.
  const ledger = third.ledger!;
  assert.equal(recordMovement(ledger, { day: 4, hour: 21, minute: 0, label: 'Café', amount: -1.5 }), 'm-4-1');
  assert.equal(new Set(ledger.map((m) => m.movementId)).size, 3);
}

const rent = BILLS.find((b) => b.id === 'rent')!;
const home = BILLS.find((b) => b.id === 'home')!;
const weekly = rent.amount + home.amount;
const roundTrip = (h: HouseholdState): HouseholdState => parseHousehold(JSON.parse(JSON.stringify(h)), 999);

// --------------------------------------------- partida nueva: anuncio y vencimiento

let h = startHousehold(1);
let r = sync(h, 1);
assert.equal(r.news.length, BILLS.length, 'el primer día se anuncia cada gasto');
assert.deepEqual(r.news.map((o) => o.due), [7, 7], 'vence el domingo, al acabar la primera semana');
h = r.household;
assert.equal(statusOf(unpaid(h)[0], 1), 'upcoming');
// Repetir el repaso, descansar o cambiar de escena (otra llamada el mismo día o días después) no crea nada.
for (const day of [1, 1, 3, 7]) assert.equal(sync(h, day).news.length, 0, `día ${day}: nada nuevo`);
assert.equal(owed(h), weekly);

// ------------------------------------------------------------------- pagar

// Saldo exacto: se puede y queda en 0.
const p = pay(h, rent.amount, 'rent', 0, 5);
assert.ok(p.ok && p.money === 0);
// Insuficiente: sigue pendiente, sin tocar el dinero, y se explica.
const short = pay(h, rent.amount - 0.01, 'rent', 0, 5);
assert.ok(!short.ok && short.money === rent.amount - 0.01 && short.household === h);
assert.match(short.message, /Te faltan €0,01.*nadie te echa.*Decathlon/);
// Repetido: no cobra dos veces.
h = p.household;
const twice = pay(h, 500, 'rent', 0, 5);
assert.ok(!twice.ok && twice.money === 500 && /Ya está pagado/.test(twice.message));
assert.equal(owed(h), home.amount);

// Recargar antes y después de pagar: lo mismo, y repasar después no duplica.
assert.deepEqual(roundTrip(h), h);
assert.equal(sync(roundTrip(h), 6).news.length, 0);
assert.ok(!pay(roundTrip(h), 500, 'rent', 0, 6).ok, 'tras recargar, sigue pagado');

// ---------------------------------------------------- vencido, margen y recargo único

h = sync(h, 8).household; // empieza la semana 2: un periodo más de cada uno
assert.equal(h.obligations.filter((o) => o.period === 1).length, 2);
const homeLate = h.obligations.find((o) => o.bill === 'home' && o.period === 0)!;
assert.equal(statusOf(homeLate, 8), 'overdue');
assert.equal(sync(h, 7 + GRACE_DAYS).fined.length, 0, 'dentro del margen, sin recargo');
r = sync(h, 8 + GRACE_DAYS);
assert.equal(r.fined.length, 0, 'los suministros no llevan recargo');
// El alquiler de la semana 2 sin pagar pasado el margen: recargo una vez.
r = sync(h, 14 + GRACE_DAYS + 1);
assert.deepEqual(r.fined.filter((o) => o.bill === 'rent').map((o) => o.period), [1]);
assert.equal(total(r.household.obligations.find((o) => o.bill === 'rent' && o.period === 1)!), rent.amount + rent.lateFee!);
assert.equal(sync(r.household, 30).fined.filter((o) => o.period === 1).length, 0, 'el recargo no se repite');

// ------------------------------------------------ salto de reloj que cruza varios vencimientos

const jump = sync(startHousehold(1), 30);
// Periodos que empezaron los días 1, 8, 15, 22 y 29: uno por periodo y gasto.
assert.equal(jump.news.length, 5 * BILLS.length);
assert.equal(new Set(jump.household.obligations.map((o) => `${o.bill}:${o.period}`)).size, 5 * BILLS.length);
// Recargo sólo a los alquileres pasados del margen (vencen 7, 14 y 21; el del 28 aún está en margen).
assert.deepEqual(jump.fined.map((o) => o.due), [7, 14, 21]);
const again = sync(jump.household, 30);
assert.deepEqual([again.news.length, again.fined.length], [0, 0], 'saltar no duplica');
// Sin saldo negativo: con poco dinero se paga lo que llega, en orden.
let money = 60;
let state = jump.household;
for (const o of unpaid(jump.household)) {
  const t = pay(state, money, o.bill, o.period, 30);
  if (t.ok) [money, state] = [t.money, t.household];
}
assert.ok(money >= 0 && owed(state) > 0, 'lo que no llega sigue pendiente');

// ------------------------------------------------------- partida antigua

{
  const store = new Map<string, string>();
  const save = new SaveSystem({ read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) });
  const old = { money: 1184.2, energy: 70, day: 665, hour: 21, minute: 43, locationId: 'home', position: { x: 10, y: 10 }, facing: 'down', inventory: { water: 2 }, cards: { transport: 8 }, wardrobe: ['vaquero-70'] };
  store.set(SAVE_KEY, JSON.stringify({ version: 1, savedAt: 0, state: old }));
  const loaded = save.load()!;
  assert.deepEqual([loaded.money, loaded.inventory, loaded.cards, loaded.wardrobe], [1184.2, { water: 2 }, { transport: 8 }, ['vaquero-70']], 'patrimonio intacto');
  assert.equal(loaded.household!.since, 665, 'los periodos empiezan al cargar');
  const first = sync(loaded.household!, 665);
  assert.ok(first.news.length === BILLS.length && first.news.every((o) => o.due === 671 && o.period === 0), 'sólo obligaciones futuras, con una semana de aviso');
  assert.equal(first.fined.length, 0);
  assert.deepEqual(loaded.ledger, []);
  // Y lo guardado vuelve igual.
  save.save({ ...loaded, household: first.household, ledger: [{ day: 665, hour: 21, minute: 50, label: 'Alquiler', amount: -45 }] });
  const back = save.load()!;
  assert.deepEqual(back.household, first.household);
  assert.equal(back.ledger!.length, 1);
}
// Guardados raros: sin romper la carga.
assert.equal(parseHousehold({ since: 'ayer' }, 12).since, 12);
assert.equal(parseHousehold({ since: 3, obligations: [{ bill: 'yate', period: 0, due: 9, amount: 1, fee: 0 }] }, 12).obligations.length, 0);
const dup = parseHousehold({ since: 1, generated: {}, obligations: [{ bill: 'rent', period: 0, due: 7, amount: 45, fee: 0 }] }, 12);
assert.equal(sync(dup, 3).news.filter((o) => o.bill === 'rent').length, 0, 'un periodo guardado no se vuelve a crear');
assert.deepEqual(parseLedger([{ day: 1, hour: 2, minute: 3, label: 'x', amount: 'mucho' }]), []);

// ----------------------------------------------------------------- meta

{
  const goal = GOALS[0];
  let hh: HouseholdState = { ...sync(startHousehold(1), 1).household, goal: goal.id };
  const cost = goalView(goal, 0, hh, []).cost;
  assert.ok(cost > 50, 'precio real de la tienda');
  // La meta cuenta la cartera menos lo que se debe.
  const v = goalView(goal, 100, hh, []);
  assert.equal(v.free, 100 - weekly);
  assert.equal(Math.round(v.progress * 1000), Math.round(((100 - weekly) / cost) * 1000));
  // Cobrar sube el progreso; pagar la casa no lo cambia (ya estaba descontado); gastar lo baja.
  const afterSalary = goalView(goal, 160, hh, []);
  assert.ok(afterSalary.progress > v.progress);
  const paid = pay(hh, 160, 'rent', 0, 2);
  hh = paid.household;
  assert.equal(goalView(goal, paid.money, hh, []).free, afterSalary.free);
  assert.ok(goalView(goal, paid.money - 30, hh, []).progress < afterSalary.progress);
  // Recargar no cambia nada.
  assert.equal(goalView(goal, paid.money, roundTrip(hh), []).progress, goalView(goal, paid.money, hh, []).progress);
  // Llega: se explica qué deja comprarla ahora; comprada, se da por conseguida.
  assert.match(goalAdvice(goalView(goal, cost + 200, hh, []), hh, 2), /Ya te llega.*te quedan.*Esperar no cuesta nada/);
  assert.match(goalAdvice(goalView(goal, 0, hh, []), hh, 2), /Te faltan/);
  assert.ok(goalView(goal, 0, hh, [goal.garment]).owned);
}

// ----------------------------------------------------------------- micropréstamo (LV-10, Fase 3a)

{
  const decathlon = getJob('decathlon');
  const promoted = promote(hire(decathlon, 1), 2);
  const base: CreditInput = { job: promoted, household: sync(startHousehold(10), 10).household, credit: emptyCredit(), today: 10 };
  const share = { principal: CREDIT.principal / CREDIT.installments, cost: CREDIT.cost / CREDIT.installments };
  const quota = share.principal + share.cost;
  const memory = () => {
    const store = new Map<string, string>();
    return { store, save: new SaveSystem({ read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) }) };
  };

  // Disponibilidad: sólo tras el ascenso, con contrato activo, uno a la vez, cooldown cumplido y sin alquiler 'late'.
  assert.equal(creditBlocker(base), null);
  assert.match(creditBlocker({ ...base, job: hire(decathlon, 1) })!, /ascenso/, 'nivel 0: no se ofrece');
  assert.match(creditBlocker({ ...base, job: null })!, /contrato activo/);
  assert.match(creditBlocker({ ...base, job: quit(promoted, 5) })!, /contrato activo/);
  const taken = take(base, 0);
  assert.ok(taken.ok && taken.money === CREDIT.principal && taken.entry?.movementId === 'loan:c10:principal');
  assert.match(creditBlocker({ ...base, credit: taken.credit })!, /abierto/, 'un préstamo vivo');
  assert.ok(!take({ ...base, credit: taken.credit }, 7).ok && take({ ...base, credit: taken.credit }, 7).money === 7);
  const lateRent = sync(startHousehold(1), 20).household;
  assert.equal(statusOf(lateRent.obligations.find((o) => o.bill === 'rent' && o.period === 0)!, 20), 'late');
  assert.match(creditBlocker({ ...base, household: lateRent, today: 20 })!, /con retraso/, "alquiler en 'late'");

  // Desistimiento dentro de los CREDIT.withdrawalDays primeros días: se devuelve el principal y cuesta €0.
  const withdrawn = cancel(taken.credit, taken.money, 10 + CREDIT.withdrawalDays - 1);
  assert.ok(withdrawn.ok && withdrawn.money === 0, 'el desistimiento cuesta €0');
  assert.equal(withdrawn.credit.loans[0].status, 'cancelled');
  assert.equal(withdrawn.entry?.movementId, 'loan:c10:cancel');
  // Cooldown tras cancelar.
  const cooled = { ...base, credit: withdrawn.credit };
  assert.match(creditBlocker({ ...cooled, today: 10 + CREDIT.withdrawalDays - 1 + CREDIT.cooldown - 1 })!, /Podrás pedir otro/, 'dentro del cooldown');
  assert.equal(creditBlocker({ ...cooled, today: 10 + CREDIT.withdrawalDays - 1 + CREDIT.cooldown }), null);
  assert.match(creditView(withdrawn.credit, 12), /Sin préstamo\. Podrás pedir otro/);

  // Cuotas: syncCredit tres veces el mismo día y un salto de 30 días crean exactamente CREDIT.installments.
  let c: CreditState = taken.credit;
  for (let k = 0; k < 3; k++) c = syncCredit(c, 10).credit;
  assert.equal(activeLoan(c)!.obligations.length, 1, 'la primera cuota se anuncia el día de pedirlo');
  assert.match(creditView(c, 10), /Debes €108.*Próxima cuota: 1\/4, €27.*Al día/);
  const jumped = syncCredit(c, 40);
  const loan = activeLoan(jumped.credit)!;
  assert.equal(loan.obligations.length, CREDIT.installments);
  assert.deepEqual(loan.obligations.map((o) => [o.n, o.due, o.amount]), [1, 2, 3, 4].map((n) => [n, 10 + n * CREDIT.every - 1, quota]));
  // Recargo único pasado GRACE_DAYS: sólo las vencidas hace más de una semana, y no se repite ni se acumula.
  assert.deepEqual(jumped.fined.map((o) => o.n), [1, 2, 3]);
  assert.equal(syncCredit(jumped.credit, 40).fined.length, 0, 'el recargo se aplica una sola vez');
  const later = syncCredit(syncCredit(jumped.credit, 60).credit, 90);
  assert.equal(later.fined.length, 0);
  assert.ok(activeLoan(later.credit)!.obligations.every((o) => o.fee === CREDIT.lateFee), 'un recargo por cuota, nada más');
  assert.equal(activeLoan(syncCredit(later.credit, 400).credit)!.obligations.length, CREDIT.installments);

  // Sin saldo: ok:false, dinero y préstamo intactos, y cuánto falta.
  const broke = payInstallment(jumped.credit, 5, 1, 40);
  assert.ok(!broke.ok && broke.reason === 'insufficient' && broke.money === 5 && broke.credit === jumped.credit);
  assert.match(broke.message, /Te faltan €27/);
  // Pagarlas todas: devuelto, con cooldown.
  let wallet = 500;
  let paidOff = jumped.credit;
  for (const n of [1, 2, 3, 4]) {
    const r = payInstallment(paidOff, wallet, n, 40);
    assert.ok(r.ok, r.message);
    [paidOff, wallet] = [r.credit, r.money];
  }
  assert.deepEqual([paidOff.loans[0].status, paidOff.cooldownUntil, activeLoan(paidOff)], ['repaid', 40 + CREDIT.cooldown, undefined]);
  assert.equal(wallet, 500 - 3 * (quota + CREDIT.lateFee) - quota);

  // Liquidación anticipada: principal pendiente + coste de las cuotas ya generadas sin pagar; nada de las futuras.
  const first = payInstallment(c, 200, 1, 16); // saldo de sobra: 200 − 27 = 173 cubre la liquidación
  assert.ok(first.ok);
  const settle = cancel(first.credit, first.money, 24); // cuotas 2 y 3 ya anunciadas (días 17 y 24), la 4 todavía no
  assert.ok(settle.ok);
  assert.equal(first.money - settle.money, CREDIT.principal - share.principal + 2 * share.cost);
  assert.deepEqual([settle.credit.loans[0].status, settle.credit.cooldownUntil], ['cancelled', 24 + CREDIT.cooldown]);
  assert.ok(!cancel(first.credit, 1, 24).ok && cancel(first.credit, 1, 24).money === 1, 'sin saldo para liquidar, nada cambia');

  // Aplicar dos veces el mismo resultado: ni el dinero ni la línea se duplican; recalcularlo, tampoco.
  const at = { day: 10, hour: 12, minute: 0 };
  const book0 = { money: 0, credit: emptyCredit(), ledger: [] as Movement[] };
  const book1 = commitCredit(book0, taken, at);
  assert.deepEqual(commitCredit(book1, taken, at), book1);
  // Un resultado viejo reaplicado después de que el dinero cambiara (un doble toque tardío) no pisa ese cambio.
  const earned = { ...book1, money: book1.money + 50 };
  assert.deepEqual(commitCredit(earned, taken, at), earned, 'reaplicar un resultado viejo no pisa el dinero ganado después');
  const pay1 = payInstallment(book1.credit, book1.money, 1, 12);
  const book2 = commitCredit(book1, pay1, { ...at, day: 12 });
  assert.deepEqual(commitCredit(book2, pay1, { ...at, day: 12 }), book2, 'el mismo pago dos veces');
  assert.equal(book2.money, CREDIT.principal - quota);
  assert.deepEqual(book2.ledger.map((m) => [m.movementId, m.amount, m.type, m.source]), [
    ['loan:c10:principal', CREDIT.principal, 'loan', 'loan:c10'], ['loan:c10:1', -quota, 'loan', 'loan:c10'],
  ]);
  assert.equal(payInstallment(book2.credit, book2.money, 1, 12).reason, 'paid');
  assert.deepEqual(commitCredit(book2, broke, at), book2, 'un resultado fallido no apunta nada');

  // Guardar y cargar con préstamo vivo: mismo estado, sin cuotas ni recargos de más.
  {
    const { save } = memory();
    const game = { ...createInitialState(), day: 40, money: 77, credit: jumped.credit };
    assert.ok(save.save(game));
    const once = save.load()!;
    assert.deepEqual([once.credit, once.money], [jumped.credit, 77]);
    const again2 = syncCredit(once.credit!, 40);
    assert.deepEqual([again2.news.length, again2.fined.length], [0, 0], 'recargar no duplica');
    assert.ok(save.save(once));
    assert.deepEqual(save.load()!.credit, jumped.credit);
  }
  // Una v4 sin `credit`: sin préstamo y con el dinero intacto. Uno dañado se descarta.
  {
    const { store, save } = memory();
    const v4: Partial<ReturnType<typeof createInitialState>> = { ...createInitialState(), money: 321 };
    delete v4.credit;
    store.set(SAVE_KEY, JSON.stringify({ version: 4, savedAt: 0, state: v4 }));
    const loaded = save.load()!;
    assert.deepEqual([loaded.money, activeLoan(loaded.credit ?? emptyCredit())], [321, undefined]);
    store.set(SAVE_KEY, JSON.stringify({ version: 4, savedAt: 0, state: { ...v4, credit: { loans: [{ id: 'c3', since: 3 }], cooldownUntil: 0 } } }));
    // Tarea 2: el préstamo dañado se descarta (sin préstamo, con cooldown) y el dinero queda igual.
    const brokenLoad = save.load()!;
    assert.deepEqual([brokenLoad.credit!.loans, brokenLoad.money], [[], 321]);
    assert.ok(brokenLoad.credit!.cooldownUntil >= CREDIT.cooldown, 'un préstamo descartado pone cooldown');
  }
  assert.deepEqual(parseCredit('basura', 5), emptyCredit());
  const tampered = structuredClone(jumped.credit);
  tampered.loans[0].generated = 2; // 4 cuotas guardadas con generated 2
  assert.deepEqual(parseCredit(tampered, 40), { loans: [], cooldownUntil: 40 + CREDIT.cooldown });
  assert.deepEqual(parseCredit(jumped.credit, 9), { loans: [], cooldownUntil: 9 + CREDIT.cooldown }, 'un préstamo del futuro');
  assert.deepEqual(parseCredit(JSON.parse(JSON.stringify(jumped.credit)), 40), jumped.credit);
  // Tarea 2: un válido y uno dañado → se conserva el válido; sólo uno dañado → sin préstamo, con cooldown.
  {
    const bad = { id: 'c3', since: 3 };
    const mixed = parseCredit({ loans: [bad, JSON.parse(JSON.stringify(jumped.credit.loans[0]))], cooldownUntil: 0 }, 40);
    assert.deepEqual(mixed.loans, jumped.credit.loans, 'el válido se conserva');
    assert.equal(mixed.cooldownUntil, 40 + CREDIT.cooldown, 'al descartar uno, cooldown');
    assert.deepEqual(parseCredit({ loans: [bad], cooldownUntil: 0 }, 40), { loans: [], cooldownUntil: 40 + CREDIT.cooldown });
    const { store, save } = memory();
    store.set(SAVE_KEY, JSON.stringify({ version: 4, savedAt: 0, state: { ...createInitialState(), day: 40, money: 321, credit: { loans: [bad, jumped.credit.loans[0]], cooldownUntil: 0 } } }));
    const kept = save.load()!;
    assert.deepEqual([kept.money, kept.credit!.loans], [321, jumped.credit.loans], 'carga: el válido sigue y el dinero, intacto');
  }
}

console.log(`casa: ${BILLS.map((b) => `${b.name} €${b.amount}/${b.every} días`).join(' · ')} · margen ${GRACE_DAYS} días · ${GOALS.length} metas · ok`);
