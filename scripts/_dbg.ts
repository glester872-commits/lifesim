import { getLocation } from '../src/systems/LocationSystem.ts';
import { placeInfo } from '../src/systems/Places.ts';
import { Crowd, profileFor, type Clock } from '../src/systems/Crowd.ts';
import { hashSeed, seededRng } from '../src/systems/MetroDaily.ts';
const id = process.argv[2] ?? 'burger-norte';
const add = (c: Clock, m: number): Clock => { const t = c.hour * 60 + c.minute + m; return { day: c.day + Math.floor(t / 1440), hour: Math.floor((t % 1440) / 60), minute: t % 60 }; };
for (const day of [1, 6, 7]) for (const t of ['13:30', '15:30', '20:30', '23:30']) {
  const crowd = new Crowd(getLocation(id), placeInfo(id)!, profileFor(id)!, seededRng(hashSeed(id, day, t)));
  let clock: Clock = { day, hour: Number(t.slice(0, 2)), minute: Number(t.slice(3)) };
  crowd.populate(clock, { tx: 1, ty: 2 });
  let el = 0;
  for (let ms = 0; ms < 20 * 500; ms += 100) {
    crowd.update(100, clock, { tx: 1, ty: 2 });
    el += 100; if (el >= 500) { el -= 500; clock = add(clock, 1); }
    const still = crowd.agents.filter((a) => !a.moving && a.path.length === 0 && !a.leaving);
    const by = new Map<string, typeof still>();
    for (const a of still) { const k = `${Math.round(a.x)},${Math.round(a.y)}`; by.set(k, [...(by.get(k) ?? []), a]); }
    const dup = [...by].filter(([, v]) => v.length > 1);
    if (dup.length) { console.log(day, t, clock, dup.map(([k, v]) => `${k}: ${v.map((a) => `${a.role}/${a.state}/${(a as any).point ?? ''} (${a.x.toFixed(2)},${a.y.toFixed(2)})`).join(' | ')}`)); process.exit(0); }
  }
}
console.log('sin choques');
