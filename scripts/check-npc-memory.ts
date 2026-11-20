// SIM-02 · Memoria social de Sara y Ada con el motor real (systems/Story, Social, Consequences, SaveSystem):
// `node scripts/check-npc-memory.ts`. Sin Phaser ni reloj real. Sólo las flags de partida (met/friend) se ponen a mano;
// todo lo demás sale de charlas, planes cumplidos o incumplidos, lluvia, cancelaciones y guardado.
// Control positivo: si el saludo de «fotógrafo/examinador» no pidiera la flag del favor, (b) falla; si el arreglo
// cancelado no se pudiera retomar, (d) no encuentra 'arreglo-pasar'; si un plantón se registrara dos veces, (c) falla;
// si el opener «sigue en pie» no pidiera plan:'pending', noPromise() falla, y promises() falla si dejara de salir.
// (h) repite plantón único, perdón → arreglo, arreglo cancelado → 'arreglo-pasar' y saludo de favor con su flag en
// todo arco de STORIES con 'reconciliar' y 'arreglo-pasar', sin nombres: planes, flags y saludos salen de su StoryDef.
import assert from 'node:assert/strict';
import { STORIES } from '../src/data/saraStory.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { routineFor } from '../src/systems/Characters.ts';
import { createInitialState, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import { MemoryStorage, slotSave } from '../src/systems/SaveSlots.ts';
import { chatRelationLevel, createSocialProfile, namedRelationLevel, relationshipState } from '../src/systems/Social.ts';
import { startHousehold } from '../src/systems/Household.ts';
import {
  createStory, beatAfterTalk, presentBeat, chooseBeat, applyEffect, dayStart, watchPlan, minuteOf, cancelStoryPlan,
  openerFor, helloFor, phoneStory, noteEvent, matches, acceptPlan, type StoryDef, type Applied, type StoryState,
} from '../src/systems/Story.ts';
import { emptyConsequences, parseConsequences, reconcile, type ConsequenceState } from '../src/systems/Consequences.ts';

// ---------------------------------------------------------------- helpers (copiados de check-arcs.ts)
const now = (day: number) => ({ day, minute: 12 * 60 });
function friends(def: StoryDef, contact = true): Applied {
  return { story: { ...createStory(def), flags: { [def.metFlag!]: 1, [def.friendFlag!]: 1 } }, profile: { ...createSocialProfile(), friendship: 45, trust: 35, encounters: 8, contactExchanged: contact } };
}
function talk(a: Applied, def: StoryDef, day: number, id: string, choice = 0): Applied {
  const beat = beatAfterTalk(a.story, def, a.profile, now(day), day);
  assert.equal(beat?.id, id, `${def.npc}, día ${day}: esperaba ${id}`);
  const story = presentBeat(a.story, beat!, now(day));
  return beat!.choices ? chooseBeat(story, a.profile, def, beat!, choice, now(day)) : applyEffect(story, a.profile, beat!.then!, now(day));
}
function attend(a: Applied, def: StoryDef, present = true): Applied {
  const p = a.story.plan!;
  const plan = def.plans[p.id];
  const c = CHARACTERS.find(c => c.npc === def.npc)!;
  const started = dayStart(a.story, a.profile, def, { day: p.day, rainy: false, pick: forced => routineFor(c, p.day, { forced }).id });
  assert.equal(started.story.routines[p.day], plan.routine);
  const result = watchPlan(started.story, started.profile, def, { day: p.day, minute: minuteOf(present ? plan.from : plan.until) }, present);
  assert.ok(result);
  assert.equal(result.kept, present);
  assert.equal(watchPlan(result.story, result.profile, def, { day: p.day, minute: minuteOf(plan.until) }, true), null, 'un plan se resuelve una sola vez');
  return result;
}
function roundtrip(a: Applied, def: StoryDef): Applied {
  const data = new Map<string, string>();
  const storage: SaveStorage = { read: k => data.get(k) ?? null, write: (k,v) => { data.set(k,v); }, remove: k => { data.delete(k); } };
  const save = new SaveSystem(storage);
  assert.ok(save.save({ ...createInitialState(), stories: { [def.npc]: a.story }, social: { [def.npc]: a.profile } }));
  const loaded = save.load()!;
  assert.deepEqual(loaded.stories![def.npc], a.story, 'guardar a mitad de arco conserva todo');
  return { story: loaded.stories![def.npc], profile: loaded.social![def.npc] };
}

// ---------------------------------------------------------------- helpers propios
const SARA = STORIES.sara;
const ADA = STORIES.ada;
const AMAIA = STORIES.amaia;
const charOf = (def: StoryDef) => CHARACTERS.find(c => c.npc === def.npc)!;
const abs = (day: number, h = 12): number => (day - 1) * 1440 + h * 60;
const consIn = (stories: StoryState) => ({ job: null, stories, household: startHousehold(1), money: 1000 });
const plantons = (s: ConsequenceState) => s.items.filter(c => c.origin.kind === 'planton');
const plantonEvents = (a: Applied) => a.story.events.filter(e => e.id === 'planton').length;
const usedOnce = (a: Applied, def: StoryDef): string[] => def.beats.filter(b => b.once && a.story.beats[b.id] !== undefined).map(b => b.id);
/** Empieza los días que falten hasta `to` (incluido), sin lluvia. */
function advance(a: Applied, def: StoryDef, to: number): Applied {
  let out = a;
  for (let d = a.story.dayDone + 1; d <= to; d++) out = dayStart(out.story, out.profile, def, { day: d, rainy: false, pick: forced => routineFor(charOf(def), d, { forced }).id });
  return out;
}
const hellos = (a: Applied, def: StoryDef, from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => helloFor(a.story, def, a.profile, now(from + i))).filter((x): x is string => x !== null);
/** Frases que prometen la cita del arreglo: sólo valen con el plan pendiente. */
const PROMISE = /sigue en pie|te espero|como dijimos/i;
/** «de el»/«a el» sin contraer (bordes con \p{L}: «día el» no es «a el»). */
const UNCONTRACTED = /(?<!\p{L})([Dd]e|[Aa]) el(?!\p{L})/u;
/** Todo lo que diría ese día (opener, saludo, móvil, microevento con sus opciones): sin «de el» ni «a el». */
function contracted(x: Applied, def: StoryDef, d: number, label: string): void {
  const b = beatAfterTalk(x.story, def, x.profile, now(d), d);
  const said = [
    openerFor(x.story, def, x.profile, now(d), d) ?? '', helloFor(x.story, def, x.profile, now(d)) ?? '',
    phoneStory(x.story, def, x.profile, now(d), d)?.text ?? '', ...(b?.say ?? []), ...(b?.choices ?? []).flatMap(c => [c.label, ...c.reply]),
  ];
  for (const t of said) assert.ok(!UNCONTRACTED.test(t), `${label}, día ${d}: sin contraer («${t}»)`);
}
/** Arreglo cancelado: 20 días seguidos, ni el opener ni el saludo prometen cita; el opener dice que quedó en el aire. */
function noPromise(x: Applied, def: StoryDef, from: number, label: string): void {
  assert.notEqual(x.story.plan?.status, 'pending', `${label}: la prueba necesita el arreglo sin pendiente`);
  for (let d = from; d < from + 20; d++) {
    contracted(x, def, d, label);
    const o = openerFor(x.story, def, x.profile, now(d), d) ?? '';
    const h = helloFor(x.story, def, x.profile, now(d)) ?? '';
    assert.ok(!PROMISE.test(o) && !PROMISE.test(h), `${label}, día ${d}: promete una cita cancelada («${o}» / «${h}»)`);
    assert.ok(/se quedó/.test(o), `${label}, día ${d}: el opener no reconoce que se quedó sin hacer («${o}»)`);
  }
}
/** Control positivo: con el arreglo pendiente, la entrada con plan:'pending' casa y el opener sí lo promete. */
function promises(x: Applied, def: StoryDef, from: number, label: string): void {
  assert.equal(x.story.plan?.status, 'pending', `${label}: la prueba necesita el arreglo pendiente`);
  const entry = def.openers.find(o => o.when.plan === 'pending' && o.when.flags?.includes(`${def.npc}_apologized`));
  assert.ok(entry && matches(x.story, entry.when, x.profile, now(from), 'check'), `${label}: la entrada con plan pending no casa`);
  for (let d = from; d < from + 6; d++) contracted(x, def, d, label);
  const said = Array.from({ length: 6 }, (_, i) => openerFor(x.story, def, x.profile, now(from + i), from + i) ?? '');
  assert.ok(said.some(o => PROMISE.test(o)), `${label}: con el arreglo pendiente no lo recuerda`);
}

// ---------------------------------------------------------------- a) FAVOR (Ada)
let favor: Applied;
{
  const def = ADA;
  let a = talk(friends(def), def, 2, 'temario');
  a = attend(a, def);
  const reviewDay = a.story.plan!.day;
  assert.ok(a.story.flags.ada_quiz_done, 'el repaso cumplido deja ada_quiz_done');
  const exam = beatAfterTalk(a.story, def, a.profile, now(reviewDay + 1), reviewDay + 1)!;
  assert.ok(exam.say.join(' ').includes('banco'), 'el examen recuerda el repaso del banco');
  a = talk(a, def, reviewDay + 1, 'examen', 0);
  const closeDay = reviewDay + 3;
  const result = beatAfterTalk(a.story, def, a.profile, now(closeDay), closeDay)!;
  assert.equal(result.id, 'resultado-ahora');
  assert.ok(result.say.join(' ').includes('banco'), 'el resultado recuerda el repaso del banco');
  a = talk(a, def, closeDay, 'resultado-ahora');
  assert.ok(a.story.flags.ada_arc_done);

  const check = (x: Applied, label: string): void => {
    const once = usedOnce(x, def);
    for (const id of ['temario', 'examen', 'resultado-ahora']) assert.ok(once.includes(id), `${label}: ${id} no consta como dicho`);
    for (let d = closeDay; d <= closeDay + 30; d++) {
      contracted(x, def, d, label);
      const b = beatAfterTalk(x.story, def, x.profile, now(d), d);
      assert.ok(!once.includes(b?.id ?? ''), `${label}, día ${d}: vuelve el beat once ${b?.id}`);
      assert.ok(!b?.id.startsWith('resultado-'), `${label}, día ${d}: el resultado se repite`);
      const msg = phoneStory(x.story, def, x.profile, now(d), d);
      if (msg) {
        assert.deepEqual(msg.profile, x.profile, `${label}, día ${d}: un mensaje cambió el perfil`);
        assert.ok(!msg.text.includes('aprobado'), `${label}, día ${d}: repite el resultado por el móvil`);
      }
    }
    assert.ok(hellos(x, def, closeDay + 1, closeDay + 60).some(h => h.includes('examinador')), `${label}: el saludo del favor no sale`);
    const openers = Array.from({ length: 60 }, (_, i) => openerFor(x.story, def, x.profile, now(closeDay + 1 + i), closeDay + 1 + i));
    assert.ok(openers.some(o => o?.includes('segundo ejercicio')), `${label}: el opener del examen aprobado no sale`);
  };
  check(a, 'Ada recién cerrada');
  // 45 cosas de relleno: el favor no vive en la lista de sucesos, vive en flags y decisiones.
  const filled = structuredClone(a.story);
  for (let i = 0; i < 45; i++) noteEvent(filled, 'charla', now(closeDay + 1 + Math.floor(i / 3)), 'la plaza');
  const busy: Applied = { story: filled, profile: a.profile };
  assert.ok(!busy.story.events.some(e => e.id === 'repaso'), 'el relleno no llegó a empujar el suceso del repaso');
  check(busy, 'Ada tras 45 sucesos');
  check(roundtrip(busy, def), 'Ada tras guardar y cargar');
  favor = a;
}

// ---------------------------------------------------------------- b) falso favor: sin repaso ni fotos
{
  const def = ADA;
  let a = talk(friends(def), def, 2, 'temario', 1);
  const alone = beatAfterTalk(a.story, def, a.profile, now(9), 9)!;
  assert.equal(alone.id, 'resultado-sola');
  assert.ok(!alone.say.join(' ').includes('banco'), 'sin repaso no puede recordar el banco');
  a = talk(a, def, 9, 'resultado-sola');
  assert.ok(a.story.flags.ada_arc_done && !a.story.flags.ada_quiz_done);
  const said = hellos(a, def, 1, 60);
  assert.ok(said.length > 0, 'Ada no saluda nunca: la prueba no diría nada');
  assert.ok(said.every(h => !h.includes('examinador')), 'Ada llama examinador a quien no le tomó el temario');
}
{
  const def = SARA;
  let a = talk(friends(def), def, 2, 'lookbook', 1);
  a = talk(a, def, 4, 'presentacion-sin-fotos', 0);
  a = attend(a, def);
  const presDay = a.story.plan!.day;
  a = talk(a, def, presDay + 1, 'cierre-sin-fotos');
  assert.ok(a.story.flags.sara_arc_done && !a.story.flags.sara_shoot);
  const said = hellos(a, def, 1, 60);
  assert.ok(said.length > 0, 'Sara no saluda nunca: la prueba no diría nada');
  assert.ok(said.every(h => !h.includes('fotógrafo')), 'Sara llama fotógrafo a quien no le hizo las fotos');
}

// ---------------------------------------------------------------- c) PLANTÓN: una vez, se registre lo que se registre
{
  const def = SARA;
  const promised = talk(friends(def), def, 2, 'lookbook');
  const missed = attend(promised, def, false);
  const M = missed.story.plan!.day;
  assert.ok(missed.story.flags.sara_conflict);
  assert.equal(missed.profile.trust, promised.profile.trust + def.missed.social!.trust!, 'el plantón resta confianza una vez');
  const sameDay = dayStart(missed.story, missed.profile, def, { day: M, rainy: false, pick: forced => routineFor(charOf(def), M, { forced }).id });
  assert.deepEqual(sameDay.profile, missed.profile, 'empezar otra vez el mismo día volvió a restar');
  const next = advance(sameDay, def, M + 2);
  assert.deepEqual(next.profile, missed.profile, 'los días siguientes volvieron a restar');
  assert.equal(plantonEvents(next), 1);
  const r1 = reconcile(emptyConsequences(), consIn({ sara: missed.story }), M, abs(M, 22));
  const r2 = reconcile(r1.state, consIn({ sara: next.story }), M, abs(M, 23));
  const r3 = reconcile(parseConsequences(JSON.parse(JSON.stringify(r2.state))), consIn({ sara: next.story }), M + 1, abs(M + 1, 9));
  for (const r of [r1, r2, r3]) {
    assert.equal(plantons(r.state).length, 1, 'el plantón se registró más de una vez');
    assert.equal(plantons(r.state)[0].consequenceId, `planton:sara:${M}`);
  }
}

// ---------------------------------------------------------------- d) REPARACIÓN
// Ada: sin perdón no repara; con perdón, el arreglo (al aire libre) se lo lleva la lluvia, no se pasa, y se retoma.
let repairedAda: Applied;
{
  const def = ADA;
  let a = attend(talk(friends(def), def, 2, 'temario'), def, false);
  const M = a.story.plan!.day;
  let cons = reconcile(emptyConsequences(), consIn({ ada: a.story }), M, abs(M, 22)).state;
  a = talk(a, def, M + 1, 'reconciliar', 1);
  assert.ok(a.story.flags.ada_conflict && !a.story.flags.ada_apologized, 'una excusa no repara');
  cons = reconcile(cons, consIn({ ada: a.story }), M + 1, abs(M + 1)).state;
  assert.equal(plantons(cons)[0].status, 'active');
  a = talk(a, def, M + 2, 'reconciliar', 0);
  assert.ok(a.story.flags.ada_conflict && a.story.flags.ada_apologized);
  assert.equal(a.story.plan?.id, 'repaso-arreglo');
  cons = reconcile(cons, consIn({ ada: a.story }), M + 2, abs(M + 2)).state;
  assert.equal(plantons(cons)[0].status, 'repairing');
  promises(a, def, M + 2, 'Ada, arreglo pendiente');

  const X = a.story.plan!.day;
  const rainy = dayStart(a.story, a.profile, def, { day: X, rainy: true, pick: forced => routineFor(charOf(def), X, { forced, rainy: true }).id });
  assert.equal(rainy.story.plan!.status, 'cancelled');
  const resched = beatAfterTalk(rainy.story, def, rainy.profile, now(X), X)!;
  assert.equal(resched.id, 'reschedule');
  let b: Applied = chooseBeat(rainy.story, rainy.profile, def, resched, 1, now(X));
  assert.deepEqual(b.profile, a.profile, 'lluvia y no pasarlo cambiaron la relación');
  assert.equal(b.story.offer, null);
  assert.equal(plantonEvents(b), 1, 'la lluvia contó como plantón');
  const offered = beatAfterTalk(b.story, def, b.profile, now(X), X)!;
  assert.equal(offered.id, 'arreglo-pasar');
  b = talk(b, def, X, 'arreglo-pasar', 1);
  assert.deepEqual(b.profile, a.profile, '«Ahora no puedo» tiene efecto social');
  assert.ok(b.story.flags.ada_conflict && b.story.flags.ada_apologized && b.story.plan?.status === 'cancelled');
  noPromise(b, def, X, 'Ada, arreglo cancelado por lluvia');
  assert.notEqual(beatAfterTalk(b.story, def, b.profile, now(X), X)?.id, 'arreglo-pasar', 'arreglo-pasar sin esperar su día');
  const again = beatAfterTalk(b.story, def, b.profile, now(X + 1), X + 1)!;
  assert.equal(again.id, 'arreglo-pasar');
  assert.ok(!again.choices![0].reply.join(' ').includes('{') && again.choices![0].reply.join(' ').includes(' a las '), 'el arreglo no dice cuándo');
  b = talk(b, def, X + 1, 'arreglo-pasar', 0);
  assert.deepEqual(b.profile, a.profile, 'volver a quedar no repara por sí solo');
  assert.equal(b.story.plan?.id, 'repaso-arreglo');
  cons = reconcile(cons, consIn({ ada: b.story }), X + 1, abs(X + 1)).state;
  assert.equal(plantons(cons).length, 1, 'cancelar el arreglo registró un plantón nuevo');
  assert.equal(plantons(cons)[0].status, 'repairing');
  b = attend(b, def);
  const Z = b.story.plan!.day;
  assert.ok(b.story.flags.ada_reconciled && !b.story.flags.ada_conflict && !b.story.flags.ada_apologized);
  cons = reconcile(cons, consIn({ ada: b.story }), Z, abs(Z, 21)).state;
  assert.equal(plantons(cons).length, 1);
  assert.equal(plantons(cons)[0].status, 'resolved', 'acudir al arreglo no resolvió el plantón');
  repairedAda = b;
}
// Sara: ninguna de las dos opciones sin compromiso repara; el arreglo lo cancela ella (sin ánimo) y luego tú.
let repairedSara: Applied;
{
  const def = SARA;
  let a = attend(talk(friends(def), def, 2, 'lookbook'), def, false);
  const M = a.story.plan!.day;
  a = talk(a, def, M + 1, 'reconciliar', 1);
  assert.ok(a.story.flags.sara_conflict && !a.story.flags.sara_apologized, 'sólo perdón no repara');
  a = talk(a, def, M + 2, 'reconciliar', 2);
  assert.ok(a.story.flags.sara_conflict && !a.story.flags.sara_apologized, 'quitarle importancia no repara');
  a = talk(a, def, M + 3, 'reconciliar', 0);
  assert.equal(a.story.plan?.id, 'arreglo');
  promises(a, def, M + 3, 'Sara, arreglo pendiente');
  const X = a.story.plan!.day;
  a = advance(a, def, X - 1);
  // Ella sin ánimo ese día (como en check-arcs, el ánimo bajo se fuerza: el arco no lo baja tanto por sí solo).
  const low = dayStart({ ...a.story, mood: 20 }, a.profile, def, { day: X, rainy: false, pick: forced => routineFor(charOf(def), X, { forced }).id });
  assert.equal(low.story.plan!.status, 'cancelled');
  assert.ok(low.story.flags.sara_changed_mind && low.story.flags.sara_apologized && low.story.flags.sara_conflict);
  assert.deepEqual(low.profile, a.profile);
  assert.equal(plantonEvents(low), 1);
  noPromise(low, def, X, 'Sara, arreglo cancelado por ánimo');
  let b = talk(low, def, X, 'arreglo-pasar', 0);
  assert.deepEqual(b.profile, a.profile, 'volver a quedar no repara por sí solo');
  assert.equal(b.story.plan?.id, 'arreglo');
  // Ahora lo cancela el jugador.
  b = cancelStoryPlan(b.story, b.profile, def, now(X))!;
  assert.equal(b.story.plan!.status, 'cancelled');
  assert.ok(b.story.flags.sara_conflict && b.story.flags.sara_apologized, 'cancelar el arreglo cambió el estado del plantón');
  assert.equal(plantonEvents(b), 1, 'cancelar el arreglo contó como plantón');
  noPromise(b, def, X, 'Sara, arreglo cancelado por el jugador');
  b = talk(b, def, X + 1, 'arreglo-pasar', 0);
  b = attend(b, def);
  assert.ok(b.story.flags.sara_reconciled && !b.story.flags.sara_conflict && !b.story.flags.sara_apologized, 'acudir no reparó');
  repairedSara = b;
}

// ---------------------------------------------------------------- e) CONFIANZA (Sara)
{
  const def = SARA;
  const keptDays: number[] = [];
  const keep = (a: Applied): Applied => {
    const p = a.story.plan!;
    const plan = def.plans[p.id];
    const social = (plan.kept ?? def.kept).then.social!;
    const r = attend(a, def);
    assert.equal(r.profile.trust, a.profile.trust + (social.trust ?? 0), `${p.id}: la confianza no sube una vez`);
    assert.equal(r.profile.friendship, a.profile.friendship + (social.friendship ?? 0), `${p.id}: la amistad no sube una vez`);
    assert.equal(watchPlan(r.story, r.profile, def, { day: p.day, minute: minuteOf(plan.from) + 5 }, true), null, 'un plan cumplido se vuelve a contar');
    keptDays.push(p.day);
    return r;
  };
  const noIntimacy = (a: Applied, d: number): void => {
    const id = beatAfterTalk(a.story, def, a.profile, now(d), d)?.id;
    assert.ok(id !== 'disenos' && id !== 'cercania', `día ${d}: ${id} antes de CLOSE_FRIEND`);
  };
  let a = talk(friends(def), def, 2, 'lookbook');
  a = keep(a);
  const shootDay = a.story.plan!.day;
  noIntimacy(a, shootDay);
  a = talk(a, def, shootDay, 'portada', 0);
  a = talk(a, def, shootDay + 1, 'presentacion-invita');
  a = keep(a);
  const presDay = a.story.plan!.day;
  a = talk(a, def, presDay + 1, 'cierre-mural');
  assert.ok(hellos(a, def, presDay + 2, presDay + 61).some(h => h.includes('fotógrafo')), 'con las fotos hechas, el saludo del favor no sale');
  let d = presDay + 2;
  for (; d < presDay + 90 && relationshipState(a.profile) !== 'CLOSE_FRIEND'; d++) {
    noIntimacy(a, d);
    const b = beatAfterTalk(a.story, def, a.profile, now(d), d);
    if (!b) continue;
    if (b.id === 'invite') {
      a = keep(talk(a, def, d, 'invite', 0));
      d = a.story.plan!.day;
    } else if (b.id === 'tatuaje') a = talk(a, def, d, 'tatuaje', 1);
    else assert.fail(`día ${d}: beat inesperado ${b.id}`);
  }
  assert.equal(relationshipState(a.profile), 'CLOSE_FRIEND', 'no llega a CLOSE_FRIEND');
  assert.ok(keptDays.length >= 3 && new Set(keptDays).size === keptDays.length, 'los planes no caen en días distintos');
  a = talk(a, def, d, 'cercania');
  const trust = a.profile.trust;
  a = talk(a, def, d, 'disenos', 0);
  assert.equal(a.profile.trust, trust + 8);
  // Ya dichos: no vuelven, ni en persona ni guardando y cargando, así que su confianza no se suma dos veces.
  const back = roundtrip(a, def);
  for (let k = d; k < d + 30; k++) {
    for (const x of [a, back]) {
      const id = beatAfterTalk(x.story, def, x.profile, now(k), k)?.id;
      assert.ok(id !== 'disenos' && id !== 'cercania', `día ${k}: ${id} se repite`);
    }
  }
}

// ---------------------------------------------------------------- f) ranuras: cada una guarda su historia
{
  const mem = new MemoryStorage();
  const one = { ...createInitialState(), stories: { ada: repairedAda.story }, social: { ada: repairedAda.profile } };
  const two = { ...createInitialState(), stories: { sara: repairedSara.story, ada: favor.story }, social: { sara: repairedSara.profile, ada: favor.profile } };
  assert.ok(slotSave(mem, 1).save(one));
  assert.ok(slotSave(mem, 2).save(two));
  const l1 = slotSave(mem, 1).load()!;
  const l2 = slotSave(mem, 2).load()!;
  assert.deepEqual(l1.stories!.ada, repairedAda.story);
  assert.ok(!l1.stories!.sara, 'la ranura 1 tiene la Sara de la 2');
  assert.deepEqual(l2.stories!.ada, favor.story);
  assert.deepEqual(l2.stories!.sara, repairedSara.story);
  assert.notDeepEqual(l1.stories!.ada, l2.stories!.ada, 'las dos ranuras cargan la misma Ada');
}

// ---------------------------------------------------------------- g) CIERRE DE PENDIENTES
// A1 · contracción: un plantón real en el Molinillo (el arreglo) → «Lo del Molinillo»; sin plan ni sucesos, «del barrio».
{
  const def = SARA;
  let a = attend(talk(friends(def), def, 2, 'lookbook'), def, false);
  a = talk(a, def, a.story.plan!.day + 1, 'reconciliar', 0);
  assert.equal(a.story.plan?.id, 'arreglo');
  a = attend(a, def, false);
  const M = a.story.plan!.day;
  const r = beatAfterTalk(a.story, def, a.profile, now(M + 1), M + 1)!;
  assert.equal(r.id, 'reconciliar');
  assert.ok(r.say.join(' ').includes('Lo del Molinillo'), `sin contraer: «${r.say.join(' ')}»`);
  contracted(a, def, M + 1, 'Sara tras el plantón del Molinillo');
  const bare: StoryDef = { ...def, openers: [{ when: {}, text: ['Lo de {lugar}.'] }] };
  assert.equal(openerFor(createStory(def), bare, createSocialProfile(), now(3), 3), 'Lo del barrio.');
}
// A2 · Amaia: el paseo del arreglo cancelado (lluvia, ánimo, jugador) se retoma con 'arreglo-pasar' y sólo repara acudiendo.
{
  const def = AMAIA;
  let a = attend(talk(friends(def), def, 2, 'desconexion'), def, false);
  const M = a.story.plan!.day;
  assert.ok(a.story.flags.amaia_conflict);
  a = talk(a, def, M + 1, 'reconciliar', 0);
  assert.ok(a.story.flags.amaia_conflict && a.story.flags.amaia_apologized);
  assert.equal(a.story.plan?.id, 'paseo-arreglo');
  assert.equal(a.story.plan?.status, 'pending');
  promises(a, def, M + 1, 'Amaia, arreglo pendiente');
  // Lluvia, y no se pasa.
  const X = a.story.plan!.day;
  const rainy = dayStart(a.story, a.profile, def, { day: X, rainy: true, pick: forced => routineFor(charOf(def), X, { forced, rainy: true }).id });
  assert.equal(rainy.story.plan!.status, 'cancelled');
  const resched = beatAfterTalk(rainy.story, def, rainy.profile, now(X), X)!;
  assert.equal(resched.id, 'reschedule');
  let b: Applied = chooseBeat(rainy.story, rainy.profile, def, resched, 1, now(X));
  assert.equal(beatAfterTalk(b.story, def, b.profile, now(X), X)?.id, 'arreglo-pasar');
  b = talk(b, def, X, 'arreglo-pasar', 1);
  assert.deepEqual(b.profile, a.profile, '«Ahora no puedo» tiene efecto social');
  noPromise(b, def, X, 'Amaia, arreglo cancelado por lluvia');
  b = talk(b, def, X + 1, 'arreglo-pasar', 0);
  assert.deepEqual(b.profile, a.profile, 'volver a quedar no repara por sí solo');
  assert.equal(b.story.plan?.id, 'paseo-arreglo');
  assert.equal(b.story.plan?.status, 'pending');
  promises(b, def, X + 1, 'Amaia, arreglo pasado');
  // Ella sin ánimo ese día. Mood 10 y no 20: la deriva de un día (+10) lo dejaría en 30, que no está bajo greyBelow (30).
  const Y = b.story.plan!.day;
  b = advance(b, def, Y - 1);
  const low = dayStart({ ...b.story, mood: 10 }, b.profile, def, { day: Y, rainy: false, pick: forced => routineFor(charOf(def), Y, { forced }).id });
  assert.equal(low.story.plan!.status, 'cancelled');
  assert.ok(low.story.flags.amaia_changed_mind && low.story.flags.amaia_apologized && low.story.flags.amaia_conflict);
  assert.equal(plantonEvents(low), 1);
  noPromise(low, def, Y, 'Amaia, arreglo cancelado por ánimo');
  b = talk(low, def, Y, 'arreglo-pasar', 0);
  assert.equal(b.story.plan?.id, 'paseo-arreglo');
  // Ahora lo cancela el jugador.
  b = cancelStoryPlan(b.story, b.profile, def, now(Y))!;
  assert.ok(b.story.flags.amaia_conflict && b.story.flags.amaia_apologized, 'cancelar el arreglo cambió el estado del plantón');
  assert.equal(plantonEvents(b), 1, 'cancelar el arreglo contó como plantón');
  noPromise(b, def, Y, 'Amaia, arreglo cancelado por el jugador');
  b = talk(b, def, Y + 1, 'arreglo-pasar', 0);
  b = attend(b, def);
  assert.ok(b.story.flags.amaia_reconciled && !b.story.flags.amaia_conflict && !b.story.flags.amaia_apologized, 'acudir no reparó');
}
// A3 · contestar un microevento sin propuesta es idempotente: una vez por cada vez que se dice.
{
  const def = SARA;
  const a = attend(talk(friends(def), def, 2, 'lookbook'), def, false);
  const M = a.story.plan!.day;
  const beat = beatAfterTalk(a.story, def, a.profile, now(M + 1), M + 1)!;
  assert.equal(beat.id, 'reconciliar');
  const i = beat.choices!.findIndex(c => c.label === 'Quitarle importancia');
  assert.equal(chooseBeat(a.story, a.profile, def, beat, i, now(M + 1)).reply.length, 0, 'se contesta sin haberlo dicho');
  const first = chooseBeat(presentBeat(a.story, beat, now(M + 1)), a.profile, def, beat, i, now(M + 1));
  assert.equal(first.profile.trust, a.profile.trust - 5);
  const second = chooseBeat(first.story, first.profile, def, beat, i, now(M + 1));
  assert.deepEqual(second.reply, []);
  assert.deepEqual(second.profile, first.profile, 'contestar dos veces resta dos veces');
  const back = roundtrip(first, def);
  assert.ok('ans:reconciliar' in back.story.beats, 'la marca no sobrevive al guardado');
  assert.deepEqual(chooseBeat(back.story, back.profile, def, beat, i, now(M + 1)).reply, [], 'tras cargar se contesta otra vez');
  const later = beatAfterTalk(first.story, def, first.profile, now(M + 2), M + 2)!;
  assert.equal(later.id, 'reconciliar');
  const again = chooseBeat(presentBeat(first.story, later, now(M + 2)), first.profile, def, later, i, now(M + 2));
  assert.ok(again.reply.length > 0 && again.profile.trust === first.profile.trust - 5, 'dicho otro día no se puede contestar');
}
// A4 · aceptar y cancelar no sale a cuenta.
for (const def of [SARA, ADA, AMAIA]) {
  const base = friends(def);
  const acc = applyEffect(acceptPlan(base.story, def, { id: Object.keys(def.plans)[0], day: 10 }), base.profile, def.invite.accept.then, now(5));
  const early = cancelStoryPlan(acc.story, acc.profile, def, now(5))!;
  assert.ok(early.profile.friendship <= base.profile.friendship && early.profile.trust <= base.profile.trust, `${def.npc}: aceptar y cancelar con tiempo sale a cuenta`);
  const late = cancelStoryPlan(acc.story, acc.profile, def, now(10))!;
  assert.equal(late.profile.trust, acc.profile.trust - 3, `${def.npc}: cancelar el mismo día no resta 3 de confianza`);
}
// B5 · con perfil social manda Social (aunque el registro antiguo diga affinity 10); sin perfil, el registro antiguo.
{
  const def = SARA;
  const hurt = attend(talk(friends(def), def, 2, 'lookbook'), def, false);
  assert.ok(hurt.story.flags.sara_conflict);
  assert.equal(namedRelationLevel(hurt.profile, true, { encounters: 1, affinity: 10 }), chatRelationLevel(hurt.profile));
  assert.equal(namedRelationLevel(createSocialProfile(), false, { encounters: 5, affinity: 0 }), 2);
  assert.equal(namedRelationLevel(createSocialProfile(), true, { encounters: 5, affinity: 10 }), chatRelationLevel(createSocialProfile()));
}

// ---------------------------------------------------------------- h) GENERAL: todo STORIES
// Cualquier arco con 'reconciliar' y 'arreglo-pasar': todo se deriva de su StoryDef, ningún nombre en la lógica.
const generalIds: string[] = [];
let favorHellos = 0;
for (const def of Object.values(STORIES)) {
  if (!def.beats.some(b => b.id === 'reconciliar') || !def.beats.some(b => b.id === 'arreglo-pasar')) continue;
  const tag = `h) ${def.npc}`;
  generalIds.push(def.npc);
  assert.ok(CHARACTERS.some(c => c.npc === def.npc), `${tag}: tiene arco de reparación pero no rutina en data/characters.ts`);
  const conflict = `${def.npc}_conflict`;
  const apologized = `${def.npc}_apologized`;
  const reconciled = `${def.npc}_reconciled`;
  // El arreglo: el plan de la opción de 'reconciliar' que deja la disculpa.
  const repairId = def.beats.find(b => b.id === 'reconciliar')!.choices?.find(c => c.plan && c.then.set?.includes(apologized))?.plan;
  assert.ok(repairId && def.plans[repairId], `${tag}: 'reconciliar' no tiene opción con plan que deje ${apologized}`);
  const firstId = Object.keys(def.plans).find(id => id !== repairId);
  assert.ok(firstId, `${tag}: no hay plan aparte del arreglo`);

  // 2) Plantón único.
  const base = friends(def);
  const promised = applyEffect(acceptPlan(base.story, def, { id: firstId, day: 10 }), base.profile, def.invite.accept.then, now(5));
  const missed = attend(promised, def, false);
  const M = missed.story.plan!.day;
  assert.ok(missed.story.flags[conflict] !== undefined, `${tag}: faltar a ${firstId} (día ${M}) no deja ${conflict}`);
  const next = advance(missed, def, M + 2);
  assert.equal(plantonEvents(next), 1, `${tag}: el plantón del día ${M} no consta una sola vez`);
  const r1 = reconcile(emptyConsequences(), consIn({ [def.npc]: missed.story }), M, abs(M, 22));
  const r2 = reconcile(r1.state, consIn({ [def.npc]: next.story }), M, abs(M, 23));
  const r3 = reconcile(parseConsequences(JSON.parse(JSON.stringify(r2.state))), consIn({ [def.npc]: next.story }), M + 1, abs(M + 1, 9));
  for (const r of [r1, r2, r3]) {
    assert.equal(plantons(r.state).length, 1, `${tag}: el plantón se registró más de una vez`);
    assert.equal(plantons(r.state)[0].consequenceId, `planton:${def.npc}:${M}`);
  }
  let cons = r3.state;

  // 3) Perdón → arreglo: de las opciones de 'reconciliar', la que deja la disculpa.
  const R = M + 2;
  const rec = beatAfterTalk(next.story, def, next.profile, now(R), R);
  assert.equal(rec?.id, 'reconciliar', `${tag}, día ${R}: tras el plantón no saca 'reconciliar'`);
  const shown = presentBeat(next.story, rec!, now(R));
  const sorry = (rec!.choices ?? []).map((_, i) => chooseBeat(shown, next.profile, def, rec!, i, now(R))).find(t => t.story.flags[apologized] !== undefined);
  if (!sorry) assert.fail(`${tag}: ninguna opción de 'reconciliar' deja ${apologized}`);
  let a: Applied = { story: sorry.story, profile: sorry.profile };
  assert.equal(a.story.plan?.status, 'pending', `${tag}: pedir perdón no deja el arreglo pendiente`);
  assert.notEqual(a.story.plan?.id, firstId, `${tag}: el arreglo es el mismo plan del plantón`);
  assert.equal(a.story.plan?.id, repairId);
  promises(a, def, R, `${tag}, arreglo pendiente`);
  cons = reconcile(cons, consIn({ [def.npc]: a.story }), R, abs(R)).state;
  assert.equal(plantons(cons)[0].status, 'repairing', `${tag}: con la disculpa, el plantón no pasa a reparación`);

  // 4) El jugador cancela el arreglo el mismo día: sin culpa nueva, se retoma con 'arreglo-pasar'.
  const X = a.story.plan!.day;
  a = advance(a, def, X);
  assert.equal(a.story.plan?.status, 'pending', `${tag}, día ${X}: el arreglo se canceló solo al empezar el día (¿ánimo bajo?)`);
  const cancelled = cancelStoryPlan(a.story, a.profile, def, now(X));
  assert.ok(cancelled, `${tag}, día ${X}: no se pudo cancelar el arreglo`);
  let b: Applied = cancelled;
  assert.equal(b.story.plan?.status, 'cancelled');
  assert.ok(b.story.flags[conflict] !== undefined && b.story.flags[apologized] !== undefined, `${tag}: cancelar el arreglo cambió el estado del plantón`);
  assert.equal(plantonEvents(b), 1, `${tag}: cancelar el arreglo contó como plantón`);
  noPromise(b, def, X, `${tag}, arreglo cancelado por el jugador`);
  cons = reconcile(cons, consIn({ [def.npc]: b.story }), X, abs(X, 21)).state;
  assert.equal(plantons(cons).length, 1, `${tag}: cancelar el arreglo registró un plantón nuevo`);
  b = advance(b, def, X + 1);
  const pasar = beatAfterTalk(b.story, def, b.profile, now(X + 1), X + 1);
  assert.equal(pasar?.id, 'arreglo-pasar', `${tag}, día ${X + 1}: el arreglo cancelado no se retoma`);
  const idx = pasar!.choices?.findIndex(c => c.plan) ?? -1;
  assert.ok(idx >= 0, `${tag}: 'arreglo-pasar' no tiene opción que vuelva a quedar`);
  const again = chooseBeat(presentBeat(b.story, pasar!, now(X + 1)), b.profile, def, pasar!, idx, now(X + 1));
  assert.equal(again.story.plan?.status, 'pending', `${tag}: volver a quedar no deja el arreglo pendiente`);
  assert.equal(again.story.plan?.id, repairId);
  assert.deepEqual(again.profile, b.profile, `${tag}: volver a quedar tiene efecto social`);
  b = attend({ story: again.story, profile: again.profile }, def);
  const Z = b.story.plan!.day;
  assert.ok(b.story.flags[reconciled] !== undefined && b.story.flags[conflict] === undefined && b.story.flags[apologized] === undefined, `${tag}: acudir al arreglo (día ${Z}) no reparó`);
  cons = reconcile(cons, consIn({ [def.npc]: b.story }), Z, abs(Z, 21)).state;
  assert.equal(plantons(cons).length, 1, `${tag}: el plantón se registró más de una vez`);
  assert.equal(plantons(cons)[0].status, 'resolved', `${tag}: acudir al arreglo no resolvió el plantón`);

  // 5) Un saludo de favor (flags aparte de met/friend) no sale sin cada una de sus flags; con todas, sí.
  for (const o of def.hello.options) {
    const favorFlags = (o.when.flags ?? []).filter(f => f !== def.metFlag && f !== def.friendFlag);
    if (favorFlags.length === 0) continue;
    favorHellos++;
    const frags = o.lines.map(l => l.split(/\{[^}]*\}/).map(s => s.trim()).sort((x, y) => y.length - x.length)[0]);
    assert.ok(frags.every(f => f.length >= 6), `${tag}: un saludo de favor sin fragmento fijo con que reconocerlo`);
    const says = (h: string): boolean => frags.some(f => h.includes(f));
    const withFlags = (fs: readonly string[]): Applied => {
      const x = friends(def);
      return { story: { ...x.story, flags: { ...x.story.flags, ...Object.fromEntries(fs.map(f => [f, 1])) } }, profile: x.profile };
    };
    for (const f of favorFlags) {
      const said = hellos(withFlags(favorFlags.filter(g => g !== f)), def, 1, 60).filter(says);
      assert.equal(said.length, 0, `${tag}: sin ${f} saluda con el favor («${said[0]}»)`);
    }
    assert.ok(hellos(withFlags(favorFlags), def, 1, 60).some(says), `${tag}: con ${favorFlags.join(' + ')}, «${o.lines[0]}» no sale en 60 días`);
  }
}
assert.ok(generalIds.length > 0, 'h) ningún arco de STORIES tiene reconciliar y arreglo-pasar: la sección no prueba nada');
assert.ok(favorHellos > 0, 'h) ningún saludo de favor en STORIES: la prueba de sensibilidad no prueba nada');

console.log(`memoria social OK: favor recordado en flags (saludo y opener tras 45 sucesos y tras guardar), sin falso favor, plantón único en historia y consecuencias, arreglo cancelado (lluvia, ánimo, jugador) que se retoma y sólo repara acudiendo, confianza por plan una vez y diseños sólo en CLOSE_FRIEND, ranuras separadas; h) general: ${generalIds.length} defs (${generalIds.join(', ')}), ${favorHellos} saludos de favor`);
