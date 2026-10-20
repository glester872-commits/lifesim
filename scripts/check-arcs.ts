// Arcos completos con el mismo motor que usa WorldScene; sin Phaser ni reloj real.
import assert from 'node:assert/strict';
import { STORIES } from '../src/data/saraStory.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { routineFor, whereaboutsIn } from '../src/systems/Characters.ts';
import { createInitialState, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import { createSocialProfile } from '../src/systems/Social.ts';
import { phoneOptions, createPhone, postMessage } from '../src/systems/Phone.ts';
import { createStory, migrateStory, beatAfterTalk, presentBeat, chooseBeat, applyEffect, phoneStory, offerBeat, dayStart, watchPlan, minuteOf, type StoryDef, type Applied } from '../src/systems/Story.ts';

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

// Cada rutina mantiene al personaje en el punto durante toda la ventana de todos los planes.
for (const def of Object.values(STORIES)) {
  const c = CHARACTERS.find(c => c.npc === def.npc)!;
  for (const [id, p] of Object.entries(def.plans)) {
    const routine = c.routines.find(r => r.id === p.routine)!;
    assert.ok(routine?.story, `${def.npc}/${id}: rutina de historia`);
    for (let minute = minuteOf(p.from); minute < minuteOf(p.until); minute += 5) {
      const w = whereaboutsIn(c, routine, minute);
      assert.ok(!w.moving && w.stop.point === p.point, `${def.npc}/${id}: no espera a las ${minute}`);
    }
  }
  // Las partidas antiguas no repiten presentaciones ni amistad.
  const old = friends(def).profile;
  const migrated = migrateStory(createStory(def), def, old, 10);
  assert.equal(migrated.flags[def.metFlag!], 10);
  assert.equal(migrated.flags[def.friendFlag!], 10);
  assert.ok(!['presentacion', 'amistad', 'amistad-con-numero'].includes(beatAfterTalk(migrated, def, old, now(10), 10)?.id ?? ''));
  assert.equal(phoneStory(friends(def, false).story, def, friends(def, false).profile, now(2), 2), null, 'sin número no hay mensaje');

  // La misma propuesta por móvil y en persona; guardar antes de contestar, rechazar o aceptar.
  const first = def.npc === 'sara' ? 'lookbook' : 'temario';
  const base = friends(def);
  assert.notEqual(beatAfterTalk(base.story, def, base.profile, now(1), 1)?.id, first, 'no adelanta el primer hito');
  const sent = phoneStory(base.story, def, base.profile, now(2), 2)!;
  assert.ok(sent?.story.offer?.sent);
  let pending = roundtrip(sent, def);
  assert.equal(phoneStory(pending.story, def, pending.profile, now(2), 2), null, 'no repite el mensaje');
  const beat = offerBeat(pending.story, def, now(2), 2)!;
  assert.equal(beat.id, first);
  assert.deepEqual(beatAfterTalk(pending.story, def, pending.profile, now(2), 2), beat, 'misma oferta en persona');
  const opts = phoneOptions(createPhone(), def.npc, pending.profile, 1440 + 720, { accept: beat.choices![0].label, decline: beat.choices![1].label });
  assert.equal(opts[0].label, beat.choices![0].label);
  const rejected = chooseBeat(pending.story, pending.profile, def, beat, 1, now(2));
  assert.equal(rejected.story.offer, null);
  assert.equal(rejected.story.plan, null, 'rechazar no crea un plan');
  const expired = chooseBeat(pending.story, pending.profile, def, beat, 0, now(7));
  assert.deepEqual(expired.story, pending.story, 'una propuesta caducada no aplica efectos');
  const yes = chooseBeat(pending.story, pending.profile, def, beat, 0, now(2));
  assert.equal(yes.story.plan?.status, 'pending');
  assert.equal(yes.story.offer, null);
  const duplicate = chooseBeat(yes.story, yes.profile, def, beat, 0, now(2));
  assert.deepEqual(duplicate.story, yes.story, 'contestar dos veces no duplica eventos');
  assert.deepEqual(duplicate.profile, yes.profile, 'contestar dos veces no duplica confianza');
  assert.equal(offerBeat(yes.story, def, now(2), 2), null);
  const phone = postMessage(createPhone(), def.npc, 'them', sent.text, 2160);
  assert.equal(phone.threads[def.npc].messages.length, 1);

  // Lluvia: ni culpa ni daño social; aceptar/rechazar el aplazamiento por la misma vía.
  const cDef = CHARACTERS.find(c => c.npc === def.npc)!;
  const rainy = dayStart(yes.story, yes.profile, def, { day: yes.story.plan!.day, rainy: true, pick: forced => routineFor(cDef, yes.story.plan!.day, { forced, rainy: true }).id });
  assert.equal(rainy.story.plan!.status, 'cancelled');
  assert.deepEqual(rainy.profile, yes.profile);
  assert.ok(!(`${def.npc}_conflict` in rainy.story.flags));
  const rainSent = phoneStory(rainy.story, def, rainy.profile, now(rainy.story.dayDone), rainy.story.dayDone)!;
  const reschedule = offerBeat(rainSent.story, def, now(rainy.story.dayDone), rainy.story.dayDone)!;
  assert.equal(reschedule.id, 'reschedule');
  const later = chooseBeat(rainSent.story, rainSent.profile, def, reschedule, 0, now(rainy.story.dayDone));
  assert.ok(later.story.plan!.day > rainy.story.dayDone);
  assert.equal(later.story.plan!.status, 'pending');
  // Ánimo bajo es una cancelación propia; se distingue de la lluvia.
  const low = dayStart({ ...yes.story, mood: 0, dayDone: yes.story.plan!.day - 1 }, yes.profile, def, { day: yes.story.plan!.day, rainy: false, pick: forced => routineFor(cDef, yes.story.plan!.day, { forced }).id });
  assert.equal(low.story.plan!.status, 'cancelled');
  assert.ok(`${def.npc}_changed_mind` in low.story.flags);
  const noRain = chooseBeat(rainSent.story, rainSent.profile, def, reschedule, 1, now(rainy.story.dayDone));
  assert.deepEqual(noRain.profile, rainy.profile);
  assert.equal(noRain.story.offer, null);

  // Plantón y arreglo; faltar de nuevo deja posible una nueva reparación.
  const missed = attend(yes, def, false);
  const repairDay = missed.story.plan!.day + 1;
  const repair = talk(missed, def, repairDay, 'reconciliar');
  assert.ok(`${def.npc}_conflict` in repair.story.flags);
  assert.ok(`${def.npc}_apologized` in repair.story.flags);
  const healed = attend(roundtrip(repair, def), def);
  assert.ok(`${def.npc}_reconciled` in healed.story.flags);
  assert.ok(!(`${def.npc}_conflict` in healed.story.flags));
  const missedAgain = attend(repair, def, false);
  assert.ok(!(`${def.npc}_apologized` in missedAgain.story.flags));
  assert.equal(beatAfterTalk(missedAgain.story, def, missedAgain.profile, now(missedAgain.story.plan!.day + 1), missedAgain.story.plan!.day + 1)?.id, 'reconciliar');
}

// Sara: ambas portadas cambian el cierre; cada hito espera su día y hay seguimiento al día siguiente.
for (const cover of [0, 1]) {
  const def = STORIES.sara;
  let a = talk(friends(def), def, 2, 'lookbook');
  a = attend(a, def);
  const shootDay = a.story.plan!.day;
  a = talk(roundtrip(a, def), def, shootDay, 'portada', cover);
  assert.notEqual(beatAfterTalk(a.story, def, a.profile, now(shootDay), shootDay)?.id, 'presentacion-invita');
  const invitation = beatAfterTalk(a.story, def, a.profile, now(shootDay + 1), shootDay + 1)!;
  assert.ok(!invitation.say.join(' ').includes('el otro día'), 'la invitación indica una fecha futura concreta');
  a = talk(a, def, shootDay + 1, 'presentacion-invita');
  const presentationDay = a.story.plan!.day;
  a = attend(a, def);
  assert.ok(!a.story.flags.sara_arc_done);
  const closing = phoneStory(a.story, def, a.profile, now(presentationDay + 1), presentationDay + 1)!;
  assert.ok(closing?.story.flags.sara_arc_done);
  assert.ok(closing.text.includes(cover === 0 ? 'mural' : 'bici'));
  assert.notEqual(phoneStory(closing.story, def, closing.profile, now(presentationDay + 1), presentationDay + 1)?.text, closing.text);
}
// Sara: rechazar fotos y presentación también permite cerrar el arco.
{
  const def = STORIES.sara;
  let a = talk(friends(def), def, 2, 'lookbook', 1);
  a = talk(a, def, 4, 'presentacion-sin-fotos', 1);
  a = talk(a, def, 7, 'cierre-sin-ir');
  assert.ok(a.story.flags.sara_arc_done);
}
// Ada: ambas decisiones cambian el resultado, con dos días de espera.
for (const decision of [0, 1]) {
  const def = STORIES.ada;
  let a = talk(friends(def), def, 2, 'temario');
  a = attend(a, def);
  const reviewDay = a.story.plan!.day;
  a = talk(roundtrip(a, def), def, reviewDay, 'examen', decision);
  assert.notEqual(phoneStory(a.story, def, a.profile, now(reviewDay + 1), reviewDay + 1)?.story.flags.ada_arc_done, reviewDay + 1);
  const closing = phoneStory(a.story, def, a.profile, now(reviewDay + 2), reviewDay + 2)!;
  assert.ok(closing?.story.flags.ada_arc_done);
  assert.ok(closing.text.includes(decision === 0 ? 'aprobado' : 'otoño'));
}
// Ada: segunda oportunidad rechazada y resultado sola; la pista sólo se propone si te apuntas.
{
  const def = STORIES.ada;
  let a = talk(friends(def), def, 2, 'temario', 1);
  a = talk(a, def, 5, 'temario-otra', 1);
  a = talk(a, def, 5, 'pista', 1);
  const closed = phoneStory(a.story, def, a.profile, now(9), 9)!;
  assert.ok(closed?.story.flags.ada_arc_done);
  assert.ok(closed.text.includes('Suspendí'));
  for (let day = 9; day < 100; day++) assert.notEqual(beatAfterTalk(closed.story, def, closed.profile, now(day), day)?.plan?.id, 'pista');
  const joined = talk({ ...a, story: { ...a.story, beats: {}, flags: { ada_met: 1, ada_friend: 1, ada_quiz_asked: 1, ada_quiz_done: 1, ada_exam_decided: 1, ada_arc_done: 1 } } }, def, 5, 'pista');
  assert.ok(joined.story.flags.ada_court);
  assert.ok(Array.from({ length: 100 }, (_, i) => beatAfterTalk(joined.story, def, joined.profile, now(i + 5), i + 5)).some(b => b?.plan?.id === 'pista'));
}
console.log('arcos OK: Sara y Ada, rutinas completas, decisiones y cierres, rechazo, lluvia y aplazamiento, plantón y reparación, móvil/persona sin duplicar, guardado y partidas antiguas');
