/**
 * Cartas de los locales con servicio de mesa (systems/TableService.ts). Un
 * plato o una bebida es un precio, lo que tarda la cocina, lo que se tarda en
 * tomarlo y lo que se ve en la mesa. El café, un bar o la vinoteca tendrán la
 * suya: es otra entrada aquí y `tableService.menu` en su perfil de población.
 */

/** Lo que se ve en la mesa (world/DiningArt.ts dibuja cada uno lleno y vacío). */
export type Dish = 'stew' | 'fish' | 'tortilla' | 'croquettes' | 'cake' | 'water' | 'beer' | 'wine' | 'soda' | 'coffee';

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  kind: 'food' | 'drink';
  /** Minutos de juego que tarda en salir de cocina (o de la barra). */
  prep: number;
  /** Minutos de juego que se tarda en comerlo o bebérselo. */
  duration: number;
  /** Energía que da al acabarlo. */
  energy: number;
  dish: Dish;
  /** Sólo se sirve en esta franja [desde, hasta) en horas. */
  hours?: readonly [number, number];
}

export interface ServiceMenu {
  id: string;
  title: string;
  items: readonly MenuItem[];
}

export const MENUS: readonly ServiceMenu[] = [
  {
    id: 'casa-tomas',
    title: 'Casa Tomás',
    items: [
      { id: 'menu-dia', name: 'Menú del día: lentejas y merluza', price: 11, kind: 'food', prep: 10, duration: 40, energy: 32, dish: 'stew', hours: [13, 16] },
      { id: 'tortilla', name: 'Tortilla de patatas', price: 6.5, kind: 'food', prep: 8, duration: 20, energy: 18, dish: 'tortilla' },
      { id: 'croquetas', name: 'Croquetas caseras (6)', price: 7, kind: 'food', prep: 10, duration: 20, energy: 16, dish: 'croquettes' },
      { id: 'merluza', name: 'Merluza a la romana', price: 13, kind: 'food', prep: 14, duration: 30, energy: 26, dish: 'fish', hours: [13, 24] },
      { id: 'tarta', name: 'Tarta de queso', price: 5, kind: 'food', prep: 3, duration: 12, energy: 10, dish: 'cake' },
      { id: 'agua', name: 'Agua', price: 1.5, kind: 'drink', prep: 1, duration: 10, energy: 2, dish: 'water' },
      { id: 'cana', name: 'Caña', price: 2.5, kind: 'drink', prep: 1, duration: 15, energy: 1, dish: 'beer' },
      { id: 'tinto', name: 'Tinto de la casa', price: 3, kind: 'drink', prep: 1, duration: 20, energy: 1, dish: 'wine' },
      { id: 'refresco', name: 'Refresco', price: 2.5, kind: 'drink', prep: 1, duration: 12, energy: 3, dish: 'soda' },
      { id: 'cafe', name: 'Café solo', price: 1.5, kind: 'drink', prep: 2, duration: 6, energy: 4, dish: 'coffee' },
    ],
  },
];

export function getMenu(id: string): ServiceMenu {
  const menu = MENUS.find((m) => m.id === id);
  if (!menu) throw new Error(`Carta desconocida: ${id}`);
  return menu;
}

/** Lo que se puede pedir a esa hora. */
export function availableItems(menu: ServiceMenu, hour: number): MenuItem[] {
  return menu.items.filter((i) => !i.hours || (hour >= i.hours[0] && hour < i.hours[1]));
}
