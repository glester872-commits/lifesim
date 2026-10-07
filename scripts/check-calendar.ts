// El calendario del mundo (systems/Calendar, systems/TimeSystem): cada medianoche
// se cruza una vez y en orden, pase el tiempo como pase (frame a frame, dormir,
// un salto de 30 horas, varios días); el día de la semana gira de domingo a
// lunes; el HUD lo dice; los horarios, las rutinas y la calle lo consultan; y
// sobrevive a guardar y cargar. `node scripts/check-calendar.ts`.
import assert from 'node:assert/strict';
import { SAVE_KEY } from '../src/config/constants.ts';
import { dateOf, dayOfDate, EPOCH, formatClock, formatDate, isWeekend, seasonOf, on, rhythmAt, weekIndex, weekdayOf, WEEKEND, type Midnight } from '../src/systems/Calendar.ts';
import { TimeSystem } from '../src/systems/TimeSystem.ts';
import { SaveSystem } from '../src/systems/SaveSystem.ts';
import { hoursLabel, hoursOn, isOpen, placeInfo } from '../src/systems/Places.ts';
import { routineFor } from '../src/systems/Characters.ts';
import { CHARACTERS, type CharacterDef } from '../src/data/characters.ts';
import { PLACES } from '../src/data/places.ts';

/** Día de la semana de Date.getUTCDay (0 = domingo). */
const WEEK_JS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

// ------------------------------------------------------------ el reloj

/** Lo que TimeSystem necesita del GameState, sin Phaser: el reloj y avisar. */
function clockAt(day: number, hour: number, minute: number): { time: TimeSystem; state: { day: number; hour: number; minute: number }; midnights: Midnight[] } {
  const midnights: Midnight[] = [];
  const state = {
    day, hour, minute,
    setClock(d: number, h: number, m: number): void {
      state.day = d;
      state.hour = h;
      state.minute = m;
    },
    emit(event: string, m: Midnight): void {
      if (event === 'midnight') midnights.push(m);
    },
  };
  return { time: new TimeSystem(state as never), state, midnights };
}

// El día 1 es lunes; la semana gira.
assert.equal(weekdayOf(1), 'monday');
assert.equal(weekdayOf(6), 'saturday');
assert.equal(weekdayOf(7), 'sunday');
assert.equal(weekdayOf(8), 'monday');
assert.equal(weekIndex(0), 6, 'el día 0 (la víspera) es domingo');
assert.deepEqual([isWeekend(5), isWeekend(6), isWeekend(7)], [false, true, true]);
assert.deepEqual(dateOf(15), { day: 15, week: 3, weekIndex: 0, weekday: 'monday', weekend: false, year: 2027, month: 4, dom: 26, doy: 116, season: 'spring' });

// Lunes 23:59 → martes 00:00: un minuto, una medianoche.
{
  const c = clockAt(1, 23, 59);
  c.time.advanceMinutes(1);
  assert.deepEqual([c.state.day, c.state.hour, c.state.minute, weekdayOf(c.state.day)], [2, 0, 0, 'tuesday']);
  assert.deepEqual(c.midnights, [{ day: 2, weekday: 'tuesday', from: 1, to: 2 }]);
}
// Sábado → domingo, y domingo → lunes.
{
  const sat = clockAt(6, 23, 30);
  sat.time.advanceMinutes(45);
  assert.deepEqual([weekdayOf(sat.state.day), sat.midnights.map((m) => m.weekday)], ['sunday', ['sunday']]);
  const sun = clockAt(7, 22, 0);
  sun.time.advanceMinutes(150);
  assert.deepEqual([sun.state.day, weekdayOf(sun.state.day), sun.midnights.map((m) => m.weekday)], [8, 'monday', ['monday']]);
}
// Unas horas cruzando medianoche (el metro, dormir): una sola.
{
  const c = clockAt(3, 20, 0);
  c.time.advanceMinutes(6 * 60);
  assert.deepEqual([c.state.day, c.state.hour, c.midnights.length], [4, 2, 1]);
}
// 30 horas desde las 22:00: dos medianoches, en orden, y el reloj donde toca.
{
  const c = clockAt(5, 22, 0);
  c.time.advanceMinutes(30 * 60);
  assert.deepEqual([c.state.day, c.state.hour, c.state.minute], [7, 4, 0]);
  assert.deepEqual(c.midnights.map((m) => [m.day, m.weekday, m.from, m.to]), [[6, 'saturday', 5, 7], [7, 'sunday', 5, 7]]);
}
// Varios días de golpe: una medianoche por día, seguidas, sin repetir.
{
  const c = clockAt(4, 9, 0);
  c.time.advanceMinutes(5 * 1440 + 3 * 60);
  assert.equal(c.state.day, 9);
  assert.deepEqual(c.midnights.map((m) => m.day), [5, 6, 7, 8, 9]);
  assert.equal(weekdayOf(c.state.day), 'tuesday');
}
// Frame a frame (el reloj corriendo): cruzar medianoche avisa una vez, no una por frame.
{
  const c = clockAt(2, 23, 58);
  for (let i = 0; i < 60 * 5; i++) c.time.update(1000 / 60);
  assert.equal(c.state.day, 3);
  assert.equal(c.midnights.length, 1);
}
// Sin avance, nada.
{
  const c = clockAt(2, 12, 0);
  c.time.advanceMinutes(0);
  assert.equal(c.midnights.length, 0);
}

// ------------------------------------------------------------ el HUD

assert.equal(formatClock(8, 8, 42), 'Lun 19 Abr · 08:42');
assert.equal(formatClock(6, 23, 5), 'Sáb 17 Abr · 23:05');

// ------------------------------------------------------ ritmo de la ciudad

assert.equal(rhythmAt(1, 8), 'weekday-early');
assert.equal(rhythmAt(3, 11), 'weekday-work');
assert.equal(rhythmAt(5, 19), 'friday-evening');
assert.equal(rhythmAt(4, 19), 'weekday-evening');
assert.equal(rhythmAt(6, 2), 'weekend-night', 'la madrugada del sábado es la noche del viernes');
assert.equal(rhythmAt(7, 1), 'weekend-night', 'la del domingo, la del sábado');
assert.equal(rhythmAt(8, 1), 'weekday-night', 'la del lunes, la del domingo: noche de diario');
assert.equal(rhythmAt(6, 12), 'saturday-day');
assert.equal(rhythmAt(7, 12), 'sunday-day');

// ------------------------------------------------------ horarios de los sitios

{
  const sup = placeInfo('supermarket')!;
  // Semana 1: día 6 sábado, 7 domingo.
  assert.deepEqual(hoursOn(sup, 5), [9, 22]);
  assert.deepEqual(hoursOn(sup, 6), [10, 15]);
  assert.deepEqual([isOpen(sup, 6, 21), isOpen(sup, 7, 12), isOpen(sup, 7, 16), isOpen(sup, 7, 9, 30), isOpen(sup, 8, 9)], [true, true, false, false, true]);
  assert.equal(hoursLabel(sup), 'Abre de lunes a sábado de 09:00 a 22:00; domingo de 10:00 a 15:00.');
  // La discoteca, de jueves a sábado de 21 a 06: la madrugada del sábado es su viernes; la del lunes, cerrada.
  const club = placeInfo('nightclub')!;
  assert.deepEqual([isOpen(club, 6, 3), isOpen(club, 7, 3), isOpen(club, 8, 3), isOpen(club, 4, 22), isOpen(club, 3, 22)], [true, true, false, true, false]);
  assert.equal(hoursLabel(club), 'Abre de jueves a sábado de 21:00 a 06:00.');
  // Un horario cerrado un día concreto (sin tocar los datos del juego): cerrado ese día, abierto los demás.
  const shut = { ...sup, hoursByDay: { sunday: 'closed' as const } };
  assert.deepEqual([isOpen(shut, 7, 12), isOpen(shut, 6, 12)], [false, true]);
}

// ------------------------------------------------------ rutinas de los personajes

{
  // Cada día, la rutina elegida es de ese día de la semana (28 días, todos los personajes).
  for (const def of CHARACTERS) {
    for (let day = 1; day <= 28; day++) assert.ok(routineFor(def, day).days.includes(weekIndex(day)), `${def.npc}: rutina que no toca el día ${day}`);
  }
  // Sara: entre semana clase o facultad; el fin de semana, otra cosa.
  const sara = CHARACTERS.find((c) => c.npc === 'sara')!;
  const weekdayIds = new Set([1, 2, 3, 4].map((d) => routineFor(sara, d).id));
  assert.ok([...weekdayIds].some((id) => id === 'clase-online' || id === 'facultad'), 'Sara estudia entre semana');
  for (const d of [6, 7, 13, 14]) assert.ok(!['clase-online', 'facultad'].includes(routineFor(sara, d).id), 'y el fin de semana, no');
  // Una excepción de un día manda: un personaje de prueba con rutina de diario y un lunes de gimnasio.
  const base = sara.routines.find((r) => r.id === 'clase-online')!;
  const test: CharacterDef = {
    ...sara,
    npc: 'prueba',
    routines: [
      { ...base, id: 'diario', days: on('monday', 'tuesday', 'wednesday', 'thursday', 'friday'), weight: 5 },
      { ...base, id: 'gimnasio', days: on('monday'), weight: 1, override: true },
      { ...base, id: 'finde', days: WEEKEND, weight: 1 },
    ],
  };
  for (let week = 0; week < 4; week++) {
    assert.equal(routineFor(test, 1 + week * 7).id, 'gimnasio', 'el lunes manda la excepción');
    assert.equal(routineFor(test, 2 + week * 7).id, 'diario');
    assert.equal(routineFor(test, 6 + week * 7).id, 'finde');
  }
}

// ------------------------------------------------------ guardar y cargar

{
  const store = new Map<string, string>();
  const save = new SaveSystem({ read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) });
  // Un domingo por la noche: al cargar sigue siendo domingo (no vuelve a lunes).
  const state = { money: 10, energy: 50, day: 14, hour: 23, minute: 40, locationId: 'district', position: { x: 10, y: 10 }, facing: 'down' as const, events: undefined as never, inventory: {}, cards: {} };
  save.save(state);
  assert.ok(store.has(SAVE_KEY));
  const loaded = save.load()!;
  assert.deepEqual([loaded.day, weekdayOf(loaded.day), loaded.hour], [14, 'sunday', 23]);
  // Fecha y hora exactas: el 29 de febrero de 2028 a las 18:42 vuelve igual.
  save.save({ ...state, day: dayOfDate(2028, 2, 29), hour: 18, minute: 42 });
  const back = save.load()!;
  assert.deepEqual([formatDate(back.day), back.hour, back.minute], ['martes, 29 de febrero de 2028', 18, 42]);
  // Una partida de antes del calendario (sólo «día 24») carga en su fecha, el mismo día de la semana, sin volver al día 1.
  const old = JSON.parse(store.get(SAVE_KEY)!);
  store.set(SAVE_KEY, JSON.stringify({ ...old, state: { ...old.state, day: 24, hour: 9, minute: 5 } }));
  const migrated = save.load()!;
  assert.deepEqual([migrated.day, formatDate(migrated.day), weekdayOf(migrated.day), migrated.hour, migrated.minute], [24, 'miércoles, 5 de mayo de 2027', 'wednesday', 9, 5]);
}

// ------------------------------------------------------ calendario gregoriano

{
  const ymd = (day: number): string => { const d = dateOf(day); return `${d.year}-${d.month}-${d.dom}`; };
  // El día 1 es el lunes 12 de abril de 2027, y el día de la semana del juego es el del calendario de verdad, siempre.
  assert.deepEqual([EPOCH.year, EPOCH.month, EPOCH.dom, ymd(1)], [2027, 4, 12, '2027-4-12']);
  assert.equal(formatDate(1), 'lunes, 12 de abril de 2027');
  for (let day = -400; day <= 4000; day++) {
    const d = dateOf(day);
    assert.equal(WEEK_JS[new Date(Date.UTC(d.year, d.month - 1, d.dom)).getUTCDay()], weekdayOf(day), `día ${day}: ${ymd(day)}`);
    assert.equal(dayOfDate(d.year, d.month, d.dom), day);
  }
  // Fin de mes, febrero con y sin bisiesto y fin de año.
  const next = (y: number, m: number, dd: number): string => ymd(dayOfDate(y, m, dd) + 1);
  assert.equal(next(2028, 1, 31), '2028-2-1', '31 ene → 1 feb');
  assert.equal(next(2027, 2, 28), '2027-3-1', '2027 no es bisiesto');
  assert.equal(next(2028, 2, 28), '2028-2-29', '2028 es bisiesto');
  assert.equal(next(2028, 2, 29), '2028-3-1');
  assert.equal(next(2027, 12, 31), '2028-1-1', 'año nuevo');
  assert.equal(dateOf(dayOfDate(2028, 12, 31)).doy, 366);
  assert.equal(next(2100, 2, 28), '2100-3-1', '2100 no es bisiesto');
  // Estaciones (Madrid, hemisferio norte).
  assert.deepEqual([1, 4, 7, 10].map((m) => seasonOf(dayOfDate(2028, m, 15))), ['winter', 'spring', 'summer', 'autumn']);
  assert.deepEqual([[3, 19], [3, 20], [6, 21], [9, 23], [12, 21]].map(([m, dd]) => seasonOf(dayOfDate(2028, m, dd))), ['winter', 'spring', 'summer', 'autumn', 'winter']);
  // El reloj cruza el 28 de febrero de 2028 de noche: medianoches del 29 y del 1 de marzo, en orden, con su día de la semana.
  const feb28 = dayOfDate(2028, 2, 28);
  const { time, state, midnights } = clockAt(feb28, 23, 30);
  time.advanceMinutes(24 * 60 + 60);
  assert.deepEqual(midnights.map((m) => [ymd(m.day), m.weekday]), [['2028-2-29', 'tuesday'], ['2028-3-1', 'wednesday']]);
  assert.deepEqual([ymd(state.day), state.hour, state.minute], ['2028-3-1', 0, 30]);
  // Lo que se resetea cada día (cooldowns diarios: «una vez por día» = mismo state.day) cambia al cruzar fin de mes y de año.
  const dec31 = dayOfDate(2027, 12, 31);
  const clock = clockAt(dec31, 23, 59);
  const before = clock.state.day;
  clock.time.advanceMinutes(1);
  assert.deepEqual([clock.state.day - before, ymd(clock.state.day), clock.midnights.length], [1, '2028-1-1', 1]);
  // Fin de semana por fecha: el sábado 1 de enero de 2028 lo es; el lunes 3, no.
  assert.ok(isWeekend(dayOfDate(2028, 1, 1)) && !isWeekend(dayOfDate(2028, 1, 3)));
}

// Datos: un horario por días necesita el general (hours) para los demás; sin él, isOpen lo daría por siempre abierto.
for (const p of PLACES) assert.ok(!p.hoursByDay || p.hours, `${p.id}: hoursByDay sin hours`);

console.log('check-calendar: medianoches, semana, HUD, ritmo, horarios, rutinas y guardado, OK');
