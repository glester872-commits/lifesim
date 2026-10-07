import type { Catalog } from './catalogs.ts';
import { bagId, getFood, toMenuItem } from './foodItems.ts';
import type { ServiceMenu, VenueLines } from './menus.ts';
import type { PopulationProfile, VisitorRole } from './population.ts';

/**
 * Locales de comida de la ciudad: un ARQUETIPO dice qué es (pizzería,
 * hamburguesería, sushi casual o premium) y de él salen, sin escribir nada a
 * mano, las cuatro piezas que ya sabe usar el juego:
 *
 *   carta      → ServiceMenu (data/menus.ts), con platos de data/foodItems.ts
 *   caja       → Catalog (data/catalogs.ts): lo que se pide para llevar
 *   población  → PopulationProfile (data/population.ts): camareros, cocina, clientes
 *   interior   → LocationDef (data/foodInteriors.ts): mesas, barra, cocina y puntos
 *
 * Todo lo demás es lo de siempre: el servicio de mesa (systems/TableService)
 * lleva al camarero, al comensal y al jugador; la bolsa y la cartera
 * (systems/Commerce), el pago; las horas, el reloj del juego. Un local nuevo
 * es una entrada en FOOD_VENUES; un tipo nuevo, un arquetipo.
 */

export type Cuisine = 'pizza' | 'burger' | 'sushi';
export type Tier = 'casual' | 'premium';

/** Lo que tiene el local y se ve en la sala (lo comprueba scripts/check-food-venues.ts). */
export type Feature =
  | 'counter' | 'kitchen' | 'tables' | 'prep-area' | 'takeaway' | 'delivery-pickup' | 'trays' | 'sushi-bar' | 'presentation';

export interface Layout {
  w: number;
  h: number;
  doorX: number;
  /** Esquina de cada mesa de dos: sus sillas van delante y a su derecha. */
  tables: readonly (readonly [number, number])[];
  /** Taburetes de barra (y = 5), mirando al cocinero. */
  bar?: readonly (readonly [number, number])[];
  /** Mostrador (y = 4): de x0 a x1, ambos incluidos. El pase está en x1 + 1. */
  counter: readonly [number, number];
  /** Cocina: dónde están los fogones u horno. */
  stoveX: number;
  /** Mesas de preparación (pizza), en y = 3. */
  prepTables?: readonly number[];
}

export interface FoodArchetype {
  id: string;
  cuisine: Cuisine;
  tier: Tier;
  features: readonly Feature[];
  /** Cuánto tarda todo respecto a la carta base: el local rápido gira más mesas. */
  pace: number;
  /** Cuánto cuesta respecto al precio base. */
  priceFactor: number;
  categories: readonly { id: string; title: string }[];
  /** [plato, categoría, franja opcional]. */
  menu: readonly (readonly [string, string] | readonly [string, string, readonly [number, number]])[];
  /** Platos que se piden en el mostrador y se llevan en la bolsa. Sin él, no hay para llevar. */
  takeaway?: readonly string[];
  lines: VenueLines;
  layout: Layout;
  hours: readonly [number, number];
  capacity: number;
  bands: PopulationProfile['bands'];
  weekday: PopulationProfile['weekday'];
  /** Minutos que se está sentado [mín, máx]. */
  dine: readonly [number, number];
  maxVisitors: number;
  /** Lo que dice quien cocina, quien atiende y quien come. */
  staffLines: { cook: string; waiter: string; guest: string };
}

const LINES_CASUAL: VenueLines = {
  greet: ['¿Qué os pongo?', 'Cuando queráis, os tomo nota.', '¿Ya sabéis lo que queréis?'],
  again: ['¿Algo más?', '¿Os pongo otra cosa?'],
  confirm: ['Marchando.', 'Enseguida.', 'Perfecto.'],
  serve: ['Aquí tenéis. ¡Que aproveche!', 'Caliente, cuidado.'],
  bill: ['La cuenta, cuando queráis.', 'Aquí tenéis la cuenta.'],
  thanks: ['¡Gracias! Hasta pronto.', 'Gracias, ¡volved cuando queráis!'],
  later: ['Sin prisa, vuelvo luego.', 'Tranquilo, ahora vengo.'],
};

const LINES_FAST: VenueLines = {
  greet: ['Dime, ¿qué va a ser?', '¿Qué te pongo?', 'Siguiente, por favor.'],
  again: ['¿Algo más?', '¿Con patatas?'],
  confirm: ['Marchando.', 'Sale en un momento.', 'Ahora mismo, en la bandeja.'],
  serve: ['Tu bandeja. ¡A comer!', 'Aquí está. Caliente.'],
  bill: ['Son estos. Cuando quieras.', 'La cuenta, sin prisa.'],
  thanks: ['Gracias, ¡hasta luego!', 'Buen provecho.'],
  later: ['Cuando te decidas.', 'Aquí estoy.'],
};

const LINES_PREMIUM: VenueLines = {
  greet: ['Buenas noches. ¿Les presento la carta?', 'Bienvenidos. Cuando gusten.', 'Con calma. ¿Les recomiendo algo?'],
  again: ['¿Les apetece algo más?', '¿Una pieza más, quizá?'],
  confirm: ['Muy bien, enseguida.', 'Excelente elección.', 'Con mucho gusto.'],
  serve: ['Aquí tienen. Empiecen de claro a oscuro.', 'Que lo disfruten.'],
  bill: ['Cuando gusten, la cuenta.', 'Les traigo la cuenta.'],
  thanks: ['Ha sido un placer. Hasta pronto.', 'Gracias por su visita.'],
  later: ['Por supuesto, sin prisa.', 'Cuando estén listos.'],
};

const BANDS_LUNCH_DINNER: PopulationProfile['bands'] = [[13, 15, 'HIGH'], [15, 20, 'LOW'], [20, 23, 'HIGH'], [23, 24, 'LOW']];

export const ARCHETYPES: readonly FoodArchetype[] = [
  {
    id: 'pizza-casual',
    cuisine: 'pizza',
    tier: 'casual',
    features: ['counter', 'kitchen', 'tables', 'prep-area', 'takeaway', 'delivery-pickup'],
    pace: 1,
    priceFactor: 1,
    categories: [{ id: 'pizzas', title: 'Pizzas' }, { id: 'bebidas', title: 'Bebidas' }],
    menu: [
      ['pizza-margherita', 'pizzas'], ['pizza-pepperoni', 'pizzas'], ['pizza-slice', 'pizzas', [12, 24]],
      ['cola', 'bebidas'], ['water', 'bebidas'], ['beer', 'bebidas'], ['coffee', 'bebidas'],
    ],
    takeaway: ['pizza-margherita', 'pizza-pepperoni', 'pizza-slice', 'cola', 'water'],
    lines: LINES_CASUAL,
    layout: {
      w: 17, h: 12, doorX: 8,
      tables: [[8, 4], [11, 4], [14, 4], [8, 7], [11, 7], [14, 7]],
      counter: [2, 5], stoveX: 3, prepTables: [2, 5],
    },
    hours: [12, 24],
    capacity: 16,
    bands: BANDS_LUNCH_DINNER,
    weekday: [-1, -1, 0, 0, 1, 1, 1],
    dine: [40, 70],
    maxVisitors: 10,
    staffLines: { cook: 'La masa necesita su tiempo. Y el horno, el suyo.', waiter: '¿Mesa dentro o para llevar?', guest: 'Esto es pizza de verdad, no cartón.' },
  },
  {
    id: 'burger-fast',
    cuisine: 'burger',
    tier: 'casual',
    features: ['counter', 'kitchen', 'tables', 'trays', 'takeaway'],
    pace: 0.6,
    priceFactor: 1,
    categories: [{ id: 'hamburguesas', title: 'Hamburguesas' }, { id: 'extras', title: 'Extras' }, { id: 'bebidas', title: 'Bebidas' }],
    menu: [
      ['burger-classic', 'hamburguesas'], ['burger-double', 'hamburguesas'],
      ['fries', 'extras'],
      ['cola', 'bebidas'], ['water', 'bebidas'], ['beer', 'bebidas'], ['coffee', 'bebidas'],
    ],
    takeaway: ['burger-classic', 'burger-double', 'fries', 'cola', 'water', 'coffee'],
    lines: LINES_FAST,
    layout: {
      w: 17, h: 12, doorX: 8,
      tables: [[8, 4], [11, 4], [14, 4], [8, 7], [11, 7], [14, 7], [3, 8], [6, 8]],
      counter: [2, 6], stoveX: 4,
    },
    hours: [11, 24],
    capacity: 20,
    bands: [[12, 15, 'VERY_HIGH'], [15, 19, 'MEDIUM'], [19, 22, 'VERY_HIGH'], [22, 24, 'LOW']],
    weekday: [0, 0, 0, 0, 1, 1, 1],
    dine: [15, 30],
    maxVisitors: 14,
    staffLines: { cook: 'Sin parar. Una detrás de otra.', waiter: 'Tu bandeja, ahora.', guest: 'Rápida, grasienta y buena. Tres de tres.' },
  },
  {
    id: 'sushi-casual',
    cuisine: 'sushi',
    tier: 'casual',
    features: ['counter', 'kitchen', 'tables', 'sushi-bar', 'takeaway'],
    pace: 0.9,
    priceFactor: 1,
    categories: [{ id: 'sushi', title: 'Sushi' }, { id: 'bebidas', title: 'Bebidas' }],
    menu: [
      ['maki-roll', 'sushi'], ['nigiri-set', 'sushi'],
      ['green-tea', 'bebidas'], ['cola', 'bebidas'], ['water', 'bebidas'], ['beer', 'bebidas'],
    ],
    takeaway: ['maki-roll', 'nigiri-set', 'green-tea', 'water'],
    lines: LINES_CASUAL,
    layout: {
      w: 17, h: 12, doorX: 8,
      tables: [[9, 4], [12, 4], [15, 4], [9, 7], [12, 7]],
      bar: [[3, 5], [4, 5], [5, 5]],
      counter: [2, 6], stoveX: 4,
    },
    hours: [13, 24],
    capacity: 16,
    bands: BANDS_LUNCH_DINNER,
    weekday: [-1, -1, 0, 0, 1, 1, 0],
    dine: [35, 60],
    maxVisitors: 10,
    staffLines: { cook: 'El arroz, a su temperatura. Todo lo demás, a la mía.', waiter: 'Podéis pedir en la barra o en mesa.', guest: 'Siempre pido de más. Siempre.' },
  },
  {
    id: 'sushi-premium',
    cuisine: 'sushi',
    tier: 'premium',
    features: ['counter', 'kitchen', 'tables', 'sushi-bar', 'presentation'],
    pace: 1.4,
    priceFactor: 1.5,
    categories: [{ id: 'barra', title: 'Barra' }, { id: 'degustacion', title: 'Degustación' }, { id: 'bebidas', title: 'Bebidas' }],
    menu: [
      ['nigiri-set', 'barra'], ['sashimi', 'barra'], ['maki-roll', 'barra'],
      ['omakase', 'degustacion', [19, 24]],
      ['green-tea', 'bebidas'], ['sake', 'bebidas'], ['water', 'bebidas'],
    ],
    lines: LINES_PREMIUM,
    layout: {
      w: 19, h: 13, doorX: 9,
      tables: [[11, 4], [14, 4], [11, 7], [14, 7]],
      bar: [[3, 5], [5, 5], [7, 5]],
      counter: [2, 8], stoveX: 4,
    },
    hours: [19, 24],
    capacity: 14,
    bands: [[19, 20, 'MEDIUM'], [20, 23, 'HIGH'], [23, 24, 'LOW']],
    weekday: [-1, -1, 0, 0, 1, 1, 0],
    dine: [70, 110],
    maxVisitors: 8,
    staffLines: { cook: 'Se mira, se huele y luego se come. En ese orden.', waiter: 'Buenas noches. ¿Su reserva?', guest: 'Aquí no se viene con prisa.' },
  },
];

const ARCH = new Map(ARCHETYPES.map((a) => [a.id, a]));

export function getArchetype(id: string): FoodArchetype {
  const a = ARCH.get(id);
  if (!a) throw new Error(`Arquetipo de comida desconocido: ${id}`);
  return a;
}

/** Un local concreto: el arquetipo, cómo se llama, el prefijo de sus puntos y a qué calle da. */
export interface FoodVenue {
  id: string;
  archetype: string;
  name: string;
  /** Prefijo de los puntos del interior (PIZZA → PIZZA_TABLE_01...). */
  prefix: string;
  /** Mapa y edificio de la calle cuya puerta es la entrada (spawn de salida del interior). */
  door: { location: string; building: string };
}

/**
 * Los locales que hay. Ninguno tiene todavía edificio en el mapa (los barrios
 * actuales no tienen solar), así que su interior (FOOD_INTERIORS) y su perfil
 * (FOOD_VENUE_PROFILES) todavía no están en data/locations.ts ni en
 * data/population.ts: los demás checks recorren esas listas y esperan un lugar
 * con edificio. Para ponerlo: un `b(...)` con `enter: into(id)` y `door.building`
 * como id en la calle, su lugar en data/places.ts, y esas dos listas esparcidas
 * donde se registran. Carta y caja ya están (data/menus.ts, data/catalogs.ts).
 * El premium es del barrio de Velaria, que aún no tiene mapa.
 */
export const FOOD_VENUES: readonly FoodVenue[] = [
  { id: 'pizzeria-roma', archetype: 'pizza-casual', name: 'Pizzería Roma', prefix: 'PIZZA', door: { location: 'district', building: 'pizzeria-roma-door' } },
  { id: 'burger-norte', archetype: 'burger-fast', name: 'Burger Norte', prefix: 'BURGER', door: { location: 'district', building: 'burger-norte-door' } },
  { id: 'sushi-nori', archetype: 'sushi-casual', name: 'Sushi Nori', prefix: 'NORI', door: { location: 'district', building: 'sushi-nori-door' } },
  { id: 'kaizen', archetype: 'sushi-premium', name: 'Kaizen', prefix: 'KAIZEN', door: { location: 'velaria', building: 'kaizen-door' } },
];

// ------------------------------------------------------------------ derivados

const price = (foodId: string, a: FoodArchetype): number => Math.round(getFood(foodId).price * a.priceFactor * 10) / 10;

export function menuOf(v: FoodVenue): ServiceMenu {
  const a = getArchetype(v.archetype);
  return {
    id: v.id,
    title: v.name,
    venue: 'restaurant',
    categories: a.categories,
    items: a.menu.map((e) => toMenuItem(getFood(e[0]), e[1], { price: price(e[0], a), pace: a.pace, hours: e[2] })),
    lines: a.lines,
    more: [{ label: 'Pedir otra cosa' }, { label: 'Ver carta' }],
  };
}

/** Caja de para llevar: el mismo mostrador de cualquier tienda. Sin `takeaway`, no hay caja. */
export function takeawayCatalogOf(v: FoodVenue): Catalog | null {
  const a = getArchetype(v.archetype);
  if (!a.takeaway) return null;
  return {
    id: `${v.id}-takeaway`,
    greeting: a.cuisine === 'pizza' ? 'Para llevar: dime y en un momento está.' : a.cuisine === 'burger' ? 'Para llevar. ¿Qué pongo en la bolsa?' : 'Para llevar, bien envuelto. ¿Qué te pongo?',
    products: a.takeaway.map((id) => ({ id: `${v.id}:${id}`, label: getFood(id).name, price: price(id, a), effect: { item: bagId(id) } })),
  };
}

export function profileOf(v: FoodVenue): PopulationProfile {
  const a = getArchetype(v.archetype);
  const P = v.prefix;
  const sit = [`${P}_TABLE_`, ...(a.layout.bar ? [`${P}_BAR_`] : [])];
  const visitors: VisitorRole[] = [
    {
      role: 'diner', label: 'Comensal', line: a.staffLines.guest, weight: 1, party: [1, 2],
      plan: [
        { state: 'WAIT', points: [`${P}_WAIT_`], minutes: [1, 3] },
        { state: 'DINE', points: sit, minutes: a.dine },
      ],
    },
  ];
  if (a.takeaway) {
    visitors.push({
      role: 'takeaway', label: 'Alguien para llevar', line: 'Para llevar, que me esperan.', weight: a.cuisine === 'burger' ? 3 : 2,
      plan: [{ state: 'ORDER', points: [`${P}_COUNTER`, `${P}_QUEUE_`], minutes: [2, 5] }],
    });
  }
  if (a.features.includes('delivery-pickup')) {
    visitors.push({
      role: 'courier', label: 'Repartidor', line: 'Dos pedidos más y acabo el turno.', weight: 1.5, hours: [13, 23],
      plan: [{ state: 'WAIT', points: [`${P}_PICKUP`], minutes: [2, 6] }],
    });
  }
  return {
    place: v.id,
    bands: a.bands,
    weekday: a.weekday,
    maxVisitors: a.maxVisitors,
    staff: [
      { service: 'cook', label: `Cocina · ${v.name}`, line: a.staffLines.cook, points: [`${P}_STAFF`] },
      { service: 'waiter', line: a.staffLines.waiter, points: [`${P}_WAITER_`], serves: sit },
      { service: 'waiter', line: a.staffLines.waiter, points: [`${P}_WAITER_`], serves: sit, minLevel: 'MEDIUM' },
    ],
    tableService: { menu: v.id, pass: `${P}_PASS`, kitchen: `${P}_STAFF` },
    visitors,
  };
}

export const FOOD_VENUE_MENUS: readonly ServiceMenu[] = FOOD_VENUES.map(menuOf);
export const FOOD_VENUE_CATALOGS: readonly Catalog[] = FOOD_VENUES.flatMap((v) => takeawayCatalogOf(v) ?? []);
export const FOOD_VENUE_PROFILES: readonly PopulationProfile[] = FOOD_VENUES.map(profileOf);
