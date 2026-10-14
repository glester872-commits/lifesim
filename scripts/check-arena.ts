// Distrito Arena (data/arena.ts) y su día de partido (systems/Match.ts): el estadio, los locales, el calendario y cómo
// cambia el barrio en cada fase, comparado con un día sin partido a la misma hora. Simula la calle de verdad.
import assert from 'node:assert/strict';
import { ARENA_CLUB, ARENA_MATCHES, MATCH_PHASES } from '../src/data/cityEvents.ts';
import { LOCATION_DISTRICT } from '../src/data/districtIdentity.ts';
import { STOPS } from '../src/data/transit.ts';
import { POPULATION_PROFILES } from '../src/data/population.ts';
import { STREET_ACTS } from '../src/data/streetActs.ts';
import { BUDGETS } from '../src/config/budgets.ts';
import { getLocation, isStandable } from '../src/systems/LocationSystem.ts';
import { hashSeed, seededRng } from '../src/systems/MetroDaily.ts';
import { levelAt, type Clock } from '../src/systems/Crowd.ts';
import { placeInfo, placesOfType } from '../src/systems/Places.ts';
import { StreetLife, streetCapAt, streetProfileFor } from '../src/systems/StreetLife.ts';
import { actOn } from '../src/systems/StreetActs.ts';
import { auditVenues } from '../src/systems/VenueAudit.ts';
import { matchLitter, matchMetroShift, matchNow, matchOn, matchPhase, upcomingMatches } from '../src/systems/Match.ts';
import { LEVELS } from '../src/config/population.ts';

const ID = 'arena';
const loc = getLocation(ID);

// --------------------------------------------------- 1. el estadio y el barrio
const rows = auditVenues(ID);
for (const r of rows) assert.deepEqual(r.problems, [], `${r.name}: ${r.problems.join(' | ')}`);
const kinds = (k: string): number => loc.props.filter((p) => p.kind === k).length;
assert.ok(loc.buildings?.some((b) => b.style === 'stadium' && b.w >= 30), 'sin estadio');
assert.ok(kinds('turnstile') >= 10, 'pocos tornos');
assert.ok(kinds('ticket-booth') >= 2 && kinds('food-stall') >= 2 && kinds('scarf-stand') >= 2, 'faltan taquillas o puestos');
assert.ok(kinds('floodlight') >= 4 && kinds('flag-pole') >= 4, 'sin focos ni banderas');
for (let n = 1; n <= 5; n++) assert.ok(loc.points?.[`AR_GATE_${n}`] && loc.points[`AR_Q${n}_01`] && loc.points[`AR_STEWARD_${n}`], `puerta ${n} incompleta`);
const business = placesOfType('business').filter((p) => p.locationId === ID);
for (const tag of ['sport', 'food', 'arena-bar']) assert.ok(business.some((p) => p.tags.includes(tag)), `sin local ${tag}`);
for (const id of ['ar-deportes', 'ar-oficial', 'ar-burger', 'ar-pizza', 'ar-larguero', 'ar-grada', 'ar-cafe']) assert.ok(placeInfo(id), `falta ${id}`);
assert.equal(LOCATION_DISTRICT[ID], ID);
assert.equal(STOPS.find((s) => s.id === ID)?.station, 'arena-station');
assert.ok(getLocation('arena-station').portals.some((p) => p.to.location === ID && p.to.spawn === 'ar-metro'), 'la estación no sale a la boca');
// Ficticio: ni el nombre ni la ciudad de ningún club de verdad.
assert.ok(!/real madrid|atl[eé]tico|rayo|getafe|legan[eé]s/i.test(JSON.stringify(ARENA_CLUB)), 'el club se parece a uno de verdad');

// --------------------------------------------------- 2. el calendario
let matches = 0;
for (let d = 1; d <= 84; d++) {
  const m = matchOn(d);
  assert.deepEqual(m, matchOn(d), 'el partido no es determinista');
  if (!m) continue;
  matches++;
  assert.ok(ARENA_MATCHES.kickoffs.includes(m.kickoff) && ARENA_CLUB.rivals.includes(m.rival));
}
assert.ok(matches >= 15 && matches <= 45, `partidos en 12 semanas: ${matches}`);
assert.equal(upcomingMatches(1, 84).length, matches);
const md = Array.from({ length: 84 }, (_, i) => i + 1).find((d) => matchOn(d) && !matchOn(d - 1) && !matchOn(d + 1))!;
const free = Array.from({ length: 84 }, (_, i) => i + 1).find((d) => d > md + 1 && !matchOn(d) && !matchOn(d - 1))!;
const kick = matchOn(md)!.kickoff;
const at = (day: number, rel: number): Clock => {
  const m = kick + rel;
  return { day: day + Math.floor(m / 1440), hour: Math.floor((m % 1440) / 60), minute: m % 60 };
};
const REL: Record<(typeof MATCH_PHASES)[number], number> = { 'build-up': -150, arrival: -40, live: 50, leaving: 125, after: 190 };
for (const ph of MATCH_PHASES) {
  assert.equal(matchPhase(at(md, REL[ph])), ph, `fase ${ph}`);
  assert.equal(matchPhase(at(free, REL[ph])), null, 'partido en un día sin partido');
}
assert.equal(matchNow(at(md, 0))?.kickoff, kick);

// --------------------------------------------------- 3. transporte, basura, venta ambulante y bares
assert.ok(matchMetroShift('arena', at(md, REL.leaving)) >= 2 && matchMetroShift('arena', at(free, REL.leaving)) === 0, 'el metro del Arena no nota la salida');
assert.ok(matchMetroShift('puerta-central', at(md, REL.arrival)) > 0, 'el intercambiador no nota el partido');
assert.equal(matchMetroShift('vallesco', at(md, REL.leaving)), 0, 'el partido llena paradas que no son suyas');
assert.ok(matchLitter('arena', at(md, REL.leaving)) > 2 && matchLitter('arena', at(free, REL.leaving)) === 1, 'la basura no sube tras el partido');
assert.equal(matchLitter('vallesco', at(md, REL.leaving)), 1);
const dry = { rain: 0 };
for (const act of STREET_ACTS.filter((a) => a.location === ID)) {
  assert.ok(act.match, `${act.id}: venta ambulante fuera del partido`);
  assert.ok(!actOn(act, at(free, REL['build-up']), dry), `${act.id} sin partido`);
}
assert.ok(STREET_ACTS.some((a) => a.location === ID && actOn(a, at(md, REL['build-up']), dry)), 'sin puestos antes del partido');
const bar = POPULATION_PROFILES.find((p) => p.place === 'ar-larguero')!;
const lvl = (c: Clock): number => LEVELS.indexOf(levelAt(placeInfo('ar-larguero')!, bar, c)!);
assert.ok(lvl(at(md, REL['build-up'])) > lvl(at(free, REL['build-up'])), 'el bar no se llena antes del partido');
assert.ok(lvl(at(md, REL.after)) > lvl(at(free, REL.after)), 'el bar no se llena después del partido');

// --------------------------------------------------- 4. la calle, simulada: normal frente a partido
const profile = streetProfileFor(ID)!;
const STEP_MS = 100;
const MS_PER_MIN = 500;
const PLAYER = { tx: 28, ty: 26 };
const step = (c: Clock): Clock => {
  const total = c.hour * 60 + c.minute + 1;
  return { day: c.day + Math.floor(total / 1440), hour: Math.floor((total % 1440) / 60), minute: total % 60 };
};
/** Media hora de calle desde `start`: gente media, pico, aficionados, uniformes y papeles. */
function sample(start: Clock, seed: string) {
  const street = new StreetLife(loc, profile, seededRng(hashSeed('arena', seed)));
  let clock = start;
  street.populate(clock, PLAYER);
  let sum = 0;
  let n = 0;
  let peak = 0;
  let fans = 0;
  let people = 0;
  let nearGates = 0;
  const roles = new Set<string>();
  const uniforms = new Set<string>();
  let elapsed = 0;
  for (let ms = 0; ms < 30 * MS_PER_MIN; ms += STEP_MS) {
    street.update(STEP_MS, clock, PLAYER);
    elapsed += STEP_MS;
    if (elapsed >= MS_PER_MIN) {
      elapsed -= MS_PER_MIN;
      clock = step(clock);
      sum += street.agents.length;
      n++;
      peak = Math.max(peak, street.agents.length);
      nearGates += street.agents.filter((a) => a.y >= 16 && a.y <= 21).length;
    }
    for (const a of street.agents) {
      roles.add(a.role);
      if (a.uniform) uniforms.add(a.uniform);
      if (a.kind === 'visitor' && !a.uniform) {
        people++;
        if (a.fan) fans++;
      }
      assert.ok(isStandable(loc, Math.round(a.x), Math.round(a.y)), `${a.role} dentro de algo en ${Math.round(a.x)},${Math.round(a.y)}`);
    }
  }
  assert.equal(street.pathFailures, 0, `rutas no encontradas (${seed})`);
  return { mean: sum / n, peak, fanShare: people ? fans / people : 0, roles, uniforms, plaza: nearGates / n };
}

const normal = Object.fromEntries(MATCH_PHASES.map((ph) => [ph, sample(at(free, REL[ph]), `n-${ph}`)])) as Record<string, ReturnType<typeof sample>>;
const match = Object.fromEntries(MATCH_PHASES.map((ph) => [ph, sample(at(md, REL[ph]), `m-${ph}`)])) as Record<string, ReturnType<typeof sample>>;
const f = (x: number): string => x.toFixed(1);
console.log('fase        normal  partido  pico  aficionados  explanada');
for (const ph of MATCH_PHASES) console.log(`${ph.padEnd(10)}  ${f(normal[ph].mean).padStart(6)}  ${f(match[ph].mean).padStart(7)}  ${String(match[ph].peak).padStart(4)}  ${(match[ph].fanShare * 100).toFixed(0).padStart(10)} %  ${f(match[ph].plaza).padStart(9)}`);

// Un día normal es tranquilo; el de partido, no.
assert.ok(normal.arrival.mean < 30, `un día normal ya está lleno: ${f(normal.arrival.mean)}`);
assert.ok(match.arrival.mean > normal.arrival.mean * 1.8, `la llegada no se nota: ${f(match.arrival.mean)} frente a ${f(normal.arrival.mean)}`);
assert.ok(match.leaving.mean > normal.leaving.mean * 1.8, `la salida no se nota: ${f(match.leaving.mean)} frente a ${f(normal.leaving.mean)}`);
assert.ok(match.live.mean < match.arrival.mean * 0.6 && match.live.mean < match.leaving.mean * 0.6, 'durante el partido la calle sigue llena');
assert.ok(match.arrival.plaza > normal.arrival.plaza * 2, 'la explanada no se llena a la llegada');
// La afición viste los colores; el resto del barrio, no.
for (const ph of ['build-up', 'arrival', 'leaving'] as const) assert.ok(match[ph].fanShare > 0.4, `pocos con la camiseta en ${ph}`);
for (const ph of MATCH_PHASES) assert.equal(normal[ph].fanShare, 0, `aficionados sin partido (${ph})`);
// Seguridad: policía y personal de los tornos sólo en día de partido.
assert.ok(match.arrival.uniforms.has('uniforme-seguridad') && match.arrival.uniforms.has('uniforme-policia'), 'sin seguridad a la llegada');
for (const ph of MATCH_PHASES) assert.ok(!normal[ph].uniforms.has('uniforme-policia') && !normal[ph].uniforms.has('uniforme-seguridad'), `seguridad de partido sin partido (${ph})`);
for (const r of ['fan-direct', 'fan-queue']) assert.ok(match.arrival.roles.has(r), `sin ${r} a la llegada`);
for (const r of ['fan-exit', 'fan-metro-queue']) assert.ok(match.leaving.roles.has(r), `sin ${r} a la salida`);
assert.ok([...normal.arrival.roles].every((r) => !r.startsWith('fan-')), 'viajes de partido sin partido');

// --------------------------------------------------- 5. presupuesto: el pico del partido cabe en la calidad más baja
const cap = Math.max(...MATCH_PHASES.map((ph) => streetCapAt(profile, at(md, REL[ph]))));
assert.ok(cap <= BUDGETS.low.agents, `tope de partido ${cap} por encima del presupuesto bajo (${BUDGETS.low.agents})`);
for (const ph of MATCH_PHASES) assert.ok(match[ph].peak <= BUDGETS.low.agents, `pico de ${match[ph].peak} en ${ph}`);

console.log(`check-arena: ok — ${matches} partidos en 12 semanas, tope ${cap} paseantes (presupuesto bajo ${BUDGETS.low.agents})`);
