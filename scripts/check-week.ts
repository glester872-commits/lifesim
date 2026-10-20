// Primera semana (prompt 07): las oportunidades (data/opportunities.ts) salen de los sistemas de verdad, sin orden,
// desaparecen al aprovecharlas y vuelven si se deja algo; un plan aceptado con quien tiene historia se hace en uno de
// sus sitios de siempre sin pisar un turno ni una clase; con quien no tiene rutina no se queda. `npm run check`.
import assert from 'node:assert/strict';
import { JOBS } from '../src/data/jobs.ts';
import { COURSES } from '../src/data/study.ts';
import { STORIES } from '../src/data/saraStory.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { NAMED_PEOPLE } from '../src/data/namedPeople.ts';
import { createInitialState, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import { hire, quit } from '../src/systems/Jobs.ts';
import { enroll } from '../src/systems/Study.ts';
import { createStory, minuteOf, planDayFrom, planForInvite, watchPlan } from '../src/systems/Story.ts';
import { canMeet, createPhone, phoneOptions } from '../src/systems/Phone.ts';
import { createSocialProfile } from '../src/systems/Social.ts';
import { freeBetween } from '../src/systems/Agenda.ts';
import { nowAt, opportunities, opportunityInput } from '../src/systems/Opportunities.ts';
import { weekIndex } from '../src/systems/Calendar.ts';
import type { GameStateData } from '../src/types/game.ts';

const job = JOBS[0];
const course = COURSES[0];
const t = (day: number, h: number, m = 0): number => (day - 1) * 1440 + h * 60 + m;
const ids = (s: GameStateData, now = t(1, 9)): string[] => opportunities(opportunityInput(s, now)).map((o) => o.id);
const base = createInitialState();

// ------------------------------------------------------------------ partida nueva: todo a la vista, sin orden

const start = ids(base);
for (const id of ['empleo', 'tarjeta', 'curso', 'meta', 'sara-conocer', 'ada-conocer']) assert.ok(start.includes(id), `partida nueva sin «${id}»: ${start}`);
for (const o of opportunities(opportunityInput(base, t(1, 9)))) assert.ok(!/\{\w+\}|undefined/.test(o.title + o.text), `${o.id}: hueco sin rellenar: ${o.title} ${o.text}`);
// La mejora: con €120 y nada por pagar aún, el cuadro (€35) ya llega; con poco dinero, ahorrar.
assert.ok(start.includes('mejora') && !start.includes('mejora-ahorro'), 'con dinero libre, la mejora se ofrece');
assert.ok(ids({ ...base, money: 20 }).includes('mejora-ahorro'), 'sin dinero libre, se ofrece ahorrar');

// Aprovechar quita la oportunidad; dejarlo la devuelve.
const hired = { ...base, job: hire(job, 1) };
assert.ok(!ids(hired).includes('empleo'), 'con contrato ya no se ofrece el empleo');
assert.ok(ids({ ...hired, job: quit(hired.job!, 3) }).includes('empleo'), 'al dejarlo, el empleo vuelve a ofrecerse');
const enrolled = { ...base, study: enroll(course, base.study!, 1) };
assert.ok(!ids(enrolled).includes('curso') && ids(enrolled).includes('practica'), 'matriculado: practicar en vez de matricularse');
assert.ok(!ids({ ...base, cards: { transport: 10 } }).includes('tarjeta'));
// Con menos de una ida y vuelta en la tarjeta, recargar.
assert.ok(ids({ ...base, cards: { transport: 2 } }).includes('recarga') && !ids({ ...base, cards: { transport: 4 } }).includes('recarga'));
assert.ok(!ids({ ...base, household: { ...base.household!, goal: 'abrigo' } }).includes('meta'));

// Personas: conocer, el número, quedar; y dónde están ahora sale de su rutina.
const met = { ...base, social: { sara: { ...createSocialProfile(), encounters: 2 } } };
assert.ok(ids(met).includes('sara-numero') && !ids(met).includes('sara-conocer'));
const number = { ...base, social: { sara: { ...createSocialProfile(), encounters: 4, contactExchanged: true } } };
assert.ok(ids(number).includes('sara-plan'));
const planned = { ...number, stories: { sara: { ...createStory(STORIES.sara), plan: { id: 'terraza', day: 3, status: 'pending' as const } } } };
assert.ok(!ids(planned, t(2, 12)).includes('sara-plan'), 'con plan quedado no se ofrece otro');
const where = new Set([0, 9, 13, 17, 21].map((h) => nowAt('sara', opportunityInput(base, t(2, h)))));
assert.ok(where.size >= 2, `la rutina de Sara no cambia de sitio en el día: ${[...where]}`);
assert.ok([...where].every((w) => !/undefined/.test(w)));

// ------------------------------------------------------------------ quedar: con quien tiene rutina, sin pisar compromisos

assert.ok(canMeet('sara') && canMeet('ada'));
const nobody = Object.keys(NAMED_PEOPLE).find((id) => !CHARACTERS.some((c) => c.npc === id))!;
assert.ok(nobody && !canMeet(nobody));
const friend = { ...createSocialProfile(), encounters: 8, friendship: 40, trust: 30, contactExchanged: true };
const invites = (npc: string): string[] => phoneOptions(createPhone(), npc, friend, t(2, 12)).map((o) => o.id).filter((id) => /invite|propose/.test(id));
assert.ok(invites('sara').length > 0, 'a Sara se le pueden proponer planes');
assert.deepEqual(invites(nobody), [], `a ${nobody}, sin rutina, no se le proponen planes`);

// Contrato (lun, mié, vie 10–16) y curso (mar, jue 18–20): el plan cae en un hueco libre.
const contract = hire(job, 0);
const study = enroll(course, base.study!, 1);
const free = (day: number, from: number, until: number): boolean => freeBetween(contract, study, day, from, until);
for (const day of [1, 3, 5]) assert.ok(!free(day, minuteOf('11:30'), minuteOf('12:25')), `día ${day}: el turno no deja libre las 11:30`);
assert.ok(free(1, minuteOf('20:00'), minuteOf('21:30')), 'tras el turno, la tarde está libre');
for (const day of study.course!.lessons) assert.ok(!free(day, minuteOf('19:30'), minuteOf('21:00')), `día ${day}: la clase pisa las 19:30`);
const sara = STORIES.sara;
for (let from = 1; from <= 7; from++) {
  const out = planForInvite(createStory(sara), sara, from, free);
  assert.ok(out, `desde el día ${from}: sin plan posible`);
  const p = sara.plans[out.id];
  assert.ok(p.ask && p.days.includes(weekIndex(out.day)), 'un plan de los suyos, en un día que le toca');
  assert.ok(free(out.day, minuteOf(p.from), minuteOf(p.until)), `desde el día ${from}: ${out.id} el día ${out.day} pisa un compromiso`);
  assert.equal(out.story.routines[String(out.day)], p.routine, 'su rutina de ese día la lleva al sitio');
}
// Ir deja un recuerdo en la relación; faltar, otro.
{
  const out = planForInvite(createStory(sara), sara, 1, free)!;
  const p = sara.plans[out.id];
  const at = { day: out.day, minute: minuteOf(p.from) + 5 };
  const kept = watchPlan(out.story, createSocialProfile(), sara, at, true)!;
  assert.ok(kept.kept && kept.profile.memories.at(-1)!.note === `estuvisteis en ${p.place}`, 'el plan cumplido se recuerda');
  const missed = watchPlan(out.story, createSocialProfile(), sara, { day: out.day, minute: minuteOf(p.until) }, false)!;
  assert.ok(!missed.kept && missed.profile.memories.at(-1)!.outcome === 'negative', 'el plantón también');
}
// Con otro plan ya quedado no se pisa.
assert.equal(planForInvite({ ...createStory(sara), plan: { id: 'terraza', day: 4, status: 'pending' } }, sara, 2, free), null);
// Sus propias invitaciones también esquivan el turno; sin `free`, como siempre.
const molinillo = Object.values(sara.plans).find((p) => p.point === 'MOLINILLO_TERRACE_01')!;
assert.equal(weekIndex(planDayFrom(molinillo, 1)), 2, 'sin filtro, el primer miércoles');
assert.notEqual(planDayFrom(molinillo, 1, free), 3, 'con turno el miércoles, no ese miércoles');

console.log(`check-week: ok (${start.length} oportunidades al empezar; Sara ahora: ${[...where].join(' / ')})`);

// Sin un hueco compatible no se promete una quedada inexistente.
assert.equal(planForInvite(createStory(sara), sara, 1, () => false), null);

// Guardar/cargar no vuelve a dar la recompensa ni duplica el recuerdo.
{
  const invite = planForInvite(createStory(sara), sara, 1)!;
  const now = { day: invite.day, minute: minuteOf(sara.plans[invite.id].from) + 5 };
  const kept = watchPlan(invite.story, friend, sara, now, true)!;
  const files = new Map<string, string>();
  const storage: SaveStorage = { read: k => files.get(k) ?? null, write: (k, v) => { files.set(k, v); }, remove: k => { files.delete(k); } };
  const save = new SaveSystem(storage);
  assert.ok(save.save({ ...base, day: now.day, stories: { sara: kept.story }, social: { sara: kept.profile } }));
  const loaded = save.load()!;
  assert.deepEqual(loaded.social!.sara.memories, kept.profile.memories);
  assert.equal(watchPlan(loaded.stories!.sara, loaded.social!.sara, sara, now, true), null);
  assert.equal(loaded.social!.sara.trust, kept.profile.trust);
  assert.equal(loaded.social!.sara.friendship, kept.profile.friendship);
}
console.log('check-week: persistencia de recuerdos y ausencia de huecos, ok');
