// DEC-03 · compras deportivas en Decathlon sin navegador: `node scripts/check-decathlon-sport.ts`.
// Catálogo (prendas nuevas con marca y hueco), stock sin duplicados, percheros que enseñan algo y se alcanzan a pie, y
// el cobro de buyGarment: exacto, una sola vez, y nada si no llega el dinero.
import assert from 'node:assert/strict';
import { DECATHLON_STORE, inAisle } from '../src/data/decathlon.ts';
import { DECATHLON_LAYOUT } from '../src/data/decathlonLayout.ts';
import { CATEGORIES, GARMENTS, getGarment, getStore } from '../src/data/retail.ts';
import { getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { buyGarment, stockOf } from '../src/systems/Retail.ts';
import type { Wallet } from '../src/systems/Commerce.ts';
import type { TilePoint } from '../src/types/game.ts';

const NEW = ['cortavientos-trazo', 'polar-ondra', 'zapatilla-trail-trazo', 'gorra-running-trazo', 'gafas-deporte-ondra'];
const NEW_RACKS = ['Chaquetas de montaña', 'Gorras y gafas'];
const cents = (n: number): number => Math.round(n * 100);
const key = (t: TilePoint): string => `${t.tx},${t.ty}`;

// 1 · Las prendas nuevas: existen, se dibujan, id único y con su marca.
assert.equal(new Set(GARMENTS.map((g) => g.id)).size, GARMENTS.length, 'hay ids de prenda repetidos');
for (const id of NEW) {
  const g = getGarment(id);
  assert.ok(g.slot && CATEGORIES[g.category].slot === g.slot, `${id}: sin hueco donde ponérsela`);
  assert.ok(g.brand === 'Trazo' || g.brand === 'Ondra', `${id}: sin marca de la casa`);
}

// 2 · El stock de Decathlon: sin prenda repetida, todo con precio, y las nuevas por debajo de 30 €.
const store = getStore('decathlon');
assert.equal(new Set(store.stock.map((l) => l.garment)).size, store.stock.length, 'decathlon: prenda repetida en el stock');
for (const l of store.stock) assert.ok(l.price > 0, `${l.garment}: sin precio`);
for (const id of NEW) {
  const line = store.stock.find((l) => l.garment === id);
  assert.ok(line && line.price < 30, `${id}: no está en Decathlon o pasa de 30 €`);
}

// 3 · Percheros: cada uno enseña algo de su tienda, y entre todos se ven todas las prendas nuevas.
const loc = getLocation(DECATHLON_STORE.id);
const racks = loc.racks ?? [];
const shown = new Set<string>();
for (const r of racks) {
  const lines = stockOf(r.store, [], {}, r.categories);
  assert.ok(lines.length >= 1, `${r.name}: perchero vacío`);
  for (const l of lines) shown.add(l.garment);
}
for (const id of NEW) assert.ok(shown.has(id), `${id}: no sale en ningún perchero`);

// 4 · Los percheros nuevos: sobre suelo libre, fuera de pasillos, colas y cajas, de pie sobre un punto del suelo (la regla
// de check-economy: todos los points de la localización) y con camino desde la puerta.
const busy = new Set(DECATHLON_LAYOUT.checkouts.flatMap((c) => [...c.queue, c.till, ...(c.staff ? [c.staff] : [])].map(key)));
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
for (const name of NEW_RACKS) {
  const r = racks.find((x) => x.name === name);
  assert.ok(r, `falta el perchero ${name}`);
  assert.ok(isWalkable(loc, r.tx, r.ty), `${name}: encima de un mueble`);
  assert.ok(!inAisle(r.tx, r.ty), `${name}: en un pasillo`);
  assert.ok(!busy.has(key(r)), `${name}: sobre una cola o una caja`);
  assert.ok(points.has(key(r)), `${name}: de pie sobre un punto del suelo`);
  assert.ok(seen.has(key(r)), `${name}: no se llega a pie desde la puerta`);
}

// 5 · Comprar: se cobra exactamente el precio, una vez, y entra en el armario.
const wallet = (money: number): Wallet => ({ money, inventory: { agua: 1 }, cards: { transport: 5 } });
const G = 'cortavientos-trazo';
const PRICE = store.stock.find((l) => l.garment === G)!.price;
const w0 = wallet(50);
const first = buyGarment(w0, [], {}, 'decathlon', G, false);
assert.ok(first.ok, `no se pudo comprar: ${first.message}`);
assert.equal(cents(first.wallet.money), cents(50) - cents(PRICE), 'no cobra exactamente el precio');
assert.deepEqual(first.wardrobe, [G], 'no entra en el armario');
assert.equal(cents(first.paid), cents(PRICE), 'no apunta lo pagado');
assert.deepEqual(first.wallet.inventory, w0.inventory, 'la compra tocó la bolsa');
// La segunda vez se rechaza y no cobra.
const again = buyGarment(first.wallet, first.wardrobe, first.appearance, 'decathlon', G, false);
assert.ok(!again.ok, 'cobró dos veces la misma prenda');
assert.equal(again.wallet.money, first.wallet.money, 'el rechazo cambió la cartera');
assert.equal(again.paid, 0);
// Sin saldo: nada cambia.
const poor = wallet(cents(PRICE - 0.01) / 100);
const broke = buyGarment(poor, ['gorra-negra'], {}, 'decathlon', G, false);
assert.ok(!broke.ok, 'vendió sin dinero');
assert.deepEqual(broke.wallet, poor, 'sin dinero, la cartera cambió');
assert.deepEqual(broke.wardrobe, ['gorra-negra'], 'sin dinero, el armario cambió');
assert.equal(broke.paid, 0);

console.log(`OK · decathlon-sport: ${NEW.length} prendas Trazo/Ondra, ${racks.length} percheros (${NEW_RACKS.length} nuevos) y cobro único y exacto`);
