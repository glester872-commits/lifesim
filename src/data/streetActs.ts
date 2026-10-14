/**
 * Gente que trabaja en la calle por su cuenta (systems/StreetActs.ts, systems/StreetLife.ts): la venta ambulante y los
 * artistas callejeros. Llegan con sus cosas a cuestas, montan, venden o actúan, recogen y se van; con lluvia, recogen.
 *
 * Nada de su aspecto sale de este archivo: llevan la cara de cualquier vecino (PASSENGER_LOOKS, elegida por el id del
 * puesto con el peso de ropa de la zona, como cualquiera que pasa), así que quien vende en la manta, toca la guitarra o
 * hace de estatua puede ser cualquier persona. Lo único que cambia es lo que lleva y dónde se pone.
 * No tienen nada que ver con los carteristas ni con la gente que vive en la calle (data/streetSurvival.ts).
 *
 * Quien compra en la manta o se para a mirar la actuación es un viaje más de la calle (data/streets.ts) con
 * `act`: sólo sale mientras ese puesto está vendiendo o actuando.
 */

/** Venta ambulante; música; baile; estatua viviente. */
export type ActKind = 'vendor' | 'music' | 'dance' | 'statue';

/** Montando, vendiendo, actuando, recogiendo. MOVE (llegando o yéndose) lo pone StreetLife al andar. */
export type ActState = 'SETUP' | 'SELL' | 'PERFORM' | 'PACK';

/**
 * Lo que lleva cada uno (world/StreetActArt lo pinta): la manta con género (bisutería, ropa o recuerdos; al ir y
 * venir, hecha un hatillo a la espalda), la bandeja colgada, la guitarra y su funda abierta para las monedas, el
 * altavoz de quien baila y la peana de la estatua.
 */
export type ActProp = 'blanket-trinkets' | 'blanket-clothes' | 'blanket-souvenirs' | 'tray' | 'guitar' | 'case' | 'speaker' | 'pedestal';

export interface StreetAct {
  id: string;
  location: string;
  kind: ActKind;
  /** Lo que se lee al acercarse: lo que hace, no lo que es. */
  label: string;
  line: string;
  /** Sus sitios: el de quien lleva el puesto y, en un grupo, los de los demás, al lado. */
  pitch: readonly string[];
  /** Lo que lleva cada uno, en el orden de `pitch`. */
  kit: readonly (readonly ActProp[])[];
  /** Probabilidad de que venga un día cualquiera. */
  presence: number;
  /** Tramos del día [desde, hasta) en horas, sin cruzar la medianoche: llega al empezar y recoge al acabar. */
  shifts: readonly (readonly [number, number])[];
  /** Sólo estos días (0 lunes … 6 domingo); sin él, cualquiera. */
  days?: readonly number[];
  /** Sólo en estas fases del partido del Arena (systems/Match); entonces `shifts` no cuenta: manda el saque. */
  match?: readonly import('./cityEvents.ts').MatchPhase[];
}

const WEEKEND = [4, 5, 6] as const;

export const STREET_ACTS: readonly StreetAct[] = [
  // ---------------------------------------------------------------- Distrito Arena (data/arena.ts)
  // Sólo en día de partido (`match`, systems/Match): bufandas en manta y la bandeja de pipas y agua. Montan con la
  // llegada de la afición y recogen al empezar el partido (la bandeja vuelve a la salida).
  {
    id: 'ar-manta-bufandas', location: 'arena', kind: 'vendor', label: 'Alguien vendiendo bufandas en una manta', line: 'Bufandas, gorros y banderas. Turquesa y naranja, de todos los tamaños.',
    pitch: ['AR_PITCH_A'], kit: [['blanket-clothes']], presence: 0.95, shifts: [], match: ['build-up', 'arrival'],
  },
  {
    id: 'ar-bandeja', location: 'arena', kind: 'vendor', label: 'Alguien vendiendo pipas y agua', line: 'Pipas, agua y banderitas. ¡Que dentro cuesta el doble!',
    pitch: ['AR_PITCH_B'], kit: [['tray']], presence: 0.9, shifts: [], match: ['build-up', 'arrival', 'leaving'],
  },
  {
    id: 'ar-manta-camisetas', location: 'arena', kind: 'vendor', label: 'Alguien vendiendo camisetas en una manta', line: 'La camiseta del partido de hoy, con la fecha. Mañana ya no la hay.',
    pitch: ['AR_PITCH_C'], kit: [['blanket-clothes']], presence: 0.7, shifts: [], match: ['arrival', 'leaving'],
  },
  // ---------------------------------------------------------------- Puerta Central (data/puertaCentral.ts)
  // Venta en manta, a lo largo del paseo de la plaza: bisutería, ropa y recuerdos. Mediodía y tarde, más el fin de semana.
  {
    id: 'pc-manta-bisuteria', location: 'puerta-central', kind: 'vendor', label: 'Alguien vendiendo en una manta', line: 'Pulseras a cinco, tres por diez. Mira sin compromiso.',
    pitch: ['PC_STALL_A'], kit: [['blanket-trinkets']], presence: 0.8, shifts: [[11, 15], [17, 22]],
  },
  {
    id: 'pc-manta-ropa', location: 'puerta-central', kind: 'vendor', label: 'Alguien vendiendo ropa en una manta', line: 'Camisetas y gorras. Todas las tallas, casi.',
    pitch: ['PC_STALL_B'], kit: [['blanket-clothes']], presence: 0.6, shifts: [[12, 21.5]],
  },
  {
    id: 'pc-manta-recuerdos', location: 'puerta-central', kind: 'vendor', label: 'Alguien vendiendo recuerdos', line: 'Imanes, llaveros, abanicos. Para llevarse un poco de la plaza.',
    pitch: ['PC_STALL_C'], kit: [['blanket-souvenirs']], presence: 0.75, shifts: [[10.5, 14.5], [16.5, 21]],
  },
  {
    id: 'pc-bandeja', location: 'puerta-central', kind: 'vendor', label: 'Alguien vendiendo gafas de sol', line: 'Gafas, abanicos, cargadores. Lo que haga falta, aquí lo llevo.',
    pitch: ['PC_STALL_D'], kit: [['tray']], presence: 0.7, shifts: [[11.5, 20.5]],
  },
  {
    id: 'pc-manta-finde', location: 'puerta-central', kind: 'vendor', label: 'Alguien con una manta de bisutería', line: 'Lo hago yo, a mano. Por eso no hay dos iguales.',
    pitch: ['PC_STALL_E'], kit: [['blanket-trinkets']], presence: 0.85, shifts: [[12, 20]], days: WEEKEND,
  },
  // Artistas: guitarra junto al monumento, un grupo de baile con su altavoz, la estatua viviente y un dúo el fin de semana.
  {
    id: 'pc-guitarra', location: 'puerta-central', kind: 'music', label: 'Alguien tocando la guitarra', line: 'La siguiente es mía. Si os gusta, la funda está abierta.',
    pitch: ['PC_ACT_GUITAR'], kit: [['guitar', 'case']], presence: 0.75, shifts: [[11, 14], [18, 22.5]],
  },
  {
    id: 'pc-baile', location: 'puerta-central', kind: 'dance', label: 'Grupo de baile callejero', line: '¡Haced un poco de corro, que necesitamos sitio!',
    pitch: ['PC_ACT_DANCE_01', 'PC_ACT_DANCE_02', 'PC_ACT_DANCE_03'], kit: [['speaker'], [], []], presence: 0.5, shifts: [[17.5, 21]], days: [3, 4, 5, 6],
  },
  {
    id: 'pc-estatua', location: 'puerta-central', kind: 'statue', label: 'Estatua viviente', line: '(No se mueve. Ni un poco. Si echas una moneda, te guiña un ojo.)',
    pitch: ['PC_ACT_STATUE'], kit: [['pedestal']], presence: 0.65, shifts: [[11, 19]],
  },
  {
    id: 'pc-duo', location: 'puerta-central', kind: 'music', label: 'Dúo tocando en la plaza', line: 'Somos dos y una guitarra. La otra está en el taller.',
    pitch: ['PC_ACT_DUO_01', 'PC_ACT_DUO_02'], kit: [['guitar', 'case'], []], presence: 0.55, shifts: [[12.5, 16]], days: WEEKEND,
  },
];
