/**
 * Lo que se escribe por el móvil (systems/Phone): las respuestas de cada personaje según lo que le mandas y cómo
 * salió (la misma tirada de systems/Social que en persona), lo que escriben ellos primero y lo que dicen si les
 * pillas liados. Cada voz por su lado: Sara (data/chatNamed: rápida, expresiva) escribe a borbotones; Ada (seca,
 * directa) contesta corto y tarde. Lo genérico (sin `n`) cubre a quien no tenga voz propia.
 *
 * `t` limita una línea a un trato: 'acq' conocidos, 'friend' amistad, 'romance' atracción o interés, 'partner'
 * pareja. Sin `t`, vale para todos. Si hay líneas del trato justo, se usan ésas.
 * Huecos: {lugar} {hora} {cuando} {plan} (un plan: «un café»), {sitio} (donde está ahora).
 */

export type PhoneTier = 'acq' | 'friend' | 'romance' | 'partner';

export interface PhoneLine {
  n?: string;
  t?: readonly PhoneTier[];
  text: readonly string[];
}

const FR: readonly PhoneTier[] = ['friend', 'romance', 'partner'];
const RO: readonly PhoneTier[] = ['romance', 'partner'];

export const PHONE_LINES: Readonly<Record<string, readonly PhoneLine[]>> = {
  // ------------------------------------------------------------ lo que tú mandas
  'greet': [
    { n: 'sara', text: ['¡Holaaa! ¿Qué pasa?', '¡Ey! Justo iba a escribirte. Bueno, no, pero queda bonito.', '¡Hola, hola! Dime.'] },
    { n: 'sara', t: RO, text: ['Hola tú 🙂 ¿Qué tal?', '¡Hola! Ya me estaba preguntando cuándo escribirías.'] },
    { n: 'sara', t: ['partner'], text: ['¡Hola, mi amor! ¿Cómo va el día?'] },
    { n: 'ada', text: ['Hola.', 'Ey.', 'Dime.'] },
    { n: 'ada', t: FR, text: ['Hola. ¿Qué tal?', 'Ey. Justo hacía una pausa.'] },
    { n: 'ada', t: ['partner'], text: ['Hola. Me alegra que escribas.'] },
    { text: ['¡Hola!', 'Hola, ¿qué tal?'] },
  ],
  'greet:negative': [
    { n: 'sara', text: ['Hola.', 'Ah. Hola.'] },
    { n: 'ada', text: ['Ya.', 'Hola.'] },
    { text: ['Hola.'] },
  ],
  'howru': [
    { n: 'sara', text: ['¡Bien! Con mil cosas, pero bien. ¿Y tú?', 'Liadísima, pero feliz. ¿Tú qué tal?', 'Pues mira, sobreviviendo a patronaje. ¿Y tú?'] },
    { n: 'sara', t: RO, text: ['Ahora mejor 🙂 ¿Y tú?'] },
    { n: 'ada', text: ['Bien. Estudiando.', 'Cansada. Lo normal.', 'Bien. ¿Tú?'] },
    { n: 'ada', t: FR, text: ['Bien. Mejor que ayer. ¿Tú qué tal?', 'Hoy ha cundido. Eso ya es mucho.'] },
    { text: ['Bien, ¿y tú?', 'Tirando. ¿Tú?'] },
  ],
  'howru:negative': [
    { n: 'sara', text: ['Bien.', 'Normal.'] },
    { n: 'ada', text: ['Normal.', 'Bien.'] },
    { text: ['Bien.'] },
  ],
  'doing:free': [
    { n: 'sara', text: ['Ahora en {sitio}. ¿Te pasas?', 'Por {sitio}, mirando cosas. ¿Y tú?'] },
    { n: 'ada', text: ['En {sitio}.', 'Por {sitio}. Despejándome.'] },
    { text: ['Por {sitio}.'] },
  ],
  'doing:home': [
    { n: 'sara', text: ['En casa, editando. La edición no se acaba nunca.', 'En casa con el portátil y tres cafés.'] },
    { n: 'ada', text: ['En casa. Repasando.', 'En casa. Temario.'] },
    { text: ['En casa, tranquila.'] },
  ],
  'doing:commuting': [
    { n: 'sara', text: ['¡Andando a mil sitios! Te escribo bien en un rato.'] },
    { n: 'ada', text: ['De camino.'] },
    { text: ['De camino a un sitio.'] },
  ],
  'casual': [
    { n: 'sara', text: ['Oye, he visto una chaqueta en Retales que me ha robado el corazón.', 'Hoy he grabado un vídeo con una luz preciosa. Ya te lo enseñaré.', 'Te juro que hoy todo el barrio iba conjuntado menos yo.'] },
    { n: 'sara', t: FR, text: ['Me encanta que me escribas, que lo sepas. Me saca del bucle.', 'Contigo se puede hablar de todo, ¿eh?'] },
    { n: 'ada', text: ['Hoy he hecho dos temas. Me quedan treinta.', 'He visto a uno tirar un triple desde medio campo. Suerte.'] },
    { n: 'ada', t: FR, text: ['Gracias por escribir. Me viene bien desconectar.', 'Oye, eres de las pocas personas con las que hablar no me cansa.'] },
    { text: ['Ya ves, aquí andamos.', 'Pues nada, lo de siempre.'] },
  ],
  'casual:negative': [
    { n: 'sara', text: ['Ya... oye, ahora no estoy mucho para hablar.'] },
    { n: 'ada', text: ['Ok.', 'Ahora no me apetece mucho.'] },
    { text: ['Ya.'] },
  ],
  'joke': [
    { n: 'sara', text: ['JAJAJAJA para', 'Me lo apunto para un vídeo. Sin darte crédito.', 'Jajaja no puedo contigo.'] },
    { n: 'ada', text: ['Jaja.', 'Vale, esa ha tenido gracia.', 'Malísimo. Me he reído.'] },
    { text: ['Jajaja', 'Qué malo, jaja'] },
  ],
  'joke:negative': [
    { n: 'sara', text: ['Mmm. No sé si pillarlo.'] },
    { n: 'ada', text: ['No.', 'Ya.'] },
    { text: ['Vale...'] },
  ],
  'flirt': [
    { n: 'sara', text: ['¿Me estás tirando la caña por mensaje? 🙂 Sigue.', 'Uy. Eso me lo guardo.'] },
    { n: 'sara', t: ['partner'], text: ['Y tú a mí. Mucho.'] },
    { n: 'ada', text: ['...Vale. Me has sacado una sonrisa.', 'Eso no me lo esperaba. No está mal.'] },
    { n: 'ada', t: ['partner'], text: ['Lo sé. Yo a ti también.'] },
    { text: ['Jaja, me halagas.'] },
  ],
  'flirt:neutral': [
    { n: 'sara', text: ['Jajaja, ¿y eso a qué viene?'] },
    { n: 'ada', text: ['¿Eso es un piropo?'] },
    { text: ['Jaja, vale.'] },
  ],
  'flirt:negative': [
    { n: 'sara', text: ['Oye... prefiero que lo dejemos en amistad, ¿vale?'] },
    { n: 'ada', text: ['No. Mejor no por ahí.'] },
    { text: ['Mejor no.'] },
  ],
  'invite:positive': [
    { n: 'sara', text: ['¡Sí! {plan} {cuando} a las {hora} en {lugar}. Apuntado.', '¡Me encanta! {cuando} a las {hora}, {lugar}. No me falles.'] },
    { n: 'ada', text: ['Vale. {cuando} a las {hora} en {lugar}.', 'Hecho. {lugar}, {hora}.'] },
    { text: ['Vale, {cuando} a las {hora} en {lugar}.'] },
  ],
  'invite:neutral': [
    { n: 'sara', text: ['Uf, esta semana lo tengo fatal. ¿Lo hablamos otro día?', 'Me apetece, pero ahora no puedo prometer nada. ¿Más adelante?'] },
    { n: 'ada', text: ['Ahora no puedo. Otro día.', 'Esta semana no. Ya veremos.'] },
    { text: ['Ahora no puedo, ¿otro día?'] },
  ],
  'invite:negative': [
    { n: 'sara', text: ['Mmm, no, gracias. Paso.', 'Creo que no, perdona.'] },
    { n: 'ada', text: ['No.', 'No me apetece, gracias.'] },
    { text: ['No, gracias.'] },
  ],
  'date:positive': [
    { n: 'sara', text: ['¿Una cita? ...Sí. Sí, claro. {cuando} a las {hora} en {lugar} 🙂', '¡Vale! Me pongo nerviosa y todo. {cuando}, {hora}, {lugar}.'] },
    { n: 'ada', text: ['Vale. Una cita. {cuando} a las {hora} en {lugar}. No llegues tarde.', 'Sí. Me apetece. {lugar}, {hora}.'] },
    { text: ['Sí, me apetece. {cuando} a las {hora} en {lugar}.'] },
  ],
  'date:neutral': [
    { n: 'sara', text: ['Me lo tengo que pensar, ¿vale? No es un no.'] },
    { n: 'ada', text: ['No sé. Déjame pensarlo.'] },
    { text: ['Déjame pensarlo.'] },
  ],
  'date:negative': [
    { n: 'sara', text: ['Ay... no lo veo así, perdona. Pero me caes genial.'] },
    { n: 'ada', text: ['No. Lo siento, no lo veo así.'] },
    { text: ['No lo veo así, perdona.'] },
  ],
  'confirm': [
    { n: 'sara', text: ['¡Sigue en pie! Ya tengo el outfit pensado.', '¡Claro! Allí estaré.'] },
    { n: 'ada', text: ['Sí. Allí estaré.', 'Confirmado.'] },
    { text: ['Sí, allí estaré.'] },
  ],
  'cancel': [
    { n: 'sara', text: ['Ah... vale. Otra vez será.', 'Vaya. Bueno, no pasa nada. Bueno, un poco sí.'] },
    { n: 'ada', text: ['Vale.', 'Ok. Otro día.'] },
    { text: ['Vale, otro día.'] },
  ],
  'cancel:late': [
    { n: 'sara', text: ['¿Ahora? Ya estaba arreglándome... En fin.'] },
    { n: 'ada', text: ['¿Ahora me lo dices? Vale.'] },
    { text: ['¿Ahora me lo dices? Vale.'] },
  ],
  'bye': [
    { n: 'sara', text: ['¡Un besi! Hablamos.', '¡Chao! Te escribo luego.'] },
    { n: 'sara', t: RO, text: ['Chao 🙂 Hasta luego.'] },
    { n: 'ada', text: ['Hasta luego.', 'Ok. Hablamos.'] },
    { text: ['¡Hasta luego!'] },
  ],
  'invite-accepted': [
    { n: 'sara', text: ['¡Bien! Allí nos vemos.', '¡Genial! Ya tengo ganas.'] },
    { n: 'ada', text: ['Bien. Nos vemos.', 'Perfecto.'] },
    { text: ['¡Genial, nos vemos!'] },
  ],
  'invite-declined': [
    { n: 'sara', text: ['Vale, ¡otra vez será!', 'Ooh. Bueno, la próxima.'] },
    { n: 'ada', text: ['Vale.', 'Ok, otro día.'] },
    { text: ['Vale, otro día.'] },
  ],
  // Lo mismo dos veces en el día, o escribir sin parar.
  'repeat': [
    { n: 'sara', text: ['Jajaja eso ya me lo has preguntado hoy.', '¿Otra vez? Te repites, ¿eh?'] },
    { n: 'ada', text: ['Ya me lo has dicho.', 'Otra vez lo mismo.'] },
    { text: ['Eso ya me lo has dicho.'] },
  ],
  'spam': [
    { n: 'sara', text: ['Oye, que me vas a fundir el móvil jajaja. Luego hablamos.', 'Dame un respiro, que no paro de vibrar.'] },
    { n: 'ada', text: ['Para un poco con los mensajes.', 'Tengo que estudiar. Luego.'] },
    { text: ['Luego hablamos, ¿vale?'] },
  ],
  'upset': [
    { n: 'sara', text: ['Ya.', 'Vale.'] },
    { n: 'ada', text: ['Ok.', 'Ya.'] },
    { text: ['Ya.'] },
  ],
  // Delante de la respuesta, si le pillaste liada, durmiendo o de camino.
  'busy': [
    { n: 'sara', text: ['¡Perdona! Estaba en mil cosas.', 'Sorry, estaba liada.'] },
    { n: 'ada', text: ['Estaba en clase.', 'Perdona, estaba estudiando.'] },
    { text: ['Perdona, estaba liada.'] },
  ],
  'asleep': [
    { n: 'sara', text: ['¡Buenos días! Ayer caí rendida.', 'Perdón, me dormí con el móvil en la mano.'] },
    { n: 'ada', text: ['Buenos días. Estaba dormida.'] },
    { text: ['Buenos días, estaba dormida.'] },
  ],
  'commuting': [
    { n: 'sara', text: ['¡Ya! Iba andando.'] },
    { n: 'ada', text: ['Iba de camino.'] },
    { text: ['Iba de camino.'] },
  ],

  // ------------------------------------------------------------ cuando te ofrece su número (en persona)
  'offer': [
    { n: 'sara', text: ['¡Oye! Te paso mi número, que así me cuentas cosas.', 'Espera, ¿no tienes mi número? Eso hay que arreglarlo ya.'] },
    { n: 'sara', t: RO, text: ['Oye... ¿te doy mi número? Así no dependemos de cruzarnos 🙂'] },
    { n: 'ada', text: ['Toma mi número. Por si acaso.', 'Apúntate mi número. Si quieres.'] },
    { n: 'ada', t: RO, text: ['...¿Quieres mi número? Me gustaría que me escribieras.'] },
    { text: ['Oye, ¿te paso mi número? Así hablamos.'] },
  ],
  'offer-yes': [
    { n: 'sara', text: ['¡Hecho! Ya te escribo yo, no te preocupes.', '¡Guardado! Ahora no tienes excusa.'] },
    { n: 'ada', text: ['Bien. Escríbeme cuando quieras.', 'Hecho.'] },
    { text: ['Genial, hablamos.'] },
  ],
  'offer-no': [
    { n: 'sara', text: ['Ah, vale. Bueno, ya me encontrarás por aquí.', 'Vale, vale. Tú sabrás.'] },
    { n: 'ada', text: ['Vale. Como quieras.', 'Ok.'] },
    { text: ['Vale, otro día.'] },
  ],

  // ------------------------------------------------------------ lo que escriben ellos primero
  'init:reminder': [
    { n: 'sara', text: ['¡Hoy a las {hora} en {lugar}! ¿Sigue en pie?', 'Lo de hoy en {lugar}, ¿eh? A las {hora}. No te escapes.'] },
    { n: 'ada', text: ['Hoy, {hora}, {lugar}. ¿Sigue?', 'Recordatorio: {lugar} a las {hora}.'] },
    { text: ['Hoy a las {hora} en {lugar}, ¿sigue en pie?'] },
  ],
  'init:date-ahead': [
    { n: 'sara', text: ['Tengo muchas ganas de lo nuestro, que lo sepas 🙂', 'Ya estoy pensando qué ponerme para vernos.'] },
    { n: 'ada', text: ['Sigo pensando en lo de quedar. Me apetece.', 'Oye. Tengo ganas de verte.'] },
    { text: ['Tengo ganas de verte.'] },
  ],
  'init:remember': [
    { n: 'sara', text: ['Me acordé de lo que hablamos. Tenías razón, ¿eh?', 'Oye, lo que me contaste el otro día me dejó pensando.'] },
    { n: 'ada', text: ['Me acordé de lo que hablamos ayer.', 'Lo que dijiste ayer. Tenía sentido.'] },
    { text: ['Me acordé de lo que hablamos.'] },
  ],
  'init:tonight': [
    { n: 'sara', text: ['¿Vas a salir esta noche? Yo sí, obvio.', '¡Es noche de salir! ¿Te vienes a algún sitio?'] },
    { n: 'ada', text: ['¿Sales esta noche?', 'Hoy no estudio. ¿Haces algo esta noche?'] },
    { text: ['¿Vas a salir esta noche?'] },
  ],
  'init:invite': [
    { n: 'sara', text: ['¡Oye! ¿Te vienes {cuando} a {plan}? {lugar}, a las {hora}.', 'Tenemos pendiente {plan}. ¿{cuando} a las {hora} en {lugar}?'] },
    { n: 'ada', text: ['¿{plan} {cuando}? {lugar}, {hora}.', 'Tenemos pendiente {plan}. ¿{cuando} a las {hora} en {lugar}?'] },
    { text: ['¿Te apetece {plan} {cuando} a las {hora} en {lugar}?'] },
  ],
  'init:invite-date': [
    { n: 'sara', text: ['Oye... ¿y si {cuando} quedamos tú y yo? {lugar}, a las {hora}. Como una cita 🙂'] },
    { n: 'ada', text: ['¿Cena {cuando}? Tú y yo. {lugar}, {hora}.'] },
    { text: ['¿Quedamos {cuando}, tú y yo? {lugar}, a las {hora}.'] },
  ],
  'init:checkin': [
    { n: 'sara', text: ['¡Eh! ¿Sigues por aquí? Hace días que no sé nada de ti.', 'Oye, te echo de menos por el barrio. ¿Todo bien?'] },
    { n: 'ada', text: ['Hace días que no te veo. ¿Todo bien?', '¿Sigues por el barrio?'] },
    { text: ['¿Qué tal todo? Hace días que no sé de ti.'] },
  ],
  'init:what': [
    { n: 'sara', text: ['¿Qué haces hoy?', 'Necesito una opinión urgente: ¿botas o zapatillas? Bueno, ¿qué haces?'] },
    { n: 'ada', text: ['¿Qué haces hoy?', 'Pausa del temario. ¿Qué tal tú?'] },
    { n: 'sara', t: RO, text: ['Estaba pensando en ti. Así, sin más.'] },
    { n: 'ada', t: RO, text: ['Me he acordado de ti. Sin motivo.'] },
    { text: ['¿Qué haces hoy?'] },
  ],
};
