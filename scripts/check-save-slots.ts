// Ranuras de partida (LV-02, systems/SaveSlots) sin navegador: `node scripts/check-save-slots.ts`.
// Control positivo: si slotKey devolviera la misma clave para todas las ranuras, (2) falla («la ranura 1 cambió al
// guardar la 2»); si viewSlot se fiara de un resumen con otra suma, (3) falla; si save() pisara con cuota llena, (6) falla.
import assert from 'node:assert/strict';
import { SAVE_KEY } from '../src/config/constants.ts';
import { createInitialState, inspectRaw, restore, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import { activeSlot, checksum, MemoryStorage, setActiveSlot, slotKey, slotSave, storageWorks, viewSlot } from '../src/systems/SaveSlots.ts';

const named = (name: string, money: number) => {
  const s = createInitialState();
  return { ...s, money, identity: { ...(s.identity ?? { name }), name } };
};

// 1. La partida de antes (clave de siempre, versión vieja) ES la ranura 1: se lee igual que sin ranuras y no se toca.
{
  const mem = new MemoryStorage();
  const legacy = JSON.stringify({ version: 2, savedAt: Date.UTC(2026, 9, 1), state: named('Vieja', 321) });
  mem.write(SAVE_KEY, legacy);
  const direct = new SaveSystem(mem).load();
  const viaSlot = slotSave(mem, 1).load();
  assert.ok(direct && viaSlot, 'la partida heredada no carga');
  assert.equal(JSON.stringify(restore(viaSlot)), JSON.stringify(restore(direct)), 'la ranura 1 no lee la partida heredada tal cual');
  assert.equal(mem.read(SAVE_KEY), legacy, 'abrir la ranura 1 reescribió la partida heredada');
  assert.equal(viewSlot(mem, 1).summary?.name, 'Vieja');
  assert.equal(viewSlot(mem, 2).status, 'vacia');
}

// 2. Tres ranuras independientes: guardar en una no cambia las otras; cada una carga lo suyo.
{
  const mem = new MemoryStorage();
  const names = { 1: 'Ana', 2: 'Bea', 3: 'Carla' } as const;
  for (const id of [1, 2, 3] as const) assert.ok(slotSave(mem, id).save(named(names[id], id * 100)), `no guarda la ranura ${id}`);
  const before = [1, 2, 3].map((id) => mem.read(slotKey(id as 1 | 2 | 3, SAVE_KEY)));
  assert.ok(slotSave(mem, 2).save(named('Bea', 999)));
  assert.equal(mem.read(slotKey(1, SAVE_KEY)), before[0], 'la ranura 1 cambió al guardar la 2');
  assert.equal(mem.read(slotKey(3, SAVE_KEY)), before[2], 'la ranura 3 cambió al guardar la 2');
  for (const id of [1, 2, 3] as const) {
    const s = slotSave(mem, id).load();
    assert.equal(s?.identity?.name, names[id], `la ranura ${id} carga otra partida`);
    assert.equal(s?.money, id === 2 ? 999 : id * 100);
  }
  assert.equal(new Set([1, 2, 3].map((id) => slotKey(id as 1 | 2 | 3, SAVE_KEY))).size, 3);
}

// 3. Resumen: la lista se fía sólo si la suma coincide; si no, lo rehace; una ranura dañada no toca a las otras.
{
  const mem = new MemoryStorage();
  slotSave(mem, 1).save(named('Uno', 10));
  slotSave(mem, 2).save(named('Dos', 20));
  const metaKey = `${slotKey(2, SAVE_KEY)}.meta`;
  const meta = JSON.parse(mem.read(metaKey)!);
  assert.equal(meta.checksum, checksum(mem.read(slotKey(2, SAVE_KEY))!));
  mem.write(metaKey, JSON.stringify({ ...meta, name: 'Mentira', checksum: '00000000' }));
  assert.equal(viewSlot(mem, 2).summary?.name, 'Dos', 'la lista se fió de un resumen con otra suma');
  mem.write(slotKey(2, SAVE_KEY), '{"version":3,"state":{"money":'); // cortado a mitad
  assert.equal(viewSlot(mem, 2).status, 'danada');
  assert.equal(viewSlot(mem, 1).status, 'guardada', 'una ranura dañada afectó a otra');
  assert.equal(slotSave(mem, 1).load()?.money, 10);
}

// 4. Copia de seguridad por ranura: «Nueva partida» en la 2 copia la 2; si luego se daña, se recupera la copia.
{
  const mem = new MemoryStorage();
  slotSave(mem, 1).save(named('Uno', 1));
  const two = slotSave(mem, 2);
  two.save(named('Antes', 50));
  assert.ok(two.startNew());
  mem.write(slotKey(2, SAVE_KEY), 'no es json');
  assert.equal(two.inspectBackup().status, 'ok');
  assert.ok(two.restoreBackup(), 'no recupera la copia de la ranura 2');
  assert.equal(two.load()?.identity?.name, 'Antes');
  assert.equal(mem.read(`${slotKey(2, SAVE_KEY)}.unreadable`), 'no es json', 'la dañada no quedó apartada');
  assert.equal(slotSave(mem, 1).load()?.identity?.name, 'Uno', 'recuperar la 2 tocó la 1');
  assert.equal(mem.read(`${SAVE_KEY}.backup`), null, 'la copia de la 2 fue a la de la 1');
}

// 5. Importar un archivo dañado: se rechaza sin tocar nada.
{
  const mem = new MemoryStorage();
  slotSave(mem, 3).save(named('Tres', 3));
  const before = new Map(mem.data);
  for (const bad of ['', '{', '{"state":1}', JSON.stringify({ version: 99, state: createInitialState() }), JSON.stringify({ version: 3, state: { money: 'mucho' } })]) {
    assert.notEqual(inspectRaw(bad).status, 'ok', `aceptó: ${bad.slice(0, 30)}`);
    assert.equal(slotSave(mem, 3).adopt(bad), false);
  }
  assert.deepEqual(new Map(mem.data), before, 'un import dañado tocó el almacenamiento');
}

// 6. Cuota llena: guardar devuelve false y la partida buena sigue intacta.
{
  const mem = new MemoryStorage();
  slotSave(mem, 2).save(named('Buena', 70));
  const good = mem.read(slotKey(2, SAVE_KEY));
  const full: SaveStorage = { read: (k) => mem.read(k), write: () => { throw new DOMException('lleno', 'QuotaExceededError'); }, remove: (k) => mem.remove(k) };
  assert.equal(slotSave(full, 2).save(named('Nueva', 1)), false, 'con cuota llena dijo que guardó');
  assert.equal(mem.read(slotKey(2, SAVE_KEY)), good, 'con cuota llena se pisó la partida');
  // 7. Sin almacenamiento: se detecta (gameStorage pasa a memoria y la pantalla de inicio lo avisa).
  assert.equal(storageWorks(full), false);
  assert.equal(storageWorks(new MemoryStorage()), true);
}

// 8. La ranura activa se recuerda; un valor raro vuelve a la 1.
{
  const mem = new MemoryStorage();
  assert.equal(activeSlot(mem), 1);
  setActiveSlot(mem, 3);
  assert.equal(activeSlot(mem), 3);
  mem.write('lifesim.activeSlot', '7');
  assert.equal(activeSlot(mem), 1);
}

console.log('check-save-slots: OK — ranura 1 = partida de siempre (sin reescribir), 3 ranuras independientes, resumen con suma, copia y recuperación por ranura, import dañado rechazado, cuota llena sin pisar, sin almacenamiento detectado, ranura activa recordada');
