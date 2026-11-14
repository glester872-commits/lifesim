import assert from 'node:assert/strict';
import { DEMAND_BUDGET, MATCH_DESTINATIONS } from '../src/data/metroDemand.ts';
import { tripsFor, tripsAt, validateTrip, phaseOf, type Trip, type TripPhase } from '../src/systems/MetroDemand.ts';
import type { PassengerState } from '../src/systems/PassengerAI.ts';
import { LINES, STOPS } from '../src/data/transit.ts';
import { routeBetween } from '../src/systems/Transit.ts';
import { isWeekend, weekdayOf } from '../src/systems/Calendar.ts';
import { weatherAt } from '../src/systems/Weather.ts';
import { matchOn } from '../src/systems/Match.ts';

const ids = (ts: readonly Trip[]) => ts.map((t) => t.tripId).join(',');
const count = (day: number, hour: number) => tripsFor(day, hour).length;

// Determinismo y unicidad en la semana. tripsFor memoiza la última hora: se alterna para forzar el recálculo.
const seen = new Set<string>();
for (let day = 1; day <= 7; day++) {
  for (let hour = 0; hour < 24; hour++) {
    const a = ids(tripsFor(day, hour));
    tripsFor(day + 100, hour);
    assert.equal(ids(tripsFor(day, hour)), a, `día ${day} ${hour}h determinista`);
    const ts = tripsFor(day, hour);
    assert.ok(ts.length <= DEMAND_BUDGET.maxTripsPerBand, 'tope por franja');
    for (const t of ts) {
      assert.ok(validateTrip(t), `viaje válido ${t.tripId}`);
      assert.ok(routeBetween(t.originId, t.destinationId), `ruta ${t.originId}>${t.destinationId}`);
      assert.ok(!seen.has(t.tripId), `tripId repetido ${t.tripId}`);
      seen.add(t.tripId);
    }
  }
}

const weekday = [1, 2, 3, 4, 5, 6, 7].find((d) => !isWeekend(d))!;
// El último día de fin de semana de la primera semana: el domingo (Calendar: weekIndex 5 y 6 son fin de semana).
const sunday = [1, 2, 3, 4, 5, 6, 7].filter(isWeekend).at(-1)!;
assert.ok(count(weekday, 8) > count(weekday, 3), 'entre semana, 8h > 3h');
assert.ok(count(weekday, 18) > count(weekday, 15), 'entre semana, 18h > 15h');
assert.ok(count(sunday, 8) < count(weekday, 8), 'fin de semana 8h < laborable 8h');

const base: Trip = tripsFor(weekday, 8)[0];
assert.equal(validateTrip({ ...base, originId: 'missing' }), false, 'parada inexistente');
assert.equal(validateTrip({ ...base, destinationId: base.originId }), false, 'origen = destino');
assert.equal(validateTrip({ ...base, state: 'volando' as Trip['state'] }), false, 'fase inválida');

// Lluvia: un laborable con lluvia a las 8h y otro seco.
const days = Array.from({ length: 730 }, (_, i) => i + 1).filter((d) => !isWeekend(d));
const wet = days.find((d) => weatherAt(d, 8).rain > 0);
const dry = days.find((d) => weatherAt(d, 8).rain === 0);
assert.ok(wet !== undefined && dry !== undefined, 'hay un laborable con lluvia y uno seco a las 8h');
assert.ok(count(wet, 8) >= count(dry, 8), 'lluvia ≥ seco');
assert.ok(count(wet, 8) > count(dry, 8), 'la lluvia sube la demanda');

// Partido: más viajes hacia el estadio que un día del mismo tipo sin partido.
const toStadium = (day: number) => {
  let n = 0;
  for (let h = 0; h < 24; h++) n += tripsFor(day, h).filter((t) => MATCH_DESTINATIONS.includes(t.destinationId)).length;
  return n;
};
const all = Array.from({ length: 365 }, (_, i) => i + 1);
const matchDay = all.find((d) => matchOn(d) !== null);
assert.ok(matchDay !== undefined, 'hay algún día de partido');
const quiet = all.find((d) => matchOn(d) === null && isWeekend(d) === isWeekend(matchDay) && weekdayOf(d) === weekdayOf(matchDay))
  ?? all.find((d) => matchOn(d) === null && isWeekend(d) === isWeekend(matchDay));
assert.ok(quiet !== undefined, 'hay un día comparable sin partido');
assert.ok(toStadium(matchDay) > toStadium(quiet), `partido (día ${matchDay}) > sin partido (día ${quiet}) hacia el estadio`);

// Transbordos: al menos un viaje cambia de línea y su fase en ese andén es «transbordando».
const transfer = tripsFor(weekday, 8).find((t) => t.routeId.split('>').length > 2);
assert.ok(transfer, 'algún viaje transborda');
const mid = transfer.routeId.split('>')[1];
assert.equal(phaseOf('WAITING', transfer, mid), 'transbordando');
assert.equal(phaseOf('WAITING', transfer, transfer.originId), 'esperando');
assert.equal(phaseOf('ENTERING_STATION', transfer, transfer.originId), 'llegando');
assert.equal(phaseOf('RIDING', transfer, transfer.originId), 'abordando');
assert.equal(phaseOf('EXITING_TRAIN', transfer, transfer.destinationId), 'bajando');
assert.equal(phaseOf('LEAVING_STATION', transfer, transfer.destinationId), 'saliendo');

// tripsAt: sólo los que pasan por ese andén.
for (const stop of ['puerta-central', 'puerta-central-l3', 'luna', 'arena']) {
  const at = tripsAt(stop, weekday, 8);
  assert.ok(at.every((t) => t.routeId.split('>').includes(stop)), `tripsAt ${stop}`);
  assert.equal(at.length, tripsFor(weekday, 8).filter((t) => t.routeId.split('>').includes(stop)).length);
}
assert.ok(tripsAt('puerta-central', weekday, 8).length > 0, 'Puerta Central tiene viajes en hora punta');

// (a) Cada andén con estación tiene viajes en cada hora con servicio (LINES.hours), días 1 y 7.
const HUB = 'puerta-central';
const served = Array.from({ length: 24 }, (_, h) => h).filter((h) => LINES.some((l) => h >= l.hours[0] && h < l.hours[1]));
assert.ok(served.length > 0, 'hay horas de servicio');
for (const day of [1, 7]) {
  for (const stop of STOPS.filter((s) => s.station)) {
    for (const h of served) assert.ok(tripsAt(stop.id, day, h).length >= 1, `${stop.id} sin viajes el día ${day} a las ${h}h`);
  }
}

// (b) Punta (8h) frente a valle (14h) en un laborable: en el andén y en el total, al menos el doble.
assert.ok(tripsAt(HUB, weekday, 8).length > tripsAt(HUB, weekday, 14).length, `${HUB}: 8h > 14h`);
assert.ok(count(weekday, 8) >= 2 * count(weekday, 14), `total 8h (${count(weekday, 8)}) ≥ 2 × 14h (${count(weekday, 14)})`);

// (c) phaseOf para cada PassengerState. El Record obliga a listar todos: un estado nuevo no compila sin su fila.
const PHASE_OF: Record<PassengerState, TripPhase> = {
  OFFSTAGE: 'saliendo',
  ENTERING_STATION: 'llegando',
  WALKING_TO_PLATFORM: 'llegando',
  WAITING: 'esperando',
  REACTING_TO_TRAIN: 'esperando',
  BOARDING: 'abordando',
  RIDING: 'abordando',
  EXITING_TRAIN: 'bajando',
  LEAVING_STATION: 'saliendo',
  DETAINED: 'saliendo',
};
for (const [state, phase] of Object.entries(PHASE_OF) as [PassengerState, TripPhase][]) {
  assert.equal(phaseOf(state, transfer, transfer.originId), phase, `phaseOf ${state} en el origen`);
}
for (const state of ['WAITING', 'REACTING_TO_TRAIN'] as const) {
  assert.equal(phaseOf(state, transfer, mid), 'transbordando', `phaseOf ${state} en el transbordo ${mid}`);
}

console.log(`check-metro-demand: OK · ${seen.size} viajes en la semana · transbordo ${transfer.routeId} · partido día ${matchDay}`);
