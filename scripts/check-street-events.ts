// Eventos de calle (data/streetEvents.ts, systems/StreetEvents.ts): escondidos,
// alcanzables, que no cierran el paso, que no pasan de día ni con chaparrón,
// que cambian de una noche a otra y que se recogen solos. Recorre 140 noches.
// `node scripts/check-street-events.ts`.
import assert from 'node:assert/strict';
import { STREET_EVENTS } from '../src/data/streetEvents.ts';
import { getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { districtAt } from '../src/systems/Districts.ts';
import { DISPERSE, StreetEvent, fighterPoses, phaseAt, planNight, type Night } from '../src/systems/StreetEvents.ts';
import { weatherAt } from '../src/systems/Weather.ts';
import { weekIndex } from '../src/systems/MetroDaily.ts';
import type { TilePoint } from '../src/types/game.ts';

const DAYS = 140;
const key = (p: TilePoint): string => `${Math.round(p.tx)},${Math.round(p.ty)}`;

for (const def of STREET_EVENTS) {
  const loc = getLocation(def.location);
  const ev = new StreetEvent(def, loc);
  const ring = new Set(ev.ring.map(key));
  const slots = [...def.fighters, ...def.spectators, ...def.watchers, ...(def.lookout ? [def.lookout] : [])];

  // --- el sitio
  for (const s of slots) assert.ok(isWalkable(loc, s.tx, s.ty), `${def.id}: sitio ${key(s)} no se pisa`);
  for (const r of ev.ring) assert.ok(isWalkable(loc, r.tx, r.ty), `${def.id}: el corro ${key(r)} no se pisa`);
  assert.equal(new Set(slots.map(key)).size, slots.length, `${def.id}: dos sitios en el mismo tile`);
  for (const s of def.spectators) assert.ok(!ring.has(key(s)), `${def.id}: un mirón dentro del corro (${key(s)})`);

  // Escondido: ningún tramo del grafo de peatones pasa por el sitio, y nada de bancos, fuentes ni pistas cerca.
  const inArea = (x: number, y: number): boolean => x >= def.area.tx - 1 && x < def.area.tx + def.area.w + 1 && y >= def.area.ty - 1 && y < def.area.ty + def.area.h + 1;
  const pts = new Map(Object.entries(loc.points ?? {}));
  for (const [a, b] of loc.links ?? []) {
    const pa = pts.get(a);
    const pb = pts.get(b);
    if (!pa || !pb) continue;
    for (let i = 0; i <= 20; i++) assert.ok(!inArea(Math.round(pa.tx + ((pb.tx - pa.tx) * i) / 20), Math.round(pa.ty + ((pb.ty - pa.ty) * i) / 20)), `${def.id}: el tramo ${a}–${b} cruza el sitio`);
  }
  for (const p of loc.props) {
    if (!['bench', 'plaza-bench', 'fountain', 'hoop', 'kiosk', 'cafe-table'].includes(p.kind)) continue;
    assert.ok(Math.hypot(p.tx - ev.center.tx, p.ty - ev.center.ty) > 10, `${def.id}: ${p.kind} a la vista del corro (${p.tx},${p.ty})`);
  }
  assert.ok(!['park', 'transit'].includes(districtAt(loc, Math.round(ev.center.tx), ev.center.ty) ?? ''), `${def.id}: en un parque o una boca de metro`);

  // Siempre hay salida: con el corro y todos los sitios ocupados, desde donde se mira se llega a cada borde.
  for (const id of def.entries) {
    const edge = loc.points![id];
    const p = ev.path(def.vantage, edge);
    assert.ok(p.length > 2 && key(p[p.length - 1]) === key(edge), `${def.id}: sin salida hacia ${id}`);
  }
  // Nadie cruza por donde pelean: los caminos de llegada no pisan el corro (salvo el sitio de quien pelea).
  for (const id of def.entries) {
    for (const s of slots) {
      const p = ev.path(loc.points![id], s);
      assert.equal(key(p[p.length - 1]), key(s), `${def.id}: ${id} no llega a ${key(s)}`);
      for (const q of p.slice(0, -1)) assert.ok(!ring.has(key(q)), `${def.id}: el camino a ${key(s)} cruza el corro por ${key(q)}`);
    }
  }

  // --- las noches
  const nights: Night[] = [];
  for (let d = 1; d <= DAYS; d++) nights.push(planNight(def, loc, d));
  const happened = nights.filter((n) => n.happens);
  const share = happened.length / DAYS;
  assert.ok(share > 0.08 && share < 0.45, `${def.id}: hay pelea ${Math.round(share * 100)} % de las noches`);
  for (const n of happened) assert.ok(def.days.includes(weekIndex(n.day)), `${def.id}: pelea un día que no toca (${n.day})`);
  for (const n of nights) {
    const w = weatherAt(Math.floor(n.fightAt / 1440), (n.fightAt % 1440) / 60);
    if (!def.covered && w.rain >= def.weather.cancelRain) assert.equal(n.happens, false, `${def.id}: pelea con chaparrón el día ${n.day}`);
  }
  assert.ok(new Set(happened.map((n) => Math.round(n.start % 1440))).size >= Math.min(5, happened.length), `${def.id}: empieza siempre a la misma hora`);
  assert.ok(happened.some((n) => n.raidAt !== null), `${def.id}: el vigía no avisa nunca en ${DAYS} noches`);
  assert.ok(happened.some((n) => n.raidAt === null), `${def.id}: el vigía avisa todas las noches`);

  // Tiempo: con lluvia floja o frío, menos corro; con calor, más.
  const crowdOf = (n: Night): number => n.members.filter((m) => m.role === 'spectator').length;
  const wOf = (n: Night): ReturnType<typeof weatherAt> => weatherAt(Math.floor(n.fightAt / 1440), (n.fightAt % 1440) / 60);
  const avg = (ns: Night[]): number => ns.reduce((s, n) => s + crowdOf(n), 0) / Math.max(1, ns.length);
  const mild = happened.filter((n) => wOf(n).rain <= 0.08 && wOf(n).celsius >= def.weather.coldBelow && wOf(n).celsius <= def.weather.warmAbove);
  const wetOrCold = happened.filter((n) => wOf(n).rain > 0.08 || wOf(n).celsius < def.weather.coldBelow);
  const warm = happened.filter((n) => wOf(n).rain <= 0.08 && wOf(n).celsius > def.weather.warmAbove);
  if (mild.length && wetOrCold.length) assert.ok(avg(wetOrCold) < avg(mild), `${def.id}: con lluvia o frío no baja el corro`);
  if (mild.length && warm.length) assert.ok(avg(warm) > avg(mild), `${def.id}: las noches de calor no traen más gente`);

  // De día, nada ni nadie.
  for (let d = 2; d <= DAYS; d++) {
    const noon = d * 1440 + 12 * 60;
    assert.equal(ev.phase(noon), 'none', `${def.id}: pelea a mediodía (día ${d})`);
    assert.equal(ev.presentAt(noon).length, 0, `${def.id}: gente en el patio a mediodía (día ${d})`);
  }

  // Cada noche con pelea, cada medio minuto: nadie en una pared ni parado en el corro salvo quien pelea,
  // golpes que llegan, y al final se recoge todo.
  let hits = 0;
  let maxPeople = 0;
  for (const n of happened.slice(0, 25)) {
    const tail = (n.raidAt ?? n.end) + DISPERSE + 180;
    for (let t = n.start - 200; t < tail; t += 0.5) {
      const here = ev.presentAt(t);
      maxPeople = Math.max(maxPeople, here.length);
      for (const p of here) {
        assert.ok(isWalkable(loc, Math.round(p.x), Math.round(p.y)), `${def.id}: alguien en un sitio sólido (${p.x.toFixed(1)},${p.y.toFixed(1)}) día ${n.day}`);
        if (p.member.role !== 'fighter' && !p.moving) assert.ok(!ring.has(key({ tx: p.x, ty: p.y })), `${def.id}: un mirón dentro del corro`);
      }
      if (phaseAt(n, t) === 'fight') hits += fighterPoses(n, t).filter((f) => f.hit).length;
    }
    assert.equal(ev.presentAt(tail + 1).length, 0, `${def.id}: queda gente cuando ya ha acabado (día ${n.day})`);
  }
  assert.ok(hits > 0, `${def.id}: nadie da un golpe`);

  console.log(`check-street-events: ${def.id} · pelea ${Math.round(share * 100)} % de ${DAYS} noches, ${happened.filter((n) => n.raidAt !== null).length} con aviso del vigía, ${nights.filter((n) => n.why === 'rain').length} suspendidas por lluvia; corro medio ${avg(mild).toFixed(1)} templado / ${avg(wetOrCold).toFixed(1)} lluvia o frío / ${avg(warm).toFixed(1)} calor; hasta ${maxPeople} personas`);
}
