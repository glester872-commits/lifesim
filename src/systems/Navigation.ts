// Sin Phaser: lo usan el juego (depuración) y scripts/check-world.ts.
import type { LocationDef, PointDef, PointKind, TilePoint } from '../types/game.ts';
import { allLocations, getLocation, isWalkable, mountAt } from './LocationSystem.ts';

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
 * Anchura primero por tiles transitables; los NPC quietos cuentan como muebles.
 * A una máquina o un asiento (sólidos) sólo se sube quien acaba el camino en él.
 */
function gridRoute(loc: LocationDef, a: TilePoint, b: TilePoint, avoid?: ReadonlySet<string>): TilePoint[] | null {
  const key = (p: TilePoint): string => `${p.tx},${p.ty}`;
  const blocked = new Set([...loc.npcs.map(key), ...(avoid ?? [])]);
  const goal = key(b);
  // A una máquina (la cinta, el banco) se sube sólo quien va a usarla: es sólida salvo como final del camino.
  const onto = mountAt(loc, b.tx, b.ty);
  const prev = new Map<string, TilePoint | null>([[key(a), null]]);
  const queue: TilePoint[] = [a];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (key(cur) === goal) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { tx: cur.tx + dx, ty: cur.ty + dy };
      const k = key(next);
      if (prev.has(k) || !(isWalkable(loc, next.tx, next.ty) || (onto && k === goal)) || (blocked.has(k) && k !== goal)) continue;
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
// Anexos: un interior al que se entra desde otro (el club de boxeo o una academia, desde su gimnasio). Su salida lleva
// a un sitio del interior de fuera; la entrada es el punto de al lado (nunca uno encima de donde se llega).
for (const inner of allLocations()) {
  if (inner.kind !== 'interior' || DOORS.has(inner.id)) continue;
  const back = inner.portals.find((p) => !p.train && getLocation(p.to.location).kind === 'interior');
  const exit = Object.entries(inner.points ?? {}).find(([, p]) => p.kind === 'exit')?.[0];
  const outer = back && getLocation(back.to.location);
  const spot = outer?.spawns[back!.to.spawn];
  const entrance = spot && Object.entries(outer!.points ?? {}).find(([, p]) => Math.max(Math.abs(p.tx - spot.tx), Math.abs(p.ty - spot.ty)) === 1)?.[0];
  if (exit && entrance) DOORS.set(inner.id, { exit, entrance, outside: outer!.id });
}

/** De un sitio hacia fuera hasta la calle: él mismo, el interior que lo rodea (si es un anexo) y la calle. */
function outward(location: string): string[] {
  const out = [location];
  for (let door = DOORS.get(location); door && !out.includes(door.outside); door = DOORS.get(door.outside)) out.push(door.outside);
  return out;
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

  // Sale puerta a puerta hasta el sitio que comparten (la calle, o el gimnasio de un anexo) y entra puerta a puerta.
  const up = outward(from.location);
  const down = outward(to.location);
  const common = up.find((l) => down.includes(l));
  if (!common) return null;
  let at = fromId;
  for (const loc of up.slice(0, up.indexOf(common))) {
    const door = DOORS.get(loc)!;
    if (!add(at, door.exit)) return null;
    at = door.entrance;
  }
  for (const loc of down.slice(0, down.indexOf(common)).reverse()) {
    const door = DOORS.get(loc)!;
    if (!add(at, door.entrance)) return null;
    at = door.exit;
  }
  return add(at, toId) ? legs : null;
}

/** Camino por tiles dentro de una localización, entre dos tiles cualesquiera. */
/** `avoid`: tiles cortados ahora mismo (obstáculos temporales, systems/Recovery). */
export function tilePath(loc: LocationDef, from: TilePoint, to: TilePoint, avoid?: ReadonlySet<string>): TilePoint[] | null {
  return gridRoute(loc, from, to, avoid);
}
