import type { BuildingDef, LocationDef, PointDef, PropKind, PropPlacement, StallAnchor } from '../types/game.ts';

/**
 * CASCO ANTIGUO: el barrio viejo de la Línea 2, tres paradas más allá de Vallesco por el lado de Ribera.
 * La Calle Mayor, de fachadas estrechas y bajos comerciales, y la Plaza del Mercado, abierta y con bancos.
 *
 *   y 2–8   los bajos del norte: viviendas, el horno, la frutería del mercado, ultramarinos, un café y la boca de metro
 *   y 9–10  acera norte
 *   y 11–13 la calle: un carril por sentido y un paso de cebra
 *   y 14–15 acera central
 *   y 16–23 la Plaza del Mercado: losa, bancos, mesas de terraza y pocos árboles
 *   y 24–25 acera sur
 *   y 26–33 los bajos del sur: viviendas, cortados por el Pasaje del Mercado (x 17–18) y el Callejón de las Cestas (x 44–45)
 *   y 34–35 la Calle del Rastro: peatonal, sin calzada
 *   y 36–43 los bajos del Rastro: viviendas, unas antigüedades y una churrería
 *
 * Los locales con puerta son la frutería y la Taberna La Lonja (data/cascoAntiguoVenues.ts); las demás fachadas, sin `enter`.
 * `stallAnchors`: dónde van los puestos del Gran Rastro de los domingos (data/popups.ts 'gran-rastro').
 */
const W = 52;
const H = 44;

type Paint = readonly [string, number, number, number, number];

function paint(fill: string, rects: readonly Paint[]): string[] {
  const grid = Array.from({ length: H }, () => Array<string>(W).fill(fill));
  for (const [ch, x, y, w, h] of rects) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[yy][xx] = ch;
  }
  return grid.map((row) => row.join(''));
}

const GROUND = paint('g', [
  // Las tres aceras y la franja podotáctil delante de la boca de metro.
  [',', 0, 9, W, 2], [',', 0, 14, W, 2], [',', 0, 24, W, 2],
  ['T', 39, 9, 3, 1],
  // La calle: dos carriles con la línea en medio, y el paso de cebra.
  ['.', 0, 11, W, 3], ['l', 0, 12, W, 1],
  ['z', 20, 11, 3, 3],
  // La Plaza del Mercado: losa de borde a borde.
  ['P', 2, 16, 48, 8],
  // El Pasaje del Mercado y el Callejón de las Cestas bajan de la acera sur a la Calle del Rastro, peatonal.
  [',', 17, 26, 2, 8], [',', 44, 26, 2, 8],
  [',', 0, 34, W, 2],
]);

const b = (
  id: string,
  name: string,
  style: BuildingDef['style'],
  [tx, ty, w, h]: readonly [number, number, number, number],
  front: BuildingDef['front'],
  doorX: number,
  extra: Partial<BuildingDef> = {},
): BuildingDef => ({ id, name, style, tx, ty, w, h, front, doorX, ...extra });

const BUILDINGS: readonly BuildingDef[] = [
  b('cas-res-1', 'Calle Mayor 2', 'res-brick', [0, 2, 6, 7], 's', 2, { point: 'CAS_RES_1_ENTRANCE' }),
  b('cas-horno', 'Horno de la Plaza', 'bakery', [6, 2, 5, 7], 's', 8),
  b('cas-res-2', 'Calle Mayor 8', 'res-plaster', [11, 2, 5, 7], 's', 13, { point: 'CAS_RES_2_ENTRANCE' }),
  b('cas-fruteria', 'Mercado · Frutas del Casco', 'fruit', [16, 2, 6, 7], 's', 18, { enter: { location: 'cas-fruteria', spawn: 'entry' }, point: 'CAS_FRUIT_ENTRANCE' }),
  b('cas-ultramarinos', 'Ultramarinos Mayor', 'grocer', [22, 2, 5, 7], 's', 24),
  b('cas-res-3', 'Calle Mayor 16', 'res-modern', [27, 2, 6, 7], 's', 29, { point: 'CAS_RES_3_ENTRANCE' }),
  // CAS-06: la taberna de tapas, con interior (data/cascoAntiguoVenues.ts); la puerta en x 35, fuera del Pasaje y de las columnas 19–23.
  b('cas-cafe', 'Taberna La Lonja', 'cafe', [33, 2, 5, 7], 's', 35, { enter: { location: 'cas-taberna', spawn: 'entry' }, point: 'CAS_TABERNA_ENTRANCE' }),
  b('cas-metro', 'Metro · Casco Antiguo', 'metro', [38, 5, 5, 4], 's', 40, { enter: { location: 'casco-antiguo-station', spawn: 'entry' }, point: 'CAS_METRO_ENTRANCE' }),
  b('cas-res-4', 'Calle Mayor 1', 'res-plaster', [0, 26, 6, 8], 'n', 3),
  b('cas-res-5', 'Calle Mayor 5', 'res-brick', [6, 26, 6, 8], 'n', 9),
  b('cas-res-6', 'Calle Mayor 9', 'res-modern', [12, 26, 5, 8], 'n', 14),
  b('cas-res-7', 'Calle Mayor 13', 'res-brick', [19, 26, 4, 8], 'n', 20),
  b('cas-res-8', 'Calle Mayor 17', 'res-plaster', [23, 26, 5, 8], 'n', 25),
  b('cas-res-9', 'Calle Mayor 21', 'res-modern', [28, 26, 6, 8], 'n', 31),
  b('cas-res-10', 'Calle Mayor 25', 'res-brick', [34, 26, 5, 8], 'n', 36),
  b('cas-res-11', 'Calle Mayor 29', 'res-plaster', [39, 26, 5, 8], 'n', 41),
  b('cas-res-12', 'Calle Mayor 20', 'res-modern', [45, 2, 6, 7], 's', 47),
  b('cas-res-13', 'Calle Mayor 33', 'res-plaster', [46, 26, 6, 8], 'n', 48),
  // Los bajos del Rastro, de espaldas al borde sur.
  b('cas-rastro-1', 'Calle del Rastro 1', 'res-brick', [0, 36, 6, 8], 'n', 3),
  b('cas-rastro-2', 'Calle del Rastro 3', 'res-plaster', [6, 36, 5, 8], 'n', 8),
  // CAS-06b: el anticuario, con interior (data/cascoAntiguoVenues.ts); Discos y Encuadernación, sólo fachada.
  b('cas-rastro-3', 'Anticuario Ventura', 'vintage', [11, 36, 6, 8], 'n', 14, { enter: { location: 'cas-anticuario', spawn: 'entry' }, point: 'CAS_ANTICUARIO_ENTRANCE' }),
  b('cas-rastro-4', 'Discos del Casco', 'records', [17, 36, 6, 8], 'n', 20),
  b('cas-rastro-5', 'Calle del Rastro 9', 'res-brick', [23, 36, 5, 8], 'n', 25),
  b('cas-rastro-6', 'Encuadernación y Restauración', 'print',[28, 36, 6, 8], 'n', 31),
  b('cas-rastro-7', 'Churrería del Rastro', 'bakery', [34, 36, 6, 8], 'n', 37),
  b('cas-rastro-8', 'Calle del Rastro 15', 'res-modern', [40, 36, 6, 8], 'n', 43),
  b('cas-rastro-9', 'Calle del Rastro 17', 'res-brick', [46, 36, 6, 8], 'n', 49),
];

const at = (kind: PropKind, tx: number, ty: number): PropPlacement => ({ kind, tx, ty });
const many = (kind: PropKind, cells: readonly (readonly [number, number])[]): PropPlacement[] => cells.map(([x, y]) => at(kind, x, y));

// Las columnas 19–23 (paso de cebra y bajada por la plaza) quedan sin props: por ahí pasa el carrito de limpieza.
const PROPS: readonly PropPlacement[] = [
  // Delante de la boca de metro: el plano del barrio. El tablón, en la acera central, fuera del paso.
  at('metro-totem', 43, 9),
  at('notice-board', 36, 14),
  ...many('tree', [[39, 2], [41, 2]]),
  // Las aceras: farolas contra la calle y papeleras.
  ...many('street-lamp', [[5, 9], [11, 9], [16, 9], [27, 9], [32, 9], [6, 25], [16, 25], [33, 25]]),
  ...many('bin', [[26, 9], [30, 14]]),
  at('vending', 26, 14),
  ...many('planter-box', [[8, 14], [40, 14]]),
  // La Plaza del Mercado: pocos árboles en las esquinas y bancos mirando al centro.
  ...many('tree', [[4, 17], [39, 17], [5, 22], [38, 22]]),
  ...many('bench', [[13, 17], [16, 17], [26, 17], [29, 17], [13, 22], [29, 22]]),
  // La terraza de La Lonja: dos mesas con su silla (tables, abajo); el camarero, entre las dos sillas y a 2 tiles de
  // cada una para no tapar la E de las opciones de mesa, como en Puerta Central.
  ...many('cafe-table', [[32, 18], [36, 18]]),
  ...many('chair-up', [[32, 19], [36, 19]]),
  // La Calle del Rastro: dos farolas en el lado norte, fuera del Pasaje y del Callejón.
  ...many('street-lamp', [[15, 34], [42, 34]]),
];

const p = (tx: number, ty: number, kind: PointDef['kind'], facing?: PointDef['facing']): PointDef => ({ tx, ty, kind, facing });
const pad = (x: number): string => String(x).padStart(2, '0');

/** Puertas de la acera norte (nodo en la fila 10), nodos de la central (fila 15) y de la sur (fila 24). */
const NORTH = [2, 13, 18, 21, 29, 35, 40] as const;
const MID = [10, 21, 33, 46] as const;
const SOUTH = [9, 17, 21, 36, 44] as const;
/** La Calle del Rastro (fila 35), donde desembocan el Pasaje (x 17) y el Callejón de las Cestas (x 44). */
const RASTRO = [17, 44] as const;

const POINTS: Record<string, PointDef> = {
  EDGE_CAS_NW: p(0, 10, 'edge'), EDGE_CAS_NE: p(W - 1, 10, 'edge'),
  EDGE_CAS_MW: p(0, 15, 'edge'), EDGE_CAS_ME: p(W - 1, 15, 'edge'),
  EDGE_CAS_SW: p(0, 24, 'edge'), EDGE_CAS_SE: p(W - 1, 24, 'edge'),
  EDGE_CAS_RW: p(0, 35, 'edge'), EDGE_CAS_RE: p(W - 1, 35, 'edge'),
  ...Object.fromEntries(NORTH.map((x) => [`cas-n${pad(x)}`, p(x, 10, 'path')])),
  ...Object.fromEntries(MID.map((x) => [`cas-m${pad(x)}`, p(x, 15, 'path')])),
  ...Object.fromEntries(SOUTH.map((x) => [`cas-s${pad(x)}`, p(x, 24, 'path')])),
  ...Object.fromEntries(RASTRO.map((x) => [`cas-r${pad(x)}`, p(x, 35, 'path')])),
  // Por la plaza, de la acera central a la sur; y por su lado este, la segunda bajada.
  'cas-plaza': p(21, 20, 'path'),
  'cas-plaza-e': p(46, 20, 'path'),
  // Quien se queda un rato en la plaza, entre los bancos.
  CAS_PLAZA_01: p(14, 19, 'meet', 'right'), CAS_PLAZA_02: p(15, 19, 'meet', 'left'),
  CAS_PLAZA_03: p(27, 19, 'meet', 'right'), CAS_PLAZA_04: p(28, 19, 'meet', 'left'),
  // Delante de las mesas de la terraza del café, en la fila 20 (libre de props).
  CAS_PLAZA_05: p(31, 20, 'meet', 'right'), CAS_PLAZA_06: p(33, 20, 'meet', 'left'),
  CAS_PLAZA_07: p(35, 20, 'meet', 'right'), CAS_PLAZA_08: p(37, 20, 'meet', 'left'),
  // Quien espera a alguien a la boca de metro.
  CAS_METRO_WAIT_01: p(38, 9, 'wait', 'right'),
  // La terraza de La Lonja: una silla debajo de cada mesa, el camarero entre las dos (a 2 tiles de cada silla: quieto en
  // su base no acapara la E de las opciones de mesa, como en Puerta Central) y, en la fila 16, el nodo por el que se
  // baja desde la acera central (cas-m33) por la columna 34, entre las dos mesas.
  CAS_TABERNA_TERRACE_01: p(32, 19, 'seat', 'up'), CAS_TABERNA_TERRACE_02: p(36, 19, 'seat', 'up'),
  CAS_TABERNA_TERRACE_WAITER: p(34, 19, 'work', 'up'),
  'cas-terraza': p(34, 16, 'path'),
};

type Link = readonly [string, string];
const chain = (...ids: string[]): Link[] => ids.slice(1).map((id, i) => [ids[i], id] as const);

const LINKS: readonly Link[] = [
  ...chain('EDGE_CAS_NW', ...NORTH.map((x) => `cas-n${pad(x)}`), 'EDGE_CAS_NE'),
  ...chain('EDGE_CAS_MW', ...MID.map((x) => `cas-m${pad(x)}`), 'EDGE_CAS_ME'),
  ...chain('EDGE_CAS_SW', ...SOUTH.map((x) => `cas-s${pad(x)}`), 'EDGE_CAS_SE'),
  // El paso de cebra y la bajada por la plaza.
  ['cas-n21', 'cas-m21'], ['cas-m21', 'cas-plaza'], ['cas-plaza', 'cas-s21'],
  // La Calle del Rastro, el Pasaje, el Callejón de las Cestas y la bajada este por la plaza.
  ...chain('EDGE_CAS_RW', ...RASTRO.map((x) => `cas-r${pad(x)}`), 'EDGE_CAS_RE'),
  ['cas-s17', 'cas-r17'], ['cas-s44', 'cas-r44'],
  ['cas-m46', 'cas-plaza-e'], ['cas-plaza', 'cas-plaza-e'], ['cas-plaza-e', 'cas-s44'],
  ['CAS_RES_1_ENTRANCE', 'cas-n02'], ['CAS_RES_2_ENTRANCE', 'cas-n13'], ['CAS_RES_3_ENTRANCE', 'cas-n29'],
  ['CAS_FRUIT_ENTRANCE', 'cas-n18'], ['CAS_TABERNA_ENTRANCE', 'cas-n35'], ['CAS_METRO_ENTRANCE', 'cas-n40'],
  ['CAS_ANTICUARIO_ENTRANCE', 'cas-r17'],
  ['CAS_PLAZA_01', 'cas-plaza'], ['CAS_PLAZA_02', 'cas-plaza'], ['CAS_PLAZA_03', 'cas-plaza'], ['CAS_PLAZA_04', 'cas-plaza'],
  ['CAS_PLAZA_05', 'cas-plaza'], ['CAS_PLAZA_06', 'cas-plaza'], ['CAS_PLAZA_07', 'cas-plaza'], ['CAS_PLAZA_08', 'cas-plaza'],
  ['CAS_METRO_WAIT_01', 'cas-n40'],
  // La terraza: de la acera a (34,16), bajando recto hasta el camarero (34,19) y de ahí a cada silla, en horizontal
  // por (33,19) y (35,19), que quedan libres. Un tramo
  // diagonal de (34,16) a una silla rozaría la mesa de encima (lineClear), por eso las sillas cuelgan del camarero.
  ['cas-m33', 'cas-terraza'], ['CAS_TABERNA_TERRACE_WAITER', 'cas-terraza'],
  ['CAS_TABERNA_TERRACE_01', 'CAS_TABERNA_TERRACE_WAITER'], ['CAS_TABERNA_TERRACE_02', 'CAS_TABERNA_TERRACE_WAITER'],
];

// Anclas del Gran Rastro, validadas en systems/LocationSystem: los puestos salen de 'market' y 'stall' (systems/PopUps.popUpStalls).
const CAPACITY: Record<StallAnchor['type'], number> = { market: 4, stall: 2, access: 1 };
const anchors = (zone: string, type: StallAnchor['type'], cells: readonly (readonly [number, number])[]): StallAnchor[] =>
  cells.map(([tx, ty], i) => ({ id: `casco.${zone}.${type}.${pad(i + 1)}`, tx, ty, type, capacity: CAPACITY[type] }));

const STALL_ANCHORS: readonly StallAnchor[] = [
  ...anchors('plaza', 'market', [[7, 17], [9, 17], [11, 17], [41, 17], [43, 17], [48, 17], [7, 22], [9, 22], [11, 22], [31, 22], [41, 22], [43, 22], [48, 22], [9, 20]]),
  ...anchors('calleMayor', 'stall', [[3, 14], [5, 14], [12, 14], [14, 14], [16, 14], [28, 14], [32, 14], [34, 14], [44, 14], [48, 14], [45, 9], [50, 9]]),
  ...anchors('calleSecundaria', 'stall', [[3, 34], [6, 34], [9, 34], [12, 34], [24, 34], [27, 34], [30, 34], [33, 34], [36, 34], [39, 34], [47, 34], [50, 34]]),
  ...anchors('calleSecundaria', 'access', [[18, 27], [18, 32], [45, 27], [45, 32]]),
];

export const CASCO_ANTIGUO: LocationDef = {
  id: 'casco-antiguo',
  name: 'Casco Antiguo',
  kind: 'exterior',
  finish: 'hd04',
  ground: GROUND,
  buildings: BUILDINGS,
  props: PROPS,
  portals: [],
  npcs: [],
  spawns: {},
  points: POINTS,
  links: LINKS,
  // Identidad visual (data/districts.ts): ciudad densa de bajos comerciales; la boca, en zona de tránsito.
  district: 'dense',
  zones: [
    { profile: 'transit', tx: 38, ty: 0, w: 6, h: 12 },
    { profile: 'vintage', tx: 11, ty: 36, w: 23, h: 8 }, // CAS-06b: los bajos de segunda mano de la Calle del Rastro (anticuario, discos, encuadernación)
  ],
  traffic: {
    lanes: [{ row: 11, dir: -1 }, { row: 13, dir: 1 }],
    road: 'residential',
    perLane: 1,
    hourly: [[0, 7, 0], [7, 21, 1], [21, 24, 0]],
  },
  inspects: [
    { tx: 43, ty: 9, name: 'Plano del barrio', lines: ['Casco Antiguo: la Calle Mayor, la Plaza del Mercado, la Calle del Rastro y la frutería del mercado. Línea 2 hacia Decathlon, Ribera y Vallesco.'] },
    { tx: 36, ty: 14, name: 'Tablón', lines: ['Un cartel a mano: «Mercadillo de los domingos en la plaza. Se buscan puestos». Debajo, un teléfono a medio arrancar.'] },
  ],
  terminals: [
    { tx: 26, ty: 14, name: 'Máquina de bebidas', catalog: 'vending' },
  ],
  areas: [
    { name: 'Calle Mayor', tx: 26, ty: 12 },
    { name: 'Plaza del Mercado', tx: 26, ty: 20 },
    { name: 'Calle del Rastro', tx: 26, ty: 34 },
    { name: 'Pasaje del Mercado', tx: 17, ty: 30 },
    { name: 'Callejón de las Cestas', tx: 44, ty: 30 },
  ],
  stallAnchors: STALL_ANCHORS,
  // La terraza de La Lonja (data/streets.ts: tableService): cada mesa, su silla y el sitio de quien atiende, al lado de
  // la silla, por fuera. (31,19), (37,19) y la bajada (34,16–18) quedan sin props ni points y a más de una casilla de las
  // anclas del Rastro.
  tables: [
    { id: 'CAS_TABERNA_TERRAZA_01', seats: ['CAS_TABERNA_TERRACE_01'], service: { tx: 31, ty: 19 } },
    { id: 'CAS_TABERNA_TERRAZA_02', seats: ['CAS_TABERNA_TERRACE_02'], service: { tx: 37, ty: 19 } },
  ],
};
