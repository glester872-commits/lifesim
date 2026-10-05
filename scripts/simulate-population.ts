// Simula la gente de los locales con el mismo Crowd que usa el juego:
// `npm run simulate:population`. Falla si algo no se cumple.
import assert from 'node:assert/strict';
import { getLocation, isStandable } from '../src/systems/LocationSystem.ts';
import { placeInfo } from '../src/systems/Places.ts';
import { Crowd, levelAt, profileFor, targetAt, type Clock } from '../src/systems/Crowd.ts';
import { POPULATION } from '../src/config/population.ts';
import { POPULATION_PROFILES } from '../src/data/population.ts';
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
      assert.ok(isStandable(loc, Math.round(a.x), Math.round(a.y)), `${placeId}: ${a.role} dentro de algo en ${a.x},${a.y}`);
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
  ['hair-salon', ['10:30', '13:00', '18:30', '21:00']],
  ['wine-bar', ['17:30', '19:00', '22:30', '00:30']],
];
// Cualquier local con perfil de gente entra solo: media hora dentro de cada franja y una hora después del cierre.
// Así un local nuevo (la Calle del Carmen, la discoteca) no se queda sin simular por no estar en la lista.
const clockLabel = (h: number): string => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
for (const p of POPULATION_PROFILES) {
  if (CASES.some(([id]) => id === p.place)) continue;
  CASES.push([p.place, [...p.bands.map(([from]) => clockLabel(from + 0.5)), clockLabel((placeInfo(p.place)!.hours?.[1] ?? 0) + 1)]]);
}
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
  // Cierra a las 23:00; quien sigue con ropa de deporte vuelve antes al vestuario a cambiarse: se vacía algo más tarde.
  const r = run('gym', at(2, '22:40'), 100, 5);
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

// El gimnasio a lo largo del día: medio por la mañana, flojo a mediodía, lleno por la tarde, casi vacío al cierre.
assert.equal(level('gym', 2, '07:30'), 'MEDIUM', 'gimnasio 07:30');
assert.equal(level('gym', 2, '12:00'), 'LOW', 'gimnasio 12:00');
assert.equal(level('gym', 2, '19:00'), 'HIGH', 'gimnasio 19:00');
assert.equal(level('gym', 2, '22:00'), 'LOW', 'gimnasio 22:00');

// Puestos de uso (data/stations.ts) en hora punta: una máquina, una persona; quien la usa está
// encima; la ocupación (libre, reservada, en uso) dice la verdad; y antes de bajarse, se incorpora.
{
  const { loc, crowd } = setup('gym', 31);
  const player = { tx: 20, ty: 12 };
  let clock = at(2, '18:00');
  crowd.populate(clock, player);
  const stations = Object.entries(loc.points ?? {}).filter(([, p]) => p.use);
  const used = new Set<string>();
  const states = new Set<string>();
  let elapsed = 0;
  for (let ms = 0; ms < 120 * MS_PER_MIN; ms += STEP_MS) {
    crowd.update(STEP_MS, clock, player);
    if ((elapsed += STEP_MS) >= MS_PER_MIN) {
      elapsed -= MS_PER_MIN;
      clock = addMinutes(clock, 1);
    }
    const onPoint = new Map<string, number>();
    for (const a of crowd.agents) {
      states.add(a.state);
      if (!a.point || a.path.length > 0 || a.leaving) continue;
      onPoint.set(a.point, (onPoint.get(a.point) ?? 0) + 1);
      const p = loc.points![a.point];
      assert.ok(a.x === p.tx && a.y === p.ty, `gimnasio: ${a.role} tiene ${a.point} pero está en ${a.x},${a.y}`);
    }
    for (const [id, p] of stations) {
      const occupancy = crowd.occupancy(id);
      assert.ok((onPoint.get(id) ?? 0) <= 1, `gimnasio: dos personas en ${id}`);
      if (onPoint.has(id)) {
        assert.equal(occupancy, 'IN_USE', `gimnasio: ${id} con alguien encima y ${occupancy}`);
        used.add(p.use!);
      } else assert.notEqual(occupancy, 'IN_USE', `gimnasio: ${id} en uso sin nadie`);
    }
  }
  console.log(`\ngimnasio 18:00–20:00: puestos usados ${[...used].sort().join(', ')}\n  estados: ${[...states].sort().join(', ')}`);
  for (const s of ['treadmill', 'bike', 'bench-press', 'dumbbells', 'stretch']) assert.ok(used.has(s), `gimnasio: nadie usó ${s} en dos horas de hora punta`);
  assert.ok(states.has('FINISH'), 'gimnasio: nadie se incorporó antes de dejar una máquina');
  assert.equal(crowd.pathFailures, 0, 'gimnasio: rutas a las máquinas no encontradas');
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

// Restaurante (systems/TableService.ts): una mesa por grupo; cada mesa pasa por todo el servicio
// (sentarse, pedir, cocina, servir, comer, cuenta, pagar, recoger); los camareros andan, nunca aparecen;
// dos camareros nunca atienden la misma mesa; y el jugador pide, come y paga por el mismo camino.
{
  const { loc, crowd } = setup('restaurant', 21);
  const player = { tx: 1, ty: 2 };
  let clock = at(6, '19:30');
  crowd.populate(clock, player);
  const service = crowd.service!;
  assert.ok(service, 'el restaurante sin servicio de mesa');
  const mates = crowd.agents.filter((a) => a.leader);
  for (const m of mates) assert.equal(service.tableOf(m.point), service.tableOf(m.leader!.point), 'un grupo repartido en dos mesas');
  const waiters = crowd.agents.filter((a) => a.role === 'waiter');
  for (const w of waiters) assert.equal(w.uniform, 'uniforme-sala', 'un camarero sin uniforme');

  // El jugador se sienta a una mesa libre y contesta como lo haría en la escena.
  const mine = service.tables.find((t) => t.state === 'AVAILABLE')!;
  const calls: string[] = [];
  let charged = 0;
  service.onPlayer = (call) => {
    calls.push(call.kind);
    if (call.kind === 'order') service.playerOrder([call.items.find((i) => i.kind === 'food')!, call.items.find((i) => i.kind === 'drink')!]);
    if (call.kind === 'bill') charged = service.playerPay();
  };
  service.seatPlayer(mine.def.seats[0]);

  const seen = new Map<string, Set<string>>();
  const last = new Map<number, { x: number; y: number }>();
  let elapsed = 0;
  let cycles = 0;
  for (let ms = 0; ms < 300 * MS_PER_MIN; ms += STEP_MS) {
    crowd.update(STEP_MS, clock, player);
    // Acabada la ronda, el jugador pide la cuenta desde la mesa (la escena lo hace con E: TableService.playerAsk).
    if (service.playerTable?.state === 'ROUND_DONE') service.playerAsk('bill');
    if ((elapsed += STEP_MS) >= MS_PER_MIN) {
      elapsed -= MS_PER_MIN;
      clock = addMinutes(clock, 1);
    }
    for (const t of service.tables) {
      const states = seen.get(t.def.id) ?? new Set<string>();
      if (states.has('PAID') && t.state === 'AVAILABLE') {
        cycles++;
        states.clear();
      }
      states.add(t.state);
      seen.set(t.def.id, states);
    }
    const owners = service.tables.filter((t) => t.waiter !== null).map((t) => t.waiter);
    assert.equal(new Set(owners).size, owners.length, 'un camarero con dos mesas a la vez');
    for (const a of crowd.agents.filter((x) => x.role === 'waiter')) {
      const prev = last.get(a.id);
      // Nunca más de lo que se anda en un paso: nadie aparece en otro sitio.
      if (prev) assert.ok(Math.hypot(a.x - prev.x, a.y - prev.y) <= (a.speed * STEP_MS) / 1000 + 1e-6, 'un camarero se ha teletransportado');
      last.set(a.id, { x: a.x, y: a.y });
    }
  }
  console.log(`
restaurante sábado 19:30 → ${hhmm(clock)}: ${mates.length} acompañantes, ${waiters.length} camareros, ${cycles} mesas servidas de principio a fin`);
  console.log(`  el jugador: ${calls.join(' → ')} · pagó ${charged.toFixed(2)} €`);
  assert.ok(cycles >= 4, 'las mesas no completan el servicio');
  // 'finished' llega por cada plato o bebida que se acaba: se juntan los seguidos.
  assert.deepEqual(calls.filter((k, i, all) => k !== all[i - 1]), ['order', 'served', 'finished', 'bill'], 'el jugador no pasa por todo el servicio');
  assert.ok(charged > 0, 'el jugador no ha pagado');
  assert.equal(service.playerTable?.state, 'PAID');
  assert.equal(service.playerStands(), 0, 'cobra dos veces');
  assert.equal(crowd.pathFailures, 0);
  void loc;
}

// La discoteca: se llena poco a poco por la noche, pico de madrugada, se vacía al cerrar.
{
  const FRIDAY = 5;
  const night: [number, string][] = [[FRIDAY, '21:30'], [FRIDAY, '23:30'], [FRIDAY + 1, '00:45'], [FRIDAY + 1, '02:15'], [FRIDAY + 1, '04:15'], [FRIDAY + 1, '05:40']];
  const levels = night.map(([d, t]) => LEVEL(level('nightclub', d, t)));
  const people = night.map(([d, t]) => run('nightclub', at(d, t), 15, hashSeed('club', d, t)));
  console.log(`\ndiscoteca, noche del viernes: ${night.map(([, t], i) => `${t} ${people[i].initial.visitors}→${people[i].final.visitors}`).join(' · ')}`);
  for (let i = 1; i <= 3; i++) assert.ok(levels[i] >= levels[i - 1], `la discoteca debería llenarse poco a poco (${night[i][1]})`);
  assert.ok(levels[3] > levels[5], 'la discoteca debería vaciarse al acercarse el cierre');
  assert.ok(people[3].initial.visitors >= 14, 'a las 02:15 la discoteca debería estar llena');
  assert.ok(people[0].initial.visitors <= 2, 'a las 21:30 la discoteca debería estar casi vacía');
  // Y cada fase trae su gente: al abrir se pide y se charla; de madrugada se baila, se pide y se habla a la vez.
  const count = (states: string[], s: string): number => states.filter((x) => x === s).length;
  const mix = (states: string[]): string => ['ORDER', 'DRINK', 'DANCE', 'TALK'].map((s) => `${s} ${count(states, s)}`).join(', ');
  const early = run('nightclub', at(FRIDAY, '22:30'), 25, 41);
  const peak = people[3];
  console.log(`discoteca 22:30: ${mix(early.states)} · 02:15: ${mix(peak.states)}`);
  assert.ok(count(early.states, 'DANCE') <= Math.max(1, early.states.length / 3), 'a las 22:30 ya está todo el mundo bailando');
  assert.ok(count(peak.states, 'DANCE') > count(early.states, 'DANCE'), 'de madrugada no se baila más que al abrir');
  assert.ok(new Set(peak.states.filter((s) => s !== 'WORK')).size >= 3, 'de madrugada todo el mundo hace lo mismo');
  // El sábado a las 03:00 sigue siendo la noche del viernes; el martes, cerrada; el jueves, más floja.
  assert.ok(level('nightclub', 6, '03:00') !== null, 'la madrugada del sábado debería contar como noche del viernes');
  assert.equal(level('nightclub', 2, '23:30'), null, 'la discoteca abre el martes');
  assert.equal(level('nightclub', 1, '02:00'), null, 'la madrugada del lunes es noche de domingo: cerrada');
  assert.ok(LEVEL(level('nightclub', 4, '23:59')) < LEVEL(level('nightclub', 5, '23:59')), 'el jueves debería ser más flojo que el viernes');
  // Al cerrar, fuera todo el mundo.
  const closing = run('nightclub', at(FRIDAY + 1, '05:40'), 80, 3);
  console.log(`discoteca 05:40 → ${hhmm(closing.clock)}: ${closing.final.visitors} visitantes, ${closing.final.staff} personal`);
  assert.equal(closing.final.visitors + closing.final.staff, 0, 'la discoteca cerrada sigue con gente');
}

// La vinoteca: tranquila al abrir, llena a la hora de cenar, cerrada el lunes. La barbería, cerrada de noche y el domingo.
assert.ok(target('wine-bar', 4, '22:30') > target('wine-bar', 4, '18:30'), 'la vinoteca no se llena a la hora de cenar');
assert.equal(level('wine-bar', 1, '21:00'), null, 'la vinoteca abre los lunes');
assert.equal(level('hair-salon', 2, '21:30'), null, 'la barbería abierta de noche');
assert.equal(level('hair-salon', 7, '12:00'), null, 'la barbería abierta el domingo');

console.log('\nOK: horarios, afluencia, aforo, personal, entradas y salidas, rutas, variación semanal, la noche de la discoteca, la vinoteca y la barbería.');
