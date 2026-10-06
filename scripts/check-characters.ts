// Recorre cada rutina de cada personaje con nombre cada cuarto de minuto y
// luego ocho semanas seguidas: `npm run check`. Falla si algo no se cumple.
import assert from 'node:assert/strict';
import { CHARACTERS, OUTINGS } from '../src/data/characters.ts';
import { DAY_STARTS, catchUp, routineFor, tripsOf, whereabouts, whereaboutsIn, type Whereabouts } from '../src/systems/Characters.ts';
import { getLocation, isStandable } from '../src/systems/LocationSystem.ts';
import { isOpen, placeOfPoint } from '../src/systems/Places.ts';
import { weekday } from '../src/systems/MetroDaily.ts';
import { weatherAt } from '../src/systems/Weather.ts';

const STEP = 0.25;
const DAY = 24 * 60;
const hhmm = (m: number): string => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

/** Lo que tiene que cumplirse en cada instante: pisa suelo, no salta, tiene algo que decir y el sitio está abierto. */
function checkMoment(speed: number, w: Whereabouts, prev: Whereabouts, day: number, m: number, at: string): void {
  assert.ok(isStandable(getLocation(w.location), Math.round(w.tx), Math.round(w.ty)), `${at}: dentro de algo en ${w.location} (${w.tx.toFixed(1)}, ${w.ty.toFixed(1)})`);
  // Nadie se teletransporta: dentro de un sitio avanza como mucho lo que anda; entre sitios, por una puerta.
  if (w.location === prev.location) {
    const step = Math.hypot(w.tx - prev.tx, w.ty - prev.ty);
    assert.ok(step <= speed * STEP + 1e-6, `${at}: salta ${step.toFixed(2)} tiles en ${w.location}`);
  }
  if (!w.moving) {
    const place = placeOfPoint(w.stop.point);
    // En casa no hay horario; en un negocio, tiene que estar abierto mientras está dentro.
    const t = ((m % DAY) + DAY) % DAY;
    assert.ok(!place || w.inside || isOpen(place, day, Math.floor(t / 60), t % 60), `${at}: ${place?.name} está cerrado`);
    assert.ok(w.inside || w.stop.lines.length > 0, `${at}: en ${w.stop.point} sin nada que decir`);
  } else {
    assert.ok(w.stop.going.length > 0, `${at}: de camino a ${w.stop.point} sin nada que decir`);
  }
}

// ------------------------------------------------ cada rutina, cada día que puede tocar

for (const def of CHARACTERS) {
  console.log(`${def.npc}: ${def.routines.length} rutinas`);
  for (const routine of def.routines) {
    const locations = new Set<string>();
    for (const d of routine.days) {
      // Día 1 es lunes: el índice d es el día d + 1. La madrugada cae ya en el día siguiente del calendario.
      let prev = whereaboutsIn(def, routine, DAY_STARTS - STEP);
      for (let m = DAY_STARTS; m < DAY_STARTS + DAY; m += STEP) {
        const w = whereaboutsIn(def, routine, m);
        const calendarDay = d + 1 + (m >= DAY ? 1 : 0);
        checkMoment(def.speed, w, prev, calendarDay, m, `${def.npc}/${routine.id} ${weekday(d + 1)} ${hhmm(m)}`);
        locations.add(w.location);
        prev = w;
      }
    }
    const days = routine.days.map((d) => weekday(d + 1).slice(0, 3)).join(',');
    const outing = routine.outing ? ` · plan «${routine.outing}»` : '';
    console.log(`  ${routine.id.padEnd(20)} ${days.padEnd(16)} ${routine.stops.length} paradas en ${[...locations].join(', ')}${outing}`);
    for (const trip of tripsOf(routine)) {
      if (trip.travel === 0) continue;
      console.log(`      sale ${hhmm((trip.arrive - trip.travel + DAY) % DAY)} → llega ${trip.stop.at}  ${trip.stop.point.padEnd(24)} ${Math.round(trip.travel)} min andando`);
    }
  }
}

// --------------------------------------------- ocho semanas seguidas, sin saltos entre días

const WEEKS = 8;
const picked = new Map<string, number>();
// Como en el juego (scenes/WorldScene): el tiempo de cada día decide si sale la rutina de lluvia.
const rainy = (day: number): boolean => weatherAt(day, 10).sky.endsWith('rain');
for (const def of CHARACTERS) {
  const pick = (day: number) => routineFor(def, day, { rainy: rainy(day) });
  let prev = whereabouts(def, DAY_STARTS - STEP, pick);
  for (let abs = DAY_STARTS; abs < WEEKS * 7 * DAY; abs += STEP) {
    const w = whereabouts(def, abs, pick);
    const day = Math.floor(abs / DAY) + 1;
    checkMoment(def.speed, w, prev, day, abs, `${def.npc} día ${day} ${hhmm(abs % DAY)} (${w.routine})`);
    prev = w;
  }
  for (let day = 1; day <= WEEKS * 7; day++) {
    const key = `${def.npc}/${pick(day).id}`;
    picked.set(key, (picked.get(key) ?? 0) + 1);
  }
  // Las que fija su historia (Routine.story) no salen solas: las prueba scripts/check-story.ts.
  for (const r of def.routines) if (!r.story) assert.ok(picked.get(`${def.npc}/${r.id}`), `${def.npc}: la rutina ${r.id} no sale nunca en ${WEEKS} semanas`);
}

// Los planes con otros salen para todos a la vez.
for (const outing of Object.keys(OUTINGS)) {
  for (let day = 1; day <= WEEKS * 7; day++) {
    const going = CHARACTERS.filter((c) => routineFor(c, day).outing === outing).map((c) => c.npc);
    const invited = CHARACTERS.filter((c) => c.routines.some((r) => r.outing === outing && r.days.includes((day - 1) % 7))).map((c) => c.npc);
    assert.ok(going.length === 0 || going.length === invited.length, `día ${day}: «${outing}» sólo para ${going.join(', ')}`);
  }
}

console.log(`\nen ${WEEKS} semanas:`);
for (const [key, n] of [...picked].sort()) console.log(`  ${key.padEnd(34)} ${n} días`);
// Variedad: las semanas no se repiten calcadas.
for (const def of CHARACTERS) {
  const week = (w: number): string => Array.from({ length: 7 }, (_, i) => routineFor(def, w * 7 + i + 1).id).join();
  const distinct = new Set(Array.from({ length: WEEKS }, (_, w) => week(w))).size;
  assert.ok(distinct > WEEKS / 2, `${def.npc}: sólo ${distinct} semanas distintas de ${WEEKS}`);
}
// Tras una charla, ponerse al día nunca le mueve de sitio a la vista: sólo acorta paradas.
let recovered = 0;
for (const def of CHARACTERS) {
  for (let now = DAY; now < 3 * DAY; now += 1) {
    for (const lag of [5, 60]) {
      const was = whereabouts(def, now - lag);
      const left = catchUp(def, now, lag, 1 / 30, was.location);
      assert.ok(left >= 0 && left <= lag, `${def.npc} ${hhmm(now)}: retraso ${left} fuera de [0, ${lag}]`);
      if (left === lag || was.inside) continue;
      recovered++;
      const is = whereabouts(def, now - left);
      assert.ok(is.location === was.location && is.tx === was.tx && is.ty === was.ty, `${def.npc} ${hhmm(now)}: se pone al día saltando de sitio`);
    }
  }
}
assert.ok(recovered > 0, 'nadie recupera nunca el retraso de una charla');

console.log('\nOK: rutinas, horarios, lugares abiertos, paso continuo entre días, planes compartidos, variedad y vuelta tras una charla sin saltos.');
