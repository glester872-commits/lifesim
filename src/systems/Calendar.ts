// Sin Phaser: lo usan el reloj, el HUD, los horarios de los sitios, las rutinas
// de los personajes, la gente de la calle y los scripts de comprobación.

/**
 * El calendario del mundo. El reloj (GameState: día, hora, minuto; lo mueve
 * systems/TimeSystem) es la única fuente de verdad: de él sale la fecha, nunca
 * de la del ordenador. El día 1 de la partida es el lunes 12 de abril de 2027
 * (EPOCH) y cada día que pasa es un día del calendario gregoriano: mes, año,
 * bisiestos y estación salen del número de día, así que se guarda y se
 * recupera con la partida sin guardar nada más. Una partida de antes, que sólo
 * tenía «día N», carga igual: su día N es la misma fecha (N − 1 días después
 * del 12 de abril de 2027) y conserva el día de la semana que ya tenía.
 *
 * Quien quiera saber qué día es:
 *   weekdayOf(state.day)          → 'friday'
 *   isWeekend(state.day)          → false
 *   dateOf(state.day)             → { day, week, weekIndex, weekday, weekend, year, month, dom, season, … }
 *   seasonOf(state.day)           → 'spring'
 *   formatDate(state.day)         → «lunes, 12 de abril de 2027»
 *   dayOfDate(2028, 2, 29)        → el día de partida de esa fecha
 *   rhythmAt(state.day, hour)     → 'friday-evening', 'weekend-night', …
 * Quien quiera enterarse de que cambia el día: onNewDay(state, fn) (TimeSystem lo avisa).
 */

export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

/** En orden: el índice de cada uno es su weekIndex (0 lunes … 6 domingo). */
export const WEEK: readonly Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** Cómo se dice en el juego: entero y en abreviatura de tres letras. */
export const WEEKDAY_LABEL: Readonly<Record<Weekday, string>> = {
  monday: 'lunes', tuesday: 'martes', wednesday: 'miércoles', thursday: 'jueves', friday: 'viernes', saturday: 'sábado', sunday: 'domingo',
};
export const WEEKDAY_SHORT: Readonly<Record<Weekday, string>> = {
  monday: 'Lun', tuesday: 'Mar', wednesday: 'Mié', thursday: 'Jue', friday: 'Vie', saturday: 'Sáb', sunday: 'Dom',
};

export const DAYS_PER_WEEK = 7;

/** 0 = lunes … 6 = domingo, para el día `day` de la partida (el día 1 es lunes). Vale también para días ≤ 0. */
export const weekIndex = (day: number): number => (((day - 1) % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK;

export const weekdayOf = (day: number): Weekday => WEEK[weekIndex(day)];

export const isWeekend = (day: number): boolean => weekIndex(day) >= 5;

// ------------------------------------------------ conjuntos de días (datos)

/** Días de trabajo y fin de semana, como índices: lo que piden `Routine.days`, `PlaceDef.days`… */
export const WEEKDAYS: readonly number[] = [0, 1, 2, 3, 4];
export const WEEKEND: readonly number[] = [5, 6];
export const EVERY_DAY: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

/** Días por su nombre, para que los datos se lean: `days: on('monday', 'wednesday', 'friday')`. */
export function on(...days: Weekday[]): number[] {
  return days.map((d) => WEEK.indexOf(d));
}

// ------------------------------------------------------ fecha del mundo

/** El día 1 de la partida: lunes 12 de abril de 2027 (UTC, sin husos ni cambios de hora: sólo cuenta la fecha). */
export const EPOCH = { year: 2027, month: 4, dom: 12 } as const;
const EPOCH_MS = Date.UTC(EPOCH.year, EPOCH.month - 1, EPOCH.dom);
const DAY_MS = 86_400_000;

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export const SEASON_LABEL: Readonly<Record<Season, string>> = { winter: 'invierno', spring: 'primavera', summer: 'verano', autumn: 'otoño' };

export const MONTH_LABEL: readonly string[] = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MONTH_SHORT: readonly string[] = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Estación astronómica en Madrid (hemisferio norte): primavera 20 mar, verano 21 jun, otoño 23 sep, invierno 21 dic. */
export function seasonAt(month: number, dom: number): Season {
  const md = month * 100 + dom;
  return md >= 1221 || md < 320 ? 'winter' : md < 621 ? 'spring' : md < 923 ? 'summer' : 'autumn';
}

/**
 * Fecha del mundo: el día de partida, la semana (la 1 es la de los días 1–7), el día de la semana y la fecha
 * del calendario (año, mes 1–12, día del mes, día del año 1–366) con su estación.
 */
export interface WorldDate {
  day: number;
  week: number;
  weekIndex: number;
  weekday: Weekday;
  weekend: boolean;
  year: number;
  month: number;
  dom: number;
  doy: number;
  season: Season;
}

export function dateOf(day: number): WorldDate {
  const d = new Date(EPOCH_MS + (Math.floor(day) - 1) * DAY_MS);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const dom = d.getUTCDate();
  const doy = Math.round((d.getTime() - Date.UTC(year, 0, 1)) / DAY_MS) + 1;
  return { day, week: Math.floor((day - 1) / DAYS_PER_WEEK) + 1, weekIndex: weekIndex(day), weekday: weekdayOf(day), weekend: isWeekend(day), year, month, dom, doy, season: seasonAt(month, dom) };
}

/** El día de partida de una fecha (mes 1–12). Antes del 12 de abril de 2027 sale ≤ 0. */
export const dayOfDate = (year: number, month: number, dom: number): number => Math.round((Date.UTC(year, month - 1, dom) - EPOCH_MS) / DAY_MS) + 1;

export const seasonOf = (day: number): Season => dateOf(day).season;

/** «Lun 12 Abr»: la fecha corta del HUD. */
export function formatDateShort(day: number): string {
  const d = dateOf(day);
  return `${WEEKDAY_SHORT[d.weekday]} ${d.dom} ${MONTH_SHORT[d.month - 1]}`;
}

/** «lunes, 12 de abril de 2027»; sin año, «lunes, 12 de abril». */
export function formatDate(day: number, withYear = true): string {
  const d = dateOf(day);
  return `${WEEKDAY_LABEL[d.weekday]}, ${d.dom} de ${MONTH_LABEL[d.month - 1]}${withYear ? ` de ${d.year}` : ''}`;
}

/** «Lun 12 Abr · 08:42»: lo que enseña el HUD y los mensajes de «pasa el tiempo». */
export function formatClock(day: number, hour: number, minute: number): string {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${formatDateShort(day)} · ${hh}:${mm}`;
}

// ------------------------------------------------------- ritmo de la ciudad

/**
 * Hasta qué hora la madrugada sigue siendo la noche anterior: las 03:00 del
 * sábado son todavía la noche del viernes (lo mismo que usa la calle).
 */
export const NIGHT_ENDS = 6;

/** El día al que pertenece un momento para la vida de la calle: de madrugada, el anterior. */
export const nightOwner = (day: number, hour: number): number => (hour < NIGHT_ENDS ? day - 1 : day);

/**
 * Momentos de la semana que la ciudad vive distinto. Es una etiqueta, no un
 * multiplicador: cada sistema decide en sus datos qué hace con ella (la
 * afluencia de la calle, la de un local, el tráfico).
 */
export type Rhythm =
  | 'weekday-early' // 06–09, entre semana: se va a trabajar
  | 'weekday-work' // 09–17, entre semana
  | 'weekday-evening' // 17–22, lunes a jueves
  | 'friday-evening' // 17–22 del viernes
  | 'weekday-night' // noche de domingo a jueves (hasta NIGHT_ENDS del día siguiente)
  | 'weekend-night' // noche de viernes y sábado (hasta NIGHT_ENDS del día siguiente)
  | 'weekend-morning' // 06–09 de sábado y domingo
  | 'saturday-day' // 09–22 del sábado
  | 'sunday-day'; // 09–22 del domingo

export function rhythmAt(day: number, hour: number): Rhythm {
  const w = weekIndex(nightOwner(day, hour));
  if (hour >= 22 || hour < NIGHT_ENDS) return w === 4 || w === 5 ? 'weekend-night' : 'weekday-night';
  if (w >= 5) return hour < 9 ? 'weekend-morning' : w === 5 ? 'saturday-day' : 'sunday-day';
  if (hour < 9) return 'weekday-early';
  if (hour < 17) return 'weekday-work';
  return w === 4 ? 'friday-evening' : 'weekday-evening';
}

// ------------------------------------------------------- cambio de día

/** Lo que TimeSystem avisa al pasar una medianoche (evento 'midnight': uno por cada medianoche cruzada, en orden). */
export interface Midnight {
  /** El día que empieza. */
  day: number;
  weekday: Weekday;
  /** Del día en que empezó el salto al día en que acaba: en un salto de 30 horas, los mismos en las dos medianoches. */
  from: number;
  to: number;
}

/** Lo mínimo que hace falta para escuchar: el GameState (un EventEmitter de Phaser). */
interface Emitter {
  on(event: string, fn: (m: Midnight) => void): unknown;
  off(event: string, fn: (m: Midnight) => void): unknown;
}

/**
 * Escuchar cada medianoche sin sondear el reloj. Devuelve cómo dejar de
 * escuchar: quien se suscribe desde una escena lo llama al cerrarla (si no,
 * cada visita dejaría un oyente más).
 */
export function onNewDay(state: Emitter, fn: (m: Midnight) => void): () => void {
  state.on('midnight', fn);
  return () => state.off('midnight', fn);
}
