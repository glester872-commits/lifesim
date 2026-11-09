import type { LocationDef } from '../types/game.ts';
import type { PopulationProfile, VisitorRole } from './population.ts';
import { at, many } from './interiors.ts';
import { cashier, customer, shopRoom } from './cuatroRiosVenues.ts';

/**
 * Los locales de Luna (data/luna.ts) por dentro: la tienda es la planta pequeña de Cuatro Ríos y el bar, la planta del
 * Bar Ribera con su prefijo (se monta en data/locations.ts, donde vive esa planta).
 */
export const LU_INTERIORS: readonly LocationDef[] = [
  shopRoom({
    id: 'lu-abierto', name: 'Abierto Toda la Noche', building: 'lu-abierto', street: 'luna', pre: 'LUABIERTO', ambient: '#f4f1e6', catalog: 'supermarket-till',
    props: [...many('fridge', [[2, 2], [3, 2]]), at('shelf', 6, 2), ...many('gondola', [[4, 5], [5, 5]]), at('produce', 12, 3), at('tube-light', 6, 4), at('neon', 8, 1)],
    browse: [[2, 3, 'up'], [6, 3, 'up'], [4, 6, 'up'], [11, 3, 'right']],
    inspects: [{ tx: 9, ty: 2, name: 'Cartel a mano', lines: ['«Hielo, pan de ayer y paciencia. Abierto hasta las 4». Debajo, otra letra: «la paciencia no se vende».'] }],
  }),
];

const night = (role: string, label: string, said: string, weight: number, party: readonly [number, number]): VisitorRole => ({
  role, label, line: said, weight, party,
  plan: [
    { state: 'ORDER', points: ['LUBAR_COUNTER_'], minutes: [2, 4] },
    { state: 'DRINK', points: ['LUBAR_TABLE_', 'LUBAR_STOOL_', 'LUBAR_COUNTER_'], minutes: [30, 55] },
    { state: 'TALK', points: ['LUBAR_TABLE_'], minutes: [15, 30], chance: 0.5 },
    { state: 'ORDER', points: ['LUBAR_COUNTER_'], minutes: [2, 4], chance: 0.6 },
    { state: 'DRINK', points: ['LUBAR_TABLE_', 'LUBAR_STOOL_'], minutes: [20, 40], chance: 0.6 },
  ],
});

export const LU_PROFILES: readonly PopulationProfile[] = [
  {
    place: 'lu-abierto', bands: [[17, 21, 'LOW'], [21, 24, 'MEDIUM'], [0, 4, 'MEDIUM']],
    weekday: [0, 0, 0, 0, 1, 1, 0], maxVisitors: 5,
    staff: [cashier('LUABIERTO', 'Abierto Toda la Noche', 'La bolsa son diez céntimos. A estas horas, te la regalo.')],
    visitors: [customer('LUABIERTO', 'Hielo y patatas, que los invitados no avisan.', 1, { party: [1, 2] })],
  },
  {
    place: 'lu-bar',
    bands: [[18, 20, 'LOW'], [20, 23, 'MEDIUM'], [23, 24, 'HIGH'], [0, 2.5, 'HIGH'], [2.5, 3, 'LOW']],
    weekday: [0, 0, 0, 0, 1, 2, 1],
    maxVisitors: 12,
    drinks: ['beer', 'beer', 'beer', 'beer', 'wine', 'soft', 'water'],
    // Los tres puestos por su id: el lugar tiene `why` y scripts/check-places busca cada uno tal cual, sin prefijo.
    staff: [{ service: 'barkeeper', label: 'Camarero', line: 'Aquí la música la elige quien friega. Hoy friego yo.', look: 'uniforme-sala', points: ['LUBAR_STAFF_01', 'LUBAR_STAFF_02', 'LUBAR_STAFF_03'], offers: 'bar-luna' }],
    visitors: [
      night('regular', 'Parroquiano', 'Vivo encima. Si bajo, por lo menos no oigo el bar desde la cama.', 2, [1, 2]),
      night('friends', 'Cliente', 'La última y nos vamos. Eso dijimos hace dos.', 3, [2, 4]),
    ],
  },
];
