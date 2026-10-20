// Sin Phaser: lo usan Menus, el móvil, SaveSystem y scripts/check-study.ts.
import { COURSES, GIGS, PRACTICE_SITES, getGig, getSkill, type CourseDef, type GigDef, type PracticeSite, type StudyChoice } from '../data/study.ts';
import { formatDate, weekIndex } from './Calendar.ts';
import { euros } from './Commerce.ts';

/**
 * Aprender una habilidad: matrícula, clases con calendario, práctica en la
 * calle, prueba final y el primer encargo. Funciones puras sobre el progreso
 * guardado (GameStateData.study); quien las usa aplica el resultado al estado
 * (dinero, energía) y adelanta el reloj.
 *
 * Tres cosas separadas, cada una con su uso:
 * - `skills`: conocimiento (0–100). Es la base de la nota de la prueba.
 * - `course.attended`: clases hechas. Sin todas, no hay prueba; las perdidas se recuperan en tutoría.
 * - `unlocks`: lo que se ha abierto. `gig:<id>` ofrece el encargo; el del encargo (data/study.ts `unlock`), un plus en el empleo.
 *
 * Nada se calcula al pasar el tiempo: perder una clase o cruzar el plazo del
 * encargo se ve al mirar (con el reloj de ahora), así que dormir, recargar o
 * saltar días no repite ni cobra nada.
 *
 * Minutos absolutos: (día−1)·1440 + hora·60 + minuto (systems/Handoff.absMinute).
 */

export interface CourseProgress {
  id: string;
  enrolled: number;
  /** Días de cada clase, fijados al matricularse: su identidad. */
  lessons: number[];
  /** Índices de las clases hechas (en su día o en tutoría). */
  attended: number[];
  /** Día del último intento de la prueba (una al día) y el de aprobarla. */
  demoDay?: number;
  passed?: number;
}

export interface GigProgress {
  id: string;
  /** Día en que se aceptó y último día para hacerlo. Sin ellos, está ofrecido. */
  accepted?: number;
  deadline?: number;
  done?: number;
}

export interface StudyState {
  skills: Record<string, number>;
  course: CourseProgress | null;
  /** Prácticas de hoy por sitio: la segunda en el mismo sitio y día rinde la mitad. */
  practice: { day: number; counts: Record<string, number> };
  gig: GigProgress | null;
  unlocks: string[];
}

export const MAX_KNOWLEDGE = 100;
const PRACTICE_MIN_ENERGY = 10;
const SKILL_IDS = new Set(COURSES.map((c) => c.skill));

export const emptyStudy = (): StudyState => ({ skills: {}, course: null, practice: { day: 0, counts: {} }, gig: null, unlocks: [] });

const dayOf = (now: number): number => Math.floor(now / 1440) + 1;
const at = (day: number, hour: number): number => (day - 1) * 1440 + Math.round(hour * 60);
const hh = (hour: number): string => `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;
const when = (day: number, hour: number): string => `${formatDate(day, false)} a las ${hh(hour)}`;

export const knowledge = (s: StudyState, skill: string): number => s.skills[skill] ?? 0;

export function levelName(skill: string, k: number): string {
  return getSkill(skill).levels.filter(([min]) => k >= min).at(-1)![1];
}

/** Con la cámara del centro: desde la matrícula hasta entregar el encargo. */
export const hasCamera = (s: StudyState): boolean => !!s.course && !s.gig?.done;

export const courseAt = (desk: string): CourseDef | undefined => COURSES.find((c) => c.desk === desk);
export const practiceAt = (id: string): PracticeSite | undefined => PRACTICE_SITES.find((p) => p.id === id);
export const gigAt = (site: string): GigDef | undefined => GIGS.find((g) => g.site === site);

// ------------------------------------------------------------- matrícula

/** Los días de clase: los siguientes días del curso tras el de matricularse. */
export function schedule(c: CourseDef, day: number): number[] {
  const out: number[] = [];
  for (let d = day + 1; out.length < c.lessons.length; d++) if (c.days.includes(weekIndex(d))) out.push(d);
  return out;
}

/** Lo que se sabe antes de pagar: precio, calendario, duración, qué da y qué se presta. */
export function courseOffer(c: CourseDef, day: number): string {
  const days = schedule(c, day);
  return `${c.name}. ${euros(c.fee)} todo incluido. ${c.lessons.length} clases de ${c.hours} h a las ${hh(c.start)}: ${days.map((d) => formatDate(d, false)).join(', ')}. ` +
    `Si pierdes una, se recupera en la tutoría del fin de semana a las ${hh(c.recovery.start)}. Al acabar, una prueba: aprobarla da acceso a un encargo pagado de la bolsa del centro. ${c.camera}`;
}

export function enrollBlocker(c: CourseDef, s: StudyState, money: number): string | null {
  if (s.course?.id === c.id) return 'Ya estás matriculado.';
  if (s.course) return 'Ya estás en otro curso.';
  if (money < c.fee) return `Te faltan ${euros(c.fee - money)} para la matrícula (${euros(c.fee)}). Un turno en el Decathlon lo cubre; la plaza sigue aquí.`;
  return null;
}

export function enroll(c: CourseDef, s: StudyState, day: number): StudyState {
  return { ...structuredClone(s), course: { id: c.id, enrolled: day, lessons: schedule(c, day), attended: [] } };
}

// ---------------------------------------------------------------- clases

export type LessonStatus = 'attended' | 'upcoming' | 'open' | 'missed';

export function lessonStatus(c: CourseDef, p: CourseProgress, i: number, now: number): LessonStatus {
  if (p.attended.includes(i)) return 'attended';
  const start = at(p.lessons[i], c.start);
  if (now < start - c.early) return 'upcoming';
  return now <= start + c.grace ? 'open' : 'missed';
}

const missed = (c: CourseDef, p: CourseProgress, now: number): number[] =>
  p.lessons.map((_, i) => i).filter((i) => lessonStatus(c, p, i, now) === 'missed');

/** Tutoría abierta ahora (sólo si hay algo que recuperar). */
function recoveryOpen(c: CourseDef, p: CourseProgress, now: number): boolean {
  const day = dayOf(now);
  if (!c.recovery.days.includes(weekIndex(day)) || !missed(c, p, now).length) return false;
  const start = at(day, c.recovery.start);
  return now >= start - c.early && now <= start + c.grace;
}

export interface Session {
  kind: 'class' | 'recovery';
  lesson: number;
  day: number;
  hour: number;
  hours: number;
}

/** La sesión a la que se puede entrar ahora: la clase del día o, si hay alguna perdida, la tutoría. */
export function sessionNow(c: CourseDef, p: CourseProgress, now: number): Session | null {
  const open = p.lessons.findIndex((_, i) => lessonStatus(c, p, i, now) === 'open');
  if (open >= 0) return { kind: 'class', lesson: open, day: p.lessons[open], hour: c.start, hours: c.hours };
  if (recoveryOpen(c, p, now)) return { kind: 'recovery', lesson: missed(c, p, now)[0], day: dayOf(now), hour: c.recovery.start, hours: c.recovery.hours };
  return null;
}

/** La próxima sesión útil: la siguiente clase o, si hay perdidas, la próxima tutoría (la que antes llegue). */
export function nextSession(c: CourseDef, p: CourseProgress, now: number): Session | null {
  const current = sessionNow(c, p, now);
  if (current) return current;
  const out: Session[] = [];
  const up = p.lessons.findIndex((_, i) => lessonStatus(c, p, i, now) === 'upcoming');
  if (up >= 0) out.push({ kind: 'class', lesson: up, day: p.lessons[up], hour: c.start, hours: c.hours });
  const lost = missed(c, p, now);
  if (lost.length) {
    for (let d = dayOf(now); ; d++) {
      if (c.recovery.days.includes(weekIndex(d)) && at(d, c.recovery.start) + c.grace >= now) {
        out.push({ kind: 'recovery', lesson: lost[0], day: d, hour: c.recovery.start, hours: c.recovery.hours });
        break;
      }
    }
  }
  return out.sort((a, b) => at(a.day, a.hour) - at(b.day, b.hour))[0] ?? null;
}

export const sessionLabel = (c: CourseDef, x: Session): string =>
  `${x.kind === 'class' ? `Clase ${x.lesson + 1} · ${c.lessons[x.lesson].title}` : `Tutoría: recuperar «${c.lessons[x.lesson].title}»`} · ${when(x.day, x.hour)}`;

export function classBlocker(c: CourseDef, s: StudyState, now: number, energy: number): string | null {
  const p = s.course;
  if (!p || p.id !== c.id) return 'Primero, la matrícula.';
  if (p.attended.length === c.lessons.length) return 'Ya has hecho todas las clases.';
  if (!sessionNow(c, p, now)) {
    const next = nextSession(c, p, now);
    return next ? `Ahora no hay clase. Próxima: ${sessionLabel(c, next)}.` : 'Ahora no hay clase.';
  }
  if (energy < c.minEnergy) return `Estás demasiado cansado para atender (mínimo ${c.minEnergy} de energía).`;
  return null;
}

export interface Outcome {
  study: StudyState;
  minutes: number;
  energy: number;
  money: number;
  lines: string[];
}

/** Ir a clase (o a la tutoría): espera a la hora si llegas antes, suma conocimiento y la marca hecha. */
export function attend(c: CourseDef, s: StudyState, now: number): Outcome {
  const x = sessionNow(c, s.course!, now)!;
  const out = structuredClone(s);
  out.course!.attended = [...out.course!.attended, x.lesson].sort((a, b) => a - b);
  const before = knowledge(s, c.skill);
  out.skills[c.skill] = Math.min(MAX_KNOWLEDGE, before + c.gain);
  const end = at(x.day, x.hour) + x.hours * 60;
  const lesson = c.lessons[x.lesson];
  const done = out.course!.attended.length;
  const lines = [
    x.kind === 'recovery' ? `Tutoría con ${c.teacher.split(',')[0]}: recuperas «${lesson.title}».` : `Clase ${x.lesson + 1}: ${lesson.title}.`,
    ...lesson.lines,
    `${getSkill(c.skill).name}: ${before} → ${out.skills[c.skill]}. Clases hechas: ${done} de ${c.lessons.length}.`,
    done === c.lessons.length ? `Ya puedes hacer la prueba final (${hh(c.demo.hours[0])}–${hh(c.demo.hours[1])}, una al día).` : '',
  ].filter(Boolean);
  return { study: out, minutes: end - now, energy: c.energy, money: 0, lines };
}

// --------------------------------------------------------------- práctica

/** Conocimiento de practicar aquí ahora (antes de la decisión): la mitad por cada vez que ya lo hiciste hoy. */
export function practiceGain(site: PracticeSite, s: StudyState, day: number, extra = 0): number {
  const n = s.practice.day === day ? s.practice.counts[site.id] ?? 0 : 0;
  return Math.max(0, Math.round((site.gain + extra) / 2 ** n));
}

export function practiceBlocker(site: PracticeSite, s: StudyState, now: number, energy: number): string | null {
  if (!hasCamera(s)) return s.gig?.done ? 'Ya devolviste la cámara del centro.' : 'Sin cámara. El centro de estudios presta una al matricularte en el curso de fotografía.';
  const hour = (now % 1440) / 60;
  if (hour < site.hours[0] || hour >= site.hours[1]) return `Sin luz para practicar aquí: de ${hh(site.hours[0])} a ${hh(site.hours[1])}.`;
  if (energy < PRACTICE_MIN_ENERGY) return `Estás demasiado cansado (mínimo ${PRACTICE_MIN_ENERGY} de energía).`;
  return null;
}

export function practice(site: PracticeSite, s: StudyState, choice: StudyChoice, now: number): Outcome {
  const day = dayOf(now);
  const gain = practiceGain(site, s, day, choice.points);
  const out = structuredClone(s);
  if (out.practice.day !== day) out.practice = { day, counts: {} };
  out.practice.counts[site.id] = (out.practice.counts[site.id] ?? 0) + 1;
  const before = knowledge(s, site.skill);
  out.skills[site.skill] = Math.min(MAX_KNOWLEDGE, before + gain);
  const repeat = out.practice.counts[site.id] > 1 ? ' Repetir aquí hoy rinde menos: prueba otro sitio u otro día.' : '';
  return {
    study: out,
    minutes: site.minutes + (choice.minutes ?? 0),
    energy: site.energy + (choice.energy ?? 0),
    money: 0,
    lines: [choice.line, `${getSkill(site.skill).name}: ${before} → ${out.skills[site.skill]}.${repeat}`],
  };
}

// ----------------------------------------------------------------- prueba

export function demoBlocker(c: CourseDef, s: StudyState, now: number, energy: number): string | null {
  const p = s.course;
  if (!p || p.id !== c.id) return 'Primero, la matrícula.';
  if (p.passed) return 'Prueba aprobada.';
  const left = c.lessons.length - p.attended.length;
  if (left) return `Te ${left === 1 ? 'falta 1 clase' : `faltan ${left} clases`} para la prueba. Las perdidas se recuperan en la tutoría.`;
  if (p.demoDay === dayOf(now)) return 'Hoy ya hiciste la prueba. Puedes repetirla mañana.';
  const hour = (now % 1440) / 60;
  if (hour < c.demo.hours[0] || hour >= c.demo.hours[1]) return `La prueba se hace de ${hh(c.demo.hours[0])} a ${hh(c.demo.hours[1])}.`;
  if (energy < c.minEnergy) return `Estás demasiado cansado (mínimo ${c.minEnergy} de energía).`;
  return null;
}

/** Nota = conocimiento + decisiones. Determinista: lo mismo da lo mismo, y recargar no vuelve a tirar nada. */
export function demo(c: CourseDef, s: StudyState, picks: readonly number[], now: number): Outcome & { passed: boolean; score: number } {
  const k = knowledge(s, c.skill);
  const chosen = c.demo.steps.map((step, i) => step.choices[picks[i]]);
  const points = chosen.reduce((sum, ch) => sum + ch.points, 0);
  const score = k + points;
  const passed = score >= c.demo.pass;
  const out = structuredClone(s);
  out.course!.demoDay = dayOf(now);
  const best = (i: number): number => Math.max(...c.demo.steps[i].choices.map((x) => x.points));
  const weak = c.demo.steps.filter((_, i) => chosen[i].points < best(i)).map((step) => step.hint);
  const lines = chosen.map((ch) => ch.line);
  lines.push(`Nota: ${score} (conocimiento ${k} + decisiones ${points}). Se aprueba con ${c.demo.pass}.`);
  if (passed) {
    out.course!.passed = dayOf(now);
    out.unlocks = [...new Set([...out.unlocks, `gig:${c.gig}`])];
    const gig = getGig(c.gig);
    if (!out.gig) out.gig = { id: gig.id };
    lines.push(`Aprobado. ${c.teacher.split(',')[0]} te pasa un encargo de la bolsa del centro: ${gig.client}, ${euros(gig.pay)}. Lo aceptas en la ventanilla.`);
  } else {
    const tips = [`Te faltan ${c.demo.pass - score} puntos.`];
    if (weak.length) tips.push(`Repasa ${weak.length > 1 ? `${weak.slice(0, -1).join(', ')} y ${weak.at(-1)}` : weak[0]}.`);
    tips.push('Cada práctica en la calle suma conocimiento (la primera del día en cada sitio, entera). Puedes repetir la prueba mañana.');
    lines.push(tips.join(' '));
  }
  return { study: out, minutes: c.demo.minutes, energy: c.demo.energy, money: 0, lines, passed, score };
}

// ---------------------------------------------------------------- encargo

export type GigStatus = 'locked' | 'offered' | 'active' | 'expired' | 'done';

export function gigStatus(g: GigDef, s: StudyState, now: number): GigStatus {
  if (!s.unlocks.includes(`gig:${g.id}`) || s.gig?.id !== g.id) return 'locked';
  const p = s.gig;
  if (p.done) return 'done';
  if (p.deadline === undefined) return 'offered';
  return now >= at(p.deadline, g.hours[1]) ? 'expired' : 'active';
}

/** Destinatario, lugar, plazo, paga y condiciones: todo visible antes de aceptar. */
export function gigTerms(g: GigDef, day: number): string {
  return `${g.client}. ${g.brief} Dónde: ${g.place}. Plazo: hasta el ${when(day + g.days, g.hours[1])} (se empieza entre las ${hh(g.hours[0])} y las ${hh(g.hours[1])}). ` +
    `Paga: ${euros(g.pay)}, más propina si queda muy bien. Necesitas la cámara del centro y algo de energía (${g.minEnergy}).`;
}

/** Aceptar (o volver a pedirlo tras dejar pasar el plazo): el plazo cuenta desde hoy. */
export function acceptGig(g: GigDef, s: StudyState, day: number): StudyState {
  const out = structuredClone(s);
  out.gig = { id: g.id, accepted: day, deadline: day + g.days };
  return out;
}

export function deliverBlocker(g: GigDef, s: StudyState, now: number, energy: number): string | null {
  const status = gigStatus(g, s, now);
  if (status === 'done') return 'Encargo entregado.';
  if (status === 'expired') return 'Se pasó el plazo. En la ventanilla del centro puedes pedir otro.';
  if (status !== 'active') return 'Primero acepta el encargo en el centro de estudios.';
  if (!hasCamera(s)) return 'Sin cámara.';
  const hour = (now % 1440) / 60;
  if (hour < g.hours[0] || hour >= g.hours[1]) return `Se hace entre las ${hh(g.hours[0])} y las ${hh(g.hours[1])}, con el horno abierto.`;
  if (energy < g.minEnergy) return `Estás demasiado cansado (mínimo ${g.minEnergy} de energía).`;
  return null;
}

/** Entregar: cobra una vez (el encargo queda hecho), devuelve la cámara y abre lo siguiente. */
export function deliver(g: GigDef, s: StudyState, choice: StudyChoice, now: number): Outcome {
  const out = structuredClone(s);
  out.gig = { ...out.gig!, done: dayOf(now) };
  out.unlocks = [...new Set([...out.unlocks, g.unlock])];
  const tip = choice.points;
  const lines = [choice.line, `${g.client.split(',')[0]} te paga ${euros(g.pay)}${tip ? ` y ${euros(tip)} de propina` : ''}. Devuelves la cámara del centro.`, g.follow];
  return { study: out, minutes: g.minutes + (choice.minutes ?? 0), energy: g.energy + (choice.energy ?? 0), money: g.pay + tip, lines };
}

export const gigDeadline = (g: GigDef, p: GigProgress): string => (p.deadline === undefined ? '' : when(p.deadline, g.hours[1]));

// ----------------------------------------------------------------- guardado

export function parseStudy(v: unknown): StudyState {
  if (typeof v !== 'object' || v === null) return emptyStudy();
  const o = v as Record<string, unknown>;
  const int = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);
  const rec = (x: unknown): Record<string, unknown> => (typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {});
  const s = emptyStudy();
  for (const [k, n] of Object.entries(rec(o.skills))) {
    if (typeof n === 'number' && Number.isFinite(n) && SKILL_IDS.has(k)) s.skills[k] = Math.max(0, Math.min(MAX_KNOWLEDGE, n));
  }
  const c = rec(o.course);
  const def = COURSES.find((x) => x.id === c.id);
  const lessons = Array.isArray(c.lessons) ? c.lessons.filter(int) : [];
  if (def && int(c.enrolled) && lessons.length === def.lessons.length) {
    const attended = Array.isArray(c.attended) ? [...new Set(c.attended.filter((i): i is number => int(i) && i >= 0 && i < lessons.length))].sort((a, b) => a - b) : [];
    s.course = { id: def.id, enrolled: c.enrolled, lessons, attended, ...(int(c.demoDay) ? { demoDay: c.demoDay } : {}), ...(int(c.passed) ? { passed: c.passed } : {}) };
  }
  const p = rec(o.practice);
  if (int(p.day)) {
    s.practice.day = p.day;
    for (const [k, n] of Object.entries(rec(p.counts))) if (int(n) && n > 0) s.practice.counts[k] = n;
  }
  if (Array.isArray(o.unlocks)) s.unlocks = [...new Set(o.unlocks.filter((u): u is string => typeof u === 'string'))];
  const g = rec(o.gig);
  if (GIGS.some((x) => x.id === g.id)) {
    s.gig = { id: g.id as string };
    if (int(g.accepted) && int(g.deadline)) Object.assign(s.gig, { accepted: g.accepted, deadline: g.deadline });
    if (int(g.done)) s.gig.done = g.done;
  }
  return s;
}
