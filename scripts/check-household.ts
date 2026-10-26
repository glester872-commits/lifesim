// Gastos de casa y metas (systems/Household): un cargo por periodo, pago exacto, insuficiente y repetido,
// recargar, saltos de reloj, partidas antiguas y progreso de la meta. `npm run check`.
import assert from 'node:assert/strict';
import { BILLS, GOALS, GRACE_DAYS } from '../src/data/household.ts';
import {
  goalAdvice, goalView, owed, parseHousehold, parseLedger, pay, recordMovement, startHousehold, statusOf, sync, total, unpaid, type HouseholdState, type Movement,
} from '../src/systems/Household.ts';
import { SaveSystem } from '../src/systems/SaveSystem.ts';
import { SAVE_KEY } from '../src/config/constants.ts';

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

console.log(`casa: ${BILLS.map((b) => `${b.name} €${b.amount}/${b.every} días`).join(' · ')} · margen ${GRACE_DAYS} días · ${GOALS.length} metas · ok`);
