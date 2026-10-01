import type { BuildingDef, LocationDef, PointDef, PropKind, PropPlacement } from '../types/game.ts';

/**
 * Corte vertical de pixel art (design/visual-reference.png.jpeg): la plazuela
 * del metro compuesta como la imagen de referencia, con el arte de siempre
 * —texturas a 1 px de mundo, zoom entero, sin suavizado—. Es la escena donde
 * se prueba el acabado antes de llevarlo al barrio:
 *
 *   arriba     el seto del parque, con jardineras pegadas;
 *   izquierda  el café con su pizarra, y dos árboles en parterre;
 *   centro     la boca de metro con su franja podotáctil;
 *   derecha    banco, mupi luminoso, buzón y arbustos;
 *   abajo      aparcabicis entre bolardos, la acera y la calzada.
 *
 * Se abre con `?proto` en la URL y no guarda partida: el juego de siempre no se entera.
 */
const W = 20;
const H = 17;

type Paint = readonly [string, number, number, number, number];

function paint(fill: string, rects: readonly Paint[]): string[] {
  const grid = Array.from({ length: H }, () => Array<string>(W).fill(fill));
  for (const [ch, x, y, w, h] of rects) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[yy][xx] = ch;
  }
  return grid.map((row) => row.join(''));
}

/*
 * Plano, calcado de la referencia (una columna y una fila de margen):
 *   0–1   el borde del parque: césped y seto
 *   2–13  la plazuela de granito; el café a la izquierda (3–10), la boca de metro en el centro (4–7)
 *   8     franja podotáctil delante de la escalera
 *   14    acera
 *   15–16 calzada
 */
const GROUND = paint('P', [
  ['g', 0, 0, W, 2],
  ['T', 8, 8, 5, 1],
  [',', 0, 14, W, 1],
  ['=', 0, 15, W, 1],
  ['.', 0, 16, W, 1],
]);

const BUILDINGS: readonly BuildingDef[] = [
  { id: 'proto-cafe', name: 'Café Andén', style: 'cafe', tx: 0, ty: 3, w: 3, h: 8, front: 's', doorX: 1, floors: 2, inspect: ['Café Andén. Barra de cinc, tostadas y el periódico de hoy colgado en un palo.'] },
  // La boca de metro, el foco de la escena. La escalera baja de verdad: lleva a la estación.
  { id: 'proto-metro', name: 'Metro · Vallesco', style: 'metro', tx: 8, ty: 4, w: 5, h: 4, front: 's', doorX: 10, floors: 1, enter: { location: 'vallesco-station', spawn: 'entry' }, point: 'PROTO_METRO_ENTRANCE' },
];

const at = (kind: PropKind, tx: number, ty: number): PropPlacement => ({ kind, tx, ty });

const PROPS: readonly PropPlacement[] = [
  // El seto del parque, de punta a punta, y las jardineras arrimadas a él.
  ...Array.from({ length: W }, (_, x) => at('bush', x, 1)),
  at('planter-box', 4, 2), at('planter-box', 13, 2), at('planter-box', 16, 2),
  // Izquierda: dos árboles en parterre con su farola, papelera, banco, bicis y la pizarra del café.
  at('bed-tree', 5, 6), at('street-lamp', 7, 5), at('bin', 7, 6),
  at('plaza-bench', 4, 8),
  at('bed-tree', 5, 12), at('street-lamp', 3, 13), at('planter', 2, 13),
  at('menu-board', 1, 12),
  at('bollard', 8, 12), at('bike-rack', 9, 12), at('bollard', 11, 12),
  // Derecha: farola, buzón, mupi, banco con flores, farola de abajo y arbustos de borde.
  at('street-lamp', 15, 5), at('mailbox', 16, 7), at('ad-panel', 17, 8),
  at('flower-bed', 15, 9), at('plaza-bench', 14, 10),
  at('street-lamp', 17, 12), at('bush', 19, 6), at('bush', 19, 12), at('planter', 18, 12),
];

const p = (tx: number, ty: number, kind: PointDef['kind'], facing?: PointDef['facing']): PointDef => ({ tx, ty, kind, facing });

const POINTS: Readonly<Record<string, PointDef>> = {
  PROTO_EDGE_W: p(0, 11, 'edge'), PROTO_EDGE_E: p(W - 1, 11, 'edge'),
  PROTO_EDGE_SW: p(0, 14, 'edge'), PROTO_EDGE_SE: p(W - 1, 14, 'edge'),
  // Quien queda con alguien que sale del metro, y un corrillo junto a la farola de la derecha.
  PROTO_MEET_01: p(8, 9, 'wait', 'right'), PROTO_MEET_02: p(13, 9, 'wait', 'left'),
  PROTO_TALK_01: p(14, 7, 'meet', 'right'), PROTO_TALK_02: p(15, 7, 'meet', 'left'),
  // Nodos del grafo.
  'p-w': p(3, 11, 'path'), 'p-c': p(13, 11, 'path'), 'p-e': p(17, 11, 'path'),
  's-13': p(13, 14, 'path'),
};

type Link = readonly [string, string];

const LINKS: readonly Link[] = [
  ['PROTO_EDGE_W', 'p-w'], ['p-w', 'p-c'], ['p-c', 'p-e'], ['p-e', 'PROTO_EDGE_E'],
  ['p-c', 'PROTO_METRO_ENTRANCE'], ['p-c', 's-13'],
  ['PROTO_EDGE_SW', 's-13'], ['s-13', 'PROTO_EDGE_SE'],
  ['p-c', 'PROTO_MEET_01'], ['p-c', 'PROTO_MEET_02'],
  ['p-c', 'PROTO_TALK_01'], ['PROTO_TALK_01', 'PROTO_TALK_02'],
];

export const PROTOTYPE_PLAZUELA: LocationDef = {
  id: 'plazuela-v3',
  name: 'Plazuela del Metro · corte vertical',
  kind: 'exterior',
  district: 'transit',
  // El café es comercio: su tramo va con su perfil.
  zones: [{ profile: 'commercial', tx: 0, ty: 3, w: 3, h: 9 }],
  ground: GROUND,
  buildings: BUILDINGS,
  props: PROPS,
  portals: [],
  npcs: [],
  spawns: { start: { tx: 10, ty: 9, facing: 'up' } },
  points: POINTS,
  links: LINKS,
  traffic: {
    lanes: [{ row: 15, dir: -1 }, { row: 16, dir: 1 }],
    road: 'avenue',
    perLane: 2,
  },
  areas: [{ name: 'Plazuela del Metro', tx: 10, ty: 11 }],
};
