// Conseguir el número de alguien (systems/Social: contactState, cooldown, oferta, grantContact; systems/Story:
// Effect.contact): `npm run check`. Sin Phaser. Falla si algo no se cumple.
import assert from 'node:assert/strict';
import { SARA_STORY } from '../src/data/saraStory.ts';
import { hashSeed, seededRng } from '../src/systems/MetroDaily.ts';
import { createInitialState, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import { applyEffect, createStory } from '../src/systems/Story.ts';
import { createPhone, phoneOptions } from '../src/systems/Phone.ts';
import {
  availableSocialActions, contactOfferChance, contactState, CONTACT_OFFER_NOTE, createSocialProfile, grantContact, positiveChanceFor,
  resolveSocialAction, type SocialContext, type SocialProfile,
} from '../src/systems/Social.ts';

const prof = (p: Partial<SocialProfile>): SocialProfile => ({ ...createSocialProfile(), ...p });
const ctx = (day: number, extra: Partial<SocialContext> = {}): SocialContext => ({ day, hour: 12, minute: 0, place: 'street', act: 'walk', mood: 'neutral', temperament: 'tranquilo', ...extra });
const canAsk = (p: SocialProfile, day: number): boolean => availableSocialActions(p, ctx(day)).includes('ask-contact');
const rngOf = (i: number) => seededRng(hashSeed('check-contact', i));
const ask = (p: SocialProfile, i: number) => resolveSocialAction(p, 'ask-contact', ctx(3), rngOf(i));
const moment = { day: 3, hour: 12, minute: 0 };

// 1) Recién conocida: ni se puede pedir ni escribir.
{
  const met = prof({ encounters: 1 });
  assert.equal(contactState(met, 3), 'MET');
  assert.equal(contactState(createSocialProfile(), 3), 'UNKNOWN');
  assert.ok(!canAsk(met, 3), 'a quien acabas de conocer no se le pide el número');
  assert.deepEqual(phoneOptions(createPhone(), 'sara', met, 3 * 1440), [], 'sin número no hay mensajes');
  const known = prof({ encounters: 3, friendship: 10, trust: 12 });
  assert.equal(contactState(known, 3), 'KNOWN');
  assert.ok(!canAsk(known, 3), 'sin confianza todavía no');
}

// 2) Amistad con confianza: casi siempre dice que sí, y el número abre el móvil.
const FRIEND = prof({ encounters: 6, friendship: 45, trust: 35 });
const LOW = prof({ encounters: 2, friendship: 8, trust: 20 });
const rate = (p: SocialProfile): Record<string, number> => {
  const out: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
  for (let i = 0; i < 400; i++) out[ask(p, i).outcome]++;
  return out;
};
const first = (p: SocialProfile, outcome: string) => [...Array(400).keys()].map((i) => ask(p, i)).find((x) => x.outcome === outcome)!;
{
  assert.equal(contactState(FRIEND, 3), 'REQUEST_AVAILABLE');
  assert.ok(canAsk(FRIEND, 3));
  const r = rate(FRIEND);
  assert.ok(r.positive > 280, `una amiga casi siempre da su número: ${JSON.stringify(r)}`);
  const yes = first(FRIEND, 'positive');
  assert.ok(yes.profile.contactExchanged);
  assert.equal(yes.memory?.kind, 'CONTACT_REQUEST');
  assert.equal(contactState(yes.profile, 3), 'EXCHANGED');
  assert.ok(!canAsk(yes.profile, 3), 'con número ya no se pide');
  assert.ok(phoneOptions(createPhone(), 'sara', yes.profile, 2 * 1440 + 600).length > 0, '7) con número, el móvil deja escribir');
}

// 3) Conocido con poca confianza: más «no» y «aún no», y cada uno pesa.
{
  const r = rate(LOW);
  assert.ok(r.positive < rate(FRIEND).positive - 80, `con poca confianza cuesta más: ${JSON.stringify(r)}`);
  assert.ok(r.neutral > 0 && r.negative > 0, `puede decir que aún no o que no: ${JSON.stringify(r)}`);
  const no = first(LOW, 'negative');
  assert.ok(!no.profile.contactExchanged);
  assert.ok(no.profile.trust < LOW.trust, 'un «no» tiene coste');
  assert.ok(no.profile.friendship >= LOW.friendship - 1, 'pero no rompe la relación');
  assert.equal(contactState(no.profile, 3), 'REJECTED');

  // 5) Cooldown: tras un «no», tres días; tras un «aún no», uno.
  const ok = { ...no.profile, trust: 30 };
  assert.ok(!canAsk(ok, 3) && !canAsk(ok, 5), 'tras un no, nada de insistir enseguida');
  assert.ok(canAsk(ok, 6), 'a los tres días se puede volver a pedir');
  const later = first(LOW, 'neutral');
  assert.equal(contactState(later.profile, 3), 'NOT_YET');
  assert.ok(!canAsk({ ...later.profile, trust: 30 }, 3), 'tras un aún no, el mismo día no');
  assert.ok(canAsk({ ...later.profile, trust: 30 }, 4), 'al día siguiente sí');
  // Insistir lo pone más difícil.
  const pushed = { ...ok, memories: [...ok.memories, { ...no.memory!, id: 'x2' }] };
  assert.ok(positiveChanceFor(pushed, 'ask-contact', ctx(6)) < positiveChanceFor({ ...LOW, trust: 30 }, 'ask-contact', ctx(6)), 'cada intento fallido resta');
}

// 4) Lo ofrece ella: con amistad o atracción, no a cualquiera, más si hoy habéis quedado y según su carácter.
{
  assert.equal(contactOfferChance(prof({ encounters: 1 }), 'extrovertido', 3), 0, 'a quien acaba de conocer no se lo ofrece');
  assert.equal(contactOfferChance({ ...FRIEND, contactExchanged: true }, 'extrovertido', 3), 0);
  const base = contactOfferChance(FRIEND, 'tranquilo', 3);
  assert.ok(base > 0);
  assert.ok(contactOfferChance(FRIEND, 'extrovertido', 3) > contactOfferChance(FRIEND, 'reservado', 3), 'Sara lo ofrece antes que Ada');
  const planned = { ...FRIEND, memories: [{ id: 'i', kind: 'INVITATION' as const, day: 3, hour: 11, minute: 0, outcome: 'positive' as const }] };
  assert.ok(contactOfferChance(planned, 'tranquilo', 3) > base, 'tras quedar en algo, más');
  assert.ok(contactOfferChance(prof({ encounters: 5, friendship: 30, trust: 30, attraction: 50 }), 'tranquilo', 3) > 0, 'con atracción también');
  assert.equal(contactOfferChance(first(LOW, 'negative').profile, 'extrovertido', 3), 0, 'quien te acaba de decir que no, no te lo ofrece');
  // Ofrecido y aceptado: una vez, con su recuerdo, y no se repite.
  const got = grantContact(FRIEND, moment, `${CONTACT_OFFER_NOTE} tras una charla`);
  assert.ok(got.contactExchanged);
  assert.equal(got.memories.filter((m) => m.kind === 'CONTACT_REQUEST').length, 1);
  assert.equal(grantContact(got, moment, 'otra vez'), got, 'sin recuerdos repetidos');
  // Ofrecido y rechazado por ti: no cuenta como que te dijo que no, y no lo vuelve a ofrecer en días.
  const declined = { ...FRIEND, memories: [{ id: 'o', kind: 'CONTACT_REQUEST' as const, day: 3, hour: 12, minute: 0, outcome: 'neutral' as const, note: `${CONTACT_OFFER_NOTE} y le dijiste que ahora no` }] };
  assert.equal(contactState(declined, 3), 'REQUEST_AVAILABLE');
  assert.ok(canAsk(declined, 3), 'puedes pedírselo tú cuando quieras');
  assert.equal(contactOfferChance(declined, 'extrovertido', 4), 0, 'no insiste en ofrecerlo');
  assert.ok(contactOfferChance(declined, 'extrovertido', 8) > 0);
}

// Historia: el microevento de amistad de Sara os da los números, una sola vez.
{
  const amistad = SARA_STORY.beats.find((b) => b.id === 'amistad')!;
  assert.ok(amistad.then?.contact, 'la amistad de Sara da su número');
  const once = applyEffect(createStory({ baseMood: 64 }), FRIEND, amistad.then!, { day: 3, minute: 600 });
  assert.ok(once.profile.contactExchanged);
  const twice = applyEffect(once.story, once.profile, amistad.then!, { day: 4, minute: 600 });
  assert.equal(twice.profile.memories.length, once.profile.memories.length, 'sin recuerdo repetido');
  // Ningún otro microevento da números.
  assert.equal(SARA_STORY.beats.filter((b) => b.then?.contact || b.choices?.some((c) => c.then.contact)).length, 1);
}

// 6) Guardar y cargar conserva el número.
{
  const store = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
  const save = new SaveSystem(storage);
  const got = grantContact(FRIEND, moment, `${CONTACT_OFFER_NOTE} tras una charla`);
  assert.ok(save.save({ ...createInitialState(), social: { sara: got } }));
  const back = save.load()!;
  assert.equal(back.social!.sara.contactExchanged, true);
  assert.equal(contactState(back.social!.sara, 9), 'EXCHANGED');
  assert.ok(phoneOptions(createPhone(), 'sara', back.social!.sara, 8 * 1440 + 600).length > 0);
}

console.log('contacto: recién conocida sin número, amiga que lo da, conocido que no, oferta suya, cooldown, historia, guardado y móvil ✓');
