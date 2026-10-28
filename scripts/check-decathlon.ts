// Decathlon por dentro (Alpha-08): `npm run check`. La nave del plano (design/Decathlon/) se recorre entera: todo lo que
// se mira, se compra o se usa se alcanza a pie desde la puerta; los pasillos no tienen nada encima y miden dos tiles o
// más; hay circuitos cerrados de verdad alrededor de cada bloque de secciones (anillos de tiles pisables, no un dibujo
// redondo); el mobiliario no se pisa entre sí ni tapa probadores, cajas o fichaje; la gente llega por rutas; y una
// partida guardada en la tienda pequeña de antes reaparece en un sitio pisable.
import assert from 'node:assert/strict';
import { AISLES, DECATHLON_H, DECATHLON_PROFILE, DECATHLON_STORE, DECATHLON_W, SECTORS, inAisle, type Rect } from '../src/data/decathlon.ts';
import { getStore } from '../src/data/retail.ts';
import { PROPS } from '../src/world/tiles.ts';
import { getLocation, isStandable, isWalkable, safePosition, spawnToWorld, validate } from '../src/systems/LocationSystem.ts';
import { route, tilePath } from '../src/systems/Navigation.ts';
import type { TilePoint } from '../src/types/game.ts';
import { STOPS } from '../src/data/transit.ts';
import { OFF_MAP_PLACES } from '../src/data/activities.ts';
import { placeForInterior, placeInfo } from '../src/systems/Places.ts';
import { STREET_PROFILES } from '../src/data/streets.ts';
import { ROADWAY } from '../src/systems/LocationSystem.ts';

const loc = getLocation(DECATHLON_STORE.id);
validate(loc);
const key = (t: TilePoint): string => `${t.tx},${t.ty}`;
const entry = loc.spawns.entry;

// 1 · Una nave rectangular y continua, no una habitación de 14 × 11.
assert.equal(loc.ground.length, DECATHLON_H);
assert.ok(loc.ground.every((r) => r.length === DECATHLON_W));
assert.ok(DECATHLON_W >= 70 && DECATHLON_H >= 40, 'la tienda no es de gran formato');

// 2 · Los pasillos: hormigón, dos tiles o más de ancho y nada sólido encima.
for (const a of AISLES) {
  const { x0, y0, x1, y1 } = a.rect;
  assert.ok(Math.min(x1 - x0, y1 - y0) + 1 >= 2, `${a.name}: más estrecho que dos tiles`);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    assert.ok(isWalkable(loc, x, y), `${a.name}: bloqueado en (${x}, ${y})`);
    assert.equal(loc.ground[y][x], 'h', `${a.name}: (${x}, ${y}) sin suelo de pasillo`);
  }
}

// 3 · Mobiliario: dentro de su sección (o en la pared de detrás), sin pisarse con otro, nunca en un pasillo.
const WALL_PROPS = new Set(['wall-shelf', 'sneaker-wall', 'backpack-wall']);
const inRect = (r: Rect, x: number, y: number): boolean => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
const occupied = new Map<string, string>();
for (const pr of loc.props) {
  const def = PROPS[pr.kind];
  if (def.overhead || def.flat) continue;
  for (let x = pr.tx; x < pr.tx + (def.tilesWide ?? 1); x++) {
    const k = `${x},${pr.ty}`;
    const prev = occupied.get(k);
    // La caja registradora va encima de su mostrador: es la única que comparte tile.
    assert.ok(!prev || [prev, pr.kind].sort().join('+') === 'counter+register', `${pr.kind} pisa a ${prev} en ${k}`);
    occupied.set(k, pr.kind);
    if (pr.ty === 1) assert.ok(WALL_PROPS.has(pr.kind), `${pr.kind} en la fila del muro`);
    else assert.ok(!inAisle(x, pr.ty), `${pr.kind} en un pasillo (${k})`);
  }
}
for (const s of SECTORS) {
  for (const pr of s.props) {
    const w = PROPS[pr.kind].tilesWide ?? 1;
    const inside = (inRect(s.rect, pr.tx, pr.ty) && inRect(s.rect, pr.tx + w - 1, pr.ty)) || (pr.ty === 1 && pr.tx >= s.rect.x0 && pr.tx + w - 1 <= s.rect.x1 && WALL_PROPS.has(pr.kind));
    assert.ok(inside, `${s.id}: ${pr.kind} en (${pr.tx}, ${pr.ty}) fuera de su sección`);
  }
}

// 4 · Secciones que no se solapan entre sí ni con los pasillos.
for (const [i, a] of SECTORS.entries()) {
  for (let y = a.rect.y0; y <= a.rect.y1; y++) for (let x = a.rect.x0; x <= a.rect.x1; x++) {
    assert.ok(!inAisle(x, y), `${a.id} invade un pasillo en (${x}, ${y})`);
    for (const b of SECTORS.slice(i + 1)) assert.ok(!inRect(b.rect, x, y), `${a.id} y ${b.id} se solapan en (${x}, ${y})`);
  }
}

// 5 · Todo se alcanza a pie desde la puerta (el tile o uno de al lado si es un mueble).
const seen = new Set([key(entry)]);
const queue: TilePoint[] = [entry];
while (queue.length) {
  const { tx, ty } = queue.shift()!;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = { tx: tx + dx, ty: ty + dy };
    if (seen.has(key(n)) || !isWalkable(loc, n.tx, n.ty)) continue;
    seen.add(key(n));
    queue.push(n);
  }
}
const touches = (t: TilePoint): boolean => seen.has(key(t)) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(key({ tx: t.tx + dx, ty: t.ty + dy }))) || (isStandable(loc, t.tx, t.ty) && seen.has(key(t)));
const targets: [string, TilePoint][] = [
  ...loc.portals.map((p): [string, TilePoint] => [`puerta ${p.id}`, p]),
  ...Object.entries(loc.points ?? {}),
  ...(loc.racks ?? []).map((r): [string, TilePoint] => [r.name, r]),
  ...(loc.inspects ?? []).map((i): [string, TilePoint] => [i.name, i]),
  ...(loc.spots ?? []).map((s): [string, TilePoint] => [s.name, s]),
];
for (const [id, t] of targets) assert.ok(touches(t), `no se llega a pie a ${id} (${t.tx}, ${t.ty})`);
// Los puntos donde alguien se para están libres (o encima de la máquina que se usa).
for (const [id, pt] of Object.entries(loc.points ?? {})) assert.ok(isStandable(loc, pt.tx, pt.ty), `${id} cae encima de algo`);
// Cada sección: alcanzable, con su sitio para mirar dentro y algo que mirar.
for (const s of SECTORS) {
  assert.ok(s.browse.every(([x, y]) => touches({ tx: x, ty: y })), `${s.id}: sin sitio alcanzable donde mirar`);
  assert.ok(s.browse.some(([x, y]) => inRect(s.rect, x, y)), `${s.id}: se mira desde fuera de la sección`);
  assert.ok(s.props.length > 0, `${s.id}: sección vacía`);
}

// 6 · Circuitos cerrados: el anillo de tiles que rodea cada bloque es pisable entero. Se da la vuelta a un bloque y se
// vuelve al mismo sitio sin desandar el camino. Bloques: las tres piezas de cada banda central, las tres de abajo, y la
// vuelta grande (lateral izquierdo, pasillo norte, lateral derecho y cajas) alrededor de toda la zona central.
const BLOCKS: readonly [string, Rect][] = [
  ['raqueta / agua', { x0: 11, y0: 14, x1: 29, y1: 20 }],
  ['escalada / calzado', { x0: 32, y0: 14, x1: 44, y1: 20 }],
  ['camping / accesorios', { x0: 47, y0: 14, x1: 60, y1: 20 }],
  ['niños / roller / baloncesto', { x0: 11, y0: 23, x1: 29, y1: 28 }],
  ['minoritarios / caza', { x0: 32, y0: 23, x1: 44, y1: 28 }],
  ['pesca / colectivos', { x0: 47, y0: 23, x1: 60, y1: 28 }],
  ['fitness hombre / kayak', { x0: 11, y0: 32, x1: 25, y1: 40 }],
  ['golf / equitación / salud', { x0: 28, y0: 32, x1: 47, y1: 40 }],
  ['natación', { x0: 51, y0: 32, x1: 60, y1: 40 }],
  ['vuelta grande', { x0: 11, y0: 14, x1: 60, y1: 40 }],
];
for (const [name, b] of BLOCKS) {
  const ring: TilePoint[] = [];
  for (let x = b.x0 - 1; x <= b.x1 + 1; x++) ring.push({ tx: x, ty: b.y0 - 1 }, { tx: x, ty: b.y1 + 1 });
  for (let y = b.y0; y <= b.y1; y++) ring.push({ tx: b.x0 - 1, ty: y }, { tx: b.x1 + 1, ty: y });
  for (const t of ring) assert.ok(isWalkable(loc, t.tx, t.ty) && seen.has(key(t)), `${name}: el circuito se corta en (${t.tx}, ${t.ty})`);
}
// Y de la puerta a cada sección, una vuelta que no pisa la ida ni sus tiles vecinos: otro recorrido, no el mismo pasillo
// por el otro carril.
for (const s of SECTORS) {
  const [bx, by] = s.browse[0];
  const goal = { tx: bx, ty: by };
  const there = tilePath(loc, entry, goal);
  assert.ok(there, `${s.id}: sin camino desde la puerta`);
  const used = new Set<string>();
  for (const t of there.slice(4, -4)) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) used.add(key({ tx: t.tx + dx, ty: t.ty + dy }));
  assert.ok(tilePath(loc, goal, entry, used), `${s.id}: sólo se vuelve desandando el camino`);
}

// 7 · Probadores, cajas y fichaje despejados: el probador detrás del punto, el mostrador entre quien cobra y quien paga.
for (const [id, pt] of Object.entries(loc.points ?? {}).filter(([id]) => id.startsWith('DECAT_FITTING_'))) {
  assert.ok(loc.props.some((pr) => pr.kind === 'fitting-room' && pr.tx === pt.tx && pr.ty === pt.ty - 1), `${id}: sin probador delante`);
}
const staff = loc.points!.DECAT_STAFF;
const till = loc.points!.DECAT_TILL;
assert.ok(staff.tx === till.tx && till.ty - staff.ty === 2 && loc.props.some((pr) => pr.kind === 'counter' && pr.tx === till.tx && pr.ty === till.ty - 1), 'la caja no queda entre cajero y cliente');
for (const r of loc.racks ?? []) assert.ok(getStore(r.store).stock.length > 0, `${r.name}: perchero sin género`);

// 8 · Las rutas de la gente (systems/Navigation): de la puerta a cada punto de la tienda y de vuelta.
for (const id of Object.keys(loc.points ?? {})) {
  if (id === 'DECAT_EXIT') continue;
  assert.ok(route('DECAT_EXIT', id), `sin ruta de la puerta a ${id}`);
  assert.ok(route(id, 'DECAT_EXIT'), `sin ruta de ${id} a la puerta`);
}
// Cada prefijo del perfil de gente resuelve a algún punto de aquí.
const ids = Object.keys(loc.points ?? {});
for (const prefixes of [...DECATHLON_PROFILE.staff.map((s) => s.points), ...DECATHLON_PROFILE.visitors.flatMap((v) => v.plan.map((s) => s.points))]) {
  for (const prefix of prefixes) assert.ok(ids.some((id) => id.startsWith(prefix)), `ningún punto con ${prefix}`);
}

// 9 · Merchandising variado: la nave con muchos tipos de mueble distintos y los carteles de casi todas las familias.
const kinds = new Set(loc.props.map((pr) => pr.kind));
for (const k of ['padel-court', 'padel-net', 'camping-tent', 'bike-stand', 'backpack-wall', 'kayak', 'dept-sign', 'ball-cage', 'fishing-rods', 'golf-bag', 'pillar', 'sneaker-wall', 'clothes-rack', 'fitting-room', 'treadmill', 'shelf-run', 'shelf-front', 'promo-bin'] as const) {
  assert.ok(kinds.has(k), `falta ${k}`);
}
assert.ok(kinds.size >= 25, `sólo ${kinds.size} tipos de mueble`);
const signs = loc.props.filter((pr) => pr.kind === 'dept-sign');
assert.ok(signs.every((s) => s.variant !== undefined && s.variant >= 0 && s.variant < (PROPS['dept-sign'].variants ?? 0)), 'cartel con una familia que no existe');
assert.ok(new Set(signs.map((s) => s.variant)).size >= 10, 'carteles de pocas familias');
// Lo que cuelga del techo (carteles y tubos) no se monta uno encima de otro: a menos de dos filas, sin compartir columna.
const hung = loc.props.filter((pr) => PROPS[pr.kind].overhead);
for (const [i, a] of hung.entries()) for (const b of hung.slice(i + 1)) {
  const overlapX = a.tx < b.tx + (PROPS[b.kind].tilesWide ?? 1) && b.tx < a.tx + (PROPS[a.kind].tilesWide ?? 1);
  assert.ok(!(overlapX && Math.abs(a.ty - b.ty) < 2), `${a.kind} (${a.tx}, ${a.ty}) y ${b.kind} (${b.tx}, ${b.ty}) se tapan`);
}

// 10 · Lo que pide el plano está: sus etiquetas, cada una en su sección.
for (const label of ['Raqueta', 'Running', 'Probadores', 'Montaña JR', 'Montaña mujer', 'Montaña Hombre', 'Camping', 'mochilas', 'segunda vida', 'Ciclismo', 'Calzado Mujer', 'Calzado Hombre', 'ESCALADA', 'Dep. Agua', 'Fitness mujer', 'Fitness Mat', 'Fitness Hombre', 'Barco + kayak', 'Golf', 'Equitación', 'Caza', 'Pesca', 'Salud y accesorios', 'SWIM PRO', 'Baloncesto', 'Roller']) {
  assert.ok(SECTORS.some((s) => s.plan.includes(label)), `falta la sección del plano «${label}»`);
}
// Disposición relativa del plano: raqueta arriba a la izquierda, ciclismo a la derecha, fitness abajo a la izquierda,
// y la puerta abajo a la derecha.
const rectOf = (id: string): Rect => SECTORS.find((s) => s.id === id)!.rect;
assert.ok(rectOf('raqueta-padel').x0 <= 2 && rectOf('raqueta-padel').y0 <= 2, 'raqueta no está arriba a la izquierda');
assert.ok(rectOf('ciclismo').x0 > DECATHLON_W * 0.75 && rectOf('segunda-vida').y0 <= 2, 'ciclismo y segunda vida no ocupan la derecha');
assert.ok(rectOf('fitness-mat').x0 <= 2 && rectOf('fitness-mat').y1 > DECATHLON_H * 0.7, 'fitness no está abajo a la izquierda');
assert.ok(loc.portals[0].tx > DECATHLON_W * 0.75 && loc.portals[0].ty === DECATHLON_H - 2, 'la puerta no está abajo a la derecha');

// 11 · Partidas guardadas en la tienda de antes (14 × 11, entrada en (7, 8)): reaparecen en un sitio pisable. Si el tile
// guardado cae ahora en un mueble, el más cercano libre; si no hay, la entrada.
for (const t of [{ tx: 7, ty: 8 }, { tx: 2, ty: 2 }, { tx: 6, ty: 2 }, { tx: 8, ty: 5 }, { tx: 12, ty: 3 }, { tx: 10, ty: 8 }]) {
  const pos = safePosition(loc.id, spawnToWorld({ ...t, facing: 'up' }), 'entry');
  assert.ok(isWalkable(loc, Math.floor(pos.x / 16), Math.floor((pos.y - 1) / 16)), `partida antigua en (${t.tx}, ${t.ty}): reaparece dentro de algo`);
}

// 12 · Con calle (Alpha-09): del andén a la explanada, a pie hasta la puerta de la fachada, dentro; y la puerta de dentro
// devuelve a esa misma puerta. La parada es una estación más y no queda ningún sitio sin mapa.
const street = getLocation('poligono-norte');
validate(street);
const nave = street.buildings!.find((b) => b.id === 'pn-decathlon')!;
assert.ok(nave.style === 'megastore' && nave.front === 's' && (nave.floors ?? 1) >= 3, 'la nave no tiene su fachada de gran formato');
assert.deepEqual(nave.enter, { location: loc.id, spawn: 'entry' }, 'la puerta de la fachada no entra en la tienda');
assert.ok(loc.portals.every((p) => p.to.location === street.id && p.to.spawn === nave.id && !p.offMap), 'la tienda no sale a su explanada');
assert.ok(street.spawns[nave.id] && street.portals.some((p) => p.to.location === loc.id), 'la fachada sin portal o sin spawn de vuelta');
const stop = STOPS.find((s) => s.id === 'decathlon')!;
assert.ok(stop.station === 'decathlon-station' && !stop.offMap, 'la parada de Decathlon sigue sin estación');
const station = getLocation(stop.station);
const out = station.portals.find((p) => !p.train)!;
assert.ok(out && out.to.location === street.id && street.spawns[out.to.spawn], 'el andén no sale a la explanada');
const walkTo = tilePath(street, street.spawns[out.to.spawn], street.spawns[nave.id]);
assert.ok(walkTo && walkTo.length > 5, 'del metro a la puerta de la tienda no se llega andando');
assert.equal(OFF_MAP_PLACES.length, 0, 'queda un sitio sin mapa');
assert.equal(placeForInterior(loc.id)?.locationId, street.id, 'la gente no llega por la calle');

// 13 · Tráfico y gente de paso en la calle: los carriles cruzan el mapa por calzada sin un coche aparcado encima, el paso de
// cebra corta los dos frente a la puerta, nadie se para en la calzada, y la gente de la tienda va y viene sólo con ella
// abierta; de noche, sin coches.
const traffic = street.traffic!;
assert.ok(traffic && traffic.lanes.length === 2, 'la calle sin sus dos carriles');
for (const lane of traffic.lanes) {
  assert.ok([...street.ground[lane.row]].every((ch) => ROADWAY.has(ch)), `carril ${lane.row}: no es calzada de punta a punta`);
  for (const pr of street.props) {
    const def = PROPS[pr.kind];
    if (def.overhead || def.flat) continue;
    assert.ok(pr.ty !== lane.row, `${pr.kind} en (${pr.tx}, ${pr.ty}) aparcado encima del carril ${lane.row}`);
  }
  assert.equal(street.ground[lane.row][nave.doorX!], 'z', `carril ${lane.row}: sin paso de cebra delante de la puerta`);
}
assert.ok(traffic.perLane <= 2 && traffic.hourly!.some(([a, b, n]) => a <= 23 && 23 < b && n === 0), 'tráfico sin límite o de noche');
for (const [id, pt] of Object.entries(street.points ?? {})) {
  if (pt.kind !== 'path' && pt.kind !== 'edge' && pt.kind !== 'entrance') assert.ok(!ROADWAY.has(street.ground[pt.ty][pt.tx]), `${id}: alguien se para en la calzada`);
}
const profile = STREET_PROFILES.find((pr) => pr.location === street.id)!;
assert.ok(profile && profile.maxWalkers <= 20, 'la calle sin gente de paso o sin límite');
const [open, close] = placeInfo(loc.id)!.hours!;
for (const tr of profile.trips.filter((t) => [t.from, t.to].some((e) => e.tags?.includes('sport')))) {
  const [a, b] = tr.hours!;
  assert.ok(a >= open - 0.5 && b <= close + 0.5, `${tr.role}: va o viene de la tienda cerrada (${a}–${b})`);
}
assert.ok(profile.trips.some((t) => t.from.points?.includes('PN_PARK_')) && profile.trips.some((t) => t.to.points?.includes('PN_PARK_')), 'nadie llega ni vuelve al coche');

console.log(`check-decathlon: OK · calle ${walkTo.length} tiles del metro a la puerta · ${SECTORS.length} secciones · ${AISLES.length} pasillos · ${BLOCKS.length} circuitos · ${loc.props.length} muebles de ${kinds.size} tipos · ${seen.size} tiles alcanzables`);
