// Decathlon por dentro (Alpha-08): `npm run check`. La nave del plano (design/Decathlon/) se recorre entera: todo lo que
// se mira, se compra o se usa se alcanza a pie desde la puerta; los pasillos no tienen nada encima y miden dos tiles o
// más; hay circuitos cerrados de verdad alrededor de cada bloque de secciones (anillos de tiles pisables, no un dibujo
// redondo); el mobiliario no se pisa entre sí ni tapa probadores, cajas o fichaje; la gente llega por rutas; y una
// partida guardada en la tienda pequeña de antes reaparece en un sitio pisable.
// DEC-02: la distribución es data/decathlonLayout.ts (departamentos, pasillos, cajas y sus turnos) y aquí se prueba que
// la nave la cumple: §7 cajas, §8 turnos de caja, §14 distribución.
import assert from 'node:assert/strict';
import { AISLES, DECATHLON_H, DECATHLON_PROFILE, DECATHLON_STORE, DECATHLON_W, SECTORS, inAisle, type Rect } from '../src/data/decathlon.ts';
import { DECATHLON_LAYOUT } from '../src/data/decathlonLayout.ts';
import { levelAt, staffOnShift } from '../src/systems/Crowd.ts';
import { weekIndex } from '../src/systems/Calendar.ts';
import { LEVELS } from '../src/config/population.ts';
import { getStore } from '../src/data/retail.ts';
import { getOffer } from '../src/data/services.ts';
import { Crowd } from '../src/systems/Crowd.ts';
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
// DEC-02: cada uno con su mínimo (principales tres tiles, secundarios dos).
for (const a of DECATHLON_LAYOUT.aisles) {
  const { x0, y0, x1, y1 } = a.rect;
  assert.ok(Math.min(x1 - x0, y1 - y0) + 1 >= Math.max(2, a.minWidth), `${a.name}: más estrecho que ${a.minWidth} tiles`);
  if (['norte', 'sur', 'cajas-acceso', 'salida'].includes(a.id)) assert.ok(a.minWidth >= 3, `${a.name}: un pasillo principal de menos de tres tiles`);
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
// DEC-02 · Cajas con cajero: quien paga en (c, 46) mirando a la derecha, mostrador y registradora en (c+1, 46), quien
// cobra en (c+2, 46) mirando a la izquierda; puntos DECAT_TILL_n, DECAT_STAFF_n y DECAT_QUEUE_n_01/02.
const has = (kind: string, tx: number, ty: number): boolean => loc.props.some((pr) => pr.kind === kind && pr.tx === tx && pr.ty === ty);
const STAFFED = DECATHLON_LAYOUT.checkouts.filter((c) => c.kind === 'staffed');
const SELF = DECATHLON_LAYOUT.checkouts.filter((c) => c.kind === 'self');
for (const [i, c] of STAFFED.entries()) {
  const n = i + 1;
  const till = loc.points![`DECAT_TILL_${n}`];
  const staff = loc.points![`DECAT_STAFF_${n}`];
  assert.ok(till && staff, `${c.id}: sin sus puntos`);
  assert.deepEqual([till.tx, till.ty, till.facing], [c.till.tx, 46, 'right'], `${c.id}: quien paga fuera de su sitio`);
  assert.deepEqual([staff.tx, staff.ty, staff.facing], [c.till.tx + 2, 46, 'left'], `${c.id}: quien cobra fuera de su sitio`);
  assert.ok(has('counter', c.till.tx + 1, 46) && has('register', c.till.tx + 1, 46), `${c.id}: el mostrador no queda entre cajero y cliente`);
  c.queue.forEach((q, k) => {
    const pt = loc.points![`DECAT_QUEUE_${n}_${String(k + 1).padStart(2, '0')}`];
    assert.ok(pt && pt.tx === q.tx && pt.ty === q.ty, `${c.id}: plaza ${k + 1} de la cola sin punto`);
  });
}
const shop = placeInfo(loc.id)!;
const isCashier = (s: { service: string }): boolean => s.service === 'cashier';
// Lunes, sábado y domingo a mediodía, y domingo de noche: lo que hay sale de levelAt + staffOnShift, no de una cuenta a mano.
for (const [day, hour] of [[1, 12], [6, 12], [7, 12], [7, 22]]) {
  const clock = { day, hour, minute: 0 };
  const level = levelAt(shop, DECATHLON_PROFILE, clock);
  const expected = DECATHLON_PROFILE.staff.filter((r) => staffOnShift(r, level, weekIndex(day), hour));
  const crowd = new Crowd(loc, shop, DECATHLON_PROFILE);
  crowd.populate(clock, entry);
  const staff = crowd.agents.flatMap((a) => a.staffRole ? [a.staffRole] : []);
  assert.equal(staff.length, expected.length, `personal del día ${day} a las ${hour}:00`);
  const cashiers = staff.filter(isCashier);
  assert.equal(cashiers.length, expected.filter(isCashier).length, `cajeros del día ${day} a las ${hour}:00`);
  for (const cashier of cashiers) {
    assert.ok(cashier.offers, 'caja sin oferta');
    const offer = getOffer(cashier.offers);
    assert.ok(offer.kind === 'retail' && offer.store === 'decathlon', 'caja sin catálogo de la tienda');
  }
}
for (const role of DECATHLON_PROFILE.staff.filter((s) => s.label?.startsWith('Sección'))) {
  for (const point of role.points) {
    assert.deepEqual(Object.keys(loc.points!).filter((id) => id.startsWith(point)), [point], `${role.label}: puesto ambiguo`);
  }
  assert.ok(role.offers);
  const offer = getOffer(role.offers);
  assert.ok(offer.kind === 'advice' && offer.questions.length >= 2);
  assert.ok(offer.questions.every(({ question, answer }) => question.trim() && answer.trim()));
}
for (const r of loc.racks ?? []) assert.ok(getStore(r.store).stock.length > 0, `${r.name}: perchero sin género`);
// DEC-02 · Turnos de caja: más cajas abiertas cuanta más gente; nunca las seis a afluencia media; ninguna con la tienda
// cerrada. Días: 1 lunes, 3 miércoles, 6 sábado (systems/Calendar).
const tills = (day: number, hour: number): number =>
  DECATHLON_PROFILE.staff.filter((r) => isCashier(r) && staffOnShift(r, levelAt(shop, DECATHLON_PROFILE, { day, hour, minute: 0 }), weekIndex(day), hour)).length;
const [monNoon, wedEve, satEve, satNoon] = [tills(1, 12), tills(3, 18), tills(6, 18), tills(6, 12)];
assert.ok(monNoon >= 1 && monNoon <= wedEve && wedEve <= satEve, `cajas: lunes 12 h ${monNoon}, miércoles 18 h ${wedEve}, sábado 18 h ${satEve}`);
assert.ok(satNoon > monNoon, `cajas: el sábado a mediodía (${satNoon}) no abre más que el lunes (${monNoon})`);
for (let d = 0; d < 7; d++) {
  // Sin hora a propósito (AFLUENCIA-DEC02): todos los turnos a la vez, el peor caso.
  const atMedium = DECATHLON_PROFILE.staff.filter((r) => isCashier(r) && staffOnShift(r, 'MEDIUM', d)).length;
  assert.ok(atMedium < STAFFED.length, `cajas: las ${STAFFED.length} abiertas a afluencia media (día ${d})`);
}
for (const day of [1, 3, 6, 7]) for (const hour of [7, 22]) assert.equal(tills(day, hour), 0, `cajas abiertas con la tienda cerrada (día ${day}, ${hour} h)`);
// Cada turno de caja es el `open` de su caja en la distribución.
for (const [i, c] of STAFFED.entries()) {
  const role = DECATHLON_PROFILE.staff.find((r) => r.points.includes(`DECAT_STAFF_${i + 1}`));
  assert.ok(role && isCashier(role), `${c.id}: sin cajero`);
  assert.deepEqual([role.days, role.minLevel], [c.open?.days, c.open?.minLevel], `${c.id}: el turno no es el de la distribución`);
  if (role.minLevel) assert.ok(LEVELS.includes(role.minLevel), `${c.id}: nivel ${role.minLevel} desconocido`);
}
// DEC-04 · Cola y pago por carril: quien hace cola en la caja n paga en la n, y sólo en una caja con cajero.
assert.ok(DECATHLON_PROFILE.lane, 'el perfil no dice dónde está el cajero de cada caja');
const shopperPlan = DECATHLON_PROFILE.visitors.find((v) => v.role === 'shopper')!.plan.flatMap((s) => s.points);
assert.ok(shopperPlan.includes('DECAT_QUEUE_{n}_') && shopperPlan.includes('DECAT_TILL_{n}'), 'el plan shopper no paga por carril');
const AT_TILL = /^DECAT_(?:QUEUE_(\d+)_\d+|TILL_(\d+))$/;
const runTills = (profile: typeof DECATHLON_PROFILE, day: number, hour: number): { queue: number; till: number; lanes: Set<string> } => {
  const clock = { day, hour, minute: 0 };
  const crowd = new Crowd(loc, shop, profile);
  crowd.populate(clock, entry);
  const queuedIn = new Map<number, string>();
  const seen = { queue: 0, till: 0, lanes: new Set<string>() };
  for (let t = 0; t < 3000; t++) {
    crowd.update(500, clock, entry);
    const open = new Set(crowd.agents.flatMap((a) => (a.staffRole && !a.leaving ? a.staffRole.points.flatMap((p) => /^DECAT_STAFF_(\d+)$/.exec(p)?.[1] ?? []) : [])));
    for (const a of crowd.agents) {
      const m = !a.staffRole && a.point ? AT_TILL.exec(a.point) : null;
      if (!m) continue;
      const n = m[1] ?? m[2];
      const where = `día ${day} ${hour} h, ${a.id} en ${a.point}`;
      assert.ok(open.has(n), `${where}: caja sin cajero`);
      assert.equal(a.lane, n, `${where}: carril ${a.lane}`);
      if (m[1]) {
        queuedIn.set(a.id, n);
        seen.queue++;
      } else {
        const q = queuedIn.get(a.id);
        assert.ok(q === undefined || q === n, `${where}: hizo cola en la caja ${q}`);
        seen.till++;
      }
      seen.lanes.add(n);
    }
  }
  return seen;
};
for (const [day, hour] of [[1, 12], [6, 18]]) {
  const seen = runTills(DECATHLON_PROFILE, day, hour);
  assert.ok(seen.queue > 0 && seen.till > 0, `día ${day} ${hour} h: nadie hace cola (${seen.queue}) o paga (${seen.till})`);
  if (day === 6) assert.ok(seen.lanes.size >= 2, `sábado 18 h: sólo se usa ${seen.lanes.size} caja`);
}
const noCashiers = runTills({ ...DECATHLON_PROFILE, staff: DECATHLON_PROFILE.staff.filter((s) => s.service !== 'cashier') }, 1, 12);
assert.equal(noCashiers.queue + noCashiers.till, 0, 'sin cajeros, alguien hace cola o paga');

// 8 · Las rutas de la gente (systems/Navigation): de la puerta a cada punto de la tienda y de vuelta.
for (const id of Object.keys(loc.points ?? {})) {
  if (id === 'DECAT_EXIT') continue;
  assert.ok(route('DECAT_EXIT', id), `sin ruta de la puerta a ${id}`);
  assert.ok(route(id, 'DECAT_EXIT'), `sin ruta de ${id} a la puerta`);
}
// Cada prefijo del perfil de gente resuelve a algún punto de aquí.
const ids = Object.keys(loc.points ?? {});
for (const prefixes of [...DECATHLON_PROFILE.staff.map((s) => s.points), ...DECATHLON_PROFILE.visitors.flatMap((v) => v.plan.map((s) => s.points))]) {
  // `{n}` (la caja): basta con la primera.
  for (const prefix of prefixes) assert.ok(ids.some((id) => id.startsWith(prefix.replace('{n}', '1'))), `ningún punto con ${prefix}`);
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
// DEC-02: y las de la nave de 46 filas (entrada en (67, 43), puerta en (67, 44)) y una pegada al muro de abajo a la izquierda.
for (const t of [{ tx: 7, ty: 8 }, { tx: 2, ty: 2 }, { tx: 6, ty: 2 }, { tx: 8, ty: 5 }, { tx: 12, ty: 3 }, { tx: 10, ty: 8 }, { tx: 7, ty: 43 }, { tx: 67, ty: 43 }, { tx: 67, ty: 44 }]) {
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

// 14 · DEC-02 · La distribución (data/decathlonLayout.ts).
const L = DECATHLON_LAYOUT;
// (a) Es la de esta tienda.
assert.equal(L.storeId, loc.id);
assert.equal(L.version, 1);
// (b) Seis departamentos, cada sección en exactamente uno, y cada uno donde dice su zona: el centro de sus secciones
// respecto al centro de la sala de ventas (filas 0–43).
assert.equal(L.departments.length, 6);
assert.deepEqual(new Set(L.departments.map((d) => d.zone)), new Set(['NW', 'N', 'NE', 'C', 'SW', 'SE']));
for (const s of SECTORS) assert.equal(L.departments.filter((d) => d.sectorIds.includes(s.id)).length, 1, `${s.id}: en ${L.departments.filter((d) => d.sectorIds.includes(s.id)).length} departamentos`);
for (const d of L.departments) for (const id of d.sectorIds) assert.ok(SECTORS.some((s) => s.id === id), `${d.id}: sección ${id} que no existe`);
const centre = (id: string): { x: number; y: number } => {
  const rs = L.departments.find((d) => d.id === id)!.sectorIds.map((s) => rectOf(s));
  return { x: rs.reduce((a, r) => a + (r.x0 + r.x1) / 2, 0) / rs.length, y: rs.reduce((a, r) => a + (r.y0 + r.y1) / 2, 0) / rs.length };
};
const CX = DECATHLON_W / 2;
const CY = 22;
const zones = Object.fromEntries(L.departments.map((d) => [d.zone, centre(d.id)]));
assert.ok(zones.NW.x < CX && zones.NW.y < CY, 'el departamento NW no está arriba a la izquierda');
assert.ok(zones.N.y < CY && Math.abs(zones.N.x - CX) < DECATHLON_W / 6, 'el departamento N no está arriba en el centro');
assert.ok(zones.NE.x > CX && zones.NE.y < CY, 'el departamento NE no está arriba a la derecha');
assert.ok(Math.abs(zones.C.x - CX) < DECATHLON_W / 6 && Math.abs(zones.C.y - CY) < CY / 3, 'el departamento C no está en el centro');
assert.ok(zones.SW.x < CX && zones.SW.y > CY, 'el departamento SW no está abajo a la izquierda');
assert.ok(zones.SE.x > CX && zones.SE.y > CY, 'el departamento SE no está abajo a la derecha');
assert.ok(zones.NW.x < zones.N.x && zones.N.x < zones.NE.x && zones.SW.x < zones.SE.x, 'departamentos fuera de orden de izquierda a derecha');
// (c) Seis cajas con cajero y dos de autopago; todo pisable; la cola, de dos plazas o más y fuera de los pasillos.
assert.equal(STAFFED.length, 6);
assert.equal(SELF.length, 2);
for (const c of L.checkouts) {
  for (const t of [c.till, c.exit, ...c.queue]) assert.ok(isStandable(loc, t.tx, t.ty), `${c.id}: (${t.tx}, ${t.ty}) no se pisa`);
  if (c.staff) assert.ok(isStandable(loc, c.staff.tx, c.staff.ty), `${c.id}: quien cobra no tiene sitio`);
  assert.ok(c.queue.length >= 2, `${c.id}: cola de menos de dos plazas`);
  for (const q of c.queue) {
    assert.ok(!inAisle(q.tx, q.ty), `${c.id}: la cola invade un pasillo en (${q.tx}, ${q.ty})`);
    assert.equal(loc.ground[q.ty][q.tx], 'e', `${c.id}: cola sin delimitar en (${q.tx}, ${q.ty})`);
  }
  if (c.kind === 'staffed') {
    assert.ok(c.staff && c.staff.ty === c.till.ty && c.staff.tx === c.till.tx + 2 && has('counter', c.till.tx + 1, c.till.ty), `${c.id}: sin mostrador entre cliente y cajero`);
  } else {
    assert.ok(!c.staff && has('register', c.till.tx, c.till.ty + 1), `${c.id}: autopago sin máquina o con cajero`);
  }
}
// Ninguna plaza de cola cae en el sitio de un cajero o de otra cola.
const queueOwner = new Map<string, string>();
for (const c of L.checkouts) for (const q of c.queue) {
  assert.ok(!queueOwner.has(key(q)), `${c.id} y ${queueOwner.get(key(q))} comparten la plaza (${q.tx}, ${q.ty})`);
  queueOwner.set(key(q), c.id);
}
const staffTiles = new Set(STAFFED.map((c) => key(c.staff!)));
for (const k of queueOwner.keys()) assert.ok(!staffTiles.has(k), `una cola pisa a un cajero en ${k}`);
// (d) Debajo de natación, solapando su ancho, a la izquierda de la puerta.
const swim = rectOf('natacion');
const door = loc.portals[0];
const xs = L.checkouts.map((c) => c.till.tx);
assert.ok(L.checkouts.every((c) => c.till.ty > swim.y1), 'una caja por encima de natación');
assert.ok(Math.min(...xs) <= swim.x1 && Math.max(...xs) >= swim.x0, 'las cajas no quedan bajo natación');
assert.ok(Math.max(...xs, ...STAFFED.map((c) => c.staff!.tx)) < door.tx, 'una caja a la derecha de la puerta');
// (e) De cada caja a la puerta sin pisar las colas de las demás ni a ningún cajero.
for (const c of L.checkouts) {
  const avoid = new Set([...staffTiles, ...[...queueOwner].filter(([, id]) => id !== c.id).map(([k]) => k)]);
  assert.ok(tilePath(loc, c.till, entry, avoid), `${c.id}: no se sale sin cruzar otra cola o un cajero`);
  assert.ok(tilePath(loc, c.exit, entry, avoid), `${c.id}: su salida no lleva a la puerta`);
}
// (g) Cada punto de caja, alcanzable por ruta desde la puerta y de vuelta (§8 ya los recorre todos); aquí, que existen.
for (const id of Object.keys(loc.points!).filter((i) => /^DECAT_(TILL|STAFF|QUEUE)_/.test(i))) {
  assert.ok(route('DECAT_EXIT', id) && route(id, 'DECAT_EXIT'), `${id}: sin ruta con la puerta`);
}
// (h) La puerta y su entorno, pisables; el pasillo de salida, sin nada encima.
assert.deepEqual([door.tx, door.ty, entry.tx, entry.ty], [67, DECATHLON_H - 2, 67, DECATHLON_H - 3], 'la puerta no está donde dice la distribución');
assert.deepEqual(L.entrances.map((e) => key(e.tile)), [key(door)]);
assert.deepEqual(L.exits.map((e) => key(e.tile)), [key(door)]);
for (const t of [door, entry, { tx: door.tx - 1, ty: entry.ty }, { tx: door.tx + 1, ty: entry.ty }]) assert.ok(isWalkable(loc, t.tx, t.ty), `la puerta, cerrada en (${t.tx}, ${t.ty})`);
const exitAisle = L.aisles.find((a) => a.id === 'salida')!.rect;
for (const pr of loc.props) {
  const def = PROPS[pr.kind];
  if (def.overhead || def.flat) continue;
  for (let x = pr.tx; x < pr.tx + (def.tilesWide ?? 1); x++) assert.ok(!inRect(exitAisle, x, pr.ty), `${pr.kind} en el pasillo de salida (${x}, ${pr.ty})`);
}
// Debajo del pasillo de cajas sólo hay nave en la franja de cajas (x 41..74).
for (let y = 44; y < DECATHLON_H - 2; y++) for (let x = 1; x < DECATHLON_W - 1; x++) assert.equal(loc.ground[y][x] === 'W', x < 41, `(${x}, ${y}): la franja de cajas no es x 41..74`);
// (j) El autopago es decorado hasta DEC-04: ni punto, ni personal, ni nada con E en su sitio.
for (const c of SELF) {
  const tiles = new Set([c.till, c.exit, ...c.queue, { tx: c.till.tx, ty: c.till.ty + 1 }].map(key));
  assert.ok(!Object.values(loc.points!).some((pt) => tiles.has(key(pt))), `${c.id}: autopago con punto`);
  assert.ok(![...(loc.spots ?? []), ...(loc.inspects ?? []), ...(loc.racks ?? [])].some((s) => tiles.has(key(s))), `${c.id}: autopago con algo que se usa`);
}
// (k) Ids de caja únicos, y ningún prefijo de caja atrae a un punto que no sea de caja (ni de otra caja).
assert.equal(new Set(L.checkouts.map((c) => c.id)).size, L.checkouts.length);
const pointIds = Object.keys(loc.points!);
for (const pre of ['DECAT_TILL_', 'DECAT_QUEUE_', 'DECAT_STAFF_']) assert.ok(pointIds.filter((id) => id.startsWith(pre)).every((id) => /^DECAT_(TILL|QUEUE|STAFF)_\d/.test(id)), `${pre} atrae a otro punto`);
for (let n = 1; n <= STAFFED.length; n++) {
  assert.deepEqual(pointIds.filter((id) => id.startsWith(`DECAT_TILL_${n}`)), [`DECAT_TILL_${n}`], `DECAT_TILL_${n} ambiguo`);
  assert.deepEqual(pointIds.filter((id) => id.startsWith(`DECAT_STAFF_${n}`)), [`DECAT_STAFF_${n}`], `DECAT_STAFF_${n} ambiguo`);
  assert.equal(pointIds.filter((id) => id.startsWith(`DECAT_QUEUE_${n}_`)).length, STAFFED[n - 1].queue.length, `DECAT_QUEUE_${n}_ ambiguo`);
}
// Mochilas y fútbol, en la banda central (DEC-02), no en el fondo.
assert.ok(rectOf('mochilas').y0 >= 14 && rectOf('futbol').y0 >= 23, 'mochilas o fútbol siguen al fondo');

console.log(`check-decathlon: OK · calle ${walkTo.length} tiles del metro a la puerta · ${SECTORS.length} secciones · ${AISLES.length} pasillos · ${BLOCKS.length} circuitos · ${loc.props.length} muebles de ${kinds.size} tipos · ${seen.size} tiles alcanzables`);
