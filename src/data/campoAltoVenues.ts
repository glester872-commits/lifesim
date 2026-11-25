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
 * accesorios, algo para la ruta y una bicicleta de ciudad (VID-01; BIKE-01: aparece aparcada delante de casa y se monta); no hay
 * mostrador de reparaciones.
 */
const TALLER: LocationDef = shopRoom({
  id: 'ca-taller', name: 'Taller Biciclo', building: 'ca-taller', street: 'campo-alto', pre: 'CATALLER', ambient: '#f2ead8', catalog: 'ca-taller-mostrador',
  // Tres expositores de bicis (sólo colisiona su fila base), dos bicis en espera junto al mostrador, accesorios en la pared.
  props: [...many('bike-stand', [[2, 4], [5, 4], [2, 7]]), ...many('bike', [[12, 5], [12, 7]]), ...many('wall-shelf', [[2, 1], [5, 1]]), ...many('display-table', [[8, 3], [9, 3]]), at('crates', 12, 3)],
  browse: [[3, 5, 'up'], [6, 5, 'up'], [3, 8, 'up'], [8, 4, 'up']],
  inspects: [{ tx: 6, ty: 2, name: 'Pizarra del taller', lines: ['Timbres, luces y agua para la ruta. Reparaciones, todavía no: el taller está en obras.', 'Se vende bicicleta de ciudad: pregunta en el mostrador.'] }],
});

/** CA-04 · Panadería Cuatro Hornos: la planta de La Espiga (Cuatro Ríos), con su mostrador de barrio. */
const PANADERIA: LocationDef = shopRoom({
  id: 'ca-panaderia', name: 'Panadería Cuatro Hornos', building: 'ca-panaderia', street: 'campo-alto', pre: 'CAPAN', ambient: '#ffe9cc', catalog: 'ca-panaderia-mostrador',
  // Una pared de pan (sólo colisiona la fila 2), dos vitrinas de bollería junto a la caja y la cafetera detrás.
  props: [...many('bread-rack', [[2, 2], [3, 2], [4, 2], [5, 2], [6, 2]]), ...many('pastry-case', [[8, 7], [9, 7]]), at('espresso', 12, 6), at('chalkboard', 9, 1), at('plant', 1, 8)],
  browse: [[2, 3, 'up'], [4, 3, 'up'], [6, 3, 'up']],
  inspects: [{ tx: 9, ty: 2, name: 'Pizarra', lines: ['Barra, hogaza y bollería. Abrimos a las siete y cerramos a las dos.'] }],
});

/** LOC-01 · Ultramarinos Esquina: ultramarinos de barrio moderno, en la planta de tienda pequeña con la caja del súper. */
const ULTRAMARINOS: LocationDef = shopRoom({
  id: 'ca-ultramarinos', name: 'Ultramarinos Esquina', building: 'ca-ultramarinos', street: 'campo-alto', pre: 'CAULTRA', ambient: '#f4f1e6', catalog: 'supermarket-till',
  // Tres neveras al fondo, dos estanterías de despensa (latas y tarros), una góndola en medio y fruta a los lados.
  props: [...many('fridge', [[2, 2], [3, 2], [4, 2]]), ...many('pantry-shelf', [[6, 2], [8, 2]]), ...many('gondola', [[4, 5], [5, 5]]), ...many('produce', [[2, 7], [3, 7]]), at('produce', 12, 3), at('tube-light', 6, 4)],
  browse: [[2, 3, 'up'], [6, 3, 'up'], [4, 6, 'up'], [11, 3, 'right']],
  inspects: [{ tx: 9, ty: 2, name: 'Cartel a mano', lines: ['«De 9 a 21. Domingos, de 10 a 14». Debajo: «Se fía sólo a los del portal».'] }],
});

export const CA_INTERIORS: readonly LocationDef[] = [CAFE, TALLER, PANADERIA, ULTRAMARINOS];

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
  {
    // CA-04 · de 7 a 14 (el domingo, de 8 a 13; data/places.ts): la cola, a primera hora.
    place: 'ca-panaderia', bands: [[7, 9.5, 'HIGH'], [9.5, 12, 'MEDIUM'], [12, 14, 'LOW']],
    weekday: [0, 0, 0, 0, 0, 1, 0], maxVisitors: 5,
    staff: [cashier('CAPAN', 'Cuatro Hornos', 'La de centeno sale a las ocho y media.')],
    visitors: [
      customer('CAPAN', 'Una barra y dos cruasanes, que vienen los nietos.', 2),
      customer('CAPAN', 'Si queda de la trenza, me la guardas.', 1),
    ],
  },
  {
    // LOC-01 · de 9 a 21 (el domingo, de 10 a 14; data/places.ts): la compra de diario, más por la tarde.
    place: 'ca-ultramarinos', bands: [[9, 12, 'LOW'], [12, 17, 'LOW'], [17, 21, 'MEDIUM']],
    weekday: [0, 0, 0, 0, 0, 1, 0], maxVisitors: 4,
    staff: [cashier('CAULTRA', 'Ultramarinos Esquina', 'Leche, huevos y lo que se te haya olvidado. Aquí hay de todo, en pequeño.')],
    visitors: [customer('CAULTRA', 'Sólo bajaba a por leche. Y ya que estoy, la cena.', 2)],
  },
];
