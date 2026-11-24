// Sin Phaser: lo usan scenes/Menus, main.ts, state/GameState, systems/SaveSystem y scripts/check-hospital.ts.
import { HOSPITAL_CALL_MINUTES, HOSPITAL_PLACE, HOSPITAL_VISIT_MINUTES } from '../data/hospital.ts';
import type { HospitalState, HospitalTicket } from '../types/game.ts';
import { isOpen, placeInfo } from './Places.ts';

/**
 * HOSP-01 · El turno de consulta del Hospital General de Vallesco. Se pide en Admisión; a los HOSPITAL_CALL_MINUTES te
 * llaman (un aviso, una vez); en la Consulta 1 se atiende sólo un turno llamado, una consulta por día. Es una revisión:
 * no cobra, no gasta energía y no cura nada (el juego no tiene salud todavía), sólo queda registrada. Si el hospital
 * cierra con el turno pendiente, se cancela.
 *
 * Todo con el minuto absoluto del reloj ((día - 1) · 1440 + minuto del día). Funciones puras: devuelven el estado nuevo.
 */

const DAY = 1440;

export const emptyHospital = (): HospitalState => ({ ticket: null });

const STATUSES: ReadonlySet<string> = new Set(['waiting', 'called', 'done', 'cancelled']);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Lo guardado, tolerante: sin registro, dañado o de una versión anterior, se lee como «sin turno». */
export function parseHospital(v: unknown): HospitalState | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const raw = v as { ticket?: unknown; lastVisitDay?: unknown };
  const t = raw.ticket as Partial<HospitalTicket> | null | undefined;
  const ticket: HospitalTicket | null = t && typeof t === 'object' && isInt(t.id) && isInt(t.day) && isInt(t.issuedAt) && typeof t.status === 'string' && STATUSES.has(t.status)
    ? { id: Math.floor(t.id), day: Math.floor(t.day), issuedAt: Math.floor(t.issuedAt), status: t.status }
    : null;
  return { ticket, ...(isInt(raw.lastVisitDay) ? { lastVisitDay: Math.floor(raw.lastVisitDay) } : {}) };
}

const dayOf = (now: number): number => Math.floor(now / DAY) + 1;
// El predicado nombra sólo los turnos pendientes: un turno atendido o cancelado sigue siendo un HospitalTicket.
type PendingTicket = HospitalTicket & { status: 'waiting' | 'called' };
const pending = (t: HospitalTicket | null): t is PendingTicket =>!!t && (t.status === 'waiting' || t.status === 'called');

/** Si el hospital atiende a esta hora (data/places.ts 'hospital'). */
export function hospitalOpen(now: number): boolean {
  const place = placeInfo(HOSPITAL_PLACE);
  if (!place) return false;
  const m = ((now % DAY) + DAY) % DAY;
  return isOpen(place, dayOf(now), Math.floor(m / 60), m % 60);
}

export type HospitalResult = { ok: true; state: HospitalState; message: string } | { ok: false; state: HospitalState; message: string };

/** Pedir turno: uno pendiente a la vez y, si ya pasaste consulta hoy, hasta mañana nada. */
export function requestTurn(s: HospitalState, now: number): HospitalResult {
  if (pending(s.ticket)) return { ok: false, state: s, message: `Ya tiene turno: el número ${s.ticket.id}. ${statusLine(s, now)}` };
  if (s.lastVisitDay === dayOf(now)) return { ok: false, state: s, message: 'Hoy ya ha pasado consulta. Si algo cambia, vuelva mañana.' };
  if (!hospitalOpen(now)) return { ok: false, state: s, message: 'Las consultas están cerradas: de 8:00 a 21:00.' };
  const id = ((s.ticket?.id ?? 0) % 99) + 1;
  const ticket: HospitalTicket = { id, day: dayOf(now), issuedAt: now, status: 'waiting' };
  return { ok: true, state: { ...s, ticket }, message: `Su turno es el ${id}. Le llamamos a la Consulta 1 en unos ${HOSPITAL_CALL_MINUTES} minutos; espere en la sala.` };
}

/** Cómo va el turno, en una frase. */
export function statusLine(s: HospitalState, now: number): string {
  const t = s.ticket;
  if (!t) return 'No tiene turno.';
  if (t.status === 'waiting') {
    const left = Math.max(1, t.issuedAt + HOSPITAL_CALL_MINUTES - now);
    return `Turno ${t.id}: en espera. Le llamarán en unos ${left} minutos.`;
  }
  if (t.status === 'called') return `Turno ${t.id}: le están llamando. Pase a la Consulta 1, al fondo a la izquierda.`;
  if (t.status === 'done') return `Turno ${t.id}: atendido.`;
  return `Turno ${t.id}: cancelado.`;
}

export const turnStatus = (s: HospitalState): HospitalTicket['status'] | 'none' => s.ticket?.status ?? 'none';

export interface HospitalTick {
  state: HospitalState;
  changed: boolean;
  /** Lo que avisar (una vez): el turno llamado o cancelado por el cierre. */
  notice?: string;
}

/**
 * Lo que pasa con el reloj: a su hora, el turno en espera pasa a llamado (y se avisa una sola vez: después ya no está
 * en espera); con el hospital cerrado, el turno pendiente se cancela. Repetirlo con el mismo minuto no cambia nada.
 */
export function tick(s: HospitalState, now: number, open = hospitalOpen(now)): HospitalTick {
  const t = s.ticket;
  if (!pending(t)) return { state: s, changed: false };
  if (!open) {
    return { state: { ...s, ticket: { ...t, status: 'cancelled' } }, changed: true, notice: `El hospital ha cerrado las consultas: el turno ${t.id} queda cancelado. Mañana, desde las 8:00, puede pedir otro.` };
  }
  if (t.status === 'waiting' && now >= t.issuedAt + HOSPITAL_CALL_MINUTES) {
    return { state: { ...s, ticket: { ...t, status: 'called' } }, changed: true, notice: `Turno ${t.id}: le llaman a la Consulta 1 del Hospital General. Pase cuando pueda.` };
  }
  return { state: s, changed: false };
}

/** Cancelar en Admisión: libera el turno y deja pedir otro. */
export function cancelTurn(s: HospitalState): HospitalResult {
  if (!pending(s.ticket)) return { ok: false, state: s, message: 'No tiene ningún turno pendiente.' };
  return { ok: true, state: { ...s, ticket: { ...s.ticket, status: 'cancelled' } }, message: `Turno ${s.ticket.id} cancelado. Si lo necesita, pida otro.` };
}

/**
 * La consulta: sólo con el turno llamado. Dura HOSPITAL_VISIT_MINUTES (el reloj lo adelanta quien llama, como las
 * actividades), marca el turno atendido y el día. No cobra, no cansa y no cura: es una revisión.
 */
export function attend(s: HospitalState, now: number): HospitalResult & { minutes: number } {
  const t = s.ticket;
  if (!t || t.status !== 'called') {
    const why = !t || t.status === 'done' || t.status === 'cancelled'
      ? 'Sin turno no puedo atenderle. Pídalo en Admisión, a la entrada, y le llamamos.'
      : 'Aún no es su turno. Espere en la sala: le llamarán.';
    return { ok: false, state: s, message: why, minutes: 0 };
  }
  return { ok: true, state: { ticket: { ...t, status: 'done' }, lastVisitDay: dayOf(now) }, message: 'Todo en orden; si algo cambia, vuelva.', minutes: HOSPITAL_VISIT_MINUTES };
}
