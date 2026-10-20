/**
 * Estudios: una habilidad, el curso que la enseña, los sitios de la ciudad
 * donde se practica y el primer encargo que abre. Sólo datos; las reglas
 * (calendario, asistencia, rendimientos, prueba, plazos) están en
 * systems/Study.ts y el progreso se guarda con la partida (GameStateData.study).
 *
 * Los sitios se enlazan desde el mapa con `study` (una puerta en BuildingDef o
 * un SpotDef): la ventanilla del curso, un punto de práctica o el sitio del
 * encargo. Otro curso, otra práctica u otro encargo se añaden aquí.
 */

export interface SkillDef {
  id: string;
  name: string;
  /** Nombre del nivel según el conocimiento (0–100), de menos a más. */
  levels: readonly (readonly [number, string])[];
}

export interface Lesson {
  title: string;
  /** Lo que se aprende: da pistas para la prueba final. */
  lines: readonly string[];
}

/** Una decisión con su valor: lo que suma a la prueba o al conocimiento, y por qué. */
export interface StudyChoice {
  label: string;
  points: number;
  line: string;
  /** Minutos de más (o de menos) sobre lo que dura. */
  minutes?: number;
  energy?: number;
}

export interface DemoStep {
  text: string;
  choices: readonly StudyChoice[];
  /** Qué mirar si se falla: se cuenta al explicar el resultado. */
  hint: string;
}

export interface CourseDef {
  id: string;
  skill: string;
  name: string;
  /** Lugar (data/places.ts) y punto de estudio (`study` en el mapa) donde se matricula y se dan las clases. */
  place: string;
  desk: string;
  teacher: string;
  fee: number;
  /** Clases: días (0 lunes … 6 domingo), hora y duración. Empiezan el primero de esos días tras matricularse. */
  days: readonly number[];
  start: number;
  hours: number;
  /** Se entra desde `early` min antes hasta `grace` después; más tarde, la clase se pierde. */
  early: number;
  grace: number;
  /** Tutoría de recuperación: recupera la clase perdida más antigua. */
  recovery: { days: readonly number[]; start: number; hours: number };
  /** Conocimiento que da cada clase (o su recuperación) y lo que cansa. */
  gain: number;
  energy: number;
  minEnergy: number;
  lessons: readonly Lesson[];
  /** La cámara prestada: qué es y sus límites. Se devuelve al entregar el encargo. */
  camera: string;
  /** Prueba final: en el centro, en su horario, una al día. */
  demo: { hours: readonly [number, number]; minutes: number; energy: number; pass: number; steps: readonly DemoStep[] };
  /** El encargo que abre aprobar. */
  gig: string;
}

export interface PracticeSite {
  id: string;
  skill: string;
  name: string;
  text: string;
  /** Franja [desde, hasta) en horas en que se puede (luz). */
  hours: readonly [number, number];
  minutes: number;
  energy: number;
  /** Conocimiento de la primera práctica del día aquí; cada repetición el mismo día, la mitad. */
  gain: number;
  choices: readonly StudyChoice[];
}

export interface GigDef {
  id: string;
  skill: string;
  client: string;
  /** Punto de estudio (`study` en el mapa) donde se hace. */
  site: string;
  place: string;
  pay: number;
  /** Plazo: días tras aceptarlo (el último incluido). */
  days: number;
  /** Se empieza en esta franja [desde, hasta) en horas. */
  hours: readonly [number, number];
  minutes: number;
  energy: number;
  minEnergy: number;
  brief: string;
  choices: readonly StudyChoice[];
  /** Lo que abre entregarlo (un desbloqueo) y cómo se cuenta. */
  unlock: string;
  follow: string;
}

export const SKILLS: readonly SkillDef[] = [
  { id: 'foto', name: 'Fotografía', levels: [[0, 'Sin nociones'], [25, 'Aficionado'], [50, 'Buen ojo'], [80, 'Con oficio']] },
];

export const COURSES: readonly CourseDef[] = [
  {
    id: 'foto-basica',
    skill: 'foto',
    name: 'Fotografía básica · curso de tarde',
    place: 'study-center',
    desk: 'centro-vallesco',
    teacher: 'Inés, la profesora',
    fee: 30,
    days: [1, 3],
    start: 18,
    hours: 2,
    early: 30,
    grace: 15,
    recovery: { days: [5, 6], start: 11, hours: 2 },
    gain: 12,
    energy: -10,
    minEnergy: 15,
    lessons: [
      { title: 'La luz', lines: ['Inés apaga el fluorescente y abre la persiana: «La luz de lado modela; el flash de frente aplasta».', 'Al mediodía las sombras son duras. Por la mañana y a última hora, la luz trabaja por ti.'] },
      { title: 'Encuadre', lines: ['Tercios, líneas y, sobre todo, acercarse: «Si no te gusta la foto, da dos pasos».', 'Nada torcido sin motivo: un horizonte caído parece un error, no un estilo.'] },
      { title: 'Exposición y foco', lines: ['Mides en lo importante y enfocas ahí. Lo demás puede quedar oscuro o borroso.', 'Practicáis en el pasillo con una maceta. La maceta sale muy bien.'] },
      { title: 'Elegir y entregar', lines: ['«Un cliente quiere diez fotos buenas, no ochenta regulares.» Seleccionar también es trabajo.', 'Mismo tono, mismo recorte: que parezcan de la misma persona.'] },
    ],
    camera: 'Te prestan una réflex vieja del centro con un 50 mm. Sólo para el curso: prácticas, la prueba y el encargo de la bolsa. No se vende ni se presta, y se devuelve al entregar el encargo.',
    demo: {
      hours: [10, 20],
      minutes: 90,
      energy: -10,
      pass: 80,
      steps: [
        {
          text: 'Prueba final, 1 de 3. Te toca un bodegón: una taza, un libro y unas gafas. ¿Con qué luz?',
          hint: 'la luz (clase 1)',
          choices: [
            { label: 'Junto a la ventana, luz de lado', points: 10, line: 'La taza tiene volumen y el libro, textura.' },
            { label: 'Bajo el fluorescente del techo', points: 5, line: 'Se ve todo, plano y un poco verde.' },
            { label: 'Con el flash de la cámara', points: 0, line: 'Un brillo blanco en la taza y una sombra negra detrás.' },
          ],
        },
        {
          text: '2 de 3. ¿Cómo encuadras?',
          hint: 'el encuadre (clase 2)',
          choices: [
            { label: 'De lejos y centrado, que se vea todo', points: 5, line: 'Correcto. Sobra mesa.' },
            { label: 'Cerca, la taza en un tercio', points: 10, line: 'El ojo va donde quieres.' },
            { label: 'Inclinas la cámara para darle dinamismo', points: 0, line: 'Inés tuerce la cabeza para mirarla.' },
          ],
        },
        {
          text: '3 de 3. Has hecho cuarenta fotos. ¿Qué entregas?',
          hint: 'elegir y entregar (clase 4)',
          choices: [
            { label: 'Las cuarenta, que elija ella', points: 0, line: '«Esto es una tarjeta de memoria, no una entrega.»' },
            { label: 'La que más te gusta, sola', points: 5, line: 'Buena, pero no hay con qué compararla.' },
            { label: 'Las seis mejores, con el mismo tono', points: 10, line: 'Parecen una serie.' },
          ],
        },
      ],
    },
    gig: 'horno-escaparate',
  },
];

export const PRACTICE_SITES: readonly PracticeSite[] = [
  {
    id: 'foto-fuente',
    skill: 'foto',
    name: 'Plaza de la Fuente',
    text: 'La fuente, el quiosco y la gente que cruza la plaza. Buen sitio para practicar luz y movimiento.',
    hours: [8, 21],
    minutes: 60,
    energy: -8,
    gain: 8,
    choices: [
      { label: 'Repasar las fotos aquí y repetir las que fallan', points: 3, minutes: 20, energy: -2, line: 'A la tercera, la luz del agua sale bien.' },
      { label: 'Probar un encuadre que no dominas', points: 1, line: 'La mitad, torcidas. La otra mitad, mejores que nunca.' },
      { label: 'Disparar rápido y seguir', points: -4, minutes: -20, line: 'Muchas fotos y ninguna pensada.' },
    ],
  },
  {
    id: 'foto-carmen',
    skill: 'foto',
    name: 'Calle del Carmen',
    text: 'Escaparates, murales y terrazas. Al atardecer, la calle se llena de luz naranja.',
    hours: [9, 22],
    minutes: 60,
    energy: -8,
    gain: 8,
    choices: [
      { label: 'Esperar a que alguien pase por delante del mural', points: 3, minutes: 20, energy: -2, line: 'Pasa una chica en bici justo en el tercio. Esa es buena.' },
      { label: 'Fotografiar los escaparates con su reflejo', points: 1, line: 'Medir con tanto reflejo cuesta. Aprendes a qué no apuntar.' },
      { label: 'Disparar rápido y seguir', points: -4, minutes: -20, line: 'Muchas fotos y ninguna pensada.' },
    ],
  },
];

export const GIGS: readonly GigDef[] = [
  {
    id: 'horno-escaparate',
    skill: 'foto',
    client: 'Reme, del Horno San Blas',
    site: 'horno-san-blas',
    place: 'Horno San Blas · Calle Mayor',
    pay: 60,
    days: 3,
    hours: [8, 12],
    minutes: 60,
    energy: -10,
    minEnergy: 20,
    brief: 'Fotos del pan y de las napolitanas para la carta y el escaparate. De mañana, con el horno abierto y la luz entrando.',
    choices: [
      { label: 'Junto al cristal, con la luz de la mañana', points: 10, line: 'El pan brilla sin flash. Reme quiere una para el escaparate y otra para su madre.' },
      { label: 'En el mostrador, bajo los focos', points: 5, line: 'Se ve todo. Las napolitanas, un poco amarillas.' },
      { label: 'Con el flash, que es más rápido', points: 0, line: 'Rápido sí. Las hogazas parecen de plástico.' },
    ],
    unlock: 'foto-producto',
    follow: 'Reme le enseña las fotos a Marta, la encargada del Decathlon, que compra aquí: buscan quien haga fotos de producto. Si trabajas allí, al fichar podrás hacerlas por un plus.',
  },
];

export function getSkill(id: string): SkillDef {
  const s = SKILLS.find((x) => x.id === id);
  if (!s) throw new Error(`Habilidad desconocida: ${id}`);
  return s;
}

export function getCourse(id: string): CourseDef {
  const c = COURSES.find((x) => x.id === id);
  if (!c) throw new Error(`Curso desconocido: ${id}`);
  return c;
}

export function getGig(id: string): GigDef {
  const g = GIGS.find((x) => x.id === id);
  if (!g) throw new Error(`Encargo desconocido: ${id}`);
  return g;
}
