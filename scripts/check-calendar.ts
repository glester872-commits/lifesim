// El calendario del mundo (systems/Calendar, systems/TimeSystem): cada medianoche
// se cruza una vez y en orden, pase el tiempo como pase (frame a frame, dormir,
// un salto de 30 horas, varios días); el día de la semana gira de domingo a
// lunes; el HUD lo dice; los horarios, las rutinas y la calle lo consultan; y
// sobrevive a guardar y cargar. `node scripts/check-calendar.ts`.
import assert from 'node:assert/strict';
import { SAVE_KEY } from '../src/config/constants.ts';
import { dateOf, formatClock, isWeekend, on, rhythmAt, weekIndex, weekdayOf, WEEKEND, type Midnight } from '../src/systems/Calendar.ts';
import { TimeSystem } from '../src/systems/TimeSystem.ts';
import { SaveSystem } from '../src/systems/SaveSystem.ts';
import { hoursLabel, hoursOn, isOpen, placeInfo } from '../src/systems/Places.ts';
import { routineFor } from '../src/systems/Characters.ts';
import { CHARACTERS, type CharacterDef } from '../src/data/characters.ts';
import { PLACES } from '../src/data/places.ts';

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
assert.deepEqual(dateOf(15), { day: 15, week: 3, weekIndex: 0, weekday: 'monday', weekend: false });

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

assert.equal(formatClock(8, 8, 42), 'Lun · Día 8 · 08:42');
assert.equal(formatClock(6, 23, 5), 'Sáb · Día 6 · 23:05');

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
}

// Datos: un horario por días necesita el general (hours) para los demás; sin él, isOpen lo daría por siempre abierto.
for (const p of PLACES) assert.ok(!p.hoursByDay || p.hours, `${p.id}: hoursByDay sin hours`);

console.log('check-calendar: medianoches, semana, HUD, ritmo, horarios, rutinas y guardado, OK');
