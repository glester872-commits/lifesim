/**
 * Cosas que se pueden tener. Un objeto de consumo se gasta al usarlo y
 * devuelve energía; una tarjeta no se gasta: lleva saldo (GameState.cards).
 * Lo que cuesta cada cosa depende de dónde se compre: eso va en data/catalogs.ts.
 */
import { takeawayItems } from './foodItems.ts';

export interface ItemDef {
  id: string;
  name: string;
  /**
   * ingredient: no se come tal cual, se usa (cocinar); medicine: se toma y quita el cansancio; hygiene: se gasta en
   * una actividad (la ducha de casa), no desde la bolsa.
   */
  kind: 'food' | 'drink' | 'ingredient' | 'medicine' | 'hygiene' | 'gift' | 'card';
  /** Energía que devuelve al consumirlo. */
  energy?: number;
  /** Lo que se lee al usarlo. */
  use?: string;
  /** Dónde se usa si no es desde la bolsa (ingredient, hygiene): lo enseña la tienda antes de comprar. */
  where?: string;
  /** Unidades que caben en la bolsa (CARRY_MAX si no se dice). */
  max?: number;
}

/** Lo que cabe de cada cosa en la bolsa: comprar más se niega y se explica (systems/Commerce.checkout). */
export const CARRY_MAX = 12;

export const ITEMS: readonly ItemDef[] = [
  { id: 'water', name: 'Agua', kind: 'drink', energy: 3, use: 'Agua fría. Tampoco hace milagros.' },
  { id: 'cola', name: 'Refresco de cola', kind: 'drink', energy: 6, use: 'Azúcar y burbujas. Funciona un rato.' },
  { id: 'energy-drink', name: 'Bebida energética', kind: 'drink', energy: 15, use: 'Sabe a pila. Pero despierta.' },
  { id: 'chips', name: 'Patatas fritas', kind: 'food', energy: 5, use: 'La bolsa es más grande que lo que trae.' },
  { id: 'chocolate', name: 'Chocolatina', kind: 'food', energy: 8, use: 'Medio minuto de felicidad.' },
  { id: 'sandwich', name: 'Sándwich', kind: 'food', energy: 12, use: 'Pan de molde y esperanza. Llena.' },
  { id: 'coffee', name: 'Café con leche', kind: 'drink', energy: 10, use: 'Ahora sí.' },
  { id: 'croissant', name: 'Cruasán', kind: 'food', energy: 8, use: 'Deja migas en todas partes.' },
  // Segunda tanda: la compra (para cocinar en casa), la panadería y la farmacia.
  { id: 'groceries', name: 'Bolsa de la compra', kind: 'ingredient', where: 'se cocina en la cocina de casa (+30 ⚡)', use: 'Arroz, huevos, verdura y algo de pescado. Da para una comida de verdad, si la cocinas.' },
  // Súper Rosales (CV-02): lo que faltaba para comer sin cocinar, un zumo y el gel de la ducha de casa.
  { id: 'ready-meal', name: 'Plato preparado', kind: 'food', energy: 16, use: 'Lentejas de tarrina, templadas a medias. Llenan igual.' },
  { id: 'juice', name: 'Zumo de naranja', kind: 'drink', energy: 7, use: 'Del brik, frío. Sabe a desayuno aunque sean las seis.' },
  // Una unidad es una ducha: el bote trae 8 (data/catalogs.ts) y caben dos botes.
  // Almacenes Velarde, regalos (CV-03): se dan hablando con alguien que conoces (systems/Gifts.ts), no se usan.
  { id: 'gift-chocolates', name: 'Caja de bombones', kind: 'gift', where: 'se regala hablando con alguien que conoces (una vez al día por persona)', max: 3, use: 'Bombones surtidos con lazo dorado.' },
  { id: 'gift-cologne', name: 'Colonia de regalo', kind: 'gift', where: 'se regala hablando con alguien que conoces (una vez al día por persona)', max: 2, use: 'Frasco de cristal, envuelto en papel verde de Velarde.' },
  { id: 'shower-gel', name: 'Gel de ducha', kind: 'hygiene', where: 'en la ducha de casa: ducha con gel, +10 ⚡ en vez de +6', max: 16, use: 'Huele a algo que se llama «brisa marina».' },
  { id: 'bread', name: 'Barra de pan', kind: 'food', energy: 6, use: 'Crujiente por fuera. Te comes el pico antes de llegar a casa.' },
  { id: 'pastry', name: 'Napolitana de chocolate', kind: 'food', energy: 9, use: 'Todavía caliente.' },
  { id: 'fruit', name: 'Bolsa de fruta', kind: 'food', energy: 5, use: 'Una manzana. La más fea, la más buena.' },
  { id: 'ibuprofen', name: 'Ibuprofeno', kind: 'medicine', energy: 14, use: 'A la media hora el dolor de cabeza es un recuerdo.' },
  { id: 'vitamins', name: 'Vitaminas', kind: 'medicine', energy: 8, use: 'Efervescente de naranja. Burbujea más que despierta.' },
  // Ribera Norte: el quiosco de helados.
  { id: 'ice-cream', name: 'Helado de cucurucho', kind: 'food', energy: 7, use: 'Se derrite más rápido de lo que lo comes. Siempre.' },
  { id: 'ice-lolly', name: 'Polo de limón', kind: 'food', energy: 5, use: 'Ácido, frío, y los dedos pegajosos hasta mañana.' },
  { id: 'transport', name: 'Tarjeta de transporte', kind: 'card' },
  // Para llevar de pizzerías, hamburgueserías y sushi (data/foodItems.ts).
  ...takeawayItems,
];

const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

export function getItem(id: string): ItemDef {
  const item = BY_ID.get(id);
  if (!item) throw new Error(`Objeto desconocido: ${id}`);
  return item;
}
