// Alpha-06 · prueba de integración del servidor de salas (`npm run check`): un servidor de verdad en un puerto libre
// y clientes WebSocket de verdad, sin simular la red. Sala por código, presencia, movimiento validado (orden,
// velocidad, zona), chat (Unicode, HTML como texto, vacíos, largo, ráfagas, repetidos), mensajes inválidos,
// reconexión sin clones, sustitución de la conexión vieja, salida, espera de reconexión, sala llena y orígenes.
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { startServer } from '../server/index.ts';
import { CHAT_MAX, LOOK_CODE_PREFIX, MAX_FRAME, MAX_PLAYERS, PROTOCOL_VERSION, decodeLook, encodeLook, parseServer, type ServerMsg } from '../src/net/protocol.ts';

// 0 · Aspecto para pasar a mano (sin red): vuelve igual, con Unicode; lo que no es del catálogo o no es un código, fuera.
{
  const code = encodeLook('Marta ñ 🚲', { hair: 'bob', skin: 'piel-7', top: 'camiseta-grafica', bad: 'x' } as never);
  assert.ok(code.startsWith(LOOK_CODE_PREFIX));
  assert.deepEqual(decodeLook(`  ${code.slice(0, 20)}
${code.slice(20)}  `), { v: 1, name: 'Marta ñ 🚲', look: { hair: 'bob', skin: 'piel-7', top: 'camiseta-grafica' } });
  for (const bad of ['', 'hola', LOOK_CODE_PREFIX, `${LOOK_CODE_PREFIX}!!!`, `${LOOK_CODE_PREFIX}${btoa('{"v":2,"name":"x"}')}`, `${LOOK_CODE_PREFIX}${'A'.repeat(5000)}`, 42]) {
    assert.equal(decodeLook(bad), null, `acepta ${String(bad).slice(0, 30)}`);
  }
  const html = decodeLook(encodeLook('<b>x</b>', { hair: '<script>' } as never));
  assert.deepEqual(html, { v: 1, name: '<b>x</b>', look: {} }, 'el nombre es texto y el pelo raro no entra');
  assert.ok(!JSON.stringify(decodeLook(code)).match(/money|inventory|player-/), 'el código lleva algo de la partida');
}

const logs: string[] = [];
const server = await startServer({ port: 0, graceMs: 300, heartbeatMs: 60_000, log: (l) => logs.push(l) });
const URL = `ws://127.0.0.1:${server.port}`;

interface Client {
  ws: WebSocket;
  inbox: ServerMsg[];
  send: (msg: unknown) => void;
  next: (pred: (m: ServerMsg) => boolean, ms?: number) => Promise<ServerMsg>;
  none: (pred: (m: ServerMsg) => boolean, ms?: number) => Promise<void>;
  closed: Promise<number>;
}

function connect(playerId: string, name: string, origin?: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL, origin ? { origin } : {});
    const inbox: ServerMsg[] = [];
    const waiters: { pred: (m: ServerMsg) => boolean; done: (m: ServerMsg) => void }[] = [];
    const closed = new Promise<number>((r) => ws.on('close', (code) => r(code)));
    ws.on('message', (data) => {
      const msg = parseServer(data.toString());
      assert.ok(msg, `el servidor manda algo que el cliente no acepta: ${data.toString().slice(0, 120)}`);
      const w = waiters.findIndex((x) => x.pred(msg));
      if (w >= 0) waiters.splice(w, 1)[0].done(msg);
      else inbox.push(msg);
    });
    ws.on('error', reject);
    ws.on('open', () => {
      const c: Client = {
        ws,
        inbox,
        closed,
        send: (msg) => ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)),
        next: (pred, ms = 1500) => {
          const i = inbox.findIndex(pred);
          if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
          return new Promise((res, rej) => {
            const timer = setTimeout(() => rej(new Error(`${name}: no llega el mensaje esperado`)), ms);
            waiters.push({ pred, done: (m) => (clearTimeout(timer), res(m)) });
          });
        },
        none: async (pred, ms = 250) => {
          await new Promise((r) => setTimeout(r, ms));
          assert.equal(inbox.filter(pred).length, 0, `${name}: llega algo que no debía`);
        },
      };
      if (playerId) c.send({ t: 'hello', v: PROTOCOL_VERSION, playerId, name, look: { hair: 'bob', skin: 'tone-3', top: '<script>' } });
      resolve(c);
    });
  });
}

type Of<T extends ServerMsg['t']> = Extract<ServerMsg, { t: T }>;
const isT = (t: ServerMsg['t']) => (m: ServerMsg) => m.t === t;
const err = (code: string) => (m: ServerMsg) => m.t === 'error' && m.code === code;
const pose = (x: number, y: number, zone = 'district') => ({ zone, x, y, f: 'down', m: 1 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 1 · A crea, B entra con el código tal como lo dicta alguien (minúsculas y guion).
const A = await connect('player-aaaaaaaa', 'Alex');
A.send({ t: 'create' });
const roomA = (await A.next(isT('room'))) as Of<'room'>;
assert.equal(roomA.players.length, 1);
assert.deepEqual(roomA.players[0].look, { hair: 'bob', skin: 'tone-3' }, 'el aspecto llega con algo que no es un id de catálogo');
const B = await connect('player-bbbbbbbb', 'Marta');
B.send({ t: 'join', code: `${roomA.code.slice(0, 3).toLowerCase()}-${roomA.code.slice(3)}` });
const roomB = (await B.next(isT('room'))) as Of<'room'>;
assert.equal(roomB.code, roomA.code);
assert.deepEqual(roomB.players.map((p) => p.name).sort(), ['Alex', 'Marta']);
assert.equal(((await A.next(isT('joined'))) as Of<'joined'>).player.name, 'Marta');
const sessA = roomA.you;
const sessB = roomB.you;
assert.ok(![sessA, sessB].includes('player-aaaaaaaa') && !JSON.stringify(roomB).includes('player-'), 'el id del navegador sale del servidor');

// 2 · Movimiento: llega al otro; lo desordenado se tira; un salto imposible en la misma zona, también; cambiar de zona, no.
A.send({ t: 'move', seq: 1, pose: pose(100, 100) });
const m1 = (await B.next(isT('moved'))) as Of<'moved'>;
assert.equal(m1.session, sessA);
assert.deepEqual(m1.pose, pose(100, 100));
A.send({ t: 'move', seq: 0, pose: pose(110, 100) });
await B.none(isT('moved'));
A.send({ t: 'move', seq: 2, pose: pose(5000, 5000) });
await A.next(err('speed'));
await B.none(isT('moved'));
A.send({ t: 'move', seq: 3, pose: pose(5000, 5000, 'home') });
assert.equal(((await B.next(isT('moved'))) as Of<'moved'>).pose.zone, 'home');

// 3 · Chat: Unicode tal cual, HTML como texto, invisibles y bidi fuera; vacío no; largo cortado; mismo id una vez.
B.send({ t: 'chat', id: 'chat-00000001', text: '  Hola, ¿qué tal? ñ á 🚲 👩‍👩‍👧  ' });
const c1 = (await A.next(isT('chat'))) as Of<'chat'>;
assert.equal(c1.msg.text, 'Hola, ¿qué tal? ñ á 🚲 👩‍👩‍👧');
assert.equal(c1.msg.from, sessB);
assert.equal(c1.msg.name, 'Marta');
await B.next(isT('chat')); // quien escribe recibe su mensaje confirmado
const xss = '<img src=x onerror=alert(1)><script>alert(1)</script>';
B.send({ t: 'chat', id: 'chat-00000002', text: `${xss}‮` });
assert.equal(((await A.next(isT('chat'))) as Of<'chat'>).msg.text, xss);
B.send({ t: 'chat', id: 'chat-00000002', text: 'otra vez el mismo id' });
await A.none((m) => m.t === 'chat' && m.msg.text === 'otra vez el mismo id');
B.send({ t: 'chat', id: 'chat-00000003', text: '   ​ ' });
await B.next(err('chat'));
B.send({ t: 'chat', id: 'chat-00000004', text: 'x'.repeat(3000) });
assert.equal(((await A.next(isT('chat'))) as Of<'chat'>).msg.text.length, CHAT_MAX);
// Ráfaga: 5 en 10 s por persona (ya lleva 3 válidos): el 3.º de estos se corta; y repetir texto, también.
B.send({ t: 'chat', id: 'chat-00000005', text: 'cuatro' });
B.send({ t: 'chat', id: 'chat-00000006', text: 'cinco' });
B.send({ t: 'chat', id: 'chat-00000007', text: 'seis' });
await B.next(err('rate'));
await A.none((m) => m.t === 'chat' && m.msg.text === 'seis');
A.send({ t: 'chat', id: 'chat-0000000a', text: 'repe' });
A.send({ t: 'chat', id: 'chat-0000000b', text: 'repe' });
await A.next(err('rate'));

// 4 · Inválidos: basura, tipos que no existen, campos raros, antes del hola; un frame enorme cierra la conexión.
for (const bad of ['no es json', '[]', '{"t":"teleport"}', '{"t":"move","seq":-1,"pose":{}}', '{"t":"join","code":"<b>"}', JSON.stringify({ t: 'move', seq: 9, pose: { zone: '../etc', x: 1, y: 1, f: 'down', m: 1 } })]) {
  A.send(bad);
  await A.next(err('bad'));
}
const anon = await connect('', 'nadie');
anon.send({ t: 'create' });
await anon.next(err('hello'));
anon.send({ t: 'join', code: 'ZZZZZZ' });
await anon.next(err('hello'));
anon.send('x'.repeat(MAX_FRAME + 10));
assert.equal(await anon.closed, 1009, 'un mensaje demasiado grande no corta la conexión');
const lost = await connect('player-cccccccc', 'Sin sala');
lost.send({ t: 'join', code: 'ZZZZZZ' });
await lost.next(err('room'));
const old = await connect('', 'vieja');
old.send({ t: 'hello', v: PROTOCOL_VERSION + 1, playerId: 'player-dddddddd', name: 'Vieja', look: {} });
await old.next(err('version'));
assert.equal(await old.closed, 4001);

// 5 · B se cae y vuelve con el mismo navegador: «reconectando», después «conectado», misma sesión, sin clones.
B.ws.close();
assert.equal(((await A.next(isT('presence'))) as Of<'presence'>).presence, 'reconnecting');
const B2 = await connect('player-bbbbbbbb', 'Marta');
B2.send({ t: 'join', code: roomA.code });
const again = (await B2.next(isT('room'))) as Of<'room'>;
assert.equal(again.you, sessB, 'al volver es otra sesión (un clon)');
assert.equal(again.players.length, 2, 'hay clones en la sala');
assert.ok(again.chat.length >= 3, 'el chat de la sala no sigue ahí al volver');
assert.equal(((await A.next(isT('presence'))) as Of<'presence'>).presence, 'connected');
await A.none(isT('joined'));
// La pestaña recargada cuenta desde 1 otra vez: sus movimientos llegan (no se toman por desordenados).
B2.send({ t: 'move', seq: 1, pose: pose(300, 300) });
assert.equal(((await A.next(isT('moved'))) as Of<'moved'>).session, sessB);
// Otra pestaña del mismo navegador entra: la vieja se cierra (4000), sigue habiendo uno.
const B3 = await connect('player-bbbbbbbb', 'Marta');
B3.send({ t: 'join', code: roomA.code });
assert.equal(((await B3.next(isT('room'))) as Of<'room'>).players.length, 2);
assert.equal(await B2.closed, 4000);

// 6 · Salir de la sala: se va para todos; caerse y no volver: se va al acabar la espera.
B3.send({ t: 'leave' });
assert.equal(((await A.next(isT('left'))) as Of<'left'>).session, sessB);
B3.send({ t: 'chat', id: 'chat-0000000c', text: 'ya no estoy' });
await B3.next(err('room'));
const C = await connect('player-eeeeeeee', 'Caída');
C.send({ t: 'join', code: roomA.code });
const sessC = ((await C.next(isT('room'))) as Of<'room'>).you;
await A.next(isT('joined'));
C.ws.terminate();
await A.next((m) => m.t === 'presence' && m.session === sessC && m.presence === 'reconnecting');
await A.next((m) => m.t === 'left' && m.session === sessC, 2000);

// 7 · Sala llena: MAX_PLAYERS dentro, el siguiente no entra.
const crowd: Client[] = [];
for (let i = 1; i < MAX_PLAYERS; i++) {
  const p = await connect(`player-crowd000${i}`, `P${i}`);
  p.send({ t: 'join', code: roomA.code });
  await p.next(isT('room'));
  crowd.push(p);
}
const extra = await connect('player-crowd0099', 'Sobra');
extra.send({ t: 'join', code: roomA.code });
await extra.next(err('full'));

// 8 · Con orígenes fijados (alojado): un navegador de otra web no entra; el bueno, sí.
const locked = await startServer({ port: 0, allowedOrigins: ['https://lifesim.example'], log: () => {} });
const rejected = await new Promise<boolean>((r) => {
  const ws = new WebSocket(`ws://127.0.0.1:${locked.port}`, { origin: 'https://otra.example' });
  ws.on('error', () => r(true));
  ws.on('open', () => (ws.close(), r(false)));
});
assert.ok(rejected, 'entra un navegador de otro origen');
const good = new WebSocket(`ws://127.0.0.1:${locked.port}`, { origin: 'https://lifesim.example' });
await new Promise((r, j) => (good.on('open', r), good.on('error', j)));
good.close();
await locked.close();

// El log cuenta lo que pasa y nunca lo que se escribe.
assert.ok(logs.some((l) => l.startsWith('create room=')) && logs.some((l) => l.startsWith('rejoin room=')) && logs.some((l) => l.includes('why=speed')));
assert.ok(!logs.some((l) => l.includes('Hola') || l.includes('<script>') || l.includes('repe')), 'el log guarda el chat');

for (const c of [A, B3, lost, extra, ...crowd]) c.ws.close();
await sleep(50);
await server.close();
console.log(`check-online: OK (aspecto para compartir, sala por código, presencia, movimiento validado, chat, inválidos, reconexión sin clones, salida, espera, sala llena, orígenes)\n  ${logs.slice(0, 10).join('\n  ')}`);
