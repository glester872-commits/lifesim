import type { PlayerInput } from '../systems/PlayerInput';
import { contactDelay, KICK_ORDER, KICKS, LEG_LABEL, nextCue, STRIKES, type Drill, type DrillSet, type Grade, type Strike } from '../systems/Taekwondo';

/**
 * El panel de la clase de patadas (systems/Taekwondo): la orden de ahora y las que vienen, la barra del compás con el
 * momento de soltar la pierna, la distancia al pao contra lo que alcanza la patada elegida y lo que acaba de pasar.
 *
 * Sus botones son teclas (systems/PlayerInput): patada 1/2/3, pierna izquierda (J) y derecha (K), atrás y adelante. Se
 * pulsan con el dedo o con el ratón; con teclado, las mismas teclas. No decide nada: WorldScene lo lee junto al teclado.
 */

const GRADE_MARK: Readonly<Record<Grade, string>> = { perfect: '●', good: '◐', 'wrong-leg': '✕', 'wrong-kick': '✕', miss: '○' };

export class KickDrill {
  private readonly root: HTMLElement;
  private readonly input: PlayerInput;
  private readonly cue: HTMLElement;
  private readonly queue: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly now: HTMLElement;
  private readonly reach: HTMLElement;
  private readonly said: HTMLElement;
  private readonly kicks: HTMLButtonElement[];
  private readonly title: HTMLElement;

  constructor(root: HTMLElement, input: PlayerInput) {
    this.root = root;
    this.input = input;
    root.innerHTML = `
      <div class="kick__title"></div>
      <div class="kick__cue" aria-live="polite"></div>
      <div class="kick__beat"><span class="kick__bar"></span><span class="kick__now">Ahora</span></div>
      <div class="kick__queue"></div>
      <div class="kick__reach"></div>
      <div class="kick__said" aria-live="polite"></div>
      <div class="kick__pad">
        <div class="kick__types" role="group" aria-label="Patada">
          ${KICK_ORDER.map((k, i) => `<button type="button" class="kick__btn kick__type" data-key="${['one', 'two', 'three'][i]}" aria-label="${KICKS[k].label} (${i + 1})"><span class="kick__k">${i + 1}</span>${KICKS[k].label}</button>`).join('')}
        </div>
        <div class="kick__moves" role="group" aria-label="Distancia">
          <button type="button" class="kick__btn" data-key="kickBack" aria-label="Atrás">◀ Atrás</button>
          <button type="button" class="kick__btn kick__guard" data-key="guard" aria-label="Guardia (L, mantener)" hidden><span class="kick__k">L</span>Guardia</button>
          <button type="button" class="kick__btn" data-key="kickFore" aria-label="Adelante">Adelante ▶</button>
        </div>
        <div class="kick__legs" role="group" aria-label="Pierna">
          <button type="button" class="kick__btn kick__leg" data-key="kickLeft" aria-label="Pierna izquierda (J)"><span class="kick__k">J</span>Izquierda</button>
          <button type="button" class="kick__btn kick__leg" data-key="kickRight" aria-label="Pierna derecha (K)"><span class="kick__k">K</span>Derecha</button>
        </div>
      </div>
      <div class="kick__foot"><span class="kick__help">A/D o ◀ ▶ distancia</span><button type="button" class="kick__btn kick__end" data-key="cancel" aria-label="Terminar la clase (Esc)">Terminar</button></div>
    `;
    const pick = (s: string): HTMLElement => root.querySelector<HTMLElement>(s)!;
    this.title = pick('.kick__title');
    this.cue = pick('.kick__cue');
    this.queue = pick('.kick__queue');
    this.bar = pick('.kick__bar');
    this.now = pick('.kick__now');
    this.reach = pick('.kick__reach');
    this.said = pick('.kick__said');
    this.kicks = [...root.querySelectorAll<HTMLButtonElement>('.kick__type')];
    root.querySelectorAll<HTMLButtonElement>('.kick__btn').forEach((b) => this.bind(b, b.dataset.key!));
  }

  /** Un botón es una tecla mientras el dedo (o el ratón) lo pisa. */
  private bind(el: HTMLButtonElement, name: string): void {
    let pointer: number | null = null;
    el.addEventListener('pointerdown', (e) => {
      if (pointer !== null) return;
      e.preventDefault();
      pointer = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Sin captura: el botón sigue funcionando con los eventos que le lleguen.
      }
      el.classList.add('is-pressed');
      this.input.press(name);
    });
    const up = (e: PointerEvent): void => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      el.classList.remove('is-pressed');
      this.input.release(name);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Patadas (elegir patada y pierna) o saco (cada mano su golpe, y la guardia mantenida). */
  open(title: string, set: DrillSet = 'kicks'): void {
    const punches = set === 'punches';
    this.title.textContent = title;
    this.said.textContent = punches ? 'Guardia arriba, mentón abajo. La entrenadora cuenta.' : 'Saluda, guardia arriba. La instructora cuenta.';
    this.root.querySelector<HTMLElement>('.kick__types')!.hidden = punches;
    this.root.querySelector<HTMLElement>('.kick__guard')!.hidden = !punches;
    const [left, right] = this.root.querySelectorAll<HTMLButtonElement>('.kick__leg');
    left.innerHTML = `<span class="kick__k">J</span>${punches ? 'Mano izq. · jab' : 'Izquierda'}`;
    right.innerHTML = `<span class="kick__k">K</span>${punches ? 'Mano der. · directo' : 'Derecha'}`;
    left.setAttribute('aria-label', punches ? 'Jab, mano izquierda (J)' : 'Pierna izquierda (J)');
    right.setAttribute('aria-label', punches ? 'Directo, mano derecha (K)' : 'Pierna derecha (K)');
    this.root.querySelector<HTMLElement>('.kick__help')!.textContent = punches ? 'W/S o ◀ ▶ distancia · L guardia' : 'A/D o ◀ ▶ distancia';
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
    this.input.release('kickBack');
    this.input.release('kickFore');
    this.input.release('guard');
  }

  /** Borde del panel en pantalla: la cámara deja la práctica visible encima. */
  get top(): number { return this.root.getBoundingClientRect().top; }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  say(text: string, good: boolean): void {
    this.said.textContent = text;
    this.said.classList.toggle('is-good', good);
  }

  /** Cada frame (o casi): la orden, el compás, la cola y la distancia. */
  render(d: Drill, t: number, kick: Strike, distance: number): void {
    const i = nextCue(d);
    this.kicks.forEach((b, k) => b.classList.toggle('is-on', KICK_ORDER[k] === kick));
    if (i < 0) {
      this.cue.textContent = 'Fin de la serie';
      this.bar.style.width = '100%';
      this.now.classList.remove('is-on');
    } else {
      const c = d.cues[i];
      this.cue.textContent = c.kick === 'guard' ? '¡Guardia!' : d.set === 'punches' ? `${STRIKES[c.kick].label} · mano ${LEG_LABEL[c.leg]}` : `${STRIKES[c.kick].label} · ${LEG_LABEL[c.leg]}`;
      // La barra se llena hasta el compás; «Ahora» se enciende cuando hay que soltar la patada que pide.
      const prev = i > 0 ? d.cues[i - 1].at : 0;
      this.bar.style.width = `${Math.round(Math.min(1, Math.max(0, (t - prev) / (c.at - prev))) * 100)}%`;
      const release = c.at - contactDelay(c.kick);
      this.now.classList.toggle('is-on', t >= release - 120 && t <= release + 160);
    }
    this.queue.textContent = d.cues.map((_, k) => (d.results[k] ? GRADE_MARK[d.results[k]!] : k === i ? '▸' : '·')).join(' ');
    const [lo, hi] = STRIKES[kick].reach;
    const ok = distance >= lo && distance <= hi;
    this.reach.textContent = `Distancia ${distance.toFixed(1)} · ${d.set === 'punches' ? 'el' : 'la'} ${STRIKES[kick].label.toLowerCase()} llega de ${lo} a ${hi}`;
    this.reach.classList.toggle('is-ok', ok);
  }
}
