/**
 * Ropa y tiendas de ropa. Una prenda es una sola cosa en todo el mundo (su
 * color, su manga, qué hueco ocupa); cada tienda decide cuáles tiene y a qué
 * precio. Así la misma camiseta puede estar en el ropero al peso a 6 € y en la
 * de archivo a 30 €, y una tienda nueva es una entrada más en STORES, sin
 * código: la vende quien atiende la caja (data/services.ts, oferta 'retail')
 * y la cobra systems/Retail.ts.
 *
 * Lo comprado se guarda en el armario de la partida (GameStateData.wardrobe) y
 * lo que se lleva puesto, en el aspecto (data/appearance.ts, top/bottom).
 */

/** Hueco que ocupa: arriba (camiseta, chaqueta) o abajo (pantalón, falda). */
export type GarmentSlot = 'top' | 'bottom';

/** Hasta dónde tapa el brazo: decide qué tatuajes se ven (data/tattoos.ts). */
export type Sleeve = 'long' | 'short' | 'none';

export interface GarmentDef {
  id: string;
  name: string;
  slot: GarmentSlot;
  /** Color principal y su sombra (en 'bottom', sólo el primero: el pantalón). */
  color: string;
  dark?: string;
  /** Sólo arriba; por defecto, larga. */
  sleeve?: Sleeve;
  /** Pieza única: cuando es tuya, en la tienda ya no queda. */
  unique?: boolean;
}

export const GARMENTS: readonly GarmentDef[] = [
  // Retales: vintage escogido, piezas de una en una.
  { id: 'cazadora-ante', name: 'Cazadora de ante de los 70', slot: 'top', color: '#9a6a3f', dark: '#74502f', unique: true },
  { id: 'camisa-hawai', name: 'Camisa de flores', slot: 'top', color: '#3f8c86', dark: '#2f6a65', sleeve: 'short' },
  { id: 'jersey-rombos', name: 'Jersey de rombos', slot: 'top', color: '#b8923f', dark: '#8c6e2f' },
  { id: 'vestido-lunares', name: 'Blusa de lunares', slot: 'top', color: '#8c2f3f', dark: '#6a2330', sleeve: 'short', unique: true },
  { id: 'pantalon-pata', name: 'Pantalón de pata de elefante', slot: 'bottom', color: '#5a3f2a' },
  { id: 'vaquero-70', name: 'Vaquero de talle alto', slot: 'bottom', color: '#3f5a8c' },
  // Archivo: streetwear y piezas de colección.
  { id: 'sudadera-archivo', name: 'Sudadera de archivo', slot: 'top', color: '#2a2830', dark: '#1c1a20' },
  { id: 'camiseta-grafica', name: 'Camiseta gráfica', slot: 'top', color: '#e6e0d4', dark: '#c4bdb0', sleeve: 'short' },
  { id: 'anorak-neon', name: 'Anorak de los 90', slot: 'top', color: '#c8d84a', dark: '#9aa838', unique: true },
  { id: 'camiseta-tirantes', name: 'Camiseta de tirantes', slot: 'top', color: '#232329', dark: '#18181c', sleeve: 'none' },
  { id: 'cargo-negro', name: 'Pantalón cargo', slot: 'bottom', color: '#2b2d33' },
  { id: 'chandal-gris', name: 'Pantalón de chándal', slot: 'bottom', color: '#6a6d75' },
  // Segunda Vuelta: al peso, básicos y lo que llegue.
  { id: 'camisa-cuadros', name: 'Camisa de cuadros', slot: 'top', color: '#8c3f3f', dark: '#6a2f2f' },
  { id: 'camiseta-basica', name: 'Camiseta lisa', slot: 'top', color: '#5c6fa8', dark: '#45537e', sleeve: 'short' },
  { id: 'rebeca-punto', name: 'Rebeca de punto', slot: 'top', color: '#8aa05a', dark: '#687844' },
  { id: 'vaquero-gastado', name: 'Vaquero gastado', slot: 'bottom', color: '#4f6a8c' },
  { id: 'pana-marron', name: 'Pantalón de pana', slot: 'bottom', color: '#7b5a3d' },
  // Hilo: moda de temporada.
  { id: 'abrigo-lana', name: 'Abrigo de lana', slot: 'top', color: '#3a3a44', dark: '#2a2a32' },
  { id: 'camisa-lino', name: 'Camisa de lino', slot: 'top', color: '#ece6dc', dark: '#cfc6b8' },
  { id: 'pantalon-pinzas', name: 'Pantalón de pinzas', slot: 'bottom', color: '#232329' },
];

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
    stock: [{ garment: 'abrigo-lana', price: 119 }, { garment: 'camisa-lino', price: 45 }, { garment: 'pantalon-pinzas', price: 55 }],
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
for (const s of STORES) for (const line of s.stock) getGarment(line.garment);
