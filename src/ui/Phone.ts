import { formatDate, SEASON_LABEL, seasonOf } from '../systems/Calendar';
import type { GameState } from '../state/GameState';
import { getNpc } from '../data/npcs';
import { NAMED_PEOPLE } from '../data/namedPeople';
import {
  activePlan, contactsOf, PLAN_KINDS, phoneOptions, placeName, stampLabel, unreadTotal, whenLabel,
  type Contact, type NpcStatus, type PhoneActionId, type PhoneNews, type SocialPlan,
} from '../systems/Phone';
import { createSocialProfile, type ContactState } from '../systems/Social';
import { dayOf, hireBlocker, levelOf, levelSummary, nextShift, settle, statusOf, type ShiftStatus } from '../systems/Jobs';
import { getJob, JOBS } from '../data/jobs';
import { WEEKDAY_SHORT, weekdayOf, formatDateShort } from '../systems/Calendar';
import { billOf, dueLabel, goalAdvice, goalById, goalView, owed, pay, total, unpaid } from '../systems/Household';
import { BILLS, GOALS } from '../data/household';
import { euros } from '../systems/Commerce';
import { COURSES, getGig, getSkill } from '../data/study';
import { gigDeadline, gigStatus, hasCamera, knowledge, lessonStatus, levelName, nextSession, sessionLabel } from '../systems/Study';

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
  /** Una propuesta suya por contestar (systems/Story): con qué palabras se acepta o se dice que no. */
  offer?(npc: string): { accept?: string; decline?: string; cancel?: boolean } | undefined;
  /** El plan quedado con su historia (una visita a casa), dicho para la conversación: «tu piso · mañana a las 19:30». */
  planLine?(npc: string): string | undefined;
  /** Guarda la partida ya (tras un pago). */
  persist(): void;
}

type Screen =
  | { app: 'home' } | { app: 'contacts' } | { app: 'messages' } | { app: 'job' } | { app: 'thread'; npc: string }
  | { app: 'money' } | { app: 'pay'; bill: string; period: number } | { app: 'goals' } | { app: 'study' };

/** Cómo está el turno de cada día, en la pantalla de Trabajo. */
const SHIFT_TEXT: Readonly<Record<ShiftStatus, string>> = {
  none: 'Libre',
  upcoming: 'Programado',
  open: 'Disponible: ve a fichar',
  done: 'Completado',
  late: 'Completado con retraso',
  missed: 'Perdido',
};

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
  /** Lo que se cuenta una vez arriba de Cuentas (el pago hecho, por qué no se pudo). */
  private flash = '';
  /** Aviso de Cuentas a la espera de que haya escena (al arrancar). */
  private queued: { title: string; text: string } | null = null;

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
      const app = toast.dataset.app;
      this.hideToast();
      if (!npc && !app) return;
      if (!this.opened) this.open();
      if (this.opened) this.go(app === 'money' ? { app: 'money' } : { app: 'thread', npc: npc! });
    });

    state.on('phone', (news: readonly PhoneNews[]) => this.onPhone(news));
    state.on('social', () => this.refresh());
    state.on('job', () => this.refresh());
    state.on('study', () => this.refresh());
    state.on('household', () => this.refresh());
    // El saldo cambia mientras se mira Cuentas (un cobro, una compra): se repinta esa pantalla. Sólo si cambió el
    // dinero: 'change' llega también con cada minuto y repintar cada vez se comería los toques.
    let shown = state.money;
    state.on('change', () => {
      if (state.money === shown) return;
      shown = state.money;
      if (this.screen.app === 'money' || this.screen.app === 'pay' || this.screen.app === 'goals') this.refresh();
    });
    state.on('change', () => this.renderClock());
    this.renderBadge();
  }

  /** La Scene que lo atiende; sin ella (cambiando de sitio) no se abre. */
  attach(host: PhoneHost | null): void {
    this.host = host;
    if (!host) this.close();
    // Un aviso de Cuentas que llegó cargando (o entre escenas) se enseña cuando ya se ve el mundo.
    const queued = this.queued;
    this.queued = null;
    if (host && queued) this.notice(queued.title, queued.text);
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
    else if (s.app === 'pay' || s.app === 'goals') this.go({ app: 'money' });
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

  /** Un aviso de Cuentas (un gasto anunciado, un recargo): tocarlo abre Cuentas. */
  notice(title: string, text: string): void {
    if (!this.host) {
      this.queued = this.queued ? { title, text: `${this.queued.text} ${text}` } : { title, text };
      return;
    }
    const icon = el('span', 'phone__avatar', '€');
    this.toast.replaceChildren(icon, rowText(title, text));
    delete this.toast.dataset.npc;
    this.toast.dataset.app = 'money';
    this.toast.classList.add('is-visible');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.hideToast(), 6000);
    this.refresh();
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
    else if (s.app === 'job') this.renderJob();
    else if (s.app === 'study') this.renderStudy();
    else if (s.app === 'money') this.renderMoney();
    else if (s.app === 'pay') this.renderPay(s.bill, s.period);
    else if (s.app === 'goals') this.renderGoals();
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
    app('▤', 'Trabajo', () => this.go({ app: 'job' }));
    app('✎', 'Estudios', () => this.go({ app: 'study' }));
    const urgent = unpaid(this.state.household).filter((o) => o.due <= this.state.day).length;
    app('€', 'Cuentas', () => this.go({ app: 'money' }), urgent);
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

  /**
   * El contrato: puesto, siguiente turno, cómo vas y los días alrededor de hoy. Lo pinta repasado hasta ahora
   * (systems/Jobs.settle) sin guardarlo: las faltas se apuntan al volver al trabajo.
   */
  private renderJob(): void {
    this.titleEl.textContent = 'Trabajo';
    const now = this.host?.now() ?? 0;
    const saved = this.state.job;
    const p = saved && settle(saved, now).progress;
    if (!p || p.status !== 'active') {
      const job = p ? getJob(p.job) : JOBS[0];
      const why = !p ? 'Sin contrato.' : p.status === 'fired' ? `Te despidieron de ${job.employer}.` : `Dejaste ${job.employer}.`;
      const offer = hireBlocker(job, p, dayOf(now)) ?? `En ${job.employer} (L2) buscan personal: el cartel está junto a las cajas.`;
      this.screenEl.replaceChildren(el('p', 'phone__empty', `${why} ${offer} Mientras, se pueden hacer turnos sueltos.`));
      return;
    }
    const def = getJob(p.job);
    const lvl = levelOf(p);
    const next = nextShift(p, now);
    const nextText = next ? ` Siguiente turno: ${WEEKDAY_SHORT[weekdayOf(next.day)]} a las ${String(lvl.start).padStart(2, '0')}:00${next.status === 'open' ? ', ya se puede fichar' : ''}.` : '';
    const progress = p.level + 1 < def.levels.length ? ` Buenos turnos: ${Math.min(p.good, def.promoteAfter)} de ${def.promoteAfter} para el ascenso.` : ' Nivel más alto del puesto.';
    const strikes = p.strikes ? ` Faltas: ${p.strikes} de ${def.maxStrikes}; dos buenos turnos seguidos borran una.` : '';
    const head = el('p', 'phone__greeting', `${def.employer}. ${levelSummary(lvl)}${nextText}${progress}${strikes}`);
    const ul = el('ul', 'phone__list');
    const today = dayOf(now);
    for (let d = Math.max(1, today - 3); d <= today + 6; d++) {
      const rec = p.shifts[d];
      const li = el('li', `phone__row${d === today ? ' is-unread' : ''}`);
      li.append(
        rowText(`${WEEKDAY_SHORT[weekdayOf(d)]}${d === today ? ' · hoy' : ''}`, SHIFT_TEXT[statusOf(p, d, now)]),
        el('span', 'phone__row-meta', rec?.pay ? `+${rec.pay.toFixed(2).replace('.', ',')} €` : ''),
      );
      ul.append(li);
    }
    this.screenEl.replaceChildren(head, ul);
  }

  /**
   * Estudios: la habilidad y su nivel, la cámara prestada, cada clase con su estado, la próxima sesión, la prueba y
   * el encargo. Se calcula con el reloj de ahora (systems/Study): nada se guarda al mirarlo.
   */
  private renderStudy(): void {
    this.titleEl.textContent = 'Estudios';
    const now = this.host?.now() ?? 0;
    const s = this.state.study;
    const c = (s.course && COURSES.find((x) => x.id === s.course!.id)) ?? COURSES[0];
    const k = knowledge(s, c.skill);
    const skill = `${getSkill(c.skill).name}: ${k} de 100 (${levelName(c.skill, k)}).`;
    const p = s.course;
    if (!p) {
      this.screenEl.replaceChildren(el('p', 'phone__empty', `${skill} Sin curso. En el Centro de estudios (Calle Mayor) se da ${c.name}: ${euros(c.fee)}, ${c.lessons.length} clases a las ${c.start}:00. La matrícula, en la ventanilla de la puerta.`));
      return;
    }
    const next = nextSession(c, p, now);
    const head = el('p', 'phone__greeting', `${skill}${next && p.attended.length < c.lessons.length ? ` Próxima: ${sessionLabel(c, next)}.` : ''}${hasCamera(s) ? ` ${c.camera}` : ''}`);
    const ul = el('ul', 'phone__list');
    const row = (title: string, sub: string, meta = ''): void => {
      const li = el('li', 'phone__row');
      li.append(rowText(title, sub), el('span', 'phone__row-meta', meta));
      ul.append(li);
    };
    c.lessons.forEach((lesson, i) => {
      const st = lessonStatus(c, p, i, now);
      const sub = st === 'attended' ? 'Hecha' : st === 'open' ? 'Ahora: ve al centro' : st === 'missed' ? `Perdida: tutoría ${c.recovery.days.map((d) => WEEKDAY_SHORT[weekdayOf(d + 1)]).join(' o ')} a las ${c.recovery.start}:00` : 'Programada';
      row(`${i + 1} · ${lesson.title}`, sub, `${formatDateShort(p.lessons[i])}`);
    });
    const left = c.lessons.length - p.attended.length;
    row('Prueba final', p.passed ? 'Aprobada' : left ? `Tras las clases (faltan ${left})` : `En el centro, de ${c.demo.hours[0]}:00 a ${c.demo.hours[1]}:00, una al día`);
    const gig = getGig(c.gig);
    const status = gigStatus(gig, s, now);
    if (status !== 'locked') {
      const sub = status === 'offered' ? `${euros(gig.pay)} · acéptalo en el centro` : status === 'active' ? `${gig.place}, hasta el ${gigDeadline(gig, s.gig!)} · ${euros(gig.pay)}`
        : status === 'expired' ? 'Plazo pasado: pide otro en el centro' : 'Entregado';
      row(`Encargo · ${gig.client.split(',')[0]}`, sub);
    }
    if (s.unlocks.includes(gig.unlock)) row('Decathlon', 'Fotos de producto al fichar: +€15 por turno');
    this.screenEl.replaceChildren(head, ul);
  }

  /**
   * Cuentas: saldo, lo que se debe y cuándo vence, la meta de ahorro y los últimos movimientos. Cada pago se
   * abre en una confirmación con el importe y el saldo que queda (renderPay).
   */
  private renderMoney(): void {
    this.titleEl.textContent = 'Cuentas';
    const h = this.state.household;
    const money = this.state.money;
    const today = this.state.day;
    const debt = owed(h);
    const head = el('p', 'phone__greeting', `Saldo ${euros(money)} · Debes ${euros(debt)} · Libre ${money - debt < 0 ? `−${euros(debt - money)}` : euros(money - debt)}.${this.flash ? ` ${this.flash}` : ''}`);
    this.flash = '';
    const ul = el('ul', 'phone__list');
    const bills = unpaid(h);
    for (const o of bills) {
      const li = el('li', `phone__row${o.due <= today ? ' is-unread' : ''}`);
      li.append(rowText(`${billOf(o).name}${o.fee ? ' + recargo' : ''}`, dueLabel(o, today)), el('span', 'phone__row-meta', euros(total(o))));
      this.item(li, () => this.go({ app: 'pay', bill: o.bill, period: o.period }));
      ul.append(li);
    }
    if (!bills.length) {
      const li = el('li', 'phone__row');
      const every = BILLS.map((b) => `${b.name.toLowerCase()} ${euros(b.amount)}`).join(' y ');
      li.append(rowText('Todo pagado', `Cada semana: ${every}.`));
      ul.append(li);
    }
    const def = goalById(h.goal);
    const goal = el('li', 'phone__row');
    if (def) {
      const v = goalView(def, money, h, this.state.wardrobe);
      goal.append(rowText(`Meta: ${v.name}`, v.owned ? 'Conseguida' : `${euros(Math.min(v.cost, Math.max(0, v.free)))} de ${euros(v.cost)} · ${Math.round(v.progress * 100)}%${v.free >= v.cost ? ' · ya te llega' : ''}`), el('span', 'phone__row-meta', ''));
    } else goal.append(rowText('Meta de ahorro', 'Elige algo para lo que ahorrar'));
    this.item(goal, () => this.go({ app: 'goals' }));
    ul.append(goal);
    const moves = el('ul', 'phone__list');
    for (const m of this.state.ledger.slice(-8).reverse()) {
      const li = el('li', 'phone__row');
      const hh = `${String(m.hour).padStart(2, '0')}:${String(m.minute).padStart(2, '0')}`;
      li.append(rowText(m.label, `${formatDateShort(m.day)} · ${hh}`), el('span', 'phone__row-meta', `${m.amount > 0 ? '+' : '−'}${euros(Math.abs(m.amount))}`));
      moves.append(li);
    }
    const parts: HTMLElement[] = [head, ul];
    if (moves.childElementCount) parts.push(el('p', 'phone__note', 'Movimientos'), moves);
    this.screenEl.replaceChildren(...parts);
  }

  /** Confirmar un pago: importe, a quién y el saldo que queda. Si no llega, cuánto falta y qué hacer. */
  private renderPay(bill: string, period: number): void {
    const h = this.state.household;
    const o = h.obligations.find((x) => x.bill === bill && x.period === period);
    if (!o || o.paid !== undefined) {
      this.go({ app: 'money' });
      return;
    }
    const def = billOf(o);
    this.titleEl.textContent = 'Pagar';
    const money = this.state.money;
    const amount = total(o);
    const enough = money + 1e-9 >= amount;
    const text = `${def.name} · ${def.payee}. ${dueLabel(o, this.state.day)}. Importe ${euros(amount)}${o.fee ? ` (con recargo de ${euros(o.fee)})` : ''}. Saldo ${euros(money)} → ${enough ? euros(money - amount) : 'no llega'}.`;
    const ul = el('ul', 'phone__list');
    const confirm = el('li', `phone__row${enough ? '' : ' is-soon'}`);
    confirm.append(rowText(enough ? `Confirmar pago de ${euros(amount)}` : 'No te llega', enough ? 'Se paga con la cartera' : 'Sigue pendiente; no pasa nada hoy'));
    this.item(confirm, () => {
      const r = pay(this.state.household, this.state.money, bill, period, this.state.day);
      if (!r.ok) {
        this.flash = r.message;
        this.go({ app: 'money' });
        return;
      }
      this.state.setHousehold(r.household);
      this.state.as(def.name, () => {
        this.state.money = r.money;
      });
      this.host?.persist();
      this.flash = r.message;
      this.go({ app: 'money' });
    });
    const cancel = el('li', 'phone__row');
    cancel.append(rowText('Ahora no', 'Volver a Cuentas'));
    this.item(cancel, () => this.go({ app: 'money' }));
    ul.append(confirm, cancel);
    const parts: HTMLElement[] = [el('p', 'phone__greeting', text), ul];
    if (!enough) parts.splice(1, 0, el('p', 'phone__note', pay(h, money, bill, period, this.state.day).message));
    this.screenEl.replaceChildren(...parts);
  }

  /** Elegir meta: cosas de verdad, con su precio y dónde están. El dinero sigue en la cartera. */
  private renderGoals(): void {
    this.titleEl.textContent = 'Meta de ahorro';
    const h = this.state.household;
    const money = this.state.money;
    const current = goalById(h.goal);
    const advice = current ? goalAdvice(goalView(current, money, h, this.state.wardrobe), h, this.state.day) : 'Elige algo para lo que ahorrar. El dinero no se aparta: la meta cuenta lo que llevas menos lo que debes.';
    const ul = el('ul', 'phone__list');
    for (const g of GOALS) {
      const v = goalView(g, money, h, this.state.wardrobe);
      const li = el('li', `phone__row${g.id === h.goal ? ' is-unread' : ''}`);
      li.append(rowText(v.name, `${v.where} · ${v.owned ? 'ya la tienes' : `${Math.round(v.progress * 100)}%`}${g.id === h.goal ? ' · tu meta' : ''}`), el('span', 'phone__row-meta', euros(v.cost)));
      this.item(li, () => this.setGoal(g.id));
      ul.append(li);
    }
    if (current) {
      const none = el('li', 'phone__row');
      none.append(rowText('Sin meta', 'Quitar la meta'));
      this.item(none, () => this.setGoal(null));
      ul.append(none);
    }
    this.screenEl.replaceChildren(el('p', 'phone__greeting', advice), ul);
  }

  private setGoal(id: string | null): void {
    this.state.setHousehold({ ...this.state.household, goal: id });
    this.host?.persist();
    this.go({ app: 'money' });
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
    const storyPlan = this.host?.planLine?.(npc);
    if (storyPlan && !plan) {
      const card = el('p', 'phone__plan');
      card.append(el('b', '', 'Quedada'), ` · ${storyPlan}`);
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
      phoneOptions(phone, npc, profile, now, this.host?.offer?.(npc)).forEach((o, i) => {
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
    // La fecha entera, como la pantalla de bloqueo de un móvil: «Martes, 13 de abril de 2027 · primavera».
    const date = formatDate(this.state.day);
    const today = `${date[0].toUpperCase()}${date.slice(1)} · ${SEASON_LABEL[seasonOf(this.state.day)]}.`;
    return unread ? `${hi}. ${today} Tienes ${unread} ${unread === 1 ? 'mensaje' : 'mensajes'} sin leer.` : `${hi}. ${today}`;
  }

  private showToast(npc: string, title: string, text: string): void {
    this.toast.replaceChildren(avatar(npc), rowText(title, text));
    this.toast.dataset.npc = npc;
    delete this.toast.dataset.app;
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
