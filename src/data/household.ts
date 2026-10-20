/**
 * Gastos de casa y metas de ahorro. Sólo datos: las reglas (cuándo se genera
 * cada pago, cuándo vence, qué pasa si no llega) están en systems/Household.ts
 * y lo que debe el jugador se guarda con la partida (GameStateData.household).
 *
 * Importes ajustados con scripts/simulate-budget.ts: tres turnos de
 * dependiente a la semana pagan casa, metro y comida y dejan para salir.
 */

export interface BillDef {
  id: string;
  name: string;
  /** A quién se paga, para el móvil. */
  payee: string;
  amount: number;
  /** Cada cuántos días se genera. */
  every: number;
  /** Recargo único si sigue sin pagar pasado el margen (GRACE_DAYS). Sin él, nada. */
  lateFee?: number;
}

export const BILLS: readonly BillDef[] = [
  { id: 'rent', name: 'Alquiler', payee: 'Casero · Vallesco', amount: 45, every: 7, lateFee: 5 },
  { id: 'home', name: 'Luz, agua e internet', payee: 'Suministros del piso', amount: 10, every: 7 },
];

/** Días tras el vencimiento antes del recargo. No hay desahucio ni intereses: la deuda espera. */
export const GRACE_DAYS = 7;

/** Una meta: algo que existe y se compra en el juego, con su precio de verdad (data/retail.ts). */
export interface GoalDef {
  id: string;
  store: string;
  garment: string;
}

export const GOALS: readonly GoalDef[] = [
  { id: 'abrigo', store: 'hilo', garment: 'abrigo-lana' },
  { id: 'blazer', store: 'hilo', garment: 'blazer-entallado' },
  { id: 'cazadora', store: 'retales', garment: 'cazadora-ante' },
];
