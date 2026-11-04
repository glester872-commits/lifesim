// El corte de calle de la concentración (data/protests.ts closure, Traffic.close/reopen) sin Phaser: sobre calzada y
// fuera del paso de cebra; sin corte el tráfico lo cruza, con corte para en la línea sin colarse ni saltar, y al
// reabrir arranca. Con control positivo: sin close(), el detector salta. `node scripts/check-protest-closure.ts`.
import assert from 'node:assert/strict';
import { GAME_MINUTES_PER_REAL_SECOND, TILE } from '../src/config/constants.ts';
import { PROTESTS } from '../src/data/protests.ts';
import { VEHICLES, type MoverType } from '../src/data/vehicles.ts';
import { withDistrictLanes } from '../src/systems/Districts.ts';
import { getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { Traffic, type TrafficClock, type Vehicle } from '../src/systems/Traffic.ts';
import type { SignalDef } from '../src/types/game.ts';

/** El de systems/Traffic.ts: la línea, a 3 px del tramo. */
const STOP_GAP = 3;
const STEP_MS = 50;
/** Lo más que avanza alguien en un paso: el más rápido (46 px/s × 1,12 × 1,1) da 2,8 px; con margen. */
const MAX_STEP_PX = 4;
/** 130 minutos de juego, en pasos. */
const CLOSED_STEPS = Math.ceil((130 / GAME_MINUTES_PER_REAL_SECOND) * 1000 / STEP_MS);
/** 100 s reales (200 min de juego): cruzar la calle lleva unos 15 s. Las tres fases caben entre las 9 y las 18. */
const FREE_STEPS = 2000;

const def = PROTESTS.find((p) => p.closure);
assert.ok(def && def.closure, 'ninguna concentración corta la calle');
const cut = def.closure;
const loc = getLocation(def.location);
assert.ok(loc.traffic, `${def.location}: sin tráfico`);
const flow = withDistrictLanes(loc, loc.traffic);
const widthPx = loc.ground[0].length * TILE;
const sig: SignalDef = { id: `${def.id}-closure`, ...cut };

// ---------------------------------------------------------------- datos
for (let y = cut.ty; y < cut.ty + cut.h; y++) {
  for (let x = cut.tx; x < cut.tx + cut.w; x++) {
    assert.ok(['.', 'l'].includes(loc.ground[y][x]), `closure: ${x},${y} no es calzada («${loc.ground[y][x]}»)`);
  }
}
for (const lane of flow.lanes) assert.ok(lane.row >= cut.ty && lane.row < cut.ty + cut.h, `closure: no corta el carril ${lane.row}`);
// El paso de cebra, al oeste del tramo: el más largo que circula por la calle, parado en la línea, no llega a pisarlo.
const zebraEnd = Math.max(...loc.ground.flatMap((row) => [...row].map((c, x) => (c === 'z' ? x + 1 : -1))));
assert.ok(zebraEnd > 0 && zebraEnd <= cut.tx, 'closure: pisa el paso de cebra o no lo hay');
const longest = Math.max(...VEHICLES.filter((t) => (t.roads?.[flow.road] ?? 1) > 0).map((t) => t.length));
assert.ok(cut.tx * TILE - STOP_GAP - longest >= zebraEnd * TILE, `closure: un parado de ${longest} px pisa la cebra`);

assert.ok(def.slots.length >= def.crowd[1], `slots: ${def.slots.length} < crowd ${def.crowd[1]}`);
for (const s of def.slots) {
  assert.ok(isWalkable(loc, s.tx, s.ty), `slot ${s.tx},${s.ty} no se pisa`);
  assert.ok(s.tx < 19 || s.tx > 23, `slot ${s.tx},${s.ty} en la bajada central (columnas 19–23)`);
  assert.ok(s.ty !== 19 && s.ty !== 20, `slot ${s.tx},${s.ty} en las filas 19–20`);
}

// ---------------------------------------------------------------- simulación
const front = (v: Vehicle): number => v.x + (v.dir * v.type.length) / 2;
const line = (v: Vehicle): number => (v.dir > 0 ? cut.tx * TILE - STOP_GAP : (cut.tx + cut.w) * TILE + STOP_GAP);
/** Lo que le queda hasta la línea (negativo: ya la ha pasado). */
const toLine = (v: Vehicle): number => (line(v) - front(v)) * v.dir;
const mid = (cut.tx + cut.w / 2) * TILE;

function fresh(): { traffic: Traffic; clock: TrafficClock } {
  const clock: TrafficClock = { day: 4, minuteOfDay: 9 * 60 };
  const traffic = new Traffic<MoverType>(flow, VEHICLES, loc.signals ?? [], widthPx, seededRng(4242));
  traffic.populate(clock);
  return { traffic, clock };
}

function step(traffic: Traffic, clock: TrafficClock): void {
  traffic.update(STEP_MS, clock, []);
  clock.minuteOfDay += (STEP_MS / 1000) * GAME_MINUTES_PER_REAL_SECOND;
  assert.ok(clock.minuteOfDay < 21 * 60, 'el reloj se sale de la franja con tráfico');
}

/** Pasos libres: ids de quienes cruzan el centro del tramo, por sentido. */
function flowing(traffic: Traffic, clock: TrafficClock, steps: number): Map<number, Set<number>> {
  const crossed = new Map<number, Set<number>>([[1, new Set()], [-1, new Set()]]);
  const prev = new Map<number, number>();
  for (let i = 0; i < steps; i++) {
    step(traffic, clock);
    for (const v of traffic.vehicles) {
      const p = prev.get(v.id);
      if (p !== undefined && (p - mid) * v.dir < 0 && (v.x - mid) * v.dir >= 0) crossed.get(v.dir)?.add(v.id);
      prev.set(v.id, v.x);
    }
  }
  return crossed;
}

/** El detector de la fase 2: nadie se mete en el tramo, nadie salta y los parados están en la línea o en cola. */
function closedRun(traffic: Traffic, clock: TrafficClock): void {
  const past = new Set(traffic.vehicles.filter((v) => toLine(v) < -1).map((v) => v.id));
  const prev = new Map<number, number>();
  for (let i = 0; i < CLOSED_STEPS; i++) {
    step(traffic, clock);
    for (const v of traffic.vehicles) {
      const p = prev.get(v.id);
      prev.set(v.id, v.x);
      if (p !== undefined) assert.ok(Math.abs(v.x - p) <= MAX_STEP_PX, `#${v.id} salta ${Math.abs(v.x - p).toFixed(1)} px`);
      if (past.has(v.id)) continue;
      assert.ok(toLine(v) >= -1, `#${v.id} (${v.type.id}) pasa la línea del corte: frente a ${front(v).toFixed(1)}`);
      if (v.speed >= 0.5) continue;
      const ahead = traffic.vehicles
        .filter((o) => o !== v && o.row === v.row && (o.x - v.x) * v.dir > 0)
        .map((o) => (o.x - v.x) * v.dir - (o.type.length + v.type.length) / 2);
      const queued = ahead.length > 0 && Math.min(...ahead) <= 12;
      assert.ok(toLine(v) <= 2 || queued, `#${v.id} parado fuera de la cola, a ${toLine(v).toFixed(1)} px de la línea`);
    }
  }
}

// Fase 1: sin corte, cruzan en los dos sentidos.
const a = fresh();
const free = flowing(a.traffic, a.clock, FREE_STEPS);
for (const dir of [1, -1]) assert.ok((free.get(dir)?.size ?? 0) > 0, `fase 1: nadie cruza el tramo hacia ${dir}`);

// Fase 2: con corte, 130 minutos de juego.
a.traffic.close(sig);
a.traffic.close(sig);
closedRun(a.traffic, a.clock);
const held = a.traffic.vehicles.filter((v) => v.speed < 0.5 && toLine(v) >= -1 && toLine(v) <= 2);
for (const lane of flow.lanes) assert.ok(held.some((v) => v.row === lane.row), `fase 2: nadie espera en la línea del carril ${lane.row}`);

// Fase 3: al reabrir, los que esperaban cruzan y el flujo vuelve.
a.traffic.reopen(sig.id);
const again = flowing(a.traffic, a.clock, FREE_STEPS);
for (const v of held) assert.ok(again.get(v.dir)?.has(v.id), `fase 3: #${v.id} no arranca tras reabrir`);
for (const dir of [1, -1]) assert.ok((again.get(dir)?.size ?? 0) > 0, `fase 3: nadie cruza el tramo hacia ${dir}`);

// Control positivo: el mismo detector sin close() tiene que saltar.
const b = fresh();
flowing(b.traffic, b.clock, FREE_STEPS);
assert.throws(() => closedRun(b.traffic, b.clock), 'control: sin corte el detector no salta');

console.log(`check-protest-closure: ok (${def.id}: ${free.get(1)?.size}/${free.get(-1)?.size} cruces libres, ${held.length} parados en la línea, ${again.get(1)?.size}/${again.get(-1)?.size} tras reabrir)`);
