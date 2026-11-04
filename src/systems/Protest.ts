// Sin Phaser: lo usan el gancho de consola de main.ts, systems/World.ts y scripts/check-protest.ts.
import { LOCATION_DISTRICT } from '../data/districtIdentity.ts';
import type { ProtestDef } from '../data/protests.ts';
import type { LocationDef, TilePoint } from '../types/game.ts';
import { weekIndex } from './Calendar.ts';
import { tilePath } from './Navigation.ts';
import { hashSeed, seededRng, type Rng } from './MetroDaily.ts';
import { weatherAt } from './Weather.ts';
import { eventId, type EventInfo, type Lifecycle } from './WorldEvents.ts';
import { identityOf } from './Zones.ts';

/**
 * Una concentración vecinal (data/protests.ts) día a día, calcada de
 * systems/StreetEvents: no guarda estado. Todo sale del reloj (minutos
 * absolutos: día × 1440 + minuto) y de una semilla por día; el enfriamiento se
 * calcula mirando atrás los días anteriores con la misma semilla. Por eso
 * recargar a mitad da exactamente la misma concentración, sin duplicados.
 *
 *   montaje (SPAWNING) → acto (ACTIVE) → dispersión (RESOLUTION) → limpieza (CLEANUP) → COOLDOWN
 */

export type ProtestPhase = 'none' | 'setup' | 'active' | 'dispersal' | 'cleanup';
export type ProtestRole = 'manifestante' | 'policia';
export type ProtestWhy = 'ok' | 'weekday' | 'chance' | 'rain' | 'cooldown';

/** Minutos de juego de cada fase; el acto dura entre ACTIVE[0] y ACTIVE[1]. */
export const SETUP = 30;
export const ACTIVE = [60, 90] as const;
export const DISPERSE = 25;
export const CLEANUP = 20;
export const MAX_POLICE = 3;

export interface ProtestMember {
  id: number;
  role: ProtestRole;
  slot: TilePoint;
  entry: TilePoint;
  exit: TilePoint;
  /** Minutos absolutos: está en la plaza de `arrive` (incluido) a `leave` (excluido). */
  arrive: number;
  leave: number;
  banner?: string;
}

export interface ProtestDay {
  day: number;
  happens: boolean;
  why: ProtestWhy;
  start: number;
  activeAt: number;
  dispersalAt: number;
  cleanupAt: number;
  end: number;
  members: ProtestMember[];
}

const int = (rng: Rng, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));

const shuffled = <T>(items: readonly T[], rng: Rng): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Las tiradas del día, siempre en el mismo orden; sin mirar el enfriamiento. */
function draw(def: ProtestDef, day: number, force?: number): { start: number; active: number; why: Exclude<ProtestWhy, 'cooldown'> } {
  const rng = seededRng(force !== undefined ? hashSeed(def.id, day, 'force', Math.round(force)) : hashSeed(def.id, day));
  const from = day * 1440 + def.window[0] * 60;
  const to = day * 1440 + def.window[1] * 60;
  const active = int(rng, ACTIVE[0], ACTIVE[1]);
  const start = force ?? from + Math.floor(rng() * Math.max(0, to - from - SETUP - active - DISPERSE));
  const roll = rng();
  if (force !== undefined) return { start, active, why: 'ok' };
  if (!def.days.includes(weekIndex(day))) return { start, active, why: 'weekday' };
  const home = LOCATION_DISTRICT[def.location] ?? '';
  if (roll >= Math.min(1, def.chance * identityOf(home).events)) return { start, active, why: 'chance' };
  if (weatherAt(day, (start % 1440) / 60).rain >= def.cancelRain) return { start, active, why: 'rain' };
  return { start, active, why: 'ok' };
}

// Si hubo concentración ese día (con enfriamiento): sólo depende de la semilla, así que se puede recordar.
const HAPPENED = new WeakMap<ProtestDef, Map<number, boolean>>();

function happened(def: ProtestDef, day: number): boolean {
  let memo = HAPPENED.get(def);
  if (!memo) HAPPENED.set(def, (memo = new Map()));
  let v = memo.get(day);
  if (v === undefined) {
    v = draw(def, day).why === 'ok' && !blocked(def, day);
    memo.set(day, v);
  }
  return v;
}

/** Hubo una en los `cooldownDays` días anteriores, o ya van `maxPerWeek` esta semana (lunes a domingo). */
function blocked(def: ProtestDef, day: number): boolean {
  const week = Math.floor((day - 1) / 7);
  let thisWeek = 0;
  for (let k = 1; k <= Math.max(def.cooldownDays, 6); k++) {
    const d = day - k;
    if (d < 0) break;
    if (!happened(def, d)) continue;
    if (k <= def.cooldownDays) return true;
    if (Math.floor((d - 1) / 7) === week) thisWeek++;
  }
  return thisWeek >= def.maxPerWeek;
}

/** Lo que pasa (o no) el día `day`; con `force`, una que empieza a mano en ese minuto absoluto. */
export function planDay(def: ProtestDef, loc: LocationDef, day: number, force?: number): ProtestDay {
  const { start, active, why: raw } = draw(def, day, force);
  const why: ProtestWhy = raw === 'ok' && force === undefined && blocked(def, day) ? 'cooldown' : raw;
  const activeAt = start + SETUP;
  const dispersalAt = activeAt + active;
  const cleanupAt = dispersalAt + DISPERSE;
  const base = { day, start, activeAt, dispersalAt, cleanupAt, end: cleanupAt + CLEANUP, members: [] };
  if (why !== 'ok') return { ...base, happens: false, why };

  const rng = seededRng(hashSeed(def.id, day, start, 'crowd'));
  const entries = def.entries.map((id) => loc.points?.[id]).filter((p): p is NonNullable<typeof p> => !!p).map((p) => ({ tx: p.tx, ty: p.ty }));
  if (!entries.length) throw new Error(`Concentración ${def.id}: ninguna entrada existe en ${def.location}.`);
  const crowd = Math.min(def.slots.length, int(rng, def.crowd[0], def.crowd[1]));
  const police = Math.min(MAX_POLICE, def.policeSlots.length, int(rng, def.police[0], def.police[1]));
  const banners = shuffled(def.banners, rng);
  const members: ProtestMember[] = [];
  const add = (role: ProtestRole, slot: TilePoint, arrive: number, leave: number, banner?: string): void => {
    const entry = entries[Math.floor(rng() * entries.length)];
    const exit = entries[Math.floor(rng() * entries.length)];
    members.push({ id: members.length + 1, role, slot, entry, exit, arrive, leave, ...(banner ? { banner } : {}) });
  };
  // Todos llegan durante el montaje y se van durante la dispersión: la presencia sube, se mantiene y baja.
  // Pancarta sólo en los puestos de bannerSlots (separados, no se pisan); un lema distinto cada uno.
  let nextBanner = 0;
  shuffled(def.slots, rng).slice(0, crowd).forEach((slot) => {
    const carries = def.bannerSlots.some((s) => s.tx === slot.tx && s.ty === slot.ty) && nextBanner < banners.length;
    add('manifestante', slot, start + rng() * (SETUP - 2), dispersalAt + rng() * (DISPERSE - 2), carries ? banners[nextBanner++] : undefined);
  });
  // La policía, antes de que empiece el acto y la última en irse.
  for (const slot of def.policeSlots.slice(0, police)) add('policia', slot, start + rng() * SETUP * 0.5, dispersalAt + DISPERSE * 0.6 + rng() * DISPERSE * 0.3);
  return { ...base, members, happens: true, why };
}

/** Camino en tiles de la entrada a su sitio (`in`) o de su sitio a la salida (`out`): el de Navigation.tilePath; null si no hay. */
export function protestRoute(loc: LocationDef, m: ProtestMember, leg: 'in' | 'out'): TilePoint[] | null {
  return leg === 'in' ? tilePath(loc, m.entry, m.slot) : tilePath(loc, m.slot, m.exit);
}

/** El lema partido en líneas de `width` caracteres como mucho, por palabras. */
export function bannerLines(text: string, width = 16): string[] {
  const lines: string[] = [];
  for (const word of text.split(' ')) {
    const last = lines.length - 1;
    if (last >= 0 && lines[last].length + 1 + word.length <= width) lines[last] += ' ' + word;
    else lines.push(word);
  }
  return lines;
}

/** Lo que se lee en la pancarta: el lema si cabe en dos líneas; si no, su versión corta (data/protests.ts). */
export function bannerText(def: ProtestDef, banner: string): string[] {
  const lines = bannerLines(banner);
  return lines.length <= 2 ? lines : bannerLines(def.bannerShort[banner] ?? banner);
}

/** Un orden sembrado por día de los looks de PASSENGER_LOOKS (sus ids), sin el uniforme de policía: uno distinto por manifestante. */
export function lookOrder(defId: string, day: number, ids: readonly string[]): number[] {
  const civil = ids.flatMap((id, i) => (id === 'uniforme-policia' ? [] : [i]));
  return shuffled(civil, seededRng(hashSeed(defId, day, 'looks')));
}

export function phaseAt(p: ProtestDay, t: number): ProtestPhase {
  if (!p.happens || t < p.start || t >= p.end) return 'none';
  return t < p.activeAt ? 'setup' : t < p.dispersalAt ? 'active' : t < p.cleanupAt ? 'dispersal' : 'cleanup';
}

const LIFECYCLE: Readonly<Record<Exclude<ProtestPhase, 'none'>, Lifecycle>> = { setup: 'SPAWNING', active: 'ACTIVE', dispersal: 'RESOLUTION', cleanup: 'CLEANUP' };

/** Lo forzado a mano, por concentración (sólo el gancho de desarrollo): sobrevive a crear otra instancia. */
interface DevOverride {
  forced?: ProtestDay;
  /** Hasta cuándo la plaza queda sin concentración (cancelada a mano). */
  clearUntil?: number;
}
const DEV = new Map<string, DevOverride>();

export class Protest {
  readonly def: ProtestDef;
  private readonly loc: LocationDef;
  private readonly days = new Map<number, ProtestDay>();

  constructor(def: ProtestDef, loc: LocationDef) {
    this.def = def;
    this.loc = loc;
  }

  plan(day: number): ProtestDay {
    let p = this.days.get(day);
    if (!p) {
      p = planDay(this.def, this.loc, day);
      this.days.set(day, p);
      for (const d of this.days.keys()) if (d < day - this.def.cooldownDays - 1) this.days.delete(d);
    }
    return p;
  }

  /** La del calendario a esta hora (cabe en el día: no cruza medianoche). */
  private naturalAt(t: number): ProtestDay {
    return this.plan(Math.floor(t / 1440));
  }

  /** La que manda a esta hora: la forzada, ninguna si se canceló, o la del calendario. */
  dayAt(t: number): ProtestDay {
    const dev = DEV.get(this.def.id);
    if (dev?.forced) {
      if (t < dev.forced.end) return dev.forced;
      dev.forced = undefined;
      // Una por plaza y día: acabada la forzada, la del calendario de hoy ya no empieza.
      const natural = this.naturalAt(t);
      if (natural.happens && t < natural.end) dev.clearUntil = Math.max(dev.clearUntil ?? -Infinity, natural.end);
    }
    if (dev?.clearUntil !== undefined && t < dev.clearUntil) return { ...this.naturalAt(t), happens: false, members: [] };
    return this.naturalAt(t);
  }

  phase(t: number): ProtestPhase {
    return phaseAt(this.dayAt(t), t);
  }

  /** Quién está en la plaza a esta hora, con su papel y su llegada y salida. */
  presentAt(t: number): ProtestMember[] {
    const p = this.dayAt(t);
    if (phaseAt(p, t) === 'none') return [];
    return p.members.filter((m) => t >= m.arrive && t < m.leave);
  }

  /** Cuánto falta para que pueda volver a haber una: hasta el día siguiente al último de enfriamiento. */
  private cooldownLeft(t: number): number {
    const today = Math.floor(t / 1440);
    const clear = DEV.get(this.def.id)?.clearUntil;
    let left = clear !== undefined && t < clear ? clear - t : 0;
    for (let k = 0; k <= this.def.cooldownDays; k++) {
      const p = this.plan(today - k);
      if (!p.happens || t < p.end) continue;
      left = Math.max(left, (p.day + this.def.cooldownDays + 1) * 1440 - t);
      break;
    }
    return left;
  }

  lifecycle(t: number): EventInfo {
    const p = this.dayAt(t);
    const phase = phaseAt(p, t);
    const present = this.presentAt(t);
    const cooldownLeft = phase === 'none' ? this.cooldownLeft(t) : 0;
    const lifecycle: Lifecycle = phase !== 'none' ? LIFECYCLE[phase] : cooldownLeft > 0 ? 'COOLDOWN' : 'ELIGIBLE';
    const live = phase !== 'none';
    const id = (m: ProtestMember): string => `${this.def.id}#${m.id}`;
    return {
      id: eventId('protest', this.def.id),
      type: 'protest',
      location: this.def.location,
      anchor: { ...this.def.center },
      lifecycle,
      phase,
      age: live ? t - p.start : null,
      maxLeft: live ? p.end - t : null,
      unit: 'min',
      participants: present.map((m) => ({ id: id(m), role: m.role })),
      responders: present.filter((m) => m.role === 'policia').map(id),
      cooldownLeft,
      forced: !!DEV.get(this.def.id)?.forced,
    };
  }

  // ------------------------------------------ herramientas de desarrollo (main.ts, sólo DEV)

  /** Empieza una ahora, con el montaje casi hecho: el acto en cinco minutos. */
  devForce(t: number): ProtestDay {
    const p = planDay(this.def, this.loc, Math.floor(t / 1440), t - (SETUP - 5));
    DEV.set(this.def.id, { ...DEV.get(this.def.id), forced: p });
    return p;
  }

  /** Pasa ya a la dispersión: quien está se va escalonado; quien venía de camino ya no llega. */
  devResolve(t: number): string {
    const p = this.dayAt(t);
    const phase = phaseAt(p, t);
    if (phase !== 'setup' && phase !== 'active') return 'no hay concentración en marcha';
    const dispersalAt = t;
    const cleanupAt = t + DISPERSE;
    const members = p.members.map((m, i) => {
      const leave = t + ((i * 7) % (DISPERSE - 2)) + 1;
      return m.arrive > t ? { ...m, arrive: leave, leave } : { ...m, leave: Math.min(m.leave, leave) };
    });
    // Una copia (la del calendario está en la caché de días y no se toca).
    const own: ProtestDay = { ...p, activeAt: Math.min(p.activeAt, t), dispersalAt, cleanupAt, end: cleanupAt + CLEANUP, members };
    DEV.set(this.def.id, { ...DEV.get(this.def.id), forced: own });
    return 'se disuelve: la gente se va';
  }

  /** La quita ya: la plaza queda vacía hasta que acabe la de hoy del calendario. */
  devCancel(t: number): string {
    const natural = this.naturalAt(t);
    const forced = DEV.get(this.def.id)?.forced;
    DEV.set(this.def.id, { clearUntil: Math.max(t, natural.happens ? natural.end : t, forced ? forced.end : t) });
    return 'cancelada: la plaza queda vacía';
  }

  /** Vuelve al calendario: quita lo forzado y lo cancelado. El enfriamiento del calendario sale de la semilla y no se toca. */
  devReset(): void {
    DEV.delete(this.def.id);
  }
}
