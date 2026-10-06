/**
 * Los personajes con rutina (data/characters.ts) hablan con el mismo sistema que la gente de la calle
 * (systems/Chat.ts), pero con lo suyo encima: su manera de hablar, sus intereses y frases escritas para ellos,
 * que pesan mucho más que las genéricas y se abren con la relación (`r`: 1 les suena, 2 son amigos).
 * Las frases con `n` sólo las dice ese personaje; el resto del sistema es el de todos.
 */
import { lines as L, type Line, type Style } from './chat.ts';
import type { Interest } from './identity.ts';

export interface NamedVoice {
  /** Cómo habla: primero el estilo de siempre, y de ahí el tono de sus frases genéricas. */
  styles: readonly Style[];
  interests: readonly Interest[];
  /** Cómo le suena el jugador de entrada (0, no le conoce): se sube con lo que se han visto (EventMemory.importantNPCsMet). */
  patience: number;
}

export const NAMED_VOICES: Readonly<Record<string, NamedVoice>> = {
  // Sara Levane: estudia moda y hace contenido; rápida, expresiva y siempre con el móvil a mano.
  sara: { styles: ['energetic', 'talkative'], interests: ['fashion', 'photography', 'music', 'nightlife'], patience: 5 },
  // Ada: prepara oposiciones y juega al baloncesto los viernes; directa, seca, con humor de gimnasio.
  ada: { styles: ['direct', 'dry'], interests: ['fitness', 'reading', 'football'], patience: 4 },
};

export const NAMED_LINES: readonly Line[] = [
  // ------------------------------------------------------------------ Sara
  ...L('greeting', { n: 'sara' }, '¡Hola! Espera, no te muevas, que esta luz es buenísima.', 'Ey, ¡justo a tiempo! Necesito una opinión.', '¡Hola, hola! Estaba grabando, pero tú eres más importante.', 'Mira, otra cara amiga. ¿Qué tal tu día?'),
  ...L('greeting', { n: 'sara', r: 1 }, '¡Eh, tú! Qué bien verte. Cuéntame todo.', '¡Mira quién es! Vengo de mil sitios, pero para ti saco tiempo.', 'Ya estabas tardando en aparecer, ¿eh?'),
  ...L('greeting', { n: 'sara', r: 2, nf: ['sara_conflict'] }, 'Mi persona favorita del barrio. ¿Qué tienes para mí?', '¡Por fin! Necesito que me digas qué te parece lo nuevo.', 'No te lo vas a creer lo que me ha pasado hoy. Ven aquí.'),
  ...L('greeting', { n: 'sara', h: [20.5, 6] }, 'Buenas noches... ¿vienes al plan o nos escapamos antes?', 'Ey, ¡qué buena hora! La noche ya empieza para mí.'),
  ...L('smalltalk', { n: 'sara' }, 'Súper liada: clase, el contenido y un trabajo de patronaje que me está matando.', 'Entre los diseños y las ideas de los vídeos, mi cabeza no para.', 'Bien, pero con mil pestañas abiertas en la cabeza.', 'Genial, con la energía justa para seguir otra hora.'),
  ...L('doing', { n: 'sara', h: [8, 15] }, 'Voy a clase, o a mirar telas, o a grabar algo. Según cómo me levante.', 'Estoy con un trabajo de diseño. Lo mío es dibujar y tener ideas raras.'),
  ...L('doing', { n: 'sara', h: [15, 21] }, 'Buscando fondos para el siguiente vídeo, y luego un café con alguien.', 'Tengo que sacar fotos antes de que se vaya la luz de la tarde.'),
  ...L('doing', { n: 'sara', h: [21, 6] }, 'Preparando el outfit y la historia de esta noche. Es un trabajo serio.', 'Salgo con mi gente. Alguien tiene que representar el barrio.'),
  ...L('fashion', { n: 'sara' }, 'Hoy llevo la chaqueta de segunda mano de la Calle del Carmen. Una joya, y barata.', 'Estoy con un proyecto de reutilizar prendas viejas. Es lo que más me engancha.', 'Lo que más me gusta es mezclar lo de mi abuela con lo que hay hoy. Funciona siempre.', 'Un buen abrigo es un personaje. Pero tiene que contarte algo.'),
  ...L('fashion', { n: 'sara', r: 1 }, 'Oye, si pasas por la Calle del Carmen, mira la tienda de segunda mano. Tengo un ojo puesto en una chaqueta.', 'Cuando termine el proyecto, te enseño los diseños. Antes me da vergüenza.'),
  ...L('music', { n: 'sara' }, 'Hago los vídeos con una lista que cambia cada semana. Hoy toca algo nuevo.', 'La música es la mitad de un buen outfit, no me lo discutas.'),
  ...L('nightlife', { n: 'sara' }, '¡Vamosss, que hay plan! Esta noche salimos si todo va bien.', 'El viernes se sale. No hay discusión posible.'),
  ...L('plans', { n: 'sara', d: 'weekday' }, 'Estoy en lo de siempre: clase, contenido, y un par de ideas que me quitan el sueño.', 'Tengo que terminar una cosa para el jueves y todavía ni la he empezado.'),
  ...L('plans', { n: 'sara', d: 'friday' }, 'El viernes es el día de la noche. Me arreglo, voy a cenar y luego a donde sea.', 'Esta noche hay plan con los de siempre. Si te animas, apúntate.'),
  ...L('tired', { n: 'sara', m: ['tired'] }, 'Anoche edité hasta tarde. La edición es un pozo sin fondo.', 'Me duele hasta el pelo. Entre clases y vídeos, el cuerpo me pasa factura.'),
  ...L('positive', { n: 'sara', m: ['good'] }, 'Hoy ha ido genial: el vídeo ha subido y a la gente le ha gustado. Estoy flotando.', 'Me han escrito de una tienda para colaborar. ¡No me lo creo!'),
  ...L('joke', { n: 'sara' }, 'Dicen que no se puede vivir de la moda. Yo vivo de ella a medias, de las ideas y de los cafés.', 'Mi cuenta bancaria y yo tenemos una relación abierta. Ella entra y sale.'),
  ...L('friendly', { n: 'sara', r: 1, nf: ['sara_conflict'] }, 'Me caes bien, ¿sabes? Eres de las pocas personas que me escuchan de verdad.', 'Cuando quieras te enseño el taller, que a mí me gusta enseñarlo.'),
  ...L('friendly', { n: 'sara', r: 2, nf: ['sara_conflict'] }, 'En serio, gracias por pasarte siempre. A veces necesito justo esto: hablar con alguien sin pose.', 'Si algún día quieres salir de cualquier cosa, me dices. Yo me apunto a casi todo.'),
  ...L('compliment-back', { n: 'sara' }, '¡Ay, para! ¡Que me pongo roja y me estropeo el maquillaje!', 'Gracias, lo apunto para la próxima historia. Es broma. Gracias de verdad.'),
  ...L('joke-back', { n: 'sara' }, 'Jajaja, ¡qué malo! Pero te lo perdono porque me ha hecho gracia.', 'Eso va a la lista de cosas que repetiré sin darte crédito.'),
  ...L('bye-short', { n: 'sara', end: true }, '¡Ciao! Que me voy a seguir creando cosas.', 'Un besi, que me llama la luz. ¡Hasta luego!', '¡Nos vemos, que se me va el plan!'),
  ...L('bye-long', { n: 'sara', end: true, r: 1, nf: ['sara_conflict'] }, 'Ha sido genial verte. Si ves algo bonito por la Calle del Carmen, me lo cuentas, ¿vale?', 'Me voy a grabar antes de que se vaya la luz. Pero escríbeme, o aparece, que me encanta.'),

  // Lo que sólo dice según lo vivido (systems/Story, data/saraStory.ts): `f` exige esas flags, `nf` las prohíbe.
  ...L('greeting', { n: 'sara', f: ['sara_friend'], nf: ['sara_conflict'] }, '¡Mi gente del barrio! ¿Qué me cuentas?', 'Ey, justo tú. Tenía ganas de verte.'),
  ...L('greeting', { n: 'sara', f: ['sara_conflict'] }, 'Hola. ¿Qué querías?', 'Ah. Hola.'),
  ...L('smalltalk', { n: 'sara', f: ['sara_conflict'] }, 'Bien. Liada. Lo normal.', 'Pues aquí. No tengo mucho que contar hoy.'),
  ...L('bye-short', { n: 'sara', end: true, f: ['sara_conflict'] }, 'Venga. Adiós.', 'Me voy, que tengo cosas.'),
  ...L('friendly', { n: 'sara', f: ['sara_reconciled'], nf: ['sara_conflict'] }, 'Me gusta que podamos hablar las cosas. No todo el mundo sabe.', 'Lo del otro día ya está olvidado, ¿eh? Que no se te quede ahí.'),
  ...L('plans', { n: 'sara', f: ['sara_event_01'], nf: ['sara_conflict'] }, 'Cuando quieras repetimos lo del otro día. Me lo pasé genial.', 'Tengo que proponerte otro plan. Déjame pensar uno bueno.'),
  ...L('smalltalk', { n: 'sara', f: ['sara_event_02'] }, 'Sigo con los diseños que te enseñé. La tercera chaqueta ya casi está.', 'Le he cambiado el cuello a la chaqueta que viste. Mejor, ¿verdad? Bueno, no la has visto. Te la enseño.'),
  ...L('fashion', { n: 'sara', f: ['sara_tattoo'] }, 'La golondrina ya está curada. Lía dice que es de las mejores que ha hecho.', 'Ahora todo lo combino con la muñeca. Es un problema. Un problema bonito.'),
  ...L('fashion', { n: 'sara', f: ['sara_event_02'] }, 'Lo de reutilizar las chaquetas de mi abuela va en serio: quiero presentarlo en la facultad.'),
  ...L('friendly', { n: 'sara', f: ['sara_close_friend'], nf: ['sara_conflict'] }, 'Eres de las pocas personas con las que no tengo que hacer de Sara la de los vídeos.', 'A veces pienso que el barrio sin ti sería más aburrido. No se lo digas a nadie.'),
  // Según dónde y qué está haciendo, y cómo está.
  ...L('doing', { n: 'sara', p: ['gym'] }, 'Aquí, sufriendo. Hablamos, pero no me mires la cara.', 'Cardio. Lo odio. Lo necesito. Las dos cosas.'),
  ...L('doing', { n: 'sara', p: ['nightlife'] }, 'Aquí se viene a bailar, no a hablar. ¡Pero cuéntame!', 'Estoy buscando a Ada. Siempre se pierde cerca de la barra.'),
  ...L('doing', { n: 'sara', p: ['shop'] }, 'Mirando cosas para el proyecto. Bueno, y para mí. Sobre todo para mí.'),
  ...L('doing', { n: 'sara', p: ['park', 'plaza'] }, 'Nada. Estoy aquí sin hacer nada y me sienta de maravilla.', 'Mirando la luz para el próximo vídeo. Y a la gente. Sobre todo a la gente.'),
  ...L('smalltalk', { n: 'sara', m: ['down'] }, 'Hoy no tengo el día. No es por ti, ¿eh?', 'Estoy un poco de bajón. Se me pasará con un café. O con dos.'),
  ...L('weather', { n: 'sara', w: ['rain'] }, 'Con esta lluvia no hay quien grabe nada fuera. Me tiene de mal humor.', 'Me encanta la lluvia, pero en la ventana, no en el pelo.'),

  // ------------------------------------------------------------------ Ada
  ...L('greeting', { n: 'ada' }, 'Dime. Pero rápido, que tengo temario.', 'Hola. Si es para preguntar, sé muchas cosas. Y las que no, las estudio.', 'Buenas. Ando liada, pero te escucho.', 'Hola. ¿Todo bien? Me ha parecido verte con cara de duda.'),
  ...L('greeting', { n: 'ada', r: 1 }, 'Hombre, tú. Ya era hora, que me aburría de estudiar sola.', 'Ey. ¿Qué tal? Dime que traes café.'),
  ...L('greeting', { n: 'ada', r: 2 }, 'Qué bien que vengas. Necesito que me saques de la cabeza este tema, por favor.', 'Buenas, amigo. Cuéntame algo que no sea derecho administrativo.'),
  ...L('smalltalk', { n: 'ada' }, 'Pues aquí, entre libros y partidos. Una vida muy emocionante.', 'Estudiando. Es mi deporte nacional últimamente.', 'Cansada, pero con las ideas más claras que ayer, que ya es algo.'),
  ...L('doing', { n: 'ada', h: [8, 20] }, 'Voy al centro de estudios o vengo. Mi vida es un ir y venir de apuntes.', 'Preparo unas oposiciones. Es una carrera larga y ya llevo un buen trecho.'),
  ...L('doing', { n: 'ada', h: [20, 24], d: 'friday' }, 'Voy a jugar al baloncesto. El viernes es sagrado.', 'Hoy toca cancha. Es lo único que me saca de los libros.'),
  ...L('work', { n: 'ada' }, 'Preparo oposiciones. Siete horas de estudio al día, tres cafés y mucha fe.', 'Quiero sacar la plaza y luego ya veremos. Hay que ir por partes.', 'El temario es enorme. Pero estudiar a trozos lo hace soportable.'),
  ...L('sports', { n: 'ada' }, 'El baloncesto es mi forma de no volverme loca. Los viernes juego con unas amigas y se me pasa todo.', 'Mi técnica de tiro es regular, pero pongo mucho entusiasmo.', 'Si juegas, avísame. Siempre falta gente para el cinco contra cinco.'),
  ...L('fitness', { n: 'ada' }, 'Entreno para aguantar sentada ocho horas. Parece una broma, pero es muy serio.', 'Sin deporte, estudiar es imposible. El cuerpo manda.'),
  ...L('tired', { n: 'ada', m: ['tired'] }, 'Ayer me quedé dormida encima del temario. Los apuntes me dejaron marcado el moflete.', 'Estoy a un tema de rendirme y a dos de volver. Es muy normal.'),
  ...L('positive', { n: 'ada', m: ['good'] }, 'Hoy he repasado dos temas y me los sé de memoria. Me siento invencible.', 'Hoy ha salido bien el simulacro. No lo gafes, ¿eh?'),
  ...L('joke', { n: 'ada' }, 'Dicen que las oposiciones son una maratón. Yo creo que son un triatlón sin agua.', 'Mi vida social es el grupo de estudio y las pizzas que pedimos para no estudiar.'),
  ...L('friendly', { n: 'ada', r: 1 }, 'Eres de los pocos que no me preguntan «¿y cuándo es el examen?». Te lo agradezco.', 'Gracias por no agobiarme. Tengo suficiente con mis propias dudas.'),
  ...L('friendly', { n: 'ada', r: 2 }, 'Cuando apruebe, te invito a lo que quieras. Te lo debo por aguantarme tanto.', 'Con gente como tú, el camino se hace más ligero. En serio.'),
  ...L('compliment-back', { n: 'ada' }, 'Hm. Gracias. No estoy acostumbrada, pero se agradece.', 'Anda, qué amable. Voy a apuntarlo en el cuaderno de cosas buenas.'),
  ...L('joke-back', { n: 'ada' }, 'Ja. Buena. Voy a usarla en el grupo de estudio.', 'Casi me río. Pero tengo cara de estudiar y me da pereza reírme.'),
  ...L('bye-short', { n: 'ada', end: true }, 'Venga, vuelvo a los libros.', 'Me voy a seguir sufriendo con el temario. Un abrazo.', 'Hasta luego. Si apruebo, te lo cuento.'),
  ...L('bye-long', { n: 'ada', end: true, r: 1 }, 'Gracias por el rato. Me ha venido bien. Cuando acabe de verdad, hacemos algo como Dios manda.', 'Me voy, que si no, no estudio nada. Pero aparece cuando quieras, ¿eh?'),
];
