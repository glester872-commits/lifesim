import type { LocationDef, PointDef } from '../types/game.ts';

/** Anexo de Forja, Vallesco. Las cuerdas son colisiones reales; sólo se entra al ring por su puerta sur. */
const W = 28, H = 20;
const ground = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => {
  if (y < 2 || y === H - 1 || x === 0 || x === W - 1) return 'W';
  if (y === H - 2) return x === 14 ? 'D' : 'W';
  if (x >= 2 && x <= 12 && y >= 4 && y <= 12) {
    if ((y === 4 || y === 12) && !(y === 12 && x === 7)) return 'S';
    if (x === 2 || x === 12) return 'L';
    return 'B';
  }
  return y >= 15 ? 't' : 'm';
}).join(''));
const use = (tx: number, ty: number, station: string, facing: PointDef['facing'] = 'up'): PointDef => ({ tx, ty, kind: 'interact', facing, use: station });
export const BOXING: LocationDef = {
  id: 'boxing', name: 'Club de Boxeo Forja · Vallesco', kind: 'interior', ground, ambient: '#e5e1d5',
  props: [
    { kind: 'boxing-sign', tx: 9, ty: 1 }, { kind: 'clock', tx: 19, ty: 1 },
    ...[2, 12].flatMap(tx => [4, 12].map(ty => ({ kind: 'boxing-post' as const, tx, ty }))),
    ...[18, 22, 25].map(tx => ({ kind: 'boxing-bag' as const, tx, ty: 6 })),
    { kind: 'boxing-rack', tx: 19, ty: 11 },
    { kind: 'yoga-mat', tx: 18, ty: 14 }, { kind: 'yoga-mat', tx: 23, ty: 14 },
    { kind: 'bench', tx: 3, ty: 16 }, { kind: 'bench', tx: 4, ty: 16 },
    { kind: 'cooler', tx: 25, ty: 16 }, { kind: 'gym-bags', tx: 7, ty: 16 },
    { kind: 'mirror', tx: 17, ty: 1 }, { kind: 'mirror', tx: 22, ty: 1 },
    ...[5, 14, 21].map(tx => ({ kind: 'tube-light' as const, tx, ty: 3 })),
  ],
  portals: [{ id: 'exit', tx: 14, ty: 18, label: 'Volver al Gimnasio Forja', to: { location: 'gym', spawn: 'boxing' } }],
  spawns: { entry: { tx: 14, ty: 17, facing: 'up' } }, npcs: [],
  points: {
    BOX_EXIT: { tx: 14, ty: 18, kind: 'exit' },
    BOX_COACH_01: { tx: 15, ty: 10, kind: 'work', facing: 'down' },
    BOX_GUARD_01: use(5, 8, 'boxing-guard', 'right'),
    BOX_FEET_01: use(9, 8, 'boxing-footwork', 'left'),
    BOX_BAG_01: use(18, 7, 'boxing-bag'), BOX_BAG_02: use(22, 7, 'boxing-bag'), BOX_BAG_03: use(25, 7, 'boxing-bag'),
    BOX_COORD_01: use(18, 14, 'boxing-coordination'), BOX_ROPE_01: use(23, 14, 'boxing-resistance'),
    BOX_WATER: use(24, 16, 'water', 'right'),
    BOX_REST_01: { tx: 10, ty: 15, kind: 'wait', facing: 'up' },
    BOX_REST_02: { tx: 11, ty: 15, kind: 'wait', facing: 'up' },
  },
  inspects: [
    { tx: 13, ty: 15, name: 'Clases de boxeo · horario', lines: ['Club de Boxeo Forja. Cada día de 08:00 a 22:00. Sesiones a las horas y a las medias, con cinco minutos para empezar. Cada sesión cuesta €6; material y guantes incluidos. Elige duración en el puesto o habla con Inés.', 'Guardia y pies en el ring; saco, coordinación y resistencia fuera. Sin sparring ni golpes a otras personas. Puedes parar con E o Esc: sólo cuenta lo entrenado. Al recargar se interrumpe la sesión pendiente, sin volver a cobrar ni regalar progreso.'] },
    { tx: 19, ty: 11, name: 'Material del club', lines: ['Guantes prestados, vendas, manoplas y combas. Límpialos y devuélvelos al terminar.'] },
  ],
};

export const BOXING_PROFILE = {
  place: 'boxing', bands: [[8, 12, 'LOW'], [12, 16, 'LOW'], [16, 21, 'MEDIUM'], [21, 22, 'LOW']],
  weekday: [0, 0, 0, 0, 0, 0, -1], maxVisitors: 5,
  staff: [{ service: 'gym-staff', label: 'Inés · entrenadora', line: 'Primero control; después velocidad. La guardia vuelve a casa contigo.', points: ['BOX_COACH_01'], offers: 'boxing-coach' }],
  visitors: [
    { role: 'boxing_bag', label: 'Alumno al saco', line: 'Suelta el aire al golpear. Y vuelve a la guardia.', weight: 3, plan: [
      { state: 'BAG', points: ['BOX_BAG_'], minutes: [8, 15], repeat: [1, 2] },
      { state: 'REST', points: ['BOX_REST_'], minutes: [2, 4] },
      { state: 'FOOTWORK', points: ['BOX_FEET_'], minutes: [6, 10] },
    ] },
    { role: 'boxing_basics', label: 'Alumna practicando técnica', line: 'No cruzar los pies cuesta más de lo que parece. Despacio sale mejor.', weight: 2, plan: [
      { state: 'GUARD', points: ['BOX_GUARD_'], minutes: [7, 12] },
      { state: 'COORDINATION', points: ['BOX_COORD_', 'BOX_ROPE_'], minutes: [6, 10] },
      { state: 'DRINK', points: ['BOX_WATER'], minutes: [1, 2] },
    ] },
  ],
} as const;
