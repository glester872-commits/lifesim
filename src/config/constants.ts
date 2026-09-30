export const TILE = 16;

/**
 * Zoom en píxeles físicos (el lienzo va a la resolución del dispositivo, ver
 * main.ts): 2 es el mínimo para que un píxel del juego se lea como píxel.
 */
export const CAMERA_ZOOM = 2;
/**
 * Mundo que se ve como poco, en px: unos 20 × 17 tiles. Algo más cerca que el
 * primer encuadre (21 × 18): la gente tiene presencia y la boca de metro manda
 * en la escena, sin perder la calle de alrededor. El zoom sale del eje que más
 * aprieta (en vertical manda el ancho) y va a medios pasos (3, 3,5, 4…): a
 * 3,5 un píxel de arte ocupa 3 o 4 de pantalla, alternos (prueba en curso).
 */
export const VIEW_WIDTH = 315;
export const VIEW_HEIGHT = 270;
export const MAX_CAMERA_ZOOM = 12;
export const CAMERA_LERP = 0.14;
/**
 * Cuánto por encima del jugador mira la cámara (px de mundo). Las fachadas al
 * sur suben dos tiles por planta desde la acera: con el jugador algo por debajo
 * del centro se ve la calle y la fachada de enfrente entera. El zoom sigue
 * siendo entero (WorldScene.fitCamera): bajarlo "un poco" no existe sin
 * deformar los píxeles.
 */
export const CAMERA_LOOK_UP = 22;

export const PLAYER_SPEED = 76;
export const PLAYER_BODY = { width: 10, height: 8 };

/** Ritmo del reloj. 2 => una hora de juego cada 30 segundos reales. */
export const GAME_MINUTES_PER_REAL_SECOND = 2;

/** Techo de delta por frame: volver de otra pestaña no debe saltarse horas. */
export const MAX_FRAME_MS = 100;

export const INTERACT_RADIUS = 26;

/** Billete de metro en euros y duracion del trayecto en minutos de juego. */
export const METRO_FARE = 2;
export const METRO_MINUTES = 15;

export const SAVE_KEY = 'lifesim.save';
export const SAVE_VERSION = 1;
export const AUTOSAVE_INTERVAL_MS = 10_000;

export const TRANSITION_MS = 180;

export const INITIAL_MONEY = 1200;
export const INITIAL_ENERGY = 100;
export const INITIAL_CLOCK = { day: 1, hour: 8, minute: 30 };

/**
 * Paleta única del proyecto. Todo el arte procedural sale de aquí, así que
 * cambiar la dirección cromática del juego es cambiar este objeto.
 *
 * Es la paleta de día: Madrid a media mañana, granito, revoco ocre, ladrillo
 * visto y teja. La noche no está en estos colores: la pone world/Lighting.ts
 * encima, según la hora.
 */
export const PALETTE = {
  ink: '#0e0f16',
  night: '#171a24',
  /** Contorno de personajes: casi negro y algo cálido, para que no parezcan recortados. */
  outline: '#1c1620',

  asphalt: '#3b3e47',
  asphaltLit: '#464a54',
  roadLine: '#d6d0bf',
  /** Carril bici: asfalto teñido de rojo teja, como el de Madrid. */
  bikeLane: '#7d4638',

  pavement: '#a39c90',
  pavementLit: '#b2ab9f',
  pavementSeam: '#8a8378',
  /** Bordillo de granito. */
  kerb: '#c4bdb0',

  cobble: '#8c7a69',
  water: '#2e5668',
  waterLit: '#5b8fa2',
  ballast: '#4b4a4e',
  sleeper: '#5c4b3d',

  plaza: '#b3a791',
  plazaLit: '#c0b59f',

  grass: '#5c7c3e',
  grassLit: '#6e8f4a',
  grassDark: '#4a6732',

  roofA: '#9b5a44',
  roofALit: '#ad6b52',
  roofB: '#737078',
  roofBLit: '#827f87',

  wall: '#c9ad85',
  wallLit: '#d8c09b',
  wallDark: '#a98f6b',
  /** Muros interiores vistos desde arriba: la cabeza oscura separa estancias; la cara, clara. */
  wallTop: '#4a4350',
  wallFace: '#d9d3c7',

  stone: '#a8a194',
  stoneLit: '#b9b2a5',
  brick: '#a45640',
  brickLit: '#b5654d',

  glass: '#3d5f6b',
  glassLit: '#8fd6cd',
  amber: '#f0b46a',
  amberDim: '#b88046',

  wood: '#7b5a3d',
  woodLit: '#8e6b4b',
  woodDark: '#5d432e',

  rug: '#8e4a50',
  rugLit: '#a15a60',

  tile: '#a2a6ab',
  tileLit: '#b1b5ba',

  leaf: '#4f7d3a',
  leafLit: '#6a9a4a',
  trunk: '#5b4332',

  metal: '#5e6571',
  metalLit: '#7b838f',
  /** Hierro de farolas y bolardos madrileños: verde casi negro. */
  iron: '#2b3530',

  skin: '#d3a17c',
  skinDark: '#b0815f',
  hair: '#2a2430',
  white: '#efe9df',
} as const;
