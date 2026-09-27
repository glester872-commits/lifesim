/**
 * Lo que se vende en cada sitio y a qué precio. Una máquina expendedora, la
 * barra de un café y la máquina de billetes son lo mismo: un catálogo de
 * productos con precio y efecto. systems/Commerce.ts aplica la compra, sea
 * cual sea el sitio; un restaurante o una tienda nuevos son una entrada más.
 */

/** Qué se lleva el jugador al pagar. */
export type Effect =
  /** Unidades de un objeto de data/items.ts. */
  | { item: string; qty?: number }
  /** Saldo en una tarjeta; `issue` la emite (sólo si aún no se tiene), sin él es una recarga. */
  | { card: string; load: number; issue?: boolean };

export interface Product {
  id: string;
  label: string;
  /** Euros. */
  price: number;
  effect: Effect;
}

export interface Catalog {
  id: string;
  /** Lo que dice la máquina o el mostrador al abrirse. */
  greeting: string;
  products: readonly Product[];
}

const item = (id: string, label: string, price: number): Product => ({ id, label, price, effect: { item: id } });

export const CATALOGS: readonly Catalog[] = [
  {
    id: 'vending',
    greeting: 'Máquina expendedora. Acepta monedas, tarjeta y, con suerte, billetes.',
    products: [
      item('water', 'Agua', 1),
      item('cola', 'Refresco de cola', 1.2),
      item('energy-drink', 'Bebida energética', 2),
      item('chips', 'Patatas fritas', 1.3),
      item('chocolate', 'Chocolatina', 1.2),
      item('sandwich', 'Sándwich', 3),
    ],
  },
  {
    id: 'cafe-counter',
    greeting: '¿Qué te pongo?',
    // Café y obrador: lo de tomar aquí y el pan para casa.
    products: [item('coffee', 'Café con leche', 1.8), item('croissant', 'Cruasán', 1.6), item('pastry', 'Napolitana de chocolate', 1.9), item('bread', 'Barra de pan', 1.1), item('water', 'Agua', 1.2), item('sandwich', 'Sándwich', 3.5)],
  },
  {
    // La caja del súper: más barato que la máquina, y lo único que trae para cocinar.
    id: 'supermarket-till',
    greeting: 'Buenas. ¿Bolsa?',
    products: [item('groceries', 'Compra para cocinar', 9), item('bread', 'Barra de pan', 0.9), item('fruit', 'Bolsa de fruta', 2.4), item('water', 'Agua (1,5 l)', 0.6), item('chocolate', 'Chocolatina', 1), item('chips', 'Patatas fritas', 1.1)],
  },
  {
    id: 'pharmacy-counter',
    greeting: 'Buenas tardes. ¿Qué necesitas?',
    products: [item('ibuprofen', 'Ibuprofeno 400 mg', 3.2), item('vitamins', 'Vitaminas efervescentes', 6.5), item('water', 'Agua', 1.5)],
  },
  {
    // La misma máquina en todas las estaciones.
    id: 'transport-machine',
    greeting: 'Metro · Línea 2. Tarjetas y recargas. El viaje se descuenta al subir al tren.',
    products: [
      { id: 'transport-new', label: 'Tarjeta de transporte (con €10 de saldo)', price: 12.5, effect: { card: 'transport', load: 10, issue: true } },
      { id: 'transport-10', label: 'Recargar €10', price: 10, effect: { card: 'transport', load: 10 } },
      { id: 'transport-20', label: 'Recargar €20', price: 20, effect: { card: 'transport', load: 20 } },
    ],
  },
];

const BY_ID = new Map(CATALOGS.map((c) => [c.id, c]));

export function getCatalog(id: string): Catalog {
  const catalog = BY_ID.get(id);
  if (!catalog) throw new Error(`Catálogo desconocido: ${id}`);
  return catalog;
}
