import type { BuildingDef, LocationDef, PointDef, PropKind, PropPlacement } from '../types/game.ts';
import { dress } from '../systems/Dressing.ts';

/**
 * Puerta Central: CENTRO + TURISMO + COMPRAS + TRANSPORTE + VIDA EN LA CALLE. Inspirado en el centro de Madrid sin copiar
 * ninguna plaza: una calle con autobús y dos carriles, y al sur una plaza peatonal enorme con un monumento propio (la Rosa
 * de los Vientos, una esfera armilar de bronce sobre su pedestal), dos bocas de metro, terraza, bancos, mantas de venta,
 * músicos, baile y estatua viviente. La zona más llena del juego: aquí la gente no pasa, se cruza.
 *
 *   y 0      callejón de servicio
 *   y 1–7    acera norte de la Calle de la Puerta: Pizzería Vesubio, Recuerdos de la Puerta, Moda Central, portales,
 *            el Hostal Puerta Central y más portales
 *   y 8–10   acera norte: escaparates contra la fachada, el paso en medio, farolas y árboles en el bordillo
 *   y 11–13  la Calle de la Puerta: carril bus hacia el oeste y dos carriles hacia el este; dos pasos con semáforo
 *   y 14–15  acera sur
 *   y 16–30  la PLAZA DE LA PUERTA: granito de punta a punta. Las dos bocas de metro arriba (oeste y este), el monumento
 *            en el centro, el paseo de las mantas abajo, la terraza del Café Central y el paseo de los portales (fila 29)
 *   y 31–38  la fachada sur de la plaza: Burger Plaza, Café Central y portales con balcones
 *   y 39     callejón de servicio
 *
 * Los puntos (PC_*, pc-*) siguen el idioma de siempre (data/streets.ts, perfil 'puerta-central'). Lo pequeño (papeleras,
 * paneles, bicis aparcadas) lo pone systems/Dressing con el kit del perfil 'centre' (data/districts.ts). La gente que
 * vende o actúa en la plaza tiene sus sitios aquí (PC_STALL_*, PC_ACT_*) y su horario en data/streetActs.ts.
 */
const W = 56;
const H = 40;

type Paint = readonly [string, number, number, number, number];

function paint(fill: string, rects: readonly Paint[]): string[] {
  const grid = Array.from({ length: H }, () => Array<string>(W).fill(fill));
  for (const [ch, x, y, w, h] of rects) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[yy][xx] = ch;
  }
  return grid.map((row) => row.join(''));
}

const GROUND = paint('g', [
  ['c', 0, 0, W, 1], // callejón de servicio
  [',', 0, 8, W, 3], // acera norte
  // La Calle de la Puerta: carril bus hacia el oeste, dos carriles hacia el este y los dos pasos con semáforo.
  ['u', 0, 11, W, 1],
  ['l', 0, 12, W, 1],
  ['.', 0, 13, W, 1],
  ['z', 5, 11, 3, 3], ['z', 47, 11, 3, 3],
  [',', 0, 14, W, 2], // acera sur
  // La plaza, entera de granito; bajo las dos bocas de metro, el relleno (su puerta no es acera para systems/Dressing).
  ['P', 0, 16, W, 15],
  ['g', 12, 17, 5, 4], ['g', 38, 17, 5, 4],
  // La franja podotáctil delante de cada boca.
  ['T', 13, 21, 3, 1], ['T', 39, 21, 3, 1],
  ['c', 0, 39, W, 1],
]);

const b = (
  id: string,
  name: string,
  style: BuildingDef['style'],
  [tx, ty, w, h]: readonly [number, number, number, number],
  front: BuildingDef['front'],
  doorX: number,
  extra: Partial<BuildingDef> = {},
): BuildingDef => ({ id, name, style, tx, ty, w, h, front, doorX, ...extra });

const into = (location: string): BuildingDef['enter'] => ({ location, spawn: 'entry' });

const BUILDINGS: readonly BuildingDef[] = [
  // Calle de la Puerta, acera norte: tres plantas, el comercio abajo y portales con balcón.
  b('pc-pizza', 'Pizzería Vesubio', 'restaurant', [0, 1, 7, 7], 's', 3, { floors: 3, enter: into('pc-pizza'), point: 'PC_PIZZA_ENTRANCE' }),
  b('pc-recuerdos', 'Recuerdos de la Puerta', 'souvenir', [7, 1, 7, 7], 's', 10, { floors: 3, enter: into('pc-recuerdos'), point: 'PC_RECUERDOS_ENTRANCE' }),
  b('pc-moda', 'Moda Central', 'fashion', [14, 1, 7, 7], 's', 17, { floors: 3, enter: into('pc-moda'), point: 'PC_MODA_ENTRANCE' }),
  // Montón (CV-03): la moda a precio de montón, en el bajo de lo que era el 9. Encima siguen los pisos.
  b('pc-puerta-9', 'Montón · moda', 'budget', [21, 1, 7, 7], 's', 24, { floors: 3, enter: into('pc-monton'), point: 'PC_PUERTA_9_ENTRANCE' }),
  b('pc-hostal', 'Hostal Puerta Central', 'res-plaster', [28, 1, 7, 7], 's', 31, { floors: 3, point: 'PC_HOSTAL_ENTRANCE' }),
  b('pc-puerta-13', 'Calle de la Puerta 13', 'res-brick', [35, 1, 7, 7], 's', 38, { floors: 3, point: 'PC_PUERTA_13_ENTRANCE' }),
  b('pc-puerta-17', 'Calle de la Puerta 17', 'res-noble', [42, 1, 7, 7], 's', 45, { floors: 3, point: 'PC_PUERTA_17_ENTRANCE' }),
  b('pc-puerta-21', 'Calle de la Puerta 21', 'res-stone', [49, 1, 7, 7], 's', 52, { floors: 3, point: 'PC_PUERTA_21_ENTRANCE' }),
  // Las dos bocas de metro de la plaza, mirando al sur; las dos bajan a la misma estación.
  b('pc-metro-w', 'Metro · Puerta Central (oeste)', 'metro', [12, 17, 5, 4], 's', 14, { enter: into('puerta-central-station'), point: 'PC_METRO_W_ENTRANCE' }),
  b('pc-metro', 'Metro · Puerta Central', 'metro', [38, 17, 5, 4], 's', 40, { enter: into('puerta-central-station'), point: 'PC_METRO_ENTRANCE' }),
  // La fachada sur de la plaza: la hamburguesería, el café de la terraza y portales.
  b('pc-burger', 'Burger Plaza', 'restaurant', [0, 31, 7, 8], 'n', 3, { enter: into('pc-burger'), point: 'PC_BURGER_ENTRANCE' }),
  b('pc-cafe', 'Café Central', 'cafe', [7, 31, 7, 8], 'n', 10, { enter: into('pc-cafe'), point: 'PC_CAFE_ENTRANCE' }),
  b('pc-plaza-4', 'Plaza de la Puerta 4', 'res-stone', [14, 31, 7, 8], 'n', 17, { point: 'PC_PLAZA_4_ENTRANCE' }),
  b('pc-plaza-6', 'Plaza de la Puerta 6', 'res-plaster', [21, 31, 7, 8], 'n', 24, { point: 'PC_PLAZA_6_ENTRANCE' }),
  // Almacenes Velarde (CV-03): los grandes almacenes de la plaza, con hogar y regalos (data/puertaCentralVenues.ts).
  b('pc-plaza-8', 'Almacenes Velarde', 'department', [28, 31, 7, 8], 'n', 31, { enter: into('pc-velarde'), point: 'PC_PLAZA_8_ENTRANCE' }),
  b('pc-plaza-10', 'Plaza de la Puerta 10', 'res-noble', [35, 31, 7, 8], 'n', 38, { point: 'PC_PLAZA_10_ENTRANCE' }),
  // La comisaría del centro (ficticia: Policía de Distrito): fachada clara con la banda azul y el escudo, puerta de cristal
  // al paseo de los portales. Recepción por dentro (data/puertaCentralVenues.ts) y de aquí salen las patrullas de la plaza.
  b('pc-comisaria', 'Comisaría de Puerta Central', 'police', [42, 31, 7, 8], 'n', 45, { enter: into('pc-comisaria'), point: 'PC_COMISARIA_ENTRANCE' }),
  b('pc-plaza-14', 'Plaza de la Puerta 14', 'res-plaster', [49, 31, 7, 8], 'n', 52, { point: 'PC_PLAZA_14_ENTRANCE' }),
];

const at = (kind: PropKind, tx: number, ty: number): PropPlacement => ({ kind, tx, ty });
const many = (kind: PropKind, cells: readonly (readonly [number, number])[]): PropPlacement[] => cells.map(([x, y]) => at(kind, x, y));

const PROPS: readonly PropPlacement[] = [
  // Bordillo de la calle: plátanos y farolas de forja alternos, sin tapar los pasos de cebra.
  ...many('plane-tree', [[2, 10], [16, 10], [27, 10], [41, 10], [53, 10]]),
  ...many('street-lamp-art', [[9, 10], [21, 10], [34, 10], [44, 10], [9, 14], [21, 14], [34, 14], [44, 14]]),
  // La plaza: el monumento en el centro, las farolas en el borde de arriba y en los laterales, los tótems del metro.
  at('monument', 27, 23),
  ...many('street-lamp-art', [[8, 16], [22, 16], [33, 16], [47, 16], [5, 22], [50, 22], [16, 27], [41, 27]]),
  ...many('metro-totem', [[17, 19], [43, 19]]),
  at('poster-column', 20, 17),
  // Bancos y sombra en los dos extremos, donde la plaza se abre a las calles de al lado.
  ...many('bench', [[6, 17], [49, 17]]),
  ...many('bench-up', [[1, 27], [54, 27]]),
  ...many('plane-tree', [[1, 19], [54, 19], [9, 19], [51, 20]]),
  // El quiosco de prensa y recuerdos y el de helados.
  at('kiosk', 53, 22),
  at('ice-cream-kiosk', 1, 22),
  // La terraza del Café Central: dos mesas con su silla y la sombrilla entre ellas.
  ...many('cafe-table', [[8, 27], [12, 27]]),
  ...many('chair-up', [[8, 28], [12, 28]]),
  at('parasol', 10, 27),
  // El tablón del barrio (systems/Boards): junto al metro, fuera de los caminos de la gente.
  at('notice-board', 8, 20),
];

// ---------------------------------------------------------------- puntos

const p = (tx: number, ty: number, kind: PointDef['kind'], facing?: PointDef['facing']): PointDef => ({ tx, ty, kind, facing });
const pad = (x: number): string => String(x).padStart(2, '0');
/** Puntos numerados desde 01 con el mismo prefijo: el público de una actuación, quien mira una manta. */
const ring = (pre: string, kind: PointDef['kind'], cells: readonly (readonly [number, number, PointDef['facing']])[]): Record<string, PointDef> =>
  Object.fromEntries(cells.map(([x, y, f], i) => [`${pre}${pad(i + 1)}`, p(x, y, kind, f)]));

const DOORS = [3, 10, 17, 24, 31, 38, 45, 52] as const;
/** Las bajadas de la acera a la plaza y del medio de la plaza al paseo de los portales. */
const DOWN_N = [3, 19, 25, 31, 36, 44, 52] as const;
const DOWN_S = [3, 15, 21, 28, 36, 43, 53] as const;

const POINTS: Record<string, PointDef> = {
  // Los bordes: el resto de la ciudad. Por las dos aceras de la calle y por los tres paseos de la plaza, a los dos lados.
  EDGE_PC_NW: p(0, 9, 'edge'), EDGE_PC_NE: p(W - 1, 9, 'edge'),
  EDGE_PC_SW: p(0, 15, 'edge'), EDGE_PC_SE: p(W - 1, 15, 'edge'),
  // Taxi y VTC: se espera en el bordillo norte, pegado al carril bus-taxi (sin carril bici en medio), lejos de los dos
  // pasos de cebra y entre farolas y árboles. El coche para justo delante (rides, abajo).
  PC_RIDE_WAIT_01: p(24, 10, 'wait', 'down'), PC_RIDE_WAIT_02: p(38, 10, 'wait', 'down'),
  EDGE_PC_MW: p(0, 24, 'edge'), EDGE_PC_ME: p(W - 1, 24, 'edge'),
  EDGE_PC_RW: p(0, 29, 'edge'), EDGE_PC_RE: p(W - 1, 29, 'edge'),

  // Escaparates: pegado al cristal.
  PC_RECUERDOS_WINDOW: p(8, 8, 'meet', 'up'),
  PC_MODA_WINDOW_01: p(15, 8, 'meet', 'up'), PC_MODA_WINDOW_02: p(19, 8, 'meet', 'up'),
  PC_PIZZA_WINDOW: p(5, 8, 'meet', 'up'),
  // El monumento: desde delante, desde los lados y desde detrás; la foto y el «quedamos en la Rosa».
  ...ring('PC_MONUMENT_VIEW_', 'meet', [[26, 25, 'up'], [28, 25, 'up'], [30, 25, 'up'], [25, 23, 'right'], [31, 23, 'left'], [27, 21, 'down']]),
  ...ring('PC_MEET_', 'meet', [[24, 25, 'right'], [32, 25, 'left'], [27, 26, 'up'], [29, 26, 'up']]),
  // Bancos y la terraza.
  PC_BENCH_01: p(6, 17, 'seat', 'down'), PC_BENCH_02: p(49, 17, 'seat', 'down'),
  PC_BENCH_03: p(1, 27, 'seat', 'up'), PC_BENCH_04: p(54, 27, 'seat', 'up'),
  PC_CAFE_TERRACE_01: p(8, 28, 'seat', 'up'), PC_CAFE_TERRACE_02: p(12, 28, 'seat', 'up'),
  PC_CAFE_TERRACE_WAITER: p(10, 28, 'work', 'up'),
  // El metro: quien espera a alguien junto a cada boca.
  ...ring('PC_METRO_MEET_', 'wait', [[11, 22, 'right'], [18, 22, 'left'], [37, 22, 'right'], [44, 22, 'left']]),
  // Quien mira el quiosco y la heladería.
  PC_KIOSK_WINDOW: p(53, 23, 'meet', 'up'),
  PC_ICE_CREAM: p(2, 23, 'wait', 'up'),

  // Venta en manta (data/streetActs.ts): quien vende, en la fila 26 mirando abajo; la manta, delante (fila 27, la pinta
  // world/StreetActArt); quien mira, a los dos lados de la manta, mirándola.
  PC_STALL_A: p(18, 26, 'wait', 'down'), ...ring('PC_STALL_A_SEE_', 'meet', [[17, 27, 'right'], [19, 27, 'left']]),
  PC_STALL_B: p(24, 26, 'wait', 'down'), ...ring('PC_STALL_B_SEE_', 'meet', [[23, 27, 'right'], [25, 27, 'left']]),
  PC_STALL_C: p(33, 26, 'wait', 'down'), ...ring('PC_STALL_C_SEE_', 'meet', [[32, 27, 'right'], [34, 27, 'left']]),
  PC_STALL_E: p(39, 26, 'wait', 'down'), ...ring('PC_STALL_E_SEE_', 'meet', [[38, 27, 'right'], [40, 27, 'left']]),
  // La bandeja: de pie, junto a la boca oeste; quien compra, delante.
  PC_STALL_D: p(8, 22, 'wait', 'down'), ...ring('PC_STALL_D_SEE_', 'meet', [[7, 23, 'up'], [9, 23, 'up']]),
  // Artistas: la guitarra junto al monumento, el baile entre el monumento y la boca este, la estatua al otro lado de la
  // boca este y el dúo del fin de semana en la esquina de la terraza. Su público, en corro, mirándolos.
  PC_ACT_GUITAR: p(22, 20, 'wait', 'down'),
  ...ring('PC_GUITAR_SEE_', 'meet', [[20, 21, 'right'], [21, 22, 'up'], [23, 22, 'up'], [24, 21, 'left']]),
  PC_ACT_DANCE_01: p(33, 19, 'wait', 'down'), PC_ACT_DANCE_02: p(35, 19, 'wait', 'down'), PC_ACT_DANCE_03: p(34, 20, 'wait', 'down'),
  ...ring('PC_DANCE_SEE_', 'meet', [[32, 21, 'up'], [33, 22, 'up'], [35, 22, 'up'], [36, 21, 'up'], [31, 20, 'right'], [37, 20, 'left']]),
  PC_ACT_STATUE: p(46, 19, 'wait', 'down'),
  ...ring('PC_STATUE_SEE_', 'meet', [[45, 21, 'up'], [47, 21, 'up'], [46, 22, 'up']]),
  PC_ACT_DUO_01: p(47, 26, 'wait', 'down'), PC_ACT_DUO_02: p(48, 26, 'wait', 'down'),
  ...ring('PC_DUO_SEE_', 'meet', [[46, 28, 'up'], [47, 28, 'up'], [48, 28, 'up'], [49, 28, 'up']]),

  // Nodos de paso: la acera norte (fila 9) con una por puerta, la acera sur (15), el medio de la plaza (24) y el paseo
  // de los portales (29), con una por puerta del sur. Y los dos pasos de cebra.
  ...Object.fromEntries(DOORS.map((x) => [`pc-n${pad(x)}`, p(x, 9, 'path')])),
  ...Object.fromEntries(DOWN_N.map((x) => [`pc-s${pad(x)}`, p(x, 15, 'path')])),
  ...Object.fromEntries([3, 14, 19, 25, 31, 36, 40, 44, 52].map((x) => [`pc-c${pad(x)}`, p(x, 24, 'path')])),
  ...Object.fromEntries([...new Set([...DOORS, ...DOWN_S])].map((x) => [`pc-r${pad(x)}`, p(x, 29, 'path')])),
  'pc-xw-n': p(6, 9, 'path'), 'pc-xw-s': p(6, 15, 'path'),
  'pc-xe-n': p(48, 9, 'path'), 'pc-xe-s': p(48, 15, 'path'),
};

type Link = readonly [string, string];
const chain = (...ids: string[]): Link[] => ids.slice(1).map((id, i) => [ids[i], id] as const);
const sorted = (pre: string): string[] => Object.keys(POINTS).filter((k) => k.startsWith(pre)).sort((a, z) => Number(a.slice(pre.length)) - Number(z.slice(pre.length)));
/** Todos los puntos con ese prefijo, enlazados a un nodo. */
const to = (pre: string, node: string): Link[] => Object.keys(POINTS).filter((k) => k.startsWith(pre)).map((k): Link => [k, node]);

const LINKS: readonly Link[] = [
  // Acera norte: de borde a borde, por el centro de la acera; puertas y escaparates a un lado.
  ...chain('EDGE_PC_NW', 'pc-n03', 'pc-xw-n', 'pc-n10', 'pc-n17', 'pc-n24', 'pc-n31', 'pc-n38', 'pc-n45', 'pc-xe-n', 'pc-n52', 'EDGE_PC_NE'),
  ['PC_PIZZA_ENTRANCE', 'pc-n03'], ['PC_RECUERDOS_ENTRANCE', 'pc-n10'], ['PC_MODA_ENTRANCE', 'pc-n17'], ['PC_PUERTA_9_ENTRANCE', 'pc-n24'],
  ['PC_HOSTAL_ENTRANCE', 'pc-n31'], ['PC_PUERTA_13_ENTRANCE', 'pc-n38'], ['PC_PUERTA_17_ENTRANCE', 'pc-n45'], ['PC_PUERTA_21_ENTRANCE', 'pc-n52'],
  ['PC_RIDE_WAIT_01', 'pc-n24'], ['PC_RIDE_WAIT_02', 'pc-n38'],
  ['PC_PIZZA_WINDOW', 'pc-n03'], ['PC_RECUERDOS_WINDOW', 'pc-n10'], ['PC_MODA_WINDOW_01', 'pc-n17'], ['PC_MODA_WINDOW_02', 'pc-n17'],
  // Los dos pasos de cebra.
  ['pc-xw-n', 'pc-xw-s'], ['pc-xe-n', 'pc-xe-s'],
  // Acera sur y bajadas a la plaza.
  ...chain('EDGE_PC_SW', 'pc-s03', 'pc-xw-s', 'pc-s19', 'pc-s25', 'pc-s31', 'pc-s36', 'pc-s44', 'pc-xe-s', 'pc-s52', 'EDGE_PC_SE'),
  ['pc-s03', 'pc-c03'], ['pc-s19', 'pc-c19'], ['pc-s25', 'pc-c25'], ['pc-s31', 'pc-c31'], ['pc-s36', 'pc-c36'], ['pc-s44', 'pc-c44'], ['pc-s52', 'pc-c52'],
  // El medio de la plaza, de lado a lado por delante del monumento, con las dos bocas de metro.
  ...chain('EDGE_PC_MW', 'pc-c03', 'pc-c14', 'pc-c19', 'pc-c25', 'pc-c31', 'pc-c36', 'pc-c40', 'pc-c44', 'pc-c52', 'EDGE_PC_ME'),
  ['PC_METRO_W_ENTRANCE', 'pc-c14'], ['PC_METRO_ENTRANCE', 'pc-c40'],
  ...to('PC_MONUMENT_VIEW_', 'pc-c25').filter(([id]) => id !== 'PC_MONUMENT_VIEW_05'), ['PC_MONUMENT_VIEW_05', 'pc-c31'], ...to('PC_MEET_', 'pc-c31'),
  ...to('PC_METRO_MEET_', 'pc-c14').slice(0, 2), ...to('PC_METRO_MEET_', 'pc-c40').slice(2),
  ['PC_BENCH_01', 'pc-s03'], ['PC_BENCH_02', 'pc-s52'], ['PC_ICE_CREAM', 'pc-c03'], ['PC_KIOSK_WINDOW', 'pc-c52'],
  // Mantas, bandeja y actuaciones: quien se pone y su público, cada uno a su nodo.
  ['PC_STALL_D', 'pc-c03'], ...to('PC_STALL_D_SEE_', 'pc-c03'),
  ['PC_ACT_GUITAR', 'pc-c19'], ...to('PC_GUITAR_SEE_', 'pc-c19'),
  ['PC_ACT_DANCE_01', 'pc-c31'], ['PC_ACT_DANCE_02', 'pc-c36'], ['PC_ACT_DANCE_03', 'pc-c36'], ...to('PC_DANCE_SEE_', 'pc-c36'),
  ['PC_ACT_STATUE', 'pc-c44'], ...to('PC_STATUE_SEE_', 'pc-c44'),
  // Del medio de la plaza al paseo de los portales, entre las mantas.
  ['pc-c03', 'pc-r03'], ['pc-c14', 'pc-r15'], ['pc-c19', 'pc-r21'], ['pc-c25', 'pc-r28'], ['pc-c36', 'pc-r36'], ['pc-c44', 'pc-r43'], ['pc-c52', 'pc-r53'],
  ...chain('EDGE_PC_RW', ...sorted('pc-r'), 'EDGE_PC_RE'),
  ['PC_BURGER_ENTRANCE', 'pc-r03'], ['PC_CAFE_ENTRANCE', 'pc-r10'], ['PC_PLAZA_4_ENTRANCE', 'pc-r17'], ['PC_PLAZA_6_ENTRANCE', 'pc-r24'],
  ['PC_PLAZA_8_ENTRANCE', 'pc-r31'], ['PC_PLAZA_10_ENTRANCE', 'pc-r38'], ['PC_COMISARIA_ENTRANCE', 'pc-r45'], ['PC_PLAZA_14_ENTRANCE', 'pc-r52'],
  ['PC_BENCH_03', 'pc-r03'], ['PC_BENCH_04', 'pc-r53'],
  ['PC_CAFE_TERRACE_WAITER', 'pc-r10'], ['PC_CAFE_TERRACE_01', 'pc-r10'], ['PC_CAFE_TERRACE_02', 'pc-r10'],
  ['PC_STALL_A', 'pc-c19'], ...to('PC_STALL_A_SEE_', 'pc-r17'),
  ['PC_STALL_B', 'pc-c25'], ...to('PC_STALL_B_SEE_', 'pc-r24'),
  ['PC_STALL_C', 'pc-c31'], ...to('PC_STALL_C_SEE_', 'pc-r31'),
  ['PC_STALL_E', 'pc-c40'], ...to('PC_STALL_E_SEE_', 'pc-r38'),
  ['PC_ACT_DUO_01', 'pc-c44'], ['PC_ACT_DUO_02', 'pc-c44'], ...to('PC_DUO_SEE_', 'pc-r45'),
];

/** Carril bus: autobuses y taxis, algún coche; nada de camiones. `*`: lo que no se nombra. */
const BUS_LANE = { '*': 0.2, bus: 3, taxi: 1.6, 'taxi-wagon': 1.4, 'taxi-hybrid': 1.4, vtc: 1, interurban: 1.2 };
/** Carriles normales: de todo menos autobuses; repartos de sobra. */
const CAR_LANE = { bus: 0, interurban: 0, van: 1.4, 'delivery-truck': 1.2 };

const BASE: LocationDef = {
  id: 'puerta-central',
  name: 'Puerta Central',
  kind: 'exterior',
  ground: GROUND,
  buildings: BUILDINGS,
  props: PROPS,
  portals: [],
  npcs: [],
  spawns: {},
  points: POINTS,
  links: LINKS,
  // Identidad visual (data/districts.ts): el centro; las dos bocas de metro, con su acero y su granito.
  district: 'centre',
  zones: [{ profile: 'transit', tx: 11, ty: 17, w: 7, h: 6 }, { profile: 'transit', tx: 37, ty: 17, w: 7, h: 6 }],
  traffic: {
    lanes: [
      { row: 11, dir: -1, bias: BUS_LANE },
      { row: 12, dir: 1, bias: CAR_LANE },
      { row: 13, dir: 1, bias: CAR_LANE },
    ],
    road: 'avenue',
    perLane: 3,
    hourly: [[0, 6, 1], [6, 7, 2], [7, 10, 3], [10, 19, 3], [19, 22, 3], [22, 24, 2]],
  },
  // Recogidas de taxi/VTC (systems/StreetLife): paran en el carril bus-taxi (fila 11), delante de quien espera.
  rides: [{ wait: 'PC_RIDE_WAIT_01', lane: 11, stopTx: 24 }, { wait: 'PC_RIDE_WAIT_02', lane: 11, stopTx: 38 }],
  // La terraza del Café Central (data/streets.ts: tableService): cada mesa, su silla y el sitio de quien atiende.
  tables: [
    { id: 'PC_CAFE_TERRAZA_01', seats: ['PC_CAFE_TERRACE_01'], service: { tx: 9, ty: 28 } },
    { id: 'PC_CAFE_TERRAZA_02', seats: ['PC_CAFE_TERRACE_02'], service: { tx: 13, ty: 28 } },
  ],
  signals: [
    { id: 'puerta-oeste', tx: 5, ty: 11, w: 3, h: 3 },
    { id: 'puerta-este', tx: 47, ty: 11, w: 3, h: 3, offset: 9_000 },
  ],
  inspects: [
    {
      tx: 28, ty: 23, name: 'La Rosa de los Vientos',
      lines: [
        'Una esfera armilar de bronce sobre un pedestal de granito, con los ocho vientos grabados alrededor. La placa dice que marca «el centro de todos los caminos de la ciudad».',
        'Debajo, más pequeño: «Si te pierdes, vuelve aquí». Media ciudad ha quedado alguna vez «en la Rosa».',
      ],
    },
    { tx: 4, ty: 8, name: 'Placa de la calle', lines: ['«Calle de la Puerta». Antes, dicen, había una puerta de verdad en la muralla. Ahora hay un paso de cebra y un autobús cada cuatro minutos.'] },
    { tx: 26, ty: 30, name: 'Placa de la plaza', lines: ['«Plaza de la Puerta». Alguien ha pegado encima un plano de turistas con un círculo rojo: «estás aquí».'] },
  ],
  // Nombres para el mapa (tecla M).
  areas: [
    { name: 'Calle de la Puerta', tx: 20, ty: 12 },
    { name: 'Plaza de la Puerta', tx: 22, ty: 28 },
  ],
};

export const PUERTA_CENTRAL: LocationDef = { ...BASE, finish: true, props: [...BASE.props, ...dress(BASE)] };
