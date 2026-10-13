// Cuatro Ríos (data/cuatroRios.ts, data/cuatroRiosVenues.ts) con los mismos sistemas que el juego, sin Phaser:
// cada local con fachada se entra, tiene horario y gente; están los comercios del barrio; el metro llega sin cambiar los
// trayectos de antes; la calle se llena en las dos horas punta (7:30–9:30 y 17:00–20:00) más que a media mañana y de
// noche; y la avenida lleva coches, furgonetas, camiones, autobús, bicis y repartidores. `node scripts/check-cuatro-rios.ts`.
import assert from 'node:assert/strict';
import { BIKES } from '../src/data/bikes.ts';
import { LINES, STOPS } from '../src/data/transit.ts';
import { VEHICLES } from '../src/data/vehicles.ts';
import { DISTRICT_IDENTITIES, LOCATION_DISTRICT } from '../src/data/districtIdentity.ts';
import { withDistrictLanes } from '../src/systems/Districts.ts';
import { getLocation, isStandable } from '../src/systems/LocationSystem.ts';
import { hashSeed, seededRng, weekday } from '../src/systems/MetroDaily.ts';
import { placesOfType } from '../src/systems/Places.ts';
import { StreetLife, streetProfileFor } from '../src/systems/StreetLife.ts';
import { Traffic } from '../src/systems/Traffic.ts';
import { auditVenues } from '../src/systems/VenueAudit.ts';
import type { Clock } from '../src/systems/Crowd.ts';

const ID = 'cuatro-rios';
const loc = getLocation(ID);

// --------------------------------------------------- 1. locales: todos se entran, con horario y gente (como la Ribera)
const rows = auditVenues(ID);
for (const r of rows) assert.deepEqual(r.problems, [], `${r.name}: ${r.problems.join(' | ')}`);
const styles = new Set((loc.buildings ?? []).map((b) => b.style));
for (const s of ['super', 'fruit', 'bakery', 'restaurant', 'hair', 'phone', 'gym', 'pharmacy', 'grocer', 'fashion', 'streetwear', 'arcade', 'metro'] as const) {
  assert.ok(styles.has(s), `falta un ${s} en Cuatro Ríos`);
}
const business = placesOfType('business').filter((p) => p.locationId === ID);
assert.ok(business.filter((p) => p.tags.includes('food') && p.tags.includes('social')).length >= 3, 'menos de tres sitios para comer');
assert.ok(business.filter((p) => p.tags.includes('fashion')).length >= 2, 'menos de dos tiendas de ropa');
assert.ok(rows.filter((r) => r.kind === 'enterable').every((r) => r.population), 'local sin gente dentro');
// El salón es el mismo sistema que el de la Ribera: sus máquinas, con las mismas actividades.
const arcade = getLocation('cr-arcade');
assert.deepEqual(arcade.spots?.map((s) => s.activities[0]).sort(), ['arcade-claw', 'arcade-fight', 'arcade-race', 'arcade-rhythm']);
assert.deepEqual(getLocation('arcade').spots, arcade.spots, 'el salón de Cuatro Ríos no es el de siempre');
// Residencial: muchos portales, con su isla de contenedores (systems/Dressing).
const homes = placesOfType('residence').filter((p) => p.locationId === ID);
assert.ok(homes.length >= 8, `pocos portales (${homes.length})`);
const kinds = (k: string): number => loc.props.filter((p) => p.kind === k).length;
assert.ok(kinds('container') >= 8, `pocos contenedores (${kinds('container')})`);
assert.ok(kinds('utility-box') >= 2, 'sin armarios de la luz');
assert.equal(loc.signals?.length, 2, 'el cruce sin sus dos semáforos');
assert.ok(loc.props.some((p) => p.kind === 'bus-stop'), 'sin parada de autobús');

// --------------------------------------------------- 2. el metro: parada nueva y los trayectos de antes, iguales
assert.equal(LOCATION_DISTRICT[ID], ID);
assert.equal(LOCATION_DISTRICT['cuatro-rios-station'], ID);
const stop = (id: string) => STOPS.find((s) => s.id === id)!;
const minutes = (a: string, b: string): number => Math.abs(stop(a).order - stop(b).order) * LINES[0].minutesPerStop;
assert.equal(stop(ID).station, 'cuatro-rios-station');
assert.equal(minutes('vallesco', 'ribera'), LINES[0].minutesPerStop, 'cambió Vallesco → Ribera');
assert.equal(minutes('ribera', 'decathlon'), LINES[0].minutesPerStop, 'cambió Ribera → Decathlon');
assert.equal(minutes(ID, 'vallesco'), LINES[0].minutesPerStop);
assert.ok(getLocation('cuatro-rios-station').portals.some((p) => p.to.location === ID && p.to.spawn === 'cr-metro'), 'la estación no sale a la boca');

// --------------------------------------------------- 3. la calle: hora punta
const profile = streetProfileFor(ID)!;
const STEP_MS = 100;
const MS_PER_MIN = 500;
const PLAYER = { tx: 0, ty: 0 };
let tuesday = 1;
while (weekday(tuesday) !== 'martes') tuesday++;
const addMinutes = (c: Clock, m: number): Clock => {
  const total = c.hour * 60 + c.minute + m;
  return { day: c.day + Math.floor(total / 1440), hour: Math.floor((total % 1440) / 60), minute: total % 60 };
};

/** Media de gente en la calle durante media hora desde `hour`, y los papeles que se ven. */
function sample(hour: number, seed: number): { mean: number; roles: Set<string>; nearMetro: number } {
  const street = new StreetLife(loc, profile, seededRng(hashSeed(`cr-${seed}`)));
  let clock: Clock = { day: tuesday, hour: Math.floor(hour), minute: Math.round((hour % 1) * 60) };
  street.populate(clock, PLAYER);
  const roles = new Set<string>();
  let sum = 0;
  let n = 0;
  let nearMetro = 0;
  let elapsed = 0;
  for (let ms = 0; ms < 30 * MS_PER_MIN; ms += STEP_MS) {
    street.update(STEP_MS, clock, PLAYER);
    elapsed += STEP_MS;
    if (elapsed >= MS_PER_MIN) {
      elapsed -= MS_PER_MIN;
      clock = addMinutes(clock, 1);
      sum += street.agents.length;
      n++;
      nearMetro += street.agents.filter((a) => a.x >= 2 && a.x <= 12 && a.y >= 16 && a.y <= 23).length;
    }
    for (const a of street.agents) {
      roles.add(a.role);
      assert.ok(isStandable(loc, Math.round(a.x), Math.round(a.y)), `${a.role} dentro de algo en ${Math.round(a.x)},${Math.round(a.y)}`);
    }
  }
  assert.equal(street.pathFailures, 0, `rutas no encontradas a las ${hour}`);
  return { mean: sum / n, roles, nearMetro: nearMetro / n };
}
const morning = sample(8, 1);
const midMorning = sample(10.5, 2);
const evening = sample(18, 3);
const night = sample(23.5, 4);
assert.ok(morning.mean > midMorning.mean * 1.25, `la hora punta de la mañana no se nota: ${morning.mean.toFixed(1)} frente a ${midMorning.mean.toFixed(1)}`);
assert.ok(evening.mean > midMorning.mean * 1.25, `la de la tarde no se nota: ${evening.mean.toFixed(1)} frente a ${midMorning.mean.toFixed(1)}`);
assert.ok(night.mean < midMorning.mean, 'de noche hay más gente que a media mañana');
assert.ok(morning.nearMetro > midMorning.nearMetro * 1.3, `el metro no se llena en hora punta: ${morning.nearMetro.toFixed(1)} frente a ${midMorning.nearMetro.toFixed(1)}`);
for (const r of ['commuter', 'commuter-student', 'metro-arrival']) assert.ok(morning.roles.has(r), `sin ${r} por la mañana`);
for (const r of ['returning', 'shopper']) assert.ok(evening.roles.has(r), `sin ${r} por la tarde`);

// --------------------------------------------------- 4. tráfico: más y de todo, en hora punta más
function traffic(flowOf: 'cars' | 'bikes', fromMin: number, toMin: number): Map<string, number> {
  const flow = flowOf === 'cars' ? loc.traffic! : loc.traffic!.bikes!;
  const t = new Traffic(withDistrictLanes(loc, flow), flowOf === 'cars' ? VEHICLES : BIKES, [], loc.ground[0].length * 16, seededRng(7));
  const seen = new Set<number>();
  const by = new Map<string, number>();
  for (let min = fromMin - 20; min < toMin; min++) {
    for (let s = 0; s < 4; s++) t.update(250, { day: tuesday, minuteOfDay: min }, []);
    if (min < fromMin) continue;
    for (const v of t.vehicles) {
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      by.set(v.type.id, (by.get(v.type.id) ?? 0) + 1);
    }
  }
  return by;
}
const sum = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0);
const rushCars = traffic('cars', 7.5 * 60, 9.5 * 60);
const midCars = traffic('cars', 10.5 * 60, 12.5 * 60);
const dayCars = traffic('cars', 6 * 60, 22 * 60);
for (const id of ['van', 'bus']) assert.ok(dayCars.has(id), `no pasa ningún ${id}`);
assert.ok(['small-truck', 'delivery-truck'].some((id) => dayCars.has(id)), 'no pasa ningún camión');
assert.ok(sum(rushCars) > sum(midCars), `el tráfico de hora punta (${sum(rushCars)}) no supera al de media mañana (${sum(midCars)})`);
const dayBikes = traffic('bikes', 6 * 60, 22 * 60);
assert.ok(sum(dayBikes) > 20, `pocas bicis (${sum(dayBikes)})`);
assert.ok(dayBikes.has('courier'), 'sin repartidores en bici');
// Frente a Velaria (premium, aún sin mapa): más coches, más repartos, menos vigilancia.
const V = DISTRICT_IDENTITIES.velaria;
const C = DISTRICT_IDENTITIES[ID];
assert.ok(C.traffic.vehicles > V.traffic.vehicles && C.traffic.deliveries > V.traffic.deliveries && C.security < V.security);

const fmt = (m: Map<string, number>): string => [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
console.log(`  locales: ${rows.filter((r) => r.kind === 'enterable').length} con interior, ${homes.length} portales, ${kinds('container')} contenedores`);
console.log(`  gente en la calle (media): 08:00 ${morning.mean.toFixed(1)} · 10:30 ${midMorning.mean.toFixed(1)} · 18:00 ${evening.mean.toFixed(1)} · 23:30 ${night.mean.toFixed(1)}; en la plaza del metro 08:00 ${morning.nearMetro.toFixed(1)} frente a 10:30 ${midMorning.nearMetro.toFixed(1)}`);
console.log(`  coches 7:30–9:30: ${sum(rushCars)} · 10:30–12:30: ${sum(midCars)} · de 6 a 22: ${fmt(dayCars)}`);
console.log(`  bicis de 6 a 22: ${fmt(dayBikes)}`);
console.log('check-cuatro-rios: locales completos, metro, hora punta en calle, metro y tráfico, OK');
