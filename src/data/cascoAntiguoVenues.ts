import type { LocationDef } from '../types/game.ts';
import type { PopulationProfile } from './population.ts';
import { CAFE_RIO, many } from './interiors.ts';
import { cashier, customer, shopRoom } from './cuatroRiosVenues.ts';
import { rebased } from './velariaVenues.ts';

/**
 * CAS-06 · Taberna La Lonja: la planta del Café del Río, como el Café Campo Alto (data/campoAltoVenues.ts), con su
 * barra de tapas y tres mesas con sillas (asientos de verdad: data/seating.ts, para el jugador y para la gente).
 */
const TABERNA: LocationDef = {
  ...rebased(CAFE_RIO, 'CAFE_RIO_', 'CASTAB_'),
  id: 'cas-taberna',
  name: 'Taberna La Lonja',
  ambient: '#ffe6c4',
  portals: [{ id: 'exit', tx: 7, ty: 8, label: 'Salir a la Calle Mayor', to: { location: 'casco-antiguo', spawn: 'cas-cafe' } }],
  spawns: { entry: { tx: 7, ty: 7, facing: 'up' } },
  terminals: [{ tx: 3, ty: 4, name: 'Barra · Taberna La Lonja', catalog: 'cas-taberna-tapas' }],
  inspects: [{ tx: 1, ty: 2, name: 'Pizarra', lines: ['«Tapas del día». Debajo, con otra tiza: «Domingo de Rastro: abrimos a la una, con los puestos todavía en plena venta».'] }],
};

/** La frutería del mercado del Casco Antiguo: la planta de tienda pequeña de Cuatro Ríos, que sale a la Calle Mayor. */
export const CAS_INTERIORS: readonly LocationDef[] = [
  shopRoom({
    id: 'cas-fruteria', name: 'Mercado · Frutas del Casco', building: 'cas-fruteria', street: 'casco-antiguo', pre: 'CASFRUTA', ambient: '#fff4e2', catalog: 'fruteria-counter',
    props: [...many('produce', [[2, 3], [3, 3], [4, 3], [7, 3], [8, 3], [9, 3]]), ...many('crates', [[2, 6], [3, 6], [12, 3]])],
    browse: [[3, 4, 'up'], [8, 4, 'up'], [4, 6, 'left']],
    inspects: [{ tx: 6, ty: 2, name: 'Pizarra del puesto', lines: ['Tomate de huerta, pera de agua, acelga, ajos tiernos y uva de mesa. «Lo que no se vende hoy, mañana va a la caja del euro».'] }],
  }),
  // CAS-06b · Anticuario Ventura: la misma planta, con estanterías, una mesa expositora y cajas de discos y libros.
  shopRoom({
    id: 'cas-anticuario', name: 'Anticuario Ventura', building: 'cas-rastro-3', street: 'casco-antiguo', pre: 'CASANT', ambient: '#f6e2c0', catalog: 'cas-anticuario-mostrador',
    props: [...many('shelf', [[2, 3], [3, 3], [4, 3]]), ...many('display-table', [[8, 3], [9, 3]]), ...many('crates', [[2, 6], [3, 6], [12, 3]])],
    browse: [[3, 4, 'up'], [8, 4, 'up'], [4, 6, 'left']],
    inspects: [{ tx: 6, ty: 2, name: 'Vitrina', lines: ['Relojes parados, un tintero y una nota: «De lunes a sábado. Los domingos estoy en el Rastro, pero sin prisa».'] }],
  }),
  TABERNA,
];

export const CAS_PROFILES: readonly PopulationProfile[] = [
  {
    place: 'cas-fruteria', bands: [[8, 10, 'HIGH'], [10, 13, 'HIGH'], [13, 17, 'LOW'], [17, 20, 'MEDIUM'], [20, 21, 'LOW']],
    weekday: [0, 0, 0, 0, 0, 1, -1], maxVisitors: 5,
    staff: [cashier('CASFRUTA', 'Frutas del Casco', 'Esto lo ha traído mi primo esta mañana del huerto. Huele, huele.')],
    visitors: [customer('CASFRUTA', 'Medio de tomates, que sean feos, que son los buenos.', 1, { party: [1, 2] })],
  },
  {
    // De lunes a sábado (data/places.ts); el domingo, cerrado y vacío.
    place: 'cas-anticuario', bands: [[10, 13, 'LOW'], [13, 17, 'LOW'], [17, 20, 'MEDIUM']],
    weekday: [0, 0, 0, 0, 0, 1, -2], maxVisitors: 4,
    staff: [cashier('CASANT', 'Anticuario Ventura', 'Mire sin prisa. Lo que no es antiguo, es de segunda mano; que no es lo mismo.')],
    visitors: [customer('CASANT', 'Busco una novela que no me haya leído nadie.', 1)],
  },
  {
    // El perfil del Café Campo Alto, a horas de taberna: el vermú del domingo, después del Rastro, es lo más lleno.
    place: 'cas-taberna', bands: [[12, 14, 'MEDIUM'], [14, 16, 'HIGH'], [16, 20, 'LOW'], [20, 23, 'MEDIUM'], [23, 24, 'LOW']],
    weekday: [0, 0, 0, 0, 1, 1, 1], maxVisitors: 6,
    staff: [{ service: 'bartender', label: 'Barra · Taberna La Lonja', line: 'Hoy hay tortilla recién hecha. Y bravas, que pican lo justo.', look: 'uniforme-sala', points: ['CASTAB_STAFF'] }],
    visitors: [
      {
        role: 'customer', label: 'Cliente', line: 'Una caña y lo que salga de la cocina.', weight: 3, party: [1, 3],
        plan: [
          { state: 'ORDER', points: ['CASTAB_COUNTER', 'CASTAB_QUEUE_'], minutes: [1, 3] },
          { state: 'DRINK', points: ['CASTAB_TABLE_'], minutes: [15, 40] },
        ],
      },
    ],
  },
];
