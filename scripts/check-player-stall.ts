// CAS-09 · Tu puesto en el Gran Rastro (systems/PlayerStall, data/playerStall.ts): `npm run check`.
// Falla si se reserva sin saldo o dos veces, si la reserva no sobrevive al guardado o uno dañado se cuela, si se pone a
// la venta lo que no llevas o de otro tipo, si aceptar no quita exactamente una unidad y un tique o cobra dos veces el
// mismo opId (también tras guardar y cargar), si retirar o cerrar tocan la bolsa, si hay ofertas fuera de hora, otro día
// o con lluvia fuerte, si el reembolso por lluvia no es el alquiler entero una sola vez o si no presentarse devuelve algo.
// Control positivo (comentado): quitar en accept la comprobación de `sales.some(... opId)` debe hacer fallar (e);
// cambiar en settle `stall.fee` por 0 debe hacer fallar (g).
import assert from 'node:assert/strict';
import { PLAYER_STALL } from '../src/data/playerStall.ts';
import { accept, boardNoticeAt, decline, freeUnits, isOpen, list, listable, nextRastroDay, OFFER_MAX, offerNow, parsePlayerStall, pitchNow, refPrice, reserve, settle, stallDeskAt, summary, withdraw, type PlayerStallState, type StallOffer } from '../src/systems/PlayerStall.ts';
import { forceWeather } from '../src/systems/Weather.ts';
import { allLocations, getLocation } from '../src/systems/LocationSystem.ts';
import { PROPS } from '../src/world/tiles.ts';
import { weekIndex } from '../src/systems/Calendar.ts';
import { BASE_DRAFT, newGameState } from '../src/systems/CharacterCreator.ts';
import { SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';

// El tablón de la Plaza (36,14) del Casco Antiguo ofrece el puesto (Menus.openBoard → «Puesto en el Rastro»); otra casilla, no.
assert.equal(stallDeskAt('casco-antiguo', 36, 14), PLAYER_STALL.popUp, 'el tablón del Casco Antiguo no ofrece el puesto');
assert.equal(stallDeskAt('casco-antiguo', 43, 9), undefined, 'el plano del barrio ofrece el puesto');
assert.ok(getLocation('casco-antiguo').props?.some((p) => p.tx === 36 && p.ty === 14 && PROPS[p.kind].board), 'en (36,14) no hay tablón de barrio que abra openBoard');
// El inspect que comparte casilla con el tablón no tiene interactable propio (WorldScene): lo sirve openBoard.
assert.equal(boardNoticeAt('campo-alto', 40, 14)?.lines.length, 4, 'el tablón de Campo Alto no trae sus 4 carteles');
assert.equal(boardNoticeAt('casco-antiguo', 36, 14)?.stallDesk, PLAYER_STALL.popUp, 'el tablón del Casco Antiguo no trae el puesto');
for (const loc of allLocations()) {
  for (const p of loc.props.filter((q) => PROPS[q.kind].board)) {
    for (const i of (loc.inspects ?? []).filter((n) => n.tx === p.tx && n.ty === p.ty)) {
      const where = `${loc.id} (${i.tx},${i.ty}) «${i.name}»`;
      assert.equal(boardNoticeAt(loc.id, i.tx, i.ty), i, `${where}: el tablón no lee este inspect (hay otro en la casilla)`);
      assert.ok(i.lines.length > 0 || i.stallDesk, `${where}: encima del tablón sin carteles ni puesto, no se sirve nada`);
      assert.equal(i.venue, undefined, `${where}: una taquilla encima del tablón no se puede abrir`);
    }
  }
}

forceWeather({ rain: 0 });
const SAT = { day: 6, hour: 12, minute: 0 };
const SUN = 7;
assert.equal(weekIndex(SUN), 6, 'el día 7 no es domingo');
assert.equal(nextRastroDay(SAT.day, SAT.hour), SUN, 'el sábado no reserva para el domingo siguiente');
assert.equal(nextRastroDay(SUN, 8), SUN, 'el domingo antes de las 9 no reserva para hoy');
assert.equal(nextRastroDay(SUN, 10), SUN + 7, 'el domingo a las 10 no pasa al siguiente');

// ------------------------------------------------ (a) sin saldo, nada
const poor = reserve(undefined, PLAYER_STALL.fee - 0.01, SAT);
assert.equal(poor.ok, false, 'reserva sin saldo');
if (!poor.ok) assert.equal(poor.message, 'No te llega: el puesto cuesta 8 €.');

// ------------------------------------------------ (b) una reserva vigente a la vez
const r = reserve(undefined, 20, SAT);
assert.ok(r.ok, 'no reserva con saldo');
const booked = r.stall;
assert.equal(booked.day, SUN);
assert.equal(booked.fee, 8);
assert.equal(reserve(booked, 20, SAT).ok, false, 'segunda reserva aceptada');

// ------------------------------------------------ (d) poner a la venta
const inv: Record<string, number> = { 'gift-chocolates': 2, 'gift-magnet': 1, water: 3 };
const must = (s: { ok: true; stall: PlayerStallState } | { ok: false; message: string }, what: string): PlayerStallState => {
  assert.ok(s.ok, `${what}: ${s.ok ? '' : s.message}`);
  return s.stall;
};
assert.equal(list(booked, inv, 'water', 5).ok, false, 'agua a la venta');
assert.equal(list(booked, inv, 'gift-necklace', 5).ok, false, 'lo que no llevas, a la venta');
assert.equal(list(booked, inv, 'no-existe', 5).ok, false, 'objeto desconocido a la venta');
for (const p of [0, 0.5, 61, 2.5, NaN]) assert.equal(list(booked, inv, 'gift-magnet', p).ok, false, `precio ${p} aceptado`);
let st = must(list(booked, inv, 'gift-chocolates', 10), 'bombones 1');
st = must(list(st, inv, 'gift-chocolates', 12), 'bombones 2');
assert.equal(list(st, inv, 'gift-chocolates', 12).ok, false, 'más bombones que unidades');
st = must(list(st, inv, 'gift-magnet', 60), 'imán');
assert.equal(st.listings.length, 3);
{
  const many = { 'gift-chocolates': 9 };
  let s6 = booked;
  for (let i = 0; i < PLAYER_STALL.maxListings; i++) s6 = must(list(s6, many, 'gift-chocolates', 5), `listado ${i}`);
  assert.equal(list(s6, many, 'gift-chocolates', 5).ok, false, 'más de 5 listados');
}

// ------------------------------------------------ (f) retirar no toca la bolsa
const invBefore = structuredClone(inv);
const withdrawn = must(withdraw(st, 2), 'retirar');
assert.equal(withdrawn.listings.length, 2);
assert.deepEqual(inv, invBefore, 'retirar toca la bolsa');
assert.equal(withdraw(st, 7).ok, false, 'retirar un índice que no hay');

// ------------------------------------------------ (g) fuera de hora, otro día, lluvia
// Tiques de los bombones (ref 10, tope de sobreprecio 15): los listados a 10 y 12 reciben ofertas; el imán a 60 (ref 2), no.
const T0: Record<string, number[]> = { 'gift-chocolates': [10, 12] };
assert.equal(offerNow(st, inv, T0,{ day: SUN, hour: 8, minute: 59 }), undefined, 'oferta antes de las 9');
assert.equal(offerNow(st, inv, T0,{ day: SUN, hour: 15, minute: 0 }), undefined, 'oferta a las 15');
assert.equal(offerNow(st, inv, T0,{ day: SAT.day, hour: 12, minute: 0 }), undefined, 'oferta otro día');
assert.equal(isOpen(st, { day: SUN + 7, hour: 12, minute: 0 }), false, 'abierto otro domingo');

// ------------------------------------------------ (i) determinista y (e) aceptar
const slots = Array.from({ length: 12 }, (_, k) => ({ day: SUN, hour: 9 + Math.floor(k / 2), minute: (k % 2) * 30 }));
const offers = slots.map((c) => offerNow(st, inv, T0,c));
assert.deepEqual(slots.map((c) => offerNow(st, inv, T0,c)), offers, 'offerNow no es determinista');
assert.deepEqual(offerNow(st, inv, T0,{ day: SUN, hour: 10, minute: 10 }), offerNow(st, inv, T0,{ day: SUN, hour: 10, minute: 25 }), 'la franja no es de media hora');
const offer = offers.find((o): o is StallOffer => !!o && o.itemId === 'gift-chocolates');
assert.ok(offer, 'ninguna oferta por los bombones en todo el domingo');
assert.ok(offer.price >= PLAYER_STALL.minPrice && offer.price <= 12 && (offer.price * 2) % 1 === 0, `oferta ${offer.price}`);
assert.ok(offers.every((o) => !o || o.itemId !== 'gift-magnet'), 'el imán a 60 € recibe oferta');
const sold = accept(st, inv, T0, offer);
assert.ok(sold.ok, sold.ok ? '' : sold.message);
assert.equal(sold.inventory['gift-chocolates'], 1, 'no resta exactamente una unidad');
assert.equal(sold.inventory['gift-magnet'], 1);
assert.deepEqual(sold.paidItems, { 'gift-chocolates': [12] }, 'no consume el tique más antiguo');
assert.equal(sold.amount, offer.price);
assert.equal(sold.stall.listings.length, st.listings.length - 1, 'el listado vendido sigue en la mesa');
assert.equal(accept(sold.stall, sold.inventory, sold.paidItems, offer).ok, false, 'el mismo opId cobra dos veces');
assert.equal(offerNow(sold.stall, sold.inventory, sold.paidItems, slots[offers.indexOf(offer)]), undefined, 'la franja vendida vuelve a ofrecer');
assert.equal(accept(st, { water: 1 }, {}, offer).ok, false, 'acepta sin la unidad');
// Rechazar: la franja no vuelve a ofrecer.
const declined = must(decline(st, offer.opId), 'rechazar');
assert.equal(offerNow(declined, inv, T0, slots[offers.indexOf(offer)]), undefined, 'la oferta rechazada vuelve');
assert.equal(decline(declined, offer.opId).ok, false, 'rechazar dos veces cambia algo');

// ------------------------------------------------ (c) guardado
const store = new Map<string, string>();
const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
const save = new SaveSystem(storage);
const start = newGameState(BASE_DRAFT);
assert.ok(save.save({ ...start, playerStall: sold.stall }));
const loaded = save.load()!.playerStall;
assert.deepEqual(loaded, sold.stall, 'la reserva no sobrevive al guardado');
assert.equal(accept(loaded!, sold.inventory, sold.paidItems, offer).ok, false, 'tras cargar, el mismo opId cobra otra vez');
assert.ok(save.save({ ...start }));
assert.equal(save.load()!.playerStall, undefined, 'una partida sin puesto carga uno');
for (const junk of ['x', 3, null, [], { day: 'a' }, { day: -1 }]) assert.equal(parsePlayerStall(junk), undefined, `${JSON.stringify(junk)} se lee como puesto`);
const dirty = parsePlayerStall({
  day: SUN, fee: 8,
  listings: [{ itemId: 'water', price: 5 }, { itemId: 'gift-magnet', price: 99 }, ...Array.from({ length: 7 }, () => ({ itemId: 'gift-magnet', price: 3 }))],
  sales: [{ opId: 'a', itemId: 'gift-magnet', price: 4, net: 4 }, { opId: 'a', itemId: 'gift-magnet', price: 4, net: 4 }, { opId: 'b', itemId: 'gift-magnet', price: 500, net: 500 }],
  declined: ['z', 'z', 4],
  closed: { refund: 50 },
});
assert.ok(dirty);
assert.equal(dirty.listings.length, PLAYER_STALL.maxListings, 'listados de más o inválidos');
assert.ok(dirty.listings.every((l) => l.itemId === 'gift-magnet' && l.price === 3));
assert.deepEqual(dirty.sales.map((s) => s.opId), ['a'], 'ventas duplicadas o fuera de límites');
assert.deepEqual(dirty.declined, ['z']);
assert.deepEqual(dirty.closed, { refund: 8 }, 'reembolso mayor que el alquiler');

// ------------------------------------------------ (g) cierre: no presentarse, y lluvia
const before17 = settle(sold.stall, { day: SUN, hour: 16, minute: 59 });
assert.equal(before17.ok, false, 'cierra antes de las 17');
const noShow = must(settle(booked, { day: SUN, hour: 17, minute: 0 }), 'cierre sin presentarse');
assert.equal(noShow.closed?.refund, 0, 'no presentarse devuelve algo');
assert.equal(settle(noShow, { day: SUN + 1, hour: 9, minute: 0 }).ok, false, 'settle no es idempotente');
const closed = must(settle(sold.stall, { day: SUN + 1, hour: 0, minute: 5 }), 'cierre con ventas');
assert.deepEqual(closed.listings, [], 'al cerrar quedan cosas en la mesa');
assert.equal(closed.closed?.refund, 0);
assert.ok(reserve(closed, 20, { day: SUN + 1, hour: 9, minute: 0 }).ok, 'cerrada la anterior, no se puede reservar otra');

// ------------------------------------------------ (h) resumen sólo de lo apuntado
const sum = summary(closed);
assert.deepEqual(sum, { fee: 8, sold: 1, income: offer.price, refund: 0, net: Math.round((offer.price - 8) * 100) / 100 });

// ------------------------------------------------ economía: la oferta sale del valor del objeto, no del precio puesto
const SUNDAYS = [SUN, SUN + 7, SUN + 14, SUN + 21];
const slotsOf = (day: number) => Array.from({ length: 12 }, (_, k) => ({ day, hour: 9 + Math.floor(k / 2), minute: (k % 2) * 30 }));
const fresh = (day: number): PlayerStallState => ({ day, fee: PLAYER_STALL.fee, listings: [], sales: [], declined: [] });
// (a) un imán de 2 € a 60 €: lo miran y siguen, ninguna oferta en todo el domingo.
let overpriced = 0;
for (const day of SUNDAYS) {
  const s = must(list(fresh(day), { 'gift-magnet': 1 }, 'gift-magnet', 60), 'imán a 60');
  for (const c of slotsOf(day)) {
    const p = pitchNow(s, { 'gift-magnet': 1 }, {}, c);
    assert.ok(typeof p !== 'object', `imán a 60 €: oferta de ${typeof p === 'object' ? p.price : ''}`);
    if (p === 'overpriced') overpriced++;
  }
}
assert.ok(overpriced > 0, 'el sobreprecio nunca se dice («Lo miran y siguen.»)');
// (b) puesto a ref (o hasta ref × 1,5): ninguna oferta pasa de ref × 1,2 ni de lo puesto.
{
  const invB = { 'gift-magnet': 1, 'gift-fan': 1, 'gift-chocolates': 1 };
  const paidB = { 'gift-chocolates': [10] };
  assert.equal(refPrice('gift-magnet', {}), 2, 'ref del imán no es su catálogo');
  assert.equal(refPrice('gift-chocolates', paidB), 10, 'ref no es el tique');
  let seen = 0;
  for (const day of SUNDAYS) {
    let s = fresh(day);
    for (const [id, p] of [['gift-magnet', 2], ['gift-fan', 6], ['gift-chocolates', 15]] as const) s = must(list(s, invB, id, p), id);
    for (const c of slotsOf(day)) {
      const o = offerNow(s, invB, paidB, c);
      if (!o) continue;
      seen++;
      const ref = refPrice(o.itemId, paidB);
      assert.ok(o.price <= ref * OFFER_MAX + 1e-9, `${o.itemId}: oferta ${o.price} > ref ${ref} × 1,2`);
      assert.ok(o.price <= s.listings.find((l) => l.itemId === o.itemId)!.price, `${o.itemId}: oferta por encima de lo puesto`);
    }
  }
  assert.ok(seen > 0, 'ninguna oferta en cuatro domingos');
}
// (c) cinco regalos baratos comprados a precio de catálogo (con tique), vendidos un domingo aceptándolo todo y relistando
// al máximo que no espanta (floor(ref × 1,5)): el margen nunca pasa de 0,2 · Σcoste.
let worst = -Infinity;
const BOUGHT: readonly [string, number][] = [['gift-magnet', 2], ['gift-magnet', 2], ['gift-keyring', 3], ['gift-bracelet', 5], ['gift-fan', 6]];
const cost = BOUGHT.reduce((a, [, p]) => a + p, 0);
const bound = Math.round((OFFER_MAX - 1) * cost * 100) / 100;
for (const day of SUNDAYS) {
  let s = fresh(day);
  let bag: Record<string, number> = {};
  let paid: Record<string, number[]> = {};
  for (const [id, p] of BOUGHT) {
    bag[id] = (bag[id] ?? 0) + 1;
    paid[id] = [...(paid[id] ?? []), p];
  }
  const relist = (): void => {
    for (const id of listable(s, bag)) {
      while (freeUnits(s, bag, id) > 0 && s.listings.length < PLAYER_STALL.maxListings) {
        s = must(list(s, bag, id, Math.max(PLAYER_STALL.minPrice, Math.floor(refPrice(id, paid) * PLAYER_STALL.overpriceK))), `relistar ${id}`);
      }
    }
  };
  relist();
  let income = 0;
  for (const c of slotsOf(day)) {
    const o = offerNow(s, bag, paid, c);
    if (!o) continue;
    const r = accept(s, bag, paid, o);
    assert.ok(r.ok, r.ok ? '' : r.message);
    s = r.stall;
    bag = r.inventory;
    paid = r.paidItems;
    income += r.amount;
    relist();
  }
  const net = summary(s).net;
  assert.ok(income - cost <= bound + 1e-9, `domingo ${day}: vender todo da ${income} por ${cost} de coste (> +${bound})`);
  assert.ok(net - cost <= bound - PLAYER_STALL.fee + 1e-9, `domingo ${day}: neto del puesto ${net} − coste ${cost} supera ${bound} − alquiler`);
  worst = Math.max(worst, income - cost);
}
console.log(`check-player-stall: 5 regalos por ${cost} € · margen máximo permitido +${bound} € (0,2 · coste) − ${PLAYER_STALL.fee} € de alquiler · peor domingo simulado ${Math.round(worst * 100) / 100} € antes del alquiler`);

forceWeather({ rain: 0.9 });
assert.equal(isOpen(st, { day: SUN, hour: 12, minute: 0 }), false, 'abierto con lluvia fuerte');
assert.ok(slots.every((c) => offerNow(st, inv, T0,c) === undefined), 'oferta con lluvia fuerte');
const rained = must(settle(st, { day: SUN, hour: 17, minute: 0 }), 'cierre con lluvia');
assert.equal(rained.closed?.refund, PLAYER_STALL.fee, 'con lluvia todo el día no se devuelve el alquiler');
assert.equal(settle(rained, { day: SUN, hour: 18, minute: 0 }).ok, false, 'el reembolso se da dos veces');
assert.equal(summary(rained).net, 0, 'lluvia: el neto no es 0');
forceWeather(null);

console.log(`check-player-stall: oferta ${offer.buyer} ${offer.price} € por ${offer.itemId} · neto ${sum.net} · lluvia devuelve ${rained.closed?.refund} €`);
