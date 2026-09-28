/**
 * Tiempos del movimiento secundario: lo que hace que cada cosa se mueva a su
 * aire en vez de todas a la vez. Una semilla (el id de alguien, la posición de
 * un árbol) desplaza el compás; nadie comparte fase con su vecino.
 *
 * Todo es función del tiempo (ms del juego, el mismo reloj de Phaser): sin
 * estado, sin temporizadores sueltos, y lo que no se ve no cuesta nada.
 */

/** Fase fija de 0 a 1 para una semilla: la razón áurea reparte bien semillas seguidas. */
export function phaseOf(seed: number): number {
  return ((seed * 0.618034) % 1 + 1) % 1;
}

/** Onda de 0 a 1 de periodo `periodMs`, desplazada por la fase. */
export function wave(time: number, periodMs: number, phase = 0): number {
  return 0.5 + 0.5 * Math.sin((time / periodMs + phase) * Math.PI * 2);
}

/**
 * Un rato de cada periodo: verdadero durante `dutyMs` una vez cada `periodMs`,
 * en un momento propio de cada semilla. Sirve para gestos ocasionales (mirar a
 * un lado, asentir) sin que todo el mundo los haga a la vez.
 */
export function every(time: number, seed: number, periodMs: number, dutyMs: number): boolean {
  return (time + phaseOf(seed) * periodMs) % periodMs < dutyMs;
}

/**
 * Racha de viento: un frente que cruza el barrio de oeste a este. Las copas que
 * pilla se mecen a la vez y las de más allá, un momento después, como en una
 * calle de verdad. `x` en px de mundo.
 */
export function gust(time: number, x: number, periodMs = 5600): boolean {
  return wave(time, periodMs, -x / 900) > 0.78;
}
