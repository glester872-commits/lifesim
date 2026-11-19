import assert from 'node:assert/strict';
import { allLocations, getLocation, solidMask } from '../src/systems/LocationSystem.ts';
import { volumeGeometry } from '../src/world/BuildingProjection.ts';
const district = getLocation('district');
const pilot = district.buildings!.filter((b) => b.volume);
assert.equal(pilot.length, 3);
for (const b of pilot) {
  const { height, roof, rise, groundTop, projectY } = volumeGeometry(b);
  assert.equal(projectY(0), -rise, `${b.id}: cubierta elevada`);
  assert.equal(projectY(roof), roof - rise, `${b.id}: unión de cubierta y fachada`);
  for (let y = 0; y <= height; y++) {
    assert.ok(Number.isInteger(projectY(y)), `${b.id}: rejilla de píxeles`);
    if (y) assert.ok(projectY(y) >= projectY(y - 1), `${b.id}: sin inversión`);
    if (y >= groundTop) assert.equal(projectY(y), y, `${b.id}: puerta y planta baja intactas`);
  }
}
const flat = { ...district, buildings: district.buildings!.map(({ volume: _volume, ...b }) => b) };
assert.deepEqual(solidMask(district), solidMask(flat), 'La prueba no altera colisiones ni navegación');
assert.equal(allLocations().filter((l) => l.id !== district.id).flatMap((l) => l.buildings ?? []).filter((b) => b.volume).length, 0, 'Sólo Vallesco');
console.log('check-building-volume: OK · 3 edificios · píxel entero · puertas intactas · mismas colisiones · otros barrios intactos');
