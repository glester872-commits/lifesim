import type { Pitch } from '../systems/Futsal.ts';

/**
 * Dónde se tiran penaltis (systems/Futsal.ts), por localización y por punto: la portería de la pista de Campo Alto,
 * los sábados por la mañana, cuando bajan los del fútbol del barrio (data/streets.ts, 'futsal').
 */
export const PITCHES: Readonly<Record<string, Readonly<Record<string, Pitch>>>> = {
  'campo-alto': {
    CA_FUTSAL_SPOT: { id: 'ca-penalty', point: 'CA_FUTSAL_SPOT', label: 'Penaltis · Pista del barrio', goal: { tx: 11, ty: 18, tilesHigh: 2 }, open: { weekday: 5, from: 10, to: 13 } },
  },
};
