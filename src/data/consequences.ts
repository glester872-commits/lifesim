/**
 * SIM-01 · Registro de consecuencias (systems/Consequences): límites, plazos y los textos de los avisos.
 *
 * Huecos de los textos (los rellena el sistema): {persona}, {falta}, {gasto}, {fecha}.
 */

/** Días que un hecho sigue siendo «nuevo» para registrarlo: una partida v5 no rellena su pasado. */
export const REGISTER_WINDOW = 3;
/** Días entre un aviso y el siguiente (global): lo que llegue antes espera. */
export const NOTICE_COOLDOWN_DAYS = 3;
/** Días tras resolverse o caducar en que una consecuencia se compacta (archivada). */
export const ARCHIVE_AFTER_DAYS = 14;
/** Tope de consecuencias sin archivar: por encima se archivan antes las cerradas; nunca se poda una activa. */
export const MAX_ACTIVE = 24;
/** Tope de archivadas: se descarta la más antigua. */
export const MAX_ARCHIVED = 30;
/** Obligaciones de casa que cuentan: las sin pagar que vencen como mucho dentro de estos días. */
export const COVERAGE_DAYS = 7;
/** Faltas en 7 días que ya son una caída de ingresos. */
export const INCOME_MISSED = 2;

/** Días hasta que caduca sin resolverse, por origen. */
export const EXPIRE_DAYS = {
  'shift-late': 7,
  'shift-missed': 14,
  planton: 10,
  dismissal: 14,
} as const;

/** Título del aviso del móvil (phone.notice) y la app que abre. */
export const CHANNELS = {
  work: { title: 'Trabajo', app: 'today' },
  planton: { title: 'Gente', app: 'today' },
  money: { title: 'Cuentas', app: 'money' },
} as const;

export const NOTICE_TEXT = {
  work: 'Tu ascenso espera: quieren ver dos turnos buenos seguidos.',
  planton: '{persona} sigue esperando que arregles lo del plantón.',
  money: 'Este periodo vas justo: te faltan {falta} para cubrir {gasto} (vence el {fecha}).',
  /** Lo mismo cuando lo más antiguo que falta ya venció: no se dice «vas justo» de algo pasado. */
  moneyOverdue: 'No llegaste: te faltan {falta} de {gasto} que venció el {fecha}.',
  moneyAdvice:'Un turno (tu contrato o uno suelto) lo cubre; se paga en el móvil, en Cuentas.',
  /** Sin contrato activo (p. ej. tras un despido): sólo queda el turno suelto. */
  moneyAdviceNoJob: 'Un turno suelto lo cubre; se paga en el móvil, en Cuentas.',
  /** Sólo si el micropréstamo se puede pedir ahora (Credit.creditBlocker null): móvil → Cuentas → Micropréstamo. */
  moneyLoan: 'Si no llega, en Cuentas está el micropréstamo.',
} as const;
