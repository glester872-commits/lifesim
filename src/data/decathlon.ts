import type { Facing, InspectDef, LocationDef, PointDef, PropKind, PropPlacement, RackDef } from '../types/game.ts';
import type { PlanStep, PopulationProfile, StaffRole, VisitorRole } from './population.ts';
import { at, p, TWO } from './interiors.ts';
import { cashier, customer } from './cuatroRiosVenues.ts';
import { DECATHLON_LAYOUT, type Rect } from './decathlonLayout.ts';

/**
 * Decathlon · Polígono Norte por dentro (Alpha-07, nave reconstruida en Alpha-08). Desde Alpha-09 tiene calle: se baja
 * del metro en el Polígono Norte (data/poligonoNorte.ts), se cruza la explanada y se entra por la puerta automática de
 * la fachada; la puerta de aquí dentro vuelve a esa explanada. Lo que antes estaba en el menú de la parada se hace
 * dentro: los turnos y el turno suelto, en el fichaje; dar una vuelta, en el punto de información.
 *
 * La planta sigue el plano de la tienda de San Sebastián de los Reyes (design/Decathlon/217426dc…png, correspondencia
 * en design/Decathlon/CORRESPONDENCIA.md): una nave rectangular y continua de 76 × 52 tiles. Al fondo (arriba) raqueta
 * con la pista de pádel, running, probadores, montaña y camping; a la derecha, toda la altura, Segunda Vida y ciclismo;
 * en medio, dos bandas de secciones (calzado, mochilas, agua, escalada, fútbol, caza, pesca…) entre el pasillo norte y
 * el sur; abajo fitness, kayak, golf, salud y natación; y, desde DEC-02, la línea de cajas debajo de natación: seis con
 * cajero y dos de autopago, cada una con su cola delimitada, el pasillo de salida y la puerta abajo a la derecha.
 *
 * La distribución (departamentos, pasillos, cajas y turnos de caja) es data/decathlonLayout.ts; de ahí salen aquí
 * `AISLES`, los mostradores, los puntos de caja y el personal de caja. Los pasillos se pintan con hormigón pulido, nunca
 * llevan mobiliario y forman bucles cerrados. scripts/check-decathlon.ts lo prueba.
 *
 * Quien trabaja aquí lleva el chaleco azul (data/npcs.ts, `decathlon_employee*`): cada cual con su pelo, su piel y su
 * camiseta debajo. El jugador con contrato se lo pone en su turno (data/jobs.ts `uniform`, systems/Jobs.onShift) y
 * ficha en la taquilla del personal, junto a las cajas.
 */
const P = 'DECAT';

export const DECATHLON_W = 76;
export const DECATHLON_H = 52;
/** Columna de la puerta, en la fila H - 2 (abajo a la derecha, como la entrada del plano). */
const DOOR_X = 67;
/** Desde esta fila (la de las colas) sólo es nave la franja de cajas y salida, x 41..74; el resto, muro. */
const CHECKOUT_Y = 44;
const CHECKOUT_X0 = 41;

export type { Rect };
const R = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x0, y0, x1, y1 });

/** Pasillos de circulación (data/decathlonLayout.ts): se pintan de hormigón pulido y no se amueblan nunca. */
export const AISLES: readonly { id: string; name: string; rect: Rect }[] = DECATHLON_LAYOUT.aisles;

/** Índice de familia (color de la leyenda del plano, world/StoreArt SIGN_FAMILIES) del cartel de cada sección. */
/** Gama de producto de las góndolas por familia (world/StoreArt SHELF_SETS): azul, rojo, verde o mezcla. */
const SHELF_SET: Readonly<Record<string, number>> = { montana: 2, fitness: 3, ciclismo: 0, agua: 0, raqueta: 0, running: 1, camping: 2, salud: 1, material: 3, colectivos: 3, naturaleza: 2, golf: 2 };

const FAMILY = { montana: 0, fitness: 1, ciclismo: 2, agua: 3, raqueta: 4, running: 5, camping: 6, salud: 7, material: 8, colectivos: 9, naturaleza: 10, golf: 11 } as const;

export interface Sector {
  id: string;
  name: string;
  /** La etiqueta del plano de la que sale (design/Decathlon/217426dc…png). */
  plan: string;
  family: keyof typeof FAMILY;
  rect: Rect;
  props: readonly PropPlacement[];
  /** Donde se para la gente a mirar: [tx, ty, hacia dónde]. Son los `DECAT_BROWSE_` de clientela y personal. */
  browse: readonly (readonly [number, number, Facing])[];
  /** Lo que se mira con E: el tile del mueble (se llega desde uno de al lado). */
  look: { tx: number; ty: number; lines: readonly string[] };
  /** Cartel colgado: tile izquierdo de su fila base. */
  sign?: readonly [number, number];
}

const col = (kind: PropKind, x: number, y0: number, y1: number): PropPlacement[] => {
  const out: PropPlacement[] = [];
  for (let y = y0; y <= y1; y++) out.push(at(kind, x, y));
  return out;
};
const row = (kind: PropKind, x0: number, x1: number, y: number, skip: readonly number[] = []): PropPlacement[] => {
  const out: PropPlacement[] = [];
  for (let x = x0; x <= x1; x++) if (!skip.includes(x)) out.push(at(kind, x, y));
  return out;
};
const all = (kind: PropKind, cells: readonly (readonly [number, number])[]): PropPlacement[] => cells.map(([x, y]) => at(kind, x, y));

export const SECTORS: readonly Sector[] = [
  // ------------------------------------------------------------------ fondo (arriba), de izquierda a derecha
  {
    id: 'raqueta-padel', name: 'Raqueta · pista de pádel', plan: 'Raqueta (con la pista, arriba a la izquierda)', family: 'raqueta', rect: R(1, 2, 8, 16),
    props: [at('padel-court', 2, 3), at('padel-net', 2, 8), ...all('wall-shelf', [[2, 1], [5, 1]]), ...row('shelf-front', 2, 7, 16)],
    browse: [[4, 15, 'down'], [8, 10, 'left'], [1, 5, 'right']],
    look: { tx: 4, ty: 8, lines: ['Una pista de pádel de verdad, con su cristal y su red, para probar la pala antes de pagarla.', 'Dos chavales llevan media hora «probando». Nadie les dice nada.'] },
    sign: [3, 17],
  },
  {
    id: 'running', name: 'Running', plan: 'Running', family: 'running', rect: R(9, 2, 17, 10),
    props: [...all('sneaker-wall', [[9, 1], [11, 1], [13, 1], [15, 1]]), at('treadmill', 10, 6), ...col('shelf-run', 13, 4, 9), ...col('shelf-run', 16, 4, 9)],
    browse: [[10, 2, 'up'], [14, 6, 'left'], [12, 3, 'up']],
    look: { tx: 13, ty: 1, lines: ['Una pared entera de zapatillas, ordenadas por pisada. Alguien ha dejado una sola, sin su pareja, en la balda de abajo.'] },
    sign: [12, 12],
  },
  {
    id: 'sportswear', name: 'Sportswear', plan: 'Sportswear', family: 'fitness', rect: R(18, 2, 20, 10),
    props: [at('wall-shelf', 18, 1), at('clothes-rack', 18, 5), at('clothes-rack', 18, 8)],
    browse: [[20, 5, 'left'], [20, 8, 'left'], [19, 2, 'up']],
    look: { tx: 18, ty: 1, lines: ['Un mural de camisetas dobladas por colores, de arriba abajo, con el precio en amarillo: «9,99». Parece un catálogo de pintura.'] },
  },
  {
    id: 'probadores', name: 'Probadores', plan: 'Probadores', family: 'fitness', rect: R(21, 2, 25, 10),
    props: [...row('fitting-room', 21, 25, 3)],
    browse: [[23, 7, 'up']],
    look: { tx: 23, ty: 3, lines: ['Cinco cabinas con cortina. En la del medio alguien lleva diez minutos decidiendo entre dos mallas iguales.'] },
  },
  {
    id: 'montana-jr', name: 'Montaña junior', plan: 'Montaña JR', family: 'montana', rect: R(26, 2, 30, 10),
    props: [...all('clothes-rack', [[26, 4], [29, 4], [26, 8], [29, 8]])],
    browse: [[28, 6, 'left'], [27, 9, 'up']],
    look: { tx: 26, ty: 4, lines: ['Chubasqueros de niño en seis colores chillones, para que se les vea desde la otra punta del monte.'] },
    sign: [27, 12],
  },
  {
    id: 'montana-mujer', name: 'Montaña mujer', plan: 'Montaña mujer', family: 'montana', rect: R(31, 2, 37, 10),
    props: [...all('clothes-rack', [[31, 4], [34, 4], [31, 8], [34, 8]]), at('mannequin', 37, 5), ...all('wall-shelf', [[32, 1], [35, 1]])],
    browse: [[33, 6, 'up'], [36, 9, 'up'], [33, 2, 'up']],
    look: { tx: 37, ty: 5, lines: ['Un maniquí con forro polar, pantalón de trekking y bastones. Parece a punto de subir a algún sitio.'] },
    sign: [33, 12],
  },
  {
    id: 'montana-hombre', name: 'Montaña hombre', plan: 'Montaña Hombre', family: 'montana', rect: R(38, 2, 44, 10),
    props: [...all('clothes-rack', [[38, 4], [41, 4], [38, 8], [41, 8]]), at('mannequin', 44, 5), ...all('wall-shelf', [[38, 1], [41, 1]])],
    browse: [[40, 6, 'up'], [43, 9, 'up'], [40, 2, 'up']],
    look: { tx: 41, ty: 4, lines: ['Plumíferos de colores ordenados por gramos de relleno. El más fino cabe en un bolsillo; el más gordo, en ningún sitio.'] },
    sign: [40, 12],
  },
  {
    // DEC-02: se queda también el hueco de mochilas y fútbol (bajaron a la banda central), sin muebles nuevos.
    id: 'camping', name: 'Camping', plan: 'Camping (arriba)', family: 'camping', rect: R(45, 2, 60, 10),
    props: [...all('camping-tent', [[45, 5], [49, 5], [45, 9], [49, 9]]), ...col('shelf-run', 53, 3, 9)],
    browse: [[48, 7, 'up'], [52, 7, 'right'], [46, 10, 'up']],
    look: { tx: 46, ty: 5, lines: ['Tiendas de campaña montadas, con un cartel: «Prueba la tienda: se monta en dos segundos». Tú tardas veinte.'] },
    sign: [48, 12],
  },
  // ------------------------------------------------------------------ columna derecha: Segunda Vida y ciclismo
  {
    id: 'segunda-vida', name: 'Segunda Vida · pro shop', plan: 'Pro shop de segunda vida', family: 'ciclismo', rect: R(63, 2, 74, 12),
    props: [...all('bike-stand', [[63, 4], [67, 4], [71, 4], [63, 8], [67, 8], [71, 8]]), ...all('wall-shelf', [[63, 1], [66, 1], [69, 1], [72, 1]]), ...all('counter', [[64, 11], [65, 11], [66, 11]])],
    browse: [[66, 6, 'right'], [70, 9, 'left'], [65, 12, 'up']],
    look: { tx: 67, ty: 4, lines: ['«Segunda Vida»: bicis revisadas, con su ficha y un precio que se lee dos veces. Una infantil roja todavía lleva ruedines.'] },
    sign: [67, 14],
  },
  {
    id: 'ciclismo', name: 'Ciclismo', plan: 'Ciclismo', family: 'ciclismo', rect: R(63, 15, 74, 33),
    props: [
      ...all('bike-stand', [[63, 17], [67, 17], [63, 21], [67, 21], [63, 25], [67, 25], [63, 29], [67, 29]]),
      ...col('shelf-run', 72, 17, 21), ...col('shelf-run', 72, 24, 29), at('exercise-bike', 73, 32),
    ],
    browse: [[66, 19, 'up'], [70, 23, 'left'], [66, 27, 'up'], [71, 32, 'right']],
    look: { tx: 72, ty: 19, lines: ['Cascos, cámaras de repuesto y luces. La talla de la cámara la pone en el neumático, en números pequeñísimos.'] },
  },
  // ------------------------------------------------------------------ banda central de arriba (entre norte y transversal)
  {
    id: 'raqueta', name: 'Raqueta', plan: 'Raqueta (banda central)', family: 'raqueta', rect: R(11, 14, 20, 20),
    props: [...col('shelf-run', 13, 15, 19), ...col('shelf-run', 16, 15, 19), ...col('shelf-run', 19, 15, 19), at('pillar', 11, 14)],
    browse: [[14, 17, 'left'], [17, 17, 'right'], [20, 16, 'left']],
    look: { tx: 16, ty: 17, lines: ['Palas de pádel colgadas por peso y por forma: redonda, lágrima, diamante. Cada una con su pelota de regalo dentro de la funda.'] },
    sign: [14, 14],
  },
  {
    id: 'agua', name: 'Deportes de agua', plan: 'Dep. Agua', family: 'agua', rect: R(21, 14, 29, 20),
    props: [...all('clothes-rack', [[21, 16], [24, 16], [21, 19], [24, 19]]), ...all('display-table', [[27, 16], [27, 19]]), at('pillar', 29, 14)],
    browse: [[23, 17, 'up'], [26, 17, 'right'], [29, 18, 'left']],
    look: { tx: 27, ty: 16, lines: ['Neoprenos, gafas de buceo y una tabla de paddle surf de pie contra la pared. Huele a goma.'] },
    sign: [24, 14],
  },
  {
    id: 'escalada', name: 'Escalada', plan: 'ESCALADA', family: 'montana', rect: R(32, 14, 33, 20),
    props: [...col('shelf-run', 33, 15, 19), at('pillar', 32, 14)],
    browse: [[32, 17, 'right']],
    look: { tx: 33, ty: 17, lines: ['Cuerdas en rollos de colores, arneses colgados y una caja de magnesio abierta. Alguien ha dejado sus huellas blancas en la balda.'] },
  },
  {
    id: 'calzado-mujer', name: 'Calzado mujer', plan: 'Calzado Mujer', family: 'running', rect: R(34, 14, 39, 20),
    props: [...all('sneaker-wall', [[35, 15], [37, 15], [35, 18], [37, 18]])],
    browse: [[36, 16, 'up'], [38, 19, 'up']],
    look: { tx: 35, ty: 15, lines: ['Zapatillas de montaña, de trail y de calle, una de cada par a la vista. La otra, en el almacén, «ahora te la saco».'] },
    sign: [35, 22],
  },
  {
    id: 'calzado-hombre', name: 'Calzado hombre', plan: 'Calzado Hombre', family: 'running', rect: R(40, 14, 44, 20),
    props: [...all('sneaker-wall', [[40, 15], [42, 15], [40, 18], [42, 18]]), at('pillar', 44, 14)],
    browse: [[41, 16, 'up'], [43, 19, 'up']],
    look: { tx: 42, ty: 18, lines: ['Botas de monte del 39 al 47. Hay un banco para probárselas y una rampa de madera para ver si resbalan.'] },
    sign: [41, 22],
  },
  {
    id: 'camping-2', name: 'Camping', plan: 'Camping (banda central)', family: 'camping', rect: R(47, 14, 53, 20),
    props: [...all('camping-tent', [[47, 16], [51, 16]]), ...row('shelf-front', 47, 53, 19, [50]), at('pillar', 47, 14)],
    browse: [[50, 17, 'up'], [50, 20, 'up']],
    look: { tx: 51, ty: 16, lines: ['Hornillos, linternas frontales y sacos de dormir comprimidos en bolsas del tamaño de un melón.'] },
  },
  // DEC-02: mochilas baja del fondo y comparte el bloque de accesorios (antes 54–60 × 14–20, sólo accesorios).
  {
    id: 'mochilas', name: 'Mochilas', plan: 'mochilas', family: 'montana', rect: R(54, 14, 56, 20),
    props: [...all('backpack-wall', [[54, 16], [54, 19]])],
    browse: [[56, 16, 'left'], [56, 19, 'left']],
    look: { tx: 54, ty: 16, lines: ['Mochilas colgadas por litros, de 10 a 90. La de 40 es la que más se devuelve: la gente se pasa de grande.'] },
    sign: [55, 14],
  },
  {
    id: 'accesorios', name: 'Accesorios', plan: 'accesorios', family: 'colectivos', rect: R(57, 14, 60, 20),
    props: [...all('display-table', [[57, 16], [57, 19]]), ...all('ball-cage', [[60, 16], [60, 18]]), at('pillar', 60, 14)],
    browse: [[59, 16, 'right'], [58, 17, 'up']],
    look: { tx: 57, ty: 16, lines:['Botellas, cintas para el pelo, espinilleras y una cesta de calcetines «técnicos» a tres pares por cinco euros.'] },
    sign: [56, 22],
  },
  // ------------------------------------------------------------------ banda central de abajo (entre transversal y sur)
  {
    id: 'kids', name: 'Niños · underwear', plan: 'Kids / Underwear', family: 'fitness', rect: R(11, 23, 20, 28),
    props: [...all('clothes-rack', [[12, 25], [15, 25], [18, 25], [12, 28], [15, 28], [18, 28]])],
    browse: [[14, 26, 'up'], [17, 27, 'up'], [20, 26, 'left']],
    look: { tx: 15, ty: 25, lines: ['Chándales de niño en tallas por edad. Un padre sostiene dos y le pregunta a nadie cuál crecerá más rápido.'] },
    sign: [14, 30],
  },
  {
    id: 'roller', name: 'Roller', plan: 'Roller', family: 'colectivos', rect: R(21, 23, 24, 28),
    props: [...col('shelf-run', 22, 24, 28), at('display-table', 23, 26)],
    browse: [[23, 24, 'left'], [24, 28, 'up']],
    look: { tx: 22, ty: 25, lines: ['Patines en línea, monopatines y cascos con pegatinas. Un patinete eléctrico de exposición, atado con cadena.'] },
  },
  {
    id: 'baloncesto', name: 'Baloncesto', plan: 'Baloncesto', family: 'colectivos', rect: R(25, 23, 29, 25),
    props: [at('hoop', 27, 24)],
    browse: [[27, 25, 'up'], [29, 24, 'left']],
    look: { tx: 27, ty: 24, lines: ['Una canasta de exposición. El balón de muestra está encima del aro, donde lo ha dejado el último que lo intentó.'] },
    sign: [25, 30],
  },
  // DEC-02: fútbol baja del fondo y se funde con roller y baloncesto (antes 59–60 × 2–10).
  {
    id: 'futbol', name: 'Fútbol', plan: 'Fútbol', family: 'colectivos', rect: R(25, 26, 29, 28),
    props: [...all('ball-cage', [[25, 27], [29, 27]])],
    browse: [[26, 27, 'left'], [28, 27, 'right']],
    look: { tx: 25, ty: 27, lines: ['Una jaula llena de balones. Hay que agacharse para sacar uno, y entonces se caen otros tres.'] },
    sign: [27, 22],
  },
  {
    id: 'minoritarios', name: 'Deportes minoritarios', plan: 'Minoritarios', family: 'montana', rect: R(32, 23, 38, 28),
    props: [...col('shelf-run', 33, 24, 28), ...col('shelf-run', 36, 24, 28)],
    browse: [[34, 26, 'left'], [37, 25, 'left']],
    look: { tx: 36, ty: 26, lines: ['Esgrima, tiro con arco, petanca, bádminton. Un poco de todo y un cartel: «¿No lo encuentras? Lo pedimos».'] },
  },
  {
    id: 'caza', name: 'Caza', plan: 'Caza', family: 'naturaleza', rect: R(39, 23, 44, 28),
    props: [...col('shelf-run', 40, 24, 28), ...col('shelf-run', 43, 24, 28)],
    browse: [[41, 26, 'right'], [44, 25, 'left']],
    look: { tx: 43, ty: 26, lines: ['Chaquetas de camuflaje y botas de agua. En la balda de arriba, prismáticos detrás de un cristal con llave.'] },
    sign: [41, 30],
  },
  {
    id: 'pesca', name: 'Pesca', plan: 'Pesca', family: 'naturaleza', rect: R(47, 23, 53, 28),
    props: [...all('fishing-rods', [[47, 25], [50, 25]]), ...row('shelf-front', 47, 53, 28, [49])],
    browse: [[49, 26, 'up'], [52, 25, 'left']],
    look: { tx: 50, ty: 25, lines: ['Cañas de pie, en fila, de la más corta a la más larga. Debajo, cajones de anzuelos y cebos con nombres de golosina.'] },
    sign: [49, 30],
  },
  {
    id: 'colectivos', name: 'Deportes colectivos', plan: 'Colectivos', family: 'colectivos', rect: R(54, 23, 60, 28),
    props: [...all('ball-cage', [[55, 25], [58, 25]]), ...all('display-table', [[55, 28], [58, 28]])],
    browse: [[57, 26, 'left'], [60, 27, 'left']],
    look: { tx: 58, ty: 25, lines: ['Balones de voleibol, de balonmano y de rugby, y petos de entrenamiento en bolsas de diez.'] },
    sign: [56, 30],
  },
  // ------------------------------------------------------------------ columna izquierda
  {
    id: 'fitness-mujer', name: 'Fitness mujer', plan: 'Fitness mujer', family: 'fitness', rect: R(1, 18, 8, 32),
    props: [...all('clothes-rack', [[2, 20], [5, 20], [2, 24], [5, 24]]), ...all('yoga-mat', [[2, 27], [3, 27], [4, 27]]), ...all('kettlebells', [[2, 30], [5, 30]])],
    browse: [[4, 22, 'up'], [7, 25, 'left'], [4, 28, 'up']],
    look: { tx: 5, ty: 24, lines: ['Mallas, tops y sudaderas de yoga en colores pastel. Hay esterillas extendidas en el suelo para probar cuál resbala menos.'] },
    sign: [3, 33],
  },
  // ------------------------------------------------------------------ banda de abajo (entre sur y cajas)
  {
    id: 'fitness-mat', name: 'Material de fitness', plan: 'Fitness Mat', family: 'material', rect: R(1, 34, 8, 40),
    props: [...all('treadmill', [[2, 36], [4, 36], [6, 36]]), ...all('exercise-bike', [[2, 39], [4, 39]]), at('rower', 6, 39)],
    browse: [[3, 37, 'up'], [7, 37, 'up'], [8, 39, 'left']],
    look: { tx: 4, ty: 36, lines: ['Cintas de correr y bicis estáticas de exposición, enchufadas. Una marca 4,2 km: alguien ha estado aquí un buen rato.'] },
  },
  {
    id: 'fitness-hombre', name: 'Fitness hombre', plan: 'Fitness Hombre', family: 'material', rect: R(11, 33, 19, 40),
    props: [at('weights', 11, 35), at('plate-tree', 15, 35), at('kettlebells', 17, 35), ...all('clothes-rack', [[12, 38], [16, 38]])],
    browse: [[14, 36, 'up'], [15, 39, 'up'], [19, 37, 'left']],
    look: { tx: 12, ty: 35, lines: ['Mancuernas de 1 a 20 kilos y discos en su árbol. Un cartel: «No dejes caer las pesas». Abajo, otro: «Por favor».'] },
    sign: [14, 41],
  },
  {
    id: 'kayak', name: 'Barco y kayak', plan: 'Barco + kayak', family: 'agua', rect: R(20, 33, 25, 40),
    props: [...all('kayak', [[20, 35], [23, 35], [20, 38], [23, 38]])],
    browse: [[22, 36, 'up'], [24, 39, 'up']],
    look: { tx: 21, ty: 35, lines: ['Kayaks sobre caballetes, uno hinchable doblado en su caja y remos de dos palas colgados en la pared del fondo.'] },
    sign: [21, 41],
  },
  {
    id: 'golf', name: 'Golf', plan: 'Golf / Golf Textil', family: 'golf', rect: R(28, 33, 35, 40),
    props: [...all('golf-bag', [[28, 35], [30, 35], [32, 35]]), at('clothes-rack', 34, 35), ...row('shelf-front', 28, 35, 38, [31])],
    browse: [[29, 36, 'up'], [31, 39, 'up'], [33, 36, 'up']],
    look: { tx: 30, ty: 35, lines: ['Bolsas de golf de pie con los palos asomando y una alfombra verde de un metro para practicar el putt.'] },
    sign: [30, 41],
  },
  {
    id: 'equitacion', name: 'Equitación', plan: 'Equitación', family: 'naturaleza', rect: R(36, 33, 39, 40),
    props: [at('clothes-rack', 36, 35), ...row('shelf-front', 36, 39, 38)],
    browse: [[38, 36, 'left'], [37, 39, 'up']],
    look: { tx: 37, ty: 38, lines: ['Cascos de montar, fustas y cepillos para el caballo. Un cliente con botas altas pregunta por una silla de la talla 17.'] },
  },
  {
    id: 'salud', name: 'Salud y accesorios', plan: 'Salud y accesorios', family: 'salud', rect: R(40, 33, 47, 40),
    props: [...row('shelf-front', 40, 47, 35, [44]), ...row('shelf-front', 40, 47, 38, [44])],
    browse: [[42, 36, 'up'], [44, 37, 'up'], [46, 39, 'up']],
    look: { tx: 42, ty: 35, lines: ['Rodilleras, tobilleras, vendas y pulsómetros. Al lado, botes de proteína del tamaño de un cubo.'] },
    sign: [42, 41],
  },
  {
    id: 'natacion', name: 'Swim Pro · natación', plan: 'SWIM PRO', family: 'agua', rect: R(51, 33, 60, 40),
    props: [...all('clothes-rack', [[51, 35], [54, 35], [57, 35]]), ...all('display-table', [[52, 38], [56, 38]]), at('mannequin', 60, 36)],
    browse: [[53, 36, 'up'], [55, 39, 'up'], [59, 37, 'left']],
    look: { tx: 54, ty: 35, lines: ['Bañadores de competición, gorros de silicona y gafas antivaho. Un maniquí con aletas de entrenamiento.'] },
    sign: [54, 41],
  },
];

const CHECKOUTS = DECATHLON_LAYOUT.checkouts;
const STAFFED = CHECKOUTS.filter((c) => c.kind === 'staffed');

/**
 * Las cajas (data/decathlonLayout.ts): con cajero, mostrador y registradora entre quien paga y quien cobra; de autopago,
 * la máquina debajo de quien paga. La taquilla del personal y el punto de información, junto a la puerta.
 */
const FRONT: readonly PropPlacement[] = [
  ...STAFFED.flatMap((c) => [at('counter', c.till.tx + 1, c.till.ty), at('register', c.till.tx + 1, c.till.ty)]),
  ...CHECKOUTS.filter((c) => c.kind === 'self').map((c) => at('register', c.till.tx, c.till.ty + 1)),
  at('lockers', 72, 40),
  // El punto de información, a la derecha de la puerta: se le habla por encima del mostrador.
  ...all('counter', [[66, 40], [67, 40]]),
];

/** Cubos amarillos de promoción al borde del pasillo, como en la foto de raqueta (design/Decathlon/31edf852…png). */
const PROMOS: readonly PropPlacement[] = all('promo-bin', [[17, 10], [11, 20], [34, 20], [60, 20], [20, 28], [44, 40]]);

/** Columnas de la nave en la fila libre entre el pasillo sur y la banda de abajo. */
const PILLARS: readonly PropPlacement[] = all('pillar', [[11, 32], [24, 32], [36, 32], [44, 32], [56, 32]]);

/** Tubos del techo sobre los pasillos largos y el de cajas: la luz de nave, entre los carteles y nunca encima de uno. */
const LIGHTS: readonly PropPlacement[] = [
  ...[17, 21, 30, 37, 45, 52].map((x) => at('tube-light', x, 13)),
  ...[11, 19, 30, 37, 46, 53].map((x) => at('tube-light', x, 31)),
  ...[4, 18, 27, 38, 50, 66].map((x) => at('tube-light', x, 43)),
  ...[18, 26].map((y) => at('tube-light', 69, y)),
];

const inRect = (r: Rect, x: number, y: number): boolean => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
export const inAisle = (x: number, y: number): boolean => AISLES.some((a) => inRect(a.rect, x, y));
/** DEC-01 · La sección que pisa ese tile, o ninguna (pasillo, cajas, muro). */
export const sectorAt = (tx: number, ty: number): Sector | undefined => SECTORS.find((s) => inRect(s.rect, tx, ty));

const QUEUE_TILES = new Set(CHECKOUTS.flatMap((c) => c.queue.map((q) => `${q.tx},${q.ty}`)));

/**
 * Muro arriba (dos filas), a los lados y abajo; la puerta en la penúltima fila. Debajo del pasillo de cajas sólo hay
 * nave en la franja de cajas y salida. Pasillos de hormigón, colas con su cinta amarilla ('e'), fitness de goma.
 */
function ground(): string[] {
  const fitness = SECTORS.find((s) => s.id === 'fitness-mat')!.rect;
  const rows: string[] = [];
  for (let y = 0; y < DECATHLON_H; y++) {
    let r = '';
    for (let x = 0; x < DECATHLON_W; x++) {
      if (y < 2 || y === DECATHLON_H - 1 || x === 0 || x === DECATHLON_W - 1) r += 'W';
      else if (y === DECATHLON_H - 2) r += x === DOOR_X ? 'D' : 'W';
      else if (y >= CHECKOUT_Y && x < CHECKOUT_X0) r += 'W';
      else if (QUEUE_TILES.has(`${x},${y}`)) r += 'e';
      else if (inAisle(x, y)) r += 'h';
      else if (inRect(fitness, x, y)) r += 'm';
      else r += 't';
    }
    rows.push(r);
  }
  return rows;
}

const BROWSE = SECTORS.flatMap((s) => s.browse);
// Crowd resuelve los puestos por prefijo: 010 no debe atraer al vendedor al punto 100.
const browseId = (i: number): string => `${P}_BROWSE_${String(i + 1).padStart(3, '0')}`;
const sectionPoints = (ids: readonly string[]): string[] =>
  SECTORS.filter((s) => ids.includes(s.id)).flatMap((s) => s.browse.map((point) => browseId(BROWSE.indexOf(point))));
const FITTINGS = [21, 22, 23, 24, 25].map((x) => p(x, 4, 'interact', 'up'));
const EXIT = { tx: DOOR_X, ty: DECATHLON_H - 3 };

/** Percheros donde se mira, se prueba y se compra (data/retail.ts `decathlon`): el tile desde el que se habla. */
const RACKS: readonly RackDef[] = [
  { tx: 10, ty: 2, name: 'Zapatillas', store: 'decathlon', categories: ['zapatillas'] },
  { tx: 20, ty: 5, name: 'Camisetas y sudaderas', store: 'decathlon', categories: ['camiseta', 'sudadera'] },
  { tx: 20, ty: 8, name: 'Pantalones de deporte', store: 'decathlon', categories: ['pantalon'] },
];

export const DECATHLON_STORE: LocationDef = {
  id: 'decathlon-tienda',
  name: 'Decathlon · Polígono Norte',
  kind: 'interior',
  ground: ground(),
  props: [
    ...SECTORS.flatMap((s) => [...s.props.map((pr) => (pr.kind.startsWith('shelf-') ? { ...pr, variant: SHELF_SET[s.family] } : pr)), ...(s.sign ? [{ ...at('dept-sign', s.sign[0], s.sign[1]), variant: FAMILY[s.family] }] : [])]),
    ...FRONT, ...PROMOS, ...PILLARS, ...LIGHTS,
  ],
  ambient: '#eef6ff',
  // A la explanada de la fachada (data/poligonoNorte.ts), delante de la puerta automática.
  portals: [{ id: 'exit', tx: DOOR_X, ty: DECATHLON_H - 2, label: 'Salir al aparcamiento', to: { location: 'poligono-norte', spawn: 'pn-decathlon' } }],
  spawns: { entry: { ...EXIT, facing: 'up' } },
  npcs: [],
  racks: RACKS,
  inspects: SECTORS.map((s): InspectDef => ({ tx: s.look.tx, ty: s.look.ty, name: s.name, lines: s.look.lines })),
  workplace: 'decathlon',
  // El fichaje (turnos con contrato y el turno suelto sin él: scenes/Menus.openJob) y el punto de información de la entrada.
  spots: [
    { tx: 72, ty: 41, name: 'Fichaje · sala de personal', activities: [], job: 'decathlon' },
    { tx: 66, ty: 40, name: 'Punto de información', activities: ['browse-decathlon'] },
  ],
  points: {
    [`${P}_EXIT`]: p(EXIT.tx, EXIT.ty, 'exit', 'up'),
    // Cajas con cajero (data/decathlonLayout.ts): quien paga a la izquierda del mostrador, quien cobra a la derecha, y
    // se le habla por encima (systems/Interaction, `across`). La cola baja hacia la caja. El autopago no tiene punto:
    // es decorado hasta DEC-04, sin nadie que cobre ni nada que se pueda pulsar.
    ...Object.fromEntries(STAFFED.flatMap((c, i): [string, PointDef][] => [
      [`${P}_TILL_${i + 1}`, p(c.till.tx, c.till.ty, 'interact', 'right')],
      [`${P}_STAFF_${i + 1}`, p(c.staff!.tx, c.staff!.ty, 'work', 'left')],
      ...c.queue.map((q, k): [string, PointDef] => [`${P}_QUEUE_${i + 1}_${TWO(k)}`, p(q.tx, q.ty, 'wait', 'down')]),
    ])),
    ...Object.fromEntries(FITTINGS.map((pt, i): [string, PointDef] => [`${P}_FITTING_${TWO(i)}`, pt])),
    ...Object.fromEntries(BROWSE.map(([x, y, f], i): [string, PointDef] => [browseId(i), p(x, y, 'interact', f)])),
  },
};

/** Cada uno con su chaleco y su aspecto: nadie es igual al de al lado. */
const floor = (look: string, label: string, line: string, sections: readonly string[], offers: StaffRole['offers'], days?: StaffRole['days'], hours?: StaffRole['hours']): StaffRole =>
  ({ service: 'shop-worker', label, line, look, points: sectionPoints(sections), offers, days, hours });
/** Refuerzo de sección: viernes y sábado. */
const FRI_SAT = [4, 5] as const;
/** Turnos (AFLUENCIA-DEC02), los mismos que los de caja en data/decathlonLayout.ts. */
const OPENING = [9, 15.5] as const;
const MIDDLE = [12, 18] as const;
const CLOSING = [14.5, 21] as const;
/** Cola y pago en la misma caja, y sólo en una con cajero (`lane` del perfil, systems/Crowd). */
const PAY: readonly PlanStep[] = [
  { state: 'QUEUE', points: [`${P}_QUEUE_{n}_`], minutes: [1, 2] },
  { state: 'CHECKOUT', points: [`${P}_TILL_{n}`], minutes: [1, 2] },
];
/** El cliente de siempre (data/cuatroRiosVenues `customer`), pagando por carril. */
const laneCustomer = (line: string, weight: number, extra: Partial<VisitorRole> = {}): VisitorRole => {
  const base = customer(P, line, weight, extra);
  return { ...base, plan: [...base.plan.filter((s) => s.state !== 'QUEUE' && s.state !== 'CHECKOUT'), ...PAY] };
};

/** Quien cobra en cada caja con cajero: el turno sale de su `open` (data/decathlonLayout.ts) y nadie repite chaleco. */
const TILL_LOOKS = ['decathlon_employee', 'decathlon_employee_6', 'decathlon_employee_7', 'decathlon_employee_9', 'decathlon_employee_10', 'decathlon_employee_11'];
const TILL_LINES = ['Aquí puedes comprar ropa y calzado.', 'Puedes pasar por aquí.', 'Pasa, que abro esta.', 'Atendemos también por esta caja el fin de semana.', 'Si vas con prisa, ven por aquí.', 'Abrimos esta, que se está llenando.'];
const TILL_STAFF: readonly StaffRole[] = STAFFED.map((c, i): StaffRole => ({
  ...cashier(P, `Caja ${i + 1}`, TILL_LINES[i], TILL_LOOKS[i], 'shop-decathlon'),
  points: [`${P}_STAFF_${i + 1}`],
  ...(c.open?.days ? { days: c.open.days } : {}),
  ...(c.open?.minLevel ? { minLevel: c.open.minLevel } : {}),
  ...(c.open?.hours ? { hours: c.open.hours } : {}),
}));

export const DECATHLON_PROFILE: PopulationProfile = {
  place: 'decathlon-tienda',
  bands: [[9, 11, 'LOW'], [11, 14, 'MEDIUM'], [14, 17, 'LOW'], [17, 21, 'HIGH']],
  // El sábado, el pico; el domingo abre (data/places.ts) un poco por debajo.
  weekday: [0, 0, 0, 0, 1, 2, 1],
  // Rebajas (enero y julio) y la tarde de principio de mes, con la nómina recién cobrada.
  demand: [{ months: [1, 7], shift: 1 }, { dom: [1, 5], from: 17, to: 21, shift: 1 }],
  // Una nave de este tamaño se ve vacía con ocho: catorce, repartidos por los BROWSE de todas las secciones.
  maxVisitors: 14,
  lane: `${P}_STAFF_{n}`,
  staff: [
    ...TILL_STAFF,
    floor('decathlon_employee_2', 'Sección de montaña', 'Para rutas cortas, cuanto menos cargues, mejor.', ['montana-jr', 'montana-mujer', 'montana-hombre', 'mochilas'], 'decathlon-montana', undefined, MIDDLE),
    floor('decathlon_employee_3', 'Sección de running', 'Pruébate el calzado con los calcetines que usas al correr.', ['running', 'calzado-mujer', 'calzado-hombre'], 'decathlon-running', undefined, OPENING),
    floor('decathlon_employee_4', 'Sección de ciclismo', 'La medida de la cámara la pone en el neumático.', ['ciclismo', 'segunda-vida'], 'decathlon-ciclismo', undefined, CLOSING),
    // Ronda por todas las secciones (sus puntos uno a uno: los mismos que el prefijo `${P}_BROWSE_`). Atiende lo general
    // de la tienda (DEC-01, systems/StoreKnowledge), sin consejo de sección propio.
    { service: 'shop-worker', label: 'Reposición', line: 'Perdona, que paso con el carro.', look: 'decathlon_employee_5', points: sectionPoints(SECTORS.map((s) => s.id)), offers: 'decathlon-tienda', hours: OPENING },
    floor('decathlon_employee_8', 'Sección de fitness', 'Una esterilla ocupa poco y se recoge en un minuto.', ['fitness-mat', 'fitness-mujer', 'fitness-hombre'], 'decathlon-fitness', FRI_SAT, CLOSING),
  ],
  visitors: [
    laneCustomer('Venía a por calcetines y me llevo una tienda de campaña.', 2, { party: [1, 3] }),
    laneCustomer('¿Esto lo tenéis en otro color?', 1),
    {
      role: 'shopper', label: 'Cliente', line: 'Me lo pruebo, que con estas tallas nunca se sabe.', weight: 1,
      plan: [
        { state: 'BROWSE', points: [`${P}_BROWSE_`], minutes: [2, 5], repeat: [1, 3] },
        { state: 'CHECK_ITEM', points: [`${P}_FITTING_`], minutes: [3, 6] },
        ...PAY,
      ],
    },
  ],
};
