// Eventos de calle (data/streetEvents.ts, systems/StreetEvents.ts): escondidos,
// alcanzables, que no cierran el paso, que no pasan de día ni con chaparrón,
// que cambian de una noche a otra y que se recogen solos. Recorre 140 noches.
// `node scripts/check-street-events.ts`.
import assert from 'node:assert/strict';
import { FIGHTER_PROFILES, STREET_EVENTS } from '../src/data/streetEvents.ts';
import { PASSENGER_LOOKS } from '../src/data/npcs.ts';
import { getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { districtAt } from '../src/systems/Districts.ts';
import { DISPERSE, ROUND, StreetEvent, crowdCue, fightFrame, matchFighters, fighterPoses, phaseAt, planNight, type Night } from '../src/systems/StreetEvents.ts';
import { weatherAt } from '../src/systems/Weather.ts';
import { weekIndex } from '../src/systems/MetroDaily.ts';
import type { TilePoint } from '../src/types/game.ts';

const DAYS = 140;
const key = (p: TilePoint): string => `${Math.round(p.tx)},${Math.round(p.ty)}`;

for (const def of STREET_EVENTS) {
  const loc = getLocation(def.location);
  const ev = new StreetEvent(def, loc);
  const ring = new Set(ev.ring.map(key));
  const slots = [...def.fighters, ...def.spectators, ...def.watchers, ...(def.bookmaker ? [def.bookmaker] : []), ...(def.lookout ? [def.lookout] : [])];

  // --- el sitio
  for (const s of slots) assert.ok(isWalkable(loc, s.tx, s.ty), `${def.id}: sitio ${key(s)} no se pisa`);
  for (const r of ev.ring) assert.ok(isWalkable(loc, r.tx, r.ty), `${def.id}: el corro ${key(r)} no se pisa`);
  assert.equal(new Set(slots.map(key)).size, slots.length, `${def.id}: dos sitios en el mismo tile`);
  for (const s of def.spectators) assert.ok(!ring.has(key(s)), `${def.id}: un mirón dentro del corro (${key(s)})`);

  // Escondido: ningún tramo del grafo de peatones pasa por el sitio, y nada de bancos, fuentes ni pistas cerca.
  const inArea = (x: number, y: number): boolean => x >= def.area.tx - 1 && x < def.area.tx + def.area.w + 1 && y >= def.area.ty - 1 && y < def.area.ty + def.area.h + 1;
  const pts = new Map(Object.entries(loc.points ?? {}));
  for (const [a, b] of loc.links ?? []) {
    const pa = pts.get(a);
    const pb = pts.get(b);
    if (!pa || !pb) continue;
    for (let i = 0; i <= 20; i++) assert.ok(!inArea(Math.round(pa.tx + ((pb.tx - pa.tx) * i) / 20), Math.round(pa.ty + ((pb.ty - pa.ty) * i) / 20)), `${def.id}: el tramo ${a}–${b} cruza el sitio`);
  }
  for (const p of loc.props) {
    if (!['bench', 'plaza-bench', 'fountain', 'hoop', 'kiosk', 'cafe-table'].includes(p.kind)) continue;
    assert.ok(Math.hypot(p.tx - ev.center.tx, p.ty - ev.center.ty) > 10, `${def.id}: ${p.kind} a la vista del corro (${p.tx},${p.ty})`);
  }
  assert.ok(!['park', 'transit'].includes(districtAt(loc, Math.round(ev.center.tx), ev.center.ty) ?? ''), `${def.id}: en un parque o una boca de metro`);

  // Siempre hay salida: con el corro y todos los sitios ocupados, desde donde se mira se llega a cada borde.
  for (const id of def.entries) {
    const edge = loc.points![id];
    const p = ev.path(def.vantage, edge);
    assert.ok(p.length > 2 && key(p[p.length - 1]) === key(edge), `${def.id}: sin salida hacia ${id}`);
  }
  // Nadie cruza por donde pelean: los caminos de llegada no pisan el corro (salvo el sitio de quien pelea).
  for (const id of def.entries) {
    for (const s of slots) {
      const p = ev.path(loc.points![id], s);
      assert.equal(key(p[p.length - 1]), key(s), `${def.id}: ${id} no llega a ${key(s)}`);
      for (const q of p.slice(0, -1)) assert.ok(!ring.has(key(q)), `${def.id}: el camino a ${key(s)} cruza el corro por ${key(q)}`);
    }
  }

  // --- las noches
  const nights: Night[] = [];
  for (let d = 1; d <= DAYS; d++) nights.push(planNight(def, loc, d));
  const happened = nights.filter((n) => n.happens);
  const share = happened.length / DAYS;
  assert.ok(share > 0.08 && share < 0.45, `${def.id}: hay pelea ${Math.round(share * 100)} % de las noches`);
  for (const n of happened) assert.ok(def.days.includes(weekIndex(n.day)), `${def.id}: pelea un día que no toca (${n.day})`);
  for (const n of nights) {
    const w = weatherAt(Math.floor(n.fightAt / 1440), (n.fightAt % 1440) / 60);
    if (!def.covered && w.rain >= def.weather.cancelRain) assert.equal(n.happens, false, `${def.id}: pelea con chaparrón el día ${n.day}`);
  }
  assert.ok(new Set(happened.map((n) => Math.round(n.start % 1440))).size >= Math.min(5, happened.length), `${def.id}: empieza siempre a la misma hora`);
  assert.ok(happened.some((n) => n.raidAt !== null), `${def.id}: el vigía no avisa nunca en ${DAYS} noches`);
  assert.ok(happened.some((n) => n.raidAt === null), `${def.id}: el vigía avisa todas las noches`);

  // Tiempo: con lluvia floja o frío, menos corro; con calor, más.
  const crowdOf = (n: Night): number => n.members.filter((m) => m.role === 'spectator').length;
  const wOf = (n: Night): ReturnType<typeof weatherAt> => weatherAt(Math.floor(n.fightAt / 1440), (n.fightAt % 1440) / 60);
  const avg = (ns: Night[]): number => ns.reduce((s, n) => s + crowdOf(n), 0) / Math.max(1, ns.length);
  const mild = happened.filter((n) => wOf(n).rain <= 0.08 && wOf(n).celsius >= def.weather.coldBelow && wOf(n).celsius <= def.weather.warmAbove);
  const wetOrCold = happened.filter((n) => wOf(n).rain > 0.08 || wOf(n).celsius < def.weather.coldBelow);
  const warm = happened.filter((n) => wOf(n).rain <= 0.08 && wOf(n).celsius > def.weather.warmAbove);
  if (mild.length && wetOrCold.length) assert.ok(avg(wetOrCold) < avg(mild), `${def.id}: con lluvia o frío no baja el corro`);
  if (mild.length && warm.length) assert.ok(avg(warm) > avg(mild), `${def.id}: las noches de calor no traen más gente`);

  // De día, nada ni nadie.
  for (let d = 2; d <= DAYS; d++) {
    const noon = d * 1440 + 12 * 60;
    assert.equal(ev.phase(noon), 'none', `${def.id}: pelea a mediodía (día ${d})`);
    assert.equal(ev.presentAt(noon).length, 0, `${def.id}: gente en el patio a mediodía (día ${d})`);
  }

  // Cada noche con pelea, cada medio minuto: nadie en una pared ni parado en el corro salvo quien pelea,
  // golpes que llegan, y al final se recoge todo.
  let hits = 0;
  let maxPeople = 0;
  for (const n of happened.slice(0, 25)) {
    const tail = (n.raidAt ?? n.end) + DISPERSE + 180;
    for (let t = n.start - 200; t < tail; t += 0.5) {
      const here = ev.presentAt(t);
      maxPeople = Math.max(maxPeople, here.length);
      for (const p of here) {
        assert.ok(isWalkable(loc, Math.round(p.x), Math.round(p.y)), `${def.id}: alguien en un sitio sólido (${p.x.toFixed(1)},${p.y.toFixed(1)}) día ${n.day}`);
        if (p.member.role !== 'fighter' && !p.moving) assert.ok(!ring.has(key({ tx: p.x, ty: p.y })), `${def.id}: un mirón dentro del corro`);
      }
      if (phaseAt(n, t) === 'fight') hits += fighterPoses(n, t).filter((f) => f.hit).length;
    }
    assert.equal(ev.presentAt(tail + 1).length, 0, `${def.id}: queda gente cuando ya ha acabado (día ${n.day})`);
  }
  assert.ok(hits > 0, `${def.id}: nadie da un golpe`);

  console.log(`check-street-events: ${def.id} · pelea ${Math.round(share * 100)} % de ${DAYS} noches, ${happened.filter((n) => n.raidAt !== null).length} con aviso del vigía, ${nights.filter((n) => n.why === 'rain').length} suspendidas por lluvia; corro medio ${avg(mild).toFixed(1)} templado / ${avg(wetOrCold).toFixed(1)} lluvia o frío / ${avg(warm).toFixed(1)} calor; hasta ${maxPeople} personas`);
}

// ------------------------------------------- herramientas de desarrollo
// Una pelea forzada es una noche como las demás: gente, poses, corro y recogida. Fijada, no acaba;
// soltada, se deshace; retirada, el patio queda vacío en el acto; reiniciada, vuelve el calendario.
{
  const def = STREET_EVENTS[0];
  const loc = getLocation(def.location);
  const ev = new StreetEvent(def, loc);
  const ring = new Set(ev.ring.map(key));
  // Un martes a mediodía, cuando por calendario no hay nada.
  const t0 = 2 * 1440 + 12 * 60;
  assert.equal(ev.phase(t0), 'none');
  const forced = ev.devForce(t0);
  assert.equal(forced.happens, true);
  assert.equal(ev.phase(t0), 'gathering', 'recién forzada, el corro se está formando');
  assert.equal(ev.phase(t0 + 7), 'fight', 'el primer asalto empieza en seis minutos');
  const here = ev.presentAt(t0 + 7);
  assert.ok(here.filter((p) => p.member.role === 'fighter' && !p.moving).length === 2, 'los dos que pelean, en su sitio');
  assert.ok(here.filter((p) => p.member.role === 'spectator' && !p.moving).length >= 2, 'y un corro');
  for (const p of here) {
    assert.ok(isWalkable(loc, Math.round(p.x), Math.round(p.y)), 'forzada: nadie en una pared');
    if (p.member.role !== 'fighter' && !p.moving) assert.ok(!ring.has(key({ tx: p.x, ty: p.y })), 'forzada: nadie parado en el corro');
  }
  assert.ok(fighterPoses(forced, t0 + 7 + 1.2).some((f) => f.pose !== 0), 'y pelean');
  // Se acaba sola y se recoge.
  assert.equal(ev.presentAt(forced.end + DISPERSE + 181).length, 0, 'forzada: al final no queda nadie');

  // Fijada: seis horas después sigue la pelea; soltada, se deshace y el patio se vacía.
  ev.devPin(t0, true);
  assert.equal(ev.phase(t0 + 6 * 60), 'fight');
  assert.equal(ev.devStatus(t0 + 6 * 60).pinned, true);
  const release = t0 + 6 * 60 + 5;
  ev.devPin(release, false);
  assert.equal(ev.phase(release + 1), 'dispersing', 'soltada: se deshace');
  assert.equal(ev.presentAt(release + DISPERSE + 181).length, 0, 'soltada: al rato, nadie');
  // Al soltar no desaparece nadie: quien estaba (sentado o aún llegando) sigue ahí y se va andando.
  {
    const probe = new StreetEvent(def, loc);
    probe.devForce(t0 + 3000);
    const at = t0 + 3000 + 1; // recién forzada: parte del corro aún viene de camino
    const before = new Set(probe.presentAt(at).map((p) => p.member.id));
    probe.devPin(at, false);
    const after = new Set(probe.presentAt(at + 0.01).map((p) => p.member.id));
    assert.deepEqual([...before].filter((id) => !after.has(id)), [], 'soltada: nadie se esfuma en el sitio');
    probe.devReset();
  }

  // Retirada: vacío en el acto, aunque el calendario diga que hay pelea esa noche.
  const natural = Array.from({ length: 28 }, (_, i) => planNight(def, loc, i + 1)).find((n) => n.happens)!;
  const mid = natural.fightAt + 5;
  ev.devReset();
  assert.ok(ev.presentAt(mid).length > 0, 'la noche del calendario tiene gente');
  ev.devDespawn(mid);
  assert.deepEqual([ev.phase(mid), ev.presentAt(mid).length, ev.devStatus(mid).cleared], ['none', 0, true], 'retirada: vacío en el acto');
  // Reiniciada: vuelve la noche del calendario tal cual.
  ev.devReset();
  assert.ok(ev.presentAt(mid).length > 0, 'reiniciada: vuelve el calendario');
  assert.deepEqual(ev.devStatus(mid), { phase: ev.phase(mid), forced: false, pinned: false, cleared: false, tonight: ev.devStatus(mid).tonight });
  console.log('check-street-events: herramientas de desarrollo (forzar, fijar, soltar, retirar, reiniciar), OK');
}

// ------------------------------------------- parejas, flujo y apuestas del evento existente
{
  const def = STREET_EVENTS[0];
  const loc = getLocation(def.location);
  const sexes = new Set<string>();
  assert.equal(new Set(FIGHTER_PROFILES.map((p) => p.look)).size, FIGHTER_PROFILES.length, 'perfiles duplicados');
  for (let seed = 0; seed < 1000; seed++) {
    const [a, b] = matchFighters(def.fighterRoster, seed);
    assert.ok(a.age >= 18 && b.age >= 18, 'una persona menor entra en la pelea');
    assert.equal(a.gender, b.gender, 'pelea entre hombre y mujer');
    assert.notEqual(a.look, b.look, 'pelea contra la misma persona');
    assert.deepEqual(matchFighters(def.fighterRoster, seed), [a, b], 'pareja no determinista');
    const score = (p: typeof a): number => Math.abs(a.body - p.body) * 3 + Math.abs(a.physical - p.physical);
    const possible = def.fighterRoster.filter((p) => p.age >= 18 && p.gender === a.gender && p.look !== a.look);
    assert.equal(score(b), Math.min(...possible.map(score)), 'se ignora un rival más compatible');
    sexes.add(a.gender);
  }
  assert.equal(sexes.size, 2, 'no hay variedad de parejas');
  const men = FIGHTER_PROFILES.filter((p) => p.gender === 'man');
  const women = FIGHTER_PROFILES.filter((p) => p.gender === 'woman');
  assert.throws(() => matchFighters([men[0], { ...men[1], age: 17 }], 0), /adultos compatibles/);
  assert.throws(() => matchFighters([men[0], women[0]], 0), /adultos compatibles/);
  const stages = new Set<string>();
  const contacts = new Set<string>();
  const comics = new Set<string>();
  const words = new Set<string>();
  let dodges = 0;
  let strong = 0;
  let winnerFans = 0;
  let loserFans = 0;
  for (let day = 1; day <= 40; day++) {
    const n = planNight(def, loc, day, { start: day * 1440 + 21 * 60 });
    const fighters = n.members.filter((m) => m.role === 'fighter');
    assert.equal(fighters.length, 2);
    const bookmaker = n.members.filter((m) => m.role === 'bookmaker');
    assert.equal(bookmaker.length, 1, 'falta la libreta');
    assert.ok(n.members.filter((m) => m.bet).length >= 2, 'no hay gente apostando');
    assert.deepEqual(fighters.map((m) => PASSENGER_LOOKS[m.look].id), n.fighters.map((p) => p.look), 'los sprites no son la pareja adulta elegida');
    for (let t = n.fightAt - 6; t < n.end + 6; t += 0.1) {
      const frame = fightFrame(n, t);
      stages.add(frame.stage);
      assert.deepEqual(fightFrame(n, t), frame, 'al recargar cambia la pelea');
      assert.deepEqual(fighterPoses(n, t), frame.poses, 'hay un segundo flujo de pelea');
      for (const pose of frame.poses) assert.ok(pose.dx >= -8 && pose.dx <= 14, 'el desplazamiento sale de la huella existente');
      if (frame.contact) contacts.add(frame.id);
      if (frame.dodged) { dodges++; assert.equal(frame.contact, false); assert.equal(frame.comic, null, 'un esquive muestra impacto'); }
      if (frame.comic) { comics.add(frame.id); words.add(frame.comic); assert.equal(frame.contact, true, 'texto sin golpe'); }
      if (frame.strong && frame.contact) strong++;
      if (frame.stage === 'overwhelmed') assert.equal(frame.attacker, n.winner, 'nadie está siendo acorralado');
    }
    const firstEnd = n.rounds[0][1] - 0.5;
    for (const m of n.members.filter((m) => m.bet)) {
      const cue = crowdCue(n, m, firstEnd);
      assert.notEqual(cue.shout, '¡Cobro!', 'las apuestas se pagan antes del último asalto');
      assert.ok(!cue.shout?.startsWith('Adiós'), 'las apuestas se pierden antes del resultado');
    }
    for (let cycle = 0; cycle < 6; cycle++) {
      const at = n.fightAt + 4.5 + cycle * 2.8;
      const before = fightFrame(n, at + 0.6);
      const after = fightFrame(n, at + 1.2);
      assert.equal(before.attacker, after.attacker, 'cambia quien golpea a mitad del intercambio');
      assert.equal(before.strong, after.strong, 'cambia la fuerza a mitad del intercambio');
    }
    const final = n.rounds[n.rounds.length - 1];
    const end = fightFrame(n, final[0] + ROUND - 0.5);
    assert.equal(end.stage, 'finish');
    assert.equal(end.poses[n.winner].pose, 30, 'falta la victoria');
    assert.equal(end.poses[1 - n.winner].pose, 29, 'falta el perdedor cansado');
    for (const m of n.members.filter((m) => m.bet)) {
      for (let t = n.end; t < n.end + 5; t += 0.2) {
        const cue = crowdCue(n, m, t);
        if (cue.shout === '¡Cobro!') winnerFans++;
        if (cue.shout?.startsWith('Adiós')) loserFans++;
      }
    }
    assert.ok(crowdCue(n, bookmaker[0], n.start + 20).betting, 'la libreta no acepta apuestas');
    const interrupted = { ...n, raidAt: n.fightAt + 10 };
    const interruptedFrame = fightFrame(interrupted, interrupted.raidAt + 1);
    assert.equal(interruptedFrame.stage, 'ended');
    assert.equal(interruptedFrame.comic, null, 'queda un impacto tras el aviso');
    assert.ok(!interruptedFrame.poses.some((p) => p.pose === 30), 'se proclama ganador de una pelea interrumpida');
  }
  for (const stage of ['face-off', 'argument', 'stance', 'exchange', 'overwhelmed', 'finish', 'break', 'ended']) assert.ok(stages.has(stage), 'falta ' + stage);
  assert.ok(contacts.size > 0 && comics.size > 0 && comics.size < contacts.size, 'texto en cada golpe o nunca');
  assert.equal(words.size, 4, 'faltan palabras de cómic');
  assert.ok(dodges > 0 && strong > 0 && winnerFans > 0 && loserFans > 0, 'faltan esquives, golpes fuertes o reacciones a las apuestas');
  console.log('check-street-events: 1000 parejas adultas compatibles; flujo, esquives, golpes, cómic ocasional, apuestas y final/interrupción, OK');
}
