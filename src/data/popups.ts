/**
 * Eventos de la Calle del Carmen: lo que pasa pocas veces y hace que la calle
 * sea otra ese día. Rastro y reglas en systems/PopUps.ts; los dibuja
 * world/PopUpView. No son un sistema aparte de gente: durante el evento, la
 * gente de la calle (systems/StreetLife) tiene viajes extra que sólo valen
 * entonces (`TripRule.popup`) y la calle admite algunos paseantes más.
 *
 * Cuándo toca cada uno sale del calendario del juego (días de la semana,
 * horas) y de una tirada por semana con semilla fija: la misma partida tiene
 * los mismos eventos en los mismos días, y ninguna semana es igual a otra.
 * Con lluvia fuerte, los de la calle se suspenden.
 */

export type PopUpPiece =
  | 'stall-vintage'
  | 'stall-fashion'
  | 'tent'
  | 'booth'
  | 'easel'
  | 'sign-sneaker'
  | 'boxes';

export interface PopUpProp {
  piece: PopUpPiece;
  /** Fila base (px de mundo = tile × 16): la pieza crece hacia arriba desde ahí. */
  tx: number;
  ty: number;
  /** Cuánto ocupa en tiles de ancho (para su cuerpo sólido). Sin él, no bloquea el paso. */
  solid?: number;
}

export interface PopUpDef {
  id: string;
  /** Para el inspector y el registro: nada de esto sale en pantalla. */
  name: string;
  location: string;
  /** Días de la semana en que puede empezar (0 lunes … 6 domingo). */
  days: readonly number[];
  /** Cuántos días seguidos dura. */
  span?: number;
  /** [abre, cierra) en horas; si cierra antes de abrir, pasa de medianoche. */
  hours: readonly [number, number];
  /** Probabilidad de que esa semana lo haya. */
  chance: number;
  /** Paseantes de más en la calle mientras dura. */
  extra: number;
  /** Se suspende con lluvia fuerte. */
  outdoor: boolean;
  /** Horas antes de abrir en las que ya se está montando (las piezas se ven, la gente aún no). */
  setup: number;
  /** Luz propia de noche: ámbar de galería o focos de baile. */
  glow?: 'gallery' | 'dj';
  props: readonly PopUpProp[];
}

/**
 * En orden de prioridad: si dos caen el mismo día, el primero se queda y el
 * otro se salta esa semana (no se montan dos a la vez en la misma acera).
 */
export const POPUPS: readonly PopUpDef[] = [
  // Mercadillo vintage: sábados y domingos, de las once a las siete. Cinco puestos en la acera sur.
  {
    id: 'vintage-market', name: 'Mercadillo vintage', location: 'district',
    days: [5, 6], hours: [11, 18.5], chance: 0.34, extra: 12, outdoor: true, setup: 1.5,
    props: [
      { piece: 'stall-vintage', tx: 80, ty: 53, solid: 2 },
      { piece: 'stall-vintage', tx: 85, ty: 53, solid: 2 },
      { piece: 'stall-vintage', tx: 92, ty: 53, solid: 2 },
      { piece: 'stall-vintage', tx: 96, ty: 53, solid: 2 },
      { piece: 'stall-vintage', tx: 105, ty: 53, solid: 2 },
    ],
  },
  // Cola de una zapatilla: jueves o sábado por la mañana. Una pizarra, cajas apiladas y una cola de verdad.
  {
    id: 'sneaker-release', name: 'Lanzamiento de zapatillas', location: 'district',
    days: [3, 5], hours: [10, 15], chance: 0.16, extra: 9, outdoor: true, setup: 1,
    props: [
      { piece: 'sign-sneaker', tx: 104, ty: 51 },
      { piece: 'boxes', tx: 108, ty: 49, solid: 1 },
    ],
  },
  // Pop-up de moda: de viernes a domingo por la mañana y la tarde, una carpa blanca y un puesto.
  {
    id: 'fashion-popup', name: 'Pop-up de moda', location: 'district',
    days: [4], span: 3, hours: [12, 17.5], chance: 0.2, extra: 7, outdoor: true, setup: 2,
    props: [
      { piece: 'tent', tx: 95, ty: 53, solid: 3 },
      { piece: 'stall-fashion', tx: 85, ty: 53, solid: 2 },
    ],
  },
  // DJ pequeño: sábados por la noche, cabina junto a la tienda de segunda mano y gente bailando en la acera.
  {
    id: 'dj-event', name: 'DJ en la calle', location: 'district',
    days: [5], hours: [20, 1], chance: 0.26, extra: 10, outdoor: true, setup: 1, glow: 'dj',
    props: [{ piece: 'booth', tx: 92, ty: 53, solid: 2 }],
  },
  // Inauguración de arte: jueves y viernes por la tarde-noche; caballetes a lo largo de la acera, copas en la mano.
  {
    id: 'art-event', name: 'Inauguración de arte', location: 'district',
    days: [3, 4], hours: [19, 23], chance: 0.3, extra: 8, outdoor: true, setup: 1, glow: 'gallery',
    props: [
      { piece: 'easel', tx: 80, ty: 53, solid: 1 },
      { piece: 'easel', tx: 83, ty: 53, solid: 1 },
      { piece: 'easel', tx: 87, ty: 53, solid: 1 },
      { piece: 'easel', tx: 98, ty: 53, solid: 1 },
    ],
  },
];
