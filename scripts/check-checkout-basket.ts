// DEC-04 · la cesta y su pago sin navegador: `node scripts/check-checkout-basket.ts`.
// addLine sin duplicados ni prendas ya tuyas, total en céntimos, payBasket todo o nada y una sola vez, la cesta fuera del
// guardado y los autopagos de Decathlon en su sitio.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECATHLON_STORE, inAisle } from '../src/data/decathlon.ts';
import { DECATHLON_LAYOUT } from '../src/data/decathlonLayout.ts';
import { getStore, STORES } from '../src/data/retail.ts';
import { isWalkable } from '../src/systems/LocationSystem.ts';
import { addLine, linesOf, payBasket, removeLine, total, type BasketLine } from '../src/systems/Basket.ts';
import type { Wallet } from '../src/systems/Commerce.ts';
import type { TilePoint } from '../src/types/game.ts';

const cents = (n: number): number => Math.round(n * 100);
const key = (t: TilePoint): string => `${t.tx},${t.ty}`;
const store = getStore('decathlon');
assert.ok(store.basket, 'Decathlon sin cesta');
const priceOf = (g: string): number => store.stock.find((l) => l.garment === g)!.price;
const A = 'camiseta-tecnica';
const B = 'sudadera-entreno';
const line = (g: string): BasketLine => ({ store: 'decathlon', garment: g, price: priceOf(g) });
const wallet = (money: number): Wallet => ({ money, inventory: { agua: 1 }, cards: { transport: 5 } });

// 1 · addLine: una de cada, y nada que ya esté en el armario.
let basket: readonly BasketLine[] = [];
const a = addLine(basket, line(A), []);
assert.ok(a.ok, a.message);
basket = a.basket;
const dup = addLine(basket, line(A), []);
assert.ok(!dup.ok && dup.basket === basket, 'añade dos veces la misma prenda');
assert.ok(!addLine(basket, line(B), [B]).ok, 'añade una prenda que ya es tuya');
basket = addLine(basket, line(B), []).basket;
assert.equal(basket.length, 2);
assert.deepEqual(removeLine(basket, 'decathlon', A).map((l) => l.garment), [B], 'quitar no quita esa línea');
assert.equal(linesOf(basket, 'otra').length, 0);

// 2 · Total exacto en céntimos.
const want = cents(priceOf(A)) + cents(priceOf(B));
assert.equal(cents(total(basket)), want, 'el total no cuadra en céntimos');

// 3 · Pagar con saldo: cobra exactamente el total, una vez, y entrega todas.
const w0 = wallet(100);
const paid = payBasket(w0, ['gorra-negra'], {}, { 'gorra-negra': 5 }, basket);
assert.ok(paid.ok, paid.ok ? '' : paid.message);
assert.equal(cents(paid.wallet.money), cents(100) - want, 'no cobra exactamente el total');
assert.equal(cents(paid.charged), want);
assert.deepEqual([...paid.wardrobe].sort(), ['gorra-negra', A, B].sort(), 'no entrega todas');
assert.deepEqual(paid.paid, { 'gorra-negra': 5, [A]: priceOf(A), [B]: priceOf(B) }, 'tiques mal apuntados');
assert.deepEqual(paid.wallet.inventory, w0.inventory, 'el pago tocó la bolsa');
assert.equal(w0.money, 100, 'el pago tocó la cartera original');
// Segunda vez con la misma cesta: ya son tuyas, no cobra. Cesta vacía: tampoco.
assert.ok(!payBasket(paid.wallet, paid.wardrobe, {}, paid.paid, basket).ok, 'cobró dos veces la misma cesta');
assert.ok(!payBasket(paid.wallet, paid.wardrobe, {}, paid.paid, []).ok, 'cobró una cesta vacía');

// 4 · Sin saldo para todo (sí para la primera): nada cambia.
const poor = wallet(cents(priceOf(A)) / 100);
const tiques = { 'gorra-negra': 5 };
const broke = payBasket(poor, ['gorra-negra'], {}, tiques, basket);
assert.ok(!broke.ok, 'cobró sin dinero');
assert.deepEqual(poor, wallet(cents(priceOf(A)) / 100), 'sin dinero, la cartera cambió');
assert.deepEqual(tiques, { 'gorra-negra': 5 }, 'sin dinero, los tiques cambiaron');

// 5 · Una línea comprada entre medias (COMPRAR directo): todo o nada.
const mid = payBasket(wallet(100), [B], {}, {}, basket);
assert.ok(!mid.ok, 'pagó una cesta con una prenda ya tuya');

// 6 · La cesta no se guarda: GameState.snapshot (que es lo que escribe el autoguardado) no la menciona.
const gs = readFileSync(new URL('../src/state/GameState.ts', import.meta.url), 'utf8');
assert.match(gs, /private _basket: BasketLine\[\] = \[\];/, 'la cesta no vive en GameState');
const from = gs.indexOf('get snapshot()');
assert.ok(from > 0, 'sin GameState.snapshot');
const body = gs.slice(from, gs.indexOf('\n  }\n', from));
assert.ok(body.length > 100 && !/basket/i.test(body), 'el snapshot guarda la cesta');

// 7 · Los autopagos: uno por máquina, de una tienda con cesta, en suelo pisable que se alcanza desde la puerta, fuera de
// pasillos y de las plazas de los clientes (till, cola, salida) y junto a su máquina.
const loc = DECATHLON_STORE;
const selfs = DECATHLON_LAYOUT.checkouts.filter((c) => c.kind === 'self');
const spots = (loc.spots ?? []).filter((s) => s.selfCheckout);
assert.equal(spots.length, selfs.length, 'no hay un autopago por máquina');
const busy = new Set(DECATHLON_LAYOUT.checkouts.flatMap((c) => [c.till, c.exit, ...c.queue, ...(c.staff ? [c.staff] : [])].map(key)));
const points = new Set(Object.values(loc.points ?? {}).map(key));
const seen = new Set([key(loc.spawns.entry)]);
const queue: TilePoint[] = [loc.spawns.entry];
while (queue.length) {
  const { tx, ty } = queue.shift()!;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = { tx: tx + dx, ty: ty + dy };
    if (seen.has(key(n)) || !isWalkable(loc, n.tx, n.ty)) continue;
    seen.add(key(n));
    queue.push(n);
  }
}
for (const [i, s] of spots.entries()) {
  assert.ok(STORES.some((x) => x.id === s.selfCheckout && x.basket), `${s.name}: su tienda no tiene cesta`);
  assert.ok(isWalkable(loc, s.tx, s.ty), `${s.name}: encima de un mueble`);
  assert.ok(!inAisle(s.tx, s.ty), `${s.name}: en un pasillo`);
  assert.ok(!busy.has(key(s)) && !points.has(key(s)), `${s.name}: sobre una plaza de cliente o un punto`);
  assert.ok(seen.has(key(s)), `${s.name}: no se llega a pie desde la puerta`);
  const machine = { tx: selfs[i].till.tx, ty: selfs[i].till.ty + 1 };
  assert.equal(Math.abs(machine.tx - s.tx) + Math.abs(machine.ty - s.ty), 1, `${s.name}: no está junto a su máquina`);
  assert.ok(loc.props.some((p) => p.kind === 'register' && p.tx === machine.tx && p.ty === machine.ty), `${s.name}: sin máquina`);
}

console.log(`OK · checkout-basket: cesta sin duplicados, total ${(want / 100).toFixed(2)} € exacto, pago todo o nada y único, fuera del guardado y ${spots.length} autopagos`);
