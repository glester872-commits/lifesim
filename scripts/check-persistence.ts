// Persistencia de Alpha-01 y Alpha-04: `npm run check`. Guardar no pisa una partida buena con datos que no se
// cargarían; versión 1 → 2 sin pérdidas; nueva partida y continuar; importar valida antes de tocar nada y guarda
// copia; recuperar la copia sólo cuando no hay partida jugable; y barbería, tiendas, armario y tatuajes cambian lo
// suyo sin borrar piel, color de pelo, ojos ni nombre.
import assert from 'node:assert/strict';
import { SAVE_KEY, SAVE_VERSION } from '../src/config/constants.ts';
import { haircut, tattoo } from '../src/systems/Appearance.ts';
import { buyGarment, takeOff, wear } from '../src/systems/Retail.ts';
import { BASE_DRAFT, newGameState } from '../src/systems/CharacterCreator.ts';
import { DEFAULT_NAME } from '../src/systems/PlayerIdentity.ts';
import { BACKUP_KEY, createInitialState, inspectRaw, SAVE_MAX_BYTES, SaveSystem, UNREADABLE_KEY, type SaveStorage } from '../src/systems/SaveSystem.ts';
import { DESIGN_IDS, ZONE_IDS } from '../src/data/tattoos.ts';
import { STORES } from '../src/data/retail.ts';
import type { GameStateData } from '../src/types/game.ts';

function memory(full = (_k: string) => false): { store: Map<string, string>; save: SaveSystem } {
  const store = new Map<string, string>();
  const storage: SaveStorage = {
    read: (k) => store.get(k) ?? null,
    write: (k, v) => {
      if (full(k)) throw new Error('QuotaExceededError');
      store.set(k, v);
    },
    remove: (k) => void store.delete(k),
  };
  return { store, save: new SaveSystem(storage) };
}

const nerea = newGameState({ ...BASE_DRAFT, name: 'Nerea', skin: 'piel-7', hair: 'afro', hairColor: 'pelirrojo', eyes: 'verde', top: 'camiseta-raya', shoes: 'bota-cuero' });
const played: GameStateData = { ...nerea, money: 432.1, day: 9, hour: 17, minute: 40 };
const file = (state: unknown, version: unknown = SAVE_VERSION): string => JSON.stringify({ version, savedAt: 1, state });

// 1 · Guardar no pisa lo bueno con algo que no se cargaría (NaN → null en JSON, referencia circular).
{
  const { store, save } = memory();
  assert.ok(save.save(played));
  const good = store.get(SAVE_KEY);
  assert.equal(save.save({ ...played, money: Number.NaN }), false, 'guarda dinero NaN');
  const loop: Record<string, unknown> = { ...played };
  loop.self = loop;
  assert.equal(save.save(loop as unknown as GameStateData), false, 'guarda una referencia circular');
  assert.equal(store.get(SAVE_KEY), good, 'la partida buena se ha tocado');
  // Lo guardado es JSON plano: ni funciones ni objetos de Phaser (todo vuelve igual al reparsear).
  const parsed = JSON.parse(good!);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), parsed);
}

// 2 · Versión 1 → 2: aparece la identidad por defecto; nada de lo de antes cambia ni se pierde.
{
  const old: Record<string, unknown> = { ...createInitialState(), money: 55.5, day: 30, wardrobe: ['camiseta-basica'], appearance: { player: { hair: 'bob', top: 'camiseta-basica' } } };
  delete old.identity;
  for (const raw of [file(old, 1), JSON.stringify({ state: old })]) {
    const info = inspectRaw(raw);
    assert.equal(info.status, 'ok');
    if (info.status !== 'ok') throw new Error();
    assert.equal(info.state.identity!.name, DEFAULT_NAME);
    assert.equal(info.state.money, 55.5);
    assert.deepEqual(info.state.appearance, { player: { hair: 'bob', top: 'camiseta-basica' } });
    assert.deepEqual(info.state.wardrobe, ['camiseta-basica']);
  }
}

// 3 · Nueva partida tras otra y continuar: la anterior queda en la copia, la nueva es la que se carga.
{
  const { store, save } = memory();
  save.save(played);
  const before = store.get(SAVE_KEY);
  assert.ok(save.startNew());
  assert.ok(save.save(newGameState(BASE_DRAFT)));
  assert.equal(store.get(BACKUP_KEY), before);
  const now = save.load()!;
  assert.equal(now.identity!.name, DEFAULT_NAME);
  assert.equal(now.money, createInitialState().money);
  assert.deepEqual(now.wardrobe, []);
  assert.deepEqual(now.social, {});
  // Continuar = cargar lo mismo que enseña la pantalla de inicio, sin pasar por el creador.
  const info = save.inspect();
  assert.equal(info.status, 'ok');
  if (info.status === 'ok') assert.deepEqual(save.load(), info.state);
}

// 4 · Importar: archivos que no valen no tocan nada, con el motivo justo.
{
  const { store, save } = memory();
  save.save(played);
  const before = store.get(SAVE_KEY);
  for (const [label, raw, reason] of [
    ['JSON roto', '{"state": {', 'corrupt'],
    ['otra cosa', JSON.stringify({ hola: 'mundo' }), 'foreign'],
    ['una lista', '[1,2,3]', 'foreign'],
    ['sin dinero', file({ locationId: 'home' }), 'corrupt'],
    ['de una versión futura', file(played, SAVE_VERSION + 1), 'newer'],
    ['demasiado grande', `{"state":{},"x":"${'a'.repeat(SAVE_MAX_BYTES)}"}`, 'corrupt'],
  ] as const) {
    const info = inspectRaw(raw);
    assert.equal(info.status, 'unreadable', label);
    if (info.status === 'unreadable') assert.equal(info.reason, reason, label);
    assert.equal(save.adopt(raw), false, `${label}: se ha importado`);
    assert.equal(store.get(SAVE_KEY), before, `${label}: ha tocado la partida`);
  }
  assert.equal(inspectRaw('').status, 'none');
}

// 4b · Fecha de guardado imposible (0, 1, el año 3000, texto): la partida vale, pero sin fecha que enseñar.
{
  for (const savedAt of [0, 1, -5, 32503680000000, '2026-10-27', null]) {
    const info = inspectRaw(JSON.stringify({ version: SAVE_VERSION, savedAt, state: played }));
    assert.equal(info.status, 'ok', `savedAt ${String(savedAt)}`);
    if (info.status === 'ok') assert.equal(info.savedAt, null, `savedAt ${String(savedAt)} se enseña`);
  }
  const now = Date.now();
  const real = inspectRaw(JSON.stringify({ version: SAVE_VERSION, savedAt: now, state: played }));
  assert.ok(real.status === 'ok' && real.savedAt === now, 'una fecha de verdad se pierde');
}

// 5 · Importar una válida (exportada de otra partida, también de la versión 1): copia la de antes y la sustituye.
{
  const { store, save } = memory();
  save.save(played);
  const mine = store.get(SAVE_KEY);
  const other = file({ ...createInitialState(), money: 9.99, day: 3 }, 1);
  assert.ok(save.adopt(other));
  assert.equal(store.get(SAVE_KEY), other);
  assert.equal(store.get(BACKUP_KEY), mine);
  assert.equal(save.load()!.money, 9.99);
}

// 6 · Importar sin sitio para la copia: no se toca nada hasta que se confirma sin copia.
{
  const { store, save } = memory((k) => k === BACKUP_KEY);
  save.save(played);
  const mine = store.get(SAVE_KEY);
  const other = file(createInitialState());
  assert.equal(save.adopt(other), false);
  assert.equal(store.get(SAVE_KEY), mine);
  assert.ok(save.adopt(other, true));
  assert.equal(store.get(SAVE_KEY), other);
}

// 7 · Recuperar la copia: sólo sin partida jugable; la rota se aparta, no se borra; la copia sigue.
{
  const { store, save } = memory();
  save.save(played);
  save.startNew();
  const backup = store.get(BACKUP_KEY)!;
  store.set(SAVE_KEY, '{"roto":');
  assert.ok(save.restoreBackup());
  assert.equal(store.get(SAVE_KEY), backup);
  assert.equal(store.get(UNREADABLE_KEY), '{"roto":');
  assert.equal(store.get(BACKUP_KEY), backup);
  // Con una partida que se juega, no: nunca encima de algo bueno.
  assert.equal(save.restoreBackup(), false);
  // Sin partida también vale; con la copia rota, no.
  store.delete(SAVE_KEY);
  assert.ok(save.restoreBackup());
  store.delete(SAVE_KEY);
  store.set(BACKUP_KEY, 'basura');
  assert.equal(save.restoreBackup(), false);
  assert.equal(store.has(SAVE_KEY), false);
}

// 8 · Barbería, tiendas, armario y tatuajes cambian lo suyo y nada más; y sobrevive a guardar y cargar.
{
  const start = nerea.appearance.player!;
  const wallet = { money: 500, inventory: {}, cards: {} };
  const cut = haircut(wallet, start, start.hair!, 'bob');
  assert.ok(cut.ok, cut.message);
  const store = STORES.find((s) => s.stock.some((l) => l.garment === 'vaquero-gastado'))!;
  const bought = buyGarment(cut.wallet, nerea.wardrobe, cut.appearance, store.id, 'vaquero-gastado');
  assert.ok(bought.ok, bought.message);
  // La ropa del creador ya es tuya: no se vende otra igual (ni duplicados en el armario).
  const seller = STORES.find((s) => s.stock.some((l) => l.garment === 'camiseta-raya'));
  if (seller) assert.equal(buyGarment(bought.wallet, bought.wardrobe, bought.appearance, seller.id, 'camiseta-raya').ok, false);
  assert.equal(new Set(bought.wardrobe).size, bought.wardrobe.length, 'prenda repetida en el armario');
  const inked = tattoo(bought.wallet, bought.appearance, [...ZONE_IDS][0] as never, [...DESIGN_IDS][0]);
  const final = takeOff(wear(inked.ok ? inked.appearance : bought.appearance, 'camiseta-raya'), 'shoes');
  for (const key of ['skin', 'hairColor', 'eyes'] as const) assert.equal(final[key], start[key], `${key} se ha perdido`);
  assert.equal(final.hair, 'bob');
  assert.equal(final.bottom, 'vaquero-gastado');
  assert.equal(final.shoes, undefined);
  const { save } = memory();
  assert.ok(save.save({ ...nerea, appearance: { player: final }, wardrobe: bought.wardrobe }));
  const back = save.load()!;
  assert.deepEqual(back.appearance.player, final);
  assert.equal(back.identity!.name, 'Nerea');
}

console.log('check-persistence: OK (no pisa con datos rotos, v1→v2, nueva/continuar, importar válido/roto/sin sitio, recuperar copia, barbería/tiendas/armario/tatuajes)');
