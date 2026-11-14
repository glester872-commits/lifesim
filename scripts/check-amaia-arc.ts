// El arco de Amaia (data/amaiaStory.ts) con el mismo motor que usa WorldScene; sin Phaser ni reloj real.
import assert from 'node:assert/strict';
import { AMAIA_STORY } from '../src/data/amaiaStory.ts';
import { STORIES } from '../src/data/saraStory.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { routineFor } from '../src/systems/Characters.ts';
import { createInitialState, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import { createSocialProfile } from '../src/systems/Social.ts';
import {
  applyEffect, beatAfterTalk, chooseBeat, createStory, dayStart, migrateStory, minuteOf, offerBeat, parseStories, phoneStory, presentBeat, watchPlan,
  type Applied,
} from '../src/systems/Story.ts';

const def = AMAIA_STORY;
const char = CHARACTERS.find((c) => c.npc === 'amaia')!;
assert.equal(STORIES.amaia, def, 'Amaia registrada en STORIES');
for (const f of Object.keys(def.flags)) assert.ok(f.startsWith('amaia_'), `flag sin prefijo: ${f}`);

const now = (day: number) => ({ day, minute: 12 * 60 });
const friends = (): Applied => ({
  story: { ...createStory(def), flags: { amaia_met: 1, amaia_friend: 1 } },
  profile: { ...createSocialProfile(), friendship: 45, trust: 35, encounters: 8, contactExchanged: true },
});
function talk(a: Applied, day: number, id: string, choice = 0): Applied {
  const beat = beatAfterTalk(a.story, def, a.profile, now(day), day);
  assert.equal(beat?.id, id, `día ${day}: esperaba ${id}`);
  const story = presentBeat(a.story, beat!, now(day));
  return beat!.choices ? chooseBeat(story, a.profile, def, beat!, choice, now(day)) : applyEffect(story, a.profile, beat!.then!, now(day));
}
function attend(a: Applied, present = true): Applied {
  const p = a.story.plan!;
  const plan = def.plans[p.id];
  const started = dayStart(a.story, a.profile, def, { day: p.day, rainy: false, pick: (forced) => routineFor(char, p.day, { forced }).id });
  assert.equal(started.story.routines[p.day], plan.routine);
  const result = watchPlan(started.story, started.profile, def, { day: p.day, minute: minuteOf(present ? plan.from : plan.until) }, present);
  assert.ok(result);
  assert.equal(result.kept, present);
  return result;
}
function roundtrip(a: Applied): Applied {
  const data = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => data.get(k) ?? null, write: (k, v) => { data.set(k, v); }, remove: (k) => { data.delete(k); } };
  const save = new SaveSystem(storage);
  assert.ok(save.save({ ...createInitialState(), stories: { amaia: a.story }, social: { amaia: a.profile } }));
  const loaded = save.load()!;
  assert.deepEqual(loaded.stories!.amaia, a.story, 'la historia vuelve igual tras cargar');
  assert.deepEqual(loaded.social!.amaia, JSON.parse(JSON.stringify(a.profile)), 'la relación vuelve igual tras cargar');
  return { story: loaded.stories!.amaia, profile: loaded.social!.amaia };
}

// Hito 1: no sale el día de la amistad (día 1), sí al siguiente; por el móvil igual.
const base = friends();
assert.notEqual(beatAfterTalk(base.story, def, base.profile, now(1), 1)?.id, 'desconexion');
assert.notEqual(phoneStory(base.story, def, base.profile, now(1), 1)?.story.offer?.beat, 'desconexion');
assert.equal(beatAfterTalk(base.story, def, base.profile, now(2), 2)?.id, 'desconexion');

// Los dos caminos: 4 hitos en días distintos, cierres con efectos distintos, guardado a mitad, tras decidir y al final.
const ends: Applied[] = [];
for (const choice of [0, 1]) {
  let a = talk(friends(), 2, 'desconexion');
  a = attend(a);
  const walkDay = a.story.plan!.day;
  assert.ok(a.story.flags.amaia_paseo_done);
  assert.notEqual(beatAfterTalk(a.story, def, a.profile, now(walkDay), walkDay)?.id, 'prueba', 'la prueba espera un día');
  a = roundtrip(a);
  a = talk(a, walkDay + 1, 'prueba');
  a = attend(a);
  const testDay = a.story.plan!.day;
  assert.ok(a.story.flags.amaia_prueba_done);
  a = roundtrip(talk(a, testDay, 'entrega', choice));
  assert.ok(a.story.flags[choice === 0 ? 'amaia_entrega_ya' : 'amaia_entrega_prorroga']);
  assert.ok(a.story.flags.amaia_entrega_decided);
  assert.equal(phoneStory(a.story, def, a.profile, now(testDay + 1), testDay + 1)?.story.flags.amaia_arc_done, undefined);
  const closing = phoneStory(a.story, def, a.profile, now(testDay + 2), testDay + 2)!;
  assert.equal(closing.story.beats[choice === 0 ? 'cierre-ya' : 'cierre-prorroga'], testDay + 2);
  assert.equal(new Set([2, walkDay + 1, testDay, testDay + 2]).size, 4, 'cuatro hitos en días distintos');
  ends.push(roundtrip(closing));
}
const [ya, prorroga] = ends;
assert.ok(ya.story.flags.amaia_cliente && !prorroga.story.flags.amaia_cliente);
assert.notDeepEqual(ya.profile, prorroga.profile, 'los cierres dejan relaciones distintas');
assert.notEqual(ya.story.mood, prorroga.story.mood);

// Tras el cierre, 60 días de charlas: ni hitos once ni cierre otra vez, y sólo beats de Amaia (o su invitación).
const ONCE = new Set(def.beats.filter((b) => b.once).map((b) => b.id));
const OWN = new Set(def.beats.map((b) => b.id));
for (const end of ends) {
  let a = end;
  const start = Math.max(a.story.dayDone, ...Object.values(a.story.beats)) + 1;
  for (let day = start; day < start + 60; day++) {
    const b = beatAfterTalk(a.story, def, a.profile, now(day), day);
    if (b) {
      assert.ok(!ONCE.has(b.id), `repite ${b.id}`);
      assert.ok(OWN.has(b.id) || b.id === 'invite' || b.id === 'reschedule', `beat ajeno: ${b.id}`);
      const story = presentBeat(a.story, b, now(day));
      a = b.choices ? chooseBeat(story, a.profile, def, b, 1, now(day)) : applyEffect(story, a.profile, b.then ?? {}, now(day));
    }
    const ph = phoneStory(a.story, def, a.profile, now(day), day);
    if (ph) a = ph;
  }
  assert.equal(a.story.flags.amaia_arc_done, end.story.flags.amaia_arc_done);
  for (const id of ONCE) assert.equal(a.story.beats[id], end.story.beats[id], `${id} no vuelve a salir`);
}

// La misma propuesta por el móvil y en persona: contestar dos veces no duplica nada; caducada, no aplica.
const sent = phoneStory(base.story, def, base.profile, now(2), 2)!;
assert.ok(sent.story.offer?.sent);
const beat = offerBeat(sent.story, def, now(2), 2)!;
assert.deepEqual(beatAfterTalk(sent.story, def, sent.profile, now(2), 2), beat, 'misma propuesta en persona');
const yes = chooseBeat(sent.story, sent.profile, def, beat, 0, now(2));
const again = chooseBeat(yes.story, yes.profile, def, beat, 0, now(2));
assert.deepEqual(again.story, yes.story);
assert.deepEqual(again.profile, yes.profile);
const expired = chooseBeat(sent.story, sent.profile, def, beat, 0, now(7));
assert.deepEqual(expired.story, sent.story, 'una propuesta caducada no aplica efectos');
assert.deepEqual(expired.profile, sent.profile);

// Lluvia: cancela sin tocar la relación ni crear conflicto.
const planDay = yes.story.plan!.day;
const rainy = dayStart(yes.story, yes.profile, def, { day: planDay, rainy: true, pick: (forced) => routineFor(char, planDay, { forced, rainy: true }).id });
assert.equal(rainy.story.plan!.status, 'cancelled');
assert.deepEqual(rainy.profile, yes.profile);
assert.ok(!('amaia_conflict' in rainy.story.flags));

// Plantón → conflicto → arreglo → reparado; si falla el arreglo, se puede volver a intentar.
const missed = attend(yes, false);
assert.ok(missed.story.flags.amaia_conflict);
const repairDay = missed.story.plan!.day + 1;
const repair = talk(missed, repairDay, 'reconciliar');
assert.equal(repair.story.plan?.id, 'paseo-arreglo');
const healed = attend(roundtrip(repair));
assert.ok(healed.story.flags.amaia_reconciled && !('amaia_conflict' in healed.story.flags));
const failed = attend(repair, false);
assert.ok(failed.story.flags.amaia_conflict && !('amaia_apologized' in failed.story.flags));
const retry = talk(failed, failed.story.plan!.day + 1, 'reconciliar');
assert.equal(retry.story.plan?.status, 'pending');
assert.equal(retry.story.plan?.id, 'paseo-arreglo');

// Partida antigua: sin stories.amaia pero con social.amaia de amigas; migra sin repetir presentación ni amistad.
{
  const data = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => data.get(k) ?? null, write: (k, v) => { data.set(k, v); }, remove: (k) => { data.delete(k); } };
  const save = new SaveSystem(storage);
  assert.ok(save.save({ ...createInitialState(), social: { amaia: friends().profile } }));
  const loaded = save.load()!;
  assert.equal(loaded.stories?.amaia, undefined);
  const migrated = migrateStory(createStory(def), def, loaded.social!.amaia, 10);
  assert.equal(migrated.flags.amaia_met, 10);
  assert.equal(migrated.flags.amaia_friend, 10);
  const first = beatAfterTalk(migrated, def, loaded.social!.amaia, now(10), 10)?.id ?? '';
  assert.ok(!['presentacion', 'amistad', 'amistad-con-numero'].includes(first));
}

// Basura en el guardado: no rompe.
for (const junk of [undefined, null, 42, 'x', [], { amaia: 'x' }, { amaia: { flags: [1], mood: 'a', events: 'no', offer: { beat: 3 }, plan: { id: 1 } } }]) {
  const parsed = parseStories(junk);
  if (parsed.amaia) {
    assert.deepEqual(parsed.amaia.flags, {});
    assert.equal(parsed.amaia.offer, null);
    assert.equal(parsed.amaia.plan, null);
  }
}

console.log(`arco de Amaia OK: ${Object.keys(def.flags).length} flags, ${def.beats.length} microeventos, ${Object.keys(def.plans).length} planes; dos cierres, rechazo, lluvia, plantón y reintento, móvil/persona sin duplicar, guardado a mitad, tras decidir y al final, partidas antiguas`);
