import type { LocationDef, PointDef, PropPlacement } from '../types/game.ts';
import type { PopulationProfile } from './population.ts';
import { at, many, p, room, TWO } from './interiors.ts';

/**
 * HOSP-01 · Hospital General de Vallesco (data/vallesco.ts 'hospital-door', Ronda de la Vía, acera sur). Una sola planta
 * con zonas, como un pabellón: la puerta abre al vestíbulo; a la izquierda, la sala de espera con sus bancadas; a la
 * derecha, admisión con su mostrador y el personal detrás; al norte, tras el tabique, la consulta 1 (la que atiende
 * turnos, systems/Hospital), la consulta 2 (de ambiente) y urgencias con el triaje y la fila de camillas.
 *
 *   x 1–7   consulta 1 (puerta en 4, 10)        x 9–15  consulta 2 (puerta en 12, 10)      x 17–32 urgencias (paso 19–21, 10)
 *   y 11–19 vestíbulo: espera (x 2–9, filas 12 y 14), admisión (mostrador 25–30, 14; personal en la fila 13, cerrado
 *           por el tabique de x 24 y con su paso de personal en 31–32, 14) y la puerta en (17, 20)
 *
 * Nada finge: el mostrador de admisión da turno y la consulta 1 atiende con turno llamado (scenes/Menus, systems/
 * Hospital); la consulta 2 y urgencias se ven trabajar, pero no tienen botón.
 */

const W = 34;
const H = 22;
const DOOR = 17;
const STREET = 'district';
const BUILDING = 'hospital-door';

/** Tabiques: la fila 10 (con las puertas de las consultas y el paso a urgencias), los de entre consultas y el de admisión. */
const WALLS: readonly (readonly [number, number])[] = [
  ...Array.from({ length: W - 2 }, (_, i) => [i + 1, 10] as const).filter(([x]) => x !== 4 && x !== 12 && (x < 19 || x > 21)),
  ...[2, 3, 4, 5, 6, 7, 8, 9].flatMap((y) => [[8, y] as const, [16, y] as const]),
  ...[11, 12, 13].map((y) => [24, y] as const),
];
const WALL_SET = new Set(WALLS.map(([x, y]) => `${x},${y}`));

const GROUND = room(W, H, DOOR, (x, y) => (WALL_SET.has(`${x},${y}`) ? 'W' : 't'));

/** Las bancadas de la espera: tres de dos plazas por fila, con pasillo entre ellas. */
const WAIT_BENCHES: readonly (readonly [number, number])[] = [[2, 12], [5, 12], [8, 12], [2, 14], [5, 14], [8, 14]];
const WAIT_SEATS: readonly (readonly [number, number])[] = WAIT_BENCHES.flatMap(([x, y]) => [[x, y] as const, [x + 1, y] as const]);

/** Las camillas de urgencias contra la pared norte, con su monitor y la cortina que las separa. */
const ER_BEDS = [18, 21, 24, 27] as const;

/** El mobiliario de una consulta con la esquina noroeste en (x0, 2): escritorio, silla del paciente, camilla y lo demás. */
function consulta(x0: number): PropPlacement[] {
  return [
    at('med-cabinet', x0, 3),
    at('desk', x0 + 2, 4),
    at('chair-up', x0 + 2, 5),
    at('sink', x0 + 5, 2),
    // La camilla de exploración con hueco a su izquierda (x0 + 4) para quien atiende.
    at('hosp-bed', x0 + 5, 5),
    at('curtain', x0 + 5, 7),
    at('med-cart', x0, 7),
  ];
}

const PROPS: readonly PropPlacement[] = [
  ...consulta(1),
  ...consulta(9),
  // Urgencias.
  ...ER_BEDS.flatMap((x) => [at('er-bed', x, 3), at('monitor-stand', x + 1, 3)]),
  ...[20, 23, 26].map((x) => at('curtain', x, 3)),
  ...many('counter', [[29, 7], [30, 7], [31, 7]]),
  at('hosp-seat', 17, 8),
  at('med-cart', 32, 3),
  at('sanitizer', 32, 9),
  { kind: 'hosp-sign', tx: 22, ty: 1, variant: 0 },
  // Vestíbulo: la espera, admisión, el reloj, el panel, el gel y las plantas.
  ...WAIT_BENCHES.map(([x, y]) => at('hosp-seat', x, y)),
  ...many('counter', [[25, 14], [26, 14], [27, 14], [28, 14], [29, 14], [30, 14]]),
  // Cada consulta, numerada sobre el tabique a la derecha de su puerta; el rótulo general, junto al paso a urgencias.
  { kind: 'hosp-sign', tx: 5, ty: 10, variant: 3 },
  { kind: 'hosp-sign', tx: 13, ty: 10, variant: 4 },
  { kind: 'hosp-sign', tx: 25, ty: 10, variant: 2 },
  at('clock', 2, 10),
  at('info-board', 21, 18),
  at('sanitizer', 19, 19),
  at('bin', 14, 19),
  ...many('plant', [[1, 19], [32, 19], [1, 16]]),
  // Luz de techo en el vestíbulo y la espera (sólo aquí: en urgencias no hay charcos detrás de los boxes).
  ...many('tube-light', [[5, 16], [12, 13], [20, 15]]),
];

const pts = (pre: string, kind: PointDef['kind'], cells: readonly (readonly [number, number])[], facing?: PointDef['facing']): Record<string, PointDef> =>
  Object.fromEntries(cells.map(([x, y], i) => [`${pre}${TWO(i)}`, p(x, y, kind, facing)]));

export const HOSPITAL: LocationDef = {
  id: 'hospital',
  name: 'Hospital General de Vallesco',
  kind: 'interior',
  ground: GROUND,
  props: PROPS,
  ambient: '#f4f1ea',
  portals: [{ id: 'exit', tx: DOOR, ty: H - 2, label: 'Salir a la Ronda de la Vía', to: { location: STREET, spawn: BUILDING } }],
  spawns: { entry: { tx: DOOR, ty: H - 3, facing: 'up' } },
  npcs: [],
  inspects: [
    {
      tx: 21, ty: 19, name: 'Panel informativo',
      lines: [
        'Consultas externas de 8:00 a 21:00: pida turno en Admisión y espere a que le llamen. Consulta 1 y Consulta 2, al fondo a la izquierda.',
        'Urgencias, 24 horas, por el acceso lateral de la Ronda. En caso de emergencia, llame al 112.',
      ],
    },
    { tx: 24, ty: 4, name: 'Box de urgencias', lines: ['Camillas con barandilla, monitores y cortinas corridas a medias. Aquí sólo pasa el personal y quien trae el triaje.'] },
    { tx: 12, ty: 9, name: 'Consulta 2', lines: ['La puerta está entornada: hay alguien dentro. Esta consulta lleva otra agenda; los turnos de Admisión van a la Consulta 1.'] },
  ],
  points: {
    HOSP_EXIT: p(DOOR, H - 4, 'exit', 'up'),
    // Admisión: el personal detrás del mostrador (fila 13), el público delante (fila 15) y la cola.
    ...pts('HOSP_ADMIN_', 'work', [[26, 13], [29, 13]], 'down'),
    ...pts('HOSP_DESK_', 'interact', [[26, 15], [29, 15]], 'up'),
    ...pts('HOSP_QUEUE_', 'wait', [[27, 17], [28, 18]], 'up'),
    ...pts('HOSP_WAIT_', 'seat', WAIT_SEATS, 'down'),
    // Las consultas: quien atiende, detrás del escritorio; el paciente, en la silla de delante.
    ...pts('HOSP_DOC_', 'work', [[3, 3], [11, 3]], 'down'),
    ...pts('HOSP_PATIENT_', 'seat', [[3, 5], [11, 5]], 'up'),
    // Urgencias: enfermería de una camilla a otra, el triaje y sus dos asientos.
    ...pts('HOSP_NURSE_', 'work', ER_BEDS.map((x) => [x, 4] as const)),
    HOSP_TRIAGE_STAFF: p(30, 6, 'work', 'down'),
    HOSP_TRIAGE_DESK: p(30, 8, 'interact', 'up'),
    ...pts('HOSP_ER_WAIT_', 'seat', [[17, 8], [18, 8]], 'down'),
    HOSP_INFO: p(21, 19, 'interact', 'up'),
  },
};

export const HOSP_INTERIORS: readonly LocationDef[] = [HOSPITAL];

// ------------------------------------------------------------------ gente

export const HOSP_PROFILES: readonly PopulationProfile[] = [
  {
    // Consultas externas: la mañana llena, la tarde a medias. Fin de semana, menos.
    place: 'hospital',
    bands: [[8, 11, 'HIGH'], [11, 14, 'MEDIUM'], [14, 18, 'MEDIUM'], [18, 21, 'LOW']],
    weekday: [0, 0, 0, 0, 0, -1, -2],
    maxVisitors: 12,
    staff: [
      { service: 'receptionist', label: 'Admisión · Hospital General', line: 'Hola. Para consulta, le doy turno y le llamamos.', look: 'uniforme-admin', points: ['HOSP_ADMIN_01'], offers: 'hospital-desk' },
      { service: 'receptionist', label: 'Admisión', line: 'Un momento, que le atiende mi compañera.', look: 'uniforme-admin', points: ['HOSP_ADMIN_02'], minLevel: 'MEDIUM', offers: 'hospital-desk' },
      { service: 'receptionist', label: 'Médica · Consulta 1', line: 'Pase, siéntese. ¿Qué le trae por aquí?', look: 'uniforme-medico', points: ['HOSP_DOC_01'], offers: 'hospital-doctor' },
      { service: 'receptionist', label: 'Médico · Consulta 2', line: 'Ahora mismo estoy con un paciente. Su turno, en Admisión.', look: 'uniforme-medico', points: ['HOSP_DOC_02'] },
      { service: 'shop-worker', label: 'Enfermería · Urgencias', line: 'Disculpe, aquí sólo personal. La espera es fuera.', look: 'uniforme-enfermeria', points: ['HOSP_NURSE_'] },
      { service: 'receptionist', label: 'Triaje · Urgencias', line: 'Dígame qué le pasa y desde cuándo. Le valoramos enseguida.', look: 'uniforme-enfermeria', points: ['HOSP_TRIAGE_STAFF'] },
    ],
    visitors: [
      {
        role: 'patient', label: 'Paciente', line: 'Me han dado el número cuarenta y dos. Van por el treinta.', weight: 3,
        plan: [
          { state: 'CHECK_IN', points: ['HOSP_DESK_'], minutes: [1, 3] },
          { state: 'WAIT', points: ['HOSP_WAIT_'], minutes: [10, 30] },
          { state: 'CONSULT', points: ['HOSP_PATIENT_02'], minutes: [8, 15], chance: 0.5 },
        ],
      },
      {
        role: 'companion', label: 'Acompañante', line: 'Vengo con mi madre. Ella dice que no le pasa nada; por eso vengo.', weight: 2, party: [2, 2],
        plan: [{ state: 'WAIT', points: ['HOSP_WAIT_'], minutes: [15, 40] }],
      },
      {
        role: 'er-patient', label: 'Alguien en urgencias', line: 'Me he torcido el tobillo bajando del autobús. Ya me han mirado.', weight: 1,
        plan: [
          { state: 'CHECK_IN', points: ['HOSP_TRIAGE_DESK'], minutes: [2, 4] },
          { state: 'WAIT', points: ['HOSP_ER_WAIT_'], minutes: [10, 25] },
        ],
      },
    ],
  },
];
