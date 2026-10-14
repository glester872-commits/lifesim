// Sin Phaser: el reloj del partido del Arena. Lo leen la calle, los bares, el metro, la basura, la venta ambulante,
// las zonas y los scripts de comprobación. Puro: misma semilla, mismo partido, se cargue o no el barrio.
import { ARENA_CLUB, ARENA_MATCHES, MATCH_PHASES, type MatchPhase } from '../data/cityEvents.ts';
import { weekIndex } from './Calendar.ts';
import { hashSeed, seededRng } from './MetroDaily.ts';

export type { MatchPhase } from '../data/cityEvents.ts';

export interface MatchClock {
  day: number;
  hour: number;
  minute: number;
}

export interface Match {
  day: number;
  /** Minuto del día del saque. */
  kickoff: number;
  rival: string;
}

/** El partido de ese día en el Estadio del Halcón, si lo hay. Misma semilla, mismo partido. */
export function matchOn(day: number): Match | null {
  const s = ARENA_MATCHES;
  const chance = s.days[weekIndex(day)] ?? 0;
  const rng = seededRng(hashSeed('arena-match', day));
  if (rng() >= chance) return null;
  const kickoff = s.kickoffs[Math.floor(rng() * s.kickoffs.length)];
  return { day, kickoff, rival: ARENA_CLUB.rivals[Math.floor(rng() * ARENA_CLUB.rivals.length)] };
}

/** Fase del partido a esa hora (o null). Un saque a las 21:00 sigue con bares llenos pasada la medianoche. */
export function matchPhase(c: MatchClock): MatchPhase | null {
  return matchNow(c)?.phase ?? null;
}

/** El partido que manda ahora y en qué fase está: el de hoy o, de madrugada, el de ayer. */
export function matchNow(c: MatchClock): (Match & { phase: MatchPhase }) | null {
  const t = c.hour * 60 + c.minute;
  for (const [day, at] of [[c.day, t], [c.day - 1, t + 1440]] as const) {
    const m = matchOn(day);
    if (!m) continue;
    const since = at - m.kickoff;
    const phase = MATCH_PHASES.find((p) => since >= ARENA_MATCHES.phases[p][0] && since < ARENA_MATCHES.phases[p][1]);
    if (phase) return { ...m, phase };
  }
  return null;
}

/** Lo que dice una tabla por fase ahora mismo; fuera de partido (o sin entrada para la fase), `rest`. */
export function byPhase(table: Partial<Record<MatchPhase, number>> | undefined, c: MatchClock, rest = 0): number {
  if (!table) return rest;
  const phase = matchPhase(c);
  return phase ? (table[phase] ?? rest) : rest;
}

/** Niveles de más en el andén de esa parada (data/transit.ts STOPS) por el partido. */
export const matchMetroShift = (stopId: string | undefined, c: MatchClock): number =>
  stopId ? byPhase(ARENA_MATCHES.metro[stopId], c) : 0;

/** Cuánta basura de más en un sitio de ese barrio (1 = la de siempre). */
export const matchLitter = (district: string | undefined, c: MatchClock): number =>
  district === ARENA_MATCHES.district ? byPhase(ARENA_MATCHES.litter, c, 1) : 1;

/** Los partidos de los próximos `days` días desde `fromDay` (el teléfono, el inspector y las pruebas). */
export function upcomingMatches(fromDay: number, days: number): Match[] {
  const out: Match[] = [];
  for (let d = fromDay; d < fromDay + days; d++) {
    const m = matchOn(d);
    if (m) out.push(m);
  }
  return out;
}

export const kickoffLabel = (m: number): string => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
