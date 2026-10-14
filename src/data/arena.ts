import type { BuildingDef, LocationDef, PointDef, PropKind, PropPlacement } from '../types/game.ts';
import { dress } from '../systems/Dressing.ts';

/**
 * DISTRITO ARENA: el barrio del Estadio del Halcón (CD Halcones del Arena, data/cityEvents.ts ARENA_CLUB: turquesa y
 * naranja, todo inventado). Un día cualquiera es un barrio tranquilo de bares, un café, la tienda de deportes y
 * vecinos; un día de partido (systems/Match.ts) se llena horas antes, se vacía durante y se desborda al acabar.
 *
 *   y 0–15  el estadio: fachada de hormigón con cinco puertas; desde arriba, la grada y el césped. A los lados, el
 *           perímetro con las torres de focos y los mástiles de las banderas
 *   y 16    los tornos: dos por puerta, y el control de entradas (los de seguridad, en día de partido)
 *   y 17–19 las colas de cada puerta, entre vallas
 *   y 17–21 la explanada: la boca de metro al oeste, las taquillas al este, puestos de comida y de bufandas, el kiosco
 *   y 22–23 acera norte de la Avenida del Estadio
 *   y 24–28 la avenida: carril bici, un carril por sentido y carril bici. Dos pasos con semáforo
 *   y 29–31 acera sur, ancha: la gente de los bares sale a la puerta con la caña
 *   y 32–39 los bajos del barrio: deportes, la tienda oficial, hamburguesas, dos bares, pizzería, café y portales
 *
 * El estadio no tiene interior todavía: el edificio tiene su puerta y sus puntos (AR_GATE_*), y quien entra
 * desaparece en el torno. Cuando haya interior, la puerta principal lleva `enter` y nada más cambia.
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
  // El perímetro del estadio y la explanada: granito de punta a punta.
  ['P', 0, 0, 6, 16], ['P', 50, 0, 6, 16],
  ['P', 0, 16, W, 6],
  // La franja podotáctil delante de la boca de metro.
  ['T', 1, 21, 3, 1],
  // Aceras de la avenida (la sur, ancha para las terrazas de pie).
  [',', 0, 22, W, 2], [',', 0, 29, W, 3],
  // La Avenida del Estadio: carril bici, un carril por sentido y carril bici.
  ['b', 0, 24, W, 1],
  ['.', 0, 25, W, 1],
  ['l', 0, 26, W, 1],
  ['.', 0, 27, W, 1],
  ['b', 0, 28, W, 1],
  ['z', 13, 24, 3, 5], ['z', 40, 24, 3, 5],
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

/** Las cinco puertas del estadio (columna): la del centro es la de la tribuna, la del edificio. */
export const ARENA_GATES = [11, 19, 27, 35, 43] as const;
const MAIN_GATE = 3;

const BUILDINGS: readonly BuildingDef[] = [
  // El estadio: la fachada de la tribuna da a la explanada; su puerta es la Puerta 3.
  b('ar-estadio', 'Estadio del Halcón', 'stadium', [6, 0, 44, 16], 's', ARENA_GATES[MAIN_GATE - 1], { floors: 2, point: `AR_GATE_${MAIN_GATE}` }),
  b('ar-metro', 'Metro · Arena', 'metro', [0, 17, 5, 4], 's', 2, { enter: into('arena-station'), point: 'AR_METRO_ENTRANCE' }),
  // La acera sur: los bajos del barrio, todos mirando a la avenida y al estadio.
  b('ar-res-1', 'Avenida del Estadio 1', 'res-brick', [0, 32, 5, 8], 'n', 2, { point: 'AR_RES_1_ENTRANCE' }),
  b('ar-deportes', 'Deportes Arena', 'sports', [5, 32, 6, 8], 'n', 7, { enter: into('ar-deportes'), point: 'AR_DEPORTES_ENTRANCE' }),
  b('ar-oficial', 'Tienda Oficial Halcones', 'team-store', [11, 32, 7, 8], 'n', 14, { enter: into('ar-oficial'), point: 'AR_OFICIAL_ENTRANCE' }),
  b('ar-burger', 'Burger Fondo Sur', 'restaurant', [18, 32, 6, 8], 'n', 20, { enter: into('ar-burger'), point: 'AR_BURGER_ENTRANCE' }),
  b('ar-larguero', 'Bar El Larguero', 'bar', [24, 32, 5, 8], 'n', 26, { enter: into('ar-larguero'), point: 'AR_LARGUERO_ENTRANCE' }),
  b('ar-pizza', 'Pizzería La Prórroga', 'restaurant', [29, 32, 6, 8], 'n', 31, { enter: into('ar-pizza'), point: 'AR_PIZZA_ENTRANCE' }),
  b('ar-grada', 'Taberna La Grada', 'bar', [35, 32, 5, 8], 'n', 37, { enter: into('ar-grada'), point: 'AR_GRADA_ENTRANCE' }),
  b('ar-cafe', 'Café del Córner', 'cafe', [40, 32, 5, 8], 'n', 42, { enter: into('ar-cafe'), point: 'AR_CAFE_ENTRANCE' }),
  b('ar-res-2', 'Avenida del Estadio 21', 'res-plaster', [45, 32, 5, 8], 'n', 47, { point: 'AR_RES_2_ENTRANCE' }),
  b('ar-res-3', 'Avenida del Estadio 25', 'res-modern', [50, 32, 6, 8], 'n', 52, { point: 'AR_RES_3_ENTRANCE' }),
];

const at = (kind: PropKind, tx: number, ty: number): PropPlacement => ({ kind, tx, ty });
const many = (kind: PropKind, cells: readonly (readonly [number, number])[]): PropPlacement[] => cells.map(([x, y]) => at(kind, x, y));

const PROPS: readonly PropPlacement[] = [
  // Los tornos: dos por puerta, pegados a la fachada; entre ellos, el paso.
  ...ARENA_GATES.flatMap((x) => many('turnstile', [[x - 1, 16], [x + 1, 16]])),
  // Las vallas de las colas: un pasillo por puerta, de la explanada al torno.
  ...ARENA_GATES.flatMap((x) => many('barrier', [[x - 3, 18], [x + 2, 18]])),
  // El perímetro: torres de focos en las cuatro esquinas y banderas del club en los mástiles.
  ...many('floodlight', [[2, 4], [53, 4], [2, 14], [53, 14]]),
  ...many('flag-pole', [[4, 2], [51, 2], [4, 8], [51, 8], [15, 16], [39, 16]]),
  // La explanada: puestos de comida, de bufandas y el kiosco del programa, entre puerta y puerta.
  at('food-stall', 15, 20), at('scarf-stand', 23, 20), at('food-stall', 31, 20), at('scarf-stand', 39, 20),
  at('kiosk', 46, 20),
  // Las taquillas, al este; el plano del barrio, junto a la boca de metro.
  at('ticket-booth', 51, 18), at('ticket-booth', 53, 18),
  at('metro-totem', 6, 18),
  ...many('bin', [[10, 20], [17, 19], [34, 20], [37, 20]]),
  // La avenida: farolas contra la fachada de la acera sur y carteles del partido en la acera norte.
  ...many('street-lamp-art', [[4, 31], [17, 31], [28, 31], [39, 31], [49, 31], [9, 22], [33, 22]]),
  ...many('ad-panel', [[24, 22], [52, 22]]),
  at('poster-column', 17, 22),
];

// ---------------------------------------------------------------- puntos

const p = (tx: number, ty: number, kind: PointDef['kind'], facing?: PointDef['facing']): PointDef => ({ tx, ty, kind, facing });
const pad = (x: number): string => String(x).padStart(2, '0');

/** Columnas de las puertas de la acera sur: su nodo en el bordillo (fila 29). */
const SOUTH_DOORS = [2, 7, 14, 20, 26, 31, 37, 42, 47, 52] as const;
/** Nodos de la acera norte (fila 23) y de la explanada (fila 21). */
const NORTH = [2, 11, 14, 19, 27, 35, 41, 43, 50] as const;
const PLAZA = [11, 19, 27, 35, 43, 50] as const;

const POINTS: Record<string, PointDef> = {
  EDGE_AR_NW: p(0, 23, 'edge'), EDGE_AR_NE: p(W - 1, 23, 'edge'),
  EDGE_AR_SW: p(0, 29, 'edge'), EDGE_AR_SE: p(W - 1, 29, 'edge'),

  // Cada puerta: el torno (donde se entra), tres sitios de cola entre las vallas y quien controla las entradas.
  ...Object.fromEntries(ARENA_GATES.flatMap((x, i) => {
    const n = i + 1;
    const gate: [string, PointDef][] = n === MAIN_GATE ? [] : [[`AR_GATE_${n}`, p(x, 16, 'entrance', 'up')]];
    return [
      ...gate,
      [`AR_Q${n}_01`, p(x, 17, 'wait', 'up')], [`AR_Q${n}_02`, p(x, 18, 'wait', 'up')], [`AR_Q${n}_03`, p(x, 19, 'wait', 'up')],
      [`AR_STEWARD_${n}`, p(x - 2, 17, 'wait', 'right')],
    ];
  })),
  // Las taquillas: se pregunta, se recoge la entrada.
  AR_TAQUILLA_01: p(52, 20, 'wait', 'up'), AR_TAQUILLA_02: p(54, 20, 'wait', 'up'),
  // Corrillos de la afición en la explanada (cánticos, bufandas al aire) y la foto con la fachada detrás.
  AR_FANS_01: p(6, 20, 'meet', 'right'), AR_FANS_02: p(7, 20, 'meet', 'left'),
  AR_FANS_03: p(21, 20, 'meet', 'right'), AR_FANS_04: p(22, 20, 'meet', 'left'),
  AR_FANS_05: p(29, 20, 'meet', 'right'), AR_FANS_06: p(30, 20, 'meet', 'left'),
  AR_FANS_07: p(42, 20, 'meet', 'right'), AR_FANS_08: p(45, 19, 'meet', 'down'),
  AR_PHOTO_01: p(24, 19, 'meet', 'up'), AR_PHOTO_02: p(30, 19, 'meet', 'up'),
  // Los puestos de la explanada: se compra de pie, delante.
  AR_FOOD_01: p(15, 21, 'wait', 'up'), AR_FOOD_02: p(31, 21, 'wait', 'up'),
  AR_SCARF_01: p(23, 21, 'wait', 'up'), AR_SCARF_02: p(39, 21, 'wait', 'up'),
  AR_KIOSK_01: p(47, 21, 'wait', 'up'),
  // La venta ambulante del día de partido (data/streetActs.ts), en la acera norte.
  AR_PITCH_A: p(21, 22, 'wait', 'down'), AR_PITCH_B: p(31, 22, 'wait', 'down'), AR_PITCH_C: p(46, 22, 'wait', 'down'),
  // Quien se para a mirar la manta o la bandeja, a los lados, en el bordillo.
  AR_PITCH_A_SEE_01: p(20, 23, 'meet', 'right'), AR_PITCH_A_SEE_02: p(22, 23, 'meet', 'left'),
  AR_PITCH_B_SEE_01: p(30, 23, 'meet', 'right'), AR_PITCH_B_SEE_02: p(32, 23, 'meet', 'left'),
  AR_PITCH_C_SEE_01: p(45, 23, 'meet', 'right'), AR_PITCH_C_SEE_02: p(47, 23, 'meet', 'left'),
  // La cola del metro a la salida, por la acera, y quien espera a alguien junto a la boca.
  ...Object.fromEntries([1, 3, 4, 5, 6, 7].map((x, i) => [`AR_METRO_Q_${pad(i + 1)}`, p(x, 22, 'wait', 'left')])),
  AR_METRO_MEET_01: p(5, 20, 'wait', 'left'),
  // Con la caña a la puerta de los bares.
  AR_LARGUERO_OUT_01: p(25, 30, 'meet', 'right'), AR_LARGUERO_OUT_02: p(27, 30, 'meet', 'left'), AR_LARGUERO_OUT_03: p(28, 30, 'meet', 'left'),
  AR_GRADA_OUT_01: p(36, 30, 'meet', 'right'), AR_GRADA_OUT_02: p(38, 30, 'meet', 'left'), AR_GRADA_OUT_03: p(39, 30, 'meet', 'left'),
  AR_DEPORTES_WINDOW: p(9, 30, 'meet', 'down'), AR_OFICIAL_WINDOW: p(16, 30, 'meet', 'down'),
  // Policía: en los dos pasos (el tráfico) y en la explanada (la boca de metro y las taquillas).
  AR_POLICE_01: p(12, 23, 'wait', 'right'), AR_POLICE_02: p(16, 23, 'wait', 'left'),
  AR_POLICE_03: p(39, 29, 'wait', 'right'), AR_POLICE_04: p(43, 29, 'wait', 'left'),
  AR_POLICE_05: p(8, 19, 'wait', 'down'), AR_POLICE_06: p(49, 20, 'wait', 'down'),
  // Donde, de higos a brevas, dos de distinto equipo se enzarzan a voces (y la policía se acerca).
  AR_ARGUE_01: p(36, 23, 'meet', 'right'),

  ...Object.fromEntries(SOUTH_DOORS.map((x) => [`ar-s${pad(x)}`, p(x, 29, 'path')])),
  ...Object.fromEntries(NORTH.map((x) => [`ar-n${pad(x)}`, p(x, 23, 'path')])),
  ...Object.fromEntries(PLAZA.map((x) => [`ar-p${pad(x)}`, p(x, 21, 'path')])),
  'ar-p05': p(5, 21, 'path'),
  'ar-s41': p(41, 29, 'path'),
};

type Link = readonly [string, string];
const chain = (...ids: string[]): Link[] => ids.slice(1).map((id, i) => [ids[i], id] as const);

const LINKS: readonly Link[] = [
  // Acera norte, por el bordillo, y sus dos pasos.
  ...chain('EDGE_AR_NW', ...NORTH.map((x) => `ar-n${pad(x)}`), 'EDGE_AR_NE'),
  ['ar-n14', 'ar-s14'], ['ar-n41', 'ar-s41'],
  // Acera sur, con cada puerta.
  ...chain('EDGE_AR_SW', 'ar-s02', 'ar-s07', 'ar-s14', 'ar-s20', 'ar-s26', 'ar-s31', 'ar-s37', 'ar-s41', 'ar-s42', 'ar-s47', 'ar-s52', 'EDGE_AR_SE'),
  ['AR_RES_1_ENTRANCE', 'ar-s02'], ['AR_DEPORTES_ENTRANCE', 'ar-s07'], ['AR_OFICIAL_ENTRANCE', 'ar-s14'], ['AR_BURGER_ENTRANCE', 'ar-s20'],
  ['AR_LARGUERO_ENTRANCE', 'ar-s26'], ['AR_PIZZA_ENTRANCE', 'ar-s31'], ['AR_GRADA_ENTRANCE', 'ar-s37'], ['AR_CAFE_ENTRANCE', 'ar-s42'],
  ['AR_RES_2_ENTRANCE', 'ar-s47'], ['AR_RES_3_ENTRANCE', 'ar-s52'],
  ['AR_DEPORTES_WINDOW', 'ar-s07'], ['AR_OFICIAL_WINDOW', 'ar-s14'],
  ['AR_LARGUERO_OUT_01', 'ar-s26'], ['AR_LARGUERO_OUT_02', 'ar-s26'], ['AR_LARGUERO_OUT_03', 'AR_LARGUERO_OUT_02'],
  ['AR_GRADA_OUT_01', 'ar-s37'], ['AR_GRADA_OUT_02', 'ar-s37'], ['AR_GRADA_OUT_03', 'AR_GRADA_OUT_02'],
  ['AR_POLICE_03', 'ar-s41'], ['AR_POLICE_04', 'ar-s41'],
  // La explanada: el paseo de delante del estadio, de la boca de metro a las taquillas, con bajadas a la acera.
  ...chain('AR_METRO_ENTRANCE', 'ar-p05', ...PLAZA.map((x) => `ar-p${pad(x)}`)),
  ['AR_METRO_ENTRANCE', 'ar-n02'], ...PLAZA.filter((x) => (NORTH as readonly number[]).includes(x)).map((x) => [`ar-p${pad(x)}`, `ar-n${pad(x)}`] as const),
  ['AR_METRO_MEET_01', 'ar-p05'], ['AR_POLICE_05', 'ar-p05'], ['AR_POLICE_06', 'ar-p50'],
  ['AR_TAQUILLA_01', 'ar-p50'], ['AR_TAQUILLA_02', 'ar-p50'],
  // Cada puerta: de la explanada a la cola, de la cola al torno.
  ...ARENA_GATES.flatMap((x, i) => {
    const n = i + 1;
    return [...chain(`ar-p${pad(x)}`, `AR_Q${n}_03`, `AR_Q${n}_02`, `AR_Q${n}_01`, `AR_GATE_${n}`), [`AR_STEWARD_${n}`, `AR_Q${n}_01`] as const];
  }),
  ['AR_FANS_01', 'ar-p05'], ['AR_FANS_02', 'ar-p05'], ['AR_FANS_03', 'ar-p19'], ['AR_FANS_04', 'ar-p19'],
  ['AR_FANS_05', 'ar-p27'], ['AR_FANS_06', 'ar-p27'], ['AR_FANS_07', 'ar-p43'], ['AR_FANS_08', 'ar-p43'],
  ['AR_PHOTO_01', 'ar-p27'], ['AR_PHOTO_02', 'ar-p27'],
  ['AR_FOOD_01', 'ar-p11'], ['AR_FOOD_02', 'ar-p27'], ['AR_SCARF_01', 'ar-p19'], ['AR_SCARF_02', 'ar-p35'], ['AR_KIOSK_01', 'ar-p43'],
  ['AR_PITCH_A', 'ar-n19'], ['AR_PITCH_B', 'ar-n27'], ['AR_PITCH_C', 'ar-n43'],
  ['AR_PITCH_A_SEE_01', 'ar-n19'], ['AR_PITCH_A_SEE_02', 'ar-n19'], ['AR_PITCH_B_SEE_01', 'ar-n27'], ['AR_PITCH_B_SEE_02', 'ar-n35'],
  ['AR_PITCH_C_SEE_01', 'ar-n43'], ['AR_PITCH_C_SEE_02', 'ar-n50'],
  ...([1, 2, 3, 4, 5, 6] as const).map((i) => [`AR_METRO_Q_${pad(i)}`, 'ar-n02'] as const),
  ['AR_POLICE_01', 'ar-n11'], ['AR_POLICE_02', 'ar-n14'], ['AR_ARGUE_01', 'ar-n35'],
];

const BASE: LocationDef = {
  id: 'arena',
  name: 'Distrito Arena',
  kind: 'exterior',
  ground: GROUND,
  buildings: BUILDINGS,
  props: PROPS,
  portals: [],
  npcs: [],
  spawns: {},
  points: POINTS,
  links: LINKS,
  // Identidad visual (data/districts.ts): hormigón, luz blanca de foco y la explanada de granito.
  district: 'stadium',
  traffic: {
    lanes: [{ row: 25, dir: -1 }, { row: 27, dir: 1 }],
    road: 'avenue',
    perLane: 2,
    hourly: [[0, 7, 1], [7, 21, 2], [21, 24, 1]],
    bikes: {
      lanes: [{ row: 24, dir: -1 }, { row: 28, dir: 1 }],
      road: 'avenue',
      perLane: 1,
      hourly: [[0, 7, 0], [7, 21, 1], [21, 24, 0]],
      rainShy: 0.7,
    },
  },
  // Los dos pasos de la avenida, con semáforo (en día de partido, además, la policía).
  signals: [
    { id: 'arena-oeste', tx: 13, ty: 24, w: 3, h: 5 },
    { id: 'arena-este', tx: 40, ty: 24, w: 3, h: 5, offset: 7_000 },
  ],
  inspects: [
    { tx: 52, ty: 18, name: 'Taquillas', lines: ['«Taquillas del Estadio del Halcón. Día de partido: abren cuatro horas antes del saque.» Un folio pegado debajo: «Abonados, por la Puerta 3».'] },
    { tx: 27, ty: 15, name: 'Puerta 3 · Tribuna', lines: ['Una placa de bronce: «Estadio del Halcón. CD Halcones del Arena». Encima, un halcón turquesa con las alas abiertas.'] },
    { tx: 6, ty: 18, name: 'Plano del barrio', lines: ['Distrito Arena: el estadio, la explanada y la Avenida del Estadio. Puertas 1 a 5, de oeste a este. Alguien ha escrito «aquí se canta» en la 1.'] },
    { tx: 46, ty: 20, name: 'Kiosco', lines: ['Bufandas, la revista del club y pipas. En la portada, el once de la temporada con los brazos cruzados.'] },
  ],
  areas: [
    { name: 'Estadio del Halcón', tx: 28, ty: 7 },
    { name: 'Explanada', tx: 20, ty: 20 },
    { name: 'Avenida del Estadio', tx: 30, ty: 26 },
  ],
};

export const ARENA: LocationDef = { ...BASE, props: [...BASE.props, ...dress(BASE)] };
