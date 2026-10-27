import {
  CHAT_MAX, PROTOCOL_VERSION, cleanLine, normalizeCode, parseServer,
  type ChatMsg, type ClientMsg, type LookDTO, type PlayerView, type Pose, type ServerMsg,
} from './protocol';

/**
 * Alpha-06 · la conexión del navegador con el servidor de salas (server/index.ts). Opcional: sin servidor, o sin
 * entrar nunca, el juego es el de siempre; una caída de red no toca la partida ni el guardado (no sabe de ellos).
 *
 * offline → connecting → joining → in-room; si la red cae dentro de una sala, reconnecting (con espera creciente)
 * hasta volver a entrar con el mismo id de navegador: el servidor devuelve la misma sesión, no un clon.
 */
export type OnlineState = 'offline' | 'connecting' | 'joining' | 'in-room' | 'reconnecting';

export interface OnlineEvents {
  state(state: OnlineState, detail: string): void;
  room(code: string, you: string, players: PlayerView[], chat: ChatMsg[]): void;
  message(msg: ServerMsg): void;
}

const PLAYER_KEY = 'lifesim-online-player';
const BACKOFF = [1000, 2000, 4000, 8000];
/** Si no abre en este tiempo, se da por caído (servidor apagado o dirección mal puesta). */
const CONNECT_TIMEOUT = 6000;

const randomId = (): string => {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** El id de este navegador para las salas: no es la partida ni dice nada de quien juega; sólo evita clones al volver. */
function browserPlayerId(): string {
  try {
    const saved = localStorage.getItem(PLAYER_KEY);
    if (saved && /^[A-Za-z0-9_-]{8,40}$/.test(saved)) return saved;
    const id = randomId();
    localStorage.setItem(PLAYER_KEY, id);
    return id;
  } catch {
    // Sin almacenamiento (ventana privada): sirve para esta pestaña.
    return randomId();
  }
}

/** La dirección del servidor: VITE_ONLINE_URL o, en desarrollo, el mismo ordenador en el puerto 8787. */
export function serverUrl(): string | null {
  const env = import.meta.env.VITE_ONLINE_URL as string | undefined;
  if (env) return env;
  return import.meta.env.DEV ? `ws://${location.hostname}:8787` : null;
}

/** La sala de esta pestaña, para volver sola tras recargar (sólo la pestaña: sessionStorage; al salir, se borra). */
const ROOM_KEY = 'lifesim-online-room';

function remember(code: string | null): void {
  try {
    if (code) sessionStorage.setItem(ROOM_KEY, code);
    else sessionStorage.removeItem(ROOM_KEY);
  } catch {
    // Sin almacenamiento: tras recargar, se vuelve a entrar con el código a mano.
  }
}

export function rememberedRoom(): string | null {
  try {
    return sessionStorage.getItem(ROOM_KEY);
  } catch {
    return null;
  }
}

type Wanted ={ kind: 'create' } | { kind: 'join'; code: string };

export class OnlineClient {
  private ws: WebSocket | null = null;
  private current: OnlineState = 'offline';
  private readonly playerId = browserPlayerId();
  private wanted: Wanted | null = null;
  private attempt = 0;
  private retry: number | undefined;
  private timeout: number | undefined;
  private seq = 0;
  private code = '';
  private readonly url: string | null;
  private readonly identity: () => { name: string; look: LookDTO };
  private readonly on: OnlineEvents;

  constructor(url: string | null, identity: () => { name: string; look: LookDTO }, on: OnlineEvents) {
    this.url = url;
    this.identity = identity;
    this.on = on;
  }

  get state(): OnlineState {
    return this.current;
  }

  get available(): boolean {
    return this.url !== null;
  }

  get roomCode(): string {
    return this.code;
  }

  create(): void {
    this.open({ kind: 'create' });
  }

  join(raw: string): void {
    this.open({ kind: 'join', code: normalizeCode(raw) });
  }

  /** Salir de la sala y de la conexión: vuelve a ser sólo la partida de siempre. */
  leave(): void {
    this.send({ t: 'leave' });
    this.stop('Has salido de la sala.');
  }

  move(pose: Pose): void {
    if (this.current === 'in-room') this.send({ t: 'move', seq: ++this.seq, pose });
  }

  /** Manda un mensaje de chat; false si no hay a quién (fuera de sala, sin red) o está vacío. */
  chat(raw: string): boolean {
    const text = cleanLine(raw, CHAT_MAX);
    if (!text || this.current !== 'in-room') return false;
    return this.send({ t: 'chat', id: randomId(), text });
  }

  private open(wanted: Wanted): void {
    if (!this.url) return this.set('offline', 'No hay servidor configurado (VITE_ONLINE_URL).');
    this.stop('');
    this.wanted = wanted;
    this.attempt = 0;
    this.dial('connecting');
  }

  private dial(state: 'connecting' | 'reconnecting'): void {
    if (!this.url || !this.wanted) return;
    this.set(state, state === 'connecting' ? 'Conectando…' : `Reconectando… (intento ${this.attempt})`);
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      return this.lost();
    }
    this.ws = ws;
    this.timeout = window.setTimeout(() => ws.readyState !== WebSocket.OPEN && ws.close(), CONNECT_TIMEOUT);
    ws.onopen = () => {
      window.clearTimeout(this.timeout);
      const { name, look } = this.identity();
      this.send({ t: 'hello', v: PROTOCOL_VERSION, playerId: this.playerId, name, look });
      const w = this.wanted;
      if (!w) return;
      this.set('joining', 'Entrando en la sala…');
      // Al reconectar se vuelve a la misma sala, no a una nueva.
      if (w.kind === 'create') this.send({ t: 'create' });
      else this.send({ t: 'join', code: w.code });
    };
    ws.onmessage = (e) => {
      const msg = typeof e.data === 'string' ? parseServer(e.data) : null;
      if (!msg) return; // lo que no encaja en el contrato no entra
      if (msg.t === 'room') {
        this.code = msg.code;
        remember(msg.code);
        this.wanted = { kind: 'join', code: msg.code };
        this.attempt = 0;
        this.set('in-room', `En la sala ${msg.code}`);
        this.on.room(msg.code, msg.you, msg.players, msg.chat);
        return;
      }
      // Sin sala (código mal, sala caducada), llena u otra versión: no tiene sentido insistir.
      if (msg.t === 'error' && (msg.code === 'room' || msg.code === 'full' || msg.code === 'version') && this.current !== 'in-room') {
        this.stop(msg.message);
        return;
      }
      this.on.message(msg);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      window.clearTimeout(this.timeout);
      this.ws = null;
      // 4000: este navegador ha entrado desde otra pestaña; 4001: otra versión. No se insiste.
      if (e.code === 4000) return this.stop('Has entrado desde otra pestaña.');
      if (e.code === 4001) return this.stop('Versión del juego distinta: recarga la página.');
      this.lost();
    };
  }

  private lost(): void {
    if (!this.wanted) return;
    // Nunca llegó a entrar: un reintento y, si tampoco, se dice y se sigue sin conexión.
    if (!this.code && this.attempt >= 1) return this.stop('No se puede conectar con el servidor. Sigues jugando sin conexión.');
    const wait = BACKOFF[Math.min(this.attempt, BACKOFF.length - 1)];
    this.attempt += 1;
    this.set('reconnecting', `Sin conexión. Reintentando en ${Math.round(wait / 1000)} s…`);
    this.retry = window.setTimeout(() => this.dial('reconnecting'), wait);
  }

  private stop(detail: string): void {
    window.clearTimeout(this.retry);
    window.clearTimeout(this.timeout);
    this.wanted = null;
    this.code = '';
    this.seq = 0;
    remember(null);
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      ws.onopen = null;
      ws.close();
    }
    this.set('offline', detail);
  }

  private send(msg: ClientMsg): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  private set(state: OnlineState, detail: string): void {
    this.current = state;
    this.on.state(state, detail);
  }
}
