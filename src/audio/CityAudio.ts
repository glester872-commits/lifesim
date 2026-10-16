import { AUDIO_GAIN, AUDIO_LABEL, AUDIO_LEVELS, loadAudioLevel, saveAudioLevel, type AudioLevel } from '../config/audio';
import { LAYERS, SILENT, type Layer, type Mix } from '../systems/Soundscape';

/**
 * El único sonido del juego: cuatro capas de ambiente (agua, murmullo, tráfico, metro) sintetizadas con Web Audio a
 * partir de un solo ruido compartido, sin archivos ni descargas. Lo que suena lo decide systems/Soundscape; aquí sólo
 * se lleva cada capa a su volumen con fundidos cortos.
 *
 *   - Se monta una vez para todo el juego, con un número fijo de nodos: cambiar de sitio sube y baja capas, nunca
 *     crea otras. No hay un sintetizador por persona ni por coche.
 *   - No suena nada antes de que el jugador toque una tecla o la pantalla: el navegador no lo permite y no se promete.
 *   - Con la pestaña oculta, el contexto se suspende; al volver, sigue donde estaba (sin ráfaga: las capas sólo se
 *     mueven con fundidos desde su valor actual).
 *   - Un limitador al final: por mucho que coincidan las capas, no satura.
 */

/** Cuánto aporta cada capa a tope, antes del volumen general: el tráfico y el metro, graves; el agua y la gente, suaves. */
const LAYER_MAX: Readonly<Record<Layer, number>> = { water: 0.55, murmur: 0.5, traffic: 0.7, metro: 0.75 };
/** Constante de tiempo de los fundidos (s): ≈ tres veces esto hasta llegar. */
const FADE = 0.25;
const QUICK = 0.06;

export interface AudioStats {
  level: AudioLevel;
  /** Estado del contexto: sin crear (nadie ha tocado nada), suspendido o sonando. */
  context: AudioContextState | 'none';
  nodes: number;
  layers: number;
  target: Mix;
  /** Ganancia real de cada capa ahora mismo (lo que suena, antes del volumen general). */
  gain: Mix;
}

export class CityAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly gains = new Map<Layer, GainNode>();
  private nodes = 0;
  private level: AudioLevel = loadAudioLevel();
  private target: Mix = { ...SILENT };
  private gesture = false;
  private readonly button: HTMLButtonElement | null;

  constructor(button: HTMLButtonElement | null) {
    this.button = button;
    const unlock = (): void => {
      this.gesture = true;
      this.wake();
      if (this.ctx?.state === 'running') for (const e of ['pointerdown', 'keydown', 'touchend'] as const) window.removeEventListener(e, unlock, true);
    };
    for (const e of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(e, unlock, true);
    document.addEventListener('visibilitychange', () => (document.hidden ? void this.ctx?.suspend() : this.wake()));
    button?.addEventListener('click', () => {
      this.cycle();
      button.blur();
    });
    // N: un paso de volumen (apagado → bajo → medio → alto → apagado). No mientras se escribe en el móvil.
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement | null;
      if (e.code !== 'KeyN' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || t?.closest('input, textarea, [contenteditable]')) return;
      this.cycle();
    });
    this.paint();
  }

  /** El volumen elegido (también para `lifesim.audio()`): se recuerda en el navegador y se aplica con un fundido. */
  setLevel(level: AudioLevel): void {
    this.level = level;
    saveAudioLevel(level);
    this.paint();
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(AUDIO_GAIN[level], this.ctx.currentTime, QUICK);
    if (level === 'off') window.setTimeout(() => this.level === 'off' && void this.ctx?.suspend(), 400);
    else this.wake();
  }

  get volume(): AudioLevel {
    return this.level;
  }

  cycle(): void {
    this.setLevel(AUDIO_LEVELS[(AUDIO_LEVELS.indexOf(this.level) + 1) % AUDIO_LEVELS.length]);
  }

  /** Cuánto debe sonar cada capa (0–1). Llega a su sitio con un fundido; llamarlo a menudo no apila nada. */
  setMix(mix: Mix, fade = FADE): void {
    this.target = { ...mix };
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    for (const layer of LAYERS) this.gains.get(layer)!.gain.setTargetAtTime(mix[layer] * LAYER_MAX[layer], now, fade);
  }

  /** Al irse de un sitio: todo a cero, rápido pero sin chasquido. El sitio nuevo sube lo suyo. */
  silence(): void {
    this.setMix(SILENT, QUICK);
  }

  stats(): AudioStats {
    const gain = { ...SILENT };
    for (const layer of LAYERS) gain[layer] = Math.round(((this.gains.get(layer)?.gain.value ?? 0) / LAYER_MAX[layer]) * 1000) / 1000;
    return { level: this.level, context: this.ctx?.state ?? 'none', nodes: this.nodes, layers: this.gains.size, target: { ...this.target }, gain };
  }

  /** Arranca (o reanuda) sólo con un gesto ya hecho, con sonido elegido y la pestaña a la vista. */
  private wake(): void {
    if (!this.gesture || this.level === 'off' || document.hidden) return;
    if (!this.ctx) this.build();
    void this.ctx!.resume().then(() => this.setMix(this.target));
  }

  private paint(): void {
    if (!this.button) return;
    this.button.innerHTML = `<span class="map-button__key">N</span> Sonido: ${AUDIO_LABEL[this.level]}`;
    this.button.setAttribute('aria-label', `Volumen del ambiente: ${AUDIO_LABEL[this.level]}. Cambiar (N)`);
    this.button.classList.toggle('is-muted', this.level === 'off');
  }

  /** El grafo entero, una vez: ruido compartido → filtro de cada capa → su volumen → volumen general → limitador. */
  private build(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    const count = <T extends AudioNode>(n: T): T => {
      this.nodes++;
      return n;
    };
    const limiter = count(new DynamicsCompressorNode(ctx, { threshold: -18, knee: 6, ratio: 12, attack: 0.005, release: 0.25 }));
    limiter.connect(ctx.destination);
    this.master = count(new GainNode(ctx, { gain: AUDIO_GAIN[this.level] }));
    this.master.connect(limiter);

    // Dos segundos de ruido blanco: la materia de las cuatro capas. Cada una lo lee desde otro punto para que no se parezcan.
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = (offset: number): AudioBufferSourceNode => {
      const s = count(new AudioBufferSourceNode(ctx, { buffer: noise, loop: true }));
      s.start(0, offset);
      return s;
    };
    const filter = (type: BiquadFilterType, frequency: number, Q = 0.7): BiquadFilterNode => count(new BiquadFilterNode(ctx, { type, frequency, Q }));
    /** Un vaivén lento (o el pulso de una charla) sobre el volumen de `into`: osc → profundidad → into.gain. */
    const sway = (into: GainNode, hz: number, depth: number): void => {
      const osc = count(new OscillatorNode(ctx, { frequency: hz }));
      const amount = count(new GainNode(ctx, { gain: depth }));
      osc.connect(amount).connect(into.gain);
      osc.start();
    };
    const layer = (name: Layer): GainNode => {
      const g = count(new GainNode(ctx, { gain: 0 }));
      g.connect(this.master!);
      this.gains.set(name, g);
      return g;
    };

    // Agua: siseo claro de la fuente, con un vaivén lento como el del chorro.
    const water = count(new GainNode(ctx, { gain: 0.56 }));
    source(0).connect(filter('highpass', 600)).connect(filter('lowpass', 2800)).connect(water).connect(layer('water'));
    sway(water, 0.21, 0.13);
    // Murmullo: banda de la voz, sin palabras, con el pulso irregular de varias conversaciones (dos ritmos que no cuadran).
    // La banda de voz deja pasar poco ruido: este volumen la pone a la par del resto (medido: ≈ −40 dB a tope en «bajo»).
    const murmur = count(new GainNode(ctx, { gain: 1.9 }));
    source(0.5).connect(filter('bandpass', 480, 0.9)).connect(filter('lowpass', 1300)).connect(murmur).connect(layer('murmur'));
    sway(murmur, 3.3, 0.7);
    sway(murmur, 5.1, 0.45);
    // Tráfico: rumor grave de motores y ruedas, dos pasos de paso bajo para que no silbe.
    source(1).connect(filter('lowpass', 320)).connect(filter('lowpass', 420)).connect(layer('traffic'));
    // Metro: el retumbar del túnel y el zumbido de la línea.
    const metro = layer('metro');
    source(1.5).connect(filter('lowpass', 150)).connect(metro);
    const hum = count(new OscillatorNode(ctx, { frequency: 50 }));
    hum.connect(count(new GainNode(ctx, { gain: 0.08 }))).connect(metro);
    hum.start();
  }
}
