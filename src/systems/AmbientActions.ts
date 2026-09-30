// Sin Phaser: world/CrowdView.ts y scenes/WorldScene.ts lo usan para pintar y
// scripts/check-ambient.ts lo prueba con exactamente esta lógica.
import {
  AMBIENT_ACTIONS, TRAIT_SHARE,
  type AmbientActionDef, type AmbientContext, type AmbientPosture, type AmbientStep, type AmbientTrait, type DayPart,
} from '../data/ambientActions.ts';
import type { Facing } from '../types/game.ts';
import { hashSeed, seededRng, type Rng } from './MetroDaily.ts';

/**
 * Quién es y dónde está alguien, para elegir su gesto. Lo arma quien lo pinta
 * (la gente de un local o de la calle, un personaje con nombre) sólo cuando
 * hay que decidir: al aparecer, al cambiar de situación o al acabar el gesto.
 */
export interface AmbientSubject {
  /** Semilla estable de la persona: sus rasgos (fuma o no) salen de aquí. */
  seed: number;
  posture: AmbientPosture;
  context: AmbientContext;
  outdoor: boolean;
  /** Etiquetas del lugar donde está (data/places.ts): 'nightlife', 'food', 'shop'… */
  tags: readonly string[];
  /** Lo que ha venido a hacer (el `role` de su viaje o de su puesto). */
  role?: string;
  /** Hacia dónde queda quien le acompaña, si está a su lado. */
  companion?: Facing;
}

/** Un gesto en marcha: qué, desde cuándo, cuánto dura y hacia dónde queda su acompañante. */
export interface AmbientChoice {
  def: AmbientActionDef;
  /** Ms del reloj de quien lo pinta (el de Phaser). */
  start: number;
  total: number;
  seed: number;
  companion?: Facing;
}

/** El tramo de ahora: qué se ve, una clave única por tramo (para soltar el humo una sola vez) y cuánto lleva. */
export interface AmbientFrame {
  step: AmbientStep;
  key: string;
  t: number;
}

export function dayPart(hour: number): DayPart {
  const h = ((hour % 24) + 24) % 24;
  return h >= 6 && h < 12 ? 'morning' : h >= 12 && h < 19 ? 'afternoon' : h >= 19 && h < 23 ? 'evening' : 'night';
}

const unit = (...parts: (string | number)[]): number => hashSeed(...parts) / 4294967296;

/** Si esta persona tiene el rasgo: siempre la misma respuesta para la misma semilla y lo mismo que hace. */
export function hasTrait(trait: AmbientTrait, seed: number, role?: string): boolean {
  const share = TRAIT_SHARE[trait];
  return unit('trait', trait, seed) < ((role ? share.roles?.[role] : undefined) ?? share.base);
}

/** Lo que pesa cada gesto para esta persona a esta hora; los que no pueden ser, fuera. */
export function ambientWeights(s: AmbientSubject, hour: number, actions: readonly AmbientActionDef[] = AMBIENT_ACTIONS): [AmbientActionDef, number][] {
  const part = dayPart(hour);
  const out: [AmbientActionDef, number][] = [];
  for (const def of actions) {
    if (!def.postures.includes(s.posture) || !def.contexts.includes(s.context)) continue;
    if (def.outdoor && !s.outdoor) continue;
    if (def.trait && !hasTrait(def.trait, s.seed, s.role)) continue;
    if (def.companion && !s.companion) continue;
    let w = def.weight * (def.dayparts?.[part] ?? 1);
    if (def.near) w *= Math.max(1, ...s.tags.map((t) => def.near![t] ?? 1));
    if (def.roles) w *= (s.role ? def.roles[s.role] : undefined) ?? def.otherRoles ?? 1;
    if (w > 0) out.push([def, w]);
  }
  return out;
}

/** Elige un gesto (o ninguno, si no hay ninguno posible). Repetir el de antes pesa menos. */
export function chooseAmbient(s: AmbientSubject, hour: number, rng: Rng, previous?: string): AmbientActionDef | undefined {
  const table = ambientWeights(s, hour).map(([def, w]) => [def, def.id === previous ? w * 0.3 : w] as const);
  let roll = rng() * table.reduce((sum, [, w]) => sum + w, 0);
  for (const [def, w] of table) {
    roll -= w;
    if (roll < 0) return def;
  }
  return table[table.length - 1]?.[0];
}

const stepMs = (step: AmbientStep, seed: number, key: string): number => step.ms[0] + (step.ms[1] - step.ms[0]) * unit(seed, key);

/**
 * El tramo en el que va un gesto a los `now` ms: primero la entrada, luego el
 * bucle tantas veces como quepa y al final la salida. Es función del tiempo,
 * sin estado: quien vuelve a la vista retoma el gesto donde iba.
 */
export function ambientFrame(c: AmbientChoice, now: number): AmbientFrame {
  const { def, seed } = c;
  const intro = def.intro ?? [];
  const outro = def.outro ?? [];
  const introMs = intro.map((s, i) => stepMs(s, seed, `i${i}`));
  const outroMs = outro.map((s, i) => stepMs(s, seed, `o${i}`));
  let t = Math.max(0, Math.min(now - c.start, c.total));
  for (let i = 0; i < intro.length; i++) {
    if (t < introMs[i]) return { step: intro[i], key: `i${i}`, t };
    t -= introMs[i];
  }
  const loopMs = Math.max(0, c.total - sum(introMs) - sum(outroMs));
  if (t < loopMs) {
    // El bucle, vuelta a vuelta; cada vuelta con sus propias duraciones.
    for (let cycle = 0; cycle < 10_000; cycle++) {
      for (let j = 0; j < def.loop.length; j++) {
        const d = stepMs(def.loop[j], seed, `l${cycle}.${j}`);
        if (t < d) return { step: def.loop[j], key: `l${cycle}.${j}`, t };
        t -= d;
      }
    }
  }
  t -= loopMs;
  for (let i = 0; i < outro.length; i++) {
    if (t < outroMs[i]) return { step: outro[i], key: `o${i}`, t };
    t -= outroMs[i];
  }
  // Acabado: se queda en el último tramo, con su misma clave (no vuelve a soltar humo).
  if (outro.length) return { step: outro[outro.length - 1], key: `o${outro.length - 1}`, t };
  return { step: def.loop[def.loop.length - 1], key: 'end', t };
}

function sum(list: readonly number[]): number {
  return list.reduce((s, n) => s + n, 0);
}

interface Entry {
  context: string;
  choice: AmbientChoice | null;
  /** Sin gesto posible: cuándo volver a mirar. */
  until: number;
  count: number;
}

/** Sin gesto posible (dentro de un puesto, bailando): se vuelve a mirar cada tanto, no cada frame. */
const RETRY_MS = 3_000;

/**
 * Lleva el gesto de cada persona a la vista. No decide nada cada frame: sólo
 * cuando alguien aparece, cambia de situación (se sienta, se para, echa a
 * andar) o acaba lo que hacía. Quien sale de la vista se olvida (`forget`) y,
 * al volver, retoma a mitad de un gesto nuevo: lejos de la cámara no se
 * simula nada.
 */
export class AmbientDirector {
  /** Decisiones tomadas: para comprobar que no se decide cada frame. */
  decisions = 0;
  private readonly entries = new Map<string | number, Entry>();
  private readonly hour: () => number;

  constructor(hour: () => number) {
    this.hour = hour;
  }

  /**
   * El gesto de ahora. `context` resume su situación (postura, lo que hace,
   * dónde): si cambia, gesto nuevo desde el principio. `subject` sólo se llama
   * cuando hay que decidir.
   */
  at(key: string | number, context: string, now: number, subject: () => AmbientSubject | undefined): AmbientChoice | undefined {
    const e = this.entries.get(key);
    if (e && e.context === context && now < (e.choice ? e.choice.start + e.choice.total : e.until)) return e.choice ?? undefined;
    const s = subject();
    const count = (e?.count ?? 0) + 1;
    const rng = seededRng(hashSeed('ambient', key, count, Math.floor(now)));
    const def = s && chooseAmbient(s, this.hour(), rng, e?.choice?.def.id);
    this.decisions++;
    if (!s || !def) {
      this.entries.set(key, { context, choice: null, until: now + RETRY_MS, count });
      return undefined;
    }
    const total = def.total[0] + (def.total[1] - def.total[0]) * rng();
    // Al aparecer ya iba a mitad de algo; si acaba de sentarse o de pararse, empieza ahora.
    const start = e ? now : now - rng() * total * 0.6;
    const choice: AmbientChoice = { def, start, total, seed: hashSeed(key, count), companion: s.companion };
    this.entries.set(key, { context, choice, until: 0, count });
    return choice;
  }

  forget(key: string | number): void {
    this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }
}

/**
 * Qué postura y qué contexto tiene un gesto a partir de lo que ya se le ve
 * hacer (entities/Character, activityAt). Los puestos (la cinta, las pesas),
 * bailar, jalear, cenar servido, beber en la barra o trotar no admiten gesto:
 * se quedan como están.
 */
export function ambientSituation(activity: string, state: string | undefined, moving: boolean): { posture: AmbientPosture; context: AmbientContext } | undefined {
  if (moving) return activity === 'run' ? undefined : { posture: 'walk', context: 'walk' };
  switch (activity) {
    case 'eat': return { posture: 'sit', context: 'eat' };
    case 'drink': return { posture: 'sit', context: 'drink' };
    case 'read': return { posture: 'sit', context: 'read' };
    case 'sit-phone': return { posture: 'sit', context: 'wait' };
    case 'sit-talk': return { posture: 'sit', context: 'talk' };
    case 'sit':
    case 'watch': return { posture: 'sit', context: 'rest' };
    case 'phone': return { posture: 'stand', context: 'wait' };
    case 'talk': return { posture: 'stand', context: 'talk' };
    case 'idle': return { posture: 'stand', context: state === 'BROWSE' ? 'browse' : 'idle' };
    default: return undefined;
  }
}

/** Hacia dónde queda `to` visto desde `from`. */
export function facingTowards(from: { x: number; y: number }, to: { x: number; y: number }): Facing {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}
