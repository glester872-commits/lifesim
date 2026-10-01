import type { NpcDef, NpcLook } from '../types/game.ts';
import { authoredPerson, GENERATED_LOOKS } from '../systems/Population.ts';
import { PALETTE } from '../config/constants.ts';

const DEFS: readonly NpcDef[] = [
  {
    id: 'vera',
    name: 'Vera',
    cloth: '#5c6fa8',
    clothDark: '#455380',
    hair: PALETTE.hair,
    lines: [
      'Llevas un rato dando vueltas por el barrio.',
      'Yo vengo aquí a pensar. Sale más barato que el café de la esquina.',
      'Si hoy decides algo, que sea una cosa sola. Las demás pueden esperar.',
    ],
  },
  {
    id: 'ada',
    name: 'Ada',
    cloth: '#8c5a6e',
    clothDark: '#6b4353',
    hair: '#4a3b2f',
    lines: [
      'El centro abre a las ocho y cierra cuando les apetece.',
      'Aquí todo el mundo quiere aprenderlo todo a la vez.',
      'Y así acaban: sabiendo un poco de nada.',
    ],
  },
  {
    id: 'nilo',
    name: 'Nilo',
    cloth: '#4f8a7a',
    clothDark: '#3b6659',
    hair: '#241d16',
    lines: [
      'Todavía estoy montando las mesas, pero pasa.',
      'Un café aquí cuesta lo que cuesta media hora de tu día.',
      'Tú verás si te compensa.',
    ],
  },
  {
    id: 'olmo',
    name: 'Olmo',
    cloth: '#a8742f',
    clothDark: '#7e5723',
    hair: '#3a3128',
    lines: [
      'Aquí se monta a las seis y se recoge a las dos.',
      'La gente cree que el mercado es barato. Es rápido, que no es lo mismo.',
      'Tú vienes de Vallesco, ¿no? Se os nota en el paso.',
    ],
  },
  {
    id: 'sira',
    name: 'Sira',
    cloth: '#3f6f78',
    clothDark: '#2f545b',
    hair: '#241f1a',
    lines: [
      'El agua baja sucia, pero baja.',
      'Yo vengo a mirarla cuando tengo que decidir algo.',
      'Nunca me ha respondido, y aun así sigo viniendo.',
    ],
  },
  {
    id: 'tere',
    name: 'Tere',
    cloth: '#8a4c58',
    clothDark: '#6a3a44',
    hair: '#4a3b2f',
    lines: [
      'Llevo la barra desde antes de que pusieran el metro.',
      'Entonces esto era otro barrio. Venía menos gente y se quedaba más rato.',
      'Ahora entran, miran el reloj y se van.',
    ],
  },
  {
    id: 'marco',
    name: 'Marco',
    cloth: '#c9d14a',
    clothDark: '#9aa233',
    hair: '#2b2622',
    lines: [
      'Seguridad. Tú pasa, que no va contigo.',
      'Ocho horas viendo correr a gente para no esperar tres minutos.',
      'Llegan igual. Solo llegan cansados.',
    ],
  },
  {
    id: 'rocio',
    name: 'Rocío',
    cloth: '#c9d14a',
    clothDark: '#9aa233',
    hair: '#4a3b2f',
    lines: [
      'Hoy me toca vestíbulo. Mañana, quién sabe.',
      'Desde aquí se ve quién llega con prisa y quién con miedo a llegar.',
    ],
  },
  {
    id: 'iker',
    name: 'Iker',
    cloth: '#c9d14a',
    clothDark: '#9aa233',
    hair: '#1f1a15',
    lines: [
      'Ribera es tranquila. Casi siempre.',
      'El que corre por el andén no suele llegar antes. Solo llega sudando.',
    ],
  },
  {
    id: 'paula',
    name: 'Paula',
    cloth: '#6b5a8c',
    clothDark: '#4f426b',
    hair: '#33291f',
    lines: [
      'El anterior acaba de irse. Ahora toca esperar.',
      'Aprovecho para no pensar en nada.',
      'Es lo único que hago gratis en todo el día.',
    ],
  },
  {
    id: 'kike',
    name: 'Kike',
    cloth: '#3d6b8a',
    clothDark: '#2d5069',
    hair: '#1f1a15',
    lines: [
      'Vengo del norte. Buen mercado, malos horarios.',
      'Si vas, no te entretengas: recogen a las dos.',
    ],
  },
  {
    id: 'ines',
    name: 'Inés',
    cloth: '#a85a4a',
    clothDark: '#7f4237',
    hair: '#4a3b2f',
    lines: [
      'Llevo bajando aquí desde que abrieron y todavía no me acostumbro al ruido.',
      'Dicen que van a alargar la línea. Llevan diez años diciéndolo.',
    ],
  },
  {
    id: 'dani',
    name: 'Dani',
    cloth: '#4a7d5c',
    clothDark: '#365e44',
    hair: '#241d16',
    lines: [
      'Se me ha ido el último y he tenido que sacar otro billete.',
      'Dos euros por no mirar el reloj.',
    ],
  },
  {
    id: 'nerea',
    name: 'Nerea',
    cloth: '#3f6f78',
    clothDark: '#2f545b',
    hair: '#1f1a15',
    lines: [
      'Esto es Forja. Abrimos a las siete, antes de que la ciudad se despierte.',
      'Aquí la gente viene más por la rutina que por los músculos.',
      'Las cintas del fondo son las que menos fallan.',
    ],
  },
  {
    id: 'ivan',
    name: 'Iván',
    cloth: '#2a2430',
    clothDark: '#1c1822',
    hair: '#6b5a3f',
    lines: [
      'Lo del escaparate es de temporada. Lo de dentro, de siempre.',
      'La ropa dice cosas de ti antes de que abras la boca.',
      'Los probadores están al fondo.',
    ],
  },
  {
    id: 'carmen',
    name: 'Carmen',
    cloth: '#487a59',
    clothDark: '#365c43',
    hair: '#b8b0a4',
    lines: [
      'Si buscas algo, está en el pasillo que no has mirado.',
      'A estas horas sólo viene gente del barrio. Os conozco a todos de vista.',
      'La fruta buena llega los martes.',
    ],
  },
  {
    id: 'tomas',
    name: 'Tomás',
    cloth: '#e8e3da',
    clothDark: '#b9b3a9',
    hair: '#3a3128',
    lines: [
      'Casa Tomás. Menú del día, casero, sin sorpresas.',
      'Mi padre abrió esto cuando la avenida todavía era de dos carriles.',
      'Los de la oficina de enfrente comen aquí casi todos los días.',
    ],
  },
  {
    id: 'julia',
    name: 'Julia',
    cloth: '#565b6b',
    clothDark: '#41454f',
    hair: '#4a3b2f',
    lines: [
      'Edificio Atalaya, planta tres. El resto son despachos cerrados.',
      'Aquí trabaja gente de tres empresas. Nadie sabe muy bien a qué se dedica la de al lado.',
      'Si algún día te llaman para una entrevista, será en esta planta.',
    ],
  },
  {
    // Barbería Nati: lleva el local desde hace veinte años y corta ella.
    id: 'nati',
    name: 'Nati',
    cloth: '#2b2d33',
    clothDark: '#1c1e24',
    sleeves: '#e6e2d8',
    hair: '#8a8078',
    earrings: '#c8c0b0',
    lines: [
      'Veinte años cortando en esta calle. Conozco cada remolino del barrio.',
      'Aquí no se pide cita: se espera, se charla y se sale guapo.',
    ],
  },
  {
    // Tinta Carmen: tatúa desde hace doce años; los dos brazos, a la vista.
    id: 'lia',
    name: 'Lía',
    cloth: '#1c1a22',
    clothDark: '#121016',
    hair: '#b8423a',
    skin: '#e3b692',
    sleeves: '#e3b692',
    trousers: '#232329',
    earrings: '#c8c0b0',
    ink: [{ spot: 'arm-r', color: '#2f4a8c' }, { spot: 'arm-l', color: '#121016' }, { spot: 'neck', color: '#b8423a' }],
    lines: [
      'Aquí se tatúa con cita o con paciencia. Hoy, con paciencia.',
      'Lo que te hagas, que sea porque te lo quieres ver dentro de veinte años.',
    ],
  },
  {
    // Retales: vintage de una sola pieza, escogido prenda a prenda.
    id: 'gus',
    name: 'Gus',
    cloth: '#9a6a3f',
    clothDark: '#74502f',
    hair: '#8a8078',
    trousers: '#3f5a8c',
    cap: '#3f6f5a',
    lines: [
      'Todo lo de aquí ha vivido antes. Por eso dura.',
      'Los sábados vengo con lo del rastro. Llega pronto.',
    ],
  },
  {
    // La Cepa: la vinoteca que abrió donde estaba la obra.
    id: 'bruno',
    name: 'Bruno',
    cloth: '#5a2a30',
    clothDark: '#431f24',
    hair: '#2b2622',
    lines: [
      'Tres años de obra para esto. Ha merecido la pena.',
      'El tinto de la casa es de un pueblo de Toledo. Pregunta y te cuento.',
      'Aquí se viene a hablar bajito. Para gritar, la Órbita.',
    ],
  },
  {
    // Camina por el barrio según la hora: rutina y frases en data/characters.ts.
    id: 'sara',
    name: 'Sara',
    cloth: '#ece6dc',
    clothDark: '#cfc6b8',
    hair: '#5a3824',
    skin: '#c48a64',
    sleeves: '#c48a64',
    trousers: '#b98a52',
    spots: '#3b2a1c',
    longHair: true,
    earrings: '#e8b84a',
    lines: ['¡Vamosss, que hay plan!'],
  },
];

const BY_ID = new Map(DEFS.map((npc) => [npc.id, npc]));

export const NPC_DEFS = DEFS;

export function getNpc(id: string): NpcDef {
  const npc = BY_ID.get(id);
  if (!npc) throw new Error(`NPC desconocido: ${id}`);
  return npc;
}

/**
 * Uniformes del personal anónimo de los locales (data/population.ts los pide
 * por id en `look`): el camarero se distingue del cliente sin leer nada.
 */
export const UNIFORM_LOOKS: readonly NpcLook[] = [
  { id: 'uniforme-sala', cloth: '#efe9df', clothDark: '#c9c1b4', hair: '#2a2430', trousers: '#232329' },
  { id: 'uniforme-gym', cloth: '#b8423a', clothDark: '#8e3029', hair: '#4a3b2f', trousers: '#232329' },
  { id: 'uniforme-tienda', cloth: '#2a2830', clothDark: '#1c1a20', hair: '#6b5a3f', trousers: '#3a3a44' },
  { id: 'uniforme-super', cloth: '#4f7d3a', clothDark: '#3b5e2b', hair: '#241d16', trousers: '#33374a' },
  { id: 'uniforme-noche', cloth: '#1c1a22', clothDark: '#121016', hair: '#1a1614', trousers: '#1c1a22' },
  { id: 'dj', cloth: '#ff6ab8', clothDark: '#b84a86', hair: '#8ff0ff', trousers: '#1c1a22' },
  { id: 'uniforme-barbero', cloth: '#2b2d33', clothDark: '#1c1e24', hair: '#241d16', trousers: '#3a3a44', sleeves: '#e6e2d8' },
  // Estudio de tatuaje: negro, brazos al aire y tinta a la vista.
  { id: 'uniforme-tatuaje', cloth: '#232329', clothDark: '#18181c', hair: '#1f1a15', skin: '#d3a17c', sleeves: '#d3a17c', trousers: '#2b2d33', ink: [{ spot: 'arm-r', color: '#121016' }, { spot: 'arm-l', color: '#2f4a8c' }] },
  // Tiendas de la Calle del Carmen: cada una con su gente detrás de la caja.
  { id: 'uniforme-archivo', cloth: '#e6e0d4', clothDark: '#c4bdb0', hair: '#1f1a15', trousers: '#2b2d33', cap: '#232329' },
  { id: 'uniforme-vuelta', cloth: '#4f7d3a', clothDark: '#3b5e2b', hair: '#6b5a3f', trousers: '#4f6a8c' },
  // Salón Recreativo Nova: camiseta violeta con el neón del local.
  { id: 'uniforme-arcade', cloth: '#5a3f9a', clothDark: '#42306f', hair: '#2a2830', trousers: '#232329' },
];

/**
 * Pasajeros anónimos de las estaciones. Sin nombre ni diálogo: son ambiente y
 * no se ofrecen como interactuables (nada de afordancias vacías).
 */
/** Las caras de siempre: pasajero-N (las de la pelea, entre ellas). */
export const AUTHORED_PASSENGERS: readonly NpcLook[] = [
  { id: 'pasajero-1', cloth: '#7a6a52', clothDark: '#5c503e', hair: '#2a2430' },
  { id: 'pasajero-2', cloth: '#5a7a8c', clothDark: '#435c69', hair: '#4a3b2f' },
  { id: 'pasajero-3', cloth: '#8c4f4f', clothDark: '#693b3b', hair: '#1f1a15' },
  { id: 'pasajero-4', style: 'sport', cloth: '#56705a', clothDark: '#415443', hair: '#6b5a3f' },
  { id: 'pasajero-5', cloth: '#6f5a86', clothDark: '#534364', hair: '#241d16' },
  { id: 'pasajero-6', cloth: '#9a8a6a', clothDark: '#74674f', hair: '#33291f' },
  { id: 'pasajero-7', style: 'smart', cloth: '#3f5d78', clothDark: '#2f465a', hair: '#2b2622' },
  { id: 'pasajero-8', cloth: '#a0664a', clothDark: '#784c37', hair: '#3a3128' },
  { id: 'pasajero-9', style: 'smart', cloth: '#4d4d5c', clothDark: '#393945', hair: '#b8b0a4' },
  { id: 'pasajero-10', cloth: '#8a7a3f', clothDark: '#675b2f', hair: '#241d16' },
  { id: 'pasajero-11', style: 'sport', cloth: '#5c8a7a', clothDark: '#45675b', hair: '#5a3b2a' },
  { id: 'pasajero-12', style: 'street', cloth: '#9a5a78', clothDark: '#74435a', hair: '#2a2430' },
  // Segunda tanda: complementos (bolso, gorra, manga suelta) para que la calle no se repita.
  { id: 'pasajero-13', style: 'smart', cloth: '#d8d2c4', clothDark: '#b3ad9f', hair: '#2a2430', bag: '#5a3a26', trousers: '#2f4563' },
  { id: 'pasajero-14', style: 'street', cloth: '#2f3a4a', clothDark: '#222a36', hair: '#6b5a3f', cap: '#b8423a' },
  { id: 'pasajero-15', style: 'street', cloth: '#c98a3f', clothDark: '#9d6a2f', hair: '#1f1a15', longHair: true, earrings: '#e8c86a' },
  { id: 'pasajero-16', cloth: '#3f6f5a', clothDark: '#2f5444', hair: '#b8b0a4', bag: '#2a2830' },
  { id: 'pasajero-17', style: 'street', cloth: '#e6e0d4', clothDark: '#c4bdb0', hair: '#4a3b2f', sleeves: '#5c6fa8', cap: '#232329' },
  { id: 'pasajero-18', style: 'street', cloth: '#7a3f5a', clothDark: '#5c2f44', hair: '#241d16', bag: '#c9a27a', skin: '#96654a' },
  { id: 'pasajero-19', cloth: '#4f5f8c', clothDark: '#3b4769', hair: '#8a4a2a', longHair: true },
  { id: 'pasajero-20', style: 'smart', cloth: '#6a6d75', clothDark: '#50525a', hair: '#2b2622', cap: '#3f5d78', trousers: '#5b4b3a' },
  { id: 'pasajero-21', cloth: '#b86a5a', clothDark: '#8e5044', hair: '#33291f', bag: '#232329', skin: '#f0caa8' },
  { id: 'pasajero-22', style: 'street', cloth: '#2a2830', clothDark: '#1c1a20', hair: '#c9b27a', earrings: '#d8d2c4', trousers: '#6a6d75' },
  { id: 'pasajero-23', style: 'sport', cloth: '#8aa05a', clothDark: '#687844', hair: '#3a3128', sleeves: '#e6e0d4', bag: '#7b5a3d' },
  { id: 'pasajero-24', style: 'street', cloth: '#5a4a7a', clothDark: '#43375c', hair: '#1f1a15', cap: '#e6e0d4', skin: '#b98462' },
];

/**
 * Toda la gente anónima (calle, locales, metro): las caras de siempre, con su
 * cuerpo (menos quien pelea: su dibujo no se toca), y detrás la gente nueva de
 * systems/Population.ts. El índice es su identidad (systems/People.ts).
 */
export const PASSENGER_LOOKS: readonly NpcLook[] = [
  ...AUTHORED_PASSENGERS.map((l) => ({ ...l, ...authoredPerson(l.id).body })),
  ...GENERATED_LOOKS,
];
