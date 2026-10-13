/**
 * Qué prenda es cada cosa que alguien lleva, no sólo de qué color: una
 * sudadera con capucha no se dibuja como una camiseta ni un vaquero como un
 * chándal. world/Garments.ts lo pinta a 28 × 42 encima del cuerpo de siempre
 * (la cara, el pelo y la silueta no cambian). Sin `outfit`, la persona se
 * pinta como siempre.
 *
 * Tres huecos (arriba, abajo, calzado), cada uno con su corte y su tejido. El
 * tejido sale del corte salvo que se diga otro (una cazadora de ante es una
 * chaqueta de cuero).
 */

export type TopKind =
  | 'tee' | 'tee-fitted' | 'tee-oversized' | 'shirt' | 'sweatshirt' | 'hoodie' | 'zip-hoodie'
  | 'bomber' | 'jacket' | 'denim-jacket' | 'blazer' | 'coat' | 'sport';
export type BottomKind = 'jeans' | 'wide' | 'trousers' | 'cargo' | 'joggers' | 'shorts' | 'track';
export type ShoeKind = 'sneaker' | 'chunky' | 'runner' | 'boot' | 'shoe';
export type Material = 'cotton' | 'denim' | 'nylon' | 'leather' | 'knit' | 'sport';

export interface Outfit {
  top: TopKind;
  bottom: BottomKind;
  shoes: ShoeKind;
  topMat?: Material;
  bottomMat?: Material;
  /** Lo que asoma por delante de una chaqueta abierta (camiseta, camisa). */
  inner?: string;
  /** Color de contraste: paneles de la ropa de deporte, mediasuela de las de correr. */
  accent?: string;
}

export const TOP_MAT: Readonly<Record<TopKind, Material>> = {
  tee: 'cotton', 'tee-fitted': 'cotton', 'tee-oversized': 'cotton', shirt: 'cotton', sweatshirt: 'cotton',
  hoodie: 'cotton', 'zip-hoodie': 'cotton', bomber: 'nylon', jacket: 'nylon', 'denim-jacket': 'denim',
  blazer: 'knit', coat: 'knit', sport: 'sport',
};
export const BOTTOM_MAT: Readonly<Record<BottomKind, Material>> = {
  jeans: 'denim', wide: 'denim', trousers: 'cotton', cargo: 'cotton', joggers: 'cotton', shorts: 'cotton', track: 'sport',
};
export const SHOE_MAT: Readonly<Record<ShoeKind, Material>> = {
  sneaker: 'leather', chunky: 'leather', runner: 'sport', boot: 'leather', shoe: 'leather',
};

/** Las prendas de las tiendas (data/retail.ts): qué corte y tejido tiene cada una. */
const RETAIL_WEAR: Readonly<Record<string, Partial<Outfit>>> = {
  'cazadora-ante': { top: 'jacket', topMat: 'leather' },
  'camisa-hawai': { top: 'shirt' },
  'jersey-rombos': { top: 'sweatshirt', topMat: 'knit' },
  'vestido-lunares': { top: 'shirt' },
  'pantalon-pata': { bottom: 'wide', bottomMat: 'cotton' },
  'vaquero-70': { bottom: 'jeans' },
  'sudadera-archivo': { top: 'hoodie' },
  'camiseta-grafica': { top: 'tee-oversized' },
  'anorak-neon': { top: 'jacket' },
  'camiseta-tirantes': { top: 'tee-fitted' },
  'cargo-negro': { bottom: 'cargo' },
  'chandal-gris': { bottom: 'joggers' },
  'camisa-cuadros': { top: 'shirt' },
  'camiseta-basica': { top: 'tee' },
  'rebeca-punto': { top: 'sweatshirt', topMat: 'knit' },
  'vaquero-gastado': { bottom: 'jeans' },
  'pana-marron': { bottom: 'trousers', bottomMat: 'knit' },
  'abrigo-lana': { top: 'coat' },
  'camisa-lino': { top: 'shirt' },
  'pantalon-pinzas': { bottom: 'trousers' },
  'blazer-entallado': { top: 'blazer', inner: '#e6e0d4' },
  'camiseta-algodon': { top: 'tee-fitted' },
  'vaquero-recto': { bottom: 'jeans' },
  'zapatilla-blanca': { shoes: 'sneaker' },
  'zapatilla-retro': { shoes: 'runner', accent: '#8a8e96' },
  'zapatilla-edicion': { shoes: 'chunky' },
  'bota-cuero': { shoes: 'boot' },
  // Velaria.
  'abrigo-camel': { top: 'coat' },
  'americana-sastre': { top: 'blazer', inner: '#f2f0ea' },
  'camisa-popelin': { top: 'shirt' },
  'jersey-cachemir': { top: 'sweatshirt', topMat: 'knit' },
  'pantalon-sastre': { bottom: 'trousers' },
  'mocasin-piel': { shoes: 'shoe' },
  'botin-chelsea': { shoes: 'boot' },
  'zapatilla-piel-lujo': { shoes: 'sneaker' },
  'cazadora-napa': { top: 'jacket', topMat: 'leather', inner: '#232329' },
};

/** Por categoría de tienda, lo que se pone si la prenda no está arriba. */
const BY_CATEGORY: Readonly<Record<string, Partial<Outfit>>> = {
  camiseta: { top: 'tee' }, camisa: { top: 'shirt' }, sudadera: { top: 'sweatshirt' }, chaqueta: { top: 'jacket' },
  pantalon: { bottom: 'trousers' }, vaquero: { bottom: 'jeans' }, zapatos: { shoes: 'shoe' }, zapatillas: { shoes: 'sneaker' },
};

/** Corte y tejido de una prenda de tienda. */
export function wearOf(garmentId: string, category: string): Partial<Outfit> {
  return RETAIL_WEAR[garmentId] ?? BY_CATEGORY[category] ?? {};
}

/**
 * Conjuntos coherentes para la gente anónima, por su moda (data/identity.Fashion): lo que se pone un día
 * normal. El tiempo y la actividad no van aquí: los pone world/WeatherLooks encima (abrigo, manga corta,
 * capucha, ropa de gimnasio), así que un conjunto nunca choca con la lluvia ni con el gimnasio. La moda sale
 * de los gustos, la edad y el trabajo (systems/Population), nunca del origen, el género o el cuerpo.
 */
const SETS = {
  basic: { top: 'tee', bottom: 'jeans', shoes: 'sneaker' },
  knit: { top: 'sweatshirt', bottom: 'jeans', shoes: 'sneaker' },
  office: { top: 'shirt', bottom: 'trousers', shoes: 'shoe' },
  suit: { top: 'blazer', bottom: 'trousers', shoes: 'shoe', inner: '#e6e0d4' },
  sport: { top: 'sport', bottom: 'track', shoes: 'runner', accent: '#e6e0d4' },
  street: { top: 'zip-hoodie', bottom: 'wide', shoes: 'chunky' },
  skate: { top: 'hoodie', bottom: 'cargo', shoes: 'chunky' },
  rock: { top: 'jacket', topMat: 'leather', bottom: 'jeans', shoes: 'boot', inner: '#232329' },
  night: { top: 'bomber', bottom: 'jeans', shoes: 'chunky' },
  tourist: { top: 'tee', bottom: 'shorts', shoes: 'sneaker' },
  vintage: { top: 'denim-jacket', bottom: 'jeans', shoes: 'boot', inner: '#e6e0d4' },
  work: { top: 'jacket', bottom: 'cargo', shoes: 'boot' },
  smart: { top: 'coat', bottom: 'trousers', shoes: 'shoe', inner: '#2b2d33' },
  loose: { top: 'tee-oversized', bottom: 'wide', shoes: 'chunky' },
} as const satisfies Record<string, Outfit>;

export const FASHION_OUTFITS: Readonly<Record<import('./identity.ts').Fashion, readonly Outfit[]>> = {
  casual: [SETS.basic, SETS.knit],
  sportswear: [SETS.sport],
  athletic: [SETS.sport, SETS.basic],
  streetwear: [SETS.street, SETS.skate],
  skate: [SETS.skate, SETS.loose],
  vintage: [SETS.vintage, SETS.knit],
  alternative: [SETS.rock, SETS.loose],
  punk: [SETS.rock],
  nightlife: [SETS.night, SETS.rock],
  office: [SETS.office, SETS.suit],
  formal: [SETS.suit],
  luxury: [SETS.smart, SETS.suit],
  designer: [SETS.smart, SETS.loose],
  experimental: [SETS.loose, SETS.vintage],
  workwear: [SETS.work],
  tourist: [SETS.tourist, SETS.basic],
};

/** El conjunto de alguien: de su moda, elegido con su semilla (el mismo siempre). */
export const outfitFor = (fashion: import('./identity.ts').Fashion, seed: number): Outfit => {
  const sets = FASHION_OUTFITS[fashion];
  return { ...sets[seed % sets.length] };
};
