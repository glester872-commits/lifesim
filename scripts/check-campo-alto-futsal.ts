// CA-02 (systems/Futsal.ts, data/futsal.ts): penaltis con los del barrio en la pista de Campo Alto, los sábados de
// 10 a 13. La portería es un prop de datos, el sitio se alcanza andando, la tanda es pura y el registro se guarda.
import assert from 'node:assert/strict';
import { getLocation, validate } from '../src/systems/LocationSystem.ts';
import { tilePath } from '../src/systems/Navigation.ts';
import { parseFitness, START_FITNESS } from '../src/systems/Fitness.ts';
import { FUTSAL, futsalWeek, isOpen, kickOutcome, parseFutsal, PenaltySession, recordTanda, type SessionEvent } from '../src/systems/Futsal.ts';
import { PITCHES } from '../src/data/futsal.ts';
import { STREET_PROFILES } from '../src/data/streets.ts';

const ID = 'campo-alto';
const street = getLocation(ID);
validate(street);

// La portería, dentro de la caja de la pista (x 5–11, y 16–20).
const props = street.props ?? [];
const goal = props.find((p) => p.kind === 'futsal-goal');
assert.ok(goal && goal.tx >= 5 && goal.tx <= 11 && goal.ty >= 16 && goal.ty <= 20, 'la portería no está en la pista');

// Sólo colisiona la fila base de cada prop (ponytail: anchos copiados de world/tiles.ts, como en check-campo-alto-sport).
const WIDE: Readonly<Record<string, number>> = { 'pullup-bar': 2 };
const blocked = new Set(props.flatMap((p) => Array.from({ length: WIDE[p.kind] ?? 1 }, (_, i) => `${p.tx + i},${p.ty}`)));

const points = street.points ?? {};
const spot = points.CA_FUTSAL_SPOT;
assert.ok(spot, 'falta CA_FUTSAL_SPOT');
assert.equal(spot.kind, 'interact', 'CA_FUTSAL_SPOT no es interact');
assert.equal(spot.use, undefined, 'CA_FUTSAL_SPOT no es un puesto del gimnasio: sin use');
assert.ok(!blocked.has(`${spot.tx},${spot.ty}`), 'CA_FUTSAL_SPOT está debajo de un prop');

// Se llega andando desde el metro y desde el café al sitio, a cada espera y a cada mesa del café; las canastas, igual.
const cafe = street.buildings!.find((b) => b.id === 'ca-cafe')!;
const out = getLocation('campo-alto-station').portals.find((p) => !p.train)!;
const metroSpawn = street.spawns[out.to.spawn];
const cafeSpawn = street.spawns[cafe.id];
assert.ok(metroSpawn && cafeSpawn, 'faltan los spawns del metro o del café');
const waits = Object.keys(points).filter((id) => id.startsWith('CA_FUTSAL_WAIT_'));
const meets = Object.keys(points).filter((id) => id.startsWith('CA_CAFE_MEET_'));
const hoops = Object.keys(points).filter((id) => id.startsWith('CA_HOOPS_'));
assert.equal(waits.length, 4, 'faltan esperas del fútbol');
assert.equal(meets.length, 2, 'faltan sitios en el café');
assert.equal(hoops.length, 2, 'las canastas han cambiado');
for (const id of ['CA_FUTSAL_SPOT', ...waits, ...meets, ...hoops]) {
  const pt = points[id];
  assert.ok(!blocked.has(`${pt.tx},${pt.ty}`), `${id} está debajo de un prop`);
  assert.ok(tilePath(street, metroSpawn, pt), `${id}: no se llega desde el metro`);
  assert.ok(tilePath(street, cafeSpawn, pt), `${id}: no se llega desde el café`);
}

// El horario: día 1 = lunes, así que el 6 es sábado, el 5 viernes y el 7 domingo.
const pitch = PITCHES[ID]?.CA_FUTSAL_SPOT;
assert.ok(pitch, 'falta la portería en data/futsal.ts');
assert.equal(pitch.goal.tx, goal.tx, 'PITCHES.goal no coincide con el prop');
assert.equal(pitch.goal.ty, goal.ty, 'PITCHES.goal no coincide con el prop');
assert.equal(isOpen(pitch, 6, 11), true, 'sábado a las 11: abierto');
assert.equal(isOpen(pitch, 6, 14), false, 'sábado a las 14: cerrado');
assert.equal(isOpen(pitch, 5, 11), false, 'viernes: cerrado');
assert.equal(isOpen(pitch, 7, 11), false, 'domingo: cerrado');
assert.equal(futsalWeek(1), 0);
assert.equal(futsalWeek(7), 0);
assert.equal(futsalWeek(8), 1);

// Resultados: flojo, parado (con el portero encima y sin suerte), gol (lejos del portero).
const never = (): number => 0.99;
assert.equal(kickOutcome(0, 0.2, 0.5, never).kind, 'weak');
assert.equal(kickOutcome(0.3, 0.8, 0.3, never).kind, 'saved');
assert.equal(kickOutcome(-0.7, 0.8, 0.6, never).kind, 'goal');
assert.equal(kickOutcome(-0.7, 0.8, 0.6, never).scored, true);
assert.ok(['post', 'wide'].includes(kickOutcome(1, 0.8, -0.8, never).kind), 'en el palo: palo o fuera');

// Una tanda simulada a 16 ms: cargar 600 ms, soltar, esperar; apuntando arriba en los pares.
let seed = 7;
const rng = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const session = new PenaltySession({ feet: { x: 120, y: 320 }, goalCenter: { x: 176, y: 292 }, goalHalfHeight: 10 }, rng);
const events: SessionEvent[] = [];
let t = 0;
for (let frame = 0; frame < 5_000 && session.phase !== 'done'; frame++) {
  const cycle = t % 2_400;
  const down = cycle < 600;
  const aim: -1 | 0 | 1 = session.taken % 2 === 0 ? -1 : 1;
  events.push(...session.update(16, { aim: cycle < 300 ? aim : 0, down }));
  t += 16;
}
assert.equal(session.phase, 'done', 'la tanda no acaba');
assert.equal(session.taken, FUTSAL.shots);
assert.ok(session.goals >= 0 && session.goals <= FUTSAL.shots);
assert.equal(events.filter((e) => e.type === 'over').length, 1, "'over' una sola vez");
assert.equal(events.filter((e) => e.type === 'release').length, FUTSAL.shots);
assert.equal(events.filter((e) => e.type === 'result' && e.kick.scored).length, session.goals);
assert.equal(session.ball(), null);
const cut = new PenaltySession({ feet: { x: 0, y: 0 }, goalCenter: { x: 50, y: 0 }, goalHalfHeight: 10 }, rng);
assert.ok(cut.ball());
cut.cancel();
assert.equal(cut.ball(), null);

// El registro: misma semana, el mejor y una tanda más; semana nueva, de cero.
const r1 = recordTanda(undefined, 3, 2);
assert.deepEqual(r1, { week: 3, best: 2, tandas: 1 });
assert.deepEqual(recordTanda(r1, 3, 1), { week: 3, best: 2, tandas: 2 });
assert.deepEqual(recordTanda(r1, 3, 4), { week: 3, best: 4, tandas: 2 });
assert.deepEqual(recordTanda(r1, 4, 1), { week: 4, best: 1, tandas: 1 });
assert.equal(parseFutsal(undefined), undefined);
assert.equal(parseFutsal({}), undefined);
assert.equal(parseFutsal('basura'), undefined);
assert.equal(parseFutsal({ week: 'x', best: 1, tandas: 1 }), undefined);

// Se guarda con la forma física y vuelve igual; un guardado viejo no lo crea.
const saved = parseFitness(JSON.parse(JSON.stringify({ ...START_FITNESS, futsal: { week: 2, best: 3, tandas: 4 } })));
assert.deepEqual(saved.futsal, { week: 2, best: 3, tandas: 4 });
assert.equal('futsal' in parseFitness(JSON.parse(JSON.stringify(START_FITNESS))), false);

// La gente del fútbol del sábado y la del café después, con puntos que existen.
const profile = STREET_PROFILES.find((p) => p.location === ID)!;
for (const role of ['futsal', 'futsal-cafe']) {
  const trip = profile.trips.find((tr) => tr.role === role);
  assert.ok(trip, `falta el viaje ${role}`);
  assert.deepEqual(trip.rhythms, ['saturday-day'], `${role}: sólo los sábados`);
  for (const prefix of trip.to.points ?? []) assert.ok(Object.keys(points).some((id) => id.startsWith(prefix)), `${role}: ${prefix} sin puntos`);
}

console.log(`check-campo-alto-futsal: ok (${waits.length} esperas, ${meets.length} sitios en el café, tanda de ${session.taken} con ${session.goals} goles)`);
