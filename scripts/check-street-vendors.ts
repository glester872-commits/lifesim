// CV-08A · comprar en la calle (data/streetActs.ts `offers`): las gafas de la bandeja y la ropa de la manta como en una
// tienda (systems/Retail), y lo de las mantas y la bandeja del Arena como en una máquina (systems/Commerce), con la
// cartera de siempre. `npm run check`. Falla si un puesto vende algo que no existe, que no tiene uso o que no se ve; si
// se cobra dos veces, se queda en negativo o se compra sin dinero; o si guardar y cargar pierde las gafas o lo comprado.
import assert from 'node:assert/strict';
import { STREET_ACTS } from '../src/data/streetActs.ts';
import { getOffer } from '../src/data/services.ts';
import { getCatalog } from '../src/data/catalogs.ts';
import { getItem } from '../src/data/items.ts';
import { getGarment, getStore } from '../src/data/retail.ts';
import type { HumanColors } from '../src/world/HumanArt.ts';
import { purchase, type Wallet } from '../src/systems/Commerce.ts';
import { buyGarment, takeOff, wear } from '../src/systems/Retail.ts';
import { withAppearance } from '../src/systems/Appearance.ts';

import { GIFTS, giveGift } from '../src/systems/Gifts.ts';
import { createSocialProfile } from '../src/systems/Social.ts';
import { createInitialState, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';

const wallet = (money: number, inventory: Record<string, number> = {}): Wallet => ({ money, inventory, cards: {} });

// ----------------------------------------------- cada puesto: lo que vende existe, se ve o tiene uso
const vendors = STREET_ACTS.filter((a) => a.offers);
assert.ok(vendors.length >= 5, `pocos puestos que venden: ${vendors.length}`);
assert.ok(vendors.every((a) => a.kind === 'vendor'), 'vende algo quien no es un puesto de venta');
assert.equal(new Set(vendors.map((a) => a.offers)).size, vendors.length, 'dos puestos con el mismo género: no se distinguen');
let glassesSold = 0;
let blanketItems = 0;
for (const act of vendors) {
  const offer = getOffer(act.offers!);
  if (offer.kind === 'retail') {
    const store = getStore(offer.store);
    assert.ok(store.stock.length > 0, `${act.id}: tienda vacía`);
    for (const line of store.stock) {
      const g = getGarment(line.garment);
      assert.ok(line.price > 0, `${act.id}: ${g.id} gratis`);
      if (g.slot === 'glasses') {
        glassesSold++;
        assert.ok(g.lens === 'dark' || g.lens === 'clear', `${g.id}: unas gafas sin cristal`);
      }
    }
  } else if (offer.kind === 'catalog') {
    const catalog = getCatalog(offer.catalog);
    assert.ok(catalog.products.length > 0, `${act.id}: manta vacía`);
    for (const p of catalog.products) {
      assert.ok('item' in p.effect, `${act.id}: ${p.id} no es un artículo`);
      const item = getItem(p.effect.item);
      blanketItems++;
      // Nada de artículos fantasma: un regalo se puede regalar y la comida da energía.
      if (item.kind === 'gift') assert.ok(GIFTS[item.id], `${act.id}: ${item.id} es un regalo que no hace nada`);
      else assert.ok((item.energy ?? 0) > 0, `${act.id}: ${item.id} no se puede usar`);
    }
  } else assert.fail(`${act.id}: oferta ${offer.kind} que una manta no sabe abrir`);
}
assert.ok(glassesSold >= 2, 'no se venden gafas en la calle');

// ----------------------------------------------- gafas: comprar, ponérselas, verlas, sin cobrar dos veces ni sin dinero
const gafas = vendors.map((a) => getOffer(a.offers!)).find((o) => o.kind === 'retail' && getStore(o.store).stock.some((l) => getGarment(l.garment).slot === 'glasses'))!;
assert.equal(gafas.kind, 'retail');
const storeId = gafas.kind === 'retail' ? gafas.store : '';
const line = getStore(storeId).stock.find((l) => getGarment(l.garment).lens === 'dark')!;
const bought = buyGarment(wallet(20), [], {}, storeId, line.garment);
assert.ok(bought.ok, bought.message);
assert.equal(bought.wallet.money, Math.round((20 - line.price) * 100) / 100, 'no cobra exactamente el precio');
assert.deepEqual(bought.wardrobe, [line.garment], 'no entra en el armario');
assert.equal(bought.appearance.glasses, line.garment, 'no te las pones');
const base: HumanColors = { cloth: '#c9743f', clothDark: '#9d5730', hair: '#2a2430', skin: '#d3a17c', trousers: '#3c4152', shoes: '#23262f', hairStyle: 'short' };
const seen = withAppearance({ ...base, glasses: undefined }, bought.appearance);
assert.equal(seen.glasses, 'dark', 'las gafas puestas no se dibujan');
assert.equal(seen.glassesFrame, getGarment(line.garment).color, 'la montura no es la de la prenda');
assert.equal(withAppearance({ ...base, glasses: undefined }, takeOff(bought.appearance, 'glasses')).glasses, undefined, 'quitárselas no las quita');
// Otra vez la misma: no se cobra. Sin dinero: no se compra y nada cambia.
const twice = buyGarment(bought.wallet, bought.wardrobe, bought.appearance, storeId, line.garment);
assert.ok(!twice.ok && twice.wallet === bought.wallet && twice.wardrobe === bought.wardrobe, 'se cobran dos veces las mismas gafas');
const poor = buyGarment(wallet(line.price - 0.01), [], {}, storeId, line.garment);
assert.ok(!poor.ok && poor.wallet.money === line.price - 0.01 && poor.wardrobe.length === 0 && !poor.appearance.glasses, 'se compra sin dinero o cambia algo al no poder');
// Las gafas no tapan la ropa: ponerse una camiseta deja las gafas puestas.
const dressed = wear(bought.appearance, 'camiseta-raya');
assert.equal(dressed.glasses, line.garment, 'ponerse una camiseta quita las gafas');

// ----------------------------------------------- gorras y bufandas: se venden en el Arena, se dibujan, se quitan y se guardan
const arena = vendors.filter((a) => a.location === 'arena').map((a) => getOffer(a.offers!)).flatMap((o) => (o.kind === 'retail' ? getStore(o.store).stock : []));
const cap = arena.find((l) => getGarment(l.garment).slot === 'cap');
const scarf = arena.find((l) => getGarment(l.garment).slot === 'scarf');
assert.ok(cap && scarf, 'el Arena no vende gorras y bufandas');
const fan = buyGarment(wallet(40), [], {}, 'manta-bufandas', scarf!.garment);
const fan2 = buyGarment(fan.wallet, fan.wardrobe, fan.appearance, 'manta-bufandas', cap!.garment);
assert.ok(fan.ok && fan2.ok && fan2.wallet.money === 40 - scarf!.price - cap!.price, 'gorra y bufanda no cobran exactamente');
const fanLook = withAppearance(base, fan2.appearance);
assert.equal(fanLook.scarf, getGarment(scarf!.garment).color, 'la bufanda puesta no se dibuja');
assert.equal(fanLook.cap, getGarment(cap!.garment).color, 'la gorra puesta no se dibuja');
assert.equal(withAppearance(base, takeOff(takeOff(fan2.appearance, 'cap'), 'scarf')).cap, undefined, 'quitarse la gorra no la quita');
{
  const mem = new Map<string, string>();
  const st: SaveStorage = { read: (k) => mem.get(k) ?? null, write: (k, v) => void mem.set(k, v), remove: (k) => void mem.delete(k) };
  const init = createInitialState();
  new SaveSystem(st).save({ ...init, wardrobe: [...fan2.wardrobe], appearance: { ...init.appearance, player: { ...(init.appearance.player ?? {}), cap: cap!.garment, scarf: scarf!.garment } } });
  const back = new SaveSystem(st).load()!.appearance.player;
  assert.ok(back?.cap === cap!.garment && back?.scarf === scarf!.garment, 'tras recargar se pierden la gorra o la bufanda');
}

// ----------------------------------------------- manta: una unidad por compra, saldo exacto, sin negativos
const recuerdos = vendors.map((a) => getOffer(a.offers!)).find((o) => o.kind === 'catalog' && o.catalog === 'manta-recuerdos');
assert.ok(recuerdos && recuerdos.kind === 'catalog', 'no hay manta de recuerdos');
const product = getCatalog(recuerdos.catalog).products[0];
const got = purchase(wallet(10), product);
assert.ok(got.ok && got.wallet.money === Math.round((10 - product.price) * 100) / 100, 'la manta no cobra exactamente');
assert.equal(got.wallet.inventory[(product.effect as { item: string }).item], 1, 'lo comprado no entra en la bolsa');
const broke = purchase(wallet(product.price - 0.01), product);
assert.ok(!broke.ok && broke.wallet.money === product.price - 0.01 && Object.keys(broke.wallet.inventory).length === 0, 'se compra en la manta sin dinero');
// Se regala de verdad: sale de la bolsa y sube la amistad.
const itemId = (product.effect as { item: string }).item;
const friend = { ...createSocialProfile(), encounters: 2 };
const gift = giveGift(friend, got.wallet, itemId, { day: 3, hour: 18, minute: 0 });
assert.ok(gift.ok && (gift.wallet.inventory[itemId] ?? 0) === 0 && gift.profile.friendship > friend.friendship, 'el recuerdo no se puede regalar');

// ----------------------------------------------- guardar y cargar: gafas puestas, armario y bolsa
const store = new Map<string, string>();
const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
const initial = createInitialState();
const saved = {
  ...initial,
  money: bought.wallet.money,
  inventory: { [itemId]: 2 },
  wardrobe: [line.garment],
  appearance: { ...initial.appearance, player: { ...(initial.appearance.player ?? {}), glasses: line.garment } },
};
new SaveSystem(storage).save(saved);
const loaded = new SaveSystem(storage).load()!;
assert.equal(loaded.appearance.player?.glasses, line.garment, 'tras recargar ya no llevas las gafas');
assert.deepEqual(loaded.wardrobe, [line.garment], 'tras recargar las gafas no están en el armario');
assert.equal(loaded.inventory[itemId], 2, 'tras recargar falta lo comprado');
assert.equal(loaded.money, bought.wallet.money, 'recargar cambia el dinero');
// Unas gafas puestas que no son tuyas (partida tocada a mano) no se cuelan; ni algo que no es de gafas en su hueco.
new SaveSystem(storage).save({ ...saved, wardrobe: [] });
assert.equal(new SaveSystem(storage).load()!.appearance.player?.glasses, undefined, 'se cargan unas gafas que no están en el armario');
new SaveSystem(storage).save({ ...saved, wardrobe: ['camiseta-raya'], appearance: { ...saved.appearance, player: { ...saved.appearance.player, glasses: 'camiseta-raya' } } });
assert.equal(new SaveSystem(storage).load()!.appearance.player?.glasses, undefined, 'una camiseta en el hueco de las gafas');

console.log(`OK: ${vendors.length} puestos que venden (${glassesSold} gafas, ${blanketItems} artículos de manta con uso), gorra y bufanda del Arena, cobro exacto y único, sin dinero no se compra, gafas que se ven y se quitan, regalo de manta que se da, y guardar/cargar con gafas, armario y bolsa.`);
