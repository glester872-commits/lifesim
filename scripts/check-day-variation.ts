// La variación del día: el mismo día de la semana a la misma hora no da siempre la misma ciudad (gente, locales,
// tráfico, tiempo, rutinas), pero el mismo día da siempre lo mismo (recargar, guardar y cargar, salir y volver a entrar),
// y lo que es obligación no varía. La misma lógica que el juego, sin Phaser. `node scripts/check-day-variation.ts`.
import assert from 'node:assert/strict';
import { SAVE_KEY } from '../src/config/constants.ts';
import { BIKES } from '../src/data/bikes.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { VEHICLES } from '../src/data/vehicles.ts';
import { weekdayOf } from '../src/systems/Calendar.ts';
import { rainyDay, routineFor } from '../src/systems/Characters.ts';
import { Crowd, profileFor, targetAt, type Clock } from '../src/systems/Crowd.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { dayFactor, hashSeed, seededRng } from '../src/systems/MetroDaily.ts';
import { isOpen, placeInfo } from '../src/systems/Places.ts';
import { activePopUp } from '../src/systems/PopUps.ts';
import { SaveSystem } from '../src/systems/SaveSystem.ts';
import { StreetLife, streetProfileFor, streetTargetAt } from '../src/systems/StreetLife.ts';
import { Traffic } from '../src/systems/Traffic.ts';
import { weatherAt } from '../src/systems/Weather.ts';
import type { Facing } from '../src/types/game.ts';

const TUESDAYS = Array.from({ length: 8 }, (_, w) => 2 + w * 7); // día 1 = lunes
for (const d of TUESDAYS) assert.equal(weekdayOf(d), 'tuesday');
const at = (day: number, hour = 13, minute = 0): Clock => ({ day, hour, minute });

const loc = getLocation('district');
const profile = streetProfileFor('district')!;
const cafe = placeInfo('cafe')!;
const gym = placeInfo('gym')!;

/** Todo lo que se ve de la ciudad a esa hora de ese día, sin tiradas nuevas: se puede pedir las veces que se quiera. */
function city(day: number, hour = 13): Record<string, number | string> {
  const clock = at(day, hour);
  const cars = new Traffic(loc.traffic!, VEHICLES, [], 1_000, seededRng(1));
  const bikes = new Traffic(loc.traffic!.bikes!, BIKES, [], 1_000, seededRng(1));
  const w = weatherAt(day, hour);
  return {
    calle: streetTargetAt(profile, clock),
    cafe: targetAt(cafe, profileFor('cafe')!, clock),
    gimnasio: targetAt(gym, profileFor('gym')!, clock),
    coches: cars.target(hour, day),
    bicis: bikes.target(hour, day),
    lluvia: Math.round(w.rain * 100) / 100,
    grados: Math.round(w.celsius),
    popup: activePopUp('district', clock)?.id ?? '-',
  };
}

// --------------------------------------------------- 1. varía de un martes a otro (y dentro de lo seguro)
const weeks = TUESDAYS.map((d) => city(d));
const distinct = (k: string): number => new Set(weeks.map((c) => c[k])).size;
for (const k of ['calle', 'cafe', 'gimnasio', 'coches', 'bicis', 'grados']) assert.ok(distinct(k) >= 2, `el martes a las 13:00 la ciudad no cambia en «${k}» en ocho semanas: ${weeks.map((c) => c[k]).join(' ')}`);
// El tráfico: nunca sin coches un martes a mediodía, ni más que su hora punta.
for (const c of weeks) assert.ok(Number(c.coches) >= 1 && Number(c.coches) <= 3 && Number(c.bicis) >= 1 && Number(c.bicis) <= 2, `tráfico fuera de rango: ${c.coches} coches, ${c.bicis} bicis`);
// Dentro del rango de cada sitio: nunca más gente de la que cabe ni de la que el perfil admite.
for (const c of weeks) {
  assert.ok(Number(c.cafe) >= 0 && Number(c.cafe) <= Math.min(profileFor('cafe')!.maxVisitors, cafe.capacity), `café fuera de rango: ${c.cafe}`);
  assert.ok(Number(c.gimnasio) >= 0 && Number(c.gimnasio) <= Math.min(profileFor('gym')!.maxVisitors, gym.capacity), `gimnasio fuera de rango: ${c.gimnasio}`);
  assert.ok(Number(c.calle) <= profile.maxWalkers + 8, `calle fuera de rango: ${c.calle}`);
}
// El factor del día es acotado, no tiene sesgo y no depende de cuántas veces se pida.
for (let d = 1; d <= 400; d++) {
  const f = dayFactor(d, 'prueba', 0.25);
  assert.ok(f >= 0.75 && f <= 1.25 && f === dayFactor(d, 'prueba', 0.25), `factor del día ${d}: ${f}`);
}
const mean = Array.from({ length: 400 }, (_, d) => dayFactor(d + 1, 'prueba', 0.25)).reduce((a, b) => a + b, 0) / 400;
assert.ok(Math.abs(mean - 1) < 0.03, `el factor del día tiene sesgo: media ${mean.toFixed(3)}`);
// Y el mismo martes de la semana siguiente no es el de ésta en todo a la vez.
const same = weeks.filter((c, i) => i > 0 && JSON.stringify(c) === JSON.stringify(weeks[i - 1])).length;
assert.ok(same <= 1, `${same} martes seguidos idénticos de 7: poca variación`);

// --------------------------------------------------- 2. estable el mismo día: recargar, guardar y cargar
{
  for (const d of TUESDAYS) assert.deepEqual(city(d), city(d), `el día ${d} cambia entre dos lecturas`);
  const store = new Map<string, string>();
  const save = new SaveSystem({ read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) });
  const state = { money: 10, energy: 50, day: TUESDAYS[3], hour: 13, minute: 0, locationId: 'district', position: { x: 10, y: 10 }, facing: 'down' as Facing, events: undefined as never, inventory: {}, cards: {} };
  const before = city(state.day);
  save.save(state);
  assert.ok(store.has(SAVE_KEY));
  const loaded = save.load()!;
  assert.deepEqual(city(loaded.day, loaded.hour), before, 'guardar y cargar cambia el día');
  assert.equal(rainyDay(loaded.day), rainyDay(state.day), 'la lluvia del día cambia al cargar');
}

// --------------------------------------------------- 3. estable al volver a entrar el mismo día (la gente y el tráfico)
{
  const day = TUESDAYS[4];
  const clock = at(day, 13, 5);
  const player = { tx: 40, ty: 30 };
  // La calle: dos entradas, la misma gente, con las mismas caras, en los mismos sitios.
  const entry = (): string => {
    const s = new StreetLife(loc, profile, seededRng(hashSeed('entrada', day)));
    s.populate(clock, player);
    return JSON.stringify(s.agents.map((a) => [a.look, a.kind, Math.round(a.x * 10), Math.round(a.y * 10), a.role]));
  };
  assert.equal(entry(), entry(), 'la calle no es la misma al volver a entrar');
  // El local: igual.
  const room = (): string => {
    const c = new Crowd(getLocation(cafe.interior!), cafe, profileFor('cafe')!, seededRng(hashSeed('sala', day)));
    c.populate(clock, { tx: 1, ty: 2 });
    return JSON.stringify(c.agents.map((a) => [a.look, a.kind, a.x, a.y, a.state]));
  };
  assert.equal(room(), room(), 'el local no es el mismo al volver a entrar');
  // El tráfico, con la semilla del lugar, el día y la media hora (WorldScene): los mismos coches en los mismos sitios.
  const slot = Math.floor((13 * 60 + 5) / 30);
  const road = (d: number): string => {
    const t = new Traffic(loc.traffic!, VEHICLES, [], 1_000, seededRng(hashSeed('traffic', 'district', 'cars', d, slot)));
    t.populate({ day: d, minuteOfDay: 13 * 60 + 5 });
    return JSON.stringify(t.vehicles.map((v) => [v.type.id, Math.round(v.x), v.row]));
  };
  assert.equal(road(day), road(day), 'el tráfico no es el mismo al volver a entrar');
  assert.notEqual(road(day), road(TUESDAYS[5]), 'dos martes con exactamente el mismo tráfico');
}

// --------------------------------------------------- 4. lo obligatorio no varía
for (const d of TUESDAYS) {
  // El café abre a su hora y tiene a su personal a mediodía todos los martes.
  assert.ok(isOpen(cafe, d, 13, 0) && isOpen(cafe, d, 7, 30) && !isOpen(cafe, d, 3, 0), `horario del café el día ${d}`);
  const crowd = new Crowd(getLocation(cafe.interior!), cafe, profileFor('cafe')!, seededRng(hashSeed('sala', d)));
  crowd.populate(at(d), { tx: 1, ty: 2 });
  assert.ok(crowd.agents.some((a) => a.kind === 'staff'), `sin personal en el café el martes ${d}`);
  // Los personajes con nombre cumplen lo suyo: su rutina del día existe y pasa por casa.
  for (const def of CHARACTERS) {
    const r = routineFor(def, d, { rainy: rainyDay(d) });
    assert.ok(r.stops.length >= 2 && r.stops.some((s) => s.point === def.home), `${def.npc}: sin casa el día ${d}`);
  }
}

console.log(
  'check-day-variation: martes a las 13:00 —',
  `calle ${weeks.map((c) => c.calle).join('/')}, café ${weeks.map((c) => c.cafe).join('/')}, coches ${weeks.map((c) => c.coches).join('/')}, ${weeks.map((c) => c.grados).join('/')} °C;`,
  `${same} martes seguidos idénticos; estable al recargar, guardar/cargar y volver a entrar; obligaciones intactas, OK`,
);
