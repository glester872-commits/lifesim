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
  // Velaria. Maison Ferrant: sastrería y prendas de temporada de las que se notan a dos metros.
  { id: 'abrigo-camel', name: 'Abrigo de pelo de camello', category: 'chaqueta', description: 'Cruzado, largo hasta la rodilla. Se nota a dos metros que no es de mezcla.', color: '#b88a5a', dark: '#94693f' },
  { id: 'americana-sastre', name: 'Americana de sastrería', category: 'chaqueta', description: 'Lana fría gris marengo, hombro natural, hecha a medida en serie.', color: '#4a4f57', dark: '#373b42' },
  { id: 'camisa-popelin', name: 'Camisa de popelín', category: 'camisa', description: 'Algodón egipcio, cuello italiano, botones de nácar.', color: '#f2f0ea', dark: '#d6d2c8' },
  { id: 'jersey-cachemir', name: 'Jersey de cachemir', category: 'sudadera', description: 'Cuello redondo, galga fina. Pesa menos que la etiqueta.', color: '#c9b89a', dark: '#a8987c' },
  { id: 'pantalon-sastre', name: 'Pantalón de sastre', category: 'pantalon', description: 'Raya marcada, bajo vuelto, caída perfecta.', color: '#3a3f48' },
  // Atelier Brisa: piel y calzado, cosido a mano.
  { id: 'mocasin-piel', name: 'Mocasines de piel', category: 'zapatos', description: 'Piel de becerro color tabaco, cosidos a mano en Menorca.', color: '#5a3a28' },
  { id: 'botin-chelsea', name: 'Botines Chelsea', category: 'zapatos', description: 'Ante negro, elástico lateral y suela de cuero.', color: '#2b2d33' },
  { id: 'zapatilla-piel-lujo', name: 'Zapatillas de piel italiana', category: 'zapatillas', description: 'Napa blanca, suela cosida y el talón de otro color.', color: '#f2efe8' },
  { id: 'cazadora-napa', name: 'Cazadora de napa', category: 'chaqueta', description: 'Napa de cordero, forro de seda. Se ablanda con los años.', color: '#1c1a20', dark: '#121016' },
  // Distrito Arena. La tienda oficial del CD Halcones del Arena (ficticio: turquesa y naranja, un halcón bordado) y la
  // tienda de deportes de la avenida.
  { id: 'camiseta-halcones-1', name: 'Camiseta Halcones · primera', category: 'camiseta', description: 'Turquesa, cuello y mangas naranjas y el halcón bordado en el pecho. La de la grada.', color: '#1f8f8a', dark: '#166a66', sleeve: 'short' },
  { id: 'camiseta-halcones-2', name: 'Camiseta Halcones · segunda', category: 'camiseta', description: 'Naranja con el remate turquesa. La de fuera de casa, y la de quien quiere que se le vea.', color: '#f08a24', dark: '#c26c18', sleeve: 'short' },
  { id: 'sudadera-halcones', name: 'Sudadera del club', category: 'sudadera', description: 'Turquesa oscuro, capucha y «HALCONES» en naranja a la espalda.', color: '#17605d', dark: '#104644' },
  { id: 'chandal-halcones', name: 'Pantalón de chándal Halcones', category: 'pantalon', description: 'Turquesa oscuro con la franja naranja por fuera de la pierna.', color: '#17605d' },
  { id: 'camiseta-tecnica', name: 'Camiseta técnica', category: 'camiseta', description: 'Tejido que respira, costuras planas. Para el partido del domingo o para correr.', color: '#2f6fa8', dark: '#23537e', sleeve: 'short' },
  { id: 'sudadera-entreno', name: 'Sudadera de entrenamiento', category: 'sudadera', description: 'Gris jaspeado, cremallera corta. La que se lleva antes y después de jugar.', color: '#8a8f96', dark: '#6a6f76' },
  { id: 'pantalon-chandal', name: 'Pantalón de chándal', category: 'pantalon', description: 'Negro, puño en el tobillo y bolsillos con cremallera.', color: '#1c1c22' },
  { id: 'zapatillas-futbol-sala', name: 'Zapatillas de fútbol sala', category: 'zapatillas', description: 'Suela lisa de goma, puntera reforzada. Blancas, hasta el primer partido.', color: '#f2f2f2' },
  // Puerta Central. Recuerdos de la Puerta: lo de la plaza, para llevárselo puesto.
  { id: 'camiseta-rosa', name: 'Camiseta de la Rosa de los Vientos', category: 'camiseta', description: 'Blanca, con la esfera del monumento en rojo y «Puerta Central» debajo. Se reconoce desde lejos.', color: '#f2efe8', dark: '#d2cec4', sleeve: 'short' },
  { id: 'sudadera-puerta', name: 'Sudadera «Puerta Central»', category: 'sudadera', description: 'Azul marino, capucha y el nombre de la plaza en letras de colegio americano.', color: '#2a3550', dark: '#1d2539' },
  // Montón (Puerta Central, CV-03): moda a precio de montón. Básicos de temporada en colores que se ven de lejos.
  { id: 'camiseta-raya', name: 'Camiseta de rayas', category: 'camiseta', description: 'Rayas marineras azul y blanco. Tres euros más barata que la de al lado.', color: '#e9ecf2', dark: '#3c5a96', sleeve: 'short' },
  { id: 'camiseta-mostaza', name: 'Camiseta mostaza', category: 'camiseta', description: 'Algodón fino, mostaza de temporada. Encoge un poco; avisados quedáis.', color: '#d9a52b', dark: '#a87d1c', sleeve: 'short' },
  { id: 'sudadera-lila', name: 'Sudadera lila', category: 'sudadera', description: 'Felpa por dentro, capucha y un cordón que nunca está igualado.', color: '#9b86c9', dark: '#76649f' },
  { id: 'plumifero-rojo', name: 'Plumífero rojo', category: 'chaqueta', description: 'Acolchado ligero, rojo bombero. Abriga más de lo que cuesta.', color: '#c8323a', dark: '#97252b' },
  { id: 'pitillo-claro', name: 'Vaquero pitillo claro', category: 'vaquero', description: 'Lavado claro, pierna estrecha. Cuatro tallas en el mismo perchero.', color: '#8fb0d4' },
  { id: 'jogger-verde', name: 'Jogger verde', category: 'pantalon', description: 'Verde caqui, puño en el tobillo y cordón de algodón.', color: '#5d6e3f' },
  { id: 'lona-blanca', name: 'Zapatillas de lona', category: 'zapatillas', description: 'Lona blanca y suela de goma. Se ensucian el primer día; se lavan a máquina.', color: '#f0ede6' },
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
    id: 'ribera-sport', name: 'Ribera Sport', greeting: 'Si vas a correr el domingo, empieza por las zapatillas.', thanks: 'Suerte en la carrera del canal.',
    stock: [
      { garment: 'zapatilla-retro', price: 74 }, { garment: 'zapatilla-blanca', price: 89 }, { garment: 'chandal-gris', price: 35 },
      { garment: 'camiseta-tirantes', price: 18 }, { garment: 'camiseta-basica', price: 15 },
    ],
  },
  {
    id: 'suela', name: 'Suela · zapatillas', greeting: 'Si no está en la pared, es que se agotó.', thanks: 'Cuídalas: la suela es lo primero que se va.',
    stock: [
      { garment: 'zapatilla-blanca', price: 95 }, { garment: 'zapatilla-retro', price: 79 },
      { garment: 'zapatilla-edicion', price: 220 }, { garment: 'bota-cuero', price: 130 },
    ],
  },
  // Cuatro Ríos: dos tiendas pequeñas de barrio, con las prendas del catálogo de siempre a precio de calle.
  {
    id: 'hilvana', name: 'Hilvana · moda', greeting: 'Lo nuevo llega los martes. Lo de la mesa, rebajado.', thanks: 'Si no te vale, me lo traes con el tique.',
    stock: [
      { garment: 'camisa-lino', price: 36 }, { garment: 'vaquero-recto', price: 45 }, { garment: 'camiseta-algodon', price: 16 },
      { garment: 'rebeca-punto', price: 28 }, { garment: 'vestido-lunares', price: 39 }, { garment: 'pantalon-pinzas', price: 42 },
    ],
  },
  {
    id: 'ambar', name: 'Ámbar · calle y deporte', greeting: 'Chándal, sudadera, zapatilla. Lo de siempre, pero bien.', thanks: 'Esa la lleva medio barrio. Por algo será.',
    stock: [
      { garment: 'chandal-gris', price: 30 }, { garment: 'camiseta-grafica', price: 18 }, { garment: 'cargo-negro', price: 44 },
      { garment: 'zapatilla-blanca', price: 69 }, { garment: 'camiseta-tirantes', price: 14 },
    ],
  },
  // Velaria: dos casas de lujo. Lo mismo que cualquier tienda (percheros, probador, caja), con otros precios.
  {
    id: 'ferrant', name: 'Maison Ferrant', greeting: 'Bienvenido. Tómese su tiempo; si quiere probarse algo, le preparo el probador.', thanks: 'Se lo llevo a la caja. Le queda impecable.',
    stock: [
      { garment: 'abrigo-camel', price: 690 }, { garment: 'americana-sastre', price: 520 }, { garment: 'camisa-popelin', price: 160 },
      { garment: 'jersey-cachemir', price: 340 }, { garment: 'pantalon-sastre', price: 240 }, { garment: 'blazer-entallado', price: 380 },
    ],
  },
  {
    id: 'brisa', name: 'Atelier Brisa · piel y calzado', greeting: 'Todo cosido a mano. Si quiere, le tomo la medida del pie.', thanks: 'Con un poco de crema cada mes, le duran toda la vida.',
    stock: [
      { garment: 'mocasin-piel', price: 320 }, { garment: 'botin-chelsea', price: 380 }, { garment: 'zapatilla-piel-lujo', price: 410 },
      { garment: 'cazadora-napa', price: 890 }, { garment: 'bota-cuero', price: 260 },
    ],
  },
  // Distrito Arena: la tienda oficial y la de deportes.
  {
    id: 'halcones', name: 'Tienda Oficial Halcones', greeting: '¡Aúpa Halcones! La primera, la segunda o la sudadera: todo lo de la temporada.', thanks: 'Que dé suerte. Y si no da, que por lo menos abrigue.',
    stock: [{ garment: 'camiseta-halcones-1', price: 65 }, { garment: 'camiseta-halcones-2', price: 65 }, { garment: 'sudadera-halcones', price: 45 }, { garment: 'chandal-halcones', price: 35 }],
  },
  {
    id: 'deportes-arena', name: 'Deportes Arena', greeting: 'Buenas. Si buscas botas, dime en qué superficie juegas.', thanks: 'A darle caña. Y a estirar después, que luego vienen las lesiones.',
    stock: [{ garment: 'camiseta-tecnica', price: 18 }, { garment: 'sudadera-entreno', price: 32 }, { garment: 'pantalon-chandal', price: 25 }, { garment: 'zapatillas-futbol-sala', price: 45 }],
  },
  // Puerta Central: la tienda de recuerdos y la cadena de moda de la calle.
  {
    id: 'recuerdos', name: 'Recuerdos de la Puerta', greeting: 'Hello, hola, bonjour. Las camisetas, tres por veinticinco.', thanks: 'Que la disfrutes. Si te pierdes, vuelve a la Rosa.',
    stock: [{ garment: 'camiseta-rosa', price: 12 }, { garment: 'sudadera-puerta', price: 29 }, { garment: 'camiseta-grafica', price: 15 }],
  },
  {
    // Montón: la de precio más bajo de la ciudad. Lo de siempre, pero a tres o cuatro veces menos que en Hilo o Ferrant.
    id: 'monton', name: 'Montón · moda', greeting: 'Bolsa grande en la entrada. Lo de las mesas, todo a cinco.', thanks: 'Ahí va tu bolsa. ¡Que te dure!',
    stock: [
      { garment: 'camiseta-raya', price: 4 }, { garment: 'camiseta-mostaza', price: 3.5 }, { garment: 'sudadera-lila', price: 12 },
      { garment: 'plumifero-rojo', price: 19 }, { garment: 'pitillo-claro', price: 13 }, { garment: 'jogger-verde', price: 9 },
      { garment: 'lona-blanca', price: 8 },
    ],
  },
  {
    id: 'central', name: 'Moda Central', greeting: 'Hola. Probadores al fondo; máximo cuatro prendas.', thanks: 'Si no te vale, tienes treinta días con el tique.',
    stock: [
      { garment: 'camiseta-basica', price: 8 }, { garment: 'vaquero-recto', price: 30 }, { garment: 'camisa-lino', price: 26 },
      { garment: 'rebeca-punto', price: 23 }, { garment: 'vestido-lunares', price: 30 }, { garment: 'pantalon-pinzas', price: 28 },
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
