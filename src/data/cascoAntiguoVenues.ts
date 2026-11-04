import type { LocationDef } from '../types/game.ts';
import type { PopulationProfile } from './population.ts';
import { many } from './interiors.ts';
import { cashier, customer, shopRoom } from './cuatroRiosVenues.ts';

/** La frutería del mercado del Casco Antiguo: la planta de tienda pequeña de Cuatro Ríos, que sale a la Calle Mayor. */
export const CAS_INTERIORS: readonly LocationDef[] = [
  shopRoom({
    id: 'cas-fruteria', name: 'Mercado · Frutas del Casco', building: 'cas-fruteria', street: 'casco-antiguo', pre: 'CASFRUTA', ambient: '#fff4e2', catalog: 'fruteria-counter',
    props: [...many('produce', [[2, 3], [3, 3], [4, 3], [7, 3], [8, 3], [9, 3]]), ...many('crates', [[2, 6], [3, 6], [12, 3]])],
    browse: [[3, 4, 'up'], [8, 4, 'up'], [4, 6, 'left']],
    inspects: [{ tx: 6, ty: 2, name: 'Pizarra del puesto', lines: ['Tomate de huerta, pera de agua, acelga, ajos tiernos y uva de mesa. «Lo que no se vende hoy, mañana va a la caja del euro».'] }],
  }),
];

export const CAS_PROFILES: readonly PopulationProfile[] = [
  {
    place: 'cas-fruteria', bands: [[8, 10, 'HIGH'], [10, 13, 'HIGH'], [13, 17, 'LOW'], [17, 20, 'MEDIUM'], [20, 21, 'LOW']],
    weekday: [0, 0, 0, 0, 0, 1, -1], maxVisitors: 5,
    staff: [cashier('CASFRUTA', 'Frutas del Casco', 'Esto lo ha traído mi primo esta mañana del huerto. Huele, huele.')],
    visitors: [customer('CASFRUTA', 'Medio de tomates, que sean feos, que son los buenos.', 1, { party: [1, 2] })],
  },
];
