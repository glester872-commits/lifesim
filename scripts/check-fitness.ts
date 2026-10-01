// Entrenar en el gimnasio (systems/Fitness.ts, puestos de data/stations.ts, ocupación de systems/Crowd.ts): `npm run check`.
// Falla si una sesión cambia al jugador de golpe, si se puede aprovechar sin límite, si cortar a medias da lo mismo que acabar,
// si la partida no guarda la forma física, o si la gente puede quitarle una máquina al jugador (o él una a la gente).
import assert from 'node:assert/strict';
import { STATIONS } from '../src/data/stations.ts';
import {
  INTENSITIES, INTENSITY_ORDER, KIND_OF, START_FITNESS, bodyProgress, parseFitness, quote, settle, summary, train,
  type Fitness, type Intensity,
} from '../src/systems/Fitness.ts';
import { SaveSystem } from '../src/systems/SaveSystem.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { placeInfo } from '../src/systems/Places.ts';
import { Crowd, profileFor, type Clock } from '../src/systems/Crowd.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';

const DAY = 1440;
const total = (f: Fitness): number => f.fitness + f.strength + f.stamina;

// ------------------------------------------------ qué se puede entrenar
const gym = getLocation('gym');
const usable = new Set(Object.values(gym.points!).map((p) => p.use).filter((u): u is string => !!u && KIND_OF[u] !== undefined));
for (const id of ['treadmill', 'bike', 'rower', 'bench-press', 'dumbbells', 'squat-rack', 'cable', 'stretch']) {
  assert.ok(usable.has(id), `el gimnasio no tiene ${id} entrenable`);
  assert.ok(STATIONS[id as keyof typeof STATIONS], `${id} no es un puesto`);
}
assert.equal(KIND_OF.water, undefined, 'la fuente no se entrena');
const kinds = new Set(Object.values(KIND_OF));
assert.deepEqual([...kinds].sort(), ['cardio', 'mobility', 'strength']);

// ------------------------------------------------ una sesión no transforma a nadie
let f: Fitness = { ...START_FITNESS };
{
  const out = train(f, 'treadmill', 'normal', 1, 600, 1, 100);
  assert.ok(out.delta.stamina > 0 && out.delta.stamina < 1, `una sesión de cardio sube demasiado la resistencia (${out.delta.stamina})`);
  assert.ok(out.delta.strength === 0, 'el cardio sube la fuerza');
  assert.ok(out.delta.fitness > 0 && out.delta.fitness < 0.6);
  const lift = train(f, 'bench-press', 'normal', 1, 600, 1, 100);
  assert.ok(lift.delta.strength > 0 && lift.delta.strength < 1 && lift.delta.stamina === 0, 'las pesas suben fuerza, no resistencia');
  const hard = train(f, 'bench-press', 'hard', 1, 600, 1, 100);
  assert.ok(hard.delta.strength < 1.2 && hard.delta.strength > lift.delta.strength, 'intenso: algo más, nunca de golpe');
  assert.ok(total(hard.next) - total(f) < 2.5, 'una sola sesión cambia al jugador radicalmente');
  assert.ok(hard.next.fatigue > lift.next.fatigue, 'intenso no cansa más');
  assert.ok(hard.energy > lift.energy && lift.energy > train(f, 'bench-press', 'soft', 1, 600, 1, 100).energy, 'la energía no sube con la intensidad');
}

// ------------------------------------------------ progreso gradual a lo largo de las semanas
{
  let cur: Fitness = { ...START_FITNESS };
  const history: number[] = [];
  for (let day = 1; day <= 60; day++) {
    const now = day * DAY + 18 * 60;
    cur = train(cur, day % 2 ? 'treadmill' : 'bench-press', 'normal', 1, now, day, 100).next;
    history.push(total(cur));
  }
  assert.ok(history.every((v, i) => i === 0 || v >= history[i - 1]), 'la forma baja entrenando');
  const gain = history[59] - total(START_FITNESS);
  assert.ok(gain > 8 && gain < 45, `en dos meses de gimnasio la subida no es creíble (${gain.toFixed(1)} puntos)`);
  // Despacio: la primera semana sube menos de lo que se llega a notar en dos meses.
  assert.ok(history[6] - total(START_FITNESS) < gain * 0.4, 'la primera semana sube demasiado');
  assert.ok(cur.stamina < 60 && cur.strength < 60, 'se llega a atleta en dos meses');
  console.log(`  60 días de gimnasio, una sesión al día: +${gain.toFixed(1)} puntos entre forma, fuerza y resistencia`);
}

// ------------------------------------------------ no se puede abusar: sesiones seguidas el mismo día y atributos altos
{
  let cur: Fitness = { ...START_FITNESS };
  const gains: number[] = [];
  for (let k = 0; k < 6; k++) {
    const before = total(cur);
    cur = train(cur, 'treadmill', 'normal', 1, 100 * DAY + k * 40, 100, 100).next;
    gains.push(total(cur) - before);
  }
  assert.ok(gains[2] < gains[0] * 0.75 && gains[4] < gains[2] * 0.5, `las sesiones del mismo día no rinden cada vez menos (${gains.map((g) => g.toFixed(2)).join(', ')})`);
  assert.ok(cur.sessions === 6 && cur.day === 100);
  // Al día siguiente vuelve a contar entera.
  const next = train(settle(cur, 101 * DAY), 'treadmill', 'normal', 1, 101 * DAY + 600, 101, 100);
  assert.ok(next.delta.stamina > gains[5] / 2, 'al día siguiente sigue castigado');
  // Un atributo alto sube menos que uno bajo.
  const low = train({ ...START_FITNESS, stamina: 10 }, 'treadmill', 'normal', 1, DAY, 1, 100).delta.stamina;
  const high = train({ ...START_FITNESS, stamina: 90 }, 'treadmill', 'normal', 1, DAY, 1, 100).delta.stamina;
  assert.ok(high < low * 0.25, 'arriba cuesta lo mismo que abajo');
  assert.ok(train({ ...START_FITNESS, stamina: 100, fitness: 100 }, 'treadmill', 'hard', 1, DAY, 1, 100).next.stamina <= 100, 'se pasa del tope');
}

// ------------------------------------------------ cansancio y energía
{
  let cur: Fitness = { ...START_FITNESS };
  for (let k = 0; k < 4; k++) cur = train(cur, 'bench-press', 'hard', 1, 200 * DAY + k * 60, 200, 100).next;
  assert.ok(cur.fatigue > 25, `el intenso no cansa (${cur.fatigue})`);
  const hours = (h: number): number => settle(cur, cur.at + h * 60).fatigue;
  assert.ok(hours(2) < cur.fatigue && hours(8) < hours(2), 'el cansancio no baja con las horas');
  assert.ok(hours(20) < 5, 'el cansancio no se va con un día');
  // Estirar quita cansancio y no cuesta casi nada.
  const stretched = train(cur, 'stretch', 'normal', 1, cur.at, 200, 100);
  assert.ok(stretched.next.fatigue < cur.fatigue && stretched.energy < 5, 'estirar no descansa');
  // Con mucho cansancio no se deja ir al máximo; con poca energía, tampoco.
  const wrecked = { ...START_FITNESS, fatigue: 90 };
  assert.ok(quote(wrecked, 'treadmill', 'hard', 100).blocked, 'agotado puede entrenar a tope');
  assert.equal(quote(wrecked, 'treadmill', 'soft', 100).blocked, null, 'agotado no puede hacer nada suave');
  assert.ok(quote(START_FITNESS, 'treadmill', 'hard', 5).blocked, 'sin energía entrena a tope');
  assert.equal(quote(START_FITNESS, 'treadmill', 'soft', 6).blocked, null);
  assert.ok(quote(wrecked, 'treadmill', 'normal', 100).energy > quote(START_FITNESS, 'treadmill', 'normal', 100).energy, 'cansado no cuesta más');
  // Duraciones: suave 15, normal 30, intenso 50; estirar, la mitad.
  assert.deepEqual(INTENSITY_ORDER.map((i: Intensity) => quote(START_FITNESS, 'treadmill', i, 100).minutes), [15, 30, 50]);
  assert.deepEqual(INTENSITY_ORDER.map((i: Intensity) => quote(START_FITNESS, 'stretch', i, 100).minutes), [8, 15, 25]);
  assert.equal(INTENSITIES.hard.minutes, 50);
  assert.equal(quote(START_FITNESS, 'water', 'normal', 100).blocked, 'Aquí no se entrena.');
}

// ------------------------------------------------ cortar a medias
{
  const full = train(START_FITNESS, 'treadmill', 'normal', 1, DAY, 1, 100);
  const half = train(START_FITNESS, 'treadmill', 'normal', 0.5, DAY, 1, 100);
  const short = train(START_FITNESS, 'treadmill', 'normal', 0.3, DAY, 1, 100);
  assert.ok(Math.abs(half.delta.stamina - full.delta.stamina / 2) < 0.02, 'cortar a la mitad no da la mitad');
  assert.ok(Math.abs(half.energy - full.energy / 2) < 0.6, 'cortar a la mitad no cuesta la mitad de energía');
  assert.equal(half.next.sessions, 1, 'media sesión no cuenta para el día');
  assert.equal(short.next.sessions, 0, 'una sesión corta cuenta para el límite diario');
  assert.equal(train(START_FITNESS, 'treadmill', 'normal', 0, DAY, 1, 100).energy, 0);
  assert.deepEqual(train(START_FITNESS, 'treadmill', 'normal', 0, DAY, 1, 100).delta, { fitness: 0, strength: 0, stamina: 0, fatigue: 0 });
}

// ------------------------------------------------ cuerpo (gancho para más adelante) y partida
{
  const b0 = bodyProgress(START_FITNESS);
  assert.deepEqual(b0, { athletic: 0, muscular: 0, posture: 0 }, 'un principiante ya tiene cuerpo cambiado');
  const b1 = bodyProgress({ ...START_FITNESS, fitness: 60, strength: 70 });
  assert.ok(b1.athletic > 0.4 && b1.muscular > 0.5 && b1.posture > 0.3 && b1.athletic <= 1 && b1.muscular <= 1);
  assert.ok(summary(START_FITNESS).includes('Forma'));

  const store = new Map<string, string>();
  const save = new SaveSystem({ read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) });
  const base = { money: 50, energy: 80, day: 2, hour: 11, minute: 0, locationId: 'district', position: { x: 10, y: 10 }, facing: 'down' as const, events: undefined as never, inventory: {}, cards: {}, appearance: {}, wardrobe: [] as string[] };
  const trained = train(train({ ...START_FITNESS }, 'bench-press', 'normal', 1, 3 * DAY, 3, 100).next, 'treadmill', 'hard', 1, 3 * DAY + 60, 3, 100).next;
  save.save({ ...base, fitness: trained });
  assert.deepEqual(save.load()!.fitness, trained, 'la forma física no se guarda igual');
  // Partidas anteriores no la tienen: empiezan de cero; un campo roto se repone sin romper la carga.
  save.save({ ...base });
  assert.deepEqual(save.load()!.fitness, START_FITNESS);
  assert.deepEqual(parseFitness({ fitness: 'mucha', strength: 500, stamina: -3, fatigue: NaN }), { ...START_FITNESS, strength: 100, stamina: 0, fatigue: 0 });
  assert.deepEqual(parseFitness(null), START_FITNESS);
}

// ------------------------------------------------ la gente y el jugador comparten las máquinas
{
  const place = placeInfo('gym')!;
  const profile = profileFor('gym')!;
  const player = { tx: 1, ty: 2 };
  const at = (day: number, hhmm: string): Clock => ({ day, hour: Number(hhmm.slice(0, 2)), minute: Number(hhmm.slice(3)) });
  const stepMinutes = (crowd: Crowd, clock: Clock, minutes: number, each?: () => void): Clock => {
    let c = clock;
    let elapsed = 0;
    for (let ms = 0; ms < minutes * 500; ms += 100) {
      crowd.update(100, c, player);
      each?.();
      elapsed += 100;
      if (elapsed >= 500) {
        elapsed = 0;
        const t = c.hour * 60 + c.minute + 1;
        c = { day: c.day, hour: Math.floor(t / 60), minute: t % 60 };
      }
    }
    return c;
  };
  const machines = Object.entries(gym.points!).filter(([, p]) => p.use && KIND_OF[p.use]).map(([id]) => id);
  let reservedAt = 0;
  let neverTaken = true;
  let busyBlocksPlayer = 0;
  for (const seed of [1, 2, 3, 4]) {
    const crowd = new Crowd(gym, place, profile, seededRng(seed));
    let clock = at(3, '18:30');
    crowd.populate(clock, player);
    clock = stepMinutes(crowd, clock, 10);
    // Una máquina que usa alguien: el jugador no puede cogerla (no está libre).
    const used = crowd.agents.find((a) => a.kind === 'visitor' && a.point && machines.includes(a.point));
    if (used) {
      assert.notEqual(crowd.occupancy(used.point!), 'FREE', 'el jugador podría usar una máquina ocupada');
      busyBlocksPlayer++;
    }
    // Otra, libre: el jugador la elige y es suya en el acto; nadie la coge hasta que la suelte.
    const free = machines.find((id) => crowd.occupancy(id) === 'FREE');
    assert.ok(free, 'no queda ninguna máquina libre para probar');
    crowd.claim(new Set([free!]));
    assert.equal(crowd.occupancy(free!), 'IN_USE', 'la máquina del jugador no queda ocupada para la gente');
    clock = stepMinutes(crowd, clock, 60, () => {
      for (const a of crowd.agents) if (a.point === free || crowd.seats.ownerOf(free!) !== undefined) neverTaken = false;
    });
    reservedAt++;
    // Al soltarla (acabar, cortar o cambiar de escena), vuelve a ser de todos.
    crowd.claim(new Set());
    assert.equal(crowd.occupancy(free!), 'FREE', 'la máquina no se libera');
    stepMinutes(crowd, clock, 120);
    assert.equal(crowd.pathFailures, 0, 'rutas no encontradas con el jugador entrenando');
  }
  assert.ok(neverTaken, 'la gente se subió a una máquina reservada por el jugador');
  assert.ok(busyBlocksPlayer >= 2, 'no se probó el bloqueo con gente usando máquinas');
  console.log(`  ${reservedAt} entrenamientos con la sala llena: la gente nunca cogió la máquina del jugador y ${busyBlocksPlayer} veces había alguien en una`);
}

console.log('entrenar OK: 8 puestos entrenables, progreso gradual con rendimientos decrecientes, cansancio y energía, cortar a medias, partida y ocupación compartida con la gente');
