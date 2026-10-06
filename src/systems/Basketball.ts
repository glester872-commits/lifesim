// Sin Phaser: lo usan scenes/WorldScene (la pista), entities/Player y scripts/check-basketball.ts.
import type { Vec2 } from '../types/game.ts';

/**
 * Tirar a canasta (BASKETBALL_SHOOTING): una actividad propia del jugador, no un entrenamiento. Mantener para cargar
 * la potencia, soltar para tirar; la franja del medidor dice dónde está la buena. Lo que pasa después sale de cuánto
 * se acerca la potencia a la ideal de ese sitio, de lo difícil que es el sitio y de un poco de suerte acotada.
 * Este módulo no sabe de pantallas: da el resultado, el camino del balón en cada caso y la máquina de la sesión,
 * y la escena sólo los pinta. Todos los números están aquí, en SHOOTING.
 */
export const SHOOTING = {
  /** Lo que tarda en llenarse el medidor (ms) y lo que se aguanta lleno antes de tirar solo (ms). */
  chargeMs: 1_150,
  overholdMs: 220,
  /** Menos que esto es un toque sin querer: no se tira. */
  minPower: 0.1,
  /** Cuánto se puede alejar la potencia de la ideal antes de que la precisión sea cero. */
  window: 0.3,
  /** Con precisión cero, esta parte de la probabilidad del sitio sigue en pie (alguno entra de rebote). */
  floor: 0.12,
  /** Lo que suma la forma física (0–1) como mucho, y los topes de la probabilidad. */
  skill: 0.04,
  minChance: 0.05,
  maxChance: 0.95,
  /** Tiempos de la escena, en ms: la mano suelta el balón, el resultado se ve, el balón vuelve. */
  releaseMs: 150,
  /** Coste de cada tiro: minutos de reloj y energía (modesto). */
  minutesPerShot: 1,
  energyPerShot: 0.5,
  /** Por debajo de esta energía, no hay fuerzas para jugar. */
  minEnergy: 4,
} as const;

export type ShotKind = 'swish' | 'rim-in' | 'board-in' | 'short' | 'long' | 'left' | 'right';
export const MAKES: ReadonlySet<ShotKind> = new Set(['swish', 'rim-in', 'board-in']);

export interface CourtSpot {
  id: string;
  /** Punto de data/ribera.ts en el que se pone el jugador; así se reserva igual que cualquier otro puesto. */
  point: string;
  label: string;
  /** Potencia buena de este sitio (0–1): cuanto más lejos, más. */
  ideal: number;
  /** Probabilidad de entrar con la potencia perfecta. */
  base: number;
}

export interface Shot {
  kind: ShotKind;
  made: boolean;
  /** 0–1: lo bien que se soltó (1 = potencia perfecta). */
  accuracy: number;
  chance: number;
  power: number;
}

/** Probabilidad de meter: potencia, sitio y forma física (0–1). Pura: la tirada aparte. */
export function chanceOf(spot: CourtSpot, power: number, skill = 0): { chance: number; accuracy: number } {
  const accuracy = Math.max(0, 1 - Math.abs(power - spot.ideal) / SHOOTING.window);
  const chance = spot.base * (SHOOTING.floor + (1 - SHOOTING.floor) * accuracy) + SHOOTING.skill * Math.max(0, Math.min(1, skill));
  return { chance: Math.max(SHOOTING.minChance, Math.min(SHOOTING.maxChance, chance)), accuracy };
}

/** El resultado de un tiro: entra o no, y por dónde (limpia, rebota en el aro o en el tablero; corto, largo, a un lado). */
export function shotOutcome(spot: CourtSpot, power: number, rng: () => number, skill = 0): Shot {
  const { chance, accuracy } = chanceOf(spot, power, skill);
  const made = rng() < chance;
  const err = power - spot.ideal;
  let kind: ShotKind;
  if (made) {
    // Con el tiempo perfecto, casi siempre limpia; si no, más rebotes en el aro que de tablero.
    const r = rng();
    kind = r < (accuracy > 0.8 ? 0.6 : 0.2) ? 'swish' : r < (accuracy > 0.8 ? 0.8 : 0.65) ? 'rim-in' : 'board-in';
  } else if (err < -0.1) kind = 'short';
  else if (err > 0.1) kind = 'long';
  else kind = rng() < 0.5 ? 'left' : 'right';
  return { kind, made, accuracy, chance, power };
}

// ------------------------------------------------------------------ el camino del balón

/** Dónde se pinta en cada tramo: por delante de todo, a la altura del aro, detrás del tablero o a ras de suelo. */
export type Layer = 'air' | 'rim' | 'behind' | 'floor';
export interface Leg {
  to: Vec2;
  ms: number;
  /** Cuánto sube en el punto medio (px): un arco, o un bote si es pequeño. */
  arc: number;
  /** 'in' acelera (cae), 'out' frena (sube), 'lin' va parejo. */
  ease: 'lin' | 'in' | 'out';
  scale: number;
  layer: Layer;
  /** Este tramo acaba en el aro o el tablero: ahí se lee el resultado. */
  mark?: 'result';
}

export interface BallState {
  x: number;
  y: number;
  scale: number;
  layer: Layer;
}

export interface Geometry {
  /** Manos al soltar (px del mundo), el centro del aro, el suelo bajo el aro y los pies del jugador. */
  hands: Vec2;
  rim: Vec2;
  floor: Vec2;
  feet: Vec2;
}

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** El balón vuelve botando hasta los pies del jugador y sube a sus manos: nunca salta de un sitio a otro. */
function home(from: Vec2, g: Geometry): Leg[] {
  const mid = { x: from.x + (g.feet.x - from.x) * 0.55, y: from.y + (g.feet.y - from.y) * 0.55 };
  const d = dist(from, g.feet);
  return [
    { to: mid, ms: 260 + d * 2.2, arc: 9, ease: 'lin', scale: 0.95, layer: 'floor' },
    { to: { x: g.feet.x, y: g.feet.y - 1 }, ms: 240 + d * 1.6, arc: 5, ease: 'lin', scale: 1, layer: 'floor' },
    { to: g.hands, ms: 180, arc: -2, ease: 'out', scale: 1, layer: 'air' },
  ];
}

/** Por la red, al suelo, a un lado del poste: lo que viene después de meter. */
function throughNet(at: Vec2, g: Geometry): Leg[] {
  const land = { x: g.floor.x + (g.feet.x < g.floor.x ? -3 : 3), y: g.floor.y };
  return [
    { to: { x: at.x, y: g.rim.y + 9 }, ms: 150, arc: 0, ease: 'in', scale: 0.82, layer: 'rim' },
    { to: land, ms: 230, arc: 0, ease: 'in', scale: 0.86, layer: 'floor' },
    ...home(land, g),
  ];
}

/** Cada resultado, su camino. El tramo con `mark` es donde se ve si entra. */
export function pathFor(kind: ShotKind, g: Geometry): Leg[] {
  const d = dist(g.hands, g.rim);
  const flight = 480 + d * 2.4;
  const high = 18 + d * 0.22;
  const { rim, floor } = g;
  switch (kind) {
    case 'swish':
      return [{ to: { x: rim.x, y: rim.y - 3 }, ms: flight, arc: high, ease: 'lin', scale: 0.8, layer: 'air', mark: 'result' }, ...throughNet(rim, g)];
    case 'rim-in': {
      const side = g.hands.x <= rim.x ? 1 : -1;
      return [
        { to: { x: rim.x - side * 4, y: rim.y - 2 }, ms: flight, arc: high, ease: 'lin', scale: 0.8, layer: 'air', mark: 'result' },
        { to: { x: rim.x + side * 3, y: rim.y - 8 }, ms: 150, arc: 5, ease: 'lin', scale: 0.8, layer: 'rim' },
        ...throughNet({ x: rim.x + side, y: rim.y }, g),
      ];
    }
    case 'board-in':
      return [
        { to: { x: rim.x, y: rim.y - 13 }, ms: flight, arc: high + 4, ease: 'lin', scale: 0.8, layer: 'air', mark: 'result' },
        { to: { x: rim.x + 1, y: rim.y - 2 }, ms: 170, arc: 3, ease: 'in', scale: 0.8, layer: 'rim' },
        ...throughNet(rim, g),
      ];
    case 'short': {
      const back = { x: rim.x + (g.feet.x - rim.x) * 0.2, y: rim.y + 36 };
      return [
        { to: { x: rim.x + (g.hands.x < rim.x ? -3 : 3), y: rim.y + 7 }, ms: flight * 0.9, arc: high * 0.7, ease: 'lin', scale: 0.82, layer: 'air', mark: 'result' },
        { to: back, ms: 340, arc: 15, ease: 'lin', scale: 0.92, layer: 'air' },
        ...home(back, g),
      ];
    }
    case 'long': {
      const over = { x: rim.x + 3, y: rim.y - 24 };
      const land = { x: rim.x + 9, y: floor.y - 26 };
      return [
        { to: over, ms: flight, arc: high + 8, ease: 'lin', scale: 0.78, layer: 'air', mark: 'result' },
        { to: land, ms: 300, arc: 0, ease: 'in', scale: 0.74, layer: 'behind' },
        { to: { x: rim.x + 18, y: floor.y + 4 }, ms: 360, arc: 8, ease: 'lin', scale: 0.88, layer: 'floor' },
        ...home({ x: rim.x + 18, y: floor.y + 4 }, g),
      ];
    }
    case 'left':
    case 'right': {
      const s = kind === 'left' ? -1 : 1;
      const wide = { x: rim.x + s * 17, y: rim.y + 1 };
      const land = { x: rim.x + s * 19, y: floor.y + 2 };
      return [
        { to: wide, ms: flight, arc: high, ease: 'lin', scale: 0.8, layer: 'air', mark: 'result' },
        { to: land, ms: 280, arc: 0, ease: 'in', scale: 0.88, layer: 'floor' },
        ...home(land, g),
      ];
    }
  }
}

const EASE = { lin: (t: number) => t, in: (t: number) => t * t, out: (t: number) => 1 - (1 - t) * (1 - t) } as const;

export const pathMs = (legs: readonly Leg[]): number => legs.reduce((s, l) => s + l.ms, 0);
/** Cuándo se lee el resultado: al acabar el tramo marcado. */
export const resultAt = (legs: readonly Leg[]): number => {
  let t = 0;
  for (const l of legs) {
    t += l.ms;
    if (l.mark === 'result') return t;
  }
  return t;
};

/** Dónde está el balón `t` ms después de soltarlo (o null si ya ha vuelto a las manos). */
export function ballAt(legs: readonly Leg[], from: Vec2, t: number): BallState | null {
  let start = from;
  let startScale = 1;
  let layer: Layer = 'air';
  let left = t;
  for (const l of legs) {
    if (left <= l.ms) {
      const k = left / l.ms;
      const e = EASE[l.ease](k);
      return {
        x: start.x + (l.to.x - start.x) * e,
        y: start.y + (l.to.y - start.y) * e - l.arc * 4 * k * (1 - k),
        scale: startScale + (l.scale - startScale) * k,
        layer: k < 0.5 && layer === 'air' ? 'air' : l.layer,
      };
    }
    left -= l.ms;
    start = l.to;
    startScale = l.scale;
    layer = l.layer;
  }
  return null;
}

// ------------------------------------------------------------------ la sesión

export type Phase = 'ready' | 'charging' | 'flight' | 'done';
export type SessionEvent = { type: 'release'; shot: Shot } | { type: 'result'; shot: Shot } | { type: 'ready' };

/**
 * Poses del jugador (entities/Player: player-<dir>-<pose>): las que sirven para cada momento de un tiro. Sólo poses
 * con las manos libres (world/HumanArt): la 6 lleva la barra y la 15/16 las mancuernas dibujadas en el cuerpo.
 */
export const POSES = { hold: 0, ready: 3, release: 21, follow: 7 } as const;

export class ShootingSession {
  phase: Phase = 'ready';
  /** 0–1 mientras se carga. */
  power = 0;
  makes = 0;
  attempts = 0;
  last: Shot | null = null;
  private held = 0;
  private legs: readonly Leg[] = [];
  private t = 0;
  private resulted = false;
  private readonly spot: CourtSpot;
  private readonly g: Geometry;
  private readonly rng: () => number;
  private readonly skill: number;

  constructor(spot: CourtSpot, geometry: Geometry, rng: () => number, skill = 0) {
    this.spot = spot;
    this.g = geometry;
    this.rng = rng;
    this.skill = skill;
  }

  /** Cada frame: `down` es si se está pulsando (E, Espacio o el botón táctil). Devuelve lo que ha pasado. */
  update(dtMs: number, down: boolean): SessionEvent[] {
    const out: SessionEvent[] = [];
    if (this.phase === 'ready' && down) {
      this.phase = 'charging';
      this.power = 0;
      this.held = 0;
    } else if (this.phase === 'charging') {
      this.held += dtMs;
      this.power = Math.min(1, this.held / SHOOTING.chargeMs);
      const over = this.held > SHOOTING.chargeMs + SHOOTING.overholdMs;
      if (!down || over) {
        if (this.power < SHOOTING.minPower) {
          this.phase = 'ready';
          this.power = 0;
        } else out.push(this.shoot());
      }
    } else if (this.phase === 'flight') {
      this.t += dtMs;
      if (!this.resulted && this.t - SHOOTING.releaseMs >= resultAt(this.legs)) {
        this.resulted = true;
        if (this.last?.made) this.makes++;
        out.push({ type: 'result', shot: this.last! });
      }
      if (this.t - SHOOTING.releaseMs >= pathMs(this.legs)) {
        this.phase = 'ready';
        this.power = 0;
        this.legs = [];
        out.push({ type: 'ready' });
      }
    }
    return out;
  }

  private shoot(): SessionEvent {
    const shot = shotOutcome(this.spot, this.power, this.rng, this.skill);
    this.last = shot;
    this.attempts++;
    this.legs = pathFor(shot.kind, this.g);
    this.t = 0;
    this.resulted = false;
    this.phase = 'flight';
    return { type: 'release', shot };
  }

  /** El balón ahora: en las manos mientras se prepara; en el aire desde que la mano lo suelta. */
  ball(): BallState | null {
    if (this.phase === 'done') return null;
    if (this.phase !== 'flight') return { x: this.g.hands.x, y: this.g.hands.y - (this.phase === 'charging' ? this.power * 3 : 0), scale: 1, layer: 'air' };
    // La mano suelta el balón un instante después de empezar el gesto: hasta entonces sigue en ella.
    if (this.t < SHOOTING.releaseMs) return { x: this.g.hands.x, y: this.g.hands.y - 5 * (this.t / SHOOTING.releaseMs), scale: 1, layer: 'air' };
    return ballAt(this.legs, { x: this.g.hands.x, y: this.g.hands.y - 5 }, this.t - SHOOTING.releaseMs) ?? { x: this.g.hands.x, y: this.g.hands.y, scale: 1, layer: 'air' };
  }

  /** La pose del jugador y lo que sube del suelo (px), según el momento. */
  pose(): { pose: number; lift: number } {
    if (this.phase === 'charging') return { pose: POSES.ready, lift: 0 };
    if (this.phase === 'flight') {
      if (this.t < SHOOTING.releaseMs) return { pose: POSES.release, lift: 2 + 2 * (this.t / SHOOTING.releaseMs) };
      if (this.t < SHOOTING.releaseMs + 260) return { pose: POSES.follow, lift: 1 };
      return { pose: POSES.hold, lift: 0 };
    }
    return { pose: POSES.hold, lift: 0 };
  }

  /** Cortar en seco (Esc, cambio de escena): el balón desaparece y la sesión no vuelve a hacer nada. */
  cancel(): void {
    this.phase = 'done';
    this.legs = [];
    this.power = 0;
  }
}
