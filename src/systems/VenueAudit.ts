// Sin Phaser: lo usan el gancho de consola de main.ts (lifesim.venues), scenes/WorldScene (último error de
// transición) y scripts/check-ribera-venues.ts.
import { allLocations, getLocation, hasLocation, isStandable, isWalkable, ROADWAY } from './LocationSystem.ts';
import { hoursLabel, placesOfType, type PlaceInfo } from './Places.ts';
import { profileFor } from './Crowd.ts';
import type { LocationDef, TilePoint } from '../types/game.ts';

/**
 * Auditoría de los locales de un barrio: cada fachada que se ve, en uno de tres estados explícitos —
 * se entra (A), cerrada con horario (B: la misma puerta, que al pulsar dice que está cerrado y cuándo abre) o
 * no es un local público (C: viviendas, sin interacción) — y, de los que se entra, si todo cuadra: puerta
 * registrada, interior registrado, entrada y vuelta a la calle pisables, salida a la misma puerta, todo lo de
 * dentro alcanzable a pie desde la entrada, horario y gente. No es otro sistema: lee los mismos edificios,
 * lugares, interiores y perfiles de población que el juego.
 */
export interface VenueRow {
  building: string;
  name: string;
  place: string | null;
  kind: 'enterable' | 'residence' | 'kiosk';
  door: TilePoint | null;
  entrance: boolean;
  interior: string | null;
  interiorRegistered: boolean;
  exteriorSpawnOk: boolean;
  interiorSpawnOk: boolean;
  exitReturnsHere: boolean;
  pathsOk: boolean;
  unreachable: string[];
  hours: string;
  population: boolean;
  problems: string[];
}

/** Último error al cambiar de escena (WorldScene.go): para el auditor en desarrollo. */
let lastError: { at: string; message: string } | null = null;
export function recordTransitionError(at: string, error: unknown): void {
  lastError = { at, message: error instanceof Error ? error.message : String(error) };
}
export function lastTransitionError(): { at: string; message: string } | null {
  return lastError;
}

const key = (t: TilePoint): string => `${t.tx},${t.ty}`;

/** Tiles pisables desde `from`, en cuatro direcciones (las reglas de colisión del juego). */
function reach(loc: LocationDef, from: TilePoint): Set<string> {
  const seen = new Set([key(from)]);
  const queue = [from];
  while (queue.length) {
    const { tx, ty } = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { tx: tx + dx, ty: ty + dy };
      if (seen.has(key(n)) || !isWalkable(loc, n.tx, n.ty)) continue;
      seen.add(key(n));
      queue.push(n);
    }
  }
  return seen;
}

/** Se llega a pie: el tile mismo o, si es un mueble o una máquina, uno de los de al lado. */
const touches = (loc: LocationDef, seen: Set<string>, t: TilePoint): boolean =>
  seen.has(key(t)) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(key({ tx: t.tx + dx, ty: t.ty + dy }))) || (isStandable(loc, t.tx, t.ty) && seen.has(key(t)));

function placeOfBuilding(id: string): PlaceInfo | undefined {
  return [...placesOfType('business'), ...placesOfType('residence'), ...placesOfType('home'), ...placesOfType('public')].find((p) => p.building === id);
}

export function auditVenues(locationId: string): VenueRow[] {
  const street = getLocation(locationId);
  const npcTiles = new Set(street.npcs.map((n) => key(n)));
  const rows: VenueRow[] = [];
  for (const b of street.buildings ?? []) {
    const place = placeOfBuilding(b.id);
    const residence = !place || place.type === 'residence' || place.type === 'home';
    const problems: string[] = [];
    const door = b.doorX !== undefined && b.point ? street.points?.[b.point] ?? null : null;
    const interiorId = b.enter?.location ?? null;
    const interior = interiorId && hasLocation(interiorId) ? getLocation(interiorId) : null;
    // Vuelta a la calle: el spawn que genera el edificio (LocationSystem), pisable, fuera del carril y sin nadie encima.
    const back = street.spawns[b.id];
    const exteriorSpawnOk = !interiorId || (!!back && isWalkable(street, back.tx, back.ty) && !ROADWAY.has(street.ground[back.ty]?.[back.tx] ?? '') && !npcTiles.has(key(back)));
    const entry = interior?.spawns.entry;
    const interiorSpawnOk = !interior || (!!entry && isWalkable(interior, entry.tx, entry.ty));
    const exitReturnsHere = !interior || interior.portals.some((p) => !p.train && p.to.location === street.id && p.to.spawn === b.id);
    const unreachable: string[] = [];
    if (interior && entry) {
      const seen = reach(interior, entry);
      const targets: [string, TilePoint][] = [
        ...interior.portals.map((p): [string, TilePoint] => [`salida ${p.id}`, p]),
        ...Object.entries(interior.points ?? {}).map(([id, p]): [string, TilePoint] => [id, p]),
        ...(interior.terminals ?? []).map((t): [string, TilePoint] => [t.name, t]),
        ...(interior.racks ?? []).map((r): [string, TilePoint] => [r.name, r]),
        ...(interior.inspects ?? []).map((i): [string, TilePoint] => [i.name, i]),
        ...(interior.spots ?? []).map((s): [string, TilePoint] => [s.name, s]),
      ];
      for (const [id, t] of targets) if (!touches(interior, seen, t)) unreachable.push(id);
    }
    const row: VenueRow = {
      building: b.id,
      name: b.name,
      place: place?.id ?? null,
      kind: residence ? 'residence' : 'enterable',
      door,
      entrance: !!b.point && b.doorX !== undefined,
      interior: interiorId,
      interiorRegistered: !interiorId || !!interior,
      exteriorSpawnOk,
      interiorSpawnOk,
      exitReturnsHere,
      pathsOk: unreachable.length === 0,
      unreachable,
      hours: place && !residence ? hoursLabel(place) : '—',
      population: !!place && !!profileFor(place.id),
      problems,
    };
    // Un local que se presenta como tal (un lugar de negocio con fachada) tiene que poder entrarse: nunca una puerta muda.
    if (!residence && !interiorId) problems.push('local con fachada y sin interior: puerta que no lleva a ninguna parte');
    if (!row.interiorRegistered) problems.push(`interior ${interiorId} sin registrar`);
    if (!row.exteriorSpawnOk) problems.push('la vuelta a la calle no es pisable (o cae en el carril o sobre alguien)');
    if (!row.interiorSpawnOk) problems.push('la entrada del interior no es pisable');
    if (!row.exitReturnsHere) problems.push('la salida no devuelve a esta puerta');
    if (!row.pathsOk) problems.push(`no se llega a pie a: ${unreachable.join(', ')}`);
    if (!residence && !place?.hours) problems.push('sin horario');
    if (interiorId && !residence && !row.population) problems.push('sin perfil de gente (data/population.ts)');
    rows.push(row);
  }
  // Locales sin edificio (un quiosco en la calle): se atienden por su mostrador, no tienen puerta.
  for (const place of placesOfType('business')) {
    if (place.locationId !== locationId || place.building) continue;
    const counter = (street.terminals ?? []).some((t) => t.name === place.name);
    rows.push({
      building: '—', name: place.name, place: place.id, kind: 'kiosk', door: null, entrance: false, interior: null, interiorRegistered: true,
      exteriorSpawnOk: true, interiorSpawnOk: true, exitReturnsHere: true, pathsOk: true, unreachable: [], hours: hoursLabel(place), population: false,
      problems: counter ? [] : ['quiosco sin mostrador en la calle'],
    });
  }
  return rows;
}

/** Todos los barrios con fachadas: para el auditor de desarrollo. */
export function auditableLocations(): string[] {
  return allLocations().filter((l) => l.kind === 'exterior' && (l.buildings?.length ?? 0) > 0).map((l) => l.id);
}
