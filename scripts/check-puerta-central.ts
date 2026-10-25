// Puerta Central (data/puertaCentral.ts, data/puertaCentralVenues.ts, data/streetActs.ts) con los mismos sistemas que
// el juego, sin Phaser: los locales se entran y tienen gente (pizzería, hamburguesería y café con su servicio de mesa); el
// metro es la estación más llena de la línea sin cambiar los trayectos de antes; es la calle con más gente del juego y su
// gente cambia con la hora (metro por la mañana, compras y turismo por la tarde, cenas y grupos por la noche, menos turista
// de madrugada) sin que todos sean turistas; la venta en manta y los artistas llegan, montan, trabajan, recogen y se van,
// con su corro sólo mientras trabajan, con lluvia no vienen y no tienen una cara fija; y el LOD (presupuesto de gente,
// gestos sólo para los de cerca) hace lo que dice. `node scripts/check-puerta-central.ts`.
import assert from 'node:assert/strict';
import { LINES, STOPS } from '../src/data/transit.ts';
import { LOCATION_DISTRICT } from '../src/data/districtIdentity.ts';
import { roleGroupOf } from '../src/data/districtIdentity.ts';
import { ZONES } from '../src/data/zones.ts';
import { FOOD_VENUES } from '../src/data/foodVenues.ts';
import { POPULATION_PROFILES } from '../src/data/population.ts';
import { STREET_PROFILES } from '../src/data/streets.ts';
import { PASSENGER_LOOKS } from '../src/data/npcs.ts';
import { getLocation, isStandable } from '../src/systems/LocationSystem.ts';
import { crowdAt, hashSeed, metroDay, seededRng, weekday } from '../src/systems/MetroDaily.ts';
import { CROWD_LEVELS } from '../src/config/metro.ts';
import { placesOfType } from '../src/systems/Places.ts';
import { crowdBudget, MIN_BUDGET, StreetLife, streetProfileFor, streetTargetAt, type Walker } from '../src/systems/StreetLife.ts';
import { actOn, actsOf } from '../src/systems/StreetActs.ts';
import { SHELTER_RAIN } from '../src/systems/StreetSurvival.ts';
import { weatherAt } from '../src/systems/Weather.ts';
import { gestureSet, GESTURE_BUDGET } from '../src/systems/AmbientActions.ts';
import { auditVenues } from '../src/systems/VenueAudit.ts';
import type { Clock } from '../src/systems/Crowd.ts';

const ID = 'puerta-central';
const loc = getLocation(ID);
const street = streetProfileFor(ID)!;
const STEP_MS = 100;
const MS_PER_MIN = 500;
const PLAYER = { tx: 28, ty: 24 };

// --------------------------------------------------- 1. los locales: se entran, tienen horario y gente
const rows = auditVenues(ID);
for (const r of rows) assert.deepEqual(r.problems, [], `${r.name}: ${r.problems.join(' | ')}`);
assert.ok(rows.filter((r) => r.kind === 'enterable').every((r) => r.population), 'local sin gente dentro');
const business = placesOfType('business').filter((p) => p.locationId === ID).map((p) => p.id);
for (const id of ['pc-pizza', 'pc-burger', 'pc-cafe', 'pc-recuerdos', 'pc-moda']) assert.ok(business.includes(id), `falta el negocio ${id}`);
// Comida rápida con la arquitectura de siempre: arquetipo, carta, mesas con servicio y mostrador para llevar.
for (const [id, archetype] of [['pc-pizza', 'pizza-casual'], ['pc-burger', 'burger-fast']]) {
  assert.equal(FOOD_VENUES.find((v) => v.id === id)?.archetype, archetype, `${id} no sale de su arquetipo`);
  assert.ok(POPULATION_PROFILES.find((p) => p.place === id)?.tableService, `${id} sin servicio de mesa`);
  assert.ok(getLocation(id).terminals?.length, `${id} sin mostrador`);
}
assert.ok(street.tableService?.some((t) => t.place === 'pc-cafe'), 'la terraza del café sin servicio de mesa');
assert.ok(getLocation('pc-recuerdos').racks?.length && getLocation('pc-moda').racks?.length, 'las tiendas sin percheros');
assert.ok(loc.props.some((p) => p.kind === 'monument'), 'la plaza sin monumento');
assert.ok(loc.inspects?.some((i) => i.name === 'La Rosa de los Vientos'), 'el monumento no se puede mirar');

// --------------------------------------------------- 2. el metro: la estación más llena, y los trayectos de antes, iguales
const stop = (id: string) => STOPS.find((s) => s.id === id)!;
const minutes = (a: string, b: string): number => Math.abs(stop(a).order - stop(b).order) * LINES[0].minutesPerStop;
assert.equal(stop(ID).station, 'puerta-central-station');
assert.equal(minutes(ID, 'velaria'), LINES[0].minutesPerStop);
assert.equal(minutes('velaria', 'cuatro-rios'), LINES[0].minutesPerStop, 'cambió Velaria → Cuatro Ríos');
assert.equal(minutes('cuatro-rios', 'vallesco'), LINES[0].minutesPerStop, 'cambió Cuatro Ríos → Vallesco');
assert.ok((stop(ID).hub ?? 0) > 0 && STOPS.every((s) => s.id === ID || !s.hub), 'el andén de Puerta Central no va más lleno que los demás');
let busier = 0;
for (let day = 1; day <= 14; day++) {
  const daily = metroDay(day);
  for (let h = 6; h < 24; h++) {
    const base = CROWD_LEVELS.indexOf(crowdAt(daily, h, 0));
    const hub = CROWD_LEVELS.indexOf(crowdAt(daily, h, 0, stop(ID).hub));
    assert.ok(hub >= base, 'un andén de centro menos lleno que uno de barrio');
    if (hub > base) busier++;
  }
}
assert.ok(busier > 14 * 18 * 0.5, `el andén de centro casi nunca va más lleno (${busier})`);
assert.equal(LOCATION_DISTRICT[ID], ID);
assert.equal(LOCATION_DISTRICT['puerta-central-station'], ID);
assert.ok(getLocation('puerta-central-station').portals.some((p) => p.to.location === ID && p.to.spawn === 'pc-metro'), 'la estación no sale a la plaza');
assert.equal((loc.buildings ?? []).filter((b) => b.enter?.location === 'puerta-central-station').length, 2, 'la plaza no tiene sus dos bocas');
assert.equal(street.bursts?.length, 2, 'las dos bocas no echan gente');

// --------------------------------------------------- 3. zonas y la calle más llena del juego
for (const name of ['Calle de la Puerta', 'Plaza de la Puerta']) assert.ok(ZONES.some((z) => z.location === ID && z.name === name), `falta la zona ${name}`);
const peak = (id: string): number => {
  const p = STREET_PROFILES.find((s) => s.location === id)!;
  let best = 0;
  for (let day = 1; day <= 7; day++) for (let h = 0; h < 24; h++) best = Math.max(best, streetTargetAt(p, { day, hour: h, minute: 0 }));
  return best;
};
const peaks = Object.fromEntries(STREET_PROFILES.map((p) => [p.location, peak(p.location)]));
for (const [id, n] of Object.entries(peaks)) if (id !== ID) assert.ok(peaks[ID] > n, `${id} (${n}) tiene más gente que Puerta Central (${peaks[ID]})`);

// --------------------------------------------------- 4. la gente según la hora: no todos son turistas
let tuesday = 1;
while (weekday(tuesday) !== 'martes') tuesday++;
const addMinutes = (c: Clock, m: number): Clock => {
  const total = c.hour * 60 + c.minute + m;
  return { day: c.day + Math.floor(total / 1440), hour: Math.floor((total % 1440) / 60), minute: total % 60 };
};

interface Sample {
  mean: number;
  groups: Map<string, number>;
  roles: Set<string>;
  msPerTick: number;
}
/** 30 minutos de calle desde esa hora: gente media, grupos de viaje (sólo quien pasa) y lo que cuesta cada tick. */
function sample(day: number, hour: number, seed: number, minutesLong = 30): Sample {
  const life = new StreetLife(loc, street, seededRng(hashSeed(`pc-${seed}`)));
  let clock: Clock = { day, hour: Math.floor(hour), minute: Math.round((hour % 1) * 60) };
  life.populate(clock, PLAYER);
  const groups = new Map<string, number>();
  const roles = new Set<string>();
  let sum = 0;
  let n = 0;
  let elapsed = 0;
  let spent = 0;
  let ticks = 0;
  for (let ms = 0; ms < minutesLong * MS_PER_MIN; ms += STEP_MS) {
    const t0 = performance.now();
    life.update(STEP_MS, clock, PLAYER);
    spent += performance.now() - t0;
    ticks++;
    elapsed += STEP_MS;
    if (elapsed >= MS_PER_MIN) {
      elapsed -= MS_PER_MIN;
      clock = addMinutes(clock, 1);
      sum += life.agents.length;
      n++;
      for (const a of life.agents) {
        if (a.kind !== 'visitor' || !a.rule) continue;
        const g = roleGroupOf(a.role) ?? 'other';
        groups.set(g, (groups.get(g) ?? 0) + 1);
      }
    }
    for (const a of life.agents) {
      roles.add(a.role);
      assert.ok(isStandable(loc, Math.round(a.x), Math.round(a.y)), `${a.role} dentro de algo en ${Math.round(a.x)},${Math.round(a.y)} a las ${hour}`);
    }
  }
  assert.equal(life.pathFailures, 0, `rutas no encontradas a las ${hour}`);
  return { mean: sum / n, groups, roles, msPerTick: spent / ticks };
}
const shareOf = (s: Sample, ...gs: string[]): number => {
  const total = [...s.groups.values()].reduce((a, b) => a + b, 0);
  return gs.reduce((a, g) => a + (s.groups.get(g) ?? 0), 0) / total;
};
const morning = sample(tuesday, 8.5, 1);
const afternoon = sample(tuesday, 16, 2);
const evening = sample(tuesday, 21, 3);
const late = sample(tuesday + 4, 1.5, 4);
const top = (s: Sample): string => [...s.groups].sort((a, b) => b[1] - a[1])[0][0];
assert.equal(top(morning), 'commute', `por la mañana manda ${top(morning)}, no el metro`);
assert.ok(shareOf(afternoon, 'retail', 'tourism') > shareOf(afternoon, 'commute'), 'por la tarde no mandan las compras y el turismo');
assert.ok(shareOf(afternoon, 'tourism') < 0.45, `por la tarde casi todos son turistas (${(shareOf(afternoon, 'tourism') * 100).toFixed(0)} %)`);
assert.ok(shareOf(afternoon, 'tourism') > 0.1, 'por la tarde no hay turistas');
assert.ok(shareOf(evening, 'food', 'social') > shareOf(morning, 'food', 'social'), 'por la noche no hay más cenas y grupos que por la mañana');
assert.ok(shareOf(late, 'tourism') < shareOf(afternoon, 'tourism'), 'de madrugada hay tanto turista como por la tarde');
assert.ok(late.roles.has('night-crowd'), 'de madrugada nadie sale de fiesta');
assert.ok(late.mean < afternoon.mean, 'de madrugada hay más gente que por la tarde');
for (const r of ['commuter', 'office', 'shopper', 'tourist', 'tourist-group', 'friends-meet', 'diner', 'courier', 'street-cleaner', 'returning']) {
  assert.ok(street.trips.some((t) => t.role === r), `nadie en la calle hace ${r}`);
}

// --------------------------------------------------- 5. venta en manta y artistas: llegan, montan, trabajan, recogen y se van
const acts = actsOf(ID);
assert.ok(acts.filter((a) => a.kind === 'vendor').length >= 4 && ['music', 'dance', 'statue'].every((k) => acts.some((a) => a.kind === k)), 'faltan puestos o artistas');
for (const a of acts) {
  for (const p of a.pitch) assert.ok(loc.points?.[p], `${a.id}: falta su sitio ${p}`);
  assert.ok(street.trips.some((t) => t.act === a.id), `${a.id}: nadie se para a mirar`);
}
const dry = (day: number, h: number): boolean => weatherAt(day, h).rain < SHELTER_RAIN;
// Con lluvia no viene nadie: ni mantas ni música.
let rainy = 0;
for (let day = 1; day <= 120 && rainy < 5; day++) {
  for (let h = 11; h < 20; h++) {
    if (dry(day, h)) continue;
    rainy++;
    for (const a of acts) assert.equal(actOn(a, { day, hour: h, minute: 0 }, weatherAt(day, h)), false, `${a.id} trabajando con lluvia`);
  }
}
/** Un día seco en el que el puesto viene: el día de la prueba. */
const dayFor = (id: string, from: number, to: number): number => {
  const act = acts.find((a) => a.id === id)!;
  for (let day = 1; day < 200; day++) {
    let ok = true;
    for (let h = from; h <= to; h += 0.25) ok &&= dry(day, h);
    if (ok && actOn(act, { day, hour: Math.floor((from + to) / 2), minute: 0 }, weatherAt(day, from))) return day;
  }
  throw new Error(`${id}: ningún día seco en que venga`);
};
{
  // La manta de bisutería, de 10:45 a 16:00 (sale andando del borde: ~30 min a paso de paseo): llega con el hatillo, monta, vende, recoge y se va; quien mira, sólo mientras vende.
  const day = dayFor('pc-manta-bisuteria', 10.75, 16);
  const life = new StreetLife(loc, street, seededRng(hashSeed('pc-manta')));
  let clock: Clock = { day, hour: 10, minute: 45 };
  life.populate(clock, PLAYER);
  const states: string[] = [];
  let browsedWhileSelling = 0;
  let elapsed = 0;
  let seen = false;
  let gone = false;
  for (let ms = 0; ms < 315 * MS_PER_MIN; ms += STEP_MS) {
    life.update(STEP_MS, clock, PLAYER);
    elapsed += STEP_MS;
    if (elapsed >= MS_PER_MIN) {
      elapsed -= MS_PER_MIN;
      clock = addMinutes(clock, 1);
    }
    const vendor = life.agents.find((a) => a.gig?.def.id === 'pc-manta-bisuteria');
    if (vendor) {
      seen = true;
      if (states[states.length - 1] !== vendor.state) states.push(vendor.state);
    } else if (seen) gone = true;
    for (const w of life.agents as Walker[]) {
      if (w.rule?.act !== 'pc-manta-bisuteria' || !w.staying) continue;
      assert.ok(vendor && (vendor.state === 'SELL' || vendor.state === 'PACK'), `alguien mirando la manta sin manta (${vendor?.state ?? 'nadie'})`);
      if (vendor.state === 'SELL') browsedWhileSelling++;
    }
  }
  for (const s of ['MOVE', 'SETUP', 'SELL', 'PACK']) assert.ok(states.includes(s), `la manta nunca pasa por ${s}: ${states.join(' → ')}`);
  assert.ok(states.indexOf('SETUP') < states.indexOf('SELL') && states.indexOf('SELL') < states.indexOf('PACK'), `orden raro: ${states.join(' → ')}`);
  assert.ok(gone, 'quien vende no se va al acabar');
  assert.ok(browsedWhileSelling > 0, 'nadie se para a mirar la manta');
  assert.equal(life.pathFailures, 0);
  console.log(`  manta (día ${day}): ${states.join(' → ')} · ${browsedWhileSelling} ticks con alguien mirando`);
}
{
  // El baile mantiene tres artistas; el corro es estocástico y la llegada incluye el viaje.
  const day = dayFor('pc-baile', 18, 19);
  let crowd = 0;
  for (let seed = 0; seed < 8; seed++) {
    const life = new StreetLife(loc, street, seededRng(hashSeed('pc-baile', seed)));
    let clock: Clock = { day, hour: 18, minute: 15 };
    life.populate(clock, PLAYER);
    let elapsed = 0;
    for (let ms = 0; ms < 90 * MS_PER_MIN; ms += STEP_MS) {
      life.update(STEP_MS, clock, PLAYER);
      elapsed += STEP_MS;
      if (elapsed >= MS_PER_MIN) { elapsed -= MS_PER_MIN; clock = addMinutes(clock, 1); }
      crowd = Math.max(crowd, (life.agents as Walker[]).filter(w => w.rule?.act === 'pc-baile' && w.staying).length);
    }
    const dancers = life.agents.filter(a => a.gig?.def.id === 'pc-baile');
    assert.equal(dancers.length, 3, `semilla ${seed}: el grupo de baile no está entero`);
    assert.ok(dancers.every(d => d.state === 'PERFORM' && d.act?.kind === 'dance'), `semilla ${seed}: el grupo no baila`);
  }
  assert.ok(crowd >= 2, `el baile no junta corro en ocho semillas (${crowd})`);
  console.log(`  baile (día ${day}): 3 bailando en 8 semillas, corro de hasta ${crowd}`);
}
{
  // Ninguna cara fija ni ningún origen: quien vende, en 40 días, es gente de todos los tonos de piel.
  const skins = new Map<string, number>();
  const looks = new Set<number>();
  for (let day = 1; day <= 40; day++) {
    const life = new StreetLife(loc, street, seededRng(hashSeed('pc-faces', day)));
    life.populate({ day, hour: 13, minute: 30 }, PLAYER);
    for (const a of life.agents) {
      if (a.act?.kind !== 'vendor') continue;
      looks.add(a.look);
      const skin = PASSENGER_LOOKS[a.look % PASSENGER_LOOKS.length].skin ?? '?';
      skins.set(skin, (skins.get(skin) ?? 0) + 1);
    }
  }
  const total = [...skins.values()].reduce((a, b) => a + b, 0);
  assert.ok(total >= 40, `pocas mantas en 40 días (${total})`);
  // Hay 60 caras: con más puestos que caras se repiten por fuerza. Lo que se mira es que no haya caras fijas (al azar
  // puro, 118 puestos sobre 60 caras dan ~52 distintas).
  assert.ok(looks.size >= Math.min(total, PASSENGER_LOOKS.length) * 0.65, `quien vende repite cara (${looks.size} de ${total})`);
  assert.ok(skins.size >= 5, `quien vende tiene sólo ${skins.size} tonos de piel`);
  assert.ok(Math.max(...skins.values()) / total < 0.4, 'quien vende es casi siempre del mismo tono de piel');
  console.log(`  venta ambulante en 40 días: ${total} puestos, ${looks.size} caras, ${skins.size} tonos de piel`);
}

// --------------------------------------------------- 6. LOD y rendimiento
// El presupuesto baja con frames largos, nunca de MIN_BUDGET, y vuelve con frames cortos.
let b = 1;
for (let i = 0; i < 3_000; i++) b = crowdBudget(b, 33);
assert.equal(b, MIN_BUDGET, 'con frames largos el presupuesto no baja al mínimo');
for (let i = 0; i < 100; i++) b = crowdBudget(b, 33);
assert.equal(b, MIN_BUDGET);
for (let i = 0; i < 5_000; i++) b = crowdBudget(b, 16);
assert.equal(b, 1, 'con frames cortos el presupuesto no vuelve');
assert.ok(crowdBudget(1, 20) === 1 && crowdBudget(0.8, 20) === 0.8, 'entre 18 y 22 ms el presupuesto se mueve');
// Con el presupuesto al mínimo, menos gente de paso (y quien trabaja en la calle, igual).
const crowdWith = (budget: number): { walkers: number; acts: number } => {
  const life = new StreetLife(loc, street, seededRng(hashSeed('pc-budget')));
  life.budget = budget;
  life.populate({ day: tuesday, hour: 17, minute: 30 }, PLAYER);
  return { walkers: life.agents.filter((a) => a.kind === 'visitor' && !a.rule?.ambient).length, acts: life.agents.filter((a) => a.act).length };
};
const full = crowdWith(1);
const lean = crowdWith(MIN_BUDGET);
assert.ok(lean.walkers < full.walkers * 0.8, `el presupuesto no recorta (${full.walkers} → ${lean.walkers})`);
assert.equal(lean.acts, full.acts, 'el presupuesto se lleva a quien vende o actúa');
// Gestos: como mucho GESTURE_BUDGET, los más cercanos al centro de la cámara.
const fake = Array.from({ length: 90 }, (_, i) => ({ id: i, x: i % 30, y: Math.floor(i / 30) * 10 }));
const g = gestureSet(fake, 0 * 16 + 8, 0 * 16 + 16)!;
assert.equal(g.size, GESTURE_BUDGET);
assert.ok(g.has(0) && !g.has(89), 'los gestos no van a los de cerca');
assert.equal(gestureSet(fake.slice(0, GESTURE_BUDGET), 0, 0), null, 'con poca gente no hace falta recortar gestos');
// Lo que cuesta la calle en hora punta: muy por debajo de un frame.
const busiest = Math.max(morning.msPerTick, afternoon.msPerTick, evening.msPerTick);
assert.ok(busiest < 4, `la calle cuesta ${busiest.toFixed(2)} ms por tick`);

console.log(`  locales: ${rows.filter((r) => r.kind === 'enterable').length} con interior · pico de gente ${peaks[ID]} (siguiente: ${Math.max(...Object.entries(peaks).filter(([k]) => k !== ID).map(([, v]) => v))})`);
const fmt = (s: Sample): string => [...s.groups].sort((a, z) => z[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${((v / [...s.groups.values()].reduce((x, y) => x + y, 0)) * 100).toFixed(0)} %`).join(', ');
console.log(`  08:30 ${morning.mean.toFixed(1)} personas (${fmt(morning)})`);
console.log(`  16:00 ${afternoon.mean.toFixed(1)} personas (${fmt(afternoon)})`);
console.log(`  21:00 ${evening.mean.toFixed(1)} personas (${fmt(evening)})`);
console.log(`  01:30 sáb ${late.mean.toFixed(1)} personas (${fmt(late)})`);
console.log(`  andén: ${busier} de ${14 * 18} horas un nivel más lleno · presupuesto mínimo: ${full.walkers} → ${lean.walkers} de paso · calle ${busiest.toFixed(2)} ms/tick`);
console.log('check-puerta-central: locales, metro, densidad, horas, venta ambulante, artistas y LOD, OK');
