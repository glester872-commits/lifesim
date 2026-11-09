import type { BuildingDef, LocationDef, PointDef, PropKind, PropPlacement } from '../types/game.ts';

/**
 * LUNA: el barrio de la noche, la última parada de la Línea 2 por el lado de Casco Antiguo. Una sola calle cerrada,
 * peatonal, con las medianeras de la manzana a los dos lados: se llega y se sale por el metro.
 *
 *   y 2–8   los bajos del norte: viviendas, el bar, la tienda, la sala cerrada por obras y la boca de metro
 *   y 9–10  acera norte
 *   y 11–13 la calzada de losa, donde se queda la gente
 *   y 14–15 acera sur
 *   y 16–23 los bajos del sur: viviendas
 *
 * Los locales con puerta son el bar y la tienda (data/lunaVenues.ts y data/locations.ts); la sala, sin `enter`.
 */
const W = 34;
const H = 24;

type Paint = readonly [string, number, number, number, number];

function paint(fill: string, rects: readonly Paint[]): string[] {
  const grid = Array.from({ length: H }, () => Array<string>(W).fill(fill));
  for (const [ch, x, y, w, h] of rects) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[yy][xx] = ch;
  }
  return grid.map((row) => row.join(''));
}

const GROUND = paint('g', [
  // Las dos aceras, la calzada de losa y la franja podotáctil delante de la boca de metro.
  [',', 3, 9, 28, 2], [',', 3, 14, 28, 2],
  ['P', 3, 11, 28, 3],
  ['T', 27, 9, 3, 1],
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
  // Las medianeras que cierran la calle a los dos lados.
  { id: 'lu-cierre-o', name: 'Manzana oeste', style: 'backdrop', tx: 0, ty: 0, w: 3, h: 24 },
  { id: 'lu-cierre-e', name: 'Manzana este', style: 'backdrop', tx: 31, ty: 0, w: 3, h: 24 },
  b('lu-res-1', 'Calle de la Luna 2', 'res-modern', [3, 2, 5, 7], 's', 5, { point: 'LU_RES_1_ENTRANCE' }),
  b('lu-bar', 'Bar Luna Llena', 'bar', [8, 2, 6, 7], 's', 10, { enter: { location: 'lu-bar', spawn: 'entry' }, point: 'LU_BAR_ENTRANCE' }),
  b('lu-abierto', 'Abierto Toda la Noche', 'grocer', [14, 2, 5, 7], 's', 16, { enter: { location: 'lu-abierto', spawn: 'entry' }, point: 'LU_SHOP_ENTRANCE' }),
  b('lu-sala', 'Sala Eclipse', 'club', [19, 2, 7, 7], 's', 22, { inspect: ['Cartel en la puerta: «Sala cerrada por obras». Dentro se oye un taladro, no un bajo.'] }),
  b('lu-metro', 'Metro · Luna', 'metro', [26, 5, 5, 4], 's', 28, { enter: { location: 'luna-station', spawn: 'entry' }, point: 'LU_METRO_ENTRANCE' }),
  b('lu-res-s1', 'Calle de la Luna 1', 'res-brick', [3, 16, 5, 8], 'n', 5),
  b('lu-res-s2', 'Calle de la Luna 5', 'res-plaster', [8, 16, 5, 8], 'n', 10),
  b('lu-res-2', 'Calle de la Luna 9', 'res-modern', [13, 16, 5, 8], 'n', 15, { point: 'LU_RES_2_ENTRANCE' }),
  b('lu-res-s4', 'Calle de la Luna 13', 'res-plaster', [18, 16, 4, 8], 'n', 19),
  b('lu-res-3', 'Calle de la Luna 17', 'res-brick', [22, 16, 5, 8], 'n', 24, { point: 'LU_RES_3_ENTRANCE' }),
  b('lu-res-s6', 'Calle de la Luna 21', 'res-modern', [27, 16, 4, 8], 'n', 28),
];

const at = (kind: PropKind, tx: number, ty: number): PropPlacement => ({ kind, tx, ty });
const many = (kind: PropKind, cells: readonly (readonly [number, number])[]): PropPlacement[] => cells.map(([x, y]) => at(kind, x, y));

// Las filas 10 y 14 y las columnas 10 y 22 de la losa quedan sin props: por ahí va la gente.
const PROPS: readonly PropPlacement[] = [
  at('metro-totem', 30, 9),
  at('notice-board', 18, 13),
  ...many('tree', [[27, 2], [29, 2]]),
  ...many('street-lamp', [[7, 9], [13, 9], [20, 9], [25, 9], [8, 15], [13, 15], [21, 15], [26, 15]]),
  ...many('bin', [[18, 9], [17, 15]]),
  // Los remates de la calle, contra las medianeras.
  ...many('planter-box', [[4, 12], [29, 12]]),
  ...many('cafe-table', [[6, 11], [14, 11]]),
];

const p = (tx: number, ty: number, kind: PointDef['kind'], facing?: PointDef['facing']): PointDef => ({ tx, ty, kind, facing });
const pad = (x: number): string => String(x).padStart(2, '0');

/** Nodos de la acera norte (fila 10) y de la sur (fila 14). */
const NORTH = [5, 10, 16, 22, 28] as const;
const SOUTH = [5, 10, 15, 22, 24, 28] as const;

const POINTS: Record<string, PointDef> = {
  // Umbrales de portal por donde sale la gente al resto de la ciudad; la calle está cerrada.
  EDGE_LU_W: p(5, 15, 'edge'), EDGE_LU_E: p(28, 15, 'edge'),
  ...Object.fromEntries(NORTH.map((x) => [`lu-n${pad(x)}`, p(x, 10, 'path')])),
  ...Object.fromEntries(SOUTH.map((x) => [`lu-s${pad(x)}`, p(x, 14, 'path')])),
  // Los dos cruces de la losa, de acera a acera.
  'lu-cw': p(10, 12, 'path'), 'lu-ce': p(22, 12, 'path'),
  // Los corrillos de la noche, de dos en dos, a los lados de cada cruce.
  LU_CORRILLO_01: p(7, 12, 'meet', 'right'), LU_CORRILLO_02: p(8, 12, 'meet', 'left'),
  LU_CORRILLO_03: p(12, 12, 'meet', 'right'), LU_CORRILLO_04: p(13, 12, 'meet', 'left'),
  LU_CORRILLO_05: p(19, 12, 'meet', 'right'), LU_CORRILLO_06: p(20, 12, 'meet', 'left'),
  LU_CORRILLO_07: p(24, 12, 'meet', 'right'), LU_CORRILLO_08: p(25, 12, 'meet', 'left'),
  // Quien espera a alguien a la boca de metro.
  LU_METRO_WAIT_01: p(26, 9, 'wait', 'right'),
};

type Link = readonly [string, string];
const chain = (...ids: string[]): Link[] => ids.slice(1).map((id, i) => [ids[i], id] as const);

const LINKS: readonly Link[] = [
  ...chain(...NORTH.map((x) => `lu-n${pad(x)}`)),
  ...chain(...SOUTH.map((x) => `lu-s${pad(x)}`)),
  ['lu-n10', 'lu-cw'], ['lu-cw', 'lu-s10'], ['lu-n22', 'lu-ce'], ['lu-ce', 'lu-s22'],
  ['EDGE_LU_W', 'lu-s05'], ['EDGE_LU_E', 'lu-s28'],
  ['LU_RES_1_ENTRANCE', 'lu-n05'], ['LU_BAR_ENTRANCE', 'lu-n10'], ['LU_SHOP_ENTRANCE', 'lu-n16'], ['LU_METRO_ENTRANCE', 'lu-n28'],
  ['LU_RES_2_ENTRANCE', 'lu-s15'], ['LU_RES_3_ENTRANCE', 'lu-s24'],
  ['LU_CORRILLO_01', 'lu-cw'], ['LU_CORRILLO_02', 'lu-cw'], ['LU_CORRILLO_03', 'lu-cw'], ['LU_CORRILLO_04', 'lu-cw'],
  ['LU_CORRILLO_05', 'lu-ce'], ['LU_CORRILLO_06', 'lu-ce'], ['LU_CORRILLO_07', 'lu-ce'], ['LU_CORRILLO_08', 'lu-ce'],
  ['LU_METRO_WAIT_01', 'lu-n28'],
];

export const LUNA: LocationDef = {
  id: 'luna',
  name: 'Luna',
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
    { profile: 'transit', tx: 26, ty: 0, w: 5, h: 12 },
  ],
  inspects: [
    { tx: 30, ty: 9, name: 'Plano del barrio', lines: ['Luna: la Calle de la Luna, el Bar Luna Llena y el Abierto Toda la Noche. Línea 2 hacia Casco Antiguo y Vallesco.'] },
    { tx: 18, ty: 13, name: 'Tablón', lines: ['Un cartel a mano: «Se ha perdido un gato gris por la calle. Responde a Lunes». Debajo, otra letra: «y los demás días no».'] },
    { tx: 4, ty: 12, name: 'Fin de la calle', lines: ['Aquí acaba la Calle de la Luna: medianeras de la manzana. Se sale por el metro.'] },
    { tx: 29, ty: 12, name: 'Fin de la calle', lines: ['Aquí acaba la Calle de la Luna: medianeras de la manzana. Se sale por el metro.'] },
  ],
  areas: [
    { name: 'Calle de la Luna', tx: 16, ty: 12 },
  ],
};
