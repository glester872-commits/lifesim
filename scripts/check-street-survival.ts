// Gente que vive en la calle (data/streetSurvival.ts, systems/StreetSurvival.ts) con el mismo StreetLife del juego:
// `npm run check`. Falla si alguien aparece en la calzada o en la vía, se atasca, no sigue su día, no se resguarda
// con lluvia, repite la misma frase seguida, su situación sale de su aspecto o se mezcla con los delitos.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STREET_SURVIVORS, COVERED } from '../src/data/streetSurvival.ts';
import { getLocation, isWalkable, ROADWAY } from '../src/systems/LocationSystem.ts';
import { StreetLife, streetProfileFor, type Walker } from '../src/systems/StreetLife.ts';
import { chatLine, openingFor, planFor, presentOn, SHELTER_RAIN } from '../src/systems/StreetSurvival.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import type { Clock } from '../src/systems/Crowd.ts';

const loc = getLocation('district');
const points = loc.points!;
const STEP_MS = 100;
const MS_PER_MIN = 500;
const PLAYER = { tx: 72, ty: 58 };
const addMinutes = (c: Clock, m: number): Clock => {
  const t = c.hour * 60 + c.minute + m;
  return { day: c.day + Math.floor(t / 1440), hour: Math.floor((t % 1440) / 60), minute: t % 60 };
};

// ------------------------------------------------ los datos: sitios que existen, pisables, fuera de la calzada
for (const s of STREET_SURVIVORS) {
  for (const id of [...s.day.flatMap((t) => t.spots), ...s.shelter]) {
    const p = points[id];
    assert.ok(p, `${s.id}: sitio desconocido ${id}`);
    const ch = loc.ground[p.ty][p.tx];
    assert.ok(!ROADWAY.has(ch) && ch !== 'R' && ch !== 'V', `${s.id}: ${id} en la calzada o la vía («${ch}»)`);
    assert.ok(isWalkable(loc, p.tx, p.ty) || p.kind === 'seat', `${s.id}: ${id} dentro de algo`);
    assert.ok((loc.links ?? []).some(([a, b]) => a === id || b === id), `${s.id}: ${id} fuera del grafo (cruzaría por cualquier sitio)`);
  }
  assert.ok(s.shelter.every((id) => COVERED.has(id)), `${s.id}: refugio que no cubre`);
  // Nada de su ficha habla de quién es: ni género, ni origen, ni aspecto.
  for (const k of Object.keys(s)) assert.ok(!['gender', 'nationality', 'origin', 'skin', 'look', 'race', 'age'].includes(k), `${s.id}: «${k}» en la ficha`);
}
// No todos hacen lo mismo: perfiles y cosas distintas.
assert.ok(new Set(STREET_SURVIVORS.flatMap((s) => s.profiles)).size >= 7, 'pocos perfiles distintos');
assert.equal(new Set(STREET_SURVIVORS.map((s) => s.belongings.join())).size, STREET_SURVIVORS.length, 'dos llevan exactamente lo mismo');
// Aparte de los delitos: ni el sistema ni los datos tocan carteristas, seguridad ni policía, ni al revés.
for (const f of ['src/data/streetSurvival.ts', 'src/systems/StreetSurvival.ts']) {
  assert.ok(!/import[^;]*(Pickpocket|SecurityAI|crime|police)/i.test(readFileSync(f, 'utf8')), `${f} importa algo de delitos`);
}
for (const f of ['src/systems/Pickpocket.ts', 'src/systems/SecurityAI.ts']) {
  assert.ok(!/streetSurvival|StreetSurvival|kind === 'street'/.test(readFileSync(f, 'utf8')), `${f} sabe de la gente de la calle`);
}

// ------------------------------------------------ el día: de noche duermen, de día se sientan, piden o andan
const sleeper = STREET_SURVIVORS.find((s) => s.id === 'mantas-parque')!;
const dry = { rain: 0 };
let day = 1;
while (!presentOn(sleeper, { day, hour: 12, minute: 0 }) || !presentOn(sleeper, { day: day + 1, hour: 2, minute: 0 })) day++;
assert.equal(planFor(sleeper, { day: day + 1, hour: 2, minute: 0 }, dry)?.state, 'SLEEP', 'de madrugada no duerme');
assert.equal(planFor(sleeper, { day, hour: 10, minute: 0 }, dry)?.state, 'SIT', 'por la mañana no está sentado en la plazuela');
// Con lluvia, de un banco al raso a cubierto; quien dormía sigue durmiendo, pero a cubierto.
const wet = planFor(sleeper, { day, hour: 10, minute: 0 }, { rain: SHELTER_RAIN + 0.1 })!;
assert.ok(wet.sheltered && wet.state === 'SHELTER' && wet.spots.every((p) => COVERED.has(p)), 'con lluvia no se resguarda');
const wetNight = planFor(sleeper, { day: day + 1, hour: 2, minute: 0 }, { rain: 0.8 })!;
assert.ok(wetNight.state === 'SLEEP' && COVERED.has(wetNight.spots[0]), 'con lluvia de noche no duerme a cubierto');
// De madrugada, menos gente de la calle despierta que a mediodía.
const awake = (h: number): number =>
  STREET_SURVIVORS.filter((s) => {
    const p = planFor(s, { day: day + 1, hour: h, minute: 0 }, dry);
    return p && p.state !== 'SLEEP';
  }).length;
assert.ok(awake(3) < awake(12), `de madrugada hay tanta gente despierta (${awake(3)}) como a mediodía (${awake(12)})`);

// ------------------------------------------------ la voz: dormido no se le despierta; no repite seguido
const asker = STREET_SURVIVORS.find((s) => s.id === 'carton-mayor')!;
assert.ok(openingFor(asker, 'SLEEP', { day, hour: 3, minute: 0 }, undefined).closed, 'despierta a quien duerme');
const lines: string[] = [];
for (let met = 0; met < 6; met++) lines.push(chatLine(asker, { encounters: met, affinity: 0, lastDay: day }));
for (let i = 1; i < lines.length; i++) assert.notEqual(lines[i], lines[i - 1], 'repite la misma frase dos veces seguidas');
let asked = 0;
for (let d = 1; d <= 30; d++) if (openingFor(asker, 'ASK', { day: d, hour: 11, minute: 0 }, undefined).asks) asked++;
assert.ok(asked > 10 && asked < 30, `pide siempre o nunca (${asked}/30): a veces no le apetece hablar`);
// Si ya te conoce, te saluda como a alguien conocido.
const dog = STREET_SURVIVORS.find((s) => s.id === 'perro-plaza')!;
let knownSeen = false;
for (let d = 1; d <= 10 && !knownSeen; d++) {
  const o = openingFor(dog, 'SIT', { day: d, hour: 12, minute: 0 }, { encounters: 3, affinity: 2, lastDay: d - 1 });
  if (!o.closed) {
    assert.ok(dog.voice.known.includes(o.lines[0]), 'no se acuerda de ti');
    knownSeen = true;
  }
}
assert.ok(knownSeen, 'nunca se deja hablar por quien ya conoce');

// ------------------------------------------------ en la calle de verdad: un día entero con StreetLife
const street = new StreetLife(loc, streetProfileFor('district')!, seededRng(11));
let clock: Clock = { day, hour: 6, minute: 30 };
street.populate(clock, PLAYER);
const seen = new Map<string, Set<string>>();
let stuck = 0;
for (let ms = 0, el = 0; ms < 24 * 60 * MS_PER_MIN; ms += STEP_MS) {
  street.update(STEP_MS, clock, PLAYER);
  if ((el += STEP_MS) >= MS_PER_MIN) {
    el -= MS_PER_MIN;
    clock = addMinutes(clock, 1);
  }
  for (const a of street.agents as Walker[]) {
    if (a.kind !== 'street') continue;
    const tx = Math.round(a.x);
    const ty = Math.round(a.y);
    const ch = loc.ground[ty]?.[tx] ?? '';
    assert.ok(ch !== 'R' && ch !== 'V', `${a.survivor!.id} en la vía o la mediana (${tx},${ty})`);
    // Andando cruza por el paso de cebra; parado, nunca en la calzada.
    if (!a.moving && a.path.length === 0) assert.ok(!ROADWAY.has(ch), `${a.survivor!.id} parado en la calzada (${tx},${ty}) a las ${clock.hour}:${clock.minute}`);
    const states = seen.get(a.survivor!.id) ?? new Set<string>();
    states.add(a.state);
    seen.set(a.survivor!.id, states);
  }
  // Cada hora en punto: nadie arrastra un camino absurdo de largo (atascado en un bucle de rutas).
  if (clock.minute === 0 && el === 0) stuck = Math.max(stuck, (street.agents as Walker[]).filter((a) => a.kind === 'street' && a.path.length > 60).length);
}
assert.equal(street.pathFailures, 0, 'rutas no encontradas');
assert.equal(stuck, 0, 'alguien con un camino absurdo de largo');
assert.ok(seen.size >= 4, `pocos de la calle en todo un día (${seen.size})`);
const states = new Set([...seen.values()].flatMap((s) => [...s]));
for (const st of ['MOVE', 'SLEEP', 'SIT', 'ASK']) assert.ok(states.has(st), `en todo un día nadie hace ${st}`);
// No hacen viajes de paseante: no inflan la gente que pasa.
assert.ok(street.agents.every((a) => a.kind !== 'street' || !(a as Walker).rule), 'alguien de la calle haciendo un viaje de paseante');
console.log(`check-street-survival: ${STREET_SURVIVORS.length} personas, ${seen.size} vistas en un día; estados ${[...states].sort().join(' ')}`);
