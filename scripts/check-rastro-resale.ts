// CAS-05 · Venta de objetos del Rastro en Segunda Vuelta (systems/Retail.sellItem) y sus tiques (paidItems): `npm run check`.
// Falla si un objeto con tique no se vende por resaleValue de su tique más antiguo, si da más de lo pagado, si un rechazo
// toca algo, si la segunda venta del único objeto pasa, si no es FIFO, si los tiques no sobreviven al guardado o uno
// dañado lanza, si la reventa de ropa cambia, o si vender una rareza la devuelve al puesto
// (vender una rareza NO la devuelve al puesto: sigue agotada en su edición).
// Control positivo (comentado): cambiar en sellItem `tiques[0]` por `tiques[tiques.length - 1]` debe hacer fallar (e);
// quitar `delete inventory[itemId]` debe hacer fallar (a) y (d).
import assert from 'node:assert/strict';
import { STORES, getStore } from '../src/data/retail.ts';
import type { Wallet } from '../src/systems/Commerce.ts';
import { buysItem, resaleValue, sellGarment, sellItem } from '../src/systems/Retail.ts';
import { BASE_DRAFT, newGameState } from '../src/systems/CharacterCreator.ts';
import { SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import { ledgerFor, markSold, rareStatus, weekStock } from '../src/systems/Rastro.ts';

const round2 = (n: number): number => Math.round(n * 100) / 100;
const wallet = (money: number, inventory: Record<string, number>): Wallet => ({ money, inventory, cards: {} });

// ------------------------------------------------ (a) común, libro y rareza con tique 20: te dan 8
assert.ok(getStore('vuelta').buysItems?.includes('rastro-*'), 'Segunda Vuelta no compra objetos del Rastro');
for (const id of ['rastro-vinyl', 'rastro-book', 'rastro-vinyl-first']) {
  const w = wallet(10, { [id]: 1, water: 2 });
  const tiques = { [id]: [20] };
  const before = structuredClone({ w, tiques });
  const r = sellItem(w, tiques, 'vuelta', id);
  assert.ok(r.ok, `${id}: ${r.ok ? '' : r.message}`);
  assert.equal(r.amount, 8, `${id}: da ${r.amount}`);
  assert.equal(r.wallet.money, 18, `${id}: el saldo no sube 8`);
  assert.equal(r.wallet.inventory[id], undefined, `${id}: sigue en la bolsa`);
  assert.equal(r.wallet.inventory.water, 2, `${id}: toca otro objeto`);
  assert.deepEqual(r.paidItems, {}, `${id}: el tique no desaparece`);
  assert.deepEqual({ w, tiques }, before, `${id}: sellItem muta su entrada`);
}

// ------------------------------------------------ (b) regateado y tope
const haggled = sellItem(wallet(0, { 'rastro-figure': 1 }), { 'rastro-figure': [30.8] }, 'vuelta', 'rastro-figure');
assert.ok(haggled.ok);
assert.equal(haggled.amount, resaleValue(30.8));
assert.ok(haggled.amount > 0 && haggled.amount < 30.8, `regateado da ${haggled.amount}`);
for (const p of [1, 2, 3, 12.34, 30.8, 99.99, 120, 5000]) {
  const r = sellItem(wallet(0, { 'rastro-badge': 1 }), { 'rastro-badge': [p] }, 'vuelta', 'rastro-badge');
  assert.ok(r.ok, `tique ${p}`);
  assert.ok(r.amount < p && r.amount <= 40, `tique ${p}: da ${r.amount}`);
}
// Un tique tan bajo que su 40 % redondea a 0 no se compra: nunca se paga 0 € ni se regala.
{
  const w = wallet(0, { 'rastro-badge': 1 });
  const t = { 'rastro-badge': [0.02] };
  const before = structuredClone({ w, t });
  const r = sellItem(w, t, 'vuelta', 'rastro-badge');
  assert.equal(r.ok, false, 'tique 0.02: se acepta');
  assert.deepEqual({ w, t }, before, 'tique 0.02: el rechazo toca cartera, bolsa o tiques');
  assert.equal(resaleValue(0.02), 0, 'tique 0.02: resaleValue no es 0');
}
const capped = sellItem(wallet(0, { 'rastro-camera-slr': 1 }), { 'rastro-camera-slr': [120] }, 'vuelta', 'rastro-camera-slr');
assert.ok(capped.ok);
assert.equal(capped.amount, 40, 'tique 120 no topa en 40');

// ------------------------------------------------ (c) rechazos sin tocar nada
const refuse = (w: Wallet, t: Record<string, number[]>, store: string, id: string, message: string): void => {
  const before = structuredClone({ w, t });
  const r = sellItem(w, t, store, id);
  assert.equal(r.ok, false, `${store}/${id}: se acepta`);
  if (!r.ok) assert.equal(r.message, message, `${store}/${id}: ${r.message}`);
  assert.deepEqual({ w, t }, before, `${store}/${id}: el rechazo toca algo`);
};
refuse(wallet(5, { 'rastro-vinyl': 1 }), {}, 'vuelta', 'rastro-vinyl', 'Sin tique no lo quieren.');
refuse(wallet(5, { 'rastro-vinyl': 1 }), { 'rastro-vinyl': [] }, 'vuelta', 'rastro-vinyl', 'Sin tique no lo quieren.');
refuse(wallet(5, { 'rastro-badge': 1 }), { 'rastro-badge': [0.01] }, 'vuelta', 'rastro-badge', 'Sin tique no lo quieren.');
const others = STORES.filter((s) => !s.buysItems);
assert.ok(others.length > 0, 'no hay tienda sin buysItems');
for (const s of others) refuse(wallet(5, { 'rastro-vinyl': 1 }), { 'rastro-vinyl': [20] }, s.id, 'rastro-vinyl', 'Aquí no compran eso.');
refuse(wallet(5, { 'rastro-vinyl': 1 }), { 'rastro-vinyl': [20] }, 'no-existe', 'rastro-vinyl', 'Aquí no compran eso.');
refuse(wallet(5, { water: 1 }), { water: [20] }, 'vuelta', 'water', 'Aquí no compran eso.');
refuse(wallet(5, {}), { 'rastro-book': [20] }, 'vuelta', 'rastro-book', 'No lo llevas.');
refuse(wallet(5, { 'rastro-book': 0 }), { 'rastro-book': [20] }, 'vuelta', 'rastro-book', 'No lo llevas.');
assert.ok(buysItem('vuelta', 'rastro-x') && !buysItem('vuelta', 'rastro') && !buysItem('vuelta', 'water'), 'prefijo mal aplicado');

// ------------------------------------------------ (d) la segunda venta del único objeto
const once = sellItem(wallet(0, { 'rastro-book': 1 }), { 'rastro-book': [20, 20] }, 'vuelta', 'rastro-book');
assert.ok(once.ok);
refuse(once.wallet, once.paidItems, 'vuelta', 'rastro-book', 'No lo llevas.');

// ------------------------------------------------ (e) FIFO con dos unidades y dos tiques
const first = sellItem(wallet(0, { 'rastro-vinyl': 2 }), { 'rastro-vinyl': [20, 50] }, 'vuelta', 'rastro-vinyl');
assert.ok(first.ok);
assert.equal(first.amount, resaleValue(20), 'no vende el tique más antiguo');
assert.equal(first.wallet.inventory['rastro-vinyl'], 1);
assert.deepEqual(first.paidItems, { 'rastro-vinyl': [50] });
const second = sellItem(first.wallet, first.paidItems, 'vuelta', 'rastro-vinyl');
assert.ok(second.ok);
assert.equal(second.amount, resaleValue(50));
assert.equal(second.wallet.money, round2(resaleValue(20) + resaleValue(50)));
assert.equal(second.wallet.inventory['rastro-vinyl'], undefined);
assert.deepEqual(second.paidItems, {});

// ------------------------------------------------ (f) guardado
const store = new Map<string, string>();
const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
const save = new SaveSystem(storage);
const start = newGameState(BASE_DRAFT);
const tiques = { 'rastro-vinyl': [12, 10.8], 'rastro-book-signed': [25] };
assert.ok(save.save({ ...start, paidItems: tiques }));
assert.deepEqual(save.load()!.paidItems, tiques, 'los tiques no sobreviven al guardado');
assert.ok(save.save({ ...start }));
assert.deepEqual(save.load()!.paidItems ?? {}, {}, 'una partida sin tiques carga alguno');
const damaged: unknown[] = [
  'basura', 42, null, [1, 2],
  { 'rastro-vinyl': [NaN, Infinity, -3, 0, 0.004, '12', null, 12.346], 'rastro-book': 'x', 'rastro-badge': [], 'rastro-figure': { a: 1 } },
];
for (const d of damaged) {
  assert.doesNotThrow(() => save.save({ ...start, paidItems: d as Record<string, number[]> }));
  const loaded = save.load();
  assert.ok(loaded, `${JSON.stringify(d)}: no carga`);
  const got = loaded.paidItems ?? {};
  for (const [id, list] of Object.entries(got)) {
    assert.ok(Array.isArray(list) && list.length > 0, `${id}: lista vacía o no lista`);
    for (const n of list) assert.ok(Number.isFinite(n) && n >= 0.01 && n === round2(n), `${id}: ${n}`);
  }
}
assert.deepEqual(save.load()!.paidItems, { 'rastro-vinyl': [12.35] }, 'el saneado no conserva sólo lo válido');

// ------------------------------------------------ (g) la ropa de 'vuelta' se revende igual que antes
assert.equal(resaleValue(20), 8);
assert.equal(resaleValue(120), 40);
assert.equal(resaleValue(undefined), 0);
const vuelta = getStore('vuelta');
assert.ok(vuelta.buysBack, 'Segunda Vuelta ya no compra ropa');
for (const line of vuelta.stock) {
  const g = line.garment;
  const r = sellGarment(wallet(0, {}), [g], {}, { [g]: line.price }, 'vuelta', g);
  assert.ok(r.ok, `${g}: ${r.message}`);
  assert.equal(r.amount, resaleValue(line.price), `${g}: reventa ${r.amount}`);
  assert.ok(r.amount < line.price);
  assert.deepEqual(r.wardrobe, []);
  assert.deepEqual(r.paid, {});
}

// ------------------------------------------------ (h) una rareza vendida sigue agotada en su edición
const SUNDAYS = Array.from({ length: 52 }, (_, i) => 7 + 7 * i);
const DAY = SUNDAYS.find((d) => weekStock('rastro-discos', d).includes('rastro-vinyl-first'));
assert.ok(DAY, 'el vinilo de primera edición no sale en un año');
const ledger = markSold(undefined, DAY, 'rastro-vinyl-first');
const ledgerBefore = structuredClone(ledger);
const resold = sellItem(wallet(0, { 'rastro-vinyl-first': 1 }), { 'rastro-vinyl-first': [35] }, 'vuelta', 'rastro-vinyl-first');
assert.ok(resold.ok, `la rareza no se vende: ${resold.ok ? '' : resold.message}`);
assert.deepEqual(Object.keys(resold).sort(), ['amount', 'ok', 'paidItems', 'wallet'], 'sellItem devuelve algo más que ok/wallet/paidItems/amount');
assert.equal(resold.wallet.inventory['rastro-vinyl-first'], undefined, 'la rareza vendida sigue en la bolsa');
assert.equal(resold.paidItems['rastro-vinyl-first'], undefined, 'el tique de la rareza vendida no desaparece');
assert.deepEqual(ledger, ledgerBefore, 'vender la rareza toca el ledger del Rastro');
assert.ok(ledgerFor(ledger, DAY).sold.includes('rastro-vinyl-first'), 'la rareza revendida sale de sold en su edición');
assert.equal(rareStatus('rastro-discos', 'rastro-vinyl-first', DAY, ledger, true), 'sold', 'la rareza revendida no vuelve al puesto');

console.log(`check-rastro-resale: tique 20 → 8 · 30.8 → ${haggled.amount} · 120 → ${capped.amount} · FIFO ${first.amount}+${second.amount} · ${vuelta.stock.length} prendas de Vuelta`);
