// Simula años de viajes en metro con el mismo gestor que usa el juego:
// `npm run simulate:events [partidas] [días]`. Falla si algo no se cumple.
import assert from 'node:assert/strict';
import { METRO_EVENTS } from '../src/data/metroEvents.ts';
import { METRO_EVENT_RULES } from '../src/config/metro.ts';
import { emptyMemory, MetroEventManager, stamp, type MetroEventDef, type RideContext } from '../src/systems/MetroEventManager.ts';
import { crowdAt, hashSeed, intBetween, metroDay, seededRng, type Rng } from '../src/systems/MetroDaily.ts';

const RUNS = Number(process.argv[2] ?? 40);
const DAYS = Number(process.argv[3] ?? 365);
const byId = new Map(METRO_EVENTS.map((e) => [e.id, e]));

/** Horas de salida de un día normal: ir, quizá comer fuera, volver, quizá salir de noche. */
function ridesOf(rng: Rng, day: number): [number, number][] {
  const out: [number, number][] = [];
  const at = (h0: number, h1: number): void => { out.push([intBetween(rng, h0, h1 - 1), intBetween(rng, 0, 59)]); };
  if (metroDay(day).weekend) {
    for (let i = intBetween(rng, 0, 2); i > 0; i--) at(11, 23);
  } else {
    at(7, 10);
    if (rng() < 0.4) at(13, 15);
    at(17, 21);
    if (rng() < 0.25) at(22, 24);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

interface Fired { ev: MetroEventDef; ctx: RideContext; ride: number; choice?: string }

function play(run: number) {
  const rng = seededRng(hashSeed('eventos', run));
  const store = { events: emptyMemory() };
  const manager = new MetroEventManager(store, rng);
  const fired: Fired[] = [];
  let money = 1200;
  let energy = 70;
  let rides = 0;
  let at: 'vallesco-station' | 'ribera-station' = 'vallesco-station';

  for (let day = 1; day <= DAYS; day++) {
    for (const [hour, minute] of ridesOf(rng, day)) {
      const to = at === 'vallesco-station' ? 'ribera-station' : 'vallesco-station';
      money -= 2;
      const ctx: RideContext = { day, hour, minute, money, energy, to };
      rides++;
      const ev = manager.onRide(ctx);
      at = to;
      if (!ev) continue;
      assert.equal(manager.takePending(), ev);
      const choice = ev.choices?.[intBetween(rng, 0, ev.choices.length - 1)].id;
      const out = manager.resolve(ev, ctx, choice);
      money += out.money;
      energy = Math.max(0, Math.min(100, energy + out.energy));
      fired.push({ ev, ctx, ride: store.events.rides, choice });
    }
    energy = Math.min(100, energy + 10);

    // A mitad de partida, guardar y cargar no debe cambiar nada.
    if (day === Math.floor(DAYS / 2)) store.events = JSON.parse(JSON.stringify(store.events));
  }
  return { fired, rides, memory: store.events };
}

// ---------------------------------------------------------------- partidas

let totalRides = 0;
let totalEvents = 0;
const count: Record<string, number> = {};
const firstDay: Record<string, number[]> = {};
const chains = { cartera: 0, amparo1: 0, amparo2: 0, olga: 0, olga2: 0 };

for (let run = 0; run < RUNS; run++) {
  const { fired, rides, memory } = play(run);
  totalRides += rides;
  totalEvents += fired.length;

  // Cooldown global: nunca dos viajes seguidos con evento; pausa entre narrativos.
  for (let i = 1; i < fired.length; i++) {
    assert.ok(fired[i].ride - fired[i - 1].ride > METRO_EVENT_RULES.quietRides, 'dos eventos casi seguidos');
  }
  const narrative = fired.filter((f) => f.ev.rarity !== 'ambient');
  for (let i = 1; i < narrative.length; i++) {
    const gap = stamp(narrative[i].ctx) - stamp(narrative[i - 1].ctx);
    assert.ok(gap >= METRO_EVENT_RULES.narrativeGapHours * 60, `pausa narrativa rota: ${gap} min`);
  }

  const seenAt: Record<string, Fired[]> = {};
  for (const f of fired) {
    const id = f.ev.id;
    count[id] = (count[id] ?? 0) + 1;
    (seenAt[id] ??= []).push(f);
    // Condiciones comprobadas por fuera del gestor, no con su propio whyNot.
    const crowd = crowdAt(metroDay(f.ctx.day), f.ctx.hour, f.ctx.minute);
    const c = f.ev.conditions ?? {};
    if (c.crowd) assert.ok(c.crowd.includes(crowd), `${id} con afluencia ${crowd}`);
    if (c.to) assert.ok(c.to.includes(f.ctx.to!), `${id} hacia ${f.ctx.to}`);
    if (c.hours) {
      const [a, b] = c.hours;
      const h = f.ctx.hour;
      assert.ok(a <= b ? h >= a && h < b : h >= a || h < b, `${id} a las ${h}`);
    }
    if (c.weekend !== undefined) assert.equal(metroDay(f.ctx.day).weekend, c.weekend, `${id} en día equivocado`);
  }
  for (const [id, list] of Object.entries(seenAt)) {
    const ev = byId.get(id)!;
    (firstDay[id] ??= []).push(list[0].ctx.day);
    if (ev.once) assert.equal(list.length, 1, `${id} es único y salió ${list.length} veces`);
    for (let i = 1; i < list.length; i++) {
      const gap = stamp(list[i].ctx) - stamp(list[i - 1].ctx);
      assert.ok(gap >= ev.cooldown * 1440, `${id} saltó su cooldown`);
    }
    assert.deepEqual(memory.eventsSeen[id], list.map((f) => f.ctx.day), `${id}: historial distinto`);
  }

  // Decisiones registradas, una por evento con opciones y en orden.
  const withChoice = fired.filter((f) => f.choice);
  assert.deepEqual(memory.choicesMade.map((c) => `${c.event}:${c.choice}`), withChoice.map((f) => `${f.ev.id}:${f.choice}`));

  // Cadenas: la continuación nunca antes de su causa ni fuera de plazo.
  const when = (id: string, choice?: string) =>
    fired.find((f) => f.ev.id === id && (choice === undefined || f.choice === choice));
  const cartera = when('int-cartera', 'devolver');
  const vuelve = when('enc-amparo-vuelve');
  const oportunidad = when('enc-amparo-oportunidad');
  const olga = when('enc-olga', 'preguntar');
  const olga2 = when('enc-olga-reencuentro');
  if (vuelve) {
    assert.ok(cartera, 'Amparo vuelve sin haber devuelto la cartera');
    const d = vuelve.ctx.day - cartera.ctx.day;
    assert.ok(d >= 19 && d <= 40 + METRO_EVENT_RULES.followUpWindowDays + 1, `Amparo vuelve a los ${d} días`);
  }
  if (oportunidad) assert.ok(vuelve && oportunidad.ctx.day - vuelve.ctx.day >= 24, 'oportunidad antes de tiempo');
  if (olga2) assert.ok(olga && olga2.ctx.day - olga.ctx.day >= 2, 'Olga reaparece sin haberla conocido');
  if (cartera && cartera.ctx.day < DAYS - 70) {
    chains.cartera++;
    if (vuelve) chains.amparo1++;
    if (oportunidad) chains.amparo2++;
  }
  if (olga && olga.ctx.day < DAYS - 40) {
    chains.olga++;
    if (olga2) chains.olga2++;
  }
}

// ------------------------------------------------------------------ gestor

{
  const store = { events: emptyMemory() };
  const m = new MetroEventManager(store, seededRng(1));
  const ctx: RideContext = { day: 3, hour: 3, minute: 0, money: 0, energy: 50, to: 'vallesco-station' };
  m.forceEvent('raro-sobre');
  assert.equal(m.onRide(ctx)?.id, 'raro-sobre', 'forceEvent ignora las condiciones');
  m.resolve(m.takePending()!, ctx, 'quedar');
  assert.equal(m.listAvailableEvents(ctx).find((r) => r.id === 'raro-sobre')?.estado, 'ya ocurrió');
  assert.equal(m.inspectEventHistory().choicesMade.length, 1);
  assert.throws(() => m.forceEvent('no-existe'));
  assert.throws(() => m.resolve(byId.get('int-cartera')!, ctx, 'otra'));
  m.resetMetroEvents();
  assert.deepEqual(store.events, emptyMemory());
}

// ---------------------------------------------------------------- informe

const rate = totalEvents / totalRides;
const pct = (n: number) => `${(n * 100).toFixed(1)} %`;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log(`${RUNS} partidas × ${DAYS} días · ${totalRides} viajes · ${totalEvents} eventos (${pct(rate)} de los viajes)\n`);
for (const ev of METRO_EVENTS) {
  const n = count[ev.id] ?? 0;
  const first = firstDay[ev.id] ?? [];
  console.log(
    `${ev.id.padEnd(24)} ${ev.rarity.padEnd(11)} ${String(n).padStart(5)}  ${pct(n / totalRides).padStart(7)}  ` +
      `en ${String(first.length).padStart(2)}/${RUNS} partidas` + (first.length ? `, primera vez ~día ${median(first)}` : ''),
  );
}
console.log(
  `\ncadenas: cartera devuelta ${chains.cartera} → Amparo vuelve ${chains.amparo1} → oportunidad ${chains.amparo2}` +
    ` · Olga ${chains.olga} → reencuentro ${chains.olga2}`,
);

const byRarity = (r: string) => METRO_EVENTS.filter((e) => e.rarity === r).reduce((s, e) => s + (count[e.id] ?? 0), 0);
assert.ok(rate > 0.08 && rate < 0.3, `frecuencia total ${pct(rate)} fuera de [8 %, 30 %]`);
assert.ok(byRarity('ambient') > byRarity('interactive'), 'los ambientales deben ser lo más común');
assert.ok(byRarity('interactive') > byRarity('exceptional') * 3, 'lo excepcional no es raro');
assert.ok(byRarity('exceptional') / totalRides < 0.005, 'lo excepcional sale en más del 0,5 % de viajes');
assert.ok(median(firstDay['raro-sobre'] ?? [Infinity]) >= 60, 'el evento raro llega demasiado pronto');
assert.ok(chains.cartera > 0 && chains.amparo1 / chains.cartera >= 0.8, 'la cadena de Amparo casi nunca continúa');
assert.ok(chains.amparo2 > 0, 'la oportunidad de Amparo no sale nunca');
assert.ok(chains.olga > 0 && chains.olga2 / chains.olga >= 0.8, 'Olga casi nunca reaparece');
console.log('\nOK: frecuencias, condiciones, cooldowns, decisiones, cadenas y depuración.');
