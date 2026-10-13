// Velaria (data/velaria.ts, data/velariaVenues.ts) con los mismos sistemas que el juego, sin Phaser: cada local con
// fachada se entra, tiene horario y gente; están los doce negocios del barrio, el hotel con su recepción y sus huéspedes;
// el metro llega sin cambiar los trayectos de antes; las tres zonas tienen su carácter; la calle tiene compradores,
// oficinistas, turistas, huéspedes, porteros y gente que trabaja; el tráfico lleva más berlinas, taxis y VTC que el de
// Cuatro Ríos sin ser todo lujo; la ropa tira a oficina y sastrería sin dejar de ser variada; y los cuatro eventos raros
// existen, caen pocas veces y nunca dos a la vez. `node scripts/check-velaria.ts`.
import assert from 'node:assert/strict';
import { VEHICLES } from '../src/data/vehicles.ts';
import { LINES, STOPS } from '../src/data/transit.ts';
import { DISTRICTS } from '../src/data/districts.ts';
import { DISTRICT_IDENTITIES, LOCATION_DISTRICT } from '../src/data/districtIdentity.ts';
import { ZONES } from '../src/data/zones.ts';
import { POPUPS } from '../src/data/popups.ts';
import { POPULATION_PROFILES } from '../src/data/population.ts';
import { AMBIENT_ACTIONS } from '../src/data/ambientActions.ts';
import { withDistrictLanes } from '../src/systems/Districts.ts';
import { getLocation, isStandable } from '../src/systems/LocationSystem.ts';
import { hashSeed, seededRng, weekday } from '../src/systems/MetroDaily.ts';
import { placesOfType } from '../src/systems/Places.ts';
import { upcoming } from '../src/systems/PopUps.ts';
import { StreetLife, streetProfileFor } from '../src/systems/StreetLife.ts';
import { Traffic } from '../src/systems/Traffic.ts';
import { auditVenues } from '../src/systems/VenueAudit.ts';
import type { Clock } from '../src/systems/Crowd.ts';

const ID = 'velaria';
const loc = getLocation(ID);

// --------------------------------------------------- 1. los doce negocios: todos se entran, con horario y gente
const rows = auditVenues(ID);
for (const r of rows) assert.deepEqual(r.problems, [], `${r.name}: ${r.problems.join(' | ')}`);
assert.ok(rows.filter((r) => r.kind === 'enterable').every((r) => r.population), 'local sin gente dentro');
const styles = new Set((loc.buildings ?? []).map((b) => b.style));
for (const s of ['boutique', 'jewel', 'hotel', 'gallery', 'gourmet', 'fine', 'clinic', 'salon', 'gym', 'wine', 'cafe', 'metro', 'res-noble'] as const) {
  assert.ok(styles.has(s), `falta un ${s} en Velaria`);
}
const business = placesOfType('business').filter((p) => p.locationId === ID).map((p) => p.id);
for (const id of ['vl-ferrant', 'vl-brisa', 'vl-oriol', 'kaizen', 'vl-alma', 'vl-vinoteca', 'vl-hotel', 'vl-galeria', 'vl-gym', 'vl-clinica', 'vl-lis', 'vl-gourmet']) {
  assert.ok(business.includes(id), `falta el negocio ${id}`);
}
// No todo es inaccesible: se compra ropa y comida, se corta el pelo, se come, se toma café y vino.
const profile = (place: string) => POPULATION_PROFILES.find((p) => p.place === place)!;
for (const place of ['vl-alma', 'vl-vinoteca', 'kaizen']) assert.ok(profile(place).tableService, `${place} sin servicio de mesa`);
assert.ok(getLocation('vl-ferrant').racks?.length && getLocation('vl-brisa').racks?.length, 'las casas de moda sin percheros');
assert.ok(getLocation('vl-gourmet').terminals?.length && getLocation('vl-hotel').terminals?.length, 'sin caja en el gourmet o el bar del hotel');
// Las casas de lujo: se mira, se prueba y se paga; quien atiende está en su puesto o en la sala, nunca en la calle.
for (const place of ['vl-ferrant', 'vl-brisa', 'vl-oriol']) {
  const states = profile(place).visitors.flatMap((v) => v.plan.map((s) => s.state));
  for (const s of ['BROWSE', 'TRY', 'CHECKOUT']) assert.ok(states.includes(s), `${place}: nadie hace ${s}`);
  const inside = getLocation(place).points ?? {};
  for (const st of profile(place).staff) for (const pre of st.points) assert.ok(Object.keys(inside).some((k) => k.startsWith(pre)), `${place}: el puesto ${pre} no existe dentro`);
}
// El hotel: recepción, botones y bar; huéspedes que llegan y se van, reuniones; la maleta en la mano.
const hotel = profile('vl-hotel');
for (const s of ['receptionist', 'shop-worker', 'bartender']) assert.ok(hotel.staff.some((x) => x.service === s), `hotel sin ${s}`);
for (const r of ['hotel-guest', 'hotel-checkout', 'meeting']) assert.ok(hotel.visitors.some((v) => v.role === r), `hotel sin ${r}`);
assert.ok(getLocation('vl-hotel').props.some((p) => p.kind === 'luggage-cart'), 'hotel sin carros de equipaje');
assert.ok(getLocation('vl-hotel').points?.HOTEL_LIFTS && getLocation('vl-hotel').points?.HOTEL_EVENTS, 'hotel sin sitio para habitaciones y eventos');
assert.ok(AMBIENT_ACTIONS.some((a) => a.id === 'luggage' && a.roles?.['hotel-guest']), 'los huéspedes sin maleta');
// Residencial: portales nobles, con su portero.
const homes = placesOfType('residence').filter((p) => p.locationId === ID);
assert.ok(homes.length >= 8, `pocos portales (${homes.length})`);

// --------------------------------------------------- 2. el metro: la cabecera nueva, y los trayectos de antes, iguales
assert.equal(LOCATION_DISTRICT[ID], ID);
assert.equal(LOCATION_DISTRICT['velaria-station'], ID);
const stop = (id: string) => STOPS.find((s) => s.id === id)!;
const minutes = (a: string, b: string): number => Math.abs(stop(a).order - stop(b).order) * LINES[0].minutesPerStop;
assert.equal(stop(ID).station, 'velaria-station');
assert.equal(minutes('cuatro-rios', 'vallesco'), LINES[0].minutesPerStop, 'cambió Cuatro Ríos → Vallesco');
assert.equal(minutes('vallesco', 'ribera'), LINES[0].minutesPerStop, 'cambió Vallesco → Ribera');
assert.equal(minutes(ID, 'cuatro-rios'), LINES[0].minutesPerStop);
assert.ok(getLocation('velaria-station').portals.some((p) => p.to.location === ID && p.to.spawn === 'vl-metro'), 'la estación no sale a la plaza');

// --------------------------------------------------- 3. las tres zonas y el carácter del barrio
const zones = ZONES.filter((z) => z.location === ID);
for (const name of ['Avenida Dorada', 'Plaza Aurelia', 'Calle Marqués']) assert.ok(zones.some((z) => z.name === name), `falta la zona ${name}`);
assert.ok(zones.every((z) => z.districtId === ID));
const V = DISTRICT_IDENTITIES.velaria;
const C = DISTRICT_IDENTITIES['cuatro-rios'];
assert.ok(V.security > C.security && V.events < C.events && V.traffic.deliveries < C.traffic.deliveries, 'Velaria no es más tranquila ni más vigilada que Cuatro Ríos');

// --------------------------------------------------- 4. la ropa: más oficina y sastrería, sin uniformar
const P = DISTRICTS.premium;
const D = DISTRICTS.dense;
const share = (crowd: Readonly<Partial<Record<string, number>>>, k: string): number => (crowd[k] ?? 0) / Object.values(crowd).reduce((a, b) => a + (b ?? 0), 0);
assert.ok(share(P.crowd, 'smart') > share(D.crowd, 'smart') * 2, 'la gente de Velaria no viste más de oficina');
assert.ok(share(P.crowd, 'smart') < 0.6, 'en Velaria todos van de traje');
for (const f of ['luxury', 'office', 'formal', 'designer'] as const) assert.ok((P.fashion?.[f] ?? 1) > 1, `la moda ${f} no pesa más en Velaria`);
assert.ok(Object.keys(P.crowd).length >= 4, 'en Velaria sólo se ve un estilo de ropa');

// --------------------------------------------------- 5. la calle: quién pasa por la mañana y por la tarde
const street = streetProfileFor(ID)!;
const roleSet = new Set(street.trips.map((t) => t.role));
for (const r of ['shopper', 'office', 'tourist', 'returning', 'hotel-guest', 'hotel-checkout', 'shift-shop', 'shift-kitchen', 'courier', 'doorman', 'terrace']) {
  assert.ok(roleSet.has(r), `nadie en la calle hace ${r}`);
}
const STEP_MS = 100;
const MS_PER_MIN = 500;
const PLAYER = { tx: 0, ty: 0 };
let tuesday = 1;
while (weekday(tuesday) !== 'martes') tuesday++;
const addMinutes = (c: Clock, m: number): Clock => {
  const total = c.hour * 60 + c.minute + m;
  return { day: c.day + Math.floor(total / 1440), hour: Math.floor((total % 1440) / 60), minute: total % 60 };
};
function sample(hour: number, seed: number): { mean: number; roles: Set<string> } {
  const life = new StreetLife(loc, street, seededRng(hashSeed(`vl-${seed}`)));
  let clock: Clock = { day: tuesday, hour: Math.floor(hour), minute: Math.round((hour % 1) * 60) };
  life.populate(clock, PLAYER);
  const roles = new Set<string>();
  let sum = 0;
  let n = 0;
  let elapsed = 0;
  for (let ms = 0; ms < 30 * MS_PER_MIN; ms += STEP_MS) {
    life.update(STEP_MS, clock, PLAYER);
    elapsed += STEP_MS;
    if (elapsed >= MS_PER_MIN) {
      elapsed -= MS_PER_MIN;
      clock = addMinutes(clock, 1);
      sum += life.agents.length;
      n++;
    }
    for (const a of life.agents) {
      roles.add(a.role);
      assert.ok(isStandable(loc, Math.round(a.x), Math.round(a.y)), `${a.role} dentro de algo en ${Math.round(a.x)},${Math.round(a.y)}`);
    }
  }
  assert.equal(life.pathFailures, 0, `rutas no encontradas a las ${hour}`);
  return { mean: sum / n, roles };
}
const morning = sample(8.5, 1);
const afternoon = sample(18.5, 2);
const lateNight = sample(1, 3);
assert.ok(morning.roles.has('office'), 'sin oficinistas por la mañana');
assert.ok(['shopper', 'window-shopper'].some((r) => afternoon.roles.has(r)), 'sin compras por la tarde');
assert.ok(lateNight.mean < afternoon.mean, 'de madrugada hay más gente que por la tarde');

// --------------------------------------------------- 6. tráfico: más berlinas, taxis y VTC que en Cuatro Ríos, sin ser todo lujo
function traffic(id: string): Map<string, number> {
  const where = getLocation(id);
  const t = new Traffic(withDistrictLanes(where, where.traffic!), VEHICLES, [], where.ground[0].length * 16, seededRng(11));
  const seen = new Set<number>();
  const by = new Map<string, number>();
  for (let min = 9 * 60; min < 21 * 60; min++) {
    for (let s = 0; s < 4; s++) t.update(250, { day: tuesday, minuteOfDay: min }, []);
    for (const v of t.vehicles) {
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      by.set(v.type.id, (by.get(v.type.id) ?? 0) + 1);
    }
  }
  return by;
}
const total = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0);
const posh = (m: Map<string, number>): number => ['premium', 'vtc'].reduce((s, k) => s + (m.get(k) ?? 0), 0) / total(m);
const vlCars = traffic(ID);
const crCars = traffic('cuatro-rios');
assert.ok(posh(vlCars) > posh(crCars) * 2, `pocos coches de lujo en Velaria: ${(posh(vlCars) * 100).toFixed(0)} % frente a ${(posh(crCars) * 100).toFixed(0)} %`);
assert.ok(posh(vlCars) < 0.5, `en Velaria todo es de lujo: ${(posh(vlCars) * 100).toFixed(0)} %`);
assert.ok(vlCars.has('vtc') && !crCars.has('vtc'), 'el VTC tiene que salir sólo donde se pide');
assert.ok(['taxi', 'taxi-wagon', 'taxi-suv', 'taxi-hybrid'].some((t) => vlCars.has(t)), 'sin taxis en la avenida del hotel');
assert.ok(total(vlCars) < total(crCars), 'Velaria con más tráfico que Cuatro Ríos');

// --------------------------------------------------- 7. eventos raros: cuatro, en Velaria, nunca dos a la vez
const ours = POPUPS.filter((p) => p.location === ID);
for (const id of ['vl-gallery-opening', 'vl-fashion-popup', 'vl-boutique-launch', 'vl-hotel-event']) assert.ok(ours.some((p) => p.id === id), `falta el evento ${id}`);
assert.ok(ours.every((p) => p.chance <= 0.15), 'un evento de Velaria que no es raro');
assert.ok(ours.every((p) => street.trips.some((t) => t.popup === p.id)), 'un evento sin gente que vaya');
const year = upcoming(ID, 1, 364);
assert.ok(year.length > 0 && year.length < 52, `eventos en un año: ${year.length}`);
const fmt = (m: Map<string, number>): string => [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
console.log(`  locales: ${rows.filter((r) => r.kind === 'enterable').length} con interior, ${homes.length} portales`);
console.log(`  gente en la calle (media): 08:30 ${morning.mean.toFixed(1)} · 18:30 ${afternoon.mean.toFixed(1)} · 01:00 ${lateNight.mean.toFixed(1)}`);
console.log(`  coches 9–21: Velaria ${total(vlCars)} (${(posh(vlCars) * 100).toFixed(0)} % berlina premium o VTC) · Cuatro Ríos ${total(crCars)} (${(posh(crCars) * 100).toFixed(0)} %)`);
console.log(`  Velaria 9–21: ${fmt(vlCars)}`);
console.log(`  eventos en un año: ${year.length} (${[...new Set(year.map((e) => e.id))].join(', ')})`);
console.log('check-velaria: negocios, hotel, compras, metro, zonas, ropa, calle, tráfico y eventos, OK');
