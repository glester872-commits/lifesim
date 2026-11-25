// VID-09 · Cocinar y compartir comidas: la receta de dos ingredientes, lo que sale en la bolsa, los bloqueos sin descuento
// parcial y compartir un plato casero en una quedada en casa. `npm run check`. Falla si algo no se cumple.
import assert from 'node:assert/strict';
import { getCatalog } from '../src/data/catalogs.ts';
import { getActivity, ingredientsOf } from '../src/data/activities.ts';
import { getItem } from '../src/data/items.ts';
import { HOMES } from '../src/data/housing.ts';
import { LOCATIONS } from '../src/data/locations.ts';
import { carryMax, checkout, consume, produce, type Wallet } from '../src/systems/Commerce.ts';
import { applyOutcome, blocker, perform } from '../src/systems/Activities.ts';
import { MEAL, mealBlocker, shareMeal } from '../src/systems/Gifts.ts';
import { playerInGathering } from '../src/systems/HomeGathering.ts';
import { createEvent, emptySocialEvents } from '../src/systems/SocialEvents.ts';
import { createSocialProfile } from '../src/systems/Social.ts';
import { createInitialState, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';

const wallet = (money: number, inventory: Record<string, number> = {}): Wallet => ({ money, inventory, cards: {} });
const cook = getActivity('cook');
const ctx = (inventory: Record<string, number>) => ({ day: 1, hour: 19, minute: 0, money: 0, energy: 50, inventory });

// A · datos.
const meal = getItem(MEAL);
assert.ok(meal.kind === 'food' && meal.energy === 15 && carryMax(MEAL) === 4, 'home-meal: comida, +15, caben 4');
assert.deepEqual(ingredientsOf(cook), [{ item: 'groceries', qty: 1 }, { item: 'bread', qty: 1 }], 'cook gasta compra y pan');
assert.deepEqual(cook.produces, { item: MEAL, qty: 2 }, 'cook da dos platos');
assert.equal(cook.minutes, 45);
assert.equal(cook.effects.energy ?? 0, 0, 'cook ya no da energía directa');
assert.ok(!/\+30/.test(getItem('groceries').where ?? ''), 'la compra aún promete +30');
for (const h of HOMES) {
  const loc = LOCATIONS.find((l) => l.id === h.location);
  assert.ok(loc?.spots?.some((s) => s.activities?.includes('cook')), `${h.id}: sin cocina`);
}

// B · comprar los dos ingredientes cobra.
const SUPER = getCatalog('super-rosales');
let w = checkout(wallet(20), SUPER, 'groceries', 1).wallet;
w = checkout(w, SUPER, 'bread', 1).wallet;
const paid = SUPER.products.find((p) => p.id === 'groceries')!.price + SUPER.products.find((p) => p.id === 'bread')!.price;
assert.equal(w.money, Math.round((20 - paid) * 100) / 100, 'la compra no resta el dinero');

// C · cocinar: perform + aplicar de una vez.
assert.equal(blocker(cook, ctx(w.inventory)), null);
const out = perform(cook);
assert.equal(out.minutes, 45);
const cooked = applyOutcome(w, out);
assert.ok(cooked.ok);
assert.equal(cooked.wallet.inventory.groceries ?? 0, 0);
assert.equal(cooked.wallet.inventory.bread ?? 0, 0);
assert.equal(cooked.wallet.inventory[MEAL], 2);
assert.equal(cooked.wallet.money, w.money, 'cocinar cobró');
assert.equal(w.inventory.groceries, 1, 'aplicar mutó la cartera de entrada');

// D · sin pan: rechazo y nada a medias.
const noBread = wallet(5, { groceries: 1 });
assert.match(blocker(cook, ctx(noBread.inventory)) ?? '', /^Te falta: barra de pan\.$/);
const partial = applyOutcome(noBread, out);
assert.ok(!partial.ok && partial.wallet === noBread && noBread.inventory.groceries === 1, 'descuento parcial sin pan');

// E · bolsa llena de platos.
const fullBag = { groceries: 1, bread: 1, [MEAL]: 3 };
assert.equal(blocker(cook, ctx(fullBag)), 'No te caben más platos caseros en la bolsa. Cómete uno antes.');
assert.equal(blocker(cook, ctx({ ...fullBag, [MEAL]: 2 })), null, 'con 2 caben otros 2');
assert.equal(applyOutcome(wallet(0, fullBag), out).ok, false);

// F · comerse uno.
const eaten = consume(cooked.wallet, MEAL);
assert.ok(eaten.ok && eaten.energy === 15 && eaten.wallet.inventory[MEAL] === 1);

// G · produce es pura.
const g0 = wallet(1, { [MEAL]: 1 });
const g1 = produce(g0, MEAL, 2);
assert.ok(g1.ok && g1.wallet.inventory[MEAL] === 3 && g0.inventory[MEAL] === 1, 'produce mutó la cartera');
assert.ok(!produce(g0, MEAL, 4).ok && g0.inventory[MEAL] === 1);

// H · guardar y cargar.
const store = new Map<string, string>();
const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
const save = new SaveSystem(storage);
assert.ok(save.save({ ...createInitialState(), inventory: { [MEAL]: 2, bread: 1 } }));
assert.deepEqual(save.load()!.inventory, { [MEAL]: 2, bread: 1 }, 'home-meal no vuelve al cargar');
assert.ok(save.save({ ...createInitialState(), inventory: { bread: 1 } }));
assert.deepEqual(save.load()!.inventory, { bread: 1 }, 'un save sin home-meal no carga');

// I · compartir.
const at = { day: 3, hour: 20, minute: 30 };
const known = { ...createSocialProfile(), encounters: 2 };
assert.match(shareMeal(createSocialProfile(), wallet(0, { [MEAL]: 1 }), at).message, /no os conocéis/, 'a una desconocida');
assert.equal(mealBlocker(known, wallet(0), at.day), 'No llevas ningún plato casero. Se cocinan en la cocina de casa.');
const one = wallet(0, { [MEAL]: 1 });
const gave = shareMeal(known, one, at);
assert.ok(gave.ok && gave.energy === 0 && !(MEAL in gave.wallet.inventory) && one.inventory[MEAL] === 1, 'con uno: se lo das, sin energía para ti');
assert.equal(gave.profile.friendship - known.friendship, 5);
assert.equal(gave.profile.trust - known.trust, 2);
assert.equal(gave.profile.mood - known.mood, 8);
const mem = gave.profile.memories.at(-1)!;
assert.ok(mem.kind === 'SHARED_EVENT' && mem.outcome === 'positive' && mem.note === 'comida: plato casero' && mem.day === at.day);
const again = shareMeal(gave.profile, wallet(0, { [MEAL]: 2 }), { ...at, minute: 45 });
assert.ok(!again.ok && again.wallet.inventory[MEAL] === 2, 'dos veces el mismo día');
assert.ok(shareMeal(gave.profile, wallet(0, { [MEAL]: 1 }), { ...at, day: 4 }).ok, 'otro día sí');
const two = shareMeal(known, wallet(0, { [MEAL]: 3 }), at);
assert.ok(two.ok && two.energy === 15 && two.wallet.inventory[MEAL] === 1, 'con dos o más: coméis los dos, salen dos');

// J · presencia en la quedada.
const home = HOMES[0];
const ev = createEvent(emptySocialEvents(), { venueId: home.location, day: 3, startMin: 20 * 60, endMin: 22 * 60, invitees: [{ npc: 'sara', decision: { accept: true, reason: 'Vale' } }], now: 2 * 1440 });
assert.ok(ev.created);
const abs = (h: number): number => 2 * 1440 + h * 60;
assert.ok(playerInGathering(ev.state, 'sara', home.location, abs(21)), 'en la franja y en casa');
assert.ok(!playerInGathering(ev.state, 'sara', home.location, abs(19)), 'antes de la franja');
assert.ok(!playerInGathering(ev.state, 'sara', home.location, abs(22)), 'al acabar');
assert.ok(!playerInGathering(ev.state, 'sara', 'street', abs(21)), 'fuera de casa');
assert.ok(!playerInGathering(ev.state, 'ada', home.location, abs(21)), 'no invitada');

console.log(`OK: cocina en ${HOMES.length} viviendas; compra + pan → 2 platos caseros en 45 min, todo o nada; bolsa de ${carryMax(MEAL)}; ` +
  'compartir: conocerse, llevar plato, una vez al día; con 1 plato se lo das, con 2+ coméis los dos.');
