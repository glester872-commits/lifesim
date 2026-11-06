/**
 * Empleos: la oferta, sus niveles y las situaciones de un turno. Sólo datos;
 * las reglas (horario, asistencia, cobro, ascenso) están en systems/Jobs.ts y
 * el progreso del jugador se guarda con la partida (GameStateData.job).
 *
 * Un empleo vive en un sitio (`place`: la parada de metro de data/transit.ts, hoy
 * el Polígono Norte de Decathlon); la oferta y los turnos se ofrecen en el
 * fichaje de su interior (data/decathlon.ts, scenes/Menus.openJob).
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
  /** Desbloqueo (systems/Study `unlocks`) que hace falta para que te propongan este nivel. */
  requires?: { unlock: string; label: string };
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
  /** Parada del sitio donde se ficha (id de data/transit.ts STOPS). */
  place: string;
  employer: string;
  /** Quien contrata y propone el ascenso. Sólo un nombre en el diálogo: no lleva relación aparte. */
  manager: string;
  /** Uniforme (id en UNIFORM_LOOKS, data/npcs.ts) que el jugador lleva en su lugar de trabajo con el turno abierto. */
  uniform?: string;
  /** Cómo se descubre la oferta en el sitio. */
  posting: string;
  /** El turno suelto del sitio (data/activities.ts): sigue abierto sin contrato y se cierra con él. Sin él, sólo con contrato. */
  casual?: string;
  /** La opción para leer la oferta en el fichaje. */
  offerLabel?: string;
  /** Lo que se ve en el fichaje con contrato (antes de la hora). */
  desk?: string;
  /** Dónde se espera si se ficha antes de la hora; sin él, «en la sala de descanso». */
  waitAt?: string;
  /** Lo que dice quien contrata al firmar (la primera línea; el primer turno lo añade Menus). */
  welcome?: string;
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
  {
    // LV-03: la segunda profesión, en el barrio y a pie (data/interiors.ts `office`, recepción). Distinta de Decathlon:
    // horario flexible (30 min de margen puntual), sin turno suelto (sólo con contrato) y menos cansancio físico.
    id: 'atalaya',
    place: 'office',
    employer: 'Atalaya Gestión',
    manager: 'Lucía, la jefa de administración',
    posting: 'En el mostrador de recepción, una hoja grapada: «ATALAYA GESTIÓN busca auxiliar administrativo. Media jornada, de lunes a viernes. Se valora ofimática. Preguntar por Lucía».',
    offerLabel: 'Leer la hoja de «Auxiliar administrativo»',
    desk: 'Tu tarjeta en el lector de recepción y tu mesa junto a la ventana.',
    waitAt: 'en tu mesa',
    welcome: '«Aquí cada uno organiza su mañana; lo que no puede pasar es que un cliente se quede sin respuesta.»',
    levels: [
      { id: 'auxiliar', title: 'Auxiliar administrativo', days: [0, 1, 2, 3, 4], start: 9, hours: 4, wage: 36, energy: -16 },
      {
        id: 'administrativo', title: 'Administrativo', days: [0, 1, 2, 3, 4], start: 9, hours: 5, wage: 52, energy: -18,
        requires: { unlock: 'ofimatica', label: 'el curso de Ofimática y gestión (centro de estudios de Vallesco)' },
      },
    ],
    promoteAfter: 6,
    maxStrikes: 3,
    minEnergy: 20,
    // Horario flexible: se ficha desde media hora antes y hasta media hora después cuenta como puntual.
    early: 30,
    grace: 30,
    late: 90,
    situations: [
      {
        id: 'correo',
        text: 'Un cliente escribe enfadado: su factura lleva dos semanas sin llegar y amenaza con irse a otra gestoría.',
        choices: [
          { label: 'Llamarle y localizar la factura con él', score: 1, energy: -4, line: 'Estaba en la carpeta de otro cliente con el mismo apellido. Se despide más tranquilo que tú.' },
          { label: 'Contestar con la respuesta tipo', score: 0, line: 'Correcto y frío. Volverá a escribir.' },
          { label: 'Dejarlo para mañana', score: -1, energy: 3, line: 'Lucía lo ve en la bandeja compartida a media mañana.' },
        ],
      },
      {
        id: 'factura',
        text: 'Al cuadrar el trimestre de un autónomo, te sale una diferencia de €120 en el IVA.',
        choices: [
          { label: 'Revisar factura a factura', score: 1, energy: -5, line: 'Una factura duplicada. Lo corriges antes de presentarlo.' },
          { label: 'Avisar a Lucía de la diferencia', score: 0, line: 'Lucía lo apunta: «Luego lo miramos juntos».' },
          { label: 'Presentarlo así', score: -1, line: 'Sale el modelo. El lunes llegará la carta de Hacienda.' },
        ],
      },
      {
        id: 'reunion',
        text: 'La reunión de las diez se alarga y tienes tres trámites que vencen hoy.',
        choices: [
          { label: 'Pedir salir y sacar los trámites', score: 1, line: 'Nadie te lo reprocha; a las doce está todo presentado.' },
          { label: 'Quedarte y tomar notas', score: 0, energy: -3, line: 'Las notas son buenas. Los trámites salen con prisa al final.' },
          { label: 'Quedarte mirando el móvil', score: -1, energy: 2, line: 'Lucía te hace una pregunta y no sabes por dónde va la reunión.' },
        ],
      },
      {
        id: 'archivo',
        text: 'Toca escanear y archivar las cajas de expedientes del año pasado.',
        choices: [
          { label: 'Escanear y nombrar cada archivo', score: 1, energy: -4, bonus: 6, line: 'Dejas el archivo ordenado; Lucía te paga la media hora extra que te ha llevado.' },
          { label: 'Escanear en bloque', score: 0, line: 'Escaneado. Buscar algo ahí dentro será otra historia.' },
          { label: 'Dejar las cajas para otro día', score: -1, line: 'Las cajas siguen junto a tu mesa.' },
        ],
      },
    ],
    // Abierto por el curso de Ofimática y gestión (data/study.ts `ofimatica`): el turno cansa menos y paga un plus.
    perks: [
      { unlock: 'ofimatica', label: 'Llevar el cuadre con la hoja de cálculo (+€8, cansa menos)', score: 1, energy: 6, bonus: 8, line: 'Montas una hoja con fórmulas para el trimestre. Lo que antes era la mañana entera te lleva una hora; Lucía te pide que la compartas.' },
    ],
  },
];

export function getJob(id: string): JobDef {
  const job = JOBS.find((j) => j.id === id);
  if (!job) throw new Error(`Empleo desconocido: ${id}`);
  return job;
}

export const jobAt = (place: string): JobDef | undefined => JOBS.find((j) => j.place === place);
