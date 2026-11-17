// ECO-01 · Compraventa Rastro → Segunda Vuelta (systems/Retail.sellItem/resaleOffer, CAS-09 PlayerStall): `npm run check`.
// Falla si comprar como Menus no deja el tique de lo cobrado, si vender no paga una sola vez y consume unidad y tique, si
// algún objeto del Rastro se recompra por lo que costó o más, si comprar y vender en bucle gana dinero, si se vende una
// unidad listada en tu puesto, si un guardado sin tiques cobra, si un tique 0/negativo/NaN paga, si una tienda sin
// buysItems compra, o si la bolsa (resaleOffer) anuncia otra tienda u otro importe que el de sellItem.
// Control positivo (comentado): quitar en sellItem la comprobación `have - reserved < 1` debe hacer fallar (5).
import assert from 'node:assert/strict';
import { CATALOGS, type Catalog, type Product } from '../src/data/catalogs.ts';
import { PLAYER_STALL } from '../src/data/playerStall.ts';
import { STORES, getStore } from '../src/data/retail.ts';
import { checkout, type Wallet } from '../src/systems/Commerce.ts';
import { list, reserve } from '../src/systems/PlayerStall.ts';
import { resaleOffer, resaleValue, sellItem } from '../src/systems/Retail.ts';
import { forceWeather } from '../src/systems/Weather.ts';

const wallet = (money: number, inventory: Record<string, number> = {}): Wallet => ({ money, inventory, cards: {} });
const VUELTA = 'vuelta';
const RASTRO = CATALOGS.filter((c) => c.id.startsWith('rastro-'));
const itemOf = (p: Product): string | undefined => ('item' in p.effect && p.effect.item.startsWith('rastro-') ? p.effect.item : undefined);
const LINES = RASTRO.flatMap((c) => c.products.filter((p) => itemOf(p)).map((p) => ({ c, p, item: itemOf(p)! })));
assert.ok(LINES.length > 0, 'no hay productos rastro-* en los catálogos del Rastro');

/** Lo mismo que Menus.openCatalog con un puesto con caja: Commerce.checkout de 1 y el tique de lo cobrado. */
const buy = (w: Wallet, tiques: Record<string, number[]>, c: Catalog, p: Product, f = 1): { w: Wallet; tiques: Record<string, number[]> } => {
  const r = checkout(w, c, p.id, 1, f);
  assert.ok(r.ok, `${c.id}/${p.id}: ${r.message}`);
  const item = itemOf(p)!;
  const charged = Math.round(p.price * f * 100) / 100;
  return { w: r.wallet, tiques: { ...tiques, [item]: [...(tiques[item] ?? []), charged] } };
};

// ------------------------------------------------ (1) comprar en un puesto real deja el tique de lo cobrado
const { c: cat, p: prod, item } = LINES[0];
const bought = buy(wallet(100), {}, cat, prod);
assert.equal(bought.w.money, Math.round((100 - prod.price) * 100) / 100, 'la compra no cobra el precio');
assert.equal(bought.w.inventory[item], 1, 'la compra no entra en la bolsa');
assert.deepEqual(bought.tiques[item], [prod.price], 'el tique no es lo cobrado');

// ------------------------------------------------ (2) venderlo en Segunda Vuelta, una sola vez
const sold = sellItem(bought.w, bought.tiques, VUELTA, item);
assert.ok(sold.ok, `no se vende: ${sold.ok ? '' : sold.message}`);
assert.equal(sold.amount, resaleValue(prod.price));
assert.equal(sold.wallet.money, Math.round((bought.w.money + sold.amount) * 100) / 100, 'no paga amount una vez');
assert.equal(sold.wallet.inventory[item], undefined, 'la unidad no sale');
assert.equal(sold.paidItems[item], undefined, 'el tique no sale');
const again = sellItem(sold.wallet, sold.paidItems, VUELTA, item);
assert.equal(again.ok, false, 'la segunda venta pasa');

// ------------------------------------------------ (3) sin arbitraje en ningún producto del Rastro (lista y regateado)
for (const { c, p, item: id } of LINES) {
  assert.ok(p.price > 0, `${c.id}/${p.id}: precio ${p.price}`);
  for (const f of [1, 0.9, 0.75, 0.6]) {
    const paid = Math.round(p.price * f * 100) / 100;
    assert.ok(resaleValue(paid) < paid, `${c.id}/${p.id} ×${f}: da ${resaleValue(paid)} por ${paid}`);
    const r = sellItem(wallet(0, { [id]: 1 }), { [id]: [paid] }, VUELTA, id);
    if (r.ok) assert.ok(r.amount < paid, `${c.id}/${p.id} ×${f}: sellItem da ${r.amount}`);
  }
}

// ------------------------------------------------ (4) 20 vueltas de compra-venta pierden dinero
{
  let w = wallet(500);
  let t: Record<string, number[]> = {};
  for (let i = 0; i < 20; i++) {
    const { c, p, item: id } = LINES[i % LINES.length];
    ({ w, tiques: t } = buy(w, t, c, p));
    const r = sellItem(w, t, VUELTA, id);
    assert.ok(r.ok, `vuelta ${i}: ${r.ok ? '' : r.message}`);
    w = r.wallet;
    t = r.paidItems;
  }
  assert.ok(w.money < 500, `el bucle gana dinero: ${w.money}`);
}

// ------------------------------------------------ (5) lo listado en tu puesto no se vende en la tienda
forceWeather({ rain: 0 });
const booked = reserve(undefined, 20, { day: 6, hour: 12, minute: 0 });
assert.ok(booked.ok, 'no reserva puesto');
const refuseNoTouch = (w: Wallet, t: Record<string, number[]>, reserved: number): void => {
  const before = structuredClone({ w, t });
  const r = sellItem(w, t, VUELTA, item, reserved);
  assert.equal(r.ok, false, `reserved ${reserved}: se vende lo listado`);
  if (!r.ok) assert.equal(r.message, 'Está en tu puesto del Rastro: retíralo primero.');
  assert.deepEqual({ w, t }, before, 'el rechazo toca algo');
};
{
  const w = wallet(10, { [item]: 1 });
  const t = { [item]: [prod.price] };
  const l = list(booked.stall, w.inventory, item, PLAYER_STALL.minPrice);
  assert.ok(l.ok, `no se lista: ${l.ok ? '' : l.message}`);
  refuseNoTouch(w, t, l.stall.listings.filter((x) => x.itemId === item).length);
}
{
  const w = wallet(10, { [item]: 2 });
  const t = { [item]: [prod.price, prod.price] };
  const l = list(booked.stall, w.inventory, item, PLAYER_STALL.minPrice);
  assert.ok(l.ok);
  const reserved = l.stall.listings.filter((x) => x.itemId === item).length;
  assert.equal(reserved, 1);
  const r = sellItem(w, t, VUELTA, item, reserved);
  assert.ok(r.ok, `con 2 y 1 listada no vende: ${r.ok ? '' : r.message}`);
  assert.equal(r.wallet.inventory[item], 1, 'no queda la unidad listada');
  refuseNoTouch(r.wallet, r.paidItems, reserved);
}

// ------------------------------------------------ (6) guardado legacy sin paidItems: no paga
{
  const w = wallet(7, { [item]: 1 });
  const r = sellItem(w, {}, VUELTA, item);
  assert.equal(r.ok, false, 'sin tiques se vende');
  assert.equal(w.money, 7);
  assert.equal(resaleOffer(item, {})?.amount, 0, 'la bolsa anuncia importe sin tique');
}

// ------------------------------------------------ (7) tiques 0, negativos o NaN
for (const bad of [0, -5, NaN]) {
  assert.equal(resaleValue(bad), 0, `resaleValue(${bad})`);
  const w = wallet(3, { [item]: 1 });
  assert.equal(sellItem(w, { [item]: [bad] }, VUELTA, item).ok, false, `tique ${bad} se vende`);
}

// ------------------------------------------------ (8) una tienda sin buysItems no compra
const others = STORES.filter((s) => !s.buysItems);
assert.ok(others.length > 0);
for (const s of others) assert.equal(sellItem(wallet(0, { [item]: 1 }), { [item]: [20] }, s.id, item).ok, false, `${s.id} compra`);

// ------------------------------------------------ (9) la bolsa anuncia la tienda y el importe de sellItem
for (const { item: id, p } of LINES) {
  const t = { [id]: [p.price] };
  const offer = resaleOffer(id, t);
  assert.ok(offer, `${id}: nadie lo compra`);
  assert.equal(offer.store, getStore(VUELTA).name, `${id}: anuncia ${offer.store}`);
  assert.equal(offer.paid, p.price);
  const r = sellItem(wallet(0, { [id]: 1 }), t, VUELTA, id);
  assert.equal(offer.amount, r.ok ? r.amount : 0, `${id}: la bolsa dice ${offer.amount}`);
}
assert.equal(resaleOffer('water', { water: [5] }), undefined, 'la bolsa anuncia comprador para el agua');

console.log(`check-eco-01: ${LINES.length} productos del Rastro sin arbitraje · ${prod.label} ${prod.price} → ${sold.amount} en ${getStore(VUELTA).name}`);
