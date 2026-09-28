import type { PropKind } from '../types/game';

export interface TileDef {
  key: string;
  solid: boolean;
  /** Número de variantes generadas; el constructor elige una de forma determinista. */
  variants: number;
}

export const TILES: Readonly<Record<string, TileDef>> = {
  g: { key: 'tile-grass', solid: false, variants: 3 },
  ',': { key: 'tile-pavement', solid: false, variants: 2 },
  '.': { key: 'tile-asphalt', solid: false, variants: 2 },
  ':': { key: 'tile-asphalt-line', solid: false, variants: 1 },
  '~': { key: 'tile-plaza', solid: false, variants: 2 },
  '#': { key: 'tile-roof-a', solid: true, variants: 2 },
  '%': { key: 'tile-roof-b', solid: true, variants: 2 },
  K: { key: 'tile-facade-office', solid: true, variants: 2 },
  E: { key: 'tile-facade-school', solid: true, variants: 2 },
  H: { key: 'tile-facade-home', solid: true, variants: 2 },
  C: { key: 'tile-facade-cafe', solid: true, variants: 2 },
  D: { key: 'tile-door', solid: false, variants: 1 },
  W: { key: 'tile-wall', solid: true, variants: 2 },
  f: { key: 'tile-floor-wood', solid: false, variants: 2 },
  t: { key: 'tile-floor-stone', solid: false, variants: 2 },
  r: { key: 'tile-rug', solid: false, variants: 2 },
  c: { key: 'tile-cobble', solid: false, variants: 2 },
  a: { key: 'tile-water', solid: true, variants: 2 },
  q: { key: 'tile-quay', solid: true, variants: 2 },
  R: { key: 'tile-rail', solid: true, variants: 2 },
  y: { key: 'tile-platform-edge', solid: false, variants: 1 },
  M: { key: 'tile-metro', solid: true, variants: 2 },
  z: { key: 'tile-crosswalk', solid: false, variants: 1 },
  m: { key: 'tile-gym-floor', solid: false, variants: 2 },
  k: { key: 'tile-court', solid: false, variants: 2 },
  '=': { key: 'tile-asphalt-centre', solid: false, variants: 1 },
  // Carril bici pintado en la calzada, junto al bordillo: lo pinta world/Surfaces con el asfalto.
  b: { key: 'tile-asphalt', solid: false, variants: 2 },
  o: { key: 'tile-office-carpet', solid: false, variants: 2 },
  n: { key: 'tile-dance-floor', solid: false, variants: 3 },
  // Visual V2: adoquín de granito de plaza (con cenefa donde toca otro suelo) y franja podotáctil.
  P: { key: 'tile-granite', solid: false, variants: 4 },
  T: { key: 'tile-tactile', solid: false, variants: 1 },
  // Tierra (solares, alcorques grandes, caminos de parque sin pavimentar): la pinta world/Surfaces.
  d: { key: 'tile-dirt', solid: false, variants: 1 },
};

export interface PropDef {
  key: string;
  /** Altura en tiles. Sólo la fila base colisiona: se camina por detrás del resto. */
  tilesHigh: number;
  /** Ancho en tiles; por defecto uno. La posición del prop marca su tile izquierdo. */
  tilesWide?: number;
  /** Versiones de la textura (`key-0`…): cada colocación elige la suya por posición, siempre la misma. */
  variants?: number;
  /** Movimiento propio en reposo; lo anima world/Ambience. */
  ambient?: 'spray';
  /**
   * Luz propia (world/Lighting): centro en px sobre la base. En la calle se
   * enciende de noche; dentro, siempre. Cálida por defecto; `cool` para tubos
   * y neones.
   */
  light?: {
    dy: number;
    cool?: boolean;
    /** Charco en el suelo [ancho, alto] en px, al pie del prop: la luz cae donde se camina (ART_BIBLE §7). */
    pool?: readonly [number, number];
  };
  /** Sombra al pie [ancho, alto] en px. Sin ella, una de contacto del ancho del prop. */
  shadow?: readonly [number, number];
  /** Cuelga del techo: no pisa el suelo (ni colisiona ni hace sombra) y pasa por encima de la gente. */
  overhead?: true;
  /** Asiento en el que alguien se sienta encima (sillón de barbero): no colisiona y se pinta detrás de quien lo ocupa. */
  seat?: true;
  /** Plano en el suelo (alcantarilla, hojas): se hornea con él, no colisiona ni tapa a nadie. */
  flat?: true;
  /** Sombra proyectada hacia el sureste, en px de largo: lo alto (farolas, troncos). ART_BIBLE §5. */
  cast?: number;
  /** Mancha de la copa al final de la sombra proyectada [ancho, alto]. */
  castBlob?: readonly [number, number];
  /** Textura con sólo lo que brilla (rótulo, pantalla): encima de la noche, invisible de día. */
  emissive?: string;
}

export const PROPS: Readonly<Record<PropKind, PropDef>> = {
  // El plátano de sombra: la copa desborda su tile y tapa a quien pasa por detrás.
  tree: { key: 'prop-tree', tilesHigh: 4, variants: 4, shadow: [14, 5], cast: 12, castBlob: [40, 14] },
  bush: { key: 'prop-bush', tilesHigh: 1 },
  bench: { key: 'prop-bench', tilesHigh: 1 },
  lamp: { key: 'prop-lamp', tilesHigh: 2, light: { dy: 18 }, shadow: [8, 3] },
  sign: { key: 'prop-sign', tilesHigh: 2 },
  planter: { key: 'prop-planter', tilesHigh: 1 },
  bed: { key: 'prop-bed', tilesHigh: 2 },
  desk: { key: 'prop-desk', tilesHigh: 1 },
  shelf: { key: 'prop-shelf', tilesHigh: 2 },
  plant: { key: 'prop-plant', tilesHigh: 1 },
  table: { key: 'prop-table', tilesHigh: 1 },
  counter: { key: 'prop-counter', tilesHigh: 1 },
  stall: { key: 'prop-stall', tilesHigh: 2 },
  'metro-sign': { key: 'prop-metro-sign', tilesHigh: 1, tilesWide: 3 },
  'line-map': { key: 'prop-line-map', tilesHigh: 1, tilesWide: 3 },
  poster: { key: 'prop-poster', tilesHigh: 2 },
  parasol: { key: 'prop-parasol', tilesHigh: 2 },
  'cafe-table': { key: 'prop-cafe-table', tilesHigh: 1 },
  turnstile: { key: 'prop-turnstile', tilesHigh: 1 },
  // La fuente se apoya sobre agua (sólida): colisiona entera aunque el prop sólo cierre su base.
  fountain: { key: 'prop-fountain', tilesHigh: 2, tilesWide: 3, ambient: 'spray' },
  kiosk: { key: 'prop-kiosk', tilesHigh: 2, tilesWide: 2 },
  'bus-stop': { key: 'prop-bus-stop', tilesHigh: 2, tilesWide: 3 },
  car: { key: 'prop-car', tilesHigh: 1, tilesWide: 2 },
  'car-b': { key: 'prop-car-b', tilesHigh: 1, tilesWide: 2 },
  'car-c': { key: 'prop-car-c', tilesHigh: 1, tilesWide: 2 },
  van: { key: 'prop-van', tilesHigh: 2, tilesWide: 3 },
  bike: { key: 'prop-bike', tilesHigh: 1 },
  bin: { key: 'prop-bin', tilesHigh: 1 },
  vending: { key: 'prop-vending', tilesHigh: 2 },
  produce: { key: 'prop-produce', tilesHigh: 1 },
  'menu-board': { key: 'prop-menu-board', tilesHigh: 1 },
  hoop: { key: 'prop-hoop', tilesHigh: 2 },
  wardrobe: { key: 'prop-wardrobe', tilesHigh: 2 },
  sofa: { key: 'prop-sofa', tilesHigh: 1, tilesWide: 2 },
  treadmill: { key: 'prop-treadmill', tilesHigh: 2 },
  weights: { key: 'prop-weights', tilesHigh: 2 },
  'weight-bench': { key: 'prop-weight-bench', tilesHigh: 1 },
  lockers: { key: 'prop-lockers', tilesHigh: 2, tilesWide: 2 },
  mirror: { key: 'prop-mirror', tilesHigh: 1, tilesWide: 2 },
  'clothes-rack': { key: 'prop-clothes-rack', tilesHigh: 2, tilesWide: 2 },
  mannequin: { key: 'prop-mannequin', tilesHigh: 2 },
  'fitting-room': { key: 'prop-fitting-room', tilesHigh: 2 },
  register: { key: 'prop-register', tilesHigh: 1 },
  fridge: { key: 'prop-fridge', tilesHigh: 2 },
  gondola: { key: 'prop-gondola', tilesHigh: 1 },
  cooler: { key: 'prop-cooler', tilesHigh: 2 },
  'meeting-table': { key: 'prop-meeting-table', tilesHigh: 1, tilesWide: 3 },
  // Visual V2 (design/ART_BIBLE.md): texturas más altas o anchas que su tile; sólo la fila base colisiona.
  'plane-tree': { key: 'prop-plane-tree', tilesHigh: 5, variants: 3, shadow: [18, 6], cast: 16, castBlob: [48, 16] },
  'plaza-bench': { key: 'prop-plaza-bench', tilesHigh: 2, tilesWide: 2, shadow: [30, 5] },
  'street-lamp': { key: 'prop-street-lamp', tilesHigh: 4, light: { dy: 46, pool: [60, 28] }, shadow: [8, 3], cast: 22 },
  'bike-rack': { key: 'prop-bike-rack', tilesHigh: 2, tilesWide: 2, shadow: [30, 5] },
  'planter-box': { key: 'prop-planter-box', tilesHigh: 2, tilesWide: 2, shadow: [30, 5] },
  'metro-totem': { key: 'prop-metro-totem', tilesHigh: 3, shadow: [8, 3], cast: 18, emissive: 'glow-metro-totem' },
  'info-board': { key: 'prop-info-board', tilesHigh: 2, shadow: [14, 4], cast: 10, emissive: 'glow-info-board' },
  manhole: { key: 'prop-manhole', tilesHigh: 1, flat: true },
  drain: { key: 'prop-drain', tilesHigh: 1, flat: true },
  leaves: { key: 'prop-leaves', tilesHigh: 1, flat: true },
  'ticket-machine': { key: 'prop-ticket-machine', tilesHigh: 2, light: { dy: 22, cool: true } },
  'dj-booth': { key: 'prop-dj-booth', tilesHigh: 1, tilesWide: 3, light: { dy: 6, cool: true } },
  speaker: { key: 'prop-speaker', tilesHigh: 2 },
  // En la pared: se colocan sobre la fila de muro con cara, que ya es sólida.
  window: { key: 'prop-window', tilesHigh: 1, tilesWide: 2 },
  painting: { key: 'prop-painting', tilesHigh: 1 },
  clock: { key: 'prop-clock', tilesHigh: 1 },
  chalkboard: { key: 'prop-chalkboard', tilesHigh: 1, tilesWide: 2 },
  neon: { key: 'prop-neon', tilesHigh: 1, tilesWide: 2, light: { dy: 8, cool: true } },
  'wall-shelf': { key: 'prop-wall-shelf', tilesHigh: 1, tilesWide: 2 },
  bottles: { key: 'prop-bottles', tilesHigh: 1, tilesWide: 2 },
  // Botellero de vinoteca: rombos de madera con botellas acostadas, del suelo al techo.
  'wine-rack': { key: 'prop-wine-rack', tilesHigh: 2 },
  // Sillón de barbero: alguien se sienta encima.
  'barber-chair': { key: 'prop-barber-chair', tilesHigh: 2, seat: true },
  // Estudio de tatuaje y tiendas de la Calle del Carmen.
  'tattoo-chair': { key: 'prop-tattoo-chair', tilesHigh: 2, seat: true },
  'tattoo-cart': { key: 'prop-tattoo-cart', tilesHigh: 2, light: { dy: 24 }, shadow: [10, 3] },
  'flash-wall': { key: 'prop-flash-wall', tilesHigh: 1, tilesWide: 2 },
  'sneaker-wall': { key: 'prop-sneaker-wall', tilesHigh: 1, tilesWide: 2, light: { dy: 8, cool: true } },
  'bargain-bin': { key: 'prop-bargain-bin', tilesHigh: 1, tilesWide: 2 },
  // Columna de carteles de la calle: alta y estrecha, con su sombra al sureste.
  'poster-column': { key: 'prop-poster-column', tilesHigh: 3, shadow: [12, 4], cast: 16 },
  // Sobre un mostrador: comparten tile con él.
  espresso: { key: 'prop-espresso', tilesHigh: 1 },
  'pastry-case': { key: 'prop-pastry-case', tilesHigh: 1 },
  // Del techo.
  pendant: { key: 'prop-pendant', tilesHigh: 2, overhead: true, light: { dy: 14 } },
  'tube-light': { key: 'prop-tube-light', tilesHigh: 2, tilesWide: 2, overhead: true, light: { dy: 14, cool: true } },
  // Lámpara de pie: la luz cálida de un salón, con su charco en el suelo.
  'floor-lamp': { key: 'prop-floor-lamp', tilesHigh: 2, light: { dy: 24, pool: [36, 16] }, shadow: [8, 3] },
  // Mesa baja de tienda con ropa doblada en montones.
  'display-table': { key: 'prop-display-table', tilesHigh: 1, tilesWide: 2 },
  // Micromobiliario de la calle: lo coloca systems/Dressing.ts por contexto.
  container: { key: 'prop-container', tilesHigh: 2, variants: 4, shadow: [14, 4] },
  mailbox: { key: 'prop-mailbox', tilesHigh: 2, shadow: [8, 3] },
  bollard: { key: 'prop-bollard', tilesHigh: 1, shadow: [6, 2] },
  'parking-sign': { key: 'prop-parking-sign', tilesHigh: 3, shadow: [6, 2] },
  'street-sign': { key: 'prop-street-sign', tilesHigh: 3, shadow: [6, 2] },
  'utility-box': { key: 'prop-utility-box', tilesHigh: 2, shadow: [12, 3] },
  scooter: { key: 'prop-scooter', tilesHigh: 2, variants: 2, shadow: [10, 3] },
  'ad-panel': { key: 'prop-ad-panel', tilesHigh: 3, emissive: 'glow-ad-panel', shadow: [12, 3] },
  barrier: { key: 'prop-barrier', tilesHigh: 1, tilesWide: 2 },
  skip: { key: 'prop-skip', tilesHigh: 2, tilesWide: 2, shadow: [30, 5] },
  debris: { key: 'prop-debris', tilesHigh: 1, flat: true, variants: 3 },
};

export function tileAt(ground: readonly string[], tx: number, ty: number): TileDef | undefined {
  const row = ground[ty];
  if (row === undefined) return undefined;
  return TILES[row[tx] ?? ''];
}

/** Variante estable por posición: rompe la repetición sin aleatoriedad entre partidas. */
export function variantKey(def: TileDef, tx: number, ty: number): string {
  if (def.variants <= 1) return `${def.key}-0`;
  return `${def.key}-${(tx * 7 + ty * 13) % def.variants}`;
}

/** Textura de una colocación: con variantes, la que toca por posición (la misma en cada visita). */
export function propKey(def: PropDef, tx: number, ty: number): string {
  return def.variants ? `${def.key}-${(tx * 7 + ty * 13) % def.variants}` : def.key;
}
