import type { LocationDef } from '../types/game.ts';

/**
 * Estudio · Olmo 11: la vivienda compacta (data/housing.ts, id `estudio`). Todo en una habitación con el baño
 * aparte. Reutiliza lo que ya sabe hacer el piso (cocinar, ducharse, dormir, ver la tele, cambiarse, el catálogo
 * del hogar) con los mismos puntos de siempre, aquí con prefijo STUDIO_.
 *
 *   baño (1–4 × 2–4)   dormitorio (6–12 × 2–5)   salón y cocina (1–12 × 6–9)
 *
 * La puerta da al spawn `res-olmo-11` de la Calle del Olmo (data/vallesco.ts). Las mejoras entran por las ranuras
 * de data/housing.ts: encima de la cabecera y en la esquina del salón.
 */
export const STUDIO: LocationDef = {
  id: 'studio',
  name: 'Estudio · Olmo 11',
  kind: 'interior',
  home: 'estudio',
  ground: [
    'WWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWW',
    'WttttWfffffffW',
    'WttttWfffffffW',
    'WttttWffrrrrfW',
    'WWtWWWffrrrrfW',
    'WffffffffffffW',
    'WffffffffffffW',
    'WffrrrrffffffW',
    'WffrrrrffffffW',
    'WWWWWWDWWWWWWW',
  ],
  props: [
    // Baño: lavabo con espejo, inodoro y plato de ducha.
    { kind: 'mirror', tx: 1, ty: 1 },
    { kind: 'sink', tx: 1, ty: 2 },
    { kind: 'toilet', tx: 4, ty: 2 },
    { kind: 'shower', tx: 1, ty: 4 },
    // Dormitorio: armario, escritorio con el catálogo, cama y ventana.
    { kind: 'wardrobe', tx: 7, ty: 3 },
    { kind: 'mirror', tx: 9, ty: 1 },
    { kind: 'desk', tx: 10, ty: 2 },
    { kind: 'chair-up', tx: 10, ty: 3 },
    { kind: 'window', tx: 11, ty: 1 },
    { kind: 'bed', tx: 12, ty: 3 },
    { kind: 'plant', tx: 12, ty: 5 },
    // Cocina contra el tabique del baño.
    { kind: 'fridge', tx: 1, ty: 6 },
    { kind: 'sink', tx: 3, ty: 6 },
    { kind: 'stove', tx: 4, ty: 6 },
    // Salón: sofá frente a la tele con la mesa baja en medio.
    { kind: 'sofa', tx: 7, ty: 7 },
    { kind: 'table', tx: 8, ty: 8 },
    { kind: 'tv', tx: 8, ty: 9 },
    { kind: 'pendant', tx: 4, ty: 8 },
    { kind: 'pendant', tx: 9, ty: 4 },
    { kind: 'pendant', tx: 2, ty: 3 },
  ],
  ambient: '#ffe6c8',
  spots: [
    { tx: 4, ty: 6, name: 'Cocina', activities: ['cook'] },
    { tx: 1, ty: 4, name: 'Ducha', activities: ['shower'] },
    { tx: 12, ty: 3, name: 'Cama', activities: ['nap', 'sleep'] },
    { tx: 7, ty: 3, name: 'Armario', activities: [], wardrobe: true },
    { tx: 9, ty: 1, name: 'Espejo', activities: [], wardrobe: true },
    { tx: 8, ty: 9, name: 'Tele', activities: ['watch-tv'] },
    { tx: 10, ty: 4, name: 'Ordenador · catálogo del hogar', activities: [], housing: true },
  ],
  inspects: [
    { tx: 1, ty: 1, name: 'Espejo del baño', lines: ['El mismo espejo, más cerca. En un estudio no hay donde esconderse de uno mismo.'] },
    { tx: 1, ty: 6, name: 'Nevera', lines: ['Una nevera de estudio: cabe la compra de un día y media salsa de soja.'] },
  ],
  portals: [{ id: 'exit', tx: 6, ty: 10, label: 'Salir a la calle', to: { location: 'district', spawn: 'res-olmo-11' } }],
  npcs: [],
  spawns: {
    entry: { tx: 6, ty: 9, facing: 'up' },
  },
  points: {
    STUDIO_EXIT: { tx: 6, ty: 9, kind: 'exit', facing: 'up' },
    STUDIO_BED: { tx: 11, ty: 3, kind: 'interact', facing: 'right' },
    STUDIO_WARDROBE: { tx: 7, ty: 4, kind: 'interact', facing: 'up' },
    STUDIO_MIRROR: { tx: 9, ty: 2, kind: 'interact', facing: 'up' },
    STUDIO_KITCHEN: { tx: 4, ty: 7, kind: 'interact', facing: 'up' },
    STUDIO_FRIDGE: { tx: 1, ty: 7, kind: 'interact', facing: 'up' },
    STUDIO_SINK: { tx: 1, ty: 3, kind: 'interact', facing: 'up' },
    STUDIO_TOILET: { tx: 4, ty: 3, kind: 'interact', facing: 'up' },
    STUDIO_SHOWER: { tx: 2, ty: 4, kind: 'interact', facing: 'left' },
    STUDIO_SOFA: { tx: 7, ty: 7, kind: 'seat', facing: 'down' },
    STUDIO_SOFA_02: { tx: 8, ty: 7, kind: 'seat', facing: 'down' },
    STUDIO_TV: { tx: 10, ty: 9, kind: 'interact', facing: 'left' },
    STUDIO_GUEST: { tx: 10, ty: 8, kind: 'meet' },
  },
};
