import type { PlayerInput } from '../systems/PlayerInput';
import { ATTENTION, type AttentionCase, type AttentionGrade } from '../data/customerService';
import { SECTORS } from '../data/decathlon';
import { AttentionRun, shelfOrder, type AttentionFinish, type AttentionResult } from '../systems/CustomerService';
import { labelOf } from '../systems/StoreKnowledge';

/**
 * VID-04 «Atender a un cliente» (systems/CustomerService): el cliente, su pista, la barra de paciencia y la estantería.
 * Se lleva una tarjeta al cliente arrastrándola, o tocándola y tocando al cliente; con teclado, ◀ ▶ y E. No decide
 * nada: la ronda y los puntos son de AttentionRun, y WorldScene le pasa el tiempo (pausado, no corre).
 */

export const GRADE_LABEL: Readonly<Record<AttentionGrade['id'], string>> = { excellent: 'excelente', good: 'correcta', poor: 'floja' };
const MARK: Readonly<Record<AttentionResult, string>> = { exact: '●', near: '◐', wrong: '✕' };
/** Lo que se tarda en cerrar el panel con la nota a la vista. */
const CLOSE_MS = 1400;
/** Píxeles de margen antes de que un toque cuente como arrastre. */
const DRAG_PX = 6;

const escape = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** La etiqueta de cada tarjeta; si dos del mismo estante se llaman igual (las dos Raquetas), la del plano. */
function labels(ids: readonly string[]): string[] {
  const secs = ids.map((id) => SECTORS.find((s) => s.id === id));
  return secs.map((s, i) => {
    if (!s) return ids[i];
    const l = labelOf(s);
    return secs.some((o) => o && o !== s && labelOf(o) === l) ? s.plan : l;
  });
}

export class AttentionPanel {
  private readonly root: HTMLElement;
  private readonly input: PlayerInput;
  private readonly title: HTMLElement;
  private readonly round: HTMLElement;
  private readonly bubble: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly zone: HTMLElement;
  private readonly said: HTMLElement;
  private readonly shelf: HTMLElement;
  private run: AttentionRun | null = null;
  private cb: { onDone: (r: AttentionFinish) => void; onCancel: () => void } | null = null;
  private day = 0;
  private order: string[] = [];
  private cards: HTMLButtonElement[] = [];
  private selected = -1;
  /** La ronda que se ve en la estantería. */
  private shown = -1;
  /** La ronda cuya paciencia agotada ya se ha dicho. */
  private told = -1;
  private result: AttentionFinish | null = null;
  private closingMs = 0;
  /** Ya se ha llamado a onDone u onCancel: ni un doble toque ni un doble Enter repiten. */
  private ended = true;

  constructor(root: HTMLElement, input: PlayerInput) {
    this.root = root;
    this.input = input;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Atender a un cliente');
    root.innerHTML = `
      <div class="attn__head"><span class="kick__title attn__title"></span><span class="attn__round"></span></div>
      <div class="attn__zone" role="button" aria-label="Entregar al cliente">
        <div class="attn__bubble" aria-live="polite"></div>
        <div class="attn__patience" aria-hidden="true"><span class="attn__bar"></span></div>
        <div class="attn__said" aria-live="polite"></div>
      </div>
      <div class="attn__shelf" role="group" aria-label="Estantería"></div>
      <div class="attn__foot"><span class="attn__help">Arrastra al cliente · o toca y toca · ◀ ▶ y E</span><button type="button" class="kick__btn attn__quit" aria-label="Dejarlo (Esc)">Dejarlo</button></div>
    `;
    const pick = (s: string): HTMLElement => root.querySelector<HTMLElement>(s)!;
    this.title = pick('.attn__title');
    this.round = pick('.attn__round');
    this.bubble = pick('.attn__bubble');
    this.bar = pick('.attn__bar');
    this.zone = pick('.attn__zone');
    this.said = pick('.attn__said');
    this.shelf = pick('.attn__shelf');
    // Sin foco en los botones: así Enter sólo lo lee el juego, una vez.
    root.addEventListener('pointerdown', (e) => e.preventDefault());
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.zone.addEventListener('click', () => this.deliverSelected());
    pick('.attn__quit').addEventListener('click', () => this.cancel());
  }

  open(c: AttentionCase, day: number, cb: { onDone: (r: AttentionFinish) => void; onCancel: () => void }): void {
    this.run = new AttentionRun(c);
    this.cb = cb;
    this.day = day;
    this.result = null;
    this.closingMs = 0;
    this.ended = false;
    this.told = -1;
    this.title.textContent = c.customer;
    this.said.textContent = c.opening;
    this.said.className = 'attn__said';
    this.renderRound();
    this.input.releaseAll();
    this.root.hidden = false;
  }

  /** Cierra sin avisar a nadie (cambio de escena): la atención a medias no cuenta. */
  close(): void {
    this.run?.cancel();
    this.ended = true;
    this.root.hidden = true;
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  tick(deltaMs: number): void {
    const run = this.run;
    if (!run || this.ended) return;
    if (this.result) {
      if (deltaMs > 0) this.closingMs -= Math.min(deltaMs, 100);
      if (this.closingMs <= 0) this.complete();
      return;
    }
    run.tick(deltaMs);
    if (run.round !== this.shown) {
      const last = run.history[run.history.length - 1];
      if (last?.result === 'timeout' && this.told !== run.round) {
        this.told = run.round;
        this.say(run.timeoutReply, 'wrong');
      }
      if (run.done) return this.settle(run);
      // La tarjeta entregada se queda marcada lo que dura el bloqueo; luego, la ronda siguiente.
      if (run.lockedMs === 0) this.renderRound();
    }
    this.bar.style.width = `${Math.round((run.remainingMs / ATTENTION.roundMs) * 100)}%`;
  }

  move(dir: -1 | 1): void {
    if (!this.live()) return;
    const n = this.cards.length;
    this.select(this.selected < 0 ? (dir > 0 ? 0 : n - 1) : (this.selected + dir + n) % n);
  }

  deliverSelected(): void {
    if (this.selected >= 0) this.deliver(this.selected);
  }

  cancel(): void {
    if (this.ended) return;
    // Con la nota ya puesta, Esc no la tira: sólo cierra antes.
    if (this.result) return this.complete();
    this.ended = true;
    this.run?.cancel();
    this.root.hidden = true;
    this.cb?.onCancel();
  }

  /** Se puede tocar la estantería: hay ronda a la vista y no está en el bloqueo tras una entrega. */
  private live(): boolean {
    const run = this.run;
    return !!run && !this.ended && !this.result && run.round === this.shown && !run.done;
  }

  private renderRound(): void {
    const run = this.run!;
    const r = run.case.rounds[run.round];
    this.shown = run.round;
    this.selected = -1;
    this.round.textContent = `Ronda ${run.round + 1}/${run.case.rounds.length}`;
    this.bubble.textContent = r.hint;
    this.order = shelfOrder(run.case, run.round, this.day);
    const names = labels(this.order);
    this.shelf.innerHTML = this.order.map((_, i) => `<button type="button" class="attn__card" data-i="${i}" aria-label="${escape(names[i])}"><span class="attn__mark" aria-hidden="true"></span>${escape(names[i])}</button>`).join('');
    this.cards = [...this.shelf.querySelectorAll<HTMLButtonElement>('.attn__card')];
    this.cards.forEach((b, i) => this.bindCard(b, i));
    this.bar.style.width = '100%';
  }

  /** Arrastrar hasta el cliente entrega; un toque sin arrastre sólo la elige. */
  private bindCard(el: HTMLButtonElement, i: number): void {
    let pointer: number | null = null;
    let x0 = 0;
    let y0 = 0;
    let dragging = false;
    el.addEventListener('pointerdown', (e) => {
      if (pointer !== null || !this.live()) return;
      pointer = e.pointerId;
      x0 = e.clientX;
      y0 = e.clientY;
      dragging = false;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Sin captura: el arrastre sigue con los eventos que le lleguen a la tarjeta.
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointer) return;
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      if (!dragging && Math.hypot(dx, dy) < DRAG_PX) return;
      dragging = true;
      el.classList.add('is-drag');
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    const end = (e: PointerEvent, drop: boolean): void => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      el.classList.remove('is-drag');
      el.style.transform = '';
      if (!drop) return;
      if (!dragging) return this.select(i);
      const z = this.zone.getBoundingClientRect();
      if (e.clientX >= z.left && e.clientX <= z.right && e.clientY >= z.top && e.clientY <= z.bottom) this.deliver(i);
    };
    el.addEventListener('pointerup', (e) => end(e, true));
    el.addEventListener('pointercancel', (e) => end(e, false));
    el.addEventListener('lostpointercapture', (e) => end(e, false));
  }

  private select(i: number): void {
    if (!this.live()) return;
    this.selected = i;
    this.cards.forEach((b, k) => b.classList.toggle('is-on', k === i));
  }

  private deliver(i: number): void {
    const run = this.run;
    if (!run || !this.live()) return;
    const r = run.deliver(this.order[i]);
    if (!r) return;
    const card = this.cards[i];
    card.classList.remove('is-on');
    card.classList.add(`is-${r.result}`);
    card.querySelector<HTMLElement>('.attn__mark')!.textContent = MARK[r.result];
    this.selected = -1;
    this.say(r.reply, r.result);
    if (run.done) this.settle(run);
  }

  private say(text: string, result: AttentionResult): void {
    this.said.textContent = text;
    this.said.className = `attn__said is-${result}`;
  }

  /** Las tres rondas hechas: la nota a la vista y, en un momento, se cierra con el resultado. */
  private settle(run: AttentionRun): void {
    const r = run.finish();
    if (!r) return;
    this.result = r;
    this.closingMs = CLOSE_MS;
    this.round.textContent = `${r.points}/${ATTENTION.maxPoints}`;
    this.bubble.textContent = `Has atendido a ${run.case.customer.charAt(0).toLowerCase()}${run.case.customer.slice(1)}. Atención ${GRADE_LABEL[r.grade.id]}.`;
  }

  private complete(): void {
    const r = this.result;
    if (this.ended || !r) return;
    this.ended = true;
    this.root.hidden = true;
    this.cb?.onDone(r);
  }
}
