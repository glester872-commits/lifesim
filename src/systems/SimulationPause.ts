/** Una pausa no deshace otra: volver a la pestaña conserva el menú de pausa. Sin temporizadores. */
export class SimulationPause {
  private readonly reasons = new Set<string>();
  private readonly changed: (paused: boolean) => void;
  constructor(changed: (paused: boolean) => void) { this.changed = changed; }
  set(reason: string, paused: boolean): void {
    const was = this.reasons.size > 0;
    if (paused) this.reasons.add(reason);
    else this.reasons.delete(reason);
    if (was !== (this.reasons.size > 0)) this.changed(this.reasons.size > 0);
  }
  get paused(): boolean { return this.reasons.size > 0; }
}
