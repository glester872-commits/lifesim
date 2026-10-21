/**
 * Parroquia de San Blas (CV-05): la iglesia del norte de la Plaza de la Fuente. Se visita libremente en su horario
 * (data/places.ts) y los domingos a mediodía abre la nave al ensayo del coro del barrio, que no pide nada a quien viene: se canta
 * de todo y se puede escuchar sin cantar. Las reglas están en systems/Parish.ts; la gente, en data/population.ts.
 *
 * Nadie del barrio tiene creencias por estar aquí: quien viene al ensayo viene a cantar o a pasar el rato con vecinos.
 */

/** Cómo sale una tarde de ensayo: quedarse hasta el final o irse antes (o haber llegado tarde). */
export interface GatheringEffect {
  /** Energía del jugador: cantar un rato con gente despeja. */
  energy: number;
  /** Lo que cambia en el perfil social de quien lo lleva (systems/Social.applyDelta). */
  friendship: number;
  trust: number;
  mood: number;
}

export interface GatheringDef {
  /** Prefijo del id estable de cada ensayo: `${id}-${día}`. */
  id: string;
  name: string;
  /** Lugar (data/places.ts) donde ocurre. */
  place: string;
  /** Quien lo lleva: personaje con nombre (data/npcs.ts), en su puesto mientras la iglesia está abierta. */
  host: string;
  /** Días de la semana (0 lunes … 6 domingo). */
  days: readonly number[];
  /** Hora de empezar (con decimales) y duración en minutos. */
  start: number;
  minutes: number;
  /** Hasta cuántos minutos después de empezar se puede entrar. */
  lateMax: number;
  /** Llegar más tarde de esto ya no cuenta como «desde el principio». */
  onTime: number;
  /** «Sólo un rato»: minutos que se queda quien se va antes. */
  shortStay: number;
  /** Cuánta gente del barrio viene [mín, máx]. */
  guests: readonly [number, number];
  /** Dónde se sientan (prefijos de puntos del interior) y cómo se les ve al hablarles (systems/Crowd). */
  seats: readonly string[];
  guest: { label: string; line: string };
  full: GatheringEffect;
  partial: GatheringEffect;
  /** Lo que se ve al llegar y lo que se cuenta al acabar. */
  pitch: string;
  fullLines: readonly string[];
  partialLines: readonly string[];
}

export const CHOIR: GatheringDef = {
  id: 'coro',
  name: 'Ensayo abierto del coro del barrio',
  place: 'parish',
  host: 'encarna',
  days: [6],
  start: 12,
  minutes: 90,
  lateMax: 45,
  onTime: 10,
  shortStay: 30,
  guests: [5, 7],
  seats: ['PARISH_PEW_'],
  guest: { label: 'Coro del barrio', line: 'Yo vengo por las habaneras. Lo demás lo tarareo.' },
  full: { energy: 6, friendship: 5, trust: 3, mood: 5 },
  partial: { energy: 2, friendship: 2, trust: 1, mood: 2 },
  pitch: 'Los domingos a las doce la nave se llena de voces: habaneras, boleros y lo que proponga quien venga. No hace falta saber cantar ni ser de la parroquia.',
  fullLines: [
    'Encarna reparte las letras fotocopiadas y marca el compás con la mano. Al principio no te sale; a la tercera, sí.',
    'Al acabar, quien está a tu lado te pregunta si vuelves el domingo que viene.',
  ],
  partialLines: [
    'Cantas un par de canciones desde el último banco y te vas antes de que acaben.',
    'Encarna te hace un gesto desde el altar: «Cuando quieras, el domingo que viene».',
  ],
};

/** La visita libre: sentarse un rato en silencio en el rincón de las lamparillas (data/activities.ts). */
export const PARISH_REST = 'parish-rest';
