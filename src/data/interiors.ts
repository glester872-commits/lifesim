import type { LocationDef, PointDef, PropKind, PropPlacement } from '../types/game.ts';

/**
 * Interiores del barrio Vallesco que sólo existen aquí. Cada uno sale a la
 * calle por el spawn que genera su edificio en data/vallesco.ts: la salida
 * siempre deja delante de la misma puerta.
 *
 * Hoy se entra, se recorre y se habla. Los puntos (GYM_TREADMILL_01,
 * CLOTHING_STORE_TILL...) marcan dónde se engancharán los sistemas que vengan;
 * ninguno finge hacer nada.
 */

/** Habitación cerrada: dos filas de muro arriba, una abajo y la puerta en la penúltima. */
function room(w: number, h: number, doorX: number, floor: (x: number, y: number) => string): string[] {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let r = '';
    for (let x = 0; x < w; x++) {
      if (y < 2 || y === h - 1 || x === 0 || x === w - 1) r += 'W';
      else if (y === h - 2) r += x === doorX ? 'D' : 'W';
      else r += floor(x, y);
    }
    rows.push(r);
  }
  return rows;
}

/** Puerta de salida y spawn de entrada de un interior de h filas. */
function exitTo(building: string, doorX: number, h: number): Pick<LocationDef, 'portals' | 'spawns'> {
  return {
    portals: [{ id: 'exit', tx: doorX, ty: h - 2, label: 'Salir a la calle', to: { location: 'district', spawn: building } }],
    spawns: { entry: { tx: doorX, ty: h - 3, facing: 'up' } },
  };
}

const at = (kind: PropKind, tx: number, ty: number): PropPlacement => ({ kind, tx, ty });
const many = (kind: PropKind, cells: readonly (readonly [number, number])[]): PropPlacement[] =>
  cells.map(([x, y]) => at(kind, x, y));
const p = (tx: number, ty: number, kind: PointDef['kind'], facing?: PointDef['facing']): PointDef => ({ tx, ty, kind, facing });

// ------------------------------------------------------------- gimnasio

export const GYM: LocationDef = {
  id: 'gym',
  name: 'Gimnasio Forja',
  kind: 'interior',
  // Suelo de caucho en la zona de entrenamiento; baldosa en recepción y vestuario.
  ground: room(22, 14, 10, (x, y) => (y <= 8 && x <= 13 ? 'm' : 't')),
  props: [
    // Pared de espejo corrida sobre la zona de cintas y pesas.
    ...many('mirror', [[1, 1], [3, 1], [5, 1], [7, 1], [9, 1]]),
    ...many('treadmill', [[2, 4], [4, 4], [6, 4]]),
    ...many('weights', [[11, 3], [12, 3]]),
    ...many('weight-bench', [[3, 7], [7, 7], [11, 7]]),
    at('lockers', 18, 3),
    ...many('counter', [[15, 10], [16, 10], [17, 10]]),
    at('cooler', 20, 10),
    ...many('plant', [[20, 3], [1, 11]]),
    // Neón de la casa, reloj de sala y tubos fluorescentes: luz fría de gimnasio.
    at('neon', 14, 1),
    at('clock', 18, 1),
    at('window', 11, 1),
    ...many('tube-light', [[2, 6], [7, 6], [12, 6], [16, 9]]),
  ],
  ambient: '#e2ebff',
  ...exitTo('gym-door', 10, 14),
  // Nadie colocado a mano: la gente la pone data/population.ts según la hora.
  npcs: [],
  points: {
    GYM_EXIT: p(10, 11, 'exit', 'up'),
    GYM_RECEPTION: p(16, 11, 'interact', 'up'),
    GYM_STAFF: p(16, 9, 'work', 'down'),
    GYM_TRAINING_ZONE: p(8, 6, 'meet'),
    GYM_TREADMILL_01: p(2, 5, 'interact', 'up'),
    GYM_TREADMILL_02: p(4, 5, 'interact', 'up'),
    GYM_TREADMILL_03: p(6, 5, 'interact', 'up'),
    GYM_WEIGHTS: p(11, 4, 'interact', 'up'),
    GYM_BENCH_01: p(3, 8, 'interact', 'up'),
    GYM_BENCH_02: p(7, 8, 'interact', 'up'),
    GYM_LOCKERS: p(18, 4, 'interact', 'up'),
    GYM_WATER: p(19, 10, 'interact', 'right'),
    GYM_WEIGHTS_02: p(12, 4, 'interact', 'up'),
    GYM_BENCH_03: p(11, 8, 'interact', 'up'),
    GYM_MAT_01: p(9, 5, 'interact'),
    GYM_MAT_02: p(5, 7, 'interact'),
    GYM_MAT_03: p(9, 8, 'interact'),
    GYM_MAT_04: p(13, 6, 'interact'),
    GYM_LOCKERS_02: p(19, 4, 'interact', 'up'),
    GYM_COACH_01: p(8, 3, 'work', 'down'),
    GYM_COACH_02: p(14, 6, 'work', 'left'),
  },
};

// -------------------------------------------------------- tienda de ropa

export const FASHION: LocationDef = {
  id: 'fashion',
  name: 'Hilo · moda',
  kind: 'interior',
  // Alfombra central: el recorrido entra, rodea los percheros y acaba en caja.
  ground: room(20, 13, 9, (x, y) => (y >= 5 && y <= 8 && x >= 6 && x <= 13 ? 'r' : 't')),
  props: [
    ...many('fitting-room', [[2, 3], [4, 3]]),
    at('mirror', 7, 1),
    ...many('clothes-rack', [[7, 4], [11, 4], [7, 8], [11, 8]]),
    at('counter', 15, 5),
    at('register', 16, 5),
    ...many('mannequin', [[2, 9], [17, 9]]),
    ...many('plant', [[18, 2], [18, 10]]),
    // Baldas con ropa doblada en la pared y focos cálidos sobre los percheros.
    ...many('wall-shelf', [[10, 1], [13, 1], [16, 1]]),
    at('painting', 4, 1),
    ...many('pendant', [[8, 5], [12, 5], [8, 9], [12, 9], [16, 6]]),
    // Mesa de novedades en mitad de la alfombra.
    at('display-table', 9, 6),
  ],
  ambient: '#fff3e2',
  ...exitTo('fashion-door', 9, 13),
  npcs: [],
  inspects: [
    { tx: 2, ty: 9, name: 'Escaparate', lines: ['Un abrigo de lana que cuesta lo que una semana de alquiler.'] },
  ],
  points: {
    CLOTHING_STORE_EXIT: p(9, 10, 'exit', 'up'),
    CLOTHING_STORE_TILL: p(16, 6, 'interact', 'up'),
    CLOTHING_STORE_STAFF: p(16, 4, 'work', 'down'),
    CLOTHING_STORE_RACK_01: p(7, 5, 'interact', 'up'),
    CLOTHING_STORE_RACK_02: p(11, 5, 'interact', 'up'),
    CLOTHING_STORE_RACK_03: p(7, 9, 'interact', 'up'),
    CLOTHING_STORE_RACK_04: p(11, 9, 'interact', 'up'),
    CLOTHING_STORE_FITTING_01: p(2, 4, 'interact', 'up'),
    CLOTHING_STORE_FITTING_02: p(4, 4, 'interact', 'up'),
    CLOTHING_STORE_MIRROR: p(8, 2, 'interact', 'up'),
    CLOTHING_STORE_WINDOW: p(2, 10, 'interact', 'up'),
    CLOTHING_STORE_RACK_05: p(8, 5, 'interact', 'up'),
    CLOTHING_STORE_RACK_06: p(12, 5, 'interact', 'up'),
    CLOTHING_STORE_RACK_07: p(8, 9, 'interact', 'up'),
    CLOTHING_STORE_RACK_08: p(12, 9, 'interact', 'up'),
    CLOTHING_STORE_QUEUE_01: p(16, 7, 'wait', 'up'),
    CLOTHING_STORE_QUEUE_02: p(16, 8, 'wait', 'up'),
    CLOTHING_STORE_FLOOR_01: p(10, 7, 'work'),
    CLOTHING_STORE_FLOOR_02: p(14, 9, 'work'),
  },
};

// ---------------------------------------------------------- supermercado

const GONDOLAS: [number, number][] = [];
for (const x of [7, 8, 12, 13, 17, 18]) for (let y = 5; y <= 8; y++) GONDOLAS.push([x, y]);

export const SUPERMARKET: LocationDef = {
  id: 'supermarket',
  name: 'Súper Rosales',
  kind: 'interior',
  ground: room(22, 14, 5, () => 't'),
  props: [
    ...many('fridge', Array.from({ length: 16 }, (_, i) => [3 + i, 3] as const)),
    ...many('gondola', GONDOLAS),
    ...many('produce', [[1, 6], [1, 7], [1, 8]]),
    at('register', 8, 10),
    at('counter', 9, 10),
    at('plant', 20, 11),
    // Luz de súper: tubos fríos sobre los pasillos y la caja.
    ...many('tube-light', [[7, 6], [12, 6], [17, 6], [2, 9], [8, 9]]),
  ],
  ambient: '#eef3f6',
  ...exitTo('super-door', 5, 14),
  terminals: [{ tx: 8, ty: 10, name: 'Caja · Súper Rosales', catalog: 'supermarket-till' }],
  npcs: [],
  points: {
    SUPERMARKET_EXIT: p(5, 11, 'exit', 'up'),
    SUPERMARKET_TILL: p(8, 11, 'interact', 'up'),
    SUPERMARKET_CASHIER: p(10, 10, 'work', 'left'),
    SUPERMARKET_AISLE_01: p(4, 6, 'interact'),
    SUPERMARKET_AISLE_02: p(10, 6, 'interact'),
    SUPERMARKET_AISLE_03: p(15, 6, 'interact'),
    SUPERMARKET_AISLE_04: p(20, 6, 'interact'),
    SUPERMARKET_FRIDGES: p(10, 4, 'interact', 'up'),
    SUPERMARKET_PRODUCE: p(2, 7, 'interact', 'left'),
    SUPERMARKET_AISLE_05: p(10, 8, 'interact'),
    SUPERMARKET_AISLE_06: p(15, 8, 'interact'),
    SUPERMARKET_AISLE_07: p(4, 8, 'interact'),
    SUPERMARKET_FRIDGES_02: p(15, 4, 'interact', 'up'),
    SUPERMARKET_FRIDGES_03: p(5, 4, 'interact', 'up'),
    SUPERMARKET_QUEUE_01: p(9, 11, 'wait', 'left'),
    SUPERMARKET_QUEUE_02: p(10, 11, 'wait', 'left'),
    SUPERMARKET_STOCK_01: p(15, 5, 'work'),
    SUPERMARKET_STOCK_02: p(10, 7, 'work'),
  },
};

// ------------------------------------------------------------ restaurante

const TABLES: [number, number][] = [[11, 4], [14, 4], [17, 4], [11, 7], [14, 7], [17, 7], [4, 8], [7, 8]];

export const RESTAURANT: LocationDef = {
  id: 'restaurant',
  name: 'Casa Tomás',
  kind: 'interior',
  // Barra y cocina al fondo (baldosa); comedor de madera.
  ground: room(20, 13, 10, (_x, y) => (y <= 3 ? 't' : 'f')),
  props: [
    ...many('shelf', [[2, 2], [3, 2], [7, 2]]),
    ...many('counter', [[2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4]]),
    ...many('table', TABLES),
    ...many('plant', [[1, 10], [18, 10]]),
    // Una lámpara cálida sobre cada mesa y dos sobre la barra.
    ...many('pendant', [...TABLES, [3, 5], [7, 5]]),
  ],
  ambient: '#ffe8cc',
  ...exitTo('restaurant-door', 10, 13),
  // Se pide en la barra: menú del día a mediodía, carta por la noche.
  spots: [{ tx: 5, ty: 4, name: 'Barra · Casa Tomás', activities: ['restaurant-lunch', 'restaurant-dinner'] }],
  npcs: [],
  points: {
    RESTAURANT_EXIT: p(10, 10, 'exit', 'up'),
    RESTAURANT_COUNTER: p(5, 5, 'interact', 'up'),
    RESTAURANT_STAFF: p(5, 3, 'work', 'down'),
    ...Object.fromEntries(
      TABLES.map(([x, y], i) => [`RESTAURANT_TABLE_${String(i + 1).padStart(2, '0')}`, p(x, y + 1, 'seat', 'up')]),
    ),
    // Segundo sitio de cada mesa, a su derecha.
    ...Object.fromEntries(
      TABLES.map(([x, y], i) => [`RESTAURANT_TABLE_${String(i + 9).padStart(2, '0')}`, p(x + 1, y, 'seat', 'left')]),
    ),
    RESTAURANT_WAIT_01: p(9, 9, 'wait', 'up'),
    RESTAURANT_WAIT_02: p(11, 9, 'wait', 'up'),
    RESTAURANT_WAITER_01: p(9, 6, 'work'),
    RESTAURANT_WAITER_02: p(16, 9, 'work'),
  },
};

// -------------------------------------------------------------- oficinas

const DESKS: [number, number][] = [[2, 3], [5, 3], [8, 3], [11, 3], [2, 6], [5, 6], [8, 6], [11, 6]];

export const OFFICE: LocationDef = {
  id: 'office',
  name: 'Edificio Atalaya · planta 3',
  kind: 'interior',
  // Oficina de techo de placas: blanco neutro, un punto frío.
  ambient: '#eef2f7',
  // Moqueta en la zona de puestos; el resto, vestíbulo.
  ground: room(22, 14, 4, (x, y) => (y <= 8 && x <= 13 ? 'o' : 't')),
  props: [
    ...many('desk', DESKS),
    at('meeting-table', 15, 5),
    ...many('shelf', [[18, 2], [19, 2]]),
    at('cooler', 20, 9),
    ...many('counter', [[7, 10], [8, 10]]),
    ...many('plant', [[13, 2], [1, 11], [20, 11]]),
  ],
  ...exitTo('office-door', 4, 14),
  npcs: [],
  points: {
    OFFICE_EXIT: p(4, 11, 'exit', 'up'),
    OFFICE_RECEPTION: p(7, 11, 'interact', 'up'),
    OFFICE_RECEPTIONIST: p(8, 9, 'work', 'down'),
    OFFICE_MEETING: p(16, 6, 'meet', 'up'),
    OFFICE_WATER: p(19, 9, 'interact', 'right'),
    OFFICE_MEETING_02: p(15, 4, 'meet', 'down'),
    OFFICE_MEETING_03: p(17, 4, 'meet', 'down'),
    OFFICE_MEETING_04: p(17, 6, 'meet', 'up'),
    OFFICE_BREAK_01: p(19, 10, 'interact', 'up'),
    ...Object.fromEntries(
      DESKS.map(([x, y], i) => [`OFFICE_DESK_${String(i + 1).padStart(2, '0')}`, p(x, y + 1, 'work', 'up')]),
    ),
  },
};

// ------------------------------------------------------------- discoteca

/** Sitios para bailar: la pista entera, apretada, con el pasillo de la puerta libre. */
const DANCE: [number, number][] = [
  [9, 5], [11, 5], [13, 5], [15, 5], [10, 6], [12, 6], [14, 6], [9, 7],
  [11, 7], [13, 7], [15, 7], [10, 8], [12, 8], [14, 8], [11, 9], [13, 9],
];
const TWO = (i: number): string => String(i + 1).padStart(2, '0');

export const CLUB: LocationDef = {
  id: 'club',
  name: 'Sala Órbita',
  kind: 'interior',
  // Barra con baldosa, pista de baile en el centro y caucho oscuro alrededor.
  ground: room(24, 15, 12, (x, y) => (x >= 9 && x <= 15 && y >= 5 && y <= 9 ? 'n' : x <= 8 && y <= 6 ? 't' : 'm')),
  props: [
    // Barra: botellero en la pared, mostrador corrido y dos colgantes cálidos.
    ...many('bottles', [[2, 1], [5, 1]]),
    ...many('counter', [[2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4]]),
    ...many('pendant', [[3, 5], [6, 5]]),
    // Cabina del DJ entre dos altavoces, con neones detrás.
    at('dj-booth', 11, 3),
    ...many('speaker', [[9, 3], [15, 3]]),
    ...many('neon', [[9, 1], [14, 1]]),
    // Zona de estar: mesas bajas, mesas altas para quedarse de pie y sofás contra la pared.
    ...many('table', [[19, 4], [19, 8]]),
    ...many('cafe-table', [[21, 6], [5, 9]]),
    ...many('sofa', [[18, 2], [21, 2]]),
    at('painting', 20, 1),
    ...many('plant', [[1, 11], [22, 11]]),
  ],
  ambient: '#a894d0',
  strobe: { tx: 9, ty: 5, w: 7, h: 5 },
  ...exitTo('club-door', 12, 15),
  npcs: [],
  points: {
    CLUB_EXIT: p(12, 12, 'exit', 'up'),
    CLUB_DOOR: p(14, 11, 'work', 'left'),
    CLUB_DJ: p(12, 2, 'work', 'down'),
    CLUB_BARTENDER_01: p(3, 3, 'work', 'down'),
    CLUB_BARTENDER_02: p(6, 3, 'work', 'down'),
    ...Object.fromEntries([2, 3, 4, 5, 6, 7].map((x, i) => [`CLUB_BAR_${TWO(i)}`, p(x, 5, 'interact', 'up')])),
    ...Object.fromEntries(DANCE.map(([x, y], i) => [`CLUB_DANCE_${TWO(i)}`, p(x, y, 'meet', 'up')])),
    CLUB_SEAT_01: p(19, 5, 'seat', 'up'),
    CLUB_SEAT_02: p(20, 4, 'seat', 'left'),
    CLUB_SEAT_03: p(19, 9, 'seat', 'up'),
    CLUB_SEAT_04: p(20, 8, 'seat', 'left'),
    CLUB_STAND_01: p(20, 6, 'meet', 'right'),
    CLUB_STAND_02: p(21, 7, 'meet', 'up'),
    CLUB_STAND_03: p(22, 6, 'meet', 'left'),
    CLUB_STAND_04: p(4, 9, 'meet', 'right'),
    CLUB_STAND_05: p(6, 9, 'meet', 'left'),
    CLUB_STAND_06: p(5, 10, 'meet', 'up'),
    // Corros al borde de la pista, a un lado y a otro: quien sale a descansar con la copa en la mano.
    CLUB_STAND_07: p(16, 5, 'meet', 'left'),
    CLUB_STAND_08: p(17, 6, 'meet', 'left'),
    CLUB_STAND_09: p(16, 7, 'meet', 'left'),
    CLUB_STAND_10: p(8, 8, 'meet', 'right'),
    CLUB_STAND_11: p(7, 9, 'meet', 'right'),
    CLUB_STAND_12: p(8, 10, 'meet', 'up'),
  },
};

// -------------------------------------------------------------- barbería

/** Sillones frente al espejo: el cliente se sienta encima mirando a la pared. */
const BARBER_CHAIRS: [number, number][] = [[3, 3], [6, 3], [9, 3]];

/**
 * Barbería Nati: tres sillones con su espejo, recepción con caja junto a la
 * puerta, sofá de espera y una balda de productos. Nati corta; con cola, entra
 * otro barbero. Se le habla para cortarse el pelo (data/services.ts, 'haircut').
 */
export const BARBERSHOP: LocationDef = {
  id: 'barbershop',
  name: 'Barbería Nati',
  kind: 'interior',
  ground: room(14, 11, 7, () => 't'),
  props: [
    ...many('mirror', BARBER_CHAIRS.map(([x]) => [x - 1, 1] as [number, number])),
    ...many('barber-chair', BARBER_CHAIRS),
    at('wall-shelf', 11, 1),
    at('clock', 1, 1),
    at('shelf', 12, 4),
    ...many('counter', [[10, 7], [11, 7]]),
    at('register', 11, 7),
    at('sofa', 1, 6),
    at('plant', 4, 7),
    // Luz cálida sobre cada sillón.
    ...many('pendant', BARBER_CHAIRS.map(([x, y]) => [x, y - 1] as [number, number])),
  ],
  ambient: '#fff1dc',
  ...exitTo('hair', 7, 11),
  npcs: [],
  points: {
    BARBER_EXIT: p(7, 8, 'exit', 'up'),
    ...Object.fromEntries(BARBER_CHAIRS.map(([x, y], i) => [`BARBER_CHAIR_${TWO(i)}`, p(x, y, 'seat', 'up')])),
    BARBER_STAFF_01: p(10, 5, 'work', 'left'),
    BARBER_STAFF_02: p(4, 5, 'work', 'up'),
    BARBER_RECEPTION: p(10, 8, 'interact', 'up'),
    BARBER_SHELF: p(11, 4, 'interact', 'right'),
    BARBER_WAIT_01: p(1, 7, 'seat', 'up'),
    BARBER_WAIT_02: p(2, 7, 'seat', 'up'),
    BARBER_WAIT_03: p(5, 8, 'wait', 'left'),
  },
};

// -------------------------------------------------------------- vinoteca

/** Mesas para dos; la del rincón, apartada y con lámpara de pie, es la de las citas. */
const WINE_TABLES: [number, number][] = [[9, 4], [12, 4], [9, 7]];
const WINE_DATE_TABLE: [number, number] = [12, 7];

/**
 * La Cepa: vinoteca pequeña donde estaba la obra. Barra con botelleros detrás,
 * taburetes, mesas para dos y una mesa del rincón pensada para las citas
 * (WINE_BAR_DATE_: ahí se sentarán los encuentros que vengan). Luz baja y
 * cálida. Se pide a quien atiende la barra (data/services.ts, 'wine-bar').
 */
export const WINE_BAR: LocationDef = {
  id: 'wine-bar',
  name: 'La Cepa · vinoteca',
  kind: 'interior',
  ground: room(16, 12, 8, () => 'f'),
  props: [
    ...many('wine-rack', [[1, 2], [2, 2], [4, 2], [5, 2], [14, 3], [14, 5]]),
    ...many('counter', [[1, 4], [2, 4], [3, 4], [4, 4], [5, 4]]),
    at('chalkboard', 7, 1),
    at('painting', 11, 1),
    ...many('cafe-table', [...WINE_TABLES, WINE_DATE_TABLE]),
    ...many('pendant', [[2, 5], [4, 5], ...WINE_TABLES]),
    at('floor-lamp', 14, 8),
    at('plant', 1, 8),
  ],
  ambient: '#ffd9b0',
  ...exitTo('wine-bar', 8, 12),
  npcs: [],
  points: {
    WINE_BAR_EXIT: p(8, 9, 'exit', 'up'),
    WINE_BAR_STAFF: p(3, 3, 'work', 'down'),
    WINE_BAR_WAITER: p(7, 6, 'work', 'right'),
    ...Object.fromEntries([1, 2, 4, 5].map((x, i) => [`WINE_BAR_STOOL_${TWO(i)}`, p(x, 5, 'seat', 'up')])),
    // Cada mesa, un sitio a cada lado, cara a cara.
    ...Object.fromEntries(
      WINE_TABLES.flatMap(([x, y], i) => [
        [`WINE_BAR_TABLE_${TWO(i * 2)}`, p(x - 1, y, 'seat', 'right')],
        [`WINE_BAR_TABLE_${TWO(i * 2 + 1)}`, p(x + 1, y, 'seat', 'left')],
      ]),
    ),
    WINE_BAR_DATE_01: p(WINE_DATE_TABLE[0] - 1, WINE_DATE_TABLE[1], 'seat', 'right'),
    WINE_BAR_DATE_02: p(WINE_DATE_TABLE[0] + 1, WINE_DATE_TABLE[1], 'seat', 'left'),
    // Quien ha quedado y espera, de pie cerca de la puerta, mirando quién entra.
    WINE_BAR_WAIT_01: p(6, 8, 'wait', 'down'),
    WINE_BAR_WAIT_02: p(10, 9, 'wait', 'down'),
  },
};

// -------------------------------------------------------------- farmacia

/**
 * Farmacia de barrio: mostrador de dispensación con la farmacéutica detrás,
 * baldas de medicamentos al fondo, dos expositores de parafarmacia a los lados
 * y luz fría de tubo. Se viene a por algo que quite el cansancio cuando no da
 * tiempo a dormir (data/catalogs.ts, 'pharmacy-counter').
 */
export const PHARMACY: LocationDef = {
  id: 'pharmacy',
  name: 'Farmacia',
  kind: 'interior',
  ground: room(12, 10, 6, () => 't'),
  props: [
    ...many('shelf', [[2, 2], [4, 2], [7, 2], [9, 2]]),
    ...many('counter', [[4, 4], [5, 4], [6, 4], [7, 4]]),
    at('register', 6, 4),
    ...many('gondola', [[1, 5], [1, 6], [10, 5], [10, 6]]),
    at('plant', 10, 7),
    at('clock', 6, 1),
    ...many('window', [[1, 1], [9, 1]]),
    ...many('tube-light', [[2, 4], [7, 4]]),
  ],
  ambient: '#eef6f2',
  ...exitTo('pharmacy', 6, 10),
  terminals: [{ tx: 5, ty: 4, name: 'Mostrador · Farmacia', catalog: 'pharmacy-counter' }],
  npcs: [],
  points: {
    PHARMACY_EXIT: p(6, 7, 'exit', 'up'),
    PHARMACY_STAFF: p(5, 3, 'work', 'down'),
    PHARMACY_COUNTER: p(5, 5, 'interact', 'up'),
    PHARMACY_QUEUE_01: p(5, 6, 'wait', 'up'),
    PHARMACY_QUEUE_02: p(4, 7, 'wait', 'up'),
    PHARMACY_SHELF_01: p(2, 5, 'interact', 'left'),
    PHARMACY_SHELF_02: p(9, 5, 'interact', 'right'),
    PHARMACY_SHELF_03: p(2, 6, 'interact', 'left'),
    PHARMACY_SHELF_04: p(9, 6, 'interact', 'right'),
  },
};

// ------------------------------------------------------- Calle del Carmen

/**
 * Tiendas de ropa de la Calle del Carmen. Las tres comparten esqueleto (probador,
 * percheros, caja con quien cobra al lado y cola) porque las tres son la misma
 * cosa para el juego: una tienda de data/retail.ts. Lo que cambia es lo que se
 * ve: suelo, luz y los muebles que dicen qué se vende. Quien cobra está junto a
 * la caja, en el suelo de la tienda: se le habla desde el sitio del cliente.
 */

/** Retales: vintage escogido. Madera, alfombra, maniquíes y luz cálida de lámpara de pie. */
export const RETALES: LocationDef = {
  id: 'retales',
  name: 'Retales · vintage',
  kind: 'interior',
  ground: room(16, 11, 8, (x, y) => (y >= 5 && y <= 6 && x >= 6 && x <= 10 ? 'r' : 'f')),
  props: [
    at('painting', 3, 1), at('mirror', 6, 1), at('wall-shelf', 10, 1), at('clock', 13, 1),
    at('fitting-room', 1, 3),
    ...many('clothes-rack', [[3, 4], [9, 3], [3, 7]]),
    at('display-table', 7, 4),
    ...many('mannequin', [[14, 3], [1, 7]]),
    ...many('counter', [[13, 6], [14, 6]]),
    at('register', 14, 6),
    at('floor-lamp', 14, 8),
    ...many('pendant', [[4, 5], [9, 5], [12, 4]]),
  ],
  ambient: '#ffe2bc',
  ...exitTo('carmen-retales', 8, 11),
  npcs: [],
  inspects: [{ tx: 1, ty: 7, name: 'Maniquí', lines: ['Un traje de chaqueta de los ochenta con hombreras de verdad. No está a la venta: es de Gus.'] }],
  points: {
    RETALES_EXIT: p(8, 8, 'exit', 'up'),
    RETALES_STAFF: p(12, 6, 'work', 'down'),
    RETALES_TILL: p(12, 7, 'interact', 'up'),
    RETALES_QUEUE_01: p(11, 8, 'wait', 'up'),
    RETALES_RACK_01: p(3, 5, 'interact', 'up'),
    RETALES_RACK_02: p(9, 4, 'interact', 'up'),
    RETALES_RACK_03: p(3, 8, 'interact', 'up'),
    RETALES_RACK_04: p(14, 4, 'interact', 'up'),
    RETALES_TABLE: p(7, 5, 'interact', 'up'),
    RETALES_FITTING_01: p(1, 4, 'interact', 'up'),
    RETALES_MIRROR: p(6, 2, 'interact', 'up'),
    RETALES_FLOOR_01: p(10, 7, 'work'),
  },
};

/** Archivo: streetwear y colección. Hormigón, tubos fríos, pared de zapatillas y un neón. */
export const ARCHIVO: LocationDef = {
  id: 'archivo',
  name: 'Archivo · streetwear',
  kind: 'interior',
  ground: room(16, 11, 8, () => 't'),
  props: [
    ...many('sneaker-wall', [[2, 1], [5, 1], [10, 1]]),
    at('neon', 13, 1),
    at('fitting-room', 1, 3),
    ...many('clothes-rack', [[3, 4], [10, 4], [3, 7]]),
    at('display-table', 7, 5),
    at('mannequin', 14, 3),
    ...many('counter', [[13, 6], [14, 6]]),
    at('register', 14, 6),
    ...many('tube-light', [[3, 5], [10, 5]]),
  ],
  ambient: '#e4f2ff',
  ...exitTo('carmen-archivo', 8, 11),
  npcs: [],
  inspects: [{ tx: 5, ty: 2, name: 'Pared de zapatillas', lines: ['Las de arriba no tienen precio. Si preguntas, es que no son para ti.'] }],
  points: {
    ARCHIVO_EXIT: p(8, 8, 'exit', 'up'),
    ARCHIVO_STAFF: p(12, 6, 'work', 'down'),
    ARCHIVO_TILL: p(12, 7, 'interact', 'up'),
    ARCHIVO_QUEUE_01: p(11, 8, 'wait', 'up'),
    ARCHIVO_RACK_01: p(3, 5, 'interact', 'up'),
    ARCHIVO_RACK_02: p(3, 8, 'interact', 'up'),
    ARCHIVO_RACK_03: p(10, 5, 'interact', 'up'),
    ARCHIVO_WALL_01: p(2, 2, 'interact', 'up'),
    ARCHIVO_WALL_02: p(11, 2, 'interact', 'up'),
    ARCHIVO_TABLE: p(7, 6, 'interact', 'up'),
    ARCHIVO_FITTING_01: p(1, 4, 'interact', 'up'),
    ARCHIVO_FLOOR_01: p(10, 7, 'work'),
  },
};

/** Segunda Vuelta: ropa al peso. Cajones revueltos, pizarra de precios y luz de tubo. */
export const VUELTA: LocationDef = {
  id: 'vuelta',
  name: 'Segunda Vuelta',
  kind: 'interior',
  ground: room(16, 11, 8, () => 't'),
  props: [
    at('chalkboard', 6, 1), at('wall-shelf', 10, 1), at('clock', 3, 1),
    at('fitting-room', 1, 3),
    ...many('bargain-bin', [[3, 4], [3, 7], [9, 7]]),
    ...many('clothes-rack', [[9, 3], [12, 3]]),
    ...many('counter', [[13, 6], [14, 6]]),
    at('register', 14, 6),
    at('plant', 14, 8),
    ...many('tube-light', [[4, 5], [9, 5]]),
  ],
  ambient: '#f4f6e8',
  ...exitTo('carmen-vuelta', 8, 11),
  npcs: [],
  inspects: [{ tx: 6, ty: 2, name: 'Pizarra', lines: ['«Al peso: 12 € el kilo. Por prenda: lo que diga la etiqueta. Lo que no se vende, se dona.»'] }],
  points: {
    VUELTA_EXIT: p(8, 8, 'exit', 'up'),
    VUELTA_STAFF: p(12, 6, 'work', 'down'),
    VUELTA_TILL: p(12, 7, 'interact', 'up'),
    VUELTA_QUEUE_01: p(11, 8, 'wait', 'up'),
    VUELTA_BIN_01: p(3, 5, 'interact', 'up'),
    VUELTA_BIN_02: p(3, 8, 'interact', 'up'),
    VUELTA_BIN_03: p(9, 8, 'interact', 'up'),
    VUELTA_RACK_01: p(9, 4, 'interact', 'up'),
    VUELTA_RACK_02: p(12, 4, 'interact', 'up'),
    VUELTA_FITTING_01: p(1, 4, 'interact', 'up'),
    VUELTA_FLOOR_01: p(7, 6, 'work'),
  },
};

/** Camillas del estudio: quien se tatúa se sienta encima, junto a su carrito. */
const TATTOO_CHAIRS: [number, number][] = [[4, 3], [9, 3]];

/**
 * Tinta Carmen: estudio de tatuaje. Recepción con mostrador junto a la puerta,
 * sofá de espera, dos camillas con su carrito y su flexo, y las paredes llenas
 * de flash (los diseños que se ofrecen: data/tattoos.ts). Lía tatúa; con cola,
 * entra otra tatuadora. Se le habla para tatuarse (data/services.ts, 'tattoo').
 */
export const TINTA: LocationDef = {
  id: 'tinta',
  name: 'Tinta Carmen · tatuajes',
  kind: 'interior',
  ground: room(16, 12, 8, () => 't'),
  props: [
    ...many('flash-wall', [[1, 1], [12, 1]]),
    at('neon', 7, 1), at('painting', 14, 1),
    ...many('tattoo-chair', TATTOO_CHAIRS),
    ...many('tattoo-cart', TATTOO_CHAIRS.map(([x, y]) => [x + 1, y] as [number, number])),
    ...many('pendant', TATTOO_CHAIRS.map(([x, y]) => [x, y - 1] as [number, number])),
    at('sofa', 1, 7),
    at('plant', 1, 5),
    ...many('counter', [[12, 8], [13, 8]]),
    at('register', 13, 8),
    at('floor-lamp', 14, 5),
  ],
  ambient: '#ffd6ea',
  ...exitTo('carmen-tinta', 8, 12),
  npcs: [],
  inspects: [{ tx: 7, ty: 2, name: 'Neón', lines: ['«Nada de nombres de pareja». Debajo, a boli: «Ya, ya».'] }],
  points: {
    TINTA_EXIT: p(8, 9, 'exit', 'up'),
    ...Object.fromEntries(TATTOO_CHAIRS.map(([x, y], i) => [`TINTA_CHAIR_${TWO(i)}`, p(x, y, 'seat', 'up')])),
    TINTA_ARTIST_01: p(6, 5, 'work', 'left'),
    TINTA_ARTIST_02: p(11, 5, 'work', 'left'),
    TINTA_DESK: p(14, 8, 'work', 'left'),
    TINTA_RECEPTION: p(12, 9, 'interact', 'up'),
    TINTA_FLASH_01: p(1, 2, 'interact', 'up'),
    TINTA_FLASH_02: p(12, 2, 'interact', 'up'),
    TINTA_WAIT_01: p(1, 8, 'seat', 'up'),
    TINTA_WAIT_02: p(2, 8, 'seat', 'up'),
    TINTA_WAIT_03: p(4, 9, 'wait', 'left'),
  },
};

/** Café Molinillo: barra corta con cafetera y vitrina, cuatro sitios y la pizarra del día. */
const MOLINILLO_TABLES: [number, number][] = [[8, 4], [8, 7]];

export const MOLINILLO: LocationDef = {
  id: 'molinillo',
  name: 'Café Molinillo',
  kind: 'interior',
  ground: room(12, 10, 6, () => 'f'),
  props: [
    ...many('counter', [[1, 4], [2, 4], [3, 4], [4, 4]]),
    at('espresso', 2, 4), at('pastry-case', 4, 4),
    at('chalkboard', 1, 1), at('window', 8, 1),
    ...many('cafe-table', MOLINILLO_TABLES),
    ...many('pendant', MOLINILLO_TABLES.map(([x, y]) => [x, y - 1] as [number, number])),
    at('plant', 10, 3),
  ],
  ambient: '#ffe6c8',
  ...exitTo('carmen-molinillo', 6, 10),
  terminals: [{ tx: 3, ty: 4, name: 'Barra · Molinillo', catalog: 'cafe-counter' }],
  npcs: [],
  points: {
    MOLINILLO_EXIT: p(6, 7, 'exit', 'up'),
    MOLINILLO_STAFF: p(2, 3, 'work', 'down'),
    MOLINILLO_COUNTER: p(3, 5, 'interact', 'up'),
    MOLINILLO_QUEUE_01: p(4, 6, 'wait', 'up'),
    ...Object.fromEntries(
      MOLINILLO_TABLES.flatMap(([x, y], i) => [
        [`MOLINILLO_TABLE_${TWO(i * 2)}`, p(x - 1, y, 'seat', 'right')],
        [`MOLINILLO_TABLE_${TWO(i * 2 + 1)}`, p(x + 1, y, 'seat', 'left')],
      ]),
    ),
  },
};
