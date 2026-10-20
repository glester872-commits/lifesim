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
import { buy as buyUpgrade, fits, rentsOf, startHousing } from '../src/systems/Housing.ts';
import { levelOf, promote, promotionReady, scheduled } from '../src/systems/Jobs.ts';

const job = getJob('decathlon');
const fare = destinationsFrom(getStop('vallesco')).find((d) => d.stop.id === 'decathlon')!.fare;
const groceries = getCatalog('supermarket-till').products.find((p) => p.id === 'groceries')!.price;
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
      if (!promotedOn && promotionReady(contract)) {
        contract = promote(contract, day);
        promotedOn = day;
      }
    }
    const free = (): number => cash - owed(house);
    if (weekIndex(day) === 5 && free() >= nightOut.cost! + 2 * fare + 40) cash -= nightOut.cost! + 2 * fare;
    const next = UPGRADES.filter((u) => fits(u, housing.home) && !housing.owned.includes(u.id)).sort((a, b) => a.price - b.price)[0];
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
