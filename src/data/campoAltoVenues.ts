import type { LocationDef } from '../types/game.ts';
import type { PopulationProfile } from './population.ts';
import { CAFE_RIO } from './interiors.ts';
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

export const CA_INTERIORS: readonly LocationDef[] = [CAFE];

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
];
