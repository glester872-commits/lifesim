// Sin Phaser: lo usan GameState y scripts/check-diario.ts.
/**
 * VID-11 · Diario de vida: lo que ya pasó y se confirmó (contrato firmado, proyecto cumplido, quedada cerrada).
 * Todo puro: entra estado, sale estado. Cada entrada lleva un id determinista: la misma acción no se apunta dos veces.
 */

import { formatDate, formatDateShort } from './Calendar.ts';
import type { JobProgress } from './Jobs.ts';
import { projectCatalog, type LifeProjectsState } from './LifeProjects.ts';
import type { EventOutcome, SocialEventsState } from './SocialEvents.ts';

export type DiaryType = 'job-hired' | 'project-done' | 'gathering';

export interface DiaryEntry {
  id: string;
  type: DiaryType;
  /** Minuto absoluto de juego en que pasó. */
  at: number;
  /** Orden de llegada: desempata dos entradas del mismo minuto. */
  seq: number;
  title: string;
  /** Ids de NPC implicados. */
  npcs: string[];
  /** Id del lugar (location o parada). */
  place?: string;
  data?: Record<string, string | number>;
}

export interface Diary {
  v: 1;
  entries: DiaryEntry[];
  /** Último seq repartido. */
  seq: number;
}

export type NewDiaryEntry = Omit<DiaryEntry, 'seq'>;

export const DIARY_MAX = 100;
const TYPES: readonly DiaryType[] = ['job-hired', 'project-done', 'gathering'];

export const emptyDiary = (): Diary => ({ v: 1, entries: [], seq: 0 });

export const jobEntryId = (jobId: string, from: number): string => `empleo:${jobId}:${from}`;
export const projectEntryId = (id: string): string => `proyecto:${id}`;
export const gatheringEntryId = (eventId: string): string => `quedada:${eventId}`;

/** Más reciente primero; en el mismo minuto, la última apuntada. No toca `d`. */
export const sortedEntries = (d: Diary): DiaryEntry[] => [...d.entries].sort((a, b) => b.at - a.at || b.seq - a.seq);

/** Apunta una entrada. Con un id ya apuntado devuelve el mismo objeto. Pasado DIARY_MAX, se van las más antiguas. */
export function addEntry(d: Diary, e: NewDiaryEntry): Diary {
  if (d.entries.some((x) => x.id === e.id)) return d;
  const seq = d.seq + 1;
  const entries = [...d.entries, { ...structuredClone(e), seq }];
  return { v: 1, entries: entries.length > DIARY_MAX ? sortedEntries({ v: 1, entries, seq }).slice(0, DIARY_MAX) : entries, seq };
}

export const addEntries = (d: Diary, list: readonly NewDiaryEntry[]): Diary => list.reduce(addEntry, d);

export interface JobInfo { employer: string; title: string; place?: string }

/**
 * Firma de contrato: `after` activo y `before` no era ese mismo contrato activo. Un ascenso, un repaso de turnos o
 * el mismo estado no apuntan nada. `info` da empresa y puesto (data/jobs); sin él, no se apunta.
 */
export function diaryFromJobChange(before: JobProgress | null, after: JobProgress | null, at: number, info: (jobId: string) => JobInfo | undefined): NewDiaryEntry | null {
  if (!after || after.status !== 'active') return null;
  if (before?.status === 'active' && before.job === after.job) return null;
  const i = info(after.job);
  if (!i) return null;
  return {
    id: jobEntryId(after.job, after.from), type: 'job-hired', at,
    title: `Firmaste contrato en ${i.employer}: ${i.title}`,
    npcs: [], ...(i.place ? { place: i.place } : {}),
    data: { job: after.job, employer: i.employer, title: i.title, from: after.from },
  };
}

/** Proyectos que en `after` están completados y en `before` no. */
export function diaryFromProjects(before: LifeProjectsState | undefined, after: LifeProjectsState, at: number): NewDiaryEntry[] {
  const out: NewDiaryEntry[] = [];
  for (const p of after.items) {
    if (p.status !== 'completed' || before?.items.find((x) => x.id === p.id)?.status === 'completed') continue;
    const info = projectCatalog[p.type];
    out.push({
      id: projectEntryId(p.id), type: 'project-done', at: p.completedAt ?? at,
      title: `Proyecto cumplido: ${info.title}`,
      npcs: [], ...(info.place ? { place: info.place } : {}),
      data: { project: p.id, kind: p.type },
    });
  }
  return out;
}

const OUTCOME: Record<Exclude<EventOutcome, '' | 'cancelada'>, string> = { bien: 'salió bien', flojo: 'fue floja', 'plantón': 'no apareciste' };

/** Quedadas que en `after` se cierran (no canceladas) y en `before` no estaban cerradas. */
export function diaryFromGatherings(before: SocialEventsState | undefined, after: SocialEventsState, nameOf: (npc: string) => string): NewDiaryEntry[] {
  const out: NewDiaryEntry[] = [];
  for (const ev of after.events) {
    if (ev.status !== 'closed' || ev.outcome === '' || ev.outcome === 'cancelada') continue;
    if (before?.events.find((x) => x.id === ev.id)?.status === 'closed') continue;
    const came = ev.invited.filter((i) => i.status === 'accepted' && i.attendance !== 'absent').map((i) => i.npc);
    const who = came.length ? `con ${came.map(nameOf).join(' y ')}` : 'sin invitados';
    out.push({
      id: gatheringEntryId(ev.id), type: 'gathering', at: ev.end,
      title: `Quedada en casa ${who}: ${OUTCOME[ev.outcome]}`,
      npcs: came, place: ev.venueId,
      data: { outcome: ev.outcome, presence: ev.playerPresence },
    });
  }
  return out;
}

// ------------------------------------------------------------ vista (ui/Phone): texto puro, sin tocar estado

export const DIARY_TYPE_LABEL: Readonly<Record<DiaryType, string>> = { 'job-hired': 'Trabajo', 'project-done': 'Proyecto', gathering: 'Quedada' };
export const GONE_NPC = 'alguien que ya no está en el barrio';
export const GONE_PLACE = 'un lugar que ya no figura en el mapa';

/** Día de calendario (1…) y «HH:MM» desde el minuto absoluto. */
const dayOfAt = (at: number): number => Math.floor(at / 1440) + 1;
const clockOf = (at: number): string => {
  const m = ((Math.floor(at) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Una fila de la lista: «lun 3 mar · 19:30» y el título. */
export const diaryRow = (e: DiaryEntry): { when: string; title: string } => ({ when: `${formatDateShort(dayOfAt(e.at))} · ${clockOf(e.at)}`, title: e.title });

/** Resuelven ids a nombres; `undefined` (o una excepción) si ya no existe. */
export interface DiaryResolvers { npc(id: string): string | undefined; place(id: string): string | undefined }

const safe = (f: (id: string) => string | undefined, id: string): string | undefined => {
  try { return f(id); } catch { return undefined; }
};

const PRESENCE: Readonly<Partial<Record<string, string>>> = { 'on-time': 'Llegaste a tiempo', late: 'Llegaste tarde', absent: 'No estuviste' };

export interface DiaryDetail { date: string; time: string; type: string; title: string; people: string[]; place?: string; facts: string[] }

/** El detalle: fecha completa, tipo, quién y dónde (resueltos; lo que falte, en neutro) y los datos que importan. */
export function diaryDetail(e: DiaryEntry, r: DiaryResolvers): DiaryDetail {
  const facts: string[] = [];
  const d = e.data ?? {};
  if (e.type === 'job-hired') {
    if (typeof d.employer === 'string') facts.push(`Empresa: ${d.employer}`);
    if (typeof d.title === 'string') facts.push(`Puesto: ${d.title}`);
  } else if (e.type === 'gathering') {
    const o = OUTCOME[d.outcome as keyof typeof OUTCOME];
    if (o) facts.push(`La quedada ${o}`);
    const p = PRESENCE[String(d.presence)];
    if (p) facts.push(p);
  }
  return {
    date: formatDate(dayOfAt(e.at)), time: clockOf(e.at), type: DIARY_TYPE_LABEL[e.type] ?? 'Recuerdo', title: e.title,
    people: e.npcs.map((n) => safe(r.npc, n) ?? GONE_NPC),
    ...(e.place ? { place: safe(r.place, e.place) ?? GONE_PLACE } : {}),
    facts,
  };
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Tolerante: lo que no se entiende se descarta; basura entera → diario vacío. */
export function parseDiary(v: unknown): Diary {
  if (!isRec(v) || !Array.isArray(v.entries)) return emptyDiary();
  const seen = new Set<string>();
  const entries: DiaryEntry[] = [];
  let max = 0;
  for (const e of v.entries) {
    if (!isRec(e) || typeof e.id !== 'string' || seen.has(e.id) || !TYPES.includes(e.type as DiaryType)) continue;
    if (typeof e.at !== 'number' || !Number.isFinite(e.at) || typeof e.title !== 'string') continue;
    seen.add(e.id);
    const seq = typeof e.seq === 'number' && Number.isFinite(e.seq) ? e.seq : 0;
    max = Math.max(max, seq);
    const data: Record<string, string | number> = {};
    if (isRec(e.data)) for (const [k, x] of Object.entries(e.data)) if (typeof x === 'string' || (typeof x === 'number' && Number.isFinite(x))) data[k] = x;
    entries.push({
      id: e.id, type: e.type as DiaryType, at: e.at, seq, title: e.title,
      npcs: Array.isArray(e.npcs) ? e.npcs.filter((n): n is string => typeof n === 'string') : [],
      ...(typeof e.place === 'string' ? { place: e.place } : {}),
      ...(Object.keys(data).length ? { data } : {}),
    });
  }
  const seq = typeof v.seq === 'number' && Number.isFinite(v.seq) ? Math.max(v.seq, max) : max;
  const d: Diary = { v: 1, entries, seq };
  return entries.length > DIARY_MAX ? { ...d, entries: sortedEntries(d).slice(0, DIARY_MAX) } : d;
}
