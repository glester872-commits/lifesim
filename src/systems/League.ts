// Sin Phaser: lo usan systems/Boards (el tablón de Campo Alto) y scripts/check-league.ts.
import type { LeagueDef } from '../data/campoAltoLeague.ts';
import { DAYS_PER_WEEK } from './Calendar.ts';
import { hashSeed, seededRng } from './MetroDaily.ts';
import { HEAVY_RAIN, weatherAt } from './Weather.ts';

/**
 * CA-05 · La liga del barrio, OBSERVADA. Auditoría previa: CA-02 (systems/Futsal.ts, PenaltySession) es una tanda de
 * cinco penaltis del jugador contra un portero, con mejor marca semanal; no hay partido de equipo. El partido del
 * Arena (systems/Match.ts, data/cityEvents ARENA_MATCHES) es un evento de ambiente y no se toca. Así que aquí no hay
 * jugadores ni simulación: el calendario sale de la fecha y cada resultado es una función pura de (liga, temporada,
 * jornada, partido). Inscribirse y jugar en un equipo, pendiente: no existe ninguna afordancia para ello.
 *
 * Nada va al guardado: todo se recalcula de `nowAbs` = (día - 1) · 1440 + minutos del día. Si el jugador llegara a
 * jugar, su resultado ya no sería derivable y haría falta guardar un id estable por partido (p. ej.
 * `${def.id}:${season}:${round}:${match}`) con su marcador.
 */

export interface Fixture {
  season: number;
  round: number;
  match: number;
  home: string;
  away: string;
  day: number;
  startMin: number;
  endMin: number;
}

export interface Result {
  home: string;
  away: string;
  hg: number;
  ag: number;
}

export interface Row {
  team: string;
  pj: number;
  v: number;
  e: number;
  d: number;
  gf: number;
  gc: number;
  dg: number;
  pts: number;
}

const dayOf = (nowAbs: number): number => Math.floor(nowAbs / 1440) + 1;
const startAt = (f: Fixture, day: number): number => (day - 1) * 1440 + f.startMin;
const endAt = (f: Fixture, day: number): number => (day - 1) * 1440 + f.endMin;
/** Lluvia fuerte a la hora de empezar, con el mismo umbral que los pop-ups al aire libre (systems/PopUps). */
const rainedOut = (f: Fixture, day: number): boolean => weatherAt(day, f.startMin / 60).rain > HEAVY_RAIN;

/** El día de la semana de descanso de la temporada (el de la jornada, tras la última); undefined si no hay descanso. */
export function restDay(def: LeagueDef, season: number): number | undefined {
  if (def.seasonWeeks <= def.rounds.length) return undefined;
  return (season * def.seasonWeeks + def.rounds.length) * DAYS_PER_WEEK + 1 + def.weekday;
}

export type Fate = 'scheduled' | 'postponed' | 'suspended';

/**
 * Lo que se sabe del partido a `nowAbs` y el día en que se juega (o se jugaba). Si a su hora llueve fuerte, se aplaza
 * a la semana de descanso, mismo día y franja ('postponed', se juegue o no aún); si allí también llueve a la hora, o
 * no hay descanso, 'suspended': no cuenta. Hasta la hora de inicio no se sabe nada (sigue 'scheduled'). Puro: weatherAt
 * es función del día y la hora.
 */
export function fateOf(def: LeagueDef, f: Fixture, nowAbs: number): { fate: Fate; day: number } {
  if (nowAbs < startAt(f, f.day) || !rainedOut(f, f.day)) return { fate: 'scheduled', day: f.day };
  const replay = restDay(def, f.season);
  if (replay === undefined) return { fate: 'suspended', day: f.day };
  if (nowAbs >= startAt(f, replay) && rainedOut(f, replay)) return { fate: 'suspended', day: replay };
  return { fate: 'postponed', day: replay };
}

/** Jugado o suspendido: ya no va a cambiar. */
const settled = (def: LeagueDef, f: Fixture, nowAbs: number): boolean => {
  const x = fateOf(def, f, nowAbs);
  return x.fate === 'suspended' || nowAbs >= endAt(f, x.day);
};

/** Temporada del día `day`: bloques de `seasonWeeks` semanas desde el día 1 (temporada 0). */
export function seasonOf(def: LeagueDef, day: number): number {
  return Math.floor(Math.floor((day - 1) / DAYS_PER_WEEK) / def.seasonWeeks);
}

/** Los partidos de la temporada: la jornada r, el día `weekday` de la semana season·seasonWeeks + r. */
export function fixtures(def: LeagueDef, season: number): Fixture[] {
  return def.rounds.flatMap((round, r) => {
    // El día 1 es lunes (weekIndex 0): la semana w empieza el día w·7 + 1.
    const day = (season * def.seasonWeeks + r) * DAYS_PER_WEEK + 1 + def.weekday;
    return round.map(([h, a], m) => ({
      season, round: r, match: m, home: def.teams[h], away: def.teams[a], day,
      startMin: def.slots[m][0] * 60, endMin: def.slots[m][1] * 60,
    }));
  });
}

/** El marcador, sólo si el partido ya ha terminado (en su día o en el aplazado). Depende sólo de la liga y del partido. */
export function resultOf(def: LeagueDef, f: Fixture, nowAbs: number): Result | undefined {
  const x = fateOf(def, f, nowAbs);
  if (x.fate === 'suspended' || nowAbs < endAt(f, x.day)) return undefined;
  const rng = seededRng(hashSeed(def.id, f.season, f.round, f.match));
  const hg = Math.floor(rng() * (def.maxGoals + 1));
  const ag = Math.floor(rng() * (def.maxGoals + 1));
  return { home: f.home, away: f.away, hg, ag };
}

/** La tabla con lo jugado hasta `nowAbs`: 3 por victoria, 1 por empate; desempata pts, dg, gf y el nombre. */
export function standings(def: LeagueDef, season: number, nowAbs: number): Row[] {
  const rows = new Map(def.teams.map((team) => [team, { team, pj: 0, v: 0, e: 0, d: 0, gf: 0, gc: 0, dg: 0, pts: 0 }]));
  const add = (team: string, gf: number, gc: number): void => {
    const r = rows.get(team)!;
    r.pj++;
    r.gf += gf;
    r.gc += gc;
    if (gf > gc) r.v++;
    else if (gf === gc) r.e++;
    else r.d++;
  };
  for (const f of fixtures(def, season)) {
    const res = resultOf(def, f, nowAbs);
    if (!res) continue;
    add(res.home, res.hg, res.ag);
    add(res.away, res.ag, res.hg);
  }
  return [...rows.values()]
    .map((r) => ({ ...r, dg: r.gf - r.gc, pts: 3 * r.v + r.e }))
    .sort((x, y) => y.pts - x.pts || y.dg - x.dg || y.gf - x.gf || x.team.localeCompare(y.team, 'es'));
}

/** El campeón, sólo cuando se han jugado (o suspendido) todos los partidos; sin ninguno jugado, no hay campeón. */
export function champion(def: LeagueDef, season: number, nowAbs: number): string | undefined {
  if (!fixtures(def, season).every((f) => settled(def, f, nowAbs))) return undefined;
  const top = standings(def, season, nowAbs)[0];
  return top.pj ? top.team : undefined;
}

/** Las temporadas cerradas, la más reciente primero (máximo 5). */
export function history(def: LeagueDef, nowAbs: number): { season: number; champion: string }[] {
  const out: { season: number; champion: string }[] = [];
  for (let s = seasonOf(def, dayOf(nowAbs)); s >= 0 && out.length < 5; s--) {
    const c = champion(def, s, nowAbs);
    if (c) out.push({ season: s, champion: c });
  }
  return out;
}

/**
 * Los partidos del próximo día de liga con algo por jugar (la jornada en curso o la siguiente, aunque haya una semana
 * de descanso entre medias, o los aplazados de la semana de descanso). Incluye los que tocaban ese día y la lluvia
 * aplazó o suspendió, para que se lea por qué faltan.
 */
export function nextFixtures(def: LeagueDef, nowAbs: number): Fixture[] {
  const s = seasonOf(def, dayOf(nowAbs));
  const all = [...fixtures(def, s), ...fixtures(def, s + 1)];
  const days = all.filter((f) => !settled(def, f, nowAbs)).map((f) => fateOf(def, f, nowAbs).day);
  if (!days.length) return [];
  const day = Math.min(...days);
  return all.filter((f) => f.day === day || fateOf(def, f, nowAbs).day === day);
}

/** Los partidos ya jugados del último día de liga que tiene alguno, con su marcador. */
export function lastRound(def: LeagueDef, nowAbs: number): { fixture: Fixture; result: Result }[] {
  for (let season = seasonOf(def, dayOf(nowAbs)); season >= 0; season--) {
    const played = fixtures(def, season)
      .map((fixture) => ({ fixture, result: resultOf(def, fixture, nowAbs) }))
      .filter((x): x is { fixture: Fixture; result: Result } => x.result !== undefined);
    if (!played.length) continue;
    const day = Math.max(...played.map((x) => fateOf(def, x.fixture, nowAbs).day));
    return played.filter((x) => fateOf(def, x.fixture, nowAbs).day === day);
  }
  return [];
}
