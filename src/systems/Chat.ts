// Sin Phaser: lo usa scenes/WorldScene.ts y lo prueba scripts/check-chat.ts.
import { CHAT_LINES } from '../data/chatLines.ts';
import { CHAT_REPLIES } from '../data/chatReplies.ts';
import { NAMED_LINES, NAMED_VOICES } from '../data/chatNamed.ts';
import {
  BYE_LABELS, OPTIONS, PATIENCE, STYLES_BY_TEMPERAMENT,
  type Act, type ChatOption, type Days, type Line, type Mood, type OptionDef, type Place, type Style, type Topic, type Weather,
} from '../data/chat.ts';
import type { Interest } from '../data/identity.ts';
import { IDENTITIES } from './People.ts';
import { nightOwner, weekIndex } from './Calendar.ts';
import type { Rng } from './MetroDaily.ts';

/**
 * Conversación de calle sin IA externa: frases escritas (data/chat*.ts) filtradas por el contexto de ese
 * momento (quién es, qué hace, dónde está, la hora, el día, el tiempo, cuánto conoce al jugador), elegidas
 * al azar con peso y con memoria de lo ya dicho para que no se repitan. Todo se decide al abrir la charla y al
 * contestar cada vez: nada corre entre medias.
 */

// ------------------------------------------------------------------ contexto

/** Lo que el escenario sabe de quien habla: ningún dato sale de su aspecto. */
export interface ChatInput {
  /** Clave de su memoria: un agente de la sala o de la calle, o un personaje con nombre. */
  who: string;
  /** Persona del barrio (índice de IDENTITIES), si es de la gente anónima. */
  identity?: number;
  /** Personaje con nombre (data/npcs.ts), si lo es. */
  named?: string;
  /** El oficio o viaje que hace (`Agent.role`) y su estado ahora. */
  role?: string;
  state?: string;
  place: Place;
  day: number;
  hour: number;
  minute: number;
  weather: Weather;
  group: boolean;
  /** Cuánto conoce al jugador: 0 nada, 1 le suena, 2 son amigos. */
  rel: 0 | 1 | 2;
}

export interface ChatContext {
  who: string;
  named?: string;
  styles: readonly Style[];
  mood: Mood;
  act: Act;
  place: Place;
  hour: number;
  minute: number;
  /** Día de la semana lógico (0 lunes … 6 domingo; la madrugada es de la noche anterior). */
  weekday: number;
  weather: Weather;
  interests: readonly Interest[];
  rel: 0 | 1 | 2;
  group: boolean;
}

const hash = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Qué hace, según su oficio o viaje y su estado. */
export function actOf(role: string | undefined, state: string | undefined): Act {
  if (state && /^(CARDIO|LIFT|STRETCH|WARM_UP)$/.test(state)) return 'exercise';
  if (state === 'DANCE' || state === 'CHEER') return 'nightout';
  const r = role ?? '';
  if (/commut|metro|bus|office|returning/.test(r)) return 'commute';
  if (/gym|jog|run/.test(r)) return 'exercise';
  if (/club|night|bar-|carmen-prenight|popup-dj/.test(r)) return 'nightout';
  if (/terrace|brunch|coffee|diner|customer|takeaway/.test(r)) return 'food';
  if (/shop|errand|browse|window|outfit|sneaker|market|popup-art|piercing|tattoo|fashion/.test(r)) return 'shop';
  if (/park|reader|bench|dog|stroll|talk|couple|friends|hang/.test(r)) return 'relax';
  if (/tourist/.test(r)) return 'tourist';
  if (/wait|queue/.test(r) || state === 'WAIT') return 'wait';
  if (/waiter|bartender|receptionist|staff|worker/.test(r)) return 'work';
  return 'walk';
}

/** Dónde está, por el tipo de su zona de la calle (data/zones.ts) o por el local en el que está. */
export function placeOf(location: string, zoneType?: string): Place {
  if (location === 'district') {
    switch (zoneType) {
      case 'residential': return 'residential';
      case 'plaza': return 'plaza';
      case 'gym_area': return 'gym';
      case 'restaurant_area': return 'food';
      case 'metro': return 'metro';
      case 'park': return 'park';
      case 'nightlife': return 'nightlife';
      default: return 'street';
    }
  }
  if (/gym/.test(location)) return 'gym';
  if (/cafe|restaurant|wine|bar/.test(location)) return 'food';
  if (/clothing|super|store|shop|vintage|archivo|vuelta/.test(location)) return 'shop';
  if (/club|nightclub/.test(location)) return 'nightlife';
  return 'indoors';
}

/** El tiempo como lo comenta la gente: llueve, hace frío o calor, o está despejado. */
export function weatherKind(w: { rain: number; temp: string }): Weather {
  return w.rain > 0.08 ? 'rain' : w.temp === 'cold' ? 'cold' : w.temp === 'warm' ? 'warm' : 'clear';
}

const isRush = (h: number): boolean => (h >= 7 && h < 9.8) || (h >= 17 && h < 19.2);

/** Cómo anda de ánimo: estable un rato (tres horas), según lo que hace y la hora; sólo con prisa quien va a algún sitio. */
function moodOf(who: string, act: Act, hour: number, wx: Weather): Mood {
  const roll = (hash(`${who}:${Math.floor(hour / 3)}:ánimo`) % 1000) / 1000;
  const hurried = act === 'commute' ? (isRush(hour) ? 0.5 : 0.18) : act === 'walk' || act === 'shop' ? 0.06 : 0;
  const late = hour < 6 || hour >= 23;
  const tired = late ? 0.4 : hour < 8 ? 0.2 : 0.1;
  const down = wx === 'rain' ? 0.18 : 0.07;
  const good = act === 'nightout' || act === 'relax' || act === 'food' ? 0.45 : 0.3;
  if (roll < hurried) return 'hurried';
  if (roll < hurried + tired) return 'tired';
  if (roll < hurried + tired + down) return 'down';
  if (roll < hurried + tired + down + good) return 'good';
  return 'neutral';
}

export function buildContext(i: ChatInput): ChatContext {
  const identity = i.identity !== undefined ? IDENTITIES[i.identity] : undefined;
  const voice = i.named ? NAMED_VOICES[i.named] : undefined;
  // Cómo habla sale de su temperamento (nunca de cómo se ve); entre los estilos de ese temperamento, uno fijo por persona.
  const options = voice?.styles ?? STYLES_BY_TEMPERAMENT[identity?.temperament ?? 'tranquilo'] ?? ['calm'];
  const style = options[hash(`${i.who}:estilo`) % options.length];
  const act = actOf(i.role, i.state);
  const hour = i.hour + i.minute / 60;
  return {
    who: i.who,
    named: i.named,
    styles: voice ? [...voice.styles] : [style],
    mood: moodOf(i.who, act, hour, i.weather),
    act,
    place: i.place,
    hour,
    minute: i.minute,
    weekday: weekIndex(nightOwner(i.day, i.hour)),
    weather: i.weather,
    interests: voice?.interests ?? identity?.interests ?? [],
    rel: i.rel,
    group: i.group,
  };
}

// -------------------------------------------------------------------- memoria

class Mem {
  lines: string[] = [];
  topics: string[] = [];
  chats = 0;
  /** La última respuesta preguntó algo al jugador. */
  asked = false;
}

/**
 * Lo dicho hace poco. Cada persona recuerda sus últimas frases y temas (la gente anónima, poco y sólo mientras
 * está en la sala; los personajes con nombre, más y todo el rato); y entre todos se recuerdan las últimas que se
 * han dicho al jugador, para que tampoco se oiga lo mismo de una persona a la siguiente.
 */
export class ChatLog {
  private readonly mems = new Map<string, Mem>();
  private readonly recent: string[] = [];

  mem(key: string): Mem {
    let m = this.mems.get(key);
    if (!m) {
      // La gente anónima, con tope: la calle tiene mucha y no hace falta recordarla toda.
      if (this.mems.size >= 400) this.mems.delete(this.mems.keys().next().value as string);
      this.mems.set(key, (m = new Mem()));
    }
    return m;
  }

  /** Lo que se oyó la última vez que se habló con esa persona (para saber si le suenas). */
  chatsWith(key: string): number {
    return this.mems.get(key)?.chats ?? 0;
  }

  noted(key: string, line: Line, named: boolean): void {
    const m = this.mem(key);
    m.lines.push(line.id);
    m.topics.push(line.topic);
    if (m.lines.length > (named ? 160 : 40)) m.lines.shift();
    if (m.topics.length > 8) m.topics.shift();
    this.recent.push(line.id);
    if (this.recent.length > 14) this.recent.shift();
  }

  recentAll(): readonly string[] {
    return this.recent;
  }

  /** Al cambiar de sala o de calle, la gente anónima ya no está: su memoria no sirve (la de los personajes con nombre, sí). */
  forgetCrowd(): void {
    for (const k of [...this.mems.keys()]) if (k.startsWith('c:')) this.mems.delete(k);
  }
}

// ---------------------------------------------------------------- selección

const POOLS: Readonly<Record<string, readonly Line[]>> = (() => {
  const out: Record<string, Line[]> = {};
  for (const l of [...CHAT_LINES, ...CHAT_REPLIES, ...NAMED_LINES]) (out[l.topic] ??= []).push(l);
  return out;
})();

/** Todas las frases del sistema (para las pruebas y las estadísticas). */
export const ALL_LINES: readonly Line[] = [...CHAT_LINES, ...CHAT_REPLIES, ...NAMED_LINES];

const inHours = (h: readonly [number, number], t: number): boolean => (h[0] <= h[1] ? t >= h[0] && t < h[1] : t >= h[0] || t < h[1]);

function daysOk(d: Days, c: ChatContext): boolean {
  const wd = c.weekday;
  switch (d) {
    case 'weekday': return wd <= 4;
    case 'weekend': return wd >= 5;
    case 'friday': return wd === 4;
    case 'saturday': return wd === 5;
    case 'sunday': return wd === 6;
    // Viernes y sábado por la noche (y la madrugada siguiente, que cuenta con la noche anterior).
    case 'night-out': return (wd === 4 || wd === 5) && (c.hour >= 19 || c.hour < 6);
  }
}

const pick = <T>(rng: Rng, items: readonly (readonly [T, number])[]): T | undefined => {
  const total = items.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return undefined;
  let roll = rng() * total;
  for (const [item, w] of items) {
    roll -= w;
    if (roll < 0) return item;
  }
  return items[items.length - 1][0];
};

/** El peso de una frase para este contexto: 0 si no le vale, y más cuanto más a medida. */
export function fit(l: Line, c: ChatContext): number {
  if (l.n && l.n !== c.named) return 0;
  if (l.s && !l.s.some((s) => c.styles.includes(s))) return 0;
  if (l.m && !l.m.includes(c.mood)) return 0;
  if (l.a && !l.a.includes(c.act)) return 0;
  if (l.p && !l.p.includes(c.place)) return 0;
  if (l.h && !inHours(l.h, c.hour)) return 0;
  if (l.d && !daysOk(l.d, c)) return 0;
  if (l.w && !l.w.includes(c.weather)) return 0;
  if (l.i && !l.i.some((i) => c.interests.includes(i))) return 0;
  if (l.r && c.rel < l.r) return 0;
  if (l.g && (l.g === 'group') !== c.group) return 0;
  // Lo hecho a medida pesa más que lo de todos: así el tono, el tiempo y los gustos se notan.
  let w = 1;
  if (l.s) w *= 2;
  if (l.m) w *= 2;
  if (l.a) w *= 1.8;
  if (l.p) w *= 1.5;
  if (l.h) w *= 1.3;
  if (l.d) w *= 1.6;
  if (l.w) w *= 3;
  if (l.i) w *= 2.2;
  if (l.r) w *= l.r === c.rel ? 3 : 1.8;
  if (l.n) w *= 6;
  return w;
}

const SHORT_STYLES: readonly Style[] = ['reserved', 'shy', 'dry', 'direct'];
const LONG_STYLES: readonly Style[] = ['talkative', 'friendly', 'energetic'];

/** Quien habla poco prefiere frases cortas; quien habla mucho, largas: no todas las respuestas miden lo mismo. */
function lengthFit(text: string, c: ChatContext): number {
  const short = c.styles.some((s) => SHORT_STYLES.includes(s));
  const long = c.styles.some((s) => LONG_STYLES.includes(s));
  if (c.mood === 'hurried') return text.length > 60 ? 0.3 : 1.4;
  if (short && !long) return text.length <= 40 ? 3 : text.length > 90 ? 0.12 : 0.6;
  if (long && !short) return text.length > 70 ? 2.6 : text.length <= 22 ? 0.45 : 1;
  return 1;
}

const SPOKEN = ['doce', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once'];
const DAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/** La hora como se dice: «las tres y cuarto», «la una y media», «las ocho menos cuarto». */
export function spokenTime(hour: number, minute: number): string {
  let q = Math.round(minute / 15) * 15;
  let h = Math.floor(hour);
  if (q === 60) {
    q = 0;
    h = (h + 1) % 24;
  }
  const next = (h + 1) % 24;
  const say = (n: number): string => `${n % 12 === 1 ? 'la' : 'las'} ${SPOKEN[n % 12]}`;
  if (q === 0) return say(h);
  if (q === 15) return `${say(h)} y cuarto`;
  if (q === 30) return `${say(h)} y media`;
  return `${say(next)} menos cuarto`;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Rellena {hora}, {Hora}, {ahora}, {Ahora}, {es} y {dia}/{dias} con el momento. */
export function fill(text: string, c: ChatContext): string {
  if (!text.includes('{')) return text;
  const t = spokenTime(Math.floor(c.hour), c.minute);
  const singular = t.startsWith('la ');
  const day = DAYS[c.weekday];
  const plural = day === 'sábado' || day === 'domingo' ? `${day}s` : day;
  return text
    .replaceAll('{Hora}', cap(t))
    .replaceAll('{hora}', t)
    .replaceAll('{Ahora}', `A ${t}`)
    .replaceAll('{ahora}', `a ${t}`)
    .replaceAll('{es}', singular ? 'es' : 'son')
    .replaceAll('{dias}', plural)
    .replaceAll('{dia}', day);
}

// -------------------------------------------------------------- conversación

export interface ChatTurn {
  /** Lo que dice (una o dos frases seguidas). */
  lines: string[];
  /** Lo que puede contestar el jugador; vacío si la conversación se acabó. */
  options: ChatOption[];
  ends: boolean;
  /** Ids de las frases dichas (para las pruebas y las estadísticas). */
  ids: string[];
  topics: Topic[];
}

const REMARK_TOPICS: readonly Topic[] = [
  'weather', 'time', 'neighborhood', 'city', 'positive', 'tired', 'complaint', 'weekend', 'nightlife', 'transit', 'food',
  'work', 'plans', 'music', 'fashion', 'sports', 'fitness',
];

export class Conversation {
  readonly ctx: ChatContext;
  private readonly log: ChatLog;
  private readonly rng: Rng;
  private readonly named: boolean;
  private readonly patience: number;
  private readonly usedOptions = new Set<string>();
  private turns = 0;
  private lastAsked = false;
  /** Cosas amables dichas por el jugador que han salido bien: la relación con un personaje con nombre sube con ellas. */
  positives = 0;

  constructor(input: ChatInput, log: ChatLog, rng: Rng = Math.random) {
    this.ctx = buildContext(input);
    this.log = log;
    this.rng = rng;
    this.named = !!input.named;
    const base = Math.max(...this.ctx.styles.map((s) => PATIENCE[s]));
    this.patience = this.ctx.mood === 'hurried' ? 1 : this.ctx.mood === 'tired' || this.ctx.mood === 'down' ? Math.max(1, base - 1) : base;
    this.lastAsked = log.mem(input.who).asked;
  }

  /** La primera frase: el saludo, a veces con un comentario del momento, y qué se puede responder. */
  open(): ChatTurn {
    const c = this.ctx;
    const mem = this.log.mem(c.who);
    mem.chats++;
    const said: Line[] = [];
    const greet = this.line('greeting');
    if (greet) said.push(greet);
    if (c.mood === 'hurried') {
      const rush = this.line('hurried');
      if (rush) said.push(rush);
    } else if (this.rng() < this.remarkChance()) {
      const topic = this.remarkTopic();
      const remark = topic && this.line(topic);
      if (remark) said.push(remark);
    }
    return this.turn(said, false);
  }

  /** El jugador elige una opción: la respuesta, y si sigue la charla o se acaba. */
  choose(optionId: string): ChatTurn {
    const c = this.ctx;
    this.usedOptions.add(optionId);
    this.turns++;
    this.lastAsked = false;
    const said: Line[] = [];
    let ends = false;
    if (optionId === 'bye') {
      const long = c.rel > 0 || this.turns > 2 ? 0.7 : 0.25;
      const topic = pick<Topic>(this.rng, [['bye-short', 1], ['bye-long', c.styles.some((s) => LONG_STYLES.includes(s)) ? long * 1.4 : long * 0.5]]);
      const bye = this.line(topic ?? 'bye-short') ?? this.line('bye-short');
      if (bye) said.push(bye);
      ends = true;
    } else {
      const reply = this.reply(optionId);
      if (reply) said.push(reply);
      if (optionId === 'joke' || optionId === 'compliment' || optionId === 'howru') this.positives++;
      if (reply?.q) this.lastAsked = true;
      this.log.mem(c.who).asked = !!reply?.q;
      // Se despide por su cuenta: por prisa, por cansancio o porque a su estilo ya le ha llegado.
      if (reply?.end || this.turns >= this.patience) {
        const bye = this.line('bye-short');
        if (bye && !reply?.end) said.push(bye);
        ends = true;
      }
    }
    return this.turn(said, ends);
  }

  // ----------------------------------------------------------------- por dentro

  private turn(said: Line[], ends: boolean): ChatTurn {
    return {
      lines: said.map((l) => fill(l.text, this.ctx)),
      options: ends ? [] : this.options(),
      ends: ends || said.some((l) => l.end),
      ids: said.map((l) => l.id),
      topics: said.map((l) => l.topic),
    };
  }

  /** Cuántas veces comenta algo de entrada: más quien habla mucho, nada quien va con prisa. */
  private remarkChance(): number {
    const c = this.ctx;
    const by: Record<Style, number> = { talkative: 0.75, energetic: 0.6, friendly: 0.55, humorous: 0.5, sarcastic: 0.4, calm: 0.4, direct: 0.25, dry: 0.2, shy: 0.2, reserved: 0.12 };
    const base = Math.max(...c.styles.map((s) => by[s]));
    return Math.min(0.9, base + c.rel * 0.1) * (c.mood === 'tired' ? 0.7 : 1);
  }

  /** De qué comenta: lo que pega con el momento (el tiempo si llueve, el finde si lo es, lo suyo si le interesa). */
  private remarkTopic(): Topic | undefined {
    const c = this.ctx;
    const mem = this.log.mem(c.who);
    const interest = (i: Interest): boolean => c.interests.includes(i);
    const weights: [Topic, number][] = REMARK_TOPICS.map((t): [Topic, number] => {
      let w = 1;
      if (t === 'weather') w = c.weather === 'clear' ? 0.8 : 3;
      if (t === 'time') w = 0.9;
      if (t === 'neighborhood') w = c.place === 'residential' ? 0.5 : 1.1;
      if (t === 'city') w = 0.5;
      if (t === 'positive') w = c.mood === 'good' ? 2.2 : 0;
      if (t === 'tired') w = c.mood === 'tired' ? 3 : 0;
      if (t === 'complaint') w = c.mood === 'down' ? 3 : 0.4;
      if (t === 'weekend') w = c.weekday >= 4 ? 2 : 0.6;
      if (t === 'nightlife') w = (c.hour >= 20 || c.hour < 5) && (interest('nightlife') || c.act === 'nightout') ? 2.5 : 0;
      if (t === 'transit') w = c.act === 'commute' || c.place === 'metro' ? 2.4 : 0.2;
      if (t === 'food') w = c.act === 'food' || interest('food') ? 1.8 : 0.4;
      if (t === 'work') w = c.act === 'commute' || c.act === 'work' ? 2 : 0.4;
      if (t === 'plans') w = 1;
      if (t === 'music') w = interest('music') ? 2.2 : 0;
      if (t === 'fashion') w = interest('fashion') ? 2.2 : 0;
      if (t === 'sports') w = interest('football') ? 2.2 : 0;
      if (t === 'fitness') w = interest('fitness') || c.place === 'gym' || c.act === 'exercise' ? 2.4 : 0;
      // Que no sea siempre el mismo tipo de tema.
      if (mem.topics.slice(-3).includes(t)) w *= 0.25;
      if (!(POOLS[t] ?? []).some((l) => fit(l, c) > 0)) w = 0;
      return [t, w];
    });
    return pick(this.rng, weights);
  }

  /** Qué ofrece el jugador: un puñado según el momento y quien es, siempre con «Despedirse» al final. */
  private options(): ChatOption[] {
    const c = this.ctx;
    const talky = c.styles.some((s) => LONG_STYLES.includes(s));
    const shy = c.styles.some((s) => SHORT_STYLES.includes(s));
    const funny = c.styles.some((s) => s === 'humorous' || s === 'sarcastic' || s === 'energetic' || s === 'friendly');
    const interest = (i: Interest): boolean => c.interests.includes(i);
    const hurried = c.mood === 'hurried';
    const weight = (o: OptionDef): number => {
      if (o.id === 'bye') return 0;
      if (this.usedOptions.has(o.id)) return 0;
      switch (o.id) {
        case 'answer': return this.lastAsked ? 9 : 0;
        case 'howru': return hurried ? 1 : 2.2;
        case 'doing': return hurried ? 0.7 : 2;
        case 'weather': return hurried ? 0 : c.weather === 'clear' ? 0.6 : 2.4;
        case 'hood': return hurried ? 0 : c.place === 'residential' ? 0.7 : 1.4;
        case 'plans': return hurried ? 0 : c.hour >= 15 || c.hour < 11 ? 1.3 : 0.8;
        case 'joke': return hurried ? 0 : funny ? 1.6 : shy ? 0.4 : 0.9;
        case 'compliment': return hurried ? 0 : c.rel > 0 ? 1.5 : shy ? 0.5 : 0.8;
        case 'sports': return interest('football') ? 2.4 : 0;
        case 'music': return interest('music') ? 2.4 : 0;
        case 'fashion': return interest('fashion') ? 2.4 : 0;
        case 'food': return interest('food') ? 2.2 : 0;
        case 'fitness': return interest('fitness') || c.place === 'gym' ? 2.4 : 0;
        case 'nightlife': return (interest('nightlife') || c.act === 'nightout') && (c.hour >= 18 || c.hour < 5) ? 2.4 : 0;
        case 'transit': return c.act === 'commute' || c.place === 'metro' ? 2.2 : 0;
        case 'work': return c.act === 'commute' || c.act === 'work' ? 1.8 : 0;
      }
      return 0;
    };
    // Sólo se ofrece lo que esta persona sabe contestar (le quedan frases para ese tema).
    const candidates: [OptionDef, number][] = OPTIONS.map((o): [OptionDef, number] => [o, this.answerable(o) ? weight(o) : 0]);
    const count = hurried ? 1 : talky ? 4 : shy ? 2 : 3;
    const chosen: OptionDef[] = [];
    // «Responder» va primero si acaba de preguntar.
    const answer = candidates.find(([o, w]) => o.id === 'answer' && w > 0);
    if (answer) {
      chosen.push(answer[0]);
      candidates.splice(candidates.indexOf(answer), 1);
    }
    while (chosen.length < count) {
      const next = pick(this.rng, candidates.filter(([, w]) => w > 0));
      if (!next) break;
      chosen.push(next);
      candidates.splice(candidates.findIndex(([o]) => o.id === next.id), 1);
    }
    // Despedirse está siempre, desde la primera frase, sin nada que gastar antes; sólo cambia cómo se dice.
    return [...chosen.map((o) => ({ id: o.id, label: o.label })), { id: 'bye', label: this.byeLabel() }];
  }

  /** Cómo se despide el jugador ahora: según la relación, la hora y el ánimo de quien le escucha. */
  private byeLabel(): string {
    const c = this.ctx;
    const options = BYE_LABELS.filter((b) => (!b.r || c.rel >= b.r) && (!b.h || inHours(b.h, c.hour)) && (!b.m || b.m.includes(c.mood)));
    return pick(this.rng, options.map((b): [string, number] => [b.text, (b.m ? 3 : 1) * (b.h ? 1.6 : 1) * (b.r ? 1.5 : 1)])) ?? 'Despedirse';
  }

  private answerable(o: OptionDef): boolean {
    return this.topicsOf(o).some(([t]) => (POOLS[t] ?? []).some((l) => fit(l, this.ctx) > 0));
  }

  /** Los temas de los que puede salir la respuesta a una opción, con su peso según cómo está quien contesta. */
  private topicsOf(o: OptionDef): readonly (readonly [Topic, number])[] {
    const c = this.ctx;
    const shy = c.styles.some((s) => SHORT_STYLES.includes(s));
    switch (o.id) {
      case 'howru': {
        if (c.mood === 'hurried') return [['hurried', 1]];
        const by: Record<Mood, Topic> = { good: 'positive', tired: 'tired', down: 'complaint', neutral: 'smalltalk', hurried: 'hurried' };
        return [[by[c.mood], 4], ['smalltalk', 1.5], ['awkward', shy ? 0.5 : 0.05]];
      }
      case 'joke':
        return c.styles.some((s) => s === 'humorous' || s === 'sarcastic') ? [['joke-back', 1], ['joke', 0.7]] : [['joke-back', 1]];
      case 'compliment':
        return c.rel > 0 ? [['compliment-back', 1], ['friendly', 0.4]] : [['compliment-back', 1]];
      case 'plans':
        return [['plans', 1], ['weekend', c.weekday >= 4 ? 1.6 : 0.5], ['nightlife', c.hour >= 18 || c.hour < 5 ? 0.8 : 0]];
      default:
        return o.topics;
    }
  }

  private reply(optionId: string): Line | undefined {
    const def = OPTIONS.find((o) => o.id === optionId);
    if (!def) return undefined;
    const mem = this.log.mem(this.ctx.who);
    const topics = this.topicsOf(def)
      .filter(([t]) => (POOLS[t] ?? []).some((l) => fit(l, this.ctx) > 0))
      .map(([t, w]): [Topic, number] => [t, mem.topics.slice(-3).includes(t) ? w * 0.3 : w]);
    const topic = pick(this.rng, topics);
    return topic ? this.line(topic) : this.line('smalltalk');
  }

  /** Una frase del tema para este contexto, evitando lo dicho hace poco; se anota en la memoria. */
  private line(topic: Topic): Line | undefined {
    const c = this.ctx;
    const mem = this.log.mem(c.who);
    const global = this.log.recentAll();
    // Un personaje con nombre recuerda más y tarda más en repetirse.
    const hard = this.named ? 30 : 10;
    const soft = this.named ? 120 : 40;
    const options = (POOLS[topic] ?? []).map((l): [Line, number] => {
      let w = fit(l, c);
      if (w <= 0) return [l, 0];
      w *= lengthFit(l.text, c);
      const at = mem.lines.lastIndexOf(l.id);
      if (at >= 0) {
        const age = mem.lines.length - at;
        w *= age <= hard ? 0.02 : age <= soft ? 0.25 : 0.6;
      }
      if (global.includes(l.id)) w *= 0.4;
      // No todos preguntan: las que acaban en pregunta pesan menos, y casi nada si acaba de preguntar uno.
      if (l.q) w *= this.lastAsked ? 0.1 : c.styles.some((s) => SHORT_STYLES.includes(s)) ? 0.2 : 0.55;
      return [l, w];
    });
    const chosen = pick(this.rng, options.filter(([, w]) => w > 0));
    if (chosen) this.log.noted(c.who, chosen, this.named);
    return chosen;
  }
}
