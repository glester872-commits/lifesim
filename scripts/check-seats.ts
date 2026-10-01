// Asientos con un solo dueño (systems/SeatRegistry.ts, usado por Crowd y StreetLife): `npm run check`.
// Falla si dos personajes usan el mismo asiento, si una reserva queda huérfana o si un asiento no vuelve
// a estar libre al levantarse, cancelar, perder el camino o irse.
import assert from 'node:assert/strict';
import { POPULATION_PROFILES } from '../src/data/population.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { placeInfo } from '../src/systems/Places.ts';
import { Crowd, profileFor, type Agent, type Clock } from '../src/systems/Crowd.ts';
import { StreetLife, streetProfileFor } from '../src/systems/StreetLife.ts';
import { SeatRegistry } from '../src/systems/SeatRegistry.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';

const STEP_MS = 100;
const MS_PER_MIN = 500;
const at = (day: number, hhmm: string): Clock => ({ day, hour: Number(hhmm.slice(0, 2)), minute: Number(hhmm.slice(3)) });
const addMinutes = (c: Clock, m: number): Clock => {
  const total = c.hour * 60 + c.minute + m;
  return { day: c.day + Math.floor(total / 1440), hour: Math.floor((total % 1440) / 60), minute: total % 60 };
};

// ------------------------------------------------ el registro, solo
{
  const r = new SeatRegistry();
  assert.equal(r.state('s'), 'available');
  assert.ok(r.reserve('s', 1));
  assert.equal(r.state('s'), 'reserved');
  assert.equal(r.ownerOf('s'), 1);
  assert.ok(!r.reserve('s', 2), 'otro reserva una silla reservada');
  assert.ok(r.reserve('s', 1), 'el dueño no puede repetir su reserva');
  assert.ok(!r.occupy('s', 2), 'otro ocupa una silla reservada');
  assert.ok(!r.release('s', 2), 'otro suelta una silla ajena');
  assert.equal(r.ownerOf('s'), 1);
  assert.ok(r.occupy('s', 1));
  assert.equal(r.state('s'), 'occupied');
  assert.ok(!r.reserve('s', 2), 'otro reserva una silla ocupada');
  assert.ok(r.release('s', 1));
  assert.equal(r.state('s'), 'available');
  assert.equal(r.ownerOf('s'), undefined, 'queda una referencia al dueño');
  assert.ok(r.reserve('s', 2), 'la silla no vuelve a estar libre');

  // Muchos a la vez: cada uno mira qué sillas ve libres y va a por la primera; cada silla acaba con un solo dueño.
  const chairs = ['a', 'b', 'c', 'd', 'e'];
  const seen = chairs.filter((c) => !r.has(c));
  const won = new Map<string, number[]>();
  for (let who = 1; who <= 60; who++) {
    for (const c of seen) if (r.reserve(c, who)) won.set(c, [...(won.get(c) ?? []), who]);
  }
  for (const c of chairs) assert.equal(won.get(c)?.length, 1, `la silla ${c} tiene ${won.get(c)?.length} dueños`);

  // Huérfanas: dueño inexistente, dueño que va a otra parte, reserva eterna; el que está sentado de verdad se queda.
  const o = new SeatRegistry();
  o.reserve('gone', 10);
  o.reserve('moved', 11);
  o.reserve('slow', 12);
  o.occupy('sitting', 13);
  o.tick(200_000);
  const freed = o.sweep((owner, seat, state, age) => owner !== 10 && seat !== 'moved' && !(state === 'reserved' && age > 100_000));
  assert.deepEqual(freed.map((f) => f.seat).sort(), ['gone', 'moved', 'slow']);
  assert.equal(o.state('sitting'), 'occupied');
  o.releaseAll(13);
  assert.equal(o.state('sitting'), 'available');
}

// ------------------------------------------------ invariantes de un Crowd o StreetLife en marcha
interface Sitter {
  id: number;
  path: unknown[];
  seat?: string;
}

function audit(label: string, seats: SeatRegistry, who: readonly Sitter[]): void {
  const byId = new Map(who.map((a) => [a.id, a]));
  const used = new Map<string, number>();
  for (const a of who) {
    if (!a.seat) continue;
    assert.ok(!used.has(a.seat), `${label}: ${a.seat} lo usan a la vez ${used.get(a.seat)} y ${a.id}`);
    used.set(a.seat, a.id);
    assert.equal(seats.ownerOf(a.seat), a.id, `${label}: ${a.id} va a ${a.seat} pero el dueño es ${seats.ownerOf(a.seat)}`);
  }
  // Ni reservas huérfanas ni asientos de alguien que ya no está.
  for (const seat of seats.seats()) {
    const owner = seats.ownerOf(seat)!;
    const a = byId.get(owner);
    assert.ok(a, `${label}: ${seat} es de ${owner}, que ya no existe`);
    assert.equal(a.seat, seat, `${label}: ${seat} es de ${owner}, que ya no va ahí`);
  }
}

function runCrowd(placeId: string, start: Clock, minutes: number, seed: number): number {
  const place = placeInfo(placeId)!;
  const loc = getLocation(place.interior!);
  const crowd = new Crowd(loc, place, profileFor(placeId)!, seededRng(seed));
  const player = { tx: 1, ty: 2 };
  crowd.populate(start, player);
  const view = (): Sitter[] => crowd.agents.map((a: Agent) => ({ id: a.id, path: a.path, seat: a.point }));
  let clock = start;
  let elapsed = 0;
  let most = 0;
  audit(`${placeId}@populate`, crowd.seats, view());
  for (let ms = 0; ms < minutes * MS_PER_MIN; ms += STEP_MS) {
    crowd.update(STEP_MS, clock, player);
    elapsed += STEP_MS;
    if (elapsed >= MS_PER_MIN) {
      elapsed -= MS_PER_MIN;
      clock = addMinutes(clock, 1);
    }
    audit(`${placeId} ${clock.hour}:${clock.minute} seed ${seed}`, crowd.seats, view());
    most = Math.max(most, [...crowd.seats.seats()].length);
  }
  assert.equal(crowd.pathFailures, 0, `${placeId}: rutas no encontradas`);
  return most;
}

// ------------------------------------------------ todos los locales con gente, a varias horas
const places = POPULATION_PROFILES.map((p) => ({ id: p.place }));
assert.ok(places.length > 3, 'ningún local con gente');
let busiest = 0;
for (const p of places) {
  for (const [day, hhmm] of [[2, '09:00'], [6, '13:30'], [6, '21:00'], [7, '23:30']] as const) {
    for (const seed of [1, 2]) busiest = Math.max(busiest, runCrowd(p.id, at(day, hhmm), 90, seed));
  }
}

// ------------------------------------------------ cancelar, levantarse e irse (Crowd)
{
  let done = false;
  for (const p of places) {
    if (done) break;
    const place = placeInfo(p.id)!;
    const loc = getLocation(place.interior!);
    for (const seed of [3, 4, 5, 6, 7, 8]) {
      const crowd = new Crowd(loc, place, profileFor(p.id)!, seededRng(seed));
      const player = { tx: 1, ty: 2 };
      let clock = at(6, '13:00');
      crowd.populate(clock, player);
      let target: Agent | undefined;
      let elapsed = 0;
      for (let ms = 0; ms < 20 * MS_PER_MIN && !target; ms += STEP_MS) {
        crowd.update(STEP_MS, clock, player);
        elapsed += STEP_MS;
        if (elapsed >= MS_PER_MIN) {
          elapsed -= MS_PER_MIN;
          clock = addMinutes(clock, 1);
        }
        target = crowd.agents.find((a) => a.kind === 'visitor' && a.point && a.path.length > 2 && !a.leaving && crowd.seats.state(a.point) === 'reserved');
      }
      if (!target) continue;
      const seat = target.point!;
      assert.equal(crowd.seats.ownerOf(seat), target.id);
      assert.equal(crowd.occupancy(seat), 'RESERVED');
      // Un personaje con nombre se adelanta al asiento: la reserva se cancela y nadie más lo tiene.
      crowd.claim(new Set([seat]));
      assert.ok(crowd.seats.ownerOf(seat) !== target.id, `${p.id}: sigue reservada tras cancelar`);
      assert.equal(target.point, undefined);
      assert.equal(target.path.length, 0);
      assert.equal(crowd.occupancy(seat), 'IN_USE', 'el personaje con nombre no ocupa el asiento');
      crowd.claim(new Set());
      assert.equal(crowd.occupancy(seat), 'FREE', `${p.id}: el asiento no vuelve a estar libre`);
      // Quien se sentó se levanta al irse: el asiento queda libre y sin referencia.
      const sitter = crowd.agents.find((a) => a.kind === 'visitor' && a.point && a.path.length === 0 && crowd.seats.state(a.point) === 'occupied');
      if (sitter) {
        const chair = sitter.point!;
        sitter.leaveSoon = true;
        sitter.timer = 0;
        for (let ms = 0; ms < 5 * MS_PER_MIN && crowd.agents.includes(sitter); ms += STEP_MS) crowd.update(STEP_MS, clock, player);
        assert.ok(crowd.seats.ownerOf(chair) !== sitter.id, `${p.id}: ${chair} sigue siendo de quien se fue`);
      }
      // Reserva huérfana a propósito: de alguien que no existe; el barrido la recoge.
      assert.ok(crowd.seats.reserve('__fantasma__', 99999));
      for (let ms = 0; ms < 10_000; ms += STEP_MS) crowd.update(STEP_MS, clock, player);
      assert.ok(!crowd.seats.has('__fantasma__'), `${p.id}: la reserva huérfana sigue ahí`);
      done = true;
      break;
    }
  }
  assert.ok(done, 'no se encontró a nadie yendo a un asiento para probar la cancelación');
}

// ------------------------------------------------ la calle: terrazas, bancos, corrillos
const street = getLocation('district');
const streetProfile = streetProfileFor('district')!;
let streetSeats = 0;
for (const [day, hhmm] of [[6, '13:00'], [6, '19:30'], [7, '23:00'], [3, '09:00']] as const) {
  for (const seed of [1, 2, 3]) {
    const life = new StreetLife(street, streetProfile, seededRng(seed));
    const player = { tx: 72, ty: 53 };
    let clock = at(day, hhmm);
    life.populate(clock, player);
    let elapsed = 0;
    for (let ms = 0; ms < 90 * MS_PER_MIN; ms += STEP_MS) {
      life.update(STEP_MS, clock, player);
      elapsed += STEP_MS;
      if (elapsed >= MS_PER_MIN) {
        elapsed -= MS_PER_MIN;
        clock = addMinutes(clock, 1);
      }
      // Quien tiene un sitio de estar es el dueño; los acompañantes no tienen sitio propio (se ponen al lado).
      const who: Sitter[] = life.agents.map((a) => ({ id: a.id, path: a.path, seat: a.stayPoint }));
      audit(`calle ${hhmm} seed ${seed}`, life.seats, who);
      streetSeats = Math.max(streetSeats, who.filter((a) => a.seat).length);
    }
    assert.equal(life.pathFailures, 0, 'calle: rutas no encontradas');
  }
}
assert.ok(streetSeats > 0, 'nadie se sentó en la calle');

// Cancelar en la calle: alguien va a un asiento y un personaje con nombre se lo queda.
{
  let ok = false;
  for (const seed of [11, 12, 13, 14, 15, 16]) {
    const life = new StreetLife(street, streetProfile, seededRng(seed));
    const player = { tx: 72, ty: 53 };
    let clock = at(6, '13:00');
    life.populate(clock, player);
    let elapsed = 0;
    for (let ms = 0; ms < 40 * MS_PER_MIN && !ok; ms += STEP_MS) {
      life.update(STEP_MS, clock, player);
      elapsed += STEP_MS;
      if (elapsed >= MS_PER_MIN) {
        elapsed -= MS_PER_MIN;
        clock = addMinutes(clock, 1);
      }
      const walker = life.agents.find((a) => !a.leader && a.stayPoint && !a.staying && a.path.length > 1 && life.seats.state(a.stayPoint) === 'reserved');
      if (!walker) continue;
      const seat = walker.stayPoint!;
      life.claim(new Set([seat]));
      assert.equal(walker.stayPoint, undefined, 'sigue yendo a un asiento que ya no es suyo');
      assert.ok(!life.seats.has(seat), 'la reserva cancelada sigue ahí');
      assert.ok(life.isTaken(seat), 'el asiento del personaje con nombre se puede coger');
      life.claim(new Set());
      assert.ok(!life.isTaken(seat), 'el asiento no vuelve a estar libre');
      // Y la huérfana de verdad: una reserva cuyo dueño no existe.
      life.seats.reserve('__fantasma__', 99999);
      for (let t = 0; t < 10_000; t += STEP_MS) life.update(STEP_MS, clock, player);
      assert.ok(!life.seats.has('__fantasma__'), 'la reserva huérfana de la calle sigue ahí');
      ok = true;
    }
    if (ok) break;
  }
  assert.ok(ok, 'no se encontró a nadie yendo a un asiento en la calle');
}

console.log(`asientos OK: ${places.length} locales × 8 pasadas sin dos en el mismo asiento (hasta ${busiest} con dueño a la vez) · calle: hasta ${streetSeats} sitios en uso · cancelar, levantarse y huérfanas liberan`);
