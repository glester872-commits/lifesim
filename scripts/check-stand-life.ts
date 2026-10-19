// La grada en día de partido (systems/StandLife, data/standLife.ts), sin Phaser: el humor sigue al partido de verdad,
// cada aviso suena una vez y nunca al llegar o tras un salto, la celebración se apaga sola, no todos reaccionan igual,
// los cánticos no pisan jugadas y lo que se pinta cabe en sus topes. Llamado desde la cadena `check` de package.json.
// `node scripts/check-stand-life.ts`.
import assert from 'node:assert/strict';
import { HALVES, LIVE_END } from '../src/data/matchPlay.ts';
import { matchOn } from '../src/systems/Match.ts';
import { timelineOf, type Timeline } from '../src/systems/MatchPlay.ts';
import { CHANT, HALFTIME_ERRAND, REACTION, STAND_BUDGET } from '../src/data/standLife.ts';
import { STADIUM, STADIUM_PROFILE } from '../src/data/stadium.ts';
import { chantsOf, spectatorPose, standCues, standMood, supporterOf } from '../src/systems/StandLife.ts';

const days = Array.from({ length: 200 }, (_, i) => i + 1).filter((d) => matchOn(d));
const tls: Timeline[] = days.map((d) => timelineOf(matchOn(d)!));
const withGoal = (side: 'home' | 'away'): Timeline => {
  const tl = tls.find((t) => t.moments.some((m) => m.goal && m.side === side));
  assert.ok(tl, `ningún partido con gol ${side}`);
  return tl;
};

// ------------------------------------------------------------ 1. el humor sigue al partido y vuelve a la calma
for (const side of ['home', 'away'] as const) {
  const tl = withGoal(side);
  const g = tl.moments.find((m) => m.goal && m.side === side)!;
  const at = standMood(tl, g.at + 0.5);
  assert.equal(at.kind, 'goal', `tras el gol ${side}, la grada no reacciona`);
  assert.equal(at.side, side);
  assert.ok(standMood(tl, g.at + 6).strength < at.strength, 'la celebración no baja');
  assert.notEqual(standMood(tl, g.at + REACTION.goal + 0.1).id, at.id, 'la celebración no se acaba');
  // Lo mismo consultado mil veces: el mismo humor, el mismo id.
  for (let i = 0; i < 1000; i++) assert.equal(standMood(tl, g.at + 0.5).id, at.id);
}
const tl0 = tls[0];
assert.equal(standMood(tl0, -200).kind, 'off');
assert.equal(standMood(tl0, (HALVES.first.to + HALVES.second.from) / 2).kind, 'break');
assert.equal(standMood(tl0, LIVE_END + 1).kind, 'final');
const [h, a] = tl0.final;
assert.equal(standMood(tl0, LIVE_END + 1).side, h > a ? 'home' : a > h ? 'away' : null, 'el final no va con el resultado');

// ------------------------------------------------------------ 2. cada aviso, una vez; al llegar o tras un salto, nada
for (const tl of tls.slice(0, 40)) {
  const seen = new Map<string, number>();
  let last: number | null = null;
  for (let abs = tl.kickoff - 100; abs <= tl.kickoff + LIVE_END + 20; abs += 0.25) {
    for (const c of standCues(tl, last, abs)) seen.set(c.id, (seen.get(c.id) ?? 0) + 1);
    last = abs;
  }
  for (const [id, n] of seen) assert.equal(n, 1, `${id} suena ${n} veces`);
  const kinds = [...seen.keys()];
  for (const w of ['whistle-start', 'whistle-half', 'whistle-second', 'whistle-final']) assert.ok(kinds.some((k) => k.endsWith(w)), `falta ${w}`);
  assert.equal(kinds.filter((k) => /:at\d+$/.test(k)).length, tl.moments.length, 'no suena cada jugada decisiva');
  // Llegar tarde (o recargar) a mitad: sin `last`, nada; tras un salto de tiempo (pasar el rato), nada de lo saltado.
  assert.deepEqual(standCues(tl, null, tl.kickoff + 30), []);
  assert.deepEqual(standCues(tl, tl.kickoff + 10, tl.kickoff + 40), []);
}

// ------------------------------------------------------------ 3. los cánticos no pisan jugadas
for (const tl of tls) {
  const cs = chantsOf(tl);
  assert.equal(new Set(cs.map((c) => c.id)).size, cs.length, 'cánticos con el mismo id');
  for (const c of cs.filter((x) => !x.id.includes('c-g') && !x.id.endsWith('c-pre'))) {
    assert.ok(!tl.moments.some((m) => m.start - 1 < c.start + CHANT.length && c.start < m.end + 1), `cántico ${c.id} encima de una jugada`);
  }
}

// ------------------------------------------------------------ 4. cada cual a su manera
const ids = Array.from({ length: 400 }, (_, i) => i + 1);
const away = ids.filter((i) => supporterOf(i, true) === 'away').length / ids.length;
assert.ok(away > 0.05 && away < 0.2, `afición visitante ${away}`);
assert.equal(supporterOf(7, false), 'neutral');
{
  const tl = withGoal('home');
  const g = tl.moments.find((m) => m.goal && m.side === 'home')!;
  const m = standMood(tl, g.at + 1.5);
  const home = ids.filter((i) => supporterOf(i, true) === 'home');
  const poses = home.map((i) => spectatorPose(m, 'home', i, 1234, false, null));
  const up = poses.filter((p) => p !== null).length / home.length;
  assert.ok(up > 0.6 && up < 1, `celebran el gol ${up}`);
  assert.ok(new Set(poses).size >= 3, 'todos celebran con el mismo gesto');
  // Con el gol de casa, los del rival no celebran.
  for (const i of ids.filter((x) => supporterOf(x, true) === 'away')) assert.ok(![21, 7, 0].includes(spectatorPose(m, 'away', i, 1234, false, null) ?? -1), `el visitante ${i} celebra`);
  // Sin movimiento: la misma reacción en cualquier instante.
  for (const i of home.slice(0, 50)) assert.equal(spectatorPose(m, 'home', i, 0, true, null), spectatorPose(m, 'home', i, 99_999, true, null));
  // Al rato, a la calma: casi nadie sigue de pie.
  const later = standMood(tl, g.at + REACTION.goal + 0.5);
  if (later.kind === 'calm') {
    const still = home.filter((i) => spectatorPose(later, 'home', i, 1234, false, null) !== null).length / home.length;
    assert.ok(still < 0.2, `la celebración no se apaga (${still})`);
  }
}

// ------------------------------------------------------------ 5. topes y paso libre
assert.ok(STADIUM_PROFILE.maxVisitors <= 20, 'demasiada gente simulada en la grada');
for (const b of Object.values(STAND_BUDGET)) assert.ok(b.flags <= 6, 'demasiadas banderas');
const concourse = Object.entries(STADIUM.points ?? {}).filter(([k]) => HALFTIME_ERRAND.points.some((p) => k.startsWith(p)));
assert.ok(concourse.length >= HALFTIME_ERRAND.count[1], 'menos sitios en el vestíbulo que gente que baja');
const exit = STADIUM.portals[0];
for (const [k, p] of concourse) {
  // Ni en la escalera (x 11–12) ni delante de la puerta: el paso de la grada a la salida queda libre.
  assert.ok(p.tx < 10 || p.tx > 13, `${k} tapa la bajada a la puerta`);
  assert.ok(Math.abs(p.tx - exit.tx) + Math.abs(p.ty - exit.ty) > 2, `${k} delante de la puerta`);
  assert.notEqual(STADIUM.ground[p.ty][p.tx], 'W', `${k} dentro de un muro`);
}

console.log(`check-stand-life: ok (${tls.length} partidos)`);
