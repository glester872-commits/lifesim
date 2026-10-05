// El servicio de mesa en los tres tipos de local (systems/TableService.ts, cartas en data/menus.ts): `npm run check`.
// Falla si en restaurante, cafetería o vinoteca el jugador no puede sentarse, que le tomen nota en la mesa, comer,
// pedir otra ronda sin levantarse y pagar el total de la visita una sola vez; o si una carta se mezcla con otra.
import assert from 'node:assert/strict';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { placeInfo } from '../src/systems/Places.ts';
import { Crowd, profileFor, type Clock } from '../src/systems/Crowd.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { MENUS, type MenuItem, type VenueType } from '../src/data/menus.ts';

const STEP_MS = 100;
const MS_PER_MIN = 500;
const at = (day: number, hhmm: string): Clock => ({ day, hour: Number(hhmm.slice(0, 2)), minute: Number(hhmm.slice(3)) });
const addMinutes = (c: Clock, m: number): Clock => {
  const total = c.hour * 60 + c.minute + m;
  return { day: c.day + Math.floor(total / 1440), hour: Math.floor((total % 1440) / 60), minute: total % 60 };
};
const by = (items: readonly MenuItem[], id: string): MenuItem => {
  const item = items.find((i) => i.id === id);
  assert.ok(item, `falta ${id} en la carta`);
  return item;
};

// ------------------------------------------------ las cartas: cada local la suya, sin mezclas
{
  const menu = (venue: VenueType) => MENUS.find((m) => m.venue === venue)!;
  for (const m of MENUS) for (const i of m.items) assert.ok(m.categories.some((c) => c.id === i.category), `${m.id}: ${i.id} sin grupo en la carta`);
  assert.ok(!menu('cafe').items.some((i) => i.wine), 'la cafetería enseña vinos de la vinoteca');
  assert.ok(!menu('wine_bar').items.some((i) => i.dish === 'coffee'), 'la vinoteca enseña cafés');
  const wines = menu('wine_bar').items.filter((i) => i.wine?.serving === 'glass');
  for (const color of ['red', 'white', 'rose'] as const) assert.ok(wines.filter((w) => w.wine?.color === color).length >= 4, `pocos vinos ${color}`);
  for (const w of wines) {
    assert.ok(w.wine?.origin && w.wine.notes && w.wine.body, `${w.id}: sin origen, notas o cuerpo`);
    assert.ok(menu('wine_bar').items.some((b) => b.wine?.wine === w.wine?.wine && b.wine?.serving === 'bottle' && b.price > w.price * 3), `${w.id}: sin botella`);
  }
  assert.ok(menu('wine_bar').items.filter((i) => i.category === 'tapas').length >= 10, 'pocas tapas');
  for (const m of MENUS) for (const k of ['greet', 'again', 'confirm', 'serve', 'bill'] as const) assert.ok(m.lines[k].length >= 2, `${m.id}: siempre la misma frase (${k})`);
}

// ------------------------------------------------ el jugador, dos rondas y la cuenta, en cada local
interface Visit {
  place: string;
  venue: VenueType;
  when: Clock;
  first: (items: readonly MenuItem[]) => MenuItem[];
  second: (items: readonly MenuItem[]) => MenuItem[];
}
const VISITS: readonly Visit[] = [
  { place: 'restaurant', venue: 'restaurant', when: at(3, '14:00'), first: (i) => [by(i, 'menu-dia'), by(i, 'agua')], second: (i) => [by(i, 'tarta'), by(i, 'cafe')] },
  // La cafetería: café con leche y croissant; luego otra bebida, sin levantarse ni ir a la barra.
  { place: 'cafe', venue: 'cafe', when: at(3, '09:00'), first: (i) => [by(i, 'cafe-leche'), by(i, 'croissant')], second: (i) => [by(i, 'zumo')] },
  // La vinoteca: una copa de Rioja con manchego; luego otra copa de otro vino (Albariño) y otra tapa.
  { place: 'wine-bar', venue: 'wine_bar', when: at(5, '21:00'), first: (i) => [by(i, 'rioja-crianza-copa'), by(i, 'manchego')], second: (i) => [by(i, 'albarino-copa'), by(i, 'boquerones')] },
];

for (const v of VISITS) {
  const place = placeInfo(v.place)!;
  const crowd = new Crowd(getLocation(place.interior!), place, profileFor(v.place)!, seededRng(7));
  const player = { tx: 1, ty: 2 };
  let clock = v.when;
  crowd.populate(clock, player);
  const service = crowd.service;
  assert.ok(service, `${v.place}: sin servicio de mesa`);
  assert.equal(service.menu.venue, v.venue, `${v.place}: carta de otro tipo de local`);
  assert.ok(crowd.agents.some((a) => a.role === 'waiter'), `${v.place}: nadie sirve las mesas`);
  const mine = service.tables.find((t) => t.state === 'AVAILABLE');
  assert.ok(mine, `${v.place}: ninguna mesa libre`);

  const calls: string[] = [];
  const ordered: MenuItem[] = [];
  let paid = 0;
  service.onPlayer = (call) => {
    calls.push(call.kind);
    if (call.kind === 'order') {
      const round = calls.filter((k) => k === 'order').length;
      assert.equal(call.again, round > 1, `${v.place}: el camarero no sabe si es otra ronda`);
      const pick = round === 1 ? v.first(call.items) : v.second(call.items);
      ordered.push(...pick);
      service.playerOrder(pick);
    }
    if (call.kind === 'bill') {
      paid = service.playerPay();
      assert.equal(service.playerPay(), 0, `${v.place}: se cobra dos veces`);
    }
  };
  service.seatPlayer(mine.def.seats[0]);
  let asked = 0;
  for (let ms = 0, elapsed = 0; ms < 240 * MS_PER_MIN && mine.state !== 'PAID'; ms += STEP_MS) {
    crowd.update(STEP_MS, clock, player);
    if ((elapsed += STEP_MS) >= MS_PER_MIN) {
      elapsed -= MS_PER_MIN;
      clock = addMinutes(clock, 1);
    }
    // Sentado, sin levantarse: acabada la primera ronda, otra; acabada la segunda, la cuenta (y pedirla dos veces no hace nada).
    if (mine.state === 'ROUND_DONE') {
      asked++;
      if (asked === 1) assert.equal(service.playerAsk('order'), null, `${v.place}: no deja pedir otra ronda`);
      else {
        assert.equal(service.playerAsk('bill'), null, `${v.place}: no deja pedir la cuenta`);
        assert.notEqual(service.playerAsk('bill'), null, `${v.place}: pide la cuenta dos veces`);
      }
    }
  }
  const total = ordered.reduce((s, i) => s + i.price, 0);
  const flow = calls.filter((k, i, all) => k !== all[i - 1]);
  console.log(`check-venues: ${v.place} (${v.venue}) · ${flow.join(' → ')} · ${ordered.map((i) => i.name).join(', ')} · pagado ${paid.toFixed(2)} €`);
  assert.deepEqual(flow, ['order', 'served', 'finished', 'order', 'served', 'finished', 'bill'], `${v.place}: el jugador no pasa por las dos rondas y la cuenta`);
  assert.equal(mine.state, 'PAID', `${v.place}: no se llega a pagar`);
  assert.ok(Math.abs(paid - total) < 1e-9, `${v.place}: la cuenta (${paid}) no es el total de la visita (${total})`);
  // Ya pagado, levantarse no cobra nada y la mesa queda para recoger o libre.
  assert.equal(service.playerStands(), 0, `${v.place}: cobra al levantarse después de pagar`);
  assert.ok(mine.party === null && (mine.state === 'DIRTY' || mine.state === 'AVAILABLE'), `${v.place}: la mesa no se libera`);
  assert.equal(crowd.pathFailures, 0, `${v.place}: rutas no encontradas`);
}

// ------------------------------------------------ levantarse a medias: nunca atrapado, y lo servido se paga
{
  const place = placeInfo('cafe')!;
  const crowd = new Crowd(getLocation(place.interior!), place, profileFor('cafe')!, seededRng(9));
  const clock = at(3, '10:00');
  crowd.populate(clock, { tx: 1, ty: 2 });
  const service = crowd.service!;
  const mine = service.tables.find((t) => t.state === 'AVAILABLE')!;
  service.onPlayer = (call) => {
    if (call.kind === 'order') service.playerOrder([by(call.items, 'cortado')]);
  };
  service.seatPlayer(mine.def.seats[0]);
  for (let ms = 0; ms < 120_000 && mine.state !== 'SERVED'; ms += STEP_MS) crowd.update(STEP_MS, clock, { tx: 1, ty: 2 });
  assert.equal(mine.state, 'SERVED', 'cafetería: no llega el cortado');
  assert.equal(service.playerStands(), by(service.menu.items, 'cortado').price, 'levantarse sin pagar no deja lo servido');
  assert.equal(service.playerTable, undefined, 'el jugador sigue atado a la mesa');
}
