/**
 * Micropréstamo (LV-10, Fase 3a). Sólo datos: las reglas (quién puede pedirlo,
 * cuándo se genera cada cuota, cancelar) están en systems/Credit.ts y lo que se
 * debe se guarda con la partida (GameStateData.credit).
 *
 * Una sola oferta, con su coste total fijo y mostrado antes de aceptar. Sin
 * intereses de demora: el impago lleva, como mucho, el mismo recargo único que
 * el alquiler (data/household.ts), pasados GRACE_DAYS.
 */
import { BILLS } from './household.ts';

export interface CreditOffer {
  /** Lo que se recibe. */
  principal: number;
  /** Coste fijo total, repartido a partes iguales entre las cuotas. */
  cost: number;
  installments: number;
  /** Días entre cuotas. */
  every: number;
  /** Plazo total en días: installments · every. */
  term: number;
  /** Recargo único por cuota pasada del margen. */
  lateFee: number;
  /** Días sin poder pedir otro tras liquidarlo o cancelarlo. */
  cooldown: number;
  /** Días (contando el de pedirlo) en que devolver el principal íntegro cuesta €0. */
  withdrawalDays: number;
}

// Principal €100, coste €8: 4 cuotas semanales de €27 (25 de principal + 2 de coste) en 28 días.
export const CREDIT: CreditOffer = {
  principal: 100,
  cost: 8,
  installments: 4,
  every: 7,
  term: 28,
  lateFee: BILLS.find((b) => b.id === 'rent')?.lateFee ?? 0,
  cooldown: 7,
  withdrawalDays: 2,
};
