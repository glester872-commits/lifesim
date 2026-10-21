// Súper Rosales (CV-02): pagar en caja con cantidad (systems/Commerce.checkout), todo lo que se vende tiene uso, la
// ducha con gel y la cesta básica frente a los ingresos de verdad. `npm run check`. Falla si algo no se cumple.
import assert from 'node:assert/strict';
import { getCatalog } from '../src/data/catalogs.ts';
import { ACTIVITIES, PLACE_ACTIVITIES, getActivity } from '../src/data/activities.ts';
import { getItem } from '../src/data/items.ts';
import { getJob } from '../src/data/jobs.ts';
import { BILLS } from '../src/data/household.ts';
import { LOCATIONS } from '../src/data/locations.ts';
import { carryMax, checkout, consume, maxQty, productUse, type Wallet } from '../src/systems/Commerce.ts';
import { blocker, perform } from '../src/systems/Activities.ts';
import { isOpen, placeInfo } from '../src/systems/Places.ts';
import { createInitialState, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import { destinationsFrom, getStop } from '../src/systems/Transit.ts';
import { POPULATION_PROFILES } from '../src/data/population.ts';

const SUPER = getCatalog('super-rosales');
const wallet = (money: number, inventory: Record<string, number> = {}): Wallet => ({ money, inventory, cards: {} });
const price = (id: string): number => SUPER.products.find((p) => p.id === id)!.price;

// La tienda: interior con su caja en este catálogo, puerta en la calle y horario.
const room = LOCATIONS.find((l) => l.id === 'supermarket')!;
assert.ok(room.terminals?.some((t) => t.catalog === 'super-rosales'), 'la caja de Súper Rosales no vende su catálogo');
const place = placeInfo('supermarket')!;
// La caja del jugador queda libre: ni clientes ni personal tienen un punto de su rutina en el tile desde el que se paga
// (antes los clientes pagaban ahí y, en hora punta, la E hablaba con ellos en vez de abrir la caja).
const till = room.terminals!.find((t) => t.catalog === 'super-rosales')!;
const profile = POPULATION_PROFILES.find((p) => p.place === 'supermarket')!;
const prefixes = [...profile.staff.flatMap((s) => s.points), ...profile.visitors.flatMap((v) => v.plan.flatMap((step) => step.points))];
const used = Object.entries(room.points ?? {}).filter(([id]) => prefixes.some((p) => id.startsWith(p)));
assert.ok(used.length > 0, 'la rutina del súper no encuentra sus puntos');
for (const [id, pt] of used) assert.ok(!(pt.tx === till.tx && pt.ty === till.ty + 1), `${id} está en la caja del jugador`);
assert.ok(isOpen(place, 1, 10, 0) && !isOpen(place, 1, 22, 0) && !isOpen(place, 1, 8, 59), 'horario 09:00–22:00');

// Un catálogo pequeño en el que todo se usa: se come o se bebe con energía, se cocina o se gasta en una actividad de un sitio.
assert.ok(SUPER.checkout && SUPER.products.length >= 10 && SUPER.products.length <= 15, 'entre 10 y 15 artículos, con caja');
const usedBySpot = (activity: string): boolean => LOCATIONS.some((l) => l.spots?.some((s) => s.activities?.includes(activity)));
for (const p of SUPER.products) {
  assert.ok('item' in p.effect, `${p.id}: el súper sólo vende cosas`);
  const item = getItem(p.effect.item);
  if (item.kind === 'food' || item.kind === 'drink') assert.ok((item.energy ?? 0) > 0, `${p.id}: comida sin efecto`);
  else {
    const uses = [...ACTIVITIES, ...PLACE_ACTIVITIES].filter((a) => a.consumes?.item === item.id && usedBySpot(a.id));
    assert.ok(uses.length > 0, `${p.id}: se vende sin actividad que lo use en ningún sitio`);
    assert.ok(item.where, `${p.id}: no dice dónde se usa`);
  }
  assert.ok(productUse(p).length > 0);
}

// Pagar: exacto, insuficiente, cantidades raras, bolsa llena, producto de otra tienda. Si falla, la cartera no cambia.
const exact = checkout(wallet(2.7), SUPER, 'bread', 3);
assert.ok(exact.ok && exact.wallet.money === 0 && exact.wallet.inventory.bread === 3, 'saldo exacto: 3 × €0,90 con €2,70');
const poor = wallet(2.69);
const short = checkout(poor, SUPER, 'bread', 3);
assert.ok(!short.ok && short.reason === 'money' && short.wallet === poor && !('bread' in poor.inventory), 'un céntimo menos no paga ni entrega');
for (const qty of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
  const r = checkout(wallet(50), SUPER, 'water', qty);
  assert.ok(!r.ok && r.reason === 'qty', `cantidad ${qty} aceptada`);
}
assert.equal(checkout(wallet(50), SUPER, 'ibuprofen', 1).reason, 'not-sold', 'vende algo que no está en su lista');
assert.equal(checkout(wallet(50), SUPER, 'no-existe', 1).reason, 'not-sold');
const full = wallet(100, { water: carryMax('water') - 1 });
const tooMany = checkout(full, SUPER, 'water', 2);
assert.ok(!tooMany.ok && tooMany.reason === 'full' && tooMany.wallet.money === 100 && /caben 12/.test(tooMany.message), 'bolsa llena: se explica y no cobra');
assert.ok(checkout(full, SUPER, 'water', 1).ok, 'la última que cabe');
// El gel trae 8 duchas y caben 16: dos botes, no tres.
const gel = checkout(wallet(10), SUPER, 'shower-gel', 2);
assert.ok(gel.ok && gel.wallet.inventory['shower-gel'] === 16 && gel.wallet.money === 6.1, 'dos botes de gel: 16 duchas por €3,90');
assert.equal(checkout(gel.wallet, SUPER, 'shower-gel', 1).reason, 'full');
// Lo que la ficha deja subir: lo que llega y lo que cabe, nunca más.
assert.equal(maxQty(wallet(2.7), SUPER.products.find((p) => p.id === 'bread')!), 3);
assert.equal(maxQty(wallet(100, { 'shower-gel': 9 }), SUPER.products.find((p) => p.id === 'shower-gel')!), 0);
// Céntimos: 3 × €1,45 son €4,35, no 4,3500000001.
assert.equal(checkout(wallet(10), SUPER, 'juice', 3).wallet.money, 5.65);
// No toca la cartera que se le pasa: repetir la misma llamada no cobra dos veces.
const w0 = wallet(20);
checkout(w0, SUPER, 'groceries', 2);
assert.deepEqual(w0, wallet(20), 'checkout cambió la cartera de entrada');

// Usar: comida desde la bolsa da energía; el gel no se come, se gasta en la ducha de casa.
const bag = checkout(wallet(20), SUPER, 'ready-meal', 1).wallet;
const eaten = consume(bag, 'ready-meal');
assert.ok(eaten.ok && eaten.energy === 16 && !('ready-meal' in eaten.wallet.inventory));
assert.ok(!consume(gel.wallet, 'shower-gel').ok, 'el gel se come');
const shower = getActivity('shower-gel');
const ctx = { day: 1, hour: 9, minute: 0, money: 0, energy: 50 };
assert.match(blocker(shower, { ...ctx, inventory: {} }) ?? '', /gel de ducha/, 'sin gel se puede la ducha con gel');
assert.equal(blocker(shower, { ...ctx, inventory: { 'shower-gel': 1 } }), null);
const out = perform(shower);
assert.ok(out.consumes?.item === 'shower-gel' && out.consumes.qty === 1 && out.energy > perform(getActivity('shower')).energy, 'la ducha con gel gasta uno y da más que la normal');

// Guardar y cargar con lo comprado: mismos ids, mismas unidades, mismo dinero.
const store = new Map<string, string>();
const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
const save = new SaveSystem(storage);
const bought = { ...createInitialState(), money: gel.wallet.money, inventory: { ...gel.wallet.inventory, juice: 2 } };
assert.ok(save.save(bought));
const loaded = save.load()!;
assert.deepEqual([loaded.money, loaded.inventory], [bought.money, bought.inventory], 'lo comprado no vuelve igual al cargar');

// Cesta básica de una semana en Súper Rosales, con los precios de la lista, frente a lo que entra con el primer empleo.
const basket: Record<string, number> = { groceries: 5, 'ready-meal': 2, bread: 4, fruit: 2, water: 4, juice: 1, 'shower-gel': 1 };
const weekly = Object.entries(basket).reduce((sum, [id, n]) => sum + price(id) * n, 0);
const level = getJob('decathlon').levels[0];
const income = level.wage * level.days.length;
const bills = BILLS.reduce((sum, b) => sum + (b.amount * 7) / b.every, 0);
const fare = destinationsFrom(getStop('vallesco')).find((d) => d.stop.id === 'decathlon')!.fare;
const metro = 2 * fare * level.days.length;
const left = income - bills - metro - weekly;
assert.ok(left > 0.15 * income, `la cesta no deja margen: entra €${income}, casa €${bills}, metro €${metro}, cesta €${weekly.toFixed(2)}`);

console.log(`OK: Súper Rosales, ${SUPER.products.length} artículos con uso; caja con cantidad, todo o nada; cesta semanal €${weekly.toFixed(2)} ` +
  `(5 comidas cocinadas, 2 platos, 4 panes, 2 de fruta, 4 aguas, 1 zumo, 1 gel) frente a €${income} del primer empleo − €${bills} de casa − €${metro} de metro: quedan €${left.toFixed(2)}.`);
