// Imports con extensión .ts: sin Phaser, para que scripts/check-world.ts
// valide y recorra el mundo con exactamente estas reglas.
import type {
  BuildingDef,
  LocationDef,
  MetroDef,
  PointDef,
  PortalDef,
  SpawnDef,
  TilePoint,
  Vec2,
} from '../types/game.ts';
import { LOCATIONS } from '../data/locations.ts';
import { TILE } from '../config/constants.ts';
import { PROPS, TILES } from '../world/tiles.ts';
import { getNpc } from '../data/npcs.ts';
import { getCatalog } from '../data/catalogs.ts';

// ------------------------------------------------------------- edificios

/**
 * Escala del mundo: una persona mide 24 px (tile y medio) y una planta de
 * fachada, dos tiles (32 px); la puerta, unos 27 px. Con una planta de un solo
 * tile las puertas quedaban más bajas que quien entra por ellas.
 */
export const STOREY_ROWS = 2;

/**
 * Filas de la huella que son fachada vista: las plantas de una fachada al sur,
 * a dos filas cada una; la fachada al norte se ve de canto (una fila); un
 * fondo de tejados, ninguna. El resto de la huella es tejado.
 */
export function facadeRows(b: BuildingDef): number {
  return b.front === 's' ? (b.floors ?? 1) * STOREY_ROWS : b.front === 'n' ? 1 : 0;
}

/**
 * Filas de la huella que son la pared trasera vista: un edificio con la puerta
 * al norte enseña al sur su espalda (ventanas de patio, tendederos, aparatos),
 * de una planta de alto, si le cabe con al menos una fila de tejado.
 */
export function backRows(b: BuildingDef): number {
  return b.front === 'n' && b.h >= STOREY_ROWS + 2 ? STOREY_ROWS : 0;
}

/** Fila de fachada que toca la calle: ahí va la puerta. */
export function doorRow(b: BuildingDef): number {
  return b.front === 'n' ? b.ty : b.ty + b.h - 1;
}

/** Tile de calle justo delante de la puerta, y hacia dónde se mira al salir. */
function doorstep(b: BuildingDef): SpawnDef {
  return b.front === 'n'
    ? { tx: b.doorX ?? b.tx, ty: b.ty - 1, facing: 'up' }
    : { tx: b.doorX ?? b.tx, ty: b.ty + b.h, facing: 'down' };
}

/**
 * Un edificio con interior genera su portal, el spawn de delante con su mismo
 * id y su punto de entrada. Un solo dato: no puede haber una puerta que deje
 * en otra calle.
 */
function expand(raw: LocationDef): LocationDef {
  const buildings = raw.buildings ?? [];
  if (buildings.length === 0) return raw;
  const portals: PortalDef[] = [...raw.portals];
  const spawns: Record<string, SpawnDef> = { ...raw.spawns };
  const points: Record<string, PointDef> = { ...raw.points };
  for (const b of buildings) {
    if (b.doorX === undefined || !b.front) continue;
    const step = doorstep(b);
    if (b.point) points[b.point] = { tx: step.tx, ty: step.ty, kind: 'entrance', facing: b.front === 'n' ? 'down' : 'up' };
    if (!b.enter) continue;
    portals.push({ id: b.id, tx: b.doorX, ty: doorRow(b), label: b.name, to: b.enter });
    spawns[b.id] = step;
  }
  return { ...raw, portals, spawns, points };
}

const EXPANDED = LOCATIONS.map(expand);
const BY_ID = new Map(EXPANDED.map((loc) => [loc.id, loc]));

// ------------------------------------------------------------ colisiones

/**
 * Qué tiles son sólidos: terreno, huella de edificios (menos la puerta) y la
 * fila base de cada prop. Lo usan el constructor de colisiones, la validación
 * y el script de recorrido: una sola regla para los tres.
 */
export function solidMask(loc: LocationDef): boolean[][] {
  const mask = loc.ground.map((row) => [...row].map((ch) => TILES[ch]?.solid ?? true));
  const set = (tx: number, ty: number, v: boolean): void => {
    if (mask[ty]?.[tx] !== undefined) mask[ty][tx] = v;
  };
  for (const b of loc.buildings ?? []) {
    for (let y = b.ty; y < b.ty + b.h; y++) for (let x = b.tx; x < b.tx + b.w; x++) set(x, y, true);
    if (b.doorX !== undefined && b.front) set(b.doorX, doorRow(b), false);
  }
  for (const p of loc.props) {
    if (PROPS[p.kind].overhead || PROPS[p.kind].flat || PROPS[p.kind].seat) continue; // cuelga, está pintado o es un asiento: se pasa
    const w = PROPS[p.kind].tilesWide ?? 1;
    for (let x = p.tx; x < p.tx + w; x++) set(x, p.ty, true);
  }
  return mask;
}

const masks = new Map<string, boolean[][]>();
function maskOf(loc: LocationDef): boolean[][] {
  let m = masks.get(loc.id);
  if (!m) masks.set(loc.id, (m = solidMask(loc)));
  return m;
}

/**
 * Calzada: por donde van coches y bicis (carriles, línea central, pasos de
 * cebra y carril bici). Se pisa, pero nadie se para ahí a esperar ni a posarse.
 */
export const ROADWAY: ReadonlySet<string> = new Set(['.', '=', ':', 'z', 'b']);

export function isWalkable(loc: LocationDef, tx: number, ty: number): boolean {
  return maskOf(loc)[ty]?.[tx] === false;
}

/** Tramo recto entre centros de tile sin pisar nada sólido (muestreo cada cuarto de tile). */
export function lineClear(loc: LocationDef, a: TilePoint, b: TilePoint): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.tx - a.tx, b.ty - a.ty) * 4));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.floor(a.tx + 0.5 + (b.tx - a.tx) * t);
    const y = Math.floor(a.ty + 0.5 + (b.ty - a.ty) * t);
    if (!isWalkable(loc, x, y)) return false;
  }
  return true;
}

// ------------------------------------------------------------ validación

/**
 * Comprueba que una localización es coherente. Un mapa mal escrito falla aquí,
 * en el arranque, y no como un hueco invisible en el suelo.
 */
function validate(loc: LocationDef): void {
  const width = loc.ground[0]?.length ?? 0;
  if (width === 0 || loc.ground.length === 0) {
    throw new Error(`[${loc.id}] rejilla de terreno vacía`);
  }
  loc.ground.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`[${loc.id}] fila ${y} mide ${row.length}, se esperaba ${width}`);
    }
    for (const ch of row) {
      if (!TILES[ch]) throw new Error(`[${loc.id}] carácter de terreno desconocido: "${ch}"`);
    }
  });
  validateBuildings(loc, width);
  for (const portal of loc.portals) {
    const target = BY_ID.get(portal.to.location);
    if (!target) throw new Error(`[${loc.id}] portal "${portal.id}" apunta a ${portal.to.location}`);
    if (!target.spawns[portal.to.spawn]) {
      throw new Error(`[${loc.id}] portal "${portal.id}" busca el spawn "${portal.to.spawn}"`);
    }
    if (portal.train && !loc.metro) {
      throw new Error(`[${loc.id}] portal "${portal.id}" sube a un tren, pero aquí no hay metro`);
    }
  }
  for (const [id, s] of Object.entries(loc.spawns)) {
    if (!isWalkable(loc, s.tx, s.ty)) throw new Error(`[${loc.id}] spawn "${id}" cae en ${s.tx},${s.ty}, que no es transitable`);
  }
  for (const n of loc.npcs) {
    if (!isWalkable(loc, n.tx, n.ty)) throw new Error(`[${loc.id}] NPC "${n.id}" colocado en un tile sólido`);
  }
  for (const [id, p] of Object.entries(loc.points ?? {})) {
    if (!isWalkable(loc, p.tx, p.ty)) throw new Error(`[${loc.id}] punto ${id} en ${p.tx},${p.ty} no es transitable`);
  }
  for (const [a, b] of loc.links ?? []) {
    const pa = loc.points?.[a];
    const pb = loc.points?.[b];
    if (!pa || !pb) throw new Error(`[${loc.id}] tramo ${a}–${b} con un punto inexistente`);
    if (!lineClear(loc, pa, pb)) throw new Error(`[${loc.id}] tramo ${a}–${b} atraviesa algo sólido`);
  }
  if (loc.metro) validateMetro(loc, loc.metro);
  for (const t of loc.terminals ?? []) {
    getCatalog(t.catalog);
    if (!loc.ground[t.ty]?.[t.tx]) throw new Error(`[${loc.id}] ${t.name} fuera del mapa en ${t.tx},${t.ty}`);
  }
}

function validateBuildings(loc: LocationDef, width: number): void {
  const taken = new Map<string, string>();
  for (const b of loc.buildings ?? []) {
    if (b.tx < 0 || b.ty < 0 || b.tx + b.w > width || b.ty + b.h > loc.ground.length) {
      throw new Error(`[${loc.id}] edificio ${b.id} se sale del mapa`);
    }
    for (let y = b.ty; y < b.ty + b.h; y++) {
      for (let x = b.tx; x < b.tx + b.w; x++) {
        const other = taken.get(`${x},${y}`);
        if (other) throw new Error(`[${loc.id}] ${b.id} se solapa con ${other} en ${x},${y}`);
        taken.set(`${x},${y}`, b.id);
      }
    }
    if (b.doorX !== undefined && (!b.front || b.doorX < b.tx || b.doorX >= b.tx + b.w)) {
      throw new Error(`[${loc.id}] la puerta de ${b.id} no está en su fachada`);
    }
    if (b.enter && b.doorX === undefined) throw new Error(`[${loc.id}] ${b.id} tiene interior pero no puerta`);
    if ((b.floors ?? 1) > 1 && (b.front !== 's' || b.h < facadeRows(b) + 1)) {
      throw new Error(`[${loc.id}] ${b.id}: ${b.floors} plantas sólo en frentes al sur y con ${facadeRows(b) + 1} filas o más (dos por planta y una de tejado)`);
    }
    if (b.front === 's' && b.h < facadeRows(b)) throw new Error(`[${loc.id}] ${b.id}: no le cabe la planta baja (${STOREY_ROWS} filas)`);
  }
}

/** Los NPC de la estación caminan en línea recta: cada punto debe ser suelo libre. */
function validateMetro(loc: LocationDef, metro: MetroDef): void {
  const points: [string, TilePoint][] = [
    ['entrada', metro.entrance],
    ...metro.gates.flatMap((g): [string, TilePoint][] => [
      ['torniquete', g],
      ['vestíbulo', { tx: g.tx, ty: g.ty + 1 }],
    ]),
    ...metro.waitingSpots.map((p): [string, TilePoint] => ['espera', p]),
    ...metro.signSpots.map((p): [string, TilePoint] => ['cartel', p]),
    ...metro.guards.flatMap((g) => {
      getNpc(g.id);
      return [g.post, ...g.patrol].map((p): [string, TilePoint] => [`ronda de ${g.id}`, p]);
    }),
  ];
  for (const [what, p] of points) {
    if (!isWalkable(loc, p.tx, p.ty)) throw new Error(`[${loc.id}] metro: punto de ${what} bloqueado en ${p.tx},${p.ty}`);
  }
  // Un asiento es justo lo contrario: tiene que haber un banco.
  for (const s of metro.seats) {
    if (!loc.props.some((prop) => prop.kind === 'bench' && prop.tx === s.tx && prop.ty === s.ty)) {
      throw new Error(`[${loc.id}] metro: asiento sin banco en ${s.tx},${s.ty}`);
    }
  }
}

EXPANDED.forEach(validate);

// Los puntos se piden por id desde cualquier sitio: no pueden repetirse entre localizaciones.
{
  const seen = new Map<string, string>();
  for (const loc of EXPANDED) {
    for (const id of Object.keys(loc.points ?? {})) {
      const other = seen.get(id);
      if (other) throw new Error(`Punto ${id} repetido en ${other} y ${loc.id}`);
      seen.set(id, loc.id);
    }
  }
}

// ------------------------------------------------------------------ API

export function allLocations(): readonly LocationDef[] {
  return EXPANDED;
}

export function hasLocation(id: string): boolean {
  return BY_ID.has(id);
}

export function getLocation(id: string): LocationDef {
  const loc = BY_ID.get(id);
  if (!loc) throw new Error(`Localización desconocida: ${id}`);
  return loc;
}

export function getSpawn(loc: LocationDef, spawnId: string): SpawnDef {
  const spawn = loc.spawns[spawnId];
  if (!spawn) throw new Error(`[${loc.id}] spawn desconocido: ${spawnId}`);
  return spawn;
}

/** Centro horizontal del tile y su borde inferior: el sprite se ancla por los pies. */
export function spawnToWorld(spawn: SpawnDef): { x: number; y: number } {
  return { x: spawn.tx * TILE + TILE / 2, y: spawn.ty * TILE + TILE };
}

/**
 * Posición guardada, o un spawn si ahora cae dentro de algo. Pasa cuando un
 * mapa se rediseña: la partida se conserva, sólo cambia dónde apareces.
 */
export function safePosition(locationId: string, position: Vec2, fallbackSpawn: string): Vec2 {
  const loc = getLocation(locationId);
  const tx = Math.floor(position.x / TILE);
  const ty = Math.floor((position.y - 1) / TILE);
  if (isWalkable(loc, tx, ty)) return position;
  return spawnToWorld(loc.spawns[fallbackSpawn] ?? Object.values(loc.spawns)[0]);
}
