/**
 * MAP-07: reputación local por barrio (el de data/districtIdentity.ts LOCATION_DISTRICT). Reglas en
 * systems/Reputation.ts; aquí sólo los números y los motivos que la mueven.
 */

export const REPUTATION_MIN = -100;
export const REPUTATION_MAX = 100;
export const REPUTATION_START = 0;
/** Cuántos motivos recientes se guardan por barrio (también la memoria de idempotencia). */
export const REPUTATION_MAX_REASONS = 10;
/** A reputación ±100, el precio baja o sube este tanto (±10 %). */
export const REPUTATION_PRICE_SPAN = 0.1;
export const REPUTATION_TONE_LOW = -40;
export const REPUTATION_TONE_HIGH = 40;
/** Por debajo de esto, un local con `minReputation` no te atiende. */
export const REPUTATION_BAN_AT = -70;

/** MAP-07b: a reputación −100, un evento de polaridad negativa sale un 30 % más (+100 lo mismo con los positivos). */
export const REPUTATION_EVENT_SPAN = 0.3;
/** Qué es un suceso para el barrio: los negativos crecen con la mala fama; los positivos, con la buena. */
export type EventPolarity = 'negative' | 'positive';

export type ReputationTrigger = 'shift-done' | 'shift-late' | 'shift-missed' | 'bill-paid' | 'bill-late' | 'local-purchase';

/** Lo que mueve la reputación y cómo se lee en el móvil. La clave de cada motivo (`shift:día:job`…) la pone quien lo dispara. */
export const REPUTATION_TRIGGERS: Readonly<Record<ReputationTrigger, { delta: number; prefix: string; label: string }>> = {
  'shift-done': { delta: 3, prefix: 'shift', label: 'Turno cumplido' },
  // Misma clave que el turno cumplido (un turno por día y trabajo): se distingue por el delta.
  'shift-late': { delta: 1, prefix: 'shift', label: 'Turno, aunque tarde' },
  // MAP-07b: el día repasado sin fichar (GameState.settleJob); clave `missed:job:día`.
  'shift-missed': { delta: -5, prefix: 'missed', label: 'Turno sin fichar' },
  'bill-paid': { delta: 2, prefix: 'bill', label: 'Factura pagada' },
  // MAP-07b: misma clave que la pagada a tiempo; pagar se cumple, pero tarde el barrio lo nota un poco.
  'bill-late': { delta: -1, prefix: 'bill', label: 'Factura pagada con retraso' },
  'local-purchase': { delta: 1, prefix: 'buy', label: 'Compra en el barrio' },
};
