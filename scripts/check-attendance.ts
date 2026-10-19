// La visita al estadio de punta a punta, en las costuras de verdad (systems/Tickets, Match, MatchPlay, Concourse,
// Crowd, SaveSystem): comprar una vez, entrar, salir antes y volver sin pagar, el marcador igual se mire, no se mire o
// se salte el rato, el descanso y el pitido final en la misma hora para el estadio, el quiosco, la explanada, los bares y
// el metro, el partido de las 21:00 pasada la medianoche, entradas caducadas y partidas antiguas, el camino asiento →
// quiosco → puerta → explanada → metro y bares, y la grada que se vacía al final sin crecer al entrar y salir.
// Llamado desde la cadena `check` de package.json. `node scripts/check-attendance.ts`.
import assert from 'node:assert/strict';
import { ARENA_MATCHES } from '../src/data/cityEvents.ts';
import { KIOSK_WINDOWS } from '../src/data/concourse.ts';
import { HALVES, LIVE_END } from '../src/data/matchPlay.ts';
import { ESTADIO_HALCON as V, STADIUM, STADIUM_PROFILE } from '../src/data/stadium.ts';
import { FULLTIME_EXIT } from '../src/data/standLife.ts';
import { kioskService } from '../src/systems/Concourse.ts';
import { Crowd } from '../src/systems/Crowd.ts';
import { getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { matchMetroShift, matchNow, matchOn, matchPhase } from '../src/systems/Match.ts';
import { announcement, fixtureAt, nextMoment, stageAt, stateAt, timelineOf } from '../src/systems/MatchPlay.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { isOpen, placeForInterior, placeInfo } from '../src/systems/Places.ts';
import { createInitialState, restore } from '../src/systems/SaveSystem.ts';
import { admit, buyTicket, fixtureId, heldSeat, mayStay, parseTickets, type Clock, type Ticket } from '../src/systems/Tickets.ts';

const DAY = 1440;
const clockAt = (abs: number): Clock => ({ day: Math.floor(abs / DAY) + 1, hour: Math.floor((abs % DAY) / 60), minute: Math.floor(abs % 60) });
const days = Array.from({ length: 200 }, (_, i) => i + 1);
const fixtures = days.filter((d) => matchOn(d) && !matchOn(d + 1)).map((d) => timelineOf(matchOn(d)!));
const late = fixtures.find((tl) => tl.match.kickoff === 21 * 60);
assert.ok(late, 'no hay ningún partido a las 21:00 en el calendario');

// ------------------------------------------------------------ 1. una visita: comprar una vez, entrar, salir, volver
{
  const tl = fixtures[0];
  const k = tl.kickoff;
  const id = fixtureId(V, tl.match.day);
  const buy = buyTicket(V, 60, [], clockAt(k - 6 * 60));
  assert.ok(buy.ok && buy.money === 60 - V.price && buy.ticket!.fixture === id, `compra: ${buy.message}`);
  const twice = buyTicket(V, buy.money, buy.tickets, clockAt(k - 60));
  assert.ok(!twice.ok && twice.money === buy.money && twice.tickets.length === 1, 'se cobra dos veces el mismo partido');
  const gate = admit(V, buy.tickets, clockAt(k - 30));
  assert.ok(gate.ok && !gate.again, 'no se entra con la entrada a su hora');
  let tickets: Ticket[] = gate.ok ? gate.tickets : [];
  // Sale en el descanso y vuelve: la misma entrada, sin cobrar; el asiento sigue siendo suyo.
  const back = admit(V, tickets, clockAt(k + HALVES.first.to + 3));
  assert.ok(back.ok && back.again && back.tickets.length === 1, 'volver a entrar en el mismo partido no funciona');
  tickets = back.ok ? back.tickets : tickets;
  assert.equal(heldSeat(V, tickets, clockAt(k + HALVES.second.from + 10)), buy.ticket!.point, 'al volver, el asiento ya no es suyo');
  assert.equal(buyTicket(V, buy.money, tickets, clockAt(k + 20)).money, buy.money, 'volver cobra algo');
  // Con el pitido final ya no se entra; dentro se puede estar hasta el cierre, y no más.
  assert.ok(!admit(V, tickets, clockAt(k + LIVE_END)).ok, 'se entra tras el pitido final');
  assert.ok(mayStay(V, tickets, clockAt(k + LIVE_END + 20)) && !mayStay(V, tickets, clockAt(k + V.closes)), 'quedarse tras el final no acaba en el cierre');
  // La entrada caducada no vale para el siguiente partido ni lo compra sola: el siguiente se compra (una vez) aparte.
  const next = fixtures.find((f) => f.match.day > tl.match.day + 1)!;
  const nk = next.kickoff;
  const old = admit(V, tickets, clockAt(nk - 30));
  assert.ok(!old.ok, 'la entrada de otro partido abre la puerta');
  assert.ok(!mayStay(V, tickets, clockAt(nk + 10)) && heldSeat(V, tickets, clockAt(nk + 10)) === undefined, 'la entrada vieja da derecho a estar o asiento');
  const second = buyTicket(V, 100, tickets, clockAt(nk - 6 * 60));
  assert.ok(second.ok && second.money === 100 - V.price && second.tickets.filter((t) => t.fixture === fixtureId(V, next.match.day)).length === 1, 'el siguiente partido no se compra bien');
}

// ------------------------------------------------------------ 2. el marcador: se mire, no se mire o se salte el rato
for (const tl of fixtures) {
  const k = tl.kickoff;
  const final = stateAt(tl, k + LIVE_END).score;
  assert.deepEqual(final, [...tl.final], 'el marcador del final no es el del partido');
  // Mirando (pasos de reloj de un fotograma largo): cada gol se cuenta una vez y la suma es el final.
  let seen = 0;
  for (let a = k - 30, b = a + 0.4; b <= k + LIVE_END + 5; a = b, b += 0.4) {
    const ann = announcement(tl, a, b);
    if (ann.kind === 'seen') seen += ann.moments.filter((m) => m.goal).length;
    assert.notEqual(ann.kind, 'missed', 'un paso de mirar cuenta como salto');
  }
  assert.equal(seen, final[0] + final[1], 'mirando se cuentan más o menos goles');
  // A saltos («ver hasta el próximo momento»): se llega al final por el mismo marcador, sin pasarse.
  let abs = k - 5;
  for (let n = 0, j = nextMoment(tl, abs); j && n < 40; n++, j = nextMoment(tl, abs)) {
    assert.ok(j.abs <= k + LIVE_END + 1e-9, 'el salto se pasa del final');
    abs = j.abs;
  }
  assert.ok(abs >= k + LIVE_END - 1 && nextMoment(tl, abs) === null, 'a saltos no se llega al final');
  assert.deepEqual(stateAt(tl, k + LIVE_END + 30).score, final, 'tras dormir o irse, el marcador cambia');
  // Sin mirar (otra escena, el metro): el mismo marcador a cualquier hora.
  for (const t of [10, HALVES.first.to + 1, 80, LIVE_END + 40]) assert.deepEqual(stateAt(tl, k + t).score, stateAt(timelineOf(matchOn(tl.match.day)!), k + t).score);
}

// ------------------------------------------------------------ 3. el descanso y el pitido final, a la misma hora para todos
assert.equal(LIVE_END, ARENA_MATCHES.phases.live[1], 'el final de la grada no es el de la ciudad');
assert.equal(V.lastEntry, ARENA_MATCHES.phases.live[1], 'la puerta cierra a otra hora que el final');
for (const tl of [fixtures[0], late!]) {
  const k = tl.kickoff;
  const c = (t: number): Clock => clockAt(k + t);
  // Un instante antes y uno después de cada frontera: todos cambian a la vez.
  assert.equal(stageAt(LIVE_END - 0.01), 'second');
  assert.equal(stageAt(LIVE_END), 'full');
  assert.equal(matchPhase(c(LIVE_END - 1)), 'live');
  assert.equal(matchPhase(c(LIVE_END)), 'leaving', 'la ciudad no sale con el pitido final');
  assert.ok(matchMetroShift('arena', c(LIVE_END)) > matchMetroShift('arena', c(LIVE_END - 1)), 'el metro del Arena no se llena al final');
  assert.ok(kioskService(KIOSK_WINDOWS, tl, k + HALVES.first.to).open && !kioskService(KIOSK_WINDOWS, tl, k + HALVES.first.to - 0.01).open, 'el quiosco no abre con el descanso');
  assert.ok(!kioskService(KIOSK_WINDOWS, tl, k + HALVES.second.from).open, 'el quiosco sigue con la segunda parte');
  assert.ok(!kioskService(KIOSK_WINDOWS, tl, k + LIVE_END).open, 'el quiosco abre tras el final');
  // Los bares del Arena abren a la salida (la gente que va «camino del bar» tiene adónde ir).
  for (const bar of ['ar-larguero', 'ar-grada']) {
    const at = c(LIVE_END + 20);
    assert.ok(isOpen(placeInfo(bar)!, at.day, at.hour, at.minute), `${bar} cerrado a la salida del partido de las ${tl.match.kickoff / 60}`);
  }
}

// ------------------------------------------------------------ 4. el de las 21:00, pasada la medianoche
{
  const tl = late!;
  const k = tl.kickoff;
  const after = clockAt(k + 3 * 60 + 30); // 00:30 del día siguiente
  assert.equal(after.day, tl.match.day + 1);
  assert.equal(matchNow(after)?.day, tl.match.day, 'pasada la medianoche, la ciudad olvida el partido de anoche');
  assert.equal(matchPhase(after), 'after');
  assert.equal(fixtureAt(k + LIVE_END + 30), tl, 'el partido de esta noche no es el de la grada');
  const tickets = buyTicket(V, 30, [], clockAt(k - 120)).tickets;
  const used = admit(V, tickets, clockAt(k - 10));
  assert.ok(used.ok);
  // Ni el día siguiente vale, ni carga dentro con derecho, ni se cobra nada.
  assert.ok(!admit(V, used.ok ? used.tickets : [], after).ok, 'pasada la medianoche se entra');
  const inside = { ...createInitialState(), ...after, money: 12.3, locationId: 'ar-estadio', tickets: used.ok ? used.tickets : [] };
  const loaded = restore(inside);
  assert.ok(loaded.locationId === 'arena' && loaded.money === 12.3 && loaded.tickets?.length === 1, 'cargar dentro pasada la medianoche no saca a la explanada');
}

// ------------------------------------------------------------ 5. partidas antiguas y recuperación
{
  const tl = fixtures[0];
  const base = createInitialState();
  const kept = { ...base, money: 41, inventory: { ...base.inventory, water: 2 }, appearance: base.appearance };
  // Una partida de antes de las entradas, guardada dentro del estadio: fuera, con todo lo demás igual.
  const { tickets: _drop, ...noTickets } = { ...kept, ...clockAt(tl.kickoff + 30), locationId: 'ar-estadio', position: { x: 12 * 16 + 8, y: 13 * 16 } };
  const old = restore(noTickets as typeof kept);
  assert.equal(old.locationId, 'arena', 'una partida antigua dentro del estadio deja dentro sin entrada');
  assert.ok(old.money === 41 && old.inventory.water === 2 && JSON.stringify(old.appearance) === JSON.stringify(base.appearance), 'la recuperación toca el dinero, la mochila o la ropa');
  const spawn = getLocation('arena').spawns['ar-estadio'];
  assert.ok(isWalkable(getLocation('arena'), Math.floor(old.position.x / 16), Math.floor((old.position.y - 1) / 16)) && spawn, 'se recupera en un sitio que no se pisa');
  // Entradas de una versión anterior (sin «admitted»): se leen, no dan paso hecho y no se duplican.
  const t = buyTicket(V, 30, [], clockAt(tl.kickoff - 120)).ticket!;
  const { admitted: _a, ...legacy } = t;
  const parsed = parseTickets([legacy, legacy]);
  assert.equal(parsed.length, 1, 'una entrada antigua repetida se duplica');
  assert.equal(parsed[0].admitted, false, 'una entrada antigua cuenta como usada');
  // Guardado sentado: se guarda donde estaba de pie; si cae en un asiento, la carga lo saca al pasillo.
  const seat = getLocation('ar-estadio').points![t.point];
  const seated = restore({ ...kept, ...clockAt(tl.kickoff + 30), locationId: 'ar-estadio', tickets: [{ ...t, admitted: true }], position: { x: seat.tx * 16 + 8, y: (seat.ty + 1) * 16 - 2 } });
  assert.equal(seated.locationId, 'ar-estadio');
  assert.ok(isWalkable(getLocation('ar-estadio'), Math.floor(seated.position.x / 16), Math.floor((seated.position.y - 1) / 16)), 'cargar sentado deja encima del asiento');
}

// ------------------------------------------------------------ 6. el camino: asiento → quiosco → puerta → explanada → metro y bares
const reach = (locId: string, from: { tx: number; ty: number }): Set<string> => {
  const loc = getLocation(locId);
  const seen = new Set([`${from.tx},${from.ty}`]);
  const q = [[from.tx, from.ty]];
  while (q.length) {
    const [x, y] = q.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (seen.has(k) || !isWalkable(loc, x + dx, y + dy)) continue;
      seen.add(k);
      q.push([x + dx, y + dy]);
    }
  }
  return seen;
};
const near = (seen: Set<string>, p: { tx: number; ty: number }): boolean => [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => seen.has(`${p.tx + dx},${p.ty + dy}`));
{
  const inside = getLocation('ar-estadio');
  const seen = reach('ar-estadio', STADIUM.spawns.entry);
  const kiosk = STADIUM.terminals!.find((t) => t.serves)!;
  assert.ok(seen.has(`${kiosk.tx},${kiosk.ty + 1}`), 'no se llega al quiosco desde la puerta');
  for (const s of V.seats) assert.ok(near(seen, inside.points![s.point]), `${s.point}: no se llega`);
  const exit = inside.portals.find((p) => p.to.location === 'arena')!;
  assert.ok(exit && near(seen, exit), 'no se llega a la salida');
  const plaza = reach('arena', getLocation('arena').spawns[exit.to.spawn]);
  const arena = getLocation('arena');
  for (const to of ['arena-station', 'ar-larguero', 'ar-grada']) {
    const door = arena.portals.find((p) => p.to.location === to);
    assert.ok(door && near(plaza, door), `desde la Puerta 3 no se llega a ${to}`);
  }
}

// ------------------------------------------------------------ 7. la grada al final, y entrar y salir muchas veces
{
  const tl = fixtures[0];
  const k = tl.kickoff;
  const loc = getLocation('ar-estadio');
  const place = placeForInterior('ar-estadio')!;
  const player = { tx: 12, ty: 10 };
  const budget = STADIUM_PROFILE.maxVisitors + STADIUM_PROFILE.staff.length;
  // Entrar y salir diez veces en el mismo minuto: la misma gente, nunca más del tope, sin dos en el mismo asiento.
  const counts = new Set<number>();
  for (let i = 0; i < 10; i++) {
    const crowd = new Crowd(loc, place, STADIUM_PROFILE, seededRng(9));
    crowd.populate(clockAt(k + 30), player);
    counts.add(crowd.agents.length);
    assert.ok(crowd.agents.length <= budget, `la grada pasa del tope (${crowd.agents.length})`);
  }
  assert.equal(counts.size, 1, 'entrar otra vez en el mismo minuto cambia cuánta gente hay');
  // Del minuto 100 al cierre a ritmo de juego (2 minutos por segundo): con el pitido, oleada (una vez); luego no entra nadie.
  const crowd = new Crowd(loc, place, STADIUM_PROFILE, seededRng(5));
  crowd.populate(clockAt(k + 100), player);
  const before = crowd.agents.filter((a) => a.kind === 'visitor').length;
  let ids = new Set(crowd.agents.map((a) => a.id));
  let wave = 0;
  let entered = 0;
  for (let t = 100; t < V.closes; t += 0.2) {
    if (t >= LIVE_END && wave === 0) {
      const leaders = crowd.agents.filter((a) => a.kind === 'visitor' && !a.leader && a.point?.startsWith(FULLTIME_EXIT.from)).length;
      wave = crowd.disperse(Math.ceil(leaders * FULLTIME_EXIT.share), FULLTIME_EXIT.from, FULLTIME_EXIT.stagger);
      assert.equal(crowd.disperse(99, FULLTIME_EXIT.from, FULLTIME_EXIT.stagger) <= leaders - wave, true, 'la oleada se da dos veces a los mismos');
    }
    crowd.update(100, clockAt(k + t), player);
    for (const a of crowd.agents) if (!ids.has(a.id) && a.kind === 'visitor') entered += t >= LIVE_END ? 1 : 0;
    ids = new Set(crowd.agents.map((a) => a.id));
    assert.ok(crowd.agents.length <= budget, 'la grada pasa del tope al final');
  }
  const left = crowd.agents.filter((a) => a.kind === 'visitor').length;
  assert.ok(before >= 6 && wave >= 1, `sin gente o sin oleada al final (${before}, ${wave})`);
  assert.equal(entered, 0, 'entra gente nueva tras el pitido final');
  assert.ok(left <= Math.ceil(before * 0.4), `al cierre sigue casi toda la grada (${left} de ${before})`);
  console.log(`check-attendance: ok (${fixtures.length} partidos; grada al final ${before} → ${left}, oleada de ${wave} grupos; partido de las 21:00 el día ${late!.match.day})`);
}
