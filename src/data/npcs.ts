import type { NpcDef, NpcLook } from '../types/game.ts';
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
];

const BY_ID = new Map(DEFS.map((npc) => [npc.id, npc]));

export const NPC_DEFS = DEFS;

export function getNpc(id: string): NpcDef {
  const npc = BY_ID.get(id);
  if (!npc) throw new Error(`NPC desconocido: ${id}`);
  return npc;
}

/**
 * Pasajeros anónimos de las estaciones. Sin nombre ni diálogo: son ambiente y
 * no se ofrecen como interactuables (nada de afordancias vacías).
 */
export const PASSENGER_LOOKS: readonly NpcLook[] = [
  { id: 'pasajero-1', cloth: '#7a6a52', clothDark: '#5c503e', hair: '#2a2430' },
  { id: 'pasajero-2', cloth: '#5a7a8c', clothDark: '#435c69', hair: '#4a3b2f' },
  { id: 'pasajero-3', cloth: '#8c4f4f', clothDark: '#693b3b', hair: '#1f1a15' },
  { id: 'pasajero-4', cloth: '#56705a', clothDark: '#415443', hair: '#6b5a3f' },
  { id: 'pasajero-5', cloth: '#6f5a86', clothDark: '#534364', hair: '#241d16' },
  { id: 'pasajero-6', cloth: '#9a8a6a', clothDark: '#74674f', hair: '#33291f' },
  { id: 'pasajero-7', cloth: '#3f5d78', clothDark: '#2f465a', hair: '#2b2622' },
  { id: 'pasajero-8', cloth: '#a0664a', clothDark: '#784c37', hair: '#3a3128' },
  { id: 'pasajero-9', cloth: '#4d4d5c', clothDark: '#393945', hair: '#b8b0a4' },
  { id: 'pasajero-10', cloth: '#8a7a3f', clothDark: '#675b2f', hair: '#241d16' },
  { id: 'pasajero-11', cloth: '#5c8a7a', clothDark: '#45675b', hair: '#5a3b2a' },
  { id: 'pasajero-12', cloth: '#9a5a78', clothDark: '#74435a', hair: '#2a2430' },
];
