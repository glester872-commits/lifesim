import type { BuildingDef, LocationDef, PointDef, PropKind, PropPlacement } from '../types/game.ts';

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
 *   y 26–33 los bajos del sur: viviendas
 *
 * El local con puerta es la frutería (data/cascoAntiguoVenues.ts); las demás fachadas, sin `enter`.
 */
const W = 44;
const H = 34;

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
  ['P', 2, 16, 40, 8],
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
  b('cas-cafe', 'Café La Lonja', 'cafe', [33, 2, 5, 7], 's', 35),
  b('cas-metro', 'Metro · Casco Antiguo', 'metro', [38, 5, 5, 4], 's', 40, { enter: { location: 'casco-antiguo-station', spawn: 'entry' }, point: 'CAS_METRO_ENTRANCE' }),
  b('cas-res-4', 'Calle Mayor 1', 'res-plaster', [0, 26, 6, 8], 'n', 3),
  b('cas-res-5', 'Calle Mayor 5', 'res-brick', [6, 26, 6, 8], 'n', 9),
  b('cas-res-6', 'Calle Mayor 9', 'res-modern', [12, 26, 5, 8], 'n', 14),
  b('cas-res-7', 'Calle Mayor 13', 'res-brick', [17, 26, 6, 8], 'n', 20),
  b('cas-res-8', 'Calle Mayor 17', 'res-plaster', [23, 26, 5, 8], 'n', 25),
  b('cas-res-9', 'Calle Mayor 21', 'res-modern', [28, 26, 6, 8], 'n', 31),
  b('cas-res-10', 'Calle Mayor 25', 'res-brick', [34, 26, 5, 8], 'n', 36),
  b('cas-res-11', 'Calle Mayor 29', 'res-plaster', [39, 26, 5, 8], 'n', 41),
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
  // La Plaza del Mercado: pocos árboles en las esquinas, bancos mirando al centro y la terraza del café.
  ...many('tree', [[4, 17], [39, 17], [5, 22], [38, 22]]),
  ...many('bench', [[13, 17], [16, 17], [26, 17], [29, 17], [13, 22], [29, 22]]),
  ...many('cafe-table', [[33, 18], [35, 18], [34, 21]]),
];

const p = (tx: number, ty: number, kind: PointDef['kind'], facing?: PointDef['facing']): PointDef => ({ tx, ty, kind, facing });
const pad = (x: number): string => String(x).padStart(2, '0');

/** Puertas de la acera norte (nodo en la fila 10), nodos de la central (fila 15) y de la sur (fila 24). */
const NORTH = [2, 13, 18, 21, 29, 40] as const;
const MID = [10, 21, 33] as const;
const SOUTH = [9, 21, 36] as const;

const POINTS: Record<string, PointDef> = {
  EDGE_CAS_NW: p(0, 10, 'edge'), EDGE_CAS_NE: p(W - 1, 10, 'edge'),
  EDGE_CAS_MW: p(0, 15, 'edge'), EDGE_CAS_ME: p(W - 1, 15, 'edge'),
  EDGE_CAS_SW: p(0, 24, 'edge'), EDGE_CAS_SE: p(W - 1, 24, 'edge'),
  ...Object.fromEntries(NORTH.map((x) => [`cas-n${pad(x)}`, p(x, 10, 'path')])),
  ...Object.fromEntries(MID.map((x) => [`cas-m${pad(x)}`, p(x, 15, 'path')])),
  ...Object.fromEntries(SOUTH.map((x) => [`cas-s${pad(x)}`, p(x, 24, 'path')])),
  // Por la plaza, de la acera central a la sur.
  'cas-plaza': p(21, 20, 'path'),
  // Quien se queda un rato en la plaza, entre los bancos.
  CAS_PLAZA_01: p(14, 19, 'meet', 'right'), CAS_PLAZA_02: p(15, 19, 'meet', 'left'),
  CAS_PLAZA_03: p(27, 19, 'meet', 'right'), CAS_PLAZA_04: p(28, 19, 'meet', 'left'),
  // Delante de las mesas de la terraza del café, en la fila 20 (libre de props).
  CAS_PLAZA_05: p(31, 20, 'meet', 'right'), CAS_PLAZA_06: p(33, 20, 'meet', 'left'),
  CAS_PLAZA_07: p(35, 20, 'meet', 'right'), CAS_PLAZA_08: p(37, 20, 'meet', 'left'),
  // Quien espera a alguien a la boca de metro.
  CAS_METRO_WAIT_01: p(38, 9, 'wait', 'right'),
};

type Link = readonly [string, string];
const chain = (...ids: string[]): Link[] => ids.slice(1).map((id, i) => [ids[i], id] as const);

const LINKS: readonly Link[] = [
  ...chain('EDGE_CAS_NW', ...NORTH.map((x) => `cas-n${pad(x)}`), 'EDGE_CAS_NE'),
  ...chain('EDGE_CAS_MW', ...MID.map((x) => `cas-m${pad(x)}`), 'EDGE_CAS_ME'),
  ...chain('EDGE_CAS_SW', ...SOUTH.map((x) => `cas-s${pad(x)}`), 'EDGE_CAS_SE'),
  // El paso de cebra y la bajada por la plaza.
  ['cas-n21', 'cas-m21'], ['cas-m21', 'cas-plaza'], ['cas-plaza', 'cas-s21'],
  ['CAS_RES_1_ENTRANCE', 'cas-n02'], ['CAS_RES_2_ENTRANCE', 'cas-n13'], ['CAS_RES_3_ENTRANCE', 'cas-n29'],
  ['CAS_FRUIT_ENTRANCE', 'cas-n18'], ['CAS_METRO_ENTRANCE', 'cas-n40'],
  ['CAS_PLAZA_01', 'cas-plaza'], ['CAS_PLAZA_02', 'cas-plaza'], ['CAS_PLAZA_03', 'cas-plaza'], ['CAS_PLAZA_04', 'cas-plaza'],
  ['CAS_PLAZA_05', 'cas-plaza'], ['CAS_PLAZA_06', 'cas-plaza'], ['CAS_PLAZA_07', 'cas-plaza'], ['CAS_PLAZA_08', 'cas-plaza'],
  ['CAS_METRO_WAIT_01', 'cas-n40'],
];

export const CASCO_ANTIGUO: LocationDef = {
  id: 'casco-antiguo',
  name: 'Casco Antiguo',
  kind: 'exterior',
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
  ],
  traffic: {
    lanes: [{ row: 11, dir: -1 }, { row: 13, dir: 1 }],
    road: 'residential',
    perLane: 1,
    hourly: [[0, 7, 0], [7, 21, 1], [21, 24, 0]],
  },
  inspects: [
    { tx: 43, ty: 9, name: 'Plano del barrio', lines: ['Casco Antiguo: la Calle Mayor, la Plaza del Mercado y la frutería del mercado. Línea 2 hacia Decathlon, Ribera y Vallesco.'] },
    { tx: 36, ty: 14, name: 'Tablón', lines: ['Un cartel a mano: «Mercadillo de los domingos en la plaza. Se buscan puestos». Debajo, un teléfono a medio arrancar.'] },
  ],
  terminals: [
    { tx: 26, ty: 14, name: 'Máquina de bebidas', catalog: 'vending' },
  ],
  areas: [
    { name: 'Calle Mayor', tx: 22, ty: 12 },
    { name: 'Plaza del Mercado', tx: 22, ty: 20 },
  ],
};
