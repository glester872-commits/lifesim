// Sin Phaser: lo usan el juego (depuración) y scripts/check-world.ts.
import type { PointKind } from '../types/game.ts';
import { PLACES, type PlaceDef, type PlaceType } from '../data/places.ts';
import { allLocations, getLocation } from './LocationSystem.ts';
import { findPoint } from './Navigation.ts';
import { weekday, weekIndex } from './MetroDaily.ts';

/**
 * Lo que un sistema de personajes necesita saber de un lugar, resuelto a partir
 * de los edificios y los puntos: nada de esto se escribe dos veces.
 */
export interface PlaceInfo extends PlaceDef {
  /** Localización donde está la puerta (la calle). */
  locationId: string;
  /** Interior al que lleva la puerta, si tiene. */
  interior?: string;
  /** Puntos de calle por los que se llega: la puerta o, en la plaza, los anclajes. */
  entrances: string[];
  /** Puntos junto a la puerta, por dentro. */
  exits: string[];
  /** Mostradores, máquinas, armarios: donde se hará algo. */
  interactionPoints: string[];
  /** Dónde aparece un NPC que sale de aquí: la puerta de su portal o de la estación. */
  npcSpawnPoints: string[];
  /** A dónde puede ir un NPC que viene a este lugar. */
  npcDestinations: string[];
}

const BUILDINGS = new Map(allLocations().flatMap((loc) => (loc.buildings ?? []).map((b) => [b.id, { b, loc: loc.id }] as const)));
const DESTINATION_KINDS: readonly PointKind[] = ['seat', 'meet', 'work', 'interact', 'wait'];

function pointsIn(location: string, kinds: readonly PointKind[]): string[] {
  return Object.entries(getLocation(location).points ?? {})
    .filter(([, p]) => kinds.includes(p.kind))
    .map(([id]) => id);
}

function resolve(def: PlaceDef): PlaceInfo {
  const building = def.building ? BUILDINGS.get(def.building) : undefined;
  if (def.building && !building) throw new Error(`Lugar ${def.id}: edificio desconocido ${def.building}`);
  if (building && !building.b.point) throw new Error(`Lugar ${def.id}: el edificio ${def.building} no tiene punto de entrada`);
  for (const a of def.anchors ?? []) if (!findPoint(a)) throw new Error(`Lugar ${def.id}: punto desconocido ${a}`);
  if (!building && !def.anchors?.length) throw new Error(`Lugar ${def.id}: sin edificio ni anclajes, no se puede llegar`);

  const interior = building?.b.enter?.location;
  const entrances = building?.b.point ? [building.b.point] : [...(def.anchors ?? [])];
  const anchors = def.anchors ?? [];
  const locationId = building?.loc ?? findPoint(anchors[0])!.location;
  const exits = interior ? pointsIn(interior, ['exit']) : [];
  return {
    ...def,
    locationId,
    interior,
    entrances,
    exits,
    interactionPoints: interior ? pointsIn(interior, ['interact']) : [],
    npcSpawnPoints: def.type === 'public' ? [] : entrances,
    npcDestinations: [...(interior ? pointsIn(interior, DESTINATION_KINDS) : []), ...anchors],
  };
}

const INFO = new Map<string, PlaceInfo>();
for (const def of PLACES) {
  if (INFO.has(def.id)) throw new Error(`Lugar repetido: ${def.id}`);
  INFO.set(def.id, resolve(def));
}

export function placeInfo(id: string): PlaceInfo | undefined {
  return INFO.get(id);
}

export function placesOfType(type: PlaceType): PlaceInfo[] {
  return [...INFO.values()].filter((p) => p.type === type);
}

export function placesTagged(tag: string): PlaceInfo[] {
  return [...INFO.values()].filter((p) => p.tags.includes(tag));
}

/** Lugar al que pertenece un punto (su entrada, un destino o una salida), si alguno. */
export function placeOfPoint(pointId: string): PlaceInfo | undefined {
  return [...INFO.values()].find(
    (p) => p.entrances.includes(pointId) || p.exits.includes(pointId) || p.npcDestinations.includes(pointId),
  );
}

/** ¿El horario pasa de medianoche (una discoteca de 21 a 6)? */
const overnight = (place: PlaceInfo): boolean => !!place.hours && place.hours[0] > place.hours[1];

/**
 * Día al que pertenece ese momento para el lugar: las 02:00 del sábado son
 * todavía la noche del viernes si abrió el viernes.
 */
export function openingDay(place: PlaceInfo, day: number, hour: number, minute = 0): number {
  return overnight(place) && hour + minute / 60 < place.hours![1] ? day - 1 : day;
}

/** ¿Está abierto a esa hora de ese día? Sin horario, siempre. Un cierre de 24 es medianoche. */
export function isOpen(place: PlaceInfo, day: number, hour: number, minute = 0): boolean {
  if (!place.hours) return true;
  const t = hour + minute / 60;
  const [open, close] = place.hours;
  const inHours = overnight(place) ? t >= open || t < close : t >= open && t < close;
  if (!inHours) return false;
  return !place.days || place.days.includes(weekIndex(openingDay(place, day, hour, minute)));
}

/** Lo que dice la puerta cerrada: «Abre jueves, viernes, sábado, de 21:00 a 06:00». */
export function hoursLabel(place: PlaceInfo): string {
  if (!place.hours) return 'Abierto siempre.';
  const hh = (h: number): string => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  // El día 1 es lunes: weekday(i + 1) nombra el índice i.
  const days = place.days ? ` ${place.days.map((d) => weekday(d + 1)).join(', ')},` : '';
  return `Abre${days} de ${hh(place.hours[0])} a ${hh(place.hours[1])}.`;
}

/** Lugar cuyo interior es esta localización (el gimnasio para 'gym'), si alguno. */
export function placeForInterior(locationId: string): PlaceInfo | undefined {
  return [...INFO.values()].find((p) => p.interior === locationId);
}
