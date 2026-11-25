// VID-03 F2 · Catálogo de microhistorias (systems/MicroStories las hace nacer, elegir y resolver).
// Una historia futura es otra entrada de MICRO_STORIES: systems/ no se toca. Sólo datos.
import type { MicroTrigger } from '../systems/MicroStories.ts';
import type { SocialDelta } from '../systems/Social.ts';

export interface MicroOptionEffects {
  /** Dinero al elegir (negativo: sale de la cartera). Para elegirla hace falta tenerlo libre. */
  money?: number;
  /** Sufijo del movementId del ledger: `ms:<storyId>:<movement>`. */
  movement?: string;
  rel?: Partial<SocialDelta>;
  /** Recuerdo social (noteSocialMemory en F4). */
  memory?: string;
  /** Se entrega un regalo de la bolsa (Gifts.giveGift en F4). Para elegirla hace falta tener alguno. */
  gift?: true;
  /** Concepto del cobro en Cuentas (si no, el label de la opción). */
  ledger?: string;
}

export interface MicroOptionDef {
  id: string;
  label: string;
  effects: MicroOptionEffects;
  /** Días tras elegir hasta que el NPC responde. */
  responseInDays: number;
  /** La respuesta: lo que dice ese día y, si hay, el dinero que vuelve. */
  /** `ledger`: concepto del abono en Cuentas (si no, el label de la opción). */
  respond: { line: string; money?: number; movement?: string; ledger?: string };
  texts: {
    /** Lo que dices al elegir. */
    offer: string;
    /** Nota del móvil al resolver o expirar. {day}: día de la elección (o de la expiración). */
    recall: { title: string; body: string };
  };
}

export interface MicroStoryDef {
  id: string;
  priority: number;
  actors: readonly string[];
  trigger: MicroTrigger;
  cooldownDays: number;
  /** El planteamiento, en boca del actor (también el mensaje del móvil si hay contacto). */
  pitch: string;
  /** Debe incluir 'ignore': es la que se aplica si nadie elige a tiempo. */
  options: readonly MicroOptionDef[];
}

export const MICRO_STORIES: readonly MicroStoryDef[] = [
  {
    id: 'rent-nati',
    priority: 1,
    actors: ['nati'],
    trigger: { kind: 'npc-shortfall', npc: 'nati' },
    cooldownDays: 14,
    pitch: 'Fin de mes y no me cuadra el alquiler del local. Me faltan treinta. Veinte años y todavía pasa.',
    options: [
      {
        id: 'lend',
        label: 'Prestarle 30 €',
        effects: { money: -30, movement: 'lend', rel: { friendship: 6, trust: 4 }, memory: 'te echó una mano con el alquiler', ledger: 'Préstamo a Nati' },
        responseInDays: 1,
        respond: { line: 'Toma, los treinta y algo más. No se me olvida.', money: 36, movement: 'repay', ledger: 'Nati te devuelve el préstamo' },
        texts: {
          offer: 'Toma, treinta. Ya me los devolverás.',
          recall: { title: 'Le presté 30 € a Nati para el alquiler', body: 'Día {day}: le dejé 30 € para el local. Me devolvió 36 €.' },
        },
      },
      {
        id: 'gift',
        label: 'Llevarle algo de la bolsa',
        effects: { gift: true },
        responseInDays: 2,
        respond: { line: 'Al final cuadró el mes. Y lo que me trajiste lo tengo en el espejo.' },
        texts: {
          offer: 'No llevo dinero, pero esto es para ti. Para animar el local.',
          recall: { title: 'Le llevé algo a Nati por lo del alquiler', body: 'Día {day}: le di un regalo de la bolsa. Cuadró el mes.' },
        },
      },
      {
        id: 'ignore',
        label: 'Ahora no puedo',
        effects: { rel: { mood: -4, trust: -2 }, memory: 'no le dijiste nada del alquiler' },
        responseInDays: 2,
        respond: { line: 'Ya salió lo del alquiler. Sin ayuda, pero salió.' },
        texts: {
          offer: 'Ahora no puedo, Nati. Lo siento.',
          recall: { title: 'No ayudé a Nati con el alquiler', body: 'Día {day}: no le eché una mano. Se le notó.' },
        },
      },
    ],
  },
];
