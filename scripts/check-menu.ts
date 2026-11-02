// El menú real con un DOM mínimo y reloj controlado: `npm run check`.
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { PICK_LOCK_MS } from '../src/config/constants.ts';
import { Menu } from '../src/ui/Menu.ts';

class Element {
  innerHTML = '';
  textContent = '';
  className = '';
  children: Element[] = [];
  classList = { add() {}, remove() {}, toggle() {} };
  listeners = new Map<string, () => void>();
  parts = new Map<string, Element>();
  querySelector(selector: string): Element {
    if (!this.parts.has(selector)) this.parts.set(selector, new Element());
    return this.parts.get(selector)!;
  }
  replaceChildren(...children: Element[]): void { this.children = children; }
  append(...children: Element[]): void { this.children.push(...children); }
  addEventListener(event: string, listener: () => void): void { this.listeners.set(event, listener); }
  scrollIntoView(): void {}
  click(): void { this.listeners.get('click')?.(); }
}

let now = 0;
mock.method(performance, 'now', () => now);
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => new Element() } });

try {
  // PROBAR → COMPRAR conserva el título, pero cambia la identidad de la pantalla.
  // Tanto E/número (confirm) como el toque DOM deben esperar antes de cobrar.
  for (const touch of [false, true]) {
    const root = new Element();
    const menu = new Menu(root as unknown as HTMLElement);
    let money = 100;
    const pick = (): void => {
      if (touch) root.querySelector('.menu__list').children[0].click();
      else menu.confirm(0);
    };
    menu.open('Camiseta · €20', '', [{ label: 'PROBAR' }], () => {
      menu.open('Camiseta · €20', '', [{ label: 'COMPRAR' }], () => { money -= 20; }, undefined, '', 0, false, 'garment:fitting');
    });
    now += PICK_LOCK_MS;
    pick();
    now += 80;
    pick();
    assert.equal(money, 100, `${touch ? 'toque' : 'teclado'}: PROBAR compra sin confirmar`);
    now += PICK_LOCK_MS - 80;
    pick();
    assert.equal(money, 80, 'la compra deliberada sigue bloqueada');

    // Salir del probador también cambia de pantalla, aunque vuelva el mismo título.
    let tried = false;
    menu.open('Camiseta · €20', '', [{ label: 'PROBAR' }], () => { tried = true; });
    pick();
    assert.equal(tried, false, 'volver del probador permite una elección inmediata');
    now += PICK_LOCK_MS;
    pick();
    assert.equal(tried, true);
  }

  // Cantidades, saldo, notas y callbacks nuevos no son transiciones de pantalla.
  const root = new Element();
  const menu = new Menu(root as unknown as HTMLElement);
  let qty = 1;
  const openQty = (): void => menu.open('Producto', `Llevas ${qty}`, [
    { label: 'Más', detail: `cantidad ${qty}` }, { label: `Pagar ${qty} · €${qty * 2}` },
  ], () => { qty++; openQty(); }, undefined, `Cantidad ${qty}`);
  openQty();
  menu.confirm();
  assert.equal(qty, 1, 'la primera apertura no bloquea');
  now += PICK_LOCK_MS;
  for (let i = 0; i < 3; i++) { menu.confirm(); now += 80; }
  assert.equal(qty, 4, 'cambiar la cantidad reinicia el bloqueo');

  menu.close();
  openQty();
  menu.confirm();
  assert.equal(qty, 4, 'reabrir la misma pantalla no bloquea');
  now += PICK_LOCK_MS;
  menu.confirm();
  assert.equal(qty, 5);
  console.log('menú: PROBAR no compra con doble toque/E · compra deliberada · volver · cantidades · reapertura OK');
} finally {
  mock.restoreAll();
  if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
  else Reflect.deleteProperty(globalThis, 'document');
}
