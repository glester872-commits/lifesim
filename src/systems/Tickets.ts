// Sin Phaser: lo usan WorldScene (la puerta y la grada), Menus (la taquilla), SaveSystem y scripts/check-stadium.ts.
import { VENUES, type VenueDef } from '../data/stadium.ts';
import { formatDate } from './Calendar.ts';
import { euros } from './Commerce.ts';
import { kickoffLabel, matchOn, upcomingMatches, type Match } from './Match.ts';
import { hashSeed, seededRng } from './MetroDaily.ts';

/**
 * Entradas para un recinto con partido (data/stadium.ts VENUES). Funciones puras sobre el dinero y las entradas del
 * jugador: devuelven lo nuevo y quien llama lo aplica de una vez (GameState) y guarda.
 *
 * Cada partido tiene su id estable (`<recinto>:<día>`), sacado del calendario de partidos (systems/Match): misma
 * semilla, mismo partido, mismo id. Una entrada es de ese partido y lleva su asiento.
 *
 * Política de acceso (una sola, para la puerta, la carga de partida y la grada):
 *   - La taquilla vende el partido de hoy o el próximo (hasta `horizon` días vista), de `sales[0]` a `sales[1]`; el
 *     día de partido, hasta el último acceso. Una entrada por partido; el asiento se aparta al vender.
 *   - Las puertas abren `doors` minutos antes del saque y se entra hasta `lastEntry` (el final del partido): se
 *     puede llegar tarde. Se sale y se vuelve a entrar con la misma entrada en ese plazo, sin pagar otra vez.
 *   - Una entrada de otro partido, caducada o ninguna: no se pasa, y se dice por qué.
 *   - Dentro se puede estar hasta `closes`; quien carga una partida dentro sin derecho a estar sale a `exit`.
 *   - El asiento de la entrada es suyo hasta `closes`: la gente de la grada no lo coge.
 */

export interface Ticket {
  fixture: string;
  venue: string;
  day: number;
  /** Minuto del día del saque. */
  kickoff: number;
  rival: string;
  sector: string;
  row: number;
  seat: number;
  /** Punto del asiento (data/stadium.ts STADIUM_SEATS). */
  point: string;
  price: number;
  /** Ya ha pasado por la puerta alguna vez: volver a entrar es volver, no un acceso nuevo. */
  admitted: boolean;
}

export interface Clock {
  day: number;
  hour: number;
  minute: number;
}

export interface Fixture extends Match {
  id: string;
  /** Minutos absolutos (desde el día 1 a las 00:00) de la apertura de puertas, el último acceso y el cierre. */
  doors: number;
  lastEntry: number;
  closes: number;
}

const DAY = 1440;
const absOf = (c: Clock): number => (c.day - 1) * DAY + c.hour * 60 + c.minute;
const clockLabel = (abs: number): string => kickoffLabel(((abs % DAY) + DAY) % DAY);

export const fixtureId = (venue: VenueDef, day: number): string => `${venue.id}:${day}`;

export function fixtureOf(venue: VenueDef, m: Match): Fixture {
  const kick = (m.day - 1) * DAY + m.kickoff;
  return { ...m, id: fixtureId(venue, m.day), doors: kick + venue.doors, lastEntry: kick + venue.lastEntry, closes: kick + venue.closes };
}

/** El partido que se vende ahora: el de hoy (o el de ayer, si aún no ha acabado su plazo de entrada) o el próximo. */
export function nextFixture(venue: VenueDef, c: Clock): Fixture | null {
  const now = absOf(c);
  for (const m of upcomingMatches(c.day - 1, venue.horizon + 1)) {
    const f = fixtureOf(venue, m);
    if (now < f.lastEntry) return f;
  }
  return null;
}

/** El partido de ahora en el estadio: el de hoy o el de anoche, mientras el estadio no haya cerrado. */
function fixtureAround(venue: VenueDef, c: Clock): Fixture | null {
  const now = absOf(c);
  for (const day of [c.day, c.day - 1]) {
    const m = matchOn(day);
    if (!m) continue;
    const f = fixtureOf(venue, m);
    if (now < f.closes) return f;
  }
  return null;
}

/** Entradas vendidas antes que la del jugador: por semilla del partido, entre la mitad y casi todo el aforo. */
export function soldBefore(venue: VenueDef, f: Fixture): number {
  const rng = seededRng(hashSeed('tickets', f.id));
  return Math.min(venue.capacity, Math.floor(venue.capacity * (0.5 + 0.48 * rng())));
}

/** «hoy», «mañana» o «el sábado, 15 de mayo». */
export function dayWord(day: number, today: number): string {
  if (day === today) return 'hoy';
  if (day === today + 1) return 'mañana';
  return `el ${formatDate(day, false)}`;
}

export const ticketOf = (tickets: readonly Ticket[], fixture: string): Ticket | undefined => tickets.find((t) => t.fixture === fixture);

/** Lo que dice la taquilla ahora. */
export type Offer =
  | { kind: 'none' }
  | { kind: 'owned'; fixture: Fixture; ticket: Ticket }
  | { kind: 'closed'; fixture: Fixture; opens: string }
  | { kind: 'sold-out'; fixture: Fixture }
  | { kind: 'on-sale'; fixture: Fixture; row: number; seat: number; point: string; price: number; left: number };

function salesOpen(venue: VenueDef, f: Fixture, c: Clock): boolean {
  const now = absOf(c);
  const today = (c.day - 1) * DAY;
  const close = Math.max(today + venue.sales[1] * 60, f.day === c.day ? f.lastEntry : 0);
  return now >= today + venue.sales[0] * 60 && now < close;
}

export function offer(venue: VenueDef, tickets: readonly Ticket[], c: Clock): Offer {
  const f = nextFixture(venue, c);
  if (!f) return { kind: 'none' };
  const own = ticketOf(tickets, f.id);
  if (own) return { kind: 'owned', fixture: f, ticket: own };
  if (!salesOpen(venue, f, c)) {
    const early = c.hour * 60 + c.minute < venue.sales[0] * 60;
    return { kind: 'closed', fixture: f, opens: `${early ? 'hoy' : 'mañana'} a las ${kickoffLabel(venue.sales[0] * 60)}` };
  }
  const sold = soldBefore(venue, f);
  if (sold >= venue.capacity) return { kind: 'sold-out', fixture: f };
  const s = venue.seats[sold];
  return { kind: 'on-sale', fixture: f, row: s.row, seat: s.number, point: s.point, price: venue.price, left: venue.capacity - sold };
}

export interface Purchase {
  ok: boolean;
  money: number;
  tickets: Ticket[];
  ticket?: Ticket;
  message: string;
}

/**
 * Compra: todo o nada. O se cobra y se emite la entrada en el mismo resultado, o no cambia nada. Una segunda compra
 * del mismo partido no cobra (ya la tiene); sin dinero, tampoco. Las entradas de hace más de una semana se tiran al
 * comprar.
 */
export function buyTicket(venue: VenueDef, money: number, tickets: readonly Ticket[], c: Clock): Purchase {
  const o = offer(venue, tickets, c);
  const keep = { ok: false, money, tickets: [...tickets] };
  if (o.kind === 'none') return { ...keep, message: 'No hay ningún partido a la venta.' };
  if (o.kind === 'owned') return { ...keep, message: `Ya tienes entrada para este partido: fila ${o.ticket.row}, asiento ${o.ticket.seat}.` };
  if (o.kind === 'closed') return { ...keep, message: `La taquilla está cerrada. Abre ${o.opens}.` };
  if (o.kind === 'sold-out') return { ...keep, message: 'Entradas agotadas para este partido.' };
  if (money + 1e-9 < o.price) return { ...keep, message: `No te llega: cuesta ${euros(o.price)}.` };
  const f = o.fixture;
  const ticket: Ticket = {
    fixture: f.id, venue: venue.id, day: f.day, kickoff: f.kickoff, rival: f.rival,
    sector: venue.sector, row: o.row, seat: o.seat, point: o.point, price: o.price, admitted: false,
  };
  return {
    ok: true,
    money: Math.round((money - o.price) * 100) / 100,
    tickets: [...tickets.filter((t) => t.day >= c.day - 7), ticket],
    ticket,
    message: `Entrada comprada: ${venue.sector}, fila ${ticket.row}, asiento ${ticket.seat}. ${euros(o.price)}.`,
  };
}

export type Admission =
  | { ok: true; ticket: Ticket; tickets: Ticket[]; again: boolean; lines: string[] }
  | { ok: false; lines: string[] };

/** La puerta: si se pasa con lo que lleva y, si no, por qué. Al pasar, la entrada queda marcada como usada. */
export function admit(venue: VenueDef, tickets: readonly Ticket[], c: Clock): Admission {
  const now = absOf(c);
  const f = fixtureAround(venue, c);
  const next = nextFixture(venue, c);
  const mine = (fx: Fixture | null): Ticket | undefined => (fx ? ticketOf(tickets, fx.id) : undefined);
  if (!f) {
    // Hoy hubo partido y el estadio ya ha cerrado: se dice así, no «hoy no hay partido».
    if (matchOn(c.day)) return { ok: false, lines: ['El partido de hoy ya ha terminado y el estadio está cerrado.'] };
    const t = mine(next);
    if (t) return { ok: false, lines: [`Hoy no se juega aquí. Tu entrada es para ${dayWord(t.day, c.day)} a las ${kickoffLabel(t.kickoff)}.`] };
    const when = next ? `El próximo partido es ${dayWord(next.day, c.day)} a las ${kickoffLabel(next.kickoff)} contra ${next.rival}.` : 'No hay partidos programados esta semana.';
    return { ok: false, lines: [`Hoy no hay partido: la puerta está cerrada. ${when}`] };
  }
  if (now < f.doors) {
    const t = mine(f);
    return { ok: false, lines: [`Las puertas abren a las ${clockLabel(f.doors)}; el saque es a las ${kickoffLabel(f.kickoff)}.${t ? ' Tu entrada vale: vuelve entonces.' : ''}`] };
  }
  if (now >= f.lastEntry) return { ok: false, lines: ['El partido ha terminado: ya no se entra.'] };
  const ticket = mine(f);
  if (!ticket) {
    const other = tickets.find((t) => t.venue === venue.id);
    if (other) return { ok: false, lines: [`Esta entrada es del partido contra ${other.rival} (${formatDate(other.day, false)}). Hoy se juega contra ${f.rival}.`] };
    return { ok: false, lines: ['Sin entrada no se pasa.', 'Las taquillas están al este de la explanada.'] };
  }
  const again = ticket.admitted;
  const used: Ticket = { ...ticket, admitted: true };
  return {
    ok: true,
    ticket: used,
    tickets: tickets.map((t) => (t.fixture === f.id ? used : t)),
    again,
    lines: [again ? 'Vuelves a pasar con la misma entrada.' : `Entrada validada. ${ticket.sector}, fila ${ticket.row}, asiento ${ticket.seat}: se sube por la escalera del centro.`],
  };
}

/** Si quien está dentro tiene derecho a estar: una entrada ya usada de un partido con las puertas abiertas y sin cerrar. */
export function mayStay(venue: VenueDef, tickets: readonly Ticket[], c: Clock): boolean {
  const f = fixtureAround(venue, c);
  const t = f ? ticketOf(tickets, f.id) : undefined;
  return !!f && !!t?.admitted && absOf(c) >= f.doors;
}

/** El asiento apartado para el jugador en ese recinto ahora: el de su entrada de un partido que aún no ha cerrado. */
export function heldSeat(venue: VenueDef, tickets: readonly Ticket[], c: Clock): string | undefined {
  const now = absOf(c);
  return tickets.find((t) => t.venue === venue.id && now < (t.day - 1) * DAY + t.kickoff + venue.closes)?.point;
}

export const venueOf = (id: string | undefined): VenueDef | undefined => (id ? VENUES[id] : undefined);

/** El partido en una línea, como lo cuenta la taquilla: rival, cuándo, puertas, hasta cuándo se entra y por dónde. */
export const fixtureLine = (venue: VenueDef, f: Fixture, today: number): string =>
  `${venue.home} – ${f.rival}: ${dayWord(f.day, today)} a las ${kickoffLabel(f.kickoff)}. Puertas a las ${clockLabel(f.doors)}; se puede entrar hasta las ${clockLabel(f.lastEntry)}, el final del partido. Entrada por la ${venue.gate}.`;

/** La entrada en una línea: dónde y cuándo. */
export const ticketLine = (t: Ticket, today: number): string =>
  `${t.sector}, fila ${t.row}, asiento ${t.seat}: ${dayWord(t.day, today)} a las ${kickoffLabel(t.kickoff)} contra ${t.rival}.`;

/** Lo guardado, sin fiarse: una partida antigua no tiene entradas; una entrada mal formada o repetida se descarta. */
export function parseTickets(v: unknown): Ticket[] {
  if (!Array.isArray(v)) return [];
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  const str = (x: unknown): x is string => typeof x === 'string';
  const out: Ticket[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const t = raw as Record<string, unknown>;
    const venue = str(t.venue) ? VENUES[t.venue] : undefined;
    if (!venue || !num(t.day) || !str(t.fixture) || t.fixture !== fixtureId(venue, t.day)) continue;
    const seat = venue.seats.find((s) => s.point === t.point);
    if (!seat || !num(t.kickoff) || !str(t.rival) || !num(t.price)) continue;
    if (out.some((o) => o.fixture === t.fixture)) continue;
    out.push({ fixture: t.fixture, venue: venue.id, day: t.day, kickoff: t.kickoff, rival: t.rival, sector: venue.sector, row: seat.row, seat: seat.number, point: seat.point, price: t.price, admitted: t.admitted === true });
  }
  return out;
}
