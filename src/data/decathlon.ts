import type { LocationDef } from '../types/game.ts';
import type { PopulationProfile, StaffRole } from './population.ts';
import { at, many } from './interiors.ts';
import { cashier, customer, shopRoom } from './cuatroRiosVenues.ts';

/**
 * Decathlon · Polígono Norte por dentro (Alpha-07). El sitio sigue sin mapa de calle: se llega en metro al menú de la
 * parada (data/activities OFF_MAP_PLACES, `store`) y desde ahí se entra; la puerta vuelve a ese menú (`offMap`), donde
 * está el metro de vuelta. Su puerta apunta a la estación de al lado (Ribera Norte) sólo para que la agenda calcule el
 * camino y la gente tenga por dónde irse.
 *
 * Quien trabaja aquí lleva el chaleco azul (data/npcs.ts, `decathlon_employee*`): cada cual con su pelo, su piel y su
 * camiseta debajo. El jugador con contrato se lo pone en su turno (data/jobs.ts `uniform`, systems/Jobs.onShift) y
 * ficha en la sala de personal.
 */
const P = 'DECAT';

export const DECATHLON_STORE: LocationDef = {
  ...shopRoom({
    id: 'decathlon-tienda', name: 'Decathlon · Polígono Norte', building: 'decathlon-tienda', pre: P, ambient: '#eef6ff',
    props: [
      // Montaña al fondo a la izquierda, running en la pared, ciclismo en el centro; luz de nave.
      at('mannequin', 2, 1), at('wall-shelf', 3, 1), at('sneaker-wall', 6, 1), at('sneaker-wall', 7, 1),
      ...many('clothes-rack', [[2, 4], [5, 4]]), ...many('display-table', [[8, 4], [4, 7]]), at('mirror', 12, 1),
      ...many('tube-light', [[4, 2], [9, 2]]),
    ],
    browse: [[2, 2, 'up'], [6, 2, 'up'], [2, 5, 'up'], [5, 5, 'up'], [8, 5, 'up'], [4, 8, 'up']],
    inspects: [
      { tx: 2, ty: 2, name: 'Montaña', lines: ['Tiendas de campaña montadas, mochilas colgadas por litros y un cartel: «Prueba la tienda: se monta en dos segundos». Tú tardas veinte.'] },
      { tx: 6, ty: 2, name: 'Running', lines: ['Una pared entera de zapatillas, ordenadas por pisada. Alguien ha dejado una sola, sin su pareja, en la balda de abajo.'] },
      { tx: 8, ty: 5, name: 'Ciclismo', lines: ['Cascos, cámaras de repuesto y una bici de montaña colgada del techo con el precio dado la vuelta.'] },
    ],
  }),
  // Vuelve al menú de la parada (no a una calle): ahí está el metro. `to` es la estación de al lado, para la agenda.
  portals: [{ id: 'exit', tx: 7, ty: 9, label: 'Salir al aparcamiento', to: { location: 'ribera-station', spawn: 'train' }, offMap: 'decathlon' }],
  workplace: 'decathlon',
  spots: [{ tx: 12, ty: 3, name: 'Fichaje · sala de personal', activities: [], job: 'decathlon' }],
};

/** Cada uno con su chaleco y su aspecto: nadie es igual al de al lado. */
const floor = (look: string, label: string, line: string): StaffRole => ({ service: 'shop-worker', label, line, look, points: [`${P}_BROWSE_`] });

export const DECATHLON_PROFILE: PopulationProfile = {
  place: 'decathlon-tienda',
  bands: [[9, 11, 'LOW'], [11, 14, 'MEDIUM'], [14, 17, 'LOW'], [17, 21, 'HIGH']],
  weekday: [0, 0, 0, 0, 1, 2, -9],
  maxVisitors: 8,
  staff: [
    cashier(P, 'Caja', '¿Tienes la tarjeta de socio? Si no, te la hago en un minuto.', 'decathlon_employee'),
    floor('decathlon_employee_2', 'Sección de montaña', 'Esa mochila de 40 litros es la que más vuelve: la gente se pasa de grande.'),
    floor('decathlon_employee_3', 'Sección de running', 'Si quieres, te miro la pisada en la cinta. Son dos minutos.'),
    floor('decathlon_employee_4', 'Sección de ciclismo', 'Las cámaras están al fondo. La talla la pone en el neumático.'),
    floor('decathlon_employee_5', 'Reposición', 'Perdona, que paso con el carro.'),
  ],
  visitors: [customer(P, 'Venía a por calcetines y me llevo una tienda de campaña.', 2, { party: [1, 3] }), customer(P, '¿Esto lo tenéis en otro color?', 1)],
};
