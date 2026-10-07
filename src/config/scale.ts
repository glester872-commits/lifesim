import { TILE } from './constants.ts';

/**
 * La escala del mundo, en un solo sitio (px de mundo; 1 tile = 16). Medida sobre lo que se ve en el juego, no
 * sobre las texturas: de ahí salen las reglas de scripts/check-scale.ts y lo que enseña lifesim.scaleCompare().
 *
 * Los sprites son de tres cuartos y suben desde su suelo: el carril (1 tile) es la huella del coche, y los 17–23 px
 * son del techo a las ruedas. La gente mide 24, así que un turismo (≈ 1,45 m) queda por debajo de un peatón (≈ 1,7 m)
 * y un ciclista sentado, por encima. Largos comprimidos (un coche mide 42 y no 58) para que quepan en el tile.
 */
export const SCALE = {
  tile: TILE,
  /** Alto de una persona de pie (celda de 16 × 24; el de 28 × 42 va a 16/28). */
  personH: 24,
  personW: 12,
  /** Alto máximo de un turismo, del techo a las ruedas: nunca por encima de quien camina a su lado. */
  carMaxH: 24,
  /** Una planta de fachada y, con ella, una puerta: lo que mide la puerta de calle. */
  doorH: 2 * TILE,
  /** Acera mínima junto a una calzada, en tiles. */
  sidewalkMin: 2,
} as const;
