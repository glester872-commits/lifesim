// Variedad y contexto de la gente anónima (systems/StreetLife, systems/Crowd, systems/People): sin clones cerca (ni la
// misma cara ni el mismo jersey y pantalón), cada cual a su paso, y una composición que cambia con la hora, el día y el
// tiempo. La misma lógica que el juego, sin Phaser. `node scripts/check-crowd-variety.ts`.
import assert from 'node:assert/strict';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { Crowd, profileFor, type Agent, type Clock } from '../src/systems/Crowd.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { outfitOf } from '../src/systems/People.ts';
import { placeInfo } from '../src/systems/Places.ts';
import { StreetLife, streetProfileFor } from '../src/systems/StreetLife.ts';
import { forceWeather, outdoorAppeal, weatherAt } from '../src/systems/Weather.ts';

const player = { tx: 40, ty: 30 };

/** La calle a esa hora (día 1 = lunes) durante `minutes`, con el tiempo dado: lo que se ve y los pares cercanos. */
function street(day: number, hour: number, weather: Parameters<typeof forceWeather>[0], minutes: number, seed: number): {
  roles: Map<string, number>; people: number; staying: number; close: number; sameFace: number; sameOutfit: number; speeds: number[]; groups: number;
} {
  forceWeather(weather);
  const s = new StreetLife(getLocation('district'), streetProfileFor('district')!, seededRng(seed));
  const start: Clock = { day, hour: Math.floor(hour), minute: Math.round((hour % 1) * 60) };
  s.populate(start, player);
  const out = { roles: new Map<string, number>(), people: 0, staying: 0, close: 0, sameFace: 0, sameOutfit: 0, speeds: [] as number[], groups: 0 };
  for (let m = 0; m < minutes; m++) {
    const total = start.minute + m;
    const c: Clock = { day, hour: start.hour + Math.floor(total / 60), minute: total % 60 };
    for (let k = 0; k < 30; k++) s.update(33, c, player);
    const v = s.agents.filter((a) => a.kind === 'visitor');
    for (let i = 0; i < v.length; i++) {
      for (let j = i + 1; j < v.length; j++) {
        if (Math.hypot(v[i].x - v[j].x, v[i].y - v[j].y) >= 8) continue;
        out.close++;
        if (v[i].look === v[j].look) out.sameFace++;
        else if (outfitOf(v[i].look) === outfitOf(v[j].look)) out.sameOutfit++;
      }
    }
    if (m === minutes - 1) {
      for (const a of v.filter((x) => !x.leader)) {
        out.roles.set(a.role || '-', (out.roles.get(a.role || '-') ?? 0) + 1);
        out.people++;
        if (a.staying) out.staying++;
        if (s.agents.some((b) => b.leader === a)) out.groups++;
      }
      out.speeds = v.map((a) => Math.round(a.speed * 100) / 100);
    }
  }
  forceWeather(null);
  return out;
}

// --------------------------------------------------- 1. sin clones en la calle
{
  const r = street(3, 17, null, 120, 3);
  assert.equal(r.sameFace, 0, 'la misma cara dos veces a la vez, cerca');
  // Antes de este paso, el 3,4 % de los pares cercanos llevaba el mismo jersey y pantalón.
  const share = r.sameOutfit / r.close;
  assert.ok(share < 0.01, `ropa repetida entre vecinos: ${(share * 100).toFixed(2)} %`);
  // Cada cual a su paso y, con tanta gente, no hay dos pasos casi iguales por todas partes.
  const distinct = new Set(r.speeds).size;
  assert.ok(distinct >= r.speeds.length * 0.5, `pasos casi idénticos: ${distinct} distintos de ${r.speeds.length}`);
  assert.ok(Math.max(...r.speeds) - Math.min(...r.speeds) > 1, 'todos al mismo ritmo');
  console.log(`  calle 17:00: ${r.close} pares cercanos, ${r.sameFace} con la misma cara, ${r.sameOutfit} con la misma ropa (${(share * 100).toFixed(2)} %), ${distinct}/${r.speeds.length} pasos distintos`);
}

// --------------------------------------------------- 2. sin clones dentro de un local
{
  const place = placeInfo('cafe')!;
  const loc = getLocation(place.interior!);
  let close = 0, same = 0, faces = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const crowd = new Crowd(loc, place, profileFor('cafe')!, seededRng(seed));
    const clock: Clock = { day: 3, hour: 13, minute: 0 };
    crowd.populate(clock, { tx: 1, ty: 2 });
    for (let m = 0; m < 20; m++) for (let k = 0; k < 30; k++) crowd.update(33, { ...clock, minute: m }, { tx: 1, ty: 2 });
    const v = crowd.agents.filter((a: Agent) => a.kind === 'visitor');
    for (let i = 0; i < v.length; i++) {
      for (let j = i + 1; j < v.length; j++) {
        close++;
        if (v[i].look === v[j].look) faces++;
        else if (outfitOf(v[i].look) === outfitOf(v[j].look)) same++;
      }
    }
  }
  assert.equal(faces, 0, 'la misma cara dos veces en el local');
  assert.ok(same / close < 0.02, `ropa repetida en el local: ${((same / close) * 100).toFixed(2)} %`);
  console.log(`  café 13:00: ${close} pares, ${faces} con la misma cara, ${same} con la misma ropa`);
}

// --------------------------------------------------- 3. la composición cambia con el contexto
{
  const rush = street(3, 8.5, null, 30, 5);
  const late = street(7, 3, null, 30, 5);
  const afternoon = street(7, 16.5, null, 30, 5);
  const share = (r: ReturnType<typeof street>, ...roles: string[]): number => roles.reduce((s, k) => s + (r.roles.get(k) ?? 0), 0) / Math.max(1, r.people);
  const work = ['commuter', 'metro-arrival', 'office'];
  const club = ['club-queue', 'club-smoke', 'club-leaving'];
  const shops = ['carmen-browse', 'carmen-friends', 'window-shopper', 'carmen-hang'];
  // La hora punta es de gente yendo al metro y al trabajo; la madrugada, de la discoteca; la tarde, de tiendas.
  assert.ok(share(rush, ...work) > share(late, ...work), 'a las 08:30 no hay más gente de camino al trabajo que a las 03:00');
  assert.ok(share(late, ...club) > 0.3, 'a las 03:00 del sábado no hay gente de la discoteca');
  assert.equal(share(rush, ...club), 0, 'discoteca a las 08:30');
  assert.ok(share(afternoon, ...shops) > share(late, ...shops), 'la calle de tiendas no se llena por la tarde');
  assert.ok(late.people < afternoon.people, 'la madrugada no está más vacía que la tarde');
  console.log(`  contexto: 08:30 ${rush.people} personas (${Math.round(share(rush, ...work) * 100)} % al trabajo) · 03:00 ${late.people} (${Math.round(share(late, ...club) * 100)} % de discoteca) · tarde ${afternoon.people} (${Math.round(share(afternoon, ...shops) * 100)} % de compras)`);
}

// --------------------------------------------------- 4. el tiempo
{
  const mild = street(4, 13, { rain: 0, cloud: 0.1, wet: 0, celsius: 22 }, 30, 8);
  const scorch = street(4, 13, { rain: 0, cloud: 0, wet: 0, celsius: 37 }, 30, 8);
  const dry = street(7, 21, { rain: 0, cloud: 0.1, wet: 0, celsius: 15 }, 30, 9);
  const wet = street(7, 21, { rain: 0.9, cloud: 1, wet: 1, celsius: 12 }, 30, 9);
  assert.ok(scorch.people < mild.people, `con 37 °C hay tanta gente fuera como con 22 (${scorch.people} y ${mild.people})`);
  assert.ok(wet.people < dry.people || wet.staying < dry.staying, `con lluvia hay tanta gente parada fuera como sin ella (${wet.people}/${wet.staying} y ${dry.people}/${dry.staying})`);
  const base = weatherAt(1, 12);
  const appeal = (c: number, r = 0): number => outdoorAppeal({ ...base, celsius: c, rain: r, temp: c < 11 ? 'cold' : c > 22 ? 'warm' : 'mild' });
  assert.ok(appeal(37) < appeal(28) && appeal(-1) < appeal(5) && appeal(15, 0.9) < appeal(15), 'las ganas de estar fuera no siguen al tiempo');
  console.log(`  tiempo: 13:00 con 22 °C ${mild.people} personas, con 37 °C ${scorch.people}; sábado 21:00 seco ${dry.people} (${dry.staying} paradas), con lluvia ${wet.people} (${wet.staying})`);
}

console.log('check-crowd-variety: sin clones cerca (cara y ropa), cada cual a su paso, y la gente cambia con la hora, el día, la zona y el tiempo, OK');
