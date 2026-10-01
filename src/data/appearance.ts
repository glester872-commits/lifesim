/**
 * Aspecto de las personas: lo que se puede cambiar de alguien sin cambiar
 * quién es. Cada persona tiene un aspecto de fábrica (su NpcLook, o el del
 * jugador) y, si persiste, unos cambios encima guardados en la partida
 * (GameStateData.appearance). systems/Appearance.ts los junta para pintarla.
 *
 * Hoy se cambian el peinado (la barbería), la ropa de arriba y de abajo (las
 * tiendas: data/retail.ts) y se añaden tatuajes (el estudio: data/tattoos.ts).
 * Cada hueco tiene su catálogo en data/ y su dibujo en world/HumanArt.ts;
 * quien lo cambia es un servicio más (data/services.ts).
 */

/** Peinados que sabe dibujar world/HumanArt.ts. */
// afro, trenzas, rastas, coleta y calvo: los lleva la gente de la calle; la barbería sigue ofreciendo los de HAIRSTYLES.
export type HairStyle = 'short' | 'bob' | 'curly' | 'bun' | 'buzz' | 'long' | 'afro' | 'braids' | 'locs' | 'ponytail' | 'bald';

/** Un tatuaje hecho: dónde y cuál. */
export interface TattooMark {
  zone: import('./tattoos.ts').TattooZone;
  design: string;
}

/** Lo cambiado sobre el aspecto de fábrica. Lo que no está, sigue como era. */
export interface Appearance {
  hair?: HairStyle;
  /** Prendas puestas (id de data/retail.ts); sin ellas, la ropa de fábrica. */
  top?: string;
  bottom?: string;
  shoes?: string;
  tattoos?: readonly TattooMark[];
}

export type AppearanceSlot = keyof Appearance;

/** Huecos que existen hoy: lo que valida una partida guardada y lo que ofrece un servicio de aspecto. */
export const APPEARANCE_SLOTS: readonly AppearanceSlot[] = ['hair', 'top', 'bottom', 'shoes', 'tattoos'];

export interface HairDef {
  id: HairStyle;
  name: string;
  /** Lo que cuesta en la barbería; sin precio, no se hace allí (una melena no se corta: se deja crecer). */
  price?: number;
  /** Lo que dice quien corta al acabar. */
  line: string;
}

export const HAIRSTYLES: readonly HairDef[] = [
  { id: 'short', name: 'Corte clásico', price: 14, line: 'Corto por los lados, un poco de volumen arriba. De siempre.' },
  { id: 'buzz', name: 'Rapado', price: 10, line: 'Máquina al dos. Cómodo, fresco y sin peine.' },
  { id: 'bob', name: 'Media melena', price: 18, line: 'A la altura de la mandíbula, recto. Queda limpio.' },
  { id: 'curly', name: 'Rizos marcados', price: 22, line: 'Cortado en seco, rizo a rizo. Ahora se ven.' },
  { id: 'bun', name: 'Recogido', price: 16, line: 'Recogido alto, con dos horquillas. Aguanta la noche.' },
  { id: 'long', name: 'Melena larga', line: 'Esto no se corta: se deja crecer.' },
];

export const HAIR_IDS: ReadonlySet<string> = new Set(HAIRSTYLES.map((h) => h.id));

export function getHair(id: HairStyle): HairDef {
  const h = HAIRSTYLES.find((d) => d.id === id);
  if (!h) throw new Error(`Peinado desconocido: ${id}`);
  return h;
}
