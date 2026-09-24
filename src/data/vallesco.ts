import type { BuildingDef, LocationDef, PointDef, PropKind, PropPlacement } from '../types/game.ts';

/**
 * Barrio Vallesco (dirección A, design/barrio/direccion-a.html): la Calle
 * Mayor peatonal y comercial al norte, la avenida con tráfico en medio y la
 * parte residencial al sur, con la plazuela del metro a diez pasos de casa.
 *
 * El suelo se pinta por rectángulos en orden (lo último manda). Los edificios
 * van aparte: tapan su huella, generan su puerta y son sólidos.
 */
const W = 76;
const H = 56;

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
  ['~', 30, 6, 21, 10], // Plaza de la Fuente
  ['a', 39, 10, 3, 2], // vaso de la fuente
  ['c', 0, 16, W, 3], // Calle Mayor, peatonal
  ['c', 22, 19, 3, 10], // Calle Tintoreros, tramo peatonal
  ['c', 50, 19, 1, 10], // Callejón del Banco
  ['.', 2, 27, 10, 2], // carga y descarga del súper
  ['~', 51, 27, 23, 2], // explanada de las oficinas
  [',', 0, 29, W, 2], // Avenida de Vallesco: acera norte
  ['.', 0, 31, W, 1],
  ['=', 0, 32, W, 1], // línea central: hacia el oeste arriba, hacia el este abajo
  ['.', 0, 33, W, 2],
  ['z', 24, 31, 3, 4], // paso de cebra oeste
  ['z', 52, 31, 3, 4], // paso de cebra este
  [',', 0, 35, W, 2], // acera sur
  ['~', 25, 37, 12, 9], // Plazuela del Metro
  ['.', 22, 37, 3, 9], // Calle Tintoreros, tramo con coches
  ['c', 56, 37, 2, 9], // Pasaje del Reloj
  [',', 0, 46, W, 1], // Calle del Olmo
  ['.', 0, 47, W, 2],
  ['z', 39, 47, 2, 2],
  [',', 0, 49, W, 1],
  ['c', 37, 52, 37, 1], // Parque del Olmo: paseo
  ['k', 60, 50, 8, 4], // pista
  ['R', 0, 55, W, 1], // la vía: límite sur del barrio
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

// Los ids home-door, cafe-door y metro-door se conservan: los interiores y la
// estación ya salen a esos spawns.
const BUILDINGS: readonly BuildingDef[] = [
  // Interiores
  b('home-door', 'Tu portal · Olmo 7', 'home', [37, 37, 9, 9], 's', 41, { floors: 2, enter: into('home'), point: 'HOME_ENTRANCE' }),
  b('metro-door', 'Metro · Vallesco', 'metro', [29, 38, 3, 3], 's', 30, { enter: { location: 'vallesco-station', spawn: 'entry' }, point: 'METRO_ENTRANCE' }),
  b('gym-door', 'Gimnasio Forja', 'gym', [33, 1, 15, 5], 's', 40, { floors: 2, enter: into('gym'), point: 'GYM_ENTRANCE' }),
  b('cafe-door', 'Cafetería Pausa', 'cafe', [52, 8, 10, 8], 's', 56, { floors: 2, enter: into('cafe'), point: 'CAFE_ENTRANCE' }),
  b('fashion-door', 'Hilo · moda', 'fashion', [2, 8, 10, 8], 's', 6, { floors: 2, enter: into('fashion'), point: 'CLOTHING_STORE_ENTRANCE' }),
  b('super-door', 'Súper Rosales', 'super', [2, 19, 10, 8], 'n', 6, { enter: into('supermarket'), point: 'SUPERMARKET_ENTRANCE' }),
  b('restaurant-door', 'Casa Tomás', 'restaurant', [25, 19, 9, 6], 'n', 29, { enter: into('restaurant'), point: 'RESTAURANT_ENTRANCE' }),
  b('office-door', 'Edificio Atalaya', 'office', [57, 19, 17, 8], 's', 65, { floors: 2, enter: into('office'), point: 'OFFICE_ENTRANCE' }),
  // Ambientales: puerta dibujada, sin afordancia. El punto de entrada queda para los NPC.
  b('hair', 'Peluquería', 'hair', [12, 10, 5, 6], 's', 14, { floors: 2, point: 'HAIR_SALON_ENTRANCE', inspect: ['Peluquería Nati. Sin cita, pero con paciencia.'] }),
  b('pharmacy', 'Farmacia', 'pharmacy', [17, 9, 5, 7], 's', 19, { floors: 2, point: 'PHARMACY_ENTRANCE', inspect: ['Farmacia de barrio. Esta noche la de guardia es la de Ribera Norte.'] }),
  b('res-mayor-3', 'Mayor 3', 'res-brick', [22, 5, 7, 11], 's', 25, { floors: 2, point: 'RES_MAYOR_3_ENTRANCE', inspect: ['Portero automático. Nueve timbres, dos con el nombre tachado.'] }),
  b('bank', 'Banco', 'bank', [62, 9, 6, 7], 's', 64, { floors: 2, point: 'BANK_ENTRANCE', inspect: ['El cajero pide la tarjeta antes de decir buenos días.'] }),
  b('res-mayor-9', 'Mayor 9', 'res-stone', [68, 3, 6, 13], 's', 71, { floors: 2, point: 'RES_MAYOR_9_ENTRANCE', inspect: ['Un buzón rebosa de publicidad. Alguien no ha pasado por aquí en semanas.'] }),
  b('to-let', 'Local en alquiler', 'to-let', [12, 19, 5, 6], 'n', 14, { point: 'MAYOR_12_ENTRANCE', inspect: ['«Se alquila. Razón: 3.º B.» El cartel lleva ahí más tiempo que la persiana.'] }),
  b('fruit', 'Frutería', 'fruit', [17, 19, 5, 6], 'n', 19, { point: 'FRUIT_SHOP_ENTRANCE', inspect: ['Cajas de naranjas en la acera y una pizarra: «Hoy, nísperos».'] }),
  b('hardware', 'Ferretería', 'hardware', [25, 25, 9, 4], 's', 29, { point: 'HARDWARE_ENTRANCE', inspect: ['Ferretería. Tienen de todo, pero hay que saber pedirlo.'] }),
  b('study', 'Centro de estudios', 'study', [34, 19, 16, 9], 'n', 41, { point: 'STUDY_CENTER_ENTRANCE', inspect: ['Centro de estudios Vallesco. Un cartel anuncia cursos de tarde; la matrícula, en ventanilla.'] }),
  b('laundry', 'Lavandería', 'laundry', [51, 19, 6, 6], 'n', 53, { point: 'LAUNDRY_ENTRANCE', inspect: ['Tres lavadoras girando y nadie esperando.'] }),
  b('res-av-2', 'Avenida 2', 'res-plaster', [2, 37, 11, 9], 'n', 7, { point: 'RES_AVENIDA_2_ENTRANCE', inspect: ['Un portal que huele a lejía recién echada.'] }),
  b('res-olmo-3', 'Olmo 3', 'res-brick', [13, 37, 9, 9], 's', 17, { floors: 2, point: 'RES_OLMO_3_ENTRANCE', inspect: ['En el portal, un aviso: «Junta de vecinos el jueves. Tema: el ascensor».'] }),
  b('res-olmo-11', 'Olmo 11', 'res-stone', [46, 37, 10, 9], 's', 50, { floors: 2, point: 'RES_OLMO_11_ENTRANCE', inspect: ['Un triciclo aparcado bajo la escalera.'] }),
  b('res-av-20', 'Avenida 20', 'res-brick', [58, 37, 16, 9], 'n', 65, { point: 'RES_AVENIDA_20_ENTRANCE', inspect: ['El portero automático zumba, pero nadie contesta.'] }),
  b('civic', 'Junta municipal', 'civic', [2, 50, 14, 5], 'n', 9, { point: 'CIVIC_ENTRANCE', inspect: ['Junta Municipal de Vallesco. Empadronamientos, quejas y un tablón lleno de chinchetas.'] }),
  b('res-olmo-6', 'Olmo 6', 'res-plaster', [16, 50, 12, 5], 'n', 22, { point: 'RES_OLMO_6_ENTRANCE', inspect: ['Bicicletas encadenadas a la reja del portal.'] }),
  b('works', 'Obra', 'works', [28, 50, 8, 5], 'n'),
  // Traseras: tejados que cierran el norte del barrio.
  b('backdrop-nw', 'Manzana norte', 'backdrop', [2, 1, 20, 7], undefined),
  b('backdrop-ne', 'Manzana noreste', 'backdrop', [49, 1, 18, 6], undefined),
];

const at = (kind: PropKind, tx: number, ty: number): PropPlacement => ({ kind, tx, ty });
const row = (kind: PropKind, ty: number, xs: readonly number[]): PropPlacement[] => xs.map((tx) => at(kind, tx, ty));

const PROPS: readonly PropPlacement[] = [
  // Borde norte
  ...[[1, 0], [24, 0], [29, 2], [48, 2], [68, 0], [74, 1]].map(([x, y]) => at('tree', x, y)),

  // Plaza de la Fuente
  at('fountain', 39, 11),
  // Sin espejo: la esquina noreste es de jardineras y los bancos de ese lado van corridos.
  ...[[31, 7], [31, 13], [48, 13]].map(([x, y]) => at('tree', x, y)),
  at('planter', 48, 7), at('planter', 49, 7),
  ...row('bench', 8, [35, 36, 43, 44]),
  ...row('bench', 13, [35, 36, 44, 45]),
  at('kiosk', 46, 11),
  at('lamp', 33, 10),
  at('lamp', 49, 10),

  // Calle Mayor: terrazas, género en la puerta, farolas y papeleras junto a las fachadas
  at('parasol', 52, 16), at('cafe-table', 53, 16), at('parasol', 59, 16), at('cafe-table', 60, 16),
  at('cafe-table', 26, 18), at('menu-board', 31, 18), at('cafe-table', 32, 18),
  ...row('produce', 18, [3, 4, 8, 18, 20]),
  ...row('lamp', 16, [11, 21, 47]),
  ...row('lamp', 18, [34, 67]),
  at('bin', 12, 18), at('bin', 48, 18), at('vending', 29, 16),

  // Trasera del súper y solar entre manzanas
  at('van', 3, 27),
  at('tree', 13, 26), at('tree', 20, 26), at('bench', 16, 27), at('bench', 17, 27),

  // Explanada de Atalaya
  ...row('bike', 27, [52, 53, 54]),
  at('planter', 59, 27), at('planter', 70, 27),

  // Avenida
  ...row('tree', 29, [2, 14, 20, 34, 46, 58, 70]),
  at('bus-stop', 38, 29),
  at('car', 5, 31), at('car-b', 11, 31), at('car-c', 64, 31), at('car-b', 40, 34), at('car', 46, 34),
  ...row('tree', 35, [4, 19, 48, 60, 72]),

  // Plazuela del Metro
  at('metro-sign', 29, 37),
  at('bench', 34, 43), at('bench', 35, 43), at('bench', 26, 40),
  at('lamp', 35, 38), at('tree', 25, 44), at('bike', 27, 44), at('bike', 28, 44), at('bin', 35, 40),

  // Calle del Olmo
  at('car', 8, 47), at('car-c', 60, 48),

  // Parque del Olmo
  ...[[38, 50], [42, 53], [47, 51], [56, 50], [70, 51], [73, 53], [52, 54]].map(([x, y]) => at('tree', x, y)),
  ...row('bench', 51, [44, 45, 52, 53]),
  at('hoop', 60, 51), at('hoop', 67, 51),
  at('lamp', 48, 53), at('lamp', 58, 53),
];

const p = (tx: number, ty: number, kind: PointDef['kind'], facing?: PointDef['facing']): PointDef => ({ tx, ty, kind, facing });

// Puntos con nombre del barrio. Las entradas de los edificios las genera
// LocationSystem desde BUILDINGS (HOME_ENTRANCE, CAFE_ENTRANCE, ...).
const POINTS: Readonly<Record<string, PointDef>> = {
  // Bordes: el resto de la ciudad. Por aquí entrarán y se irán los NPC que no viven aquí.
  EDGE_MAYOR_W: p(0, 17, 'edge'), EDGE_MAYOR_E: p(75, 17, 'edge'),
  EDGE_AVENIDA_NW: p(0, 30, 'edge'), EDGE_AVENIDA_NE: p(75, 30, 'edge'),
  EDGE_AVENIDA_SW: p(0, 36, 'edge'), EDGE_AVENIDA_SE: p(75, 36, 'edge'),
  EDGE_OLMO_W: p(0, 46, 'edge'), EDGE_OLMO_E: p(75, 46, 'edge'),
  EDGE_OLMO_SW: p(0, 49, 'edge'), EDGE_OLMO_SE: p(75, 49, 'edge'),

  // Sitios para estar
  PLAZA_FOUNTAIN: p(40, 13, 'meet'),
  PLAZA_BENCH_01: p(35, 9, 'seat', 'up'), PLAZA_BENCH_02: p(44, 9, 'seat', 'up'),
  PLAZA_BENCH_03: p(35, 12, 'seat', 'down'), PLAZA_BENCH_04: p(44, 12, 'seat', 'down'),
  NEWS_KIOSK: p(46, 12, 'interact', 'up'),
  CAFE_TERRACE_01: p(54, 17, 'seat', 'up'), CAFE_TERRACE_02: p(60, 17, 'seat', 'up'),
  BUS_STOP: p(39, 30, 'wait', 'up'),
  METRO_PLAZUELA_BENCH: p(33, 42, 'wait', 'down'),
  PARK_BENCH_01: p(44, 52, 'seat', 'up'), PARK_BENCH_02: p(52, 52, 'seat', 'up'),
  PARK_COURT: p(63, 52, 'meet'),

  // Nodos de paso del grafo
  'mayor-06': p(6, 17, 'path'), 'mayor-14': p(14, 17, 'path'), 'mayor-19': p(19, 17, 'path'),
  'mayor-23': p(23, 17, 'path'), 'mayor-25': p(25, 17, 'path'), 'mayor-29': p(29, 17, 'path'),
  'mayor-40': p(40, 17, 'path'), 'mayor-50': p(50, 17, 'path'), 'mayor-53': p(53, 17, 'path'),
  'mayor-56': p(56, 17, 'path'), 'mayor-64': p(64, 17, 'path'), 'mayor-71': p(71, 17, 'path'),
  'plaza-s': p(40, 15, 'path'), 'plaza-w': p(34, 10, 'path'), 'plaza-e': p(46, 10, 'path'),
  'plaza-nw': p(34, 7, 'path'), 'plaza-ne': p(46, 7, 'path'), 'plaza-sw': p(31, 15, 'path'),
  'tintoreros-n': p(23, 24, 'path'), callejon: p(50, 24, 'path'),
  'av-23': p(23, 30, 'path'), 'av-25': p(25, 30, 'path'), 'av-29': p(29, 30, 'path'),
  'av-50': p(50, 30, 'path'), 'av-53': p(53, 30, 'path'), 'av-65': p(65, 30, 'path'),
  'avs-23': p(23, 36, 'path'), 'avs-25': p(25, 36, 'path'), 'avs-30': p(30, 36, 'path'),
  'avs-53': p(53, 36, 'path'), 'avs-56': p(56, 36, 'path'),
  'tintoreros-s': p(23, 41, 'path'), 'plazuela-1': p(26, 37, 'path'), 'plazuela-2': p(28, 42, 'path'),
  'plazuela-4': p(33, 37, 'path'), pasaje: p(56, 41, 'path'),
  'olmo-23': p(23, 46, 'path'), 'olmo-30': p(30, 46, 'path'), 'olmo-40': p(40, 46, 'path'), 'olmo-56': p(56, 46, 'path'),
  'olmo-s40': p(40, 49, 'path'), 'olmo-s70': p(70, 49, 'path'),
  'park-w': p(40, 52, 'path'), 'park-e': p(72, 52, 'path'),
};

type Link = readonly [string, string];
const chain = (...ids: string[]): Link[] => ids.slice(1).map((id, i) => [ids[i], id] as const);

const LINKS: readonly Link[] = [
  // Calle Mayor, de oeste a este, y cada puerta a su nodo
  ...chain('EDGE_MAYOR_W', 'mayor-06', 'mayor-14', 'mayor-19', 'mayor-23', 'mayor-25', 'mayor-29', 'mayor-40',
    'mayor-50', 'mayor-53', 'CAFE_TERRACE_01', 'mayor-56', 'CAFE_TERRACE_02', 'mayor-64', 'mayor-71', 'EDGE_MAYOR_E'),
  ['CLOTHING_STORE_ENTRANCE', 'mayor-06'], ['SUPERMARKET_ENTRANCE', 'mayor-06'],
  ['HAIR_SALON_ENTRANCE', 'mayor-14'], ['MAYOR_12_ENTRANCE', 'mayor-14'],
  ['PHARMACY_ENTRANCE', 'mayor-19'], ['FRUIT_SHOP_ENTRANCE', 'mayor-19'],
  ['RES_MAYOR_3_ENTRANCE', 'mayor-25'], ['RESTAURANT_ENTRANCE', 'mayor-29'],
  ['STUDY_CENTER_ENTRANCE', 'mayor-40'], ['LAUNDRY_ENTRANCE', 'mayor-53'],
  ['CAFE_ENTRANCE', 'mayor-56'], ['BANK_ENTRANCE', 'mayor-64'], ['RES_MAYOR_9_ENTRANCE', 'mayor-71'],

  // Plaza y gimnasio, detrás de ella
  ...chain('mayor-40', 'plaza-s', 'PLAZA_FOUNTAIN'),
  ['PLAZA_FOUNTAIN', 'plaza-w'], ['PLAZA_FOUNTAIN', 'plaza-e'], ...chain('mayor-29', 'plaza-sw', 'plaza-w'),
  ...chain('plaza-w', 'plaza-nw', 'GYM_ENTRANCE', 'plaza-ne', 'plaza-e'),
  ['PLAZA_BENCH_01', 'plaza-w'], ['PLAZA_BENCH_03', 'plaza-w'],
  ['PLAZA_BENCH_02', 'plaza-e'], ['PLAZA_BENCH_04', 'PLAZA_FOUNTAIN'], ['NEWS_KIOSK', 'PLAZA_FOUNTAIN'],

  // De la Mayor a la avenida
  ...chain('mayor-23', 'tintoreros-n', 'av-23'),
  ...chain('mayor-50', 'callejon', 'av-50'),

  // Avenida: acera norte, dos pasos de cebra, acera sur
  ...chain('EDGE_AVENIDA_NW', 'av-23', 'av-25', 'av-29', 'BUS_STOP', 'av-50', 'av-53', 'av-65', 'EDGE_AVENIDA_NE'),
  ['HARDWARE_ENTRANCE', 'av-29'], ['OFFICE_ENTRANCE', 'av-65'],
  ['av-25', 'avs-25'], ['av-53', 'avs-53'],
  ...chain('EDGE_AVENIDA_SW', 'RES_AVENIDA_2_ENTRANCE', 'avs-23', 'avs-25', 'avs-30', 'avs-53', 'avs-56',
    'RES_AVENIDA_20_ENTRANCE', 'EDGE_AVENIDA_SE'),

  // Del sur de la avenida a la Calle del Olmo: Tintoreros, la plazuela y el pasaje
  ...chain('avs-23', 'tintoreros-s', 'olmo-23'),
  ...chain('avs-30', 'plazuela-1', 'plazuela-2', 'METRO_ENTRANCE', 'METRO_PLAZUELA_BENCH'),
  ...chain('avs-30', 'plazuela-4', 'METRO_PLAZUELA_BENCH', 'olmo-30'),
  ['plazuela-2', 'olmo-30'],
  ...chain('avs-56', 'pasaje', 'olmo-56'),

  // Calle del Olmo y el parque
  ...chain('EDGE_OLMO_W', 'RES_OLMO_3_ENTRANCE', 'olmo-23', 'olmo-30', 'olmo-40', 'HOME_ENTRANCE',
    'RES_OLMO_11_ENTRANCE', 'olmo-56', 'EDGE_OLMO_E'),
  ['olmo-40', 'olmo-s40'],
  ...chain('EDGE_OLMO_SW', 'CIVIC_ENTRANCE', 'RES_OLMO_6_ENTRANCE', 'olmo-s40'),
  ...chain('olmo-s40', 'park-w', 'PARK_BENCH_01', 'PARK_BENCH_02', 'PARK_COURT', 'park-e', 'olmo-s70', 'EDGE_OLMO_SE'),
];

export const VALLESCO: LocationDef = {
  id: 'district',
  name: 'Barrio Vallesco',
  kind: 'exterior',
  ground: GROUND,
  buildings: BUILDINGS,
  props: PROPS,
  portals: [],
  npcs: [
    { id: 'vera', tx: 37, ty: 9, facing: 'left' },
    { id: 'ada', tx: 44, ty: 18, facing: 'up' },
  ],
  spawns: {
    start: { tx: 41, ty: 46, facing: 'down' },
  },
  points: POINTS,
  links: LINKS,
  // Carriles de circulación; los de los bordes (31 y 34) son de aparcamiento.
  traffic: { lanes: [{ row: 32, dir: -1 }, { row: 33, dir: 1 }], carsPerLane: 2 },
  // Cosas que se miran: responden con una línea, no abren nada.
  inspects: [
    { tx: 40, ty: 11, name: 'Fuente', lines: ['El agua sale fría hasta en agosto. Alguien ha dejado una moneda en el fondo.'] },
    { tx: 46, ty: 11, name: 'Quiosco', lines: ['Periódicos de hoy, revistas de hace un mes y cromos que ya nadie colecciona.'] },
    { tx: 39, ty: 29, name: 'Marquesina', lines: ['Línea 27, hacia el centro. La pantalla dice «8 min» desde hace un buen rato.'] },
    { tx: 29, ty: 16, name: 'Máquina', lines: ['Refrescos a un euro con veinte. La de naranja lleva agotada toda la semana.'] },
    { tx: 31, ty: 18, name: 'Pizarra', lines: ['Menú del día: lentejas, merluza o pollo, postre y pan. Once euros.'] },
    { tx: 31, ty: 50, name: 'Obra', lines: ['«Rehabilitación de fachada. Fin de obra: marzo.» No dice de qué año.'] },
  ],
};
