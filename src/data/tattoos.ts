import type { Sleeve } from './retail.ts';

/**
 * Tatuajes: dónde (zona), qué (diseño, con su estilo) y cuándo se ven. Un
 * tatuaje hecho es una marca en el aspecto de quien lo lleva
 * (data/appearance.ts, `tattoos`): zona + diseño. No se borra ni se cambia.
 *
 * Que se vea depende de la ropa: el antebrazo, con manga larga, no; el cuello y
 * la mano, siempre; pecho, espalda y gemelo, nunca con la ropa que existe hoy
 * (no hay pantalón corto ni se va sin camiseta). systems/Appearance.ts decide
 * qué se ve y world/HumanArt.ts lo pinta.
 */

export type TattooZone = 'forearm-r' | 'forearm-l' | 'neck' | 'hand-r' | 'chest' | 'back' | 'calf';

/** Dónde lo pinta world/HumanArt.ts, si se ve. */
export type InkSpot = 'arm-r' | 'arm-l' | 'neck' | 'hand-r';

export interface ZoneDef {
  id: TattooZone;
  name: string;
  /** Mangas que lo tapan; `always`, lo tapa cualquier ropa. */
  hiddenBy: readonly Sleeve[] | 'always';
  spot?: InkSpot;
}

export const TATTOO_ZONES: readonly ZoneDef[] = [
  { id: 'forearm-r', name: 'Antebrazo derecho', hiddenBy: ['long'], spot: 'arm-r' },
  { id: 'forearm-l', name: 'Antebrazo izquierdo', hiddenBy: ['long'], spot: 'arm-l' },
  { id: 'hand-r', name: 'Mano derecha', hiddenBy: [], spot: 'hand-r' },
  { id: 'neck', name: 'Cuello', hiddenBy: [], spot: 'neck' },
  { id: 'chest', name: 'Pecho', hiddenBy: 'always' },
  { id: 'back', name: 'Espalda', hiddenBy: 'always' },
  { id: 'calf', name: 'Gemelo', hiddenBy: 'always' },
];

export type TattooStyle = 'tradicional' | 'fineline' | 'blackwork' | 'lettering';

export interface TattooDesign {
  id: string;
  name: string;
  style: TattooStyle;
  /** Color de la tinta: a 16 px es todo lo que se ve de él. */
  ink: string;
  price: number;
  minutes: number;
  /** Zonas donde no se hace (un lettering largo no cabe en una mano). */
  not?: readonly TattooZone[];
}

export const TATTOO_DESIGNS: readonly TattooDesign[] = [
  { id: 'golondrina', name: 'Golondrina', style: 'tradicional', ink: '#2f4a8c', price: 90, minutes: 90 },
  { id: 'rosa', name: 'Rosa roja', style: 'tradicional', ink: '#b8423a', price: 110, minutes: 120, not: ['hand-r'] },
  { id: 'rama', name: 'Rama de olivo', style: 'fineline', ink: '#3a4a3a', price: 70, minutes: 60 },
  { id: 'luna', name: 'Luna creciente', style: 'fineline', ink: '#2a2830', price: 50, minutes: 40 },
  { id: 'banda', name: 'Banda negra', style: 'blackwork', ink: '#121016', price: 80, minutes: 75, not: ['neck', 'hand-r'] },
  { id: 'fecha', name: 'Una fecha', style: 'lettering', ink: '#1c1a20', price: 60, minutes: 45, not: ['hand-r'] },
];

export const STYLE_NAMES: Readonly<Record<TattooStyle, string>> = {
  tradicional: 'tradicional', fineline: 'línea fina', blackwork: 'blackwork', lettering: 'letras',
};

const ZONE_BY_ID = new Map(TATTOO_ZONES.map((z) => [z.id, z]));
const DESIGN_BY_ID = new Map(TATTOO_DESIGNS.map((d) => [d.id, d]));

export const ZONE_IDS: ReadonlySet<string> = new Set(ZONE_BY_ID.keys());
export const DESIGN_IDS: ReadonlySet<string> = new Set(DESIGN_BY_ID.keys());

export function getZone(id: TattooZone): ZoneDef {
  const z = ZONE_BY_ID.get(id);
  if (!z) throw new Error(`Zona desconocida: ${id}`);
  return z;
}

export function getDesign(id: string): TattooDesign {
  const d = DESIGN_BY_ID.get(id);
  if (!d) throw new Error(`Diseño desconocido: ${id}`);
  return d;
}
