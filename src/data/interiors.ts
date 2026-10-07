import type { LocationDef, PointDef, PropKind, PropPlacement, TableDef } from '../types/game.ts';
import type { StationId } from './stations.ts';
import { seatsFurniture } from './seating.ts';

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
export function room(w: number, h: number, doorX: number, floor: (x: number, y: number) => string): string[] {
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

export const at = (kind: PropKind, tx: number, ty: number): PropPlacement => ({ kind, tx, ty });
export const many = (kind: PropKind, cells: readonly (readonly [number, number])[]): PropPlacement[] =>
  cells.map(([x, y]) => at(kind, x, y));
export const p = (tx: number, ty: number, kind: PointDef['kind'], facing?: PointDef['facing']): PointDef => ({ tx, ty, kind, facing });
/** Número de dos cifras para ids de puntos en serie: 0 → '01'. */
export const TWO = (i: number): string => String(i + 1).padStart(2, '0');

// ------------------------------------------------------------- gimnasio

/** Puesto de uso (data/stations.ts) en un punto: sobre la máquina si se sube, delante si no. */
const use = (tx: number, ty: number, station: StationId, facing: PointDef['facing']): PointDef => ({ tx, ty, kind: 'interact', facing, use: station });
/** Máquinas iguales y su punto encima de cada una, numerados: PREFIX_01, PREFIX_02... */
function machines(kind: PropKind, prefix: string, station: StationId, facing: PointDef['facing'], cells: readonly (readonly [number, number])[]) {
  return {
    props: many(kind, cells),
    points: Object.fromEntries(cells.map(([x, y], i) => [`${prefix}${TWO(i)}`, use(x, y, station, facing)])),
  };
}

const TREADMILLS = machines('treadmill', 'GYM_TREADMILL_', 'treadmill', 'up', [[2, 3], [4, 3], [6, 3], [8, 3]]);
const BIKES = machines('exercise-bike', 'GYM_BIKE_', 'bike', 'up', [[2, 6], [4, 6], [6, 6]]);
const ROWERS = machines('rower', 'GYM_ROW_', 'rower', 'right', [[2, 9], [5, 9]]);
// En el banco se sienta mirando a la sala y se tumba con la cabeza hacia la jaula.
const BENCHES = machines('bench-press', 'GYM_BENCH_', 'bench-press', 'down', [[13, 3], [15, 3]]);
const RACKS = machines('squat-rack', 'GYM_SQUAT_', 'squat-rack', 'up', [[11, 3]]);
const MATS: [number, number][] = [[10, 10], [11, 10], [12, 10], [13, 10]];

// Vestuarios: un ala a la derecha del gimnasio, con su propia pared y una puerta a cada uno desde la sala (x = 25).
// El de hombres, arriba; el de mujeres, debajo, con un muro entre los dos. Dentro de cada uno, de norte a sur:
// taquillas con sus puntos de cambio delante, un pasillo, y al fondo los bancos, el aseo y los cubículos de ducha
// (muros de media altura entre ellos). Las duchas y los lavabos están dentro, nunca junto a las máquinas.
const GYM_W = 42;
const GYM_H = 17;
const WING_X0 = 26;
const WING_X1 = 40;
/** Primera fila de suelo de cada vestuario: arriba, el de hombres; debajo del muro de la fila 8, el de mujeres. */
const LOCKER_TOP: Readonly<Record<'M' | 'F', number>> = { M: 2, F: 9 };

/** Suelo del gimnasio: la sala, el vestíbulo de baldosa y el ala de vestuarios con sus muros, puertas y cubículos. */
function gymGround(): string[] {
  const rows = room(GYM_W, GYM_H, 18, (x, y) => (x <= 17 && y <= 12 ? 'm' : 't')).map((r) => r.split(''));
  const set = (x: number, y: number, c: string): void => {
    rows[y][x] = c;
  };
  // El muro entre la sala y el ala, con una puerta a cada vestuario; y el muro que separa un vestuario del otro.
  for (let y = 2; y <= GYM_H - 3; y++) set(25, y, 'W');
  for (const side of ['M', 'F'] as const) set(25, LOCKER_TOP[side] + 2, 'D');
  for (let x = WING_X0; x <= WING_X1; x++) set(x, 8, 'W');
  // Medios muros (de la fila 4 a la 5 de cada vestuario): entre cubículos de ducha y alrededor del aseo.
  for (const side of ['M', 'F'] as const) {
    for (const x of [26, 28, 33, 35, 37, 39]) for (const dy of [4, 5]) set(x, LOCKER_TOP[side] + dy, 'W');
  }
  return rows.map((r) => r.join(''));
}

/** Un vestuario: sus taquillas con los puntos de cambio, lavabos con espejo, bancos, aseo y cuatro duchas. */
function lockerRoom(side: 'M' | 'F') {
  const y0 = LOCKER_TOP[side];
  const props: PropPlacement[] = [
    // Taquillas contra la pared del fondo (la fila base es la y0 + 1); los puntos de cambio, delante de cada tile.
    ...many('lockers', [[27, y0 + 1], [29, y0 + 1], [31, y0 + 1], [33, y0 + 1]]),
    // Lavabos con su espejo en la pared de encima.
    ...many('mirror', [[36, y0 - 1], [38, y0 - 1]]),
    ...many('sink', [[36, y0], [38, y0]]),
    // Banco corrido al fondo, el aseo en su cubículo y una ducha al fondo de cada cubículo.
    ...many('bench', [[29, y0 + 5], [30, y0 + 5], [31, y0 + 5], [32, y0 + 5]]),
    at('toilet', 27, y0 + 5),
    ...many('shower', [[34, y0 + 5], [36, y0 + 5], [38, y0 + 5], [40, y0 + 5]]),
    ...many('tube-light', [[28, y0 + 3], [33, y0 + 3], [38, y0 + 3]]),
    at(side === 'M' ? 'sign-men' : 'sign-women', 25, y0 + 1),
  ];
  const points: Record<string, PointDef> = {};
  for (let i = 0; i < 8; i++) points[`GYM_CHANGE_${side}_${TWO(i)}`] = p(27 + i, y0 + 2, 'work', 'up');
  for (let i = 0; i < 4; i++) points[`GYM_SHOWER_${side}_${TWO(i)}`] = p(34 + i * 2, y0 + 4, 'work', 'down');
  return { props, points };
}
const MEN = lockerRoom('M');
const WOMEN = lockerRoom('F');

/**
 * Gimnasio Forja. Cardio a la izquierda frente al espejo (cintas, bicis y
 * remos), peso libre a la derecha (jaula, dos bancos de press, polea y el
 * estante de mancuernas), esterillas para estirar, y recepción y fuente en la
 * parte de baldosa. Cada máquina es un puesto de data/stations.ts: quien la
 * usa se sube, y nadie más la coge. A la derecha, detrás de su pared y su
 * puerta, los vestuarios de hombres y de mujeres, cada uno con sus taquillas,
 * lavabos, aseo y duchas (GYM_CHANGE_M_, GYM_CHANGE_F_, GYM_SHOWER_M_...): la
 * gente entra vestida de calle, se cambia ahí y sale a entrenar
 * (systems/Crowd, data/population.ts).
 */
export const GYM: LocationDef = {
  id: 'gym',
  name: 'Gimnasio Forja',
  kind: 'interior',
  // Caucho en la sala; baldosa en recepción y vestuario.
  ground: gymGround(),
  props: [
    // Espejo corrido detrás del cardio y del peso libre; la jaula y la polea, delante de él.
    ...many('mirror', [[1, 1], [3, 1], [5, 1], [7, 1], [9, 1], [11, 1], [13, 1], [15, 1]]),
    at('gym-sign', 17, 1),
    at('clock', 20, 1),
    at('window', 21, 1),
    at('chalkboard', 23, 1),
    ...TREADMILLS.props,
    ...BIKES.props,
    ...ROWERS.props,
    ...RACKS.props,
    ...BENCHES.props,
    at('cable-machine', 17, 3),
    at('weights', 11, 7),
    at('plate-tree', 10, 6),
    at('kettlebells', 15, 7),
    ...many('yoga-mat', MATS),
    // Lo que deja la gente por ahí: toallas, botellas y un disco suelto; y las bolsas junto a las taquillas.
    ...many('gym-towel', [[5, 4], [14, 9], [8, 8], [3, 11]]),
    at('gym-bags', 19, 5),
    ...MEN.props,
    ...WOMEN.props,
    ...many('counter', [[20, 10], [21, 10], [22, 10]]),
    at('cooler', 24, 9),
    ...many('plant', [[24, 6], [1, 12]]),
    // Tubos fluorescentes sobre los pasillos (cuelgan por delante de la gente: nunca encima de una máquina).
    ...many('tube-light', [[3, 5], [7, 5], [3, 8], [7, 8], [12, 5], [15, 6], [11, 12], [21, 7]]),
  ],
  ambient: '#e2ebff',
  ...exitTo('gym-door', 18, GYM_H),
  // Nadie colocado a mano: la gente la pone data/population.ts según la hora.
  npcs: [],
  points: {
    GYM_EXIT: p(18, 14, 'exit', 'up'),
    GYM_RECEPTION: p(21, 11, 'interact', 'up'),
    GYM_STAFF: p(21, 9, 'work', 'down'),
    GYM_TRAINING_ZONE: p(9, 8, 'meet'),
    ...TREADMILLS.points,
    ...BIKES.points,
    ...ROWERS.points,
    ...BENCHES.points,
    ...RACKS.points,
    GYM_CABLE_01: use(17, 4, 'cable', 'up'),
    GYM_WEIGHTS_01: use(11, 8, 'dumbbells', 'up'),
    GYM_WEIGHTS_02: use(12, 8, 'dumbbells', 'up'),
    GYM_WEIGHTS_03: use(13, 8, 'dumbbells', 'up'),
    ...Object.fromEntries(MATS.map(([x, y], i) => [`GYM_MAT_${TWO(i)}`, use(x, y, 'stretch', 'down')])),
    GYM_WATER: use(23, 9, 'water', 'right'),
    // Un rato de charla entre series: dos puntos de cara.
    GYM_CHAT_01: p(15, 10, 'meet', 'right'),
    GYM_CHAT_02: p(16, 10, 'meet', 'left'),
    // Descanso de pie, con el móvil, junto a la pared.
    GYM_REST_01: p(8, 12, 'wait', 'up'),
    GYM_REST_02: p(14, 12, 'wait', 'up'),
    GYM_REST_03: p(17, 8, 'wait', 'left'),
    ...MEN.points,
    ...WOMEN.points,
    GYM_COACH_01: p(9, 4, 'work', 'down'),
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
  racks: [
    { tx: 7, ty: 5, name: 'Perchero de abrigos', store: 'hilo', categories: ['chaqueta'] },
    { tx: 11, ty: 5, name: 'Camisas y camisetas', store: 'hilo', categories: ['camisa', 'camiseta'] },
    { tx: 7, ty: 9, name: 'Pantalones', store: 'hilo', categories: ['pantalon', 'vaquero'] },
    { tx: 11, ty: 9, name: 'Novedades', store: 'hilo' },
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
/** Dos sitios por mesa, delante y a su derecha, cada uno con su silla (data/seating.ts). */
const RESTAURANT_SEATS: Record<string, PointDef> = {
  ...Object.fromEntries(TABLES.map(([x, y], i) => [`RESTAURANT_TABLE_${TWO(i)}`, p(x, y + 1, 'seat', 'up')])),
  ...Object.fromEntries(TABLES.map(([x, y], i) => [`RESTAURANT_TABLE_${TWO(i + 8)}`, p(x + 1, y, 'seat', 'left')])),
};
/** Cada mesa con sus dos sillas y el tile de su izquierda, donde se para quien atiende (systems/TableService). */
const RESTAURANT_TABLES: TableDef[] = TABLES.map(([x, y], i) => ({
  id: `MESA_${TWO(i)}`,
  seats: [`RESTAURANT_TABLE_${TWO(i)}`, `RESTAURANT_TABLE_${TWO(i + 8)}`],
  service: { tx: x - 1, ty: y },
}));

export const RESTAURANT: LocationDef = {
  id: 'restaurant',
  name: 'Casa Tomás',
  kind: 'interior',
  // Barra y cocina al fondo (baldosa); comedor de madera.
  ground: room(20, 13, 10, (_x, y) => (y <= 3 ? 't' : 'f')),
  props: [
    // Cocina detrás de la barra: fogones con sus ollas y baldas; lo que sale, al pase (el final de la barra).
    ...many('shelf', [[2, 2], [3, 2], [7, 2]]),
    at('stove', 4, 2),
    ...many('counter', [[2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4]]),
    // Mesas con mantel: el comedor de un restaurante de toda la vida.
    ...many('dining-table', TABLES),
    ...seatsFurniture(RESTAURANT_SEATS),
    ...many('plant', [[1, 10], [18, 10]]),
    // Una lámpara cálida sobre cada mesa y dos sobre la barra.
    ...many('pendant', [...TABLES, [3, 5], [7, 5]]),
  ],
  ambient: '#ffe8cc',
  ...exitTo('restaurant-door', 10, 13),
  // Se pide en la barra: menú del día a mediodía, carta por la noche.
  spots: [{ tx: 5, ty: 4, name: 'Barra · Casa Tomás', activities: ['restaurant-lunch', 'restaurant-dinner'] }],
  // Servicio de mesa (data/population.ts: tableService): sentarse a una mesa es pedir que te atiendan.
  tables: RESTAURANT_TABLES,
  npcs: [],
  points: {
    RESTAURANT_EXIT: p(10, 10, 'exit', 'up'),
    RESTAURANT_COUNTER: p(5, 5, 'interact', 'up'),
    RESTAURANT_STAFF: p(5, 3, 'work', 'down'),
    // El pase: donde recoge el camarero lo que sale de cocina y deja la vajilla sucia.
    RESTAURANT_PASS: p(8, 5, 'interact', 'up'),
    ...RESTAURANT_SEATS,
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

/** Sillas de las mesas bajas de la zona de estar. */
const CLUB_SEATS: Record<string, PointDef> = {
  CLUB_SEAT_01: p(19, 5, 'seat', 'up'),
  CLUB_SEAT_02: p(20, 4, 'seat', 'left'),
  CLUB_SEAT_03: p(19, 9, 'seat', 'up'),
  CLUB_SEAT_04: p(20, 8, 'seat', 'left'),
};

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
    ...seatsFurniture(CLUB_SEATS),
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
    ...CLUB_SEATS,
    // Los sofás de la pared, dos plazas cada uno.
    CLUB_SOFA_01: p(18, 2, 'seat', 'down'),
    CLUB_SOFA_02: p(19, 2, 'seat', 'down'),
    CLUB_SOFA_03: p(21, 2, 'seat', 'down'),
    CLUB_SOFA_04: p(22, 2, 'seat', 'down'),
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
    // Esperando en el sofá, dos plazas.
    BARBER_WAIT_01: p(1, 6, 'seat', 'down'),
    BARBER_WAIT_02: p(2, 6, 'seat', 'down'),
    BARBER_WAIT_03: p(5, 8, 'wait', 'left'),
  },
};

// -------------------------------------------------------------- vinoteca

/** Mesas para dos; la del rincón, apartada y con lámpara de pie, es la de las citas. */
const WINE_TABLES: [number, number][] = [[9, 4], [12, 4], [9, 7]];
const WINE_DATE_TABLE: [number, number] = [12, 7];
/** Taburetes de la barra, mirando a ella. */
const WINE_STOOLS: Record<string, PointDef> = Object.fromEntries([1, 2, 4, 5].map((x, i) => [`WINE_BAR_STOOL_${TWO(i)}`, p(x, 5, 'seat', 'up')]));
/** Cada mesa, una silla a cada lado, cara a cara; la de las citas, igual. */
const WINE_SEATS: Record<string, PointDef> = {
  ...Object.fromEntries(
    WINE_TABLES.flatMap(([x, y], i) => [
      [`WINE_BAR_TABLE_${TWO(i * 2)}`, p(x - 1, y, 'seat', 'right')],
      [`WINE_BAR_TABLE_${TWO(i * 2 + 1)}`, p(x + 1, y, 'seat', 'left')],
    ]),
  ),
  WINE_BAR_DATE_01: p(WINE_DATE_TABLE[0] - 1, WINE_DATE_TABLE[1], 'seat', 'right'),
  WINE_BAR_DATE_02: p(WINE_DATE_TABLE[0] + 1, WINE_DATE_TABLE[1], 'seat', 'left'),
};

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
    ...seatsFurniture(WINE_STOOLS, 'stool'),
    ...seatsFurniture(WINE_SEATS),
    ...many('pendant', [[2, 5], [4, 5], ...WINE_TABLES]),
    at('floor-lamp', 14, 8),
    at('plant', 1, 8),
  ],
  ambient: '#ffd9b0',
  ...exitTo('wine-bar', 8, 12),
  // Servicio de mesa (data/population.ts: tableService, carta 'la-cepa'): cada mesa, sus dos sillas y,
  // debajo, el sitio donde se para quien atiende. La barra (taburetes) sigue siendo de pedir a Bruno.
  tables: [...WINE_TABLES, WINE_DATE_TABLE].map(([x, y], i) => ({
    id: i < WINE_TABLES.length ? `MESA_${TWO(i)}` : 'MESA_CITAS',
    seats: i < WINE_TABLES.length ? [`WINE_BAR_TABLE_${TWO(i * 2)}`, `WINE_BAR_TABLE_${TWO(i * 2 + 1)}`] : ['WINE_BAR_DATE_01', 'WINE_BAR_DATE_02'],
    service: { tx: x, ty: y + 1 },
  })),
  npcs: [],
  points: {
    WINE_BAR_EXIT: p(8, 9, 'exit', 'up'),
    WINE_BAR_STAFF: p(3, 3, 'work', 'down'),
    // El pase: el final de la barra, donde el camarero recoge las copas y las tablas y deja lo recogido.
    WINE_BAR_PASS: p(6, 4, 'interact', 'left'),
    WINE_BAR_WAITER: p(7, 6, 'work', 'right'),
    ...WINE_STOOLS,
    ...WINE_SEATS,
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
  racks: [
    { tx: 3, ty: 5, name: 'Chaquetas y jerséis', store: 'retales', categories: ['chaqueta', 'sudadera'] },
    { tx: 9, ty: 4, name: 'Camisas', store: 'retales', categories: ['camisa', 'camiseta'] },
    { tx: 3, ty: 8, name: 'Pantalones', store: 'retales', categories: ['pantalon', 'vaquero'] },
    { tx: 7, ty: 5, name: 'Mesa de piezas', store: 'retales' },
  ],
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
  racks: [
    { tx: 3, ty: 5, name: 'Sudaderas y chaquetas', store: 'archivo', categories: ['sudadera', 'chaqueta'] },
    { tx: 10, ty: 5, name: 'Camisetas', store: 'archivo', categories: ['camiseta'] },
    { tx: 3, ty: 8, name: 'Pantalones', store: 'archivo', categories: ['pantalon'] },
  ],
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
  racks: [
    { tx: 3, ty: 5, name: 'Cajón de camisetas', store: 'vuelta', categories: ['camiseta'] },
    { tx: 3, ty: 8, name: 'Cajón de pantalones', store: 'vuelta', categories: ['pantalon', 'vaquero'] },
    { tx: 9, ty: 4, name: 'Perchero de camisas', store: 'vuelta', categories: ['camisa', 'chaqueta'] },
  ],
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

/** Suela: zapatillas de calle y de colección. Paredes de calzado, vitrina de ediciones y luz cálida de escaparate. */
export const SUELA: LocationDef = {
  id: 'suela',
  name: 'Suela · zapatillas',
  kind: 'interior',
  ground: room(16, 11, 8, (x, y) => (y >= 5 && y <= 7 && x >= 3 && x <= 10 ? 'r' : 't')),
  props: [
    ...many('sneaker-wall', [[2, 1], [5, 1], [8, 1], [11, 1]]),
    at('neon', 14, 1),
    ...many('display-table', [[4, 5], [9, 5]]),
    ...many('counter', [[13, 6], [14, 6]]),
    at('register', 14, 6),
    at('plant', 14, 8),
    ...many('tube-light', [[3, 4], [10, 4]]),
  ],
  ambient: '#fff0dc',
  ...exitTo('carmen-suela', 8, 11),
  npcs: [],
  inspects: [{ tx: 6, ty: 3, name: 'Pizarra', lines: ['«Sorteo el sábado. No se reserva.»'] }],
  racks: [
    { tx: 2, ty: 2, name: 'Pared de zapatillas', store: 'suela', categories: ['zapatillas'] },
    { tx: 8, ty: 2, name: 'Estante de calzado', store: 'suela', categories: ['zapatos'] },
    { tx: 4, ty: 6, name: 'Vitrina de ediciones', store: 'suela' },
  ],
  points: {
    SUELA_EXIT: p(8, 8, 'exit', 'up'),
    SUELA_STAFF: p(12, 6, 'work', 'down'),
    SUELA_TILL: p(12, 7, 'interact', 'up'),
    SUELA_QUEUE_01: p(11, 8, 'wait', 'up'),
    SUELA_WALL_01: p(2, 2, 'interact', 'up'),
    SUELA_WALL_02: p(5, 2, 'interact', 'up'),
    SUELA_WALL_03: p(8, 2, 'interact', 'up'),
    SUELA_WALL_04: p(11, 2, 'interact', 'up'),
    SUELA_TABLE_01: p(4, 6, 'interact', 'up'),
    SUELA_TABLE_02: p(9, 6, 'interact', 'up'),
    SUELA_FLOOR_01: p(7, 7, 'work'),
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
    TINTA_WAIT_01: p(1, 7, 'seat', 'down'),
    TINTA_WAIT_02: p(2, 7, 'seat', 'down'),
    TINTA_WAIT_03: p(4, 9, 'wait', 'left'),
  },
};

/** Café Molinillo: barra corta con cafetera y vitrina, cuatro sitios y la pizarra del día. */
const MOLINILLO_TABLES: [number, number][] = [[8, 4], [8, 7]];
/** Una silla a cada lado de cada mesa, cara a cara. */
const MOLINILLO_SEATS: Record<string, PointDef> = Object.fromEntries(
  MOLINILLO_TABLES.flatMap(([x, y], i) => [
    [`MOLINILLO_TABLE_${TWO(i * 2)}`, p(x - 1, y, 'seat', 'right')],
    [`MOLINILLO_TABLE_${TWO(i * 2 + 1)}`, p(x + 1, y, 'seat', 'left')],
  ]),
);

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
    ...seatsFurniture(MOLINILLO_SEATS),
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
    ...MOLINILLO_SEATS,
  },
};

// ------------------------------------------------------ salón recreativo

/**
 * Salón Recreativo Nova (Ribera Norte): luz de neón sobre suelo oscuro y una fila de máquinas contra la pared del
 * fondo —lucha, carreras y las pinzas—, dos de ritmo en medio y los sofás de quien espera turno. Quien juega se
 * pone de pie delante de la máquina (puesto 'arcade') o encima de la plataforma ('rhythm'); quien espera, detrás.
 * El jugador echa una partida en cada máquina por unas monedas (data/activities.ts, 'arcade-*'): fichas por
 * partida y nada más, sin premios en dinero.
 */
const ARCADE_FIGHT_X = [2, 3, 4, 5, 6] as const;
const ARCADE_RACE_X = [9, 10, 11, 12] as const;
const ARCADE_CLAW_X = [15, 16, 17] as const;

export const ARCADE: LocationDef = {
  id: 'arcade',
  name: 'Salón Recreativo Nova',
  kind: 'interior',
  ground: room(20, 14, 10, (_x, y) => (y >= 10 ? 't' : 'n')),
  props: [
    ...ARCADE_FIGHT_X.map((x) => at('arcade-cabinet', x, 2)),
    ...ARCADE_RACE_X.map((x) => at('arcade-racing', x, 2)),
    ...ARCADE_CLAW_X.map((x) => at('arcade-claw', x, 2)),
    at('neon', 7, 1),
    ...many('arcade-rhythm', [[3, 8], [6, 8]]),
    // Los sofás de quien espera turno, mirando a la sala.
    ...many('sofa', [[14, 6], [17, 6]]),
    // El mostrador de las fichas.
    ...many('counter', [[15, 10], [16, 10], [17, 10]]),
    at('register', 17, 10),
    ...many('plant', [[1, 11], [18, 2]]),
  ],
  ambient: '#d2c6ff',
  ...exitTo('ribera-arcade', 10, 14),
  // La puerta da a la calle de la Ribera, no al barrio de siempre.
  portals: [{ id: 'exit', tx: 10, ty: 12, label: 'Salir a la calle', to: { location: 'ribera', spawn: 'ribera-arcade' } }],
  // Nadie colocado a mano: la gente la pone data/population.ts según la hora.
  npcs: [],
  spots: [
    { tx: 4, ty: 3, name: 'Máquina de lucha', activities: ['arcade-fight'] },
    { tx: 10, ty: 3, name: 'Máquina de carreras', activities: ['arcade-race'] },
    { tx: 16, ty: 3, name: 'Máquina de las pinzas', activities: ['arcade-claw'] },
    { tx: 3, ty: 9, name: 'Máquina de ritmo', activities: ['arcade-rhythm'] },
  ],
  points: {
    ARCADE_EXIT: p(10, 11, 'exit', 'up'),
    ARCADE_STAFF: p(16, 9, 'work', 'down'),
    ARCADE_TILL: p(16, 11, 'interact', 'up'),
    ...Object.fromEntries(ARCADE_FIGHT_X.map((x, i) => [`ARCADE_FIGHT_${TWO(i)}`, use(x, 3, 'arcade', 'up')])),
    ...Object.fromEntries(ARCADE_RACE_X.map((x, i) => [`ARCADE_RACE_${TWO(i)}`, use(x, 3, 'arcade', 'up')])),
    ...Object.fromEntries(ARCADE_CLAW_X.map((x, i) => [`ARCADE_CLAW_${TWO(i)}`, use(x, 3, 'arcade', 'up')])),
    ARCADE_RHYTHM_01: use(3, 8, 'rhythm', 'up'),
    ARCADE_RHYTHM_02: use(6, 8, 'rhythm', 'up'),
    // Detrás de quien juega, esperando turno o mirando por encima del hombro.
    ARCADE_WAIT_01: p(3, 5, 'wait', 'up'),
    ARCADE_WAIT_02: p(5, 5, 'wait', 'up'),
    ARCADE_WAIT_03: p(10, 5, 'wait', 'up'),
    ARCADE_WAIT_04: p(12, 5, 'wait', 'up'),
    ARCADE_WAIT_05: p(16, 5, 'wait', 'up'),
    // Los sofás: dos plazas cada uno.
    ARCADE_SEAT_01: p(14, 6, 'seat', 'down'),
    ARCADE_SEAT_02: p(15, 6, 'seat', 'down'),
    ARCADE_SEAT_03: p(17, 6, 'seat', 'down'),
    ARCADE_SEAT_04: p(18, 6, 'seat', 'down'),
    // Un rato de charla en medio de la sala.
    ARCADE_CHAT_01: p(9, 7, 'meet', 'right'),
    ARCADE_CHAT_02: p(10, 7, 'meet', 'left'),
    ARCADE_FLOOR_01: p(8, 6, 'work'),
    ARCADE_FLOOR_02: p(12, 8, 'work'),
  },
};

// ------------------------------------------------- Ribera Norte: los locales de la calle
//
// Los mismos cimientos que los de Vallesco y el Carmen (room, puntos, terminales, percheros, mesas con servicio):
// cada uno sale por su puerta a la calle de la Ribera (el spawn que genera su edificio en data/ribera.ts) y la gente
// la pone data/population.ts según la hora. Lo que se veía desde fuera (la pizarra de la puerta), sigue dentro.

/** Salida a la calle de la Ribera por la puerta de su edificio, y el spawn de entrada justo delante. */
function riberaExit(building: string, doorX: number, h: number): Pick<LocationDef, 'portals' | 'spawns'> {
  return {
    portals: [{ id: 'exit', tx: doorX, ty: h - 2, label: 'Salir a la calle', to: { location: 'ribera', spawn: building } }],
    spawns: { entry: { tx: doorX, ty: h - 3, facing: 'up' } },
  };
}

/**
 * Colmado Ribera: tienda de barrio abierta hasta tarde. Neveras al fondo, dos góndolas cortas, la caja junto a la
 * puerta y la máquina de hielo. Se compra en la caja (catálogo del súper: lo esencial).
 */
export const COLMADO: LocationDef = {
  id: 'colmado',
  name: 'Colmado Ribera',
  kind: 'interior',
  ground: room(14, 11, 7, () => 't'),
  props: [
    ...many('fridge', [[2, 2], [3, 2], [4, 2], [5, 2]]),
    ...many('gondola', [[4, 5], [5, 5], [9, 5], [10, 5]]),
    ...many('produce', [[12, 3], [12, 4]]),
    ...many('counter', [[10, 7], [11, 7]]),
    at('register', 11, 7),
    at('chalkboard', 8, 1),
    at('plant', 1, 8),
    ...many('tube-light', [[4, 4], [9, 4]]),
  ],
  ambient: '#eef6f0',
  ...riberaExit('ribera-colmado', 7, 11),
  terminals: [{ tx: 10, ty: 7, name: 'Caja · Colmado Ribera', catalog: 'supermarket-till' }],
  inspects: [{ tx: 8, ty: 2, name: 'Pizarra', lines: ['«Hielo, pan y pilas. Lo esencial». Abierto hasta tarde, como dice la puerta.'] }],
  npcs: [],
  points: {
    COLMADO_EXIT: p(7, 8, 'exit', 'up'),
    COLMADO_STAFF: p(11, 6, 'work', 'down'),
    COLMADO_TILL: p(10, 8, 'interact', 'up'),
    COLMADO_QUEUE_01: p(9, 8, 'wait', 'right'),
    COLMADO_FRIDGE: p(3, 3, 'interact', 'up'),
    COLMADO_AISLE_01: p(4, 6, 'interact'),
    COLMADO_AISLE_02: p(9, 6, 'interact'),
    COLMADO_AISLE_03: p(11, 4, 'interact', 'right'),
  },
};

/**
 * Ribera Sport: tienda de deporte del barrio. Pared de zapatillas, ropa técnica en el perchero, las mesas de
 * novedades en medio y la caja. Las prendas son las del catálogo de siempre (data/retail.ts, tienda 'ribera-sport'):
 * se ven, se prueban y se compran con el mismo sistema que en Hilo o Suela.
 */
export const RIBERA_SPORT: LocationDef = {
  id: 'ribera-sport',
  name: 'Ribera Sport',
  kind: 'interior',
  ground: room(14, 11, 7, (x, y) => (y >= 5 && y <= 7 && x >= 3 && x <= 9 ? 'r' : 't')),
  props: [
    ...many('sneaker-wall', [[2, 1], [5, 1]]),
    at('clothes-rack', 9, 2),
    ...many('display-table', [[4, 5], [8, 5]]),
    ...many('counter', [[11, 6], [12, 6]]),
    at('register', 12, 6),
    at('chalkboard', 7, 1),
    at('plant', 12, 8),
    ...many('tube-light', [[4, 4], [9, 4]]),
  ],
  ambient: '#f2f6ff',
  ...riberaExit('ribera-sports', 7, 11),
  npcs: [],
  inspects: [{ tx: 7, ty: 2, name: 'Cartel del escaparate', lines: ['«Carrera del canal, el primer domingo de mes». Inscripciones en caja.'] }],
  racks: [
    { tx: 2, ty: 2, name: 'Pared de zapatillas', store: 'ribera-sport', categories: ['zapatillas'] },
    { tx: 10, ty: 4, name: 'Ropa técnica', store: 'ribera-sport', categories: ['camiseta', 'pantalon', 'sudadera'] },
    { tx: 4, ty: 6, name: 'Mesa de novedades', store: 'ribera-sport' },
  ],
  points: {
    SPORT_EXIT: p(7, 8, 'exit', 'up'),
    SPORT_STAFF: p(11, 5, 'work', 'down'),
    SPORT_TILL: p(11, 7, 'interact', 'up'),
    SPORT_QUEUE_01: p(10, 8, 'wait', 'up'),
    SPORT_WALL_01: p(2, 2, 'interact', 'up'),
    SPORT_WALL_02: p(5, 2, 'interact', 'up'),
    SPORT_RACK_01: p(10, 4, 'interact', 'up'),
    SPORT_TABLE_01: p(4, 6, 'interact', 'up'),
    SPORT_TABLE_02: p(8, 6, 'interact', 'up'),
    SPORT_FLOOR_01: p(6, 7, 'work'),
  },
};

/** Café del Río: barra con cafetera y vitrina a la izquierda, seis sitios junto a las ventanas que dan al canal. */
const CAFE_RIO_TABLES: [number, number][] = [[7, 4], [10, 4], [10, 7]];
/** Una silla a cada lado de cada mesa, cara a cara. */
const CAFE_RIO_SEATS: Record<string, PointDef> = Object.fromEntries(
  CAFE_RIO_TABLES.flatMap(([x, y], i) => [
    [`CAFE_RIO_TABLE_${TWO(i * 2)}`, p(x - 1, y, 'seat', 'right')],
    [`CAFE_RIO_TABLE_${TWO(i * 2 + 1)}`, p(x + 1, y, 'seat', 'left')],
  ]),
);

/**
 * Café del Río: desayunos hasta las doce y vermú por la tarde. Se pide en la barra (catálogo de cafetería, como en
 * el Molinillo) y se toma en las mesas de las ventanas.
 */
export const CAFE_RIO: LocationDef = {
  id: 'cafe-rio',
  name: 'Café del Río',
  kind: 'interior',
  ground: room(14, 10, 7, () => 'f'),
  props: [
    ...many('counter', [[1, 4], [2, 4], [3, 4], [4, 4]]),
    at('espresso', 2, 4), at('pastry-case', 4, 4),
    at('chalkboard', 1, 1),
    ...many('window', [[7, 1], [10, 1]]),
    ...many('cafe-table', CAFE_RIO_TABLES),
    ...seatsFurniture(CAFE_RIO_SEATS),
    ...many('pendant', CAFE_RIO_TABLES.map(([x, y]) => [x, y - 1] as [number, number])),
    at('plant', 12, 7),
  ],
  ambient: '#ffe9cf',
  ...riberaExit('ribera-cafe', 7, 10),
  terminals: [{ tx: 3, ty: 4, name: 'Barra · Café del Río', catalog: 'cafe-counter' }],
  inspects: [{ tx: 1, ty: 2, name: 'Pizarra', lines: ['Desayunos hasta las doce y, por la tarde, vermú. La terraza mira a la calle y a la gente que pasa.'] }],
  npcs: [],
  points: {
    CAFE_RIO_EXIT: p(7, 7, 'exit', 'up'),
    CAFE_RIO_STAFF: p(2, 3, 'work', 'down'),
    CAFE_RIO_COUNTER: p(3, 5, 'interact', 'up'),
    CAFE_RIO_QUEUE_01: p(4, 6, 'wait', 'up'),
    ...CAFE_RIO_SEATS,
  },
};

/** Casa Mar: seis mesas de dos en el comedor; cocina y barra al fondo, como un restaurante de puerto. */
const CASA_MAR_TABLE_XY: [number, number][] = [[9, 4], [12, 4], [15, 4], [9, 7], [12, 7], [15, 7]];
/** Dos sitios por mesa, delante y a su derecha, cada uno con su silla (data/seating.ts). */
const CASA_MAR_SEATS: Record<string, PointDef> = {
  ...Object.fromEntries(CASA_MAR_TABLE_XY.map(([x, y], i) => [`CASAMAR_TABLE_${TWO(i)}`, p(x, y + 1, 'seat', 'up')])),
  ...Object.fromEntries(CASA_MAR_TABLE_XY.map(([x, y], i) => [`CASAMAR_TABLE_${TWO(i + 6)}`, p(x + 1, y, 'seat', 'left')])),
};
/** Cada mesa con sus dos sillas y el tile de su izquierda, donde se para quien atiende (systems/TableService). */
const CASA_MAR_TABLES: TableDef[] = CASA_MAR_TABLE_XY.map(([x, y], i) => ({
  id: `CASAMAR_MESA_${TWO(i)}`,
  seats: [`CASAMAR_TABLE_${TWO(i)}`, `CASAMAR_TABLE_${TWO(i + 6)}`],
  service: { tx: x - 1, ty: y },
}));

/**
 * Casa Mar: arroces y pescado del día. Cocina con fogones y baldas al fondo, barra con el pase, y el comedor de
 * madera. Sentarse a una mesa es pedir que te atiendan: el mismo servicio de mesa que Casa Tomás
 * (systems/TableService) con su propia carta ('casa-mar', data/menus.ts).
 */
export const CASA_MAR: LocationDef = {
  id: 'casa-mar',
  name: 'Casa Mar',
  kind: 'interior',
  ground: room(18, 12, 9, (_x, y) => (y <= 3 ? 't' : 'f')),
  props: [
    ...many('shelf', [[2, 2], [3, 2], [7, 2]]),
    at('stove', 5, 2),
    ...many('counter', [[2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4]]),
    ...many('dining-table', CASA_MAR_TABLE_XY),
    ...seatsFurniture(CASA_MAR_SEATS),
    at('chalkboard', 12, 1),
    ...many('plant', [[1, 9], [16, 9]]),
    ...many('pendant', [...CASA_MAR_TABLE_XY, [3, 5], [6, 5]]),
  ],
  ambient: '#ffe4c2',
  ...riberaExit('ribera-casamar', 9, 12),
  inspects: [{ tx: 12, ty: 2, name: 'Pizarra', lines: ['Arroces y pescado del día. «Cenas en la terraza a partir de las ocho. Reservar, mejor».'] }],
  // Servicio de mesa (data/population.ts: tableService): sentarse a una mesa es pedir que te atiendan.
  tables: CASA_MAR_TABLES,
  npcs: [],
  points: {
    CASAMAR_EXIT: p(9, 9, 'exit', 'up'),
    CASAMAR_COUNTER: p(4, 5, 'interact', 'up'),
    CASAMAR_STAFF: p(4, 3, 'work', 'down'),
    // El pase: donde recoge el camarero lo que sale de cocina y deja la vajilla sucia.
    CASAMAR_PASS: p(7, 5, 'interact', 'up'),
    ...CASA_MAR_SEATS,
    CASAMAR_WAIT_01: p(8, 9, 'wait', 'up'),
    CASAMAR_WAIT_02: p(10, 9, 'wait', 'up'),
    CASAMAR_WAITER_01: p(8, 6, 'work'),
    CASAMAR_WAITER_02: p(14, 9, 'work'),
  },
};
