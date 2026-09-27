import type { Level } from '../config/population.ts';
import type { ServiceId } from './services.ts';

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
}

export interface PopulationProfile {
  place: string;
  /** [desde, hasta, nivel] en horas; lo que no cubren las franjas cuenta como VERY_LOW. */
  bands: readonly (readonly [number, number, Level])[];
  /** Niveles que sube o baja cada día, de lunes a domingo. */
  weekday: readonly [number, number, number, number, number, number, number];
  /** Tope de visitantes por tamaño del local, además del aforo del lugar. */
  maxVisitors: number;
  staff: readonly StaffRole[];
  visitors: readonly VisitorRole[];
}

export const POPULATION_PROFILES: readonly PopulationProfile[] = [
  {
    place: 'gym',
    bands: [[6, 8, 'LOW'], [8, 10, 'MEDIUM'], [10, 16, 'LOW'], [16, 18, 'MEDIUM'], [18, 21, 'HIGH'], [21, 23, 'LOW']],
    // Fuerte después del trabajo; el sábado a medio gas y el domingo flojo.
    weekday: [0, 0, 0, 0, 0, -1, -2],
    maxVisitors: 14,
    staff: [
      { service: 'receptionist', npc: 'nerea', points: ['GYM_STAFF'] },
      { service: 'gym-staff', points: ['GYM_COACH_'], minLevel: 'MEDIUM' },
    ],
    visitors: [
      {
        role: 'gym_member', label: 'Alguien entrenando', line: 'Ahora no, que pierdo la cuenta de la serie.', weight: 1,
        plan: [
          { state: 'CHECK_IN', points: ['GYM_RECEPTION'], minutes: [1, 2] },
          { state: 'CHANGE', points: ['GYM_LOCKERS'], minutes: [2, 4], chance: 0.6 },
          { state: 'EXERCISE', points: ['GYM_TREADMILL_', 'GYM_WEIGHTS', 'GYM_BENCH_', 'GYM_MAT_', 'GYM_TRAINING_ZONE'], minutes: [10, 22], repeat: [1, 3] },
          { state: 'REST', points: ['GYM_WATER'], minutes: [1, 3], chance: 0.5 },
        ],
      },
    ],
  },
  {
    place: 'cafe',
    bands: [[7, 9, 'HIGH'], [9, 12, 'MEDIUM'], [12, 15, 'HIGH'], [15, 18, 'MEDIUM'], [18, 21, 'MEDIUM'], [21, 22, 'LOW']],
    // Sábado y domingo por la mañana se llena más.
    weekday: [0, 0, 0, 0, 0, 1, 1],
    maxVisitors: 8,
    staff: [
      { service: 'bartender', npc: 'nilo', points: ['CAFE_BARISTA'] },
      { service: 'waiter', points: ['CAFE_WAITER_'], serves: ['CAFE_TABLE_', 'CAFE_WINDOW_SEAT'], minLevel: 'MEDIUM' },
    ],
    visitors: [
      {
        role: 'customer', label: 'Cliente', line: 'Está bueno, pero quema.', weight: 3, party: [1, 3],
        plan: [
          { state: 'ORDER', points: ['CAFE_COUNTER', 'CAFE_QUEUE_'], minutes: [1, 3] },
          { state: 'DRINK', points: ['CAFE_TABLE_', 'CAFE_WINDOW_SEAT'], minutes: [15, 40] },
        ],
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
      { service: 'cashier', npc: 'ivan', points: ['CLOTHING_STORE_STAFF'] },
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
      { service: 'waiter', line: 'Ahora mismo le traigo la cuenta.', points: ['RESTAURANT_WAITER_'], serves: ['RESTAURANT_TABLE_'], minLevel: 'HIGH' },
    ],
    visitors: [
      {
        role: 'diner', label: 'Comensal', line: 'El menú de hoy no está mal.', weight: 1, party: [1, 4],
        plan: [
          { state: 'WAIT', points: ['RESTAURANT_WAIT_'], minutes: [1, 3] },
          { state: 'EAT', points: ['RESTAURANT_TABLE_'], minutes: [30, 60] },
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
      { service: 'bartender', line: '¿Qué te pongo? Rápido, que hay cola.', points: ['CLUB_BARTENDER_01'] },
      { service: 'bartender', line: 'Un segundo, que voy.', points: ['CLUB_BARTENDER_02'], minLevel: 'HIGH' },
      { service: 'dj', points: ['CLUB_DJ'] },
    ],
    visitors: [
      {
        role: 'clubber', label: 'Alguien de fiesta', line: '¡Esta canción me encanta!', weight: 3, party: [1, 3],
        plan: [
          { state: 'DRINK', points: ['CLUB_BAR_'], minutes: [3, 8] },
          { state: 'DANCE', points: ['CLUB_DANCE_'], minutes: [12, 30], repeat: [1, 3] },
          { state: 'TALK', points: ['CLUB_STAND_', 'CLUB_SEAT_'], minutes: [8, 20], chance: 0.6 },
          { state: 'DRINK', points: ['CLUB_BAR_'], minutes: [3, 6], chance: 0.4 },
          { state: 'DANCE', points: ['CLUB_DANCE_'], minutes: [12, 30], chance: 0.5 },
        ],
      },
      {
        role: 'lounger', label: 'Alguien charlando', line: 'No se oye nada, pero da igual.', weight: 1, party: [2, 3],
        plan: [
          { state: 'DRINK', points: ['CLUB_BAR_'], minutes: [3, 8] },
          { state: 'TALK', points: ['CLUB_SEAT_', 'CLUB_STAND_'], minutes: [20, 45] },
          { state: 'DANCE', points: ['CLUB_DANCE_'], minutes: [10, 20], chance: 0.3 },
        ],
      },
    ],
  },
];
