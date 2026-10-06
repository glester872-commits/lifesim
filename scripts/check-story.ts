// La historia de Sara (systems/Story.ts, data/saraStory.ts): `npm run check`. Sin Phaser: el mismo código que usa
// WorldScene, paso a paso y con días de verdad. Falla si algo no se cumple.
import assert from 'node:assert/strict';
import { CHARACTERS } from '../src/data/characters.ts';
import { NAMED_LINES } from '../src/data/chatNamed.ts';
import { SARA_STORY, STORIES } from '../src/data/saraStory.ts';
import { ALL_LINES, Conversation, ChatLog, buildContext, fit } from '../src/systems/Chat.ts';
import { characterDay, routineFor, whereabouts, whereaboutsIn, type RoutinePicker } from '../src/systems/Characters.ts';
import { weekIndex } from '../src/systems/Calendar.ts';
import { createInitialState, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import { createSocialProfile, type SocialProfile } from '../src/systems/Social.ts';
import {
  acceptPlan, applyEffect, beatAfterTalk, chatFlags, chatMood, createStory, dayStart, helloFor, markBeat, minuteOf, noteEvent,
  openerFor, parseStories, routineOn, watchPlan, type Cond, type Effect, type NamedStory, type ReadyBeat,
} from '../src/systems/Story.ts';

const DAY = 24 * 60;
const def = SARA_STORY;
const sara = CHARACTERS.find((c) => c.npc === 'sara')!;
const abs = (day: number, hhmm: string): number => (day - 1) * DAY + minuteOf(hhmm);

// --------------------------------------------- 1. el contenido es coherente

const flagsIn = (c?: Cond): string[] => [...(c?.flags ?? []), ...(c?.notFlags ?? [])];
const flagsOf = (e?: Effect): string[] => [...(e?.set ?? []), ...(e?.clear ?? [])];
const used = [
  ...def.beats.flatMap((b) => [...flagsIn(b.when), ...flagsOf(b.then), ...(b.choices ?? []).flatMap((c) => flagsOf(c.then))]),
  ...def.openers.flatMap((o) => flagsIn(o.when)),
  ...def.hello.options.flatMap((o) => flagsIn(o.when)),
  ...flagsIn(def.invite.when), ...flagsOf(def.invite.accept.then), ...flagsOf(def.invite.decline.then),
  ...flagsOf(def.kept.then), ...flagsOf(def.missed), ...flagsOf(def.cancelled),
  ...(def.greyFlag ? [def.greyFlag.flag] : []), ...(def.metFlag ? [def.metFlag] : []),
  ...NAMED_LINES.flatMap((l) => [...(l.f ?? []), ...(l.nf ?? [])]),
];
for (const f of used) assert.ok(f in def.flags, `flag sin declarar en data/saraStory.ts: ${f}`);
for (const f of ['sara_met', 'sara_friend', 'sara_close_friend', 'sara_event_01', 'sara_event_02', 'sara_conflict', 'sara_reconciled']) {
  assert.ok(f in def.flags, `falta la flag ${f}`);
}
// Una frase con flags es siempre de un personaje: la gente anónima nunca la ve.
for (const l of ALL_LINES) if (l.f || l.nf) assert.ok(l.n, `frase con flags sin personaje: ${l.text}`);

// Las rutinas que fija la historia existen, no salen solas y cada plan la tiene esperando en su sitio a su hora.
const grey = sara.routines.find((r) => r.id === def.greyRoutine);
assert.ok(grey?.story, `la rutina de día gris (${def.greyRoutine}) tiene que ser story`);
for (const [id, plan] of Object.entries(def.plans)) {
  const routine = sara.routines.find((r) => r.id === plan.routine);
  assert.ok(routine?.story, `plan ${id}: su rutina ${plan.routine} no existe o no es story`);
  for (const d of plan.days) assert.ok(routine.days.includes(d), `plan ${id}: se puede el día ${d} pero su rutina no`);
  for (let m = minuteOf(plan.from); m < minuteOf(plan.until); m += 5) {
    const w = whereaboutsIn(sara, routine, m);
    assert.ok(!w.moving && w.stop.point === plan.point, `plan ${id}: a las ${m} min no está esperando en ${plan.point} (${w.stop.point})`);
  }
}
// Nunca salen en el sorteo normal, llueva o no.
for (let day = 1; day <= 56; day++) {
  for (const rainy of [false, true]) assert.ok(!routineFor(sara, day, { rainy }).story, `día ${day}: una rutina de historia salió sola`);
}

// --------------------------------------------- 2. vive su vida: dónde está según la hora

const pickPlain: RoutinePicker = (day) => routineFor(sara, day);
const morning = whereabouts(sara, abs(1, '09:45'), pickPlain);
const evening = whereabouts(sara, abs(1, '18:05'), pickPlain);
assert.notEqual(`${morning.location}/${morning.stop.point}`, `${evening.location}/${evening.stop.point}`, 'horas después sigue en el mismo sitio');
assert.equal(characterDay(abs(2, '03:00')), 1, 'la madrugada es del día anterior');

// --------------------------------------------- 3. la historia, día a día

const now = (day: number, hhmm: string) => ({ day, minute: minuteOf(hhmm) });
const start = (s: NamedStory, p: SocialProfile, day: number, rainy = false) =>
  dayStart(s, p, def, { day, rainy, pick: (forced) => routineFor(sara, day, { rainy, forced }).id });
/** Elige la opción `i` de un microevento como WorldScene.showStoryBeat. */
function choose(s: NamedStory, p: SocialProfile, beat: ReadyBeat, i: number, at: { day: number; minute: number }) {
  let story = markBeat(s, beat.id, at);
  if (beat.plan && i === 0) story = acceptPlan(story, def, beat.plan);
  const effect = beat.choices ? beat.choices[i].then : beat.then!;
  return applyEffect(story, p, effect, at, 'Calle Mayor');
}

let story = createStory(def);
let profile = createSocialProfile();
({ story, profile } = start(story, profile, 1));
assert.equal(routineOn(story, 1), routineFor(sara, 1, { rainy: false }).id, 'sin nada especial, la del calendario');

// Primera charla: se presenta.
let beat = beatAfterTalk(story, def, profile, now(1, '10:00'), 1);
assert.equal(beat?.id, 'presentacion', 'al acabar la primera charla se presenta');
({ story, profile } = choose(story, profile, beat!, 0, now(1, '10:00')));
assert.ok('sara_met' in story.flags, 'sara_met');
assert.equal(beatAfterTalk(story, def, profile, now(1, '10:30'), 1)?.id, undefined, 'no se presenta dos veces ni invita a quien no conoce');

// Recuerda dónde hablaron: al día siguiente lo saca (la tirada es por día: alguno de los próximos sale).
const remembers = [2, 3, 4, 5].some((d) => {
  const s = structuredClone(story);
  noteEvent(s, 'charla', now(d - 1, '10:00'), 'la Calle Mayor');
  return openerFor(s, def, profile, now(d, '11:00'), d)?.includes('la Calle Mayor');
});
assert.ok(remembers, 'no recuerda dónde hablaron la última vez');

// Ya es amiga: lo dice una vez y abre sus frases de amistad.
profile = { ...profile, friendship: 40, trust: 25, encounters: 6 };
beat = beatAfterTalk(story, def, profile, now(2, '10:00'), 2);
assert.equal(beat?.id, 'amistad', 'al ser FRIEND lo dice');
({ story, profile } = choose(story, profile, beat!, 0, now(2, '10:00')));
assert.ok('sara_friend' in story.flags);

// Invitación: en pocos días la propone (tirada con semilla y espera de 3 días). Lo demás que saque, se rechaza.
let invite: ReadyBeat | null = null;
let inviteDay = 0;
for (let d = 3; d < 20 && !invite; d++) {
  const b = beatAfterTalk(story, def, profile, now(d, '12:00'), d);
  if (b?.id === 'invite') [invite, inviteDay] = [b, d];
  else if (b) ({ story, profile } = choose(story, profile, b, b.choices ? b.choices.length - 1 : 0, now(d, '12:00')));
}
assert.ok(invite?.plan, 'en 17 días no ha invitado nunca');
const planDef = def.plans[invite.plan.id];
assert.ok(invite.say.join(' ').includes('mañana a las'), `la invitación no dice cuándo: ${invite.say.join(' ')}`);
const planDay = invite.plan.day;
assert.ok(planDef.days.includes(weekIndex(planDay)), 'invita un día que no se puede');

// ---- 3a. va: el plan sale bien.
{
  let s = story;
  let p = profile;
  ({ story: s, profile: p } = choose(s, p, invite, 0, now(inviteDay, '12:00')));
  assert.equal(s.plan?.status, 'pending');
  assert.equal(routineOn(s, planDay), planDef.routine, 'aceptar fija su rutina de ese día');
  assert.ok(openerFor(s, def, p, now(inviteDay, '18:00'), inviteDay)?.includes(planDef.place), 'el mismo día no recuerda el plan de mañana');
  ({ story: s, profile: p } = start(s, p, planDay, false));
  assert.equal(routineOn(s, planDay), planDef.routine, 'ese día no hace la rutina del plan');
  // Y está de verdad allí, esperando, a la hora: sale del reloj con su rutina fijada.
  const fixed = s;
  const w = whereabouts(sara, abs(planDay, planDef.from) + 10, (d) => routineFor(sara, d, { forced: routineOn(fixed, d) }));
  assert.equal(w.stop.point, planDef.point, 'a la hora del plan no está en el sitio');
  assert.equal(watchPlan(s, p, def, now(planDay, planDef.from), false), null, 'sin el jugador aún no pasa nada');
  const kept = watchPlan(s, p, def, { day: planDay, minute: minuteOf(planDef.from) + 10 }, true);
  assert.ok(kept?.kept, 'el jugador está con ella y no cuenta');
  assert.ok('sara_event_01' in kept.story.flags, 'sara_event_01');
  assert.ok(kept.profile.trust > p.trust, 'ir no sube la confianza');
  assert.ok(openerFor(kept.story, def, kept.profile, now(planDay + 1, '11:00'), planDay + 1)?.includes(planDef.place), 'al día siguiente no lo recuerda');
}

// ---- 3b. no va: plantón, enfado, días grises y reconciliación.
let hurt: NamedStory;
let hurtProfile: SocialProfile;
let greyDays = 0;
{
  let s = story;
  let p = profile;
  ({ story: s, profile: p } = choose(s, p, invite, 0, now(inviteDay, '12:00')));
  ({ story: s, profile: p } = start(s, p, planDay, false));
  const moodBefore = s.mood;
  const missed = watchPlan(s, p, def, now(planDay, planDef.until), false);
  assert.ok(missed && !missed.kept, 'pasada la hora sin el jugador no es un plantón');
  ({ story: s, profile: p } = missed);
  assert.ok('sara_conflict' in s.flags && s.mood < moodBefore, 'el plantón no la deja dolida');
  [hurt, hurtProfile] = [s, p];
  // Dolida: seca al saludar, no saluda ella primero y no dice lo cariñoso.
  assert.ok(['Ah. Hola.', 'Hola. Ando liada.', 'Ah, eres tú.'].includes(openerFor(s, def, p, now(planDay + 1, '11:00'), planDay + 1)!), 'no está seca');
  assert.equal(helloFor(s, def, p, now(planDay + 1, '11:00')), null, 'dolida, saluda ella primero');
  const cold = buildContext({ who: 'sara', named: 'sara', place: 'street', day: planDay + 1, hour: 11, minute: 0, weather: 'clear', group: false, rel: 2, flags: chatFlags(s) });
  for (const l of NAMED_LINES) if (l.nf?.includes('sara_conflict')) assert.equal(fit(l, cold), 0, `dolida dice «${l.text}»`);
  // Algún día de los siguientes es gris (sale lo justo): la rutina cambia por lo que pasó.
  let g = s;
  for (let d = planDay + 1; d <= planDay + 6; d++) {
    ({ story: g } = start(g, p, d));
    if (routineOn(g, d) === def.greyRoutine) greyDays++;
  }
  assert.ok(greyDays > 0, 'tras el plantón ningún día es gris');
  // Lo saca ella al acabar una charla; pedir perdón la reconcilia.
  const talk = beatAfterTalk(s, def, p, now(planDay + 1, '12:00'), planDay + 1);
  assert.equal(talk?.id, 'reconciliar');
  assert.ok(talk.say.join(' ').includes(planDef.place), 'no dice qué plan fue');
  const sorry = choose(s, p, talk, 0, now(planDay + 1, '12:00'));
  assert.ok('sara_reconciled' in sorry.story.flags && !('sara_conflict' in sorry.story.flags), 'pedir perdón no reconcilia');
  assert.equal(sorry.story.decisions.planton, 'perdon', 'la decisión no se guarda');
  const shrug = choose(s, p, talk, 1, now(planDay + 1, '12:00'));
  assert.ok('sara_conflict' in shrug.story.flags && shrug.profile.trust < p.trust, 'quitarle importancia no cuesta nada');
}

// ---- 3c. cambia de opinión: un plan de fuera con lluvia lo cancela ella.
{
  const [outdoorId, outdoor] = Object.entries(def.plans).find(([, p]) => p.outdoor)!;
  let s = acceptPlan({ ...story, dayDone: 29 }, def, { id: outdoorId, day: 30 });
  let p = profile;
  ({ story: s, profile: p } = start(s, p, 30, true));
  assert.equal(s.plan?.status, 'cancelled', 'con lluvia no cancela el plan de fuera');
  assert.ok('sara_changed_mind' in s.flags);
  assert.notEqual(routineOn(s, 30), outdoor.routine, 'cancelado, sigue yendo');
  assert.equal(beatAfterTalk(s, def, p, now(30, '12:00'), 30)?.id, 'disculpa', 'no se disculpa');
}

// --------------------------------------------- 4. una flag desbloquea contenido (y sólo para ella)

const tattooLines = NAMED_LINES.filter((l) => l.f?.includes('sara_tattoo'));
assert.ok(tattooLines.length > 0, 'ninguna frase de la golondrina');
const ctxWith = (flags: string[]) => buildContext({ who: 'sara', named: 'sara', place: 'shop', day: 3, hour: 12, minute: 0, weather: 'clear', group: false, rel: 2, flags });
for (const l of tattooLines) {
  assert.equal(fit(l, ctxWith([])), 0, 'sin la flag ya habla de la golondrina');
  assert.ok(fit(l, ctxWith(['sara_tattoo', 'sara_friend'])) > 0, 'con la flag no puede decirlo');
}
// Y se oye: con la flag, en unas cuantas charlas sobre ropa sale alguna.
const heard = new Set<string>();
for (let i = 0; i < 80; i++) {
  const talk = new Conversation({ who: `sara`, named: 'sara', place: 'shop', day: 3 + i, hour: 12, minute: 0, weather: 'clear', group: false, rel: 2, social: createSocialProfile(), flags: ['sara_met', 'sara_friend', 'sara_tattoo'] }, new ChatLog());
  const first = talk.open();
  const opt = first.options.find((o) => o.id === 'fashion');
  if (!opt) continue;
  for (const line of talk.choose(opt.id).lines) heard.add(line);
}
assert.ok(tattooLines.some((l) => heard.has(l.text)), 'con sara_tattoo nunca habla de la golondrina');
// La gente anónima nunca recibe flags ni recuerdos de Sara aunque se le pasen.
const anon = buildContext({ who: 'c:x:1', identity: 0, place: 'shop', day: 3, hour: 12, minute: 0, weather: 'clear', group: false, rel: 2, flags: ['sara_tattoo', 'sara_friend'], opener: 'nada' });
assert.deepEqual(anon.flags, [], 'la gente anónima hereda flags');
assert.equal(anon.opener, undefined, 'la gente anónima hereda el recuerdo de Sara');
for (const l of NAMED_LINES) if (l.n === 'sara') assert.equal(fit(l, anon), 0, `«${l.text}» le sale a cualquiera`);
// Ada tampoco: tiene voz propia, pero no la historia de Sara.
const ada = buildContext({ who: 'ada', named: 'ada', place: 'shop', day: 3, hour: 12, minute: 0, weather: 'clear', group: false, rel: 2, flags: ['sara_tattoo'] });
for (const l of tattooLines) assert.equal(fit(l, ada), 0, 'Ada dice cosas de Sara');
assert.equal(STORIES.ada, undefined);

// Su ánimo llega al chat sólo cuando se nota.
assert.equal(chatMood({ ...story, mood: 20 }), 'down');
assert.equal(chatMood({ ...story, mood: 60 }), undefined);

// --------------------------------------------- 5. guardar y cargar

const store = new Map<string, string>();
const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
const save = new SaveSystem(storage);
const game = { ...createInitialState(), social: { sara: hurtProfile }, stories: { sara: hurt } };
assert.ok(save.save(game), 'no guarda');
const loaded = save.load();
assert.deepEqual(loaded?.stories?.sara, hurt, 'la historia no vuelve igual tras cargar');
// Como JSON: un campo `undefined` del perfil (lastInteraction) no se escribe, y es lo mismo.
assert.deepEqual(loaded?.social?.sara, JSON.parse(JSON.stringify(hurtProfile)), 'su relación no vuelve igual tras cargar');
// Partidas de antes de las historias, o con una historia rota, cargan sin romperse.
assert.deepEqual(parseStories(undefined), {});
const broken = parseStories({ sara: { flags: 'x', mood: 'mucho', events: [{ nope: 1 }, { id: 'conocerse', day: 2 }], plan: { id: 'terraza', status: 'raro' } } });
assert.equal(broken.sara.mood, 60);
assert.deepEqual(broken.sara.flags, {});
assert.equal(broken.sara.events.length, 1);
assert.equal(broken.sara.plan, null);
// Tras cargar, la misma rutina fijada: está donde estaba.
const pickWith = (s: NamedStory): RoutinePicker => (d) => routineFor(sara, d, { forced: routineOn(s, d) });
const t = abs(planDay + 1, '13:30');
assert.deepEqual(whereabouts(sara, t, pickWith(loaded!.stories!.sara)), whereabouts(sara, t, pickWith(hurt)), 'tras cargar no está donde estaba');

console.log(
  `historia de Sara OK: ${Object.keys(def.flags).length} flags, ${def.beats.length} microeventos + invitación, ${Object.keys(def.plans).length} planes, ` +
    `${def.openers.length} aperturas · invita el día ${inviteDay} (${planDef.place}, día ${planDay}) · plan cumplido · plantón con ${greyDays} días grises en 6 · ` +
    `reconciliación y sin perdón · cancelación por lluvia · flags que abren frases sólo para ella · guardar y cargar`,
);
