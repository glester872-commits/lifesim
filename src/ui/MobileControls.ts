import type { PlayerInput, TouchContext } from '../systems/PlayerInput';

/** El puntero principal es un dedo: móvil o tableta. Un portátil con pantalla táctil sigue con ratón. */
const COARSE = '(pointer: coarse)';

/**
 * El control se queda con su dedo aunque salga de él. Si el dedo ya se ha
 * levantado (un toque muy corto), el navegador no deja capturarlo y lanza: no
 * pasa nada, el pointerup llega igual al propio control.
 */
function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // Sin captura: el control sigue funcionando con los eventos que le lleguen.
  }
}

/**
 * Controles táctiles: joystick abajo a la izquierda y botón de acción abajo a
 * la derecha (más «volver» cuando hay un menú abierto). Sólo escriben en
 * systems/PlayerInput; el bucle del juego lo lee junto al teclado, así que
 * andar, hablar, entrar o elegir en un menú es lo mismo con el dedo que con
 * las teclas. El mapa sigue siendo su botón de siempre (ui/MapScreen).
 *
 * Aparecen si el puntero principal es un dedo o en cuanto se toca la pantalla
 * (un portátil híbrido): en un PC con ratón no hay nada que ver.
 *
 * Cada control atiende a su propio dedo (pointerId, con captura): se puede
 * andar con el pulgar izquierdo mientras el derecho pulsa la acción.
 */
export class MobileControls {
  private readonly root: HTMLElement;
  private readonly input: PlayerInput;
  private readonly stick: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly action: HTMLButtonElement;
  private readonly label: HTMLElement;
  private readonly back: HTMLButtonElement;
  private stickPointer: number | null = null;
  private center = { x: 0, y: 0 };
  private radius = 1;
  private touched = false;
  private enabled = false;

  constructor(root: HTMLElement, input: PlayerInput) {
    this.root = root;
    this.input = input;
    root.innerHTML = `
      <div class="touch__stick" aria-hidden="true">
        <div class="touch__base"><span class="touch__notch"></span></div>
        <div class="touch__knob"></div>
      </div>
      <button type="button" class="touch__back" aria-label="Volver (Esc)" hidden>Volver</button>
      <button type="button" class="touch__action" aria-label="Interactuar (E)">
        <span class="touch__key">E</span>
        <span class="touch__label"></span>
      </button>
    `;
    const pick = <T extends HTMLElement>(s: string): T => {
      const el = root.querySelector<T>(s);
      if (!el) throw new Error(`Controles táctiles: falta ${s}`);
      return el;
    };
    this.stick = pick('.touch__stick');
    this.base = pick('.touch__base');
    this.knob = pick('.touch__knob');
    this.action = pick('.touch__action');
    this.label = pick('.touch__label');
    this.back = pick('.touch__back');

    this.bindStick();
    this.bindButton(this.action, 'interact');
    this.bindButton(this.back, 'cancel');
    input.onContext((c) => this.show(c));

    const media = window.matchMedia(COARSE);
    const sync = (): void => this.enable(media.matches || this.touched);
    media.addEventListener('change', sync);
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType !== 'touch' || this.touched) return;
        this.touched = true;
        sync();
      },
      { passive: true },
    );
    // Sin foco (otra app, la barra del navegador), nadie sigue andando solo.
    window.addEventListener('blur', () => this.letGo());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.letGo();
    });
    sync();
  }

  private enable(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.root.classList.toggle('is-on', on);
    document.body.classList.toggle('has-touch', on);
    if (!on) this.letGo();
  }

  /** El joystick: el dedo que lo toca lo lleva hasta que se levanta; el mando vuelve solo al centro. */
  private bindStick(): void {
    const el = this.stick;
    el.addEventListener('pointerdown', (e) => {
      if (this.stickPointer !== null) return;
      e.preventDefault();
      this.stickPointer = e.pointerId;
      capture(el, e.pointerId);
      const r = this.base.getBoundingClientRect();
      this.center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      // Lo que recorre el mando: hasta que su borde toca el de la base.
      this.radius = Math.max(1, (r.width - this.knob.offsetWidth) / 2);
      el.classList.add('is-active');
      this.follow(e);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickPointer) this.follow(e);
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId === this.stickPointer) this.releaseStick();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private follow(e: PointerEvent): void {
    let dx = e.clientX - this.center.x;
    let dy = e.clientY - this.center.y;
    const d = Math.hypot(dx, dy);
    if (d > this.radius) {
      dx *= this.radius / d;
      dy *= this.radius / d;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.input.setStick(dx / this.radius, dy / this.radius);
  }

  private releaseStick(): void {
    this.stickPointer = null;
    this.stick.classList.remove('is-active');
    this.knob.style.transform = '';
    this.input.setStick(0, 0);
  }

  /** Un botón es una tecla: pulsado mientras el dedo que lo tocó siga encima. */
  private bindButton(el: HTMLButtonElement, name: string): void {
    let pointer: number | null = null;
    el.addEventListener('pointerdown', (e) => {
      if (pointer !== null) return;
      e.preventDefault();
      pointer = e.pointerId;
      capture(el, e.pointerId);
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

  /** Lo que dice el mundo: qué hace ahora el botón de acción, si se ofrece volver y si el joystick sobra. */
  private show(c: TouchContext): void {
    this.root.classList.toggle('is-busy', c.busy);
    this.action.classList.toggle('is-ready', c.action !== null);
    this.label.textContent = c.action ?? '';
    this.action.setAttribute('aria-label', c.action ? `${c.action} (E)` : 'Interactuar (E)');
    this.back.hidden = !c.back;
    // Con un diálogo o un menú delante no se anda: el stick se suelta.
    if (c.busy && this.stickPointer !== null) this.releaseStick();
  }

  private letGo(): void {
    if (this.stickPointer !== null) this.releaseStick();
    this.input.releaseAll();
    this.root.querySelectorAll('.is-pressed').forEach((b) => b.classList.remove('is-pressed'));
  }
}
