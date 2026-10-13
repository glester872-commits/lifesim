// Visibilidad de los sucesos escondidos con el juego tal cual (sin forzar nada): `npm run check`.
// Mide, en tiempo de jugador (1 día de juego = 12 min reales), cuántas peleas y trapicheos hay, cuánto duran y si
// una sesión normal de exploración los puede encontrar; y que los rumores sólo hablan de lo que de verdad va a pasar.
import assert from 'node:assert/strict';
import { GAME_MINUTES_PER_REAL_SECOND } from '../src/config/constants.ts';
import { ALLEY_SPOTS } from '../src/data/alleyDeals.ts';
import { STREET_EVENTS } from '../src/data/streetEvents.ts';
import { planDay } from '../src/systems/AlleyDeals.ts';
import { distanceTo, rumorFor } from '../src/systems/EventCues.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { planNight } from '../src/systems/StreetEvents.ts';

const DAYS = 140;
const realMin = (gameMin: number): number => gameMin / GAME_MINUTES_PER_REAL_SECOND / 60;
const report: string[] = [];

for (const def of STREET_EVENTS) {
  const loc = getLocation(def.location);
  const nights = Array.from({ length: DAYS }, (_, i) => planNight(def, loc, i + 1));
  const on = nights.filter((n) => n.happens);
  const why = nights.reduce<Record<string, number>>((acc, n) => ((acc[n.why] = (acc[n.why] ?? 0) + 1), acc), {});
  const length = on.map((n) => realMin((n.raidAt ?? n.end) - n.start));
  const perWeek = (on.length / DAYS) * 7;
  report.push(`${def.id}: ${on.length}/${DAYS} noches (${perWeek.toFixed(1)}/semana; motivos ${JSON.stringify(why)}), ${Math.min(...length).toFixed(1)}–${Math.max(...length).toFixed(1)} min reales de corro`);
  // Una semana de juego son 84 min reales: quien juega una semana tiene que poder cruzarse con alguna.
  assert.ok(perWeek >= 2, `${def.id}: sólo ${perWeek.toFixed(1)} noches por semana`);
  // Y no todas las noches: sigue siendo algo que pasa a veces.
  assert.ok(on.length < DAYS * 0.8, `${def.id}: hay pelea casi siempre`);
  // Visible el rato suficiente para llegar andando desde la calle de al lado.
  for (const n of on) assert.ok(realMin((n.raidAt ?? n.end) - n.fightAt) >= 0.4, `${def.id}: día ${n.day} la pelea se acaba antes de poder verla`);
  // Rumores: sólo el día que hay pelea y antes de que empiece; nunca de una noche sin pelea.
  let told = 0;
  for (const n of nights) {
    for (let t = n.day * 1440 + 12 * 60; t < n.day * 1440 + 20 * 60; t += 30) {
      for (let who = 0; who < 12; who++) {
        const r = rumorFor(def.location, t, `peaton-${who}`);
        if (!r || !def.lines.rumor.includes(r)) continue;
        assert.ok(n.happens || planNight(def, loc, n.day - 1).happens, `${def.id}: rumor el día ${n.day} sin pelea`);
        told++;
      }
    }
  }
  assert.ok(told > 0, `${def.id}: nadie habla nunca de la pelea`);
  // El ruido se oye desde la calle (la Mayor), no sólo dentro del patio.
  assert.ok(distanceTo(def.area, def.lookout ?? def.vantage) > 1.5, `${def.id}: el vigía está dentro del corro`);
}

for (const spot of ALLEY_SPOTS) {
  const loc = getLocation(spot.location);
  const eps = Array.from({ length: DAYS }, (_, i) => planDay(spot, loc, i + 1).episodes).flat();
  const len = eps.map((e) => realMin(e.end - e.start));
  const days = new Set(eps.map((e) => e.day)).size;
  report.push(`${spot.id}: ${eps.length} ratos en ${DAYS} días (${days} días con alguno), ${Math.min(...len).toFixed(1)}–${Math.max(...len).toFixed(1)} min reales`);
  assert.ok(days / DAYS >= 0.5, `${spot.id}: sólo ${days} de ${DAYS} días con trapicheo`);
  assert.ok(Math.min(...len) >= 0.45, `${spot.id}: un rato dura menos de medio minuto real`);
}

console.log(report.join('\n'));
console.log('\nOK: peleas y trapicheos salen solos en una semana de juego, duran lo bastante para verlos y los rumores sólo hablan de lo que pasa.');
