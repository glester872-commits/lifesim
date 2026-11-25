// BIKE-01 F1 · la bici del jugador (systems/Cycling): física, fases y estado guardable. `node scripts/check-bici.ts`.
// Control positivo: si step no recortara dt, (B) ve 160 px/s en vez de 8 tras un frame de 1 s; si mount aceptara bicis 'npc:',
// (E) monta la ajena; si parseBikes no filtrara ids, (H) devuelve dos bicis con el mismo id; si facingFrame devolviera el
// perfil para 'up'/'down' (como antes de BIKE-01, sólo flipX), (J) falla en «fuera del perfil». Si la de empresa se
// montara sin turno, (K) no ve «El turno ha terminado»; si se devolviera lejos del bikePoint, (K) la ve devuelta a 3 tiles.
// Si isOwner aceptara cualquier 'public…', (L) recupera 'public2'; si rentPublicBike no mirara la que ya hay, (M) ve una
// segunda; si bikeShareCharge no mirara el ledger, (O) cobra dos veces el mismo alquiler.
import assert from 'node:assert/strict';
import { SHIFTS } from '../src/data/deliveries.ts';
import {
  acceptShift, bikePointSpot, cancel, collectCompanyBikes, COMPANY_BIKE_ID, companyBikeBlocker, emptyDelivery, lendForShift, returnsCompanyBike,
} from '../src/systems/Delivery.ts';
import { facingFrame, RIDER_BACK, RIDER_FRONT, RIDER_STOPPED, RIDER_VERTICAL_FRAMES, RIDER_VERTICAL_PEDALS } from '../src/world/RiderFrames.ts';
import { PLAYER_SPEED, TILE } from '../src/config/constants.ts';
import { CYCLING, KMH_PER_PXS } from '../src/config/cycling.ts';
import {
  canRideThrough, dismount, ensurePlayerBike, lendCompanyBike, mount, moveBike, onFoot, parseBikes, playerBike,
  returnCompanyBike, step, tick, publicBike, rentPublicBike, returnPublicBike, rentBlocker, bikeShareCharge, bikeShareMovementId, nextPublicBikeId,
  type BikeState, type BikesState, type RideState, type Spot,
} from '../src/systems/Cycling.ts';

const MAX = CYCLING.MAX_SPEED;
const near = (a: number, b: number, tol: number, msg: string): void => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const SPOT: Spot = { location: 'street', x: 100, y: 200, facing: 'right' };
const bike = (over: Partial<BikeState> = {}): BikeState =>
  ({ id: 'b1', owner: 'player', ...SPOT, status: 'parked', frame: 'city', color: 0x3f6f78, ...over });
const rideAt = (speed: number, heading = { x: 1, y: 0 }): RideState =>
  ({ phase: 'CYCLING', bikeId: 'b1', speed, heading, since: 0, travelled: 0 });
const GO = { x: 1, y: 0, brake: false };
const IDLE = { x: 0, y: 0, brake: false };
const ROAD = { energy: 100, onRoad: true };
/** Simula `ms` a `fps` con la misma entrada; integra la posición con vx/vy como el motor. */
const run = (r: RideState, ms: number, fps: number, input = GO, ctx = ROAD) => {
  const dt = 1000 / fps;
  let dist = 0;
  let cost = 0;
  for (let i = Math.round((ms * fps) / 1000); i > 0; i--) {
    const s = step(r, input, dt, ctx);
    r = s.ride;
    dist += Math.hypot(s.vx, s.vy) * (dt / 1000);
    cost += s.energyCost;
  }
  return { ride: r, dist, cost };
};
/** ms hasta parar desde `v0` con la entrada (o la emergencia ya puesta en `r`). */
const stopTime = (r: RideState, input = IDLE): number => {
  let t = 0;
  while (r.speed > 0 && t < 60_000) { r = step(r, input, 1000 / 60, ROAD).ride; t += 1000 / 60; }
  return t;
};

// A · config
assert.equal(CYCLING.MAX_SPEED, 2.5 * PLAYER_SPEED);
for (const [k, v] of Object.entries(CYCLING)) assert.ok(Number.isFinite(v) && v > 0, `CYCLING.${k} = ${v}`);

// B · independencia de los FPS
{
  const ref = run(rideAt(0), 2000, 144);
  for (const fps of [30, 60]) {
    const r = run(rideAt(0), 2000, fps);
    near(r.dist, ref.dist, ref.dist * 0.02, `distancia a ${fps} FPS`);
    near(r.ride.speed, ref.ride.speed, ref.ride.speed * 0.02, `velocidad a ${fps} FPS`);
  }
  const long = step(rideAt(0), GO, 1000, ROAD);
  near(long.ride.speed, CYCLING.ACCEL * CYCLING.MAX_DT_MS / 1000, 1e-9, 'dt recortado a MAX_DT_MS');
  near(long.ride.travelled, long.ride.speed * CYCLING.MAX_DT_MS / 1000, 1e-9, 'distancia con dt recortado');
}

// C · velocidad
{
  let r = rideAt(0);
  let t = 0;
  while (r.speed < MAX && t < 10_000) { r = step(r, GO, 1000 / 60, ROAD).ride; t += 1000 / 60; }
  near(t / 1000, MAX / CYCLING.ACCEL, 1 / 60 + 1e-9, 'tiempo hasta MAX');
  const drag = stopTime(rideAt(MAX));
  const brake = stopTime(rideAt(MAX), { x: 0, y: 0, brake: true });
  const fast = dismount(rideAt(MAX), bike(), SPOT, 0);
  assert.equal(fast.ok, false);
  const emergency = stopTime(fast.ride);
  assert.ok(brake < drag && emergency < brake, `parada: emergencia ${emergency} < freno ${brake} < drag ${drag}`);
  for (const fps of [30, 144]) {
    const s = run(rideAt(0), 5000, fps).ride.speed;
    assert.ok(s >= 0 && s <= MAX, `speed en [0, MAX]: ${s}`);
  }
  const off = { energy: 100, onRoad: false };
  const o = run(rideAt(0), 5000, 60, GO, off).ride.speed;
  near(o, MAX * CYCLING.PEDESTRIAN_FACTOR, 1e-9, 'fuera de la calzada');
  // Por encima del máximo de la acera, baja hacia él con BRAKE, no de golpe.
  const down = step(rideAt(MAX), GO, 16, off).ride.speed;
  near(down, MAX - CYCLING.BRAKE * 0.016, 1e-9, 'baja con BRAKE al salir de la calzada');
  assert.ok(down > MAX * CYCLING.PEDESTRIAN_FACTOR);
}

// D · giro
{
  const dt = 16;
  const at = (input: { x: number; y: number }) => step(rideAt(MAX), { ...input, brake: false }, dt, ROAD).ride.speed;
  const acc = (CYCLING.ACCEL * dt) / 1000;
  near(at({ x: 0, y: 1 }), MAX * CYCLING.TURN_KEEP_90 + acc, 1e-9, 'giro de 90°');
  near(at({ x: -1, y: 0 }), MAX * CYCLING.TURN_KEEP_180 + acc, 1e-9, 'giro de 180°');
  assert.equal(at({ x: 1, y: 0 }), MAX, 'recto no pierde');
  const diag = run(rideAt(0, { x: 0.6, y: 0.8 }), 5000, 60, { x: 1, y: 1, brake: false });
  const s = step(diag.ride, { x: 1, y: 1, brake: false }, dt, ROAD);
  assert.ok(Math.hypot(s.vx, s.vy) <= MAX + 1e-9, 'diagonal no supera MAX');
  near(Math.abs(s.vx), Math.abs(s.vy), 1e-9, 'diagonal normalizada');
}

// E · transiciones
{
  const b = bike();
  const m = mount(onFoot(), b, 1000);
  assert.ok(m.ok);
  assert.equal(m.ride.phase, 'MOUNTING');
  assert.equal(m.bike.status, 'ridden');
  assert.equal(step(m.ride, GO, 16, ROAD).vx, 0, 'MOUNTING no se mueve');
  assert.equal(tick(m.ride, 1000 + CYCLING.MOUNT_MS - 1), m.ride);
  const c = tick(m.ride, 1000 + CYCLING.MOUNT_MS);
  assert.equal(c.phase, 'CYCLING');
  const slow = step(c, GO, 16, ROAD).ride;
  assert.ok(slow.speed <= CYCLING.DISMOUNT_MAX);
  const at: Spot = { location: 'plaza', x: 7, y: 9, facing: 'up' };
  const d = dismount(slow, m.bike, at, 2000);
  assert.ok(d.ok);
  assert.equal(d.ride.phase, 'DISMOUNTING');
  assert.deepEqual(d.bike, { ...b, ...at, status: 'parked' }, 'al bajar, aparcada en `at`');
  assert.equal(tick(d.ride, 2000 + CYCLING.DISMOUNT_MS).phase, 'ON_FOOT');

  // Inválidas: el mismo estado de vuelta.
  const twice = mount(m.ride, b, 1100);
  assert.ok(!twice.ok);
  assert.equal(twice.ride, m.ride);
  assert.equal(twice.bike, b);
  const inMount = dismount(m.ride, m.bike, at, 1100);
  assert.ok(!inMount.ok);
  assert.equal(inMount.ride, m.ride);
  assert.equal(inMount.bike, m.bike);
  const npc = bike({ owner: 'npc:luna' });
  const n = mount(onFoot(), npc, 0);
  assert.ok(!n.ok && /no es tuya/.test(n.reason));
  assert.equal(n.bike, npc);
  const taken = bike({ status: 'ridden' });
  const t = mount(onFoot(), taken, 0);
  assert.ok(!t.ok);
  assert.equal(t.bike, taken);
  assert.ok(mount(onFoot(), bike({ owner: 'company' }), 0).ok, 'la de empresa prestada se monta');
  const fastRide = rideAt(MAX);
  const f = dismount(fastRide, m.bike, at, 0);
  assert.ok(!f.ok);
  assert.equal(f.reason, 'Frena antes de bajarte');
  assert.equal(f.bike, m.bike, 'no se baja');
  assert.equal(f.ride.speed, MAX);
  assert.equal(f.ride.phase, 'BRAKING');
  assert.equal(f.ride.emergency, true);
  const e = step(f.ride, GO, 16, ROAD).ride;
  near(e.speed, MAX - CYCLING.EMERGENCY_BRAKE * 0.016, 1e-9, 'emergencia ignora el pedal');
}

// F · energía
{
  const pv = MAX * CYCLING.PEDESTRIAN_FACTOR; // constante en la acera: < 0,8 × MAX
  const lo = run(rideAt(pv), 1000, 60, GO, { energy: 100, onRoad: false });
  near(lo.cost, (lo.dist / TILE) * CYCLING.ENERGY_PER_TILE, 1e-9, 'coste por casilla');
  near(lo.cost, (pv / TILE) * 0.02, 1e-6, 'coste de 1 s a velocidad de acera');
  const hi = run(rideAt(MAX), 1000, 60);
  near(hi.cost, (hi.dist / TILE) * CYCLING.ENERGY_PER_TILE * CYCLING.HIGH_SPEED_ENERGY_MULT, 1e-9, 'coste a velocidad alta');
  const tired = run(rideAt(0), 5000, 60, GO, { energy: CYCLING.LOW_ENERGY_AT - 1, onRoad: true }).ride.speed;
  near(tired, MAX * CYCLING.LOW_ENERGY_FACTOR, 1e-9, 'poca energía reduce el máximo');
  const none = run(rideAt(0), 1000, 60, GO, { energy: CYCLING.MIN_ENERGY - 0.5, onRoad: true }).ride.speed;
  assert.equal(none, 0, 'sin energía no acelera');
}

// G · préstamo, devolución y bici propia
{
  const empty: BikesState = { v: 1, list: [] };
  const lent = lendCompanyBike(empty, 'co-1', SPOT, 'rental', 0xe6e2d8);
  assert.equal(lent.list.length, 1);
  assert.equal(lent.list[0].owner, 'company');
  assert.equal(lendCompanyBike(lent, 'co-1', SPOT, 'rental', 0xe6e2d8), lent, 'no duplica');
  const ridden = { v: 1 as const, list: [{ ...lent.list[0], status: 'ridden' as const }] };
  assert.equal(returnCompanyBike(ridden, 'co-1'), ridden, 'no se devuelve montada');
  const back = returnCompanyBike(lent, 'co-1');
  assert.equal(back.list.length, 0);
  assert.equal(lendCompanyBike(back, 'co-1', SPOT, 'rental', 0).list.length, 1, 'se vuelve a prestar');
  assert.equal(ensurePlayerBike(empty, false, SPOT), empty);
  const own = ensurePlayerBike(ensurePlayerBike(empty, true, SPOT), true, SPOT);
  assert.equal(own.list.length, 1);
  assert.equal(playerBike(own)?.status, 'parked');
  const moved = moveBike(own, 'player-bike', 'plaza', 3, 4);
  assert.deepEqual([playerBike(moved)?.location, playerBike(moved)?.x, playerBike(moved)?.y], ['plaza', 3, 4]);
  assert.equal(moveBike(own, 'nope', 'plaza', 0, 0), own);
}

// H · parseBikes
{
  const s: BikesState = { v: 1, list: [bike(), bike({ id: 'co', owner: 'company', frame: 'rental' }), bike({ id: 'n', owner: 'npc:ada' })] };
  assert.deepEqual(parseBikes(JSON.parse(JSON.stringify(s))), s, 'ida y vuelta');
  for (const junk of [null, 3, 'x', [], {}, { v: 2, list: [] }, { v: 1, list: 'x' }]) assert.deepEqual(parseBikes(junk), { v: 1, list: [] });
  const dirty = parseBikes({
    v: 1,
    list: [bike(), bike({ x: 999 }), bike({ id: 'r', status: 'ridden', x: 5 }), { ...bike({ id: 'o' }), owner: 'thief' },
      { ...bike({ id: 's' }), status: 'flying' }, bike({ id: 'ret', status: 'returned' }), { ...bike({ id: 'f' }), frame: 'tank' },
      { ...bike({ id: 'h' }), facing: 'toString' }, { ...bike({ id: 'nan' }), x: NaN }, { ...bike({ id: 'np' }), owner: 'npc:' }, 7, null],
  });
  assert.deepEqual(dirty.list.map((b) => b.id), ['b1', 'r'], 'descarta duplicados y basura');
  assert.equal(dirty.list[0].x, 100, 'gana el primero');
  assert.deepEqual([dirty.list[1].status, dirty.list[1].x], ['parked', 5], 'ridden vuelve aparcada en su sitio');
}

// I · canRideThrough
assert.equal(canRideThrough('exterior', 'exterior', false), true);
assert.equal(canRideThrough('exterior', 'exterior', true), false);
assert.equal(canRideThrough('exterior', 'interior', false), false);
assert.equal(canRideThrough('interior', 'exterior', false), false);

// J · facingFrame (world/RiderFrames, sin lienzo): frente y espalda en filas propias, tres de pedalada y uno parado
{
  const profile = new Set([0, 1, 2, 3, RIDER_STOPPED]);
  assert.equal(RIDER_STOPPED, 4);
  for (const side of ['left', 'right'] as const) {
    for (let p = 0; p < 8; p++) assert.ok(profile.has(facingFrame(side, p, false)), `${side} ${p} en 0-4`);
    assert.equal(facingFrame(side, 2, false), 2, `${side} pedalea el perfil de siempre`);
    assert.equal(facingFrame(side, 2, true), RIDER_STOPPED, `${side} parado`);
  }
  const rows: number[][] = [];
  for (const [facing, first] of [['down', RIDER_FRONT], ['up', RIDER_BACK]] as const) {
    const row = [0, 1, 2].map((p) => facingFrame(facing, p, false));
    assert.equal(new Set(row).size, 3, `${facing}: pedal 0..2 distintos`);
    const stop = facingFrame(facing, 1, true);
    assert.equal(stop, first + RIDER_VERTICAL_PEDALS, `${facing}: parado`);
    assert.ok(!row.includes(stop), `${facing}: parado no es de pedalada`);
    assert.equal(facingFrame(facing, 3, false), row[0], `${facing}: vuelve a empezar a los 3 pasos`);
    for (const f of [...row, stop]) {
      assert.ok(!profile.has(f), `${facing} ${f} fuera del perfil`);
      assert.ok(f >= first && f < first + RIDER_VERTICAL_FRAMES, `${facing} ${f} en su fila`);
    }
    rows.push([...row, stop]);
  }
  assert.ok(!rows[0].some((f) => rows[1].includes(f)), 'frente y espalda no comparten fotogramas');
}

// K · bici de empresa del turno (systems/Delivery): prestada al aceptar, no montable al terminar, devuelta en el bikePoint
{
  const shift = SHIFTS[0];
  const spot = bikePointSpot(shift);
  assert.ok(spot && spot.location === shift.board, 'el bikePoint no está en los points del tablón');
  const accepted = acceptShift(emptyDelivery(), shift.id, 11 * 60);
  assert.ok(accepted.ok, `acepta el turno: ${JSON.stringify(accepted)}`);
  const on = accepted.state;
  const empty: BikesState = { v: 1, list: [] };
  const lent = lendForShift(empty, shift, shift.board);
  const co = lent.list.find((b) => b.id === COMPANY_BIKE_ID);
  assert.ok(co, 'no se presta al aceptar');
  assert.deepEqual([co.owner, co.location, co.x, co.y, co.status], ['company', spot.location, spot.x, spot.y, 'parked']);
  const own = ensurePlayerBike(empty, true, spot);
  assert.equal(lendForShift(own, shift, shift.board), own, 'se presta teniendo aquí la tuya');
  assert.equal(lendForShift(lent, shift, shift.board).list.length, 1, 'dos de empresa');
  assert.equal(companyBikeBlocker(co, on), null, 'con turno no se monta');
  assert.ok(mount(onFoot(), co, 0).ok);
  const done = cancel(on, 11 * 60 + 1).state;
  assert.equal(done.active, undefined);
  assert.match(companyBikeBlocker(co, done) ?? '', /^El turno ha terminado: devuelve la bici en /, 'se monta tras terminar el turno');
  assert.equal(companyBikeBlocker(bike(), done), null, 'bloquea la propia');
  // Bajado a ≤1 tile del bikePoint y sin turno: se devuelve y desaparece de la lista; lejos o con turno, no.
  const near1 = { ...co, x: co.x + TILE };
  assert.equal(returnsCompanyBike(near1, done), true, 'no se devuelve junto al bikePoint');
  assert.equal(returnsCompanyBike(near1, on), false, 'se devuelve con el turno en marcha');
  assert.equal(returnsCompanyBike({ ...co, x: co.x + 3 * TILE }, done), false, 'se devuelve lejos');
  assert.equal(returnsCompanyBike({ ...near1, status: 'ridden' }, done), false, 'se devuelve montada');
  assert.equal(returnCompanyBike(lent, COMPANY_BIKE_ID).list.length, 0, 'returnCompanyBike no la quita');
  // Al terminar el turno el servicio recoge la aparcada (no queda huérfana); la que vas montando, no.
  assert.equal(collectCompanyBikes(lent, on), lent);
  assert.equal(collectCompanyBikes(lent, done).list.length, 0);
  const riddenCo: BikesState = { v: 1, list: [{ ...co, status: 'ridden' }] };
  assert.equal(collectCompanyBikes(riddenCo, done), riddenCo);
}

// L · parseBikes con la de alquiler
{
  const plain: BikesState = { v: 1, list: [bike(), bike({ id: 'co', owner: 'company', frame: 'rental' })] };
  assert.deepEqual(parseBikes(JSON.parse(JSON.stringify(plain))), plain, 'guardado sin públicas queda igual');
  const pub = parseBikes({ v: 1, list: [bike({ id: 'p', owner: 'public', frame: 'rental' }), { ...bike({ id: 'p2' }), owner: 'public2' }] });
  assert.deepEqual(pub.list.map((b) => [b.id, b.owner]), [['p', 'public']], "acepta 'public' y descarta 'public2'");
}

// M · alquilar y devolver
{
  const base: BikesState = { v: 1, list: [bike()] };
  const one = rentPublicBike(base, 'pub-1', SPOT);
  assert.equal(publicBike(one)?.id, 'pub-1', 'alquila una');
  assert.equal(one.list.length, 2, 'la propia sigue');
  assert.equal(rentPublicBike(one, 'pub-2', SPOT), one, 'no alquila una segunda');
  assert.deepEqual(returnPublicBike(one, 'pub-1'), base, 'devuelta, desaparece');
  assert.equal(returnPublicBike(one, 'b1'), one, 'la propia no se devuelve como pública');
  const ridden: BikesState = { v: 1, list: one.list.map((b) => (b.id === 'pub-1' ? { ...b, status: 'ridden' } : b)) };
  assert.equal(returnPublicBike(ridden, 'pub-1'), ridden, 'no quita una montada');
}

// N · rentBlocker
{
  const none: BikesState = { v: 1, list: [] };
  const rented = rentPublicBike(none, 'pub-1', SPOT);
  assert.match(rentBlocker(none, 0.5, 2, false, false) ?? '', /^Te falta/, 'sin dinero');
  assert.match(rentBlocker(none, 5, 2, true, false) ?? '', /^Estás de turno/, 'de turno');
  assert.equal(rentBlocker(none, 5, 2, false, true), 'Ya vas en bici.', 'montado');
  assert.match(rentBlocker(rented, 5, 2, false, false) ?? '', /^Ya tienes una bici alquilada/, 'con pública');
  assert.equal(rentBlocker(none, 5, 2, false, false), null, 'con 5 € y nada');
}

// O · bikeShareCharge: el cobro no se repite
{
  const id = bikeShareMovementId('pub-1');
  assert.equal(bikeShareCharge([], 'pub-1'), id, 'ledger vacío da el id');
  assert.equal(bikeShareCharge([{ movementId: 'otro' }, { movementId: id }], 'pub-1'), null, 'ya cobrado da null');
}

// O2 · alquilar, devolver y volver a alquilar en el mismo minuto: dos cobros de 1 € con ids distintos
{
  const ledger: { movementId: string; amount: number }[] = [];
  let bikes: BikesState = { v: 1, list: [] };
  const rent = (): string => {
    const bikeId = nextPublicBikeId(ledger, 600);
    const mid = bikeShareCharge(ledger, bikeId);
    assert.ok(mid, `${bikeId} no está cobrado`);
    assert.equal(rentBlocker(bikes, 5, 1, false, false), null, 'se puede alquilar');
    bikes = rentPublicBike(bikes, bikeId, SPOT);
    assert.equal(publicBike(bikes)?.id, bikeId, 'alquilada');
    ledger.push({ movementId: mid, amount: -1 });
    return bikeId;
  };
  const a = rent();
  assert.match(rentBlocker(bikes, 5, 1, false, false) ?? '', /^Ya tienes/, 'doble E: no se alquila otra');
  bikes = returnPublicBike(bikes, a);
  const b = rent();
  assert.notEqual(a, b, 'ids de bici distintos');
  assert.equal(new Set(ledger.map((m) => m.movementId)).size, 2, 'dos movementId distintos');
  assert.equal(ledger.reduce((s, m) => s + m.amount, 0), -2, 'cobra dos veces 1 €');
}

// P · km/h del HUD
near(CYCLING.MAX_SPEED * KMH_PER_PXS, 20, 1e-9, 'a tope son 20 km/h');

console.log('check-bici: OK');
