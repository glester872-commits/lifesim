export const TILE = 16;

export const CAMERA_ZOOM = 3;
export const MAX_CAMERA_ZOOM = 5;
export const CAMERA_LERP = 0.14;

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
 */
export const PALETTE = {
  ink: '#0e0f16',
  night: '#171a24',

  asphalt: '#262a36',
  asphaltLit: '#2e3342',
  roadLine: '#7f8471',

  pavement: '#414757',
  pavementLit: '#4b5265',
  pavementSeam: '#373c4a',

  cobble: '#5b4f48',
  water: '#22394a',
  waterLit: '#3d6478',
  ballast: '#2a2c33',
  sleeper: '#3d3a38',

  plaza: '#4c4856',
  plazaLit: '#565162',

  grass: '#2f4a39',
  grassLit: '#3a5a44',
  grassDark: '#273d30',

  roofA: '#2f2a3a',
  roofALit: '#3a3446',
  roofB: '#3a3140',
  roofBLit: '#463b4d',

  wall: '#443c4d',
  wallLit: '#51475b',
  wallDark: '#332d3b',

  stone: '#565b6b',
  stoneLit: '#636979',
  brick: '#6a4740',
  brickLit: '#7a544c',

  glass: '#26424e',
  glassLit: '#6fd0c6',
  amber: '#f0b46a',
  amberDim: '#a8743e',

  wood: '#5d4733',
  woodLit: '#6d5540',
  woodDark: '#473527',

  rug: '#79454f',
  rugLit: '#8b525d',

  tile: '#525a67',
  tileLit: '#5e6774',

  leaf: '#38644a',
  leafLit: '#487a59',
  trunk: '#453427',

  metal: '#555c6d',
  metalLit: '#68707f',

  skin: '#d3a17c',
  skinDark: '#b0815f',
  hair: '#2a2430',
  white: '#e8e3da',
} as const;
