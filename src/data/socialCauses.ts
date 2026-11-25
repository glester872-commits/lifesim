// VID-02 F2 · Lo que puede pasar en un turno compartido entre dos NPC (systems/SocialGraph.tickSocialGraph).
// {a} y {b} son los nombres de npcA y npcB de la arista (orden de edgeIdOf).

export interface SocialCause {
  id: string;
  delta: number;
  text: string;
  /** Sólo si la arista está en tension o rift y su última causa negativa fue hace 2 días o más; en conflicto pesa doble. */
  repair?: true;
  /** F3 · lo que dice cualquiera de los dos los días siguientes (SocialGraph.socialLineFor). {other}: el compañero. */
  line: string;
}

export const SOCIAL_CAUSES: readonly SocialCause[] = [
  { id: 'cubrir-turno', delta: 12, text: '{b} le cubrió la ronda a {a}', line: 'Ayer hubo cambio de ronda con {other}. Se agradece.' },
  { id: 'cafe-compartido', delta: 6, text: '{a} y {b} compartieron un café en el descanso', line: '{other} invitó al café en el descanso. Ya le tocaba.' },
  { id: 'broma-pesada', delta: -10, text: '{a} le gastó una broma pesada a {b}', line: 'Lo de la broma de {other}... mejor no preguntes.' },
  { id: 'discusion-cuadrante', delta: -18, text: '{a} y {b} discutieron por el cuadrante de turnos', line: 'Hoy no me hables del cuadrante.' },
  { id: 'disculpa', delta: 25, text: '{a} se disculpó con {b}', repair: true, line: '{other} y yo ya lo hemos hablado.' },
];

/** F3 · frases por tipo de relación, con {other} = el compañero. 'reconciled': disculpa hace 3 días o menos. */
export type SocialLineKey = 'friend' | 'tension' | 'rift' | 'reconciled';

export const SOCIAL_LINES: Readonly<Record<SocialLineKey, readonly string[]>> = {
  friend: [
    'Con {other} da gusto hacer turno. Se pasa volando.',
    'Si ves a {other}, dile que el café de luego lo pongo yo.',
    '{other} y yo nos cubrimos. Así da gusto.',
  ],
  tension: [
    '{other} y yo... digamos que hoy cada uno a su andén.',
    'No es buen día para preguntarme por {other}.',
  ],
  rift: [
    'Con {other} ya ni me hablo. Cada uno su ronda y punto.',
    'Si buscas a {other}, no soy la persona a quien preguntar.',
    'Que {other} haga lo que quiera. Yo, a lo mío.',
  ],
  reconciled: [
    '{other} vino a pedirme perdón. Bueno, se agradece.',
    'Lo de {other} ya está hablado. Pelillos a la mar.',
  ],
};
