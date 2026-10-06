/**
 * Gente que vive en la calle (systems/StreetSurvival.ts, systems/StreetLife.ts).
 *
 * Vivir en la calle es una situación, no un carácter: aquí no hay «el mendigo»,
 * hay personas distintas con sus costumbres, sus sitios y su manera de tratar a
 * quien se acerca. Nada de su aspecto sale de este archivo: llevan el de
 * cualquier vecino (el aspecto se elige por id, sin mirar quién es), y el frío
 * les abriga como a todos (world/WeatherLooks). Lo que cambia es lo que llevan
 * consigo (mantas, bolsas, un carro, un perro) y dónde y cuándo se les ve.
 * No tienen nada que ver con los carteristas ni con ningún sistema de delitos.
 */

/** Lo que se le ve hacer en su sitio. MOVE (de un sitio a otro) lo pone StreetLife al andar. */
export type SurvivalState = 'SLEEP' | 'SIT' | 'REST' | 'ASK' | 'SHELTER' | 'IDLE';

/** Lo que lleva consigo: se pinta a su lado cuando está quieto (el carro, también andando). */
export type Belonging = 'blanket' | 'bags' | 'backpack' | 'cardboard' | 'cart' | 'cup';

/** Maneras de estar en la calle: cada persona combina una o dos. */
export type SurvivalProfile = 'sleeper' | 'sitter' | 'doorway' | 'asker' | 'walker' | 'cart' | 'dog' | 'watcher';

/** Un tramo de su día: [desde, hasta) en horas, a qué sitios va (el primero libre) y qué hace allí. */
export interface SurvivalSlot {
  from: number;
  to: number;
  spots: readonly string[];
  state: SurvivalState;
}

/** Lo que dice, por situación. Frases cortas: se rotan para no repetir. */
export interface SurvivalVoice {
  /** No quiere hablar ahora. */
  refuse: readonly string[];
  greet: readonly string[];
  /** Un poco de charla, si se deja. */
  chat: readonly string[];
  /** Pide algo suelto (sólo si en ese momento está pidiendo). */
  ask: readonly string[];
  /** Le has dado una moneda. */
  thanks: readonly string[];
  /** Ya te conoce: lo primero que dice. */
  known: readonly string[];
}

export interface StreetSurvivor {
  id: string;
  location: string;
  profiles: readonly SurvivalProfile[];
  /** Lo que se lee al acercarse: lo que hace, no lo que es. */
  label: string;
  belongings: readonly Belonging[];
  /** Perro (aspecto de systems/Wildlife.ts): va con él y se tumba a su lado. */
  dog?: number;
  /** Probabilidad de estar en el barrio un día cualquiera: no todos están siempre. */
  presence: number;
  /** Su día. Fuera de los tramos no está en el barrio (se va por un borde y vuelve otro día o a otra hora). */
  day: readonly SurvivalSlot[];
  /** Con lluvia, si su sitio está al raso: a cubierto (el primero libre). */
  shelter: readonly string[];
  /** De 0 a 1: lo a menudo que no le apetece hablar. */
  reserve: number;
  voice: SurvivalVoice;
}

/** Sitios a cubierto: la marquesina, el pórtico del metro, el soportal del banco y el pasaje. Con lluvia no hace falta moverse. */
export const COVERED: ReadonlySet<string> = new Set(['STREET_BUS_SHELTER', 'STREET_METRO_PORTICO', 'STREET_BANK_DOORWAY', 'STREET_PASAJE']);

/** Lo que dice casi cualquiera cuando no tiene ganas: se mezcla con lo propio de cada uno. */
const SHARED_REFUSE = ['Ahora no, gracias.', 'Déjalo, de verdad.', '(Hace un gesto con la mano. No es buen momento.)'];

export const STREET_SURVIVORS: readonly StreetSurvivor[] = [
  {
    // Duerme en el parque cuando hace bueno y bajo el pórtico del metro cuando no; de día, la plazuela.
    id: 'mantas-parque',
    location: 'district',
    profiles: ['sleeper', 'sitter'],
    label: 'Alguien con sus mantas',
    belongings: ['blanket', 'bags'],
    presence: 0.95,
    day: [
      { from: 0, to: 7.5, spots: ['PARK_BENCH_01', 'PARK_BENCH_02'], state: 'SLEEP' },
      { from: 7.5, to: 8.5, spots: ['PARK_BENCH_01', 'PARK_BENCH_02'], state: 'IDLE' },
      { from: 8.5, to: 13, spots: ['PLAZUELA_BENCH_03', 'PLAZUELA_BENCH_01'], state: 'SIT' },
      { from: 13, to: 19, spots: ['PARK_BENCH_01', 'PARK_BENCH_02'], state: 'REST' },
      { from: 19, to: 22.5, spots: ['PLAZUELA_BENCH_03', 'PLAZUELA_BENCH_01'], state: 'SIT' },
      { from: 22.5, to: 24, spots: ['PARK_BENCH_01', 'PARK_BENCH_02'], state: 'SLEEP' },
    ],
    shelter: ['STREET_METRO_PORTICO', 'STREET_BUS_SHELTER'],
    reserve: 0.35,
    voice: {
      refuse: ['Estaba a punto de dormirme.', ...SHARED_REFUSE],
      greet: ['Buenas.', 'Hola, hola.', '¿Qué tal?'],
      chat: [
        'Este banco es el mejor del parque. Da el sol hasta las cinco.',
        'Por la mañana pasan los barrenderos y saludan. Eso se agradece.',
        'Las palomas me conocen. Las de la plazuela, no tanto.',
        'Cuando llueve, el pórtico del metro. Si no molestas, nadie te dice nada.',
      ],
      ask: ['¿Tienes algo suelto? Aunque sea para un café.'],
      thanks: ['Gracias. De verdad.', 'Te lo agradezco mucho.'],
      known: ['Anda, otra vez por aquí.', 'Te vi el otro día, ¿no? Buenas.'],
    },
  },
  {
    // Pasa la noche en el soportal del banco (cierra pronto) y pide en la Calle Mayor a las horas de compra.
    id: 'carton-mayor',
    location: 'district',
    profiles: ['doorway', 'asker'],
    label: 'Alguien sentado en un cartón',
    belongings: ['cardboard', 'backpack', 'cup'],
    presence: 0.9,
    day: [
      { from: 0, to: 8, spots: ['STREET_BANK_DOORWAY'], state: 'SLEEP' },
      { from: 8, to: 9.5, spots: ['STREET_BANK_DOORWAY'], state: 'IDLE' },
      { from: 10, to: 14, spots: ['STREET_MAYOR_ASK'], state: 'ASK' },
      { from: 14, to: 17, spots: ['PLAZA_BENCH_03', 'PLAZA_BENCH_04'], state: 'REST' },
      { from: 17, to: 20.5, spots: ['STREET_MAYOR_ASK'], state: 'ASK' },
      { from: 21, to: 24, spots: ['STREET_BANK_DOORWAY'], state: 'SHELTER' },
    ],
    shelter: ['STREET_BANK_DOORWAY', 'STREET_BUS_SHELTER'],
    reserve: 0.25,
    voice: {
      refuse: ['Hoy no tengo el día.', ...SHARED_REFUSE],
      greet: ['Buenas tardes.', 'Hola.', 'Muy buenas.'],
      chat: [
        'La cajera de la tarde a veces me saca un bocadillo. Buena gente.',
        'Aquí la gente va con prisa. No pasa nada, yo también iba así.',
        'El soportal del banco es seco. Eso, en invierno, lo es todo.',
        'Llevo aquí desde la primavera. Se me hace largo y corto a la vez.',
      ],
      ask: ['¿Me puedes ayudar con algo? Lo que puedas.', 'Perdona, ¿tienes una moneda?'],
      thanks: ['Gracias, que tengas buen día.', 'Muchas gracias. Cuídate.'],
      known: ['¡Hola otra vez!', 'Ya te conozco. Buenas.'],
    },
  },
  {
    // Va de un sitio a otro con su carro: recoge, ordena, sigue. De noche no duerme en el barrio.
    id: 'carro',
    location: 'district',
    profiles: ['walker', 'cart'],
    label: 'Alguien empujando un carro',
    belongings: ['cart', 'bags'],
    presence: 0.8,
    day: [
      { from: 7, to: 9, spots: ['STREET_OLMO_CORNER'], state: 'IDLE' },
      { from: 9, to: 11, spots: ['STREET_PASAJE'], state: 'REST' },
      { from: 11, to: 13.5, spots: ['STREET_SOLAR'], state: 'SIT' },
      { from: 13.5, to: 16, spots: ['STREET_OLMO_CORNER'], state: 'IDLE' },
      { from: 16, to: 19, spots: ['STREET_PASAJE'], state: 'REST' },
      { from: 19, to: 22, spots: ['STREET_SOLAR'], state: 'IDLE' },
    ],
    shelter: ['STREET_PASAJE', 'STREET_BUS_SHELTER'],
    reserve: 0.6,
    voice: {
      refuse: ['Estoy liado.', 'Luego, luego.', ...SHARED_REFUSE],
      greet: ['¿Qué hay?', 'Buenas.'],
      chat: [
        'El carro lo arreglé yo. La rueda de atrás era de otro carro.',
        'Los martes sacan cartón en la calle del Carmen. Mucho cartón.',
        'Cada cosa tiene su sitio. Si no, se pierde.',
      ],
      ask: ['Si te sobra algo, bien. Si no, también.'],
      thanks: ['Gracias.', 'Eso ayuda, sí.'],
      known: ['Tú otra vez. Bien.'],
    },
  },
  {
    // Con su perro en la Plaza de la Fuente: el perro primero, siempre.
    id: 'perro-plaza',
    location: 'district',
    profiles: ['dog', 'sitter', 'asker'],
    label: 'Alguien con su perro',
    belongings: ['blanket', 'backpack', 'cup'],
    dog: 1,
    presence: 0.85,
    day: [
      { from: 9, to: 13, spots: ['STREET_PLAZA_SPOT'], state: 'ASK' },
      { from: 13, to: 16, spots: ['PLAZA_BENCH_04', 'PLAZA_BENCH_08'], state: 'REST' },
      { from: 16, to: 20.5, spots: ['STREET_PLAZA_SPOT'], state: 'SIT' },
    ],
    shelter: ['STREET_BUS_SHELTER', 'STREET_METRO_PORTICO'],
    reserve: 0.2,
    voice: {
      refuse: ['Ahora estoy con él, perdona.', ...SHARED_REFUSE],
      greet: ['¡Hola! Puedes acariciarlo, no muerde.', 'Buenas. Saluda, venga.', 'Hola.'],
      chat: [
        'Se llama Tango. Bueno, se lo puse yo. Él no ha opinado.',
        'Primero come él. Luego ya veremos.',
        'Con perro no te dejan entrar en casi ningún albergue. Así que aquí estamos los dos.',
        'La de la farmacia le guarda agua en un cuenco. Se ha hecho fan suyo.',
      ],
      ask: ['¿Algo para el pienso? Lo que sea.'],
      thanks: ['¡Gracias! Tango también te lo agradece.', 'Mil gracias.'],
      known: ['¡Mira quién viene, Tango!', 'Hola otra vez. Se acuerda de ti, mira.'],
    },
  },
  {
    // Se le ve a última hora en un banco de la plazuela, mirando pasar a la gente con los cascos puestos.
    id: 'cascos-plazuela',
    location: 'district',
    profiles: ['watcher', 'sitter'],
    label: 'Alguien con los cascos puestos',
    belongings: ['backpack', 'bags'],
    presence: 0.6,
    day: [
      { from: 18, to: 23.5, spots: ['PLAZUELA_BENCH_04', 'PLAZUELA_BENCH_02'], state: 'SIT' },
      { from: 23.5, to: 24, spots: ['STREET_METRO_PORTICO'], state: 'REST' },
      { from: 0, to: 6, spots: ['STREET_METRO_PORTICO'], state: 'SLEEP' },
    ],
    shelter: ['STREET_METRO_PORTICO'],
    reserve: 0.55,
    voice: {
      refuse: ['(Se señala los cascos y niega con la cabeza.)', ...SHARED_REFUSE],
      greet: ['¿Eh? Ah, hola.', 'Buenas noches.'],
      chat: [
        'La radio, a esta hora, pone cosas buenas. Nadie la escucha ya.',
        'Desde aquí se ve todo el que sale del metro. Cada uno con su historia.',
        'Trabajaba en un almacén. Cerró. Luego fue todo bastante rápido.',
      ],
      ask: ['Si te sobra algo, te lo agradezco.'],
      thanks: ['Gracias. En serio.'],
      known: ['Ah, eres tú. Buenas.'],
    },
  },
  {
    // A la salida del metro en hora punta: pide un rato y se va. No duerme en el barrio.
    id: 'salida-metro',
    location: 'district',
    profiles: ['asker', 'walker'],
    label: 'Alguien a la salida del metro',
    belongings: ['backpack', 'cup'],
    presence: 0.7,
    day: [
      { from: 7.5, to: 10, spots: ['STREET_METRO_EXIT'], state: 'ASK' },
      { from: 10, to: 12, spots: ['STREET_OLMO_CORNER'], state: 'IDLE' },
      { from: 17.5, to: 20, spots: ['STREET_METRO_EXIT'], state: 'ASK' },
    ],
    shelter: ['STREET_METRO_PORTICO'],
    reserve: 0.4,
    voice: {
      refuse: ['Voy tirando, perdona.', ...SHARED_REFUSE],
      greet: ['Buenos días.', 'Hola, buenas.'],
      chat: [
        'A esta hora sale todo el mundo del tren a la vez. Luego, nada.',
        'Estoy buscando trabajo. De lo que sea.',
        'Duermo en un sitio del ayuntamiento cuando hay plaza. Hoy había.',
      ],
      ask: ['¿Me ayudas con algo para el billete?', 'Perdona, ¿tienes algo suelto?'],
      thanks: ['Gracias, de verdad.', 'Muy amable.'],
      known: ['Hola de nuevo.', 'Buenas, ¿qué tal?'],
    },
  },
];
