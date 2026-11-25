// VID-04 «Atender a un cliente»: reglas puras del minijuego (sin Phaser ni DOM).
// Imports con .ts: los scripts de node (npm run check) lo cargan tal cual.
import { ATTENTION, type AttentionCase, type AttentionGrade, type AttentionRound } from '../data/customerService.ts';
import type { JobChoice } from '../data/jobs.ts';
import { hashSeed } from './MetroDaily.ts';

export type AttentionResult = 'exact' | 'near' | 'wrong';

export interface AttentionStep {
  picked: string | null;
  result: AttentionResult | 'timeout';
  points: number;
}

export interface AttentionFinish {
  points: number;
  grade: AttentionGrade;
  choice: JobChoice;
}

/** El cliente de hoy: fijo para ese día y nivel. */
export function pickCase(day: number, level: number): AttentionCase {
  const n = ATTENTION.cases.length;
  return ATTENTION.cases[(((day + level) % n) + n) % n];
}

/** El estante de la ronda, barajado de forma determinista (Fisher-Yates con semilla). */
export function shelfOrder(c: AttentionCase, roundIndex: number, day: number): string[] {
  const out = [...c.rounds[roundIndex].shelf];
  let s = hashSeed(c.id, roundIndex, day);
  for (let i = out.length - 1; i > 0; i--) {
    s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function resultOf(round: AttentionRound, picked: string): AttentionResult {
  if (picked === round.exact) return 'exact';
  return round.near.includes(picked) ? 'near' : 'wrong';
}

export function gradeRound(round: AttentionRound, picked: string | null, remainingRatio: number): number {
  if (picked === null) return 0;
  const p = ATTENTION.points;
  const r = resultOf(round, picked);
  if (r === 'exact') return p.exact + (remainingRatio >= p.speedAbove ? p.speedBonus : 0);
  return r === 'near' ? p.near : p.wrong;
}

/** El primer grado (de mejor a peor) cuyo mínimo se alcanza. */
export function gradeOf(points: number): AttentionGrade {
  return ATTENTION.grades.find((g) => points >= g.min) ?? ATTENTION.grades[ATTENTION.grades.length - 1];
}

export const choiceFor = (points: number): JobChoice => gradeOf(points).choice;

/** Una atención en curso: tres rondas con barra de paciencia. No toca el estado del juego. */
export class AttentionRun {
  readonly case: AttentionCase;
  round = 0;
  points = 0;
  remainingMs: number = ATTENTION.roundMs;
  lockedMs = 0;
  settled = false;
  readonly history: AttentionStep[] = [];

  constructor(c: AttentionCase) {
    this.case = c;
  }

  get done(): boolean {
    return this.round >= this.case.rounds.length;
  }

  tick(deltaMs: number): void {
    if (this.settled || this.done || !(deltaMs > 0)) return;
    const d = Math.min(deltaMs, 100);
    this.lockedMs = Math.max(0, this.lockedMs - d);
    this.remainingMs = Math.max(0, this.remainingMs - d);
    if (this.remainingMs === 0) this.advance({ picked: null, result: 'timeout', points: 0 });
  }

  deliver(sectorId: string): { result: AttentionResult; reply: string } | null {
    if (this.settled || this.done || this.lockedMs > 0) return null;
    const round = this.case.rounds[this.round];
    const result = resultOf(round, sectorId);
    const points = gradeRound(round, sectorId, this.remainingMs / ATTENTION.roundMs);
    this.advance({ picked: sectorId, result, points });
    return { result, reply: this.case.replies[result] };
  }

  /** La reacción del cliente cuando se le acaba la paciencia. */
  get timeoutReply(): string {
    return this.case.replies.timeout;
  }

  finish(): AttentionFinish | null {
    if (this.settled || !this.done) return null;
    this.settled = true;
    const grade = gradeOf(this.points);
    return { points: this.points, grade, choice: grade.choice };
  }

  /** Abandonar: sin resultado y sin turno (ATTENTION.abandon). */
  cancel(): void {
    this.settled = true;
  }

  private advance(step: AttentionStep): void {
    this.points += step.points;
    this.history.push(step);
    this.round += 1;
    this.remainingMs = ATTENTION.roundMs;
    this.lockedMs = ATTENTION.lockMs;
  }
}
