import type { LandmarkDef, LocationDef, TilePoint } from '../types/game.ts';

const WIDTH = 69;
const HEIGHT = 50;

// Medidas de la adaptación cenital, en tiles. El norte está arriba.
export const COLOSSEUM_SHAPE = {
  x: 20, y: 23, rx: 18.5, ry: 12.2, pitX: 8.6, pitY: 5.35,
  inner: 0.85, bays: 80, firstOuterBay: 43, lastOuterBay: 76,
} as const;

/** Alturas en píxeles de la envolvente conservada, de oeste a este. */
export function colosseumOuterHeight(bay: number): number {
  const { firstOuterBay: first, lastOuterBay: last } = COLOSSEUM_SHAPE;
  if (bay < first || bay > last) return 0;
  const west = [29, 47, 64, 82, 103, 117];
  const east = [34, 51, 76, 93, 112, 118];
  return west[bay - first] ?? east[last - bay] ?? 124 - ((bay * 5) % 7);
}

export const colosseumPassage = (angle: number): boolean => Math.abs(Math.sin(angle)) < 0.15;

function cells(tx: number, ty: number, w: number, h: number, contains: (x: number, y: number) => boolean): TilePoint[] {
  const result: TilePoint[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (contains(x + 0.5, y + 0.5)) result.push({ tx: tx + x, ty: ty + y });
  }
  return result;
}

const colosseumFrame = { tx: 22, ty: 7, w: 40, h: 37 };
const colosseum: LandmarkDef = {
  kind: 'colosseum', ...colosseumFrame,
  solid: cells(colosseumFrame.tx, colosseumFrame.ty, colosseumFrame.w, colosseumFrame.h, (x, y) => {
    const { x: cx, y: cy, rx, ry, pitX, pitY, inner, bays } = COLOSSEUM_SHAPE;
    const dx = x - cx;
    const dy = y - cy;
    if (Math.hypot(dx / pitX, dy / pitY) <= 1) return true;
    const angle = Math.atan2(dy / ry, dx / rx);
    if (colosseumPassage(angle)) return false;
    const bay = Math.floor((angle / (2 * Math.PI) + 1) * bays) % bays;
    const ring = Math.hypot(dx / rx, dy / ry);
    return Math.abs(ring - inner) < 0.72 / ry ||
      (colosseumOuterHeight(bay) > 0 && Math.abs(ring - 1) < 0.77 / ry);
  }),
};

const landmarks: readonly LandmarkDef[] = [
  colosseum,
  { kind: 'triumphal-arch', tx: 14, ty: 32, w: 6, h: 4, solid: cells(14, 32, 6, 4, (_x, y) => y >= 2) },
  { kind: 'roman-temple', tx: 8, ty: 15, w: 8, h: 5, solid: cells(8, 15, 8, 5, (_x, y) => y >= 1 && y < 4) },
];

const ground = Array.from({ length: HEIGHT }, (_, y) =>
  Array.from({ length: WIDTH }, (_, x) => {
    if (y >= 7 && y <= 9) return x >= 27 && x <= 29 ? 'z' : y === 8 ? 'l' : '.';
    if (y <= 6) return ',';
    if (y >= 47 || (y >= 31 && x <= Math.min(15, Math.floor((y - 31) * 0.85) + 3))) return 'g';
    if (x < 22 && y >= 10) return 'c';
    return 'P';
  }).join(''),
);

export const COLOSSEO: LocationDef = {
  id: 'roma-colosseo',
  name: 'Piazza del Colosseo',
  kind: 'exterior',
  finish: 'hd04',
  district: 'commercial',
  zones: [{ profile: 'transit', tx: 24, ty: 0, w: 9, h: 7 }],
  ground,
  landmarks,
  buildings: [{
    id: 'roma-metro', name: 'Metro Colosseo · Línea B', style: 'metro', tx: 25, ty: 2, w: 6, h: 4,
    front: 's', doorX: 28, point: 'ROMA_METRO_ENTRANCE',
    enter: { location: 'roma-colosseo-acceso', spawn: 'piazza' },
  }],
  props: [
    { kind: 'metro-totem', tx: 31, ty: 5 },
    { kind: 'street-lamp', tx: 21, ty: 6 }, { kind: 'street-lamp', tx: 34, ty: 6 },
    { kind: 'street-lamp', tx: 51, ty: 12 }, { kind: 'street-lamp', tx: 18, ty: 23 },
    { kind: 'street-lamp', tx: 62, ty: 31 }, { kind: 'street-lamp', tx: 44, ty: 44 },
    { kind: 'bin', tx: 20, ty: 19 }, { kind: 'bench', tx: 19, ty: 39 }, { kind: 'bench', tx: 61, ty: 37 },
    { kind: 'info-board', tx: 29, ty: 13 }, { kind: 'info-board', tx: 30, ty: 29 },
    { kind: 'bollard', tx: 24, ty: 15 }, { kind: 'bollard', tx: 23, ty: 20 },
    { kind: 'bollard', tx: 62, ty: 18 }, { kind: 'bollard', tx: 63, ty: 24 },
    { kind: 'tree', tx: 4, ty: 34 }, { kind: 'tree', tx: 6, ty: 39 },
    { kind: 'tree', tx: 10, ty: 43 }, { kind: 'tree', tx: 4, ty: 44 },
    { kind: 'bush', tx: 11, ty: 42 }, { kind: 'bush', tx: 8, ty: 45 },
  ],
  portals: [],
  spawns: {},
  npcs: [],
  points: {
    ROMA_CROSSING: { tx: 28, ty: 10, kind: 'path' },
    ROMA_VIEW_NORTH: { tx: 28, ty: 13, kind: 'meet', facing: 'down' },
    ROMA_WEST_APPROACH: { tx: 21, ty: 13, kind: 'path' },
    ROMA_WEST_GATE: { tx: 21, ty: 30, kind: 'path' },
    ROMA_WEST_GALLERY: { tx: 31, ty: 30, kind: 'path' },
    ROMA_WEST_VIEW: { tx: 32, ty: 24, kind: 'path' },
    ROMA_NORTH_VIEW: { tx: 42, ty: 23, kind: 'path' },
    ROMA_EAST_VIEW: { tx: 51, ty: 24, kind: 'path' },
    ROMA_EAST_GALLERY: { tx: 53, ty: 30, kind: 'path' },
    ROMA_EAST_GATE: { tx: 64, ty: 30, kind: 'path' },
  },
  links: [
    ['ROMA_METRO_ENTRANCE', 'ROMA_CROSSING'], ['ROMA_CROSSING', 'ROMA_VIEW_NORTH'],
    ['ROMA_VIEW_NORTH', 'ROMA_WEST_APPROACH'], ['ROMA_WEST_APPROACH', 'ROMA_WEST_GATE'],
    ['ROMA_WEST_GATE', 'ROMA_WEST_GALLERY'], ['ROMA_WEST_GALLERY', 'ROMA_WEST_VIEW'],
    ['ROMA_WEST_VIEW', 'ROMA_NORTH_VIEW'], ['ROMA_NORTH_VIEW', 'ROMA_EAST_VIEW'],
    ['ROMA_EAST_VIEW', 'ROMA_EAST_GALLERY'], ['ROMA_EAST_GALLERY', 'ROMA_EAST_GATE'],
  ],
  inspects: [
    {
      tx: 29, ty: 13, name: 'Colosseo · lado norte',
      lines: ['El anillo norte conserva las tres hileras de arcos y el ático con ventanas. Al sur falta el anillo exterior.', 'Entra por un extremo de la elipse para recorrer la galería alrededor de la arena.'],
    },
    {
      tx: 30, ty: 29, name: 'Hipogeo', lines: ['Bajo la arena había corredores y montacargas. El suelo moderno cubre solo una parte; desde la galería se ven los muros de ladrillo.'],
    },
    { tx: 12, ty: 20, name: 'Templo de Venus y Roma', lines: ['El templo se levanta en la Velia, en el camino hacia el Foro. Su cara dedicada a Venus miraba al anfiteatro.'] },
    { tx: 17, ty: 36, name: 'Arco de Constantino', lines: ['El arco fue dedicado en el año 315. Al suroeste se alza el Palatino.'] },
  ],
  areas: [
    { name: 'Via dei Fori Imperiali', tx: 17, ty: 8 },
    { name: 'Templo de Venus y Roma', tx: 12, ty: 18 },
    { name: 'Arco de Constantino', tx: 17, ty: 34 },
    { name: 'Palatino', tx: 9, ty: 44 },
  ],
  traffic: {
    lanes: [{ row: 7, dir: -1 }, { row: 9, dir: 1 }],
    road: 'residential',
    perLane: 1,
    hourly: [[0, 7, 0], [7, 22, 1], [22, 24, 0]],
  },
};

export const COLOSSEO_ACCESS: LocationDef = {
  id: 'roma-colosseo-acceso',
  name: 'Metro Colosseo · acceso Línea B',
  kind: 'interior',
  ground: [
    'WWWWWWDWWWWWW',
    'WtttttttttttW',
    'WtttttttttttW',
    'WtttttttttttW',
    'Wttttt,tttttW',
    'Wttttt,tttttW',
    'Wttttt,tttttW',
    'WtttttttttttW',
    'WWWWWWDWWWWWW',
  ],
  props: [
    { kind: 'metro-totem', tx: 4, ty: 2 },
    { kind: 'line-map', tx: 9, ty: 2 },
    { kind: 'bench', tx: 2, ty: 5 },
    { kind: 'pendant', tx: 6, ty: 3 },
    { kind: 'pendant', tx: 6, ty: 6 },
  ],
  portals: [
    { id: 'casco', tx: 6, ty: 0, label: 'Volver a Casco Antiguo', to: { location: 'casco-antiguo', spawn: 'roma-passage' } },
    { id: 'piazza', tx: 6, ty: 8, label: 'Salir a Piazza del Colosseo', to: { location: 'roma-colosseo', spawn: 'roma-metro' } },
  ],
  npcs: [],
  spawns: { entry: { tx: 6, ty: 2, facing: 'down' }, piazza: { tx: 6, ty: 7, facing: 'up' } },
  ambient: '#e5e9f2',
};
