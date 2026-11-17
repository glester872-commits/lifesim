// CA-05 · La liga del barrio de Campo Alto (data/campoAltoLeague.ts, systems/League.ts), observada: el calendario sale
// de la fecha, cada resultado es una función pura del partido (no del día en que se mira), la tabla cuadra (PJ, puntos,
// goles), el campeón y el historial no cambian al pasar temporadas, los partidos no pisan los penaltis del sábado, el
// café está abierto al acabar y el tablón trae sus cuatro páginas y anuncia la jornada. Sin Phaser.
import assert from 'node:assert/strict';
import { LEAGUES } from '../src/data/campoAltoLeague.ts';
import { PITCHES } from '../src/data/futsal.ts';
import { STREET_PROFILES } from '../src/data/streets.ts';
import { boardAt } from '../src/systems/Boards.ts';
import { rhythmAt, weekIndex } from '../src/systems/Calendar.ts';
import { champion, fateOf, fixtures, history, lastRound, nextFixtures, restDay, resultOf, seasonOf, standings, type Fixture } from '../src/systems/League.ts';
import { isOpen, placeInfo } from '../src/systems/Places.ts';
import { forceWeather, HEAVY_RAIN, weatherAt } from '../src/systems/Weather.ts';

// (a)…(g), con la lluvia desactivada: el calendario de siempre, sin aplazamientos. La lluvia, en (h)…(k).
const DRY = { rain: 0, cloud: 0, celsius: 20, wet: 0 };
forceWeather(DRY);

const def = LEAGUES['campo-alto'];
assert.ok(def, 'Campo Alto no tiene liga');
const abs = (day: number, min = 0): number => (day - 1) * 1440 + min;
const endAbs = (f: Fixture): number => abs(f.day, f.endMin);
const DAYS = 800;
const SEASONS = seasonOf(def, DAYS) + 1;

// (a) Calendario: cada jornada en su día de la semana, una por semana, y la última semana de la temporada, de descanso.
for (let s = 0; s < SEASONS; s++) {
  const all = fixtures(def, s);
  assert.equal(all.length, def.rounds.flat().length);
  for (const f of all) {
    assert.equal(weekIndex(f.day), def.weekday, `t${s} j${f.round}: fuera de su día`);
    assert.equal(seasonOf(def, f.day), s, `t${s} j${f.round}: cae en otra temporada`);
    assert.ok(f.startMin < f.endMin);
  }
}

// (b) El resultado es del partido, no del día de consulta: undefined un minuto antes del final, y luego siempre igual.
let draws = 0;
for (let s = 0; s < 20; s++) {
  for (const f of fixtures(def, s)) {
    const end = endAbs(f);
    assert.equal(resultOf(def, f, end - 1), undefined, 'hay resultado antes de acabar');
    const r = resultOf(def, f, end);
    assert.ok(r, 'sin resultado al acabar');
    for (const later of [end + 1, end + 1440, end + 7 * 1440, abs(DAYS + 400)]) assert.deepEqual(resultOf(def, f, later), r, 'el resultado depende del día de consulta');
    for (const g of [r.hg, r.ag]) assert.ok(Number.isInteger(g) && g >= 0 && g <= def.maxGoals, `goles fuera de rango: ${g}`);
    if (r.hg === r.ag) draws++;
  }
}
assert.ok(draws > 0, 'ningún empate en 20 temporadas');

// (c) Sin estado: misma hora, misma tabla; de golpe o día a día (y al revés), lo mismo.
const snapshot = (nowAbs: number): string => JSON.stringify([standings(def, seasonOf(def, Math.floor(nowAbs / 1440) + 1), nowAbs), history(def, nowAbs), nextFixtures(def, nowAbs), lastRound(def, nowAbs)]);
const forward = Array.from({ length: 60 }, (_, i) => snapshot(abs(i + 1, 20 * 60)));
const backward = Array.from({ length: 60 }, (_, i) => snapshot(abs(60 - i, 20 * 60))).reverse();
assert.deepEqual(forward, backward, 'día a día y al revés no dan las mismas tablas');
assert.equal(snapshot(abs(45, 20 * 60)), forward[44], 'de golpe al día 45 no da la misma tabla');
assert.equal(snapshot(abs(45, 20 * 60)), snapshot(abs(45, 20 * 60)), 'dos llamadas, dos tablas');

// (d) La tabla cuadra en cada momento: ΣPJ = 2·jugados, PJ = jornadas jugadas por equipo, pts = 3V+E, ΣGF = ΣGC.
for (let day = 1; day <= 120; day++) {
  for (const min of [17 * 60 + 30, 18 * 60, 18 * 60 + 30, 19 * 60, 23 * 60]) {
    const now = abs(day, min);
    const s = seasonOf(def, day);
    const rows = standings(def, s, now);
    const played = fixtures(def, s).filter((f) => now >= endAbs(f));
    assert.equal(rows.reduce((n, r) => n + r.pj, 0), 2 * played.length, `día ${day}: ΣPJ`);
    assert.equal(rows.reduce((n, r) => n + r.gf, 0), rows.reduce((n, r) => n + r.gc, 0), `día ${day}: ΣGF ≠ ΣGC`);
    for (const r of rows) {
      assert.equal(r.pj, played.filter((f) => f.home === r.team || f.away === r.team).length, `día ${day}: PJ de ${r.team}`);
      assert.equal(r.pj, r.v + r.e + r.d);
      assert.equal(r.pts, 3 * r.v + r.e, `día ${day}: puntos de ${r.team}`);
      assert.equal(r.dg, r.gf - r.gc);
    }
    for (let i = 1; i < rows.length; i++) {
      const [a, b] = [rows[i - 1], rows[i]];
      assert.ok(a.pts > b.pts || (a.pts === b.pts && (a.dg > b.dg || (a.dg === b.dg && (a.gf > b.gf || (a.gf === b.gf && a.team.localeCompare(b.team, 'es') < 0))))), `día ${day}: orden de la tabla`);
    }
  }
}

// (e) Campeón e historial estables al pasar de temporada y de año del juego (días 1…800).
const crowned = new Map<number, string>();
for (let day = 1; day <= DAYS; day++) {
  const now = abs(day, 23 * 60);
  const h = history(def, now);
  assert.ok(h.length <= 5);
  for (let i = 1; i < h.length; i++) assert.ok(h[i - 1].season > h[i].season, 'historial fuera de orden');
  for (const { season, champion: c } of h) {
    assert.equal(c, champion(def, season, now));
    if (crowned.has(season)) assert.equal(crowned.get(season), c, `el campeón de la temporada ${season + 1} cambió el día ${day}`);
    else crowned.set(season, c);
  }
  const s = seasonOf(def, day);
  const all = fixtures(def, s);
  const last = all[all.length - 1];
  assert.equal(champion(def, s, now) !== undefined, now >= endAbs(last), `día ${day}: campeón antes de tiempo`);
}
assert.ok(crowned.size >= SEASONS - 1, 'faltan campeones');

// (f) La pista no se pisa con los penaltis y el café está abierto al acabar; la calle manda gente al café a esa hora.
const pitches = Object.values(PITCHES['campo-alto'] ?? {});
const cafe = placeInfo('ca-cafe');
assert.ok(cafe, 'no existe ca-cafe');
const trip = STREET_PROFILES.find((p) => p.location === 'campo-alto')!.trips.find((t) => t.role === 'futsal-league-cafe');
assert.ok(trip, 'falta el viaje futsal-league-cafe');
for (let s = 0; s < SEASONS; s++) {
  for (const f of fixtures(def, s)) {
    for (const p of pitches) {
      const clash = weekIndex(f.day) === p.open.weekday && f.startMin < p.open.to * 60 && p.open.from * 60 < f.endMin;
      assert.ok(!clash, `t${s} j${f.round}: la liga pisa ${p.label}`);
    }
  }
  const lastEnd = Math.max(...fixtures(def, s).map((f) => f.endMin));
  const day = fixtures(def, s)[0].day;
  assert.ok(isOpen(cafe, day, Math.floor(lastEnd / 60), lastEnd % 60), `t${s}: el café está cerrado al acabar la jornada`);
  assert.ok(trip.rhythms?.includes(rhythmAt(day, trip.hours[0])), `t${s}: futsal-league-cafe no sale a la hora de la reunión`);
}

// (g) El tablón: cuatro páginas, con la verdad sobre las inscripciones, y la jornada anunciada los días anteriores.
const at = (day: number, hour: number, minute = 0) => boardAt('campo-alto', 40, 14, { day, hour, minute });
const board = at(3, 12);
assert.deepEqual(board.league?.pages.map((p) => p.title), ['Jornada', 'Última jornada', 'Clasificación', 'Campeones']);
assert.ok(board.league!.pages[0].lines.some((l) => /Puedes apuntarte en este tablón/.test(l)), 'el tablón no dice que puedes apuntarte');
assert.deepEqual(board.league!.pages[3].lines, ['Aún no hay campeones.']);
const first = fixtures(def, 0)[0];
const label = `${first.home} – ${first.away}`;
const entryOf = (day: number, hour: number, minute = 0) => at(day, hour, minute).sections.find((s) => s.id === 'events')!.entries.find((e) => e.label === label);
for (let day = first.day - 6; day < first.day; day++) {
  const e = entryOf(day, 12);
  assert.ok(e && e.state === 'later', `día ${day}: no se anuncia ${label}`);
}
assert.equal(entryOf(first.day, 12)?.detail, 'hoy 17:00');
assert.deepEqual([entryOf(first.day, 17, 30)?.state, entryOf(first.day, 17, 30)?.detail], ['active', 'ahora · hasta 18:00']);
assert.equal(entryOf(first.day, 19)?.state, 'ended');
assert.equal(boardAt('ribera', 0, 0, { day: 3, hour: 12, minute: 0 }).league, undefined, 'la liga es del tablón de Campo Alto');

// La lluvia fuerte a la hora de empezar aplaza el partido a la semana de descanso (mismo día y franja); si allí también
// llueve, suspendido: 0 PJ, sin puntos. Las tablas sin lluvia, para comparar en (k).
const drySnap = new Map<number, string>();
for (let day = 1; day <= DAYS; day++) drySnap.set(day, JSON.stringify(standings(def, seasonOf(def, day), abs(day, 23 * 60))));
const dryResult = (f: Fixture) => resultOf(def, f, abs(DAYS + 400));
const rest0 = restDay(def, 0)!;
assert.ok(rest0 !== undefined && weekIndex(rest0) === def.weekday && seasonOf(def, rest0) === 0, 'la semana de descanso no es de la temporada');
assert.ok(fixtures(def, 0).every((f) => f.day < rest0), 'la semana de descanso no va tras la última jornada');
const hhmm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// (h) Lluvia fuerte forzada: a su hora el partido no cuenta y el tablón dice «aplazado por la lluvia».
forceWeather({ rain: 0.9, cloud: 1, celsius: 12, wet: 0.9 });
assert.equal(fateOf(def, first, abs(first.day, first.startMin) - 1).fate, 'scheduled', 'se aplaza antes de su hora');
assert.deepEqual(fateOf(def, first, abs(first.day, 23 * 60)), { fate: 'postponed', day: rest0 });
assert.equal(resultOf(def, first, abs(first.day, 23 * 60)), undefined, 'el aplazado tiene resultado');
assert.ok(standings(def, 0, abs(first.day, 23 * 60)).every((r) => r.pj === 0 && r.pts === 0), 'el aplazado cuenta en la tabla');
assert.deepEqual([entryOf(first.day, 17, 30)?.state, entryOf(first.day, 17, 30)?.detail], ['cancelled', 'aplazado por la lluvia']);
assert.ok(at(first.day, 17, 30).league!.pages[0].lines.some((l) => l.includes(label) && l.includes('aplazado por la lluvia')), 'la página de la jornada no dice que se aplaza');
// (j) Si en la semana de descanso también llueve a su hora: suspendido, sin puntos y sin campeón.
assert.deepEqual([entryOf(rest0, 12)?.state, entryOf(rest0, 12)?.detail], ['today', `hoy ${hhmm(first.startMin)}`], 'el aplazado no se anuncia en la semana de descanso');
assert.ok(at(rest0, 12).league!.pages[0].lines[0].includes('partidos aplazados por la lluvia'));
assert.deepEqual(fateOf(def, first, abs(rest0, first.startMin)), { fate: 'suspended', day: rest0 });
assert.deepEqual([entryOf(rest0, 17, 30)?.state, entryOf(rest0, 17, 30)?.detail], ['cancelled', 'suspendido por la lluvia']);
assert.ok(standings(def, 0, abs(rest0, 23 * 60)).every((r) => r.pj === 0 && r.pts === 0), 'el suspendido cuenta en la tabla');
assert.equal(champion(def, 0, abs(rest0, 23 * 60)), undefined, 'campeón sin ningún partido jugado');
forceWeather(null);

// (i) Con el tiempo de verdad: un partido con chaparrón a su hora y la semana de descanso seca se juega entonces,
// con el mismo marcador que tendría en su día.
const heavy = (f: Fixture, day: number): boolean => weatherAt(day, f.startMin / 60).rain > HEAVY_RAIN;
let replayed: Fixture | undefined;
for (let s = 0; s < 400 && !replayed; s++) replayed = fixtures(def, s).find((f) => heavy(f, f.day) && !heavy(f, restDay(def, s)!));
assert.ok(replayed, 'ningún partido aplazado y jugado en 400 temporadas');
const rest = restDay(def, replayed.season)!;
assert.deepEqual(fateOf(def, replayed, abs(replayed.day, 23 * 60)), { fate: 'postponed', day: rest });
assert.equal(resultOf(def, replayed, abs(replayed.day, 23 * 60)), undefined);
assert.equal(resultOf(def, replayed, abs(rest, replayed.endMin) - 1), undefined, 'resultado antes de acabar el aplazado');
forceWeather(DRY);
const expected = dryResult(replayed);
forceWeather(null);
assert.deepEqual(resultOf(def, replayed, abs(rest, replayed.endMin)), expected, 'el aplazado no da el marcador del partido');
const team = standings(def, replayed.season, abs(rest, 23 * 60)).find((r) => r.team === replayed!.home)!;
assert.equal(team.pj, fixtures(def, replayed.season).filter((f) => (f.home === team.team || f.away === team.team) && resultOf(def, f, abs(rest, 23 * 60))).length);
const replayEntry = boardAt('campo-alto', 40, 14, { day: rest, hour: 12, minute: 0 }).sections.find((s) => s.id === 'events')!.entries.find((e) => e.label === `${replayed!.home} – ${replayed!.away}`);
assert.deepEqual([replayEntry?.state, replayEntry?.detail], ['today', `hoy ${hhmm(replayed.startMin)}`], 'el aplazado no sale en la semana de descanso');

// (k) Con el tiempo de verdad: las temporadas sin chaparrón a la hora de ningún partido dan las tablas de siempre; en
// todas, la tabla cuadra y el campeón no cambia al pasar los días.
let drySeasons = 0;
const realCrowned = new Map<number, string>();
for (let s = 0; s < SEASONS; s++) {
  const all = fixtures(def, s);
  const wet = all.some((f) => heavy(f, f.day));
  if (!wet) drySeasons++;
  for (let day = s * def.seasonWeeks * 7 + 1; day <= Math.min(DAYS, (s + 1) * def.seasonWeeks * 7); day++) {
    const now = abs(day, 23 * 60);
    const rows = standings(def, s, now);
    if (!wet) assert.equal(JSON.stringify(rows), drySnap.get(day), `t${s} día ${day}: sin lluvia, otra tabla`);
    assert.equal(rows.reduce((n, r) => n + r.pj, 0), 2 * all.filter((f) => resultOf(def, f, now)).length, `t${s} día ${day}: ΣPJ con lluvia`);
    for (const r of rows) assert.equal(r.pts, 3 * r.v + r.e);
    const c = champion(def, s, now);
    if (c && realCrowned.has(s)) assert.equal(realCrowned.get(s), c, `t${s}: el campeón cambió el día ${day}`);
    else if (c) realCrowned.set(s, c);
  }
}
assert.ok(drySeasons > 0, 'ninguna temporada sin lluvia para comparar');

console.log(`check-league: ok (${SEASONS} temporadas en ${DAYS} días, ${draws} empates en 20, ${crowned.size} campeones estables)`);
