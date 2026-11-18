import { PALETTE } from '../config/constants.ts';
import { LINES, stationLine } from './transit.ts';

/**
 * MET-03: lo que cambia de un andén a otro (data/locations.ts: platform()). Sólo datos, nada se guarda: tabla fija por
 * id de la localización, igual tras cargar. Igual en toda la red: cenefa y placa (color de línea), tipografía, franja,
 * pilares, tornos y máquina. Varía: tono del azulejo, anuncios, papeleras/carteles extra y rótulo secundario.
 */

export type StationType = 'estandar' | 'amplia' | 'identidad';

/** Tonos del azulejo del muro. `crema` es el de MET-01: su char es el de la línea (`w`/`x`). */
export const WALL_TONES = {
  crema: PALETTE.metroCream,
  blanco: PALETTE.metroTileWhite,
  cielo: PALETTE.metroTileSky,
  menta: PALETTE.metroTileMint,
  rosa: PALETTE.metroTileRose,
  arena: PALETTE.metroTileSand,
  ocre: PALETTE.metroTileOchre,
} as const;
export type WallTone = keyof typeof WALL_TONES;

/**
 * Anuncios ficticios del cartel (world/TextureFactory: `prop-poster-<índice>`). El 0, `clasico`, es el dibujo de
 * siempre y el de todo cartel sin `variant` (world/tiles.ts: PropDef.defaultVariant); los dos últimos, del CD Halcones.
 */
export const POSTER_ADS = ['clasico', 'zapatillas', 'concierto', 'museo', 'refresco', 'ciudad', 'club', 'club-escudo'] as const;
export type PosterAd = (typeof POSTER_ADS)[number];
export const posterVariant = (ad: PosterAd): number => POSTER_ADS.indexOf(ad);

/** Rótulo secundario, colgado sobre la placa. `line`: la línea a la que lleva (su color); sin ella, neutro. */
export interface SubSign {
  text: string;
  line?: string;
}

export interface ExtraProp {
  kind: 'bin' | 'planter' | 'poster';
  tx: number;
  ty: number;
  ad?: PosterAd;
}

export interface StationStyle {
  stationId: string;
  type: StationType;
  tile: WallTone;
  /** Los tres carteles de siempre: muro izquierdo (6,1), muro derecho (13,1), vestíbulo (15,12). */
  posters: readonly [PosterAd, PosterAd, PosterAd];
  extraProps: readonly ExtraProp[];
  subSign?: SubSign;
}

/**
 * Tiles donde puede ir un prop extra, comprobados contra el trazado de platform() (scripts/check-station-variety.ts):
 * - muro (1,1) y (20,1): cara libre entre el borde y cada plano de línea; un cartel de 2 de alto no pisa nada.
 * - andén (3,9) y (18,9): huecos entre el poste de señal y el banco, contra el muro de abajo; nadie pasa por ahí, no
 *   es puerta del tren (cols 3 y 18 abren en la fila 5, a cuatro filas) ni espera, asiento o punto de señal.
 * Descartados: (1,8)/(20,8) y (2,8)/(19,8) los tapa el dibujo del pilar o del poste (3 y 2 de alto); (6,11) el del
 * poste del vestíbulo; (15,11) es el lado de la máquina. Fuera siempre: filas 5-6 (borde y puertas), tornos, salida,
 * máquina, asientos, esperas y rondas.
 */
export const SAFE_EXTRA_TILES = {
  wall: [{ tx: 1, ty: 1 }, { tx: 20, ty: 1 }],
  floor: [{ tx: 3, ty: 9 }, { tx: 18, ty: 9 }],
} as const;

const HUB_SIGN = (line: string): SubSign => ({ text: 'CORRESPONDENCIA', line });

export const STATION_STYLES: readonly StationStyle[] = [
  // Estándar: cambia el tono y la combinación de anuncios.
  { stationId: 'vallesco-station', type: 'estandar', tile: 'crema', posters: ['zapatillas', 'concierto', 'ciudad'], extraProps: [] },
  { stationId: 'ribera-station', type: 'estandar', tile: 'cielo', posters: ['museo', 'refresco', 'zapatillas'], extraProps: [] },
  { stationId: 'cuatro-rios-station', type: 'estandar', tile: 'menta', posters: ['concierto', 'ciudad', 'refresco'], extraProps: [{ kind: 'planter', tx: 18, ty: 9 }] },
  { stationId: 'velaria-station', type: 'estandar', tile: 'rosa', posters: ['museo', 'zapatillas', 'concierto'], extraProps: [] },
  { stationId: 'campo-alto-station', type: 'estandar', tile: 'arena', posters: ['refresco', 'museo', 'ciudad'], extraProps: [{ kind: 'bin', tx: 3, ty: 9 }] },
  { stationId: 'luna-station', type: 'estandar', tile: 'blanco', posters: ['ciudad', 'concierto', 'museo'], extraProps: [] },
  // Amplias: correspondencia, más carteles y papeleras.
  {
    stationId: 'puerta-central-station', type: 'amplia', tile: 'blanco', posters: ['ciudad', 'zapatillas', 'museo'], subSign: HUB_SIGN('L3'),
    extraProps: [{ kind: 'poster', tx: 1, ty: 1, ad: 'concierto' }, { kind: 'poster', tx: 20, ty: 1, ad: 'refresco' }, { kind: 'bin', tx: 3, ty: 9 }, { kind: 'bin', tx: 18, ty: 9 }],
  },
  {
    stationId: 'puerta-central-l3-station', type: 'amplia', tile: 'blanco', posters: ['refresco', 'museo', 'concierto'], subSign: HUB_SIGN('L2'),
    extraProps: [{ kind: 'poster', tx: 1, ty: 1, ad: 'ciudad' }, { kind: 'poster', tx: 20, ty: 1, ad: 'zapatillas' }, { kind: 'bin', tx: 3, ty: 9 }, { kind: 'bin', tx: 18, ty: 9 }],
  },
  {
    stationId: 'decathlon-station', type: 'amplia', tile: 'cielo', posters: ['zapatillas', 'refresco', 'concierto'], subSign: HUB_SIGN('L3'),
    extraProps: [{ kind: 'poster', tx: 1, ty: 1, ad: 'zapatillas' }, { kind: 'poster', tx: 20, ty: 1, ad: 'ciudad' }, { kind: 'bin', tx: 18, ty: 9 }],
  },
  {
    stationId: 'decathlon-l3-station', type: 'amplia', tile: 'cielo', posters: ['concierto', 'zapatillas', 'museo'], subSign: HUB_SIGN('L2'),
    extraProps: [{ kind: 'poster', tx: 1, ty: 1, ad: 'refresco' }, { kind: 'poster', tx: 20, ty: 1, ad: 'zapatillas' }, { kind: 'bin', tx: 3, ty: 9 }],
  },
  // Identidad: el estadio del Halcón y el barrio histórico.
  {
    stationId: 'arena-station', type: 'identidad', tile: 'blanco', posters: ['club', 'club-escudo', 'club'], subSign: { text: 'ESTADIO' },
    extraProps: [{ kind: 'poster', tx: 1, ty: 1, ad: 'club-escudo' }, { kind: 'poster', tx: 20, ty: 1, ad: 'club' }, { kind: 'bin', tx: 3, ty: 9 }, { kind: 'bin', tx: 18, ty: 9 }],
  },
  {
    stationId: 'casco-antiguo-station', type: 'identidad', tile: 'ocre', posters: ['museo', 'ciudad', 'museo'], subSign: { text: 'CASCO HISTÓRICO' },
    extraProps: [{ kind: 'planter', tx: 3, ty: 9 }, { kind: 'planter', tx: 18, ty: 9 }],
  },
];

/** Estilo del andén `stationId`. Sin fila en la tabla, error al cargar: ningún andén queda sin decidir. */
export function stationStyle(stationId: string): StationStyle {
  const s = STATION_STYLES.find((x) => x.stationId === stationId);
  if (!s) throw new Error(`${stationId}: andén sin estilo en STATION_STYLES`);
  return s;
}

/** Char de muro por tono y línea: `crema` usa el de la línea; el resto, uno de este grupo, en orden fijo. */
const WALL_POOL = 'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏ';
export interface WallChar {
  char: string;
  tone: WallTone;
  line: string;
}
export const WALL_CHARS: readonly WallChar[] = LINES.flatMap((line) =>
  (Object.keys(WALL_TONES) as WallTone[]).filter((t) => t !== 'crema').map((tone) => ({ tone, line: line.id, char: '' })),
).map((c, i) => ({ ...c, char: WALL_POOL.charAt(i) }));

/** Char del muro del andén: su línea (cenefa) y su tono (azulejo). */
export function stationWall(stationId: string): string {
  const line = stationLine(stationId);
  const tone = stationStyle(stationId).tile;
  if (tone === 'crema') return line.wall;
  const c = WALL_CHARS.find((w) => w.tone === tone && w.line === line.id);
  if (!c?.char) throw new Error(`${stationId}: sin char de muro para ${tone}/${line.id}`);
  return c.char;
}

/** Rótulos secundarios distintos (world/TextureFactory: `prop-metro-subsign-<índice>`). */
export const SUB_SIGNS: readonly SubSign[] = [
  ...new Map(STATION_STYLES.flatMap((s) => (s.subSign ? [[`${s.subSign.text}|${s.subSign.line ?? ''}`, s.subSign] as const] : []))).values(),
];
export const subSignVariant = (sign: SubSign): number => SUB_SIGNS.findIndex((s) => s.text === sign.text && s.line === sign.line);
