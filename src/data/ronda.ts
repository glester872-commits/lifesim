import type { LocationDef } from '../types/game.ts';
import type { PopulationProfile } from './population.ts';
import { at, many, p } from './interiors.ts';
import { shopRoom } from './cuatroRiosVenues.ts';

/**
 * ALPHA-08 · la ampliación sur de Vallesco (data/vallesco.ts, Ronda de la Vía) por dentro: el parque de bomberos y las
 * dos viviendas nuevas (data/housing.ts). Todo con los cimientos de siempre: el parque es la planta de la tienda pequeña
 * (shopRoom, como la comisaría) con la autobomba en la cochera; los pisos repiten lo que ya sabe hacer el estudio
 * (cocinar, ducharse, dormir, la tele, el armario, el catálogo del hogar) con sus puntos y su prefijo.
 */

const STREET = 'district';

// ------------------------------------------------------------ parque de bomberos

/**
 * Parque de Bomberos de Vallesco: a la izquierda la cochera con la autobomba y las taquillas de los equipos, a la derecha
 * el mostrador de guardia (sin caja: aquí no se cobra). Quien está de guardia enseña la cochera y explica prevención
 * (data/services.ts 'fire-desk'); no hay salidas ni emergencias simuladas. Se sale por donde se entra, a la Ronda.
 */
const BOMBEROS_ROOM = shopRoom({
  id: 'bomberos', name: 'Parque de Bomberos de Vallesco', building: 'ronda-bomberos', street: STREET, pre: 'BOMBEROS', ambient: '#f4ece4',
  props: [
    at('fire-engine', 1, 4), ...many('wardrobe', [[6, 3], [7, 3]]), at('wall-shelf', 2, 1), at('info-board', 10, 1), at('clock', 12, 1),
    at('plant', 12, 4), ...many('chair-right', [[8, 7], [8, 8]]), ...many('tube-light', [[3, 6], [10, 4]]),
  ],
  browse: [[3, 6, 'up'], [6, 4, 'up'], [10, 2, 'up']],
  inspects: [
    { tx: 2, ty: 5, name: 'Autobomba', lines: ['Roja, lavada y con el depósito lleno. Las botas esperan dentro de los pantalones, al lado de la puerta del conductor: un minuto para vestirse.'] },
    { tx: 10, ty: 2, name: 'Tablón del parque', lines: ['Parque de Bomberos de Vallesco · guardia de 24 horas.', '«Emergencias: 112.» «Visitas a la cochera, de 10 a 20, preguntando a la guardia.»'] },
  ],
});
const BOMBEROS: LocationDef = {
  ...BOMBEROS_ROOM,
  props: (BOMBEROS_ROOM.props ?? []).filter((prop) => prop.kind !== 'register'),
  portals: [{ id: 'exit', tx: 7, ty: 9, label: 'Salir a la Ronda', to: { location: STREET, spawn: 'ronda-bomberos' } }],
  points: { ...BOMBEROS_ROOM.points, BOMBEROS_GARAGE: p(5, 5, 'work', 'left') },
};

// ------------------------------------------------------------ Piso · Ronda 8

/**
 * Piso · Ronda 8 (data/housing.ts `ronda8`): el más grande y el más lejos de la Mayor, al otro lado de la vía.
 *
 *   baño (1–4 × 2–4)   dormitorio (6–12 × 2–5)   despacho (14–16 × 2–4)   salón, cocina y comedor (1–16 × 6–9)
 *
 * Ranuras de mejoras (data/housing.ts SLOTS.ronda8): la pared del dormitorio, la esquina del salón y el despacho.
 */
const RONDA_8: LocationDef = {
  id: 'ronda-8',
  name: 'Piso · Ronda 8',
  kind: 'interior',
  home: 'ronda8',
  ground: [
    'WWWWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWWWW',
    'WttttWfffffffWfffW',
    'WttttWfffffffWfffW',
    'WttttWffrrrrfWfffW',
    'WWtWWWffrrrrfWWfWW',
    'WffffffffffffffffW',
    'WffffffffffffffffW',
    'WffrrrrffffffffffW',
    'WffrrrrffffffffffW',
    'WWWWWWWWWWWDWWWWWW',
    'WWWWWWWWWWWWWWWWWW',
  ],
  props: [
    // Baño.
    at('mirror', 1, 1), at('sink', 1, 2), at('toilet', 4, 2), at('shower', 1, 4),
    // Dormitorio: armario, espejo, ventana y cama.
    at('wardrobe', 7, 3), at('mirror', 9, 1), at('window', 11, 1), at('bed', 12, 3),
    // Despacho: la mesa con el ordenador del catálogo del hogar y su ventana.
    at('desk', 15, 2), at('chair-up', 15, 3), at('window', 14, 1),
    // Cocina contra el tabique del baño; salón con el sofá frente a la tele y el comedor al fondo.
    at('fridge', 1, 6), at('sink', 3, 6), at('stove', 4, 6),
    at('sofa', 7, 7), at('table', 8, 8), at('tv', 8, 9),
    at('dining-table', 13, 7), at('plant', 16, 6),
    ...many('pendant', [[4, 8], [9, 4], [2, 3], [15, 3], [13, 6]]),
  ],
  ambient: '#ffe6c8',
  spots: [
    { tx: 4, ty: 6, name: 'Cocina', activities: ['cook'] },
    { tx: 1, ty: 4, name: 'Ducha', activities: ['shower', 'shower-gel'] },
    { tx: 12, ty: 3, name: 'Cama', activities: ['nap', 'sleep'] },
    { tx: 7, ty: 3, name: 'Armario', activities: [], wardrobe: true },
    { tx: 9, ty: 1, name: 'Espejo', activities: [], wardrobe: true },
    { tx: 8, ty: 9, name: 'Tele', activities: ['watch-tv'] },
    { tx: 15, ty: 4, name: 'Ordenador · catálogo del hogar', activities: [], housing: true },
  ],
  inspects: [
    { tx: 14, ty: 2, name: 'Ventana del despacho', lines: ['Da a la vía y, detrás, a los árboles del Parque del Olmo. De noche se ven las farolas del paso a nivel.'] },
    { tx: 13, ty: 8, name: 'Mesa del comedor', lines: ['Una mesa para cuatro en un piso para uno. Por fin sitio para invitar a alguien a cenar.'] },
  ],
  portals: [{ id: 'exit', tx: 11, ty: 10, label: 'Salir a la Ronda', to: { location: STREET, spawn: 'ronda-8' } }],
  npcs: [],
  spawns: { entry: { tx: 11, ty: 9, facing: 'up' } },
  points: {
    R8_EXIT: p(11, 9, 'exit', 'up'),
    R8_BED: p(11, 3, 'interact', 'right'),
    R8_WARDROBE: p(7, 4, 'interact', 'up'),
    R8_MIRROR: p(9, 2, 'interact', 'up'),
    R8_KITCHEN: p(4, 7, 'interact', 'up'),
    R8_FRIDGE: p(1, 7, 'interact', 'up'),
    R8_SINK: p(1, 3, 'interact', 'up'),
    R8_TOILET: p(4, 3, 'interact', 'up'),
    R8_SHOWER: p(2, 4, 'interact', 'left'),
    R8_SOFA: p(7, 7, 'seat', 'down'),
    R8_SOFA_02: p(8, 7, 'seat', 'down'),
    R8_TV: p(10, 9, 'interact', 'left'),
    R8_GUEST: p(10, 8, 'meet'),
  },
};

// ------------------------------------------------------------ Habitación · Mayor 17

/**
 * Habitación · Mayor 17 (data/housing.ts `mayor17`): la habitación que anunciaba el portal («Se alquila habitación.
 * Preguntar por Reme, segundo B»). La más barata y la más pequeña, encima de la Calle Mayor: el dormitorio arriba y,
 * abajo, un pasillo con cocina y un sofá de dos plazas frente a la tele.
 *
 *   baño (1–4 × 2–4)   dormitorio (6–12 × 2–4)   cocina y salita (1–12 × 6–8)
 */
const MAYOR_17: LocationDef = {
  id: 'mayor-17',
  name: 'Habitación · Mayor 17',
  kind: 'interior',
  home: 'mayor17',
  ground: [
    'WWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWW',
    'WttttWfffffffW',
    'WttttWfffffffW',
    'WttttWffrrrffW',
    'WWtWWWWfWWWWWW',
    'WttttttttttttW',
    'WttttttttttttW',
    'WttttttttttttW',
    'WWWWWWDWWWWWWW',
    'WWWWWWWWWWWWWW',
  ],
  props: [
    at('mirror', 1, 1), at('sink', 1, 2), at('toilet', 4, 2), at('shower', 1, 4),
    at('wardrobe', 6, 3), at('mirror', 8, 1), at('window', 10, 1), at('desk', 9, 2), at('chair-up', 9, 3), at('bed', 12, 3),
    at('fridge', 1, 6), at('sink', 3, 6), at('stove', 4, 6),
    at('sofa', 10, 6), at('tv', 10, 8),
    ...many('pendant', [[2, 3], [8, 3], [6, 7]]),
  ],
  ambient: '#ffe9cf',
  spots: [
    { tx: 4, ty: 6, name: 'Cocina', activities: ['cook'] },
    { tx: 1, ty: 4, name: 'Ducha', activities: ['shower', 'shower-gel'] },
    { tx: 12, ty: 3, name: 'Cama', activities: ['nap', 'sleep'] },
    { tx: 6, ty: 3, name: 'Armario', activities: [], wardrobe: true },
    { tx: 8, ty: 1, name: 'Espejo', activities: [], wardrobe: true },
    { tx: 10, ty: 8, name: 'Tele', activities: ['watch-tv'] },
    { tx: 9, ty: 4, name: 'Ordenador · catálogo del hogar', activities: [], housing: true },
  ],
  inspects: [
    { tx: 10, ty: 2, name: 'Ventana a la Mayor', lines: ['Debajo, la Calle Mayor: el horno a las siete, el Rincón hasta la una y, en medio, todo el barrio pasando.'] },
    { tx: 1, ty: 7, name: 'Nevera', lines: ['Un imán del Horno San Blas sujeta una nota de Reme, la casera: «El alquiler, los lunes. La basura, los martes».'] },
  ],
  portals: [{ id: 'exit', tx: 6, ty: 9, label: 'Salir a la Calle Mayor', to: { location: STREET, spawn: 'res-mayor-17' } }],
  npcs: [],
  spawns: { entry: { tx: 6, ty: 8, facing: 'up' } },
  points: {
    M17_EXIT: p(6, 8, 'exit', 'up'),
    M17_BED: p(11, 3, 'interact', 'right'),
    M17_WARDROBE: p(6, 4, 'interact', 'up'),
    M17_MIRROR: p(8, 2, 'interact', 'up'),
    M17_KITCHEN: p(4, 7, 'interact', 'up'),
    M17_FRIDGE: p(1, 7, 'interact', 'up'),
    M17_SINK: p(1, 3, 'interact', 'up'),
    M17_TOILET: p(4, 3, 'interact', 'up'),
    M17_SHOWER: p(2, 4, 'interact', 'left'),
    M17_SOFA: p(10, 6, 'seat', 'down'),
    M17_SOFA_02: p(11, 6, 'seat', 'down'),
    M17_TV: p(9, 8, 'interact', 'right'),
    M17_GUEST: p(9, 7, 'meet'),
  },
};

// ------------------------------------------------------------ comisaría de barrio (ALPHA-10)

/**
 * Policía de barrio · Vallesco: la misma recepción que la comisaría de Puerta Central (planta de tienda pequeña, sin
 * caja; data/services.ts 'police-desk-vallesco'): cómo está el barrio y, si te han robado en la calle, la denuncia, sin
 * coger el metro. Es una oficina de barrio, con horario; la de Puerta Central sigue abierta las 24 horas.
 */
const POLICIA_ROOM = shopRoom({
  id: 'vallesco-policia', name: 'Policía de barrio · Vallesco', building: 'ronda-policia', street: STREET, pre: 'VPOLICIA', ambient: '#eef2f6',
  props: [
    at('info-board', 4, 1), at('poster', 7, 1), at('clock', 10, 1), ...many('plant', [[1, 1], [12, 1]]), at('desk', 11, 5),
    ...many('chair-right', [[2, 5], [2, 6], [2, 7]]), ...many('tube-light', [[4, 4], [9, 4]]),
  ],
  browse: [[3, 5, 'left'], [3, 7, 'left'], [4, 2, 'up']],
  inspects: [{ tx: 4, ty: 2, name: 'Tablón de la oficina', lines: ['Policía de barrio · Vallesco. De 8:00 a 22:00; de noche, la comisaría de Puerta Central (L2).', '«Un robo en la calle se denuncia aquí, en recepción.» «Emergencias: 112.»'] }],
});
const POLICIA: LocationDef = {
  ...POLICIA_ROOM,
  props: (POLICIA_ROOM.props ?? []).filter((prop) => prop.kind !== 'register'),
  portals: [{ id: 'exit', tx: 7, ty: 9, label: 'Salir a la Ronda', to: { location: STREET, spawn: 'ronda-policia' } }],
};

export const RONDA_INTERIORS: readonly LocationDef[] = [BOMBEROS, RONDA_8, MAYOR_17, POLICIA];

// ------------------------------------------------------------------ gente

export const RONDA_PROFILES: readonly PopulationProfile[] = [
  {
    // Siempre hay guardia; de día viene algún vecino con una pregunta o a enseñarle la autobomba a un crío.
    place: 'bomberos', bands: [[0, 9, 'VERY_LOW'], [9, 20, 'LOW'], [20, 24, 'VERY_LOW']],
    weekday: [0, 0, 0, 0, 0, 1, 1], maxVisitors: 2,
    staff: [
      { service: 'firefighter', label: 'Bombero de guardia', line: 'Buenas. Si es una emergencia, se llama al 112; si es una pregunta, pregunta.', look: 'uniforme-bomberos', points: ['BOMBEROS_STAFF'] },
      { service: 'shop-worker', label: 'Bombera revisando el equipo', line: 'Botas, casco, mangueras. Cada turno, todo. Aunque ayer estuviera bien.', look: 'uniforme-bomberos', points: ['BOMBEROS_GARAGE'] },
    ],
    visitors: [
      {
        role: 'visitor', label: 'Vecino con una pregunta', line: 'Vengo a preguntar por el detector de humo. El mío pita cuando le da la gana.', weight: 1,
        plan: [
          { state: 'BROWSE', points: ['BOMBEROS_BROWSE_'], minutes: [3, 8] },
          { state: 'QUEUE', points: ['BOMBEROS_QUEUE_'], minutes: [1, 2] },
          { state: 'TALK', points: ['BOMBEROS_TILL'], minutes: [3, 6] },
        ],
      },
    ],
  },
  {
    // La oficina de barrio: una agente en recepción y, de vez en cuando, alguien con un trámite.
    place: 'vallesco-policia', bands: [[8, 10, 'LOW'], [10, 20, 'LOW'], [20, 22, 'VERY_LOW']],
    weekday: [0, 0, 0, 0, 0, 0, 0], maxVisitors: 1,
    staff: [{ service: 'police-officer', label: 'Agente de barrio', line: 'Buenas. ¿Qué tal por el barrio?', look: 'uniforme-policia', points: ['VPOLICIA_STAFF'], offers: 'police-desk-vallesco' }],
    visitors: [
      {
        role: 'complainant', label: 'Vecina con un trámite', line: 'Una bici robada en el portal. Otra. La tercera este año.', weight: 1,
        plan: [
          { state: 'WAIT', points: ['VPOLICIA_BROWSE_'], minutes: [4, 10] },
          { state: 'QUEUE', points: ['VPOLICIA_QUEUE_'], minutes: [1, 2] },
          { state: 'TALK', points: ['VPOLICIA_TILL'], minutes: [3, 6] },
        ],
      },
    ],
  },
];
