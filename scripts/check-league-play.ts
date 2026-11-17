// CA-05b · Jugar en la liga del barrio (systems/League.ts): el marcador jugado sustituye al determinista una sola vez
// y sólo en su partido; recordPlayed es idempotente; el guardado (parseLeague) va y vuelve sin cambiar la tabla y
// rechaza basura; un abandono deja el resultado determinista; la temporada nueva conserva el equipo sin chocar ids;
// la tabla cuadra con partidos jugados; los goles del rival son deterministas; playerFixture sólo da el partido en su
// ventana y no el aplazado por la lluvia; y los penaltis del sábado siguen siendo cinco tiros. Sin Phaser.
import assert from 'node:assert/strict';
import { LEAGUES } from '../src/data/campoAltoLeague.ts';
import { boardAt } from '../src/systems/Boards.ts';
import { FUTSAL, PenaltySession } from '../src/systems/Futsal.ts';
import {
  champion, fixtures, lastRound, MATCH_SHOTS, matchId, parseLeague, playedResult, playerFixture, recordPlayed, resultOf, rivalGoals, seasonOf, standings,
  type LeagueState,
} from '../src/systems/League.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { forceWeather } from '../src/systems/Weather.ts';

const DRY = { rain: 0, cloud: 0, celsius: 20, wet: 0 };
forceWeather(DRY);

const def = LEAGUES['campo-alto'];
assert.ok(def, 'Campo Alto no tiene liga');
const abs = (day: number, min = 0): number => (day - 1) * 1440 + min;
const team = def.teams[0];
const s0 = fixtures(def, 0);
const mine = s0.find((f) => f.home === team || f.away === team)!;
const other = s0.find((f) => f.round === mine.round && f.match !== mine.match)!;
const id = matchId(def, mine);
const end = abs(mine.day, mine.endMin);
const night = abs(mine.day, 23 * 60);
const late = abs(def.seasonWeeks * 7 + 1) - 1; // el último minuto de la temporada 0
const json = (x: unknown): string => JSON.stringify(x);

// (a) El jugado sustituye al determinista, sólo tras su final, una vez, y el otro partido de la jornada no cambia.
const det = resultOf(def, mine, end)!;
const res = { hg: det.hg + 1, ag: det.ag };
const ls = recordPlayed({ team, played: {} }, id, res);
assert.deepEqual(resultOf(def, mine, end, ls.played), { home: mine.home, away: mine.away, ...res }, 'no se usa el marcador jugado');
assert.equal(resultOf(def, mine, end - 1, ls.played), undefined, 'el jugado se ve antes de acabar el partido');
assert.deepEqual(resultOf(def, other, abs(other.day, other.endMin), ls.played), resultOf(def, other, abs(other.day, other.endMin)), 'el otro partido cambió');
const withP = standings(def, 0, night, ls.played);
const without = standings(def, 0, night);
const row = (rows: typeof withP, t: string) => rows.find((r) => r.team === t)!;
assert.equal(row(withP, mine.home).gf - row(without, mine.home).gf, 1, 'el jugado no cuenta exactamente una vez');
assert.equal(withP.reduce((n, r) => n + r.pj, 0), without.reduce((n, r) => n + r.pj, 0), 'el jugado cambia los PJ');
assert.ok(lastRound(def, night, ls.played).some((x) => x.fixture.match === mine.match && x.result.hg === res.hg && x.result.ag === res.ag), 'lastRound no usa el jugado');
assert.equal(champion(def, 0, late, ls.played), standings(def, 0, late, ls.played)[0].team, 'el campeón no sale de la tabla con el jugado');

// playedResult: local o visitante.
assert.deepEqual(playedResult(mine, mine.home, 4, 1), { hg: 4, ag: 1 });
assert.deepEqual(playedResult(mine, mine.away, 4, 1), { hg: 1, ag: 4 });

// (b) Idempotente: lo apuntado no se sobrescribe.
const again = recordPlayed(ls, id, { hg: 0, ag: 9 });
assert.deepEqual(again, ls, 'recordPlayed sobrescribió');

// (c) Ida y vuelta por el guardado: misma inscripción, misma tabla.
const back = parseLeague(JSON.parse(json(ls)));
assert.deepEqual(back, ls, 'parseLeague no devuelve lo guardado');
assert.equal(json(standings(def, 0, late, back!.played)), json(standings(def, 0, late, ls.played)), 'la tabla cambia al recargar');

// (d) Abandono: sin entrada, determinista.
assert.equal(json(standings(def, 0, late, {})), json(standings(def, 0, late)), 'sin jugar, otra tabla');

// (e) Temporada nueva: mismo equipo, ids sin choque, y el partido del equipo se ofrece aunque haya jugados de antes.
const ids = new Set<string>();
for (let s = 0; s < 10; s++) for (const f of fixtures(def, s)) ids.add(matchId(def, f));
assert.equal(ids.size, 10 * def.rounds.flat().length, 'los ids chocan entre temporadas');
const s1 = fixtures(def, 1).find((f) => f.home === team || f.away === team)!;
const offered = playerFixture(def, ls.team, abs(s1.day, s1.startMin), ls.played);
assert.equal(offered && matchId(def, offered), matchId(def, s1), 'en la temporada nueva no se ofrece el partido del equipo');
assert.equal(seasonOf(def, s1.day), 1);

// (f) ΣGF = ΣGC con jugados mezclados (varias temporadas, marcadores raros).
let mixed: LeagueState = { team, played: {} };
for (let s = 0; s < 4; s++) {
  for (const f of fixtures(def, s).filter((x) => x.home === team || x.away === team)) mixed = recordPlayed(mixed, matchId(def, f), playedResult(f, team, (f.round * 5) % 7, rivalGoals(def, f, MATCH_SHOTS)));
}
for (let day = 1; day <= 4 * def.seasonWeeks * 7; day++) {
  const rows = standings(def, seasonOf(def, day), abs(day, 23 * 60), mixed.played);
  assert.equal(rows.reduce((n, r) => n + r.gf, 0), rows.reduce((n, r) => n + r.gc, 0), `día ${day}: ΣGF ≠ ΣGC con jugados`);
  for (const r of rows) assert.equal(r.pts, 3 * r.v + r.e);
}

// (g) parseLeague rechaza basura y descarta lo raro.
for (const junk of [undefined, null, 5, 'x', [], {}, { team: 'Nadie FC' }, { team: 5 }]) assert.equal(parseLeague(junk), undefined, `acepta ${json(junk)}`);
assert.deepEqual(parseLeague({ team, played: 'x' }), { team, played: {} });
assert.deepEqual(
  parseLeague({ team, played: { a: { hg: 13, ag: 0 }, b: { hg: 1.5, ag: 0 }, c: { hg: -1, ag: 0 }, d: 'x', e: { hg: 2, ag: 3 }, f: null } }),
  { team, played: { e: { hg: 2, ag: 3 } } },
);
const many = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`k${i}`, { hg: 1, ag: 1 }]));
assert.equal(Object.keys(parseLeague({ team, played: many })!.played).length, 200, 'sin tope de entradas');

// (h) rivalGoals: determinista, en rango y por prefijos.
let total = 0;
let n = 0;
for (let s = 0; s < 50; s++) {
  for (const f of fixtures(def, s)) {
    const g = rivalGoals(def, f, MATCH_SHOTS);
    assert.equal(rivalGoals(def, f, MATCH_SHOTS), g, 'rivalGoals no es determinista');
    assert.ok(g >= 0 && g <= MATCH_SHOTS);
    for (let k = 0; k < MATCH_SHOTS; k++) {
      const d = rivalGoals(def, f, k + 1) - rivalGoals(def, f, k);
      assert.ok(d === 0 || d === 1, 'rivalGoals no va por prefijos');
    }
    total += g;
    n++;
  }
}
const mean = total / n;
assert.ok(mean > 0.3 * MATCH_SHOTS && mean < 0.6 * MATCH_SHOTS, `media de goles del rival rara: ${mean}`);

// (i) playerFixture: sólo en su ventana, no si ya está jugado, no con lluvia fuerte a la hora.
const start = abs(mine.day, mine.startMin);
assert.equal(playerFixture(def, team, start, {})?.match, mine.match, 'no se ofrece el partido en su hora');
assert.equal(playerFixture(def, team, end - 1, {})?.match, mine.match);
assert.equal(playerFixture(def, team, start - 1, {}), undefined, 'se ofrece antes de su hora');
assert.equal(playerFixture(def, team, end, {}), undefined, 'se ofrece al acabar');
assert.equal(playerFixture(def, team, start, ls.played), undefined, 'se ofrece un partido ya jugado');
assert.equal(playerFixture(def, 'Nadie FC', start, {}), undefined);
forceWeather({ rain: 0.9, cloud: 1, celsius: 12, wet: 0.9 });
assert.equal(playerFixture(def, team, start + 10, {}), undefined, 'se ofrece un partido aplazado por la lluvia');
forceWeather(DRY);

// (j) El tablón: lee los jugados y dice la verdad sobre la inscripción.
const at = (l?: LeagueState) => boardAt('campo-alto', 40, 14, { day: mine.day, hour: 23, minute: 0 }, l)!.league!;
assert.ok(at().pages[0].lines.some((l) => l.includes('Puedes apuntarte')), 'sin inscripción, el tablón no lo dice');
assert.ok(at(ls).pages[0].lines.some((l) => l.includes(`Tu equipo: ${team}`)), 'inscrito, el tablón no dice el equipo');
assert.notEqual(json(at(ls).pages[2]), json(at().pages[2]), 'la clasificación del tablón no usa el jugado');

// (k) Los penaltis siguen siendo cinco tiros; el partido de liga, seis.
const geo = { feet: { x: 0, y: 0 }, goalCenter: { x: 100, y: 0 }, goalHalfHeight: 10 };
const play = (s: PenaltySession): number => {
  for (let i = 0; i < 20_000 && s.phase !== 'done'; i++) s.update(16, { aim: 0, down: s.phase === 'aim' || (s.phase === 'charging' && s.power < 0.6) });
  return s.taken;
};
assert.equal(FUTSAL.shots, 5);
assert.equal(play(new PenaltySession(geo, seededRng(1))), 5, 'la tanda no es de cinco');
assert.equal(play(new PenaltySession(geo, seededRng(1), MATCH_SHOTS)), MATCH_SHOTS, 'el partido no es de seis');

forceWeather(null);
console.log(`check-league-play: ok (rival ${mean.toFixed(2)} goles de media en ${n} partidos)`);
