import type { StoryDef } from '../systems/Story.ts';

/**
 * La historia de Ada con el jugador (systems/Story). Ada, 21, prepara oposiciones y juega al baloncesto los
 * viernes; seca, directa, reservada. Su arco es el examen, en días distintos: te pide que le tomes el temario
 * (promesa, 'temario'), repasáis en el banco de la plaza (plan 'repaso'), te pregunta si se presenta ya o espera
 * (decisión que cambia cómo acaba) y unos días después te cuenta cómo le fue (cierre, en persona o por el móvil).
 *
 * Aparte, el partidillo de los viernes: si le dices que te apuntas, sus invitaciones incluyen la pista (plan
 * 'pista', `requires`); si no, nunca te la propone. Un plantón se arregla repitiendo el repaso ('repaso-arreglo').
 * Sin romance en el arco: su orientación (data/namedPeople.ts) decide eso en systems/Social, no aquí.
 * Las rutinas que fija (plan-*, ada-dia-gris) están en data/characters.ts.
 */

const WEEKEND = [5, 6];

export const ADA_STORY: StoryDef = {
  npc: 'ada',
  flags: {
    ada_met: 'Se han presentado.',
    ada_friend: 'Le cuenta entre su gente (relación FRIEND o más).',
    ada_event_01: 'Primera vez que quedan y el jugador va.',
    ada_quiz_asked: 'Quedó en tomarle el temario (aceptó).',
    ada_quiz_declined: 'Le dijo que no podía tomarle el temario.',
    ada_quiz_done: 'Le tomó el temario en la plaza.',
    ada_exam_decided: 'Le dijo si presentarse ya o esperar a otoño.',
    ada_court_asked: 'Le propuso jugar los viernes (dijera lo que dijera).',
    ada_court: 'Se apuntó al partidillo de los viernes: la pista entra en sus planes.',
    ada_conflict: 'La dejó plantada; está dolida.',
    ada_apologized: 'Pidió perdón y quedó en repetir el repaso: falta venir.',
    ada_reconciled: 'Hicieron las paces viniendo al repaso del arreglo.',
    ada_changed_mind: 'Canceló un plan y quiere disculparse.',
    ada_arc_done: 'El arco del examen se cerró.',
  },
  baseMood: 58,
  metFlag: 'ada_met',
  friendFlag: 'ada_friend',
  greyRoutine: 'ada-dia-gris',
  greyBelow: 30,
  greyFlag: { flag: 'ada_conflict', chance: 0.35 },
  plans: {
    parque: {
      routine: 'plan-parque', point: 'PARK_BENCH_02', from: '10:30', until: '12:00', place: 'el banco del parque', outdoor: true, days: WEEKEND,
      ask: '¿Te vienes {cuando} al parque? Yo leo, tú haces lo que quieras. Es un plan buenísimo.',
    },
    // Sólo si te apuntaste a los viernes.
    pista: {
      routine: 'plan-pista', point: 'PARK_COURT', from: '19:00', until: '20:30', place: 'la pista del parque', outdoor: true, days: [4],
      ask: 'Partidillo {cuando} en la pista. Nos falta uno. Tú.',
      requires: { flags: ['ada_court'] },
      kept: {
        say: ['¡Has venido! Vas con los de camiseta. Perdemos, pero con dignidad.', 'Ada mete tres seguidas y no lo celebra. Por dentro, sí.'],
        then: { set: ['ada_event_01'], social: { friendship: 5, trust: 3, mood: 6 }, mood: 12, event: 'partido' },
      },
    },
    // El arco del examen.
    repaso: {
      routine: 'plan-repaso', point: 'PLAZA_BENCH_02', from: '19:00', until: '20:00', place: 'el banco de la plaza', outdoor: true, days: [0, 1, 2, 3, 4],
      kept: {
        say: ['Has venido. Toma: tema 14. Pregúntame lo que quieras, y no me dejes pasar ni una.', 'Una hora después, el tema 14 se lo sabe hasta el quiosquero.'],
        then: { set: ['ada_quiz_done', 'ada_event_01'], social: { friendship: 6, trust: 8, mood: 6 }, mood: 14, event: 'repaso' },
      },
    },
    // El arreglo de un plantón: repetir el repaso. Venir es lo que lo arregla.
    'repaso-arreglo': {
      routine: 'plan-repaso', point: 'PLAZA_BENCH_02', from: '19:00', until: '20:00', place: 'el banco de la plaza', outdoor: true, days: [0, 1, 2, 3, 4],
      kept: {
        say: ['Has venido. Vale. Pues tema 14, desde el principio.', 'No dice nada del otro día. Al final te da las gracias dos veces, que en Ada es mucho.'],
        then: { set: ['ada_reconciled', 'ada_quiz_done'], clear: ['ada_conflict', 'ada_apologized'], social: { trust: 8, friendship: 3, mood: 8 }, mood: 16, event: 'reconciliacion' },
      },
      missed: { set: ['ada_conflict'], clear: ['ada_apologized', 'ada_reconciled'], social: { trust: -12, friendship: -4, mood: -10 }, mood: -22, event: 'planton' },
    },
  },
  invite: {
    when: { flags: ['ada_friend'], notFlags: ['ada_conflict'], plan: 'none', cooldown: 4, chance: 0.45 },
    say: ['Oye.'],
    accept: { label: 'Vale, allí estaré', reply: ['Bien. {cuando} en {lugar}. Soy puntual, aviso.'], then: { social: { friendship: 2, trust: 1 }, mood: 3, event: 'invitacion-aceptada' } },
    decline: { label: 'Esta vez no', reply: ['Vale. Otra vez será.'], then: { social: { mood: -1 }, mood: -2, event: 'invitacion-rechazada' } },
  },
  beats: [
    {
      id: 'presentacion', once: true, when: { notFlags: ['ada_met'] },
      say: ['Ada, por cierto. Preparo oposiciones, así que si me ves con cara de temario, es eso.'],
      then: { set: ['ada_met'], event: 'conocerse' },
    },
    {
      // El plantón: disculpa con algo que hacer (repetir el repaso) o una excusa que no arregla nada.
      id: 'reconciliar', when: { flags: ['ada_conflict'], notFlags: ['ada_apologized'], cooldown: 1 },
      say: ['Te estuve esperando en {lugar} con el temario abierto. No pasa nada. Bueno, sí pasa.'],
      choices: [
        {
          label: 'Disculparte y ofrecerte a repetirlo',
          plan: 'repaso-arreglo',
          reply: ['Vale. {cuando}, mismo banco. Si vienes, lo olvido.'],
          then: { set: ['ada_apologized'], social: { trust: 2, mood: 4 }, mood: 5, event: 'perdon', decision: ['planton', 'repetir'] },
        },
        {
          label: 'Decir que se te olvidó',
          reply: ['Ya. A mí no se me olvida nada; será problema mío.'],
          then: { social: { trust: -3, mood: -3 }, mood: -4, decision: ['planton', 'excusa'] },
        },
      ],
    },
    {
      id: 'disculpa', when: { flags: ['ada_changed_mind'] },
      say: ['Perdona lo de {lugar}. Tenía la cabeza en otra parte. Literalmente: en el tema 9.'],
      then: { clear: ['ada_changed_mind'], social: { trust: 2 }, event: 'disculpa' },
    },
    {
      // Te da su número; si ya lo tienes, no vuelve a dártelo (ni se vuelve a presentar).
      id: 'amistad', once: true, when: { minState: 'FRIEND', notFlags: ['ada_friend'], contact: false },
      say: ['No suelo decir esto, pero hablar contigo descansa. Toma mi número. Contesto tarde; no te lo tomes a mal.'],
      then: { set: ['ada_friend'], mood: 5, event: 'amistad', contact: 'te dio su número: hablar contigo le descansa' },
    },
    {
      id: 'amistad-con-numero', once: true, when: { minState: 'FRIEND', notFlags: ['ada_friend'], contact: true },
      say: ['No suelo decir esto, pero hablar contigo descansa. Ya tienes mi número: úsalo, que no muerde.'],
      then: { set: ['ada_friend'], mood: 5, event: 'amistad' },
    },
    // ------------------------------------------------------------------- el arco del examen
    {
      // El cierre, dos días después de decidir: lo que pasó depende de lo que le dijiste.
      id: 'resultado-ahora', once: true, phone: true,
      when: { flags: ['ada_exam_decided'], notFlags: ['ada_arc_done', 'ada_conflict'], since: { flag: 'ada_exam_decided', days: 2 }, decision: ['examen', 'ahora'] },
      say: ['¡He aprobado el primer ejercicio! Me temblaba el boli. Sin tus preguntas en el banco no lo saco. Te debo una caña. Mínimo.'],
      then: { set: ['ada_arc_done'], social: { trust: 4, friendship: 3 }, mood: 15, event: 'cierre' },
    },
    {
      id: 'resultado-otono', once: true, phone: true,
      when: { flags: ['ada_exam_decided'], notFlags: ['ada_arc_done', 'ada_conflict'], since: { flag: 'ada_exam_decided', days: 2 }, decision: ['examen', 'otono'] },
      say: ['He hablado con la academia: me presento en otoño, con el temario entero y sin ansiedad. Gracias por decirme lo que pensabas, aunque no fuera lo que quería oír.'],
      then: { set: ['ada_arc_done'], social: { trust: 5 }, mood: 8, event: 'cierre' },
    },
    {
      // Si nunca pudiste tomarle el temario: se presenta sola. Sin reproches, con consecuencias.
      id: 'resultado-sola', once: true, phone: true,
      when: { flags: ['ada_quiz_declined'], notFlags: ['ada_arc_done', 'ada_quiz_asked', 'ada_conflict'], since: { flag: 'ada_quiz_declined', days: 7 } },
      say: ['Me presenté. Repasando sola. Suspendí el primero por dos décimas. Otoño, supongo. No te preocupes, no es culpa tuya.'],
      then: { set: ['ada_arc_done'], mood: -6, event: 'cierre' },
    },
    {
      // Decisión que cambia cómo acaba (el cierre y lo que dice después).
      id: 'examen', once: true, when: { flags: ['ada_quiz_done'], notFlags: ['ada_exam_decided'] },
      say: ['Oye. Después de lo del banco... ¿me presento ya a esta convocatoria o espero a otoño, con todo el temario?'],
      choices: [
        { label: 'Preséntate ya, estás lista', reply: ['Vale. Me presento. Si suspendo, te echo la culpa con cariño.'], then: { set: ['ada_exam_decided'], decision: ['examen', 'ahora'], mood: 4, event: 'decision-examen' } },
        { label: 'Espera a otoño, sin prisa', reply: ['...Igual tienes razón. Lo pienso esta noche.'], then: { set: ['ada_exam_decided'], decision: ['examen', 'otono'], event: 'decision-examen' } },
      ],
    },
    {
      // Hito 1: la promesa. Puede llegar por el móvil.
      id: 'temario', once: true, phone: true, offer: 'repaso',
      when: { flags: ['ada_friend'], notFlags: ['ada_quiz_asked', 'ada_quiz_declined', 'ada_conflict'], since: { flag: 'ada_friend', days: 1 } },
      say: ['Una cosa. El examen es en dos semanas y nadie me pregunta el temario en voz alta. ¿Me lo tomas {cuando} en {lugar}? Es una hora, y te invito a un agua.'],
      choices: [
        { label: 'Claro, allí estaré', reply: ['Bien. {cuando}, en {lugar}. Traigo el tema 14.'], then: { set: ['ada_quiz_asked'], social: { trust: 2 }, mood: 4, event: 'promesa', decision: ['temario', 'si'] } },
        { label: 'No puedo, lo siento', reply: ['Vale. Me lo grabo y me escucho. Es deprimente, pero funciona.'], then: { set: ['ada_quiz_declined'], mood: -3, event: 'promesa-rechazada', decision: ['temario', 'no'] } },
      ],
    },
    {
      // Una segunda oportunidad, días después (lo que dice recuerda que la otra vez no pudiste).
      id: 'temario-otra', once: true, phone: true, offer: 'repaso',
      when: { flags: ['ada_quiz_declined'], notFlags: ['ada_quiz_asked', 'ada_conflict'], since: { flag: 'ada_quiz_declined', days: 3 } },
      say: ['Lo del temario: la otra vez no pudiste y me quedan pocos días. ¿Esta vez puedes {cuando}? Si no, tranquilo.'],
      choices: [
        { label: 'Esta vez sí', reply: ['Bien. {cuando}, en {lugar}.'], then: { set: ['ada_quiz_asked'], clear: ['ada_quiz_declined'], social: { trust: 2 }, mood: 4, event: 'promesa', decision: ['temario', 'si'] } },
        { label: 'Tampoco puedo', reply: ['Vale. Lo entiendo.'], then: { mood: -2, decision: ['temario', 'no'] } },
      ],
    },
    {
      // Quedasteis y no salió (lluvia sin pasar a otro día): lo vuelve a proponer.
      id: 'temario-pasar', phone: true, offer: 'repaso',
      when: { flags: ['ada_quiz_asked'], notFlags: ['ada_quiz_done', 'ada_conflict'], since: { flag: 'ada_quiz_asked', days: 2 }, cooldown: 3 },
      say: ['¿Hacemos lo del temario {cuando}? Sigo con el tema 14 a medias.'],
      choices: [
        { label: 'Vale, allí estaré', reply: ['Bien. {cuando}.'], then: { event: 'promesa' } },
        { label: 'Otro día', reply: ['Vale.'], then: { mood: -1 } },
      ],
    },
    {
      // Decisión que cambia qué planes te propone: la pista sólo entra si te apuntas.
      id: 'pista', once: true, when: { flags: ['ada_friend'], notFlags: ['ada_court_asked', 'ada_conflict'], since: { flag: 'ada_friend', days: 2 } },
      say: ['Los viernes jugamos un partidillo en la pista del parque. Siempre nos falta uno. ¿Te apuntas, a partir de ahora?'],
      choices: [
        { label: 'Me apunto', reply: ['Bien. Viernes a las siete. Ya te avisaré cuando haya hueco.'], then: { set: ['ada_court_asked', 'ada_court'], social: { friendship: 2 }, mood: 3, decision: ['pista', 'si'] } },
        { label: 'No es lo mío', reply: ['Vale. Más canasta para mí.'], then: { set: ['ada_court_asked'], decision: ['pista', 'no'] } },
      ],
    },
  ],
  openers: [
    { when: { flags: ['ada_conflict', 'ada_apologized'] }, text: ['Hola. Lo del banco sigue en pie.'] },
    { when: { flags: ['ada_conflict'] }, text: ['Hola.', 'Ah. Hola.'] },
    { when: { recent: { event: 'plan-lluvia', days: 0 } }, text: ['Vaya día. Lo de {lugar} lo pasamos; el cielo no es culpa de nadie.'] },
    { when: { planIn: 0 }, text: ['Hoy a las {hora} en {lugar}. Sigue en pie.'] },
    { when: { planIn: 1 }, text: ['Mañana a las {hora} en {lugar}, ¿no? Lo tengo apuntado.'] },
    { when: { flags: ['ada_changed_mind'] }, text: ['Lo del plan... ahora te cuento.'] },
    { when: { ago: { event: 'repaso', days: 1 } }, text: ['Hoy en la academia me han preguntado el tema 14. Lo he clavado. Gracias a ti.'] },
    { when: { ago: { event: 'partido', days: 1 } }, text: ['Ayer en la pista no estuviste mal. Para ser tú.'] },
    { when: { flags: ['ada_arc_done'], decision: ['examen', 'ahora'], chance: 0.5 }, text: ['El segundo ejercicio es en un mes. Esta vez me tomas el temario sin que te lo pida, ¿eh?'] },
    { when: { flags: ['ada_arc_done'], decision: ['examen', 'otono'], chance: 0.5 }, text: ['Desde que decidí esperar duermo ocho horas. Ocho.'] },
    { when: { flags: ['ada_arc_done'], decision: ['temario', 'no'], chance: 0.5 }, text: ['Lo del examen ya está. En otoño, otra vez. Esta vez pido ayuda antes.'] },
    { when: { recent: { event: 'reconciliacion', days: 3 } }, text: ['Me alegro de que vinieras. Lo digo poco.'] },
    { when: { recent: { event: 'dia-gris', days: 0 } }, text: ['Hoy no tengo el día. No es por ti.'] },
  ],
  hello: {
    distance: 4,
    options: [
      { when: { flags: ['ada_arc_done'], notFlags: ['ada_conflict'], chance: 0.6 }, lines: ['Eh. Mi examinador favorito.', 'Hola. ¿Un minuto? Te cuento lo de la academia.'] },
      { when: { flags: ['ada_friend'], notFlags: ['ada_conflict'], chance: 0.6 }, lines: ['Eh. ¿Tienes un minuto?', 'Hola. Justo salía de la academia.'] },
      { when: { flags: ['ada_met'], notFlags: ['ada_conflict', 'ada_friend'], chance: 0.3 }, lines: ['Hola.'] },
    ],
  },
  kept: {
    say: ['Has venido. Bien.', 'Ada no es de hablar mucho, pero se queda hasta el final.'],
    then: { set: ['ada_event_01'], social: { friendship: 4, trust: 5, mood: 5 }, mood: 10, event: 'plan-cumplido' },
  },
  missed: { set: ['ada_conflict'], clear: ['ada_reconciled', 'ada_apologized'], social: { trust: -10, friendship: -3, mood: -10 }, mood: -22, event: 'planton' },
  cancelled: { set: ['ada_changed_mind'], mood: -4, event: 'cancela-plan' },
  rain: {
    say: ['Llueve. Lo de {lugar} se suspende: nadie tiene la culpa del cielo. ¿Lo pasamos a {cuando}?'],
    accept: { label: 'Vale, {cuando}', reply: ['Hecho. {cuando}.'] },
    decline: { label: 'Lo dejamos para otro día', reply: ['Vale. Ya saldrá.'] },
  },
  messages: [
    { id: 'repaso', when: { ago: { event: 'repaso', days: 1 } }, text: ['Hoy en la academia me han preguntado el tema 14 y lo he clavado. Gracias por lo de ayer.'] },
    { id: 'partido', when: { ago: { event: 'partido', days: 1 } }, text: ['Tengo agujetas de ayer. Tú también, seguro. Buen partido.'] },
    { id: 'reconciliacion', when: { ago: { event: 'reconciliacion', days: 1 } }, text: ['Gracias por venir ayer. En serio.'] },
  ],
};
