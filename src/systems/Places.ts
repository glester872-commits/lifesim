// Sin Phaser: lo usan el juego (depuración) y scripts/check-world.ts.
import type { PointKind } from '../types/game.ts';
import { PLACES, type PlaceDef, type PlaceType } from '../data/places.ts';
import { allLocations, getLocation } from './LocationSystem.ts';
import { findPoint } from './Navigation.ts';

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

/** ¿Está abierto a esa hora? Sin horario, siempre. Un cierre de 24 es medianoche. */
export function isOpen(place: PlaceInfo, hour: number, minute = 0): boolean {
  if (!place.hours) return true;
  const t = hour + minute / 60;
  const [open, close] = place.hours;
  return t >= open && t < close;
}

/** Lugar cuyo interior es esta localización (el gimnasio para 'gym'), si alguno. */
export function placeForInterior(locationId: string): PlaceInfo | undefined {
  return [...INFO.values()].find((p) => p.interior === locationId);
}
