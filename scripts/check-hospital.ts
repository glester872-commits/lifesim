// HOSP-01 · el turno del Hospital General de Vallesco (systems/Hospital) y su planta (data/hospitalVenues.ts).
import assert from 'node:assert/strict';
import { HOSPITAL_CALL_MINUTES, HOSPITAL_VISIT_MINUTES } from '../src/data/hospital.ts';
import { HOSPITAL } from '../src/data/hospitalVenues.ts';
import { attend, cancelTurn, emptyHospital, hospitalOpen, parseHospital, requestTurn, tick, turnStatus } from '../src/systems/Hospital.ts';
import { allLocations, getLocation } from '../src/systems/LocationSystem.ts';
import { createInitialState, SaveSystem } from '../src/systems/SaveSystem.ts';
import { SAVE_KEY, SAVE_VERSION } from '../src/config/constants.ts';
import type { GameStateData, HospitalState } from '../src/types/game.ts';

const at = (day: number, h: number, m = 0): number => (day - 1) * 1440 + h * 60 + m;
const T0 = at(1, 10);
assert.ok(hospitalOpen(T0), 'a las 10:00 las consultas están abiertas');

// (1) pedir turno crea uno en espera; pedir otro no lo duplica.
const first = requestTurn(emptyHospital(), T0);
assert.ok(first.ok);
assert.equal(turnStatus(first.state), 'waiting');
const twice = requestTurn(first.state, T0 + 1);
assert.ok(!twice.ok, 'un segundo pedido no da otro turno');
assert.deepEqual(twice.state, first.state);

// (2) antes de su hora no llama; a su hora, llamado con un aviso; repetirlo no avisa otra vez.
const early = tick(first.state, T0 + HOSPITAL_CALL_MINUTES - 1, true);
assert.ok(!early.changed && !early.notice && turnStatus(early.state) === 'waiting');
const called = tick(first.state, T0 + HOSPITAL_CALL_MINUTES, true);
assert.ok(called.changed && typeof called.notice === 'string');
assert.equal(turnStatus(called.state), 'called');
const again = tick(called.state, T0 + HOSPITAL_CALL_MINUTES + 5, true);
assert.ok(!again.changed && again.notice === undefined, 'el aviso no se repite');

// (3) la consulta no atiende en espera; llamado, atiende, dura lo suyo y no toca dinero, energía ni bolsa.
assert.ok(!attend(first.state, T0 + 10).ok, 'sin llamar no se atiende');
const game = createInitialState();
const before = { money: game.money, energy: game.energy, inventory: structuredClone(game.inventory) };
const seen = attend(called.state, T0 + HOSPITAL_CALL_MINUTES);
assert.ok(seen.ok);
assert.equal(seen.minutes, HOSPITAL_VISIT_MINUTES);
assert.ok(seen.minutes > 0, 'la consulta adelanta el reloj');
assert.equal(turnStatus(seen.state), 'done');
assert.equal(seen.state.lastVisitDay, 1);
assert.deepEqual({ money: game.money, energy: game.energy, inventory: game.inventory }, before);
assert.ok(!('money' in seen.state) && !('energy' in seen.state), 'el hospital no guarda dinero ni energía');

// (4) a mitad del llamado, guardar y cargar: se atiende una vez; otra el mismo día, no.
const reloaded = parseHospital(JSON.parse(JSON.stringify(called.state)));
assert.ok(reloaded);
assert.deepEqual(reloaded, called.state);
const once = attend(reloaded, T0 + 50);
assert.ok(once.ok);
assert.ok(!attend(once.state, T0 + 80).ok, 'atendido: no se repite');
assert.ok(!requestTurn(once.state, T0 + 90).ok, 'una consulta al día');
assert.ok(requestTurn(once.state, at(2, 9)).ok, 'al día siguiente, otro turno');

// (5) cancelar libera y deja pedir otro.
const cancelled = cancelTurn(first.state);
assert.ok(cancelled.ok);
assert.equal(turnStatus(cancelled.state), 'cancelled');
assert.ok(!cancelTurn(cancelled.state).ok);
assert.ok(requestTurn(cancelled.state, T0 + 5).ok, 'cancelado, se puede pedir otro');

// (6) al cerrar, el turno pendiente se cancela (con aviso) y la salida sigue ahí.
assert.ok(!hospitalOpen(at(1, 21, 30)), 'a las 21:30 está cerrado');
const shut = tick(called.state, at(1, 21, 30));
assert.equal(turnStatus(shut.state), 'cancelled');
assert.ok(shut.notice);
const exit = HOSPITAL.portals.find((p) => p.to.location === 'district');
assert.ok(exit, 'el hospital tiene salida a la calle');
assert.ok(getLocation('district').spawns[exit.to.spawn], 'la salida deja delante de la puerta');
assert.ok(getLocation('district').portals.some((p) => p.to.location === 'hospital' && HOSPITAL.spawns[p.to.spawn]), 'la puerta de la Ronda entra al hospital');

// (7) una partida sin `hospital` carga; un registro dañado se lee como «sin turno».
assert.equal(parseHospital(undefined), undefined);
assert.deepEqual(parseHospital({ ticket: { id: 'x', status: 'raro' } }), { ticket: null });
const store = new Map<string, string>();
const disk = new SaveSystem({ read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) });
const old = { ...createInitialState() } as Partial<GameStateData>;
delete old.hospital;
store.set(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, savedAt: 0, state: old }));
const loaded = disk.load();
assert.ok(loaded, 'la partida anterior carga');
assert.equal(loaded.hospital, undefined);
const withTurn: HospitalState = called.state;
assert.ok(disk.save({ ...(old as GameStateData), hospital: withTurn }));
assert.deepEqual(disk.load()?.hospital, withTurn, 'el turno vuelve igual del disco');

// (8) puntos únicos, asientos sin repetir, salidas con spawn y personal fuera de los sitios del público.
const owners = new Map<string, string>();
for (const loc of allLocations()) {
  for (const id of Object.keys(loc.points ?? {})) {
    if (!id.startsWith('HOSP_')) continue;
    assert.ok(!owners.has(id), `${id} está en ${owners.get(id)} y en ${loc.id}`);
    owners.set(id, loc.id);
  }
}
assert.ok(owners.size > 20);
const pts = Object.entries(HOSPITAL.points ?? {});
const seats = pts.filter(([, p]) => p.kind === 'seat').map(([, p]) => `${p.tx},${p.ty}`);
assert.equal(new Set(seats).size, seats.length, 'dos asientos en el mismo tile');
for (const p of HOSPITAL.portals) assert.ok(getLocation(p.to.location).spawns[p.to.spawn], `${p.id}: sin spawn en ${p.to.location}`);
const tile = (pre: readonly string[]): Set<string> => new Set(pts.filter(([id]) => pre.some((x) => id.startsWith(x))).map(([, p]) => `${p.tx},${p.ty}`));
const staff = tile(['HOSP_ADMIN_', 'HOSP_DOC_', 'HOSP_NURSE_', 'HOSP_TRIAGE_STAFF']);
const publicTiles = tile(['HOSP_DESK_', 'HOSP_QUEUE_', 'HOSP_WAIT_', 'HOSP_PATIENT_', 'HOSP_ER_WAIT_', 'HOSP_TRIAGE_DESK', 'HOSP_INFO', 'HOSP_EXIT']);
for (const t of staff) assert.ok(!publicTiles.has(t), `personal en un sitio de público: ${t}`);
// Admisión: el personal, en la fila de detrás del mostrador; el público, delante.
for (const [id, p] of pts) {
  if (id.startsWith('HOSP_ADMIN_')) assert.ok(HOSPITAL.props.some((q) => q.kind === 'counter' && q.tx === p.tx && q.ty === p.ty + 1), `${id} no está detrás del mostrador`);
  if (id.startsWith('HOSP_DESK_')) assert.ok(HOSPITAL.props.some((q) => q.kind === 'counter' && q.tx === p.tx && q.ty === p.ty - 1), `${id} no está delante del mostrador`);
}

console.log(`OK: hospital · turno, aviso único, consulta, guardado, cierre y ${owners.size} puntos HOSP_ únicos.`);
