// Sin Phaser: lo mueve systems/Crowd.ts y scripts/simulate-population.ts lo simula igual.
import { GAME_MINUTES_PER_REAL_SECOND } from '../config/constants.ts';
import { availableItems, getMenu, type MenuItem, type ServiceMenu } from '../data/menus.ts';
import type { LocationDef, TableDef, TilePoint } from '../types/game.ts';
import type { Agent } from './Crowd.ts';
import { between, type Rng } from './MetroDaily.ts';

/**
 * Servicio de mesa: lo que convierte un comedor en un restaurante. Mesas con
 * su estado, comandas, cocina, cuenta y un camarero que va de una cosa a otra
 * andando. No sabe de ningún local: lo activa el perfil de población con
 * `tableService` (carta, pase y cocina) y lo alimentan las mesas del interior
 * (LocationDef.tables). El café, un bar, la vinoteca o las mesas de la
 * discoteca son otra carta y otras mesas.
 *
 * Clientes y jugador pasan por lo mismo: se sientan (una mesa es de un grupo
 * hasta que se va), esperan, piden, esperan a cocina, comen, piden la cuenta,
 * pagan y se van; al irse queda la vajilla hasta que alguien recoge.
 *
 * Mesa: AVAILABLE → OCCUPIED → WAITING_TO_ORDER → ORDERED → SERVED →
 * WAITING_TO_PAY → PAID → (se van) DIRTY → (recogida) AVAILABLE.
 *
 * Camarero: IDLE, CHECKING_TABLES, GOING_TO_TABLE, TAKING_ORDER,
 * GOING_TO_KITCHEN, WAITING_FOR_ORDER, DELIVERING_ORDER, SERVING,
 * TAKING_PAYMENT, CLEARING_TABLE, RETURNING. Nunca aparece en ningún sitio:
 * cada cambio de sitio es una ruta de systems/Navigation.
 */

const MS_PER_MIN = 1000 / GAME_MINUTES_PER_REAL_SECOND;
/** Quien come en una mesa y no es un agente: el jugador. */
export const PLAYER = -1;

export type TableState = 'AVAILABLE' | 'OCCUPIED' | 'WAITING_TO_ORDER' | 'ORDERED' | 'SERVED' | 'WAITING_TO_PAY' | 'PAID' | 'DIRTY';
export type WaiterState =
  | 'IDLE' | 'CHECKING_TABLES' | 'GOING_TO_TABLE' | 'TAKING_ORDER' | 'GOING_TO_KITCHEN' | 'WAITING_FOR_ORDER'
  | 'DELIVERING_ORDER' | 'SERVING' | 'TAKING_PAYMENT' | 'CLEARING_TABLE' | 'RETURNING';
/** Lo que una mesa necesita de quien atiende. */
export type Job = 'order' | 'deliver' | 'bill' | 'clear';

/** Un plato o una bebida pedidos: de qué asiento son y cuánto le queda (ms reales). */
export interface Plate {
  item: MenuItem;
  seat: string;
  left: number;
}

export interface Table {
  readonly def: TableDef;
  state: TableState;
  /** Quien lleva el grupo (id de agente o PLAYER): la mesa es suya hasta que se va. */
  party: number | null;
  /** Quién se sienta, en qué asiento. */
  diners: { who: number; seat: string }[];
  /** Lo pedido: en cocina, en el pase, en la mesa lleno o ya vacío. */
  plates: Plate[];
  /** Salió de cocina (está en el pase o ya en la mesa). */
  ready: boolean;
  /** Está en la mesa. */
  served: boolean;
  /** Cuándo pasa lo siguiente que no depende de nadie: acabar de acomodarse, salir de cocina, irse tras pagar. */
  due: number;
  /** Lo que pide ahora la mesa, desde cuándo, y qué camarero lo tiene. */
  job: Job | null;
  jobAt: number;
  waiter: number | null;
  since: number;
}

interface Waiter {
  id: number;
  state: WaiterState;
  table: Table | null;
  job: Job | null;
  timer: number;
  home: TilePoint;
}

/** Lo que el servicio necesita de quien mueve a la gente (systems/Crowd). */
export interface ServiceHost {
  readonly agents: readonly Agent[];
  /** Echa a andar hacia un tile por la ruta de siempre; al llegar, mira a `face`. */
  walk(a: Agent, to: TilePoint, face?: TilePoint): void;
  pointAt(id: string): TilePoint;
  /** Si ese agente es un camarero de este servicio; sin él, el personal con oficio de camarero que sirve mesas (interiores). */
  isWaiter?(a: Agent): boolean;
  /** Qué asiento tiene o al que va ese agente; sin él, su `point` (en los interiores se reserva al salir). */
  seatOf?(a: Agent): string | undefined;
}

/** Lo que el jugador tiene delante: la escena lo enseña y responde con playerOrder / playerPay. */
export type PlayerCall =
  | { kind: 'order'; menu: ServiceMenu; items: readonly MenuItem[] }
  | { kind: 'served'; plates: readonly MenuItem[] }
  | { kind: 'finished'; energy: number }
  | { kind: 'bill'; total: number };

/** Lo que tarda cada gesto (ms reales). */
const MS = {
  settle: [2_500, 4_500],
  takeOrder: [2_400, 3_600],
  pickUp: [700, 1_100],
  serve: [1_100, 1_600],
  pay: [1_800, 2_600],
  clear: [1_800, 2_600],
  leaveAfterPay: [1_500, 4_500],
  checkEvery: [6_000, 14_000],
  playerWait: 30_000,
  playerAgain: 18_000,
} as const;
/**
 * Orden en que se atiende: lo que ya está hecho se lleva antes de que se enfríe,
 * y se cobra antes de tomar nota a otra mesa (una mesa que paga se libera).
 */
const PRIORITY: readonly Job[] = ['deliver', 'bill', 'order', 'clear'];
/** Quien sirve mesas anda deprisa (tiles por segundo; la gente, de 1,7 a 2,6). */
const WAITER_SPEED = 3;

export class TableService {
  readonly tables: readonly Table[];
  readonly menu: ServiceMenu;
  /** Lo que el jugador tiene que ver o decidir ahora (la escena lo recoge). */
  onPlayer: ((call: PlayerCall) => void) | null = null;
  private readonly host: ServiceHost;
  private readonly rng: Rng;
  private readonly bySeat = new Map<string, Table>();
  private readonly waiters = new Map<number, Waiter>();
  private readonly pass: TilePoint;
  private now = 0;
  private hour = 12;
  private playerSeated = false;

  constructor(loc: LocationDef, service: { menu: string; pass: string }, host: ServiceHost, rng: Rng) {
    this.host = host;
    this.rng = rng;
    this.menu = getMenu(service.menu);
    this.pass = host.pointAt(service.pass);
    this.tables = (loc.tables ?? []).map((def) => ({
      def, state: 'AVAILABLE', party: null, diners: [], plates: [], ready: false, served: false, due: 0,
      job: null, jobAt: 0, waiter: null, since: 0,
    }));
    for (const t of this.tables) for (const s of t.def.seats) this.bySeat.set(s, t);
  }

  tableOf(seat: string | undefined): Table | undefined {
    return seat ? this.bySeat.get(seat) : undefined;
  }

  /** Mesas con algo en marcha en cocina: mientras haya alguna, la cocina echa humo. */
  get cooking(): number {
    return this.tables.filter((t) => t.state === 'ORDERED' && !t.ready).length;
  }

  // --------------------------------------------------------------- clientes

  /** Si ese cliente puede sentarse ahí: una mesa libre (para quien lleva el grupo) o la de su grupo. */
  canSit(seat: string, a: Agent): boolean {
    const t = this.bySeat.get(seat);
    if (!t) return true;
    if (t.party === null) return t.state === 'AVAILABLE' && !a.leader;
    return t.party === (a.leader?.id ?? a.id);
  }

  /** Va a sentarse: la mesa pasa a ser de su grupo. */
  reserve(seat: string, a: Agent): void {
    const t = this.bySeat.get(seat);
    if (!t) return;
    if (t.party === null) this.open(t, a.leader?.id ?? a.id);
    if (!t.diners.some((d) => d.who === a.id)) t.diners.push({ who: a.id, seat });
  }

  /** Otro asiento libre de la mesa de quien lleva el grupo, para sentarse con él. */
  mateSeat(lead: Agent, taken: (seat: string) => boolean): string | undefined {
    const t = this.bySeat.get(lead.point ?? '');
    return t?.def.seats.find((s) => s !== lead.point && !taken(s));
  }

  /** Mientras la mesa no ha pagado, quien come en ella no se levanta por su reloj: manda el servicio. */
  holds(a: Agent): boolean {
    const t = this.bySeat.get(this.seatOf(a) ?? '');
    return !!t && !a.leaveSoon && t.state !== 'PAID' && t.diners.some((d) => d.who === a.id);
  }

  /**
   * Al abrir la puerta con gente ya dentro (Crowd.populate): una mesa a mitad
   * de lo suyo. Unas acaban de sentarse, otras esperan cocina, otras comen.
   */
  adopt(seat: string, a: Agent): void {
    const t = this.bySeat.get(seat);
    if (!t) return;
    const fresh = t.party === null;
    this.reserve(seat, a);
    if (!fresh) {
      if (t.state !== 'OCCUPIED') this.order(t, [a.id]);
      return;
    }
    const roll = this.rng();
    if (roll < 0.3) return;
    this.order(t, [a.id]);
    if (roll < 0.55) {
      this.to(t, 'ORDERED');
      t.due = this.now + between(this.rng, 2_000, 8_000);
    } else {
      this.to(t, 'SERVED');
      t.ready = t.served = true;
      for (const p of t.plates) p.left *= 0.2 + this.rng() * 0.8;
    }
  }

  // ---------------------------------------------------------------- jugador

  /** El jugador se ha sentado a esa mesa (ya del todo): es suya hasta que se levante. */
  seatPlayer(seat: string): void {
    const t = this.bySeat.get(seat);
    if (!t || t.party !== null) return;
    this.open(t, PLAYER);
    t.diners.push({ who: PLAYER, seat });
    this.playerSeated = true;
  }

  /** La mesa del jugador, si está sentado a una. */
  get playerTable(): Table | undefined {
    return this.tables.find((t) => t.party === PLAYER);
  }

  /** Lo que ha pedido el jugador. Sin nada, «todavía no»: el camarero vuelve más tarde. */
  playerOrder(items: readonly MenuItem[]): void {
    const t = this.playerTable;
    if (!t || t.state !== 'WAITING_TO_ORDER') return;
    if (items.length === 0) {
      this.later(t, 'order');
      return;
    }
    const seat = t.diners.find((d) => d.who === PLAYER)!.seat;
    t.plates.push(...items.map((item) => ({ item, seat, left: item.duration * MS_PER_MIN })));
    this.placed(t);
  }

  /** El jugador paga (o, con `later`, pide un momento: el camarero vuelve luego). Devuelve lo que cuesta. */
  playerPay(later = false): number {
    const t = this.playerTable;
    if (!t || t.state !== 'WAITING_TO_PAY') return 0;
    if (later) {
      this.later(t, 'bill');
      return 0;
    }
    this.to(t, 'PAID');
    this.done(t);
    return this.bill(t);
  }

  /**
   * El jugador se levanta. Si deja algo sin pagar, deja el dinero en la mesa:
   * devuelve lo que se cobra. La mesa se queda con la vajilla o libre.
   */
  playerStands(): number {
    const t = this.playerTable;
    this.playerSeated = false;
    if (!t) return 0;
    const owed = t.state === 'PAID' || t.plates.length === 0 ? 0 : this.bill(t);
    t.diners = t.diners.filter((d) => d.who !== PLAYER);
    this.empty(t);
    return owed;
  }

  /** Qué pasa en la mesa del jugador, para decírselo. */
  playerStatus(): string | null {
    const t = this.playerTable;
    if (!t) return null;
    const coming = t.waiter !== null;
    switch (t.state) {
      case 'OCCUPIED':
      case 'WAITING_TO_ORDER':
        return coming ? 'Viene el camarero' : 'Esperando a que te atiendan';
      case 'ORDERED':
        return t.ready ? 'Tu pedido sale de cocina' : 'Tu pedido está en cocina';
      case 'SERVED':
        return 'Comiendo';
      case 'WAITING_TO_PAY':
        return coming ? 'Te traen la cuenta' : 'Esperando la cuenta';
      case 'PAID':
        return 'Pagado · puedes quedarte o irte';
      default:
        return null;
    }
  }

  /** Si el jugador está comiendo ahora mismo (para la pose de comer). */
  get playerEating(): boolean {
    const t = this.playerTable;
    return !!t && t.state === 'SERVED' && t.plates.some((p) => p.left > 0);
  }

  // ----------------------------------------------------------------- tiempo

  /** Un paso del local: mesas, cocina y comidas. Los camareros se mueven en `stepWaiter`. */
  update(deltaMs: number, hour: number): void {
    this.now += deltaMs;
    this.hour = hour;
    for (const t of this.tables) this.tick(t, deltaMs);
  }

  private tick(t: Table, deltaMs: number): void {
    // Quien se ha ido ya no come aquí (el jugador se quita con playerStands).
    t.diners = t.diners.filter((d) => d.who === PLAYER || this.host.agents.some((a) => a.id === d.who && this.seatOf(a) === d.seat && !a.leaving));
    if (t.party !== null && t.diners.length === 0) {
      this.empty(t);
      return;
    }
    // Lo que se ve hacer a cada comensal: esperar, charlar o comer.
    for (const d of t.diners) {
      const a = this.agent(d.who);
      if (a && a.path.length === 0) a.state = t.state === 'SERVED' ? 'DINE' : t.diners.length > 1 ? 'TALK' : 'WAIT';
    }
    switch (t.state) {
      case 'OCCUPIED':
        if (this.allSeated(t) && this.now >= t.due) this.request(t, 'order', 'WAITING_TO_ORDER');
        break;
      case 'ORDERED':
        if (!t.ready && this.now >= t.due) {
          t.ready = true;
          if (t.job === null) this.ask(t, 'deliver');
        }
        break;
      case 'SERVED':
        for (const p of t.plates) p.left = Math.max(0, p.left - deltaMs);
        if (t.plates.every((p) => p.left === 0)) {
          if (t.party === PLAYER) this.onPlayer?.({ kind: 'finished', energy: t.plates.reduce((s, p) => s + p.item.energy, 0) });
          this.request(t, 'bill', 'WAITING_TO_PAY');
        }
        break;
      case 'PAID':
        // Ya han pagado: se van al poco (quien lleva el grupo; los demás le siguen).
        if (t.party !== PLAYER && this.now >= t.due) {
          const lead = this.agent(t.party ?? 0);
          if (lead && !lead.leaveSoon) {
            lead.leaveSoon = true;
            lead.timer = 0;
          }
        }
        break;
    }
  }

  // --------------------------------------------------------------- camareros

  /** Si este es un camarero de este servicio (y sigue de turno). Si se va, suelta lo que tenía. */
  drives(a: Agent): boolean {
    if (a.kind !== 'staff') return false;
    if (this.host.isWaiter ? !this.host.isWaiter(a) : a.staffRole?.service !== 'waiter' || !a.staffRole.serves) return false;
    if (a.leaveSoon) {
      const w = this.waiters.get(a.id);
      if (w?.table && w.table.waiter === w.id) w.table.waiter = null;
      a.carry = undefined;
      this.waiters.delete(a.id);
      return false;
    }
    return true;
  }

  /** Estado de un camarero (para verlo y comprobarlo). */
  waiterState(id: number): WaiterState | undefined {
    return this.waiters.get(id)?.state;
  }

  /**
   * Lo que hace un camarero parado (Crowd sólo lo llama cuando ha llegado a
   * donde iba): decide el siguiente paso y echa a andar.
   */
  stepWaiter(a: Agent, deltaMs: number): void {
    let w = this.waiters.get(a.id);
    if (!w) {
      w = { id: a.id, state: 'IDLE', table: null, job: null, timer: between(this.rng, ...MS.checkEvery), home: { tx: Math.round(a.x), ty: Math.round(a.y) } };
      this.waiters.set(a.id, w);
      a.speed = Math.max(a.speed, WAITER_SPEED);
    }
    w.timer -= deltaMs;
    const t = w.table;
    switch (w.state) {
      case 'IDLE':
      case 'RETURNING':
      case 'CHECKING_TABLES':
        if (this.takeJob(w, a)) return;
        if (w.state === 'IDLE' && w.timer <= 0) {
          // Sin nada pendiente, una vuelta por la sala: echar un ojo a alguna mesa ocupada.
          const busy = this.tables.filter((x) => x.party !== null);
          const look = busy[Math.floor(this.rng() * busy.length)];
          w.timer = between(this.rng, ...MS.checkEvery);
          if (look) this.go(w, a, 'CHECKING_TABLES', look.def.service, this.face(look));
        } else if (w.state !== 'IDLE') this.go(w, a, 'IDLE', w.home);
        return;
      case 'GOING_TO_TABLE': {
        if (!t || !this.stillNeeds(t, w.job)) return this.finish(w, a);
        const player = t.party === PLAYER;
        if (w.job === 'order') this.wait(w, a, 'TAKING_ORDER', player ? MS.playerWait : between(this.rng, ...MS.takeOrder));
        else if (w.job === 'bill') this.wait(w, a, 'TAKING_PAYMENT', player ? MS.playerWait : between(this.rng, ...MS.pay));
        else this.wait(w, a, 'CLEARING_TABLE', between(this.rng, ...MS.clear));
        if (player && w.job === 'order') this.onPlayer?.({ kind: 'order', menu: this.menu, items: availableItems(this.menu, this.hour) });
        if (player && w.job === 'bill') this.onPlayer?.({ kind: 'bill', total: this.bill(t) });
        return;
      }
      case 'TAKING_ORDER':
        // Se han levantado antes de pedir (o la mesa ya no pide): no hay nada que tomar, queda libre y a otra cosa.
        if (!t || t.party === null || (t.party !== PLAYER && !this.stillNeeds(t, 'order'))) return this.finish(w, a);
        if (t.party === PLAYER) {
          // El jugador decide: si ya ha pedido, a cocina; si no contesta, vuelve luego.
          if (t.state === 'ORDERED') return this.toKitchen(w, a);
          if (t.state !== 'WAITING_TO_ORDER' || w.timer <= 0) {
            if (t.state === 'WAITING_TO_ORDER') this.later(t, 'order');
            return this.finish(w, a);
          }
          return;
        }
        if (w.timer > 0) return;
        this.order(t, t.diners.map((d) => d.who));
        this.placed(t);
        return this.toKitchen(w, a);
      case 'GOING_TO_KITCHEN':
        a.carry = undefined;
        if (w.job === 'deliver' && t) return this.wait(w, a, 'WAITING_FOR_ORDER', between(this.rng, ...MS.pickUp));
        // Ha entregado la comanda o dejado la vajilla en el pase: a otra cosa.
        return this.finish(w, a);
      case 'WAITING_FOR_ORDER':
        if (!t || !this.stillNeeds(t, 'deliver')) return this.finish(w, a);
        if (!t.ready || w.timer > 0) return;
        a.carry = 'tray';
        this.go(w, a, 'DELIVERING_ORDER', t.def.service, this.face(t));
        return;
      case 'DELIVERING_ORDER':
        return this.wait(w, a, 'SERVING', between(this.rng, ...MS.serve));
      case 'SERVING':
        if (w.timer > 0) return;
        a.carry = undefined;
        if (t && this.stillNeeds(t, 'deliver')) {
          t.served = true;
          this.to(t, 'SERVED');
          this.done(t);
          if (t.party === PLAYER) this.onPlayer?.({ kind: 'served', plates: t.plates.map((p) => p.item) });
        }
        return this.finish(w, a);
      case 'TAKING_PAYMENT':
        if (!t || t.party === null) return this.finish(w, a);
        if (t.party === PLAYER) {
          if (t.state === 'PAID') return this.finish(w, a);
          if (t.state !== 'WAITING_TO_PAY' || w.timer <= 0) {
            if (t.state === 'WAITING_TO_PAY') this.later(t, 'bill');
            return this.finish(w, a);
          }
          return;
        }
        if (w.timer > 0) return;
        this.to(t, 'PAID');
        t.due = this.now + between(this.rng, ...MS.leaveAfterPay);
        this.done(t);
        return this.finish(w, a);
      case 'CLEARING_TABLE':
        if (w.timer > 0) return;
        if (t && t.state === 'DIRTY') {
          t.plates = [];
          t.ready = t.served = false;
          this.to(t, 'AVAILABLE');
          this.done(t);
        }
        // La vajilla sucia, al pase.
        a.carry = 'dishes';
        w.job = 'clear';
        w.table = null;
        this.go(w, a, 'GOING_TO_KITCHEN', this.pass);
        return;
    }
  }

  // ------------------------------------------------------------- por dentro

  private open(t: Table, party: number): void {
    t.party = party;
    t.diners = [];
    t.plates = [];
    t.ready = t.served = false;
    this.done(t);
    this.to(t, 'OCCUPIED');
    // Un rato para acomodarse antes de que venga nadie.
    t.due = this.now + between(this.rng, ...MS.settle);
  }

  /** La mesa se ha quedado sin nadie: con vajilla, a recoger; sin ella, libre. */
  private empty(t: Table): void {
    t.party = null;
    t.diners = [];
    if (t.plates.length > 0 && t.state !== 'DIRTY') this.request(t, 'clear', 'DIRTY');
    else if (t.plates.length === 0) {
      this.done(t);
      this.to(t, 'AVAILABLE');
      t.ready = t.served = false;
    }
  }

  /** Lo que pide cada cliente: un plato casi siempre y una bebida casi siempre. */
  private order(t: Table, who: readonly number[]): void {
    const items = availableItems(this.menu, this.hour);
    const food = items.filter((i) => i.kind === 'food');
    const drink = items.filter((i) => i.kind === 'drink');
    const pick = (list: MenuItem[]): MenuItem | undefined => list[Math.floor(this.rng() * list.length)];
    for (const id of who) {
      const seat = t.diners.find((d) => d.who === id)?.seat;
      if (!seat || t.plates.some((p) => p.seat === seat)) continue;
      const mine = [this.rng() < 0.8 ? pick(food) : undefined, this.rng() < 0.9 ? pick(drink) : undefined];
      if (!mine[0] && !mine[1]) mine[1] = pick(drink);
      for (const item of mine) if (item) t.plates.push({ item, seat, left: item.duration * MS_PER_MIN * (0.8 + this.rng() * 0.4) });
    }
  }

  /** Comanda tomada: a cocina, y sale cuando esté lo más lento. */
  private placed(t: Table): void {
    this.to(t, 'ORDERED');
    this.done(t);
    t.ready = false;
    t.due = this.now + Math.max(...t.plates.map((p) => p.item.prep)) * MS_PER_MIN;
  }

  private bill(t: Table): number {
    return t.plates.reduce((sum, p) => sum + p.item.price, 0);
  }

  private request(t: Table, job: Job, state: TableState): void {
    this.to(t, state);
    this.ask(t, job);
  }

  private ask(t: Table, job: Job): void {
    t.job = job;
    t.jobAt = this.now;
    t.waiter = null;
  }

  /** «Todavía no»: la misma petición, dentro de un rato. */
  private later(t: Table, job: Job): void {
    this.ask(t, job);
    t.jobAt = this.now + MS.playerAgain;
  }

  private done(t: Table): void {
    t.job = null;
    t.waiter = null;
  }

  private to(t: Table, state: TableState): void {
    t.state = state;
    t.since = this.now;
  }

  private allSeated(t: Table): boolean {
    return t.diners.length > 0 && t.diners.every((d) => (d.who === PLAYER ? this.playerSeated : (this.agent(d.who)?.path.length ?? 1) === 0));
  }

  private stillNeeds(t: Table, job: Job | null): boolean {
    if (job === 'order') return t.state === 'WAITING_TO_ORDER';
    if (job === 'deliver') return t.state === 'ORDERED' && t.diners.length > 0;
    if (job === 'bill') return t.state === 'WAITING_TO_PAY';
    if (job === 'clear') return t.state === 'DIRTY';
    return false;
  }

  /** La petición más urgente sin dueño, y se la queda. */
  private takeJob(w: Waiter, a: Agent): boolean {
    let best: Table | undefined;
    for (const job of PRIORITY) {
      best = this.tables.filter((t) => t.job === job && t.waiter === null && t.jobAt <= this.now).sort((x, y) => x.jobAt - y.jobAt)[0];
      if (best) break;
    }
    if (!best) return false;
    best.waiter = w.id;
    w.table = best;
    w.job = best.job;
    // Lo que ya está hecho se recoge primero en el pase; lo demás, en la mesa.
    if (w.job === 'deliver') this.go(w, a, 'GOING_TO_KITCHEN', this.pass);
    else this.go(w, a, 'GOING_TO_TABLE', best.def.service, this.face(best));
    return true;
  }

  private toKitchen(w: Waiter, a: Agent): void {
    if (w.table && w.table.waiter === w.id) w.table.waiter = null;
    w.job = null;
    w.table = null;
    this.go(w, a, 'GOING_TO_KITCHEN', this.pass);
  }

  /** Acabó lo que tenía: otra cosa si hay, o de vuelta a su sitio. */
  private finish(w: Waiter, a: Agent): void {
    if (w.table && w.table.waiter === w.id) w.table.waiter = null;
    w.table = null;
    w.job = null;
    a.carry = undefined;
    if (!this.takeJob(w, a)) this.go(w, a, 'RETURNING', w.home);
  }

  private go(w: Waiter, a: Agent, state: WaiterState, to: TilePoint, face?: TilePoint): void {
    w.state = state;
    a.state = state;
    this.host.walk(a, to, face);
  }

  private wait(w: Waiter, a: Agent, state: WaiterState, ms: number): void {
    w.state = state;
    a.state = state;
    w.timer = ms;
  }

  /** Hacia dónde mira quien atiende la mesa: hacia quien se sienta en ella. */
  private face(t: Table): TilePoint {
    return this.host.pointAt(t.diners[0]?.seat ?? t.def.seats[0]);
  }

  private seatOf(a: Agent): string | undefined {
    return this.host.seatOf ? this.host.seatOf(a) : a.point;
  }

  private agent(id: number): Agent | undefined {
    return this.host.agents.find((a) => a.id === id);
  }
}
