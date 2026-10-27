// Pantalla de inicio y contrato de guardado (Alpha-01): `npm run check`. Lo que la pantalla de inicio enseña
// (SaveSystem.inspect) no escribe nada; Continuar sólo con una partida que arranca; una partida rota o de una
// versión más nueva no se borra ni se pisa; Nueva partida copia antes de quitar y no quita nada si la copia no
// cabe; con el almacenamiento lleno, guardar dice false. Y el arranque pasa por la pantalla de inicio.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SAVE_KEY, SAVE_VERSION } from '../src/config/constants.ts';
import { BACKUP_KEY, createInitialState, SaveSystem, UNREADABLE_KEY, type SaveStorage } from '../src/systems/SaveSystem.ts';

function memory(full = (_key: string) => false): { store: Map<string, string>; storage: SaveStorage; writes: string[] } {
  const store = new Map<string, string>();
  const writes: string[] = [];
  const storage: SaveStorage = {
    read: (k) => store.get(k) ?? null,
    write: (k, v) => {
      if (full(k)) throw new Error('QuotaExceededError');
      writes.push(k);
      store.set(k, v);
    },
    remove: (k) => void store.delete(k),
  };
  return { store, storage, writes };
}

const played = { ...createInitialState(), money: 345.5, day: 12, hour: 19, minute: 5 };

// 1 · Sin partida: nada que continuar, nada escrito; Nueva partida no tiene nada que copiar.
{
  const m = memory();
  const save = new SaveSystem(m.storage);
  assert.deepEqual(save.inspect(), { status: 'none' });
  assert.equal(save.startNew(), true);
  assert.deepEqual(m.writes, [], 'sin partida no se escribe nada');
}

// 2 · Partida válida: se puede continuar, con su día y su dinero; mirar no escribe; cargar devuelve lo mismo.
{
  const m = memory();
  const save = new SaveSystem(m.storage);
  assert.equal(save.save(played), true);
  m.writes.length = 0;
  const info = save.inspect();
  assert.equal(info.status, 'ok');
  if (info.status !== 'ok') throw new Error();
  assert.equal(info.state.money, 345.5);
  assert.equal(info.state.day, 12);
  assert.ok(info.savedAt !== null);
  assert.deepEqual(m.writes, [], 'inspect no escribe');
  assert.deepEqual(save.load(), info.state);
  assert.deepEqual(m.writes, [], 'cargar una partida válida no escribe');
}

// 3 · Rota, sin estado y de una versión más nueva: no se puede continuar, no se borra, se aparta al cargar.
for (const [label, raw, reason] of [
  ['JSON roto', '{"version":1,"state":{', 'corrupt'],
  ['sin dinero ni reloj', JSON.stringify({ version: 1, state: { locationId: 'home' } }), 'corrupt'],
  ['versión más nueva', JSON.stringify({ version: SAVE_VERSION + 1, savedAt: 1, state: played }), 'newer'],
] as const) {
  const m = memory();
  m.store.set(SAVE_KEY, raw);
  const save = new SaveSystem(m.storage);
  const info = save.inspect();
  assert.equal(info.status, 'unreadable', label);
  if (info.status !== 'unreadable') throw new Error();
  assert.equal(info.reason, reason, label);
  assert.equal(info.raw, raw, `${label}: se ofrece tal cual para descargar`);
  assert.equal(m.store.get(SAVE_KEY), raw, `${label}: mirar no la borra`);
  assert.equal(save.load(), null, label);
  assert.equal(m.store.get(UNREADABLE_KEY), raw, `${label}: se aparta antes del autoguardado`);
}

// 4 · Sin sitio para apartar una partida rota: cargar no revienta (antes lanzaba y el juego no arrancaba).
{
  const m = memory((k) => k === UNREADABLE_KEY);
  m.store.set(SAVE_KEY, 'basura');
  assert.equal(new SaveSystem(m.storage).load(), null);
}

// 5 · Nueva partida con progreso: copia lo anterior y lo quita; la siguiente carga empieza de cero.
{
  const m = memory();
  const save = new SaveSystem(m.storage);
  save.save(played);
  const raw = m.store.get(SAVE_KEY)!;
  assert.equal(save.startNew(), true);
  assert.equal(m.store.get(BACKUP_KEY), raw, 'la partida anterior queda copiada');
  assert.equal(m.store.has(SAVE_KEY), false);
  assert.deepEqual(save.inspect(), { status: 'none' });
  // Ajustes y otras claves del navegador no se tocan.
  m.store.set('lifesim.audio', 'high');
  save.save(played);
  save.startNew();
  assert.equal(m.store.get('lifesim.audio'), 'high');
}

// 6 · Sin sitio para la copia: no se quita nada salvo que el jugador confirme empezar sin copia.
{
  const m = memory((k) => k === BACKUP_KEY);
  m.store.set(SAVE_KEY, JSON.stringify({ version: 1, savedAt: 1, state: played }));
  const save = new SaveSystem(m.storage);
  assert.equal(save.startNew(), false);
  assert.ok(m.store.has(SAVE_KEY), 'sin copia, la partida sigue');
  assert.equal(save.startNew(true), true);
  assert.equal(m.store.has(SAVE_KEY), false);
}

// 7 · Almacenamiento lleno: guardar dice false y lo anterior sigue intacto.
{
  let full = false;
  const m = memory(() => full);
  const save = new SaveSystem(m.storage);
  assert.equal(save.save(played), true);
  const before = m.store.get(SAVE_KEY);
  full = true;
  assert.equal(save.save({ ...played, money: 1 }), false);
  assert.equal(m.store.get(SAVE_KEY), before);
}

// 8 · Una partida de antes de este cambio (sin savedAt, sin versión) se sigue pudiendo continuar.
{
  const m = memory();
  m.store.set(SAVE_KEY, JSON.stringify({ state: played }));
  const info = new SaveSystem(m.storage).inspect();
  assert.equal(info.status, 'ok');
  if (info.status === 'ok') assert.equal(info.savedAt, null);
}

// 9 · El arranque pasa por la pantalla de inicio, y la pausa tiene su nodo y su botón.
{
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<script type="module" src="\/src\/title\.ts">/, 'index.html arranca por title.ts');
  assert.doesNotMatch(html, /src="\/src\/main\.ts"/, 'main.ts ya no arranca solo');
  for (const id of ['title', 'pause', 'pause-button']) assert.match(html, new RegExp(`id="${id}"`), `falta #${id}`);
  const title = readFileSync(new URL('../src/title.ts', import.meta.url), 'utf8');
  // Continuar sólo se habilita con una partida que arranca.
  assert.match(title, /button\('continue', 'Continuar', info\.status === 'ok' \? '' : 'disabled/);
}

console.log('check-title-save: OK (inicio sin partida, continuar, rota/nueva versión, lleno, nueva partida con copia)');
