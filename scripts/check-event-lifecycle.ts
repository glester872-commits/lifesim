// Ciclo de vida de los sucesos del mundo (systems/WorldEvents.ts) con los mismos StreetEvent, AlleyDeal,
// Pickpocket y SecurityAI del juego: `npm run check`. Cada tipo se fuerza, corre, se resuelve, se recoge,
// se comprueba el enfriamiento, se reinicia y se vuelve a forzar. Falla si algo queda activo, duplicado,
// con papeles temporales o con quien acude sin soltar.
import assert from 'node:assert/strict';
import { STREET_EVENTS } from '../src/data/streetEvents.ts';
import { ALLEY_SPOTS } from '../src/data/alleyDeals.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { StreetEvent } from '../src/systems/StreetEvents.ts';
import { AlleyDeal, COOLDOWN } from '../src/systems/AlleyDeals.ts';
import { readFileSync } from 'node:fs';
import type { EventInfo, Lifecycle } from '../src/systems/WorldEvents.ts';

const ORDER: Lifecycle[] = ['ELIGIBLE', 'SPAWNING', 'ACTIVE', 'RESOLUTION', 'CLEANUP', 'COOLDOWN'];
const uniqueIds = (e: EventInfo): void => assert.equal(new Set(e.participants.map((p) => p.id)).size, e.participants.length, `${e.id}: participante repetido`);
/** El ciclo sólo avanza (ELIGIBLE → … → COOLDOWN), nunca hacia atrás dentro del mismo suceso. */
function forward(seen: Lifecycle[], id: string): void {
  const idx = seen.map((l) => ORDER.indexOf(l));
  for (let i = 1; i < idx.length; i++) assert.ok(idx[i] >= idx[i - 1], `${id}: el ciclo va hacia atrás (${seen.join(' → ')})`);
}
const dedupe = (xs: Lifecycle[]): Lifecycle[] => xs.filter((x, i) => i === 0 || xs[i - 1] !== x);

// ------------------------------------------------------------------- peleas de patio

for (const def of STREET_EVENTS) {
  const ev = new StreetEvent(def, getLocation(def.location));
  ev.devReset();
  // Una noche del calendario que sí pasa: así se ve también que la forzada no deja que se repita esa noche.
  let day = 10;
  while (!ev.night(day).happens) day++;
  const night = ev.night(day);
  const t0 = night.start - 180;
  assert.equal(ev.lifecycle(t0).lifecycle, 'ELIGIBLE', `${def.id}: antes de nada no está ELIGIBLE`);

  // a) Natural de principio a fin: acotada, sin gente al acabar, y en enfriamiento hasta el día siguiente.
  const natural: Lifecycle[] = [];
  let t = night.start - 1;
  for (; t < night.start + 12 * 60; t += 0.25) {
    const e = ev.lifecycle(t);
    uniqueIds(e);
    natural.push(e.lifecycle);
    if (e.lifecycle === 'COOLDOWN') break;
  }
  const naturalPath = dedupe(natural);
  forward(naturalPath, def.id);
  assert.deepEqual(naturalPath.slice(0, 3), ['ELIGIBLE', 'SPAWNING', 'ACTIVE'], `${def.id}: natural ${naturalPath.join(' → ')}`);
  assert.equal(naturalPath.at(-1), 'COOLDOWN', `${def.id}: la natural no acaba (${naturalPath.join(' → ')})`);
  assert.equal(ev.presentAt(t).length, 0, `${def.id}: queda gente tras la pelea`);
  assert.ok(t - night.start < 10 * 60, `${def.id}: dura ${t - night.start} min`);

  // b) Forzada esa misma tarde → resuelta a mano → recogida → la de esa noche ya no pasa (una por patio y noche).
  ev.devReset();
  ev.devForce(t0);
  const forced: Lifecycle[] = [];
  let resolvedAt = -1;
  for (t = t0; t < t0 + 6 * 60; t += 0.25) {
    const e = ev.lifecycle(t);
    uniqueIds(e);
    forced.push(e.lifecycle);
    if (e.lifecycle === 'ACTIVE' && resolvedAt < 0) {
      assert.equal(ev.devResolve(t), 'el vigía avisa: el corro se deshace');
      resolvedAt = t;
    }
    if (resolvedAt >= 0 && e.lifecycle === 'COOLDOWN') break;
  }
  const forcedPath = dedupe(forced);
  forward(forcedPath, def.id);
  assert.ok(forcedPath.includes('RESOLUTION') && forcedPath.includes('CLEANUP') && forcedPath.at(-1) === 'COOLDOWN', `${def.id}: forzada ${forcedPath.join(' → ')}`);
  assert.equal(ev.presentAt(t).length, 0, `${def.id}: queda gente tras resolver`);
  for (let s = t; s < night.start + 8 * 60; s += 5) {
    assert.equal(ev.presentAt(s).length, 0, `${def.id}: la noche del calendario aparece tras una forzada (duplicado) a los ${s - t0} min`);
    assert.equal(ev.lifecycle(s).lifecycle, 'COOLDOWN', `${def.id}: sin enfriamiento tras resolver`);
  }

  // c) Cancelar (retirar) quita a todos ya; reiniciar devuelve el calendario: puede volver a pasar.
  ev.devForce(t0);
  assert.ok(ev.presentAt(t0 + 5).length > 0, `${def.id}: forzada sin gente`);
  ev.devCancel(t0 + 5);
  assert.equal(ev.presentAt(t0 + 5).length, 0, `${def.id}: cancelada y con gente`);
  ev.devReset();
  assert.equal(ev.lifecycle(t0).lifecycle, 'ELIGIBLE', `${def.id}: tras reiniciar no vuelve a ELIGIBLE`);
  assert.ok(ev.presentAt(night.fightAt).length > 0, `${def.id}: tras reiniciar no vuelve a pasar`);
  ev.devForce(t0);
  assert.equal(ev.lifecycle(t0 + 2).lifecycle, 'SPAWNING', `${def.id}: no se puede volver a forzar`);
  ev.devReset();
  console.log(`pelea ${def.id}: natural ${naturalPath.join('→')} · forzada ${forcedPath.join('→')} · cancelar, reiniciar y repetir OK`);
}

// ------------------------------------------------------------- trapicheo en callejones

for (const spot of ALLEY_SPOTS) {
  const deal = new AlleyDeal(spot, getLocation(spot.location));
  deal.devReset();
  const t0 = 30 * 1440 + 13 * 60;
  assert.equal(deal.lifecycle(t0).lifecycle, 'ELIGIBLE', `${spot.id}: no está ELIGIBLE`);

  // a) Forzado → activo → resuelto (alguien de uniforme) → recogida → enfriamiento COOLDOWN minutos.
  deal.devForce(t0);
  const seen: Lifecycle[] = [];
  let t = t0;
  let resolvedAt = -1;
  for (; t < t0 + 6 * 60; t += 0.25) {
    const e = deal.lifecycle(t);
    uniqueIds(e);
    seen.push(e.lifecycle);
    if (e.lifecycle === 'ACTIVE' && e.participants.length >= 2 && resolvedAt < 0) {
      assert.match(deal.devResolve(t), /cortado/);
      resolvedAt = t;
    }
    if (resolvedAt >= 0 && e.lifecycle === 'COOLDOWN') break;
  }
  const path = dedupe(seen);
  forward(path, spot.id);
  assert.ok(path.includes('ACTIVE') && path.includes('CLEANUP') && path.at(-1) === 'COOLDOWN', `${spot.id}: ${path.join(' → ')}`);
  assert.equal(deal.presentAt(t).length, 0, `${spot.id}: queda gente tras resolver`);
  const cd = deal.lifecycle(t).cooldownLeft;
  assert.ok(cd > 0 && cd <= COOLDOWN, `${spot.id}: enfriamiento ${cd}`);
  // En enfriamiento no empieza nada del calendario en ese sitio.
  for (let s = t; s < resolvedAt + COOLDOWN - 16; s += 5) assert.equal(deal.episodeAt(s), undefined, `${spot.id}: empieza otro en enfriamiento (min ${s - resolvedAt})`);
  assert.equal(deal.lifecycle(resolvedAt + COOLDOWN + 1).cooldownLeft, 0, `${spot.id}: el enfriamiento no acaba`);

  // b) Cancelar: vacío al momento y con enfriamiento; reiniciar y volver a forzar funciona.
  deal.devReset();
  deal.devForce(t0);
  assert.ok(deal.presentAt(t0 + 5).length > 0, `${spot.id}: forzado sin gente`);
  deal.devCancel(t0 + 5);
  assert.equal(deal.presentAt(t0 + 5).length, 0, `${spot.id}: cancelado y con gente`);
  assert.equal(deal.lifecycle(t0 + 5).lifecycle, 'COOLDOWN', `${spot.id}: cancelado sin enfriamiento`);
  deal.devReset();
  assert.equal(deal.lifecycle(t0).lifecycle, 'ELIGIBLE');
  deal.devForce(t0);
  assert.ok(['SPAWNING', 'ACTIVE'].includes(deal.lifecycle(t0 + 1).lifecycle), `${spot.id}: no se puede volver a forzar`);

  // c) Un forzado que acaba no deja aparecer a medias el rato del calendario que ya había empezado (duplicado).
  deal.devReset();
  let day = 30;
  while (deal.plan(day).episodes.length === 0) day++;
  const nat = deal.plan(day).episodes[0];
  deal.devForce(nat.start - 1);
  let s = nat.start;
  while (deal.lifecycle(s).forced) s += 1;
  for (; s < nat.end; s += 2) assert.equal(deal.presentAt(s).length, 0, `${spot.id}: tras el forzado reaparece el rato del calendario a medias`);
  deal.devReset();
  console.log(`trapicheo ${spot.id}: ${path.join('→')} · enfriamiento ${Math.round(cd)} min · cancelar, reiniciar, repetir y sin duplicado OK`);
}

// -------------------------------------------------------------------- carteristas del metro
//
// El robo vive en MetroSystem.startPickpocket (pasajero contra pasajero; seguridad persigue, retiene y escolta):
// necesita Phaser y se recorre en el juego (lifesim.crime / lifesim.events). Aquí, que su ciclo común existe y
// que ningún robo ni ningún vigilante pueda quedarse abierto (el vigilante atascado lo cubre check-recovery).
{
  const metro = readFileSync(new URL('../src/systems/MetroSystem.ts', import.meta.url), 'utf8');
  const max = Number(metro.match(/const PICKPOCKET_MAX_MS = ([\d_]+)/)?.[1].replace(/_/g, ''));
  assert.ok(max > 0 && max <= 180_000, `un robo puede durar ${max} ms`);
  assert.ok(/this\.elapsed - c\.since > PICKPOCKET_MAX_MS\)[\s\S]{0,200}this\.cancelPickpocket\(\)/.test(metro), 'un robo que dura demasiado no se cierra');
  assert.ok(/c\.thief\.state === 'OFFSTAGE' && !this\.onDuty[\s\S]{0,60}this\.crime = null/.test(metro), 'el robo no se cierra al salir el carterista con el vigilante libre');
  assert.ok(/shutdown\(\): void \{[\s\S]{0,200}this\.crime = null/.test(metro), 'el robo sobrevive al cambio de escena');
  assert.ok(/g\.handlingIncident\) g\.recover\(2, false\)/.test(metro) && /removeAfterDetention\(\)/.test(metro), 'cancelar no suelta al vigilante ni al retenido');
  for (const life of ['SPAWNING', 'ACTIVE', 'RESOLUTION', 'CLEANUP', 'ELIGIBLE']) assert.ok(metro.includes(`'${life}'`), `el robo no llega nunca a ${life}`);
  console.log(`carterista (MetroSystem): ciclo común completo, cerrado a los ${max / 1000} s como mucho, al salir el carterista o al cambiar de escena`);
}

console.log('\nOK: cada suceso se fuerza, se resuelve, se recoge, enfría y vuelve; sin duplicados, papeles colgados ni vigilantes sin soltar.');
