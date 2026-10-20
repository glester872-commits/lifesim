import type { StoryDef } from '../systems/Story.ts';
import { ADA_STORY } from './adaStory.ts';
import { visitBeats, visitMessages, visitOpeners, visitPlans, type VisitText } from './visits.ts';

/**
 * La historia de Sara con el jugador (systems/Story): sus flags, los planes que propone, los microeventos que
 * saca al acabar una charla, lo primero que dice según lo vivido y cuándo saluda ella primero.
 *
 * Nada es lineal: cada flag abre frases (data/chatNamed.ts, etiquetas `f`/`nf`) y microeventos, y se puede
 * llegar a ellas en cualquier orden. Un plantón (sara_conflict) no cierra nada para siempre: se arregla
 * pidiendo perdón y viniendo al plan con el que lo compensas (plan 'arreglo').
 *
 * El arco del lookbook, en días distintos: le ayudas (o no) con las fotos (promesa, 'lookbook'), las hacéis en
 * el mural del Carmen (plan 'sesion'), elegís la portada (decisión que cambia lo que dice después) y lo presenta
 * en el escaparate de Retales (plan 'presentacion'); al día siguiente lo cierra según lo vivido.
 * Las rutinas que fija (plan-*, dia-gris) están en data/characters.ts.
 */

const NOT_SUNDAY = [0, 1, 2, 3, 4, 5];
const ANY_DAY = [0, 1, 2, 3, 4, 5, 6];

/** La visita a tu casa (data/visits.ts): sus palabras. */
const VISIT: VisitText = {
  routine: 'plan-visita', routineStudio: 'plan-visita-estudio', sofa: 'HOME_SOFA_02', sofaStudio: 'STUDIO_SOFA_02',
  friend: 'sara_friend', conflict: 'sara_conflict',
  ask: ['Oye, llevo semanas sin ver dónde vives. ¿Me enseñas tu casa {cuando}? Llevo yo algo de picar.'],
  yes: { label: 'Claro, ven {cuando}', reply: ['¡Bien! {cuando} en {lugar}. Voy a juzgar la decoración, que lo sepas.'] },
  no: { label: 'Esta vez no puedo', reply: ['Vale, vale. Otro día. Pero me debes una visita, ¿eh?'] },
  kept: ['¡Hola! Qué bien, tienes ventana y todo. Déjame que lo mire todo.', 'Se descalza, se sienta en el sofá y aprueba la casa en voz alta.'],
  together: {
    say: ['¿Y ahora qué hacemos? Tengo toda la tarde y cero planes.'],
    tele: ['Pues tele. Pero yo elijo.', 'Pasa por tres canales de moda y se queda en el cuarto: un concurso de costura. Hasta ahí llega la tarde.'],
    picar: ['Pues a picar. Yo traigo el queso y tú pones los platos.', 'Acabáis comiendo del mismo plato, que fregar es de otro día.'],
    casa: ['Vale, pero con calma. Quiero verlo todo: la ventana, el armario, lo que hay encima de la cama.', 'Hace de crítica de interiores durante veinte minutos. Con razón en la mitad.'],
  },
  notices: {
    sofa: ['¿Ese sofá es nuevo? Lleva la manta y todo. Aquí me quedo a leer cuando me canse.'],
    cuadro: ['El cuadro del mural del Carmen, ¡qué bonito! ¿Es el de la esquina de Retales?'],
    lampara: ['La lámpara de pie da una luz buenísima. Con esto sale cualquier foto.'],
    plain: ['Qué bien se está aquí. Se nota que es tu casa.'],
  },
  next: {
    sofa: ['Sigo pensando en ese sofá con la manta. Ojalá lo tuviera yo en mi cuarto.'],
    cuadro: ['El cuadro de tu pared se me ha quedado grabado. Tienes buen ojo.'],
    lampara: ['Ayer, con la luz de tu lámpara, estuve a punto de hacerte una foto sin avisar.'],
    plain: ['Lo de ayer en tu casa estuvo genial. Tienes que venir tú a la mía algún día.'],
    message: ['Gracias por la tarde de ayer. Tu casa es de esas que te dan ganas de quedarte. Repetimos.'],
  },
};
const VISIT_BEATS = visitBeats(VISIT);

export const SARA_STORY: StoryDef = {
  npc: 'sara',
  flags: {
    sara_met: 'Se han presentado.',
    sara_friend: 'Ya cuenta al jugador entre su gente del barrio (relación FRIEND o más).',
    sara_close_friend: 'Amistad cercana (CLOSE_FRIEND o más).',
    sara_event_01: 'Primera vez que quedan y el jugador va.',
    sara_event_02: 'Le ha enseñado los diseños de su proyecto.',
    sara_conflict: 'La dejó plantada en un plan; está dolida.',
    sara_apologized: 'Pidió perdón por el plantón y quedó en compensarlo: falta venir.',
    sara_reconciled: 'Hablaron lo del plantón e hicieron las paces viniendo al plan del arreglo.',
    sara_changed_mind: 'Canceló un plan y quiere disculparse.',
    sara_tattoo_asked: 'Le ha pedido opinión sobre la golondrina.',
    sara_tattoo: 'Se ha hecho la golondrina en la muñeca.',
    sara_lookbook_asked: 'Le pidió ayuda con las fotos del lookbook (dijera lo que dijera).',
    sara_shoot: 'Hicieron juntos las fotos del lookbook en el mural del Carmen.',
    sara_cover: 'Eligieron la portada del lookbook.',
    sara_presentation_asked: 'Le invitó a la presentación del lookbook en Retales.',
    sara_presented: 'Fue a la presentación del lookbook.',
    sara_arc_done: 'El arco del lookbook se cerró.',
  },
  baseMood: 64,
  metFlag: 'sara_met',
  friendFlag: 'sara_friend',
  greyRoutine: 'dia-gris',
  greyBelow: 32,
  // Dolida, uno de cada dos días no tiene ganas de salir.
  greyFlag: { flag: 'sara_conflict', chance: 0.5 },
  plans: {
    terraza: {
      routine: 'plan-terraza', point: 'CAFE_TERRACE_01', from: '20:00', until: '21:30', place: 'la terraza del Pausa', outdoor: true, days: NOT_SUNDAY,
      ask: '¿Te vienes {cuando} a la terraza del Pausa? Un café, o lo que surja.',
    },
    carmen: {
      routine: 'plan-carmen', point: 'MOLINILLO_TERRACE_01', from: '11:30', until: '12:25', place: 'el Molinillo', days: [2, 5],
      ask: 'Oye, {cuando} hago brunch en el Molinillo y luego paso por Retales. ¿Te apuntas?',
    },
    plaza: {
      routine: 'plan-plaza', point: 'PLAZA_BENCH_03', from: '19:30', until: '21:00', place: 'la plaza', outdoor: true, days: ANY_DAY,
      ask: '¿Nos vemos {cuando} en la plaza? En el banco de siempre.',
    },
    // El arreglo de un plantón: lo propones tú al pedir perdón. Venir es lo que lo arregla.
    arreglo: {
      routine: 'plan-carmen', point: 'MOLINILLO_TERRACE_01', from: '11:30', until: '12:25', place: 'el Molinillo', days: [2, 5],
      kept: {
        say: ['Has venido. Vale. Siéntate, que pides tú, que era el trato.', 'Habláis de todo menos del plantón. Al rato se ríe como antes.'],
        then: { set: ['sara_reconciled'], clear: ['sara_conflict', 'sara_apologized'], social: { trust: 8, friendship: 3, mood: 8 }, mood: 18, event: 'reconciliacion' },
      },
      missed: { set: ['sara_conflict'], clear: ['sara_apologized', 'sara_reconciled'], social: { trust: -12, friendship: -4, mood: -12 }, mood: -24, event: 'planton' },
    },
    ...visitPlans(VISIT),
    // El arco del lookbook.
    sesion: {
      routine: 'plan-sesion', point: 'CARMEN_PHOTO_01', from: '18:00', until: '19:30', place: 'el mural del Carmen', outdoor: true, days: NOT_SUNDAY,
      kept: {
        say: ['¡Has venido! Ponte aquí, con el reflector hacia mí. Más. Menos. ¡Ahí!', 'Una hora después hay cuarenta fotos y una que es la buena. Bueno, dos.'],
        then: { set: ['sara_shoot', 'sara_event_01'], social: { friendship: 6, trust: 6, mood: 6 }, mood: 14, event: 'sesion-fotos' },
      },
    },
    presentacion: {
      routine: 'plan-presentacion', point: 'RETALES_WINDOW', from: '19:00', until: '20:30', place: 'el escaparate de Retales', outdoor: true, days: [3, 4, 5],
      kept: {
        say: ['¡Has venido! Mira: el escaparate entero. Gus ha puesto hasta luces.', 'Pasa gente, se para, mira. Sara no dice nada, pero te aprieta el brazo.'],
        then: { set: ['sara_presented'], social: { friendship: 6, trust: 4, mood: 6 }, mood: 16, event: 'presentacion' },
      },
      missed: { set: ['sara_conflict'], clear: ['sara_reconciled', 'sara_apologized'], social: { trust: -10, friendship: -4, mood: -12 }, mood: -28, event: 'planton', decision: ['presentacion', 'falto'] },
    },
  },
  invite: {
    // Sólo a quien ya es de su gente, sin un plan pendiente ni un enfado de por medio, y no todos los días.
    when: { flags: ['sara_friend'], notFlags: ['sara_conflict'], plan: 'none', cooldown: 3, chance: 0.55 },
    say: ['Por cierto...'],
    accept: { label: 'Vale, allí estaré', reply: ['¡Hecho! {cuando} en {lugar}. No me falles, ¿eh?'], then: { social: { friendship: 2, trust: 1 }, mood: 4, event: 'invitacion-aceptada' } },
    decline: { label: 'Esta vez no puedo', reply: ['Vaya. Bueno, otro día. Tú te lo pierdes.'], then: { social: { mood: -2 }, mood: -3, event: 'invitacion-rechazada' } },
  },
  beats: [
    {
      // Al acabar la primera charla de verdad: se presenta.
      id: 'presentacion', once: true, when: { notFlags: ['sara_met'] },
      say: ['Por cierto, ni me he presentado: Sara. Vivo en la Calle Mayor, me vas a ver por aquí a todas horas.'],
      then: { set: ['sara_met'], event: 'conocerse' },
    },
    {
      // Lo del plantón: lo saca ella. Perdón con algo que hacer (venir al arreglo), sólo perdón, o nada.
      id: 'reconciliar', when: { flags: ['sara_conflict'], notFlags: ['sara_apologized'], cooldown: 1 },
      say: ['...Oye. Lo de {lugar}. Te estuve esperando, ¿sabes?'],
      choices: [
        {
          label: 'Pedirle perdón y proponer compensarlo',
          plan: 'arreglo',
          reply: ['Vale. Gracias por decirlo. Pues {cuando} me invitas a un café en el Molinillo, y esta vez vienes.'],
          then: { set: ['sara_apologized'], social: { trust: 2, mood: 4 }, mood: 6, event: 'perdon', decision: ['planton', 'perdon'] },
        },
        {
          label: 'Pedirle perdón, sin más',
          reply: ['Vale. Te creo. Pero lo que me dolió fue esperar sola, y eso se arregla viniendo, no diciéndolo.'],
          then: { social: { trust: 1 }, mood: 2, decision: ['planton', 'solo-perdon'] },
        },
        {
          label: 'Quitarle importancia',
          reply: ['Ya. Para ti no era para tanto. Entendido.'],
          then: { social: { trust: -5, mood: -6 }, mood: -8, event: 'discusion', decision: ['planton', 'sin-perdon'] },
        },
      ],
    },
    {
      // Canceló ella: se disculpa la siguiente vez.
      id: 'disculpa', when: { flags: ['sara_changed_mind'] },
      say: ['Perdona por cancelar lo de {lugar}. No tenía el día y no quería ir de mala gana. Te debo una.'],
      then: { clear: ['sara_changed_mind'], social: { trust: 2 }, event: 'disculpa' },
    },
    VISIT_BEATS.share,
    {
      // Te da su número; si ya lo tienes (os lo disteis antes), no vuelve a dártelo.
      id: 'amistad', once: true, when: { minState: 'FRIEND', notFlags: ['sara_friend'], contact: false },
      say: ['Oye, ¿sabes qué? Me caes muy bien. Ya eres de mi gente del barrio, que lo sepas. Toma, apúntate mi número.'],
      then: { set: ['sara_friend'], mood: 5, event: 'amistad', contact: 'te dio su número: ya eres de su gente' },
    },
    {
      id: 'amistad-con-numero', once: true, when: { minState: 'FRIEND', notFlags: ['sara_friend'], contact: true },
      say: ['Oye, ¿sabes qué? Me caes muy bien. Ya eres de mi gente del barrio, que lo sepas. Escríbeme más, que para algo tienes mi número.'],
      then: { set: ['sara_friend'], mood: 5, event: 'amistad' },
    },
    // ------------------------------------------------------------- el arco del lookbook
    {
      // El cierre, al día siguiente de la presentación: lo que dice depende de la portada que elegisteis.
      id: 'cierre-mural', once: true, phone: true,
      when: { flags: ['sara_presented'], notFlags: ['sara_arc_done', 'sara_conflict'], since: { flag: 'sara_presented', days: 1 }, decision: ['portada', 'mural'] },
      say: ['Gus dice que la portada del mural es lo que más para a la gente. La elegiste tú. Esto lo hemos hecho entre los dos, que lo sepas.'],
      then: { set: ['sara_arc_done'], social: { trust: 3, friendship: 3 }, mood: 8, event: 'cierre' },
    },
    {
      id: 'cierre-bici', once: true, phone: true,
      when: { flags: ['sara_presented'], notFlags: ['sara_arc_done', 'sara_conflict'], since: { flag: 'sara_presented', days: 1 }, decision: ['portada', 'bici'] },
      say: ['Una chica entró en Retales preguntando por «la de la bici». ¡La portada que elegiste! Me han encargado dos chaquetas. Esto empieza contigo.'],
      then: { set: ['sara_arc_done'], social: { trust: 3, friendship: 3 }, mood: 10, event: 'cierre' },
    },
    {
      // Sin vuestras fotos (le dijiste que no) también se cierra, sin rencor y con menos.
      id: 'cierre-sin-fotos', once: true, phone: true,
      when: { flags: ['sara_presented'], notFlags: ['sara_arc_done', 'sara_conflict', 'sara_shoot'], since: { flag: 'sara_presented', days: 1 } },
      say: ['Gracias por venir a Retales. Las fotos de Ada salieron torcidas, pero la gente miraba las chaquetas. Ya está hecho. La próxima, me las haces tú.'],
      then: { set: ['sara_arc_done'], social: { friendship: 2 }, mood: 6, event: 'cierre' },
    },
    {
      // Si dijiste que no a la presentación, o faltaste y ya lo habéis arreglado: se cierra igual, con menos.
      id: 'cierre-sin-ir', once: true, phone: true,
      when: { flags: ['sara_presentation_asked'], notFlags: ['sara_arc_done', 'sara_conflict', 'sara_presented'], since: { flag: 'sara_presentation_asked', days: 3 }, plan: 'none' },
      say: ['Lo de Retales salió bien, por cierto. Gus va a dejar el lookbook un mes más. Pásate a verlo cuando quieras.'],
      then: { set: ['sara_arc_done'], event: 'cierre' },
    },
    {
      // Decisión que cambia lo que dice después (el cierre y sus frases).
      id: 'portada', once: true, when: { flags: ['sara_shoot'], notFlags: ['sara_cover'] },
      say: ['Tengo que elegir la portada. ¿La del mural, seria, con la luz de la tarde, o la de la bici que pasó justo por detrás?'],
      choices: [
        { label: 'La del mural', reply: ['La del mural. Limpia. Sí. Me la quedo.'], then: { set: ['sara_cover'], decision: ['portada', 'mural'], mood: 3, event: 'portada' } },
        { label: 'La de la bici', reply: ['La de la bici. Es un accidente, pero es la que tiene vida. Hecho.'], then: { set: ['sara_cover'], decision: ['portada', 'bici'], mood: 3, event: 'portada' } },
      ],
    },
    {
      // Hito 1: la promesa. Puede llegar por el móvil.
      id: 'lookbook', once: true, phone: true, offer: 'sesion',
      when: { flags: ['sara_friend'], notFlags: ['sara_lookbook_asked', 'sara_conflict'], since: { flag: 'sara_friend', days: 1 } },
      say: ['Te tengo que pedir un favor. Gus me deja presentar el lookbook en el escaparate de Retales y me faltan las fotos. ¿Me ayudas {cuando} en el mural del Carmen? Tú sujetas el reflector y me dices si salgo rara.'],
      choices: [
        { label: 'Cuenta conmigo', reply: ['¡Gracias! {cuando}, en {lugar}. Trae paciencia.'], then: { set: ['sara_lookbook_asked'], social: { trust: 2 }, mood: 4, event: 'promesa', decision: ['lookbook', 'si'] } },
        { label: 'Esta vez no puedo', reply: ['Vale, no pasa nada. Se lo pido a Ada; encuadra torcido, pero es gratis.'], then: { set: ['sara_lookbook_asked'], mood: -3, event: 'promesa-rechazada', decision: ['lookbook', 'no'] } },
      ],
    },
    {
      // Dijiste que sí y la sesión no salió (lluvia sin pasar, plantón ya arreglado): lo vuelve a proponer.
      id: 'lookbook-otra', phone: true, offer: 'sesion',
      when: { flags: ['sara_lookbook_asked'], notFlags: ['sara_shoot', 'sara_conflict', 'sara_presentation_asked'], decision: ['lookbook', 'si'], since: { flag: 'sara_lookbook_asked', days: 2 }, cooldown: 3 },
      say: ['Las fotos del lookbook siguen sin hacer. ¿Lo intentamos {cuando} en el mural?'],
      choices: [
        { label: 'Vale, allí estaré', reply: ['¡Bien! {cuando}. Esta vez sí.'], then: { event: 'promesa' } },
        { label: 'Ahora no puedo', reply: ['Vale. Se lo pido a Ada, que remedio.'], then: { decision: ['lookbook', 'no'], mood: -2 } },
      ],
    },
    {
      // Hito 3: la presentación. Con vuestras fotos, o sin ellas.
      id: 'presentacion-invita', once: true, phone: true, offer: 'presentacion',
      when: { flags: ['sara_cover'], notFlags: ['sara_presentation_asked', 'sara_conflict'], since: { flag: 'sara_cover', days: 1 } },
      say: ['¡Lo presento! {cuando} en {lugar}, con TU portada. ¿Vienes? Tienes que venir.'],
      choices: [
        { label: 'No me lo pierdo', reply: ['¡Bien! {cuando}. Sales en los agradecimientos, que lo sepas.'], then: { set: ['sara_presentation_asked'], mood: 5, event: 'promesa', decision: ['presentacion', 'si'] } },
        { label: 'No voy a poder', reply: ['Ah. Vale. Bueno... ya te enseñaré cómo queda.'], then: { set: ['sara_presentation_asked'], social: { mood: -3 }, mood: -6, decision: ['presentacion', 'no'] } },
      ],
    },
    {
      id: 'presentacion-sin-fotos', once: true, phone: true, offer: 'presentacion',
      when: { flags: ['sara_lookbook_asked'], notFlags: ['sara_presentation_asked', 'sara_conflict', 'sara_shoot'], decision: ['lookbook', 'no'], since: { flag: 'sara_lookbook_asked', days: 2 } },
      say: ['Al final las fotos las hizo Ada. Lo presento {cuando} en {lugar}. ¿Vienes, aunque sea a mirar?'],
      choices: [
        { label: 'Allí estaré', reply: ['¿Sí? Qué bien. {cuando}, delante del escaparate.'], then: { set: ['sara_presentation_asked'], mood: 4, event: 'promesa', decision: ['presentacion', 'si'] } },
        { label: 'No voy a poder', reply: ['Vale. Ya te contaré.'], then: { set: ['sara_presentation_asked'], mood: -3, decision: ['presentacion', 'no'] } },
      ],
    },
    // ------------------------------------------------------------------------------------
    {
      id: 'cercania', once: true, when: { minState: 'CLOSE_FRIEND', flags: ['sara_friend'], notFlags: ['sara_close_friend'] },
      say: ['Contigo hablo de cosas que no le cuento a casi nadie. Ni a Ada, y eso es mucho decir.'],
      then: { set: ['sara_close_friend'], mood: 6, event: 'cercania' },
    },
    {
      id: 'disenos', once: true, when: { flags: ['sara_close_friend'], notFlags: ['sara_event_02', 'sara_conflict'] },
      say: ['¿Te enseño una cosa? Los diseños del proyecto. No se los he enseñado a casi nadie.'],
      choices: [
        {
          label: 'Enséñamelos',
          reply: ['Mira: chaquetas de mi abuela, deshechas y vueltas a coser con lo de ahora. ¿Ves? ... Gracias. De verdad.'],
          then: { set: ['sara_event_02'], social: { trust: 8, friendship: 4 }, mood: 10, event: 'disenos', decision: ['disenos', 'visto'] },
        },
        {
          label: 'Otro día',
          reply: ['Vale, vale. Cuando quieras. Pero no te lo ofrezco mil veces, ¿eh?'],
          then: { mood: -3, decision: ['disenos', 'otro-dia'] },
        },
      ],
    },
    {
      // La golondrina: le pide opinión y lo que digas cuenta (Tinta, data/characters.ts 'sabado-carmen').
      id: 'tatuaje', once: true, when: { flags: ['sara_friend'], notFlags: ['sara_tattoo_asked', 'sara_conflict'], chance: 0.5 },
      say: ['Pregunta seria: ¿me hago la golondrina en la muñeca? Lía dice que me lo piense. Llevo tres meses pensándolo.'],
      choices: [
        { label: 'Hazlo', reply: ['¡Vale! Si me arrepiento, te echo la culpa a ti.'], then: { set: ['sara_tattoo_asked', 'sara_tattoo'], mood: 8, event: 'tatuaje', decision: ['tatuaje', 'si'] } },
        { label: 'Espera un poco', reply: ['Ya... Igual tenéis razón. Un mes más. Otro.'], then: { set: ['sara_tattoo_asked'], decision: ['tatuaje', 'no'] } },
      ],
    },
    ...VISIT_BEATS.invite,
  ],
  openers: [
    // Dolida: seca, y luego lo saca (beat 'reconciliar'). Si ya pediste perdón, espera a que vengas.
    { when: { flags: ['sara_conflict', 'sara_apologized'] }, text: ['Hola. Lo del Molinillo sigue en pie, ¿eh?', 'Ah, hola. Te espero en el Molinillo, como dijimos.'] },
    { when: { flags: ['sara_conflict'] }, text: ['Ah. Hola.', 'Hola. Ando liada.', 'Ah, eres tú.'] },
    ...visitOpeners(VISIT),
    { when: { recent: { event: 'plan-lluvia', days: 0 } }, text: ['Qué rabia de lluvia. Lo de {lugar}, otro día; no es culpa de nadie.'] },
    { when: { planIn: 0 }, text: ['¡Hoy a las {hora} en {lugar}! No te olvides.', 'Lo de hoy en {lugar} sigue en pie, ¿eh? A las {hora}.'] },
    { when: { planIn: 1 }, text: ['Mañana a las {hora} en {lugar}. Lo tengo apuntado.', 'Lo de mañana en {lugar}, ¿sigue? Yo voy seguro.'] },
    { when: { flags: ['sara_changed_mind'] }, text: ['Uf, lo del plan... ahora te cuento.'] },
    // El día siguiente de lo vivido juntos: lo reconoce en persona (o te lo escribe, `messages`).
    { when: { ago: { event: 'sesion-fotos', days: 1 } }, text: ['Ayer hicimos las mejores fotos de mi vida. No exagero. Bueno, un poco.'] },
    { when: { ago: { event: 'presentacion', days: 1 } }, text: ['Todavía me tiemblan las piernas de ayer. Gracias por estar.'] },
    { when: { flags: ['sara_arc_done'], decision: ['portada', 'mural'], chance: 0.5 }, text: ['Cada vez que paso por Retales miro la portada del mural. Elegiste bien.'] },
    { when: { flags: ['sara_arc_done'], decision: ['portada', 'bici'], chance: 0.5 }, text: ['La de la bici sigue en el escaparate. Gus dice que la gente se para a mirarla.'] },
    { when: { flags: ['sara_arc_done'], decision: ['lookbook', 'no'], chance: 0.4 }, text: ['La próxima colección me la fotografías tú. Ada ya se ha jubilado.'] },
    { when: { recent: { event: 'plan-cumplido', days: 2 } }, text: ['Lo del otro día en {lugar} estuvo genial. Hay que repetir.', 'Sigo pensando en lo bien que se estaba en {lugar}.'] },
    { when: { recent: { event: 'reconciliacion', days: 3 } }, text: ['Me alegro de que lo habláramos, ¿eh? Y de que vinieras. En serio.'] },
    { when: { flags: ['sara_tattoo'], recent: { event: 'tatuaje', days: 4 } }, text: ['¡Mira la muñeca! Me la hice. Si queda mal, es culpa tuya.'] },
    { when: { recent: { event: 'dia-gris', days: 0 } }, text: ['Hoy no es mi día, perdona si estoy rara.'] },
    { when: { flags: ['sara_met'], recent: { event: 'charla', days: 1 }, chance: 0.5 }, text: ['¡Otra vez tú! La última vez fue en {sitio}.', 'Al final te voy a ver más que a Ada. Hace nada en {sitio} y ahora aquí.'] },
  ],
  hello: {
    distance: 4,
    options: [
      { when: { flags: ['sara_arc_done'], notFlags: ['sara_conflict'], chance: 0.7 }, lines: ['¡Mi fotógrafo de confianza! Ven, ven.', '¡Eh! Justo hablaba de ti con Gus.'] },
      { when: { flags: ['sara_friend'], notFlags: ['sara_conflict'], chance: 0.7 }, lines: ['¡Eh! ¿Tú por aquí? Ven, que te cuento una cosa.', '¡Mira quién anda por aquí! ¿Tienes un minuto?', '¡Ey! Justo pensaba en ti. Bueno, en un outfit, pero también en ti.'] },
      { when: { flags: ['sara_met'], notFlags: ['sara_conflict', 'sara_friend'], chance: 0.4 }, lines: ['¡Hola! Tú eres quien me encontré el otro día, ¿no?', 'Ey, ¡hola! Te he visto de lejos.'] },
    ],
  },
  kept: {
    say: ['¡Has venido! Pensaba que se te olvidaba.', 'Ven, ven. Te he guardado sitio.'],
    then: { set: ['sara_event_01'], social: { friendship: 5, trust: 6, mood: 6 }, mood: 12, event: 'plan-cumplido' },
  },
  missed: { set: ['sara_conflict'], clear: ['sara_reconciled', 'sara_apologized'], social: { trust: -10, friendship: -4, mood: -12 }, mood: -28, event: 'planton' },
  cancelled: { set: ['sara_changed_mind'], mood: -4, event: 'cancela-plan' },
  rain: {
    say: ['Está lloviendo a mares: lo de {lugar} mejor otro día, que no es culpa de nadie. ¿Lo pasamos a {cuando}?'],
    accept: { label: 'Vale, {cuando}', reply: ['Hecho. {cuando} en {lugar}. Y que no llueva.'] },
    decline: { label: 'Mejor lo dejamos', reply: ['Vale, sin problema. Ya buscaremos otro hueco.'] },
  },
  // El seguimiento del día siguiente, por el móvil (en persona lo dice el opener `ago`).
  messages: [
    { id: 'sesion', when: { ago: { event: 'sesion-fotos', days: 1 } }, text: ['Estoy editando las fotos de ayer y no me lo creo. Gracias por venir de verdad.'] },
    { id: 'reconciliacion', when: { ago: { event: 'reconciliacion', days: 1 } }, text: ['Lo de ayer en el Molinillo me sentó bien. Gracias por venir.'] },
    // Un plan de los de siempre que salió bien (también los quedados por el móvil, WorldScene.bridgePlans).
    { id: 'plan', when: { ago: { event: 'plan-cumplido', days: 1 } }, text: ['Lo de ayer en {lugar} estuvo genial. ¿Repetimos un día de estos?'] },
    ...visitMessages(VISIT),
  ],
};

/** Las historias por personaje: uno nuevo con historia es una entrada más. */
export const STORIES: Readonly<Record<string, StoryDef>> = { sara: SARA_STORY, ada: ADA_STORY };
