/**
 * VID-10 · encargos de reparto urbano, a pie (reglas en systems/Delivery.ts). Se ofrecen en el tablón cuya location es
 * `board`; se recogen y entregan en un mostrador (interactable 'terminal': location + catalog). El plazo empieza al recoger.
 *
 * Plazos: tiles a pie (mostrador → puerta del local, la acera hasta la otra puerta, puerta → mostrador) × 0,41 min por tile
 * (config/agenda.ts WALK_PER_TILE) × ~2 de margen. scripts/check-reparto.ts lo mide desde los datos (bloque A).
 */
export interface DeliveryEnd {
  /** El interior del local. */
  location: string;
  /** El catálogo del mostrador ('terminal') donde se recoge o entrega. */
  catalog: string;
  label: string;
  /** Dirección legible para la pista (sin números: los locales de Campo Alto no los tienen en los datos). */
  address?: string;
}

export interface DeliveryDef {
  id: string;
  title: string;
  board: string;
  from: DeliveryEnd;
  to: DeliveryEnd;
  pay: number;
  /** Minutos desde que lo recoges. */
  deadlineMin: number;
  /** Minutos de retraso que aún se pagan, del 90 % a `lateFloorPct`; después, vencido. */
  lateMin: number;
  lateFloorPct: number;
}

// Los tres, en la acera norte de la Calle del Campo (data/campoAlto.ts: 'Calle del Campo', puertas en x 17, 38 y 11).
const CALLE = 'Calle del Campo, acera norte';
const CAFE = { location: 'ca-cafe', catalog: 'cafe-counter', label: 'Café Campo Alto', address: CALLE } as const;
const PANADERIA = { location: 'ca-panaderia', catalog: 'ca-panaderia-mostrador', label: 'Panadería Cuatro Hornos', address: CALLE } as const;
const ULTRAMARINOS = { location: 'ca-ultramarinos', catalog: 'supermarket-till', label: 'Ultramarinos Esquina', address: CALLE } as const;

export const DELIVERIES: readonly DeliveryDef[] = [
  // ≈21 tiles (barra → salida 8, acera x17 → x11 ~8, salida → caja 5). Medido en el navegador con ruta casi óptima:
  // ~22 min de juego (puertas, fundidos y el reloj a ~2 min/s mientras se anda; 0,41 min/tile se queda corto). Plazo ≈1,6×.
  { id: 'ca-cafe-ultramarinos', title: 'Café al Ultramarinos', board: 'campo-alto', from: CAFE, to: ULTRAMARINOS, pay: 6, deadlineMin: 35, lateMin: 15, lateFloorPct: 40 },
  // ≈39 tiles: unos 21 más de acera (x38 → x11) que el del café, ~9 min más sobre lo medido: ~31 min estimados. Plazo ≈1,6×.
  { id: 'ca-panaderia-ultramarinos', title: 'Pan al Ultramarinos', board: 'campo-alto', from: PANADERIA, to: ULTRAMARINOS, pay: 11, deadlineMin: 50, lateMin: 20, lateFloorPct: 40 },
  // Los dos tramos que faltan para el turno (también sueltos en el tablón). ≈39 tiles (caja 5, acera x11 → x38 27, +2,
  // mostrador 5), el mismo recorrido que el de la panadería al revés: mismo plazo.
  { id: 'ca-ultramarinos-panaderia', title: 'Recado a la Panadería', board: 'campo-alto', from: ULTRAMARINOS, to: PANADERIA, pay: 11, deadlineMin: 50, lateMin: 20, lateFloorPct: 40 },
  // ≈36 tiles (mostrador 5, acera x38 → x17 21, +2, barra 8). Plazo ≈1,6× lo estimado como los otros.
  { id: 'ca-panaderia-cafe', title: 'Pan al Café', board: 'campo-alto', from: PANADERIA, to: CAFE, pay: 9, deadlineMin: 45, lateMin: 20, lateFloorPct: 40 },
];

export const getDelivery = (id: string): DeliveryDef | undefined => DELIVERIES.find((d) => d.id === id);
export const deliveriesOn = (board: string): DeliveryDef[] => DELIVERIES.filter((d) => d.board === board);

/**
 * Un turno de reparto: tramos encadenados (ids de DELIVERIES) con un único runId, un único resultado y un único cobro.
 * Cada tramo empieza donde acaba el anterior, así que al entregar se recoge el siguiente en el mismo mostrador.
 * `bikePoint`: punto con nombre de los `points` de `board`, junto al tablón, donde se presta y se devuelve la bici de empresa.
 */
export interface ShiftDef {
  id: string;
  title: string;
  board: string;
  legs: readonly string[];
  /** Pago fijo del turno, al entregar el último tramo (reducido por tardanza de ese tramo, como `payout`). */
  pay: number;
  bikePoint: string;
}

export const SHIFTS: readonly ShiftDef[] = [
  // Café → Ultramarinos → Panadería → Café. 26 € sueltos; el turno paga algo más por hacerlos seguidos.
  { id: 'ca-turno-reparto', title: 'Turno de reparto', board: 'campo-alto', legs: ['ca-cafe-ultramarinos', 'ca-ultramarinos-panaderia', 'ca-panaderia-cafe'], pay: 30, bikePoint: 'CA_DELIVERY_BIKE' },
];

export const getShift = (id: string): ShiftDef | undefined => SHIFTS.find((s) => s.id === id);
export const shiftsOn = (board: string): ShiftDef[] => SHIFTS.filter((s) => s.board === board);
