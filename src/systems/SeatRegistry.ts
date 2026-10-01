// Sin Phaser: lo usan Crowd (interiores) y StreetLife (calle), y lo prueba scripts/check-seats.ts.

/** Libre, apartado para alguien que va de camino, o con alguien encima. */
export type SeatState = 'available' | 'reserved' | 'occupied';

interface Hold {
  owner: number;
  state: 'reserved' | 'occupied';
  /** Ms (del reloj propio del registro) desde que lo tiene en ese estado. */
  since: number;
}

/** Si quien sostiene un asiento sigue teniendo derecho a él (lo decide quien usa el registro). */
export type HoldCheck = (owner: number, seat: string, state: 'reserved' | 'occupied', ageMs: number) => boolean;

/**
 * Quién tiene cada asiento (silla, banco, taburete, cualquier punto de estar):
 * una sola persona a la vez. Quien decide sentarse lo reserva en el mismo
 * instante en que lo elige (`reserve`), así que dos que eligen en el mismo
 * fotograma nunca coinciden; al llegar pasa a `occupied`; al levantarse, o si
 * cambia de idea, no llega o se va, lo suelta. Sólo el dueño puede soltarlo.
 * `sweep` recoge las reservas huérfanas (dueño que ya no existe o ya no va ahí)
 * para que ningún asiento se quede bloqueado para siempre.
 */
export class SeatRegistry {
  private readonly holds = new Map<string, Hold>();
  private now = 0;

  /** El reloj propio: sólo avanza con `tick`, para que el barrido no dependa del reloj de pared. */
  tick(deltaMs: number): void {
    this.now += deltaMs;
  }

  state(seat: string): SeatState {
    return this.holds.get(seat)?.state ?? 'available';
  }

  ownerOf(seat: string): number | undefined {
    return this.holds.get(seat)?.owner;
  }

  /** Lo tiene alguien, de camino o sentado. */
  has(seat: string): boolean {
    return this.holds.has(seat);
  }

  /** Lo tiene este mismo. */
  heldBy(seat: string, owner: number): boolean {
    return this.holds.get(seat)?.owner === owner;
  }

  /** Todos los asientos que alguien tiene. */
  seats(): IterableIterator<string> {
    return this.holds.keys();
  }

  /** Los asientos de un dueño (lo normal es uno). */
  seatsOf(owner: number): string[] {
    return [...this.holds].filter(([, h]) => h.owner === owner).map(([seat]) => seat);
  }

  /** Lo aparta para `owner`. Falso si ya es de otro; si ya era suyo, no cambia nada. */
  reserve(seat: string, owner: number): boolean {
    const hold = this.holds.get(seat);
    if (hold) return hold.owner === owner;
    this.holds.set(seat, { owner, state: 'reserved', since: this.now });
    return true;
  }

  /** Llegó: el asiento pasa a ocupado. Falso si es de otro; si estaba libre (quien nace ya sentado), lo toma. */
  occupy(seat: string, owner: number): boolean {
    const hold = this.holds.get(seat);
    if (!hold) {
      this.holds.set(seat, { owner, state: 'occupied', since: this.now });
      return true;
    }
    if (hold.owner !== owner) return false;
    if (hold.state !== 'occupied') {
      hold.state = 'occupied';
      hold.since = this.now;
    }
    return true;
  }

  /** Se levanta o cancela: lo suelta, pero sólo si es suyo. */
  release(seat: string, owner: number): boolean {
    if (this.holds.get(seat)?.owner !== owner) return false;
    this.holds.delete(seat);
    return true;
  }

  /** Suelta todo lo de un dueño (se va, desaparece, cambia de actividad). */
  releaseAll(owner: number): void {
    for (const seat of this.seatsOf(owner)) this.holds.delete(seat);
  }

  /**
   * Quita lo que `valid` ya no da por bueno: el dueño no existe, ya no va a ese
   * asiento, o lleva demasiado reservado sin llegar. Devuelve qué liberó.
   */
  sweep(valid: HoldCheck): { seat: string; owner: number }[] {
    const freed: { seat: string; owner: number }[] = [];
    for (const [seat, hold] of this.holds) {
      if (valid(hold.owner, seat, hold.state, this.now - hold.since)) continue;
      this.holds.delete(seat);
      freed.push({ seat, owner: hold.owner });
    }
    return freed;
  }
}
