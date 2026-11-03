import type { BuildingDef, LocationDef, PointDef, PropKind, PropPlacement } from '../types/game.ts';

/**
 * CAMPO ALTO: el barrio residencial-deportivo de la periferia, la última parada de la Línea 2 por el lado del Arena.
 * Una calle de vecinos con su café, un parque pequeño con su plaza de granito y la boca de metro en la esquina.
 *
 *   y 2–8   los bajos del norte: viviendas, el Café Campo Alto y, al este, la boca de metro
 *   y 9–10  acera norte
 *   y 11–13 la calle: un carril por sentido y un paso de cebra
 *   y 14–15 acera central
 *   y 16–23 el parque: plaza de granito, árboles y bancos
 *   y 24–25 acera sur
 *   y 26–33 los bajos del sur: viviendas
 *
 * El local con puerta es el café (data/campoAltoVenues.ts); las demás fachadas son de vecinos, sin `enter`.
 */
const W = 48;
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
  ['T', 43, 9, 3, 1],
  // La calle: dos carriles con la línea en medio, y el paso de cebra.
  ['.', 0, 11, W, 3], ['l', 0, 12, W, 1],
  ['z', 22, 11, 3, 3],
  // La plaza del parque.
  ['P', 15, 17, 18, 6],
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
  b('ca-res-1', 'Calle del Campo 2', 'res-brick', [0, 2, 8, 7], 's', 3, { point: 'CA_RES_1_ENTRANCE' }),
  b('ca-res-2', 'Calle del Campo 6', 'res-plaster', [8, 2, 7, 7], 's', 11, { point: 'CA_RES_2_ENTRANCE' }),
  b('ca-cafe', 'Café Campo Alto', 'cafe', [15, 2, 6, 7], 's', 17, { enter: { location: 'ca-cafe', spawn: 'entry' }, point: 'CA_CAFE_ENTRANCE' }),
  b('ca-res-3', 'Calle del Campo 12', 'res-modern', [21, 2, 8, 7], 's', 23, { point: 'CA_RES_3_ENTRANCE' }),
  b('ca-res-4', 'Calle del Campo 16', 'res-brick', [29, 2, 7, 7], 's', 32),
  b('ca-res-5', 'Calle del Campo 20', 'res-plaster', [36, 2, 6, 7], 's', 38),
  b('ca-metro', 'Metro · Campo Alto', 'metro', [42, 5, 5, 4], 's', 44, { enter: { location: 'campo-alto-station', spawn: 'entry' }, point: 'CA_METRO_ENTRANCE' }),
  b('ca-res-6', 'Calle del Campo 3', 'res-plaster', [0, 26, 8, 8], 'n', 3),
  b('ca-res-7', 'Calle del Campo 7', 'res-brick', [8, 26, 9, 8], 'n', 12),
  b('ca-res-8', 'Calle del Campo 13', 'res-modern', [17, 26, 8, 8], 'n', 20),
  b('ca-res-9', 'Calle del Campo 17', 'res-brick', [25, 26, 8, 8], 'n', 28),
  b('ca-res-10', 'Calle del Campo 21', 'res-plaster', [33, 26, 8, 8], 'n', 36),
  b('ca-res-11', 'Calle del Campo 25', 'res-modern', [41, 26, 7, 8], 'n', 44),
];

const at = (kind: PropKind, tx: number, ty: number): PropPlacement => ({ kind, tx, ty });
const many = (kind: PropKind, cells: readonly (readonly [number, number])[]): PropPlacement[] => cells.map(([x, y]) => at(kind, x, y));

const PROPS: readonly PropPlacement[] = [
  // Delante de la boca de metro: el plano del barrio. El tablón, en la acera central, fuera del paso.
  at('metro-totem', 47, 9),
  at('notice-board', 40, 14),
  ...many('tree', [[42, 2], [44, 2], [46, 2], [22, 1], [30, 1]]),
  // Las aceras: farolas contra la calle, bici aparcada junto al café y papeleras.
  ...many('street-lamp', [[6, 9], [14, 9], [28, 9], [36, 9], [8, 25], [30, 25], [40, 25]]),
  at('bike-rack', 19, 9),
  ...many('bin', [[26, 9], [34, 14]]),
  at('vending', 25, 14),
  // El parque: árboles en los bordes, bancos mirando a la plaza y parterres.
  ...many('tree', [[3, 18], [8, 21], [4, 22], [12, 17], [36, 17], [40, 20], [44, 18], [38, 22], [45, 22]]),
  ...many('bench', [[17, 17], [20, 17], [27, 17], [30, 17], [17, 22], [30, 22]]),
  // Los parterres, a dos tiles del camino del parque (x 23): el carrito del operario de limpieza cabe al pasar.
  ...many('flower-bed', [[25, 18], [25, 21]]),
  ...many('planter-box', [[10, 14], [36, 14]]),
];

const p = (tx: number, ty: number, kind: PointDef['kind'], facing?: PointDef['facing']): PointDef => ({ tx, ty, kind, facing });
const pad = (x: number): string => String(x).padStart(2, '0');

/** Puertas de la acera norte (nodo en la fila 10) y de la sur (nodo en la fila 24). */
const NORTH = [3, 11, 17, 23, 32, 38, 44] as const;
const SOUTH = [3, 12, 20, 23, 28, 36, 44] as const;
const MID = [12, 23, 38] as const;

const POINTS: Record<string, PointDef> = {
  EDGE_CA_NW: p(0, 10, 'edge'), EDGE_CA_NE: p(W - 1, 10, 'edge'),
  EDGE_CA_MW: p(0, 15, 'edge'), EDGE_CA_ME: p(W - 1, 15, 'edge'),
  EDGE_CA_SW: p(0, 24, 'edge'), EDGE_CA_SE: p(W - 1, 24, 'edge'),
  ...Object.fromEntries(NORTH.map((x) => [`ca-n${pad(x)}`, p(x, 10, 'path')])),
  ...Object.fromEntries(MID.map((x) => [`ca-m${pad(x)}`, p(x, 15, 'path')])),
  ...Object.fromEntries(SOUTH.map((x) => [`ca-s${pad(x)}`, p(x, 24, 'path')])),
  // Por el parque, de la acera central a la sur.
  'ca-park': p(23, 20, 'path'),
  // Quien se queda un rato en la plaza, junto a los bancos.
  CA_PARK_01: p(18, 19, 'meet', 'right'), CA_PARK_02: p(19, 19, 'meet', 'left'),
  CA_PARK_03: p(28, 19, 'meet', 'right'), CA_PARK_04: p(29, 19, 'meet', 'left'),
  // Quien espera a alguien a la boca de metro.
  CA_METRO_WAIT_01: p(41, 9, 'wait', 'right'),
};

type Link = readonly [string, string];
const chain = (...ids: string[]): Link[] => ids.slice(1).map((id, i) => [ids[i], id] as const);

const LINKS: readonly Link[] = [
  ...chain('EDGE_CA_NW', ...NORTH.map((x) => `ca-n${pad(x)}`), 'EDGE_CA_NE'),
  ...chain('EDGE_CA_MW', ...MID.map((x) => `ca-m${pad(x)}`), 'EDGE_CA_ME'),
  ...chain('EDGE_CA_SW', ...SOUTH.map((x) => `ca-s${pad(x)}`), 'EDGE_CA_SE'),
  // El paso de cebra y la bajada por el parque.
  ['ca-n23', 'ca-m23'], ['ca-m23', 'ca-park'], ['ca-park', 'ca-s23'],
  ['CA_RES_1_ENTRANCE', 'ca-n03'], ['CA_RES_2_ENTRANCE', 'ca-n11'], ['CA_RES_3_ENTRANCE', 'ca-n23'],
  ['CA_CAFE_ENTRANCE', 'ca-n17'], ['CA_METRO_ENTRANCE', 'ca-n44'],
  ['CA_PARK_01', 'ca-park'], ['CA_PARK_02', 'ca-park'], ['CA_PARK_03', 'ca-park'], ['CA_PARK_04', 'ca-park'],
  ['CA_METRO_WAIT_01', 'ca-n44'],
];

export const CAMPO_ALTO: LocationDef = {
  id: 'campo-alto',
  name: 'Campo Alto',
  kind: 'exterior',
  ground: GROUND,
  buildings: BUILDINGS,
  props: PROPS,
  portals: [],
  npcs: [],
  spawns: {},
  points: POINTS,
  links: LINKS,
  // Identidad visual (data/districts.ts): calma de barrio; el café en zona de comercio y la boca en la de tránsito.
  district: 'residential',
  zones: [
    { profile: 'commercial', tx: 14, ty: 0, w: 8, h: 10 },
    { profile: 'transit', tx: 41, ty: 0, w: 7, h: 12 },
  ],
  traffic: {
    lanes: [{ row: 11, dir: -1 }, { row: 13, dir: 1 }],
    road: 'residential',
    perLane: 1,
    hourly: [[0, 7, 0], [7, 21, 1], [21, 24, 0]],
  },
  inspects: [
    { tx: 47, ty: 9, name: 'Plano del barrio', lines: ['Campo Alto: la Calle del Campo, el parque y el Café Campo Alto. Línea 2 hacia Arena, Puerta Central y Vallesco.'] },
    { tx: 40, ty: 14, name: 'Tablón', lines: ['Un cartel de papel: «Se busca portero para el sábado, en el parque». Sin teléfono, sólo un nombre: Lucho.'] },
  ],
  terminals: [
    { tx: 25, ty: 14, name: 'Máquina de bebidas', catalog: 'vending' },
  ],
  areas: [
    { name: 'Calle del Campo', tx: 24, ty: 12 },
    { name: 'Parque', tx: 24, ty: 20 },
  ],
};
