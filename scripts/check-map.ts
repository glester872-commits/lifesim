// El mapa (tecla M) sale del mundo y pone a cada cual donde está: `npm run check`.
// Falla si un lugar no sale en su puerta, si la proyección se desvía, si un
// interior pierde su barrio o si la vista deja el mapa fuera de la pantalla.
import assert from 'node:assert/strict';
import { allLocations, getLocation, spawnToWorld } from '../src/systems/LocationSystem.ts';
import { findPoint } from '../src/systems/Navigation.ts';
import { placesOfType } from '../src/systems/Places.ts';
import { MapViewport, mapPositionOf, tileToMap, worldMapFor, worldToMap } from '../src/systems/WorldMap.ts';

const near = (a: { x: number; y: number }, b: { x: number; y: number }, eps = 1e-6): boolean => Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;

// ---------------------------------------------------------- proyección
// Un sprite en su spawn (anclado a los pies) cae en el centro de su tile.
for (const loc of allLocations()) {
  for (const [id, sp] of Object.entries(loc.spawns)) {
    assert.ok(near(worldToMap(spawnToWorld(sp)), tileToMap(sp.tx, sp.ty)), `[${loc.id}] el spawn ${id} no cae en su tile en el mapa`);
  }
}

// ------------------------------------------------------------- mapas
let markers = 0;
const exteriors = allLocations().filter((l) => l.kind === 'exterior');
for (const loc of exteriors) {
  const map = worldMapFor(loc.id);
  assert.equal(map.width, loc.ground[0].length);
  assert.equal(map.height, loc.ground.length);
  for (const b of loc.buildings ?? []) assert.equal(map.terrain[b.ty][b.tx], 'building', `[${loc.id}] ${b.id} no se ve como edificio`);
  assert.ok(map.markers.length > 0, `[${loc.id}] mapa sin ningún sitio marcado`);
  for (const m of map.markers) {
    assert.ok(m.x >= 0 && m.y >= 0 && m.x <= map.width && m.y <= map.height, `[${loc.id}] ${m.label} fuera del mapa`);
  }
  for (const a of map.areas) assert.ok(a.x < map.width && a.y < map.height, `[${loc.id}] el nombre ${a.name} fuera del mapa`);
  markers += map.markers.length;
}

// Cada lugar que no es un portal de vecinos sale en el mapa de su calle, justo en su puerta.
const places = (['home', 'business', 'transit', 'public'] as const).flatMap((t) => placesOfType(t));
for (const p of places) {
  const map = worldMapFor(p.locationId);
  const m = map.markers.find((x) => x.id === p.id);
  assert.ok(m, `${p.name} no sale en el mapa de ${map.name}`);
  if (p.building) {
    const door = findPoint(p.entrances[0])!;
    assert.ok(near(m, tileToMap(door.tx, door.ty)), `${p.name}: el icono no está en su puerta`);
  }
}

// ------------------------------------------------------- dónde estás
// En la calle, donde pisa; dentro de cualquier interior, en la puerta de su edificio y en su barrio.
let insides = 0;
for (const loc of allLocations()) {
  const anywhere = spawnToWorld(Object.values(loc.spawns)[0]);
  const at = mapPositionOf(loc.id, anywhere);
  assert.ok(at, `${loc.name}: el mapa no sabe dónde queda`);
  assert.equal(getLocation(at.mapId).kind, 'exterior');
  if (loc.kind === 'exterior') {
    assert.ok(near(at, worldToMap(anywhere)) && !at.inside);
    continue;
  }
  insides++;
  assert.equal(at.inside, loc.name);
  const door = getLocation(at.mapId).portals.find((p) => p.to.location === loc.id)!;
  assert.ok(near(at, tileToMap(door.tx, door.ty)), `${loc.name}: fuera de su puerta en el mapa`);
}
assert.equal(mapPositionOf('retales', { x: 0, y: 0 })!.mapId, 'district', 'Retales está en Vallesco');

// ---------------------------------------------------------------- vista
const v = new MapViewport();
v.setMap(110, 56);
v.setScreen(1280, 600);
v.zoom = 14;
v.centerOn({ x: 30, y: 20 });
// Ida y vuelta pantalla ↔ mapa.
const p = { x: 41.3, y: 12.7 };
assert.ok(near(v.toMap(v.toScreen(p)), p, 1e-9), 'toScreen/toMap no son inversas');
// El zoom deja quieto el punto bajo el cursor.
const cursor = { x: 300, y: 200 };
const under = v.toMap(cursor);
v.zoomAt(1.7, cursor);
assert.ok(near(v.toMap(cursor), under, 1e-6) || v.zoom === v.maxZoom, 'el zoom desplaza el punto del cursor');
// Límites: ni más lejos que el mapa entero ni más cerca del tope; arrastrar sin fin no pierde el mapa.
v.zoomAt(1e6, cursor);
assert.equal(v.zoom, v.maxZoom);
v.zoomAt(1e-6, cursor);
assert.equal(v.zoom, v.minZoom);
assert.ok(v.minZoom * 110 <= 1280 && v.minZoom * 56 <= 600, 'al alejar del todo, el mapa entero no cabe');
v.zoom = 20;
v.panBy(1e6, 1e6);
let tl = v.toMap({ x: 0, y: 0 });
assert.ok(tl.x >= -1e-9 && tl.y >= -1e-9, 'arrastrar deja ver vacío más allá del borde');
v.panBy(-1e7, -1e7);
const br = v.toMap({ x: 1280, y: 600 });
assert.ok(br.x <= 110 + 1e-9 && br.y <= 56 + 1e-9, 'arrastrar deja ver vacío más allá del borde');
// Cambiar el tamaño de la ventana vuelve a encajar la vista.
v.setScreen(390, 700);
tl = v.toMap({ x: 0, y: 0 });
assert.ok(tl.x >= -1e-9, 'al estrechar la ventana, la vista se sale del mapa');

console.log(`${exteriors.length} mapas · ${markers} sitios marcados · ${places.length} lugares en su puerta · ${insides} interiores con su barrio`);
console.log('OK: el mapa sale del mundo, pone cada sitio en su puerta y a ti donde estás; la vista no pierde el mapa.');
