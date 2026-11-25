// BIKE-01 · bici compartida: estaciones junto al metro de los barrios con calle. Cada `point` es un point con nombre de
// su location (data/vallesco.ts, data/campoAlto.ts); WorldScene pone una estación por entrada, sin saber dónde está.

/** Lo que cuesta sacar una bici, en euros (se paga al cogerla; devolverla no cuesta nada). */
export const BIKE_SHARE_FARE = 1;

export interface BikeShareStation { id: string; location: string; point: string; label: string }

export const BIKE_SHARE_STATIONS: readonly BikeShareStation[] = [
  { id: 'vallesco-metro', location: 'district', point: 'BIKE_SHARE_METRO', label: 'Bici compartida · Metro Vallesco' },
  { id: 'campo-alto-metro', location: 'campo-alto', point: 'CA_BIKE_SHARE', label: 'Bici compartida · Metro Campo Alto' },
];
