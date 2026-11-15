// MAP-07 · reputación local por barrio: `npm run check`. Subir y bajar, idempotencia, clamp ±100, como mucho 10
// motivos, precio ±10 % sobre un producto real cobrado con checkout, tono, acceso, y el guardado v4 → v5.
import assert from 'node:assert/strict';
import { SAVE_KEY, SAVE_VERSION } from '../src/config/constants.ts';
import { REPUTATION_BAN_AT, REPUTATION_MAX_REASONS, REPUTATION_TRIGGERS } from '../src/data/reputation.ts';
import { getCatalog } from '../src/data/catalogs.ts';
import { checkout, maxQty } from '../src/systems/Commerce.ts';
import { apply, canEnter, parseReputation, priceFactor, reasonLabel, tone, zoneOf, type Reputation } from '../src/systems/Reputation.ts';
import { createInitialState, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';

// Zona: el barrio de LOCATION_DISTRICT; los interiores, el de su calle.
assert.equal(zoneOf('district'), 'vallesco');
assert.equal(zoneOf('vallesco-station'), 'vallesco');
assert.equal(zoneOf('no-existe-este-sitio-xyz') ?? null, null);

// Subir y bajar.
let rep: Reputation = {};
rep = apply(rep, 'vallesco', 3, 'shift:1:a', 1);
assert.equal(rep.vallesco.value, 3);
rep = apply(rep, 'vallesco', -5, 'x:1', 1);
assert.equal(rep.vallesco.value, -2);

// Idempotencia: el mismo motivo no cuenta dos veces (y no muta la entrada).
const before = rep;
assert.equal(apply(rep, 'vallesco', 3, 'shift:1:a', 2), before);
assert.equal(before.vallesco.value, -2);

// Sin barrio o barrio desconocido: nada.
assert.equal(apply(rep, null, 5, 'r', 1), rep);
assert.equal(apply(rep, '', 5, 'r', 1), rep);
assert.equal(apply(rep, 'atlantida', 5, 'r', 1), rep);

// Clamp ±100 y motivos ≤ 10.
let up: Reputation = {};
for (let i = 0; i < 40; i++) up = apply(up, 'ribera', 9, `u:${i}`, i);
assert.equal(up.ribera.value, 100);
assert.equal(up.ribera.reasons.length, REPUTATION_MAX_REASONS);
assert.equal(up.ribera.reasons.at(-1)!.id, 'u:39');
let down: Reputation = {};
for (let i = 0; i < 40; i++) down = apply(down, 'ribera', -9, `d:${i}`, i);
assert.equal(down.ribera.value, -100);

// Precio: ±10 % en los extremos, sobre la compra para cocinar (9 €) del Súper Rosales, cobrada de verdad.
assert.equal(priceFactor(0), 1);
assert.ok(Math.abs(priceFactor(-100) - 1.1) < 1e-9);
assert.ok(Math.abs(priceFactor(100) - 0.9) < 1e-9);
const rosales = getCatalog('super-rosales');
const wallet = { money: 100, inventory: {}, cards: {} };
const dear = checkout(wallet, rosales, 'groceries', 1, priceFactor(-100));
const cheap = checkout(wallet, rosales, 'groceries', 1, priceFactor(100));
const plain = checkout(wallet, rosales, 'groceries', 1);
assert.ok(dear.ok && cheap.ok && plain.ok, `${dear.message} / ${cheap.message} / ${plain.message}`);
assert.equal(plain.total, 9);
assert.equal(dear.total, 9.9);
assert.equal(cheap.total, 8.1);
assert.equal(dear.wallet.money, 90.1);
assert.equal(cheap.wallet.money, 91.9);

// maxQty con factor: nunca ofrece una cantidad que checkout rechace por dinero.
for (const f of [priceFactor(-100), 1, priceFactor(100)]) {
  const w = { money: 30, inventory: {}, cards: {} };
  const groceries = rosales.products.find((p) => p.id === 'groceries')!;
  const n = maxQty(w, groceries, f);
  if (n > 0) assert.notEqual(checkout(w, rosales, 'groceries', n, f).reason, 'money', `factor ${f}: ${n}`);
  assert.equal(checkout(w, rosales, 'groceries', n + 1, f).ok, false);
}

// Factura pagada (Phone renderPay): la misma factura y periodo suma una sola vez.
{
  const d = REPUTATION_TRIGGERS['bill-paid'].delta;
  let b: Reputation = apply({}, 'vallesco', d, 'bill:rent:3', 10);
  b = apply(b, 'vallesco', d, 'bill:rent:3', 11);
  assert.equal(b.vallesco.value, d);
  assert.equal(reasonLabel(b.vallesco.reasons[0]), 'Factura pagada');
  b = apply(b, 'vallesco', d, 'bill:rent:4', 40);
  assert.equal(b.vallesco.value, 2 * d);
}

// Tono en sus tres tramos.
assert.equal(tone(-41), 'hostil');
assert.equal(tone(-40), 'hostil');
assert.equal(tone(0), 'neutral');
assert.equal(tone(39), 'neutral');
assert.equal(tone(40), 'amistoso');

// Acceso.
assert.equal(canEnter(-100), true);
assert.equal(canEnter(-71, REPUTATION_BAN_AT), false);
assert.equal(canEnter(-70, REPUTATION_BAN_AT), true);

// Basura → {}; lo conocido se queda con clamp.
assert.deepEqual(parseReputation(null), {});
assert.deepEqual(parseReputation('roto'), {});
assert.deepEqual(parseReputation([1, 2]), {});
assert.deepEqual(parseReputation({ atlantida: { value: 5, reasons: [] }, ribera: { value: Number.NaN } }), {});
assert.equal(parseReputation({ ribera: { value: 900, reasons: 'x' } }).ribera.value, 100);

// Guardado.
function memory(): { store: Map<string, string>; save: SaveSystem } {
  const store = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
  return { store, save: new SaveSystem(storage) };
}
assert.equal(SAVE_VERSION, 5);
{
  // Una v4 sin reputation carga con {}.
  const { store, save } = memory();
  const v4: Record<string, unknown> = { ...createInitialState() };
  delete v4.reputation;
  store.set(SAVE_KEY, JSON.stringify({ version: 4, savedAt: 0, state: v4 }));
  assert.deepEqual(save.load()?.reputation, {});
}
{
  // Round-trip v5.
  const { save } = memory();
  const state = { ...createInitialState(), reputation: rep };
  assert.ok(save.save(state));
  assert.deepEqual(save.load()?.reputation, rep);
}
{
  // Reputación corrupta en una v5 → {} sin tirar la partida.
  const { store, save } = memory();
  store.set(SAVE_KEY, JSON.stringify({ version: 5, savedAt: 0, state: { ...createInitialState(), reputation: 'basura' } }));
  const loaded = save.load();
  assert.ok(loaded);
  assert.deepEqual(loaded.reputation, {});
}

console.log('check-reputation: ok');
