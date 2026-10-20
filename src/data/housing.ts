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
  /** Plan de visita (data/saraStory.ts, data/adaStory.ts) que se fija al recibir a alguien aquí. */
  visitPlan: string;
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
    text: 'Un estudio compacto: todo en una sola habitación, con el baño aparte. Pequeño, luminoso y €10 más barato a la semana.',
    move: { fee: 150, free: 250 },
  },
];

export interface Slot {
  tx: number;
  ty: number;
  w: number;
  h: number;
}

/** Ranuras de cada casa: el único sitio donde puede ir lo que se instala. Libres de las rutas a puerta, cama, cocina, ducha y armario. */
export const SLOTS: Readonly<Record<string, Readonly<Record<string, Slot>>>> = {
  olmo7: {
    'salon-lectura': { tx: 13, ty: 10, w: 3, h: 3 },
    'pared-salon': { tx: 18, ty: 7, w: 3, h: 2 },
    'esquina-salon': { tx: 16, ty: 10, w: 3, h: 3 },
  },
  estudio: {
    'pared-dormitorio': { tx: 7, ty: 1, w: 2, h: 2 },
    'esquina-salon': { tx: 11, ty: 8, w: 2, h: 2 },
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
  /** Por casa; si falta, no cabe y se guarda. */
  placements: Readonly<Record<string, Placement>>;
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
    },
  },
  {
    id: 'lampara-pie',
    name: 'Lámpara de pie',
    kind: 'expresiva',
    price: 45,
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
