/**
 * Frases de la gente de la calle para empezar y llevar una charla: saludos, y los temas de los que se habla
 * (el tiempo, el barrio, el trabajo, la comida...). Las etiquetas de cada grupo (data/chat.ts) dicen a quién
 * le valen; sin etiquetas, a cualquiera. `{hora}` y `{dia}` los pone systems/Chat.ts.
 * Pensado para crecer: más frases, no más lógica.
 */
import { lines as L, type Line } from './chat.ts';

export const CHAT_LINES: readonly Line[] = [
  // ------------------------------------------------------------------ saludos
  ...L('greeting', {}, 'Hola.', 'Buenas.', 'Ey, hola.', 'Dime.', '¿Sí?', 'Hola, ¿qué pasa?', 'Buenas, ¿qué tal?', 'Mira quién anda por aquí.', 'Hola, hola.'),
  ...L('greeting', { h: [6, 13] }, 'Buenos días.', 'Buenas, muy buenas.', 'Hola, buen día.', 'Buenos días, ¿qué tal la mañana?'),
  ...L('greeting', { h: [13, 20.5] }, 'Buenas tardes.', 'Hola, buenas tardes.', 'Buenas, ¿qué tal la tarde?'),
  ...L('greeting', { h: [20.5, 6] }, 'Buenas noches.', 'Hola, buenas noches.', 'Buenas, ¿tú también de noche?', 'Ey, qué hora de encontrarse.'),
  ...L('greeting', { s: ['friendly', 'energetic'] }, '¡Hola! ¿Cómo va todo?', '¡Ey! Qué alegría verte por aquí.', '¡Buenas! ¿Todo bien?', '¡Hola, hola! ¿Qué cuentas?'),
  ...L('greeting', { s: ['friendly', 'talkative'], r: 1 }, '¡Otra vez tú! Qué bien.', 'Anda, pero si eres tú. ¿Qué tal?', 'Hombre, otra vez por aquí.'),
  ...L('greeting', { s: ['shy', 'reserved'] }, 'Hola...', 'Ah, hola.', 'Eh... hola.', 'Hola. ¿Sí?', 'Mm, buenas.'),
  ...L('greeting', { s: ['dry', 'direct'] }, 'Hola. Dime.', 'Sí, ¿qué querías?', 'Buenas. ¿Pasa algo?', 'Hola. Te escucho.'),
  ...L('greeting', { s: ['sarcastic'] }, 'Vaya, una cara nueva.', 'Hombre, qué sorpresa.', 'Ah, conversación. Qué novedad.', 'Hola, hola. Tengo todo el día. Es mentira.'),
  ...L('greeting', { s: ['humorous'] }, 'Si vienes a vender algo, ya tengo de todo.', 'Hola. Si es una encuesta, estoy muy ocupado.', 'Buenas. Juro que no fui yo, fue el otro.', 'Mira, alguien que me habla. Un lujo.'),
  ...L('greeting', { s: ['calm'] }, 'Hola, tranquilo.', 'Buenas. Sin prisa.', 'Hola. Qué buen momento.'),
  ...L('greeting', { m: ['tired'] }, 'Hola... perdona, que estoy a medias.', 'Buenas. Dame un segundo, que aún no soy persona.', 'Ey... sí, dime.'),
  ...L('greeting', { m: ['hurried'] }, 'Hola, voy un poco justo.', 'Buenas, pero ando con prisa.', 'Hola, corto, ¿vale?'),
  ...L('greeting', { w: ['rain'] }, 'Buenas, con este tiempo ya es un detalle parar.', 'Hola, qué día para estar en la calle.'),
  ...L('greeting', { a: ['exercise'] }, 'Hola, que me enfrío.', 'Buenas, dame que recupere el aire.'),
  ...L('greeting', { a: ['nightout'], h: [20.5, 6] }, '¡Buenas! Aquí, calentando motores.', 'Ey, ¿tú también sales?'),
  ...L('greeting', { r: 1 }, 'Ya nos hemos visto antes, ¿no?', 'Hola de nuevo.', 'Hombre, otra vez.'),
  ...L('greeting', { r: 2 }, 'Ey, tú. Cuánto bueno.', '¡Mira quién es! Cuéntame.', 'Qué ganas de verte, en serio.'),

  // --------------------------------------------------------------- charla suelta
  ...L('smalltalk', {}, 'Aquí, tirando.', 'Pues nada, de paso.', 'Normal. Un día más.', 'Sin novedades, que ya es mucho.', 'Tirando, tirando.', 'Aquí andamos.', 'Ni fu ni fa.', 'No me quejo.'),
  ...L('smalltalk', { s: ['friendly', 'talkative'] }, 'Pues mira, no puedo quejarme. He dormido bien y todo.', 'La verdad es que bien. Hoy me ha salido todo un poco a la primera.', 'Bastante bien, la verdad. Parece que el día quiere ayudar.'),
  ...L('smalltalk', { s: ['dry', 'reserved'] }, 'Bien.', 'Como siempre.', 'Normal.', 'Sin más.'),
  ...L('smalltalk', { s: ['sarcastic'] }, 'De maravilla. No se nota, pero sí.', 'Fenomenal. Mira cómo salto de alegría.', 'Aquí, sobreviviendo con estilo.'),
  ...L('smalltalk', { s: ['humorous'] }, 'Bien, pero no se lo digas al resto, que se pone celoso.', 'Pues vivo, que ya es una buena noticia.', 'Yo, estupendamente. El mundo ya veremos.'),
  ...L('smalltalk', { s: ['calm'] }, 'Tranquilo. Disfrutando de no tener prisa.', 'Bien, sin más. Es una buena manera de estar.'),
  ...L('smalltalk', { s: ['shy'] }, 'Bien... gracias por preguntar.', 'Bien. ¿Y tú?', 'Pues... bien, supongo.'),
  ...L('smalltalk', { s: ['energetic'] }, '¡De lujo! Hoy con las pilas puestas.', 'Genial, no paro. Ya me conoces.'),
  ...L('smalltalk', { a: ['relax'] }, 'Aquí, sin hacer nada, que a veces hace falta.', 'Tomándome cinco minutos para mí.'),
  ...L('smalltalk', { a: ['walk'] }, 'Dando una vuelta, nada serio.', 'Paseando. Ya sabes, a ver qué me encuentro.'),
  ...L('smalltalk', { g: 'group' }, 'Aquí, con estos, que no me dejan en paz.', 'Pues de plan con los amigos, que se agradece.', 'Con compañía, que se nota.'),
  ...L('smalltalk', { r: 1 }, 'Igual que la última vez, pero con más café.', 'Pues todo sigue en su sitio, más o menos.'),

  // ----------------------------------------------------------------- el tiempo
  ...L('weather', { w: ['rain'] }, 'Menudo día de lluvia, ¿eh?', 'Con este chaparrón, hoy se agradece un portal.', 'Llevo el paraguas, pero me mojo igual.', 'Cuando llueve así, el barrio parece otro.', 'Esta lluvia no se acaba nunca.', 'Ya he pisado dos charcos y me quedan cuatro calles.'),
  ...L('weather', { w: ['rain'], s: ['sarcastic', 'dry'] }, 'Qué día tan espléndido para estar en la calle. Maravilloso.', 'Dicen que la lluvia es buena. Seguro que a alguien.'),
  ...L('weather', { w: ['rain'], s: ['humorous'] }, 'Si esto sigue así, me saco el carné de barco.', 'Ya no sé si camino o si nado.'),
  ...L('weather', { w: ['cold'] }, 'Hoy pela de frío.', 'Qué frío, por favor. No siento los dedos.', 'Con este frío, en cuanto puedo me meto en un bar.', 'Hay que echar más capas, que esto no es normal.', 'Madre mía, la helada de esta mañana.'),
  ...L('weather', { w: ['warm'] }, 'Qué calor, ¿no? Y todavía es temprano.', 'Con este calor, a la sombra y sin moverse.', 'Hoy se derrite hasta el asfalto.', 'Menos mal que corre algo de aire en la plaza.', 'Con este calor, solo me apetece algo frío.'),
  ...L('weather', { w: ['clear'] }, 'Qué buen día hace, ¿verdad?', 'Con este sol da gusto salir.', 'Mira qué cielo. Así sí.', 'Un día así no se desaprovecha.', 'Hoy se está de maravilla fuera.'),
  ...L('weather', { w: ['clear'], h: [18, 21.5] }, 'Qué luz tiene la tarde, parece de película.', 'A esta hora, con este cielo, el barrio gana.'),
  ...L('weather', { w: ['clear'], h: [6, 10] }, 'Mañana despejada, de las que dan ganas de todo.', 'Da gusto madrugar con este cielo.'),
  ...L('weather', {}, 'El tiempo aquí cambia cuando le da la gana.', 'Nunca sé cómo vestirme, la verdad.', 'Yo ya no miro el parte, miro por la ventana.', 'Al final, siempre acabo con el abrigo en la mano.'),
  ...L('weather', { i: ['cycling', 'skating'] }, 'Con buen tiempo me paso el día en la bici. Con malo, también, pero me quejo.', 'Si llueve, nada de patinar: es un suelo muy resbaladizo.'),

  // ---------------------------------------------------------------- hora y día
  ...L('time', {}, 'Ya {es} {hora}, ¿no? Cómo pasa.', 'Si no me falla el móvil, {es} {hora}.', '{Hora}. Y yo sin enterarme del día.', 'Un {dia} más, y aquí andamos.'),
  ...L('time', { h: [6, 10] }, 'Todavía es pronto, ¿eh? {Hora}.', 'A estas horas el barrio aún bosteza.', '{Hora} y ya en pie. Alguien me debe un café.'),
  ...L('time', { h: [12, 16] }, 'Ya es mediodía, ¿cómo ha pasado tan rápido?', 'Sobre estas horas se me abre el hambre, como un reloj.'),
  ...L('time', { h: [16, 20] }, 'Esta hora de la tarde es la mejor del día, ¿no crees?', '{Ahora} el barrio se llena de gente. Me gusta.'),
  ...L('time', { h: [22, 4] }, '{Hora}. Y yo, que dije que me iba pronto.', 'A estas horas ya no se sabe si es tarde o pronto.', 'Qué manera de pasar la hora, tengo la noche descontrolada.'),
  ...L('time', { d: 'weekday' }, 'Un {dia} cualquiera. A ver si se acaba pronto la semana.', 'Un {dia}, pero parece lunes. Siempre me pasa.'),
  ...L('time', { d: 'weekend' }, 'Un {dia}, por fin. Que nadie me hable de lunes.', 'Los {dias} son otro mundo. La gente anda más suelta.'),
  ...L('time', { d: 'sunday' }, 'Domingo: el día más raro de la semana.', 'Los domingos todo va más despacio. Y yo, encantado.'),

  // ----------------------------------------------------------------- el barrio
  ...L('neighborhood', {}, 'El barrio está bien. Se vive tranquilo si sabes por dónde moverte.', 'Aquí hay de todo: la plaza, el parque, la Avenida... Cuesta aburrirse.', 'Llevo un tiempo por aquí y le he ido cogiendo cariño.', 'Se nota que es un barrio de los de siempre, aunque cambia poco a poco.'),
  ...L('neighborhood', { p: ['plaza', 'street'] }, 'La Plaza de la Fuente es lo mejor: siempre hay alguien y nunca hay ruido de más.', 'La Calle Mayor es un lío entre semana, pero merece la pena.'),
  ...L('neighborhood', { p: ['park'] }, 'El Parque del Olmo es mi sitio. Si me pierdes, mírame ahí.', 'Lo mejor del barrio es el parque: tiene sombra, bancos y nadie te pide nada.', 'Me encanta el Olmo a primera hora, cuando todavía hay silencio.'),
  ...L('neighborhood', { p: ['metro'] }, 'La plazuela del metro es un hervidero. Nunca sabes quién va a salir de la boca.', 'Aquí se cruza todo el mundo. Es raro no ver a alguien conocido.'),
  ...L('neighborhood', { p: ['nightlife'] }, 'Por aquí por la noche es otra cosa. La Órbita y La Cepa tiran de la gente.', 'Este rincón se llena de madrugada. Si quieres ruido, ya sabes.'),
  ...L('neighborhood', { h: [6, 12] }, 'Por las mañanas el barrio huele a pan y a café. Eso no se paga.', 'Antes de las diez, la calle es otra: panaderías, persianas, gente con prisa.'),
  ...L('neighborhood', { h: [16, 22] }, 'Por las tardes, las terrazas se llenan y el barrio se pone guapo.', 'Cuando oscurece, el barrio enciende las farolas y parece más pequeño. Me gusta.'),
  ...L('neighborhood', { i: ['food'] }, 'Casa Tomás tiene buena mano y la terraza de la Pausa es un clásico para el café.', 'Si quieres comer bien, pregunta por Casa Tomás. No te vas a arrepentir.'),
  ...L('neighborhood', { i: ['fashion', 'tattoos', 'music'] }, 'Si te va lo distinto, la Calle del Carmen es tu sitio. Tiendas raras, discos, tinta.', 'En la Calle del Carmen hay cosas que no encuentras en ningún otro lado.'),
  ...L('neighborhood', { s: ['dry', 'sarcastic'] }, 'El barrio está bien si no le pides mucho. A mí me va.', 'Hay más bares que bancos, y eso ya dice algo bueno.'),
  ...L('neighborhood', { r: 1 }, 'Ya te vas conociendo esto mejor, ¿eh? Se nota.', 'Cuando lleguen más cosas al barrio, te lo cuento.'),

  // ------------------------------------------------------------------ la ciudad
  ...L('city', {}, 'Madrid es grande, pero uno acaba reduciéndola a cuatro calles.', 'La ciudad tiene dos velocidades: la de los que llegan y la de los que se van.', 'Yo no cambio mi rincón por nada de lo que hay en el centro.', 'A veces me apetece perderme por otro barrio, pero siempre acabo volviendo.', 'Esta ciudad tiene algo: no sabes qué, pero engancha.'),
  ...L('city', { h: [20.5, 4] }, 'De noche la ciudad se hace más pequeña. Todo parece más cerca.', 'Madrid de madrugada es otra ciudad, más de verdad.'),
  ...L('city', { s: ['sarcastic', 'dry'] }, 'La ciudad es genial hasta que intentas cruzarla en hora punta.', 'Madrid: donde todo está cerca, pero nada se llega.'),
  ...L('city', { a: ['tourist'] }, 'Soy de fuera, y me ha sorprendido lo amable que es la gente.', 'Estoy de visita. Todo me parece precioso, hasta los buzones.'),

  // ------------------------------------------------------------ trabajo y estudios
  ...L('work', { a: ['commute', 'work'] }, 'Llego justo a la oficina. Si me ves otra vez, será tarde.', 'Hoy toca reunión, de las que podrían ser un correo.', 'Mi jefe adora las reuniones temprano. Qué casualidad.', 'Entre el metro y el trabajo, me paso la vida en transiciones.'),
  ...L('work', { d: 'weekday' }, 'Lo mío es de oficina, y los lunes cuestan.', 'Trabajo cerca de aquí, que es un lujo hoy en día.', 'Esta semana hay mucho lío en el trabajo. Pero bueno, se pasa.'),
  ...L('work', { d: 'weekend' }, 'Hoy trabajo, aunque sea {dia}. Alguien tenía que hacerlo.', 'Ya hice mi parte de la semana. Hoy toca desconectar.'),
  ...L('work', { s: ['talkative', 'friendly'] }, 'Llevo unos años en lo mismo y todavía me gusta, que ya es mucho decir.', 'Tengo un buen equipo, la verdad. Hay quien no puede decir lo mismo.'),
  ...L('work', { s: ['dry', 'reserved', 'sarcastic'] }, 'Trabajo. Lo de siempre.', 'No me quejo. Bueno, sí, pero en privado.', 'Es un trabajo. Paga las facturas, y ya.'),
  ...L('work', { i: ['technology', 'art', 'photography'] }, 'Lo mío es más de pantallas y de ideas. A veces hasta funcionan.', 'Trabajo en algo creativo y es agotador, pero me encanta.'),
  ...L('work', { a: ['work'], p: ['gym', 'food', 'shop'] }, 'Aquí estoy, de turno. Se te pasa rápido cuando hay gente.', 'Hoy hay bastante movimiento, que se agradece para pasar el rato.'),

  // ------------------------------------------------------------ planes del día
  ...L('plans', {}, 'No tengo nada decidido. Me dejo llevar.', 'Pues todavía no lo sé, a ver qué me pide el cuerpo.', 'Un poco de todo y de nada. Sin planes grandes.', 'Hoy toca improvisar.', 'Primero esto, luego lo otro, y lo que salga.'),
  ...L('plans', { h: [6, 12] }, 'Esta mañana, recados. Esta tarde, ya veremos.', 'Cafecito, un par de cosas y a ver qué me inventa el día.'),
  ...L('plans', { h: [12, 18] }, 'Esta tarde, nada serio. Un paseo y a casa.', 'Me quedan un par de cosas, pero tampoco me agobio.'),
  ...L('plans', { h: [18, 22] }, 'Esta noche, cena con amigos, si no cancelan.', 'Voy a ver qué me apetece; igual cenamos algo por aquí.'),
  ...L('plans', { a: ['nightout'] }, 'Ahora vamos a tomar algo y luego, ya veremos hasta dónde llegamos.', 'La idea es cenar, un par de copas y a ver. Con calma.'),
  ...L('plans', { a: ['shop'] }, 'Vengo a ver si encuentro algo que me guste. Siempre entro a mirar y salgo con tres cosas.', 'Compras. Mi cartera no se ha enterado todavía.'),
  ...L('plans', { a: ['exercise'] }, 'Voy a entrenar un rato y luego a ducharme. Plan perfecto.', 'Cardio, un poco de peso y para casa.'),
  ...L('plans', { s: ['talkative', 'friendly'], q: true }, 'Luego igual me paso por el parque. ¿Y tú, tienes plan?', 'Todavía lo voy viendo. ¿Tú qué tienes pensado?'),
  ...L('plans', { s: ['reserved', 'dry'] }, 'Nada especial.', 'Lo que salga.'),

  // ------------------------------------------------------------------ comida
  ...L('food', { i: ['food'] }, 'La comida de aquí es tan buena que me da pena irme de vacaciones.', 'Si tienes que probar algo, pide lo del día en Casa Tomás.', 'Una cosa que echo de menos es un buen guiso. Y aquí lo encuentras.', 'Soy de los que planifican la cena mientras comen.'),
  ...L('food', { h: [11, 15] }, 'Ya empiezo a pensar en qué como hoy, que se me acaba la mañana.', 'Qué hambre me está entrando. Y todavía es pronto para decir que me rindo.'),
  ...L('food', { h: [19, 23] }, 'Esta noche toca algo sencillo, que no estoy para fiestas.', 'Una buena cena arregla un mal día. Es ciencia.'),
  ...L('food', { h: [7, 11] }, 'Tostada y café, y ya es otro día.', 'Un buen desayuno es medio día ganado.'),
  ...L('food', { a: ['food'] }, 'Aquí uno viene a comer y a no hacer nada más.', 'Hoy me mimo con algo rico. Me lo he ganado.'),
  ...L('food', { s: ['humorous', 'sarcastic'] }, 'Yo con tal de que no sea ensalada, soy feliz.', 'Mi dieta consiste en lo que hay en la nevera, y eso ya es ser flexible.'),

  // ------------------------------------------------------------------ música
  ...L('music', { i: ['music'] }, 'Ando enganchado a un disco desde hace semanas, no puedo cambiar.', 'Si encuentras una buena tienda de discos, avísame. Siempre quiero más.', 'La música es lo único que me arregla un mal día.', 'Esta mañana he escuchado algo nuevo y no me lo quito de la cabeza.'),
  ...L('music', { i: ['music'], a: ['commute', 'walk'] }, 'Voy con los cascos puestos. Si no los llevo, me siento desnudo.', 'El trayecto se pasa mejor con una buena lista, ya verás.'),
  ...L('music', { i: ['music'], h: [20, 4] }, 'Hoy toca algo con ritmo. A ver qué ponen en la Órbita.', 'A esta hora, la música es lo que manda.'),
  ...L('music', { i: ['music'], p: ['street'] }, 'En la Calle del Carmen se escucha de todo. Hay tienda de discos y la gente pincha cosas que no conoces.'),

  // ------------------------------------------------------------------ moda
  ...L('fashion', { i: ['fashion'] }, 'Me flipan los básicos bien llevados. Menos es más, siempre.', 'Siempre acabo comprándome lo mismo en otro color. Es un vicio.', 'La ropa de segunda mano tiene cosas que no se encuentran en ningún otro sitio.', 'Para mí un buen abrigo cambia un día.'),
  ...L('fashion', { i: ['fashion'], p: ['street', 'shop'] }, 'En la Calle del Carmen hay tiendas que son una gozada. Entro a mirar y salgo cargada.', 'Me paso medio día en las tiendas de vintage. Y vuelvo.'),
  ...L('fashion', { i: ['fashion', 'tattoos'], s: ['humorous', 'sarcastic'] }, 'Mi armario es una declaración de intenciones. No se sabe de qué, pero lo es.', 'Voy bien vestido, aunque no lo parezca. Es el truco.'),

  // ------------------------------------------------------- deporte y fútbol
  ...L('sports', { i: ['football'] }, '¿Viste el partido de anoche? Para olvidar.', 'Mi equipo me da más disgustos que alegrías, pero aquí sigo.', 'Los domingos sin fútbol no son domingos.', 'Si ganan hoy, me invito a una caña.', 'Hay que tener fe. O terapia.'),
  ...L('sports', { i: ['football'], d: 'weekend' }, 'Este fin de semana toca partido y mi cuñado ya me ha avisado de que gana el suyo.', 'Hoy hay partido. Si desaparezco a las ocho, ya sabes por qué.'),
  ...L('sports', { i: ['football', 'fitness'], s: ['humorous', 'sarcastic'] }, 'Mi relación con el deporte: lo veo desde el sofá con mucha pasión.', 'Soy un gran aficionado de ver cómo juegan otros.'),

  // ------------------------------------------------------------------ salir de noche
  ...L('nightlife', { i: ['nightlife', 'music'], h: [20, 4] }, 'A estas horas la Órbita ya debe estar calentándose.', 'Hoy me apetece salir, pero mañana habrá que pagar.', 'Quedé con gente para ir a La Cepa. Hay buen ambiente.', 'La noche empieza tarde y yo no sé cuándo acaba.'),
  ...L('nightlife', { d: 'night-out' }, 'Viernes noche: la ciudad se pone sus mejores galas.', 'Hoy es de esos días en que lo mejor es no mirar la hora.', 'Si te ves con ganas, la noche del sábado está llena de sitios.'),
  ...L('nightlife', { i: ['nightlife'], h: [6, 18] }, 'Anoche me acosté tarde y hoy lo pago. No me arrepiento.', 'Después de una noche larga, el día siguiente es una condena con gracia.'),
  ...L('nightlife', { a: ['nightout'], g: 'group' }, 'Vamos a tomar algo primero, y de ahí a lo que surja.', 'Hemos quedado para cenar y luego, la noche decide.'),

  // ------------------------------------------------------------------ transporte
  ...L('transit', { p: ['metro', 'plaza'], a: ['commute', 'wait'] }, 'El metro hoy va fatal. Siempre es el que se me escapa.', 'Cuando llega el tren, la plazuela entera cambia de ritmo.', 'Cada mañana, el mismo vagón. Ya conozco hasta a los que duermen.'),
  ...L('transit', { a: ['commute'] }, 'Entre el metro y el bus, la mitad del día se me va en moverme.', 'Si el tren no falla, llego puntual. Si no, ya te contaré.'),
  ...L('transit', { h: [7, 10], d: 'weekday' }, 'En hora punta el metro es un deporte de contacto.', 'A estas horas, la plazuela vomita gente cada cinco minutos.'),
  ...L('transit', { h: [22, 4] }, 'De noche el metro va vacío y se te hace eterno.', 'Tendré que mirar cuándo pasa el último, que no quiero perderlo.'),
  ...L('transit', { i: ['cycling'] }, 'Yo voy en bici a todas partes. Salvo cuando llueve, ahí soy cobarde.', 'El carril bici de la Avenida es una maravilla. Podrían hacer otro así.'),

  // --------------------------------------------------- gimnasio y entrenar
  ...L('fitness', { i: ['fitness'] }, 'Hoy me toca pierna. No me hables de escaleras.', 'Entrar al Forja es de lo mejor que me ha pasado. Aunque a veces me odie.', 'Ya noto la diferencia desde que entreno de forma regular, para qué mentir.', 'Lo difícil no es entrenar: es ir. Lo demás sale solo.', 'Hay días que cuesta el doble, pero luego lo agradeces.'),
  ...L('fitness', { i: ['fitness'], a: ['exercise'] }, 'Estoy a medias de la serie, perdona si respiro raro.', 'Una más y lo dejo. Siempre digo lo mismo.', 'Sudado, pero contento. Eso es entrenar.'),
  ...L('fitness', { i: ['fitness'], h: [6, 9.5] }, 'Madrugar para entrenar es un acto de fe, pero me deja el día ordenado.', 'Si entreno antes de trabajar, me siento invencible. Hasta las doce.'),
  ...L('fitness', { i: ['fitness', 'football'], s: ['humorous', 'sarcastic'] }, 'Mi plan de entrenamiento: ir andando a todas partes y llamarlo cardio.', 'Dicen que hay que moverse. Yo me muevo cuando me persiguen.'),

  // ------------------------------------------------------------- fin de semana
  ...L('weekend', { d: 'weekend' }, 'Fin de semana: por fin dejo de mirar el reloj.', 'Sábado y domingo para mí; el resto, para los demás.', 'Hoy no tengo que hacer nada. Y me estoy esforzando mucho en no hacerlo.'),
  ...L('weekend', { d: 'weekday', h: [14, 24] }, 'Todavía queda para el finde, pero ya lo estoy esperando.', 'Esta semana se me hace larguísima. Necesito un domingo ya.'),
  ...L('weekend', { d: 'friday' }, 'Es viernes: el mejor día de la semana, con mucha diferencia.', 'Los viernes se nota en el aire, ¿verdad? Todo el mundo sonríe más.'),
  ...L('weekend', { d: 'saturday', h: [6, 14] }, 'Sábado por la mañana: dormir, desayunar, y ya veremos.', 'Los sábados, el mercado y la calle se llenan. Me encanta.'),
  ...L('weekend', { d: 'sunday' }, 'Domingo de manta, café y poco más.', 'Los domingos por la tarde me da una nostalgia rara. Ya sabes.'),

  // ------------------------------------------------------------------ quejas
  ...L('complaint', {}, 'Qué cosas tiene la vida, ¿eh? Hoy todo me sale al revés.', 'Hay días en que el mundo entero parece conspirar.', 'No sé qué le pasa a todo el mundo hoy, vamos como locos.', 'Estoy un poco harto, la verdad. Pero se me pasa.'),
  ...L('complaint', { w: ['rain'] }, 'Lo peor de llover: que todo el mundo anda con paraguas a la altura de los ojos.', 'Estoy empapado hasta de la tarde de ayer.'),
  ...L('complaint', { h: [7, 10], a: ['commute'] }, 'Una persona no debería existir antes de las ocho. Lo digo sin acritud.', 'Hoy el metro me ha dejado de recuerdo la axila de un desconocido.'),
  ...L('complaint', { p: ['street', 'plaza'] }, 'Aquí siempre hay obras. Cuando acaban unas, empiezan otras.', 'Los patinetes por la acera me quitan años de vida.'),
  ...L('complaint', { s: ['sarcastic', 'dry'] }, 'Me quejaría, pero ya me he cansado de hacerlo.', 'Todo genial. Como siempre. Esta ironía es gratis.'),
  ...L('complaint', { d: 'weekday' }, 'La semana va a ser larga. Lo noto en el cuerpo.', 'Es {dia} y ya estoy contando los días para el finde.'),

  // ------------------------------------------------------------ buen ánimo
  ...L('positive', { m: ['good'] }, 'Estoy de buen humor hoy. No me preguntes por qué.', 'Me ha salido un día de esos en los que todo fluye.', 'Pues hoy me siento bien, la verdad. Qué raro, ¿no?', 'He dormido ocho horas. Soy otra persona.', 'Hoy estoy de racha. No la gafes.'),
  ...L('positive', { m: ['good'], w: ['clear'] }, 'Con este sol, cualquiera se queja.', 'Con un día así, estoy hasta de buen humor con los vecinos.'),
  ...L('positive', { m: ['good'], d: 'weekend' }, 'Fin de semana y encima me encuentro bien. Pido poco más.', 'Me he levantado sin despertador. Eso es riqueza.'),
  ...L('positive', { m: ['good'], s: ['energetic', 'friendly'] }, '¡Fenomenal! Hoy tengo energía para tres personas.', 'Mejor imposible, ¡me han dado una buena noticia!'),
  ...L('positive', { m: ['good'], s: ['dry', 'calm', 'reserved'] }, 'Bien. Contento, incluso. Qué cosas.', 'Tranquilo. Con el cuerpo en paz.'),

  // ------------------------------------------------------------------ cansancio
  ...L('tired', { m: ['tired'] }, 'Estoy un poco cansado, no te voy a mentir.', 'Dormí fatal. El cuerpo me pide un café y un sofá.', 'Hoy me pesa todo, hasta las llaves.', 'No sé si es el tiempo o la semana, pero voy arrastrando.', 'Creo que hoy me hace falta una siesta de las largas.'),
  ...L('tired', { m: ['tired'], h: [22, 5] }, 'Es muy tarde, y yo ya soy un fantasma.', 'A estas horas solo funcionan los fantasmas y los de la noche.'),
  ...L('tired', { m: ['tired'], h: [6, 10] }, 'Me he levantado hace nada. Si me ves coherente, es casualidad.', 'Todavía no he desayunado y ya estoy cansado. Mala combinación.'),
  ...L('tired', { m: ['tired'], a: ['exercise'] }, 'Llevo una hora dándole y las piernas me han abandonado.', 'Estoy agotado, pero de lo bueno.'),
  ...L('tired', { m: ['tired'], s: ['humorous', 'sarcastic'] }, 'Estoy cansado, pero con estilo.', 'Mi nivel de energía está al cinco por ciento. El cinco es optimista.'),

  // ------------------------------------------------------------------ prisa
  ...L('hurried', { m: ['hurried'] }, 'Perdona, voy con prisa.', 'Ahora no puedo, que llego tarde.', 'Tengo que correr, disculpa.', 'Voy justo, ¿lo dejamos para otro día?', 'Lo siento, tengo que irme ya.', 'Si no llego a la hora me matan, de verdad.'),
  ...L('hurried', { m: ['hurried'], s: ['friendly', 'energetic'] }, '¡Qué pena, pero me tengo que ir volando! Otro día, ¿vale?', 'Me encantaría charlar, pero me esperan. ¡Un abrazo!'),
  ...L('hurried', { m: ['hurried'], s: ['dry', 'direct'] }, 'Sin tiempo. Dime en una frase.', 'Estoy de paso. Rápido.'),
  ...L('hurried', { m: ['hurried'], s: ['sarcastic', 'humorous'] }, 'Tengo exactamente cuarenta segundos de paciencia. Empiezas ya.', 'Si no corro ahora, me da un ataque. Me voy.'),
  ...L('hurried', { m: ['hurried'], a: ['commute'] }, 'Que se me escapa el metro. Hablamos luego.', 'Tengo que coger el tren y ya voy tarde. Hablamos luego.'),

  // ------------------------------------------------------------------ incomodidad
  ...L('awkward', { s: ['shy', 'reserved'] }, 'Eh... no sé muy bien qué decir.', 'Perdona, no soy muy de hablar con gente.', 'Hmm... sí. Bueno... ya sabes.', 'Me pones nervioso. No es culpa tuya.'),
  ...L('awkward', { s: ['dry', 'direct'] }, '... Vale.', 'No sé qué responder a eso.', 'Pues, mira, qué cosa.'),
  ...L('awkward', { s: ['sarcastic'] }, 'Qué forma tan peculiar de empezar una conversación.', 'Ah, claro. Sí. Por supuesto. No sé qué dices.'),
  ...L('awkward', { m: ['down'] }, 'Hoy no estoy para mucho, perdona.', 'No es un buen día para hablar. Lo siento.'),
  ...L('awkward', { r: 1 }, 'Ah, eres tú... eh... ¿cómo era?... Nada, nada.', 'Perdona, tengo mala memoria con las caras.'),

  // ------------------------------------------------------------------ amabilidad
  ...L('friendly', { s: ['friendly', 'energetic', 'talkative'] }, 'Qué simpático que preguntes. Se agradece un trato así.', 'Da gusto hablar con alguien que se para a escuchar.', 'Eres de esa gente que da buen rollo. Me caes bien.'),
  ...L('friendly', { s: ['calm', 'shy', 'reserved'] }, 'Gracias por preguntar. Se agradece.', 'Es agradable hablar un rato, la verdad.'),
  ...L('friendly', { r: 1 }, 'Ya eres de la casa, ya.', 'Oye, ya que nos vemos tanto, podíamos tomar algo un día.'),
  ...L('friendly', { r: 2 }, 'Si necesitas lo que sea, ya sabes dónde estoy.', 'Me alegra mucho cruzarme contigo. En serio.'),
  ...L('friendly', { w: ['rain'] }, 'Con esta lluvia, charlar es un lujo. Gracias.', 'Hablar de lo que sea es mejor que mojarse en silencio.'),

  // ------------------------------------------------------------------ bromas
  ...L('joke', { s: ['humorous', 'sarcastic', 'energetic'] }, 'Dicen que mi paciencia es admirable. Me lo dice mi gato, que es el único que me escucha.', 'Cada vez que me levanto con energía, resulta que era un error.', 'Si fuera una app, tendría muchas notificaciones sin leer.', 'He decidido empezar a ahorrar. Ya tengo la hucha. Ahora solo falta lo otro.'),
  ...L('joke', { s: ['dry', 'calm'] }, 'Mi vida es como el metro: mucho ruido y nunca llego a donde quería.', 'No tengo problema de memoria. Se me olvida todo muy rápido.'),
  ...L('joke', { s: ['friendly', 'talkative'] }, 'Tengo un amigo que dice que madruga. Su concepto de madrugar es las once.', 'Mi plan de hoy: cero planes. Se me está dando fenomenal.'),
  ...L('joke', { i: ['football'] }, 'Yo no soy gafe. Es que mi equipo pierde cuando miro.'),
  ...L('joke', { i: ['fitness'] }, 'Mi mejor ejercicio es saltarme el lunes.'),
];
