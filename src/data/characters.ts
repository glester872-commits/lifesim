/**
 * Personajes con nombre que viven en el barrio: van de un sitio a otro según
 * la hora. Cada parada es una hora de llegada y un punto con nombre; el camino
 * y la hora de salida los calcula systems/Characters.ts con worldRoute(). Parar
 * en la entrada de un edificio (un 'entrance') es estar dentro, sin verse: en
 * casa, en la academia o en METRO_ENTRANCE, que es irse a otra parte de la ciudad.
 *
 * Cada personaje tiene varias rutinas y cada día le toca una, según el día de
 * la semana y una tirada con semilla (systems/Characters.ts): el mismo día es
 * siempre el mismo día, pero no todos los martes son iguales. El día empieza a
 * las 06:00 y todas las rutinas duermen en casa a esa hora, así que se
 * encadenan sin saltos. Una salida de madrugada es de la noche anterior.
 *
 * Aspecto y nombre, en data/npcs.ts por su id.
 */

export interface Stop {
  /** Hora de llegada, HH:MM. Sale con tiempo para llegar a su hora. */
  at: string;
  point: string;
  /** Lo que dice mientras está allí. */
  lines: readonly string[];
  /** Lo que dice si la paras de camino hacia aquí. */
  going: readonly string[];
}

export interface Routine {
  id: string;
  /** Días en que puede tocar: 0 lunes … 6 domingo. */
  days: readonly number[];
  /** Peso frente a las otras rutinas sueltas del mismo día. */
  weight: number;
  /**
   * Plan con otros personajes (OUTINGS): si sale ese día, todos los que lo
   * tienen lo hacen juntos. Si no sale, cada uno tira entre sus rutinas sueltas.
   */
  outing?: string;
  /** En orden de hora desde las 06:00; la última vuelve a casa antes de las 06:00. */
  stops: readonly Stop[];
}

export interface CharacterDef {
  npc: string;
  /** Tiles por minuto de juego. El jugador va a ~2,4. */
  speed: number;
  /** Su portal: ahí empieza y acaba cada día. */
  home: string;
  routines: readonly Routine[];
}

/** Planes compartidos y la probabilidad de que salgan cada día que pueden salir. */
export const OUTINGS: Readonly<Record<string, number>> = {
  'noche-viernes': 0.65,
};

/** Parada sin nada que decir: dentro de un portal, que no se ve. */
const inside = (at: string, point: string, ...going: string[]): Stop => ({ at, point, lines: [], going });

const SARA_HOME = 'RES_MAYOR_3_ENTRANCE';
const ADA_HOME = 'RES_OLMO_3_ENTRANCE';

export const CHARACTERS: readonly CharacterDef[] = [
  {
    // Sara Levane, 24: estudia moda y hace contenido. Hoja de diseño en design/characters/sara/.
    npc: 'sara',
    speed: 1.9,
    home: SARA_HOME,
    routines: [
      {
        id: 'clase-online',
        days: [0, 2],
        weight: 3,
        stops: [
          { at: '09:40', point: 'CAFE_TABLE_05', lines: ['¡Hola! ¿Qué haces por aquí?', 'Sin café no soy persona. Literal.'], going: ['Voy a por un café, que hoy no me despierto.', '¿Te vienes?'] },
          { at: '11:00', point: 'CLOTHING_STORE_RACK_03', lines: ['Tengo que pasar por la tienda...', '¿Me ayudas a ver unos outfits?'], going: ['Voy a Hilo, han sacado cosas nuevas.'] },
          { at: '12:10', point: 'CLOTHING_STORE_MIRROR', lines: ['¿Este o el negro? No me digas «los dos».'], going: ['Espera, que me lo pruebo.'] },
          { at: '13:30', point: 'RESTAURANT_TABLE_04', lines: ['El menú de Tomás no falla.', 'Vamos a tomar algo luego, ¿no?'], going: ['Me muero de hambre, voy a comer.'] },
          inside('15:10', SARA_HOME, 'Me voy a casa, que tengo clase online.', 'Luego te escribo.'),
          { at: '18:00', point: 'GYM_TREADMILL_02', lines: ['Una más y me voy. Bueno, dos.', 'Mañana gym, ¿vienes?'], going: ['Voy al gym, hoy toca piernas.'] },
          { at: '19:10', point: 'GYM_MAT_02', lines: ['Estiro y me voy. Estoy muerta.'], going: ['Un poco de estiramientos y ya.'] },
          { at: '20:15', point: 'PLAZA_BENCH_03', lines: ['Me encanta esta plaza a esta hora.', 'Me muero, este sitio es brutal.'], going: ['Voy a dar una vuelta por la plaza.'] },
          { at: '21:00', point: 'CAFE_TERRACE_01', lines: ['¡Vamosss, que hay plan!', 'Te paso el plan por el grupo.'], going: ['He quedado en la terraza del Pausa.'] },
          { at: '22:10', point: 'RESTAURANT_TABLE_09', lines: ['Estoy súper cansada, pero vale la pena.'], going: ['Vamos a cenar a Casa Tomás, ¿te apuntas?'] },
          inside('23:50', SARA_HOME, 'Me voy a dormir, que mañana madrugo. Más o menos.'),
        ],
      },
      {
        // Días de facultad: sale en metro por la mañana y vuelve a comer tarde.
        id: 'facultad',
        days: [1, 3],
        weight: 3,
        stops: [
          inside('08:50', 'METRO_ENTRANCE', 'Voy tardísimo a clase, ¡luego hablamos!'),
          { at: '14:40', point: 'RESTAURANT_TABLE_04', lines: ['Vengo muerta de la facultad. Necesito comer ya.'], going: ['Acabo de salir de clase, ¡me muero de hambre!'] },
          { at: '15:50', point: 'SUPERMARKET_AISLE_03', lines: ['Lista de la compra: café, café y... café.'], going: ['Paso por el súper antes de subir a casa.'] },
          inside('16:40', SARA_HOME, 'Me subo, que tengo que editar un vídeo.'),
          { at: '19:00', point: 'GYM_BENCH_02', lines: ['Hoy toca brazos. Mañana no me los siento.'], going: ['Me voy al gym, que si no, no voy.'] },
          inside('20:20', SARA_HOME, 'Ducha y cena. Qué planazo.'),
          { at: '21:30', point: 'PLAZA_BENCH_03', lines: ['Salgo a que me dé el aire. Hoy ha sido largo.'], going: ['Doy una vuelta antes de dormir.'] },
          inside('22:30', SARA_HOME, 'Me voy ya, que mañana hay clase.'),
        ],
      },
      {
        // Día sin clase: recados por el barrio y tarde en el centro.
        id: 'recados',
        days: [2, 3],
        weight: 1,
        stops: [
          { at: '10:40', point: 'CAFE_WINDOW_SEAT', lines: ['Hoy no tengo clase. Día de recados.'], going: ['Café primero, recados después.'] },
          { at: '11:30', point: 'CLOTHING_STORE_RACK_05', lines: ['Sólo miro. Te lo prometo.'], going: ['Voy a Hilo un segundo.'] },
          { at: '12:30', point: 'CLOTHING_STORE_FITTING_01', lines: ['¿Tú crees que esto se lleva? Yo creo que sí.'], going: ['Me lo pruebo y ya.'] },
          inside('13:30', SARA_HOME, 'Me voy a comer a casa.'),
          inside('17:30', 'METRO_ENTRANCE', 'Me voy al centro, he quedado con las de clase.'),
          inside('21:30', SARA_HOME, 'Vuelvo a casa, que ya he tenido suficiente ciudad por hoy.'),
        ],
      },
      {
        // El jueves la sala abre floja: una copa y a casa pronto.
        id: 'jueves-orbita',
        days: [3],
        weight: 1,
        stops: [
          inside('08:50', 'METRO_ENTRANCE', 'Voy tardísimo a clase, ¡luego hablamos!'),
          inside('15:30', SARA_HOME, 'Siesta estratégica. Esta noche salgo un rato.'),
          { at: '19:00', point: 'GYM_TREADMILL_01', lines: ['Cardio antes de salir. Es de sentido común.'], going: ['Gym rápido y luego me arreglo.'] },
          inside('20:10', SARA_HOME, 'A arreglarme.'),
          { at: '23:30', point: 'CLUB_BAR_01', lines: ['Los jueves esto está vacío, pero la música es mejor.', 'Una y me voy. En serio.'], going: ['Me paso por Órbita un rato.'] },
          { at: '00:20', point: 'CLUB_DANCE_05', lines: ['¡Esta me la sé!'], going: ['¡Vamos a la pista!'] },
          inside('01:30', SARA_HOME, 'Me voy, que mañana tengo clase. De verdad.'),
        ],
      },
      {
        id: 'viernes-tranquilo',
        days: [4],
        weight: 2,
        stops: [
          { at: '10:00', point: 'CAFE_TABLE_05', lines: ['Viernes. Por fin.'], going: ['Café de viernes, que me lo he ganado.'] },
          inside('11:30', SARA_HOME, 'Tengo clase online. Hasta luego.'),
          { at: '17:00', point: 'CLOTHING_STORE_MIRROR', lines: ['Me pruebo esto y me voy, que estoy cansada.'], going: ['Paso por Hilo un momento.'] },
          { at: '18:30', point: 'GYM_TREADMILL_02', lines: ['Hoy me quedo en casa. Primero, gym.'], going: ['Voy al gym y luego sofá.'] },
          inside('20:00', SARA_HOME, 'Hoy me quedo en casa, que estoy reventada.'),
          { at: '21:30', point: 'RESTAURANT_TABLE_09', lines: ['Cena tranquila. El viernes también es para descansar.'], going: ['Bajo a cenar algo rápido.'] },
          inside('23:20', SARA_HOME, 'A la cama. Mañana sí salgo.'),
        ],
      },
      {
        // Con Ada: cena en Casa Tomás y noche en la Sala Órbita.
        id: 'noche-viernes',
        days: [4],
        weight: 1,
        outing: 'noche-viernes',
        stops: [
          { at: '10:00', point: 'CAFE_TABLE_05', lines: ['Hoy salimos. No acepto un no.'], going: ['Café, que esta noche hay fiesta.'] },
          inside('11:30', SARA_HOME, 'Tengo clase online. Hasta luego.'),
          { at: '17:00', point: 'CLOTHING_STORE_MIRROR', lines: ['Busco algo para esta noche. ¿Qué te parece?'], going: ['Necesito algo nuevo para esta noche.'] },
          inside('18:40', SARA_HOME, 'Me voy a arreglar, que tardo.'),
          { at: '21:30', point: 'RESTAURANT_TABLE_04', lines: ['Cena con Ada y luego... ¡a Órbita!', '¿Te vienes? Dile que sí.'], going: ['He quedado con Ada para cenar.'] },
          { at: '23:40', point: 'CLUB_BAR_02', lines: ['La primera la pago yo. La segunda, ya veremos.'], going: ['¡Nos vamos a Órbita!'] },
          { at: '00:30', point: 'CLUB_DANCE_06', lines: ['¡¡Esta canción!!', 'Ada baila fatal. Pero con ganas.'], going: ['¡A la pista!'] },
          { at: '02:30', point: 'CLUB_SEAT_01', lines: ['Descanso cinco minutos y vuelvo.'], going: ['Me siento un momento, que me muero.'] },
          { at: '03:00', point: 'CLUB_DANCE_06', lines: ['Una más. La última. Mentira.'], going: ['¡Vuelvo a la pista!'] },
          inside('04:40', SARA_HOME, 'Me voy a casa, que ya no siento los pies.'),
        ],
      },
      {
        id: 'sabado-fiesta',
        days: [5],
        weight: 2,
        stops: [
          { at: '11:30', point: 'CAFE_TABLE_05', lines: ['Brunch de sábado. Es sagrado.'], going: ['Voy a desayunar. A las once y media, sí.'] },
          { at: '12:40', point: 'CLOTHING_STORE_RACK_03', lines: ['El sábado se compra. Es la ley.'], going: ['Paso por Hilo, que hoy hay rebajas.'] },
          { at: '13:40', point: 'CLOTHING_STORE_MIRROR', lines: ['¿Este o el negro? No me digas «los dos».'], going: ['Espera, que me lo pruebo.'] },
          { at: '15:00', point: 'RESTAURANT_TABLE_04', lines: ['Comida larga de sábado.'], going: ['Me muero de hambre.'] },
          { at: '17:00', point: 'PARK_BENCH_01', lines: ['Un poco de sol antes de esta noche.'], going: ['Me voy al parque a no hacer nada.'] },
          inside('18:30', SARA_HOME, 'A casa, que esta noche salgo.'),
          { at: '23:50', point: 'CLUB_BAR_03', lines: ['El sábado esto se llena. Me encanta.'], going: ['¡Me voy a Órbita!'] },
          { at: '00:40', point: 'CLUB_DANCE_05', lines: ['¡Vamosss!'], going: ['¡A bailar!'] },
          { at: '02:10', point: 'CLUB_STAND_01', lines: ['Aquí fuera de la pista se oye algo. Algo.'], going: ['Un respiro.'] },
          { at: '02:40', point: 'CLUB_DANCE_05', lines: ['Hasta que cierren.'], going: ['¡Otra!'] },
          inside('04:20', SARA_HOME, 'Me retiro. Ha estado brutal.'),
        ],
      },
      {
        // Día de Carmen (miércoles sin clase o sábado): brunch en el Molinillo, Retales, Archivo y el flash del estudio.
        id: 'sabado-carmen',
        days: [2, 5],
        weight: 1,
        stops: [
          { at: '11:30', point: 'MOLINILLO_TERRACE_01', lines: ['Brunch en el Molinillo. El café de aquí es otra liga.'], going: ['Voy al Carmen, que hoy hay que mirar tiendas.'] },
          { at: '12:40', point: 'RETALES_RACK_02', lines: ['Gus guarda lo mejor para los sábados.', 'Esta chaqueta es de los setenta. Mírala.'], going: ['Paso por Retales antes de que lo compre otra.'] },
          { at: '13:30', point: 'RETALES_MIRROR', lines: ['¿Este o el negro? No me digas «los dos».'], going: ['Me lo pruebo, dame un segundo.'] },
          // Del Carmen a casa se cruza la avenida: margen para esperar el verde.
          inside('15:10', SARA_HOME, 'Me voy a comer, que luego vuelvo.'),
          { at: '17:10', point: 'ARCHIVO_WALL_01', lines: ['Estas zapatillas valen más que mi alquiler.', 'Sólo miro. Para el vídeo.'], going: ['Voy a Archivo, que han sacado algo.'] },
          { at: '18:00', point: 'TINTA_FLASH_01', lines: ['Me estoy pensando una golondrina. En la muñeca.', 'Lía dice que me lo piense un mes. Llevo tres.'], going: ['Paso por Tinta a mirar diseños.'] },
          inside('19:20', SARA_HOME, 'A casa, que esta noche edito.'),
        ],
      },
      {
        id: 'sabado-en-casa',
        days: [5],
        weight: 1,
        stops: [
          { at: '12:00', point: 'PARK_BENCH_01', lines: ['Hoy no salgo. Plan de sofá.'], going: ['Paseo corto y a casa.'] },
          { at: '13:20', point: 'SUPERMARKET_FRIDGES', lines: ['Helado. Para el plan de sofá.'], going: ['Voy a por provisiones.'] },
          inside('14:20', SARA_HOME, 'Maratón de series. No me llames.'),
          { at: '20:30', point: 'CAFE_TERRACE_01', lines: ['Sólo un café. Luego, a casa.'], going: ['Bajo un momento a la terraza.'] },
          inside('21:40', SARA_HOME, 'Me subo, que empieza el capítulo.'),
        ],
      },
      {
        id: 'domingo',
        days: [6],
        weight: 2,
        stops: [
          { at: '12:30', point: 'CAFE_TABLE_05', lines: ['Domingo de pijama... bueno, casi.'], going: ['Café y vuelvo a casa.'] },
          inside('13:40', SARA_HOME, 'A casa, que hoy no hago nada.'),
          { at: '18:30', point: 'PLAZA_BENCH_03', lines: ['El domingo por la tarde la plaza está en calma.'], going: ['Salgo un rato a la plaza.'] },
          inside('19:40', SARA_HOME, 'Mañana otra vez lunes...'),
        ],
      },
      {
        // Hay días que no se sale de casa.
        id: 'domingo-en-casa',
        days: [6],
        weight: 1,
        stops: [inside('06:00', SARA_HOME)],
      },
    ],
  },
  {
    // Ada, 21: prepara oposiciones en el centro de estudios y juega al baloncesto los viernes.
    npc: 'ada',
    speed: 1.8,
    home: ADA_HOME,
    routines: [
      {
        id: 'academia',
        days: [0, 1, 2, 3],
        weight: 3,
        stops: [
          inside('08:40', 'STUDY_CENTER_ENTRANCE', 'Llego tarde a la academia. Otra vez.'),
          { at: '13:30', point: 'CAFE_TABLE_01', lines: ['Aquí se estudia mejor que en la academia. Hay café.'], going: ['Pausa para comer algo.'] },
          inside('14:40', 'STUDY_CENTER_ENTRANCE', 'Vuelta a los apuntes.'),
          {
            at: '19:00',
            point: 'PLAZA_BENCH_02',
            lines: ['El centro abre a las ocho y cierra cuando les apetece.', 'Aquí todo el mundo quiere aprenderlo todo a la vez.', 'Y así acaban: sabiendo un poco de nada.'],
            going: ['Necesito despejarme un rato.'],
          },
          inside('20:10', ADA_HOME, 'A casa, a repasar.'),
        ],
      },
      {
        id: 'practicas',
        days: [1, 3],
        weight: 2,
        stops: [
          inside('09:00', 'METRO_ENTRANCE', 'Hoy tengo prácticas en el centro.'),
          { at: '18:00', point: 'SUPERMARKET_PRODUCE', lines: ['¿Tú sabes elegir aguacates? Yo tampoco.'], going: ['Paso por el súper, que no tengo nada en la nevera.'] },
          // Del súper a casa se cruza la avenida: el semáforo también cuenta (media hora de rojo, a lo sumo).
          inside('19:15', ADA_HOME, 'A dejar la compra.'),
          { at: '20:30', point: 'CAFE_TERRACE_02', lines: ['Una caña y a casa, que mañana madrugo.'], going: ['Bajo a la terraza un rato.'] },
          inside('21:40', ADA_HOME, 'Me voy, que mañana hay academia.'),
        ],
      },
      {
        id: 'viernes-baloncesto',
        days: [4],
        weight: 1,
        stops: [
          inside('08:40', 'STUDY_CENTER_ENTRANCE', 'Último día de la semana. Aguanta.'),
          inside('14:30', ADA_HOME, 'Hoy salgo pronto. Es viernes.'),
          { at: '19:00', point: 'PARK_COURT', lines: ['Partidillo de los viernes. ¿Juegas?'], going: ['Voy a la pista, que hay partido.'] },
          inside('20:30', ADA_HOME, 'Hoy no salgo. Sara me va a matar.'),
        ],
      },
      {
        // Con Sara: cena en Casa Tomás y Órbita; se retira antes.
        id: 'noche-viernes',
        days: [4],
        weight: 1,
        outing: 'noche-viernes',
        stops: [
          inside('08:40', 'STUDY_CENTER_ENTRANCE', 'Último día de la semana. Aguanta.'),
          inside('14:30', ADA_HOME, 'Hoy salgo pronto. Es viernes.'),
          { at: '21:30', point: 'RESTAURANT_TABLE_12', lines: ['Sara dice que hoy pincha alguien bueno. Sara dice eso siempre.'], going: ['He quedado con Sara para cenar.'] },
          { at: '23:40', point: 'CLUB_BAR_03', lines: ['Yo, agua. Bueno, una.'], going: ['Vamos a Órbita. Me ha convencido.'] },
          { at: '00:30', point: 'CLUB_DANCE_10', lines: ['No sé bailar esto. Nadie sabe bailar esto.'], going: ['Vale, vale, a la pista.'] },
          { at: '02:30', point: 'CLUB_SEAT_02', lines: ['Me duelen los pies. ¿Tú cómo aguantas?'], going: ['Me siento un rato.'] },
          inside('03:40', ADA_HOME, 'Yo me retiro. Sara, ¡no te quedes hasta el cierre!'),
        ],
      },
      {
        id: 'finde-parque',
        days: [5, 6],
        weight: 2,
        stops: [
          { at: '10:30', point: 'PARK_BENCH_02', lines: ['Fin de semana de parque y libro.'], going: ['Me voy al parque a leer.'] },
          { at: '12:00', point: 'NEWS_KIOSK', lines: ['Busco una revista que ya no existe.'], going: ['Paso por el quiosco.'] },
          inside('13:00', ADA_HOME, 'A comer.'),
          { at: '18:00', point: 'CLOTHING_STORE_RACK_02', lines: ['Sara me ha mandado a por una chaqueta. Para mí, dice.'], going: ['Voy a Hilo, que me lo ha pedido Sara.'] },
          inside('19:10', ADA_HOME, 'A casa. Mañana más.'),
        ],
      },
      {
        // Sábado de rebuscar: al peso en Segunda Vuelta, café en el Molinillo y un rato de libro en el banco.
        id: 'sabado-carmen',
        days: [5],
        weight: 1,
        stops: [
          { at: '10:40', point: 'VUELTA_BIN_01', lines: ['Al peso sale a nada. Hay que saber rebuscar.'], going: ['Voy a Segunda Vuelta, que los sábados reponen.'] },
          { at: '11:40', point: 'MOLINILLO_TABLE_01', lines: ['Aquí se estudia bien. Y el bizcocho es casero.'], going: ['Un café en el Molinillo.'] },
          inside('13:00', ADA_HOME, 'A comer.'),
          { at: '18:00', point: 'CARMEN_BENCH_02', lines: ['Aquí se lee bien. Pasa gente, pero nadie grita.'], going: ['Me bajo a leer al Carmen.'] },
          inside('19:20', ADA_HOME, 'A casa. Mañana más.'),
        ],
      },
      {
        id: 'finde-en-casa',
        days: [5, 6],
        weight: 1,
        stops: [inside('06:00', ADA_HOME)],
      },
    ],
  },
];
