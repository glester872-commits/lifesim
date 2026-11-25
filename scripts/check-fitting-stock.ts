// DEC-06 · probadores y agotados por día en Decathlon. Sin Phaser.
import assert from 'node:assert/strict';
import { SAVE_VERSION } from '../src/config/constants.ts';
import { DECATHLON_STORE } from '../src/data/decathlon.ts';
import { getStore, STORES } from '../src/data/retail.ts';
import type { Appearance } from '../src/data/appearance.ts';
import { addLine, payBasket, type BasketLine } from '../src/systems/Basket.ts';
import type { Wallet } from '../src/systems/Commerce.ts';
import { buyGarment, pickFitting, SOLD_OUT, soldOutList, soldOutToday } from '../src/systems/Retail.ts';
import { stockText } from '../src/systems/StoreKnowledge.ts';
import { getGarment } from '../src/data/retail.ts';

const ID = 'decathlon';
const pool = [...new Set(getStore(ID).stock.map((l) => l.garment))];
const DAYS = 200;

// (a) Estable el mismo día, ≤2 y ≤ mitad; cambia entre días; tiendas sin cesta, nunca.
const seen = new Set<string>();
for (let d = 1; d <= DAYS; d++) {
  const out = soldOutList(ID, d);
  assert.deepEqual(soldOutList(ID, d), out, `día ${d}: el sorteo no es estable`);
  assert.ok(out.length <= 2 && out.length <= Math.floor(pool.length / 2), `día ${d}: demasiados agotados`);
  assert.equal(new Set(out).size, out.length);
  for (const g of out) assert.ok(pool.includes(g));
  seen.add(out.join(','));
  for (const s of STORES.filter((x) => !x.basket)) for (const l of s.stock) assert.ok(!soldOutToday(s.id, l.garment, d), `${s.id}: agotado sin cesta`);
}
assert.ok(seen.size > 3, 'lo agotado no cambia entre días');
// «Mañana lo reponen»: nada agotado dos días seguidos.
for (let d = 1; d < DAYS; d++) for (const g of soldOutList(ID, d)) assert.ok(!soldOutToday(ID, g, d + 1), `${g}: agotado los días ${d} y ${d + 1}`);

// Un día con algo agotado y otro día en que esa prenda está.
const day = [...Array(DAYS).keys()].map((i) => i + 1).find((d) => soldOutList(ID, d).length > 0)!;
assert.ok(day, 'nunca se agota nada');
const gone = soldOutList(ID, day)[0];
const next = day + 1;
assert.ok(!soldOutToday(ID, gone, next), `${gone} no se repone al día siguiente`);
// Lo del armario nunca cuenta como agotado.
assert.ok(!soldOutToday(ID, gone, day, [gone]), 'una prenda tuya, agotada');

// (b) buyGarment, addLine y payBasket lo rechazan sin tocar nada.
const wallet: Wallet = { money: 10_000, inventory: {}, cards: {} };
const look = {} as Appearance;
const buy = buyGarment(wallet, [], look, ID, gone, false, 1, day);
assert.equal(buy.ok, false);
assert.equal(buy.message, SOLD_OUT);
assert.equal(buy.wallet, wallet);
assert.deepEqual(buy.wardrobe, []);
assert.equal(buy.paid, 0);
assert.ok(buyGarment(wallet, [], look, ID, gone, false, 1).ok, 'sin día (check-economy) no debe haber agotados');
const price = getStore(ID).stock.find((l) => l.garment === gone)!.price;
const line: BasketLine = { store: ID, garment: gone, price };
const add = addLine([], line, [], day);
assert.equal(add.ok, false);
assert.equal(add.message, SOLD_OUT);
assert.deepEqual(add.basket, []);
const other = pool.find((g) => !soldOutToday(ID, g, day))!;
const basket: BasketLine[] = [{ store: ID, garment: other, price: getStore(ID).stock.find((l) => l.garment === other)!.price }, line];
const frozen = JSON.stringify(basket);
const pay = payBasket(wallet, [], look, {}, basket, 1, day);
assert.equal(pay.ok, false, 'una cesta con una línea agotada se paga');
if (!pay.ok) assert.ok(pay.message.includes(getGarment(gone).name) && pay.message.includes(SOLD_OUT), `mensaje sin la prenda: ${pay.message}`);
assert.equal(JSON.stringify(basket), frozen);
assert.equal(wallet.money, 10_000);
const later = payBasket(wallet, [], look, {}, basket.filter((l) => !soldOutToday(ID, l.garment, next)), 1, next);
assert.ok(later.ok, 'al día siguiente no se paga');
assert.ok(payBasket(wallet, [], look, {}, basket.filter((l) => l.garment !== gone), 1, day).ok, 'quitando la agotada no se paga');

// (c) stockText omite lo agotado.
const full = stockText(1);
const today = stockText(1, day);
assert.ok(full.includes(getGarment(gone).name.toLowerCase()));
if (!pool.some((g) => g !== gone && getGarment(g).name === getGarment(gone).name)) assert.ok(!today.includes(getGarment(gone).name.toLowerCase()), 'stockText dice lo agotado');

// (d) Guardado intacto.
assert.equal(SAVE_VERSION, 12); // VID-07 subió el esquema (wellbeing).

// (e) DEC-02 · Once probadores (1–5, otra 1, la accesible y 6–9, como en la foto), cada uno con su punto DECAT_FITTING_*
// y su probador derivado, con nombres distintos y la accesible entre ellos.
const pts = Object.keys(DECATHLON_STORE.points ?? {}).filter((k) => /^DECAT_FITTING_\d\d$/.test(k)).sort();
assert.equal(pts.length, 11, 'no hay once DECAT_FITTING');
const fits = DECATHLON_STORE.fittings ?? [];
assert.equal(new Set(fits.map((f) => f.name)).size, fits.length, 'dos probadores con el mismo nombre');
assert.ok(fits.some((f) => f.name === 'Probador accesible'), 'sin probador accesible');
assert.deepEqual(fits.map((f) => f.point).sort(), pts, 'un probador sin punto o un punto sin probador');
for (const f of fits) assert.ok(getStore(f.store).basket, `${f.name}: tienda sin cesta`);

// (f) La cabina: la pedida si está libre, si no la libre más cercana, ninguna si todas ocupadas.
assert.equal(pickFitting(pts[2], pts, () => 'FREE'), pts[2]);
assert.equal(pickFitting(pts[2], pts, (p) => (p === pts[2] || p === pts[1] ? 'IN_USE' : 'FREE')), pts[3]);
assert.equal(pickFitting(pts[0], pts, (p) => (p === pts[4] ? 'FREE' : 'RESERVED')), pts[4]);
assert.equal(pickFitting(pts[0], pts, () => 'IN_USE'), undefined);

console.log(`OK · fitting-stock: agotados estables por día (${seen.size} combinaciones en ${DAYS} días), rechazados en compra, cesta y pago; ${fits.length} probadores`);
