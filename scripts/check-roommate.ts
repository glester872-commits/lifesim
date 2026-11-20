// SIM-05 · Compañero de piso (systems/Roommate): reparto exacto, una aportación por periodo, inicio y fin a mitad de
// periodo, recarga y saltos, compromiso una vez por periodo, mudanza, rutinas de convivencia, previsión de ingresos y
// partidas antiguas. `npm run check`.
import assert from 'node:assert/strict';
import { HOMES } from '../src/data/housing.ts';
import { MATES } from '../src/data/roommate.ts';
import { JOBS } from '../src/data/jobs.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { owed, parseHousehold, pay, startHousehold, sync, total, type HouseholdState } from '../src/systems/Household.ts';
import { buy, buyBlocker, installedIn, startHousing } from '../src/systems/Housing.ts';
import { hire, levelOf, promote } from '../src/systems/Jobs.ts';
import { routineFor, whereabouts, whereaboutsIn } from '../src/systems/Characters.ts';
import { createSocialProfile } from '../src/systems/Social.ts';
import { createInitialState } from '../src/systems/SaveSystem.ts';
import {
  applyShare, endRoommate, evaluateCommitment, rememberCommitment, incomeOutlook, mateRoutine, moveEffect, moveNote, outlookText, parseRoommate, quote, routineId, split, startRoommate,
  type RoommateState,
} from '../src/systems/Roommate.ts';

const KEVIN = MATES[0];
let failed = 0;
let passed = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`✗ ${name}\n  ${(e as Error).message}`);
  }
}

const rentOf = (h: HouseholdState, period: number) => h.obligations.find((o) => o.bill === 'rent' && o.period === period)!;
/** Pone al día como main.ts: sync, aportación y compromiso. */
function day(h: HouseholdState, r: RoommateState | undefined, today: number) {
  const s = sync(h, today);
  const a = applyShare(s.household, r);
  const c = evaluateCommitment(a.household, a.roommate, today);
  return { household: a.household, roommate: c.roommate, applied: a.applied, events: c.events, fined: s.fined };
}

check('reparto exacto en céntimos: su parte + tu parte = total', () => {
  for (const amount of [45, 55, 35, 25, 33.33, 0.01, 10.05]) {
    const s = split(amount, KEVIN.share);
    assert.equal(Math.round(s.mate * 100) + Math.round(s.you * 100), Math.round(amount * 100), `${amount}`);
    assert.ok(s.you >= s.mate, 'el resto va a tu parte');
  }
  assert.deepEqual(split(45, 0.4), { mate: 18, you: 27 });
});

check('vencimiento con importe, conceptos y fecha de aplicación', () => {
  const h = sync(startHousehold(1), 1).household;
  const q = quote(KEVIN, 'olmo7', h, 3);
  assert.equal(q.total, 45);
  assert.equal(q.mate + q.you, 45);
  assert.equal(q.from, 8, 'cuenta desde el primer periodo que empieza en o tras hoy');
  assert.match(q.text, /Luz, agua e internet/);
  assert.match(q.text, /terminar/);
  assert.equal(quote(KEVIN, 'olmo7', h, 8).from, 15, 'firmado el día que empieza un periodo, cuenta desde el siguiente');
  assert.match(q.text, /Tu compromiso/);
  assert.equal(q.text.split('\n\n').length, 4, 'cuatro párrafos: condiciones, reparto, compromiso y fin');
});

check('(a) acuerdo el día de inicio de un periodo ya anunciado: ese periodo sin mate, el siguiente con mate', () => {
  const h = sync(startHousehold(1), 8).household;
  const r = startRoommate(KEVIN, 'olmo7', 8, h);
  assert.equal(r.from, 15);
  assert.equal(quote(KEVIN, 'olmo7', h, 8).from, 15);
  let d = { household: h, roommate: r as RoommateState | undefined };
  for (const t of [8, 9, 12, 14]) {
    d = day(d.household, d.roommate, t);
    assert.equal(rentOf(d.household, 1).mate, undefined, `día ${t}`);
  }
  d = day(d.household, d.roommate, 15);
  assert.equal(rentOf(d.household, 2).mate, 18);
  assert.equal(rentOf(d.household, 1).mate, undefined);
});

check('(b) acuerdo a mitad de periodo: el en curso sin mate, el siguiente con mate', () => {
  const h = sync(startHousehold(1), 10).household;
  const r = startRoommate(KEVIN, 'olmo7', 10, h);
  assert.equal(r.from, 15);
  assert.equal(quote(KEVIN, 'olmo7', h, 10).from, 15);
  let d = day(h, r, 10);
  d = day(d.household, d.roommate, 13);
  assert.equal(rentOf(d.household, 1).mate, undefined);
  d = day(d.household, d.roommate, 15);
  assert.equal(rentOf(d.household, 2).mate, 18);
  const parsed = parseRoommate(JSON.parse(JSON.stringify(r)));
  assert.equal(parsed!.from, 15);
});

check('(c) terminar el día de inicio de un periodo: ese (en curso) conserva su parte, el siguiente no', () => {
  const h0 = sync(startHousehold(1), 3).household;
  let d = day(h0, startRoommate(KEVIN, 'olmo7', 3, h0), 15);
  assert.equal(rentOf(d.household, 2).mate, 18);
  const ended = endRoommate(d.roommate!, 15);
  d = day(d.household, ended, 15);
  assert.equal(rentOf(d.household, 2).mate, 18);
  d = day(d.household, ended, 22);
  assert.equal(rentOf(d.household, 3).mate, undefined);
  // Si el periodo del día de fin aún no estuviera fijado, se fija igual (start <= ended): misma regla.
  const late = applyShare(sync(startHousehold(1), 15).household, endRoommate(startRoommate(KEVIN, 'olmo7', 3), 15));
  assert.equal(rentOf(late.household, 2).mate, 18);
});

check('(d) memoria: dos veces el mismo periodo (también tras serializar) cambia la relación una vez', () => {
  const h0 = sync(startHousehold(1), 3).household;
  let d = day(h0, startRoommate(KEVIN, 'olmo7', 3, h0), 8);
  d = { ...d, household: pay(d.household, 100, 'rent', 1, 9).household };
  d = day(d.household, d.roommate, 15);
  assert.equal(d.events.length, 1);
  const p0 = createSocialProfile();
  const p1 = rememberCommitment(p0, d.events[0], 15);
  assert.ok(p1.friendship > p0.friendship);
  const p2 = rememberCommitment(JSON.parse(JSON.stringify(p1)), d.events[0], 16);
  assert.equal(p2.friendship, p1.friendship);
  assert.equal(p2.memories.filter((m) => m.note?.startsWith('alquiler rent:1 ')).length, 1);
  const again = day(parseHousehold(JSON.parse(JSON.stringify(d.household)), 15), parseRoommate(JSON.parse(JSON.stringify(d.roommate))), 16);
  assert.equal(again.events.length, 0);
  // Incumplido: baja un poco.
  d = day(d.household, d.roommate, 22);
  assert.equal(d.events.length, 1);
  assert.equal(d.events[0].kept, false);
  assert.ok(rememberCommitment(p1, d.events[0], 22).trust < p1.trust);
});

check('(f) vencido sin pagar: missed+1, importes intactos y sin recargo hasta pasar el margen', () => {
  const h0 = sync(startHousehold(1), 3).household;
  let d = day(h0, startRoommate(KEVIN, 'olmo7', 3, h0), 8);
  assert.equal(d.roommate!.missed, 0);
  d = day(d.household, d.roommate, 15);
  assert.equal(d.roommate!.missed, 1, 'periodo 1 vence el 14');
  const o = rentOf(d.household, 1);
  assert.equal(o.amount, 45);
  assert.equal(o.mate, 18);
  assert.equal(o.fee, 0, 'el margen sigue');
  d = day(d.household, d.roommate, 21);
  assert.equal(rentOf(d.household, 1).fee, 0);
  assert.equal(d.roommate!.missed, 1);
  d = day(d.household, d.roommate, 22);
  assert.equal(rentOf(d.household, 1).fee, 5);
});

check('(g) mudarse a otra casa con sitio no rehace una aportación ya fijada', () => {
  const h0 = sync(startHousehold(1), 3).household;
  const d = day(h0, startRoommate(KEVIN, 'olmo7', 3, h0), 8);
  const moved = moveEffect(d.roommate, 'ronda8', 9)!;
  const again = applyShare(d.household, moved);
  assert.equal(again.applied.length, 0);
  assert.equal(rentOf(again.household, 1).mate, 18);
  const next = applyShare(sync(again.household, 15, { rent: 55 }).household, moved);
  assert.equal(rentOf(next.household, 2).mate, 22);
  assert.equal(total(rentOf(next.household, 2)), 33);
});

check('con la convivencia activa Kevin no está en Ribera (ni a la vez en dos sitios)', () => {
  const kevin = CHARACTERS.find((c) => c.npc === KEVIN.npc)!;
  const r = startRoommate(KEVIN, 'olmo7', 5);
  const pick = (dd: number) => routineFor(kevin, dd, { forced: routineId(r, 'kevin', dd) });
  for (let t = 6 * 1440 + 6 * 60; t < 12 * 1440; t += 30) {
    const w = whereabouts(kevin, t, pick);
    assert.notEqual(w.location, 'ribera', `minuto ${t}`);
  }
});

check('inicio a mitad de periodo: el periodo en curso no cambia; el siguiente, una vez', () => {
  let h = sync(startHousehold(1), 1).household;
  const r0 = startRoommate(KEVIN, 'olmo7', 3);
  let d = day(h, r0, 3);
  assert.equal(d.applied.length, 0);
  assert.equal(rentOf(d.household, 0).mate, undefined);
  d = day(d.household, d.roommate, 8);
  assert.equal(d.applied.length, 1);
  assert.equal(rentOf(d.household, 1).mate, 18);
  assert.equal(total(rentOf(d.household, 1)), 27);
  assert.equal(d.household.obligations.find((o) => o.bill === 'home' && o.period === 1)!.mate, undefined, 'los suministros los pagas tú');
  const again = day(d.household, d.roommate, 8);
  assert.equal(again.applied.length, 0, 'aportación única');
  h = again.household;
  assert.equal(rentOf(h, 1).mate, 18);
});

check('recarga (JSON) y salto de varios periodos sin aportaciones ni cobros duplicados', () => {
  const r0 = startRoommate(KEVIN, 'olmo7', 3);
  let d = day(sync(startHousehold(1), 1).household, r0, 8);
  const h = parseHousehold(JSON.parse(JSON.stringify(d.household)), 8);
  const r = parseRoommate(JSON.parse(JSON.stringify(d.roommate)));
  assert.deepEqual(h, d.household);
  assert.deepEqual(r, d.roommate);
  d = day(h, r, 29);
  assert.equal(d.applied.length, 3, 'periodos 2, 3 y 4');
  for (const k of [1, 2, 3, 4]) assert.equal(rentOf(d.household, k).mate, 18);
  const reload = day(parseHousehold(JSON.parse(JSON.stringify(d.household)), 29), parseRoommate(JSON.parse(JSON.stringify(d.roommate))), 29);
  assert.equal(reload.applied.length, 0);
  assert.equal(reload.events.length, 0);
  assert.equal(reload.household.obligations.filter((o) => o.bill === 'rent').length, d.household.obligations.filter((o) => o.bill === 'rent').length);
});

check('saldo insuficiente: pendiente, sin pago parcial ni saldo negativo; pagado no se recalcula', () => {
  const d = day(sync(startHousehold(1), 1).household, startRoommate(KEVIN, 'olmo7', 3), 8);
  const before = owed(d.household);
  const fail = pay(d.household, 10, 'rent', 1, 9);
  assert.equal(fail.ok, false);
  assert.equal(fail.money, 10);
  assert.equal(owed(fail.household), before);
  const ok = pay(d.household, 27, 'rent', 1, 9);
  assert.equal(ok.ok, true);
  assert.equal(ok.money, 0);
  const again = applyShare(ok.household, d.roommate);
  assert.equal(again.applied.length, 0);
  assert.equal(rentOf(again.household, 1).mate, 18);
});

check('compromiso cumplido/incumplido una vez por periodo, con su línea, sin doble penalización', () => {
  let d = day(sync(startHousehold(1), 1).household, startRoommate(KEVIN, 'olmo7', 3), 8);
  d = { ...d, household: pay(d.household, 100, 'rent', 1, 9).household };
  d = day(d.household, d.roommate, 29);
  assert.equal(d.roommate!.kept, 1);
  assert.equal(d.roommate!.missed, 2, 'periodos 2 y 3 vencidos sin pagar');
  assert.equal(d.events.length, 3);
  assert.ok(d.events.every((e) => e.line.startsWith('Kevin')));
  // El recargo sale de Household una sola vez; la memoria de Kevin no toca dinero ni importes.
  const p2 = rentOf(d.household, 2);
  assert.equal(p2.fee, 5);
  assert.equal(total(p2), 32);
  const again = day(d.household, d.roommate, 30);
  assert.equal(again.events.length, 0);
  assert.equal(again.roommate!.missed, 2);
  assert.equal(rentOf(again.household, 2).fee, 5);
  assert.ok((again.roommate!.evaluated ?? []).length <= 8);
});

check('fin a mitad de periodo: el en curso conserva su parte; los siguientes, no', () => {
  let d = day(sync(startHousehold(1), 1).household, startRoommate(KEVIN, 'olmo7', 3), 29);
  const ended = endRoommate(d.roommate!, 31);
  assert.equal(endRoommate(ended, 33).ended, 31, 'terminar dos veces no mueve la fecha');
  d = day(d.household, ended, 36);
  assert.equal(rentOf(d.household, 4).mate, 18);
  assert.equal(rentOf(d.household, 5).mate, undefined);
  assert.equal(total(rentOf(d.household, 5)), 45);
});

check('mudanza: a casa sin sitio termina; con sitio se mantiene (y se dice antes)', () => {
  const r = startRoommate(KEVIN, 'olmo7', 3);
  const toStudio = moveEffect(r, 'estudio', 10)!;
  assert.equal(toStudio.ended, 10);
  assert.match(moveNote(r, 'estudio'), /termina/);
  const toRonda = moveEffect(r, 'ronda8', 10)!;
  assert.equal(toRonda.ended, undefined);
  assert.equal(toRonda.home, 'ronda8');
  assert.match(moveNote(r, 'ronda8'), /contigo/);
  assert.equal(moveNote(undefined, 'estudio'), '');
});

check('mejora comprada una vez y trasladada', () => {
  const b = buy(startHousing(), 'cuadro-carmen', 100);
  assert.ok(b.ok);
  assert.ok(buyBlocker(b.housing, 'cuadro-carmen', 100));
  assert.ok(installedIn({ ...b.housing, home: 'ronda8' }).includes('cuadro-carmen'));
});

check('rutinas de convivencia: validan, acaban en su asiento (≠ visitas) y duermen en el portal', () => {
  const kevin = CHARACTERS.find((c) => c.npc === KEVIN.npc)!;
  const homes = HOMES.filter((h) => h.mate);
  assert.ok(homes.length >= 2);
  for (const h of homes) {
    const routine = kevin.routines.find((x) => x.id === mateRoutine(h.id));
    assert.ok(routine, `falta ${mateRoutine(h.id)}`);
    assert.ok(routine.story, 'nunca sale sola');
    assert.notEqual(h.mate!.seat, h.guestSeat);
    assert.equal(whereaboutsIn(kevin, routine, 6 * 60).stop.point, h.mate!.portal);
    assert.equal(whereaboutsIn(kevin, routine, 20 * 60 + 30).stop.point, h.mate!.seat);
    assert.equal(routine.stops[routine.stops.length - 1].point, h.mate!.portal);
  }
  const r = startRoommate(KEVIN, 'olmo7', 5);
  assert.equal(routineId(r, 'kevin', 5), undefined, 'el día ya empezado no cambia');
  assert.equal(routineId(r, 'kevin', 6), 'convive-olmo7');
  assert.equal(routineId(r, 'sara', 6), undefined);
  assert.equal(routineId(endRoommate(r, 9), 'kevin', 9), 'convive-olmo7');
  assert.equal(routineId(endRoommate(r, 9), 'kevin', 10), undefined);
});

check('previsión: sin contrato, con contrato y tras cambio de contrato; nunca suma a disponible', () => {
  const h = sync(startHousehold(1), 1).household;
  const housing = startHousing();
  const none = incomeOutlook(h, 1000, null, [], 2, { housing, roommate: undefined, mateReady: true });
  assert.equal(none.expected, 0);
  assert.equal(none.available, 1000 - 55);
  assert.ok(none.alternatives.some((a) => a.startsWith('Compartir')));
  // (e) dice dónde se hace de verdad.
  const share = none.alternatives.find((a) => a.startsWith('Compartir'))!;
  assert.match(share, /ordenador de casa/);
  assert.doesNotMatch(share, /habla con él/);
  assert.match(share, new RegExp(`${Math.round(KEVIN.share * 100)} %`));
  assert.ok(none.alternatives.some((a) => a.startsWith('Pedir trabajo')));
  assert.ok(none.alternatives.some((a) => a.startsWith('Mudarte')));
  assert.match(outlookText(none, 2), /Previsto/);
  const job = hire(JOBS[0], 1);
  const withJob = incomeOutlook(h, 1000, job, [], 2, { housing, roommate: undefined, mateReady: false });
  assert.equal(withJob.expected, Math.round(levelOf(job).wage * withJob.shifts * 100) / 100);
  assert.equal(withJob.available, none.available, 'el previsto no suma a disponible');
  assert.ok(!withJob.alternatives.some((a) => a.startsWith('Pedir trabajo')));
  assert.ok(!withJob.alternatives.some((a) => a.startsWith('Compartir')), 'sin la condición, no se ofrece');
  const up = promote(job, 2);
  const promoted = incomeOutlook(h, 1000, up, [], 2, { housing, roommate: undefined, mateReady: false });
  assert.equal(promoted.expected, Math.round(levelOf(up).wage * promoted.shifts * 100) / 100);
  const broke = incomeOutlook(h, 0, job, [], 2, { housing, roommate: startRoommate(KEVIN, 'olmo7', 1), mateReady: true });
  assert.ok(!broke.alternatives.some((a) => a.startsWith('Compartir')), 'con convivencia, no');
  assert.ok(!broke.alternatives.some((a) => a.startsWith('Mudarte')), 'sin dinero libre, no');
  const brokeText = outlookText(broke, 2);
  assert.ok(!brokeText.includes('€-'), `negativo mal escrito: ${brokeText}`);
  assert.match(brokeText, /Disponible: −€/);
  const collected = incomeOutlook(h, 0, null, [{ movementId: 'm-2-1', day: 2, hour: 10, minute: 0, label: 'Sueldo', amount: 60, type: 'income', source: 'job:decathlon', status: 'posted' }], 3, { housing, roommate: undefined, mateReady: false });
  assert.equal(collected.collected, 60);
  assert.equal(collected.available, -55, 'lo cobrado ya está en la cartera: no se suma otra vez');
});

check('partida antigua: sin roommate ni mate carga sin cobros históricos', () => {
  assert.equal(parseRoommate(undefined), undefined);
  assert.equal(parseRoommate({ mate: 'nadie', home: 'olmo7', since: 3 }), undefined);
  assert.equal(parseRoommate({ mate: 'kevin', home: 'estudio', since: 3 }), undefined, 'una casa sin sitio no vale');
  const old = parseHousehold({ since: 1, generated: { rent: 1 }, obligations: [{ bill: 'rent', period: 0, due: 7, amount: 45, fee: 0 }], goal: null }, 3);
  assert.equal(old.obligations[0].mate, undefined);
  assert.equal(total(old.obligations[0]), 45);
  const bad = parseHousehold({ since: 1, generated: {}, obligations: [{ bill: 'rent', period: 0, due: 7, amount: 45, fee: 0, mate: 99 }], goal: null }, 3);
  assert.equal(bad.obligations[0].mate, undefined, 'una aportación mayor que el importe se descarta');
  assert.equal(createInitialState().roommate, undefined);
  assert.equal(applyShare(old, undefined).applied.length, 0);
});

console.log(`check-roommate: ${passed} bien, ${failed} mal.`);
if (failed) process.exit(1);
