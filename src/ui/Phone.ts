import type { GameState } from '../state/GameState';
import { getNpc } from '../data/npcs';
import { NAMED_PEOPLE } from '../data/namedPeople';
import {
  activePlan, contactsOf, PLAN_KINDS, phoneOptions, placeName, stampLabel, unreadTotal, whenLabel,
  type Contact, type NpcStatus, type PhoneActionId, type PhoneNews, type SocialPlan,
} from '../systems/Phone';
import { createSocialProfile, type ContactState } from '../systems/Social';

/**
 * El móvil (tecla P o su botón): una capa de DOM encima del juego, como el menú y el mapa. Pinta lo que hay en
 * GameState (systems/Phone: hilos y planes; systems/Social: con quién y qué relación) y le pide a la Scene que
 * mande o marque leído (PhoneHost): ella sabe qué hora es y qué está haciendo cada uno.
 *
 * Abierto, el jugador se para y el mundo sigue: así las respuestas llegan mientras miras. Se elige con el ratón,
 * el dedo o el teclado (W/S, E, 1–9; Esc vuelve atrás y, en el inicio, lo cierra).
 */

export interface PhoneHost {
  /** Minuto absoluto del juego. */
  now(): number;
  status(npc: string): NpcStatus;
  send(npc: string, action: PhoneActionId): void;
  read(npc: string): void;
}

type Screen = { app: 'home' } | { app: 'contacts' } | { app: 'messages' } | { app: 'thread'; npc: string };

interface Item {
  el: HTMLElement;
  run: () => void;
}

const nameOf = (npc: string): string => {
  try {
    return getNpc(npc).name;
  } catch {
    return npc;
  }
};

const STATUS_TEXT: Readonly<Record<NpcStatus['state'], string>> = {
  free: 'en línea',
  home: 'en línea',
  commuting: 'últ. vez hace un rato',
  busy: 'últ. vez hace un rato',
  asleep: 'últ. vez anoche',
};

/** Sin su número, por qué, en la agenda. */
const NO_NUMBER: Readonly<Record<ContactState, string>> = {
  UNKNOWN: 'sin su número',
  MET: 'sin su número',
  KNOWN: 'sin su número',
  REQUEST_AVAILABLE: 'sin su número',
  NOT_YET: 'te dijo que aún no',
  REJECTED: 'no quiso darte su número',
  EXCHANGED: '',
};

/** Y en la conversación, cómo conseguirlo. */
const HOW_TO_GET: Readonly<Record<ContactState, string>> = {
  UNKNOWN: 'Aún no os conocéis.',
  MET: 'Os habéis visto poco. Hablad un poco más antes de pedirle el número.',
  KNOWN: 'Todavía no hay tanta confianza como para pedirle el número.',
  REQUEST_AVAILABLE: 'Pídeselo la próxima vez que {la} veas.',
  NOT_YET: 'Te dijo que aún no. Dale un día antes de volver a pedírselo.',
  REJECTED: 'No quiso darte su número. Mejor dejarlo unos días.',
  EXCHANGED: '',
};

const PLAN_STATE: Readonly<Partial<Record<SocialPlan['status'], string>>> = {
  proposed: 'Propuesto',
  accepted: 'Quedáis',
};

export class PhoneScreen {
  private readonly root: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly badge: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly state: GameState;
  private readonly blocked: () => boolean;
  private readonly screenEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly clockEl: HTMLElement;
  private host: PhoneHost | null = null;
  private screen: Screen = { app: 'home' };
  /** A dónde vuelve una conversación al darle atrás. */
  private cameFrom: 'contacts' | 'messages' = 'messages';
  private items: Item[] = [];
  private selected = 0;
  private opened = false;
  private toastTimer: number | undefined;

  constructor(root: HTMLElement, button: HTMLButtonElement, toast: HTMLElement, state: GameState, blocked: () => boolean) {
    this.root = root;
    this.button = button;
    this.toast = toast;
    this.state = state;
    this.blocked = blocked;
    root.innerHTML = `
      <div class="phone__device" role="dialog" aria-label="Móvil">
        <header class="phone__bar"><span class="phone__clock"></span><span class="phone__title"></span><span class="phone__signal" aria-hidden="true">▂▄▆</span></header>
        <div class="phone__screen"></div>
        <nav class="phone__nav">
          <button type="button" data-act="back" aria-label="Atrás (Esc)">‹</button>
          <button type="button" data-act="home" aria-label="Inicio">○</button>
          <button type="button" data-act="close" aria-label="Cerrar el móvil (P)">✕</button>
        </nav>
      </div>
    `;
    const pick = (s: string): HTMLElement => {
      const el = root.querySelector<HTMLElement>(s);
      if (!el) throw new Error(`Móvil: falta ${s}`);
      return el;
    };
    this.screenEl = pick('.phone__screen');
    this.titleEl = pick('.phone__title');
    this.clockEl = pick('.phone__clock');
    this.badge = document.createElement('span');
    this.badge.className = 'phone-button__badge';
    button.append(this.badge);

    button.addEventListener('click', () => {
      // Sin foco en el botón: Espacio o Intro no deben volver a pulsarlo mientras se juega.
      button.blur();
      if (this.opened) this.close();
      else this.open();
    });
    pick('.phone__nav').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      b?.blur();
      const act = b?.dataset.act;
      if (act === 'back') this.back();
      else if (act === 'home') this.go({ app: 'home' });
      else if (act === 'close') this.close();
    });
    // Tocar la notificación abre esa conversación.
    toast.addEventListener('click', () => {
      const npc = toast.dataset.npc;
      this.hideToast();
      if (!npc) return;
      if (!this.opened) this.open();
      if (this.opened) this.go({ app: 'thread', npc });
    });

    state.on('phone', (news: readonly PhoneNews[]) => this.onPhone(news));
    state.on('social', () => this.refresh());
    state.on('change', () => this.renderClock());
    this.renderBadge();
  }

  /** La Scene que lo atiende; sin ella (cambiando de sitio) no se abre. */
  attach(host: PhoneHost | null): void {
    this.host = host;
    if (!host) this.close();
  }

  get isOpen(): boolean {
    return this.opened;
  }

  open(): void {
    if (this.opened || !this.host || this.blocked()) return;
    this.opened = true;
    this.root.classList.add('is-open');
    this.button.classList.add('is-active');
    this.hideToast();
    this.go({ app: 'home' });
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.root.classList.remove('is-open');
    this.button.classList.remove('is-active');
  }

  /** Esc: una pantalla atrás; en el inicio, cerrar. */
  back(): void {
    const s = this.screen;
    if (s.app === 'home') this.close();
    else if (s.app === 'thread') this.go({ app: this.cameFrom });
    else this.go({ app: 'home' });
  }

  move(delta: number): void {
    if (!this.items.length) return;
    this.selected = (this.selected + delta + this.items.length) % this.items.length;
    this.mark();
  }

  confirm(): void {
    this.items[this.selected]?.run();
  }

  /** Teclas 1–9 en una conversación: cada respuesta tiene su número. */
  pick(index: number): void {
    if (this.screen.app !== 'thread') return;
    this.items.filter((i) => i.el.classList.contains('phone__reply'))[index]?.run();
  }

  /** Un aviso suelto (te ha dado su número), con el mismo material que los mensajes. */
  notify(npc: string, text: string): void {
    this.showToast(npc, nameOf(npc), text);
  }

  // ------------------------------------------------------------ pantallas

  private go(screen: Screen): void {
    if (screen.app === 'contacts' || screen.app === 'messages') this.cameFrom = screen.app;
    const same = JSON.stringify(screen) === JSON.stringify(this.screen);
    this.screen = screen;
    if (screen.app === 'thread') this.host?.read(screen.npc);
    this.render(same ? this.selected : 0);
  }

  private refresh(): void {
    if (this.opened) this.render(this.selected);
  }

  private onPhone(news: readonly PhoneNews[]): void {
    this.renderBadge();
    const s = this.screen;
    const reading = this.opened && s.app === 'thread' ? s.npc : null;
    // Lo que llega a la conversación abierta se lee al momento; lo demás avisa una vez.
    if (reading && news.some((n) => n.npc === reading)) this.host?.read(reading);
    const last = news.filter((n) => n.npc !== reading).at(-1);
    if (last) this.showToast(last.npc, last.plan ? `${nameOf(last.npc)} · plan` : nameOf(last.npc), last.text);
    this.refresh();
  }

  private render(keep: number): void {
    if (!this.opened) return;
    this.renderClock();
    this.items = [];
    const s = this.screen;
    this.screenEl.dataset.app = s.app;
    if (s.app === 'home') this.renderHome();
    else if (s.app === 'contacts') this.renderContacts();
    else if (s.app === 'messages') this.renderMessages();
    else this.renderThread(s.npc);
    this.selected = Math.min(Math.max(0, keep), Math.max(0, this.items.length - 1));
    this.mark();
  }

  private renderHome(): void {
    this.titleEl.textContent = '';
    const unread = unreadTotal(this.state.phone);
    const grid = el('div', 'phone__apps');
    const app = (glyph: string, label: string, run: (() => void) | null, badge = 0): void => {
      const b = el('button', `phone__app${run ? '' : ' is-soon'}`) as HTMLButtonElement;
      b.type = 'button';
      b.append(el('span', 'phone__app-icon', glyph), el('span', 'phone__app-label', label));
      if (badge) b.append(el('span', 'phone__badge', String(badge)));
      if (run) this.item(b, run);
      else {
        // Decorativas: se ven, no hacen nada todavía.
        b.disabled = true;
        b.title = 'Próximamente';
      }
      grid.append(b);
    };
    app('✉', 'Mensajes', () => this.go({ app: 'messages' }), unread);
    app('☺', 'Contactos', () => this.go({ app: 'contacts' }));
    app('◉', 'Cámara', null);
    app('♪', 'Música', null);
    this.screenEl.replaceChildren(el('p', 'phone__greeting', this.greeting(unread)), grid);
  }

  private contacts(): Contact[] {
    return contactsOf(this.state.social, this.state.events.importantNPCsMet, this.state.phone, this.state.day);
  }

  private renderContacts(): void {
    this.titleEl.textContent = 'Contactos';
    const list = this.contacts();
    if (!list.length) {
      this.screenEl.replaceChildren(el('p', 'phone__empty', 'Aún no conoces a nadie. La gente del barrio se presenta charlando.'));
      return;
    }
    const ul = el('ul', 'phone__list');
    const now = this.host?.now() ?? 0;
    for (const c of list) {
      const li = el('li', 'phone__row');
      const sub = c.canMessage ? c.label : `${c.label} · ${NO_NUMBER[c.contact]}`;
      li.append(avatar(c.npc), rowText(nameOf(c.npc), sub), el('span', 'phone__row-meta', c.lastContact !== undefined ? stampLabel(c.lastContact, now) : ''));
      this.item(li, () => this.go({ app: 'thread', npc: c.npc }));
      ul.append(li);
    }
    this.screenEl.replaceChildren(ul);
  }

  private renderMessages(): void {
    this.titleEl.textContent = 'Mensajes';
    const list = this.contacts()
      .filter((c) => c.canMessage)
      .sort((a, b) => (b.last?.at ?? -1) - (a.last?.at ?? -1));
    if (!list.length) {
      this.screenEl.replaceChildren(el('p', 'phone__empty', 'No tienes el número de nadie. Pídeselo a alguien en persona.'));
      return;
    }
    const ul = el('ul', 'phone__list');
    const now = this.host?.now() ?? 0;
    for (const c of list) {
      const li = el('li', `phone__row${c.unread ? ' is-unread' : ''}`);
      const preview = c.last ? `${c.last.from === 'me' ? 'Tú: ' : ''}${c.last.text}` : 'Escríbele algo';
      const meta = el('span', 'phone__row-meta', c.last ? stampLabel(c.last.at, now) : '');
      if (c.unread) meta.append(el('span', 'phone__badge', String(c.unread)));
      li.append(avatar(c.npc), rowText(nameOf(c.npc), preview), meta);
      this.item(li, () => this.go({ app: 'thread', npc: c.npc }));
      ul.append(li);
    }
    this.screenEl.replaceChildren(ul);
  }

  private renderThread(npc: string): void {
    const name = nameOf(npc);
    this.titleEl.textContent = name;
    const profile = this.state.social[npc] ?? createSocialProfile();
    const phone = this.state.phone;
    const thread = phone.threads[npc];
    const now = this.host?.now() ?? 0;
    const contact = this.contacts().find((c) => c.npc === npc);
    const label = contact?.label ?? '';

    const head = el('div', 'phone__head');
    const typing = thread?.pending && thread.pending.due - now <= 2;
    const status = !profile.contactExchanged ? 'sin su número' : typing ? 'escribiendo…' : STATUS_TEXT[this.host?.status(npc).state ?? 'free'];
    head.append(avatar(npc), rowText(label, status));

    const log = el('div', 'phone__log');
    const plan = activePlan(phone, npc, now);
    const planState = plan && PLAN_STATE[plan.status];
    if (plan && planState) {
      const card = el('p', 'phone__plan');
      card.append(el('b', '', planState), ` · ${PLAN_KINDS[plan.kind].name} ${whenLabel(plan.day, Math.floor(now / 1440) + 1)} a las ${plan.at} · ${placeName(plan.place)}`);
      log.append(card);
    }
    for (const m of thread?.messages ?? []) {
      const b = el('p', `phone__msg is-${m.from}`, m.text);
      b.append(el('time', '', stampLabel(m.at, now)));
      log.append(b);
    }
    if (!thread?.messages.length) log.append(el('p', 'phone__empty', profile.contactExchanged ? 'Aún no os habéis escrito.' : `Os conocéis, pero no tienes su número.`));

    const replies = el('div', 'phone__replies');
    const p = NAMED_PEOPLE[npc]?.pronouns;
    if (!profile.contactExchanged) replies.append(el('p', 'phone__note', HOW_TO_GET[contact?.contact ?? 'KNOWN'].replace('{la}', p === 'ella' ? 'la' : p === 'él' ? 'lo' : 'le')));
    else if (thread?.pending) replies.append(el('p', 'phone__note', `${name} aún no ha contestado.`));
    else {
      phoneOptions(phone, npc, profile, now).forEach((o, i) => {
        const b = el('button', 'phone__reply') as HTMLButtonElement;
        b.type = 'button';
        b.append(el('span', 'phone__key', String(i + 1)), o.label);
        this.item(b, () => this.host?.send(npc, o.id));
        replies.append(b);
      });
    }
    this.screenEl.replaceChildren(head, log, replies);
    log.scrollTop = log.scrollHeight;
  }

  // ------------------------------------------------------------ piezas

  private item(node: HTMLElement, run: () => void): void {
    const index = this.items.length;
    this.items.push({ el: node, run });
    node.classList.add('phone__item');
    node.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).blur();
      this.selected = index;
      run();
    });
  }

  private mark(): void {
    this.items.forEach((it, i) => it.el.classList.toggle('is-selected', i === this.selected));
    this.items[this.selected]?.el.scrollIntoView({ block: 'nearest' });
  }

  private renderClock(): void {
    const two = (n: number): string => String(n).padStart(2, '0');
    this.clockEl.textContent = `${two(this.state.hour)}:${two(this.state.minute)}`;
  }

  private renderBadge(): void {
    const n = unreadTotal(this.state.phone);
    this.badge.textContent = n ? String(n) : '';
    this.badge.hidden = n === 0;
    this.button.setAttribute('aria-label', n ? `Abrir el móvil (P): ${n} sin leer` : 'Abrir el móvil (P)');
  }

  private greeting(unread: number): string {
    const h = this.state.hour;
    const hi = h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
    return unread ? `${hi}. Tienes ${unread} ${unread === 1 ? 'mensaje' : 'mensajes'} sin leer.` : `${hi}.`;
  }

  private showToast(npc: string, title: string, text: string): void {
    this.toast.replaceChildren(avatar(npc), rowText(title, text));
    this.toast.dataset.npc = npc;
    this.toast.classList.add('is-visible');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.hideToast(), 4500);
  }

  private hideToast(): void {
    this.toast.classList.remove('is-visible');
    window.clearTimeout(this.toastTimer);
  }
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Su cara en pequeño: el color de su piel y de su pelo (data/npcs), con su inicial. */
function avatar(npc: string): HTMLElement {
  const a = el('span', 'phone__avatar', nameOf(npc).slice(0, 1));
  try {
    const def = getNpc(npc);
    a.style.background = def.skin ?? '';
    a.style.borderTopColor = def.hair ?? '';
  } catch {
    // Sin aspecto: se queda con el color de siempre.
  }
  return a;
}

function rowText(title: string, sub: string): HTMLElement {
  const box = el('span', 'phone__row-text');
  box.append(el('b', '', title), el('span', '', sub));
  return box;
}
