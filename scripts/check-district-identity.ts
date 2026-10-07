// La identidad de cada barrio (data/districtIdentity.ts): leída por la afluencia de las zonas, a qué viajes tira la gente,
// el tráfico de cada carril, la vigilancia del metro y los sucesos. Tres sitios a la misma hora se comportan distinto,
// y el resto de sistemas no se rompe. `node scripts/check-district-identity.ts`.
// (Llamado desde la cadena `check` de package.json; ningún otro script comprueba esto; no lee más datos que los del juego.)
import assert from 'node:assert/strict';
import { DISTRICT_IDENTITIES, LOCATION_DISTRICT, ROLE_GROUPS, roleGroupOf, type DistrictIdentity, type RoleGroup } from '../src/data/districtIdentity.ts';
import { STREET_PROFILES } from '../src/data/streets.ts';
import { ZONES } from '../src/data/zones.ts';
import { weekdayOf } from '../src/systems/Calendar.ts';
import { withDistrictLanes } from '../src/systems/Districts.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { securityFor, seededRng } from '../src/systems/MetroDaily.ts';
import type { Clock } from '../src/systems/Crowd.ts';
import { StreetLife, streetProfileFor } from '../src/systems/StreetLife.ts';
import { zoneActivity, zonePull } from '../src/systems/Zones.ts';

const SAT = 6;
const TUE = 2;
assert.equal(weekdayOf(SAT), 'saturday');
const at = (day: number, hour: number): Clock => ({ day, hour: Math.floor(hour), minute: Math.round((hour % 1) * 60) });
const zone = (id: string) => ZONES.find((z) => z.id === id)!;

// --------------------------------------------------- 1. los datos: completos, y sin gente por su origen
{
  const KEYS = ['name', 'tagline', 'density', 'groups', 'traffic', 'scooters', 'security', 'events', 'ambience'];
  for (const [id, p] of Object.entries(DISTRICT_IDENTITIES)) {
    assert.deepEqual(Object.keys(p).sort(), [...KEYS].sort(), `${id}: campos de más o de menos (nada de origen, renta ni delito)`);
    assert.ok(p.scooters >= 0 && p.scooters <= 2.5, `${id}: patinetes fuera de rango`);
    for (const f of [p.security, p.events, p.ambience, p.traffic.vehicles, p.traffic.bikes, p.traffic.deliveries, p.density.rest, p.density.weekend, ...Object.values(p.groups)]) assert.ok(f > 0 && f <= 2.5, `${id}: factor fuera de rango (${f})`);
    for (const [from, to, k] of p.density.bands) assert.ok(from < to && k > 0 && k <= 2.5, `${id}: franja ${from}-${to}`);
  }
  // Los barrios de las zonas existen y los futuros están listos aunque no tengan mapa.
  for (const z of ZONES) assert.ok(DISTRICT_IDENTITIES[z.districtId], `zona ${z.id}: barrio sin identidad (${z.districtId})`);
  for (const id of ['velaria', 'puerta-central', 'cuatro-rios', 'arena', 'luna']) assert.ok(DISTRICT_IDENTITIES[id], `falta el perfil de ${id}`);
  for (const loc of Object.keys(LOCATION_DISTRICT)) assert.ok(DISTRICT_IDENTITIES[LOCATION_DISTRICT[loc]], `${loc}: barrio sin perfil`);
  // Todos los viajes de la gente caen en un grupo (si no, el barrio no los puede pesar).
  const roles = new Set<string>();
  for (const p of STREET_PROFILES) for (const t of p.trips) if (t.role) roles.add(t.role);
  const loose = [...roles].filter((r) => !roleGroupOf(r));
  assert.deepEqual(loose, [], `viajes sin grupo: ${loose.join(', ')}`);
  assert.ok(ROLE_GROUPS.length >= 8);
}

// --------------------------------------------------- 2. mismas horas, barrios distintos (la afluencia y a qué tiran)
const share = (p: DistrictIdentity, g: RoleGroup): number => p.groups[g] ?? 1;
{
  const V = DISTRICT_IDENTITIES.vallesco, C = DISTRICT_IDENTITIES.vintage, R = DISTRICT_IDENTITIES.ribera;
  assert.ok(share(C, 'retail') > share(V, 'retail') && share(C, 'retail') > share(R, 'retail'), 'la calle vintage no es la de las compras');
  assert.ok(share(R, 'sport') > share(V, 'sport') && share(R, 'leisure') > share(V, 'leisure'), 'la ribera no es la del deporte y el ocio');
  assert.ok(share(V, 'commute') > share(R, 'commute') && share(V, 'commute') > share(C, 'commute'), 'Vallesco no es el del trabajo y las rutinas');
  assert.ok(share(DISTRICT_IDENTITIES.luna, 'nightlife') > share(R, 'nightlife') && share(DISTRICT_IDENTITIES.velaria, 'nightlife') < share(V, 'nightlife'), 'la noche de Luna y la quietud de Velaria');
  // La misma zona a la misma hora: el carácter de su barrio se nota en lo que la gente va a hacer allí.
  const sat21 = at(SAT, 21), tue830 = at(TUE, 8.5);
  const carmen = zone('calle-carmen'), residential = zone('vallesco-residencial'), terrazas = zone('ribera-terrazas');
  assert.ok(zonePull(carmen, 'carmen-browse', at(SAT, 18)) > zonePull(residential, 'carmen-browse', at(SAT, 18)), 'compras: el Carmen no tira más que una calle de barrio');
  assert.ok(zonePull(terrazas, 'terrace-meal', sat21) > zonePull(terrazas, 'terrace-meal', tue830), 'la terraza de la Ribera no se anima de noche');
  assert.ok(zoneActivity(terrazas, sat21) > zoneActivity(residential, sat21), 'el sábado a las 21:00 la Ribera no está más viva que una calle residencial');
  assert.ok(zoneActivity(residential, tue830) > zoneActivity(terrazas, tue830), 'a las 08:30 un martes la Ribera está más viva que el barrio');
}

// --------------------------------------------------- 3. las calles de verdad: a qué se dedica la gente a la misma hora
function mix(location: string, day: number, hour: number, seed: number): Record<RoleGroup | 'otros', number> & { total: number } {
  const s = new StreetLife(getLocation(location), streetProfileFor(location)!, seededRng(seed));
  const player = location === 'district' ? { tx: 40, ty: 30 } : { tx: 20, ty: 16 };
  const start = at(day, hour);
  s.populate(start, player);
  const out = { nightlife: 0, retail: 0, leisure: 0, sport: 0, commute: 0, social: 0, food: 0, tourism: 0, family: 0, otros: 0, total: 0 };
  for (let m = 0; m < 90; m++) {
    const t = start.minute + m;
    const c: Clock = { day, hour: start.hour + Math.floor(t / 60), minute: t % 60 };
    for (let k = 0; k < 20; k++) s.update(50, c, player);
    for (const a of s.agents) {
      if (a.kind !== 'visitor' || a.leader) continue;
      out[roleGroupOf(a.role) ?? 'otros']++;
      out.total++;
    }
  }
  return out;
}
{
  // Un martes por la mañana: el barrio de las rutinas lleva más gente al trabajo que la Ribera.
  const vm = mix('district', TUE, 8.5, 11), rm = mix('ribera', TUE, 8.5, 11);
  assert.ok(vm.commute / vm.total > rm.commute / Math.max(1, rm.total), `a las 08:30 Vallesco no va más al trabajo que la Ribera (${vm.commute}/${vm.total} y ${rm.commute}/${rm.total})`);
  // Un sábado por la tarde-noche: la Ribera es de ocio y deporte; Vallesco, no tanto.
  const vs = mix('district', SAT, 19.5, 12), rs = mix('ribera', SAT, 19.5, 12);
  const out = (m: typeof vs): number => (m.leisure + m.sport + m.social) / Math.max(1, m.total);
  assert.ok(out(rs) > out(vs), `el sábado a las 19:30 la Ribera no es más de ocio que Vallesco (${out(rs).toFixed(2)} y ${out(vs).toFixed(2)})`);
  assert.ok(rs.total >= 3 && vs.total >= 3, 'calle sin gente');
  console.log(`  martes 08:30: Vallesco ${Math.round((vm.commute / vm.total) * 100)} % al trabajo, Ribera ${Math.round((rm.commute / Math.max(1, rm.total)) * 100)} % · sábado 19:30: ocio/deporte/quedadas Ribera ${Math.round(out(rs) * 100)} %, Vallesco ${Math.round(out(vs) * 100)} %`);
}

// --------------------------------------------------- 4. tráfico: coches, bicis y repartos por carril
{
  const district = getLocation('district');
  const bikes = withDistrictLanes(district, district.traffic!.bikes!);
  const cars = withDistrictLanes(district, district.traffic!);
  const avenue = bikes.lanes.find((l) => l.row === 31)!;
  const carmenLane = bikes.lanes.find((l) => l.row === 52)!;
  assert.ok((carmenLane.density ?? 1) > (avenue.density ?? 1), 'el carril bici que cruza la calle vintage no lleva más bicis');
  assert.ok((carmenLane.mix?.midday?.courier ?? 0) !== (avenue.mix?.midday?.courier ?? 0), 'los repartos no siguen al comercio del carril');
  const ribera = getLocation('ribera');
  const rb = withDistrictLanes(ribera, ribera.traffic!.bikes!);
  assert.ok(rb.lanes.every((l) => (l.density ?? 1) > 1.2), 'la Ribera no es de bicis');
  for (const l of cars.lanes) assert.ok((l.density ?? 1) > 0.5 && (l.density ?? 1) < 1.6, `coches fuera de rango: ${l.density}`);
}

// --------------------------------------------------- 5. vigilancia: el barrio manda sobre el cómo, no sobre el si
{
  const rate = (presence: number): number => {
    let patrol = 0, n = 0;
    for (let d = 1; d <= 400; d++) {
      for (const tag of ['morning', 'midday', 'evening', 'night'] as const) {
        const r = securityFor({ day: d, securityPatrols: d % 2 === 0 } as never, 'vallesco-station', tag, 'LOW', 1, presence);
        assert.equal(r.count, 1, 'siempre hay un vigilante donde hay puesto');
        patrol += r.patrols ? 1 : 0;
        n++;
      }
    }
    return patrol / n;
  };
  const calm = rate(0.8), normal = rate(1), strict = rate(1.5);
  assert.ok(strict > normal && normal > calm, `rondas: ${calm.toFixed(2)} (0,8) · ${normal.toFixed(2)} (1) · ${strict.toFixed(2)} (1,5)`);
  assert.equal(securityFor({ day: 1, securityPatrols: false } as never, 'x', 'midday', 'LOW', 0, 2).count, 0, 'sin puesto no hay vigilante');
  console.log(`  rondas del vigilante: barrio tranquilo ${Math.round(calm * 100)} %, normal ${Math.round(normal * 100)} %, de más vigilancia ${Math.round(strict * 100)} %`);
}

console.log('check-district-identity: barrios con su carácter (afluencia, viajes, tráfico, vigilancia y sucesos), tres sitios distintos a la misma hora, perfiles futuros listos, OK');
