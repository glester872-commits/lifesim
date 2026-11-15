// CAS-04 · Regateo de rarezas del Gran Rastro (systems/Rastro.haggle) y reventa de la cazadora: `npm run check`.
// Falla si un precio regateado sale de [suelo, lista], es negativo o NaN, si el resultado no sigue la regla del mood,
// si el precio pactado no sobrevive al guardado o se cuela en otra jornada, si el cobro no es exactamente lo pactado,
// si un vendedor común regatea, o si revender la cazadora en Segunda Vuelta deja ganancia.
import assert from 'node:assert/strict';
import { getCatalog } from '../src/data/catalogs.ts';
import { getStore } from '../src/data/retail.ts';
import { checkout, type Wallet } from '../src/systems/Commerce.ts';
import { buyGarment, RESALE_CAP, RESALE_RATE, resaleValue, sellGarment } from '../src/systems/Retail.ts';
import { BASE_DRAFT, newGameState } from '../src/systems/CharacterCreator.ts';
import { SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import {
  agreedPrice, haggle, HAGGLE_OFFERS, ledgerFor, markHaggled, markSold, MAX_DISCOUNT, MOOD_BY_VENDOR, RARE_BY_VENDOR, rareStatus, weekStock, type Mood,
} from '../src/systems/Rastro.ts';

const round2 = (n: number): number => Math.round(n * 100) / 100;
const MOODS: Mood[] = ['duro', 'normal', 'blando'];

// ------------------------------------------------ la regla: precio en [suelo, lista] y resultado coherente
for (const mood of MOODS) {
  const max = MAX_DISCOUNT[mood];
  for (const base of [0.01, 1, 35, 90]) {
    const floor = Math.max(0.01, round2(base * (1 - max)));
    for (const offer of HAGGLE_OFFERS) {
      const r = haggle(base, mood, offer);
      const tag = `${mood}/${base}/${offer}`;
      assert.ok(Number.isFinite(r.price), `${tag}: precio no finito`);
      assert.ok(r.price > 0, `${tag}: precio ${r.price}`);
      assert.ok(r.price >= floor && r.price <= base, `${tag}: ${r.price} fuera de [${floor}, ${base}]`);
      assert.ok(r.line.length > 0, `${tag}: sin frase`);
      const want = offer <= max ? 'accept' : offer <= 2 * max ? 'counter' : 'reject';
      assert.equal(r.outcome, want, `${tag}: ${r.outcome}`);
      if (want === 'accept') assert.equal(r.price, Math.min(base, Math.max(floor, round2(base * (1 - offer)))), `${tag}: no paga su oferta`);
      if (want === 'counter') assert.equal(r.price, floor, `${tag}: la contraoferta no es el suelo`);
      if (want === 'reject') assert.equal(r.price, base, `${tag}: el rechazo cambia el precio`);
    }
  }
}
// Nunca negativo, ni con entradas absurdas.
for (const base of [0, -5, NaN, Infinity]) for (const mood of MOODS) for (const offer of [...HAGGLE_OFFERS, 5, NaN]) {
  const r = haggle(base, mood, offer);
  assert.ok(Number.isFinite(r.price) && r.price > 0, `${base}/${mood}/${offer}: precio ${r.price}`);
}

// ------------------------------------------------ vendedores: sólo los de rarezas tienen mood
assert.deepEqual(Object.keys(MOOD_BY_VENDOR).sort(), Object.keys(RARE_BY_VENDOR).sort(), 'mood y rarezas no cuadran');
assert.equal(MOOD_BY_VENDOR['rastro-pequenos'], undefined, 'un puesto común regatea');
// Lo común de un puesto con rarezas tampoco se regatea (Menus sólo abre el submenú con 'available') y se cobra a lista.
assert.equal(rareStatus('rastro-discos', 'rastro-vinyl', 7, undefined, true), 'common');
const discos = getCatalog('rastro-discos');
const common = discos.products.find((p) => p.id === 'rastro-vinyl')!;
const w100: Wallet = { money: 100, inventory: {}, cards: {} };
const plain = checkout(w100, discos, common.id, 1);
assert.ok(plain.ok, plain.message);
assert.equal(plain.wallet.money, round2(100 - common.price), 'lo común no se cobra a lista');

// ------------------------------------------------ pactar: guardado, un intento y otra jornada
const SUNDAYS = Array.from({ length: 52 }, (_, i) => 7 + 7 * i);
const DAY = SUNDAYS.find((d) => weekStock('rastro-discos', d).includes('rastro-vinyl-first'));
assert.ok(DAY, 'el vinilo de primera edición no sale en un año');
const vinyl = discos.products.find((p) => p.id === 'rastro-vinyl-first')!;
const deal = haggle(vinyl.price, MOOD_BY_VENDOR['rastro-discos'], 0.1);
assert.ok(deal.price < vinyl.price, 'un -10 % con un vendedor normal no rebaja');
const pacted = markHaggled(undefined, DAY, vinyl.id, deal.price);
assert.deepEqual(markHaggled(pacted, DAY, 'rastro-figure', 1).haggled[vinyl.id], deal.price, 'markHaggled pierde lo anterior');
assert.equal(pacted.haggled['rastro-figure'], undefined, 'markHaggled muta su entrada');

const store = new Map<string, string>();
const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
const save = new SaveSystem(storage);
const start = newGameState(BASE_DRAFT);
assert.ok(save.save({ ...start, rastro: pacted }));
const loaded = save.load()!;
// Un segundo intento no existe: Menus sólo ofrece «Pagar» si hay precio pactado.
assert.equal(agreedPrice(loaded.rastro, DAY, vinyl.id), deal.price, 'el precio pactado no sobrevive al guardado');
assert.equal(agreedPrice(loaded.rastro, DAY + 7, vinyl.id), undefined, 'otra jornada hereda el precio pactado');
assert.deepEqual(ledgerFor(loaded.rastro, DAY + 7).haggled, {}, 'otra jornada no se vacía');

// ------------------------------------------------ cobrar lo pactado, una vez
const paid = checkout(w100, discos, vinyl.id, 1, deal.price / vinyl.price);
assert.ok(paid.ok, paid.message);
assert.equal(paid.total, deal.price, 'no cobra exactamente lo pactado');
assert.equal(paid.wallet.money, round2(100 - deal.price));
const afterSale = markSold(loaded.rastro, DAY, vinyl.id);
assert.equal(rareStatus('rastro-discos', vinyl.id, DAY, afterSale, true), 'sold', 'tras pagar sigue a la venta');
assert.equal(agreedPrice(afterSale, DAY, vinyl.id), deal.price, 'markSold borra el pacto');
// Sin regatear, la lista.
const list = checkout(w100, discos, vinyl.id, 1);
assert.ok(list.ok, list.message);
assert.equal(list.total, vinyl.price, 'sin regatear no cobra la lista');

// ------------------------------------------------ C · la cazadora regateada y revendida en Segunda Vuelta
const JDAY = SUNDAYS.find((d) => weekStock('rastro-vintage', d).includes('cazadora-ante'));
assert.ok(JDAY, 'la cazadora no sale en un año');
const jacketList = getStore('rastro-vintage').stock.find((l) => l.garment === 'cazadora-ante')!.price;
const jdeal = haggle(jacketList, MOOD_BY_VENDOR['rastro-vintage'], 0.1); // duro: -10 % → contraoferta al suelo
assert.equal(jdeal.outcome, 'counter');
let ledger = markHaggled(undefined, JDAY, 'cazadora-ante', jdeal.price);
const bought = buyGarment({ money: 200, inventory: {}, cards: {} }, [], {}, 'rastro-vintage', 'cazadora-ante', false, jdeal.price / jacketList);
assert.ok(bought.ok, bought.message);
assert.equal(bought.paid, jdeal.price, 'no paga lo pactado');
assert.equal(bought.wallet.money, round2(200 - jdeal.price));
ledger = markSold(ledger, JDAY, 'cazadora-ante');
const paidMap = { 'cazadora-ante': bought.paid }; // lo que Menus guarda en state.paid
assert.ok(save.save({ ...start, money: bought.wallet.money, wardrobe: [...bought.wardrobe], paid: paidMap, rastro: ledger }));
const j = save.load()!;
assert.equal(j.paid?.['cazadora-ante'], jdeal.price, 'state.paid no guarda lo pagado');
const resale = sellGarment({ money: j.money, inventory: {}, cards: {} }, j.wardrobe, {}, j.paid ?? {}, 'vuelta', 'cazadora-ante');
assert.ok(resale.ok, resale.message);
// resaleValue redondea hacia abajo: a lo sumo un céntimo por debajo de round2(min(tope, pagado × tasa)).
assert.equal(resale.amount, resaleValue(jdeal.price));
assert.ok(Math.abs(resale.amount - round2(Math.min(RESALE_CAP, jdeal.price * RESALE_RATE))) <= 0.01, `reventa ${resale.amount}`);
assert.ok(resale.amount < jdeal.price, 'la reventa da más de lo pagado');
assert.ok(resale.wallet.money < 200, 'comprar y revender deja ganancia');
assert.ok(!resale.wardrobe.includes('cazadora-ante'));
// Fuera del armario, sigue agotada esa jornada: no se recompra.
assert.equal(rareStatus('rastro-vintage', 'cazadora-ante', JDAY, j.rastro, true), 'sold', 'la cazadora revendida vuelve al puesto');

console.log(`check-rastro-haggle: ${MOODS.length} moods · vinilo ${vinyl.price} → ${deal.price} el día ${DAY} · cazadora ${jacketList} → ${jdeal.price}, reventa ${resale.amount}`);
