// Trapicheo en callejones (data/alleyDeals.ts, systems/AlleyDeals.ts) con la misma lógica que el juego: `npm run check`.
// Falla si pasa a menudo, de día, fuera de sitios escondidos, encima del paso de la gente o de la calzada, si choca
// con la pelea del patio, si el papel de alguien sale de quién es, si no se corta con el jugador o con alguien de
// uniforme, o si al acabar queda alguien o se repite sin enfriamiento.
import assert from 'node:assert/strict';
import { ALLEY_SPOTS } from '../src/data/alleyDeals.ts';
import { STREET_EVENTS } from '../src/data/streetEvents.ts';
import { getLocation, isWalkable, ROADWAY } from '../src/systems/LocationSystem.ts';
import { AlleyDeal, alleyPath, AWARE_TILES, COOLDOWN, LINGER_MIN, tailOf, type Episode } from '../src/systems/AlleyDeals.ts';
import { districtAt } from '../src/systems/Districts.ts';
import { phaseAt, planNight } from '../src/systems/StreetEvents.ts';
import { IDENTITIES } from '../src/systems/People.ts';

const loc = getLocation('district');
const DAYS = 140;
const tile = (x: number, y: number): string => loc.ground[y]?.[x] ?? '';

// ------------------------------------------------ sólo sitios escondidos, fuera de la calzada y del paso
const linkTiles = new Set<string>();
for (const [a, b] of loc.links ?? []) {
  const A = loc.points![a];
  const B = loc.points![b];
  const n = Math.max(1, Math.ceil(Math.hypot(B.tx - A.tx, B.ty - A.ty) * 4));
  for (let i = 0; i <= n; i++) linkTiles.add(`${Math.floor(A.tx + 0.5 + ((B.tx - A.tx) * i) / n)},${Math.floor(A.ty + 0.5 + ((B.ty - A.ty) * i) / n)}`);
}
for (const s of ALLEY_SPOTS) {
  for (let y = s.area.ty; y < s.area.ty + s.area.h; y++) {
    for (let x = s.area.tx; x < s.area.tx + s.area.w; x++) {
      assert.ok(!ROADWAY.has(tile(x, y)) && tile(x, y) !== 'R', `${s.id}: el sitio pisa calzada o vía en (${x}, ${y})`);
      assert.ok(districtAt(loc, x, y) !== 'park', `${s.id}: el sitio está en el parque`);
    }
  }
  const slots = [s.seller, s.meet, s.lookout, ...(s.associate ? [s.associate] : [])];
  for (const p of slots) {
    assert.ok(isWalkable(loc, p.tx, p.ty) && !ROADWAY.has(tile(p.tx, p.ty)), `${s.id}: un sitio en (${p.tx}, ${p.ty}) no es suelo libre fuera de la calzada`);
    assert.ok(!linkTiles.has(`${p.tx},${p.ty}`), `${s.id}: alguien se planta encima del paso de la gente en (${p.tx}, ${p.ty})`);
    assert.ok(p.tx >= s.area.tx && p.tx < s.area.tx + s.area.w && p.ty >= s.area.ty && p.ty < s.area.ty + s.area.h, `${s.id}: un sitio fuera del área`);
    for (const e of s.entries) {
      const path = alleyPath(loc, e, p);
      assert.ok(path, `${s.id}: no se llega de (${e.tx}, ${e.ty}) a (${p.tx}, ${p.ty})`);
      assert.ok(path.every((q) => !ROADWAY.has(tile(q.tx, q.ty))), `${s.id}: el camino cruza la calzada`);
    }
  }
  assert.equal(new Set(slots.map((p) => `${p.tx},${p.ty}`)).size, slots.length, `${s.id}: dos papeles en el mismo tile`);
  for (const k of Object.keys(s)) assert.ok(!['gender', 'race', 'nationality', 'skin', 'look', 'age'].includes(k), `${s.id}: «${k}» en la ficha`);
}
// Dos sitios nunca comparten tile.
const all = ALLEY_SPOTS.flatMap((s) => [s.seller, s.meet, s.lookout, ...(s.associate ? [s.associate] : [])].map((p) => `${p.tx},${p.ty}`));
assert.equal(new Set(all).size, all.length, 'dos sitios en el mismo tile');

// ------------------------------------------------ poco, y casi siempre de noche
const episodes: Episode[] = [];
for (const s of ALLEY_SPOTS) {
  const deal = new AlleyDeal(s, loc);
  deal.devReset();
  for (let day = 1; day <= DAYS; day++) {
    const plan = deal.plan(day);
    for (let i = 1; i < plan.episodes.length; i++) assert.ok(plan.episodes[i].start >= tailOf(plan.episodes[i - 1]), `${s.id}: dos ratos a la vez el día ${day}`);
    episodes.push(...plan.episodes);
  }
}
const perWeek = (episodes.length / ALLEY_SPOTS.length / DAYS) * 7;
assert.ok(perWeek > 0.3 && perWeek < 2, `frecuencia rara: ${perWeek.toFixed(2)} ratos por sitio y semana`);
const hourOf = (e: Episode): number => (e.start % 1440) / 60;
assert.ok(episodes.every((e) => hourOf(e) < 4 || hourOf(e) >= 16), 'un rato por la mañana o a mediodía');
const night = episodes.filter((e) => hourOf(e) >= 20 || hourOf(e) < 4).length;
assert.ok(night / episodes.length >= 0.85, `sólo ${night}/${episodes.length} de noche`);
// La pelea del patio y el trapicheo del callejón nunca a la vez.
const fight = STREET_EVENTS.find((e) => e.id === 'patio-mayor')!;
for (const e of episodes.filter((x) => x.spot.yieldsTo === fight.id)) {
  for (const d of [e.day - 1, e.day]) {
    const n = planNight(fight, loc, d);
    for (let t = e.start; t < e.end; t += 5) assert.equal(phaseAt(n, t), 'none', `${e.spot.id}: coincide con la pelea el día ${e.day}`);
  }
}

// ------------------------------------------------ los papeles no salen de quién es
const gender = (look: number): string => IDENTITIES[look % IDENTITIES.length].gender;
const pool = IDENTITIES.filter((i) => i.gender === 'woman').length / IDENTITIES.length;
for (const role of ['seller', 'lookout', 'buyer'] as const) {
  const looks = episodes.flatMap((e) => e.members.filter((m) => m.role === role).map((m) => m.look));
  const share = looks.filter((l) => gender(l) === 'woman').length / looks.length;
  assert.ok(Math.abs(share - pool) < 0.2, `${role}: ${(share * 100).toFixed(0)} % mujeres frente a ${(pool * 100).toFixed(0)} % de la gente`);
  assert.ok(new Set(looks).size >= Math.min(looks.length, IDENTITIES.length) * 0.4, `${role}: siempre las mismas caras`);
}

// ------------------------------------------------ el jugador que se queda mirando, y alguien de uniforme
const spot = ALLEY_SPOTS[0];
const ep = episodes.find((e) => e.spot === spot && e.members.filter((m) => m.role === 'buyer').length >= 3)!;
assert.ok(ep, 'ningún rato con tres o más que vienen');
{
  const deal = new AlleyDeal(spot, loc);
  deal.devReset();
  // Desde la Mayor, lejos de todos ellos: se ve, pero no pasa nada.
  for (let t = ep.start; t < ep.start + 20; t += 0.1) deal.observe(t, { tx: 80, ty: 17 });
  assert.equal(deal.interruption(ep.start + 20), undefined, 'se cortó con el jugador lejos');
  // Muy cerca, más de lo que aguantan: se dan cuenta, le miran y se van.
  let t = ep.start + 20;
  for (; t < ep.start + 20 + LINGER_MIN + 2 && !deal.interruption(t); t += 0.1) deal.observe(t, { tx: spot.seller.tx, ty: spot.seller.ty + 1 });
  const cut = deal.interruption(t);
  assert.equal(cut?.why, 'player', 'el jugador se queda encima y no se dan cuenta');
  // Al poco no queda nadie y el sitio se queda en enfriamiento.
  assert.equal(deal.presentAt(cut!.at + 45).length, 0, 'quedan participantes después de irse');
  assert.equal(deal.cooldownUntil(), cut!.at + COOLDOWN, 'sin enfriamiento tras cortarse');
  assert.equal(deal.phase(tailOf(deal.episodeAt(cut!.at)!) + 1), 'none', 'el rato no termina');
}
{
  const deal = new AlleyDeal(spot, loc);
  deal.devReset();
  const t = ep.start + 10;
  deal.observe(t - 0.5, { tx: 0, ty: 0 });
  deal.observe(t, { tx: 0, ty: 0 }, [{ tx: spot.seller.tx, ty: spot.seller.ty + AWARE_TILES - 1 }]);
  assert.equal(deal.interruption(t)?.why, 'authority', 'alguien de uniforme cerca y siguen');
  assert.equal(deal.presentAt(t + 45).length, 0, 'tras irse por alguien de uniforme queda gente');
}
// Volver de otra escena (o de dormir) justo al lado no cuenta como haberse quedado mirando: un salto de reloj no es rato.
{
  const deal = new AlleyDeal(spot, loc);
  deal.devReset();
  deal.observe(ep.start - 600, { tx: 0, ty: 0 });
  deal.observe(ep.start + 15, { tx: spot.seller.tx, ty: spot.seller.ty + 1 });
  assert.equal(deal.interruption(ep.start + 15), undefined, "al entrar al lado, se cortó en el primer fotograma");
  deal.devReset();
}
// Cada rato natural termina: pasado su final no queda nadie.
for (const e of episodes.slice(0, 40)) {
  const deal = new AlleyDeal(e.spot, loc);
  deal.devReset();
  assert.equal(deal.presentAt(tailOf(e) + 1).length, 0, `${e.spot.id}: queda gente al acabar`);
}
// En enfriamiento no empieza otro: cortado uno a mano justo antes, el del calendario no sale.
{
  const deal = new AlleyDeal(spot, loc);
  deal.devReset();
  const forced = deal.devForce(ep.start - 120);
  deal.interrupt(forced.start + 5, 'dev');
  assert.ok(ep.start - 15 < deal.cooldownUntil());
  assert.equal(deal.presentAt(ep.start + 5).length, 0, 'empieza otro en pleno enfriamiento');
  deal.devReset();
}
console.log(`check-alley-deals: ${ALLEY_SPOTS.length} sitios, ${episodes.length} ratos en ${DAYS} días (${perWeek.toFixed(2)} por sitio y semana), ${Math.round((night / episodes.length) * 100)} % de noche`);
