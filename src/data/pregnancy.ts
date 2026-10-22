/**
 * Vecinas adultas que esperan un bebé (systems/Pregnancy). Son personajes nuevos con su vida (data/characters.ts,
 * data/npcs.ts, data/namedPeople.ts): a nadie que ya existía se le cambia la historia.
 *
 * Duración de las fases: decisión de diseño para que el ciclo se vea en unas semanas de juego, no una afirmación
 * médica. En días de juego desde el inicio:
 *   0–9   early   se nota poco (vientre 1)
 *   10–19 mid     se nota (vientre 2); empiezan las clases de preparación
 *   20–27 late    final (vientre 3); va más despacio y descansa más
 *   28    nace el bebé: hito guardado una sola vez
 *   28–48 post    postparto: casi todo el día en casa y un paseo corto
 *   49–   done    vuelve a su rutina; el bebé sigue en lo que cuenta
 *
 * El inicio se fija el primer día que la partida conoce este sistema: `offset` días antes (con negativo, después).
 * Así una partida antigua no se encuentra a nadie a medias de un embarazo que «empezó» hace meses, y nada se sortea.
 * No hay simulación de crianza: el bebé es un hito y una referencia estable (nombre, día, casa de su madre).
 */

export type Phase = 'waiting' | 'early' | 'mid' | 'late' | 'post' | 'done';

/** Día (desde el inicio) en que empieza cada fase, en orden. */
export const PHASE_STARTS: readonly (readonly [Phase, number])[] = [
  ['early', 0],
  ['mid', 10],
  ['late', 20],
  ['post', 28],
  ['done', 49],
];
/** El día del nacimiento: el que abre el postparto. */
export const BIRTH_DAY = 28;

export interface PregnancyDef {
  npc: string;
  /** Días que ya lleva el primer día que se la ve (negativo: empieza más tarde). */
  offset: number;
  baby: { name: string; /** «una niña», «un niño». */ kind: string };
  /** Lo que comenta según la fase, además de lo de su parada. */
  lines: Readonly<Partial<Record<Phase, readonly string[]>>>;
}

export const PREGNANCIES: readonly PregnancyDef[] = [
  {
    // Ya se le nota al llegar el jugador.
    npc: 'noa',
    offset: 14,
    baby: { name: 'Alba', kind: 'una niña' },
    lines: {
      mid: ['Los críos del cole ya me preguntan si llevo un balón. Les digo que sí.', 'Los martes voy a la clase de preparación de Forja. Respirar, dicen. Ya respiraba.'],
      late: ['Ya estoy de baja. Paseo, siesta y descafeinado.', 'Me siento en cada banco que veo. Los conozco todos.'],
      post: ['Alba duerme. Yo, no tanto. Diez minutos de aire y subo.'],
      done: ['Alba ya sonríe. A todo el mundo menos a mí, de momento.'],
    },
  },
  {
    // Recién empezado: casi no se nota.
    npc: 'amaia',
    offset: 3,
    baby: { name: 'Leo', kind: 'un niño' },
    lines: {
      early: ['Todavía no se lo he dicho a casi nadie. A ti sí, mira.', 'El café me sienta fatal estos días. Pido manzanilla y me miran raro.'],
      mid: ['Los jueves, clase de preparación en Forja. La monitora es un sol.'],
      late: ['Sigo trabajando, pero sentada y con los pies en alto.', 'Me falta poco. Ya tengo la bolsa hecha junto a la puerta.'],
      post: ['Leo come cada dos horas. Bajo un momento a por aire.'],
      done: ['Leo ya agarra todo lo que pilla. Las gafas, sobre todo.'],
    },
  },
  {
    // Aún no: su embarazo empieza unas semanas después de conocerla.
    npc: 'yasmin',
    offset: -21,
    baby: { name: 'Nour', kind: 'una niña' },
    lines: {
      early: ['Tengo una noticia, pero aún no la cuento. Bueno, a ti sí: estoy embarazada.'],
      mid: ['Los sábados, preparación en Forja. Iker viene y se apunta a todo.'],
      late: ['Me han pasado a consultas, sin turnos de noche. Se agradece.'],
      post: ['Nour no deja dormir a Iker. A mí tampoco, pero él se queja más.'],
      done: ['Nour ya se ríe con Iker. Conmigo se duerme, que también vale.'],
    },
  },
];
