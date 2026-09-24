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
  o: { key: 'tile-office-carpet', solid: false, variants: 2 },
};

export interface PropDef {
  key: string;
  /** Altura en tiles. Sólo la fila base colisiona: se camina por detrás del resto. */
  tilesHigh: number;
  /** Ancho en tiles; por defecto uno. La posición del prop marca su tile izquierdo. */
  tilesWide?: number;
  /** Movimiento propio en reposo; lo anima world/Ambience. */
  ambient?: 'spray';
}

export const PROPS: Readonly<Record<PropKind, PropDef>> = {
  tree: { key: 'prop-tree', tilesHigh: 2 },
  bush: { key: 'prop-bush', tilesHigh: 1 },
  bench: { key: 'prop-bench', tilesHigh: 1 },
  lamp: { key: 'prop-lamp', tilesHigh: 2 },
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
