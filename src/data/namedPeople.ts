import type { Fashion, Gender, Interest, Orientation, Presentation, RelationType, Temperament } from './identity.ts';

/**
 * Identidad de los personajes con nombre (data/npcs.ts): escrita a mano y
 * siempre la misma, como la de la gente anónima (systems/Population.ts) pero sin
 * tiradas. Encaja con lo que cada uno ya dice y hace (sus frases, su trabajo, su
 * rutina de data/characters.ts): Tere lleva la barra desde antes del metro, Nati
 * corta pelo hace veinte años, Ada prepara oposiciones con 21.
 *
 * Igual que con la gente anónima, dos cosas separadas:
 *   - aspecto: lo de data/npcs.ts; aquí no hay piel, pelo ni origen;
 *   - comportamiento y vida: edad, intereses, trabajo, relaciones.
 * La orientación es privada: sólo decide con quién puede haber pareja y el
 * jugador la descubre por sus relaciones (con quién ha quedado, quién es su
 * pareja), nunca por un rótulo. El género no fija el aspecto.
 */

export interface NamedIdentity {
  age: number;
  gender: Gender;
  pronouns: 'ella' | 'él' | 'elle';
  /** Si es trans. Privado, como la orientación: sólo lo ve el inspector de desarrollo. */
  trans: boolean;
  presentation: Presentation;
  orientation: Orientation;
  interests: readonly Interest[];
  temperament: Temperament;
  fashion: Fashion;
  /** A qué se dedica, en una frase. */
  work: string;
  /** Dónde vive o pasa el día: Vallesco, Ribera o fuera (pasajeros del metro). */
  from: 'vallesco' | 'ribera' | 'fuera';
}

const w = (age: number, extra: Omit<NamedIdentity, 'age' | 'gender' | 'pronouns'>): NamedIdentity => ({ age, gender: 'woman', pronouns: 'ella', ...extra });
const m = (age: number, extra: Omit<NamedIdentity, 'age' | 'gender' | 'pronouns'>): NamedIdentity => ({ age, gender: 'man', pronouns: 'él', ...extra });

export const NAMED_PEOPLE: Readonly<Record<string, NamedIdentity>> = {
  // Vallesco: con rutina por el barrio.
  sara: w(24, { trans: false, presentation: 'feminine', orientation: 'bisexual', interests: ['fashion', 'photography', 'music', 'nightlife'], temperament: 'extrovertido', fashion: 'vintage', work: 'estudia moda y hace contenido', from: 'vallesco' }),
  ada: w(21, { trans: false, presentation: 'androgynous', orientation: 'lesbian', interests: ['fitness', 'reading', 'football'], temperament: 'reservado', fashion: 'sportswear', work: 'prepara oposiciones', from: 'vallesco' }),
  vera: w(41, { trans: false, presentation: 'feminine', orientation: 'bisexual', interests: ['reading', 'art'], temperament: 'curioso', fashion: 'casual', work: 'ilustradora por su cuenta', from: 'vallesco' }),
  // Vallesco: detrás de cada mostrador.
  nilo: m(33, { trans: false, presentation: 'masculine', orientation: 'heterosexual', interests: ['food', 'music', 'cinema'], temperament: 'extrovertido', fashion: 'casual', work: 'Cafetería Pausa', from: 'vallesco' }),
  nerea: w(30, { trans: false, presentation: 'androgynous', orientation: 'bisexual', interests: ['fitness', 'music'], temperament: 'extrovertido', fashion: 'athletic', work: 'recepción del Gimnasio Forja', from: 'vallesco' }),
  ivan: m(38, { trans: true, presentation: 'masculine', orientation: 'heterosexual', interests: ['fashion', 'art'], temperament: 'curioso', fashion: 'designer', work: 'Hilo · moda', from: 'vallesco' }),
  carmen: w(61, { trans: false, presentation: 'feminine', orientation: 'heterosexual', interests: ['food', 'cinema'], temperament: 'tranquilo', fashion: 'casual', work: 'caja del Súper Rosales', from: 'vallesco' }),
  tomas: m(49, { trans: false, presentation: 'masculine', orientation: 'heterosexual', interests: ['food', 'football'], temperament: 'bromista', fashion: 'formal', work: 'Casa Tomás, el restaurante de su padre', from: 'vallesco' }),
  julia: w(44, { trans: false, presentation: 'feminine', orientation: 'asexual', interests: ['technology', 'reading'], temperament: 'reservado', fashion: 'office', work: 'recepción del Edificio Atalaya', from: 'vallesco' }),
  nati: w(52, { trans: false, presentation: 'androgynous', orientation: 'lesbian', interests: ['music', 'fashion'], temperament: 'extrovertido', fashion: 'casual', work: 'Barbería Nati, desde hace veinte años', from: 'vallesco' }),
  lia: w(34, { trans: true, presentation: 'feminine', orientation: 'bisexual', interests: ['tattoos', 'art', 'music'], temperament: 'tranquilo', fashion: 'alternative', work: 'tatúa en Tinta Carmen', from: 'vallesco' }),
  gus: m(57, { trans: false, presentation: 'masculine', orientation: 'heterosexual', interests: ['fashion', 'music', 'travelling'], temperament: 'curioso', fashion: 'vintage', work: 'Retales, vintage del rastro', from: 'vallesco' }),
  bruno: m(42, { trans: false, presentation: 'masculine', orientation: 'gay', interests: ['food', 'travelling', 'reading'], temperament: 'tranquilo', fashion: 'designer', work: 'La Cepa, su vinoteca', from: 'vallesco' }),
  // Ribera Norte.
  olmo: m(58, { trans: false, presentation: 'masculine', orientation: 'heterosexual', interests: ['food', 'football'], temperament: 'bromista', fashion: 'workwear', work: 'un puesto del mercado de Ribera', from: 'ribera' }),
  sira: w(36, { trans: false, presentation: 'feminine', orientation: 'asexual', interests: ['reading', 'photography', 'art'], temperament: 'reservado', fashion: 'vintage', work: 'archivo municipal', from: 'ribera' }),
  tere: w(63, { trans: false, presentation: 'feminine', orientation: 'heterosexual', interests: ['football', 'cinema'], temperament: 'bromista', fashion: 'casual', work: 'la barra del Bar Ribera', from: 'ribera' }),
  // Metro: seguridad y quien pasa por los andenes.
  marco: m(45, { trans: false, presentation: 'masculine', orientation: 'heterosexual', interests: ['fitness', 'football'], temperament: 'tranquilo', fashion: 'workwear', work: 'seguridad del metro', from: 'vallesco' }),
  rocio: w(31, { trans: false, presentation: 'feminine', orientation: 'bisexual', interests: ['music', 'travelling'], temperament: 'curioso', fashion: 'workwear', work: 'seguridad del metro', from: 'vallesco' }),
  iker: m(26, { trans: false, presentation: 'masculine', orientation: 'heterosexual', interests: ['gaming', 'cycling'], temperament: 'tranquilo', fashion: 'workwear', work: 'seguridad del metro', from: 'ribera' }),
  paula: w(29, { trans: true, presentation: 'feminine', orientation: 'heterosexual', interests: ['reading', 'technology'], temperament: 'reservado', fashion: 'office', work: 'administrativa en el centro', from: 'fuera' }),
  kike: m(52, { trans: false, presentation: 'masculine', orientation: 'gay', interests: ['food', 'travelling'], temperament: 'extrovertido', fashion: 'casual', work: 'vende en los mercados del norte', from: 'fuera' }),
  ines: w(70, { trans: false, presentation: 'feminine', orientation: 'heterosexual', interests: ['cinema', 'reading'], temperament: 'tranquilo', fashion: 'casual', work: 'jubilada', from: 'fuera' }),
  dani: { age: 24, gender: 'nonbinary', pronouns: 'elle', trans: true, presentation: 'androgynous', orientation: 'pansexual', interests: ['music', 'skating', 'gaming'], temperament: 'bromista', fashion: 'streetwear', work: 'estudia y reparte por las tardes', from: 'fuera' },
};

export interface NamedRelationship {
  a: string;
  b: string;
  type: RelationType;
}

/**
 * Lo que son entre sí, escrito a mano. Más amistad y trabajo que pareja; una
 * pareja, un matrimonio, unos hermanos, una ex y un flechazo que no es mutuo
 * (de `a` hacia `b`). Las parejas cumplen la misma regla que la gente anónima:
 * atracción por los dos lados (scripts/check-population.ts lo comprueba).
 */
export const NAMED_RELATIONSHIPS: readonly NamedRelationship[] = [
  // La noche del viernes la pasan juntas (data/characters.ts, OUTINGS 'noche-viernes').
  { a: 'sara', b: 'ada', type: 'best-friends' },
  { a: 'sara', b: 'dani', type: 'friends' },
  { a: 'ada', b: 'nerea', type: 'friends' },
  { a: 'marco', b: 'rocio', type: 'coworkers' },
  { a: 'marco', b: 'iker', type: 'coworkers' },
  { a: 'rocio', b: 'iker', type: 'coworkers' },
  { a: 'nilo', b: 'ivan', type: 'roommates' },
  { a: 'nati', b: 'lia', type: 'friends' },
  { a: 'olmo', b: 'sira', type: 'friends' },
  { a: 'ines', b: 'carmen', type: 'friends' },
  { a: 'olmo', b: 'carmen', type: 'married' },
  { a: 'bruno', b: 'kike', type: 'couple' },
  { a: 'gus', b: 'tere', type: 'siblings' },
  { a: 'vera', b: 'tomas', type: 'exes' },
  { a: 'tere', b: 'olmo', type: 'acquaintances' },
  { a: 'paula', b: 'iker', type: 'crush' },
];
