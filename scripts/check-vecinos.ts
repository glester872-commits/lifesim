// VID-06 · vecindario (systems/Neighborhood) y su guardado: `node scripts/check-vecinos.ts`.
// Control positivo: si deliver aceptara a cualquiera, (d) ve otro estado; si la caducidad no mirara el estado, (e) ve
// dos efectos; si migrate no añadiera neighborhood, (g) carga sin la clave.
import assert from 'node:assert/strict';
import { SAVE_KEY, SAVE_VERSION } from '../src/config/constants.ts';
import { createInitialState, inspectRaw, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import {
  acceptFavor, canDeliverTo, declineFavor, deliverPackage, emptyNeighborhood, FAVOR_COOLDOWN_DAYS, FAVOR_MINUTES, favorFor, favorOfferFor, heldPackage, neighborCandidates, offerFavor, PACKAGE_COOLDOWN_DAYS, parseNeighborhood,
  pickUpPackage, residentsOf, resolveFavor, tickNeighborhood, type NeighborhoodState, type Package,
} from '../src/systems/Neighborhood.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { getHome } from '../src/data/housing.ts';

function memory(): { store: Map<string, string>; save: SaveSystem } {
  const store = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
  return { store, save: new SaveSystem(storage) };
}
const roundTrip = (s: NeighborhoodState): NeighborhoodState => parseNeighborhood(JSON.parse(JSON.stringify(s)));

// a · quién vive dónde
assert.ok(residentsOf('res-olmo-3').includes('ada'), 'Ada no vive en Olmo 3');
const cands = neighborCandidates(getHome('olmo7').door);
assert.ok(cands.includes('ada') && cands.includes('amaia'), `candidatos de Olmo 7: ${cands.join(', ')}`);
const ids = new Set(CHARACTERS.map((c) => c.npc));
assert.ok(cands.every((c) => ids.has(c)), 'candidato que no es personaje');
assert.ok(!neighborCandidates(getHome('olmo7').door, ['ada']).includes('ada'), 'excluded no se respeta');

// b · determinismo, enfriamiento y sólo conocidos
function run(): Package[] {
  let s = emptyNeighborhood();
  const all = new Map<string, Package>();
  for (let d = 1; d <= 60; d++) {
    s = tickNeighborhood(s, d, { candidates: cands, known: (npc) => npc === 'ada' }).state;
    for (const p of s.packages) all.set(p.id, p);
  }
  return [...all.values()].sort((a, b) => a.day - b.day);
}
const r1 = run();
assert.deepEqual(run(), r1, 'dos ejecuciones distintas');
assert.ok(r1.length > 0, 'en 60 días no llega ningún paquete');
for (let i = 1; i < r1.length; i++) assert.ok(r1[i].day - r1[i - 1].day >= PACKAGE_COOLDOWN_DAYS, 'dos paquetes demasiado juntos');
assert.ok(r1.every((p) => p.recipient === 'ada'), 'paquete para un desconocido');
{
  const s = emptyNeighborhood();
  const t = tickNeighborhood(s, 10, { candidates: cands, known: () => true });
  assert.deepEqual(tickNeighborhood(t.state, 10, { candidates: cands, known: () => true }), { state: t.state, effects: [] }, 'repetir el día cambia algo');
}

// c · pending → held → delivered, con ida y vuelta
const pending: NeighborhoodState = { ...emptyNeighborhood(), packages: [{ id: 'pkg-5', recipient: 'ada', day: 5, deadlineDay: 8, status: 'pending' }], lastEventDay: 5, lastTickDay: 5 };
const held = pickUpPackage(pending, 5).state;
assert.equal(heldPackage(held)?.id, 'pkg-5');
assert.deepEqual(pickUpPackage(roundTrip(held), 5).state, roundTrip(held), 'recoger dos veces cambia algo');
const given = deliverPackage(held, 'ada', 6);
assert.equal(given.state.packages[0].status, 'delivered');
assert.equal(given.effects.length, 1);
assert.deepEqual(given.effects[0].delta, { friendship: 2 });
assert.equal(given.effects[0].memory.ref, 'pkg:pkg-5');
assert.equal(deliverPackage(roundTrip(given.state), 'ada', 6).effects.length, 0, 'entregar dos veces da efecto');

// d · a otro NPC: el mismo estado y nada
const wrong = deliverPackage(held, 'amaia', 6);
assert.deepEqual(wrong.state, held);
assert.equal(heldPackage(wrong.state)?.id, 'pkg-5');
assert.equal(wrong.effects.length, 0);

// e · caduca una sola vez
{
  const ctx = { candidates: [], known: () => false };
  const late = tickNeighborhood(held, 9, ctx);
  assert.equal(late.state.packages[0].status, 'lost');
  assert.equal(late.effects.length, 1);
  assert.deepEqual(late.effects[0].delta, { friendship: -1 });
  assert.equal(tickNeighborhood(late.state, 10, ctx).effects.length, 0, 'se pierde dos veces');
  assert.equal(tickNeighborhood(held, 8, ctx).state.packages[0].status, 'held', 'caduca antes del plazo');
}

// f · favor
{
  const offered = offerFavor(emptyNeighborhood(), 'amaia', 12).state;
  assert.equal(offered.favors[0].id, 'fav-12-amaia');
  assert.deepEqual(offerFavor(offered, 'ada', 12).state, offered, 'dos favores vivos');
  const accepted = acceptFavor(offered, 'amaia', 12).state;
  const done = resolveFavor(accepted, 'amaia', 12);
  assert.equal(done.state.favors[0].status, 'done');
  assert.equal(done.minutes, FAVOR_MINUTES);
  assert.equal(done.minutes, 20);
  assert.equal(done.effects.length, 1);
  assert.equal(roundTrip(done.state).favors[0].status, 'done');
  const again = resolveFavor(roundTrip(done.state), 'amaia', 12);
  assert.equal(again.effects.length, 0);
  assert.equal(again.minutes, 0);
  const expired = tickNeighborhood({ ...accepted, lastTickDay: 12 }, 13, { candidates: [], known: () => false });
  assert.equal(expired.state.favors[0].status, 'expired');
  assert.equal(expired.effects.length, 1);
  const ignored = tickNeighborhood({ ...offered, lastTickDay: 12 }, 13, { candidates: [], known: () => false });
  assert.equal(ignored.state.favors[0].status, 'declined');
  assert.equal(ignored.effects.length, 0, 'no contestar no penaliza');
}

// g · migración v10 → v11, reparación, idempotencia y v13 newer (VID-07 subió el esquema a 12)
assert.equal(SAVE_VERSION, 12);
{
  const v10 = { ...createInitialState(), money: 77 };
  const a = memory();
  a.store.set(SAVE_KEY, JSON.stringify({ version: 10, savedAt: 0, state: v10 }));
  const once = a.save.load()!;
  assert.deepEqual(once.neighborhood, emptyNeighborhood());
  assert.equal(once.money, 77);
  assert.ok(a.save.save(once));
  assert.deepEqual(a.save.load(), once, 'migrar y volver a cargar no cambia nada');
  assert.ok(((r) => r.status === 'unreadable' && r.reason === 'newer')(inspectRaw(JSON.stringify({ version: 13, savedAt: 0, state: v10 }))));
}
{
  const two: NeighborhoodState = {
    ...emptyNeighborhood(),
    packages: [
      { id: 'pkg-3', recipient: 'ada', day: 3, deadlineDay: 6, status: 'held' },
      { id: 'pkg-20', recipient: 'amaia', day: 20, deadlineDay: 23, status: 'held' },
    ],
  };
  const a = memory();
  a.store.set(SAVE_KEY, JSON.stringify({ version: 11, savedAt: 0, state: { ...createInitialState(), neighborhood: two } }));
  const once = a.save.load()!;
  assert.equal(once.neighborhood!.packages.filter((p) => p.status === 'held').length, 1);
  assert.equal(heldPackage(once.neighborhood!)?.id, 'pkg-20', 'se queda el más reciente');
  assert.ok(a.save.save(once));
  assert.deepEqual(a.save.load(), once, 'cargar dos veces cambia algo');
}

// h · primer tick tras cargar (lastTickDay 0): sólo el día actual, ningún paquete con fecha atrasada
{
  const first = tickNeighborhood(emptyNeighborhood(), 40, { candidates: cands, known: () => true });
  assert.equal(first.state.lastTickDay, 40);
  assert.ok(first.state.packages.every((p) => p.day === 40), 'el primer tick crea paquetes de días anteriores');
}

// i · «Darle el paquete» sólo al destinatario del que llevas
assert.ok(canDeliverTo(held, 'ada'));
assert.ok(!canDeliverTo(held, 'amaia'), 'se ofrece a otro NPC');
assert.ok(!canDeliverTo(pending, 'ada'), 'se ofrece sin haberlo recogido');
assert.ok(!canDeliverTo(given.state, 'ada'), 'se ofrece ya entregado');
assert.ok(!canDeliverTo(undefined, 'ada'));

// j · cuándo te piden el favor: determinista, sólo a candidatos, sin otro vivo y con enfriamiento
{
  const e = emptyNeighborhood();
  const days = Array.from({ length: 60 }, (_, i) => i + 1);
  const yes = days.filter((d) => favorOfferFor(e, 'amaia', d, cands));
  assert.deepEqual(days.filter((d) => favorOfferFor(e, 'amaia', d, cands)), yes, 'favorOfferFor no es determinista');
  assert.ok(yes.length > 0 && yes.length < days.length, `la tirada no reparte: ${yes.length}/60`);
  const d = yes[0];
  assert.ok(!favorOfferFor(e, 'amaia', d, cands.filter((c) => c !== 'amaia')), 'se ofrece a quien no es candidato');
  const live = offerFavor(e, 'ada', d).state;
  assert.ok(!favorOfferFor(live, 'amaia', d, cands), 'se ofrece con otro favor vivo');
  const late = yes.find((x) => x > FAVOR_COOLDOWN_DAYS) ?? 0;
  assert.ok(late > 0, 'ningún día de oferta tras el enfriamiento');
  assert.ok(!favorOfferFor({ ...e, lastFavorDay: late - 1 }, 'amaia', late, cands), 'se ofrece sin enfriar');
  assert.ok(favorOfferFor({ ...e, lastFavorDay: late - FAVOR_COOLDOWN_DAYS }, 'amaia', late, cands), 'enfriado y no se ofrece');

  const offered = offerFavor(e, 'amaia', d).state;
  assert.equal(favorFor(offered, 'amaia')?.status, 'offered');
  assert.equal(favorFor(offered, 'ada'), undefined);
  const accepted = acceptFavor(offered, 'amaia', d).state;
  const done = resolveFavor(accepted, 'amaia', d);
  assert.equal(done.state.favors[0].status, 'done');
  assert.equal(done.minutes, 20);
  assert.equal(favorFor(done.state, 'amaia'), undefined, 'un favor hecho sigue vivo');
  const twice = resolveFavor(done.state, 'amaia', d);
  assert.equal(twice.effects.length, 0, 'resolver dos veces da efecto');
  assert.equal(twice.minutes, 0);
  const declined = declineFavor(offered, 'amaia', d);
  assert.equal(declined.effects.length, 0, 'decir que no tiene efecto');
  assert.equal(declined.state.favors[0].status, 'declined');
  assert.equal(declined.state.lastFavorDay, d, 'decir que no no fija el día del favor');
  assert.ok(!favorOfferFor(declined.state, 'amaia', d, cands), 'tras decir que no, se vuelve a ofrecer el mismo día');
  assert.equal(resolveFavor(declined.state, 'amaia', d).effects.length, 0, 'se resuelve uno rechazado');
  const reloaded = resolveFavor(roundTrip(done.state), 'amaia', d);
  assert.equal(reloaded.effects.length, 0, 'tras guardar y cargar, resolver cambia la amistad');
  assert.equal(reloaded.minutes, 0);
}

console.log('check-vecinos: ok');
