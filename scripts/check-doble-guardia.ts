// Doble Guardia (EXP-01): saco a dos manos, cuota mensual por meses del calendario e idempotente, ring reservado y rival que
// se cansa. Sin Phaser: node scripts/check-doble-guardia.ts
import assert from 'node:assert/strict';
import { getAcademy } from '../src/data/academies.ts';
import { STATIONS } from '../src/data/stations.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { charge, covered, NO_MEMBERSHIP, parseMembership, periodFrom, setAutoRenew, settlePlan, subscribe } from '../src/systems/Academy.ts';
import { dateOf, dayOfDate } from '../src/systems/Calendar.ts';
import { START_FITNESS, quote } from '../src/systems/Fitness.ts';
import { contactDelay, createDrill, PUNCH_OF, startKick, stepDrill, summarize, type Drill, type Leg } from '../src/systems/Taekwondo.ts';
import { createBout, stepBout } from '../src/systems/Sparring.ts';

const a = getAcademy('boxing')!;
assert.ok(a.monthly && a.ring && a.spar, 'Doble Guardia sin cuota, ring o sparring en datos');

// ------------------------------------------------- 1. saco a dos manos: cada mano su golpe, un contacto por golpe
assert.equal(STATIONS['boxing-bag'].drill, 'punches');
assert.deepEqual(PUNCH_OF, { L: 'jab', R: 'cross' });
const series = (): Drill => createDrill(7, 0, false, 'punches');
const asked = series().cues.map((c) => c.leg);
/** Juega la serie: `pick` decide con qué mano responder a cada orden; la guardia, arriba a tiempo. */
function play(d: Drill, pick: (i: number) => Leg, distance = 1): Drill {
  const at = d.cues.map((c, i) => (c.kick === 'guard' ? -1 : Math.round((c.at - contactDelay(PUNCH_OF[pick(i)])) / 10) * 10));
  const guards = d.cues.filter((c) => c.kick === 'guard').map((c) => c.at);
  for (let t = 0; t <= d.cues[d.cues.length - 1].at + 2_000; t += 10) {
    d.cues.forEach((c, i) => {
      if (c.kick !== 'guard' && t === at[i]) startKick(d, PUNCH_OF[pick(i)], pick(i), t);
    });
    stepDrill(d, t, distance, guards.some((g) => t >= g - 300 && t <= g + 50));
  }
  return d;
}
const right = play(series(), (i) => asked[i]);
assert.ok(new Set(asked).size === 2, 'la serie no pide las dos manos');
assert.ok(right.cues.some((c) => c.kick === 'guard'), 'sin orden de guardia');
assert.ok(right.cues.some((c, i) => c.kick === 'jab' && right.cues[i + 1]?.kick === 'cross' && right.cues[i + 1].at - c.at < 500), 'sin combinación jab–directo');
const good = summarize(right);
assert.ok(good.accuracy >= 0.85, `la mano correcta a tiempo no puntúa (${good.accuracy})`);
assert.ok(right.kicks <= right.cues.length, 'un golpe cuenta más de una vez');
// Con la otra mano: el golpe equivocado, no vale.
const swapped = play(series(), (i) => (asked[i] === 'L' ? 'R' : 'L'));
assert.ok(swapped.results.filter((r) => r === 'wrong-kick').length >= 3, 'golpear con la otra mano no se nota');
// Lejos del saco: no llega.
assert.ok(summarize(play(series(), (i) => asked[i], 2.4)).accuracy < 0.4, 'desde lejos también puntúa');
// Con la guardia arriba no sale el golpe.
const g = series();
stepDrill(g, 100, 1, true);
assert.equal(startKick(g, 'jab', 'L', 200), false, 'golpea con la guardia arriba');

// ------------------------------------------------- 2. cuota: meses del calendario, no 30 días
const price = a.monthly!.price;
const d1 = dayOfDate(2027, 5, 15);
assert.deepEqual(periodFrom(d1), { from: d1, until: dayOfDate(2027, 6, 14) });
assert.equal(periodFrom(dayOfDate(2028, 1, 31)).until, dayOfDate(2028, 2, 29), 'del 31 de enero, hasta fin de febrero');
assert.equal(dateOf(periodFrom(dayOfDate(2027, 12, 10)).until).year, 2028, 'diciembre no pasa al año siguiente');

const s = subscribe(a, NO_MEMBERSHIP, 100, d1);
assert.ok(s.ok);
assert.equal(s.money, 100 - price);
assert.equal(s.membership.plan!.auto, false, 'la renovación automática viene activada');
assert.ok(covered(s.membership, d1) && covered(s.membership, s.until) && !covered(s.membership, s.until + 1));
assert.equal(subscribe(a, s.membership, 100, d1 + 3).ok, false, 'se paga dos veces el mismo mes');
// Incluida: la clase y el puesto no cuestan nada con la cuota.
const open = (day: number): number => (day - 1) * 1440 + a.hours[0] * 60;
const c = charge(a, s.membership, 30, open(d1 + 2));
assert.ok(c.ok && c.via === 'plan' && c.money === 30, 'la cuota no cubre la clase');
const f = { ...START_FITNESS, academies: { boxing: s.membership } };
assert.equal(quote(f, 'boxing-bag', 'normal', 80, { money: 30, hour: a.hours[0], minute: 0, at: open(d1 + 2) }).fee, 0, 'el puesto cobra con cuota');

// Sin renovación: vence al acabar, sin cobrar.
const lapse = settlePlan(a, s.membership, 500, s.until + 1);
assert.equal(lapse.money, 500);
assert.equal(lapse.membership.plan!.status, 'lapsed');
assert.ok(!covered(lapse.membership, s.until + 1));
const after = charge(a, lapse.membership, 0, open(s.until + 2));
assert.ok(!after.ok, 'vencida sigue entrando gratis');

// Con renovación y saldo: un cobro por mes, aunque se liquide mil veces o se salten días.
const auto = setAutoRenew(s.membership, true);
const r1 = settlePlan(a, auto, 500, s.until + 1);
assert.equal(r1.charged.length, 1);
assert.equal(r1.money, 500 - price);
const again = settlePlan(a, r1.membership, r1.money, s.until + 1);
assert.equal(again.money, r1.money, 'la misma liquidación cobra otra vez');
assert.equal(again.membership, r1.membership);
// Una cuota guardada y recargada no repite cobro.
const reloaded = parseMembership(JSON.parse(JSON.stringify(r1.membership)));
assert.deepEqual(reloaded, r1.membership);
assert.equal(settlePlan(a, reloaded, r1.money, s.until + 1).charged.length, 0);
// Saltar meses (dormir mucho): cada mes vencido, su cobro; ni uno más.
const skip = settlePlan(a, auto, 500, dayOfDate(2027, 9, 1));
assert.equal(skip.charged.length, new Set(skip.charged.map((x) => x.from)).size);
assert.equal(skip.charged.length, 3);
assert.ok(covered(skip.membership, dayOfDate(2027, 9, 1)));
// Sin saldo: vence, sin deuda ni saldo negativo.
const poor = settlePlan(a, auto, price - 1, s.until + 1);
assert.equal(poor.money, price - 1);
assert.equal(poor.lapsed, true);
assert.equal(poor.membership.plan!.auto, false);
// Cancelar: sigue cubierto hasta el final y luego vence sin cobrar.
const cancelled = setAutoRenew(auto, false);
assert.equal(cancelled.plan!.status, 'cancelled');
assert.ok(covered(cancelled, s.until));
assert.equal(settlePlan(a, cancelled, 500, s.until + 1).money, 500);
// Renovar a mano tras meses sin cuota: desde hoy, sin cobrar los meses vacíos.
const later = dayOfDate(2027, 11, 3);
const manual = subscribe(a, lapse.membership, 100, later);
assert.ok(manual.ok && manual.from === later && manual.money === 100 - price);

// ------------------------------------------------- 3. guardados viejos: sin cuota, nada que cobrar; lo roto, fuera
assert.deepEqual(parseMembership({ pass: 3, paid: 120 }), { pass: 3, paid: 120 });
assert.deepEqual(parseMembership({ pass: 1, paid: -1, plan: { from: 9, until: 2, status: 'active' } }), { pass: 1, paid: -1 });
assert.equal(parseMembership({ pass: 0, paid: -1, plan: { from: 5, until: 30, status: 'lapsed', auto: true, keys: [] } }).plan!.auto, false);

// ------------------------------------------------- 4. ring reservado: la línea de combate cae dentro y deja puestos que coger
const loc = getLocation(a.location);
const r = a.ring!;
const inRing = (tx: number, ty: number): boolean => tx >= r.tx && tx < r.tx + r.w && ty >= r.ty && ty < r.ty + r.h;
for (let i = -1; i < 5; i++) assert.ok(inRing(a.spar!.tx + i, a.spar!.ty), 'la línea de combate se sale del ring');
const ringPoints = Object.entries(loc.points ?? {}).filter(([, p]) => inRing(p.tx, p.ty));
assert.ok(ringPoints.length >= 2, 'el ring no tiene puestos que reservar');
assert.ok(Object.entries(loc.points ?? {}).some(([id, p]) => !inRing(p.tx, p.ty) && id.startsWith('BOX_BAG')), 'sin sacos fuera del ring');

// ------------------------------------------------- 5. el rival se cansa y recupera en el descanso
const b = createBout('boxing', 0.5, 11);
for (let t = 0; t < 39_000; t += 50) stepBout(b, 50, { move: 0, block: false });
assert.ok(b.ai.tired > 0, 'el rival no se cansa');
const tired = b.ai.tired;
for (let t = 0; t < 4_000 && b.round === 1; t += 50) stepBout(b, 50, { move: 0, block: false });
assert.ok(b.ai.tired < tired, 'el descanso no recupera');
assert.equal(createBout('boxing', 0.5, 11).ai.tired, 0);

console.log('check-doble-guardia: OK');
