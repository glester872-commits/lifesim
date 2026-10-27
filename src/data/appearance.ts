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
  /** Colores del creador de personaje (Alpha-04): id de SKIN_TONES, HAIR_COLORS y EYE_COLORS. Sin ellos, los de fábrica. */
  skin?: string;
  hairColor?: string;
  eyes?: string;
}

export type AppearanceSlot = keyof Appearance;

/** Una muestra de color con id estable: lo que se guarda es el id, nunca el hex (se puede retocar el tono sin migrar). */
export interface Swatch {
  id: string;
  name: string;
  color: string;
}

/** Tonos de piel, de claro a oscuro; 'piel-4' es la de fábrica (PALETTE.skin). */
export const SKIN_TONES: readonly Swatch[] = [
  { id: 'piel-1', name: 'Muy clara', color: '#f3d4b8' },
  { id: 'piel-2', name: 'Clara', color: '#f0caa8' },
  { id: 'piel-3', name: 'Clara cálida', color: '#e3b692' },
  { id: 'piel-4', name: 'Media', color: '#d3a17c' },
  { id: 'piel-5', name: 'Morena', color: '#b98462' },
  { id: 'piel-6', name: 'Morena oscura', color: '#96654a' },
  { id: 'piel-7', name: 'Oscura', color: '#7a4f38' },
  { id: 'piel-8', name: 'Muy oscura', color: '#5e3c2b' },
];

/** Colores de pelo curados: naturales y dos de tinte. 'negro' es el de fábrica (PALETTE.hair). */
export const HAIR_COLORS: readonly Swatch[] = [
  { id: 'negro', name: 'Negro', color: '#2a2430' },
  { id: 'castano-oscuro', name: 'Castaño oscuro', color: '#4a3226' },
  { id: 'castano', name: 'Castaño', color: '#7a5034' },
  { id: 'rubio-oscuro', name: 'Rubio oscuro', color: '#a8814a' },
  { id: 'rubio', name: 'Rubio', color: '#d8b86e' },
  { id: 'pelirrojo', name: 'Pelirrojo', color: '#b4532c' },
  { id: 'canoso', name: 'Canoso', color: '#b2aea8' },
  { id: 'azul', name: 'Tinte azul', color: '#3f5f9e' },
  { id: 'rosa', name: 'Tinte rosa', color: '#cf7898' },
];

/**
 * Color de ojos. A 16 × 24 un ojo es una columna de dos píxeles: el de arriba sigue siendo el contorno (la
 * mirada se lee igual) y el de abajo lleva el iris. No hay estilos de ojo: a esa resolución no se distinguirían.
 * 'oscuro' es el de fábrica: los dos píxeles del contorno.
 */
export const EYE_COLORS: readonly Swatch[] = [
  { id: 'oscuro', name: 'Oscuros', color: '#1c1620' },
  { id: 'marron', name: 'Marrones', color: '#6a4127' },
  { id: 'avellana', name: 'Avellana', color: '#8f6c2e' },
  { id: 'verde', name: 'Verdes', color: '#4f8a4f' },
  { id: 'azul', name: 'Azules', color: '#4f7fbf' },
  { id: 'gris', name: 'Grises', color: '#8e959e' },
];

const swatchIds = (list: readonly Swatch[]): ReadonlySet<string> => new Set(list.map((s) => s.id));
export const SKIN_IDS = swatchIds(SKIN_TONES);
export const HAIR_COLOR_IDS = swatchIds(HAIR_COLORS);
export const EYE_IDS = swatchIds(EYE_COLORS);

/** El hex de un id de muestra, o undefined si no existe (una partida tocada a mano). */
export const swatchColor = (list: readonly Swatch[], id: string | undefined): string | undefined => list.find((s) => s.id === id)?.color;

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
  // Sin precio: no se hacen en la barbería, pero se pueden elegir al crear el personaje (world/HumanArt ya los dibuja).
  { id: 'afro', name: 'Afro', line: 'Esto no se corta: se cuida.' },
  { id: 'braids', name: 'Trenzas', line: 'Esto no se hace aquí: lleva una tarde entera.' },
  { id: 'locs', name: 'Rastas', line: 'Esto no se hace aquí: lleva meses.' },
  { id: 'ponytail', name: 'Coleta', line: 'Esto no se corta: se recoge.' },
  { id: 'bald', name: 'Sin pelo', line: 'Aquí no hay nada que cortar.' },
];

export const HAIR_IDS: ReadonlySet<string> = new Set(HAIRSTYLES.map((h) => h.id));

export function getHair(id: HairStyle): HairDef {
  const h = HAIRSTYLES.find((d) => d.id === id);
  if (!h) throw new Error(`Peinado desconocido: ${id}`);
  return h;
}
