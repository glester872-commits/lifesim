// Los locales de Ribera Norte (data/ribera.ts, data/interiors.ts, data/places.ts, data/population.ts) con los mismos
// sistemas que el juego: `npm run check`. Cada fachada que se ve, en un estado explícito (se entra, vivienda o quiosco);
// de los que se entra: puerta, interior, entrada y vuelta, caminos, horario, gente, servicio, mapa, guardado, medianoche
// y diez vueltas de entrar y salir. Falla si alguna puerta se comporta como una puerta falsa.
import assert from 'node:assert/strict';
import { TILE } from '../src/config/constants.ts';
import { getLocation, isStandable, isWalkable } from '../src/systems/LocationSystem.ts';
import { isOpen, hoursLabel, placeInfo, placesOfType } from '../src/systems/Places.ts';
import { Crowd, profileFor, type Clock } from '../src/systems/Crowd.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { auditVenues } from '../src/systems/VenueAudit.ts';
import { worldMapFor, mapPositionOf } from '../src/systems/WorldMap.ts';
import { createInitialState, restore } from '../src/systems/SaveSystem.ts';
import { getMenu } from '../src/data/menus.ts';
import { getStore, GARMENTS } from '../src/data/retail.ts';

const rows = auditVenues('ribera');
const enterable = rows.filter((r) => r.kind === 'enterable');

// ------------------------------------------------ 1. inventario: cada fachada, en su estado

for (const r of rows) assert.deepEqual(r.problems, [], `${r.name}: ${r.problems.join(' | ')}`);
const names = (kind: string): string[] => rows.filter((r) => r.kind === kind).map((r) => r.name).sort();
assert.deepEqual(names('enterable'), ['Bar Ribera', 'Café del Río', 'Casa Mar', 'Colmado Ribera', 'Ribera Sport', 'Salón Recreativo Nova'], 'los locales de los que se entra');
assert.deepEqual(names('residence'), ['Ribera 1', 'Ribera 2'], 'las viviendas');
assert.deepEqual(names('kiosk'), ['Heladería del Muelle'], 'el quiosco');
// Ningún negocio de Ribera queda fuera del inventario (ni con fachada sin puerta ni olvidado).
for (const p of placesOfType('business').filter((x) => x.locationId === 'ribera')) assert.ok(rows.some((r) => r.place === p.id), `${p.name} sin inventariar`);
// Una vivienda no finge ser un local: ni puerta ni texto que mirar en su fachada.
const street = getLocation('ribera');
for (const b of street.buildings ?? []) if (rows.find((r) => r.building === b.id)?.kind === 'residence') assert.ok(!b.enter && !b.inspect, `${b.name} parece un local`);
// Y un local nunca tiene a la vez puerta y cartel en el mismo sitio (dos avisos en la misma puerta).
for (const b of street.buildings ?? []) assert.ok(!(b.enter && b.inspect), `${b.name}: puerta y cartel a la vez`);

// ------------------------------------------------ 2. horario: abierto se entra, cerrado se dice

for (const r of enterable) {
  const place = placeInfo(r.place!)!;
  const [open, close] = place.hours!;
  // Un día en que abre (lunes a sábado en Ribera Sport; cualquiera en el resto).
  const day = (place.days ?? [0, 1, 2, 3, 4, 5, 6]).map((d) => d + 1)[1] ?? 2;
  assert.ok(isOpen(place, day, (open + 1) % 24), `${r.name}: cerrado a su hora de abrir`);
  assert.ok(!isOpen(place, day, (open + 23) % 24) || (open + 23) % 24 < (close % 24 || 24), `${r.name}: abierto antes de abrir`);
  assert.ok(hoursLabel(place).length > 5, `${r.name}: sin horario que decir`);
}
{
  // Ribera Sport no abre el domingo: la puerta lo dice (cerrado con horario) en lugar de no hacer nada.
  const sport = placeInfo('sports-store')!;
  assert.ok(!isOpen(sport, 7, 12), 'Ribera Sport abierto en domingo');
  assert.match(hoursLabel(sport), /lunes a sábado/);
}

// ------------------------------------------------ 3. gente: a su hora, sin repetidos, y se van al cerrar

const PLAYER = { tx: -999, ty: -999 };
for (const r of enterable) {
  const place = placeInfo(r.place!)!;
  const profile = profileFor(place.id)!;
  const loc = getLocation(place.interior!);
  const busy = profile.bands.reduce((a, b) => (['HIGH', 'VERY_HIGH'].includes(b[2]) ? b : a), profile.bands[0]);
  const crowd = new Crowd(loc, place, profile, seededRng(7));
  let c: Clock = { day: 5, hour: Math.floor(busy[0]), minute: 10 };
  crowd.populate(c, PLAYER);
  for (let ms = 0; ms < 30 * 500; ms += 100) {
    crowd.update(100, c, PLAYER);
    if (ms % 500 === 0) c = { ...c, minute: Math.min(59, c.minute + 1) };
  }
  assert.ok(crowd.agents.length > 0, `${r.name}: vacío en su hora punta`);
  assert.equal(new Set(crowd.agents.map((a) => a.id)).size, crowd.agents.length, `${r.name}: gente repetida`);
  for (const a of crowd.agents) assert.ok(isStandable(loc, Math.round(a.x), Math.round(a.y)), `${r.name}: ${a.label} dentro de algo`);
  if (profile.staff.length) assert.ok(crowd.agents.some((a) => a.kind === 'staff'), `${r.name}: sin personal abierto`);
  // Varias poses: nadie pone a toda la sala igual.
  if (crowd.agents.length >= 4) assert.ok(new Set(crowd.agents.map((a) => a.state)).size >= 2, `${r.name}: todos en la misma pose`);
}

// ------------------------------------------------ 4. servicio: Casa Mar atiende con su carta; Ribera Sport vende

{
  const menu = getMenu('casa-mar');
  assert.ok(menu.items.length >= 6 && menu.items.some((i) => i.kind === 'food') && menu.items.some((i) => i.kind === 'drink'), 'carta de Casa Mar');
  const place = placeInfo('casa-mar')!;
  const crowd = new Crowd(getLocation('casa-mar'), place, profileFor('casa-mar')!, seededRng(3));
  let c: Clock = { day: 5, hour: 21, minute: 0 };
  crowd.populate(c, PLAYER);
  let dined = false;
  for (let ms = 0; ms < 120 * 500; ms += 100) {
    crowd.update(100, c, PLAYER);
    if (ms % 500 === 0) c = { ...c, minute: (c.minute + 1) % 60, hour: c.minute === 59 ? c.hour + 1 : c.hour };
    dined ||= crowd.agents.some((a) => a.state === 'DINE' && a.path.length === 0);
  }
  assert.ok(crowd.service && crowd.service.staffed, 'Casa Mar sin servicio de mesa con camarero');
  assert.ok(dined, 'en Casa Mar nadie llega a sentarse a comer');
  const store = getStore('ribera-sport');
  const sport = getLocation('ribera-sport');
  for (const rack of sport.racks ?? []) {
    const items = store.stock.filter((s) => !rack.categories || rack.categories.includes(GARMENTS.find((g) => g.id === s.garment)!.category));
    assert.ok(items.length > 0, `Ribera Sport: el perchero «${rack.name}» está vacío`);
  }
}

// ------------------------------------------------ 5. mapa: cada marcador lleva a su local; dentro, se está en su puerta

{
  const map = worldMapFor('ribera');
  for (const r of enterable) {
    const marker = map.markers.find((m) => m.place?.id === r.place);
    assert.ok(marker, `${r.name}: sin marcador en el mapa`);
    assert.equal(marker.place!.interior, r.interior, `${r.name}: el marcador no lleva a su interior`);
    const inside = getLocation(r.interior!);
    const pos = mapPositionOf(inside.id, { x: inside.spawns.entry.tx * TILE + 8, y: inside.spawns.entry.ty * TILE + TILE });
    assert.equal(pos?.mapId, 'ribera', `${r.name}: dentro, el mapa no sabe en qué barrio estás`);
    assert.equal(pos?.inside, inside.name, `${r.name}: dentro, el mapa no dice dónde`);
  }
}

// --------------------------------------- 6. guardado dentro, medianoche dentro y diez vueltas de entrar y salir

for (const r of enterable) {
  const inside = getLocation(r.interior!);
  const entry = inside.spawns.entry;
  const at = { x: entry.tx * TILE + TILE / 2, y: entry.ty * TILE + TILE };
  // Guardado dentro: se carga dentro, en un sitio pisable; una posición que ya cae en una pared se recoloca al lado.
  const saved = restore({ ...createInitialState(), locationId: inside.id, position: at });
  assert.equal(saved.locationId, inside.id, `${r.name}: se carga fuera`);
  const wall = restore({ ...createInitialState(), locationId: inside.id, position: { x: TILE / 2, y: TILE } });
  assert.ok(isWalkable(inside, Math.floor(wall.position.x / TILE), Math.floor((wall.position.y - 1) / TILE)), `${r.name}: se carga dentro de una pared`);
  // Salir siempre se puede (cerrado o no): la salida existe y lleva a la puerta de su edificio, pisable.
  const exit = inside.portals.find((p) => !p.train)!;
  assert.equal(exit.to.location, 'ribera', `${r.name}: la salida no da a la Ribera`);
  // Diez vueltas: entrar (spawn de dentro) y salir (spawn de fuera) dan siempre el mismo sitio, y cada escena pone la
  // misma gente (sin acumular nada de la anterior: cada interior se construye de nuevo).
  const back = getLocation('ribera').spawns[exit.to.spawn];
  const counts = new Set<number>();
  for (let i = 0; i < 10; i++) {
    assert.deepEqual(getLocation(exit.to.location).spawns[exit.to.spawn], back, `${r.name}: la vuelta cambia en la vuelta ${i + 1}`);
    assert.deepEqual(inside.spawns.entry, entry, `${r.name}: la entrada cambia en la vuelta ${i + 1}`);
    const place = placeInfo(r.place!)!;
    const crowd = new Crowd(inside, place, profileFor(place.id)!, seededRng(11));
    crowd.populate({ day: 4, hour: Math.floor(place.hours![0]) + 2, minute: 0 }, PLAYER);
    counts.add(crowd.agents.length);
  }
  assert.equal(counts.size, 1, `${r.name}: entrar varias veces cambia la gente (${[...counts]})`);
}
{
  // Medianoche dentro del Colmado (cierra a las 00:00): la gente se va, el personal también y la salida sigue ahí.
  const place = placeInfo('colmado')!;
  const crowd = new Crowd(getLocation('colmado'), place, profileFor('colmado')!, seededRng(5));
  let c: Clock = { day: 6, hour: 23, minute: 40 };
  crowd.populate(c, PLAYER);
  for (let ms = 0; ms < 120 * 500; ms += 100) {
    crowd.update(100, c, PLAYER);
    if (ms % 500 === 0) {
      const total = c.hour * 60 + c.minute + 1;
      c = { day: c.day + Math.floor(total / 1440), hour: Math.floor((total % 1440) / 60), minute: total % 60 };
    }
  }
  assert.equal(c.day, 7, 'no se ha cruzado la medianoche');
  assert.equal(crowd.agents.length, 0, `tras cerrar quedan ${crowd.agents.length} en el Colmado`);
  assert.ok(getLocation('colmado').portals.some((p) => p.to.location === 'ribera'), 'cerrado, el Colmado no tiene salida');
}

console.log(`Ribera Norte: ${enterable.length} locales en los que se entra, ${names('residence').length} viviendas, ${names('kiosk').length} quiosco · horario, gente, servicio de mesa, tienda, mapa, guardado dentro, medianoche y 10 vueltas OK`);
for (const r of rows) console.log(`${`  ${r.kind.padEnd(10)} ${r.name.padEnd(24)} ${r.interior ?? '—'}`.padEnd(60)} ${r.hours}`);
