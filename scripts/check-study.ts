// Estudios (systems/Study): matrícula, clases y tutoría, práctica con rendimientos decrecientes, prueba final,
// encargo con plazo, desbloqueo en el empleo y partidas antiguas. `npm run check`. Falla si algo no se cumple.
import assert from 'node:assert/strict';
import { COURSES, GIGS, PRACTICE_SITES, getCourse, getGig } from '../src/data/study.ts';
import { getJob, JOBS } from '../src/data/jobs.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import {
  acceptGig, attend, classBlocker, coursesAt, feeFor, passedCourse, deliver, deliverBlocker, demo, demoBlocker, emptyStudy, enroll, enrollBlocker, gigStatus, hasCamera,
  knowledge, lessonStatus, nextSession, parseStudy, practice, practiceBlocker, practiceGain, schedule, sessionNow, type StudyState,
} from '../src/systems/Study.ts';
import { hire, promotionReady, situationFor, work } from '../src/systems/Jobs.ts';
import { absMinute } from '../src/systems/Handoff.ts';
import { weekIndex } from '../src/systems/Calendar.ts';
import { createInitialState, SaveSystem } from '../src/systems/SaveSystem.ts';
import { opportunities, opportunityInput } from '../src/systems/Opportunities.ts';
import { SAVE_KEY } from '../src/config/constants.ts';

const c = getCourse('foto-basica');
const gig = getGig(c.gig!);
const [fuente, carmen] = PRACTICE_SITES;
const t = (day: number, h: number, m = 0): number => absMinute(day, h, m);
const reload = (s: StudyState): StudyState => parseStudy(JSON.parse(JSON.stringify(s)));
const BEST = c.demo.steps.map((st) => st.choices.findIndex((ch) => ch.points === Math.max(...st.choices.map((x) => x.points))));

// ------------------------------------------------------------------ datos y mapa

// Cada punto de estudio está en el mapa: la puerta del centro, la del horno y los dos sitios de práctica.
const vallesco = getLocation('district');
const ids = new Set([...(vallesco.buildings ?? []).map((b) => b.study), ...(vallesco.spots ?? []).map((s) => s.study)].filter(Boolean));
for (const id of [...COURSES.map((x) => x.desk), ...GIGS.map((g) => g.site), ...PRACTICE_SITES.map((p) => p.id)]) assert.ok(ids.has(id), `${id}: sin sitio en el mapa`);
// Compatible con el trabajo: ninguna clase pisa un turno, y en cada puesto queda una tutoría libre.
for (const job of JOBS) {
  for (const lvl of job.levels) {
    for (const d of c.days) assert.ok(!lvl.days.includes(d) || lvl.start + lvl.hours <= c.start - c.early / 60, `${job.id}/${lvl.id}: la clase pisa el turno`);
    assert.ok(c.recovery.days.some((d) => !lvl.days.includes(d)), `${job.id}/${lvl.id}: sin tutoría libre`);
  }
}

// -------------------------------------------------------------- matrícula

let s = emptyStudy();
assert.match(enrollBlocker(c, s, c.fee - 0.5)!, /Te faltan €0,50/, 'dinero insuficiente: explica cuánto falta');
assert.equal(enrollBlocker(c, s, c.fee), null, 'con el importe justo, se puede');
assert.equal(hasCamera(s), false);
assert.match(practiceBlocker(fuente, s, t(1, 12), 80)!, /Sin cámara/);
// Día 1 es lunes: clases martes y jueves de las dos semanas siguientes.
s = enroll(c, s, 1);
assert.deepEqual(s.course!.lessons, [2, 4, 9, 11]);
assert.deepEqual(schedule(c, 1).map(weekIndex), [1, 3, 1, 3]);
assert.ok(hasCamera(s), 'la cámara se presta al matricularse');
assert.equal(enrollBlocker(c, s, 999), 'Ya estás matriculado.');
assert.deepEqual(reload(s), s, 'la matrícula sobrevive a recargar');

// ----------------------------------------------------------------- clases

assert.match(classBlocker(c, s, t(2, 12), 80)!, /Próxima: Clase 1 · La luz · .* a las 18:00/, 'se consulta la próxima sesión');
assert.equal(lessonStatus(c, s.course!, 0, t(2, 17, 30)), 'open');
assert.match(classBlocker(c, s, t(2, 18), 10)!, /cansado/);
let o = attend(c, s, t(2, 17, 40));
assert.equal(o.minutes, 20 + 120, 'se espera a la hora y dura dos horas');
assert.equal(o.energy, c.energy);
s = o.study;
assert.equal(knowledge(s, 'foto'), c.gain);
assert.equal(sessionNow(c, s.course!, t(2, 18)), null, 'la clase hecha no se repite');

// Clase perdida: el jueves no se va. Se ve perdida y la próxima sesión útil es la tutoría del sábado.
assert.equal(lessonStatus(c, s.course!, 1, t(4, 18, 16)), 'missed');
assert.match(demoBlocker(c, s, t(12, 12), 80)!, /faltan 3 clases/);
const next = nextSession(c, s.course!, t(5, 9))!;
assert.deepEqual([next.kind, next.day, next.lesson], ['recovery', 6, 1], 'recuperar: tutoría del sábado');
o = attend(c, s, t(6, 10, 50));
assert.match(o.lines[0], /Tutoría.*recuperas «Encuadre»/);
s = o.study;
assert.deepEqual(s.course!.attended, [0, 1]);
// Sin nada perdido, la tutoría no abre.
assert.equal(sessionNow(c, s.course!, t(7, 11)), null);
for (const day of [9, 11]) s = attend(c, s, t(day, 18)).study;
assert.equal(knowledge(s, 'foto'), 4 * c.gain);
assert.equal(classBlocker(c, s, t(16, 18), 80), 'Ya has hecho todas las clases.');

// ------------------------------------------------- práctica: rendimientos decrecientes

const good = fuente.choices[0];
const g1 = practiceGain(fuente, s, 12, good.points);
assert.equal(g1, fuente.gain + good.points);
let k = knowledge(s, 'foto');
o = practice(fuente, s, good, t(12, 10));
assert.equal(knowledge(o.study, 'foto'), k + g1);
assert.equal(o.minutes, fuente.minutes + good.minutes!);
const s2 = o.study;
assert.equal(practiceGain(fuente, s2, 12, good.points), Math.round(g1 / 2), 'repetir el mismo día y sitio: la mitad');
const s3 = practice(fuente, s2, good, t(12, 12)).study;
assert.equal(practiceGain(fuente, s3, 12, good.points), Math.round(g1 / 4));
assert.match(practice(fuente, s3, good, t(12, 14)).lines[1], /rinde menos/);
assert.equal(practiceGain(carmen, s3, 12, good.points), carmen.gain + good.points, 'otro sitio, entero');
assert.equal(practiceGain(fuente, s3, 13, good.points), g1, 'otro día, entero');
assert.equal(practiceGain(fuente, reload(s3), 12, good.points), Math.round(g1 / 4), 'recargar no reinicia la cuenta del día');
assert.match(practiceBlocker(fuente, s3, t(12, 23), 80)!, /Sin luz/);
assert.equal(practiceGain(fuente, s, 12, fuente.choices[2].points), fuente.gain + fuente.choices[2].points, 'hacerlo deprisa rinde menos');

// --------------------------------------------------------- prueba final

// Sólo con las clases (48) y decisiones perfectas (30) no llega: hay que practicar.
const fail = demo(c, s, BEST, t(12, 11));
assert.equal(fail.passed, false);
assert.match(fail.lines.at(-1)!, /Te faltan 2 puntos.*práctica en la calle/);
s = fail.study;
assert.equal(demoBlocker(c, s, t(12, 15), 80), 'Hoy ya hiciste la prueba. Puedes repetirla mañana.');
assert.equal(demoBlocker(c, reload(s), t(12, 15), 80), 'Hoy ya hiciste la prueba. Puedes repetirla mañana.', 'recargar no da otro intento');
assert.equal(gigStatus(gig, s, t(12, 15)), 'locked');
// Una decisión floja explica qué repasar.
assert.match(demo(c, s, [BEST[0], (BEST[1] + 1) % 3, BEST[2]], t(13, 11)).lines.at(-1)!, /Repasa el encuadre/);
// Practica dos sitios y vuelve al día siguiente: aprueba. Determinista: lo mismo da lo mismo.
s = practice(fuente, s, good, t(12, 16)).study;
s = practice(carmen, s, carmen.choices[0], t(12, 18)).study;
k = knowledge(s, 'foto');
const pass = demo(c, s, BEST, t(13, 11));
assert.deepEqual(demo(c, s, BEST, t(13, 11)), pass);
assert.ok(pass.passed && pass.score === k + 30);
s = pass.study;
assert.equal(demoBlocker(c, s, t(14, 11), 80), 'Prueba aprobada.');

// ------------------------------------------------------------- encargo

assert.ok(s.unlocks.includes(`gig:${gig.id}`), 'aprobar abre el encargo');
assert.equal(gigStatus(gig, s, t(13, 13)), 'offered');
assert.match(deliverBlocker(gig, s, t(14, 9), 80)!, /Primero acepta/);
s = acceptGig(gig, s, 13);
assert.equal(s.gig!.deadline, 13 + gig.days);
assert.match(deliverBlocker(gig, s, t(14, 15), 80)!, /entre las 08:00 y las 12:00/);
// Plazo cruzado durmiendo: se acuesta el último día a las 23:00 sin hacerlo y se despierta pasado.
assert.equal(gigStatus(gig, s, t(16, 11, 59)), 'active');
assert.equal(gigStatus(gig, s, t(17, 7)), 'expired');
assert.equal(gigStatus(gig, reload(s), t(17, 7)), 'expired');
assert.match(deliverBlocker(gig, s, t(17, 9), 80)!, /Se pasó el plazo/);
// Recuperación: se pide otro plazo en el centro.
s = acceptGig(gig, s, 17);
assert.equal(gigStatus(gig, s, t(18, 9)), 'active');
assert.ok(hasCamera(s));
o = deliver(gig, s, gig.choices[0], t(18, 9));
assert.equal(o.money, gig.pay + gig.choices[0].points, 'paga y propina');
s = o.study;
assert.equal(gigStatus(gig, s, t(18, 11)), 'done');
assert.equal(deliverBlocker(gig, s, t(18, 11), 80), 'Encargo entregado.', 'se cobra una sola vez');
assert.equal(deliverBlocker(gig, reload(s), t(19, 9), 80), 'Encargo entregado.', 'ni tras recargar');
assert.equal(hasCamera(s), false, 'la cámara se devuelve al entregar');
assert.match(practiceBlocker(fuente, s, t(19, 12), 80)!, /devolviste/);
assert.deepEqual(reload(s), s, 'habilidad, curso, encargo y desbloqueos sobreviven a recargar');

// --------------------------------------------- la oportunidad: un plus en el empleo

const job = getJob('decathlon');
const perk = job.perks!.find((p) => p.unlock === gig.unlock)!;
assert.ok(perk && s.unlocks.includes(perk.unlock), 'el encargo abre las fotos de producto');
assert.ok(!emptyStudy().unlocks.includes(perk.unlock));
const contract = hire(job, 1);
const plain = work(contract, t(3, 10), situationFor(contract, 3).choices[0]);
const plus = work(contract, t(3, 10), perk);
assert.equal(plus.money, plain.money + perk.bonus!, 'el plus va con el sueldo del turno');
assert.equal(plus.progress.shifts[3].pay, plus.money);

// --------------------------------------------------------- partidas antiguas y guardados raros

{
  const store = new Map<string, string>();
  const save = new SaveSystem({ read: (key) => store.get(key) ?? null, write: (key, v) => void store.set(key, v), remove: (key) => void store.delete(key) });
  store.set(SAVE_KEY, JSON.stringify({ version: 1, savedAt: 0, state: { money: 50, energy: 70, day: 30, hour: 10, minute: 0, locationId: 'home', position: { x: 10, y: 10 }, facing: 'down' } }));
  const loaded = save.load()!;
  assert.deepEqual(loaded.study, emptyStudy(), 'una partida anterior carga sin curso');
  save.save({ ...loaded, study: s });
  assert.deepEqual(save.load()!.study, s);
}
assert.deepEqual(parseStudy({ skills: { foto: 'mucho', cocina: 30 }, course: { id: 'foto-basica', enrolled: 1, lessons: [2] }, gig: { id: 'yate' }, unlocks: [3] }), emptyStudy());
assert.equal(parseStudy({ skills: { foto: 400 } }).skills.foto, 100);

// ------------------------------------------- LV-03: Ofimática y gestión y el folleto del metro
// Controles positivos: sin `passedCourse` en enrollBlocker, «matricularse otra vez tras aprobar» falla; sin courseOpen,
// «dos cursos a la vez» falla; sin `flyer`, «€20 con folleto» falla; sin el perk, «el turno cansa menos» falla.
{
  const o = getCourse('ofimatica');
  const BEST_O = o.demo.steps.map((st) => st.choices.findIndex((ch) => ch.points === Math.max(...st.choices.map((x) => x.points))));
  assert.deepEqual(coursesAt(o.desk).map((x) => x.id), ['foto-basica', 'ofimatica'], 'la misma ventanilla da los dos cursos');
  for (const job of JOBS) for (const lvl of job.levels) for (const d of o.days) assert.ok(!lvl.days.includes(d) || lvl.start + lvl.hours <= o.start - o.early / 60, `${job.id}/${lvl.id}: Ofimática pisa el turno`);
  // El folleto: la marca del metro (int-folleto → folleto:cursos) baja la matrícula; sin ella, precio entero.
  assert.equal(feeFor(o, {}), 30);
  assert.equal(feeFor(o, { 'folleto:cursos': 3 }), 20);
  assert.equal(feeFor(c, { 'folleto:cursos': 3 }), c.fee, 'el folleto es de Ofimática, no de Fotografía');
  assert.match(enrollBlocker(o, emptyStudy(), 25, 30) ?? '', /Te faltan €5/);
  assert.equal(enrollBlocker(o, emptyStudy(), 25, 20), null, 'con el folleto, €25 llegan');
  // Uno a la vez: con Fotografía sin aprobar, o aprobada con el encargo pendiente, no.
  let x = enroll(c, emptyStudy(), 1);
  assert.match(enrollBlocker(o, x, 100) ?? '', /Ya estás en Fotografía básica/);
  x.course!.passed = 12;
  x = { ...x, gig: { id: gig.id } };
  assert.match(enrollBlocker(o, x, 100) ?? '', /entrega el encargo/);
  x = { ...x, gig: { id: gig.id, accepted: 12, deadline: 15, done: 13 } };
  assert.equal(enrollBlocker(o, x, 100), null, 'Fotografía acabada: se puede empezar Ofimática');
  assert.ok(passedCourse(x, 'foto-basica'), 'partida de antes, sin `curso:` apuntado: cuenta como aprobado');
  x = enroll(o, x, 13); // lunes 13 → clases los lunes y miércoles siguientes
  assert.ok(x.unlocks.includes('curso:foto-basica') && passedCourse(x, 'foto-basica'), 'al cambiar, Fotografía queda aprobada');
  assert.equal(enrollBlocker(c, x, 100), 'Ya aprobaste este curso.');
  assert.equal(enrollBlocker(o, x, 100), 'Ya estás matriculado.', 'doble clic: no se matricula dos veces');
  assert.equal(hasCamera(x), false, 'Ofimática no presta cámara');
  assert.deepEqual(x.course!.lessons.map(weekIndex), [0, 2, 0, 2]);
  // Asistencia: 4 clases × 15 = 60 de conocimiento; la prueba pide 75.
  const k0 = knowledge(x, 'ofimatica');
  for (const d of x.course!.lessons) x = attend(o, x, t(d, o.start)).study;
  assert.equal(knowledge(x, 'ofimatica') - k0, 60);
  const examDay = x.course!.lessons.at(-1)! + 1;
  const fail = demo(o, x, [2, 2, 1], t(examDay, 11));
  assert.equal(fail.passed, false);
  assert.match(fail.lines.at(-1)!, /Repasa .*hoja de cálculo.*correo/);
  assert.match(demoBlocker(o, fail.study, t(examDay, 12), 100) ?? '', /mañana/, 'una prueba al día');
  const pass = demo(o, fail.study, BEST_O, t(examDay + 1, 11));
  assert.ok(pass.passed && pass.study.unlocks.includes('ofimatica') && pass.study.unlocks.includes('curso:ofimatica'));
  assert.equal(pass.money, 0, 'aprobar no paga: el beneficio está en el turno');
  x = reload(pass.study);
  // Idempotente: aprobado no se repite ni se vuelve a matricular, y el desbloqueo no se duplica.
  assert.equal(demoBlocker(o, x, t(examDay + 2, 11), 100), 'Prueba aprobada.');
  assert.equal(enrollBlocker(o, x, 100), 'Ya aprobaste este curso.');
  assert.equal(x.unlocks.filter((u) => u === 'ofimatica').length, 1);
  assert.deepEqual(reload(x), x, 'recargar no cambia nada');
  // El beneficio: una decisión más en el turno de Atalaya (cansa menos y paga más); en Decathlon no sale.
  const office = getJob('atalaya');
  const perk = office.perks!.find((p) => x.unlocks.includes(p.unlock))!;
  assert.ok(perk, 'Ofimática abre una decisión en la oficina');
  assert.ok(!(getJob('decathlon').perks ?? []).some((p) => p.unlock === 'ofimatica'));
  // …y el requisito del ascenso a administrativo: con el contrato listo, sólo tras aprobar.
  const ready = { ...hire(office, 1), good: office.promoteAfter };
  assert.equal(promotionReady(ready, fail.study.unlocks), null, 'sin aprobar Ofimática no hay ascenso');
  assert.equal(promotionReady(ready, x.unlocks)?.id, 'administrativo', 'aprobada, sí');
  const day = 2;
  const p = hire(office, 1);
  const plain = work(p, t(day, 9), situationFor(p, day).choices[0]);
  const withPerk = work(p, t(day, 9), perk);
  assert.ok(withPerk.energy > plain.energy, `cansa menos: ${withPerk.energy} > ${plain.energy}`);
  assert.equal(withPerk.money, office.levels[0].wage + 8);
  // La agenda (app Hoy): el folleto sale con la marca, y se va al matricularse o al aprobar.
  const base = createInitialState();
  const opp = (st: StudyState, flags: Record<string, number>) => opportunities({ ...opportunityInput({ ...base, study: st }, t(1, 9)), flags }).map((q) => q.id);
  assert.ok(!opp(emptyStudy(), {}).includes('folleto'));
  const folleto = opportunities({ ...opportunityInput({ ...base, study: emptyStudy() }, t(1, 9)), flags: { 'folleto:cursos': 1 } }).find((q) => q.id === 'folleto')!;
  assert.match(folleto.title + folleto.text, /Ofimática y gestión.*€20/);
  assert.ok(!opp(enroll(o, emptyStudy(), 1), { 'folleto:cursos': 1 }).includes('folleto'));
  assert.ok(!opp(x, { 'folleto:cursos': 1 }).includes('folleto'));
  assert.ok(!opp(enroll(o, emptyStudy(), 1), {}).includes('practica'), 'practicar fotografía no sale con Ofimática');
  assert.ok(opp(emptyStudy(), {}).includes('empleo-oficina'));

  // Migración: una partida v3 de antes de LV-03 (Decathlon activo, Fotografía a medias, folleto cogido) carga igual,
  // dos veces seguidas igual (idempotente), y las reglas nuevas la respetan sin campos nuevos.
  const store = new Map<string, string>();
  const save = new SaveSystem({ read: (key) => store.get(key) ?? null, write: (key, v) => void store.set(key, v), remove: (key) => void store.delete(key) });
  const half = { ...enroll(c, emptyStudy(), 1), skills: { foto: 24 } };
  half.course!.attended = [0, 1];
  const old = { ...createInitialState(), day: 9, job: hire(getJob('decathlon'), 1), study: half, events: { ...createInitialState().events, eventFlags: { 'folleto:cursos': 4 } } };
  store.set(SAVE_KEY, JSON.stringify({ version: 3, savedAt: 0, state: old }));
  const first = save.load()!;
  assert.equal(first.job?.job, 'decathlon');
  assert.equal(first.job?.status, 'active', 'Decathlon sigue activo');
  assert.deepEqual(first.study, half, 'el curso a medias vuelve igual');
  save.save(first);
  assert.deepEqual(save.load(), first, 'cargar y guardar otra vez no cambia nada');
  assert.match(enrollBlocker(o, first.study, 100, feeFor(o, first.events.eventFlags)) ?? '', /Ya estás en Fotografía/);
  assert.equal(feeFor(o, first.events.eventFlags), 20, 'el folleto cogido antes de LV-03 vale');
}

console.log(`estudios: ${c.name} €${c.fee} · ${c.lessons.length} clases · ${PRACTICE_SITES.length} sitios de práctica · encargo ${gig.client.split(',')[0]} €${gig.pay} · ok`);
