// Recogidas de taxi/VTC (StreetLife.advanceRides sobre systems/Traffic.hail): dónde se puede (paradas pegadas a un carril
// sin carril bici en medio), la secuencia entera con coches de verdad (espera → el coche llega por su carril → para →
// suben → se va), dos grupos a la vez, sin coche (se cancela y siguen), y un día entero sin atascos ni reservas sueltas.
// La misma lógica que el juego, sin Phaser. Llamado desde la cadena `check` de package.json. `node scripts/check-rides.ts`.
import assert from 'node:assert/strict';
import { TILE } from '../src/config/constants.ts';
import { STREET_PROFILES } from '../src/data/streets.ts';
import { VEHICLES } from '../src/data/vehicles.ts';
import type { Clock } from '../src/systems/Crowd.ts';
import { withDistrictLanes } from '../src/systems/Districts.ts';
import { getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { RIDE, StreetLife, streetProfileFor, type Ride } from '../src/systems/StreetLife.ts';
import { Traffic, type Vehicle } from '../src/systems/Traffic.ts';

const TUE = 2;
const SAT = 6;
const MS = 500; // ms reales por minuto de juego
const at = (day: number, minutes: number): Clock => ({ day: day + Math.floor(minutes / 1440), hour: Math.floor((minutes % 1440) / 60), minute: minutes % 60 });
const FAR = { tx: -999, ty: -999 };

/** Una calle con su tráfico, enlazados como en la escena (WorldScene: street.traffic = traffic). */
function scene(location: string, day: number, hour: number, seed: number, withTraffic = true) {
  const loc = getLocation(location);
  const life = new StreetLife(loc, streetProfileFor(location)!, seededRng(seed));
  const traffic = withTraffic && loc.traffic ? new Traffic(withDistrictLanes(loc, loc.traffic), VEHICLES, loc.signals ?? [], loc.ground[0].length * TILE, seededRng(seed + 7)) : null;
  let minutes = Math.round(hour * 60);
  let acc = 0;
  const clock = (): Clock => at(day, minutes);
  life.populate(clock(), FAR);
  traffic?.populate({ day, minuteOfDay: minutes });
  life.traffic = traffic;
  return {
    loc, life, traffic,
    step(ms: number, each?: () => void): void {
      for (let t = 0; t < ms; t += 100) {
        acc += 100;
        if (acc >= MS) {
          acc -= MS;
          minutes++;
        }
        const c = clock();
        life.update(100, c, FAR);
        const feet = life.agents.map((a) => ({ x: (a.x + 0.5) * TILE, y: (a.y + 1) * TILE }));
        traffic?.update(100, { day: c.day, minuteOfDay: c.hour * 60 + c.minute }, feet);
        each?.();
      }
    },
  };
}

// --------------------------------------------------- 1. dónde: paradas legales, y dónde no
{
  const withRides = STREET_PROFILES.filter((p) => getLocation(p.location).rides?.length).map((p) => p.location).sort();
  assert.deepEqual(withRides, ['puerta-central', 'velaria'], `paradas en ${withRides.join(', ')}`);
  for (const id of withRides) {
    const loc = getLocation(id);
    const graph = new Set((loc.links ?? []).flat());
    for (const r of loc.rides!) {
      const lane = loc.traffic!.lanes.find((l) => l.row === r.lane);
      assert.ok(lane, `${id}: la parada ${r.wait} no está en un carril con coches`);
      const w = loc.points?.[r.wait];
      assert.ok(w && graph.has(r.wait), `${id}: ${r.wait} no está en el grafo`);
      // Se espera en el bordillo, pegado al carril: ni carril bici ni otra calzada en medio.
      assert.equal(Math.abs(w.ty - r.lane), 1, `${id}: ${r.wait} no está en el bordillo del carril ${r.lane}`);
      assert.ok(isWalkable(loc, w.tx, w.ty) && !['u', 'l', '.', 'b', 'z'].includes(loc.ground[w.ty][w.tx]), `${id}: ${r.wait} no es acera`);
      assert.ok(Math.abs(w.tx - r.stopTx) <= 1, `${id}: el coche para lejos de quien espera`);
      // Lejos de los pasos de cebra: ni en las bandas ni en la cola de su semáforo.
      for (const s of loc.signals ?? []) if (r.lane >= s.ty && r.lane < s.ty + s.h) assert.ok(r.stopTx < s.tx - 4 || r.stopTx > s.tx + s.w + 3, `${id}: parada ${r.wait} pegada al paso ${s.id}`);
    }
  }
  // Excluidos: la Ribera no tiene coches; Vallesco, Cuatro Ríos y el Arena tienen el carril bici entre la acera y los coches.
  for (const id of ['ribera', 'district', 'cuatro-rios', 'arena']) {
    const loc = getLocation(id);
    assert.ok(!loc.rides?.length, `${id}: parada de taxi donde no se puede subir sin cruzar calzada`);
    assert.ok(!streetProfileFor(id)!.trips.some((t) => t.ride), `${id}: regla de recogida sin parada`);
  }
}

// --------------------------------------------------- 2. la secuencia entera, natural, de noche y de día
interface Seen {
  phases: string[];
  stoppedAtBoard: boolean;
  car?: Vehicle;
}
function watch(location: string, day: number, hour: number, hours: number, seed: number) {
  const s = scene(location, day, hour, seed);
  const seen = new Map<Ride, Seen>();
  let maxRides = 0;
  const cars = new Map<Vehicle, Ride>();
  s.step(hours * 60 * MS, () => {
    maxRides = Math.max(maxRides, s.life.rides.length);
    assert.ok(s.life.rides.length <= RIDE.cap, `${location}: ${s.life.rides.length} recogidas a la vez`);
    const stops = s.life.rides.map((r) => r.stop);
    assert.equal(new Set(stops).size, stops.length, `${location}: dos grupos en la misma parada`);
    for (const r of s.life.rides) {
      const e = seen.get(r) ?? { phases: [], stoppedAtBoard: true };
      if (e.phases[e.phases.length - 1] !== r.phase) e.phases.push(r.phase);
      if (r.car) {
        const owner = cars.get(r.car);
        assert.ok(!owner || owner === r, `${location}: un coche para dos recogidas`);
        cars.set(r.car, r);
        e.car = r.car;
        // Nadie sube con el coche en marcha.
        if (r.phase === 'BOARDING' && r.members.some((m) => m.vanish && m.riding === r)) e.stoppedAtBoard &&= s.traffic!.isStopped(r.car);
      }
      seen.set(r, e);
    }
    // Ningún coche parado sin recogida que lo retenga.
    for (const v of s.traffic!.vehicles) if (v.stopAt !== undefined) assert.ok(s.life.rides.some((r) => r.car === v), `${location}: coche retenido sin recogida`);
  });
  const done = [...seen.entries()].filter(([r, e]) => !s.life.rides.includes(r) && e.phases.join('>') === 'WAITING>APPROACHING>BOARDING').map(([, e]) => e);
  return { s, done, maxRides };
}
{
  const cases = [
    { what: 'Puerta Central de noche (salida del ocio)', location: 'puerta-central', day: SAT, hour: 22.5 },
    { what: 'Velaria de día (parada del Gran Hotel)', location: 'velaria', day: TUE, hour: 8 },
    { what: 'Puerta Central de día (turismo y compras)', location: 'puerta-central', day: TUE, hour: 11 },
  ];
  for (const c of cases) {
    const r = watch(c.location, c.day, c.hour, 3, 3);
    const st = r.s.life.rideStats;
    console.log(`  ${c.what}: ${st.started} recogidas (${st.boarded} con subida, ${st.cancelled} canceladas), ${st.people} personas suben, máx. ${r.maxRides} a la vez`);
    assert.ok(r.done.length > 0, `${c.what}: ninguna recogida completa (espera → coche → para → suben)`);
    assert.ok(r.done.every((e) => e.stoppedAtBoard), `${c.what}: alguien sube con el coche en marcha`);
    // El coche se va: sale del mapa por su carril después de recoger.
    r.s.step(30_000);
    assert.ok(r.done.every((e) => !r.s.traffic!.has(e.car!)), `${c.what}: el coche de una recogida no se va`);
    assert.equal(r.s.life.pathFailures, 0, `${c.what}: rutas no encontradas`);
  }
}

// --------------------------------------------------- 3. dos grupos a la vez: cada uno su parada y su coche
{
  let both = false;
  // Coincidir dos depende del azar: con dos portales de la plaza convertidos en tiendas (CV-03) las semillas que lo dan
  // cambiaron (24 semillas de 3 h: antes 6 con dos a la vez, ahora 2; recogidas 79 → 74). Se busca hasta 30.
  for (let seed = 1; seed <= 30 && !both; seed++) {
    const s = scene('puerta-central', SAT, 23, seed);
    s.step(3 * 60 * MS, () => {
      const withCar = s.life.rides.filter((r) => r.car);
      if (withCar.length === 2) {
        both = true;
        assert.notEqual(withCar[0].car, withCar[1].car, 'dos grupos en el mismo coche');
        assert.notEqual(withCar[0].stop, withCar[1].stop, 'dos grupos en la misma parada');
      }
    });
  }
  assert.ok(both, 'nunca hubo dos recogidas con coche a la vez en un sábado por la noche');
}

// --------------------------------------------------- 4. sin coche: se cansa, se cancela y sigue su camino
{
  const s = scene('puerta-central', SAT, 23, 4, false);
  let waited: Ride | undefined;
  let cancelled = false;
  s.step(2 * 60 * MS, () => {
    waited ??= s.life.rides[0];
    if (waited && !s.life.rides.includes(waited)) cancelled = true;
  });
  assert.ok(waited, 'nadie espera un VTC en Puerta Central un sábado por la noche');
  assert.ok(cancelled, 'sin coches, la espera no acaba');
  assert.ok(s.life.rideStats.boarded === 0 && s.life.rideStats.cancelled > 0);
  // El que esperaba ya no espera: sigue su camino (o ya se ha ido) y nadie quedó con la recogida colgada.
  assert.equal(waited.leader.riding, undefined, 'el que esperaba sigue enganchado a la recogida');
  assert.ok(!s.life.agents.includes(waited.leader) || waited.leader.path.length > 0 || waited.leader.vanish, 'el que esperaba se queda plantado');
}

// --------------------------------------------------- 5. cancelar con el coche de camino: el coche sigue, nadie retenido
{
  const s = scene('velaria', TUE, 8, 5);
  let coming: Ride | undefined;
  s.step(60 * MS, () => {
    coming ??= s.life.rides.find((r) => r.phase === 'APPROACHING');
  });
  assert.ok(coming?.car, 'ninguna recogida con el coche de camino en Velaria por la mañana');
  // Se va antes de que llegue (como al cambiar de escena a mitad, la calle pierde a quien esperaba).
  s.life.agents.splice(s.life.agents.indexOf(coming.leader), 1);
  s.step(500);
  assert.ok(!s.life.rides.includes(coming), 'la recogida sigue sin nadie');
  assert.equal(coming.car.stopAt, undefined, 'el coche sigue reservado para nadie');
}

// --------------------------------------------------- 6. un día entero: cupo, recogidas que acaban y ningún atasco
{
  const s = scene('puerta-central', SAT, 0, 9);
  let max = 0;
  let longest = 0;
  const since = new Map<Vehicle, number>();
  let ms = 0;
  s.step(24 * 60 * MS, () => {
    ms += 100;
    max = Math.max(max, s.life.rides.length);
    for (const v of s.traffic!.vehicles) {
      if (v.stopAt === undefined) since.delete(v);
      else if (!since.has(v)) since.set(v, ms);
      else longest = Math.max(longest, ms - since.get(v)!);
    }
  });
  const st = s.life.rideStats;
  console.log(`  un sábado entero en Puerta Central: ${st.started} recogidas, ${st.boarded} con subida, ${st.cancelled} canceladas, ${st.people} personas; máx. ${max} a la vez; un coche, como mucho ${(longest / 1000).toFixed(0)} s reservado`);
  assert.ok(max <= RIDE.cap);
  assert.ok(st.boarded >= 3, 'casi ninguna recogida en todo un sábado');
  assert.equal(st.started, st.boarded + st.cancelled + s.life.rides.length, 'recogidas que no acaban ni se cancelan');
  assert.ok(longest <= RIDE.approachMs + RIDE.boardMs + 2_000, 'un coche retenido más de lo que dura una recogida');
}

console.log('Taxi/VTC: paradas legales, secuencia completa, dos grupos, sin coche, cancelación y un día entero OK');
