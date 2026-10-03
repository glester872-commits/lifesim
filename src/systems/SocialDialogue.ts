import {
  NAMED_RELATIONSHIPS,
} from '../data/namedPeople.ts';

import {
  getNpc,
} from '../data/npcs.ts';

import type {
  Mood,
} from '../data/chat.ts';

import type {
  Temperament,
} from '../data/identity.ts';

import {
  lastSocialMemory,
  type SocialActionId,
  type SocialContext,
  type SocialOutcome,
  type SocialProfile,
} from './Social.ts';

export interface SocialReplyContext {
  namedId: string;

  profileBefore:
    SocialProfile;

  profileAfter:
    SocialProfile;

  social:
    SocialContext;

  temperament:
    Temperament;

  outcome:
    SocialOutcome;

  action:
    SocialActionId;
}

export interface SocialReply {
  text: string;

  /**
   * Si true, la interacción puede cerrar la conversación
   * de forma natural.
   */
  ends?: boolean;
}

// ================================================================
// UTILIDADES
// ================================================================

const pick = <T>(
  items: readonly T[],
  rng: () => number =
    Math.random,
): T =>
  items[
    Math.floor(
      rng() *
        items.length,
    )
  ];

function partnerOf(
  namedId: string,
):
  | {
      id: string;
      name: string;
      type:
        | 'couple'
        | 'dating'
        | 'married';
    }
  | undefined {
  const relation =
    NAMED_RELATIONSHIPS.find(
      (r) =>
        (
          r.a === namedId ||
          r.b === namedId
        ) &&
        (
          r.type === 'couple' ||
          r.type === 'dating' ||
          r.type === 'married'
        ),
    );

  if (!relation) {
    return undefined;
  }

  /*
   * TypeScript no mantiene automáticamente el narrowing
   * hecho dentro de Array.find(), así que lo confirmamos
   * aquí de forma explícita.
   */
  const type =
    relation.type;

  if (
    type !== 'couple' &&
    type !== 'dating' &&
    type !== 'married'
  ) {
    return undefined;
  }

  const otherId =
    relation.a === namedId
      ? relation.b
      : relation.a;

  return {
    id: otherId,

    name:
      getNpc(
        otherId,
      ).name,

    type,
  };
}

function moodPrefix(
  mood: Mood,
): string {
  switch (mood) {
    case 'good':
      return '';

    case 'neutral':
      return '';

    case 'tired':
      return 'Hoy estoy un poco cansado, pero ';

    case 'hurried':
      return 'Voy con un poco de prisa, pero ';

    case 'down':
      return 'Hoy no estoy en mi mejor día, pero ';
  }
}

function positiveFlirt(
  temperament: Temperament,
): readonly string[] {
  switch (temperament) {
    case 'extrovertido':
      return [
        'Vale, eso ha sido bastante directo. Me gusta.',
        '¿Ah, sí? Pues sigue, que te estoy escuchando.',
        'No te voy a mentir: me ha gustado eso.',
      ];

    case 'reservado':
      return [
        'Bueno... no me esperaba eso. Pero no me ha molestado.',
        'Me has pillado un poco por sorpresa.',
        'No sé muy bien qué decir... pero me ha gustado.',
      ];

    case 'curioso':
      return [
        'Interesante. No sabía que ibas por ahí.',
        'Vale, ahora tengo curiosidad.',
        'Eso cambia un poco esta conversación.',
      ];

    case 'bromista':
      return [
        'Cuidado, que como sigas así me lo voy a creer.',
        '¿Eso era coqueteo? Porque casi funciona.',
        'Muy sutil. Cero sospechoso.',
      ];

    case 'tranquilo':
      return [
        'Ha sido bonito. Gracias.',
        'No me ha disgustado escucharlo.',
        'Me gusta hablar contigo así.',
      ];
  }
}

function negativeFlirt(
  temperament: Temperament,
): readonly string[] {
  switch (temperament) {
    case 'extrovertido':
      return [
        'Eh... creo que mejor dejamos eso ahí.',
        'Me caes bien, pero no voy por ahí.',
        'No quiero darte una idea equivocada.',
      ];

    case 'reservado':
      return [
        'Prefiero que no vayamos por ahí.',
        'No me siento muy cómodo con eso.',
        'Mejor seguimos hablando normal.',
      ];

    case 'curioso':
      return [
        'No creo que sea lo que busco ahora mismo.',
        'Entiendo por dónde vas, pero no.',
        'Creo que estamos leyendo esto de forma distinta.',
      ];

    case 'bromista':
      return [
        'Uy. Eso no ha aterrizado demasiado bien.',
        'Creo que ahí has ido un poco rápido.',
        'Te voy a salvar y fingimos que no has dicho eso.',
      ];

    case 'tranquilo':
      return [
        'Prefiero que seamos claros: no me interesa de esa forma.',
        'Mejor no confundimos las cosas.',
        'No quiero que esto se vuelva incómodo.',
      ];
  }
}

// ================================================================
// ESTADO SENTIMENTAL REAL DEL NPC
// ================================================================

function statusReply(
  namedId: string,
  outcome: SocialOutcome,
): string {
  const partner =
    partnerOf(
      namedId,
    );

  if (
    outcome ===
    'negative'
  ) {
    return 'Prefiero no hablar de eso todavía.';
  }

  if (
    outcome ===
    'neutral'
  ) {
    return 'Es un poco complicado. Mejor te lo cuento otro día.';
  }

  if (!partner) {
    return 'Ahora mismo estoy soltero/a.';
  }

  switch (
    partner.type
  ) {
    case 'married':
      return `Estoy casado/a con ${partner.name}.`;

    case 'couple':
      return `Sí, estoy con ${partner.name}.`;

    case 'dating':
      return `Estoy viendo a ${partner.name}.`;
  }
}

// ================================================================
// RESPUESTAS
// ================================================================

export function socialReply(
  ctx: SocialReplyContext,
  rng: () => number =
    Math.random,
): SocialReply {
  const {
    action,
    outcome,
    social,
    temperament,
    namedId,
  } = ctx;

  switch (action) {
    // ---------------------------------------------------------- saludo

    case 'greet':
      return {
        text:
          outcome ===
          'positive'
            ? pick(
                [
                  '¡Ey! Me alegro de verte.',
                  'Hola. ¿Qué tal todo?',
                  '¡Buenas! Qué casualidad verte por aquí.',
                ],
                rng,
              )
            : outcome ===
                'negative'
              ? 'Hola. Perdona, hoy no estoy muy hablador/a.'
              : 'Hola. ¿Todo bien?',
      };

    // ------------------------------------------------------- cómo está

    case 'howru':
      return {
        text:
          outcome ===
          'positive'
            ? pick(
                [
                  'Bien, la verdad. Hoy estoy teniendo buen día.',
                  'Bastante bien. Gracias por preguntar.',
                  'Bien. Mejor ahora que he parado un momento.',
                ],
                rng,
              )
            : outcome ===
                'negative'
              ? 'No demasiado. Prefiero no darle muchas vueltas.'
              : 'Normal. Un día más.',
      };

    // ----------------------------------------------------------- casual

    case 'casual':
      return {
        text:
          outcome ===
          'positive'
            ? pick(
                [
                  'Contigo siempre termino hablando más de la cuenta.',
                  'Me gusta este tipo de conversaciones.',
                  'Sí, totalmente. Te entiendo.',
                ],
                rng,
              )
            : outcome ===
                'negative'
              ? 'No sé. Hoy no estoy muy de conversación.'
              : 'Puede ser. Nunca lo había pensado así.',
      };

    // --------------------------------------------------------- pregunta

    case 'question':
      return {
        text:
          outcome ===
          'positive'
            ? 'Buena pregunta. Dame un segundo para pensarlo.'
            : outcome ===
                'negative'
              ? 'Eso es un poco personal, ¿no?'
              : 'No sé muy bien qué responderte.',
      };

    // ------------------------------------------------------------ broma

    case 'joke':
      return {
        text:
          outcome ===
          'positive'
            ? temperament ===
              'bromista'
              ? pick(
                  [
                    'Vale, esa te la compro.',
                    'Qué idiota. Ha sido buena.',
                    'No esperaba reírme con eso.',
                  ],
                  rng,
                )
              : pick(
                  [
                    'Vale, me has hecho gracia.',
                    'No ha estado mal.',
                    'Te voy a conceder esa.',
                  ],
                  rng,
                )
            : outcome ===
                'negative'
              ? 'No sé si era el mejor momento para esa broma.'
              : 'Vale... creo que era una broma.',
      };

    // ------------------------------------------------------ cumplido

    case 'compliment':
      return {
        text:
          outcome ===
          'positive'
            ? pick(
                [
                  'Gracias. Eso ha sido bonito.',
                  'No me esperaba que me dijeras eso.',
                  'Qué bien sabes quedar, ¿eh?',
                  'Gracias. Me ha gustado escucharlo.',
                ],
                rng,
              )
            : outcome ===
                'negative'
              ? pick(
                  [
                    'Gracias... pero me has pillado un poco incómodo/a.',
                    'No hacía falta.',
                    'Prefiero que no vayamos por ahí.',
                  ],
                  rng,
                )
              : 'Gracias. No sé muy bien qué decir.',
      };

    // ---------------------------------------------------------- flirt

    case 'flirt':
      return {
        text:
          outcome ===
          'positive'
            ? pick(
                positiveFlirt(
                  temperament,
                ),
                rng,
              )
            : outcome ===
                'negative'
              ? pick(
                  negativeFlirt(
                    temperament,
                  ),
                  rng,
                )
              : pick(
                  [
                    '¿Eso era coqueteo?',
                    'No sé si hablas en serio.',
                    'Vale... eso no me lo esperaba.',
                  ],
                  rng,
                ),
      };

    // ------------------------------------------------ estado sentimental

    case 'ask-status':
      return {
        text:
          statusReply(
            namedId,
            outcome,
          ),
      };

    // ---------------------------------------------------------- contacto

    case 'ask-contact':
      return {
        text:
          outcome ===
          'positive'
            ? pick(
                [
                  'Sí, claro. Pásame el tuyo y te agrego.',
                  'Vale. Te paso mi contacto.',
                  'Sí. Así hablamos otro día con más calma.',
                ],
                rng,
              )
            : outcome ===
                'negative'
              ? pick(
                  [
                    'Prefiero que no, al menos por ahora.',
                    'Creo que todavía es pronto.',
                    'Mejor nos seguimos viendo por aquí.',
                  ],
                  rng,
                )
              : 'Quizá otro día. Todavía nos estamos conociendo.',
      };

    // ------------------------------------------------------------ café

    case 'invite-coffee':
      return {
        text:
          outcome ===
          'positive'
            ? pick(
                [
                  'Sí, me apetece. Un café suena bien.',
                  'Vale. Café aceptado.',
                  'Claro. Cuando quieras.',
                ],
                rng,
              )
            : outcome ===
                'negative'
              ? pick(
                  [
                    'Hoy no puedo. Y prefiero no prometerte otro día.',
                    'Gracias, pero voy a decir que no.',
                    'Creo que mejor no.',
                  ],
                  rng,
                )
              : 'Hoy imposible, pero quizá otro día.',
      };

    // -------------------------------------------------------- tomar algo

    case 'invite-drink':
      return {
        text:
          outcome ===
          'positive'
            ? social.place ===
                'nightlife'
              ? pick(
                  [
                    'Ya que estamos aquí... vale.',
                    'Una copa sí. Luego vemos.',
                    'Venga, te acepto una.',
                  ],
                  rng,
                )
              : pick(
                  [
                    'Sí. Me apetece salir un rato.',
                    'Vale, podemos tomar algo.',
                    'Eso sí me apetece.',
                  ],
                  rng,
                )
            : outcome ===
                'negative'
              ? 'No, gracias. Hoy prefiero ir por mi cuenta.'
              : 'Quizá. No te prometo nada todavía.',
      };

    // ------------------------------------------------------------- plan

    case 'propose-plan':
      return {
        text:
          outcome ===
          'positive'
            ? pick(
                [
                  'Sí. Me gusta el plan.',
                  'Cuenta conmigo.',
                  'Vale, eso tenemos que hacerlo.',
                ],
                rng,
              )
            : outcome ===
                'negative'
              ? 'Creo que esta vez paso.'
              : 'Déjamelo pensar y te digo.',
      };

    // ------------------------------------------------------------- cita

    case 'propose-date':
      return {
        text:
          outcome ===
          'positive'
            ? pick(
                [
                  'Sí. Una cita de verdad. Me apetece.',
                  'Vale... sí. Quiero.',
                  'Pensaba que no ibas a preguntarlo nunca.',
                  'Sí. Vamos a hacerlo.',
                ],
                rng,
              )
            : outcome ===
                'negative'
              ? pick(
                  [
                    'No. Me caes bien, pero no quiero una cita.',
                    'Prefiero que no confundamos las cosas.',
                    'No siento que estemos en ese punto.',
                  ],
                  rng,
                )
              : pick(
                  [
                    'No te voy a decir que no, pero todavía no.',
                    'Dame un poco más de tiempo.',
                    'No sé. Quiero pensarlo.',
                  ],
                  rng,
                ),
      };

    // ------------------------------------------------ despedida

    case 'bye':
      return {
        text:
          outcome ===
          'positive'
            ? 'Nos vemos. Me ha gustado hablar contigo.'
            : 'Nos vemos.',
        ends: true,
      };
  }
}

// ================================================================
// MEMORIA SOCIAL EN CONVERSACIONES FUTURAS
// ================================================================

/**
 * Genera una frase ocasional recordando algo importante ocurrido
 * anteriormente entre el jugador y el NPC.
 *
 * No sale siempre: Chat.ts decidirá cuándo utilizarla.
 */
export function socialMemoryReference(
  profile: SocialProfile,
  currentDay: number,
  rng: () => number =
    Math.random,
): string | undefined {
  const memory =
    lastSocialMemory(
      profile,
    );

  if (!memory) {
    return undefined;
  }

  const daysAgo =
    Math.max(
      0,
      currentDay -
        memory.day,
    );

  const when =
    daysAgo === 0
      ? 'antes'
      : daysAgo === 1
        ? 'ayer'
        : daysAgo <= 4
          ? 'el otro día'
          : 'hace unos días';

  switch (
    memory.kind
  ) {
    case 'COMPLIMENT':
      if (
        memory.outcome ===
        'positive'
      ) {
        return pick(
          [
            `Por cierto, me acordé de lo que me dijiste ${when}.`,
            `Lo que me dijiste ${when} me hizo gracia después.`,
            `No creas que se me olvidó el cumplido de ${when}.`,
          ],
          rng,
        );
      }

      return undefined;

    case 'FLIRT':
      if (
        memory.outcome ===
        'positive'
      ) {
        return pick(
          [
            `Así que... ¿vas a seguir con lo de ${when}?`,
            `He pensado un poco en nuestra conversación de ${when}.`,
            `No se me olvidó cómo terminó aquello ${when}.`,
          ],
          rng,
        );
      }

      if (
        memory.outcome ===
        'negative'
      ) {
        return 'Por cierto, espero que lo de la otra vez haya quedado claro.';
      }

      return undefined;

    case 'CONTACT_REQUEST':
      if (
        memory.outcome ===
          'positive' &&
        profile.contactExchanged
      ) {
        return pick(
          [
            'Por cierto, vi tu contacto guardado y me acordé de escribirte.',
            'Ahora que tenemos contacto ya no tienes excusa para desaparecer.',
          ],
          rng,
        );
      }

      return undefined;

    case 'INVITATION':
      if (
        memory.outcome ===
        'positive'
      ) {
        return pick(
          [
            `Sigue pendiente lo que hablamos ${when}.`,
            `No me he olvidado de ese plan.`,
            `Tenemos un plan pendiente, ¿eh?`,
          ],
          rng,
        );
      }

      return undefined;

    case 'DATE':
      if (
        memory.outcome ===
        'positive'
      ) {
        return pick(
          [
            'He estado pensando en nuestra cita.',
            'Lo de la cita sigue en pie, ¿verdad?',
            'Todavía me hace gracia que me lo preguntaras.',
          ],
          rng,
        );
      }

      if (
        memory.outcome ===
        'negative'
      ) {
        return 'Espero que lo de la cita no haya dejado las cosas raras.';
      }

      return undefined;

    case 'ARGUMENT':
      return memory.outcome ===
        'negative'
        ? 'No quiero volver a terminar como la última vez.'
        : 'Me alegro de que dejáramos atrás aquella discusión.';

    case 'PROMISE':
      return 'No me he olvidado de lo que prometimos.';

    case 'SHARED_EVENT':
      return 'Lo del otro día fue bastante memorable.';
  }
}

// ================================================================
// FRASE DE APERTURA SEGÚN RELACIÓN
// ================================================================

export function socialGreeting(
  profile: SocialProfile,
  mood: Mood,
  rng: () => number =
    Math.random,
): string | undefined {
  const prefix =
    moodPrefix(
      mood,
    );

  if (
    profile.romance >=
      70 &&
    profile.attraction >=
      65
  ) {
    return `${prefix}${pick(
      [
        'me alegro mucho de verte.',
        'tenía ganas de verte.',
        'justo estaba pensando en ti.',
      ],
      rng,
    )}`;
  }

  if (
    profile.friendship >=
    65
  ) {
    return `${prefix}${pick(
      [
        'qué bien verte.',
        'hacía falta una charla contigo.',
        'justo necesitaba encontrarme con alguien conocido.',
      ],
      rng,
    )}`;
  }

  if (
    profile.friendship >=
      25 ||
    profile.encounters >=
      4
  ) {
    return `${prefix}${pick(
      [
        'me alegro de verte otra vez.',
        'ya nos estamos encontrando bastante.',
        'otra vez tú. Al final esto va a ser costumbre.',
      ],
      rng,
    )}`;
  }

  return undefined;
}