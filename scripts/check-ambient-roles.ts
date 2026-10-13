// La capa de roles de trabajo y ambiente de la calle (data/streets.ts: street-cleaner, maintenance, courier, work-break,
// ride-wait) con el mismo StreetLife del juego: un día entero en Vallesco y en la Ribera. Falla si un rol sale fuera de
// su horario, sin uniforme, en una zona que no le toca o si la calle pasa de su tope.
import assert from 'node:assert/strict';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { AMBIENT_CAP, StreetLife, streetProfileFor } from '../src/systems/StreetLife.ts';
import { STREET_PROFILES } from '../src/data/streets.ts';
import type { Clock } from '../src/systems/Crowd.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { zoneAt } from '../src/systems/Zones.ts';
import { weekIndex } from '../src/systems/Calendar.ts';
import type { TilePoint } from '../src/types/game.ts';

const STEP_MS = 100;
const MS_PER_MIN = 500;
const ROLES = ['street-cleaner', 'maintenance', 'courier', 'work-break', 'ride-wait'];
const ROADWAY = new Set(['.', '=', ':']);
const PLAYER: TilePoint = { tx: 72, ty: 53 };

const inWindow = (h: number, [a, b]: readonly [number, number]): boolean => (a <= b ? h >= a && h < b : h >= a || h < b);

function day(location: string, weekday: number, seed: number) {
  const loc = getLocation(location);
  const profile = streetProfileFor(location)!;
  const street = new StreetLife(loc, profile, seededRng(seed));
  let clock: Clock = { day: weekday, hour: 5, minute: 0 };
  street.populate(clock, location === 'district' ? PLAYER : { tx: 2, ty: 2 });
  const seen = new Map<number, { role: string; hour: number; zone: string }>();
  const byHour = new Map<string, number[]>();
  let peak = 0;
  let ambientPeak = 0;
  const sweeping = new Set<number>();
  const pushing = new Set<number>();
  for (let min = 0; min < 24 * 60; min++) {
    for (let ms = 0; ms < MS_PER_MIN; ms += STEP_MS) street.update(STEP_MS, clock, PLAYER);
    peak = Math.max(peak, street.agents.length);
    ambientPeak = Math.max(ambientPeak, street.agents.filter((a) => a.rule?.ambient).length);
    for (const a of street.agents) {
      if (!ROLES.includes(a.role)) continue;
      if (a.role === 'street-cleaner') {
        assert.ok(a.belongings?.includes('trolley') && a.belongings.includes('broom'), 'limpieza sin carrito ni escoba');
        pushing.add(a.id);
        if (a.state === 'SWEEP' && !a.moving) {
          sweeping.add(a.id);
          assert.ok(!ROADWAY.has(loc.ground[Math.round(a.y)][Math.round(a.x)]), `barriendo en la calzada en ${Math.round(a.x)},${Math.round(a.y)}`);
        }
      }
      const h = clock.hour + clock.minute / 60;
      if (!seen.has(a.id)) {
        seen.set(a.id, { role: a.role, hour: h, zone: zoneAt(location, Math.round(a.x), Math.round(a.y))?.id ?? '-' });
        const row = byHour.get(a.role) ?? Array(24).fill(0);
        row[clock.hour]++;
        byHour.set(a.role, row);
        const rule = a.rule!;
        assert.ok(a.uniform || a.role === 'work-break' || a.role === 'ride-wait', `${a.role} sin uniforme`);
        if (rule.uniform) assert.equal(a.uniform, rule.uniform, `${a.role}: uniforme perdido`);
      }
    }
    clock = { day: clock.hour === 23 && clock.minute === 59 ? clock.day + 1 : clock.day, hour: clock.minute === 59 ? (clock.hour + 1) % 24 : clock.hour, minute: (clock.minute + 1) % 60 };
  }
  assert.equal(street.pathFailures, 0, `${location}: rutas imposibles`);
  return { sweeping: sweeping.size, pushing: pushing.size, seen, byHour, peak, ambientPeak, cap: profile.maxWalkers };
}

for (const [location, weekday] of [['district', 2], ['district', 6], ['ribera', 2], ['ribera', 6]] as const) {
  const rules = STREET_PROFILES.find((p) => p.location === location)!.trips.filter((r) => ROLES.includes(r.role));
  // Tres días con semillas distintas: son sucesos ocasionales, no cada día los mismos.
  const runs = [1, 2, 3].map((n) => day(location, weekday, 11 * n + weekday));
  let uid = 0;
  const seen = new Map<number, { role: string; hour: number; zone: string }>(runs.flatMap((r) => [...r.seen.values()]).map((v) => [uid++, v]));
  const byHour = new Map<string, number[]>();
  for (const r of runs) for (const [role, row] of r.byHour) byHour.set(role, row.map((n, i) => n + (byHour.get(role)?.[i] ?? 0)));
  const peak = Math.max(...runs.map((r) => r.peak));
  const cap = runs[0].cap;
  const sweepers = runs.reduce((n, r) => n + r.sweeping, 0);
  console.log('   limpieza: con carrito', runs.reduce((n, r) => n + r.pushing, 0), 'paradas a barrer', sweepers);
  if (weekday === 2) assert.ok(sweepers > 0, `${location}: nadie paró a barrer en todo el día`);
  const ambientPeak = Math.max(...runs.map((r) => r.ambientPeak));
  assert.ok(ambientPeak <= AMBIENT_CAP, `${location}: ${ambientPeak} roles ambiente a la vez con cupo ${AMBIENT_CAP}`);
  assert.ok(peak <= cap + 4, `${location}: ${peak} personas a la vez con tope ${cap}`);
  const total = (role: string): number => [...seen.values()].filter((s) => s.role === role).length;
  const label = `${location} ${weekday === 2 ? 'martes' : 'sábado'}`;
  console.log(label, 'pico', peak, '/', cap, ROLES.map((r) => `${r}:${total(r)}`).join(' '));
  const zones = new Map<string, number>();
  for (const s of seen.values()) zones.set(`${s.role}@${s.zone}`, (zones.get(`${s.role}@${s.zone}`) ?? 0) + 1);
  console.log('   zonas', [...zones].sort().map(([k, n]) => `${k}:${n}`).join(' '), '| ambiente máx', ambientPeak);
  for (const [role, row] of byHour) console.log('  ', role.padEnd(14), row.map((n) => (n ? String(n) : '.')).join(''));
  // Nadie sale de su horario ni en un día que no es el suyo.
  for (const s of seen.values()) {
    const windows = rules.filter((r) => r.role === s.role && (!r.days || (r.days === 'weekday') === (weekIndex(weekday) < 5)));
    // Quien ya iba de camino al arrancar la simulación (las 5) no cuenta.
    if (s.hour > 5.1) assert.ok(windows.some((r) => inWindow(s.hour, r.hours ?? [0, 24])), `${label}: ${s.role} a las ${s.hour.toFixed(1)} fuera de horario`);
  }
  if (weekday === 2) {
    for (const role of ['street-cleaner', 'courier']) assert.ok(total(role) > 0, `${label}: ningún ${role} en todo el día`);
    for (const s of seen.values()) if (s.role === 'courier') assert.ok(s.zone !== 'parque-olmo', `${label}: repartidor en el parque`);
  } else {
    // Sábado: noche de salir (VTC) y nada de mantenimiento ni pausas de oficina.
    assert.ok(total('ride-wait') > 0, `${label}: nadie esperando un VTC`);
    assert.equal(total('maintenance') + total('work-break'), 0, `${label}: trabajo de diario en fin de semana`);
  }
}
console.log('roles de calle OK');
