// Sin Phaser: lo usan GameState, systems/Characters, WorldScene, main.ts y scripts/check-pregnancy.ts.
import { BIRTH_DAY, PHASE_STARTS, PREGNANCIES, type Phase, type PregnancyDef } from '../data/pregnancy.ts';

/**
 * Embarazos de las vecinas de data/pregnancy.ts. Lo que se guarda es el día de inicio, la última fase ya resuelta
 * y el nacimiento (con el bebé y su id). La fase de un día cualquiera es una función de ese inicio (phaseAt): el
 * aspecto y la rutina salen de ahí, nunca de una tirada al entrar en una escena. resolve() pone al día lo guardado
 * fase a fase y en orden; el nacimiento se apunta una vez, con su día de verdad aunque se cruce en un salto.
 */

export interface Baby {
  /** Estable: `bebe-<madre>`. */
  id: string;
  name: string;
}

export interface PregnancyRecord {
  /** Día de juego en que empezó (puede ser futuro: aún no ha empezado). */
  start: number;
  /** Última fase resuelta. */
  phase: Phase;
  born?: { day: number; baby: Baby };
}

export type PregnancyState = Record<string, PregnancyRecord>;

const ORDER: readonly Phase[] = ['waiting', ...PHASE_STARTS.map(([p]) => p)];
const BY_NPC = new Map(PREGNANCIES.map((p) => [p.npc, p]));

export const pregnancyOf = (npc: string): PregnancyDef | undefined => BY_NPC.get(npc);

/** La fase el día `day` de un embarazo que empezó el día `start`. */
export function phaseAt(start: number, day: number): Phase {
  const d = day - start;
  let phase: Phase = 'waiting';
  for (const [p, from] of PHASE_STARTS) if (d >= from) phase = p;
  return phase;
}

/** Cuánto se le nota (0 nada; 1–3 las tres fases visibles). */
export function bumpOf(phase: Phase): 0 | 1 | 2 | 3 {
  return phase === 'early' ? 1 : phase === 'mid' ? 2 : phase === 'late' ? 3 : 0;
}

export const emptyPregnancy = (): PregnancyState => ({});

const babyId = (npc: string): string => `bebe-${npc}`;

/** De lo guardado (o de nada) a un estado válido: sólo vecinas conocidas y campos con sentido. */
export function parsePregnancy(v: unknown): PregnancyState {
  const out: PregnancyState = {};
  if (!v || typeof v !== 'object') return out;
  for (const [npc, raw] of Object.entries(v as Record<string, unknown>)) {
    const r = raw as Partial<PregnancyRecord> | null;
    if (!BY_NPC.has(npc) || !r || !Number.isFinite(r.start) || !ORDER.includes(r.phase as Phase)) continue;
    const rec: PregnancyRecord = { start: Math.floor(r.start!), phase: r.phase as Phase };
    const b = r.born;
    if (b && Number.isFinite(b.day) && b.baby && typeof b.baby.name === 'string') rec.born = { day: Math.floor(b.day), baby: { id: babyId(npc), name: b.baby.name } };
    out[npc] = rec;
  }
  return out;
}

export interface PregnancyEvent {
  npc: string;
  phase: Phase;
  /** Al entrar en el postparto: el nacimiento. */
  birth?: { day: number; baby: Baby };
}

/**
 * Pone al día lo guardado para el día `day`. Quien no tiene registro lo recibe con su inicio (`offset` días antes
 * de hoy) y su fase de hoy, sin eventos: no se cuenta lo que pasó antes de conocerla. Quien sí lo tiene avanza una
 * fase tras otra hasta la de hoy y cada paso es un evento; entrar en el postparto apunta el nacimiento. Repetirlo
 * el mismo día no cambia nada (devuelve el mismo objeto).
 */
export function resolve(state: PregnancyState, day: number): { state: PregnancyState; events: PregnancyEvent[] } {
  let next = state;
  const events: PregnancyEvent[] = [];
  for (const def of PREGNANCIES) {
    const known = next[def.npc];
    if (!known) {
      const start = day - def.offset;
      next = { ...next, [def.npc]: settle(def, { start, phase: phaseAt(start, day) }) };
      continue;
    }
    const from = ORDER.indexOf(known.phase);
    const to = ORDER.indexOf(phaseAt(known.start, day));
    if (to <= from) continue;
    let rec = known;
    for (let i = from + 1; i <= to; i++) {
      const had = !!rec.born;
      rec = settle(def, { ...rec, phase: ORDER[i] });
      events.push({ npc: def.npc, phase: ORDER[i], birth: !had && rec.born ? rec.born : undefined });
    }
    next = { ...next, [def.npc]: rec };
  }
  return { state: next, events };
}

/** Pasado el día del nacimiento, el bebé queda apuntado (una vez: si ya está, no se toca). */
function settle(def: PregnancyDef, rec: PregnancyRecord): PregnancyRecord {
  if (rec.born || ORDER.indexOf(rec.phase) < ORDER.indexOf('post')) return rec;
  return { ...rec, born: { day: rec.start + BIRTH_DAY, baby: { id: babyId(def.npc), name: def.baby.name } } };
}

/** Lo que comenta según su fase de hoy (además de lo de su parada), si tiene algo. */
export function pregnancyLine(npc: string, phase: Phase, day: number): string | undefined {
  const lines = BY_NPC.get(npc)?.lines[phase];
  return lines?.length ? lines[((day % lines.length) + lines.length) % lines.length] : undefined;
}

/** El aviso del nacimiento. */
export function birthNotice(npc: string, name: string, baby: Baby): string {
  return `${name} ha tenido ${BY_NPC.get(npc)!.baby.kind}: ${baby.name}. Están en casa y bien; dice que pronto bajarán a la plaza.`;
}

// ponytail: copia de módulo de lo que guarda GameState (la única fuente), para que systems/Characters sepa la fase
// sin pasar el estado por todos los que piden una rutina. GameState la refresca al crearse y en cada setPregnancy.
let current: PregnancyState = {};
export const usePregnancies = (s: PregnancyState): void => {
  current = s;
};

/** La fase de una vecina ese día según lo guardado; sin registro, 'waiting'. */
export function phaseOn(npc: string, day: number): Phase {
  const rec = current[npc];
  return rec ? phaseAt(rec.start, day) : 'waiting';
}
