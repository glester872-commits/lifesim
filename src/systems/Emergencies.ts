// Sin Phaser: world/EmergencyView.ts lo pinta, main.ts (lifesim.events) lo fuerza y scripts/check-emergencies.ts lo
// recorre día a día con exactamente esta lógica.
import type { EmergencyDef } from '../data/emergencies.ts';
import type { LocationDef, TilePoint } from '../types/game.ts';
import { getSpawn, isWalkable, ROADWAY } from './LocationSystem.ts';
import { hashSeed, seededRng } from './MetroDaily.ts';
import { eventId, type EventInfo, type Lifecycle } from './WorldEvents.ts';

/**
 * Las emergencias (data/emergencies.ts) como los demás sucesos del mundo: no guardan estado propio. El día, el portal y
 * cada fase salen del reloj (minutos absolutos: día × 1440 + minuto del día) y de una semilla por día, así que quien
 * llega a mitad encuentra la mitad, quien recarga encuentra lo mismo y dormir de un tirón no deja nada colgando.
 *
 * Máquina de estados de un incidente, siempre en este orden y sin saltos hacia atrás:
 *
 *   none → smoke → responding → extinguishing → cleanup → none
 *
 * smoke: empieza y nadie ha avisado. responding: hay aviso (un vecino o el jugador con el 112) y la dotación viene de
 * camino. extinguishing: en el portal, trabajando. cleanup: apagado; recogen y la gente se va. Lo único que decide el
 * jugador (llamar antes que nadie) se guarda en EventMemory.eventFlags, como las decisiones del metro.
 */

export type EmergencyPhase = 'none' | 'smoke' | 'responding' | 'extinguishing' | 'cleanup';

export interface Incident {
  def: EmergencyDef;
  day: number;
  /** Edificio donde pasa (BuildingDef.id). */
  site: string;
  /** Minutos absolutos de cada cambio de fase. */
  start: number;
  /** Cuándo llama un vecino si nadie lo hace antes. */
  autoReport: number;
  report: number;
  arrive: number;
  out: number;
  end: number;
  /** Lo ha llamado el jugador antes del aviso de los vecinos. */
  calledByPlayer: boolean;
  forced: boolean;
  seed: number;
}

/** La clave de la llamada del jugador en EventMemory.eventFlags (valor: el minuto absoluto de la llamada). */
export const callFlag = (def: EmergencyDef, day: number): string => `fire-112:${def.id}:${day}`;

interface Roll {
  start: number;
  site: string;
  seed: number;
  report: number;
  extinguish: number;
}

/** El incidente que tocaría el día `day` sin mirar el enfriamiento, o null. Determinista. */
function rolled(def: EmergencyDef, day: number): Roll | null {
  const rng = seededRng(hashSeed('emergency', def.id, day));
  if (rng() >= def.chance) return null;
  const [from, to] = def.hours;
  const start = day * 1440 + Math.floor((from + rng() * (to - from)) * 60);
  const site = def.sites[Math.floor(rng() * def.sites.length)];
  const [r0, r1] = def.minutes.report;
  const [e0, e1] = def.minutes.extinguish;
  return { start, site, seed: Math.floor(rng() * 1e9), report: r0 + Math.round(rng() * (r1 - r0)), extinguish: e0 + Math.round(rng() * (e1 - e0)) };
}

/**
 * Con enfriamiento: un día con tirada no tiene incidente si alguno de los `cooldownDays` anteriores también la tuvo.
 * Sin recursión, y garantiza la separación: dos incidentes reales nunca quedan a menos de `cooldownDays` días.
 */
function scheduled(def: EmergencyDef, day: number): Roll | null {
  const r = rolled(def, day);
  if (!r) return null;
  for (let d = day - def.cooldownDays; d < day; d++) if (d >= 0 && rolled(def, d)) return null;
  return r;
}

function build(def: EmergencyDef, day: number, r: Roll, calledAt: number | undefined, forced: boolean): Incident {
  const autoReport = r.start + r.report;
  const called = calledAt !== undefined && calledAt >= r.start && calledAt < autoReport;
  const report = called ? calledAt : autoReport;
  const arrive = report + def.minutes.travel;
  const out = arrive + r.extinguish;
  return { def, day, site: r.site, start: r.start, autoReport, report, arrive, out, end: out + def.minutes.cleanup, calledByPlayer: called, forced, seed: r.seed };
}

// ----------------------------------------------------------------- forzar (sólo desarrollo; no se guarda)

const forcedRuns = new Map<string, Roll & { day: number }>();

/** Empieza uno ahora (lifesim.events.force('fire:<id>')): mismo ciclo y duraciones, sitio con semilla del minuto. */
export function forceIncident(def: EmergencyDef, t: number, site?: string): void {
  const day = Math.floor(t / 1440);
  const r = rolled({ ...def, chance: 1 }, day)!;
  const rng = seededRng(hashSeed('emergency-force', def.id, Math.round(t)));
  forcedRuns.set(def.id, { ...r, day, start: Math.floor(t), site: site ?? def.sites[Math.floor(rng() * def.sites.length)] });
}

export function clearForced(def: EmergencyDef): void {
  forcedRuns.delete(def.id);
}

// ----------------------------------------------------------------- consulta

/**
 * El incidente que afecta al minuto `t` (empezado o por empezar hoy, o el de ayer si aún dura), o null. Nunca hay dos
 * a la vez de la misma emergencia: el forzado manda mientras dure. `calls`: EventMemory.eventFlags (llamadas al 112).
 */
export function incidentAt(def: EmergencyDef, t: number, calls: Readonly<Record<string, number>> = {}): Incident | null {
  const forced = forcedRuns.get(def.id);
  if (forced) {
    const inc = build(def, forced.day, forced, calls[callFlag(def, forced.day)], true);
    if (t < inc.end) return inc;
    forcedRuns.delete(def.id);
  }
  const day = Math.floor(t / 1440);
  for (const d of [day - 1, day]) {
    const r = d >= 0 ? scheduled(def, d) : null;
    if (!r) continue;
    const inc = build(def, d, r, calls[callFlag(def, d)], false);
    if (t < inc.end) return inc;
  }
  return null;
}

export function phaseAt(inc: Incident | null, t: number): EmergencyPhase {
  if (!inc || t < inc.start || t >= inc.end) return 'none';
  if (t < inc.report) return 'smoke';
  if (t < inc.arrive) return 'responding';
  if (t < inc.out) return 'extinguishing';
  return 'cleanup';
}

/** El nombre común (systems/WorldEvents) de cada fase. */
export function lifecycleOf(phase: EmergencyPhase, cooling: boolean): Lifecycle {
  if (phase === 'smoke') return 'ACTIVE';
  if (phase === 'responding' || phase === 'extinguishing') return 'RESOLUTION';
  if (phase === 'cleanup') return 'CLEANUP';
  return cooling ? 'COOLDOWN' : 'ELIGIBLE';
}

/** Minutos de juego que quedan para que vuelva a poder pasar (0: ya puede), contados desde el último incidente ya empezado. */
export function cooldownLeft(def: EmergencyDef, t: number): number {
  const day = Math.floor(t / 1440);
  for (let d = day; d > day - def.cooldownDays && d >= 0; d--) {
    const r = scheduled(def, d);
    if (r && r.start <= t) return Math.max(0, (d + def.cooldownDays) * 1440 - t);
  }
  return 0;
}

/**
 * Llamar al 112 en el minuto `t`: si todavía nadie había avisado, el aviso es el tuyo y la dotación sale ya. Devuelve
 * la marca que hay que guardar, o null si ya había aviso (o no hay nada que avisar).
 */
export function callEmergency(def: EmergencyDef, t: number, calls: Readonly<Record<string, number>>): { flag: string; minute: number } | null {
  const inc = incidentAt(def, t, calls);
  if (!inc || phaseAt(inc, t) !== 'smoke') return null;
  return { flag: callFlag(def, inc.day), minute: Math.floor(t) };
}

/** El incidente en el formato común de lifesim.events (WorldEvents.EventInfo). */
export function emergencyInfo(def: EmergencyDef, t: number, calls: Readonly<Record<string, number>> = {}): EventInfo {
  const inc = incidentAt(def, t, calls);
  const phase = phaseAt(inc, t);
  const left = cooldownLeft(def, t);
  const on = inc !== null && phase !== 'none';
  return {
    id: eventId(def.type, def.id),
    type: def.type,
    location: def.location,
    anchor: null,
    lifecycle: lifecycleOf(phase, left > 0),
    phase: inc ? `${on ? phase : 'pendiente'} (${inc.site})` : phase,
    age: on ? Math.round(t - inc.start) : null,
    maxLeft: on ? Math.round(inc.end - t) : null,
    unit: 'min',
    participants: on ? [{ id: inc.site, role: 'site' }] : [],
    responders: phase === 'responding' || phase === 'extinguishing' || phase === 'cleanup' ? Array.from({ length: def.crew }, (_, i) => `${def.station}#${i + 1}`) : [],
    cooldownLeft: left,
    forced: inc?.forced ?? false,
  };
}

// ----------------------------------------------------------------- dónde se pone cada cosa

export interface Staging {
  /** La puerta del portal (su spawn en la calle): queda libre siempre. */
  door: TilePoint;
  /** Desde dónde sale la dotación (la puerta del parque). */
  station: TilePoint;
  /** Donde trabaja cada bombero: a los lados de la puerta, en la misma acera. */
  crew: TilePoint[];
  /** Los cuatro tiles de la fila base de la autobomba aparcada en el bordillo (sólo esa fila colisiona), o null si no cabe. */
  engine: TilePoint[] | null;
  /** Donde se paran los curiosos: la acera de enfrente. */
  onlookers: TilePoint[];
}

const sidewalk = (loc: LocationDef, tx: number, ty: number): boolean => isWalkable(loc, tx, ty) && !ROADWAY.has(loc.ground[ty]?.[tx] ?? '');

/**
 * Sitio de cada uno delante de `site`, sacado del suelo y sin coordenadas escritas: la puerta y la fila de la acera que
 * da a ella se quedan libres (la autobomba ocupa la fila de debajo, a un lado de la puerta), así que nadie queda
 * encerrado y la acera se sigue recorriendo de punta a punta.
 */
export function stagingOf(def: EmergencyDef, loc: LocationDef, site: string): Staging {
  // Los portales sin interior no tienen spawn: su puerta es su punto con nombre (BuildingDef.point).
  const building = loc.buildings?.find((b) => b.id === site);
  const point = building?.point ? loc.points?.[building.point] : undefined;
  if (!point) throw new Error(`[${loc.id}] ${site}: sin punto de puerta`);
  const door = { tx: point.tx, ty: point.ty };
  const station = getSpawn(loc, def.station);
  const crew = [-1, 1, -2, 2]
    .map((dx) => ({ tx: door.tx + dx, ty: door.ty }))
    .filter((p) => sidewalk(loc, p.tx, p.ty))
    .slice(0, def.crew);
  // En el bordillo, a un lado de la puerta, con la acera de la puerta libre por encima; si ahí hay farolas o árboles,
  // en el primer hueco libre de la calzada de delante (sin coches aparcados), lo más cerca posible del portal.
  const fits = (x0: number, row: number, curb: boolean): TilePoint[] | null => {
    const tiles = [0, 1, 2, 3].map((i) => ({ tx: x0 + i, ty: row }));
    const ok = curb
      ? tiles.every((p) => sidewalk(loc, p.tx, p.ty) && sidewalk(loc, p.tx, door.ty))
      : tiles.every((p) => isWalkable(loc, p.tx, p.ty) && ROADWAY.has(loc.ground[p.ty]?.[p.tx] ?? '') && ROADWAY.has(loc.ground[p.ty - 1]?.[p.tx] ?? ''));
    return ok ? tiles : null;
  };
  const shifts = [2, -5, 1, -4, 3, -6, -2, -1, 4, -7];
  let engine: TilePoint[] | null = null;
  for (const [row, curb] of [[door.ty + 1, true], [door.ty + 2, false], [door.ty + 3, false]] as const) {
    for (const dx of shifts) if (!engine) engine = fits(door.tx + dx, row, curb);
  }
  const onlookers: TilePoint[] = [];
  for (let y = door.ty + 2; y <= door.ty + 6 && !onlookers.length; y++) {
    for (const dx of [0, -1, 1, -2, 2]) if (sidewalk(loc, door.tx + dx, y) && onlookers.length < def.onlookers) onlookers.push({ tx: door.tx + dx, ty: y });
  }
  return { door, station, crew: crew.length ? crew : [door], engine, onlookers };
}
