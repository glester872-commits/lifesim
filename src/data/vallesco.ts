import type { BuildingDef, LocationDef, PointDef, PropKind, PropPlacement } from '../types/game.ts';
import { dress } from '../systems/Dressing.ts';

/**
 * Barrio Vallesco (dirección A, design/barrio/direccion-a.html): la Calle
 * Mayor peatonal y comercial al norte, la avenida con tráfico en medio y la
 * parte residencial al sur, con la plazuela del metro a diez pasos de casa.
 * Al este, la Calle del Olmo se estrecha y sigue como Calle del Carmen: un
 * carril bici entre dos aceras anchas de granito, con tiendas de ropa vintage,
 * de archivo y de segunda mano, un estudio de tatuaje, un café con terraza, una
 * tienda de discos y un taller de serigrafía. El Pasaje del Carmen la une con la
 * avenida; por el oeste se entra desde el Olmo, a diez pasos de tu portal.
 *
 * El suelo se pinta por rectángulos en orden (lo último manda). Los edificios
 * van aparte: tapan su huella, generan su puerta y son sólidos.
 */
const W = 110;
const H = 56;

/** [carácter, x, y, ancho, alto]. Leyenda en data/locations.ts. */
type Paint = readonly [string, number, number, number, number];

function paint(fill: string, rects: readonly Paint[]): string[] {
  const grid = Array.from({ length: H }, () => Array<string>(W).fill(fill));
  for (const [ch, x, y, w, h] of rects) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[yy][xx] = ch;
  }
  return grid.map((row) => row.join(''));
}

const GROUND = paint('g', [
  ['~', 30, 6, 21, 10], // Plaza de la Fuente
  ['a', 39, 10, 3, 2], // vaso de la fuente
  ['c', 0, 16, W, 3], // Calle Mayor, peatonal
  ['c', 22, 19, 3, 10], // Calle Tintoreros, tramo peatonal
  ['c', 50, 19, 1, 10], // Callejón del Banco
  ['.', 2, 27, 10, 2], // carga y descarga del súper
  ['~', 51, 27, 23, 2], // explanada de las oficinas
  [',', 0, 29, W, 2], // Avenida de Vallesco: acera norte
  ['b', 0, 31, W, 1], // carril bici hacia el oeste, junto al bordillo norte
  ['=', 0, 32, W, 1], // línea central: hacia el oeste arriba, hacia el este abajo
  ['.', 0, 33, W, 1],
  ['b', 0, 34, W, 1], // carril bici hacia el este, junto al bordillo sur
  ['z', 24, 31, 3, 4], // paso de cebra oeste
  ['z', 52, 31, 3, 4], // paso de cebra este
  [',', 0, 35, W, 2], // acera sur
  ['P', 25, 37, 12, 9], // Plazuela del Metro: adoquín de granito (Visual V2)
  ['T', 29, 42, 3, 1], // franja podotáctil delante de la escalera del metro (la boca principal ocupa hasta la fila 41)
  ['.', 22, 37, 3, 9], // Calle Tintoreros, tramo con coches
  [',', 22, 37, 1, 9], // su acera, junto a Olmo 3: por aquí se baja andando, no por la calzada
  ['c', 56, 37, 2, 9], // Pasaje del Reloj
  [',', 0, 46, W, 1], // Calle del Olmo
  ['.', 0, 47, W, 2],
  ['b', 0, 47, W, 1], // carril bici hacia el oeste: sigue por el Olmo y es todo el carril del Carmen
  ['z', 39, 47, 2, 2],
  [',', 0, 49, W, 1],
  ['c', 37, 52, 37, 1], // Parque del Olmo: paseo
  ['k', 60, 50, 8, 4], // pista
  ['~', 74, 27, 36, 2], // explanada de las oficinas, hasta el final de la avenida
  // Calle del Carmen: acera ancha de granito a cada lado y un solo carril, para bicis.
  ['c', 74, 37, 2, 9], // Pasaje del Carmen, de la avenida al Carmen
  ['P', 74, 44, 36, 3], // acera norte: escaparates, paso y bordillo
  ['z', 89, 47, 2, 1], // paso de peatones del Carmen
  ['P', 74, 48, 36, 3], // acera sur
  // Patio de atrás de Mayor 9 y Mayor 15: tierra pisada, y el callejón de servicio que baja a la Mayor.
  ['d', 68, 0, 18, 3],
  ['d', 74, 3, 12, 1],
  ['c', 74, 4, 2, 12],
  ['R', 0, 55, W, 1], // la vía: límite sur del barrio
]);

const b = (
  id: string,
  name: string,
  style: BuildingDef['style'],
  [tx, ty, w, h]: readonly [number, number, number, number],
  front: BuildingDef['front'],
  doorX?: number,
  extra: Partial<BuildingDef> = {},
): BuildingDef => ({ id, name, style, tx, ty, w, h, front, doorX, ...extra });

const into = (location: string): BuildingDef['enter'] => ({ location, spawn: 'entry' });

// Los ids home-door, cafe-door y metro-door se conservan: los interiores y la
// estación ya salen a esos spawns.
const BUILDINGS: readonly BuildingDef[] = [
  // Interiores
  b('home-door', 'Tu portal · Olmo 7', 'home', [37, 37, 9, 9], 's', 41, { floors: 2, enter: into('home'), point: 'HOME_ENTRANCE' }),
  b('metro-door', 'Metro · Vallesco', 'metro', [28, 38, 5, 4], 's', 30, { enter: { location: 'vallesco-station', spawn: 'entry' }, point: 'METRO_ENTRANCE' }),
  b('gym-door', 'Gimnasio Forja', 'gym', [33, 1, 15, 5], 's', 40, { floors: 2, enter: into('gym'), point: 'GYM_ENTRANCE' }),
  b('cafe-door', 'Cafetería Pausa', 'cafe', [52, 8, 10, 8], 's', 56, { floors: 2, enter: into('cafe'), point: 'CAFE_ENTRANCE' }),
  b('fashion-door', 'Hilo · moda', 'fashion', [2, 8, 10, 8], 's', 6, { floors: 2, enter: into('fashion'), point: 'CLOTHING_STORE_ENTRANCE' }),
  b('super-door', 'Súper Rosales', 'super', [2, 19, 10, 8], 'n', 6, { enter: into('supermarket'), point: 'SUPERMARKET_ENTRANCE' }),
  b('restaurant-door', 'Casa Tomás', 'restaurant', [25, 19, 9, 6], 'n', 29, { enter: into('restaurant'), point: 'RESTAURANT_ENTRANCE' }),
  b('office-door', 'Edificio Atalaya', 'office', [57, 19, 17, 8], 's', 65, { floors: 2, enter: into('office'), point: 'OFFICE_ENTRANCE' }),
  // Ambientales: puerta dibujada, sin afordancia. El punto de entrada queda para los NPC.
  b('hair', 'Barbería Nati', 'hair', [12, 10, 5, 6], 's', 14, { floors: 2, enter: into('barbershop'), point: 'HAIR_SALON_ENTRANCE' }),
  b('pharmacy', 'Farmacia', 'pharmacy', [17, 9, 5, 7], 's', 19, { floors: 2, enter: into('pharmacy'), point: 'PHARMACY_ENTRANCE' }),
  b('res-mayor-3', 'Mayor 3', 'res-brick', [22, 5, 7, 11], 's', 25, { floors: 3, point: 'RES_MAYOR_3_ENTRANCE', inspect: ['Portero automático. Nueve timbres, dos con el nombre tachado.'] }),
  b('bank', 'Banco', 'bank', [62, 9, 6, 7], 's', 64, { floors: 2, point: 'BANK_ENTRANCE', inspect: ['El cajero pide la tarjeta antes de decir buenos días.'] }),
  b('res-mayor-9', 'Mayor 9', 'res-stone', [68, 3, 6, 13], 's', 71, { floors: 3, point: 'RES_MAYOR_9_ENTRANCE', inspect: ['Un buzón rebosa de publicidad. Alguien no ha pasado por aquí en semanas.'] }),
  // El antiguo local en alquiler: ahora abre de noche (horario en data/places.ts).
  b('club-door', 'Sala Órbita', 'club', [12, 19, 5, 6], 'n', 14, { enter: into('club'), point: 'CLUB_ENTRANCE' }),
  b('fruit', 'Frutería', 'fruit', [17, 19, 5, 6], 'n', 19, { point: 'FRUIT_SHOP_ENTRANCE', inspect: ['Cajas de naranjas en la acera y una pizarra: «Hoy, nísperos».'] }),
  b('hardware', 'Ferretería', 'hardware', [25, 25, 9, 4], 's', 29, { point: 'HARDWARE_ENTRANCE', inspect: ['Ferretería. Tienen de todo, pero hay que saber pedirlo.'] }),
  b('study', 'Centro de estudios', 'study', [34, 19, 16, 9], 'n', 41, { point: 'STUDY_CENTER_ENTRANCE', inspect: ['Centro de estudios Vallesco. Un cartel anuncia cursos de tarde; la matrícula, en ventanilla.'] }),
  b('laundry', 'Lavandería', 'laundry', [51, 19, 6, 6], 'n', 53, { point: 'LAUNDRY_ENTRANCE', inspect: ['Tres lavadoras girando y nadie esperando.'] }),
  b('res-av-2', 'Avenida 2', 'res-plaster', [2, 37, 11, 9], 'n', 7, { point: 'RES_AVENIDA_2_ENTRANCE', inspect: ['Un portal que huele a lejía recién echada.'] }),
  b('res-olmo-3', 'Olmo 3', 'res-brick', [13, 37, 9, 9], 's', 17, { floors: 3, point: 'RES_OLMO_3_ENTRANCE', inspect: ['En el portal, un aviso: «Junta de vecinos el jueves. Tema: el ascensor».'] }),
  b('res-olmo-11', 'Olmo 11', 'res-stone', [46, 37, 10, 9], 's', 50, { floors: 2, point: 'RES_OLMO_11_ENTRANCE', inspect: ['Un triciclo aparcado bajo la escalera.'] }),
  b('res-av-20', 'Avenida 20', 'res-brick', [58, 37, 16, 9], 'n', 65, { point: 'RES_AVENIDA_20_ENTRANCE', inspect: ['El portero automático zumba, pero nadie contesta.'] }),
  b('civic', 'Junta municipal', 'civic', [2, 50, 14, 5], 'n', 9, { point: 'CIVIC_ENTRANCE', inspect: ['Junta Municipal de Vallesco. Empadronamientos, quejas y un tablón lleno de chinchetas.'] }),
  b('res-olmo-6', 'Olmo 6', 'res-plaster', [16, 50, 12, 5], 'n', 22, { point: 'RES_OLMO_6_ENTRANCE', inspect: ['Bicicletas encadenadas a la reja del portal.'] }),
  // Donde estuvo la obra: la vinoteca, en la calle tranquila junto al parque.
  b('wine-bar', 'La Cepa · vinoteca', 'wine', [28, 50, 8, 5], 'n', 32, { enter: into('wine-bar'), point: 'WINE_BAR_ENTRANCE' }),
  // Traseras: tejados que cierran el norte del barrio.
  b('backdrop-nw', 'Manzana norte', 'backdrop', [2, 1, 20, 7], undefined),
  b('backdrop-ne', 'Manzana noreste', 'backdrop', [49, 1, 18, 6], undefined),

  // Calle Mayor, tramo este: vecinos a los dos lados.
  b('res-mayor-15', 'Mayor 15', 'res-brick', [76, 4, 10, 12], 's', 80, { floors: 3, point: 'RES_MAYOR_15_ENTRANCE', inspect: ['Una bici colgada en el balcón del primero. Nadie sabe cómo la subieron.'] }),
  b('res-mayor-17', 'Mayor 17', 'res-plaster', [86, 6, 11, 10], 's', 91, { floors: 2, point: 'RES_MAYOR_17_ENTRANCE', inspect: ['«Se alquila habitación. Preguntar por Reme, segundo B».'] }),
  b('res-mayor-19', 'Mayor 19', 'res-stone', [97, 3, 13, 13], 's', 103, { floors: 3, point: 'RES_MAYOR_19_ENTRANCE', inspect: ['Un portal de piedra con el número en azulejo.'] }),
  b('backdrop-e', 'Manzana este', 'backdrop', [86, 1, 11, 5], undefined),
  b('res-mayor-20', 'Mayor 20', 'res-stone', [76, 19, 14, 8], 'n', 82, { point: 'RES_MAYOR_20_ENTRANCE', inspect: ['El ascensor lleva un cartel de «averiado» desde el verano.'] }),
  b('res-mayor-22', 'Mayor 22', 'res-brick', [90, 19, 20, 8], 'n', 99, { point: 'RES_MAYOR_22_ENTRANCE', inspect: ['Un patio de vecinos detrás de la reja, lleno de macetas.'] }),

  // Calle del Carmen, acera norte: planta baja con tienda y vivienda encima.
  b('carmen-tinta', 'Tinta Carmen · tatuajes', 'tattoo', [76, 37, 7, 7], 's', 79, { floors: 2, enter: into('tinta'), point: 'TINTA_ENTRANCE' }),
  b('carmen-retales', 'Retales · vintage', 'vintage', [83, 37, 8, 7], 's', 87, { floors: 2, enter: into('retales'), point: 'RETALES_ENTRANCE' }),
  b('carmen-molinillo', 'Café Molinillo', 'coffee', [91, 37, 6, 7], 's', 93, { floors: 2, enter: into('molinillo'), point: 'MOLINILLO_ENTRANCE' }),
  b('carmen-surco', 'Discos Surco', 'records', [97, 37, 6, 7], 's', 99, { floors: 2, point: 'RECORDS_ENTRANCE', inspect: ['Discos Surco. Cajas de vinilos a cinco euros en la puerta y un cartel: «Abrimos cuando llegamos».'] }),
  b('res-carmen-12', 'Carmen 12', 'res-plaster', [103, 37, 7, 7], 's', 106, { floors: 2, point: 'RES_CARMEN_12_ENTRANCE', inspect: ['El portero automático tiene más pegatinas que timbres.'] }),
  // Acera sur: locales de una planta, pegados a la vía.
  b('carmen-archivo', 'Archivo · streetwear', 'streetwear', [76, 51, 9, 4], 'n', 80, { enter: into('archivo'), point: 'ARCHIVO_ENTRANCE' }),
  b('carmen-vuelta', 'Segunda Vuelta', 'thrift', [86, 51, 9, 4], 'n', 90, { enter: into('vuelta'), point: 'VUELTA_ENTRANCE' }),
  b('carmen-print', 'Serigrafía Chapa', 'print', [96, 51, 6, 4], 'n', 98, { point: 'PRINT_SHOP_ENTRANCE', inspect: ['Serigrafía Chapa. Aquí se imprimen los carteles de la columna de enfrente. Y los de medio barrio.'] }),
  b('res-carmen-9', 'Carmen 9', 'res-brick', [103, 51, 7, 4], 'n', 106, { point: 'RES_CARMEN_9_ENTRANCE', inspect: ['Un felpudo que dice «Bienvenidos» en cuatro idiomas.'] }),
];

const at = (kind: PropKind, tx: number, ty: number): PropPlacement => ({ kind, tx, ty });
const row = (kind: PropKind, ty: number, xs: readonly number[]): PropPlacement[] => xs.map((tx) => at(kind, tx, ty));

const PROPS: readonly PropPlacement[] = [
  // Borde norte
  ...[[1, 0], [24, 0], [29, 2], [48, 2], [68, 0]].map(([x, y]) => at('tree', x, y)),

  // Plaza de la Fuente
  at('fountain', 39, 11),
  // Sin espejo: la esquina noreste es de jardineras y los bancos de ese lado van corridos.
  ...[[31, 7], [31, 13], [48, 13]].map(([x, y]) => at('tree', x, y)),
  at('planter', 48, 7), at('planter', 49, 7),
  // Los bancos miran a la fuente: los del norte, al sur; los del sur, al norte (con el respaldo hacia la calle).
  ...row('bench', 8, [35, 36, 43, 44]),
  ...row('bench-up', 13, [35, 36, 44, 45]),
  at('kiosk', 46, 11),
  at('lamp', 33, 10),
  at('lamp', 49, 10),

  // Calle Mayor: terrazas (la silla junto a la mesa, fuera de la acera), género en la puerta, farolas y papeleras
  at('parasol', 52, 16), at('cafe-table', 53, 16), at('chair-left', 54, 16),
  at('parasol', 59, 16), at('cafe-table', 60, 16), at('chair-left', 61, 16),
  at('cafe-table', 26, 18), at('chair-left', 27, 18), at('menu-board', 31, 18), at('cafe-table', 32, 18),
  ...row('produce', 18, [3, 4, 8, 18, 20]),
  ...row('lamp', 16, [11, 21, 47]),
  ...row('lamp', 18, [34, 67]),
  at('bin', 12, 18), at('bin', 48, 18), at('vending', 29, 16),

  // Trasera del súper y solar entre manzanas
  at('van', 3, 27),
  at('tree', 13, 26), at('tree', 20, 26), at('bench', 16, 27), at('bench', 17, 27),

  // Explanada de Atalaya
  ...row('bike', 27, [52, 53, 54]),
  at('planter', 59, 27), at('planter', 70, 27),

  // Avenida
  ...row('tree', 29, [2, 14, 20, 34, 46, 58, 70]),
  at('bus-stop', 38, 29),
  ...row('tree', 35, [4, 19, 48, 60, 72]),

  // Plazuela del Metro: escena de referencia de Visual V2 (design/ART_BIBLE.md). El rótulo METRO
  // va en la marquesina de la boca. Islas de árbol y banco a los lados, farolas en tres esquinas, tótem
  // y plano junto a la escalera; las líneas del grafo (plazuela-1 → -2 → boca → banco → Olmo) quedan libres.
  at('bed-tree', 25, 44), at('plane-tree', 36, 43),
  // Un parterre de flores en el flanco este de la boca (design/visual-reference), fuera de los caminos.
  at('flower-bed', 35, 40),
  at('plaza-bench', 25, 40), at('plaza-bench', 34, 43),
  at('street-lamp', 25, 38), at('street-lamp', 35, 38), at('street-lamp', 32, 45),
  // El plano del barrio ya va en el pórtico de la boca (world/UrbanArt: drawMetroHero); aquí, sólo el tótem.
  at('metro-totem', 34, 41),
  at('bike-rack', 27, 44), at('planter-box', 34, 45), at('bin', 36, 41),
  at('manhole', 33, 39), at('drain', 30, 45), at('leaves', 26, 45), at('leaves', 35, 44), at('leaves', 33, 44),

  // Calle del Olmo
  at('car', 8, 48), at('car-c', 60, 48),

  // Parque del Olmo
  ...[[38, 50], [42, 53], [47, 51], [56, 50], [70, 51], [73, 53], [52, 54]].map(([x, y]) => at('tree', x, y)),
  ...row('bench', 51, [44, 45, 52, 53]),
  at('hoop', 60, 51), at('hoop', 67, 51),
  at('lamp', 48, 53), at('lamp', 58, 53),

  // Huecos de hierba entre el barrio viejo y el tramo este.
  ...[[74, 22], [74, 25], [74, 52]].map(([x, y]) => at('tree', x, y)),

  // Patio de atrás de la Mayor: nadie pasa por aquí. Cajas como gradas, un contenedor, colillas y una lámpara de pinza.
  // Lo que se hace aquí de noche es data/streetEvents.ts; de día sólo quedan las huellas.
  at('container', 70, 1), at('crates', 72, 1), at('crates', 85, 2), at('work-light', 84, 1),
  at('debris', 73, 2), at('debris', 78, 0), at('debris', 82, 3), at('debris', 75, 8),

  // Calle del Carmen. Norte: escaparates y terraza en la fila 44, paso en la 45, bordillo en la 46.
  at('bench', 84, 44), at('bench', 104, 44),
  at('parasol', 94, 44), at('chair-right', 95, 44), at('cafe-table', 96, 44), at('chair-left', 97, 44),
  at('bike-rack', 77, 46), at('poster-column', 80, 46), at('street-lamp', 82, 46), at('plane-tree', 86, 46),
  at('bike', 92, 46), at('bike', 93, 46), at('street-lamp', 97, 46), at('plane-tree', 103, 46), at('street-lamp', 107, 46),
  // Sur: bordillo en la 48, paso en la 49, escaparates en la 50.
  at('bike', 78, 48), at('bike', 79, 48), at('street-lamp', 84, 48), at('plane-tree', 94, 48),
  at('street-lamp', 100, 48), at('bike-rack', 102, 48),
  at('poster-column', 95, 50),
  at('leaves', 87, 49), at('leaves', 104, 45),
];

const p = (tx: number, ty: number, kind: PointDef['kind'], facing?: PointDef['facing']): PointDef => ({ tx, ty, kind, facing });

// Puntos con nombre del barrio. Las entradas de los edificios las genera
// LocationSystem desde BUILDINGS (HOME_ENTRANCE, CAFE_ENTRANCE, ...).
const POINTS: Readonly<Record<string, PointDef>> = {
  // Bordes: el resto de la ciudad. Por aquí entrarán y se irán los NPC que no viven aquí.
  EDGE_MAYOR_W: p(0, 17, 'edge'), EDGE_MAYOR_E: p(W - 1, 17, 'edge'),
  EDGE_AVENIDA_NW: p(0, 30, 'edge'), EDGE_AVENIDA_NE: p(W - 1, 30, 'edge'),
  EDGE_AVENIDA_SW: p(0, 36, 'edge'), EDGE_AVENIDA_SE: p(W - 1, 36, 'edge'),
  // El Olmo acaba en el Carmen: sus bordes este son los del Carmen.
  EDGE_OLMO_W: p(0, 46, 'edge'), EDGE_OLMO_E: p(W - 1, 45, 'edge'),
  EDGE_OLMO_SW: p(0, 49, 'edge'), EDGE_OLMO_SE: p(W - 1, 49, 'edge'),

  // Calle del Carmen: escaparates, gente esperando en la puerta, bancos y la terraza del Molinillo.
  TINTA_WINDOW: p(77, 44, 'interact', 'up'), RETALES_WINDOW: p(89, 44, 'interact', 'up'), RECORDS_WINDOW: p(101, 44, 'interact', 'up'),
  ARCHIVO_WINDOW: p(83, 50, 'interact', 'down'), VUELTA_WINDOW: p(93, 50, 'interact', 'down'),
  CARMEN_WAIT_01: p(81, 44, 'wait', 'down'), CARMEN_WAIT_02: p(86, 44, 'wait', 'down'), CARMEN_WAIT_03: p(78, 50, 'wait', 'up'), CARMEN_WAIT_04: p(82, 50, 'wait', 'up'),
  CARMEN_BENCH_01: p(84, 44, 'seat', 'down'), CARMEN_BENCH_02: p(104, 44, 'seat', 'down'),
  CARMEN_TALK_01: p(99, 49, 'meet', 'left'), CARMEN_TALK_02: p(100, 49, 'meet', 'right'),
  MOLINILLO_TERRACE_01: p(95, 44, 'seat', 'right'), MOLINILLO_TERRACE_02: p(97, 44, 'seat', 'left'),
  MOLINILLO_TERRACE_WAITER: p(92, 44, 'work', 'down'),

  // Sitios para estar
  PLAZA_FOUNTAIN: p(40, 13, 'meet'),
  // Cada banco de dos tiles, dos plazas (data/seating.ts): se sube desde el tile de delante (plaza-bN).
  PLAZA_BENCH_01: p(35, 8, 'seat', 'down'), PLAZA_BENCH_05: p(36, 8, 'seat', 'down'),
  PLAZA_BENCH_02: p(44, 8, 'seat', 'down'), PLAZA_BENCH_06: p(43, 8, 'seat', 'down'),
  PLAZA_BENCH_03: p(35, 13, 'seat', 'up'), PLAZA_BENCH_07: p(36, 13, 'seat', 'up'),
  PLAZA_BENCH_04: p(44, 13, 'seat', 'up'), PLAZA_BENCH_08: p(45, 13, 'seat', 'up'),
  NEWS_KIOSK: p(46, 12, 'interact', 'up'),
  CAFE_TERRACE_01: p(54, 16, 'seat', 'left'), CAFE_TERRACE_02: p(61, 16, 'seat', 'left'),
  // La mesa de fuera de Casa Tomás, junto a la pizarra del menú.
  RESTAURANT_TERRACE_01: p(27, 18, 'seat', 'left'),
  // Donde espera el camarero de cada terraza: al lado de la puerta, no en ella.
  CAFE_TERRACE_WAITER: p(57, 16, 'work', 'down'), RESTAURANT_TERRACE_WAITER: p(28, 18, 'work', 'left'),
  BUS_STOP: p(39, 30, 'wait', 'up'),
  METRO_PLAZUELA_BENCH: p(33, 42, 'wait', 'down'),
  // Los dos bancos corridos de la plazuela, dos plazas cada uno.
  PLAZUELA_BENCH_01: p(25, 40, 'seat', 'down'), PLAZUELA_BENCH_02: p(26, 40, 'seat', 'down'),
  PLAZUELA_BENCH_03: p(34, 43, 'seat', 'down'), PLAZUELA_BENCH_04: p(35, 43, 'seat', 'down'),
  PARK_BENCH_01: p(44, 51, 'seat', 'down'), PARK_BENCH_02: p(52, 51, 'seat', 'down'),
  PARK_COURT: p(63, 52, 'meet'),
  // La otra plaza de cada banco, dos corros junto a las farolas y alguien esperando bajo el árbol de la entrada.
  PARK_BENCH_03: p(45, 51, 'seat', 'down'), PARK_BENCH_04: p(53, 51, 'seat', 'down'),
  PARK_TALK_01: p(49, 53, 'meet', 'right'), PARK_TALK_02: p(57, 53, 'meet', 'left'),
  PARK_WAIT_01: p(38, 51, 'wait', 'down'),
  // Escaparates de la Calle Mayor: quien pasea se para a mirar (norte, mirando arriba; sur, abajo).
  FASHION_WINDOW_01: p(3, 16, 'interact', 'up'), FASHION_WINDOW_02: p(9, 16, 'interact', 'up'),
  HAIR_WINDOW: p(13, 16, 'interact', 'up'), PHARMACY_WINDOW: p(20, 16, 'interact', 'up'),
  BANK_WINDOW: p(66, 16, 'interact', 'up'), SUPER_WINDOW: p(5, 18, 'interact', 'down'),
  FRUIT_WINDOW: p(21, 18, 'interact', 'down'), LAUNDRY_WINDOW: p(55, 18, 'interact', 'down'),
  // Delante del metro: quien ha quedado con alguien que llega en el próximo tren.
  METRO_MEET_01: p(27, 42, 'wait', 'right'), METRO_MEET_02: p(33, 41, 'wait', 'left'),
  // Puerta de la Sala Órbita: cola junto a la fachada y corrillo al otro lado de la calle.
  CLUB_QUEUE_01: p(15, 18, 'wait', 'left'), CLUB_QUEUE_02: p(16, 18, 'wait', 'left'), CLUB_QUEUE_03: p(17, 18, 'wait', 'left'),
  CLUB_SMOKE_01: p(15, 16, 'meet', 'down'), CLUB_SMOKE_02: p(18, 16, 'meet', 'down'),

  // Nodos de paso del grafo
  'mayor-06': p(6, 17, 'path'), 'mayor-14': p(14, 17, 'path'), 'mayor-19': p(19, 17, 'path'),
  'mayor-23': p(23, 17, 'path'), 'mayor-25': p(25, 17, 'path'), 'mayor-29': p(29, 17, 'path'),
  'mayor-40': p(40, 17, 'path'), 'mayor-50': p(50, 17, 'path'), 'mayor-53': p(53, 17, 'path'),
  'mayor-56': p(56, 17, 'path'), 'mayor-64': p(64, 17, 'path'), 'mayor-71': p(71, 17, 'path'),
  'plaza-s': p(40, 15, 'path'), 'plaza-w': p(34, 10, 'path'), 'plaza-e': p(46, 10, 'path'),
  'plaza-nw': p(34, 7, 'path'), 'plaza-ne': p(46, 7, 'path'), 'plaza-sw': p(31, 15, 'path'),
  'tintoreros-n': p(23, 24, 'path'), callejon: p(50, 24, 'path'),
  'av-23': p(23, 30, 'path'), 'av-25': p(25, 30, 'path'), 'av-29': p(29, 30, 'path'),
  'av-50': p(50, 30, 'path'), 'av-53': p(53, 30, 'path'), 'av-65': p(65, 30, 'path'),
  'avs-23': p(23, 36, 'path'), 'avs-25': p(25, 36, 'path'), 'avs-30': p(30, 36, 'path'),
  'avs-53': p(53, 36, 'path'), 'avs-56': p(56, 36, 'path'),
  'tintoreros-s': p(22, 41, 'path'), 'tintoreros-sn': p(22, 36, 'path'), 'tintoreros-ss': p(22, 46, 'path'), 'plazuela-1': p(26, 37, 'path'), 'plazuela-2': p(28, 42, 'path'),
  // Bordeando el pórtico de la boca principal por su lado oeste.
  'plazuela-3': p(27, 41, 'path'),
  'plazuela-4': p(33, 37, 'path'), pasaje: p(56, 41, 'path'),
  'olmo-23': p(23, 46, 'path'), 'olmo-30': p(30, 46, 'path'), 'olmo-40': p(40, 46, 'path'), 'olmo-56': p(56, 46, 'path'),
  'olmo-s40': p(40, 49, 'path'), 'olmo-s70': p(70, 49, 'path'),
  'park-w': p(40, 52, 'path'), 'park-e': p(72, 52, 'path'),
  // Delante de cada banco: desde aquí se sube a sus plazas; el paseo pasa por aquí, no por encima del banco.
  'plaza-b1': p(35, 9, 'path'), 'plaza-b2': p(44, 9, 'path'), 'plaza-b3': p(35, 12, 'path'), 'plaza-b4': p(44, 12, 'path'),
  'park-b1': p(44, 52, 'path'), 'park-b2': p(52, 52, 'path'), 'carmen-b1': p(84, 45, 'path'), 'carmen-b2': p(104, 45, 'path'),
  'plazuela-a': p(25, 41, 'path'), 'plazuela-b': p(35, 42, 'path'), 'mayor-54': p(54, 17, 'path'), 'mayor-61': p(61, 17, 'path'),
  // Tramo este: Mayor, avenida sur, Pasaje del Carmen y las dos aceras del Carmen.
  'mayor-80': p(80, 17, 'path'), 'mayor-91': p(91, 17, 'path'), 'mayor-103': p(103, 17, 'path'),
  'avs-75': p(75, 36, 'path'), 'olmo-74': p(74, 46, 'path'),
  'carmen-75': p(75, 45, 'path'), 'carmen-79': p(79, 45, 'path'), 'carmen-87': p(87, 45, 'path'), 'carmen-89': p(89, 45, 'path'),
  'carmen-93': p(93, 45, 'path'), 'carmen-96': p(96, 45, 'path'), 'carmen-99': p(99, 45, 'path'), 'carmen-106': p(106, 45, 'path'),
  'carmen-s80': p(80, 49, 'path'), 'carmen-s89': p(89, 49, 'path'), 'carmen-s90': p(90, 49, 'path'), 'carmen-s98': p(98, 49, 'path'), 'carmen-s106': p(106, 49, 'path'),
};

type Link = readonly [string, string];
const chain = (...ids: string[]): Link[] => ids.slice(1).map((id, i) => [ids[i], id] as const);

const LINKS: readonly Link[] = [
  // Calle Mayor, de oeste a este, y cada puerta a su nodo
  ...chain('EDGE_MAYOR_W', 'mayor-06', 'mayor-14', 'mayor-19', 'mayor-23', 'mayor-25', 'mayor-29', 'mayor-40',
    'mayor-50', 'mayor-53', 'mayor-54', 'mayor-56', 'mayor-61', 'mayor-64', 'mayor-71', 'mayor-80', 'mayor-91', 'mayor-103', 'EDGE_MAYOR_E'),
  ['RES_MAYOR_15_ENTRANCE', 'mayor-80'], ['RES_MAYOR_20_ENTRANCE', 'mayor-80'], ['RES_MAYOR_17_ENTRANCE', 'mayor-91'],
  ['RES_MAYOR_19_ENTRANCE', 'mayor-103'], ['RES_MAYOR_22_ENTRANCE', 'mayor-103'],
  ['CLOTHING_STORE_ENTRANCE', 'mayor-06'], ['SUPERMARKET_ENTRANCE', 'mayor-06'],
  ['HAIR_SALON_ENTRANCE', 'mayor-14'], ['CLUB_ENTRANCE', 'mayor-14'],
  ['WINE_BAR_ENTRANCE', 'olmo-s40'],
  ...chain('mayor-14', 'CLUB_QUEUE_01', 'CLUB_QUEUE_02', 'CLUB_QUEUE_03'),
  ['CLUB_SMOKE_01', 'mayor-14'], ['CLUB_SMOKE_02', 'mayor-19'],
  ['PHARMACY_ENTRANCE', 'mayor-19'], ['FRUIT_SHOP_ENTRANCE', 'mayor-19'],
  ['RES_MAYOR_3_ENTRANCE', 'mayor-25'], ['RESTAURANT_ENTRANCE', 'mayor-29'], ['RESTAURANT_TERRACE_01', 'mayor-29'],
  ['STUDY_CENTER_ENTRANCE', 'mayor-40'], ['LAUNDRY_ENTRANCE', 'mayor-53'],
  ['CAFE_ENTRANCE', 'mayor-56'], ['BANK_ENTRANCE', 'mayor-64'], ['RES_MAYOR_9_ENTRANCE', 'mayor-71'],

  // Plaza y gimnasio, detrás de ella
  ...chain('mayor-40', 'plaza-s', 'PLAZA_FOUNTAIN'),
  ['PLAZA_FOUNTAIN', 'plaza-w'], ['PLAZA_FOUNTAIN', 'plaza-e'], ...chain('mayor-29', 'plaza-sw', 'plaza-w'),
  ...chain('plaza-w', 'plaza-nw', 'GYM_ENTRANCE', 'plaza-ne', 'plaza-e'),
  ['plaza-b1', 'plaza-w'], ['plaza-b3', 'plaza-w'], ['plaza-b2', 'plaza-e'], ['plaza-b4', 'PLAZA_FOUNTAIN'],
  ['PLAZA_BENCH_01', 'plaza-b1'], ['PLAZA_BENCH_05', 'plaza-b1'], ['PLAZA_BENCH_02', 'plaza-b2'], ['PLAZA_BENCH_06', 'plaza-b2'],
  ['PLAZA_BENCH_03', 'plaza-b3'], ['PLAZA_BENCH_07', 'plaza-b3'], ['PLAZA_BENCH_04', 'plaza-b4'], ['PLAZA_BENCH_08', 'plaza-b4'],
  ['NEWS_KIOSK', 'PLAZA_FOUNTAIN'],

  // De la Mayor a la avenida
  ...chain('mayor-23', 'tintoreros-n', 'av-23'),
  ...chain('mayor-50', 'callejon', 'av-50'),

  // Avenida: acera norte, dos pasos de cebra, acera sur
  ...chain('EDGE_AVENIDA_NW', 'av-23', 'av-25', 'av-29', 'BUS_STOP', 'av-50', 'av-53', 'av-65', 'EDGE_AVENIDA_NE'),
  ['HARDWARE_ENTRANCE', 'av-29'], ['OFFICE_ENTRANCE', 'av-65'],
  ['av-25', 'avs-25'], ['av-53', 'avs-53'],
  ...chain('EDGE_AVENIDA_SW', 'RES_AVENIDA_2_ENTRANCE', 'avs-23', 'avs-25', 'avs-30', 'avs-53', 'avs-56',
    'RES_AVENIDA_20_ENTRANCE', 'avs-75', 'EDGE_AVENIDA_SE'),

  // Del sur de la avenida a la Calle del Olmo: Tintoreros, la plazuela y el pasaje
  ...chain('avs-23', 'tintoreros-sn', 'tintoreros-s', 'tintoreros-ss', 'olmo-23'),
  ...chain('avs-30', 'plazuela-1', 'plazuela-3', 'plazuela-2', 'METRO_ENTRANCE', 'METRO_PLAZUELA_BENCH'),
  ...chain('avs-30', 'plazuela-4', 'METRO_PLAZUELA_BENCH', 'olmo-30'),
  ['plazuela-2', 'olmo-30'],
  ...chain('avs-56', 'pasaje', 'olmo-56'),

  // Calle del Olmo y el parque
  ...chain('EDGE_OLMO_W', 'RES_OLMO_3_ENTRANCE', 'olmo-23', 'olmo-30', 'olmo-40', 'HOME_ENTRANCE',
    'RES_OLMO_11_ENTRANCE', 'olmo-56', 'olmo-74', 'carmen-75'),
  ['olmo-40', 'olmo-s40'],
  ...chain('EDGE_OLMO_SW', 'CIVIC_ENTRANCE', 'RES_OLMO_6_ENTRANCE', 'olmo-s40'),
  ...chain('olmo-s40', 'park-w', 'park-b1', 'park-b2', 'PARK_COURT', 'park-e', 'olmo-s70', 'carmen-s80'),

  // Calle del Carmen: el pasaje baja de la avenida; cada acera de oeste a este y el paso de peatones en medio.
  ['avs-75', 'carmen-75'],
  ...chain('carmen-75', 'carmen-79', 'carmen-87', 'carmen-89', 'carmen-93', 'carmen-96', 'carmen-99', 'carmen-106', 'EDGE_OLMO_E'),
  ...chain('carmen-s80', 'carmen-s89', 'carmen-s90', 'carmen-s98', 'carmen-s106', 'EDGE_OLMO_SE'),
  ['carmen-89', 'carmen-s89'],
  ['TINTA_ENTRANCE', 'carmen-79'], ['RETALES_ENTRANCE', 'carmen-87'], ['MOLINILLO_ENTRANCE', 'carmen-93'],
  ['RECORDS_ENTRANCE', 'carmen-99'], ['RES_CARMEN_12_ENTRANCE', 'carmen-106'],
  ['ARCHIVO_ENTRANCE', 'carmen-s80'], ['VUELTA_ENTRANCE', 'carmen-s90'], ['PRINT_SHOP_ENTRANCE', 'carmen-s98'], ['RES_CARMEN_9_ENTRANCE', 'carmen-s106'],
  ['TINTA_WINDOW', 'carmen-75'], ['RETALES_WINDOW', 'carmen-89'], ['RECORDS_WINDOW', 'carmen-99'],
  ['ARCHIVO_WINDOW', 'carmen-s80'], ['VUELTA_WINDOW', 'carmen-s90'],
  ['CARMEN_WAIT_01', 'carmen-79'], ['CARMEN_WAIT_02', 'carmen-87'], ['CARMEN_WAIT_03', 'carmen-s80'], ['CARMEN_WAIT_04', 'carmen-s80'],
  ['carmen-b1', 'carmen-87'], ['carmen-b2', 'carmen-106'], ['CARMEN_BENCH_01', 'carmen-b1'], ['CARMEN_BENCH_02', 'carmen-b2'],
  ['CARMEN_TALK_01', 'carmen-s98'], ['CARMEN_TALK_02', 'carmen-s98'],
  ['MOLINILLO_TERRACE_01', 'carmen-96'], ['MOLINILLO_TERRACE_02', 'carmen-96'], ['MOLINILLO_TERRACE_WAITER', 'carmen-93'],
  ['PARK_BENCH_01', 'park-b1'], ['PARK_BENCH_03', 'park-b1'], ['PARK_BENCH_02', 'park-b2'], ['PARK_BENCH_04', 'park-b2'],
  ['CAFE_TERRACE_01', 'mayor-54'], ['CAFE_TERRACE_02', 'mayor-61'],
  ['plazuela-a', 'plazuela-3'], ['PLAZUELA_BENCH_01', 'plazuela-a'], ['PLAZUELA_BENCH_02', 'plazuela-a'], ['PLAZUELA_BENCH_03', 'METRO_PLAZUELA_BENCH'],
  ['plazuela-b', 'METRO_PLAZUELA_BENCH'], ['PLAZUELA_BENCH_04', 'plazuela-b'],
  ['PARK_TALK_01', 'park-b2'], ['PARK_TALK_02', 'park-b2'], ['PARK_WAIT_01', 'park-w'],
  ['FASHION_WINDOW_01', 'mayor-06'], ['FASHION_WINDOW_02', 'mayor-06'], ['SUPER_WINDOW', 'mayor-06'],
  ['HAIR_WINDOW', 'mayor-14'], ['PHARMACY_WINDOW', 'mayor-19'], ['FRUIT_WINDOW', 'mayor-23'],
  ['LAUNDRY_WINDOW', 'mayor-56'], ['BANK_WINDOW', 'mayor-64'],
  ['METRO_MEET_01', 'plazuela-2'], ['METRO_MEET_02', 'METRO_PLAZUELA_BENCH'],
];

const BASE: LocationDef = {
  id: 'district',
  name: 'Barrio Vallesco',
  kind: 'exterior',
  ground: GROUND,
  buildings: BUILDINGS,
  props: PROPS,
  portals: [],
  npcs: [
    { id: 'vera', tx: 37, ty: 9, facing: 'left' },
  ],
  spawns: {
    start: { tx: 41, ty: 46, facing: 'down' },
  },
  points: POINTS,
  links: LINKS,
  // Identidad visual por zona (data/districts.ts, design/DISTRICTS.md): vecinos por defecto; la última zona manda.
  district: 'residential',
  zones: [
    { profile: 'commercial', tx: 0, ty: 0, w: 74, h: 37 }, // Calle Mayor oeste, plaza, Tintoreros y la avenida
    { profile: 'commercial', tx: 74, ty: 27, w: 36, h: 10 }, // la avenida hasta el final (el tramo este de la Mayor es de vecinos)
    { profile: 'transit', tx: 23, ty: 37, w: 14, h: 9 }, // Plazuela del Metro
    { profile: 'park', tx: 36, ty: 49, w: 38, h: 6 }, // Parque del Olmo
    { profile: 'vintage', tx: 74, ty: 37, w: 36, h: 18 }, // Calle del Carmen y su pasaje
    { profile: 'nightlife', tx: 10, ty: 16, w: 12, h: 10 }, // la puerta de la Sala Órbita, con su cola
    { profile: 'nightlife', tx: 27, ty: 49, w: 9, h: 6 }, // La Cepa, junto al parque
  ],
  // Carriles de circulación en medio; en los bordes (31 y 34), un carril bici por sentido.
  // De madrugada, uno por carril (taxis y el camión de la basura); en hora punta, tres.
  // La avenida tiene parada: pasa algo más de autobús que en otra avenida.
  // Bicis: dos por carril en hora punta, alguna suelta de madrugada; los repartidores, a la hora de comer y de cenar.
  traffic: {
    lanes: [{ row: 32, dir: -1 }, { row: 33, dir: 1 }],
    road: 'avenue',
    mix: { bus: 1.4 },
    perLane: 3,
    hourly: [[0, 1, 2], [1, 6.5, 1], [6.5, 7.5, 2], [7.5, 21, 3], [21, 24, 2]],
    bikes: {
      lanes: [{ row: 31, dir: -1 }, { row: 34, dir: 1 }, { row: 47, dir: -1 }],
      road: 'avenue',
      perLane: 2,
      hourly: [[0, 6.5, 1], [6.5, 22, 2], [22, 24, 1]],
      // Con chaparrón casi nadie saca la bici.
      rainShy: 0.75,
    },
  },
  // Los dos pasos de cebra de la avenida, con semáforo; el segundo, desfasado: no cambian a la vez.
  signals: [
    { id: 'avenida-oeste', tx: 24, ty: 31, w: 3, h: 4 },
    { id: 'avenida-este', tx: 52, ty: 31, w: 3, h: 4, offset: 9_000 },
  ],
  // Cosas que se miran: responden con una línea, no abren nada.
  inspects: [
    { tx: 40, ty: 11, name: 'Fuente', lines: ['El agua sale fría hasta en agosto. Alguien ha dejado una moneda en el fondo.'] },
    { tx: 46, ty: 11, name: 'Quiosco', lines: ['Periódicos de hoy, revistas de hace un mes y cromos que ya nadie colecciona.'] },
    { tx: 39, ty: 29, name: 'Marquesina', lines: ['Línea 27, hacia el centro. La pantalla dice «8 min» desde hace un buen rato.'] },
    { tx: 31, ty: 18, name: 'Pizarra', lines: ['Menú del día: lentejas, merluza o pollo, postre y pan. Once euros.'] },
    { tx: 80, ty: 46, name: 'Columna de carteles', lines: ['Conciertos en la Órbita, un mercadillo de discos el domingo y clases de serigrafía. Todo impreso enfrente.'] },
    { tx: 95, ty: 50, name: 'Columna de carteles', lines: ['Encima de un cartel de hace un año, uno de la semana pasada. Encima, pegatinas.'] },
    { tx: 96, ty: 44, name: 'Terraza del Molinillo', lines: ['Dos mesas y una sombrilla. Se sirve fuera cuando el café está abierto.'] },
    { tx: 72, ty: 2, name: 'Cajas de fruta', lines: ['Cajas apiladas como gradas alrededor de un trozo de tierra pisada en redondo. Colillas, vasos de plástico. Aquí se junta gente, y no de día.'] },
    { tx: 83, ty: 2, name: 'Lámpara de pinza', lines: ['Una lámpara de obra enganchada a las cajas. El cable sube por la pared hasta una ventana del primero.'] },
  ],
  // Nombres para el mapa (tecla M): calles y zonas, sobre el suelo que ya las dibuja.
  areas: [
    { name: 'Calle Mayor', tx: 62, ty: 17 },
    { name: 'Plaza de la Fuente', tx: 40, ty: 7 },
    { name: 'Avenida de Vallesco', tx: 12, ty: 32 },
    { name: 'Calle Tintoreros', tx: 23, ty: 22 },
    { name: 'Plazuela del Metro', tx: 30, ty: 44 },
    { name: 'Calle del Olmo', tx: 12, ty: 47 },
    { name: 'Parque del Olmo', tx: 48, ty: 53 },
    { name: 'Calle del Carmen', tx: 99, ty: 47 },
  ],
  // Donde se compra: la máquina de la Calle Mayor.
  terminals: [{ tx: 29, ty: 16, name: 'Máquina expendedora', catalog: 'vending' }],
};

// El micromobiliario (contenedores, coches aparcados, bolardos, buzón...) sale de reglas de contexto: systems/Dressing.ts.
export const VALLESCO: LocationDef = { ...BASE, props: [...BASE.props, ...dress(BASE)] };
