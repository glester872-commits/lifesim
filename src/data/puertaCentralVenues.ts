import type { LocationDef } from '../types/game.ts';
import type { PopulationProfile } from './population.ts';
import { at, CAFE_RIO, many } from './interiors.ts';
import { cashier, customer, shopRoom } from './cuatroRiosVenues.ts';
import { FOOD_INTERIORS } from './foodInteriors.ts';
import { FOOD_VENUE_PROFILES } from './foodVenues.ts';
import { rebased } from './velariaVenues.ts';

/**
 * Los locales de Puerta Central (data/puertaCentral.ts) por dentro, todos con los cimientos de siempre: la pizzería y
 * la hamburguesería salen de sus arquetipos (data/foodVenues.ts: carta, mesas con servicio, mostrador para llevar), el
 * Café Central es la planta del Café del Río con su terraza en la plaza, y las dos tiendas son la tienda pequeña de
 * Cuatro Ríos (shopRoom) con sus percheros: lo que se compra se paga en el perchero y se lleva puesto.
 */

const STREET = 'puerta-central';
const FOOD = new Set(['pc-pizza', 'pc-burger']);

// ------------------------------------------------------------------ tiendas

/** Recuerdos de la Puerta: camisetas y sudaderas de la plaza, estanterías de imanes y postales, la cesta de oferta. */
const RECUERDOS: LocationDef = shopRoom({
  id: 'pc-recuerdos', name: 'Recuerdos de la Puerta', building: 'pc-recuerdos', street: STREET, pre: 'PCRECUERDOS', ambient: '#fff4dc',
  props: [
    ...many('clothes-rack', [[3, 3], [6, 3]]), ...many('wall-shelf', [[9, 1], [11, 1]]), at('bargain-bin', 4, 6), at('display-table', 8, 5),
    at('tube-light', 5, 4),
  ],
  browse: [[3, 4, 'up'], [6, 4, 'up'], [10, 2, 'up'], [4, 7, 'up'], [8, 6, 'up']],
  racks: [
    { tx: 3, ty: 4, name: 'Camisetas de la plaza', store: 'recuerdos', categories: ['camiseta'] },
    { tx: 6, ty: 4, name: 'Sudaderas', store: 'recuerdos', categories: ['sudadera'] },
    { tx: 4, ty: 7, name: 'Cesta de oferta', store: 'recuerdos' },
  ],
  inspects: [
    { tx: 10, ty: 2, name: 'Estantería de recuerdos', lines: ['Imanes de la Rosa de los Vientos, postales de la plaza de noche, abanicos, castañuelas y un toro de peluche con sombrero. Todo «hecho aquí», dice el cartel. Aquí cerca, más bien.'] },
  ],
});

/** Moda Central: la cadena de siempre, en tres plantas que aquí son una. Básicos, vaqueros, temporada y rebajas. */
const MODA: LocationDef = shopRoom({
  id: 'pc-moda', name: 'Moda Central', building: 'pc-moda', street: STREET, pre: 'PCMODA', ambient: '#f6f6fa',
  props: [
    ...many('clothes-rack', [[2, 3], [5, 3], [8, 3]]), at('mannequin', 11, 3), at('fitting-room', 1, 6), at('display-table', 4, 6),
    at('mirror', 12, 1), ...many('tube-light', [[3, 2], [7, 2]]),
  ],
  browse: [[2, 4, 'up'], [5, 4, 'up'], [8, 4, 'up'], [4, 7, 'up'], [11, 4, 'up']],
  racks: [
    { tx: 2, ty: 4, name: 'Básicos', store: 'central', categories: ['camiseta', 'camisa'] },
    { tx: 5, ty: 4, name: 'Vaqueros y pantalones', store: 'central', categories: ['vaquero', 'pantalon'] },
    { tx: 8, ty: 4, name: 'Temporada', store: 'central' },
    { tx: 4, ty: 7, name: 'Mesa de rebajas', store: 'central' },
  ],
  inspects: [{ tx: 11, ty: 4, name: 'Maniquí', lines: ['Vaquero, camiseta blanca y cazadora. Encima, un cartel: «Nueva colección». Debajo, otro: «-30 %».'] }],
});

// ------------------------------------------------------------------ el café

/** Café Central: la planta del Café del Río; la terraza, en la plaza (data/streets.ts). */
const PC_CAFE: LocationDef = {
  ...rebased(CAFE_RIO, 'CAFE_RIO_', 'PCCAFE_'),
  id: 'pc-cafe',
  name: 'Café Central',
  ambient: '#fff0dc',
  portals: [{ id: 'exit', tx: 7, ty: 8, label: 'Salir a la plaza', to: { location: STREET, spawn: 'pc-cafe' } }],
  spawns: { entry: { tx: 7, ty: 7, facing: 'up' } },
  terminals: [{ tx: 3, ty: 4, name: 'Barra · Café Central', catalog: 'cafe-counter' }],
  inspects: [{ tx: 1, ty: 2, name: 'Pizarra', lines: ['Desayuno de la casa: café, tostada y zumo. «Menú en inglés, francés e italiano: pídalo».'] }],
};

// ------------------------------------------------------------------ la comisaría

/**
 * Comisaría de Puerta Central (systems/Police): la planta de la tienda pequeña sin caja ni mostrador. La guardia, de pie
 * delante de la mesa de recepción (le hablas: la seguridad de la zona y, si te han robado, la denuncia), sillas para
 * esperar turno y el tablón. Se sale por donde se entra, a la plaza.
 */
const COMISARIA_ROOM = shopRoom({
  id: 'pc-comisaria', name: 'Comisaría de Puerta Central', building: 'pc-comisaria', street: STREET, pre: 'PCPOLICIA', ambient: '#eef2f6',
  props: [
    at('info-board', 4, 1), at('poster', 7, 1), at('clock', 10, 1), ...many('plant', [[1, 1], [12, 1]]), at('desk', 11, 5),
    ...many('chair-right', [[2, 5], [2, 6], [2, 7]]), ...many('tube-light', [[4, 4], [9, 4]]),
  ],
  browse: [[3, 5, 'left'], [3, 7, 'left'], [4, 2, 'up']],
  inspects: [{ tx: 4, ty: 2, name: 'Tablón de la comisaría', lines: ['Policía de Distrito · Comisaría de Puerta Central. Abierto las 24 horas.', '«En la plaza, la cartera delante y el móvil a la vista.» «Si te roban en la calle, la denuncia se pone aquí, en recepción.»'] }],
});
const COMISARIA: LocationDef = {
  ...COMISARIA_ROOM,
  // Una recepción, no una tienda: sin mostrador ni caja. La guardia está de pie delante de su mesa (la de la pantalla), a
  // tiro de quien llega: detrás de un mostrador quedaría fuera del alcance para hablar (INTERACT_RADIUS).
  props: (COMISARIA_ROOM.props ?? []).filter((prop) => prop.kind !== 'register' && prop.kind !== 'counter'),
  portals: [{ id: 'exit', tx: 7, ty: 9, label: 'Salir a la plaza', to: { location: STREET, spawn: 'pc-comisaria' } }],
};

export const PC_INTERIORS: readonly LocationDef[] = [RECUERDOS, MODA, PC_CAFE, COMISARIA, ...FOOD_INTERIORS.filter((l) => FOOD.has(l.id))];

// ------------------------------------------------------------------ gente

export const PC_PROFILES: readonly PopulationProfile[] = [
  {
    // Abierto todos los días hasta tarde: el turismo no descansa en domingo.
    place: 'pc-recuerdos', bands: [[10, 12, 'MEDIUM'], [12, 17, 'HIGH'], [17, 21, 'VERY_HIGH'], [21, 22, 'MEDIUM']],
    weekday: [-1, -1, 0, 0, 1, 1, 1], maxVisitors: 6,
    staff: [cashier('PCRECUERDOS', 'Recuerdos de la Puerta', 'La de la Rosa es la que más se lleva. La talla, siempre una más.', 'uniforme-tienda', 'shop-recuerdos')],
    visitors: [
      customer('PCRECUERDOS', 'Una para mi hermana, otra para mi madre y... bueno, otra para mí.', 2, { party: [1, 3] }),
      customer('PCRECUERDOS', '¿Tiene imanes que no sean de toros?', 1, { label: 'Turista', party: [2, 3] }),
    ],
  },
  {
    place: 'pc-moda', bands: [[10, 13, 'MEDIUM'], [13, 17, 'HIGH'], [17, 21, 'VERY_HIGH'], [21, 22, 'MEDIUM']],
    weekday: [-1, 0, 0, 0, 1, 2, 0], maxVisitors: 6,
    staff: [cashier('PCMODA', 'Moda Central', 'Si no te vale, tienes treinta días. Con tique.', 'uniforme-tienda', 'shop-central')],
    visitors: [customer('PCMODA', 'Vengo a por unos vaqueros. Siempre vengo a por unos vaqueros.', 2, { party: [1, 2] })],
  },
  {
    // Siempre hay guardia; de día entra más gente (un trámite, una pregunta) que de madrugada.
    place: 'pc-comisaria', bands: [[0, 8, 'VERY_LOW'], [8, 21, 'LOW'], [21, 24, 'VERY_LOW']],
    weekday: [0, 0, 0, 0, 0, 0, 0], maxVisitors: 2,
    staff: [{ service: 'police-officer', label: 'Agente de guardia', line: 'Buenas. ¿En qué te puedo ayudar?', look: 'uniforme-policia', points: ['PCPOLICIA_STAFF'] }],
    visitors: [
      {
        role: 'complainant', label: 'Alguien esperando turno', line: 'Vengo a por un papel. Llevo media hora para un papel.', weight: 1,
        plan: [
          { state: 'WAIT', points: ['PCPOLICIA_BROWSE_'], minutes: [4, 10] },
          { state: 'QUEUE', points: ['PCPOLICIA_QUEUE_'], minutes: [1, 2] },
          { state: 'TALK', points: ['PCPOLICIA_TILL'], minutes: [3, 6] },
        ],
      },
    ],
  },
  {
    place: 'pc-cafe', bands: [[7.5, 10.5, 'VERY_HIGH'], [10.5, 13, 'HIGH'], [13, 16, 'MEDIUM'], [16, 20, 'HIGH'], [20, 22.5, 'MEDIUM']],
    weekday: [0, 0, 0, 0, 0, 1, 1], maxVisitors: 6,
    staff: [{ service: 'bartender', label: 'Barra · Café Central', line: 'Café con leche, cortado, americano. Y el «spanish coffee», que es un café con leche.', look: 'uniforme-sala', points: ['PCCAFE_STAFF'] }],
    visitors: [
      {
        role: 'customer', label: 'Cliente', line: 'Un café y una tostada con tomate. Y el wifi, por favor.', weight: 3, party: [1, 2],
        plan: [
          { state: 'ORDER', points: ['PCCAFE_COUNTER', 'PCCAFE_QUEUE_'], minutes: [1, 3] },
          { state: 'DRINK', points: ['PCCAFE_TABLE_'], minutes: [10, 30] },
        ],
      },
      {
        role: 'takeaway', label: 'Alguien con prisa', line: 'Para llevar, que pierdo el metro.', weight: 3, hours: [7.5, 10.5],
        plan: [{ state: 'ORDER', points: ['PCCAFE_COUNTER', 'PCCAFE_QUEUE_'], minutes: [1, 2] }],
      },
    ],
  },
  ...FOOD_VENUE_PROFILES.filter((v) => FOOD.has(v.place)),
];
