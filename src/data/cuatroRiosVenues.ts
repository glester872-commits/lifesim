import type { LocationDef, PointDef, PropPlacement, RackDef, InspectDef } from '../types/game.ts';
import type { PlanStep, PopulationProfile, StaffRole, VisitorRole } from './population.ts';
import type { StationId } from './stations.ts';
import { arcadeRoom, at, many, p, room, TWO } from './interiors.ts';
import { FOOD_INTERIORS } from './foodInteriors.ts';
import { FOOD_VENUE_PROFILES } from './foodVenues.ts';

/**
 * Los locales de Cuatro Ríos (data/cuatroRios.ts) por dentro, con los cimientos de siempre: room, puntos, caja con
 * catálogo (data/catalogs.ts), percheros de data/retail.ts, puestos de data/stations.ts y la gente de cada uno según
 * la hora. Cada uno sale por su puerta a la calle (el spawn que genera su edificio). Nada nuevo que fingir: se compra
 * en la caja, se entrena en las máquinas, se corta el pelo con el barbero y se juega en el salón.
 *
 * Las tiendas pequeñas comparten planta (la del Colmado de la Ribera): 14 × 11, puerta en la columna 7, mostrador a la
 * derecha con la caja delante y la cola al lado. Cambia lo que hay a la vista y dónde se para a mirar la gente.
 */

const STREET = 'cuatro-rios';

const use = (tx: number, ty: number, station: StationId, facing: PointDef['facing']): PointDef => ({ tx, ty, kind: 'interact', facing, use: station });

export interface Shop {
  id: string;
  name: string;
  /** Edificio de la calle: su spawn es la vuelta. */
  building: string;
  /** Calle a la que sale (por defecto, Cuatro Ríos). */
  street?: string;
  /** Prefijo de los puntos. */
  pre: string;
  ambient: string;
  props: readonly PropPlacement[];
  /** Puntos donde se para a mirar o coger algo (PRE_BROWSE_01…). */
  browse: readonly (readonly [number, number, NonNullable<PointDef['facing']>])[];
  catalog?: string;
  racks?: readonly RackDef[];
  inspects?: readonly InspectDef[];
}

/** Tienda pequeña: mostrador (10–11, 7) con la caja, quien cobra detrás, la cola al lado y la puerta abajo. */
export function shopRoom(s: Shop): LocationDef {
  const P = s.pre;
  // Donde se paga hablando con quien atiende (tiendas de ropa: percheros y sin terminal), como en las del Carmen: quien
  // atiende al final del mostrador (9, 7) y la caja justo delante (9, 8). Así la E le elige a él aunque haya cola al
  // lado (16 px y de frente, contra 16 px de lado). Detrás del mostrador quedaba a 36 px, fuera de alcance. Con
  // terminal se paga en la caja misma (10, 7) y quien atiende se queda detrás.
  const sells = !s.catalog && !!s.racks?.length;
  return {
    id: s.id,
    name: s.name,
    kind: 'interior',
    ground: room(14, 11, 7, () => 't'),
    // La luz colgada sobre la caja: siempre encendida, como en cualquier tienda.
    props: [...s.props, ...many('counter', [[10, 7], [11, 7]]), at('register', 11, 7), at('pendant', 10, 6)],
    ambient: s.ambient,
    portals: [{ id: 'exit', tx: 7, ty: 9, label: 'Salir a la calle', to: { location: s.street ?? STREET, spawn: s.building } }],
    spawns: { entry: { tx: 7, ty: 8, facing: 'up' } },
    npcs: [],
    terminals: s.catalog ? [{ tx: 10, ty: 7, name: `Caja · ${s.name}`, catalog: s.catalog }] : undefined,
    racks: s.racks,
    inspects: s.inspects,
    points: {
      [`${P}_EXIT`]: p(7, 8, 'exit', 'up'),
      [`${P}_STAFF`]: sells ? p(9, 7, 'work', 'down') : p(11, 6, 'work', 'down'),
      [`${P}_TILL`]: sells ? p(9, 8, 'interact', 'up') : p(10, 8, 'interact', 'up'),
      [`${P}_QUEUE_01`]: sells ? p(10, 8, 'wait', 'left') : p(9, 8, 'wait', 'right'),
      ...Object.fromEntries(s.browse.map(([x, y, f], i) => [`${P}_BROWSE_${TWO(i)}`, p(x, y, 'interact', f)])),
    },
  };
}

const SHOPS: readonly Shop[] = [
  {
    // Neveras al fondo, dos góndolas, la fruta a un lado: lo de la semana a precio de barrio.
    id: 'cr-super', name: 'Supermercado Cuatro Ríos', building: 'cr-super', pre: 'CRSUPER', ambient: '#eef6f0', catalog: 'supermarket-till',
    props: [...many('fridge', [[2, 2], [3, 2], [4, 2], [5, 2]]), ...many('gondola', [[4, 5], [5, 5], [8, 5], [9, 5]]), ...many('produce', [[12, 3], [12, 4]]), ...many('tube-light', [[4, 4], [9, 4]])],
    browse: [[3, 3, 'up'], [4, 6, 'up'], [8, 6, 'up'], [11, 4, 'right']],
  },
  {
    // Abierto hasta las dos: nevera de bebidas, pan del día, lo justo para la cena de última hora.
    id: 'cr-abierto', name: 'Abierto Hasta Tarde', building: 'cr-abierto', pre: 'CRABIERTO', ambient: '#f4f1e6', catalog: 'supermarket-till',
    props: [...many('fridge', [[2, 2], [3, 2]]), ...many('shelf', [[6, 2], [8, 2]]), ...many('gondola', [[4, 5], [5, 5]]), at('produce', 12, 3), at('tube-light', 6, 4)],
    browse: [[2, 3, 'up'], [6, 3, 'up'], [4, 6, 'up'], [11, 3, 'right']],
    inspects: [{ tx: 9, ty: 2, name: 'Cartel a mano', lines: ['«Recargas, pan, hielo. Abierto hasta las 2». Debajo, otra letra: «los domingos también».'] }],
  },
  {
    // Cajas de fruta en dos filas y la balanza en el mostrador: mango, plátano, naranja, cebolla, cilantro y patata.
    id: 'cr-fruteria', name: 'Frutas Dos Orillas', building: 'cr-fruteria', pre: 'CRFRUTA', ambient: '#fff4e2', catalog: 'fruteria-counter',
    props: [...many('produce', [[2, 3], [3, 3], [4, 3], [7, 3], [8, 3], [9, 3]]), ...many('crates', [[2, 6], [3, 6], [12, 3]])],
    browse: [[3, 4, 'up'], [8, 4, 'up'], [4, 6, 'left']],
    inspects: [{ tx: 6, ty: 2, name: 'Pizarra de precios', lines: ['Mango, plátano de Canarias, naranja de zumo, yuca, cilantro y tomate de rama. «Lo de la caja de abajo, a un euro».'] }],
  },
  {
    // Pan de varias masas, bollería y café de pie: la cola de las ocho la conoce todo el barrio.
    id: 'cr-panaderia', name: 'Panadería La Espiga', building: 'cr-panaderia', pre: 'CRPAN', ambient: '#ffe9cc', catalog: 'cafe-counter',
    props: [...many('shelf', [[2, 2], [4, 2], [6, 2]]), at('pastry-case', 9, 7), at('chalkboard', 9, 1), at('plant', 1, 8)],
    browse: [[2, 3, 'up'], [4, 3, 'up'], [6, 3, 'up']],
    inspects: [{ tx: 9, ty: 2, name: 'Pizarra', lines: ['Barra, hogaza, pan de centeno, pan de pita y trenza de los viernes. Café para llevar, uno con cincuenta.'] }],
  },
  {
    // Móviles y reparaciones: fundas en la pared, dos mesas de muestra y el mostrador donde se recarga el transporte.
    id: 'cr-conecta', name: 'Conecta · móviles', building: 'cr-conecta', pre: 'CRCONECTA', ambient: '#e6f4ff', catalog: 'conecta-counter',
    props: [...many('display-table', [[4, 5], [8, 5]]), ...many('wall-shelf', [[2, 1], [5, 1]]), at('neon', 8, 1), at('cooler', 12, 3)],
    browse: [[4, 6, 'up'], [8, 6, 'up'], [2, 2, 'up']],
    inspects: [{ tx: 5, ty: 2, name: 'Cartel de reparaciones', lines: ['Pantalla en una hora, batería en media. «Se hacen recargas de transporte». Lo pone en cuatro idiomas.'] }],
  },
  {
    // Farmacia de barrio: baldas detrás y delante, la báscula junto a la puerta.
    id: 'cr-farmacia', name: 'Farmacia del Cruce', building: 'cr-farmacia', pre: 'CRFARMA', ambient: '#f2fbf6', catalog: 'pharmacy-counter',
    props: [...many('shelf', [[2, 2], [4, 2], [6, 2]]), at('plant', 12, 2)],
    browse: [[2, 3, 'up'], [4, 3, 'up'], [6, 3, 'up']],
    inspects: [{ tx: 3, ty: 8, name: 'Báscula', lines: ['Peso, altura e índice de masa corporal por veinte céntimos. Nadie le ha echado nunca veinte céntimos.'] }],
  },
  {
    // Moda de barrio: dos percheros, la mesa de rebajas, el maniquí del escaparate y el probador.
    id: 'cr-hilvana', name: 'Hilvana · moda', building: 'cr-hilvana', pre: 'CRHILVANA', ambient: '#fff6ee',
    props: [...many('clothes-rack', [[3, 3], [6, 3]]), at('display-table', 4, 5), at('mannequin', 11, 3), at('fitting-room', 1, 5), at('mirror', 12, 1)],
    browse: [[3, 4, 'up'], [6, 4, 'up'], [4, 6, 'up']],
    racks: [
      { tx: 3, ty: 4, name: 'Perchero de temporada', store: 'hilvana' },
      { tx: 6, ty: 4, name: 'Perchero de básicos', store: 'hilvana', categories: ['camiseta', 'pantalon'] },
      { tx: 4, ty: 6, name: 'Mesa de rebajas', store: 'hilvana' },
    ],
  },
  {
    // Calle y deporte: la pared de zapatillas, el perchero de chándal y las mesas de camisetas (la planta de Ribera Sport).
    id: 'cr-ambar', name: 'Ámbar · calle y deporte', building: 'cr-ambar', pre: 'CRAMBAR', ambient: '#f2f0ff',
    props: [...many('sneaker-wall', [[2, 1], [5, 1]]), at('clothes-rack', 9, 2), ...many('display-table', [[4, 5], [8, 5]]), ...many('tube-light', [[4, 4], [9, 4]])],
    browse: [[2, 2, 'up'], [10, 4, 'up'], [4, 6, 'up'], [8, 6, 'up']],
    racks: [
      { tx: 2, ty: 2, name: 'Pared de zapatillas', store: 'ambar', categories: ['zapatillas'] },
      { tx: 10, ty: 4, name: 'Chándal y sudaderas', store: 'ambar', categories: ['pantalon', 'sudadera'] },
      { tx: 4, ty: 6, name: 'Mesa de camisetas', store: 'ambar', categories: ['camiseta'] },
    ],
  },
];

// ------------------------------------------------------------------ barbería

const BARBER_CHAIRS: [number, number][] = [[3, 3], [6, 3], [9, 3]];

/** Barbería del Cruce: tres sillones con su espejo, sofá de espera y la caja; el corte es el de siempre (data/services.ts). */
const BARBER: LocationDef = {
  id: 'cr-barberia',
  name: 'Barbería del Cruce',
  kind: 'interior',
  ground: room(14, 11, 7, () => 't'),
  props: [
    ...many('mirror', BARBER_CHAIRS.map(([x]) => [x - 1, 1] as [number, number])),
    ...many('barber-chair', BARBER_CHAIRS),
    at('wall-shelf', 11, 1),
    at('shelf', 12, 4),
    ...many('counter', [[10, 7], [11, 7]]),
    at('register', 11, 7),
    at('sofa', 1, 6),
    ...many('pendant', BARBER_CHAIRS.map(([x, y]) => [x, y - 1] as [number, number])),
  ],
  ambient: '#fff1dc',
  portals: [{ id: 'exit', tx: 7, ty: 9, label: 'Salir a la calle', to: { location: STREET, spawn: 'cr-barberia' } }],
  spawns: { entry: { tx: 7, ty: 8, facing: 'up' } },
  npcs: [],
  inspects: [{ tx: 4, ty: 8, name: 'Lista de precios', lines: ['Corte, degradado, barba y cejas. «Niños hasta 12 años, más barato». Escrito a mano, con dibujos.'] }],
  points: {
    CRBARBER_EXIT: p(7, 8, 'exit', 'up'),
    ...Object.fromEntries(BARBER_CHAIRS.map(([x, y], i) => [`CRBARBER_CHAIR_${TWO(i)}`, p(x, y, 'seat', 'up')])),
    CRBARBER_STAFF_01: p(10, 5, 'work', 'left'),
    CRBARBER_STAFF_02: p(4, 5, 'work', 'up'),
    CRBARBER_RECEPTION: p(10, 8, 'interact', 'up'),
    CRBARBER_SHELF: p(11, 4, 'interact', 'right'),
    CRBARBER_WAIT_01: p(1, 6, 'seat', 'down'),
    CRBARBER_WAIT_02: p(2, 6, 'seat', 'down'),
    CRBARBER_WAIT_03: p(5, 8, 'wait', 'left'),
  },
};

// ------------------------------------------------------------------ gimnasio

/**
 * Gimnasio Barrio Fit: sala pequeña de caucho (dos cintas, una bici, banco, jaula, mancuernas y esterillas), recepción
 * junto a la puerta y, tras su pared, dos vestuarios (hombres arriba, mujeres abajo) con taquillas. Las máquinas son
 * los puestos de siempre (data/stations.ts): el jugador entrena como en Forja.
 */
function gymGround(): string[] {
  const rows = room(20, 13, 9, (x, y) => (x <= 13 && y <= 9 ? 'm' : 't')).map((r) => r.split(''));
  for (let y = 2; y <= 10; y++) rows[y][14] = 'W';
  rows[4][14] = 'D';
  rows[9][14] = 'D';
  for (let x = 15; x <= 18; x++) rows[6][x] = 'W';
  return rows.map((r) => r.join(''));
}

export const GYM: LocationDef = {
  id: 'cr-gym',
  name: 'Gimnasio Barrio Fit',
  kind: 'interior',
  ground: gymGround(),
  props: [
    ...many('mirror', [[1, 1], [3, 1], [5, 1]]),
    at('gym-sign', 9, 1),
    at('clock', 12, 1),
    ...many('treadmill', [[2, 3], [4, 3]]),
    at('exercise-bike', 6, 3),
    at('bench-press', 9, 3),
    at('squat-rack', 12, 3),
    at('weights', 6, 7),
    ...many('yoga-mat', [[2, 9], [3, 9]]),
    at('cooler', 13, 5),
    ...many('counter', [[11, 9], [12, 9]]),
    ...many('lockers', [[15, 3], [17, 3], [15, 8], [17, 8]]),
    at('sign-men', 14, 3),
    at('sign-women', 14, 8),
    ...many('tube-light', [[3, 5], [9, 5]]),
  ],
  ambient: '#e2ebff',
  portals: [{ id: 'exit', tx: 9, ty: 11, label: 'Salir a la calle', to: { location: STREET, spawn: 'cr-gym' } }],
  spawns: { entry: { tx: 9, ty: 10, facing: 'up' } },
  npcs: [],
  points: {
    CRGYM_EXIT: p(9, 10, 'exit', 'up'),
    CRGYM_RECEPTION: p(11, 10, 'interact', 'up'),
    CRGYM_STAFF: p(12, 8, 'work', 'down'),
    CRGYM_TREADMILL_01: use(2, 3, 'treadmill', 'up'),
    CRGYM_TREADMILL_02: use(4, 3, 'treadmill', 'up'),
    CRGYM_BIKE_01: use(6, 3, 'bike', 'up'),
    CRGYM_BENCH_01: use(9, 3, 'bench-press', 'down'),
    CRGYM_SQUAT_01: use(12, 3, 'squat-rack', 'up'),
    CRGYM_WEIGHTS_01: use(6, 8, 'dumbbells', 'up'),
    CRGYM_WEIGHTS_02: use(7, 8, 'dumbbells', 'up'),
    CRGYM_MAT_01: use(2, 9, 'stretch', 'down'),
    CRGYM_MAT_02: use(3, 9, 'stretch', 'down'),
    CRGYM_WATER: use(12, 5, 'water', 'right'),
    CRGYM_REST_01: p(5, 10, 'wait', 'up'),
    CRGYM_COACH_01: p(8, 6, 'work', 'down'),
    ...Object.fromEntries([15, 16, 17, 18].map((x, i) => [`CRGYM_CHANGE_M_${TWO(i)}`, p(x, 4, 'work', 'up')])),
    ...Object.fromEntries([15, 16, 17, 18].map((x, i) => [`CRGYM_CHANGE_F_${TWO(i)}`, p(x, 9, 'work', 'up')])),
  },
};

// ------------------------------------------------------------------ registro

/** Los tres restaurantes de arquetipo (data/foodVenues.ts) que tienen su puerta en esta calle. */
const FOOD = new Set(['pizzeria-roma', 'burger-norte', 'sushi-nori']);

export const CR_INTERIORS: readonly LocationDef[] = [
  ...SHOPS.map(shopRoom),
  BARBER,
  GYM,
  arcadeRoom('cr-arcade', 'Recreativos Delta', { location: STREET, spawn: 'cr-arcade' }, 'CR_ARCADE_'),
  ...FOOD_INTERIORS.filter((l) => FOOD.has(l.id)),
];

// ------------------------------------------------------------------ gente

/** Mirar, hacer cola y pagar: el cliente de cualquier tienda pequeña de aquí. */
export const customer = (pre: string, line: string, weight = 1, extra: Partial<VisitorRole> = {}): VisitorRole => ({
  role: 'customer', label: 'Cliente', line, weight,
  plan: [
    { state: 'BROWSE', points: [`${pre}_BROWSE_`], minutes: [1, 4], repeat: [1, 2] },
    { state: 'QUEUE', points: [`${pre}_QUEUE_`], minutes: [1, 2] },
    { state: 'CHECKOUT', points: [`${pre}_TILL`], minutes: [1, 2] },
  ],
  ...extra,
});

export const cashier = (pre: string, label: string, line: string, look = 'uniforme-tienda', offers?: StaffRole['offers']): StaffRole =>
  ({ service: 'cashier', label, line, look, points: [`${pre}_STAFF`], offers });

const CHECK_IN: PlanStep = { state: 'CHECK_IN', points: ['CRGYM_RECEPTION'], minutes: [1, 2] };
const CHANGE_IN: PlanStep = { state: 'CHANGE', points: ['CRGYM_CHANGE_{s}_'], minutes: [5, 7], outfit: 'gym' };
const CHANGE_OUT: PlanStep = { state: 'CHANGE', points: ['CRGYM_CHANGE_{s}_'], minutes: [5, 7], outfit: 'street' };

// Hora punta en todo: de 7:30 a 9:30 y de 17:00 a 20:00 es cuando más se compra, se entrena y se pasa por caja.
export const CR_PROFILES: readonly PopulationProfile[] = [
  {
    place: 'cr-super', bands: [[8.5, 10, 'MEDIUM'], [10, 13, 'LOW'], [13, 15, 'MEDIUM'], [15, 17, 'LOW'], [17, 20, 'VERY_HIGH'], [20, 22, 'MEDIUM']],
    weekday: [0, 0, 0, 0, 1, 1, -2], maxVisitors: 10,
    staff: [cashier('CRSUPER', 'Caja', 'La tarjeta, cuando se ponga verde.', 'uniforme-super')],
    visitors: [customer('CRSUPER', '¿Dónde está el arroz? Siempre lo cambian de sitio.', 1, { party: [1, 2] })],
  },
  {
    place: 'cr-abierto', bands: [[8, 10, 'LOW'], [10, 17, 'LOW'], [17, 20, 'MEDIUM'], [20, 23, 'HIGH'], [23, 24, 'MEDIUM'], [0, 2, 'LOW']],
    weekday: [0, 0, 0, 0, 1, 1, 0], maxVisitors: 5,
    staff: [cashier('CRABIERTO', 'Caja', 'Bolsa no hay, pero te dejo una caja.')],
    visitors: [customer('CRABIERTO', 'Sólo venía por pan. Me llevo también el helado.')],
  },
  {
    place: 'cr-fruteria', bands: [[8, 10, 'HIGH'], [10, 13, 'MEDIUM'], [13, 17, 'LOW'], [17, 20, 'HIGH'], [20, 21, 'LOW']],
    weekday: [0, 0, 0, 0, 0, 1, -1], maxVisitors: 5,
    staff: [cashier('CRFRUTA', 'Frutas Dos Orillas', 'El mango hoy está en su punto. Mañana, ya no.')],
    visitors: [customer('CRFRUTA', 'Dos kilos de naranjas y lo que me digas tú.', 1, { party: [1, 2] })],
  },
  {
    place: 'cr-panaderia', bands: [[7, 9.5, 'VERY_HIGH'], [9.5, 13, 'MEDIUM'], [13, 17, 'LOW'], [17, 20, 'HIGH'], [20, 21, 'LOW']],
    weekday: [0, 0, 0, 0, 0, 1, 1], maxVisitors: 6,
    staff: [cashier('CRPAN', 'La Espiga', 'La de centeno sale a las ocho y media.', 'uniforme-sala')],
    visitors: [customer('CRPAN', 'Una barra y un café para llevar, que pierdo el metro.', 2), customer('CRPAN', 'La trenza de los viernes, si queda.', 1, { hours: [9.5, 21] })],
  },
  {
    place: 'cr-conecta', bands: [[10, 13, 'LOW'], [13, 17, 'MEDIUM'], [17, 20, 'HIGH'], [20, 21.5, 'MEDIUM']],
    weekday: [0, 0, 0, 0, 0, 1, -4], maxVisitors: 4,
    staff: [cashier('CRCONECTA', 'Conecta', 'Déjamelo una hora y te cambio la pantalla.')],
    visitors: [customer('CRCONECTA', 'Se me ha caído. Otra vez. Por la misma esquina.')],
  },
  {
    place: 'cr-farmacia', bands: [[9, 11, 'MEDIUM'], [11, 14, 'MEDIUM'], [14, 17, 'LOW'], [17, 20, 'HIGH'], [20, 22, 'LOW']],
    weekday: [0, 0, 0, 0, 0, -1, -1], maxVisitors: 4,
    staff: [cashier('CRFARMA', 'Farmacéutico', '¿Con receta o sin receta?', 'uniforme-sala')],
    visitors: [customer('CRFARMA', 'Lo de la tos, para mi madre.', 2)],
  },
  {
    place: 'cr-hilvana', bands: [[10, 13, 'LOW'], [13, 17, 'MEDIUM'], [17, 20, 'HIGH'], [20, 21, 'LOW']],
    weekday: [-1, 0, 0, 0, 1, 1, -4], maxVisitors: 6,
    staff: [cashier('CRHILVANA', 'Hilvana', 'Si te lo pruebas, el probador es la cortina.', 'uniforme-tienda', 'shop-hilvana')],
    visitors: [customer('CRHILVANA', 'Busco algo para una boda. No la mía.', 1, { party: [1, 2] })],
  },
  {
    place: 'cr-ambar', bands: [[10.5, 13, 'LOW'], [13, 17, 'MEDIUM'], [17, 20.5, 'HIGH'], [20.5, 21, 'LOW']],
    weekday: [0, 0, 0, 0, 1, 1, -4], maxVisitors: 6,
    staff: [cashier('CRAMBAR', 'Ámbar', 'Esa talla viene grande. Mejor una menos.', 'uniforme-tienda', 'shop-ambar')],
    visitors: [customer('CRAMBAR', 'El chándal para el fútbol del sábado.', 1, { party: [1, 2] })],
  },
  {
    place: 'cr-barberia', bands: [[9.5, 12, 'LOW'], [12, 14, 'MEDIUM'], [14, 17, 'LOW'], [17, 20.5, 'HIGH']],
    weekday: [0, 0, 0, 0, 1, 2, -4], maxVisitors: 6,
    staff: [
      { service: 'barber', label: 'Barbero', line: 'Degradado al dos y arriba con tijera. Lo de siempre.', points: ['CRBARBER_STAFF_01'], serves: ['CRBARBER_CHAIR_'], offers: 'haircut-rio' },
      { service: 'barber', points: ['CRBARBER_STAFF_02'], serves: ['CRBARBER_CHAIR_'], minLevel: 'MEDIUM', offers: 'haircut-rio' },
    ],
    visitors: [
      {
        role: 'haircut', label: 'Cliente de la barbería', line: 'Antes del partido, siempre aquí.', weight: 4,
        plan: [
          { state: 'WAIT', points: ['CRBARBER_WAIT_'], minutes: [4, 15] },
          { state: 'HAIRCUT', points: ['CRBARBER_CHAIR_'], minutes: [20, 35] },
          { state: 'PAY', points: ['CRBARBER_RECEPTION'], minutes: [1, 3] },
        ],
      },
    ],
  },
  {
    place: 'cr-gym', bands: [[6.5, 7.5, 'MEDIUM'], [7.5, 9.5, 'HIGH'], [9.5, 16, 'LOW'], [16, 17, 'MEDIUM'], [17, 20.5, 'VERY_HIGH'], [20.5, 23, 'LOW']],
    weekday: [0, 0, 0, 0, 0, -1, -2], maxVisitors: 9,
    staff: [
      { service: 'receptionist', label: 'Recepción · Barrio Fit', line: 'Ficha con el móvil, que el torno de tarjetas no va.', points: ['CRGYM_STAFF'] },
      { service: 'gym-staff', points: ['CRGYM_COACH_'], minLevel: 'MEDIUM' },
    ],
    visitors: [
      {
        role: 'gym_early', label: 'Alguien que entrena antes de trabajar', line: 'Media hora y al metro. Ni un minuto más.', weight: 3, hours: [6.5, 9.5],
        plan: [CHECK_IN, CHANGE_IN, { state: 'CARDIO', points: ['CRGYM_TREADMILL_', 'CRGYM_BIKE_'], minutes: [15, 25] }, { state: 'DRINK', points: ['CRGYM_WATER'], minutes: [1, 2], chance: 0.6 }, CHANGE_OUT],
      },
      {
        role: 'gym_lifter', label: 'Alguien entrenando', line: 'Esta es la última serie. La penúltima.', weight: 3,
        plan: [
          CHECK_IN, CHANGE_IN,
          { state: 'LIFT', points: ['CRGYM_BENCH_', 'CRGYM_SQUAT_', 'CRGYM_WEIGHTS_'], minutes: [8, 14], repeat: [2, 3] },
          { state: 'REST', points: ['CRGYM_REST_'], minutes: [2, 4], chance: 0.5 },
          { state: 'STRETCH', points: ['CRGYM_MAT_'], minutes: [5, 8], chance: 0.4 },
          CHANGE_OUT,
        ],
      },
      {
        role: 'gym_buddies', label: 'Alguien entrenando con un colega', line: 'Salimos de currar y venimos directos. Si no, no venimos.', weight: 2, hours: [17, 22], party: [2, 2],
        plan: [CHECK_IN, CHANGE_IN, { state: 'LIFT', points: ['CRGYM_WEIGHTS_', 'CRGYM_BENCH_'], minutes: [8, 14], repeat: [1, 2] }, { state: 'CARDIO', points: ['CRGYM_TREADMILL_'], minutes: [10, 15], chance: 0.5 }, CHANGE_OUT],
      },
    ],
    changeBack: CHANGE_OUT,
  },
  ...FOOD_VENUE_PROFILES.filter((v) => FOOD.has(v.place)),
];
