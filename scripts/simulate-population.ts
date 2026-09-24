// Simula la gente de los locales con el mismo Crowd que usa el juego:
// `npm run simulate:population`. Falla si algo no se cumple.
import assert from 'node:assert/strict';
import { getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { placeInfo } from '../src/systems/Places.ts';
import { Crowd, levelAt, profileFor, targetAt, type Clock } from '../src/systems/Crowd.ts';
import { POPULATION } from '../src/config/population.ts';
import { hashSeed, seededRng, weekday } from '../src/systems/MetroDaily.ts';
import type { TilePoint } from '../src/types/game.ts';

const STEP_MS = 100;
const MS_PER_MIN = 500; // el reloj del juego: 2 minutos por segundo real

const at = (day: number, hhmm: string): Clock => ({ day, hour: Number(hhmm.slice(0, 2)), minute: Number(hhmm.slice(3)) });
const addMinutes = (c: Clock, m: number): Clock => {
  const total = c.hour * 60 + c.minute + m;
  return { day: c.day + Math.floor(total / 1440), hour: Math.floor((total % 1440) / 60), minute: total % 60 };
};
const hhmm = (c: Clock): string => `${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;

function setup(placeId: string, seed: number) {
  const place = placeInfo(placeId)!;
  const profile = profileFor(placeId)!;
  const loc = getLocation(place.interior!);
  // El jugador, lejos de la puerta: si la tapa, no entra nadie (lo prueba otro caso).
  const player: TilePoint = { tx: 1, ty: 2 };
  return { place, profile, loc, player, crowd: new Crowd(loc, place, profile, seededRng(seed)) };
}

/** Deja correr el local `minutes` minutos de juego comprobando cada paso. */
function run(placeId: string, start: Clock, minutes: number, seed = 1) {
  const { place, profile, loc, player, crowd } = setup(placeId, seed);
  crowd.populate(start, player);
  const initial = crowd.summary;
  let clock = start;
  let elapsed = 0;
  let maxDelta = 0;
  let last = crowd.agents.length;
  let entered = 0;
  let left = 0;
  const seen = new Set(crowd.agents.map((a) => a.id));
  for (let ms = 0; ms < minutes * MS_PER_MIN; ms += STEP_MS) {
    const before = new Set(crowd.agents.map((a) => a.id));
    crowd.update(STEP_MS, clock, player);
    elapsed += STEP_MS;
    if (elapsed >= MS_PER_MIN) {
      elapsed -= MS_PER_MIN;
      clock = addMinutes(clock, 1);
      // Nunca cambia de golpe: como mucho unas pocas personas por minuto de juego.
      maxDelta = Math.max(maxDelta, Math.abs(crowd.agents.length - last));
      last = crowd.agents.length;
    }
    for (const a of crowd.agents) {
      if (!seen.has(a.id)) { seen.add(a.id); entered++; }
      assert.ok(isWalkable(loc, Math.round(a.x), Math.round(a.y)), `${placeId}: ${a.role} dentro de algo en ${a.x},${a.y}`);
    }
    for (const id of before) if (!crowd.agents.some((a) => a.id === id)) left++;
    assert.ok(crowd.agents.length <= place.capacity, `${placeId}: aforo superado`);
    // Dos personas quietas nunca en el mismo tile: los puntos se reservan.
    const still = crowd.agents.filter((a) => !a.moving && a.path.length === 0 && !a.leaving).map((a) => `${Math.round(a.x)},${Math.round(a.y)}`);
    assert.equal(new Set(still).size, still.length, `${placeId}: dos personas en el mismo sitio a las ${hhmm(clock)}`);
  }
  assert.equal(crowd.pathFailures, 0, `${placeId}: rutas no encontradas`);
  const s = crowd.summary;
  const required = profile.staff.filter((r) => !r.minLevel).length;
  if (s.open) assert.ok(s.staff >= required, `${placeId}: falta personal a las ${hhmm(clock)}`);
  return { place, initial, final: s, clock, entered, left, maxDelta, states: crowd.agents.map((a) => a.state) };
}

// ------------------------------------------------------------ casos pedidos

const CASES: [string, string[]][] = [
  ['gym', ['07:00', '13:00', '19:00', '22:30']],
  ['cafe', ['07:30', '12:00', '17:00', '21:30']],
  ['clothing-store', ['10:30', '15:00', '19:00']],
  ['office', ['08:30', '14:00', '19:30', '22:00']],
  ['supermarket', ['10:00', '19:00']],
  ['restaurant', ['13:00', '21:30']],
];
const DAYS = [1, 6, 7]; // lunes, sábado, domingo

console.log('lugar            día        hora   nivel      objetivo  al entrar → 20 min después   personal  entran/salen');
for (const [placeId, times] of CASES) {
  for (const day of DAYS) {
    for (const t of times) {
      const r = run(placeId, at(day, t), 20, hashSeed(placeId, day, t));
      const lvl = r.initial.level ?? 'CERRADO';
      console.log(
        `${placeId.padEnd(16)} ${weekday(day).padEnd(10)} ${t}  ${lvl.padEnd(10)} ${String(r.initial.target).padStart(4)}      ${String(r.initial.visitors).padStart(3)} → ${String(r.final.visitors).padStart(3)}               ${String(r.final.staff).padStart(3)}      ${r.entered}/${r.left}`,
      );
      assert.ok(r.maxDelta <= POPULATION.maxChangesPerTick * 2, `${placeId} ${t}: cambió ${r.maxDelta} personas en un minuto`);
      if (!r.initial.open) assert.equal(r.initial.visitors, 0, `${placeId} cerrado con gente dentro`);
    }
  }
}

// ------------------------------------------------------------ semana y días

const target = (placeId: string, day: number, t: string): number => targetAt(placeInfo(placeId)!, profileFor(placeId)!, at(day, t));
const level = (placeId: string, day: number, t: string) => levelAt(placeInfo(placeId)!, profileFor(placeId)!, at(day, t));
assert.ok(target('office', 1, '11:00') > target('office', 6, '11:00'), 'la oficina debe vaciarse el fin de semana');
assert.ok(target('office', 7, '11:00') <= 2, 'la oficina el domingo, casi vacía');
assert.ok(LEVEL(level('gym', 1, '19:00')) > LEVEL(level('gym', 7, '19:00')), 'el gimnasio, más flojo el domingo');
assert.ok(LEVEL(level('clothing-store', 6, '18:00')) > LEVEL(level('clothing-store', 1, '18:00')), 'la tienda, más llena el sábado');
assert.ok(LEVEL(level('restaurant', 5, '21:00')) >= LEVEL(level('restaurant', 1, '21:00')), 'el restaurante, más lleno el viernes');
function LEVEL(l: string | null): number {
  return l === null ? -1 : ['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'].indexOf(l);
}

// El mismo HIGH no da la misma cifra cada día, pero siempre dentro de su rango.
const gymWeek = [1, 2, 3, 4, 5].map((d) => target('gym', d, '19:00'));
console.log(`\ngimnasio 19:00, lunes a viernes: ${gymWeek.join(', ')}`);
assert.ok(new Set(gymWeek).size > 1, 'el gimnasio a las 19:00 es idéntico todos los días');
for (const n of gymWeek) assert.ok(n >= POPULATION.levels.HIGH[0] && n <= profileFor('gym')!.maxVisitors, `fuera del rango HIGH: ${n}`);

// Entrar y salir en el mismo minuto enseña a la misma gente en los mismos sitios.
{
  const a = setup('gym', 7).crowd;
  const b = setup('gym', 99).crowd;
  a.populate(at(3, '18:50'), { tx: 10, ty: 11 });
  b.populate(at(3, '18:50'), { tx: 10, ty: 11 });
  const sign = (c: typeof a) => c.agents.map((g) => `${g.role}@${g.x},${g.y}#${g.look}`).join('|');
  assert.equal(sign(a), sign(b), 'dos entradas en el mismo minuto dan gente distinta');
  // Y nadie aparece encima del jugador.
  for (const g of a.agents) assert.ok(Math.hypot(g.x - 10, g.y - 11) >= POPULATION.spawnClearance, 'alguien apareció junto al jugador');
}

// Al cerrar se vacía: primero los visitantes, luego el personal.
{
  const r = run('gym', at(2, '22:40'), 80, 5);
  console.log(`gimnasio 22:40 → ${hhmm(r.clock)}: ${r.final.visitors} visitantes, ${r.final.staff} personal`);
  assert.equal(r.final.visitors + r.final.staff, 0, 'el gimnasio cerrado sigue con gente');
}

// La definición de terminado: 18:50 lleno, 22:20 casi vacío.
{
  const busy = run('gym', at(3, '18:50'), 10, 11);
  const late = run('gym', at(3, '22:20'), 1, 12);
  console.log(`gimnasio 18:50 → ${busy.initial.visitors} → ${busy.final.visitors} (entran ${busy.entered}, salen ${busy.left}); 22:20 → ${late.initial.visitors}`);
  assert.ok(busy.initial.visitors >= 8, 'a las 18:50 el gimnasio debería estar lleno');
  assert.ok(late.initial.visitors <= 4, 'a las 22:20 el gimnasio debería estar casi vacío');
}

// Si el jugador tapa la puerta, nadie entra atravesándolo.
{
  const { place, profile, loc, crowd } = setup('cafe', 3);
  const door = loc.portals.find((p) => p.to.location !== loc.id)!;
  crowd.populate(at(2, '06:59'), { tx: door.tx, ty: door.ty - 1 });
  for (let ms = 0; ms < 60_000; ms += STEP_MS) crowd.update(STEP_MS, at(2, '07:30'), { tx: door.tx, ty: door.ty - 1 });
  assert.ok(crowd.agents.every((a) => a.kind === 'staff' || a.state !== 'ENTER' || Math.hypot(a.x - door.tx, a.y - door.ty) > 0.5), 'alguien entró por encima del jugador');
  assert.ok(targetAt(place, profile, at(2, '07:30')) > 0);
}

console.log('\nOK: horarios, afluencia, aforo, personal, entradas y salidas, rutas y variación semanal.');
