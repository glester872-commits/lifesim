// Sin Phaser: lo usan scenes/Menus (inscribirse y seguir), scenes/WorldScene (el combate del cuadro y el resultado) y
// systems/Fitness (se guarda con la forma física), y lo prueba scripts/check-sparring.ts.
import { weekIndex } from './Calendar.ts';
import type { Style } from './Sparring.ts';

/**
 * Torneos de academia: uno por disciplina, un día a la semana en su sala. Cuadro de cuatro: semifinal y final, cada una
 * un combate de verdad (systems/Sparring). Inscribirse cuesta una vez; se pasa de fase sólo ganando, y lo ganado se paga
 * una vez. Un torneo al día por disciplina: perder no se arregla repitiendo.
 */

export interface Opponent {
  name: string;
  /** Nivel del rival (systems/Sparring, 0–1). */
  level: number;
  /** Aspecto (data/npcs.ts UNIFORM_LOOKS o gente). */
  look: string;
}

export interface TournamentDef {
  style: Style;
  name: string;
  /** Sala donde se pelea (LocationDef.id). */
  location: string;
  /** Día de la semana (0 lunes … 6 domingo) y hora de la primera ronda; la inscripción abre una hora antes y cierra dos después. */
  weekday: number;
  hour: number;
  fee: number;
  prizes: { champion: number; runnerUp: number };
  /** Técnica mínima de su disciplina (Fitness.skills) para inscribirse: no se entra el primer día. */
  minSkill: number;
  /** El rival de semifinal y el de la final (el campeón del otro lado). */
  semi: Opponent;
  final: Opponent;
}

export const TOURNAMENTS: Readonly<Record<Style, TournamentDef>> = {
  taekwondo: {
    style: 'taekwondo', name: 'Open de Taekwondo Vallesco', location: 'academy-tkd', weekday: 5, hour: 11, fee: 10,
    prizes: { champion: 40, runnerUp: 15 }, minSkill: 2,
    semi: { name: 'Irene · cinturón verde', level: 0.35, look: 'dobok-verde' },
    final: { name: 'Óscar · cinturón azul', level: 0.6, look: 'dobok-azul' },
  },
  boxing: {
    style: 'boxing', name: 'Torneo Doble Guardia', location: 'boxing', weekday: 6, hour: 11, fee: 10,
    prizes: { champion: 40, runnerUp: 15 }, minSkill: 2,
    semi: { name: 'Raúl «el Rápido»', level: 0.35, look: 'uniforme-gym' },
    final: { name: 'Nadia Torres', level: 0.6, look: 'uniforme-noche' },
  },
};

export const WEEKDAY_NAME = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const;

export type Stage = 'semi' | 'final' | 'out' | 'runner-up' | 'champion';

export interface Entry {
  /** Día del torneo en que se inscribió. */
  day: number;
  stage: Stage;
}

/** Historial de combates de una disciplina (práctica y torneo). */
export interface FightRecord {
  bouts: number;
  wins: number;
  titles: number;
}

export const NO_RECORD: FightRecord = { bouts: 0, wins: 0, titles: 0 };

const DONE: ReadonlySet<Stage> = new Set(['out', 'runner-up', 'champion']);

/** Si hoy y a esta hora se puede inscribir (o seguir): el día del torneo, de una hora antes a dos después. */
export function isOpen(def: TournamentDef, day: number, minuteOfDay: number): boolean {
  return weekIndex(day) === def.weekday && minuteOfDay >= (def.hour - 1) * 60 && minuteOfDay < (def.hour + 2) * 60;
}

export const when = (def: TournamentDef): string => `los ${WEEKDAY_NAME[def.weekday]} a las ${String(def.hour).padStart(2, '0')}:00`;

/** El rival que toca en la fase de ahora, o null si ya no hay combate. */
export const rivalFor = (def: TournamentDef, e: Entry | undefined): Opponent | null => (e?.stage === 'semi' ? def.semi : e?.stage === 'final' ? def.final : null);

/** Lo que se puede hacer hoy con el torneo: inscribirse, seguir con el combate que toca, o por qué no. */
export function status(def: TournamentDef, e: Entry | undefined, day: number, minuteOfDay: number, skill: number): { can: 'register' | 'fight' | null; reason: string } {
  const today = e?.day === day ? e : undefined;
  if (today && DONE.has(today.stage)) return { can: null, reason: today.stage === 'champion' ? 'Hoy has ganado el torneo.' : today.stage === 'runner-up' ? 'Hoy has quedado segundo.' : 'Hoy ya has caído; la semana que viene.' };
  if (!isOpen(def, day, minuteOfDay)) return { can: null, reason: `Es ${when(def)}; la inscripción abre una hora antes.` };
  if (today) return { can: 'fight', reason: today.stage === 'semi' ? `Semifinal contra ${def.semi.name}.` : `Final contra ${def.final.name}.` };
  if (skill < def.minSkill) return { can: null, reason: `Hace falta técnica ${def.minSkill} para inscribirse (tienes ${skill.toFixed(1)}).` };
  return { can: 'register', reason: `Inscripción €${def.fee}. Semifinal contra ${def.semi.name}.` };
}

/** Inscribirse: una vez por torneo y con dinero. */
export function register(def: TournamentDef, e: Entry | undefined, money: number, day: number, minuteOfDay: number, skill: number): { ok: true; money: number; entry: Entry } | { ok: false; message: string } {
  const s = status(def, e, day, minuteOfDay, skill);
  if (s.can !== 'register') return { ok: false, message: s.can === 'fight' ? 'Ya estás inscrito.' : s.reason };
  if (money < def.fee) return { ok: false, message: `La inscripción cuesta €${def.fee}; no te llega.` };
  return { ok: true, money: Math.round((money - def.fee) * 100) / 100, entry: { day, stage: 'semi' } };
}

/**
 * Lo que deja un combate del cuadro: la fase siguiente (ganando se pasa, perdiendo se cae), el premio si se acaba en el
 * podio (una vez: sólo al pasar a una fase final) y el historial. Un combate sobre una fase ya cerrada no cambia nada.
 */
export function afterBout(def: TournamentDef, e: Entry, won: boolean, r: FightRecord): { entry: Entry; prize: number; record: FightRecord; text: string } {
  if (DONE.has(e.stage)) return { entry: e, prize: 0, record: r, text: '' };
  const record = { bouts: r.bouts + 1, wins: r.wins + (won ? 1 : 0), titles: r.titles + (won && e.stage === 'final' ? 1 : 0) };
  if (e.stage === 'semi') {
    return won
      ? { entry: { ...e, stage: 'final' }, prize: 0, record, text: `Pasas a la final contra ${def.final.name}. Habla con quien da las clases cuando estés listo.` }
      : { entry: { ...e, stage: 'out' }, prize: 0, record, text: 'Fuera en semifinales. La semana que viene, otra.' };
  }
  return won
    ? { entry: { ...e, stage: 'champion' }, prize: def.prizes.champion, record, text: `¡Campeón del ${def.name}! Premio: €${def.prizes.champion}.` }
    : { entry: { ...e, stage: 'runner-up' }, prize: def.prizes.runnerUp, record, text: `Subcampeón del ${def.name}. Premio: €${def.prizes.runnerUp}.` };
}

const STAGES: readonly Stage[] = ['semi', 'final', 'out', 'runner-up', 'champion'];
const int = (v: unknown, lo: number, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : lo);

/** Lee lo guardado (Fitness.tournaments): lo mal formado se descarta, nunca rompe la carga. */
export function parseEntries(v: unknown): Partial<Record<Style, Entry>> | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const out: Partial<Record<Style, Entry>> = {};
  for (const style of ['taekwondo', 'boxing'] as const) {
    const e = (v as Record<string, unknown>)[style] as Record<string, unknown> | undefined;
    if (e && typeof e === 'object' && STAGES.includes(e.stage as Stage)) out[style] = { day: int(e.day, 0, Number.MAX_SAFE_INTEGER), stage: e.stage as Stage };
  }
  return Object.keys(out).length ? out : undefined;
}

/** Lee el historial guardado (Fitness.fights). */
export function parseRecords(v: unknown): Partial<Record<Style, FightRecord>> | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const out: Partial<Record<Style, FightRecord>> = {};
  for (const style of ['taekwondo', 'boxing'] as const) {
    const r = (v as Record<string, unknown>)[style] as Record<string, unknown> | undefined;
    if (r && typeof r === 'object') out[style] = { bouts: int(r.bouts, 0, 1e6), wins: int(r.wins, 0, 1e6), titles: int(r.titles, 0, 1e6) };
  }
  return Object.keys(out).length ? out : undefined;
}
