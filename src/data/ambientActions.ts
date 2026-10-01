import type { Pose } from '../world/HumanArt.ts';

/**
 * Gestos de ambiente: lo que la gente hace mientras está parada (o andando)
 * en vez de quedarse mirando al frente. No es IA ni un sistema por gesto: cada
 * gesto es una entrada aquí, con cuándo tiene sentido y su secuencia de poses.
 * systems/AmbientActions.ts elige cuál toca y entities/Character.ts lo pinta.
 *
 * Añadir uno (leer un libro, un portátil, un selfie, un helado) es añadir una
 * entrada: sus condiciones, sus tramos y, si lleva algo en la mano que no
 * existe, su dibujo en world/AmbientArt.ts. No se toca a quien lo usa.
 */

/** De pie, sentado o andando: el mismo gesto puede valer para varias. */
export type AmbientPosture = 'stand' | 'sit' | 'walk';

/**
 * Lo que ya hace según su propio sistema (Crowd, StreetLife, Characters): el
 * gesto lo matiza, nunca lo contradice. Quien come en la terraza come, bebe,
 * charla o mira el móvil; no se pone a estirar.
 */
export type AmbientContext = 'eat' | 'drink' | 'talk' | 'wait' | 'read' | 'rest' | 'browse' | 'idle' | 'walk';

/** Franjas del día: mañana 6–12, tarde 12–19, noche 19–23, madrugada 23–6. */
export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

/** Lo que cambia la forma de ser de cada uno. Sale de su semilla, con más o menos probabilidad según lo que haga. */
export type AmbientTrait = 'smoker' | 'photographer';

/** Lo que se lleva en la mano; cada uno tiene su dibujo (world/AmbientArt.ts o el de siempre). */
export type AmbientProp = 'cigarette' | 'cup' | 'mug' | 'plate' | 'book' | 'bags' | 'glow';

/** Dónde va lo que lleva: en la mano, en la boca, en la mesa de delante o en el regazo. */
export type PropAnchor = 'hand' | 'mouth' | 'table' | 'lap';

/** Hacia dónde mira durante el tramo: a un lado, al otro o a quien le acompaña. */
export type AmbientLook = 'aside' | 'other' | 'companion';

export interface AmbientStep {
  /** Lo que se ve hacer en el tramo: sacar el cigarro, dar una calada, soltar el humo. */
  name: string;
  /** Cuánto dura, en ms reales: cada uno el suyo, por semilla. */
  ms: readonly [number, number];
  /** Pose de pie y sentado. Sin ella, respira quieto (de pie) o sentado. */
  pose?: Pose;
  sitPose?: Pose;
  prop?: AmbientProp;
  at?: PropAnchor;
  /** Bocanada al empezar el tramo: cuántas volutas (world/SmokeFx). */
  puff?: number;
  /** Un hilo de humo mientras dura (la punta del cigarro). */
  trail?: boolean;
  look?: AmbientLook;
  /** El bocadillo de la charla, a ratos. */
  talk?: boolean;
}

export interface AmbientActionDef {
  id: string;
  /** Para depurar y para el README. */
  label: string;
  postures: readonly AmbientPosture[];
  contexts: readonly AmbientContext[];
  /** Peso base frente a los demás gestos del mismo contexto. */
  weight: number;
  /** Multiplica el peso por franja; 0 lo quita. Sin franja, 1. */
  dayparts?: Partial<Record<DayPart, number>>;
  /** Sólo al aire libre: fumar nunca pasa dentro de un local. */
  outdoor?: boolean;
  /** Sólo quien tiene el rasgo. */
  trait?: AmbientTrait;
  /** Sólo con alguien al lado (charlar mirándose en la terraza). */
  companion?: boolean;
  /** Multiplica el peso cerca de lugares con esas etiquetas (data/places.ts): fumar, en la puerta de la discoteca. */
  near?: Readonly<Record<string, number>>;
  /** Multiplica el peso según lo que hace (su `role`): bolsas, quien sale de una tienda. */
  roles?: Readonly<Record<string, number>>;
  /** Si hay `roles`, lo que pesa para quien no está en la lista (0: sólo esos). */
  otherRoles?: number;
  /** Cuánto dura el gesto entero, en ms reales. */
  total: readonly [number, number];
  /** Tramos: una vez al empezar, en bucle mientras dura y una vez al acabar. */
  intro?: readonly AmbientStep[];
  loop: readonly AmbientStep[];
  outro?: readonly AmbientStep[];
}

/** Probabilidad de cada rasgo: la base y, según lo que hace, otra. */
export const TRAIT_SHARE: Readonly<Record<AmbientTrait, { base: number; roles?: Readonly<Record<string, number>> }>> = {
  // Una de cada cinco personas fuma; quien sale de la discoteca "a tomar el aire", casi siempre.
  smoker: { base: 0.2, roles: { 'club-smoke': 0.75, 'bar-smoke': 0.8, 'club-queue': 0.3, 'night-walker': 0.3, 'carmen-hang': 0.35, 'carmen-prenight': 0.35 } },
  photographer: { base: 0.1, roles: { stroller: 0.3, 'park-stroll': 0.25, 'carmen-browse': 0.25, 'carmen-couple': 0.3, 'carmen-outfit': 0.75, 'popup-market': 0.3, 'popup-art': 0.35 } },
};

const hold = (ms: readonly [number, number]): AmbientStep => ({ name: 'quieto', ms });

/** Sacar el cigarro, encenderlo, caladas con el brazo abajo entre una y otra, y apagarlo. */
const SMOKE: Pick<AmbientActionDef, 'intro' | 'loop' | 'outro'> = {
  intro: [
    { name: 'sacar el cigarro', ms: [700, 1_000], prop: 'cigarette', at: 'hand' },
    { name: 'encenderlo', ms: [900, 1_300], pose: 32, sitPose: 33, prop: 'cigarette', at: 'mouth', puff: 2 },
    { name: 'soltar el humo', ms: [900, 1_300], prop: 'cigarette', at: 'hand', puff: 4 },
  ],
  loop: [
    { name: 'con el cigarro en la mano', ms: [2_200, 4_200], prop: 'cigarette', at: 'hand', trail: true },
    { name: 'dar una calada', ms: [800, 1_100], pose: 32, sitPose: 33, prop: 'cigarette', at: 'mouth' },
    { name: 'soltar el humo', ms: [1_000, 1_500], prop: 'cigarette', at: 'hand', puff: 4, look: 'aside' },
  ],
  outro: [
    { name: 'apagarlo', ms: [600, 900], prop: 'cigarette', at: 'hand', puff: 1 },
    hold([400, 700]),
  ],
};

export const AMBIENT_ACTIONS: AmbientActionDef[] = [
  // ------------------------------------------------------------------ fumar
  {
    id: 'smoke', label: 'Fumando', postures: ['stand', 'sit'], contexts: ['idle', 'wait', 'talk', 'drink', 'rest', 'read'],
    weight: 2.2, outdoor: true, trait: 'smoker', total: [11_000, 20_000],
    dayparts: { morning: 0.5, afternoon: 0.9, evening: 1.3, night: 1.8 },
    near: { nightlife: 3, food: 1.4 }, roles: { 'club-smoke': 5, 'bar-smoke': 6, 'carmen-hang': 1.4 }, otherRoles: 1,
    ...SMOKE,
  },
  {
    // Andando con el cigarro: el humo se queda atrás, donde se soltó.
    id: 'smoke-walk', label: 'Fumando por la calle', postures: ['walk'], contexts: ['walk'],
    weight: 0.35, outdoor: true, trait: 'smoker', total: [14_000, 26_000],
    dayparts: { morning: 0.4, afternoon: 0.7, evening: 1.2, night: 1.8 },
    loop: [
      { name: 'con el cigarro en la mano', ms: [2_400, 4_000], prop: 'cigarette', at: 'hand', trail: true },
      { name: 'dar una calada', ms: [700, 900], prop: 'cigarette', at: 'mouth' },
      { name: 'soltar el humo', ms: [900, 1_200], prop: 'cigarette', at: 'hand', puff: 3 },
    ],
  },

  // --------------------------------------------------------------- el móvil
  {
    id: 'phone', label: 'Con el móvil', postures: ['stand', 'sit'], contexts: ['idle', 'wait', 'drink', 'rest', 'eat', 'read', 'browse'],
    weight: 2, total: [6_000, 14_000], dayparts: { morning: 1.4, afternoon: 1, evening: 0.9, night: 1 },
    loop: [
      { name: 'mirando el móvil', ms: [2_500, 5_000], pose: 5, sitPose: 25, prop: 'glow', at: 'hand' },
      { name: 'levantar la vista', ms: [700, 1_200], look: 'aside' },
    ],
  },
  {
    id: 'phone-walk', label: 'Andando con el móvil', postures: ['walk'], contexts: ['walk'],
    weight: 0.25, total: [5_000, 10_000], dayparts: { morning: 1.5, afternoon: 1, evening: 0.8, night: 0.6 },
    loop: [{ name: 'mirando el móvil al andar', ms: [3_000, 6_000], prop: 'glow', at: 'hand' }],
  },

  // ---------------------------------------------------------- beber y comer
  {
    // En la terraza, el café en la mesa y un sorbo de vez en cuando.
    id: 'sip', label: 'Tomando algo', postures: ['sit'], contexts: ['drink'],
    weight: 4, total: [8_000, 16_000], dayparts: { morning: 1.4 },
    loop: [
      { name: 'la taza en la mesa', ms: [2_500, 4_500], prop: 'cup', at: 'table' },
      { name: 'un sorbo', ms: [900, 1_300], sitPose: 33, prop: 'mug', at: 'mouth' },
    ],
  },
  {
    // De pie con un café para llevar (por la mañana) o una bebida (de noche).
    id: 'drink-stand', label: 'Bebiendo de pie', postures: ['stand'], contexts: ['idle', 'wait', 'talk'],
    weight: 0.9, outdoor: true, total: [8_000, 14_000], dayparts: { morning: 2, afternoon: 0.6, evening: 0.8, night: 1.2 },
    near: { food: 1.6, nightlife: 1.6 },
    loop: [
      { name: 'el vaso en la mano', ms: [2_200, 4_000], prop: 'mug', at: 'hand' },
      { name: 'un trago', ms: [800, 1_100], pose: 32, prop: 'mug', at: 'mouth' },
    ],
  },
  {
    id: 'coffee-walk', label: 'Café para llevar', postures: ['walk'], contexts: ['walk'],
    weight: 0.6, total: [20_000, 40_000], dayparts: { morning: 1, afternoon: 0.15, evening: 0, night: 0 },
    roles: { commuter: 2, office: 2, coffee: 3 }, otherRoles: 0.5,
    loop: [
      { name: 'el café en la mano', ms: [3_000, 5_000], prop: 'mug', at: 'hand' },
      { name: 'un sorbo andando', ms: [700, 900], prop: 'mug', at: 'mouth' },
    ],
  },
  {
    id: 'eat', label: 'Comiendo', postures: ['sit'], contexts: ['eat'],
    weight: 5, total: [10_000, 18_000],
    loop: [
      { name: 'el plato delante', ms: [1_400, 2_600], prop: 'plate', at: 'table' },
      { name: 'un bocado', ms: [650, 900], sitPose: 26, prop: 'plate', at: 'table' },
    ],
  },

  // ---------------------------------------------------- charlar y compañía
  {
    // Sentados juntos: se giran el uno hacia el otro un rato, y vuelven a su mesa.
    id: 'chat', label: 'Charlando', postures: ['sit', 'stand'], contexts: ['drink', 'eat', 'talk', 'rest'],
    weight: 3.5, companion: true, total: [7_000, 14_000], dayparts: { evening: 1.4, night: 1.3 },
    loop: [
      { name: 'hablando de cara', ms: [2_000, 3_800], look: 'companion', talk: true },
      { name: 'escuchando', ms: [1_400, 2_600], look: 'companion' },
      { name: 'mirando a la calle', ms: [900, 1_800] },
    ],
  },
  {
    id: 'talk', label: 'Hablando', postures: ['stand'], contexts: ['talk'],
    weight: 3, total: [6_000, 12_000],
    loop: [{ name: 'hablando', ms: [1_800, 3_200], talk: true }, hold([1_200, 2_400])],
  },

  // ------------------------------------------------------ esperar y mirar
  {
    id: 'look-around', label: 'Mirando alrededor', postures: ['stand', 'sit'], contexts: ['idle', 'wait', 'rest', 'drink', 'talk'],
    weight: 1.3, total: [4_000, 8_000],
    loop: [
      { name: 'a un lado', ms: [900, 1_600], look: 'aside' },
      hold([600, 1_200]),
      { name: 'al otro', ms: [900, 1_600], look: 'other' },
      hold([700, 1_400]),
    ],
  },
  {
    id: 'wait', label: 'Esperando', postures: ['stand'], contexts: ['idle', 'wait'],
    weight: 1.2, total: [4_000, 9_000],
    loop: [hold([1_600, 3_000]), { name: 'cambiar el peso', ms: [500, 800], pose: 3 }],
  },
  {
    id: 'stretch', label: 'Estirándose', postures: ['stand'], contexts: ['idle', 'wait'],
    weight: 0.35, outdoor: true, total: [3_000, 5_000], dayparts: { morning: 2, afternoon: 1, evening: 0.6, night: 0.3 },
    intro: [{ name: 'brazos arriba', ms: [1_200, 1_800], pose: 21 }],
    loop: [hold([800, 1_400])],
  },
  {
    id: 'photo', label: 'Haciendo una foto', postures: ['stand'], contexts: ['idle', 'wait', 'browse'],
    weight: 1.6, trait: 'photographer', outdoor: true, total: [4_000, 8_000],
    dayparts: { morning: 0.8, afternoon: 1.4, evening: 1, night: 0.3 },
    intro: [{ name: 'buscar el encuadre', ms: [800, 1_400], look: 'aside' }],
    loop: [
      { name: 'foto', ms: [1_200, 2_000], pose: 34, look: 'aside' },
      { name: 'mirarla', ms: [1_000, 1_800], pose: 5, prop: 'glow', at: 'hand' },
    ],
  },
  {
    id: 'rest', label: 'Descansando', postures: ['sit'], contexts: ['rest', 'drink', 'wait', 'read'],
    weight: 1.5, total: [6_000, 12_000],
    loop: [{ name: 'respirando', ms: [3_000, 5_000] }, { name: 'soltar el aire', ms: [500, 800], sitPose: 24 }],
  },
  {
    id: 'people-watch', label: 'Mirando pasar a la gente', postures: ['sit'], contexts: ['rest', 'drink'],
    weight: 1.4, outdoor: true, total: [6_000, 12_000], dayparts: { afternoon: 1.3 },
    loop: [{ name: 'mirando la calle', ms: [2_000, 3_500] }, { name: 'siguiendo a alguien', ms: [1_200, 2_000], look: 'aside' }],
  },
  {
    id: 'read', label: 'Leyendo', postures: ['sit'], contexts: ['read'],
    weight: 5, total: [10_000, 20_000],
    loop: [
      { name: 'leyendo', ms: [4_000, 7_000], prop: 'book', at: 'lap' },
      { name: 'levantar la vista', ms: [800, 1_200], prop: 'book', at: 'lap', look: 'aside' },
    ],
  },
  {
    // Delante de un escaparate: mira, se fija en algo, mira el de al lado.
    id: 'window', label: 'Mirando el escaparate', postures: ['stand'], contexts: ['browse'],
    weight: 4, total: [5_000, 10_000], dayparts: { afternoon: 1.3 },
    loop: [hold([1_800, 3_200]), { name: 'fijarse en algo', ms: [600, 1_000], pose: 3 }, { name: 'el de al lado', ms: [900, 1_500], look: 'aside' }],
  },

  // ----------------------------------------------------------------- andar
  {
    // Quien sale de las tiendas lleva las bolsas.
    id: 'bags', label: 'Con bolsas', postures: ['walk'], contexts: ['walk'],
    weight: 1, total: [60_000, 90_000], dayparts: { morning: 0.5, afternoon: 1.4, evening: 1, night: 0 },
    roles: { shopper: 6, errands: 1.2, 'carmen-browse': 1.5, 'window-shopper': 1, 'popup-market': 4, 'sneaker-heads': 3 }, otherRoles: 0,
    loop: [{ name: 'con las bolsas', ms: [60_000, 90_000], prop: 'bags', at: 'hand' }],
  },
];

/**
 * Registra un gesto más (o sustituye el del mismo id). Los de siempre van en
 * la lista de arriba; esto es para probar uno sin tocarla (scripts/check-ambient).
 */
export function registerAmbientAction(def: AmbientActionDef): void {
  const i = AMBIENT_ACTIONS.findIndex((a) => a.id === def.id);
  if (i >= 0) AMBIENT_ACTIONS[i] = def;
  else AMBIENT_ACTIONS.push(def);
}
