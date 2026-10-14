import type { LocationDef } from '../types/game.ts';
import type { PopulationProfile, VisitorRole } from './population.ts';
import type { OfferId } from './services.ts';
import { at, CAFE_RIO, many } from './interiors.ts';
import { cashier, customer, shopRoom } from './cuatroRiosVenues.ts';
import { FOOD_INTERIORS } from './foodInteriors.ts';
import { FOOD_VENUE_PROFILES } from './foodVenues.ts';
import { rebased } from './velariaVenues.ts';

/**
 * Los locales del Distrito Arena (data/arena.ts) por dentro, con los cimientos de siempre: la tienda de deportes y la
 * tienda oficial son la tienda pequeña de Cuatro Ríos con sus percheros (lo que se compra se lleva puesto), el Café
 * del Córner es la planta del Café del Río, la hamburguesería y la pizzería salen de sus arquetipos, y los dos bares
 * son la planta del Bar Ribera (se montan en data/locations.ts, donde vive esa planta).
 *
 * Lo propio del barrio está en los perfiles: `match` sube o baja cada local según la fase del partido
 * (systems/Match) y `fans` dice cuánta clientela viene con la camiseta. Un martes sin partido, el bar es un bar.
 */

const STREET = 'arena';
const FOOD = new Set(['ar-burger', 'ar-pizza']);

// ------------------------------------------------------------------ tiendas

/** Deportes Arena: botas, chándales y balones; lo de diario del que juega los domingos. */
const DEPORTES: LocationDef = shopRoom({
  id: 'ar-deportes', name: 'Deportes Arena', building: 'ar-deportes', street: STREET, pre: 'ARDEPORTES', ambient: '#eef4ff',
  props: [...many('clothes-rack', [[2, 3], [5, 3]]), at('sneaker-wall', 8, 1), at('display-table', 3, 6), at('mirror', 12, 1), at('tube-light', 5, 2)],
  browse: [[2, 4, 'up'], [5, 4, 'up'], [8, 2, 'up'], [3, 7, 'up']],
  racks: [
    { tx: 2, ty: 4, name: 'Chándales y sudaderas', store: 'deportes-arena', categories: ['sudadera', 'pantalon'] },
    { tx: 5, ty: 4, name: 'Camisetas técnicas', store: 'deportes-arena', categories: ['camiseta'] },
    { tx: 8, ty: 2, name: 'Zapatillas', store: 'deportes-arena', categories: ['zapatillas'] },
  ],
  inspects: [{ tx: 3, ty: 6, name: 'Mesa de balones', lines: ['Balones de reglamento, de fútbol sala y uno firmado por la plantilla de hace tres temporadas. Ese no se vende.'] }],
});

/** Tienda Oficial Halcones: las dos equipaciones, la sudadera y el chándal del club, todo en turquesa y naranja. */
const OFICIAL: LocationDef = shopRoom({
  id: 'ar-oficial', name: 'Tienda Oficial Halcones', building: 'ar-oficial', street: STREET, pre: 'AROFICIAL', ambient: '#e8fbf8',
  props: [...many('clothes-rack', [[2, 3], [5, 3], [8, 3]]), at('mannequin', 11, 3), at('wall-shelf', 12, 1), at('display-table', 4, 6), at('tube-light', 5, 2)],
  browse: [[2, 4, 'up'], [5, 4, 'up'], [8, 4, 'up'], [11, 4, 'up'], [4, 7, 'up']],
  racks: [
    { tx: 2, ty: 4, name: 'Equipaciones', store: 'halcones', categories: ['camiseta'] },
    { tx: 5, ty: 4, name: 'Sudaderas del club', store: 'halcones', categories: ['sudadera'] },
    { tx: 8, ty: 4, name: 'Chándal', store: 'halcones', categories: ['pantalon'] },
    { tx: 4, ty: 7, name: 'Mesa de la temporada', store: 'halcones' },
  ],
  inspects: [{ tx: 11, ty: 4, name: 'Maniquí', lines: ['La primera equipación: turquesa, cuello y mangas naranjas, y un halcón bordado en el pecho. «Nueva temporada».'] }],
});

// ------------------------------------------------------------------ el café

/** Café del Córner: la planta del Café del Río; desayunos de diario y, en día de partido, el café de antes del saque. */
const CAFE: LocationDef = {
  ...rebased(CAFE_RIO, 'CAFE_RIO_', 'ARCAFE_'),
  id: 'ar-cafe',
  name: 'Café del Córner',
  ambient: '#fff0dc',
  portals: [{ id: 'exit', tx: 7, ty: 8, label: 'Salir a la calle', to: { location: STREET, spawn: 'ar-cafe' } }],
  spawns: { entry: { tx: 7, ty: 7, facing: 'up' } },
  terminals: [{ tx: 3, ty: 4, name: 'Barra · Café del Córner', catalog: 'cafe-counter' }],
  inspects: [{ tx: 1, ty: 2, name: 'Pizarra', lines: ['«Café y tostada, 2,80». Debajo, con otra tiza: «Hoy juegan los Halcones: abrimos una hora antes».'] }],
};

export const AR_INTERIORS: readonly LocationDef[] = [DEPORTES, OFICIAL, CAFE, ...FOOD_INTERIORS.filter((l) => FOOD.has(l.id))];

// ------------------------------------------------------------------ gente

/** Los dos bares del barrio: la planta del Bar Ribera con su prefijo. La barra, la de siempre; la tele, encendida. */
function barProfile(place: string, pre: string, offers: OfferId, line: string, match: PopulationProfile['match']): PopulationProfile {
  const fan = (role: string, label: string, said: string, weight: number, party: readonly [number, number]): VisitorRole => ({
    role, label, line: said, weight, party,
    plan: [
      { state: 'ORDER', points: [`${pre}_COUNTER_`], minutes: [2, 4] },
      { state: 'DRINK', points: [`${pre}_TABLE_`, `${pre}_STOOL_`, `${pre}_COUNTER_`], minutes: [30, 55] },
      { state: 'TALK', points: [`${pre}_TABLE_`], minutes: [15, 30], chance: 0.5 },
      { state: 'ORDER', points: [`${pre}_COUNTER_`], minutes: [2, 4], chance: 0.6 },
      { state: 'DRINK', points: [`${pre}_TABLE_`, `${pre}_STOOL_`], minutes: [20, 40], chance: 0.6 },
    ],
  });
  return {
    place,
    // Un bar de barrio: el vermú, la caña de la salida del trabajo y algo de noche. El partido lo cambia todo (match).
    bands: [[11, 14, 'LOW'], [14, 19, 'LOW'], [19, 23, 'MEDIUM'], [23, 24, 'LOW'], [0, 1, 'LOW']],
    weekday: [-1, 0, 0, 0, 1, 1, 0],
    maxVisitors: 12,
    drinks: ['beer', 'beer', 'beer', 'beer', 'wine', 'soft', 'water'],
    staff: [{ service: 'barkeeper', label: 'Camarero', line, look: 'uniforme-sala', points: [`${pre}_STAFF_`], offers }],
    visitors: [
      fan('regular', 'Parroquiano', 'Aquí veo todos los partidos. En el estadio me pongo nervioso.', 2, [1, 2]),
      fan('friends', 'Cliente', 'Una ronda antes del partido. Y otra después, pase lo que pase.', 3, [2, 4]),
    ],
    match,
    fans: 0.8,
  };
}

export const AR_PROFILES: readonly PopulationProfile[] = [
  {
    place: 'ar-deportes', bands: [[10, 13, 'LOW'], [13, 17, 'LOW'], [17, 20.5, 'MEDIUM'], [20.5, 21, 'LOW']],
    weekday: [0, 0, 0, 0, 0, 1, -4], maxVisitors: 5,
    staff: [cashier('ARDEPORTES', 'Deportes Arena', 'Las de tacos, para hierba natural. Las de multitaco, para todo lo demás.', 'uniforme-tienda', 'shop-deportes-arena')],
    visitors: [customer('ARDEPORTES', 'Unas espinilleras para el crío, que el sábado juega de central.', 1, { party: [1, 2] })],
    match: { 'build-up': 1, arrival: 1 },
    fans: 0.4,
  },
  {
    // La tienda oficial: tranquila entre semana; antes del partido, cola para la camiseta.
    place: 'ar-oficial', bands: [[10, 13, 'LOW'], [13, 17, 'LOW'], [17, 21, 'MEDIUM']],
    weekday: [0, 0, 0, 0, 0, 1, 0], maxVisitors: 7,
    staff: [cashier('AROFICIAL', 'Tienda Oficial Halcones', 'La primera, la segunda o la de portero. Con nombre y número, diez euros más.', 'uniforme-tienda', 'shop-halcones')],
    visitors: [
      customer('AROFICIAL', 'La camiseta de este año, que la del año pasado ya da mala suerte.', 2, { party: [1, 3] }),
      customer('AROFICIAL', 'Una sudadera para mi sobrina. Su primer partido.', 1, { label: 'Aficionado', party: [2, 3] }),
    ],
    match: { 'build-up': 2, arrival: 2, live: -1, leaving: 1, after: 1 },
    fans: 0.7,
  },
  {
    place: 'ar-cafe', bands: [[7.5, 10.5, 'MEDIUM'], [10.5, 13, 'LOW'], [13, 16, 'MEDIUM'], [16, 20, 'LOW'], [20, 21, 'LOW']],
    weekday: [0, 0, 0, 0, 0, 0, -1], maxVisitors: 6,
    staff: [{ service: 'bartender', label: 'Barra · Café del Córner', line: 'Café, tostada y el periódico deportivo. Por ese orden.', look: 'uniforme-sala', points: ['ARCAFE_STAFF'] }],
    visitors: [
      {
        role: 'customer', label: 'Cliente', line: 'Un cortado y la previa del partido, que hoy hay mucho que comentar.', weight: 3, party: [1, 2],
        plan: [
          { state: 'ORDER', points: ['ARCAFE_COUNTER', 'ARCAFE_QUEUE_'], minutes: [1, 3] },
          { state: 'DRINK', points: ['ARCAFE_TABLE_'], minutes: [10, 30] },
        ],
      },
      {
        role: 'takeaway', label: 'Alguien con prisa', line: 'Para llevar, que entro a trabajar en la tienda.', weight: 2, hours: [7.5, 10.5],
        plan: [{ state: 'ORDER', points: ['ARCAFE_COUNTER', 'ARCAFE_QUEUE_'], minutes: [1, 2] }],
      },
    ],
    match: { 'build-up': 1, arrival: 1 },
    fans: 0.5,
  },
  barProfile('ar-larguero', 'ARLARG', 'bar-larguero', '¿Caña o doble? Hoy, doble, que hay partido.', { 'build-up': 3, arrival: 1, live: 1, leaving: 2, after: 3 }),
  barProfile('ar-grada', 'ARGRADA', 'bar-grada', 'La tele grande está al fondo. Si te sientas ahí, no te muevas.', { 'build-up': 2, arrival: 1, live: 2, leaving: 2, after: 3 }),
  // La hamburguesería y la pizzería: de sus arquetipos, con el partido encima.
  ...FOOD_VENUE_PROFILES.filter((v) => FOOD.has(v.place)).map((v) => ({ ...v, match: { 'build-up': 1, leaving: 2, after: 2 }, fans: 0.6 })),
];
