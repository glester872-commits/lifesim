// Escuela de Taekwondo Vallesco (systems/Taekwondo, data/academyRooms.ts TKD_ROOM): patadas con las dos piernas que sólo
// cuentan en su alcance y su instante, una vez por patada y orden; progreso y cinturones que piden lo hecho de verdad;
// guardados nuevos, antiguos y mal formados; y el local propio en la Ronda de la Vía, con su puerta a la calle, sin
// restos del anexo de antes. Llamado desde la cadena `check`. `node scripts/check-taekwondo.ts`.
import assert from 'node:assert/strict';
import { ACADEMY_PROFILES } from '../src/data/academyRooms.ts';
import { STATIONS } from '../src/data/stations.ts';
import { classSlot } from '../src/systems/Academy.ts';
import { ACADEMIES } from '../src/data/academies.ts';
import { Crowd } from '../src/systems/Crowd.ts';
import { parseFitness, START_FITNESS } from '../src/systems/Fitness.ts';
import { getLocation, isWalkable, validate } from '../src/systems/LocationSystem.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { worldRoute } from '../src/systems/Navigation.ts';
import { placeInfo } from '../src/systems/Places.ts';
import { createInitialState, restore, SaveSystem } from '../src/systems/SaveSystem.ts';
import {
  applyDrill, BELTS, coachLines, contactDelay, createDrill, drillDone, EXAM_PASS, examReady, KICK_ORDER, KICKS, kickTotal,
  nextCue, parseTkd, START_TKD, startKick, stepDrill, summarize, type Drill, type Kick, type Leg,
} from '../src/systems/Taekwondo.ts';
import { mapPositionOf } from '../src/systems/WorldMap.ts';

/** Avanza la clase en pasos de 16 ms hasta `to`, a una distancia fija del pao. */
const run = (d: Drill, from: number, to: number, distance: number): ReturnType<typeof stepDrill>[] => {
  const out: ReturnType<typeof stepDrill>[] = [];
  for (let t = from; t <= to; t += 16) out.push(stepDrill(d, t, distance));
  return out.filter((e) => e !== null);
};
/** Patea para que el pie llegue al pao justo en el compás de la orden `i` (con un desfase `skew`). */
const kickFor = (d: Drill, i: number, skew = 0, leg?: Leg, kick?: Kick, distance = 1.5): ReturnType<typeof stepDrill>[] => {
  const c = d.cues[i];
  const k = kick ?? c.kick;
  const start = c.at - contactDelay(k) + skew;
  assert.ok(startKick(d, k, leg ?? c.leg, start), 'no sale la patada');
  return run(d, start, start + kickTotal(k), distance);
};
/** Una distancia a la que llega cualquiera de las tres. */
const NEAR = 1.5;

// ----------------------------------------------- 1. las tres patadas, con las dos piernas y en su alcance
for (const k of KICK_ORDER) {
  const def = KICKS[k];
  assert.ok(def.chamberMs > 0 && def.extendMs > 0 && def.recoilMs > 0, `${k}: sin fases`);
  assert.ok(def.reach[0] < def.reach[1], `${k}: alcance imposible`);
}
assert.ok(KICKS.side.reach[1] > KICKS.round.reach[1] && KICKS.side.energy > KICKS.front.energy, 'la lateral no es la más larga y costosa');
const lesson = createDrill(7, 0);
for (const k of KICK_ORDER) assert.ok(lesson.cues.some((c) => c.kick === k), `la clase no pide ${k}`);
for (const leg of ['L', 'R'] as const) assert.ok(lesson.cues.some((c) => c.leg === leg), `la clase no pide la pierna ${leg}`);
assert.ok(lesson.cues.every((c, i) => i === 0 || c.at > lesson.cues[i - 1].at), 'el compás no va en orden');
const exam = createDrill(7, 0, true);
for (const k of KICK_ORDER) for (const leg of ['L', 'R'] as const) assert.ok(exam.cues.some((c) => c.kick === k && c.leg === leg), `el examen no pide ${k} ${leg}`);

// ----------------------------------------------- 2. el contacto: alcance, instante y una vez por patada y orden
{
  const d = createDrill(11, 0);
  const ev = kickFor(d, 0);
  assert.equal(ev.length, 1, 'una patada da más de un contacto');
  assert.equal(ev[0]!.grade, 'perfect');
  assert.equal(d.results[0], 'perfect');
  // Una segunda patada encima de la misma orden ya resuelta no la vuelve a contar.
  const again = kickFor(d, 0, kickTotal(d.cues[0].kick) + 20);
  assert.ok(again.every((e) => !e?.grade), 'una orden se resuelve dos veces');
  assert.equal(summarize(d).perfect, 1);
}
{
  // Mientras una patada no vuelve a la guardia, no sale otra.
  const d = createDrill(12, 0);
  const c = d.cues[0];
  assert.ok(startKick(d, c.kick, c.leg, 1_000));
  assert.equal(startKick(d, c.kick, c.leg, 1_000 + 50), false, 'se encadenan dos patadas a la vez');
  assert.equal(d.kicks, 1);
}
{
  // Fuera de alcance: no hay contacto y la orden sigue pendiente (aún se puede dar bien).
  const d = createDrill(13, 0);
  const c = d.cues[0];
  const far = kickFor(d, 0, 0, c.leg, c.kick, KICKS[c.kick].reach[1] + 0.4);
  assert.ok(far.length === 1 && !far[0]!.contact && /no llega/.test(far[0]!.text), 'una patada sin alcance cuenta como contacto');
  assert.equal(d.results[0], null, 'la patada que no llega consume la orden');
  const close = createDrill(13, 0);
  const cc = close.cues[0];
  const tight = kickFor(close, 0, 0, cc.leg, cc.kick, KICKS[cc.kick].reach[0] - 0.3);
  assert.ok(!tight[0]!.contact && /encima/.test(tight[0]!.text), 'una patada encogida cuenta como contacto');
}
{
  // El instante: dentro de la ventana corta, limpia; de la larga, buena; fuera, a destiempo (sin consumir orden).
  const d = createDrill(14, 0);
  assert.equal(kickFor(d, 0, 250)[0]!.grade, 'good');
  const early = createDrill(14, 0);
  const off = kickFor(early, 0, -900);
  assert.ok(off[0]!.contact && !off[0]!.grade && /fuera de compás/.test(off[0]!.text), 'una patada a destiempo cuenta');
  assert.equal(early.results[0], null);
}
{
  // Pierna o patada equivocadas: cuentan como fallo de esa orden, y lo dice.
  const d = createDrill(15, 0);
  const c = d.cues[0];
  const wrongLeg = kickFor(d, 0, 0, c.leg === 'L' ? 'R' : 'L');
  assert.equal(wrongLeg[0]!.grade, 'wrong-leg');
  const c1 = d.cues[1];
  const other = KICK_ORDER.find((k) => k !== c1.kick)!;
  assert.equal(kickFor(d, 1, 0, c1.leg, other)[0]!.grade, 'wrong-kick');
}
{
  // Sin patear: cada orden se da por fallada al pasar su ventana, y la clase acaba.
  const d = createDrill(16, 0);
  run(d, 0, d.cues.at(-1)!.at + 1_000, NEAR);
  assert.ok(d.results.every((r) => r === 'miss') && nextCue(d) < 0 && drillDone(d, d.cues.at(-1)!.at + 1_000));
  assert.equal(summarize(d).accuracy, 0);
}

// ----------------------------------------------- 3. una clase entera bien hecha, y lo que dice la instructora
const perfectDrill = (seed: number, isExam = false): Drill => {
  const d = createDrill(seed, 0, isExam);
  for (let i = 0; i < d.cues.length; i++) kickFor(d, i);
  run(d, d.cues.at(-1)!.at, d.cues.at(-1)!.at + 1_000, NEAR);
  return d;
};
{
  const d = perfectDrill(21);
  const s = summarize(d);
  assert.equal(s.accuracy, 1);
  assert.match(coachLines(d, s, 'Min-ji')[0], /Muy bien/);
  const bad = createDrill(22, 0);
  for (let i = 0; i < bad.cues.length; i++) kickFor(bad, i, 0, bad.cues[i].leg, bad.cues[i].kick, 2.6);
  run(bad, bad.cues.at(-1)!.at, bad.cues.at(-1)!.at + 1_000, 2.6);
  assert.ok(coachLines(bad, summarize(bad), 'Min-ji').some((l) => /cortas|distancia/.test(l)), 'la instructora no dice lo que falló');
}

// ----------------------------------------------- 4. progreso: asistencia una vez por clase, rendimientos decrecientes
{
  const slot = 1_000;
  const first = applyDrill(START_TKD, perfectDrill(31), slot, 3, 0);
  assert.ok(first.counted && first.next.attended === 1, 'una clase bien hecha no cuenta como asistencia');
  const same = applyDrill(first.next, perfectDrill(32), slot, 3, 0);
  assert.equal(same.next.attended, 1, 'repetir la misma clase pagada cuenta dos asistencias');
  const nothing = createDrill(33, 0);
  run(nothing, 0, nothing.cues.at(-1)!.at + 1_000, NEAR);
  assert.equal(applyDrill(first.next, nothing, slot + 30, 3, 0).counted, false, 'una clase sin nada bien hecho cuenta');
  // Cada vez rinde menos el mismo día; al día siguiente vuelve a rendir.
  let p = START_TKD;
  const gains: number[] = [];
  for (let i = 0; i < 5; i++) {
    const before = p.coordination;
    p = applyDrill(p, perfectDrill(40 + i), 2_000 + i * 30, 5, 0).next;
    gains.push(p.coordination - before);
  }
  assert.ok(gains[4] < gains[0] / 3, `el quinto entrenamiento del día rinde igual (${gains.map((g) => g.toFixed(2)).join(', ')})`);
  assert.ok(p.coordination < 10, 'un día de clases da demasiado');
  const tomorrow = applyDrill(p, perfectDrill(50), 9_000, 6, 0).next.coordination - p.coordination;
  assert.ok(tomorrow > gains[4], 'al día siguiente no vuelve a rendir');
}

// ----------------------------------------------- 5. cinturones: examen sólo con asistencia y técnica, y aprobado
{
  assert.equal(examReady(START_TKD, 100).ok, false, 'se examina sin haber venido a clase');
  const ready = { ...START_TKD, attended: BELTS[1].attended };
  assert.equal(examReady(ready, BELTS[1].technique - 1).ok, false, 'se examina sin técnica');
  assert.equal(examReady(ready, BELTS[1].technique).ok, true);
  // Una clase normal perfecta no asciende; un examen sin requisitos tampoco; uno con requisitos y nota, sí.
  assert.equal(applyDrill(ready, perfectDrill(61), 100, 9, 99).promoted, null, 'una clase normal da cinturón');
  assert.equal(applyDrill(START_TKD, perfectDrill(62, true), 100, 9, 99).promoted, null, 'un examen sin requisitos da cinturón');
  const passed = applyDrill(ready, perfectDrill(63, true), 100, 9, BELTS[1].technique);
  assert.equal(passed.promoted?.name, 'amarillo');
  assert.equal(passed.next.belt, 1);
  const weak = createDrill(64, 0, true);
  for (let i = 0; i < Math.floor(weak.cues.length * EXAM_PASS) - 1; i++) kickFor(weak, i);
  run(weak, 0, weak.cues.at(-1)!.at + 1_000, NEAR);
  assert.equal(applyDrill(ready, weak, 100, 9, BELTS[1].technique).promoted, null, 'se aprueba sin la nota');
}

// ----------------------------------------------- 6. guardado: nuevo, antiguo y mal formado
{
  assert.equal(parseTkd(undefined), undefined);
  assert.deepEqual(parseTkd({ belt: 99, attended: -3, coordination: 'x', lastSlot: 1.6 }), { ...START_TKD, belt: BELTS.length - 1, lastSlot: 2 });
  assert.equal(parseFitness({ ...START_FITNESS, boxing: 3 }).taekwondo, undefined, 'un guardado antiguo se inventa un cinturón');
  const memory = new Map<string, string>();
  const saves = new SaveSystem({ read: (k) => memory.get(k) ?? null, write: (k, v) => void memory.set(k, v), remove: (k) => void memory.delete(k) });
  const tkd = { ...START_TKD, belt: 2, attended: 11, coordination: 7.5, lastSlot: 4_200, day: 3, today: 1 };
  const fitness = { ...START_FITNESS, skills: { taekwondo: 12 }, academies: { taekwondo: { pass: 4, paid: 4_200 } }, taekwondo: tkd };
  assert.ok(saves.save({ ...createInitialState(), money: 50, locationId: 'academy-tkd', position: { x: 160, y: 176 }, fitness }));
  let loaded = restore(saves.load());
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(loaded.fitness!.taekwondo, tkd, 'el progreso de taekwondo cambia al guardar');
    assert.equal(loaded.fitness!.academies!.taekwondo.paid, 4_200);
    assert.equal(loaded.locationId, 'academy-tkd', 'un guardado dentro del dojang no carga ahí');
    assert.ok(saves.save(loaded));
    loaded = restore(saves.load());
  }
}

// ----------------------------------------------- 7. el local: propio, en Vallesco, con puerta a la calle
{
  const academy = ACADEMIES.taekwondo!;
  assert.equal(academy.location, 'academy-tkd', 'el id del local cambió: los guardados quedarían fuera');
  const room = getLocation('academy-tkd');
  validate(room);
  const street = getLocation('district');
  const building = street.buildings?.find((b) => b.enter?.location === 'academy-tkd');
  assert.ok(building && building.style === 'dojang' && building.name === academy.name, 'no hay fachada propia con su nombre');
  assert.ok(isWalkable(street, building!.doorX!, street.points![building!.point!].ty), 'no se llega a la puerta desde la acera');
  assert.equal(room.portals.find((p) => p.id === 'exit')?.to.location, 'district', 'el dojang no sale a la calle');
  assert.equal(mapPositionOf('academy-tkd', { x: 0, y: 0 })?.mapId, 'district');
  assert.equal(placeInfo('academy-tkd')?.name, academy.name);
  // Del anexo de antes no queda nada: ni portal, ni llegada, ni puerta en Barrio Fit.
  const cr = getLocation('cr-gym');
  assert.ok(!cr.portals.some((p) => p.to.location === 'academy-tkd') && !cr.spawns.taekwondo && !Object.keys(cr.points ?? {}).some((k) => k.includes('ACADEMY')), 'quedan restos del anexo en Barrio Fit');
  // A pie desde el metro de Vallesco hasta los paos.
  const legs = worldRoute('METRO_ENTRANCE', 'TKD_KICK_01');
  assert.ok(legs && legs[0].location === 'district' && legs.at(-1)!.location === 'academy-tkd', 'no se llega andando desde el metro');
  // Cada línea de paos: el pao, sólido, a dos tiles en la dirección en que se mira, y la calle para acercarse y alejarse libre.
  const kicks = Object.entries(room.points ?? {}).filter(([, p]) => p.use && STATIONS[p.use as keyof typeof STATIONS]?.drill === 'kicks');
  assert.ok(kicks.length >= 3, 'faltan líneas de paos');
  for (const [id, p] of kicks) {
    const dir = p.facing === 'left' ? -1 : 1;
    assert.ok(p.facing === 'left' || p.facing === 'right', `${id}: no mira de perfil al pao`);
    assert.ok(room.props.some((pr) => pr.kind === 'kick-pad' && pr.tx === p.tx + 2 * dir && pr.ty === p.ty), `${id}: sin pao a dos tiles`);
    assert.equal(isWalkable(room, p.tx + 2 * dir, p.ty), false, `${id}: el pao se atraviesa`);
    for (const dx of [-1, 1]) assert.ok(isWalkable(room, p.tx + dx * dir, p.ty), `${id}: sin sitio para ajustar la distancia`);
  }
  assert.ok(room.ground.slice(3, 10).every((row) => row.slice(2, 18).includes('Q')), 'sin tatami');
}

// ----------------------------------------------- 8. la gente: patea en los paos, sin pisarse ni atravesar nada
{
  const profile = ACADEMY_PROFILES.find((p) => p.place === 'academy-tkd')!;
  const room = getLocation('academy-tkd');
  assert.ok(profile.staff.some((s) => s.points.some((p) => room.points?.[p]?.use === 'tkd-demo')), 'nadie demuestra las patadas');
  let kicking = 0;
  for (const day of [2, 5]) {
    const crowd = new Crowd(room, placeInfo('academy-tkd')!, profile, seededRng(day * 13));
    let t = 18 * 60;
    const clock = () => ({ day, hour: Math.floor(t / 60), minute: Math.floor(t % 60) });
    crowd.populate(clock(), room.spawns.entry);
    // Al entrar el jugador, la instructora y el ayudante ya están en su sitio.
    assert.equal(crowd.agents.filter((x) => x.kind === 'staff').length, profile.staff.length, 'al entrar falta la instructora o el ayudante');
    for (let step = 0; step < 1500; step++) {
      crowd.update(100, clock(), room.spawns.entry);
      t += 0.2;
      const owners = new Map<string, number>();
      for (const a of crowd.agents) {
        assert.ok(isWalkable(room, Math.round(a.x), Math.round(a.y)), `alguien atraviesa un pao o la pared en ${a.x},${a.y}`);
        if (a.moving || !a.point) continue;
        assert.ok(!owners.has(a.point), `dos en el mismo puesto (${a.point})`);
        owners.set(a.point, a.id);
        const motion = STATIONS[room.points?.[a.point]?.use as keyof typeof STATIONS]?.motion;
        if (motion?.startsWith('tkd-') && motion !== 'tkd-form') kicking++;
      }
    }
  }
  assert.ok(kicking > 0, 'nadie patea los paos');
}

// La clase pagada es la misma tras recargar (systems/Academy): base de la recuperación segura.
assert.equal(classSlot(ACADEMIES.taekwondo!, 18 * 60 + 2.7), 18 * 60);

console.log(`Taekwondo OK: frontal, circular y lateral con las dos piernas, contacto en alcance e instante (una vez por patada y orden), asistencia y cinturones verificables, guardados y local propio en la Ronda de la Vía con ${Object.keys(getLocation('academy-tkd').points ?? {}).filter((k) => k.startsWith('TKD_KICK_')).length} líneas de paos`);
