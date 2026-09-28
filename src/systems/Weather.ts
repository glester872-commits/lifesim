// Sin Phaser: lo usan la calle (StreetLife), los locales (Crowd), las bicis (Traffic), la luz y la lluvia
// (world/Lighting, world/WeatherView), la ropa de la gente (world/WeatherLooks) y scripts/check-weather.ts.
import { hashSeed, seededRng } from './MetroDaily.ts';

/**
 * El tiempo que hace. No es un simulador meteorológico: es una función del
 * reloj, como todo lo demás. Cada día tiene su plan con semilla (cuánto nublado,
 * si llueve y cuándo, qué temperatura de fondo), así que el mismo día llueve
 * siempre a la misma hora y recargar la partida no cambia el cielo. Los días
 * vienen en rachas (una ola de frío, una semana templada) y dentro del día la
 * temperatura sube y baja con el sol.
 *
 * Lo que devuelve se usa para que se VEA: la luz, el suelo mojado, la lluvia, la
 * ropa, los paraguas y cuánta gente va a la terraza o se mete en un bar. Todo
 * cambia poco a poco: la lluvia entra y sale en rampa, el suelo se seca en horas.
 */

export type Sky = 'clear' | 'cloudy' | 'light-rain' | 'heavy-rain';
export type Temp = 'warm' | 'mild' | 'cold';

export interface Weather {
  /** Nubes, de 0 (despejado) a 1 (cubierto): apaga el sol y agrisa el cielo. */
  cloud: number;
  /** Lluvia, de 0 a 1: más de 0,55 es chaparrón. */
  rain: number;
  /** Suelo mojado, de 0 a 1: sube con la lluvia y baja en horas al parar. */
  wet: number;
  celsius: number;
  sky: Sky;
  temp: Temp;
}

/** Umbrales: lo que cuenta como lluvia fuerte, frío o calor. */
export const HEAVY_RAIN = 0.55;
const LIGHT_RAIN = 0.08;
const COLD_BELOW = 11;
const WARM_ABOVE = 22;

interface Episode {
  /** Horas desde las 00:00 del día del plan (puede pasar de 24: sigue de madrugada). */
  start: number;
  end: number;
  peak: number;
}

interface DayPlan {
  cloud: number;
  celsius: number;
  episodes: Episode[];
}

const plans = new Map<number, DayPlan>();

/** El plan de un día: siempre el mismo para el mismo día. */
function planFor(day: number): DayPlan {
  const hit = plans.get(day);
  if (hit) return hit;
  const rng = seededRng(hashSeed('tiempo', day));
  // Rachas: una onda larga de temperatura (unas tres semanas) más el capricho de cada día.
  const celsius = 15 + 8 * Math.sin((day / 23) * Math.PI * 2 + 1.3) + (rng() - 0.5) * 5;
  const rainy = rng() < 0.3 + (celsius < COLD_BELOW ? 0.12 : 0) - (celsius > WARM_ABOVE ? 0.12 : 0);
  const cloud = rainy ? 0.6 + rng() * 0.3 : rng() < 0.35 ? 0.35 + rng() * 0.4 : rng() * 0.2;
  const episodes: Episode[] = [];
  if (rainy) {
    const n = rng() < 0.35 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const start = 6 + rng() * 15;
      const heavy = rng() < 0.35;
      episodes.push({ start, end: start + 2 + rng() * 5, peak: heavy ? 0.75 + rng() * 0.25 : 0.25 + rng() * 0.28 });
    }
  }
  const plan = { cloud, celsius, episodes };
  plans.set(day, plan);
  return plan;
}

const smooth = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** Lo que tarda la lluvia en arrancar o en parar, en horas. */
const RAMP_H = 0.6;

/** Lluvia a esa hora, contando la que empezó ayer y sigue de madrugada. */
function rainAt(day: number, hour: number): number {
  let rain = 0;
  for (const [d, offset] of [[day, 0], [day - 1, 24]] as const) {
    for (const e of planFor(d).episodes) {
      const t = hour + offset;
      const k = Math.min(smooth((t - e.start) / RAMP_H), smooth((e.end - t) / RAMP_H));
      rain = Math.max(rain, e.peak * k);
    }
  }
  return rain;
}

/** Nubes: las del día, que se cierran hora y media antes de llover y se abren después. */
function cloudAt(day: number, hour: number): number {
  const base = planFor(day).cloud;
  let near = 0;
  for (const [d, offset] of [[day, 0], [day - 1, 24]] as const) {
    for (const e of planFor(d).episodes) {
      const t = hour + offset;
      near = Math.max(near, Math.min(smooth((t - e.start + 1.5) / 1.5), smooth((e.end + 1 - t) / 1)) * 0.95);
    }
  }
  return Math.max(base, near);
}

/** El suelo moja con la lluvia y seca solo: la mitad del agua, en unas dos horas y media. */
const DRY_HALF_LIFE_H = 2.5;
const WET_STEP_H = 0.25;

function wetAt(day: number, hour: number): number {
  let wet = 0;
  const decay = 0.5 ** (WET_STEP_H / DRY_HALF_LIFE_H);
  for (let back = 10; back >= 0; back -= WET_STEP_H) {
    const h = hour - back;
    const [d, hh] = h < 0 ? [day - 1, h + 24] : [day, h];
    wet = Math.min(1, wet * decay + rainAt(d, hh) * WET_STEP_H * 1.6);
  }
  return wet;
}

/** Temperatura: la del día, más fresca de madrugada y más alta a media tarde; la lluvia la baja. */
function celsiusAt(day: number, hour: number, rain: number): number {
  return planFor(day).celsius + 4 * Math.sin(((hour - 9) / 24) * Math.PI * 2) - rain * 2.5;
}

export function skyOf(cloud: number, rain: number): Sky {
  return rain > HEAVY_RAIN ? 'heavy-rain' : rain > LIGHT_RAIN ? 'light-rain' : cloud > 0.5 ? 'cloudy' : 'clear';
}

export function tempOf(celsius: number): Temp {
  return celsius < COLD_BELOW ? 'cold' : celsius > WARM_ABOVE ? 'warm' : 'mild';
}

/** Forzar el tiempo en desarrollo (lifesim.weather): null vuelve al del calendario. */
let forced: Partial<Pick<Weather, 'cloud' | 'rain' | 'wet' | 'celsius'>> | null = null;

export function forceWeather(w: typeof forced): void {
  forced = w;
  memo.clear();
}

const memo = new Map<string, Weather>();

/** El tiempo que hace ese día a esa hora (con decimales). Se calcula a pasos de cinco minutos. */
export function weatherAt(day: number, hour: number): Weather {
  const h = Math.round(hour * 12) / 12;
  const key = `${day}:${h}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const rain = forced?.rain ?? rainAt(day, h);
  const cloud = forced?.cloud ?? Math.max(cloudAt(day, h), rain > 0 ? 0.8 : 0);
  const wet = forced?.wet ?? (forced?.rain !== undefined ? Math.min(1, forced.rain * 1.4) : wetAt(day, h));
  const celsius = forced?.celsius ?? celsiusAt(day, h, rain);
  const w: Weather = { cloud, rain, wet, celsius, sky: skyOf(cloud, rain), temp: tempOf(celsius) };
  if (memo.size > 600) memo.clear();
  memo.set(key, w);
  return w;
}

/**
 * Cuánto quiere la gente estar fuera: 1 un día templado y seco; menos con
 * lluvia o frío; más con calor (terrazas, parque). Lo usan la calle y los locales.
 */
export function outdoorAppeal(w: Weather): number {
  const rain = w.rain > HEAVY_RAIN ? 0.15 : w.rain > LIGHT_RAIN ? 0.45 : 1;
  const temp = w.temp === 'cold' ? 0.6 : w.temp === 'warm' ? 1.4 : 1;
  return rain * temp;
}
