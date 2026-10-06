// Guardar y cargar a la fuerza (systems/SaveSystem.ts) con los mismos datos y sistemas que el juego: `npm run check`.
// Doce situaciones (calle, interior, compra, metro, noche, lluvia, relaciones, personaje en otro sitio, tras una
// actividad, con un suceso en marcha, guardar→cargar→guardar y partidas viejas o tocadas). Tras cargar: mismo
// dinero, objetos, sitio y reloj; posición pisable (ni pared ni vía); interiores con salida; personajes con nombre
// una vez y en su sitio; locales sin gente repetida; sucesos sin estado a medias. Falla si algo no vuelve igual.
import assert from 'node:assert/strict';
import { SAVE_KEY, SAVE_VERSION, TILE } from '../src/config/constants.ts';
import { getCatalog } from '../src/data/catalogs.ts';
import { getActivity } from '../src/data/activities.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { GARMENTS } from '../src/data/retail.ts';
import { STREET_EVENTS } from '../src/data/streetEvents.ts';
import { ALLEY_SPOTS } from '../src/data/alleyDeals.ts';
import { createInitialState, restore, SaveSystem, UNREADABLE_KEY, type SaveStorage } from '../src/systems/SaveSystem.ts';
import { getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { placeInfo } from '../src/systems/Places.ts';
import { purchase, payFare } from '../src/systems/Commerce.ts';
import { perform } from '../src/systems/Activities.ts';
import { whereabouts } from '../src/systems/Characters.ts';
import { weatherAt } from '../src/systems/Weather.ts';
import { Crowd, profileFor } from '../src/systems/Crowd.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { StreetEvent } from '../src/systems/StreetEvents.ts';
import { AlleyDeal } from '../src/systems/AlleyDeals.ts';
import type { GameStateData } from '../src/types/game.ts';

const store = new Map<string, string>();
const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
const save = new SaveSystem(storage);
const abs = (s: GameStateData): number => (s.day - 1) * 1440 + s.hour * 60 + s.minute;
const tileOf = (s: GameStateData): { tx: number; ty: number } => ({ tx: Math.floor(s.position.x / TILE), ty: Math.floor((s.position.y - 1) / TILE) });
const at = (base: GameStateData, locationId: string, spawn: string, patch: Partial<GameStateData> = {}): GameStateData => {
  const s = getLocation(locationId).spawns[spawn];
  assert.ok(s, `${locationId} sin spawn ${spawn}`);
  return { ...base, locationId, position: { x: s.tx * TILE + TILE / 2, y: s.ty * TILE + TILE }, facing: s.facing, ...patch };
};
const PLACES_WITH_ROOMS = ['cafe', 'gym', 'restaurant', 'supermarket', 'clothing-store', 'club', 'barber'];
const placeOfInterior = (locationId: string): string | undefined => PLACES_WITH_ROOMS.find((p) => placeInfo(p)?.interior === locationId);

/** Lo que tiene que cumplir cualquier partida cargada, sea de donde sea. */
function valid(label: string, s: GameStateData): void {
  const loc = getLocation(s.locationId);
  const t = tileOf(s);
  assert.ok(isWalkable(loc, t.tx, t.ty), `${label}: aparece dentro de algo en ${s.locationId} ${t.tx},${t.ty}`);
  if (loc.metro) assert.ok(t.ty >= loc.metro.edgeRow, `${label}: aparece en la vía`);
  if (loc.kind === 'interior') assert.ok(loc.portals.some((p) => !p.train && getLocation(p.to.location).spawns[p.to.spawn]), `${label}: interior sin salida válida`);
  assert.ok(s.energy >= 0 && s.energy <= 100, `${label}: energía ${s.energy}`);
  assert.ok(s.day >= 1 && s.hour >= 0 && s.hour < 24 && s.minute >= 0 && s.minute < 60, `${label}: reloj ${s.day} ${s.hour}:${s.minute}`);
  // Personajes con nombre: salen del reloj, uno por personaje, siempre en un sitio que existe.
  const ids = CHARACTERS.map((c) => c.npc);
  assert.equal(new Set(ids).size, ids.length, `${label}: personaje con nombre repetido`);
  for (const c of CHARACTERS) assert.ok(getLocation(whereabouts(c, abs(s)).location), `${label}: ${c.npc} en un sitio que no existe`);
  // El local donde se carga: la gente que sale no se repite (un puesto, una persona).
  const place = placeOfInterior(s.locationId);
  const profile = place && profileFor(place);
  if (place && profile) {
    const crowd = new Crowd(loc, placeInfo(place)!, profile, seededRng(abs(s)));
    crowd.populate({ day: s.day, hour: s.hour, minute: s.minute }, t);
    assert.equal(new Set(crowd.agents.map((a) => a.id)).size, crowd.agents.length, `${label}: gente repetida en ${place}`);
    const named = crowd.agents.filter((a) => a.npc).map((a) => a.npc);
    assert.equal(new Set(named).size, named.length, `${label}: personal con nombre repetido en ${place}`);
  }
}

/** Guardar → cargar → comprobar → guardar otra vez → cargar: lo mismo las dos veces. */
function roundtrip(label: string, before: GameStateData): GameStateData {
  assert.ok(save.save(before), `${label}: no guarda`);
  const after = restore(save.load());
  for (const k of ['money', 'energy', 'day', 'hour', 'minute', 'locationId', 'facing'] as const) assert.equal(after[k], before[k], `${label}: ${k} cambia al cargar`);
  assert.deepEqual(after.position, before.position, `${label}: la posición cambia al cargar`);
  for (const k of ['inventory', 'cards', 'appearance', 'wardrobe', 'fitness', 'events'] as const) assert.deepEqual(after[k], before[k], `${label}: ${k} cambia al cargar`);
  valid(label, after);
  save.save(after);
  assert.deepEqual(restore(save.load()), after, `${label}: guardar→cargar→guardar no es estable`);
  return after;
}

const base = createInitialState();
const results: string[] = [];
const ok = (label: string): number => results.push(label);

// 1. Calle, quieto.
roundtrip('1 calle', base);
ok('calle');

// 2. Dentro de un local.
const cafe = placeInfo('cafe')!.interior!;
roundtrip('2 interior', at(base, cafe, Object.keys(getLocation(cafe).spawns)[0]));
ok('interior');

// 3. Tras comprar.
const product = getCatalog('cafe-counter').products[0];
const bought = purchase({ money: 50, inventory: {}, cards: {} }, product);
assert.ok(bought.ok);
roundtrip('3 compra', { ...base, ...bought.wallet });
ok(`compra (${product.id}, €${bought.wallet.money})`);

// 4. Tras viajar en metro: en el andén de llegada, con la tarjeta pagada y el viaje contado.
const paid = payFare({ money: 20, inventory: {}, cards: { transport: 10 } }, 'transport', 1.5);
assert.ok(paid.ok);
const rode = roundtrip('4 metro', at({ ...base, ...paid.wallet, events: { ...base.events, rides: 3, lastEventRide: 2 } }, 'ribera-station', 'train'));
ok(`metro (tarjeta €${rode.cards.transport})`);

// 5. De noche.
roundtrip('5 noche', { ...base, day: 6, hour: 2, minute: 40 });
ok('noche');

// 6. Con lluvia (el tiempo sale del día: tras cargar llueve igual).
let rainy = { day: 1, hour: 0 };
outer: for (let d = 1; d < 60; d++) {
  for (let h = 0; h < 24; h++) {
    if (weatherAt(d, h).rain > 0.55) {
      rainy = { day: d, hour: h };
      break outer;
    }
  }
}
const wet = roundtrip('6 lluvia', { ...base, day: rainy.day, hour: rainy.hour, minute: 15 });
assert.deepEqual(weatherAt(wet.day, wet.hour + wet.minute / 60), weatherAt(rainy.day, rainy.hour + 0.25), 'la lluvia no es la misma tras cargar');
ok(`lluvia (día ${rainy.day} ${rainy.hour} h)`);

// 7. Relaciones y lo que se ha hablado/elegido; aspecto y ropa.
const top = GARMENTS.find((g) => g.slot === 'top')!;
roundtrip('7 relaciones', {
  ...base,
  events: {
    ...base.events,
    importantNPCsMet: { sara: { name: 'Sara', firstDay: 2, lastDay: 5, encounters: 3, affinity: 2 } },
    choicesMade: [{ day: 5, event: 'metro-musician', choice: 'tip' }],
    eventFlags: { 'met-sara': 2 },
    eventsSeen: { 'metro-musician': [5] },
    eventCooldowns: { 'metro-musician': 9000 },
    scheduled: [{ event: 'sara-again', from: 8000, until: 9000 }],
  },
  appearance: { player: { hair: 'buzz', top: top.id } },
  wardrobe: [top.id],
});
ok('relaciones y aspecto');

// 8. Un personaje con nombre que a esa hora está en otro sitio: vuelve a estar ahí (sale del reloj) y una sola vez.
const who = CHARACTERS[0];
let moved = base;
for (let m = 8 * 60; m < 22 * 60; m += 15) {
  const s = { ...base, day: 3, hour: Math.floor(m / 60), minute: m % 60 };
  if (whereabouts(who, abs(s)).location !== whereabouts(who, abs(base)).location) {
    moved = s;
    break;
  }
}
const before8 = whereabouts(who, abs(moved));
const after8 = roundtrip('8 personaje', moved);
assert.deepEqual(whereabouts(who, abs(after8)), before8, `${who.npc} no está donde estaba tras cargar`);
ok(`personaje ${who.npc} en ${before8.location}`);

// 9. Justo tras una actividad con tiempo (dormir): reloj, energía y dinero tal cual quedaron.
const sleep = perform(getActivity('sleep'));
const t9 = abs(base) + sleep.minutes;
const homeSpawn = Object.keys(getLocation('home').spawns)[0];
roundtrip('9 actividad', at({ ...base, day: Math.floor(t9 / 1440) + 1, hour: Math.floor((t9 % 1440) / 60), minute: t9 % 60, energy: Math.min(100, base.energy + sleep.energy), money: base.money + sleep.money }, 'home', homeSpawn));
ok(`tras dormir (+${sleep.minutes} min)`);

// 10. Con un suceso en marcha: la pelea sale del reloj (vuelve igual); el trapicheo cortado empieza limpio (pasajero).
const fight = STREET_EVENTS[0];
let ev = new StreetEvent(fight, getLocation(fight.location));
let d10 = 10;
while (!ev.night(d10).happens) d10++;
const t10 = ev.night(d10).fightAt + 2;
const s10 = { ...base, day: Math.floor(t10 / 1440) + 1, hour: Math.floor((t10 % 1440) / 60), minute: Math.floor(t10 % 60) };
const life = ev.lifecycle(abs(s10));
assert.equal(life.lifecycle, 'ACTIVE', 'la pelea no está en marcha a esa hora');
const spot = ALLEY_SPOTS[0];
const deal = new AlleyDeal(spot, getLocation(spot.location));
deal.devForce(abs(s10));
deal.interrupt(abs(s10) + 20, 'player');
const after10 = roundtrip('10 suceso', s10);
// "Recarga": el estado de módulo de los sucesos es de la sesión; se simula una sesión nueva.
deal.devReset();
ev.devReset();
ev = new StreetEvent(fight, getLocation(fight.location));
const relife = ev.lifecycle(abs(after10));
assert.equal(relife.lifecycle, 'ACTIVE', 'la pelea no vuelve igual tras cargar');
assert.deepEqual(relife.participants, life.participants, 'la pelea vuelve con otra gente');
const alleyAfter = new AlleyDeal(spot, getLocation(spot.location)).lifecycle(abs(after10) + 21);
assert.ok(!alleyAfter.forced && alleyAfter.lifecycle !== 'RESOLUTION', `el trapicheo vuelve a medias: ${alleyAfter.lifecycle}`);
assert.equal(new Set(alleyAfter.participants.map((p) => p.id)).size, alleyAfter.participants.length);
ok('suceso en marcha (pelea igual, trapicheo limpio)');

// 11. Guardar → cargar → guardar → cargar, varias veces: el texto guardado de la partida no cambia.
save.save(rode);
const first = JSON.parse(store.get(SAVE_KEY)!).state;
for (let i = 0; i < 5; i++) save.save(restore(save.load()));
assert.deepEqual(JSON.parse(store.get(SAVE_KEY)!).state, first, 'la partida deriva al guardar y cargar seguido');
ok('guardar→cargar ×5 estable');

// 12. Partidas viejas, incompletas o tocadas: se cargan con valores seguros; las ilegibles se apartan, no se pisan.
const file = (state: unknown, version: unknown = SAVE_VERSION): void => void store.set(SAVE_KEY, JSON.stringify({ version, savedAt: 0, state }));
// Sin campo de versión (partidas de antes de versionar): se leen como la 1.
store.set(SAVE_KEY, JSON.stringify({ savedAt: 0, state: { ...base, money: 77 } }));
assert.equal(restore(save.load()).money, 77, 'sin versión no carga');
file({ money: 12, day: 4, hour: 9, minute: 5 });
const minimal = restore(save.load());
assert.equal(minimal.money, 12);
assert.equal(minimal.locationId, base.locationId);
assert.deepEqual(minimal.inventory, {});
valid('12 mínima', minimal);
file({ ...base, money: 31, inventory: { water: 2 }, locationId: 'mapa-viejo' });
const renamed = restore(save.load());
assert.equal(renamed.money, 31, 'un sitio que ya no existe tira la partida');
assert.deepEqual(renamed.inventory, { water: 2 });
assert.equal(renamed.locationId, base.locationId);
valid('12 sitio renombrado', renamed);
const room = getLocation(cafe);
let solid = { tx: 0, ty: 0 };
for (let y = 1; y < room.ground.length - 1 && !solid.tx; y++) {
  for (let x = 1; x < room.ground[0].length - 1; x++) {
    if (!isWalkable(room, x, y) && isWalkable(room, x + 1, y)) {
      solid = { tx: x, ty: y };
      break;
    }
  }
}
file({ ...base, locationId: cafe, position: { x: solid.tx * TILE + 8, y: solid.ty * TILE + TILE } });
const nudged = restore(save.load());
valid('12 dentro de una pared', nudged);
const nt = tileOf(nudged);
assert.ok(Math.abs(nt.tx - solid.tx) + Math.abs(nt.ty - solid.ty) <= 3, `dentro de una pared: aparece lejos (${nt.tx},${nt.ty}) en vez de al lado de ${solid.tx},${solid.ty}`);
const station = getLocation('vallesco-station');
file({ ...base, locationId: station.id, position: { x: 12 * TILE + 8, y: station.metro!.trackRow * TILE + TILE } });
valid('12 en la vía', restore(save.load()));
file({ ...base, energy: 250, hour: 25, minute: 70, facing: 'norte', position: { x: null, y: 3 } });
const odd = restore(save.load());
assert.deepEqual([odd.energy, odd.day, odd.hour, odd.minute, odd.facing], [100, base.day + 1, 2, 10, 'down']);
valid('12 valores raros', odd);
// Ilegibles: JSON roto y versión más nueva. No cargan, pero se apartan antes de que el autoguardado pise la buena.
for (const raw of ['{roto', JSON.stringify({ version: SAVE_VERSION + 1, savedAt: 0, state: { ...base, money: 999 } })]) {
  store.delete(UNREADABLE_KEY);
  store.set(SAVE_KEY, raw);
  assert.equal(save.load(), null);
  assert.equal(store.get(UNREADABLE_KEY), raw, 'una partida ilegible no se aparta');
  assert.equal(store.get(SAVE_KEY), raw, 'cargar no toca la partida');
}
ok('partidas viejas, mínimas, renombradas, en pared, en vía, con valores raros, rotas y futuras');

console.log(results.map((r, i) => `${String(i + 1).padStart(2)}. ${r}`).join('\n'));
console.log('\nOK: todo vuelve igual tras cargar, nada a medias, nada en una pared ni en la vía, nada se pisa.');
