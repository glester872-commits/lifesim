/** Minutos desde que se pide turno en el mostrador del hospital hasta que llaman a consulta (systems/Hospital). */
export const HOSPITAL_CALL_MINUTES = 45;
/** Lo que dura la consulta: el reloj avanza esto, como una actividad. */
export const HOSPITAL_VISIT_MINUTES = 20;
/** El lugar (data/places.ts) cuyo horario manda: al cerrar, el turno pendiente se cancela. */
export const HOSPITAL_PLACE = 'hospital';

/** Lo que cuenta la médica de la Consulta 1 en una revisión (systems/Hospital.attend). */
export const DOCTOR_LINES: readonly string[] = [
  'Siéntese. Vamos a tomarle la tensión y a escucharle un momento.',
  'Tensión bien, el pulso tranquilo, los pulmones limpios.',
];
