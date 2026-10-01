import type { LocationDef, MetroDef, PointDef } from '../types/game.ts';
import { PROTOTYPE_PLAZUELA } from './prototype.ts';
import { seatsFurniture } from './seating.ts';
import { VALLESCO } from './vallesco.ts';
import { ARCHIVO, BARBERSHOP, CLUB, FASHION, GYM, MOLINILLO, OFFICE, PHARMACY, RESTAURANT, RETALES, SUPERMARKET, TINTA, VUELTA, WINE_BAR } from './interiors.ts';

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

const HOME: LocationDef = {
  id: 'home',
  name: 'Tu piso',
  kind: 'interior',
  ground: [
    'WWWWWWWWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWWWWWWWW',
    'WtttttttfffffffffffffW',
    'WtttttttfffffffffffffW',
    'WtttttttfffffffffffffW',
    'WtttttttfffffffffffffW',
    'WffffffffffffffffffffW',
    'WffffffffffffffffffffW',
    'WfffffffrrrrrrrffffffW',
    'WfffffffrrrrrrrffffffW',
    'WfffffffrrrrrrrffffffW',
    'WffffffffffffffffffffW',
    'WffffffffffffffffffffW',
    'WffffffffffffffffffffW',
    'WWWWWWWWWWDWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWWWWWWWW',
  ],
  props: [
    { kind: 'counter', tx: 1, ty: 3 },
    { kind: 'counter', tx: 2, ty: 3 },
    { kind: 'counter', tx: 3, ty: 3 },
    { kind: 'shelf', tx: 5, ty: 3 },
    { kind: 'table', tx: 3, ty: 6 },
    { kind: 'plant', tx: 1, ty: 12 },
    { kind: 'shelf', tx: 12, ty: 3 },
    { kind: 'bed', tx: 19, ty: 4 },
    { kind: 'desk', tx: 15, ty: 7 },
    { kind: 'plant', tx: 20, ty: 12 },
    { kind: 'wardrobe', tx: 16, ty: 3 },
    { kind: 'sofa', tx: 6, ty: 11 },
    { kind: 'chair-up', tx: 3, ty: 7 },
    // Lo que hace de un piso un sitio donde se vive: luz por las ventanas, la cafetera, la nevera.
    { kind: 'window', tx: 9, ty: 1 },
    { kind: 'window', tx: 13, ty: 1 },
    { kind: 'painting', tx: 19, ty: 1 },
    { kind: 'clock', tx: 7, ty: 1 },
    { kind: 'espresso', tx: 2, ty: 3 },
    { kind: 'fridge', tx: 6, ty: 3 },
    { kind: 'pendant', tx: 3, ty: 6 },
    { kind: 'pendant', tx: 11, ty: 9 },
    { kind: 'pendant', tx: 15, ty: 7 },
    // Luz de casa: una lámpara de pie junto al sofá y otra de lectura al lado de la cama; un cuadro más.
    { kind: 'floor-lamp', tx: 8, ty: 11 },
    { kind: 'floor-lamp', tx: 20, ty: 3 },
    { kind: 'painting', tx: 3, ty: 1 },
    { kind: 'wall-shelf', tx: 15, ty: 1 },
  ],
  ambient: '#ffe6c8',
  // Lo que se hace en casa: dormir y cocinar (data/activities.ts).
  spots: [
    { tx: 2, ty: 3, name: 'Cocina', activities: ['cook'] },
    { tx: 19, ty: 4, name: 'Cama', activities: ['nap', 'sleep'] },
    { tx: 16, ty: 3, name: 'Armario', activities: [], wardrobe: true },
  ],
  portals: [
    { id: 'exit', tx: 10, ty: 14, label: 'Salir a la calle', to: { location: 'district', spawn: 'home-door' } },
  ],
  npcs: [],
  spawns: {
    entry: { tx: 10, ty: 13, facing: 'up' },
  },
  // Dónde se engancharán dormir, vestirse, el ordenador, guardar cosas y recibir visitas.
  points: {
    HOME_EXIT: { tx: 10, ty: 13, kind: 'exit', facing: 'up' },
    HOME_BED: { tx: 18, ty: 4, kind: 'interact', facing: 'right' },
    HOME_WARDROBE: { tx: 16, ty: 4, kind: 'interact', facing: 'up' },
    HOME_COMPUTER: { tx: 15, ty: 8, kind: 'interact', facing: 'up' },
    HOME_STORAGE: { tx: 12, ty: 4, kind: 'interact', facing: 'up' },
    HOME_KITCHEN: { tx: 2, ty: 4, kind: 'interact', facing: 'up' },
    HOME_TABLE: { tx: 3, ty: 7, kind: 'seat', facing: 'up' },
    // El sofá, dos plazas; la mesa, su silla.
    HOME_SOFA: { tx: 6, ty: 11, kind: 'seat', facing: 'down' },
    HOME_SOFA_02: { tx: 7, ty: 11, kind: 'seat', facing: 'down' },
    HOME_GUEST: { tx: 11, ty: 9, kind: 'meet' },
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
  // Se pide en la barra, delante de Nilo.
  terminals: [{ tx: 5, ty: 6, name: 'Barra · Pausa', catalog: 'cafe-counter' }],
  // Nilo y la clientela los pone data/population.ts según la hora.
  npcs: [],
  spawns: {
    entry: { tx: 8, ty: 10, facing: 'up' },
  },
  points: {
    CAFE_EXIT: { tx: 8, ty: 10, kind: 'exit', facing: 'up' },
    CAFE_COUNTER: { tx: 5, ty: 7, kind: 'interact', facing: 'up' },
    CAFE_BARISTA: { tx: 5, ty: 5, kind: 'work', facing: 'down' },
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

const RIBERA: LocationDef = {
  id: 'ribera',
  name: 'Ribera Norte',
  kind: 'exterior',
  // Mercado y terrazas junto al río; la puerta del bar, de noche (data/districts.ts).
  district: 'commercial',
  zones: [{ profile: 'nightlife', tx: 1, ty: 8, w: 16, h: 4 }],
  ground: [
    'gggggggggggggggggggggggggggggggggggggggg',
    'gggggggggggggggggggggggggggggggggggggggg',
    'ggg%%%%%%%%%%%%%%%%ggg################gg',
    'ggg%%%%%%%%%%%%%%%%ggg################gg',
    'ggg%%%%%%%%%%%%%%%%ggg################gg',
    'ggg%%%%%%%%%%%%%%%%ggg################gg',
    'ggg%%%%%%%%%%%%%%%%ggg################gg',
    'ggg%%%%%%%%%%%%%%%%ggg################gg',
    'gggHHHHHDHHHHHHHHHHgggHHHHHHHHHHHHHHHHgg',
    'g,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,g',
    'g,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,g',
    'gccccccccccccccccccccccccccccccccccccccg',
    'gccccccccccccccccccccccccccccccccccccccg',
    'gccccccccccccccccccccccccccccccccccccccg',
    'g,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,g',
    'gcccccccccccccccccMMMccccccccccccccccccg',
    'gcccccccccccccccccMMMccccccccccccccccccg',
    'gcccccccccccccccccMDMccccccccccccccccccg',
    'gccccccccccccccccccccccccccccccccccccccg',
    'gccccccccccccccccccccccccccccccccccccccg',
    'gccccccccccccccccccccccccccccccccccccccg',
    'gccccccccccccccccccccccccccccccccccccccg',
    'g,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,g',
    'gccccccccccccccccccccccccccccccccccccccg',
    'gccccccccccccccccccccccccccccccccccccccg',
    'gqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqg',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  ],
  props: [
    { kind: 'tree', tx: 1, ty: 1 },
    { kind: 'tree', tx: 20, ty: 1 },
    { kind: 'tree', tx: 38, ty: 1 },
    { kind: 'bush', tx: 20, ty: 4 },
    { kind: 'tree', tx: 20, ty: 7 },

    { kind: 'lamp', tx: 4, ty: 10 },
    { kind: 'cafe-table', tx: 5, ty: 10 },
    { kind: 'parasol', tx: 6, ty: 10 },
    { kind: 'parasol', tx: 10, ty: 10 },
    { kind: 'cafe-table', tx: 11, ty: 10 },
    { kind: 'parasol', tx: 13, ty: 10 },
    { kind: 'lamp', tx: 17, ty: 10 },
    { kind: 'bench', tx: 24, ty: 10 },
    { kind: 'lamp', tx: 30, ty: 10 },
    { kind: 'planter', tx: 35, ty: 10 },

    { kind: 'stall', tx: 5, ty: 17 },
    { kind: 'stall', tx: 8, ty: 17 },
    { kind: 'stall', tx: 11, ty: 17 },
    { kind: 'stall', tx: 26, ty: 17 },
    { kind: 'stall', tx: 29, ty: 17 },
    { kind: 'stall', tx: 32, ty: 17 },
    { kind: 'stall', tx: 7, ty: 21 },
    { kind: 'stall', tx: 10, ty: 21 },
    { kind: 'stall', tx: 28, ty: 21 },
    { kind: 'stall', tx: 31, ty: 21 },
    { kind: 'metro-sign', tx: 18, ty: 15 },
    { kind: 'lamp', tx: 16, ty: 20 },
    { kind: 'lamp', tx: 23, ty: 20 },
    { kind: 'planter', tx: 19, ty: 21 },

    { kind: 'lamp', tx: 3, ty: 24 },
    { kind: 'bench', tx: 8, ty: 24 },
    { kind: 'bench', tx: 9, ty: 24 },
    { kind: 'lamp', tx: 14, ty: 24 },
    { kind: 'bench', tx: 19, ty: 24 },
    { kind: 'bench', tx: 20, ty: 24 },
    { kind: 'lamp', tx: 25, ty: 24 },
    { kind: 'bench', tx: 30, ty: 24 },
    { kind: 'bench', tx: 31, ty: 24 },
    { kind: 'lamp', tx: 36, ty: 24 },
  ],
  portals: [
    { id: 'bar-door', tx: 8, ty: 8, label: 'Bar Ribera', to: { location: 'bar', spawn: 'entry' } },
    {
      id: 'metro-door',
      tx: 19,
      ty: 17,
      label: 'Metro · Ribera Norte',
      to: { location: 'ribera-station', spawn: 'entry' },
    },
  ],
  npcs: [
    { id: 'olmo', tx: 14, ty: 19, facing: 'down' },
    { id: 'sira', tx: 26, ty: 23, facing: 'down' },
  ],
  spawns: {
    'bar-door': { tx: 8, ty: 9, facing: 'down' },
    'metro-door': { tx: 19, ty: 18, facing: 'down' },
  },
};

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
  ],
  ambient: '#ffdcb4',
  portals: [
    { id: 'exit', tx: 8, ty: 10, label: 'Salir a la calle', to: { location: 'ribera', spawn: 'bar-door' } },
  ],
  npcs: [{ id: 'tere', tx: 4, ty: 4, facing: 'down' }],
  spawns: {
    entry: { tx: 8, ty: 9, facing: 'up' },
  },
};

export const LOCATIONS: readonly LocationDef[] = [
  VALLESCO,
  // Prototipo Visual V3: sólo se abre con ?proto (main.ts).
  PROTOTYPE_PLAZUELA,
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
  TINTA,
  MOLINILLO,
  WINE_BAR,
];

export const START_LOCATION = VALLESCO.id;
export const START_SPAWN = 'start';
