// Sin Phaser: lo usan el juego (depuración) y scripts/check-world.ts.
import type { LocationDef, PointDef, PointKind, TilePoint } from '../types/game.ts';
import { allLocations, getLocation, isWalkable } from './LocationSystem.ts';
import { PROPS } from '../world/tiles.ts';

/**
 * Destinos del mundo para los NPC que vendrán. Un personaje no lleva rutas
 * escritas: pide un punto por id (CAFE_TABLE_01) o por tipo (cualquier 'seat')
 * y camina por el grafo de su localización. Aquí no hay IA, sólo el contrato.
 */
export interface WorldPoint extends PointDef {
  id: string;
  location: string;
}

const POINTS = new Map<string, WorldPoint>();
for (const loc of allLocations()) {
  for (const [id, p] of Object.entries(loc.points ?? {})) POINTS.set(id, { ...p, id, location: loc.id });
}

export function findPoint(id: string): WorldPoint | undefined {
  return POINTS.get(id);
}

export function pointsOfKind(kind: PointKind, location?: string): WorldPoint[] {
  return [...POINTS.values()].filter((p) => p.kind === kind && (location === undefined || p.location === location));
}

const inGraph = (loc: LocationDef, id: string): boolean => (loc.links ?? []).some(([a, b]) => a === id || b === id);

/**
 * Camino entre dos puntos de la misma localización. En la calle sigue el grafo
 * de peatones (aceras, pasos de cebra); en un interior, que no lo necesita,
 * recorre la cuadrícula esquivando muebles y a los NPC que están quietos.
 * null si no hay camino.
 */
export function route(fromId: string, toId: string): TilePoint[] | null {
  const from = POINTS.get(fromId);
  const to = POINTS.get(toId);
  if (!from || !to || from.location !== to.location) return null;
  const loc = getLocation(from.location);
  if (!inGraph(loc, fromId) || !inGraph(loc, toId)) return gridRoute(loc, from, to);
  return graphRoute(loc, fromId, toId);
}

/**
 * ponytail: Dijkstra con búsqueda lineal del mínimo, O(n²); con ~100 nodos
 * por barrio sobra. Si un mapa pasa de mil nodos, cola de prioridad.
 */
function graphRoute(loc: LocationDef, fromId: string, toId: string): TilePoint[] | null {
  const points = loc.points ?? {};
  const adj = new Map<string, [string, number][]>();
  const link = (a: string, b: string, d: number): void => {
    const list = adj.get(a) ?? [];
    list.push([b, d]);
    adj.set(a, list);
  };
  for (const [a, b] of loc.links ?? []) {
    const d = Math.hypot(points[a].tx - points[b].tx, points[a].ty - points[b].ty);
    link(a, b, d);
    link(b, a, d);
  }
  const dist = new Map<string, number>([[fromId, 0]]);
  const prev = new Map<string, string>();
  const open = new Set([fromId]);
  while (open.size > 0) {
    let cur = '';
    for (const id of open) if (cur === '' || (dist.get(id) ?? 0) < (dist.get(cur) ?? 0)) cur = id;
    open.delete(cur);
    if (cur === toId) break;
    for (const [next, d] of adj.get(cur) ?? []) {
      const nd = (dist.get(cur) ?? 0) + d;
      if (nd < (dist.get(next) ?? Infinity)) {
        dist.set(next, nd);
        prev.set(next, cur);
        open.add(next);
      }
    }
  }
  if (!dist.has(toId)) return null;
  const path: TilePoint[] = [];
  for (let id: string | undefined = toId; id; id = prev.get(id)) path.unshift({ tx: points[id].tx, ty: points[id].ty });
  return path;
}

/**
 * Anchura primero por tiles transitables; los NPC quietos cuentan como muebles, y
 * los asientos (sillón de barbero, camilla de tatuaje) también: no colisionan
 * porque alguien se sienta encima, pero de camino a otra parte se rodean.
 */
function gridRoute(loc: LocationDef, a: TilePoint, b: TilePoint): TilePoint[] | null {
  const key = (p: TilePoint): string => `${p.tx},${p.ty}`;
  const blocked = new Set([...loc.npcs.map(key), ...loc.props.filter((p) => PROPS[p.kind].seat).map(key)]);
  const goal = key(b);
  const prev = new Map<string, TilePoint | null>([[key(a), null]]);
  const queue: TilePoint[] = [a];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (key(cur) === goal) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { tx: cur.tx + dx, ty: cur.ty + dy };
      const k = key(next);
      if (prev.has(k) || !isWalkable(loc, next.tx, next.ty) || (blocked.has(k) && k !== goal)) continue;
      prev.set(k, cur);
      queue.push(next);
    }
  }
  if (!prev.has(goal)) return null;
  const path: TilePoint[] = [];
  for (let p: TilePoint | null | undefined = b; p; p = prev.get(key(p))) path.unshift({ tx: p.tx, ty: p.ty });
  return path;
}

// ------------------------------------------------------------ entre puertas

/** Cada interior con su salida por dentro y su entrada por fuera, sacado de los edificios. */
const DOORS = new Map<string, { exit: string; entrance: string; outside: string }>();
for (const loc of allLocations()) {
  for (const b of loc.buildings ?? []) {
    if (!b.enter || !b.point) continue;
    const exit = Object.entries(getLocation(b.enter.location).points ?? {}).find(([, p]) => p.kind === 'exit')?.[0];
    if (exit) DOORS.set(b.enter.location, { exit, entrance: b.point, outside: loc.id });
  }
}

export interface Leg {
  location: string;
  path: TilePoint[];
}

/**
 * Ruta de un punto a otro aunque estén en sitios distintos: salir por la
 * puerta del interior, cruzar la calle y entrar por la del destino. Cada tramo
 * es de una localización; quien camine cambia de localización entre tramos,
 * igual que el jugador al cruzar un portal. null si algún tramo no existe
 * (p. ej. otro barrio: a Ribera se va entrando en METRO_ENTRANCE).
 */
export function worldRoute(fromId: string, toId: string): Leg[] | null {
  const from = POINTS.get(fromId);
  const to = POINTS.get(toId);
  if (!from || !to) return null;
  const legs: Leg[] = [];
  const add = (a: string, b: string): boolean => {
    if (a === b) return true;
    const path = route(a, b);
    if (path) legs.push({ location: POINTS.get(a)!.location, path });
    return path !== null;
  };
  if (from.location === to.location) return add(fromId, toId) ? legs : null;

  const out = DOORS.get(from.location);
  const inn = DOORS.get(to.location);
  if (out && !add(fromId, out.exit)) return null;
  const start = out ? out.entrance : fromId;
  const end = inn ? inn.entrance : toId;
  if (POINTS.get(start)?.location !== POINTS.get(end)?.location) return null;
  if (!add(start, end)) return null;
  if (inn && !add(inn.exit, toId)) return null;
  return legs;
}

/** Camino por tiles dentro de una localización, entre dos tiles cualesquiera. */
export function tilePath(loc: LocationDef, from: TilePoint, to: TilePoint): TilePoint[] | null {
  return gridRoute(loc, from, to);
}
