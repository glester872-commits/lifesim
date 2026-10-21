// Parroquia de San Blas (CV-05): el ensayo del coro con las reglas del juego (systems/Parish.ts), sin Phaser. Horario,
// id estable, una sola resolución, llegar tarde, irse antes, saltar días, recargar y quién viene del barrio.
// Llamado desde la cadena `check` de package.json. `node scripts/check-parish.ts`.
import assert from 'node:assert/strict';
import { CHOIR } from '../src/data/parish.ts';
import { weekIndex } from '../src/systems/Calendar.ts';
import {
  attend, attendedTo, emptyParish, gatheringLooks, guestsInside, guestsOf, joinBlocker, lastAttendance, nextOccurrence, occurrenceOn, parseParish,
} from '../src/systems/Parish.ts';
import { IDENTITIES } from '../src/systems/People.ts';
import { isOpen, placeInfo } from '../src/systems/Places.ts';
import { createSocialProfile } from '../src/systems/Social.ts';

const at = (day: number, h: number, m = 0): number => (day - 1) * 1440 + h * 60 + m;
// El día 1 es lunes: el primer sábado es el 6.
const SAT = 6;
assert.equal(weekIndex(SAT), 5);

// ------------------------------------------------------------ calendario
assert.equal(occurrenceOn(CHOIR, SAT)?.id, 'coro-6', 'id estable por día');
for (let d = 1; d <= 7; d++) assert.equal(!!occurrenceOn(CHOIR, d), d === SAT, `día ${d}`);
assert.equal(nextOccurrence(CHOIR, at(1, 9)).id, 'coro-6');
assert.equal(nextOccurrence(CHOIR, at(SAT, 18, 30)).id, 'coro-13', 'el que va por la mitad no es «el próximo»');
// La iglesia está abierta durante todo el ensayo.
const parish = placeInfo(CHOIR.place)!;
assert.ok(parish, 'el lugar del ensayo no existe en data/places.ts');
for (let m = 0; m < CHOIR.minutes; m += 15) assert.ok(isOpen(parish, SAT, 18 + Math.floor(m / 60), m % 60), `cerrada a las 18:${m}`);

// ------------------------------------------------------------ cuándo se puede entrar
const empty = emptyParish();
const blocked = (d: number, h: number, m = 0): string | null => joinBlocker(CHOIR, empty, at(d, h, m));
assert.match(blocked(SAT, 17)!, /faltan 60 min/);
assert.equal(blocked(SAT, 18), null);
assert.equal(blocked(SAT, 18, 45), null, 'hasta lateMax se entra');
assert.match(blocked(SAT, 18, 46)!, /Va muy avanzado.*18:45.*El próximo: sábado, 24/);
assert.match(blocked(SAT, 19, 30)!, /terminó a las 19:30.*El próximo: sábado, 24/);
assert.match(blocked(SAT + 2, 18)!, /Hoy no hay ensayo.*El próximo: sábado, 24/);

// ------------------------------------------------------------ ir: una sola vez, con su efecto
const host = createSocialProfile();
const full = attend(CHOIR, empty, host, at(SAT, 18, 5), 'full');
assert.equal(full.stay, 'full');
assert.equal(full.minutes, 85, 'hasta el final: hasta las 19:30');
assert.equal(full.energy, CHOIR.full.energy);
assert.equal(full.host.friendship - host.friendship, CHOIR.full.friendship);
assert.ok(full.host.memories.some((m) => m.kind === 'SHARED_EVENT' && m.note === 'coro: hasta el final' && m.hour === 19 && m.minute === 30));
assert.ok(attendedTo(full.parish, 'coro-6'));
assert.match(joinBlocker(CHOIR, full.parish, at(SAT, 18, 10))!, /Ya has estado en el de hoy/, 'el mismo ensayo no se resuelve dos veces');
assert.match(lastAttendance(CHOIR, full.parish)!, /sábado, 17 de abril.*hasta el final/);
// Llegar tarde o irse antes: un rato, con menos efecto.
const late = attend(CHOIR, empty, host, at(SAT, 18, 20), 'full');
assert.equal(late.stay, 'partial');
assert.equal(late.minutes, 70);
assert.match(late.lines[0], /ensayo empezado/);
const short = attend(CHOIR, empty, host, at(SAT, 18), 'short');
assert.deepEqual([short.stay, short.minutes, short.energy], ['partial', CHOIR.shortStay, CHOIR.partial.energy]);
assert.ok(short.host.friendship < full.host.friendship);
// Al borde del final, «un rato» no pasa del final.
assert.equal(attend(CHOIR, empty, host, at(SAT, 18, 45), 'short').minutes, 30);

// ------------------------------------------------------------ saltar días y recargar
// Dormir o saltar semanas no da ensayos por hechos: sólo cuenta lo que se fue.
let s = full.parish;
for (let d = SAT + 1; d < SAT + 30; d++) assert.equal(joinBlocker(CHOIR, s, at(d, 18, 10)) === null, weekIndex(d) === 5, `día ${d}`);
s = attend(CHOIR, s, full.host, at(SAT + 7, 18), 'full').parish;
assert.deepEqual(s.attended.map((a) => a.id), ['coro-6', 'coro-13']);
// Lo guardado vuelve igual; lo roto o una partida anterior, vacío.
assert.deepEqual(parseParish(JSON.parse(JSON.stringify(s))), s);
assert.deepEqual(parseParish(undefined), emptyParish());
assert.deepEqual(parseParish({ attended: [{ id: 3 }, null, { id: 'coro-20', day: 20, stay: 'mucho', minutes: 9 }] }), emptyParish());
// Nunca crece sin fin.
let many = emptyParish();
for (let w = 0; w < 30; w++) many = attend(CHOIR, many, host, at(SAT + 7 * w, 18), 'full').parish;
assert.equal(many.attended.length, 12);

// ------------------------------------------------------------ quién viene del barrio
let weeks = 0;
for (let d = SAT; d < SAT + 7 * 12; d += 7) {
  const guests = guestsOf(CHOIR, d);
  assert.deepEqual(guestsOf(CHOIR, d), guests, 'el mismo día, la misma gente');
  assert.ok(guests.length >= CHOIR.guests[0] && guests.length <= CHOIR.guests[1], `día ${d}: ${guests.length} del barrio`);
  assert.equal(new Set(guests).size, guests.length, 'nadie dos veces');
  for (const i of guests) {
    const p = IDENTITIES[i];
    assert.ok(p.resident, `${p.name} no vive aquí`);
    const work = p.work ? placeInfo(p.work) : undefined;
    for (let m = 0; m <= CHOIR.minutes; m += 30) assert.ok(!work || !isOpen(work, d, 18 + Math.floor(m / 60), m % 60), `${p.name} deja su trabajo (${p.work}) para ir al coro`);
  }
  weeks++;
}
assert.equal(guestsOf(CHOIR, SAT + 1).length, 0, 'un domingo no viene nadie');
// Dentro desde un poco antes hasta el final; mientras, no están en la calle.
assert.equal(guestsInside('parish', at(SAT, 17, 44)).looks.length, 0);
assert.deepEqual(guestsInside('parish', at(SAT, 17, 45)).looks, guestsOf(CHOIR, SAT));
assert.deepEqual(gatheringLooks(at(SAT, 19)), guestsOf(CHOIR, SAT));
assert.equal(gatheringLooks(at(SAT, 19, 30)).length, 0);
assert.equal(guestsInside('cafe', at(SAT, 19)).looks.length, 0);

console.log(`check-parish: ensayo coro-6 (${guestsOf(CHOIR, SAT).map((i) => IDENTITIES[i].name).join(', ')}); ${weeks} sábados sin nadie que deje su trabajo; una resolución por ensayo, tarde y antes = un rato, recarga y saltos sin duplicar, OK`);
