import { PLAYER_SPEED } from '../config/constants';
import type { Facing } from '../types/game';
import { CHAT_HISTORY, CHAT_MAX, decodeLook, encodeLook, type ChatMsg, type LookDTO, type PlayerView, type Pose, type ServerMsg } from '../net/protocol';
import { OnlineClient, rememberedRoom, type OnlineState } from '../net/OnlineClient';
import type { RemotePlayers } from '../world/RemotePlayers';

/**
 * Alpha-06 · el modo online, opcional: un botón «Online» abre este panel (DOM, encima del juego, sin pararlo).
 * Fuera de sala: crear una privada o entrar con su código. Dentro: el código para pasarlo, quién está y cómo
 * (conectado, reconectando), el chat de la sala, bloquear a alguien (sólo en este navegador) y salir.
 *
 * La sala vive aquí, no en la escena: la escena se rehace al cruzar una puerta y vuelve a pedir los avatares
 * (bind). Lo único que sale de la partida es el nombre, el aspecto y dónde está el avatar (ONLINE_SEND_HZ veces por
 * segundo como mucho y sólo si cambia); el resto (dinero, día, NPC, guardado) no viaja.
 */
const ONLINE_SEND_HZ = 10;
/** El invitado sin conexión (etapa 0): no es una sesión del servidor, ni se manda, ni se guarda. */
const GUEST = 'guest-local';
const KEEPALIVE_MS = 2000;

const STATE_TEXT: Readonly<Record<OnlineState, string>> = {
  offline: 'Sin conexión',
  connecting: 'Conectando',
  joining: 'Entrando',
  'in-room': 'Conectado',
  reconnecting: 'Reconectando',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface OnlineHooks {
  /** Nombre y aspecto (ids de catálogo) de quien juega aquí. */
  identity(): { name: string; look: LookDTO };
  /** Un campo del panel coge (true) o suelta (false) el foco: el juego deja o vuelve a escuchar el teclado. */
  typing(on: boolean): void;
}

export class OnlinePanel {
  private readonly root: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly client: OnlineClient;
  private open = false;
  private detail = '';
  private you = '';
  private readonly players = new Map<string, PlayerView>();
  private chat: ChatMsg[] = [];
  private readonly blocked = new Set<string>();
  private remotes: RemotePlayers | null = null;
  private unread = 0;
  private lastSent: { pose: Pose; at: number } | null = null;
  private lastPos: { x: number; y: number; at: number } | null = null;
  private typingNow = false;
  private stale = false;
  private draft = '';
  private logEl: HTMLOListElement | null = null;
  /** Alguien que te ha pasado su aspecto: de pie a tu lado, sin conexión (no es una persona conectada). */
  private guest: PlayerView | null = null;
  private here: { zone: string; x: number; y: number } | null = null;
  private myCode = '';

  private readonly identityNow: OnlineHooks['identity'];

  constructor(parent: HTMLElement, url: string | null, hooks: OnlineHooks) {
    this.identityNow = hooks.identity;
    this.button = el('button', 'online-button', 'Online');
    this.button.type = 'button';
    this.button.setAttribute('aria-label', 'Jugar online con alguien (beta)');
    this.root = el('section', 'online');
    this.root.setAttribute('aria-label', 'Online');
    this.root.hidden = true;
    parent.append(this.button, this.root);
    this.button.addEventListener('click', () => {
      this.button.blur();
      this.toggle(!this.open);
    });
    // Las teclas que se escriben aquí no llegan al juego (como en el móvil).
    this.root.addEventListener('focusin', (e) => {
      if (!(e.target instanceof HTMLInputElement) || this.typingNow) return;
      this.typingNow = true;
      hooks.typing(true);
    });
    this.root.addEventListener('focusout', (e) => {
      if (!(e.target instanceof HTMLInputElement)) return;
      if (e.relatedTarget instanceof HTMLInputElement && this.root.contains(e.relatedTarget)) return;
      this.typingNow = false;
      hooks.typing(false);
      if (this.stale) this.render();
    });
    this.root.addEventListener('keydown', (e) => {
      // Esc sale del campo (y no llega al juego: no abre la pausa).
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      (document.activeElement as HTMLElement | null)?.blur();
    });
    this.client = new OnlineClient(url, hooks.identity, {
      state: (_s, detail) => {
        this.detail = detail;
        if (this.client.state === 'offline') this.forget();
        this.render(true);
      },
      room: (_code, you, players, chat) => {
        this.you = you;
        this.players.clear();
        for (const p of players) this.players.set(p.session, p);
        this.chat = chat;
        this.remotes?.reset(this.roster(), you);
        this.lastSent = null;
        this.render(true);
      },
      message: (msg) => this.onMessage(msg),
    });
    this.render();
    // Recargada la pestaña dentro de una sala: se vuelve a ella (el servidor devuelve la misma sesión, sin clon).
    const again = rememberedRoom();
    if (again && url) this.client.join(again);
  }

  get isTyping(): boolean {
    return this.typingNow;
  }

  readonly isBlocked = (session: string): boolean => this.blocked.has(session);

  /** La escena (otra vez, tras una puerta) pide los avatares de la sala. */
  bind(remotes: RemotePlayers | null): void {
    this.remotes = remotes;
    this.lastSent = null;
    remotes?.reset(this.roster(), this.you);
  }

  /** Quién se pinta: la sala y, si lo hay, el invitado sin conexión. */
  private roster(): PlayerView[] {
    return this.guest ? [...this.players.values(), this.guest] : [...this.players.values()];
  }

  /** Cada fotograma: los demás se mueven; lo propio se manda como mucho ONLINE_SEND_HZ veces por segundo y si cambia. */
  update(zone: string, x: number, y: number, f: Facing): void {
    this.remotes?.update();
    this.here = { zone, x, y };
    if (this.client.state !== 'in-room') return;
    const now = performance.now();
    const prev = this.lastPos;
    const speed = prev && now > prev.at ? (Math.hypot(x - prev.x, y - prev.y) / (now - prev.at)) * 1000 : 0;
    this.lastPos = { x, y, at: now };
    const last = this.lastSent;
    if (last && now - last.at < 1000 / ONLINE_SEND_HZ) return;
    const pose: Pose = { zone, x: Math.round(x), y: Math.round(y), f, m: speed < 5 ? 0 : speed > PLAYER_SPEED * 1.25 ? 2 : 1 };
    const same = last && last.pose.zone === pose.zone && last.pose.x === pose.x && last.pose.y === pose.y && last.pose.f === pose.f && last.pose.m === pose.m;
    if (same && now - last.at < KEEPALIVE_MS) return;
    this.client.move(pose);
    this.lastSent = { pose, at: now };
  }

  private onMessage(msg: ServerMsg): void {
    if (msg.t === 'joined') {
      this.players.set(msg.player.session, msg.player);
      this.remotes?.upsert(msg.player);
      this.note(`${msg.player.name} ha entrado.`);
    } else if (msg.t === 'left') {
      const p = this.players.get(msg.session);
      this.players.delete(msg.session);
      this.remotes?.remove(msg.session);
      if (p) this.note(`${p.name} se ha ido.`);
    } else if (msg.t === 'presence') {
      const p = this.players.get(msg.session);
      if (p) p.presence = msg.presence;
      this.remotes?.presence(msg.session, msg.presence);
    } else if (msg.t === 'moved') {
      const p = this.players.get(msg.session);
      const zoneChanged = p?.pose?.zone !== msg.pose.zone;
      if (p) p.pose = msg.pose;
      this.remotes?.moved(msg.session, msg.pose);
      if (!zoneChanged) return; // el panel no se repinta por cada paso; sí cuando cambia de sitio
    } else if (msg.t === 'chat') {
      if (this.chat.some((c) => c.id === msg.msg.id)) return;
      this.chat.push(msg.msg);
      if (this.chat.length > CHAT_HISTORY) this.chat.splice(0, this.chat.length - CHAT_HISTORY);
      if (!this.open && msg.msg.from !== this.you && !this.blocked.has(msg.msg.from)) this.unread += 1;
    } else if (msg.t === 'error') {
      this.detail = msg.message;
    }
    this.render();
  }

  /** Un aviso del propio panel en el chat (quién entra, quién se va): sólo aquí, no se manda. */
  private note(text: string): void {
    this.chat.push({ id: `note-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, from: 'system', name: '', text, at: Date.now() });
  }

  private forget(): void {
    this.you = '';
    this.players.clear();
    this.chat = [];
    this.unread = 0;
    // Fuera de la sala sólo queda el invitado (si lo hay).
    this.remotes?.reset(this.roster(), '');
  }

  /** Pegado un código de aspecto: aparece a tu lado, con «invitado · sin conexión» en la etiqueta. */
  private invite(raw: string): void {
    const shared = decodeLook(raw);
    if (!shared) {
      this.detail = 'Ese código no es un aspecto de LIFE//SIM.';
      return this.render(true);
    }
    if (!this.here) {
      this.detail = 'Entra en la ciudad para invitar a alguien.';
      return this.render(true);
    }
    this.remotes?.remove(GUEST);
    this.guest = {
      session: GUEST,
      name: `${shared.name} · invitado (sin conexión)`,
      look: shared.look,
      presence: 'connected',
      pose: { zone: this.here.zone, x: Math.round(this.here.x) + 20, y: Math.round(this.here.y), f: 'left', m: 0 },
    };
    this.remotes?.upsert(this.guest);
    this.detail = `${shared.name} está a tu lado. Es sólo su aspecto: no está conectado ni te oye.`;
    this.render(true);
  }

  private toggle(on: boolean): void {
    this.open = on;
    this.root.hidden = !on;
    this.button.classList.toggle('is-active', on);
    if (on) this.unread = 0;
    else (document.activeElement as HTMLElement | null)?.blur?.();
    this.render(true);
  }

  /**
   * Con el foco en un campo, repintarlo todo borraría lo que se está escribiendo (y un acento a medias): entonces
   * sólo se pone al día la lista del chat y el resto espera a soltar el campo. `force`: cambia el estado de la sala.
   */
  private render(force = false): void {
    const state = this.client.state;
    this.button.textContent = this.unread ? `Online · ${this.unread}` : state === 'in-room' ? `Online · ${this.players.size}` : 'Online';
    this.button.classList.toggle('is-live', state === 'in-room');
    if (!this.open) return;
    if (this.typingNow && !force && this.logEl?.isConnected) {
      this.fillLog(this.logEl);
      this.stale = true;
      return;
    }
    this.stale = false;
    const wasTyping = this.typingNow ? (document.activeElement as HTMLInputElement | null)?.name : undefined;

    const head = el('header', 'online__head');
    head.append(el('b', '', 'Online (beta)'), el('span', `online__state is-${state}`, STATE_TEXT[state]));
    const close = el('button', 'online__close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'Cerrar el panel (sigues en la sala)');
    close.addEventListener('click', () => this.toggle(false));
    head.append(close);
    const parts: HTMLElement[] = [head];
    if (this.detail) parts.push(el('p', 'online__detail', this.detail));
    this.logEl = null;

    if (!this.client.available) {
      parts.push(el('p', 'online__hint', 'Esta versión no tiene servidor online: no se puede jugar con otra persona conectada. Sí puedes pasar tu aspecto e invitar el de alguien, sin conexión.'), this.offlineShare());
    } else if (state === 'offline') {
      parts.push(el('p', 'online__hint', 'Juega con alguien en la misma ciudad: os veis andar y podéis escribiros. Cada uno sigue con su partida, su dinero y su hora; sólo se comparte el nombre, el aspecto, dónde estáis y el chat.'));
      const create = el('button', 'online__action', 'Crear sala privada');
      create.type = 'button';
      create.addEventListener('click', () => this.client.create());
      const form = el('form', 'online__join');
      const code = el('input', 'online__field');
      code.name = 'code';
      code.placeholder = 'Código (6 letras)';
      code.maxLength = 12;
      code.autocomplete = 'off';
      code.autocapitalize = 'characters';
      code.setAttribute('aria-label', 'Código de la sala');
      const join = el('button', 'online__action', 'Entrar');
      join.type = 'submit';
      form.append(code, join);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (code.value.trim()) this.client.join(code.value);
      });
      parts.push(create, form, this.offlineShare());
    } else if (!this.players.size) {
      parts.push(el('p', 'online__hint', 'Un momento…'));
    } else {
      const code = el('p', 'online__code');
      code.append('Sala ', el('b', '', this.client.roomCode), ' · pásale el código a quien quieras que entre.');
      const list = el('ul', 'online__people');
      for (const p of this.players.values()) {
        const li = el('li', `online__person is-${p.presence}`);
        li.append(el('span', 'online__dot'), el('b', '', p.session === this.you ? `${p.name} (tú)` : p.name), el('span', 'online__where', p.presence === 'reconnecting' ? 'reconectando…' : p.pose ? p.pose.zone : 'aún sin moverse'));
        if (p.session !== this.you) {
          const block = el('button', 'online__mini', this.blocked.has(p.session) ? 'Desbloquear' : 'Bloquear');
          block.type = 'button';
          block.title = 'Sólo en este navegador: deja de ver su avatar y sus mensajes';
          block.addEventListener('click', () => {
            if (this.blocked.has(p.session)) this.blocked.delete(p.session);
            else this.blocked.add(p.session);
            this.render(true);
          });
          li.append(block);
        }
        list.append(li);
      }
      const log = el('ol', 'online__chat');
      this.logEl = log;
      this.fillLog(log);
      const form = el('form', 'online__send');
      const field = el('input', 'online__field');
      field.name = 'chat';
      field.placeholder = state === 'in-room' ? 'Escribe a la sala…' : 'Sin conexión: espera…';
      field.maxLength = CHAT_MAX * 4;
      field.autocomplete = 'off';
      field.enterKeyHint = 'send';
      field.disabled = state !== 'in-room';
      field.value = this.draft;
      field.setAttribute('aria-label', 'Mensaje para la sala');
      field.addEventListener('input', () => (this.draft = field.value));
      const send = el('button', 'online__action', 'Enviar');
      send.type = 'submit';
      send.disabled = state !== 'in-room';
      form.append(field, send);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.client.chat(field.value)) {
          this.draft = '';
          field.value = '';
          this.detail = '';
        } else if (!field.value.trim()) this.detail = 'El mensaje está vacío.';
        else this.detail = 'Sin conexión: no se ha enviado.';
      });
      const leave = el('button', 'online__leave', 'Salir de la sala');
      leave.type = 'button';
      leave.addEventListener('click', () => this.client.leave());
      parts.push(code, list, log, form, leave);
    }
    this.root.replaceChildren(...parts);
    if (wasTyping) this.root.querySelector<HTMLInputElement>(`input[name="${wasTyping}"]:not(:disabled)`)?.focus();
  }

  /** Etapa 0, sin red: pasar tu aspecto como texto e invitar el de otra persona como figura sin conexión. */
  private offlineShare(): HTMLElement {
    const box = el('div', 'online__share');
    box.append(el('b', 'online__share-title', 'Sin conexión'));
    const mine = el('button', 'online__action', 'Copiar mi aspecto');
    mine.type = 'button';
    const out = el('input', 'online__field');
    out.name = 'mine';
    out.readOnly = true;
    out.value = this.myCode;
    out.hidden = !this.myCode;
    out.setAttribute('aria-label', 'Tu código de aspecto');
    mine.addEventListener('click', () => {
      // Nombre y aspecto, nada más: ni dinero, ni bolsa, ni relaciones, ni el id del navegador.
      const { name, look } = this.identityNow();
      this.myCode = encodeLook(name, look);
      out.value = this.myCode;
      out.hidden = false;
      out.select();
      const done = (ok: boolean): void => {
        this.detail = ok ? 'Código copiado: pégaselo a quien quieras.' : 'Cópialo a mano (ya está seleccionado).';
        const d = this.root.querySelector('.online__detail');
        if (d) d.textContent = this.detail;
        else this.render(true);
      };
      navigator.clipboard?.writeText(this.myCode).then(() => done(true), () => done(false)) ?? done(false);
    });
    const form = el('form', 'online__join');
    const code = el('input', 'online__field');
    code.name = 'guest';
    code.placeholder = 'Pega el código de alguien';
    code.autocomplete = 'off';
    code.maxLength = 2048;
    code.setAttribute('aria-label', 'Código de aspecto de otra persona');
    const add = el('button', 'online__action', 'Invitar');
    add.type = 'submit';
    form.append(code, add);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.invite(code.value);
    });
    box.append(mine, out, form);
    if (this.guest) {
      const bye = el('button', 'online__leave', `Despedir a ${this.guest.name.split(' · ')[0]}`);
      bye.type = 'button';
      bye.addEventListener('click', () => {
        this.remotes?.remove(GUEST);
        this.guest = null;
        this.detail = '';
        this.render(true);
      });
      box.append(bye);
    }
    return box;
  }

  private fillLog(log: HTMLOListElement): void {
    const visible = this.chat.filter((m) => !this.blocked.has(m.from));
    const items = visible.map((m) => {
      const li = el('li', m.from === 'system' ? 'online__msg is-system' : `online__msg${m.from === this.you ? ' is-me' : ''}`);
      // Todo como texto: nombres y mensajes llegan de otras personas.
      if (m.from !== 'system') li.append(el('b', '', m.from === this.you ? 'Tú' : m.name), ' ');
      li.append(m.text, el('time', '', new Date(m.at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })));
      return li;
    });
    if (!items.length) items.push(el('li', 'online__empty', 'Aún no hay mensajes. Lo que escribís aquí no se guarda: desaparece al cerrar la sala.'));
    log.replaceChildren(...items);
    log.scrollTop = log.scrollHeight;
  }
}
