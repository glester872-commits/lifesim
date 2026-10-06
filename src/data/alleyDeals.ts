import type { EventSlot } from './streetEvents.ts';

/**
 * Trapicheo en callejones (systems/AlleyDeals.ts, world/AlleyDealView.ts): un
 * ambiente raro y discreto en sitios poco vistos, no un sistema de delitos. No
 * hay sustancias, precios ni cantidades: alguien espera, alguien vigila, alguien
 * se acerca, un momento cerca y cada uno por su lado. Los papeles (vendedor,
 * vigía, acompañante, comprador) son del rato que dura, no de nadie: el aspecto
 * de cada uno se saca al azar de la gente de siempre, sin mirar quién es.
 *
 * Un sitio nuevo es una entrada aquí. Sólo valen sitios escondidos: un
 * callejón de servicio, un pasaje entre bloques. Nunca calzada, vía, plaza ni
 * parque, ni encima del camino por el que pasa la gente (scripts/check-alley-deals.ts).
 */
export interface AlleySpotDef {
  id: string;
  location: string;
  name: string;
  /** El sitio, en tiles: con el jugador dentro (o a un tile), lo tiene delante. */
  area: { tx: number; ty: number; w: number; h: number };
  seller: EventSlot;
  /** Donde se pone quien viene: al lado del vendedor, fuera del paso. */
  meet: EventSlot;
  lookout: EventSlot;
  /** Hacia dónde mira el vigía cuando se gira (la otra boca). */
  scan: EventSlot['facing'];
  associate?: EventSlot;
  /** Tiles por los que entra y sale la gente (en la acera de al lado: nadie cruza la calzada para llegar). */
  entries: readonly { tx: number; ty: number }[];
  /** Probabilidad de que haya un rato en cada franja de un día: por la tarde, de noche y de madrugada. */
  odds: { afternoon: number; evening: number; late: number };
  /** No coincide con este evento de calle (data/streetEvents.ts) si esa noche hay: el sitio ya está ocupado. */
  yieldsTo?: string;
}

/** Lo que dicen: si les hablas, si te quedas mirando y lo que dice el vigía. Seco, sin gracia y sin detalles. */
export const ALLEY_LINES = {
  seller: ['Aquí no hay nada que ver.', '¿Buscas algo? Pues sigue.', 'Estoy esperando a alguien. No a ti.'],
  lookout: ['Circula, anda.', 'Tú no has visto nada.', 'Sigue tu camino, que es tarde.'],
  associate: ['Nada, aquí charlando.', 'Vete, que no es asunto tuyo.'],
  buyer: ['Ya me iba.', '(Mira al suelo y se aparta.)'],
  /** Te has quedado demasiado cerca: lo dice quien está más cerca antes de irse todos. */
  noticed: ['¿Qué miras?', 'Vale, nos vamos.', 'Mal sitio para pararse.'],
} as const;

export const ALLEY_SPOTS: readonly AlleySpotDef[] = [
  {
    // El callejón de servicio que sube de la Mayor al patio de atrás: paredes ciegas, cajas y una lámpara de obra.
    id: 'servicio-mayor',
    location: 'district',
    name: 'Callejón de servicio',
    area: { tx: 74, ty: 4, w: 2, h: 12 },
    seller: { tx: 74, ty: 9, facing: 'right' },
    meet: { tx: 75, ty: 9, facing: 'left' },
    associate: { tx: 74, ty: 7, facing: 'down' },
    lookout: { tx: 75, ty: 14, facing: 'down' },
    scan: 'up',
    entries: [{ tx: 71, ty: 17 }, { tx: 80, ty: 17 }],
    odds: { afternoon: 0.05, evening: 0.35, late: 0.4 },
    yieldsTo: 'patio-mayor',
  },
  {
    // El Pasaje del Reloj de noche, entre Olmo 11 y Avenida 20: la gente pasa por un lado; ellos, en el otro.
    id: 'pasaje-reloj',
    location: 'district',
    name: 'Pasaje del Reloj',
    area: { tx: 56, ty: 42, w: 2, h: 9 },
    seller: { tx: 57, ty: 47, facing: 'up' },
    meet: { tx: 57, ty: 48, facing: 'up' },
    lookout: { tx: 57, ty: 42, facing: 'up' },
    scan: 'down',
    entries: [{ tx: 53, ty: 41 }, { tx: 56, ty: 51 }],
    odds: { afternoon: 0.03, evening: 0.3, late: 0.35 },
  },
];
