import { ARENA_MATCHES } from './cityEvents.ts';
import { HALVES } from './matchPlay.ts';

/**
 * Lo que se hace en el estadio además de mirar (systems/Concourse, WorldScene): el quiosco del vestíbulo y la charla
 * con quien está al lado. Sin Phaser.
 *
 * El quiosco atiende con las puertas abiertas hasta el saque y en el descanso, siempre del partido que se juega aquí
 * (systems/MatchPlay.fixtureAt); con el balón en juego y tras el final, cerrado. Los tiempos, en minutos desde el saque.
 */
export const KIOSK_WINDOWS: readonly (readonly [number, number])[] = [
  [ARENA_MATCHES.phases.arrival[0], HALVES.first.from],
  [HALVES.first.to, HALVES.second.from],
];

// ------------------------------------------------------------ la charla en la grada

/**
 * De qué se habla, siempre desde el lado de quien habla («nosotros» es su equipo: el Halcón para casi todos, el rival
 * para los que vienen con él). Sólo de lo que ya ha pasado: un gol o una victoria que no ha llegado no se nombra.
 *
 *   pre        antes del saque            match      con el balón en juego, sin nada reciente: el rival, el club
 *   chance-us  / chance-them  una ocasión de hace poco, sin gol
 *   goal-us    / goal-them    un gol de hace poco
 *   half       el descanso                win / draw / loss   el final, según el resultado
 *   bye        al despedirse
 * Y lo que responde a lo que hace el jugador: `cheer` (Animar) y `celebrate` (Celebrar), cada una con el humor de
 * quien la recibe (`-us` le alegra, `-them` le escuece).
 */
export type FanTopic =
  | 'pre' | 'match' | 'chance-us' | 'chance-them' | 'goal-us' | 'goal-them' | 'half' | 'win' | 'draw' | 'loss' | 'bye'
  | 'cheer-us' | 'cheer-them' | 'celebrate-us' | 'celebrate-them';

/** Cómo va el marcador para quien habla. */
export type Standing = 'ahead' | 'level' | 'behind';

export interface FanLine {
  id: string;
  topic: FanTopic;
  /** {us}, {them}: los dos equipos desde quien habla; {score}: el marcador de ahora; {minute}: el de lo último. */
  text: string;
  /** Sólo a la afición de casa (habla del estadio, del barrio) o a la que viene de fuera. */
  side?: 'home' | 'away';
  /** Sólo si el marcador va así para quien habla. */
  standing?: Standing;
}

const L = (topic: FanTopic, texts: readonly (string | [string, Partial<Pick<FanLine, 'side' | 'standing'>>])[]): FanLine[] =>
  texts.map((t, i) => (typeof t === 'string' ? { id: `${topic}-${i}`, topic, text: t } : { id: `${topic}-${i}`, topic, text: t[0], ...t[1] }));

export const FAN_LINES: readonly FanLine[] = [
  ...L('pre', [
    '¿Primera vez en la Tribuna? Desde aquí se ve el campo entero, ya verás.',
    'Hoy toca {them}. A ver si salimos enchufados desde el principio.',
    ['Vengo a todos los partidos desde crío. Este estadio, lleno, suena de otra manera.', { side: 'home' }],
    ['Somos cuatro gatos los de {us}, pero se nos va a oír.', { side: 'away' }],
    'Me han dicho que {them} viene con bajas. Ojalá sea verdad.',
    'Llegar pronto es lo mejor: se ve calentar a los jugadores y no hay cola en el quiosco.',
  ]),
  ...L('match', [
    ['Vamos {score} y no me fío ni un pelo. Un despiste y se acabó.', { standing: 'ahead' }],
    ['Así, con la cabeza fría. Vamos {score}, que no se nos escape.', { standing: 'ahead' }],
    ['{score}... Hay que apretar, que se puede remontar.', { standing: 'behind' }],
    ['No puede ser, {score}. Necesitamos uno ya.', { standing: 'behind' }],
    ['{score} y todo por decidir. Esto se gana en los últimos minutos.', { standing: 'level' }],
    ['Está muy igualado. Quien marque primero, se lo lleva.', { standing: 'level' }],
    '{them} presiona arriba, pero deja mucho espacio a la espalda.',
    'Mira cómo se mueve el diez. Ese chaval va a llegar lejos.',
    'El árbitro está dejando jugar. Mejor así.',
  ]),
  ...L('chance-us', [
    '¡Uf! Esa era. Por un palmo.',
    '¿Has visto eso? Casi, casi. Así se llega.',
    'Esa jugada la teníamos que haber metido. A la próxima.',
    'Bien llevada. Si sigue así, cae.',
  ]),
  ...L('chance-them', [
    'Qué susto. Esa la ha salvado el portero de milagro.',
    'Nos están llegando demasiado. Hay que cerrar atrás.',
    'Menos mal. Se me ha parado el corazón un segundo.',
    'Esa tenía mala pinta. Hay que despertar.',
  ]),
  ...L('goal-us', [
    '¡Golazo! ¿Lo has visto? ¡En el {minute}!',
    '¡Ahí está! Ya te lo decía yo. {score}.',
    '¡Por fin! Me he quedado sin voz y todo. {score}.',
    'Qué manera de definir. Esto ya es otra cosa: {score}.',
  ]),
  ...L('goal-them', [
    'No me lo puedo creer... gol de {them} en el {minute}.',
    'Un despiste y nos la clavan. {score}.',
    'Bueno, queda partido. Hay que levantarse ya.',
    'Así no. Se lo hemos puesto demasiado fácil. {score}.',
  ]),
  ...L('half', [
    ['Al descanso por delante, {score}. Que no se relajen.', { standing: 'ahead' }],
    ['{score} al descanso. El míster tiene que cambiar algo.', { standing: 'behind' }],
    ['{score} al descanso. Partido abierto.', { standing: 'level' }],
    'Voy a por algo al quiosco antes de que se forme cola. ¿Tú no bajas?',
    'Quince minutos para respirar. La segunda parte va a ser otra historia.',
    'Mira el campo, cómo lo riegan. Eso es para que la pelota corra.',
  ]),
  ...L('win', [
    '¡Ganado! {score}. Hoy se duerme bien.',
    'Tres puntos y a casa. Qué bien se ha sufrido al final.',
    '¡Eso es! {score}. Así da gusto venir.',
    'Lo dije antes del partido: hoy se ganaba. {score}.',
  ]),
  ...L('draw', [
    'Empate, {score}. Ni fu ni fa.',
    'Un punto es un punto. Habrá que conformarse.',
    'Para cómo ha ido, el empate no está tan mal.',
    'Nos hemos dejado dos puntos. Otra vez será.',
  ]),
  ...L('loss', [
    'Perdido, {score}. Qué mal cuerpo se me queda.',
    'Hoy no era el día. Se vuelve a casa con la cabeza gacha.',
    'No hemos estado. Ellos han sido mejores, hay que reconocerlo.',
    '{score}... Bueno, el próximo partido, otra vez aquí.',
  ]),
  // Valen antes, durante y después del partido.
  ...L('bye', [
    'Venga, hasta luego.',
    'Nos vemos por aquí, ¿no? Siempre estoy en esta zona.',
    'Venga, cuídate. ¡Hasta la próxima!',
    'Hala, hasta otra. Aquí estaré.',
  ]),
  ...L('cheer-us', [
    '¡Eso es! ¡Vamos, {us}!',
    '¡Más alto, que no nos oyen!',
    'Así me gusta. ¡A animar todos!',
    '¡Vamos! Con la grada así, se gana seguro.',
  ]),
  ...L('cheer-them', [
    'Ya, ya. Anima, anima, que os va a hacer falta.',
    'Mucho grito, pero en el campo mandamos nosotros.',
    'Tranquilo, que aquí también se sabe cantar.',
    'Con respeto, pero hoy esto es de {us}.',
  ]),
  ...L('celebrate-us', [
    '¡Sííí! ¡Dame esos cinco!',
    '¡Qué alegría! Esto hay que celebrarlo.',
    '¡Grita, grita, que esto no pasa todos los días!',
    '¡Eso es! ¡Aquí no se rinde nadie!',
  ]),
  ...L('celebrate-them', [
    'Vale, vale, ya lo he visto. No hace falta restregarlo.',
    'Disfrútalo mientras dure.',
    'Sí, sí, muy bonito. Ya hablaremos al final.',
    'Uf. Hoy me toca callar.',
  ]),
];

/** Cuánto dura lo último que ha pasado como tema de conversación (minutos de juego). */
export const FAN_RECENT = { goal: 10, chance: 6 } as const;

/** Vueltas de charla antes de que quien habla vuelva al partido (sin contar la despedida). */
export const FAN_TURNS = 3;
