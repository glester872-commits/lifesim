// Afluencia dinámica de Decathlon (AFLUENCIA-DEC02): `npm run check`. Una semana de mayo (sin rebajas ni principio de
// mes), cada media hora de 8:00 a 22:00: el nivel sale de franjas + día de la semana + demanda del calendario, el
// personal de sus turnos (`hours`), y el objetivo de clientes nunca pasa del tope ni del aforo menos el personal.
import assert from 'node:assert/strict';
import { DECATHLON_PROFILE, DECATHLON_STORE } from '../src/data/decathlon.ts';
import type { PopulationProfile, StaffRole } from '../src/data/population.ts';
import { LEVELS } from '../src/config/population.ts';
import { Crowd, demandAt, levelAt, profileFor, staffDay, staffOnShift, targetAt, type Clock } from '../src/systems/Crowd.ts';
import { dateOf, dayOfDate, weekIndex, WEEKDAY_SHORT } from '../src/systems/Calendar.ts';
import { placeInfo, type PlaceInfo } from '../src/systems/Places.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';

const P = DECATHLON_PROFILE;
const shop = placeInfo(P.place)!;
assert.ok(shop, 'decathlon-tienda sin lugar');

// Lunes 10 … domingo 16 de mayo de 2027.
const week = Array.from({ length: 7 }, (_, i) => dayOfDate(2027, 5, 10 + i));
week.forEach((d, i) => {
  assert.equal(weekIndex(d), i, `mayo ${10 + i}: no es el día ${i} de la semana`);
  assert.equal(demandAt(P, { day: d, hour: 18, minute: 0 }), 0, `mayo ${10 + i}: con demanda`);
});

const hourOf = (c: Clock): number => c.hour + c.minute / 60;
const onShiftNow = (place: PlaceInfo, c: Clock, profile: PopulationProfile = P): StaffRole[] =>
  profile.staff.filter((r) => staffOnShift(r, levelAt(place, profile, c), staffDay(place, c), hourOf(c)));
const role = (label: string): StaffRole => P.staff.find((r) => r.label === label)!;
const isCashier = (r: StaffRole): boolean => r.service === 'cashier';
const lvl = (c: Clock): number => { const l = levelAt(shop, P, c); return l === null ? -1 : LEVELS.indexOf(l); };
const [running, montana, ciclismo, fitness, repo] = ['Sección de running', 'Sección de montaña', 'Sección de ciclismo', 'Sección de fitness', 'Reposición'].map(role);
assert.ok(running && montana && ciclismo && fitness && repo, 'falta un puesto de sala');

const slots = Array.from({ length: 29 }, (_, k) => ({ hour: 8 + Math.floor(k / 2), minute: (k % 2) * 30 }));
const peak: number[] = [];
const daySum: number[] = [];
let checked = 0;
for (const [wi, day] of week.entries()) {
  let max = -1;
  let sum = 0;
  for (const s of slots) {
    const c: Clock = { day, ...s };
    const t = hourOf(c);
    const level = levelAt(shop, P, c);
    const target = targetAt(shop, P, c);
    const staff = onShiftNow(shop, c);
    // a · Determinista.
    assert.equal(levelAt(shop, P, c), level, `nivel no determinista ${day} ${t}`);
    assert.equal(targetAt(shop, P, c), target, `objetivo no determinista ${day} ${t}`);
    const d = demandAt(P, c);
    assert.ok(d >= -1 && d <= 2, `demanda fuera de [-1, 2]: ${d}`);
    const open = t >= 9 && t < 21;
    if (!open) {
      // b · Cerrado: nadie.
      assert.equal(level, null, `abierto a las ${t} (día ${wi})`);
      assert.equal(target, 0, `clientes con la tienda cerrada (${t})`);
      assert.equal(staff.length, 0, `personal con la tienda cerrada (${t})`);
      continue;
    }
    assert.notEqual(level, null, `cerrado a las ${t} (día ${wi})`);
    sum += LEVELS.indexOf(level!);
    if (t >= 17) max = Math.max(max, LEVELS.indexOf(level!));
    // d · Tope y aforo.
    assert.ok(target <= Math.min(P.maxVisitors, shop.capacity - staff.length), `objetivo ${target} sobre el tope (día ${wi}, ${t})`);
    // e · Siempre hay quien cobre; cada puesto es una persona (un StaffRole = un agente: Crowd lo busca por su rol).
    assert.ok(staff.filter(isCashier).length >= 1, `sin cajero en turno (día ${wi}, ${t})`);
    // f · Turnos.
    assert.equal(staff.includes(montana), t >= 12 && t < 18, `montaña a las ${t}`);
    assert.equal(staff.includes(fitness), (wi === 4 || wi === 5) && t >= 14.5, `fitness día ${wi} a las ${t}`);
    assert.equal(staff.includes(running), t < 15.5, `running a las ${t}`);
    assert.equal(staff.includes(ciclismo), t >= 14.5, `ciclismo a las ${t}`);
    assert.equal(staff.includes(repo), t < 15.5, `reposición a las ${t}`);
    checked++;
  }
  peak.push(max);
  daySum.push(sum);
}
const at = (wi: number, hour: number): StaffRole[] => onShiftNow(shop, { day: week[wi], hour, minute: 0 });
for (let wi = 0; wi < 7; wi++) {
  assert.ok(at(wi, 10).includes(running) && at(wi, 10).includes(repo) && !at(wi, 10).includes(ciclismo), `10:00 del día ${wi}`);
  assert.ok(at(wi, 19).includes(ciclismo) && !at(wi, 19).includes(running), `19:00 del día ${wi}`);
}

// c · Punta de 17 a 21: lunes-jueves por debajo del viernes. El viernes (HIGH + 1) ya toca el techo de LEVELS, así que
// en la punta el sábado lo iguala (no puede superarlo); que el sábado es el día fuerte se ve en el resto del día.
for (let wi = 0; wi < 4; wi++) assert.ok(peak[wi] < peak[4], `punta del día ${wi} (${peak[wi]}) no por debajo del viernes (${peak[4]})`);
assert.ok(peak[4] <= peak[5] && peak[6] <= peak[5], `punta: vie ${peak[4]}, sáb ${peak[5]}, dom ${peak[6]}`);
assert.ok(daySum[5] > daySum[4] && daySum[6] <= daySum[5], `día entero: vie ${daySum[4]}, sáb ${daySum[5]}, dom ${daySum[6]}`);

// b · Un domingo cerrado (días sin el 6): ni clientes ni personal.
const noSunday: PlaceInfo = { ...shop, days: [0, 1, 2, 3, 4, 5] };
for (const s of slots) {
  const c: Clock = { day: week[6], ...s };
  assert.equal(levelAt(noSunday, P, c), null);
  assert.equal(targetAt(noSunday, P, c), 0, `clientes en domingo cerrado (${hourOf(c)})`);
  assert.equal(onShiftNow(noSunday, c).length, 0, `personal en domingo cerrado (${hourOf(c)})`);
}

// g · Más cajas el viernes por la tarde que el martes; el sábado, al menos las del viernes.
const tills = (wi: number, hour: number): number => at(wi, hour).filter(isCashier).length;
assert.ok(tills(4, 18) > tills(1, 18), `cajas 18:00: viernes ${tills(4, 18)}, martes ${tills(1, 18)}`);
assert.ok(tills(5, 18) >= tills(4, 18), `cajas 18:00: sábado ${tills(5, 18)}, viernes ${tills(4, 18)}`);

// e · Un puesto, una persona: en la punta de cada día, ningún rol aparece dos veces en la tienda.
const loc = getLocation(DECATHLON_STORE.id);
for (const day of week) {
  const c: Clock = { day, hour: 18, minute: 0 };
  const crowd = new Crowd(loc, shop, P);
  crowd.populate(c, loc.spawns.entry);
  const roles = crowd.agents.flatMap((a) => a.staffRole ? [a.staffRole] : []);
  assert.equal(new Set(roles).size, roles.length, `un puesto con dos personas (día ${weekIndex(day)})`);
  assert.equal(roles.length, onShiftNow(shop, c).length, `personal en tienda ≠ turnos (día ${weekIndex(day)})`);
}

// Cierre: el sábado a las 20:50 la tienda está llena; a las 21:05 (reloj fijo, ticks de 100 ms) salen primero los
// clientes. Mientras quede uno dentro, nadie del personal se va; al final no queda ningún cliente.
{
  const crowd = new Crowd(loc, shop, P);
  crowd.populate({ day: week[5], hour: 20, minute: 50 }, loc.spawns.entry);
  const before = crowd.agents.filter((a) => a.kind === 'visitor').length;
  assert.ok(before > 0, 'nadie dentro a las 20:50 del sábado');
  const closed: Clock = { day: week[5], hour: 21, minute: 5 };
  let ms = 0;
  for (; ms < 1_800_000 && crowd.agents.some((a) => a.kind === 'visitor'); ms += 100) {
    crowd.update(100, closed, loc.spawns.entry);
    if (crowd.agents.some((a) => a.kind === 'visitor')) {
      const gone = crowd.agents.filter((a) => a.kind === 'staff' && (a.leaving || a.leaveSoon));
      assert.equal(gone.length, 0, `cierre: ${gone.map((a) => a.label).join(', ')} se va con clientes dentro (${ms} ms)`);
    }
  }
  assert.ok(!crowd.agents.some((a) => a.kind === 'visitor'), `cierre: quedan clientes tras ${ms / 1000} s`);
  console.log(`  cierre sáb: ${before} clientes fuera en ${Math.round(ms / 1000)} s reales con el personal dentro`);
}

// h · Demanda del calendario.
const tuesdayFrom = (d: number): number => d + ((1 - weekIndex(d)) + 7) % 7;
const janTue = tuesdayFrom(dayOfDate(2028, 1, 10));
assert.equal(dateOf(janTue).month, 1);
const noonJan: Clock = { day: janTue, hour: 12, minute: 0 };
const noonMay: Clock = { day: week[1], hour: 12, minute: 0 };
assert.equal(demandAt(P, noonJan), 1, 'rebajas de enero');
assert.equal(lvl(noonJan), Math.min(LEVELS.length - 1, lvl(noonMay) + 1), 'enero no sube un escalón');
const june3 = dayOfDate(2027, 6, 3);
const june10 = dayOfDate(2027, 6, 10);
assert.equal(demandAt(P, { day: june3, hour: 18, minute: 0 }), 1, 'principio de mes, 18:00');
assert.equal(demandAt(P, { day: june3, hour: 12, minute: 0 }), 0, 'principio de mes antes de las 17');
assert.equal(demandAt(P, { day: june10, hour: 18, minute: 0 }), 0, 'el día 10 no es principio de mes');
assert.equal(demandAt({ ...P, demand: [{ shift: 3 }, { shift: 1 }] }, noonMay), 2, 'demanda sin tope por arriba');
assert.equal(demandAt({ ...P, demand: [{ shift: -5 }] }, noonMay), -1, 'demanda sin tope por abajo');
const gym = profileFor('gym')!;
const gymPlace = placeInfo(gym.place)!;
assert.ok(!gym.demand, 'el gimnasio ya no es un perfil sin demanda');
assert.equal(demandAt(gym, noonJan), 0, 'perfil sin demand ≠ 0');
assert.equal(levelAt(gymPlace, gym, noonJan), levelAt(gymPlace, gym, noonMay), 'sin demand, enero y mayo difieren');

// i · Evidencia: punta de mediodía y de tarde de cada día.
const row = (wi: number, hour: number): string => {
  const c: Clock = { day: week[wi], hour, minute: 0 };
  const staff = onShiftNow(shop, c);
  return `${String(hour).padStart(2, '0')}h ${levelAt(shop, P, c)} ${targetAt(shop, P, c)}cl ${staff.length}p(${staff.filter(isCashier).length}c)`;
};
for (let wi = 0; wi < 7; wi++) console.log(`  ${WEEKDAY_SHORT[dateOf(week[wi]).weekday]} ${dateOf(week[wi]).dom}/5 · ${row(wi, 12)} · ${row(wi, 18)}`);

console.log(`OK · afluencia Decathlon: ${checked} medias horas abiertas en 7 días, punta lun-dom [${peak.join(', ')}], cajas 18:00 mar ${tills(1, 18)} vie ${tills(4, 18)} sáb ${tills(5, 18)}, enero ${LEVELS[lvl(noonJan)]} frente a ${LEVELS[lvl(noonMay)]} en mayo.`);
