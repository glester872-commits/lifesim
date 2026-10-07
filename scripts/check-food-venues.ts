// Los locales de comida de la ciudad (data/foodItems.ts, data/foodVenues.ts, data/foodInteriors.ts) con los mismos
// sistemas que el juego: `npm run check`. Cada arquetipo tiene lo que dice tener (mostrador, cocina, mesas, barra,
// preparación, para llevar, repartidor); su carta sale de los mismos platos; su interior se puede pisar entero; el
// servicio de mesa atiende a la gente y al jugador (sentarse → pedir → recibir → comer → pagar → irse); y el para
// llevar pasa por la caja y la cartera de siempre.
import assert from 'node:assert/strict';
import { CATALOGS, getCatalog } from '../src/data/catalogs.ts';
import { FOODS, bagId, getFood, liking, takeawayItems } from '../src/data/foodItems.ts';
import { ARCHETYPES, FOOD_VENUES, getArchetype, menuOf, profileOf } from '../src/data/foodVenues.ts';
import { getItem } from '../src/data/items.ts';
import { getMenu } from '../src/data/menus.ts';
import { consume, purchase, type Wallet } from '../src/systems/Commerce.ts';
import { Crowd, type Clock } from '../src/systems/Crowd.ts';
import { FOOD_INTERIORS } from '../src/data/foodInteriors.ts';
import { isStandable, validate } from '../src/systems/LocationSystem.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import type { PlaceInfo } from '../src/systems/Places.ts';
import type { PlayerCall, TableState } from '../src/systems/TableService.ts';

// Los interiores aún no tienen puerta en ninguna calle (no están en data/locations.ts): se validan aparte, sin su salida.
const getLocation = (id: string) => FOOD_INTERIORS.find((l) => l.id === id)!;
// Y su perfil de población, sin registrar (data/population.ts): los demás checks recorren los perfiles y esperan un lugar con edificio.
const profileFor = (id: string) => profileOf(FOOD_VENUES.find((v) => v.id === id)!);
for (const loc of FOOD_INTERIORS) validate(loc, { portals: false });
const PLAYER = { tx: -999, ty: -999 };
const placeOf = (id: string): PlaceInfo => {
  const v = FOOD_VENUES.find((x) => x.id === id)!;
  const a = getArchetype(v.archetype);
  return {
    id: v.id, name: v.name, type: 'business', tags: ['food', 'social'], capacity: a.capacity, hours: a.hours,
    locationId: v.door.location, interior: v.id, entrances: [], exits: [], interactionPoints: [], npcSpawnPoints: [], npcDestinations: [],
  };
};
const busyHour = (id: string): number => {
  const band = getArchetype(FOOD_VENUES.find((v) => v.id === id)!.archetype).bands.find((b) => b[2] === 'HIGH' || b[2] === 'VERY_HIGH')!;
  return Math.floor(band[0]) + 1;
};
const tick = (c: Clock): Clock => (c.minute === 59 ? { ...c, hour: c.hour + 1, minute: 0 } : { ...c, minute: c.minute + 1 });

// ------------------------------------------------ 1. comida: una definición, muchos usos

assert.ok(new Set(FOODS.map((f) => f.id)).size === FOODS.length, 'platos repetidos');
for (const f of FOODS) {
  assert.ok(f.price > 0 && f.prep > 0 && f.duration > 0, `${f.id}: precio o tiempos`);
  assert.ok(f.nutrition.energy > 0 && f.nutrition.hunger >= 0 && f.nutrition.kcal >= 0, `${f.id}: nutrición`);
  assert.ok(f.tags.length > 0, `${f.id}: sin etiquetas para los gustos`);
}
for (const id of ['pizza-margherita', 'burger-classic', 'fries', 'maki-roll', 'cola', 'coffee']) getFood(id);
// Lo que se lleva en la bolsa es un objeto del juego, con la energía del plato.
for (const t of takeawayItems) {
  const f = FOODS.find((x) => bagId(x.id) === t.id)!;
  assert.equal(getItem(t.id).energy, f.nutrition.energy, `${t.id}: energía de la bolsa distinta`);
}
for (const f of FOODS.filter((x) => x.takeaway === false)) assert.throws(() => getItem(bagId(f.id)), `${f.id} no se lleva`);
// Gustos: lo que gusta sube, lo que se evita baja.
assert.ok(liking(getFood('pizza-margherita'), ['queso']) > liking(getFood('maki-roll'), ['queso']), 'gustos');
assert.ok(liking(getFood('maki-roll'), ['-pescado']) < 0, 'lo que se evita no resta');

// ------------------------------------------------ 2. arquetipos: tienen lo que dicen tener

assert.deepEqual(FOOD_VENUES.map((v) => getArchetype(v.archetype).id).sort(), ['burger-fast', 'pizza-casual', 'sushi-casual', 'sushi-premium']);
for (const v of FOOD_VENUES) {
  const a = getArchetype(v.archetype);
  const loc = getLocation(v.id);
  const P = v.prefix;
  const pts = loc.points ?? {};
  const has = (f: string): boolean => a.features.includes(f as never);
  const menu = getMenu(v.id);
  assert.equal(menu.title, v.name);
  assert.ok(menu.items.some((i) => i.kind === 'food') && menu.items.some((i) => i.kind === 'drink'), `${v.name}: carta sin comida o sin bebida`);
  for (const i of menu.items) assert.ok(menu.categories.some((c) => c.id === i.category), `${v.name}: ${i.id} en una categoría que no existe`);
  assert.deepEqual(menuOf(v).items, menu.items, `${v.name}: la carta no sale del arquetipo`);

  if (has('tables')) assert.ok((loc.tables ?? []).length >= 4, `${v.name}: pocas mesas`);
  if (has('counter')) assert.ok(pts[`${P}_COUNTER`] && (loc.props ?? []).some((p) => p.kind === 'counter'), `${v.name}: sin mostrador`);
  if (has('kitchen')) assert.ok(pts[`${P}_STAFF`] && pts[`${P}_PASS`] && (loc.props ?? []).some((p) => p.kind === 'stove'), `${v.name}: sin cocina`);
  if (has('prep-area')) assert.ok((loc.props ?? []).some((p) => p.kind === 'table' && p.ty === 3), `${v.name}: sin mesa de preparación`);
  if (has('sushi-bar')) {
    const bar = (loc.tables ?? []).filter((t) => t.seats.length === 1);
    assert.ok(bar.length >= 3 && bar.every((t) => pts[t.seats[0]].facing === 'up'), `${v.name}: sin barra de taburetes`);
    assert.ok((loc.props ?? []).filter((p) => p.kind === 'stool').length === bar.length, `${v.name}: taburetes y asientos de barra no coinciden`);
  }
  if (has('delivery-pickup')) assert.ok(pts[`${P}_PICKUP`] && profileOf(v).visitors.some((r) => r.role === 'courier'), `${v.name}: sin repartidor`);
  if (has('trays')) assert.ok(a.pace < 1 && profileOf(v).staff.some((s) => s.service === 'waiter'), `${v.name}: sin bandejas ni ritmo rápido`);
  if (has('presentation')) assert.ok(menu.items.some((i) => i.dish === 'nigiri'), `${v.name}: sin platos de presentación`);
  if (has('takeaway')) {
    assert.ok(a.takeaway?.length, `${v.name}: para llevar sin platos`);
    const term = (loc.terminals ?? []).find((t) => t.catalog === `${v.id}-takeaway`);
    assert.ok(term, `${v.name}: sin caja de para llevar`);
    for (const pr of getCatalog(term.catalog).products) assert.ok('item' in pr.effect && getItem(pr.effect.item), `${v.name}: ${pr.id} no es un objeto`);
    assert.ok(profileOf(v).visitors.some((r) => r.role === 'takeaway'), `${v.name}: nadie pide para llevar`);
  } else {
    assert.ok(!(loc.terminals ?? []).length && !CATALOGS.some((c) => c.id === `${v.id}-takeaway`), `${v.name}: caja de para llevar sin tener`);
  }

  // La sala se pisa entera: todos los puntos en un tile libre (menos asientos y mostrador), sin dos en el mismo.
  const seen = new Map<string, string>();
  for (const [id, p] of Object.entries(pts)) {
    const key = `${p.tx},${p.ty}`;
    if (p.kind !== 'seat') assert.ok(isStandable(loc, p.tx, p.ty), `${v.name}: ${id} no se puede pisar`);
    assert.ok(!seen.has(key), `${v.name}: ${id} y ${seen.get(key)} en el mismo tile`);
    seen.set(key, id);
  }
  for (const t of loc.tables ?? []) assert.ok(isStandable(loc, t.service.tx, t.service.ty), `${v.name}: ${t.id}: quien atiende no cabe`);
  // El perfil lleva a puntos que existen.
  const profile = profileFor(v.id)!;
  for (const r of profile.visitors) for (const s of r.plan) for (const pre of s.points) assert.ok(Object.keys(pts).some((k) => k.startsWith(pre)), `${v.name}: ${r.role}: sin puntos ${pre}`);
  for (const s of profile.staff) for (const pre of [...s.points, ...(s.serves ?? [])]) assert.ok(Object.keys(pts).some((k) => k.startsWith(pre)), `${v.name}: personal: sin puntos ${pre}`);
}

// ------------------------------------------------ 3. precios y ritmo: la misma comida, otro local

{
  const avg = (id: string, key: 'duration' | 'prep'): number => {
    const foods = getMenu(id).items.filter((i) => i.kind === 'food');
    return foods.reduce((s, i) => s + i[key], 0) / foods.length;
  };
  // Hamburguesería: gira más rápido que la pizzería (bandeja, comer y salir).
  assert.ok(avg('burger-norte', 'duration') < avg('pizzeria-roma', 'duration'), 'la hamburguesería no gira más que la pizzería');
  assert.ok(getArchetype('burger-fast').dine[1] < getArchetype('pizza-casual').dine[0], 'se queda más en la hamburguesería');
  // El mismo nigiri cuesta más en el premium, y el omakase sólo se pide de noche y no se lleva.
  const nig = (id: string): number => getMenu(id).items.find((i) => i.id === 'nigiri-set')!.price;
  assert.ok(nig('kaizen') > nig('sushi-nori'), 'el premium no es más caro');
  assert.ok(getMenu('kaizen').items.find((i) => i.id === 'omakase')!.hours![0] >= 19, 'omakase a mediodía');
  assert.ok(!CATALOGS.some((c) => c.id === 'kaizen-takeaway'), 'el premium vende para llevar');
  assert.ok(getArchetype('sushi-premium').capacity < getArchetype('sushi-casual').capacity, 'el premium no es más reservado');
}

// ------------------------------------------------ 4. gente: el servicio atiende a los clientes

for (const v of FOOD_VENUES) {
  const place = placeOf(v.id);
  const crowd = new Crowd(getLocation(v.id), place, profileFor(v.id)!, seededRng(11));
  let c: Clock = { day: 5, hour: busyHour(v.id), minute: 0 };
  crowd.populate(c, PLAYER);
  const states = new Set<TableState>();
  const poses = new Set<string>();
  let staffed = false;
  // Dos horas de juego en plena afluencia (el premium cierra a medianoche: no se pasa de ahí).
  for (let ms = 0; ms < 120 * 500; ms += 100) {
    crowd.update(100, c, PLAYER);
    if (ms % 500 === 0) c = tick(c);
    staffed ||= !!crowd.service?.staffed;
    for (const t of crowd.service?.tables ?? []) states.add(t.state);
    for (const a of crowd.agents) poses.add(a.state);
  }
  assert.ok(staffed, `${v.name}: sin camarero`);
  assert.ok(crowd.agents.some((a) => a.kind === 'staff'), `${v.name}: sin personal`);
  for (const s of ['OCCUPIED', 'ORDERED', 'SERVED'] as TableState[]) assert.ok(states.has(s), `${v.name}: ninguna mesa llega a ${s}`);
  assert.ok(poses.has('DINE'), `${v.name}: nadie come`);
  assert.equal(new Set(crowd.agents.map((a) => a.id)).size, crowd.agents.length, `${v.name}: gente repetida`);
  for (const a of crowd.agents) assert.ok(isStandable(getLocation(v.id), Math.round(a.x), Math.round(a.y)), `${v.name}: ${a.label} dentro de algo`);
}
{
  // Para llevar: alguien hace cola en el mostrador de la hamburguesería y la pizzería tiene repartidor.
  const seenAt = (id: string, state: string, label?: string): boolean => {
    const crowd = new Crowd(getLocation(id), placeOf(id), profileFor(id)!, seededRng(5));
    let c: Clock = { day: 5, hour: id === 'burger-norte' ? 12 : 20, minute: 0 };
    crowd.populate(c, PLAYER);
    for (let ms = 0; ms < 600 * 500; ms += 100) {
      crowd.update(100, c, PLAYER);
      if (ms % 500 === 0) c = tick(c);
      if (crowd.agents.some((a) => a.state === state && (!label || a.label === label))) return true;
    }
    return false;
  };
  assert.ok(seenAt('burger-norte', 'ORDER'), 'nadie pide para llevar en la hamburguesería');
  assert.ok(seenAt('pizzeria-roma', 'WAIT', 'Repartidor'), 'ningún repartidor recoge en la pizzería');
}

// ------------------------------------------------ 5. jugador: sentarse → pedir → recibir → comer → pagar → irse

for (const id of ['pizzeria-roma', 'burger-norte', 'sushi-nori', 'kaizen']) {
  const v = FOOD_VENUES.find((x) => x.id === id)!;
  const menu = getMenu(id);
  const crowd = new Crowd(getLocation(id), placeOf(id), profileFor(id)!, seededRng(2));
  let c: Clock = { day: 5, hour: busyHour(id), minute: 0 };
  crowd.populate(c, PLAYER);
  const service = crowd.service!;
  const free = service.tables.find((t) => t.party === null)!;
  assert.ok(free, `${v.name}: ninguna mesa libre`);
  const calls: PlayerCall[] = [];
  service.onPlayer = (call) => calls.push(call);
  service.seatPlayer(free.def.seats[0]);
  const run = (until: () => boolean, what: string): void => {
    for (let ms = 0; ms < 600 * 500 && !until(); ms += 100) {
      crowd.update(100, c, PLAYER);
      if (ms % 500 === 0) c = tick(c);
    }
    assert.ok(until(), `${v.name}: ${what}`);
  };
  run(() => calls.some((x) => x.kind === 'order'), 'el camarero no viene a tomar nota');
  const order = menu.items.filter((i) => i.hours === undefined).slice(0, 2);
  service.playerOrder(order);
  run(() => calls.some((x) => x.kind === 'served'), 'no llega la comida');
  run(() => calls.some((x) => x.kind === 'finished'), 'no se acaba de comer');
  assert.equal(service.playerAsk('bill'), null, `${v.name}: no se puede pedir la cuenta`);
  run(() => calls.some((x) => x.kind === 'bill'), 'no traen la cuenta');
  const bill = calls.find((x): x is Extract<PlayerCall, { kind: 'bill' }> => x.kind === 'bill')!;
  const expected = order.reduce((s, i) => s + i.price, 0);
  assert.ok(Math.abs(bill.total - expected) < 1e-6, `${v.name}: cuenta ${bill.total} ≠ ${expected}`);
  assert.ok(Math.abs(service.playerPay() - expected) < 1e-6, `${v.name}: lo cobrado no es la cuenta`);
  assert.equal(service.playerStands(), 0, `${v.name}: se levanta debiendo`);
  console.log(`check-food-venues: ${v.name} · sentarse → pedir (${order.map((i) => i.name).join(', ')}) → recibir → comer → pagar ${expected.toFixed(2)} € → irse`);
}

// ------------------------------------------------ 6. para llevar: caja → bolsa → comer

for (const v of FOOD_VENUES.filter((x) => getArchetype(x.archetype).takeaway)) {
  const catalog = getCatalog(`${v.id}-takeaway`);
  const product = catalog.products.find((p) => 'item' in p.effect && p.effect.item.startsWith('food-'))!;
  const itemId = 'item' in product.effect ? product.effect.item : '';
  const broke: Wallet = { money: product.price - 0.01, inventory: {}, cards: {} };
  assert.equal(purchase(broke, product).ok, false, `${v.name}: se puede comprar sin dinero`);
  const rich: Wallet = { money: 50, inventory: {}, cards: {} };
  const bought = purchase(rich, product);
  assert.ok(bought.ok, `${v.name}: ${bought.message}`);
  assert.equal(bought.wallet.inventory[itemId], 1, `${v.name}: no entra en la bolsa`);
  assert.ok(Math.abs(bought.wallet.money - (50 - product.price)) < 1e-6, `${v.name}: cobra otra cosa`);
  const eaten = consume(bought.wallet, itemId);
  assert.ok(eaten.ok && eaten.energy! > 0 && !eaten.wallet.inventory[itemId], `${v.name}: no se come lo que se lleva`);
  console.log(`check-food-venues: ${v.name} · para llevar ${product.label} ${product.price.toFixed(2)} € → bolsa → +${eaten.energy} energía`);
}

console.log(`check-food-venues: ${ARCHETYPES.length} arquetipos · ${FOOD_VENUES.length} locales · ${FOODS.length} platos · OK`);
