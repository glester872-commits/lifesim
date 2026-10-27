# LIFE//SIM — Biblia visual (Visual V2)

Estándar fijo para todo el arte del juego. La **plazuela del metro de Vallesco**
es la escena de referencia: cualquier zona que se mejore después se compara con
ella y usa sus mismas piezas y reglas. Todo sigue dibujándose por código desde
`PALETTE` (`config/constants.ts`); no hay arte binario.

> **Excepción registrada (AUD-007, CV-08/CV-09):** `src/assets/characters/sara-hd.png` (hoja de caminar
> de Sara, 4×4 frames de 48×72, «Prompt 52», 05-10) es **material de reserva y referencia** del pase HD.
> `BootScene` la carga como `sara-hd`, pero ningún personaje la usa: Sara se dibuja por código como el
> resto. No se borra ni se usa sin decisión del autor; si se adopta, entra con su propia excepción y su
> prueba, y si se descarta, se quita también su `preload`.

## 1. Resolución y densidad

| Regla | Valor |
|---|---|
| Tile | **16 × 16 px de mundo**. Un píxel de arte = un píxel de mundo. |
| Zoom | Entero y en píxeles físicos (lienzo a CSS × devicePixelRatio): `round(min(lado largo / 480, lado corto / 405))` entre 2 y 12 (`world/PixelScale`), igual en todos los sitios. Se ven ~480 × 405 px de mundo (≈30 × 25 tiles), algo más o menos según el redondeo: 1366 × 768 → 2, Full HD → 3, 1440p → 4, 4K → 5. Nunca zoom fraccionario. |
| Escala real | Una persona de 24 px mide ~1,70 m → **1 px ≈ 7 cm**. Todo objeto se dimensiona con esa regla. |
| Suavizado | Ninguno: `pixelArt`, `roundPixels`, texturas sin interpolar. |

## 2. Perspectiva

- **Suelo y tejados: cenital puro.** Se ven desde arriba, sin fugar.
- **Caras verticales: 3/4 oblicua hacia el sur.** Sólo se dibujan las caras que
  miran al sur (hacia la cámara). Norte, este y oeste no se ven; su canto se
  insinúa con 1 px más oscuro.
- **Altura comprimida.** Una planta de fachada = **1 fila de tile (16 px)**; se
  ven como mucho **2 plantas**. Lo que queda del edificio es tejado.
- **Props: de frente, con la tapa visible.** Crecen hacia arriba desde su fila
  base; **sólo la fila base colisiona** y se camina por detrás del resto.

## 3. Escala de personas y objetos

| Cosa | Tamaño | Notas |
|---|---|---|
| Persona | 16 × 24 px | Cabeza ~6 px, contorno de 1 px, pies en el borde inferior del tile. |
| Banco | 2 tiles de ancho, ~20 px de alto con respaldo | Asiento a ~7 px del suelo. |
| Farola | 1 tile de ancho, **52 px** (~3,6 m) | La luz sale de la linterna; el charco cae en el suelo. |
| Árbol de calle (plátano) | copa ~40 px de ancho, **56 px** de alto | Tronco de 4 px sobre alcorque de hierro. |
| Aparcabicis | 2 tiles, ~18 px | Tres bicis, cada una distinta. |
| Jardinera | 2 tiles, ~22 px | Flores en dos colores de acento como mucho. |
| Tótem de metro | 1 tile, 44 px | Rótulo luminoso arriba. |
| Puerta | 1 tile de ancho, **26–28 px** de hoja (planta de 32 px) | Más alta que quien entra. Su umbral es acera: se entra caminando. |
| Planta de fachada | **2 tiles (32 px)** | `LocationSystem.STOREY_ROWS`. Fachadas al sur: `floors` 1–3, dos filas cada una; lo que queda de huella es tejado. La fachada al norte se ve de canto (una fila). |

Ningún objeto del mobiliario supera 2 tiles de ancho sin ser un edificio.

## 4. Orden de dibujo (profundidad)

| Capa | Profundidad | Qué |
|---|---|---|
| Suelo horneado | −10 | Tiles, edificios, bordillos, sombras, calcomanías planas (`flat`). |
| Mundo ordenado por Y | `y` de los pies | Props, personas, coches. Quien tiene los pies más abajo tapa al de arriba. |
| Techo | 800 000 | Lámparas colgantes, tubos (`overhead`). |
| Sombra de la hora | 900 000 | Multiplica toda la escena con el color del cielo. |
| Luces | 900 001 | Charcos, halos y ventanas (ADD). |
| Emisivos | 900 002 | Rótulos y pantallas que brillan: no los oscurece la noche. |
| Indicador de E | 1 000 000 | Siempre legible. |

Lo plano (alcantarillas, rejillas, hojas, marcas) **se hornea con el suelo**:
no cuesta nada por frame y nunca tapa a nadie.

## 5. Sombras

- **Luz del noroeste.** Las sombras caen hacia el **sureste**.
- **Sombra de contacto** bajo todo lo que toca el suelo: elipse `#140f1c`, α 0,24–0,35.
- **Sombra proyectada** (`cast`) sólo para lo alto (farolas, tótems, troncos): una
  franja inclinada hacia el sureste de largo ≈ la mitad de la altura, α ~0,16,
  horneada. La copa de un árbol proyecta además una mancha al final.
- **Edificios:** banda de 5 px al este y 3 px al sur.
- **Personas:** sombra dinámica de dos tonos bajo los pies; nunca desaparece.

## 6. Paleta y ambiente

- La paleta es **de día**. La noche no es otra paleta: es la escena multiplicada
  por el color del cielo (`world/Lighting.ts`: amanecer, día, hora dorada, azul).
- **Cálido contra frío.** De noche el ambiente es azul (`#46528a`) y toda luz
  local es cálida (`#f0b46a`–`#ffd89a`). Los tubos y los neones son la única luz fría.
- **Materiales por familia de color:** granito y piedra en grises cálidos,
  hierro en verde casi negro (`iron`), madera en ocres, vegetación en tres tonos
  de verde más una luz. Acentos saturados (rojo, amarillo, cian) sólo en cosas
  pequeñas: una bici, una flor, un rótulo.

## 7. Luz

- Una fuente de luz = **halo pequeño en la fuente + charco elíptico en el suelo**
  (elipse 2:1, perspectiva cenital). Anillos escalonados, sin degradado suave.
- Se encienden con la noche (α = cuánto de noche es) y en interiores siempre.
- **Emisivos:** lo que brilla (rótulos, pantallas, ventanas encendidas) se dibuja
  encima de la sombra de la hora; de día es invisible y manda el arte normal.
- **Ventanas:** una parte fija de los cristales de fachada se enciende de noche.
- **Presupuesto:** ≤ 40 imágenes de luz por mapa. Nada de post-proceso a pantalla
  completa, ni bloom, ni sombras en tiempo real.

## 8. Materiales de suelo

- Legibles a zoom 3: piezas de 8 × 8 px (adoquín de granito) o 16 × 8 (baldosa),
  junta de 1 px, **bisel de 1 px** (luz arriba-izquierda, sombra abajo-derecha).
- Variación de tono por pieza con ruido determinista (±3 %). **Nunca un patrón
  que se repita cada dos tiles**: a zoom de juego se lee como lunares.
- Donde un pavimento de plaza toca otro material, **cenefa** de granito oscuro de 2 px.
- **Franja podotáctil** amarilla delante de accesos de transporte.

## 9. Vegetación

- Árbol de calle: copa por lóbulos, 3 tonos + racimos de luz, borde oscuro, sin
  píxeles sueltos. Tronco con corteza moteada (plátano), sobre **alcorque**.
- Jardineras con arbusto y flores; césped sólo donde el mapa dice hierba.
- Hojas caídas como calcomanía plana bajo los árboles, nunca por todo el suelo.

## 10. Comercios, mobiliario y rótulos

- Cada local se reconoce por **fachada e icono**, no por texto. Sólo se escriben
  palabras cortas que se lean a 16 px (`METRO`).
- El mobiliario urbano es de hierro verde oscuro y madera; el del metro, acero y
  cristal con su color de línea.
- Composición: agrupar en **islas** (banco + farola + papelera; árbol + banco),
  dejar libres las líneas de paso del grafo de peatones y el frente de las puertas.
- La decoración se justifica: todo lo que se pone tiene función urbana o cuenta algo.

## 11. Rendimiento

- Hornear todo lo que no se mueve (suelo, edificios, sombras, calcomanías).
- Una textura por tipo de prop, reutilizada: nunca una por instancia.
- Luces y emisivos son imágenes sueltas: contarlas (ver §7).

## 12. Cómo se mejora una zona

1. Usar las piezas V2 existentes (`plaza-bench`, `street-lamp`, `plane-tree`,
   `planter-box`, `bike-rack`, `metro-totem`, `info-board`, `manhole`, `drain`,
   `leaves`; suelo `P` y `T`) antes de dibujar otras. Para una plaza de primera: la boca de metro
   principal de 5 × 4 (`metro` con `w: 5, h: 4`), el árbol en parterre elevado (`bed-tree`) y el
   parterre de flores (`flower-bed`). Referencia: la plazuela del metro, 02:47 (design/visual-reference).
2. Pieza nueva: seguir §3 (escala), §5 (sombras) y §7 (luz), y declarar en su
   `PropDef` `shadow`, `cast`, `light`, `emissive` o `flat` según toque.
3. Comprobar de día y de noche, con gente, y pasar `npm run check`: una pieza
   sólida mal puesta rompe el grafo de peatones y el check lo dice.

## 13. Identidad de barrio

Cada zona varía dentro de esta biblia, nunca fuera: velo del suelo, guion de
color por hora, temperatura de farola, kit de calle, gente y tráfico. Reglas y
cómo añadir un barrio: `design/DISTRICTS.md`.

## 14. Visual V3 · corte vertical (plazuela del metro)

Antes/después en `design/vertical-slice/` (mismo sábado, 12:00, 20:50, 23:30 y
23:30 con lluvia; y móvil de noche). Lo que suma V3, para todo el mapa porque
es motor, no decorado:

- **Farola en tres capas** (`Lighting`): lavado tenue de fachada a la altura de
  la linterna, el charco de siempre y un núcleo casi blanco al pie. La noche
  (`NIGHT #4c5686`) es algo más honda: entre farola y farola, penumbra.
- **Ventanas con carácter** (`Detail.windowKind`, compartido de día y de noche):
  cálida, tenue, tele azul que parpadea, cortinas, persiana a medias; alguna
  con alguien al trasluz; un marco tenue de luz en el muro. De día, las mismas
  cortinas y persianas, macetas en el alféizar y algún aparato de aire.
- **Tejados con volumen**: todo lo que sobresale lleva cara de arriba con luz,
  cara sur oscura y sombra al sureste (`dropShadow`); azoteas sin rejilla de
  parches, con canalización. Hasta ocho piezas por tejado, nunca solapadas.
- **Suelo usado** (`Detail.wear`): manchas tenues (α ≤ 0,08), más delante de
  las puertas, cuneta junto al bordillo, aceite en la calzada. Bajantes en las
  esquinas de las fachadas de vecinos.
- **Sombras**: la copa proyecta cuatro lóbulos fijos, no un óvalo; en calidad
  alta el mapa de luz va a resolución completa y la sombra del sol sale nítida.
- **Charcos** que reflejan el cielo (franja en diagonal, canto con luz), no agujeros.
- **Micro-vida**: polillas en las farolas (calidad alta), tele que parpadea.
- **Calidad** (`config/quality.ts`): high / medium / low, un solo motor.

### Control de calidad de piezas

Antes de añadir una pieza: escala §3, luz del noroeste, sombra al sureste, paleta
`PALETTE`, contorno y bisel como sus vecinas. Nada que se lea peor que lo que ya
hay; si hace falta algo provisional, se marca `// placeholder:` en el código.

## 15. Segunda pasada · escena de muestra (`LocationDef.showcase`)

La escena de muestra es un rectángulo de datos (Vallesco: la plazuela del metro,
`tx 12, ty 27, w 40, h 22`). Dentro, y sólo dentro, se prueba el estándar
siguiente antes de llevarlo al resto del mapa:

- **Acera de baldosa grande** (`Surfaces.sidewalkV3`): hiladas de 8 px con piezas
  de 12–24 px a matajunta que nunca caen en la rejilla de los tiles.
- **Fachada con hueco** (`Detail.showcaseDepth`): sombra del dintel y la jamba
  sobre el cristal, dintel con luz, sombra del alféizar, churretes; imposta de la
  planta baja marcada; sombra del alero; humedad en la base.
- **Oclusión** más larga y suave al pie y a los lados de los edificios, y anillos
  de sombra bajo cada prop y cada copa.
- **Primer plano** (`world/Foreground`, `LocationDef.foreground`): pocas copas en
  las esquinas, con paralaje ×1,15, teñidas con el cielo de la hora; si tapan al
  jugador, casi desaparecen. Nunca sobre una puerta que se cruce a diario.

Lo que no es del mapa sino de todos (y por eso ya vale en todo el barrio):

- **Cámara**: la regla de la tabla del §1 (encuadre de 480 × 405 px, zoom entero en píxeles físicos). El encuadre de 315 × 270 con medios pasos (3,5) de esta escena se retiró: a 3,5 un píxel de arte ocupaba 3 o 4 de pantalla, alternos.
- **Personas**: sombra de contacto en tres anillos (18 × 6), sombra larga de la
  farola más cercana de noche (`world/LampShadows`), hombro con luz, cuello,
  cinturón, pierna iluminada, puntera y volumen de pelo.
- **Turismos**: costado con volumen, cristal con reflejos, pasos de rueda, faros y
  pilotos con carcasa, sombra en dos tonos; con el asfalto mojado, el reflejo de
  faros y pilotos en el suelo.
- **Boca de metro**: peldaños con vuelo y desgaste, paredes de la bajada en
  sombra, marco de acero del rótulo, pilares con fondo, luz fría que sube.

## 16. Pixel art clásico · Alpha-03 (guía de dirección y estado del piloto)

Pixel art clásico, no HD-2D: nada de 3D, profundidad de campo, bloom, desenfoque,
post-proceso fotográfico ni luz volumétrica. El salto de calidad se busca con las
técnicas de siempre, aplicadas al arte que ya se dibuja por código.

### Reglas

| Tema | Regla |
|---|---|
| Escala | La del §1: 1 px de arte = 1 px de mundo, zoom entero. Ningún arte nuevo a otra densidad. |
| Contorno | 1 px, oscuro cálido (`PALETTE.outline`), sólo en la silueta y donde dos volúmenes se cruzan. Nunca dos líneas paralelas ni dientes sueltos en una curva: escalones regulares (2-2-1-1, nunca 2-1-2). |
| Luz | Noroeste (§5). Cantos de arriba y de la izquierda con luz; abajo y a la derecha, sombra. Igual de día y en interiores; de noche la luz local manda (§7). |
| Rampas | **Por material, a mano** (`MATERIAL_RAMPS`, abajo): 4 tonos escogidos (hondo, sombra, base, luz; brillo sólo en metal y cristal). La sombra baja hacia el frío y gana algo de saturación; la luz sube hacia el cálido y la pierde. No se deriva cada tono con un `shade()` del color base. |
| Volumen | 2–4 tonos por volumen. Sombra de contacto bajo todo lo que toca el suelo (§5) y auto-sombra coherente (alero, dintel, alféizar). Sin degradados suaves ni tramado repartido por toda una superficie. |
| Clusters | La superficie se describe con manchas de 2 px o más de un mismo tono. Ningún píxel suelto que no sea un detalle con nombre (un remache, un brillo). `despeckle` (world/paint) limpia los huérfanos al hornear. |
| Materiales | Por forma, no por ruido: sillar (piezas con bisel y junta), ladrillo (hiladas a matajunta), revoco (planos lisos con imposta y zócalo), cristal (reflejo en diagonal de 2 tonos), metal (brillo puntual), madera (veta en bandas), asfalto y acera (§8). |
| Vegetación | §9: masas por lóbulos, luces agrupadas arriba-izquierda, sombra interior, silueta legible; variantes por especie, no el mismo árbol repetido. |
| Personas | §3–§5: escala real, ropa y pelo con volumen propio, pie y sombra alineados, oclusión por profundidad (§4). |
| Interactivo | Lo que se usa (puertas con portal, mostradores, máquinas, percheros, asientos) se lee **en movimiento**: más contraste local y un remate de luz arriba-izquierda; lo decorativo queda un escalón más apagado. |
| Render | Nearest-neighbor, `roundPixels`, sin escalado fraccionario; arte estable horneado una vez (`make`), nunca regenerado por fotograma. |

### Rampas por material (`world/paint` MATERIAL_RAMPS)

Cuatro tonos escogidos a mano por material: hondo, sombra, base, luz. La sombra baja al frío y gana algo de
saturación; la luz sube al cálido y la pierde. Un tono de un material (a menos de 14 de distancia RGB de su rampa) cae
en el tono de la rampa con la claridad más parecida (`materialTone`); lo que no es de ningún material (geranios,
contraventanas, madera, luz de ventana) se pinta como siempre.

| Material | Hondo | Sombra | Base | Luz |
|---|---|---|---|---|
| Revoco crema | `#9a8478` | `#c4ad8f` | `#e7cfaa` | `#f6e6c6` |
| Sillería caliza | `#625f66` | `#857f80` | `#a8a194` | `#c8bfa9` |
| Azotea | `#3f3d4a` | `#57545f` | `#737078` | `#8e8a8c` |
| Teja | `#5e3b3c` | `#80524a` | `#9e705f` | `#bf8a6a` |
| Cristal | `#1f2f3f` | `#2e4756` | `#3d5f6b` | `#6f97a0` |

Un material nuevo entra con su fila aquí y en `MATERIAL_RAMPS`, lejos (>14) de los acentos que no deben cambiar
(`scripts/check-art.ts` lo vigila).

### Piloto (calle residencial de Vallesco) · resultado

- Alcance por datos: `BuildingDef.art: 'clasico'` en «Tu portal · Olmo 7» y «Olmo 11»; sin él, el dibujo es el de
  siempre. Fachada y azotea: rampas por material y `despeckle` al hornear.
- Medido (mismo encuadre, hora y semilla): huérfanos por textura 12–65 → 1; colores distintos de la fachada/azotea de
  Olmo 7 342/768 → 248/340 y de Olmo 11 562/436 → 167/209 (manchas de tono, no grano).
- Visto: v1 (giro automático de 24°) dejaba rayas rojas en las juntas; v2 (giro suave) rayas anaranjadas; v3 (rampas a
  mano) las quita, y la sillería de Olmo 11 se lee por bloques con su sombra; la puerta de madera salía rosa por un
  umbral de 18 (cogía la teja) y con 14 queda en su color. A escala de juego la mejora es visible pero moderada; donde
  más se nota es en la piedra.
- Evidencia: `design/alpha03/panel-v1-rayas.png`, `panel-v2.png`, `panel-v3-rampas-material.png`,
  `calle-antes-dia.png`, `calle-despues-dia.png`.
- Noche (22:00, mismo encuadre): la luz de la hora multiplica igual; sin halos, rayas ni costuras; la sillería conserva
  sus juntas. Evidencia: `calle-antes-noche.png`, `calle-despues-noche.png`.
- Rendimiento (node, peor caso: una consulta de tono por píxel en 160 × 80): `materialTone` 19,5 ms frente a 5,1 ms de
  `shade`, `despeckle` 0,8 ms: ≈15 ms más por textura, ≈60 ms para las cuatro del piloto, una vez al entrar en el mapa;
  nada por fotograma. Si al extenderlo pesa, se memoiza `materialTone` (pocas entradas distintas).

### Plan por lotes

Cada lote, con la misma regla: escena de muestra con antes/después en el mismo encuadre, hora y semilla
(`scripts/hd01/preview.mjs`), huérfanos y colores medidos, `npm run check` y recorrido en el navegador. Si no se ve
claramente mejor a escala de juego, no se amplía.

1. **Piloto** (calle residencial de Vallesco): hecho con rampas por material, de día y de noche, y medido. **Puerta de entrada al resto: que el autor lo dé por bueno.**
2. **Resto del residencial**: la tercera fachada `finish: 'hd03'` (la boca de metro de Vallesco) sólo necesita el dato
   `art`; las manzanas por segmentos de los mapas con `finish: 'hd04'` pasan por las otras dos llamadas a
   `drawResidentialFacade` (world/BuildingArt) y hay que llevarles `classic: b.art === 'clasico'` antes de marcar sus datos.
3. **Suelo y mobiliario del piloto** (acera, alcorque, banco, farola, jardinera): rampas propias en `Surfaces` y
   `TextureFactory`, con un acabado por zona que no cambie el resto del mundo.
4. **Vegetación** (`Vegetation`): lóbulos, luces agrupadas y especies; medir el atlas antes y después.
5. **Comercio** (fachadas de tienda, rótulos, escaparates) y **mostradores** (lo interactivo, un escalón más legible).
6. **Metro** (bocas, andenes) e **interiores** (casa, Hilo, Decathlon): el mismo estándar con la luz interior siempre
   encendida (§7).
7. **NPC y vehículos**: ropa y carrocerías con rampas por material, sin cambiar escala, hitbox ni animación.

En cada lote, rendimiento medido con el mismo recorrido antes y después (tiempo de horneado al entrar en el mapa y
coste por fotograma), y nada de HD-2D.
