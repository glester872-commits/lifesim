import type { ItemDef } from './items.ts';
import type { Dish, MenuItem } from './menus.ts';

/**
 * Comida y bebida como objetos reutilizables. Una definición sirve igual para
 * la carta de un local con servicio de mesa (MenuItem, vía `toMenuItem`), para
 * llevársela en la bolsa (ItemDef, vía `takeawayItems`: va por la misma caja y
 * el mismo inventario que cualquier compra, systems/Commerce.ts) y, mañana,
 * para el hambre, la nutrición y los gustos de cada uno: ya están en el dato,
 * hoy sólo la energía se usa. Un local no inventa platos: elige de aquí y
 * ajusta precio y ritmo (data/foodVenues.ts).
 */

export interface Nutrition {
  /** Lo que da al acabarlo: la única necesidad que hay hoy en la partida. */
  energy: number;
  /** Cuánta hambre quita (0–100), para cuando exista la necesidad. */
  hunger: number;
  kcal: number;
}

export interface FoodDef {
  id: string;
  name: string;
  kind: 'food' | 'drink';
  /** Lo que se ve en la mesa (world/DiningArt.ts). */
  dish: Dish;
  /** Precio base en euros; cada local lo multiplica por el suyo. */
  price: number;
  /** Minutos de juego en cocina o barra, y en comerlo. */
  prep: number;
  duration: number;
  nutrition: Nutrition;
  /** Gustos y dietas: 'queso', 'frito', 'pescado', 'dulce', 'caliente', 'frío', 'vegetariano'... */
  tags: readonly string[];
  /** Lo que se lee al comerlo de la bolsa. */
  use: string;
  /** Si no aguanta el camino (sashimi, omakase, sake), no se pide para llevar. */
  takeaway?: false;
}

const f = (
  id: string, name: string, kind: FoodDef['kind'], dish: Dish, price: number, prep: number, duration: number,
  nutrition: Nutrition, tags: readonly string[], use: string, takeaway?: false,
): FoodDef => ({ id, name, kind, dish, price, prep, duration, nutrition, tags, use, ...(takeaway === false ? { takeaway } : {}) });

export const FOODS: readonly FoodDef[] = [
  // Pizzería
  f('pizza-margherita', 'Pizza margarita', 'food', 'pizza', 9, 12, 30, { energy: 28, hunger: 55, kcal: 780 }, ['queso', 'caliente', 'vegetariano'], 'Tomate, mozzarella y borde quemado. Como debe ser.'),
  f('pizza-pepperoni', 'Pizza pepperoni', 'food', 'pizza', 11, 12, 30, { energy: 31, hunger: 58, kcal: 880 }, ['queso', 'caliente', 'embutido', 'graso'], 'Cada rodaja deja un charquito rojo en el cartón.'),
  f('pizza-slice', 'Porción de pizza', 'food', 'pizza', 3.5, 3, 10, { energy: 11, hunger: 20, kcal: 290 }, ['queso', 'caliente', 'rápido'], 'De pie, en la acera, quemándote el paladar.'),
  // Hamburguesería
  f('burger-classic', 'Hamburguesa clásica', 'food', 'burger', 8, 6, 14, { energy: 26, hunger: 50, kcal: 720 }, ['carne', 'caliente', 'rápido', 'graso'], 'Carne, queso y salsa por los dedos.'),
  f('burger-double', 'Hamburguesa doble', 'food', 'burger', 10.5, 7, 18, { energy: 34, hunger: 66, kcal: 1050 }, ['carne', 'caliente', 'graso'], 'No cabe en la boca. Se intenta igual.'),
  f('fries', 'Patatas fritas', 'food', 'fries', 3, 4, 8, { energy: 10, hunger: 18, kcal: 380 }, ['frito', 'caliente', 'vegetariano', 'graso'], 'Calientes y saladas. Se acaban antes de sentarte.'),
  // Sushi
  f('maki-roll', 'Rollo de maki (8)', 'food', 'sushi', 8, 8, 18, { energy: 18, hunger: 35, kcal: 380 }, ['pescado', 'frío', 'arroz'], 'Con demasiado wasabi. Los ojos lloran, la sonrisa no.'),
  f('nigiri-set', 'Nigiri variado (6)', 'food', 'nigiri', 12, 10, 18, { energy: 20, hunger: 38, kcal: 330 }, ['pescado', 'frío', 'arroz'], 'Una pieza, un bocado, ni una más.'),
  f('sashimi', 'Sashimi de temporada', 'food', 'nigiri', 24, 12, 22, { energy: 16, hunger: 28, kcal: 240 }, ['pescado', 'frío', 'ligero'], 'Pescado cortado con una paciencia que se nota.', false),
  f('omakase', 'Omakase del chef', 'food', 'nigiri', 68, 30, 70, { energy: 40, hunger: 80, kcal: 900 }, ['pescado', 'frío', 'degustación'], 'Lo que el chef decide. No se discute.', false),
  // Bebidas
  f('cola', 'Refresco de cola', 'drink', 'soda', 2.5, 1, 10, { energy: 6, hunger: 0, kcal: 140 }, ['dulce', 'frío'], 'Azúcar y burbujas. Funciona un rato.'),
  f('water', 'Agua', 'drink', 'water', 1.5, 1, 8, { energy: 3, hunger: 0, kcal: 0 }, ['frío'], 'Agua fría. Tampoco hace milagros.'),
  f('beer', 'Caña', 'drink', 'beer', 2.8, 1, 15, { energy: 1, hunger: 2, kcal: 150 }, ['alcohol', 'frío'], 'Fría, con espuma. Hace su trabajo.', false),
  f('coffee', 'Café', 'drink', 'coffee', 1.6, 2, 6, { energy: 8, hunger: 0, kcal: 5 }, ['caliente', 'cafeína'], 'Ahora sí.'),
  f('green-tea', 'Té verde', 'drink', 'tea', 2.8, 2, 10, { energy: 4, hunger: 0, kcal: 0 }, ['caliente', 'ligero'], 'Amargo y limpio. Te asienta el estómago.'),
  f('sake', 'Sake', 'drink', 'wine-white', 6, 1, 18, { energy: 1, hunger: 1, kcal: 130 }, ['alcohol'], 'Cálido y suave. Engaña.', false),
];

const BY_ID = new Map(FOODS.map((x) => [x.id, x]));

export function getFood(id: string): FoodDef {
  const food = BY_ID.get(id);
  if (!food) throw new Error(`Comida desconocida: ${id}`);
  return food;
}

/** Id del objeto que se lleva en la bolsa (data/items.ts). */
export const bagId = (foodId: string): string => `food-${foodId}`;

/** Cómo entra un plato en una carta. `pace` encoge o estira lo que tarda (el local rápido, el de degustación). */
export function toMenuItem(
  food: FoodDef,
  category: string,
  opts: { price?: number; pace?: number; hours?: readonly [number, number] } = {},
): MenuItem {
  const pace = opts.pace ?? 1;
  return {
    id: food.id,
    name: food.name,
    price: opts.price ?? food.price,
    kind: food.kind,
    category,
    prep: Math.max(1, Math.round(food.prep * pace)),
    duration: Math.max(2, Math.round(food.duration * pace)),
    energy: food.nutrition.energy,
    dish: food.dish,
    tags: food.tags,
    ...(opts.hours ? { hours: opts.hours } : {}),
  };
}

/** Lo que se puede llevar, como objetos de la bolsa: se come con el mismo `consume` que un sándwich. */
export const takeawayItems: readonly ItemDef[] = FOODS.filter((x) => x.takeaway !== false).map((x) => ({
  id: bagId(x.id),
  name: x.name,
  kind: x.kind,
  energy: x.nutrition.energy,
  use: x.use,
}));

/** Cuánto le gusta a quien tiene estos gustos (etiquetas con signo: 'queso', '-pescado'): para elegir, no para prohibir. */
export function liking(food: FoodDef, prefs: readonly string[]): number {
  let score = 0;
  for (const p of prefs) {
    if (p.startsWith('-')) score -= food.tags.includes(p.slice(1)) ? 1 : 0;
    else score += food.tags.includes(p) ? 1 : 0;
  }
  return score;
}
