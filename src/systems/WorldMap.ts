// Sin Phaser ni DOM: lo pinta ui/MapScreen.ts y lo comprueba scripts/check-map.ts.
import { TILE } from '../config/constants.ts';
import type { BuildingDef, LocationDef, Vec2 } from '../types/game.ts';
import { allLocations, getLocation, isWalkable } from './LocationSystem.ts';
import { findPoint } from './Navigation.ts';
import { placesOfType, type PlaceInfo } from './Places.ts';
import type { PlaceType } from '../data/places.ts';

/**
 * El mapa del mundo sale del mundo: el suelo de cada localización exterior, sus
 * edificios y sus lugares (data/places.ts). No hay un segundo dibujo del barrio
 * que mantener: si Vallesco crece, el mapa crece con él.
 *
 * Espacio del mapa = tiles con decimales: el centro del tile (tx, ty) es
 * (tx + 0.5, ty + 0.5). Todo lo que se sitúa en el mapa pasa por worldToMap o
 * tileToMap; la vista (MapViewport) convierte de ahí a píxeles de pantalla.
 */

// --------------------------------------------------------------- proyección

/** Posición del mundo (px, anclada a los pies como los sprites) → espacio del mapa. */
export function worldToMap(p: Vec2): Vec2 {
  return { x: p.x / TILE, y: p.y / TILE - 0.5 };
}

/** Centro de un tile en espacio del mapa. */
export function tileToMap(tx: number, ty: number): Vec2 {
  return { x: tx + 0.5, y: ty + 0.5 };
}

// ------------------------------------------------------------------ terreno

/** Lo que se ve en el mapa: pocas clases, no cada textura. */
export type Terrain = 'green' | 'path' | 'sidewalk' | 'plaza' | 'road' | 'bike' | 'crossing' | 'water' | 'rail' | 'court' | 'building';

const TERRAIN: Readonly<Record<string, Terrain>> = {
  g: 'green', d: 'green',
  c: 'path',
  ',': 'sidewalk', y: 'sidewalk',
  '~': 'plaza', P: 'plaza', T: 'plaza',
  '.': 'road', ':': 'road', '=': 'road',
  b: 'bike', z: 'crossing', k: 'court',
  a: 'water', q: 'water', R: 'rail',
};

function terrainOf(loc: LocationDef, tx: number, ty: number): Terrain {
  const known = TERRAIN[loc.ground[ty][tx]];
  if (known) return known;
  // Rejillas antiguas (Ribera): fachadas y tejados son tiles sólidos; lo pisable sin clase, acera.
  return isWalkable(loc, tx, ty) ? 'sidewalk' : 'building';
}

// ---------------------------------------------------------------- marcadores

/** Categoría de un punto del mapa: decide su icono. */
export type PoiCategory = 'home' | 'metro' | 'bus' | 'food' | 'night' | 'shop' | 'service' | 'sport' | 'work' | 'civic' | 'park' | 'plaza' | 'door';

export interface MapMarker {
  id: string;
  label: string;
  category: PoiCategory;
  /** Espacio del mapa. */
  x: number;
  y: number;
  /** Lugar de data/places.ts, si sale de uno: horario y demás detalles. */
  place?: PlaceInfo;
}

function categoryOf(p: PlaceInfo): PoiCategory {
  const tag = (t: string): boolean => p.tags.includes(t);
  const byType: Partial<Record<PlaceType, PoiCategory>> = { home: 'home', public: tag('sport') ? 'park' : 'plaza' };
  if (byType[p.type]) return byType[p.type]!;
  if (p.type === 'transit') return p.building ? 'metro' : 'bus';
  if (tag('nightlife')) return 'night';
  if (tag('food')) return 'food';
  if (tag('fashion') || tag('shop')) return 'shop';
  if (tag('service') || tag('health')) return 'service';
  if (tag('sport')) return 'sport';
  if (tag('civic') || tag('study')) return 'civic';
  return 'work';
}

/** Dónde va el marcador de un lugar: su puerta o, si es un espacio abierto, el centro de sus anclajes. */
function anchorOf(p: PlaceInfo): Vec2 | null {
  const ids = p.building || p.entrances.length ? p.entrances : p.npcDestinations;
  const pts = ids.map(findPoint).filter((x) => x !== undefined);
  if (pts.length === 0) return null;
  return tileToMap(pts.reduce((s, q) => s + q.tx, 0) / pts.length, pts.reduce((s, q) => s + q.ty, 0) / pts.length);
}

const ALL_PLACES = (['home', 'residence', 'business', 'transit', 'public'] as const).flatMap((t) => placesOfType(t));

// -------------------------------------------------------------------- mapa

export interface MapBuilding {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  /** Tu portal, un local, un bloque de vecinos o un fondo de tejados: cada uno con su tono. */
  kind: 'home' | 'place' | 'residential' | 'backdrop';
}

export interface MapArea {
  name: string;
  x: number;
  y: number;
}

export interface WorldMapData {
  id: string;
  name: string;
  width: number;
  height: number;
  terrain: Terrain[][];
  buildings: MapBuilding[];
  markers: MapMarker[];
  areas: MapArea[];
}

function buildingKind(b: BuildingDef): MapBuilding['kind'] {
  if (b.style === 'home') return 'home';
  if (!b.front) return 'backdrop';
  return b.style.startsWith('res-') ? 'residential' : 'place';
}

const cache = new Map<string, WorldMapData>();

/**
 * El mapa de una localización exterior. Los lugares salen de data/places.ts; un
 * exterior sin lugares todavía (Ribera) enseña sus puertas con el nombre del
 * portal. Se calcula una vez por localización.
 */
export function worldMapFor(locationId: string): WorldMapData {
  const hit = cache.get(locationId);
  if (hit) return hit;
  const loc = getLocation(locationId);
  const terrain = loc.ground.map((row, ty) => [...row].map((_, tx) => terrainOf(loc, tx, ty)));
  // Lo construido va encima del suelo que tapa.
  for (const b of loc.buildings ?? []) for (let y = b.ty; y < b.ty + b.h; y++) for (let x = b.tx; x < b.tx + b.w; x++) terrain[y][x] = 'building';

  const markers: MapMarker[] = [];
  for (const p of ALL_PLACES) {
    // Portales de vecinos: sin icono, ya se ven como edificio.
    if (p.locationId !== loc.id || p.type === 'residence') continue;
    const at = anchorOf(p);
    if (at) markers.push({ id: p.id, label: p.name, category: categoryOf(p), ...at, place: p });
  }
  // Puertas con portal que ningún lugar cubre (Ribera, andenes): el nombre del portal.
  for (const portal of loc.portals) {
    if (portal.train) continue;
    const at = tileToMap(portal.tx, portal.ty);
    if (markers.some((m) => Math.hypot(m.x - at.x, m.y - at.y) < 2)) continue;
    markers.push({ id: `portal:${portal.id}`, label: portal.label, category: getLocation(portal.to.location).metro ? 'metro' : 'door', ...at });
  }

  const data: WorldMapData = {
    id: loc.id,
    name: loc.name,
    width: loc.ground[0].length,
    height: loc.ground.length,
    terrain,
    buildings: (loc.buildings ?? []).map((b) => ({ x: b.tx, y: b.ty, w: b.w, h: b.h, name: b.name, kind: buildingKind(b) })),
    markers,
    areas: (loc.areas ?? []).map((a) => ({ name: a.name, ...tileToMap(a.tx, a.ty) })),
  };
  cache.set(locationId, data);
  return data;
}

// --------------------------------------------------------- dónde estás

export interface MapPosition {
  /** Localización exterior cuyo mapa se enseña. */
  mapId: string;
  /** Espacio del mapa. */
  x: number;
  y: number;
  /** Si estás dentro de algo: su nombre. */
  inside?: string;
}

/** Exterior al que da cada localización interior: la puerta (portal) por la que se entra desde fuera. */
const DOOR_OF = new Map<string, { mapId: string; tx: number; ty: number }>();
for (const loc of allLocations()) {
  if (loc.kind !== 'exterior') continue;
  for (const portal of loc.portals) {
    if (!portal.train && !DOOR_OF.has(portal.to.location)) DOOR_OF.set(portal.to.location, { mapId: loc.id, tx: portal.tx, ty: portal.ty });
  }
}

/**
 * Dónde está alguien en el mapa. En la calle, donde pisa; dentro de un interior
 * (o de un andén), en la puerta de su edificio, con el nombre del sitio: nunca se
 * pierde el barrio de vista. null si el sitio no cuelga de ningún exterior.
 */
export function mapPositionOf(locationId: string, position: Vec2): MapPosition | null {
  const loc = getLocation(locationId);
  if (loc.kind === 'exterior') return { mapId: loc.id, ...worldToMap(position) };
  const door = DOOR_OF.get(loc.id);
  return door ? { mapId: door.mapId, ...tileToMap(door.tx, door.ty), inside: loc.name } : null;
}

// ---------------------------------------------------------------- la vista

/**
 * Encuadre del mapa: qué punto del mapa está en el centro de la pantalla y
 * cuántos píxeles mide un tile. Toda conversión mapa ↔ pantalla pasa por aquí,
 * y `clamp` impide perder el mapa fuera de la pantalla.
 */
export class MapViewport {
  /** Centro del encuadre, en espacio del mapa. */
  cx = 0;
  cy = 0;
  /** Píxeles de pantalla por tile. */
  zoom = 8;
  minZoom = 2;
  readonly maxZoom = 32;
  private screenW = 1;
  private screenH = 1;
  private mapW = 1;
  private mapH = 1;

  setScreen(w: number, h: number): void {
    this.screenW = Math.max(1, w);
    this.screenH = Math.max(1, h);
    // Lo más lejos: el mapa entero con un margen.
    this.minZoom = Math.min(this.maxZoom, Math.max(1, Math.min(this.screenW / this.mapW, this.screenH / this.mapH) * 0.9));
    this.clamp();
  }

  setMap(w: number, h: number): void {
    this.mapW = w;
    this.mapH = h;
    this.setScreen(this.screenW, this.screenH);
  }

  toScreen(p: Vec2): Vec2 {
    return { x: (p.x - this.cx) * this.zoom + this.screenW / 2, y: (p.y - this.cy) * this.zoom + this.screenH / 2 };
  }

  toMap(s: Vec2): Vec2 {
    return { x: (s.x - this.screenW / 2) / this.zoom + this.cx, y: (s.y - this.screenH / 2) / this.zoom + this.cy };
  }

  centerOn(p: Vec2): void {
    this.cx = p.x;
    this.cy = p.y;
    this.clamp();
  }

  /** Mueve el encuadre `dx, dy` píxeles de pantalla (arrastrar). */
  panBy(dx: number, dy: number): void {
    this.cx -= dx / this.zoom;
    this.cy -= dy / this.zoom;
    this.clamp();
  }

  /** Acerca o aleja manteniendo quieto el punto de pantalla `at` (la rueda, los dedos). */
  zoomAt(factor: number, at: Vec2): void {
    const before = this.toMap(at);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    const after = this.toMap(at);
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
    this.clamp();
  }

  /** El centro no sale del mapa: siempre queda mapa a la vista. */
  clamp(): void {
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom));
    const halfW = this.screenW / 2 / this.zoom;
    const halfH = this.screenH / 2 / this.zoom;
    // Si el mapa cabe entero en ese eje, centrado; si no, sin enseñar vacío más allá del borde.
    this.cx = this.mapW <= halfW * 2 ? this.mapW / 2 : Math.min(this.mapW - halfW, Math.max(halfW, this.cx));
    this.cy = this.mapH <= halfH * 2 ? this.mapH / 2 : Math.min(this.mapH - halfH, Math.max(halfH, this.cy));
  }
}
