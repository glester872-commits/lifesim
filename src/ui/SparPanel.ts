import type { PlayerInput } from '../systems/PlayerInput';
import { distanceOf, MOVES, SPAR, STYLE_MOVES, type Bout, type MoveId } from '../systems/Sparring';

/**
 * El panel del combate (systems/Sparring): marcador, asalto y tiempo, lo que acaba de pasar y la distancia contra lo que
 * alcanza el golpe elegido. Sus botones son teclas (systems/PlayerInput), como los de la clase de patadas: golpe 1/2/3,
 * izquierda (J) o derecha (K), guardia (L, mantenida), atrás y adelante (A/D), y terminar (Esc). Con dedo o ratón.
 */
export class SparPanel {
  private readonly root: HTMLElement;
  private readonly input: PlayerInput;
  private readonly title: HTMLElement;
  private readonly score: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly said: HTMLElement;
  private readonly reach: HTMLElement;
  private moves: HTMLButtonElement[] = [];
  private readonly types: HTMLElement;
  private readonly sides: HTMLButtonElement[];

  constructor(root: HTMLElement, input: PlayerInput) {
    this.root = root;
    this.input = input;
    root.innerHTML = `
      <div class="kick__title"></div>
      <div class="spar__score"></div>
      <div class="spar__clock"></div>
      <div class="kick__reach"></div>
      <div class="kick__said" aria-live="polite"></div>
      <div class="kick__pad">
        <div class="kick__types" role="group" aria-label="Golpe"></div>
        <div class="kick__moves" role="group" aria-label="Distancia y guardia">
          <button type="button" class="kick__btn" data-key="kickBack" aria-label="Atrás (A)">◀ Atrás</button>
          <button type="button" class="kick__btn spar__guard" data-key="guard" aria-label="Guardia (L, mantener)"><span class="kick__k">L</span>Guardia</button>
          <button type="button" class="kick__btn" data-key="kickFore" aria-label="Adelante (D)">Adelante ▶</button>
        </div>
        <div class="kick__legs" role="group" aria-label="Izquierda o derecha">
          <button type="button" class="kick__btn kick__leg" data-key="kickLeft"><span class="kick__k">J</span><span class="spar__side">Izquierda</span></button>
          <button type="button" class="kick__btn kick__leg" data-key="kickRight"><span class="kick__k">K</span><span class="spar__side">Derecha</span></button>
        </div>
      </div>
      <div class="kick__foot"><span class="kick__help">Guardia arriba a tiempo para parar · A/D distancia</span><button type="button" class="kick__btn kick__end" data-key="cancel" aria-label="Terminar el combate (Esc)">Terminar</button></div>
    `;
    const pick = (s: string): HTMLElement => root.querySelector<HTMLElement>(s)!;
    this.title = pick('.kick__title');
    this.score = pick('.spar__score');
    this.clock = pick('.spar__clock');
    this.said = pick('.kick__said');
    this.reach = pick('.kick__reach');
    this.types = pick('.kick__types');
    this.sides = [...root.querySelectorAll<HTMLButtonElement>('.kick__leg')];
    root.querySelectorAll<HTMLButtonElement>('.kick__btn').forEach((b) => this.bind(b));
  }

  private bind(el: HTMLButtonElement): void {
    const name = el.dataset.key!;
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

  open(title: string, b: Bout): void {
    this.title.textContent = title;
    this.types.innerHTML = STYLE_MOVES[b.style]
      .map((id, i) => `<button type="button" class="kick__btn kick__type" data-key="${['one', 'two', 'three'][i]}" aria-label="${MOVES[id].label} (${i + 1})"><span class="kick__k">${i + 1}</span>${MOVES[id].label} · ${MOVES[id].points}</button>`)
      .join('');
    this.moves = [...this.types.querySelectorAll<HTMLButtonElement>('.kick__btn')];
    this.moves.forEach((m) => this.bind(m));
    // En taekwondo se patea con una pierna; en boxeo, se golpea con una mano.
    this.sides.forEach((s, i) => (s.querySelector('.spar__side')!.textContent = b.style === 'taekwondo' ? ['Pierna izq.', 'Pierna der.'][i] : ['Mano izq.', 'Mano der.'][i]));
    this.said.textContent = 'Saludo. Guardia arriba. ¡Combate!';
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
    this.input.releaseAll();
    this.root.querySelectorAll('.is-pressed').forEach(el => el.classList.remove('is-pressed'));
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

  render(b: Bout, opponent: string, selected: MoveId): void {
    this.moves.forEach((m, i) => m.classList.toggle('is-on', STYLE_MOVES[b.style][i] === selected));
    this.score.textContent = `Tú ${b.p.score} – ${b.o.score} ${opponent}`;
    const left = Math.max(0, Math.ceil((b.roundEnd - Math.max(b.t, b.breakUntil)) / 1000));
    this.clock.textContent = b.t < b.breakUntil ? 'Descanso' : `${b.golden ? 'Punto de oro' : `Asalto ${b.round} de ${SPAR.rounds}`} · ${left} s`;
    const d = distanceOf(b);
    const [lo, hi] = MOVES[selected].reach;
    this.reach.textContent = `Distancia ${d.toFixed(1)} · ${MOVES[selected].label.toLowerCase()} llega de ${lo} a ${hi}`;
    this.reach.classList.toggle('is-ok', d >= lo && d <= hi);
  }
}
