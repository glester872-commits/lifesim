/**
 * Alpha-06 · servidor de salas de LIFE//SIM: presencia, posición y chat de hasta MAX_PLAYERS personas por sala
 * privada (código de 6 letras). Es la autoridad de lo compartido: valida cada mensaje (src/net/protocol), corta lo
 * que va demasiado rápido o desordenado y limita el ritmo. No sabe nada de la partida de cada uno (dinero, día,
 * NPC): eso no sale del navegador.
 *
 * Todo vive en memoria: al vaciarse una sala, ROOM_TTL después desaparece con su chat. No escribe nada a disco.
 * El log dice qué pasa (conexiones, salas, rechazos), nunca qué se escribe en el chat.
 *
 *   npm run server            # ws://localhost:8787  (PORT, ALLOWED_ORIGINS, LOG=0 para callarlo)
 */
import { createServer, type IncomingMessage } from 'node:http';
import { randomBytes, randomInt } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  CHAT_HISTORY, CHAT_MAX, MAX_FRAME, MAX_PLAYERS, PROTOCOL_VERSION, ROOM_ALPHABET, ROOM_CODE_LENGTH,
  cleanLine, parseClient, plausibleMove,
  type ChatMsg, type ClientMsg, type ErrorCode, type LookDTO, type PlayerView, type Pose, type Presence, type ServerMsg,
} from '../src/net/protocol.ts';

export interface ServerOptions {
  port?: number;
  /** Orígenes de navegador admitidos (p. ej. https://usuario.github.io). Vacío: cualquiera (desarrollo local). */
  allowedOrigins?: readonly string[];
  log?: (line: string) => void;
  /** Tiempos, acortables en las pruebas. */
  graceMs?: number;
  roomTtlMs?: number;
  heartbeatMs?: number;
}

/** Movimientos por segundo (y ráfaga); chat: tantos en tanto tiempo. */
const MOVE_RATE = 20;
const CHAT_BURST = 5;
const CHAT_WINDOW = 10_000;
const HELLO_TIMEOUT = 5_000;
const MAX_STRIKES = 20;
const MAX_ROOMS = 500;
const MAX_CONNECTIONS = 200;

interface Member {
  session: string;
  playerId: string;
  name: string;
  look: LookDTO;
  conn: Conn | null;
  presence: Presence;
  last: { pose: Pose; at: number } | null;
  seq: number;
  tokens: number;
  refill: number;
  chats: number[];
  lastText: { text: string; at: number } | null;
  grace?: NodeJS.Timeout;
}

interface Room {
  code: string;
  members: Map<string, Member>;
  chat: ChatMsg[];
  emptySince: number | null;
}

interface Conn {
  ws: WebSocket;
  alive: boolean;
  strikes: number;
  hello: { playerId: string; name: string; look: LookDTO } | null;
  room: Room | null;
  member: Member | null;
}

const newId = (): string => randomBytes(12).toString('base64url');

export interface RunningServer {
  port: number;
  close: () => Promise<void>;
  stats: () => { rooms: number; connections: number };
}

export function startServer(opts: ServerOptions = {}): Promise<RunningServer> {
  const log = opts.log ?? ((line: string) => console.log(`${new Date().toISOString()} ${line}`));
  const graceMs = opts.graceMs ?? 20_000;
  const roomTtl = opts.roomTtlMs ?? 10 * 60_000;
  const origins = new Set(opts.allowedOrigins ?? []);
  const rooms = new Map<string, Room>();
  const conns = new Set<Conn>();

  const http = createServer((req, res) => {
    // Para el alojamiento: ¿está vivo? Sin datos de nadie.
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, v: PROTOCOL_VERSION, rooms: rooms.size, connections: conns.size }));
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({
    server: http,
    maxPayload: MAX_FRAME,
    verifyClient: ({ req }: { req: IncomingMessage }) => {
      if (conns.size >= MAX_CONNECTIONS) return false;
      const origin = req.headers.origin;
      return origins.size === 0 || (typeof origin === 'string' && origins.has(origin));
    },
  });

  const send = (conn: Conn | null, msg: ServerMsg): void => {
    if (conn && conn.ws.readyState === WebSocket.OPEN) conn.ws.send(JSON.stringify(msg));
  };
  const fail = (conn: Conn, code: ErrorCode, message: string): void => send(conn, { t: 'error', code, message });
  const view = (m: Member): PlayerView => ({ session: m.session, name: m.name, look: m.look, presence: m.presence, pose: m.last?.pose ?? null });
  const broadcast = (room: Room, msg: ServerMsg, except?: Member): void => {
    for (const m of room.members.values()) if (m !== except) send(m.conn, msg);
  };

  const roomCode = (): string => {
    for (;;) {
      const code = Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]).join('');
      if (!rooms.has(code)) return code;
    }
  };

  const removeMember = (room: Room, m: Member, why: string): void => {
    clearTimeout(m.grace);
    if (!room.members.delete(m.session)) return;
    if (m.conn) {
      m.conn.room = null;
      m.conn.member = null;
    }
    broadcast(room, { t: 'left', session: m.session });
    if (!room.members.size) room.emptySince = Date.now();
    log(`left room=${room.code} session=${m.session} why=${why} players=${room.members.size}`);
  };

  const enter = (conn: Conn, room: Room): void => {
    const hello = conn.hello!;
    const again = [...room.members.values()].find((m) => m.playerId === hello.playerId);
    let member: Member;
    if (again) {
      // El mismo navegador vuelve (recarga, red caída): la misma sesión, nunca un clon.
      clearTimeout(again.grace);
      if (again.conn && again.conn !== conn) {
        again.conn.room = null;
        again.conn.member = null;
        again.conn.ws.close(4000, 'replaced');
      }
      member = again;
      member.conn = conn;
      member.name = hello.name;
      member.look = hello.look;
      member.presence = 'connected';
      // Una pestaña recargada empieza a contar desde 0 (y puede salir en otra zona): orden y velocidad, desde aquí.
      member.seq = -1;
      member.last = null;
      broadcast(room, { t: 'presence', session: member.session, presence: 'connected' }, member);
      log(`rejoin room=${room.code} session=${member.session}`);
    } else {
      if (room.members.size >= MAX_PLAYERS) return fail(conn, 'full', 'La sala está llena.');
      member = {
        session: newId(), playerId: hello.playerId, name: hello.name, look: hello.look, conn, presence: 'connected',
        last: null, seq: -1, tokens: MOVE_RATE, refill: Date.now(), chats: [], lastText: null,
      };
      room.members.set(member.session, member);
      broadcast(room, { t: 'joined', player: view(member) }, member);
      log(`join room=${room.code} session=${member.session} players=${room.members.size}`);
    }
    room.emptySince = null;
    conn.room = room;
    conn.member = member;
    send(conn, { t: 'room', code: room.code, you: member.session, players: [...room.members.values()].map(view), chat: room.chat });
  };

  const move = (conn: Conn, m: Member, room: Room, msg: Extract<ClientMsg, { t: 'move' }>): void => {
    const now = Date.now();
    m.tokens = Math.min(MOVE_RATE, m.tokens + ((now - m.refill) / 1000) * MOVE_RATE);
    m.refill = now;
    if (m.tokens < 1) return fail(conn, 'rate', 'Demasiados movimientos.');
    m.tokens -= 1;
    // Desordenado o repetido: se tira sin más (ya llegó uno más nuevo).
    if (msg.seq <= m.seq) return;
    if (!plausibleMove(m.last, msg.pose, now)) {
      log(`reject room=${room.code} session=${m.session} why=speed`);
      return fail(conn, 'speed', 'Movimiento imposible: se ignora.');
    }
    m.seq = msg.seq;
    m.last = { pose: msg.pose, at: now };
    broadcast(room, { t: 'moved', session: m.session, seq: msg.seq, pose: msg.pose }, m);
  };

  const chat = (conn: Conn, m: Member, room: Room, msg: Extract<ClientMsg, { t: 'chat' }>): void => {
    if (room.chat.some((c) => c.id === msg.id)) return; // reenvío del mismo mensaje: ya está
    const text = cleanLine(msg.text, CHAT_MAX);
    if (!text) return fail(conn, 'chat', 'El mensaje está vacío.');
    const now = Date.now();
    m.chats = m.chats.filter((t) => now - t < CHAT_WINDOW);
    if (m.chats.length >= CHAT_BURST) return fail(conn, 'rate', 'Vas muy rápido: espera unos segundos.');
    if (m.lastText && m.lastText.text === text && now - m.lastText.at < CHAT_WINDOW) return fail(conn, 'rate', 'Ese mensaje ya lo has mandado.');
    m.chats.push(now);
    m.lastText = { text, at: now };
    const out: ChatMsg = { id: msg.id, from: m.session, name: m.name, text, at: now };
    room.chat.push(out);
    if (room.chat.length > CHAT_HISTORY) room.chat.splice(0, room.chat.length - CHAT_HISTORY);
    broadcast(room, { t: 'chat', msg: out });
    log(`chat room=${room.code} session=${m.session} chars=${text.length}`);
  };

  const handle = (conn: Conn, msg: ClientMsg): void => {
    if (msg.t === 'hello') {
      if (msg.v !== PROTOCOL_VERSION) {
        fail(conn, 'version', 'Versión del juego distinta: recarga la página.');
        conn.ws.close(4001, 'version');
        return;
      }
      conn.hello = { playerId: msg.playerId, name: msg.name, look: msg.look };
      return;
    }
    if (!conn.hello) return fail(conn, 'hello', 'Primero, hola.');
    const { room, member } = conn;
    if (msg.t === 'create') {
      if (room) return fail(conn, 'bad', 'Ya estás en una sala.');
      if (rooms.size >= MAX_ROOMS) return fail(conn, 'full', 'No caben más salas ahora mismo.');
      const fresh: Room = { code: roomCode(), members: new Map(), chat: [], emptySince: null };
      rooms.set(fresh.code, fresh);
      log(`create room=${fresh.code}`);
      return enter(conn, fresh);
    }
    if (msg.t === 'join') {
      if (room) return fail(conn, 'bad', 'Ya estás en una sala.');
      const target = rooms.get(msg.code);
      if (!target) return fail(conn, 'room', 'No hay ninguna sala con ese código.');
      return enter(conn, target);
    }
    if (!room || !member) return fail(conn, 'room', 'No estás en ninguna sala.');
    if (msg.t === 'leave') return removeMember(room, member, 'leave');
    if (msg.t === 'move') return move(conn, member, room, msg);
    return chat(conn, member, room, msg);
  };

  wss.on('connection', (ws) => {
    const conn: Conn = { ws, alive: true, strikes: 0, hello: null, room: null, member: null };
    conns.add(conn);
    const helloTimer = setTimeout(() => !conn.hello && ws.close(4002, 'hello'), HELLO_TIMEOUT);
    ws.on('pong', () => (conn.alive = true));
    // Un frame demasiado grande o roto: ws cierra esa conexión (1009/1002) y avisa aquí. Sin esto, tumbaría el servidor.
    ws.on('error', (e) => log(`socket-error why=${(e as { code?: string }).code ?? 'unknown'}`));
    ws.on('message', (data, binary) => {
      const msg = binary ? null : parseClient(data.toString());
      if (!msg) {
        conn.strikes += 1;
        fail(conn, 'bad', 'Mensaje no válido.');
        if (conn.strikes > MAX_STRIKES) {
          log('kick why=bad-messages');
          ws.close(1008, 'bad');
        }
        return;
      }
      handle(conn, msg);
    });
    ws.on('close', () => {
      clearTimeout(helloTimer);
      conns.delete(conn);
      const { room, member } = conn;
      if (!room || !member || member.conn !== conn) return;
      // Se ha caído: queda «reconectando» un rato; si no vuelve, se va de la sala.
      member.conn = null;
      member.presence = 'reconnecting';
      broadcast(room, { t: 'presence', session: member.session, presence: 'reconnecting' }, member);
      log(`drop room=${room.code} session=${member.session}`);
      member.grace = setTimeout(() => removeMember(room, member, 'timeout'), graceMs);
    });
  });

  // Latido: quien no contesta a un ping a tiempo se da por caído (y entra en la espera de arriba).
  const heartbeat = setInterval(() => {
    for (const c of conns) {
      if (!c.alive) c.ws.terminate();
      else {
        c.alive = false;
        c.ws.ping();
      }
    }
    const now = Date.now();
    for (const [code, r] of rooms) {
      if (r.emptySince !== null && now - r.emptySince > roomTtl) {
        rooms.delete(code);
        log(`expire room=${code}`);
      }
    }
  }, opts.heartbeatMs ?? 10_000);

  return new Promise((resolve) => {
    http.listen(opts.port ?? 8787, () => {
      const address = http.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      log(`listening port=${port} v=${PROTOCOL_VERSION} origins=${origins.size ? [...origins].join(',') : '*'}`);
      resolve({
        port,
        stats: () => ({ rooms: rooms.size, connections: conns.size }),
        close: () =>
          new Promise<void>((done) => {
            clearInterval(heartbeat);
            for (const r of rooms.values()) for (const m of r.members.values()) clearTimeout(m.grace);
            for (const c of conns) c.ws.terminate();
            wss.close();
            http.close(() => done());
          }),
      });
    });
  });
}

// Arrancado a mano (npm run server); importado por las pruebas, no arranca solo.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  void startServer({ port: Number(process.env.PORT ?? 8787), allowedOrigins, log: process.env.LOG === '0' ? () => {} : undefined });
}
