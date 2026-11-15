// MAP-07 · reputación local por barrio: `npm run check`. Subir y bajar, idempotencia, clamp ±100, como mucho 10
// motivos, precio ±10 % sobre un producto real cobrado con checkout, tono, acceso, y el guardado v4 → v5.
import assert from 'node:assert/strict';
import { SAVE_KEY, SAVE_VERSION } from '../src/config/constants.ts';
import { REPUTATION_BAN_AT, REPUTATION_MAX_REASONS, REPUTATION_TRIGGERS } from '../src/data/reputation.ts';
import { getCatalog } from '../src/data/catalogs.ts';
import { checkout, maxQty } from '../src/systems/Commerce.ts';
import { apply, canEnter, eventWeightFactor, parseReputation, priceFactor, reasonLabel, settleWithReputation, tone, zoneOf, type Reputation } from '../src/systems/Reputation.ts';
import { JOBS } from '../src/data/jobs.ts';
import { STOPS } from '../src/data/transit.ts';
import { STREET_EVENTS } from '../src/data/streetEvents.ts';
import { ALLEY_SPOTS } from '../src/data/alleyDeals.ts';
import { hire, missedNotice, settle } from '../src/systems/Jobs.ts';
import { phaseAt, planNight, setReputationSource, StreetEvent } from '../src/systems/StreetEvents.ts';
import { AlleyDeal } from '../src/systems/AlleyDeals.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
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

// MAP-07b (a) Turno faltado: la función real que usa GameState.settleJob (Reputation.settleWithReputation).
{
  const def = JOBS[0];
  const station = STOPS.find((s) => s.id === def.place)?.station;
  const zone = station ? zoneOf(station) : null;
  assert.ok(zone, `${def.id}: el puesto (${def.place}) no tiene barrio`);
  const delta = REPUTATION_TRIGGERS['shift-missed'].delta;
  assert.equal(delta, -5);
  const hired = hire(def, 1);
  // Unos días sin fichar (menos que el despido): cada falta resta en el barrio de la estación del puesto (STOPS).
  // El primer día (a días enteros) con alguna falta ya cerrada.
  let today = 2;
  while (today < 30 && settle(hired, today * 1440).missed.length === 0) today++;
  const now = today * 1440;
  const expected = settle(hired, now).missed;
  assert.ok(expected.length > 0 && expected.length < def.maxStrikes, `faltas hasta el día ${today}: ${expected.length}`);
  const firstMissed = expected[0];
  const first = settleWithReputation(hired, {}, now, today);
  assert.deepEqual(first.missed, expected);
  assert.equal(first.fired, false);
  const key = `missed:${def.id}:${firstMissed}`;
  assert.equal(first.reputation[zone].value, delta * expected.length);
  assert.deepEqual(Object.keys(first.reputation), [zone]);
  assert.equal(reasonLabel(first.reputation[zone].reasons[0]), 'Turno sin fichar');
  assert.match(missedNotice(first.progress, first.missed), /^Faltaste al turno/);
  // Otra pasada (el progreso ya repasado o el viejo otra vez): la clave `missed:job:día` no cuenta dos veces.
  const again = settleWithReputation(first.progress, first.reputation, now, today);
  assert.deepEqual(again.missed, []);
  assert.equal(again.reputation, first.reputation);
  assert.equal(missedNotice(again.progress, again.missed), '');
  const replay = settleWithReputation(hired, first.reputation, now, today);
  assert.equal(replay.reputation[zone].value, delta * expected.length);
  assert.equal(replay.reputation[zone].reasons.filter((x) => x.id === key).length, 1);
  // Despido: tantas faltas como maxStrikes; cada una resta una vez y el aviso es el del despido.
  const late = settleWithReputation(hired, {}, 200 * 1440, 200);
  assert.equal(late.fired, true);
  assert.equal(late.progress.status, 'fired');
  assert.equal(late.missed.length, def.maxStrikes);
  assert.equal(late.reputation[zone].value, Math.max(-100, delta * def.maxStrikes));
  assert.match(missedNotice(late.progress, late.missed), /contrato se acaba/);
}

// (b) Factura con retraso: −1, con su etiqueta; la pagada a tiempo sigue siendo «Factura pagada»; la clave no se repite.
{
  assert.equal(REPUTATION_TRIGGERS['bill-late'].delta, -1);
  assert.equal(reasonLabel({ id: 'bill:rent:2', delta: -1 }), 'Factura pagada con retraso');
  assert.equal(reasonLabel({ id: 'bill:x:1', delta: 2 }), 'Factura pagada');
  let b: Reputation = apply({}, 'vallesco', REPUTATION_TRIGGERS['bill-late'].delta, 'bill:rent:2', 20);
  b = apply(b, 'vallesco', REPUTATION_TRIGGERS['bill-late'].delta, 'bill:rent:2', 21);
  assert.equal(b.vallesco.value, -1);
}

// (c) Peso de los eventos: [1, 1.3], sólo en el extremo de su polaridad.
{
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;
  assert.ok(near(eventWeightFactor(-100, 'negative'), 1.3));
  assert.equal(eventWeightFactor(0, 'negative'), 1);
  assert.equal(eventWeightFactor(100, 'negative'), 1);
  assert.ok(near(eventWeightFactor(100, 'positive'), 1.3));
  assert.equal(eventWeightFactor(-100, 'positive'), 1);
  assert.equal(eventWeightFactor(Number.NaN, 'negative'), 1);
  assert.equal(eventWeightFactor(Number.POSITIVE_INFINITY, 'positive'), 1);
  assert.ok(near(eventWeightFactor(-500, 'negative'), 1.3));
  assert.ok(near(eventWeightFactor(900, 'positive'), 1.3));
}

// (d) Las peleas (polaridad negativa) con mala fama: nunca menos noches, alguna más; con 0, idéntico a no pasarla.
{
  const negatives = STREET_EVENTS.filter((e) => e.polarity === 'negative');
  assert.ok(negatives.length > 0, 'ninguna def con polaridad negativa');
  let more = false;
  for (const def of negatives) {
    const loc = getLocation(def.location);
    let bad = 0;
    let neutral = 0;
    for (let day = 1; day <= 200; day++) {
      const plain = planNight(def, loc, day);
      const zero = planNight(def, loc, day, undefined, 0);
      assert.deepEqual(zero, plain, `${def.id} día ${day}: rep 0 cambia la noche`);
      const hostile = planNight(def, loc, day, undefined, -100);
      if (plain.happens) assert.ok(hostile.happens, `${def.id} día ${day}: con mala fama desaparece`);
      neutral += plain.happens ? 1 : 0;
      bad += hostile.happens ? 1 : 0;
    }
    assert.ok(bad >= neutral);
    if (bad > neutral) more = true;
  }
  assert.ok(more, 'la mala fama no añade ninguna noche en 200 días');
}

// (e) El proveedor (setReputationSource, lo fija main.ts): StreetEvent.night y la consulta de AlleyDeals (planNight sin
// `rep`) ven la misma noche, y con −100 sale alguna que con 0 no salía. Se restaura el proveedor por defecto al acabar.
{
  const def = STREET_EVENTS.find((e) => e.polarity === 'negative')!;
  const loc = getLocation(def.location);
  const DAYS = 200;
  const neutral = Array.from({ length: DAYS }, (_, i) => planNight(def, loc, i + 1).happens);
  setReputationSource(() => -100);
  try {
    const ev = new StreetEvent(def, loc);
    let added = 0;
    for (let day = 1; day <= DAYS; day++) {
      const n = ev.night(day);
      assert.deepEqual(planNight(def, loc, day), n, `${def.id} día ${day}: StreetEvent y AlleyDeals ven noches distintas`);
      if (n.happens && !neutral[day - 1]) added++;
    }
    assert.ok(added > 0, 'con −100 en el proveedor no sale ninguna noche nueva');
    // El trapicheo que cede el sitio a esa pelea nunca coincide con la noche que da StreetEvent.
    for (const spot of ALLEY_SPOTS.filter((s) => s.yieldsTo === def.id && s.location === def.location)) {
      const deal = new AlleyDeal(spot, loc);
      deal.devReset();
      for (let day = 1; day <= DAYS; day++) {
        for (const e of deal.plan(day).episodes) {
          for (const d of [e.day - 1, e.day]) {
            const n = ev.night(d);
            for (let t = e.start; t < e.end; t += 5) assert.equal(phaseAt(n, t), 'none', `${spot.id}: coincide con la pelea el día ${e.day}`);
          }
        }
      }
    }
  } finally {
    setReputationSource(() => 0);
  }
  assert.equal(planNight(def, loc, 7).happens, neutral[6]);
}

console.log('check-reputation: ok');
