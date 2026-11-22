// QA-03: regresiones de autorización real de PassengerAI, sin Phaser/render.
// `node scripts/check-passenger-access.ts --baseline` ejecuta los mismos casos
// contra el código base en memoria: debe fallar, sin cambiar el checkout.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { METRO_CONFIG } from '../src/config/metro.ts';
import { PassengerAI as CurrentPassengerAI, type PassengerWorld } from '../src/systems/PassengerAI.ts';
import { TrainSystem, type TrainState } from '../src/systems/TrainSystem.ts';
import type { Walker } from '../src/entities/Walker.ts';
import type { Vec2 } from '../src/types/game.ts';

let PassengerAI = CurrentPassengerAI;
if (process.argv.includes('--baseline')) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const original = execFileSync('git', ['show', 'd84f8fc:src/systems/PassengerAI.ts'], { cwd: root, encoding: 'utf8' });
  const js = stripTypeScriptTypes(original).replace(/from\s+(['"])(\.\.?\/[^'"]+)\1/g,
    (_match, quote: string, specifier: string) => `from ${quote}${new URL(specifier, new URL('../src/systems/PassengerAI.ts', import.meta.url)).href}${quote}`);
  PassengerAI = (await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)).PassengerAI;
  console.log('Control positivo: código PassengerAI de d84f8fc, importado solo en memoria.');
}

class TestWalker {
  x = 184;
  y = 109;
  visible = true;
  moving = false;
  active = true;
  path: Vec2[] = [];
  finish = false;
  steps = 0;
  afterStep: (() => void) | null = null;
  lookChanges = 0;

  setLook(): void { this.lookChanges++; }
  place(p: Vec2): void { this.x = p.x; this.y = p.y; this.visible = true; }
  face(): void { /* El render queda fuera de esta prueba. */ }
  setIcon(): void { /* El render queda fuera de esta prueba. */ }
  walk(path: Vec2[]): void { this.path = path.map((p) => ({ ...p })); this.moving = path.length > 0; }
  halt(): void { this.path = []; this.moving = false; }
  hide(): void { this.halt(); this.visible = false; }
  step(): boolean {
    this.steps++;
    if (!this.finish) return false;
    const end = this.path.at(-1);
    if (end) { this.x = end.x; this.y = end.y; }
    this.path = [];
    this.moving = false;
    this.afterStep?.();
    return true;
  }
}

type Internals = {
  doorX: number;
  boardingCycle: number;
  lane: number;
  spot: number;
  seat: number;
  forceRun: boolean;
  next: (() => void) | null;
  holdMs: number;
  board(): void;
  maybeRunForTrain(): void;
};

function fixture(doorX = 56, lane = 3, appearance = 'qa03-a') {
  const train = new TrainSystem(METRO_CONFIG, { enterX: 368, stopX: 32, exitX: -304 }, true);
  const walker = new TestWalker();
  const releasedSpots: number[] = [];
  const releasedSeats: number[] = [];
  let newcomers = 0;
  const layout = {
    entrance: { x: 184, y: 221 },
    gates: [{ gate: { x: 184, y: 173 }, lobby: { x: 184, y: 189 } }],
    walkY: 109,
    edgeY: 92,
    spots: [{ at: { x: 184, y: 109 }, front: true }],
    seats: [{ x: 216, y: 128 }],
    signs: [],
    doorXs: [56, 104, 152, 200, 248, 296],
  };
  const world = {
    train, layout, cfg: METRO_CONFIG,
    profile: { respawn: [10_000, 20_000], boardChance: 1 }, mood: {},
    claimSpot: () => 0,
    releaseSpot: (index: number) => releasedSpots.push(index),
    claimSeat: () => -1,
    releaseSeat: (index: number) => releasedSeats.push(index),
    canEnter: () => true,
    newcomer: () => { newcomers++; return { archetype: 'CALM', look: { id: appearance } }; },
    talkPartner: () => null, exitingNear: () => false,
    note: () => {}, flagTrack: () => {}, stopId: () => null, trainHeading: () => 1,
  } as unknown as PassengerWorld;
  const passenger = new PassengerAI(walker as unknown as Walker, world);
  const internal = passenger as unknown as Internals;
  internal.doorX = doorX;
  internal.lane = lane;
  passenger.state = 'REACTING_TO_TRAIN';
  return { train, walker, passenger, internal, layout, releasedSpots, releasedSeats, newcomers: () => newcomers };
}

let passed = 0;
const failed: string[] = [];
function check(name: string, run: () => void): void {
  try { run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed.push(name); console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`); }
}

for (const state of ['STOPPED', 'DOORS_OPENING', 'DOORS_CLOSING', 'DEPARTING', 'AWAY', 'ARRIVING', 'APPROACHING'] as TrainState[]) {
  check(`no completa embarque tras pasar a ${state}`, () => {
    const f = fixture();
    f.internal.board();
    f.walker.y = 93;
    f.walker.finish = true;
    f.train.state = state;
    f.train.speed = state === 'DEPARTING' || state === 'ARRIVING' ? 50 : 0;
    f.passenger.update(16);
    assert.notEqual(f.passenger.state, 'RIDING');
    assert.equal(f.walker.visible, true);
    assert.equal(f.walker.steps, 0, 'no consume waypoint sin autorización');
    assert.ok(f.walker.y >= f.layout.walkY, 'regresa a andén seguro');
  });
}

check('revalida la puerta al consumir el callback terminal', () => {
  const f = fixture();
  f.internal.board();
  f.walker.finish = true;
  f.walker.afterStep = () => { f.train.state = 'DEPARTING'; f.train.speed = 50; };
  f.passenger.update(16);
  assert.notEqual(f.passenger.state, 'RIDING');
  assert.equal(f.walker.visible, true);
  assert.ok(f.walker.y >= f.layout.walkY);
});

check('no embarca en un ciclo de tren distinto', () => {
  const f = fixture();
  f.internal.board();
  f.walker.finish = true;
  f.train.cycle++;
  f.passenger.update(16);
  assert.notEqual(f.passenger.state, 'RIDING');
  assert.equal(f.walker.steps, 0);
});

check('rechaza estado incoherente de puertas abiertas con velocidad', () => {
  const f = fixture();
  f.train.speed = 10;
  f.internal.board();
  f.walker.finish = true;
  f.passenger.update(16);
  assert.notEqual(f.passenger.state, 'RIDING');
  assert.equal(f.walker.visible, true);
});

check('rechaza puerta de embarque inexistente', () => {
  const f = fixture(9999);
  f.internal.board();
  f.walker.finish = true;
  f.passenger.update(16);
  assert.notEqual(f.passenger.state, 'RIDING');
  assert.ok(f.walker.x < 352);
});

for (const doorX of [56, 152, 296]) {
  for (const lane of [-3, 3]) {
    check(`embarque legal y corredor centrado puerta${doorX} lane${lane}`, () => {
      const f = fixture(doorX, lane);
      f.internal.board();
      const final = f.walker.path.at(-1)!;
      assert.equal(final.x, doorX);
      assert.equal(final.y, f.layout.edgeY);
      assert.ok(final.x - 6 >= doorX - 6 && final.x + 6 <= doorX + 6, 'collider entero dentro de abertura');
      f.walker.finish = true;
      f.passenger.update(16);
      assert.equal(f.passenger.state, 'RIDING');
      assert.equal(f.walker.visible, false);
    });
  }
}

check('cancelación libera reservas, callback antiguo y admite reintento', () => {
  const f = fixture();
  f.internal.spot = 0;
  f.internal.seat = 0;
  f.internal.board();
  const stale = f.internal.next;
  f.train.state = 'DOORS_CLOSING';
  f.passenger.update(16);
  assert.deepEqual(f.releasedSpots, [0]);
  assert.deepEqual(f.releasedSeats, [0]);
  assert.notEqual(f.internal.next, stale, 'callback terminal descartado');
  assert.equal(f.walker.moving, false);
  f.train.state = 'BOARDING';
  f.train.speed = 0;
  f.train.cycle++;
  f.internal.board();
  f.walker.finish = true;
  f.passenger.update(16);
  assert.equal(f.passenger.state, 'RIDING');
});

for (const state of ['DEPARTING', 'AWAY', 'DOORS_CLOSING', 'DOORS_OPENING'] as TrainState[]) {
  check(`descenso rechazado conserva identidad y posición en ${state}`, () => {
    const f = fixture();
    const before = { x: f.walker.x, y: f.walker.y, state: f.passenger.state, lookChanges: f.walker.lookChanges };
    f.train.state = state;
    f.passenger.alight(56);
    assert.deepEqual({ x: f.walker.x, y: f.walker.y, state: f.passenger.state, lookChanges: f.walker.lookChanges }, before);
    assert.equal(f.newcomers(), 0);
  });
}

check('descenso por puerta inexistente no consume identidad/destino', () => {
  const f = fixture();
  const trip = { id: 'qa03-trip' };
  f.passenger.trip = trip as unknown as NonNullable<CurrentPassengerAI['trip']>;
  f.passenger.alight(9999);
  assert.equal(f.newcomers(), 0);
  assert.equal(f.passenger.trip, trip);
  assert.equal(f.walker.x, 184);
  assert.notEqual(f.passenger.state, 'EXITING_TRAIN');
});

for (const [doorX, appearance] of [[56, 'qa03-a'], [296, 'qa03-b']] as const) {
  check(`descenso legal centrado puerta${doorX}, aspecto${appearance}`, () => {
    const f = fixture(doorX, -3, appearance);
    f.passenger.alight(doorX);
    assert.equal(f.passenger.state, 'EXITING_TRAIN');
    assert.equal(f.walker.x, doorX);
    assert.equal(f.walker.y, f.layout.edgeY);
    assert.equal(f.walker.path[0].x, doorX);
    assert.equal(f.newcomers(), 1);
    f.train.state = 'DEPARTING';
    f.passenger.update(16);
    assert.equal(f.passenger.state, 'EXITING_TRAIN', 'ya está en el andén y puede continuar saliendo');
    assert.ok(f.walker.y >= f.layout.edgeY);
  });
}

check('corredor del pasajero con prisa espera apertura completa', () => {
  const f = fixture(56, 3);
  f.passenger.state = 'ENTERING_STATION';
  f.internal.forceRun = true;
  f.train.state = 'DOORS_OPENING';
  f.internal.maybeRunForTrain();
  assert.notEqual(f.passenger.state, 'BOARDING');
  f.train.state = 'BOARDING';
  f.internal.maybeRunForTrain();
  assert.equal(f.passenger.state, 'BOARDING');
  const doorX = f.internal.doorX;
  assert.equal(f.walker.path.at(-1)!.x, doorX);
  f.walker.finish = true;
  f.walker.afterStep = () => { f.train.cycle++; };
  f.passenger.update(16);
  assert.notEqual(f.passenger.state, 'RIDING');
});

console.log(`passenger-access: ${passed} PASS, ${failed.length} FAIL. Física, render, estaciones reales y HUD requieren navegador.`);
if (failed.length) process.exitCode = 1;
