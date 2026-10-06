// Sin Phaser: lo llama data/vallesco.ts al montar el barrio; scripts/check-world
// lo valida con el resto (caminos, puntos, tramos del grafo).
import { PROPS, TILES } from '../world/tiles.ts';
import type { BuildingDef, LocationDef, PropKind, PropPlacement, TilePoint } from '../types/game.ts';
import { DISTRICTS } from '../data/districts.ts';
import { districtAt, zonesOf } from './Districts.ts';

/**
 * Micromobiliario por contexto, no al azar. Cada regla lee lo que ya hay en
 * los datos (estilo de cada edificio, carriles, pasos de cebra, semáforos,
 * bancos, portales) y pone su kit donde tiene sentido:
 *
 * - bordillo sin tráfico: coches aparcados y la señal de aparcamiento;
 * - portal de vecinos: la isla de contenedores de reciclaje delante y, a veces, una bici;
 * - obra: contenedor de escombros y vallas en la calzada de delante;
 * - semáforo: su armario de control junto al bordillo;
 * - boca de metro: patinetes de alquiler, mupi y papelera;
 * - banco: papelera al lado;
 * - farmacia, banco, junta: buzón de correos;
 * - boca de callejón peatonal: bolardos y placa con el nombre;
 * - discoteca, parada, papeleras: la basura que deja cada sitio.
 *
 * Nada se pone donde estorba: ni en puntos ni tramos del grafo, ni en puertas,
 * pasos de cebra o sitios de espera del semáforo, y nada sólido que parta en
 * dos un trozo de suelo pisable. Determinista: el mismo barrio siempre igual.
 */

const WALKWAY = new Set([',', 'P', 'c', '~', 'T']);
const ASPHALT = new Set(['.', ':', '=', 'u', 'l']);
const RESIDENTIAL = (b: BuildingDef): boolean => b.style === 'home' || b.style.startsWith('res-');

function hash(a: number, b: number, c = 0): number {
  let h = Math.imul(a * 374761393 + b * 668265263 + c * 2246822519, 3266489917);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** Delante de la puerta: el tile de calle al que da (como LocationSystem). */
function entranceOf(b: BuildingDef): TilePoint | undefined {
  if (b.doorX === undefined || !b.front) return undefined;
  return b.front === 'n' ? { tx: b.doorX, ty: b.ty - 1 } : { tx: b.doorX, ty: b.ty + b.h };
}

class Site {
  readonly def: LocationDef;
  readonly w: number;
  readonly h: number;
  readonly placed: PropPlacement[] = [];
  private readonly solid: boolean[][];
  private readonly forbidden = new Set<string>();
  private readonly trafficRows: Set<number>;
  private pieces: number;

  constructor(def: LocationDef) {
    this.def = def;
    this.w = def.ground[0].length;
    this.h = def.ground.length;
    this.trafficRows = new Set([...(def.traffic?.lanes ?? []), ...(def.traffic?.bikes?.lanes ?? [])].map((l) => l.row));
    this.solid = def.ground.map((row) => [...row].map((ch) => TILES[ch]?.solid ?? true));
    for (const b of def.buildings ?? []) {
      for (let y = b.ty; y < b.ty + b.h; y++) for (let x = b.tx; x < b.tx + b.w; x++) this.setSolid(x, y);
      const door = entranceOf(b);
      if (door) {
        // La puerta y lo que tiene delante, libres; y un tile a cada lado.
        for (let dx = -1; dx <= 1; dx++) this.forbid(door.tx + dx, door.ty);
        this.solid[b.front === 'n' ? b.ty : b.ty + b.h - 1][b.doorX!] = false;
      }
    }
    for (const p of def.props) this.addProp(p);
    for (const p of Object.values(def.points ?? {})) this.forbid(p.tx, p.ty);
    for (const sp of Object.values(def.spawns)) this.forbid(sp.tx, sp.ty);
    // Los tramos del grafo, muestreados como los valida LocationSystem. Las entradas no están en
    // `points`: las genera LocationSystem desde cada edificio (b.point, delante de la puerta).
    const pos = new Map<string, TilePoint>(Object.entries(def.points ?? {}));
    for (const b of def.buildings ?? []) {
      const door = entranceOf(b);
      if (b.point && door) pos.set(b.point, door);
    }
    for (const [a, b] of def.links ?? []) {
      const pa = pos.get(a);
      const pb = pos.get(b);
      if (!pa || !pb) continue;
      const steps = Math.max(1, Math.ceil(Math.hypot(pb.tx - pa.tx, pb.ty - pa.ty) * 4));
      for (let i = 0; i <= steps; i++) this.forbid(Math.round(pa.tx + ((pb.tx - pa.tx) * i) / steps), Math.round(pa.ty + ((pb.ty - pa.ty) * i) / steps));
    }
    // Pasos de cebra, su bordillo y lo que tienen delante.
    def.ground.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== 'z' && row[x] !== 'T') continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.forbid(x + dx, y + dy);
      }
    });
    // Semáforos: sitios de espera y postes (systems/Signals.ts).
    for (const sig of def.signals ?? []) {
      for (const y of [sig.ty - 2, sig.ty - 1, sig.ty + sig.h, sig.ty + sig.h + 1]) for (let x = sig.tx - 2; x <= sig.tx + sig.w + 1; x++) this.forbid(x, y);
    }
    this.pieces = this.countPieces();
  }

  at(x: number, y: number): string {
    return this.def.ground[y]?.[x] ?? '';
  }

  private forbid(x: number, y: number): void {
    this.forbidden.add(`${x},${y}`);
  }

  private setSolid(x: number, y: number): void {
    if (this.solid[y]?.[x] !== undefined) this.solid[y][x] = true;
  }

  private addProp(p: PropPlacement): void {
    const prop = PROPS[p.kind];
    if (prop.overhead || prop.flat) return;
    for (let x = p.tx; x < p.tx + (prop.tilesWide ?? 1); x++) this.setSolid(x, p.ty);
  }

  isFree(x: number, y: number): boolean {
    return this.solid[y]?.[x] === false && !this.forbidden.has(`${x},${y}`);
  }

  isSolid(x: number, y: number): boolean {
    return this.solid[y]?.[x] !== false;
  }

  /** Trozos de suelo pisable separados entre sí. */
  private countPieces(): number {
    const seen = new Uint8Array(this.w * this.h);
    let pieces = 0;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.solid[y][x] || seen[y * this.w + x]) continue;
        pieces++;
        const stack = [[x, y]];
        seen[y * this.w + x] = 1;
        while (stack.length) {
          const [cx, cy] = stack.pop()!;
          for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
            if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h || this.solid[ny][nx] || seen[ny * this.w + nx]) continue;
            seen[ny * this.w + nx] = 1;
            stack.push([nx, ny]);
          }
        }
      }
    }
    return pieces;
  }

  /** Pone el prop si cabe y no estorba; si es sólido, sólo si no parte el suelo en dos. */
  place(kind: PropKind, tx: number, ty: number): boolean {
    const prop = PROPS[kind];
    const wide = prop.tilesWide ?? 1;
    for (let x = tx; x < tx + wide; x++) if (!this.isFree(x, ty)) return false;
    if (!prop.flat) {
      for (let x = tx; x < tx + wide; x++) this.solid[ty][x] = true;
      const pieces = this.countPieces();
      if (pieces > this.pieces) {
        for (let x = tx; x < tx + wide; x++) this.solid[ty][x] = false;
        return false;
      }
      this.pieces = pieces;
    }
    // Nada encima de otra cosa, aunque sea plana.
    for (let x = tx; x < tx + wide; x++) this.forbid(x, ty);
    this.placed.push({ kind, tx, ty });
    return true;
  }

  /** Calzada junto a una acera y sin tráfico: donde se aparca, se ponen contenedores o la obra. */
  isKerbLane(x: number, y: number): boolean {
    return ASPHALT.has(this.at(x, y)) && !this.trafficRows.has(y) && (WALKWAY.has(this.at(x, y - 1)) || WALKWAY.has(this.at(x, y + 1)));
  }

  isTraffic(y: number): boolean {
    return this.trafficRows.has(y);
  }

  /** La primera fila de calzada saliendo de la fachada, si es un bordillo sin tráfico. */
  laneInFront(b: BuildingDef): number | undefined {
    const dir = b.front === 'n' ? -1 : 1;
    let y = b.front === 'n' ? b.ty - 1 : b.ty + b.h;
    while (WALKWAY.has(this.at(b.tx + 1, y))) y += dir;
    return this.isKerbLane(b.tx + 1, y) ? y : undefined;
  }

  /** Tiles libres alrededor de un punto, primero los pegados a algo (pared, farola, otro mueble). */
  nearby(from: TilePoint, min: number, max: number, onGround: (ch: string) => boolean): TilePoint[] {
    const out: { p: TilePoint; score: number }[] = [];
    for (let y = from.ty - max; y <= from.ty + max; y++) {
      for (let x = from.tx - max; x <= from.tx + max; x++) {
        const d = Math.hypot(x - from.tx, y - from.ty);
        if (d < min || d > max || !this.isFree(x, y) || !onGround(this.at(x, y))) continue;
        const hug = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => this.isSolid(x + dx, y + dy)).length;
        out.push({ p: { tx: x, ty: y }, score: hug * 2 - d * 0.35 + hash(x, y) * 0.3 });
      }
    }
    return out.sort((a, b) => b.score - a.score).map((o) => o.p);
  }
}

const onWalkway = (ch: string): boolean => WALKWAY.has(ch);
const onAnyGround = (ch: string): boolean => WALKWAY.has(ch) || ch === 'g';

// --------------------------------------------------------------- reglas

/** Portales de vecinos: isla de contenedores (uno de cada color) en el bordillo de delante; alguna bici en la fachada. */
function residential(s: Site): void {
  for (const b of s.def.buildings ?? []) {
    if (!RESIDENTIAL(b) || !b.front) continue;
    const lane = s.laneInFront(b);
    if (lane !== undefined) {
      // Lejos de la puerta: la isla va al extremo de la fachada más alejado.
      const door = b.doorX ?? b.tx;
      const start = door - b.tx > b.w / 2 ? b.tx + 1 : b.tx + b.w - 5;
      for (let i = 0; i < 4; i++) s.place('container', start + i, lane);
    }
    const door = entranceOf(b);
    if (door && hash(b.tx, b.ty, 3) < 0.6) {
      for (const dx of [2, -2, 3]) if (s.place('bike', door.tx + dx, door.ty)) break;
    }
  }
}

/** Obra: contenedor de escombros y vallas en la calzada de delante, y cascotes por el suelo. */
function works(s: Site): void {
  for (const b of s.def.buildings ?? []) {
    if (b.style !== 'works') continue;
    const lane = s.laneInFront(b);
    if (lane === undefined) continue;
    s.place('barrier', b.tx + 1, lane);
    s.place('skip', b.tx + 3, lane);
    s.place('barrier', b.tx + 5, lane);
    for (const p of s.nearby({ tx: b.tx + 4, ty: lane }, 1, 3, onWalkway).slice(0, 2)) s.place('debris', p.tx, p.ty);
  }
}

/**
 * Bordillos sin tráfico: coches aparcados en fila (con huecos) y una señal de
 * aparcamiento por tramo. En una calle estrecha sin carriles de circulación
 * (dos filas de calzada), sólo en un lado: por el otro tiene que poder pasar un coche.
 */
function parking(s: Site): void {
  for (let y = 0; y < s.h; y++) {
    let signed = false;
    for (let x = 2; x < s.w - 4; ) {
      // Segunda fila de una calle estrecha sin tráfico: se deja libre para pasar.
      const narrowSecondRow = s.isKerbLane(x, y - 1) && !s.isTraffic(y) && !s.isTraffic(y - 1);
      if (!s.isKerbLane(x, y) || !s.isKerbLane(x + 1, y) || !s.isKerbLane(x + 2, y) || narrowSecondRow) {
        x++;
        signed = false;
        continue;
      }
      const r = hash(x, y, 11);
      if (r < 0.72 && s.place(r < 0.24 ? 'car' : r < 0.48 ? 'car-b' : 'car-c', x, y)) {
        const kerb = WALKWAY.has(s.at(x, y - 1)) ? y - 1 : y + 1;
        if (!signed) signed = s.place('parking-sign', x, kerb);
        // Zona de pago: un parquímetro en el bordillo cada pocos coches, pegado a uno de ellos.
        else if (hash(x, y, 31) < 0.34) s.place('parking-meter', x + 1, kerb);
        x += 3 + (hash(x, y, 12) < 0.5 ? 1 : 0);
      } else x++;
    }
  }
}

/**
 * Lo pintado y lo gastado en la calzada: delante de cada semáforo, la flecha
 * de carril (hacia donde va el tráfico) y las rodadas de quien frena en la
 * línea; y, suelto, algún parche de asfalto nuevo. Plano: se hornea en el suelo.
 */
function roadMarks(s: Site): void {
  for (const sig of s.def.signals ?? []) {
    for (const lane of s.def.traffic?.lanes ?? []) {
      if (lane.row < sig.ty || lane.row >= sig.ty + sig.h) continue;
      const [arrow, marks] = lane.dir > 0 ? [sig.tx - 5, sig.tx - 3] : [sig.tx + sig.w + 4, sig.tx + sig.w + 2];
      s.place(lane.dir > 0 ? 'road-arrow-e' : 'road-arrow-w', arrow, lane.row);
      s.place('tyre-marks', marks, lane.row);
    }
  }
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) if (ASPHALT.has(s.at(x, y)) && hash(x, y, 41) < 0.04) s.place('asphalt-patch', x, y);
  }
}

/** Cada semáforo, su armario de control en la acera, junto a los sitios de espera. */
function signalBoxes(s: Site): void {
  for (const sig of s.def.signals ?? []) {
    for (const [x, y] of [[sig.tx + sig.w + 2, sig.ty - 2], [sig.tx - 3, sig.ty + sig.h + 1], [sig.tx + sig.w + 2, sig.ty - 1]]) {
      if (s.place('utility-box', x, y)) break;
    }
  }
}

/** Boca de metro: patinetes de alquiler junto al aparcabicis, el mupi y una papelera; algún billete tirado. */
function metro(s: Site): void {
  for (const b of s.def.buildings ?? []) {
    if (b.style !== 'metro' || !b.enter) continue;
    const door = entranceOf(b)!;
    const rack = s.def.props.find((p) => p.kind === 'bike-rack' && Math.hypot(p.tx - door.tx, p.ty - door.ty) < 8);
    const anchor = rack ? { tx: rack.tx + 1, ty: rack.ty } : door;
    let scooters = 0;
    for (const p of s.nearby(anchor, 1, 3, onWalkway)) if (scooters < 3 && s.place('scooter', p.tx, p.ty)) scooters++;
    for (const p of s.nearby(door, 3, 6, onWalkway)) if (s.place('ad-panel', p.tx, p.ty)) break;
    for (const p of s.nearby(door, 2, 5, onWalkway)) if (s.place('bin', p.tx, p.ty)) break;
    for (const p of s.nearby(door, 1, 4, onWalkway).slice(0, 2)) s.place('debris', p.tx, p.ty);
  }
}

/** Junto a cada grupo de bancos, una papelera. */
function benchBins(s: Site): void {
  const benches = s.def.props.filter((p) => p.kind === 'bench');
  for (const b of benches) {
    if (benches.some((o) => o.ty === b.ty && o.tx === b.tx - 1)) continue; // sólo desde el primero del grupo
    let end = b.tx;
    while (benches.some((o) => o.ty === b.ty && o.tx === end + 1)) end++;
    for (const x of [end + 1, b.tx - 1]) if (s.place('bin', x, b.ty)) break;
  }
}

/** Farmacia, banco o junta municipal: el buzón amarillo cerca de la puerta. */
function mailboxes(s: Site): void {
  for (const b of s.def.buildings ?? []) {
    if (!['pharmacy', 'bank', 'civic'].includes(b.style)) continue;
    const door = entranceOf(b);
    if (!door) continue;
    for (const dx of [2, -2, 3, -3]) if (s.place('mailbox', door.tx + dx, door.ty)) break;
  }
}

/**
 * Callejón peatonal que desemboca en una acera: bolardos a los lados de la boca
 * (el centro queda libre) y la placa con el nombre en la esquina.
 */
function alleyMouths(s: Site): void {
  for (let y = 1; y < s.h - 1; y++) {
    for (let x = 0; x < s.w; x++) {
      if (s.at(x, y) !== 'c' || s.at(x, y - 1) !== 'c' || s.at(x, y + 1) !== ',' || s.at(x - 1, y) === 'c') continue;
      let end = x;
      while (s.at(end + 1, y) === 'c' && s.at(end + 1, y + 1) === ',') end++;
      if (end - x >= 2 && end - x <= 4) {
        s.place('bollard', x, y);
        s.place('bollard', end, y);
        for (const [sx, sy] of [[x - 1, y + 1], [end + 1, y + 1]]) if (s.place('street-sign', sx, sy)) break;
      }
      x = end;
    }
  }
}

/**
 * El kit de cada zona (data/districts.ts): carteles y bicis contra las fachadas
 * del Carmen, bolardos y mupi en la noche, arbusto y hoja en el parque. `every`
 * dice cuánto (una pieza por tantos sitios que valen), `max` el tope. Lo alto
 * (un cartel) sólo con pared detrás; lo bajo, a cualquier lado de la fachada.
 */
function districtKits(s: Site): void {
  const blocks = s.def.buildings ?? [];
  const inBuilding = (x: number, y: number): boolean => blocks.some((b) => x >= b.tx && x < b.tx + b.w && y >= b.ty && y < b.ty + b.h);
  zonesOf(s.def).forEach((z, zi) => {
    const kit = DISTRICTS[z.profile].kit;
    if (!kit) return;
    const spots: { x: number; y: number; r: number }[] = [];
    for (let y = z.ty; y < z.ty + z.h; y++) {
      for (let x = z.tx; x < z.tx + z.w; x++) {
        if (!s.isFree(x, y) || districtAt(s.def, x, y) !== z.profile) continue;
        const ok = kit.on === 'open' ? s.at(x, y) === 'g' : WALKWAY.has(s.at(x, y)) && (inBuilding(x, y - 1) || inBuilding(x, y + 1));
        if (ok) spots.push({ x, y, r: hash(x, y, 40 + zi) });
      }
    }
    // Una pieza por cada `every` sitios libres que valen, en orden de azar fijo.
    const quota = Math.min(kit.max, Math.ceil(spots.length / kit.every));
    let n = 0;
    for (const { x, y } of spots.sort((a, b) => a.r - b.r)) {
      if (n >= quota) break;
      // Empieza por la pieza que le toca a este tile y, si no cabe, prueba las demás del kit.
      const first = Math.floor(hash(x, y, 60 + zi) * kit.props.length);
      // Con pared detrás, primero lo alto (el cartel va contra el muro); lo bajo cabe en cualquier sitio.
      const wall = inBuilding(x, y - 1);
      const kinds = kit.props.map((_, i) => kit.props[(first + i) % kit.props.length]).sort((a, b) => (wall ? (PROPS[b].tilesHigh ?? 1) - (PROPS[a].tilesHigh ?? 1) : 0));
      if (kinds.some((kind) => ((PROPS[kind].tilesHigh ?? 1) === 1 || inBuilding(x, y - 1)) && s.place(kind, x, y))) n++;
    }
  });
}

/** La basura que deja cada sitio: colillas y flyers a la puerta de la discoteca; papeles junto a paradas y papeleras. */
function litter(s: Site): void {
  for (const b of s.def.buildings ?? []) {
    if (b.style !== 'club') continue;
    const door = entranceOf(b)!;
    let n = 0;
    for (const p of s.nearby(door, 1, 4, onWalkway)) if (n < 4 && s.place('debris', p.tx, p.ty)) n++;
  }
  for (const p of s.def.props) {
    if (!['bin', 'bus-stop', 'kiosk', 'vending'].includes(p.kind) || hash(p.tx, p.ty, 21) > 0.6) continue;
    for (const q of s.nearby(p, 1, 2, onAnyGround)) if (s.place('debris', q.tx, q.ty)) break;
  }
}

/** Kit de calle de una localización exterior: los props que añade, por contexto. */
export function dress(def: LocationDef): PropPlacement[] {
  if (def.kind !== 'exterior') return [];
  const s = new Site(def);
  // Primero lo que tiene sitio fijo (la obra, los contenedores de cada portal); luego se aparca en lo que queda.
  works(s);
  residential(s);
  signalBoxes(s);
  metro(s);
  mailboxes(s);
  alleyMouths(s);
  benchBins(s);
  districtKits(s);
  parking(s);
  roadMarks(s);
  litter(s);
  return s.placed;
}
