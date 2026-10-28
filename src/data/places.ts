/**
 * Lugares del barrio con id estable: a esto se atarán los personajes
 * (npcId → residenceId, npcId → workplaceId) y los eventos (eventId → placeId).
 *
 * Aquí sólo va lo que no se puede deducir: el tipo, las etiquetas, el aforo y
 * el horario. Entradas, salidas y destinos salen de los edificios y los puntos
 * que ya existen (systems/Places.ts), así que no pueden desincronizarse.
 */

export type PlaceType = 'home' | 'residence' | 'business' | 'transit' | 'public';

export interface PlaceDef {
  id: string;
  name: string;
  type: PlaceType;
  tags: readonly string[];
  /** Edificio del barrio cuya puerta es la entrada (data/vallesco.ts). */
  building?: string;
  /** Puntos de la calle que también son del lugar: la plaza, la terraza de un café. */
  anchors?: readonly string[];
  /** Interior sin puerta en ninguna calle (se llega en metro): su localización, que hace de entrada y salida. */
  interior?: string;
  /** Personas a la vez: vecinos de un portal, aforo de un local. */
  capacity: number;
  /**
   * [abre, cierra] en horas; si cierra antes de abrir, pasa de medianoche. Con
   * interior, fuera de horario la puerta está cerrada y no entra nadie.
   */
  hours?: readonly [number, number];
  /** Días que abre (0 lunes … 6 domingo), contados por el día en que abre: el sábado a las 03:00 es la noche del viernes. */
  days?: readonly number[];
  /**
   * Horario propio de algunos días, por encima de `hours`/`days`: otro horario
   * o 'closed'. Necesita `hours` (el de los demás días). El sábado que cierra
   * más tarde, el domingo que no abre (systems/Places.hoursOn).
   */
  hoursByDay?: Readonly<Partial<Record<import('../systems/Calendar.ts').Weekday, readonly [number, number] | 'closed'>>>;
  /**
   * Por qué entraría el jugador: lo que se consigue dentro que no se consigue
   * fuera. Un sitio con interior y con `why` tiene que cumplirlo (algo que
   * comprar o hacer, personal, gente según la hora): lo comprueba
   * scripts/check-places.ts. Sin `why`, el sitio está pendiente.
   */
  why?: string;
}

const WORK = 'work';

export const PLACES: readonly PlaceDef[] = [
  // Viviendas: la tuya y los portales que pueden tener vecinos persistentes.
  { id: 'player-home', name: 'Tu piso · Olmo 7', type: 'home', tags: ['home'], building: 'home-door', capacity: 2, why: 'Dormir, cocinar, ducharse, ver la tele y cambiarse de ropa: recuperar energía sin gastar dinero.' },
  { id: 'res-mayor-3', name: 'Mayor 3', type: 'residence', tags: ['home'], building: 'res-mayor-3', capacity: 9 },
  { id: 'res-mayor-9', name: 'Mayor 9', type: 'residence', tags: ['home'], building: 'res-mayor-9', capacity: 6 },
  { id: 'res-olmo-3', name: 'Olmo 3', type: 'residence', tags: ['home'], building: 'res-olmo-3', capacity: 8 },
  { id: 'res-olmo-11', name: 'Olmo 11', type: 'residence', tags: ['home'], building: 'res-olmo-11', capacity: 8 },
  { id: 'res-avenida-20', name: 'Avenida 20', type: 'residence', tags: ['home'], building: 'res-av-20', capacity: 12 },
  { id: 'res-mayor-15', name: 'Mayor 15', type: 'residence', tags: ['home'], building: 'res-mayor-15', capacity: 10 },
  { id: 'res-mayor-20', name: 'Mayor 20', type: 'residence', tags: ['home'], building: 'res-mayor-20', capacity: 10 },
  // La Mayor este, encima del horno, del bar y de la tienda: de aquí sale quien baja a por el pan.
  { id: 'res-mayor-17', name: 'Mayor 17', type: 'residence', tags: ['home'], building: 'res-mayor-17', capacity: 8 },
  { id: 'res-mayor-19', name: 'Mayor 19', type: 'residence', tags: ['home'], building: 'res-mayor-19', capacity: 9 },
  { id: 'res-mayor-22', name: 'Mayor 22', type: 'residence', tags: ['home'], building: 'res-mayor-22', capacity: 7 },

  // Negocios con interior
  { id: 'cafe', name: 'Cafetería Pausa', type: 'business', tags: ['food', 'social', WORK], building: 'cafe-door', anchors: ['CAFE_TERRACE_01', 'CAFE_TERRACE_02'], capacity: 10, hours: [7, 22], why: 'Desayunar algo rápido y llevarse pan o bollería para casa.' },
  { id: 'gym', name: 'Gimnasio Forja', type: 'business', tags: ['sport', 'social', WORK], building: 'gym-door', capacity: 18, hours: [6, 23] },
  { id: 'clothing-store', name: 'Hilo · moda', type: 'business', tags: ['shop', 'fashion', WORK], building: 'fashion-door', capacity: 14, hours: [10, 21], why: 'Ropa de temporada: lo que compras te lo llevas puesto y se queda en tu armario.' },
  { id: 'supermarket', name: 'Súper Rosales', type: 'business', tags: ['shop', 'food', WORK], building: 'super-door', capacity: 20, hours: [9, 22], hoursByDay: { sunday: [10, 15] }, why: 'La compra para cocinar en casa: comer por menos de lo que cuesta fuera.' },
  { id: 'restaurant', name: 'Casa Tomás', type: 'business', tags: ['food', 'social', WORK], building: 'restaurant-door', anchors: ['RESTAURANT_TERRACE_01', 'RESTAURANT_TERRACE_02'], capacity: 16, hours: [12, 24], why: 'Comer o cenar caliente sin cocinar, a cambio de dinero.' },
  { id: 'office', name: 'Edificio Atalaya', type: 'business', tags: [WORK], building: 'office-door', capacity: 20, hours: [8, 20] },
  // Jueves flojo; viernes y sábado hasta que amanece. De domingo a miércoles, persiana.
  { id: 'nightclub', name: 'Sala Órbita', type: 'business', tags: ['nightlife', 'social', WORK], building: 'club-door', anchors: ['CLUB_QUEUE_01', 'CLUB_QUEUE_02', 'CLUB_QUEUE_03', 'CLUB_SMOKE_01', 'CLUB_SMOKE_02'], capacity: 40, hours: [21, 6], days: [3, 4, 5], why: 'Bailar y tomar algo hasta tarde: la noche del barrio, con más gente cuanto más tarde.' },
  // Vinoteca pequeña y tranquila; `date`: donde irán las citas y los encuentros que vengan.
  { id: 'wine-bar', name: 'La Cepa · vinoteca', type: 'business', tags: ['nightlife', 'social', 'date', WORK], building: 'wine-bar', capacity: 18, hours: [18, 1], days: [1, 2, 3, 4, 5, 6], why: 'Una copa tranquila y algo de picar: charlar sin tener que gritar.' },

  // Calle del Carmen: ropa de segunda mano y de colección, tatuajes y café. Etiqueta 'carmen' para los viajes de la calle.
  { id: 'vintage-store', name: 'Retales · vintage', type: 'business', tags: ['shop', 'fashion', 'carmen', WORK], building: 'carmen-retales', capacity: 8, hours: [11, 21], days: [0, 1, 2, 3, 4, 5], why: 'Ropa vintage escogida, pieza a pieza: lo que compras te lo llevas puesto.' },
  { id: 'streetwear-store', name: 'Archivo · streetwear', type: 'business', tags: ['shop', 'fashion', 'carmen', WORK], building: 'carmen-archivo', capacity: 10, hours: [12, 21], days: [1, 2, 3, 4, 5, 6], why: 'Streetwear y piezas de archivo: lo que no vuelve a salir.' },
  { id: 'thrift-store', name: 'Segunda Vuelta', type: 'business', tags: ['shop', 'fashion', 'carmen', WORK], building: 'carmen-vuelta', capacity: 10, hours: [10, 20], days: [0, 1, 2, 3, 4, 5], why: 'Ropa de segunda mano a precio de saldo: vestirse distinto por pocos euros.' },
  { id: 'tattoo-studio', name: 'Tinta Carmen · tatuajes', type: 'business', tags: ['service', 'carmen', WORK], building: 'carmen-tinta', capacity: 6, hours: [12, 21], days: [1, 2, 3, 4, 5], why: 'Tatuarse: una marca que se queda para siempre y se ve según lo que lleves.' },
  { id: 'coffee-molinillo', name: 'Café Molinillo', type: 'business', tags: ['food', 'social', 'carmen', WORK], building: 'carmen-molinillo', anchors: ['MOLINILLO_TERRACE_01', 'MOLINILLO_TERRACE_02'], capacity: 8, hours: [8, 20], why: 'Un café y algo dulce en la calle más tranquila del barrio.' },
  { id: 'records-store', name: 'Discos Surco', type: 'business', tags: ['shop', 'carmen', WORK], building: 'carmen-surco', capacity: 5, hours: [17, 21], days: [1, 2, 3, 4, 5] },
  { id: 'barber-piercing', name: 'Navaja & Aro · barbería y piercing', type: 'business', tags: ['service', 'carmen', WORK], building: 'carmen-navaja', capacity: 5, hours: [11, 20.5], days: [1, 2, 3, 4, 5, 6] },
  { id: 'sneaker-store', name: 'Suela · zapatillas', type: 'business', tags: ['shop', 'fashion', 'carmen', WORK], building: 'carmen-suela', capacity: 9, hours: [11, 21], days: [1, 2, 3, 4, 5, 6] },
  // Bar pequeño de barrio: abre por la tarde-noche y de madrugada vacía la calle de sus fumadores.
  { id: 'bar-gaviota', name: 'Bar Gaviota', type: 'business', tags: ['nightlife', 'social', 'carmen', WORK], building: 'carmen-gaviota', anchors: ['GAVIOTA_SMOKE_01', 'GAVIOTA_SMOKE_02'], capacity: 24, hours: [17, 2], days: [1, 2, 3, 4, 5, 6] },

  // Negocios de fachada: se puede trabajar o comprar en ellos aunque hoy no se entre.
  { id: 'pharmacy', name: 'Farmacia', type: 'business', tags: ['shop', 'health', WORK], building: 'pharmacy', capacity: 4, hours: [9, 21], why: 'Medicinas que quitan el cansancio cuando no da tiempo a dormir.' },
  { id: 'hair-salon', name: 'Barbería Nati', type: 'business', tags: ['shop', 'service', WORK], building: 'hair', capacity: 6, hours: [10, 20], days: [0, 1, 2, 3, 4, 5], why: 'Cortarse el pelo: cambia tu aspecto y se queda así.' },
  { id: 'bank', name: 'Banco', type: 'business', tags: [WORK], building: 'bank', capacity: 4, hours: [8, 15] },
  { id: 'fruit-shop', name: 'Frutería', type: 'business', tags: ['shop', 'food', WORK], building: 'fruit', capacity: 3, hours: [8, 14] },
  { id: 'hardware-store', name: 'Ferretería', type: 'business', tags: ['shop', WORK], building: 'hardware', capacity: 3, hours: [9, 20] },
  { id: 'laundry', name: 'Lavandería', type: 'business', tags: ['service'], building: 'laundry', capacity: 6, hours: [7, 23] },
  // Calle Mayor este: lo de diario. El horno madruga, el bar abre con el primer café y cierra tarde, y la tienda es lo último abierto.
  { id: 'bakery', name: 'Horno San Blas', type: 'business', tags: ['shop', 'food', WORK], building: 'bakery', capacity: 5, hours: [7.5, 20.5], hoursByDay: { sunday: [8, 14] } },
  { id: 'corner-bar', name: 'Bar El Rincón', type: 'business', tags: ['food', 'social', WORK], building: 'corner-bar', anchors: ['CORNER_BAR_SMOKE_01', 'CORNER_BAR_SMOKE_02'], capacity: 20, hours: [7.5, 1] },
  { id: 'grocer', name: 'Alimentación Mari', type: 'business', tags: ['shop', 'food', WORK], building: 'grocer', capacity: 4, hours: [9, 1] },
  { id: 'study-center', name: 'Centro de estudios', type: 'business', tags: ['study', WORK], building: 'study', capacity: 40, hours: [8, 21] },
  { id: 'civic-office', name: 'Junta municipal', type: 'business', tags: ['civic', WORK], building: 'civic', capacity: 10, hours: [9, 14] },

  // La iglesia de la plaza (CV-05): visita libre en su horario y, los domingos de 12:00 a 13:30, el ensayo abierto del coro (data/parish.ts).
  { id: 'parish', name: 'Parroquia de San Blas', type: 'public', tags: ['social', 'quiet'], building: 'parish-door', capacity: 30, hours: [9, 20.5], why: 'Sentarse un rato en silencio y, los domingos a mediodía, cantar con el coro del barrio.' },

  // Transporte y espacio público
  { id: 'metro-vallesco', name: 'Metro · Vallesco', type: 'transit', tags: ['transit'], building: 'metro-door', anchors: ['METRO_PLAZUELA_BENCH'], capacity: 60 },
  { id: 'bus-stop', name: 'Parada de la avenida', type: 'transit', tags: ['transit'], anchors: ['BUS_STOP'], capacity: 8 },
  { id: 'plaza', name: 'Plaza de la Fuente', type: 'public', tags: ['social', 'outdoor'], anchors: ['PLAZA_FOUNTAIN', 'PLAZA_BENCH_01', 'PLAZA_BENCH_02', 'PLAZA_BENCH_03', 'PLAZA_BENCH_04', 'NEWS_KIOSK'], capacity: 30 },
  { id: 'park', name: 'Parque del Olmo', type: 'public', tags: ['social', 'sport', 'outdoor'], anchors: ['PARK_BENCH_01', 'PARK_BENCH_02', 'PARK_COURT'], capacity: 25 },

  // Ribera Norte: el barrio del canal. Vivienda moderna arriba, ocio, terrazas y deporte abajo.
  { id: 'res-ribera-1', name: 'Ribera 1', type: 'residence', tags: ['home'], building: 'ribera-res-1', capacity: 14 },
  { id: 'res-ribera-2', name: 'Ribera 2', type: 'residence', tags: ['home'], building: 'ribera-res-2', capacity: 14 },
  { id: 'bar-ribera', name: 'Bar Ribera', type: 'business', tags: ['food', 'social', 'nightlife', WORK], building: 'bar-door', anchors: ['RB_BAR_TERRACE_01', 'RB_BAR_TERRACE_02'], capacity: 16, hours: [11, 2] },
  {
    id: 'arcade', name: 'Salón Recreativo Nova', type: 'business', tags: ['leisure', 'social', 'game', WORK], building: 'ribera-arcade', capacity: 22, hours: [12, 24],
    why: 'Echar unas partidas: lucha, carreras, ritmo y pinzas, a unas monedas la partida. Sin premios en dinero.',
  },
  { id: 'colmado', name: 'Colmado Ribera', type: 'business', tags: ['shop', 'food', WORK], building: 'ribera-colmado', capacity: 6, hours: [8, 24] },
  { id: 'sports-store', name: 'Ribera Sport', type: 'business', tags: ['shop', 'sport', WORK], building: 'ribera-sports', capacity: 8, hours: [10, 21], days: [0, 1, 2, 3, 4, 5] },
  { id: 'cafe-rio', name: 'Café del Río', type: 'business', tags: ['food', 'social', WORK], building: 'ribera-cafe', anchors: ['RB_CAFE_TERRACE_01', 'RB_CAFE_TERRACE_02'], capacity: 12, hours: [8, 22] },
  { id: 'casa-mar', name: 'Casa Mar', type: 'business', tags: ['food', 'social', WORK], building: 'ribera-casamar', anchors: ['RB_CASAMAR_TERRACE_01', 'RB_CASAMAR_TERRACE_02'], capacity: 18, hours: [12, 24] },
  { id: 'heladeria', name: 'Heladería del Muelle', type: 'business', tags: ['food', 'shop'], anchors: ['RB_ICE_CREAM_01', 'RB_ICE_CREAM_02'], capacity: 6, hours: [11, 23] },
  { id: 'metro-ribera', name: 'Metro · Ribera Norte', type: 'transit', tags: ['transit'], anchors: ['RB_METRO_FRONT'], capacity: 40 },
  { id: 'paseo-ribera', name: 'Paseo de la Ribera', type: 'public', tags: ['social', 'sport', 'outdoor'], anchors: ['RB_BENCH_01', 'RB_BENCH_02', 'RB_BENCH_03', 'RB_BENCH_04', 'RB_BENCH_05', 'RB_BENCH_06', 'RB_BENCH_07', 'RB_BENCH_08', 'RB_BENCH_09', 'RB_BENCH_10', 'RB_VIEW_01', 'RB_VIEW_02', 'RB_VIEW_03', 'RB_VIEW_04', 'RB_SKATE_WATCH_01', 'RB_SKATE_WATCH_02'], capacity: 60 },
  { id: 'zona-deportiva', name: 'Pista y calistenia', type: 'public', tags: ['sport', 'social', 'outdoor'], anchors: ['HOOPS_01', 'HOOPS_02', 'HOOPS_03', 'HOOPS_04', 'PULLUP_01', 'PULLUP_02', 'PULLUP_03', 'PULLUP_04', 'CALI_MAT_01', 'CALI_MAT_02', 'RB_COURT_REST_01', 'RB_COURT_REST_02'], capacity: 24 },

  // Cuatro Ríos: ciudad densa de diario. Mucho portal, comercio que abre temprano y cierra tarde, metro y autobús.
  { id: 'res-cr-1', name: 'Avenida de los Ríos 2', type: 'residence', tags: ['home'], building: 'cr-res-1', capacity: 16 },
  { id: 'res-cr-2', name: 'Avenida de los Ríos 9', type: 'residence', tags: ['home'], building: 'cr-res-2', capacity: 16 },
  { id: 'res-cr-af-1', name: 'Afluente 1', type: 'residence', tags: ['home'], building: 'cr-af-1', capacity: 14 },
  { id: 'res-cr-af-3', name: 'Afluente 3', type: 'residence', tags: ['home'], building: 'cr-af-3', capacity: 14 },
  { id: 'res-cr-af-7', name: 'Afluente 7', type: 'residence', tags: ['home'], building: 'cr-af-7', capacity: 12 },
  { id: 'res-cr-af-10', name: 'Afluente 10', type: 'residence', tags: ['home'], building: 'cr-af-10', capacity: 14 },
  { id: 'res-cr-af-12', name: 'Afluente 12', type: 'residence', tags: ['home'], building: 'cr-af-12', capacity: 12 },
  { id: 'res-cr-af-14', name: 'Afluente 14', type: 'residence', tags: ['home'], building: 'cr-af-14', capacity: 12 },
  { id: 'res-cr-af-16', name: 'Afluente 16', type: 'residence', tags: ['home'], building: 'cr-af-16', capacity: 14 },
  { id: 'cr-super', name: 'Supermercado Cuatro Ríos', type: 'business', tags: ['shop', 'food', WORK], building: 'cr-super', capacity: 16, hours: [8.5, 22], hoursByDay: { sunday: [10, 15] }, why: 'La compra para cocinar en casa, en el súper de la avenida.' },
  { id: 'cr-abierto', name: 'Abierto Hasta Tarde', type: 'business', tags: ['shop', 'food', WORK], building: 'cr-abierto', capacity: 5, hours: [8, 2], why: 'Lo que falta a última hora: pan, agua y algo de comer hasta las dos.' },
  { id: 'cr-fruteria', name: 'Frutas Dos Orillas', type: 'business', tags: ['shop', 'food', WORK], building: 'cr-fruteria', capacity: 5, hours: [8, 21], hoursByDay: { sunday: [9, 14] }, why: 'Fruta del día y verdura para cocinar, más barata que en el súper.' },
  { id: 'cr-panaderia', name: 'Panadería La Espiga', type: 'business', tags: ['shop', 'food', WORK], building: 'cr-panaderia', capacity: 6, hours: [7, 21], why: 'Pan, bollería y café para llevar camino del metro.' },
  { id: 'cr-conecta', name: 'Conecta · móviles', type: 'business', tags: ['shop', 'service', WORK], building: 'cr-conecta', capacity: 4, hours: [10, 21.5], days: [0, 1, 2, 3, 4, 5], why: 'Recargar o sacar la tarjeta de transporte sin bajar al metro, y algo de beber.' },
  { id: 'cr-farmacia', name: 'Farmacia del Cruce', type: 'business', tags: ['shop', 'health', WORK], building: 'cr-farmacia', capacity: 4, hours: [9, 22], why: 'Medicinas que quitan el cansancio cuando no da tiempo a dormir.' },
  { id: 'cr-hilvana', name: 'Hilvana · moda', type: 'business', tags: ['shop', 'fashion', WORK], building: 'cr-hilvana', capacity: 6, hours: [10, 21], days: [0, 1, 2, 3, 4, 5], why: 'Ropa de diario a precio de barrio: lo que compras te lo llevas puesto.' },
  { id: 'cr-ambar', name: 'Ámbar · calle y deporte', type: 'business', tags: ['shop', 'fashion', 'sport', WORK], building: 'cr-ambar', capacity: 6, hours: [10.5, 21], days: [0, 1, 2, 3, 4, 5], why: 'Chándal, camisetas y zapatillas: ropa de calle que te llevas puesta.' },
  { id: 'cr-barberia', name: 'Barbería del Cruce', type: 'business', tags: ['shop', 'service', WORK], building: 'cr-barberia', capacity: 6, hours: [9.5, 20.5], days: [0, 1, 2, 3, 4, 5], why: 'Cortarse el pelo: cambia tu aspecto y se queda así.' },
  { id: 'cr-gym', name: 'Gimnasio Barrio Fit', type: 'business', tags: ['sport', 'social', WORK], building: 'cr-gym', capacity: 12, hours: [6.5, 23] },
  {
    id: 'cr-arcade', name: 'Recreativos Delta', type: 'business', tags: ['leisure', 'social', 'game', WORK], building: 'cr-arcade', capacity: 22, hours: [11, 24],
    why: 'Echar unas partidas: lucha, carreras, ritmo y pinzas, a unas monedas la partida. Sin premios en dinero.',
  },
  { id: 'pizzeria-roma', name: 'Pizzería Roma', type: 'business', tags: ['food', 'social', WORK], building: 'cr-pizzeria', capacity: 20, hours: [12, 24], why: 'Pizza en mesa o para llevar: comer caliente sin cocinar.' },
  { id: 'burger-norte', name: 'Burger Norte', type: 'business', tags: ['food', 'social', WORK], building: 'cr-burger', capacity: 20, hours: [11, 24], why: 'Hamburguesa rápida en mesa o para llevar.' },
  { id: 'sushi-nori', name: 'Sushi Nori', type: 'business', tags: ['food', 'social', WORK], building: 'cr-sushi', capacity: 16, hours: [13, 24], why: 'Sushi casual en mesa o para llevar.' },
  { id: 'metro-cuatro-rios', name: 'Metro · Cuatro Ríos', type: 'transit', tags: ['transit'], building: 'cr-metro', anchors: ['CR_METRO_MEET_01', 'CR_METRO_MEET_02', 'CR_METRO_MEET_03'], capacity: 80 },
  { id: 'bus-cuatro-rios', name: 'Parada de la Avenida de los Ríos', type: 'transit', tags: ['transit'], anchors: ['CR_BUS_STOP'], capacity: 10 },
  { id: 'plaza-cuatro-rios', name: 'Plaza del Metro · Cuatro Ríos', type: 'public', tags: ['social', 'outdoor'], anchors: ['CR_PLAZA_BENCH_01', 'CR_PLAZA_BENCH_02'], capacity: 12 },
  // ------------------------------------------------------------------ Velaria (data/velaria.ts)
  { id: 'res-vl-dorada-1', name: 'Avenida Dorada 1', type: 'residence', tags: ['home'], building: 'vl-dorada-1', capacity: 12 },
  { id: 'res-vl-dorada-14', name: 'Avenida Dorada 14', type: 'residence', tags: ['home'], building: 'vl-dorada-14', capacity: 10 },
  { id: 'res-vl-mq-2', name: 'Calle Marqués 2', type: 'residence', tags: ['home'], building: 'vl-mq-2', capacity: 12 },
  { id: 'res-vl-mq-4', name: 'Calle Marqués 4', type: 'residence', tags: ['home'], building: 'vl-mq-4', capacity: 12 },
  { id: 'res-vl-mq-8', name: 'Calle Marqués 8', type: 'residence', tags: ['home'], building: 'vl-mq-8', capacity: 14 },
  { id: 'res-vl-mq-10', name: 'Calle Marqués 10', type: 'residence', tags: ['home'], building: 'vl-mq-10', capacity: 10 },
  { id: 'res-vl-mq-12', name: 'Calle Marqués 12', type: 'residence', tags: ['home'], building: 'vl-mq-12', capacity: 12 },
  { id: 'res-vl-mq-14', name: 'Calle Marqués 14', type: 'residence', tags: ['home'], building: 'vl-mq-14', capacity: 10 },
  { id: 'res-vl-mq-16', name: 'Calle Marqués 16', type: 'residence', tags: ['home'], building: 'vl-mq-16', capacity: 12 },
  { id: 'vl-ferrant', name: 'Maison Ferrant', type: 'business', tags: ['shop', 'fashion', 'luxury', WORK], building: 'vl-ferrant', capacity: 6, hours: [10.5, 21], days: [0, 1, 2, 3, 4, 5], why: 'Sastrería y moda de lujo: lo que compras te lo llevas puesto.' },
  { id: 'vl-brisa', name: 'Atelier Brisa · piel y calzado', type: 'business', tags: ['shop', 'fashion', 'luxury', WORK], building: 'vl-brisa', capacity: 5, hours: [10.5, 20.5], days: [0, 1, 2, 3, 4, 5], why: 'Zapatos y piel cosidos a mano: lo que compras te lo llevas puesto.' },
  { id: 'vl-oriol', name: 'Oriol · joyería y relojería', type: 'business', tags: ['shop', 'luxury', WORK], building: 'vl-oriol', capacity: 4, hours: [10.5, 20.5], days: [0, 1, 2, 3, 4, 5] },
  { id: 'vl-gourmet', name: 'Mercado Dorado', type: 'business', tags: ['shop', 'food', WORK], building: 'vl-gourmet', capacity: 10, hours: [9, 21.5], hoursByDay: { sunday: [10, 15] }, why: 'La compra gourmet: cesta para cocinar, pan de masa madre y fruta seleccionada.' },
  { id: 'vl-lis', name: 'Salón Lis', type: 'business', tags: ['shop', 'service', 'luxury', WORK], building: 'vl-lis', capacity: 6, hours: [10, 20.5], days: [0, 1, 2, 3, 4, 5], why: 'Corte y peinado de autor: cambia tu aspecto y se queda así.' },
  {
    id: 'vl-hotel', name: 'Gran Hotel Velaria', type: 'business', tags: ['hotel', 'food', 'social', 'tourism', WORK], building: 'vl-hotel', anchors: ['VL_TAXI_01', 'VL_TAXI_02'], capacity: 30, hours: [0, 24],
    why: 'Un café o un club sándwich en el bar del lobby, entre maletas, huéspedes y reuniones.',
  },
  { id: 'vl-galeria', name: 'Galería Aurelia', type: 'business', tags: ['leisure', 'art', WORK], building: 'vl-galeria', capacity: 12, hours: [11, 20.5], days: [1, 2, 3, 4, 5, 6] },
  { id: 'vl-clinica', name: 'Clínica Nácar · medicina estética', type: 'business', tags: ['service', 'health', 'luxury', WORK], building: 'vl-clinica', capacity: 5, hours: [10, 20], days: [0, 1, 2, 3, 4] },
  { id: 'vl-gym', name: 'Velaria Club · gimnasio', type: 'business', tags: ['sport', 'social', WORK], building: 'vl-gym', capacity: 12, hours: [6.5, 23] },
  { id: 'vl-cafe', name: 'Café Aurelia', type: 'business', tags: ['food', 'social', WORK], building: 'vl-cafe', anchors: ['VL_CAFE_TERRACE_01', 'VL_CAFE_TERRACE_02'], capacity: 12, hours: [8, 22], why: 'Café y desayuno en la barra o en la terraza de la plaza, junto a la fuente.' },
  { id: 'vl-alma', name: 'Alma · cocina de autor', type: 'business', tags: ['food', 'social', WORK], building: 'vl-alma', capacity: 16, hours: [13, 24], days: [1, 2, 3, 4, 5, 6], why: 'Cocina de autor servida en mesa: platos largos y menú degustación por la noche.' },
  { id: 'vl-vinoteca', name: 'Vinoteca Marqués', type: 'business', tags: ['food', 'social', 'nightlife', WORK], building: 'vl-vinoteca', capacity: 12, hours: [18, 1], days: [1, 2, 3, 4, 5, 6], why: 'Vino por copa o botella y tapas de producto, servido en mesa.' },
  { id: 'kaizen', name: 'Kaizen', type: 'business', tags: ['food', 'social', WORK], building: 'kaizen-door', capacity: 14, hours: [19, 24], why: 'Sushi premium y omakase, en mesa o en la barra frente al cocinero.' },
  { id: 'metro-velaria', name: 'Metro · Velaria', type: 'transit', tags: ['transit'], building: 'vl-metro', anchors: ['VL_METRO_MEET_01', 'VL_METRO_MEET_02'], capacity: 80 },
  { id: 'taxi-velaria', name: 'Parada de taxis del Gran Hotel', type: 'transit', tags: ['transit'], anchors: ['VL_TAXI_01', 'VL_TAXI_02'], capacity: 6 },
  { id: 'plaza-aurelia', name: 'Plaza Aurelia', type: 'public', tags: ['social', 'outdoor'], anchors: ['VL_PLAZA_BENCH_01', 'VL_PLAZA_BENCH_02', 'VL_PLAZA_BENCH_03', 'VL_PLAZA_BENCH_04'], capacity: 16 },
  // ------------------------------------------------------------------ Puerta Central (data/puertaCentral.ts)
  { id: 'pc-monton', name: 'Montón · moda', type: 'business', tags: ['shop', 'fashion', WORK], building: 'pc-puerta-9', capacity: 12, hours: [9.5, 22], why: 'Ropa de temporada al precio más bajo de la ciudad: camisetas a cuatro euros y te lo llevas puesto.' },
  { id: 'res-pc-puerta-13', name: 'Calle de la Puerta 13', type: 'residence', tags: ['home'], building: 'pc-puerta-13', capacity: 14 },
  { id: 'res-pc-puerta-17', name: 'Calle de la Puerta 17', type: 'residence', tags: ['home'], building: 'pc-puerta-17', capacity: 12 },
  { id: 'res-pc-puerta-21', name: 'Calle de la Puerta 21', type: 'residence', tags: ['home'], building: 'pc-puerta-21', capacity: 14 },
  { id: 'res-pc-plaza-4', name: 'Plaza de la Puerta 4', type: 'residence', tags: ['home'], building: 'pc-plaza-4', capacity: 12 },
  { id: 'res-pc-plaza-6', name: 'Plaza de la Puerta 6', type: 'residence', tags: ['home'], building: 'pc-plaza-6', capacity: 12 },
  { id: 'pc-velarde', name: 'Almacenes Velarde', type: 'business', tags: ['shop', 'gifts', 'home-goods', WORK], building: 'pc-plaza-8', capacity: 16, hours: [10, 22], hoursByDay: { sunday: [11, 21] }, why: 'Grandes almacenes: hogar (muebles que se colocan en casa) y regalos para la gente que conoces.' },
  { id: 'res-pc-plaza-10', name: 'Plaza de la Puerta 10', type: 'residence', tags: ['home'], building: 'pc-plaza-10', capacity: 10 },
  // La comisaría (systems/Police): abierta siempre. Dentro, recepción: la seguridad de la zona y, si te han robado, la denuncia.
  { id: 'pc-comisaria', name: 'Comisaría de Puerta Central', type: 'business', tags: ['police', 'civic'], building: 'pc-comisaria', capacity: 8, hours: [0, 24], why: 'Preguntar cómo está la zona a esta hora y, si te han robado en la calle, poner la denuncia.' },
  { id: 'res-pc-plaza-14', name: 'Plaza de la Puerta 14', type: 'residence', tags: ['home'], building: 'pc-plaza-14', capacity: 12 },
  // El hostal: de aquí salen turistas por la mañana y vuelven por la noche.
  { id: 'pc-hostal', name: 'Hostal Puerta Central', type: 'residence', tags: ['home', 'tourism'], building: 'pc-hostal', capacity: 24 },
  { id: 'pc-recuerdos', name: 'Recuerdos de la Puerta', type: 'business', tags: ['shop', 'tourism', WORK], building: 'pc-recuerdos', capacity: 8, hours: [10, 22], why: 'Camisetas y sudaderas de la plaza: lo que compras te lo llevas puesto.' },
  { id: 'pc-moda', name: 'Moda Central', type: 'business', tags: ['shop', 'fashion', WORK], building: 'pc-moda', capacity: 8, hours: [10, 22], hoursByDay: { sunday: [11, 21] }, why: 'Básicos, vaqueros y temporada a precio de cadena: te lo llevas puesto.' },
  { id: 'pc-cafe', name: 'Café Central', type: 'business', tags: ['food', 'social', WORK], building: 'pc-cafe', anchors: ['PC_CAFE_TERRACE_01', 'PC_CAFE_TERRACE_02'], capacity: 12, hours: [7.5, 22.5], why: 'Café y desayuno en la barra o en la terraza de la plaza, viendo pasar a medio mundo.' },
  { id: 'pc-pizza', name: 'Pizzería Vesubio', type: 'business', tags: ['food', 'social', WORK], building: 'pc-pizza', capacity: 20, hours: [12, 24], why: 'Pizza en mesa o para llevar, en plena Calle de la Puerta.' },
  { id: 'pc-burger', name: 'Burger Plaza', type: 'business', tags: ['food', 'social', 'nightlife', WORK], building: 'pc-burger', capacity: 20, hours: [11, 2], why: 'Hamburguesa en mesa o para llevar; abierta hasta las dos para quien sale.' },
  { id: 'metro-puerta-central', name: 'Metro · Puerta Central', type: 'transit', tags: ['transit'], building: 'pc-metro', anchors: ['PC_METRO_MEET_03', 'PC_METRO_MEET_04'], capacity: 120 },
  { id: 'metro-puerta-central-oeste', name: 'Metro · Puerta Central (oeste)', type: 'transit', tags: ['transit'], building: 'pc-metro-w', anchors: ['PC_METRO_MEET_01', 'PC_METRO_MEET_02'], capacity: 120 },
  // ------------------------------------------------------------------ Distrito Arena (data/arena.ts)
  { id: 'res-ar-1', name: 'Avenida del Estadio 1', type: 'residence', tags: ['home'], building: 'ar-res-1', capacity: 14 },
  { id: 'res-ar-2', name: 'Avenida del Estadio 21', type: 'residence', tags: ['home'], building: 'ar-res-2', capacity: 12 },
  { id: 'res-ar-3', name: 'Avenida del Estadio 25', type: 'residence', tags: ['home'], building: 'ar-res-3', capacity: 16 },
  // El estadio: un lugar público con sus cinco tornos (la gente de la calle entra y desaparece). Por la Puerta 3 se
  // entra a la Tribuna (data/stadium.ts) con entrada del partido (systems/Tickets). Sin horario: manda systems/Match.
  { id: 'ar-estadio', name: 'Estadio del Halcón', type: 'public', tags: ['sport', 'stadium'], building: 'ar-estadio', anchors: ['AR_GATE_1', 'AR_GATE_2', 'AR_GATE_3', 'AR_GATE_4', 'AR_GATE_5'], capacity: 400 },
  { id: 'ar-deportes', name: 'Deportes Arena', type: 'business', tags: ['shop', 'sport', WORK], building: 'ar-deportes', capacity: 6, hours: [10, 21], days: [0, 1, 2, 3, 4, 5], why: 'Chándal, camisetas técnicas y zapatillas: ropa de deporte que te llevas puesta.' },
  // Abre todos los días hasta tarde: el fin de semana es cuando hay partido.
  // El metro del Polígono Norte (Alpha-09): por donde llega casi toda la gente que no viene en coche.
  { id: 'metro-poligono-norte', name: 'Metro · Polígono Norte', type: 'transit', tags: ['transit'], building: 'pn-metro', capacity: 40 },
  // Decathlon (data/decathlon.ts): la nave del Polígono Norte (data/poligonoNorte.ts); se entra por su puerta de la explanada.
  { id: 'decathlon-tienda', name: 'Decathlon · Polígono Norte', type: 'business', tags: ['shop', 'sport', WORK], building: 'pn-decathlon', capacity: 30, hours: [9, 21], days: [0, 1, 2, 3, 4, 5], why: 'Una nave de deporte: montaña, running, ciclismo. Y el trabajo de sección, si firmas.' },
  { id: 'ar-oficial', name: 'Tienda Oficial Halcones', type: 'business', tags: ['shop', 'sport', 'stadium', WORK], building: 'ar-oficial', capacity: 8, hours: [10, 21.5], why: 'Las camisetas y la sudadera del club: te las llevas puestas.' },
  { id: 'ar-burger', name: 'Burger Fondo Sur', type: 'business', tags: ['food', 'social', WORK], building: 'ar-burger', capacity: 20, hours: [12, 24], why: 'Hamburguesa en mesa o para llevar, a dos pasos del estadio.' },
  { id: 'ar-pizza', name: 'Pizzería La Prórroga', type: 'business', tags: ['food', 'social', WORK], building: 'ar-pizza', capacity: 20, hours: [12.5, 24], why: 'Pizza en mesa o para llevar; después del partido, la cena de media grada.' },
  { id: 'ar-larguero', name: 'Bar El Larguero', type: 'business', tags: ['food', 'social', 'nightlife', 'arena-bar', WORK], building: 'ar-larguero', anchors: ['AR_LARGUERO_OUT_01', 'AR_LARGUERO_OUT_02', 'AR_LARGUERO_OUT_03'], capacity: 16, hours: [11, 1] },
  { id: 'ar-grada', name: 'Taberna La Grada', type: 'business', tags: ['food', 'social', 'nightlife', 'arena-bar', WORK], building: 'ar-grada', anchors: ['AR_GRADA_OUT_01', 'AR_GRADA_OUT_02', 'AR_GRADA_OUT_03'], capacity: 16, hours: [12, 1] },
  { id: 'ar-cafe', name: 'Café del Córner', type: 'business', tags: ['food', 'social', WORK], building: 'ar-cafe', capacity: 10, hours: [7.5, 21], why: 'Café y tostada en la barra, viendo la fachada del estadio.' },
  { id: 'metro-arena', name: 'Metro · Arena', type: 'transit', tags: ['transit'], building: 'ar-metro', anchors: ['AR_METRO_MEET_01'], capacity: 200 },
  { id: 'explanada-arena', name: 'Explanada del Estadio', type: 'public', tags: ['social', 'outdoor', 'stadium'], anchors: ['AR_FANS_01', 'AR_FANS_03', 'AR_FANS_05', 'AR_FANS_07'], capacity: 120 },
  { id: 'plaza-puerta-central', name: 'Plaza de la Puerta', type: 'public', tags: ['social', 'outdoor'], anchors: ['PC_BENCH_01', 'PC_BENCH_02', 'PC_BENCH_03', 'PC_BENCH_04'], capacity: 40 },
];
