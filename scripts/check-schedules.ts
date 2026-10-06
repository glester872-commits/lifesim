// Días de verdad para la gente del barrio: `npm run check`. Sin Phaser, con el mismo código que el juego.
//   - Con nombre (Sara, Ada): cada día con su versión (systems/Characters.dailyRoutine), sin saltos ni atascos.
//   - Quien trabaja (el personal de la Cafetería Pausa, systems/Crowd): sólo con el local abierto, y se va al cerrar.
//   - La gente de la calle (systems/StreetLife): más de día que de madrugada, menos con lluvia, distinto el finde.
// Falla si algo no se cumple.
import assert from 'node:assert/strict';
import { CHARACTERS, type CharacterDef, type Routine } from '../src/data/characters.ts';
import { weekIndex } from '../src/systems/Calendar.ts';
import { baseRoutineFor, dailyRoutine, rainyDay, routineFor, whereabouts, type Whereabouts } from '../src/systems/Characters.ts';
import { Crowd, profileFor, type Clock } from '../src/systems/Crowd.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { findPoint } from '../src/systems/Navigation.ts';
import { isOpen, placeInfo, placeOfPoint } from '../src/systems/Places.ts';
import { streetProfileFor, streetTargetAt, streetWeatherScale } from '../src/systems/StreetLife.ts';
import { weatherAt } from '../src/systems/Weather.ts';

const DAY = 24 * 60;
const DAWN = 6 * 60;
const WEEKS = 8;
const sara = CHARACTERS.find((c) => c.npc === 'sara')!;
const ada = CHARACTERS.find((c) => c.npc === 'ada')!;
const minutesOf = (hm: string): number => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
const sinceDawn = (hm: string): number => (minutesOf(hm) - DAWN + DAY) % DAY;
const outdoor = (point: string): boolean => {
  const p = findPoint(point)!;
  return p.kind !== 'entrance' && getLocation(p.location).kind === 'exterior';
};

// --------------------------------------------- 1. con nombre: días enteros sin saltos ni atascos

/** Recorre un día minuto a minuto: nadie aparece de golpe en otra parte de la misma calle y a las 06:00 está en casa. */
function liveDay(def: CharacterDef, day: number): Whereabouts[] {
  const start = (day - 1) * DAY + DAWN;
  const out: Whereabouts[] = [];
  let prev = whereabouts(def, start);
  assert.equal(prev.stop.point, def.home, `[${def.npc} día ${day}] a las 06:00 en casa`);
  for (let t = start + 1; t <= start + DAY; t++) {
    const w = whereabouts(def, t);
    if (w.location === prev.location && !w.inside && !prev.inside) {
      const jump = Math.hypot(w.tx - prev.tx, w.ty - prev.ty);
      assert.ok(jump <= def.speed * 1.05 + 0.01, `[${def.npc} día ${day} ${t % DAY}] salta ${jump.toFixed(2)} tiles`);
    }
    out.push(w);
    prev = w;
  }
  assert.equal(prev.stop.point, def.home, `[${def.npc} día ${day}] acaba el día en casa`);
  return out;
}

const variety = new Map<string, Set<string>>();
let rainyDays = 0;
for (const def of [sara, ada]) {
  for (let day = 1; day <= WEEKS * 7; day++) {
    const rainy = rainyDay(day);
    if (rainy && def === sara) rainyDays++;
    const base = baseRoutineFor(def, day, { rainy });
    const today = routineFor(def, day, { rainy });
    liveDay(def, day);
    // Sus sitios abiertos al llegar: la versión del día nunca la deja ante una puerta cerrada.
    for (const s of today.stops) {
      const place = placeOfPoint(s.point);
      const m = minutesOf(s.at);
      if (place) assert.ok(isOpen(place, m < DAWN ? day + 1 : day, Math.floor(m / 60), m % 60), `[${def.npc} día ${day}] ${s.point} cerrado a las ${s.at}`);
    }
    // Lo que tiene hora con alguien no se mueve.
    if (base.outing || base.story) assert.equal(today, base);
    // Lo de siempre, con su margen: las paradas no se mueven más de 10 min, y las obligaciones, 4.
    for (const s of today.stops) {
      const same = base.stops.find((b) => b.at === s.at && b.point === s.point) ?? base.stops.reduce((best, b) =>
        (b.point === s.point || b.alt?.includes(s.point)) && Math.abs(sinceDawn(b.at) - sinceDawn(s.at)) < Math.abs(sinceDawn(best.at) - sinceDawn(s.at)) ? b : best,
      base.stops.find((b) => b.point === s.point || b.alt?.includes(s.point)) ?? base.stops[0]);
      assert.ok(same.point === s.point || same.alt?.includes(s.point), `[${def.npc} día ${day}] ${s.point} no es de su rutina`);
      const d = Math.abs(sinceDawn(s.at) - sinceDawn(same.at));
      const duty = s.point !== def.home && findPoint(s.point)!.kind === 'entrance';
      assert.ok(d <= (duty ? 4 : 10), `[${def.npc} día ${day}] ${s.point} se mueve ${d} min`);
    }
    // Con lluvia, ningún rato opcional al aire libre.
    if (rainy) {
      for (const s of today.stops) {
        const b = base.stops.find((x) => x.point === s.point);
        assert.ok(!(b?.optional && outdoor(s.point)), `[${def.npc} día ${day}] llueve y va a ${s.point}`);
      }
    }
    const k = `${def.npc}/${base.id}`;
    if (!variety.has(k)) variety.set(k, new Set());
    variety.get(k)!.add(today.stops.map((s) => `${s.at} ${s.point}`).join(' > '));
  }
}

// Variación con control: la misma rutina, días distintos (salvo lo que tiene hora con otros o es un día en casa).
const repeated = [...variety].filter(([k]) => !k.includes('noche-viernes') && !k.includes('en-casa') && !k.includes('lluvia'));
const varied = repeated.filter(([, v]) => v.size >= 2);
assert.ok(varied.length >= repeated.length * 0.6, `pocas rutinas varían: ${varied.length}/${repeated.length}`);

// Entre semana y fin de semana: Ada no va a la academia en finde; Sara no sale de fiesta un lunes.
for (let day = 1; day <= WEEKS * 7; day++) {
  const wi = weekIndex(day);
  const adaToday = routineFor(ada, day, { rainy: rainyDay(day) });
  if (wi >= 5) assert.ok(!adaToday.stops.some((s) => s.point === 'STUDY_CENTER_ENTRANCE'), `Ada en la academia el día ${day} (finde)`);
  const late = whereabouts(sara, (day - 1) * DAY + DAY + 60); // la 01:00 de esa noche
  if (wi === 0) assert.equal(late.stop.point, sara.home, `Sara de fiesta un lunes (día ${day})`);
}
const firstOut = (def: CharacterDef, days: number[]): number => {
  const outs = days.map((d) => sinceDawn(routineFor(def, d, { rainy: rainyDay(d) }).stops.find((s) => s.point !== def.home)?.at ?? '05:59'));
  return outs.reduce((a, b) => a + b, 0) / outs.length;
};
const days = [...Array(WEEKS * 7).keys()].map((i) => i + 1);
const weekdays = days.filter((d) => weekIndex(d) < 5);
const weekends = days.filter((d) => weekIndex(d) >= 5);
assert.ok(firstOut(ada, weekends) > firstOut(ada, weekdays), 'Ada sale más tarde el fin de semana');
assert.ok(firstOut(sara, weekends) > firstOut(sara, weekdays), 'Sara sale más tarde el fin de semana');

// Lluvia: lo opcional de fuera se queda en nada y lo que tiene sitio a cubierto va ahí.
{
  const routine = sara.routines.find((r) => r.id === 'sabado-en-casa')!;
  const wet = dailyRoutine(sara, routine, 9001, true);
  assert.ok(wet.stops.some((s) => s.point === 'CAFE_TABLE_05'), 'con lluvia, dentro del Pausa y no en la terraza');
  assert.ok(!wet.stops.some((s) => s.point === 'CAFE_TERRACE_01'));
  const academia = ada.routines.find((r) => r.id === 'academia')!;
  assert.ok(!dailyRoutine(ada, academia, 9002, true).stops.some((s) => s.point === 'PLAZA_BENCH_02'), 'con lluvia, Ada no se sienta en la plaza');
}

// Un sitio cerrado no la atasca: si la versión del día la lleva a un local que cierra, vuelve a lo de siempre.
{
  const academia = ada.routines.find((r) => r.id === 'academia')!;
  // A las 21:50 en la plaza; la alternativa a cubierto (el Pausa) cierra a las 22:00 y seguiría dentro.
  const trap: Routine = {
    ...academia,
    id: 'prueba-cerrado',
    stops: [...academia.stops.slice(0, 3), { at: '21:50', point: 'PLAZA_BENCH_02', alt: ['CAFE_TABLE_05'], lines: [], going: [] }, { at: '23:30', point: ada.home, lines: [], going: [] }],
  };
  const wet = dailyRoutine(ada, trap, 3, true);
  assert.ok(!wet.stops.some((s) => s.point === 'CAFE_TABLE_05'), 'no la manda a un sitio que cierra');
  assert.ok(wet.stops.some((s) => s.point === 'PLAZA_BENCH_02'), 'se queda con lo de siempre');
}

// --------------------------------------------- 2. quien trabaja: el personal del Pausa

/** Un día del Pausa con el mismo Crowd del juego: personal sólo con el local abierto, y vacío tras cerrar. */
function cafeDay(day: number): { open: Set<number>; staffed: number[]; afterClose: number } {
  const place = placeInfo('cafe')!;
  const profile = profileFor('cafe')!;
  const crowd = new Crowd(getLocation(place.interior!), place, profile, seededRng(day));
  const player = { tx: 1, ty: 2 };
  const clock = (m: number): Clock => ({ day, hour: Math.floor(m / 60), minute: m % 60 });
  crowd.populate(clock(6 * 60), player);
  const open = new Set<number>();
  const staffed: number[] = [];
  let afterClose = 0;
  for (let m = 6 * 60; m < 23 * 60 + 30; m++) {
    for (let k = 0; k < 5; k++) crowd.update(100, clock(m), player);
    if (isOpen(place, day, Math.floor(m / 60), m % 60)) open.add(m);
    if (crowd.agents.some((a) => a.kind === 'staff')) staffed.push(m);
    if (m >= 23 * 60) afterClose = Math.max(afterClose, crowd.agents.length);
  }
  return { open, staffed, afterClose };
}
let shift = '';
for (const day of [2, 7]) {
  const { open, staffed, afterClose } = cafeDay(day);
  assert.ok(staffed.length > 0, `día ${day}: nadie trabajando en el Pausa`);
  // Antes de abrir no hay nadie; al cerrar salen primero los clientes y luego el personal, que recoge (hasta una hora).
  assert.ok(staffed.every((m) => open.has(m) || (m >= 22 * 60 && m < 23 * 60)), `día ${day}: personal con el Pausa cerrado`);
  assert.ok(!staffed.some((m) => m < 7 * 60), `día ${day}: personal antes de abrir`);
  assert.ok(staffed.some((m) => m < 9 * 60) && staffed.some((m) => m > 20 * 60), `día ${day}: el turno cubre de la mañana a la noche`);
  assert.equal(afterClose, 0, `día ${day}: al cerrar no se queda nadie dentro`);
  shift ||= `${String(Math.floor(staffed[0] / 60)).padStart(2, '0')}:${String(staffed[0] % 60).padStart(2, '0')}–${String(Math.floor(staffed.at(-1)! / 60)).padStart(2, '0')}:${String(staffed.at(-1)! % 60).padStart(2, '0')}`;
}

// --------------------------------------------- 3. la gente de la calle

{
  const profile = streetProfileFor('district')!;
  const at = (day: number, hour: number): number => streetTargetAt(profile, { day, hour, minute: 0 });
  assert.ok(at(2, 18) > at(2, 4), 'más gente a las 18:00 que a las 04:00');
  assert.ok(at(6, 2) >= at(2, 2), 'la madrugada del sábado, al menos como la de un martes');
  let wet = 1;
  for (let d = 1; d <= 120; d++) {
    const w = weatherAt(d, 18);
    if (w.rain > 0.3) wet = Math.min(wet, streetWeatherScale(w));
  }
  assert.ok(wet < 1, 'con lluvia hay menos gente por la calle');
}

const sample = [...variety].filter(([k]) => k.includes('academia') || k.includes('clase-online') || k.includes('domingo')).map(([k, v]) => `${k} ${v.size}`).join(', ');
console.log(`horarios: ${WEEKS} semanas de Sara y Ada sin saltos ni atascos (${rainyDays} días de lluvia), ${varied.length}/${repeated.length} rutinas con días distintos (${sample}), obligaciones ±4 min, lluvia a cubierto, local cerrado sin atasco, turno del Pausa ${shift}, calle por horas`);
