import type { Level } from '../config/population.ts';
import type { PlaceType } from './places.ts';
import type { Post } from '../systems/Service.ts';

/**
 * Quién pasa por la calle y a dónde va. Como data/population.ts para los
 * locales, pero fuera: cuánta gente hay según la hora y el día, y qué viajes
 * hace. Nadie aparece en mitad de la acera: sale de un portal, de un local
 * abierto o del resto de la ciudad (un borde), y va a otro sitio que tenga
 * sentido a esa hora.
 *
 * Los extremos se resuelven en cada momento contra data/places.ts: un local
 * cerrado no es origen ni destino, y uno con gente dentro (data/population.ts)
 * atrae en proporción a lo lleno que está. La discoteca vacía a las 21:00 no
 * llama a nadie; a las 02:00, a medio barrio.
 */

/** Un extremo de un viaje. Vale cualquiera de las opciones que se den. */
export interface Ends {
  /** Entradas de lugares de estos tipos. */
  types?: readonly PlaceType[];
  /** Entradas de lugares con alguna de estas etiquetas. */
  tags?: readonly string[];
  /** Puntos de calle por prefijo de id: bancos de la plaza, la cola de la discoteca. */
  points?: readonly string[];
  /** Los bordes del mapa: el resto de la ciudad. */
  edge?: boolean;
}

export interface TripRule {
  role: string;
  /** Lo que se lee al hablarle: no tiene nombre, tiene lo que está haciendo. */
  label: string;
  line: string;
  weight: number;
  /** [desde, hasta) en horas; si hasta < desde, cruza la medianoche. */
  hours?: readonly [number, number];
  /** Entre semana o fin de semana; la madrugada cuenta como la noche anterior. */
  days?: 'weekday' | 'weekend';
  /**
   * Sólo en estos momentos de la semana (systems/Calendar.rhythmAt): 'friday-evening',
   * 'weekend-night', 'sunday-day'… Más fino que days; se pueden usar los dos.
   */
  rhythms?: readonly import('../systems/Calendar.ts').Rhythm[];
  from: Ends;
  to: Ends;
  /** Si el destino es un sitio para estar (banco, cola, corrillo): minutos de juego allí. */
  stay?: readonly [number, number];
  /** Qué hace mientras está: 'DRINK' o 'EAT' en una terraza (se ve el vaso o el plato). */
  stayState?: string;
  /** Después de estar, a dónde; por defecto, a un portal de vecinos o fuera del barrio. */
  then?: Ends;
  /** Van juntos: [mín, máx] personas. */
  group?: readonly [number, number];
  /**
   * Quiénes son entre sí (data/identity.ts): pareja, amigos, familia, compañeros,
   * gimnasio, turistas. systems/People elige a quien acompaña entre sus relaciones.
   * Sin él, un grupo son amigos.
   */
  bond?: readonly import('./identity.ts').Bond[];
  /**
   * Puntos del grafo por los que pasa camino del destino, en orden (o al revés,
   * al azar): quien corre o saca al perro cruza el parque, no lo rodea.
   */
  via?: readonly string[];
  /** Paso: trotando (corre y se le ve correr) o paseando (más despacio que ir a algo). */
  pace?: 'jog' | 'stroll';
  /** Sale con perro (systems/Wildlife.ts lo lleva detrás, de la correa). */
  dog?: boolean;
  /** Probabilidad de pararse un momento por el camino; por defecto, la de cualquiera. */
  pause?: number;
  /** Como mucho tantos viajes de este tipo a la vez: ni diez personas mirando el mismo escaparate. */
  max?: number;
}

export interface StreetProfile {
  location: string;
  /** [desde, hasta, nivel]; lo que no cubren cuenta como VERY_LOW. */
  bands: readonly (readonly [number, number, Level])[];
  /** Niveles que sube o baja cada día, de lunes a domingo (la madrugada, con la noche anterior). */
  weekday: readonly [number, number, number, number, number, number, number];
  /** Multiplica el rango del nivel: una calle entera aguanta más gente que un café. */
  scale: number;
  maxWalkers: number;
  /** Gente de más según lo lleno que esté un local: la puerta de la discoteca a las dos. */
  draws?: readonly { place: string; perLevel: number }[];
  /** Personal que trabaja fuera: el camarero de la terraza. */
  staff?: readonly StreetPost[];
  /**
   * Salidas en oleada: cada vez que llega un tren sale gente por esa boca, de una
   * en una. [desde, hasta, minutos entre trenes] por hora; fuera de las franjas, nada.
   */
  bursts?: readonly { point: string; every: readonly (readonly [number, number, number])[]; size: readonly [number, number] }[];
  trips: readonly TripRule[];
}

/**
 * Un puesto en la calle de un local: sale por su puerta cuando el local abre
 * (y, con minLevel, cuando hay gente), atiende a quien se sienta en `serves`
 * y vuelve a la puerta. Al cerrar, entra y no vuelve a salir.
 */
export interface StreetPost extends Post {
  place: string;
  /** Punto de calle donde espera, junto a la puerta del local. */
  base: string;
  serves: readonly string[];
  minLevel?: Level;
}

const HOMES: Ends = { types: ['residence'] };
const CITY: Ends = { edge: true };
const HOMES_OR_CITY: Ends = { types: ['residence'], edge: true };
const TRANSIT: Ends = { types: ['transit'] };
const ANYWHERE_HOME: Ends = { types: ['residence', 'transit'], edge: true };
const NIGHT_OUT: Ends = { tags: ['nightlife'] };
/** Lo que se mira en la Calle del Carmen: tiendas, estudio y discos. */
const CARMEN_WINDOWS: Ends = { points: ['TINTA_WINDOW', 'RETALES_WINDOW', 'RECORDS_WINDOW', 'ARCHIVO_WINDOW', 'VUELTA_WINDOW'] };
const CARMEN: Ends = { tags: ['carmen'] };
const WINDOWS: Ends = { points: ['FASHION_WINDOW_', 'HAIR_WINDOW', 'PHARMACY_WINDOW', 'BANK_WINDOW', 'SUPER_WINDOW', 'FRUIT_WINDOW', 'LAUNDRY_WINDOW'] };

export const STREET_PROFILES: readonly StreetProfile[] = [
  {
    location: 'district',
    bands: [
      // Crowd 2.0: de ida al trabajo, comida y paseo a mediodía, la tarde es lo más lleno del día.
      [6, 7, 'LOW'], [7, 9, 'HIGH'], [9, 12, 'MEDIUM'], [12, 14, 'VERY_HIGH'], [14, 17, 'HIGH'],
      [17, 20, 'VERY_HIGH'], [20, 22, 'HIGH'], [22, 24, 'MEDIUM'],
    ],
    // El domingo, más tranquilo.
    weekday: [0, 0, 0, 0, 0, 0, -1],
    scale: 1.4,
    // El barrio creció hacia el este (Calle del Carmen): más calle, algo más de gente.
    maxWalkers: 46,
    // El metro: en hora punta un tren cada pocos minutos de juego, y de cada uno salen unos cuantos.
    bursts: [{ point: 'METRO_ENTRANCE', every: [[6.5, 7, 16], [7, 10, 6], [10, 17, 14], [17, 20.5, 6], [20.5, 24, 16], [0, 1.5, 24]], size: [1, 3] }],
    draws: [{ place: 'nightclub', perLevel: 2 }],
    staff: [
      { service: 'waiter', place: 'cafe', base: 'CAFE_TERRACE_WAITER', serves: ['CAFE_TERRACE_'], label: 'Camarero de la terraza' },
      { service: 'waiter', place: 'coffee-molinillo', base: 'MOLINILLO_TERRACE_WAITER', serves: ['MOLINILLO_TERRACE_'], label: 'Camarera del Molinillo', line: 'Fuera sólo café y bollos, ¿eh?' },
      { service: 'waiter', place: 'restaurant', base: 'RESTAURANT_TERRACE_WAITER', serves: ['RESTAURANT_TERRACE_'], minLevel: 'MEDIUM', line: '¿Os pongo algo más fuera?' },
    ],
    trips: [
      // Mañana: de casa al metro o al autobús, y la gente de fuera hacia las oficinas.
      { role: 'commuter', label: 'Alguien con prisa', line: 'Llego tarde. Como todos los días.', weight: 5, hours: [7, 9.5], days: 'weekday', from: HOMES, to: TRANSIT },
      { role: 'office', label: 'Alguien que va a la oficina', line: 'Primero café, luego correos.', weight: 3, hours: [7.5, 10], days: 'weekday', from: { types: ['transit'], edge: true }, to: { points: ['OFFICE_ENTRANCE'] } },
      // Vuelta a casa a media tarde.
      { role: 'returning', label: 'Alguien volviendo a casa', line: 'Qué día más largo.', weight: 4, hours: [17, 21], from: { types: ['transit'], edge: true }, to: HOMES },
      // Recados, compras y comida.
      { role: 'errands', label: 'Alguien de recados', line: 'Me falta pan. Siempre me falta pan.', weight: 3, hours: [9.5, 21], from: HOMES_OR_CITY, to: { tags: ['shop'] } },
      { role: 'shopper', label: 'Alguien con bolsas', line: 'Sólo venía a mirar.', weight: 2, hours: [10, 21], from: { tags: ['shop'] }, to: HOMES_OR_CITY },
      { role: 'coffee', label: 'Alguien que va a por café', line: 'Un café y empiezo.', weight: 2, hours: [7, 21.5], from: HOMES_OR_CITY, to: { points: ['CAFE_ENTRANCE'] } },
      { role: 'terrace', label: 'Alguien en la terraza', line: 'Aquí se está de maravilla.', weight: 2, hours: [10, 21.5], from: HOMES_OR_CITY, to: { points: ['CAFE_TERRACE_'] }, stay: [20, 45], stayState: 'DRINK', group: [1, 2], bond: ['friends', 'couple'] },
      { role: 'terrace-meal', label: 'Alguien comiendo fuera', line: 'Fuera se come mejor. Y se ve pasar a la gente.', weight: 2, hours: [13, 15.5], from: HOMES_OR_CITY, to: { points: ['RESTAURANT_TERRACE_'] }, stay: [30, 60], stayState: 'EAT', group: [1, 2], bond: ['coworkers', 'friends', 'couple'] },
      { role: 'terrace-meal', label: 'Alguien cenando fuera', line: 'Con este tiempo, dentro ni loco.', weight: 2, hours: [20.5, 23], from: HOMES_OR_CITY, to: { points: ['RESTAURANT_TERRACE_'] }, stay: [40, 70], stayState: 'EAT', group: [1, 2], bond: ['couple', 'friends', 'family'] },
      { role: 'gym', label: 'Alguien que va al gimnasio', line: 'Hoy toca pierna. Por desgracia.', weight: 2, hours: [6.5, 9], from: HOMES, to: { points: ['GYM_ENTRANCE'] } },
      { role: 'gym', label: 'Alguien que va al gimnasio', line: 'Si no voy ahora, no voy.', weight: 3, hours: [17, 21.5], from: { types: ['residence', 'transit'] }, to: { points: ['GYM_ENTRANCE'] }, group: [1, 2], bond: ['gym'] },
      { role: 'diner', label: 'Alguien que va a comer', line: 'Menú del día y a correr.', weight: 3, hours: [13, 15.5], from: { tags: ['work'], edge: true }, to: { points: ['RESTAURANT_ENTRANCE'] }, group: [1, 3], bond: ['coworkers', 'friends'] },
      { role: 'diner', label: 'Alguien que va a cenar', line: 'Hemos reservado. Creo.', weight: 3, hours: [20, 23], from: HOMES_OR_CITY, to: { points: ['RESTAURANT_ENTRANCE'] }, group: [2, 3], bond: ['couple', 'friends', 'family'] },
      // Estar en la calle: bancos, la fuente, el parque, la parada.
      { role: 'stroller', label: 'Alguien paseando', line: 'Hace buena tarde para no hacer nada.', weight: 2, hours: [10, 21.5], from: HOMES_OR_CITY, to: { points: ['PLAZA_BENCH_', 'PLAZA_FOUNTAIN', 'NEWS_KIOSK'] }, stay: [8, 25], group: [1, 3], bond: ['family', 'friends', 'couple'] },
      // El parque: corredores y perros a primera hora, lectores y corrillos a mediodía, más gente por la tarde.
      { role: 'park', label: 'Alguien en el parque', line: 'Vengo a que me dé el aire.', weight: 1.5, hours: [9, 20.5], from: HOMES, to: { points: ['PARK_BENCH_', 'PARK_COURT'] }, stay: [15, 40], group: [1, 3], bond: ['friends', 'family'] },
      { role: 'jogger', label: 'Alguien corriendo', line: 'No me pares, que pierdo el ritmo.', weight: 3, hours: [6.5, 9.5], from: HOMES_OR_CITY, to: HOMES_OR_CITY, via: ['park-w', 'park-e'], pace: 'jog', pause: 0 },
      { role: 'jogger', label: 'Alguien corriendo', line: 'Cinco kilómetros más y ceno.', weight: 1.5, hours: [18.5, 21.5], from: HOMES_OR_CITY, to: HOMES_OR_CITY, via: ['park-w', 'park-e'], pace: 'jog', pause: 0 },
      { role: 'dog-walker', label: 'Alguien paseando al perro', line: 'No muerde. Bueno, casi nunca.', weight: 3, hours: [6.5, 10], from: HOMES, to: HOMES, via: ['park-w', 'park-e'], pace: 'stroll', dog: true, pause: 0.6 },
      { role: 'dog-walker', label: 'Alguien paseando al perro', line: 'Se para en cada farola. En todas.', weight: 1, hours: [13, 15], from: HOMES, to: HOMES, via: ['park-w', 'park-e'], pace: 'stroll', dog: true, pause: 0.6 },
      { role: 'dog-walker', label: 'Alguien paseando al perro', line: 'La última vuelta y a casa.', weight: 3, hours: [19, 23.5], from: HOMES, to: HOMES_OR_CITY, via: ['park-w', 'park-e'], pace: 'stroll', dog: true, pause: 0.6 },
      { role: 'dog-walker', label: 'Alguien paseando al perro', line: 'Vamos, que hace frío.', weight: 1, hours: [7, 22], from: HOMES, to: HOMES, pace: 'stroll', dog: true, pause: 0.5 },
      { role: 'reader', label: 'Alguien leyendo', line: 'Me quedan veinte páginas. Déjame acabar.', weight: 1.5, hours: [10, 19.5], from: HOMES_OR_CITY, to: { points: ['PARK_BENCH_', 'PLAZA_BENCH_'] }, stay: [20, 50], stayState: 'READ' },
      { role: 'park-talk', label: 'Gente charlando', line: '¿Y entonces qué le dijiste?', weight: 1.5, hours: [10.5, 21], from: HOMES_OR_CITY, to: { points: ['PARK_TALK_'] }, stay: [8, 20], stayState: 'TALK', group: [2, 2], bond: ['friends'] },
      { role: 'park-wait', label: 'Alguien esperando', line: 'Me han dicho a las seis. Son las seis y diez.', weight: 1, hours: [9, 21], from: HOMES_OR_CITY, to: { points: ['PARK_WAIT_'] }, stay: [4, 12], stayState: 'PHONE' },
      { role: 'park-stroll', label: 'Gente paseando', line: 'Damos la vuelta al parque y volvemos.', weight: 2, hours: [11, 21], from: HOMES_OR_CITY, to: HOMES_OR_CITY, via: ['park-w', 'park-e'], pace: 'stroll', group: [1, 2], bond: ['couple', 'friends', 'family'] },
      // Escaparates: se para a mirar; a veces entra después.
      { role: 'window-shopper', label: 'Alguien mirando escaparates', line: 'Sólo miro. De verdad.', weight: 3, hours: [10, 21], days: 'weekday', from: HOMES_OR_CITY, to: WINDOWS, stay: [1, 4], stayState: 'BROWSE', then: { tags: ['shop'], types: ['residence'], edge: true }, group: [1, 2], max: 5 },
      { role: 'window-shopper', label: 'Alguien mirando escaparates', line: 'Este me lo pruebo. O no.', weight: 5, hours: [10, 21], days: 'weekend', from: HOMES_OR_CITY, to: WINDOWS, stay: [1, 5], stayState: 'BROWSE', then: { tags: ['shop'], types: ['residence'], edge: true }, group: [1, 3], max: 7 },
      // Calle del Carmen: escaparates, cola en la puerta de Archivo, parejas y pandillas de paseo, la terraza y el banco.
      { role: 'carmen-browse', label: 'Alguien mirando escaparates', line: 'Aquí siempre encuentro algo que no buscaba.', weight: 3, hours: [11, 21], from: HOMES_OR_CITY, to: CARMEN_WINDOWS, stay: [1, 4], stayState: 'BROWSE', then: { tags: ['carmen', 'shop'], types: ['residence'], edge: true }, group: [1, 3], max: 5 },
      { role: 'carmen-browse', label: 'Gente de tiendas', line: 'Una vuelta por el Carmen y a casa. Eso decimos siempre.', weight: 4, hours: [11, 21], days: 'weekend', from: HOMES_OR_CITY, to: CARMEN_WINDOWS, stay: [2, 5], stayState: 'BROWSE', then: CARMEN, group: [2, 3], max: 6, bond: ['friends', 'couple'] },
      { role: 'carmen-wait', label: 'Alguien esperando en la puerta', line: 'Abren a las doce. Llevo aquí desde las once y media.', weight: 2, hours: [11, 20], from: HOMES_OR_CITY, to: { points: ['CARMEN_WAIT_'] }, stay: [5, 15], stayState: 'PHONE', then: CARMEN, group: [1, 2], max: 4 },
      { role: 'carmen-couple', label: 'Una pareja paseando', line: 'Íbamos a mirar sólo una tienda.', weight: 2, hours: [11, 22], from: HOMES_OR_CITY, to: HOMES_OR_CITY, via: ['carmen-75', 'carmen-106'], pace: 'stroll', group: [2, 2], bond: ['couple'] },
      { role: 'carmen-friends', label: 'Gente charlando', line: '¿Has visto lo que ha sacado Archivo? Ni de broma lo pago.', weight: 2, hours: [16, 22.5], from: HOMES_OR_CITY, to: { points: ['CARMEN_TALK_'] }, stay: [8, 20], stayState: 'TALK', group: [2, 3], max: 3, bond: ['friends'] },
      { role: 'carmen-bench', label: 'Alguien sentado', line: 'Se está bien aquí. Pasa gente interesante.', weight: 1, hours: [10, 21], from: HOMES_OR_CITY, to: { points: ['CARMEN_BENCH_'] }, stay: [10, 30], stayState: 'READ' },
      { role: 'terrace', label: 'Alguien en la terraza del Molinillo', line: 'El mejor café del barrio. No se lo digas a Nilo.', weight: 2, hours: [9, 19.5], from: HOMES_OR_CITY, to: { points: ['MOLINILLO_TERRACE_'] }, stay: [20, 45], stayState: 'DRINK', group: [1, 2], bond: ['friends', 'couple'] },
      { role: 'tattoo-client', label: 'Alguien con cita en el estudio', line: 'Tengo cita a y media. Estoy tranquilo. Muy tranquilo.', weight: 1, hours: [12, 20], days: 'weekday', from: HOMES_OR_CITY, to: { points: ['TINTA_ENTRANCE'] } },
      // El metro: quien sale de un tren y quien espera a alguien que llega en el siguiente.
      { role: 'metro-arrival', label: 'Alguien que sale del metro', line: 'Qué agobio de vagón.', weight: 2, hours: [6.5, 1.5], from: TRANSIT, to: { types: ['residence'], tags: ['shop', 'work'], edge: true } },
      { role: 'metro-meet', label: 'Alguien esperando a alguien', line: 'Me ha dicho que ya sale del metro.', weight: 2, hours: [8, 23], from: HOMES_OR_CITY, to: { points: ['METRO_MEET_'] }, stay: [4, 12], stayState: 'PHONE', then: TRANSIT, max: 2 },
      // Fin de semana: brunch en la terraza y más paseo.
      { role: 'brunch', label: 'Gente de brunch', line: 'Otro café y nos vamos. Eso dijimos hace una hora.', weight: 4, hours: [10, 13.5], days: 'weekend', from: HOMES_OR_CITY, to: { points: ['CAFE_TERRACE_'] }, stay: [30, 60], stayState: 'DRINK', group: [2, 3], bond: ['friends', 'couple'] },
      { role: 'park-stroll', label: 'Gente paseando', line: 'Sábado sin plan. El mejor plan.', weight: 4, hours: [10.5, 20], days: 'weekend', from: HOMES_OR_CITY, to: HOMES_OR_CITY, via: ['park-w', 'park-e'], pace: 'stroll', group: [1, 3], bond: ['family', 'couple', 'friends'] },
      { role: 'bus', label: 'Alguien esperando el bus', line: 'Dice ocho minutos desde hace veinte.', weight: 1, hours: [6.5, 23], from: HOMES, to: { points: ['BUS_STOP'] }, stay: [4, 12], then: CITY },
      // Gente de visita: en grupo, a la plaza a ver la fuente y el quiosco, y otra vez a la ciudad.
      { role: 'tourist', label: 'Gente de visita', line: 'Perdona, ¿la Plaza de la Fuente es esta? La del mapa.', weight: 1.5, hours: [10, 20.5], from: CITY, to: { points: ['PLAZA_FOUNTAIN', 'NEWS_KIOSK', 'PLAZA_BENCH_'] }, stay: [6, 15], then: CITY, group: [2, 3], bond: ['tourists'] },
      // Quien sólo cruza el barrio, a cualquier hora.
      { role: 'passer', label: 'Alguien de paso', line: 'Perdona, voy con prisa.', weight: 2, from: CITY, to: CITY },
      { role: 'night-walker', label: 'Alguien volviendo tarde', line: 'Ya es tardísimo...', weight: 1, hours: [22, 6], from: { types: ['transit'], edge: true }, to: HOMES },
      // La noche: cola en la puerta, corrillo fuera y gente saliendo de madrugada.
      { role: 'club-queue', label: 'Alguien en la cola', line: 'Dicen que hoy pincha alguien bueno.', weight: 4, hours: [22, 3.5], from: ANYWHERE_HOME, to: { points: ['CLUB_QUEUE_'] }, stay: [3, 8], then: NIGHT_OUT, group: [1, 3], bond: ['friends', 'couple'] },
      { role: 'club-goer', label: 'Alguien que sale de fiesta', line: '¡Esta noche no se duerme!', weight: 2, hours: [23, 3], from: ANYWHERE_HOME, to: NIGHT_OUT, group: [2, 3], bond: ['friends', 'couple'] },
      { role: 'club-smoke', label: 'Alguien tomando el aire', line: 'Salgo un momento, que dentro no se respira.', weight: 2, hours: [23.5, 5.5], from: NIGHT_OUT, to: { points: ['CLUB_SMOKE_'] }, stay: [5, 12], then: NIGHT_OUT, group: [2, 3], bond: ['friends'] },
      { role: 'club-leaving', label: 'Alguien saliendo de la discoteca', line: 'Me duelen los pies. Ha merecido la pena.', weight: 4, hours: [2.5, 6], from: NIGHT_OUT, to: ANYWHERE_HOME, group: [1, 3], bond: ['friends', 'couple'] },
    ],
  },
  // Prototipo Visual V3 (data/prototype.ts): poca gente, la justa para dar escala a la plaza. De paso por las
  // aceras, quien sale del metro, quien espera a alguien junto a la boca y un corrillo delante del tótem.
  {
    location: 'plazuela-v3',
    // Corte vertical: siempre con gente, también de madrugada (la referencia es a las 02:47).
    bands: [[0, 24, 'MEDIUM']],
    weekday: [0, 0, 0, 0, 0, 0, 0],
    scale: 1,
    maxWalkers: 6,
    trips: [
      { role: 'passer', label: 'Alguien de paso', line: 'Voy al centro. Como siempre, tarde.', weight: 4, from: { edge: true }, to: { edge: true } },
      { role: 'metro-arrival', label: 'Alguien que sale del metro', line: 'Qué agobio de vagón.', weight: 2, from: { points: ['PROTO_METRO_ENTRANCE'] }, to: { edge: true } },
      { role: 'metro-meet', label: 'Alguien esperando a alguien', line: 'Me ha dicho que ya sale.', weight: 2, hours: [7, 23], from: { edge: true }, to: { points: ['PROTO_MEET_'] }, stay: [4, 12], stayState: 'PHONE', then: { points: ['PROTO_METRO_ENTRANCE'] }, max: 2 },
      { role: 'talk', label: 'Gente charlando', line: '¿Y al final vas a ir?', weight: 1.5, hours: [9, 22], from: { edge: true }, to: { points: ['PROTO_TALK_'] }, stay: [6, 14], stayState: 'TALK', group: [2, 2], max: 1 },
    ],
  },
];
