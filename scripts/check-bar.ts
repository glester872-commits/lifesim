// Bar Ribera como bar de verdad (data/population.ts 'bar-ribera', data/locations.ts 'bar', systems/Crowd.ts,
// entities/Character.ts): `npm run check`. Con el mismo Crowd del juego: cada cliente entra, pide, recibe un vaso que se
// ve (caña, vino, refresco, agua), bebe, charla, a veces repite y se va; el barman sirve de uno en uno; los taburetes y
// los puestos de pie se ocupan y se sueltan; viernes más lleno que lunes; a la hora de cerrar no queda nadie; entrar
// diez veces no duplica a nadie.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { hoursLabel, isOpen, placeInfo } from '../src/systems/Places.ts';
import { Crowd, levelAt, profileFor, targetAt, type Clock } from '../src/systems/Crowd.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { SERVICE_OFFERS } from '../src/data/services.ts';
import { getActivity } from '../src/data/activities.ts';
import { POPULATION_PROFILES } from '../src/data/population.ts';

const place = placeInfo('bar-ribera')!;
const profile = profileFor('bar-ribera')!;
const loc = getLocation('bar');
const FAR = { tx: -999, ty: -999 };
const STEP = 100;

const advance = (c: Clock): Clock => {
  const total = c.hour * 60 + c.minute + 1;
  return { day: c.day + Math.floor(total / 1440), hour: Math.floor((total % 1440) / 60), minute: total % 60 };
};
/** El calendario empieza en lunes: el día 1 es lunes, el 5 viernes, el 8 lunes otra vez. */
const FRIDAY = 5;
const MONDAY = 8;

// ------------------------------------------------ 1. identidad: tipo de local, hora real, taburetes, servicio

assert.ok(profile.drinks && profile.drinks.length >= 4, 'el bar no declara qué se bebe');
assert.deepEqual([...new Set(profile.drinks)].sort(), ['beer', 'soft', 'water', 'wine'], 'las bebidas del bar');
for (const p of POPULATION_PROFILES) if (p.place !== 'bar-ribera') assert.equal(p.drinks, undefined, `${p.place}: bebidas fuera del bar`);
const stools = Object.keys(loc.points ?? {}).filter((id) => id.startsWith('BAR_STOOL_'));
assert.ok(stools.length >= 3 && stools.every((id) => loc.points![id].kind === 'seat'), 'taburetes del bar');
assert.ok(loc.props.filter((p) => p.kind === 'stool').length >= stools.length, 'cada taburete tiene su mueble');
assert.equal(loc.npcs.length, 0, 'Tere clavada en su sitio: la barra la lleva el Crowd');
assert.equal(profile.staff.length, 1);
assert.equal(profile.staff[0].service, 'barkeeper');
assert.equal(profile.staff[0].npc, 'tere');
const offer = SERVICE_OFFERS[profile.staff[0].offers!];
assert.ok(offer.kind === 'activities' && offer.activities.length >= 3, 'el jugador no puede pedir en la barra');
for (const id of offer.activities) assert.ok(getActivity(id).cost > 0, `${id}: sin precio`);
assert.match(hoursLabel(place), /11:00 a 02:00/, 'horario real del bar');
// El jugador pide en el extremo de la barra: un mostrador con las actividades de la oferta, con suelo libre delante y a
// distancia de cualquier puesto de cliente (donde se pone de pie nadie le tapa el mostrador).
const till = loc.spots?.find((s) => s.activities.includes('bar-cana'));
assert.ok(till && offer.activities.every((id) => till.activities.includes(id)), 'sin sitio donde pedir');
assert.ok(isWalkable(loc, till.tx, till.ty + 1), 'no se llega al mostrador');
for (const [id, p] of Object.entries(loc.points ?? {})) {
  if (id.startsWith('BAR_COUNTER_') || id.startsWith('BAR_STOOL_')) assert.ok(Math.hypot(p.tx - till.tx, p.ty - (till.ty + 1)) > 1.5, `${id} tapa el sitio donde se pide`);
}

// ------------------------------------------------ 2. gente por hora y día: viernes lleno, lunes tranquilo, siempre dentro del aforo

const at = (day: number, hour: number): Clock => ({ day, hour, minute: 0 });
const friday = targetAt(place, profile, at(FRIDAY, 21));
const monday = targetAt(place, profile, at(MONDAY, 21));
const monAfternoon = targetAt(place, profile, at(MONDAY, 15));
assert.ok(friday > monday && monday > monAfternoon, `viernes ${friday}, lunes noche ${monday}, lunes tarde ${monAfternoon}`);
assert.ok(friday <= place.capacity, `aforo superado: ${friday} > ${place.capacity}`);
assert.equal(levelAt(place, profile, at(FRIDAY, 9)), null, 'abierto antes de abrir');
assert.equal(levelAt(place, profile, at(FRIDAY, 5)), null, 'abierto después de cerrar');

// ------------------------------------------------ 3. una noche de viernes, minuto a minuto

const kinds = new Map<string, number>();
let round2 = 0;
let sameTime = 0;
const crowd = new Crowd(loc, place, profile, seededRng(21));
let clock: Clock = at(FRIDAY, 19);
crowd.populate(clock, FAR);
const given = new Map<string, string>();
let acc = 0;
let maxKeepers = 0;
let maxVisitors = 0;
let seatsDup = 0;
let serves = 0;
let wasServing = false;
for (let ms = 0; ms < 6 * 60 * 500; ms += STEP) {
  crowd.update(STEP, clock, FAR);
  acc += STEP;
  if (acc >= 500) {
    acc = 0;
    clock = advance(clock);
  }
  if (ms % 500 !== 0) continue;
  const visitors = crowd.agents.filter((a) => a.kind === 'visitor');
  maxVisitors = Math.max(maxVisitors, visitors.length);
  const keepers = crowd.agents.filter((a) => a.staffRole?.service === 'barkeeper');
  maxKeepers = Math.max(maxKeepers, keepers.length);
  const serving = keepers.some((k) => k.state === 'SERVE');
  if (serving && !wasServing) serves++;
  wasServing = serving;
  // Cada cual en un sitio (un taburete, un puesto, una persona).
  const points = visitors.filter((a) => a.point && a.path.length === 0).map((a) => a.point!);
  seatsDup += points.length - new Set(points).size;
  for (const a of visitors) {
    const settled = a.path.length === 0 && !a.moving;
    // Sin vaso en la mano mientras pide; con él mientras bebe; y quien se va, sin él.
    if (a.state === 'ORDER') assert.equal(a.drink, undefined, `#${a.id} pide con el vaso de antes`);
    if (a.state === 'DRINK' && settled && a.round) assert.ok(a.drink, `#${a.id} bebe con las manos vacías (${a.point})`);
    if (a.leaving) assert.equal(a.drink, undefined, `#${a.id} se va con el vaso`);
    if (a.drink) {
      // Lo mismo todo el rato dentro de una ronda: nadie cambia de bebida a mitad.
      const key = `${a.id}:${a.round}`;
      assert.ok(!given.has(key) || given.get(key) === a.drink, `#${a.id} cambia de bebida en la ronda ${a.round}`);
      given.set(key, a.drink);
      kinds.set(a.drink, (kinds.get(a.drink) ?? 0) + 1);
      if ((a.round ?? 0) >= 2) round2++;
    }
  }
  if (new Set(visitors.filter((a) => a.drink).map((a) => a.drink)).size >= 3) sameTime++;
}
assert.ok(maxVisitors >= 8 && maxVisitors <= place.capacity, `ocupación ${maxVisitors} (aforo ${place.capacity})`);
assert.equal(maxKeepers, 1, `hay ${maxKeepers} barmans a la vez`);
assert.equal(seatsDup, 0, 'dos personas en el mismo puesto');
assert.ok(serves >= 5, `la barra sólo sirvió ${serves} veces`);
assert.deepEqual([...kinds.keys()].sort(), ['beer', 'soft', 'water', 'wine'], 'no se ven las cuatro bebidas');
assert.ok(sameTime > 20, 'nunca se ven a la vez tres bebidas distintas');
assert.ok(round2 > 0, 'nadie pide una segunda ronda');

// ------------------------------------------------ 4. el cierre: a las 02:00 no queda nadie, los asientos se sueltan, la salida sigue

{
  const late = new Crowd(loc, place, profile, seededRng(5));
  let c: Clock = { day: FRIDAY + 1, hour: 1, minute: 30 };
  late.populate(c, FAR);
  let a = 0;
  for (let ms = 0; ms < 3 * 60 * 500; ms += STEP) {
    late.update(STEP, c, FAR);
    a += STEP;
    if (a >= 500) {
      a = 0;
      c = advance(c);
    }
  }
  assert.equal(late.agents.length, 0, `tras cerrar quedan ${late.agents.length} en el bar`);
  assert.ok(!isOpen(place, FRIDAY + 1, 3), 'abierto a las 03:00');
  for (const id of Object.keys(loc.points ?? {})) assert.equal(late.occupancy(id), 'FREE', `${id} sigue ocupado tras cerrar`);
  assert.ok(loc.portals.some((p) => p.to.location === 'ribera'), 'cerrado, el bar no tiene salida');
}

// ------------------------------------------------ 5. entrar diez veces: lo mismo cada vez, un solo barman, ningún vaso heredado

{
  const sizes = new Set<number>();
  for (let i = 0; i < 10; i++) {
    const c = new Crowd(loc, place, profile, seededRng(33));
    c.populate(at(FRIDAY, 21), { tx: 8, ty: 9 });
    sizes.add(c.agents.length);
    assert.equal(c.agents.filter((x) => x.staffRole?.service === 'barkeeper').length, 1, `entrada ${i + 1}: barmans duplicados`);
    assert.equal(new Set(c.agents.map((x) => x.id)).size, c.agents.length, `entrada ${i + 1}: gente repetida`);
    for (const x of c.agents) if (x.kind === 'visitor' && x.drink) assert.ok(x.round, `entrada ${i + 1}: vaso sin ronda`);
  }
  assert.equal(sizes.size, 1, `entrar varias veces cambia la gente (${[...sizes]})`);
}

// ------------------------------------------------ 6. lo demás sigue igual: ningún otro local reparte vasos

for (const id of ['cafe', 'restaurant', 'wine-bar', 'cafe-rio', 'casa-mar']) {
  const p = placeInfo(id)!;
  const cr = new Crowd(getLocation(p.interior!), p, profileFor(id)!, seededRng(9));
  let c: Clock = at(FRIDAY, 13);
  cr.populate(c, FAR);
  let t = 0;
  for (let ms = 0; ms < 40 * 500; ms += STEP) {
    cr.update(STEP, c, FAR);
    t += STEP;
    if (t >= 500) {
      t = 0;
      c = advance(c);
    }
    assert.ok(cr.agents.every((x) => x.drink === undefined), `${id}: alguien con un vaso del bar`);
  }
}

// ------------------------------------------------ 7. lo que se ve: el vaso va en su propia capa, se esconde y cada trago es de cada cual

{
  const character = readFileSync(new URL('../src/entities/Character.ts', import.meta.url), 'utf8');
  assert.ok(/private readonly glass: Phaser\.GameObjects\.Image/.test(character), 'sin imagen propia para el vaso');
  assert.ok(/this\.glass\.destroy\(\)/.test(character), 'el vaso no se destruye con el personaje');
  assert.ok(/if \(!where\) \{[\s\S]{0,120}this\.glass\.setVisible\(false\)/.test(character), 'el vaso queda flotando al irse');
  assert.ok(/if \(!where\.drink\) \{\s*this\.glass\.setVisible\(false\)/.test(character), 'el vaso no se esconde sin bebida');
  assert.ok(/every\(time, this\.seed \* 3 \+ 1, 3_200 \+ \(this\.seed % 7\) \* 450/.test(character), 'los tragos van todos a la vez');
  const view = readFileSync(new URL('../src/world/CrowdView.ts', import.meta.url), 'utf8');
  assert.ok(/drink: a\.drink/.test(view), 'la vista no pasa la bebida');
  const art = readFileSync(new URL('../src/world/TextureFactory.ts', import.meta.url), 'utf8');
  for (const k of ['beer', 'wine', 'soft', 'water']) assert.ok(art.includes(`'fx-glass-${k}'`), `sin dibujo para ${k}`);
}

console.log(`Bar Ribera: viernes ${friday} · lunes noche ${monday} · lunes tarde ${monAfternoon} (aforo ${place.capacity}) · pico ${maxVisitors} · ${serves} servicios del barman · bebidas ${[...kinds].map(([k, n]) => `${k}:${n}`).join(' ')} · 2.ª ronda ${round2} · cierre limpio · 10 entradas iguales`);
