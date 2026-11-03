// Clase de pasos de la escuela de baile (systems/Taekwondo drill 'steps', data/stations.ts): patrones por estación en
// datos, deterministas y en orden; pasos que sólo cuentan con el paso y el pie a tiempo, una vez por orden; progreso con
// lo bien hecho (Fitness.train); y textos sin estilos que no existen. Llamado desde la cadena `check`.
// `node scripts/check-dance.ts`.
import assert from 'node:assert/strict';
import { ACADEMIES } from '../src/data/academies.ts';
import { STATIONS } from '../src/data/stations.ts';
import { START_FITNESS, train } from '../src/systems/Fitness.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { contactDelay, createDrill, GOOD_MS, kickTotal, startKick, stepDrill, summarize, type Drill, type Leg } from '../src/systems/Taekwondo.ts';

const steps = (station: string, seed = 7): Drill => createDrill(seed, 0, false, 'steps', station);
const sig = (d: Drill): string => d.cues.map((c) => `${c.kick}:${c.leg}@${c.at}`).join(',');
const end = (d: Drill): number => d.cues[d.cues.length - 1].at + GOOD_MS + 2_000;

// a) Determinista, en orden y distinto por estación.
const a = steps('dance-steps');
const c = steps('dance-choreo');
assert.equal(sig(a), sig(steps('dance-steps')), 'misma semilla, misma clase');
assert.equal(sig(a), sig(steps('dance-steps', 99)), 'el patrón sale de los datos');
assert.equal(a.set, 'steps');
for (const d of [a, c]) {
  for (let i = 1; i < d.cues.length; i++) assert.ok(d.cues[i].at > d.cues[i - 1].at + kickTotal(d.cues[i - 1].kick), 'compás en orden y con tiempo para el paso');
  for (const cue of d.cues) assert.ok(['sway', 'back', 'turn'].includes(cue.kick), `sólo pasos: ${cue.kick}`);
}
assert.notEqual(sig(a), sig(c), 'pasos y coreografía son patrones distintos');
assert.ok(c.cues.length > a.cues.length, 'la coreografía es más larga');
assert.ok(c.cues[1].at - c.cues[0].at < a.cues[1].at - a.cues[0].at, 'y más rápida');

/** Cada orden en su instante exacto, con el pie que diga `leg` y a la distancia que sea (no debe contar). */
const perform = (d: Drill, leg: (l: Leg) => Leg, distance: number): void => {
  for (const cue of d.cues) {
    assert.ok(startKick(d, cue.kick, leg(cue.leg), cue.at - contactDelay(cue.kick)), 'el paso sale');
    const ev = stepDrill(d, cue.at, distance);
    assert.ok(ev && !/llega|encima/.test(ev.text), `la distancia no cuenta: ${ev?.text}`);
  }
  stepDrill(d, end(d), distance);
};

// b) Control positivo: todo perfecto, a cualquier distancia.
for (const station of ['dance-steps', 'dance-choreo']) {
  for (const distance of [0, 5]) {
    const d = steps(station);
    perform(d, (l) => l, distance);
    assert.ok(d.results.every((r) => r === 'perfect'), `${station} a ${distance}: ${d.results.join(',')}`);
    assert.equal(summarize(d).accuracy, 1);
  }
}
// Controles negativos: sin pulsar nada, todo fallado; con el pie cambiado, 'wrong-leg'.
const idle = steps('dance-steps');
stepDrill(idle, end(idle), 0);
assert.ok(idle.results.every((r) => r === 'miss'), `sin pulsar: ${idle.results.join(',')}`);
assert.equal(summarize(idle).accuracy, 0);
const swapped = steps('dance-choreo');
perform(swapped, (l) => (l === 'L' ? 'R' : 'L'), 0);
assert.ok(swapped.results.every((r) => r === 'wrong-leg'), `pie cambiado: ${swapped.results.join(',')}`);
assert.equal(summarize(swapped).accuracy, 0);

// c) Progreso (técnica de baile) con lo bien hecho; una clase no llega al máximo.
const skillAfter = (accuracy: number): number => train(START_FITNESS, 'dance-steps', 'normal', accuracy, 600, 1, 100).next.skills?.dance ?? 0;
const full = skillAfter(1);
assert.ok(full > skillAfter(0.4) && skillAfter(0.4) > 0, `1 rinde más que 0,4: ${full} / ${skillAfter(0.4)}`);
assert.equal(skillAfter(0), 0, 'sin nada bien hecho, no hay progreso');
assert.ok(full < 100, 'una clase no llega al máximo');

// d) Una orden se resuelve una vez: el segundo paso sobre la misma orden va fuera de compás.
const once = steps('dance-steps');
const first = once.cues[0];
const start = first.at - contactDelay(first.kick);
assert.ok(startKick(once, first.kick, first.leg, start));
stepDrill(once, first.at, 0);
assert.equal(once.results[0], 'perfect');
assert.ok(startKick(once, first.kick, first.leg, start + kickTotal(first.kick)), 'el segundo sale al volver el primero');
const again = start + kickTotal(first.kick) + contactDelay(first.kick);
assert.ok(again - first.at <= GOOD_MS, 'el segundo cae aún en la ventana de la primera orden');
stepDrill(once, again, 0);
assert.equal(once.results[0], 'perfect');
assert.equal(once.results.filter((r) => r !== null).length, 1, 'la orden no se resuelve dos veces');
assert.equal(once.offBeat, 1);

// e) Datos: qué estaciones tienen clase de pasos, y ningún estilo inventado en la escuela.
assert.equal(STATIONS['dance-steps'].drill, 'steps');
assert.equal(STATIONS['dance-choreo'].drill, 'steps');
assert.equal('drill' in STATIONS['dance-stretch'] ? STATIONS['dance-stretch'].drill : undefined, undefined, 'los estiramientos siguen pasivos');
const texts = JSON.stringify(ACADEMIES.dance) + JSON.stringify(getLocation('academy-dance'));
assert.ok(!/salsa|bachata|urbano/i.test(texts), 'la escuela no nombra estilos que no existen');

console.log(`Baile OK: ${a.cues.length} pasos y ${c.cues.length} de coreografía, perfecto/fallo/pie cambiado, una vez por orden, técnica +${full}.`);
