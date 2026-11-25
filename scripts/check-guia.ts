// VID-12 · los primeros días guiados (systems/Agenda.guideProgress, parseAgenda, resumeGuide): cuatro hitos leídos de lo
// que ya guarda la partida. Control positivo en cabecera: con todo hecho, los cuatro hitos salen completos; sin nada,
// ninguno. Después, cada hito por separado, los modos, el orden libre y la carga de partidas. `npm run check`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JOBS } from '../src/data/jobs.ts';
import { STOPS } from '../src/data/transit.ts';
import { GUIDE_CARD } from '../src/data/tour.ts';
import { hire } from '../src/systems/Jobs.ts';
import { createSocialProfile, type SocialState } from '../src/systems/Social.ts';
import { createStory } from '../src/systems/Story.ts';
import type { SocialPlan } from '../src/systems/Phone.ts';
import { guideProgress, parseAgenda, resumeGuide, startAgenda, type GuideInput, type GuideProgress } from '../src/systems/Agenda.ts';

const STATION = STOPS[0].station;
const STREET = 'district';
const empty = (over: Partial<GuideInput> = {}): GuideInput => ({
  social: {}, stories: {}, rides: 0, cards: {}, metroJourney: null, location: STREET, money: 50,
  job: null, ledger: [], marks: {}, plans: [], diary: [], ...over,
});
const friend = (contact: boolean): SocialState => ({ sara: { ...createSocialProfile(), contactExchanged: contact } });
const plan = (by: SocialPlan['by'], status: SocialPlan['status']): SocialPlan =>
  ({ id: `p-${by}-${status}`, npc: 'sara', kind: 'cafe' as SocialPlan['kind'], day: 1, at: '18:00', place: 'cafe', status, by, via: 'phone', created: 0 });
const done = (g: GuideProgress): string[] => g.milestones.filter((m) => m.done).map((m) => m.id);
const ALL = empty({
  social: friend(true), rides: 1, cards: { [GUIDE_CARD]: 0 }, job: hire(JOBS[0], 0),
  plans: [plan('player', 'accepted')], guide: { mode: 'guided', chosenAt: 0, baseRides: 0 },
  diary: [{ type: 'gathering', data: { outcome: 'bien' } }] as GuideInput['diary'],
});
const storyPlan = (status: 'pending' | 'kept' | 'missed' | 'cancelled') => ({ sara: { ...createStory({ baseMood: 50 }), plan: { id: 'cafe', day: 2, status } } });

test('control positivo: todo hecho → cuatro hitos; nada hecho → ninguno', () => {
  assert.equal(ALL.job?.status, 'active', 'hire da un contrato activo');
  assert.deepEqual(done(guideProgress(ALL)), ['vecino', 'metro', 'trabajo', 'social']);
  assert.equal(guideProgress(ALL).next, undefined);
  assert.deepEqual(done(guideProgress(empty())), []);
  assert.equal(guideProgress(empty()).next, 'vecino');
});

// Corrección 1: las pistas dicen a quién buscar y dónde, si el local está cerrado y si la tarjeta no tiene saldo.
const SARA = { name: 'Sara', at: 'en Restaurante', home: false, reachable: true, moving: false };
const ADA = { name: 'Ada', at: 'en su casa', home: true, reachable: false, moving: false };
const AMAIA = { name: 'Amaia', at: 'durmiendo en su casa', home: true, reachable: false, moving: false };
const hintOf = (over: Partial<GuideInput>, i: number): string => guideProgress(empty(over)).milestones[i].hint;

test('control positivo de pistas: la vecina que está fuera, la hora de apertura, la recarga', () => {
  const here = hintOf({ people: [ADA, SARA, AMAIA] }, 0);
  assert.ok(here.includes('Sara') && here.includes('en Restaurante'), here);
  assert.ok(hintOf({ now: 3 * 60 }, 2).includes('a las 09:00'), 'Decathlon cerrado a las 03:00 abre a las 09:00');
  assert.ok(hintOf({ cards: { [GUIDE_CARD]: 0 } }, 1).toLowerCase().includes('recarga'), 'tarjeta sin saldo');
});

test('vecino: con todas en casa lo dice, con cuándo salen o «vuelve más tarde»', () => {
  const all = hintOf({ people: [ADA, AMAIA] }, 0);
  assert.ok(all.includes('Ada y Amaia') && all.includes('en casa') && all.includes('Vuelve más tarde'), all);
  const later = hintOf({ people: [ADA, AMAIA], later: { ...SARA, when: 'Hacia las 15:00' } }, 0);
  assert.ok(later.includes('Hacia las 15:00') && later.includes('Sara') && later.includes('en Restaurante') && !later.includes('Vuelve más tarde'), later);
  assert.ok(!hintOf({ people: [ADA, AMAIA] }, 0).includes('Sara está'));
  assert.equal(hintOf({}, 0), hintOf({ people: [] }, 0), 'sin paradero: la pista genérica');
});

// Corrección 2: dentro de un sitio que no es su casa tampoco se alcanza; quien anda por la calle, sí.
test('vecino: dentro fuera de casa no se nombra; andando da la pista walking; parada gana a andando', () => {
  const inMetro = { name: 'Ada', at: 'en Metro', home: false, reachable: false, moving: false };
  const walking = { name: 'Sara', at: 'de camino a algún sitio', home: false, reachable: true, moving: true };
  const inside = hintOf({ people: [inMetro, AMAIA] }, 0);
  assert.ok(!inside.includes('está en') && inside.includes('dentro') && !inside.includes('en casa'), inside);
  const walk = hintOf({ people: [inMetro, walking, AMAIA] }, 0);
  assert.ok(walk.startsWith('Sara va por la calle') && !walk.includes('Ada'), walk);
  const still = hintOf({ people: [walking, inMetro, { ...SARA, name: 'Amaia' }] }, 0);
  assert.ok(still.startsWith('Amaia está en Restaurante'), still);
});

test('trabajo: abierto o sin hora, la pista de siempre; cerrado, la apertura', () => {
  const ask = hintOf({}, 2);
  assert.equal(hintOf({ now: 12 * 60 }, 2), ask, 'abierto a mediodía');
  assert.notEqual(hintOf({ now: 23 * 60 }, 2), ask);
  assert.ok(hintOf({ now: 23 * 60 }, 2).includes('mañana a las 09:00'), 'de noche: mañana');
});

test('metro: tarjeta con saldo para un viaje, sin aviso de recarga', () => {
  assert.ok(!hintOf({ cards: { [GUIDE_CARD]: 10 } }, 1).toLowerCase().includes('recarga'));
});

test('partida vieja sin guide: no se fuerza ninguna guía', () => {
  const a = parseAgenda({ tour: 'done', seen: {}, checked: 10, marks: {} });
  assert.equal(a.guide, undefined);
  assert.equal(a.tour, 'done');
  assert.equal(parseAgenda(undefined).guide, undefined);
  assert.equal(startAgenda().guide, undefined, 'partida nueva: se elige, no viene puesta');
});

test("'free' y 'skipped' no completan nada y conservan lo hecho", () => {
  for (const mode of ['free', 'skipped'] as const) {
    assert.deepEqual(done(guideProgress(empty({ guide: { mode, chosenAt: 0, baseRides: 0 } }))), [], mode);
    assert.deepEqual(done(guideProgress({ ...ALL, guide: { mode, chosenAt: 0, baseRides: 0 } })), ['vecino', 'metro', 'trabajo', 'social'], mode);
  }
});

test("retomar: sólo pasa a 'guided'; en partida sin guía la crea con los viajes de ahora", () => {
  const a = { ...startAgenda(), tour: 'skipped' as const, seen: { x: 3 }, marks: { 'guia:job': 'applied' }, guide: { mode: 'skipped' as const, chosenAt: 40, baseRides: 2 } };
  const r = resumeGuide(a, 999, 7);
  assert.deepEqual(r, { ...a, guide: { mode: 'guided', chosenAt: 40, baseRides: 2 } });
  const old = parseAgenda({ tour: 'done', seen: {}, checked: 0, marks: {} });
  assert.deepEqual(resumeGuide(old, 120.6, 4).guide, { mode: 'guided', chosenAt: 120, baseRides: 4 });
});

test('hito 1: no por importantNPCsMet ni encuentros; sí por el número o por la presentación', () => {
  // guideProgress no recibe EventMemory: ni importantNPCsMet ni encuentros pueden contar. Un perfil sin número, tampoco.
  assert.ok(!guideProgress(empty({ social: friend(false) })).milestones[0].done);
  assert.ok(guideProgress(empty({ social: friend(true) })).milestones[0].done, 'número');
  const flag = { ...createStory({ baseMood: 50 }), flags: { sara_met: 1 } };
  assert.ok(guideProgress(empty({ social: friend(false), stories: { sara: flag } })).milestones[0].done, 'flag de presentarse');
  const ev = { ...createStory({ baseMood: 50 }), events: [{ id: 'conocerse', day: 1, minute: 600 }] };
  assert.ok(guideProgress(empty({ social: friend(false), stories: { sara: ev } })).milestones[0].done, "evento 'conocerse'");
  const other = { ...createStory({ baseMood: 50 }), flags: { sara_otra: 1 } };
  assert.ok(!guideProgress(empty({ social: friend(false), stories: { sara: other } })).milestones[0].done, 'otra flag no vale');
});

test('hito 2: tarjeta + viaje nuevo + fuera de estación, los tres', () => {
  const guide = { mode: 'guided' as const, chosenAt: 0, baseRides: 3 };
  const card = { [GUIDE_CARD]: 5 };
  const metro = (over: Partial<GuideInput>) => guideProgress(empty({ guide, ...over })).milestones[1];
  assert.ok(!metro({ cards: card, rides: 3 }).done, 'sólo tarjeta');
  assert.deepEqual(metro({ cards: card, rides: 3 }).steps.map((s) => s.done), [true, false, false]);
  assert.ok(!metro({ cards: card, rides: 3, location: STREET }).done, 'rides == base');
  assert.ok(!metro({ cards: card, rides: 4, location: STATION }).done, 'aún en la estación');
  assert.ok(!metro({ rides: 4 }).done, 'sin tarjeta');
  assert.ok(metro({ cards: card, rides: 4, location: STREET }).done, 'los tres');
});

test('hito 3: contrato activo o lo apuntado en marks', () => {
  assert.ok(!guideProgress(empty()).milestones[2].done);
  assert.ok(guideProgress(empty({ job: hire(JOBS[0], 0) })).milestones[2].done);
  for (const m of ['applied', 'declined', 'denied', 'casual']) assert.ok(guideProgress(empty({ marks: { 'guia:job': m } })).milestones[2].done, m);
  assert.ok(!guideProgress(empty({ marks: { 'guia:job': 'otra' } })).milestones[2].done);
});

test("hito 4: pasos separados; 'past' no es asistencia", () => {
  const social = (plans: SocialPlan[]) => guideProgress(empty({ plans })).milestones[3];
  assert.deepEqual(social([plan('player', 'proposed')]).steps.map((s) => s.done), [true, false, false, false]);
  assert.ok(!social([plan('player', 'proposed')]).done);
  assert.deepEqual(social([plan('npc', 'proposed')]).steps.map((s) => s.done), [false, true, false, false]);
  const past = social([plan('npc', 'past')]);
  assert.ok(!past.done, "invitación que ya pasó: 'past' no es aceptada ni ir");
  assert.equal(past.steps[2].done, false, "'past' no cuenta como aceptado");
  assert.equal(past.steps[3].done, false, "'past' no cuenta como ir");
  const went = guideProgress(empty({ plans: [plan('player', 'accepted')], diary: [{ type: 'gathering', data: { outcome: 'bien' } }] as GuideInput['diary'] })).milestones[3];
  assert.equal(went.steps[3].done, true, 'quedada a la que se fue');
  assert.ok(went.done, 'propuesta, aceptada y fue: completo');
});

// VID-12b · invitación recibida de verdad, aceptado sin 'past' ni cancelados, y completo sólo yendo.
test('hito 4: el plan de historia que nació de una propuesta no es invitación', () => {
  const s4 = (over: Partial<GuideInput>) => guideProgress(empty(over)).milestones[3];
  const steps = (over: Partial<GuideInput>) => s4(over).steps.map((s) => s.done);
  // a) propuesta del jugador puenteada (móvil 'cancelled' by 'player') + plan de historia 'pending'.
  const a = s4({ plans: [plan('player', 'cancelled')], stories: storyPlan('pending') });
  assert.deepEqual(a.steps.map((s) => s.done), [true, false, true, false]);
  assert.ok(!a.done, 'sin ir no está completo');
  // b) plan de historia sin rastro en el móvil: lo propuso ella.
  assert.equal(steps({ stories: storyPlan('pending') })[1], true);
  // c) invitación por el móvil aún sin responder.
  assert.deepEqual(steps({ plans: [plan('npc', 'proposed')] }).slice(1, 3), [true, false]);
  // d) 'past' sin plan de historia no es aceptado.
  assert.equal(steps({ plans: [plan('player', 'past')] })[2], false);
  // e) plan de historia cancelado tampoco.
  assert.equal(steps({ stories: storyPlan('cancelled') })[2], false);
  // f) propuesta + aceptada sin ir: no; con el plan de historia cumplido: sí.
  assert.ok(!s4({ plans: [plan('player', 'accepted')] }).done);
  assert.ok(s4({ plans: [plan('player', 'cancelled')], stories: storyPlan('kept') }).done);
});

test('hito 4: al retomar la guía, lo social de antes de chosenAt cuenta', () => {
  const guide = resumeGuide(parseAgenda({ tour: 'done', seen: {}, checked: 0, marks: {} }), 10_000, 0).guide;
  assert.ok(guide && guide.chosenAt === 10_000);
  // El plan se creó en el minuto 0 y se cumplió antes de retomar.
  assert.ok(guideProgress(empty({ guide, plans: [plan('player', 'cancelled')], stories: storyPlan('kept') })).milestones[3].done);
});

test('fuera de orden: un hito posterior cuenta aunque falten los anteriores', () => {
  const g = guideProgress(empty({ job: hire(JOBS[0], 0) }));
  assert.deepEqual(done(g), ['trabajo']);
  assert.equal(g.next, 'vecino');
});

test('parseAgenda: guide va y vuelve; un mode inválido se descarta', () => {
  const a = { ...startAgenda(), tour: 'done' as const, guide: { mode: 'free' as const, chosenAt: 600, baseRides: 2 } };
  assert.deepEqual(parseAgenda(JSON.parse(JSON.stringify(a))), a);
  assert.equal(parseAgenda({ ...a, guide: { mode: 'otro', chosenAt: 1, baseRides: 1 } }).guide, undefined);
  assert.deepEqual(parseAgenda({ ...a, guide: { mode: 'guided', chosenAt: 'x', baseRides: -3 } }).guide, { mode: 'guided', chosenAt: 0, baseRides: 0 });
});
