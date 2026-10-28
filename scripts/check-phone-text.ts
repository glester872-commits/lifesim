// Texto libre en el móvil (Alpha-05): `npm run check`. Unicode y emoji intactos; pegar con saltos o caracteres de
// control no rompe nada; vacío no se manda; lo largo se corta sin partir un emoji; el HTML se guarda como texto;
// el doble envío (mismo id) no duplica; quien lo recibe contesta una vez al día que no entiende frases; notas que se
// crean, cambian, borran y vuelven iguales al guardar; y una partida antigua sin notas carga igual que estaba.
import assert from 'node:assert/strict';
import { cleanText, createPhone, deleteNote, FREE_DAILY_LIMIT, FREE_REPLY, MESSAGE_MAX, NOTE_BODY_MAX, parsePhone, saveNote, sendFree } from '../src/systems/Phone.ts';
import { createInitialState, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';

const AT = 3 * 1440 + 600;
const msgs = (p: ReturnType<typeof createPhone>, npc = 'sara') => p.threads[npc]?.messages ?? [];

// 1 · Unicode y emoji, tal cual.
{
  const r = sendFree(createPhone(), 'sara', '  Hola, ¿qué tal? ñ á 🚲  ', AT, 'm1');
  assert.ok(r.sent);
  assert.equal(msgs(r.phone)[0].text, 'Hola, ¿qué tal? ñ á 🚲');
  assert.equal(msgs(r.phone)[0].free, true);
  assert.equal(msgs(r.phone)[0].id, 'm1');
}

// 2 · Pegado con saltos, tabuladores, invisibles, control y giros de dirección (bidi): en un mensaje, fuera.
assert.equal(cleanText('a\tb\nc\u0000d​e‮f⁦', MESSAGE_MAX), 'abcdef');
assert.equal(cleanText('línea 1\nlínea 2', 100, true), 'línea 1\nlínea 2', 'una nota conserva los saltos');
assert.equal(cleanText(42, 10), '');

// 3 · Vacío o sólo espacios: no se manda nada.
for (const empty of ['', '   ', '\n\t ', '​​']) {
  const r = sendFree(createPhone(), 'sara', empty, AT, 'e');
  assert.equal(r.sent, false, `${JSON.stringify(empty)} se manda`);
  assert.equal(r.reason, 'empty');
}

// 4 · Muy largo: MESSAGE_MAX caracteres, sin partir un emoji ni un acento compuesto.
{
  const r = sendFree(createPhone(), 'sara', '🚲'.repeat(500), AT, 'l');
  const text = msgs(r.phone)[0].text;
  assert.equal([...text].length, MESSAGE_MAX, 'no corta en MESSAGE_MAX');
  assert.ok([...text].every((c) => c === '🚲'), 'parte un emoji');
  assert.equal(cleanText('é'.repeat(400), 5), 'é'.repeat(5), 'parte un acento compuesto');
  assert.equal(cleanText('👩‍👩‍👧'.repeat(10), 2), '👩‍👩‍👧'.repeat(2), 'parte una familia de emoji');
}

// 5 · HTML: se guarda como texto, sin tocar (la interfaz lo pinta con textContent).
{
  const html = '<img src=x onerror=alert(1)><script>alert(1)</script> & "x"';
  const r = sendFree(createPhone(), 'sara', html, AT, 'h');
  assert.equal(msgs(r.phone)[0].text, html);
}

// 6 · Doble envío (mismo id): uno. Respuesta sincera: una vez al día; otro día, otra vez.
{
  let p = sendFree(createPhone(), 'sara', 'uno', AT, 'd1').phone;
  const again = sendFree(p, 'sara', 'uno', AT, 'd1');
  assert.equal(again.sent, false);
  assert.equal(again.reason, 'duplicate');
  assert.equal(again.phone, p, 'el doble envío cambia el móvil');
  p = sendFree(p, 'sara', 'dos', AT + 5, 'd2').phone;
  assert.deepEqual(msgs(p).filter((m) => m.from === 'me').map((m) => m.text), ['uno', 'dos']);
  const theirs = msgs(p).filter((m) => m.from === 'them');
  assert.equal(theirs.length, 1, 'contesta más de una vez el mismo día');
  assert.equal(theirs[0].text, FREE_REPLY);
  p = sendFree(p, 'sara', 'mañana', AT + 1440, 'd3').phone;
  assert.equal(msgs(p).filter((m) => m.from === 'them').length, 2, 'otro día no contesta');
}

// 7 · Límite de volumen al día.
{
  let p = createPhone();
  for (let i = 0; i < FREE_DAILY_LIMIT; i++) p = sendFree(p, 'sara', `m${i}`, AT + i, `v${i}`).phone;
  const over = sendFree(p, 'sara', 'uno más', AT + 99, 'v-over');
  assert.equal(over.sent, false);
  assert.equal(over.reason, 'limit');
}

// 8 · Notas: crear, cambiar, borrar; vacía no se guarda; el cuerpo se corta en NOTE_BODY_MAX.
{
  let p = saveNote(createPhone(), { id: 'n1', title: 'Compra', body: 'pan\nleche 🥛' }, AT);
  assert.deepEqual(p.notes, [{ id: 'n1', title: 'Compra', body: 'pan\nleche 🥛', updated: AT }]);
  p = saveNote(p, { id: 'n1', title: 'Compra del sábado', body: 'pan' }, AT + 10);
  assert.equal(p.notes!.length, 1);
  assert.equal(p.notes![0].title, 'Compra del sábado');
  assert.equal(saveNote(p, { id: 'n2', title: '  ', body: '\n' }, AT), p, 'guarda una nota vacía');
  p = saveNote(p, { id: 'n3', title: '', body: 'x'.repeat(NOTE_BODY_MAX + 50) }, AT);
  assert.equal(p.notes!.find((n) => n.id === 'n3')!.body.length, NOTE_BODY_MAX);
  p = deleteNote(p, 'n1');
  assert.deepEqual(p.notes!.map((n) => n.id), ['n3']);
}

// 9 · Guardar y cargar: mensajes (con id y libres) y notas vuelven iguales; una partida sin notas carga sin ellas.
{
  const store = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
  const save = new SaveSystem(storage);
  let phone = sendFree(createPhone(), 'sara', 'Hola, ¿qué tal? ñ á 🚲', AT, 's1').phone;
  phone = saveNote(phone, { id: 'n1', title: 'Ideas', body: '<b>no</b> es HTML' }, AT);
  assert.ok(save.save({ ...createInitialState(), phone }));
  assert.deepEqual(save.load()!.phone, phone);
  const old = { threads: { sara: { messages: [{ from: 'me', text: 'hola', at: 5 }], unread: 0, today: { day: 1, actions: [], gains: 0 } } }, plans: [] };
  const parsed = parsePhone(old);
  assert.equal(parsed.notes, undefined, 'una partida antigua gana notas al cargar');
  assert.equal(parsed.threads.sara.messages[0].text, 'hola');
  // Notas rotas o de otro tipo: fuera, sin tirar las buenas.
  const mixed = parsePhone({ threads: {}, plans: [], notes: [{ id: 'ok', title: 'a', body: 'b', updated: 1 }, { id: 5 }, 'x', { id: 'vacía', title: '', body: '' }] });
  assert.deepEqual(mixed.notes!.map((n) => n.id), ['ok']);
}

console.log('check-phone-text: OK (Unicode, pegado, vacío, largo, HTML, doble envío, respuesta sincera, límite, notas, guardado y partida antigua)');
