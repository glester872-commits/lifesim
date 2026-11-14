// Sin Phaser: lo usan main.ts (aviso y HUD), ui/Phone (la app Hoy) y scripts/check-agenda.ts.
import { TILE } from '../config/constants.ts';
import { AGENDA } from '../config/agenda.ts';
import { HOUR_BANDS } from '../config/metro.ts';
import { getJob } from '../data/jobs.ts';
import { BILLS } from '../data/household.ts';
import { COURSES, getGig, getSkill } from '../data/study.ts';
import { STORIES } from '../data/saraStory.ts';
import { LINES, STOPS, type TransitStop } from '../data/transit.ts';
import { getNpc } from '../data/npcs.ts';
import { GATHERINGS, attendedTo, nextOccurrence, occurrenceOn, type ParishState } from './Parish.ts';
import type { TilePoint } from '../types/game.ts';
import { allLocations, getLocation, hasLocation } from './LocationSystem.ts';
import { findPoint, tilePath } from './Navigation.ts';
import { placeInfo } from './Places.ts';
import { travel } from './World.ts';
import { destinationsFrom, journeyFare, routeBetween, serviceOpen, stopAtStation, type MetroJourney } from './Transit.ts';
import { WEEKDAY_LABEL, weekdayOf, weekIndex } from './Calendar.ts';
import { levelOf, nextShift, settle, type JobProgress } from './Jobs.ts';
import { lessonStatus, nextSession, gigStatus, knowledge, levelName, type StudyState } from './Study.ts';
import { goalById, goalView, unpaid, total, type HouseholdState } from './Household.ts';
import { PLAN_KINDS, placeName, planStart, type PhoneState } from './Phone.ts';
import type { StoryState } from './Story.ts';
import type { SocialState } from './Social.ts';
import type { Ticket } from './Tickets.ts';
import { buildOf, bodyLine, type Fitness } from './Fitness.ts';

/**
 * La agenda: lo próximo que el jugador tiene que hacer y dónde. No es una lista nueva de planes: se lee cada vez
 * de donde ya vive cada cosa (el contrato de systems/Jobs, el curso y el encargo de systems/Study, las cuentas de
 * systems/Household, los planes del móvil de systems/Phone, las quedadas de systems/Story y las entradas de
 * systems/Tickets), con el reloj de ahora. Lo único que se guarda es lo ya avisado (AgendaState), para que un
 * aviso salga una vez aunque se recargue o un salto de reloj (dormir, trabajar) se lo pase de largo.
 *
 * Todo en minutos absolutos: (día - 1) · 1440 + minuto del día, como systems/Phone y systems/Characters.
 */

const DAY = 1440;
const at = (day: number, hour: number, minute = 0): number => (day - 1) * DAY + hour * 60 + minute;
const two = (n: number): string => String(n).padStart(2, '0');
const hhmm = (abs: number): string => `${two(Math.floor((((abs % DAY) + DAY) % DAY) / 60))}:${two(((abs % 60) + 60) % 60)}`;
const dayOfAbs = (abs: number): number => Math.floor(abs / DAY) + 1;

// ================================================================
// ESTADO (se guarda con la partida)
// ================================================================

export type TourStatus = 'new' | 'done' | 'skipped';

export interface AgendaState {
  /** La guía del principio: 'new' en una partida nueva; una partida de antes ya sabe moverse ('done'). */
  tour: TourStatus;
  /** Aviso hecho → minuto absoluto en que se dio. Se olvidan a los pocos días. */
  seen: Record<string, number>;
  /** Hasta qué minuto están revisados los compromisos perdidos: un salto de reloj se revisa entero, una vez. */
  checked: number;
  /** Última señal de progreso de cada cosa (trabajo, curso, meta, cuerpo, recuerdo): sólo se avisa al cambiar. */
  marks: Record<string, string>;
}

/** Partida nueva: con guía y nada avisado. `checked` y `marks` se ponen al día en la primera revisión, sin avisar. */
export const startAgenda = (): AgendaState => ({ tour: 'new', seen: {}, checked: -1, marks: {} });

/** Lo guardado; una partida anterior a la agenda no ve la guía ni recibe avisos de lo que ya pasó. */
export function parseAgenda(v: unknown): AgendaState {
  if (typeof v !== 'object' || v === null) return { tour: 'done', seen: {}, checked: -1, marks: {} };
  const o = v as Record<string, unknown>;
  const tour: TourStatus = o.tour === 'new' || o.tour === 'skipped' ? o.tour : 'done';
  const seen: Record<string, number> = {};
  if (typeof o.seen === 'object' && o.seen !== null) {
    for (const [k, n] of Object.entries(o.seen)) if (typeof n === 'number' && Number.isFinite(n)) seen[k] = n;
  }
  const marks: Record<string, string> = {};
  if (typeof o.marks === 'object' && o.marks !== null) {
    for (const [k, s] of Object.entries(o.marks)) if (typeof s === 'string') marks[k] = s;
  }
  const checked = typeof o.checked === 'number' && Number.isFinite(o.checked) ? Math.floor(o.checked) : -1;
  return { tour, seen, checked, marks };
}

// ================================================================
// COMPROMISOS
// ================================================================

/** A dónde hay que ir: un tile de un mapa, una parada sin mapa (Decathlon) o ningún sitio (se hace desde el móvil). */
export type Where =
  | { name: string; location: string; tile: TilePoint }
  | { name: string; stop: string }
  | null;

export type CommitmentKind = 'job' | 'class' | 'gig' | 'bill' | 'plan' | 'visit' | 'match' | 'gathering';

export interface Commitment {
  /** Estable entre recargas: con él se recuerda qué se ha avisado. */
  key: string;
  kind: CommitmentKind;
  title: string;
  /** Cuándo hay que estar (o, en un plazo, cuándo vence). */
  start: number;
  /** A partir de aquí ya no vale llegar. */
  close: number;
  where: Where;
  /** Un plazo (pagar, entregar) se cumple cualquier rato antes de `start`; lo demás tiene hora. */
  deadline?: true;
}

export interface AgendaInput {
  now: number;
  job: JobProgress | null;
  study: StudyState;
  household: HouseholdState;
  phone: PhoneState;
  stories: StoryState;
  tickets: readonly Ticket[];
  parish?: ParishState;
}

const pointWhere = (name: string, id: string): Where => {
  const p = findPoint(id);
  return p ? { name, location: p.location, tile: { tx: p.tx, ty: p.ty } } : null;
};

/** El sitio de un curso, una práctica o un encargo (data/study.ts): la puerta de un edificio o un rincón del mapa. */
function studyWhere(name: string, site: string): Where {
  for (const loc of allLocations()) {
    const b = loc.buildings?.find((x) => x.study === site);
    if (b?.point) return pointWhere(name, b.point);
    const s = loc.spots?.find((x) => x.study === site);
    if (s) return { name, location: loc.id, tile: { tx: s.tx, ty: s.ty } };
  }
  return null;
}

const nameOf = (npc: string): string => {
  try {
    return getNpc(npc).name;
  } catch {
    return npc;
  }
};

const capital = (s: string): string => `${s[0].toUpperCase()}${s.slice(1)}`;

/** Todo lo pendiente desde ahora, por orden de hora. Lo que ya no se puede cumplir no sale. */
export function commitments(input: AgendaInput): Commitment[] {
  const { now } = input;
  const out: Commitment[] = [];

  // Turno: el próximo que aún se puede hacer (systems/Jobs.nextShift, con las faltas puestas al día).
  const job = input.job && settle(input.job, now).progress;
  const shift = job && nextShift(job, now);
  if (job && shift) {
    const def = getJob(job.job);
    const start = at(shift.day, levelOf(job).start);
    // Al fichaje de su lugar de trabajo (data/decathlon.ts): se estima como cualquier interior, hasta su puerta de calle.
    const desk = allLocations().find((l) => l.workplace === def.id);
    const spot = desk?.spots?.find((s) => s.job === def.id);
    out.push({
      key: `job:${shift.day}`, kind: 'job', title: `Turno en ${def.employer.split(' ')[0]}`, start, close: start + def.late,
      where: desk && spot ? { name: desk.name, location: desk.id, tile: { tx: spot.tx, ty: spot.ty } } : null,
    });
  }

  // Curso: la próxima clase o tutoría; luego, el encargo con su plazo.
  const p = input.study.course;
  const course = p && COURSES.find((c) => c.id === p.id);
  if (p && course && p.attended.length < course.lessons.length) {
    const s = nextSession(course, p, now);
    if (s) {
      const start = at(s.day, s.hour);
      const title = s.kind === 'class' ? `Clase ${s.lesson + 1} · ${course.lessons[s.lesson].title}` : `Tutoría · ${course.lessons[s.lesson].title}`;
      out.push({ key: `class:${course.id}:${s.kind}:${s.day}`, kind: 'class', title, start, close: start + course.grace, where: studyWhere('Centro de estudios', course.desk) });
    }
  }
  const gp = input.study.gig;
  if (gp && gp.deadline !== undefined && gigStatus(getGig(gp.id), input.study, now) === 'active') {
    const g = getGig(gp.id);
    const end = at(gp.deadline, g.hours[1]);
    out.push({ key: `gig:${gp.id}`, kind: 'gig', title: `Entregar · ${g.client.split(',')[0]}`, start: end, close: end, where: studyWhere(g.place, g.site), deadline: true });
  }

  // Cuentas: lo que vence, pagadero desde el móvil (sin viaje). Vence al acabar su día.
  for (const o of unpaid(input.household)) {
    const end = at(o.due, 23, 59);
    if (end < now) continue;
    const bill = BILLS.find((b) => b.id === o.bill);
    out.push({ key: `bill:${o.bill}:${o.period}`, kind: 'bill', title: `Pagar ${bill?.name.toLowerCase() ?? o.bill} (€${total(o).toFixed(2).replace('.', ',').replace(',00', '')})`, start: end, close: end, where: null, deadline: true });
  }

  // Planes del móvil (systems/Phone): los quedados, con su sitio de data/places.
  for (const plan of input.phone.plans) {
    if (plan.status !== 'accepted') continue;
    const start = planStart(plan);
    const info = placeInfo(plan.place);
    out.push({
      key: `plan:${plan.id}`, kind: 'plan', title: `${capital(PLAN_KINDS[plan.kind].name)} con ${nameOf(plan.npc)}`, start, close: start + 30,
      where: info ? pointWhere(placeName(plan.place), info.entrances[0]) : null,
    });
  }

  // Quedadas de su historia (systems/Story): la visita o el plan que espera allí de `from` a `until`.
  for (const [npc, story] of Object.entries(input.stories)) {
    const def = STORIES[npc];
    if (story.plan?.status !== 'pending' || !def) continue;
    const plan = def.plans[story.plan.id];
    if (!plan) continue;
    const [fh, fm] = plan.from.split(':').map(Number);
    const [uh, um] = plan.until.split(':').map(Number);
    const start = at(story.plan.day, fh, fm);
    out.push({ key: `visit:${npc}:${story.plan.day}:${story.plan.id}`, kind: 'visit', title: `Quedada con ${nameOf(npc)}`, start, close: at(story.plan.day, uh, um), where: pointWhere(plan.place, plan.point) });
  }

  // Partidos con entrada: hay que estar en el asiento al saque.
  for (const t of input.tickets) {
    if (t.admitted) continue;
    const start = at(t.day, 0) + t.kickoff;
    out.push({ key: `match:${t.fixture}`, kind: 'match', title: `Partido contra ${t.rival}`, start, close: start + 45, where: pointWhere('Estadio del Halcón', t.point) });
  }

  // Actividad optativa: se muestra en Hoy, sin convertir perderla en una falta.
  for (const g of GATHERINGS) {
    const today = occurrenceOn(g, dayOfAbs(now));
    const current = today && now <= today.start + g.lateMax && !input.parish?.attended.some((a) => a.id === today.id);
    const o = current ? today : nextOccurrence(g, today ? Math.max(now, today.end) : now);
    if (input.parish && attendedTo(input.parish, o.id)) continue;
    const place = placeInfo(g.place);
    out.push({ key: `gathering:${o.id}`, kind: 'gathering', title: g.name, start: o.start, close: o.start + g.lateMax,
      where: place ? pointWhere(place.name, place.entrances[0]) : null });
  }

  return out.filter((c) => c.close >= now).sort((a, b) => a.start - b.start);
}

// ================================================================
// VIAJE
// ================================================================

export interface Position {
  location: string;
  x: number;
  y: number;
  /** En un sitio sin mapa (Decathlon): su parada. La escena sigue siendo la estación de la que se salió. */
  offMap?: string;
}

/** El tile de calle por el que se sale de un interior (subiendo puertas: el vestuario, al gimnasio, a la calle). */
function streetTile(location: string, depth = 0): { location: string; tile: TilePoint } | null {
  if (!hasLocation(location) || getLocation(location).kind !== 'interior') return null;
  for (const loc of allLocations()) {
    const portal = loc.portals.find((p) => p.to.location === location && !p.train);
    if (!portal) continue;
    if (loc.kind !== 'interior') return { location: loc.id, tile: { tx: portal.tx, ty: portal.ty } };
    if (depth < 3) {
      const up = streetTile(loc.id, depth + 1);
      if (up) return up;
    }
  }
  return null;
}

/** La puerta de calle de la estación de una parada. */
function stationDoor(stopId: string): { location: string; tile: TilePoint } | null {
  const station = STOPS.find((s) => s.id === stopId)?.station;
  return station ? streetTile(station) : null;
}

/** Un tramo del viaje: minutos de reloj estimados y su incertidumbre (± minutos), por separado. */
export type TramoKind = 'interior' | 'walk' | 'station' | 'wait' | 'metro' | 'transfer';
export interface Tramo {
  kind: TramoKind;
  minutes: number;
  uncertainty: number;
  line?: string;
}

export interface TripOptions {
  /** Hora de presentarse (minuto absoluto). Con ella y `now`, hay categoría y hora de salida. */
  start?: number;
  /** Ahora (minuto absoluto): para la categoría y para el horario del metro. */
  now?: number;
  /** Punta o valle; si no se da, se mira la franja de HOUR_BANDS de `now` (o de `start`). */
  peak?: boolean;
  /** Saldo de transporte; null si no hay tarjeta. Omitido: calcular sin comprobar fondos. */
  balance?: number | null | undefined;
  /** Validación real del billete: estar en un andén no implica haber pagado. */
  metroJourney?: MetroJourney | null | undefined;
}

export interface TripEstimate {
  tramos: Tramo[];
  /** Suma de los minutos de los tramos, o null si no hay estimación. */
  totalMin: number | null;
  /** Suma de las incertidumbres de los tramos, o null sin estimación. */
  marginMin: number | null;
  category: 'con margen' | 'justo' | 'tarde' | null;
  uncertainty: { plusMin: number; level: 'baja' | 'media' | 'alta' } | null;
  /** start − total − margen: hora de salida recomendada. */
  departAt: number | null;
  /** Lo que enseña la UI: «~6 min a pie», «metro L2 · ~45 min», con «±M» si hay margen. */
  text: string;
}

export interface TravelHint {
  /** Minutos de reloj estimados, o null si no hay forma de estimarlo. */
  minutes: number | null;
  /** «~6 min a pie ±1», «metro L2 · ~45 min ±12», «desde el móvil», «sin estimación: no hay ruta conocida». */
  text: string;
  /** Margen de la estimación (±min); null sin estimación. */
  marginMin?: number | null;
}

const NO_ROUTE_TEXT = 'sin estimación: no hay ruta conocida';
const NO_DOOR_TEXT = 'sin estimación: no se encuentra la puerta de la estación';
const NO_BORDER_TEXT = 'sin estimación: a pie entre barrios';
const NO_SERVICE_TEXT = 'sin metro a esa hora';
const NO_CARD_TEXT = 'sin estimación: falta la tarjeta de transporte';
const noFundsText = (fare: number): string => `sin estimación: falta saldo para el billete de €${fare}`;

const minuteOfDay = (abs: number): number => ((abs % DAY) + DAY) % DAY;
const hourOf = (abs: number): number => Math.floor(minuteOfDay(abs) / 60);

/** La franja de HOUR_BANDS en esa hora es la punta (tag 'rush': 8-10 y 18-20:30). */
function isPeak(abs: number): boolean {
  const m = minuteOfDay(abs);
  let tag: string = HOUR_BANDS[0].tag;
  for (const band of HOUR_BANDS) if (m >= band.from) tag = band.tag;
  return tag === 'rush';
}

// ponytail: caché (sitio, casilla origen, casilla destino) → longitud del camino, con tope PATH_CACHE_MAX y vaciado
// entero al llenarse. tilePath es una anchura primero con Array.shift (O(n²) en mapas grandes) y el móvil llama a
// travelHint en cada render; si un mapa pasa de unos miles de casillas, subir el tope o cambiar a cola de prioridad.
const PATH_LENGTHS = new Map<string, number | null>();

/** Longitud real del camino en casillas (√2 por diagonal), o null si no hay camino. */
function pathLength(location: string, a: TilePoint, b: TilePoint): number | null {
  const key = `${location}|${a.tx},${a.ty}|${b.tx},${b.ty}`;
  const known = PATH_LENGTHS.get(key);
  if (known !== undefined) return known;
  const path = tilePath(getLocation(location), a, b);
  let len: number | null = null;
  if (path) {
    len = 0;
    for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].tx - path[i - 1].tx, path[i].ty - path[i - 1].ty);
  }
  if (PATH_LENGTHS.size >= AGENDA.PATH_CACHE_MAX) PATH_LENGTHS.clear();
  PATH_LENGTHS.set(key, len);
  return len;
}

/** Un tramo a pie dentro de una localización: por el camino real; sin camino, Manhattan con rodeo y más margen. */
function walkTramo(location: string, a: TilePoint, b: TilePoint): Tramo {
  const len = pathLength(location, a, b);
  if (len !== null) {
    const minutes = Math.ceil(len * AGENDA.WALK_PER_TILE);
    return { kind: 'walk', minutes, uncertainty: Math.max(AGENDA.WALK_MARGIN_MIN, Math.ceil(AGENDA.WALK_MARGIN_PCT * minutes)) };
  }
  const manhattan = Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty);
  const minutes = Math.ceil(manhattan * AGENDA.WALK_PER_TILE * AGENDA.WALK_MANHATTAN_DETOUR);
  return { kind: 'walk', minutes, uncertainty: Math.max(AGENDA.WALK_MANHATTAN_MARGIN_MIN, Math.ceil(AGENDA.WALK_MANHATTAN_MARGIN_PCT * minutes)) };
}

const waitTramo = (peak: boolean): Tramo => ({ kind: 'wait', minutes: AGENDA.METRO_WAIT, uncertainty: peak ? AGENDA.WAIT_MARGIN_PEAK : AGENDA.WAIT_MARGIN_OFF_PEAK });
const STATION_TRAMO: Tramo = { kind: 'station', minutes: AGENDA.STATION_WALK, uncertainty: 0 };

/**
 * Lo que impide subir al metro: horario, tarjeta o saldo. La validación usa la misma regla que prepareRide:
 * sólo un viaje validado en el andén de origen evita pagar de nuevo; desde la calle siempre hace falta billete.
 */
function railBlock(lineIds: readonly string[], station: TransitStop | undefined, opts: TripOptions): string | null {
  if (!lineIds.length) return null;
  const now = opts.now;
  const lines = LINES.filter((l) => lineIds.includes(l.id));
  if (now !== undefined && lines.some((l) => !serviceOpen(l, hourOf(now)))) return NO_SERVICE_TEXT;
  if (opts.balance === null) return NO_CARD_TEXT;
  const fare = station ? journeyFare(opts.metroJourney ?? null, station, LINES[0].fare) : LINES[0].fare;
  if (opts.balance !== undefined && opts.balance + 1e-9 < fare) return noFundsText(fare);
  return null;
}

interface Plan {
  tramos: Tramo[];
  /** Texto propio (sólo «ya estás aquí»); si no, se dice por los tramos. */
  text?: string;
}

/** Barrio vecino a pie: sólo si hay una puerta de calle directa entre los dos sitios; si no, se dice. */
function walkAcross(location: string, tile: TilePoint, target: { location: string; tile: TilePoint }, origin: Tramo[]): Plan | string {
  const portal = getLocation(location).portals.find((p) => p.id !== 'transfer' && !p.train && !p.offMap && p.to.location === target.location);
  const spawn = portal ? getLocation(target.location).spawns[portal.to.spawn] : undefined;
  if (!portal || !spawn) return NO_BORDER_TEXT;
  return { tramos: [...origin, walkTramo(location, tile, { tx: portal.tx, ty: portal.ty }), walkTramo(target.location, spawn, target.tile)] };
}

/** Desde un sitio sin mapa: ya se está (su parada) o se vuelve en metro hasta la estación del destino y se anda. */
function planOffMap(stopId: string, where: NonNullable<Where>, opts: TripOptions, peak: boolean): Plan | string {
  if ('stop' in where) return where.stop === stopId ? { tramos: [], text: 'ya estás aquí' } : NO_ROUTE_TEXT;
  if (!hasLocation(where.location)) return NO_ROUTE_TEXT;
  const target = getLocation(where.location).kind === 'interior' ? streetTile(where.location) : { location: where.location, tile: where.tile };
  const stop = STOPS.find((s) => s.id === stopId);
  const leg = target && stop && destinationsFrom(stop).find((d) => stationDoor(d.stop.id)?.location === target.location);
  const door = leg ? stationDoor(leg.stop.id) : null;
  if (!target || !leg || !door) return NO_ROUTE_TEXT;
  const block = railBlock([leg.line.id], undefined, opts);
  if (block) return block;
  return { tramos: [waitTramo(peak), { kind: 'metro', minutes: leg.minutes, uncertainty: 0, line: leg.line.id }, STATION_TRAMO, walkTramo(target.location, door.tile, target.tile)] };
}

/** El viaje desde `from` hasta `where`, por tramos; o el texto de por qué no se puede estimar. */
function planTrip(from: Position, where: NonNullable<Where>, opts: TripOptions, peak: boolean): Plan | string {
  if (from.offMap) return planOffMap(from.offMap, where, opts, peak);
  const street = hasLocation(from.location) && getLocation(from.location).kind !== 'interior';
  const here = street
    ? { location: from.location, tile: { tx: Math.floor(from.x / TILE), ty: Math.floor(from.y / TILE) } }
    : streetTile(from.location);
  if (!here) return NO_ROUTE_TEXT;
  // Dentro de un interior se cuenta un minuto para salir a la calle. Desde la estación (andén o vestíbulo) el tramo
  // de origen vale 0: se parte de su puerta de calle, sin paseo ni entrada.
  const station = stopAtStation(from.location);
  const origin: Tramo[] = street || station ? [] : [{ kind: 'interior', minutes: 1, uncertainty: 0 }];

  if ('stop' in where) {
    const own = station ?? STOPS.find((s) => s.station && stationDoor(s.id)?.location === here.location);
    const leg = own && destinationsFrom(own).find((d) => d.stop.id === where.stop);
    if (!own || !leg) return NO_ROUTE_TEXT;
    const block = railBlock([leg.line.id], station, opts);
    if (block) return block;
    const enter: Tramo[] = [];
    if (!station) {
      const door = stationDoor(own.id);
      if (!door) return NO_ROUTE_TEXT;
      enter.push(walkTramo(here.location, here.tile, door.tile), STATION_TRAMO);
    }
    return { tramos: [...origin, ...enter, waitTramo(peak), { kind: 'metro', minutes: leg.minutes, uncertainty: 0, line: leg.line.id }] };
  }

  // Si el destino es un interior, se cuenta hasta su puerta de calle.
  if (!hasLocation(where.location)) return NO_ROUTE_TEXT;
  const target = getLocation(where.location).kind === 'interior' ? streetTile(where.location) : { location: where.location, tile: where.tile };
  if (!target) return NO_ROUTE_TEXT;
  if (target.location === here.location) return { tramos: [...origin, walkTramo(here.location, here.tile, target.tile)] };

  const t = travel(here.location, target.location);
  if (t.mode === 'walk') return walkAcross(here.location, here.tile, target, origin);
  if (t.mode !== 'metro') return NO_ROUTE_TEXT;
  // Desde la estación en la que se está (no la de la parada del barrio), si no, la del barrio.
  const fromStop = station?.id ?? t.from;
  const a = stationDoor(fromStop);
  const b = stationDoor(t.to);
  const route = routeBetween(fromStop, t.to);
  if (!route) return NO_ROUTE_TEXT;
  if (!a || !b || a.location !== here.location || b.location !== target.location) return NO_DOOR_TEXT;
  const block = railBlock(route.legs.flatMap((l) => (l.mode === 'train' && l.line ? [l.line] : [])), station, opts);
  if (block) return block;
  const enter: Tramo[] = station ? [] : [walkTramo(here.location, here.tile, a.tile), STATION_TRAMO];
  const legs = route.legs.flatMap((l): Tramo[] => (l.mode === 'train'
    ? [waitTramo(peak), { kind: 'metro', minutes: l.minutes, uncertainty: 0, line: l.line }]
    : [{ kind: 'transfer', minutes: l.minutes, uncertainty: AGENDA.TRANSFER_MARGIN }]));
  return { tramos: [...origin, ...enter, ...legs, STATION_TRAMO, walkTramo(target.location, b.tile, target.tile)] };
}

const uncertaintyLevel = (m: number): 'baja' | 'media' | 'alta' => (m <= AGENDA.LOW_MAX ? 'baja' : m <= AGENDA.MEDIUM_MAX ? 'media' : 'alta');

/** «~N min a pie» o «metro L2/L3 · ~N min», con «±M» si hay margen. */
function describeTrip(tramos: readonly Tramo[], totalMin: number, marginMin: number): string {
  const lines = [...new Set(tramos.flatMap((t) => (t.kind === 'metro' && t.line ? [t.line] : [])))];
  const base = lines.length ? `metro ${lines.join('/')} · ~${totalMin} min` : `~${Math.max(1, totalMin)} min a pie`;
  return marginMin > 0 ? `${base} ±${marginMin}` : base;
}

function build(tramos: Tramo[], opts: TripOptions, text?: string): TripEstimate {
  const totalMin = tramos.reduce((s, t) => s + t.minutes, 0);
  const marginMin = tramos.reduce((s, t) => s + t.uncertainty, 0);
  const { start, now } = opts;
  let category: TripEstimate['category'] = null;
  if (start !== undefined && now !== undefined) {
    category = now + totalMin > start ? 'tarde' : start < now + totalMin + marginMin ? 'justo' : 'con margen';
  }
  return {
    tramos,
    totalMin,
    marginMin,
    category,
    uncertainty: { plusMin: marginMin, level: uncertaintyLevel(marginMin) },
    departAt: start !== undefined ? start - totalMin - marginMin : null,
    text: text ?? describeTrip(tramos, totalMin, marginMin),
  };
}

const none = (text: string): TripEstimate => ({ tramos: [], totalMin: null, marginMin: null, category: null, uncertainty: null, departAt: null, text });

/**
 * Estimación por tramos del viaje (LV-04). Pura: no cobra, no mueve al jugador y no guarda nada. Una estimación
 * nula (totalMin null) lleva el texto por qué no se puede estimar; nunca cuenta como 0 minutos.
 */
export function estimateTrip(from: Position, where: Where, opts: TripOptions = {}): TripEstimate {
  if (!where) return build([], opts, 'desde el móvil');
  const clock = opts.now ?? opts.start;
  const peak = opts.peak ?? (clock !== undefined && isPeak(clock));
  const plan = planTrip(from, where, opts, peak);
  if (typeof plan === 'string') return none(plan);
  return build(plan.tramos, opts, plan.text);
}

/** La estimación de siempre para la UI (HUD, móvil): total, texto y margen. Ver estimateTrip. */
export function travelHint(from: Position, where: Where, opts: TripOptions = {}): TravelHint {
  const e = estimateTrip(from, where, opts);
  return { minutes: e.totalMin, text: e.text, marginMin: e.marginMin };
}

/** «hoy 10:00», «mañana 18:00», «el jueves 18:00». */
export function whenText(abs: number, now: number): string {
  const d = dayOfAbs(abs);
  const today = dayOfAbs(now);
  const day = d === today ? 'hoy' : d === today + 1 ? 'mañana' : `el ${WEEKDAY_LABEL[weekdayOf(d)]}`;
  return `${day} ${hhmm(abs)}`;
}

/**
 * Margen para llegar: 'late' si ya no da tiempo (llegando ahora se pasa de `close`), 'tight' si hay que salir ya,
 * 'ok' si sobra. Sin estimación no se cuenta como 0 min: sólo se mira la hora ('late' si ya es la hora, si no
 * 'tight', porque no se puede asegurar que llegue; nunca 'ok').
 */
export function margin(c: Commitment, now: number, hint: TravelHint): 'ok' | 'tight' | 'late' {
  if (hint.minutes === null) return now > c.start ? 'late' : 'tight';
  const trip = hint.minutes;
  if (now + trip > c.close) return 'late';
  if (c.deadline) return c.start - now < 6 * 60 ? 'tight' : 'ok';
  return now + trip + (hint.marginMin ?? AGENDA.TIGHT_WINDOW) >= c.start ? 'tight' : 'ok';
}

/** Qué decir del margen: nada si sobra, «sal ya», «llegarás tarde» (aún vale, pero pasada la hora) o «ya no llegas». */
export function marginLabel(c: Commitment, now: number, hint: TravelHint): string {
  const m = margin(c, now, hint);
  if (hint.minutes === null) return m === 'late' ? (now > c.close ? 'ya no llegas' : 'llegarás tarde') : '';
  if (m === 'late') return 'ya no llegas';
  if (m === 'ok') return '';
  return !c.deadline && now + hint.minutes > c.start ? 'llegarás tarde' : 'sal ya';
}

/** Cuándo, dicho para un plazo o para una hora: «antes del domingo 23:59», «hoy 10:00». */
export const dueText = (c: Commitment, now: number): string =>
  c.deadline ? `antes de ${whenText(c.start, now)}`.replace('antes de el ', 'antes del ') : whenText(c.start, now);

/** Una línea: «Turno en Decathlon · hoy 10:00 · Polígono Norte · Decathlon · metro L2 · ~49 min». */
export function commitmentLine(c: Commitment, now: number, hint: TravelHint): string {
  const when = dueText(c, now);
  const where = c.where ? ` · ${c.where.name}` : '';
  return `${c.title} · ${when}${where} · ${hint.text}`;
}

/**
 * La salida recomendada y la categoría, dichas corto: «sal 10:10 · con margen», «sal ya · justo», «ya no llegas».
 * Sin estimación no hay salida que decir: ''. Lo usan la app Hoy y el HUD (main.ts, ui/Phone).
 */
export function departureText(c: Commitment, est: TripEstimate, now: number): string {
  if (est.totalMin === null) return '';
  if (marginLabel(c, now, { minutes: est.totalMin, text: est.text, marginMin: est.marginMin }) === 'ya no llegas') return 'ya no llegas';
  if (est.departAt === null) return est.category ?? '';
  const depart = est.departAt <= now ? 'sal ya' : `sal ${hhmm(est.departAt)}`;
  return est.category ? `${depart} · ${est.category}` : depart;
}

/**
 * ¿Libre ese día de `from` a `until` (minutos del día)? Ocupado si un turno del contrato o una clase del curso pisan
 * esa franja, con el viaje de ida y vuelta de margen (una hora a cada lado). Lo usan los planes que se quedan.
 */
export function freeBetween(job: JobProgress | null, study: StudyState, day: number, from: number, until: number): boolean {
  const MARGIN = 60;
  const clash = (start: number, end: number): boolean => start < until + MARGIN && end > from - MARGIN;
  if (job?.status === 'active' && day >= job.from && levelOf(job).days.includes(weekIndex(day))) {
    const lvl = levelOf(job);
    if (clash(lvl.start * 60, (lvl.start + lvl.hours) * 60)) return false;
  }
  const p = study.course;
  const course = p && COURSES.find((c) => c.id === p.id);
  if (p && course && p.lessons.some((d, i) => d === day && !p.attended.includes(i)) && clash(course.start * 60, (course.start + course.hours) * 60)) return false;
  return true;
}

// ================================================================
// AVISOS
// ================================================================

/** Cuánto antes se avisa: el viaje estimado más media hora; un plazo, desde las 9:00 del día que vence. */
export function leadOf(c: Commitment, hint: TravelHint): number {
  if (c.deadline) return Math.max(60, c.start - at(dayOfAbs(c.start), 9));
  return Math.max(45, (hint.minutes ?? 45) + 30);
}

const SEEN_DAYS = 4;

export interface ReviewInput extends AgendaInput {
  position: Position;
}

export interface Review {
  agenda: AgendaState;
  /** Compromisos cuyo aviso toca ahora (cada uno una vez). */
  due: Commitment[];
  /** Turnos y clases que se han perdido desde la última revisión (también los que se saltó un salto de reloj). */
  missed: string[];
  /** Señales de progreso que han cambiado. */
  progress: string[];
}

/**
 * Revisión de un minuto (o de un salto): qué avisos tocan, qué se ha perdido desde la última vez y qué progreso
 * ha cambiado. Pura: devuelve la agenda nueva y lo que hay que decir; quien llama la guarda. La primera revisión de
 * una partida sólo apunta lo perdido y el progreso (no avisa de nada de antes de cargar). Repetirla no repite nada.
 */
export function review(source: AgendaState, input: ReviewInput, progress: ProgressInput): Review {
  const now = input.now;
  const agenda: AgendaState = { ...source, seen: { ...source.seen }, marks: { ...source.marks } };
  const first = agenda.checked < 0;
  const due: Commitment[] = [];
  for (const c of commitments(input)) {
    if (c.kind === 'gathering') continue;
    if (agenda.seen[c.key] !== undefined) continue;
    if (now < c.start - leadOf(c, travelHint(input.position, c.where))) continue;
    agenda.seen[c.key] = now;
    due.push(c);
  }
  for (const [k, t] of Object.entries(agenda.seen)) if (t < now - SEEN_DAYS * DAY) delete agenda.seen[k];

  const missed = first ? [] : missedBetween(input, agenda.checked, now);
  agenda.checked = Math.max(agenda.checked, now);

  const changed: string[] = [];
  for (const s of progressSignals(progress)) {
    const before = agenda.marks[s.id];
    agenda.marks[s.id] = s.mark;
    if (before !== undefined && before !== s.mark && s.news) changed.push(s.news);
  }
  return { agenda, due, missed, progress: changed };
}

/** Turnos y clases cuya hora de cierre cayó en (from, to] y se perdieron: sale una vez aunque se salten horas. */
export function missedBetween(input: AgendaInput, from: number, to: number): string[] {
  if (to <= from) return [];
  const out: string[] = [];
  const job = input.job;
  if (job && job.status === 'active') {
    const def = getJob(job.job);
    const lvl = levelOf(job);
    for (let d = dayOfAbs(from); d <= dayOfAbs(to); d++) {
      if (job.shifts[d] || d < job.from || !lvl.days.includes(weekIndex(d))) continue;
      const close = at(d, lvl.start) + def.late;
      if (close > from && close <= to) out.push(`Turno del ${WEEKDAY_LABEL[weekdayOf(d)]} en ${def.employer.split(' ')[0]}: no fichaste.`);
    }
  }
  const p = input.study.course;
  const course = p && COURSES.find((c) => c.id === p.id);
  if (p && course) {
    p.lessons.forEach((day, i) => {
      const close = at(day, course.start) + course.grace;
      if (close > from && close <= to && lessonStatus(course, p, i, to) === 'missed') out.push(`Clase ${i + 1} (${course.lessons[i].title}): perdida; hay tutoría para recuperarla.`);
    });
  }
  return out;
}

// ================================================================
// PROGRESO
// ================================================================

export interface ProgressInput {
  now: number;
  job: JobProgress | null;
  study: StudyState;
  household: HouseholdState;
  money: number;
  wardrobe: readonly string[];
  social: SocialState;
  fitness: Fitness;
}

export interface Signal {
  id: 'job' | 'study' | 'goal' | 'social' | 'body';
  /** Lo que se enseña en la app Hoy. */
  line: string;
  /** Lo que cambia cuando hay algo nuevo que contar. */
  mark: string;
  /** Lo que se avisa al cambiar (sin ello, no se avisa). */
  news?: string;
}

/** Pocas señales, concretas y de datos que ya existen: el ascenso, la próxima clase, la meta, un recuerdo, el cuerpo. */
export function progressSignals(input: ProgressInput): Signal[] {
  const out: Signal[] = [];
  const job = input.job && settle(input.job, input.now).progress;
  if (job?.status === 'active') {
    const def = getJob(job.job);
    const next = def.levels[job.level + 1];
    const good = Math.min(job.good, def.promoteAfter);
    const line = next ? `Trabajo: ${good} de ${def.promoteAfter} buenos turnos para ascender a ${next.title.toLowerCase()}.` : `Trabajo: ${levelOf(job).title.toLowerCase()}, el nivel más alto.`;
    out.push({ id: 'job', line, mark: `${job.level}:${good}`, news: line });
  }

  const p = input.study.course;
  const course = (p && COURSES.find((c) => c.id === p.id)) ?? COURSES[0];
  if (course) {
    const k = knowledge(input.study, course.skill);
    const skill = `${getSkill(course.skill).name} ${k}/100 (${levelName(course.skill, k)})`;
    let line = `Estudios: ${skill}. Sin curso.`;
    if (p && p.attended.length < course.lessons.length) {
      const s = nextSession(course, p, input.now);
      line = `Estudios: ${skill}. ${p.attended.length} de ${course.lessons.length} clases${s ? `; la siguiente, ${whenText(at(s.day, s.hour), input.now)}` : ''}.`;
    } else if (p) line = `Estudios: ${skill}. ${p.passed ? 'Curso aprobado.' : 'Clases hechas: falta la prueba final.'}`;
    out.push({ id: 'study', line, mark: `${p?.attended.length ?? 0}:${p?.passed ? 1 : 0}`, news: p ? line : undefined });
  }

  const goal = goalById(input.household.goal);
  if (goal) {
    const v = goalView(goal, input.money, input.household, input.wardrobe);
    // Sólo se avisa al pasar a «ya te llega» o al conseguirla: cada gasto o cobro mueve el porcentaje y avisar de
    // cada vaivén sería ruido (el porcentaje está siempre en Hoy y en Cuentas).
    const stage = v.owned ? 'owned' : v.free >= v.cost ? 'ready' : 'saving';
    const line = v.owned ? `Meta: ${v.name}, conseguida.` : `Meta: ${v.name}, ${Math.round(v.progress * 100)}%${stage === 'ready' ? '; ya te llega' : ''}.`;
    out.push({ id: 'goal', line, mark: `${goal.id}:${stage}`, news: stage === 'saving' ? undefined : line });
  }

  // El recuerdo más reciente con alguien, dicho en concreto.
  let best: { npc: string; note: string; day: number; t: number } | null = null;
  for (const [npc, profile] of Object.entries(input.social)) {
    for (const m of profile.memories) {
      if (!m.note || m.outcome === 'negative') continue;
      const t = at(m.day, m.hour, m.minute);
      if (!best || t > best.t) best = { npc, note: m.note, day: m.day, t };
    }
  }
  if (best) {
    const today = dayOfAbs(input.now);
    const when = best.day === today ? 'hoy' : best.day === today - 1 ? 'ayer' : `el ${WEEKDAY_LABEL[weekdayOf(best.day)]}`;
    const line = `Recuerdo: ${nameOf(best.npc)} ${best.note} (${when}).`;
    // Un recuerdo nuevo se avisa como mucho una vez al día: charlar no llena la pantalla de avisos.
    out.push({ id: 'social', line, mark: String(best.day), news: line });
  }

  const build = buildOf(input.fitness);
  out.push({ id: 'body', line: `Cuerpo: ${bodyLine(input.fitness)}`, mark: build ?? 'average', news: build ? `Se te nota el gimnasio: ${bodyLine(input.fitness)}` : undefined });
  return out;
}
