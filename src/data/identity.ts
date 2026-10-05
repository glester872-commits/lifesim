/**
 * Quién es la gente del barrio: identidad, cuerpo, gustos, estilo y relaciones.
 * systems/Population.ts genera con esto a los vecinos y visitantes anónimos
 * (siempre los mismos: semilla fija) y su aspecto (NpcLook).
 *
 * Dos sistemas separados, a propósito:
 *   - Aspecto: piel, pelo, rasgos. Sale de una paleta de ORIGINS que sólo se usa
 *     al pintar a la persona y NO se guarda en su identidad. Nada de
 *     comportamiento puede leerla (lo comprueba scripts/check-population.ts).
 *   - Comportamiento: edad, intereses, estilo, renta, movilidad, relaciones.
 *     Decide a dónde va, con quién y qué dice. Nunca mira el aspecto.
 *
 * La identidad de género no fija el aspecto (hay presentación aparte) y la
 * orientación es privada: sólo cuenta para con quién puede haber pareja, y el
 * jugador la descubre viendo a esa pareja o hablando con ella.
 */

export type Gender = 'woman' | 'man' | 'nonbinary';
export type Presentation = 'feminine' | 'masculine' | 'androgynous';
export type Orientation = 'heterosexual' | 'gay' | 'lesbian' | 'bisexual' | 'pansexual' | 'asexual';
export type Build = 'thin' | 'average' | 'athletic' | 'muscular' | 'stocky' | 'curvy' | 'heavy';
export type Height = 'short' | 'average' | 'tall';
export type Posture = 'upright' | 'relaxed' | 'stooped';
export type Gait = 'brisk' | 'steady' | 'slow';
export type Income = 'low' | 'mid' | 'high';
export type Fashion =
  | 'casual' | 'sportswear' | 'streetwear' | 'vintage' | 'alternative' | 'luxury'
  | 'office' | 'workwear' | 'nightlife' | 'athletic' | 'tourist' | 'formal'
  // Calle del Carmen: lo que más se ve allí, y en cualquier sitio en poca cantidad.
  | 'punk' | 'skate' | 'designer' | 'experimental';
export type Interest =
  | 'football' | 'fashion' | 'gaming' | 'music' | 'nightlife' | 'art' | 'fitness' | 'food'
  | 'technology' | 'photography' | 'tattoos' | 'travelling' | 'reading' | 'cinema' | 'skating' | 'cycling';
export type Temperament = 'extrovertido' | 'tranquilo' | 'reservado' | 'curioso' | 'bromista';

export type RelationType =
  | 'acquaintances' | 'friends' | 'best-friends' | 'couple' | 'married' | 'dating'
  | 'exes' | 'siblings' | 'relatives' | 'coworkers' | 'roommates' | 'crush';
/** Sin relación guardada: desconocidos. */
export type Relation = RelationType | 'strangers';

/** Con quién sale un grupo de la calle (TripRule.bond). */
export type Bond = 'couple' | 'friends' | 'family' | 'coworkers' | 'gym' | 'tourists';

export const INTERESTS: readonly Interest[] = [
  'football', 'fashion', 'gaming', 'music', 'nightlife', 'art', 'fitness', 'food',
  'technology', 'photography', 'tattoos', 'travelling', 'reading', 'cinema', 'skating', 'cycling',
];

// ------------------------------------------------------------- aspecto

/** De clara a muy oscura. Todas pasan por el mismo sombreado y contorno. */
export const SKIN_TONES = [
  '#f3d2b6', '#ecc3a0', '#e3b692', '#d9a47e', '#cf9b76', '#c08560',
  '#b27450', '#9a6244', '#86533a', '#6f4430', '#5a3626', '#46291e',
] as const;

export const HAIR_COLORS = {
  black: '#1a1614', darkest: '#241d16', dark: '#33291f', brown: '#4a3b2f', light: '#6b5a3f',
  auburn: '#7a3f2a', red: '#9a4a2a', darkBlonde: '#9a7a4a', blonde: '#c9b27a', platinum: '#e0d6b8',
  grey: '#8a8580', white: '#d8d4cc',
} as const;
export type HairColor = keyof typeof HAIR_COLORS;
/** Tintes: cualquiera puede llevarlos; más quien viste alternativo o de calle. */
export const DYED_HAIR = ['#8c3f6a', '#3f5d8c', '#5a8a6a', '#b8423a'] as const;

export type HairTexture = 'straight' | 'wavy' | 'curly' | 'coily';

/**
 * Paletas de aspecto por origen: una calle céntrica de Madrid muy mezclada, con
 * los pesos algo aplanados para que con poca gente se vea toda la variedad.
 * Sólo dan piel (rango de SKIN_TONES), textura y color de pelo y nombre; no
 * se guardan en la persona y no pesan en nada de lo que hace.
 */
export interface OriginPalette {
  weight: number;
  skin: readonly [number, number];
  texture: Readonly<Partial<Record<HairTexture, number>>>;
  hair: readonly HairColor[];
  names: { woman: readonly string[]; man: readonly string[] };
}

export const ORIGINS: Readonly<Record<string, OriginPalette>> = {
  spain: {
    weight: 30, skin: [1, 5], texture: { straight: 3, wavy: 3, curly: 1.5 }, hair: ['dark', 'brown', 'black', 'light', 'darkBlonde', 'darkest'],
    names: { woman: ['Lucía', 'Carmen', 'Paula', 'Marta', 'Nerea', 'Inés', 'Rocío', 'Elena', 'Julia', 'Aitana'], man: ['Javier', 'Pablo', 'Hugo', 'Álvaro', 'Sergio', 'Íñigo', 'Manuel', 'Dani', 'Rubén', 'Marcos'] },
  },
  latam: {
    weight: 14, skin: [2, 8], texture: { straight: 3, wavy: 3, curly: 2, coily: 0.5 }, hair: ['black', 'darkest', 'dark', 'brown'],
    names: { woman: ['Valentina', 'Camila', 'Ximena', 'Daniela', 'Luz'], man: ['Mateo', 'Santiago', 'Andrés', 'Diego', 'Luis'] },
  },
  mixed: {
    weight: 9, skin: [2, 10], texture: { straight: 2, wavy: 2, curly: 3, coily: 2 }, hair: ['black', 'darkest', 'dark', 'brown', 'light', 'auburn'],
    names: { woman: ['Maya', 'Lía', 'Aisha', 'Noelia'], man: ['Liam', 'Adrián', 'Samuel', 'Iker'] },
  },
  maghreb: {
    weight: 7, skin: [3, 7], texture: { straight: 2, wavy: 3, curly: 3, coily: 0.5 }, hair: ['black', 'darkest', 'dark'],
    names: { woman: ['Fátima', 'Salma', 'Nadia', 'Yasmina'], man: ['Youssef', 'Karim', 'Hamza', 'Bilal'] },
  },
  eastern: {
    weight: 6, skin: [0, 3], texture: { straight: 4, wavy: 2, curly: 0.5 }, hair: ['blonde', 'light', 'brown', 'darkBlonde', 'platinum'],
    names: { woman: ['Irina', 'Oksana', 'Ana-Maria', 'Katya'], man: ['Andrei', 'Mihai', 'Oleg', 'Tomasz'] },
  },
  subsaharan: {
    weight: 8, skin: [8, 11], texture: { curly: 1, coily: 5 }, hair: ['black', 'darkest'],
    names: { woman: ['Aminata', 'Fatou', 'Adaeze', 'Mariama'], man: ['Moussa', 'Kwame', 'Ibrahima', 'Chidi'] },
  },
  western: {
    weight: 5, skin: [0, 3], texture: { straight: 4, wavy: 2, curly: 1 }, hair: ['blonde', 'light', 'brown', 'red', 'auburn', 'darkBlonde'],
    names: { woman: ['Claire', 'Sophie', 'Hanna', 'Giulia'], man: ['Lukas', 'Tom', 'Matteo', 'Julien'] },
  },
  caribbean: {
    weight: 6, skin: [5, 10], texture: { straight: 1, wavy: 1, curly: 2, coily: 3 }, hair: ['black', 'darkest', 'dark'],
    names: { woman: ['Yanelis', 'Dayana', 'Marisol'], man: ['Yoel', 'Rafael', 'Wilson'] },
  },
  eastasia: {
    weight: 5, skin: [0, 4], texture: { straight: 6, wavy: 1 }, hair: ['black', 'darkest'],
    names: { woman: ['Mei', 'Yuki', 'Ji-woo'], man: ['Wei', 'Hiroshi', 'Min-jun'] },
  },
  southasia: {
    weight: 5, skin: [4, 9], texture: { straight: 4, wavy: 3, curly: 1 }, hair: ['black', 'darkest'],
    names: { woman: ['Priya', 'Ananya', 'Sana'], man: ['Arjun', 'Imran', 'Rahul'] },
  },
  mideast: {
    weight: 5, skin: [2, 6], texture: { straight: 2, wavy: 3, curly: 2 }, hair: ['black', 'darkest', 'dark'],
    names: { woman: ['Layla', 'Noor', 'Dalia'], man: ['Omar', 'Tariq', 'Elias'] },
  },
};

/** Nombres para quien no es ni él ni ella (o no lo dice con el nombre). */
export const NEUTRAL_NAMES = ['Alex', 'Sam', 'Noa', 'Ari', 'Cris', 'Río', 'Eli', 'Dani', 'Kai', 'Nico'] as const;

// ------------------------------------------------------------- estilo

/** Estilo de ropa → estilo de la calle que ya pesan las zonas (data/districts.ts, crowd). */
export const FASHION_STYLE: Readonly<Record<Fashion, import('./districts.ts').LookStyle>> = {
  casual: 'everyday', workwear: 'everyday', tourist: 'everyday',
  office: 'smart', formal: 'smart', luxury: 'smart',
  streetwear: 'street', vintage: 'street', alternative: 'street', nightlife: 'street',
  sportswear: 'sport', athletic: 'sport',
  punk: 'street', skate: 'street', experimental: 'street', designer: 'smart',
};

/** Colores de ropa por estilo: [tela, pantalón]. La silueta la ponen los complementos. */
export const FASHION_CLOTHES: Readonly<Record<Fashion, readonly (readonly [string, string])[]>> = {
  casual: [['#7a6a52', '#2f4563'], ['#5a7a8c', '#33374a'], ['#9a8a6a', '#3f4b3a'], ['#8c4f4f', '#2f4563'], ['#6f8a5a', '#5b4b3a']],
  sportswear: [['#56705a', '#232329'], ['#3f5d8c', '#232329'], ['#b8423a', '#33374a'], ['#e6e0d4', '#232329']],
  streetwear: [['#2a2830', '#6a6d75'], ['#e6e0d4', '#232329'], ['#c98a3f', '#232329'], ['#5a4a7a', '#2f3a4a'], ['#8aa05a', '#1c1a20']],
  vintage: [['#a0664a', '#4f6a8c'], ['#c9a27a', '#5b4b3a'], ['#6a8f4a', '#2f4563'], ['#9a5a78', '#3a3a44']],
  alternative: [['#1c1a22', '#1c1a22'], ['#3f2f3a', '#232329'], ['#2a2830', '#5a3a26']],
  luxury: [['#d8d2c4', '#232329'], ['#3a3a44', '#2b2d33'], ['#8c7a5a', '#d8d2c4'], ['#1c1a22', '#3a3a44']],
  office: [['#3f5d78', '#2b2d33'], ['#d8d2c4', '#33374a'], ['#4d4d5c', '#232329'], ['#e6e2d8', '#3a3a44']],
  workwear: [['#4f6a8c', '#33374a'], ['#c98a3f', '#3f4b3a'], ['#6a6d75', '#5b4b3a']],
  nightlife: [['#1c1a22', '#1c1a22'], ['#8c3f6a', '#1c1a22'], ['#2f3a4a', '#232329'], ['#b8423a', '#1c1a22']],
  athletic: [['#e6e0d4', '#3f5d8c'], ['#3f6f5a', '#232329'], ['#ff8a5a', '#232329']],
  tourist: [['#e6e0d4', '#9a8a6a'], ['#5c8a7a', '#c9b27a'], ['#d8b04a', '#4f6a8c']],
  formal: [['#232329', '#232329'], ['#3a3a44', '#3a3a44'], ['#e6e2d8', '#2b2d33']],
  // Negro, rojo oscuro y poco más; tabla de skate: holgado, tierra y mostaza; diseño: una prenda que manda sobre lo neutro;
  // experimental: colores que no deberían ir juntos y van.
  punk: [['#1c1a22', '#232329'], ['#8c2f2f', '#1c1a22'], ['#2a2830', '#3a3a44'], ['#b8423a', '#232329']],
  skate: [['#c9a27a', '#3f4b3a'], ['#d8b04a', '#33374a'], ['#3f6f78', '#232329'], ['#e6e0d4', '#5b4b3a'], ['#8aa05a', '#232329']],
  designer: [['#d8d2c4', '#232329'], ['#8c7a5a', '#33374a'], ['#232329', '#d8d2c4'], ['#c0493f', '#2b2d33']],
  experimental: [['#ff6ab8', '#33374a'], ['#5ad8ff', '#8c3f6a'], ['#d8b04a', '#3f5d8c'], ['#7a3f5a', '#c9b27a'], ['#3f6f5a', '#ff8a5a']],
};

// ------------------------------------------------------------- comportamiento

/**
 * A qué viajes de la calle (data/streets.ts, TripRule.role) tiende cada cual.
 * Sólo mira edad, intereses, movilidad y si vive aquí: nunca el aspecto, el
 * género ni la orientación.
 *   interests: comparte alguno → ×2,5
 *   ages: fuera del rango → ×0,15
 *   active: pide ir sin bastón
 */
export const ROLE_AFFINITY: Readonly<Record<string, { interests?: readonly Interest[]; ages?: readonly [number, number]; active?: true }>> = {
  commuter: { ages: [18, 66] },
  office: { ages: [20, 66] },
  jogger: { interests: ['fitness', 'football', 'cycling'], ages: [16, 68], active: true },
  gym: { interests: ['fitness', 'football'], ages: [16, 75], active: true },
  park: { interests: ['football', 'fitness', 'reading', 'skating'] },
  reader: { interests: ['reading', 'cinema', 'art'] },
  'park-stroll': { interests: ['photography', 'travelling'] },
  'window-shopper': { interests: ['fashion', 'photography'] },
  'carmen-browse': { interests: ['fashion', 'music', 'art', 'photography', 'tattoos'] },
  'carmen-friends': { interests: ['fashion', 'music', 'art', 'skating'] },
  'carmen-couple': { interests: ['fashion', 'art', 'photography'] },
  'tattoo-client': { interests: ['tattoos', 'art'], ages: [18, 70] },
  terrace: { interests: ['food', 'reading'] },
  'terrace-meal': { interests: ['food'] },
  brunch: { interests: ['food', 'photography'] },
  diner: { interests: ['food'] },
  coffee: { interests: ['food', 'technology'] },
  'club-queue': { interests: ['nightlife', 'music'], ages: [18, 45] },
  'club-goer': { interests: ['nightlife', 'music'], ages: [18, 45] },
  'club-smoke': { interests: ['nightlife', 'music'], ages: [18, 50] },
  'club-leaving': { interests: ['nightlife', 'music'], ages: [18, 50] },
  'night-walker': { ages: [18, 70] },
  // Carmen: quien va de tiendas, de fotos o a la fila de una zapatilla tiene que ver con la ropa y la música; la edad pesa poco.
  'carmen-hang': { interests: ['music', 'skating', 'fashion', 'tattoos', 'art'], ages: [16, 55] },
  'carmen-outfit': { interests: ['fashion', 'photography', 'art'], ages: [16, 45] },
  'carmen-prenight': { interests: ['nightlife', 'music'], ages: [18, 45] },
  'bar-smoke': { ages: [18, 70] },
  'popup-market': { interests: ['fashion', 'art', 'music', 'photography'] },
  'popup-queue': { interests: ['fashion', 'skating', 'technology', 'gaming'], ages: [16, 40] },
  'popup-dj': { interests: ['music', 'nightlife'], ages: [18, 45] },
  'popup-art': { interests: ['art', 'photography', 'cinema', 'reading'] },
  tourist: { interests: ['travelling', 'photography'] },
  // Vida de barrio: los bancos de la mañana son de los mayores; la plaza de madrugada y la fuente de noche, de gente joven; el bar, de adultos.
  'plaza-elders': { ages: [62, 99] },
  'park-elders': { ages: [62, 99] },
  'plaza-evening': { ages: [16, 55] },
  'plaza-night': { ages: [18, 45] },
  'plaza-couple': { ages: [16, 85] },
  'park-couple': { ages: [16, 85] },
  'rincon-breakfast': { ages: [25, 92] },
  'rincon-vermut': { interests: ['food'], ages: [25, 92] },
  'rincon-night': { interests: ['football'], ages: [20, 85] },
  'rincon-smoke': { ages: [18, 80] },
  kiosk: { interests: ['reading'], ages: [30, 99] },
  bakery: { interests: ['food'] },
};

/** Lo que hace en el barrio quien no vive aquí: nada que salga de un portal. */
export const VISITOR_ROLES: ReadonlySet<string> = new Set([
  'tourist', 'stroller', 'passer', 'coffee', 'terrace', 'brunch', 'diner', 'carmen-browse', 'carmen-couple',
  'window-shopper', 'metro-arrival', 'park-stroll', 'carmen-hang', 'carmen-outfit', 'carmen-prenight', 'bar-smoke', 'popup-market', 'popup-queue', 'popup-dj', 'popup-art', 'club-queue', 'club-goer', 'club-smoke', 'club-leaving',
]);

/** Qué relaciones valen para cada tipo de grupo. */
export const BOND_RELATIONS: Readonly<Record<Bond, readonly RelationType[]>> = {
  couple: ['couple', 'married', 'dating'],
  friends: ['best-friends', 'friends', 'roommates'],
  family: ['siblings', 'relatives', 'married'],
  coworkers: ['coworkers'],
  gym: ['best-friends', 'friends', 'coworkers', 'roommates'],
  tourists: ['friends', 'best-friends', 'couple', 'siblings'],
};

/**
 * Lo que dice quien acompaña al hablarle: nombra a con quién va ({n}). Así se
 * descubre quién es pareja de quién, sin decirlo nunca en la interfaz.
 * {hermano}: la palabra según el género de {n}.
 */
export const RELATION_LINES: Readonly<Record<RelationType, readonly string[]>> = {
  couple: ['Llevo con {n} desde el verano. Parece que fue ayer.', 'Hoy elige {n} dónde cenamos. Me da miedo.'],
  married: ['{n} y yo nos casamos en la Junta, aquí al lado.', 'Años con {n} y todavía me hace reír.'],
  dating: ['Es nuestra tercera cita. No se lo digas a {n}.', 'Estoy conociendo a {n}. Va bien. Creo.'],
  'best-friends': ['{n} es lo mejor que me ha dado este barrio.', 'Con {n} no hace falta ni hablar.'],
  friends: ['{n} y yo nos conocemos desde el instituto.', 'Siempre acabo haciendo lo que dice {n}.'],
  roommates: ['Comparto piso con {n}. Friega poco.', 'Vivo con {n}. Nos vemos más en la calle que en casa.'],
  siblings: ['{n} es mi {hermano}. Hoy toca aguantarnos.', 'Salgo con mi {hermano}, {n}. Es una tradición.'],
  relatives: ['{n} es de la familia. Los domingos, paseo.', 'Acompaño a {n}, que es de la familia.'],
  coworkers: ['Trabajo con {n}. Hoy invito yo al menú.', 'Con {n} en la oficina el día pasa antes.'],
  exes: ['{n} y yo lo dejamos. Nos llevamos bien, más o menos.'],
  crush: ['¿{n}? Qué va. Bueno… un poco.'],
  acquaintances: ['Conozco a {n} del portal. De vista.'],
};

/**
 * Lo que cuenta alguien de su gente cuando el jugador le pregunta («Preguntar por su gente», systems/Chat.ts):
 * nombra a la otra persona y lo que son. Así se descubre quién es pareja de quién (y con ello, sin decirlo, a
 * quién quiere), quién vive con quién o quién es familia. El flechazo y los conocidos de vista no se cuentan.
 * {n}: el nombre; {amigo}/{hermano}: la palabra según el género de {n}.
 */
export const TIE_LINES: Readonly<Partial<Record<RelationType, readonly string[]>>> = {
  couple: ['Luego he quedado con {n}, mi pareja. Hoy le toca elegir plan.', 'Mi pareja, {n}, dice que paso demasiado tiempo en la calle. Tiene razón.'],
  married: ['Con {n} me casé hace años. Todavía nos reímos de las mismas tonterías.', 'Voy a por algo de cenar para {n} y para mí. Media vida juntos.'],
  dating: ['Estoy empezando algo con {n}. No digo más, que se gafa.', 'Esta noche tengo una cita con {n}. Estoy de los nervios.'],
  'best-friends': ['{n} es mi {amigo} del alma. Si me ves sin {n}, algo pasa.', 'Con {n} hablo todos los días. De todo y de nada.'],
  friends: ['He quedado luego con {n} y los de siempre.', '{n} me ha liado para algo esta tarde. Ya veremos qué.'],
  roommates: ['Comparto piso con {n}. Hoy le toca fregar. No va a fregar.', 'Vivo con {n}. Nos cruzamos más en la escalera que en casa.'],
  siblings: ['Mi {hermano}, {n}, vive cerca. Los domingos comemos juntos.', '{n} es mi {hermano}. Nos llevamos a temporadas.'],
  relatives: ['Tengo familia aquí: {n}. Por eso acabé viviendo en el barrio.'],
  coworkers: ['Trabajo con {n}. Nos vemos más que a la familia.', 'Mañana tengo turno con {n}. Al menos se hace corto.'],
  exes: ['¿{n}? Lo nuestro se acabó. Bien, ¿eh? Pero se acabó.'],
};
