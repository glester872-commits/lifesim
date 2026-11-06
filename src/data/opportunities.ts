/**
 * La primera semana como oportunidades, no como pasos: cada una se ofrece mientras su condición se cumple, sin
 * orden obligatorio, y desaparece al aprovecharla. Rechazar algo (el trabajo, el curso, una invitación) no la quita:
 * sigue aquí, y a veces abre otra (el turno suelto sin contrato). Salvo el ascenso: rechazarlo pone a cero los buenos
 * turnos (decline, systems/Jobs.ts), así que se va y vuelve cuando se acumulan otra vez. Las muestra el móvil (app Hoy)
 * y, sin compromisos, el HUD; sólo señalan personas, sitios y apps que ya existen. Las reglas están en systems/Opportunities.ts.
 *
 * Huecos del texto (los rellena el sistema con los datos de verdad): {empleador}, {parada}, {turno}, {curso},
 * {matricula}, {clases}, {persona}, {ahora}, {mejora}, {precio}, {libre}, {tarjeta}, {jefe}, {nivel}, {sueldo}.
 */

export type OpportunityCond =
  /** `id`: el empleo del que hablan los huecos ({empleador}, {turno}); sin él, el primero. */
  | { job: 'none' | 'active'; id?: string }
  /** Sin tarjeta de transporte, o con menos saldo que una ida y vuelta. */
  | { card: false | 'low' }
  /** `id`: el curso del que se habla (y, con 'active', que sea ese). */
  | { course: 'none' | 'active' | 'done'; id?: string }
  /** Con el folleto de ese curso (su marca de evento) y sin haberlo empezado ni aprobado. */
  | { flyer: string }
  | { goal: false }
  /** Con quien tiene historia: aún sin conocer, conocida sin número, con número y sin plan quedado. */
  | { person: string; stage: 'unmet' | 'met' | 'number' }
  /** La mejora más barata de la casa que no tienes: te llega ya (libre ≥ precio) o hay que ahorrar. */
  | { upgrade: 'affordable' | 'saving' }
  /** Con el ascenso del empleo activo listo para proponerse: buenos turnos, sin faltas y con el curso que pida el nivel. */
  | { promotion: 'ready' };

export interface OpportunityDef {
  id: string;
  /** Todas se cumplen. */
  when: readonly OpportunityCond[];
  title: string;
  text: string;
  /** Dónde se descubre: un sitio del mapa, una parada, una persona o una app del móvil. */
  via: 'place' | 'metro' | 'person' | 'phone';
}

export const OPPORTUNITIES: readonly OpportunityDef[] = [
  {
    id: 'empleo',
    when: [{ job: 'none' }],
    title: 'Trabajo en {empleador}',
    text: 'Buscan personal en {parada} (metro L2): el cartel está junto a las cajas. Turnos {turno}. Sin contrato, el turno suelto también paga.',
    via: 'metro',
  },
  {
    id: 'empleo-oficina',
    when: [{ job: 'none', id: 'atalaya' }],
    title: 'Trabajo en {empleador}',
    text: 'Buscan auxiliar administrativo en el Edificio Atalaya (Vallesco, a pie): la hoja está en recepción, planta 3. Turnos {turno}, horario flexible. Sólo con contrato.',
    via: 'place',
  },
  {
    id: 'ascenso',
    when: [{ promotion: 'ready' }],
    title: 'Ascenso en {empleador}',
    text: '{jefe} quiere hablar contigo: pasas a {nivel}, {sueldo} por turno. Se propone en el puesto, al fichar.',
    via: 'place',
  },
  {
    id: 'tarjeta',
    when: [{ card: false }],
    title: 'Tarjeta de transporte',
    text: 'Sin ella no se sube al metro: en la máquina del vestíbulo de la estación, {tarjeta} con saldo.',
    via: 'place',
  },
  {
    id: 'recarga',
    when: [{ card: 'low' }],
    title: 'Recargar la tarjeta',
    text: 'Te quedan {saldo}: no llega para ir y volver en metro. Se recarga en la máquina del vestíbulo de cualquier estación (o en Decathlon).',
    via: 'place',
  },
  {
    id: 'curso',
    when: [{ course: 'none' }],
    title: '{curso}',
    text: 'En la ventanilla del Centro de estudios (Calle Mayor): {matricula}, {clases}. Se puede matricular cualquier día.',
    via: 'place',
  },
  {
    id: 'folleto',
    when: [{ flyer: 'ofimatica' }],
    title: '{curso}',
    text: 'El folleto del metro: {matricula} con él en la ventanilla del Centro de estudios (Calle Mayor), {clases}. Aprobarlo abre una decisión mejor pagada en el turno de Atalaya Gestión.',
    via: 'place',
  },
  {
    id: 'practica',
    when: [{ course: 'active', id: 'foto-basica' }],
    title: 'Practicar fotografía',
    text: 'Con la cámara del curso, en la fuente de la plaza o en la Calle del Carmen: una hora, y se nota en la prueba.',
    via: 'place',
  },
  {
    id: 'meta',
    when: [{ goal: false }],
    title: 'Elegir una meta de ahorro',
    text: 'En el móvil, Cuentas → Meta: algo de verdad para lo que ahorrar; cada cobro la acerca.',
    via: 'phone',
  },
  {
    id: 'sara-conocer',
    when: [{ person: 'sara', stage: 'unmet' }],
    title: 'Conocer a {persona}',
    text: 'Vive en el barrio y estudia moda. Ahora: {ahora}. Se conoce hablando con ella (E).',
    via: 'person',
  },
  {
    id: 'sara-numero',
    when: [{ person: 'sara', stage: 'met' }],
    title: 'El número de {persona}',
    text: 'Ya os conocéis: hablad un poco más y pídeselo. Ahora: {ahora}.',
    via: 'person',
  },
  {
    id: 'sara-plan',
    when: [{ person: 'sara', stage: 'number' }],
    title: 'Quedar con {persona}',
    text: 'Proponle algo por el móvil (Mensajes) o en persona: queda en uno de sus sitios de siempre.',
    via: 'phone',
  },
  {
    id: 'ada-conocer',
    when: [{ person: 'ada', stage: 'unmet' }],
    title: 'Conocer a {persona}',
    text: 'Prepara oposiciones y entrena. Ahora: {ahora}. Se conoce hablando con ella (E).',
    via: 'person',
  },
  {
    id: 'ada-plan',
    when: [{ person: 'ada', stage: 'number' }],
    title: 'Quedar con {persona}',
    text: 'Proponle algo por el móvil (Mensajes): el parque el fin de semana, por ejemplo.',
    via: 'phone',
  },
  {
    id: 'mejora',
    when: [{ upgrade: 'affordable' }],
    title: 'Mejora para casa: {mejora}',
    text: '{precio} en el ordenador de casa (catálogo del hogar). Te quedarían {libre} libres.',
    via: 'place',
  },
  {
    id: 'mejora-ahorro',
    when: [{ upgrade: 'saving' }],
    title: 'Ahorrar para {mejora}',
    text: 'Cuesta {precio}; libres tienes {libre} (cartera menos lo que debes). Un turno o dos y llega.',
    via: 'phone',
  },
];
