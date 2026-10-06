import type { LocationDef, MetroDef, PointDef } from '../types/game.ts';
import { seatsFurniture } from './seating.ts';
import { VALLESCO } from './vallesco.ts';
import { RIBERA } from './ribera.ts';
import { ARCADE, ARCHIVO, BARBERSHOP, CAFE_RIO, CASA_MAR, CLUB, COLMADO, FASHION, GYM, MOLINILLO, OFFICE, PHARMACY, RESTAURANT, RETALES, RIBERA_SPORT, SUELA, SUPERMARKET, TINTA, VUELTA, WINE_BAR } from './interiors.ts';

/**
 * Leyenda del terreno (ver TILES en world/tiles.ts):
 *   g hierba   , acera   . asfalto   : asfalto con línea   ~ plaza
 *   # tejado A   % tejado B   D umbral transitable
 *   K fachada oficina   E fachada centro de estudios
 *   H fachada vivienda  C fachada cafetería
 *   W muro interior   f suelo de madera   t suelo de baldosa   r alfombra
 *   c adoquín   a agua   q muelle   R vía   y borde de andén   M quiosco de metro
 *   z paso de cebra   b carril bici   m suelo de gimnasio   k pista deportiva
 *
 * Los edificios del barrio Vallesco no están en la rejilla: son BuildingDef
 * (data/vallesco.ts), que generan su fachada, su puerta y su spawn.
 */

/**
 * Tu piso, Olmo 7: cocina, baño y dormitorio al fondo, cada uno tras su
 * tabique y su puerta, y el salón delante, donde da la puerta de la escalera.
 * Mismo tamaño que el piso abierto de antes: la puerta y el spawn no cambian.
 *
 *   cocina (1–6 × 2–6)  baño (8–11 × 2–5)  dormitorio (13–20 × 2–6)
 *   salón (1–20 × 8–13), con un rellano junto a la puerta del baño
 */
const HOME: LocationDef = {
  id: 'home',
  name: 'Tu piso',
  kind: 'interior',
  ground: [
    'WWWWWWWWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWWWWWWWW',
    'WttttttWttttWffffffffW',
    'WttttttWttttWffffffffW',
    'WttttttWttttWffrrrrffW',
    'WttttttWttttWffrrrrffW',
    'WttttttWWWtWWffffffffW',
    'WWWttWWWfffWWWWWffWWWW',
    'WffffffffffffffffffffW',
    'WffffffffffffffffffffW',
    'WffrrrrffffffffffffffW',
    'WffrrrrffffffffffffffW',
    'WffrrrrffffffffffffffW',
    'WffffffffffffffffffffW',
    'WWWWWWWWWWDWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWWWWWWWW',
  ],
  props: [
    // Cocina: fregadero, encimera con la cafetera, fogones y nevera contra el fondo; armarios encima; mesa para dos.
    { kind: 'sink', tx: 1, ty: 2 },
    { kind: 'counter', tx: 2, ty: 2 },
    { kind: 'espresso', tx: 2, ty: 2 },
    { kind: 'counter', tx: 3, ty: 2 },
    { kind: 'stove', tx: 4, ty: 2 },
    { kind: 'fridge', tx: 6, ty: 2 },
    { kind: 'wall-shelf', tx: 1, ty: 1 },
    { kind: 'table', tx: 4, ty: 5 },
    { kind: 'chair-right', tx: 3, ty: 5 },
    { kind: 'chair-left', tx: 5, ty: 5 },
    { kind: 'pendant', tx: 4, ty: 5 },
    // Baño: lavabo con su espejo, inodoro y plato de ducha en la esquina.
    { kind: 'mirror', tx: 8, ty: 1 },
    { kind: 'sink', tx: 8, ty: 2 },
    { kind: 'toilet', tx: 11, ty: 2 },
    { kind: 'shower', tx: 8, ty: 5 },
    { kind: 'pendant', tx: 10, ty: 3 },
    // Dormitorio: armario y espejo de cuerpo entero, escritorio con el ordenador, cama con su lámpara y una estantería.
    { kind: 'wardrobe', tx: 13, ty: 3 },
    { kind: 'mirror', tx: 14, ty: 1 },
    { kind: 'desk', tx: 16, ty: 2 },
    { kind: 'chair-up', tx: 16, ty: 3 },
    { kind: 'window', tx: 17, ty: 1 },
    { kind: 'bed', tx: 19, ty: 3 },
    { kind: 'floor-lamp', tx: 20, ty: 3 },
    { kind: 'shelf', tx: 20, ty: 6 },
    { kind: 'plant', tx: 13, ty: 6 },
    // Salón: sofá frente a la tele con la mesa baja en medio, lámpara de pie, libros, plantas y cuadros.
    { kind: 'sofa', tx: 3, ty: 10 },
    { kind: 'table', tx: 4, ty: 12 },
    { kind: 'tv', tx: 3, ty: 13 },
    { kind: 'floor-lamp', tx: 1, ty: 10 },
    { kind: 'pendant', tx: 4, ty: 11 },
    { kind: 'shelf', tx: 20, ty: 9 },
    { kind: 'plant', tx: 20, ty: 13 },
    { kind: 'plant', tx: 8, ty: 7 },
    { kind: 'painting', tx: 12, ty: 7 },
    { kind: 'painting', tx: 14, ty: 7 },
    { kind: 'clock', tx: 6, ty: 7 },
    { kind: 'pendant', tx: 12, ty: 10 },
  ],
  ambient: '#ffe6c8',
  // Lo que se hace en casa (data/activities.ts): cocinar, ducharse, dormir, ver la tele y cambiarse en el armario o ante el espejo.
  spots: [
    { tx: 4, ty: 2, name: 'Cocina', activities: ['cook'] },
    { tx: 8, ty: 5, name: 'Ducha', activities: ['shower'] },
    { tx: 19, ty: 3, name: 'Cama', activities: ['nap', 'sleep'] },
    { tx: 13, ty: 3, name: 'Armario', activities: [], wardrobe: true },
    { tx: 14, ty: 1, name: 'Espejo', activities: [], wardrobe: true },
    { tx: 3, ty: 13, name: 'Tele', activities: ['watch-tv'] },
  ],
  inspects: [
    { tx: 8, ty: 1, name: 'Espejo del baño', lines: ['Ojeras de serie. El espejo no miente, pero tampoco ayuda.'] },
    { tx: 6, ty: 2, name: 'Nevera', lines: ['Lo de la compra va a la bolsa; aquí sólo queda un limón y salsa de soja.'] },
  ],
  portals: [
    { id: 'exit', tx: 10, ty: 14, label: 'Salir a la calle', to: { location: 'district', spawn: 'home-door' } },
  ],
  npcs: [],
  spawns: {
    entry: { tx: 10, ty: 13, facing: 'up' },
  },
  // Cada cosa de la casa, con nombre: lo que hoy se hace (dormir, cocinar, vestirse, sentarse) y donde se
  // engancharán el ordenador, guardar cosas, el aseo y las visitas.
  points: {
    HOME_EXIT: { tx: 10, ty: 13, kind: 'exit', facing: 'up' },
    HOME_BED: { tx: 18, ty: 3, kind: 'interact', facing: 'right' },
    HOME_WARDROBE: { tx: 13, ty: 4, kind: 'interact', facing: 'up' },
    HOME_MIRROR: { tx: 14, ty: 2, kind: 'interact', facing: 'up' },
    HOME_COMPUTER: { tx: 16, ty: 3, kind: 'seat', facing: 'up' },
    HOME_STORAGE: { tx: 19, ty: 6, kind: 'interact', facing: 'right' },
    HOME_KITCHEN: { tx: 4, ty: 3, kind: 'interact', facing: 'up' },
    HOME_FRIDGE: { tx: 6, ty: 3, kind: 'interact', facing: 'up' },
    HOME_KITCHEN_SINK: { tx: 1, ty: 3, kind: 'interact', facing: 'up' },
    HOME_TABLE: { tx: 3, ty: 5, kind: 'seat', facing: 'right' },
    HOME_TABLE_02: { tx: 5, ty: 5, kind: 'seat', facing: 'left' },
    HOME_SINK: { tx: 8, ty: 3, kind: 'interact', facing: 'up' },
    HOME_TOILET: { tx: 11, ty: 3, kind: 'interact', facing: 'up' },
    HOME_SHOWER: { tx: 9, ty: 5, kind: 'interact', facing: 'left' },
    // El sofá, dos plazas, mirando a la tele.
    HOME_SOFA: { tx: 3, ty: 10, kind: 'seat', facing: 'down' },
    HOME_SOFA_02: { tx: 4, ty: 10, kind: 'seat', facing: 'down' },
    HOME_TV: { tx: 5, ty: 12, kind: 'interact', facing: 'down' },
    HOME_GUEST: { tx: 11, ty: 10, kind: 'meet' },
  },
};

/** Los asientos de la cafetería: cada uno con su silla (data/seating.ts). */
const CAFE_SEATS: Readonly<Record<string, PointDef>> = {
  CAFE_TABLE_01: { tx: 13, ty: 5, kind: 'seat', facing: 'up' },
  CAFE_TABLE_02: { tx: 12, ty: 9, kind: 'seat', facing: 'up' },
  CAFE_TABLE_03: { tx: 3, ty: 10, kind: 'seat', facing: 'up' },
  CAFE_TABLE_04: { tx: 15, ty: 9, kind: 'seat', facing: 'up' },
  CAFE_TABLE_05: { tx: 14, ty: 4, kind: 'seat', facing: 'left' },
  CAFE_TABLE_06: { tx: 13, ty: 8, kind: 'seat', facing: 'left' },
  CAFE_TABLE_07: { tx: 4, ty: 9, kind: 'seat', facing: 'left' },
  CAFE_TABLE_08: { tx: 16, ty: 8, kind: 'seat', facing: 'left' },
  CAFE_WINDOW_SEAT: { tx: 10, ty: 3, kind: 'seat', facing: 'up' },
};

const CAFE: LocationDef = {
  id: 'cafe',
  name: 'Cafetería Pausa',
  kind: 'interior',
  ground: [
    'WWWWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWWWW',
    'WttttttttttttttttW',
    'WttttttttttttttttW',
    'WttttttttttttttttW',
    'WffffffffffffffffW',
    'WffffffffffffffffW',
    'WffffffffffffffffW',
    'WffffffffffffffffW',
    'WffffffffffffffffW',
    'WffffffffffffffffW',
    'WWWWWWWWDWWWWWWWWW',
    'WWWWWWWWWWWWWWWWWW',
  ],
  props: [
    { kind: 'shelf', tx: 2, ty: 3 },
    { kind: 'shelf', tx: 3, ty: 3 },
    { kind: 'counter', tx: 3, ty: 6 },
    { kind: 'counter', tx: 4, ty: 6 },
    { kind: 'counter', tx: 5, ty: 6 },
    { kind: 'counter', tx: 6, ty: 6 },
    { kind: 'table', tx: 13, ty: 4 },
    { kind: 'table', tx: 12, ty: 8 },
    { kind: 'table', tx: 3, ty: 9 },
    { kind: 'plant', tx: 16, ty: 10 },
    { kind: 'plant', tx: 1, ty: 10 },
    { kind: 'table', tx: 15, ty: 8 },
    // Barra con cafetera y vitrina, carta en pizarra, ventanales y una lámpara sobre cada mesa.
    { kind: 'espresso', tx: 3, ty: 6 },
    { kind: 'pastry-case', tx: 6, ty: 6 },
    { kind: 'chalkboard', tx: 4, ty: 1 },
    { kind: 'clock', tx: 7, ty: 1 },
    { kind: 'window', tx: 9, ty: 1 },
    { kind: 'window', tx: 12, ty: 1 },
    { kind: 'window', tx: 15, ty: 1 },
    { kind: 'pendant', tx: 4, ty: 6 },
    { kind: 'pendant', tx: 13, ty: 4 },
    { kind: 'pendant', tx: 12, ty: 8 },
    { kind: 'pendant', tx: 15, ty: 8 },
    { kind: 'pendant', tx: 3, ty: 9 },
    // Tazas en la balda de detrás de la barra, otra lámpara sobre la vitrina y mesita para el sitio de la ventana.
    { kind: 'wall-shelf', tx: 1, ty: 1 },
    { kind: 'pendant', tx: 6, ty: 6 },
    { kind: 'cafe-table', tx: 10, ty: 2 },
    // Una silla debajo de cada asiento de mesa (data/seating.ts), mirando a su mesa.
    ...seatsFurniture(CAFE_SEATS),
  ],
  ambient: '#ffe2c0',
  portals: [
    { id: 'exit', tx: 8, ty: 11, label: 'Salir a la calle', to: { location: 'district', spawn: 'cafe-door' } },
  ],
  // En la barra, delante de Nilo, se compra para llevar; sentado a una mesa, te toman nota (servicio de mesa).
  terminals: [{ tx: 5, ty: 6, name: 'Barra · Pausa', catalog: 'cafe-counter' }],
  // Servicio de mesa (data/population.ts: tableService, carta 'pausa'): cada mesa, sus sillas y el sitio libre
  // a su lado donde se para quien atiende.
  tables: [
    { id: 'MESA_01', seats: ['CAFE_TABLE_01', 'CAFE_TABLE_05'], service: { tx: 12, ty: 4 } },
    { id: 'MESA_02', seats: ['CAFE_TABLE_02', 'CAFE_TABLE_06'], service: { tx: 11, ty: 8 } },
    { id: 'MESA_03', seats: ['CAFE_TABLE_03', 'CAFE_TABLE_07'], service: { tx: 2, ty: 9 } },
    { id: 'MESA_04', seats: ['CAFE_TABLE_04', 'CAFE_TABLE_08'], service: { tx: 14, ty: 8 } },
    { id: 'VENTANA', seats: ['CAFE_WINDOW_SEAT'], service: { tx: 11, ty: 3 } },
  ],
  // Nilo y la clientela los pone data/population.ts según la hora.
  npcs: [],
  spawns: {
    entry: { tx: 8, ty: 10, facing: 'up' },
  },
  points: {
    CAFE_EXIT: { tx: 8, ty: 10, kind: 'exit', facing: 'up' },
    CAFE_COUNTER: { tx: 5, ty: 7, kind: 'interact', facing: 'up' },
    CAFE_BARISTA: { tx: 5, ty: 5, kind: 'work', facing: 'down' },
    // El pase: el final de la barra, donde el camarero recoge lo que prepara Nilo y deja las tazas.
    CAFE_PASS: { tx: 7, ty: 6, kind: 'interact', facing: 'left' },
    ...CAFE_SEATS,
    CAFE_QUEUE_01: { tx: 5, ty: 8, kind: 'wait', facing: 'up' },
    CAFE_QUEUE_02: { tx: 5, ty: 9, kind: 'wait', facing: 'up' },
    CAFE_WAITER_01: { tx: 10, ty: 6, kind: 'work' },
    CAFE_WAITER_02: { tx: 14, ty: 6, kind: 'work' },
  },
};

/**
 * Estación de metro: vestíbulo con torniquetes, andén y vía. Las dos estaciones
 * comparten trazado; cambian destino, salida, habituales y vigilancia.
 * La vía llega a los bordes del mapa: son las bocas del túnel.
 */
function platform(
  id: string,
  name: string,
  exit: { location: string; spawn: string },
  line: { label: string; location: string },
  npcs: LocationDef['npcs'],
  guards: MetroDef['guards'],
): LocationDef {
  return {
    id,
    name,
    kind: 'interior',
    // Tubo fluorescente de andén: blanco frío y funcional, nada que ver con la luz de una casa o de un bar.
    ambient: '#dbe7f2',
    ground: [
      'WWWWWWWWWWWWWWWWWWWWWW',
      'WWWWWWWWWWWWWWWWWWWWWW',
      'RRRRRRRRRRRRRRRRRRRRRR',
      'RRRRRRRRRRRRRRRRRRRRRR',
      'RRRRRRRRRRRRRRRRRRRRRR',
      'WyyyyyyyyyyyyyyyyyyyyW',
      'WttttttttttttttttttttW',
      'WttttttttttttttttttttW',
      'WttttttttttttttttttttW',
      'WttttttttttttttttttttW',
      'WWWWWWWWttttttWWWWWWWW',
      'WWWWWWttttttttttWWWWWW',
      'WWWWWWttttttttttWWWWWW',
      'WWWWWWWWWWWDWWWWWWWWWW',
      'WWWWWWWWWWWWWWWWWWWWWW',
    ],
    props: [
      { kind: 'line-map', tx: 2, ty: 1 },
      { kind: 'poster', tx: 6, ty: 1 },
      { kind: 'metro-sign', tx: 9, ty: 1 },
      { kind: 'poster', tx: 13, ty: 1 },
      { kind: 'line-map', tx: 16, ty: 1 },
      { kind: 'sign', tx: 2, ty: 9 },
      { kind: 'bench', tx: 4, ty: 9 },
      { kind: 'bench', tx: 5, ty: 9 },
      { kind: 'bench', tx: 16, ty: 9 },
      { kind: 'bench', tx: 17, ty: 9 },
      { kind: 'sign', tx: 19, ty: 9 },
      { kind: 'turnstile', tx: 8, ty: 10 },
      { kind: 'turnstile', tx: 10, ty: 10 },
      { kind: 'turnstile', tx: 12, ty: 10 },
      { kind: 'sign', tx: 6, ty: 12 },
      { kind: 'poster', tx: 15, ty: 12 },
      { kind: 'ticket-machine', tx: 14, ty: 11 },
    ],
    // Sin tarjeta no se sube al tren: se compra y se recarga aquí.
    terminals: [{ tx: 14, ty: 11, name: 'Máquina de billetes', catalog: 'transport-machine' }],
    portals: [
      { id: 'exit', tx: 11, ty: 13, label: 'Salir a la calle', to: exit },
      {
        id: 'board',
        tx: 11,
        ty: 5,
        label: line.label,
        to: { location: line.location, spawn: 'train' },
        train: true,
      },
    ],
    npcs,
    spawns: {
      entry: { tx: 11, ty: 12, facing: 'up' },
      train: { tx: 12, ty: 6, facing: 'down' },
    },
    metro: {
      trackRow: 2,
      edgeRow: 5,
      walkRow: 6,
      entrance: { tx: 11, ty: 13 },
      gates: [
        { tx: 9, ty: 10 },
        { tx: 11, ty: 10 },
        { tx: 13, ty: 10 },
      ],
      // Entre puertas (cols 3, 6, 9, 12, 15, 18) y lejos de los habituales.
      // Los de la fila 6 son "delante": ahí se ponen quienes quieren subir primero.
      waitingSpots: [
        { tx: 1, ty: 6 },
        { tx: 2, ty: 7 },
        { tx: 4, ty: 6 },
        { tx: 7, ty: 6 },
        { tx: 10, ty: 7 },
        { tx: 11, ty: 8 },
        { tx: 12, ty: 8 },
        { tx: 13, ty: 6 },
        { tx: 14, ty: 6 },
        { tx: 16, ty: 6 },
        { tx: 19, ty: 7 },
        { tx: 20, ty: 6 },
      ],
      seats: [
        { tx: 4, ty: 9 },
        { tx: 5, ty: 9 },
        { tx: 16, ty: 9 },
        { tx: 17, ty: 9 },
      ],
      signSpots: [
        { tx: 2, ty: 8, facing: 'down' },
        { tx: 19, ty: 8, facing: 'down' },
        { tx: 7, ty: 12, facing: 'left' },
        { tx: 14, ty: 12, facing: 'right' },
      ],
      guards,
    },
  };
}

/** Rocío cubre el vestíbulo de la estación que le toque ese día. */
const VESTIBULE_GUARD: MetroDef['guards'][number] = {
  id: 'rocio',
  post: { tx: 13, ty: 11 },
  facing: 'left',
  patrol: [
    { tx: 8, ty: 11 },
    { tx: 9, ty: 12 },
    { tx: 13, ty: 12 },
  ],
};

const VALLESCO_STATION = platform(
  'vallesco-station',
  'Metro · Vallesco',
  { location: 'district', spawn: 'metro-door' },
  { label: 'Línea 2 · subir al tren', location: 'ribera-station' },
  [
    { id: 'paula', tx: 5, ty: 7, facing: 'up' },
    { id: 'kike', tx: 8, ty: 8, facing: 'up' },
  ],
  [
    {
      id: 'marco',
      post: { tx: 17, ty: 7 },
      facing: 'left',
      patrol: [
        { tx: 19, ty: 8 },
        { tx: 15, ty: 8 },
        { tx: 13, ty: 7 },
      ],
    },
    VESTIBULE_GUARD,
  ],
);

const RIBERA_STATION = platform(
  'ribera-station',
  'Metro · Ribera Norte',
  { location: 'ribera', spawn: 'metro-door' },
  { label: 'Línea 2 · subir al tren', location: 'vallesco-station' },
  [
    { id: 'ines', tx: 14, ty: 7, facing: 'up' },
    { id: 'dani', tx: 6, ty: 8, facing: 'right' },
  ],
  [
    {
      id: 'iker',
      post: { tx: 17, ty: 7 },
      facing: 'left',
      patrol: [
        { tx: 19, ty: 8 },
        { tx: 16, ty: 8 },
        { tx: 12, ty: 6 },
      ],
    },
    VESTIBULE_GUARD,
  ],
);

/** Tres taburetes a la barra, delante del mostrador (fila 6), mirando hacia él. */
const BAR_STOOLS: Record<string, PointDef> = Object.fromEntries([2, 3, 4].map((x, i) => [`BAR_STOOL_0${i + 1}`, { tx: x, ty: 6, kind: 'seat', facing: 'up' } as PointDef]));

const BAR: LocationDef = {
  id: 'bar',
  name: 'Bar Ribera',
  kind: 'interior',
  ground: [
    'WWWWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWWWW',
    'WttttttttttttttttW',
    'WttttttttttttttttW',
    'WttttttttttttttttW',
    'WffffffffffffffffW',
    'WffffffffffffffffW',
    'WffffffffffffffffW',
    'WffffffffffffffffW',
    'WffffffffffffffffW',
    'WWWWWWWWDWWWWWWWWW',
    'WWWWWWWWWWWWWWWWWW',
  ],
  props: [
    { kind: 'shelf', tx: 2, ty: 3 },
    { kind: 'shelf', tx: 3, ty: 3 },
    { kind: 'shelf', tx: 4, ty: 3 },
    { kind: 'counter', tx: 2, ty: 5 },
    { kind: 'counter', tx: 3, ty: 5 },
    { kind: 'counter', tx: 4, ty: 5 },
    { kind: 'counter', tx: 5, ty: 5 },
    { kind: 'counter', tx: 6, ty: 5 },
    // El extremo de la barra, donde nadie se queda de pie: ahí se pide (spots), sin cliente de por medio.
    { kind: 'counter', tx: 7, ty: 5 },
    { kind: 'counter', tx: 8, ty: 5 },
    { kind: 'counter', tx: 9, ty: 5 },
    { kind: 'table', tx: 12, ty: 4 },
    { kind: 'table', tx: 15, ty: 7 },
    { kind: 'table', tx: 11, ty: 8 },
    { kind: 'plant', tx: 16, ty: 2 },
    { kind: 'plant', tx: 1, ty: 9 },
    // Botellero en la pared, luz baja sobre barra y mesas, ventanas a la calle.
    { kind: 'bottles', tx: 2, ty: 1 },
    { kind: 'bottles', tx: 4, ty: 1 },
    { kind: 'window', tx: 11, ty: 1 },
    { kind: 'window', tx: 14, ty: 1 },
    { kind: 'pendant', tx: 3, ty: 6 },
    { kind: 'pendant', tx: 5, ty: 6 },
    { kind: 'pendant', tx: 12, ty: 4 },
    { kind: 'pendant', tx: 15, ty: 7 },
    { kind: 'pendant', tx: 11, ty: 8 },
    ...seatsFurniture(BAR_STOOLS, 'stool'),
  ],
  ambient: '#ffdcb4',
  portals: [
    { id: 'exit', tx: 8, ty: 10, label: 'Salir a la calle', to: { location: 'ribera', spawn: 'bar-door' } },
  ],
  // Tere ya no está clavada en su sitio: lleva la barra como personal del local (data/population.ts, 'bar-ribera').
  npcs: [],
  // Pedir en la barra: el mismo mecanismo que la barra de Casa Tomás (un mostrador con sus actividades, menú de siempre).
  spots: [{ tx: 9, ty: 5, name: 'Barra · Bar Ribera', activities: ['bar-cana', 'bar-tinto', 'bar-refresco'] }],
  spawns: {
    entry: { tx: 8, ty: 9, facing: 'up' },
  },
  points: {
    BAR_EXIT: { tx: 8, ty: 9, kind: 'exit', facing: 'up' },
    // Detrás de la barra, entre el botellero y el mostrador: el tirador, la estantería y la caja.
    BAR_STAFF_01: { tx: 3, ty: 4, kind: 'work', facing: 'down' },
    BAR_STAFF_02: { tx: 5, ty: 4, kind: 'work', facing: 'down' },
    BAR_STAFF_03: { tx: 7, ty: 4, kind: 'work', facing: 'down' },
    // Los taburetes de la barra (asientos de verdad, data/seating.ts): se sienta mirando al mostrador.
    ...BAR_STOOLS,
    // De pie en la barra, de espaldas a la sala.
    BAR_COUNTER_01: { tx: 5, ty: 6, kind: 'wait', facing: 'up' },
    BAR_COUNTER_02: { tx: 6, ty: 6, kind: 'wait', facing: 'up' },
    BAR_COUNTER_03: { tx: 7, ty: 6, kind: 'wait', facing: 'up' },
    // Alrededor de las mesas altas, de dos en dos, cara a cara.
    BAR_TABLE_01: { tx: 11, ty: 4, kind: 'meet', facing: 'right' },
    BAR_TABLE_02: { tx: 13, ty: 4, kind: 'meet', facing: 'left' },
    BAR_TABLE_03: { tx: 14, ty: 7, kind: 'meet', facing: 'right' },
    BAR_TABLE_04: { tx: 16, ty: 7, kind: 'meet', facing: 'left' },
    BAR_TABLE_05: { tx: 10, ty: 8, kind: 'meet', facing: 'right' },
    BAR_TABLE_06: { tx: 12, ty: 8, kind: 'meet', facing: 'left' },
  },
};

export const LOCATIONS: readonly LocationDef[] = [
  VALLESCO,
  HOME,
  CAFE,
  GYM,
  FASHION,
  SUPERMARKET,
  RESTAURANT,
  OFFICE,
  CLUB,
  VALLESCO_STATION,
  RIBERA,
  RIBERA_STATION,
  BAR,
  PHARMACY,
  BARBERSHOP,
  RETALES,
  ARCHIVO,
  VUELTA,
  SUELA,
  ARCADE,
  TINTA,
  MOLINILLO,
  WINE_BAR,
  // Ribera Norte: los locales de la calle de la Ribera (data/ribera.ts).
  COLMADO,
  RIBERA_SPORT,
  CAFE_RIO,
  CASA_MAR,
];

export const START_LOCATION = VALLESCO.id;
export const START_SPAWN = 'start';
