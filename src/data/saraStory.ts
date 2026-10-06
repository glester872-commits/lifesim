import type { StoryDef } from '../systems/Story.ts';

/**
 * La historia de Sara con el jugador (systems/Story): sus flags, los planes que propone, los microeventos que
 * saca al acabar una charla, lo primero que dice según lo vivido y cuándo saluda ella primero.
 *
 * Nada es lineal: cada flag abre frases (data/chatNamed.ts, etiquetas `f`/`nf`) y microeventos, y se puede
 * llegar a ellas en cualquier orden. Un plantón (sara_conflict) no cierra nada para siempre: se puede hablar.
 * Las rutinas que fija (plan-*, dia-gris) están en data/characters.ts.
 */

const NOT_SUNDAY = [0, 1, 2, 3, 4, 5];
const ANY_DAY = [0, 1, 2, 3, 4, 5, 6];

export const SARA_STORY: StoryDef = {
  npc: 'sara',
  flags: {
    sara_met: 'Se han presentado.',
    sara_friend: 'Ya cuenta al jugador entre su gente del barrio (relación FRIEND o más).',
    sara_close_friend: 'Amistad cercana (CLOSE_FRIEND o más).',
    sara_event_01: 'Primera vez que quedan y el jugador va.',
    sara_event_02: 'Le ha enseñado los diseños de su proyecto.',
    sara_conflict: 'La dejó plantada en un plan; está dolida.',
    sara_reconciled: 'Hablaron lo del plantón e hicieron las paces.',
    sara_changed_mind: 'Canceló un plan y quiere disculparse.',
    sara_tattoo_asked: 'Le ha pedido opinión sobre la golondrina.',
    sara_tattoo: 'Se ha hecho la golondrina en la muñeca.',
  },
  baseMood: 64,
  metFlag: 'sara_met',
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
      // Lo del plantón: lo saca ella. Se puede pedir perdón o no.
      id: 'reconciliar', when: { flags: ['sara_conflict'], cooldown: 1 },
      say: ['...Oye. Lo de {lugar}. Te estuve esperando, ¿sabes?'],
      choices: [
        {
          label: 'Pedirle perdón',
          reply: ['Vale. Gracias por decirlo. Me sentó fatal, pero ya está.'],
          then: { set: ['sara_reconciled'], clear: ['sara_conflict'], social: { trust: 6, friendship: 3, mood: 8 }, mood: 18, event: 'reconciliacion', decision: ['planton', 'perdon'] },
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
    {
      id: 'amistad', once: true, when: { minState: 'FRIEND', notFlags: ['sara_friend'] },
      say: ['Oye, ¿sabes qué? Me caes muy bien. Ya eres de mi gente del barrio, que lo sepas. Toma, apúntate mi número.'],
      then: { set: ['sara_friend'], mood: 5, event: 'amistad', contact: 'te dio su número: ya eres de su gente' },
    },
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
  ],
  openers: [
    // Dolida: seca, y luego lo saca (beat 'reconciliar').
    { when: { flags: ['sara_conflict'] }, text: ['Ah. Hola.', 'Hola. Ando liada.', 'Ah, eres tú.'] },
    { when: { planIn: 0 }, text: ['¡Hoy a las {hora} en {lugar}! No te olvides.', 'Lo de hoy en {lugar} sigue en pie, ¿eh? A las {hora}.'] },
    { when: { planIn: 1 }, text: ['Mañana a las {hora} en {lugar}. Lo tengo apuntado.', 'Lo de mañana en {lugar}, ¿sigue? Yo voy seguro.'] },
    { when: { flags: ['sara_changed_mind'] }, text: ['Uf, lo del plan... ahora te cuento.'] },
    { when: { recent: { event: 'plan-cumplido', days: 2 } }, text: ['Lo del otro día en {lugar} estuvo genial. Hay que repetir.', 'Sigo pensando en lo bien que se estaba en {lugar}.'] },
    { when: { recent: { event: 'reconciliacion', days: 3 } }, text: ['Me alegro de que lo habláramos, ¿eh? En serio.'] },
    { when: { flags: ['sara_tattoo'], recent: { event: 'tatuaje', days: 4 } }, text: ['¡Mira la muñeca! Me la hice. Si queda mal, es culpa tuya.'] },
    { when: { recent: { event: 'dia-gris', days: 0 } }, text: ['Hoy no es mi día, perdona si estoy rara.'] },
    { when: { flags: ['sara_met'], recent: { event: 'charla', days: 1 }, chance: 0.5 }, text: ['¡Otra vez tú! La última vez fue en {sitio}.', 'Al final te voy a ver más que a Ada. Hace nada en {sitio} y ahora aquí.'] },
  ],
  hello: {
    distance: 4,
    options: [
      { when: { flags: ['sara_friend'], notFlags: ['sara_conflict'], chance: 0.7 }, lines: ['¡Eh! ¿Tú por aquí? Ven, que te cuento una cosa.', '¡Mira quién anda por aquí! ¿Tienes un minuto?', '¡Ey! Justo pensaba en ti. Bueno, en un outfit, pero también en ti.'] },
      { when: { flags: ['sara_met'], notFlags: ['sara_conflict', 'sara_friend'], chance: 0.4 }, lines: ['¡Hola! Tú eres quien me encontré el otro día, ¿no?', 'Ey, ¡hola! Te he visto de lejos.'] },
    ],
  },
  kept: {
    say: ['¡Has venido! Pensaba que se te olvidaba.', 'Ven, ven. Te he guardado sitio.'],
    then: { set: ['sara_event_01'], social: { friendship: 5, trust: 6, mood: 6 }, mood: 12, event: 'plan-cumplido' },
  },
  missed: { set: ['sara_conflict'], clear: ['sara_reconciled'], social: { trust: -10, friendship: -4, mood: -12 }, mood: -28, event: 'planton' },
  cancelled: { set: ['sara_changed_mind'], mood: -4, event: 'cancela-plan' },
};

/** Las historias por personaje: uno nuevo con historia es una entrada más. */
export const STORIES: Readonly<Record<string, StoryDef>> = { sara: SARA_STORY };
