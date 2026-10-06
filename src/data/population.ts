import type { Level } from '../config/population.ts';
import type { OfferId, ServiceId } from './services.ts';

/**
 * Quién hay dentro de cada local y qué hace. Todo es dato: cambiar el horario
 * de afluencia del gimnasio es tocar sus franjas, no código.
 *
 * `points` son prefijos de id de punto (GYM_TREADMILL_ vale por los tres): el
 * interior decide cuántas máquinas o mesas hay; el perfil, sólo de qué tipo.
 */

/** Un paso del plan de un visitante: ir a un punto libre de estos y quedarse un rato. */
export interface PlanStep {
  state: string;
  points: readonly string[];
  /** Minutos de juego en el sitio [mín, máx]. */
  minutes: readonly [number, number];
  /** Veces seguidas que repite el paso cambiando de punto (cambiar de máquina). */
  repeat?: readonly [number, number];
  /** Probabilidad de hacer el paso; sin ella, siempre. */
  chance?: number;
  /**
   * Se cambia de ropa en este paso: 'gym' se pone la de entrenar; 'street' recupera la de calle. Ocurre en el sitio,
   * a mitad del paso, y nunca se salta (si no hay taquilla libre, espera). El prefijo `{s}` de un punto vale por el
   * vestuario que le toca a quien lo hace (M o F, de su identidad): GYM_CHANGE_{s}_ es GYM_CHANGE_M_ o GYM_CHANGE_F_.
   */
  outfit?: 'gym' | 'street';
}

export interface VisitorRole {
  role: string;
  /** Lo que se lee al hablarle: no tiene nombre, tiene lo que está haciendo. */
  label: string;
  line: string;
  weight: number;
  /** Sólo a estas horas [desde, hasta). */
  hours?: readonly [number, number];
  /** Vienen juntos [mín, máx]: parejas y grupos que se sientan en la misma mesa y se van a la vez. */
  party?: readonly [number, number];
  plan: readonly PlanStep[];
}

/**
 * Personal: está mientras el local está abierto. El oficio (data/services.ts)
 * dice cómo trabaja, qué uniforme lleva y qué dice; aquí sólo dónde y cuándo.
 * Con `npc`, el puesto lo ocupa ese personaje con nombre (data/npcs.ts).
 */
export interface StaffRole {
  service: ServiceId;
  npc?: string;
  /** Si el local lo llama de otra forma o le pone otra frase u otro uniforme. */
  label?: string;
  line?: string;
  look?: string;
  /** Su puesto o, si hace rondas, los sitios entre los que se mueve. */
  points: readonly string[];
  /** Oficio 'serve': a quién atiende (prefijos de los asientos de clientes). */
  serves?: readonly string[];
  /** Sólo si la afluencia llega a este nivel: un camarero de refuerzo, no uno fijo. */
  minLevel?: Level;
  /** Lo que ofrece si el jugador le habla, si no es lo de su oficio (la barra de la vinoteca sirve vino). */
  offers?: OfferId;
}

/** Qué se bebe y se ve en la mano o en la barra (world/TextureFactory: fx-glass-*). */
export type DrinkKind = 'beer' | 'wine' | 'soft' | 'water';

export interface PopulationProfile {
  /**
   * Un local donde se bebe a la vista: lo que toma cada cliente al pasar de pedir (ORDER) a beber (DRINK), repartido por
   * su id y su ronda (más repeticiones = más probable). Lo lleva en la mano o sobre la barra hasta que pide otra o se va.
   */
  drinks?: readonly DrinkKind[];
  place: string;
  /** [desde, hasta, nivel] en horas; lo que no cubren las franjas cuenta como VERY_LOW. */
  bands: readonly (readonly [number, number, Level])[];
  /** Niveles que sube o baja cada día, de lunes a domingo. */
  weekday: readonly [number, number, number, number, number, number, number];
  /** Tope de visitantes por tamaño del local, además del aforo del lugar. */
  maxVisitors: number;
  staff: readonly StaffRole[];
  visitors: readonly VisitorRole[];
  /**
   * El paso con el que quien lleva la ropa de entrenar vuelve a la de calle si tiene que irse antes de acabar su plan
   * (cierra el local, se va quien lo lleva): nadie sale por la puerta en ropa de deporte.
   */
  changeBack?: PlanStep;
  /**
   * Servicio de mesa (systems/TableService.ts): la carta, el pase donde sale lo
   * de cocina y el puesto de quien cocina. Con él, los camareros (oficio
   * `serve`) toman nota, llevan, cobran y recogen en las mesas del interior
   * (LocationDef.tables), y los clientes que se sientan en ellas comen al ritmo
   * del servicio y no de un reloj fijo.
   */
  tableService?: { menu: string; pass: string; kitchen: string };
}

// Gimnasio: entrar, cambiarse en su vestuario, entrenar, (a veces) ducharse y volver a la ropa de calle. Cada punto lleva
// el vestuario que le toca a quien lo hace ({s}). Una ducha o un cambio pide un rato más que una máquina: se ve.
const CHECK_IN: PlanStep = { state: 'CHECK_IN', points: ['GYM_RECEPTION'], minutes: [1, 2] };
const CHANGE_IN: PlanStep = { state: 'CHANGE', points: ['GYM_CHANGE_{s}_'], minutes: [5, 7], outfit: 'gym' };
const SHOWER: PlanStep = { state: 'SHOWER', points: ['GYM_SHOWER_{s}_'], minutes: [6, 10] };
const CHANGE_OUT: PlanStep = { state: 'CHANGE', points: ['GYM_CHANGE_{s}_'], minutes: [5, 7], outfit: 'street' };

export const POPULATION_PROFILES: readonly PopulationProfile[] = [
  {
    place: 'gym',
    // Antes del trabajo, a medio gas; a mediodía, flojo; de cinco a nueve y media, lleno; al cierre, casi vacío.
    bands: [[6, 9, 'MEDIUM'], [9, 16, 'LOW'], [16, 17, 'MEDIUM'], [17, 21.5, 'HIGH'], [21.5, 23, 'LOW']],
    // El sábado a medio gas y el domingo flojo.
    weekday: [0, 0, 0, 0, 0, -1, -2],
    maxVisitors: 14,
    staff: [
      { service: 'receptionist', npc: 'nerea', points: ['GYM_STAFF'] },
      { service: 'gym-staff', points: ['GYM_COACH_'], minLevel: 'MEDIUM' },
    ],
    // Cuánto dura cada máquina lo dice su puesto (data/stations.ts); aquí, a qué va cada uno y en qué orden.
    visitors: [
      {
        // Antes de trabajar, sobre todo cardio: entrar, cambiarse, cinta o bici, un trago y a la ducha (casi siempre).
        role: 'gym_early', label: 'Alguien que entrena antes de trabajar', line: 'A las nueve fichando. Voy justo.', weight: 4, hours: [6, 9.5],
        plan: [
          CHECK_IN,
          CHANGE_IN,
          { state: 'CARDIO', points: ['GYM_TREADMILL_', 'GYM_BIKE_', 'GYM_ROW_'], minutes: [15, 25], repeat: [1, 2] },
          { state: 'STRETCH', points: ['GYM_MAT_'], minutes: [5, 8], chance: 0.4 },
          { state: 'DRINK', points: ['GYM_WATER'], minutes: [1, 2], chance: 0.6 },
          { ...SHOWER, chance: 0.8 },
          CHANGE_OUT,
        ],
      },
      {
        role: 'gym_cardio', label: 'Alguien haciendo cardio', line: 'Llevo cuatro kilómetros. No me hagas perder la cuenta.', weight: 3,
        plan: [
          CHECK_IN,
          CHANGE_IN,
          { state: 'CARDIO', points: ['GYM_TREADMILL_', 'GYM_BIKE_', 'GYM_ROW_'], minutes: [15, 25], repeat: [1, 3] },
          { state: 'DRINK', points: ['GYM_WATER'], minutes: [1, 2], chance: 0.6 },
          { state: 'STRETCH', points: ['GYM_MAT_'], minutes: [5, 8], chance: 0.5 },
          { ...SHOWER, chance: 0.4 },
          CHANGE_OUT,
        ],
      },
      {
        // Peso: calienta un poco, va de una máquina a otra y descansa con el móvil entre medias.
        role: 'gym_lifter', label: 'Alguien entrenando', line: 'Ahora no, que pierdo la cuenta de la serie.', weight: 3,
        plan: [
          CHECK_IN,
          CHANGE_IN,
          { state: 'WARM_UP', points: ['GYM_TREADMILL_', 'GYM_BIKE_'], minutes: [5, 8], chance: 0.4 },
          { state: 'LIFT', points: ['GYM_BENCH_', 'GYM_SQUAT_', 'GYM_WEIGHTS_', 'GYM_CABLE_'], minutes: [8, 14], repeat: [2, 4] },
          { state: 'REST', points: ['GYM_REST_'], minutes: [2, 4], chance: 0.5 },
          { state: 'DRINK', points: ['GYM_WATER'], minutes: [1, 2], chance: 0.7 },
          { ...SHOWER, chance: 0.5 },
          CHANGE_OUT,
        ],
      },
      {
        // Estirar y poco más: la esterilla, algo de bici y un rato de móvil. Casi nadie se ducha después.
        role: 'gym_mobility', label: 'Alguien estirando', line: 'Esto también es entrenar, aunque no lo parezca.', weight: 1,
        plan: [
          CHECK_IN,
          CHANGE_IN,
          { state: 'STRETCH', points: ['GYM_MAT_'], minutes: [8, 14], repeat: [1, 2] },
          { state: 'CARDIO', points: ['GYM_BIKE_'], minutes: [10, 15], chance: 0.5 },
          { state: 'REST', points: ['GYM_REST_'], minutes: [2, 4], chance: 0.5 },
          { ...SHOWER, chance: 0.15 },
          CHANGE_OUT,
        ],
      },
      {
        // Dos que vienen juntos por la tarde: se cambian cada uno en su vestuario, máquinas contiguas, charla y se van a la vez.
        role: 'gym_buddies', label: 'Alguien entrenando con un colega', line: 'Venga, la última y nos vamos.', weight: 1, hours: [16, 22], party: [2, 2],
        plan: [
          CHECK_IN,
          CHANGE_IN,
          { state: 'LIFT', points: ['GYM_BENCH_', 'GYM_WEIGHTS_', 'GYM_SQUAT_'], minutes: [8, 14], repeat: [2, 3] },
          { state: 'TALK', points: ['GYM_CHAT_'], minutes: [2, 4], chance: 0.8 },
          { ...SHOWER, chance: 0.5 },
          CHANGE_OUT,
        ],
      },
    ],
    changeBack: CHANGE_OUT,
  },
  {
    place: 'cafe',
    bands: [[7, 9, 'HIGH'], [9, 12, 'MEDIUM'], [12, 15, 'HIGH'], [15, 18, 'MEDIUM'], [18, 21, 'MEDIUM'], [21, 22, 'LOW']],
    // Sábado y domingo por la mañana se llena más.
    weekday: [0, 0, 0, 0, 0, 1, 1],
    maxVisitors: 8,
    staff: [
      { service: 'bartender', npc: 'nilo', points: ['CAFE_BARISTA'] },
      // Siempre hay quien sirve las mesas: sentarse es pedir que te atiendan (no hace falta ir a la barra).
      { service: 'waiter', line: 'Ahora te atiendo.', points: ['CAFE_WAITER_'], serves: ['CAFE_TABLE_', 'CAFE_WINDOW_SEAT'] },
    ],
    // Servicio de mesa (systems/TableService.ts) con la carta de cafetería: cafés, otras bebidas, desayunos y algo de comer.
    tableService: { menu: 'pausa', pass: 'CAFE_PASS', kitchen: 'CAFE_BARISTA' },
    visitors: [
      {
        // Se sientan y les toman nota en la mesa: café, bollería, tostadas... al ritmo del servicio.
        role: 'customer', label: 'Cliente', line: 'Está bueno, pero quema.', weight: 3, party: [1, 2],
        plan: [{ state: 'DRINK', points: ['CAFE_TABLE_', 'CAFE_WINDOW_SEAT'], minutes: [25, 50] }],
      },
      // Por la mañana entra gente que pide y se va: el café va rápido.
      {
        role: 'takeaway', label: 'Cliente con prisa', line: 'Perdona, que llego tarde.', weight: 2, hours: [7, 10],
        plan: [{ state: 'ORDER', points: ['CAFE_COUNTER', 'CAFE_QUEUE_'], minutes: [1, 2] }],
      },
    ],
  },
  {
    place: 'clothing-store',
    bands: [[10, 13, 'LOW'], [13, 17, 'MEDIUM'], [17, 20, 'HIGH'], [20, 21, 'LOW']],
    // Viernes tarde y sábado, lo más lleno; el domingo casi nadie.
    weekday: [-1, -1, 0, 0, 1, 1, -2],
    maxVisitors: 10,
    staff: [
      { service: 'cashier', npc: 'ivan', points: ['CLOTHING_STORE_STAFF'], offers: 'shop-hilo' },
      { service: 'shop-worker', line: 'Las tallas grandes están al fondo.', points: ['CLOTHING_STORE_FLOOR_'], minLevel: 'MEDIUM' },
    ],
    visitors: [
      {
        role: 'shopper', label: 'Cliente', line: 'Busco algo, pero todavía no sé qué.', weight: 1,
        plan: [
          { state: 'BROWSE', points: ['CLOTHING_STORE_RACK_', 'CLOTHING_STORE_WINDOW'], minutes: [3, 8], repeat: [1, 3] },
          { state: 'CHECK_ITEM', points: ['CLOTHING_STORE_FITTING_', 'CLOTHING_STORE_MIRROR'], minutes: [3, 6], chance: 0.5 },
          { state: 'QUEUE', points: ['CLOTHING_STORE_TILL', 'CLOTHING_STORE_QUEUE_'], minutes: [1, 3], chance: 0.6 },
        ],
      },
    ],
  },
  {
    place: 'supermarket',
    bands: [[9, 12, 'LOW'], [12, 15, 'MEDIUM'], [15, 18, 'MEDIUM'], [18, 21, 'HIGH'], [21, 22, 'LOW']],
    weekday: [0, 0, 0, 0, 1, 1, -2],
    maxVisitors: 14,
    staff: [
      { service: 'cashier', npc: 'carmen', points: ['SUPERMARKET_CASHIER'] },
      { service: 'shop-worker', label: 'Reponiendo', line: 'Se nos acaba todo a la vez.', look: 'uniforme-super', points: ['SUPERMARKET_STOCK_'] },
    ],
    visitors: [
      {
        role: 'customer', label: 'Cliente', line: '¿Sabes dónde han puesto el arroz?', weight: 1, party: [1, 2],
        plan: [
          { state: 'BROWSE_AISLE', points: ['SUPERMARKET_AISLE_', 'SUPERMARKET_PRODUCE', 'SUPERMARKET_FRIDGES'], minutes: [2, 5], repeat: [2, 4] },
          { state: 'QUEUE', points: ['SUPERMARKET_QUEUE_'], minutes: [1, 2] },
          { state: 'CHECKOUT', points: ['SUPERMARKET_TILL'], minutes: [1, 2] },
        ],
      },
    ],
  },
  {
    place: 'pharmacy',
    // Media mañana y a la salida del trabajo; el domingo, sólo la de guardia (esta no).
    bands: [[9, 11, 'LOW'], [11, 14, 'MEDIUM'], [14, 17, 'LOW'], [17, 20, 'MEDIUM'], [20, 21, 'LOW']],
    weekday: [0, 0, 0, 0, 0, -1, -2],
    maxVisitors: 5,
    staff: [{ service: 'cashier', label: 'Farmacéutica', line: '¿Tienes receta, o es para algo sin receta?', look: 'uniforme-sala', points: ['PHARMACY_STAFF'] }],
    visitors: [
      {
        role: 'customer', label: 'Cliente', line: 'Vengo por lo de siempre.', weight: 2,
        plan: [
          { state: 'BROWSE', points: ['PHARMACY_SHELF_'], minutes: [1, 3], chance: 0.5 },
          { state: 'QUEUE', points: ['PHARMACY_QUEUE_'], minutes: [1, 2] },
          { state: 'CHECKOUT', points: ['PHARMACY_COUNTER'], minutes: [2, 4] },
        ],
      },
      {
        role: 'elderly', label: 'Vecina mayor', line: 'La tensión, que me la mire, hija.', weight: 1, hours: [9.5, 13],
        plan: [
          { state: 'QUEUE', points: ['PHARMACY_QUEUE_'], minutes: [2, 4] },
          { state: 'CHECKOUT', points: ['PHARMACY_COUNTER'], minutes: [4, 8] },
        ],
      },
    ],
  },
  {
    place: 'restaurant',
    bands: [[12, 14, 'MEDIUM'], [14, 16, 'HIGH'], [16, 18, 'VERY_LOW'], [18, 20, 'LOW'], [20, 23, 'HIGH'], [23, 24, 'LOW']],
    // Viernes y sábado por la noche, lleno.
    weekday: [-1, -1, 0, 0, 1, 1, 0],
    maxVisitors: 14,
    staff: [
      { service: 'cook', npc: 'tomas', points: ['RESTAURANT_STAFF'] },
      { service: 'waiter', line: '¿Mesa para uno?', points: ['RESTAURANT_WAITER_'], serves: ['RESTAURANT_TABLE_'] },
      { service: 'waiter', line: 'Ahora mismo le traigo la cuenta.', points: ['RESTAURANT_WAITER_'], serves: ['RESTAURANT_TABLE_'], minLevel: 'MEDIUM' },
    ],
    // La comida va por el servicio de mesa: piden, esperan a cocina, comen, pagan y se van.
    tableService: { menu: 'casa-tomas', pass: 'RESTAURANT_PASS', kitchen: 'RESTAURANT_STAFF' },
    visitors: [
      {
        // Solos o en pareja: cada mesa tiene dos sillas.
        role: 'diner', label: 'Comensal', line: 'El menú de hoy no está mal.', weight: 1, party: [1, 2],
        plan: [
          { state: 'WAIT', points: ['RESTAURANT_WAIT_'], minutes: [1, 3] },
          { state: 'DINE', points: ['RESTAURANT_TABLE_'], minutes: [60, 90] },
        ],
      },
    ],
  },
  {
    place: 'office',
    bands: [[8, 10, 'HIGH'], [10, 14, 'HIGH'], [14, 16, 'MEDIUM'], [16, 18, 'HIGH'], [18, 20, 'LOW']],
    // Entre semana; el fin de semana, casi vacía.
    weekday: [0, 0, 0, 0, 0, -4, -4],
    maxVisitors: 12,
    staff: [{ service: 'receptionist', npc: 'julia', points: ['OFFICE_RECEPTIONIST'] }],
    visitors: [
      {
        role: 'employee', label: 'Alguien de la oficina', line: 'Tengo una reunión en cinco minutos. O hace cinco.', weight: 5,
        plan: [
          { state: 'WORK', points: ['OFFICE_DESK_'], minutes: [40, 120] },
          { state: 'BREAK', points: ['OFFICE_WATER', 'OFFICE_BREAK_', 'OFFICE_MEETING'], minutes: [5, 15], chance: 0.6 },
          { state: 'WORK', points: ['OFFICE_DESK_'], minutes: [40, 120] },
        ],
      },
      {
        role: 'visitor', label: 'Visita', line: 'Vengo a una reunión. Creo que es aquí.', weight: 1,
        plan: [
          { state: 'CHECK_IN', points: ['OFFICE_RECEPTION'], minutes: [2, 4] },
          { state: 'MEETING', points: ['OFFICE_MEETING'], minutes: [20, 40] },
        ],
      },
    ],
  },
  {
    place: 'nightclub',
    // Se llena despacio: casi vacía a las 21:00, llena a las 00:30, pico a las 02:00 y vaciándose desde las 04:00.
    bands: [[21, 23, 'VERY_LOW'], [23, 24, 'LOW'], [0, 1, 'MEDIUM'], [1, 2, 'HIGH'], [2, 4, 'VERY_HIGH'], [4, 5, 'MEDIUM'], [5, 6, 'LOW']],
    // Por la noche en que abre: el jueves, dos niveles por debajo del viernes y el sábado.
    weekday: [0, 0, 0, -2, 0, 0, 0],
    maxVisitors: 22,
    staff: [
      { service: 'security', label: 'Portero', points: ['CLUB_DOOR'] },
      { service: 'bartender', line: '¿Qué te pongo? Rápido, que hay cola.', points: ['CLUB_BARTENDER_01'], offers: 'club-bar' },
      { service: 'bartender', line: 'Un segundo, que voy.', points: ['CLUB_BARTENDER_02'], minLevel: 'HIGH', offers: 'club-bar' },
      { service: 'dj', points: ['CLUB_DJ'] },
    ],
    // La noche tiene fases, y cada una trae a su gente: primero se toma algo y se
    // charla con la pista vacía; a partir de las once se baila; al final quedan los
    // últimos. Todos piden en la barra (ORDER) y se llevan la copa a un corro (DRINK).
    visitors: [
      {
        role: 'warmup', label: 'Alguien tomando algo', line: 'Aún es pronto. Esto se llena a la una.', weight: 3, party: [2, 3], hours: [21, 24],
        plan: [
          { state: 'ORDER', points: ['CLUB_BAR_'], minutes: [2, 4] },
          { state: 'DRINK', points: ['CLUB_STAND_', 'CLUB_SEAT_'], minutes: [15, 35] },
          { state: 'TALK', points: ['CLUB_SEAT_', 'CLUB_STAND_'], minutes: [10, 25] },
          { state: 'DANCE', points: ['CLUB_DANCE_'], minutes: [8, 15], chance: 0.2 },
        ],
      },
      {
        role: 'clubber', label: 'Alguien de fiesta', line: '¡Esta canción me encanta!', weight: 4, party: [1, 3], hours: [23, 5],
        plan: [
          { state: 'ORDER', points: ['CLUB_BAR_'], minutes: [2, 4] },
          { state: 'DRINK', points: ['CLUB_STAND_'], minutes: [4, 10], chance: 0.7 },
          { state: 'DANCE', points: ['CLUB_DANCE_'], minutes: [12, 30], repeat: [1, 3] },
          { state: 'TALK', points: ['CLUB_STAND_', 'CLUB_SEAT_'], minutes: [8, 20], chance: 0.6 },
          { state: 'ORDER', points: ['CLUB_BAR_'], minutes: [2, 4], chance: 0.4 },
          { state: 'DRINK', points: ['CLUB_STAND_'], minutes: [4, 8], chance: 0.4 },
          { state: 'DANCE', points: ['CLUB_DANCE_'], minutes: [12, 30], chance: 0.6 },
        ],
      },
      {
        role: 'lounger', label: 'Alguien charlando', line: 'No se oye nada, pero da igual.', weight: 1, party: [2, 3],
        plan: [
          { state: 'ORDER', points: ['CLUB_BAR_'], minutes: [2, 4] },
          { state: 'TALK', points: ['CLUB_SEAT_', 'CLUB_STAND_'], minutes: [20, 45] },
          { state: 'DANCE', points: ['CLUB_DANCE_'], minutes: [10, 20], chance: 0.3 },
        ],
      },
      {
        role: 'last-round', label: 'Alguien que no se quiere ir', line: 'La última y me voy. De verdad.', weight: 2, party: [1, 2], hours: [4, 6],
        plan: [
          { state: 'DRINK', points: ['CLUB_STAND_', 'CLUB_SEAT_'], minutes: [5, 12] },
          { state: 'DANCE', points: ['CLUB_DANCE_'], minutes: [8, 20], chance: 0.5 },
        ],
      },
    ],
  },
  {
    place: 'hair-salon',
    // Tranquila por la mañana, un pico a mediodía y otro al salir de trabajar; el sábado, cola.
    bands: [[10, 12, 'LOW'], [12, 14, 'MEDIUM'], [14, 17, 'LOW'], [17, 20, 'HIGH']],
    weekday: [0, 0, 0, 0, 0, 1, 0],
    maxVisitors: 6,
    staff: [
      { service: 'barber', npc: 'nati', points: ['BARBER_STAFF_01'], serves: ['BARBER_CHAIR_'] },
      { service: 'barber', points: ['BARBER_STAFF_02'], serves: ['BARBER_CHAIR_'], minLevel: 'MEDIUM' },
    ],
    visitors: [
      {
        role: 'haircut', label: 'Cliente de la barbería', line: 'Vengo cada tres semanas, como un reloj.', weight: 4,
        plan: [
          { state: 'WAIT', points: ['BARBER_WAIT_'], minutes: [4, 15] },
          { state: 'HAIRCUT', points: ['BARBER_CHAIR_'], minutes: [20, 35] },
          { state: 'PAY', points: ['BARBER_RECEPTION'], minutes: [1, 3] },
        ],
      },
      {
        role: 'products', label: 'Alguien mirando productos', line: 'Sólo venía a por la cera.', weight: 1,
        plan: [
          { state: 'BROWSE', points: ['BARBER_SHELF'], minutes: [2, 5] },
          { state: 'PAY', points: ['BARBER_RECEPTION'], minutes: [1, 3] },
        ],
      },
    ],
  },
  {
    place: 'wine-bar',
    // Tarde de vinos: poca gente al abrir, llena a la hora de cenar y tranquila al cierre.
    bands: [[18, 20, 'LOW'], [20, 22, 'MEDIUM'], [22, 24, 'HIGH'], [0, 1, 'LOW']],
    // El lunes cierra; viernes y sábado, un nivel más; el domingo, uno menos.
    weekday: [0, 0, 0, 0, 1, 1, -1],
    maxVisitors: 12,
    staff: [
      { service: 'bartender', npc: 'bruno', points: ['WINE_BAR_STAFF'], offers: 'wine-bar' },
      // Siempre hay quien sirve las mesas: vinos por copa o botella y tapas, llevados a la mesa.
      { service: 'waiter', line: '¿Te recomiendo algún vino?', points: ['WINE_BAR_WAITER'], serves: ['WINE_BAR_TABLE_', 'WINE_BAR_DATE_'] },
    ],
    // Servicio de mesa (systems/TableService.ts) con la carta de la vinoteca: tintos, blancos, rosados y tapas.
    tableService: { menu: 'la-cepa', pass: 'WINE_BAR_PASS', kitchen: 'WINE_BAR_STAFF' },
    visitors: [
      {
        role: 'couple', label: 'Una pareja', line: '(Hablan bajito. No es tu conversación.)', weight: 3, party: [2, 2],
        plan: [
          { state: 'DRINK', points: ['WINE_BAR_DATE_', 'WINE_BAR_TABLE_'], minutes: [35, 70] },
          { state: 'TALK', points: ['WINE_BAR_TABLE_', 'WINE_BAR_DATE_'], minutes: [15, 30], chance: 0.5 },
        ],
      },
      {
        role: 'friends', label: 'Alguien con amigos', line: 'Otra ronda y nos vamos, que mañana se trabaja.', weight: 2, party: [2, 3],
        plan: [
          { state: 'DRINK', points: ['WINE_BAR_TABLE_'], minutes: [30, 60] },
          { state: 'TALK', points: ['WINE_BAR_TABLE_'], minutes: [15, 30] },
        ],
      },
      {
        role: 'regular', label: 'Un habitual', line: 'Siempre me siento en la barra. Bruno ya sabe lo que tomo.', weight: 2,
        plan: [
          { state: 'ORDER', points: ['WINE_BAR_STOOL_'], minutes: [2, 4] },
          { state: 'DRINK', points: ['WINE_BAR_STOOL_'], minutes: [25, 50] },
        ],
      },
      {
        role: 'waiting', label: 'Alguien esperando', line: 'He quedado. Llega tarde, como siempre.', weight: 1,
        plan: [
          { state: 'WAIT', points: ['WINE_BAR_WAIT_'], minutes: [5, 12] },
          { state: 'DRINK', points: ['WINE_BAR_STOOL_', 'WINE_BAR_TABLE_'], minutes: [20, 40] },
        ],
      },
    ],
  },
  // --------------------------------------------------- Calle del Carmen
  // Las tres tiendas de ropa, con el mismo recorrido de cliente: mirar, probarse, pagar.
  // Quien cobra ofrece la tienda (data/retail.ts); otro dependiente sale cuando hay gente.
  {
    place: 'vintage-store',
    bands: [[11, 13, 'LOW'], [13, 17, 'MEDIUM'], [17, 21, 'HIGH']],
    // El sábado, que Gus trae lo del rastro, se llena.
    weekday: [-1, -1, 0, 0, 0, 1, 0],
    maxVisitors: 6,
    staff: [
      { service: 'cashier', npc: 'gus', label: 'Retales', line: 'Si te gusta, pruébatelo: mañana ya no está.', points: ['RETALES_STAFF'], offers: 'shop-retales' },
      { service: 'shop-worker', line: 'Lo de los setenta, en el perchero del fondo.', points: ['RETALES_FLOOR_'], minLevel: 'HIGH' },
    ],
    visitors: [
      {
        role: 'vintage-hunter', label: 'Alguien buscando vintage', line: 'Busco una chaqueta como la de mi padre en las fotos.', weight: 3, party: [1, 2],
        plan: [
          { state: 'BROWSE', points: ['RETALES_RACK_', 'RETALES_TABLE'], minutes: [4, 10], repeat: [1, 3] },
          { state: 'CHECK_ITEM', points: ['RETALES_FITTING_', 'RETALES_MIRROR'], minutes: [3, 8], chance: 0.6 },
          { state: 'QUEUE', points: ['RETALES_TILL', 'RETALES_QUEUE_'], minutes: [1, 3], chance: 0.5 },
        ],
      },
    ],
  },
  {
    place: 'streetwear-store',
    bands: [[12, 15, 'LOW'], [15, 18, 'MEDIUM'], [18, 21, 'HIGH']],
    // Viernes y sábado, lanzamientos; el domingo abre y es cuando más gente joven viene.
    weekday: [-2, -1, 0, 0, 1, 1, 0],
    maxVisitors: 8,
    staff: [
      { service: 'cashier', label: 'Archivo', line: 'Esa sudadera es de una tirada de doscientas.', look: 'uniforme-archivo', points: ['ARCHIVO_STAFF'], offers: 'shop-archivo' },
      { service: 'shop-worker', line: 'Las zapatillas de arriba sólo se miran.', look: 'uniforme-archivo', points: ['ARCHIVO_FLOOR_'], minLevel: 'MEDIUM' },
    ],
    visitors: [
      {
        role: 'sneakerhead', label: 'Alguien mirando zapatillas', line: 'Estas salieron en el noventa y seis. Y yo sin ellas.', weight: 2, party: [1, 3],
        plan: [
          { state: 'BROWSE', points: ['ARCHIVO_WALL_', 'ARCHIVO_TABLE'], minutes: [3, 8], repeat: [1, 2] },
          { state: 'BROWSE', points: ['ARCHIVO_RACK_'], minutes: [3, 6], chance: 0.6 },
          { state: 'QUEUE', points: ['ARCHIVO_TILL', 'ARCHIVO_QUEUE_'], minutes: [1, 3], chance: 0.4 },
        ],
      },
      {
        role: 'shopper', label: 'Cliente', line: 'Me pruebo la talla grande, por si acaso.', weight: 2,
        plan: [
          { state: 'BROWSE', points: ['ARCHIVO_RACK_'], minutes: [3, 8], repeat: [1, 2] },
          { state: 'CHECK_ITEM', points: ['ARCHIVO_FITTING_'], minutes: [3, 6], chance: 0.5 },
          { state: 'QUEUE', points: ['ARCHIVO_TILL', 'ARCHIVO_QUEUE_'], minutes: [1, 3], chance: 0.6 },
        ],
      },
    ],
  },
  {
    place: 'thrift-store',
    bands: [[10, 12, 'MEDIUM'], [12, 16, 'LOW'], [16, 20, 'HIGH']],
    weekday: [0, 0, 0, 0, 0, 1, 0],
    maxVisitors: 8,
    staff: [
      { service: 'cashier', label: 'Segunda Vuelta', line: 'Si lo quieres al peso, ponlo en la báscula.', look: 'uniforme-vuelta', points: ['VUELTA_STAFF'], offers: 'shop-vuelta' },
      { service: 'shop-worker', label: 'Clasificando', line: 'Esto llegó ayer. Aún no sé ni qué es.', look: 'uniforme-vuelta', points: ['VUELTA_FLOOR_', 'VUELTA_RACK_'], minLevel: 'MEDIUM' },
    ],
    visitors: [
      {
        role: 'digger', label: 'Alguien rebuscando', line: 'En el cajón de abajo siempre está lo mejor.', weight: 3, party: [1, 2],
        plan: [
          { state: 'BROWSE', points: ['VUELTA_BIN_', 'VUELTA_RACK_'], minutes: [4, 12], repeat: [2, 4] },
          { state: 'CHECK_ITEM', points: ['VUELTA_FITTING_'], minutes: [3, 6], chance: 0.4 },
          { state: 'QUEUE', points: ['VUELTA_TILL', 'VUELTA_QUEUE_'], minutes: [1, 3], chance: 0.7 },
        ],
      },
    ],
  },
  {
    place: 'sneaker-store',
    // Abre de martes a sábado; el sábado, el sorteo llena la tienda.
    bands: [[11, 14, 'LOW'], [14, 18, 'MEDIUM'], [18, 21, 'HIGH']],
    weekday: [0, -1, -1, 0, 0, 1, 0],
    maxVisitors: 7,
    staff: [
      { service: 'cashier', label: 'Suela', line: 'Esa talla ya no la tengo. Ni la siguiente.', look: 'uniforme-archivo', points: ['SUELA_STAFF'], offers: 'shop-suela' },
      { service: 'shop-worker', label: 'Reponiendo', line: 'Lo de la pared de arriba sólo se mira.', look: 'uniforme-archivo', points: ['SUELA_FLOOR_'], minLevel: 'MEDIUM' },
    ],
    visitors: [
      {
        role: 'sneakerhead', label: 'Alguien mirando zapatillas', line: 'Ya sé que no tienen mi talla. Voy igual.', weight: 3, party: [1, 2],
        plan: [
          { state: 'BROWSE', points: ['SUELA_WALL_', 'SUELA_TABLE_'], minutes: [4, 10], repeat: [2, 3] },
          { state: 'QUEUE', points: ['SUELA_TILL', 'SUELA_QUEUE_'], minutes: [1, 3], chance: 0.5 },
        ],
      },
    ],
  },
  // ------------------------------------------------------ Ribera Norte
  {
    place: 'arcade',
    // Cerrado por la mañana; por la tarde, chavales y algún adulto nostálgico; por la noche y el fin de semana, lleno.
    bands: [[12, 15, 'LOW'], [15, 18, 'MEDIUM'], [18, 24, 'HIGH']],
    weekday: [0, 0, 0, 0, 1, 2, 1],
    maxVisitors: 18,
    staff: [
      { service: 'cashier', label: 'Nova', line: 'Las monedas, al mostrador. Y a las máquinas no se les pega.', look: 'uniforme-arcade', points: ['ARCADE_STAFF'] },
      { service: 'shop-worker', label: 'Cambiando fichas', line: 'Esa lleva rota desde el martes. Pero te quita las monedas igual.', look: 'uniforme-arcade', points: ['ARCADE_FLOOR_'], minLevel: 'HIGH' },
    ],
    // Cuánto dura cada máquina lo dice su puesto (data/stations.ts); aquí, a cuál va cada uno y en qué orden.
    visitors: [
      {
        role: 'arcade_fighter', label: 'Alguien echando una partida', line: 'No me molestes, que estoy en el último jefe.', weight: 4,
        plan: [
          { state: 'PAY', points: ['ARCADE_TILL'], minutes: [1, 2], chance: 0.5 },
          { state: 'WAIT', points: ['ARCADE_WAIT_'], minutes: [1, 3], chance: 0.4 },
          { state: 'PLAY', points: ['ARCADE_FIGHT_', 'ARCADE_RACE_'], minutes: [8, 14], repeat: [1, 3] },
          { state: 'REST', points: ['ARCADE_SEAT_'], minutes: [3, 8], chance: 0.5 },
        ],
      },
      {
        role: 'arcade_racer', label: 'Alguien en las carreras', line: 'Una más y me voy. Eso dije hace tres partidas.', weight: 3,
        plan: [
          { state: 'WAIT', points: ['ARCADE_WAIT_'], minutes: [1, 3], chance: 0.4 },
          { state: 'PLAY', points: ['ARCADE_RACE_'], minutes: [8, 14], repeat: [1, 2] },
          { state: 'PLAY', points: ['ARCADE_CLAW_'], minutes: [4, 8], chance: 0.5 },
        ],
      },
      {
        role: 'arcade_rhythm', label: 'Alguien en la máquina de ritmo', line: 'No sabía que tenía tanto ritmo. Resulta que tampoco.', weight: 2,
        plan: [
          { state: 'WAIT', points: ['ARCADE_WAIT_'], minutes: [1, 3], chance: 0.5 },
          { state: 'PLAY', points: ['ARCADE_RHYTHM_'], minutes: [5, 9], repeat: [1, 2] },
          { state: 'REST', points: ['ARCADE_SEAT_'], minutes: [3, 8], chance: 0.6 },
        ],
      },
      {
        role: 'arcade_crowd', label: 'Gente en el salón', line: 'Yo miro. Mi amigo es el que juega. Yo miro y critico.', weight: 3, hours: [17, 24], party: [2, 3],
        plan: [
          { state: 'WAIT', points: ['ARCADE_WAIT_', 'ARCADE_CHAT_'], minutes: [3, 8] },
          { state: 'PLAY', points: ['ARCADE_FIGHT_', 'ARCADE_RACE_', 'ARCADE_RHYTHM_'], minutes: [8, 14], repeat: [1, 2] },
          { state: 'REST', points: ['ARCADE_SEAT_'], minutes: [4, 10] },
        ],
      },
    ],
  },
  {
    place: 'tattoo-studio',
    // Con cita: el primer turno a mediodía y el grueso por la tarde.
    bands: [[12, 15, 'LOW'], [15, 18, 'MEDIUM'], [18, 21, 'HIGH']],
    weekday: [0, 0, 0, 0, 1, 1, 0],
    maxVisitors: 5,
    staff: [
      { service: 'tattoo-artist', npc: 'lia', points: ['TINTA_ARTIST_01'], serves: ['TINTA_CHAIR_'] },
      { service: 'tattoo-artist', label: 'Tatuadora', points: ['TINTA_ARTIST_02'], serves: ['TINTA_CHAIR_'], minLevel: 'MEDIUM' },
      { service: 'receptionist', label: 'Recepción', line: '¿Tienes cita o vienes a mirar el flash?', look: 'uniforme-tatuaje', points: ['TINTA_DESK'] },
    ],
    visitors: [
      {
        role: 'tattoo', label: 'Alguien tatuándose', line: 'No duele. Bueno, un poco. Bastante.', weight: 3,
        plan: [
          { state: 'CHECK_IN', points: ['TINTA_RECEPTION'], minutes: [2, 4] },
          { state: 'WAIT', points: ['TINTA_WAIT_'], minutes: [5, 20] },
          { state: 'TATTOO', points: ['TINTA_CHAIR_'], minutes: [40, 110] },
          { state: 'PAY', points: ['TINTA_RECEPTION'], minutes: [2, 4] },
        ],
      },
      {
        role: 'flash', label: 'Alguien mirando diseños', line: 'Ese de la golondrina. O el ancla. No sé.', weight: 2, party: [1, 2],
        plan: [
          { state: 'BROWSE', points: ['TINTA_FLASH_'], minutes: [3, 8], repeat: [1, 2] },
          { state: 'CHECK_IN', points: ['TINTA_RECEPTION'], minutes: [2, 5], chance: 0.5 },
        ],
      },
    ],
  },
  {
    place: 'coffee-molinillo',
    bands: [[8, 10, 'HIGH'], [10, 13, 'MEDIUM'], [13, 16, 'LOW'], [16, 19, 'MEDIUM'], [19, 20, 'LOW']],
    weekday: [0, 0, 0, 0, 0, 1, 1],
    maxVisitors: 5,
    staff: [{ service: 'bartender', label: 'Barra', line: '¿Con leche de avena o de la de siempre?', points: ['MOLINILLO_STAFF'] }],
    visitors: [
      {
        role: 'customer', label: 'Cliente', line: 'Aquí el café sabe a café.', weight: 3, party: [1, 2],
        plan: [
          { state: 'ORDER', points: ['MOLINILLO_COUNTER', 'MOLINILLO_QUEUE_'], minutes: [1, 3] },
          { state: 'DRINK', points: ['MOLINILLO_TABLE_'], minutes: [15, 40] },
        ],
      },
      {
        role: 'takeaway', label: 'Cliente con prisa', line: 'Para llevar, que abro la tienda.', weight: 2, hours: [8, 11],
        plan: [{ state: 'ORDER', points: ['MOLINILLO_COUNTER', 'MOLINILLO_QUEUE_'], minutes: [1, 2] }],
      },
    ],
  },
  // ---------------------------------------------------------------- Ribera Norte
  {
    place: 'bar-ribera',
    // El bar de siempre: el vermú de mediodía, la caña a la salida del trabajo y lo más lleno, de noche (hasta las dos).
    bands: [[11, 14, 'LOW'], [14, 19, 'MEDIUM'], [19, 24, 'HIGH'], [0, 2, 'MEDIUM']],
    // Viernes y sábado, más llena; lunes, tranquila.
    weekday: [-1, 0, 0, 0, 1, 2, 0],
    maxVisitors: 12,
    drinks: ['beer', 'beer', 'beer', 'wine', 'wine', 'soft', 'water'],
    // Tere lleva la barra: va y viene entre el tirador, la estantería y la caja, y se vuelve a quien acaba de pedir.
    staff: [{ service: 'barkeeper', npc: 'tere', points: ['BAR_STAFF_'], offers: 'bar-ribera' }],
    visitors: [
      {
        // El parroquiano de la barra: pide, bebe en un taburete o de pie, se pasa a una mesa alta y, a veces, repite.
        role: 'regular', label: 'Parroquiano', line: 'Tere, ponme otra, que ésta se ha evaporado.', weight: 3,
        plan: [
          { state: 'ORDER', points: ['BAR_COUNTER_'], minutes: [2, 4] },
          { state: 'DRINK', points: ['BAR_STOOL_', 'BAR_COUNTER_'], minutes: [28, 50] },
          { state: 'TALK', points: ['BAR_TABLE_'], minutes: [16, 32], chance: 0.45 },
          { state: 'ORDER', points: ['BAR_COUNTER_'], minutes: [2, 4], chance: 0.4 },
          { state: 'DRINK', points: ['BAR_STOOL_', 'BAR_COUNTER_', 'BAR_TABLE_'], minutes: [22, 40], chance: 0.4 },
        ],
      },
      {
        // Amigos: uno pide por todos y se van a una mesa alta a charlar con el vaso en la mano.
        role: 'friends', label: 'Cliente', line: 'Una ronda más y nos vamos. Esa la dijimos hace dos.', weight: 2, party: [2, 3],
        plan: [
          { state: 'ORDER', points: ['BAR_COUNTER_'], minutes: [2, 4] },
          { state: 'DRINK', points: ['BAR_TABLE_'], minutes: [34, 58] },
          { state: 'TALK', points: ['BAR_TABLE_'], minutes: [20, 36] },
          { state: 'ORDER', points: ['BAR_COUNTER_'], minutes: [2, 4], chance: 0.5 },
          { state: 'DRINK', points: ['BAR_TABLE_'], minutes: [26, 44], chance: 0.5 },
        ],
      },
      {
        // Solo o en pareja, sentados a la barra: una bebida, el móvil y a otra cosa.
        role: 'sitter', label: 'Cliente', line: 'Aquí se está bien. Hasta que cierran.', weight: 2, party: [1, 2],
        plan: [
          { state: 'ORDER', points: ['BAR_COUNTER_'], minutes: [2, 4] },
          { state: 'DRINK', points: ['BAR_STOOL_'], minutes: [32, 56] },
          { state: 'PHONE', points: ['BAR_STOOL_'], minutes: [8, 16], chance: 0.5 },
        ],
      },
    ],
  },
  {
    place: 'colmado',
    // Abierto hasta medianoche: la compra de última hora es la que más se nota.
    bands: [[8, 11, 'LOW'], [11, 14, 'MEDIUM'], [14, 18, 'LOW'], [18, 22, 'HIGH'], [22, 24, 'MEDIUM']],
    weekday: [0, 0, 0, 0, 1, 1, 0],
    maxVisitors: 5,
    staff: [{ service: 'cashier', label: 'Colmado', line: '¿Algo más? Pan ya no queda, lo siento.', look: 'uniforme-super', points: ['COLMADO_STAFF'] }],
    visitors: [
      {
        role: 'customer', label: 'Cliente', line: 'Sólo venía por hielo y he salido con tres bolsas.', weight: 1,
        plan: [
          { state: 'BROWSE_AISLE', points: ['COLMADO_AISLE_', 'COLMADO_FRIDGE'], minutes: [1, 4], repeat: [1, 2] },
          { state: 'QUEUE', points: ['COLMADO_QUEUE_'], minutes: [1, 2] },
          { state: 'CHECKOUT', points: ['COLMADO_TILL'], minutes: [1, 2] },
        ],
      },
    ],
  },
  {
    place: 'sports-store',
    bands: [[10, 13, 'LOW'], [13, 17, 'MEDIUM'], [17, 21, 'HIGH']],
    weekday: [-1, 0, 0, 0, 1, 1, 0],
    maxVisitors: 6,
    staff: [{ service: 'cashier', label: 'Ribera Sport', line: 'Las de correr, mejor media talla más.', look: 'uniforme-tienda', points: ['SPORT_STAFF'] }],
    visitors: [
      {
        role: 'shopper', label: 'Cliente', line: 'Vengo a mirar zapatillas. Sólo a mirar.', weight: 1,
        plan: [
          { state: 'BROWSE', points: ['SPORT_WALL_', 'SPORT_TABLE_', 'SPORT_RACK_'], minutes: [3, 7], repeat: [1, 3] },
          { state: 'QUEUE', points: ['SPORT_TILL', 'SPORT_QUEUE_'], minutes: [1, 3], chance: 0.5 },
        ],
      },
    ],
  },
  {
    place: 'cafe-rio',
    bands: [[8, 12, 'HIGH'], [12, 16, 'MEDIUM'], [16, 20, 'HIGH'], [20, 22, 'LOW']],
    weekday: [0, 0, 0, 0, 0, 1, 1],
    maxVisitors: 6,
    staff: [{ service: 'bartender', label: 'Barra', line: 'Por la tarde, vermú de grifo. Por la mañana, café, que hay que despertar.', look: 'uniforme-sala', points: ['CAFE_RIO_STAFF'] }],
    visitors: [
      {
        role: 'customer', label: 'Cliente', line: 'Desde esta ventana se ve pasar medio barrio.', weight: 3, party: [1, 2],
        plan: [
          { state: 'ORDER', points: ['CAFE_RIO_COUNTER', 'CAFE_RIO_QUEUE_'], minutes: [1, 3] },
          { state: 'DRINK', points: ['CAFE_RIO_TABLE_'], minutes: [15, 40] },
        ],
      },
      {
        role: 'takeaway', label: 'Cliente con prisa', line: 'Para llevar, que pierdo el metro.', weight: 2, hours: [8, 11],
        plan: [{ state: 'ORDER', points: ['CAFE_RIO_COUNTER', 'CAFE_RIO_QUEUE_'], minutes: [1, 2] }],
      },
    ],
  },
  {
    place: 'casa-mar',
    bands: [[12, 14, 'MEDIUM'], [14, 16, 'HIGH'], [16, 20, 'LOW'], [20, 23, 'HIGH'], [23, 24, 'LOW']],
    // Fin de semana, el arroz del domingo.
    weekday: [-1, 0, 0, 0, 1, 1, 1],
    maxVisitors: 10,
    staff: [
      { service: 'cook', label: 'Cocina · Casa Mar', line: 'El arroz no se toca mientras se hace. Ni se mira.', look: 'uniforme-sala', points: ['CASAMAR_STAFF'] },
      { service: 'waiter', line: '¿Mesa dentro o en la terraza?', points: ['CASAMAR_WAITER_'], serves: ['CASAMAR_TABLE_'] },
    ],
    // La comida va por el servicio de mesa: piden, esperan a cocina, comen, pagan y se van.
    tableService: { menu: 'casa-mar', pass: 'CASAMAR_PASS', kitchen: 'CASAMAR_STAFF' },
    visitors: [
      {
        role: 'diner', label: 'Comensal', line: 'Aquí el arroz lo hacen como en casa de mi abuela.', weight: 1, party: [1, 2],
        plan: [
          { state: 'WAIT', points: ['CASAMAR_WAIT_'], minutes: [1, 3] },
          { state: 'DINE', points: ['CASAMAR_TABLE_'], minutes: [50, 80] },
        ],
      },
    ],
  },
];
