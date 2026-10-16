// Sin Phaser ni Web Audio: lo usan scenes/WorldScene (qué suena ahora) y scripts/check-soundscape.ts.

/**
 * El sonido de la ciudad, decidido sin tocar el altavoz: de las fuentes que hay cerca (una fuente de agua, una
 * terraza con gente, el tráfico que pasa, el metro) sale cuánto suena cada una de las cuatro capas. audio/CityAudio
 * sólo lo hace sonar. Cuatro capas y nunca más: cada fuente nueva sube o baja una capa que ya existe, no abre otra.
 *
 * Cada fuente tiene su nivel (0–1, lo que dice el mundo: una terraza medio llena, un coche a velocidad) y se oye
 * menos con la distancia hasta callarse en el alcance de su capa. Se cuentan sólo las más cercanas de cada capa
 * (NEAREST): veinte coches no suenan veinte veces más que tres. Dentro de un local, la calle no se oye.
 */
export type Layer = 'water' | 'murmur' | 'traffic' | 'metro';
export const LAYERS: readonly Layer[] = ['water', 'murmur', 'traffic', 'metro'];

export interface Emitter {
  layer: Layer;
  /** Posición en tiles; sin ella, suena donde está quien escucha (el murmullo de dentro de un local). */
  x?: number;
  y?: number;
  level: number;
}

/** Hasta dónde se oye cada capa, en tiles. El tráfico llega lejos; una fuente, sólo al acercarse. */
export const REACH: Readonly<Record<Layer, number>> = { water: 7, murmur: 6, traffic: 13, metro: 8 };
/** Cuántas fuentes de cada capa cuentan: las más cercanas. */
export const NEAREST = 3;

export type Mix = Record<Layer, number>;
export const SILENT: Readonly<Mix> = { water: 0, murmur: 0, traffic: 0, metro: 0 };

/** Lo que queda de una fuente a esa distancia: entero al lado, nada en el borde de su alcance (curva suave, sin escalón). */
export function falloff(layer: Layer, distance: number): number {
  const k = Math.max(0, 1 - distance / REACH[layer]);
  return k * k;
}

/**
 * Cuánto suena cada capa (0–1) para quien escucha en `at`. Varias fuentes se suman sin pasar de 1: dos terrazas
 * llenas no son el doble de ruido, sólo un poco más que una.
 */
export function mix(at: { x: number; y: number }, emitters: readonly Emitter[]): Mix {
  const out: Mix = { ...SILENT };
  for (const layer of LAYERS) {
    const heard = emitters
      .filter((e) => e.layer === layer && e.level > 0)
      .map((e) => Math.min(1, e.level) * (e.x === undefined || e.y === undefined ? 1 : falloff(layer, Math.hypot(e.x - at.x, e.y - at.y))))
      .filter((g) => g > 0.001)
      .sort((a, b) => b - a)
      .slice(0, NEAREST);
    out[layer] = Math.round((1 - heard.reduce((quiet, g) => quiet * (1 - g), 1)) * 1000) / 1000;
  }
  return out;
}

// ------------------------------------------------------------ el nivel de cada fuente, del estado del mundo

/** Una terraza o un local: con gente, según cuánta; vacío o cerrado, nada (no suena un café lleno sin nadie). */
export const crowdLevel = (open: boolean, people: number, seats: number): number =>
  open && people > 0 && seats > 0 ? Math.min(1, 0.25 + (0.75 * people) / seats) : 0;

/**
 * Una terraza (o la cola de una sala): cada anclaje de la calle suena con quien está quieto en él (sentado,
 * esperando), contado como mesa de dos. Cerrada, nada; un anclaje vacío, tampoco: suena donde está la gente.
 */
export function terraceEmitters(spots: readonly { tx: number; ty: number }[], open: boolean, agents: readonly { x: number; y: number; moving: boolean }[]): Emitter[] {
  if (!open) return [];
  return spots.flatMap((s) => {
    const people = agents.filter((a) => !a.moving && Math.hypot(a.x - s.tx, a.y - s.ty) < 1.5).length;
    const level = crowdLevel(true, people, 2);
    return level > 0 ? [{ layer: 'murmur' as const, x: s.tx + 0.5, y: s.ty + 0.5, level }] : [];
  });
}

/** Un vehículo: parado al ralentí casi no suena; a su velocidad, del todo. (Las bicis no cuentan: no se oyen.) */
export const vehicleLevel = (speed: number, cruise: number): number => 0.2 + 0.8 * Math.min(1, Math.max(0, speed) / Math.max(1, cruise));

/** El andén: el rumor de siempre y el tren al entrar o salir. */
export function metroLevel(train: string | null): number {
  if (train === 'ARRIVING' || train === 'DEPARTING') return 1;
  if (train === 'APPROACHING' || train === 'STOPPED' || train === 'DOORS_OPENING' || train === 'BOARDING' || train === 'DOORS_CLOSING') return 0.55;
  return 0.3;
}
