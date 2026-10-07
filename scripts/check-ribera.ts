// La Ribera Norte con los mismos sistemas que el juego (data/ribera.ts, data/streets.ts, data/population.ts):
// `npm run check`. Falla si la gente no usa las instalaciones (pista, barras, bancos, helados, terrazas, el salón),
// si el atardecer no cambia la calle (más grupos y terrazas, menos corredores) o si alguien se atasca.
import assert from 'node:assert/strict';
import { getLocation, isStandable } from '../src/systems/LocationSystem.ts';
import { placeInfo } from '../src/systems/Places.ts';
import { StreetLife, streetProfileFor } from '../src/systems/StreetLife.ts';
import { Crowd, profileFor, type Clock } from '../src/systems/Crowd.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { getStation } from '../src/data/stations.ts';
import type { TilePoint } from '../src/types/game.ts';

const STEP_MS = 100;
const MS_PER_MIN = 500;
const SATURDAY = 6;
const TUESDAY = 2;
const at = (day: number, hhmm: string): Clock => ({ day, hour: Number(hhmm.slice(0, 2)), minute: Number(hhmm.slice(3)) });
const addMinutes = (c: Clock, m: number): Clock => {
  const total = c.hour * 60 + c.minute + m;
  return { day: c.day + Math.floor(total / 1440), hour: Math.floor((total % 1440) / 60), minute: total % 60 };
};

// ------------------------------------------------------------ la calle
const loc = getLocation('ribera');
const profile = streetProfileFor('ribera')!;
const ROADWAY = new Set(['.', '=', ':', 'z', 'b']);
// El jugador, lejos de todo: en la esquina de la acera norte.
const PLAYER: TilePoint = { tx: 38, ty: 10 };

interface Stats {
  /** Personas-minuto por rol. */
  roles: Map<string, number>;
  /** Personas-minuto quietas en un punto con puesto de uso, por puesto. */
  uses: Map<string, number>;
  peak: number;
}

function street(start: Clock, minutes: number, seed: number): Stats {
  const life = new StreetLife(loc, profile, seededRng(seed));
  life.populate(start, PLAYER);
  const roles = new Map<string, number>();
  const uses = new Map<string, number>();
  let clock = start;
  let elapsed = 0;
  let peak = 0;
  for (let ms = 0; ms < minutes * MS_PER_MIN; ms += STEP_MS) {
    life.update(STEP_MS, clock, PLAYER);
    elapsed += STEP_MS;
    const tickMinute = elapsed >= MS_PER_MIN;
    if (tickMinute) {
      elapsed -= MS_PER_MIN;
      clock = addMinutes(clock, 1);
      peak = Math.max(peak, life.agents.length);
    }
    const still: string[] = [];
    for (const a of life.agents) {
      const tile = `${Math.round(a.x)},${Math.round(a.y)}`;
      assert.ok(isStandable(loc, Math.round(a.x), Math.round(a.y)), `${a.role} dentro de algo en ${tile}`);
      const standing = !a.moving && a.path.length === 0 && a.delay <= 0 && !a.vanish;
      if (standing) {
        still.push(tile);
        assert.ok(!ROADWAY.has(loc.ground[Math.round(a.y)][Math.round(a.x)]), `${a.role} parado en el carril bici en ${tile}`);
      }
      if (!tickMinute) continue;
      roles.set(a.role, (roles.get(a.role) ?? 0) + 1);
      const use = standing && a.point ? loc.points?.[a.point]?.use : undefined;
      if (use) uses.set(use, (uses.get(use) ?? 0) + 1);
    }
    assert.equal(new Set(still).size, still.length, `dos personas quietas en el mismo sitio a las ${clock.hour}:${clock.minute}`);
  }
  assert.equal(life.pathFailures, 0, 'rutas no encontradas');
  return { roles, uses, peak };
}

const sum = (m: Map<string, number>, ...keys: string[]): number => keys.reduce((s, k) => s + (m.get(k) ?? 0), 0);

// Un martes de mañana (corredores y perros) frente a una tarde-noche de sábado (parejas, terrazas, grupos).
/** Varias semillas del mismo momento: las parejas y los grupos dependen de quién tiene con quién ir. */
function streets(start: Clock, minutes: number, seeds: readonly number[]): Stats {
  const runs = seeds.map((seed) => street(start, minutes, seed));
  const merge = (pick: (s: Stats) => Map<string, number>): Map<string, number> => {
    const out = new Map<string, number>();
    for (const run of runs) for (const [k, v] of pick(run)) out.set(k, (out.get(k) ?? 0) + v);
    return out;
  };
  return { roles: merge((s) => s.roles), uses: merge((s) => s.uses), peak: Math.max(...runs.map((s) => s.peak)) };
}
const MORNING = streets(at(TUESDAY, '06:30'), 150, [11, 3]);
// Seis semillas: las parejas dependen de quién tiene con quién ir y con dos salían o no por azar (una pareja cada dos o tres tardes).
const EVENING = streets(at(SATURDAY, '19:00'), 150, [11, 3, 17, 23, 29, 31]);
const AFTERNOON = streets(at(SATURDAY, '12:00'), 240, [5, 7]);
const LATE = streets(at(SATURDAY, '16:30'), 180, [5, 7]);

// Quien corre es de la mañana: al atardecer se reduce (y de noche, nadie).
assert.ok(sum(MORNING.roles, 'jogger') > 0, 'nadie corre por la mañana');
assert.ok(sum(MORNING.roles, 'jogger') > sum(EVENING.roles, 'jogger'), 'los corredores no disminuyen al atardecer');
assert.ok(sum(MORNING.roles, 'dog-walker') > 0, 'nadie saca al perro por la mañana');
// Lo social es del atardecer: parejas, terrazas, barandilla, bancos y grupos.
const social = (s: Stats): number => sum(s.roles, 'couple-walk', 'terrace-meal', 'bar-terrace', 'river-view', 'river-bench', 'riverside-walk');
assert.ok(social(EVENING) > social(MORNING) * 1.5, `el atardecer no es más social (${social(EVENING)} frente a ${social(MORNING)})`);
assert.ok(sum(EVENING.roles, 'couple-walk') > 0, 'no hay parejas al anochecer');
assert.ok(sum(EVENING.roles, 'terrace-meal') + sum(EVENING.roles, 'bar-terrace') > 0, 'las terrazas no se activan al anochecer');
// Las instalaciones se usan de verdad, con su movimiento (los puestos de uso de data/stations.ts).
const day = [MORNING, EVENING, AFTERNOON, LATE];
for (const use of ['hoops', 'pullup']) {
  assert.ok(day.some((s) => (s.uses.get(use) ?? 0) > 0), `nadie usa el puesto ${use}`);
  assert.ok(getStation(use), `${use} no es un puesto`);
}
for (const role of ['hoops', 'calisthenics', 'ice-cream', 'river-bench', 'river-view', 'gamer', 'terrace-cafe']) {
  assert.ok(day.some((s) => (s.roles.get(role) ?? 0) > 0), `nadie hace «${role}»`);
}
// Quien está en un punto con puesto se le ve hacer lo suyo: tirar a canasta, dominadas.
// (entities/Character los anima por el puesto del punto: activityAt devuelve station.motion.)
for (const [id, motion] of [['HOOPS_01', 'shoot'], ['PULLUP_01', 'hang']] as const) assert.equal(getStation(loc.points![id].use!)!.motion, motion, id);
for (const [id, motion] of [['ARCADE_FIGHT_01', 'play'], ['ARCADE_RHYTHM_01', 'step']] as const) assert.equal(getStation(getLocation('arcade').points![id].use!)!.motion, motion, id);
console.log(`calle: mañana ${MORNING.peak} personas como mucho, tarde-noche ${EVENING.peak}; corredores ${sum(MORNING.roles, 'jogger')}→${sum(EVENING.roles, 'jogger')} personas-minuto, social ${social(MORNING)}→${social(EVENING)}`);
console.log(`instalaciones: pista ${day.reduce((s, x) => s + (x.uses.get('hoops') ?? 0), 0)}, barras ${day.reduce((s, x) => s + (x.uses.get('pullup') ?? 0), 0)}, helados ${day.reduce((s, x) => s + (x.roles.get('ice-cream') ?? 0), 0)}, banco/barandilla ${day.reduce((s, x) => s + sum(x.roles, 'river-bench', 'river-view'), 0)} personas-minuto`);

// ------------------------------------------------------------ el salón recreativo
const arcade = getLocation('arcade');
const arcadePlace = placeInfo('arcade')!;
const arcadeProfile = profileFor('arcade')!;
const SPOT = { tx: 10, ty: 11 };

function hall(start: Clock, minutes: number, seed: number) {
  const crowd = new Crowd(arcade, arcadePlace, arcadeProfile, seededRng(seed));
  crowd.populate(start, SPOT);
  let clock = start;
  let elapsed = 0;
  const playing = new Map<string, number>();
  let peak = 0;
  let waiting = 0;
  let seated = 0;
  let left = 0;
  const seen = new Set<number>();
  for (let ms = 0; ms < minutes * MS_PER_MIN; ms += STEP_MS) {
    crowd.update(STEP_MS, clock, SPOT);
    elapsed += STEP_MS;
    const tickMinute = elapsed >= MS_PER_MIN;
    if (tickMinute) {
      elapsed -= MS_PER_MIN;
      clock = addMinutes(clock, 1);
      peak = Math.max(peak, crowd.agents.length);
    }
    const used = new Set<string>();
    for (const a of crowd.agents) {
      seen.add(a.id);
      assert.ok(isStandable(arcade, Math.round(a.x), Math.round(a.y)), `${a.role} dentro de algo en ${Math.round(a.x)},${Math.round(a.y)}`);
      if (a.moving || !a.point) continue;
      // Dos personas nunca en la misma máquina.
      assert.ok(!used.has(a.point), `dos personas en ${a.point}`);
      used.add(a.point);
      if (!tickMinute) continue;
      const kind = a.point.split('_')[1];
      if (a.state === 'PLAY') playing.set(kind, (playing.get(kind) ?? 0) + 1);
      else if (a.state === 'WAIT') waiting++;
      else if (a.state === 'REST') seated++;
    }
    left = Math.max(left, seen.size - crowd.agents.length);
  }
  return { playing, peak, waiting, seated, left };
}
const NIGHT = hall(at(SATURDAY, '20:00'), 180, 3);
const AFTER = hall(at(TUESDAY, '16:00'), 120, 4);
for (const kind of ['FIGHT', 'RACE', 'RHYTHM']) {
  assert.ok((NIGHT.playing.get(kind) ?? 0) + (AFTER.playing.get(kind) ?? 0) > 0, `nadie juega en ${kind}`);
}
assert.ok(NIGHT.waiting + AFTER.waiting > 0, 'nadie espera turno en el salón');
assert.ok(NIGHT.seated + AFTER.seated > 0, 'nadie se sienta en los sofás');
assert.ok(NIGHT.left > 0, 'nadie se va del salón: entra gente y se queda para siempre');
assert.ok(NIGHT.peak > AFTER.peak, 'el salón no se llena más por la noche del sábado que un martes por la tarde');
console.log(`salón: sábado noche ${NIGHT.peak} personas como mucho, martes tarde ${AFTER.peak}; jugando ${[...NIGHT.playing].map(([k, v]) => `${k.toLowerCase()} ${v}`).join(', ')}; esperan ${NIGHT.waiting}; sofás ${NIGHT.seated}; se han ido ${NIGHT.left}`);

console.log('\nOK: calle de la Ribera viva (corredores de mañana, parejas y terrazas de noche), pista, barras, helados, bancos y salón recreativo con gente usándolos.');
