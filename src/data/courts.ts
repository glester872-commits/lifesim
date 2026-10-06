import type { CourtSpot } from '../systems/Basketball.ts';

/** Un sitio desde el que tirar: el punto de la pista (data/ribera.ts), la canasta a la que apunta y lo difícil que es. */
export interface ShootingSpot extends CourtSpot {
  hoop: { tx: number; ty: number };
}

const HOOP_W = { tx: 28, ty: 16 };
const HOOP_E = { tx: 31, ty: 16 };

/**
 * Las pistas donde el jugador tira (systems/Basketball.ts), por localización y por punto. Cuanto más lejos, más
 * potencia ideal y menos probabilidad con el tiro perfecto; todos los números del tiro en sí, en SHOOTING.
 * Los puntos HOOPS_* son los mismos puestos que usa la gente (data/stations.ts, 'hoops'); los de tiro libre,
 * RB_COURT_FT_*, son sólo del jugador.
 */
export const COURTS: Readonly<Record<string, Readonly<Record<string, ShootingSpot>>>> = {
  ribera: {
    HOOPS_01: { id: 'close-w', point: 'HOOPS_01', label: 'Cerca · izquierda', ideal: 0.35, base: 0.85, hoop: HOOP_W },
    HOOPS_03: { id: 'close-e', point: 'HOOPS_03', label: 'Cerca · derecha', ideal: 0.35, base: 0.85, hoop: HOOP_E },
    HOOPS_02: { id: 'mid-w', point: 'HOOPS_02', label: 'Media distancia · izquierda', ideal: 0.5, base: 0.62, hoop: HOOP_W },
    HOOPS_04: { id: 'mid-e', point: 'HOOPS_04', label: 'Media distancia · derecha', ideal: 0.5, base: 0.62, hoop: HOOP_E },
    RB_COURT_FT_01: { id: 'free-w', point: 'RB_COURT_FT_01', label: 'Tiro libre · izquierda', ideal: 0.64, base: 0.55, hoop: HOOP_W },
    RB_COURT_FT_02: { id: 'free-e', point: 'RB_COURT_FT_02', label: 'Tiro libre · derecha', ideal: 0.64, base: 0.55, hoop: HOOP_E },
  },
};
