// Sin Phaser: lo usan scenes/Menus (el tablón del barrio) y scripts/check-boards.ts.
import { POPUPS, type PopUpDef } from '../data/popups.ts';
import { STREET_ACTS } from '../data/streetActs.ts';
import { ARENA_CLUB, ARENA_MATCHES } from '../data/cityEvents.ts';
import { WEEK, WEEKDAY_LABEL, nightOwner, weekIndex } from './Calendar.ts';
import { activePopUp, upcoming } from './PopUps.ts';
import { matchNow, upcomingMatches } from './Match.ts';
import { actOn } from './StreetActs.ts';
import { hoursLabel, hoursOn, isOpen, nextOpening, openingDay, placeInfo, type PlaceInfo } from './Places.ts';
import { districtAt, worldTree, type WorldClock } from './World.ts';
import { weatherAt } from './Weather.ts';

/**
 * El tablón del barrio: lo que hay cerca y cuándo, leído del mundo en el momento de mirarlo. No guarda nada ni
 * repite datos: los horarios salen de systems/Places, los eventos de systems/PopUps y del reloj del partido
 * (systems/Match), y quien actúa en la calle de systems/StreetActs. Se calcula al abrirlo (y al volver a una
 * sección), nunca por frame. Lo que no es público no sale: ni peleas, ni trapicheo, ni personajes, ni oficinas.
 *
 * Un tablón lista los barrios de su mapa, el suyo primero (el de Vallesco también trae la Calle Vintage). Sin
 * eventos esta semana lo dice; los negocios siguen ahí.
 */

export type SectionId = 'eat' | 'shop' | 'services' | 'events';
export type EntryState = 'open' | 'closed' | 'active' | 'today' | 'later' | 'ended' | 'cancelled';

export interface BoardEntry {
  label: string;
  /** Estado corto a la derecha: «hasta 22:00», «abre mañana 09:00», «terminado». */
  detail: string;
  /** Lo que se lee al elegirlo: el horario entero o de qué va el evento. */
  note: string;
  state: EntryState;
}

export interface BoardSection {
  id: SectionId;
  title: string;
  entries: BoardEntry[];
  /** Lo que dice si no hay nada (sólo eventos: las demás secciones vacías no se enseñan). */
  empty?: string;
}

export interface Board {
  title: string;
  intro: string;
  sections: BoardSection[];
}

type Ranked = BoardEntry & { order: number };

const TITLES: Readonly<Record<SectionId, string>> = { eat: 'Comer y beber', shop: 'Compras', services: 'Servicios y ocio', events: 'Eventos y actividades' };

/** Lo que es servicio u ocio cuando no se vende nada en mostrador. */
const LEISURE = new Set(['service', 'health', 'sport', 'leisure', 'civic', 'study', 'art', 'game']);

/** A qué sección va un negocio por sus etiquetas, o a ninguna (oficinas y bancos: sólo `work`). */
export function sectionOf(tags: readonly string[]): Exclude<SectionId, 'events'> | null {
  const has = (t: string): boolean => tags.includes(t);
  if ((has('food') || has('nightlife')) && !has('shop')) return 'eat';
  if (has('service') || (!has('shop') && tags.some((t) => LEISURE.has(t)))) return 'services';
  return has('shop') ? 'shop' : null;
}

const hh = (h: number): string => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/** «hoy», «mañana» o el día de la semana, contado desde la fecha del reloj (no desde la noche). */
function dayWord(day: number, today: number): string {
  if (day === today) return 'hoy';
  if (day === today + 1) return 'mañana';
  return WEEKDAY_LABEL[WEEK[weekIndex(day)]];
}

/** Los barrios del mapa del tablón: el del tile primero, luego los demás que comparten mapa, en el orden del mundo. */
export function boardDistricts(location: string, tx: number, ty: number): { id: string; name: string; places: readonly string[] }[] {
  const own = districtAt(location, tx, ty);
  const nodes = worldTree().filter((n) => n.maps.includes(location));
  return [...nodes.filter((n) => n.id === own), ...nodes.filter((n) => n.id !== own)];
}

function placeEntry(p: PlaceInfo, c: WorldClock, prefix: string): Ranked {
  const now = (c.day - 1) * 1440 + c.hour * 60 + c.minute;
  const note = prefix + hoursLabel(p);
  if (isOpen(p, c.day, c.hour, c.minute)) {
    const h = hoursOn(p, weekIndex(openingDay(p, c.day, c.hour, c.minute)));
    const allDay = !h || (h[0] === 0 && h[1] === 24);
    return { label: p.name, detail: allDay ? 'abierto 24 h' : `abierto · hasta ${hh(h[1])}`, note, state: 'open', order: 0 };
  }
  const next = nextOpening(p, c.day, c.hour, c.minute);
  const detail = next ? `abre ${dayWord(next.day, c.day)} ${hh(next.hour)}` : 'cerrado';
  const order = next ? (next.day - 1) * 1440 + next.hour * 60 - now : Infinity;
  return { label: p.name, detail, note, state: 'closed', order };
}

/** Un evento de calle en la semana: en marcha, hoy, más adelante, suspendido por la lluvia o terminado. */
function popUpEntry(def: PopUpDef, days: readonly number[], c: WorldClock, prefix: string): Ranked {
  const [a, b] = def.hours;
  const end = b <= a ? b + 24 : b;
  const hours = `${hh(a)}–${hh(b)}`;
  const owner = nightOwner(c.day, c.hour);
  // La hora en la jornada de su noche: a las 00:30 del domingo, las 24:30 del sábado.
  const t = c.hour + c.minute / 60 + (owner !== c.day ? 24 : 0);
  const note = prefix + `${def.name}, ${hours}.${def.outdoor ? ' Al aire libre: con lluvia fuerte se suspende.' : ''}`;
  const later = (d: number): Ranked =>
    ({ label: def.name, detail: `${dayWord(d, c.day)} ${hours}`, note, state: d === c.day ? 'today' : 'later', order: (d - owner) * 1440 + a * 60 - t * 60 });
  if (activePopUp(def.location, c)?.id === def.id) return { label: def.name, detail: `ahora · hasta ${hh(b)}`, note, state: 'active', order: -2 };
  const next = days.find((d) => d > owner);
  if (days.includes(owner)) {
    // Dentro de su horario y sin montar: sólo pasa con lluvia fuerte (systems/PopUps).
    if (t >= a && t < end) return { label: def.name, detail: 'suspendido por la lluvia', note: prefix + `${def.name}: suspendido mientras llueva fuerte; si escampa a tiempo, se monta.`, state: 'cancelled', order: 1e6 };
    if (t < a) return later(owner);
    if (next !== undefined) return later(next);
    return { label: def.name, detail: 'terminado', note: prefix + `${def.name}: ya ha terminado por hoy.`, state: 'ended', order: 1e6 + 1 };
  }
  return later(next!);
}

function eventEntries(location: string, districts: readonly string[], c: WorldClock, prefixOf: (district: string | undefined) => string): Ranked[] {
  const out: Ranked[] = [];
  const owner = nightOwner(c.day, c.hour);
  const t = c.hour * 60 + c.minute + (owner !== c.day ? 1440 : 0);
  // Eventos de calle de este mapa en la semana que empieza hoy (la madrugada cuenta con su noche).
  const plan = upcoming(location, owner, 7);
  for (const def of POPUPS) {
    if (def.location !== location) continue;
    const days = plan.filter((s) => s.id === def.id).map((s) => s.day);
    if (!days.length) continue;
    const prop = def.props[0];
    out.push(popUpEntry(def, days, c, prefixOf(districtAt(location, prop?.tx, prop?.ty))));
  }
  // El partido del Estadio del Halcón, en el tablón de su barrio.
  if (districts.includes(ARENA_MATCHES.district)) {
    const live = matchNow(c);
    for (const m of upcomingMatches(owner, 7)) {
      const label = `${ARENA_CLUB.short} – ${m.rival}`;
      const note = prefixOf(ARENA_MATCHES.district) + `${ARENA_MATCHES.name}: saque a las ${hh(m.kickoff / 60)}. Desde horas antes se llenan la calle, los bares y el metro.`;
      const phase = live && live.day === m.day ? live.phase : null;
      const mins = (m.day - owner) * 1440 + m.kickoff - t;
      if (phase === 'live') out.push({ label, detail: 'en juego', note, state: 'active', order: -2 });
      else if (phase === 'leaving' || phase === 'after' || mins < 0) out.push({ label, detail: 'terminado', note, state: 'ended', order: 1e6 + 1 });
      else out.push({ label, detail: `${dayWord(m.day, c.day)} ${hh(m.kickoff / 60)}`, note, state: m.day === c.day ? 'today' : 'later', order: mins });
    }
  }
  // Quien actúa ahora en la calle (música, baile, estatua): sólo mientras está. Los vendedores de manta no se anuncian.
  const weather = weatherAt(c.day, c.hour + c.minute / 60);
  for (const act of STREET_ACTS) {
    if (act.location !== location || act.kind === 'vendor' || !actOn(act, c, weather)) continue;
    out.push({ label: act.label, detail: 'ahora', note: prefixOf(districtAt(location)) + `${act.label}: ahora mismo, en la calle.`, state: 'active', order: -1 });
  }
  return out.sort((x, y) => x.order - y.order);
}

const plain = ({ label, detail, note, state }: BoardEntry): BoardEntry => ({ label, detail, note, state });

/** El tablón que está en ese tile, a esa hora. Puro: misma hora, mismo tablón. */
export function boardAt(location: string, tx: number, ty: number, c: WorldClock): Board {
  const districts = boardDistricts(location, tx, ty);
  const name = (id: string | undefined): string => districts.find((d) => d.id === id)?.name ?? '';
  // Con dos barrios en el mismo mapa, cada cosa dice de cuál es.
  const prefixOf = (id: string | undefined): string => (districts.length > 1 && name(id) ? `${name(id)}. ` : '');
  const buckets: Record<Exclude<SectionId, 'events'>, (Ranked & { rank: number })[]> = { eat: [], shop: [], services: [] };
  districts.forEach((d, rank) => {
    for (const id of d.places) {
      const p = placeInfo(id);
      if (!p || p.type !== 'business' || !p.hours) continue;
      const section = sectionOf(p.tags);
      if (section) buckets[section].push({ ...placeEntry(p, c, prefixOf(d.id)), rank });
    }
  });
  const sections: BoardSection[] = (['eat', 'shop', 'services'] as const)
    .filter((id) => buckets[id].length)
    .map((id) => ({
      id,
      title: TITLES[id],
      entries: buckets[id].sort((x, y) => x.rank - y.rank || x.order - y.order || x.label.localeCompare(y.label, 'es')).map(plain),
    }));
  const events = eventEntries(location, districts.map((d) => d.id), c, prefixOf).map(plain);
  const here = districts.map((d) => d.name).join(' y ') || 'el barrio';
  sections.push({ id: 'events', title: TITLES.events, entries: events, empty: `No hay eventos anunciados en ${here} esta semana. Los horarios de los locales siguen en las otras secciones.` });
  const open = sections.reduce((n, s) => n + (s.id === 'events' ? 0 : s.entries.filter((e) => e.state === 'open').length), 0);
  return {
    title: `Tablón · ${here}`,
    intro: `${open === 1 ? 'Un local abierto' : `${open} locales abiertos`} ahora.${events.length ? '' : ' Sin eventos esta semana.'}`,
    sections,
  };
}
