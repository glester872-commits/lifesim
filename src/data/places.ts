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

  // Negocios con interior
  { id: 'cafe', name: 'Cafetería Pausa', type: 'business', tags: ['food', 'social', WORK], building: 'cafe-door', anchors: ['CAFE_TERRACE_01', 'CAFE_TERRACE_02'], capacity: 10, hours: [7, 22], why: 'Desayunar algo rápido y llevarse pan o bollería para casa.' },
  { id: 'gym', name: 'Gimnasio Forja', type: 'business', tags: ['sport', 'social', WORK], building: 'gym-door', capacity: 18, hours: [6, 23] },
  { id: 'clothing-store', name: 'Hilo · moda', type: 'business', tags: ['shop', 'fashion', WORK], building: 'fashion-door', capacity: 14, hours: [10, 21] },
  { id: 'supermarket', name: 'Súper Rosales', type: 'business', tags: ['shop', 'food', WORK], building: 'super-door', capacity: 20, hours: [9, 22], why: 'La compra para cocinar en casa: comer por menos de lo que cuesta fuera.' },
  { id: 'restaurant', name: 'Casa Tomás', type: 'business', tags: ['food', 'social', WORK], building: 'restaurant-door', anchors: ['RESTAURANT_TERRACE_01'], capacity: 16, hours: [12, 24], why: 'Comer o cenar caliente sin cocinar, a cambio de dinero.' },
  { id: 'office', name: 'Edificio Atalaya', type: 'business', tags: [WORK], building: 'office-door', capacity: 20, hours: [8, 20] },
  // Jueves flojo; viernes y sábado hasta que amanece. De domingo a miércoles, persiana.
  { id: 'nightclub', name: 'Sala Órbita', type: 'business', tags: ['nightlife', 'social', WORK], building: 'club-door', anchors: ['CLUB_QUEUE_01', 'CLUB_QUEUE_02', 'CLUB_QUEUE_03', 'CLUB_SMOKE_01', 'CLUB_SMOKE_02'], capacity: 40, hours: [21, 6], days: [3, 4, 5] },

  // Negocios de fachada: se puede trabajar o comprar en ellos aunque hoy no se entre.
  { id: 'pharmacy', name: 'Farmacia', type: 'business', tags: ['shop', 'health', WORK], building: 'pharmacy', capacity: 4, hours: [9, 21], why: 'Medicinas que quitan el cansancio cuando no da tiempo a dormir.' },
  { id: 'hair-salon', name: 'Peluquería', type: 'business', tags: ['shop', WORK], building: 'hair', capacity: 4, hours: [10, 20] },
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
];
