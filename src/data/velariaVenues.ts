import type { LocationDef, PointDef } from '../types/game.ts';
import type { PopulationProfile, StaffRole, VisitorRole } from './population.ts';
import { at, CAFE_RIO, many, p, RESTAURANT, room, TWO, WINE_BAR } from './interiors.ts';
import { cashier, CR_PROFILES, GYM, shopRoom, type Shop } from './cuatroRiosVenues.ts';
import { FOOD_INTERIORS } from './foodInteriors.ts';
import { FOOD_VENUE_PROFILES } from './foodVenues.ts';

/**
 * Los locales de Velaria (data/velaria.ts) por dentro. Los mismos cimientos que todo lo demás: la tienda pequeña de
 * Cuatro Ríos (shopRoom) con otros percheros y otros precios, el gimnasio, el café, la vinoteca y el restaurante de
 * siempre con su carta propia, Kaizen tal como sale de su arquetipo, y tres salas nuevas: el lobby del hotel, la galería
 * y la clínica. Nada finge: lo que se compra se paga en caja o en el perchero, lo que se pide llega a la mesa y el corte
 * de pelo cambia el aspecto. Lo que aún no tiene sistema (habitaciones del hotel, comprar una joya, un tratamiento) no
 * tiene botón: se mira, se lee y se ve a otros hacerlo.
 *
 * La tienda pequeña tiene la planta de siempre: 14 × 11, puerta en la columna 7, mostrador (10–11, 7) con la caja, la
 * cola en (9, 8). En las casas de lujo, además, sitio para probarse (PRE_TRY_) y la planta por la que se mueve quien
 * atiende (PRE_FLOOR_).
 */

const STREET = 'velaria';

/** Salida a la Avenida Dorada (o a la Calle Marqués) por la puerta de su edificio, y el spawn de entrada delante. */
const toStreet = (building: string, doorX: number, h: number): Pick<LocationDef, 'portals' | 'spawns'> => ({
  portals: [{ id: 'exit', tx: doorX, ty: h - 2, label: 'Salir a la calle', to: { location: STREET, spawn: building } }],
  spawns: { entry: { tx: doorX, ty: h - 3, facing: 'up' } },
});

type Cell = readonly [number, number];
const pts = (pre: string, kind: PointDef['kind'], cells: readonly Cell[], facing?: PointDef['facing']): Record<string, PointDef> =>
  Object.fromEntries(cells.map(([x, y], i) => [`${pre}${TWO(i)}`, p(x, y, kind, facing)]));

/** Tienda de shopRoom con sus puntos de más: dónde se prueba y por dónde se mueve quien atiende. */
function luxuryShop(s: Shop, extra: Record<string, PointDef>): LocationDef {
  const r = shopRoom({ ...s, street: STREET });
  return { ...r, points: { ...r.points, ...extra } };
}

// ------------------------------------------------------------------ tiendas

const FERRANT: LocationDef = luxuryShop(
  {
    // Maison Ferrant: tres percheros de sastrería, la mesa de temporada, el maniquí del escaparate, probador y sofá.
    id: 'vl-ferrant', name: 'Maison Ferrant', building: 'vl-ferrant', pre: 'VLFERRANT', ambient: '#fff3e0',
    props: [
      ...many('clothes-rack', [[2, 3], [5, 3], [8, 3]]), at('mannequin', 11, 3), at('fitting-room', 1, 6), at('display-table', 4, 6),
      at('mirror', 12, 1), at('sofa', 2, 8), at('floor-lamp', 12, 5), at('plant', 12, 8), ...many('pendant', [[3, 2], [6, 2]]),
    ],
    browse: [[2, 4, 'up'], [5, 4, 'up'], [8, 4, 'up'], [4, 7, 'up'], [11, 4, 'up']],
    racks: [
      { tx: 2, ty: 4, name: 'Sastrería', store: 'ferrant', categories: ['chaqueta', 'pantalon'] },
      { tx: 5, ty: 4, name: 'Camisas y punto', store: 'ferrant', categories: ['camisa', 'sudadera'] },
      { tx: 4, ty: 7, name: 'Mesa de temporada', store: 'ferrant' },
    ],
    inspects: [{ tx: 11, ty: 4, name: 'Maniquí del escaparate', lines: ['Abrigo de camello, jersey de cachemir y pantalón de sastre. Sin precio a la vista: aquí eso es parte del vestido.'] }],
  },
  { VLFERRANT_TRY_01: p(2, 6, 'interact', 'left'), VLFERRANT_TRY_02: p(12, 2, 'interact', 'up'), ...pts('VLFERRANT_FLOOR_', 'work', [[7, 5], [9, 5]]) },
);

const BRISA: LocationDef = luxuryShop(
  {
    // Atelier Brisa: la pared de mocasines y botines, la de zapatillas de piel, las cazadoras y el sofá para probarse.
    id: 'vl-brisa', name: 'Atelier Brisa · piel y calzado', building: 'vl-brisa', pre: 'VLBRISA', ambient: '#fff0e0',
    props: [
      ...many('wall-shelf', [[2, 1], [5, 1]]), at('sneaker-wall', 8, 1), at('clothes-rack', 11, 3), at('display-table', 4, 5),
      at('sofa', 2, 7), at('mirror', 12, 1), at('floor-lamp', 12, 6), at('plant', 1, 4),
    ],
    browse: [[2, 2, 'up'], [5, 2, 'up'], [8, 2, 'up'], [4, 6, 'up'], [11, 4, 'up']],
    racks: [
      { tx: 2, ty: 2, name: 'Mocasines y botines', store: 'brisa', categories: ['zapatos'] },
      { tx: 8, ty: 2, name: 'Zapatillas de piel', store: 'brisa', categories: ['zapatillas'] },
      { tx: 11, ty: 4, name: 'Cazadoras de piel', store: 'brisa', categories: ['chaqueta'] },
    ],
    inspects: [{ tx: 4, ty: 6, name: 'Bolsos y cinturones', lines: ['Bolsos de piel curtida al vegetal y cinturones con hebilla de latón. Se miran con cuidado: la dependienta no los pierde de vista.'] }],
  },
  { ...pts('VLBRISA_TRY_', 'seat', [[2, 7], [3, 7]], 'down'), ...pts('VLBRISA_FLOOR_', 'work', [[7, 4], [9, 5]]) },
);

const ORIOL: LocationDef = luxuryShop(
  {
    // Oriol: cinco vitrinas sobre peana, la pared de relojes y el espejo para probárselos. Comprar una joya no es
    // todavía cosa del juego: se mira, se lee el precio y se ve a otros llevársela.
    id: 'vl-oriol', name: 'Oriol · joyería y relojería', building: 'vl-oriol', pre: 'VLORIOL', ambient: '#fff6ea',
    props: [
      ...many('vitrine', [[2, 3], [4, 3], [6, 3], [3, 6], [5, 6]]), at('wall-shelf', 9, 1), at('mirror', 12, 1), at('plant', 12, 4),
      at('floor-lamp', 1, 8), ...many('pendant', [[2, 2], [4, 2], [6, 2]]),
    ],
    browse: [[2, 4, 'up'], [4, 4, 'up'], [6, 4, 'up'], [3, 7, 'up'], [5, 7, 'up']],
    inspects: [
      { tx: 4, ty: 3, name: 'Vitrina de relojes', lines: ['Un automático suizo de acero, 6.400 €. A su lado, uno de oro rosa sin precio. Si hay que preguntarlo...'] },
      { tx: 3, ty: 6, name: 'Vitrina de anillos', lines: ['Solitarios, alianzas y un anillo de compromiso con una esmeralda. «Grabado gratuito», dice una tarjeta escrita a pluma.'] },
      { tx: 9, ty: 2, name: 'Pared de relojes', lines: ['Relojes de pared, de bolsillo y un cronógrafo de los años cincuenta restaurado en el taller de atrás.'] },
    ],
  },
  { VLORIOL_TRY_01: p(12, 2, 'interact', 'up'), ...pts('VLORIOL_FLOOR_', 'work', [[8, 4], [8, 6]]) },
);

const GOURMET: LocationDef = luxuryShop(
  {
    // Mercado Dorado: neveras de quesos y embutido, botelleros, góndolas de conservas y la fruta a la vista.
    id: 'vl-gourmet', name: 'Mercado Dorado', building: 'vl-gourmet', pre: 'VLGOURMET', ambient: '#fff4e4', catalog: 'gourmet-till',
    props: [
      ...many('fridge', [[2, 2], [3, 2], [4, 2]]), ...many('wine-rack', [[6, 2], [7, 2]]), at('shelf', 9, 2),
      ...many('gondola', [[4, 5], [5, 5], [8, 5]]), ...many('produce', [[12, 3], [12, 4]]), ...many('pendant', [[4, 4], [8, 4]]), at('plant', 1, 8),
    ],
    browse: [[3, 3, 'up'], [6, 3, 'up'], [4, 6, 'up'], [8, 6, 'up'], [11, 4, 'right']],
    inspects: [{ tx: 6, ty: 3, name: 'Botellero', lines: ['Riojas de pago, un Priorat de doce años y champagne a temperatura. Los precios, en una pizarra pequeña. Muy pequeña.'] }],
  },
  pts('VLGOURMET_FLOOR_', 'work', [[7, 4], [10, 5]]),
);

// ------------------------------------------------------------------ Salón Lis

const LIS_CHAIRS: Cell[] = [[3, 3], [6, 3], [9, 3]];

/** Salón Lis: tres tocadores con su espejo, el lavacabezas, sofá de espera y recepción; el corte, el de siempre (data/services.ts). */
const LIS: LocationDef = {
  id: 'vl-lis',
  name: 'Salón Lis',
  kind: 'interior',
  ground: room(14, 11, 7, () => 'f'),
  props: [
    ...many('mirror', LIS_CHAIRS.map(([x]) => [x - 1, 1] as Cell)),
    ...many('barber-chair', LIS_CHAIRS),
    at('sink', 12, 3),
    at('wall-shelf', 11, 1),
    ...many('counter', [[10, 7], [11, 7]]),
    at('register', 11, 7),
    at('sofa', 1, 6),
    at('plant', 12, 8),
    at('floor-lamp', 12, 5),
    ...many('pendant', LIS_CHAIRS.map(([x, y]) => [x, y - 1] as Cell)),
  ],
  ambient: '#fff0e6',
  ...toStreet('vl-lis', 7, 11),
  npcs: [],
  inspects: [{ tx: 4, ty: 8, name: 'Carta de servicios', lines: ['Corte, peinado, color y tratamiento de brillo. Sin precios: «consulte a su estilista». La consulta es gratis.'] }],
  points: {
    VLLIS_EXIT: p(7, 8, 'exit', 'up'),
    ...pts('VLLIS_CHAIR_', 'seat', LIS_CHAIRS, 'up'),
    VLLIS_STAFF_01: p(10, 5, 'work', 'left'),
    VLLIS_STAFF_02: p(4, 5, 'work', 'up'),
    VLLIS_RECEPTION: p(10, 8, 'interact', 'up'),
    VLLIS_WAIT_01: p(1, 6, 'seat', 'down'),
    VLLIS_WAIT_02: p(2, 6, 'seat', 'down'),
    VLLIS_WAIT_03: p(5, 8, 'wait', 'left'),
  },
};

// ------------------------------------------------------------------ Gran Hotel Velaria

/** Sofás del salón del lobby: dos filas de dos, cada uno de dos plazas. */
const HOTEL_SOFAS: Cell[] = [[15, 7], [18, 7], [15, 9], [18, 9]];

/**
 * El lobby del Gran Hotel Velaria: recepción con su casillero de llaves a la izquierda, el bar del lobby a la derecha,
 * el salón de sofás, carros de equipaje y una alfombra desde la puerta. Huéspedes que llegan y se van con la maleta,
 * reuniones de negocios en los sofás y quien entra a tomarse un café caro. Las habitaciones y el salón de eventos
 * existen detrás de sus puertas (se leen, no se abren): cuando haya sistema, se enganchan a HOTEL_LIFTS y HOTEL_EVENTS.
 */
const HOTEL: LocationDef = {
  id: 'vl-hotel',
  name: 'Gran Hotel Velaria',
  kind: 'interior',
  ground: room(22, 13, 11, (x, y) => (x >= 10 && x <= 12 && y >= 5 ? 'r' : 't')),
  props: [
    // Recepción: mostrador, caja y el casillero de llaves detrás.
    ...many('counter', [[2, 4], [3, 4], [4, 4], [5, 4], [6, 4]]),
    at('register', 6, 4),
    ...many('wall-shelf', [[2, 1], [4, 1]]),
    at('clock', 7, 1),
    // Bar del lobby.
    ...many('counter', [[17, 4], [18, 4], [19, 4], [20, 4]]),
    at('espresso', 17, 4),
    at('bottles', 18, 1),
    // Cuadros, el salón y los carros de equipaje.
    ...many('painting', [[10, 1], [13, 1]]),
    ...many('sofa', HOTEL_SOFAS),
    ...many('luggage-cart', [[8, 8], [3, 9]]),
    ...many('plant', [[1, 6], [20, 10], [14, 10]]),
    at('floor-lamp', 20, 7),
    ...many('pendant', [[4, 6], [11, 4], [17, 6]]),
  ],
  ambient: '#ffe4bc',
  ...toStreet('vl-hotel', 11, 13),
  npcs: [],
  terminals: [{ tx: 18, ty: 4, name: 'Bar del lobby · Gran Hotel Velaria', catalog: 'hotel-lobby-bar' }],
  inspects: [
    { tx: 20, ty: 2, name: 'Ascensores', lines: ['Dos ascensores de latón con su ascensorista de chaqueta granate. Sin la tarjeta de una habitación, no suben.'] },
    { tx: 1, ty: 2, name: 'Salón Alcalá', lines: ['Puerta de roble con un atril: «Salón Alcalá · evento privado». Dentro se oye a alguien probar un micrófono.'] },
    { tx: 4, ty: 3, name: 'Casillero de llaves', lines: ['Ciento doce casillas de madera. Las llaves ya son tarjetas, pero el casillero sigue: queda bien en las fotos.'] },
  ],
  points: {
    HOTEL_EXIT: p(11, 10, 'exit', 'up'),
    // Recepción: dos recepcionistas, sus dos puestos de atención y la cola.
    ...pts('HOTEL_STAFF_', 'work', [[3, 3], [5, 3]], 'down'),
    ...pts('HOTEL_DESK_', 'interact', [[3, 5], [5, 5]], 'up'),
    ...pts('HOTEL_QUEUE_', 'wait', [[4, 7], [5, 8]], 'up'),
    // El botones va del carro a la puerta y a recepción.
    ...pts('HOTEL_BELL_', 'work', [[7, 6], [9, 9], [13, 9]]),
    // Bar del lobby: quien atiende y dónde se pide.
    HOTEL_BAR_STAFF: p(18, 3, 'work', 'down'),
    ...pts('HOTEL_BAR_', 'interact', [[18, 5], [19, 5]], 'up'),
    // El salón: dos plazas por sofá.
    ...pts('HOTEL_SEAT_', 'seat', HOTEL_SOFAS.flatMap(([x, y]): Cell[] => [[x, y], [x + 1, y]]), 'down'),
    // Junto a las maletas: quien espera a que le den la habitación o el taxi.
    ...pts('HOTEL_WAIT_', 'wait', [[9, 8], [6, 9], [9, 6]], 'up'),
    // Para lo que venga: los ascensores (habitaciones) y la puerta del salón de eventos.
    HOTEL_LIFTS: p(20, 3, 'wait', 'up'),
    HOTEL_EVENTS: p(1, 3, 'wait', 'up'),
  },
};

// ------------------------------------------------------------------ Galería Aurelia

const GALLERY_WALL: Cell[] = [[2, 2], [5, 2], [8, 2], [11, 2], [14, 2]];

/** Galería Aurelia: una sala blanca, cinco cuadros, un banco en medio y la mesa de la galerista junto a la puerta. */
const GALERIA: LocationDef = {
  id: 'vl-galeria',
  name: 'Galería Aurelia',
  kind: 'interior',
  ground: room(18, 11, 9, () => 't'),
  props: [
    ...many('painting', GALLERY_WALL.map(([x]) => [x, 1] as Cell)),
    ...many('bench', [[8, 5], [9, 5]]),
    ...many('counter', [[13, 7], [14, 7]]),
    ...many('plant', [[1, 8], [16, 8]]),
    ...many('floor-lamp', [[1, 3], [16, 3]]),
  ],
  ambient: '#fffaf2',
  ...toStreet('vl-galeria', 9, 11),
  npcs: [],
  inspects: [
    { tx: 2, ty: 2, name: '«Cocina con luz de tarde»', lines: ['Óleo sobre lienzo, 120 × 90. Una cocina vacía con la ventana abierta. 12.000 €. Punto rojo: vendido.'] },
    { tx: 8, ty: 2, name: '«Pasillo, 1987»', lines: ['Un pasillo con una bici apoyada. Huele a casa de alguien. 9.500 €.'] },
    { tx: 14, ty: 2, name: '«Interior con gato»', lines: ['No hay ningún gato. La galerista dice que esa es la idea. 14.000 €.'] },
  ],
  points: {
    VLGAL_EXIT: p(9, 8, 'exit', 'up'),
    VLGAL_STAFF: p(14, 6, 'work', 'down'),
    VLGAL_DESK: p(13, 8, 'interact', 'up'),
    ...pts('VLGAL_VIEW_', 'interact', GALLERY_WALL, 'up'),
    ...pts('VLGAL_SEAT_', 'seat', [[8, 5], [9, 5]], 'down'),
  },
};

// ------------------------------------------------------------------ Clínica Nácar

/** Clínica Nácar: recepción junto a la puerta, sofá de espera y dos sillones de tratamiento con su espejo. */
const CLINICA: LocationDef = {
  id: 'vl-clinica',
  name: 'Clínica Nácar · medicina estética',
  kind: 'interior',
  ground: room(16, 11, 8, () => 't'),
  props: [
    ...many('barber-chair', [[4, 3], [10, 3]]),
    ...many('mirror', [[3, 1], [9, 1]]),
    at('shelf', 13, 2),
    at('painting', 6, 1),
    ...many('counter', [[10, 7], [11, 7]]),
    at('sofa', 2, 7),
    ...many('plant', [[1, 4], [14, 8]]),
    ...many('pendant', [[4, 2], [10, 2]]),
  ],
  ambient: '#f4f8ff',
  ...toStreet('vl-clinica', 8, 11),
  npcs: [],
  inspects: [{ tx: 13, ty: 3, name: 'Vitrina de cremas', lines: ['Sérums, protectores y una crema de noventa euros que promete «luz». Detrás, diplomas enmarcados.'] }],
  points: {
    VLCLIN_EXIT: p(8, 8, 'exit', 'up'),
    VLCLIN_STAFF: p(11, 6, 'work', 'down'),
    VLCLIN_DESK: p(10, 8, 'interact', 'up'),
    ...pts('VLCLIN_WAIT_', 'seat', [[2, 7], [3, 7]], 'down'),
    ...pts('VLCLIN_CHAIR_', 'seat', [[4, 3], [10, 3]], 'up'),
    ...pts('VLCLIN_DOC_', 'work', [[5, 4], [11, 4]]),
  },
};

// ------------------------------------------------------------------ los de siempre, con otra puerta
//
// Plantas que ya existen en otro barrio. Los puntos se piden por id desde cualquier sitio y no pueden repetirse
// (systems/LocationSystem), así que cada copia lleva su prefijo: CRGYM_ → VLGYM_, CAFE_RIO_ → VLCAFE_...

export const rekey = (id: string, from: string, to: string): string => (id.startsWith(from) ? to + id.slice(from.length) : id);

/** La misma planta con los puntos (y los asientos de sus mesas) con otro prefijo. */
export function rebased(loc: LocationDef, from: string, to: string): LocationDef {
  return {
    ...loc,
    points: Object.fromEntries(Object.entries(loc.points ?? {}).map(([k, v]) => [rekey(k, from, to), v])),
    tables: loc.tables?.map((t) => ({ ...t, seats: t.seats.map((s) => rekey(s, from, to)) })),
  };
}

/** Velaria Club: la sala de Barrio Fit, con otra luz y otra cuota. */
const VL_GYM: LocationDef = {
  ...rebased(GYM, 'CRGYM_', 'VLGYM_'),
  id: 'vl-gym', name: 'Velaria Club · gimnasio', ambient: '#eef2ff',
  portals: [{ id: 'exit', tx: 9, ty: 11, label: 'Salir a la calle', to: { location: STREET, spawn: 'vl-gym' } }],
};

/** Café Aurelia: la planta del Café del Río; la terraza, en la plaza (data/streets.ts). */
const VL_CAFE: LocationDef = {
  ...rebased(CAFE_RIO, 'CAFE_RIO_', 'VLCAFE_'),
  id: 'vl-cafe',
  name: 'Café Aurelia',
  ambient: '#fff0dc',
  ...toStreet('vl-cafe', 7, 10),
  terminals: [{ tx: 3, ty: 4, name: 'Barra · Café Aurelia', catalog: 'cafe-counter' }],
  inspects: [{ tx: 1, ty: 2, name: 'Pizarra', lines: ['Café de especialidad, tostadas de masa madre y, a partir de las doce, cava por copa. «La terraza se atiende en mesa.»'] }],
};

/** Alma: el comedor de Casa Tomás, sin barra de menú del día; aquí se viene a sentarse. */
const ALMA: LocationDef = { ...rebased(RESTAURANT, 'RESTAURANT_', 'ALMA_'), id: 'vl-alma', name: 'Alma · cocina de autor', ambient: '#ffdcb0', spots: [], ...toStreet('vl-alma', 10, 13) };

/** Vinoteca Marqués: la planta de La Cepa en la Calle Marqués. */
const VINOTECA: LocationDef = { ...rebased(WINE_BAR, 'WINE_BAR_', 'VLWINE_'), id: 'vl-vinoteca', name: 'Vinoteca Marqués', ambient: '#ffd2a8', ...toStreet('vl-vinoteca', 8, 12) };

export const VL_INTERIORS: readonly LocationDef[] = [
  FERRANT, BRISA, ORIOL, GOURMET, LIS, HOTEL, GALERIA, CLINICA, VL_GYM, VL_CAFE, ALMA, VINOTECA,
  ...FOOD_INTERIORS.filter((l) => l.id === 'kaizen'),
];

// ------------------------------------------------------------------ gente

/**
 * Cliente de una casa de lujo: mira con calma, a veces se prueba algo, y no siempre compra. Quien compra sale con la
 * bolsa (en la calle, data/streets.ts 'shopper' lleva las bolsas de data/ambientActions.ts).
 */
const luxuryCustomer = (pre: string, line: string, weight = 1, extra: Partial<VisitorRole> = {}): VisitorRole => ({
  role: 'customer', label: 'Cliente', line, weight,
  plan: [
    { state: 'BROWSE', points: [`${pre}_BROWSE_`], minutes: [2, 6], repeat: [1, 3] },
    { state: 'TRY', points: [`${pre}_TRY_`], minutes: [3, 8], chance: 0.6 },
    { state: 'QUEUE', points: [`${pre}_QUEUE_`], minutes: [1, 2], chance: 0.65 },
    { state: 'CHECKOUT', points: [`${pre}_TILL`], minutes: [2, 4], chance: 0.65 },
  ],
  ...extra,
});

/** Quien atiende en la sala de una casa de lujo: va de una zona a otra, nunca detrás del cliente. */
const floorStaff = (pre: string, label: string, line: string, minLevel?: StaffRole['minLevel']): StaffRole =>
  ({ service: 'shop-worker', label, line, look: 'uniforme-boutique', points: [`${pre}_FLOOR_`], minLevel });

const CR_GYM = CR_PROFILES.find((x) => x.place === 'cr-gym');
if (!CR_GYM) throw new Error('Falta el perfil del gimnasio de Cuatro Ríos');
/** El plan de Barrio Fit con los puntos de Velaria Club (rebased(GYM, 'CRGYM_', 'VLGYM_')). */
const toVlGym = <T extends { points: readonly string[] }>(s: T): T => ({ ...s, points: s.points.map((x) => rekey(x, 'CRGYM_', 'VLGYM_')) });

const LUXURY_WEEK: PopulationProfile['weekday'] = [-1, 0, 0, 0, 1, 1, -4];

export const VL_PROFILES: readonly PopulationProfile[] = [
  {
    place: 'vl-ferrant', bands: [[10.5, 13, 'LOW'], [13, 17, 'MEDIUM'], [17, 20.5, 'HIGH'], [20.5, 21, 'LOW']],
    weekday: LUXURY_WEEK, maxVisitors: 5,
    staff: [
      cashier('VLFERRANT', 'Maison Ferrant', 'Si quiere, se lo arreglamos a medida. Tarda una semana.', 'uniforme-boutique', 'shop-ferrant'),
      floorStaff('VLFERRANT', 'Asesora de Maison Ferrant', 'Ese corte le favorece. Pruébese también la talla de abajo.'),
    ],
    visitors: [
      luxuryCustomer('VLFERRANT', 'Busco un abrigo que dure diez años. Y que se note.', 2, { party: [1, 2] }),
      luxuryCustomer('VLFERRANT', 'Tengo una boda el sábado. Y una cena el viernes. Y prisa.', 1, { hours: [17, 21] }),
    ],
  },
  {
    place: 'vl-brisa', bands: [[10.5, 13, 'LOW'], [13, 17, 'MEDIUM'], [17, 20.5, 'HIGH']],
    weekday: LUXURY_WEEK, maxVisitors: 4,
    staff: [
      cashier('VLBRISA', 'Atelier Brisa', 'La piel se ablanda con el uso. Los primeros días, paciencia.', 'uniforme-boutique', 'shop-brisa'),
      floorStaff('VLBRISA', 'Zapatero de Atelier Brisa', '¿Qué número calza? Esta horma viene un poco justa.', 'MEDIUM'),
    ],
    visitors: [luxuryCustomer('VLBRISA', 'Quiero unos mocasines que no me hagan rozadura. Nunca lo consigo.', 1, { party: [1, 2] })],
  },
  {
    place: 'vl-oriol', bands: [[10.5, 13, 'LOW'], [13, 17, 'LOW'], [17, 20.5, 'MEDIUM']],
    weekday: LUXURY_WEEK, maxVisitors: 3,
    staff: [
      cashier('VLORIOL', 'Oriol', 'Si es un regalo, se lo grabamos sin coste.', 'uniforme-boutique'),
      floorStaff('VLORIOL', 'Relojero', 'Este calibre lleva cuarenta años sin pararse. Sólo hay que darle cuerda.'),
    ],
    visitors: [
      luxuryCustomer('VLORIOL', 'Es para un aniversario. El décimo. No me puedo equivocar.', 2, { party: [1, 2] }),
      {
        role: 'repair', label: 'Cliente del taller', line: 'Era de mi abuelo. Se paró el día que nací yo, dice mi madre.', weight: 1,
        plan: [{ state: 'QUEUE', points: ['VLORIOL_QUEUE_'], minutes: [1, 3] }, { state: 'CHECKOUT', points: ['VLORIOL_TILL'], minutes: [3, 6] }],
      },
    ],
  },
  {
    place: 'vl-gourmet', bands: [[9, 11, 'MEDIUM'], [11, 14, 'MEDIUM'], [14, 17, 'LOW'], [17, 20.5, 'HIGH'], [20.5, 21.5, 'MEDIUM']],
    weekday: [0, 0, 0, 0, 1, 1, -2], maxVisitors: 8,
    staff: [
      cashier('VLGOURMET', 'Caja · Mercado Dorado', 'El pan de masa madre sale a las once. Le guardo una si quiere.', 'uniforme-sala'),
      floorStaff('VLGOURMET', 'Reponiendo', 'El queso de oveja de la nevera es nuevo. Pruébelo, hay muestra.', 'MEDIUM'),
    ],
    visitors: [
      {
        role: 'customer', label: 'Cliente', line: 'Sólo venía por el pan. Me llevo también el aceite. Y el queso.', weight: 2, party: [1, 2],
        plan: [
          { state: 'BROWSE', points: ['VLGOURMET_BROWSE_'], minutes: [1, 4], repeat: [1, 3] },
          { state: 'QUEUE', points: ['VLGOURMET_QUEUE_'], minutes: [1, 2] },
          { state: 'CHECKOUT', points: ['VLGOURMET_TILL'], minutes: [1, 2] },
        ],
      },
    ],
  },
  {
    place: 'vl-lis', bands: [[10, 12, 'LOW'], [12, 14, 'MEDIUM'], [14, 17, 'MEDIUM'], [17, 20.5, 'HIGH']],
    weekday: [-1, 0, 0, 0, 1, 2, -4], maxVisitors: 5,
    staff: [
      { service: 'barber', label: 'Estilista · Salón Lis', line: 'Un poco más corto atrás y lo dejamos respirar. Confía en mí.', look: 'uniforme-boutique', points: ['VLLIS_STAFF_01'], serves: ['VLLIS_CHAIR_'], offers: 'haircut-lis' },
      { service: 'barber', label: 'Estilista', look: 'uniforme-boutique', points: ['VLLIS_STAFF_02'], serves: ['VLLIS_CHAIR_'], minLevel: 'MEDIUM', offers: 'haircut-lis' },
    ],
    visitors: [
      {
        role: 'haircut', label: 'Cliente del salón', line: 'Mañana tengo una presentación. Quiero parecer que he dormido.', weight: 4,
        plan: [
          { state: 'WAIT', points: ['VLLIS_WAIT_'], minutes: [3, 10] },
          { state: 'HAIRCUT', points: ['VLLIS_CHAIR_'], minutes: [30, 50] },
          { state: 'PAY', points: ['VLLIS_RECEPTION'], minutes: [1, 3] },
        ],
      },
    ],
  },
  {
    // El hotel nunca cierra: llegadas a mediodía y por la tarde, salidas por la mañana, reuniones y algún café.
    place: 'vl-hotel',
    bands: [[7, 10, 'HIGH'], [10, 13, 'MEDIUM'], [13, 17, 'MEDIUM'], [17, 21, 'HIGH'], [21, 24, 'MEDIUM'], [0, 2, 'LOW']],
    weekday: [0, 0, 0, 0, 1, 1, 0], maxVisitors: 12,
    staff: [
      { service: 'receptionist', label: 'Recepción · Gran Hotel Velaria', line: 'Bienvenido al Gran Hotel Velaria. ¿Tiene reserva?', look: 'uniforme-hotel', points: ['HOTEL_STAFF_01'] },
      { service: 'receptionist', label: 'Recepción', line: 'Su habitación estará lista en unos minutos. ¿Le apetece un café mientras?', look: 'uniforme-hotel', points: ['HOTEL_STAFF_02'], minLevel: 'MEDIUM' },
      { service: 'shop-worker', label: 'Botones', line: 'Sus maletas suben ahora mismo. Habitación cuatrocientos doce.', look: 'uniforme-hotel', points: ['HOTEL_BELL_'] },
      { service: 'bartender', label: 'Bar del lobby', line: '¿Un café? ¿Un vermú? A esta hora, cualquiera de los dos.', look: 'uniforme-noche', points: ['HOTEL_BAR_STAFF'] },
    ],
    visitors: [
      {
        role: 'hotel-guest', label: 'Huésped que llega', line: 'Doce horas de vuelo. Necesito una ducha y una cama, en ese orden.', weight: 3, hours: [11, 23],
        plan: [
          { state: 'QUEUE', points: ['HOTEL_QUEUE_'], minutes: [1, 3] },
          { state: 'CHECK_IN', points: ['HOTEL_DESK_'], minutes: [2, 4] },
          { state: 'WAIT', points: ['HOTEL_WAIT_'], minutes: [2, 6] },
        ],
      },
      {
        role: 'hotel-checkout', label: 'Huésped que se va', line: 'Me voy encantado. Y arruinado, pero encantado.', weight: 3, hours: [7, 13],
        plan: [
          { state: 'WAIT', points: ['HOTEL_SEAT_'], minutes: [4, 12] },
          { state: 'CHECK_OUT', points: ['HOTEL_DESK_'], minutes: [2, 4] },
          { state: 'WAIT', points: ['HOTEL_WAIT_'], minutes: [2, 5] },
        ],
      },
      {
        role: 'meeting', label: 'Reunión de negocios', line: 'Si cerramos hoy, la cena la pago yo. Si no, también.', weight: 2, hours: [9, 19], party: [2, 3],
        plan: [{ state: 'TALK', points: ['HOTEL_SEAT_'], minutes: [25, 55] }],
      },
      {
        role: 'lounge', label: 'Alguien tomando algo en el lobby', line: 'Aquí el café es carísimo. Pero el sofá está incluido.', weight: 2, party: [1, 2],
        plan: [
          { state: 'ORDER', points: ['HOTEL_BAR_'], minutes: [1, 3] },
          { state: 'DRINK', points: ['HOTEL_SEAT_'], minutes: [15, 35] },
        ],
      },
    ],
  },
  {
    place: 'vl-galeria', bands: [[11, 14, 'LOW'], [14, 17, 'LOW'], [17, 20.5, 'MEDIUM']],
    weekday: [-4, 0, 0, 0, 0, 1, 0], maxVisitors: 6,
    staff: [{ service: 'receptionist', label: 'Galerista', line: 'La artista viene el jueves a la inauguración. Si quiere, le aviso.', look: 'uniforme-boutique', points: ['VLGAL_STAFF'] }],
    visitors: [
      {
        role: 'gallery-visit', label: 'Alguien en la galería', line: 'Me lo llevaría todo. Bueno, me llevaría la pared.', weight: 3, party: [1, 2],
        plan: [
          { state: 'BROWSE', points: ['VLGAL_VIEW_'], minutes: [3, 6], repeat: [2, 4] },
          { state: 'REST', points: ['VLGAL_SEAT_'], minutes: [4, 10], chance: 0.4 },
        ],
      },
      {
        role: 'collector', label: 'Coleccionista', line: 'El punto rojo es mío. El de al lado, todavía no.', weight: 1, hours: [17, 20.5],
        plan: [
          { state: 'BROWSE', points: ['VLGAL_VIEW_'], minutes: [4, 8], repeat: [1, 2] },
          { state: 'TALK', points: ['VLGAL_DESK'], minutes: [6, 12] },
        ],
      },
    ],
  },
  {
    place: 'vl-clinica', bands: [[10, 13, 'MEDIUM'], [13, 16, 'LOW'], [16, 20, 'MEDIUM']],
    weekday: [0, 0, 0, 0, 0, -4, -4], maxVisitors: 4,
    staff: [
      { service: 'receptionist', label: 'Recepción · Clínica Nácar', line: '¿Tiene cita? Si es la primera vez, la valoración es gratuita.', look: 'uniforme-clinica', points: ['VLCLIN_STAFF'] },
      { service: 'shop-worker', label: 'Médica estética', line: 'Aquí no cambiamos caras: las descansamos.', look: 'uniforme-clinica', points: ['VLCLIN_DOC_'] },
    ],
    visitors: [
      {
        role: 'patient', label: 'Paciente', line: 'Sólo una limpieza. Lo de siempre, antes del verano.', weight: 2,
        plan: [
          { state: 'CHECK_IN', points: ['VLCLIN_DESK'], minutes: [1, 3] },
          { state: 'WAIT', points: ['VLCLIN_WAIT_'], minutes: [4, 12] },
          { state: 'TREATMENT', points: ['VLCLIN_CHAIR_'], minutes: [25, 45] },
          { state: 'PAY', points: ['VLCLIN_DESK'], minutes: [1, 3] },
        ],
      },
    ],
  },
  {
    ...CR_GYM,
    visitors: CR_GYM.visitors.map((v) => ({ ...v, plan: v.plan.map(toVlGym) })),
    changeBack: CR_GYM.changeBack && toVlGym(CR_GYM.changeBack),
    place: 'vl-gym',
    bands: [[6.5, 9.5, 'HIGH'], [9.5, 13, 'MEDIUM'], [13, 15, 'MEDIUM'], [15, 18, 'LOW'], [18, 21.5, 'HIGH'], [21.5, 23, 'LOW']],
    weekday: [0, 0, 0, 0, -1, -1, -2],
    staff: [
      { service: 'receptionist', label: 'Recepción · Velaria Club', line: 'Toalla y agua en su taquilla. ¿Le reservo entrenador para mañana?', look: 'uniforme-gym', points: ['VLGYM_STAFF'] },
      { service: 'gym-staff', label: 'Entrenador personal', line: 'Espalda recta. Otra vez. Muy bien.', points: ['VLGYM_COACH_'] },
    ],
  },
  {
    place: 'vl-cafe', bands: [[8, 11, 'HIGH'], [11, 13, 'MEDIUM'], [13, 16, 'HIGH'], [16, 20, 'MEDIUM'], [20, 22, 'LOW']],
    weekday: [0, 0, 0, 0, 0, 1, 1], maxVisitors: 6,
    staff: [{ service: 'bartender', label: 'Barra · Café Aurelia', line: 'Leche de avena, de almendra o de vaca. La de vaca, de la sierra.', look: 'uniforme-sala', points: ['VLCAFE_STAFF'] }],
    visitors: [
      {
        role: 'customer', label: 'Cliente', line: 'Un flat white y un cruasán. El portátil ya lo traigo yo.', weight: 3, party: [1, 2],
        plan: [
          { state: 'ORDER', points: ['VLCAFE_COUNTER', 'VLCAFE_QUEUE_'], minutes: [1, 3] },
          { state: 'DRINK', points: ['VLCAFE_TABLE_'], minutes: [15, 40] },
        ],
      },
      {
        role: 'takeaway', label: 'Alguien con prisa', line: 'Para llevar. Tengo comité a las nueve y media.', weight: 2, hours: [8, 11],
        plan: [{ state: 'ORDER', points: ['VLCAFE_COUNTER', 'VLCAFE_QUEUE_'], minutes: [1, 2] }],
      },
    ],
  },
  {
    place: 'vl-alma', bands: [[13.5, 16, 'MEDIUM'], [20.5, 23, 'HIGH'], [23, 24, 'MEDIUM']],
    weekday: [-1, 0, 0, 0, 1, 1, -1], maxVisitors: 12,
    staff: [
      { service: 'cook', label: 'Cocina · Alma', line: 'El pichón, en su punto. Ni un segundo más.', look: 'uniforme-sala', points: ['ALMA_STAFF'] },
      { service: 'waiter', line: 'Buenas noches. ¿Agua con gas o sin gas?', look: 'uniforme-noche', points: ['ALMA_WAITER_'], serves: ['ALMA_TABLE_'] },
      { service: 'waiter', line: 'Le recomiendo el Ribera con el pichón.', look: 'uniforme-noche', points: ['ALMA_WAITER_'], serves: ['ALMA_TABLE_'], minLevel: 'MEDIUM' },
    ],
    tableService: { menu: 'alma', pass: 'ALMA_PASS', kitchen: 'ALMA_STAFF' },
    visitors: [
      {
        role: 'diner', label: 'Comensal', line: 'Hemos reservado hace tres semanas. Merece la pena, dicen.', weight: 1, party: [1, 2],
        plan: [
          { state: 'WAIT', points: ['ALMA_WAIT_'], minutes: [1, 3] },
          { state: 'DINE', points: ['ALMA_TABLE_'], minutes: [80, 130] },
        ],
      },
    ],
  },
  {
    place: 'vl-vinoteca', bands: [[18, 20, 'LOW'], [20, 23, 'HIGH'], [23, 24, 'MEDIUM'], [0, 1, 'LOW']],
    weekday: [-2, 0, 0, 0, 1, 1, -1], maxVisitors: 10,
    staff: [
      { service: 'bartender', label: 'Barra · Vinoteca Marqués', line: 'Ese Mencía lo abrimos ayer. Hoy está mejor.', look: 'uniforme-noche', points: ['VLWINE_STAFF'] },
      { service: 'waiter', line: '¿Les recomiendo algo de la bodega?', look: 'uniforme-noche', points: ['VLWINE_WAITER'], serves: ['VLWINE_TABLE_', 'VLWINE_DATE_'] },
    ],
    tableService: { menu: 'vinoteca-marques', pass: 'VLWINE_PASS', kitchen: 'VLWINE_STAFF' },
    visitors: [
      {
        role: 'couple', label: 'Una pareja', line: '(Hablan bajito. No es tu conversación.)', weight: 3, party: [2, 2],
        plan: [{ state: 'DRINK', points: ['VLWINE_DATE_', 'VLWINE_TABLE_'], minutes: [35, 70] }],
      },
      {
        role: 'after-work', label: 'Compañeros de la oficina', line: 'Una copa y a casa. Bueno, dos.', weight: 2, party: [2, 3], hours: [19, 23],
        plan: [{ state: 'DRINK', points: ['VLWINE_TABLE_'], minutes: [30, 60] }],
      },
      {
        role: 'bar', label: 'Alguien en la barra', line: 'Ponme lo que tú te beberías.', weight: 1,
        plan: [{ state: 'DRINK', points: ['VLWINE_STOOL_'], minutes: [20, 45] }],
      },
    ],
  },
  ...FOOD_VENUE_PROFILES.filter((v) => v.place === 'kaizen'),
];
