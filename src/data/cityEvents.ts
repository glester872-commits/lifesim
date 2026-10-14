/**
 * Sucesos grandes de la ciudad con su propio calendario. Los demás ya tienen su sistema (pop-ups en data/popups.ts,
 * artistas y manteros en data/streetActs.ts, peleas en data/streetEvents.ts); systems/World.ts los junta por barrio.
 *
 * El partido del Arena (data/arena.ts): un día de partido el Distrito Arena no se parece a un día normal. El reloj de
 * fases sale de aquí (systems/Match.ts) y cada sistema lo lee con sus propios datos: la gente de la calle
 * (TripRule.match, StreetProfile.match), los bares (PopulationProfile.match), la venta ambulante (StreetAct.match), la
 * afluencia de las zonas (DistrictIdentity.match), la basura (litter), el metro (metro) y la megafonía.
 */

/**
 * Fases de un día de partido, relativas al saque:
 *   build-up  horas antes: llega la afición, los bares se llenan, salen los vendedores y la policía
 *   arrival   la última hora y media: riadas hacia el estadio y colas en los tornos
 *   live      el partido: la calle se queda casi vacía
 *   leaving   el pitido final: salida masiva, colas en el metro
 *   after     la sobremesa: bares y restaurantes llenos, se va vaciando
 */
export type MatchPhase = 'build-up' | 'arrival' | 'live' | 'leaving' | 'after';

export const MATCH_PHASES: readonly MatchPhase[] = ['build-up', 'arrival', 'live', 'leaving', 'after'];

/** El equipo de la casa. Ficticio de arriba abajo: ni nombre, ni colores, ni escudo de un club de verdad. */
export interface Club {
  name: string;
  short: string;
  /** Cómo los llama la grada. */
  nickname: string;
  /** Primera y segunda equipación: camiseta y manga/remate. */
  home: readonly [string, string];
  away: readonly [string, string];
  stadium: string;
  /** Lo que se canta (bocadillos de quien va de camino y de quien espera en la cola). */
  chants: readonly string[];
  /** Rivales de visita: sólo nombres, para las frases. */
  rivals: readonly string[];
}

export const ARENA_CLUB: Club = {
  name: 'Club Deportivo Halcones del Arena',
  short: 'Halcones',
  nickname: 'los Halcones',
  // Turquesa con remate naranja; la segunda, naranja con turquesa. Ningún club de la ciudad viste así.
  home: ['#1f8f8a', '#f08a24'],
  away: ['#f08a24', '#1f8f8a'],
  stadium: 'Estadio del Halcón',
  chants: ['¡Ha-lco-nes! ¡Ha-lco-nes!', '¡Turquesa y naranja, esta grada no se cansa!', '¡Vamos, Halcones, que hoy se vuela!', '¡Eeeeh, Halcones, eeeeh!'],
  rivals: ['Deportivo Marisma', 'Unión Cantera', 'Atlas del Valle', 'Racing Vereda'],
};

export interface MatchSchedule {
  district: string;
  name: string;
  /** Días de la semana con partido posible (0 lunes … 6 domingo) y la probabilidad de cada uno. */
  days: Readonly<Record<number, number>>;
  /** Horas de saque posibles (minuto del día); sale una por semilla. */
  kickoffs: readonly number[];
  /** [desde, hasta) de cada fase, en minutos desde el saque. Sin huecos: una empieza donde acaba la anterior. */
  phases: Readonly<Record<MatchPhase, readonly [number, number]>>;
  /** Niveles de gente de más en el andén de cada parada (id de STOPS, data/transit.ts) según la fase. */
  metro: Readonly<Record<string, Partial<Record<MatchPhase, number>>>>;
  /** Cuánta más basura cae en las calles del barrio (multiplica intentos y tope; systems/Litter). */
  litter: Partial<Record<MatchPhase, number>>;
}

export const ARENA_MATCHES: MatchSchedule = {
  district: 'arena',
  name: 'Partido en el Estadio del Halcón',
  // Fin de semana casi siempre; algún miércoles, de copa.
  days: { 2: 0.35, 5: 0.75, 6: 0.6 },
  kickoffs: [16 * 60, 18 * 60 + 30, 21 * 60],
  phases: {
    'build-up': [-240, -90],
    arrival: [-90, 0],
    live: [0, 110],
    leaving: [110, 155],
    after: [155, 275],
  },
  // La parada del Arena se desborda a la llegada y a la salida; Puerta Central, el intercambiador, lo nota también.
  metro: {
    arena: { 'build-up': 1, arrival: 2, live: -1, leaving: 3, after: 1 },
    'puerta-central': { arrival: 1, leaving: 1 },
  },
  litter: { arrival: 1.5, live: 1.2, leaving: 3, after: 2.5 },
};
