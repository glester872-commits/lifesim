/**
 * Conversación de calle: los tipos y las opciones del jugador. El contenido (las
 * frases) está en data/chatLines.ts, data/chatReplies.ts y data/chatNamed.ts, y
 * quien elige entre ellas es systems/Chat.ts. Nada de esto sabe de Phaser.
 *
 * Una frase es un texto con etiquetas: de qué trata (`topic`) y a quién y cuándo
 * le vale (estilo de hablar, ánimo, lo que hace, dónde está, la hora, el día,
 * el tiempo, sus intereses, lo que conoce al jugador, si va solo). Sin etiqueta,
 * vale para todos; con ella, sólo para quien cumple. El estilo y los intereses
 * salen de cómo es la persona (nunca de cómo se ve).
 */
import type { Interest } from './identity.ts';

export type Topic =
  | 'greeting' | 'smalltalk' | 'weather' | 'time' | 'neighborhood' | 'city' | 'work' | 'plans' | 'food' | 'music'
  | 'fashion' | 'sports' | 'nightlife' | 'transit' | 'fitness' | 'weekend' | 'complaint' | 'positive' | 'tired'
  | 'hurried' | 'awkward' | 'friendly' | 'joke' | 'bye-short' | 'bye-long'
  // Lo que se oye al preguntarle algo concreto: qué hace, cómo se toma la broma o el cumplido.
  | 'doing' | 'joke-back' | 'compliment-back';

export type Style = 'friendly' | 'shy' | 'energetic' | 'dry' | 'sarcastic' | 'calm' | 'talkative' | 'reserved' | 'direct' | 'humorous';
export type Mood = 'good' | 'neutral' | 'tired' | 'hurried' | 'down';
/** Lo que está haciendo ahora. */
export type Act = 'commute' | 'exercise' | 'food' | 'shop' | 'nightout' | 'relax' | 'tourist' | 'walk' | 'wait' | 'work';
/** Dónde está. */
export type Place = 'street' | 'park' | 'nightlife' | 'metro' | 'plaza' | 'gym' | 'food' | 'shop' | 'indoors' | 'residential';
export type Weather = 'rain' | 'cold' | 'warm' | 'clear';
export type Days = 'weekday' | 'weekend' | 'friday' | 'saturday' | 'sunday' | 'night-out';

/** Etiquetas de una frase; todas opcionales. */
export interface Tags {
  /** Estilos a los que les pega. */
  s?: readonly Style[];
  m?: readonly Mood[];
  /** Lo que hace. */
  a?: readonly Act[];
  /** Dónde está. */
  p?: readonly Place[];
  /** [desde, hasta) en horas; si pasa de medianoche, [22, 4]. */
  h?: readonly [number, number];
  d?: Days;
  w?: readonly Weather[];
  /** Sólo quien tiene alguno de estos intereses. */
  i?: readonly Interest[];
  /** Cuánto conoce al jugador, como mínimo: 1 le suena, 2 son amigos. */
  r?: 1 | 2;
  /** Sólo si va solo o en grupo. */
  g?: 'alone' | 'group';
  /** Acaba en pregunta al jugador (se limitan: no todo el mundo pregunta). */
  q?: true;
  /** Cierra la conversación (el que habla se va o se despide). */
  end?: true;
  /** Sólo este personaje con nombre. */
  n?: string;
}

export interface Line extends Tags {
  id: string;
  text: string;
  topic: Topic;
}

/** Una opción para el jugador. */
export interface ChatOption {
  id: string;
  label: string;
}

/** Cómo se ofrece cada opción y de qué temas sale la respuesta. */
export interface OptionDef {
  id: string;
  label: string;
  /** Temas posibles y su peso base; los que no tengan frases para esta persona se descartan. */
  topics: readonly (readonly [Topic, number])[];
}

export const OPTIONS: readonly OptionDef[] = [
  { id: 'howru', label: '¿Qué tal?', topics: [['positive', 1], ['tired', 1], ['complaint', 1], ['smalltalk', 1.2]] },
  { id: 'doing', label: 'Preguntar qué hace', topics: [['doing', 1]] },
  { id: 'weather', label: 'Hablar del tiempo', topics: [['weather', 1]] },
  { id: 'hood', label: 'Preguntar por el barrio', topics: [['neighborhood', 1.4], ['city', 0.7]] },
  { id: 'plans', label: 'Preguntar por planes', topics: [['plans', 1], ['weekend', 1], ['nightlife', 0.6]] },
  { id: 'joke', label: 'Hacer una broma', topics: [['joke-back', 1]] },
  { id: 'compliment', label: 'Hacer un cumplido', topics: [['compliment-back', 1]] },
  { id: 'answer', label: 'Responder', topics: [['friendly', 1], ['smalltalk', 1], ['awkward', 0.4]] },
  // Sólo a quien le interesa: el tema aparece con su nombre.
  { id: 'sports', label: 'Hablar de fútbol', topics: [['sports', 1]] },
  { id: 'music', label: 'Hablar de música', topics: [['music', 1]] },
  { id: 'fashion', label: 'Hablar de ropa', topics: [['fashion', 1]] },
  { id: 'food', label: 'Hablar de comida', topics: [['food', 1]] },
  { id: 'fitness', label: 'Hablar de entrenar', topics: [['fitness', 1]] },
  { id: 'nightlife', label: 'Hablar de salir de noche', topics: [['nightlife', 1]] },
  { id: 'transit', label: 'Hablar del metro', topics: [['transit', 1]] },
  { id: 'work', label: 'Preguntar por el trabajo', topics: [['work', 1]] },
  // Sólo a quien tiene gente de la que hablar (systems/People.tiesOf): la respuesta se arma con su relación.
  { id: 'people', label: 'Preguntar por su gente', topics: [] },
  { id: 'bye', label: 'Despedirse', topics: [['bye-short', 1], ['bye-long', 0.6]] },
];

/** Cómo habla cada temperamento (data/identity.ts): estilos posibles, sin relación con cómo se ve. */
export const STYLES_BY_TEMPERAMENT: Readonly<Record<string, readonly Style[]>> = {
  extrovertido: ['friendly', 'energetic', 'talkative'],
  tranquilo: ['calm', 'friendly', 'dry'],
  reservado: ['reserved', 'shy', 'direct'],
  curioso: ['talkative', 'friendly', 'direct'],
  bromista: ['humorous', 'sarcastic', 'energetic'],
};

/** Cuántas vueltas aguanta cada estilo antes de despedirse por su cuenta (el prisas, una). */
export const PATIENCE: Readonly<Record<Style, number>> = {
  friendly: 4, shy: 2, energetic: 4, dry: 2, sarcastic: 3, calm: 3, talkative: 5, reserved: 2, direct: 2, humorous: 4,
};

/** Frases con ids estables (tema + huella del texto): una llamada crea todas las variantes del mismo tipo. */
export function lines(topic: Topic, tags: Tags, ...texts: string[]): Line[] {
  return texts.map((text) => ({ id: `${topic}.${tags.n ?? ''}${hashOf(text)}`, text, topic, ...tags }));
}

function hashOf(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/**
 * Cómo se despide el jugador: la opción de terminar la charla está siempre, desde la primera frase, y su texto cambia
 * según la relación, la hora y el ánimo (la lógica es siempre la misma: `bye`). `r`: sólo si le conoce; `m`: ánimo.
 */
export interface ByeLabel {
  text: string;
  r?: 1 | 2;
  h?: readonly [number, number];
  m?: readonly Mood[];
}

export const BYE_LABELS: readonly ByeLabel[] = [
  { text: 'Despedirse' }, { text: 'Nos vemos' }, { text: 'Bueno, me voy' }, { text: 'Hasta luego' }, { text: 'Que vaya bien' },
  { text: 'Tengo que seguir' }, { text: 'Hablamos luego' }, { text: 'Cuídate' },
  { text: 'Hasta otra', r: 1 }, { text: 'Ya nos vemos, ¿eh?', r: 1 }, { text: 'Un abrazo', r: 2 }, { text: 'Luego te cuento', r: 2 },
  { text: 'Buenas noches', h: [21, 5] }, { text: 'Que descanses', h: [21, 5], r: 1 }, { text: 'Que tengas buen día', h: [6, 14] }, { text: 'Disfruta de la tarde', h: [14, 21] },
  { text: 'Perdona, tengo prisa', m: ['hurried'] }, { text: 'Te dejo, que vas con prisa', m: ['hurried'] }, { text: 'Te dejo descansar', m: ['tired'] }, { text: 'Gracias, hasta luego', m: ['down'] },
];
