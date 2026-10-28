// Empleo con contrato (systems/Jobs): oferta, horario, asistencia, cobro único, faltas, recuperación y ascenso.
// `npm run check`. Falla si algo no se cumple.
import assert from 'node:assert/strict';
import { getJob, JOBS } from '../src/data/jobs.ts';
import { getActivity } from '../src/data/activities.ts';
import { STOPS } from '../src/data/transit.ts';
import { LOCATIONS } from '../src/data/locations.ts';
import {
  clockInBlocker, decline, hire, hireBlocker, nextShift, parseJob, promote, promotionReady, quit, REHIRE_DAYS, settle,
  situationFor, statusOf, work, type JobProgress,
} from '../src/systems/Jobs.ts';
import { absMinute } from '../src/systems/Handoff.ts';
import { weekIndex } from '../src/systems/Calendar.ts';
import { SaveSystem } from '../src/systems/SaveSystem.ts';
import { SAVE_KEY } from '../src/config/constants.ts';

const job = getJob('decathlon');
const t = (day: number, h: number, m = 0): number => absMinute(day, h, m);
const best = (p: JobProgress, day: number) => situationFor(p, day).choices[0];
const worst = (p: JobProgress, day: number) => situationFor(p, day).choices[2];

// ------------------------------------------------------------------ datos

for (const j of JOBS) {
  // Su parada tiene estación (Alpha-09: el Polígono Norte) y su interior, el fichaje.
  assert.ok(STOPS.some((s) => s.id === j.place && s.station), `${j.id}: su parada sin estación`);
  assert.ok(LOCATIONS.some((l) => l.workplace === j.id && l.spots?.some((s) => s.job === j.id)), `${j.id}: sin fichaje en su lugar de trabajo`);
  getActivity(j.casual);
  assert.ok(j.levels.length >= 2, `${j.id}: dos niveles`);
  assert.ok(j.situations.length >= 3, `${j.id}: al menos tres situaciones`);
  for (const l of j.levels) assert.ok(l.days.length < 7 && l.start * 60 - j.early >= 0 && l.start + l.hours <= 24, `${j.id}/${l.id}: días libres y turno dentro del día`);
  for (const s of j.situations) assert.ok(s.choices.length >= 2 && s.choices.every((c) => Math.abs(c.score) <= 1), `${j.id}/${s.id}: consecuencias proporcionadas`);
}

// --------------------------------------------- partida nueva: primera semana

// Día 1 es lunes 08:30 (INITIAL_CLOCK). Se firma el lunes: el primer turno es el miércoles, el martes queda libre.
let p = hire(job, 1);
assert.equal(hireBlocker(job, null, 1), null);
assert.equal(statusOf(p, 1, t(1, 10)), 'none', 'el día de firmar no hay turno');
assert.equal(statusOf(p, 2, t(2, 10)), 'none', 'martes libre');
assert.deepEqual(nextShift(p, t(1, 9)), { day: 3, status: 'upcoming' }, 'primer turno, el miércoles');
assert.equal(hireBlocker(job, p, 1), 'Ya trabajas aquí.');

// Llegar demasiado pronto: aún no se ficha.
assert.match(clockInBlocker(p, t(3, 6, 30), 90)!, /se ficha desde las 07:00/);
assert.equal(clockInBlocker(p, t(3, 7, 30), 90), null, 'quien llega pronto ficha y espera en la sala de descanso');
// Agotado: no se ficha (y el motivo se dice).
assert.match(clockInBlocker(p, t(3, 9, 30), 20)!, /cansado/);
// Antes de hora, con energía: se ficha, se espera a las 10 y se sale a las 16.
assert.equal(clockInBlocker(p, t(3, 9, 30), 90), null);
let out = work(p, t(3, 9, 30), best(p, 3));
assert.equal(out.minutes, 16 * 60 - (9 * 60 + 30), 'espera más turno entero');
assert.equal(out.money, 60);
assert.ok(out.energy < -30, 'cansa');
assert.equal(out.progress.good, 1);
p = out.progress;
// El mismo turno no se cobra dos veces.
assert.match(clockInBlocker(p, t(3, 16), 90)!, /ya está hecho/);
assert.equal(statusOf(p, 3, t(3, 17)), 'done');

// Tarde (11:00): cobra lo trabajado, sale a las 16, no cuenta como bueno.
out = work(p, t(5, 11), best(p, 5));
assert.equal(out.money, 50, '5 de 6 horas');
assert.equal(out.minutes, 5 * 60);
assert.ok(out.late && out.progress.good === 1 && out.progress.shifts[5].result === 'late');
p = out.progress;

// Demasiado tarde: falta. El repaso la cuenta una vez, aunque se repita.
assert.match(clockInBlocker(p, t(8, 12, 1), 90)!, /cuenta como falta/);
let s = settle(p, t(8, 12, 1));
assert.deepEqual([s.missed, s.progress.strikes], [[8], 1]);
const again = settle(s.progress, t(8, 23, 59));
assert.deepEqual([again.missed, again.progress.strikes], [[], 1], 'repasar dos veces no duplica');
// Cruzar medianoche: el repaso del día siguiente tampoco la vuelve a contar.
assert.deepEqual(settle(again.progress, t(9, 0, 0)).missed, []);
p = again.progress;

// Recuperación: dos turnos buenos seguidos borran la falta; el camino al ascenso sigue abierto.
for (const d of [10, 12]) {
  assert.equal(weekIndex(d) % 2, 0, 'lunes/miércoles/viernes');
  p = work(p, t(d, 10), best(p, d)).progress;
}
assert.equal(p.strikes, 0, 'falta perdonada');
assert.equal(promotionReady(p), null, 'aún faltan buenos turnos');
// Una mala decisión, aunque puntual, no cuenta como buen turno.
const meh = work(p, t(15, 10), worst(p, 15));
assert.equal(meh.progress.good, p.good);
p = work(p, t(15, 10), best(p, 15)).progress;
assert.equal(p.good, 4);

// --------------------------------------------------------------- ascenso

const next = promotionReady(p);
assert.equal(next?.id, 'responsable');
// Rechazar: se vuelve a proponer tras otros cuatro buenos turnos.
assert.equal(promotionReady(decline(p)), null);
// Aceptar: nivel nuevo, sus días desde mañana (martes, jueves, sábado a las 9).
const up = promote(p, 15);
assert.equal(up.level, 1);
assert.equal(statusOf(up, 16, t(16, 8, 30)), 'open');
assert.equal(statusOf(up, 17, t(17, 9)), 'none', 'miércoles ya no toca');
assert.equal(work(up, t(16, 9), best(up, 16)).money, 84);
assert.equal(promotionReady(up), null, 'último nivel');

// ------------------------------------------------- saltar días y despido

// Varios días sin ir: cada turno perdido cuenta una vez, y a la tercera, despido.
s = settle(hire(job, 1), t(30, 12));
assert.deepEqual(s.missed, [3, 5, 8], 'tres faltas y fuera');
assert.ok(s.fired && s.progress.status === 'fired' && s.progress.ended === 8);
assert.match(hireBlocker(job, s.progress, 9)!, /no te vuelven a contratar/);
assert.equal(hireBlocker(job, s.progress, 8 + REHIRE_DAYS), null);
assert.deepEqual(settle(s.progress, t(40, 12)).missed, [], 'despedido, nada más que contar');

// Dejarlo: sin turnos, y se puede volver a firmar.
const left = quit(hire(job, 1), 2);
assert.equal(nextShift(left, t(3, 9)), null);
assert.equal(hireBlocker(job, left, 2), null);

// La situación de un turno es fija: cancelar y volver muestra la misma.
assert.equal(situationFor(p, 22).id, situationFor(structuredClone(p), 22).id);
assert.ok(new Set([3, 5, 8, 10].map((d) => situationFor(hire(job, 1), d).id)).size >= 3, 'las situaciones varían');

// ------------------------------------------------------------- guardado

{
  const store = new Map<string, string>();
  const save = new SaveSystem({ read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) });
  // Partida antigua: sin contrato, con su dinero, bolsa y relaciones intactos.
  const old = { money: 900, energy: 70, day: 3, hour: 12, minute: 5, locationId: 'district', position: { x: 10, y: 10 }, facing: 'down', inventory: { water: 2 }, cards: { transport: 8.5 }, social: {} };
  store.set(SAVE_KEY, JSON.stringify({ version: 1, savedAt: 0, state: old }));
  const loaded = save.load()!;
  assert.deepEqual([loaded.job, loaded.money, loaded.inventory, loaded.cards], [null, 900, { water: 2 }, { transport: 8.5 }]);

  // Tras cobrar, guardar y recargar: el turno sigue cobrado y no se puede volver a cobrar.
  const paid = work(hire(job, 1), t(3, 10), best(hire(job, 1), 3));
  save.save({ ...loaded, money: loaded.money + paid.money, job: paid.progress });
  const back = save.load()!;
  assert.deepEqual(back.job, paid.progress);
  assert.equal(back.money, 960);
  assert.match(clockInBlocker(back.job!, t(3, 16), 90)!, /ya está hecho/);

  // Un contrato tocado a mano o de un empleo que ya no existe: sin contrato, sin romper la carga.
  assert.equal(parseJob({ ...paid.progress, job: 'fabrica' }), null);
  assert.equal(parseJob({ ...paid.progress, level: 9 }), null);
  assert.deepEqual(parseJob({ ...paid.progress, shifts: { 3: { result: 'cobrado', score: 1, pay: 1e6 } } })?.shifts, {});
}

console.log(`empleo: ${job.employer} · ${job.levels.map((l) => `${l.title} ${l.wage}€`).join(' → ')} · ${job.situations.length} situaciones · ok`);
