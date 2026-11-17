// Gran Rastro · los puestos cortan el paso (world/PopUpView: cuerpo de dos tiles por puesto mientras se ve): `npm run check`.
// Falla si, con todos los puestos montados, alguna puerta o salida que se alcanzaba deja de alcanzarse, si alguna tile
// caminable conectada queda aislada o si algún puesto no tiene ni una tile pisable al lado para atenderlo. Comprueba
// también que la aserción detecta un corte de verdad (una columna entera bloqueada).
import assert from 'node:assert/strict';
import { POPUPS } from '../src/data/popups.ts';
import { getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { popUpStalls } from '../src/systems/PopUps.ts';

const ID = 'casco-antiguo';
/** Ancho de un puesto en tiles, desde su ancla hacia la derecha (el mismo que world/PopUpView y check-gran-rastro). */
const STALL_TILES = 2;
const loc = getLocation(ID);
const def = POPUPS.find((p) => p.id === 'gran-rastro')!;
assert.ok(def && def.location === ID, 'sin Gran Rastro en el Casco Antiguo');
const stalls = popUpStalls(def);

const key = (tx: number, ty: number): string => `${tx},${ty}`;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const start = loc.spawns['roma-passage'] && isWalkable(loc, loc.spawns['roma-passage'].tx, loc.spawns['roma-passage'].ty)
  ? loc.spawns['roma-passage']
  : Object.values(loc.spawns).find((s) => isWalkable(loc, s.tx, s.ty));
assert.ok(start, 'ningún spawn pisable en el Casco Antiguo');

/** Tiles alcanzables a pie desde el spawn, en cuatro direcciones, sin pisar lo bloqueado. */
const flood = (blocked: ReadonlySet<string>): Set<string> => {
  const seen = new Set<string>();
  if (blocked.has(key(start.tx, start.ty))) return seen;
  const queue: [number, number][] = [[start.tx, start.ty]];
  seen.add(key(start.tx, start.ty));
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (seen.has(k) || blocked.has(k) || !isWalkable(loc, nx, ny)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return seen;
};
/** Una puerta se alcanza si ella o una vecina está en la zona alcanzable (las puertas pueden no ser pisables). */
const reaches = (r: ReadonlySet<string>, tx: number, ty: number): boolean => r.has(key(tx, ty)) || DIRS.some(([dx, dy]) => r.has(key(tx + dx, ty + dy)));

const blocked = new Set<string>();
for (const s of stalls) for (let dx = 0; dx < STALL_TILES; dx++) blocked.add(key(s.tx + dx, s.ty));
const R0 = flood(new Set());

/** Las tres reglas; lanza si alguna falla. Devuelve lo alcanzable con el bloqueo. */
const assertPassable = (cut: ReadonlySet<string>): Set<string> => {
  const R1 = flood(cut);
  for (const p of loc.portals) {
    if (reaches(R0, p.tx, p.ty)) assert.ok(reaches(R1, p.tx, p.ty), `la salida ${p.id} (${p.tx},${p.ty}) queda cortada`);
  }
  for (const k of R0) if (!cut.has(k)) assert.ok(R1.has(k), `la tile ${k} queda aislada`);
  for (const s of stalls) {
    const around = [[s.tx, s.ty + 1], [s.tx + 1, s.ty + 1], [s.tx, s.ty - 1], [s.tx + 1, s.ty - 1], [s.tx - 1, s.ty], [s.tx + STALL_TILES, s.ty]];
    assert.ok(around.some(([x, y]) => R1.has(key(x, y))), `${s.id} (${s.tx},${s.ty}) sin sitio pisable al lado para atenderlo`);
  }
  return R1;
};

const R1 = assertPassable(blocked);

// Sanidad: una columna entera bloqueada parte el barrio en dos; la aserción tiene que saltar.
const width = Math.max(...loc.ground.map((row) => row.length));
const cx = Math.floor(width / 2) === start.tx ? Math.floor(width / 2) + 1 : Math.floor(width / 2);
const wall = new Set(blocked);
for (let y = 0; y < loc.ground.length; y++) wall.add(key(cx, y));
assert.throws(() => assertPassable(wall), 'la comprobación no detecta un barrio partido en dos');

const portals = loc.portals.filter((p) => reaches(R0, p.tx, p.ty)).length;
console.log(`check-gran-rastro-bloqueo: ${stalls.length} puestos · ${blocked.size} tiles bloqueadas · alcanzables ${R0.size} → ${R1.size} · ${portals}/${loc.portals.length} salidas alcanzables`);
