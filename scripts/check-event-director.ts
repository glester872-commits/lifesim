// SIM-03 · Cómo conviven la lluvia, el partido del Arena y el comercio: cada sistema lee el reloj (systems/Weather,
// systems/Match, systems/Places) con sus propias tablas, sin director central ni estado guardado. Puro, sin Phaser.
import assert from 'node:assert/strict';
import { ARENA_MATCHES, MATCH_PHASES } from '../src/data/cityEvents.ts';
import { DEMAND_BUDGET, MATCH_DESTINATIONS } from '../src/data/metroDemand.ts';
import { POPULATION_PROFILES } from '../src/data/population.ts';
import { STREET_PROFILES, type StreetProfile } from '../src/data/streets.ts';
import { BUDGETS } from '../src/config/budgets.ts';
import { LEVELS } from '../src/config/population.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { hashSeed, seededRng } from '../src/systems/MetroDaily.ts';
import { weekIndex } from '../src/systems/Calendar.ts';
import { demandAt, levelAt, targetAt, type Clock } from '../src/systems/Crowd.ts';
import { isOpen, placeInfo } from '../src/systems/Places.ts';
import { pull, StreetLife, streetCapAt, streetProfileFor, streetTargetAt, weatherBias } from '../src/systems/StreetLife.ts';
import { byPhase, matchLitter, matchMetroShift, matchOn, matchPhase } from '../src/systems/Match.ts';
import { tripsFor } from '../src/systems/MetroDemand.ts';
import { forceWeather, HEAVY_RAIN, weatherAt } from '../src/systems/Weather.ts';

const DAYS = Array.from({ length: 365 }, (_, i) => i + 1);
const RAIN = { rain: 0.9, celsius: 12 } as const;
const DRY = { rain: 0, celsius: 12 } as const;
/** Con el tiempo forzado y siempre restaurado. */
function withWeather<T>(w: Parameters<typeof forceWeather>[0], fn: () => T): T {
  forceWeather(w);
  try {
    return fn();
  } finally {
    forceWeather(null);
  }
}
/** tripsFor memoiza la última hora sin mirar el tiempo: otra hora antes obliga a recalcular. */
const freshTrips = (day: number, hour: number) => {
  tripsFor(day + 1000, hour);
  return tripsFor(day, hour);
};
/** Viajes al estadio (destino en MATCH_DESTINATIONS, la parada 'arena'), sin el fondo perStop ('base'), que no se pondera. */
const toStadium = (day: number, hour: number): number =>
  freshTrips(day, hour).filter((t) => t.profile !== 'base' && MATCH_DESTINATIONS.includes(t.destinationId)).length;

// md: el primer día con partido cuyo día siguiente no lo tiene (md+1 sirve para el salto y la limpieza).
const md = DAYS.find((d) => matchOn(d) && !matchOn(d + 1))!;
assert.ok(md, 'ningún día de partido');
const free = DAYS.find((d) => d > md + 1 && weekIndex(d) === weekIndex(md) && !matchOn(d) && !matchOn(d - 1))!;
assert.ok(free, 'ningún día libre del mismo día de la semana');
const kick = matchOn(md)!.kickoff;
const at = (day: number, rel: number): Clock => {
  const m = kick + rel;
  return { day: day + Math.floor(m / 1440), hour: Math.floor((m % 1440) / 60), minute: m % 60 };
};
const ARRIVAL = -40;
const natural = weatherAt(md + 1, 12);

const arena = streetProfileFor('arena')!;
const loc = getLocation('arena');
const PLAYER = { tx: 28, ty: 26 };
const step = (c: Clock): Clock => {
  const total = c.hour * 60 + c.minute + 1;
  return { day: c.day + Math.floor(total / 1440), hour: Math.floor((total % 1440) / 60), minute: total % 60 };
};
/** `minutes` de calle del Arena desde `start` (como check-arena): pico, aficionados y roles. */
function simulate(start: Clock, seed: string, minutes: number) {
  const street = new StreetLife(loc, arena, seededRng(hashSeed('event-director', seed)));
  let clock = start;
  street.populate(clock, PLAYER);
  let peak = street.agents.length;
  let fans = 0;
  const roles = new Set<string>();
  let elapsed = 0;
  for (let ms = 0; ms < minutes * 500; ms += 100) {
    street.update(100, clock, PLAYER);
    elapsed += 100;
    if (elapsed >= 500) {
      elapsed -= 500;
      clock = step(clock);
    }
    peak = Math.max(peak, street.agents.length);
    for (const a of street.agents) {
      roles.add(a.role);
      if (a.fan) fans++;
    }
  }
  return { peak, fans, roles };
}

// --------------------------------------------------- a) lluvia: la misma hora, seca y con chaparrón
const tue = DAYS.find((d) => weekIndex(d) === 1)!;
const ten: Clock = { day: tue, hour: 10, minute: 0 };
const terraceStreet = STREET_PROFILES.find((p) => p.tableService?.length)!;
const terrace = terraceStreet.trips.find((r) => r.role === 'terrace')!;
const shelter = terraceStreet.trips.find((r) => r.role === 'coffee')!;
assert.ok(terrace && shelter, `${terraceStreet.location}: sin regla de terraza o de café`);
const food = POPULATION_PROFILES.find((p) => {
  const pl = placeInfo(p.place);
  return pl?.tags.includes('food') && isOpen(pl, ten.day, ten.hour, ten.minute);
})!;
assert.ok(food, 'ningún local food abierto a las 10:00');
const foodPlace = placeInfo(food.place)!;
const read = () => ({
  w: weatherAt(ten.day, 10),
  street: streetTargetAt(terraceStreet, ten),
  terrace: weatherBias(terrace, weatherAt(ten.day, 10)),
  shelter: weatherBias(shelter, weatherAt(ten.day, 10)),
  local: targetAt(foodPlace, food, ten),
  trips: freshTrips(ten.day, 10).length,
});
const wet = withWeather(RAIN, read);
const dry = withWeather(DRY, read);
assert.ok(wet.w.rain > HEAVY_RAIN && dry.w.rain === 0, 'el forzado no da chaparrón y seco');
assert.ok(wet.street < dry.street, `${terraceStreet.location}: la lluvia no vacía la calle (${wet.street} frente a ${dry.street})`);
assert.ok(wet.terrace < 1 && wet.terrace <= dry.terrace, `terraza con lluvia: ${wet.terrace}`);
assert.ok(wet.shelter > 1, `ir a cubierto con lluvia: ${wet.shelter}`);
assert.ok(wet.local >= dry.local, `${food.place}: con lluvia menos gente dentro (${wet.local} frente a ${dry.local})`);
assert.ok(wet.trips >= dry.trips, `metro con lluvia: ${wet.trips} frente a ${dry.trips}`);

// --------------------------------------------------- b) partido frente a un día libre (los dos en seco)
const b = withWeather(DRY, () => {
  const arrMd = streetTargetAt(arena, at(md, ARRIVAL));
  const arrFree = streetTargetAt(arena, at(free, ARRIVAL));
  assert.equal(matchPhase(at(md, ARRIVAL)), 'arrival');
  assert.ok(arrMd > arrFree, `la calle del Arena no nota la llegada: ${arrMd} frente a ${arrFree}`);
  assert.ok(matchMetroShift('arena', at(md, 125)) > 0, 'el andén del Arena no nota la salida');
  assert.equal(matchMetroShift('arena', at(free, 125)), 0, 'andén lleno sin partido');

  // Un local con `match` cerrado en una fase: ni nivel, ni gente, ni tirón en la calle.
  let closed: { place: string; c: Clock; note: string } | undefined;
  const withMatch = POPULATION_PROFILES.filter((p) => p.match && placeInfo(p.place)?.hours);
  for (const p of withMatch) {
    const pl = placeInfo(p.place)!;
    for (let m = 0; m < 1440 && !closed; m += 5) {
      const c = { day: md, hour: Math.floor(m / 60), minute: m % 60 };
      if (matchPhase(c) && !isOpen(pl, c.day, c.hour, c.minute)) closed = { place: p.place, c, note: `cerrado en ${matchPhase(c)}` };
    }
    if (closed) break;
  }
  // Ninguno cerrado durante el partido: su hora real de cierre ese día.
  for (const p of withMatch) {
    const pl = placeInfo(p.place)!;
    for (let m = 12 * 60; m < 1440 && !closed; m += 5) {
      const c = { day: md, hour: Math.floor(m / 60), minute: m % 60 };
      if (!isOpen(pl, c.day, c.hour, c.minute)) closed = { place: p.place, c, note: 'sin fase cerrada: hora de cierre' };
    }
    if (closed) break;
  }
  assert.ok(closed, 'ningún local con partido cierra el día del partido');
  const cp = POPULATION_PROFILES.find((p) => p.place === closed!.place)!;
  const cpl = placeInfo(closed.place)!;
  assert.equal(levelAt(cpl, cp, closed.c), null, `${closed.place} cerrado con nivel`);
  assert.equal(targetAt(cpl, cp, closed.c), 0, `${closed.place} cerrado con gente`);
  assert.equal(pull(cpl, closed.c), 0, `${closed.place} cerrado tira de la calle`);
  for (const sp of STREET_PROFILES) {
    for (const d of sp.draws ?? []) if (d.place === closed.place) assert.equal(Math.round(pull(cpl, closed.c) * 3) * d.perLevel, 0);
  }

  // Metro: el partido pesa en sus fases, no todo el día. Antes del build-up, el día del partido no lleva a más gente
  // al estadio que el día libre (tolerancia: los dos días sortean con su semilla). Antes de SIM-03 MetroDemand usaba
  // `matchOn(day) !== null` todo el día y el ocio de la mañana ya iba al estadio ×MATCH_FACTOR.
  assert.ok(toStadium(md, 7) <= toStadium(free, 7), 'a las 07:00 más viajes al estadio el día del partido');
  const buildUp = kick + ARENA_MATCHES.phases['build-up'][0];
  let pre = { md: 0, free: 0, hours: [] as number[] };
  for (let h = 7; h < Math.floor(buildUp / 60); h++) {
    assert.equal(matchPhase({ day: md, hour: h, minute: 30 }), null);
    pre = { md: pre.md + toStadium(md, h), free: pre.free + toStadium(free, h), hours: [...pre.hours, h] };
  }
  assert.ok(pre.md <= pre.free * 1.3 + 6,
    `metro: antes del partido (${pre.hours[0]}–${pre.hours.at(-1)} h) ${pre.md} viajes al estadio frente a ${pre.free} un día libre`);
  // Fases de ida (build-up + arrival, leídas con matchPhase a y media como MetroDemand): más viajes al estadio.
  let arr = { md: 0, free: 0, hours: [] as number[] };
  for (let h = 0; h < 24; h++) {
    const ph = matchPhase({ day: md, hour: h, minute: 30 });
    if (ph !== 'build-up' && ph !== 'arrival') continue;
    arr = { md: arr.md + toStadium(md, h), free: arr.free + toStadium(free, h), hours: [...arr.hours, h] };
  }
  assert.ok(arr.hours.length > 0, 'ninguna hora en build-up/arrival el día del partido');
  assert.ok(arr.md > arr.free,
    `metro: en build-up/arrival (${arr.hours.join(',')} h) ${arr.md} viajes al estadio frente a ${arr.free} un día libre`);
  return { arrMd, arrFree, closed, pre, arr };
});

// --------------------------------------------------- c) comercio: horario y franjas
const shop = POPULATION_PROFILES.find((p) => p.place === 'decathlon-tienda')!;
const shopPlace = placeInfo(shop.place)!;
const plainDay = DAYS.find((d) => weekIndex(d) <= 3 && demandAt(shop, { day: d, hour: 10, minute: 0 }) === 0 && demandAt(shop, { day: d, hour: 18, minute: 0 }) === 0)!;
const low: Clock = { day: plainDay, hour: 10, minute: 0 };
const high: Clock = { day: plainDay, hour: 18, minute: 0 };
const shut: Clock = { day: plainDay, hour: 22, minute: 30 };
assert.ok(isOpen(shopPlace, low.day, low.hour) && isOpen(shopPlace, high.day, high.hour) && !isOpen(shopPlace, shut.day, shut.hour, shut.minute));
const li = LEVELS.indexOf(levelAt(shopPlace, shop, low)!);
const hi = LEVELS.indexOf(levelAt(shopPlace, shop, high)!);
assert.ok(hi > li, `${shop.place}: la franja alta no se nota (${LEVELS[li]} frente a ${LEVELS[hi]})`);
assert.equal(levelAt(shopPlace, shop, shut), null, `${shop.place} cerrado con nivel`);
assert.ok(pull(shopPlace, high) > pull(shopPlace, shut) && pull(shopPlace, shut) === 0, 'cerrado sigue tirando de la calle');

// --------------------------------------------------- d) todo a la vez: chaparrón, llegada al estadio y comercio
const C = at(md, ARRIVAL);
const d = withWeather(RAIN, () => {
  for (const sp of STREET_PROFILES) assert.ok(streetTargetAt(sp, C) <= streetCapAt(sp, C), `${sp.location}: objetivo por encima del tope`);
  for (const p of POPULATION_PROFILES) {
    const pl = placeInfo(p.place);
    if (!pl) continue;
    const lv = levelAt(pl, p, C);
    assert.ok(lv === null || LEVELS.includes(lv), `${p.place}: nivel ${lv}`);
    assert.ok(targetAt(pl, p, C) <= pl.capacity, `${p.place}: más gente que aforo`);
  }
  const trips = freshTrips(C.day, C.hour).length;
  assert.ok(trips <= DEMAND_BUDGET.maxTripsPerBand, `metro: ${trips} viajes`);
  const combined = streetTargetAt(arena, C);
  const cap = streetCapAt(arena, C);
  const plus = byPhase(arena.match, C);
  assert.ok(combined <= cap && cap <= BUDGETS.low.agents, `Arena: ${combined} / tope ${cap} / presupuesto ${BUDGETS.low.agents}`);
  // Por diseño la lluvia recorta la gente de la hora, no el plus del partido (StreetLife.ts:207-210).
  assert.ok(combined >= Math.min(plus, cap), `la lluvia se come el partido: ${combined} < ${plus}`);
  const sim = simulate(C, 'rain-arrival', 10);
  assert.ok(sim.peak <= BUDGETS.low.agents, `pico de ${sim.peak} con lluvia y partido`);
  return { combined, cap, plus, trips, peak: sim.peak };
});
const dryMatch = withWeather(DRY, () => streetTargetAt(arena, C));
assert.ok(d.combined <= dryMatch, `lluvia y partido suman más que el partido en seco: ${d.combined} > ${dryMatch}`);

// --------------------------------------------------- e) determinismo y salto
const snap = (c: Clock) => ({
  phase: matchPhase(c),
  litter: matchLitter('arena', c),
  metro: Object.keys(ARENA_MATCHES.metro).map((s) => matchMetroShift(s, c)),
  weather: weatherAt(c.day, c.hour + c.minute / 60),
  streets: STREET_PROFILES.map((sp: StreetProfile) => [sp.location, streetTargetAt(sp, c), streetCapAt(sp, c)]),
  places: POPULATION_PROFILES.flatMap((p) => {
    const pl = placeInfo(p.place);
    return pl ? [[p.place, levelAt(pl, p, c), targetAt(pl, p, c)]] : [];
  }),
  trips: freshTrips(c.day, c.hour).map((t) => `${t.tripId}>${t.destinationId}`),
});
const first = snap(C);
assert.deepEqual(snap(C), first, 'dos lecturas del mismo reloj difieren');
snap({ day: free, hour: 12, minute: 0 });
assert.deepEqual(snap(C), first, 'leer otro día cambia el resultado');
const noon: Clock = { day: md + 1, hour: 12, minute: 0 };
const direct = snap(noon);
for (let h = 0; h < 24; h++) for (const minute of [0, 30]) snap({ day: md, hour: h, minute });
assert.deepEqual(snap(noon), direct, 'pasar por todas las horas del partido cambia el día siguiente');

// --------------------------------------------------- f) limpieza: el día siguiente, sin rastro
assert.equal(matchPhase(noon), null);
for (const s of Object.keys(ARENA_MATCHES.metro)) assert.equal(matchMetroShift(s, noon), 0, `${s}: andén con partido al día siguiente`);
assert.equal(matchLitter('arena', noon), 1);
const after = simulate(noon, 'next-noon', 5);
assert.ok(after.fans === 0 && [...after.roles].every((r) => !r.startsWith('fan-')), 'aficionados al día siguiente');
assert.deepEqual(weatherAt(md + 1, 12), natural, 'el tiempo forzado no se restauró');

// --------------------------------------------------- g) limpieza al terminar el partido, sin cortes de mapa
// Calle del Arena desde el inicio de arrival hasta el final de after + 4 h, con el reloj corriendo (como check-arena).
// Los aficionados se van solos: las rutas fan-* se filtran por fase (StreetLife.pickRule, metroWaves). Después de after
// aún salen de los bares los últimos clientes con su rol fan-* (Handoff: dueOut → StreetLife.emerge), unas 3,5 h; a las
// 4 h no queda ninguno. Con la fase en null, todo fan-* nuevo viene de un local: emerge lo crea sin regla de viaje
// (newWalker(undefined, …) y el rol copiado del Handoff), un viaje nuevo siempre lleva su `rule`. Sólo puede quedar
// gente con camiseta en un puesto (un rol que no es fan-*).
const G_START = ARENA_MATCHES.phases.arrival[0];
const G_MINUTES = ARENA_MATCHES.phases.after[1] + 240 - G_START;
const g = ['g1', 'g2'].map((seed) => {
  const street = new StreetLife(loc, arena, seededRng(hashSeed('event-director-end', seed)));
  let clock = at(md, G_START);
  street.populate(clock, PLAYER);
  let peak = street.agents.length;
  let elapsed = 0;
  const seen = new Set(street.agents.map((a) => a.id));
  let emerged = 0;
  for (let ms = 0; ms < G_MINUTES * 500; ms += 100) {
    const phase = matchPhase(clock);
    street.update(100, clock, PLAYER);
    for (const a of street.agents) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      if (phase !== null || !a.role.startsWith('fan-')) continue;
      assert.equal(a.rule, undefined,
        `${seed}: viaje fan-* nuevo (${a.role}, id ${a.id}) con la fase en null a las ${clock.hour}:${clock.minute}`);
      emerged++;
    }
    elapsed += 100;
    if (elapsed >= 500) {
      elapsed -= 500;
      clock = step(clock);
    }
    peak = Math.max(peak, street.agents.length);
    const ids = new Set(street.agents.map((a) => a.id));
    assert.equal(ids.size, street.agents.length, `${seed}: ids duplicados a las ${clock.hour}:${clock.minute}`);
  }
  const fanRoles = street.agents.filter((a) => a.role.startsWith('fan-')).length;
  const shirts = street.agents.filter((a) => a.fan && !a.role.startsWith('fan-')).length;
  assert.equal(matchPhase(clock), null, `${seed}: el final de la simulación sigue en fase`);
  assert.equal(fanRoles, 0, `${seed}: ${fanRoles} agentes fan-* 4 h después de after`);
  assert.ok(shirts <= 2, `${seed}: ${shirts} con camiseta y rol que no es fan-* 4 h después de after`);
  assert.ok(peak <= BUDGETS.low.agents, `${seed}: pico de ${peak} en el partido`);
  return { seed, peak, fanRoles, shirts, emerged, left: street.agents.length };
});
// Reconstrucción tras dormir o viajar: escena nueva, StreetLife nuevo y populate el día siguiente a las 13:05.
const rebuilt = ['g1', 'g2'].map((seed) => {
  const c: Clock = { day: md + 1, hour: 13, minute: 5 };
  assert.equal(matchPhase(c), null);
  const street = new StreetLife(loc, arena, seededRng(hashSeed('event-director-rebuild', seed)));
  street.populate(c, PLAYER);
  const n = street.agents.filter((a) => a.fan || a.role.startsWith('fan-')).length;
  assert.equal(n, 0, `${seed}: ${n} aficionados al repoblar el día siguiente a las 13:05`);
  return n;
});

console.log(`director de eventos OK: md ${md} (saque ${Math.floor(kick / 60)}:${String(kick % 60).padStart(2, '0')}), libre ${free}; ` +
  `lluvia calle ${wet.street}/${dry.street}, local ${wet.local}/${dry.local}, metro ${wet.trips}/${dry.trips}; ` +
  `llegada ${b.arrMd}/${b.arrFree}, ${b.closed.place} ${b.closed.note}, estadio antes ${b.pre.md}/${b.pre.free} y en build-up/arrival ${b.arr.md}/${b.arr.free}; ` +
  `combinado ${d.combined}/${d.cap} (plus ${d.plus}, seco ${dryMatch}), pico ${d.peak}/${BUDGETS.low.agents}, ${d.trips} viajes; ` +
  `fin del partido (${G_MINUTES} min) ${g.map((r) => `${r.seed} pico ${r.peak}, fan-* ${r.fanRoles}, salen de bares sin fase ${r.emerged}, camiseta ${r.shirts}, quedan ${r.left}`).join(' / ')}; ` +
  `repoblado ${md + 1} 13:05 aficionados ${rebuilt.join('/')}`);
