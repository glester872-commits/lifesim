// CAS-07 · la vida del Gran Rastro (Casco Antiguo): quien mira los diez puestos que venden (CAS_RASTRO_BROWSE_, en
// data/cascoAntiguo.ts) sólo sale con el Rastro abierto, nunca se amontona en un puesto ni se queda plantado, y el
// domingo por la mañana hay más gente que por la tarde o que un martes, dentro del presupuesto. Sin Phaser.
import assert from 'node:assert/strict';
import { BUDGETS } from '../src/config/budgets.ts';
import { POPUPS } from '../src/data/popups.ts';
import { PROTESTS } from '../src/data/protests.ts';
import { STREET_ACTS } from '../src/data/streetActs.ts';
import { getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { tilePath } from '../src/systems/Navigation.ts';
import type { Clock } from '../src/systems/Crowd.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { StreetLife, streetProfileFor, type Walker } from '../src/systems/StreetLife.ts';
import { forceWeather } from '../src/systems/Weather.ts';

const BROWSE = 'CAS_RASTRO_BROWSE_';
const street = getLocation('casco-antiguo');
const points = street.points ?? {};
const rastro = POPUPS.find((p) => p.id === 'gran-rastro')!;
const vendors = rastro.stalls?.vendors ?? [];
assert.equal(vendors.length, 10, 'el Gran Rastro no tiene diez puestos que venden');

// (a) Diez sitios para mirar, transitables y a pie desde la salida del metro.
const ids = Array.from({ length: 10 }, (_, i) => `${BROWSE}${String(i + 1).padStart(2, '0')}`);
const station = getLocation('casco-antiguo-station');
const out = station.portals.find((p) => !p.train)!;
const metro = street.spawns[out.to.spawn];
for (const id of ids) {
  const pt = points[id];
  assert.ok(pt, `falta ${id}`);
  assert.ok(isWalkable(street, pt.tx, pt.ty), `${id} en ${pt.tx},${pt.ty} no es transitable`);
  assert.ok(tilePath(street, metro, pt), `del metro a ${id} no se llega andando`);
}

// (b) Ninguno pisa un ancla de puesto, un sitio de la concentración o de la policía; y cada puesto que vende tiene el suyo.
const anchors = street.stallAnchors ?? [];
const protestTiles = PROTESTS.filter((p) => p.location === 'casco-antiguo').flatMap((p) => [...p.slots, ...p.policeSlots]);
for (const id of ids) {
  const pt = points[id];
  for (const a of anchors) assert.ok(a.tx !== pt.tx || a.ty !== pt.ty, `${id} encima del ancla ${a.id}`);
  for (const s of protestTiles) assert.ok(s.tx !== pt.tx || s.ty !== pt.ty, `${id} en un sitio de la concentración (${s.tx},${s.ty})`);
}
for (const v of vendors) {
  const a = anchors.find((x) => x.id === v.anchor)!;
  assert.ok(ids.some((id) => Math.abs(points[id].tx - a.tx) <= 2 && Math.abs(points[id].ty - a.ty) === 1), `${v.name} sin sitio para mirarlo`);
}

// (b2) El músico del Rastro: sólo el domingo, en un tile libre de puestos, paradas y concentración.
{
  const act = STREET_ACTS.find((a) => a.id === 'cas-guitarra-rastro');
  assert.ok(act, 'falta el músico del Rastro');
  assert.deepEqual(act.days, [6], 'el músico del Rastro no toca sólo el domingo');
  const gp = points[act.pitch[0]];
  assert.ok(gp, `falta ${act.pitch[0]}`);
  assert.ok(isWalkable(street, gp.tx, gp.ty), `${act.pitch[0]} no es transitable`);
  for (const a of anchors) assert.ok(a.ty !== gp.ty || (gp.tx !== a.tx && gp.tx !== a.tx + 1), `${act.pitch[0]} encima del puesto ${a.id}`);
  for (const id of ids) assert.ok(points[id].tx !== gp.tx || points[id].ty !== gp.ty, `${act.pitch[0]} en ${id}`);
  for (const s of protestTiles) assert.ok(s.tx !== gp.tx || s.ty !== gp.ty, `${act.pitch[0]} en un sitio de la concentración (${s.tx},${s.ty})`);
}

// (c–f) La calle simulada.
forceWeather({ rain: 0, cloud: 0, celsius: 22, wet: 0 });
const STEP_MS = 100;
const MS_PER_MIN = 500;
const PLAYER = { tx: 10, ty: 15 };
const addMinutes = (c: Clock, m: number): Clock => {
  const total = c.hour * 60 + c.minute + m;
  return { day: c.day + Math.floor(total / 1440), hour: Math.floor((total % 1440) / 60), minute: total % 60 };
};
const simulate = (seed: number, from: Clock, minutes: number, each: (life: StreetLife, c: Clock, simMin: number) => void): StreetLife => {
  const life = new StreetLife(street, streetProfileFor('casco-antiguo')!, seededRng(seed));
  let clock = from;
  life.populate(clock, PLAYER);
  let elapsed = 0;
  const steps = Math.ceil((minutes * MS_PER_MIN) / STEP_MS);
  for (let i = 0; i < steps; i++) {
    life.update(STEP_MS, clock, PLAYER);
    elapsed += STEP_MS;
    if (elapsed >= MS_PER_MIN) {
      elapsed -= MS_PER_MIN;
      clock = addMinutes(clock, 1);
    }
    each(life, clock, ((i + 1) * STEP_MS) / MS_PER_MIN);
  }
  return life;
};
const inWindow = (c: Clock, from: number, to: number): boolean => c.hour + c.minute / 60 >= from && c.hour + c.minute / 60 < to;
const mean = (xs: readonly number[]): number => xs.reduce((n, x) => n + x, 0) / Math.max(1, xs.length);
const isRastro = (a: Walker): boolean => !!a.rule?.to.points?.includes(BROWSE);
const STAY_MAX = Math.max(...streetProfileFor('casco-antiguo')!.trips.filter((r) => r.to.points?.includes(BROWSE)).map((r) => r.stay![1]));
const LOW = BUDGETS.low.agents;
let peak = 0;

// Domingo (día 7) de 9:30 a 14:00: ≤ 2 personas por puesto y nadie más de lo que dura su parada (+2 min).
const sundayAm: number[] = [];
const since = new Map<number, number>();
let browsed = 0;
const am = simulate(7, { day: 7, hour: 9, minute: 30 }, 270, (life, c, t) => {
  peak = Math.max(peak, life.agents.length);
  const live = life.agents.filter((a) => !a.vanish);
  const per = new Map<string, number>();
  for (const a of live) {
    const pt = a.stayPoint ?? a.leader?.stayPoint;
    if (pt?.startsWith(BROWSE)) per.set(pt, (per.get(pt) ?? 0) + 1);
  }
  for (const [pt, n] of per) assert.ok(n <= 2, `${pt} con ${n} personas a las ${c.hour}:${c.minute}`);
  // La parada cuenta desde que ha llegado todo el grupo (como el temporizador de StreetLife).
  const stayingNow = new Set<number>();
  for (const a of live) {
    if (!a.staying || !a.stayPoint?.startsWith(BROWSE)) continue;
    if (live.some((f) => f.leader === a && !f.settled)) continue;
    stayingNow.add(a.id);
    if (!since.has(a.id)) {
      since.set(a.id, t);
      browsed++;
    }
    assert.ok(t - since.get(a.id)! <= STAY_MAX + 2, `${a.id} lleva ${(t - since.get(a.id)!).toFixed(1)} min en ${a.stayPoint}`);
  }
  for (const id of [...since.keys()]) if (!stayingNow.has(id)) since.delete(id);
  if (inWindow(c, 10, 14)) sundayAm.push(life.summary.walkers);
});
assert.ok(browsed > 0, 'en toda la mañana del Rastro nadie se para a mirar un puesto');
assert.equal(am.pathFailures, 0, 'domingo por la mañana: rutas no encontradas');

// Domingo de 16:00 a 18:00, ya recogido.
const sundayPm: number[] = [];
const pm = simulate(7, { day: 7, hour: 16, minute: 0 }, 120, (life, c) => {
  peak = Math.max(peak, life.agents.length);
  if (inWindow(c, 16, 18)) sundayPm.push(life.summary.walkers);
});
assert.equal(pm.pathFailures, 0, 'domingo por la tarde: rutas no encontradas');

// Martes (día 2) de 9:30 a 14:00: sin Rastro, nadie de sus viajes.
const tuesday: number[] = [];
const tue = simulate(7, { day: 2, hour: 9, minute: 30 }, 270, (life, c) => {
  peak = Math.max(peak, life.agents.length);
  assert.ok(!life.agents.some(isRastro), `el martes a las ${c.hour}:${c.minute} hay gente mirando puestos del Rastro`);
  if (inWindow(c, 10, 14)) tuesday.push(life.summary.walkers);
});
assert.equal(tue.pathFailures, 0, 'martes: rutas no encontradas');
forceWeather(null);

assert.ok(mean(sundayAm) > mean(sundayPm), `domingo 10–14 ${mean(sundayAm).toFixed(1)} no supera domingo 16–18 ${mean(sundayPm).toFixed(1)}`);
assert.ok(mean(sundayAm) > mean(tuesday), `domingo 10–14 ${mean(sundayAm).toFixed(1)} no supera martes ${mean(tuesday).toFixed(1)}`);
assert.ok(peak <= LOW, `pico de ${peak} agentes, por encima del presupuesto bajo (${LOW})`);

console.log(
  `check-rastro-life: ok · paseantes domingo 10–14 ${mean(sundayAm).toFixed(1)} / domingo 16–18 ${mean(sundayPm).toFixed(1)} / ` +
    `martes 10–14 ${mean(tuesday).toFixed(1)} · ${browsed} paradas en puestos · pico ${peak}/${LOW}`,
);
