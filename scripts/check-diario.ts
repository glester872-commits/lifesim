// VID-11 · Diario de vida (systems/Diary): ids deterministas, orden, tope, parse tolerante, guardado y puntos de emisión.
// Control positivo: cada bloque comprueba primero que el caso bueno sí apunta, para que un «no apunta» no pase por vacío.
import assert from 'node:assert/strict';
import { SAVE_KEY, SAVE_VERSION } from '../src/config/constants.ts';
import { JOBS } from '../src/data/jobs.ts';
import {
  addEntry, DIARY_MAX, diaryDetail, diaryFromGatherings, diaryFromJobChange, diaryFromProjects, diaryRow, emptyDiary, gatheringEntryId,
  GONE_NPC, GONE_PLACE, jobEntryId, parseDiary, projectEntryId, sortedEntries, type Diary, type NewDiaryEntry,
} from '../src/systems/Diary.ts';
import { hire, promote, quit } from '../src/systems/Jobs.ts';
import type { LifeProjectsState } from '../src/systems/LifeProjects.ts';
import { createInitialState, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import type { SocialEvent, SocialEventsState } from '../src/systems/SocialEvents.ts';

function memory(): { store: Map<string, string>; save: SaveSystem } {
  const store = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
  return { store, save: new SaveSystem(storage) };
}
const entry = (id: string, at: number): NewDiaryEntry => ({ id, type: 'gathering', at, title: id, npcs: [] });

// a · addEntry: apunta (control), y el mismo id devuelve el mismo objeto.
{
  const d1 = addEntry(emptyDiary(), entry('a', 10));
  assert.equal(d1.entries.length, 1, 'control: la primera se apunta');
  assert.equal(d1.entries[0].seq, 1);
  assert.equal(addEntry(d1, entry('a', 99)), d1, 'mismo id → mismo objeto');
  // b · repetición legítima: otro id, otra entrada.
  const d2 = addEntry(d1, entry('b', 10));
  assert.equal(d2.entries.length, 2);
  assert.notEqual(d2, d1);
  assert.equal(d1.entries.length, 1, 'addEntry no muta la entrada');
}

// c · orden: at desc y, en el mismo minuto, seq desc.
{
  let d = emptyDiary();
  for (const [id, at] of [['x', 5], ['y', 20], ['z', 20], ['w', 1]] as const) d = addEntry(d, entry(id, at));
  assert.deepEqual(sortedEntries(d).map((e) => e.id), ['z', 'y', 'x', 'w']);
  // h · leer no muta.
  const snap = structuredClone(d);
  sortedEntries(d);
  assert.deepEqual(d, snap, 'sortedEntries no muta');
}

// d · tope: pasado DIARY_MAX se van las más antiguas.
{
  let d = emptyDiary();
  for (let i = 0; i < DIARY_MAX + 5; i++) d = addEntry(d, entry(`e${i}`, i));
  assert.equal(d.entries.length, DIARY_MAX);
  assert.ok(!d.entries.some((e) => e.at < 5), 'las 5 más antiguas fuera');
  assert.ok(d.entries.some((e) => e.id === `e${DIARY_MAX + 4}`), 'la última se queda');
}

// e · parseDiary con basura.
{
  const good = addEntry(addEntry(emptyDiary(), entry('a', 1)), entry('b', 2));
  assert.deepEqual(parseDiary(structuredClone(good)), good, 'control: uno bueno vuelve igual');
  for (const junk of [null, 3, 'x', [], {}, { entries: 'no' }]) assert.deepEqual(parseDiary(junk), emptyDiary(), JSON.stringify(junk));
  const mixed = parseDiary({
    v: 1, seq: 1, entries: [
      { id: 'ok', type: 'job-hired', at: 1, seq: 4, title: 't', npcs: ['ana', 3] },
      { id: 'ok', type: 'job-hired', at: 2, seq: 5, title: 'repe', npcs: [] },
      { id: 7, type: 'job-hired', at: 1, title: 't' },
      { id: 'tipo', type: 'boda', at: 1, title: 't' },
      { id: 'nan', type: 'gathering', at: Number.NaN, title: 't' },
      { id: 'inf', type: 'gathering', at: Infinity, title: 't' },
    ],
  });
  assert.deepEqual(mixed.entries.map((e) => e.id), ['ok']);
  assert.deepEqual(mixed.entries[0].npcs, ['ana']);
  assert.equal(mixed.seq, 4, 'seq nunca por debajo del de sus entradas');
}

// f · guardar y cargar; g · partida sin diario → sin clave (GameState la lee vacía).
assert.equal(SAVE_VERSION, 12);
{
  const d: Diary = addEntry(emptyDiary(), { id: 'quedada:x', type: 'gathering', at: 100, title: 'Quedada', npcs: ['sara'], place: 'home', data: { outcome: 'bien' } });
  const { save } = memory();
  assert.ok(save.save({ ...createInitialState(), diary: d }));
  assert.deepEqual(save.load()!.diary, d, 'round-trip');
  const old = memory();
  old.store.set(SAVE_KEY, JSON.stringify({ version: 12, savedAt: 0, state: createInitialState() }));
  assert.equal(old.save.load()!.diary, undefined, 'partida antigua: sin diario');
  assert.deepEqual(parseDiary(undefined), emptyDiary());
  const broken = memory();
  broken.store.set(SAVE_KEY, JSON.stringify({ version: 12, savedAt: 0, state: { ...createInitialState(), diary: 'roto' } }));
  assert.deepEqual(broken.save.load()!.diary, emptyDiary(), 'diario roto → vacío, la partida carga');
}

// i · emisión del contrato: firma sí; ascenso, repaso y mismo estado no.
{
  const job = JOBS[0];
  const info = () => ({ employer: job.employer, title: job.levels[0].title, place: job.place });
  const signed = hire(job, 3, null);
  const e = diaryFromJobChange(null, signed, 5000, info);
  assert.ok(e, 'control: firmar apunta');
  assert.equal(e.id, jobEntryId(job.id, 4));
  assert.ok(e.title.includes(job.employer) && e.title.includes(job.levels[0].title));
  assert.equal(diaryFromJobChange(signed, promote(signed, 10), 9000, info), null, 'ascenso no apunta');
  assert.equal(diaryFromJobChange(signed, { ...signed, checked: 9 }, 9000, info), null, 'repaso no apunta');
  assert.equal(diaryFromJobChange(signed, signed, 9000, info), null, 'mismo antes/después no apunta');
  assert.equal(diaryFromJobChange(signed, quit(signed, 8), 9000, info), null, 'dejarlo no apunta');
  const again = diaryFromJobChange(quit(signed, 8), hire(job, 20, quit(signed, 8)), 30000, info);
  assert.ok(again && again.id !== e.id, 'volver a firmar es otra entrada');
}

// j · emisión de proyectos: sólo la transición a completado.
{
  const base = { type: 'buy-bike' as const, requirements: {}, milestones: [], progress: 0, startedAt: 0, originEventIds: [] };
  const active: LifeProjectsState = { v: 1, items: [{ ...base, id: 'p1', status: 'active', completedAt: null }] };
  const done: LifeProjectsState = { v: 1, items: [{ ...base, id: 'p1', status: 'completed', completedAt: 777 }] };
  const out = diaryFromProjects(active, done, 900);
  assert.equal(out.length, 1, 'control: completar apunta');
  assert.equal(out[0].id, projectEntryId('p1'));
  assert.equal(out[0].at, 777);
  assert.deepEqual(diaryFromProjects(done, done, 900), [], 'ya completado no apunta');
  assert.deepEqual(diaryFromProjects(active, active, 900), [], 'activo no apunta');
  const cancelled: LifeProjectsState = { v: 1, items: [{ ...base, id: 'p1', status: 'cancelled', completedAt: 800 }] };
  assert.deepEqual(diaryFromProjects(active, cancelled, 900), [], 'abandonar no apunta');
}

// k · emisión de quedadas: cerrada (no cancelada) una vez; con quién vino y cómo fue.
{
  const ev: SocialEvent = {
    id: 'evt:home:3:2000', kind: 'home-gathering', host: 'player', venueId: 'home', start: 2000, end: 2120, created: 1000,
    status: 'running', playerPresence: 'on-time', outcome: '', memoryEventIds: [],
    invited: [
      { npc: 'sara', status: 'accepted', reason: '', respondedAt: 1000, attendance: 'on-time' },
      { npc: 'luis', status: 'accepted', reason: '', respondedAt: 1000, attendance: 'absent' },
    ],
  };
  const running: SocialEventsState = { v: 1, events: [ev] };
  const closed: SocialEventsState = { v: 1, events: [{ ...ev, status: 'closed', outcome: 'bien' }] };
  const name = (n: string): string => n.toUpperCase();
  const out = diaryFromGatherings(running, closed, name);
  assert.equal(out.length, 1, 'control: cerrar apunta');
  assert.equal(out[0].id, gatheringEntryId(ev.id));
  assert.deepEqual(out[0].npcs, ['sara'], 'sólo quien vino');
  assert.ok(out[0].title.includes('SARA') && !out[0].title.includes('LUIS') && out[0].title.includes('salió bien'));
  assert.equal(out[0].place, 'home');
  assert.deepEqual(diaryFromGatherings(closed, closed, name), [], 'ya cerrada no apunta');
  assert.deepEqual(diaryFromGatherings(running, running, name), [], 'en marcha no apunta');
  const cancelled: SocialEventsState = { v: 1, events: [{ ...ev, status: 'cancelled', outcome: 'cancelada' }] };
  assert.deepEqual(diaryFromGatherings(running, cancelled, name), [], 'cancelada no apunta');
}

// l · vista: fila y detalle con resolutores inyectados; lo que ya no existe sale en neutro y no lanza.
{
  const e = addEntry(emptyDiary(), {
    id: 'quedada:v', type: 'gathering', at: 2 * 1440 + 19 * 60 + 5, title: 'Quedada en casa con Sara: salió bien',
    npcs: ['sara', 'fantasma'], place: 'home', data: { outcome: 'bien', presence: 'late' },
  }).entries[0];
  const row = diaryRow(e);
  assert.ok(row.when.endsWith('· 19:05'), row.when);
  assert.equal(row.title, e.title);
  const ok = { npc: (n: string) => (n === 'sara' ? 'Sara' : undefined), place: (p: string) => (p === 'home' ? 'Tu piso' : undefined) };
  const d = diaryDetail(e, ok);
  assert.equal(d.type, 'Quedada');
  assert.equal(d.time, '19:05');
  assert.deepEqual(d.people, ['Sara', GONE_NPC], 'control: Sara se resuelve; el ausente, neutro');
  assert.equal(d.place, 'Tu piso');
  assert.ok(d.facts.some((f) => f.includes('salió bien')) && d.facts.includes('Llegaste tarde'));
  const boom = (): string => { throw new Error('ya no existe'); };
  const gone = diaryDetail(e, { npc: boom, place: boom });
  assert.deepEqual(gone.people, [GONE_NPC, GONE_NPC], 'resolutor que lanza → neutro');
  assert.equal(gone.place, GONE_PLACE, 'lugar ausente → no lanza');
  assert.equal(diaryDetail({ ...e, place: '' }, ok).place, undefined, 'sin lugar → sin línea');
  const snap = structuredClone(e);
  diaryDetail(e, ok);
  assert.deepEqual(e, snap, 'formatear no muta');
}

console.log('check-diario: OK');
