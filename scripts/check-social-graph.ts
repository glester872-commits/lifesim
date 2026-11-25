// VID-02 F1 · Relaciones entre NPC (systems/SocialGraph) y su guardado: `node scripts/check-social-graph.ts`.
// Control positivo: si migrate no añadiera socialGraph, (2) falla; si el parse no deduplicara, (4) ve la arista dos
// veces; sin el filtro de excluidos, (5) carga a Sara; sin los topes, (6) pasa de 12 aristas.
import assert from 'node:assert/strict';
import { SAVE_KEY, SAVE_VERSION } from '../src/config/constants.ts';
import { createInitialState, inspectRaw, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import {
  coworkerPairs, edgeIdOf, emptySocialGraph, EVENT_TTL_DAYS, EXCLUDED_NPCS, explainEdge, lastNegativeDay, MAX_CATCHUP_DAYS, REPAIR_AFTER_NEG_DAYS, MAX_EDGES, MAX_EDGES_PER_NPC, MAX_EVENTS,
  MAX_EVENTS_PER_TICK, parseSocialGraph, seedSocialGraph, socialLineFor, tickSocialGraph, type SocialGraphState,
} from '../src/systems/SocialGraph.ts';
import { SOCIAL_LINES } from '../src/data/socialCauses.ts';
import { NPC_DEFS } from '../src/data/npcs.ts';
import { NAMED_RELATIONSHIPS, type NamedRelationship } from '../src/data/namedPeople.ts';
import { STORIES } from '../src/data/saraStory.ts';
import { PREGNANCIES } from '../src/data/pregnancy.ts';
import { MATES } from '../src/data/roommate.ts';

function memory(): { store: Map<string, string>; save: SaveSystem } {
  const store = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
  return { store, save: new SaveSystem(storage) };
}
const edge = (a: string, b: string, extra: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ edgeId: edgeIdOf(a, b), npcA: a, npcB: b, type: 'acquaintance', weight: 0, lastChangedAt: 0, originEventIds: [], ...extra });

// 1 · basura → vacío
for (const junk of [undefined, null, 1, 'x', [], {}, { edges: 'no' }, { v: 1, edges: [1, null, 'x', { npcA: 'marco' }, edge('marco', 'marco')], events: [{ id: 'e' }], memory: [] }]) {
  assert.deepEqual(parseSocialGraph(junk), emptySocialGraph(), JSON.stringify(junk));
}

// 2 · SAVE_VERSION 12 (VID-07 subió el esquema); migración v7 → v8 idempotente; v13 → 'newer'
assert.equal(SAVE_VERSION, 12);
{
  const v7 = { ...createInitialState(), money: 77 };
  const a = memory();
  a.store.set(SAVE_KEY, JSON.stringify({ version: 7, savedAt: 0, state: v7 }));
  const once = a.save.load()!;
  assert.deepEqual(once.socialGraph, emptySocialGraph());
  assert.equal(once.money, 77);
  assert.ok(a.save.save(once));
  assert.deepEqual(a.save.load(), once, 'migrar y volver a cargar no cambia nada');
  const b = memory();
  b.store.set(SAVE_KEY, JSON.stringify({ version: 7, savedAt: 0, state: once }));
  assert.deepEqual(b.save.load(), once, 'migrar un estado ya migrado da lo mismo');
  const newer = inspectRaw(JSON.stringify({ version: 13, savedAt: 0, state: v7 }));
  assert.ok(newer.status === 'unreadable' && newer.reason === 'newer');
}

// 3 · EXCLUDED_NPCS sale de los datos: historias, embarazos, compañero de piso y parejas
{
  const must = new Set<string>(['sara', 'ada', 'amaia', ...Object.values(STORIES).map((s) => s.npc), ...PREGNANCIES.map((p) => p.npc), ...MATES.map((m) => m.npc)]);
  for (const r of NAMED_RELATIONSHIPS) if (r.type === 'couple' || r.type === 'married' || r.type === 'dating') must.add(r.a).add(r.b);
  for (const id of must) assert.ok(EXCLUDED_NPCS.has(id), `falta excluir a ${id}`);
  assert.ok(EXCLUDED_NPCS.has('iker'), 'Iker es pareja de Yasmin (y padre de Nour): protegido');
}

// 4 · seed y coworkerPairs: los compañeros de seguridad del metro libres, sin pares excluidos ni protegidos
{
  const pairs = coworkerPairs();
  assert.deepEqual(pairs.map((r) => edgeIdOf(r.a, r.b)).sort(), ['marco|rocio']);
  for (const r of pairs) {
    assert.equal(r.type, 'coworkers');
    assert.ok(!EXCLUDED_NPCS.has(r.a) && !EXCLUDED_NPCS.has(r.b));
  }
  const seeded = seedSocialGraph();
  assert.deepEqual(seeded, seedSocialGraph(pairs));
  assert.deepEqual(seeded.edges, [{ edgeId: 'marco|rocio', npcA: 'marco', npcB: 'rocio', type: 'acquaintance', weight: 0, lastChangedAt: 0, originEventIds: [] }]);
  // Los pares protegidos (pareja, matrimonio, exes) no siembran nada aunque se pasen a mano.
  const protectedPairs = NAMED_RELATIONSHIPS.filter((r) => ['couple', 'married', 'dating', 'exes'].includes(r.type));
  assert.ok(protectedPairs.length > 0);
  assert.deepEqual(seedSocialGraph(protectedPairs), emptySocialGraph());
  assert.deepEqual(seedSocialGraph(NAMED_RELATIONSHIPS), seeded, 'sólo el trabajo es simulable');

  // 4b · ida y vuelta por SaveSystem sin duplicados
  const g: SocialGraphState = { ...seeded, events: [{ id: 'ev-1', day: 3, edgeId: 'marco|rocio', cause: 'turno', delta: 2 }], memory: { marco: { cause: 'turno', day: 3, spokenDay: 0 } }, lastTickDay: 3 };
  const { store, save } = memory();
  assert.ok(save.save({ ...createInitialState(), socialGraph: g }));
  assert.deepEqual(save.load()!.socialGraph, g);
  const file = JSON.parse(store.get(SAVE_KEY)!) as { state: { socialGraph: SocialGraphState } };
  file.state.socialGraph.edges.push(structuredClone(g.edges[0]), edge('rocio', 'marco'));
  file.state.socialGraph.events.push(structuredClone(g.events[0]));
  store.set(SAVE_KEY, JSON.stringify(file));
  assert.deepEqual(save.load()!.socialGraph, g, 'repetidos: una sola vez');
}

// 5 · excluidos y desconocidos se descartan en el parse; weight y type se normalizan
{
  const p = parseSocialGraph({
    edges: [edge('sara', 'marco'), edge('iker', 'rocio'), edge('nadie', 'marco'), edge('marco', 'rocio', { weight: 999.4, type: 'enemigos', originEventIds: ['a', 'b', 'c', 'd', 'e', 'f', 'a'] })],
    memory: { sara: { cause: 'x', day: 1, spokenDay: 1 }, nadie: { cause: 'x', day: 1, spokenDay: 1 } },
  });
  assert.equal(p.edges.length, 1);
  assert.equal(p.edges[0].weight, 100);
  assert.equal(p.edges[0].type, 'acquaintance');
  assert.deepEqual(p.edges[0].originEventIds, ['c', 'd', 'e', 'f']);
  assert.deepEqual(p.memory, {});
  assert.equal(parseSocialGraph({ edges: [edge('marco', 'rocio', { weight: -500 })] }).edges[0].weight, -100);
}

// 6 · el parse recorta a los topes
{
  const free = NPC_DEFS.map((n) => n.id).filter((id) => !EXCLUDED_NPCS.has(id));
  const edges: Record<string, unknown>[] = [];
  for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) edges.push(edge(free[i], free[j]));
  assert.ok(edges.length > MAX_EDGES);
  const first = edges[0] as { edgeId: string };
  const events = Array.from({ length: MAX_EVENTS + 10 }, (_, i) => ({ id: `ev-${i}`, day: 1, edgeId: first.edgeId, cause: 'c', delta: 1 }));
  const p = parseSocialGraph({ edges, events, lastTickDay: 1 });
  assert.ok(p.edges.length <= MAX_EDGES);
  const per = new Map<string, number>();
  for (const e of p.edges) for (const id of [e.npcA, e.npcB]) per.set(id, (per.get(id) ?? 0) + 1);
  for (const [id, n] of per) assert.ok(n <= MAX_EDGES_PER_NPC, `${id} tiene ${n} aristas`);
  assert.equal(p.events.length, MAX_EVENTS);
  assert.equal(p.events.at(-1)!.id, `ev-${MAX_EVENTS + 9}`, 'se quedan los más recientes');
  // Eventos caducados (más de EVENT_TTL_DAYS) fuera.
  assert.equal(parseSocialGraph({ edges: [edge('marco', 'rocio')], events: [{ id: 'old', day: 1, edgeId: 'marco|rocio', cause: 'c', delta: 1 }], lastTickDay: 40 }).events.length, 0);
}

// ── F2 · tickSocialGraph ────────────────────────────────────────────────────────────────────────────────────────
const run = (days: number, s: SocialGraphState = emptySocialGraph(), pairs = coworkerPairs()): SocialGraphState[] => {
  const out: SocialGraphState[] = [];
  for (let d = 1; d <= days; d++) out.push((s = tickSocialGraph(s, d, pairs)));
  return out;
};

// a · 10 días sin jugador: la arista cambia y es trazable
{
  const s = run(10).at(-1)!;
  const e = s.edges.find((x) => x.edgeId === 'marco|rocio')!;
  assert.ok(e.originEventIds.length > 0 && e.lastChangedAt > 0, 'diez días sin ningún evento');
  const lines = explainEdge(s, e.edgeId);
  assert.equal(lines.length, e.originEventIds.length);
  for (const l of lines) assert.match(l, /^Día \d+: .+ \(delta [+-]\d+\) → (friend|acquaintance|tension|rift)$/);
  assert.equal(s.lastTickDay, 10);
}

// b · determinismo
assert.deepEqual(run(30), run(30));

// c · idempotencia: mismo día → misma referencia; guardar, cargar y repetir el día no añade eventos
{
  const s = run(5).at(-1)!;
  assert.equal(tickSocialGraph(s, 5), s);
  assert.equal(tickSocialGraph(s, 3), s, 'un día pasado no hace nada');
  const { save } = memory();
  assert.ok(save.save({ ...createInitialState(), socialGraph: s }));
  const loaded = save.load()!.socialGraph!;
  assert.deepEqual(loaded, s);
  const again = tickSocialGraph(loaded, 5);
  assert.equal(again, loaded);
  assert.equal(again.events.length, s.events.length);
}

// d · un salto de 200 días procesa como mucho MAX_CATCHUP_DAYS
{
  const s = run(1).at(-1)!;
  const j = tickSocialGraph(s, 201);
  const fresh = j.events.filter((ev) => !s.events.some((x) => x.id === ev.id));
  assert.ok(fresh.length <= MAX_EVENTS_PER_TICK * MAX_CATCHUP_DAYS);
  for (const ev of fresh) assert.ok(ev.day > 201 - MAX_CATCHUP_DAYS, `día ${ev.day} fuera de la ventana`);
  assert.equal(j.lastTickDay, 201);
  assert.ok(j.events.every((ev) => ev.day >= 201 - EVENT_TTL_DAYS), 'caducados fuera');
}

// e · carga: 40 pares sintéticos de NPC reales no excluidos
{
  const free = NPC_DEFS.map((n) => n.id).filter((id) => !EXCLUDED_NPCS.has(id));
  const pairs: NamedRelationship[] = [];
  // Repartidos (vecinos a distancia 1, luego 2…) para que los topes por NPC no dejen el grafo en tres aristas.
  for (let off = 1; off < free.length && pairs.length < 40; off++) for (let i = 0; i + off < free.length && pairs.length < 40; i++) pairs.push({ a: free[i], b: free[i + off], type: 'coworkers' });
  assert.equal(pairs.length, 40);
  tickSocialGraph(emptySocialGraph(), 1, pairs); // calentamiento
  let s = emptySocialGraph();
  for (let d = 1; d <= 60; d++) {
    const t0 = performance.now();
    const next = tickSocialGraph(s, d, pairs);
    const ms = performance.now() - t0;
    assert.ok(ms < 5, `tick de ${ms.toFixed(2)} ms`);
    assert.ok(next.events.filter((ev) => !s.events.some((x) => x.id === ev.id)).length <= MAX_EVENTS_PER_TICK, `día ${d}: más de ${MAX_EVENTS_PER_TICK} eventos`);
    assert.ok(next.edges.length <= MAX_EDGES && next.events.length <= MAX_EVENTS);
    const per = new Map<string, number>();
    for (const e of next.edges) for (const id of [e.npcA, e.npcB]) per.set(id, (per.get(id) ?? 0) + 1);
    for (const [id, n] of per) assert.ok(n <= MAX_EDGES_PER_NPC, `${id} tiene ${n} aristas`);
    s = next;
  }
}

// f · una discusión que días después se resuelve con una disculpa (marco|rocio, días seguidos desde el 1)
const states400 = run(400);
let found = 0;
{
  const states = states400;
  for (let i = 1; i < states.length && !found; i++) {
    const prev = states[i - 1].edges[0];
    const ev = states[i].events.find((x) => x.day === i + 1 && x.cause === 'disculpa');
    if (!ev) continue;
    assert.ok(prev.type === 'tension' || prev.type === 'rift', 'disculpa sin tensión previa');
    assert.ok(i + 1 - lastNegativeDay(states[i - 1].events, prev) >= REPAIR_AFTER_NEG_DAYS, 'disculpa demasiado pronto tras la última causa negativa');
    found = i + 1;
  }
  assert.ok(found > 0, 'ninguna disculpa en 400 días');
  console.log(`check-social-graph: primera disculpa de marco|rocio el día ${found}`);
}

// f2 · partida real, días 1–60: un conflicto (tension/rift) se reconcilia con una disculpa en ≤ 7 días
{
  const strip = states400.slice(0, 60).map((s, i) => {
    const e = s.edges.find((x) => x.edgeId === 'marco|rocio')!;
    const ev = s.events.find((x) => x.day === i + 1 && x.edgeId === e.edgeId);
    assert.ok(e.weight >= -100 && e.weight <= 100, `día ${i + 1}: weight ${e.weight} fuera de rango`);
    return { day: i + 1, cause: ev?.cause ?? '-', weight: e.weight, type: e.type };
  });
  console.log(`check-social-graph: tira marco|rocio ${strip.map((t) => `${t.day}:${t.cause}:${t.weight}:${t.type}`).join(' ')}`);
  const inConflict = (t: (typeof strip)[number]): boolean => t.type === 'tension' || t.type === 'rift';
  let start = -1;
  let rec: { day: number; from: number } | null = null;
  for (let i = 0; i < strip.length && !rec; i++) {
    if (inConflict(strip[i])) { if (start < 0) start = i; continue; }
    if (start >= 0 && strip[i].day - strip[start].day <= 7 && strip.slice(start + 1, i + 1).some((t) => t.cause === 'disculpa')) rec = { day: strip[i].day, from: strip[start].day };
    start = -1;
  }
  assert.ok(rec, 'ningún conflicto reconciliado con disculpa en ≤ 7 días entre los días 1 y 60');
  console.log(`check-social-graph: reconciliación de marco|rocio el día ${rec.day} (desde el día ${rec.from})`);
}

// f3 · rift forzado 10 ticks: ninguna causa con delta < 0 y weight en [−100, 100]
{
  let s = parseSocialGraph({ edges: [edge('marco', 'rocio', { type: 'rift', weight: -100 })], lastTickDay: 5 });
  for (let d = 6; d <= 15; d++) {
    s = { ...s, edges: s.edges.map((e) => ({ ...e, type: 'rift' as const, weight: -100 })) };
    const next = tickSocialGraph(s, d);
    for (const ev of next.events.filter((x) => x.day === d)) assert.ok(ev.delta >= 0, `día ${d}: ${ev.cause} (${ev.delta}) en rift`);
    for (const e of next.edges) assert.ok(e.weight >= -100 && e.weight <= 100, `día ${d}: weight ${e.weight}`);
    s = next;
  }
}

// g · los excluidos pasados en pairs nunca entran
{
  const bad: NamedRelationship[] = [{ a: 'sara', b: 'marco', type: 'coworkers' }, { a: 'iker', b: 'rocio', type: 'coworkers' }, ...coworkerPairs()];
  for (const s of run(20, emptySocialGraph(), bad)) {
    for (const e of s.edges) assert.ok(!EXCLUDED_NPCS.has(e.npcA) && !EXCLUDED_NPCS.has(e.npcB));
    for (const id of Object.keys(s.memory)) assert.ok(!EXCLUDED_NPCS.has(id));
  }
}

// h · el tick no toca nada de Sara ni del resto de la partida (Social, Story, datos)
{
  const init = createInitialState();
  const snap = structuredClone(init);
  const stories = JSON.stringify(STORIES);
  const npcs = JSON.stringify(NPC_DEFS);
  run(15, init.socialGraph ?? emptySocialGraph());
  assert.deepEqual(init, snap);
  assert.equal(JSON.stringify(STORIES), stories);
  assert.equal(JSON.stringify(NPC_DEFS), npcs);
}

// ── F3 · socialLineFor ──────────────────────────────────────────────────────────────────────────────────────────
{
  const nameOf = (id: string): string => NPC_DEFS.find((n) => n.id === id)!.name;
  const rift = parseSocialGraph({ edges: [edge('marco', 'rocio', { type: 'rift', weight: -60 })], lastTickDay: 5 });

  // i · una vez al día: frase, null el mismo día, frase al día siguiente
  const first = socialLineFor(rift, 'marco', 5);
  assert.ok(first, 'rift sin frase el primer día');
  assert.equal(first.state.memory.marco.spokenDay, 5);
  assert.equal(socialLineFor(first.state, 'marco', 5), null, 'dos veces el mismo día');
  assert.ok(socialLineFor(first.state, 'marco', 6), 'sin frase al día siguiente');
  assert.equal(rift.memory.marco, undefined, 'socialLineFor no muta el estado de entrada');

  // ii · acquaintance sin causa: nada; sin arista: nada
  assert.equal(socialLineFor(seedSocialGraph(), 'marco', 5), null);
  assert.equal(socialLineFor(seedSocialGraph(), 'sara', 5), null);

  // iii · rift: frase del banco de rift que nombra al compañero
  for (const [npc, other] of [['marco', 'rocio'], ['rocio', 'marco']] as const) {
    for (let d = 1; d <= 12; d++) {
      const r = socialLineFor(rift, npc, d)!;
      assert.ok(SOCIAL_LINES.rift.some((l) => l.split('{other}').join(nameOf(other)) === r.line), `fuera del banco de rift: ${r.line}`);
      assert.ok(r.line.includes(nameOf(other)), `no nombra a ${other}: ${r.line}`);
    }
  }

  // iv · tras la primera disculpa de la simulación: reconciled
  const s = states400[found - 1];
  assert.equal(s.memory.marco.cause, 'disculpa');
  const rec = socialLineFor(s, 'marco', found);
  assert.ok(rec && SOCIAL_LINES.reconciled.some((l) => l.split('{other}').join(nameOf('rocio')) === rec.line), `día ${found}: sin frase reconciled (${rec?.line})`);

  // v · determinismo
  assert.deepEqual(socialLineFor(rift, 'rocio', 9), socialLineFor(structuredClone(rift), 'rocio', 9));
  assert.deepEqual(socialLineFor(s, 'rocio', found), socialLineFor(states400[found - 1], 'rocio', found));
}

console.log('check-social-graph: OK (parse, migración v7→v8, newer, excluidos, seed, ida y vuelta, topes, tick F2, frases F3)');
