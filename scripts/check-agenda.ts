// Agenda (systems/Agenda): lo próximo con hora, sitio y viaje; avisos una vez (también al recargar y tras dormir o
// trabajar), lo perdido en un salto de reloj, señales de progreso, el cuerpo que se ve y partidas antiguas. Al final,
// las tres jornadas de referencia con los datos reales (mapa, metro, horarios, actividades). `npm run check`.
import assert from 'node:assert/strict';
import { JOBS } from '../src/data/jobs.ts';
import { COURSES } from '../src/data/study.ts';
import { getActivity } from '../src/data/activities.ts';
import { PLAN_KINDS } from '../src/systems/Phone.ts';
import { GAME_MINUTES_PER_REAL_SECOND, SAVE_KEY, TILE } from '../src/config/constants.ts';
import { findPoint } from '../src/systems/Navigation.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { createInitialState, SaveSystem } from '../src/systems/SaveSystem.ts';
import { hire, work } from '../src/systems/Jobs.ts';
import { enroll } from '../src/systems/Study.ts';
import { START_FITNESS, buildOf, bodyLine } from '../src/systems/Fitness.ts';
import { TOUR } from '../src/data/tour.ts';
import {
  commitments, leadOf, margin, marginLabel, parseAgenda, progressSignals, review, startAgenda, travelHint,
  type AgendaInput, type AgendaState, type Position, type ProgressInput,
} from '../src/systems/Agenda.ts';

const t = (day: number, h: number, m = 0): number => (day - 1) * 1440 + h * 60 + m;
const job = JOBS[0];
const course = COURSES[0];
const base = createInitialState();
const at = (point: string): Position => {
  const p = findPoint(point);
  assert.ok(p, `punto ${point}`);
  return { location: p.location, x: p.tx * TILE + TILE / 2, y: p.ty * TILE + TILE / 2 };
};
const homeSpawn = getLocation('home').spawns.entry;
const HOME: Position = { location: 'home', x: homeSpawn.tx * TILE, y: homeSpawn.ty * TILE };
const STREET: Position = { location: 'district', x: 41 * TILE, y: 51 * TILE };

const input = (now: number, over: Partial<AgendaInput> = {}): AgendaInput => ({
  now, job: hire(job, 0), study: base.study!, household: base.household!, phone: base.phone!, stories: {}, tickets: [], ...over,
});
const progress = (now: number, over: Partial<ProgressInput> = {}): ProgressInput => ({
  now, job: hire(job, 0), study: base.study!, household: base.household!, money: 100, wardrobe: [], social: {}, fitness: { ...START_FITNESS }, ...over,
});
const reload = (a: AgendaState): AgendaState => parseAgenda(JSON.parse(JSON.stringify(a)));

// ------------------------------------------------------------------ partidas

assert.equal(base.agenda!.tour, 'new', 'partida nueva: con guía');
assert.equal(parseAgenda(undefined).tour, 'done', 'partida de antes: sin guía');
assert.equal(parseAgenda({ tour: 'raro' }).tour, 'done');
assert.deepEqual(parseAgenda({ tour: 'skipped', seen: { a: 'x', b: 5 }, checked: 9.7, marks: { job: '0:1', mal: 3 } }), { tour: 'skipped', seen: { b: 5 }, checked: 9, marks: { job: '0:1' } });
// Guardar y cargar conserva la agenda; una partida guardada sin ella carga sin guía.
{
  const store = new Map<string, string>();
  const save = new SaveSystem({ read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) });
  const agenda: AgendaState = { tour: 'done', seen: { 'job:3': 100 }, checked: 100, marks: { body: 'average' } };
  save.save({ ...base, agenda });
  assert.deepEqual(save.load()!.agenda, agenda);
  const raw = JSON.parse(store.get(SAVE_KEY)!);
  delete raw.state.agenda;
  store.set(SAVE_KEY, JSON.stringify(raw));
  assert.equal(save.load()!.agenda!.tour, 'done', 'partida antigua: no ve la guía');
}
assert.equal(TOUR.length, 5);
for (const s of TOUR) assert.ok(s.text.length > 30 && !s.text.includes('undefined'), `guía · ${s.title}: ${s.text}`);

// ------------------------------------------------------------------ compromisos y viaje

{
  const first = commitments(input(t(1, 7)))[0];
  assert.equal(first.key, 'job:1');
  assert.equal(first.start, t(1, job.levels[0].start));
  assert.ok(first.where && 'stop' in first.where && first.where.stop === 'decathlon');
  // Con curso: la clase sale con su sitio en el mapa.
  const study = enroll(course, base.study!, 1);
  const cls = commitments(input(t(1, 7), { study })).find((c) => c.kind === 'class');
  assert.ok(cls && cls.where && 'location' in cls.where, 'la clase tiene sitio');
  // Plan del móvil aceptado: con hora y sitio.
  const plan = { id: 'p1', npc: 'sara', kind: 'cafe' as const, day: 1, at: PLAN_KINDS.cafe.at, place: PLAN_KINDS.cafe.place, status: 'accepted' as const, by: 'player' as const, via: 'phone' as const, created: 0 };
  const p = commitments(input(t(1, 7), { phone: { threads: {}, plans: [plan] } })).find((c) => c.kind === 'plan');
  assert.ok(p && p.where, 'el plan tiene sitio');
  // Pasado su cierre, ya no sale.
  assert.ok(!commitments(input(t(1, 13))).some((c) => c.key === 'job:1'), 'turno pasado: fuera');
}
{
  const job1 = commitments(input(t(1, 7)))[0];
  const fromHome = travelHint(HOME, job1.where);
  const fromStreet = travelHint(STREET, job1.where);
  assert.ok(fromHome.minutes! > fromStreet.minutes! && fromStreet.minutes! >= 30, `metro: casa ${fromHome.minutes}, calle ${fromStreet.minutes}`);
  assert.match(fromHome.text, /^metro L2 · ~\d+ min$/);
  assert.equal(travelHint({ location: 'no-existe', x: 0, y: 0 }, job1.where).minutes, null, 'sin sitio: sin estimación');
  assert.equal(travelHint(HOME, null).text, 'desde el móvil');
  const gym = travelHint(HOME, { name: 'Gimnasio', location: 'gym', tile: { tx: 18, ty: 14 } });
  assert.ok(gym.minutes! > 0 && gym.minutes! < 40 && /a pie/.test(gym.text), `a pie: ${gym.text}`);
  // En Decathlon (sitio sin mapa, con la estación cargada detrás): ya se está; a casa, en metro de vuelta.
  assert.deepEqual(travelHint({ ...STREET, location: 'vallesco-station', offMap: 'decathlon' }, job1.where), { minutes: 0, text: 'ya estás aquí' });
  const back = travelHint({ ...STREET, offMap: 'decathlon' }, { name: 'Casa', location: 'home', tile: { tx: 10, ty: 13 } });
  assert.ok(back.minutes! >= 30 && /^metro L2/.test(back.text), `vuelta: ${back.text}`);
  assert.equal(margin(job1, t(1, 11, 50), fromHome), 'late');
  assert.equal(margin(job1, t(1, 6), fromHome), 'ok');
  // Saliendo a las 9:50 se llega pasadas las 10:00, todavía a tiempo de fichar con retraso.
  assert.equal(marginLabel(job1, t(1, 9, 50), fromHome), 'llegarás tarde');
  assert.equal(marginLabel(job1, t(1, 8, 50), fromHome), 'sal ya');
  assert.equal(marginLabel(job1, t(1, 11, 50), fromHome), 'ya no llegas');
}

// ------------------------------------------------------------------ avisos: una vez, antes, y al día tras un salto

{
  const job1 = commitments(input(t(1, 7)))[0];
  const lead = leadOf(job1, travelHint(HOME, job1.where));
  assert.ok(lead > 60, 'se avisa con el viaje y margen');
  let a = startAgenda();
  // Primera revisión: apunta, no avisa de nada de antes.
  let r = review(a, { ...input(t(1, 5)), position: HOME }, progress(t(1, 5)));
  assert.equal(r.due.length, 0);
  assert.equal(r.missed.length, 0);
  a = r.agenda;
  r = review(a, { ...input(job1.start - lead), position: HOME }, progress(job1.start - lead));
  assert.deepEqual(r.due.map((c) => c.key), ['job:1'], 'aviso a su hora');
  a = r.agenda;
  assert.equal(review(a, { ...input(job1.start - lead + 1), position: HOME }, progress(job1.start - lead + 1)).due.length, 0, 'una vez');
  assert.equal(review(reload(a), { ...input(job1.start - lead + 2), position: HOME }, progress(job1.start - lead + 2)).due.length, 0, 'recargar no lo repite');

  // Dormir de 07:00 a 15:00 se salta el turno entero: se dice una vez que se perdió.
  let s = review(startAgenda(), { ...input(t(1, 7)), position: HOME }, progress(t(1, 7))).agenda;
  r = review(s, { ...input(t(1, 15)), position: HOME }, progress(t(1, 15)));
  assert.equal(r.missed.length, 1, 'turno perdido en el salto');
  assert.match(r.missed[0], /no fichaste/);
  assert.ok(!r.due.some((c) => c.key === 'job:1'));
  s = r.agenda;
  assert.equal(review(reload(s), { ...input(t(1, 15, 5)), position: HOME }, progress(t(1, 15, 5))).missed.length, 0, 'lo perdido, una vez');

  // Un salto que cae dentro del margen (siesta hasta las 9:30): el aviso sale al despertar, una vez.
  s = review(startAgenda(), { ...input(t(1, 6)), position: HOME }, progress(t(1, 6))).agenda;
  r = review(s, { ...input(t(1, 9, 30)), position: HOME }, progress(t(1, 9, 30)));
  assert.deepEqual(r.due.map((c) => c.key), ['job:1']);
  assert.equal(r.missed.length, 0);

  // Un turno hecho no cuenta como perdido.
  const done = work(hire(job, 0), t(1, 9, 55), job.situations[0].choices[0]).progress;
  s = review(startAgenda(), { ...input(t(1, 9), { job: done }), position: HOME }, progress(t(1, 9), { job: done })).agenda;
  assert.equal(review(s, { ...input(t(1, 18), { job: done }), position: HOME }, progress(t(1, 18), { job: done })).missed.length, 0);

  // Un plazo (pagar) se avisa la mañana del día que vence, no antes.
  const bills = { ...base.household!, obligations: [{ bill: 'rent', period: 1, amount: 100, fee: 0, due: 3 }] };
  assert.ok(commitments(input(t(1, 7), { household: bills })).some((c) => c.kind === 'bill'), 'la cuenta sale');
  const quiet = review(startAgenda(), { ...input(t(2, 20), { household: bills }), position: HOME }, progress(t(2, 20)));
  assert.ok(!quiet.due.some((c) => c.kind === 'bill'), 'la víspera, aún no');
  assert.ok(review(quiet.agenda, { ...input(t(3, 9), { household: bills }), position: HOME }, progress(t(3, 9))).due.some((c) => c.kind === 'bill'), 'el día que vence, sí');
}

// ------------------------------------------------------------------ progreso y cuerpo

{
  const p0 = hire(job, 0);
  let a = review(startAgenda(), { ...input(t(1, 18), { job: p0 }), position: HOME }, progress(t(1, 18), { job: p0 })).agenda;
  const p1 = work(p0, t(1, 9, 55), job.situations[0].choices[0]).progress;
  const r = review(a, { ...input(t(1, 18, 1), { job: p1 }), position: HOME }, progress(t(1, 18, 1), { job: p1 }));
  assert.deepEqual(r.progress, [`Trabajo: 1 de ${job.promoteAfter} buenos turnos para ascender a ${job.levels[1].title.toLowerCase()}.`]);
  a = r.agenda;
  assert.equal(review(reload(a), { ...input(t(1, 18, 2), { job: p1 }), position: HOME }, progress(t(1, 18, 2), { job: p1 })).progress.length, 0, 'el progreso se dice una vez');

  assert.equal(buildOf(START_FITNESS), undefined);
  assert.equal(buildOf({ ...START_FITNESS, fitness: 40 }), 'athletic');
  assert.equal(buildOf({ ...START_FITNESS, strength: 61 }), 'muscular');
  assert.match(bodyLine(START_FITNESS), /aún no se nota/);
  const fit = { ...START_FITNESS, fitness: 41 };
  const b = review(a, { ...input(t(1, 19), { job: p1 }), position: HOME }, progress(t(1, 19), { job: p1, fitness: fit }));
  assert.equal(b.progress.length, 1, 'el cuerpo se nota una vez');
  assert.match(b.progress[0], /hombros más anchos/);
  assert.ok(progressSignals(progress(t(1, 19), { fitness: fit })).some((s) => s.id === 'body' && s.mark === 'athletic'));
}

// ------------------------------------------------------------------ tres jornadas (modelo con datos reales)

/**
 * Cada jornada es una lista de tramos: andar (estimado con travelHint, como el HUD), esperar, una actividad o el
 * metro. El reloj corre en lo que se vive en tiempo real (andar, esperar) y salta en lo demás; el tiempo real es
 * lo vivido a GAME_MINUTES_PER_REAL_SECOND (los menús y lo que se lee tras un salto no gastan reloj).
 */
type Leg = { walk: [Position, Position | string] } | { until: number } | { act: string; minutes?: number; energy?: number } | { ride: number };
interface Day { name: string; start: number; energy: number; legs: Leg[]; due: { close: number; leg: number }[] }

function play(d: Day): { game: number; real: number; travel: number; waits: number; lost: number; energy: number; end: number } {
  let now = d.start;
  let energy = d.energy;
  let travel = 0;
  let waits = 0;
  let live = 0;
  let lost = 0;
  d.legs.forEach((leg, i) => {
    for (const c of d.due) if (c.leg === i && now > c.close) lost++;
    if ('walk' in leg) {
      const [from, to] = leg.walk;
      const metro = typeof to === 'string';
      const where = metro ? { name: to, stop: to } : { name: '', location: to.location, tile: { tx: Math.floor(to.x / TILE), ty: Math.floor(to.y / TILE) } };
      const m = travelHint(from, where).minutes ?? 0;
      now += m;
      travel += m;
      // En metro, lo vivido es llegar al andén y esperar el tren; el trayecto salta.
      live += metro ? m - 30 : m;
    } else if ('until' in leg) {
      const m = Math.max(0, leg.until - now);
      now += m;
      waits += m;
      live += m;
    } else if ('ride' in leg) {
      now += leg.ride;
      travel += leg.ride;
    } else {
      const a = leg.minutes === undefined ? getActivity(leg.act) : null;
      now += leg.minutes ?? a!.minutes;
      energy = Math.min(100, Math.max(0, energy + (leg.energy ?? a!.effects.energy ?? 0)));
    }
  });
  return { game: now - d.start, real: Math.round(live / GAME_MINUTES_PER_REAL_SECOND), travel, waits, lost, energy, end: now };
}

const lvl = job.levels[0];
const DOOR = at('HOME_ENTRANCE');
const METRO = at('METRO_ENTRANCE');
const days: Day[] = [
  {
    // Lunes: turno de 10 a 16 en Decathlon, la compra al volver, cenar en casa y un vino.
    name: 'trabajo y recados', start: t(1, 7, 30), energy: 75,
    legs: [
      { act: 'shower' }, { walk: [HOME, 'decathlon'] }, { until: t(1, lvl.start) }, { act: 'turno', minutes: lvl.hours * 60, energy: lvl.energy },
      { ride: 30 }, { walk: [METRO, at('SUPERMARKET_ENTRANCE')] }, { walk: [at('SUPERMARKET_ENTRANCE'), DOOR] }, { act: 'cook' },
      { walk: [HOME, at('WINE_BAR_ENTRANCE')] }, { act: 'wine-glass' }, { walk: [at('WINE_BAR_ENTRANCE'), DOOR] }, { act: 'shower' },
    ],
    due: [{ close: t(1, lvl.start) + job.grace, leg: 3 }],
  },
  {
    // Martes: práctica de foto por la mañana, comer fuera, gimnasio, clase de 18 a 20 y a casa.
    name: 'estudio y práctica', start: t(2, 8), energy: 85,
    legs: [
      { act: 'shower' }, { walk: [HOME, DOOR] }, { act: 'práctica', minutes: 60, energy: -8 },
      { walk: [DOOR, at('RESTAURANT_ENTRANCE')] }, { until: t(2, 13) }, { act: 'restaurant-lunch' },
      { walk: [at('RESTAURANT_ENTRANCE'), at('GYM_ENTRANCE')] }, { act: 'gimnasio', minutes: 30, energy: -11 },
      { walk: [at('GYM_ENTRANCE'), at('STUDY_CENTER_ENTRANCE')] }, { until: t(2, course.start) }, { act: 'clase', minutes: course.hours * 60, energy: -10 },
      { walk: [at('STUDY_CENTER_ENTRANCE'), DOOR] }, { act: 'cook' }, { act: 'read-sofa' },
    ],
    due: [{ close: t(2, course.start) + course.grace, leg: 10 }],
  },
  {
    // Sábado: mañana en casa, café con alguien a las 18:00, vuelta y vino a las 21:00.
    name: 'descanso y plan social', start: t(6, 9), energy: 90,
    legs: [
      { act: 'shower' }, { act: 'cook' }, { act: 'watch-tv' }, { act: 'nap' },
      { walk: [HOME, at('CAFE_ENTRANCE')] }, { until: t(6, 18) }, { act: 'café', minutes: 60, energy: 4 },
      { walk: [at('CAFE_ENTRANCE'), DOOR] }, { until: t(6, 21) }, { walk: [DOOR, at('WINE_BAR_ENTRANCE')] }, { act: 'wine-board' }, { walk: [at('WINE_BAR_ENTRANCE'), DOOR] },
    ],
    due: [{ close: t(6, 18) + 30, leg: 6 }],
  },
];

const hh = (abs: number): string => `${String(Math.floor((abs % 1440) / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
console.log('jornada                  | juego  | real   | viaje | esperas | perdidos | energía | acaba');
for (const d of days) {
  const r = play(d);
  console.log(`${d.name.padEnd(24)} | ${(r.game / 60).toFixed(1).padStart(4)} h | ${(r.real / 60).toFixed(1).padStart(4)} m | ${String(r.travel).padStart(3)} m | ${String(r.waits).padStart(5)} m | ${String(r.lost).padStart(8)} | ${String(r.energy).padStart(7)} | ${hh(r.end)}`);
  assert.equal(r.lost, 0, `${d.name}: compromiso perdido`);
  assert.ok(r.energy > 0, `${d.name}: sin energía`);
  // Una jornada razonable (con actividad propia y vuelta a casa) cabe antes de medianoche.
  assert.ok(r.end < d.start - (d.start % 1440) + 1440, `${d.name}: acaba ${hh(r.end)}`);
}
console.log('check-agenda: ok');
