// VID-10 · reparto urbano a pie (systems/Delivery) y su guardado: `node scripts/check-reparto.ts`.
// Control positivo: si el plazo empezara al aceptar, (f) ve otro deadline; si deliver no exigiera 'carrying', (b) entrega
// sin recoger; si parse no rehiciera el plazo desde pickedAt, (f) ve el plazo estirado tras recargar.
// GameState (Phaser) no carga en node: su guarda de cobro único (applyDelivery, `last.runId`) se prueba en el navegador;
// aquí, que el sistema no devuelve un segundo resultado y que la reputación deduplica por `delivery:<runId>`.
// Turno (M–P): si deliver resolviera cada tramo, (M) ve un result en el tramo 1; si el pago no fuera el del turno, (M) ve
// L3.pay; si parse no validara `leg`, (O) conserva leg 5; si deliveryHint ignorara el turno, (P) no ve «2/3» ni la dirección.
import assert from 'node:assert/strict';
import { SAVE_KEY, SAVE_VERSION } from '../src/config/constants.ts';
import { createInitialState, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import { DELIVERIES, getDelivery, SHIFTS, type DeliveryDef } from '../src/data/deliveries.ts';
import { LOCATIONS } from '../src/data/locations.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { apply, reasonLabel, zoneOf } from '../src/systems/Reputation.ts';
import {
  accept, acceptShift, cancel, clockOf, closedForToday, counterTask, deliver, deliveryHint, emptyDelivery, endOpen, expire, parseDelivery, payout, pickUp,
  type DeliveryState, type Here,
} from '../src/systems/Delivery.ts';

const WALK = 0.41; // config/agenda.ts WALK_PER_TILE
const H11 = 11 * 60; // día 1, 11:00: los tres locales abiertos cualquier día (también domingo)
const at = (d: DeliveryDef, end: 'from' | 'to', abs: number): Here => ({ location: d[end].location, catalog: d[end].catalog, abs });
const rt = (s: DeliveryState): DeliveryState => parseDelivery(JSON.parse(JSON.stringify(s)));
const ok = <T extends { ok: boolean }>(o: T): T & { ok: true } => {
  assert.ok(o.ok, `esperaba ok: ${JSON.stringify(o)}`);
  return o as T & { ok: true };
};

// A · datos
// Entrega 2 añade los dos tramos que faltaban al turno (ultramarinos → panadería, panadería → café).
assert.equal(DELIVERIES.length, 4);
assert.equal(new Set(DELIVERIES.map((d) => d.id)).size, 4);
const doorOf = (loc: string): { street: string; x: number } => {
  const hit = LOCATIONS.flatMap((l) => (l.buildings ?? []).map((b) => ({ l: l.id, b }))).find((x) => x.b.enter?.location === loc);
  assert.ok(hit, `${loc} sin puerta`);
  return { street: hit.l, x: hit.b.doorX };
};
const inside = (loc: string, catalog: string): number => {
  const l = getLocation(loc);
  const t = l.terminals?.find((x) => x.catalog === catalog);
  assert.ok(t, `${loc} sin terminal ${catalog}`);
  const exit = l.portals.find((p) => p.id === 'exit');
  assert.ok(exit, `${loc} sin salida`);
  return Math.abs(t.tx - exit.tx) + Math.abs(t.ty - exit.ty);
};
const legs: number[] = [];
for (const d of DELIVERIES) {
  const a = doorOf(d.from.location);
  const b = doorOf(d.to.location);
  assert.equal(a.street, b.street, `${d.id}: origen y destino en calles distintas`);
  const zone = zoneOf(d.to.location);
  assert.ok(zone && zone === zoneOf(d.from.location) && zone === zoneOf(d.board), `${d.id}: barrios distintos`);
  assert.ok(getLocation(d.board).props.some((p) => p.kind === 'notice-board'), `${d.id}: ${d.board} sin tablón`);
  const tiles = inside(d.from.location, d.from.catalog) + Math.abs(a.x - b.x) + 2 + inside(d.to.location, d.to.catalog);
  legs.push(tiles);
  assert.ok(d.deadlineMin >= 1.3 * tiles * WALK, `${d.id}: plazo ${d.deadlineMin} < 1,3 × ${(tiles * WALK).toFixed(1)}`);
  assert.ok(d.pay > 0 && d.lateMin > 0 && d.lateFloorPct > 0 && d.lateFloorPct < 90);
}
assert.notEqual(legs[0], legs[1], 'los dos recorridos miden lo mismo');
const [CAFE, PAN] = DELIVERIES;

// B · transiciones y rechazos
{
  let s = emptyDelivery();
  assert.ok(!accept(s, 'nope', H11).ok, 'acepta un encargo desconocido');
  s = ok(accept(s, CAFE.id, H11)).state;
  assert.equal(s.active?.runId, `${CAFE.id}:1:${H11}`);
  const again = accept(s, PAN.id, H11);
  assert.ok(!again.ok && again.state === s, 'acepta un segundo encargo o cambia el estado');
  assert.ok(!deliver(s, at(CAFE, 'to', H11)).ok, 'entrega sin recoger');
  assert.ok(!pickUp(s, at(CAFE, 'to', H11)).ok, 'recoge en el destino');
  assert.ok(!pickUp(s, { ...at(CAFE, 'from', H11), catalog: 'otro' }).ok, 'recoge en otro mostrador');
  assert.ok(!pickUp(s, at(CAFE, 'from', 22 * 60 + 30)).ok, 'recoge con el café cerrado');
  assert.equal(counterTask(s, CAFE.from.location, CAFE.from.catalog)?.action, 'pickUp');
  assert.equal(counterTask(s, CAFE.to.location, CAFE.to.catalog), undefined);
  s = ok(pickUp(s, at(CAFE, 'from', H11))).state;
  assert.equal(s.active?.status, 'carrying');
  assert.ok(!pickUp(s, at(CAFE, 'from', H11)).ok, 'recoge dos veces');
  assert.ok(!deliver(s, at(CAFE, 'from', H11 + 5)).ok, 'entrega en el origen');
  assert.ok(!deliver(s, at(CAFE, 'to', 21 * 60 + 30)).ok, 'entrega con el destino cerrado');
  assert.equal(counterTask(s, CAFE.to.location, CAFE.to.catalog)?.action, 'deliver');
  // Origen cerrado por hoy: la panadería cierra a las 14.
  assert.ok(closedForToday(PAN.from, 15 * 60) && !closedForToday(PAN.from, H11) && !endOpen(PAN.from, 15 * 60));
  // Por la tarde ya no se ofrece: rechazado, con motivo y el mismo estado. De madrugada (abre más tarde hoy) y por la mañana, sí.
  const e0 = emptyDelivery();
  const tarde = accept(e0, PAN.id, 15 * 60);
  assert.ok(!tarde.ok && tarde.state === e0 && tarde.reason.startsWith('Hoy ya no da tiempo'), `tarde: ${JSON.stringify(tarde)}`);
  assert.ok(accept(e0, PAN.id, 5 * 60).ok, 'de madrugada, antes de abrir, se rechaza');
  assert.ok(accept(e0, PAN.id, 9 * 60 + 30).ok, 'por la mañana se rechaza');
  assert.ok(!accept(e0, CAFE.id, 22 * 60).ok, 'con el café cerrado por la noche se acepta');
}

// C · pago
{
  const dl = 1000;
  assert.deepEqual(payout(PAN, dl, dl), { status: 'delivered', pct: 100, pay: PAN.pay, lateBy: 0 });
  assert.equal(payout(PAN, dl, dl - 3).pct, 100);
  let prev = 100;
  for (let m = 1; m <= PAN.lateMin; m++) {
    const p = payout(PAN, dl, dl + m);
    assert.equal(p.status, 'late');
    assert.ok(p.pct <= 90 && p.pct >= PAN.lateFloorPct && p.pct < prev, `pct ${p.pct} en +${m}`);
    assert.ok(p.pay <= PAN.pay * 0.9 + 1e-9 && p.pay > 0);
    prev = p.pct;
  }
  assert.equal(payout(PAN, dl, dl + PAN.lateMin).pct, PAN.lateFloorPct);
  assert.deepEqual(payout(PAN, dl, dl + PAN.lateMin + 1), { status: 'expired', pct: 0, pay: 0, lateBy: PAN.lateMin + 1 });
}

// D · idempotencia: resuelto, una segunda entrega no da resultado (ni pago ni reputación)
{
  let s = ok(pickUp(ok(accept(emptyDelivery(), CAFE.id, H11)).state, at(CAFE, 'from', H11))).state;
  const done = ok(deliver(s, at(CAFE, 'to', H11 + 10)));
  assert.equal(done.result?.status, 'delivered');
  assert.equal(done.result?.pay, CAFE.pay);
  assert.equal(done.state.active, undefined);
  assert.equal(done.state.last?.runId, done.result?.runId);
  s = done.state;
  const twice = deliver(s, at(CAFE, 'to', H11 + 11));
  assert.ok(!twice.ok && twice.state === s, 'segunda entrega');
  assert.ok(!expire(s, H11 + 999).ok, 'vence lo ya entregado');
}

// E · save/parse: ida y vuelta en cada fase, basura y una v12 sin la clave
{
  const s0 = emptyDelivery();
  const s1 = ok(accept(s0, PAN.id, H11)).state;
  const s2 = ok(pickUp(s1, at(PAN, 'from', H11))).state;
  const s3 = ok(deliver(s2, at(PAN, 'to', H11 + 20))).state;
  for (const s of [s0, s1, s2, s3]) assert.deepEqual(rt(s), s, 'ida y vuelta');
  for (const junk of [null, 3, 'x', [], { active: 7 }, { active: { runId: 'a', defId: 'nope', status: 'accepted', acceptedAt: 1 } }, { active: { ...s2.active, status: 'carrying', pickedAt: -1 } }, { last: { ...s3.last, pct: 400 } }]) {
    const p = parseDelivery(junk);
    assert.equal(p.v, 1);
    assert.equal(p.active, undefined, `basura con active: ${JSON.stringify(junk)}`);
    assert.equal(p.last, undefined, `basura con last: ${JSON.stringify(junk)}`);
  }
  assert.equal(SAVE_VERSION, 12);
  const store = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
  const save = new SaveSystem(storage);
  store.set(SAVE_KEY, JSON.stringify({ version: 12, savedAt: 0, state: createInitialState() }));
  const plain = save.load();
  assert.ok(plain, 'una v12 sin delivery no carga');
  assert.equal(plain.delivery, undefined);
  store.set(SAVE_KEY, JSON.stringify({ version: 12, savedAt: 0, state: { ...createInitialState(), delivery: s2 } }));
  assert.deepEqual(save.load()?.delivery, s2, 'el encargo en curso no vuelve igual');
}

// F · reloj: el plazo empieza al recoger y recargar no lo reinicia
{
  const s1 = ok(accept(emptyDelivery(), CAFE.id, H11)).state;
  const s2 = ok(pickUp(s1, at(CAFE, 'from', H11 + 30))).state;
  assert.equal(s2.active?.deadline, H11 + 30 + CAFE.deadlineMin);
  const tampered = rt({ ...s2, active: { ...s2.active!, deadline: 999999 } });
  assert.equal(tampered.active?.deadline, H11 + 30 + CAFE.deadlineMin, 'recargar cambia el plazo');
  const dl = s2.active!.deadline!;
  assert.ok(!expire(rt(s2), dl + CAFE.lateMin).ok, 'vence antes de tiempo');
  const gone = ok(expire(rt(s2), dl + CAFE.lateMin + 1));
  assert.equal(gone.result?.status, 'expired');
  assert.equal(gone.result?.pay, 0);
  assert.equal(gone.state.active, undefined);
  assert.ok(!expire(s1, H11 + 9999).ok, 'vence un encargo sin recoger');
}

// G · reputación con etiqueta, una vez
{
  const s = ok(pickUp(ok(accept(emptyDelivery(), CAFE.id, H11)).state, at(CAFE, 'from', H11)));
  const r = ok(deliver(s.state, at(CAFE, 'to', H11 + 5))).result!;
  assert.equal(r.rep, 1);
  assert.equal(reasonLabel({ id: `delivery:${r.runId}`, delta: 1 }), 'Reparto a tiempo');
  assert.equal(reasonLabel({ id: 'delivery:x', delta: -1 }), 'Reparto sin entregar');
  const zone = zoneOf(CAFE.to.location);
  const once = apply({}, zone, r.rep, `delivery:${r.runId}`, 1);
  assert.equal(once[zone!]?.value, 1);
  assert.equal(apply(once, zone, r.rep, `delivery:${r.runId}`, 1), once, 'la reputación se aplica dos veces');
  const late = ok(deliver(s.state, at(CAFE, 'to', H11 + CAFE.deadlineMin + 3))).result!;
  assert.equal(late.status, 'late');
  assert.equal(late.rep, 0);
}

// H · cancelación en cada estado
{
  assert.ok(!cancel(emptyDelivery(), H11).ok, 'cancela sin encargo');
  const s1 = ok(accept(emptyDelivery(), PAN.id, H11)).state;
  const c1 = ok(cancel(s1, H11 + 1)).result!;
  assert.deepEqual([c1.status, c1.pay, c1.rep], ['cancelled', 0, 0]);
  const s2 = ok(pickUp(s1, at(PAN, 'from', H11))).state;
  const c2 = ok(cancel(s2, H11 + 5));
  assert.deepEqual([c2.result!.status, c2.result!.pay, c2.result!.rep], ['cancelled', 0, -1]);
  assert.equal(c2.state.active, undefined, 'el paquete se queda contigo tras cancelar');
  // Recién cancelado el mismo minuto, no se repite el runId (cobro y reputación son por runId).
  assert.ok(!accept(ok(cancel(s1, H11)).state, PAN.id, H11).ok);
  assert.ok(accept(c2.state, PAN.id, H11 + 6).ok);
  assert.ok(getDelivery(PAN.id));
}

// M · turno de 3 tramos: un runId, tramos 1 y 2 sin resultado ni pago, el 3.º da un único resultado con el pago del turno
const SHIFT = SHIFTS[0];
const [L1, L2, L3] = SHIFT.legs.map((id) => getDelivery(id)!);
const shiftAt = (abs: number): DeliveryState => ok(acceptShift(emptyDelivery(), SHIFT.id, abs)).state;
{
  assert.equal(SHIFT.legs.length, 3);
  assert.ok(L1 && L2 && L3, 'tramo desconocido');
  for (const [a, b] of [[L1, L2], [L2, L3]] as const) assert.deepEqual([b.from.location, b.from.catalog], [a.to.location, a.to.catalog], 'los tramos no encadenan');
  const s0 = shiftAt(H11);
  assert.deepEqual([s0.active?.runId, s0.active?.defId, s0.active?.leg, s0.active?.shift, s0.active?.status], [`${SHIFT.id}:1:${H11}`, L1.id, 0, SHIFT.id, 'accepted']);
  assert.ok(!acceptShift(s0, SHIFT.id, H11).ok, 'acepta un turno con encargo activo');
  assert.ok(!acceptShift(emptyDelivery(), 'nope', H11).ok, 'acepta un turno desconocido');
  const s1 = ok(pickUp(s0, at(L1, 'from', H11))).state;
  const d1 = ok(deliver(s1, at(L1, 'to', H11 + 10)));
  assert.equal(d1.result, undefined, 'el tramo 1 da resultado');
  assert.equal(d1.state.last, undefined);
  assert.deepEqual([d1.state.active?.runId, d1.state.active?.leg, d1.state.active?.defId, d1.state.active?.status, d1.state.active?.deadline],
    [s0.active?.runId, 1, L2.id, 'carrying', H11 + 10 + L2.deadlineMin], 'el tramo 2 no sale recogido del mismo mostrador');
  assert.equal(counterTask(d1.state, L2.to.location, L2.to.catalog)?.action, 'deliver');
  const d2 = ok(deliver(d1.state, at(L2, 'to', H11 + 30)));
  assert.equal(d2.result, undefined, 'el tramo 2 da resultado');
  assert.deepEqual([d2.state.active?.leg, d2.state.active?.defId], [2, L3.id]);
  const d3 = ok(deliver(d2.state, at(L3, 'to', H11 + 50)));
  assert.deepEqual([d3.result?.status, d3.result?.pay, d3.result?.runId, d3.result?.rep], ['delivered', SHIFT.pay, s0.active?.runId, 1]);
  assert.equal(d3.state.active, undefined);
  // applyDelivery (GameState, navegador) no cobra si last.runId === result.runId: aquí queda archivado y no hay segunda entrega.
  assert.equal(d3.state.last?.runId, d3.result?.runId);
  assert.ok(!deliver(d3.state, at(L3, 'to', H11 + 51)).ok, 'segunda entrega del turno');
  const once = apply({}, zoneOf(L3.to.location), 1, `delivery:${d3.result!.runId}`, 1);
  assert.equal(apply(once, zoneOf(L3.to.location), 1, `delivery:${d3.result!.runId}`, 1), once, 'el turno puntúa dos veces');
  // El último, tarde: pago fijo del turno × el porcentaje de payout de ese tramo.
  const dl = d2.state.active!.deadline!;
  const late = ok(deliver(d2.state, at(L3, 'to', dl + 5))).result!;
  assert.equal(late.status, 'late');
  assert.equal(late.pay, Math.round(SHIFT.pay * payout(L3, dl, dl + 5).pct) / 100);
}

// N · expire y cancel a mitad de turno: sin pago y −1
{
  const mid = ok(deliver(ok(pickUp(shiftAt(H11), at(L1, 'from', H11))).state, at(L1, 'to', H11 + 10))).state;
  const dl = mid.active!.deadline!;
  assert.ok(!expire(mid, dl + L2.lateMin).ok, 'vence antes de tiempo');
  const gone = ok(expire(mid, dl + L2.lateMin + 1)).result!;
  assert.deepEqual([gone.status, gone.pay, gone.rep, gone.runId], ['expired', 0, -1, mid.active!.runId]);
  const c = ok(cancel(mid, H11 + 12)).result!;
  assert.deepEqual([c.status, c.pay, c.rep], ['cancelled', 0, -1]);
  const c0 = ok(cancel(shiftAt(H11), H11 + 1)).result!;
  assert.deepEqual([c0.status, c0.pay, c0.rep], ['cancelled', 0, 0], 'sin recoger, gratis');
  // Pasado lateMin a mitad de turno, deliver también resuelve vencido (no avanza).
  const lateMid = ok(deliver(mid, at(L2, 'to', dl + L2.lateMin + 1)));
  assert.deepEqual([lateMid.result?.status, lateMid.result?.pay], ['expired', 0]);
}

// O · parseDelivery con turno, sin él (guardado viejo) y con campos fuera de rango
{
  const mid = ok(deliver(ok(pickUp(shiftAt(H11), at(L1, 'from', H11))).state, at(L1, 'to', H11 + 10))).state;
  assert.deepEqual(rt(mid), mid, 'turno: ida y vuelta');
  assert.deepEqual(rt(shiftAt(H11)), shiftAt(H11));
  const old = rt(ok(accept(emptyDelivery(), CAFE.id, H11)).state);
  assert.ok(old.active && !('shift' in old.active) && !('leg' in old.active), 'un guardado viejo gana shift/leg');
  for (const bad of [{ leg: 5 }, { leg: -1 }, { leg: 1.5 }, { shift: 'nope' }, { leg: 0 }]) {
    const p = parseDelivery({ active: { ...mid.active, ...bad } });
    assert.ok(p.active, `se pierde el encargo con ${JSON.stringify(bad)}`);
    assert.ok(!('shift' in p.active!) && !('leg' in p.active!), `conserva el turno con ${JSON.stringify(bad)}`);
    assert.equal(p.active!.defId, L2.id);
  }
}

// P · deliveryHint con turno: «Entrega n/3», el local y su dirección
{
  const s0 = shiftAt(H11);
  assert.equal(deliveryHint(s0), `Entrega 1/3: recoge en ${L1.from.label}, ${L1.from.address}`);
  const mid = ok(deliver(ok(pickUp(s0, at(L1, 'from', H11))).state, at(L1, 'to', H11 + 10))).state;
  const hint = deliveryHint(mid) ?? '';
  assert.ok(L2.to.address, 'el destino no tiene dirección');
  assert.ok(hint.includes('2/3') && hint.includes(L2.to.label) && hint.includes(L2.to.address!) && hint.includes(clockOf(mid.active!.deadline!)), hint);
  assert.equal(deliveryHint(ok(accept(emptyDelivery(), CAFE.id, H11)).state), `recoge en ${CAFE.from.label}`, 'el suelto cambia');
}

console.log('check-reparto: ok');
