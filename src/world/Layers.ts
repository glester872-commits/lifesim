/**
 * Reglas de capa: qué va delante de qué. Un solo sitio para los números que
 * deciden el orden de dibujo, en lugar de profundidades sueltas por el código.
 *
 * El mundo se ordena por Y de los pies: lo que está más al sur tapa a lo que
 * está más al norte, sea una persona, un árbol, una farola o un coche. Encima de
 * eso, unas pocas capas fijas: el suelo horneado debajo de todo, lo que cuelga
 * del techo por encima de la gente, la luz de la hora encima del mundo y lo que
 * brilla por sí mismo encima de la luz.
 */
export const LAYER = {
  /** Suelo horneado: terreno, edificios, bordillos, sombras de contacto. */
  ground: -10,
  /** Calcomanías sobre el suelo que cambian (charcos): encima del suelo, debajo de todo lo que se levanta. */
  decal: -9,
  /** Del techo: colgantes, tubos y el borde del muro de delante en los interiores. */
  overhead: 800_000,
  /** La luz de la hora (world/Lighting). */
  light: 900_000,
} as const;

/** Lo que está de pie: su profundidad es la Y de sus pies. */
export const standing = (footY: number): number => footY;

/** Un asiento: justo detrás de quien se sienta encima. */
export const seat = (footY: number): number => footY - 1;

/** La sombra de contacto de quien está de pie: justo debajo de sus pies, por encima del suelo. */
export const contact = (footY: number): number => footY - 1;
