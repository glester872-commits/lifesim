// Cuatro semanas de una rutina moderada con los precios de verdad (data/): ¿llega para casa, metro, comida y
// salir una noche? `npm run check`. Falla si algún gasto de casa vence sin poder pagarse o el margen no llega.
import assert from 'node:assert/strict';
import { getCatalog } from '../src/data/catalogs.ts';
import { getActivity } from '../src/data/activities.ts';
import { getJob } from '../src/data/jobs.ts';
import { BILLS } from '../src/data/household.ts';
import { destinationsFrom, getStop } from '../src/systems/Transit.ts';
import { hire, situationFor, work } from '../src/systems/Jobs.ts';
import { pay, startHousehold, sync, unpaid, owed } from '../src/systems/Household.ts';
import { absMinute } from '../src/systems/Handoff.ts';
import { weekIndex } from '../src/systems/Calendar.ts';
import { INITIAL_MONEY } from '../src/config/constants.ts';
import { getCourse } from '../src/data/study.ts';
import { UPGRADES } from '../src/data/housing.ts';
import { buy as buyUpgrade, buyBlocker, fits, rentsOf, startHousing } from '../src/systems/Housing.ts';
import { levelOf, promote, promotionReady, scheduled } from '../src/systems/Jobs.ts';
import { statusOf as billStatus } from '../src/systems/Household.ts';
import { getStore } from '../src/data/retail.ts';
import { CREDIT } from '../src/data/credit.ts';
import { creditBlocker, emptyCredit, simulateCredit, take } from '../src/systems/Credit.ts';

/** Neto de las semanas 2–4 del escenario «Decathlon tras el ascenso» (Fase 0), para el criterio del préstamo. */
let promotedNets: number[] = [];

const job = getJob('decathlon');
const fare = destinationsFrom(getStop('vallesco')).find((d) => d.stop.id === 'decathlon')!.fare;
const groceries = getCatalog('super-rosales').products.find((p) => p.id === 'groceries')!.price;
const nightOut = getActivity('restaurant-dinner');
const cana = getActivity('bar-cana');

// Lo que tiene una partida nueva tras comprar la tarjeta del metro. La primera semana sólo hay dos turnos antes del domingo.
const START = INITIAL_MONEY - getCatalog('transport-machine').products.find((p) => p.id === 'transport-new')!.price;
let money = START;
let h = startHousehold(1);
let p = hire(job, 1);
const week = { income: 0, rent: 0, transport: 0, food: 0, social: 0 };
const weeks: (typeof week)[] = [];
let lowest = money;

for (let day = 1; day <= 28; day++) {
  h = sync(h, day).household;
  // Comida: una compra al día para cocinar.
  money -= groceries;
  week.food += groceries;
  // Trabajo: sus turnos (lunes, miércoles, viernes), ida y vuelta en metro.
  if (day >= p.from && job.levels[0].days.includes(weekIndex(day))) {
    const out = work(p, absMinute(day, 9, 40), situationFor(p, day).choices[1]);
    p = out.progress;
    money += out.money - 2 * fare;
    week.income += out.money;
    week.transport += 2 * fare;
  }
  // Salir: el sábado, cena a la carta y dos cañas, con su metro.
  if (weekIndex(day) === 5) {
    const spent = nightOut.cost! + 2 * cana.cost! + 2 * fare;
    money -= spent;
    week.social += spent - 2 * fare;
    week.transport += 2 * fare;
  }
  // Casa: se paga el día que vence.
  for (const o of unpaid(h).filter((x) => x.due === day)) {
    const r = pay(h, money, o.bill, o.period, day);
    assert.ok(r.ok, `día ${day}: ${o.bill} no se puede pagar (${money.toFixed(2)} €): ${r.message}`);
    h = r.household;
    week.rent += money - r.money;
    money = r.money;
  }
  lowest = Math.min(lowest, money);
  assert.ok(money >= 0, `día ${day}: saldo negativo`);
  if (weekIndex(day) === 6) {
    weeks.push({ ...week });
    Object.assign(week, { income: 0, rent: 0, transport: 0, food: 0, social: 0 });
  }
}

assert.equal(owed(h), 0, "todo pagado a tiempo");
for (const [i, w] of weeks.entries()) console.log(`  semana ${i + 1}: +€${w.income} · casa −€${w.rent} · metro −€${w.transport} · comida −€${w.food} · salir −€${w.social} · neto €${(w.income - w.rent - w.transport - w.food - w.social).toFixed(2)}`);
// La primera semana tiene dos turnos (se firma el lunes y se empieza el miércoles): el margen se mide en las de rutina.
const full = weeks.slice(1);
const avg = (k: keyof typeof week): number => full.reduce((s, w) => s + w[k], 0) / full.length;
const margin = avg('income') - avg('rent') - avg('transport') - avg('food') - avg('social');
assert.ok(margin > 0, `la rutina moderada no deja margen: ${margin}`);
const shift = job.levels[0];
console.log(
  `presupuesto semanal (media de las semanas 2–${weeks.length}): ingresos €${avg('income').toFixed(2)} (${shift.days.length} turnos de ${shift.hours} h × €${shift.wage}) · ` +
    `casa €${avg('rent').toFixed(2)} (${BILLS.map((b) => `${b.name} €${b.amount}`).join(' + ')}) · metro €${avg('transport').toFixed(2)} · comida €${avg('food').toFixed(2)} · ` +
    `salir €${avg('social').toFixed(2)} · margen €${margin.toFixed(2)} · saldo €${START} → €${money.toFixed(2)} (mínimo €${lowest.toFixed(2)})`,
);

// ------------------------------------------------------------------ decisiones razonables (prompt 07)
// La misma rutina con lo que haría alguien en su primera semana: firmar el lunes, matricularse en el curso, aceptar el
// ascenso cuando lo proponen, comprar una mejora para casa cuando sobra (quedando €40 libres) y salir el sábado sólo si
// llega. ¿Cuándo llega el ascenso y cuándo cada mejora? Falla si algo vence sin pagar o si no da tiempo en el mes.
{
  const course = getCourse('foto-basica');
  let cash = START - course.fee;
  let house = startHousehold(1);
  let contract = hire(job, 1);
  let housing = startHousing();
  let promotedOn = 0;
  const bought: string[] = [];
  let lowestCash = cash;
  for (let day = 1; day <= 28; day++) {
    house = sync(house, day, rentsOf(housing)).household;
    cash -= groceries;
    if (scheduled(contract, day)) {
      const out = work(contract, absMinute(day, levelOf(contract).start, 50 - 60), situationFor(contract, day).choices[0]);
      contract = out.progress;
      cash += out.money - 2 * fare;
      if (!promotedOn && promotionReady(contract, [])) {
        contract = promote(contract, day);
        promotedOn = day;
      }
    }
    const free = (): number => cash - owed(house);
    if (weekIndex(day) === 5 && free() >= nightOut.cost! + 2 * fare + 40) cash -= nightOut.cost! + 2 * fare;
    // La siguiente que se puede comprar aquí (cabe y tiene ranura libre: la planta y la lámpara comparten esquina).
    const next = UPGRADES.filter((u) => !buyBlocker(housing, u.id, Infinity)).sort((a, b) => a.price - b.price)[0];
    if (next && free() - next.price >= 40) {
      const r = buyUpgrade(housing, next.id, cash);
      assert.ok(r.ok, r.message);
      housing = r.housing;
      cash = r.money;
      bought.push(`${next.name} (día ${day})`);
    }
    for (const o of unpaid(house).filter((x) => x.due === day)) {
      const r = pay(house, cash, o.bill, o.period, day);
      assert.ok(r.ok, `decisiones razonables, día ${day}: ${o.bill} sin pagar (${cash.toFixed(2)} €)`);
      house = r.household;
      cash = r.money;
    }
    lowestCash = Math.min(lowestCash, cash);
    assert.ok(cash >= 0, `decisiones razonables, día ${day}: saldo negativo`);
  }
  assert.ok(promotedOn > 0 && promotedOn <= 21, `el ascenso no llega en tres semanas (día ${promotedOn})`);
  assert.ok(bought.length >= 1 && /día [1-7]\)/.test(bought[0]), `ninguna mejora asequible la primera semana: ${bought.join(', ')}`);
  console.log(`decisiones razonables: curso €${course.fee} · ascenso el día ${promotedOn} (${job.levels[1].title}, €${job.levels[1].wage}/turno) · mejoras: ${bought.join(', ') || 'ninguna'} · saldo €${cash.toFixed(2)} (mínimo €${lowestCash.toFixed(2)})`);
}

// ------------------------------------------------------------------ LV-10 Fase 0: bucle básico sostenible
// Cuatro semanas por escenario con todos los gastos (casa, metro, curso, ocio, compras) y un imprevisto la semana 3 igual
// a un alquiler semanal. Tres indicadores (ver BALANCE-LV10.md). Sólo se asierta lo que se cumple por construcción
// (saldo ≥ 0, conservación del dinero); un indicador que falla se imprime «NO SOSTENIBLE», no rompe el check.
{
  const SCENARIOS = [
    { name: 'Decathlon nivel 0', jobId: 'decathlon', promoted: false },
    { name: 'Atalaya nivel 0', jobId: 'atalaya', promoted: false },
    { name: 'Decathlon tras el ascenso', jobId: 'decathlon', promoted: true },
  ];
  const c2 = (n: number): number => Math.round(n * 100) / 100;
  const eur = (n: number): string => n.toFixed(2);
  const rentBill = BILLS.find((b) => b.id === 'rent')!;
  const fixedWeekly = BILLS.reduce((s, b) => s + (b.amount * 7) / b.every, 0);
  const cheap = [...getStore('vuelta').stock].sort((a, b) => a.price - b.price)[0];
  const study = getCourse('foto-basica');
  const SHOCK_DAY = 15; // lunes de la semana 3
  const SHOCK = rentBill.amount;
  const zero = (): Record<string, number> => ({ ingresos: 0, vivienda: 0, transporte: 0, estudios: 0, ocio: 0, compras: 0, imprevisto: 0, faltas: 0 });

  const run = (sc: (typeof SCENARIOS)[number]): { text: string; fails: string[]; lines: string[]; nets: number[] } => {
    const j = getJob(sc.jobId);
    const commute = destinationsFrom(getStop('vallesco')).find((d) => d.stop.id === j.place)?.fare ?? 0;
    let cash = START;
    let house = startHousehold(1);
    let contract = hire(j, 1);
    if (sc.promoted) contract = promote(contract, 0);
    let w = zero();
    const rows: { w: Record<string, number>; saldo: number }[] = [];
    let income = 0;
    let spent = 0;
    let lowestAfterW1 = Infinity;
    let lateAfterShock = false;
    let shockPaid = false;
    // Gasta si llega; si no, no gasta y lo apunta como «faltas». Nunca deja el saldo negativo.
    const spend = (k: string, amt: number): boolean => {
      if (cash + 1e-9 < amt) {
        w.faltas++;
        return false;
      }
      cash = c2(cash - amt);
      spent += amt;
      w[k] += amt;
      return true;
    };
    spend('estudios', study.fee);
    for (let day = 1; day <= 28; day++) {
      house = sync(house, day, rentsOf(startHousing())).household;
      spend('compras', groceries);
      if (day === 8) spend('compras', cheap.price);
      if (scheduled(contract, day)) {
        if (commute === 0 || spend('transporte', 2 * commute)) {
          const out = work(contract, absMinute(day, levelOf(contract).start, 0), situationFor(contract, day).choices[1]);
          contract = out.progress;
          cash = c2(cash + out.money);
          income += out.money;
          w.ingresos += out.money;
        }
      }
      if (weekIndex(day) === 5 && spend('ocio', nightOut.cost! + 2 * cana.cost!)) spend('transporte', 2 * fare);
      for (const o of unpaid(house).filter((x) => x.due <= day)) {
        const r = pay(house, cash, o.bill, o.period, day);
        if (!r.ok) continue;
        w.vivienda += cash - r.money;
        spent += cash - r.money;
        house = r.household;
        cash = r.money;
      }
      if (day === SHOCK_DAY) {
        shockPaid = spend('compras', SHOCK);
        if (shockPaid) w.imprevisto += SHOCK;
      }
      if (day >= SHOCK_DAY && unpaid(house).some((o) => billStatus(o, day) === 'late')) lateAfterShock = true;
      if (day > 7) lowestAfterW1 = Math.min(lowestAfterW1, cash);
      assert.ok(cash >= 0, `${sc.name}, día ${day}: saldo negativo`);
      if (weekIndex(day) === 6) {
        rows.push({ w, saldo: cash });
        w = zero();
      }
    }
    assert.ok(Math.abs(START + income - spent - cash) < 1e-6, `${sc.name}: el dinero no cuadra`);

    const nets = rows.map((r) => c2(r.w.ingresos - r.w.vivienda - r.w.transporte - r.w.estudios - r.w.ocio - r.w.compras + r.w.imprevisto));
    const lines = rows.map((r, i) => {
      const notes = [`neto rutina ${nets[i] >= 0 ? '+' : ''}${eur(nets[i])}`];
      if (r.w.imprevisto) notes.push(`imprevisto −${eur(r.w.imprevisto)} (incluido en compras)`);
      if (r.w.faltas) notes.push(`${r.w.faltas} gasto(s) no cubierto(s)`);
      if (i === 0) notes.push('semana parcial (se firma el lunes)');
      return `| ${i + 1} | ${eur(r.w.ingresos)} | ${eur(r.w.vivienda)} | ${eur(r.w.transporte)} | ${eur(r.w.estudios)} | ${eur(r.w.ocio)} | ${eur(r.w.compras)} | ${eur(r.saldo)} | ${notes.join('; ')} |`;
    });
    const fails: string[] = [];
    const bad = nets.slice(1).map((n, i) => ({ n, week: i + 2 })).filter((x) => x.n <= 0);
    if (bad.length) fails.push(`(a) neto semanal ≤ 0 en semana(s) ${bad.map((x) => `${x.week} (${eur(x.n)})`).join(', ')}`);
    const saving = c2(cash - START);
    if (saving <= 0) fails.push(`(b) ahorro ${eur(saving)} ≤ 0`);
    if (!shockPaid || lateAfterShock) fails.push(`(c) el imprevisto ${shockPaid ? 'deja una obligación en late' : 'no se puede pagar'}`);
    const cushion = c2(lowestAfterW1 / fixedWeekly);
    const verdict = (ok: boolean): string => (ok ? 'OK' : 'NO SOSTENIBLE');
    const text =
      `### ${sc.name}\n\n| semana | ingresos | vivienda | transporte | estudios | ocio | compras | saldo | notas |\n|---|---|---|---|---|---|---|---|---|\n${lines.join('\n')}\n\n` +
      `- (a) neto semanal > 0 en semanas 2–4: ${verdict(!bad.length)} (${nets.slice(1).map(eur).join(' / ')})\n` +
      `- (b) ahorro = saldo final − inicial = ${eur(cash)} − ${eur(START)} = ${eur(saving)}: ${verdict(saving > 0)}\n` +
      `- (c) colchón: imprevisto de €${eur(SHOCK)} el día ${SHOCK_DAY} ${shockPaid ? 'pagado' : 'NO pagado'}, ${lateAfterShock ? 'con' : 'sin'} obligaciones en late: ${verdict(shockPaid && !lateAfterShock)} · saldo mínimo desde la semana 2 €${eur(lowestAfterW1)} = ${cushion} semanas de gastos fijos (€${eur(fixedWeekly)}/semana) · pendiente de casa al final €${eur(owed(house))}\n`;
    return { text, fails, lines, nets };
  };

  for (const sc of SCENARIOS) {
    const a = run(sc);
    assert.equal(run(sc).text, a.text, `${sc.name}: la simulación no es determinista`);
    console.log(a.text);
    if (a.fails.length) console.log(`NO SOSTENIBLE · ${sc.name}: ${a.fails.join('; ')}\n`);
    if (sc.promoted) promotedNets = a.nets.slice(1);
  }
}

// ------------------------------------------------------------------ LV-10 Fase 3a: micropréstamo tras el ascenso
// Se pide el préstamo con el contrato ascendido y se simulan 4 semanas con simulateCredit (work, sync, pay, syncCredit,
// payInstallment). Criterio de frustración (ECONOMIA-LV10.md §2.8): cuota semanal < neto semanal del escenario ascendido
// y ninguna obligación de casa en 'late' en el intermedio. Si no se cumple, se imprime NO SOSTENIBLE, sin assert.
{
  const contract = promote(hire(job, 1), 0);
  const house = sync(startHousehold(1), 1).household;
  const input = { job: contract, household: house, credit: emptyCredit(), today: 1 };
  assert.equal(creditBlocker({ ...input, job: hire(job, 1) }) !== null, true, 'nivel 0: el préstamo no se ofrece');
  const blocker = creditBlocker(input);
  assert.equal(blocker, null, `tras el ascenso el préstamo debe ofrecerse: ${blocker}`);
  const taken = take(input, START);
  assert.ok(taken.ok && taken.money === START + CREDIT.principal);
  const sim = { job: contract, household: house, money: START, today: 1, daily: groceries, commute: 2 * fare };
  const scenarios = simulateCredit(sim);
  assert.deepEqual(simulateCredit(sim), scenarios, 'la simulación del préstamo no es determinista');
  for (const s of scenarios) {
    assert.ok(s.finalMoney >= 0, `${s.name}: saldo negativo`);
    console.log(`  préstamo · ${s.name}: cuota €${s.installment.toFixed(2)} · coste total €${s.totalCost.toFixed(2)} · saldo final €${s.finalMoney.toFixed(2)} · ` +
      `pendiente €${s.remaining.toFixed(2)} · casa ${s.houseLate ? "en 'late'" : 'al día'} · préstamo ${s.loanLate ? "en 'late'" : 'sin retraso'}`);
  }
  const weeklyNet = promotedNets.length ? Math.min(...promotedNets) : NaN;
  const middle = scenarios.find((s) => s.name === 'intermedio')!;
  const fails: string[] = [];
  if (!(scenarios[0].installment < weeklyNet)) fails.push(`cuota €${scenarios[0].installment.toFixed(2)} ≥ neto semanal mínimo del ascendido €${weeklyNet.toFixed(2)}`);
  if (middle.houseLate) fails.push("en el intermedio queda una obligación de casa en 'late'");
  console.log(fails.length
    ? `NO SOSTENIBLE · préstamo tras el ascenso: ${fails.join('; ')}`
    : `préstamo tras el ascenso: OK (cuota €${scenarios[0].installment.toFixed(2)} < neto semanal mínimo €${weeklyNet.toFixed(2)}; intermedio sin casa en 'late')`);
}
