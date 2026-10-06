// El móvil (systems/Phone.ts, data/phoneLines.ts): `npm run check`. Sin Phaser: el mismo código que usa
// WorldScene, con el reloj de verdad y las rutinas de verdad. Falla si algo no se cumple.
import assert from 'node:assert/strict';
import { createInitialState, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import { placeInfo } from '../src/systems/Places.ts';
import { createSocialProfile, relationshipState, type SocialProfile, type SocialState } from '../src/systems/Social.ts';
import {
  contactsOf, createPhone, markRead, parsePhone, phoneOptions, phoneTick, planFromTalk, PLAN_KINDS, relationLabel, replyDelay,
  sendMessage, statusOf, unreadTotal, type PhoneActionId, type PhoneEnv, type PhoneState,
} from '../src/systems/Phone.ts';

const DAY = 24 * 60;
const abs = (day: number, hhmm: string): number => (day - 1) * DAY + Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const env: PhoneEnv = { status: (npc, at) => statusOf(npc, at) };
const prof = (p: Partial<SocialProfile>): SocialProfile => ({ ...createSocialProfile(), encounters: 3, ...p });
const ACQ = prof({ friendship: 10, trust: 22, contactExchanged: true });
const FRIEND = prof({ friendship: 45, trust: 35, contactExchanged: true });
const ROMANCE = prof({ friendship: 40, trust: 40, attraction: 60, romance: 50, contactExchanged: true });
const PARTNER = prof({ friendship: 60, trust: 60, attraction: 70, romance: 80, datesAccepted: 2, contactExchanged: true });
assert.equal(relationshipState(ACQ), 'ACQUAINTANCE');
assert.equal(relationshipState(FRIEND), 'FRIEND');
assert.equal(relationshipState(ROMANCE), 'ROMANTIC_INTEREST');
assert.equal(relationshipState(PARTNER), 'PARTNER');

/** Manda y deja pasar el tiempo hasta que conteste. */
function exchange(phone: PhoneState, social: SocialState, npc: string, action: PhoneActionId, now: number) {
  const sent = sendMessage(phone, social[npc], npc, action, now, statusOf(npc, now));
  const s2 = { ...social, ...sent.profiles };
  const due = sent.phone.threads[npc].pending!.due;
  // Sin franja nueva: sólo la respuesta, nadie escribe primero.
  const got = phoneTick(sent.phone, s2, due, Number.MAX_SAFE_INTEGER, env);
  return { sent, phone: got.phone, social: { ...s2, ...got.profiles }, news: got.news, reply: got.phone.threads[npc].messages.at(-1)!, due };
}

// --------------------------------------------- los planes van a sitios que existen

for (const [kind, k] of Object.entries(PLAN_KINDS)) assert.ok(placeInfo(k.place), `plan ${kind}: sitio desconocido ${k.place}`);

// --------------------------------------------- A) alguien recién conocido

{
  const social: SocialState = { sara: prof({ encounters: 2 }) };
  const contacts = contactsOf(social, {}, createPhone());
  assert.deepEqual(contacts.map((c) => c.npc), ['sara'], 'la agenda sólo tiene a quien conoces');
  assert.equal(contacts[0].label, 'Conocida');
  assert.equal(contacts[0].canMessage, false, 'conocer a alguien no da su número');
  assert.deepEqual(phoneOptions(createPhone(), 'sara', social.sara, abs(3, '12:00')), [], 'sin número no se le escribe');
  // El registro antiguo (importantNPCsMet) también cuenta como conocerse; un desconocido no sale.
  assert.deepEqual(contactsOf({}, { ada: {} }, createPhone()).map((c) => c.npc), ['ada']);
  assert.equal(relationLabel(prof({ friendship: 70, trust: 60 }), 'ada'), 'Amiga cercana');
  assert.equal(relationLabel(prof({ friendship: 40, trust: 30 }), 'tomas'), 'Amigo');
  // Ni números en la etiqueta.
  assert.ok(!/\d/.test(contacts[0].label));
}

// --------------------------------------------- B) con número: el hilo existe y se guarda

{
  const social: SocialState = { sara: ACQ };
  const now = abs(3, '12:00');
  const opts = phoneOptions(createPhone(), 'sara', ACQ, now).map((o) => o.id);
  assert.ok(opts.includes('greet') && opts.includes('bye'));
  assert.ok(!opts.includes('propose-plan'), 'a un conocido no se le proponen planes');
  const r = exchange(createPhone(), social, 'sara', 'greet', now);
  const pending = r.sent.phone.threads.sara;
  assert.equal(pending.messages.length, 1);
  assert.ok(pending.pending, 'la respuesta queda pendiente');
  assert.deepEqual(phoneOptions(r.sent.phone, 'sara', ACQ, now), [], 'esperando respuesta no se le bombardea');
  // Antes de su hora no contesta.
  assert.equal(phoneTick(r.sent.phone, social, r.due - 1, Number.MAX_SAFE_INTEGER, env).phone.threads.sara.messages.length, 1);
  assert.equal(r.phone.threads.sara.messages.length, 2);
  assert.equal(r.reply.from, 'them');
  assert.equal(r.phone.threads.sara.unread, 1);
  assert.equal(r.news.length, 1, 'una respuesta, una notificación');
  assert.deepEqual(parsePhone(JSON.parse(JSON.stringify(r.phone))), r.phone, 'el hilo sobrevive al guardado');
  assert.equal(unreadTotal(markRead(r.phone, 'sara')), 0, 'abrir el hilo lo deja leído');
}

// --------------------------------------------- C) amistad: planes normales, con respuestas de los dos signos

{
  const outcomes = new Map<string, number>();
  let accepted: PhoneState | undefined;
  for (let i = 0; i < 80; i++) {
    const now = abs(2, '16:00') + i * DAY;
    const opts = phoneOptions(createPhone(), 'ada', FRIEND, now).map((o) => o.id);
    assert.ok(opts.includes('propose-plan') && opts.includes('invite-coffee'), 'a una amiga se le proponen planes');
    assert.ok(!opts.includes('propose-date'), 'sin atracción no hay cita');
    const r = exchange(createPhone(), { ada: FRIEND }, 'ada', 'propose-plan', now);
    const plan = r.phone.plans[0];
    assert.equal(plan.kind, 'gym', 'a Ada (fitness) «un plan» es el gimnasio');
    outcomes.set(plan.status, (outcomes.get(plan.status) ?? 0) + 1);
    if (plan.status === 'accepted') {
      accepted ??= r.phone;
      assert.ok(r.social.ada.memories.some((m) => m.kind === 'PROMISE' && m.note?.includes('por el móvil')), 'el plan queda en su memoria social');
      assert.ok(r.social.ada.friendship > FRIEND.friendship, 'quedar sube la amistad del mismo perfil');
    }
  }
  assert.ok((outcomes.get('accepted') ?? 0) > 0 && (outcomes.get('rejected') ?? 0) > 0, `aceptar y rechazar: ${[...outcomes]}`);
  // Con plan: confirmar o cancelar, y no se propone otro encima.
  const plan = accepted!.plans[0];
  const now = (plan.day - 2) * DAY + 12 * 60;
  const opts = phoneOptions(accepted!, 'ada', FRIEND, now).map((o) => o.id);
  assert.ok(opts.includes('confirm-plan') && opts.includes('cancel-plan') && !opts.includes('propose-plan'));
  // Cancelar el mismo día duele más.
  const early = sendMessage(accepted!, FRIEND, 'ada', 'cancel-plan', now, statusOf('ada', now));
  const late = sendMessage(accepted!, FRIEND, 'ada', 'cancel-plan', (plan.day - 1) * DAY + 12 * 60, statusOf('ada', now));
  assert.equal(early.phone.plans[0].status, 'cancelled');
  assert.ok(late.profiles.ada.trust < early.profiles.ada.trust, 'cancelar el mismo día pesa más');
  // Rechazar no hunde la relación.
  assert.ok(early.profiles.ada.friendship >= FRIEND.friendship - 2);
}

// --------------------------------------------- D) interés romántico: coqueteo y cita, con todo tipo de respuesta

{
  const opts = phoneOptions(createPhone(), 'sara', ROMANCE, abs(2, '19:00')).map((o) => o.id);
  assert.ok(opts.includes('flirt') && opts.includes('propose-date'), `opciones románticas: ${opts}`);
  const seen = new Set<string>();
  for (let i = 0; i < 120 && seen.size < 3; i++) {
    const r = exchange(createPhone(), { sara: ROMANCE }, 'sara', 'flirt', abs(2, '19:00') + i * 37);
    const d = r.social.sara.attraction - ROMANCE.attraction;
    seen.add(d > 0 ? 'positive' : d < 0 ? 'negative' : 'neutral');
  }
  assert.equal(seen.size, 3, `el coqueteo puede salir bien, regular o mal: ${[...seen]}`);
  // Una cita rechazada se recuerda: unos días sin volver a pedirla.
  const rejected = prof({ ...ROMANCE, memories: [{ id: 'x', kind: 'DATE', day: 5, hour: 20, minute: 0, outcome: 'negative' }] });
  assert.ok(!phoneOptions(createPhone(), 'sara', rejected, abs(6, '19:00')).some((o) => o.id === 'propose-date'));
  assert.ok(phoneOptions(createPhone(), 'sara', rejected, abs(10, '19:00')).some((o) => o.id === 'propose-date'));
}

// --------------------------------------------- E) pareja: su tono, sin quitar la charla normal

{
  const opts = phoneOptions(createPhone(), 'sara', PARTNER, abs(2, '19:00')).map((o) => o.id);
  assert.ok(opts.includes('greet') && opts.includes('casual') && opts.includes('flirt'), 'la pareja sigue teniendo charla normal');
  const texts = new Set<string>();
  for (let i = 0; i < 40; i++) texts.add(exchange(createPhone(), { sara: PARTNER }, 'sara', 'greet', abs(2 + i, '19:00')).reply.text);
  assert.ok([...texts].some((t) => t.includes('mi amor') || t.includes('🙂')), `saludo de pareja: ${[...texts]}`);
}

// --------------------------------------------- F) escriben ellos primero, una notificación por mensaje

{
  let phone = createPhone();
  let social: SocialState = { sara: FRIEND, ada: FRIEND };
  let lastSlot = -1;
  let notified = 0;
  for (let t = abs(1, '06:00'); t < abs(29, '06:00'); t += 10) {
    const r = phoneTick(phone, social, t, lastSlot, env);
    lastSlot = Math.floor(t / 30);
    phone = r.phone;
    social = { ...social, ...r.profiles };
    notified += r.news.length;
    // Se lee lo que llega: si no, nadie escribe dos veces seguidas sin respuesta.
    for (const npc of Object.keys(phone.threads)) phone = markRead(phone, npc);
  }
  const from = (npc: string) => phone.threads[npc]?.messages.filter((m) => m.from === 'them') ?? [];
  assert.ok(from('sara').length > 0 && from('ada').length > 0, 'las dos escriben primero alguna vez');
  assert.equal(notified, from('sara').length + from('ada').length, 'cada mensaje avisa una sola vez');
  for (const npc of ['sara', 'ada']) {
    const at = from(npc).map((m) => m.at);
    for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 20 * 60, `${npc} no escribe dos veces en 20 h`);
    for (const a of at) assert.ok(a % DAY >= 9 * 60 && a % DAY < 23 * 60, `${npc} no escribe de madrugada`);
  }
  // I) dos caracteres: Sara (extrovertida) escribe más que Ada (reservada).
  assert.ok(from('sara').length > from('ada').length, `Sara ${from('sara').length} > Ada ${from('ada').length}`);
  // Sin nadie con número, nadie escribe.
  const none = phoneTick(createPhone(), { sara: prof({ friendship: 60, trust: 60 }) }, abs(3, '12:00'), -1, env);
  assert.equal(none.news.length, 0);
}

// --------------------------------------------- recordatorio del plan de hoy, propuestas suyas y planes en persona

{
  const plan = { id: 'p', npc: 'sara', kind: 'cafe' as const, day: 4, at: '18:00', place: 'cafe', status: 'accepted' as const, by: 'player' as const, via: 'phone' as const, created: 0 };
  const phone: PhoneState = { threads: {}, plans: [plan] };
  const r = phoneTick(phone, { sara: FRIEND }, abs(4, '13:00'), -1, { status: () => ({ state: 'free' }) });
  assert.equal(r.news.length, 1, 'el día del plan avisa');
  assert.match(r.news[0].text, /18:00/);
  assert.ok(r.phone.plans[0].reminded);
  // Pasada su hora, el plan se cierra.
  assert.equal(phoneTick(phone, { sara: FRIEND }, abs(4, '20:30'), Number.MAX_SAFE_INTEGER, env).phone.plans[0].status, 'past');
  // Lo aceptado en persona es un plan de la misma lista.
  const talk = planFromTalk(createPhone(), 'ada', { id: 'm', kind: 'INVITATION', day: 3, hour: 10, minute: 0, outcome: 'positive', note: 'aceptó tomar un café' }, abs(3, '10:00'));
  assert.equal(talk.plans[0].kind, 'cafe');
  assert.equal(talk.plans[0].via, 'talk');
  assert.equal(talk.plans[0].status, 'accepted');
  // Una propuesta suya se contesta desde el hilo.
  const proposed: PhoneState = { threads: {}, plans: [{ ...plan, status: 'proposed', by: 'npc' }] };
  const opts = phoneOptions(proposed, 'sara', FRIEND, abs(3, '12:00')).map((o) => o.id);
  assert.deepEqual(opts.slice(0, 2), ['accept-invite', 'decline-invite']);
  const yes = sendMessage(proposed, FRIEND, 'sara', 'accept-invite', abs(3, '12:00'), { state: 'free' });
  assert.equal(yes.phone.plans[0].status, 'accepted');
  assert.ok(yes.profiles.sara.memories.some((m) => m.kind === 'PROMISE'));
}

// --------------------------------------------- G) liada o dormida no contesta como si nada

{
  // Ada, un martes a las 10:00, en la academia.
  const busy = statusOf('ada', abs(2, '10:00'));
  assert.equal(busy.state, 'busy', 'Ada en la academia está liada');
  const r = exchange(createPhone(), { ada: FRIEND }, 'ada', 'howru', abs(2, '10:00'));
  assert.ok(r.due - abs(2, '10:00') >= 40, 'liada tarda en contestar');
  assert.match(r.reply.text, /clase|estudiando/, 'y dice por qué');
  // De madrugada, duerme: contesta por la mañana.
  assert.equal(statusOf('ada', abs(2, '03:00')).state, 'asleep');
  const night = exchange(createPhone(), { ada: FRIEND }, 'ada', 'howru', abs(2, '03:00'));
  assert.ok(night.due >= abs(2, '08:20'), 'dormida, contesta al despertar');
  // I) Ada (reservada) tarda más que Sara (extrovertida) en lo mismo.
  const avg = (npc: string) => [...Array(50).keys()].reduce((s, i) => s + replyDelay(npc, { state: 'free' }, FRIEND, i * 101), 0) / 50;
  assert.ok(avg('ada') > avg('sara'), 'Ada contesta más despacio que Sara');
  const voice = (npc: string) => new Set([...Array(30).keys()].map((i) => exchange(createPhone(), { [npc]: FRIEND }, npc, 'howru', abs(3 + i, '12:00')).reply.text));
  const sara = voice('sara');
  assert.ok(![...voice('ada')].some((t) => sara.has(t)), 'cada una con su voz');
}

// --------------------------------------------- sin farmear

{
  let phone = createPhone();
  let social: SocialState = { sara: FRIEND };
  const gains: number[] = [];
  for (const [i, action] of (['greet', 'howru', 'casual', 'joke', 'greet'] as PhoneActionId[]).entries()) {
    const before = social.sara.friendship + social.sara.trust;
    const r = exchange(phone, social, 'sara', action, abs(5, '12:00') + i * 30);
    phone = r.phone;
    social = r.social;
    gains.push(social.sara.friendship + social.sara.trust - before);
  }
  assert.ok(gains[3] <= 0, `la cuarta charla del día ya no suma: ${gains}`);
  assert.ok(gains[4] <= 0, 'repetir lo mismo no suma');
  assert.match(phone.threads.sara.messages.at(-1)!.text, /dicho|preguntado|repites/i, 'y se nota');
  // Al día siguiente vuelve a contar.
  const fresh = exchange(phone, social, 'sara', 'greet', abs(6, '12:00'));
  assert.equal(fresh.sent.phone.threads.sara.pending!.repeat, 0);
}

// --------------------------------------------- H) guardar y cargar: relación, hilo, sin leer, pendiente y plan

{
  const store = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
  const save = new SaveSystem(storage);
  const plan = { id: 'p', npc: 'ada', kind: 'gym' as const, day: 9, at: '19:00', place: 'gym', status: 'accepted' as const, by: 'npc' as const, via: 'phone' as const, created: 5 };
  const first = exchange({ threads: {}, plans: [plan] }, { ada: FRIEND }, 'ada', 'greet', abs(8, '12:00'));
  const waiting = sendMessage(first.phone, first.social.ada, 'ada', 'howru', abs(8, '12:30'), { state: 'busy' });
  const state = { ...createInitialState(), social: { ada: first.social.ada }, phone: waiting.phone };
  assert.ok(save.save(state));
  const back = save.load()!;
  assert.deepEqual(back.phone, waiting.phone, 'el móvil vuelve igual');
  assert.deepEqual(back.social!.ada, JSON.parse(JSON.stringify(first.social.ada)), 'la relación vuelve igual');
  assert.equal(back.phone!.threads.ada.unread, 1);
  assert.ok(back.phone!.threads.ada.pending, 'la respuesta pendiente sigue pendiente');
  assert.equal(back.phone!.plans[0].status, 'accepted');
  // Y contesta tras cargar, a su hora.
  const after = phoneTick(back.phone!, back.social!, back.phone!.threads.ada.pending!.due, Number.MAX_SAFE_INTEGER, env);
  assert.equal(after.news.length, 1);
}

// --------------------------------------------- J) partidas de antes y móviles rotos

{
  assert.deepEqual(parsePhone(undefined), createPhone());
  assert.deepEqual(parsePhone({ threads: { sara: { messages: [{ from: 'x', text: 1 }], unread: 99, pending: { action: 'nope' } } }, plans: [{ id: 1 }] }), {
    threads: { sara: { messages: [], unread: 0, today: { day: 0, actions: [], gains: 0 } } },
    plans: [],
  });
  const store = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
  const save = new SaveSystem(storage);
  const old: Record<string, unknown> = { ...createInitialState() };
  delete old.phone;
  assert.ok(save.save(old as never));
  assert.deepEqual(save.load()!.phone, createPhone(), 'una partida sin móvil carga con el móvil vacío');
}

console.log('móvil: agenda, hilos, respuestas con su hora, mensajes suyos, planes, sin farmeo y guardado ✓');
