import type { StoryDef } from '../systems/Story.ts';

/**
 * La historia de Amaia con el jugador (systems/Story). Amaia Etxeberria, 37, programadora en remoto; reservada,
 * de pocas palabras y mucha pantalla. Su arco es la entrega de un proyecto, en días distintos: te pide que la
 * acompañes a desconectar al banco del parque (plan 'paseo'), que pruebes su app antes de entregarla (plan
 * 'prueba', en el Pausa), te pregunta si entrega ya o pide una semana más (decisión) y unos días después te
 * cuenta cómo salió (cierre). Si entregó ya, el cliente renueva y sus invitaciones incluyen la plaza del sábado
 * (plan 'plaza', `requires`); si pidió la semana, no.
 *
 * Un plantón se arregla repitiendo el paseo ('paseo-arreglo'). Sin romance en el arco: su orientación
 * (data/namedPeople.ts) decide eso en systems/Social, no aquí. Sin dinero: Effect no lo tiene.
 * Las rutinas que fija (plan-*, amaia-dia-gris) están en data/characters.ts.
 */

const WEEKDAYS = [0, 1, 2, 3, 4];

export const AMAIA_STORY: StoryDef = {
  npc: 'amaia',
  flags: {
    amaia_met: 'Se han presentado.',
    amaia_friend: 'Le cuenta entre su gente (relación FRIEND o más).',
    amaia_paseo_asked: 'Quedó en acompañarla a desconectar al parque (aceptó).',
    amaia_paseo_declined: 'Le dijo que no podía acompañarla al parque.',
    amaia_paseo_done: 'Desconectaron juntos en el banco del parque.',
    amaia_prueba_done: 'Probó su app en el Pausa antes de la entrega.',
    amaia_entrega_ya: 'Le aconsejó entregar ya, con un par de fallos.',
    amaia_entrega_prorroga: 'Le aconsejó pedir una semana más.',
    amaia_entrega_decided: 'Le dijo qué hacer con la entrega.',
    amaia_cliente: 'Entregó a tiempo y el cliente renovó: la plaza entra en sus planes.',
    amaia_conflict: 'La dejó plantada; está dolida.',
    amaia_apologized: 'Pidió perdón y quedó en repetir el paseo: falta venir.',
    amaia_reconciled: 'Hicieron las paces viniendo al paseo del arreglo.',
    amaia_changed_mind: 'Canceló un plan y quiere disculparse.',
    amaia_arc_done: 'El arco de la entrega se cerró.',
  },
  baseMood: 58,
  metFlag: 'amaia_met',
  friendFlag: 'amaia_friend',
  greyRoutine: 'amaia-dia-gris',
  greyBelow: 30,
  greyFlag: { flag: 'amaia_conflict', chance: 0.35 },
  plans: {
    // El plan de siempre: lo que propone suelta y donde caen los planes quedados por el móvil.
    banco: {
      routine: 'plan-paseo', point: 'PARK_BENCH_04', from: '19:00', until: '20:30', place: 'el banco del parque', outdoor: true, days: WEEKDAYS,
      ask: '¿Bajas {cuando} al banco del parque? Yo llevo el termo; tú, conversación que no sea de trabajo.',
    },
    // Sólo si entregó a tiempo y el cliente renovó.
    plaza: {
      routine: 'plan-plaza', point: 'PLAZA_BENCH_07', from: '11:00', until: '12:30', place: 'el banco de la plaza', outdoor: true, days: [5],
      ask: 'Te debo una comida. Empezamos por un rato de plaza {cuando}, ¿te parece?',
      requires: { flags: ['amaia_cliente'] },
    },
    // El arco de la entrega.
    paseo: {
      routine: 'plan-paseo', point: 'PARK_BENCH_04', from: '19:00', until: '20:30', place: 'el banco del parque', outdoor: true, days: WEEKDAYS,
      kept: {
        say: ['Has venido. Me he dejado el móvil en casa. A propósito.', 'Hora y media de banco sin hablar de trabajo. Al final, Amaia se ríe de algo que no tiene gracia.'],
        then: { set: ['amaia_paseo_done'], social: { friendship: 5, trust: 3 }, mood: 12, event: 'paseo' },
      },
    },
    prueba: {
      routine: 'plan-prueba', point: 'CAFE_TABLE_03', from: '10:00', until: '11:30', place: 'el Pausa', days: WEEKDAYS,
      kept: {
        say: ['Toma, el portátil. Rómpela. En serio: si tú la rompes, no la rompe el cliente.', 'En una hora encontráis tres fallos. Amaia los apunta en una servilleta, muy seria.'],
        then: { set: ['amaia_prueba_done'], social: { trust: 6 }, mood: 8, event: 'prueba' },
      },
    },
    // El arreglo de un plantón: repetir el paseo. Venir es lo que lo arregla.
    'paseo-arreglo': {
      routine: 'plan-paseo', point: 'PARK_BENCH_04', from: '19:00', until: '20:30', place: 'el banco del parque', outdoor: true, days: WEEKDAYS,
      kept: {
        say: ['Has venido. Vale.', 'No habla del otro día. Al rato, apoya el termo entre los dos y te ofrece la tapa.'],
        then: { set: ['amaia_reconciled'], clear: ['amaia_conflict', 'amaia_apologized'], social: { trust: 8, friendship: 3, mood: 8 }, mood: 16, event: 'reconciliacion' },
      },
      missed: { set: ['amaia_conflict'], clear: ['amaia_apologized', 'amaia_reconciled'], social: { trust: -12, friendship: -4, mood: -10 }, mood: -22, event: 'planton' },
    },
  },
  invite: {
    when: { flags: ['amaia_friend'], notFlags: ['amaia_conflict'], plan: 'none', cooldown: 4, chance: 0.45 },
    say: ['Oye, una cosa.'],
    accept: { label: 'Vale, allí estaré', reply: ['Bien: {cuando}, en {lugar}. Me reconocerás: seré la de los cascos.'], then: { social: { friendship: 2, trust: 1 }, mood: 3, event: 'invitacion-aceptada' } },
    decline: { label: 'Esta vez no', reply: ['Vale. Sin problema.'], then: { social: { mood: -1 }, mood: -2, event: 'invitacion-rechazada' } },
  },
  beats: [
    {
      id: 'presentacion', once: true, when: { notFlags: ['amaia_met'] },
      say: ['Amaia. Trabajo desde casa, o desde el Pausa, que es mi otra casa. Si no contesto rápido es que estoy compilando.'],
      then: { set: ['amaia_met'], event: 'conocerse' },
    },
    {
      // El plantón: disculpa con algo que hacer (repetir el paseo) o una excusa que no arregla nada.
      id: 'reconciliar', when: { flags: ['amaia_conflict'], notFlags: ['amaia_apologized'], cooldown: 1 },
      say: ['Te estuve esperando en {lugar}. Hora y media. Cerré el portátil para eso.'],
      choices: [
        {
          label: 'Disculparte y ofrecerte a repetirlo',
          plan: 'paseo-arreglo',
          reply: ['Vale. {cuando}, mismo banco. Si vienes, aquí no ha pasado nada.'],
          then: { set: ['amaia_apologized'], social: { trust: 2, mood: 4 }, mood: 5, event: 'perdon', decision: ['planton', 'repetir'] },
        },
        {
          label: 'Decir que se te olvidó',
          reply: ['Ya. Pues apúntatelo. Yo lo tenía en el calendario.'],
          then: { social: { trust: -3, mood: -3 }, mood: -4, decision: ['planton', 'excusa'] },
        },
      ],
    },
    {
      id: 'disculpa', when: { flags: ['amaia_changed_mind'] },
      say: ['Perdona lo de {lugar}. No tenía el día. Me quedé mirando la pantalla sin escribir nada.'],
      then: { clear: ['amaia_changed_mind'], social: { trust: 2 }, event: 'disculpa' },
    },
    {
      // Te da su número; si ya lo tienes, no vuelve a dártelo (ni se vuelve a presentar).
      id: 'amistad', once: true, when: { minState: 'FRIEND', notFlags: ['amaia_friend'], contact: false },
      say: ['Hablo con poca gente que no esté en una videollamada. Contigo, sí. Toma mi número; escribo mejor que hablo.'],
      then: { set: ['amaia_friend'], mood: 5, event: 'amistad', contact: 'te dio su número: escribe mejor que habla' },
    },
    {
      id: 'amistad-con-numero', once: true, when: { minState: 'FRIEND', notFlags: ['amaia_friend'], contact: true },
      say: ['Hablo con poca gente que no esté en una videollamada. Contigo, sí. Ya tienes mi número: escríbeme, que contesto.'],
      then: { set: ['amaia_friend'], mood: 5, event: 'amistad' },
    },
    // ------------------------------------------------------------------- el arco de la entrega
    {
      // El cierre, dos días después de decidir: lo que pasó depende de lo que le dijiste.
      id: 'cierre-ya', once: true, phone: true,
      when: { flags: ['amaia_entrega_ya'], notFlags: ['amaia_arc_done', 'amaia_conflict'], since: { flag: 'amaia_entrega_decided', days: 2 }, decision: ['entrega', 'ya'] },
      say: ['Entregado. El cliente ha encontrado un fallo, pero ha renovado. Te debo una comida.'],
      then: { set: ['amaia_arc_done', 'amaia_cliente'], social: { trust: 4, friendship: 3 }, mood: 15, event: 'cierre' },
    },
    {
      id: 'cierre-prorroga', once: true, phone: true,
      when: { flags: ['amaia_entrega_prorroga'], notFlags: ['amaia_arc_done', 'amaia_conflict'], since: { flag: 'amaia_entrega_decided', days: 2 }, decision: ['entrega', 'prorroga'] },
      say: ['Pedí la semana. Dormí nueve horas. El proyecto sale mejor y yo también.'],
      then: { set: ['amaia_arc_done'], social: { trust: 5 }, mood: 8, event: 'cierre' },
    },
    {
      // Si nunca pudiste acompañarla: entrega sola, sin desconectar. Sin reproches, con consecuencias.
      id: 'resultado-sola', once: true, phone: true,
      when: { flags: ['amaia_paseo_declined'], notFlags: ['amaia_arc_done', 'amaia_paseo_asked', 'amaia_conflict'], since: { flag: 'amaia_paseo_declined', days: 7 } },
      say: ['Entregué. Sin dormir y sin que nadie la probara. Dos fallos el primer día. Los arreglo yo, como siempre. No es culpa tuya.'],
      then: { set: ['amaia_arc_done'], mood: -6, event: 'cierre' },
    },
    {
      // Decisión que cambia cómo acaba (el cierre, sus planes y lo que dice después).
      id: 'entrega', once: true, when: { flags: ['amaia_prueba_done'], notFlags: ['amaia_entrega_decided', 'amaia_conflict'] },
      say: ['Lo de tus tres fallos... ¿Entrego ya con un par de fallos o pido una semana más?'],
      choices: [
        { label: 'Entrega ya, los arreglas después', reply: ['Vale. Entrego. Si explota, te llamo a ti primero.'], then: { set: ['amaia_entrega_ya', 'amaia_entrega_decided'], decision: ['entrega', 'ya'], mood: 4, event: 'decision-entrega' } },
        { label: 'Pide la semana, sin prisa', reply: ['...Nunca pido prórrogas. Igual por eso estoy así. Vale.'], then: { set: ['amaia_entrega_prorroga', 'amaia_entrega_decided'], decision: ['entrega', 'prorroga'], mood: 2, event: 'decision-entrega' } },
      ],
    },
    {
      // Hito 1: la promesa. Puede llegar por el móvil.
      id: 'desconexion', once: true, phone: true, offer: 'paseo',
      when: { flags: ['amaia_friend'], notFlags: ['amaia_paseo_asked', 'amaia_paseo_declined', 'amaia_conflict'], since: { flag: 'amaia_friend', days: 1 } },
      say: ['Llevo tres semanas sin salir de la pantalla. ¿Me acompañas {cuando} al banco del parque? Sólo a desconectar.'],
      choices: [
        { label: 'Claro, allí estaré', reply: ['Bien. {cuando}, en {lugar}. Llevo el termo.'], then: { set: ['amaia_paseo_asked'], social: { trust: 2 }, mood: 4, event: 'promesa', decision: ['desconexion', 'si'] } },
        { label: 'No puedo, lo siento', reply: ['Vale. Me lo apunto como tarea pendiente. Desconectar, digo.'], then: { set: ['amaia_paseo_declined'], mood: -3, event: 'promesa-rechazada', decision: ['desconexion', 'no'] } },
      ],
    },
    {
      // Hito 2: probar la app antes de entregarla, un día después del paseo.
      id: 'prueba', once: true, phone: true, offer: 'prueba',
      when: { flags: ['amaia_paseo_done'], notFlags: ['amaia_prueba_done', 'amaia_conflict'], since: { flag: 'amaia_paseo_done', days: 1 } },
      say: ['Entrego la app la semana que viene y nadie la ha tocado aparte de mí. ¿Me la pruebas {cuando} en {lugar}? Invito al café.'],
      choices: [
        { label: 'Claro, allí estaré', reply: ['Bien. {cuando} en {lugar}. Ven con ganas de romper cosas.'], then: { social: { trust: 2 }, mood: 3, event: 'promesa', decision: ['prueba', 'si'] } },
        { label: 'No puedo, lo siento', reply: ['Vale. Ya buscaré otro hueco.'], then: { mood: -2, decision: ['prueba', 'no'] } },
      ],
    },
    {
      // Quedasteis para el paseo y no salió (lluvia sin pasar a otro día, o un arreglo): lo vuelve a proponer.
      id: 'desconexion-pasar', phone: true, offer: 'paseo',
      when: { flags: ['amaia_paseo_asked'], notFlags: ['amaia_paseo_done', 'amaia_conflict'], since: { flag: 'amaia_paseo_asked', days: 2 }, cooldown: 3 },
      say: ['¿Bajamos {cuando} al banco? Sigo sin desconectar.'],
      choices: [
        { label: 'Vale, allí estaré', reply: ['Bien. {cuando}.'], then: { event: 'promesa' } },
        { label: 'Otro día', reply: ['Vale.'], then: { mood: -1 } },
      ],
    },
    {
      // La prueba sin hacer (dijiste que no, o se quedó en un plantón): lo vuelve a proponer.
      id: 'prueba-pasar', phone: true, offer: 'prueba',
      when: { flags: ['amaia_paseo_done'], notFlags: ['amaia_prueba_done', 'amaia_conflict'], since: { flag: 'amaia_paseo_done', days: 3 }, cooldown: 3 },
      say: ['La app sigue sin probar. ¿{cuando} en {lugar}? Una hora, nada más.'],
      choices: [
        { label: 'Vale, allí estaré', reply: ['Bien. {cuando}.'], then: { event: 'promesa' } },
        { label: 'Otro día', reply: ['Vale.'], then: { mood: -1 } },
      ],
    },
  ],
  openers: [
    { when: { flags: ['amaia_conflict', 'amaia_apologized'] }, text: ['Hola. Lo del banco sigue en pie.'] },
    { when: { flags: ['amaia_conflict'] }, text: ['Hola.', 'Ah. Hola.'] },
    { when: { recent: { event: 'plan-lluvia', days: 0 } }, text: ['Vaya día. Lo nuestro en {lugar} lo pasamos; contra la lluvia no hay parche.'] },
    { when: { planIn: 0 }, text: ['Hoy a las {hora} en {lugar}. Lo tengo en el calendario.'] },
    { when: { planIn: 1 }, text: ['Mañana a las {hora} en {lugar}, ¿no? Me he puesto un recordatorio.'] },
    { when: { flags: ['amaia_changed_mind'] }, text: ['Lo del plan... ahora te cuento.'] },
    { when: { ago: { event: 'paseo', days: 1 } }, text: ['Ayer dormí del tirón. Hacía meses.'] },
    { when: { ago: { event: 'prueba', days: 1 } }, text: ['He arreglado dos de tus tres fallos. El tercero, según yo, era una función.'] },
    { when: { flags: ['amaia_entrega_decided'], notFlags: ['amaia_arc_done'], decision: ['entrega', 'ya'] }, text: ['Entrego mañana. Tengo el dedo encima del botón.'] },
    { when: { flags: ['amaia_entrega_decided'], notFlags: ['amaia_arc_done'], decision: ['entrega', 'prorroga'] }, text: ['He escrito el correo pidiendo la semana. Tres veces. Aún no lo he enviado.'] },
    { when: { flags: ['amaia_arc_done'], decision: ['entrega', 'ya'], chance: 0.5 }, text: ['El cliente quiere una segunda fase. Esta vez la pruebas antes de que te lo pida, ¿eh?'] },
    { when: { flags: ['amaia_arc_done'], decision: ['entrega', 'prorroga'], chance: 0.5 }, text: ['Sigo cerrando el portátil a las siete. Nadie se ha muerto.'] },
    { when: { flags: ['amaia_arc_done'], decision: ['desconexion', 'no'], chance: 0.5 }, text: ['Lo de la entrega ya pasó. La próxima, pido ayuda antes.'] },
    { when: { recent: { event: 'reconciliacion', days: 3 } }, text: ['Me alegro de que vinieras. No lo digo mucho.'] },
    { when: { recent: { event: 'dia-gris', days: 0 } }, text: ['Hoy no tengo el día. No es por ti.'] },
  ],
  hello: {
    distance: 4,
    options: [
      { when: { flags: ['amaia_cliente'], notFlags: ['amaia_conflict'], chance: 0.6 }, lines: ['Eh. Mi equipo de pruebas.', 'Hola. ¿Un minuto? Te cuento lo del cliente.'] },
      { when: { flags: ['amaia_arc_done'], notFlags: ['amaia_conflict', 'amaia_cliente'], chance: 0.6 }, lines: ['Hola. Hoy he cerrado el portátil a su hora.', 'Eh. ¿Tienes un minuto? Hoy sí tengo.'] },
      { when: { flags: ['amaia_friend'], notFlags: ['amaia_conflict'], chance: 0.6 }, lines: ['Eh. ¿Tienes un minuto?', 'Hola. Justo salía de una reunión.'] },
      { when: { flags: ['amaia_met'], notFlags: ['amaia_conflict', 'amaia_friend'], chance: 0.3 }, lines: ['Hola.'] },
    ],
  },
  kept: {
    say: ['Has venido. Bien.', 'Amaia no habla mucho, pero hoy no mira el móvil ni una vez.'],
    then: { social: { friendship: 4, trust: 5, mood: 5 }, mood: 10, event: 'plan-cumplido' },
  },
  missed: { set: ['amaia_conflict'], clear: ['amaia_reconciled', 'amaia_apologized'], social: { trust: -10, friendship: -3, mood: -10 }, mood: -22, event: 'planton' },
  cancelled: { set: ['amaia_changed_mind'], mood: -4, event: 'cancela-plan' },
  rain: {
    say: ['Llueve. Lo nuestro en {lugar} se suspende: nadie tiene la culpa del cielo. ¿Lo dejamos para {cuando}?'],
    accept: { label: 'Vale, {cuando}', reply: ['Hecho: {cuando}.'] },
    decline: { label: 'Lo dejamos para otro día', reply: ['Vale. Ya saldrá.'] },
  },
  messages: [
    { id: 'paseo', when: { ago: { event: 'paseo', days: 1 } }, text: ['Anoche dormí del tirón. Gracias por lo del banco.'] },
    { id: 'prueba', when: { ago: { event: 'prueba', days: 1 } }, text: ['Dos de tus tres fallos, arreglados. El tercero lo dejo para la versión dos.'] },
    { id: 'cliente', when: { ago: { event: 'cierre', days: 1 }, decision: ['entrega', 'ya'] }, text: ['El cliente ya ha mandado la propuesta de la segunda fase. Lo de la comida va en serio.'] },
    { id: 'prorroga', when: { ago: { event: 'cierre', days: 1 }, decision: ['entrega', 'prorroga'] }, text: ['Hoy he salido a andar antes de abrir el portátil. Gracias por decirme que esperara.'] },
    { id: 'reconciliacion', when: { ago: { event: 'reconciliacion', days: 1 } }, text: ['Gracias por venir ayer. En serio.'] },
    // Un plan de los de siempre que salió bien (también los quedados por el móvil, WorldScene.bridgePlans).
    { id: 'plan', when: { ago: { event: 'plan-cumplido', days: 1 } }, text: ['Lo de ayer en {lugar} estuvo bien. Hay que repetirlo.'] },
  ],
};
