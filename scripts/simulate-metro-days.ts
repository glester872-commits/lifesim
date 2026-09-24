// Simula días de metro con el mismo código que usa el juego: `npm run simulate [días]`.
// Recorre cada día de 06:00 a 24:00 en tiempo real de juego (1 s = 2 min).
import assert from 'node:assert/strict';
import { CROWD_PROFILES, MICRO_EVENTS } from '../src/config/metro.ts';
import {
  activeTarget,
  crowdAt,
  hashSeed,
  hourTag,
  intBetween,
  metroDay,
  MicroEventClock,
  pickArchetype,
  REPEAT_THRESHOLD,
  securityFor,
  seededRng,
  similarity,
  trainWait,
  weekday,
  type Archetype,
  type CrowdLevel,
  type MetroDailyState,
} from '../src/systems/MetroDaily.ts';

const DAYS = Number(process.argv[2] ?? 28);
const STEP_MS = 100;
const START_MIN = 6 * 60;
const END_MIN = 24 * 60;

interface DayReport {
  state: MetroDailyState;
  trains: number;
  delays: number;
  moderate: number;
  maxDelayS: number;
  avgActive: number;
  peakActive: number;
  alighted: number;
  archetypes: Record<string, number>;
  security: string;
  events: Record<string, number>;
  minGapS: number;
  levels: Record<CrowdLevel, number>;
}

function simulateDay(day: number): DayReport {
  const state = metroDay(day);
  const rng = seededRng(hashSeed('simulación', day));
  const clock = new MicroEventClock(rng, state);
  const r: DayReport = {
    state, trains: 0, delays: 0, moderate: 0, maxDelayS: 0, avgActive: 0, peakActive: 0, alighted: 0,
    archetypes: {}, security: '', events: {}, minGapS: Infinity,
    levels: { VERY_LOW: 0, LOW: 0, NORMAL: 0, HIGH: 0, RUSH_HOUR: 0 },
  };

  const minuteAt = (ms: number): number => START_MIN + (ms / 1000) * 2;
  let untilTrain = 4_000;
  let lastEventAt = -Infinity;
  let samples = 0;
  const note = (event: string, t: number): void => {
    r.events[event] = (r.events[event] ?? 0) + 1;
    if (lastEventAt > -Infinity) r.minGapS = Math.min(r.minGapS, (t - lastEventAt) / 1000);
    lastEventAt = t;
  };

  for (let t = 0; minuteAt(t) < END_MIN; t += STEP_MS) {
    const m = minuteAt(t);
    const hour = Math.floor(m / 60);
    const minute = Math.floor(m % 60);
    const level = crowdAt(state, hour, minute);

    // Muestreo de afluencia cada 10 s reales (20 min de juego).
    if (t % 10_000 === 0) {
      const active = activeTarget(rng, level);
      r.avgActive += active;
      r.peakActive = Math.max(r.peakActive, active);
      r.levels[level]++;
      samples++;
      const tag = hourTag(state, hour, minute);
      for (let i = 0; i < Math.ceil(active / 2); i++) {
        const a: Archetype = pickArchetype(rng, state, tag);
        r.archetypes[a] = (r.archetypes[a] ?? 0) + 1;
      }
    }

    const tick = clock.update(STEP_MS, level);
    if (tick) note(tick, t);

    untilTrain -= STEP_MS;
    if (untilTrain <= 0) {
      r.trains++;
      const [a, b] = CROWD_PROFILES[level].alighting;
      r.alighted += intBetween(rng, a, b);
      const arrival = clock.arrival(level);
      if (arrival) note(arrival, t);
      const wait = trainWait(rng, state, level);
      if (wait.kind !== 'PUNTUAL') r.delays++;
      if (wait.kind === 'RETRASO_MODERADO') r.moderate++;
      r.maxDelayS = Math.max(r.maxDelayS, wait.delayMs / 1000);
      untilTrain = wait.waitMs + 13_000; // + el tren en el andén
    }
  }
  r.avgActive /= samples;

  r.security = [9, 12, 19, 23]
    .map((h) => {
      const tag = hourTag(state, h, 0);
      const s = securityFor(state, 'vallesco-station', tag, crowdAt(state, h, 0), 2);
      return `${String(h).padStart(2, '0')}h:${s.count}${s.count > 0 ? (s.patrols ? 'P' : 'Q') : ''}`;
    })
    .join(' ');
  return r;
}

const reports = Array.from({ length: DAYS }, (_, i) => simulateDay(i + 1));

const pad = (s: string | number, n: number): string => String(s).padEnd(n);
console.log(
  `${pad('día', 14)}${pad('base', 10)}${pad('ambiente', 10)}${pad('perfil', 12)}${pad('trenes', 8)}` +
    `${pad('retrasos', 10)}${pad('pasaj.', 10)}${pad('seguridad (P ronda, Q quieto)', 31)}eventos`,
);
for (const r of reports) {
  const s = r.state;
  const events = Object.entries(r.events).map(([k, v]) => `${k.toLowerCase()}×${v}`).join(' ') || '—';
  console.log(
    `${pad(`${s.day} ${weekday(s.day)}`, 14)}${pad(s.crowdLevel, 10)}${pad(s.stationMood, 10)}` +
      `${pad(s.compositionTheme, 12)}${pad(r.trains, 8)}${pad(`${r.delays}${r.moderate ? ` (${r.moderate}m)` : ''}`, 10)}` +
      `${pad(`${r.avgActive.toFixed(1)}/${r.peakActive}`, 10)}${pad(r.security, 31)}${events}`,
  );
}

// Arquetipos agregados y algunos días sueltos.
const total: Record<string, number> = {};
for (const r of reports) for (const [k, v] of Object.entries(r.archetypes)) total[k] = (total[k] ?? 0) + v;
const sum = Object.values(total).reduce((a, b) => a + b, 0);
console.log('\narquetipos (todos los días):', Object.entries(total)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${((v / sum) * 100).toFixed(0)}%`).join(' · '));
for (const r of reports.filter((x) => x.state.compositionTheme !== 'HABITUAL').slice(0, 3).concat(reports[0])) {
  const n = Object.values(r.archetypes).reduce((a, b) => a + b, 0);
  const top = Object.entries(r.archetypes).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k, v]) => `${k} ${((v / n) * 100).toFixed(0)}%`).join(', ');
  console.log(`  día ${r.state.day} (${weekday(r.state.day)}, ${r.state.compositionTheme}): ${top}`);
}

// ----------------------------------------------------------------- checks
const eventsPerDay = reports.map((r) => Object.values(r.events).reduce((a, b) => a + b, 0));
const realDayS = (END_MIN - START_MIN) / 2;
const avgGap = realDayS / (eventsPerDay.reduce((a, b) => a + b, 0) / DAYS);
const minGap = Math.min(...reports.map((r) => r.minGapS));
const allDelays = reports.reduce((a, r) => a + r.delays, 0);
const allTrains = reports.reduce((a, r) => a + r.trains, 0);
const maxDelay = Math.max(...reports.map((r) => r.maxDelayS));

let similarPairs = 0;
for (let i = 1; i < reports.length; i++) {
  if (similarity(reports[i].state, reports[i - 1].state) >= REPEAT_THRESHOLD) similarPairs++;
}
const combos = new Set(
  reports.map((r) => [r.state.crowdLevel, r.state.stationMood, r.state.compositionTheme, r.state.securityPresence].join()),
);

console.log(
  `\nmicroeventos: ${(eventsPerDay.reduce((a, b) => a + b, 0) / DAYS).toFixed(1)}/día · uno cada ${avgGap.toFixed(0)} s reales de media · hueco mínimo ${minGap.toFixed(0)} s`,
);
console.log(`retrasos: ${allDelays}/${allTrains} trenes (${((allDelays / allTrains) * 100).toFixed(1)} %) · máximo ${maxDelay.toFixed(1)} s`);
console.log(`días consecutivos casi iguales (≥${REPEAT_THRESHOLD}/6 rasgos): ${similarPairs} · combinaciones distintas: ${combos.size}/${DAYS}`);

assert.deepEqual(metroDay(3), metroDay(3), 'el mismo día debe ser el mismo día');
assert.equal(similarPairs, 0, 'dos días seguidos se sienten iguales');
assert.ok(maxDelay <= 13, 'retraso fuera de rango');
assert.ok(minGap >= MICRO_EVENTS.quietAfter.MINOR / 1000 - 0.5, 'microeventos demasiado seguidos');
assert.ok(avgGap >= 30, 'demasiados microeventos: faltan momentos tranquilos');
console.log('simulación ok');
