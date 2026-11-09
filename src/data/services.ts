/**
 * Oficios del personal. Un camarero es un camarero en el café, en el
 * restaurante y en la terraza: mismo uniforme por defecto, misma frase y la
 * misma forma de trabajar. Cada local sólo dice qué oficio pone, dónde y
 * cuándo (data/population.ts dentro, data/streets.ts en la terraza); con `npc`,
 * el puesto lo ocupa un personaje con nombre.
 *
 * Tres formas de trabajar, sin IA:
 * - post: se queda en su puesto (caja, barra, cabina, puerta).
 * - rounds: va de uno a otro de sus puntos (reponer, sala del gimnasio).
 * - serve: va junto a un cliente sentado, le atiende un momento y vuelve.
 *
 * La vigilancia del metro (Marco, Iker, Rocío) tiene su propia máquina de
 * estados en systems/SecurityAI.ts: patrulla un andén, no un local.
 */
export type ServiceActivity = 'post' | 'rounds' | 'serve';

/**
 * Lo que ofrece alguien del personal cuando se le habla: un servicio de aspecto
 * (la barbera corta el pelo) o unas actividades con su precio y su rato (la
 * barra sirve copas). Es el paso Servicio → Interacción: el local pone al
 * oficio, el oficio lo que ofrece, y la oferta lleva a una transacción
 * (systems/Appearance.ts, systems/Activities.ts) que cambia el estado.
 */
export type ServiceOffer =
  /** Quien da las clases de una academia (data/academies.ts): horario, precio, bono y a qué ejercicio ir. */
  | { kind: 'training'; academy: import('./academies.ts').Discipline; points: readonly string[] }
  | { kind: 'appearance'; slot: import('./appearance.ts').AppearanceSlot; title: string; greeting: string; minutes: number }
  | { kind: 'activities'; title: string; activities: readonly string[] }
  /** Una tienda de ropa (data/retail.ts): su género y sus precios, cobrados por systems/Retail.ts. */
  | { kind: 'retail'; store: string; minutes: number }
  | { kind: 'advice'; greeting: string; questions: readonly { question: string; answer: string }[] }
  /**
   * La recepción de una comisaría (systems/Police): cómo está la zona ahora (la calle `street`, su hora y los robos que
   * constan) y, sólo si te han robado y no lo has denunciado, la denuncia.
   */
  | { kind: 'police'; title: string; street: string }
  /** Quien lleva un encuentro con hora (data/parish.ts): horario, apuntarse si es la hora y cómo fue el último (systems/Parish). */
  | { kind: 'gathering'; gathering: string }
  /** CV-08A · lo que se vende en una manta o una bandeja (data/catalogs.ts), cobrado por systems/Commerce como en una máquina. */
  | { kind: 'catalog'; title: string; catalog: string };

export const SERVICE_OFFERS = {
  'boxing-coach': { kind: 'training', academy: 'boxing', points: ['BOX_GUARD_01', 'BOX_FEET_01', 'BOX_BAG_01', 'BOX_COORD_01', 'BOX_ROPE_01'] },
  'mma-coach': { kind: 'training', academy: 'mma', points: ['MMA_BAG_01', 'MMA_FEET_01', 'MMA_GROUND_01', 'MMA_COND_01'] },
  'tkd-coach': { kind: 'training', academy: 'taekwondo', points: ['TKD_KICK_01', 'TKD_KICK_02', 'TKD_KICK_03', 'TKD_FORM_01', 'TKD_FLEX_01'] },
  'dance-coach': { kind: 'training', academy: 'dance', points: ['DANCE_STEP_01', 'DANCE_CHOREO_01', 'DANCE_FLEX_01'] },
  haircut: { kind: 'appearance', slot: 'hair', title: 'Barbería Nati · corte', greeting: 'Siéntate. ¿Cómo lo quieres?', minutes: 30 },
  // Lo que dura cada tatuaje va en su diseño (data/tattoos.ts); `minutes` es la consulta.
  tattoo: { kind: 'appearance', slot: 'tattoos', title: 'Tinta Carmen · tatuaje', greeting: '¿Dónde lo quieres? Primero la zona, luego el diseño.', minutes: 10 },
  'shop-hilo': { kind: 'retail', store: 'hilo', minutes: 10 },
  'shop-decathlon': { kind: 'retail', store: 'decathlon', minutes: 5 },
  'decathlon-montana': {
    kind: 'advice', greeting: '¿Paseo corto o ruta de todo el día?',
    questions: [
      { question: '¿Qué mochila me conviene?', answer: 'Para una salida corta, con 15 o 20 litros suele bastar. Cuenta con sitio para agua, comida y una capa de abrigo.' },
      { question: '¿Dónde están las mochilas?', answer: 'Al fondo, en la fila de montaña, hacia el extremo derecho. Están junto a camping.' },
      { question: '¿Dónde puedo probarme la ropa?', answer: 'Los probadores están al fondo, entre Sportswear y Montaña junior.' },
    ],
  },
  'decathlon-running': {
    kind: 'advice', greeting: '¿Corres por asfalto o por caminos?',
    questions: [
      { question: '¿Cómo sé si me queda bien la zapatilla?', answer: 'Pruébatela con los calcetines con los que corres. Deja espacio delante para los dedos y comprueba que el talón no se levante.' },
      { question: '¿Dónde puedo comprar zapatillas?', answer: 'En el expositor del fondo de Running o en una caja atendida. Desde el expositor puedes ver cómo te quedan antes de comprar.' },
    ],
  },
  'decathlon-ciclismo': {
    kind: 'advice', greeting: 'Para elegir bici, empieza por el tipo de trayecto.',
    questions: [
      { question: '¿Qué bici va mejor para la ciudad?', answer: 'Para trayectos por asfalto, una urbana te deja pedalear en una postura más erguida. Si sales por terreno suelto, mira una de montaña.' },
      { question: '¿Cómo elijo una cámara de repuesto?', answer: 'Copia el diámetro y el ancho que aparecen en el lateral del neumático. Comprueba también qué tipo de válvula lleva.' },
      { question: '¿Dónde está Segunda Vida?', answer: 'Al fondo del pasillo derecho, antes de la pared. Allí están las bicis revisadas de exposición.' },
    ],
  },
  'decathlon-fitness': {
    kind: 'advice', greeting: '¿Vas a entrenar en casa? Dime cuánto espacio tienes.',
    questions: [
      { question: '¿Con qué equipo puedo empezar en casa?', answer: 'Con una esterilla y una banda ya puedes montar una rutina sencilla sin llenar el salón.' },
      { question: '¿Dónde está la ropa de deporte?', answer: 'Camisetas, sudaderas y pantalones están en Sportswear, al fondo, junto a Running y los probadores.' },
    ],
  },
  'shop-retales': { kind: 'retail', store: 'retales', minutes: 15 },
  'shop-archivo': { kind: 'retail', store: 'archivo', minutes: 10 },
  'shop-vuelta': { kind: 'retail', store: 'vuelta', minutes: 20 },
  'shop-suela': { kind: 'retail', store: 'suela', minutes: 10 },
  // Cuatro Ríos.
  'haircut-rio': { kind: 'appearance', slot: 'hair', title: 'Barbería del Cruce · corte', greeting: 'Pasa, siéntate. ¿Como la última vez?', minutes: 30 },
  'shop-hilvana': { kind: 'retail', store: 'hilvana', minutes: 10 },
  'shop-ambar': { kind: 'retail', store: 'ambar', minutes: 10 },
  // Velaria.
  'haircut-lis': { kind: 'appearance', slot: 'hair', title: 'Salón Lis · corte y peinado', greeting: 'Bienvenida, bienvenido. Primero lavamos y luego me cuentas qué te apetece.', minutes: 45 },
  'shop-ferrant': { kind: 'retail', store: 'ferrant', minutes: 20 },
  'shop-brisa': { kind: 'retail', store: 'brisa', minutes: 15 },
  // Puerta Central.
  'shop-recuerdos': { kind: 'retail', store: 'recuerdos', minutes: 8 },
  // Distrito Arena.
  'shop-deportes-arena': { kind: 'retail', store: 'deportes-arena', minutes: 10 },
  'shop-halcones': { kind: 'retail', store: 'halcones', minutes: 8 },
  'shop-central': { kind: 'retail', store: 'central', minutes: 12 },
  'shop-monton': { kind: 'retail', store: 'monton', minutes: 6 },
  'club-bar': { kind: 'activities', title: 'Barra · Sala Órbita', activities: ['club-drink', 'club-water'] },
  'wine-bar': { kind: 'activities', title: 'Barra · La Cepa', activities: ['wine-glass', 'wine-board'] },
  'bar-ribera': { kind: 'activities', title: 'Barra · Bar Ribera', activities: ['bar-cana', 'bar-tinto', 'bar-refresco'] },
  'bar-larguero': { kind: 'activities', title: 'Barra · Bar El Larguero', activities: ['bar-cana', 'bar-tinto', 'bar-refresco'] },
  'bar-grada': { kind: 'activities', title: 'Barra · Taberna La Grada', activities: ['bar-cana', 'bar-tinto', 'bar-refresco'] },
  'bar-luna': { kind: 'activities', title: 'Barra · Bar Luna Llena', activities: ['lu-copa', 'club-water'] },
  'police-desk': { kind: 'police', title: 'Comisaría de Puerta Central · recepción', street: 'puerta-central' },
  // ALPHA-10 · la oficina de barrio de la Ronda (data/ronda.ts): la misma recepción, con el estado de Vallesco.
  'police-desk-vallesco': { kind: 'police', title: 'Policía de barrio · Vallesco · recepción', street: 'district' },
  // CV-08A · venta en la calle (data/streetActs.ts `offers`): la ropa y las gafas, como en una tienda (systems/Retail);
  // lo de las mantas y la bandeja, como en una máquina (systems/Commerce). Sólo mientras el puesto vende.
  'street-gafas': { kind: 'retail', store: 'bandeja-gafas', minutes: 3 },
  'street-ropa': { kind: 'retail', store: 'manta-ropa', minutes: 5 },
  'street-bisuteria': { kind: 'catalog', title: 'Manta de bisutería', catalog: 'manta-bisuteria' },
  'street-artesania': { kind: 'catalog', title: 'Manta de artesanía', catalog: 'manta-artesania' },
  'street-recuerdos': { kind: 'catalog', title: 'Manta de recuerdos', catalog: 'manta-recuerdos' },
  'street-bandeja-arena': { kind: 'catalog', title: 'Bandeja de pipas y agua', catalog: 'bandeja-arena' },
  'street-bufandas': { kind: 'retail', store: 'manta-bufandas', minutes: 3 },
  'street-camisetas-arena': { kind: 'retail', store: 'manta-camisetas', minutes: 3 },
  // El parque de bomberos de la Ronda de la Vía: una visita a la cochera y consejos de prevención. Los incendios (ALPHA-10,
  // systems/Emergencies) se viven en la calle, no aquí: la guardia no despacha avisos ni promete salidas.
  'fire-desk': { kind: 'activities', title: 'Parque de Bomberos · guardia', activities: ['fire-visit', 'fire-advice'] },
  'parish-choir': { kind: 'gathering', gathering: 'coro' },
} as const satisfies Record<string, ServiceOffer>;

export type OfferId = keyof typeof SERVICE_OFFERS;

export function getOffer(id: OfferId): ServiceOffer {
  return SERVICE_OFFERS[id];
}

export interface ServiceRole {
  label: string;
  line: string;
  /** Uniforme por defecto: id en UNIFORM_LOOKS (data/npcs.ts). Un local puede poner el suyo. */
  uniform: string;
  activity: ServiceActivity;
  /** Lo que ofrece si se le habla; un local puede poner otra cosa (StaffRole.offers). */
  offers?: OfferId;
}

export const SERVICE_ROLES = {
  waiter: { label: 'Camarero', line: 'Enseguida te atiendo.', uniform: 'uniforme-sala', activity: 'serve' },
  bartender: { label: 'Barra', line: '¿Qué te pongo?', uniform: 'uniforme-noche', activity: 'post' },
  // Quien lleva una barra con clientes de pie y en taburete: va y viene entre sus puntos de servicio (tirador, estantería, caja) y se vuelve a quien le toca (systems/Crowd.serveDrink).
  barkeeper: { label: 'Barra', line: '¿Qué te pongo?', uniform: 'uniforme-noche', activity: 'rounds' },
  cashier: { label: 'Caja', line: '¿Lo pagas con tarjeta?', uniform: 'uniforme-tienda', activity: 'post' },
  security: { label: 'Seguridad', line: 'Dentro, tranquilidad. Fuera, lo que quieras.', uniform: 'uniforme-noche', activity: 'post' },
  'gym-staff': { label: 'Personal del gimnasio', line: 'Si usas la cinta, límpiala después.', uniform: 'uniforme-gym', activity: 'rounds' },
  'shop-worker': { label: 'Personal de tienda', line: 'Si buscas algo, dímelo.', uniform: 'uniforme-tienda', activity: 'rounds' },
  cook: { label: 'Cocina', line: 'Sale en cinco minutos.', uniform: 'uniforme-sala', activity: 'post' },
  receptionist: { label: 'Recepción', line: '¿Tienes cita?', uniform: 'uniforme-tienda', activity: 'post' },
  // Quien abre y atiende un sitio de todos (la parroquia): sin uniforme de tienda, en su sitio.
  host: { label: 'Acogida', line: 'Pasa, que está abierto.', uniform: 'uniforme-sala', activity: 'post', offers: 'parish-choir' },
  // La guardia de la comisaría (systems/Police): el mismo uniforme que la patrulla de la calle.
  // La guardia del parque de bomberos (data/ronda.ts): enseña la cochera y explica la prevención en casa.
  firefighter: { label: 'Bombero de guardia', line: 'Buenas. Si es una emergencia, se llama al 112; si es una pregunta, pregunta.', uniform: 'uniforme-bomberos', activity: 'post', offers: 'fire-desk' },
  'police-officer': { label: 'Agente de guardia', line: 'Buenas. ¿En qué te puedo ayudar?', uniform: 'uniforme-policia', activity: 'post', offers: 'police-desk' },
  dj: { label: 'DJ', line: '(Señala los cascos y sonríe. No te oye.)', uniform: 'dj', activity: 'post' },
  barber: { label: 'Barbería', line: 'Si tienes prisa, vuelve mañana.', uniform: 'uniforme-barbero', activity: 'serve', offers: 'haircut' },
  'tattoo-artist': { label: 'Tatuador', line: 'Si te tiembla el pulso, a mí no.', uniform: 'uniforme-tatuaje', activity: 'serve', offers: 'tattoo' },
} as const satisfies Record<string, ServiceRole>;

export type ServiceId = keyof typeof SERVICE_ROLES;

export function serviceRole(id: ServiceId): ServiceRole {
  return SERVICE_ROLES[id];
}
