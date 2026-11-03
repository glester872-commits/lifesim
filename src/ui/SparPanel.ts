import type { PlayerInput } from '../systems/PlayerInput';
import { distanceOf, DRILL_LABEL, DRILL_MOVES, grappleFor, MOVES, SPAR, slotsOf, specOf, type Bout, type MoveId } from '../systems/Sparring';

/**
 * El panel del combate (systems/Sparring): marcador, asalto y tiempo, lo que acaba de pasar y la distancia contra lo que
 * alcanza el golpe elegido. Sus botones son teclas (systems/PlayerInput), como los de la clase de patadas: golpe 1/2/3,
 * izquierda (J) o derecha (K), guardia (L, mantenida), atrás y adelante (A/D), y terminar (Esc). Con dedo o ratón.
 * En MMA, además, la lucha (G): su botón dice lo que toca en la fase (entrar al clinch, derribar, fijar o escapar), y
 * el panel dice la fase y el equilibrio.
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
  private readonly grab: HTMLButtonElement;
  private readonly phase: HTMLElement;

  constructor(root: HTMLElement, input: PlayerInput) {
    this.root = root;
    this.input = input;
    root.innerHTML = `
      <div class="kick__title"></div>
      <div class="spar__score"></div>
      <div class="spar__clock"></div>
      <div class="spar__phase" hidden></div>
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
          <button type="button" class="kick__btn spar__grab" data-key="grab" hidden><span class="kick__k">G</span><span class="spar__grab-label">Clinch</span></button>
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
    this.grab = root.querySelector<HTMLButtonElement>('.spar__grab')!;
    this.phase = pick('.spar__phase');
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
    // En MMA el primer botón son los puños: la mano decide (J jab, K directo).
    const label = (id: MoveId): string => (b.style === 'mma' && id === 'jab' ? 'Puños' : MOVES[id].label);
    this.types.innerHTML = slotsOf(b)
      .map((id, i) => `<button type="button" class="kick__btn kick__type" data-key="${['one', 'two', 'three'][i]}" aria-label="${label(id)} (${i + 1})"><span class="kick__k">${i + 1}</span>${label(id)}${b.style === 'mma' ? '' : ` · ${MOVES[id].points}`}</button>`)
      .join('');
    this.moves = [...this.types.querySelectorAll<HTMLButtonElement>('.kick__btn')];
    this.moves.forEach((m) => this.bind(m));
    const grappling = b.drill !== null && DRILL_MOVES[b.drill].includes('clinch');
    this.grab.hidden = !grappling;
    this.phase.hidden = b.style !== 'mma';
    this.sides.forEach((s) => (s.hidden = b.drill === 'grappling'));
    this.said.textContent = b.drill ? `${DRILL_LABEL[b.drill]}. Saludo, guardia arriba y empezamos.` : 'Saludo. Guardia arriba. ¡Combate!';
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
    const slots = slotsOf(b);
    this.moves.forEach((m, i) => m.classList.toggle('is-on', slots[i] === selected));
    // En taekwondo se patea con una pierna; en boxeo, se golpea con una mano; en MMA, según el golpe elegido.
    const kick = b.style === 'taekwondo' || (b.style === 'mma' && selected !== 'jab' && selected !== 'cross');
    // Agarrados, J y K hacen la acción de lucha de la fase: lo dicen.
    const grip = b.style === 'mma' && b.grip.phase !== 'stand' ? MOVES[grappleFor(b, 'p')].label : null;
    const names = grip ? [grip, grip] : b.style === 'mma' && !kick ? ['Jab izq.', 'Directo der.'] : kick ? ['Pierna izq.', 'Pierna der.'] : ['Mano izq.', 'Mano der.'];
    this.sides.forEach((s, i) => (s.querySelector('.spar__side')!.textContent = names[i]));
    this.score.textContent = `Tú ${b.p.score} – ${b.o.score} ${opponent}`;
    const left = Math.max(0, Math.ceil((b.roundEnd - Math.max(b.t, b.breakUntil)) / 1000));
    this.clock.textContent = b.t < b.breakUntil ? 'Descanso' : `${b.golden ? 'Punto de oro' : `Asalto ${b.round} de ${SPAR.rounds}`} · ${left} s`;
    const d = distanceOf(b);
    if (b.style === 'mma') {
      const g = b.grip;
      const act = grappleFor(b, 'p');
      this.grab.querySelector('.spar__grab-label')!.textContent = MOVES[act].label;
      const where = g.phase === 'stand' ? 'De pie' : g.phase === 'clinch' ? 'Clinch' : g.top === 'p' ? `Suelo, arriba · fijaciones ${g.pins}/${SPAR.pinsToControl}` : `Suelo, abajo · te ha fijado ${g.pins}/${SPAR.pinsToControl}`;
      this.phase.textContent = `${where} · equilibrio ${Math.round(b.p.balance * 100)} %`;
      if (g.phase !== 'stand') {
        const hint = g.phase === 'clinch' ? 'G derribo · L base · mantén atrás para soltarte' : g.top === 'p' ? 'G fijar · L controlar su escape' : 'G escapar · L enmarcar contra la fijación';
        this.reach.textContent = hint;
        this.reach.classList.toggle('is-ok', act === 'pin' || b.p.balance >= SPAR.balanceMin);
        return;
      }
    }
    const side = b.style === 'mma' && selected === 'jab' ? 'L' : 'R';
    const [lo, hi] = specOf(b.style, selected, side).reach;
    const grabReach = this.grab.hidden ? '' : ` · clinch hasta ${MOVES.clinch.reach[1]}`;
    this.reach.textContent = slots.length ? `Distancia ${d.toFixed(1)} · ${(b.style === 'mma' && selected === 'jab' ? 'jab' : MOVES[selected].label.toLowerCase())} llega de ${lo} a ${hi}${grabReach}` : `Distancia ${d.toFixed(1)}${grabReach}`;
    this.reach.classList.toggle('is-ok', slots.length ? d >= lo && d <= hi : d <= MOVES.clinch.reach[1]);
  }
}
