import { GAME_MINUTES_PER_REAL_SECOND, MAX_FRAME_MS } from '../config/constants.ts';
import type { GameState } from '../state/GameState.ts';
import { weekdayOf, type Midnight } from './Calendar.ts';

const MINUTES_PER_DAY = 24 * 60;

/**
 * Reloj del mundo. Acumula fracciones de minuto para que el ritmo no dependa
 * del framerate. Preparado para pausa; los saltos temporales de versiones
 * futuras entran por advanceMinutes().
 */
export class TimeSystem {
  private carry = 0;
  private paused = false;

  private readonly state: GameState;

  constructor(state: GameState) {
    this.state = state;
  }

  setPaused(value: boolean): void {
    this.paused = value;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /**
   * Minuto del día con la fracción en curso: quien camina según el reloj se
   * mueve suave y no a saltos de minuto. La pausa conserva la fracción para
   * que nadie retroceda al abrir un diálogo.
   */
  get minuteOfDay(): number {
    return this.state.hour * 60 + this.state.minute + this.carry;
  }

  update(deltaMs: number): void {
    if (this.paused) return;
    const step = Math.min(deltaMs, MAX_FRAME_MS);
    this.carry += (step / 1000) * GAME_MINUTES_PER_REAL_SECOND;
    const whole = Math.floor(this.carry);
    if (whole <= 0) return;
    this.carry -= whole;
    this.advanceMinutes(whole);
  }

  /**
   * Adelanta el reloj: el paso de cada frame, dormir, trabajar, el metro o un
   * salto de depuración. Si cruza medianoches, avisa de cada una en orden
   * (evento 'midnight', systems/Calendar) después de mover el reloj: quien
   * escucha ya ve la hora nueva. Un salto de 30 horas avisa dos veces, no una;
   * cargar una partida no avisa (no se cruza nada).
   */
  advanceMinutes(minutes: number): void {
    if (minutes <= 0) return;
    const from = this.state.day;
    const total = this.state.hour * 60 + this.state.minute + minutes;
    const days = Math.floor(total / MINUTES_PER_DAY);
    const rest = total % MINUTES_PER_DAY;
    this.state.setClock(from + days, Math.floor(rest / 60), rest % 60);
    for (let day = from + 1; day <= from + days; day++) {
      const midnight: Midnight = { day, weekday: weekdayOf(day), from, to: from + days };
      this.state.emit('midnight', midnight);
    }
  }
}

/** El formato del reloj vive con el calendario: «Lun · Día 3 · 08:42». */
export { formatClock } from './Calendar.ts';
