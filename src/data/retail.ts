/**
 * Ropa y tiendas de ropa. Una prenda es una sola cosa en todo el mundo (su
 * color, su manga, qué hueco ocupa); cada tienda decide cuáles tiene y a qué
 * precio. Así la misma camiseta puede estar en el ropero al peso a 6 € y en la
 * de archivo a 30 €, y una tienda nueva es una entrada más en STORES, sin
 * código: la vende quien atiende la caja (data/services.ts, oferta 'retail'),
 * y se mira en sus percheros (LocationDef.racks); la cobra systems/Retail.ts.
 *
 * Lo comprado se guarda en el armario de la partida (GameStateData.wardrobe) y
 * lo que se lleva puesto, en el aspecto (data/appearance.ts, top/bottom/shoes).
 */

/** Hueco que ocupa: arriba (camiseta, chaqueta), abajo (pantalón) o los pies (zapatillas). */
export type GarmentSlot = 'top' | 'bottom' | 'shoes';

/**
 * Qué clase de prenda es; de ella sale el hueco que ocupa. Las de `slot: null`
 * están preparadas pero hoy nadie las dibuja (el personaje no lleva gorro,
 * gafas, bolso ni falda): ninguna tienda puede venderlas hasta que
 * world/HumanArt.ts sepa pintarlas, y el arranque lo comprueba.
 */
export const CATEGORIES = {
  camiseta: { label: 'Camiseta', slot: 'top' },
  camisa: { label: 'Camisa', slot: 'top' },
  sudadera: { label: 'Sudadera', slot: 'top' },
  chaqueta: { label: 'Chaqueta', slot: 'top' },
  pantalon: { label: 'Pantalón', slot: 'bottom' },
  vaquero: { label: 'Vaquero', slot: 'bottom' },
  zapatos: { label: 'Zapatos', slot: 'shoes' },
  zapatillas: { label: 'Zapatillas', slot: 'shoes' },
  short: { label: 'Short', slot: null },
  vestido: { label: 'Vestido', slot: null },
  falda: { label: 'Falda', slot: null },
  gorro: { label: 'Gorro', slot: null },
  gafas: { label: 'Gafas', slot: null },
  bolso: { label: 'Bolso', slot: null },
  accesorio: { label: 'Accesorio', slot: null },
} as const satisfies Record<string, { label: string; slot: GarmentSlot | null }>;

export type GarmentCategory = keyof typeof CATEGORIES;

/** Hasta dónde tapa el brazo: decide qué tatuajes se ven (data/tattoos.ts). */
export type Sleeve = 'long' | 'short' | 'none';

export interface GarmentDef {
  id: string;
  name: string;
  category: GarmentCategory;
  /** Una frase, la de la etiqueta. */
  description: string;
  /** Sale de la categoría. */
  slot: GarmentSlot;
  /** Color principal y su sombra (en 'bottom' y 'shoes', sólo el primero: el pantalón, el zapato). */
  color: string;
  dark?: string;
  /** Sólo arriba; por defecto, larga. */
  sleeve?: Sleeve;
  /** Pieza única: cuando es tuya, en la tienda ya no queda. */
  unique?: boolean;
}

type GarmentSeed = Omit<GarmentDef, 'slot'>;

const SEEDS: readonly GarmentSeed[] = [
  // Retales: vintage escogido, piezas de una en una.
  { id: 'cazadora-ante', name: 'Cazadora de ante de los 70', category: 'chaqueta', description: 'Ante gastado, forro de cuadros y olor a armario de abuelo.', color: '#9a6a3f', dark: '#74502f', unique: true },
  { id: 'camisa-hawai', name: 'Camisa de flores', category: 'camisa', description: 'Manga corta, flores grandes y botones de nácar.', color: '#3f8c86', dark: '#2f6a65', sleeve: 'short' },
  { id: 'jersey-rombos', name: 'Jersey de rombos', category: 'sudadera', description: 'Punto grueso de los ochenta. Pica un poco; abriga mucho.', color: '#b8923f', dark: '#8c6e2f' },
  { id: 'vestido-lunares', name: 'Blusa de lunares', category: 'camisa', description: 'Seda sintética, cuello de lazada. Sólo queda esta.', color: '#8c2f3f', dark: '#6a2330', sleeve: 'short', unique: true },
  { id: 'pantalon-pata', name: 'Pantalón de pata de elefante', category: 'pantalon', description: 'Campana ancha, talle alto. Se arrastra con orgullo.', color: '#5a3f2a' },
  { id: 'vaquero-70', name: 'Vaquero de talle alto', category: 'vaquero', description: 'Denim rígido de los setenta, cinco bolsillos.', color: '#3f5a8c' },
  // Archivo: streetwear y piezas de colección.
  { id: 'sudadera-archivo', name: 'Sudadera de archivo', category: 'sudadera', description: 'Algodón pesado, capucha doble, tirada corta.', color: '#2a2830', dark: '#1c1a20' },
  { id: 'camiseta-grafica', name: 'Camiseta gráfica', category: 'camiseta', description: 'Serigrafía de un grupo que ya no toca.', color: '#e6e0d4', dark: '#c4bdb0', sleeve: 'short' },
  { id: 'anorak-neon', name: 'Anorak de los 90', category: 'chaqueta', description: 'Nailon crujiente en verde ácido. Se oye venir.', color: '#c8d84a', dark: '#9aa838', unique: true },
  { id: 'camiseta-tirantes', name: 'Camiseta de tirantes', category: 'camiseta', description: 'Negra, de tirantes, para debajo de todo.', color: '#232329', dark: '#18181c', sleeve: 'none' },
  { id: 'cargo-negro', name: 'Pantalón cargo', category: 'pantalon', description: 'Seis bolsillos y una cremallera que no sabes para qué es.', color: '#2b2d33' },
  { id: 'chandal-gris', name: 'Pantalón de chándal', category: 'pantalon', description: 'Gris jaspeado, goma en el tobillo. Cómodo sin disculpas.', color: '#6a6d75' },
  // Segunda Vuelta: al peso, básicos y lo que llegue.
  { id: 'camisa-cuadros', name: 'Camisa de cuadros', category: 'camisa', description: 'Franela lavada mil veces. Ya no destiñe.', color: '#8c3f3f', dark: '#6a2f2f' },
  { id: 'camiseta-basica', name: 'Camiseta lisa', category: 'camiseta', description: 'Azul, lisa, de manga corta. Un básico.', color: '#5c6fa8', dark: '#45537e', sleeve: 'short' },
  { id: 'rebeca-punto', name: 'Rebeca de punto', category: 'chaqueta', description: 'Verde oliva, botones desparejados y coderas.', color: '#8aa05a', dark: '#687844' },
  { id: 'vaquero-gastado', name: 'Vaquero gastado', category: 'vaquero', description: 'Rodillas blancas de tanto usarlo. Alguien lo quiso.', color: '#4f6a8c' },
  { id: 'pana-marron', name: 'Pantalón de pana', category: 'pantalon', description: 'Pana gruesa color chocolate. Suena al andar.', color: '#7b5a3d' },
  // Hilo: moda de temporada.
  { id: 'abrigo-lana', name: 'Abrigo de lana', category: 'chaqueta', description: 'Lana y cachemir, corte recto. Para los días que importan.', color: '#3a3a44', dark: '#2a2a32' },
  { id: 'camisa-lino', name: 'Camisa de lino', category: 'camisa', description: 'Lino crudo, cuello mao. Se arruga con elegancia.', color: '#ece6dc', dark: '#cfc6b8' },
  { id: 'pantalon-pinzas', name: 'Pantalón de pinzas', category: 'pantalon', description: 'Negro, de pinzas, con caída. Sirve para casi todo.', color: '#232329' },
  { id: 'blazer-entallado', name: 'Blazer entallado', category: 'chaqueta', description: 'Azul noche, hombro marcado y un solo botón.', color: '#26324a', dark: '#1a2336' },
  { id: 'camiseta-algodon', name: 'Camiseta de algodón orgánico', category: 'camiseta', description: 'Cruda, de corte limpio y con la historia del algodón en la etiqueta.', color: '#ddd5c4', dark: '#bcb39f', sleeve: 'short' },
  { id: 'vaquero-recto', name: 'Vaquero recto negro', category: 'vaquero', description: 'Denim negro de pierna recta. El que no falla.', color: '#2c2f38' },
  // Suela: zapatillas y algo de calzado.
  { id: 'zapatilla-blanca', name: 'Zapatillas blancas de cuero', category: 'zapatillas', description: 'Cuero liso, suela gruesa. Las que van con todo.', color: '#e8e6e0' },
  { id: 'zapatilla-retro', name: 'Zapatillas retro de running', category: 'zapatillas', description: 'Nailon y ante en gris y naranja, como en el 84.', color: '#c97a3a' },
  { id: 'zapatilla-edicion', name: 'Zapatillas edición limitada', category: 'zapatillas', description: 'Tirada de cien pares, numeradas. No se reservan.', color: '#d84a5a', unique: true },
  { id: 'bota-cuero', name: 'Botas de cuero', category: 'zapatos', description: 'Cuero engrasado, suela de goma. Duran más que tú.', color: '#4a2f1f' },
];

export const GARMENTS: readonly GarmentDef[] = SEEDS.map((g) => {
  const slot = CATEGORIES[g.category].slot;
  // Una prenda de una categoría que nadie dibuja sería un producto que no se ve al probarlo.
  if (!slot) throw new Error(`Prenda ${g.id}: la categoría ${g.category} aún no se puede dibujar`);
  return { ...g, slot };
});

export interface StockLine {
  garment: string;
  price: number;
}

export interface RetailStoreDef {
  id: string;
  name: string;
  /** Lo que dice quien cobra al abrir el menú. */
  greeting: string;
  /** Lo que dice al cobrar. */
  thanks: string;
  stock: readonly StockLine[];
}

export const STORES: readonly RetailStoreDef[] = [
  {
    id: 'hilo', name: 'Hilo · moda', greeting: 'Lo de temporada está a la entrada.', thanks: 'Te queda muy bien. Guarda el tique.',
    stock: [
      { garment: 'abrigo-lana', price: 119 }, { garment: 'blazer-entallado', price: 89 }, { garment: 'camisa-lino', price: 45 },
      { garment: 'camiseta-algodon', price: 25 }, { garment: 'pantalon-pinzas', price: 55 }, { garment: 'vaquero-recto', price: 62 },
    ],
  },
  {
    id: 'retales', name: 'Retales · vintage', greeting: 'Todo es de una sola talla: la que había.', thanks: 'Tiene cincuenta años y le quedan otros cincuenta.',
    stock: [
      { garment: 'cazadora-ante', price: 85 }, { garment: 'camisa-hawai', price: 28 }, { garment: 'jersey-rombos', price: 32 },
      { garment: 'vestido-lunares', price: 48 }, { garment: 'pantalon-pata', price: 36 }, { garment: 'vaquero-70', price: 39 },
    ],
  },
  {
    id: 'archivo', name: 'Archivo · streetwear', greeting: 'Lo de la pared no se toca. Lo de los percheros, sí.', thanks: 'Buena elección. Esa no vuelve.',
    stock: [
      { garment: 'sudadera-archivo', price: 65 }, { garment: 'camiseta-grafica', price: 30 }, { garment: 'anorak-neon', price: 140 },
      { garment: 'camiseta-tirantes', price: 22 }, { garment: 'cargo-negro', price: 58 }, { garment: 'chandal-gris', price: 40 },
    ],
  },
  {
    id: 'vuelta', name: 'Segunda Vuelta', greeting: 'Al peso o por prenda, como prefieras.', thanks: 'Una prenda más que no acaba en el vertedero.',
    stock: [
      { garment: 'camisa-cuadros', price: 8 }, { garment: 'camiseta-basica', price: 4 }, { garment: 'rebeca-punto', price: 9 },
      { garment: 'vaquero-gastado', price: 10 }, { garment: 'pana-marron', price: 9 }, { garment: 'camiseta-grafica', price: 6 },
    ],
  },
  {
    id: 'suela', name: 'Suela · zapatillas', greeting: 'Si no está en la pared, es que se agotó.', thanks: 'Cuídalas: la suela es lo primero que se va.',
    stock: [
      { garment: 'zapatilla-blanca', price: 95 }, { garment: 'zapatilla-retro', price: 79 },
      { garment: 'zapatilla-edicion', price: 220 }, { garment: 'bota-cuero', price: 130 },
    ],
  },
];

const GARMENT_BY_ID = new Map(GARMENTS.map((g) => [g.id, g]));
const STORE_BY_ID = new Map(STORES.map((s) => [s.id, s]));

export const GARMENT_IDS: ReadonlySet<string> = new Set(GARMENT_BY_ID.keys());

export function getGarment(id: string): GarmentDef {
  const g = GARMENT_BY_ID.get(id);
  if (!g) throw new Error(`Prenda desconocida: ${id}`);
  return g;
}

export function getStore(id: string): RetailStoreDef {
  const s = STORE_BY_ID.get(id);
  if (!s) throw new Error(`Tienda desconocida: ${id}`);
  return s;
}

// Un catálogo mal escrito falla al arrancar, no al abrir el menú.
if (GARMENT_BY_ID.size !== GARMENTS.length) throw new Error('Hay dos prendas con el mismo id');
for (const s of STORES) for (const line of s.stock) getGarment(line.garment);
