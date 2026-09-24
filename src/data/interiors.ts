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
    ...many('mirror', [[2, 1], [5, 1], [8, 1]]),
    ...many('treadmill', [[2, 4], [4, 4], [6, 4]]),
    ...many('weights', [[11, 3], [12, 3]]),
    ...many('weight-bench', [[3, 7], [7, 7], [11, 7]]),
    at('lockers', 18, 3),
    ...many('counter', [[15, 10], [16, 10], [17, 10]]),
    at('cooler', 20, 10),
    ...many('plant', [[20, 3], [1, 11]]),
  ],
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
  ],
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
  ],
  ...exitTo('super-door', 5, 14),
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
  ],
  ...exitTo('restaurant-door', 10, 13),
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
