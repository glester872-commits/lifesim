import type { LocationDef } from '../types/game.ts';
import type { PopulationProfile } from './population.ts';
import { CAFE_RIO, at, many } from './interiors.ts';
import { cashier, customer, shopRoom } from './cuatroRiosVenues.ts';
import { rebased } from './velariaVenues.ts';

/** El Café Campo Alto: la planta del Café del Río (como el Café del Córner del Arena), con la barra de siempre. */
const CAFE: LocationDef = {
  ...rebased(CAFE_RIO, 'CAFE_RIO_', 'CACAFE_'),
  id: 'ca-cafe',
  name: 'Café Campo Alto',
  ambient: '#fff0dc',
  portals: [{ id: 'exit', tx: 7, ty: 8, label: 'Salir a la calle', to: { location: 'campo-alto', spawn: 'ca-cafe' } }],
  spawns: { entry: { tx: 7, ty: 7, facing: 'up' } },
  terminals: [{ tx: 3, ty: 4, name: 'Barra · Café Campo Alto', catalog: 'cafe-counter' }],
  inspects: [{ tx: 1, ty: 2, name: 'Pizarra', lines: ['«Café y tostada». Debajo: «Los sábados, tras el partido del parque, invita el que pierde».'] }],
};

/**
 * CA-03 · Taller Biciclo: la planta de tienda pequeña de Cuatro Ríos, como el Anticuario Ventura del Casco. Sólo vende
 * accesorios y algo para la ruta; no hay mostrador de reparaciones ni bicis a la venta (no existe bici propia).
 */
const TALLER: LocationDef = shopRoom({
  id: 'ca-taller', name: 'Taller Biciclo', building: 'ca-taller', street: 'campo-alto', pre: 'CATALLER', ambient: '#f2ead8', catalog: 'ca-taller-mostrador',
  // Tres expositores de bicis (sólo colisiona su fila base), dos bicis en espera junto al mostrador, accesorios en la pared.
  props: [...many('bike-stand', [[2, 4], [5, 4], [2, 7]]), ...many('bike', [[12, 5], [12, 7]]), ...many('wall-shelf', [[2, 1], [5, 1]]), ...many('display-table', [[8, 3], [9, 3]]), at('crates', 12, 3)],
  browse: [[3, 5, 'up'], [6, 5, 'up'], [3, 8, 'up'], [8, 4, 'up']],
  inspects: [{ tx: 6, ty: 2, name: 'Pizarra del taller', lines: ['Timbres, luces y agua para la ruta. Reparaciones, todavía no: el taller está en obras.', 'Las bicis de la exposición son del taller: de momento no se venden.'] }],
});

export const CA_INTERIORS: readonly LocationDef[] = [CAFE, TALLER];

export const CA_PROFILES: readonly PopulationProfile[] = [
  {
    place: 'ca-cafe', bands: [[7.5, 10.5, 'MEDIUM'], [10.5, 13, 'LOW'], [13, 16, 'MEDIUM'], [16, 20, 'LOW'], [20, 21, 'LOW']],
    weekday: [0, 0, 0, 0, 0, 1, 0], maxVisitors: 6,
    staff: [{ service: 'bartender', label: 'Barra · Café Campo Alto', line: 'Café, tostada y la previa del partido del parque. Por ese orden.', look: 'uniforme-sala', points: ['CACAFE_STAFF'] }],
    visitors: [
      {
        role: 'customer', label: 'Cliente', line: 'Un cortado, que vengo de correr por el parque.', weight: 3, party: [1, 2],
        plan: [
          { state: 'ORDER', points: ['CACAFE_COUNTER', 'CACAFE_QUEUE_'], minutes: [1, 3] },
          { state: 'DRINK', points: ['CACAFE_TABLE_'], minutes: [10, 30] },
        ],
      },
      {
        role: 'takeaway', label: 'Alguien con prisa', line: 'Para llevar, que se me escapa el metro.', weight: 2, hours: [7.5, 10.5],
        plan: [{ state: 'ORDER', points: ['CACAFE_COUNTER', 'CACAFE_QUEUE_'], minutes: [1, 2] }],
      },
    ],
  },
  {
    // CA-03 · de lunes a sábado (data/places.ts); el domingo, cerrado y vacío.
    place: 'ca-taller', bands: [[10, 13, 'LOW'], [13, 17, 'LOW'], [17, 20, 'MEDIUM']],
    weekday: [0, 0, 0, 0, 0, 1, -2], maxVisitors: 4,
    staff: [cashier('CATALLER', 'Taller Biciclo', 'Pasa, pasa. Hoy sólo vendo: las reparaciones, cuando acabe de ordenar el taller.')],
    visitors: [customer('CATALLER', 'Un timbre, que el mío suena a lata.', 1)],
  },
];
