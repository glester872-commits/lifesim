// Probar, comprar y revender ropa (LV-05) sin navegador: `node scripts/check-resale.ts`.
// Control positivo: si sellGarment no validase la posesión, (5) y (6) fallan («vendió lo que no es suyo», «vendió lo ya
// vendido»): ahí sigue habiendo precio apuntado. (4) no lo detecta, porque la venta ya borró su `paid`. Si resaleValue
// devolviera lo pagado, (7) falla («arbitraje»).
// GameState importa Phaser y no carga en node: (1) y (2) comprueban su regla en el fuente, como check-character, y con
// una partida real por SaveSystem. La prueba en pantalla queda para el navegador (RETAIL-LV05.md).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SAVE_KEY, SAVE_VERSION } from '../src/config/constants.ts';
import { createInitialState, inspectRaw, restore, SaveSystem } from '../src/systems/SaveSystem.ts';
import { MemoryStorage, slotSave } from '../src/systems/SaveSlots.ts';
import { buyGarment, RESALE_CAP, resaleValue, sellGarment, takeOff, wear } from '../src/systems/Retail.ts';
import { getGarment, STORES } from '../src/data/retail.ts';
import type { Wallet } from '../src/systems/Commerce.ts';

const STORE = 'vuelta';
const G = 'camisa-cuadros';
const OTHER = 'vaquero-gastado';
const PRICE = STORES.find((s) => s.id === STORE)!.stock.find((l) => l.garment === G)!.price;
const SLOT = getGarment(G).slot;
const wallet = (money: number): Wallet => ({ money, inventory: { agua: 1 }, cards: { transport: 5 } });
const source = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const stateWith = (wardrobe: string[], paid: Record<string, number>, money = 100) => ({ ...createInitialState(), money, wardrobe, paid });
const reload = (state: ReturnType<typeof stateWith>) => {
  const save = new SaveSystem(new MemoryStorage());
  assert.ok(save.save(state), 'no guarda');
  return restore(save.load());
};

// 1. Probar no cobra ni entra en la partida: la prueba sólo guarda el outfit de antes, y el snapshot escribe ése.
{
  const gs = source('../src/state/GameState.ts');
  assert.match(gs, /setFitting\(outfit: Appearance \| null\): void \{\s*this\._fitting = outfit \? \{ \.\.\.outfit \} : null;\s*\}/, 'setFitting hace algo más que recordar el outfit');
  assert.match(gs, /this\._fitting \? \{ \.\.\.this\._appearance, player: this\._fitting \} : this\._appearance/, 'el snapshot guarda la prueba');
  const outfit = { bottom: OTHER };
  assert.deepEqual(wear(outfit, G), { bottom: OTHER, [SLOT]: G });
  assert.deepEqual(outfit, { bottom: OTHER }, 'probar modificó el outfit de antes');
  // Cerrar el menú por cualquier vía acaba la prueba; rehacerlo (PROBAR) no pasa por close().
  assert.match(source('../src/ui/Menu.ts'), /'is-peek'\);\s*this\.onClosed\?\.\(\);/, 'Menu.close no avisa');
  assert.match(source('../src/scenes/Menus.ts'), /menu\.onClosed = \(\) => this\.endFitting\(\)/, 'cerrar el menú no restaura la prueba');
}

// 2. Una prueba que llegara a un archivo no sobrevive a recargar: lo puesto sale del armario.
{
  const mem = new MemoryStorage();
  const save = new SaveSystem(mem);
  assert.ok(save.save({ ...stateWith([], {}), appearance: { player: { [SLOT]: G } } }));
  const info = inspectRaw(mem.read(SAVE_KEY));
  assert.equal(info.status, 'ok');
  assert.equal(restore(save.load()).appearance.player?.[SLOT], undefined, 'la prenda de prueba sigue puesta al recargar');
}

// 3. Comprar cobra una vez, también repitiendo la llamada o tras recargar; lo pagado queda apuntado.
{
  const w = wallet(100);
  const first = buyGarment(w, [], {}, STORE, G);
  assert.ok(first.ok);
  assert.equal(first.paid, PRICE);
  assert.equal(first.wallet.money, 100 - PRICE);
  assert.equal(w.money, 100, 'buyGarment mutó la cartera');
  const again = buyGarment(first.wallet, first.wardrobe, first.appearance, STORE, G);
  assert.equal(again.ok, false, 'cobró dos veces');
  assert.equal(again.wallet, first.wallet);
  assert.equal(again.paid, 0);
  const back = reload(stateWith([...first.wardrobe], { [G]: first.paid }, first.wallet.money));
  assert.equal(back.money, first.wallet.money);
  assert.deepEqual(back.paid, { [G]: PRICE });
  assert.equal(buyGarment({ ...wallet(0), money: back.money }, back.wardrobe, {}, STORE, G).ok, false, 'tras recargar se puede comprar otra vez');
}

// 4. Vender cobra una vez; la segunda llamada se rechaza sin tocar nada.
{
  const w = wallet(10);
  const paid = { [G]: PRICE };
  const sold = sellGarment(w, [G, OTHER], {}, paid, STORE, G);
  assert.ok(sold.ok);
  assert.equal(sold.amount, resaleValue(PRICE));
  assert.equal(sold.wallet.money, Math.round((10 + sold.amount) * 100) / 100);
  assert.deepEqual(sold.wardrobe, [OTHER]);
  assert.deepEqual(sold.paid, {});
  assert.deepEqual(sold.wallet.inventory, w.inventory);
  assert.notEqual(sold.wallet.inventory, w.inventory, 'no copia la bolsa');
  assert.deepEqual(paid, { [G]: PRICE }, 'sellGarment mutó lo pagado');
  const again = sellGarment(sold.wallet, sold.wardrobe, sold.appearance, sold.paid, STORE, G);
  assert.equal(again.ok, false, 'vendió dos veces');
  assert.equal(again.wallet, sold.wallet);
  assert.equal(again.amount, 0);
}

// 5. Lo que no es tuyo no se vende, aunque haya un precio apuntado.
{
  const w = wallet(10);
  const r = sellGarment(w, [OTHER], {}, { [G]: PRICE }, STORE, G);
  assert.equal(r.ok, false, 'vendió lo que no es suyo');
  assert.equal(r.message, 'Eso no es tuyo.');
  assert.equal(r.wallet, w);
}

// 6. Ya vendida: rechazo. Si se recompra, vale el precio nuevo.
{
  const sold = sellGarment(wallet(10), [G], {}, { [G]: PRICE }, STORE, G);
  const r = sellGarment(sold.wallet, sold.wardrobe, sold.appearance, { [G]: PRICE }, STORE, G);
  assert.equal(r.ok, false, 'vendió lo ya vendido');
  assert.equal(r.message, 'Eso no es tuyo.');
  const rebought = buyGarment(sold.wallet, sold.wardrobe, sold.appearance, STORE, G);
  assert.ok(rebought.ok);
  assert.equal(rebought.paid, PRICE);
}

// 7. Sin arbitraje: se recupera siempre menos de lo pagado; sin registro, nada; sólo Segunda Vuelta compra.
{
  assert.deepEqual(STORES.filter((s) => s.buysBack).map((s) => s.id), [STORE]);
  for (const store of STORES) {
    for (const line of store.stock) {
      const value = resaleValue(line.price);
      assert.ok(value < line.price, `arbitraje: ${store.id}/${line.garment}`);
      assert.ok(value <= RESALE_CAP, `${store.id}/${line.garment} pasa del tope`);
      const bought = buyGarment(wallet(1000), [], {}, store.id, line.garment);
      assert.ok(bought.ok, `${store.id}/${line.garment} no se compra`);
      const sold = sellGarment(bought.wallet, bought.wardrobe, bought.appearance, { [line.garment]: bought.paid }, STORE, line.garment);
      assert.ok(sold.ok, `${store.id}/${line.garment} no se vende`);
      assert.ok(sold.wallet.money < 1000, `arbitraje al comprar y vender ${store.id}/${line.garment}`);
    }
  }
  for (const p of [3.5, 7.99, 0.02, 0.03, 99.99, 100, 1000]) {
    assert.ok(resaleValue(p) < p, `arbitraje a ${p}`);
    const sold = sellGarment(wallet(100 - p), [G], {}, { [G]: p }, STORE, G);
    assert.ok(sold.wallet.money < 100 || !sold.ok, `comprar y vender a ${p} deja dinero`);
  }
  assert.equal(resaleValue(1000), RESALE_CAP);
  for (const p of [undefined, 0, -5, 0.01, NaN, Infinity]) assert.equal(resaleValue(p), 0, `resaleValue(${p})`);
  const none = sellGarment(wallet(10), [G], {}, {}, STORE, G);
  assert.equal(none.ok, false, 'vendió sin registro');
  assert.equal(none.message, 'Sin tique no la quieren.');
  const elsewhere = sellGarment(wallet(10), [G], {}, { [G]: PRICE }, 'hilo', G);
  assert.equal(elsewhere.ok, false, 'otra tienda compró ropa');
  assert.equal(elsewhere.message, 'Aquí no compran ropa.');
  assert.equal(sellGarment(wallet(10), [G], {}, { [G]: PRICE }, 'no-existe', G).ok, false);
}

// 8. Equipar, retirar y vender lo que llevas puesto.
{
  const worn = wear({}, G);
  assert.equal(worn[SLOT], G);
  assert.equal(takeOff(worn, SLOT)[SLOT], undefined);
  const sold = sellGarment(wallet(10), [G], worn, { [G]: PRICE }, STORE, G);
  assert.ok(sold.ok);
  assert.equal(sold.appearance[SLOT], undefined, 'sigue puesta tras venderla');
  const other = wear({}, OTHER);
  assert.deepEqual(sellGarment(wallet(10), [G, OTHER], other, { [G]: PRICE }, STORE, G).appearance, other, 'vender otra cambió lo puesto');
}

// 9. Sin dinero no se compra ni se toca nada.
{
  const w = wallet(1);
  const wardrobe: readonly string[] = [];
  const current = {};
  const r = buyGarment(w, wardrobe, current, STORE, G);
  assert.equal(r.ok, false);
  assert.equal(r.wallet, w);
  assert.equal(r.wardrobe, wardrobe);
  assert.equal(r.appearance, current);
  assert.equal(r.paid, 0);
  // Con la cartera a cero, ninguna prenda de ninguna tienda: rechazo, nada cambia y el dinero nunca baja de cero.
  const empty = wallet(0);
  for (const store of STORES) {
    for (const line of store.stock) {
      assert.ok(line.price > empty.money, `${store.id}/${line.garment} es gratis`);
      const broke = buyGarment(empty, wardrobe, current, store.id, line.garment);
      assert.equal(broke.ok, false, `${store.id}/${line.garment} se compra sin dinero`);
      assert.equal(broke.wallet, empty, `${store.id}/${line.garment} cambió la cartera`);
      assert.equal(broke.wardrobe, wardrobe, `${store.id}/${line.garment} cambió el armario`);
      assert.equal(broke.paid, 0, `${store.id}/${line.garment} apuntó un precio`);
      assert.ok(broke.wallet.money >= 0, `${store.id}/${line.garment} deja saldo negativo`);
    }
  }
  assert.equal(empty.money, 0);
}

// 10. Exportar e importar: ids y precios intactos; lo inválido se filtra; un archivo sin `paid` no revende.
{
  const file = (state: unknown): string => JSON.stringify({ version: SAVE_VERSION, savedAt: Date.UTC(2026, 9, 1), state });
  const read = (state: unknown) => {
    const info = inspectRaw(file(state));
    assert.equal(info.status, 'ok');
    return info.status === 'ok' ? info.state : createInitialState();
  };
  const good = read(stateWith([G, OTHER], { [G]: PRICE, [OTHER]: 7.99 }));
  assert.deepEqual(good.wardrobe, [G, OTHER]);
  assert.deepEqual(good.paid, { [G]: PRICE, [OTHER]: 7.99 });
  const messy = read(stateWith([G, G, 'prenda-inventada'], { [G]: 8.004, [OTHER]: 5, 'prenda-inventada': 9 }));
  assert.deepEqual(messy.wardrobe, [G], 'no deduplica o no filtra');
  assert.deepEqual(messy.paid, { [G]: 8 }, 'conserva precios de lo que no tienes');
  for (const bad of [0, -1, 100001, '8', null, 0.001]) assert.deepEqual(read({ ...stateWith([G], {}), paid: { [G]: bad } }).paid, {}, `acepta ${String(bad)}`);
  const { paid: _dropped, ...old } = stateWith([G], {});
  const legacy = read(old);
  assert.deepEqual(legacy.paid ?? {}, {});
  assert.equal('paid' in legacy, false, 'un save sin `paid` adquiere la clave al cargar');
  assert.equal(sellGarment(wallet(10), legacy.wardrobe, {}, legacy.paid ?? {}, STORE, G).ok, false, 'una partida antigua revende');
}

// 11. Guardar y cargar, por SaveSystem y por ranura, sin mezclarse.
{
  const mem = new MemoryStorage();
  assert.ok(new SaveSystem(mem).save(stateWith([G], { [G]: PRICE })));
  assert.ok(slotSave(mem, 2).save(stateWith([OTHER], { [OTHER]: 10 })));
  const main = new SaveSystem(mem).load();
  const slot = slotSave(mem, 2).load();
  assert.deepEqual(main?.wardrobe, [G]);
  assert.deepEqual(main?.paid, { [G]: PRICE });
  assert.deepEqual(slot?.wardrobe, [OTHER]);
  assert.deepEqual(slot?.paid, { [OTHER]: 10 });
}

console.log('check-resale: ok');
