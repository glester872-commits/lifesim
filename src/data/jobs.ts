/**
 * Empleos: la oferta, sus niveles y las situaciones de un turno. Sólo datos;
 * las reglas (horario, asistencia, cobro, ascenso) están en systems/Jobs.ts y
 * el progreso del jugador se guarda con la partida (GameStateData.job).
 *
 * Un empleo vive en un sitio (`place`: hoy el Decathlon sin mapa,
 * data/activities.ts OFF_MAP_PLACES); cuando el sitio tenga mapa, la oferta y
 * los turnos se ofrecerán en un punto de su interior sin tocar esto.
 */

export interface JobLevel {
  id: string;
  title: string;
  /** Días de turno (0 lunes … 6 domingo). Los demás son libres. */
  days: readonly number[];
  /** Hora de entrada; el turno dura `hours`. */
  start: number;
  hours: number;
  /** Lo que se cobra por un turno entero. */
  wage: number;
  /** Lo que cansa un turno entero. */
  energy: number;
}

export interface JobChoice {
  label: string;
  /** Rendimiento del turno: suma a la asistencia (−1 … +1). */
  score: number;
  /** Energía de más o de menos sobre la del turno. */
  energy?: number;
  /** Euros de más sobre el sueldo del turno. */
  bonus?: number;
  line: string;
}

/** Algo que pasa en el turno y que se decide antes de hacerlo entero. */
export interface JobSituation {
  id: string;
  text: string;
  choices: readonly JobChoice[];
}

export interface JobDef {
  id: string;
  /** Sitio donde se ficha (id de OFF_MAP_PLACES). */
  place: string;
  employer: string;
  /** Quien contrata y propone el ascenso. Sólo un nombre en el diálogo: no lleva relación aparte. */
  manager: string;
  /** Uniforme (id en UNIFORM_LOOKS, data/npcs.ts) que el jugador lleva en su lugar de trabajo con el turno abierto. */
  uniform?: string;
  /** Cómo se descubre la oferta en el sitio. */
  posting: string;
  /** El turno suelto del sitio (data/activities.ts): sigue abierto sin contrato y se cierra con él. */
  casual: string;
  levels: readonly JobLevel[];
  /** Turnos buenos (puntual y sin fallar) para que te propongan el siguiente nivel. */
  promoteAfter: number;
  /** Faltas sin recuperar con las que te despiden. Cada dos turnos buenos se perdona una. */
  maxStrikes: number;
  /** Energía mínima para fichar. */
  minEnergy: number;
  /** Se ficha desde `early` min antes de la hora; hasta `grace` después es puntual, hasta `late` es tarde y luego, falta. */
  early: number;
  grace: number;
  late: number;
  situations: readonly JobSituation[];
  /** Decisiones de más que se abren con un desbloqueo (systems/Study `unlocks`): salen en cualquier turno. */
  perks?: readonly (JobChoice & { unlock: string })[];
}

export const JOBS: readonly JobDef[] = [
  {
    id: 'decathlon',
    place: 'decathlon',
    employer: 'Decathlon Polígono Norte',
    manager: 'Marta, la encargada',
    uniform: 'decathlon_employee',
    posting: 'Junto a las cajas hay un cartel: «SE BUSCA PERSONAL DE SECCIÓN. Pregunta por Marta».',
    casual: 'work-decathlon',
    levels: [
      { id: 'seccion', title: 'Dependiente de sección', days: [0, 2, 4], start: 10, hours: 6, wage: 60, energy: -35 },
      { id: 'responsable', title: 'Responsable de montaña', days: [1, 3, 5], start: 9, hours: 7, wage: 84, energy: -38 },
    ],
    promoteAfter: 4,
    maxStrikes: 3,
    minEnergy: 30,
    // Tres horas: el sitio no tiene mapa y su menú para el reloj, así que quien llega pronto ficha y espera en la
    // sala de descanso hasta la hora (systems/Jobs.work) en vez de quedarse sin forma de esperar.
    early: 180,
    grace: 10,
    late: 120,
    // Abierto por el encargo de fotografía (data/study.ts): fotos de producto para la web, con plus.
    perks: [
      { unlock: 'foto-producto', label: 'Hacer las fotos de producto para la web (+€15)', score: 1, energy: -4, bonus: 15, line: 'Montas un fondo blanco con una sábana y la luz de la ventana del almacén. Marta las sube esa misma tarde.' },
    ],
    situations: [
      {
        id: 'talla',
        text: 'Un cliente busca unas botas del 46 que no salen en el sistema. Se le nota la prisa.',
        choices: [
          { label: 'Bajar al almacén a buscarlas', score: 1, energy: -6, line: 'Aparecen en una caja mal etiquetada. Se va con las botas y le da las gracias a Marta en voz alta.' },
          { label: 'Ofrecerle pedirlas a otra tienda', score: 0, line: 'Deja su teléfono. Correcto, sin más.' },
          { label: 'Decirle que no quedan', score: -1, line: 'Se va de mal humor. Marta lo ve desde la caja.' },
        ],
      },
      {
        id: 'reponer',
        text: 'Ha llegado un palé de bicis justo cuando se forma cola en la caja de tu sección.',
        choices: [
          { label: 'Atender la cola primero', score: 1, line: 'La cola se deshace en diez minutos. Las bicis esperan; nadie se queja.' },
          { label: 'Montar el palé, que corre prisa', score: 0, energy: -4, line: 'El palé queda perfecto. La cola, menos.' },
          { label: 'Escaquearte un rato al baño', score: -1, energy: 4, line: 'Cinco minutos que se notan. Alguien te cubre a regañadientes.' },
        ],
      },
      {
        id: 'compi',
        text: 'Un compañero nuevo no sabe cerrar una devolución y está bloqueando la caja.',
        choices: [
          { label: 'Enseñarle paso a paso', score: 1, energy: -3, line: 'A la segunda le sale solo. Te invita a un café de la máquina.' },
          { label: 'Hacerla tú y seguir', score: 0, line: 'Resuelto en un minuto. Él sigue sin saber hacerla.' },
          { label: 'Llamar a Marta', score: -1, line: 'Marta viene, la cierra y te mira: «Esto lo sabías hacer tú».' },
        ],
      },
      {
        id: 'inventario',
        text: 'Toca recuento de la sección de camping antes del cierre y faltan unidades.',
        choices: [
          { label: 'Recontar estantería por estantería', score: 1, energy: -5, line: 'Estaban en el expositor. El recuento cuadra.' },
          { label: 'Apuntar la diferencia y avisar', score: 0, line: 'Queda anotado para mañana.' },
          { label: 'Cuadrarlo a ojo', score: -1, line: 'El número cuadra en el papel. Ya veremos el lunes.' },
        ],
      },
    ],
  },
];

export function getJob(id: string): JobDef {
  const job = JOBS.find((j) => j.id === id);
  if (!job) throw new Error(`Empleo desconocido: ${id}`);
  return job;
}

export const jobAt = (place: string): JobDef | undefined => JOBS.find((j) => j.place === place);
