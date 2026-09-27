import { GAME_MINUTES_PER_REAL_SECOND, MAX_FRAME_MS } from '../config/constants';
import type { GameState } from '../state/GameState';

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

  advanceMinutes(minutes: number): void {
    if (minutes <= 0) return;
    const total =
      this.state.hour * 60 + this.state.minute + minutes;
    const days = Math.floor(total / MINUTES_PER_DAY);
    const rest = total % MINUTES_PER_DAY;
    this.state.setClock(this.state.day + days, Math.floor(rest / 60), rest % 60);
  }
}

export function formatClock(day: number, hour: number, minute: number): string {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `Día ${day} · ${hh}:${mm}`;
}
