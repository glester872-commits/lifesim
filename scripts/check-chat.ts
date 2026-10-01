// Conversación de calle contextual (data/chat*.ts, systems/Chat.ts): `npm run check`.
// Falla si faltan temas o frases, si una frase sale donde no le toca (hora, día, tiempo, lugar, estilo, intereses),
// si la misma persona o la calle entera repite demasiado, si el estilo no se nota en la longitud de lo que dice, o si
// un personaje con nombre suena igual que un peatón.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALL_LINES, ChatLog, Conversation, buildContext, fit, fill, spokenTime, type ChatInput } from '../src/systems/Chat.ts';
import { IDENTITIES } from '../src/systems/People.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import type { Topic } from '../src/data/chat.ts';

const BY_ID = new Map(ALL_LINES.map((l) => [l.id, l]));

// ------------------------------------------------ el contenido
const TOPICS: readonly Topic[] = [
  'greeting', 'smalltalk', 'weather', 'time', 'neighborhood', 'city', 'work', 'plans', 'food', 'music', 'fashion', 'sports',
  'nightlife', 'transit', 'fitness', 'weekend', 'complaint', 'positive', 'tired', 'hurried', 'awkward', 'friendly', 'joke',
  'bye-short', 'bye-long', 'doing', 'joke-back', 'compliment-back',
];
const perTopic = new Map<string, number>();
for (const l of ALL_LINES) perTopic.set(l.topic, (perTopic.get(l.topic) ?? 0) + 1);
for (const t of TOPICS) assert.ok((perTopic.get(t) ?? 0) >= 8, `pocas frases de ${t} (${perTopic.get(t) ?? 0})`);
assert.equal(BY_ID.size, ALL_LINES.length, 'ids de frase repetidos');
assert.equal(new Set(ALL_LINES.map((l) => l.text)).size, ALL_LINES.length - 0, 'frases repetidas');
assert.ok(ALL_LINES.length >= 450, `pocas frases (${ALL_LINES.length})`);
// Ningún token sin rellenar, a cualquier hora.
for (const l of ALL_LINES) {
  for (const [hour, minute] of [[0, 0], [1, 5], [8, 50], [13, 15], [20, 30], [23, 45]] as const) {
    const ctx = buildContext({ who: 'x', identity: 0, place: 'street', day: 1, hour, minute, weather: 'clear', group: false, rel: 0 });
    const out = fill(l.text, ctx);
    assert.ok(!/[{}]/.test(out), `token sin rellenar en «${l.text}»`);
  }
}
assert.equal(spokenTime(13, 5), 'la una');
assert.equal(spokenTime(15, 20), 'las tres y cuarto');
assert.equal(spokenTime(20, 45), 'las nueve menos cuarto');
assert.equal(fill('Ya {es} {hora}.', buildContext({ who: 'x', identity: 0, place: 'street', day: 1, hour: 1, minute: 0, weather: 'clear', group: false, rel: 0 })), 'Ya es la una.');
// Ningún dato de aspecto en el motor: el estilo y los gustos salen del temperamento y de los intereses.
const source = readFileSync(new URL('../src/systems/Chat.ts', import.meta.url), 'utf8');
assert.ok(!/\b(skin|origin|ethnic|presentation|orientation|\.build|\.height|\.fashion)\b/.test(source), 'el motor mira rasgos de aspecto');

// ------------------------------------------------ utilidades de prueba
const MONDAY = 1;
const base = (over: Partial<ChatInput> = {}): ChatInput => ({
  who: 'c:district:7', identity: 3, role: 'stroller', state: 'WALK', place: 'street', day: MONDAY + 2, hour: 12, minute: 0, weather: 'clear', group: false, rel: 0, ...over,
});

interface Talk {
  lines: string[];
  ids: string[];
  turns: number;
  options: string[][];
  replies: number;
  asked: number;
}

/** Una charla entera: el jugador elige al azar entre lo que se le ofrece (alguna vez se despide antes). */
function converse(input: ChatInput, log: ChatLog, rng: () => number): Talk {
  const talk = new Conversation({ ...input, rel: input.rel || (log.chatsWith(input.who) > 0 ? 1 : 0) }, log, rng);
  let turn = talk.open();
  const out: Talk = { lines: [...turn.lines], ids: [...turn.ids], turns: 1, options: [turn.options.map((o) => o.id)], replies: 0, asked: 0 };
  for (let guard = 0; guard < 12 && !turn.ends; guard++) {
    const pool = turn.options.filter((o) => o.id !== 'bye');
    const choose = pool.length > 0 && rng() > 0.12 ? pool[Math.floor(rng() * pool.length)] : turn.options[turn.options.length - 1];
    assert.equal(turn.options[turn.options.length - 1].id, 'bye', 'la despedida no es la última opción');
    turn = talk.choose(choose.id);
    out.lines.push(...turn.lines);
    // Las frases de su gente (`tie:`) se arman con su relación de verdad: no están en el catálogo (las prueba check-population).
    out.ids.push(...turn.ids.filter((x) => !x.startsWith('tie:')));
    out.turns++;
    out.replies++;
    if (turn.ids.some((id) => BY_ID.get(id)?.q)) out.asked++;
    if (!turn.ends) out.options.push(turn.options.map((o) => o.id));
  }
  assert.ok(turn.ends, 'la charla no acaba');
  // Todo lo que se dice vale para quien lo dice: sus etiquetas encajan con el contexto.
  for (const id of out.ids) assert.ok(fit(BY_ID.get(id)!, talk.ctx) > 0, `«${BY_ID.get(id)!.text}» no vale para ${JSON.stringify({ ...talk.ctx, interests: undefined })}`);
  return out;
}

const repeat = (a: readonly string[], b: readonly string[]): number => (b.length === 0 ? 0 : b.filter((id) => a.includes(id)).length / b.length);

// ------------------------------------------------ hablar muchas veces con la misma persona
{
  const withMemory = new ChatLog();
  const rng = seededRng(11);
  const talks: Talk[] = [];
  for (let i = 0; i < 30; i++) talks.push(converse(base({ identity: 5 }), withMemory, rng));
  let consecutive = 0;
  for (let i = 1; i < talks.length; i++) consecutive += repeat(talks[i - 1].ids, talks[i].ids);
  const all = talks.flatMap((t) => t.ids);
  const distinct = new Set(all).size / all.length;
  // Sin memoria (una charla nueva cada vez, que es lo que había): mucha más repetición.
  const rng2 = seededRng(11);
  const baseline: Talk[] = [];
  for (let i = 0; i < 30; i++) baseline.push(converse(base({ identity: 5 }), new ChatLog(), rng2));
  let baseConsecutive = 0;
  for (let i = 1; i < baseline.length; i++) baseConsecutive += repeat(baseline[i - 1].ids, baseline[i].ids);
  const baseDistinct = new Set(baseline.flatMap((t) => t.ids)).size / baseline.flatMap((t) => t.ids).length;
  assert.ok(consecutive / 29 < 0.1, `la misma persona repite entre charlas seguidas (${((consecutive / 29) * 100).toFixed(1)} %)`);
  assert.ok(distinct > 0.5, `la misma persona repite frases en 30 charlas (${(distinct * 100).toFixed(0)} % distintas)`);
  assert.ok(consecutive < baseConsecutive * 0.5, `la memoria no reduce la repetición (${consecutive.toFixed(2)} vs ${baseConsecutive.toFixed(2)})`);
  assert.ok(distinct > baseDistinct + 0.08, 'la memoria no aumenta la variedad');
  console.log(`  misma persona ×30: ${(distinct * 100).toFixed(0)} % de frases distintas (sin memoria ${(baseDistinct * 100).toFixed(0)} %), repite ${((consecutive / 29) * 100).toFixed(1)} % de una charla a la siguiente (sin memoria ${((baseConsecutive / 29) * 100).toFixed(1)} %)`);
}

// ------------------------------------------------ muchas personas distintas
{
  const log = new ChatLog();
  const rng = seededRng(21);
  const counts = new Map<string, number>();
  let total = 0;
  const firsts: string[] = [];
  for (let i = 0; i < IDENTITIES.length * 2; i++) {
    const talk = converse(base({ who: `c:district:${i}`, identity: i % IDENTITIES.length, hour: 8 + (i % 12), day: MONDAY + (i % 7) }), log, rng);
    for (const id of talk.ids) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
      total++;
    }
    firsts.push(talk.lines[0]);
  }
  const worst = Math.max(...counts.values()) / total;
  assert.ok(worst < 0.03, `una misma frase se oye demasiado en la calle (${(worst * 100).toFixed(1)} %)`);
  assert.ok(new Set(firsts).size >= 30, `muy pocos saludos distintos (${new Set(firsts).size})`);
  assert.ok(counts.size > 120, `poca variedad entre muchas personas (${counts.size} frases)`);
  console.log(`  120 charlas con gente distinta: ${counts.size} frases distintas, la más repetida ${(worst * 100).toFixed(1)} %, ${new Set(firsts).size} saludos distintos`);
}

// ------------------------------------------------ mañana frente a noche, laborable frente a fin de semana
function topicMix(over: Partial<ChatInput>, n = 80, seed = 31): Map<string, number> {
  const rng = seededRng(seed);
  const mix = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const talk = converse(base({ who: `c:district:${100 + i}`, identity: i % IDENTITIES.length, ...over }), new ChatLog(), rng);
    for (const id of talk.ids) mix.set(BY_ID.get(id)!.topic, (mix.get(BY_ID.get(id)!.topic) ?? 0) + 1);
  }
  return mix;
}
const share = (mix: Map<string, number>, ...topics: string[]): number => {
  const total = [...mix.values()].reduce((s, n) => s + n, 0);
  return topics.reduce((s, t) => s + (mix.get(t) ?? 0), 0) / total;
};
{
  const commute = topicMix({ role: 'commuter', place: 'metro', hour: 8, minute: 10, day: MONDAY });
  const night = topicMix({ role: 'club-goer', place: 'nightlife', hour: 2, minute: 0, day: MONDAY + 5, state: 'WAIT' });
  assert.ok(share(night, 'nightlife') > share(commute, 'nightlife') * 2 + 0.01, 'de madrugada no se habla más de la noche');
  assert.ok(share(commute, 'transit', 'work', 'hurried') > share(night, 'transit', 'work', 'hurried') * 1.5, 'a las 8 no se habla más de transporte y trabajo');
  const weekday = topicMix({ hour: 18, day: MONDAY + 1 });
  const weekend = topicMix({ hour: 18, day: MONDAY + 5 });
  assert.ok(share(weekend, 'weekend') >= share(weekday, 'weekend'), 'el fin de semana se habla menos del finde');
  const rain = topicMix({ weather: 'rain' });
  const clear = topicMix({ weather: 'clear' });
  assert.ok(share(rain, 'weather') > share(clear, 'weather') * 1.3, 'con lluvia no se habla más del tiempo');
  // Con la lluvia salen frases de lluvia; sin ella, nunca.
  const rainy = new Set<string>();
  const rng = seededRng(41);
  for (let i = 0; i < 40; i++) for (const id of converse(base({ who: `c:district:${i}`, identity: i % IDENTITIES.length, weather: 'clear' }), new ChatLog(), rng).ids) if (BY_ID.get(id)!.w?.includes('rain')) rainy.add(id);
  assert.equal(rainy.size, 0, 'salen frases de lluvia con el cielo despejado');
  console.log(`  noche ${(share(night, 'nightlife') * 100).toFixed(0)} % de la noche frente a ${(share(commute, 'nightlife') * 100).toFixed(0)} % a las 8 · transporte/trabajo ${(share(commute, 'transit', 'work', 'hurried') * 100).toFixed(0)} % de mañana frente a ${(share(night, 'transit', 'work', 'hurried') * 100).toFixed(0)} % de noche · tiempo con lluvia ${(share(rain, 'weather') * 100).toFixed(0)} % frente a ${(share(clear, 'weather') * 100).toFixed(0)} %`);
}

// ------------------------------------------------ parque, calle, zona de ocio y metro
{
  const places = ['park', 'street', 'nightlife', 'metro'] as const;
  const seen = new Map<string, Set<string>>();
  for (const place of places) {
    const rng = seededRng(51);
    const ids = new Set<string>();
    for (let i = 0; i < 80; i++) for (const id of converse(base({ who: `c:district:${i}`, identity: i % IDENTITIES.length, place, hour: place === 'nightlife' ? 23 : 12 }), new ChatLog(), rng).ids) ids.add(id);
    seen.set(place, ids);
  }
  for (const [place, ids] of seen) {
    for (const id of ids) {
      const l = BY_ID.get(id)!;
      if (l.p) assert.ok(l.p.includes(place as never), `«${l.text}» sale en ${place}`);
    }
  }
  const only = (place: string): number => [...seen.get(place)!].filter((id) => BY_ID.get(id)!.p?.includes(place as never)).length;
  for (const place of places) assert.ok(only(place) >= 2, `en ${place} no sale nada propio del sitio (${only(place)})`);
  console.log(`  frases propias del sitio: parque ${only('park')}, calle ${only('street')}, ocio nocturno ${only('nightlife')}, metro ${only('metro')}`);
}

// ------------------------------------------------ personalidades
{
  const styleOf = (i: number): string => buildContext(base({ who: `c:p:${i}`, identity: i })).styles[0];
  const talky = IDENTITIES.map((_, i) => i).filter((i) => ['talkative', 'friendly', 'energetic'].includes(styleOf(i)));
  const quiet = IDENTITIES.map((_, i) => i).filter((i) => ['reserved', 'shy', 'dry', 'direct'].includes(styleOf(i)));
  assert.ok(talky.length >= 8 && quiet.length >= 8, 'no hay suficientes de cada estilo');
  const stats = (people: number[]): { len: number; options: number; turns: number; perTalk: number } => {
    const rng = seededRng(61);
    let len = 0, n = 0, opts = 0, firstTurns = 0, turns = 0, chars = 0;
    for (const i of people) {
      for (let k = 0; k < 3; k++) {
        const t = converse(base({ who: `c:p:${i}:${k}`, identity: i, hour: 12 + k * 2 }), new ChatLog(), rng);
        len += t.lines.reduce((s, l) => s + l.length, 0);
        chars += t.lines.reduce((s, l) => s + l.length, 0);
        n += t.lines.length;
        opts += t.options[0].length;
        firstTurns++;
        turns += t.turns;
      }
    }
    return { len: len / n, options: opts / firstTurns, turns: turns / firstTurns, perTalk: chars / firstTurns };
  };
  const a = stats(talky);
  const b = stats(quiet);
  assert.ok(a.len > b.len * 1.1, `quien habla mucho no dice frases más largas (${a.len.toFixed(0)} vs ${b.len.toFixed(0)} caracteres por frase)`);
  assert.ok(a.perTalk > b.perTalk * 1.5, `quien habla mucho no dice más en total (${a.perTalk.toFixed(0)} vs ${b.perTalk.toFixed(0)} caracteres por charla)`);
  assert.ok(a.options >= b.options, 'a quien habla mucho no se le ofrece más');
  assert.ok(a.turns > b.turns, 'la charla de quien habla mucho no dura más');
  // Con prisa, la charla acaba enseguida.
  const rushed = IDENTITIES.map((_, i) => i).find((i) => buildContext(base({ who: `c:r:${i}`, identity: i, role: 'commuter', hour: 8, minute: 10, day: MONDAY })).mood === 'hurried');
  if (rushed !== undefined) {
    const t = converse(base({ who: `c:r:${rushed}`, identity: rushed, role: 'commuter', hour: 8, minute: 10, day: MONDAY }), new ChatLog(), seededRng(71));
    assert.ok(t.turns <= 2, `quien va con prisa alarga la charla (${t.turns} vueltas)`);
  }
  // No todos preguntan: pocas respuestas acaban en pregunta.
  const rng = seededRng(81);
  let asked = 0, replies = 0;
  for (let i = 0; i < 100; i++) {
    const t = converse(base({ who: `c:q:${i}`, identity: i % IDENTITIES.length }), new ChatLog(), rng);
    asked += t.asked;
    replies += Math.max(1, t.replies);
  }
  assert.ok(asked / replies < 0.15, `demasiadas respuestas acaban en pregunta (${((asked / replies) * 100).toFixed(0)} %)`);
  console.log(`  quien habla mucho: ${a.len.toFixed(0)} caracteres por frase (${a.perTalk.toFixed(0)} por charla), ${a.options.toFixed(1)} opciones, ${a.turns.toFixed(1)} vueltas; quien habla poco: ${b.len.toFixed(0)} (${b.perTalk.toFixed(0)}), ${b.options.toFixed(1)}, ${b.turns.toFixed(1)} · preguntan ${((asked / replies) * 100).toFixed(0)} % de las respuestas`);
}

// ------------------------------------------------ personaje con nombre frente a peatón
{
  const rngA = seededRng(91);
  const log = new ChatLog();
  const sara: Talk[] = [];
  for (let i = 0; i < 25; i++) sara.push(converse({ ...base({ who: 'sara', identity: undefined }), named: 'sara', role: 'stroller', rel: i > 5 ? 1 : 0, hour: 12 + (i % 8), day: MONDAY + (i % 7) }, log, rngA));
  const own = (talks: Talk[], id: string): number => talks.flatMap((t) => t.ids).filter((x) => BY_ID.get(x)!.n === id).length / talks.flatMap((t) => t.ids).length;
  assert.ok(own(sara, 'sara') > 0.25, `Sara suena a peatón (${(own(sara, 'sara') * 100).toFixed(0)} % de frases propias)`);
  const ada: Talk[] = [];
  for (let i = 0; i < 25; i++) ada.push(converse({ ...base({ who: 'ada', identity: undefined }), named: 'ada', role: 'stroller', hour: 12 + (i % 8), day: MONDAY + (i % 7) }, log, rngA));
  assert.ok(own(ada, 'ada') > 0.2, `Ada suena a peatón (${(own(ada, 'ada') * 100).toFixed(0)} % de frases propias)`);
  // Nada de lo suyo sale en la calle; y lo de Sara no sale con Ada.
  const rng = seededRng(92);
  for (let i = 0; i < 60; i++) for (const id of converse(base({ who: `c:n:${i}`, identity: i % IDENTITIES.length }), new ChatLog(), rng).ids) assert.ok(!BY_ID.get(id)!.n, 'una frase de un personaje con nombre sale en un peatón');
  for (const t of ada) for (const id of t.ids) assert.notEqual(BY_ID.get(id)!.n, 'sara', 'Ada dice cosas de Sara');
  // Y con amigos, su relación abre frases nuevas.
  const strangers = new Set<string>();
  const friends = new Set<string>();
  const r1 = seededRng(93);
  for (let i = 0; i < 40; i++) for (const id of converse({ ...base({ who: `sara:${i}`, identity: undefined }), named: 'sara', rel: 0 }, new ChatLog(), r1).ids) strangers.add(id);
  const r2 = seededRng(93);
  for (let i = 0; i < 40; i++) for (const id of converse({ ...base({ who: `sara:${i}`, identity: undefined }), named: 'sara', rel: 2 }, new ChatLog(), r2).ids) friends.add(id);
  assert.ok([...friends].some((id) => (BY_ID.get(id)!.r ?? 0) === 2), 'la amistad no abre frases');
  assert.ok(![...strangers].some((id) => (BY_ID.get(id)!.r ?? 0) >= 1), 'a un desconocido le dicen frases de quien se conoce');
  const all = sara.flatMap((t) => t.ids);
  console.log(`  Sara ${(own(sara, 'sara') * 100).toFixed(0)} % frases propias, Ada ${(own(ada, 'ada') * 100).toFixed(0)} % · Sara ×25: ${(new Set(all).size / all.length * 100).toFixed(0)} % distintas`);
}

// ------------------------------------------------ despedirse cuando se quiera
{
  const labels = new Set<string>();
  const people = IDENTITIES.map((_, i) => i).slice(0, 40);
  for (const i of people) {
    for (const topics of [0, 1, 2, 3, 5]) {
      const log = new ChatLog();
      const rng = seededRng(500 + i * 7 + topics);
      const talk = new Conversation(base({ who: `c:bye:${i}:${topics}`, identity: i, hour: 10 + (i % 10) }), log, rng);
      let turn = talk.open();
      // En cualquier momento (desde la primera frase), con cualquier número de temas ya hablados, «Despedirse» está y es la última.
      for (let said = 0; said < topics && !turn.ends; said++) {
        const last = turn.options[turn.options.length - 1];
        assert.equal(last.id, 'bye', `falta despedirse tras ${said} temas`);
        assert.ok(turn.options.length <= 9, 'más respuestas que teclas');
        const next = turn.options.find((o) => o.id !== 'bye');
        if (!next) break;
        turn = talk.choose(next.id);
      }
      if (turn.ends) continue; // el otro ya se despidió por su cuenta: la charla acabó
      const options = turn.options;
      assert.equal(options[options.length - 1].id, 'bye', `sin despedida con ${topics} temas`);
      labels.add(options[options.length - 1].label);
      // Despedirse acaba la charla ya, con una despedida del otro.
      const end = talk.choose('bye');
      assert.ok(end.ends && end.options.length === 0, `la despedida no cierra con ${topics} temas`);
      assert.ok(end.lines.length >= 1 && end.topics.some((t) => t === 'bye-short' || t === 'bye-long'), 'el otro no se despide');
    }
  }
  assert.ok(labels.size >= 6, `la despedida del jugador siempre dice lo mismo (${[...labels].join(', ')})`);
  // Y se puede volver a hablar después con la misma persona.
  const log = new ChatLog();
  for (let k = 0; k < 4; k++) {
    const talk = new Conversation(base({ who: 'c:district:again', identity: 9, rel: k > 0 ? 1 : 0 }), log, seededRng(600 + k));
    const first = talk.open();
    assert.ok(first.options.some((o) => o.id === 'bye'), 'otra charla sin despedida');
    assert.ok(talk.choose('bye').ends);
  }
  // Un personaje con nombre también.
  const named = new Conversation({ ...base({ who: 'sara', identity: undefined }), named: 'sara' }, new ChatLog(), seededRng(700));
  assert.equal(named.open().options.at(-1)?.id, 'bye');
  console.log(`  despedirse: desde la primera frase y con 0, 1, 2, 3 y 5 temas hablados · ${labels.size} maneras de decirlo (${[...labels].slice(0, 5).join(' / ')}...)`);
}

const named = ALL_LINES.filter((l) => l.n).length;
console.log(`conversación OK: ${ALL_LINES.length} frases (${named} de personajes con nombre) en ${TOPICS.length} temas, ${new Set(ALL_LINES.flatMap((l) => l.s ?? [])).size} estilos de habla; memoria, contexto, estilo y personajes con nombre comprobados`);
