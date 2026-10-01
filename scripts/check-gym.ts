// El gimnasio con vestuarios de verdad (data/interiors.ts: GYM, data/population.ts, systems/Crowd.ts): `npm run check`.
// Falla si los vestuarios no son habitaciones cerradas con su puerta, si las duchas no están dentro, si alguien
// se cambia fuera del vestuario o en el de otro género, si dos usan la misma taquilla o ducha, si alguien sale a la
// calle en ropa de deporte, si la ropa no vuelve a ser la de calle o si alguien se queda atascado.
import assert from 'node:assert/strict';
import { getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { placeInfo } from '../src/systems/Places.ts';
import { Crowd, profileFor, type Agent, type Clock } from '../src/systems/Crowd.ts';
import { IDENTITIES } from '../src/systems/People.ts';
import { PASSENGER_LOOKS } from '../src/data/npcs.ts';
import { createServer } from 'vite';
import { seededRng } from '../src/systems/MetroDaily.ts';

const loc = getLocation('gym');
const place = placeInfo('gym')!;
const profile = profileFor('gym')!;
const STEP_MS = 100;
const MS_PER_MIN = 500;
const PLAYER = { tx: 1, ty: 2 };
const at = (day: number, hhmm: string): Clock => ({ day, hour: Number(hhmm.slice(0, 2)), minute: Number(hhmm.slice(3)) });
const addMinutes = (c: Clock, m: number): Clock => {
  const total = c.hour * 60 + c.minute + m;
  return { day: c.day + Math.floor(total / 1440), hour: Math.floor((total % 1440) / 60), minute: total % 60 };
};

// ------------------------------------------------ la distribución: habitaciones cerradas
const points = loc.points!;
const WING_X = 26;
const room = (x: number, y: number): 'M' | 'F' | null => (x >= WING_X && y >= 2 && y <= 7 ? 'M' : x >= WING_X && y >= 9 && y <= 14 ? 'F' : null);
const names = Object.keys(points);
const change = { M: names.filter((n) => n.startsWith('GYM_CHANGE_M_')), F: names.filter((n) => n.startsWith('GYM_CHANGE_F_')) };
const shower = { M: names.filter((n) => n.startsWith('GYM_SHOWER_M_')), F: names.filter((n) => n.startsWith('GYM_SHOWER_F_')) };
for (const side of ['M', 'F'] as const) {
  assert.ok(change[side].length >= 6, `pocas taquillas en el vestuario ${side}`);
  assert.ok(shower[side].length >= 3, `pocas duchas en el vestuario ${side}`);
  for (const id of [...change[side], ...shower[side]]) {
    const p = points[id];
    assert.equal(room(p.tx, p.ty), side, `${id} no está dentro del vestuario ${side}`);
  }
}
// Ni máquinas ni recepción dentro de un vestuario, ni duchas fuera.
for (const id of names) {
  if (id.startsWith('GYM_CHANGE_') || id.startsWith('GYM_SHOWER_')) continue;
  const p = points[id];
  assert.equal(room(p.tx, p.ty), null, `${id} (máquina o recepción) dentro de un vestuario`);
}

/** Tiles a los que se llega andando desde la entrada, con algunos tiles bloqueados (las puertas). */
function reach(blocked: ReadonlySet<string> = new Set()): Set<string> {
  const start = loc.spawns!.entry;
  const seen = new Set<string>([`${start.tx},${start.ty}`]);
  const queue: [number, number][] = [[start.tx, start.ty]];
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const k = `${x + dx},${y + dy}`;
      if (seen.has(k) || blocked.has(k) || !isWalkable(loc, x + dx, y + dy)) continue;
      seen.add(k);
      queue.push([x + dx, y + dy]);
    }
  }
  return seen;
}
const here = (id: string): string => `${points[id].tx},${points[id].ty}`;
const open = reach();
for (const id of [...change.M, ...change.F, ...shower.M, ...shower.F]) assert.ok(open.has(here(id)), `${id} inalcanzable`);
// Con las dos puertas cerradas, ningún vestuario se alcanza: son habitaciones aparte, no un rincón de la sala.
assert.ok(isWalkable(loc, 25, 4) && isWalkable(loc, 25, 11), 'una puerta de vestuario no se puede cruzar');
const closed = reach(new Set(['25,4', '25,11']));
for (const id of [...change.M, ...change.F, ...shower.M, ...shower.F]) assert.ok(!closed.has(here(id)), `${id} se alcanza sin pasar por la puerta`);
// Cada vestuario con la suya: cerrando la de hombres, el de mujeres sigue abierto y el otro no.
const noMen = reach(new Set(['25,4']));
assert.ok(change.M.every((id) => !noMen.has(here(id))) && change.F.every((id) => noMen.has(here(id))), 'los dos vestuarios se comunican entre sí');
// Y entre los dos no hay paso (el muro de la fila 8).
for (let x = WING_X; x <= 40; x++) assert.ok(!isWalkable(loc, x, 8), `el muro entre vestuarios tiene un hueco en ${x},8`);
// Las duchas son cubículos: tabiques a los lados.
for (const side of ['M', 'F'] as const) {
  for (const id of shower[side]) {
    const p = points[id];
    assert.ok(!isWalkable(loc, p.tx - 1, p.ty) && !isWalkable(loc, p.tx + 1, p.ty), `${id} no es un cubículo (sin tabiques a los lados)`);
  }
}

// ------------------------------------------------ la ropa
// Vite resuelve los módulos de render sin exigir Phaser ni un navegador (como scripts/check-weather-looks.ts).
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom' });
const { WEATHER_LOOKS } = await server.ssrLoadModule('/src/world/WeatherLooks.ts') as typeof import('../src/world/WeatherLooks.ts');
const { colorsOf } = await server.ssrLoadModule('/src/world/HumanArt.ts') as typeof import('../src/world/HumanArt.ts');
await server.close();
const byId = new Map(WEATHER_LOOKS.map((l) => [l.id, l]));
const tops = new Set<string>();
const bottoms = new Set<string>();
for (const base of PASSENGER_LOOKS) {
  const gym = byId.get(`${base.id}~gym`);
  assert.ok(gym, `${base.id} no tiene ropa de entrenar`);
  // Sólo cambia lo que lleva puesto: piel, pelo y rasgos son los suyos.
  assert.equal(colorsOf(gym).skin, colorsOf(base).skin, `${base.id}: la piel cambia al entrenar`);
  assert.equal(gym.hair, base.hair, `${base.id}: el pelo cambia al entrenar`);
  assert.equal(gym.build, base.build);
  assert.equal(gym.glasses, base.glasses);
  assert.notEqual(gym.cloth, base.cloth, `${base.id}: sigue con la misma camiseta`);
  tops.add(gym.cloth);
  bottoms.add(`${gym.trousers}|${gym.shoes}`);
}
assert.ok(tops.size >= 8, `poca variedad de camisetas (${tops.size})`);
assert.ok(bottoms.size >= 20, `poca variedad de pantalón y zapatillas (${bottoms.size})`);

// ------------------------------------------------ el flujo de la gente
interface Track {
  sport: boolean;
  born: number;
  stillSince: number;
  showered: boolean;
  changed: boolean;
}

const sideOf = (a: Agent): 'M' | 'F' | null => {
  const g = IDENTITIES[a.look].gender;
  return g === 'woman' ? 'F' : g === 'man' ? 'M' : null;
};
const MACHINES = ['GYM_TREADMILL_', 'GYM_BIKE_', 'GYM_ROW_', 'GYM_BENCH_', 'GYM_SQUAT_', 'GYM_WEIGHTS_', 'GYM_CABLE_', 'GYM_MAT_'];

const stats = { sessions: 0, showered: 0, noShower: 0, toggles: 0, sportLooks: new Set<number>(), activities: new Set<string>(), maxInLockers: 0, showersUsed: 0, exitedSport: 0 };

function run(start: Clock, minutes: number, seed: number): void {
  const crowd = new Crowd(loc, place, profile, seededRng(seed));
  crowd.populate(start, PLAYER);
  const tracks = new Map<number, Track>();
  let clock = start;
  let elapsed = 0;
  let stepNo = 0;
  let prevIds = new Set<number>();
  for (let ms = 0; ms < minutes * MS_PER_MIN; ms += STEP_MS) {
    crowd.update(STEP_MS, clock, PLAYER);
    elapsed += STEP_MS;
    stepNo++;
    if (elapsed >= MS_PER_MIN) {
      elapsed -= MS_PER_MIN;
      clock = addMinutes(clock, 1);
    }
    const used = new Map<string, number>();
    let inLockers = 0;
    const ids = new Set<number>();
    for (const a of crowd.agents) {
      ids.add(a.id);
      if (a.kind !== 'visitor') continue;
      const x = Math.round(a.x);
      const y = Math.round(a.y);
      let t = tracks.get(a.id);
      if (!t) tracks.set(a.id, (t = { sport: !!a.sport, born: stepNo, stillSince: stepNo, showered: false, changed: false }));
      // Cada punto de cambio y de ducha, de una sola persona.
      if (a.point && /^GYM_(CHANGE|SHOWER)_/.test(a.point)) {
        assert.ok(!used.has(a.point) || used.get(a.point) === a.id, `${a.point} lo usan ${used.get(a.point)} y ${a.id}`);
        used.set(a.point, a.id);
        assert.equal(crowd.seats.ownerOf(a.point), a.id, `${a.point}: el dueño no es quien lo usa`);
        // Su vestuario, el de su identidad: nadie en el del otro género.
        const side = sideOf(a);
        if (side) assert.ok(a.point.includes(`_${side}_`), `${a.id} (${IDENTITIES[a.look].gender}) usa ${a.point}`);
      }
      // Cambia de ropa (a entrenar o a la de calle) sólo dentro de un vestuario.
      if (!!a.sport !== t.sport) {
        stats.toggles++;
        assert.ok(room(x, y) !== null, `${a.id} se cambia de ropa fuera del vestuario, en ${a.x.toFixed(1)},${a.y.toFixed(1)} (${a.state})`);
        if (a.sport) stats.sportLooks.add(a.look);
        t.changed = true;
        t.sport = !!a.sport;
      }
      if (room(x, y)) inLockers++;
      // Ducha: dentro del vestuario, quieto en su cubículo.
      if (a.state === 'SHOWER' && a.path.length === 0 && !a.moving) {
        assert.ok(a.point?.startsWith('GYM_SHOWER_'), `${a.id} en estado de ducha fuera de una ducha (${a.point})`);
        t.showered = true;
        stats.showersUsed++;
      }
      // En una máquina siempre con ropa de entrenar; llegando y en recepción, con la de calle.
      if (a.path.length === 0 && a.point && MACHINES.some((m) => a.point!.startsWith(m)) && a.state !== 'WAIT') assert.ok(a.sport, `${a.id} entrena en ${a.point} con ropa de calle`);
      if (a.state === 'CHECK_IN' || a.state === 'ENTER') assert.ok(!a.sport, `${a.id} llega ya con ropa de deporte`);
      if (a.sport) stats.activities.add(a.state);
      // Quien sale lo hace con su ropa de calle.
      if (a.leaving && a.sport) stats.exitedSport++;
      // Atascos: quieto, sin hacer nada, más de una hora de juego en el mismo sitio.
      if (a.moving || a.path.length > 0) t.stillSince = stepNo;
      assert.ok(stepNo - t.stillSince < (70 * MS_PER_MIN) / STEP_MS || a.talking, `${a.id} lleva más de una hora quieto en ${a.point} (${a.state})`);
      assert.ok(stepNo - t.born < (260 * MS_PER_MIN) / STEP_MS, `${a.id} lleva más de cuatro horas en el gimnasio`);
    }
    stats.maxInLockers = Math.max(stats.maxInLockers, inLockers);
    for (const id of prevIds) {
      if (ids.has(id)) continue;
      const t = tracks.get(id);
      if (t?.changed) {
        stats.sessions++;
        if (t.showered) stats.showered++;
        else stats.noShower++;
      }
    }
    prevIds = ids;
  }
  assert.equal(crowd.pathFailures, 0, 'rutas no encontradas');
}

for (const [day, hhmm, seed] of [[3, '18:30', 1], [3, '18:30', 2], [3, '07:00', 3], [2, '17:30', 4], [6, '10:00', 5], [3, '12:30', 6], [2, '22:30', 7]] as const) run(at(day, hhmm), 150, seed);

assert.ok(stats.toggles >= 20, `casi nadie se cambió (${stats.toggles})`);
assert.ok(stats.sessions >= 8, `pocas visitas completas (${stats.sessions})`);
assert.ok(stats.showered > 0 && stats.noShower > 0, `todos o ninguno se duchan (${stats.showered} sí, ${stats.noShower} no)`);
assert.ok(stats.showered / stats.sessions > 0.15 && stats.showered / stats.sessions < 0.9, `la proporción de duchas no es creíble (${stats.showered}/${stats.sessions})`);
assert.ok(stats.sportLooks.size >= 8, `poca variedad entrenando (${stats.sportLooks.size} caras)`);
assert.ok(stats.activities.size >= 5, `todos hacen lo mismo (${[...stats.activities].join(', ')})`);
assert.ok(stats.maxInLockers >= 2, 'los vestuarios no se llenan nunca');
assert.equal(stats.exitedSport, 0, `${stats.exitedSport} pasos de gente que sale en ropa de deporte`);

console.log(
  `gimnasio OK: 2 vestuarios cerrados (${change.M.length + change.F.length} taquillas, ${shower.M.length + shower.F.length} duchas dentro) · ${stats.toggles} cambios de ropa, todos en un vestuario, del suyo · ` +
  `${stats.showered} de ${stats.sessions} visitas con ducha · ${stats.sportLooks.size} caras distintas entrenando, ${tops.size} camisetas · hasta ${stats.maxInLockers} a la vez en vestuarios · nadie sale en ropa de deporte`,
);
