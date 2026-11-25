// VID-04 «Atender a un cliente» (systems/CustomerService): datos, puntos, grados, barra, cierre único y abandono.
// `npm run check`. Falla si algo no se cumple.
import assert from 'node:assert/strict';
import { ATTENTION } from '../src/data/customerService.ts';
import { SECTORS } from '../src/data/decathlon.ts';
import { getJob, JOBS } from '../src/data/jobs.ts';
import { AttentionRun, choiceFor, gradeOf, gradeRound, pickCase, shelfOrder } from '../src/systems/CustomerService.ts';
import { clockInBlocker, hire, nextShift, parseJob, work } from '../src/systems/Jobs.ts';
import { absMinute } from '../src/systems/Handoff.ts';

const ids = new Set(SECTORS.map((s) => s.id));
const [excellent, good, poor] = ATTENTION.grades;

// (a) datos
assert.ok(ATTENTION.cases.length >= 3, 'al menos tres casos');
for (const c of ATTENTION.cases) {
  assert.equal(c.rounds.length, 3, `${c.id}: tres rondas`);
  c.rounds.forEach((r, i) => {
    const tag = `${c.id}/${i}`;
    assert.equal(r.shelf.length, 5, `${tag}: cinco en el estante`);
    assert.equal(new Set(r.shelf).size, 5, `${tag}: estante sin repetidos`);
    for (const id of [r.exact, ...r.near, ...r.shelf]) assert.ok(ids.has(id), `${tag}: ${id} no está en SECTORS`);
    assert.ok(r.shelf.includes(r.exact), `${tag}: exact en el estante`);
    for (const n of r.near) assert.ok(r.shelf.includes(n) && n !== r.exact, `${tag}: near en el estante`);
    assert.ok(r.hint.length > 0, `${tag}: pista`);
  });
  for (const k of ['exact', 'near', 'wrong', 'timeout'] as const) assert.ok(c.replies[k].length > 0, `${c.id}: respuesta ${k}`);
}
const job = getJob('decathlon');
assert.equal(job.minigame, 'decathlon-cliente');
assert.deepEqual(JOBS.filter((j) => j.minigame).map((j) => j.id), ['decathlon'], 'el minijuego, sólo en Decathlon');

// (b) puntos
const r0 = ATTENTION.cases[0].rounds[0];
const wrongId = r0.shelf.find((s) => s !== r0.exact && !r0.near.includes(s))!;
assert.equal(gradeRound(r0, r0.exact, 0.39), 3);
assert.equal(gradeRound(r0, r0.exact, 0.4), 4, 'bono en el umbral');
assert.equal(gradeRound(r0, r0.exact, 0.3999), 3, 'sin bono justo por debajo');
assert.equal(gradeRound(r0, r0.near[0], 1), 1);
assert.equal(gradeRound(r0, wrongId, 1), 0);
assert.equal(gradeRound(r0, null, 1), 0);

// (c) grados
assert.equal(gradeOf(12).id, 'excellent');
assert.equal(gradeOf(10).id, 'excellent');
assert.equal(gradeOf(9).id, 'good');
assert.equal(gradeOf(5).id, 'good');
assert.equal(gradeOf(4).id, 'poor');
assert.equal(gradeOf(0).id, 'poor');
assert.equal(ATTENTION.maxPoints, 3 * (ATTENTION.points.exact + ATTENTION.points.speedBonus));

// (d) timeout: 0 puntos y una sola ronda de avance
let run = new AttentionRun(pickCase(1, 0));
for (let i = 0; i < ATTENTION.roundMs / 100 - 1; i++) run.tick(100);
assert.equal(run.round, 0, 'aún no se acaba');
run.tick(100);
assert.equal(run.round, 1, 'avanza al acabarse la barra');
assert.equal(run.points, 0);
assert.deepEqual(run.history, [{ picked: null, result: 'timeout', points: 0 }]);
run.tick(100);
assert.equal(run.round, 1, 'avanza una sola vez');

// (e) tick
run = new AttentionRun(pickCase(1, 0));
run.tick(0);
run.tick(-50);
run.tick(Number.NaN);
assert.equal(run.remainingMs, ATTENTION.roundMs, 'delta <= 0 no cuenta');
run.tick(5000);
assert.equal(run.remainingMs, ATTENTION.roundMs - 100, 'el delta se limita a 100 ms');
for (let i = 0; i < 1000; i++) {
  run.tick(100);
  assert.ok(run.remainingMs >= 0, 'la barra nunca es negativa');
}
assert.ok(run.done);
assert.equal(run.points, 0);

// (f) recompensa única
assert.deepEqual(ATTENTION.grades.filter((g) => g.choice.bonus).map((g) => [g.id, g.choice.bonus]), [['excellent', 6]]);
assert.equal(excellent.choice.score, 1);
assert.equal(good.choice.score, 0);
assert.equal(poor.choice.score, -1);
assert.equal(choiceFor(12), excellent.choice);
const contract = parseJob(JSON.parse(JSON.stringify(hire(job, 1))));
assert.ok(contract, 'el contrato se lee como guardado');
// El primer turno real del contrato, a su hora de entrada (puntual): sale de los datos del job, no de un día escrito.
const lvl = job.levels[contract.level];
const next = nextShift(contract, absMinute(1, 0, 0));
assert.ok(next, 'el contrato tiene un turno próximo');
const shiftAt = absMinute(next.day, lvl.start, 0);
const shiftEnd = absMinute(next.day, lvl.start + lvl.hours, 0);
assert.equal(clockInBlocker(contract, shiftAt, 90), null, 'a la hora del turno se ficha');
const best = work(contract, shiftAt, choiceFor(12));
const worst = work(contract, shiftAt, choiceFor(0));
assert.ok(best.money > worst.money, 'excellent paga más');
assert.equal(best.money - worst.money, 6);
assert.equal(best.progress.good, 1, 'excellent suma turno bueno');
assert.equal(worst.progress.good, 0, 'poor no suma');

// (g) abandono
run = new AttentionRun(pickCase(2, 0));
const c2 = run.case;
assert.ok(run.deliver(c2.rounds[0].exact));
const before = { round: run.round, points: run.points, history: run.history.length };
run.cancel();
assert.deepEqual({ round: run.round, points: run.points, history: run.history.length }, before, 'cancel no revierte');
assert.equal(run.finish(), null, 'abandonado: sin choice');
assert.equal(run.deliver(c2.rounds[1].exact), null, 'abandonado: no se entrega');

// (h) cierre único y turno hecho
run = new AttentionRun(pickCase(3, 0));
for (const r of run.case.rounds) {
  assert.ok(run.deliver(r.exact));
  for (let i = 0; i < 4; i++) run.tick(100);
}
assert.ok(run.done);
assert.equal(run.deliver(run.case.rounds[0].exact), null, 'terminado: no se entrega');
const fin = run.finish();
assert.ok(fin);
assert.equal(fin.points, 12);
assert.equal(fin.grade.id, 'excellent');
assert.equal(run.finish(), null, 'el segundo finish no paga');
const paid = work(contract, shiftAt, fin.choice);
assert.match(clockInBlocker(paid.progress, shiftEnd, 90)!,/^El turno de hoy ya está hecho\./);

// (i) determinismo
assert.equal(pickCase(5, 1), pickCase(5, 1));
assert.equal(pickCase(0, 0), ATTENTION.cases[0]);
assert.equal(pickCase(1, 1), ATTENTION.cases[2 % ATTENTION.cases.length]);
for (const c of ATTENTION.cases) {
  for (let i = 0; i < 3; i++) {
    const a = shelfOrder(c, i, 7);
    assert.deepEqual(a, shelfOrder(c, i, 7), 'mismo orden');
    assert.deepEqual([...a].sort(), [...c.rounds[i].shelf].sort(), 'permutación del estante');
  }
}

// (j) lock
run = new AttentionRun(pickCase(1, 0));
const first = run.case.rounds[0];
assert.equal(run.deliver(first.exact)?.result, 'exact');
assert.equal(run.deliver(run.case.rounds[1].exact), null, 'bloqueado tras entregar');
assert.equal(run.round, 1);
for (let i = 0; i < ATTENTION.lockMs / 100; i++) run.tick(100);
assert.equal(run.deliver(run.case.rounds[1].exact)?.reply, run.case.replies.exact, 'tras el bloqueo, sí');

console.log('check-atencion-cliente: ok');
