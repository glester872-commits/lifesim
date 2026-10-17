// El Estadio del Halcón por dentro (data/stadium.ts) y sus entradas (systems/Tickets): la taquilla, el pago todo o
// nada, la puerta con su política, volver a entrar, cargar dentro con el estadio cerrado, partidas antiguas, la grada
// (asientos, escalera, el césped que no se pisa) y el asiento del jugador apartado frente a la gente. Sin Phaser.
// Llamado desde la cadena `check` de package.json. `node scripts/check-stadium.ts`.
import assert from 'node:assert/strict';
import { ESTADIO_HALCON as V, STADIUM, STADIUM_PROFILE, STADIUM_SEATS } from '../src/data/stadium.ts';
import { getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { seatAt } from '../src/systems/Seating.ts';
import { matchOn, upcomingMatches } from '../src/systems/Match.ts';
import { admit, buyTicket, fixtureId, heldSeat, mayStay, nextFixture, offer, parseTickets, type Clock } from '../src/systems/Tickets.ts';
import { createInitialState, restore } from '../src/systems/SaveSystem.ts';
import { placeForInterior } from '../src/systems/Places.ts';
import { Crowd, profileFor } from '../src/systems/Crowd.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { handoffPlace } from '../src/systems/Handoff.ts';

const at = (day: number, minuteOfDay: number): Clock => ({ day: day + Math.floor(minuteOfDay / 1440), hour: Math.floor((((minuteOfDay % 1440) + 1440) % 1440) / 60), minute: ((minuteOfDay % 60) + 60) % 60 });

// ------------------------------------------------------------ 1. la grada: datos, paso y césped
const loc = getLocation('ar-estadio');
const arena = getLocation('arena');
assert.equal(V.capacity, STADIUM_SEATS.length, 'el aforo a la venta no es el de los asientos');
assert.equal(new Set(V.seats.map((s) => s.point)).size, V.capacity, 'asientos repetidos en el orden de venta');
for (const s of STADIUM_SEATS) {
  const seat = seatAt(s.point);
  assert.ok(seat && seat.furniture === 'stadium-seat' && seat.facing === 'up', `${s.point}: no es un asiento mirando al campo`);
}
// La puerta del estadio es un portal de datos, como la de cualquier local, y la salida devuelve a su puerta.
const door = arena.portals.find((p) => p.to.location === 'ar-estadio');
assert.ok(door && door.id === 'ar-estadio', 'la fachada no tiene puerta al estadio');
const back = arena.spawns['ar-estadio'];
assert.ok(back && isWalkable(arena, back.tx, back.ty), 'la vuelta a la explanada no es pisable');
assert.ok(loc.portals.some((p) => p.to.location === 'arena' && p.to.spawn === 'ar-estadio'), 'la salida no da a la Puerta 3');
// Desde la entrada se llega a todo (vestíbulo, escalera, cada fila) y nunca al césped.
const key = (x: number, y: number): string => `${x},${y}`;
const seen = new Set([key(STADIUM.spawns.entry.tx, STADIUM.spawns.entry.ty)]);
const queue = [[STADIUM.spawns.entry.tx, STADIUM.spawns.entry.ty]];
while (queue.length) {
  const [x, y] = queue.shift()!;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (seen.has(key(x + dx, y + dy)) || !isWalkable(loc, x + dx, y + dy)) continue;
    seen.add(key(x + dx, y + dy));
    queue.push([x + dx, y + dy]);
  }
}
const pitch: string[] = [];
loc.ground.forEach((row, y) => [...row].forEach((ch, x) => (ch === 'G' || ch === 'J') && pitch.push(key(x, y))));
assert.ok(pitch.length > 100, 'no hay césped que ver');
assert.ok(pitch.every((tile) => !seen.has(tile)), 'se puede pisar el césped');
// Cada asiento tiene al lado un tile al que se llega (se sienta desde ahí) y la escalera sube desde el vestíbulo.
for (const s of STADIUM_SEATS) {
  const p = loc.points![s.point];
  assert.ok([[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => seen.has(key(p.tx + dx, p.ty + dy))), `${s.point}: no se llega`);
}
assert.ok(seen.has(key(11, 9)) && seen.has(key(12, 17)), 'la escalera no sube a la grada');
// Detrás de cada fila, un pasillo de dos: se pasa por él sin rozar los asientos (el cuerpo del jugador es más bajo que una tile, pero no se le pide puntería).
for (const y of [9, 10, 12, 13, 15, 16]) for (let x = 1; x <= 22; x++) assert.ok(isWalkable(loc, x, y), `pasillo de la grada cortado en ${x},${y}`);
// Nadie aparece encima de un asiento: ni el jugador al entrar ni el personal.
const seatTiles = new Set(STADIUM_SEATS.map((s) => key(loc.points![s.point].tx, loc.points![s.point].ty)));
assert.ok(!seatTiles.has(key(STADIUM.spawns.entry.tx, STADIUM.spawns.entry.ty)), 'se entra encima de un asiento');
for (const [id, p] of Object.entries(loc.points!)) if (p.kind !== 'seat') assert.ok(!seatTiles.has(key(p.tx, p.ty)), `${id} encima de un asiento`);
// Quien cruza los tornos desde la calle no entra a la grada (tiene su propio público).
assert.equal(handoffPlace('ar-estadio'), undefined, 'la calle mete gente en la grada con estancia de local');

// ------------------------------------------------------------ 2. el calendario: partidos con id estable
const days = Array.from({ length: 120 }, (_, i) => i + 1);
const md = days.find((d) => matchOn(d) && !matchOn(d - 1))!;
const m = matchOn(md)!;
const kick = m.kickoff;
assert.equal(fixtureId(V, md), `estadio-halcon:${md}`);
assert.equal(nextFixture(V, at(md, 600))?.id, fixtureId(V, md), 'el partido de hoy no es el que se vende');
assert.equal(nextFixture(V, at(md, 600))?.rival, m.rival, 'el partido de la taquilla no es el del calendario');
const quiet = days.find((d) => upcomingMatches(d - 1, V.horizon + 1).length === 0);
assert.ok(quiet, 'no hay ninguna semana sin partido en cuatro meses (no se puede probar «sin partido»)');

// ------------------------------------------------------------ 3. la taquilla: estados y compra todo o nada
assert.equal(offer(V, [], at(quiet!, 12 * 60)).kind, 'none', 'sin partido a la vista, la taquilla vende algo');
assert.equal(offer(V, [], at(md, 3 * 60)).kind, 'closed', 'de madrugada, la taquilla vende');
const noon = at(md, 12 * 60);
const sale = offer(V, [], noon);
assert.equal(sale.kind, 'on-sale');
assert.equal(offer({ ...V, capacity: 0 }, [], noon).kind, 'sold-out', 'sin entradas libres, se vende igual');
const broke = buyTicket(V, 10, [], noon);
assert.ok(!broke.ok && broke.money === 10 && broke.tickets.length === 0, 'sin dinero cobra o emite');
const bought = buyTicket(V, 40, [], noon);
assert.ok(bought.ok && bought.money === 15 && bought.tickets.length === 1, `compra: ${bought.message}`);
const t = bought.ticket!;
assert.equal(t.fixture, fixtureId(V, md));
assert.ok(sale.kind === 'on-sale' && t.point === sale.point && t.row === sale.row && t.seat === sale.seat, 'el asiento vendido no es el anunciado');
const again = buyTicket(V, bought.money, bought.tickets, noon);
assert.ok(!again.ok && again.money === 15 && again.tickets.length === 1, 'la segunda compra del mismo partido cobra o duplica');
assert.equal(offer(V, bought.tickets, noon).kind, 'owned');
// El día de partido se vende hasta el último acceso, aunque pase de la hora de cierre de la taquilla.
assert.equal(offer(V, [], at(md, kick + V.lastEntry - 1)).kind, 'on-sale', 'con el partido en juego no se vende');
assert.notEqual(offer(V, [], at(md, kick + V.lastEntry)).fixture?.id, fixtureId(V, md), 'acabado el plazo de entrada, se sigue vendiendo el de hoy');

// ------------------------------------------------------------ 4. la puerta: la política de acceso
const mine = bought.tickets;
const none = admit(V, [], at(md, kick - 30));
assert.ok(!none.ok && /Sin entrada/.test(none.lines.join(' ')), 'sin entrada se pasa');
const early = admit(V, mine, at(md, kick + V.doors - 1));
assert.ok(!early.ok && /abren/.test(early.lines.join(' ')), 'demasiado pronto, se pasa');
const inTime = admit(V, mine, at(md, kick - 30));
assert.ok(inTime.ok && !inTime.again && inTime.tickets[0].admitted, 'con entrada y a su hora, no se pasa');
const late = admit(V, mine, at(md, kick + 60));
assert.ok(late.ok, 'llegar tarde con el partido en juego no deja pasar');
const after = admit(V, inTime.ok ? inTime.tickets : [], at(md, kick + V.lastEntry));
assert.ok(!after.ok && /terminado/.test(after.lines.join(' ')), 'tras el pitido final se entra');
const shut = admit(V, inTime.ok ? inTime.tickets : [], at(md, kick + V.closes + 5));
assert.ok(!shut.ok && /ya ha terminado/.test(shut.lines.join(' ')), `con el estadio cerrado, la puerta no dice que el partido de hoy ha terminado: ${shut.lines}`);
// Salir y volver a entrar: la misma entrada, sin cobrar nada (la puerta nunca cobra).
const used = inTime.ok ? inTime.tickets : [];
const reentry = admit(V, used, at(md, kick + 20));
assert.ok(reentry.ok && reentry.again && reentry.tickets.length === 1, 'volver a entrar no funciona o duplica');
// La entrada de otro partido no vale hoy; tampoco un día sin partido.
const other = days.find((d) => d > md + 1 && matchOn(d) && !matchOn(d - 1))!;
const otherTicket = buyTicket(V, 100, [], at(other, 12 * 60)).tickets;
assert.equal(otherTicket.length, 1);
const wrong = admit(V, otherTicket, at(md, kick - 30));
assert.ok(!wrong.ok && /Esta entrada es del partido/.test(wrong.lines.join(' ')), 'con la entrada de otro partido se pasa');
const off = days.find((d) => d > md && !matchOn(d) && !matchOn(d - 1))!;
const noMatch = admit(V, mine, at(off, 18 * 60));
assert.ok(!noMatch.ok && /no hay partido|no se juega/i.test(noMatch.lines.join(' ')), 'un día sin partido se pasa');

// ------------------------------------------------------------ 5. dentro: quedarse, el asiento y la carga de partida
assert.ok(mayStay(V, used, at(md, kick + 100)), 'con la entrada usada no se puede estar durante el partido');
assert.ok(!mayStay(V, mine, at(md, kick)), 'sin haber pasado por la puerta se puede estar dentro');
assert.ok(!mayStay(V, used, at(md, kick + V.closes)), 'el estadio no cierra');
assert.equal(heldSeat(V, used, at(md, kick + 30)), t.point, 'el asiento de la entrada no está apartado');
assert.equal(heldSeat(V, used, at(md, kick + V.closes)), undefined, 'el asiento sigue apartado con el estadio cerrado');
const inside = { ...createInitialState(), money: 77.5, locationId: 'ar-estadio', position: { x: 12 * 16 + 8, y: 13 * 16 }, tickets: used };
const duringGame = restore({ ...inside, ...at(md, kick + 30) });
assert.equal(duringGame.locationId, 'ar-estadio', 'cargar dentro con el partido en juego echa fuera');
const closed = restore({ ...inside, ...at(md, kick + V.closes + 5) });
assert.ok(closed.locationId === 'arena' && closed.money === 77.5 && closed.tickets?.length === 1, 'cargar con el estadio cerrado no saca a la explanada o toca el dinero');
assert.deepEqual([Math.floor(closed.position.x / 16), Math.floor((closed.position.y - 1) / 16)], [back.tx, back.ty], 'no sale a la Puerta 3');
const noTicket = restore({ ...inside, ...at(md, kick + 30), tickets: [] });
assert.equal(noTicket.locationId, 'arena', 'sin entrada, cargar dentro deja dentro');

// ------------------------------------------------------------ 6. partidas antiguas y entradas tocadas a mano
assert.deepEqual(parseTickets(undefined), [], 'una partida sin entradas no carga');
const junk: unknown[] = [null, 3, { venue: 'otro' }, { ...t, fixture: 'estadio-halcon:999' }, { ...t, point: 'NO_EXISTE' }, t, { ...t }];
assert.deepEqual(parseTickets(junk), [t], 'entradas mal formadas o repetidas pasan');

// ------------------------------------------------------------ 7. la grada con gente: el asiento del jugador, suyo
const place = placeForInterior('ar-estadio')!;
assert.ok(place && profileFor(place.id) === STADIUM_PROFILE, 'la grada no tiene su público');
const crowd = new Crowd(loc, place, STADIUM_PROFILE, seededRng(5));
const live = at(md, kick + 30);
crowd.claim(new Set([t.point]));
crowd.populate(live, { tx: 12, ty: 21 });
let peak = 0;
for (let ms = 0; ms < 120_000; ms += 100) {
  crowd.update(100, live, { tx: 12, ty: 21 });
  const sat = crowd.agents.filter((a) => a.point?.startsWith('ESTADIO_SEAT_'));
  peak = Math.max(peak, sat.length);
  assert.ok(!crowd.agents.some((a) => a.point === t.point), 'alguien de la grada coge el asiento del jugador');
  const points = sat.map((a) => a.point);
  assert.equal(new Set(points).size, points.length, 'dos en el mismo asiento');
}
assert.ok(peak >= 6, `la grada está vacía durante el partido (${peak})`);

console.log(`Estadio: ${V.capacity} asientos en 3 filas, escalera y césped sin pisar; partido ${fixtureId(V, md)} (${m.rival}); compra ${t.sector} fila ${t.row} asiento ${t.seat} por €${t.price}; puerta: sin entrada, pronto, a tiempo, tarde, pitido final, otro partido, sin partido y vuelta OK; carga dentro y fuera OK; grada con ${peak} sentados sin tocar el asiento del jugador OK`);
