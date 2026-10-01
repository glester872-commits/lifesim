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
  { id: 'player-home', name: 'Tu piso · Olmo 7', type: 'home', tags: ['home'], building: 'home-door', capacity: 2, why: 'Dormir y cocinar: recuperar energía sin gastar dinero.' },
  { id: 'res-mayor-3', name: 'Mayor 3', type: 'residence', tags: ['home'], building: 'res-mayor-3', capacity: 9 },
  { id: 'res-mayor-9', name: 'Mayor 9', type: 'residence', tags: ['home'], building: 'res-mayor-9', capacity: 6 },
  { id: 'res-olmo-3', name: 'Olmo 3', type: 'residence', tags: ['home'], building: 'res-olmo-3', capacity: 8 },
  { id: 'res-olmo-11', name: 'Olmo 11', type: 'residence', tags: ['home'], building: 'res-olmo-11', capacity: 8 },
  { id: 'res-avenida-20', name: 'Avenida 20', type: 'residence', tags: ['home'], building: 'res-av-20', capacity: 12 },
  { id: 'res-mayor-15', name: 'Mayor 15', type: 'residence', tags: ['home'], building: 'res-mayor-15', capacity: 10 },
  { id: 'res-mayor-20', name: 'Mayor 20', type: 'residence', tags: ['home'], building: 'res-mayor-20', capacity: 10 },

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
  { id: 'study-center', name: 'Centro de estudios', type: 'business', tags: ['study', WORK], building: 'study', capacity: 40, hours: [8, 21] },
  { id: 'civic-office', name: 'Junta municipal', type: 'business', tags: ['civic', WORK], building: 'civic', capacity: 10, hours: [9, 14] },

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
];
