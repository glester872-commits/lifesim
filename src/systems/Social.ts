import type {
  Act,
  Mood,
  Place,
} from '../data/chat.ts';

import type {
  Temperament,
} from '../data/identity.ts';

// ================================================================
// TIPOS
// ================================================================

export type RelationshipState =
  | 'STRANGER'
  | 'ACQUAINTANCE'
  | 'FRIEND'
  | 'CLOSE_FRIEND'
  | 'ATTRACTION'
  | 'ROMANTIC_INTEREST'
  | 'PARTNER';

export type SocialOutcome =
  | 'positive'
  | 'neutral'
  | 'negative';

export type SocialActionId =
  | 'greet'
  | 'howru'
  | 'casual'
  | 'question'
  | 'joke'
  | 'compliment'
  | 'flirt'
  | 'ask-status'
  | 'ask-contact'
  | 'invite-coffee'
  | 'invite-drink'
  | 'propose-plan'
  | 'propose-date'
  | 'bye';

export type SocialMemoryKind =
  | 'COMPLIMENT'
  | 'FLIRT'
  | 'CONTACT_REQUEST'
  | 'INVITATION'
  | 'DATE'
  | 'ARGUMENT'
  | 'PROMISE'
  | 'SHARED_EVENT';

export interface SocialStats {
  /**
   * Cercanía general.
   * 0 = desconocido.
   * 100 = vínculo muy fuerte.
   */
  friendship: number;

  /**
   * Atracción romántica.
   * No implica automáticamente relación.
   */
  attraction: number;

  /**
   * Confianza.
   * Hace falta para abrir interacciones más personales.
   */
  trust: number;

  /**
   * Desarrollo romántico real.
   * Sube después de interacciones románticas positivas.
   */
  romance: number;

  /**
   * Estado emocional persistente hacia el jugador.
   * 0 = muy negativo.
   * 50 = neutral.
   * 100 = muy positivo.
   */
  mood: number;
}

export interface SocialMoment {
  day: number;
  hour: number;
  minute: number;
}

export interface SocialMemory {
  id: string;

  kind: SocialMemoryKind;

  day: number;
  hour: number;
  minute: number;

  outcome: SocialOutcome;

  place?: Place;

  /**
   * Información pequeña y estable.
   *
   * Ejemplos:
   * "café"
   * "rechazó cita"
   * "promesa de volver a hablar"
   */
  note?: string;
}

export interface SocialProfile
  extends SocialStats {
  encounters: number;

  contactExchanged: boolean;

  datesAccepted: number;
  datesRejected: number;

  flirtSuccesses: number;
  flirtFailures: number;

  lastInteraction?: SocialMoment;

  memories: SocialMemory[];
}

export type SocialState =
  Record<string, SocialProfile>;

export interface SocialContext {
  day: number;
  hour: number;
  minute: number;

  place: Place;
  act: Act;

  /**
   * Mood instantáneo del sistema de conversación.
   */
  mood: Mood;

  temperament: Temperament;
}

export interface SocialDelta {
  friendship: number;
  attraction: number;
  trust: number;
  romance: number;
  mood: number;
}

export interface SocialResolution {
  action: SocialActionId;

  outcome: SocialOutcome;

  /**
   * Probabilidad positiva calculada antes de tirar.
   * Útil para debug.
   */
  positiveChance: number;

  delta: SocialDelta;

  stateBefore: RelationshipState;
  stateAfter: RelationshipState;

  profile: SocialProfile;

  memory?: SocialMemory;
}

export interface SocialActionDefinition {
  id: SocialActionId;
  label: string;
}

// ================================================================
// DEFINICIONES DE UI
// ================================================================

export const SOCIAL_ACTIONS:
  Readonly<
    Record<
      SocialActionId,
      SocialActionDefinition
    >
  > = {
  greet: {
    id: 'greet',
    label: 'Saludar',
  },

  howru: {
    id: 'howru',
    label: 'Preguntar cómo está',
  },

  casual: {
    id: 'casual',
    label: 'Conversación casual',
  },

  question: {
    id: 'question',
    label: 'Hacer una pregunta',
  },

  joke: {
    id: 'joke',
    label: 'Hacer una broma',
  },

  compliment: {
    id: 'compliment',
    label: 'Hacer un cumplido',
  },

  flirt: {
    id: 'flirt',
    label: 'Coquetear',
  },

  'ask-status': {
    id: 'ask-status',
    label: 'Preguntar si está soltero/a',
  },

  'ask-contact': {
    id: 'ask-contact',
    label: 'Pedir contacto',
  },

  'invite-coffee': {
    id: 'invite-coffee',
    label: 'Invitar a un café',
  },

  'invite-drink': {
    id: 'invite-drink',
    label: 'Invitar a tomar algo',
  },

  'propose-plan': {
    id: 'propose-plan',
    label: 'Proponer un plan',
  },

  'propose-date': {
    id: 'propose-date',
    label: 'Proponer una cita',
  },

  bye: {
    id: 'bye',
    label: 'Despedirse',
  },
};

// ================================================================
// VALORES INICIALES
// ================================================================

export const EMPTY_SOCIAL_STATS:
  Readonly<SocialStats> = {
  friendship: 0,
  attraction: 0,
  trust: 0,
  romance: 0,
  mood: 50,
};

export function createSocialProfile():
  SocialProfile {
  return {
    ...EMPTY_SOCIAL_STATS,

    encounters: 0,

    contactExchanged: false,

    datesAccepted: 0,
    datesRejected: 0,

    flirtSuccesses: 0,
    flirtFailures: 0,

    memories: [],
  };
}

// ================================================================
// NORMALIZACIÓN
// ================================================================

const clamp = (
  value: number,
  min = 0,
  max = 100,
): number =>
  Math.max(
    min,
    Math.min(
      max,
      value,
    ),
  );

const safeNumber = (
  value: unknown,
  fallback: number,
): number =>
  typeof value === 'number' &&
  Number.isFinite(value)
    ? value
    : fallback;

const safeInt = (
  value: unknown,
  fallback = 0,
): number =>
  Math.max(
    0,
    Math.floor(
      safeNumber(
        value,
        fallback,
      ),
    ),
  );

const isRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value);

const VALID_OUTCOMES =
  new Set<SocialOutcome>([
    'positive',
    'neutral',
    'negative',
  ]);

const VALID_MEMORY_KINDS =
  new Set<SocialMemoryKind>([
    'COMPLIMENT',
    'FLIRT',
    'CONTACT_REQUEST',
    'INVITATION',
    'DATE',
    'ARGUMENT',
    'PROMISE',
    'SHARED_EVENT',
  ]);

function parseMemory(
  value: unknown,
): SocialMemory | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !==
      'string' ||
    typeof value.kind !==
      'string' ||
    !VALID_MEMORY_KINDS.has(
      value.kind as SocialMemoryKind,
    ) ||
    typeof value.outcome !==
      'string' ||
    !VALID_OUTCOMES.has(
      value.outcome as SocialOutcome,
    )
  ) {
    return null;
  }

  const day =
    safeInt(
      value.day,
      1,
    );

  const hour =
    clamp(
      safeInt(
        value.hour,
      ),
      0,
      23,
    );

  const minute =
    clamp(
      safeInt(
        value.minute,
      ),
      0,
      59,
    );

  const memory:
    SocialMemory = {
    id: value.id,

    kind:
      value.kind as SocialMemoryKind,

    day,

    hour,

    minute,

    outcome:
      value.outcome as SocialOutcome,
  };

  if (
    typeof value.place ===
    'string'
  ) {
    memory.place =
      value.place as Place;
  }

  if (
    typeof value.note ===
    'string'
  ) {
    memory.note =
      value.note.slice(
        0,
        160,
      );
  }

  return memory;
}

/**
 * Convierte datos de una partida guardada en un perfil seguro.
 *
 * Una partida antigua sin Social simplemente comienza desde cero.
 */
export function parseSocialProfile(
  value: unknown,
): SocialProfile {
  const empty =
    createSocialProfile();

  if (!isRecord(value)) {
    return empty;
  }

  const profile:
    SocialProfile = {
    friendship:
      clamp(
        safeNumber(
          value.friendship,
          0,
        ),
      ),

    attraction:
      clamp(
        safeNumber(
          value.attraction,
          0,
        ),
      ),

    trust:
      clamp(
        safeNumber(
          value.trust,
          0,
        ),
      ),

    romance:
      clamp(
        safeNumber(
          value.romance,
          0,
        ),
      ),

    mood:
      clamp(
        safeNumber(
          value.mood,
          50,
        ),
      ),

    encounters:
      safeInt(
        value.encounters,
      ),

    contactExchanged:
      value.contactExchanged ===
      true,

    datesAccepted:
      safeInt(
        value.datesAccepted,
      ),

    datesRejected:
      safeInt(
        value.datesRejected,
      ),

    flirtSuccesses:
      safeInt(
        value.flirtSuccesses,
      ),

    flirtFailures:
      safeInt(
        value.flirtFailures,
      ),

    memories:
      Array.isArray(
        value.memories,
      )
        ? value.memories
            .map(
              parseMemory,
            )
            .filter(
              (
                memory,
              ): memory is SocialMemory =>
                memory !== null,
            )
            .slice(-40)
        : [],
  };

  if (
    isRecord(
      value.lastInteraction,
    )
  ) {
    profile.lastInteraction = {
      day:
        safeInt(
          value
            .lastInteraction
            .day,
          1,
        ),

      hour:
        clamp(
          safeInt(
            value
              .lastInteraction
              .hour,
          ),
          0,
          23,
        ),

      minute:
        clamp(
          safeInt(
            value
              .lastInteraction
              .minute,
          ),
          0,
          59,
        ),
    };
  }

  return profile;
}

export function parseSocialState(
  value: unknown,
): SocialState {
  if (!isRecord(value)) {
    return {};
  }

  const out:
    SocialState = {};

  for (
    const [
      id,
      profile,
    ] of
    Object.entries(value)
  ) {
    out[id] =
      parseSocialProfile(
        profile,
      );
  }

  return out;
}

// ================================================================
// ESTADO DE RELACIÓN
// ================================================================

/**
 * Estado visible/principal de la relación.
 *
 * Hay requisitos múltiples para impedir saltos absurdos:
 * no basta con tener attraction alta para convertirse en pareja.
 */
export function relationshipState(
  profile: SocialProfile,
): RelationshipState {
  if (
    profile.datesAccepted >= 2 &&
    profile.romance >= 75 &&
    profile.attraction >= 65 &&
    profile.trust >= 55
  ) {
    return 'PARTNER';
  }

  if (
    profile.romance >= 45 &&
    profile.attraction >= 55 &&
    profile.trust >= 35
  ) {
    return 'ROMANTIC_INTEREST';
  }

  if (
    profile.attraction >= 35 &&
    profile.friendship >= 15
  ) {
    return 'ATTRACTION';
  }

  if (
    profile.friendship >= 65 &&
    profile.trust >= 55
  ) {
    return 'CLOSE_FRIEND';
  }

  if (
    profile.friendship >= 35 &&
    profile.trust >= 20
  ) {
    return 'FRIEND';
  }

  if (
    profile.encounters >= 2 ||
    profile.friendship >= 8 ||
    profile.trust >= 8
  ) {
    return 'ACQUAINTANCE';
  }

  return 'STRANGER';
}

/**
 * Compatibilidad con el rel 0/1/2 que ya usa Chat.ts.
 */
export function chatRelationLevel(
  profile: SocialProfile,
): 0 | 1 | 2 {
  const state =
    relationshipState(
      profile,
    );

  if (
    state === 'STRANGER'
  ) {
    return 0;
  }

  if (
    state ===
    'ACQUAINTANCE'
  ) {
    return 1;
  }

  return 2;
}

// ================================================================
// ENCUENTROS
// ================================================================

/**
 * Se llama una vez al terminar una conversación significativa
 * con un Named Character.
 */
export function noteSocialEncounter(
  source: SocialProfile,
  moment: SocialMoment,
): SocialProfile {
  const profile =
    cloneProfile(
      source,
    );

  profile.encounters +=
    1;

  profile.lastInteraction = {
    ...moment,
  };

  return profile;
}

// ================================================================
// ACCIONES DISPONIBLES
// ================================================================

const STATE_RANK:
  Readonly<
    Record<
      RelationshipState,
      number
    >
  > = {
  STRANGER: 0,
  ACQUAINTANCE: 1,
  FRIEND: 2,
  CLOSE_FRIEND: 3,
  ATTRACTION: 4,
  ROMANTIC_INTEREST: 5,
  PARTNER: 6,
};

const atLeast = (
  profile: SocialProfile,
  state: RelationshipState,
): boolean =>
  STATE_RANK[
    relationshipState(
      profile,
    )
  ] >=
  STATE_RANK[state];

/**
 * Opciones sociales que tienen sentido AHORA.
 *
 * Chat.ts decidirá después cuáles muestra de todas estas.
 */
export function availableSocialActions(
  profile: SocialProfile,
  context: SocialContext,
): SocialActionId[] {
  const actions:
    SocialActionId[] = [
    'greet',
    'howru',
    'casual',
    'question',
    'joke',
    'bye',
  ];

  const hurried =
    context.mood ===
    'hurried';

  const working =
    context.act ===
    'work';

  if (!hurried) {
    actions.push(
      'compliment',
    );
  }

  if (
    !hurried &&
    atLeast(
      profile,
      'ACQUAINTANCE',
    ) &&
    profile.trust >= 8
  ) {
    actions.push(
      'flirt',
    );
  }

  if (
    !hurried &&
    atLeast(
      profile,
      'ACQUAINTANCE',
    ) &&
    profile.trust >= 15
  ) {
    actions.push(
      'ask-status',
    );
  }

  if (
    !hurried &&
    !profile.contactExchanged &&
    atLeast(
      profile,
      'ACQUAINTANCE',
    ) &&
    profile.trust >= 20 &&
    // Tras un «no» o un «aún no» no se vuelve a pedir enseguida.
    !contactOnCooldown(
      profile,
      context.day,
    )
  ) {
    actions.push(
      'ask-contact',
    );
  }

  if (
    !hurried &&
    !working &&
    atLeast(
      profile,
      'ACQUAINTANCE',
    ) &&
    profile.friendship >= 15
  ) {
    actions.push(
      'invite-coffee',
    );
  }

  if (
    !hurried &&
    !working &&
    (
      context.hour >= 18 ||
      context.place ===
        'nightlife'
    ) &&
    (
      profile.friendship >= 20 ||
      profile.attraction >= 20
    )
  ) {
    actions.push(
      'invite-drink',
    );
  }

  if (
    !hurried &&
    !working &&
    atLeast(
      profile,
      'FRIEND',
    ) &&
    profile.trust >= 30
  ) {
    actions.push(
      'propose-plan',
    );
  }

  if (
    !hurried &&
    !working &&
    profile.attraction >= 45 &&
    profile.trust >= 30 &&
    (
      atLeast(
        profile,
        'ATTRACTION',
      ) ||
      profile.romance >= 20
    ) &&
    !atLeast(
      profile,
      'PARTNER',
    )
  ) {
    actions.push(
      'propose-date',
    );
  }

  return actions;
}

// ================================================================
// PROBABILIDAD DE RESPUESTA
// ================================================================

const BASE_POSITIVE:
  Readonly<
    Record<
      SocialActionId,
      number
    >
  > = {
  greet: 0.90,
  howru: 0.78,
  casual: 0.72,
  question: 0.70,
  joke: 0.58,
  compliment: 0.56,

  flirt: 0.40,

  'ask-status': 0.58,
  'ask-contact': 0.46,

  'invite-coffee': 0.52,
  'invite-drink': 0.48,

  'propose-plan': 0.58,
  'propose-date': 0.36,

  bye: 0.95,
};

const BASE_NEGATIVE:
  Readonly<
    Record<
      SocialActionId,
      number
    >
  > = {
  greet: 0.02,
  howru: 0.04,
  casual: 0.05,
  question: 0.06,
  joke: 0.10,
  compliment: 0.12,

  flirt: 0.22,

  'ask-status': 0.14,
  'ask-contact': 0.22,

  'invite-coffee': 0.15,
  'invite-drink': 0.18,

  'propose-plan': 0.12,
  'propose-date': 0.28,

  bye: 0.01,
};

function temperamentModifier(
  action: SocialActionId,
  temperament: Temperament,
): number {
  switch (
    temperament
  ) {
    case 'extrovertido':
      if (
        action ===
          'flirt' ||
        action ===
          'invite-drink' ||
        action ===
          'propose-plan'
      ) {
        return 0.08;
      }

      return 0.04;

    case 'reservado':
      if (
        action ===
          'flirt' ||
        action ===
          'ask-contact' ||
        action ===
          'propose-date'
      ) {
        return -0.10;
      }

      return -0.03;

    case 'curioso':
      if (
        action ===
          'question' ||
        action ===
          'casual' ||
        action ===
          'propose-plan'
      ) {
        return 0.06;
      }

      return 0.02;

    case 'bromista':
      if (
        action ===
        'joke'
      ) {
        return 0.14;
      }

      if (
        action ===
        'flirt'
      ) {
        return 0.04;
      }

      return 0;

    case 'tranquilo':
      if (
        action ===
          'compliment' ||
        action ===
          'invite-coffee'
      ) {
        return 0.04;
      }

      return 0;
  }
}

function contextModifier(
  action: SocialActionId,
  context: SocialContext,
): number {
  let modifier = 0;

  switch (
    context.mood
  ) {
    case 'good':
      modifier += 0.08;
      break;

    case 'neutral':
      break;

    case 'tired':
      modifier -= 0.05;
      break;

    case 'down':
      modifier -= 0.07;
      break;

    case 'hurried':
      modifier -= 0.20;
      break;
  }

  if (
    context.act === 'work'
  ) {
    if (
      action ===
        'flirt' ||
      action ===
        'invite-drink' ||
      action ===
        'propose-date'
    ) {
      modifier -= 0.18;
    }
  }

  if (
    context.place ===
    'nightlife'
  ) {
    if (
      action ===
        'flirt' ||
      action ===
        'invite-drink' ||
      action ===
        'propose-date'
    ) {
      modifier += 0.10;
    }
  }

  if (
    context.place ===
      'food' &&
    (
      action ===
        'invite-coffee' ||
      action ===
        'invite-drink' ||
      action ===
        'propose-date'
    )
  ) {
    modifier += 0.05;
  }

  if (
    context.hour >= 23 ||
    context.hour < 6
  ) {
    if (
      action ===
      'invite-coffee'
    ) {
      modifier -= 0.12;
    }

    if (
      action ===
        'flirt' ||
      action ===
        'invite-drink'
    ) {
      modifier += 0.04;
    }
  }

  return modifier;
}

export function positiveChanceFor(
  profile: SocialProfile,
  action: SocialActionId,
  context: SocialContext,
): number {
  let chance =
    BASE_POSITIVE[
      action
    ];

  /*
   * Cada acción aprovecha estadísticas diferentes.
   *
   * Friendship ayuda a casi todo.
   * Trust pesa especialmente en acciones personales.
   * Attraction y romance pesan en acciones románticas.
   */
  chance +=
    profile.friendship *
    0.0012;

  chance +=
    profile.trust *
    0.0015;

  if (
    action ===
      'flirt' ||
    action ===
      'ask-status' ||
    action ===
      'ask-contact' ||
    action ===
      'invite-drink' ||
    action ===
      'propose-date'
  ) {
    chance +=
      profile.attraction *
      0.0025;
  }

  if (
    action ===
      'propose-date' ||
    action ===
      'flirt'
  ) {
    chance +=
      profile.romance *
      0.0015;
  }

  /*
   * Mood persistente hacia el jugador.
   *
   * 50 = sin modificación.
   */
  chance +=
    (
      profile.mood -
      50
    ) /
    300;

  // El número se da a quien ya es de los suyos (amistad o algo romántico); insistir cada vez lo pone más difícil.
  if (
    action ===
    'ask-contact'
  ) {
    if (
      atLeast(
        profile,
        'FRIEND',
      )
    ) {
      chance += 0.2;
    }

    chance -=
      0.08 *
      failedContactRequests(
        profile,
        context.day,
      );
  }

  if (
    profile.contactExchanged &&
    (
      action ===
        'propose-plan' ||
      action ===
        'propose-date'
    )
  ) {
    chance += 0.05;
  }

  chance +=
    temperamentModifier(
      action,
      context.temperament,
    );

  chance +=
    contextModifier(
      action,
      context,
    );

  return clamp(
    chance,
    0.05,
    0.92,
  );
}

// ================================================================
// DELTAS
// ================================================================

const ZERO_DELTA:
  Readonly<SocialDelta> = {
  friendship: 0,
  attraction: 0,
  trust: 0,
  romance: 0,
  mood: 0,
};

function deltaFor(
  action: SocialActionId,
  outcome: SocialOutcome,
): SocialDelta {
  if (
    outcome ===
    'neutral'
  ) {
    switch (
      action
    ) {
      case 'greet':
      case 'howru':
      case 'casual':
      case 'question':
        return {
          friendship: 1,
          attraction: 0,
          trust: 1,
          romance: 0,
          mood: 0,
        };

      default:
        return {
          ...ZERO_DELTA,
        };
    }
  }

  if (
    outcome ===
    'negative'
  ) {
    switch (
      action
    ) {
      case 'flirt':
        return {
          friendship: -1,
          attraction: -5,
          trust: -4,
          romance: -4,
          mood: -6,
        };

      case 'ask-contact':
        return {
          friendship: -1,
          attraction: -2,
          trust: -3,
          romance: -1,
          mood: -4,
        };

      case 'propose-date':
        return {
          friendship: -1,
          attraction: -4,
          trust: -3,
          romance: -5,
          mood: -5,
        };

      case 'invite-coffee':
      case 'invite-drink':
      case 'propose-plan':
        return {
          friendship: -1,
          attraction: -1,
          trust: -1,
          romance: -1,
          mood: -2,
        };

      case 'compliment':
        return {
          friendship: 0,
          attraction: -2,
          trust: -1,
          romance: 0,
          mood: -2,
        };

      case 'joke':
        return {
          friendship: -1,
          attraction: 0,
          trust: 0,
          romance: 0,
          mood: -2,
        };

      default:
        return {
          ...ZERO_DELTA,
        };
    }
  }

  // ------------------------------------------------------ POSITIVE

  switch (
    action
  ) {
    case 'greet':
      return {
        friendship: 1,
        attraction: 0,
        trust: 1,
        romance: 0,
        mood: 1,
      };

    case 'howru':
      return {
        friendship: 2,
        attraction: 0,
        trust: 2,
        romance: 0,
        mood: 2,
      };

    case 'casual':
      return {
        friendship: 2,
        attraction: 0,
        trust: 1,
        romance: 0,
        mood: 2,
      };

    case 'question':
      return {
        friendship: 1,
        attraction: 0,
        trust: 2,
        romance: 0,
        mood: 1,
      };

    case 'joke':
      return {
        friendship: 3,
        attraction: 1,
        trust: 1,
        romance: 0,
        mood: 4,
      };

    case 'compliment':
      return {
        friendship: 2,
        attraction: 4,
        trust: 1,
        romance: 1,
        mood: 4,
      };

    case 'flirt':
      return {
        friendship: 1,
        attraction: 7,
        trust: 2,
        romance: 5,
        mood: 5,
      };

    case 'ask-status':
      return {
        friendship: 1,
        attraction: 2,
        trust: 3,
        romance: 1,
        mood: 1,
      };

    case 'ask-contact':
      return {
        friendship: 3,
        attraction: 4,
        trust: 5,
        romance: 2,
        mood: 4,
      };

    case 'invite-coffee':
      return {
        friendship: 5,
        attraction: 3,
        trust: 4,
        romance: 2,
        mood: 5,
      };

    case 'invite-drink':
      return {
        friendship: 4,
        attraction: 5,
        trust: 3,
        romance: 3,
        mood: 5,
      };

    case 'propose-plan':
      return {
        friendship: 6,
        attraction: 2,
        trust: 5,
        romance: 2,
        mood: 5,
      };

    case 'propose-date':
      return {
        friendship: 3,
        attraction: 8,
        trust: 5,
        romance: 10,
        mood: 8,
      };

    case 'bye':
      return {
        friendship: 0,
        attraction: 0,
        trust: 0,
        romance: 0,
        mood: 1,
      };
  }
}

// ================================================================
// MEMORIA
// ================================================================

function memoryKindFor(
  action: SocialActionId,
):
  | SocialMemoryKind
  | undefined {
  switch (
    action
  ) {
    case 'compliment':
      return 'COMPLIMENT';

    case 'flirt':
      return 'FLIRT';

    case 'ask-contact':
      return 'CONTACT_REQUEST';

    case 'invite-coffee':
    case 'invite-drink':
    case 'propose-plan':
      return 'INVITATION';

    case 'propose-date':
      return 'DATE';

    default:
      return undefined;
  }
}

function memoryNoteFor(
  action: SocialActionId,
  outcome: SocialOutcome,
): string {
  switch (
    action
  ) {
    case 'compliment':
      return outcome ===
        'positive'
        ? 'recibió bien un cumplido'
        : outcome ===
            'negative'
          ? 'un cumplido le incomodó'
          : 'recibió un cumplido';

    case 'flirt':
      return outcome ===
        'positive'
        ? 'respondió al coqueteo'
        : outcome ===
            'negative'
          ? 'rechazó el coqueteo'
          : 'reaccionó con dudas al coqueteo';

    case 'ask-contact':
      return outcome ===
        'positive'
        ? 'intercambiaron contacto'
        : outcome ===
            'negative'
          ? 'rechazó intercambiar contacto'
          : 'no quiso dar contacto todavía';

    case 'invite-coffee':
      return outcome ===
        'positive'
        ? 'aceptó tomar un café'
        : outcome ===
            'negative'
          ? 'rechazó tomar un café'
          : 'dejó la invitación para otro momento';

    case 'invite-drink':
      return outcome ===
        'positive'
        ? 'aceptó tomar algo'
        : outcome ===
            'negative'
          ? 'rechazó tomar algo'
          : 'no confirmó el plan';

    case 'propose-plan':
      return outcome ===
        'positive'
        ? 'aceptó hacer un plan juntos'
        : outcome ===
            'negative'
          ? 'rechazó el plan'
          : 'dejó el plan pendiente';

    case 'propose-date':
      return outcome ===
        'positive'
        ? 'aceptó una cita'
        : outcome ===
            'negative'
          ? 'rechazó una cita'
          : 'no confirmó la cita';

    default:
      return action;
  }
}

export function noteSocialMemory(
  source: SocialProfile,
  memory: Omit<
    SocialMemory,
    'id'
  >,
): SocialProfile {
  const profile =
    cloneProfile(
      source,
    );

  const id =
    [
      memory.kind,
      memory.day,
      memory.hour,
      memory.minute,
      profile.memories.length,
    ].join(':');

  profile.memories.push({
    id,
    ...memory,
  });

  if (
    profile.memories.length >
    40
  ) {
    profile.memories =
      profile.memories.slice(
        -40,
      );
  }

  return profile;
}

/**
 * Busca la última memoria importante de un tipo concreto.
 *
 * Lo usaremos después para que el diálogo pueda decir
 * "sobre lo del otro día..."
 */
export function lastSocialMemory(
  profile: SocialProfile,
  kind?: SocialMemoryKind,
): SocialMemory | undefined {
  if (!kind) {
    return profile.memories.at(
      -1,
    );
  }

  for (
    let i =
      profile.memories.length -
      1;
    i >= 0;
    i--
  ) {
    if (
      profile.memories[i]
        .kind === kind
    ) {
      return profile.memories[
        i
      ];
    }
  }

  return undefined;
}

// ================================================================
// RESOLVER UNA ACCIÓN
// ================================================================

export function resolveSocialAction(
  source: SocialProfile,
  action: SocialActionId,
  context: SocialContext,
  rng: () => number =
    Math.random,
): SocialResolution {
  const before =
    cloneProfile(
      source,
    );

  const stateBefore =
    relationshipState(
      before,
    );

  const positiveChance =
    positiveChanceFor(
      before,
      action,
      context,
    );

  const negativeChance =
    clamp(
      BASE_NEGATIVE[
        action
      ] -
        before.trust *
          0.0007 -
        before.friendship *
          0.0004,
      0.01,
      0.45,
    ) *
    // Entre amigos o con algo romántico, el número rara vez es un «no» rotundo.
    (action === 'ask-contact' &&
    atLeast(before, 'FRIEND')
      ? 0.4
      : 1);

  const roll =
    rng();

  let outcome:
    SocialOutcome;

  if (
    roll <
    positiveChance
  ) {
    outcome =
      'positive';
  } else if (
    roll >
    1 -
      negativeChance
  ) {
    outcome =
      'negative';
  } else {
    outcome =
      'neutral';
  }

  const delta =
    deltaFor(
      action,
      outcome,
    );

  let profile =
    applyDelta(
      before,
      delta,
    );

  // ------------------------------------------------------- contadores

  if (
    action === 'flirt'
  ) {
    if (
      outcome ===
      'positive'
    ) {
      profile.flirtSuccesses +=
        1;
    }

    if (
      outcome ===
      'negative'
    ) {
      profile.flirtFailures +=
        1;
    }
  }

  if (
    action ===
      'ask-contact' &&
    outcome ===
      'positive'
  ) {
    profile.contactExchanged =
      true;
  }

  if (
    action ===
    'propose-date'
  ) {
    if (
      outcome ===
      'positive'
    ) {
      profile.datesAccepted +=
        1;
    }

    if (
      outcome ===
      'negative'
    ) {
      profile.datesRejected +=
        1;
    }
  }

  profile.lastInteraction = {
    day:
      context.day,

    hour:
      context.hour,

    minute:
      context.minute,
  };

  // ----------------------------------------------------------- memoria

  let memory:
    SocialMemory |
    undefined;

  const memoryKind =
    memoryKindFor(
      action,
    );

  if (memoryKind) {
    const id =
      [
        memoryKind,
        context.day,
        context.hour,
        context.minute,
        profile.memories.length,
      ].join(':');

    memory = {
      id,

      kind:
        memoryKind,

      day:
        context.day,

      hour:
        context.hour,

      minute:
        context.minute,

      outcome,

      place:
        context.place,

      note:
        memoryNoteFor(
          action,
          outcome,
        ),
    };

    profile.memories.push(
      memory,
    );

    if (
      profile.memories.length >
      40
    ) {
      profile.memories =
        profile.memories.slice(
          -40,
        );
    }
  }

  const stateAfter =
    relationshipState(
      profile,
    );

  return {
    action,

    outcome,

    positiveChance,

    delta,

    stateBefore,

    stateAfter,

    profile,

    memory,
  };
}

// ================================================================
// UTILIDADES
// ================================================================

export function applyDelta(
  source: SocialProfile,
  delta: SocialDelta,
): SocialProfile {
  const profile =
    cloneProfile(
      source,
    );

  profile.friendship =
    clamp(
      profile.friendship +
        delta.friendship,
    );

  profile.attraction =
    clamp(
      profile.attraction +
        delta.attraction,
    );

  profile.trust =
    clamp(
      profile.trust +
        delta.trust,
    );

  profile.romance =
    clamp(
      profile.romance +
        delta.romance,
    );

  profile.mood =
    clamp(
      profile.mood +
        delta.mood,
    );

  return profile;
}

export function cloneProfile(
  profile: SocialProfile,
): SocialProfile {
  return {
    friendship:
      profile.friendship,

    attraction:
      profile.attraction,

    trust:
      profile.trust,

    romance:
      profile.romance,

    mood:
      profile.mood,

    encounters:
      profile.encounters,

    contactExchanged:
      profile.contactExchanged,

    datesAccepted:
      profile.datesAccepted,

    datesRejected:
      profile.datesRejected,

    flirtSuccesses:
      profile.flirtSuccesses,

    flirtFailures:
      profile.flirtFailures,

    lastInteraction:
      profile.lastInteraction
        ? {
            ...profile
              .lastInteraction,
          }
        : undefined,

    memories:
      profile.memories.map(
        (memory) => ({
          ...memory,
        }),
      ),
  };
}

/**
 * Texto útil para debug sin meter lógica social dentro de la UI.
 */
export function socialSummary(
  profile: SocialProfile,
): string {
  return [
    relationshipState(
      profile,
    ),

    `friendship ${Math.round(
      profile.friendship,
    )}`,

    `attraction ${Math.round(
      profile.attraction,
    )}`,

    `trust ${Math.round(
      profile.trust,
    )}`,

    `romance ${Math.round(
      profile.romance,
    )}`,

    `mood ${Math.round(
      profile.mood,
    )}`,
  ].join(' · ');
}   

// ================================================================
// CONTACTO (el número de teléfono)
// ================================================================

/**
 * Dónde está el número con esta persona, sacado de la relación y de su memoria (no se guarda aparte):
 * UNKNOWN no os conocéis · MET os habéis visto · KNOWN os conocéis de verdad · REQUEST_AVAILABLE ya se le puede
 * pedir · NOT_YET dijo «aún no» hace poco · REJECTED dijo que no hace poco · EXCHANGED tenéis vuestros números.
 */
export type ContactState =
  | 'UNKNOWN'
  | 'MET'
  | 'KNOWN'
  | 'REQUEST_AVAILABLE'
  | 'NOT_YET'
  | 'REJECTED'
  | 'EXCHANGED';

/** Días sin poder volver a pedirlo tras un «aún no» y tras un «no». */
export const CONTACT_COOLDOWN: Readonly<Record<'neutral' | 'negative', number>> = { neutral: 1, negative: 3 };

/** El último intento de pedir el número que no salió bien, si lo hay. */
function lastFailedContact(profile: SocialProfile): SocialMemory | undefined {
  const last = lastSocialMemory(profile, 'CONTACT_REQUEST');
  // Si fuiste tú quien dijo «ahora no» a su oferta, ella no te ha rechazado: eso no cuenta como intento fallido.
  return last && last.outcome !== 'positive' && !last.note?.startsWith(CONTACT_OFFER_NOTE) ? last : undefined;
}

export function contactOnCooldown(profile: SocialProfile, day: number): boolean {
  const last = lastFailedContact(profile);
  return !!last && day - last.day < CONTACT_COOLDOWN[last.outcome as 'neutral' | 'negative'];
}

function failedContactRequests(profile: SocialProfile, day: number): number {
  return profile.memories.filter((m) => m.kind === 'CONTACT_REQUEST' && m.outcome !== 'positive' && !m.note?.startsWith(CONTACT_OFFER_NOTE) && day - m.day < 7).length;
}

export function contactState(profile: SocialProfile, day: number): ContactState {
  if (profile.contactExchanged) return 'EXCHANGED';
  const last = lastFailedContact(profile);
  if (last && contactOnCooldown(profile, day)) return last.outcome === 'negative' ? 'REJECTED' : 'NOT_YET';
  const state = relationshipState(profile);
  if (state === 'STRANGER') return profile.encounters > 0 ? 'MET' : 'UNKNOWN';
  return profile.trust >= 20 ? 'REQUEST_AVAILABLE' : 'KNOWN';
}

/**
 * Os dais los números por otra vía que pedirlo (lo ofrece ella, lo da su historia): una vez, con su recuerdo.
 * Si ya lo teníais, no cambia nada (ni se repite el recuerdo).
 */
export function grantContact(source: SocialProfile, moment: SocialMoment, note: string): SocialProfile {
  if (source.contactExchanged) return source;
  const profile = noteSocialMemory(source, { kind: 'CONTACT_REQUEST', outcome: 'positive', ...moment, note });
  profile.contactExchanged = true;
  return profile;
}

/** Nota del recuerdo cuando lo ofrece ella: también sirve para no ofrecerlo dos veces seguidas. */
export const CONTACT_OFFER_NOTE = 'te ofreció su número';

/**
 * Probabilidad de que, al acabar una charla, te ofrezca su número sin pedírselo. Nunca a un desconocido ni a
 * quien le dijo que no hace poco; más a una amistad o a quien le gustas; mucho más si hoy habéis quedado en algo
 * (hace falta para avisarse). Una persona extrovertida lo ofrece antes que una reservada.
 */
export function contactOfferChance(profile: SocialProfile, temperament: Temperament, day: number): number {
  if (profile.contactExchanged || profile.trust < 15 || contactOnCooldown(profile, day)) return 0;
  if (profile.memories.some((m) => m.kind === 'CONTACT_REQUEST' && m.note?.startsWith(CONTACT_OFFER_NOTE) && day - m.day < 4)) return 0;
  const state = relationshipState(profile);
  let chance =
    state === 'ATTRACTION' || state === 'ROMANTIC_INTEREST' || state === 'PARTNER' ? 0.45
      : state === 'FRIEND' || state === 'CLOSE_FRIEND' ? 0.35
        : state === 'ACQUAINTANCE' && profile.friendship >= 20 ? 0.12
          : 0;
  if (!chance) return 0;
  // Un plan o una cita aceptados hoy: hay que poder avisarse.
  if (profile.memories.some((m) => (m.kind === 'INVITATION' || m.kind === 'DATE') && m.outcome === 'positive' && m.day === day)) chance += 0.4;
  const temper = temperament === 'extrovertido' ? 1.4 : temperament === 'reservado' ? 0.5 : 1;
  return clamp(chance * temper, 0, 0.9);
}
