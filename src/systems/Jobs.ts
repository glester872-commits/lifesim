// Sin Phaser: lo usan Menus, el móvil, SaveSystem y scripts/check-jobs.ts.
import { getJob, JOBS, type JobChoice, type JobDef, type JobLevel, type JobSituation } from '../data/jobs.ts';
import { WEEKDAY_LABEL, weekdayOf, weekIndex } from './Calendar.ts';
import { euros } from './Commerce.ts';

/**
 * Un empleo con contrato: horario, asistencia, cobro, ascenso. Todo son
 * funciones puras sobre el progreso guardado (GameStateData.job); quien las
 * usa aplica el resultado al estado y adelanta el reloj.
 *
 * Un turno es el del día en que empieza (su identidad: empleo + día). Se cobra
 * una vez: su registro en `shifts` lo cierra. Las faltas se cuentan al repasar
 * el calendario (`settle`) hasta `checked`, así que repasar dos veces, recargar
 * o saltar varios días no las cuenta de nuevo.
 *
 * Minutos absolutos: (día−1)·1440 + hora·60 + minuto (systems/Handoff.absMinute).
 */

export type ShiftResult = 'done' | 'late' | 'missed';

export interface ShiftRecord {
  result: ShiftResult;
  /** Rendimiento: asistencia (+1 puntual) más la decisión (−1 … +1). Una falta es −2. */
  score: number;
  pay: number;
}

export interface JobProgress {
  job: string;
  status: 'active' | 'quit' | 'fired';
  level: number;
  /** Día desde el que cuentan los turnos del nivel actual (el siguiente al de firmar o ascender). */
  from: number;
  /** Último día repasado: sus faltas ya están contadas. */
  checked: number;
  /** Turnos buenos desde que entraste en el nivel (o rechazaste el ascenso). */
  good: number;
  /** Faltas sin recuperar. */
  strikes: number;
  /** Turnos buenos seguidos desde la última falta o retraso. */
  streak: number;
  /** Día en que se cerró el contrato (dejarlo o despido). */
  ended?: number;
  /** día → cómo fue el turno. Sólo los últimos días: lo anterior ya está repasado. */
  shifts: Record<string, ShiftRecord>;
}

export type ShiftStatus = 'none' | 'upcoming' | 'open' | ShiftResult;

const KEEP = 21;
/** Días sin poder volver a firmar tras un despido. */
export const REHIRE_DAYS = 7;

const at = (day: number, hour: number): number => (day - 1) * 1440 + hour * 60;
const hh = (h: number): string => `${String(h).padStart(2, '0')}:00`;
export const dayOf = (now: number): number => Math.floor(now / 1440) + 1;

export const levelOf = (p: JobProgress): JobLevel => getJob(p.job).levels[p.level];

/** ¿Tiene turno ese día con su nivel actual? */
export function scheduled(p: JobProgress, day: number): boolean {
  return p.status === 'active' && day >= p.from && levelOf(p).days.includes(weekIndex(day));
}

/** Cuándo se puede fichar ese día: desde `open`; puntual hasta start+grace; tarde hasta `close`; sale a `end`. */
function window(def: JobDef, lvl: JobLevel, day: number): { open: number; start: number; close: number; end: number } {
  const start = at(day, lvl.start);
  return { open: start - def.early, start, close: start + def.late, end: start + lvl.hours * 60 };
}

export function statusOf(p: JobProgress, day: number, now: number): ShiftStatus {
  const rec = p.shifts[day];
  if (rec) return rec.result;
  if (!scheduled(p, day)) return 'none';
  const w = window(getJob(p.job), levelOf(p), day);
  if (now >= w.close) return 'missed';
  return now >= w.open ? 'open' : 'upcoming';
}

/** El próximo turno por hacer (hoy si aún se llega), o null sin contrato. */
export function nextShift(p: JobProgress, now: number): { day: number; status: ShiftStatus } | null {
  if (p.status !== 'active') return null;
  const first = Math.max(dayOf(now), p.from);
  for (let d = first; d < first + 8; d++) {
    const s = statusOf(p, d, now);
    if (s === 'open' || s === 'upcoming') return { day: d, status: s };
  }
  return null;
}

/** Contrato nuevo: los turnos empiezan mañana, para que dé tiempo a llegar. */
export function hire(job: JobDef, today: number): JobProgress {
  return { job: job.id, status: 'active', level: 0, from: today + 1, checked: today, good: 0, strikes: 0, streak: 0, shifts: {} };
}

/** Por qué no se puede firmar ahora la oferta de ese empleo, o null. */
export function hireBlocker(job: JobDef, p: JobProgress | null, today: number): string | null {
  if (p?.job === job.id && p.status === 'active') return 'Ya trabajas aquí.';
  if (p?.status === 'active') return 'Ya tienes otro contrato.';
  const back = (p?.ended ?? 0) + REHIRE_DAYS;
  if (p?.job === job.id && p.status === 'fired' && today < back) return `Después del despido, no te vuelven a contratar hasta el ${WEEKDAY_LABEL[weekdayOf(back)]}.`;
  return null;
}

/**
 * Repasa el calendario hasta ahora: cada turno programado cuyo margen para
 * llegar ya pasó sin fichar es una falta (una vez). Con `maxStrikes` faltas, despido.
 */
export function settle(p: JobProgress, now: number): { progress: JobProgress; missed: number[]; fired: boolean } {
  if (p.status !== 'active') return { progress: p, missed: [], fired: false };
  const def = getJob(p.job);
  const out: JobProgress = structuredClone(p);
  const missed: number[] = [];
  for (let d = out.checked + 1; window(def, levelOf(out), d).close <= now; d++) {
    out.checked = d;
    if (!scheduled(out, d) || out.shifts[d]) continue;
    out.shifts[d] = { result: 'missed', score: -2, pay: 0 };
    out.strikes += 1;
    out.streak = 0;
    missed.push(d);
    if (out.strikes >= def.maxStrikes) {
      out.status = 'fired';
      out.ended = d;
      break;
    }
  }
  prune(out);
  return { progress: out, missed, fired: out.status === 'fired' };
}

/** Por qué no se puede fichar ahora, o null. `p` ya repasado. */
export function clockInBlocker(p: JobProgress, now: number, energy: number): string | null {
  if (p.status !== 'active') return 'No tienes contrato.';
  const def = getJob(p.job);
  const today = dayOf(now);
  const s = statusOf(p, today, now);
  const next = nextShift(p, now);
  const nextText = next && next.day !== today ? ` El siguiente: ${WEEKDAY_LABEL[weekdayOf(next.day)]} a las ${hh(levelOf(p).start)}.` : '';
  if (s === 'none') return `Hoy no tienes turno.${nextText}`;
  if (s === 'done' || s === 'late') return `El turno de hoy ya está hecho.${nextText}`;
  if (s === 'missed') return `Ya no llegas: el turno de hoy cuenta como falta.${nextText}`;
  if (s === 'upcoming') return `Entras a las ${hh(levelOf(p).start)}; se ficha desde una hora antes.`;
  if (energy < def.minEnergy) return 'Estás demasiado cansado para aguantar el turno: come algo o descansa antes.';
  return null;
}

/** La situación del turno de ese día: fija para ese turno, aunque se cancele y se vuelva. */
export function situationFor(p: JobProgress, day: number): JobSituation {
  const list = getJob(p.job).situations;
  return list[(day * 7 + p.level * 3) % list.length];
}

export interface ShiftOutcome {
  progress: JobProgress;
  /** Minutos que pasan: la espera si llegas antes, más lo que queda de turno. */
  minutes: number;
  money: number;
  energy: number;
  lines: string[];
  late: boolean;
}

/**
 * Hacer el turno de hoy con la decisión tomada. Llegar antes espera a la hora;
 * llegar tarde (pasado el margen) cobra sólo lo trabajado, sale a la misma hora
 * y no cuenta como turno bueno. No toca el estado: devuelve el resultado.
 */
export function work(p: JobProgress, now: number, choice: JobChoice): ShiftOutcome {
  const def = getJob(p.job);
  const lvl = levelOf(p);
  const today = dayOf(now);
  const w = window(def, lvl, today);
  const lateBy = Math.max(0, now - w.start);
  const late = lateBy > def.grace;
  const worked = lvl.hours * 60 - (late ? lateBy : 0);
  const share = worked / (lvl.hours * 60);
  const pay = Math.round((lvl.wage * share + (choice.bonus ?? 0)) * 100) / 100;
  const score = (late ? 0 : 1) + choice.score;
  const good = !late && score >= 1;

  const out: JobProgress = structuredClone(p);
  out.shifts[today] = { result: late ? 'late' : 'done', score, pay };
  out.good += good ? 1 : 0;
  out.streak = good ? out.streak + 1 : 0;
  // Dos turnos buenos seguidos perdonan una falta: un tropiezo no cierra el camino.
  if (out.strikes > 0 && out.streak >= 2) {
    out.strikes -= 1;
    out.streak = 0;
  }
  prune(out);

  const lines = [choice.line];
  if (late) lines.push(`Llegas ${lateBy} min tarde. Marta lo apunta y te paga lo trabajado: ${euros(pay)}.`);
  else lines.push(`${now < w.start ? `Esperas en la sala de descanso hasta las ${hh(lvl.start)}. ` : ''}Turno cerrado: te pagan ${euros(pay)}.`);
  if (!good && !late) lines.push('Marta no dice nada, pero no lo cuenta como un buen turno.');
  if (out.strikes < p.strikes) lines.push('Marta te da una palmada: «Así sí. Lo del otro día, olvidado».');
  return { progress: out, minutes: w.end - now, money: pay, energy: Math.round(lvl.energy * share) + (choice.energy ?? 0), lines, late };
}

/** ¿Toca proponerle el siguiente nivel? */
export function promotionReady(p: JobProgress): JobLevel | null {
  const def = getJob(p.job);
  if (p.status !== 'active' || p.strikes > 0 || p.good < def.promoteAfter) return null;
  return def.levels[p.level + 1] ?? null;
}

/** Aceptar el ascenso: nivel nuevo con sus días desde mañana. */
export function promote(p: JobProgress, today: number): JobProgress {
  return { ...structuredClone(p), level: p.level + 1, from: today + 1, good: 0, streak: 0 };
}

/** Rechazarlo: se vuelve a proponer tras otros tantos turnos buenos. */
export const decline = (p: JobProgress): JobProgress => ({ ...structuredClone(p), good: 0 });

export const quit = (p: JobProgress, today: number): JobProgress => ({ ...structuredClone(p), status: 'quit', ended: today });

/** Horario y pago de un nivel. */
export function levelSummary(lvl: JobLevel): string {
  const days = lvl.days.map((d) => WEEKDAY_LABEL[weekdayOf(d + 1)]).join(', ');
  return `${lvl.title}: ${days} de ${hh(lvl.start)} a ${hh(lvl.start + lvl.hours)} · ${euros(lvl.wage)} por turno.`;
}

/** La oferta entera, para leerla antes de firmar. */
export function offerText(job: JobDef): string {
  return `${levelSummary(job.levels[0])} Empiezas mañana. Requisitos: fichar desde una hora antes de la hora y no más de ${job.late} min tarde, con energía de al menos ${job.minEnergy}. Más de ${job.grace} min tarde se paga lo trabajado; no venir es una falta (con ${job.maxStrikes} sin recuperar, a la calle). Con ${job.promoteAfter} buenos turnos, ${job.manager.split(',')[0]} habla de ascensos.`;
}

function prune(p: JobProgress): void {
  for (const k of Object.keys(p.shifts)) if (Number(k) < p.checked - KEEP) delete p.shifts[k];
}

// ------------------------------------------------------------ guardado

/** Lo guardado, validado; cualquier cosa rara es «sin contrato» (una partida antigua no lo tiene). */
export function parseJob(v: unknown): JobProgress | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const int = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);
  const def = JOBS.find((j) => j.id === o.job);
  if (!def || !int(o.level) || o.level < 0 || o.level >= def.levels.length) return null;
  if (o.status !== 'active' && o.status !== 'quit' && o.status !== 'fired') return null;
  if (!int(o.from) || !int(o.checked) || !int(o.good) || !int(o.strikes) || !int(o.streak)) return null;
  const shifts: Record<string, ShiftRecord> = {};
  if (typeof o.shifts === 'object' && o.shifts !== null) {
    for (const [k, r] of Object.entries(o.shifts as Record<string, unknown>)) {
      const s = r as Record<string, unknown> | null;
      if (!int(Number(k)) || !s || !['done', 'late', 'missed'].includes(s.result as string) || typeof s.score !== 'number' || typeof s.pay !== 'number') continue;
      shifts[k] = { result: s.result as ShiftResult, score: s.score, pay: s.pay };
    }
  }
  return {
    job: def.id, status: o.status, level: o.level, from: o.from, checked: o.checked,
    good: Math.max(0, o.good), strikes: Math.max(0, o.strikes), streak: Math.max(0, o.streak),
    ...(int(o.ended) ? { ended: o.ended } : {}), shifts,
  };
}
