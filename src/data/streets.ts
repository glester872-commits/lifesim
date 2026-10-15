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
  /**
   * Rol ambiente (la capa de vida de la calle): ocasional y fuera del nivel de gente; tiene su propio cupo
   * (StreetLife.AMBIENT_CAP) y no le quita sitio a nadie. Sin él, el viaje cuenta como cualquier otro.
   */
  ambient?: boolean;
  /**
   * Limpieza viaria: lleva el carrito y la escoba, y por el camino para a barrer junto a papeleras, bancos, paradas y
   * mesas de terraza (StreetLife.workStops); en un sitio para estar, barre mientras está (stayState 'SWEEP').
   */
  sweep?: boolean;
  /** Uniforme de quien trabaja en la calle (id en UNIFORM_LOOKS, data/npcs.ts): limpieza, mantenimiento, reparto. */
  uniform?: string;
  /** No se queda en casa por el tiempo: con lluvia no baja, sube (quien pide a domicilio, quien llama a un VTC). */
  rainproof?: boolean;
  /** Sólo mientras está en marcha ese evento (data/popups.ts, systems/PopUps): el mercadillo, la cola, el DJ. */
  popup?: string;
  /**
   * Sólo mientras ese puesto (id en data/streetActs.ts) está montado y vendiendo o actuando: quien mira la manta o se
   * para a ver la actuación. Si recoge, quien estaba acaba enseguida.
   */
  act?: string;
  /** Sólo en estas fases del partido del Arena (systems/Match): la afición, la policía, la cola del metro a la salida. */
  match?: readonly import('./cityEvents.ts').MatchPhase[];
  /** Parte de quienes hacen el viaje que van con la camiseta y la bufanda del equipo (0–1). */
  fan?: number;
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
   * Servicio de mesa de cada terraza (systems/TableService, el mismo de los interiores), uno por local: sus mesas son
   * las de LocationDef.tables cuyos asientos atiende el puesto de camarero de `place` (StreetPost.serves), la carta es
   * la del local y la barra a la que lleva y trae es su sitio junto a la puerta (`pass`).
   */
  tableService?: readonly { place: string; menu: string; pass: string }[];
  /**
   * Salidas en oleada: cada vez que llega un tren sale gente por esa boca, de una
   * en una. [desde, hasta, minutos entre trenes] por hora; fuera de las franjas, nada.
   */
  bursts?: readonly {
    point: string;
    every: readonly (readonly [number, number, number])[];
    size: readonly [number, number];
    /** Sólo en estas fases del partido: los trenes llenos de afición. */
    match?: readonly import('./cityEvents.ts').MatchPhase[];
  }[];
  /**
   * Paseantes de más (o de menos) en cada fase del partido del Arena (systems/Match): el objetivo y el tope suben con
   * ellos, como con un evento de calle. Negativo: mientras se juega, la calle se vacía.
   */
  match?: Partial<Record<import('./cityEvents.ts').MatchPhase, number>>;
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
const CARMEN_WINDOWS: Ends = { points: ['TINTA_WINDOW', 'RETALES_WINDOW', 'RECORDS_WINDOW', 'ARCHIVO_WINDOW', 'VUELTA_WINDOW', 'SUELA_WINDOW', 'NAVAJA_WINDOW', 'GAVIOTA_WINDOW'] };
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
    scale: 1.5,
    // El barrio creció hacia el este (Calle del Carmen) y su vida de diario (horno, bar, tienda, plaza y parque por horas):
    // más calle y más motivos para salir, algo más de gente.
    maxWalkers: 60,
    // El metro: en hora punta un tren cada pocos minutos de juego, y de cada uno salen unos cuantos.
    bursts: [{ point: 'METRO_ENTRANCE', every: [[6.5, 7, 16], [7, 10, 6], [10, 17, 14], [17, 20.5, 6], [20.5, 24, 16], [0, 1.5, 24]], size: [1, 3] }],
    draws: [{ place: 'nightclub', perLevel: 2 }],
    tableService: [
      { place: 'restaurant', menu: 'casa-tomas', pass: 'RESTAURANT_TERRACE_WAITER' },
      { place: 'cafe', menu: 'pausa', pass: 'CAFE_TERRACE_WAITER' },
      { place: 'coffee-molinillo', menu: 'molinillo', pass: 'MOLINILLO_TERRACE_WAITER' },
    ],
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
      { role: 'terrace-meal', label: 'Alguien comiendo fuera', line: 'Fuera se come mejor. Y se ve pasar a la gente.', weight: 3.5, hours: [13, 15.5], from: HOMES_OR_CITY, to: { points: ['RESTAURANT_TERRACE_'] }, stay: [30, 60], stayState: 'EAT', group: [1, 2], bond: ['coworkers', 'friends', 'couple'] },
      { role: 'terrace-meal', label: 'Alguien cenando fuera', line: 'Con este tiempo, dentro ni loco.', weight: 3.5, hours: [20.5, 23], from: HOMES_OR_CITY, to: { points: ['RESTAURANT_TERRACE_'] }, stay: [40, 70], stayState: 'EAT', group: [1, 2], bond: ['couple', 'friends', 'family'] },
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
      // La calle como destino: corros a la puerta, fotos delante de los murales, zapatillas, piercing, el bar y quien sale a fumar.
      { role: 'carmen-hang', label: 'Gente a la puerta de la tienda', line: 'Esperamos a que abran. Y a Dani, que viene con la tabla.', weight: 1.5, hours: [12, 22], days: 'weekday', from: HOMES_OR_CITY, to: { points: ['CARMEN_HANG_'] }, stay: [8, 25], stayState: 'TALK', then: CARMEN, group: [2, 3], max: 4, bond: ['friends'] },
      { role: 'carmen-hang', label: 'Gente a la puerta de la tienda', line: 'Los sábados esto es una plaza. Todo el mundo se conoce de vista.', weight: 4, hours: [12, 23], days: 'weekend', from: HOMES_OR_CITY, to: { points: ['CARMEN_HANG_'] }, stay: [10, 30], stayState: 'TALK', then: CARMEN, group: [2, 3], max: 4, bond: ['friends'] },
      { role: 'carmen-outfit', label: 'Gente haciéndose fotos', line: 'Hazme una con el mural detrás. No, con el mural entero.', weight: 1.6, hours: [13, 20], from: HOMES_OR_CITY, to: { points: ['CARMEN_PHOTO_'] }, stay: [4, 10], stayState: 'BROWSE', then: CARMEN, group: [2, 2], max: 2, bond: ['friends', 'couple'] },
      { role: 'carmen-prenight', label: 'Amigos antes de salir', line: 'Una aquí y vamos a la Órbita. Si es que nos dejan entrar.', weight: 3.5, hours: [20, 23.5], rhythms: ['friday-evening', 'saturday-day', 'weekend-night'], from: HOMES_OR_CITY, to: { points: ['CARMEN_HANG_', 'CARMEN_TALK_'] }, stay: [10, 25], stayState: 'DRINK', then: NIGHT_OUT, group: [2, 4], max: 4, bond: ['friends'] },
      { role: 'sneaker-heads', label: 'Alguien que va a Suela', line: 'Ya sé que no tienen mi talla. Voy igual.', weight: 1.2, hours: [12, 21], days: 'weekend', from: HOMES_OR_CITY, to: { points: ['SUELA_ENTRANCE'] }, group: [1, 2], bond: ['friends'] },
      { role: 'piercing-client', label: 'Alguien con cita en Navaja & Aro', line: 'Primero el pelo. El aro, si me da el valor.', weight: 1, hours: [12, 20], from: HOMES_OR_CITY, to: { points: ['NAVAJA_ENTRANCE'] } },
      { role: 'bar-night', label: 'Alguien que va al Gaviota', line: 'Una caña y a casa. Una.', weight: 3, hours: [17.5, 1.5], from: HOMES_OR_CITY, to: { points: ['GAVIOTA_ENTRANCE'] }, group: [1, 3], bond: ['friends', 'couple'] },
      { role: 'bar-smoke', label: 'Alguien tomando el aire', line: 'Salgo a fumar, que dentro suena la misma canción por tercera vez.', weight: 5, hours: [18, 2], from: { points: ['GAVIOTA_ENTRANCE'] }, to: { points: ['GAVIOTA_SMOKE_'] }, stay: [5, 12], then: { points: ['GAVIOTA_ENTRANCE'] }, group: [1, 3], bond: ['friends'] },
      // Eventos (data/popups.ts): sólo cuentan mientras está en marcha cada uno.
      { role: 'popup-market', label: 'Alguien mirando los puestos', line: 'Esta chaqueta es mía. Es que no lo sabe todavía.', weight: 28, popup: 'vintage-market', hours: [11, 18.5], from: HOMES_OR_CITY, to: { points: ['POPUP_BROWSE_'] }, stay: [3, 9], stayState: 'BROWSE', then: CARMEN, group: [1, 3], bond: ['friends', 'couple'] },
      { role: 'popup-market', label: 'Alguien en el pop-up', line: 'Edición limitada, dicen. Como todo.', weight: 24, popup: 'fashion-popup', hours: [12, 17.5], from: HOMES_OR_CITY, to: { points: ['POPUP_BROWSE_'] }, stay: [3, 9], stayState: 'BROWSE', then: CARMEN, group: [1, 3], bond: ['friends', 'couple'] },
      { role: 'popup-queue', label: 'Alguien en la cola de la zapatilla', line: 'Llevo aquí desde las siete. No me cambies el sitio.', weight: 30, popup: 'sneaker-release', hours: [10, 15], from: HOMES_OR_CITY, to: { points: ['POPUP_QUEUE_'] }, stay: [20, 45], stayState: 'QUEUE', then: CARMEN, group: [1, 2], bond: ['friends'] },
      { role: 'popup-dj', label: 'Alguien bailando en la acera', line: 'Ni me sé la canción. Da igual.', weight: 30, popup: 'dj-event', hours: [20, 1], from: HOMES_OR_CITY, to: { points: ['CARMEN_DANCE_'] }, stay: [10, 35], stayState: 'DANCE', then: CARMEN, group: [2, 3], bond: ['friends'] },
      { role: 'popup-art', label: 'Alguien en la inauguración', line: 'No entiendo el de la derecha. Me encanta.', weight: 28, popup: 'art-event', hours: [19, 23], from: HOMES_OR_CITY, to: { points: ['POPUP_BROWSE_'] }, stay: [8, 20], stayState: 'DRINK', then: CARMEN, group: [1, 3], bond: ['friends', 'couple'] },
      // El metro: quien sale de un tren y quien espera a alguien que llega en el siguiente.
      { role: 'metro-arrival', label: 'Alguien que sale del metro', line: 'Qué agobio de vagón.', weight: 2, hours: [6.5, 1.5], from: TRANSIT, to: { types: ['residence'], tags: ['shop', 'work'], edge: true } },
      { role: 'metro-meet', label: 'Alguien esperando a alguien', line: 'Me ha dicho que ya sale del metro.', weight: 2, hours: [8, 23], from: HOMES_OR_CITY, to: { points: ['METRO_MEET_'] }, stay: [4, 12], stayState: 'PHONE', then: TRANSIT, max: 2 },
      // Fin de semana: brunch en la terraza y más paseo.
      { role: 'brunch', label: 'Gente de brunch', line: 'Otro café y nos vamos. Eso dijimos hace una hora.', weight: 4, hours: [10, 13.5], days: 'weekend', from: HOMES_OR_CITY, to: { points: ['CAFE_TERRACE_'] }, stay: [30, 60], stayState: 'DRINK', group: [2, 3], bond: ['friends', 'couple'] },
      { role: 'park-stroll', label: 'Gente paseando', line: 'Sábado sin plan. El mejor plan.', weight: 4, hours: [10.5, 20], days: 'weekend', from: HOMES_OR_CITY, to: HOMES_OR_CITY, via: ['park-w', 'park-e'], pace: 'stroll', group: [1, 3], bond: ['family', 'couple', 'friends'] },
      { role: 'bus', label: 'Alguien esperando el bus', line: 'Dice ocho minutos desde hace veinte.', weight: 1, hours: [6.5, 23], from: HOMES, to: { points: ['BUS_STOP'] }, stay: [4, 12], then: CITY },
      // Vida de trabajo en la calle (uniformes de data/npcs.ts): limpieza al amanecer, mantenimiento entre semana, repartos a la hora de comer y de cenar, pausas de oficina y quien espera un VTC a la salida de la noche.
      // Limpieza viaria (sweep: carrito, escoba y paradas a barrer junto a papeleras, bancos y mesas): de madrugada el parque, la calle y el metro; la plaza antes de que baje la gente; las terrazas tras la comida y un turno suelto de noche.
      { role: 'street-cleaner', ambient: true, label: 'Operario de limpieza', line: 'Hoy hay más hojas que ayer. Siempre hay más hojas.', weight: 7, hours: [6, 9.5], from: CITY, to: CITY, via: ['park-w', 'park-e'], pace: 'stroll', uniform: 'uniforme-limpieza', sweep: true, pause: 0, max: 1 },
      { role: 'street-cleaner', ambient: true, label: 'Operario de limpieza', line: 'La Mayor y el metro, antes de la hora punta. Y después también.', weight: 6, hours: [6.5, 10], from: CITY, to: CITY, via: ['METRO_MEET_01', 'NEWS_KIOSK', 'BUS_STOP'], pace: 'stroll', uniform: 'uniforme-limpieza', sweep: true, pause: 0, max: 1 },
      { role: 'street-cleaner', ambient: true, label: 'Operario de limpieza', line: 'La fuente y los bancos, antes de que baje la gente.', weight: 4, hours: [6, 9], from: CITY, to: { points: ['PLAZA_FOUNTAIN', 'PLAZA_BENCH_'] }, stay: [6, 14], stayState: 'SWEEP', then: CITY, uniform: 'uniforme-limpieza', sweep: true, max: 1 },
      { role: 'street-cleaner', ambient: true, label: 'Operario de limpieza', line: 'Tras la comida, las terrazas. Siempre igual.', weight: 3, hours: [15.5, 17.5], from: CITY, to: CITY, via: ['CAFE_TERRACE_WAITER', 'RESTAURANT_TERRACE_WAITER', 'METRO_MEET_01'], pace: 'stroll', uniform: 'uniforme-limpieza', sweep: true, pause: 0, max: 1 },
      { role: 'street-cleaner', ambient: true, label: 'Operario de limpieza', line: 'Un repaso a mediodía, que con tanto bocadillo...', weight: 1.5, hours: [12.5, 14], days: 'weekday', from: CITY, to: CITY, via: ['NEWS_KIOSK', 'BUS_STOP'], pace: 'stroll', uniform: 'uniforme-limpieza', sweep: true, pause: 0, max: 1 },
      { role: 'street-cleaner', ambient: true, label: 'Operario de limpieza', line: 'Turno de noche: lo que deja la gente al irse.', weight: 2, hours: [23, 1], from: CITY, to: CITY, via: ['METRO_MEET_01', 'CAFE_TERRACE_WAITER'], pace: 'stroll', uniform: 'uniforme-limpieza', sweep: true, pause: 0, max: 1 },
      { role: 'maintenance', ambient: true, label: 'Operario de mantenimiento', line: 'La fuente pierde agua. Otra vez.', weight: 4, hours: [8.5, 17], days: 'weekday', from: CITY, to: { points: ['PLAZA_FOUNTAIN'] }, stay: [12, 30], then: CITY, uniform: 'uniforme-mantenimiento', max: 1 },
      { role: 'courier', ambient: true, label: 'Repartidor', line: 'Dos pedidos más y acabo el turno.', weight: 7, hours: [13, 15.5], from: { points: ['RESTAURANT_ENTRANCE'] }, to: HOMES, uniform: 'uniforme-reparto', rainproof: true, max: 2 },
      { role: 'courier', ambient: true, label: 'Repartidor', line: 'Cena para tres en el tercero. Sin ascensor.', weight: 9, hours: [20.5, 23.5], from: { points: ['RESTAURANT_ENTRANCE'] }, to: HOMES, uniform: 'uniforme-reparto', rainproof: true, max: 3 },
      { role: 'work-break', ambient: true, label: 'Alguien en su descanso', line: 'Veinte minutos. Ni uno más.', weight: 25, hours: [10.5, 11.75], days: 'weekday', from: { points: ['OFFICE_ENTRANCE'] }, to: { points: ['PLAZA_BENCH_'] }, stay: [10, 18], stayState: 'DRINK', then: { points: ['OFFICE_ENTRANCE'] }, group: [1, 2], bond: ['coworkers'], max: 3 },
      { role: 'work-break', ambient: true, label: 'Alguien en su descanso', line: 'Sin móvil, sin correos. Cinco minutos de sol.', weight: 25, hours: [13.5, 15.5], days: 'weekday', from: { points: ['OFFICE_ENTRANCE'] }, to: { points: ['PLAZA_BENCH_'] }, stay: [10, 25], stayState: 'DRINK', then: { points: ['OFFICE_ENTRANCE'] }, group: [1, 3], bond: ['coworkers'], max: 3 },
      { role: 'ride-wait', ambient: true, label: 'Alguien esperando un VTC', line: 'Dice dos minutos. Lleva diez.', weight: 7, hours: [22.5, 3.5], from: NIGHT_OUT, to: { points: ['METRO_MEET_'] }, stay: [4, 10], stayState: 'PHONE', then: CITY, rainproof: true, group: [1, 3], bond: ['friends', 'couple'], max: 3 },
      { role: 'ride-wait', ambient: true, label: 'Alguien esperando un taxi', line: 'Al aeropuerto, y con tiempo. Por una vez.', weight: 3, hours: [5, 8], from: HOMES, to: { points: ['METRO_MEET_'] }, stay: [3, 8], stayState: 'PHONE', then: CITY, rainproof: true, max: 1 },
      // Gente de visita: en grupo, a la plaza a ver la fuente y el quiosco, y otra vez a la ciudad.
      { role: 'tourist', label: 'Gente de visita', line: 'Perdona, ¿la Plaza de la Fuente es esta? La del mapa.', weight: 1.5, hours: [10, 20.5], from: CITY, to: { points: ['PLAZA_FOUNTAIN', 'NEWS_KIOSK', 'PLAZA_BENCH_'] }, stay: [6, 15], then: CITY, group: [2, 3], bond: ['tourists'] },
      // Vida de barrio en la Mayor este: el pan por la mañana, el bar de abajo (desayuno, vermú, la noche y la puerta) y la tienda que cierra la última.
      { role: 'bakery', label: 'Alguien que va a por el pan', line: 'Una barra y dos napolitanas. Como cada mañana.', weight: 3, hours: [7.5, 11], from: HOMES, to: { points: ['BAKERY_ENTRANCE'] }, then: HOMES },
      { role: 'bakery', label: 'Alguien que va a por el pan', line: 'La barra de la tarde, que la de la mañana ya no existe.', weight: 1, hours: [17.5, 20.5], from: HOMES_OR_CITY, to: { points: ['BAKERY_ENTRANCE'] }, then: HOMES },
      { role: 'bakery', label: 'Alguien mirando el escaparate del horno', line: 'Sólo miro. Las palmeras no cuentan.', weight: 0.6, hours: [8, 20], from: HOMES_OR_CITY, to: { points: ['BAKERY_WINDOW'] }, stay: [1, 3], stayState: 'BROWSE', then: { points: ['BAKERY_ENTRANCE'], types: ['residence'] }, max: 2 },
      { role: 'rincon-breakfast', label: 'Alguien que baja a desayunar', line: 'Café con leche y media tostada. Lo de siempre, que ya ni lo pido.', weight: 2.5, hours: [7.5, 10.5], from: HOMES, to: { points: ['CORNER_BAR_ENTRANCE'] } },
      { role: 'rincon-vermut', label: 'Gente de vermú', line: 'Un vermú y unas bravas. El domingo empieza aquí.', weight: 3, hours: [12.5, 15], days: 'weekend', from: HOMES_OR_CITY, to: { points: ['CORNER_BAR_ENTRANCE'] }, group: [2, 3], bond: ['friends', 'family', 'couple'] },
      { role: 'rincon-night', label: 'Alguien que va al Rincón', line: 'Hay fútbol. No me gusta el fútbol. Voy igual.', weight: 1, hours: [19.5, 23.5], from: HOMES, to: { points: ['CORNER_BAR_ENTRANCE'] }, group: [1, 3], bond: ['friends'] },
      { role: 'rincon-smoke', label: 'Alguien a la puerta del bar', line: 'Salgo un momento, que dentro está la tele a todo volumen.', weight: 0.8, hours: [9, 1], from: { points: ['CORNER_BAR_ENTRANCE'] }, to: { points: ['CORNER_BAR_SMOKE_'] }, stay: [4, 10], then: { points: ['CORNER_BAR_ENTRANCE'] }, group: [1, 2], bond: ['friends'] },
      { role: 'late-shop', label: 'Alguien que baja a la tienda', line: 'Se me ha acabado la leche. A estas horas sólo abre Mari.', weight: 1.5, hours: [21, 1], from: HOMES, to: { points: ['GROCER_ENTRANCE'] }, then: HOMES },
      // La Plaza de la Fuente a lo largo del día. Mañana: el periódico, el perro y quien ataja hacia el metro.
      { role: 'kiosk', label: 'Alguien comprando el periódico', line: 'El periódico y el pan. En ese orden.', weight: 3, hours: [7.5, 11], from: HOMES, to: { points: ['NEWS_KIOSK'] }, stay: [1, 3], stayState: 'BROWSE', then: { points: ['BAKERY_ENTRANCE', 'CAFE_ENTRANCE'], types: ['residence'] }, max: 2 },
      { role: 'dog-walker', label: 'Alguien paseando al perro', line: 'Una vuelta a la fuente y para casa, que llego tarde.', weight: 1.5, hours: [7, 10], from: HOMES, to: HOMES, via: ['plaza-w', 'plaza-e'], pace: 'stroll', dog: true, pause: 0.6 },
      { role: 'commuter', label: 'Alguien atajando por la plaza', line: 'Por la plaza se ataja. Dos minutos. Uno, si corro.', weight: 1.5, hours: [7, 9.5], days: 'weekday', from: HOMES, to: TRANSIT, via: ['plaza-w', 'plaza-s'] },
      // Mañana y media tarde: los vecinos mayores en sus bancos. Tarde: familias, y quien se sienta con las bolsas.
      { role: 'plaza-elders', label: 'Vecinos de toda la vida', line: 'Esta plaza antes tenía un cine. Y yo, pelo.', weight: 3, hours: [10, 14.5], from: HOMES, to: { points: ['PLAZA_BENCH_'] }, stay: [20, 45], stayState: 'TALK', group: [1, 2], bond: ['friends', 'couple'] },
      { role: 'plaza-elders', label: 'Vecinos de toda la vida', line: 'Cuando baja el sol, aquí. Como siempre.', weight: 2, hours: [17, 19.5], from: HOMES, to: { points: ['PLAZA_BENCH_'] }, stay: [20, 40], stayState: 'TALK', group: [1, 2], bond: ['friends', 'couple'] },
      { role: 'plaza-family', label: 'Una familia en la plaza', line: 'Diez minutos más y a casa, que mañana hay cole.', weight: 2.5, hours: [16.5, 20.5], from: HOMES, to: { points: ['PLAZA_FOUNTAIN', 'PLAZA_BENCH_'] }, stay: [10, 25], stayState: 'TALK', group: [2, 4], bond: ['family'] },
      { role: 'plaza-rest', label: 'Alguien descansando con las bolsas', line: 'Me siento un momento, que las bolsas pesan más que yo.', weight: 2.5, hours: [11.5, 20], from: { tags: ['shop'] }, to: { points: ['PLAZA_BENCH_'] }, stay: [6, 15], stayState: 'PHONE', then: HOMES },
      // Noche: grupos en la fuente y parejas en los bancos. De madrugada, casi nadie.
      { role: 'plaza-evening', label: 'Gente en la fuente', line: '¿Cenamos algo o nos quedamos aquí hasta que nos echen?', weight: 3, hours: [20, 23], from: HOMES_OR_CITY, to: { points: ['PLAZA_FOUNTAIN', 'PLAZA_BENCH_'] }, stay: [10, 20], stayState: 'TALK', group: [2, 4], bond: ['friends'] },
      { role: 'plaza-couple', label: 'Una pareja en un banco', line: 'Cinco minutos más. Siempre son cinco minutos más.', weight: 2, hours: [20.5, 23.5], from: HOMES_OR_CITY, to: { points: ['PLAZA_BENCH_'] }, stay: [10, 25], stayState: 'TALK', group: [2, 2], bond: ['couple'] },
      { role: 'plaza-night', label: 'Alguien en la plaza de madrugada', line: 'Ni sueño ni ganas de subir. La fuente suena mejor de noche.', weight: 0.7, hours: [0.5, 3], from: HOMES, to: { points: ['PLAZA_BENCH_'] }, stay: [5, 15], stayState: 'PHONE', max: 2 },
      // Parque del Olmo: los mayores al sol por la mañana, parejas al anochecer y, algún fin de semana, un cumpleaños en la hierba.
      { role: 'park-elders', label: 'Vecinos al sol', line: 'A esta hora da el sol en este banco. Lo sabe todo el barrio.', weight: 3, hours: [9.5, 12.5], from: HOMES, to: { points: ['PARK_BENCH_'] }, stay: [20, 45], stayState: 'TALK', group: [1, 2], bond: ['friends', 'couple'] },
      { role: 'park-couple', label: 'Una pareja en el parque', line: 'Damos otra vuelta y te acompaño.', weight: 2, hours: [19, 22.5], from: HOMES_OR_CITY, to: { points: ['PARK_BENCH_', 'PARK_TALK_'] }, stay: [10, 25], stayState: 'TALK', group: [2, 2], bond: ['couple'] },
      { role: 'park-gathering', label: 'Un cumpleaños en el parque', line: 'Hemos traído tarta y nadie ha traído cuchillo.', weight: 1.2, hours: [17, 20.5], days: 'weekend', from: HOMES_OR_CITY, to: { points: ['PARK_TALK_', 'PARK_BENCH_'] }, stay: [20, 40], stayState: 'TALK', group: [3, 4], bond: ['friends', 'family'], max: 4 },
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
  // ------------------------------------------------------ Ribera Norte
  // El barrio del canal (data/ribera.ts): por la mañana, corredores y perros; por la tarde se llena el paseo y las
  // terrazas; al anochecer (de siete a once) es lo más animado: parejas, grupos y cenas fuera, y los corredores desaparecen.
  {
    location: 'ribera',
    bands: [
      [6, 7, 'LOW'], [7, 9, 'MEDIUM'], [9, 12, 'MEDIUM'], [12, 14, 'HIGH'], [14, 17, 'MEDIUM'],
      [17, 19, 'HIGH'], [19, 22, 'VERY_HIGH'], [22, 24, 'MEDIUM'], [0, 1, 'LOW'],
    ],
    // Viernes, sábado y domingo, más gente.
    weekday: [0, 0, 0, 0, 1, 2, 1],
    scale: 1.5,
    maxWalkers: 60,
    // El metro: un tren cada pocos minutos en hora punta, y de cada uno salen unos cuantos.
    bursts: [{ point: 'RB_METRO_FRONT', every: [[6.5, 10, 10], [17, 21, 8], [21, 24, 16]], size: [1, 2] }],
    draws: [{ place: 'arcade', perLevel: 1.5 }],
    // Las tres terrazas, cada una con su camarero y su carta (systems/TableService).
    tableService: [
      { place: 'bar-ribera', menu: 'bar-ribera', pass: 'RB_BAR_TERRACE_WAITER' },
      { place: 'cafe-rio', menu: 'cafe-rio', pass: 'RB_CAFE_TERRACE_WAITER' },
      { place: 'casa-mar', menu: 'casa-mar', pass: 'RB_CASAMAR_TERRACE_WAITER' },
    ],
    staff: [
      { service: 'waiter', place: 'bar-ribera', base: 'RB_BAR_TERRACE_WAITER', serves: ['RB_BAR_TERRACE_'], label: 'Camarero del Bar Ribera', line: 'Fuera, cañas y algo de picar. Lo fuerte, dentro.' },
      { service: 'waiter', place: 'cafe-rio', base: 'RB_CAFE_TERRACE_WAITER', serves: ['RB_CAFE_TERRACE_'], label: 'Camarera del Café del Río', line: '¿Un cortado al sol?' },
      { service: 'waiter', place: 'casa-mar', base: 'RB_CASAMAR_TERRACE_WAITER', serves: ['RB_CASAMAR_TERRACE_'], label: 'Camarero de Casa Mar', line: 'El arroz, mejor dentro de veinte minutos. Merece la pena.' },
    ],
    trips: [
      // Entre semana: de casa al metro y de vuelta.
      { role: 'commuter', label: 'Alguien con prisa', line: 'Llego tarde. Como todos los días.', weight: 4, hours: [7, 9.5], days: 'weekday', from: HOMES, to: TRANSIT },
      { role: 'returning', label: 'Alguien volviendo a casa', line: 'Hoy cena rápida y sofá.', weight: 4, hours: [17, 21], from: { types: ['transit'], edge: true }, to: HOMES },
      { role: 'metro-arrival', label: 'Alguien que sale del metro', line: 'Al fin aire. El vagón era una sauna.', weight: 2, hours: [6.5, 1.5], from: TRANSIT, to: { types: ['residence'], tags: ['shop', 'food', 'social'], edge: true } },
      { role: 'metro-meet', label: 'Alguien esperando a alguien', line: 'Me ha dicho que ya sale del metro.', weight: 2, hours: [8, 23], from: HOMES_OR_CITY, to: { points: ['RB_METRO_MEET_'] }, stay: [4, 12], stayState: 'PHONE', then: HOMES_OR_CITY, max: 2 },
      { role: 'errands', label: 'Alguien de recados', line: 'Hielo para esta noche. Y pan, que siempre falta.', weight: 2, hours: [9.5, 22], from: HOMES_OR_CITY, to: { tags: ['shop'] } },
      // Correr: por la mañana mucho; a mediodía casi nada; al caer la tarde algo; de noche, nadie.
      { role: 'jogger', label: 'Alguien corriendo', line: 'No me pares, que pierdo el ritmo.', weight: 4, hours: [6.5, 9.5], from: HOMES_OR_CITY, to: HOMES_OR_CITY, via: ['rb-pr02', 'rb-pr38'], pace: 'jog', pause: 0 },
      { role: 'jogger', label: 'Alguien corriendo', line: 'Una vuelta al canal y vuelvo.', weight: 1, hours: [12, 14], from: HOMES_OR_CITY, to: HOMES_OR_CITY, via: ['rb-pr02', 'rb-pr38'], pace: 'jog', pause: 0 },
      { role: 'jogger', label: 'Alguien corriendo', line: 'Cinco kilómetros más y ceno.', weight: 1.4, hours: [17.5, 20], from: HOMES_OR_CITY, to: HOMES_OR_CITY, via: ['rb-pr38', 'rb-pr02'], pace: 'jog', pause: 0 },
      { role: 'dog-walker', label: 'Alguien paseando al perro', line: 'No muerde. Bueno, casi nunca.', weight: 3, hours: [6.5, 10], from: HOMES, to: HOMES, via: ['rb-pr05', 'rb-pr35'], pace: 'stroll', dog: true, pause: 0.6 },
      { role: 'dog-walker', label: 'Alguien paseando al perro', line: 'Se para en cada farola. En todas.', weight: 1, hours: [13, 15], from: HOMES, to: HOMES, via: ['rb-pr05', 'rb-pr35'], pace: 'stroll', dog: true, pause: 0.6 },
      { role: 'dog-walker', label: 'Alguien paseando al perro', line: 'La última vuelta y a casa.', weight: 3, hours: [19, 23.5], from: HOMES, to: HOMES_OR_CITY, via: ['rb-pr05', 'rb-pr35'], pace: 'stroll', dog: true, pause: 0.6 },
      // Pasear y mirar el agua.
      // Trabajo en la calle de la Ribera: la limpieza del paseo al amanecer, repartos de las terrazas y el VTC de la salida.
      // Limpieza viaria (sweep: carrito, escoba y paradas a barrer): el paseo al amanecer, la plaza del metro, las terrazas tras la comida y un turno suelto de tarde.
      { role: 'street-cleaner', ambient: true, label: 'Operario de limpieza', line: 'El paseo se lleva lo peor: latas, colillas y patos.', weight: 7, hours: [6, 9.5], from: CITY, to: CITY, via: ['rb-pr05', 'rb-pr35'], pace: 'stroll', uniform: 'uniforme-limpieza', sweep: true, pause: 0, max: 2 },
      { role: 'street-cleaner', ambient: true, label: 'Operario de limpieza', line: 'Después de la comida, las terrazas. Siempre igual.', weight: 3, hours: [15.5, 17.5], from: CITY, to: CITY, via: ['RB_CAFE_TERRACE_WAITER', 'RB_CASAMAR_TERRACE_WAITER', 'RB_BAR_TERRACE_WAITER'], pace: 'stroll', uniform: 'uniforme-limpieza', sweep: true, pause: 0, max: 1 },
      { role: 'street-cleaner', ambient: true, label: 'Operario de limpieza', line: 'Turno de tarde: lo que deja la gente al irse.', weight: 2, hours: [22.5, 24], from: CITY, to: CITY, via: ['RB_METRO_FRONT', 'rb-pr05'], pace: 'stroll', uniform: 'uniforme-limpieza', sweep: true, pause: 0, max: 1 },
      { role: 'maintenance', ambient: true, label: 'Operario de mantenimiento', line: 'Otra farola fundida. Es la tercera del mes.', weight: 4, hours: [8.5, 17], days: 'weekday', from: CITY, to: { points: ['RB_VIEW_'] }, stay: [12, 30], then: CITY, uniform: 'uniforme-mantenimiento', max: 1 },
      { role: 'courier', ambient: true, label: 'Repartidor', line: 'Una paella para el segundo. Se enfría por el camino.', weight: 7, hours: [13, 15.5], from: { points: ['RB_CASAMAR_ENTRANCE', 'RB_BAR_ENTRANCE'] }, to: HOMES, uniform: 'uniforme-reparto', rainproof: true, max: 2 },
      { role: 'courier', ambient: true, label: 'Repartidor', line: 'Cena para tres. Y el timbre no funciona.', weight: 9, hours: [20.5, 23.5], from: { points: ['RB_CASAMAR_ENTRANCE', 'RB_BAR_ENTRANCE'] }, to: HOMES, uniform: 'uniforme-reparto', rainproof: true, max: 3 },
      { role: 'ride-wait', ambient: true, label: 'Alguien esperando un VTC', line: 'Dice dos minutos. Lleva diez.', weight: 7, hours: [22.5, 3.5], from: { points: ['RB_BAR_ENTRANCE'] }, to: { points: ['RB_METRO_FRONT'] }, stay: [4, 10], stayState: 'PHONE', then: CITY, rainproof: true, group: [1, 3], bond: ['friends', 'couple'], max: 3 },
      { role: 'riverside-walk', label: 'Gente paseando', line: 'Hace buena tarde para no hacer nada.', weight: 3, hours: [10, 21.5], from: HOMES_OR_CITY, to: HOMES_OR_CITY, via: ['rb-pr05', 'rb-pr35'], pace: 'stroll', group: [1, 3], bond: ['family', 'friends', 'couple'] },
      { role: 'riverside-walk', label: 'Gente paseando', line: 'Con esta luz da pena irse a casa.', weight: 4, hours: [18.5, 23], from: HOMES_OR_CITY, to: HOMES_OR_CITY, via: ['rb-pr38', 'rb-pr05'], pace: 'stroll', group: [2, 4], bond: ['friends', 'family'] },
      { role: 'couple-walk', label: 'Una pareja paseando', line: 'Íbamos a cenar y se nos ha hecho tarde mirando el agua.', weight: 4, hours: [17.5, 23.5], from: HOMES_OR_CITY, to: HOMES_OR_CITY, via: ['rb-pr05', 'rb-pr35'], pace: 'stroll', group: [2, 2], bond: ['couple'] },
      { role: 'river-bench', label: 'Alguien sentado junto al agua', line: 'Se está bien aquí. El canal no hace ruido.', weight: 2, hours: [9, 19], from: HOMES_OR_CITY, to: { points: ['RB_BENCH_'] }, stay: [15, 45], stayState: 'READ' },
      { role: 'river-bench', label: 'Gente en un banco', line: 'Cinco minutos más. Siempre son cinco minutos más.', weight: 3, hours: [18, 23], from: HOMES_OR_CITY, to: { points: ['RB_BENCH_'] }, stay: [15, 40], stayState: 'TALK', group: [2, 2], bond: ['couple', 'friends'] },
      { role: 'river-view', label: 'Gente mirando el canal', line: 'Mira, ahí va un pato. Y otro.', weight: 2, hours: [10, 18], from: HOMES_OR_CITY, to: { points: ['RB_VIEW_'] }, stay: [6, 18], stayState: 'TALK', group: [2, 3], bond: ['friends', 'couple', 'family'] },
      { role: 'river-view', label: 'Gente en la barandilla', line: 'Por esto vivo aquí. Por esto y por el alquiler, que no.', weight: 3.5, hours: [18, 23.5], from: HOMES_OR_CITY, to: { points: ['RB_VIEW_'] }, stay: [8, 25], stayState: 'TALK', group: [2, 3], bond: ['couple', 'friends'] },
      { role: 'skate-watch', label: 'Gente mirando skate', line: 'A ese le queda un truco. Siempre le queda uno.', weight: 1.5, hours: [14, 22], from: HOMES_OR_CITY, to: { points: ['RB_SKATE_WATCH_'] }, stay: [8, 20], stayState: 'TALK', group: [1, 3], bond: ['friends'] },
      // Helados.
      { role: 'ice-cream', label: 'Alguien con un helado', line: 'Si no me lo como rápido, me lo bebo.', weight: 3, hours: [12, 22], from: HOMES_OR_CITY, to: { points: ['RB_ICE_CREAM_'] }, stay: [3, 8], stayState: 'DRINK', group: [1, 3], bond: ['family', 'friends', 'couple'] },
      // Terrazas: café de día, comida a mediodía, cena y copa al anochecer.
      { role: 'terrace-cafe', label: 'Alguien en la terraza del Café del Río', line: 'Un cortado y la prensa. Sin prisa.', weight: 2.5, hours: [9, 19.5], from: HOMES_OR_CITY, to: { points: ['RB_CAFE_TERRACE_'] }, stay: [20, 45], stayState: 'DRINK', group: [1, 2], bond: ['friends', 'couple'] },
      { role: 'terrace-meal', label: 'Alguien comiendo fuera', line: 'Fuera se come mejor. Y se ve pasar a la gente.', weight: 2, hours: [13, 15.5], from: HOMES_OR_CITY, to: { points: ['RB_CASAMAR_TERRACE_'] }, stay: [30, 60], stayState: 'EAT', group: [1, 3], bond: ['coworkers', 'friends', 'couple'] },
      { role: 'terrace-meal', label: 'Alguien cenando fuera', line: 'Con esta noche, dentro ni loco.', weight: 4.5, hours: [20, 23.5], from: HOMES_OR_CITY, to: { points: ['RB_CASAMAR_TERRACE_'] }, stay: [45, 80], stayState: 'EAT', group: [2, 3], bond: ['couple', 'friends', 'family'] },
      { role: 'bar-terrace', label: 'Alguien en la terraza del bar', line: 'Una caña. Una. Ya veremos.', weight: 3, hours: [17.5, 24], from: HOMES_OR_CITY, to: { points: ['RB_BAR_TERRACE_'] }, stay: [25, 60], stayState: 'DRINK', group: [1, 3], bond: ['friends', 'couple'] },
      { role: 'bar-night', label: 'Alguien que va al bar', line: 'Una y a casa. La de siempre.', weight: 2.5, hours: [18, 1.5], from: HOMES_OR_CITY, to: { points: ['RB_BAR_ENTRANCE'] }, group: [1, 3], bond: ['friends', 'couple'] },
      // Deporte: la pista, las barras y las esterillas. Más por la tarde; los fines de semana, lleno.
      { role: 'hoops', label: 'Alguien jugando a baloncesto', line: 'Un uno contra uno. Voy ganando. Creo.', weight: 3, hours: [10, 21], from: HOMES_OR_CITY, to: { points: ['HOOPS_'] }, stay: [15, 35], group: [1, 2], bond: ['friends'] },
      { role: 'hoops', label: 'Gente en la pista', line: 'Equipos de dos. Quien pierde, sale.', weight: 3, hours: [11, 21.5], days: 'weekend', from: HOMES_OR_CITY, to: { points: ['HOOPS_'] }, stay: [20, 45], group: [2, 3], bond: ['friends'] },
      { role: 'calisthenics', label: 'Alguien haciendo dominadas', line: 'Doce. Hoy toca doce.', weight: 2, hours: [6.5, 10], from: HOMES_OR_CITY, to: { points: ['PULLUP_'] }, stay: [10, 22] },
      { role: 'calisthenics', label: 'Alguien haciendo dominadas', line: 'Una serie más y paro. Es mentira.', weight: 2.5, hours: [16, 20.5], from: HOMES_OR_CITY, to: { points: ['PULLUP_'] }, stay: [10, 22], group: [1, 2], bond: ['friends', 'gym'] },
      { role: 'cali-stretch', label: 'Alguien estirando', line: 'Estirar es lo único que se salta todo el mundo.', weight: 1.2, hours: [7, 21], from: HOMES_OR_CITY, to: { points: ['CALI_MAT_'] }, stay: [5, 10] },
      { role: 'court-watch', label: 'Alguien esperando turno', line: 'Estoy el siguiente. Llevo el siguiente una hora.', weight: 1.2, hours: [10, 21], from: HOMES_OR_CITY, to: { points: ['RB_COURT_REST_'] }, stay: [8, 20], stayState: 'PHONE', group: [1, 2], bond: ['friends'] },
      // El salón recreativo: por la tarde y noche, y más los fines de semana.
      { role: 'gamer', label: 'Alguien que va al salón', line: 'Una partida. Una. Con tres monedas.', weight: 3, hours: [14, 24], from: HOMES_OR_CITY, to: { points: ['RB_ARCADE_ENTRANCE'] }, group: [1, 3], bond: ['friends'] },
      { role: 'gamer', label: 'Gente que va al salón', line: 'El récord de la máquina de carreras es mío. Todavía.', weight: 5, hours: [12, 24], days: 'weekend', from: HOMES_OR_CITY, to: { points: ['RB_ARCADE_ENTRANCE'] }, group: [2, 4], bond: ['friends'] },
      // Gente de visita y de paso.
      { role: 'tourist', label: 'Gente de visita', line: 'Perdona, ¿el canal es por aquí? Es que el mapa lo pinta distinto.', weight: 1.5, hours: [10, 20], from: CITY, to: { points: ['RB_VIEW_', 'RB_BENCH_'] }, stay: [6, 15], then: CITY, group: [2, 3], bond: ['tourists'] },
      { role: 'passer', label: 'Alguien de paso', line: 'Perdona, voy con prisa.', weight: 2, from: CITY, to: CITY },
      { role: 'night-walker', label: 'Alguien volviendo tarde', line: 'Ya es tardísimo...', weight: 1, hours: [22, 6], from: { types: ['transit'], edge: true }, to: HOMES },
    ],
  },
  // ------------------------------------------------------ Cuatro Ríos
  // Ciudad densa de diario (data/cuatroRios.ts). Lo que la define son las dos horas punta: de 7:30 a 9:30 todo el
  // barrio baja al metro, a la parada y al trabajo; de 17:00 a 20:00 vuelve, compra, entrena y queda. Entre medias,
  // recados, comidas, repartos y gente de paso; de noche, la tienda de abajo y quien vuelve tarde.
  {
    location: 'cuatro-rios',
    bands: [
      [6, 7, 'LOW'], [7, 7.5, 'MEDIUM'], [7.5, 9.5, 'VERY_HIGH'], [9.5, 12, 'MEDIUM'], [12, 14, 'HIGH'], [14, 17, 'MEDIUM'],
      [17, 20, 'VERY_HIGH'], [20, 22, 'HIGH'], [22, 24, 'MEDIUM'], [0, 1, 'LOW'],
    ],
    // El domingo, sin hora punta.
    weekday: [0, 0, 0, 0, 0, 0, -1],
    scale: 1.6,
    maxWalkers: 64,
    // El metro: en hora punta, un tren cada tres minutos de juego y de cada uno sale un grupo; el resto del día, menos.
    bursts: [{ point: 'CR_METRO_ENTRANCE', every: [[6.5, 7.5, 8], [7.5, 9.5, 3], [9.5, 17, 10], [17, 20, 3], [20, 24, 12], [0, 1.5, 20]], size: [2, 4] }],
    draws: [{ place: 'cr-arcade', perLevel: 1 }],
    trips: [
      // Hora punta de la mañana: al metro y a la parada; quien llega a trabajar a las tiendas; estudiantes y el cole.
      { role: 'commuter', label: 'Alguien con prisa', line: 'Si pierdo este, llego tarde. Si cojo este, también.', weight: 8, hours: [7.5, 9.5], days: 'weekday', from: HOMES, to: TRANSIT },
      { role: 'commuter-student', label: 'Estudiante con la mochila', line: 'Examen a las nueve. Lo llevo... más o menos.', weight: 4, hours: [7.5, 9.25], days: 'weekday', from: HOMES, to: TRANSIT, group: [1, 2], bond: ['friends'] },
      { role: 'metro-arrival', label: 'Alguien que llega a trabajar', line: 'Abro la persiana a las nueve. Son menos cinco.', weight: 4, hours: [7.5, 9.5], days: 'weekday', from: TRANSIT, to: { tags: ['work'] } },
      { role: 'plaza-family-school', label: 'Una familia camino del cole', line: 'Corre, que cierran la puerta a las nueve.', weight: 3, hours: [8, 9.25], days: 'weekday', from: HOMES, to: CITY, group: [2, 3], bond: ['family'] },
      { role: 'bakery', label: 'Alguien que va a por el pan', line: 'Una barra y un café para llevar, y al metro.', weight: 3, hours: [7, 10], from: HOMES, to: { points: ['CR_BAKERY_ENTRANCE'] }, then: TRANSIT },
      { role: 'bus', label: 'Alguien esperando el bus', line: 'El 27 viene lleno. El siguiente, también.', weight: 3, hours: [7, 9.5], days: 'weekday', from: HOMES, to: { points: ['CR_BUS_STOP'] }, stay: [3, 8], stayState: 'PHONE', then: CITY, max: 4 },
      { role: 'gym', label: 'Alguien que va al gimnasio', line: 'Media hora antes de currar. Si no, no voy.', weight: 2, hours: [6.5, 9], from: HOMES, to: { points: ['CR_GYM_ENTRANCE'] } },
      // Hora punta de la tarde: vuelta a casa, compras de camino, gimnasio y quedar al salir.
      { role: 'returning', label: 'Alguien volviendo a casa', line: 'Compro algo de camino y a casa. Ni un plan más.', weight: 8, hours: [17, 20.5], from: { types: ['transit'], edge: true }, to: HOMES },
      { role: 'shopper', label: 'Alguien con bolsas', line: 'Lo de la cena, y ya que estoy, lo de mañana.', weight: 4, hours: [17, 20.5], from: { types: ['transit'], edge: true }, to: { tags: ['shop'] }, then: HOMES },
      { role: 'gym', label: 'Alguien que va al gimnasio', line: 'Del trabajo al gimnasio sin pasar por casa. Si paso, no salgo.', weight: 3, hours: [17, 21], from: { types: ['transit', 'residence'] }, to: { points: ['CR_GYM_ENTRANCE'] }, group: [1, 2], bond: ['gym'] },
      { role: 'after-work', label: 'Compañeros a la salida del trabajo', line: '¿Una pizza y para casa? Venga, una.', weight: 3, hours: [17.5, 21], days: 'weekday', from: { types: ['transit'], edge: true }, to: { points: ['CR_MEET_', 'CR_ARCADE_HANG_'] }, stay: [8, 20], stayState: 'TALK', then: { tags: ['food', 'game'], types: ['transit'], edge: true }, group: [2, 4], bond: ['coworkers', 'friends'], max: 4 },
      { role: 'bus', label: 'Alguien esperando el bus', line: 'Dice tres minutos. Lleva tres minutos diciéndolo.', weight: 2, hours: [17, 20.5], from: { tags: ['shop', 'work'], edge: true }, to: { points: ['CR_BUS_STOP'] }, stay: [3, 8], stayState: 'PHONE', then: CITY, max: 4 },
      // El metro a cualquier hora: quien sale y quien espera a alguien que sale.
      { role: 'metro-arrival', label: 'Alguien que sale del metro', line: 'Qué agobio de vagón. Y eso que hoy iba vacío.', weight: 3, hours: [6.5, 1.5], from: TRANSIT, to: { types: ['residence'], tags: ['shop', 'food'], edge: true } },
      { role: 'metro-meet', label: 'Alguien esperando a alguien', line: 'Me ha escrito que ya sube. Hace diez minutos.', weight: 3, hours: [8, 23], from: HOMES_OR_CITY, to: { points: ['CR_METRO_MEET_'] }, stay: [4, 12], stayState: 'PHONE', then: TRANSIT, max: 3 },
      // El resto del día: recados, escaparates, comida y la plaza.
      { role: 'errands', label: 'Alguien de recados', line: 'Farmacia, frutería y la recarga. Por ese orden.', weight: 4, hours: [9.5, 21], from: HOMES_OR_CITY, to: { tags: ['shop'] } },
      { role: 'shopper', label: 'Alguien con bolsas', line: 'Sólo venía a por tomates.', weight: 2, hours: [10, 21], from: { tags: ['shop'] }, to: HOMES_OR_CITY },
      { role: 'window-shopper', label: 'Alguien mirando escaparates', line: 'Este móvil vale lo que mi alquiler. Sólo miro.', weight: 2, hours: [10, 21], from: HOMES_OR_CITY, to: { points: ['CR_FRUIT_WINDOW', 'CR_PHONE_WINDOW', 'CR_HILVANA_WINDOW', 'CR_AMBAR_WINDOW'] }, stay: [1, 4], stayState: 'BROWSE', then: { tags: ['shop'], types: ['residence'], edge: true }, max: 4 },
      { role: 'diner', label: 'Alguien que va a comer', line: 'Menú rápido y vuelvo, que tengo cuarenta minutos.', weight: 3, hours: [13, 15.5], from: { tags: ['work'], edge: true }, to: { points: ['CR_PIZZA_ENTRANCE', 'CR_BURGER_ENTRANCE', 'CR_SUSHI_ENTRANCE'] }, group: [1, 3], bond: ['coworkers', 'friends'] },
      { role: 'diner', label: 'Alguien que va a cenar', line: 'Hoy no cocina nadie. Está decidido.', weight: 3, hours: [20, 23], from: HOMES_OR_CITY, to: { points: ['CR_PIZZA_ENTRANCE', 'CR_BURGER_ENTRANCE', 'CR_SUSHI_ENTRANCE'] }, group: [2, 4], bond: ['family', 'friends', 'couple'] },
      { role: 'plaza-elders', label: 'Vecinos de toda la vida', line: 'Aquí antes había una mercería. Y antes, un cine.', weight: 2, hours: [10, 13], from: HOMES, to: { points: ['CR_PLAZA_BENCH_'] }, stay: [15, 35], stayState: 'TALK', group: [1, 2], bond: ['friends', 'couple'] },
      { role: 'plaza-family', label: 'Una familia en la plaza', line: 'Cinco minutos, que la merienda se acaba antes que las ganas.', weight: 2, hours: [17, 20], from: HOMES, to: { points: ['CR_PLAZA_BENCH_', 'CR_METRO_MEET_'] }, stay: [8, 18], stayState: 'TALK', group: [2, 4], bond: ['family'] },
      { role: 'gamer', label: 'Gente que va a los recreativos', line: 'Salimos de clase y directos. La de carreras es nuestra.', weight: 3, hours: [15, 23], from: HOMES_OR_CITY, to: { points: ['CR_ARCADE_ENTRANCE'] }, group: [2, 3], bond: ['friends'] },
      { role: 'dog-walker', label: 'Alguien paseando al perro', line: 'Una vuelta a la manzana. Él decide cuál.', weight: 2, hours: [7, 9.5], from: HOMES, to: HOMES, via: ['cr-b03', 'cr-b37'], pace: 'stroll', dog: true, pause: 0.6 },
      { role: 'dog-walker', label: 'Alguien paseando al perro', line: 'La última y a casa.', weight: 2, hours: [20, 23.5], from: HOMES, to: HOMES, via: ['cr-b37', 'cr-b03'], pace: 'stroll', dog: true, pause: 0.6 },
      { role: 'late-shop', label: 'Alguien que baja a la tienda', line: 'Leche y pan. Y algo de picar, que es viernes. O jueves.', weight: 2, hours: [21, 2], from: HOMES, to: { points: ['CR_ABIERTO_ENTRANCE'] }, then: HOMES },
      // Trabajo en la calle: limpieza antes de la hora punta, y repartidores a la hora de comer y de cenar.
      { role: 'street-cleaner', ambient: true, label: 'Operario de limpieza', line: 'La plaza del metro antes de las siete y media. Luego, imposible.', weight: 6, hours: [6, 7.5], from: CITY, to: CITY, via: ['cr-pl-w', 'cr-pl-e', 'cr-b37'], pace: 'stroll', uniform: 'uniforme-limpieza', sweep: true, pause: 0, max: 1 },
      { role: 'street-cleaner', ambient: true, label: 'Operario de limpieza', line: 'Después de la hora punta, la avenida es un cenicero.', weight: 3, hours: [9.5, 11.5], from: CITY, to: CITY, via: ['cr-s03', 'cr-s25', 'CR_AMBAR_WINDOW'], pace: 'stroll', uniform: 'uniforme-limpieza', sweep: true, pause: 0, max: 1 },
      { role: 'courier', ambient: true, label: 'Repartidor', line: 'Tres pedidos, dos portales y un timbre que no va.', weight: 8, hours: [12.5, 15.5], from: { points: ['CR_PIZZA_ENTRANCE', 'CR_BURGER_ENTRANCE', 'CR_SUSHI_ENTRANCE'] }, to: HOMES, uniform: 'uniforme-reparto', rainproof: true, max: 3 },
      { role: 'courier', ambient: true, label: 'Repartidor', line: 'Cena para cuatro en el quinto. Sin ascensor, claro.', weight: 10, hours: [19.5, 23.5], from: { points: ['CR_PIZZA_ENTRANCE', 'CR_BURGER_ENTRANCE', 'CR_SUSHI_ENTRANCE'] }, to: HOMES, uniform: 'uniforme-reparto', rainproof: true, max: 4 },
      // De paso, a cualquier hora, y quien vuelve tarde.
      { role: 'passer', label: 'Alguien de paso', line: 'Perdona, voy con prisa.', weight: 3, from: CITY, to: CITY },
      { role: 'night-walker', label: 'Alguien volviendo tarde', line: 'El último metro. Por los pelos.', weight: 1.5, hours: [22, 6], from: { types: ['transit'], edge: true }, to: HOMES },
    ],
  },
  // ------------------------------------------------------ Distrito Arena
  // El barrio del estadio (data/arena.ts). Un día normal: vecinos, el café y los dos bares, quien trabaja en las tiendas
  // y alguna visita que se hace la foto con la fachada. Un día de partido (systems/Match) manda el saque: `match` sube o
  // baja la gente y el tope, los trenes llegan llenos y los viajes con `match` sólo salen en su fase. Tope en día de
  // partido: 36 + 36 a la salida, dentro del presupuesto de gente de la calidad baja (config/budgets.ts).
  {
    location: 'arena',
    bands: [[7, 9.5, 'LOW'], [9.5, 13, 'LOW'], [13, 15.5, 'MEDIUM'], [15.5, 19.5, 'LOW'], [19.5, 23, 'MEDIUM'], [23, 24, 'LOW']],
    weekday: [0, 0, 0, 0, 0, 0, 0],
    scale: 1.1,
    maxWalkers: 36,
    match: { 'build-up': 14, arrival: 30, live: -10, leaving: 36, after: 12 },
    bursts: [
      { point: 'AR_METRO_ENTRANCE', every: [[7, 10, 8], [10, 21, 12], [21, 24, 15], [0, 1.5, 20]], size: [1, 2] },
      // Día de partido: un tren cada tres minutos de juego, y de cada uno sale un grupo de afición.
      { point: 'AR_METRO_ENTRANCE', every: [[0, 24, 3]], size: [3, 6], match: ['build-up', 'arrival'] },
    ],
    draws: [{ place: 'ar-larguero', perLevel: 1 }, { place: 'ar-grada', perLevel: 1 }],
    trips: [
      // ---- Un día cualquiera.
      { role: 'coffee', label: 'Alguien a por el café', line: 'Un cortado y el periódico deportivo. Lo de siempre.', weight: 3, hours: [7.5, 11], from: HOMES_OR_CITY, to: { points: ['AR_CAFE_ENTRANCE'] } },
      { role: 'shift-shop', label: 'Alguien que llega a abrir', line: 'Abro a las diez. Los días de partido, a las nueve y con refuerzos.', weight: 2, hours: [9.5, 10.75], from: TRANSIT, to: { tags: ['work'] } },
      { role: 'metro-arrival', label: 'Alguien que sale del metro', line: 'Una parada después del centro y parece otro barrio. Lo es.', weight: 2, hours: [7, 24], from: TRANSIT, to: { types: ['residence'], tags: ['shop', 'food'], edge: true } },
      { role: 'returning', label: 'Alguien volviendo a casa', line: 'Vivir al lado del estadio: tranquilo seis días, el séptimo no hay quien aparque.', weight: 4, hours: [17, 21.5], from: { types: ['transit'], edge: true }, to: HOMES },
      { role: 'errands', label: 'Alguien de recados', line: 'Las zapatillas del crío y el pan. Por ese orden.', weight: 2, hours: [10, 20.5], from: HOMES_OR_CITY, to: { tags: ['shop'] } },
      { role: 'window-shopper', label: 'Alguien mirando el escaparate', line: 'La camiseta nueva. Sesenta y cinco euros. Me la miro otra semana.', weight: 2, hours: [10, 21], from: HOMES_OR_CITY, to: { points: ['AR_DEPORTES_WINDOW', 'AR_OFICIAL_WINDOW'] }, stay: [1, 3], stayState: 'BROWSE', then: { tags: ['shop'], types: ['transit'], edge: true }, max: 2 },
      { role: 'stadium-visit', label: 'Visitantes del estadio', line: '¿Nos haces una foto con la fachada? Que se vea el halcón.', weight: 2, hours: [10, 19], from: TRANSIT, to: { points: ['AR_PHOTO_'] }, stay: [2, 5], stayState: 'WAIT', then: { points: ['AR_TAQUILLA_', 'AR_OFICIAL_ENTRANCE'], types: ['transit'] }, group: [2, 3], bond: ['tourists', 'family', 'friends'], max: 2 },
      { role: 'ticket', label: 'Alguien en la taquilla', line: 'Dos para el sábado, en el fondo. Si queda.', weight: 1, hours: [10, 20], from: HOMES_OR_CITY, to: { points: ['AR_TAQUILLA_'] }, stay: [2, 4], stayState: 'WAIT', then: CITY, max: 2 },
      { role: 'diner', label: 'Alguien que va a comer', line: 'Menú rápido, que a las cuatro abro la tienda.', weight: 3, hours: [13, 15.5], from: { tags: ['work'], edge: true }, to: { points: ['AR_BURGER_ENTRANCE', 'AR_PIZZA_ENTRANCE'] }, group: [1, 3], bond: ['coworkers', 'friends'] },
      { role: 'diner', label: 'Alguien que va a cenar', line: 'Pizza y a casa, que mañana se madruga.', weight: 3, hours: [20, 23], from: HOMES_OR_CITY, to: { points: ['AR_BURGER_ENTRANCE', 'AR_PIZZA_ENTRANCE'] }, group: [2, 4], bond: ['family', 'friends', 'couple'] },
      { role: 'after-work', label: 'Alguien que va al bar', line: 'Una caña y a casa. El partido es el sábado; hoy, la caña.', weight: 2, hours: [18.5, 23.5], from: { types: ['transit'], edge: true }, to: { tags: ['arena-bar'] }, group: [1, 3], bond: ['coworkers', 'friends'] },
      { role: 'bar-door', label: 'Alguien con la caña en la puerta', line: 'Dentro no se oye ni la tele. Aquí fuera se está mejor.', weight: 1, hours: [19.5, 24], from: { tags: ['arena-bar'] }, to: { points: ['AR_LARGUERO_OUT_', 'AR_GRADA_OUT_'] }, stay: [8, 18], stayState: 'DRINK', then: HOMES_OR_CITY, max: 3 },
      { role: 'jogger', label: 'Alguien corriendo', line: 'Tres vueltas al estadio son cinco kilómetros. Me lo ha dicho el reloj.', weight: 2, hours: [7, 9.5], from: HOMES, to: HOMES, via: ['ar-p05', 'ar-p50'], pace: 'jog', pause: 0 },
      { role: 'jogger', label: 'Alguien corriendo', line: 'A esta hora la explanada es mía.', weight: 2, hours: [19, 21.5], from: HOMES, to: HOMES, via: ['ar-p50', 'ar-p05'], pace: 'jog', pause: 0 },
      { role: 'dog-walker', label: 'Alguien paseando al perro', line: 'Los días de partido no salimos. Hoy, sí.', weight: 2, hours: [7, 9.5], from: HOMES, to: HOMES, via: ['ar-p11', 'ar-p43'], pace: 'stroll', dog: true, pause: 0.6 },
      { role: 'dog-walker', label: 'Alguien paseando al perro', line: 'La última vuelta, por la explanada.', weight: 2, hours: [20.5, 23.5], from: HOMES, to: HOMES, via: ['ar-p43', 'ar-p11'], pace: 'stroll', dog: true, pause: 0.6 },
      { role: 'passer', label: 'Alguien de paso', line: 'Perdona, voy con prisa.', weight: 2, from: CITY, to: CITY },
      { role: 'street-cleaner', ambient: true, label: 'Operario de limpieza', line: 'La explanada a primera hora. Un día normal, se barre en diez minutos.', weight: 5, hours: [6, 8], from: CITY, to: CITY, via: ['ar-p05', 'ar-p50', 'ar-s41'], pace: 'stroll', uniform: 'uniforme-limpieza', sweep: true, pause: 0, max: 1 },
      { role: 'courier', ambient: true, label: 'Repartidor', line: 'Seis pizzas a la Avenida del Estadio. Hoy no hay partido y aun así.', weight: 6, hours: [20, 23.5], from: { points: ['AR_PIZZA_ENTRANCE', 'AR_BURGER_ENTRANCE'] }, to: HOMES, uniform: 'uniforme-reparto', rainproof: true, max: 2 },

      // ---- Día de partido, horas antes (build-up): llega la afición, los bares se llenan, salen los puestos y la policía.
      { role: 'fan-bar', label: 'Aficionados camino del bar', line: 'Primero, al Larguero. Al estadio se llega cantando.', weight: 8, match: ['build-up'], from: { types: ['transit'], edge: true }, to: { tags: ['arena-bar'] }, group: [2, 5], bond: ['friends', 'family', 'coworkers'], fan: 0.85 },
      { role: 'fan-bar-door', label: 'Aficionado con la caña en la puerta', line: 'Dentro no cabe nadie más. Aquí fuera se canta mejor.', weight: 6, match: ['build-up'], from: { tags: ['arena-bar'], types: ['transit'] }, to: { points: ['AR_LARGUERO_OUT_', 'AR_GRADA_OUT_'] }, stay: [12, 25], stayState: 'DRINK', then: { points: ['AR_GATE_'] }, group: [1, 3], bond: ['friends'], fan: 0.9, max: 6 },
      { role: 'fan-gather', label: 'Peña cantando en la explanada', line: '¡Ha-lco-nes! ¡Ha-lco-nes!', weight: 6, match: ['build-up', 'arrival'], from: { types: ['transit'], tags: ['arena-bar'], edge: true }, to: { points: ['AR_FANS_'] }, stay: [8, 20], stayState: 'TALK', then: { points: ['AR_GATE_'] }, group: [2, 4], bond: ['friends', 'family'], fan: 0.95, max: 8 },
      { role: 'fan-photo', label: 'Aficionados haciéndose la foto', line: 'Una con la fachada, que es su primer partido.', weight: 2, match: ['build-up', 'arrival'], from: { types: ['transit'], edge: true }, to: { points: ['AR_PHOTO_'] }, stay: [1, 3], stayState: 'WAIT', then: { points: ['AR_GATE_'] }, group: [2, 3], bond: ['family', 'friends', 'couple'], fan: 0.85, max: 2 },
      { role: 'fan-merch', label: 'Aficionado comprando la bufanda', line: 'La de este año. La del año pasado ya da mala suerte.', weight: 4, match: ['build-up', 'arrival'], from: { types: ['transit'], edge: true }, to: { points: ['AR_SCARF_', 'AR_KIOSK_'] }, stay: [1, 3], stayState: 'WAIT', then: { points: ['AR_GATE_', 'AR_FANS_'] }, group: [1, 2], bond: ['family', 'friends'], fan: 0.6, max: 3 },
      { role: 'fan-food', label: 'Aficionado en el puesto de bocadillos', line: 'Uno de lomo para dentro, que el descanso es muy corto.', weight: 3, match: ['build-up', 'arrival'], from: { types: ['transit'], edge: true }, to: { points: ['AR_FOOD_'] }, stay: [1, 3], stayState: 'WAIT', then: { points: ['AR_GATE_'] }, group: [1, 2], bond: ['friends', 'family'], fan: 0.8, max: 2 },
      { role: 'fan-shop', label: 'Aficionado camino de la tienda oficial', line: 'La camiseta nueva, con el nombre detrás. Hoy estreno.', weight: 3, match: ['build-up', 'arrival'], from: { types: ['transit'], edge: true }, to: { points: ['AR_OFICIAL_ENTRANCE', 'AR_DEPORTES_ENTRANCE'] }, group: [1, 3], bond: ['family', 'friends'], fan: 0.6 },
      { role: 'stall-browse', label: 'Alguien mirando las bufandas', line: '¿Y ésta cuánto? ¿Y si me llevo dos, una para mi padre?', weight: 4, act: 'ar-manta-bufandas', from: { types: ['transit'], edge: true }, to: { points: ['AR_PITCH_A_SEE_'] }, stay: [2, 4], stayState: 'BROWSE', then: { points: ['AR_GATE_', 'AR_FANS_'] }, group: [1, 2], bond: ['friends', 'family'], fan: 0.7, max: 2 },
      { role: 'stall-browse', label: 'Alguien comprando pipas', line: 'Una bolsa grande y un agua. Que el partido es largo.', weight: 3, act: 'ar-bandeja', from: { types: ['transit'], edge: true }, to: { points: ['AR_PITCH_B_SEE_'] }, stay: [1, 2], stayState: 'BROWSE', then: { points: ['AR_GATE_'], types: ['transit'] }, fan: 0.8, max: 2 },
      { role: 'stall-browse', label: 'Alguien mirando camisetas', line: 'La del partido de hoy, con la fecha. Para el recuerdo.', weight: 3, act: 'ar-manta-camisetas', from: { types: ['transit'], edge: true }, to: { points: ['AR_PITCH_C_SEE_'] }, stay: [2, 4], stayState: 'BROWSE', then: { points: ['AR_GATE_'], types: ['transit'] }, fan: 0.7, max: 2 },

      // ---- La última hora y media (arrival): riadas hacia los tornos y colas en cada puerta.
      { role: 'fan-direct', label: 'Aficionados camino de su puerta', line: 'Puerta 4, fila 12. O la 12, puerta 4. Ya lo veremos.', weight: 12, match: ['arrival'], from: { types: ['transit'], edge: true }, to: { points: ['AR_GATE_'] }, group: [1, 4], bond: ['friends', 'family', 'couple'], fan: 0.85 },
      ...[1, 2, 3, 4, 5].map((n): TripRule => ({ role: 'fan-queue', label: `Aficionado en la cola de la Puerta ${n}`, line: 'Abono en el móvil y el brazo arriba. Que no se apague la pantalla.', weight: 4, match: ['arrival'], from: { types: ['transit'], edge: true }, to: { points: [`AR_Q${n}_`] }, stay: [1, 3], stayState: 'WAIT', then: { points: [`AR_GATE_${n}`] }, group: [1, 2], bond: ['friends', 'family'], fan: 0.85, max: 3 })),
      { role: 'ticket', label: 'Aficionado recogiendo la entrada', line: 'Está a mi nombre. Sí, con el DNI. Sí, ese soy yo con barba.', weight: 3, match: ['build-up', 'arrival'], from: { types: ['transit'], edge: true }, to: { points: ['AR_TAQUILLA_'] }, stay: [2, 4], stayState: 'WAIT', then: { points: ['AR_GATE_'] }, fan: 0.7, max: 2 },

      // ---- Durante el partido (live): la calle se queda casi vacía; algún rezagado corriendo y quien lo sigue desde la puerta del bar.
      { role: 'fan-late', label: 'Aficionado que llega tarde', line: '¿Cómo van? ¿Ya? ¿Quién ha marcado?', weight: 2, match: ['live'], from: TRANSIT, to: { points: ['AR_GATE_'] }, pace: 'jog', fan: 0.9, max: 2 },
      { role: 'fan-bar-door', label: 'Aficionado oyendo el partido en la puerta del bar', line: 'Sin entrada, pero con la radio. Es casi lo mismo. Casi.', weight: 2, match: ['live'], from: { tags: ['arena-bar'] }, to: { points: ['AR_LARGUERO_OUT_', 'AR_GRADA_OUT_'] }, stay: [15, 30], stayState: 'DRINK', then: { tags: ['arena-bar'] }, fan: 0.9, max: 3 },

      // ---- El pitido final (leaving): salida masiva por todas las puertas, cola en el metro, a cenar o al bar.
      { role: 'fan-exit', label: 'Aficionados saliendo del estadio', line: '¡Qué partido! Bueno, la segunda parte. La primera, mejor ni hablar.', weight: 12, match: ['leaving'], from: { points: ['AR_GATE_'] }, to: { types: ['transit'], edge: true }, group: [2, 4], bond: ['friends', 'family', 'couple'], fan: 0.85 },
      { role: 'fan-metro-queue', label: 'Aficionado en la cola del metro', line: 'Tres trenes y aún no hemos bajado. Tranquilos, que hay para todos.', weight: 8, match: ['leaving'], from: { points: ['AR_GATE_'] }, to: { points: ['AR_METRO_Q_'] }, stay: [2, 6], stayState: 'WAIT', then: TRANSIT, fan: 0.85, max: 6 },
      { role: 'fan-celebrate', label: 'Peña celebrándolo en la explanada', line: '¡Eeeeh, Halcones, eeeeh!', weight: 4, match: ['leaving'], from: { points: ['AR_GATE_'] }, to: { points: ['AR_FANS_'] }, stay: [5, 12], stayState: 'TALK', then: { tags: ['arena-bar', 'food'], types: ['transit'] }, group: [2, 4], bond: ['friends'], fan: 0.95, max: 8 },
      { role: 'fan-dinner', label: 'Aficionados camino de cenar', line: 'Hamburguesa y a comentar el penalti. Que no lo era.', weight: 5, match: ['leaving', 'after'], from: { points: ['AR_GATE_'], types: ['transit'] }, to: { points: ['AR_BURGER_ENTRANCE', 'AR_PIZZA_ENTRANCE'] }, group: [2, 4], bond: ['friends', 'family'], fan: 0.8 },
      { role: 'fan-bar', label: 'Aficionados camino del bar', line: 'La última y a casa. Ésa la decimos siempre.', weight: 6, match: ['leaving', 'after'], from: { points: ['AR_GATE_'], types: ['transit'] }, to: { tags: ['arena-bar'] }, group: [2, 5], bond: ['friends'], fan: 0.85 },
      { role: 'fan-exit-walk', label: 'Aficionado volviendo andando', line: 'Andando llego antes que en metro. Hoy, seguro.', weight: 4, match: ['leaving'], from: { points: ['AR_GATE_'] }, to: HOMES_OR_CITY, fan: 0.8 },

      // ---- La sobremesa (after): bares y restaurantes a tope, y se va vaciando hacia el metro.
      { role: 'fan-bar-door', label: 'Aficionado con la caña en la puerta', line: 'Repetimos la jugada del segundo gol. Ya van cuatro veces.', weight: 5, match: ['after'], from: { tags: ['arena-bar'], types: ['transit'] }, to: { points: ['AR_LARGUERO_OUT_', 'AR_GRADA_OUT_'] }, stay: [12, 25], stayState: 'DRINK', then: { types: ['transit'], edge: true }, group: [1, 3], bond: ['friends'], fan: 0.9, max: 6 },
      { role: 'fan-home', label: 'Aficionado volviendo a casa', line: 'Mañana me duele la garganta. Ha merecido la pena.', weight: 4, match: ['after'], from: { tags: ['arena-bar', 'food'] }, to: { types: ['transit'], edge: true }, group: [1, 3], bond: ['friends', 'family'], fan: 0.85 },

      // ---- Seguridad del día de partido: policía en los pasos y la explanada, patrullas, y el personal de los tornos. Capa
      // ambiente (su propio cupo, StreetLife.AMBIENT_CAP): no compiten con la riada de afición por el tope de la calle.
      { role: 'police', ambient: true, label: 'Policía', line: 'Por el paso de cebra, por favor. Y sin correr, que hay tiempo.', weight: 6, match: ['build-up', 'arrival', 'leaving', 'after'], from: CITY, to: { points: ['AR_POLICE_'] }, stay: [60, 120], stayState: 'WAIT', then: CITY, uniform: 'uniforme-policia', pause: 0, max: 4 },
      { role: 'police-patrol', ambient: true, label: 'Patrulla de policía', line: 'Buenas tardes. Todo bien por aquí, ¿verdad?', weight: 2, match: ['build-up', 'arrival', 'leaving'], from: CITY, to: CITY, via: ['ar-p05', 'ar-p50'], pace: 'stroll', group: [2, 2], bond: ['coworkers'], uniform: 'uniforme-policia', pause: 0.3, max: 2 },
      { role: 'steward', ambient: true, label: 'Control de entradas', line: 'Entrada en la mano y el bolso abierto, por favor. Gracias.', weight: 8, match: ['build-up', 'arrival', 'live'], from: CITY, to: { points: ['AR_STEWARD_'] }, stay: [120, 240], stayState: 'WAIT', then: CITY, uniform: 'uniforme-seguridad', pause: 0, max: 4 },
      { role: 'street-cleaner', ambient: true, label: 'Operario de limpieza', line: 'Vasos, pipas y papeles. Esto en una hora está como nuevo.', weight: 8, match: ['leaving', 'after'], from: CITY, to: CITY, via: ['ar-p05', 'ar-p27', 'ar-p50'], pace: 'stroll', uniform: 'uniforme-limpieza', sweep: true, pause: 0, max: 3 },

      // ---- De higos a brevas: dos de equipos distintos discuten a voces la jugada; la policía está a dos pasos. Ni un golpe.
      { role: 'fan-argument', label: 'Dos aficionados discutiendo', line: '¡Ese penalti no era ni de broma! — ¡Que sí, que lo ha visto todo el estadio!', weight: 0.3, match: ['leaving'], from: { points: ['AR_GATE_'] }, to: { points: ['AR_ARGUE_'] }, stay: [2, 4], stayState: 'TALK', then: { types: ['transit'], edge: true }, group: [2, 2], fan: 0.5, max: 1 },
    ],
  },
  // ------------------------------------------------------ Velaria
  // Lujo, moda y negocios (data/velaria.ts). Por la mañana, oficina: se cruza la avenida hacia el trabajo y abren las
  // tiendas; a mediodía, comida de negocios; por la tarde, compras, galería, terraza y huéspedes del hotel; por la noche,
  // cena y vino, y a las doce la calle es de los porteros y de quien vuelve. Gente de todas partes: la que compra y la
  // que atiende, limpia, reparte o abre la puerta.
  {
    location: 'velaria',
    bands: [
      [6, 7.5, 'LOW'], [7.5, 10, 'MEDIUM'], [10, 13, 'MEDIUM'], [13, 15, 'HIGH'], [15, 18, 'MEDIUM'],
      [18, 21, 'HIGH'], [21, 23, 'MEDIUM'], [23, 24, 'LOW'], [0, 1, 'LOW'],
    ],
    // El sábado, más compras; el domingo, las tiendas cerradas.
    weekday: [0, 0, 0, 0, 0, 1, -1],
    scale: 1.2,
    maxWalkers: 46,
    bursts: [{ point: 'VL_METRO_ENTRANCE', every: [[6.5, 10, 4], [10, 18, 8], [18, 21, 5], [21, 24, 12], [0, 1.5, 20]], size: [1, 3] }],
    draws: [{ place: 'vl-hotel', perLevel: 1 }],
    tableService: [{ place: 'vl-cafe', menu: 'cafe-aurelia', pass: 'VL_CAFE_TERRACE_WAITER' }],
    staff: [
      { service: 'waiter', place: 'vl-cafe', base: 'VL_CAFE_TERRACE_WAITER', serves: ['VL_CAFE_TERRACE_'], label: 'Camarero del Café Aurelia', line: '¿Les traigo algo más a la terraza?' },
    ],
    trips: [
      // Mañana: a la oficina (fuera del mapa), a abrir las tiendas y a por el café.
      { role: 'office', label: 'Alguien camino de la oficina', line: 'Reunión a las nueve y cuarto. Llego a las nueve y cuarto.', weight: 7, hours: [7.5, 9.75], days: 'weekday', from: TRANSIT, to: CITY },
      { role: 'office', label: 'Alguien con traje y prisa', line: 'Sí, sí, te lo mando antes de comer. Antes de comer de mañana.', weight: 4, hours: [7.5, 10], days: 'weekday', from: HOMES, to: { types: ['transit'], edge: true } },
      { role: 'coffee', label: 'Alguien a por el café de la mañana', line: 'Un flat white y a la reunión. Sin el café no hablo.', weight: 3, hours: [8, 10.5], from: HOMES_OR_CITY, to: { points: ['VL_CAFE_ENTRANCE'] } },
      { role: 'shift-shop', label: 'Dependienta que llega a abrir', line: 'Abrimos a las diez y media. A las diez y veinte ya hay alguien mirando.', weight: 4, hours: [9.5, 10.75], from: TRANSIT, to: { tags: ['shop'] } },
      { role: 'shift-kitchen', label: 'Cocinero que entra a trabajar', line: 'Mise en place a las once. El chef llega a las once y cinco y lo revisa todo.', weight: 2, hours: [11, 12.5], from: TRANSIT, to: { points: ['VL_ALMA_ENTRANCE', 'VL_KAIZEN_ENTRANCE', 'VL_HOTEL_ENTRANCE', 'VL_CAFE_ENTRANCE'] } },
      { role: 'gym', label: 'Alguien que va al gimnasio', line: 'Entreno antes de la primera llamada. Luego es imposible.', weight: 2, hours: [6.5, 9.5], from: HOMES, to: { points: ['VL_GYM_ENTRANCE'] } },
      // Los porteros: en su portal casi todo el día. Y los del hotel, a los lados de la puerta.
      { role: 'doorman', label: 'Portero de la finca', line: 'Buenos días. ¿A quién busca?', weight: 4, hours: [8, 21], from: HOMES, to: { points: ['VL_DOORMAN_'] }, stay: [90, 180], stayState: 'WAIT', then: HOMES, uniform: 'uniforme-portero', max: 5 },
      { role: 'doorman', label: 'Portero del hotel', line: 'Bienvenidos al Gran Hotel Velaria. ¿Les ayudo con las maletas?', weight: 5, hours: [7, 24], from: { points: ['VL_HOTEL_ENTRANCE'] }, to: { points: ['VL_HOTEL_DOOR_'] }, stay: [120, 240], stayState: 'WAIT', then: { points: ['VL_HOTEL_ENTRANCE'] }, uniform: 'uniforme-hotel', max: 2 },
      // El hotel: quien llega en taxi con la maleta y quien se va a la parada.
      { role: 'hotel-guest', label: 'Huésped que llega con su maleta', line: 'El taxista me ha dado una vuelta por toda la ciudad. Gratis no ha sido.', weight: 3, hours: [11, 23], from: { points: ['VL_TAXI_'], types: ['transit'], edge: true }, to: { points: ['VL_HOTEL_ENTRANCE'] }, group: [1, 2], bond: ['couple', 'tourists', 'coworkers'] },
      { role: 'hotel-checkout', label: 'Huésped esperando el taxi', line: 'Dijeron cinco minutos. Aquí los cinco minutos son cinco minutos.', weight: 3, hours: [7.5, 13], from: { points: ['VL_HOTEL_ENTRANCE'] }, to: { points: ['VL_TAXI_'] }, stay: [2, 6], stayState: 'WAIT', then: CITY, max: 2 },
      // Compras: llegar a las casas de lujo y salir de ellas con bolsas.
      { role: 'shopper', label: 'Alguien de compras', line: 'Sólo vengo a mirar. Eso dije la última vez.', weight: 6, hours: [10.5, 20.5], from: { types: ['residence', 'transit'], points: ['VL_HOTEL_ENTRANCE'], edge: true }, to: { tags: ['luxury'] }, group: [1, 2], bond: ['friends', 'couple', 'family'] },
      { role: 'shopper', label: 'Alguien con bolsas', line: 'Me lo he llevado puesto. Lo de antes, en la bolsa.', weight: 5, hours: [11, 21], from: { tags: ['luxury', 'shop'] }, to: { types: ['transit', 'residence'], points: ['VL_HOTEL_ENTRANCE', 'VL_TAXI_'], edge: true } },
      { role: 'window-shopper', label: 'Alguien mirando escaparates', line: 'Ese abrigo cuesta lo que mi coche. Pero el abrigo es más bonito.', weight: 3, hours: [10, 21], from: HOMES_OR_CITY, to: { points: ['VL_ORIOL_WINDOW', 'VL_BRISA_WINDOW', 'VL_FERRANT_WINDOW_', 'VL_GOURMET_WINDOW', 'VL_GALERIA_WINDOW'] }, stay: [1, 4], stayState: 'BROWSE', then: { tags: ['luxury', 'shop'], types: ['transit'], edge: true }, max: 5 },
      { role: 'errands', label: 'Vecina de recados', line: 'El pan, la farmacia y la peluquería. La peluquería, primero.', weight: 3, hours: [10, 20], from: HOMES, to: { points: ['VL_GOURMET_ENTRANCE', 'VL_LIS_ENTRANCE', 'VL_CLINICA_ENTRANCE'] } },
      // Turismo y cultura: la plaza, la fuente, los escaparates y la galería.
      { role: 'tourist', label: 'Turistas paseando', line: '¿Esta es la plaza de la guía? Hay una fuente, así que sí.', weight: 4, hours: [10, 20.5], from: { points: ['VL_HOTEL_ENTRANCE'], types: ['transit'], edge: true }, to: { points: ['VL_PLAZA_MEET_', 'VL_GALERIA_WINDOW', 'VL_FERRANT_WINDOW_'] }, stay: [3, 8], stayState: 'TALK', then: { tags: ['luxury', 'food'], edge: true }, group: [2, 3], bond: ['tourists', 'couple', 'family'], max: 4 },
      { role: 'gallery', label: 'Alguien que va a la galería', line: 'Dicen que la pintora es de mi pueblo. Vengo a comprobarlo.', weight: 2, hours: [11, 20.5], from: HOMES_OR_CITY, to: { points: ['VL_GALERIA_ENTRANCE'] }, group: [1, 2], bond: ['friends', 'couple'] },
      // Comer, la terraza y la plaza.
      { role: 'diner', label: 'Comida de negocios', line: 'Hablamos del contrato en el postre. Antes, del tiempo.', weight: 3, hours: [13.5, 15.5], days: 'weekday', from: { tags: ['work'], edge: true }, to: { points: ['VL_ALMA_ENTRANCE', 'VL_CAFE_ENTRANCE'] }, group: [2, 3], bond: ['coworkers'] },
      { role: 'terrace', label: 'Alguien en la terraza', line: 'Un café al sol junto a la fuente. Esto es lo que se paga.', weight: 3, hours: [9, 21.5], from: HOMES_OR_CITY, to: { points: ['VL_CAFE_TERRACE_'] }, stay: [20, 45], stayState: 'DRINK', group: [1, 2], bond: ['friends', 'couple', 'coworkers'] },
      { role: 'plaza-elders', label: 'Vecinos de toda la vida', line: 'Cuando yo era joven, aquí había un cine. Y antes, un convento.', weight: 2, hours: [10, 13.5], from: HOMES, to: { points: ['VL_PLAZA_BENCH_'] }, stay: [15, 35], stayState: 'TALK', group: [1, 2], bond: ['friends', 'couple'] },
      { role: 'plaza-family', label: 'Una familia en la plaza', line: 'Una moneda a la fuente y nos vamos. Una.', weight: 1.5, hours: [17, 20.5], from: HOMES, to: { points: ['VL_PLAZA_BENCH_', 'VL_PLAZA_MEET_'] }, stay: [8, 18], stayState: 'TALK', group: [2, 4], bond: ['family'] },
      { role: 'metro-arrival', label: 'Alguien que sale del metro', line: 'Qué limpia está esta estación. Casi da pena pisarla.', weight: 3, hours: [7, 1], from: TRANSIT, to: { tags: ['luxury', 'food', 'shop'], types: ['residence'], edge: true } },
      { role: 'metro-meet', label: 'Alguien esperando a alguien', line: 'Le dije en la boca de metro. Hay dos bocas. Hay un problema.', weight: 2, hours: [9, 23], from: HOMES_OR_CITY, to: { points: ['VL_METRO_MEET_'] }, stay: [4, 12], stayState: 'PHONE', then: { tags: ['food', 'luxury'], edge: true }, max: 2 },
      // Tarde y noche: gimnasio, volver a casa, cenar y el vino de después.
      { role: 'gym', label: 'Alguien que va al gimnasio', line: 'Del despacho al gimnasio. Si paso por casa, no salgo.', weight: 2, hours: [18, 21.5], from: { types: ['transit', 'residence'] }, to: { points: ['VL_GYM_ENTRANCE'] } },
      { role: 'returning', label: 'Alguien volviendo a casa', line: 'Doce horas. Y el portero me pregunta qué tal el día.', weight: 4, hours: [18, 21.5], from: { types: ['transit'], edge: true }, to: HOMES },
      { role: 'diner', label: 'Alguien que va a cenar', line: 'Tenemos mesa a las nueve. Son las nueve y diez. Corre.', weight: 3, hours: [20.5, 23], from: HOMES_OR_CITY, to: { points: ['VL_ALMA_ENTRANCE', 'VL_KAIZEN_ENTRANCE'] }, group: [2, 4], bond: ['couple', 'friends', 'coworkers'] },
      { role: 'after-work', label: 'Compañeros a por una copa', line: 'Una copa de vino y a casa. Bueno, una botella entre cuatro.', weight: 2, hours: [19, 23], days: 'weekday', from: { tags: ['work'], edge: true }, to: { points: ['VL_VINOTECA_ENTRANCE'] }, group: [2, 4], bond: ['coworkers', 'friends'] },
      { role: 'dog-walker', label: 'Alguien paseando al perro', line: 'Vuelta a la plaza y a casa. Él lo sabe; yo, más o menos.', weight: 2, hours: [7, 9.5], from: HOMES, to: HOMES, via: ['vl-pl-n', 'vl-pl-s'], pace: 'stroll', dog: true, pause: 0.6 },
      { role: 'dog-walker', label: 'Alguien paseando al perro', line: 'La última del día. Sin correr.', weight: 2, hours: [20.5, 23.5], from: HOMES, to: HOMES, via: ['vl-m24', 'vl-pl-c'], pace: 'stroll', dog: true, pause: 0.6 },
      // Trabajo en la calle: limpieza a primera hora, repartos del gourmet y de Kaizen.
      { role: 'street-cleaner', ambient: true, label: 'Operario de limpieza', line: 'Aquí la acera se friega. Con agua y todo.', weight: 6, hours: [6, 8], from: CITY, to: CITY, via: ['vl-pl-n', 'vl-pl-s', 'vl-n29'], pace: 'stroll', uniform: 'uniforme-limpieza', sweep: true, pause: 0, max: 1 },
      { role: 'courier', ambient: true, label: 'Repartidor', line: 'Una cesta gourmet al ático. El ascensor es de los que tienen asiento.', weight: 4, hours: [10, 13], from: { points: ['VL_GOURMET_ENTRANCE'] }, to: HOMES, uniform: 'uniforme-reparto', rainproof: true, max: 2 },
      { role: 'courier', ambient: true, label: 'Repartidor', line: 'Omakase para dos a domicilio. Ni lo he mirado, lo juro.', weight: 4, hours: [20, 23.5], from: { points: ['VL_KAIZEN_ENTRANCE', 'VL_GOURMET_ENTRANCE'] }, to: HOMES, uniform: 'uniforme-reparto', rainproof: true, max: 2 },
      // De paso y de vuelta.
      { role: 'passer', label: 'Alguien de paso', line: 'Perdone, ¿la calle del Marqués? Ah, es esta.', weight: 3, from: CITY, to: CITY },
      { role: 'night-walker', label: 'Alguien volviendo tarde', line: 'Buenas noches, Julián. Sí, de la cena. No, no he bebido. Poco.', weight: 1, hours: [23, 3], from: { types: ['transit'], edge: true }, to: HOMES },
      // Eventos (data/popups.ts): sólo mientras está en marcha cada uno.
      { role: 'gallery-opening', label: 'Invitado a la inauguración', line: 'El vino es mejor que los cuadros. No se lo digas a nadie.', weight: 28, popup: 'vl-gallery-opening', hours: [19, 23], from: HOMES_OR_CITY, to: { points: ['VL_OPENING_'] }, stay: [10, 25], stayState: 'DRINK', then: { points: ['VL_GALERIA_ENTRANCE'], edge: true }, group: [1, 3], bond: ['friends', 'couple'] },
      { role: 'popup-market', label: 'Alguien en el pop-up de moda', line: 'Colección cápsula, dicen. Cápsula de precio no es.', weight: 24, popup: 'vl-fashion-popup', hours: [12, 20], from: HOMES_OR_CITY, to: { points: ['VL_POPUP_'] }, stay: [3, 9], stayState: 'BROWSE', then: { tags: ['luxury'], edge: true }, group: [1, 3], bond: ['friends', 'couple'] },
      { role: 'popup-queue', label: 'Alguien en la cola del lanzamiento', line: 'Dicen que sólo hay veinte bolsos. Y yo llevo el doce.', weight: 30, popup: 'vl-boutique-launch', hours: [18, 22], from: HOMES_OR_CITY, to: { points: ['VL_LAUNCH_'] }, stay: [15, 35], stayState: 'QUEUE', then: { points: ['VL_FERRANT_ENTRANCE'] }, group: [1, 2], bond: ['friends'] },
      { role: 'hotel-event', label: 'Invitado a la gala del hotel', line: 'Me dijeron etiqueta. Pensé que era una broma.', weight: 28, popup: 'vl-hotel-event', hours: [19.5, 23.5], from: { points: ['VL_TAXI_'], edge: true }, to: { points: ['VL_HOTEL_EVENT_'] }, stay: [8, 20], stayState: 'DRINK', then: { points: ['VL_HOTEL_ENTRANCE'] }, group: [2, 3], bond: ['couple', 'friends', 'coworkers'] },
    ],
  },
  // ------------------------------------------------------ Puerta Central
  // El centro (data/puertaCentral.ts): la calle más llena del juego. Por la mañana, el metro manda: oleadas por las dos
  // bocas, gente a la oficina y al café. Por la tarde, compras y turismo: grupos con mapa que se paran en seco, fotos al
  // monumento, mantas y actuaciones con su corro (data/streetActs.ts). Por la noche, cenas y grupos de amigos; de
  // madrugada, menos turista y la gente que sale. Turistas hay muchos, pero son una parte: la mayoría vive, trabaja o pasa.
  {
    location: 'puerta-central',
    bands: [
      [6, 7, 'MEDIUM'], [7, 10, 'VERY_HIGH'], [10, 13, 'HIGH'], [13, 16, 'VERY_HIGH'], [16, 22, 'VERY_HIGH'],
      [22, 24, 'HIGH'], [0, 3, 'MEDIUM'], [3, 6, 'LOW'],
    ],
    // El fin de semana, más; el domingo por la mañana, menos metro pero igual de turismo.
    weekday: [0, 0, 0, 0, 1, 1, 0],
    scale: 3.5,
    maxWalkers: 80,
    // Las dos bocas: en hora punta, un tren cada dos minutos de juego y de cada uno sale un grupo.
    bursts: [
      { point: 'PC_METRO_ENTRANCE', every: [[6.5, 7, 6], [7, 10, 2], [10, 17, 4], [17, 20.5, 2], [20.5, 24, 5], [0, 1.5, 10]], size: [2, 4] },
      { point: 'PC_METRO_W_ENTRANCE', every: [[6.5, 7, 8], [7, 10, 3], [10, 17, 5], [17, 20.5, 3], [20.5, 24, 6], [0, 1.5, 12]], size: [1, 3] },
    ],
    draws: [{ place: 'pc-burger', perLevel: 1 }, { place: 'pc-recuerdos', perLevel: 1 }],
    tableService: [{ place: 'pc-cafe', menu: 'pausa', pass: 'PC_CAFE_TERRACE_WAITER' }],
    staff: [
      { service: 'waiter', place: 'pc-cafe', base: 'PC_CAFE_TERRACE_WAITER', serves: ['PC_CAFE_TERRACE_'], label: 'Camarera del Café Central', line: 'Terraza, sí. Carta en cuatro idiomas, ¿cuál le traigo?' },
    ],
    trips: [
      // Mañana: el metro. Quien vive aquí baja; quien llega sale hacia la oficina o cruza la plaza hacia otro sitio.
      { role: 'commuter', label: 'Alguien con prisa', line: 'Si pierdo este, pierdo el siguiente. Así funciona.', weight: 7, hours: [7, 10], days: 'weekday', from: HOMES, to: TRANSIT },
      { role: 'commuter', label: 'Alguien que va al metro', line: 'Perdón, perdón, perdón. Gracias.', weight: 4, hours: [7, 9.75], days: 'weekday', from: CITY, to: TRANSIT, pause: 0 },
      { role: 'office', label: 'Alguien camino de la oficina', line: 'Dos transbordos y aún llego antes que en coche.', weight: 6, hours: [7.25, 10], days: 'weekday', from: TRANSIT, to: CITY },
      { role: 'coffee', label: 'Alguien a por el café', line: 'Uno para llevar. Grande. Muy grande.', weight: 3, hours: [7.5, 11], from: { types: ['transit', 'residence'], edge: true }, to: { points: ['PC_CAFE_ENTRANCE'] } },
      { role: 'shift-shop', label: 'Dependiente que llega a abrir', line: 'Abrimos a las diez. A las diez menos cinco ya hay cola de turistas.', weight: 3, hours: [9.3, 10.5], from: TRANSIT, to: { tags: ['shop'] } },
      { role: 'shift-kitchen', label: 'Cocinera que entra a trabajar', line: 'Hoy tenemos dos grupos de cuarenta. Me lo han dicho en la puerta.', weight: 2, hours: [10.5, 12], from: TRANSIT, to: { points: ['PC_PIZZA_ENTRANCE', 'PC_BURGER_ENTRANCE', 'PC_CAFE_ENTRANCE'] } },
      { role: 'metro-arrival', label: 'Alguien que sale del metro', line: '¿Por qué boca he salido? Ah, por la de siempre.', weight: 4, hours: [7, 1], from: TRANSIT, to: { tags: ['shop', 'food'], types: ['residence'], edge: true } },
      // Compras: entrar y salir con bolsas; escaparates; el quiosco.
      { role: 'shopper', label: 'Alguien de compras', line: 'Sólo una cosa. Bueno, dos.', weight: 6, hours: [10, 21.5], from: { types: ['residence', 'transit'], edge: true }, to: { tags: ['shop'] }, group: [1, 3], bond: ['friends', 'couple', 'family'] },
      { role: 'shopper', label: 'Alguien con bolsas', line: 'Venía a por unos vaqueros. Llevo tres bolsas y ningún vaquero.', weight: 5, hours: [10.5, 22], from: { tags: ['shop'] }, to: { types: ['transit', 'residence'], edge: true } },
      { role: 'window-shopper', label: 'Alguien mirando escaparates', line: 'Rebajas en octubre. Las rebajas ya no tienen mes.', weight: 3, hours: [10, 22], from: HOMES_OR_CITY, to: { points: ['PC_RECUERDOS_WINDOW', 'PC_MODA_WINDOW_', 'PC_PIZZA_WINDOW'] }, stay: [1, 4], stayState: 'BROWSE', then: { tags: ['shop', 'food'], types: ['transit'], edge: true }, max: 4 },
      { role: 'kiosk', label: 'Alguien en el quiosco', line: 'Un periódico y un mapa. Sí, de papel.', weight: 1.5, hours: [8, 21], from: HOMES_OR_CITY, to: { points: ['PC_KIOSK_WINDOW'] }, stay: [1, 3], stayState: 'BROWSE', max: 1 },
      { role: 'ice-cream', label: 'Alguien a por un helado', line: 'De turrón. En octubre también.', weight: 1.5, hours: [12, 21.5], from: HOMES_OR_CITY, to: { points: ['PC_ICE_CREAM'] }, stay: [2, 4], stayState: 'WAIT', max: 1 },
      // Turismo: el monumento (foto y mapa), el paseo en grupo, la tienda de recuerdos y la vuelta al hostal.
      { role: 'tourist', label: 'Turista con su cámara', line: '¿Nos haces una foto? Con la Rosa detrás, que se vea entera.', weight: 6, hours: [9.5, 21.5], from: { types: ['transit'], points: ['PC_HOSTAL_ENTRANCE'], edge: true }, to: { points: ['PC_MONUMENT_VIEW_'] }, stay: [2, 6], stayState: 'BROWSE', then: { tags: ['shop', 'food'], edge: true }, group: [1, 2], bond: ['couple', 'tourists'], pause: 0.6, max: 5 },
      { role: 'tourist-group', label: 'Grupo de turistas', line: 'El guía dijo «la plaza del monumento». Hay un monumento. Esperamos aquí.', weight: 5, hours: [10, 21], from: { types: ['transit'], points: ['PC_HOSTAL_ENTRANCE'], edge: true }, to: { points: ['PC_MONUMENT_VIEW_', 'PC_MEET_'] }, stay: [3, 8], stayState: 'TALK', then: { tags: ['shop', 'food'], edge: true }, group: [3, 4], bond: ['tourists', 'family'], pause: 0.7, max: 2 },
      { role: 'tourist-walk', label: 'Turistas con el mapa abierto', line: 'Según esto estamos aquí. O aquí. El mapa es muy grande.', weight: 4, hours: [10, 22], from: { types: ['transit'], points: ['PC_HOSTAL_ENTRANCE'], edge: true }, to: CITY, via: ['pc-c14', 'pc-c40'], pace: 'stroll', group: [2, 4], bond: ['tourists', 'family', 'couple'], pause: 0.8 },
      { role: 'tourist-shop', label: 'Turista buscando recuerdos', line: 'Un imán para la nevera y una camiseta para mi sobrino. Es la tradición.', weight: 3, hours: [10, 21.5], from: { types: ['transit'], points: ['PC_HOSTAL_ENTRANCE'], edge: true }, to: { points: ['PC_RECUERDOS_ENTRANCE'] }, group: [1, 3], bond: ['tourists', 'family'] },
      { role: 'tourist-return', label: 'Turistas volviendo al hostal', line: 'Veinte mil pasos. Mañana, más.', weight: 3, hours: [21, 1], from: { types: ['transit'], edge: true }, to: { points: ['PC_HOSTAL_ENTRANCE'] }, group: [1, 3], bond: ['tourists', 'couple'] },
      // Las mantas (data/streetActs.ts): sólo con su puesto montado. Se mira, se toca, a veces se compra.
      { role: 'stall-browse', label: 'Alguien mirando la manta', line: '¿Cuánto esta? ¿Y si me llevo dos?', weight: 4, act: 'pc-manta-bisuteria', from: ANYWHERE_HOME, to: { points: ['PC_STALL_A_SEE_'] }, stay: [2, 5], stayState: 'BROWSE', then: { tags: ['shop', 'food'], types: ['transit'], edge: true }, group: [1, 2], bond: ['friends', 'couple', 'tourists'], max: 2 },
      { role: 'stall-browse', label: 'Alguien mirando camisetas en la manta', line: 'Ésta pone «Puerta Central» con dos erres. Me la llevo por eso.', weight: 4, act: 'pc-manta-ropa', from: ANYWHERE_HOME, to: { points: ['PC_STALL_B_SEE_'] }, stay: [2, 5], stayState: 'BROWSE', then: { tags: ['shop', 'food'], types: ['transit'], edge: true }, group: [1, 2], bond: ['friends', 'couple', 'tourists'], max: 2 },
      { role: 'stall-browse', label: 'Alguien mirando recuerdos', line: 'Un abanico. Para el calor de octubre.', weight: 4, act: 'pc-manta-recuerdos', from: ANYWHERE_HOME, to: { points: ['PC_STALL_C_SEE_'] }, stay: [2, 5], stayState: 'BROWSE', then: { tags: ['shop', 'food'], types: ['transit'], edge: true }, group: [1, 2], bond: ['tourists', 'family', 'couple'], max: 2 },
      { role: 'stall-browse', label: 'Alguien probándose unas gafas', line: '¿Me quedan bien? Sé sincera. No, mejor no.', weight: 3, act: 'pc-bandeja', from: ANYWHERE_HOME, to: { points: ['PC_STALL_D_SEE_'] }, stay: [1, 3], stayState: 'BROWSE', then: { tags: ['shop', 'food'], types: ['transit'], edge: true }, max: 2 },
      { role: 'stall-browse', label: 'Alguien mirando pulseras', line: '¿Las haces tú? Se nota. Para bien.', weight: 4, act: 'pc-manta-finde', from: ANYWHERE_HOME, to: { points: ['PC_STALL_E_SEE_'] }, stay: [2, 5], stayState: 'BROWSE', then: { tags: ['shop', 'food'], types: ['transit'], edge: true }, group: [1, 2], bond: ['friends', 'couple'], max: 2 },
      // Las actuaciones: un corro pequeño mientras dura cada una.
      { role: 'show-watch', label: 'Alguien escuchando la guitarra', line: 'Ésta la tocaba mi padre. Peor, pero la tocaba.', weight: 5, act: 'pc-guitarra', from: ANYWHERE_HOME, to: { points: ['PC_GUITAR_SEE_'] }, stay: [3, 8], stayState: 'BROWSE', then: { tags: ['food', 'shop'], types: ['transit'], edge: true }, group: [1, 2], bond: ['couple', 'friends', 'tourists'], max: 4 },
      { role: 'show-watch', label: 'Alguien viendo el baile', line: '¡Otra! ¡Otra! ¿Cómo hace eso con la espalda?', weight: 7, act: 'pc-baile', from: ANYWHERE_HOME, to: { points: ['PC_DANCE_SEE_'] }, stay: [4, 9], stayState: 'CHEER', then: { tags: ['food', 'shop'], types: ['transit'], edge: true }, group: [1, 3], bond: ['friends', 'family', 'tourists'], max: 6 },
      { role: 'show-watch', label: 'Alguien mirando la estatua', line: 'Te juro que ha parpadeado. Te lo juro.', weight: 4, act: 'pc-estatua', from: ANYWHERE_HOME, to: { points: ['PC_STATUE_SEE_'] }, stay: [1, 4], stayState: 'BROWSE', then: { tags: ['food', 'shop'], types: ['transit'], edge: true }, group: [1, 2], bond: ['family', 'tourists', 'couple'], max: 3 },
      { role: 'show-watch', label: 'Alguien escuchando al dúo', line: 'La segunda voz es la buena. No se lo digas a la primera.', weight: 5, act: 'pc-duo', from: ANYWHERE_HOME, to: { points: ['PC_DUO_SEE_'] }, stay: [3, 8], stayState: 'BROWSE', then: { tags: ['food', 'shop'], types: ['transit'], edge: true }, group: [1, 2], bond: ['couple', 'friends'], max: 4 },
      // Quedar en la plaza: «en la Rosa», en la boca del metro, en el banco; parejas y familias.
      { role: 'friends-meet', label: 'Amigos que han quedado en la Rosa', line: 'Falta Marta. Siempre falta Marta.', weight: 4, hours: [11, 23.5], from: { types: ['transit', 'residence'], edge: true }, to: { points: ['PC_MEET_'] }, stay: [4, 12], stayState: 'TALK', then: { tags: ['food', 'shop'], edge: true }, group: [2, 4], bond: ['friends'] },
      { role: 'metro-meet', label: 'Alguien esperando en la boca de metro', line: 'Te dije la boca de la Rosa. Hay dos bocas de la Rosa.', weight: 2, hours: [9, 23.5], from: HOMES_OR_CITY, to: { points: ['PC_METRO_MEET_'] }, stay: [3, 10], stayState: 'PHONE', then: { tags: ['food', 'shop'], edge: true }, max: 3 },
      { role: 'plaza-family', label: 'Una familia en la plaza', line: 'No, el helado después de comer. Después.', weight: 2, hours: [11, 20.5], from: { types: ['transit', 'residence'], edge: true }, to: { points: ['PC_BENCH_'] }, stay: [8, 20], stayState: 'TALK', group: [1, 3], bond: ['family'] },
      { role: 'couple-walk', label: 'Una pareja paseando', line: 'Damos una vuelta a la plaza y cenamos. O cenamos y damos la vuelta.', weight: 3, hours: [17, 23.5], from: HOMES_OR_CITY, to: HOMES_OR_CITY, via: ['pc-c19', 'pc-c36'], pace: 'stroll', group: [2, 2], bond: ['couple'], pause: 0.4 },
      { role: 'terrace', label: 'Alguien en la terraza', line: 'Un café y ver pasar a medio mundo. Aquí pasa el mundo entero.', weight: 3, hours: [8, 22], from: HOMES_OR_CITY, to: { points: ['PC_CAFE_TERRACE_'] }, stay: [15, 40], stayState: 'DRINK' },
      { role: 'passer', label: 'Alguien de paso', line: 'Por la plaza se ataja. Si no hay turistas.', weight: 5, from: CITY, to: CITY },
      // Comer y cenar: pizza y hamburguesa a mediodía y por la noche; los grupos de amigos después.
      { role: 'diner', label: 'Alguien que va a comer', line: 'Menú de mediodía y al trabajo. En treinta minutos, con el café.', weight: 4, hours: [13, 16], from: { types: ['transit'], edge: true }, to: { points: ['PC_PIZZA_ENTRANCE', 'PC_BURGER_ENTRANCE'] }, group: [1, 3], bond: ['coworkers', 'friends'] },
      { role: 'diner', label: 'Alguien que va a cenar', line: 'Una pizza para cuatro. Bueno, dos.', weight: 5, hours: [20, 23.5], from: { types: ['transit', 'residence'], edge: true }, to: { points: ['PC_PIZZA_ENTRANCE', 'PC_BURGER_ENTRANCE'] }, group: [2, 4], bond: ['friends', 'family', 'couple'] },
      { role: 'friends-out', label: 'Un grupo de amigos', line: 'Primero cenamos, luego ya vemos. Siempre «luego ya vemos».', weight: 4, hours: [19, 24], from: { types: ['transit'], edge: true }, to: CITY, via: ['pc-c25'], group: [2, 4], bond: ['friends'] },
      { role: 'returning', label: 'Alguien volviendo a casa', line: 'Nueve horas y una plaza llena de gente. Quiero mi sofá.', weight: 4, hours: [17.5, 21.5], from: { types: ['transit'], edge: true }, to: HOMES },
      // Madrugada: menos turista y la gente que sale; la hamburguesería, hasta las dos.
      { role: 'night-crowd', label: 'Gente que sale de fiesta', line: '¡Que el último metro es a la una y media! ¡Corre!', weight: 5, hours: [23, 3.5], from: { types: ['transit'], edge: true }, to: CITY, via: ['pc-c25'], group: [2, 4], bond: ['friends'] },
      { role: 'night-crowd', label: 'Gente de vuelta de la fiesta', line: 'Una hamburguesa y a casa. Una. Y a casa.', weight: 4, hours: [23, 2], from: CITY, to: { points: ['PC_BURGER_ENTRANCE'] }, group: [2, 3], bond: ['friends'] },
      { role: 'night-walker', label: 'Alguien volviendo tarde', line: 'El último metro. Por los pelos.', weight: 2, hours: [23, 3], from: { types: ['transit'], edge: true }, to: HOMES },
      { role: 'dog-walker', label: 'Alguien paseando al perro', line: 'A esta hora la plaza es nuestra. Luego, de los turistas.', weight: 2, hours: [7, 9.5], from: HOMES, to: HOMES, via: ['pc-c19', 'pc-c36'], pace: 'stroll', dog: true, pause: 0.6 },
      { role: 'dog-walker', label: 'Alguien paseando al perro', line: 'La última vuelta, que mañana madrugo.', weight: 1.5, hours: [21.5, 23.5], from: HOMES, to: HOMES, via: ['pc-c25'], pace: 'stroll', dog: true, pause: 0.6 },
      // Trabajo en la calle: limpieza al amanecer y repartos de la pizzería y la hamburguesería.
      { role: 'street-cleaner', ambient: true, label: 'Operario de limpieza', line: 'Aquí se barre tres veces al día. Y no da.', weight: 6, hours: [6, 9], from: CITY, to: CITY, via: ['pc-c14', 'pc-c40', 'pc-r28'], pace: 'stroll', uniform: 'uniforme-limpieza', sweep: true, pause: 0, max: 2 },
      { role: 'street-cleaner', ambient: true, label: 'Operaria de limpieza', line: 'Lo de la noche, a primera hora. Lo de la tarde, ahora.', weight: 3, hours: [15, 17], from: CITY, to: CITY, via: ['pc-c25', 'pc-r28'], pace: 'stroll', uniform: 'uniforme-limpieza', sweep: true, pause: 0, max: 1 },
      { role: 'courier', ambient: true, label: 'Repartidor', line: 'Cuatro pizzas al cuarto sin ascensor. Siempre es el cuarto.', weight: 4, hours: [13, 16], from: { points: ['PC_PIZZA_ENTRANCE', 'PC_BURGER_ENTRANCE'] }, to: HOMES_OR_CITY, uniform: 'uniforme-reparto', rainproof: true, max: 3 },
      { role: 'courier', ambient: true, label: 'Repartidora', line: 'Hamburguesa doble con extra de todo. Dirección: «la plaza». Ya.', weight: 5, hours: [20, 1.5], from: { points: ['PC_PIZZA_ENTRANCE', 'PC_BURGER_ENTRANCE'] }, to: HOMES_OR_CITY, uniform: 'uniforme-reparto', rainproof: true, max: 3 },
    ],
  },
];
