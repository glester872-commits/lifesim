import type { BuildingDef, LocationDef, PointDef, PropKind, PropPlacement } from '../types/game.ts';
import { dress } from '../systems/Dressing.ts';

/**
 * Velaria: LUJO + MODA + NEGOCIOS + VIDA PREMIUM. Inspirado en el centro rico de Madrid, sin copiar ninguna calle:
 * piedra clara, cristal limpio, latón, árboles y aceras anchas; poco ruido, mucho taxi y la gente mejor vestida de la
 * ciudad (que no la única: aquí también trabajan dependientas, camareros, porteros, repartidores y limpieza).
 *
 *   y 0     el callejón de servicio de atrás
 *   y 1–7   la acera norte de la Avenida Dorada: joyería, piel y calzado, Maison Ferrant, el Gran Hotel Velaria, el
 *           Mercado Dorado (gourmet), Kaizen (sushi premium), un portal noble y el Salón Lis (peluquería)
 *   y 8–10  acera norte, de tres filas: escaparates contra la fachada, el paseo en medio y, en el bordillo, plátanos,
 *           farolas de forja y la parada de taxis del hotel
 *   y 11–15 la Avenida Dorada: carril taxi-VTC y un carril hacia el oeste; dos hacia el este y carril bici. Dos pasos
 *           con semáforo. Tráfico controlado: menos coches que en Cuatro Ríos, más berlinas, taxis y VTC
 *   y 16–17 acera sur
 *   y 18–25 al sur de la avenida: un portal, Alma (cocina de autor) y la galería; la PLAZA AURELIA (granito, fuente,
 *           bancos, parterres, la terraza del Café Aurelia y la boca del metro); el gimnasio y la clínica estética
 *   y 26–30 la CALLE MARQUÉS: acera, un carril tranquilo hacia el oeste, el bordillo de aparcar y la acera de los portales
 *   y 31–37 portales de la Calle Marqués (sillería, balcones de forja) y la Vinoteca Marqués
 *
 * Los puntos (VL_*, vl-*) siguen el idioma de siempre (data/streets.ts, perfil 'velaria'). Lo pequeño (jardineras,
 * bolardos, contenedores, coches aparcados) lo pone systems/Dressing con el kit del perfil 'premium' (data/districts.ts).
 */
const W = 48;
const H = 38;

type Paint = readonly [string, number, number, number, number];

function paint(fill: string, rects: readonly Paint[]): string[] {
  const grid = Array.from({ length: H }, () => Array<string>(W).fill(fill));
  for (const [ch, x, y, w, h] of rects) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[yy][xx] = ch;
  }
  return grid.map((row) => row.join(''));
}

const GROUND = paint('g', [
  ['c', 0, 0, W, 1], // callejón de servicio
  [',', 0, 8, W, 3], // acera norte, ancha
  // La Avenida Dorada: carril taxi-VTC y carril hacia el oeste; dos carriles y carril bici hacia el este.
  ['u', 0, 11, W, 1],
  ['.', 0, 12, W, 1],
  ['l', 0, 13, W, 1],
  ['.', 0, 14, W, 1],
  ['b', 0, 15, W, 1],
  ['z', 8, 11, 3, 5], ['z', 31, 11, 3, 5], // los dos pasos, con semáforo
  [',', 0, 16, W, 2], // acera sur
  // Plaza Aurelia: granito, y la franja podotáctil delante de la boca del metro.
  ['P', 18, 18, 18, 8],
  ['T', 31, 22, 3, 1],
  // Bajo el café y la boca del metro, el relleno de siempre: su puerta no es acera para el kit de systems/Dressing.
  ['g', 18, 18, 5, 4], ['g', 30, 18, 5, 4],
  // Calle Marqués: acera, carril hacia el oeste y bordillo de aparcar, acera de los portales (dos filas).
  [',', 0, 26, W, 1],
  ['.', 0, 27, W, 2],
  ['z', 20, 27, 2, 2], ['z', 40, 27, 2, 2],
  [',', 0, 29, W, 2],
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

const into = (location: string): BuildingDef['enter'] => ({ location, spawn: 'entry' });

const BUILDINGS: readonly BuildingDef[] = [
  // Avenida Dorada, acera norte: tres plantas de piedra con el comercio abajo.
  b('vl-oriol', 'Oriol · joyería y relojería', 'jewel', [0, 1, 5, 7], 's', 2, { floors: 3, enter: into('vl-oriol'), point: 'VL_ORIOL_ENTRANCE' }),
  b('vl-brisa', 'Atelier Brisa · piel y calzado', 'boutique', [5, 1, 5, 7], 's', 7, { floors: 3, enter: into('vl-brisa'), point: 'VL_BRISA_ENTRANCE' }),
  b('vl-ferrant', 'Maison Ferrant', 'boutique', [10, 1, 6, 7], 's', 13, { floors: 3, enter: into('vl-ferrant'), point: 'VL_FERRANT_ENTRANCE' }),
  b('vl-hotel', 'Gran Hotel Velaria', 'hotel', [16, 1, 10, 7], 's', 21, { floors: 3, enter: into('vl-hotel'), point: 'VL_HOTEL_ENTRANCE' }),
  b('vl-gourmet', 'Mercado Dorado', 'gourmet', [26, 1, 7, 7], 's', 29, { floors: 3, enter: into('vl-gourmet'), point: 'VL_GOURMET_ENTRANCE' }),
  b('kaizen-door', 'Kaizen', 'fine', [33, 1, 6, 7], 's', 35, { floors: 3, enter: into('kaizen'), point: 'VL_KAIZEN_ENTRANCE' }),
  b('vl-dorada-14', 'Avenida Dorada 14', 'res-noble', [39, 1, 4, 7], 's', 40, { floors: 3, point: 'VL_DORADA_14_ENTRANCE' }),
  b('vl-lis', 'Salón Lis', 'salon', [43, 1, 5, 7], 's', 45, { floors: 3, enter: into('vl-lis'), point: 'VL_LIS_ENTRANCE' }),
  // Al sur de la avenida, con la fachada a ella: un portal, la cocina de autor y la galería, junto a la plaza.
  b('vl-dorada-1', 'Avenida Dorada 1', 'res-noble', [0, 18, 6, 8], 'n', 3, { point: 'VL_DORADA_1_ENTRANCE' }),
  b('vl-alma', 'Alma · cocina de autor', 'fine', [6, 18, 6, 8], 'n', 9, { enter: into('vl-alma'), point: 'VL_ALMA_ENTRANCE' }),
  b('vl-galeria', 'Galería Aurelia', 'gallery', [12, 18, 6, 8], 'n', 15, { enter: into('vl-galeria'), point: 'VL_GALERIA_ENTRANCE' }),
  // En la plaza: el café con su terraza y la boca del metro, las dos mirando al sur.
  b('vl-cafe', 'Café Aurelia', 'cafe', [18, 18, 5, 4], 's', 20, { enter: into('vl-cafe'), point: 'VL_CAFE_ENTRANCE' }),
  b('vl-metro', 'Metro · Velaria', 'metro', [30, 18, 5, 4], 's', 32, { enter: into('velaria-station'), point: 'VL_METRO_ENTRANCE' }),
  b('vl-gym', 'Velaria Club · gimnasio', 'gym', [36, 18, 6, 8], 'n', 39, { enter: into('vl-gym'), point: 'VL_GYM_ENTRANCE' }),
  b('vl-clinica', 'Clínica Nácar · medicina estética', 'clinic', [42, 18, 6, 8], 'n', 45, { enter: into('vl-clinica'), point: 'VL_CLINICA_ENTRANCE' }),
  // Calle Marqués: portales nobles, alguno de piedra o revoco, uno nuevo, y la vinoteca en un bajo.
  b('vl-mq-2', 'Calle Marqués 2', 'res-noble', [0, 31, 6, 7], 'n', 3, { point: 'VL_MQ_2_ENTRANCE' }),
  b('vl-mq-4', 'Calle Marqués 4', 'res-stone', [6, 31, 6, 7], 'n', 9, { point: 'VL_MQ_4_ENTRANCE' }),
  b('vl-vinoteca', 'Vinoteca Marqués', 'wine', [12, 31, 6, 7], 'n', 15, { enter: into('vl-vinoteca'), point: 'VL_VINOTECA_ENTRANCE' }),
  b('vl-mq-8', 'Calle Marqués 8', 'res-modern', [18, 31, 6, 7], 'n', 21, { point: 'VL_MQ_8_ENTRANCE' }),
  b('vl-mq-10', 'Calle Marqués 10', 'res-noble', [24, 31, 6, 7], 'n', 27, { point: 'VL_MQ_10_ENTRANCE' }),
  b('vl-mq-12', 'Calle Marqués 12', 'res-stone', [30, 31, 6, 7], 'n', 33, { point: 'VL_MQ_12_ENTRANCE' }),
  b('vl-mq-14', 'Calle Marqués 14', 'res-noble', [36, 31, 6, 7], 'n', 39, { point: 'VL_MQ_14_ENTRANCE' }),
  b('vl-mq-16', 'Calle Marqués 16', 'res-plaster', [42, 31, 6, 7], 'n', 45, { point: 'VL_MQ_16_ENTRANCE' }),
];

const at = (kind: PropKind, tx: number, ty: number): PropPlacement => ({ kind, tx, ty });
const many = (kind: PropKind, cells: readonly (readonly [number, number])[]): PropPlacement[] => cells.map(([x, y]) => at(kind, x, y));

const PROPS: readonly PropPlacement[] = [
  // Bordillo de la avenida: plátanos y farolas de forja alternos, sin tapar ninguna puerta ni la parada de taxis.
  ...many('plane-tree', [[5, 10], [26, 10], [37, 10], [46, 10], [5, 17], [26, 17], [42, 17]]),
  ...many('street-lamp-art', [[1, 10], [17, 10], [25, 10], [42, 10], [1, 17], [12, 17], [33, 17]]),
  // Plaza Aurelia: la fuente en el centro, bancos a sus dos lados, parterres de flores y los árboles de la esquina.
  at('fountain', 25, 21),
  ...many('bench', [[25, 19], [27, 19]]),
  ...many('bench-up', [[25, 23], [27, 23]]),
  at('flower-bed', 28, 19),
  at('metro-totem', 29, 20),
  // La terraza del Café Aurelia, al sol de la tarde: dos mesas con su silla y la sombrilla entre ellas.
  ...many('cafe-table', [[18, 24], [21, 24]]),
  ...many('chair-down', [[18, 23], [21, 23]]),
  at('parasol', 19, 24),
  // Calle Marqués: más árboles que farolas, contra las fachadas (el paseo va por la fila de delante).
  ...many('plane-tree', [[7, 30], [31, 30], [46, 30]]),
  ...many('street-lamp-art', [[1, 30], [24, 30], [36, 30]]),
];

// ---------------------------------------------------------------- puntos

const p = (tx: number, ty: number, kind: PointDef['kind'], facing?: PointDef['facing']): PointDef => ({ tx, ty, kind, facing });
const pad = (x: number): string => String(x).padStart(2, '0');

/** Puertas de cada acera: su nodo de paso justo delante, en la fila por la que se camina. */
const NORTH_DOORS = [2, 7, 13, 21, 29, 35, 40, 45] as const;
const SOUTH_DOORS = [3, 15, 39, 45] as const;
const MARQUES_DOORS = [3, 9, 15, 21, 27, 33, 39, 45] as const;

const POINTS: Record<string, PointDef> = {
  // Los bordes: el resto de la ciudad, por las dos aceras de la avenida y las dos de la Calle Marqués.
  EDGE_VL_NW: p(0, 9, 'edge'), EDGE_VL_NE: p(W - 1, 9, 'edge'),
  EDGE_VL_SW: p(0, 16, 'edge'), EDGE_VL_SE: p(W - 1, 16, 'edge'),
  EDGE_VL_MW: p(0, 26, 'edge'), EDGE_VL_ME: p(W - 1, 26, 'edge'),
  EDGE_VL_RW: p(0, 29, 'edge'), EDGE_VL_RE: p(W - 1, 29, 'edge'),

  // Escaparates: pegado al cristal.
  VL_ORIOL_WINDOW: p(4, 8, 'meet', 'up'),
  VL_BRISA_WINDOW: p(9, 8, 'meet', 'up'),
  VL_FERRANT_WINDOW_01: p(11, 8, 'meet', 'up'), VL_FERRANT_WINDOW_02: p(15, 8, 'meet', 'up'),
  VL_GOURMET_WINDOW: p(27, 8, 'meet', 'up'),
  VL_GALERIA_WINDOW: p(13, 17, 'meet', 'down'),
  // El hotel: los dos porteros a los lados de la puerta y la parada de taxis en el bordillo.
  VL_HOTEL_DOOR_01: p(20, 8, 'wait', 'down'), VL_HOTEL_DOOR_02: p(22, 8, 'wait', 'down'),
  VL_TAXI_01: p(19, 10, 'wait', 'down'), VL_TAXI_02: p(23, 10, 'wait', 'down'),
  // Los porteros de las fincas nobles, junto a su portal.
  VL_DOORMAN_01: p(41, 8, 'wait', 'down'),
  VL_DOORMAN_02: p(4, 17, 'wait', 'up'),
  VL_DOORMAN_03: p(4, 30, 'wait', 'up'),
  VL_DOORMAN_04: p(28, 30, 'wait', 'up'),
  VL_DOORMAN_05: p(40, 30, 'wait', 'up'),
  // Plaza Aurelia: los cuatro bancos alrededor de la fuente y la terraza del café.
  VL_PLAZA_BENCH_01: p(25, 19, 'seat', 'down'), VL_PLAZA_BENCH_02: p(27, 19, 'seat', 'down'),
  VL_PLAZA_BENCH_03: p(25, 23, 'seat', 'up'), VL_PLAZA_BENCH_04: p(27, 23, 'seat', 'up'),
  VL_CAFE_TERRACE_01: p(18, 23, 'seat', 'down'), VL_CAFE_TERRACE_02: p(21, 23, 'seat', 'down'),
  VL_CAFE_TERRACE_WAITER: p(20, 23, 'work', 'down'),
  // Quien queda en la plaza o sale del metro y espera a alguien.
  VL_PLAZA_MEET_01: p(29, 22, 'meet', 'left'), VL_PLAZA_MEET_02: p(24, 21, 'meet', 'right'),
  VL_METRO_MEET_01: p(35, 22, 'wait', 'left'), VL_METRO_MEET_02: p(30, 23, 'wait', 'up'),

  // Eventos (data/popups.ts): cada uno con su gente en su sitio.
  // Inauguración en la galería: copa en mano en la acera, delante de la puerta.
  ...Object.fromEntries([12, 13, 14, 16, 17].map((x, i) => [`VL_OPENING_${pad(i + 1)}`, p(x, 16, 'meet', i % 2 ? 'left' : 'right')])),
  // Pop-up de moda: delante de la carpa y del puesto, al fondo de la plaza.
  ...Object.fromEntries([29, 30, 31, 33, 34].map((x, i) => [`VL_POPUP_${pad(i + 1)}`, p(x, 24, 'meet', 'down')])),
  // Lanzamiento en Maison Ferrant: la cola en el bordillo, con la alfombra delante de la puerta.
  ...Object.fromEntries([10, 11, 12, 14, 15].map((x, i) => [`VL_LAUNCH_${pad(i + 1)}`, p(x, 10, 'wait', 'up')])),
  // Evento del hotel: invitados en la acera a los lados de la alfombra.
  ...Object.fromEntries([[17, 8], [18, 8], [24, 8], [25, 9], [18, 10]].map(([x, y], i) => [`VL_HOTEL_EVENT_${pad(i + 1)}`, p(x, y, 'meet', 'down')])),

  // Nodos de paso: la acera norte (fila 9) y la sur (16), uno delante de cada puerta, y los pasos de cebra.
  ...Object.fromEntries(NORTH_DOORS.map((x) => [`vl-n${pad(x)}`, p(x, 9, 'path')])),
  ...Object.fromEntries(SOUTH_DOORS.map((x) => [`vl-s${pad(x)}`, p(x, 16, 'path')])),
  'vl-xw-n': p(9, 9, 'path'), 'vl-xw-s': p(9, 16, 'path'),
  'vl-xe-n': p(32, 9, 'path'), 'vl-xe-s': p(32, 16, 'path'),
  'vl-s19': p(19, 16, 'path'), 'vl-s24': p(24, 16, 'path'), 'vl-s35': p(35, 16, 'path'),
  // La plaza.
  'vl-pl-n': p(24, 18, 'path'), 'vl-pl-c': p(24, 22, 'path'), 'vl-pl-e': p(29, 22, 'path'), 'vl-pl-ne': p(35, 19, 'path'),
  'vl-pl-s': p(24, 25, 'path'), 'vl-pl-se': p(35, 25, 'path'),
  // Calle Marqués: la acera de la plaza (26), la de los portales (29) y sus dos pasos.
  'vl-m20': p(20, 26, 'path'), 'vl-m24': p(24, 26, 'path'), 'vl-m35': p(35, 26, 'path'), 'vl-m40': p(40, 26, 'path'),
  ...Object.fromEntries(MARQUES_DOORS.map((x) => [`vl-r${pad(x)}`, p(x, 29, 'path')])),
  'vl-r20': p(20, 29, 'path'), 'vl-r40': p(40, 29, 'path'),
};

type Link = readonly [string, string];
const chain = (...ids: string[]): Link[] => ids.slice(1).map((id, i) => [ids[i], id] as const);

const LINKS: readonly Link[] = [
  // Acera norte de la avenida, por el centro de la acera; los escaparates y las puertas, a un lado.
  ...chain('EDGE_VL_NW', 'vl-n02', 'vl-n07', 'vl-xw-n', 'vl-n13', 'vl-n21', 'vl-n29', 'vl-xe-n', 'vl-n35', 'vl-n40', 'vl-n45', 'EDGE_VL_NE'),
  ['VL_ORIOL_ENTRANCE', 'vl-n02'], ['VL_BRISA_ENTRANCE', 'vl-n07'], ['VL_FERRANT_ENTRANCE', 'vl-n13'], ['VL_HOTEL_ENTRANCE', 'vl-n21'],
  ['VL_GOURMET_ENTRANCE', 'vl-n29'], ['VL_KAIZEN_ENTRANCE', 'vl-n35'], ['VL_DORADA_14_ENTRANCE', 'vl-n40'], ['VL_LIS_ENTRANCE', 'vl-n45'],
  ['VL_ORIOL_WINDOW', 'vl-n02'], ['VL_BRISA_WINDOW', 'vl-xw-n'], ['VL_FERRANT_WINDOW_01', 'vl-n13'], ['VL_FERRANT_WINDOW_02', 'vl-n13'],
  ['VL_GOURMET_WINDOW', 'vl-n29'],
  ['VL_HOTEL_DOOR_01', 'VL_HOTEL_ENTRANCE'], ['VL_HOTEL_DOOR_02', 'VL_HOTEL_ENTRANCE'],
  ['VL_TAXI_01', 'vl-n21'], ['VL_TAXI_02', 'vl-n21'],
  ['VL_DOORMAN_01', 'VL_DORADA_14_ENTRANCE'],
  ...['VL_LAUNCH_01', 'VL_LAUNCH_02', 'VL_LAUNCH_03', 'VL_LAUNCH_04', 'VL_LAUNCH_05'].map((id): Link => [id, 'vl-n13']),
  ...['VL_HOTEL_EVENT_01', 'VL_HOTEL_EVENT_02', 'VL_HOTEL_EVENT_03', 'VL_HOTEL_EVENT_04', 'VL_HOTEL_EVENT_05'].map((id): Link => [id, 'vl-n21']),
  // Los dos pasos de la avenida, con semáforo.
  ['vl-xw-n', 'vl-xw-s'], ['vl-xe-n', 'vl-xe-s'],
  // Acera sur de la avenida.
  ...chain('EDGE_VL_SW', 'vl-s03', 'vl-xw-s', 'vl-s15', 'vl-s19', 'vl-s24', 'vl-xe-s', 'vl-s35', 'vl-s39', 'vl-s45', 'EDGE_VL_SE'),
  ['VL_DORADA_1_ENTRANCE', 'vl-s03'], ['VL_ALMA_ENTRANCE', 'vl-xw-s'], ['VL_GALERIA_ENTRANCE', 'vl-s15'], ['VL_GYM_ENTRANCE', 'vl-s39'],
  ['VL_CLINICA_ENTRANCE', 'vl-s45'], ['VL_GALERIA_WINDOW', 'vl-s15'], ['VL_DOORMAN_02', 'VL_DORADA_1_ENTRANCE'],
  ...['VL_OPENING_01', 'VL_OPENING_02', 'VL_OPENING_03', 'VL_OPENING_04', 'VL_OPENING_05'].map((id): Link => [id, 'vl-s15']),
  // Plaza Aurelia: se entra desde la avenida por el centro y por la esquina del metro, y se baja a la Calle Marqués.
  ['vl-s24', 'vl-pl-n'], ['vl-s35', 'vl-pl-ne'],
  ...chain('vl-pl-n', 'vl-pl-c', 'vl-pl-s', 'vl-m24'),
  ...chain('vl-pl-c', 'vl-pl-e', 'VL_METRO_ENTRANCE'),
  ...chain('vl-pl-ne', 'VL_METRO_MEET_01', 'vl-pl-se', 'vl-m35'),
  ['VL_METRO_ENTRANCE', 'VL_METRO_MEET_01'], ['VL_METRO_MEET_02', 'vl-pl-e'],
  ['VL_CAFE_ENTRANCE', 'vl-pl-c'], ['VL_CAFE_TERRACE_WAITER', 'VL_CAFE_ENTRANCE'],
  ['VL_CAFE_TERRACE_01', 'VL_CAFE_ENTRANCE'], ['VL_CAFE_TERRACE_02', 'VL_CAFE_ENTRANCE'],
  ['VL_PLAZA_BENCH_01', 'vl-pl-n'], ['VL_PLAZA_BENCH_02', 'vl-pl-n'], ['VL_PLAZA_BENCH_03', 'vl-pl-c'], ['VL_PLAZA_BENCH_04', 'vl-pl-e'],
  ['VL_PLAZA_MEET_01', 'vl-pl-e'], ['VL_PLAZA_MEET_02', 'vl-pl-c'],
  ...['VL_POPUP_01', 'VL_POPUP_02', 'VL_POPUP_03', 'VL_POPUP_04', 'VL_POPUP_05'].map((id): Link => [id, 'vl-pl-e']),
  // Calle Marqués: acera de la plaza, acera de los portales (con cada portal) y sus dos pasos de cebra.
  ...chain('EDGE_VL_MW', 'vl-m20', 'vl-m24', 'vl-m35', 'vl-m40', 'EDGE_VL_ME'),
  ...chain('EDGE_VL_RW', 'vl-r03', 'vl-r09', 'vl-r15', 'vl-r20', 'vl-r21', 'vl-r27', 'vl-r33', 'vl-r39', 'vl-r40', 'vl-r45', 'EDGE_VL_RE'),
  ['vl-m20', 'vl-r20'], ['vl-m40', 'vl-r40'],
  ['VL_MQ_2_ENTRANCE', 'vl-r03'], ['VL_MQ_4_ENTRANCE', 'vl-r09'], ['VL_VINOTECA_ENTRANCE', 'vl-r15'], ['VL_MQ_8_ENTRANCE', 'vl-r21'],
  ['VL_MQ_10_ENTRANCE', 'vl-r27'], ['VL_MQ_12_ENTRANCE', 'vl-r33'], ['VL_MQ_14_ENTRANCE', 'vl-r39'], ['VL_MQ_16_ENTRANCE', 'vl-r45'],
  ['VL_DOORMAN_03', 'VL_MQ_2_ENTRANCE'], ['VL_DOORMAN_04', 'VL_MQ_10_ENTRANCE'], ['VL_DOORMAN_05', 'VL_MQ_14_ENTRANCE'],
];

/** Carril taxi-VTC: taxis, VTC y el autobús de la línea; algún coche suelto. `*`: lo que no se nombra. */
const TAXI_LANE = { '*': 0.15, bus: 0.6, taxi: 2, 'taxi-wagon': 2, 'taxi-suv': 2, 'taxi-hybrid': 2, vtc: 2.4, service: 0.4 };
/** Carriles normales: de todo menos autobuses. */
const CAR_LANE = { bus: 0, interurban: 0 };
/** Calle Marqués: coches de vecinos, algún taxi y la furgoneta de reparto de primera hora; nada grande. */
const MARQUES = { bus: 0, interurban: 0, 'delivery-truck': 0, garbage: 0.4, 'small-truck': 0.3, van: 0.8 };

const BASE: LocationDef = {
  id: 'velaria',
  name: 'Velaria',
  kind: 'exterior',
  ground: GROUND,
  buildings: BUILDINGS,
  props: PROPS,
  portals: [],
  npcs: [],
  spawns: {},
  points: POINTS,
  links: LINKS,
  // Identidad visual (data/districts.ts): premium; la boca del metro, con su acero y su granito.
  district: 'premium',
  zones: [{ profile: 'transit', tx: 29, ty: 18, w: 7, h: 6 }],
  // Tráfico controlado: dos coches por carril en hora punta, uno de noche. La terraza y la calle se oyen.
  traffic: {
    lanes: [
      { row: 11, dir: -1, bias: TAXI_LANE }, { row: 12, dir: -1, bias: CAR_LANE },
      { row: 13, dir: 1, bias: CAR_LANE }, { row: 14, dir: 1, bias: CAR_LANE },
      { row: 27, dir: -1, bias: MARQUES, density: 0.4 },
    ],
    road: 'avenue',
    perLane: 2,
    hourly: [[0, 6, 1], [6, 8, 2], [8, 10, 3], [10, 19, 2], [19, 22, 3], [22, 24, 2]],
    bikes: {
      lanes: [{ row: 15, dir: 1 }],
      road: 'avenue',
      perLane: 2,
      hourly: [[0, 7, 0], [7, 10, 2], [10, 18, 1], [18, 21, 2], [21, 23, 1]],
      rainShy: 0.8,
    },
  },
  // La parada de taxis del Gran Hotel (VL_TAXI_*, en el bordillo): el coche para delante en el carril de taxis (fila 11).
  rides: [{ wait: 'VL_TAXI_01', lane: 11, stopTx: 19 }, { wait: 'VL_TAXI_02', lane: 11, stopTx: 23 }],
  // La terraza del Café Aurelia (data/streets.ts: tableService): cada mesa, su silla y el sitio de quien atiende.
  tables: [
    { id: 'VL_CAFE_TERRAZA_01', seats: ['VL_CAFE_TERRACE_01'], service: { tx: 19, ty: 23 } },
    { id: 'VL_CAFE_TERRAZA_02', seats: ['VL_CAFE_TERRACE_02'], service: { tx: 22, ty: 23 } },
  ],
  // Los dos pasos de la avenida, con semáforo; desfasados.
  signals: [
    { id: 'dorada-oeste', tx: 8, ty: 11, w: 3, h: 5 },
    { id: 'dorada-este', tx: 31, ty: 11, w: 3, h: 5, offset: 11_000 },
  ],
  inspects: [
    { tx: 25, ty: 20, name: 'Fuente de Aurelia', lines: ['Bronce y piedra caliza. Una placa: «A Aurelia, que plantó los plátanos de esta plaza». Nadie sabe ya quién era. Los plátanos siguen.'] },
    { tx: 23, ty: 7, name: 'Marquesina del hotel', lines: ['Latón pulido, cristal y una alfombra que alguien limpia cada hora. Debajo, el número 20 de la Avenida Dorada.'] },
    { tx: 14, ty: 17, name: 'Cartel de la galería', lines: ['«Paisajes de interior», óleos de una pintora gallega. La entrada es libre. El catálogo, no.'] },
    { tx: 8, ty: 29, name: 'Placa de la calle', lines: ['«Calle del Marqués de Velaria». Debajo, en pequeño, alguien ha pegado una pegatina de un grupo de música. Dura poco: aquí lo limpian todo.'] },
  ],
  // Nombres para el mapa (tecla M).
  areas: [
    { name: 'Avenida Dorada', tx: 8, ty: 13 },
    { name: 'Plaza Aurelia', tx: 26, ty: 24 },
    { name: 'Calle Marqués', tx: 30, ty: 27 },
  ],
};

export const VELARIA: LocationDef = { ...BASE, props: [...BASE.props, ...dress(BASE)] };
