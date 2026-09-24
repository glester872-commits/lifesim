import type { MetroEventDef } from '../systems/MetroEventManager.ts';

/**
 * Lo que puede pasar durante un viaje en la Línea 2. Casi nunca pasa nada: la
 * probabilidad es por viaje y encima mandan los cooldowns (METRO_EVENT_RULES).
 *
 * El texto no enseña cifras. Dinero y reloj se notan en el HUD; lo demás
 * (flags, gente conocida) queda en la memoria para lo que venga después.
 * El "estrés" de un viaje malo es energía: es el único recurso de ese tipo que existe.
 */
export const METRO_EVENTS: readonly MetroEventDef[] = [
  // ------------------------------------------------------------ ambientales
  {
    id: 'amb-musico',
    name: 'Acordeón',
    description: 'Un músico toca en el vagón. Fuera de hora punta.',
    rarity: 'ambient',
    purpose: ['WORLD_BUILDING'],
    probability: 0.08,
    cooldown: 3,
    conditions: { hours: [10, 22], crowd: ['VERY_LOW', 'LOW', 'NORMAL'] },
    lines: [
      'Un hombre con un acordeón sube al vagón y toca algo lento, casi para sí mismo.',
      'Nadie le da nada. Tampoco nadie se cambia de vagón.',
    ],
    effects: { energy: 2 },
  },
  {
    id: 'amb-canal',
    name: 'El canal',
    description: 'Tramo en superficie al atardecer, sólo hacia Ribera Norte.',
    rarity: 'ambient',
    purpose: ['WORLD_BUILDING'],
    probability: 0.12,
    cooldown: 4,
    conditions: { hours: [18, 21], to: ['ribera-station'] },
    lines: [
      'Antes de Ribera Norte el tren sale unos segundos a la superficie.',
      'El canal está naranja. Medio vagón levanta la vista del móvil a la vez.',
    ],
    effects: { energy: 3 },
  },
  {
    id: 'amb-noche',
    name: 'Último tramo',
    description: 'Vagón casi vacío de noche; pista de que el barrio encarece.',
    rarity: 'ambient',
    purpose: ['WORLD_BUILDING'],
    probability: 0.1,
    cooldown: 3,
    conditions: { hours: [22, 6], crowd: ['VERY_LOW', 'LOW'] },
    lines: [
      'El vagón va casi vacío. Alguien ha dejado un periódico doblado por los anuncios de pisos.',
      'Lo más barato de Vallesco cuesta el doble que hace dos años.',
    ],
  },
  {
    id: 'amb-conversacion',
    name: 'Conversación ajena',
    description: 'Rumor de contrataciones en la oficina de Vallesco. Deja flag para el futuro sistema de trabajo.',
    rarity: 'ambient',
    purpose: ['WORLD_BUILDING', 'CAREER'],
    probability: 0.06,
    cooldown: 0,
    once: true,
    conditions: { hours: [7, 21], weekend: false },
    lines: [
      'Dos personas con la acreditación de la oficina de Vallesco hablan de que van a contratar gente «antes de verano».',
      'Se bajan antes de que oigas más.',
    ],
    effects: { flags: ['rumor:oficina-contrata'] },
  },
  {
    id: 'amb-lleno',
    name: 'Vagón lleno',
    description: 'Hora punta de verdad: trayecto algo más largo y cansado.',
    rarity: 'ambient',
    purpose: ['RESOURCE_MANAGEMENT'],
    probability: 0.12,
    cooldown: 2,
    conditions: { crowd: ['HIGH', 'RUSH_HOUR'] },
    lines: [
      'No cabe nadie más y aun así sube gente. Haces el trayecto de pie, con un codo ajeno en las costillas.',
    ],
    effects: { energy: -3, minutes: 3 },
  },

  // ------------------------------------------------------------- transporte
  {
    id: 'tr-retraso',
    name: 'Parado en el túnel',
    description: 'Retraso sin explicación. Llegas tarde a lo que fuera.',
    rarity: 'ambient',
    purpose: ['RESOURCE_MANAGEMENT', 'RISK'],
    probability: 0.05,
    cooldown: 2,
    lines: [
      'El tren se queda parado en el túnel. Nadie explica nada.',
      'Un rato largo después vuelve a arrancar como si no hubiera pasado nada.',
    ],
    effects: { minutes: 12, energy: -3 },
  },
  {
    id: 'tr-averia',
    name: 'Incidencia técnica',
    description: 'Evacuación a pie por el túnel. Rara y cara en tiempo.',
    rarity: 'important',
    purpose: ['RESOURCE_MANAGEMENT', 'RISK', 'WORLD_BUILDING'],
    probability: 0.012,
    cooldown: 20,
    lines: [
      'Se apagan las luces del vagón. Por megafonía: «incidencia técnica, mantengan la calma».',
      'Al final os hacen bajar y caminar por el pasillo de evacuación hasta la estación.',
    ],
    effects: { minutes: 30, energy: -6 },
  },

  // ----------------------------------------------------------- interactivos
  {
    id: 'int-cartera',
    name: 'La cartera',
    description: 'Inicio de la cadena de Amparo si la devuelves en mano.',
    rarity: 'interactive',
    purpose: ['CHARACTER_DEVELOPMENT', 'RELATIONSHIPS', 'OPPORTUNITY'],
    probability: 0.05,
    cooldown: 0,
    once: true,
    lines: ['A una mujer mayor se le cae la cartera al levantarse. No se ha dado cuenta y ya va hacia la puerta.'],
    choices: [
      {
        id: 'avisar',
        label: 'Avisarle',
        result: ['«¡Señora, la cartera!» Se gira, la recoge y te da las gracias con prisa. Las puertas se cierran detrás de ella.'],
        effects: { flags: ['cartera:avisaste'] },
      },
      {
        id: 'devolver',
        label: 'Recogerla y bajar tras ella',
        result: [
          'Bajas un momento al andén y se la das en la mano. Te mira un segundo más de lo normal.',
          '«Amparo», dice, y te aprieta el brazo. Luego esperas al siguiente tren.',
        ],
        effects: {
          minutes: 8,
          flags: ['cartera:devuelta'],
          npc: { id: 'amparo', name: 'Amparo', affinity: 2 },
          followUps: [{ event: 'enc-amparo-vuelve', afterDays: [20, 40] }],
        },
      },
      {
        id: 'ignorar',
        label: 'No meterte',
        result: ['Alguien más la ve. O no. Cuando vuelves a mirar, la cartera ya no está en el suelo.'],
        effects: { flags: ['cartera:ignoraste'] },
      },
    ],
  },
  {
    id: 'int-asiento',
    name: 'El asiento',
    description: 'Ceder el sitio o no. Pequeño coste de energía, rasgo de carácter.',
    rarity: 'interactive',
    purpose: ['CHARACTER_DEVELOPMENT', 'RESOURCE_MANAGEMENT'],
    probability: 0.05,
    cooldown: 21,
    conditions: { crowd: ['NORMAL', 'HIGH', 'RUSH_HOUR'] },
    lines: ['Consigues sentarte. En la primera curva sube un hombre con bastón y se agarra a la barra justo delante de ti.'],
    choices: [
      {
        id: 'ceder',
        label: 'Ceder el asiento',
        result: ['Te levantas. Él asiente sin decir nada y se sienta con un suspiro largo.'],
        effects: { energy: -2, flags: ['asiento:cedido'] },
      },
      {
        id: 'quedarte',
        label: 'No moverte',
        result: ['Miras el móvil. El trayecto se hace corto; para él, no tanto.'],
        effects: { energy: 2, flags: ['asiento:no-cedido'] },
      },
    ],
  },
  {
    id: 'int-folleto',
    name: 'Folleto',
    description: 'Cursos del centro de estudios. Deja flag para el futuro sistema de estudios.',
    rarity: 'interactive',
    purpose: ['CAREER', 'OPPORTUNITY'],
    probability: 0.05,
    cooldown: 60,
    conditions: { hours: [8, 20], weekend: false },
    lines: ['Una chica reparte folletos por el vagón: cursos de tarde en el centro de estudios de Vallesco, «plazas limitadas».'],
    choices: [
      {
        id: 'coger',
        label: 'Coger uno',
        result: ['Lo doblas y lo guardas. Quizá no signifique nada.'],
        effects: { flags: ['folleto:cursos'] },
      },
      {
        id: 'rechazar',
        label: 'Rechazarlo',
        result: ['Niegas con la cabeza. Ella sigue al siguiente sin perder la sonrisa.'],
      },
    ],
  },
  {
    id: 'int-billete',
    name: 'Dos euros',
    description: 'Un chaval pide para el billete de vuelta. Sólo si te sobra algo.',
    rarity: 'interactive',
    purpose: ['RESOURCE_MANAGEMENT', 'CHARACTER_DEVELOPMENT'],
    probability: 0.04,
    cooldown: 30,
    conditions: { minMoney: 10 },
    lines: ['Un chaval de unos quince años te pregunta, bajito, si le puedes dejar dos euros. Ha perdido el abono y no tiene para volver.'],
    choices: [
      {
        id: 'dar',
        label: 'Darle las monedas',
        result: ['Se las das. «Gracias, en serio», y se baja sin mirar atrás.'],
        effects: { money: -2, flags: ['billete:ayudaste'] },
      },
      {
        id: 'negar',
        label: 'Decir que no llevas',
        result: ['Le dices que no llevas suelto. Asiente como quien ya se lo esperaba.'],
        effects: { flags: ['billete:negaste'] },
      },
    ],
  },

  // ------------------------------------------------------------- encuentros
  {
    id: 'enc-olga',
    name: 'La lectora',
    description: 'Olga, arquitecta. Si hablas con ella, vuelve a aparecer días después.',
    rarity: 'important',
    purpose: ['RELATIONSHIPS', 'WORLD_BUILDING'],
    probability: 0.05,
    cooldown: 0,
    once: true,
    conditions: { hours: [7, 21], weekend: false },
    lines: ['La mujer de al lado lee un libro sobre edificios del barrio que ya no existen. Lo sostiene torcido, como para que veas las fotos.'],
    choices: [
      {
        id: 'preguntar',
        label: 'Preguntarle por uno',
        result: [
          'Habla diez minutos sin parar y se ríe de sí misma al bajar.',
          '«Olga», te dice. «Cojo este tren siempre.»',
        ],
        effects: {
          npc: { id: 'olga', name: 'Olga', affinity: 1 },
          followUps: [{ event: 'enc-olga-reencuentro', afterDays: [3, 12] }],
        },
      },
      {
        id: 'ventana',
        label: 'Mirar por la ventana',
        result: ['En el túnel no hay nada que ver, pero lo miras igual.'],
      },
    ],
  },
  {
    id: 'enc-olga-reencuentro',
    name: 'Otra vez Olga',
    description: 'Continuación de enc-olga. Puede dejar un contacto profesional.',
    rarity: 'important',
    purpose: ['RELATIONSHIPS', 'CAREER', 'OPPORTUNITY'],
    probability: 0.35,
    cooldown: 0,
    once: true,
    followUpOnly: true,
    conditions: { npc: { id: 'olga', minAffinity: 1 } },
    speaker: 'Olga',
    lines: [
      '«¡Anda! Tú otra vez.» Olga se sienta a tu lado sin pedir permiso.',
      'Trabaja en un estudio de arquitectura en Ribera Norte. Dice que andan desbordados.',
    ],
    choices: [
      {
        id: 'interesarte',
        label: 'Preguntar si buscan a alguien',
        result: [
          'Se lo piensa. Luego te apunta su número en el margen de un billete usado.',
          '«No prometo nada. Pero escríbeme.»',
        ],
        effects: { npc: { id: 'olga', name: 'Olga', affinity: 1 }, flags: ['contacto:olga-estudio'] },
      },
      {
        id: 'charlar',
        label: 'Hablar de otra cosa',
        result: ['Habláis del barrio y de lo caro que está todo. Se baja antes que tú y te dice adiós con el libro.'],
        effects: { npc: { id: 'olga', name: 'Olga', affinity: 1 } },
      },
    ],
  },
  {
    id: 'enc-amparo-vuelve',
    name: 'Amparo',
    description: 'Semanas después de devolver la cartera, Amparo te reconoce.',
    rarity: 'important',
    purpose: ['RELATIONSHIPS', 'WORLD_BUILDING'],
    probability: 0.4,
    cooldown: 0,
    once: true,
    followUpOnly: true,
    conditions: { flags: ['cartera:devuelta'] },
    speaker: 'Amparo',
    lines: [
      '«¡Tú!» Una mujer mayor te sujeta del brazo. Tardas un segundo en reconocerla: la de la cartera.',
      'Tiene un puesto de fruta en la plaza de Ribera Norte. Te lo cuenta todo antes de llegar.',
    ],
    effects: {
      npc: { id: 'amparo', name: 'Amparo', affinity: 1 },
      followUps: [{ event: 'enc-amparo-oportunidad', afterDays: [25, 45] }],
    },
  },
  {
    id: 'enc-amparo-oportunidad',
    name: 'Amparo',
    description: 'Cierre de la cadena: recompensa y contacto en el mercado.',
    rarity: 'important',
    purpose: ['OPPORTUNITY', 'CAREER', 'RELATIONSHIPS'],
    probability: 0.4,
    cooldown: 0,
    once: true,
    followUpOnly: true,
    conditions: { npc: { id: 'amparo', minAffinity: 3 } },
    speaker: 'Amparo',
    lines: [
      'Amparo otra vez, con dos bolsas de naranjas. Rebusca en el bolsillo y te tiende un billete de veinte.',
      '«Por lo de la cartera. Y si algún día buscas faena, en el mercado siempre falta alguien que madrugue.»',
    ],
    choices: [
      {
        id: 'aceptar',
        label: 'Aceptarlo',
        result: ['Lo coges. Insiste tanto que negarse habría sido peor.'],
        effects: { money: 20, flags: ['contacto:amparo-mercado'] },
      },
      {
        id: 'rechazar',
        label: 'Decirle que no hace falta',
        result: ['Se guarda el billete, pero te pone una naranja en la mano y no acepta un no.'],
        effects: { energy: 3, npc: { id: 'amparo', name: 'Amparo', affinity: 1 }, flags: ['contacto:amparo-mercado'] },
      },
    ],
  },

  // ------------------------------------------------------------------ raro
  {
    id: 'raro-sobre',
    name: 'El sobre',
    description: 'Dinero ajeno con nota. Muy raro; una sola vez.',
    rarity: 'exceptional',
    purpose: ['RISK', 'CHARACTER_DEVELOPMENT', 'RESOURCE_MANAGEMENT'],
    probability: 0.004,
    cooldown: 0,
    once: true,
    lines: [
      'Bajo el asiento hay un sobre cerrado. Dentro, cincuenta euros y una nota:',
      '«Para el alquiler. No se lo digas a papá.»',
    ],
    choices: [
      {
        id: 'entregar',
        label: 'Dárselo al vigilante',
        result: ['Al bajar se lo das al vigilante. Lo apunta en una libreta, sin mucha fe.'],
        effects: { flags: ['sobre:entregado'] },
      },
      {
        id: 'quedar',
        label: 'Quedártelo',
        result: ['Te lo guardas. Durante el resto del día la nota pesa más que el dinero.'],
        effects: { money: 50, energy: -5, flags: ['sobre:quedado'] },
      },
      {
        id: 'dejar',
        label: 'Dejarlo donde estaba',
        result: ['Lo dejas en su sitio. Que lo encuentre otra persona; tú no quieres esa decisión.'],
        effects: { flags: ['sobre:dejado'] },
      },
    ],
  },
];
