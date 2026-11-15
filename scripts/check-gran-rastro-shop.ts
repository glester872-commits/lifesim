// CAS-03 · Los puestos que venden en el Gran Rastro (data/popups.ts 'gran-rastro' vendors, systems/PopUps.stallVendors):
// `npm run check`. Falla si los vendedores no están en anclas de puesto reales, si falta alguna familia o zona, si un
// catálogo o tienda no existe, si se vende fuera del domingo de 9:00 a 15:00 o con lluvia fuerte, si cobrar no es de
// todo o nada, si una prenda única se cobra dos veces (también tras guardar y cargar) o si se alcanza desde lejos.
import assert from 'node:assert/strict';
import { POPUPS } from '../src/data/popups.ts';
import { getCatalog } from '../src/data/catalogs.ts';
import { getItem } from '../src/data/items.ts';
import { getGarment, getStore } from '../src/data/retail.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { popUpStalls, stallVendors } from '../src/systems/PopUps.ts';
import { forceWeather } from '../src/systems/Weather.ts';
import { weekIndex } from '../src/systems/Calendar.ts';
import { carryMax, checkout, type Wallet } from '../src/systems/Commerce.ts';
import { buyGarment } from '../src/systems/Retail.ts';
import { GIFTS } from '../src/systems/Gifts.ts';
import { isRare } from '../src/systems/Rastro.ts';
import { BASE_DRAFT, newGameState } from '../src/systems/CharacterCreator.ts';
import { SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import { pickTarget, tileAhead, type Candidate } from '../src/systems/Interaction.ts';
import { TILE } from '../src/config/constants.ts';

const ID = 'casco-antiguo';
const def = POPUPS.find((p) => p.id === 'gran-rastro')!;
const vendors = def.stalls?.vendors ?? [];
const at = (day: number, hour: number, minute = 0) => ({ day, hour, minute });

// ------------------------------------------------ diez vendedores en anclas de puesto reales
const anchors = new Map((getLocation(ID).stallAnchors ?? []).map((a) => [a.id, a]));
assert.equal(vendors.length, 10, `${vendors.length} vendedores`);
assert.equal(new Set(vendors.map((v) => v.anchor)).size, 10, 'dos vendedores en la misma ancla');
for (const v of vendors) {
  const a = anchors.get(v.anchor);
  assert.ok(a, `${v.anchor}: ancla inexistente`);
  assert.ok(a.type === 'market' || a.type === 'stall', `${v.anchor}: no es de puesto (${a.type})`);
  assert.ok((v.catalog === undefined) !== (v.store === undefined), `${v.anchor}: ha de tener catálogo o tienda, uno solo`);
}
const zoneOf = (id: string): string => id.split('.').slice(1, -2).join('.');
for (const zone of ['plaza', 'calleMayor', 'calleSecundaria']) assert.ok(vendors.some((v) => zoneOf(v.anchor) === zone), `${zone} sin vendedor`);

// Familias pedidas: cuántos puestos de cada catálogo o tienda, y la pieza que dice lo que venden.
const WANT: Readonly<Record<string, { n: number; piece: string }>> = {
  'rastro-vintage': { n: 2, piece: 'stall-clothes' },
  'rastro-zapatillas': { n: 1, piece: 'stall-clothes' },
  'rastro-discos': { n: 1, piece: 'stall-books' },
  'rastro-libros': { n: 1, piece: 'stall-books' },
  'rastro-camaras': { n: 1, piece: 'stall-junk' },
  'rastro-antiguedades': { n: 1, piece: 'stall-junk' },
  'rastro-retro': { n: 1, piece: 'stall-junk' },
  'rastro-pequenos': { n: 2, piece: 'stall-junk' },
};
for (const [source, want] of Object.entries(WANT)) {
  const of = vendors.filter((v) => (v.catalog ?? v.store) === source);
  assert.equal(of.length, want.n, `${source}: ${of.length} puestos`);
  for (const v of of) assert.equal(v.piece, want.piece, `${v.anchor}: pieza ${v.piece}`);
}

// Los 38 puestos: 10 venden (con su pieza) y 28 son ambientación.
const stalls = popUpStalls(def);
assert.equal(stalls.length, 38, `${stalls.length} puestos`);
const selling = stalls.filter((s) => s.vendor);
assert.equal(selling.length, 10);
assert.equal(stalls.length - selling.length, 28, 'ambientación');
for (const s of selling) assert.equal(s.piece, s.vendor!.piece, `${s.id}: pieza de hash en un vendedor`);

// ------------------------------------------------ cada catálogo o tienda existe y vende cosas reales
for (const v of vendors) {
  if (v.catalog) {
    const c = getCatalog(v.catalog);
    assert.ok(c.checkout, `${c.id}: sin caja`);
    for (const p of c.products) {
      if (!('item' in p.effect)) assert.fail(`${c.id}/${p.id}: no es un objeto`);
      const item = getItem(p.effect.item);
      assert.equal(item.kind, 'gift', `${item.id}: no es un regalo`);
      assert.ok(GIFTS[item.id], `${item.id}: regalo que no hace nada`);
      // Las rarezas de CAS-04 (tope 1, 25-90 €) se validan en check-rastro-rarities.ts
      if (!isRare(item.id)) {
        assert.ok(p.price >= 2 && p.price <= 60, `${c.id}/${p.id}: precio ${p.price} fuera del mercadillo`);
        assert.ok(item.max === 2 || item.max === 3, `${item.id}: bolsa de ${item.max}`);
      }
    }
  } else {
    const s = getStore(v.store!);
    assert.ok(s.stock.length > 0, `${s.id}: sin género`);
    for (const l of s.stock) getGarment(l.garment);
  }
}

// ------------------------------------------------ horario: domingo de 9:00 a 15:00 y sin lluvia fuerte
const SUNDAY = 7;
assert.equal(weekIndex(SUNDAY), 6);
forceWeather({ rain: 0, cloud: 0, celsius: 20, wet: 0 });
assert.equal(stallVendors(ID, at(SUNDAY, 8)).length, 0, 'vende a las 8:00 (montando)');
assert.equal(stallVendors(ID, at(SUNDAY, 16)).length, 0, 'vende a las 16:00 (recogiendo)');
assert.equal(stallVendors(ID, at(SUNDAY + 1, 11)).length, 0, 'vende el lunes');
assert.equal(stallVendors(ID, at(SUNDAY, 11)).length, 10, 'el domingo a las 11:00 no venden los diez');
assert.equal(stallVendors('district', at(SUNDAY, 11)).length, 0, 'vendedores fuera del Casco Antiguo');
forceWeather({ rain: 0.9, cloud: 1, celsius: 12, wet: 0.9 });
assert.equal(stallVendors(ID, at(SUNDAY, 11)).length, 0, 'vende con lluvia fuerte');
forceWeather(null);

// ------------------------------------------------ cobrar: todo o nada, y la bolsa
const camaras = getCatalog('rastro-camaras');
const camera = camaras.products[0];
const exact: Wallet = { money: camera.price, inventory: {}, cards: {} };
const paid = checkout(exact, camaras, camera.id, 1);
assert.ok(paid.ok, paid.message);
assert.equal(paid.wallet.money, 0);
assert.equal(paid.wallet.inventory['rastro-camera'], 1);
const short: Wallet = { money: camera.price - 0.01, inventory: { water: 1 }, cards: {} };
const before = JSON.stringify(short);
const broke = checkout(short, camaras, camera.id, 1);
assert.equal(broke.ok, false);
assert.equal(broke.reason, 'money');
assert.ok(broke.message.startsWith('No te llega'), broke.message);
assert.equal(JSON.stringify(broke.wallet), before, 'sin saldo, la cartera cambió');
let w: Wallet = { money: 1000, inventory: {}, cards: {} };
for (let i = 0; i < carryMax('rastro-camera'); i++) w = checkout(w, camaras, camera.id, 1).wallet;
const full = checkout(w, camaras, camera.id, 1);
assert.equal(full.reason, 'full', 'cabe más de lo que dice la bolsa');
assert.equal(full.wallet.money, w.money);

// ------------------------------------------------ la prenda única: un stock de uno
const UNIQUE = 'zapatilla-edicion';
assert.ok(getGarment(UNIQUE).unique && getStore('rastro-zapatillas').stock.some((l) => l.garment === UNIQUE));
const start = newGameState(BASE_DRAFT);
assert.ok(!start.wardrobe.includes(UNIQUE));
const wallet0: Wallet = { money: 200, inventory: {}, cards: {} };
const first = buyGarment(wallet0, start.wardrobe, start.appearance.player ?? {}, 'rastro-zapatillas', UNIQUE, false);
assert.ok(first.ok, first.message);
const again = buyGarment(first.wallet, first.wardrobe, first.appearance, 'rastro-zapatillas', UNIQUE, false);
assert.equal(again.ok, false, 'la única se vende dos veces');
assert.equal(again.wallet.money, first.wallet.money, 'la única se cobra dos veces');
assert.equal(first.wardrobe.filter((g) => g === UNIQUE).length, 1);

// ------------------------------------------------ ida y vuelta por el guardado
{
  const store = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
  const save = new SaveSystem(storage);
  const bag = checkout(first.wallet, getCatalog('rastro-pequenos'), 'rastro-badge', 2).wallet;
  assert.ok(save.save({ ...start, money: bag.money, inventory: bag.inventory, cards: bag.cards, wardrobe: [...first.wardrobe], paid: { [UNIQUE]: first.paid } }));
  const back = save.load()!;
  assert.equal(back.money, bag.money, 'el dinero cambia al cargar');
  assert.deepEqual(back.inventory, bag.inventory, 'la bolsa cambia al cargar');
  const reload = buyGarment({ money: back.money, inventory: back.inventory, cards: back.cards }, back.wardrobe, back.appearance.player ?? {}, 'rastro-zapatillas', UNIQUE, false);
  assert.equal(reload.ok, false, 'tras cargar, la única se vuelve a vender');
}

// ------------------------------------------------ alcance (systems/Interaction.pickTarget, como WorldScene)
forceWeather({ rain: 0, cloud: 0, celsius: 20, wet: 0 });
const v = stallVendors(ID, at(SUNDAY, 11))[0];
forceWeather(null);
const cand: Candidate = { id: `vendor:${v.id}`, kind: v.vendor.store ? 'rack' : 'terminal', x: (v.tx + 1) * TILE, y: v.ty * TILE + TILE / 2 };
// El jugador de pie en el tile de debajo del puesto, mirando arriba; el origen es el de WorldScene (8 px sobre los pies).
const tile = { tx: v.tx, ty: v.ty + 1 };
const near = { x: tile.tx * TILE + TILE / 2, y: (tile.ty + 1) * TILE - 8 };
assert.equal(pickTarget(near, [cand], { facing: 'up', ahead: tileAhead(tile, 'up') })?.id, cand.id, 'justo delante no se alcanza');
const far = { x: near.x, y: near.y + 6 * TILE };
assert.equal(pickTarget(far, [cand], { facing: 'up', ahead: tileAhead({ tx: tile.tx, ty: tile.ty + 6 }, 'up') }), null, 'se alcanza desde lejos');

console.log(`check-gran-rastro-shop: ${vendors.length} vendedores (${vendors.map((x) => x.anchor.replace('casco.', '')).join(', ')}) · ${stalls.length - selling.length} de ambientación`);
