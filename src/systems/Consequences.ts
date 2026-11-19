// Sin Phaser: lo usan main.ts, GameState, SaveSystem, Opportunities y scripts/check-consequences.ts.
import {
  ARCHIVE_AFTER_DAYS, CHANNELS, COVERAGE_DAYS, EXPIRE_DAYS, INCOME_MISSED, MAX_ACTIVE, MAX_ARCHIVED,
  NOTICE_COOLDOWN_DAYS, NOTICE_TEXT, REGISTER_WINDOW,
} from '../data/consequences.ts';
import { getNpc } from '../data/npcs.ts';
import type { JobProgress } from './Jobs.ts';
import type { StoryState } from './Story.ts';
import { total, unpaid, type HouseholdState, type Obligation } from './Household.ts';
import { formatDateShort } from './Calendar.ts';
import { euros } from './Commerce.ts';

/**
 * SIM-01 · Lo que el mundo recuerda de lo que hiciste: un registro de consecuencias con su origen, referencias a lo
 * que el sistema propietario YA aplicó (la falta en Jobs, la reputación en Reputation, la confianza en Story/Social)
 * y efectos diferidos (un aviso, comprobar si llegas a las facturas, caducar). Nunca copia ni cambia dinero, faltas,
 * rachas, reputación ni confianza: la resolución se LEE del propietario. Lo nuevo son avisos y oportunidades.
 *
 * Reloj: state.day y el minuto absoluto (día−1)·1440 + h·60 + m. Los diferidos corren cuando dueDay ≤ hoy, una vez
 * (sirven saltos de 30 h o días dormidos). Ids deterministas: registrar dos veces el mismo id no hace nada.
 */

export type ConsequenceKind = 'shift-missed' | 'shift-late' | 'dismissal' | 'planton';
export type ConsequenceSystem = 'jobs' | 'reputation' | 'opportunities' | 'social' | 'story' | 'household' | 'phone';
export type ConsequenceStatus = 'active' | 'repairing' | 'resolved' | 'expired' | 'archived';
export type DeferredKind = 'notice' | 'check-coverage' | 'expire';

export interface ConsequenceOrigin {
  kind: ConsequenceKind;
  /** jobId o npcId. */
  ref: string;
  day: number;
}

export interface ImmediateEffect {
  system: ConsequenceSystem;
  /** Referencia a lo que el propietario ya aplicó ('strike', 'missed:<job>:<día>', 'trust'…). */
  ref: string;
  applied: true;
}

export interface DeferredEffect {
  id: string;
  kind: DeferredKind;
  dueDay: number;
  done: boolean;
  doneDay?: number;
}

export interface Consequence {
  consequenceId: string;
  origin: ConsequenceOrigin;
  /** Minuto absoluto en que se registró. */
  timestamp: number;
  affectedSystems: ConsequenceSystem[];
  immediateEffects: ImmediateEffect[];
  deferredEffects: DeferredEffect[];
  status: Exclude<ConsequenceStatus, 'archived'>;
  resolvedDay?: number;
}

/** Compactada: sólo lo que hace falta para no volver a registrarla y para el historial. */
export interface ArchivedConsequence {
  consequenceId: string;
  origin: ConsequenceOrigin;
  status: 'archived';
  resolvedDay?: number;
}

export type ConsequenceRecord = Consequence | ArchivedConsequence;

export interface ConsequenceState {
  items: ConsequenceRecord[];
  /** Último día con aviso (0: nunca). */
  lastNoticeDay: number;
}

export interface ConsequenceInput {
  job: JobProgress | null;
  stories: StoryState;
  household: HouseholdState;
  money: number;
  /** Por qué no se puede pedir el micropréstamo (Credit.creditBlocker); null = se puede; sin dato, no se menciona. */
  creditBlocker?: string | null;
}

export interface ConsequenceNotice {
  channel: { title: string; app: 'money' | 'today' };
  text: string;
}

const KINDS: readonly ConsequenceKind[] = ['shift-missed', 'shift-late', 'dismissal', 'planton'];
const SYSTEMS: readonly ConsequenceSystem[] = ['jobs', 'reputation', 'opportunities', 'social', 'story', 'household', 'phone'];
const STATUSES: readonly ConsequenceStatus[] = ['active', 'repairing', 'resolved', 'expired', 'archived'];
const DEFERRED: readonly DeferredKind[] = ['notice', 'check-coverage', 'expire'];

export const emptyConsequences = (): ConsequenceState => ({ items: [], lastNoticeDay: 0 });

export const isLive = (c: ConsequenceRecord): c is Consequence => c.status === 'active' || c.status === 'repairing';
/** Resuelta o caducada, aún sin archivar. Guard propio: `!isLive(c)` estrecharía a ArchivedConsequence. */
const isClosed = (c: ConsequenceRecord): c is Consequence => c.status === 'resolved' || c.status === 'expired';

const byId = (a: ConsequenceRecord, b: ConsequenceRecord): number => (a.consequenceId < b.consequenceId ? -1 : a.consequenceId > b.consequenceId ? 1 : 0);
const cents = (n: number): number => Math.round(n * 100) / 100;

// ------------------------------------------------------------ lecturas de los propietarios

/** Lo que vence en COVERAGE_DAYS (o ya venció) sin pagar, frente a la cartera. */
export function coverage(h: HouseholdState, money: number, today: number): { due: number; missing: number; first: Obligation | null } {
  const list = unpaid(h).filter((o) => o.due <= today + COVERAGE_DAYS);
  const due = cents(list.reduce((s, o) => s + total(o), 0));
  return { due, missing: cents(Math.max(0, due - money)), first: list[0] ?? null };
}

const missedIn = (job: JobProgress, from: number, to: number): number =>
  Object.entries(job.shifts).filter(([d, r]) => r.result === 'missed' && Number(d) >= from && Number(d) <= to).length;

/** Dos turnos buenos seguidos (registrados, sin uno malo entre medias) después de `day`. */
function twoGoodAfter(job: JobProgress, day: number): boolean {
  const after = Object.entries(job.shifts).map(([d, r]) => ({ d: Number(d), r })).filter((x) => x.d > day).sort((a, b) => a.d - b.d);
  let run = 0;
  for (const { r } of after) {
    run = r.result === 'done' && r.score >= 1 ? run + 1 : 0;
    if (run >= 2) return true;
  }
  return false;
}

const sameJob = (job: JobProgress | null, ref: string): job is JobProgress => !!job && job.job === ref;

/** ¿Ya está resuelta, según su propietario? */
function resolvedNow(c: Consequence, input: ConsequenceInput, today: number): boolean {
  const { kind, ref, day } = c.origin;
  const job = input.job;
  if (kind === 'shift-late') return sameJob(job, ref) && Object.entries(job.shifts).some(([d, r]) => Number(d) > day && r.result === 'done');
  if (kind === 'shift-missed') return sameJob(job, ref) && job.status === 'active' && (twoGoodAfter(job, day) || job.streak >= 2);
  if (kind === 'dismissal') return coverage(input.household, input.money, today).missing === 0 || (!!job && job.status === 'active' && job.from > day);
  const flag = input.stories[ref]?.flags[`${ref}_reconciled`];
  return flag !== undefined && flag >= day;
}

const apologized = (c: Consequence, input: ConsequenceInput): boolean => {
  const flag = input.stories[c.origin.ref]?.flags[`${c.origin.ref}_apologized`];
  return c.origin.kind === 'planton' && flag !== undefined && flag >= c.origin.day;
};

// ------------------------------------------------------------ registro

function build(kind: ConsequenceKind, ref: string, day: number, nowAbs: number, income: boolean): Consequence {
  const id = `${kind}:${ref}:${day}`;
  const expire: DeferredEffect = { id: 'expire', kind: 'expire', dueDay: day + EXPIRE_DAYS[kind], done: false };
  const notice: DeferredEffect = { id: 'notice', kind: 'notice', dueDay: day, done: false };
  const check: DeferredEffect = { id: 'check-coverage', kind: 'check-coverage', dueDay: day, done: false };
  const base = { consequenceId: id, origin: { kind, ref, day }, timestamp: nowAbs, status: 'active' as const };
  if (kind === 'shift-missed') {
    return {
      ...base,
      affectedSystems: ['jobs', 'reputation', 'opportunities', 'phone', ...(income ? ['household' as const] : [])],
      immediateEffects: [{ system: 'jobs', ref: 'strike', applied: true }, { system: 'reputation', ref: `missed:${ref}:${day}`, applied: true }],
      deferredEffects: income ? [notice, check, expire] : [notice, expire],
    };
  }
  if (kind === 'shift-late') {
    return { ...base, affectedSystems: ['jobs', 'opportunities', 'phone'], immediateEffects: [{ system: 'jobs', ref: `pay:${day}`, applied: true }], deferredEffects: [notice, expire] };
  }
  if (kind === 'dismissal') {
    return { ...base, affectedSystems: ['jobs', 'household', 'opportunities', 'phone'], immediateEffects: [{ system: 'jobs', ref: `dismissals:${ref}`, applied: true }], deferredEffects: [check, expire] };
  }
  return {
    ...base,
    affectedSystems: ['social', 'story', 'opportunities', 'phone'],
    immediateEffects: [{ system: 'social', ref: 'trust', applied: true }, { system: 'story', ref: 'event:planton', applied: true }],
    deferredEffects: [notice, expire],
  };
}

/** Añade la consecuencia si su id no está (activa, cerrada o archivada): idempotente. */
export function register(state: ConsequenceState, c: Consequence): ConsequenceState {
  if (state.items.some((x) => x.consequenceId === c.consequenceId)) return state;
  return { ...state, items: [...state.items, c].sort(byId) };
}

/** Los hechos de ahora en la ventana REGISTER_WINDOW, leídos de su propietario. */
function facts(input: ConsequenceInput, today: number, nowAbs: number): Consequence[] {
  const out: Consequence[] = [];
  const recent = (day: number): boolean => day <= today && today - day <= REGISTER_WINDOW;
  const job = input.job;
  if (job) {
    for (const [k, r] of Object.entries(job.shifts)) {
      const day = Number(k);
      if (!Number.isInteger(day) || !recent(day)) continue;
      if (r.result === 'missed') out.push(build('shift-missed', job.job, day, nowAbs, missedIn(job, day - 6, day) >= INCOME_MISSED));
      else if (r.result === 'late') out.push(build('shift-late', job.job, day, nowAbs, false));
    }
    if (job.status === 'fired' && job.ended !== undefined && recent(job.ended)) out.push(build('dismissal', job.job, job.ended, nowAbs, true));
  }
  for (const npc of Object.keys(input.stories).sort()) {
    for (const e of input.stories[npc].events) if (e.id === 'planton' && recent(e.day)) out.push(build('planton', npc, e.day, nowAbs, false));
  }
  return out;
}

// ------------------------------------------------------------ avisos

function noticeFor(c: Consequence): ConsequenceNotice {
  if (c.origin.kind === 'planton') return { channel: CHANNELS.planton, text: NOTICE_TEXT.planton.replace('{persona}', getNpc(c.origin.ref).name) };
  return { channel: CHANNELS.work, text: NOTICE_TEXT.work };
}

function moneyNotice(input: ConsequenceInput, today: number): ConsequenceNotice | null {
  const cov = coverage(input.household, input.money, today);
  if (cov.missing <= 0 || !cov.first) return null;
  // cov.first es lo que antes vence (unpaid ordena por vencimiento): si ya pasó, se dice que venció.
  const template = cov.first.due < today ? NOTICE_TEXT.moneyOverdue : NOTICE_TEXT.money;
  const text = template.replace('{falta}', euros(cov.missing)).replace('{gasto}', euros(cov.due)).replace('{fecha}', formatDateShort(cov.first.due));
  const loan = input.creditBlocker === null ? ` ${NOTICE_TEXT.moneyLoan}` : '';
  const advice = input.job?.status === 'active' ? NOTICE_TEXT.moneyAdvice : NOTICE_TEXT.moneyAdviceNoJob;
  return { channel: CHANNELS.money, text: `${text} ${advice}${loan}` };
}

// ------------------------------------------------------------ poda

const compact = (c: ConsequenceRecord): ArchivedConsequence =>
  ({ consequenceId: c.consequenceId, origin: { ...c.origin }, status: 'archived', ...(c.resolvedDay !== undefined ? { resolvedDay: c.resolvedDay } : {}) });

const older = (a: ConsequenceRecord, b: ConsequenceRecord): number => a.origin.day - b.origin.day || byId(a, b);

/** Topes: nunca se toca una activa; sobran cerradas → se archivan las más antiguas; sobran archivadas → fuera las más antiguas. */
function prune(items: ConsequenceRecord[]): ConsequenceRecord[] {
  let list = items.slice();
  const open = list.filter((c) => c.status !== 'archived');
  if (open.length > MAX_ACTIVE) {
    const closed = open.filter(isClosed).sort(older).slice(0, open.length - MAX_ACTIVE);
    const ids = new Set(closed.map((c) => c.consequenceId));
    list = list.map((c) => (ids.has(c.consequenceId) ? compact(c) : c));
  }
  const archived = list.filter((c) => c.status === 'archived').sort(older);
  if (archived.length > MAX_ARCHIVED) {
    // ponytail: un archivado descartado dentro de REGISTER_WINDOW podría registrarse otra vez; sólo pasa con >MAX_ACTIVE cerradas en 3 días.
    const drop = new Set(archived.slice(0, archived.length - MAX_ARCHIVED).map((c) => c.consequenceId));
    list = list.filter((c) => !drop.has(c.consequenceId));
  }
  return list.sort(byId);
}

// ------------------------------------------------------------ reconciliar

/**
 * Pura y determinista: (1) registra los hechos nuevos de la ventana; (2) pasa a reparando o resuelta leyendo a los
 * propietarios; (3) corre los diferidos vencidos (done se marca aquí: quien llama guarda ANTES de avisar); (4) archiva
 * y poda. Los avisos salen agrupados por canal; con el cooldown global, los que no tocan esperan (siguen pendientes).
 */
export function reconcile(source: ConsequenceState, input: ConsequenceInput, today: number, nowAbs: number): { state: ConsequenceState; notices: ConsequenceNotice[]; changed: boolean } {
  let state: ConsequenceState = structuredClone(source);
  for (const c of facts(input, today, nowAbs)) state = register(state, c);

  for (const c of state.items) {
    if (!isLive(c)) continue;
    if (resolvedNow(c, input, today)) {
      c.status = 'resolved';
      c.resolvedDay = today;
    } else if (c.status === 'active' && apologized(c, input)) c.status = 'repairing';
  }

  const canNotify = state.lastNoticeDay === 0 || today - state.lastNoticeDay >= NOTICE_COOLDOWN_DAYS;
  const raw: ConsequenceNotice[] = [];
  // El aviso de dinero sólo depende de la entrada y de hoy: una vez por pasada, y sólo si hace falta (undefined = sin calcular).
  let money: ConsequenceNotice | null | undefined;
  for (const c of state.items) {
    if (c.status === 'archived') continue;
    const due = c.deferredEffects.filter((d) => !d.done && d.dueDay <= today);
    // Caducar va primero: lo que caduca en este mismo repaso ya no avisa.
    for (const d of [...due.filter((x) => x.kind === 'expire'), ...due.filter((x) => x.kind !== 'expire')]) {
      if (d.kind === 'expire') {
        if (isLive(c)) {
          c.status = 'expired';
          c.resolvedDay = d.dueDay;
        }
        d.done = true;
        d.doneDay = today;
        continue;
      }
      const job = c.origin.kind === 'shift-missed' || c.origin.kind === 'shift-late';
      const pointless = !isLive(c) || (job && d.kind === 'notice' && !(input.job?.status === 'active' && input.job.job === c.origin.ref));
      const notice = pointless ? null : d.kind === 'notice' ? noticeFor(c) : (money === undefined ? (money = moneyNotice(input, today)) : money);
      if (notice && !canNotify) continue; // espera al cooldown
      d.done = true;
      d.doneDay = today;
      if (notice) raw.push(notice);
    }
  }
  if (raw.length) state.lastNoticeDay = today;

  state.items = prune(state.items.map((c) => (isClosed(c) && c.resolvedDay !== undefined && today - c.resolvedDay >= ARCHIVE_AFTER_DAYS ? compact(c) : c)));

  // Un aviso por canal: los del mismo repaso, juntos.
  const notices: ConsequenceNotice[] = [];
  for (const n of raw) {
    const same = notices.find((x) => x.channel.title === n.channel.title);
    if (!same) notices.push({ channel: n.channel, text: n.text });
    else if (!same.text.includes(n.text)) same.text = `${same.text} ${n.text}`;
  }
  return { state, notices, changed: JSON.stringify(state) !== JSON.stringify(source) };
}

// ------------------------------------------------------------ lectores (data/opportunities.ts)

export type ConsequenceCond = 'work' | 'planton' | 'income';

/** ¿Hay una consecuencia viva de ese tipo? 'work' sólo cuenta para el contrato activo; 'income', si no llegas a las facturas. */
export function holdsConsequence(state: ConsequenceState | undefined, cond: ConsequenceCond, input: Pick<ConsequenceInput, 'job' | 'household' | 'money'>, today: number): boolean {
  const live = (state?.items ?? []).filter(isLive);
  if (cond === 'work') {
    const job = input.job;
    return !!job && job.status === 'active' && live.some((c) => (c.origin.kind === 'shift-missed' || c.origin.kind === 'shift-late') && c.origin.ref === job.job);
  }
  if (cond === 'planton') return live.some((c) => c.origin.kind === 'planton');
  return live.some((c) => c.affectedSystems.includes('household')) && coverage(input.household, input.money, today).missing > 0;
}

/** El npc del plantón vivo más reciente (para {persona}). */
export function plantonRef(state: ConsequenceState | undefined): string | undefined {
  return (state?.items ?? []).filter((c): c is Consequence => isLive(c) && c.origin.kind === 'planton').sort((a, b) => b.origin.day - a.origin.day || byId(a, b))[0]?.origin.ref;
}

// ------------------------------------------------------------ guardado

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const int = (v: unknown): v is number => fin(v) && Number.isInteger(v);

function parseOrigin(v: unknown): ConsequenceOrigin | null {
  if (!isRecord(v) || !KINDS.includes(v.kind as ConsequenceKind) || typeof v.ref !== 'string' || !v.ref || !int(v.day) || v.day < 1) return null;
  return { kind: v.kind as ConsequenceKind, ref: v.ref, day: v.day };
}

function parseItem(v: unknown): ConsequenceRecord | null {
  if (!isRecord(v) || typeof v.consequenceId !== 'string' || !v.consequenceId || v.consequenceId.length > 80) return null;
  const origin = parseOrigin(v.origin);
  const status = v.status as ConsequenceStatus;
  if (!origin || !STATUSES.includes(status)) return null;
  const resolved = fin(v.resolvedDay) ? { resolvedDay: v.resolvedDay } : {};
  if (status === 'archived') return { consequenceId: v.consequenceId, origin, status, ...resolved };
  if (!fin(v.timestamp)) return null;
  const affected = Array.isArray(v.affectedSystems) ? v.affectedSystems.filter((s): s is ConsequenceSystem => SYSTEMS.includes(s as ConsequenceSystem)) : [];
  const immediate = Array.isArray(v.immediateEffects)
    ? v.immediateEffects.flatMap((e): ImmediateEffect[] => (isRecord(e) && SYSTEMS.includes(e.system as ConsequenceSystem) && typeof e.ref === 'string' ? [{ system: e.system as ConsequenceSystem, ref: e.ref, applied: true }] : []))
    : [];
  const deferred = Array.isArray(v.deferredEffects)
    ? v.deferredEffects.flatMap((d): DeferredEffect[] => (isRecord(d) && typeof d.id === 'string' && DEFERRED.includes(d.kind as DeferredKind) && fin(d.dueDay) && typeof d.done === 'boolean'
      ? [{ id: d.id, kind: d.kind as DeferredKind, dueDay: d.dueDay, done: d.done, ...(fin(d.doneDay) ? { doneDay: d.doneDay } : {}) }]
      : []))
    : [];
  return { consequenceId: v.consequenceId, origin, timestamp: v.timestamp, affectedSystems: affected, immediateEffects: immediate, deferredEffects: deferred, status, ...resolved };
}

/** Lo guardado, validado: basura → vacío; ítems rotos fuera; ids repetidos, el primero; recortado a los topes. */
export function parseConsequences(v: unknown): ConsequenceState {
  if (!isRecord(v)) return emptyConsequences();
  const seen = new Set<string>();
  const items: ConsequenceRecord[] = [];
  for (const raw of Array.isArray(v.items) ? v.items : []) {
    const c = parseItem(raw);
    if (!c || seen.has(c.consequenceId)) continue;
    seen.add(c.consequenceId);
    items.push(c);
  }
  return { items: prune(items), lastNoticeDay: int(v.lastNoticeDay) && v.lastNoticeDay >= 0 ? v.lastNoticeDay : 0 };
}
