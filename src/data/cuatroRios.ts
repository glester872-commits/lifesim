import type { BuildingDef, LocationDef, PointDef, PropKind, PropPlacement } from '../types/game.ts';
import { dress } from '../systems/Dressing.ts';

/**
 * Cuatro Ríos: CIUDAD DENSA DE DIARIO + VIDA DE MUCHOS ORÍGENES + TRANSPORTE + COMERCIO DE BARRIO. Nada que ver con la
 * calma premium de Velaria: aquí todo está a dos pasos, abre temprano y cierra tarde, y en hora punta no se cabe.
 *
 *   y 1–7   bloques de ladrillo y revoco de tres plantas con comercio abajo: frutería, panadería, móviles, farmacia,
 *           el súper junto a la zona de carga, moda y la pizzería
 *   y 8–9   acera norte, con la parada del autobús
 *   y 10–15 la Avenida de los Ríos: carril bici, bus-taxi y un carril hacia el oeste; dos hacia el este y su carril bici.
 *           Dos pasos de cebra con semáforo, uno a cada lado del Cruce
 *   x 22–25 la Calle del Cruce, de norte a sur: corta la avenida (el gran cruce) y la calle de atrás. Calzada de carga y
 *           descarga, sin carriles de paso; se cruza por sus pasos de cebra
 *   y 16–17 acera sur: gimnasio, barbería, recreativos, la tienda que abre hasta tarde, la hamburguesería y ropa
 *   y 18–22 la plaza del metro, con su boca, bancos y aparcabicis
 *   y 23–26 la Calle del Afluente: un carril hacia el este (furgonetas y repartos) y el bordillo de aparcar
 *   y 27–33 portales de vecinos de todas las épocas y el sushi del barrio
 *
 * Los puntos (CR_*, cr-*) y el grafo de peatones son los de siempre (data/streets.ts, perfil 'cuatro-rios'). El
 * micromobiliario —contenedores delante de cada portal, armarios de los semáforos, coches aparcados, patinetes del
 * metro y el kit del barrio (cajas, carteles, armarios de la luz)— sale de systems/Dressing.
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

// Debajo de los edificios, el relleno (no es acera: el kit de fachada de systems/Dressing no lo toma por suelo).
const GROUND = paint('g', [
  ['c', 0, 0, W, 1], // callejón de atrás de los bloques del norte
  // Aceras: las dos de la avenida, las dos del Afluente, las del Cruce y el trozo al oeste de la plaza.
  [',', 0, 8, W, 2], [',', 0, 16, W, 2], [',', 0, 23, W, 1], [',', 0, 26, W, 1],
  [',', 22, 0, 1, H], [',', 25, 0, 1, H], [',', 0, 18, 2, 5],
  ['.', 23, 0, 2, H], // la Calle del Cruce, de punta a punta
  // La Avenida de los Ríos: carril bici, bus-taxi y carril hacia el oeste; dos carriles y carril bici hacia el este.
  ['b', 0, 10, W, 1],
  ['u', 0, 11, W, 1],
  ['.', 0, 12, W, 1],
  ['l', 0, 13, W, 1],
  ['.', 0, 14, W, 1],
  ['b', 0, 15, W, 1],
  ['z', 19, 10, 3, 6], ['z', 26, 10, 3, 6], // los dos pasos del cruce, con semáforo
  // Donde las aceras cruzan la Calle del Cruce.
  ['z', 23, 8, 2, 2], ['z', 23, 16, 2, 2], ['z', 23, 23, 2, 1], ['z', 23, 26, 2, 1],
  // La Calle del Afluente: un carril hacia el este (fila 24) y el bordillo de aparcar (25); dos pasos de cebra.
  ['.', 0, 24, W, 2],
  ['z', 12, 24, 2, 2], ['z', 37, 24, 2, 2],
  // La plaza del metro: granito, y la franja podotáctil delante de la escalera.
  ['P', 2, 18, 11, 5],
  ['T', 6, 22, 3, 1],
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
  // Norte: tres plantas con balcones y persianas; abajo, una tienda tras otra.
  b('cr-res-1', 'Avenida de los Ríos 2', 'res-brick', [0, 1, 5, 7], 's', 2, { floors: 3, point: 'CR_RES_1_ENTRANCE' }),
  b('cr-fruteria', 'Frutas Dos Orillas', 'fruit', [5, 1, 4, 7], 's', 6, { floors: 3, enter: into('cr-fruteria'), point: 'CR_FRUIT_ENTRANCE' }),
  b('cr-panaderia', 'Panadería La Espiga', 'bakery', [9, 1, 4, 7], 's', 10, { floors: 3, enter: into('cr-panaderia'), point: 'CR_BAKERY_ENTRANCE' }),
  b('cr-conecta', 'Conecta · móviles', 'phone', [13, 1, 4, 7], 's', 14, { floors: 3, enter: into('cr-conecta'), point: 'CR_PHONE_ENTRANCE' }),
  b('cr-farmacia', 'Farmacia del Cruce', 'pharmacy', [17, 1, 5, 7], 's', 19, { floors: 3, enter: into('cr-farmacia'), point: 'CR_PHARMACY_ENTRANCE' }),
  b('cr-super', 'Supermercado Cuatro Ríos', 'super', [26, 1, 7, 7], 's', 29, { floors: 2, enter: into('cr-super'), point: 'CR_SUPER_ENTRANCE' }),
  b('cr-res-2', 'Avenida de los Ríos 9', 'res-plaster', [33, 1, 5, 7], 's', 35, { floors: 3, point: 'CR_RES_2_ENTRANCE' }),
  b('cr-hilvana', 'Hilvana · moda', 'fashion', [38, 1, 4, 7], 's', 39, { floors: 3, enter: into('cr-hilvana'), point: 'CR_HILVANA_ENTRANCE' }),
  b('cr-pizzeria', 'Pizzería Roma', 'restaurant', [42, 1, 6, 7], 's', 44, { floors: 3, enter: into('pizzeria-roma'), point: 'CR_PIZZA_ENTRANCE' }),
  // Sur de la avenida: la boca del metro en su plaza y los locales con la fachada a la avenida.
  b('cr-metro', 'Metro · Cuatro Ríos', 'metro', [5, 18, 5, 4], 's', 7, { enter: into('cuatro-rios-station'), point: 'CR_METRO_ENTRANCE' }),
  b('cr-gym', 'Gimnasio Barrio Fit', 'gym', [13, 18, 5, 5], 'n', 15, { enter: into('cr-gym'), point: 'CR_GYM_ENTRANCE' }),
  b('cr-barberia', 'Barbería del Cruce', 'hair', [18, 18, 4, 5], 'n', 19, { enter: into('cr-barberia'), point: 'CR_BARBER_ENTRANCE' }),
  b('cr-arcade', 'Recreativos Delta', 'arcade', [26, 18, 6, 5], 'n', 28, { enter: into('cr-arcade'), point: 'CR_ARCADE_ENTRANCE' }),
  b('cr-abierto', 'Abierto Hasta Tarde', 'grocer', [32, 18, 4, 5], 'n', 33, { enter: into('cr-abierto'), point: 'CR_ABIERTO_ENTRANCE' }),
  b('cr-burger', 'Burger Norte', 'restaurant', [36, 18, 6, 5], 'n', 38, { enter: into('burger-norte'), point: 'CR_BURGER_ENTRANCE' }),
  b('cr-ambar', 'Ámbar · calle y deporte', 'streetwear', [42, 18, 6, 5], 'n', 44, { enter: into('cr-ambar'), point: 'CR_AMBAR_ENTRANCE' }),
  // Calle del Afluente: portales de piedra, ladrillo, revoco y uno nuevo, y el sushi en un bajo.
  b('cr-af-1', 'Afluente 1', 'res-stone', [0, 27, 6, 7], 'n', 3, { point: 'CR_AF_1_ENTRANCE' }),
  b('cr-af-3', 'Afluente 3', 'res-brick', [6, 27, 6, 7], 'n', 9, { point: 'CR_AF_3_ENTRANCE' }),
  b('cr-sushi', 'Sushi Nori', 'restaurant', [12, 27, 5, 7], 'n', 14, { enter: into('sushi-nori'), point: 'CR_SUSHI_ENTRANCE' }),
  b('cr-af-7', 'Afluente 7', 'res-modern', [17, 27, 5, 7], 'n', 19, { point: 'CR_AF_7_ENTRANCE' }),
  b('cr-af-10', 'Afluente 10', 'res-plaster', [26, 27, 6, 7], 'n', 28, { point: 'CR_AF_10_ENTRANCE' }),
  b('cr-af-12', 'Afluente 12', 'res-brick', [32, 27, 5, 7], 'n', 34, { point: 'CR_AF_12_ENTRANCE' }),
  b('cr-af-14', 'Afluente 14', 'res-stone', [37, 27, 5, 7], 'n', 39, { point: 'CR_AF_14_ENTRANCE' }),
  b('cr-af-16', 'Afluente 16', 'res-modern', [42, 27, 6, 7], 'n', 44, { point: 'CR_AF_16_ENTRANCE' }),
];

const at = (kind: PropKind, tx: number, ty: number): PropPlacement => ({ kind, tx, ty });
const many = (kind: PropKind, cells: readonly (readonly [number, number])[]): PropPlacement[] => cells.map(([x, y]) => at(kind, x, y));

const PROPS: readonly PropPlacement[] = [
  // Farolas contra las fachadas de la avenida, entre puerta y puerta (la gente pasa por el bordillo).
  ...many('street-lamp-art', [[4, 8], [12, 8], [33, 8], [2, 17], [17, 17], [35, 17], [41, 17]]),
  // La parada del autobús, en la acera norte: los autobuses van por el carril bus-taxi hacia el oeste.
  at('bus-stop', 40, 8),
  // La zona de carga y descarga del súper, en la Calle del Cruce: cajas apiladas contra la fachada.
  ...many('crates', [[25, 2], [25, 3], [25, 5]]),
  // La plaza del metro: el aparcabicis junto a la acera, dos bancos detrás, el plano del barrio y un plátano.
  at('bike-rack', 10, 18),
  ...many('bench', [[10, 20], [11, 20]]),
  at('metro-totem', 4, 19),
  at('plane-tree', 2, 19),
  // Armarios de la luz contra las fachadas.
  at('utility-box', 37, 8),
  at('utility-box', 36, 17),
  // El tablón del barrio (systems/Boards): junto al metro, fuera de los caminos de la gente.
  at('notice-board', 1, 20),
];

// ---------------------------------------------------------------- puntos

const p = (tx: number, ty: number, kind: PointDef['kind'], facing?: PointDef['facing']): PointDef => ({ tx, ty, kind, facing });

/** Columnas de las puertas de cada acera de la avenida: su nodo en el bordillo, justo delante. */
const NORTH_DOORS = [2, 6, 10, 14, 19, 29, 35, 39, 44] as const;
const SOUTH_DOORS = [15, 19, 28, 33, 38, 44] as const;
const pad = (x: number): string => String(x).padStart(2, '0');

const POINTS: Record<string, PointDef> = {
  // Los bordes: el resto de la ciudad, por la avenida, por las dos aceras del Afluente.
  EDGE_CR_NW: p(0, 9, 'edge'), EDGE_CR_NE: p(W - 1, 9, 'edge'),
  EDGE_CR_SW: p(0, 16, 'edge'), EDGE_CR_SE: p(W - 1, 16, 'edge'),
  EDGE_CR_BW: p(0, 23, 'edge'), EDGE_CR_BE: p(W - 1, 23, 'edge'),
  EDGE_CR_RW: p(0, 26, 'edge'), EDGE_CR_RE: p(W - 1, 26, 'edge'),

  // Escaparates: se para a mirar la fruta, los móviles y la ropa, pegado al cristal.
  CR_FRUIT_WINDOW: p(8, 8, 'meet', 'up'),
  CR_PHONE_WINDOW: p(16, 8, 'meet', 'up'),
  CR_HILVANA_WINDOW: p(38, 8, 'meet', 'up'),
  CR_AMBAR_WINDOW: p(46, 17, 'meet', 'down'),
  // La parada del autobús, junto a la marquesina.
  CR_BUS_STOP: p(41, 9, 'wait', 'down'),
  // Quedar después del trabajo: a los lados de la puerta de la pizzería y a la de los recreativos.
  CR_MEET_01: p(43, 8, 'meet', 'right'), CR_MEET_02: p(45, 8, 'meet', 'left'),
  CR_ARCADE_HANG_01: p(30, 17, 'meet', 'right'), CR_ARCADE_HANG_02: p(31, 17, 'meet', 'left'),
  // La plaza del metro: quien espera a alguien que sale del tren, y los dos bancos.
  CR_METRO_MEET_01: p(4, 21, 'wait', 'right'), CR_METRO_MEET_02: p(10, 21, 'wait', 'left'), CR_METRO_MEET_03: p(11, 21, 'wait', 'left'),
  CR_PLAZA_BENCH_01: p(10, 20, 'seat', 'down'), CR_PLAZA_BENCH_02: p(11, 20, 'seat', 'down'),

  // Nodos de paso: el bordillo de cada acera de la avenida (uno delante de cada puerta) y los pasos.
  ...Object.fromEntries(NORTH_DOORS.map((x) => [`cr-n${pad(x)}`, p(x, 9, 'path')])),
  ...Object.fromEntries(SOUTH_DOORS.map((x) => [`cr-s${pad(x)}`, p(x, 16, 'path')])),
  'cr-n22': p(22, 9, 'path'), 'cr-n25': p(25, 9, 'path'),
  'cr-xw-n': p(20, 9, 'path'), 'cr-xw-s': p(20, 16, 'path'),
  'cr-xe-n': p(27, 9, 'path'), 'cr-xe-s': p(27, 16, 'path'),
  'cr-s03': p(3, 16, 'path'), 'cr-s12': p(12, 16, 'path'), 'cr-s22': p(22, 16, 'path'), 'cr-s25': p(25, 16, 'path'),
  'cr-pl-w': p(3, 22, 'path'), 'cr-pl-e': p(12, 22, 'path'),
  'cr-b03': p(3, 23, 'path'), 'cr-b12': p(12, 23, 'path'), 'cr-b22': p(22, 23, 'path'), 'cr-b25': p(25, 23, 'path'), 'cr-b37': p(37, 23, 'path'),
  'cr-r12': p(12, 26, 'path'), 'cr-r22': p(22, 26, 'path'), 'cr-r25': p(25, 26, 'path'), 'cr-r37': p(37, 26, 'path'),
};

type Link = readonly [string, string];
const chain = (...ids: string[]): Link[] => ids.slice(1).map((id, i) => [ids[i], id] as const);

const LINKS: readonly Link[] = [
  // Acera norte de la avenida, por el bordillo (la fila de fachada queda para el comercio), cruzando el Cruce por su paso.
  ...chain('EDGE_CR_NW', 'cr-n02', 'cr-n06', 'cr-n10', 'cr-n14', 'cr-n19', 'cr-xw-n', 'cr-n22', 'cr-n25', 'cr-xe-n', 'cr-n29', 'cr-n35', 'cr-n39',
    'CR_BUS_STOP', 'cr-n44', 'EDGE_CR_NE'),
  ['CR_RES_1_ENTRANCE', 'cr-n02'], ['CR_FRUIT_ENTRANCE', 'cr-n06'], ['CR_BAKERY_ENTRANCE', 'cr-n10'], ['CR_PHONE_ENTRANCE', 'cr-n14'],
  ['CR_PHARMACY_ENTRANCE', 'cr-n19'], ['CR_SUPER_ENTRANCE', 'cr-n29'], ['CR_RES_2_ENTRANCE', 'cr-n35'], ['CR_HILVANA_ENTRANCE', 'cr-n39'],
  ['CR_PIZZA_ENTRANCE', 'cr-n44'],
  ['CR_FRUIT_WINDOW', 'cr-n06'], ['CR_PHONE_WINDOW', 'cr-n14'], ['CR_HILVANA_WINDOW', 'cr-n39'],
  ['CR_MEET_01', 'CR_PIZZA_ENTRANCE'], ['CR_MEET_02', 'CR_PIZZA_ENTRANCE'],
  // Los dos pasos de la avenida, con semáforo.
  ['cr-xw-n', 'cr-xw-s'], ['cr-xe-n', 'cr-xe-s'],
  // Acera sur de la avenida, también por el bordillo.
  ...chain('EDGE_CR_SW', 'cr-s03', 'cr-s12', 'cr-s15', 'cr-s19', 'cr-xw-s', 'cr-s22', 'cr-s25', 'cr-xe-s', 'cr-s28', 'cr-s33', 'cr-s38', 'cr-s44', 'EDGE_CR_SE'),
  ['CR_GYM_ENTRANCE', 'cr-s15'], ['CR_BARBER_ENTRANCE', 'cr-s19'], ['CR_ARCADE_ENTRANCE', 'cr-s28'], ['CR_ABIERTO_ENTRANCE', 'cr-s33'],
  ['CR_BURGER_ENTRANCE', 'cr-s38'], ['CR_AMBAR_ENTRANCE', 'cr-s44'],
  ['CR_AMBAR_WINDOW', 'cr-s44'],
  ['CR_ARCADE_HANG_01', 'CR_ARCADE_ENTRANCE'], ['CR_ARCADE_HANG_02', 'CR_ARCADE_HANG_01'],
  // La plaza del metro: se baja por los dos lados de la boca.
  ['cr-s03', 'cr-pl-w'], ...chain('cr-pl-w', 'CR_METRO_ENTRANCE', 'cr-pl-e'), ['cr-pl-e', 'cr-s12'],
  ['CR_METRO_MEET_01', 'cr-pl-w'], ['CR_METRO_MEET_02', 'cr-pl-e'], ['CR_METRO_MEET_03', 'cr-pl-e'],
  ['CR_PLAZA_BENCH_02', 'cr-pl-e'], ['CR_PLAZA_BENCH_01', 'CR_PLAZA_BENCH_02'],
  // De la avenida a la Calle del Afluente: por la plaza y por las aceras del Cruce.
  ['cr-pl-w', 'cr-b03'], ['cr-pl-e', 'cr-b12'], ['cr-s22', 'cr-b22'], ['cr-s25', 'cr-b25'],
  // Calle del Afluente: acera norte, acera sur (con cada portal) y sus dos pasos de cebra.
  ...chain('EDGE_CR_BW', 'cr-b03', 'cr-b12', 'cr-b22', 'cr-b25', 'cr-b37', 'EDGE_CR_BE'),
  ...chain('EDGE_CR_RW', 'CR_AF_1_ENTRANCE', 'CR_AF_3_ENTRANCE', 'cr-r12', 'CR_SUSHI_ENTRANCE', 'CR_AF_7_ENTRANCE', 'cr-r22', 'cr-r25',
    'CR_AF_10_ENTRANCE', 'CR_AF_12_ENTRANCE', 'cr-r37', 'CR_AF_14_ENTRANCE', 'CR_AF_16_ENTRANCE', 'EDGE_CR_RE'),
  ['cr-b12', 'cr-r12'], ['cr-b37', 'cr-r37'],
];

/** Carril bus-taxi: autobuses y taxis, y algún coche suelto. `*`: lo que no se nombra. */
const BUS_LANE = { '*': 0.1, bus: 1, interurban: 1, taxi: 1.6, 'taxi-wagon': 1.6, 'taxi-suv': 1.6, 'taxi-hybrid': 1.6, service: 0.6 };
/** Carriles normales: de todo menos autobuses. */
const CAR_LANE = { bus: 0, interurban: 0 };
/** La calle de atrás: furgonetas, camiones de reparto y el de la basura; ningún autobús. */
const BACK_STREET = { bus: 0, interurban: 0, van: 2.5, 'small-truck': 2, 'delivery-truck': 1.3, garbage: 1.5, premium: 0.2 };

const BASE: LocationDef = {
  id: 'cuatro-rios',
  name: 'Cuatro Ríos',
  kind: 'exterior',
  ground: GROUND,
  buildings: BUILDINGS,
  props: PROPS,
  portals: [],
  npcs: [],
  spawns: {},
  points: POINTS,
  links: LINKS,
  // Identidad visual (data/districts.ts): ciudad densa, y la plaza del metro con su acero y su granito.
  district: 'dense',
  zones: [{ profile: 'transit', tx: 2, ty: 18, w: 11, h: 5 }],
  // Más tráfico y menos pulido que en ningún otro sitio: de 7:30 a 9:30 y de 17:00 a 20:00, cuatro por carril.
  traffic: {
    lanes: [
      { row: 11, dir: -1, bias: BUS_LANE }, { row: 12, dir: -1, bias: CAR_LANE },
      { row: 13, dir: 1, bias: CAR_LANE }, { row: 14, dir: 1, bias: CAR_LANE },
      { row: 24, dir: 1, bias: BACK_STREET, density: 0.6 },
    ],
    road: 'avenue',
    perLane: 3,
    hourly: [[0, 6, 1], [6, 7.5, 2], [7.5, 9.5, 4], [9.5, 17, 3], [17, 20, 4], [20, 23, 2], [23, 24, 1]],
    bikes: {
      lanes: [{ row: 10, dir: -1 }, { row: 15, dir: 1 }],
      road: 'avenue',
      perLane: 2,
      hourly: [[0, 6.5, 0], [6.5, 7.5, 1], [7.5, 9.5, 3], [9.5, 17, 2], [17, 20, 3], [20, 23, 1]],
      rainShy: 0.7,
    },
  },
  // Los dos pasos del cruce, con semáforo; desfasados, no cambian a la vez.
  signals: [
    { id: 'cruce-oeste', tx: 19, ty: 10, w: 3, h: 6 },
    { id: 'cruce-este', tx: 26, ty: 10, w: 3, h: 6, offset: 9_000 },
  ],
  inspects: [
    { tx: 41, ty: 8, name: 'Marquesina', lines: ['Líneas 14 y 27. La pantalla dice «3 min». Por una vez, parece verdad.'] },
    { tx: 25, ty: 4, name: 'Carga y descarga', lines: ['Placa azul: «Carga y descarga, laborables de 8 a 11». A las diez y media caben tres furgonetas y media.'] },
    { tx: 4, ty: 19, name: 'Plano del barrio', lines: ['Cuatro Ríos: la avenida, el Cruce y el Afluente. Alguien ha marcado con boli la mejor panadería. Hay tres círculos.'] },
  ],
  // Nombres para el mapa (tecla M).
  areas: [
    { name: 'Avenida de los Ríos', tx: 8, ty: 12 },
    { name: 'Calle del Cruce', tx: 23, ty: 4 },
    { name: 'Plaza del Metro', tx: 7, ty: 20 },
    { name: 'Calle del Afluente', tx: 30, ty: 24 },
  ],
};

export const CUATRO_RIOS: LocationDef = { ...BASE, finish: 'hd04', props: [...BASE.props, ...dress(BASE)] };
