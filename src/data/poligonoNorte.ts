import type { BuildingDef, LocationDef, PointDef, PropKind, PropPlacement } from '../types/game.ts';

/**
 * POLÍGONO NORTE (Alpha-09): la calle de Decathlon, al final de la Línea 2. Antes era sólo un menú en la parada; ahora
 * se baja del metro, se sale a la explanada y se cruza hasta la puerta, como en la foto de la fachada
 * (design/Decathlon/8b6496bb…png): nave larga de listones de madera, el rótulo blanco, la franja azul y la planta baja
 * de cristal.
 *
 *   y 0–13  la nave (data/decathlon.ts por dentro): cubierta plana arriba, la fachada de tres alturas abajo; la puerta
 *           automática a la derecha, donde está la entrada del plano. A su derecha, la boca de metro
 *   y 14–17 la explanada de delante: granito frente a la puerta, acera el resto, farolas y aparcabicis
 *   y 18–29 el aparcamiento: dos filas de coches, una isleta con árboles en medio y dos pasos de cebra hacia la puerta
 *   y 30–33 la acera del borde, con la marquesina y el talud de césped
 *
 * Tráfico por la calle de acceso (filas 19 y 21, sin coches aparcados encima) y gente de paso (data/streets.ts): quien
 * llega en metro o deja el coche en el pasillo del aparcamiento (fila 26), cruza por el paso de cebra y entra; y quien
 * sale, al revés. Todo con la tienda abierta: de noche, el polígono se vacía.
 */
const W = 56;
const H = 34;

type Paint = readonly [string, number, number, number, number];

function paint(fill: string, rects: readonly Paint[]): string[] {
  const grid = Array.from({ length: H }, () => Array<string>(W).fill(fill));
  for (const [ch, x, y, w, h] of rects) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[yy][xx] = ch;
  }
  return grid.map((row) => row.join(''));
}

/** Columna de la puerta de la nave y de la boca de metro. */
const DOOR_X = 38;
const METRO_DOOR_X = 51;

const GROUND = paint(',', [
  // La explanada de granito delante de la puerta, y la franja podotáctil al pie de la boca de metro.
  ['P', 33, 14, 11, 4],
  ['T', 50, 13, 3, 1],
  // El aparcamiento: asfalto, la isleta de césped y los dos pasos de cebra hacia la puerta.
  ['.', 0, 18, W, 12],
  ['g', 0, 25, W, 1],
  // La acera central del aparcamiento (fila 26), junto a la isleta: por donde se va del coche a la puerta.
  [',', 0, 26, W, 1],
  ['z', 37, 18, 3, 7], ['z', 37, 27, 3, 3], [',', 37, 25, 3, 1],
  // El borde: acera y el talud.
  ['g', 0, 32, W, 2],
]);

const b = (
  id: string,
  name: string,
  style: BuildingDef['style'],
  [tx, ty, w, h]: readonly [number, number, number, number],
  doorX: number,
  extra: Partial<BuildingDef> = {},
): BuildingDef => ({ id, name, style, tx, ty, w, h, front: 's', doorX, ...extra });

const BUILDINGS: readonly BuildingDef[] = [
  b('pn-decathlon', 'Decathlon · Polígono Norte', 'megastore', [2, 0, 46, 14], DOOR_X, { floors: 3, enter: { location: 'decathlon-tienda', spawn: 'entry' }, point: 'PN_DECATHLON_ENTRANCE' }),
  b('pn-metro', 'Metro · Polígono Norte', 'metro', [49, 9, 5, 4], METRO_DOOR_X, { enter: { location: 'decathlon-station', spawn: 'entry' }, point: 'PN_METRO_ENTRANCE' }),
];

const at = (kind: PropKind, tx: number, ty: number): PropPlacement => ({ kind, tx, ty });
const many = (kind: PropKind, cells: readonly (readonly [number, number])[]): PropPlacement[] => cells.map(([x, y]) => at(kind, x, y));
/** Coches aparcados en fila (tres tiles cada uno, con un tile entre dos), saltándose el paso hacia la puerta. */
const parked = (y: number, xs: readonly number[]): PropPlacement[] => xs.map((x, i) => at((['car', 'car-b', 'car-c', 'van'] as const)[(x + y + i) % 4], x, y));

const PROPS: readonly PropPlacement[] = [
  // La explanada: farolas, el aparcabicis junto a la puerta, las papeleras y el plano del polígono junto al metro.
  ...many('street-lamp', [[6, 17], [18, 17], [30, 17], [46, 17]]),
  at('bike-rack', 44, 15), at('bike-rack', 28, 15),
  ...many('bin', [[32, 17], [43, 17]]),
  ...many('planter-box', [[12, 15], [22, 15]]),
  // La máquina de bebidas contra la fachada, junto al granito: latas y envoltorios para la limpieza (systems/Litter).
  at('vending', 31, 14),
  at('metro-totem', 54, 14),
  // El tablón del barrio (systems/Boards): junto a la boca de metro, fuera del paso de la puerta al andén.
  at('notice-board', 50, 16),
  // El aparcamiento: dos filas de coches contra la isleta, que lleva árboles; la señal de la entrada.
  ...parked(24, [1, 5, 9, 13, 17, 21, 25, 29, 33, 41, 45, 49]),
  ...parked(28, [3, 7, 11, 15, 19, 23, 27, 31, 42, 46, 50]),
  ...many('plane-tree', [[3, 25], [11, 25], [19, 25], [27, 25], [45, 25], [53, 25]]),
  at('parking-sign', 36, 18),
  // El borde: farolas, la marquesina del autobús (sólo decorado: aquí no para ninguna línea) y un contenedor.
  ...many('street-lamp', [[8, 31], [24, 31], [44, 31]]),
  at('bus-stop', 30, 31),
  at('container', 52, 31),
];

const p = (tx: number, ty: number, kind: PointDef['kind'], facing?: PointDef['facing']): PointDef => ({ tx, ty, kind, facing });

/** Donde se baja del coche: la acera central entre las dos filas del aparcamiento. */
const PARK = [6, 14, 22, 30, 46] as const;

const POINTS: Record<string, PointDef> = {
  // El resto de la ciudad: la acera de la fachada y la del fondo, por los dos lados.
  EDGE_PN_W: p(0, 16, 'edge'), EDGE_PN_E: p(W - 1, 16, 'edge'),
  EDGE_PN_SW: p(0, 30, 'edge'), EDGE_PN_SE: p(W - 1, 30, 'edge'),
  // De la puerta de la nave a la boca de metro, por la explanada.
  'pn-14-48': p(48, 14, 'path'),
  // La acera de la fachada, hasta el granito; y la bajada por el paso de cebra, la isleta y el pasillo del aparcamiento.
  'pn-16-33': p(33, 16, 'path'),
  'pn-17-38': p(38, 17, 'path'), 'pn-25-38': p(38, 25, 'path'), 'pn-26-38': p(38, 26, 'path'), 'pn-30-38': p(38, 30, 'path'),
  ...Object.fromEntries(PARK.map((x, i): [string, PointDef] => [`PN_PARK_0${i + 1}`, p(x, 26, 'wait', 'up')])),
  // Quien espera a alguien a la puerta, con la bolsa.
  PN_DECATHLON_WAIT_01: p(36, 15, 'wait', 'up'),
  PN_DECATHLON_WAIT_02: p(41, 16, 'wait', 'left'),
};

const LINKS: readonly (readonly [string, string])[] = [
  ['PN_DECATHLON_ENTRANCE', 'pn-14-48'], ['pn-14-48', 'PN_METRO_ENTRANCE'], ['pn-14-48', 'EDGE_PN_E'],
  ['EDGE_PN_W', 'pn-16-33'], ['pn-16-33', 'PN_DECATHLON_ENTRANCE'],
  ['PN_DECATHLON_ENTRANCE', 'pn-17-38'], ['pn-17-38', 'pn-25-38'], ['pn-25-38', 'pn-26-38'], ['pn-26-38', 'pn-30-38'],
  ['EDGE_PN_SW', 'pn-30-38'], ['pn-30-38', 'EDGE_PN_SE'],
  // El pasillo del aparcamiento, de coche en coche hasta el paso.
  ['PN_PARK_01', 'PN_PARK_02'], ['PN_PARK_02', 'PN_PARK_03'], ['PN_PARK_03', 'PN_PARK_04'], ['PN_PARK_04', 'pn-26-38'], ['pn-26-38', 'PN_PARK_05'],
  ['PN_DECATHLON_WAIT_01', 'PN_DECATHLON_ENTRANCE'], ['PN_DECATHLON_WAIT_02', 'PN_DECATHLON_ENTRANCE'],
];

export const POLIGONO_NORTE: LocationDef = {
  id: 'poligono-norte',
  name: 'Polígono Norte',
  kind: 'exterior',
  ground: GROUND,
  buildings: BUILDINGS,
  props: PROPS,
  portals: [],
  npcs: [],
  spawns: {},
  points: POINTS,
  links: LINKS,
  // La calle de acceso: un carril por sentido delante de la fachada. Con la tienda abierta, coches; de noche, casi nadie.
  traffic: {
    lanes: [{ row: 19, dir: -1 }, { row: 21, dir: 1 }],
    road: 'residential',
    perLane: 2,
    hourly: [[0, 8.5, 0], [8.5, 9.5, 1], [9.5, 21, 2], [21, 22, 1], [22, 24, 0]],
  },
  inspects: [
    { tx: 14, ty: 12, name: 'Decathlon', lines: ['Una nave de cien metros forrada de listones de madera, con el rótulo blanco y la franja azul. Dentro se oye el pitido de la caja y una bici que alguien prueba en el pasillo.'] },
    { tx: 54, ty: 14, name: 'Plano del polígono', lines: ['Polígono Norte: la nave de deportes, el aparcamiento y el metro. Línea 2 hacia Ribera Norte, Vallesco y el centro.'] },
    { tx: 30, ty: 31, name: 'Marquesina', lines: ['Una marquesina sin horario: el autobús del polígono ya no para aquí. Alguien ha pegado un cartel: «Ahora, en metro».'] },
  ],
  areas: [
    { name: 'Decathlon', tx: 24, ty: 6 },
    { name: 'Aparcamiento', tx: 20, ty: 22 },
  ],
};
