/**
 * Sucesos de la ciudad que pasan en barrios sin mapa todavía. Los que tienen mapa ya tienen su sistema
 * (pop-ups en data/popups.ts, artistas y manteros en data/streetActs.ts, peleas en data/streetEvents.ts);
 * systems/World.ts los junta todos por barrio. Esto sólo añade lo que no tiene dónde vivir aún.
 *
 * Un partido del Arena no se ve, pero se nota: la megafonía del metro avisa antes y después
 * (systems/MetroSystem, ANNOUNCEMENTS.match). Cuando el Arena tenga mapa, el mismo horario lo llena.
 */

export interface MatchSchedule {
  district: string;
  name: string;
  /** Días de la semana con partido posible (0 lunes … 6 domingo) y la probabilidad de cada uno. */
  days: Readonly<Record<number, number>>;
  /** Horas de saque posibles (minuto del día); sale una por semilla. */
  kickoffs: readonly number[];
  /** Minutos de partido, con el descanso. */
  length: number;
  /** Desde cuántos minutos antes llega la gente y hasta cuántos después se va. */
  before: number;
  after: number;
}

export const ARENA_MATCHES: MatchSchedule = {
  district: 'arena',
  name: 'Partido en el Arena',
  // Fin de semana casi siempre; algún miércoles, de copa.
  days: { 2: 0.35, 5: 0.75, 6: 0.6 },
  kickoffs: [16 * 60, 18 * 60 + 30, 21 * 60],
  length: 110,
  before: 120,
  after: 60,
};
