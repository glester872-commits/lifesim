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
  | 'bench-up'
  | 'chair-up'
  | 'chair-down'
  | 'chair-left'
  | 'chair-right'
  | 'stool'
  // restaurante: mesa con mantel y fogones
  | 'dining-table'
  | 'stove'
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
  // gimnasio: máquinas a las que se sube quien las usa (data/stations.ts) y lo que hay alrededor
  | 'exercise-bike'
  | 'rower'
  | 'bench-press'
  | 'squat-rack'
  | 'cable-machine'
  | 'plate-tree'
  | 'kettlebells'
  | 'yoga-mat'
  | 'gym-towel'
  | 'gym-bags'
  | 'gym-sign'
  | 'lockers'
  // vestuarios del gimnasio
  | 'sink'
  | 'toilet'
  | 'shower'
  | 'sign-men'
  | 'sign-women'
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
  | 'street-lamp-art'
  | 'bike-rack'
  | 'planter-box'
  | 'metro-totem'
  | 'info-board'
  // planos: se hornean con el suelo
  | 'manhole'
  | 'drain'
  | 'leaves'
  | 'dj-booth'
  // barbería y vinoteca
  | 'barber-chair'
  | 'wine-rack'
  // estudio de tatuaje y tiendas de la Calle del Carmen
  | 'tattoo-chair'
  | 'tattoo-cart'
  | 'flash-wall'
  | 'sneaker-wall'
  | 'bargain-bin'
  | 'poster-column'
  // Calle del Carmen: lo que se saca a la acera.
  | 'street-rack'
  | 'sandwich-board'
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
  | 'crates'
  | 'bed-tree'
  | 'flower-bed'
  | 'parking-meter'
  // Ribera Norte (world/RiverArt): zona deportiva, quiosco de helados y salón recreativo.
  | 'pullup-bar'
  | 'skate-ramp'
  | 'skate-box'
  | 'ice-cream-kiosk'
  | 'arcade-cabinet'
  | 'arcade-racing'
  | 'arcade-claw'
  | 'arcade-rhythm'
  | 'road-arrow-e'
  | 'road-arrow-w'
  | 'asphalt-patch'
  | 'tyre-marks'
  | 'work-light'
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
  | 'res-modern'
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
  | 'wine'
  // Calle del Carmen
  | 'vintage'
  | 'streetwear'
  | 'thrift'
  | 'tattoo'
  | 'coffee'
  | 'records'
  | 'print'
  // Calle del Carmen, segunda tanda: zapatillas, piercing con barbería y el bar de la esquina.
  | 'sneaker'
  | 'piercing'
  | 'bar'
  // Ribera Norte: el salón recreativo y la tienda de deportes.
  | 'arcade'
  | 'sports'
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
  /** Plantas visibles en fachada (sólo frentes al sur), dos filas cada una (LocationSystem.STOREY_ROWS). Por defecto una. */
  floors?: 1 | 2 | 3;
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
  /** El armario: cambiarse con la ropa comprada (scenes/Menus.ts, openWardrobe). */
  wardrobe?: true;
}

/** Algo que se puede mirar con E: un cartel, una fuente, un escaparate. */
export interface InspectDef {
  tx: number;
  ty: number;
  name: string;
  lines: readonly string[];
}

/**
 * Un perchero, una pared o una mesa de una tienda de ropa (data/retail.ts): con E
 * se mira lo que cuelga, se prueba y se compra. `tx`/`ty` es el sitio donde se
 * está de pie. Sin `categories`, enseña todo el género de la tienda.
 */
export interface RackDef {
  tx: number;
  ty: number;
  name: string;
  store: string;
  categories?: readonly import('../data/retail').GarmentCategory[];
}

/**
 * Un flujo de carriles: quien los recorre entra por un borde, para en rojo, cede
 * a los peatones y sale por el otro (systems/Traffic.ts). Qué pasa lo deciden los
 * pesos del catálogo (data/vehicles.ts, data/bikes.ts) por hora, día y tipo de
 * vía, y `mix` por barrio.
 */
export interface LaneFlow {
  /** `mix`: lo que ponen las zonas que cruza el carril, por franja (systems/Districts.ts lo rellena al entrar). */
  lanes: readonly { row: number; dir: 1 | -1; mix?: Readonly<Partial<Record<import('../data/vehicles.ts').TrafficBand, Readonly<Record<string, number>>>>> }[];
  road: import('../data/vehicles.ts').RoadKind;
  /** Multiplicadores del barrio sobre los pesos del catálogo (id → factor). */
  mix?: Readonly<Record<string, number>>;
  /** Máximo por carril. */
  perLane: number;
  /** [desde, hasta, cuántos por carril] en horas; fuera de las franjas, perLane. */
  hourly?: readonly (readonly [number, number, number])[];
  /** Cuánto se nota la lluvia (0–1): con 0,7, un chaparrón deja menos de un tercio. Las bicis, sí; los coches, no. */
  rainShy?: number;
}

/** Tráfico de una calle: los coches y, si la calle tiene carril bici (tile `b`), las bicis. */
export interface TrafficDef extends LaneFlow {
  bikes?: LaneFlow;
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

/**
 * Una mesa con servicio: sus asientos (puntos `seat`, data/seating.ts) y el
 * tile libre junto a ella donde se para quien atiende a tomar nota, servir,
 * cobrar o recoger.
 */
export interface TableDef {
  id: string;
  seats: readonly string[];
  service: TilePoint;
}

export interface PointDef {
  tx: number;
  ty: number;
  kind: PointKind;
  facing?: Facing;
  /** Puesto de uso (data/stations.ts): qué se hace aquí, cuánto rato y con qué movimiento. */
  use?: string;
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
  /** Percheros de una tienda de ropa donde se ve, se prueba y se compra. */
  racks?: readonly RackDef[];
  /** Zona de skate de una calle: unos patinadores ruedan de un lado a otro de la franja `row`, de `tx0` a `tx1` (world/SkateParkView). */
  skate?: { tx0: number; tx1: number; row: number; riders?: number };
  traffic?: TrafficDef;
  /** Pasos de peatones con semáforo (systems/Signals.ts): los respetan peatones, personajes y coches. */
  signals?: readonly SignalDef[];
  /** Interiores: color de la luz del local (#rrggbb), que tiñe la sala. Las lámparas se encienden siempre. */
  ambient?: string;
  /** Máquinas y mostradores donde se compra: un catálogo de data/catalogs.ts en un tile. */
  terminals?: readonly TerminalDef[];
  /** Sitios donde se hace algo que lleva un rato: la cama, la cocina, la silla de la peluquería (data/activities.ts). */
  spots?: readonly SpotDef[];
  /** Mesas con servicio (systems/TableService.ts): sus asientos y dónde se pone quien atiende. */
  tables?: readonly TableDef[];
  /** Nombres de calles y zonas para el mapa (systems/WorldMap.ts): sólo la etiqueta y dónde va; la forma sale del suelo. */
  areas?: readonly { name: string; tx: number; ty: number }[];
  /** Interiores: focos de colores que barren esta zona en tiles (la pista de baile), al ritmo de la música. */
  strobe?: { tx: number; ty: number; w: number; h: number };
  /** Identidad visual de todo el sitio (data/districts.ts). Sin ella, el arte maestro sin variación. */
  district?: import('../data/districts.ts').DistrictId;
  /** Zonas con otra identidad, en tiles; la última que contiene un tile manda (design/DISTRICTS.md). */
  zones?: readonly DistrictZone[];
  /**
   * Escena de muestra (design/ART_BIBLE §15), en tiles: dentro, el suelo, las
   * fachadas, la oclusión, el primer plano y los árboles usan el estándar
   * visual nuevo antes de llevarlo al resto del mapa. Sin ella, nada cambia.
   */
  showcase?: { tx: number; ty: number; w: number; h: number };
  /**
   * Primer plano con paralaje (world/Foreground): copas que asoman por el borde
   * de la cámara cuando se mira la escena de muestra. x, y: dónde se ven con la
   * cámara centrada en la escena (px de mundo).
   */
  foreground?: readonly { kind: 'canopy' | 'canopy-small'; x: number; y: number; flip?: boolean }[];
  /**
   * Guirnaldas de bombillas (world/StringLights), en px de mundo: de (x0, y0) a (x1, y1), con `sag` px de caída
   * en el centro. Cuelgan por encima de la gente y de noche se encienden.
   */
  garlands?: readonly { x0: number; y0: number; x1: number; y1: number; sag: number }[];
}

export interface DistrictZone {
  profile: import('../data/districts.ts').DistrictId;
  tx: number;
  ty: number;
  w: number;
  h: number;
}

/** Colores de ropa y pelo; alimentan el generador de texturas. */
export interface NpcLook {
  id: string;
  /** Anónimos: qué zona los atrae más (data/districts.ts, crowd). Sin él, 'everyday'. */
  style?: import('../data/districts.ts').LookStyle;
  cloth: string;
  clothDark: string;
  hair: string;
  /** Opcionales: sin ellos, el aspecto de siempre. */
  skin?: string;
  /** Brazos al aire (tirantes) o manga de otro color. */
  sleeves?: string;
  trousers?: string;
  /** Calzado fijo al cambiar de capa; sin él, sale del id. */
  shoes?: string;
  /** Manchas sobre el pantalón (leopardo). */
  spots?: string;
  longHair?: boolean;
  earrings?: string;
  /** Bolso en bandolera y gorra (color): sobre todo para los anónimos. */
  bag?: string;
  cap?: string;
  /** Ropa de abrigo o de verano (world/WeatherLooks): bufanda, capucha, manga corta y el peinado de su original. */
  scarf?: string;
  hood?: string;
  sleeveLen?: number;
  hairStyle?: import('../data/appearance.ts').HairStyle;
  /** Tatuajes de fábrica que se ven (el brazo de quien tatúa): world/HumanArt.ts los pinta sobre la piel. */
  ink?: readonly { spot: import('../data/tattoos.ts').InkSpot; color: string }[];
  /**
   * Cuerpo y rasgos (data/identity.ts, systems/Population.ts). Sin ellos, el
   * cuerpo de siempre: los personajes con nombre no cambian.
   */
  build?: import('../data/identity.ts').Build;
  height?: import('../data/identity.ts').Height;
  posture?: import('../data/identity.ts').Posture;
  facialHair?: 'stubble' | 'moustache' | 'beard';
  brows?: 'thick' | 'fine';
  jaw?: 'square' | 'narrow';
  glasses?: 'clear' | 'dark';
  piercing?: 'nose' | 'brow';
  headphones?: string;
  /** Pañuelo a la cabeza: se pinta como la capucha, con la cara al aire. */
  headscarf?: string;
  /** Bastón al andar o estar de pie. */
  cane?: boolean;
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
  /**
   * Aspecto de quien persiste: 'player' y los personajes con nombre (id de
   * data/npcs.ts) → lo que se ha cambiado sobre su aspecto de fábrica
   * (data/appearance.ts). La gente anónima no entra aquí: es de paso.
   */
  appearance: Record<string, import('../data/appearance.ts').Appearance>;
  /** Prendas del jugador (ids de data/retail.ts): lo comprado, se lleve o no puesto. */
  wardrobe: string[];
  /** Forma física del jugador (systems/Fitness.ts). Partidas anteriores no la tienen: empiezan de cero. */
  fitness?: import('../systems/Fitness.ts').Fitness;
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
