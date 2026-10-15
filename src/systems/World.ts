// Sin Phaser: lo usan main.ts (lifesim.world), MetroSystem (megafonía) y scripts/check-world-integration.ts.
import { DISTRICT_IDENTITIES, LOCATION_DISTRICT } from '../data/districtIdentity.ts';
import { ZONES } from '../data/zones.ts';
import { PLACES } from '../data/places.ts';
import { POPUPS } from '../data/popups.ts';
import { STREET_ACTS } from '../data/streetActs.ts';
import { STREET_EVENTS } from '../data/streetEvents.ts';
import { STOPS } from '../data/transit.ts';
import { CHARACTERS } from '../data/characters.ts';
import { ARENA_MATCHES } from '../data/cityEvents.ts';
import { byPhase, matchPhase } from './Match.ts';
import { allLocations, getLocation, hasLocation } from './LocationSystem.ts';
import { findPoint } from './Navigation.ts';
import { isOpen, placeInfo, type PlaceInfo } from './Places.ts';
import { activePopUp } from './PopUps.ts';
import { actOn } from './StreetActs.ts';
import { StreetEvent } from './StreetEvents.ts';
import { whereabouts } from './Characters.ts';
import { destinationsFrom } from './Transit.ts';
import { districtDensity, identityOf, zoneAt } from './Zones.ts';
import { nightOwner, weekIndex } from './Calendar.ts';
import { weatherAt } from './Weather.ts';

/**
 * La ciudad como un todo: MUNDO → BARRIO → ZONA → LUGAR → ACTIVIDAD. Nada de esto es estado nuevo ni otro
 * gestor: es la vista de conjunto de lo que ya sale del reloj (todo en el juego es función del día y la hora,
 * con semilla), para responder «qué pasa ahora en la ciudad» sin cargar ningún mapa ni simular a nadie.
 *
 *   barrio    data/districtIdentity.ts (carácter) + LOCATION_DISTRICT (sus mapas)
 *   zona      data/zones.ts (districtId: la Calle del Carmen es un barrio propio dentro del mapa de Vallesco)
 *   lugar     data/places.ts (su barrio, el de la zona de su puerta)
 *   actividad Characters (rutinas), PopUps, StreetActs, StreetEvents, Places (horario), el partido del Arena
 *
 * Simulación lejos del jugador: el sitio cargado lo simula su escena entera (y, más allá de 30 tiles, a pasos
 * gruesos: systems/StreetLife). El resto de la ciudad no existe en memoria: `cityAt(reloj)` lo calcula al
 * pedirlo, y como es determinista, al llegar a un barrio está exactamente como decía.
 */

export interface WorldClock {
  day: number;
  hour: number;
  minute: number;
}

// ---------------------------------------------------------------- jerarquía

/** El barrio de un sitio (sin tile) o de un tile concreto (la zona manda: el Carmen dentro de Vallesco). */
export function districtAt(location: string, tx?: number, ty?: number): string | undefined {
  const zone = tx !== undefined && ty !== undefined ? zoneAt(location, tx, ty)?.districtId : undefined;
  return zone ?? homeDistrict(location);
}

const homes = new Map<string, string | undefined>();

/** Un interior es del barrio de la calle a la que sale (subiendo puertas: el vestuario, al gimnasio, a la calle). */
function homeDistrict(location: string, seen: ReadonlySet<string> = new Set()): string | undefined {
  if (location in LOCATION_DISTRICT) return LOCATION_DISTRICT[location];
  if (homes.has(location)) return homes.get(location);
  let found: string | undefined;
  for (const p of getLocation(location).portals) {
    if (seen.has(p.to.location) || p.train) continue;
    found = homeDistrict(p.to.location, new Set([...seen, location]));
    if (found) break;
  }
  homes.set(location, found);
  return found;
}

const placeDistricts = new Map<string, string | undefined>();

export function placeDistrict(place: PlaceInfo): string | undefined {
  if (!placeDistricts.has(place.id)) {
    const p = findPoint(place.entrances[0]);
    placeDistricts.set(place.id, p ? districtAt(p.location, p.tx, p.ty) : homeDistrict(place.locationId));
  }
  return placeDistricts.get(place.id);
}

export interface DistrictNode {
  id: string;
  name: string;
  tagline: string;
  /** Mapas de calle donde está (vacío: todavía sin mapa, sólo estado lógico). */
  maps: string[];
  zones: string[];
  places: string[];
  /** Parada de metro propia o, si comparte mapa, la del barrio con el que lo comparte. */
  stop?: string;
}

let tree: DistrictNode[] | null = null;

/** El árbol entero, hecho una vez de los datos: ningún barrio se declara dos veces. */
export function worldTree(): readonly DistrictNode[] {
  if (tree) return tree;
  const streets = allLocations().filter((l) => l.kind !== 'interior').map((l) => l.id);
  const infos = PLACES.map((p) => placeInfo(p.id)!);
  const nodes: DistrictNode[] = Object.entries(DISTRICT_IDENTITIES).map(([id, d]) => {
    const zones = ZONES.filter((z) => z.districtId === id);
    const maps = [...new Set([...streets.filter((s) => LOCATION_DISTRICT[s] === id), ...zones.map((z) => z.location)])];
    return { id, name: d.name, tagline: d.tagline, maps, zones: zones.map((z) => z.id), places: infos.filter((p) => placeDistrict(p) === id).map((p) => p.id) };
  });
  const exitOf = (station: string): string | undefined => getLocation(station).portals.find((p) => p.id === 'exit')?.to.location;
  for (const node of nodes) {
    const own = STOPS.find((s) => s.station && LOCATION_DISTRICT[s.station] === node.id);
    node.stop = (own ?? STOPS.find((s) => s.station && node.maps.includes(exitOf(s.station) ?? '')))?.id;
  }
  return (tree = nodes);
}

export const districtNode = (id: string): DistrictNode | undefined => worldTree().find((d) => d.id === id);

// ---------------------------------------------------------------- viajar entre barrios

/**
 * Cómo se va de un barrio a otro. Mapas compartidos: andando, sin carga (Vallesco ↔ Calle del Carmen). Si no, en
 * metro entre sus paradas (minutos y tarifa, los mismos que cobra el andén). Un barrio sin mapa no tiene a dónde
 * llegar todavía. Cuando dos mapas se toquen por una calle, ese borde será un portal de calle y aquí 'walk'.
 */
export type Travel =
  | { mode: 'here' }
  | { mode: 'walk'; map: string }
  | { mode: 'metro'; from: string; to: string; minutes: number; fare: number }
  | { mode: 'none'; why: string };

export function travel(from: string, to: string): Travel {
  // Vale el barrio ('vallesco') o cualquier sitio del juego ('district', 'cafe', 'arena-station'): se viaja entre barrios.
  const node = (id: string): DistrictNode | undefined => districtNode(id) ?? (hasLocation(id) ? districtNode(districtAt(id) ?? '') : undefined);
  const a = node(from);
  const b = node(to);
  if (!a || !b) return { mode: 'none', why: 'barrio desconocido' };
  if (a.id === b.id) return { mode: 'here' };
  const map = a.maps.find((m) => b.maps.includes(m));
  if (map) return { mode: 'walk', map };
  if (!a.maps.length || !b.maps.length) return { mode: 'none', why: `${(a.maps.length ? b : a).name} aún no tiene mapa` };
  if (!a.stop || !b.stop) return { mode: 'none', why: 'sin parada de metro' };
  const leg = destinationsFrom(STOPS.find((s) => s.id === a.stop)!).find((d) => d.stop.id === b.stop)!;
  return { mode: 'metro', from: a.stop, to: b.stop, minutes: leg.minutes, fare: leg.fare };
}

// ---------------------------------------------------------------- sucesos de la ciudad

export interface CityEvent {
  id: string;
  name: string;
  district: string | undefined;
  location: string | null;
  kind: 'popup' | 'street-act' | 'fight' | 'match';
  phase: string;
}

// El reloj del partido vive en systems/Match.ts (sin dependencias: lo leen la calle, los bares y el metro).
export { matchOn, matchPhase } from './Match.ts';

const fights = new Map<string, StreetEvent>();

/** Todo lo que está pasando ahora en la ciudad, con su barrio. Nada se instancia en escena. */
export function cityEvents(c: WorldClock): CityEvent[] {
  const out: CityEvent[] = [];
  const weather = weatherAt(c.day, c.hour + c.minute / 60);
  for (const loc of new Set(POPUPS.map((p) => p.location))) {
    const p = activePopUp(loc, c);
    if (p) out.push({ id: p.id, name: p.name, district: districtAt(loc, p.props[0]?.tx, p.props[0]?.ty), location: loc, kind: 'popup', phase: 'abierto' });
  }
  for (const act of STREET_ACTS) {
    if (!actOn(act, c, weather)) continue;
    const pitch = findPoint(act.pitch[0]);
    out.push({ id: act.id, name: act.label, district: districtAt(act.location, pitch?.tx, pitch?.ty), location: act.location, kind: 'street-act', phase: act.kind });
  }
  const t = c.day * 1440 + c.hour * 60 + c.minute;
  for (const def of STREET_EVENTS) {
    let ev = fights.get(def.id);
    if (!ev) fights.set(def.id, (ev = new StreetEvent(def, getLocation(def.location))));
    const phase = ev.phase(t);
    if (phase !== 'none') out.push({ id: def.id, name: def.name, district: districtAt(def.location, def.area.tx, def.area.ty), location: def.location, kind: 'fight', phase });
  }
  const match = matchPhase(c);
  if (match) out.push({ id: 'arena-match', name: ARENA_MATCHES.name, district: ARENA_MATCHES.district, location: 'arena', kind: 'match', phase: match });
  return out;
}

// ---------------------------------------------------------------- la ciudad ahora

export interface DistrictStatus {
  id: string;
  name: string;
  /** Afluencia del barrio a esta hora (1 = la normal): la que multiplica la gente de todas sus zonas. */
  activity: number;
  /** Locales con horario abiertos / con horario. */
  open: number;
  hours: number;
  /** Hay noche: algún local de noche abierto (o, sin mapa, el barrio en su franja fuerte de noche). */
  nightlife: boolean;
  events: string[];
  /** Personajes con nombre que están aquí ahora (dentro de un local o en la calle). */
  people: string[];
}

export interface CityStatus {
  clock: WorldClock;
  weather: { rain: number; celsius: number };
  districts: DistrictStatus[];
  events: CityEvent[];
  /** Dónde está cada personaje con nombre, sin cargar su mapa: sale de su rutina y del reloj. */
  characters: { id: string; location: string; district: string | undefined; moving: boolean; inside: boolean }[];
}

/** El estado lógico de toda la ciudad a esa hora: lo que la escena verá al llegar a cada barrio. */
export function cityAt(c: WorldClock): CityStatus {
  const t = c.hour + c.minute / 60;
  const night = t >= 20 || t < 6;
  const weekend = weekIndex(nightOwner(c.day, c.hour)) >= 5;
  const w = weatherAt(c.day, t);
  const events = cityEvents(c);
  const abs = (c.day - 1) * 1440 + c.hour * 60 + c.minute;
  const characters = CHARACTERS.map((def) => {
    const where = whereabouts(def, abs);
    return { id: def.npc, location: where.location, district: districtAt(where.location, where.tx, where.ty), moving: where.moving, inside: where.inside };
  });
  const districts = worldTree().map((node) => {
    const places = node.places.map((id) => placeInfo(id)!).filter((p) => p.hours);
    const open = places.filter((p) => isOpen(p, c.day, c.hour, c.minute));
    const activity = districtDensity(identityOf(node.id), t, weekend) * byPhase(identityOf(node.id).match, c, 1);
    const nightlife = night && (node.maps.length ? open.some((p) => p.tags.includes('nightlife')) : activity >= 1.5 && (identityOf(node.id).groups.nightlife ?? 1) > 1.3);
    return {
      id: node.id,
      name: node.name,
      activity: Math.round(activity * 100) / 100,
      open: open.length,
      hours: places.length,
      nightlife,
      events: events.filter((e) => e.district === node.id).map((e) => e.name),
      people: characters.filter((ch) => ch.district === node.id).map((ch) => ch.id),
    };
  });
  return { clock: c, weather: { rain: w.rain, celsius: w.celsius }, districts, events, characters };
}
