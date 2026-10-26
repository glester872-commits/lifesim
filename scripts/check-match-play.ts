// El partido que se ve desde la grada (systems/MatchPlay, data/matchPlay.ts), sin Phaser: un solo partido por fixture,
// el mismo se mire o no, el marcador cambia en su minuto exacto, los minutos de fútbol caben en la fase `live` del
// calendario, las jugadas son variadas y el balón y los jugadores nunca saltan. Llamado desde la cadena `check` de
// package.json. `node scripts/check-match-play.ts`.
import assert from 'node:assert/strict';
import { ARENA_MATCHES } from '../src/data/cityEvents.ts';
import { HALVES, LIVE_END, MOMENT_MINUTES, PATTERNS } from '../src/data/matchPlay.ts';
import { matchOn, matchPhase } from '../src/systems/Match.ts';
import { announcement, attacksRight, fixtureAt, footballMinute, nextMoment, pitchAt, stageAt, stateAt, timelineOf, type Timeline } from '../src/systems/MatchPlay.ts';

const DAY = 1440;
const days = Array.from({ length: 200 }, (_, i) => i + 1).filter((d) => matchOn(d));
assert.ok(days.length > 30, 'pocos partidos en el calendario para probar');

// ------------------------------------------------------------ 1. los minutos de fútbol dentro de la fase `live`
assert.equal(LIVE_END, ARENA_MATCHES.phases.live[1], 'el final no es el fin de la fase live');
assert.equal(HALVES.first.from, 0);
assert.equal(HALVES.second.to, LIVE_END);
const cases: [number, string | null, string][] = [
  [0, "1'", 'first'], [44.99, "45'", 'first'], [45, '45+1', 'first'], [46.99, '45+2', 'first'],
  [47, null, 'half'], [61.99, null, 'half'], [62, "46'", 'second'], [106.99, "90'", 'second'],
  [107, '90+1', 'second'], [109.99, '90+3', 'second'], [110, null, 'full'], [-0.01, null, 'pre'],
];
for (const [t, minute, stage] of cases) {
  assert.equal(footballMinute(t), minute, `minuto de fútbol a ${t}`);
  assert.equal(stageAt(t), stage, `fase a ${t}`);
}
// Las fases del calendario (metro, bares, calle) no se mueven: live acaba donde acaba el partido.
const md = days[0];
const m0 = matchOn(md)!;
const at = (day: number, minute: number) => ({ day: day + Math.floor(minute / DAY), hour: Math.floor((((minute % DAY) + DAY) % DAY) / 60), minute: ((minute % 60) + 60) % 60 });
assert.equal(matchPhase(at(md, m0.kickoff + 109)), 'live');
assert.equal(matchPhase(at(md, m0.kickoff + 110)), 'leaving');

// ------------------------------------------------------------ 2. un partido por fixture: el mismo se mire o no
const tl0 = timelineOf(m0);
assert.equal(timelineOf({ ...m0 }), tl0, 'dos líneas de tiempo para el mismo partido');
assert.equal(fixtureAt(tl0.kickoff + 30), tl0, 'el partido de ahora no es el del calendario');
assert.ok(tl0.moments.length >= 4, 'un partido sin ocasiones');
for (const d of days) {
  const tl = timelineOf(matchOn(d)!);
  let prevEnd = -Infinity;
  for (const m of tl.moments) {
    const half = m.at < HALVES.first.to ? HALVES.first : HALVES.second;
    assert.ok(m.start >= half.from && m.end <= half.to, `día ${d}: una jugada fuera de su parte (${m.minute})`);
    assert.ok(m.start >= prevEnd, `día ${d}: dos jugadas a la vez`);
    assert.ok(Math.abs(m.end - m.start - MOMENT_MINUTES) < 1e-9);
    prevEnd = m.end;
  }
  // Final = goles de la lista, y es lo que da el estado al acabar.
  const end = stateAt(tl, tl.kickoff + LIVE_END);
  assert.deepEqual(end.score, [...tl.final], `día ${d}: el final no es la suma de los goles`);
  assert.equal(end.stage, 'full');
}

// Visto fotograma a fotograma frente a no visto: mismo marcador, misma fase, mismo final; cada momento contado una vez.
for (const d of days.slice(0, 12)) {
  const tl = timelineOf(matchOn(d)!);
  let last: number | null = null;
  const seen: string[] = [];
  for (let abs = tl.kickoff - 30; abs <= tl.kickoff + LIVE_END + 5; abs += 1 / 30) {
    const said = announcement(tl, last, abs);
    if (said.kind === 'seen') seen.push(...said.moments.map((m) => m.minute + m.side));
    else assert.notEqual(said.kind, 'missed', 'mirando a ritmo normal sale un resumen de lo perdido');
    last = abs;
  }
  assert.deepEqual(seen, tl.moments.map((m) => m.minute + m.side), `día ${d}: cada momento se cuenta una vez y en orden`);
  for (const t of [-10, 0, 20, 46, 50, 70, 100, 110, 130]) {
    const watched = stateAt(tl, tl.kickoff + t);
    const cold = stateAt(timelineOf({ ...tl.match }), tl.kickoff + t);
    assert.deepEqual([watched.score, watched.stage, watched.clock], [cold.score, cold.stage, cold.clock], `día ${d} t ${t}: visto y no visto no coinciden`);
  }
}

// ------------------------------------------------------------ 3. el marcador cambia en su minuto exacto
for (const d of days.slice(0, 30)) {
  const tl = timelineOf(matchOn(d)!);
  for (const g of tl.moments.filter((m) => m.goal)) {
    const before = stateAt(tl, tl.kickoff + g.at - 1e-6).score;
    const after = stateAt(tl, tl.kickoff + g.at).score;
    const k = g.side === 'home' ? 0 : 1;
    assert.equal(after[k], before[k] + 1, `día ${d}: el gol del ${g.minute} no sube el marcador en su minuto`);
    assert.equal(after[1 - k], before[1 - k]);
  }
}
// Saque, descanso y final.
assert.equal(stateAt(tl0, tl0.kickoff - 1).stage, 'pre');
assert.match(stateAt(tl0, tl0.kickoff - 1).clock, /^Saque \d\d:\d\d$/);
assert.equal(stateAt(tl0, tl0.kickoff).clock, "1'");
assert.equal(stateAt(tl0, tl0.kickoff + 50).clock, 'Descanso');
assert.equal(stateAt(tl0, tl0.kickoff + LIVE_END).clock, 'Final');

// ------------------------------------------------------------ 4. llegar tarde, cargar, salir y volver, pasar el rato
const goaly: Timeline = days.map((d) => timelineOf(matchOn(d)!)).find((tl) => tl.moments.filter((m) => m.goal).length >= 2)!;
const firstGoal = goaly.moments.find((m) => m.goal)!;
const late = goaly.kickoff + firstGoal.at + 5;
// Al llegar (o al cargar la partida) no se celebra nada de antes; el marcador ya lo lleva.
assert.deepEqual(announcement(goaly, null, late), { kind: 'none' }, 'al llegar tarde se celebra un gol de antes');
const lateScore = stateAt(goaly, late).score;
assert.ok(lateScore[0] + lateScore[1] >= 1, 'llegando tarde, el marcador no lleva el gol');
// Salir y volver: un salto de reloj desde la última vez que se miró. Lo perdido, en un resumen, una sola vez.
const missed = announcement(goaly, goaly.kickoff + 1, goaly.kickoff + LIVE_END - 1);
assert.equal(missed.kind, 'missed');
assert.equal(missed.kind !== 'none' ? missed.moments.filter((m) => m.goal).length : -1, goaly.moments.filter((m) => m.goal && m.at > 1 && m.at <= LIVE_END - 1).length);
// Pasar el rato a pasos de un minuto o de golpe: mismo partido al final.
let stepped = goaly.kickoff - 60;
while (stepped < goaly.kickoff + LIVE_END) stepped += 1;
assert.deepEqual(stateAt(goaly, stepped).score, stateAt(goaly, goaly.kickoff + LIVE_END + 600).score);

// «Ver hasta el próximo momento»: nunca pasa del final, siempre avanza, no se come una jugada y acaba en el final.
for (const d of days.slice(0, 20)) {
  const tl = timelineOf(matchOn(d)!);
  let abs = tl.kickoff - 90;
  const stops: string[] = [];
  for (let i = 0; i < 30; i++) {
    const next = nextMoment(tl, abs);
    if (!next) break;
    assert.ok(next.minutes >= 1 && Number.isInteger(next.minutes), 'un salto sin minutos enteros');
    assert.ok(next.abs <= tl.kickoff + LIVE_END, `día ${d}: el salto pasa del final`);
    assert.ok(!tl.moments.some((m) => m.at > abs - tl.kickoff && m.at <= next.abs - tl.kickoff), `día ${d}: el salto se come una jugada`);
    stops.push(next.what);
    abs = next.abs;
    // Se mira la jugada entera y se vuelve a elegir.
    const watching = tl.moments.find((m) => m.start - 1 <= abs - tl.kickoff && abs - tl.kickoff < m.end);
    if (watching) abs = tl.kickoff + watching.end;
  }
  assert.equal(stops[0], 'el saque');
  assert.ok(stops.includes('la segunda parte') && stops[stops.length - 1] === 'el final', `día ${d}: ${stops.join(', ')}`);
  // EST-003: se para al empezar el descanso, justo antes de la segunda parte.
  assert.equal(stops[stops.indexOf('la segunda parte') - 1], 'el descanso', `día ${d}: no se para en el descanso: ${stops.join(', ')}`);
  assert.equal(nextMoment(tl, tl.kickoff + LIVE_END), null, 'se puede avanzar tras el final');
}

// ------------------------------------------------------------ 5. un partido tarde que cruza la medianoche
const night = timelineOf({ day: 40, kickoff: 23 * 60, rival: 'Unión Cantera' });
const pastMidnight = 40 * DAY + 30; // día 41 a las 00:30 = 90 minutos tras el saque
assert.equal(stateAt(night, pastMidnight).stage, 'second');
assert.equal(stateAt(night, pastMidnight).clock, "74'");
assert.equal(stateAt(night, 40 * DAY + 50).clock, 'Final');
assert.deepEqual(stateAt(night, 40 * DAY + 50).score, [...night.final]);
assert.ok(pitchAt(night, 90).show && !pitchAt(night, 115).show);

// ------------------------------------------------------------ 6. la biblioteca de jugadas y que nada salte
const ids = new Set<string>(PATTERNS.map((p) => p.id));
assert.ok(ids.size >= 6, 'menos de seis jugadas distintas');
for (const need of ['cross-goal', 'shot-saved', 'shot-wide', 'corner-goal', 'free-kick-saved', 'counter-cleared']) assert.ok(ids.has(need), `falta la jugada ${need}`);
assert.equal(new Set(PATTERNS.map((p) => JSON.stringify(p.beats))).size, PATTERNS.length, 'dos jugadas con el mismo recorrido');
for (const p of PATTERNS) {
  assert.ok(p.beats[0].u === 0 && p.beats[p.beats.length - 1].u === 1, `${p.id}: sin principio o sin final`);
  const decisive = p.beats.find((b) => Math.abs(b.u - p.decisive) < 1e-9);
  assert.ok(decisive?.say, `${p.id}: lo decisivo no es un punto de la jugada`);
  assert.equal(p.goal, decisive!.say === 'goal', `${p.id}: el gol no coincide con lo decisivo`);
}
const used = new Map<string, number>();
let worstBall = 0;
let worstPlayer = 0;
for (const d of days.slice(0, 30)) {
  const tl = timelineOf(matchOn(d)!);
  for (const m of tl.moments) used.set(m.pattern.id, (used.get(m.pattern.id) ?? 0) + 1);
  assert.ok(new Set(tl.moments.map((m) => m.pattern.id)).size >= 2, `día ${d}: todas las ocasiones son la misma jugada`);
  let prev = pitchAt(tl, -20);
  for (let t = -20; t < LIVE_END + 2; t += 1 / 30) {
    const p = pitchAt(tl, t);
    if (p.show && prev.show && stageAt(t) === stageAt(t - 1 / 30)) {
      worstBall = Math.max(worstBall, Math.hypot(p.ball.x - prev.ball.x, p.ball.y - prev.ball.y));
      for (const side of ['home', 'away'] as const) for (let i = 0; i < p[side].length; i++) worstPlayer = Math.max(worstPlayer, Math.hypot(p[side][i].x - prev[side][i].x, p[side][i].y - prev[side][i].y));
    }
    prev = p;
  }
}
assert.ok(used.size >= 6, `en 30 partidos se ven menos de seis jugadas distintas: ${[...used.keys()].join(', ')}`);
// Un fotograma (1/30 de minuto de juego, a 60 fps): un disparo cruza deprisa, pero nada aparece de golpe en otro sitio.
assert.ok(worstBall < 0.1, `el balón salta ${worstBall.toFixed(3)} campos en un fotograma`);
assert.ok(worstPlayer < 0.08, `un jugador salta ${worstPlayer.toFixed(3)} campos en un fotograma`);
// Cada equipo ataca hacia un lado y cambia en el descanso.
assert.ok(attacksRight('home', 10) && !attacksRight('home', 70) && !attacksRight('away', 10) && attacksRight('away', 70));
// Antes del calentamiento, en el descanso y al acabar, el campo está vacío.
assert.ok(!pitchAt(tl0, -30).show && pitchAt(tl0, -5).show && !pitchAt(tl0, 50).show && !pitchAt(tl0, LIVE_END + 1).show);

const finals = days.slice(0, 30).map((d) => timelineOf(matchOn(d)!).final.join('-'));
console.log(`Partido: 1'–45+2 / descanso / 46'–90+3 dentro de live (${LIVE_END} min); ${days.length} partidos, finales ${finals.slice(0, 10).join(' ')}…; ${used.size} jugadas distintas; visto = no visto; marcador en su minuto; tarde, salir/volver, saltos y medianoche OK; balón ≤ ${worstBall.toFixed(3)}, jugadores ≤ ${worstPlayer.toFixed(3)} por fotograma`);
