/**
 * Cosas que se pueden tener. Un objeto de consumo se gasta al usarlo y
 * devuelve energía; una tarjeta no se gasta: lleva saldo (GameState.cards).
 * Lo que cuesta cada cosa depende de dónde se compre: eso va en data/catalogs.ts.
 */
import { takeawayItems } from './foodItems.ts';

export interface ItemDef {
  id: string;
  name: string;
  /** ingredient: no se come tal cual, se usa (cocinar); medicine: se toma y quita el cansancio. */
  kind: 'food' | 'drink' | 'ingredient' | 'medicine' | 'card';
  /** Energía que devuelve al consumirlo. */
  energy?: number;
  /** Lo que se lee al usarlo. */
  use?: string;
}

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
  { id: 'groceries', name: 'Bolsa de la compra', kind: 'ingredient', use: 'Arroz, huevos, verdura y algo de pescado. Da para una comida de verdad, si la cocinas.' },
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
