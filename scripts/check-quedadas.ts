// VID-05 F1 · Quedadas en casa (systems/SocialEvents) y su guardado: `node scripts/check-quedadas.ts`.
// Control positivo: si migrate no añadiera socialEvents, (g) falla; si el parse no deduplicara, (b) ve dos eventos;
// si resolve reabriera un cerrado, (e) cambia el outcome.
import assert from 'node:assert/strict';
import { SAVE_KEY, SAVE_VERSION } from '../src/config/constants.ts';
import { createInitialState, inspectRaw, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import {
  addInvitee, cancelEvent, createEvent, decideInvite, emptySocialEvents, eventMemoryId, LATE_MINUTES, parseSocialEvents, resolveEvent,
  type EventFacts, type InviteFacts, type SocialEventsState,
} from '../src/systems/SocialEvents.ts';
import { HOMES, seatsFor } from '../src/data/housing.ts';
import { STORIES } from '../src/data/saraStory.ts';
import { bridgeGathering, cancelGathering, cancelGatheringsAt, homeOffer, inviteHome, playerInGathering, relationOk, tickGatherings } from '../src/systems/HomeGathering.ts';
import { createPhone, phoneOptions } from '../src/systems/Phone.ts';
import { createSocialProfile } from '../src/systems/Social.ts';
import { createStory, planLineFresh, routineOn } from '../src/systems/Story.ts';

function memory(): { store: Map<string, string>; save: SaveSystem } {
  const store = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
  return { store, save: new SaveSystem(storage) };
}

// a · decideInvite: cada causa, su motivo; cambiando ese dato, acepta. Determinista.
const ok: InviteFacts = {
  npc: 'sara', hasContact: true, relationOk: true, mood: 60, busyPlan: false, noDay: false, statusAtStart: 'free', conflict: false, alreadyInvitedThatDay: false,
};
assert.equal(decideInvite(ok).accept, true);
const causes: Partial<InviteFacts>[] = [
  { npc: 'nadie' }, { hasContact: false }, { relationOk: false }, { alreadyInvitedThatDay: true }, { busyPlan: true },
  { noDay: true }, { statusAtStart: 'busy' }, { statusAtStart: 'asleep' }, { conflict: true }, { mood: 10 },
];
const reasons = new Set<string>();
for (const c of causes) {
  const r = decideInvite({ ...ok, ...c });
  assert.equal(r.accept, false, JSON.stringify(c));
  assert.ok(r.reason.length > 0);
  reasons.add(r.reason);
}
assert.equal(reasons.size, causes.length, 'un motivo distinto por causa');
assert.ok(reasons.has('Ya tengo plan ese día') && reasons.has('Ese día no puedo') && reasons.has('Trabajo a esa hora'));
assert.ok(reasons.has('Hoy no me apetece') && reasons.has('Aún no nos conocemos tanto'));
{
  const first = JSON.stringify(decideInvite({ ...ok, mood: 10 }));
  for (let i = 0; i < 100; i++) assert.equal(JSON.stringify(decideInvite({ ...ok, mood: 10 })), first);
}

// c · createEvent idempotente por id
const yes = { accept: true, reason: '¡Hecho! Allí estaré' };
const input = { venueId: 'home', day: 3, startMin: 20 * 60, endMin: 23 * 60, invitees: [{ npc: 'sara', decision: yes }], now: 2 * 1440 + 600 };
const c1 = createEvent(emptySocialEvents(), input);
assert.ok(c1.created);
assert.equal(c1.id, 'evt:home:3:2000');
const c2 = createEvent(c1.state, input);
assert.equal(c2.created, false);
assert.equal(c2.state.events.length, 1);
assert.equal(createEvent(emptySocialEvents(), { ...input, invitees: [{ npc: 'sara', decision: { accept: false, reason: 'x' } }] }).created, false, 'nadie acepta: no hay quedada');
const base = c1.state;
const ev = base.events[0];
assert.equal(ev.start, 2 * 1440 + 1200);
assert.equal(ev.end, 2 * 1440 + 1380);
assert.equal(eventMemoryId(ev, 'sara'), 'evt:home:3:2000:sara');

// b · parse tolera basura y elimina duplicados
for (const junk of [undefined, null, 1, 'x', [], {}, { events: 'no' }, { v: 1, events: [1, null, { id: 'a' }, { ...ev, start: ev.end }, { ...ev, invited: [] }, { ...ev, start: Number.NaN }, { ...ev, status: 'raro' }, { ...ev, invited: [{ ...ev.invited[0], npc: 'marco' }] }, { ...ev, invited: [ev.invited[0], ev.invited[0]] }] }]) {
  assert.deepEqual(parseSocialEvents(junk), emptySocialEvents(), JSON.stringify(junk));
}
assert.deepEqual(parseSocialEvents({ v: 1, events: [ev, { ...ev, outcome: 'bien' }] }), base, 'repetidos: el primero');

// d · resolve: bien, flojo, plantón; dos veces da lo mismo
const facts = (arrivedAt: number | null, plan: 'kept' | 'missed' = 'kept'): Record<string, EventFacts> => ({ [ev.id]: { plans: { sara: plan }, arrivedAt } });
assert.equal(resolveEvent(base, ev.start - 1, facts(null)), base, 'antes de empezar, nada');
const running = resolveEvent(base, ev.start + 5, facts(ev.start));
assert.equal(running.events[0].status, 'running');
const outcomeAt = (arrivedAt: number | null, plan: 'kept' | 'missed' = 'kept'): SocialEventsState => resolveEvent(base, ev.end, facts(arrivedAt, plan));
const good = outcomeAt(ev.start + 5);
assert.equal(good.events[0].status, 'closed');
assert.equal(good.events[0].outcome, 'bien');
assert.equal(outcomeAt(ev.start + LATE_MINUTES + 1).events[0].outcome, 'flojo');
assert.equal(outcomeAt(ev.start + 5, 'missed').events[0].outcome, 'flojo');
assert.equal(outcomeAt(null).events[0].outcome, 'plantón');
assert.deepEqual(resolveEvent(good, ev.end, facts(ev.start + 5)), good, 'dos veces: igual');

// e · closed es terminal
assert.equal(resolveEvent(good, ev.end + 600, facts(null, 'missed')), good);

// f · cancelEvent: cancelled y terminal
const cancelled = cancelEvent(base, ev.id, ev.start - 60);
assert.ok(cancelled.ok);
assert.equal(cancelled.state.events[0].status, 'cancelled');
assert.equal(cancelled.state.events[0].outcome, 'cancelada');
assert.equal(cancelEvent(cancelled.state, ev.id, ev.start).ok, false);
assert.equal(resolveEvent(cancelled.state, ev.end, facts(ev.start)), cancelled.state);
assert.equal(cancelEvent(good, ev.id, ev.end).ok, false, 'un cerrado no se cancela');
// La invitada cancela su plan: sin nadie aceptado, la quedada se cancela.
assert.equal(resolveEvent(base, ev.start - 30, { [ev.id]: { plans: { sara: 'cancelled' }, arrivedAt: null } }).events[0].status, 'cancelled');

// g · migración v9 → v10, ida y vuelta y v13 newer (VID-07 subió el esquema a 12)
assert.equal(SAVE_VERSION, 12);
{
  const v9 = { ...createInitialState(), money: 99 };
  const a = memory();
  a.store.set(SAVE_KEY, JSON.stringify({ version: 9, savedAt: 0, state: v9 }));
  const once = a.save.load()!;
  assert.deepEqual(once.socialEvents, emptySocialEvents());
  assert.equal(once.money, 99);
  assert.ok(a.save.save(once));
  assert.deepEqual(a.save.load(), once, 'migrar y volver a cargar no cambia nada');
  const newer = inspectRaw(JSON.stringify({ version: 13, savedAt: 0, state: v9 }));
  assert.ok(newer.status === 'unreadable' && newer.reason === 'newer');
}
{
  const { save } = memory();
  assert.ok(save.save({ ...createInitialState(), socialEvents: good }));
  assert.deepEqual(save.load()!.socialEvents, good);
}

// ------------------------------------------------ F2 · asientos, puente, cancelar, cerrar (systems/HomeGathering)
// Control positivo: si el puente repitiera asiento, (i) ve dos puntos iguales; si cerrar no mirara memoryEventIds, (k) ve dos recuerdos.
{
  // h · seatsFor: asientos distintos; Ronda 8 (sin segundo punto libre) admite una.
  for (const h of HOMES) {
    const seats = seatsFor(h);
    assert.equal(new Set(seats).size, seats.length, `${h.id}: asiento repetido`);
    assert.ok(!h.mate || !seats.includes(h.mate.seat), `${h.id}: la invitada se sienta en el sitio del compañero`);
  }
  assert.equal(seatsFor(HOMES.find((h) => h.id === 'olmo7')!).length, 2);
  assert.equal(seatsFor(HOMES.find((h) => h.id === 'ronda8')!).length, 1);

  // i · puente: un plan por invitada, cada una en su asiento, con su rutina ese día.
  const both = createEvent(emptySocialEvents(), {
    venueId: 'home', day: 3, startMin: 19 * 60 + 30, endMin: 21 * 60, invitees: [{ npc: 'sara', decision: yes }, { npc: 'ada', decision: yes }], now: 600,
  });
  assert.ok(both.created);
  const gev = both.state.events[0];
  const fresh = { sara: createStory(STORIES.sara), ada: createStory(STORIES.ada) };
  const bridged = bridgeGathering(gev, fresh);
  assert.deepEqual(Object.keys(bridged).sort(), ['ada', 'sara']);
  const points = Object.entries(bridged).map(([npc, s]) => STORIES[npc].plans[s.plan!.id].point);
  assert.equal(new Set(points).size, 2, 'dos invitadas en el mismo asiento');
  for (const [npc, s] of Object.entries(bridged)) {
    assert.equal(s.plan?.status, 'pending');
    assert.equal(routineOn(s, 3), STORIES[npc].plans[s.plan!.id].routine);
  }
  assert.deepEqual(bridgeGathering(gev, bridged), {}, 'el puente no pisa un plan ya quedado');

  // j · cancelar con tiempo: planes cancelados, sin rutina ese día, y aviso en cada hilo.
  const profiles = { sara: { ...createSocialProfile(), trust: 20, friendship: 30 }, ada: { ...createSocialProfile(), trust: 20, friendship: 30 } };
  const off = cancelGathering(both.state, gev.id, bridged, profiles, createPhone(), { day: 1, minute: 600 }, 600)!;
  assert.ok(off);
  assert.equal(off.socialEvents.events[0].status, 'cancelled');
  for (const npc of ['sara', 'ada']) {
    assert.equal(off.stories[npc].plan?.status, 'cancelled');
    assert.equal(routineOn(off.stories[npc], 3), undefined, `${npc}: la rutina sigue fijada`);
    assert.ok((off.phone.threads[npc]?.messages.length ?? 0) > 0, `${npc}: sin aviso`);
  }
  assert.deepEqual(off.notified, ['sara', 'ada']);
  assert.equal(cancelGathering(off.socialEvents, gev.id, off.stories, off.profiles, off.phone, { day: 1, minute: 610 }, 610), null, 'cancela dos veces');

  // k · las dos vienen, el jugador llega tarde: recuerdo agrupado y −1 de confianza, una sola vez.
  const kept = Object.fromEntries(Object.entries(bridged).map(([npc, s]) => [npc, { ...s, plan: { ...s.plan!, status: 'kept' as const } }]));
  const late = gev.start + LATE_MINUTES + 10;
  const run = tickGatherings(both.state, kept, profiles, 'home', late, { day: 3, minute: late % 1440 })!;
  assert.equal(run.socialEvents.events[0].status, 'running');
  assert.equal(run.socialEvents.events[0].playerPresence, 'late');
  assert.ok(run.stories.sara.events.some((e) => e.id === 'quedada-dos') && run.stories.ada.events.some((e) => e.id === 'quedada-dos'));
  assert.ok(run.stories.sara.events.some((e) => e.id === 'quedada-brindis') && !run.stories.ada.events.some((e) => e.id === 'quedada-brindis'), 'sólo una le habla a la otra');
  const stories2 = { ...kept, ...run.stories };
  // Fuera de casa al cerrar: la llegada ya quedó anotada.
  const close = tickGatherings(run.socialEvents, stories2, profiles, 'street', gev.end, { day: 3, minute: gev.end % 1440 })!;
  const closed = close.socialEvents.events[0];
  assert.equal(closed.status, 'closed');
  assert.equal(closed.outcome, 'flojo');
  assert.deepEqual([...closed.memoryEventIds].sort(), [eventMemoryId(closed, 'ada'), eventMemoryId(closed, 'sara')]);
  for (const npc of ['sara', 'ada'] as const) {
    assert.equal(close.profiles[npc].memories.length, profiles[npc].memories.length + 1);
    assert.match(close.profiles[npc].memories.at(-1)!.note ?? '', /la quedada en casa con /);
    assert.equal(close.profiles[npc].trust, profiles[npc].trust - 1);
  }
  const profiles2 = { ...profiles, ...close.profiles };
  assert.equal(tickGatherings(close.socialEvents, stories2, profiles2, 'home', gev.end + 5, { day: 3, minute: 1265 }), null, 'cerrar dos veces cambia algo');

  // l · guardar y cargar con la quedada cerrada: no se reabre.
  const { save } = memory();
  assert.ok(save.save({ ...createInitialState(), socialEvents: close.socialEvents }));
  const loaded = save.load()!.socialEvents!;
  assert.deepEqual(loaded, close.socialEvents);
  assert.equal(tickGatherings(loaded, stories2, profiles2, 'home', gev.end + 60, { day: 3, minute: 1320 }), null, 'cargar reabre la quedada');
}

// ------------------------------------------------ F3 · invitar y anular desde el móvil, mudanza
// Control positivo: si addInvitee no mirara la capacidad, (m) suma una segunda en Ronda 8; si la opción no mirara el
// número, (n) la ofrece; si mudarse no anulara, (p) sigue open.
{
  const olmo = HOMES.find((h) => h.id === 'olmo7')!;
  const ronda = HOMES.find((h) => h.id === 'ronda8')!;
  const one = createEvent(emptySocialEvents(), { venueId: ronda.location, day: 4, startMin: 19 * 60 + 30, endMin: 21 * 60, invitees: [{ npc: 'sara', decision: yes }], now: 600 });
  // m · addInvitee: capacidad, repetida, no abierta.
  assert.equal(addInvitee(one.state, one.id, 'ada', yes, 610, seatsFor(ronda).length).created, false, 'Ronda 8: sólo cabe una');
  const two = addInvitee(one.state, one.id, 'ada', yes, 610, 2);
  assert.ok(two.created);
  assert.equal(two.state.events[0].invited.length, 2);
  assert.equal(addInvitee(two.state, one.id, 'sara', yes, 610, 2).created, false, 'repetida');
  assert.equal(addInvitee(cancelEvent(one.state, one.id, 610).state, one.id, 'ada', yes, 610, 2).created, false, 'cancelada');

  // n · la puerta de la opción: con historia, plan de visita, número y relación; si no, nada.
  const friend = { ...createSocialProfile(), friendship: 40, trust: 25, contactExchanged: true };
  assert.ok(relationOk(friend));
  assert.deepEqual(homeOffer('sara', friend, olmo, undefined), { invite: true, gathering: false });
  assert.equal(homeOffer('sara', { ...friend, contactExchanged: false }, olmo, undefined).invite, false, 'sin número');
  assert.equal(homeOffer('sara', { ...createSocialProfile(), contactExchanged: true }, olmo, undefined).invite, false, 'sin relación');
  assert.equal(homeOffer('nadie', friend, olmo, undefined).invite, false, 'sin historia');
  const ids = (o: ReturnType<typeof homeOffer>): string[] => phoneOptions(createPhone(), 'sara', friend, 2 * 1440 + 600, o).map((x) => x.id);
  assert.ok(ids(homeOffer('sara', friend, olmo, undefined)).includes('invite-home'));
  assert.ok(!ids(homeOffer('sara', { ...friend, contactExchanged: false }, olmo, undefined)).includes('invite-home'));
  assert.deepEqual(phoneOptions(createPhone(), 'sara', { ...friend, contactExchanged: false }, 600, { invite: true }), [], 'sin número, el móvil no deja escribir');
  const inOne = homeOffer('sara', friend, ronda, one.state);
  assert.deepEqual(inOne, { invite: false, gathering: true });
  assert.ok(ids(inOne).includes('cancel-gathering') && !ids(inOne).includes('invite-home'));

  // o · inviteHome: acepta con día y hora y le fija su plan; sin relación, el motivo.
  const story = { sara: createStory(STORIES.sara) };
  const inv = inviteHome({
    npc: 'sara', home: olmo, events: emptySocialEvents(), stories: story, profile: friend, phone: createPhone(),
    now: { day: 1, minute: 600 }, at: 600, status: () => 'free',
  });
  assert.ok(inv.accept, inv.reply);
  assert.match(inv.reply, /a las 19:30 en tu casa/);
  assert.equal(inv.socialEvents.events.length, 1);
  assert.equal(inv.stories.sara.plan?.status, 'pending');
  const nope = inviteHome({
    npc: 'sara', home: olmo, events: emptySocialEvents(), stories: story, profile: { ...friend, friendship: 0, trust: 0 }, phone: createPhone(),
    now: { day: 1, minute: 600 }, at: 600, status: () => 'free',
  });
  assert.equal(nope.accept, false);
  assert.equal(nope.reply, 'Aún no nos conocemos tanto');

  // p · mudarse anula las quedadas abiertas de la casa que dejas, y sólo ésas.
  const profiles = { sara: friend };
  const moved = cancelGatheringsAt(inv.socialEvents, olmo.location, { ...story, ...inv.stories }, profiles, createPhone(), { day: 1, minute: 620 }, 620)!;
  assert.ok(moved);
  assert.equal(moved.socialEvents.events[0].status, 'cancelled');
  assert.deepEqual(moved.notified, ['sara']);
  assert.equal(cancelGatheringsAt(inv.socialEvents, 'otra-casa', story, profiles, createPhone(), { day: 1, minute: 620 }, 620), null);

  // q · Estar en casa en la franja, lejos de ellas, cuenta como estar juntos (WorldScene.watchStoryPlan usa playerInGathering).
  // La escena no se simula aquí: se prueba la regla y lo que pasa cuando, por ella, sus planes quedan 'kept'.
  const g = createEvent(emptySocialEvents(), {
    venueId: olmo.location, day: 3, startMin: 19 * 60 + 30, endMin: 21 * 60, invitees: [{ npc: 'sara', decision: yes }, { npc: 'ada', decision: yes }], now: 600,
  });
  const gq = g.state.events[0];
  const mid = gq.start + 30;
  assert.ok(playerInGathering(g.state, 'sara', olmo.location, mid) && playerInGathering(g.state, 'ada', olmo.location, gq.start));
  assert.equal(playerInGathering(g.state, 'sara', 'street', mid), false, 'fuera de casa');
  assert.equal(playerInGathering(g.state, 'sara', olmo.location, gq.start - 1), false, 'antes de hora');
  assert.equal(playerInGathering(g.state, 'sara', olmo.location, gq.end), false, 'ya acabó');
  assert.equal(playerInGathering(g.state, 'amaia', olmo.location, mid), false, 'no invitada');
  assert.equal(playerInGathering(cancelEvent(g.state, gq.id, 600).state, 'sara', olmo.location, mid), false, 'anulada: no aceptada');
  assert.equal(playerInGathering(undefined, 'sara', olmo.location, mid), false);
  const br = bridgeGathering(gq, { sara: createStory(STORIES.sara), ada: createStory(STORIES.ada) });
  const keptQ = Object.fromEntries(Object.entries(br).map(([npc, s]) => [npc, { ...s, plan: { ...s.plan!, status: 'kept' as const } }]));
  const pq = { sara: { ...friend }, ada: { ...friend } };
  const atHome = tickGatherings(g.state, keptQ, pq, olmo.location, gq.start + 1, { day: 3, minute: (gq.start + 1) % 1440 })!;
  const endQ = tickGatherings(atHome.socialEvents, { ...keptQ, ...atHome.stories }, pq, olmo.location, gq.end, { day: 3, minute: gq.end % 1440 })!;
  const evQ = endQ.socialEvents.events[0];
  assert.notEqual(evQ.outcome, 'plantón');
  assert.equal(evQ.outcome, 'bien');
  assert.ok(evQ.invited.every((i) => i.attendance === 'on-time'));
  for (const npc of ['sara', 'ada'] as const) assert.ok((endQ.profiles[npc]?.trust ?? pq[npc].trust) >= pq[npc].trust, `${npc}: baja la confianza`);

  // r · Fuera de casa toda la franja: plantón, y la regla da false.
  const awayRun = tickGatherings(g.state, keptQ, pq, 'street', gq.start + 1, { day: 3, minute: (gq.start + 1) % 1440 });
  const awayEnd = tickGatherings(awayRun?.socialEvents ?? g.state, keptQ, pq, 'street', gq.end, { day: 3, minute: gq.end % 1440 })!;
  assert.equal(awayEnd.socialEvents.events[0].outcome, 'plantón');
  assert.equal(playerInGathering(g.state, 'sara', 'street', mid), false);

  // s · Riesgos menores de VID-05.
  // En una quedada abierta sólo se ofrece «Anular la quedada»; fuera de ella, el plan de historia se sigue cancelando.
  const opt = (story: { cancel?: boolean; gathering?: boolean }): string[] => phoneOptions(createPhone(), 'sara', friend, 2 * 1440 + 600, story).map((x) => x.id);
  assert.ok(opt({ cancel: true, gathering: true }).includes('cancel-gathering'));
  assert.ok(!opt({ cancel: true, gathering: true }).includes('cancel-plan'), 'opción duplicada en la quedada');
  assert.ok(opt({ cancel: true }).includes('cancel-plan'));
  // La hora del mensaje sale del plan de visita, no de un literal.
  assert.equal(inv.from, STORIES.sara.plans[olmo.visitPlan].from);
  assert.equal(nope.from, STORIES.sara.plans[olmo.visitPlan].from);
  // Una invitada que cancela deja libre su hueco; reinvitarla no la duplica.
  const third = Object.keys(STORIES).find((k) => k !== 'sara' && k !== 'ada')!;
  assert.ok(third, 'hace falta una tercera NPC con historia');
  const cap = Math.min(2, seatsFor(olmo).length);
  const full = createEvent(emptySocialEvents(), {
    venueId: olmo.location, day: 5, startMin: 19 * 60 + 30, endMin: 21 * 60, invitees: [{ npc: 'sara', decision: yes }, { npc: 'ada', decision: yes }], now: 600,
  });
  const fev = full.state.events[0];
  assert.equal(addInvitee(full.state, full.id, third, yes, 610, cap).created, false, 'llena: no cabe');
  const freed = resolveEvent(full.state, fev.start - 30, { [fev.id]: { plans: { ada: 'cancelled' }, arrivedAt: null } });
  assert.equal(freed.events[0].status, 'open');
  assert.equal(freed.events[0].invited.find((i) => i.npc === 'ada')?.status, 'cancelled');
  const acceptedOf = (s: SocialEventsState): number => s.events[0].invited.filter((i) => i.status === 'accepted').length;
  const withThird = addInvitee(freed, full.id, third, yes, 620, cap);
  assert.ok(withThird.created, withThird.reason);
  assert.ok(acceptedOf(withThird.state) <= cap);
  const over = addInvitee(withThird.state, full.id, 'ada', yes, 630, cap);
  assert.equal(over.created, false, 'otra vez llena');
  assert.ok(acceptedOf(over.state) <= cap);
  const back = addInvitee(freed, full.id, 'ada', yes, 620, cap);
  assert.ok(back.created, back.reason);
  const adas = back.state.events[0].invited.filter((i) => i.npc === 'ada');
  assert.equal(adas.length, 1, 'reinvitada: una sola entrada');
  assert.equal(adas[0].status, 'accepted');
  assert.ok(acceptedOf(back.state) <= cap);
  assert.deepEqual(parseSocialEvents(JSON.parse(JSON.stringify(back.state))), back.state, 'reinvitada: sobrevive al parse');
  assert.equal(addInvitee(back.state, full.id, 'ada', yes, 640, cap).created, false, 'aceptada: ya está invitada');
  // El mismo camino por el móvil: con Ada en 'cancelled', inviteHome('ada') acepta y la deja una sola vez en 'accepted'.
  const reinv = inviteHome({
    npc: 'ada', home: olmo, events: freed, stories: { sara: createStory(STORIES.sara), ada: createStory(STORIES.ada) }, profile: friend, phone: createPhone(),
    now: { day: 1, minute: 600 }, at: 600, status: () => 'free',
  });
  assert.ok(reinv.accept, reinv.reply);
  assert.equal(reinv.day, 5);
  const adasR = reinv.socialEvents.events[0].invited.filter((i) => i.npc === 'ada');
  assert.equal(adasR.length, 1, 'inviteHome: una sola entrada');
  assert.equal(adasR[0].status, 'accepted');

  // La frase de «plan cumplido» encolada se descarta si cambió el día, pasó el until o ya no están en el mismo sitio.
  const q = { day: 3, until: '21:00' };
  assert.equal(planLineFresh(q, { day: 3, minute: 20 * 60 }, true), true);
  assert.equal(planLineFresh(q, { day: 3, minute: 21 * 60 }, true), false, 'pasado el until');
  assert.equal(planLineFresh(q, { day: 4, minute: 20 * 60 }, true), false, 'otro día');
  assert.equal(planLineFresh(q, { day: 3, minute: 20 * 60 }, false), false, 'en otro sitio');
}

console.log('check-quedadas: ok');
