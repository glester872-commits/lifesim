/**
 * Cartas de los locales con servicio de mesa (systems/TableService.ts). Cada
 * carta dice de qué tipo de local es (`venue`), cómo se agrupa, qué se dice y
 * qué hay: un plato o una bebida es un precio, lo que tarda la cocina o la
 * barra, lo que se tarda en tomarlo, lo que da y lo que se ve en la mesa. Un
 * local nuevo es otra entrada aquí y `tableService.menu` en su perfil de
 * población (data/population.ts); el servicio no sabe de ningún local.
 */

/** Qué clase de local es: decide la carta, las frases y qué se ofrece para seguir pidiendo. Nunca el nombre del local. */
export type VenueType = 'restaurant' | 'cafe' | 'wine_bar';

/** Lo que se ve en la mesa (world/DiningArt.ts dibuja cada uno lleno y vacío). */
export type Dish =
  | 'stew' | 'fish' | 'tortilla' | 'croquettes' | 'cake' | 'pastry' | 'toast' | 'sandwich' | 'cheese' | 'ham' | 'olives' | 'tapa'
  | 'water' | 'beer' | 'wine' | 'wine-white' | 'wine-rose' | 'bottle' | 'soda' | 'juice' | 'coffee' | 'tea' | 'cocoa';

/** Un vino: lo que se lee en la carta. Cada vino sale dos veces en la carta, por copa y por botella. */
export interface WineInfo {
  /** Mismo id para la copa y la botella de un vino. */
  wine: string;
  color: 'red' | 'white' | 'rose';
  origin: string;
  notes: string;
  body: 'ligero' | 'medio' | 'con cuerpo';
  serving: 'glass' | 'bottle';
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  kind: 'food' | 'drink';
  /** Id de su grupo en la carta (ServiceMenu.categories). */
  category: string;
  /** Minutos de juego que tarda en salir de cocina (o de la barra). */
  prep: number;
  /** Minutos de juego que se tarda en comerlo o bebérselo (una botella, varias copas). */
  duration: number;
  /** Energía que da al acabarlo (la única necesidad que hay hoy en la partida). */
  energy: number;
  dish: Dish;
  /** Sólo se sirve en esta franja [desde, hasta) en horas. */
  hours?: readonly [number, number];
  wine?: WineInfo;
  /** Con qué casa una tapa (para el maridaje de la vinoteca): 'curado', 'pescado', 'ligero'... */
  tags?: readonly string[];
}

/** Lo que dice quien atiende, por momentos. De cada lista sale una frase al azar: no siempre la misma. */
export interface VenueLines {
  greet: readonly string[];
  /** Cuando vuelve a tomar nota en una mesa que ya ha pedido. */
  again: readonly string[];
  confirm: readonly string[];
  serve: readonly string[];
  bill: readonly string[];
  thanks: readonly string[];
  later: readonly string[];
}

/** Qué se ofrece a quien sigue sentado: cada opción llama al camarero y abre la carta por esa categoría. */
export interface MoreOption {
  label: string;
  category?: string;
  /** Otra copa: el mismo vino que la última vez, si lo hubo. */
  sameWine?: true;
}

/** Una sugerencia de maridaje: con este color de vino (o este vino), una tapa con estas etiquetas. */
export interface Pairing {
  color: WineInfo['color'];
  wine?: string;
  tags: readonly string[];
  line: string;
}

export interface ServiceMenu {
  id: string;
  title: string;
  venue: VenueType;
  categories: readonly { id: string; title: string }[];
  items: readonly MenuItem[];
  lines: VenueLines;
  more: readonly MoreOption[];
  pairings?: readonly Pairing[];
}

// ------------------------------------------------------------- restaurante

const CASA_TOMAS: ServiceMenu = {
  id: 'casa-tomas',
  title: 'Casa Tomás',
  venue: 'restaurant',
  categories: [
    { id: 'entrantes', title: 'Entrantes' },
    { id: 'principales', title: 'Platos principales' },
    { id: 'postres', title: 'Postres' },
    { id: 'bebidas', title: 'Bebidas' },
  ],
  items: [
    { id: 'croquetas', name: 'Croquetas caseras (6)', price: 7, kind: 'food', category: 'entrantes', prep: 10, duration: 20, energy: 16, dish: 'croquettes' },
    { id: 'tortilla', name: 'Tortilla de patatas', price: 6.5, kind: 'food', category: 'entrantes', prep: 8, duration: 20, energy: 18, dish: 'tortilla' },
    { id: 'menu-dia', name: 'Menú del día: lentejas y merluza', price: 11, kind: 'food', category: 'principales', prep: 10, duration: 40, energy: 32, dish: 'stew', hours: [13, 16] },
    { id: 'merluza', name: 'Merluza a la romana', price: 13, kind: 'food', category: 'principales', prep: 14, duration: 30, energy: 26, dish: 'fish', hours: [13, 24] },
    { id: 'tarta', name: 'Tarta de queso', price: 5, kind: 'food', category: 'postres', prep: 3, duration: 12, energy: 10, dish: 'cake' },
    { id: 'agua', name: 'Agua', price: 1.5, kind: 'drink', category: 'bebidas', prep: 1, duration: 10, energy: 2, dish: 'water' },
    { id: 'cana', name: 'Caña', price: 2.5, kind: 'drink', category: 'bebidas', prep: 1, duration: 15, energy: 1, dish: 'beer' },
    { id: 'tinto', name: 'Tinto de la casa', price: 3, kind: 'drink', category: 'bebidas', prep: 1, duration: 20, energy: 1, dish: 'wine' },
    { id: 'refresco', name: 'Refresco', price: 2.5, kind: 'drink', category: 'bebidas', prep: 1, duration: 12, energy: 3, dish: 'soda' },
    { id: 'cafe', name: 'Café solo', price: 1.5, kind: 'drink', category: 'bebidas', prep: 2, duration: 6, energy: 4, dish: 'coffee' },
  ],
  lines: {
    greet: ['Buenas, ¿qué vas a tomar?', '¿Ya sabes qué quieres pedir?', 'Cuando quieras, te tomo nota.', 'Buenas, ¿te traigo la carta?', '¿Qué te apetece?'],
    again: ['¿Algo más?', '¿Te traigo otra cosa?', 'Dime, ¿qué más te pongo?'],
    confirm: ['Perfecto, ahora te lo traigo.', 'Marchando.', 'Enseguida.', 'Muy bien.'],
    serve: ['Aquí tienes. ¡Que aproveche!', 'Que aproveche.', 'Aquí tienes lo tuyo.'],
    bill: ['Aquí tienes la cuenta, cuando quieras.', 'La cuenta. Sin prisa.'],
    thanks: ['Gracias. ¡Hasta pronto!', '¡Gracias! Hasta la próxima.'],
    later: ['Sin prisa. Vuelvo en un rato.', 'Tranquilo, vuelvo luego.'],
  },
  more: [{ label: 'Pedir otra cosa' }, { label: 'Ver carta' }],
};

// --------------------------------------------------------------- cafetería

const PAUSA: ServiceMenu = {
  id: 'pausa',
  title: 'Cafetería Pausa',
  venue: 'cafe',
  categories: [
    { id: 'cafes', title: 'Cafés' },
    { id: 'bebidas', title: 'Otras bebidas' },
    { id: 'desayunos', title: 'Desayunos' },
    { id: 'comer', title: 'Para comer' },
  ],
  items: [
    { id: 'espresso', name: 'Espresso', price: 1.3, kind: 'drink', category: 'cafes', prep: 2, duration: 5, energy: 5, dish: 'coffee' },
    { id: 'cafe-solo', name: 'Café solo', price: 1.4, kind: 'drink', category: 'cafes', prep: 2, duration: 6, energy: 5, dish: 'coffee' },
    { id: 'cortado', name: 'Cortado', price: 1.5, kind: 'drink', category: 'cafes', prep: 2, duration: 7, energy: 5, dish: 'coffee' },
    { id: 'cafe-leche', name: 'Café con leche', price: 1.8, kind: 'drink', category: 'cafes', prep: 2, duration: 10, energy: 5, dish: 'coffee' },
    { id: 'americano', name: 'Americano', price: 1.7, kind: 'drink', category: 'cafes', prep: 2, duration: 12, energy: 5, dish: 'coffee' },
    { id: 'cappuccino', name: 'Cappuccino', price: 2.3, kind: 'drink', category: 'cafes', prep: 3, duration: 12, energy: 5, dish: 'coffee' },
    { id: 'latte', name: 'Latte', price: 2.5, kind: 'drink', category: 'cafes', prep: 3, duration: 14, energy: 5, dish: 'coffee' },
    { id: 'te', name: 'Té', price: 1.8, kind: 'drink', category: 'bebidas', prep: 3, duration: 14, energy: 3, dish: 'tea' },
    { id: 'chocolate', name: 'Chocolate caliente', price: 2.5, kind: 'drink', category: 'bebidas', prep: 4, duration: 14, energy: 6, dish: 'cocoa' },
    { id: 'agua', name: 'Agua', price: 1.2, kind: 'drink', category: 'bebidas', prep: 1, duration: 8, energy: 2, dish: 'water' },
    { id: 'zumo', name: 'Zumo de naranja', price: 2.8, kind: 'drink', category: 'bebidas', prep: 3, duration: 8, energy: 5, dish: 'juice' },
    { id: 'refresco', name: 'Refresco', price: 2, kind: 'drink', category: 'bebidas', prep: 1, duration: 10, energy: 3, dish: 'soda' },
    { id: 'desayuno', name: 'Desayuno completo (café con leche, zumo y tostada)', price: 5.5, kind: 'food', category: 'desayunos', prep: 5, duration: 25, energy: 18, dish: 'toast', hours: [7, 12.5] },
    { id: 'croissant', name: 'Croissant', price: 1.8, kind: 'food', category: 'desayunos', prep: 2, duration: 8, energy: 7, dish: 'pastry' },
    { id: 'napolitana', name: 'Napolitana de chocolate', price: 2, kind: 'food', category: 'desayunos', prep: 2, duration: 8, energy: 8, dish: 'pastry' },
    { id: 'tostada-tomate', name: 'Tostada con tomate', price: 2.5, kind: 'food', category: 'desayunos', prep: 4, duration: 10, energy: 9, dish: 'toast' },
    { id: 'tostada-mantequilla', name: 'Tostada con mantequilla', price: 2.2, kind: 'food', category: 'desayunos', prep: 4, duration: 10, energy: 9, dish: 'toast' },
    { id: 'tostada-jamon', name: 'Tostada con jamón', price: 3.8, kind: 'food', category: 'desayunos', prep: 4, duration: 12, energy: 12, dish: 'toast' },
    { id: 'sandwich', name: 'Sándwich mixto', price: 4, kind: 'food', category: 'comer', prep: 6, duration: 14, energy: 14, dish: 'sandwich' },
    { id: 'bocadillo', name: 'Bocadillo de tortilla', price: 4.5, kind: 'food', category: 'comer', prep: 5, duration: 16, energy: 16, dish: 'sandwich' },
    { id: 'tortilla', name: 'Pincho de tortilla', price: 3, kind: 'food', category: 'comer', prep: 3, duration: 10, energy: 11, dish: 'tortilla' },
    { id: 'tarta', name: 'Tarta del día', price: 3.5, kind: 'food', category: 'comer', prep: 2, duration: 10, energy: 9, dish: 'cake' },
  ],
  lines: {
    greet: ['Buenas, ¿qué te pongo?', '¿Qué vas a tomar?', '¿Te apetece algo de beber?', '¿Quieres tomar algo?', '¿Te traigo la carta?'],
    again: ['¿Quieres algo para acompañar?', '¿Otro cafecito?', '¿Algo más?'],
    confirm: ['Ahora te lo traigo.', 'Perfecto.', 'Marchando.', 'Enseguida.'],
    serve: ['Aquí tienes.', 'Que aproveche.', 'Te dejo el café por aquí.', 'Aquí tienes lo tuyo.'],
    bill: ['Te dejo la cuenta.', 'Aquí tienes, cuando quieras.'],
    thanks: ['¡Gracias! Que vaya bien el día.', 'Gracias, hasta luego.'],
    later: ['Vale, me avisas.', 'Sin prisa, vuelvo luego.'],
  },
  more: [{ label: 'Pedir otra bebida', category: 'cafes' }, { label: 'Pedir algo de comer', category: 'desayunos' }, { label: 'Ver carta' }],
};

// ---------------------------------------------------------------- vinoteca

/** Los vinos de La Cepa, cada uno por copa y por botella (una botella son cuatro copas de tiempo). */
const WINES: readonly (Omit<WineInfo, 'wine' | 'serving'> & { id: string; name: string; glass: number; bottle: number })[] = [
  { id: 'rioja-crianza', name: 'Rioja Crianza', color: 'red', origin: 'D.O.Ca. Rioja', notes: 'Frutos rojos, vainilla y madera suave', body: 'medio', glass: 4.5, bottle: 22 },
  { id: 'ribera', name: 'Ribera del Duero', color: 'red', origin: 'D.O. Ribera del Duero', notes: 'Fruta negra madura, tostados y regaliz', body: 'con cuerpo', glass: 5, bottle: 25 },
  { id: 'tempranillo-joven', name: 'Tempranillo joven', color: 'red', origin: 'La Mancha', notes: 'Fresco y frutal: cereza y violeta', body: 'ligero', glass: 3, bottle: 14 },
  { id: 'garnacha', name: 'Garnacha', color: 'red', origin: 'D.O. Campo de Borja', notes: 'Fresa madura y especias suaves', body: 'medio', glass: 3.5, bottle: 17 },
  { id: 'mencia', name: 'Mencía', color: 'red', origin: 'D.O. Bierzo', notes: 'Frutos del bosque y un punto mineral', body: 'medio', glass: 4, bottle: 19 },
  { id: 'cabernet', name: 'Cabernet Sauvignon', color: 'red', origin: 'D.O. Penedès', notes: 'Grosella negra, pimiento y cedro', body: 'con cuerpo', glass: 4.5, bottle: 21 },
  { id: 'albarino', name: 'Albariño', color: 'white', origin: 'D.O. Rías Baixas', notes: 'Cítrico, melocotón y un final salino', body: 'ligero', glass: 4.5, bottle: 21 },
  { id: 'verdejo', name: 'Verdejo', color: 'white', origin: 'D.O. Rueda', notes: 'Hierba fresca, hinojo y final amargo', body: 'ligero', glass: 3.5, bottle: 16 },
  { id: 'godello', name: 'Godello', color: 'white', origin: 'D.O. Valdeorras', notes: 'Manzana, flor blanca y textura', body: 'medio', glass: 4.5, bottle: 22 },
  { id: 'chardonnay', name: 'Chardonnay', color: 'white', origin: 'D.O. Somontano', notes: 'Fruta tropical y un toque de mantequilla', body: 'medio', glass: 4, bottle: 19 },
  { id: 'sauvignon', name: 'Sauvignon Blanc', color: 'white', origin: 'D.O. Rueda', notes: 'Maracuyá, pomelo y hierba', body: 'ligero', glass: 3.8, bottle: 18 },
  { id: 'garnacha-rosado', name: 'Garnacha Rosado', color: 'rose', origin: 'D.O. Navarra', notes: 'Fresa, caramelo y frescura', body: 'ligero', glass: 3.5, bottle: 16 },
  { id: 'tempranillo-rosado', name: 'Tempranillo Rosado', color: 'rose', origin: 'D.O.Ca. Rioja', notes: 'Frambuesa y piel de naranja', body: 'ligero', glass: 3.5, bottle: 16 },
  { id: 'rosado-navarra', name: 'Rosado de Navarra', color: 'rose', origin: 'D.O. Navarra', notes: 'Cereza, rosa y un final largo', body: 'medio', glass: 3.2, bottle: 15 },
  { id: 'provence', name: 'Provence Style Rosé', color: 'rose', origin: 'Estilo Provenza', notes: 'Pálido, melocotón blanco y pomelo', body: 'ligero', glass: 4.5, bottle: 22 },
];

const WINE_DISH: Readonly<Record<WineInfo['color'], Dish>> = { red: 'wine', white: 'wine-white', rose: 'wine-rose' };
const WINE_CATEGORY: Readonly<Record<WineInfo['color'], string>> = { red: 'tintos', white: 'blancos', rose: 'rosados' };

const wineItems = (): MenuItem[] =>
  WINES.flatMap((w) => {
    const info = { wine: w.id, color: w.color, origin: w.origin, notes: w.notes, body: w.body };
    const glass: MenuItem = { id: `${w.id}-copa`, name: w.name, price: w.glass, kind: 'drink', category: WINE_CATEGORY[w.color], prep: 1, duration: 22, energy: 1, dish: WINE_DISH[w.color], wine: { ...info, serving: 'glass' } };
    const bottle: MenuItem = { ...glass, id: `${w.id}-botella`, price: w.bottle, prep: 2, duration: 88, energy: 3, dish: 'bottle', wine: { ...info, serving: 'bottle' } };
    return [glass, bottle];
  });

const LA_CEPA: ServiceMenu = {
  id: 'la-cepa',
  title: 'La Cepa',
  venue: 'wine_bar',
  categories: [
    { id: 'tintos', title: 'Vinos tintos' },
    { id: 'blancos', title: 'Vinos blancos' },
    { id: 'rosados', title: 'Vinos rosados' },
    { id: 'tapas', title: 'Tapas' },
  ],
  items: [
    ...wineItems(),
    { id: 'quesos', name: 'Tabla de quesos', price: 9, kind: 'food', category: 'tapas', prep: 4, duration: 25, energy: 12, dish: 'cheese', tags: ['queso', 'curado', 'suave'] },
    { id: 'jamon', name: 'Jamón ibérico', price: 14, kind: 'food', category: 'tapas', prep: 4, duration: 20, energy: 12, dish: 'ham', tags: ['jamon', 'curado'] },
    { id: 'aceitunas', name: 'Aceitunas', price: 2.5, kind: 'food', category: 'tapas', prep: 1, duration: 12, energy: 3, dish: 'olives', tags: ['aceitunas', 'ligero'] },
    { id: 'pan-tomate', name: 'Pan con tomate', price: 3, kind: 'food', category: 'tapas', prep: 3, duration: 10, energy: 7, dish: 'toast', tags: ['ligero'] },
    { id: 'croquetas', name: 'Croquetas', price: 7, kind: 'food', category: 'tapas', prep: 8, duration: 15, energy: 14, dish: 'croquettes', tags: ['croquetas'] },
    { id: 'tortilla', name: 'Tortilla española', price: 5, kind: 'food', category: 'tapas', prep: 5, duration: 15, energy: 14, dish: 'tortilla', tags: ['tortilla', 'ligero'] },
    { id: 'bravas', name: 'Patatas bravas', price: 5, kind: 'food', category: 'tapas', prep: 7, duration: 15, energy: 12, dish: 'tapa', tags: ['ligero'] },
    { id: 'boquerones', name: 'Boquerones en vinagre', price: 6, kind: 'food', category: 'tapas', prep: 2, duration: 12, energy: 8, dish: 'tapa', tags: ['boquerones', 'pescado'] },
    { id: 'anchoas', name: 'Anchoas', price: 7, kind: 'food', category: 'tapas', prep: 2, duration: 12, energy: 7, dish: 'tapa', tags: ['anchoas', 'pescado'] },
    { id: 'chorizo', name: 'Chorizo', price: 5, kind: 'food', category: 'tapas', prep: 3, duration: 12, energy: 10, dish: 'ham', tags: ['embutido', 'curado'] },
    { id: 'embutidos', name: 'Tabla de embutidos', price: 11, kind: 'food', category: 'tapas', prep: 4, duration: 22, energy: 14, dish: 'ham', tags: ['embutido', 'curado'] },
    { id: 'manchego', name: 'Queso manchego', price: 7, kind: 'food', category: 'tapas', prep: 2, duration: 15, energy: 10, dish: 'cheese', tags: ['queso', 'curado'] },
    { id: 'almendras', name: 'Almendras tostadas', price: 3, kind: 'food', category: 'tapas', prep: 1, duration: 10, energy: 5, dish: 'olives', tags: ['ligero'] },
  ],
  lines: {
    greet: ['Buenas, ¿os apetece tomar algo?', '¿Te apetece una copa de vino?', 'Tenemos varios vinos por copa, ¿quieres ver la carta?', '¿Te traigo algo para picar también?', 'Tenemos algunas tapas que van muy bien con el vino.'],
    again: ['¿Otra ronda?', '¿Te pongo algo más?', '¿Cambiamos de vino o repites?'],
    confirm: ['Perfecto, ahora te lo traigo.', 'Marchando.', 'Buena elección.', 'Enseguida.'],
    serve: ['Aquí tienes.', 'Que lo disfrutes.', 'Esta es la copa que me pediste.', 'Que aproveche.'],
    bill: ['Te dejo la cuenta, cuando quieras.', 'Aquí tienes. Sin prisa.'],
    thanks: ['Gracias. ¡Hasta otra!', 'Gracias, que vaya bien la noche.'],
    later: ['Sin prisa, vuelvo en un rato.', 'Tranquilo, me avisas.'],
  },
  more: [
    { label: 'Pedir otra copa', sameWine: true },
    { label: 'Pedir otro vino', category: 'tintos' },
    { label: 'Pedir otra tapa', category: 'tapas' },
    { label: 'Ver carta' },
  ],
  // Sugerencias del camarero: sólo de vez en cuando (scenes/Menus.openOrder).
  pairings: [
    { color: 'red', wine: 'rioja-crianza', tags: ['queso'], line: 'Ese Rioja va muy bien con el manchego.' },
    { color: 'white', wine: 'albarino', tags: ['boquerones'], line: 'Con el Albariño te recomiendo los boquerones.' },
    { color: 'rose', tags: ['tortilla'], line: 'Si quieres algo ligero, el rosado con una tortilla funciona muy bien.' },
    { color: 'red', tags: ['jamon', 'curado', 'embutido', 'croquetas'], line: 'Para un tinto, el jamón o unos quesos curados.' },
    { color: 'white', tags: ['pescado', 'aceitunas', 'suave'], line: 'Con un blanco, algo de pescado: unas anchoas, por ejemplo.' },
    { color: 'rose', tags: ['queso', 'ligero', 'croquetas'], line: 'El rosado va bien con unas croquetas o algo de queso.' },
  ],
};

export const MENUS: readonly ServiceMenu[] = [CASA_TOMAS, PAUSA, LA_CEPA];

export function getMenu(id: string): ServiceMenu {
  const menu = MENUS.find((m) => m.id === id);
  if (!menu) throw new Error(`Carta desconocida: ${id}`);
  return menu;
}

/** Lo que se puede pedir a esa hora. */
export function availableItems(menu: ServiceMenu, hour: number): MenuItem[] {
  return menu.items.filter((i) => !i.hours || (hour >= i.hours[0] && hour < i.hours[1]));
}

/** La sugerencia que encaja con un vino (la más concreta primero), si la carta las tiene. */
export function pairingFor(menu: ServiceMenu, wine: MenuItem): Pairing | undefined {
  if (!wine.wine) return undefined;
  const list = menu.pairings ?? [];
  return list.find((p) => p.wine === wine.wine?.wine) ?? list.find((p) => !p.wine && p.color === wine.wine?.color);
}

/** Una frase al azar de una lista. */
export const say = (lines: readonly string[], rng: () => number = Math.random): string => lines[Math.floor(rng() * lines.length)] ?? '';
