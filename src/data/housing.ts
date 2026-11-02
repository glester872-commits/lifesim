import type { InspectDef, PropPlacement, SpotDef } from '../types/game.ts';

/**
 * Vivienda: las dos casas que puede tener el jugador y las mejoras que se instalan en ellas, por ranuras. Sólo
 * datos; las reglas (comprar, instalar, mudarse, qué se traslada y qué se guarda) están en systems/Housing.ts y lo
 * que se tiene se guarda con la partida (GameStateData.housing).
 *
 * Una mejora trae, por casa, lo que añade (muebles, un sitio donde hacer algo, algo que mirar) dentro de su ranura.
 * Esa sola definición es la colisión (props), la interacción (spots, inspects) y por lo tanto la navegación: no hay
 * otra lista. Sin entrada para una casa, la mejora no cabe ahí y se guarda en el trastero hasta que vuelva a caber.
 */

export interface HomeDef {
  id: string;
  name: string;
  /** Interior (data/locations.ts, LocationDef.home lo apunta de vuelta). */
  location: string;
  /** Edificio de la calle con la puerta: de ahí se sale y a ahí se vuelve (spawn con su mismo id). */
  door: string;
  /** Alquiler semanal que se anuncia desde que vives ahí (data/household.ts). */
  rent: number;
  /** Plan de visita (data/visits.ts) que se fija al recibir a alguien aquí; su rutina es `plan-<visitPlan>` (data/characters.ts). */
  visitPlan: string;
  /** Asiento (punto del interior) donde se sienta quien viene de visita. */
  guestSeat: string;
  /** Cómo se dice en una invitación: «en tu piso». */
  place: string;
  /** Lo que se cuenta de la casa antes de mudarse. */
  text: string;
  /** Mudarse aquí desde otra casa. */
  move?: {
    /** Mudanza y fianza, una vez. */
    fee: number;
    /** Dinero libre (cartera menos lo que se debe) que hace falta tener al decidirlo: la meta. */
    free: number;
  };
}

export const HOMES: readonly HomeDef[] = [
  {
    id: 'olmo7',
    name: 'Tu piso · Olmo 7',
    location: 'home',
    door: 'home-door',
    rent: 45,
    visitPlan: 'visita',
    guestSeat: 'HOME_SOFA_02',
    place: 'tu piso',
    text: 'Dos plantas de ventana, cocina, baño, dormitorio y un salón con sitio de sobra. Es donde empiezas.',
    move: { fee: 100, free: 150 },
  },
  {
    id: 'estudio',
    name: 'Estudio · Olmo 11',
    location: 'studio',
    door: 'res-olmo-11',
    rent: 35,
    visitPlan: 'visita-estudio',
    guestSeat: 'STUDIO_SOFA_02',
    place: 'tu estudio',
    text: 'Un estudio compacto: todo en una sola habitación, con el baño aparte. Pequeño, luminoso y €10 más barato a la semana.',
    move: { fee: 150, free: 250 },
  },
  // ALPHA-08 (data/ronda.ts): las dos nuevas, una a cada extremo del barrio y del precio.
  {
    id: 'ronda8',
    name: 'Piso · Ronda 8',
    location: 'ronda-8',
    door: 'ronda-8',
    rent: 55,
    visitPlan: 'visita-ronda8',
    guestSeat: 'R8_SOFA_02',
    place: 'tu piso de la Ronda',
    text: 'Al otro lado de la vía, en la Ronda nueva: dormitorio, despacho con ventana, baño y un salón con comedor. El más grande del barrio, y el más lejos de la Calle Mayor: se cruza por el paso del Parque del Olmo.',
    move: { fee: 180, free: 350 },
  },
  {
    id: 'mayor17',
    name: 'Habitación · Mayor 17',
    location: 'mayor-17',
    door: 'res-mayor-17',
    rent: 25,
    visitPlan: 'visita-mayor17',
    guestSeat: 'M17_SOFA_02',
    place: 'tu habitación de la Mayor',
    text: 'La habitación que anunciaba el portal: dormitorio pequeño con escritorio y, abajo, baño, cocina y un sofá de dos plazas. Encima de la Calle Mayor, con el horno y el metro a dos pasos. La más barata y la más pequeña.',
    move: { fee: 60, free: 90 },
  },
];

export interface Slot {
  /** Cómo se dice al elegir dónde va algo: «la esquina del salón». */
  name: string;
  tx: number;
  ty: number;
  w: number;
  h: number;
}

/** Ranuras de cada casa: el único sitio donde puede ir lo que se instala. Libres de las rutas a puerta, cama, cocina, ducha y armario. */
export const SLOTS: Readonly<Record<string, Readonly<Record<string, Slot>>>> = {
  olmo7: {
    'salon-lectura': { name: 'el rincón de lectura', tx: 13, ty: 10, w: 3, h: 3 },
    'pared-salon': { name: 'la pared del salón', tx: 18, ty: 7, w: 3, h: 2 },
    'esquina-salon': { name: 'la esquina del salón', tx: 16, ty: 10, w: 3, h: 3 },
  },
  estudio: {
    'pared-dormitorio': { name: 'la pared de la cama', tx: 7, ty: 1, w: 2, h: 2 },
    'esquina-salon': { name: 'la esquina del salón', tx: 11, ty: 8, w: 2, h: 2 },
  },
  ronda8: {
    'pared-dormitorio': { name: 'la pared del dormitorio', tx: 10, ty: 1, w: 1, h: 2 },
    'esquina-salon': { name: 'la esquina del salón', tx: 15, ty: 8, w: 2, h: 2 },
    despacho: { name: 'el rincón del despacho', tx: 16, ty: 2, w: 1, h: 2 },
  },
  mayor17: {
    'pared-dormitorio': { name: 'la pared de la cama', tx: 11, ty: 1, w: 1, h: 2 },
    'esquina-salon': { name: 'la esquina de la salita', tx: 12, ty: 6, w: 1, h: 1 },
  },
};

export interface Placement {
  /** Ranura de la casa donde va. */
  slot: string;
  props: readonly PropPlacement[];
  spots?: readonly SpotDef[];
  inspects?: readonly InspectDef[];
}

export interface UpgradeDef {
  id: string;
  name: string;
  /** Funcional: cambia lo que se puede hacer. Expresiva: cambia cómo se ve y se siente la casa. */
  kind: 'funcional' | 'expresiva';
  price: number;
  /** Lo que se ve y se nota, dicho antes de comprarla. */
  text: string;
  /**
   * Por casa; si falta, no cabe y se guarda. Con varias, el jugador elige en cuál de esas ranuras va (y puede
   * recolocarla después): una ranura sólo tiene una cosa (systems/Housing.layout).
   */
  placements: Readonly<Record<string, Placement | readonly Placement[]>>;
  /** Dónde se vende: 'casa' (el ordenador del catálogo del hogar) y/o una tienda (SpotDef.housing). Por defecto, 'casa'. */
  sold?: readonly string[];
}

export const UPGRADES: readonly UpgradeDef[] = [
  {
    id: 'sofa-lectura',
    name: 'Sofá de lectura',
    kind: 'funcional',
    price: 95,
    text: 'Un segundo sofá en el salón con una manta. Un sitio nuevo donde descansar leyendo, sin gastar nada: 45 minutos, +12 de energía.',
    placements: {
      olmo7: {
        slot: 'salon-lectura',
        props: [{ kind: 'sofa', tx: 13, ty: 11 }],
        spots: [{ tx: 13, ty: 12, name: 'Sofá de lectura', activities: ['read-sofa'] }],
      },
    },
  },
  {
    id: 'cuadro-carmen',
    name: 'Cuadro de la Calle del Carmen',
    kind: 'expresiva',
    price: 35,
    text: 'Una lámina enmarcada del mural del Carmen. No hace nada, pero la pared deja de estar vacía y cuando venga alguien se fijará.',
    placements: {
      olmo7: {
        slot: 'pared-salon',
        props: [{ kind: 'painting', tx: 19, ty: 7 }],
        inspects: [{ tx: 19, ty: 8, name: 'Cuadro del Carmen', lines: ['La lámina del mural, con su marco de madera clara. Desde el sofá se ve entera.'] }],
      },
      estudio: {
        slot: 'pared-dormitorio',
        props: [{ kind: 'painting', tx: 7, ty: 1 }],
        inspects: [{ tx: 7, ty: 2, name: 'Cuadro del Carmen', lines: ['La lámina del mural, sobre la cabecera. En un estudio pequeño, lo único que mandas tú.'] }],
      },
      ronda8: {
        slot: 'pared-dormitorio',
        props: [{ kind: 'painting', tx: 10, ty: 1 }],
        inspects: [{ tx: 10, ty: 2, name: 'Cuadro del Carmen', lines: ['La lámina del mural, entre el espejo y la ventana. Desde aquí, el Carmen queda al otro lado de la vía.'] }],
      },
      mayor17: {
        slot: 'pared-dormitorio',
        props: [{ kind: 'painting', tx: 11, ty: 1 }],
        inspects: [{ tx: 11, ty: 2, name: 'Cuadro del Carmen', lines: ['La lámina del mural sobre la cama. Lo único de la habitación que no estaba cuando llegaste.'] }],
      },
    },
  },
  {
    id: 'lampara-pie',
    name: 'Lámpara de pie',
    kind: 'expresiva',
    price: 45,
    // También en Velarde (hogar), al mismo precio: es la misma lámpara y se tiene una sola.
    sold: ['casa', 'velarde'],
    text: 'Una lámpara de pie con luz cálida en una esquina del salón: por la noche, un charco de luz en el suelo.',
    placements: {
      olmo7: {
        slot: 'esquina-salon',
        props: [{ kind: 'floor-lamp', tx: 18, ty: 11 }],
        inspects: [{ tx: 18, ty: 12, name: 'Lámpara de pie', lines: ['Luz cálida y un interruptor de pie que nunca encuentras a la primera.'] }],
      },
      estudio: {
        slot: 'esquina-salon',
        props: [{ kind: 'floor-lamp', tx: 12, ty: 9 }],
        inspects: [{ tx: 11, ty: 9, name: 'Lámpara de pie', lines: ['Luz cálida en la esquina. En el estudio, es lo que separa «salón» de «dormitorio».'] }],
      },
      ronda8: {
        slot: 'esquina-salon',
        props: [{ kind: 'floor-lamp', tx: 16, ty: 9 }],
        inspects: [{ tx: 15, ty: 9, name: 'Lámpara de pie', lines: ['Luz cálida junto al comedor. El salón grande, por fin, con un rincón.'] }],
      },
      mayor17: {
        slot: 'esquina-salon',
        props: [{ kind: 'floor-lamp', tx: 12, ty: 6 }],
        inspects: [{ tx: 12, ty: 7, name: 'Lámpara de pie', lines: ['Luz cálida junto a la tele. La salita parece otra.'] }],
      },
    },
  },
  {
    // Almacenes Velarde, departamento de hogar (CV-03). La primera mejora que se elige dónde va: la esquina del salón o
    // el rincón de lectura (en el estudio, la esquina o junto a la cama). Cada ranura, una cosa: con la lámpara en la
    // esquina, la planta va al otro sitio.
    id: 'monstera',
    name: 'Monstera en maceta',
    kind: 'expresiva',
    price: 39,
    sold: ['velarde'],
    text: 'Una monstera grande en maceta de barro. Verde de verdad en casa: se ve desde la puerta y quien venga la va a mirar.',
    placements: {
      olmo7: [
        { slot: 'esquina-salon', props: [{ kind: 'plant', tx: 17, ty: 11 }], inspects: [{ tx: 17, ty: 12, name: 'Monstera', lines: ['Hojas como platos, con sus agujeros. Ocupa la esquina como si fuera suya.'] }] },
        { slot: 'salon-lectura', props: [{ kind: 'plant', tx: 15, ty: 10 }], inspects: [{ tx: 15, ty: 11, name: 'Monstera', lines: ['Junto al rincón de lectura: leer con una hoja enorme haciendo sombra.'] }] },
      ],
      estudio: [
        { slot: 'esquina-salon', props: [{ kind: 'plant', tx: 12, ty: 9 }], inspects: [{ tx: 11, ty: 9, name: 'Monstera', lines: ['La esquina del estudio ya tiene a alguien. Verde.'] }] },
        { slot: 'pared-dormitorio', props: [{ kind: 'plant', tx: 8, ty: 2 }], inspects: [{ tx: 8, ty: 3, name: 'Monstera', lines: ['Al lado de la cama. Lo primero que ves al despertar es una hoja.'] }] },
      ],
      ronda8: [
        { slot: 'esquina-salon', props: [{ kind: 'plant', tx: 16, ty: 9 }], inspects: [{ tx: 15, ty: 9, name: 'Monstera', lines: ['En la esquina del salón grande, junto al comedor. Hasta parece pequeña.'] }] },
        { slot: 'despacho', props: [{ kind: 'plant', tx: 16, ty: 2 }], inspects: [{ tx: 16, ty: 3, name: 'Monstera', lines: ['En el despacho, junto a la ventana: trabajar con una hoja enorme al lado.'] }] },
      ],
      mayor17: { slot: 'esquina-salon', props: [{ kind: 'plant', tx: 12, ty: 6 }], inspects: [{ tx: 12, ty: 7, name: 'Monstera', lines: ['La salita es pequeña y la monstera, no. Se llevan bien.'] }] },
    },
  },
];

export const getHome = (id: string): HomeDef => {
  const h = HOMES.find((x) => x.id === id);
  if (!h) throw new Error(`Vivienda desconocida: ${id}`);
  return h;
};

export const getUpgrade = (id: string): UpgradeDef => {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) throw new Error(`Mejora desconocida: ${id}`);
  return u;
};
