// Uniforme de Decathlon (Alpha-07): `npm run check`. Todo el personal de la tienda lleva el chaleco azul y la clientela
// no; el chaleco es el mismo y cada empleado distinto (piel, pelo, camiseta); el jugador lo lleva con el turno abierto y
// se le quita al hacerlo; y la tienda, sin calle, tiene lugar con entrada para que haya gente dentro.
import assert from 'node:assert/strict';
import { DECATHLON_PROFILE, DECATHLON_STORE } from '../src/data/decathlon.ts';
import { getJob } from '../src/data/jobs.ts';
import { UNIFORM_LOOKS } from '../src/data/npcs.ts';
import { hire, nextShift, onShift, situationFor, work } from '../src/systems/Jobs.ts';
import { placeForInterior } from '../src/systems/Places.ts';

const job = getJob('decathlon');
const looks = UNIFORM_LOOKS.filter((l) => l.id.startsWith('decathlon_employee'));
const lum = (hex: string): number => {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};

// 1 · El uniforme del empleo existe y es uno de ellos.
assert.ok(job.uniform && looks.some((l) => l.id === job.uniform), 'el empleo no tiene uniforme de Decathlon');

// 2 · Lo que se ve en las fotos (design/references/uniforms/): chaleco azul real común, camiseta blanca o negra con
// manga, pantalón vaquero o negro (azulado o neutro, nunca de color) y tarjeta al pecho.
const VEST = looks[0].cloth;
const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(VEST.slice(i, i + 2), 16));
assert.ok(b > 150 && b > r + 80 && b > g + 30, `el chaleco no es azul intenso: ${VEST}`);
for (const l of looks) {
  assert.equal(l.cloth, VEST, `${l.id}: otro chaleco`);
  assert.ok(l.sleeves && (lum(l.sleeves) > 200 || lum(l.sleeves) < 30), `${l.id}: camiseta de debajo que no es blanca ni negra`);
  const [tr, , tb] = [1, 3, 5].map((i) => Number.parseInt(l.trousers!.slice(i, i + 2), 16));
  assert.ok(l.trousers && tb >= tr && lum(l.trousers) < 180, `${l.id}: pantalón que no es vaquero ni negro`);
  assert.ok(l.badge, `${l.id}: sin tarjeta de empleado`);
}

// 3 · Nadie igual: piel, pelo y camiseta, distintos de dos en dos.
const faces = looks.map((l) => `${l.skin}|${l.hair}|${l.sleeves}|${l.longHair ?? false}`);
assert.equal(new Set(faces).size, looks.length, 'hay dos empleados idénticos');
assert.ok(new Set(looks.map((l) => l.skin)).size >= 4, 'poca variedad de piel');

// 4 · Todo el personal de la tienda con chaleco, cada cual el suyo; la clientela no lleva uniforme.
const staffLooks = DECATHLON_PROFILE.staff.map((s) => s.look);
assert.ok(staffLooks.every((l) => l?.startsWith('decathlon_employee')), 'hay personal sin chaleco');
assert.equal(new Set(staffLooks).size, staffLooks.length, 'dos empleados con el mismo aspecto');
assert.ok(DECATHLON_PROFILE.visitors.every((v) => !String((v as { look?: string }).look ?? '').startsWith('decathlon')), 'clientela con chaleco');

// 5 · La tienda: lugar de trabajo del empleo, fichaje dentro, puerta a su explanada (Alpha-09); y lugar con gente.
assert.equal(DECATHLON_STORE.workplace, job.id);
assert.ok(DECATHLON_STORE.spots?.some((s) => s.job === job.id), 'no se puede fichar dentro');
assert.ok(DECATHLON_STORE.portals.some((p) => p.to.location === 'poligono-norte' && p.to.spawn === 'pn-decathlon'), 'la puerta no sale a la explanada');
const place = placeForInterior(DECATHLON_STORE.id);
assert.ok(place && place.locationId === 'poligono-norte' && place.entrances.includes('PN_DECATHLON_ENTRANCE'), 'la tienda no tiene su puerta de calle (sin gente)');

// 6 · El jugador: con contrato y el turno abierto, uniforme; antes de poder fichar, no; hecho el turno, se le quita.
assert.equal(onShift(null, job.id, 1, 0), false);
const hired = hire(job, 1);
const next = nextShift(hired, 0);
assert.ok(next, 'sin turno próximo');
const day = next.day;
const lvl = job.levels[0];
const at = (h: number): number => (day - 1) * 1440 + h * 60;
assert.equal(onShift(hired, job.id, day, at(lvl.start - 4)), false, 'uniforme horas antes de poder fichar');
assert.equal(onShift(hired, job.id, day, at(lvl.start - 1)), true, 'sin uniforme con el turno abierto');
assert.equal(onShift(hired, 'otro-empleo', day, at(lvl.start)), false, 'uniforme de un empleo que no es el suyo');
const done = work(hired, at(lvl.start), situationFor(hired, day).choices[0]).progress;
assert.equal(onShift(done, job.id, day, at(lvl.start) + lvl.hours * 60), false, 'sigue con uniforme tras el turno');
assert.equal(onShift({ ...hired, status: 'fired' } as typeof hired, job.id, day, at(lvl.start)), false, 'uniforme sin contrato');

console.log(`check-uniform: OK (${looks.length} empleados distintos con chaleco ${VEST}, personal y clientela, tienda con gente, turno y fin de turno)`);
