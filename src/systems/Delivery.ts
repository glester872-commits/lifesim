// VID-10 · reparto urbano a pie. Puro: sin Phaser, sin Math.random ni Date.now; imports .ts para los scripts de node.
// La custodia del paquete es Run.status === 'carrying' (única fuente): no hay ítem en la bolsa que pueda quedar huérfano.
import { DELIVERIES, getDelivery, getShift, SHIFTS, type DeliveryDef, type DeliveryEnd, type ShiftDef } from '../data/deliveries.ts';
import { REPUTATION_TRIGGERS } from '../data/reputation.ts';
import { TILE } from '../config/constants.ts';
import { isOpen, nextOpening, placeForInterior } from './Places.ts';
import { getLocation } from './LocationSystem.ts';
import { lendCompanyBike, type BikeState, type BikesState, type Spot } from './Cycling.ts';

export type RunStatus = 'accepted' | 'carrying';
/**
 * El plazo empieza al recoger: deadline = pickedAt + deadlineMin. Con turno (`shift`), `leg` es el tramo en curso (0..n-1)
 * y `defId` su DeliveryDef; el runId es el del turno entero (un resultado y un cobro).
 */
export interface Run { runId: string; defId: string; status: RunStatus; acceptedAt: number; pickedAt?: number; deadline?: number; shift?: string; leg?: number }
export type ResultStatus = 'delivered' | 'late' | 'expired' | 'cancelled';
/** `lateBy`: minutos pasados del plazo al resolverse; `rep`: lo que nota el barrio del destino (lo aplica GameState una vez). */
export interface Result { runId: string; defId: string; status: ResultStatus; pay: number; pct: number; at: number; lateBy: number; rep: number }
export interface DeliveryState { v: 1; active?: Run; last?: Result }
export type DeliveryOutcome = { ok: true; state: DeliveryState; result?: Result } | { ok: false; state: DeliveryState; reason: string };
/** Dónde estás y cuándo (minuto absoluto de juego, GameState.absMinute). */
export interface Here { location: string; catalog: string; abs: number }

export const emptyDelivery = (): DeliveryState => ({ v: 1 });
/** Lo que se dice al cancelar con el paquete encima: vuelve al servicio, nadie se queda con él. */
export const CANCEL_CARRYING_LINE = 'Avisas al servicio: pasan a recoger el paquete.';

const no = (state: DeliveryState, reason: string): DeliveryOutcome => ({ ok: false, state, reason });
const dayOf = (abs: number): number => Math.floor(abs / 1440) + 1;
const minOf = (abs: number): number => ((abs % 1440) + 1440) % 1440;

/** ¿El local de ese extremo atiende ahora? Sin horario (o sin lugar), sí. */
export function endOpen(end: DeliveryEnd, abs: number): boolean {
  const place = placeForInterior(end.location);
  const m = minOf(abs);
  return !place || isOpen(place, dayOf(abs), Math.floor(m / 60), m % 60);
}

/** Cerrado ahora y sin volver a abrir hoy: el encargo aceptado ya no se puede recoger hoy (se cancela sin coste). */
export function closedForToday(end: DeliveryEnd, abs: number): boolean {
  const place = placeForInterior(end.location);
  if (!place || endOpen(end, abs)) return false;
  const m = minOf(abs);
  const next = nextOpening(place, dayOf(abs), Math.floor(m / 60), m % 60);
  return !next || next.day > dayOf(abs);
}

const atEnd = (end: DeliveryEnd, here: Here): boolean => here.location === end.location && here.catalog === end.catalog;

const hourText = (h: number): string => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/** Cuándo vuelve a abrir, dicho para el motivo: «mañana desde las 7:00». */
function reopenText(end: DeliveryEnd, abs: number): string {
  const place = placeForInterior(end.location);
  const m = minOf(abs);
  const next = place && nextOpening(place, dayOf(abs), Math.floor(m / 60), m % 60);
  if (!next) return 'otro día';
  return `${next.day === dayOf(abs) + 1 ? 'mañana' : `el día ${next.day}`} desde las ${hourText(next.hour)}`;
}

/**
 * Por qué hoy ya no se puede hacer (o null): el origen ha cerrado y no reabre hoy, o el destino habrá cerrado sin
 * reabrir hoy al acabar el plazo contado desde que se puede recoger (ahora o, si el origen abre más tarde hoy, entonces).
 */
export function acceptBlocker(def: DeliveryDef, abs: number): string | null {
  if (closedForToday(def.from, abs)) return `Hoy ya no da tiempo: ${def.from.label} ha cerrado. Vuelve ${reopenText(def.from, abs)}.`;
  let start = abs;
  if (!endOpen(def.from, abs)) {
    const place = placeForInterior(def.from.location);
    const m = minOf(abs);
    const next = place && nextOpening(place, dayOf(abs), Math.floor(m / 60), m % 60);
    if (next) start = Math.max(abs, (next.day - 1) * 1440 + Math.round(next.hour * 60));
  }
  if (closedForToday(def.to, start + def.deadlineMin)) return `Hoy ya no da tiempo: ${def.to.label} cierra antes. Vuelve ${reopenText(def.to, start + def.deadlineMin)}.`;
  return null;
}

export function accept(state: DeliveryState, defId: string, abs: number): DeliveryOutcome {
  const def = getDelivery(defId);
  if (!def) return no(state, 'Ese encargo no existe.');
  if (state.active) return no(state, 'Ya llevas un encargo: termínalo o cancélalo antes.');
  const blocked = acceptBlocker(def, abs);
  if (blocked) return no(state, blocked);
  const runId = `${defId}:${dayOf(abs)}:${minOf(abs)}`;
  // Aceptar, cancelar y volver a aceptar el mismo minuto repetiría el runId (y su clave de pago y reputación).
  if (state.last?.runId === runId) return no(state, 'Acabas de dejarlo: vuelve a mirarlo dentro de un rato.');
  return { ok: true, state: { ...state, active: { runId, defId, status: 'accepted', acceptedAt: abs } } };
}

/**
 * Acepta un turno: se comprueba cada tramo con acceptBlocker como si empezara al acabar el plazo del anterior (estimación
 * holgada: los plazos son ≈1,6× lo andado). El Run empieza en el tramo 0, sin recoger.
 */
export function acceptShift(state: DeliveryState, shiftId: string, abs: number): DeliveryOutcome {
  const shift = getShift(shiftId);
  const defs = shift?.legs.map(getDelivery);
  if (!shift || !defs?.length || defs.some((d) => !d)) return no(state, 'Ese turno no existe.');
  if (state.active) return no(state, 'Ya llevas un encargo: termínalo o cancélalo antes.');
  let t = abs;
  for (const def of defs as DeliveryDef[]) {
    const blocked = acceptBlocker(def, t);
    if (blocked) return no(state, blocked);
    t += def.deadlineMin;
  }
  const runId = `${shiftId}:${dayOf(abs)}:${minOf(abs)}`;
  if (state.last?.runId === runId) return no(state, 'Acabas de dejarlo: vuelve a mirarlo dentro de un rato.');
  return { ok: true, state: { ...state, active: { runId, defId: shift.legs[0], status: 'accepted', acceptedAt: abs, shift: shift.id, leg: 0 } } };
}

/** El turno al que pertenece un runId (o undefined si es un encargo suelto). */
export const shiftOfRun = (runId: string): ShiftDef | undefined => SHIFTS.find((s) => runId.startsWith(`${s.id}:`));

export function pickUp(state: DeliveryState, here: Here): DeliveryOutcome {
  const run = state.active;
  const def = run && getDelivery(run.defId);
  if (!run || !def || run.status !== 'accepted') return no(state, 'No tienes nada que recoger.');
  if (!atEnd(def.from, here)) return no(state, `Se recoge en ${def.from.label}.`);
  if (!endOpen(def.from, here.abs)) return no(state, closedForToday(def.from, here.abs) ? `${def.from.label} ya ha cerrado por hoy: puedes cancelar el encargo sin coste.` : `${def.from.label} está cerrado ahora.`);
  return { ok: true, state: { ...state, active: { ...run, status: 'carrying', pickedAt: here.abs, deadline: here.abs + def.deadlineMin } } };
}

/** Lo que se paga entregando en `at` con ese plazo: a tiempo 100 %; tarde, lineal del 90 % a lateFloorPct en lateMin; luego 0. */
export function payout(def: DeliveryDef, deadline: number, at: number): { status: 'delivered' | 'late' | 'expired'; pct: number; pay: number; lateBy: number } {
  const lateBy = Math.max(0, at - deadline);
  if (lateBy === 0) return { status: 'delivered', pct: 100, pay: def.pay, lateBy };
  if (lateBy > def.lateMin) return { status: 'expired', pct: 0, pay: 0, lateBy };
  const pct = Math.round((90 - ((90 - def.lateFloorPct) * lateBy) / def.lateMin) * 100) / 100;
  return { status: 'late', pct, pay: Math.round(def.pay * pct) / 100, lateBy };
}

const repFor = (status: ResultStatus): number => (status === 'delivered' ? REPUTATION_TRIGGERS['delivery-done'].delta : status === 'late' ? 0 : REPUTATION_TRIGGERS['delivery-failed'].delta);
/** Resuelto: el encargo se archiva en `last` y `active` desaparece en el mismo estado nuevo. */
const resolved = (result: Result): DeliveryOutcome => ({ ok: true, state: { v: 1, last: result }, result });

/** Entrega en el mostrador de destino, abierto. Revalida todo aquí: estado, sitio, mostrador y horario. */
export function deliver(state: DeliveryState, here: Here): DeliveryOutcome {
  const run = state.active;
  const def = run && getDelivery(run.defId);
  if (!run || !def || run.status !== 'carrying' || run.deadline === undefined) return no(state, 'No llevas ningún paquete.');
  if (!atEnd(def.to, here)) return no(state, `Se entrega en ${def.to.label}.`);
  if (!endOpen(def.to, here.abs)) return no(state, `${def.to.label} está cerrado ahora.`);
  const p = payout(def, run.deadline, here.abs);
  const shift = run.shift ? getShift(run.shift) : undefined;
  // Turno, tramo no último y entregado (a tiempo o tarde dentro de lateMin): se avanza sin resultado ni pago. Si el
  // siguiente sale de este mismo mostrador, se recoge ya y su plazo empieza ahora. Vencido a mitad: se resuelve abajo, 0 €.
  if (shift && run.leg !== undefined && run.leg < shift.legs.length - 1 && p.status !== 'expired') {
    const nextId = shift.legs[run.leg + 1];
    const next = getDelivery(nextId)!;
    const base = { runId: run.runId, defId: nextId, acceptedAt: run.acceptedAt, shift: shift.id, leg: run.leg + 1 };
    const active: Run = atEnd(next.from, here)
      ? { ...base, status: 'carrying', pickedAt: here.abs, deadline: here.abs + next.deadlineMin }
      : { ...base, status: 'accepted' };
    return { ok: true, state: { ...state, active } };
  }
  // Último tramo de un turno: el pago fijo del turno con el porcentaje de tardanza de este tramo (la regla de payout).
  const pay = shift ? Math.round(shift.pay * p.pct) / 100 : p.pay;
  return resolved({ runId: run.runId, defId: run.defId, status: p.status, pay, pct: p.pct, at: here.abs, lateBy: p.lateBy, rep: repFor(p.status) });
}

/** Pasado deadline + lateMin con el paquete encima, vencido: sin pago y −1 en el barrio. Si no toca, ok:false y el mismo estado. */
export function expire(state: DeliveryState, abs: number): DeliveryOutcome {
  const run = state.active;
  const def = run && getDelivery(run.defId);
  if (!run || !def || run.status !== 'carrying' || run.deadline === undefined || abs <= run.deadline + def.lateMin) return no(state, 'Nada vencido.');
  return resolved({ runId: run.runId, defId: run.defId, status: 'expired', pay: 0, pct: 0, at: abs, lateBy: abs - run.deadline, rep: repFor('expired') });
}

/** Aceptado, sin coste; con el paquete encima, sin pago, −1 y el paquete vuelve al servicio (CANCEL_CARRYING_LINE). */
export function cancel(state: DeliveryState, abs: number): DeliveryOutcome {
  const run = state.active;
  if (!run) return no(state, 'No tienes ningún encargo.');
  const carrying = run.status === 'carrying';
  const lateBy = carrying && run.deadline !== undefined ? Math.max(0, abs - run.deadline) : 0;
  return resolved({ runId: run.runId, defId: run.defId, status: 'cancelled', pay: 0, pct: 0, at: abs, lateBy, rep: carrying ? REPUTATION_TRIGGERS['delivery-failed'].delta : 0 });
}

/** El encargo vivo cuyo mostrador es este, y qué toca hacer en él. */
export function counterTask(state: DeliveryState | undefined, location: string, catalog: string): { def: DeliveryDef; action: 'pickUp' | 'deliver' } | undefined {
  const run = state?.active;
  const def = run && getDelivery(run.defId);
  if (!run || !def) return undefined;
  const here = { location, catalog, abs: 0 };
  if (run.status === 'accepted' && atEnd(def.from, here)) return { def, action: 'pickUp' };
  if (run.status === 'carrying' && atEnd(def.to, here)) return { def, action: 'deliver' };
  return undefined;
}

/** HH:MM de un minuto absoluto. */
export const clockOf = (abs: number): string => `${String(Math.floor(minOf(abs) / 60)).padStart(2, '0')}:${String(minOf(abs) % 60).padStart(2, '0')}`;

/** Lo que toca ahora, en minúscula: «recoge en X» o «lleva el paquete a X antes de las HH:MM». Sin encargo, undefined. */
export function deliveryHint(state: DeliveryState | undefined): string | undefined {
  const run = state?.active;
  const def = run && getDelivery(run.defId);
  if (!run || !def) return undefined;
  const picking = run.status === 'accepted' || run.deadline === undefined;
  const shift = run.shift ? getShift(run.shift) : undefined;
  if (shift && run.leg !== undefined) {
    const where = (e: DeliveryEnd): string => (e.address ? `${e.label}, ${e.address}` : e.label);
    const n = `Entrega ${run.leg + 1}/${shift.legs.length}`;
    return picking ? `${n}: recoge en ${where(def.from)}` : `${n}: lleva el paquete a ${where(def.to)}, antes de las ${clockOf(run.deadline!)}`;
  }
  return picking ? `recoge en ${def.from.label}` : `lleva el paquete a ${def.to.label} antes de las ${clockOf(run.deadline!)}`;
}

// ---------------------------------------------------------------- bici de empresa (turno)

export const COMPANY_BIKE_ID = 'company-bike';
/** De carretera, del color del uniforme de reparto (data/npcs.ts 'uniforme-reparto'). */
export const COMPANY_BIKE = { frame: 'road', color: 0x1f9a8a } as const;

/** El sitio del bikePoint del turno, en px como un spawn (centro del tile, pie abajo). */
export function bikePointSpot(shift: ShiftDef): Spot | undefined {
  const pt = getLocation(shift.board).points?.[shift.bikePoint];
  return pt ? { location: shift.board, x: pt.tx * TILE + TILE / 2, y: pt.ty * TILE + TILE, facing: pt.facing ?? 'down' } : undefined;
}

const onShift = (d: DeliveryState | undefined): boolean => !!d?.active?.shift;
/** ponytail: con un solo turno basta; si hay varios con distinto bikePoint, guardar el turno en la bici. */
const bikeShift = (d: DeliveryState | undefined): ShiftDef =>
  (d?.active?.shift ? getShift(d.active.shift) : undefined) ?? (d?.last ? shiftOfRun(d.last.runId) : undefined) ?? SHIFTS[0];

/** Al aceptar el turno: la bici de empresa, aparcada en el bikePoint, salvo que tengas la tuya en esta ubicación. */
export function lendForShift(bikes: BikesState, shift: ShiftDef, here: string): BikesState {
  const spot = bikePointSpot(shift);
  if (!spot || bikes.list.some((b) => b.owner === 'player' && b.location === here)) return bikes;
  // Una de empresa que quedara aparcada de antes vuelve al punto (mismo id): no hay dos.
  const rest: BikesState = { v: 1, list: bikes.list.filter((b) => !(b.id === COMPANY_BIKE_ID && b.status === 'parked')) };
  return lendCompanyBike(rest, COMPANY_BIKE_ID, spot, COMPANY_BIKE.frame, COMPANY_BIKE.color);
}

/** Sin turno activo la bici de empresa ya no se monta. null si se puede (o si no es de empresa). */
export function companyBikeBlocker(bike: BikeState, d: DeliveryState | undefined): string | null {
  if (bike.owner !== 'company' || onShift(d)) return null;
  return `El turno ha terminado: devuelve la bici en el tablón de ${getLocation(bikeShift(d).board).name}.`;
}

/** Aparcada (recién bajado) a ≤1 tile del bikePoint y sin turno activo: se devuelve (returnCompanyBike). */
export function returnsCompanyBike(bike: BikeState, d: DeliveryState | undefined): boolean {
  if (bike.owner !== 'company' || bike.status !== 'parked' || onShift(d)) return false;
  const spot = bikePointSpot(bikeShift(d));
  if (!spot || spot.location !== bike.location) return false;
  const tile = (x: number, y: number): [number, number] => [Math.floor(x / TILE), Math.floor((y - 1) / TILE)];
  const [ax, ay] = tile(bike.x, bike.y);
  const [bx, by] = tile(spot.x, spot.y);
  return Math.abs(ax - bx) <= 1 && Math.abs(ay - by) <= 1;
}

/**
 * Al terminar el turno (o al entrar en una ubicación sin turno), el servicio recoge la bici de empresa que esté aparcada:
 * si no, la del último tramo se quedaría para siempre en la puerta del local. La que vas montando no se toca: sigues
 * pedaleando y se devuelve al bajarte junto al bikePoint (returnsCompanyBike); si te bajas lejos ya no se monta y el
 * servicio la recoge la próxima vez que se llame (al cambiar de ubicación). Mismo objeto si no cambia nada.
 */
export function collectCompanyBikes(bikes: BikesState, d: DeliveryState | undefined): BikesState {
  if (onShift(d) || !bikes.list.some((b) => b.owner === 'company' && b.status === 'parked')) return bikes;
  return { v: 1, list: bikes.list.filter((b) => !(b.owner === 'company' && b.status === 'parked')) };
}

// ---------------------------------------------------------------- guardado

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isMin = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const RESULTS: readonly ResultStatus[] = ['delivered', 'late', 'expired', 'cancelled'];
const known = new Set(DELIVERIES.map((d) => d.id));

function parseRun(v: unknown): Run | undefined {
  if (!isRecord(v) || !str(v.runId) || !str(v.defId) || !known.has(v.defId) || !isMin(v.acceptedAt)) return undefined;
  // Turno: sólo si existe, el tramo está en 0..n-1 y es este defId; si no, se descartan esos dos campos (encargo suelto).
  const sh = str(v.shift) ? getShift(v.shift) : undefined;
  const leg = v.leg;
  const inShift = sh && typeof leg === 'number' && Number.isInteger(leg) && leg >= 0 && leg < sh.legs.length && sh.legs[leg] === v.defId;
  const base = { runId: v.runId, defId: v.defId, acceptedAt: v.acceptedAt, ...(inShift ? { shift: sh!.id, leg: leg as number } : {}) };
  if (v.status === 'accepted') return { ...base, status: 'accepted' };
  // El plazo se rehace desde la recogida: recargar no lo reinicia ni lo estira.
  if (v.status === 'carrying' && isMin(v.pickedAt)) return { ...base, status: 'carrying', pickedAt: v.pickedAt, deadline: v.pickedAt + getDelivery(v.defId)!.deadlineMin };
  return undefined;
}

function parseResult(v: unknown): Result | undefined {
  if (!isRecord(v) || !str(v.runId) || !str(v.defId) || !known.has(v.defId) || !RESULTS.includes(v.status as ResultStatus)) return undefined;
  if (!fin(v.pay) || v.pay < 0 || !fin(v.pct) || v.pct < 0 || v.pct > 100 || !isMin(v.at)) return undefined;
  const rep = v.rep === 1 || v.rep === -1 ? v.rep : 0;
  return { runId: v.runId, defId: v.defId, status: v.status as ResultStatus, pay: v.pay, pct: v.pct, at: v.at, lateBy: isMin(v.lateBy) ? v.lateBy : 0, rep };
}

/** Lo mal formado o con un encargo desconocido se descarta; como mucho un activo. Basura: vacío. */
export function parseDelivery(v: unknown): DeliveryState {
  if (!isRecord(v)) return emptyDelivery();
  const active = parseRun(v.active);
  const last = parseResult(v.last);
  return { v: 1, ...(active ? { active } : {}), ...(last ? { last } : {}) };
}
