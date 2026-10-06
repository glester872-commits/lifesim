// Identidad por zona (data/districts.ts, design/DISTRICTS.md): variación sí,
// otro juego no. Comprueba que los perfiles se quedan dentro de la dirección
// maestra, que cada zona tiene los edificios que le tocan y que lo que el perfil
// dice se ve en el mundo (su kit, su gente, su tráfico). `node scripts/check-districts.ts`.
import assert from 'node:assert/strict';
import { DISTRICTS, type DistrictId, type Phase } from '../src/data/districts.ts';
import { PASSENGER_LOOKS } from '../src/data/npcs.ts';
import { VEHICLES } from '../src/data/vehicles.ts';
import { BIKES } from '../src/data/bikes.ts';
import { LOCATIONS } from '../src/data/locations.ts';
import { districtAt, gradeAt, hex, lookWeights, withDistrictLanes } from '../src/systems/Districts.ts';
import { PROPS } from '../src/world/tiles.ts';

const ch = (c: number): number[] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
/** Lo más que una zona puede apartarse del cielo en cada fase (canal mínimo): de día casi nada, de noche algo más. */
const FLOOR: Record<Phase, number> = { morning: 0xe4, day: 0xf0, sunset: 0xd0, night: 0xc8 };
const known = new Set([...VEHICLES, ...BIKES].map((v) => v.id));

for (const [id, p] of Object.entries(DISTRICTS) as [DistrictId, (typeof DISTRICTS)[DistrictId]][]) {
  for (const phase of Object.keys(FLOOR) as Phase[]) {
    const c = ch(hex(p.grade[phase]));
    assert.ok(Math.min(...c) >= FLOOR[phase], `${id}: el tinte de ${phase} (${p.grade[phase]}) se aparta demasiado del cielo`);
  }
  assert.ok(p.wash[1] > 0 && p.wash[1] <= 0.08, `${id}: el velo del suelo pasa de α 0,08 y se leería como otro material`);
  const [r, g, b] = ch(hex(p.lamp[0]));
  // ART_BIBLE §6: toda luz local es cálida; lo frío son los tubos y los neones, no la zona.
  assert.ok(r >= g && g >= b, `${id}: la luz de farola tiene que ser cálida`);
  assert.ok(p.lamp[1] >= 0.7 && p.lamp[1] <= 1.2, `${id}: fuerza de farola fuera de 0,7–1,2`);
  for (const kind of p.kit?.props ?? []) assert.ok(PROPS[kind], `${id}: el kit pide un prop que no existe (${kind})`);
  for (const band of Object.values(p.vehicles ?? {})) for (const v of Object.keys(band ?? {})) assert.ok(known.has(v), `${id}: tráfico de un tipo que no existe (${v})`);
  // Lo que la zona atrae tiene que existir: su estilo favorito lo lleva alguien.
  const top = (Object.entries(p.crowd) as [string, number][]).sort((a, b2) => b2[1] - a[1])[0][0];
  assert.ok(PASSENGER_LOOKS.some((l) => (l.style ?? 'everyday') === top), `${id}: nadie viste '${top}'`);
}

// El guion se interpola entre anclas: a mediodía es el de día; a medianoche, el de noche.
assert.equal(gradeAt(DISTRICTS.vintage, 13), hex(DISTRICTS.vintage.grade.day));
assert.equal(gradeAt(DISTRICTS.nightlife, 0), hex(DISTRICTS.nightlife.grade.night));
assert.equal(gradeAt(DISTRICTS.park, 20), hex(DISTRICTS.park.grade.sunset));

// Cada zona, dentro del mapa y con los edificios que le caben.
const fits = (allowed: readonly string[], style: string): boolean => allowed.some((a) => (a.endsWith('*') ? style.startsWith(a.slice(0, -1)) : a === style));
let zoned = 0;
for (const loc of LOCATIONS.filter((l) => l.kind === 'exterior')) {
  const [w, h] = [loc.ground[0].length, loc.ground.length];
  for (const z of loc.zones ?? []) assert.ok(z.tx >= 0 && z.ty >= 0 && z.tx + z.w <= w && z.ty + z.h <= h, `${loc.id}: zona ${z.profile} fuera del mapa`);
  for (const b of loc.buildings ?? []) {
    const d = districtAt(loc, b.tx + Math.floor(b.w / 2), b.ty + Math.floor(b.h / 2));
    if (!d) continue;
    assert.ok(fits(DISTRICTS[d].facades, b.style), `${loc.id}: ${b.name} (${b.style}) no cabe en una zona ${d}`);
  }
  if (loc.district || loc.zones?.length) zoned++;
}
assert.ok(zoned >= 2, 'los dos barrios exteriores tienen identidad');

// Lo que dice el perfil se ve: el kit del Carmen y del parque está puesto en su zona.
const district = LOCATIONS.find((l) => l.id === 'district')!;
const inZone = (id: DistrictId, kinds: readonly string[]): number =>
  district.props.filter((p) => kinds.includes(p.kind) && districtAt(district, p.tx, p.ty) === id).length;
assert.ok(inZone('vintage', ['poster']) >= 3, `el Carmen tiene carteles en las fachadas (${inZone('vintage', ['poster'])})`);
assert.ok(inZone('park', ['bush']) >= 3, `el parque tiene arbustos en los bordes (${inZone('park', ['bush'])})`);
assert.equal(inZone('residential', ['poster']), 0, 'los carteles del Carmen no se escapan a las calles de vecinos');

// Y su gente: quien va al Carmen viste más 'street' que quien va a un portal de vecinos.
const share = (id: DistrictId): number => {
  const w = lookWeights(PASSENGER_LOOKS, DISTRICTS[id]);
  const street = w.reduce((s, x, i) => s + (PASSENGER_LOOKS[i].style === 'street' ? x : 0), 0);
  return street / w.reduce((s, x) => s + x, 0);
};
assert.ok(share('vintage') > share('residential') * 3, `Carmen ${share('vintage').toFixed(2)} vs vecinos ${share('residential').toFixed(2)}`);

// Y su tráfico: el carril bici del Olmo acaba en el Carmen y lleva más bici de paseo; la avenida, más taxi de noche.
const bikes = withDistrictLanes(district, district.traffic!.bikes!).lanes.find((l) => l.row === 52)!;
assert.ok((bikes.mix?.midday?.casual ?? 1) > 1.1, 'el carril del Carmen lleva bicis de paseo');
const cars = withDistrictLanes(district, district.traffic!).lanes[0];
assert.ok((cars.mix?.night?.taxi ?? 1) > (cars.mix?.midday?.taxi ?? 1), 'de noche pasa más taxi por la avenida');

console.log(`check-districts: ${Object.keys(DISTRICTS).length} perfiles, ${zoned} barrios con zonas; Carmen ${Math.round(share('vintage') * 100)} % street, vecinos ${Math.round(share('residential') * 100)} %`);
