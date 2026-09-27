// Semáforos con la misma lógica que el juego (systems/Signals.ts): peatones de
// la calle y personajes con nombre cruzan en verde. `node scripts/check-signals.ts`.
import assert from 'node:assert/strict';
import { CHARACTERS } from '../src/data/characters.ts';
import { whereaboutsIn } from '../src/systems/Characters.ts';
import { getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { CYCLE_MS, MS_PER_GAME_MINUTE, PHASES, minutesUntilWalk, onCrossing, signalAt } from '../src/systems/Signals.ts';
import { StreetLife, streetProfileFor } from '../src/systems/StreetLife.ts';
import type { Clock } from '../src/systems/Crowd.ts';

const loc = getLocation('district');
const signals = loc.signals ?? [];
const ROAD = new Set(['.', '=', ':', 'z']);
assert.ok(signals.length >= 2, 'la avenida tiene semáforos');

// ------------------------------------------------------------------ ciclo
assert.equal((1440 * MS_PER_GAME_MINUTE) % CYCLE_MS, 0, 'el ciclo no divide el día: saltaría a medianoche');
for (const [car, walk] of PHASES) assert.ok(walk === 'stop' || car === 'red', 'verde para peatones con coches en verde o ámbar');
for (const sig of signals) {
  for (let m = 0; m < 1440; m += 0.37) {
    const wait = minutesUntilWalk(sig, m);
    assert.ok(wait >= 0 && wait * MS_PER_GAME_MINUTE < CYCLE_MS, 'espera fuera del ciclo');
    assert.equal(signalAt(sig, m + wait + 1e-6).walk, 'walk', `a las ${m} + ${wait} no está verde`);
  }
}

// ---------------------------------------------------------- peatones de la calle
// Hora punta de mañana y de tarde: quien pisa las bandas lo hace con el muñeco en verde.
let entries = 0;
let onRed = 0;
let waited = 0;
const PLAYER = { tx: 72, ty: 53 };
for (const [day, hour] of [[1, 8], [2, 18], [5, 13]] as const) {
  const street = new StreetLife(loc, streetProfileFor('district')!, seededRng(day * 7 + hour));
  let clock: Clock = { day, hour, minute: 0 };
  street.populate(clock, PLAYER);
  const inside = new Map<number, boolean>();
  let elapsed = 0;
  let minute = hour * 60;
  for (let ms = 0; ms < 90 * MS_PER_GAME_MINUTE; ms += 50) {
    street.update(50, clock, PLAYER);
    elapsed += 50;
    if (elapsed >= MS_PER_GAME_MINUTE) {
      elapsed -= MS_PER_GAME_MINUTE;
      minute++;
      clock = { day, hour: Math.floor(minute / 60) % 24, minute: minute % 60 };
    }
    const now = minute + elapsed / MS_PER_GAME_MINUTE;
    for (const a of street.agents) {
      const sig = onCrossing(signals, { tx: a.x, ty: a.y });
      if (sig && inside.get(a.id) === false) {
        entries++;
        if (signalAt(sig, now).walk !== 'walk') onRed++;
      }
      inside.set(a.id, !!sig);
      if (a.hold) {
        waited++;
        assert.ok(!ROAD.has(loc.ground[Math.round(a.y)][Math.round(a.x)]), `esperando en la calzada en ${a.x},${a.y}`);
      }
    }
  }
  assert.equal(street.pathFailures, 0, 'caminos que no se encontraron');
}
assert.ok(entries >= 20, `pocos cruces para comprobar nada: ${entries}`);
assert.ok(waited > 0, 'nadie espera nunca en rojo');
// Sin sitio libre en el bordillo alguien cruza con prisa, pero es la excepción.
assert.ok(onRed <= Math.ceil(entries * 0.05), `cruzan en rojo ${onRed} de ${entries}`);

// --------------------------------------------------- personajes con nombre
let charEntries = 0;
let charWaits = 0;
for (const def of CHARACTERS) {
  for (const routine of def.routines) {
    let was = false;
    for (let m = 0; m < 1440; m += 0.05) {
      const w = whereaboutsIn(def, routine, m);
      if (w.location !== loc.id || w.inside) {
        was = false;
        continue;
      }
      if (w.waiting) {
        charWaits++;
        const tx = Math.round(w.tx);
        const ty = Math.round(w.ty);
        assert.ok(isWalkable(loc, tx, ty) && !ROAD.has(loc.ground[ty][tx]), `${def.npc} espera en sitio malo ${w.tx},${w.ty}`);
      }
      const sig = onCrossing(signals, { tx: w.tx, ty: w.ty });
      if (sig && !was) {
        charEntries++;
        assert.notEqual(signalAt(sig, m).walk, 'stop', `${def.npc}/${routine.id} cruza en rojo a las ${Math.floor(m / 60)}:${Math.floor(m % 60)}`);
      }
      was = !!sig;
    }
  }
}
assert.ok(charEntries > 0, 'ningún personaje cruza la avenida: no se ha comprobado nada');

console.log(`ciclo ${CYCLE_MS / 1000} s · calle: ${entries} cruces, ${onRed} en rojo, ${waited} pasos esperando · personajes: ${charEntries} cruces, ${charWaits} pasos esperando`);
console.log('OK: ciclo, peatones y personajes cruzan en verde y esperan en el bordillo.');
