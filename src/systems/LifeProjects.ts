// Sin Phaser: lo usan GameState, SaveSystem y scripts/check-life-projects.ts.
/**
 * VID-01 · Proyectos de vida (F1: modelo y guardado). Un proyecto tiene hitos con id `${projectId}:${clave}` (dos
 * proyectos nunca comparten hitos) y guarda los movementId del ledger que lo hicieron avanzar (originEventIds).
 * El progreso se DERIVA de dinero, inventario y nivel (deriveProgress); `progress` guardado es sólo una caché.
 * Todas las funciones son puras e idempotentes: repetir una llamada con los mismos datos no cambia nada.
 */

import { getCatalog } from '../data/catalogs.ts';
import { getItem } from '../data/items.ts';
import { getJob } from '../data/jobs.ts';
import { euros, type Wallet } from './Commerce.ts';
import { promotionChecks, type JobProgress, type PromotionCheck } from './Jobs.ts';
import { saveNote, type PhoneState } from './Phone.ts';
import { hoursLabel, placeInfo } from './Places.ts';

export type LifeProjectType = 'buy-bike' | 'promotion';
export type LifeProjectStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export interface Milestone {
  id: string;
  done: boolean;
  at: number | null;
}

export interface LifeProjectRequirements {
  cost?: number;
  item?: string;
  shopCatalog?: string;
  fromLevel?: number;
}

export interface LifeProject {
  id: string;
  type: LifeProjectType;
  status: LifeProjectStatus;
  requirements: LifeProjectRequirements;
  milestones: Milestone[];
  progress: number;
  startedAt: number;
  /** Cuándo se cerró: completado o abandonado. */
  completedAt: number | null;
  originEventIds: string[];
}

export interface LifeProjectsState {
  v: 1;
  items: LifeProject[];
}

export interface ProjectResult {
  ok: boolean;
  state: LifeProjectsState;
  message: string;
}

export interface ProgressFacts {
  money: number;
  hasItem: (id: string) => boolean;
  jobLevel?: number;
}

export interface DerivedProgress {
  ratio: number;
  nextStep: string;
  blockers: string[];
}

const TYPES: readonly LifeProjectType[] = ['buy-bike', 'promotion'];
const STATUSES: readonly LifeProjectStatus[] = ['active', 'paused', 'completed', 'cancelled'];
/** Claves de hito por tipo, en orden; 'done' siempre la última. */
export const MILESTONE_KEYS: Record<LifeProjectType, readonly string[]> = {
  'buy-bike': ['saved', 'bought', 'done'],
  promotion: ['promoted', 'done'],
};
const LABEL: Record<LifeProjectType, string> = { 'buy-bike': 'Comprar una bici', promotion: 'Conseguir un ascenso' };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const live = (p: LifeProject): boolean => p.status === 'active' || p.status === 'paused';
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export const milestoneId = (projectId: string, key: string): string => `${projectId}:${key}`;
export const emptyLifeProjects = (): LifeProjectsState => ({ v: 1, items: [] });

function replace(s: LifeProjectsState, p: LifeProject): LifeProjectsState {
  return { v: 1, items: s.items.map((x) => (x.id === p.id ? p : x)) };
}

function withOrigin(ids: string[], originEventId?: string): string[] {
  return originEventId === undefined || ids.includes(originEventId) ? ids : [...ids, originEventId];
}

function parseRequirements(v: unknown): LifeProjectRequirements {
  if (!isRecord(v)) return {};
  return {
    ...(fin(v.cost) && v.cost >= 0 ? { cost: v.cost } : {}),
    ...(typeof v.item === 'string' ? { item: v.item } : {}),
    ...(typeof v.shopCatalog === 'string' ? { shopCatalog: v.shopCatalog } : {}),
    ...(Number.isInteger(v.fromLevel) && (v.fromLevel as number) >= 0 ? { fromLevel: v.fromLevel as number } : {}),
  };
}

function parseProject(v: unknown): LifeProject | null {
  if (!isRecord(v) || typeof v.id !== 'string' || v.id === '') return null;
  const type = v.type as LifeProjectType;
  const status = v.status as LifeProjectStatus;
  if (!TYPES.includes(type) || !STATUSES.includes(status) || !fin(v.startedAt) || v.startedAt < 0) return null;
  const id = v.id;
  // Los hitos se rehacen desde el tipo: los ids siempre llevan el prefijo del proyecto y nunca sobra ni falta uno.
  const raw = Array.isArray(v.milestones) ? v.milestones.filter(isRecord) : [];
  const milestones = MILESTONE_KEYS[type].map((key): Milestone => {
    const m = raw.find((r) => r.id === milestoneId(id, key));
    const done = m !== undefined && m.done === true;
    return { id: milestoneId(id, key), done, at: m !== undefined && done && fin(m.at) ? m.at : null };
  });
  const origins = Array.isArray(v.originEventIds) ? v.originEventIds.filter((o): o is string => typeof o === 'string') : [];
  return {
    id, type, status,
    requirements: parseRequirements(v.requirements),
    milestones,
    progress: fin(v.progress) ? clamp01(v.progress) : 0,
    startedAt: v.startedAt,
    completedAt: (status === 'completed' || status === 'cancelled') && fin(v.completedAt) ? v.completedAt : null,
    originEventIds: [...new Set(origins)],
  };
}

/** Lo guardado, validado: basura → vacío; proyectos rotos fuera; ids repetidos o un segundo vivo del mismo tipo, el primero. */
export function parseLifeProjects(v: unknown): LifeProjectsState {
  if (!isRecord(v) || !Array.isArray(v.items)) return emptyLifeProjects();
  const seen = new Set<string>();
  const liveTypes = new Set<LifeProjectType>();
  const items: LifeProject[] = [];
  for (const raw of v.items) {
    const p = parseProject(raw);
    if (!p || seen.has(p.id) || (live(p) && liveTypes.has(p.type))) continue;
    seen.add(p.id);
    if (live(p)) liveTypes.add(p.type);
    items.push(p);
  }
  return { v: 1, items };
}

/** Lo que se dice si el objeto del proyecto ya está en la bolsa. */
const OWNED: Partial<Record<LifeProjectType, string>> = { 'buy-bike': 'Ya tienes una bicicleta.' };

/**
 * Por qué no se puede empezar `type` ahora (ya hay uno vivo, o ya tienes el objeto), o null. Puro: lo usan
 * startProject y la app Proyectos, así el móvil dice lo mismo que el rechazo. `reqs` por defecto, los del catálogo.
 */
export function startBlocker(
  s: LifeProjectsState, type: LifeProjectType, has?: (id: string) => boolean, reqs: LifeProjectRequirements = projectCatalog[type].requirements,
): string | null {
  if (s.items.some((p) => p.type === type && live(p))) return `Ya tienes en marcha «${LABEL[type]}».`;
  const item = parseRequirements(reqs).item;
  if (item !== undefined && has?.(item)) return OWNED[type] ?? 'Ya lo tienes.';
  return null;
}

/**
 * Empieza un proyecto. Id determinista `${type}-${nowAbs}`; no admite dos vivos (activo o en pausa) del mismo tipo.
 * Con `has` (el inventario real), no deja empezar a conseguir un objeto que ya tienes.
 */
export function startProject(
  s: LifeProjectsState, type: LifeProjectType, nowAbs: number, reqs: LifeProjectRequirements = {}, has?: (id: string) => boolean,
): ProjectResult {
  const blocked = startBlocker(s, type, has, reqs);
  if (blocked !== null) return { ok: false, state: s, message: blocked };
  // El nivel de partida lo pone GameState.startLifeProject desde el contrato en vigor: sin él no hay trabajo.
  if (type === 'promotion' && parseRequirements(reqs).fromLevel === undefined) return { ok: false, state: s, message: 'Necesitas un trabajo para pedir un ascenso.' };
  const id = `${type}-${nowAbs}`;
  if (s.items.some((p) => p.id === id)) return { ok: false, state: s, message: 'Ese proyecto ya existe.' };
  const project: LifeProject = {
    id, type, status: 'active', requirements: parseRequirements(reqs),
    milestones: MILESTONE_KEYS[type].map((key) => ({ id: milestoneId(id, key), done: false, at: null })),
    progress: 0, startedAt: nowAbs, completedAt: null, originEventIds: [],
  };
  return { ok: true, state: { v: 1, items: [...s.items, project] }, message: `Nuevo proyecto: «${LABEL[type]}».` };
}

function transition(s: LifeProjectsState, id: string, from: readonly LifeProjectStatus[], to: LifeProjectStatus, done: string, refused: string): ProjectResult {
  const p = s.items.find((x) => x.id === id);
  if (!p) return { ok: false, state: s, message: 'No existe ese proyecto.' };
  if (!from.includes(p.status)) return { ok: false, state: s, message: refused };
  // Reanudar no puede dejar dos vivos del mismo tipo (no pasa con startProject, pero un guardado viejo podría).
  if (to === 'active' && s.items.some((x) => x.id !== id && x.type === p.type && live(x))) return { ok: false, state: s, message: refused };
  return { ok: true, state: replace(s, { ...p, status: to }), message: done };
}

export function pauseProject(s: LifeProjectsState, id: string, _nowAbs: number): ProjectResult {
  return transition(s, id, ['active'], 'paused', 'Proyecto en pausa.', 'Ese proyecto no está activo.');
}

export function resumeProject(s: LifeProjectsState, id: string, _nowAbs: number): ProjectResult {
  return transition(s, id, ['paused'], 'active', 'Proyecto reanudado.', 'Ese proyecto no está en pausa.');
}

/** Abandonar guarda cuándo en completedAt (la fecha de cierre que enseña el historial). */
export function cancelProject(s: LifeProjectsState, id: string, nowAbs: number): ProjectResult {
  const r = transition(s, id, ['active', 'paused'], 'cancelled', 'Proyecto abandonado.', 'Ese proyecto ya terminó.');
  return r.ok ? { ...r, state: replace(r.state, { ...r.state.items.find((x) => x.id === id)!, completedAt: nowAbs }) } : r;
}

/** Marca un hito de un proyecto vivo. Un hito ya hecho no cambia ni suma otro originEventId. Clave desconocida: igual. */
export function markMilestone(s: LifeProjectsState, projectId: string, milestoneKey: string, nowAbs: number, originEventId?: string): LifeProjectsState {
  const p = s.items.find((x) => x.id === projectId);
  const mid = milestoneId(projectId, milestoneKey);
  const m = p?.milestones.find((x) => x.id === mid);
  if (!p || !m || m.done || !live(p)) return s;
  return replace(s, {
    ...p,
    milestones: p.milestones.map((x) => (x.id === mid ? { ...x, done: true, at: nowAbs } : x)),
    originEventIds: withOrigin(p.originEventIds, originEventId),
  });
}

/** Completa un proyecto activo si todos sus hitos (salvo 'done') están hechos. Completado o cancelado: nunca cambia. */
export function completeIfMet(s: LifeProjectsState, id: string, nowAbs: number, originEventId?: string): LifeProjectsState {
  const p = s.items.find((x) => x.id === id);
  if (!p || p.status !== 'active') return s;
  const doneId = milestoneId(id, 'done');
  if (!p.milestones.every((m) => m.done || m.id === doneId)) return s;
  return replace(s, {
    ...p,
    status: 'completed',
    milestones: p.milestones.map((m) => (m.id === doneId ? { ...m, done: true, at: nowAbs } : m)),
    progress: 1,
    completedAt: nowAbs,
    originEventIds: withOrigin(p.originEventIds, originEventId),
  });
}

/** Lo que la UI enseña de cada tipo antes de empezarlo (F4), y los requisitos con los que arranca. */
export interface ProjectInfo {
  type: LifeProjectType;
  title: string;
  summary: string;
  /** Dónde se cumple, para el recuerdo y la UI. */
  where?: string;
  /** El lugar de data/places.ts, para su horario. */
  place?: string;
  /** Lo que hace falta para empezarlo, dicho en la lista de proyectos. */
  needs: string;
  requirements: LifeProjectRequirements;
}

const BIKE_SHOP = 'ca-taller-mostrador';
/** El precio sale del catálogo real (data/catalogs.ts): una sola fuente de verdad. */
const priceOf = (catalog: string, item: string): number | undefined =>
  getCatalog(catalog).products.find((p) => 'item' in p.effect && p.effect.item === item)?.price;
const bikeCost = priceOf(BIKE_SHOP, 'bike');

export const projectCatalog: Record<LifeProjectType, ProjectInfo> = {
  'buy-bike': {
    type: 'buy-bike', title: LABEL['buy-bike'], where: 'Taller Biciclo, Campo Alto', place: 'ca-taller',
    summary: `Ahorra ${bikeCost === undefined ? '' : `${euros(bikeCost)} `}y compra una bicicleta de ciudad en el Taller Biciclo, Campo Alto.`,
    needs: bikeCost === undefined ? 'No tener ya una bicicleta.' : `Cuesta ${euros(bikeCost)}. No tener ya una bicicleta.`,
    requirements: { ...(bikeCost === undefined ? {} : { cost: bikeCost }), item: 'bike', shopCatalog: BIKE_SHOP },
  },
  promotion: {
    type: 'promotion', title: LABEL.promotion, where: 'Tu trabajo',
    summary: 'Encadena turnos buenos, puntual y sin faltas, hasta que tu responsable te proponga el puesto siguiente.',
    needs: 'Necesitas un trabajo con contrato en vigor.',
    requirements: {},
  },
};

/** Lo que exige el ascenso ahora mismo, sacado de Jobs.promotionChecks (la misma regla que promotionReady). Sin contrato, vacío. */
export const promotionRequirements = (job: JobProgress | null, unlocks: readonly string[]): PromotionCheck[] =>
  job ? promotionChecks(job, unlocks) : [];

export const lifeNoteId = (projectId: string): string => `life-${projectId}`;

/**
 * El gancho del ascenso (GameState.setJob lo llama en cada cambio de contrato). Sólo cuenta un ascenso de verdad: mismo
 * empleo, contrato activo y nivel mayor que antes (Jobs.promote). Si además supera el fromLevel de un proyecto
 * 'promotion' vivo: 'promoted' y completeIfMet con origen `promo-<día>-<empleo>-<nivel>`, y al completarse una nota
 * con id fijo `life-<id>`. Idempotente: un hito hecho o un proyecto completado no cambian, la nota sólo se escribe al
 * pasar a completado, y sin cambios devuelve las mismas referencias. No toca otros tipos (buy-bike).
 * Regla de cambio de empresa: dejar o perder el trabajo, o firmar en otra empresa, no toca el proyecto; sigue vivo con
 * el mismo fromLevel. Un ascenso en la empresa nueva que supere fromLevel lo cumple; si el nivel cae por debajo,
 * deriveProgress lo enseña como bloqueo y nada más.
 */
export function onJobChange(
  projects: LifeProjectsState, phone: PhoneState, before: JobProgress | null, after: JobProgress | null, nowAbs: number,
): { projects: LifeProjectsState; phone: PhoneState } {
  if (!before || !after || after.status !== 'active' || after.job !== before.job || after.level <= before.level) return { projects, phone };
  const origin = `promo-${Math.floor(nowAbs / 1440) + 1}-${after.job}-${after.level}`;
  let s = projects;
  for (const p of projects.items) {
    const from = p.requirements.fromLevel;
    if (p.type !== 'promotion' || !live(p) || from === undefined || after.level <= from) continue;
    s = markMilestone(s, p.id, 'promoted', nowAbs, origin);
    s = completeIfMet(s, p.id, nowAbs, origin);
  }
  const def = getJob(after.job);
  const detail = (p: LifeProject): string | undefined =>
    p.type === 'promotion' ? `ascenso a ${def.levels[after.level]?.title ?? 'un puesto nuevo'} en ${def.employer}` : undefined;
  return { projects: s, phone: noteCompletions(projects, s, phone, nowAbs, detail) };
}

const dayOfAbs = (abs: number): number => Math.floor(abs / 1440) + 1;

function defaultDetail(p: LifeProject): string {
  const item = p.requirements.item;
  const where = projectCatalog[p.type].where;
  if (item === undefined) return LABEL[p.type].toLowerCase();
  return `${getItem(item).name.toLowerCase()}${where ? ` en ${where}` : ''}`;
}

/**
 * La única vía del recuerdo: por cada proyecto que en `after` está completado y en `before` no, guarda la nota
 * `life-<id>` una sola vez (si ya existe, no la reescribe). Vale para onWalletChange, onJobChange y GameState.applyProject
 * (completar al reanudar). `detail` pone el texto propio de la vía; sin él, uno genérico. Sin cambios, el mismo phone.
 */
export function noteCompletions(
  before: LifeProjectsState, after: LifeProjectsState, phone: PhoneState, nowAbs: number, detail?: (p: LifeProject) => string | undefined,
): PhoneState {
  let ph = phone;
  for (const p of after.items) {
    if (p.status !== 'completed' || before.items.find((x) => x.id === p.id)?.status === 'completed') continue;
    if ((ph.notes ?? []).some((n) => n.id === lifeNoteId(p.id))) continue;
    ph = saveNote(ph, {
      id: lifeNoteId(p.id),
      title: `Hecho: ${LABEL[p.type].toLowerCase()}`,
      body: `Día ${dayOfAbs(p.completedAt ?? nowAbs)}: ${detail?.(p) ?? defaultDetail(p)}.`,
    }, nowAbs);
  }
  return ph;
}

/**
 * El gancho de la cartera (GameState.wallet lo llama en cada cambio). 'saved' se marca, sin origen, cuando el dinero
 * llega al coste (antes o después del cambio). Si un objeto de un proyecto vivo entra en la bolsa pagando (sube el
 * objeto y baja el dinero), 'bought' y completeIfMet con el movementId de ese cobro; al completarse, una nota del móvil
 * con id fijo `life-<id>`. Idempotente: un hito hecho o un proyecto completado no cambian, y sin cambios devuelve las
 * mismas referencias. Una compra sin proyecto no crea ninguno.
 */
export function onWalletChange(
  projects: LifeProjectsState, phone: PhoneState, before: Wallet, after: Wallet, nowAbs: number, movementId?: string,
): { projects: LifeProjectsState; phone: PhoneState } {
  let s = projects;
  for (const p of projects.items) {
    if (!live(p)) continue;
    const { cost, item } = p.requirements;
    if (cost !== undefined && Math.max(before.money, after.money) + 1e-9 >= cost) s = markMilestone(s, p.id, 'saved', nowAbs);
    if (item === undefined || (after.inventory[item] ?? 0) <= (before.inventory[item] ?? 0) || after.money >= before.money) continue;
    s = markMilestone(s, p.id, 'bought', nowAbs, movementId);
    s = completeIfMet(s, p.id, nowAbs, movementId);
  }
  const paid = Math.round((before.money - after.money) * 100) / 100;
  const detail = (p: LifeProject): string | undefined => {
    const item = p.requirements.item;
    const where = projectCatalog[p.type].where;
    return item === undefined ? undefined : `${getItem(item).name.toLowerCase()} por ${euros(paid)}${where ? ` en ${where}` : ''}`;
  };
  return { projects: s, phone: noteCompletions(projects, s, phone, nowAbs, detail) };
}

const isDone = (p: LifeProject, key: string): boolean => p.milestones.some((m) => m.id === milestoneId(p.id, key) && m.done);

/** Progreso leído de los datos reales (dinero, inventario, nivel). No escribe nada. */
export function deriveProgress(project: LifeProject, facts: ProgressFacts): DerivedProgress {
  if (project.status === 'completed') return { ratio: 1, nextStep: 'Proyecto completado.', blockers: [] };
  if (project.status === 'cancelled') return { ratio: 0, nextStep: 'Proyecto cancelado.', blockers: [] };
  const blockers: string[] = project.status === 'paused' ? ['El proyecto está en pausa.'] : [];
  if (project.type === 'buy-bike') {
    const cost = project.requirements.cost ?? 0;
    const item = project.requirements.item;
    const bought = isDone(project, 'bought') || (item !== undefined && facts.hasItem(item));
    if (bought) return { ratio: 1, nextStep: 'Ya tienes la bici.', blockers };
    const saved = cost <= 0 ? 1 : clamp01(Math.max(0, facts.money) / cost);
    if (saved < 1) {
      const missing = Math.ceil(cost - Math.max(0, facts.money));
      return { ratio: 0.8 * saved, nextStep: `Ahorra ${missing} € más.`, blockers: [...blockers, `Te faltan ${missing} €.`] };
    }
    return { ratio: 0.8, nextStep: 'Ya tienes el dinero: ve a comprar la bici.', blockers };
  }
  // promotion
  const from = project.requirements.fromLevel;
  const promoted = isDone(project, 'promoted') || (from !== undefined && facts.jobLevel !== undefined && facts.jobLevel > from);
  if (promoted) return { ratio: 1, nextStep: 'Ya te han ascendido.', blockers };
  if (facts.jobLevel === undefined) return { ratio: 0, nextStep: 'Consigue un trabajo.', blockers: [...blockers, 'No tienes trabajo.'] };
  if (from !== undefined && facts.jobLevel < from) {
    return { ratio: 0, nextStep: 'Sube de puesto para optar al ascenso.', blockers: [...blockers, 'Tu puesto está por debajo del de partida.'] };
  }
  return { ratio: 0, nextStep: 'Cumple tus turnos para optar al ascenso.', blockers };
}

// ---------------------------------------------------------------- vista (F4: la app Proyectos del móvil)

export type ProjectAction = 'pause' | 'resume' | 'cancel';
export const STATUS_LABEL: Record<LifeProjectStatus, string> = { active: 'En marcha', paused: 'En pausa', completed: 'Completado', cancelled: 'Abandonado' };
export const CANCEL_CONSEQUENCE = 'Se pierde el seguimiento; tu dinero, tu bici y tu trabajo no cambian.';

/** Los hechos de deriveProgress más el contrato (ya repasado a ahora) y los desbloqueos, para el ascenso. */
export interface ViewFacts extends ProgressFacts {
  job?: JobProgress | null;
  unlocks?: readonly string[];
}

export interface ProjectView {
  id: string;
  title: string;
  status: string;
  ratio: number;
  /** La causa del progreso: «€95,00 de €180,00 ahorrados», «Turnos buenos 3/5». */
  progressText: string;
  nextStep: string;
  blockers: string[];
  actions: ProjectAction[];
}

/** Lo que la app enseña de un proyecto. Pura: sólo lee el proyecto y los hechos. */
export function projectView(p: LifeProject, facts: ViewFacts): ProjectView {
  const job = facts.job?.status === 'active' ? facts.job : null;
  const d = deriveProgress(p, { ...facts, jobLevel: facts.jobLevel ?? job?.level });
  const info = projectCatalog[p.type];
  let ratio = d.ratio;
  let nextStep = d.nextStep;
  let progressText: string;
  const blockers = [...d.blockers];
  if (p.type === 'buy-bike') {
    const cost = p.requirements.cost ?? 0;
    progressText = d.ratio >= 1 ? 'Bicicleta comprada' : `${euros(Math.min(cost, Math.max(0, facts.money)))} de ${euros(cost)} ahorrados`;
    if (live(p) && d.ratio < 1) {
      const place = info.place ? placeInfo(info.place) : undefined;
      const hours = place ? hoursLabel(place).replace(/\.$/, '') : '';
      const saved = facts.money + 1e-9 >= cost;
      nextStep = `${saved ? 'Cómprala' : `${d.nextStep} Después, cómprala`} en ${info.where}${hours ? ` (${hours.charAt(0).toLowerCase()}${hours.slice(1)})` : ''}.`;
    }
  } else {
    const def = job ? getJob(job.job) : null;
    if (d.ratio >= 1) progressText = 'Ascenso conseguido';
    else if (!job || !def) progressText = 'Sin trabajo';
    else {
      const good = Math.min(job.good, def.promoteAfter);
      progressText = `Turnos buenos ${good}/${def.promoteAfter}`;
      if (job.level >= (p.requirements.fromLevel ?? job.level)) ratio = def.promoteAfter > 0 ? 0.9 * (good / def.promoteAfter) : 0;
      if (live(p)) {
        nextStep = `${d.nextStep} Tu trabajo: ${def.employer}.`;
        blockers.push(...promotionChecks(job, facts.unlocks ?? []).filter((c) => !c.ok).map((c) => c.label));
      }
    }
  }
  const actions: ProjectAction[] = p.status === 'active' ? ['pause', 'cancel'] : p.status === 'paused' ? ['resume', 'cancel'] : [];
  return { id: p.id, title: info.title, status: STATUS_LABEL[p.status], ratio, progressText, nextStep, blockers, actions };
}

/** ¿Se ofrece «Empezar» para este tipo? No si ya hay uno vivo (activo o en pausa). */
export const canStart = (s: LifeProjectsState, type: LifeProjectType): boolean => !s.items.some((p) => p.type === type && live(p));
