// Sin Phaser: lo usan systems/Boards (el tablón de Campo Alto) y scripts/check-league.ts.
import type { LeagueDef } from '../data/campoAltoLeague.ts';
import { DAYS_PER_WEEK } from './Calendar.ts';
import { hashSeed, seededRng } from './MetroDaily.ts';

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

const endAbs = (f: Fixture): number => (f.day - 1) * 1440 + f.endMin;
const dayOf = (nowAbs: number): number => Math.floor(nowAbs / 1440) + 1;

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

/** El marcador, sólo si el partido ya ha terminado. Depende únicamente de la liga y de qué partido es. */
export function resultOf(def: LeagueDef, f: Fixture, nowAbs: number): Result | undefined {
  if (nowAbs < endAbs(f)) return undefined;
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

/** El campeón, sólo cuando se ha jugado el último partido de la temporada. */
export function champion(def: LeagueDef, season: number, nowAbs: number): string | undefined {
  const all = fixtures(def, season);
  const last = all.reduce((a, b) => (endAbs(b) > endAbs(a) ? b : a));
  return resultOf(def, last, nowAbs) ? standings(def, season, nowAbs)[0].team : undefined;
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

/** Los partidos de la jornada en curso o, si no hay, de la siguiente (aunque haya una semana de descanso entre medias). */
export function nextFixtures(def: LeagueDef, nowAbs: number): Fixture[] {
  const s = seasonOf(def, dayOf(nowAbs));
  for (const season of [s, s + 1]) {
    const all = fixtures(def, season);
    for (let r = 0; r < def.rounds.length; r++) {
      const round = all.filter((f) => f.round === r);
      if (round.some((f) => nowAbs < endAbs(f))) return round;
    }
  }
  return [];
}

/** Los partidos ya jugados de la última jornada que tiene alguno, con su marcador. */
export function lastRound(def: LeagueDef, nowAbs: number): { fixture: Fixture; result: Result }[] {
  for (let season = seasonOf(def, dayOf(nowAbs)); season >= 0; season--) {
    const all = fixtures(def, season);
    for (let r = def.rounds.length - 1; r >= 0; r--) {
      const played = all
        .filter((f) => f.round === r)
        .map((fixture) => ({ fixture, result: resultOf(def, fixture, nowAbs) }))
        .filter((x): x is { fixture: Fixture; result: Result } => x.result !== undefined);
      if (played.length) return played;
    }
  }
  return [];
}
