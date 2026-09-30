// Zonas lógicas (data/zones.ts): `npm run check`. Falla si una zona se sale del
// mapa, si un tile andable no tiene zona, si una zona nombra un viaje o un
// evento que no existe, si los sitios con nombre caen en otra zona, o si la
// actividad no sigue la hora, la semana y el día.
import assert from 'node:assert/strict';
import { ZONES } from '../src/data/zones.ts';
import { STREET_PROFILES } from '../src/data/streets.ts';
import { STREET_EVENTS } from '../src/data/streetEvents.ts';
import { getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { zoneActivity, zoneAt, zonesIn } from '../src/systems/Zones.ts';
import { forceWeather } from '../src/systems/Weather.ts';

const ids = new Set<string>();
for (const z of ZONES) {
  assert.ok(!ids.has(z.id), `zona repetida: ${z.id}`);
  ids.add(z.id);
  const loc = getLocation(z.location);
  const w = loc.ground[0].length;
  const h = loc.ground.length;
  for (const r of z.rects) assert.ok(r.tx >= 0 && r.ty >= 0 && r.tx + r.w <= w && r.ty + r.h <= h, `[${z.id}] rectángulo fuera del mapa`);
  const roles = new Set(STREET_PROFILES.filter((p) => p.location === z.location).flatMap((p) => p.trips.map((t) => t.role)));
  for (const role of Object.keys(z.population.roles ?? {})) assert.ok(roles.has(role), `[${z.id}] no hay viajes '${role}' en ${z.location}`);
  for (const ev of Object.keys(z.events ?? {})) assert.ok(STREET_EVENTS.some((e) => e.id === ev), `[${z.id}] no existe el evento '${ev}'`);
}

// Todo lo andable del barrio tiene zona: nadie cruza a «ninguna parte».
const vallesco = getLocation('district');
for (let ty = 0; ty < vallesco.ground.length; ty++) {
  for (let tx = 0; tx < vallesco.ground[0].length; tx++) {
    if (isWalkable(vallesco, tx, ty)) assert.ok(zoneAt('district', tx, ty), `(${tx},${ty}) andable y sin zona`);
  }
}

// Los nombres del mapa (tecla M) caen en la zona que les toca.
const expected: Record<string, string> = {
  'Plaza de la Fuente': 'plaza-fuente',
  'Avenida de Vallesco': 'avenida',
  'Plazuela del Metro': 'plazuela-metro',
  'Parque del Olmo': 'parque-olmo',
  'Calle del Carmen': 'calle-carmen',
  'Calle Mayor': 'calle-mayor',
  'Calle Tintoreros': 'calle-mayor',
  'Calle del Olmo': 'vallesco-residencial',
};
for (const a of vallesco.areas ?? []) {
  if (expected[a.name]) assert.equal(zoneAt('district', a.tx, a.ty)?.id, expected[a.name], `${a.name} cae en otra zona`);
}
// Los eventos de calle caen en una zona que los acoge.
for (const e of STREET_EVENTS) {
  const z = zoneAt(e.location, e.area.tx + e.area.w / 2, e.area.ty + e.area.h / 2);
  assert.ok(z?.events?.[e.id], `${e.id} cae en ${z?.id ?? 'ninguna zona'}, que no lo acoge`);
}
// Un interior no tiene zonas.
assert.equal(zoneAt('cafe', 3, 3), undefined);

// Actividad: la noche sube de noche, el parque de tarde; dos lunes no son iguales, el mismo lunes sí.
forceWeather({ rain: 0, cloud: 0, celsius: 20 });
const zone = (id: string) => ZONES.find((z) => z.id === id)!;
const at = (id: string, day: number, hour: number) => zoneActivity(zone(id), { day, hour, minute: 0 });
const SAT = 6; // día 1 es lunes: el 6, sábado; la madrugada del 7 es aún la noche del sábado.
assert.ok(at('orbita', SAT, 9) < at('orbita', SAT, 20) && at('orbita', SAT, 20) < at('orbita', SAT + 1, 2), 'la Órbita no crece hacia la noche');
assert.ok(at('parque-olmo', 3, 18) > at('parque-olmo', 3, 10), 'el parque no se llena por la tarde');
assert.ok(at('parque-olmo', SAT, 18) > at('parque-olmo', 3, 18) * 1.1, 'el parque no se nota el fin de semana');
assert.ok(at('plazuela-metro', 2, 8) > at('plazuela-metro', 2, 11), 'el metro no tiene hora punta');
assert.ok(at('plazuela-metro', 2, 8) > at('plazuela-metro', SAT + 1, 8), 'el metro no baja en domingo');
assert.notEqual(at('parque-olmo', 1, 18), at('parque-olmo', 8, 18), 'dos lunes iguales');
assert.equal(at('parque-olmo', 1, 18), at('parque-olmo', 1, 18));
forceWeather({ rain: 0.9, cloud: 1, celsius: 20 });
const rainy = at('parque-olmo', 10, 18);
forceWeather({ rain: 0, cloud: 0, celsius: 20 });
assert.ok(rainy < at('parque-olmo', 10, 18.5) * 0.5, 'la lluvia no vacía el parque');
forceWeather(null);

console.log(`zonas OK: ${zonesIn('district').length} en Barrio Vallesco`);
