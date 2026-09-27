# LIFE//SIM — Biblia visual (Visual V2)

Estándar fijo para todo el arte del juego. La **plazuela del metro de Vallesco**
es la escena de referencia: cualquier zona que se mejore después se compara con
ella y usa sus mismas piezas y reglas. Todo sigue dibujándose por código desde
`PALETTE` (`config/constants.ts`); no hay arte binario.

## 1. Resolución y densidad

| Regla | Valor |
|---|---|
| Tile | **16 × 16 px de mundo**. Un píxel de arte = un píxel de mundo. |
| Zoom | Entero, `round(alto de ventana / 280)` entre 3 y 5: se ven ~280 px de mundo en vertical (≈17 tiles). Nunca zoom fraccionario. |
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
| Puerta | 1 tile | Su umbral es acera: se entra caminando. |

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
   `leaves`; suelo `P` y `T`) antes de dibujar otras.
2. Pieza nueva: seguir §3 (escala), §5 (sombras) y §7 (luz), y declarar en su
   `PropDef` `shadow`, `cast`, `light`, `emissive` o `flat` según toque.
3. Comprobar de día y de noche, con gente, y pasar `npm run check`: una pieza
   sólida mal puesta rompe el grafo de peatones y el check lo dice.
