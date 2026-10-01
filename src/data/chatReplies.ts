/**
 * Lo que dice la gente de la calle cuando se le pregunta algo concreto: qué hace, cómo se toma una broma o un
 * cumplido, y cómo se despide. Mismas etiquetas que data/chatLines.ts (data/chat.ts); sin ellas, vale para todos.
 * Las despedidas llevan `end`: cierran la conversación.
 */
import { lines as L, type Line } from './chat.ts';

export const CHAT_REPLIES: readonly Line[] = [
  // ----------------------------------------------------- qué hace (por actividad)
  ...L('doing', {}, 'Pues nada, paseando.', 'Aquí, a lo mío.', 'De paso, a ver qué hay.', 'Haciendo tiempo, que es un oficio.'),
  ...L('doing', { a: ['commute'] }, 'Voy al trabajo, como todos los días.', 'Camino de la oficina, que no se paga sola.', 'Me muevo de un sitio a otro. Mi pasión.', 'Llegando a donde toca llegar, sin hacer ruido.'),
  ...L('doing', { a: ['commute'], p: ['metro'] }, 'Cogiendo el metro. O esperando a que lo coja él a mí.', 'Voy al trabajo, y el tren manda.'),
  ...L('doing', { a: ['exercise'] }, 'Entrenando. ¿No se nota?', 'Cardio, un poco de peso y ya.', 'Moviendo el esqueleto, que lo tenía abandonado.', 'Dándole al gimnasio antes de que me dé a mí.'),
  ...L('doing', { a: ['exercise'], p: ['park'] }, 'Corriendo un rato por el parque. Si no, se me va el día.', 'Dando vueltas al Olmo, que es más bonito que la cinta.'),
  ...L('doing', { a: ['food'] }, 'Tomando algo, que me lo he ganado.', 'Comiendo, que es lo mejor de la agenda.', 'Un rato de descanso y un buen plato. No se puede pedir más.'),
  ...L('doing', { a: ['food'], w: ['clear', 'warm'] }, 'Aprovechando la terraza, que con este tiempo es un delito no hacerlo.', 'Un café al sol y que el mundo espere.'),
  ...L('doing', { a: ['shop'] }, 'Mirando tiendas. Entro a ver y salgo con una bolsa.', 'De compras, o algo parecido.', 'Echando un vistazo, que mirar es gratis.'),
  ...L('doing', { a: ['nightout'] }, 'Calentando la noche. Cenamos algo y vemos.', 'De ruta por los bares, que alguien tiene que hacerlo.', 'Esperando a mis amigos, que siempre llegan tarde.'),
  ...L('doing', { a: ['nightout'], h: [0, 5] }, 'Intentando no pensar en la hora que es.', 'Nos vamos de aquí a un sitio donde ponen música buena.'),
  ...L('doing', { a: ['relax'] }, 'Sentarse un rato y mirar el cielo, mucha gente no lo hace.', 'Sin hacer nada, que es lo más difícil.', 'Charlando conmigo mismo, que es de lo más barato.'),
  ...L('doing', { a: ['relax'], p: ['park'] }, 'Disfrutando del parque. Es mi plan favorito.', 'Leyendo un poco y escuchando a los pájaros.'),
  ...L('doing', { a: ['tourist'] }, 'Conociendo el barrio. Todo me parece nuevo.', 'De turismo. Hago fotos hasta de los buzones.'),
  ...L('doing', { a: ['walk'] }, 'Paseando, y mirándolo todo.', 'Estirando las piernas, que se me quedan dormidas.'),
  ...L('doing', { a: ['wait'] }, 'Esperando a alguien. Llega tarde, como siempre.', 'Aquí, matando el tiempo hasta que llegue lo que sea.'),
  ...L('doing', { a: ['work'] }, 'Trabajando, aunque parezca que no.', 'De turno. Se pasa más rápido cuando hay gente.'),
  ...L('doing', { g: 'group' }, 'Dando una vuelta con estos. Nada serio.', 'De plan con los de siempre.'),
  ...L('doing', { s: ['talkative', 'friendly'] }, 'Pues estaba pensando en qué cenar, y mira, de repente apareces y me pones a charlar. Qué bien.', 'Nada importante, la verdad. Pero cuéntame tú, que parece que vas a algún sitio.'),
  ...L('doing', { s: ['dry', 'reserved'] }, 'Lo mío.', 'Nada del otro mundo.', 'Cosas.'),
  ...L('doing', { s: ['sarcastic'] }, 'Intento no destacar. Está yendo regular.', 'Disfrutando de la vida. Se me nota mucho, ¿verdad?'),
  ...L('doing', { s: ['humorous'] }, 'Soy un espía. Es mentira, pero queda bien.', 'Aquí, fingiendo que tengo todo bajo control.'),

  // ----------------------------------------------------- reacción a una broma
  ...L('joke-back', { s: ['humorous', 'sarcastic', 'energetic'] }, '¡Ja! Esa me la apunto.', 'Qué bueno, voy a usarlo luego como si fuera mío.', 'Jajaja, vale, esa ha estado bien.', 'No, no, ahora me da la risa y no puedo parar.'),
  ...L('joke-back', { s: ['friendly', 'talkative'] }, 'Jaja, ¡qué cosas dices!', 'Ay, qué bueno, ¡me has pillado con la guardia baja!', 'Me has hecho el día, en serio.'),
  ...L('joke-back', { s: ['calm', 'dry'] }, 'Ha tenido gracia.', 'Jeje. Bien jugado.', 'Esa ha sido buena, lo reconozco.'),
  ...L('joke-back', { s: ['shy', 'reserved'] }, 'Eh... jeje. Sí, qué gracioso.', 'Me he reído por dentro, ¿vale?', 'Jeje... eh, no sé qué decir.'),
  ...L('joke-back', { s: ['direct'] }, 'Casi me río. Casi.', 'Más o menos gracioso. Te doy un seis.'),
  ...L('joke-back', { m: ['hurried'] }, 'Jaja, sí, genial, pero voy tarde.', 'Muy bueno, pero ya me voy corriendo.'),
  ...L('joke-back', { m: ['down', 'tired'] }, 'Gracias por intentarlo. Hoy no es mi día, pero se agradece.', 'Una sonrisa me has sacado, y no es poco.'),
  ...L('joke-back', { r: 1 }, 'Siempre con tus cosas. Me gusta.', 'Ya estaba echando de menos tus chistes.'),

  // -------------------------------------------------- reacción a un cumplido
  ...L('compliment-back', { s: ['friendly', 'talkative', 'energetic'] }, '¡Ay, gracias! Qué detalle, me has alegrado el día.', 'Pues me lo apunto: hoy me siento más guapo que ayer.', 'Qué amable. No me lo esperaba, y se agradece mucho.'),
  ...L('compliment-back', { s: ['shy', 'reserved'] }, 'Oh... gracias. No sé qué decir.', 'Gracias, eh... bueno, pues eso.', 'Qué vergüenza... pero gracias.'),
  ...L('compliment-back', { s: ['dry', 'direct'] }, 'Gracias.', 'Lo tomo. Gracias.', 'Pues me parece bien.'),
  ...L('compliment-back', { s: ['sarcastic'] }, 'Vaya, qué sorpresa. No lo esperaba y lo voy a recordar.', 'Ya me lo decía mi espejo. Qué bien que tengáis acuerdo.'),
  ...L('compliment-back', { s: ['humorous'] }, 'Eso mismo pensaba yo, pero me da vergüenza decirlo.', 'Gracias. Voy a hacerme el sordo, que si no se me sube.'),
  ...L('compliment-back', { s: ['calm'] }, 'Gracias. Es bonito oírlo.', 'Muchas gracias. Se agradece de verdad.'),
  ...L('compliment-back', { m: ['hurried'] }, 'Gracias, ¡pero voy corriendo!', 'Qué amable. Tengo que irme, perdona.'),
  ...L('compliment-back', { r: 2 }, 'Qué bonito eso. Tú tampoco estás mal.', 'Siempre sabes cómo decirme las cosas.'),
  ...L('compliment-back', { r: 1 }, 'Gracias. Tú también tienes buena pinta.', 'Me haces sonrojar. Gracias.'),

  // -------------------------------------------------------- despedida corta
  ...L('bye-short', { end: true }, 'Venga, hasta luego.', 'Bueno, que vaya bien.', 'Nos vemos.', 'Cuídate.', 'Hasta otra.', 'Adiós.', 'Pues eso, ¡que tengas buen día!', 'Un placer. Hasta luego.', 'Bueno, voy tirando.', 'Ahí te quedas.', 'Ya nos vemos por aquí.', 'Suerte con lo tuyo.'),
  ...L('bye-short', { end: true, h: [6, 14] }, 'Que tengas buena mañana.', 'Buen día, y a por él.'),
  ...L('bye-short', { end: true, h: [14, 21] }, 'Que se te dé bien la tarde.', 'Disfruta del resto del día.'),
  ...L('bye-short', { end: true, h: [21, 5] }, 'Que descanses.', 'Buenas noches, y cuidado por ahí.', 'A dormir bien, si es que se puede.'),
  ...L('bye-short', { end: true, s: ['friendly', 'energetic'] }, '¡Hasta pronto, pasa un día genial!', '¡Un abrazo y nos vemos!', '¡Ciao! Cuídate mucho.'),
  ...L('bye-short', { end: true, s: ['dry', 'reserved', 'direct'] }, 'Ya.', 'Pues eso. Adiós.', 'Venga.'),
  ...L('bye-short', { end: true, s: ['sarcastic', 'humorous'] }, 'Ha sido un placer. Sobre todo el final.', 'Me voy antes de que me pidas dinero. Es broma.', 'Nos vemos en otra vida. O mañana.'),
  ...L('bye-short', { end: true, w: ['rain'] }, 'Que no te pille el chaparrón.', 'Resguárdate, que cae mucho.'),
  ...L('bye-short', { end: true, d: 'weekend' }, 'Que disfrutes del finde.', 'Buen fin de semana.'),
  ...L('bye-short', { end: true, m: ['hurried'] }, 'Tengo que irme. Luego hablamos.', 'Voy volando. Hasta luego.', 'Me escapo, perdona.'),
  ...L('bye-short', { end: true, m: ['tired'] }, 'Me voy a casa a ver si descanso un poco.', 'Voy a tirar, que no me aguanto.'),

  // ------------------------------------------------------- despedida larga
  ...L('bye-long', { end: true, s: ['friendly', 'talkative', 'energetic'] }, 'Oye, qué bien charlar un rato. Hay días que uno lo necesita más de lo que cree. A ver si nos cruzamos otra vez.', 'Me ha encantado hablar contigo. Si alguna vez quieres tomar algo, ya sabes dónde encontrarme.', 'Ha sido un rato muy agradable. Cuídate mucho y no te pierdas por el barrio.'),
  ...L('bye-long', { end: true, s: ['calm', 'shy'] }, 'Gracias por pararte a hablar. Se agradece más de lo que parece. Que te vaya bien.', 'Ha sido un rato tranquilo. Eso es bueno. Hasta pronto.'),
  ...L('bye-long', { end: true, r: 1 }, 'Siempre da gusto cruzarse contigo. Que no sea la última vez.', 'Venga, ya sabes dónde estoy. Pásate cuando quieras.'),
  ...L('bye-long', { end: true, r: 2 }, 'Cuando quieras charlar más tiempo, me avisas. Que seas feliz, ¿eh?', 'Eres de las pocas personas con las que me quedaría horas. Pero me toca irme. Hasta pronto.'),
  ...L('bye-long', { end: true, h: [6, 14] }, 'Voy a seguir con lo mío antes de que se me haga tarde. Que tengas un buen día, de verdad.', 'Que la mañana te sea ligera. Y si ves un café abierto, pide uno por mí.'),
  ...L('bye-long', { end: true, h: [14, 21] }, 'Voy a aprovechar lo que queda de tarde. Que se te dé bien.', 'Se nos va el día, qué pena. Pero bueno, ha sido un gusto hablar.'),
  ...L('bye-long', { end: true, h: [21, 5] }, 'Es tardísimo y mañana me va a pasar factura. Que descanses, eh.', 'Se me hace de noche hablando. Qué bien. Hasta la próxima.'),
  ...L('bye-long', { end: true, s: ['sarcastic', 'humorous'] }, 'Ha sido una charla estupenda. Mi agenda de gente interesante tiene un nombre más. Nos vemos.', 'Te dejo con tus cosas, que seguro que son más divertidas que las mías.'),
  ...L('bye-long', { end: true, d: 'weekend' }, 'Voy a seguir con mi sábado, o domingo, o lo que sea. Que lo disfrutes tú también.'),
  ...L('bye-long', { end: true, w: ['rain'] }, 'Voy a meterme en algún portal antes de que me empape. Cuídate, y no te mojes demasiado.'),
];
