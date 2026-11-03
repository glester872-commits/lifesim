// Sin Phaser: lo usan la recepción de la comisaría (scenes/Menus), las patrullas de la calle (StreetLife), lo que dice un
// agente al hablarle (scenes/WorldScene) y scripts/check-police.ts.
import type { ZoneDef } from '../data/zones.ts';
import { STREET_PICKPOCKET } from './Pickpocket.ts';
import { isOpen, placesTagged } from './Places.ts';
import { identityOf, zoneActivity, zonesIn } from './Zones.ts';

/**
 * La policía de la calle: presencia, no simulación. Las patrullas son viajes de StreetLife (data/streets.ts, rol
 * 'police-patrol'); aquí está lo que comparten: el cupo, los tiempos de una respuesta a un robo de la calle
 * (systems/Pickpocket, el único suceso de calle con víctima) y lo que saben contar: qué zonas tienen ahora riesgo de
 * tirón (las mismas que deja robar systems/Pickpocket, por su gente a esta hora) y qué robos les constan.
 *
 * Nada de arrestos, persecuciones ni antecedentes: un robo que alguien ha visto se atiende (el agente va, habla con la
 * víctima y vuelve a lo suyo) y, si la víctima es el jugador, se puede denunciar en la comisaría.
 */
export const POLICE = {
  /** Agentes de patrulla a la vez en una calle (todas las reglas 'police-patrol' juntas, también las del partido). */
  patrolCap: 2,
  /**
   * Ms reales sin patrulla nueva en una calle después de que una se vaya: pasan, no se quedan. Un robo no espera
   * (StreetLife.callPatrol no lo mira).
   */
  // QA (policía en la ciudad): antes 45 s (90 min de juego sin nadie), y fuera de Vallesco no se veía casi nunca un agente.
  restMs: 15_000,
  /** Ms reales que el agente se queda con la víctima. */
  attendMs: 6_000,
  /** Si en este tiempo (ms reales) no ha llegado, lo deja y vuelve: nadie se queda enganchado a un aviso. */
  reachMs: 40_000,
  /** Persecución: tiles como mucho entre el agente que acude y el ladrón cuando echa a correr; más lejos, va con la víctima. */
  chaseRange: 10,
  /** Ms reales que corre detrás; si no lo alcanza (o sale de la calle), lo deja y va con la víctima. */
  chaseMs: 12_000,
  /** Ms reales que lo retiene al alcanzarlo (lo identifica) antes de ir con la víctima. */
  detainMs: 5_000,
  /** Ms reales que el coche patrulla se queda parado en el aviso antes de seguir su carril. */
  carStayMs: 10_000,
  /** Minutos de juego que lleva poner una denuncia en recepción. */
  reportMinutes: 15,
  /** Lo que recuerda la comisaría (minutos de juego): un día. */
  memoryMinutes: 24 * 60,
} as const;

/** Rol de policía (patrulla o puesto del día de partido, data/streets.ts). */
export const isPolice = (role: string | undefined): boolean => !!role && role.startsWith('police');

export interface IncidentRecord {
  id: number;
  kind: 'pickpocket';
  /** LocationDef.id de la calle y nombre de la zona (data/zones.ts) donde fue. */
  location: string;
  zone: string;
  /** Minuto absoluto de juego (Handoff.absMinute). */
  at: number;
  victim: 'player' | 'npc';
  /** Euros que se llevó (0: lo intentó y no pudo). */
  amount: number;
  /** Un agente llegó y atendió a la víctima. */
  attended: boolean;
  /** Un agente alcanzó al ladrón al huir (StreetLife: persecución). */
  caught?: boolean;
  /** El jugador lo denunció en la comisaría. */
  reported: boolean;
}

/** Lo que recuerda la comisaría, tal como se guarda con la partida (GameState.snapshot → SaveSystem). */
export interface PoliceMemory {
  incidents: IncidentRecord[];
  nextId: number;
}

/** Cuántos robos recuerda como mucho (los más recientes). */
const LOG_SIZE = 20;

// La única copia viva: la calle, las patrullas y la recepción escriben aquí; la partida guardada la copia y la restaura.
const LOG: IncidentRecord[] = [];
let nextId = 1;

/** Para guardar: una copia, no el registro vivo. */
export const policeMemory = (): PoliceMemory => ({ incidents: structuredClone(LOG), nextId });

/** Al cargar una partida (o empezar una): sustituye lo que hubiera. Sin memoria guardada, la comisaría empieza vacía. */
export function restoreIncidents(m: PoliceMemory | undefined): void {
  LOG.length = 0;
  for (const r of (m?.incidents ?? []).slice(-LOG_SIZE)) LOG.push({ ...r });
  // Nunca se repite un número de denuncia, aunque lo guardado venga corto.
  nextId = Math.max(m?.nextId ?? 1, ...LOG.map((r) => r.id + 1), 1);
}

/** Lee lo guardado: un registro mal formado se descarta (nunca rompe la carga); una partida anterior carga sin memoria. */
export function parsePolice(v: unknown): PoliceMemory | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const o = v as Record<string, unknown>;
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  const incidents: IncidentRecord[] = [];
  for (const raw of Array.isArray(o.incidents) ? o.incidents : []) {
    const r = raw as Record<string, unknown>;
    if (typeof r !== 'object' || r === null) continue;
    if (!num(r.id) || r.id < 1 || !num(r.at) || !num(r.amount) || r.amount < 0) continue;
    if (typeof r.location !== 'string' || typeof r.zone !== 'string' || (r.victim !== 'player' && r.victim !== 'npc')) continue;
    incidents.push({
      id: Math.floor(r.id), kind: 'pickpocket', location: r.location, zone: r.zone, at: Math.floor(r.at), victim: r.victim,
      amount: Math.round(r.amount * 100) / 100, attended: r.attended === true, reported: r.reported === true,
      ...(r.caught === true ? { caught: true } : {}),
    });
  }
  return { incidents: incidents.slice(-LOG_SIZE), nextId: num(o.nextId) && o.nextId >= 1 ? Math.floor(o.nextId) : 1 };
}

/** Un robo visto (por la víctima o por quien grita): lo apunta y devuelve su registro. */
export function recordIncident(r: Pick<IncidentRecord, 'location' | 'zone' | 'at' | 'victim' | 'amount'>): IncidentRecord {
  const rec: IncidentRecord = { ...r, id: nextId++, kind: 'pickpocket', attended: false, reported: false };
  LOG.push(rec);
  if (LOG.length > LOG_SIZE) LOG.shift();
  return rec;
}

export const incidentById = (id: number): IncidentRecord | undefined => LOG.find((r) => r.id === id);

/** Los de las últimas 24 h de juego, el más reciente primero; con `location`, sólo los de esa calle. */
export function recentIncidents(now: number, location?: string): IncidentRecord[] {
  return LOG.filter((r) => now - r.at <= POLICE.memoryMinutes && now >= r.at && (!location || r.location === location)).reverse();
}

/** Un robo al jugador, con dinero, sin denunciar todavía: lo único que se puede denunciar. */
export const reportable = (now: number): IncidentRecord | undefined => recentIncidents(now).find((r) => r.victim === 'player' && r.amount > 0 && !r.reported);

/** Pone la denuncia: el registro queda denunciado. False si no había nada que denunciar. */
export function fileReport(id: number, now: number): boolean {
  const r = reportable(now);
  if (!r || r.id !== id) return false;
  r.reported = true;
  return true;
}

/** Pruebas: borra la memoria. */
export function resetIncidents(): void {
  LOG.length = 0;
  nextId = 1;
}

// ------------------------------------------------------------------ lo que cuentan

export interface PoliceClock {
  day: number;
  hour: number;
  minute: number;
}

const hhmm = (abs: number): string => {
  const m = ((abs % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

const ago = (now: number, at: number): string => {
  const d = now - at;
  if (d < 60) return `hace ${Math.max(1, d)} min`;
  if (d < 180) return `hace un par de horas, a las ${hhmm(at)}`;
  return Math.floor(at / 1440) < Math.floor(now / 1440) ? `ayer a las ${hhmm(at)}` : `a las ${hhmm(at)}`;
};

/**
 * Las zonas de esa calle donde ahora mismo puede haber tirones: las que deja robar systems/Pickpocket (zoneWeight), por
 * lo llenas que están a esta hora (Zones.zoneActivity). Las dos con más riesgo, si alguna pasa del umbral.
 */
export function riskZones(location: string, clock: PoliceClock): ZoneDef[] {
  return zonesIn(location)
    .map((z) => ({ z, risk: (STREET_PICKPOCKET.zoneWeight[z.type] ?? 0) * zoneActivity(z, clock) }))
    .filter((r) => r.risk >= 0.6)
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 2)
    .map((r) => r.z);
}

/** El barrio (data/districtIdentity.ts) que más zonas tiene en esa calle. */
function districtOf(location: string): string | undefined {
  const count = new Map<string, number>();
  for (const z of zonesIn(location)) count.set(z.districtId, (count.get(z.districtId) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function presence(location: string): string {
  const id = districtOf(location);
  if (!id) return 'Por aquí pasamos de vez en cuando.';
  const who = identityOf(id);
  const level = who.security >= 1.4 ? 'Hay patrulla a menudo' : who.security >= 1 ? 'Pasamos varias veces al día' : 'Pasamos menos de lo que nos gustaría';
  return `${who.name}: ${who.tagline}. ${level}.`;
}

function risk(location: string, clock: PoliceClock): string {
  const zones = riskZones(location, clock);
  if (zones.length === 0) return 'A esta hora está tranquilo: poca gente junta, que es lo que buscan los carteristas.';
  const names = zones.map((z) => z.name).join(' y ');
  return `Ahora, ojo en ${names}: mucha gente junta. Cartera delante y el móvil, mejor no en el bolsillo de atrás.`;
}

function incidentsLine(now: number, location?: string): string {
  const list = recentIncidents(now, location);
  if (list.length === 0) return location ? 'Hoy no nos consta ningún robo por aquí.' : 'Hoy no nos consta ningún robo en la calle.';
  const last = list[0];
  const what = last.amount > 0 ? 'un tirón' : 'un intento de tirón';
  const more = list.length > 1 ? ` Con ese, ${list.length} en las últimas 24 horas.` : '';
  return `Nos consta ${what} en ${last.zone}, ${ago(now, last.at)}.${more}`;
}

/**
 * Lo que cuenta la recepción de la comisaría: el barrio de la comisaría, el riesgo de ahora en sus zonas y los robos
 * que constan en toda la ciudad (los que han atendido o se han denunciado).
 */
export function deskBrief(location: string, clock: PoliceClock, now: number): string[] {
  return [presence(location), risk(location, clock), incidentsLine(now)];
}

/**
 * Lo que dice un agente de patrulla al hablarle: un saludo según la hora, el riesgo de la calle ahora y, si lo hay, el
 * robo de hoy aquí; si el jugador tiene uno sin denunciar, una comisaría abierta donde se denuncia.
 */
export function patrolLines(location: string, clock: PoliceClock, now: number): string[] {
  const greet = clock.hour >= 6 && clock.hour < 14 ? 'Buenos días.' : clock.hour >= 14 && clock.hour < 21 ? 'Buenas tardes.' : 'Buenas noches.';
  const lines = [`${greet} ${risk(location, clock)}`, incidentsLine(now, location)];
  const own = reportable(now);
  if (own) {
    const station = placesTagged('police').find((p) => isOpen(p, clock.day, clock.hour, clock.minute));
    lines.push(`¿Te robaron a ti ${ago(now, own.at)}? La denuncia se pone en ${station?.name ?? 'la comisaría'}, en recepción.`);
  }
  return lines;
}
