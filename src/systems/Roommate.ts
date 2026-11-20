// Sin Phaser: lo usan main.ts, Menus, WorldScene, Opportunities, SaveSystem y scripts/check-roommate.ts.
import { BILLS } from '../data/household.ts';
import { HOMES, getHome } from '../data/housing.ts';
import { JOBS } from '../data/jobs.ts';
import { MATES, getMate, type MateDef } from '../data/roommate.ts';
import { formatDateShort } from './Calendar.ts';
import { euros } from './Commerce.ts';
import { billOf, owed, total, unpaid, type HouseholdState, type Movement, type Obligation } from './Household.ts';
import { moveBlocker, type HousingState } from './Housing.ts';
import { hireBlocker, levelOf, scheduled, type JobProgress } from './Jobs.ts';
import { applyDelta, noteSocialMemory, type SocialProfile } from './Social.ts';

/**
 * SIM-05 · Compañero de piso. Funciones puras sobre GameStateData.roommate y el household; quien las usa aplica el
 * resultado y guarda.
 *
 * - Sólo se reparte el alquiler (`SHARED`). La parte del compañero se fija en la obligación (`Obligation.mate`) una
 *   sola vez por periodo y rebaja tu parte (`total()`); nunca entra en la cartera.
 * - Cuenta desde el primer periodo que empieza ESTRICTAMENTE después del periodo en curso el día del acuerdo (`from`,
 *   firstShared): el periodo en curso no cambia aunque el acuerdo se firme el mismo día en que empezó.
 * - Al terminar (`ended`), el periodo en curso ese día conserva su aportación (start <= ended: syncHousehold anuncia y
 *   fija el periodo a medianoche o al arrancar, antes de que el jugador pueda terminar ese día); los que empiezan
 *   después de `ended`, no.
 * - Un periodo ya pagado nunca se recalcula.
 * - El compromiso (pagar tu parte antes de que venza) se evalúa una vez por periodo: cumplido o incumplido. No cobra
 *   nada: el impago ya tiene su recargo en Household y su consecuencia 'household'; aquí sólo se recuerda.
 */

export interface RoommateState {
  /** Id en data/roommate.ts MATES. */
  mate: string;
  /** Vivienda (data/housing.ts) donde convivís: de ella sale su rutina. */
  home: string;
  /** Día en que se acordó. */
  since: number;
  /** Inicio del primer alquiler compartido (firstShared el día del acuerdo). Sin él se recalcula. */
  from?: number;
  /** Día en que se terminó. */
  ended?: number;
  /** `<gasto>:<periodo>` → aportación fijada (idempotencia; acotado). */
  settled: Record<string, number>;
  /** Periodos con tu parte pagada a tiempo / vencidos sin pagar. */
  kept: number;
  missed: number;
  /** Periodos ya evaluados (acotado a los últimos EVAL_KEEP). */
  evaluated?: string[];
}

export const SHARED = 'rent';
const EVAL_KEEP = 8;
const cents = (n: number): number => Math.round(n * 100) / 100;
const keyOf = (o: Obligation): string => `${o.bill}:${o.period}`;
const every = (bill: string): number => BILLS.find((b) => b.id === bill)!.every;

/** Día en que empieza el periodo de una obligación. */
export const periodStart = (h: HouseholdState, o: Obligation): number => h.since + o.period * billOf(o).every;

/** Inicio del primer periodo de alquiler posterior al que está en curso `today` (h.since si aún no ha empezado ninguno). */
export function firstShared(h: HouseholdState, today: number): number {
  const e = every(SHARED);
  if (today < h.since) return h.since;
  return h.since + (Math.floor((today - h.since) / e) + 1) * e;
}

/** Reparto en céntimos exactos: él, `share` redondeado hacia abajo; el resto, a tu parte. mate + you === amount. */
export function split(amount: number, share: number): { mate: number; you: number } {
  const all = Math.round(amount * 100);
  const mate = Math.min(all, Math.max(0, Math.floor(all * share + 1e-6)));
  return { mate: mate / 100, you: (all - mate) / 100 };
}

export const active = (r: RoommateState | undefined | null): r is RoommateState => !!r && r.ended === undefined;

export interface MateQuote {
  total: number;
  you: number;
  mate: number;
  /** Día del primer alquiler compartido. */
  from: number;
  text: string;
}

/** Antes de confirmar: motivo, condiciones, reparto, conceptos, desde cuándo y cómo se termina. */
export function quote(def: MateDef, homeId: string, h: HouseholdState, today: number): MateQuote {
  const rent = getHome(homeId).rent;
  const s = split(rent, def.share);
  const homeBill = BILLS.find((b) => b.id === 'home');
  const from = firstShared(h, today);
  // Párrafos cortos ('\n\n': .menu__text usa white-space: pre-line): motivo y condiciones; reparto y desde cuándo;
  // tu compromiso; cómo se termina.
  const paragraphs = [
    [def.motive, ...def.terms],
    [`Alquiler de ${getHome(homeId).name}: ${euros(rent)} a la semana → ${def.name} paga ${euros(s.mate)} y tú ${euros(s.you)}.`,
    homeBill ? `${homeBill.name}: ${euros(homeBill.amount)}, los pagas tú.` : '',
    `Empieza a contar con el alquiler que se anuncia el ${formatDateShort(from)}; el de esta semana y lo ya anunciado no cambian.`],
    [`Tu compromiso: pagar tu parte antes de que venza; si vence sin pagar, ${def.name} lo nota (el recargo llega después del margen).`],
    ['Se puede terminar cuando quieras: el alquiler en curso conserva su parte y los siguientes los pagas enteros. Mudarte a una casa sin sitio para dos también lo termina.'],
  ];
  return { total: rent, you: s.you, mate: s.mate, from, text: paragraphs.map((p) => p.filter(Boolean).join(' ')).join('\n\n') };
}

export function startRoommate(def: MateDef, homeId: string, today: number, h?: HouseholdState): RoommateState {
  return { mate: def.id, home: homeId, since: today, ...(h ? { from: firstShared(h, today) } : {}), settled: {}, kept: 0, missed: 0 };
}

export function endRoommate(r: RoommateState, today: number): RoommateState {
  return r.ended !== undefined ? r : { ...structuredClone(r), ended: today };
}

/** Lo que se dice antes de terminar. */
export const endSummary = (r: RoommateState): string =>
  `${getMate(r.mate).name} se vuelve a Ribera. El alquiler en curso conserva su parte; los siguientes los pagas tú enteros. Nada de lo ya pagado cambia.`;

/** ¿Este periodo es compartido? Empieza en [from, ended]: después del periodo del acuerdo y como tarde el día de terminar. */
function covered(h: HouseholdState, r: RoommateState, o: Obligation): boolean {
  const start = periodStart(h, o);
  return o.bill === SHARED && start >= (r.from ?? firstShared(h, r.since)) && (r.ended === undefined || start <= r.ended);
}

/** Fija la aportación en los periodos compartidos sin pagar y sin fijar: una sola vez por periodo. */
export function applyShare(h: HouseholdState, r: RoommateState | undefined): { household: HouseholdState; roommate: RoommateState | undefined; applied: Obligation[] } {
  if (!r) return { household: h, roommate: r, applied: [] };
  const share = getMate(r.mate).share;
  const out = structuredClone(h);
  const rm = structuredClone(r);
  const applied: Obligation[] = [];
  for (const o of out.obligations) {
    if (o.paid !== undefined || o.mate !== undefined || keyOf(o) in rm.settled || !covered(out, rm, o)) continue;
    o.mate = split(o.amount, share).mate;
    rm.settled[keyOf(o)] = o.mate;
    applied.push(o);
  }
  if (!applied.length) return { household: h, roommate: r, applied };
  const keys = Object.keys(rm.settled);
  for (const k of keys.slice(0, Math.max(0, keys.length - EVAL_KEEP))) delete rm.settled[k];
  return { household: out, roommate: rm, applied };
}

export interface Commitment {
  key: string;
  kept: boolean;
  line: string;
}

/** Línea del compañero según cómo va la convivencia. */
export function mateLine(r: RoommateState, kept: boolean): string {
  const name = getMate(r.mate).name;
  if (kept) return r.kept >= 3 && r.missed === 0 ? `${name}: «Otra semana al día. Así da gusto vivir juntos.»` : `${name}: «Alquiler pagado a tiempo. Gracias, de verdad.»`;
  return r.missed >= 2 ? `${name}: «Otra vez tarde con el alquiler. Yo puse mi parte; esto no puede seguir así.»` : `${name}: «Ha vencido el alquiler y tu parte no está. Yo ya puse la mía.»`;
}

/**
 * Una vez por periodo compartido: pagado a tiempo (paid ≤ due) suma `kept`; vencido sin pagar (o pagado tarde sin
 * evaluar) suma `missed`. No toca dinero ni recargos: eso ya lo hace Household.
 */
export function evaluateCommitment(h: HouseholdState, r: RoommateState | undefined, today: number): { roommate: RoommateState | undefined; events: Commitment[] } {
  if (!r) return { roommate: r, events: [] };
  const rm = structuredClone(r);
  const seen = new Set(rm.evaluated ?? []);
  const events: Commitment[] = [];
  for (const o of [...h.obligations].sort((a, b) => a.due - b.due)) {
    if (o.bill !== SHARED || !o.mate || seen.has(keyOf(o))) continue;
    let kept: boolean;
    if (o.paid !== undefined) kept = o.paid <= o.due;
    else if (today > o.due) kept = false;
    else continue;
    if (kept) rm.kept++;
    else rm.missed++;
    seen.add(keyOf(o));
    rm.evaluated = [...(rm.evaluated ?? []), keyOf(o)].slice(-EVAL_KEEP);
    events.push({ key: keyOf(o), kept, line: mateLine(rm, kept) });
  }
  return events.length ? { roommate: rm, events } : { roommate: r, events };
}

/**
 * El compañero recuerda cada periodo evaluado (systems/Social: una memoria PROMISE con la clave `alquiler <gasto:periodo>`)
 * y la relación se mueve un poco: a tiempo, sube; vencido sin pagar, baja. Una sola vez por clave (si ya está, no hace
 * nada). No hay doble penalización: no toca dinero ni importes; el recargo es de Household (tras GRACE_DAYS) y la
 * consecuencia 'household' es de SIM-01 (Consequences). Esto sólo es lo que él piensa de ti.
 */
export function rememberCommitment(profile: SocialProfile, e: Commitment, day: number): SocialProfile {
  const note = `alquiler ${e.key} ${e.kept ? 'a tiempo' : 'sin pagar'}`;
  if (profile.memories.some((m) => m.kind === 'PROMISE' && m.note?.startsWith(`alquiler ${e.key} `))) return profile;
  const delta = e.kept
    ? { friendship: 2, attraction: 0, trust: 2, romance: 0, mood: 2 }
    : { friendship: -1, attraction: 0, trust: -2, romance: 0, mood: -2 };
  return noteSocialMemory(applyDelta(profile, delta), { kind: 'PROMISE', day, hour: 0, minute: 0, outcome: e.kept ? 'positive' : 'negative', note });
}

/** Al mudarse: a una casa con sitio para dos se viene contigo; a una sin él, se termina ese día. */
export function moveEffect(r: RoommateState | undefined, toHome: string, today: number): RoommateState | undefined {
  if (!active(r)) return r;
  return getHome(toHome).mate ? { ...structuredClone(r), home: toHome } : endRoommate(r, today);
}

/** Para el resumen de mudanza (antes de confirmar). Vacío sin convivencia. */
export function moveNote(r: RoommateState | undefined, toHome: string): string {
  if (!active(r)) return '';
  const name = getMate(r.mate).name;
  return getHome(toHome).mate
    ? `${name} se muda contigo: el nuevo alquiler se reparte igual desde el próximo periodo que se anuncie.`
    : `${getHome(toHome).name} no tiene sitio para dos: la convivencia con ${name} termina el día de la mudanza (el alquiler en curso conserva su parte).`;
}

/** Rutina de convivencia de una vivienda (data/characters.ts). */
export const mateRoutine = (homeId: string): string => `convive-${homeId}`;

/**
 * La rutina fijada ese día de personaje para `npc`, o undefined. Cuenta desde el día siguiente a acordarlo (el día ya
 * empezado no cambia: sin saltos) y hasta el día en que termina, incluido.
 */
export function routineId(r: RoommateState | undefined | null, npc: string, day: number): string | undefined {
  if (!r || getMate(r.mate).npc !== npc) return undefined;
  if (day <= r.since || (r.ended !== undefined && day > r.ended)) return undefined;
  return mateRoutine(r.home);
}

/** La convivencia guardada, validada. Sin dato o dañada: undefined (sin convivencia, sin cobros históricos). */
export function parseRoommate(v: unknown): RoommateState | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const o = v as Record<string, unknown>;
  const int = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;
  if (typeof o.mate !== 'string' || !MATES.some((m) => m.id === o.mate)) return undefined;
  if (typeof o.home !== 'string' || !HOMES.some((h) => h.id === o.home && h.mate)) return undefined;
  if (!int(o.since) || o.since < 1) return undefined;
  const settled: Record<string, number> = {};
  if (typeof o.settled === 'object' && o.settled !== null) {
    for (const [k, n] of Object.entries(o.settled as Record<string, unknown>)) if (/^\w+:\d+$/.test(k) && typeof n === 'number' && n >= 0) settled[k] = n;
  }
  const evaluated = Array.isArray(o.evaluated) ? o.evaluated.filter((k): k is string => typeof k === 'string').slice(-EVAL_KEEP) : [];
  return {
    mate: o.mate, home: o.home, since: o.since,
    ...(int(o.from) && o.from >= o.since ? { from: o.from } : {}),
    ...(int(o.ended) && o.ended >= o.since ? { ended: o.ended } : {}),
    settled, kept: int(o.kept) ? o.kept : 0, missed: int(o.missed) ? o.missed : 0,
    ...(evaluated.length ? { evaluated } : {}),
  };
}

// ----------------------------------------------------------------- situación A

export interface Outlook {
  /** Cartera menos lo que se debe (tu parte). */
  available: number;
  /** Ingresos ya cobrados (ledger) desde que empezó el periodo de alquiler en curso. */
  collected: number;
  /** Sueldo de tu contrato × turnos programados hasta el próximo vencimiento. Nunca suma a `available`. */
  expected: number;
  shifts: number;
  /** Supuesto de `expected`, dicho. */
  assumption: string;
  upcoming: { label: string; due: number; amount: number; mate: number; you: number }[];
  /** Sólo lo que se puede hacer ahora mismo. */
  alternatives: string[];
}

export interface OutlookExtra {
  housing: HousingState;
  roommate: RoommateState | undefined;
  /** Se cumple la condición para proponer compartir (p. ej. haber conocido a Kevin). */
  mateReady: boolean;
}

/** Sin contrato vigente (nunca firmado, dejado o despedido). */
const scheduledAny = (job: JobProgress | null): boolean => !!job && job.status === 'active';

export function incomeOutlook(h: HouseholdState, money: number, job: JobProgress | null, ledger: readonly Movement[], today: number, x: OutlookExtra): Outlook {
  const available = cents(money - owed(h));
  const e = every(SHARED);
  const periodFrom = h.since + Math.max(0, Math.floor((today - h.since) / e)) * e;
  const collected = cents(ledger.filter((m) => m.type === 'income' && m.amount > 0 && m.day >= periodFrom && m.day <= today).reduce((s, m) => s + m.amount, 0));
  const next = unpaid(h).find((o) => o.due >= today);
  const until = next ? next.due : periodFrom + e - 1;
  let shifts = 0;
  const hired = job && scheduledAny(job) ? job : null;
  if (hired) for (let d = today; d <= until; d++) if (scheduled(hired, d)) shifts++;
  const wage = hired ? levelOf(hired).wage : 0;
  const expected = cents(wage * shifts);
  const assumption = hired ?`si fichas todos los turnos (${shifts} hasta el ${formatDateShort(until)}, ${euros(wage)} cada uno)` : 'sin contrato no hay sueldo previsto';
  const upcoming = unpaid(h).map((o) => ({ label: billOf(o).name, due: o.due, amount: cents(o.amount + o.fee), mate: o.mate ?? 0, you: total(o) }));

  const alternatives: string[] = [];
  const home = getHome(x.housing.home);
  if (home.mate && !active(x.roommate) && x.mateReady) alternatives.push(`Compartir piso con ${MATES[0].name}: desde el ordenador de casa (pagaría el ${Math.round(MATES[0].share * 100)} % del alquiler).`);
  if (!scheduledAny(job) && hireBlocker(JOBS[0], job, today) === null) alternatives.push(`Pedir trabajo en ${JOBS[0].employer}: allí mismo se firma el contrato.`);
  const overdue = unpaid(h).some((o) => o.due < today);
  const cheaper = HOMES.filter((o) => o.rent < home.rent && moveBlocker(x.housing, o.id, available, overdue) === null).sort((a, b) => a.rent - b.rent)[0];
  if (cheaper) alternatives.push(`Mudarte a ${cheaper.name} (${euros(cheaper.rent)} a la semana): se ofrece en su puerta.`);
  return { available, collected, expected, shifts, assumption, upcoming, alternatives };
}

/** Como la cabecera de Cuentas (ui/Phone.renderMoney): «−€87», con el menos tipográfico. */
const signed = (n: number): string => (n < 0 ? `−${euros(-n)}` : euros(n));

/** El texto de la previsión, para Cuentas y para el saldo insuficiente. */
export function outlookText(v: Outlook, today: number): string {
  const lines = [
    `Disponible: ${signed(v.available)} (cartera menos lo que debes).`,
    `Cobrado esta semana: ${euros(v.collected)}.`,
    `Previsto: ${euros(v.expected)}, ${v.assumption}. No cuenta como disponible hasta que lo cobres.`,
    ...v.upcoming.map((u) => `${u.label}: ${euros(u.amount)}${u.mate ? ` (${euros(u.mate)} los pone tu compañero)` : ''} → tu parte ${euros(u.you)}, ${u.due < today ? 'vencido' : `vence el ${formatDateShort(u.due)}`}.`),
    v.alternatives.length ? `Puedes: ${v.alternatives.join(' ')}` : '',
  ];
  return lines.filter(Boolean).join(' ');
}
