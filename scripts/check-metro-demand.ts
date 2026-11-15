import assert from 'node:assert/strict';
import { DEMAND_BUDGET, MATCH_DESTINATIONS } from '../src/data/metroDemand.ts';
import { balancedDepartures, orderAlighting, tripsFor, tripsAt, validateTrip, phaseOf, tripFor, tripFitsPhase, tripWantsTrain, trainHeadingFor, nextStopOf, type Trip, type TripPhase } from '../src/systems/MetroDemand.ts';
import type { PassengerState } from '../src/systems/PassengerAI.ts';
import { LINES, STOPS, TRANSFERS } from '../src/data/transit.ts';
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

// MOV-02 (1) tripFor: todo visible tiene viaje, determinista, único y sin chocar con tripsFor.
for (const day of [1, 7]) {
  for (const h of [3, 8, 14, 18, 23]) {
    const own = new Set(tripsFor(day, h).map((t) => t.tripId));
    for (const stop of STOPS.filter((s) => s.station)) {
      const got = new Set<string>();
      for (let seq = 0; seq < 60; seq++) {
        const t = tripFor(stop.id, day, h, seq);
        assert.ok(t, `tripFor ${stop.id} día ${day} ${h}h seq ${seq}`);
        assert.ok(validateTrip(t), `tripFor válido ${t.tripId}`);
        assert.ok(!got.has(t.tripId) && !own.has(t.tripId), `tripFor id único ${t.tripId}`);
        assert.ok(t.routeId.split('>').includes(stop.id), `tripFor pasa por ${stop.id}`);
        assert.deepEqual(tripFor(stop.id, day, h, seq), t, `tripFor determinista ${t.tripId}`);
        got.add(t.tripId);
      }
    }
  }
}

// (2) tripWantsTrain: sube en el sentido de su siguiente parada; en el andén de transbordo, no.
const ride: Trip = { ...base, originId: 'vallesco', destinationId: 'luna', routeId: 'vallesco>luna' };
assert.equal(tripWantsTrain(ride, 'vallesco', 1), true, 'hacia mayor order con +1');
assert.equal(tripWantsTrain(ride, 'vallesco', -1), false, 'no con -1');
const change: Trip = { ...base, originId: 'puerta-central', destinationId: 'decathlon-l3', routeId: 'puerta-central>puerta-central-l3>decathlon-l3' };
assert.equal(tripWantsTrain(change, 'puerta-central', 1), false, 'transbordo: no sube (+1)');
assert.equal(tripWantsTrain(change, 'puerta-central', -1), false, 'transbordo: no sube (-1)');
assert.equal(tripWantsTrain(change, 'puerta-central-l3', 1), true, 'tras el transbordo, L3 hacia mayor order');

// (3) trainHeadingFor: en las cabeceras, un único sentido para cualquier ciclo.
for (const line of new Set(STOPS.map((s) => s.line))) {
  const ofLine = STOPS.filter((s) => s.line === line).sort((a, b) => a.order - b.order);
  for (const [head, dir] of [[ofLine[0], 1], [ofLine.at(-1)!, -1]] as const) {
    for (let cycle = 0; cycle <= 5; cycle++) assert.equal(trainHeadingFor(head.id, cycle), dir, `cabecera ${head.id} ciclo ${cycle}`);
  }
}

// (4) nextStopOf: null en el destino.
assert.equal(nextStopOf(ride, 'luna'), null, 'destino sin siguiente');
assert.equal(nextStopOf(change, 'puerta-central'), 'puerta-central-l3');

// MOV-02 ciclo 2 (5) tripFitsPhase: coincide con nextStopOf en 'depart'; 'arrive' = destino o transbordo aquí.
assert.equal(tripFitsPhase(ride, 'vallesco', 'depart'), nextStopOf(ride, 'vallesco') !== null, 'depart en el origen');
assert.equal(tripFitsPhase(ride, 'luna', 'depart'), nextStopOf(ride, 'luna') !== null, 'depart en el destino');
assert.equal(tripFitsPhase(ride, 'luna', 'depart'), false, 'en el destino no sale');
assert.equal(tripFitsPhase(ride, 'luna', 'arrive'), true, 'llega a su destino');
assert.equal(tripFitsPhase(ride, 'vallesco', 'arrive'), false, 'no llega a su origen');
// Ciclo 3: 'depart' exige tren de la misma línea; el transbordo a pie hacia L3 no sale de este andén.
assert.equal(tripFitsPhase(change, 'puerta-central', 'depart'), false, 'transbordo: no sale en tren de L2');
assert.equal(tripFitsPhase(change, 'puerta-central-l3', 'depart'), true, 'tras el transbordo, sale en L3');
assert.equal(tripFitsPhase(change, 'puerta-central', 'arrive'), true, 'transbordo: llega para cambiar');
assert.equal(tripFitsPhase(change, 'puerta-central-l3', 'arrive'), true, 'llega al andén L3 por transbordo');
assert.equal(tripFitsPhase(change, 'luna', 'arrive'), false, 'fuera de la ruta');

// (6) tripFor con fase: nunca null, siempre coherente con lo que hace el pasajero, ids únicos por fase.
for (const day of [1, 7, 26]) {
  for (let h = 0; h < 24; h++) {
    for (const stop of ['decathlon', 'arena', 'vallesco', 'ribera', 'luna', 'puerta-central']) {
      for (const want of ['depart', 'arrive'] as const) {
        const got = new Set<string>();
        for (let seq = 0; seq <= 50; seq++) {
          const t = tripFor(stop, day, h, seq, want);
          assert.ok(t, `tripFor ${want} ${stop} día ${day} ${h}h seq ${seq} no nulo`);
          if (want === 'depart') {
            assert.ok(nextStopOf(t, stop) !== null, `depart ${stop} ${t.tripId} sin siguiente`);
            assert.ok(tripWantsTrain(t, stop, 1) || tripWantsTrain(t, stop, -1), `depart ${stop} ${t.tripId} no quiere ningún tren de este andén`);
          } else {
            // Comprobación independiente de tripFitsPhase: último nodo, o vecino unido por un TRANSFER.
            const nodes = t.routeId.split('>');
            const i = nodes.indexOf(stop);
            const tr = (n?: string) => !!n && TRANSFERS.some((x) => (x.from === stop && x.to === n) || (x.to === stop && x.from === n));
            assert.ok(i >= 0 && (i === nodes.length - 1 || tr(nodes[i - 1]) || tr(nodes[i + 1])), `arrive ${stop} ${t.tripId} ni termina ni transborda`);
          }
          assert.ok(validateTrip(t), `tripFor ${want} válido ${t.tripId}`);
          assert.ok(!got.has(t.tripId), `tripFor ${want} id único ${t.tripId}`);
          got.add(t.tripId);
        }
      }
    }
  }
}

// MOV-02 ciclo 3 (7) Regresión del navegador (decathlon, día 26, 8h: 0 subidas). Los 'depart' de un andén quieren
// algún tren de ese andén, nunca van a pie a otro andén, y en las paradas centrales hay de cada sentido.
const transferNodes = (stop: string) => new Set(TRANSFERS.flatMap((x) => (x.from === stop ? [x.to] : x.to === stop ? [x.from] : [])));
for (const day of [1, 26]) {
  for (const h of [8, 18]) {
    for (const stop of ['decathlon', 'puerta-central', 'vallesco', 'arena', 'luna', 'campo-alto']) {
      const departs = [
        ...tripsAt(stop, day, h).filter((t) => tripFitsPhase(t, stop, 'depart')),
        ...Array.from({ length: 30 }, (_, seq) => tripFor(stop, day, h, seq, 'depart')!),
      ];
      assert.ok(departs.length > 0, `${stop} día ${day} ${h}h sin 'depart'`);
      const wanting = departs.filter((t) => tripWantsTrain(t, stop, 1) || tripWantsTrain(t, stop, -1)).length;
      assert.ok(wanting >= 0.8 * departs.length, `${stop} día ${day} ${h}h: ${wanting}/${departs.length} quieren tren`);
      const walk = transferNodes(stop);
      for (const t of departs) assert.ok(!walk.has(nextStopOf(t, stop)!), `${stop} ${t.tripId}: 'depart' hacia un transbordo`);
      // Cabecera: sólo el sentido posible; si no, los dos.
      const dirs = [trainHeadingFor(stop, 0), trainHeadingFor(stop, 1)];
      for (const dir of [1, -1] as const) {
        const n = departs.filter((t) => tripWantsTrain(t, stop, dir)).length;
        if (dirs.includes(dir)) {
          if (h === 8 && (stop === 'decathlon' || stop === 'puerta-central')) assert.ok(n > 0, `${stop} día ${day} 8h: nadie quiere ${dir}`);
        } else assert.equal(n, 0, `cabecera ${stop}: nadie quiere ${dir}`);
      }
    }
  }
}

// MOV-03 (8) Salidas balanceadas: con los dos sentidos en tripsAt, las 'depart' ordenadas tienen +1 y -1, y
// balancedDepartures es una permutación que abre con sentidos distintos.
const dirOf = (t: Trip, stop: string) => (tripWantsTrain(t, stop, 1) ? 1 : tripWantsTrain(t, stop, -1) ? -1 : 0);
for (const stop of ['decathlon', 'puerta-central']) {
  for (const day of [1, 7, 26]) {
    for (const h of [8, 18]) {
      const raw = tripsAt(stop, day, h);
      const bal = balancedDepartures(raw, stop);
      assert.equal(bal.length, raw.length, `${stop} día ${day} ${h}h: misma longitud`);
      assert.deepEqual([...bal.map((t) => t.tripId)].sort(), raw.map((t) => t.tripId).sort(), `${stop} día ${day} ${h}h: mismos tripId`);
      const deps = bal.filter((t) => tripFitsPhase(t, stop, 'depart'));
      const has = (list: readonly Trip[], d: 1 | -1) => list.some((t) => dirOf(t, stop) === d);
      if (has(raw, 1) && has(raw, -1)) {
        assert.ok(has(deps, 1) && has(deps, -1), `${stop} día ${day} ${h}h: balanceadas sin los dos sentidos`);
        assert.notEqual(dirOf(bal[0], stop), dirOf(bal[1], stop), `${stop} día ${day} ${h}h: los dos primeros, mismo sentido`);
      }
    }
  }
  // tripFor 'depart' con seq 0..19 el día 1 a las 8h: salen los dos sentidos.
  const dirs = new Set(Array.from({ length: 20 }, (_, seq) => dirOf(tripFor(stop, 1, 8, seq, 'depart')!, stop)));
  assert.ok(dirs.has(1) && dirs.has(-1), `tripFor depart ${stop} día 1 8h: sentidos ${[...dirs].join(',')}`);
}

// (9) orderAlighting: primero los que esperan tren y llegan aquí; permutación (nadie se pierde ni se duplica).
const arriving: Trip = { ...base, originId: 'vallesco', destinationId: 'luna', routeId: 'vallesco>luna' };
const leaving: Trip = { ...base, originId: 'luna', destinationId: 'vallesco', routeId: 'luna>vallesco' };
const crowd = [
  { id: 'a', waitingForTrain: false, trip: arriving },
  { id: 'b', waitingForTrain: true, trip: leaving },
  { id: 'c', waitingForTrain: true },
  { id: 'd', waitingForTrain: true, trip: arriving },
  { id: 'e', waitingForTrain: false },
  { id: 'f', waitingForTrain: true, trip: arriving },
];
const ordered = orderAlighting(crowd, 'luna', <U>(a: U[]) => a);
assert.deepEqual(ordered.map((p) => p.id), ['d', 'f', 'b', 'c', 'a', 'e'], 'orderAlighting: grupos en orden');
assert.equal(new Set(ordered).size, crowd.length, 'orderAlighting: sin perder ni duplicar');

console.log(`check-metro-demand: OK · ${seen.size} viajes en la semana · transbordo ${transfer.routeId} · partido día ${matchDay}`);
