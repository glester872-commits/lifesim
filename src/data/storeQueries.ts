import { DECATHLON_LAYOUT } from './decathlonLayout.ts';

/**
 * DEC-01 · Lo que se le puede preguntar a quien atiende en la sala de Decathlon, en dos niveles: categoría → pregunta.
 * Aquí sólo hay qué se pregunta y cómo suena la respuesta; los datos (dónde, qué caja abre, qué se vende, quién está)
 * los pone systems/StoreKnowledge.ts desde el plano, los turnos y el género. Nada de tallas, cantidades ni bicis a la
 * venta: no existen, así que no se preguntan.
 */
export type StoreQueryKind = 'department' | 'stock' | 'racks' | 'fitting' | 'tills' | 'adviser';

export interface StoreQuery {
  id: string;
  label: string;
  kind: StoreQueryKind;
  /** Departamento (DECATHLON_LAYOUT) o etiqueta del colaborador de sección (DECATHLON_PROFILE). */
  ref?: string;
}

export interface StoreCategory {
  id: string;
  label: string;
  queries: readonly StoreQuery[];
}

/** Las secciones con colaborador propio (data/decathlon.ts `floor`), para «¿Quién me asesora?». */
const ADVISED = ['Sección de montaña', 'Sección de running', 'Sección de ciclismo', 'Sección de fitness'] as const;

export const STORE_CATEGORIES: readonly StoreCategory[] = [
  {
    id: 'donde', label: '¿Dónde está…?',
    queries: DECATHLON_LAYOUT.departments.map((d): StoreQuery => ({ id: `donde-${d.id}`, label: d.name, kind: 'department', ref: d.id })),
  },
  {
    id: 'ropa', label: 'Ropa y precios',
    queries: [
      { id: 'ropa-stock', label: '¿Qué ropa tenéis y a cuánto?', kind: 'stock' },
      { id: 'ropa-donde', label: '¿Dónde está la ropa?', kind: 'racks' },
    ],
  },
  {
    id: 'probadores-cajas', label: 'Probadores y cajas',
    queries: [
      { id: 'probadores', label: '¿Dónde están los probadores?', kind: 'fitting' },
      { id: 'cajas', label: '¿Qué cajas están abiertas?', kind: 'tills' },
    ],
  },
  {
    id: 'asesor', label: '¿Quién me asesora?',
    queries: ADVISED.map((label): StoreQuery => ({ id: `asesor-${label}`, label: label.replace('Sección de ', '').replace(/^./, (c) => c.toUpperCase()), kind: 'adviser', ref: label })),
  },
];

/**
 * Tres maneras de decir cada respuesta (systems/StoreKnowledge elige una por colaborador, pregunta y día, sin repetir
 * la última que dijo; la primera letra va siempre en mayúscula). Huecos: {secciones} {donde} {cerca} {resto} {lista}
 * {cajas} {quien} y {ir}, que es una frase entera («Desde aquí, …» o «Aquí mismo, donde estamos.»).
 */
export const STORE_REPLIES = {
  department: [
    'Te cuento: lo más cerca es {cerca}. {ir}{resto}',
    'Lo que te pilla más a mano es {cerca}. {ir}{resto}',
    'Mira, lo más cerca es {cerca}. {ir}{resto}',
  ],
  stock: [
    'De ropa tenemos {lista}. Lo que ves colgado es lo que hay.',
    'Ahora mismo hay {lista}. Si no está en el perchero, no lo tenemos.',
    'Te cuento: {lista}. Está todo en los percheros de Running y Sportswear.',
  ],
  racks: [
    '{lista}. {ir}',
    'Los percheros: {lista}. {ir}',
    'La ropa, por percheros: {lista}. {ir}',
  ],
  fitting: [
    'Los probadores están {donde}. {ir}',
    'Para probarte, los probadores: {donde}. {ir}',
    'Tienes los probadores {donde}. {ir}',
  ],
  tills: [
    'Ahora mismo se cobra en {cajas}, en la línea de cajas junto a la salida. {ir}',
    'Ahora cobran en {cajas}; las cajas están junto a la puerta. {ir}',
    'Puedes pagar en {cajas}, hacia la salida. {ir}',
  ],
  'tills-none': [
    'Ahora mismo no hay ninguna caja con cajero abierta. Pregunta en información, junto a la puerta.',
    'Ahora no está cobrando nadie en caja. En información, al lado de la puerta, te dicen.',
    'Ahora no hay caja abierta con nadie. Acércate a información, junto a la entrada.',
  ],
  'adviser-me': [
    'Esa es la mía. Pregúntame lo que quieras, que para eso estoy.',
    'Pues has dado con la persona: llevo yo esa sección.',
    'Eso lo llevo yo. Cuéntame qué buscas.',
  ],
  'adviser-mate': [
    'De eso sabe más quien lleva {quien}. Hoy está; suele andar por ahí: {secciones}.',
    'Para eso, mejor quien lleva {quien}, que hoy trabaja. Búscalo por su zona: {secciones}.',
    'Busca a quien está hoy en {quien}. Lo encuentras por aquí: {secciones}.',
  ],
  'adviser-none': [
    'Hoy no hay nadie en {quien}; te lo indico yo: {secciones}. {ir}',
    'En {quien} hoy no hay nadie, pero te oriento: {secciones}. {ir}',
    'Hoy {quien} va sin nadie. Te digo yo: {secciones}. {ir}',
  ],
} as const satisfies Record<string, readonly [string, string, string]>;

export type ReplyKey = keyof typeof STORE_REPLIES;
