// UXN-01 · Preferencias de confort (src/config/comfort.ts) con un almacenamiento falso: `node scripts/check-comfort.ts`.
import assert from 'node:assert/strict';
import { COMFORT_KEY, DEFAULT_COMFORT, comfortNow, loadComfort, messageMs, parseComfort, saveComfort, setConfirmed, applyComfort, type Comfort } from '../src/config/comfort.ts';

let checks = 0;
const eq = (actual: unknown, expected: unknown, what: string): void => {
  assert.deepEqual(actual, expected, what);
  checks++;
};

/** Storage de mentira sobre un Map; `failGet`/`failSet` simulan un navegador que bloquea o está lleno. */
class FakeStorage {
  readonly data = new Map<string, string>();
  writes: string[] = [];
  failGet = false;
  failSet = false;
  getItem(key: string): string | null {
    if (this.failGet) throw new Error('SecurityError');
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failSet) throw new Error('QuotaExceededError');
    this.writes.push(key);
    this.data.set(key, value);
  }
}

const seeded = (): FakeStorage => {
  const s = new FakeStorage();
  s.data.set('lifesim.audio', 'medium');
  s.data.set('lifesim.quality', 'high');
  s.data.set('lifesim.zoom', '3');
  return s;
};

const LARGE: Comfort = { text: 'large', contrast: 'high', messages: 'long', hints: 'hidden', flashes: 'reduced' };
const DEF = { ...DEFAULT_COMFORT };

// 1 · Lecturas: válido, ausente, roto, otra forma, otra versión.
eq(parseComfort(JSON.stringify({ v: 1, ...LARGE })), LARGE, 'válido completo');
eq(parseComfort(null), DEF, 'null → predeterminados');
eq(parseComfort('{'), DEF, 'JSON roto → predeterminados');
eq(parseComfort('[]'), DEF, 'array → predeterminados');
eq(parseComfort('"large"'), DEF, 'cadena → predeterminados');
eq(parseComfort('null'), DEF, 'null JSON → predeterminados');
eq(parseComfort('{"v":99}'), DEF, 'v=99 → predeterminados');
eq(parseComfort(JSON.stringify({ ...LARGE })), DEF, 'sin v → predeterminados');
eq(parseComfort(JSON.stringify({ v: '1', ...LARGE })), DEF, 'v como texto → predeterminados');

// 2 · Campo a campo: el inválido vuelve a su predeterminado, los válidos se conservan.
eq(parseComfort(JSON.stringify({ v: 1, text: 'huge' })), DEF, 'text fuera de rango');
eq(
  parseComfort(JSON.stringify({ v: 1, text: 'large', contrast: 'max', messages: 'long', hints: 7, flashes: 'reduced', extra: 'x' })),
  { text: 'large', contrast: 'normal', messages: 'long', hints: 'visible', flashes: 'reduced' },
  'mezclados: válidos se conservan',
);

// 3 · Guardar: sólo COMFORT_KEY, con versión; las otras claves del navegador intactas; se relee igual.
{
  const s = seeded();
  eq(saveComfort(LARGE, s), true, 'guardar devuelve true');
  eq(s.writes, [COMFORT_KEY], 'sólo se escribe lifesim.comfort');
  eq(JSON.parse(s.data.get(COMFORT_KEY)!), { v: 1, ...LARGE }, 'formato v1');
  eq([s.data.get('lifesim.audio'), s.data.get('lifesim.quality'), s.data.get('lifesim.zoom')], ['medium', 'high', '3'], 'otras claves intactas');
  eq(loadComfort(s), LARGE, 'ida y vuelta');
}

// 4 · Navegador que no deja: guardar dice false y no escribe; leer da predeterminados.
{
  const s = seeded();
  s.failSet = true;
  eq(saveComfort(LARGE, s), false, 'setItem que lanza → false');
  eq(s.data.has(COMFORT_KEY), false, 'nada escrito si falla');
  s.failGet = true;
  eq(loadComfort(s), DEF, 'getItem que lanza → predeterminados');
  eq(saveComfort(LARGE, null), false, 'sin almacenamiento → false');
  eq(loadComfort(null), DEF, 'sin almacenamiento → predeterminados');
}

// 5 · Aplicar al documento: los cinco atributos que lee style.css.
{
  const root = { dataset: {} as Record<string, string> };
  applyComfort(LARGE, root as unknown as Pick<HTMLElement, 'dataset'>);
  eq(root.dataset, { comfortText: 'large', comfortContrast: 'high', comfortMessages: 'long', comfortHints: 'hidden', comfortFlashes: 'reduced' }, 'dataset');
}

// 6 · Lo confirmado y la duración de mensajes (en node no hay window: arranca en predeterminados).
eq(comfortNow(), DEF, 'sin confirmar en node → predeterminados');
eq(messageMs(5000), 5000, 'normal: 5000');
setConfirmed(LARGE);
eq(messageMs(5000), 10000, 'larga: 10000');
eq(messageMs(6000), 12000, 'larga: 12000');
setConfirmed(DEF);
eq(messageMs(5000), 5000, 'de vuelta a normal');
eq(DEFAULT_COMFORT, DEF, 'DEFAULT_COMFORT no se ha mutado');

assert.ok(checks >= 25, `sólo ${checks} comprobaciones`);
console.log(`check-comfort: OK (${checks} comprobaciones: lectura, campo a campo, guardado aislado, almacenamiento bloqueado, dataset, duración)`);
