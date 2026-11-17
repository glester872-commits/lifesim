/**
 * CA-05 · La liga de vecinos de Campo Alto, como datos: equipos ficticios del propio barrio, el calendario de una
 * temporada (todos contra todos, una vuelta) y el hueco de la semana en que se juega. Las reglas (fechas, resultados,
 * clasificación) están en systems/League.ts; el tablón del barrio (systems/Boards.ts) la lee de aquí.
 *
 * Domingo de 17 a 19 en la pista del parque: el sábado por la mañana es de los penaltis (data/futsal.ts) y en
 * Campo Alto no hay pop-ups ni artistas de calle que usen la pista. Después, el café (Café Campo Alto, abierto hasta las 21).
 */
export interface LeagueDef {
  id: string;
  location: string;
  name: string;
  venue: string;
  teams: readonly string[];
  /** Jornadas: cada una, sus partidos como [local, visitante] (índices de `teams`). */
  rounds: readonly (readonly (readonly [number, number])[])[];
  /** Día de la semana de la jornada, como weekIndex (0 = lunes … 6 = domingo). */
  weekday: number;
  /** Hora de inicio y de fin de cada partido de la jornada, en horas, en el orden de los partidos. */
  slots: readonly (readonly [number, number])[];
  /** Semanas que dura una temporada: una por jornada y las que sobren, de descanso. */
  seasonWeeks: number;
  /** Goles máximos de un equipo en un partido. */
  maxGoals: number;
}

export const LEAGUES: Readonly<Record<string, LeagueDef>> = {
  'campo-alto': {
    id: 'ca-league',
    location: 'campo-alto',
    name: 'Liga del barrio',
    venue: 'Pista del barrio',
    teams: ['Cuatro Hornos CF', 'Los del Parque', 'Biciclo Atlético', 'Café Esquina'],
    rounds: [
      [[0, 1], [2, 3]],
      [[0, 2], [1, 3]],
      [[0, 3], [1, 2]],
    ],
    weekday: 6,
    slots: [[17, 18], [18, 19]],
    seasonWeeks: 4,
    maxGoals: 6,
  },
};
