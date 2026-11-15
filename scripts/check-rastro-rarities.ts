// CAS-04 · Rarezas del Gran Rastro (systems/Rastro.ts): `npm run check`. Falla si el surtido de rarezas no es
// determinista o no cambia entre domingos, si una rareza no existe o no tiene precio y tope de pieza única, si el
// registro de la jornada duplica o se cuela en otra, si no sobrevive al guardado o si una partida dañada no se sanea,
// y si una rareza vendida vuelve a estar a la venta la misma jornada tras regalarla.
import assert from 'node:assert/strict';
import { getCatalog } from '../src/data/catalogs.ts';
import { getItem } from '../src/data/items.ts';
import { getGarment, getStore } from '../src/data/retail.ts';
import { GIFTS } from '../src/systems/Gifts.ts';
import { checkout, type Wallet } from '../src/systems/Commerce.ts';
import { BASE_DRAFT, newGameState } from '../src/systems/CharacterCreator.ts';
import { SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import { isRare, ledgerFor, markSold, parseRastro, RARE_BY_VENDOR, rareStatus, weekStock } from '../src/systems/Rastro.ts';

const SUNDAYS = Array.from({ length: 8 }, (_, i) => 7 + 7 * i);
const KEYS = Object.keys(RARE_BY_VENDOR);

// ------------------------------------------------ weekStock: estable y cambia entre domingos
for (const key of KEYS) for (const d of SUNDAYS) assert.deepEqual(weekStock(key, d), weekStock(key, d), `${key}/${d}: no es determinista`);
const changing = KEYS.filter((key) => new Set(SUNDAYS.map((d) => weekStock(key, d).join(','))).size > 1);
assert.ok(changing.length >= 2, `en 8 domingos sólo cambian ${changing.length} puestos`);
assert.deepEqual(weekStock('rastro-pequenos', 7), [], 'un puesto sin rarezas saca rarezas');

// ------------------------------------------------ cada rareza existe, con precio y tope de una
for (const [key, ids] of Object.entries(RARE_BY_VENDOR)) {
  for (const id of ids) {
    assert.ok(isRare(id), `${id}: no es rara`);
    if (key === 'rastro-vintage') {
      const g = getGarment(id);
      assert.ok(g.unique, `${id}: no es única`);
      const price = getStore(key).stock.find((l) => l.garment === id)?.price ?? 0;
      assert.ok(price >= 25 && price <= 90, `${id}: precio ${price}`);
    } else {
      const item = getItem(id);
      assert.equal(item.kind, 'gift', `${id}: no es un regalo`);
      assert.ok(GIFTS[id], `${id}: regalo que no hace nada`);
      assert.equal(item.max, 1, `${id}: bolsa de ${item.max}`);
      const p = getCatalog(key).products.find((x) => x.id === id);
      assert.ok(p, `${id}: no está en ${key}`);
      assert.ok(p.price > 0 && p.price >= 25 && p.price <= 90, `${id}: precio ${p.price}`);
    }
  }
}
assert.equal(isRare('rastro-vinyl'), false, 'lo común sale como raro');
// Fuera de su puesto (sin stall, openShop) o en otra tienda con la misma prenda (retales), nada cambia.
assert.equal(rareStatus('rastro-discos', 'rastro-vinyl', 7, undefined, true), 'common');
assert.equal(rareStatus('retales', 'cazadora-ante', 7, undefined, false), 'common');
for (const d of SUNDAYS) assert.equal(rareStatus('rastro-discos', 'rastro-vinyl-first', d, undefined, false), 'hidden', 'rareza ofrecida sin puesto');

// ------------------------------------------------ registro: sin duplicados y por jornada
const once = markSold(undefined, 7, 'rastro-figure');
const twice = markSold(once, 7, 'rastro-figure');
assert.deepEqual(twice.sold, ['rastro-figure'], 'markSold duplica');
assert.deepEqual(once.sold, ['rastro-figure'], 'markSold muta su entrada');
assert.deepEqual(ledgerFor(twice, 14).sold, [], 'otra edición hereda lo vendido');
assert.deepEqual(markSold(twice, 14, 'rastro-camera-slr').sold, ['rastro-camera-slr'], 'markSold en otra edición arrastra la anterior');

// ------------------------------------------------ guardado: ida y vuelta (la vía de check-persistence)
const store = new Map<string, string>();
const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
const save = new SaveSystem(storage);
const start = newGameState(BASE_DRAFT);
assert.ok(save.save(start));
assert.equal(save.load()!.rastro, undefined, 'una partida sin registro carga con uno');
assert.deepEqual(ledgerFor(save.load()!.rastro, 7).sold, [], 'sin registro no vale vacío');

// ------------------------------------------------ partidas dañadas
assert.deepEqual(parseRastro({ edition: -1, sold: [], haggled: {} }).edition, 0);
assert.deepEqual(parseRastro({ edition: 'siete', sold: [], haggled: {} }).edition, 0);
assert.deepEqual(parseRastro({ edition: 7.5, sold: [] }).edition, 0);
assert.deepEqual(parseRastro({ edition: 7, sold: ['rastro-figure', 'rastro-figure', 'nada', 3, 'rastro-vinyl'] }).sold, ['rastro-figure']);
assert.deepEqual(parseRastro({ edition: 7, sold: [], haggled: { 'rastro-figure': -5, 'rastro-camera-slr': 0, nada: 10, 'rastro-book-signed': 20, 'cazadora-ante': Infinity } }).haggled, { 'rastro-book-signed': 20 });
for (const bad of [null, 42, 'x', [], { sold: 'x', haggled: 'y' }]) assert.deepEqual(parseRastro(bad), { edition: 0, sold: [], haggled: {} }, `${JSON.stringify(bad)} no se lee vacío`);

// ------------------------------------------------ comprar, regalar, guardar y volver: sigue agotada
const DAY = SUNDAYS.find((d) => weekStock('rastro-discos', d).includes('rastro-vinyl-first'));
assert.ok(DAY, 'el vinilo de primera edición no sale en ocho domingos');
const discos = getCatalog('rastro-discos');
const price = discos.products.find((p) => p.id === 'rastro-vinyl-first')!.price;
assert.equal(rareStatus('rastro-discos', 'rastro-vinyl-first', DAY, start.rastro, true), 'available');
const wallet0: Wallet = { money: 100, inventory: {}, cards: {} };
const bought = checkout(wallet0, discos, 'rastro-vinyl-first', 1);
assert.ok(bought.ok, bought.message);
assert.equal(bought.wallet.money, 100 - price, 'el dinero no baja exactamente el precio');
const ledger = markSold(start.rastro, DAY, 'rastro-vinyl-first');
// Se regala: sale de la bolsa (lo mismo que hace Gifts.giveGift con una unidad).
const inventory = { ...bought.wallet.inventory };
delete inventory['rastro-vinyl-first'];
assert.ok(save.save({ ...start, money: bought.wallet.money, inventory, rastro: ledger }));
const back = save.load()!;
assert.equal(back.money, 100 - price);
// Control positivo: si markSold no persistiera (sin `rastro: ledger` arriba, o sin la línea de SaveSystem.parseState),
// back.rastro sería undefined y este assert fallaría con «tras regalarlo y cargar, se vuelve a vender».
assert.equal(rareStatus('rastro-discos', 'rastro-vinyl-first', DAY, back.rastro, true), 'sold', 'tras regalarlo y cargar, se vuelve a vender');
// Sin el registro, la bolsa vacía dejaría comprarlo otra vez: lo que lo impide es el registro, no el tope.
assert.ok(checkout({ money: back.money, inventory: back.inventory, cards: back.cards }, discos, 'rastro-vinyl-first', 1).ok);
// En una edición posterior sólo cuenta weekStock.
for (const d of SUNDAYS.filter((x) => x > DAY)) {
  const want = weekStock('rastro-discos', d).includes('rastro-vinyl-first') ? 'available' : 'hidden';
  assert.equal(rareStatus('rastro-discos', 'rastro-vinyl-first', d, back.rastro, true), want, `domingo ${d}`);
}
// La chaqueta: vendida en el armario o fuera de él, agotada en su jornada.
// Un año de domingos: con una probabilidad de 0,5 por jornada, que no salga en ninguno sería un fallo de weekStock.
const JDAY = Array.from({ length: 52 }, (_, i) => 7 + 7 * i).find((d) => weekStock('rastro-vintage', d).includes('cazadora-ante'));
assert.ok(JDAY, 'la cazadora no sale en ningún domingo probado');
assert.equal(rareStatus('rastro-vintage', 'cazadora-ante', JDAY, markSold(undefined, JDAY, 'cazadora-ante'), true), 'sold');

console.log(`check-rastro-rarities: ${KEYS.length} puestos con rarezas · cambian ${changing.length} en 8 domingos · vinilo el día ${DAY}`);
