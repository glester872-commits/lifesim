import type { BuildingDef, LocationDef, PointDef, PropKind, PropPlacement } from '../types/game.ts';

/**
 * Ribera Norte: el barrio del canal. Mismo mapa de 40 × 30 de siempre (el
 * metro en medio, la calle de la ribera y el agua al sur), pero con otra
 * identidad: RIBERA + OCIO + DEPORTE + VIVIENDA MODERNA.
 *
 *   norte   bloques de vivienda moderna con comercio en la planta baja: el bar, el
 *           salón recreativo, un colmado y la tienda de deportes
 *   y 9–14  la calle de la ribera, peatonal, con las terrazas del bar, del Café del Río
 *           y de Casa Mar
 *   y 15–19 la plaza del metro (con el quiosco de helados), la pista de baloncesto y
 *           la zona de calistenia
 *   y 20–21 el carril bici, de punta a punta, con tres pasos de peatones
 *   y 22–24 el paseo de la Ribera: granito, farolas, árboles, bancos mirando al agua
 *           y la zona de skate al oeste
 *   y 25    el pretil, y debajo el canal
 *
 * Los puntos (RB_*, rb-*) son los de siempre: sitios con nombre y un grafo de
 * peatones por el que va la gente (data/streets.ts, perfil 'ribera'). Nada está
 * puesto a mano en coordenadas: quien pasea, corre, saca al perro, se sienta al
 * borde del agua, juega a la pista o echa unas partidas va a un punto.
 */
const W = 40;
const H = 30;

/** [carácter, x, y, ancho, alto]. Leyenda en data/locations.ts. */
type Paint = readonly [string, number, number, number, number];

function paint(fill: string, rects: readonly Paint[]): string[] {
  const grid = Array.from({ length: H }, () => Array<string>(W).fill(fill));
  for (const [ch, x, y, w, h] of rects) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[yy][xx] = ch;
  }
  return grid.map((row) => row.join(''));
}

const GROUND = paint('g', [
  ['a', 0, 26, W, 4], // el canal
  ['q', 1, 25, 38, 1], // el pretil, con su barandilla (world/TextureFactory)
  ['P', 1, 22, 38, 3], // el paseo de la Ribera: granito
  ['b', 0, 20, W, 2], // el carril bici, uno por sentido, de punta a punta
  ['c', 1, 15, 38, 5], // la plaza: adoquín
  ['P', 15, 15, 10, 5], // la plaza del metro: granito
  ['k', 26, 15, 8, 5], // la pista de baloncesto
  ['m', 34, 15, 4, 5], // la zona de calistenia: caucho
  [',', 1, 9, 38, 2], // acera norte
  ['c', 1, 11, 38, 3], // la calle de la ribera, peatonal
  [',', 1, 14, 38, 1], // acera sur
  ['z', 9, 20, 1, 2], ['z', 19, 20, 2, 2], ['z', 25, 20, 1, 2], // tres pasos de peatones sobre el carril bici
  ['M', 18, 15, 3, 3], // la boca del metro
  ['D', 19, 17, 1, 1],
]);

const b = (
  id: string,
  name: string,
  style: BuildingDef['style'],
  [tx, ty, w, h]: readonly [number, number, number, number],
  front: BuildingDef['front'],
  doorX?: number,
  extra: Partial<BuildingDef> = {},
): BuildingDef => ({ id, name, style, tx, ty, w, h, front, doorX, ...extra });

const into = (location: string): BuildingDef['enter'] => ({ location, spawn: 'entry' });

const BUILDINGS: readonly BuildingDef[] = [
  // Norte: tres plantas de vivienda moderna con balcones corridos, y comercio abajo.
  b('ribera-res-1', 'Ribera 1', 'res-modern', [1, 2, 6, 7], 's', 3, { floors: 3, point: 'RB_RES_1_ENTRANCE' }),
  // El bar de siempre: su puerta y su interior no se mueven.
  b('bar-door', 'Bar Ribera', 'bar', [7, 2, 6, 7], 's', 8, { floors: 2, enter: into('bar'), point: 'RB_BAR_ENTRANCE' }),
  b('ribera-arcade', 'Salón Recreativo Nova', 'arcade', [13, 2, 6, 7], 's', 15, { floors: 2, enter: into('arcade'), point: 'RB_ARCADE_ENTRANCE' }),
  b('ribera-colmado', 'Colmado Ribera', 'super', [22, 2, 5, 7], 's', 24, { floors: 2, enter: into('colmado'), point: 'RB_COLMADO_ENTRANCE' }),
  b('ribera-sports', 'Ribera Sport', 'sports', [27, 2, 5, 7], 's', 29, { floors: 2, enter: into('ribera-sport'), point: 'RB_SPORTS_ENTRANCE' }),
  b('ribera-res-2', 'Ribera 2', 'res-modern', [32, 2, 7, 7], 's', 35, { floors: 3, point: 'RB_RES_2_ENTRANCE' }),
  // Sur de la calle: dos locales con la terraza delante y su espalda al carril bici.
  b('ribera-cafe', 'Café del Río', 'cafe', [1, 15, 8, 5], 'n', 5, { enter: into('cafe-rio'), point: 'RB_CAFE_ENTRANCE' }),
  b('ribera-casamar', 'Casa Mar', 'restaurant', [10, 15, 6, 5], 'n', 12, { enter: into('casa-mar'), point: 'RB_CASAMAR_ENTRANCE' }),
];

const at = (kind: PropKind, tx: number, ty: number): PropPlacement => ({ kind, tx, ty });
const many = (kind: PropKind, cells: readonly (readonly [number, number])[]): PropPlacement[] => cells.map(([x, y]) => at(kind, x, y));

/** Bancos del paseo (mirando al agua), y dónde se apoya quien se queda mirando el canal. */
const BENCH_XS = [14, 15, 20, 21, 27, 28, 32, 33, 37, 38] as const;
const VIEW_XS = [17, 24, 30, 35] as const;

const PROPS: readonly PropPlacement[] = [
  // Árboles y matorral del callejón entre los dos bloques y de los bordes.
  ...many('tree', [[1, 1], [20, 1], [38, 1], [20, 3], [20, 6]]),
  ...many('bush', [[19, 7], [21, 4]]),
  // Terrazas (mesa y silla enfrentadas: el asiento mira a la mesa). Bar, al norte; Café del Río y Casa Mar, al sur.
  at('cafe-table', 6, 11), at('chair-down', 6, 10),
  at('cafe-table', 10, 11), at('chair-down', 10, 10),
  at('cafe-table', 3, 12), at('chair-up', 3, 13),
  at('cafe-table', 7, 12), at('chair-up', 7, 13),
  at('cafe-table', 11, 12), at('chair-up', 11, 13),
  at('cafe-table', 14, 12), at('chair-up', 14, 13),
  // Farolas de la calle y del paseo, y la máquina de bebidas del colmado.
  ...many('street-lamp-art', [[4, 10], [17, 10], [28, 10], [37, 10], [12, 22], [23, 22], [34, 22]]),
  at('vending', 23, 10),
  ...many('planter', [[2, 10], [33, 10], [1, 12], [38, 12]]),
  // La plaza del metro: el quiosco de helados y árboles alrededor.
  at('ice-cream-kiosk', 22, 17),
  ...many('tree', [[15, 16], [25, 16], [17, 18]]),
  // La pista: dos canastas en la línea de arriba.
  at('hoop', 28, 16), at('hoop', 31, 16),
  // La zona de calistenia: dos barras de dominadas.
  at('pullup-bar', 34, 17), at('pullup-bar', 36, 17),
  // El paseo: árboles al norte, bancos al sur mirando al agua, y la zona de skate al oeste.
  ...many('tree', [[16, 22], [29, 22], [37, 22]]),
  ...BENCH_XS.map((x) => at('bench', x, 24)),
  at('skate-ramp', 2, 24), at('skate-box', 5, 24), at('skate-ramp', 8, 24),
  ...many('planter-box', [[11, 22], [26, 22]]),
];

// ---------------------------------------------------------------- puntos

const p = (tx: number, ty: number, kind: PointDef['kind'], facing?: PointDef['facing']): PointDef => ({ tx, ty, kind, facing });
const use = (tx: number, ty: number, station: NonNullable<PointDef['use']>, facing: PointDef['facing']): PointDef => ({ tx, ty, kind: 'interact', facing, use: station });
const two = (i: number): string => String(i + 1).padStart(2, '0');
const pad = (x: number): string => String(x).padStart(2, '0');

/** Nodos del paseo, de oeste a este (también los de los bancos, los miradores y los tres pasos de peatones). */
const PROMENADE_XS = [2, 5, 9, 12, 14, 15, 17, 19, 20, 21, 24, 25, 27, 28, 30, 32, 33, 35, 37, 38] as const;

const POINTS: Record<string, PointDef> = {
  // Los bordes del mapa: de donde llega y a donde se va el resto de la ciudad.
  EDGE_RIBERA_NW: p(0, 9, 'edge'), EDGE_RIBERA_NE: p(W - 1, 9, 'edge'),
  EDGE_RIBERA_SW: p(0, 14, 'edge'), EDGE_RIBERA_SE: p(W - 1, 14, 'edge'),
  EDGE_RIBERA_PW: p(0, 23, 'edge'), EDGE_RIBERA_PE: p(W - 1, 23, 'edge'),

  // Terrazas: cada asiento, delante de su mesa.
  RB_BAR_TERRACE_01: p(6, 10, 'seat', 'down'), RB_BAR_TERRACE_02: p(10, 10, 'seat', 'down'),
  RB_CAFE_TERRACE_01: p(3, 13, 'seat', 'up'), RB_CAFE_TERRACE_02: p(7, 13, 'seat', 'up'),
  RB_CASAMAR_TERRACE_01: p(11, 13, 'seat', 'up'), RB_CASAMAR_TERRACE_02: p(14, 13, 'seat', 'up'),

  // La plaza: delante del metro y del quiosco de helados.
  RB_METRO_FRONT: p(19, 18, 'wait', 'up'),
  RB_ICE_CREAM_01: p(22, 18, 'wait', 'up'), RB_ICE_CREAM_02: p(23, 18, 'wait', 'up'),

  // La pista: dos tiradores por canasta y dos sitios para esperar el turno mirando.
  HOOPS_01: use(28, 17, 'hoops', 'up'), HOOPS_02: use(27, 18, 'hoops', 'up'),
  HOOPS_03: use(31, 17, 'hoops', 'up'), HOOPS_04: use(32, 18, 'hoops', 'up'),
  RB_COURT_REST_01: p(26, 19, 'wait', 'up'), RB_COURT_REST_02: p(33, 19, 'wait', 'up'),
  // Los tiros libres, sólo del jugador (data/courts.ts): la gente de la pista usa los HOOPS_*.
  RB_COURT_FT_01: p(28, 19, 'interact', 'up'), RB_COURT_FT_02: p(31, 19, 'interact', 'up'),
  // La calistenia: cuatro puestos en las barras y dos esterillas para estirar.
  ...Object.fromEntries([34, 35, 36, 37].map((x, i) => [`PULLUP_${two(i)}`, use(x, 18, 'pullup', 'up')])),
  CALI_MAT_01: use(34, 19, 'stretch', 'down'), CALI_MAT_02: use(36, 19, 'stretch', 'down'),

  // El paseo: bancos (mirando al canal), miradores en la barandilla y la zona de skate.
  ...Object.fromEntries(BENCH_XS.map((x, i) => [`RB_BENCH_${two(i)}`, p(x, 24, 'seat', 'down')])),
  ...Object.fromEntries(VIEW_XS.map((x, i) => [`RB_VIEW_${two(i)}`, p(x, 24, 'meet', 'down')])),
  RB_SKATE_WATCH_01: p(11, 24, 'meet', 'left'), RB_SKATE_WATCH_02: p(12, 24, 'meet', 'left'),

  // Nodos de paso del grafo.
  'rb-n10': p(10, 9, 'path'), 'rb-n06': p(6, 9, 'path'), 'rb-n16': p(16, 9, 'path'), 'rb-n20': p(20, 9, 'path'), 'rb-n30': p(30, 9, 'path'),
  'rb-m16': p(16, 12, 'path'), 'rb-m30': p(30, 12, 'path'),
  'rb-s03': p(3, 14, 'path'), 'rb-s07': p(7, 14, 'path'), 'rb-s09': p(9, 14, 'path'), 'rb-s11': p(11, 14, 'path'), 'rb-s14': p(14, 14, 'path'),
  'rb-s16': p(16, 14, 'path'), 'rb-s24': p(24, 14, 'path'), 'rb-s30': p(30, 14, 'path'), 'rb-s38': p(38, 14, 'path'),
  'rb-pl-w': p(16, 19, 'path'), 'rb-pl-s': p(19, 19, 'path'), 'rb-pl-e': p(24, 19, 'path'), 'rb-p25': p(25, 19, 'path'),
  'rb-ct': p(30, 19, 'path'), 'rb-cali': p(38, 19, 'path'),
  ...Object.fromEntries(PROMENADE_XS.map((x) => [`rb-pr${pad(x)}`, p(x, 23, 'path')])),
};

type Link = readonly [string, string];
const chain = (...ids: string[]): Link[] => ids.slice(1).map((id, i) => [ids[i], id] as const);

const LINKS: readonly Link[] = [
  // Acera norte, de oeste a este, con cada puerta en su sitio.
  ...chain('EDGE_RIBERA_NW', 'RB_RES_1_ENTRANCE', 'rb-n06', 'RB_BAR_ENTRANCE', 'rb-n10', 'RB_ARCADE_ENTRANCE', 'rb-n16', 'rb-n20',
    'RB_COLMADO_ENTRANCE', 'RB_SPORTS_ENTRANCE', 'rb-n30', 'RB_RES_2_ENTRANCE', 'EDGE_RIBERA_NE'),
  ['RB_BAR_TERRACE_01', 'rb-n06'], ['RB_BAR_TERRACE_02', 'rb-n10'],
  // Acera sur.
  ...chain('EDGE_RIBERA_SW', 'rb-s03', 'RB_CAFE_ENTRANCE', 'rb-s07', 'rb-s09', 'rb-s11', 'RB_CASAMAR_ENTRANCE', 'rb-s14', 'rb-s16',
    'rb-s24', 'rb-s30', 'rb-s38', 'EDGE_RIBERA_SE'),
  ['RB_CAFE_TERRACE_01', 'rb-s03'], ['RB_CAFE_TERRACE_02', 'rb-s07'],
  ['RB_CASAMAR_TERRACE_01', 'rb-s11'], ['RB_CASAMAR_TERRACE_02', 'rb-s14'],
  // La calle se cruza por dos sitios.
  ...chain('rb-n16', 'rb-m16', 'rb-s16'), ...chain('rb-n30', 'rb-m30', 'rb-s30'),

  // La plaza: del metro al quiosco, la pista y la calistenia, siempre por la línea de abajo.
  ...chain('rb-s16', 'rb-pl-w', 'rb-pl-s', 'rb-pl-e', 'rb-p25', 'RB_COURT_REST_01', 'rb-ct', 'RB_COURT_REST_02', 'CALI_MAT_01', 'CALI_MAT_02', 'rb-cali'),
  ['RB_METRO_FRONT', 'rb-pl-s'], ['rb-s24', 'rb-pl-e'],
  ['RB_ICE_CREAM_01', 'rb-pl-e'], ['RB_ICE_CREAM_02', 'rb-pl-e'],
  ['RB_COURT_FT_01', 'rb-ct'], ['RB_COURT_FT_02', 'rb-ct'],
  ['HOOPS_01', 'rb-ct'], ['HOOPS_02', 'RB_COURT_REST_01'], ['HOOPS_03', 'rb-ct'], ['HOOPS_04', 'RB_COURT_REST_02'],
  ['rb-s30', 'rb-ct'], ['rb-s38', 'rb-cali'],
  ...chain('PULLUP_01', 'PULLUP_02', 'PULLUP_03', 'PULLUP_04', 'rb-cali'),

  // Del callejón de en medio, del metro y del paseo a la plaza: se cruza el carril bici por los pasos.
  ['rb-s09', 'rb-pr09'], ['rb-pl-s', 'rb-pr19'], ['rb-p25', 'rb-pr25'],

  // El paseo de la Ribera, de punta a punta; cada banco y cada mirador, enganchado a su nodo.
  ...chain('EDGE_RIBERA_PW', ...PROMENADE_XS.map((x) => `rb-pr${pad(x)}`), 'EDGE_RIBERA_PE'),
  ...BENCH_XS.map((x, i): Link => [`RB_BENCH_${two(i)}`, `rb-pr${pad(x)}`]),
  ...VIEW_XS.map((x, i): Link => [`RB_VIEW_${two(i)}`, `rb-pr${pad(x)}`]),
  ['RB_SKATE_WATCH_01', 'rb-pr12'], ['RB_SKATE_WATCH_02', 'rb-pr12'],
];

export const RIBERA: LocationDef = {
  id: 'ribera',
  name: 'Ribera Norte',
  kind: 'exterior',
  ground: GROUND,
  buildings: BUILDINGS,
  props: PROPS,
  portals: [
    // La boca del metro, la de siempre (el tile 'D' de la plaza).
    { id: 'metro-door', tx: 19, ty: 17, label: 'Metro · Ribera Norte', to: { location: 'ribera-station', spawn: 'entry' } },
  ],
  npcs: [
    { id: 'olmo', tx: 21, ty: 16, facing: 'down' },
    { id: 'sira', tx: 31, ty: 22, facing: 'down' },
  ],
  spawns: {
    'metro-door': { tx: 19, ty: 18, facing: 'down' },
  },
  points: POINTS,
  links: LINKS,
  // Identidad visual (data/districts.ts): ribera para todo el mapa, y el metro con su acero y su granito.
  district: 'riverside',
  zones: [{ profile: 'transit', tx: 16, ty: 15, w: 8, h: 5 }],
  // Bicis: el carril de arriba hacia el oeste y el de abajo hacia el este, de punta a punta; sin coches. Más gente por la tarde.
  traffic: {
    lanes: [],
    road: 'residential',
    perLane: 0,
    bikes: {
      lanes: [{ row: 20, dir: -1 }, { row: 21, dir: 1 }],
      road: 'residential',
      perLane: 2,
      hourly: [[0, 6, 0], [6, 8, 1], [8, 17, 2], [17, 22, 3], [22, 24, 1]],
      rainShy: 0.75,
    },
  },
  // La zona de skate: tres patinadores dan vueltas por la franja de arriba del paseo, junto a las rampas.
  skate: { tx0: 2, tx1: 10, row: 22, riders: 3 },
  inspects: [
    { tx: 12, ty: 24, name: 'El canal', lines: ['Agua verde y quieta. Un pato cruza sin ninguna prisa. Al fondo, el otro lado, que parece más tranquilo que este.'] },
    { tx: 7, ty: 23, name: 'Zona de skate', lines: ['Un cartel atornillado a la rampa: «Casco y rodilleras. Se respeta el turno». Debajo, pegatinas de media ciudad.'] },
    { tx: 33, ty: 18, name: 'Normas de la pista', lines: ['«Pista de uso libre. Balón propio. Después de las diez, sin botar». Alguien ha añadido: «ni de broma».'] },
    { tx: 38, ty: 18, name: 'Calistenia', lines: ['Barras de dominadas y fondos. Un dibujo con la progresión: del principiante al que se cuelga una hora.'] },
    { tx: 21, ty: 18, name: 'Pizarra de helados', lines: ['Fresa, limón, nata y el de la casa. Cucurucho, tarrina o polo. Pagar en efectivo, que la tarjeta no pilla.'] },
  ],
  terminals: [
    { tx: 23, ty: 10, name: 'Máquina de bebidas', catalog: 'vending' },
    { tx: 22, ty: 18, name: 'Heladería del Muelle', catalog: 'ice-cream-kiosk' },
  ],
  // Nombres para el mapa (tecla M).
  areas: [
    { name: 'Calle de la Ribera', tx: 20, ty: 12 },
    { name: 'Plaza del Metro', tx: 20, ty: 19 },
    { name: 'Pista y calistenia', tx: 31, ty: 18 },
    { name: 'Paseo de la Ribera', tx: 20, ty: 23 },
    { name: 'Zona de skate', tx: 6, ty: 23 },
  ],
};
