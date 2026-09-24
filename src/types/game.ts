export type Facing = 'up' | 'down' | 'left' | 'right';

export const FACINGS: readonly Facing[] = ['down', 'up', 'left', 'right'];

export interface Vec2 {
  x: number;
  y: number;
}

/** Posición inicial dentro de una localización, en coordenadas de tile. */
export interface SpawnDef {
  tx: number;
  ty: number;
  facing: Facing;
}

/** Puerta, escalera o cualquier paso entre localizaciones. */
export interface PortalDef {
  id: string;
  tx: number;
  ty: number;
  label: string;
  to: { location: string; spawn: string };
  /** Billete en euros. Sin fare el paso es gratuito. */
  fare?: number;
  /** Minutos de reloj que consume el trayecto. */
  minutes?: number;
  /**
   * Subir al tren. Sólo es usable con las puertas abiertas y se ofrece en cada
   * puerta del tren: la x sale del tren; ty marca la fila del borde del andén.
   */
  train?: boolean;
}

export type PropKind =
  | 'tree'
  | 'bush'
  | 'bench'
  | 'lamp'
  | 'sign'
  | 'planter'
  | 'bed'
  | 'desk'
  | 'shelf'
  | 'plant'
  | 'table'
  | 'counter'
  | 'stall'
  | 'metro-sign'
  | 'poster'
  | 'line-map'
  | 'parasol'
  | 'cafe-table'
  | 'turnstile'
  // calle
  | 'fountain'
  | 'kiosk'
  | 'bus-stop'
  | 'car'
  | 'car-b'
  | 'car-c'
  | 'van'
  | 'bike'
  | 'bin'
  | 'vending'
  | 'produce'
  | 'menu-board'
  | 'hoop'
  // interiores
  | 'wardrobe'
  | 'sofa'
  | 'treadmill'
  | 'weights'
  | 'weight-bench'
  | 'lockers'
  | 'mirror'
  | 'clothes-rack'
  | 'mannequin'
  | 'fitting-room'
  | 'register'
  | 'fridge'
  | 'gondola'
  | 'cooler'
  | 'meeting-table';

export interface PropPlacement {
  kind: PropKind;
  tx: number;
  ty: number;
}

export interface NpcPlacement {
  id: string;
  tx: number;
  ty: number;
  facing: Facing;
}

export interface TilePoint {
  tx: number;
  ty: number;
}

/** Puesto de un vigilante: dónde descansa y qué ronda hace. */
export interface GuardPost {
  id: string;
  post: TilePoint;
  facing: Facing;
  patrol: readonly TilePoint[];
}

/**
 * Estación viva. Coordenadas en tiles. Los NPC caminan en línea recta entre
 * estos puntos (sin pathfinding), así que el trazado debe quedar libre.
 */
export interface MetroDef {
  /** Fila superior de la vía; el tren ocupa tres filas desde aquí. */
  trackRow: number;
  /** Fila del borde del andén, donde se abren las puertas. */
  edgeRow: number;
  /** Fila de paso a lo largo del andén. */
  walkRow: number;
  /** Por donde entran y salen los pasajeros. */
  entrance: TilePoint;
  /** Huecos entre torniquetes. */
  gates: readonly TilePoint[];
  waitingSpots: readonly TilePoint[];
  /** Tiles de banco: el NPC se sienta detrás del respaldo. */
  seats: readonly TilePoint[];
  /** Dónde plantarse a mirar un cartel, y hacia dónde mirar. */
  signSpots: readonly (TilePoint & { facing: Facing })[];
  /** Puestos por orden de preferencia; el día decide cuántos se cubren. */
  guards: readonly GuardPost[];
}

/** Aspecto de un edificio. Cada estilo tiene su fachada, su tejado y su rótulo en BuildingArt. */
export type BuildingStyle =
  | 'home'
  | 'res-brick'
  | 'res-stone'
  | 'res-plaster'
  | 'metro'
  | 'gym'
  | 'cafe'
  | 'fashion'
  | 'super'
  | 'restaurant'
  | 'office'
  | 'study'
  | 'pharmacy'
  | 'hair'
  | 'bank'
  | 'to-let'
  | 'fruit'
  | 'hardware'
  | 'laundry'
  | 'civic'
  | 'works'
  | 'backdrop';

/**
 * Edificio de una localización exterior. Tapa el terreno de su huella y es
 * sólido salvo la puerta. Si lleva `enter`, LocationSystem genera el portal y
 * el spawn de enfrente con el id del edificio: salir de un interior siempre
 * deja delante de su puerta, porque los dos salen del mismo dato.
 */
export interface BuildingDef {
  id: string;
  name: string;
  style: BuildingStyle;
  tx: number;
  ty: number;
  w: number;
  h: number;
  /** Cara con fachada. Sin ella, es un fondo de tejados sin puerta. */
  front?: 'n' | 's';
  /** Columna de la puerta, en la fila de fachada que toca la calle. */
  doorX?: number;
  /** Plantas visibles en fachada (sólo frentes al sur). Por defecto una. */
  floors?: 1 | 2;
  /** Interior al que lleva la puerta. Sin él, la puerta es decorado y no se ofrece. */
  enter?: { location: string; spawn: string };
  /** Id del punto semántico generado delante de la puerta (p. ej. CAFE_ENTRANCE). */
  point?: string;
  /** Sin interior: lo que se lee al pulsar E en su puerta. */
  inspect?: readonly string[];
}

/** Algo que se puede mirar con E: un cartel, una fuente, un escaparate. */
export interface InspectDef {
  tx: number;
  ty: number;
  name: string;
  lines: readonly string[];
}

/** Carriles con tráfico ambiental: coches que cruzan el mapa y ceden a los peatones. */
export interface TrafficDef {
  lanes: readonly { row: number; dir: 1 | -1 }[];
  carsPerLane: number;
}

/**
 * Para qué sirve un punto. Los NPC futuros reciben destinos por id o por tipo,
 * nunca coordenadas escritas en cada personaje.
 */
export type PointKind =
  | 'entrance' // delante de una puerta, en la calle
  | 'exit' // dentro, junto a la puerta
  | 'edge' // borde del mapa: el resto de la ciudad
  | 'wait' // parada, banco del metro
  | 'seat' // mesa, banco, sofá
  | 'meet' // sitio de encuentro
  | 'interact' // mostrador, armario, cama, máquina
  | 'work' // puesto de un empleado
  | 'path'; // nodo de paso del grafo de peatones

export interface PointDef {
  tx: number;
  ty: number;
  kind: PointKind;
  facing?: Facing;
}

export interface LocationDef {
  id: string;
  name: string;
  kind: 'exterior' | 'interior';
  /** Rejilla densa de terreno. Cada carácter es una clave de TILES. */
  ground: readonly string[];
  props: readonly PropPlacement[];
  portals: readonly PortalDef[];
  npcs: readonly NpcPlacement[];
  spawns: Readonly<Record<string, SpawnDef>>;
  metro?: MetroDef;
  buildings?: readonly BuildingDef[];
  /** Puntos con nombre, únicos en todo el mundo. */
  points?: Readonly<Record<string, PointDef>>;
  /** Grafo de peatones: tramos rectos y libres entre dos puntos. */
  links?: readonly (readonly [string, string])[];
  inspects?: readonly InspectDef[];
  traffic?: TrafficDef;
}

/** Colores de ropa y pelo; alimentan el generador de texturas. */
export interface NpcLook {
  id: string;
  cloth: string;
  clothDark: string;
  hair: string;
}

export interface NpcDef extends NpcLook {
  name: string;
  lines: readonly string[];
}

export interface GameStateData {
  money: number;
  energy: number;
  day: number;
  hour: number;
  minute: number;
  locationId: string;
  position: Vec2;
  facing: Facing;
  events: EventMemory;
}

export interface SaveFile {
  version: number;
  savedAt: number;
  state: GameStateData;
}

/**
 * Memoria narrativa del metro. Tiempos en minutos absolutos de juego
 * ((día-1)·1440 + hora·60 + minuto). Se guarda con la partida.
 */
export interface EventMemory {
  /** Viajes en tren hechos; mide el cooldown global en viajes. */
  rides: number;
  /** evento -> días en que ocurrió. */
  eventsSeen: Record<string, number[]>;
  choicesMade: { day: number; event: string; choice: string }[];
  importantNPCsMet: Record<string, { name: string; firstDay: number; lastDay: number; encounters: number; affinity: number }>;
  /** flag -> día en que se marcó. */
  eventFlags: Record<string, number>;
  /** evento -> minuto a partir del cual puede repetirse. */
  eventCooldowns: Record<string, number>;
  /** Continuaciones pendientes: sólo pueden salir dentro de su ventana. */
  scheduled: { event: string; from: number; until: number }[];
  lastEventRide: number;
  lastNarrativeAt: number;
}
