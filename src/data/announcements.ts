/**
 * Megafonía de las estaciones, por contexto. `{min}` se sustituye por los
 * minutos de juego que faltan para el siguiente tren.
 */
export const ANNOUNCEMENTS = {
  delay: [
    'Por una incidencia en la línea, el próximo tren circula con unos minutos de retraso.',
    'Informamos de que el servicio sufre pequeñas demoras. Disculpen las molestias.',
  ],
  busy: [
    'Por favor, dejen salir antes de entrar.',
    'Se ruega no obstaculizar el cierre de puertas.',
    'Avancen hacia el centro del andén para facilitar la entrada.',
  ],
  night: [
    'Les recordamos que a estas horas la frecuencia de paso es menor.',
    'Viajeros: mantengan sus pertenencias a la vista.',
  ],
  general: [
    'Línea 2. Próximo tren en {min} minutos.',
    'Por su seguridad, no rebasen la franja amarilla del andén.',
    'Mantengan sus pertenencias a la vista.',
  ],
  surge: ['Tren con mucha ocupación. Por favor, dejen salir antes de entrar.'],
} as const;
