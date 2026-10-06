// Sin Phaser: lo usa scenes/WorldScene.ts y lo prueba scripts/check-chat.ts.

import {
  CHAT_LINES,
} from '../data/chatLines.ts';

import {
  CHAT_REPLIES,
} from '../data/chatReplies.ts';

import {
  NAMED_LINES,
  NAMED_VOICES,
} from '../data/chatNamed.ts';

import {
  BYE_LABELS,
  OPTIONS,
  PATIENCE,
  STYLES_BY_TEMPERAMENT,
  type Act,
  type ChatOption,
  type Days,
  type Line,
  type Mood,
  type OptionDef,
  type Place,
  type Style,
  type Topic,
  type Weather,
} from '../data/chat.ts';

import type {
  Interest,
  Temperament,
} from '../data/identity.ts';

import {
  NAMED_PEOPLE,
} from '../data/namedPeople.ts';

import {
  IDENTITIES,
  tieLine,
  tiesOf,
  type Tie,
} from './People.ts';

import {
  nightOwner,
  weekIndex,
} from './Calendar.ts';

import type {
  Rng,
} from './MetroDaily.ts';

import {
  SOCIAL_ACTIONS,
  availableSocialActions,
  cloneProfile,
  resolveSocialAction,
  type SocialActionId,
  type SocialContext,
  type SocialProfile,
} from './Social.ts';

import {
  socialGreeting,
  socialMemoryReference,
  socialReply,
} from './SocialDialogue.ts';

/**
 * Conversación contextual de LifeSim.
 *
 * Prompt 57 amplía el sistema anterior sin sustituirlo:
 *
 * - la gente anónima continúa usando las conversaciones normales;
 * - los Named Characters pueden usar además Social.ts;
 * - las opciones dependen de amistad, atracción, confianza,
 *   romance, humor, personalidad, lugar, hora y actividad;
 * - las respuestas sociales pueden salir bien, mal o neutrales;
 * - el perfil social resultante queda disponible para WorldScene,
 *   que será quien lo guarde en GameState.
 */

// ================================================================
// CONTEXTO
// ================================================================

export interface ChatInput {
  /** Clave estable de memoria. */
  who: string;

  /** Identidad de población anónima. */
  identity?: number;

  /** Named Character. */
  named?: string;

  role?: string;
  state?: string;

  place: Place;

  day: number;
  hour: number;
  minute: number;

  weather: Weather;

  group: boolean;

  /**
   * Compatibilidad con el sistema anterior.
   *
   * 0 = desconocido
   * 1 = conocido
   * 2 = amigo
   */
  rel: 0 | 1 | 2;

  /**
   * Prompt 57.
   *
   * Sólo se pasa para Named Characters.
   */
  social?: SocialProfile;
}

export interface ChatContext {
  who: string;

  named?: string;

  styles:
    readonly Style[];

  mood: Mood;

  act: Act;

  place: Place;

  /**
   * Día absoluto del juego.
   */
  day: number;

  hour: number;
  minute: number;

  /**
   * Día de semana lógico.
   */
  weekday: number;

  weather: Weather;

  interests:
    readonly Interest[];

  temperament:
    Temperament;

  rel:
    0 | 1 | 2;

  group: boolean;

  ties:
    readonly Tie[];
}

const hash = (
  text: string,
): number => {
  let h =
    2166136261;

  for (
    let i = 0;
    i < text.length;
    i++
  ) {
    h =
      Math.imul(
        h ^
          text.charCodeAt(
            i,
          ),
        16777619,
      );
  }

  return h >>> 0;
};

/**
 * Qué está haciendo la persona.
 */
export function actOf(
  role:
    | string
    | undefined,
  state:
    | string
    | undefined,
): Act {
  if (
    state &&
    /^(CARDIO|LIFT|STRETCH|WARM_UP)$/.test(
      state,
    )
  ) {
    return 'exercise';
  }

  if (
    state === 'DANCE' ||
    state === 'CHEER'
  ) {
    return 'nightout';
  }

  const r =
    role ?? '';

  if (
    /commut|metro|bus|office|returning/.test(
      r,
    )
  ) {
    return 'commute';
  }

  if (
    /gym|jog|run/.test(
      r,
    )
  ) {
    return 'exercise';
  }

  if (
    /club|night|bar-|carmen-prenight|popup-dj/.test(
      r,
    )
  ) {
    return 'nightout';
  }

  if (
    /terrace|brunch|coffee|diner|customer|takeaway/.test(
      r,
    )
  ) {
    return 'food';
  }

  if (
    /shop|errand|browse|window|outfit|sneaker|market|popup-art|piercing|tattoo|fashion/.test(
      r,
    )
  ) {
    return 'shop';
  }

  if (
    /park|reader|bench|dog|stroll|talk|couple|friends|hang/.test(
      r,
    )
  ) {
    return 'relax';
  }

  if (
    /tourist/.test(
      r,
    )
  ) {
    return 'tourist';
  }

  if (
    /wait|queue/.test(
      r,
    ) ||
    state === 'WAIT'
  ) {
    return 'wait';
  }

  if (
    /waiter|bartender|receptionist|staff|worker/.test(
      r,
    )
  ) {
    return 'work';
  }

  return 'walk';
}

/**
 * Dónde está.
 */
export function placeOf(
  location: string,
  zoneType?: string,
): Place {
  if (
    location ===
    'district'
  ) {
    switch (
      zoneType
    ) {
      case 'residential':
        return 'residential';

      case 'plaza':
        return 'plaza';

      case 'gym_area':
        return 'gym';

      case 'restaurant_area':
        return 'food';

      case 'metro':
        return 'metro';

      case 'park':
        return 'park';

      case 'nightlife':
        return 'nightlife';

      default:
        return 'street';
    }
  }

  if (
    /gym/.test(
      location,
    )
  ) {
    return 'gym';
  }

  if (
    /cafe|restaurant|wine|bar/.test(
      location,
    )
  ) {
    return 'food';
  }

  if (
    /clothing|super|store|shop|vintage|archivo|vuelta/.test(
      location,
    )
  ) {
    return 'shop';
  }

  if (
    /club|nightclub/.test(
      location,
    )
  ) {
    return 'nightlife';
  }

  return 'indoors';
}

/**
 * Tiempo meteorológico resumido.
 */
export function weatherKind(
  w: {
    rain: number;
    temp: string;
  },
): Weather {
  if (
    w.rain > 0.08
  ) {
    return 'rain';
  }

  if (
    w.temp === 'cold'
  ) {
    return 'cold';
  }

  if (
    w.temp === 'warm'
  ) {
    return 'warm';
  }

  return 'clear';
}

const isRush = (
  h: number,
): boolean =>
  (
    h >= 7 &&
    h < 9.8
  ) ||
  (
    h >= 17 &&
    h < 19.2
  );

/**
 * Ánimo contextual.
 */
function moodOf(
  who: string,
  act: Act,
  hour: number,
  wx: Weather,
): Mood {
  const roll =
    (
      hash(
        `${who}:${Math.floor(
          hour / 3,
        )}:ánimo`,
      ) %
      1000
    ) /
    1000;

  const hurried =
    act === 'commute'
      ? isRush(hour)
        ? 0.5
        : 0.18
      : act === 'walk' ||
          act === 'shop'
        ? 0.06
        : 0;

  const late =
    hour < 6 ||
    hour >= 23;

  const tired =
    late
      ? 0.4
      : hour < 8
        ? 0.2
        : 0.1;

  const down =
    wx === 'rain'
      ? 0.18
      : 0.07;

  const good =
    act === 'nightout' ||
    act === 'relax' ||
    act === 'food'
      ? 0.45
      : 0.3;

  if (
    roll < hurried
  ) {
    return 'hurried';
  }

  if (
    roll <
    hurried + tired
  ) {
    return 'tired';
  }

  if (
    roll <
    hurried +
      tired +
      down
  ) {
    return 'down';
  }

  if (
    roll <
    hurried +
      tired +
      down +
      good
  ) {
    return 'good';
  }

  return 'neutral';
}

export function buildContext(
  i: ChatInput,
): ChatContext {
  const identity =
    i.identity !== undefined
      ? IDENTITIES[
          i.identity
        ]
      : undefined;

  const voice =
    i.named
      ? NAMED_VOICES[
          i.named
        ]
      : undefined;

  const namedIdentity =
    i.named
      ? NAMED_PEOPLE[
          i.named
        ]
      : undefined;

  const temperament:
    Temperament =
    namedIdentity?.temperament ??
    identity?.temperament ??
    'tranquilo';

  const styleOptions =
    voice?.styles ??
    STYLES_BY_TEMPERAMENT[
      temperament
    ] ??
    [
      'calm',
    ];

  const style =
    styleOptions[
      hash(
        `${i.who}:estilo`,
      ) %
        styleOptions.length
    ];

  const act =
    actOf(
      i.role,
      i.state,
    );

  const hour =
    i.hour +
    i.minute / 60;

  return {
    who:
      i.who,

    named:
      i.named,

    styles:
      voice
        ? [
            ...voice.styles,
          ]
        : [
            style,
          ],

    mood:
      moodOf(
        i.who,
        act,
        hour,
        i.weather,
      ),

    act,

    place:
      i.place,

    day:
      i.day,

    hour,

    minute:
      i.minute,

    weekday:
      weekIndex(
        nightOwner(
          i.day,
          i.hour,
        ),
      ),

    weather:
      i.weather,

    interests:
      voice?.interests ??
      identity?.interests ??
      [],

    temperament,

    rel:
      i.rel,

    group:
      i.group,

    ties:
      tiesOf({
        identity:
          i.identity,

        named:
          i.named,
      }),
  };
}

// ================================================================
// MEMORIA DE DIÁLOGO
// ================================================================

class Mem {
  lines:
    string[] = [];

  topics:
    string[] = [];

  chats = 0;

  /**
   * La última respuesta preguntó algo.
   */
  asked = false;
}

export class ChatLog {
  private readonly mems =
    new Map<
      string,
      Mem
    >();

  private readonly recent:
    string[] = [];

  mem(
    key: string,
  ): Mem {
    let m =
      this.mems.get(
        key,
      );

    if (!m) {
      if (
        this.mems.size >=
        400
      ) {
        this.mems.delete(
          this.mems
            .keys()
            .next()
            .value as string,
        );
      }

      this.mems.set(
        key,
        (
          m =
            new Mem()
        ),
      );
    }

    return m;
  }

  chatsWith(
    key: string,
  ): number {
    return (
      this.mems.get(
        key,
      )?.chats ??
      0
    );
  }

  noted(
    key: string,
    line: Line,
    named: boolean,
  ): void {
    const m =
      this.mem(
        key,
      );

    m.lines.push(
      line.id,
    );

    m.topics.push(
      line.topic,
    );

    if (
      m.lines.length >
      (
        named
          ? 160
          : 40
      )
    ) {
      m.lines.shift();
    }

    if (
      m.topics.length >
      8
    ) {
      m.topics.shift();
    }

    this.recent.push(
      line.id,
    );

    if (
      this.recent.length >
      14
    ) {
      this.recent.shift();
    }
  }

  recentAll():
    readonly string[] {
    return this.recent;
  }

  forgetCrowd(): void {
    for (
      const k of
      [
        ...this.mems.keys(),
      ]
    ) {
      if (
        k.startsWith(
          'c:',
        )
      ) {
        this.mems.delete(
          k,
        );
      }
    }
  }
}

// ================================================================
// POOLS
// ================================================================

const POOLS:
  Readonly<
    Record<
      string,
      readonly Line[]
    >
  > = (() => {
  const out:
    Record<
      string,
      Line[]
    > = {};

  for (
    const l of [
      ...CHAT_LINES,
      ...CHAT_REPLIES,
      ...NAMED_LINES,
    ]
  ) {
    (
      out[l.topic] ??=
        []
    ).push(
      l,
    );
  }

  return out;
})();

export const ALL_LINES:
  readonly Line[] = [
  ...CHAT_LINES,
  ...CHAT_REPLIES,
  ...NAMED_LINES,
];

const inHours = (
  h:
    readonly [
      number,
      number,
    ],
  t: number,
): boolean =>
  h[0] <= h[1]
    ? (
        t >= h[0] &&
        t < h[1]
      )
    : (
        t >= h[0] ||
        t < h[1]
      );

function daysOk(
  d: Days,
  c: ChatContext,
): boolean {
  const wd =
    c.weekday;

  switch (d) {
    case 'weekday':
      return wd <= 4;

    case 'weekend':
      return wd >= 5;

    case 'friday':
      return wd === 4;

    case 'saturday':
      return wd === 5;

    case 'sunday':
      return wd === 6;

    case 'night-out':
      return (
        (
          wd === 4 ||
          wd === 5
        ) &&
        (
          c.hour >= 19 ||
          c.hour < 6
        )
      );
  }
}

const pick = <T>(
  rng: Rng,
  items:
    readonly (
      readonly [
        T,
        number,
      ]
    )[],
): T | undefined => {
  const total =
    items.reduce(
      (
        s,
        [
          ,
          w,
        ],
      ) =>
        s + w,
      0,
    );

  if (
    total <= 0
  ) {
    return undefined;
  }

  let roll =
    rng() *
    total;

  for (
    const [
      item,
      w,
    ] of items
  ) {
    roll -= w;

    if (
      roll < 0
    ) {
      return item;
    }
  }

  return items[
    items.length - 1
  ][0];
};

// ================================================================
// FILTRO DE FRASES
// ================================================================

export function fit(
  l: Line,
  c: ChatContext,
): number {
  if (
    l.n &&
    l.n !==
      c.named
  ) {
    return 0;
  }

  if (
    l.s &&
    !l.s.some(
      (s) =>
        c.styles.includes(
          s,
        ),
    )
  ) {
    return 0;
  }

  if (
    l.m &&
    !l.m.includes(
      c.mood,
    )
  ) {
    return 0;
  }

  if (
    l.a &&
    !l.a.includes(
      c.act,
    )
  ) {
    return 0;
  }

  if (
    l.p &&
    !l.p.includes(
      c.place,
    )
  ) {
    return 0;
  }

  if (
    l.h &&
    !inHours(
      l.h,
      c.hour,
    )
  ) {
    return 0;
  }

  if (
    l.d &&
    !daysOk(
      l.d,
      c,
    )
  ) {
    return 0;
  }

  if (
    l.w &&
    !l.w.includes(
      c.weather,
    )
  ) {
    return 0;
  }

  if (
    l.i &&
    !l.i.some(
      (i) =>
        c.interests.includes(
          i,
        ),
    )
  ) {
    return 0;
  }

  if (
    l.r &&
    c.rel < l.r
  ) {
    return 0;
  }

  if (
    l.g &&
    (
      l.g === 'group'
    ) !==
      c.group
  ) {
    return 0;
  }

  let w = 1;

  if (l.s) {
    w *= 2;
  }

  if (l.m) {
    w *= 2;
  }

  if (l.a) {
    w *= 1.8;
  }

  if (l.p) {
    w *= 1.5;
  }

  if (l.h) {
    w *= 1.3;
  }

  if (l.d) {
    w *= 1.6;
  }

  if (l.w) {
    w *= 3;
  }

  if (l.i) {
    w *= 2.2;
  }

  if (l.r) {
    w *=
      l.r === c.rel
        ? 3
        : 1.8;
  }

  if (l.n) {
    w *= 6;
  }

  return w;
}

const SHORT_STYLES:
  readonly Style[] = [
  'reserved',
  'shy',
  'dry',
  'direct',
];

const LONG_STYLES:
  readonly Style[] = [
  'talkative',
  'friendly',
  'energetic',
];

function lengthFit(
  text: string,
  c: ChatContext,
): number {
  const short =
    c.styles.some(
      (s) =>
        SHORT_STYLES.includes(
          s,
        ),
    );

  const long =
    c.styles.some(
      (s) =>
        LONG_STYLES.includes(
          s,
        ),
    );

  if (
    c.mood ===
    'hurried'
  ) {
    return text.length >
      60
      ? 0.3
      : 1.4;
  }

  if (
    short &&
    !long
  ) {
    if (
      text.length <= 40
    ) {
      return 3;
    }

    if (
      text.length > 90
    ) {
      return 0.12;
    }

    return 0.6;
  }

  if (
    long &&
    !short
  ) {
    if (
      text.length > 70
    ) {
      return 2.6;
    }

    if (
      text.length <= 22
    ) {
      return 0.45;
    }

    return 1;
  }

  return 1;
}

// ================================================================
// HORA HABLADA
// ================================================================

const SPOKEN = [
  'doce',
  'una',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
  'once',
];

const DAYS = [
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
  'domingo',
];

export function spokenTime(
  hour: number,
  minute: number,
): string {
  let q =
    Math.round(
      minute / 15,
    ) *
    15;

  let h =
    Math.floor(
      hour,
    );

  if (
    q === 60
  ) {
    q = 0;

    h =
      (
        h + 1
      ) %
      24;
  }

  const next =
    (
      h + 1
    ) %
    24;

  const say = (
    n: number,
  ): string =>
    `${
      n % 12 === 1
        ? 'la'
        : 'las'
    } ${
      SPOKEN[
        n % 12
      ]
    }`;

  if (
    q === 0
  ) {
    return say(
      h,
    );
  }

  if (
    q === 15
  ) {
    return `${say(
      h,
    )} y cuarto`;
  }

  if (
    q === 30
  ) {
    return `${say(
      h,
    )} y media`;
  }

  return `${say(
    next,
  )} menos cuarto`;
}

const cap = (
  s: string,
): string =>
  s.charAt(
    0,
  ).toUpperCase() +
  s.slice(
    1,
  );

export function fill(
  text: string,
  c: ChatContext,
): string {
  if (
    !text.includes(
      '{',
    )
  ) {
    return text;
  }

  const t =
    spokenTime(
      Math.floor(
        c.hour,
      ),
      c.minute,
    );

  const singular =
    t.startsWith(
      'la ',
    );

  const day =
    DAYS[
      c.weekday
    ];

  const plural =
    day ===
      'sábado' ||
    day ===
      'domingo'
      ? `${day}s`
      : day;

  return text
    .replaceAll(
      '{Hora}',
      cap(t),
    )
    .replaceAll(
      '{hora}',
      t,
    )
    .replaceAll(
      '{Ahora}',
      `A ${t}`,
    )
    .replaceAll(
      '{ahora}',
      `a ${t}`,
    )
    .replaceAll(
      '{es}',
      singular
        ? 'es'
        : 'son',
    )
    .replaceAll(
      '{dias}',
      plural,
    )
    .replaceAll(
      '{dia}',
      day,
    );
}

// ================================================================
// CHAT TURN
// ================================================================

export interface ChatTurn {
  lines:
    string[];

  options:
    ChatOption[];

  ends:
    boolean;

  ids:
    string[];

  topics:
    Topic[];
}

const REMARK_TOPICS:
  readonly Topic[] = [
  'weather',
  'time',
  'neighborhood',
  'city',
  'positive',
  'tired',
  'complaint',
  'weekend',
  'nightlife',
  'transit',
  'food',
  'work',
  'plans',
  'music',
  'fashion',
  'sports',
  'fitness',
];

const SOCIAL_IDS =
  new Set<string>(
    Object.keys(
      SOCIAL_ACTIONS,
    ),
  );

const isSocialAction = (
  id: string,
): id is SocialActionId =>
  SOCIAL_IDS.has(
    id,
  );

/**
 * Tema técnico para que las respuestas sociales
 * sigan encajando en ChatTurn.
 */
function socialTopic(
  action: SocialActionId,
): Topic {
  switch (action) {
    case 'greet':
      return 'greeting';

    case 'howru':
      return 'friendly';

    case 'casual':
    case 'question':
      return 'smalltalk';

    case 'joke':
      return 'joke-back';

    case 'compliment':
    case 'flirt':
    case 'ask-status':
    case 'ask-contact':
      return 'compliment-back';

    case 'invite-coffee':
    case 'invite-drink':
    case 'propose-plan':
    case 'propose-date':
      return 'plans';

    case 'bye':
      return 'bye-short';
  }
}

// ================================================================
// CONVERSATION
// ================================================================

export class Conversation {
  readonly ctx:
    ChatContext;

  private readonly log:
    ChatLog;

  private readonly rng:
    Rng;

  private readonly named:
    boolean;

  private readonly patience:
    number;

  private readonly usedOptions =
    new Set<string>();

  private turns = 0;

  private lastAsked =
    false;

  /**
   * Sistema anterior.
   *
   * Se mantiene para compatibilidad con importantNPCsMet.
   */
  positives = 0;

  /**
   * Prompt 57.
   */
  private socialProfile:
    SocialProfile |
    undefined;

  private socialTouched =
    false;

  constructor(
    input: ChatInput,
    log: ChatLog,
    rng: Rng =
      Math.random,
  ) {
    this.ctx =
      buildContext(
        input,
      );

    this.log =
      log;

    this.rng =
      rng;

    this.named =
      !!input.named;

    this.socialProfile =
      input.named &&
      input.social
        ? cloneProfile(
            input.social,
          )
        : undefined;

    const base =
      Math.max(
        ...this.ctx.styles.map(
          (s) =>
            PATIENCE[
              s
            ],
        ),
      );

    this.patience =
      this.ctx.mood ===
        'hurried'
        ? 1
        : this.ctx.mood ===
              'tired' ||
            this.ctx.mood ===
              'down'
          ? Math.max(
              1,
              base - 1,
            )
          : base;

    this.lastAsked =
      log.mem(
        input.who,
      ).asked;
  }

  /**
   * Perfil social resultante de esta conversación.
   *
   * WorldScene lo guardará después.
   */
  get social():
    SocialProfile |
    undefined {
    return this.socialProfile
      ? cloneProfile(
          this.socialProfile,
        )
      : undefined;
  }

  /**
   * Indica si alguna acción social modificó el perfil.
   */
  get socialChanged():
    boolean {
    return this.socialTouched;
  }

  // ==============================================================
  // APERTURA
  // ==============================================================

  open(): ChatTurn {
    const c =
      this.ctx;

    const mem =
      this.log.mem(
        c.who,
      );

    mem.chats++;

    const said:
      Line[] = [];

    const greet =
      this.line(
        'greeting',
      );

    if (greet) {
      said.push(
        greet,
      );
    }

    /*
     * Prompt 57:
     * un personaje que ya conoce al jugador puede saludar distinto
     * o recordar algo importante.
     */
    if (
      this.socialProfile &&
      c.named
    ) {
      const remembered =
        socialMemoryReference(
          this.socialProfile,
          c.day,
          this.rng,
        );

      const personalGreeting =
        socialGreeting(
          this.socialProfile,
          c.mood,
          this.rng,
        );

      if (
        remembered &&
        this.rng() <
          0.38
      ) {
        said.push(
          this.syntheticLine(
            'memory',
            remembered,
            'friendly',
          ),
        );
      } else if (
        personalGreeting &&
        this.rng() <
          0.48
      ) {
        said.push(
          this.syntheticLine(
            'relationship-greeting',
            personalGreeting,
            'friendly',
          ),
        );
      }
    }

    if (
      c.mood ===
      'hurried'
    ) {
      const rush =
        this.line(
          'hurried',
        );

      if (rush) {
        said.push(
          rush,
        );
      }
    } else if (
      said.length < 2 &&
      this.rng() <
        this.remarkChance()
    ) {
      const topic =
        this.remarkTopic();

      const remark =
        topic &&
        this.line(
          topic,
        );

      if (remark) {
        said.push(
          remark,
        );
      }
    }

    return this.turn(
      said,
      false,
    );
  }

  // ==============================================================
  // ELECCIÓN
  // ==============================================================

  choose(
    optionId: string,
  ): ChatTurn {
    /*
     * Prompt 57.
     *
     * Sólo un Named Character con SocialProfile usa
     * el motor social.
     */
    if (
      this.socialProfile &&
      this.ctx.named &&
      isSocialAction(
        optionId,
      ) &&
      this.socialAvailable(
        optionId,
      )
    ) {
      return this.chooseSocial(
        optionId,
      );
    }

    return this.chooseClassic(
      optionId,
    );
  }

  /**
   * Sistema clásico.
   */
  private chooseClassic(
    optionId: string,
  ): ChatTurn {
    const c =
      this.ctx;

    this.usedOptions.add(
      optionId,
    );

    this.turns++;

    this.lastAsked =
      false;

    const said:
      Line[] = [];

    let ends =
      false;

    if (
      optionId === 'bye'
    ) {
      const long =
        c.rel > 0 ||
        this.turns > 2
          ? 0.7
          : 0.25;

      const topic =
        pick<Topic>(
          this.rng,
          [
            [
              'bye-short',
              1,
            ],
            [
              'bye-long',
              c.styles.some(
                (s) =>
                  LONG_STYLES.includes(
                    s,
                  ),
              )
                ? long *
                  1.4
                : long *
                  0.5,
            ],
          ],
        );

      const bye =
        this.line(
          topic ??
            'bye-short',
        ) ??
        this.line(
          'bye-short',
        );

      if (bye) {
        said.push(
          bye,
        );
      }

      ends =
        true;
    } else {
      const reply =
        this.reply(
          optionId,
        );

      if (reply) {
        said.push(
          reply,
        );
      }

      if (
        optionId ===
          'joke' ||
        optionId ===
          'compliment' ||
        optionId ===
          'howru'
      ) {
        this.positives++;
      }

      if (
        reply?.q
      ) {
        this.lastAsked =
          true;
      }

      this.log.mem(
        c.who,
      ).asked =
        !!reply?.q;

      if (
        reply?.end ||
        this.turns >=
          this.patience
      ) {
        const bye =
          this.line(
            'bye-short',
          );

        if (
          bye &&
          !reply?.end
        ) {
          said.push(
            bye,
          );
        }

        ends =
          true;
      }
    }

    return this.turn(
      said,
      ends,
    );
  }

  /**
   * Prompt 57:
   * resolver una interacción social real.
   */
  private chooseSocial(
    action: SocialActionId,
  ): ChatTurn {
    if (
      !this.socialProfile ||
      !this.ctx.named
    ) {
      return this.chooseClassic(
        action,
      );
    }

    this.usedOptions.add(
      action,
    );

    this.turns++;

    this.lastAsked =
      false;

    const before =
      cloneProfile(
        this.socialProfile,
      );

    const context =
      this.socialContext();

    const result =
      resolveSocialAction(
        before,
        action,
        context,
        this.rng,
      );

    this.socialProfile =
      result.profile;

    this.socialTouched =
      true;

    /*
     * Mantener compatibilidad con la antigua affinity:
     * una interacción amable que funciona también cuenta
     * como positiva.
     */
    if (
      result.outcome ===
        'positive' &&
      (
        action ===
          'howru' ||
        action ===
          'joke' ||
        action ===
          'compliment'
      )
    ) {
      this.positives++;
    }

    const reply =
      socialReply(
        {
          namedId:
            this.ctx.named,

          profileBefore:
            before,

          profileAfter:
            result.profile,

          social:
            context,

          temperament:
            this.ctx
              .temperament,

          outcome:
            result.outcome,

          action,
        },
        this.rng,
      );

    const line =
      this.syntheticLine(
        `${action}:${result.outcome}:${this.turns}`,
        reply.text,
        socialTopic(
          action,
        ),
      );

    /*
     * Guardamos también la respuesta social en el ChatLog
     * para evitar sensación de repetición inmediata.
     */
    this.log.noted(
      this.ctx.who,
      line,
      true,
    );

    this.log.mem(
      this.ctx.who,
    ).asked =
      false;

    let ends =
      !!reply.ends;

    const said:
      Line[] = [
      line,
    ];

    /*
     * Si la persona ya ha llegado al límite natural
     * de conversación, se despide después de responder.
     *
     * Un rechazo romántico NO fuerza automáticamente
     * el final: puede seguir existiendo una conversación
     * normal después.
     */
    if (
      !ends &&
      this.turns >=
        this.patience
    ) {
      const bye =
        this.line(
          'bye-short',
        );

      if (bye) {
        said.push(
          bye,
        );
      }

      ends =
        true;
    }

    return this.turn(
      said,
      ends,
    );
  }

  // ==============================================================
  // TURN
  // ==============================================================

  private turn(
    said:
      Line[],
    ends:
      boolean,
  ): ChatTurn {
    return {
      lines:
        said.map(
          (l) =>
            fill(
              l.text,
              this.ctx,
            ),
        ),

      options:
        ends
          ? []
          : this.options(),

      ends:
        ends ||
        said.some(
          (l) =>
            l.end,
        ),

      ids:
        said.map(
          (l) =>
            l.id,
        ),

      topics:
        said.map(
          (l) =>
            l.topic,
        ),
    };
  }

  /**
   * Línea sintética generada por sistemas dinámicos.
   */
  private syntheticLine(
    id: string,
    text: string,
    topic: Topic,
  ): Line {
    return {
      id:
        `social:${this.ctx.who}:${id}`,

      text,

      topic,
    };
  }

  // ==============================================================
  // SOCIAL
  // ==============================================================

  private socialContext():
    SocialContext {
    return {
      day:
        this.ctx.day,

      hour:
        Math.floor(
          this.ctx.hour,
        ),

      minute:
        this.ctx.minute,

      place:
        this.ctx.place,

      act:
        this.ctx.act,

      mood:
        this.ctx.mood,

      temperament:
        this.ctx
          .temperament,
    };
  }

  private socialAvailable(
    action: SocialActionId,
  ): boolean {
    if (
      !this.socialProfile
    ) {
      return false;
    }

    return availableSocialActions(
      this.socialProfile,
      this.socialContext(),
    ).includes(
      action,
    );
  }

  /**
   * Peso de las opciones nuevas del Prompt 57.
   */
  private socialWeight(
    action: SocialActionId,
  ): number {
    if (
      !this.socialProfile
    ) {
      return 0;
    }

    const p =
      this.socialProfile;

    switch (action) {
      case 'greet':
        return 0;

      case 'howru':
        return 1.8;

      case 'casual':
        return 1.8;

      case 'question':
        return 1.3;

      case 'joke':
        return 1.4;

      case 'compliment':
        return 1.2;

      case 'flirt':
        return (
          1.1 +
          p.attraction /
            100
        );

      case 'ask-status':
        return 0.65;

      case 'ask-contact':
        return (
          0.75 +
          p.trust /
            150
        );

      case 'invite-coffee':
        return 1;

      case 'invite-drink':
        return this.ctx
          .place ===
          'nightlife'
          ? 1.5
          : 0.9;

      case 'propose-plan':
        return (
          0.8 +
          p.friendship /
            120
        );

      case 'propose-date':
        return (
          1 +
          p.attraction /
            80 +
          p.romance /
            120
        );

      case 'bye':
        return 0;
    }
  }

  // ==============================================================
  // COMENTARIO AMBIENTAL
  // ==============================================================

  private remarkChance():
    number {
    const c =
      this.ctx;

    const by:
      Record<
        Style,
        number
      > = {
      talkative: 0.75,
      energetic: 0.6,
      friendly: 0.55,
      humorous: 0.5,
      sarcastic: 0.4,
      calm: 0.4,
      direct: 0.25,
      dry: 0.2,
      shy: 0.2,
      reserved: 0.12,
    };

    const base =
      Math.max(
        ...c.styles.map(
          (s) =>
            by[s],
        ),
      );

    return (
      Math.min(
        0.9,
        base +
          c.rel *
            0.1,
      ) *
      (
        c.mood ===
        'tired'
          ? 0.7
          : 1
      )
    );
  }

  private remarkTopic():
    Topic |
    undefined {
    const c =
      this.ctx;

    const mem =
      this.log.mem(
        c.who,
      );

    const interest = (
      i: Interest,
    ): boolean =>
      c.interests.includes(
        i,
      );

    const weights:
      [
        Topic,
        number,
      ][] =
      REMARK_TOPICS.map(
        (
          t,
        ): [
          Topic,
          number,
        ] => {
          let w = 1;

          if (
            t === 'weather'
          ) {
            w =
              c.weather ===
              'clear'
                ? 0.8
                : 3;
          }

          if (
            t === 'time'
          ) {
            w = 0.9;
          }

          if (
            t ===
            'neighborhood'
          ) {
            w =
              c.place ===
              'residential'
                ? 0.5
                : 1.1;
          }

          if (
            t === 'city'
          ) {
            w = 0.5;
          }

          if (
            t ===
            'positive'
          ) {
            w =
              c.mood ===
              'good'
                ? 2.2
                : 0;
          }

          if (
            t === 'tired'
          ) {
            w =
              c.mood ===
              'tired'
                ? 3
                : 0;
          }

          if (
            t ===
            'complaint'
          ) {
            w =
              c.mood ===
              'down'
                ? 3
                : 0.4;
          }

          if (
            t ===
            'weekend'
          ) {
            w =
              c.weekday >= 4
                ? 2
                : 0.6;
          }

          if (
            t ===
            'nightlife'
          ) {
            w =
              (
                c.hour >= 20 ||
                c.hour < 5
              ) &&
              (
                interest(
                  'nightlife',
                ) ||
                c.act ===
                  'nightout'
              )
                ? 2.5
                : 0;
          }

          if (
            t ===
            'transit'
          ) {
            w =
              c.act ===
                'commute' ||
              c.place ===
                'metro'
                ? 2.4
                : 0.2;
          }

          if (
            t === 'food'
          ) {
            w =
              c.act ===
                'food' ||
              interest(
                'food',
              )
                ? 1.8
                : 0.4;
          }

          if (
            t === 'work'
          ) {
            w =
              c.act ===
                'commute' ||
              c.act ===
                'work'
                ? 2
                : 0.4;
          }

          if (
            t === 'plans'
          ) {
            w = 1;
          }

          if (
            t === 'music'
          ) {
            w =
              interest(
                'music',
              )
                ? 2.2
                : 0;
          }

          if (
            t ===
            'fashion'
          ) {
            w =
              interest(
                'fashion',
              )
                ? 2.2
                : 0;
          }

          if (
            t ===
            'sports'
          ) {
            w =
              interest(
                'football',
              )
                ? 2.2
                : 0;
          }

          if (
            t ===
            'fitness'
          ) {
            w =
              interest(
                'fitness',
              ) ||
              c.place ===
                'gym' ||
              c.act ===
                'exercise'
                ? 2.4
                : 0;
          }

          if (
            mem.topics
              .slice(
                -3,
              )
              .includes(
                t,
              )
          ) {
            w *= 0.25;
          }

          if (
            !(
              POOLS[t] ??
              []
            ).some(
              (l) =>
                fit(
                  l,
                  c,
                ) > 0,
            )
          ) {
            w = 0;
          }

          return [
            t,
            w,
          ];
        },
      );

    return pick(
      this.rng,
      weights,
    );
  }

  // ==============================================================
  // OPCIONES
  // ==============================================================

  private options():
    ChatOption[] {
    const c =
      this.ctx;

    const talky =
      c.styles.some(
        (s) =>
          LONG_STYLES.includes(
            s,
          ),
      );

    const shy =
      c.styles.some(
        (s) =>
          SHORT_STYLES.includes(
            s,
          ),
      );

    const funny =
      c.styles.some(
        (s) =>
          s ===
            'humorous' ||
          s ===
            'sarcastic' ||
          s ===
            'energetic' ||
          s ===
            'friendly',
      );

    const interest = (
      i: Interest,
    ): boolean =>
      c.interests.includes(
        i,
      );

    const hurried =
      c.mood ===
      'hurried';

    const weight = (
      o: OptionDef,
    ): number => {
      if (
        o.id === 'bye'
      ) {
        return 0;
      }

      if (
        this.usedOptions.has(
          o.id,
        )
      ) {
        return 0;
      }

      switch (
        o.id
      ) {
        case 'answer':
          return this.lastAsked
            ? 9
            : 0;

        case 'howru':
          return hurried
            ? 1
            : 2.2;

        case 'doing':
          return hurried
            ? 0.7
            : 2;

        case 'weather':
          return hurried
            ? 0
            : c.weather ===
                'clear'
              ? 0.6
              : 2.4;

        case 'hood':
          return hurried
            ? 0
            : c.place ===
                'residential'
              ? 0.7
              : 1.4;

        case 'plans':
          return hurried
            ? 0
            : c.hour >= 15 ||
                c.hour < 11
              ? 1.3
              : 0.8;

        case 'joke':
          return hurried
            ? 0
            : funny
              ? 1.6
              : shy
                ? 0.4
                : 0.9;

        case 'compliment':
          return hurried
            ? 0
            : c.rel > 0
              ? 1.5
              : shy
                ? 0.5
                : 0.8;

        case 'sports':
          return interest(
            'football',
          )
            ? 2.4
            : 0;

        case 'music':
          return interest(
            'music',
          )
            ? 2.4
            : 0;

        case 'fashion':
          return interest(
            'fashion',
          )
            ? 2.4
            : 0;

        case 'food':
          return interest(
            'food',
          )
            ? 2.2
            : 0;

        case 'fitness':
          return (
            interest(
              'fitness',
            ) ||
            c.place ===
              'gym'
          )
            ? 2.4
            : 0;

        case 'nightlife':
          return (
            (
              interest(
                'nightlife',
              ) ||
              c.act ===
                'nightout'
            ) &&
            (
              c.hour >= 18 ||
              c.hour < 5
            )
          )
            ? 2.4
            : 0;

        case 'transit':
          return (
            c.act ===
              'commute' ||
            c.place ===
              'metro'
          )
            ? 2.2
            : 0;

        case 'work':
          return (
            c.act ===
              'commute' ||
            c.act ===
              'work'
          )
            ? 1.8
            : 0;

        case 'people':
          return (
            hurried ||
            c.ties.length ===
              0 ||
            c.rel === 0
          )
            ? 0
            : 1.8 *
                (
                  shy
                    ? 0.5
                    : 1
                );
      }

      return 0;
    };

    /*
     * Opciones clásicas.
     */
    const candidates:
      [
        ChatOption,
        number,
      ][] =
      OPTIONS.map(
        (
          o,
        ): [
          ChatOption,
          number,
        ] => [
          {
            id:
              o.id,

            label:
              o.label,
          },

          this.answerable(
            o,
          )
            ? weight(
                o,
              )
            : 0,
        ],
      );

    /*
     * Prompt 57:
     * añadir opciones sociales nuevas únicamente a Named Characters
     * con perfil social.
     */
    if (
      this.socialProfile &&
      c.named
    ) {
      const available =
        availableSocialActions(
          this.socialProfile,
          this.socialContext(),
        );

      const classicIds =
        new Set(
          OPTIONS.map(
            (o) =>
              o.id,
          ),
        );

      for (
        const action of
        available
      ) {
        /*
         * howru, joke, compliment y bye ya existen
         * en el menú clásico.
         */
        if (
          classicIds.has(
            action,
          ) ||
          action ===
            'greet' ||
          action ===
            'bye' ||
          this.usedOptions.has(
            action,
          )
        ) {
          continue;
        }

        candidates.push(
          [
            {
              id:
                action,

              label:
                SOCIAL_ACTIONS[
                  action
                ].label,
            },

            this.socialWeight(
              action,
            ),
          ],
        );
      }
    }

    const count =
      hurried
        ? 1
        : talky
          ? 4
          : shy
            ? 2
            : 3;

    const chosen:
      ChatOption[] = [];

    /*
     * Responder tiene prioridad absoluta si el NPC preguntó algo.
     */
    const answer =
      candidates.find(
        (
          [
            option,
            w,
          ],
        ) =>
          option.id ===
            'answer' &&
          w > 0,
      );

    if (answer) {
      chosen.push(
        answer[0],
      );

      candidates.splice(
        candidates.indexOf(
          answer,
        ),
        1,
      );
    }

    while (
      chosen.length <
      count
    ) {
      const next =
        pick(
          this.rng,
          candidates.filter(
            (
              [
                ,
                w,
              ],
            ) =>
              w > 0,
          ),
        );

      if (!next) {
        break;
      }

      chosen.push(
        next,
      );

      const index =
        candidates.findIndex(
          (
            [
              o,
            ],
          ) =>
            o.id ===
            next.id,
        );

      if (
        index >= 0
      ) {
        candidates.splice(
          index,
          1,
        );
      }
    }

    return [
      ...chosen,

      {
        id:
          'bye',

        label:
          this.byeLabel(),
      },
    ];
  }

  private byeLabel():
    string {
    const c =
      this.ctx;

    const options =
      BYE_LABELS.filter(
        (b) =>
          (
            !b.r ||
            c.rel >=
              b.r
          ) &&
          (
            !b.h ||
            inHours(
              b.h,
              c.hour,
            )
          ) &&
          (
            !b.m ||
            b.m.includes(
              c.mood,
            )
          ),
      );

    return (
      pick(
        this.rng,
        options.map(
          (
            b,
          ): [
            string,
            number,
          ] => [
            b.text,

            (
              b.m
                ? 3
                : 1
            ) *
              (
                b.h
                  ? 1.6
                  : 1
              ) *
              (
                b.r
                  ? 1.5
                  : 1
              ),
          ],
        ),
      ) ??
      'Despedirse'
    );
  }

  private answerable(
    o: OptionDef,
  ): boolean {
    if (
      o.id ===
      'people'
    ) {
      return (
        this.ctx.ties
          .length > 0
      );
    }

    return this.topicsOf(
      o,
    ).some(
      (
        [
          t,
        ],
      ) =>
        (
          POOLS[t] ??
          []
        ).some(
          (l) =>
            fit(
              l,
              this.ctx,
            ) > 0,
        ),
    );
  }

  private topicsOf(
    o: OptionDef,
  ):
    readonly (
      readonly [
        Topic,
        number,
      ]
    )[] {
    const c =
      this.ctx;

    const shy =
      c.styles.some(
        (s) =>
          SHORT_STYLES.includes(
            s,
          ),
      );

    switch (
      o.id
    ) {
      case 'howru': {
        if (
          c.mood ===
          'hurried'
        ) {
          return [
            [
              'hurried',
              1,
            ],
          ];
        }

        const by:
          Record<
            Mood,
            Topic
          > = {
          good:
            'positive',

          tired:
            'tired',

          down:
            'complaint',

          neutral:
            'smalltalk',

          hurried:
            'hurried',
        };

        return [
          [
            by[
              c.mood
            ],
            4,
          ],

          [
            'smalltalk',
            1.5,
          ],

          [
            'awkward',
            shy
              ? 0.5
              : 0.05,
          ],
        ];
      }

      case 'joke':
        return c.styles.some(
          (s) =>
            s ===
              'humorous' ||
            s ===
              'sarcastic',
        )
          ? [
              [
                'joke-back',
                1,
              ],
              [
                'joke',
                0.7,
              ],
            ]
          : [
              [
                'joke-back',
                1,
              ],
            ];

      case 'compliment':
        return c.rel > 0
          ? [
              [
                'compliment-back',
                1,
              ],
              [
                'friendly',
                0.4,
              ],
            ]
          : [
              [
                'compliment-back',
                1,
              ],
            ];

      case 'plans':
        return [
          [
            'plans',
            1,
          ],

          [
            'weekend',
            c.weekday >= 4
              ? 1.6
              : 0.5,
          ],

          [
            'nightlife',
            c.hour >= 18 ||
            c.hour < 5
              ? 0.8
              : 0,
          ],
        ];

      default:
        return o.topics;
    }
  }

  private reply(
    optionId: string,
  ):
    Line |
    undefined {
    if (
      optionId ===
      'people'
    ) {
      return this.tieReply();
    }

    const def =
      OPTIONS.find(
        (o) =>
          o.id ===
          optionId,
      );

    if (!def) {
      return undefined;
    }

    const mem =
      this.log.mem(
        this.ctx.who,
      );

    const topics =
      this.topicsOf(
        def,
      )
        .filter(
          (
            [
              t,
            ],
          ) =>
            (
              POOLS[t] ??
              []
            ).some(
              (l) =>
                fit(
                  l,
                  this.ctx,
                ) > 0,
            ),
        )
        .map(
          (
            [
              t,
              w,
            ],
          ): [
            Topic,
            number,
          ] => [
            t,

            mem.topics
              .slice(
                -3,
              )
              .includes(
                t,
              )
              ? w * 0.3
              : w,
          ],
        );

    const topic =
      pick(
        this.rng,
        topics,
      );

    return topic
      ? this.line(
          topic,
        )
      : this.line(
          'smalltalk',
        );
  }

  // ==============================================================
  // GENTE DEL NPC
  // ==============================================================

  private tieReply():
    Line |
    undefined {
    const c =
      this.ctx;

    const mem =
      this.log.mem(
        c.who,
      );

    const told = (
      t: Tie,
    ): boolean =>
      mem.lines.some(
        (id) =>
          id.startsWith(
            `tie:${t.type}:${t.name}:`,
          ),
      );

    const tie =
      c.ties.find(
        (t) =>
          !told(t),
      ) ??
      c.ties[
        Math.floor(
          this.rng() *
            c.ties.length,
        )
      ];

    if (!tie) {
      return undefined;
    }

    const k =
      Math.floor(
        this.rng() *
          2,
      );

    const short =
      c.styles.some(
        (s) =>
          SHORT_STYLES.includes(
            s,
          ),
      ) &&
      !c.styles.some(
        (s) =>
          LONG_STYLES.includes(
            s,
          ),
      );

    const long =
      c.styles.some(
        (s) =>
          LONG_STYLES.includes(
            s,
          ),
      ) &&
      !short;

    const full =
      tieLine(
        tie,
        k,
      );

    const next =
      long
        ? c.ties.find(
            (t) =>
              t !== tie &&
              !told(t),
          )
        : undefined;

    const text =
      short
        ? full.split(
            /(?<=[.?!]) /,
          )[0]
        : next
          ? `${full} ${tieLine(
              next,
              k,
            )}`
          : full;

    const line:
      Line = {
      id:
        `tie:${tie.type}:${tie.name}:${k}`,

      topic:
        'plans',

      text,
    };

    this.log.noted(
      c.who,
      line,
      this.named,
    );

    return line;
  }

  // ==============================================================
  // FRASE NORMAL
  // ==============================================================

  private line(
    topic: Topic,
  ):
    Line |
    undefined {
    const c =
      this.ctx;

    const mem =
      this.log.mem(
        c.who,
      );

    const global =
      this.log.recentAll();

    const hard =
      this.named
        ? 30
        : 10;

    const soft =
      this.named
        ? 120
        : 40;

    const options =
      (
        POOLS[
          topic
        ] ??
        []
      ).map(
        (
          l,
        ): [
          Line,
          number,
        ] => {
          let w =
            fit(
              l,
              c,
            );

          if (
            w <= 0
          ) {
            return [
              l,
              0,
            ];
          }

          w *=
            lengthFit(
              l.text,
              c,
            );

          const at =
            mem.lines.lastIndexOf(
              l.id,
            );

          if (
            at >= 0
          ) {
            const age =
              mem.lines.length -
              at;

            w *=
              age <= hard
                ? 0.02
                : age <=
                    soft
                  ? 0.25
                  : 0.6;
          }

          if (
            global.includes(
              l.id,
            )
          ) {
            w *= 0.4;
          }

          if (l.q) {
            w *=
              this.lastAsked
                ? 0.1
                : c.styles.some(
                      (s) =>
                        SHORT_STYLES.includes(
                          s,
                        ),
                    )
                  ? 0.2
                  : 0.55;
          }

          return [
            l,
            w,
          ];
        },
      );

    const chosen =
      pick(
        this.rng,
        options.filter(
          (
            [
              ,
              w,
            ],
          ) =>
            w > 0,
        ),
      );

    if (chosen) {
      this.log.noted(
        c.who,
        chosen,
        this.named,
      );
    }

    return chosen;
  }
}