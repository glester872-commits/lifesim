// VID-06 · vecindario: paquetes que llegan a tu portal para un vecino y pequeños favores. Puro: sin Phaser, sin
// Math.random ni Date.now. Imports con extensión .ts para que los scripts de node lo carguen tal cual.
import { CHARACTERS } from '../data/characters.ts';
import { LOCATIONS } from '../data/locations.ts';
import { hashSeed, seededRng } from './MetroDaily.ts';
import type { SocialDelta, SocialOutcome } from './Social.ts';

export type PackageStatus = 'pending' | 'held' | 'delivered' | 'lost';
export interface Package { id: string; recipient: string; day: number; deadlineDay: number; status: PackageStatus; resolvedDay?: number }
export type FavorStatus = 'offered' | 'accepted' | 'done' | 'declined' | 'expired';
export interface Favor { id: string; kind: 'groceries'; npc: string; day: number; deadlineDay: number; minutes: number; status: FavorStatus; resolvedDay?: number }
/** `lastTickDay`: último día ya procesado por tickNeighborhood (catch-up acotado y llamadas repetidas sin efecto). */
export interface NeighborhoodState { v: 1; packages: Package[]; favors: Favor[]; lastEventDay: number; lastFavorDay: number; lastTickDay: number }
export const emptyNeighborhood = (): NeighborhoodState => ({ v: 1, packages: [], favors: [], lastEventDay: 0, lastFavorDay: 0, lastTickDay: 0 });

export const PACKAGE_COOLDOWN_DAYS = 7;
export const PACKAGE_CHANCE = 0.35;
export const PACKAGE_DEADLINE_DAYS = 3;
export const FAVOR_COOLDOWN_DAYS = 5;
export const FAVOR_MINUTES = 20;
export const MAX_ITEMS = 12;
/** Días que se recuperan como mucho si el reloj salta varios de golpe. */
export const CATCH_UP_DAYS = 3;

/** Un cambio de relación que el estado pide aplicar una sola vez (GameState.applyNeighborEffects, idempotente por ref). */
export interface NeighborEffect { npc: string; delta: Partial<SocialDelta>; memory: { ref: string; note: string; outcome: SocialOutcome } }
export interface NeighborResult { state: NeighborhoodState; effects: NeighborEffect[] }
export interface NeighborCtx { candidates: readonly string[]; known: (npc: string) => boolean }

const livePkg = (p: Package): boolean => p.status === 'pending' || p.status === 'held';
const liveFav = (f: Favor): boolean => f.status === 'offered' || f.status === 'accepted';
/** 0 es «nunca»: el primer paquete o favor no espera al enfriamiento. */
const cooled = (last: number, day: number, cd: number): boolean => last <= 0 || day - last >= cd;
const same = (s: NeighborhoodState): NeighborResult => ({ state: s, effects: [] });

// ---------------------------------------------------------------- quién vive dónde

const BUILDINGS = LOCATIONS.flatMap((l) => (l.buildings ?? []).map((b) => ({ location: l.id, id: b.id, point: b.point })));

/** Los personajes cuyo portal (CharacterDef.home) es el punto de ese edificio, por id. */
export function residentsOf(buildingId: string): string[] {
  const points = new Set(BUILDINGS.filter((b) => b.id === buildingId && b.point).map((b) => b.point));
  return [...new Set(CHARACTERS.filter((c) => points.has(c.home)).map((c) => c.npc))].sort();
}

/** Los personajes con portal en la misma location que la puerta de tu vivienda (HomeDef.door), menos `excluded`. */
export function neighborCandidates(doorBuilding: string, excluded: readonly string[] = []): string[] {
  const locs = new Set(BUILDINGS.filter((b) => b.id === doorBuilding).map((b) => b.location));
  const points = new Set(BUILDINGS.filter((b) => locs.has(b.location) && b.point).map((b) => b.point));
  return [...new Set(CHARACTERS.filter((c) => points.has(c.home) && !excluded.includes(c.npc)).map((c) => c.npc))].sort();
}

// ---------------------------------------------------------------- reloj

const trim = <T extends { day: number }>(xs: T[]): T[] => [...xs].sort((a, b) => a.day - b.day).slice(-MAX_ITEMS);

/** Un día: caduca lo vencido y, si toca, llega un paquete. */
function stepDay(s: NeighborhoodState, day: number, ctx: NeighborCtx, effects: NeighborEffect[]): NeighborhoodState {
  const packages = s.packages.map((p): Package => {
    if (!livePkg(p) || day <= p.deadlineDay) return p;
    effects.push({ npc: p.recipient, delta: { friendship: -1 }, memory: { ref: `pkg:${p.id}`, note: 'no me llegó el paquete', outcome: 'negative' } });
    return { ...p, status: 'lost', resolvedDay: day };
  });
  const favors = s.favors.map((f): Favor => {
    if (!liveFav(f) || day <= f.deadlineDay) return f;
    if (f.status === 'offered') return { ...f, status: 'declined', resolvedDay: day };
    effects.push({ npc: f.npc, delta: { friendship: -1 }, memory: { ref: `favor:${f.id}`, note: 'al final no me hiciste la compra', outcome: 'negative' } });
    return { ...f, status: 'expired', resolvedDay: day };
  });
  let next: NeighborhoodState = { ...s, packages, favors, lastTickDay: day };
  const known = [...ctx.candidates].filter(ctx.known).sort();
  if (packages.some(livePkg) || !cooled(s.lastEventDay, day, PACKAGE_COOLDOWN_DAYS) || known.length === 0) return next;
  const rng = seededRng(hashSeed(`vid06:pkg:${day}`));
  if (rng() >= PACKAGE_CHANCE) return next;
  const recipient = known[Math.floor(rng() * known.length)];
  const pkg: Package = { id: `pkg-${day}`, recipient, day, deadlineDay: day + PACKAGE_DEADLINE_DAYS, status: 'pending' };
  next = { ...next, packages: trim([...packages, pkg]), lastEventDay: day };
  return next;
}

/** Avanza hasta `day` (como mucho CATCH_UP_DAYS días atrasados). Repetir el mismo día no hace nada. */
export function tickNeighborhood(state: NeighborhoodState, day: number, ctx: NeighborCtx): NeighborResult {
  if (day <= state.lastTickDay) return same(state);
  const effects: NeighborEffect[] = [];
  let s = state;
  // lastTickDay 0 = nunca procesado (o vecindario vacío, que no se guarda): sólo el día actual, sin paquetes atrasados.
  const from = state.lastTickDay === 0 ? day : Math.max(state.lastTickDay + 1, day - CATCH_UP_DAYS + 1);
  for (let d = from; d <= day; d++) s = stepDay(s, d, ctx, effects);
  return { state: { ...s, packages: trim(s.packages), favors: trim(s.favors) }, effects };
}

// ---------------------------------------------------------------- paquetes

export const heldPackage = (state: NeighborhoodState): Package | undefined => state.packages.find((p) => p.status === 'held');
export const pendingPackage = (state: NeighborhoodState): Package | undefined => state.packages.find((p) => p.status === 'pending');
/** Si al hablar con `npc` se ofrece «Darle el paquete»: sólo si el que llevas es suyo. */
export const canDeliverTo = (state: NeighborhoodState | undefined, npc: string): boolean => !!state && heldPackage(state)?.recipient === npc;

/** Recoges el paquete del portal: pending → held. Sin paquete pendiente, el mismo estado. */
export function pickUpPackage(state: NeighborhoodState, day: number): NeighborResult {
  const p = pendingPackage(state);
  if (!p || day > p.deadlineDay) return same(state);
  return { state: { ...state, packages: state.packages.map((x): Package => (x === p ? { ...x, status: 'held' } : x)) }, effects: [] };
}

/** Se lo das a `npc`: sólo si el que llevas es suyo. Si no, el mismo estado y ningún efecto. */
export function deliverPackage(state: NeighborhoodState, npc: string, day: number): NeighborResult {
  const p = heldPackage(state);
  if (!p || p.recipient !== npc) return same(state);
  return {
    state: { ...state, packages: state.packages.map((x): Package => (x === p ? { ...x, status: 'delivered', resolvedDay: day } : x)) },
    effects: [{ npc, delta: { friendship: 2 }, memory: { ref: `pkg:${p.id}`, note: 'me subiste el paquete', outcome: 'positive' } }],
  };
}

// ---------------------------------------------------------------- favores

export const liveFavor = (state: NeighborhoodState): Favor | undefined => state.favors.find(liveFav);
/** El favor vivo (offered o accepted) de `npc`, si lo hay. */
export const favorFor = (state: NeighborhoodState | undefined, npc: string): Favor | undefined => state?.favors.find((f) => f.npc === npc && liveFav(f));

/** Si al hablar con `npc` hoy te pide un favor: candidato, ninguno vivo, enfriado y una tirada determinista del 50 %. */
export function favorOfferFor(state: NeighborhoodState, npc: string, day: number, candidates: readonly string[]): boolean {
  if (!candidates.includes(npc) || liveFavor(state) || !cooled(state.lastFavorDay, day, FAVOR_COOLDOWN_DAYS)) return false;
  return seededRng(hashSeed(`vid06:fav:${day}:${npc}`))() < 0.5;
}

/** `npc` te pide hacerle la compra hoy. Uno vivo como mucho y con FAVOR_COOLDOWN_DAYS entre uno y otro. */
export function offerFavor(state: NeighborhoodState, npc: string, day: number): NeighborResult {
  if (liveFavor(state) || !cooled(state.lastFavorDay, day, FAVOR_COOLDOWN_DAYS)) return same(state);
  const f: Favor = { id: `fav-${day}-${npc}`, kind: 'groceries', npc, day, deadlineDay: day, minutes: FAVOR_MINUTES, status: 'offered' };
  return { state: { ...state, favors: trim([...state.favors, f]), lastFavorDay: day }, effects: [] };
}

function moveFavor(state: NeighborhoodState, npc: string, from: FavorStatus, to: FavorStatus, day: number): Favor | undefined {
  const f = state.favors.find((x) => x.npc === npc && x.status === from);
  return f && day <= f.deadlineDay ? { ...f, status: to, ...(to === 'accepted' ? {} : { resolvedDay: day }) } : undefined;
}

const withFavor = (state: NeighborhoodState, f: Favor): NeighborhoodState => ({ ...state, favors: state.favors.map((x) => (x.id === f.id ? f : x)) });

export function acceptFavor(state: NeighborhoodState, npc: string, day: number): NeighborResult {
  const f = moveFavor(state, npc, 'offered', 'accepted', day);
  return f ? { state: withFavor(state, f), effects: [] } : same(state);
}

export function declineFavor(state: NeighborhoodState, npc: string, day: number): NeighborResult {
  const f = moveFavor(state, npc, 'offered', 'declined', day);
  return f ? { state: withFavor(state, f), effects: [] } : same(state);
}

/** Le llevas la compra: accepted → done. `minutes` es lo que avanza el reloj (0 si no había nada que resolver). */
export function resolveFavor(state: NeighborhoodState, npc: string, day: number): NeighborResult & { minutes: number } {
  const f = moveFavor(state, npc, 'accepted', 'done', day);
  if (!f) return { ...same(state), minutes: 0 };
  return {
    state: withFavor(state, f),
    effects: [{ npc, delta: { friendship: 2 }, memory: { ref: `favor:${f.id}`, note: 'me hiciste la compra', outcome: 'positive' } }],
    minutes: f.minutes,
  };
}

// ---------------------------------------------------------------- guardado

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isDay = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const dayOr0 = (v: unknown): number => (isDay(v) ? v : 0);
const PKG_STATUS: readonly PackageStatus[] = ['pending', 'held', 'delivered', 'lost'];
const FAV_STATUS: readonly FavorStatus[] = ['offered', 'accepted', 'done', 'declined', 'expired'];

function parsePackage(v: unknown, ok: (npc: string) => boolean): Package | null {
  if (!isRecord(v) || !str(v.id) || !str(v.recipient) || !ok(v.recipient) || !isDay(v.day) || !isDay(v.deadlineDay)) return null;
  if (!PKG_STATUS.includes(v.status as PackageStatus)) return null;
  return { id: v.id, recipient: v.recipient, day: v.day, deadlineDay: v.deadlineDay, status: v.status as PackageStatus, ...(isDay(v.resolvedDay) ? { resolvedDay: v.resolvedDay } : {}) };
}

function parseFavor(v: unknown, ok: (npc: string) => boolean): Favor | null {
  if (!isRecord(v) || !str(v.id) || v.kind !== 'groceries' || !str(v.npc) || !ok(v.npc) || !isDay(v.day) || !isDay(v.deadlineDay) || !isDay(v.minutes)) return null;
  if (!FAV_STATUS.includes(v.status as FavorStatus)) return null;
  return { id: v.id, kind: 'groceries', npc: v.npc, day: v.day, deadlineDay: v.deadlineDay, minutes: v.minutes, status: v.status as FavorStatus, ...(isDay(v.resolvedDay) ? { resolvedDay: v.resolvedDay } : {}) };
}

/** Deja vivo sólo el más reciente (el último por día); los demás pasan a `dead`, sin efectos. */
function oneLive<T extends { day: number; deadlineDay: number; status: string; resolvedDay?: number }>(xs: T[], live: (x: T) => boolean, dead: (x: T) => T['status']): T[] {
  const sorted = [...xs].sort((a, b) => a.day - b.day);
  const keep = sorted.filter(live).at(-1);
  return sorted.map((x) => (live(x) && x !== keep ? { ...x, status: dead(x), resolvedDay: x.deadlineDay } : x));
}

/** Lo mal formado se descarta; como mucho un paquete y un favor vivos y MAX_ITEMS de cada. */
export function parseNeighborhood(v: unknown, knownNpcs?: readonly string[]): NeighborhoodState {
  if (!isRecord(v)) return emptyNeighborhood();
  const ok = (npc: string): boolean => knownNpcs === undefined || knownNpcs.includes(npc);
  const packages = (Array.isArray(v.packages) ? v.packages : []).map((p) => parsePackage(p, ok)).filter((p): p is Package => p !== null);
  const favors = (Array.isArray(v.favors) ? v.favors : []).map((f) => parseFavor(f, ok)).filter((f): f is Favor => f !== null);
  return {
    v: 1,
    packages: trim(oneLive(packages, livePkg, () => 'lost')),
    favors: trim(oneLive(favors, liveFav, (f) => (f.status === 'offered' ? 'declined' : 'expired'))),
    lastEventDay: dayOr0(v.lastEventDay),
    lastFavorDay: dayOr0(v.lastFavorDay),
    lastTickDay: dayOr0(v.lastTickDay),
  };
}
