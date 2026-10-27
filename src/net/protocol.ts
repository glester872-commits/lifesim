/**
 * Alpha-06 · contrato de red entre el navegador (net/OnlineClient) y el servidor de salas (server/index.ts).
 * Sin imports: lo cargan los dos lados tal cual. Todo lo que entra por la red pasa por aquí antes de usarse;
 * lo que no encaja se tira (null), nunca se «arregla» a medias.
 *
 * Compartido: presencia, zona, posición y orientación del avatar, su aspecto (ids de catálogo) y el chat de la sala.
 * Local de cada partida (nunca viaja): dinero, inventario, relaciones, misiones, NPC, día y hora de la simulación.
 */

export const PROTOCOL_VERSION = 1;
/** Bytes por mensaje como mucho (el servidor corta la conexión si llega uno mayor). */
export const MAX_FRAME = 4096;
export const ROOM_CODE_LENGTH = 6;
/** Sin 0/O, 1/I/L: se dicta por teléfono sin dudas. */
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const MAX_PLAYERS = 4;
export const CHAT_MAX = 280;
export const NAME_MAX = 16;
/** Mensajes de chat guardados por sala, sólo en memoria. */
export const CHAT_HISTORY = 50;
/** Mundo en píxeles: fuera de esto no hay mapa. */
export const WORLD_MAX = 16384;
/** Más rápido que corriendo en bici, con margen: lo que pase de aquí sin cambiar de zona es un teletransporte. */
export const MAX_SPEED = 600;
export const SPEED_SLACK = 64;

export type Facing = 'up' | 'down' | 'left' | 'right';
/** 0 quieto, 1 andando, 2 corriendo. */
export type Motion = 0 | 1 | 2;
export type Presence = 'connected' | 'reconnecting';

/** Aspecto del avatar: los ids de catálogo de data/appearance (el cliente los vuelve a validar contra el catálogo). */
export interface LookDTO {
  hair?: string;
  top?: string;
  bottom?: string;
  shoes?: string;
  skin?: string;
  hairColor?: string;
  eyes?: string;
}

export interface Pose {
  zone: string;
  x: number;
  y: number;
  f: Facing;
  m: Motion;
}

export interface PlayerView {
  /** Id de sesión en la sala (no el id del navegador, que no sale del servidor). */
  session: string;
  name: string;
  look: LookDTO;
  presence: Presence;
  pose: Pose | null;
}

export interface ChatMsg {
  id: string;
  from: string;
  name: string;
  text: string;
  /** Hora del servidor (ms), no la del juego: cada uno tiene su propio día y hora. */
  at: number;
}

export type ClientMsg =
  | { t: 'hello'; v: number; playerId: string; name: string; look: LookDTO }
  | { t: 'create' }
  | { t: 'join'; code: string }
  | { t: 'move'; seq: number; pose: Pose }
  | { t: 'chat'; id: string; text: string }
  | { t: 'leave' };

export type ErrorCode = 'version' | 'hello' | 'bad' | 'room' | 'full' | 'rate' | 'speed' | 'chat';

export type ServerMsg =
  | { t: 'room'; code: string; you: string; players: PlayerView[]; chat: ChatMsg[] }
  | { t: 'joined'; player: PlayerView }
  | { t: 'presence'; session: string; presence: Presence }
  | { t: 'left'; session: string }
  | { t: 'moved'; session: string; seq: number; pose: Pose }
  | { t: 'chat'; msg: ChatMsg }
  | { t: 'error'; code: ErrorCode; message: string };

// ================================================================
// VALIDACIÓN
// ================================================================

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
const ZONE_RE = /^[a-z0-9:_-]{1,64}$/;
const LOOK_ID_RE = /^[a-z0-9_-]{1,32}$/;
const LOOK_KEYS = ['hair', 'top', 'bottom', 'shoes', 'skin', 'hairColor', 'eyes'] as const;
const FACINGS: readonly Facing[] = ['up', 'down', 'left', 'right'];

function graphemes(text: string): string[] {
  return typeof Intl !== 'undefined' && 'Segmenter' in Intl ? [...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(text)].map((x) => x.segment) : [...text];
}

/**
 * Texto de una línea tal como se guarda y se reparte: sin caracteres de control, invisibles ni giros de dirección
 * (bidi), sin espacios en los bordes y cortado en `max` caracteres sin partir un emoji. Es texto: se pinta con
 * textContent, nunca como HTML.
 */
export function cleanLine(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  const kept = raw.normalize('NFC').replace(/[\u0000-\u001f\u007f\u200b\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g, '');
  return graphemes(kept).slice(0, max).join('').trim();
}

export const isId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v);
export const isRoomCode = (v: unknown): v is string => typeof v === 'string' && v.length === ROOM_CODE_LENGTH && [...v].every((c) => ROOM_ALPHABET.includes(c));
/** Lo que escribe la gente al dictar un código: minúsculas, espacios, guiones. */
export const normalizeCode = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function parseLook(v: unknown): LookDTO {
  const out: LookDTO = {};
  if (!isRecord(v)) return out;
  for (const k of LOOK_KEYS) {
    const val = v[k];
    if (typeof val === 'string' && LOOK_ID_RE.test(val)) out[k] = val;
  }
  return out;
}

export function parsePose(v: unknown): Pose | null {
  if (!isRecord(v)) return null;
  const { zone, x, y, f, m } = v;
  if (typeof zone !== 'string' || !ZONE_RE.test(zone)) return null;
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || y < 0 || x > WORLD_MAX || y > WORLD_MAX) return null;
  if (!FACINGS.includes(f as Facing) || (m !== 0 && m !== 1 && m !== 2)) return null;
  return { zone, x: Math.round(x), y: Math.round(y), f: f as Facing, m };
}

function parseJson(raw: string, limit: number): Record<string, unknown> | null {
  if (raw.length > limit) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return isRecord(v) ? v : null;
  } catch {
    return null;
  }
}

/** Un mensaje del navegador, o null si no es exactamente uno de los que existen. */
export function parseClient(raw: string): ClientMsg | null {
  const v = parseJson(raw, MAX_FRAME);
  if (!v) return null;
  switch (v.t) {
    case 'hello': {
      const name = cleanLine(v.name, NAME_MAX);
      if (typeof v.v !== 'number' || !isId(v.playerId) || !name) return null;
      return { t: 'hello', v: v.v, playerId: v.playerId, name, look: parseLook(v.look) };
    }
    case 'create':
    case 'leave':
      return { t: v.t };
    case 'join':
      return typeof v.code === 'string' && isRoomCode(normalizeCode(v.code)) ? { t: 'join', code: normalizeCode(v.code) } : null;
    case 'move': {
      const pose = parsePose(v.pose);
      return pose && Number.isSafeInteger(v.seq) && (v.seq as number) >= 0 ? { t: 'move', seq: v.seq as number, pose } : null;
    }
    case 'chat':
      return isId(v.id) && typeof v.text === 'string' ? { t: 'chat', id: v.id, text: v.text } : null;
    default:
      return null;
  }
}

function parsePlayer(v: unknown): PlayerView | null {
  if (!isRecord(v) || !isId(v.session)) return null;
  const name = cleanLine(v.name, NAME_MAX);
  if (!name || (v.presence !== 'connected' && v.presence !== 'reconnecting')) return null;
  return { session: v.session, name, look: parseLook(v.look), presence: v.presence, pose: v.pose === null ? null : parsePose(v.pose) };
}

function parseChatMsg(v: unknown): ChatMsg | null {
  if (!isRecord(v) || !isId(v.id) || !isId(v.from) || typeof v.at !== 'number') return null;
  const text = cleanLine(v.text, CHAT_MAX);
  const name = cleanLine(v.name, NAME_MAX);
  return text && name ? { id: v.id, from: v.from, name, text, at: v.at } : null;
}

const ERROR_CODES: readonly ErrorCode[] = ['version', 'hello', 'bad', 'room', 'full', 'rate', 'speed', 'chat'];

/** Lo que manda el servidor, revisado igual: un servidor roto o suplantado no mete HTML ni datos raros en el juego. */
export function parseServer(raw: string): ServerMsg | null {
  const v = parseJson(raw, 64 * 1024);
  if (!v) return null;
  switch (v.t) {
    case 'room': {
      if (!isRoomCode(v.code) || !isId(v.you) || !Array.isArray(v.players) || !Array.isArray(v.chat)) return null;
      const players = v.players.map(parsePlayer).filter((p): p is PlayerView => p !== null).slice(0, MAX_PLAYERS);
      const chat = v.chat.map(parseChatMsg).filter((m): m is ChatMsg => m !== null).slice(-CHAT_HISTORY);
      return { t: 'room', code: v.code, you: v.you, players, chat };
    }
    case 'joined': {
      const player = parsePlayer(v.player);
      return player ? { t: 'joined', player } : null;
    }
    case 'presence':
      return isId(v.session) && (v.presence === 'connected' || v.presence === 'reconnecting') ? { t: 'presence', session: v.session, presence: v.presence } : null;
    case 'left':
      return isId(v.session) ? { t: 'left', session: v.session } : null;
    case 'moved': {
      const pose = parsePose(v.pose);
      return isId(v.session) && pose && Number.isSafeInteger(v.seq) ? { t: 'moved', session: v.session, seq: v.seq as number, pose } : null;
    }
    case 'chat': {
      const msg = parseChatMsg(v.msg);
      return msg ? { t: 'chat', msg } : null;
    }
    case 'error':
      return ERROR_CODES.includes(v.code as ErrorCode) && typeof v.message === 'string' ? { t: 'error', code: v.code as ErrorCode, message: cleanLine(v.message, 200) } : null;
    default:
      return null;
  }
}

/** Un movimiento posible desde el anterior: misma zona y a velocidad de persona, o cambio de zona (puerta, metro). */
export function plausibleMove(prev: { pose: Pose; at: number } | null, next: Pose, at: number): boolean {
  if (!prev || prev.pose.zone !== next.zone) return true;
  const dt = Math.max(0, at - prev.at) / 1000;
  return Math.hypot(next.x - prev.pose.x, next.y - prev.pose.y) <= MAX_SPEED * dt + SPEED_SLACK;
}

// ================================================================
// ASPECTO PARA COMPARTIR SIN RED (Alpha-06, etapa 0)
// ================================================================

/** Un aspecto pasado a mano (mensaje, correo): nombre y ids de catálogo, nada de la partida. Versionado. */
export interface SharedLook {
  v: 1;
  name: string;
  look: LookDTO;
}

export const LOOK_CODE_PREFIX = 'LIFESIM-ASPECTO-1:';
const LOOK_CODE_MAX = 1024;

const toBase64Url = (text: string): string => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (code: string): string => {
  const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export function encodeLook(name: string, look: LookDTO): string {
  const shared: SharedLook = { v: 1, name: cleanLine(name, NAME_MAX) || 'Invitado', look: parseLook(look) };
  return LOOK_CODE_PREFIX + toBase64Url(JSON.stringify(shared));
}

/** Lo pegado por alguien: el código tal cual (con espacios o saltos alrededor) o null si no es uno válido. */
export function decodeLook(raw: unknown): SharedLook | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/\s+/g, '');
  if (text.length > LOOK_CODE_MAX || !text.startsWith(LOOK_CODE_PREFIX)) return null;
  try {
    const v = parseJson(fromBase64Url(text.slice(LOOK_CODE_PREFIX.length)), LOOK_CODE_MAX);
    if (!v || v.v !== 1) return null;
    const name = cleanLine(v.name, NAME_MAX);
    return name ? { v: 1, name, look: parseLook(v.look) } : null;
  } catch {
    return null;
  }
}
