import type { BuildingDef, LocationDef, PointDef, PropKind, PropPlacement } from '../types/game.ts';

/**
 * Prototipo Visual V3 (design/VISUAL_V3.md): la plazuela del metro de Vallesco
 * recompuesta como escena de dirección de arte, pintada entera en alta
 * definición (LocationDef.art = 'hd'). No es un barrio nuevo: es la misma
 * plazuela —boca de metro, avenida con tráfico, fachadas, árboles, bancos,
 * aparcabicis— ordenada para que se lea como un plano de cámara:
 *
 *   fondo        tres fachadas de cuatro plantas mirando a la plaza;
 *   plano medio  la avenida con su tráfico y el paso de cebra;
 *   foco         la boca de metro en el centro de la plazuela;
 *   marco        masas de arbolado a los lados y copas en primer plano abajo.
 *
 * Se abre con `?proto` en la URL (main.ts) y no guarda partida: el juego de
 * siempre no se entera. Si se aprueba, el estándar pasa al resto del mapa.
 */
const W = 34;
const H = 21;

type Paint = readonly [string, number, number, number, number];

function paint(fill: string, rects: readonly Paint[]): string[] {
  const grid = Array.from({ length: H }, () => Array<string>(W).fill(fill));
  for (const [ch, x, y, w, h] of rects) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[yy][xx] = ch;
  }
  return grid.map((row) => row.join(''));
}

/*
 * Plano, de arriba abajo (el fondo arriba, el primer plano abajo):
 *   0–6   tres fachadas de cuatro plantas, puertas en la fila 6
 *   7     acera al pie de las fachadas
 *   8–13  la plazuela de granito; la boca de metro en el centro, pegada a las casas
 *   14    acera de la avenida, con farolas y aparcabicis en el bordillo
 *   15–18 la avenida: carril bici, dos carriles y carril bici; paso de cebra a la derecha
 *   19    acera de enfrente
 *   20    alcorques corridos con los árboles del primer plano
 */
const GROUND = paint('g', [
  [',', 0, 7, W, 1],
  ['P', 3, 8, 28, 6],
  ['T', 15, 12, 5, 1], // franja podotáctil delante de la boca
  [',', 0, 14, W, 1],
  ['b', 0, 15, W, 1], // carril bici hacia el oeste
  ['=', 0, 16, W, 1], // carril hacia el oeste, con la línea central
  ['.', 0, 17, W, 1], // carril hacia el este
  ['b', 0, 18, W, 1], // carril bici hacia el este
  ['z', 24, 15, 3, 4], // paso de cebra
  [',', 0, 19, W, 1],
]);

const b = (id: string, name: string, style: BuildingDef['style'], [tx, ty, w, h]: readonly [number, number, number, number], doorX: number, extra: Partial<BuildingDef> = {}): BuildingDef => ({
  id, name, style, tx, ty, w, h, front: 's', doorX, floors: 2, ...extra,
});

const BUILDINGS: readonly BuildingDef[] = [
  // Fondo: tres casas de cuatro plantas. Las puertas son de vecinos y de locales sin interior: se miran, no se entran.
  b('proto-res-oeste', 'Avenida 1', 'res-brick', [0, 0, 11, 7], 4, { inspect: ['Un portal de madera con el número en azulejo. Huele a café de algún piso.'] }),
  b('proto-cafe', 'Café Andén', 'cafe', [11, 0, 12, 7], 13, { inspect: ['Café Andén. Barra de cinc, tostadas y el periódico de hoy colgado en un palo.'] }),
  b('proto-farmacia', 'Farmacia', 'pharmacy', [23, 0, 11, 7], 29, { inspect: ['La farmacia de guardia del barrio. La cruz verde se ve desde el metro.'] }),
  // La boca de metro, el foco de la escena. La escalera baja de verdad: lleva a la estación.
  b('proto-metro', 'Metro · Vallesco', 'metro', [15, 8, 5, 4], 17, { floors: 1, enter: { location: 'vallesco-station', spawn: 'entry' }, point: 'PROTO_METRO_ENTRANCE' }),
];

const at = (kind: PropKind, tx: number, ty: number): PropPlacement => ({ kind, tx, ty });

const PROPS: readonly PropPlacement[] = [
  // Plazuela: islas de árbol y banco a los lados de la boca, farolas altas, tótem, plano y jardineras.
  at('plane-tree', 8, 10), at('plaza-bench', 9, 12), at('plane-tree', 26, 10), at('plaza-bench', 23, 12),
  at('metro-totem', 20, 9), at('info-board', 12, 8), at('planter-box', 4, 8), at('planter-box', 29, 8),
  at('street-lamp', 13, 12), at('street-lamp', 20, 12), at('street-lamp', 5, 12), at('street-lamp', 29, 12),
  at('bin', 11, 12), at('manhole', 23, 9), at('drain', 7, 13),
  // Arbolado de los lados: el marco verde.
  at('plane-tree', 1, 9), at('bush', 0, 11), at('bush', 2, 13), at('plane-tree', 32, 9), at('bush', 33, 11), at('bush', 31, 13),
  // Aparcabicis y papelera en el borde de la plaza: la acera de la avenida es de paso.
  at('bike-rack', 3, 12), at('bin', 25, 12),
  // Acera de enfrente y los árboles del primer plano: sus copas entran por abajo en el encuadre.
  at('street-lamp', 18, 20),
  at('plane-tree', 3, 20), at('plane-tree', 12, 20), at('plane-tree', 30, 20), at('bush', 7, 20), at('bush', 21, 20), at('bush', 27, 20),
];

const p = (tx: number, ty: number, kind: PointDef['kind'], facing?: PointDef['facing']): PointDef => ({ tx, ty, kind, facing });

const POINTS: Readonly<Record<string, PointDef>> = {
  PROTO_EDGE_NW: p(0, 7, 'edge'), PROTO_EDGE_NE: p(W - 1, 7, 'edge'),
  PROTO_EDGE_SW: p(0, 14, 'edge'), PROTO_EDGE_SE: p(W - 1, 14, 'edge'),
  PROTO_EDGE_FW: p(0, 19, 'edge'), PROTO_EDGE_FE: p(W - 1, 19, 'edge'),
  // Quien queda con alguien que sale del metro, y un corrillo junto al tótem.
  PROTO_MEET_01: p(13, 13, 'wait', 'right'), PROTO_MEET_02: p(21, 13, 'wait', 'left'),
  PROTO_TALK_01: p(22, 10, 'meet', 'left'), PROTO_TALK_02: p(23, 10, 'meet', 'left'),
  // Nodos del grafo.
  'pn-06': p(6, 7, 'path'), 'pn-16': p(17, 7, 'path'), 'pn-27': p(27, 7, 'path'),
  'pp-06': p(6, 9, 'path'), 'pp-27': p(28, 9, 'path'), 'pp-sw': p(6, 13, 'path'), 'pp-se': p(28, 13, 'path'), 'pp-s': p(17, 13, 'path'),
  'ps-06': p(6, 14, 'path'), 'ps-16': p(17, 14, 'path'), 'ps-25': p(25, 14, 'path'), 'ps-28': p(28, 14, 'path'),
  'pf-25': p(25, 19, 'path'),
};

type Link = readonly [string, string];
const chain = (...ids: string[]): Link[] => ids.slice(1).map((id, i) => [ids[i], id] as const);

const LINKS: readonly Link[] = [
  ...chain('PROTO_EDGE_NW', 'pn-06', 'pn-16', 'pn-27', 'PROTO_EDGE_NE'),
  ['pn-06', 'pp-06'], ['pn-27', 'pp-27'],
  ...chain('pp-06', 'pp-sw', 'pp-s', 'pp-se', 'pp-27'),
  ['pp-s', 'PROTO_METRO_ENTRANCE'],
  ...chain('PROTO_EDGE_SW', 'ps-06', 'ps-16', 'ps-25', 'ps-28', 'PROTO_EDGE_SE'),
  ['pp-sw', 'ps-06'], ['pp-s', 'ps-16'], ['pp-se', 'ps-28'],
  ['ps-25', 'pf-25'], // el paso de cebra
  ...chain('PROTO_EDGE_FW', 'pf-25', 'PROTO_EDGE_FE'),
  ['pp-s', 'PROTO_MEET_01'], ['pp-s', 'PROTO_MEET_02'],
  ['pp-27', 'PROTO_TALK_01'], ['PROTO_TALK_01', 'PROTO_TALK_02'],
];

export const PROTOTYPE_PLAZUELA: LocationDef = {
  id: 'plazuela-v3',
  name: 'Plazuela del Metro · prototipo V3',
  kind: 'exterior',
  art: 'hd',
  // ≈ 21 × 13 tiles: la gente se lee (ropa, pelo, zapatos); desde la boca de metro se ven las plantas bajas y la avenida.
  view: [336, 210],
  district: 'transit',
  // El café y la farmacia son comercio: su tramo de fachada y la acera de delante van con su perfil.
  zones: [{ profile: 'commercial', tx: 11, ty: 0, w: 23, h: 8 }],
  ground: GROUND,
  buildings: BUILDINGS,
  props: PROPS,
  portals: [],
  npcs: [],
  spawns: { start: { tx: 17, ty: 13, facing: 'up' } },
  points: POINTS,
  links: LINKS,
  traffic: {
    lanes: [{ row: 16, dir: -1 }, { row: 17, dir: 1 }],
    road: 'avenue',
    perLane: 2,
  },
  areas: [
    { name: 'Avenida de Vallesco', tx: 8, ty: 17 },
    { name: 'Plazuela del Metro', tx: 24, ty: 11 },
  ],
};
