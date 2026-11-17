/**
 * DEC-05 · Cómo habla cada sección de Decathlon (sólo datos; la elección es systems/StoreKnowledge.ts `line`).
 * `section`: la del colaborador (su rol) o la que se pregunta (`tip`, por id o familia de SECTORS). `state` y `hours`,
 * opcionales: sin ellos, valen para todo. `advice` se enlaza por el `id` de la pregunta (data/services.ts) y repite sus
 * datos con otras palabras. Nada de tallas, precios, marcas ni material a la venta: no existen. No se guarda nada.
 */
export type LineSection = 'running' | 'ciclismo' | 'fitness' | 'montana' | 'colectivos' | 'natacion' | 'probadores' | 'cajas' | 'general';
export type LineKind = 'greeting' | 'farewell' | 'advice' | 'tip';
export type StaffState = 'disponible' | 'reponiendo' | 'desplazandose' | 'atendiendo';
export type HourBand = 'manana' | 'tarde' | 'cierre';

export interface SectionLine {
  id: string;
  section: LineSection;
  kind: LineKind;
  /** `advice`: id de la pregunta de data/services.ts. */
  ref?: string;
  state?: StaffState;
  hours?: HourBand;
  variations: readonly string[];
}

/** Secciones con colaborador propio (saludo y despedida obligatorios); el resto cae en `general`. */
export const VOICED_SECTIONS: readonly LineSection[] = ['running', 'ciclismo', 'fitness', 'montana', 'general', 'cajas'];
export const LINE_SECTIONS: readonly LineSection[] = ['running', 'ciclismo', 'fitness', 'montana', 'colectivos', 'natacion', 'probadores', 'cajas', 'general'];

export const SECTION_LINES: readonly SectionLine[] = [
  // Running: técnico, de pisada y kilómetros.
  { id: 'running-hola-manana', section: 'running', kind: 'greeting', hours: 'manana', variations: [
    'Buenos días. ¿Sales a rodar por asfalto o por caminos?',
    'Buenos días. Cuéntame cuántos kilómetros haces a la semana y lo vemos.',
  ] },
  { id: 'running-hola-tarde', section: 'running', kind: 'greeting', hours: 'tarde', variations: [
    'Buenas tardes. ¿Entrenas para alguna carrera o es para correr a gusto?',
    'Buenas tardes. ¿Asfalto, tierra o un poco de todo?',
  ] },
  { id: 'running-hola-cierre', section: 'running', kind: 'greeting', hours: 'cierre', variations: [
    'Buenas. Cerramos a las nueve, pero te da tiempo a mirar zapatillas.',
    'Ya vamos cerrando, a las nueve. Dime qué te hace falta para tus kilómetros y vamos al grano.',
  ] },
  { id: 'running-hola-paso', section: 'running', kind: 'greeting', state: 'desplazandose', variations: [
    'Iba a colocar el expositor, pero dime. ¿Es para correr?',
    'Voy de camino al fondo, pero sin problema: para hablar de correr siempre hay un rato.',
  ] },
  { id: 'running-adios', section: 'running', kind: 'farewell', variations: [
    '¡Que vayan bien esos kilómetros!',
    'Venga, y nada de estrenar zapatillas el día de la carrera.',
    'Suerte con los entrenos. Si algo te roza, no lo fuerces.',
  ] },

  // Ciclismo: de ciudad y de ruta.
  { id: 'ciclismo-hola-manana', section: 'ciclismo', kind: 'greeting', hours: 'manana', variations: [
    'Buenos días. ¿Bici para ir al trabajo o para salir de ruta?',
    'Buenos días. Si es para la ciudad o para salir de ruta, dime y te oriento.',
  ] },
  { id: 'ciclismo-hola-tarde', section: 'ciclismo', kind: 'greeting', hours: 'tarde', variations: [
    'Buenas tardes. ¿Ciudad o carretera? Empieza por ahí.',
    'Buenas tardes. Cuéntame qué trayecto haces y te oriento.',
  ] },
  { id: 'ciclismo-hola-cierre', section: 'ciclismo', kind: 'greeting', hours: 'cierre', variations: [
    'Buenas. Cerramos a las nueve; si es una duda rápida de la bici, dispara.',
    'Estamos a punto de cerrar, a las nueve, pero una duda de bici te la resuelvo.',
  ] },
  { id: 'ciclismo-hola-paso', section: 'ciclismo', kind: 'greeting', state: 'desplazandose', variations: [
    'Iba a ordenar las bicis, pero dime. ¿Qué necesitas?',
    'Voy hacia Segunda Vida, pero paro un momento. ¿Qué necesitas?',
  ] },
  { id: 'ciclismo-adios', section: 'ciclismo', kind: 'farewell', variations: [
    'Buena ruta, y revisa la presión antes de salir.',
    'Venga, y lleva siempre una cámara de repuesto encima.',
    'Que ruede bien. Y el casco, siempre puesto.',
  ] },

  // Fitness: práctico y motivador, sin gritar.
  { id: 'fitness-hola-manana', section: 'fitness', kind: 'greeting', hours: 'manana', variations: [
    'Buenos días. ¿Entrenas en casa o vas al gimnasio?',
    'Buenos días. Para empezar a moverte no hace falta mucho, ya verás.',
  ] },
  { id: 'fitness-hola-tarde', section: 'fitness', kind: 'greeting', hours: 'tarde', variations: [
    'Buenas tardes. Dime cuánto espacio tienes en casa y te digo por dónde empezar.',
    'Buenas tardes. ¿Empiezas a entrenar o ya llevas tiempo?',
  ] },
  { id: 'fitness-hola-cierre', section: 'fitness', kind: 'greeting', hours: 'cierre', variations: [
    'Buenas. Cerramos a las nueve, pero cuéntame qué quieres entrenar y te oriento.',
    'Vamos cerrando, a las nueve. Cuéntame qué quieres entrenar.',
  ] },
  { id: 'fitness-hola-paso', section: 'fitness', kind: 'greeting', state: 'desplazandose', variations: [
    'Iba a ordenar las esterillas, pero cuéntame.',
    'Voy a la otra punta de la sección, pero dime: ¿qué quieres trabajar?',
  ] },
  { id: 'fitness-adios', section: 'fitness', kind: 'farewell', variations: [
    'A entrenar con calma, que la constancia es lo que cuenta.',
    'Venga, poco a poco y sin lesionarte.',
    'Que te vaya bien. Mejor diez minutos cada día que una hora un día suelto.',
  ] },

  // Montaña: prudente, de capas, peso y tiempo.
  { id: 'montana-hola-manana', section: 'montana', kind: 'greeting', hours: 'manana', variations: [
    'Buenos días. ¿Paseo corto o ruta de todo el día?',
    'Buenos días. Antes de nada, ¿adónde vas y cuánto tiempo?',
  ] },
  { id: 'montana-hola-tarde', section: 'montana', kind: 'greeting', hours: 'tarde', variations: [
    'Buenas tardes. ¿Ya sabes qué tiempo va a hacer arriba?',
    'Buenas tardes. Cuéntame la ruta y vemos qué capas te hacen falta.',
  ] },
  { id: 'montana-hola-cierre', section: 'montana', kind: 'greeting', hours: 'cierre', variations: [
    'Buenas. Cerramos a las nueve; si sales mañana temprano, lo dejamos pensado.',
    'Vamos cerrando, a las nueve. Dime la ruta y te digo lo justo para no cargar de más.',
  ] },
  { id: 'montana-hola-paso', section: 'montana', kind: 'greeting', state: 'desplazandose', variations: [
    'Iba hacia camping, pero dime. ¿Tienes alguna salida en mente?',
    'Voy de paso por el pasillo, pero te atiendo. ¿Monte o paseo?',
  ] },
  { id: 'montana-adios', section: 'montana', kind: 'farewell', variations: [
    'Buena ruta. Mira el parte antes de salir y lleva una capa de más.',
    'Venga, y avisa a alguien de por dónde vas.',
    'Que disfrutes del monte. Mejor volver pronto que tarde.',
  ] },

  // Sin colaborador: hablan cuando se pregunta por ellas.
  { id: 'colectivos-tip', section: 'colectivos', kind: 'tip', variations: [
    'Es la zona de deportes de equipo; si juegas en un club, es la tuya.',
    'Ahí va todo lo de equipo, para los que entrenan con su gente.',
  ] },
  { id: 'natacion-tip', section: 'natacion', kind: 'tip', variations: [
    'Un consejo de piscina: aclara todo con agua dulce después de nadar, que el cloro castiga.',
    'Si nadas en piscina cubierta, lleva algo de abrigo para la salida.',
  ] },
  { id: 'probadores-tip', section: 'probadores', kind: 'tip', variations: [
    'Si están todos ocupados, espera un momento, que van rápido.',
    'Pruébatelo con calma; lo que no te lleves, déjalo colgado y ya lo colocamos.',
  ] },

  // Cajas: de servicio.
  { id: 'cajas-hola-libre', section: 'cajas', kind: 'greeting', state: 'disponible', variations: [
    'Hola, pasa por aquí. ¿Lo llevas todo?',
    'Buenas, esta caja está libre. Cuando quieras.',
  ] },
  { id: 'cajas-hola-ocupada', section: 'cajas', kind: 'greeting', state: 'atendiendo', variations: [
    'Un momento, que termino con este cliente y estoy contigo.',
    'Enseguida te atiendo; acabo de cobrar aquí y voy.',
  ] },
  { id: 'cajas-hola-cierre', section: 'cajas', kind: 'greeting', hours: 'cierre', variations: [
    'Buenas. Cerramos a las nueve; si lo tienes todo, te cobro ya.',
    'Última vuelta antes de cerrar. ¿Te cobro?',
  ] },
  { id: 'cajas-adios', section: 'cajas', kind: 'farewell', variations: [
    'Nada. Si cambias de idea, aquí estoy.',
    'Vale, mira con calma. Aquí te espero.',
  ] },

  // General: Reposición y respaldo de las secciones sin voz propia.
  { id: 'general-hola-reponiendo', section: 'general', kind: 'greeting', state: 'reponiendo', variations: [
    'Estoy reponiendo, pero dime, ¿qué buscas?',
    'Te atiendo mientras coloco esto. ¿Qué necesitas?',
  ] },
  { id: 'general-hola-paso', section: 'general', kind: 'greeting', state: 'desplazandose', variations: [
    'Voy con el carro, pero paro un momento. Dime.',
    'Iba a la otra punta de la tienda, pero dime, ¿qué buscas?',
  ] },
  { id: 'general-hola-manana', section: 'general', kind: 'greeting', hours: 'manana', variations: [
    'Buenos días. ¿Buscas algo en concreto?',
    'Buenos días. Dime qué buscas y te digo dónde está.',
  ] },
  { id: 'general-hola-tarde', section: 'general', kind: 'greeting', hours: 'tarde', variations: [
    'Buenas tardes. ¿Te ayudo a encontrar algo?',
    'Buenas tardes. Dime, ¿qué buscas?',
  ] },
  { id: 'general-hola-cierre', section: 'general', kind: 'greeting', hours: 'cierre', variations: [
    'Buenas. Cerramos a las nueve; dime qué buscas y te indico rápido.',
    'Ya queda poco para cerrar, a las nueve. ¿Qué necesitas?',
  ] },
  { id: 'general-adios', section: 'general', kind: 'farewell', variations: [
    'A ti. Si te pierdes, pregunta a cualquiera de sala.',
    'De nada. Las cajas, junto a la salida.',
    'Nada, para eso estamos.',
  ] },

  // Consejo de sección: los datos de siempre (data/services.ts), con otras palabras.
  { id: 'advice-montana-mochila', section: 'montana', kind: 'advice', ref: 'montana-mochila', variations: [
    'Para una salida corta, con 15 o 20 litros suele bastar. Cuenta con sitio para agua, comida y una capa de abrigo.',
    'Para salir unas horas, una de 15 o 20 litros es lo más cómodo. Que quepan el agua, algo de comer y una capa por si refresca.',
    'No cargues más de lo que necesitas: 15 o 20 litros para una salida corta, con hueco para agua, comida y abrigo.',
  ] },
  { id: 'advice-montana-mochilas-donde', section: 'montana', kind: 'advice', ref: 'montana-mochilas-donde', variations: [
    'Al fondo, en la fila de montaña, hacia el extremo derecho. Están junto a camping.',
    'Al fondo, en la fila de montaña, casi en el extremo derecho, al lado de camping.',
    'Ve hacia el fondo, a la fila de montaña, y sigue a la derecha del todo: están pegadas a camping.',
  ] },
  { id: 'advice-montana-probar', section: 'montana', kind: 'advice', ref: 'montana-probar', variations: [
    'Los probadores están al fondo, entre Sportswear y Montaña junior.',
    'Al fondo tienes los probadores, entre Sportswear y Montaña junior. Pruébate las capas una encima de otra.',
    'En los probadores del fondo, entre Sportswear y Montaña junior. Mira que te dejen mover los brazos.',
  ] },
  { id: 'advice-running-zapatilla', section: 'running', kind: 'advice', ref: 'running-zapatilla', variations: [
    'Pruébatela con los calcetines con los que corres. Deja espacio delante para los dedos y comprueba que el talón no se levante.',
    'Llévate los calcetines de correr y pruébatela con ellos. Tiene que quedar un dedo de hueco delante y el talón no debe bailar.',
    'Fíjate en dos cosas: que los dedos tengan sitio delante y que el talón no se te salga al andar. Y siempre con tus calcetines de correr.',
  ] },
  { id: 'advice-running-comprar', section: 'running', kind: 'advice', ref: 'running-comprar', variations: [
    'En el expositor del fondo de Running o en una caja atendida. Desde el expositor puedes ver cómo te quedan antes de comprar.',
    'Las tienes en el expositor del fondo de Running; ahí ves cómo te quedan y luego pasas por una caja atendida.',
    'En el expositor de Running, al fondo. Mírate allí cómo te quedan y las pagas en una caja con cajero.',
  ] },
  { id: 'advice-ciclismo-ciudad', section: 'ciclismo', kind: 'advice', ref: 'ciclismo-ciudad', variations: [
    'Para trayectos por asfalto, una urbana te deja pedalear en una postura más erguida. Si sales por terreno suelto, mira una de montaña.',
    'Si vas por asfalto, una urbana: la postura es más erguida y ves mejor el tráfico. Para caminos de tierra, mejor una de montaña.',
    'Para ciudad, una urbana, que se va más cómodo. Si hay tierra o piedra suelta por medio, piensa en una de montaña.',
  ] },
  { id: 'advice-ciclismo-camara', section: 'ciclismo', kind: 'advice', ref: 'ciclismo-camara', variations: [
    'Copia el diámetro y el ancho que aparecen en el lateral del neumático. Comprueba también qué tipo de válvula lleva.',
    'Mira el lateral de la cubierta: ahí vienen el diámetro y el ancho. Apúntalos y fíjate también en la válvula.',
    'Lo que manda es el neumático: copia el diámetro y el ancho que lleva escritos en el lateral, y comprueba qué válvula usa.',
  ] },
  { id: 'advice-ciclismo-segunda-vida', section: 'ciclismo', kind: 'advice', ref: 'ciclismo-segunda-vida', variations: [
    'Al fondo del pasillo derecho, antes de la pared. Allí están las bicis revisadas de exposición.',
    'Sigue el pasillo derecho hasta el fondo, justo antes de la pared. Ahí exponemos las bicis revisadas.',
    'Al final del pasillo derecho, antes de llegar a la pared. Son bicis revisadas, de exposición.',
  ] },
  { id: 'advice-fitness-casa', section: 'fitness', kind: 'advice', ref: 'fitness-casa', variations: [
    'Con una esterilla y una banda ya puedes entrenar en casa sin llenar el salón.',
    'Para arrancar en casa basta una esterilla y una banda elástica. Ocupan poco y dan para mucho.',
    'Empieza con lo mínimo: esterilla y banda. Con eso entrenas en un rincón del salón.',
  ] },
  { id: 'advice-fitness-ropa', section: 'fitness', kind: 'advice', ref: 'fitness-ropa', variations: [
    'Camisetas, sudaderas y pantalones están en Sportswear, al fondo, junto a Running y los probadores.',
    'En Sportswear, al fondo: camisetas, sudaderas y pantalones, al lado de Running y de los probadores.',
    'La tienes en Sportswear, hacia el fondo, junto a Running y los probadores. Camisetas, sudaderas y pantalones.',
  ] },
];
