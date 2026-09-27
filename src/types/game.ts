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
  /** Minutos de reloj que consume el paso. */
  minutes?: number;
  /**
   * Subir al tren. Sólo es usable con las puertas abiertas y se ofrece en cada
   * puerta del tren: la x sale del tren; ty marca la fila del borde del andén.
   * El destino, el precio y la duración no son del portal: se eligen al subir
   * (data/transit.ts) y se pagan con la tarjeta (systems/Commerce.ts).
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
  | 'meeting-table'
  | 'ticket-machine'
  // Visual V2 (design/ART_BIBLE.md): mobiliario de la plazuela del metro
  | 'plane-tree'
  | 'plaza-bench'
  | 'street-lamp'
  | 'bike-rack'
  | 'planter-box'
  | 'metro-totem'
  | 'info-board'
  // planos: se hornean con el suelo
  | 'manhole'
  | 'drain'
  | 'leaves'
  | 'dj-booth'
  | 'speaker'
  // en la pared (sobre muro, que ya es sólido)
  | 'window'
  | 'painting'
  | 'clock'
  | 'chalkboard'
  | 'neon'
  | 'wall-shelf'
  | 'bottles'
  // sobre el mostrador
  | 'espresso'
  | 'pastry-case'
  // del techo: no pisan el suelo
  | 'pendant'
  | 'floor-lamp'
  | 'display-table'
  // micromobiliario (systems/Dressing.ts)
  | 'container'
  | 'mailbox'
  | 'bollard'
  | 'parking-sign'
  | 'street-sign'
  | 'utility-box'
  | 'scooter'
  | 'ad-panel'
  | 'barrier'
  | 'skip'
  | 'debris'
  | 'tube-light';

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
  | 'club'
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

/** Donde se compra algo con E: máquina expendedora, taquilla, mostrador. */
export interface TerminalDef {
  tx: number;
  ty: number;
  name: string;
  /** Id en data/catalogs.ts. */
  catalog: string;
}

/**
 * Donde se hace algo que lleva un rato: dormir en la cama, cocinar, sentarse a
 * cortarse el pelo. Pulsar E ofrece sus actividades; cada una adelanta el
 * reloj de verdad (systems/Activities.ts). Un sitio nuevo con algo que hacer
 * es un spot más en los datos.
 */
export interface SpotDef {
  tx: number;
  ty: number;
  name: string;
  /** Ids en data/activities.ts. */
  activities: readonly string[];
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
  /** Máximo por carril; el primero de cada carril es un taxi. */
  carsPerLane: number;
  /** [desde, hasta, coches por carril] en horas; fuera de las franjas, carsPerLane. */
  hourly?: readonly (readonly [number, number, number])[];
}

/**
 * Un paso de peatones con semáforo sobre una calzada que va de este a oeste:
 * el rectángulo de las bandas en tiles (los peatones lo cruzan de norte a sur).
 * Semáforo de coches a cada lado y de peatones en cada bordillo. Uno nuevo es
 * una entrada de datos.
 */
export interface SignalDef {
  id: string;
  tx: number;
  ty: number;
  w: number;
  h: number;
  /** Desfase en ms dentro del ciclo: dos cruces de la misma avenida no cambian a la vez. */
  offset?: number;
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
  /** Pasos de peatones con semáforo (systems/Signals.ts): los respetan peatones, personajes y coches. */
  signals?: readonly SignalDef[];
  /** Interiores: color de la luz del local (#rrggbb), que tiñe la sala. Las lámparas se encienden siempre. */
  ambient?: string;
  /** Máquinas y mostradores donde se compra: un catálogo de data/catalogs.ts en un tile. */
  terminals?: readonly TerminalDef[];
  /** Sitios donde se hace algo que lleva un rato: la cama, la cocina, la silla de la peluquería (data/activities.ts). */
  spots?: readonly SpotDef[];
  /** Interiores: focos de colores que barren esta zona en tiles (la pista de baile), al ritmo de la música. */
  strobe?: { tx: number; ty: number; w: number; h: number };
}

/** Colores de ropa y pelo; alimentan el generador de texturas. */
export interface NpcLook {
  id: string;
  cloth: string;
  clothDark: string;
  hair: string;
  /** Opcionales: sin ellos, el aspecto de siempre. */
  skin?: string;
  /** Brazos al aire (tirantes) o manga de otro color. */
  sleeves?: string;
  trousers?: string;
  /** Manchas sobre el pantalón (leopardo). */
  spots?: string;
  longHair?: boolean;
  earrings?: string;
  /** Bolso en bandolera y gorra (color): sobre todo para los anónimos. */
  bag?: string;
  cap?: string;
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
  /** Lo que lleva encima: id de objeto (data/items.ts) → unidades. */
  inventory: Record<string, number>;
  /** Tarjetas con saldo: id de tarjeta (data/items.ts, kind 'card') → euros cargados. Sin clave, no la tiene. */
  cards: Record<string, number>;
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
