# Decathlon · correspondencia plano → juego (Alpha-08)

Fuentes que se han abierto de verdad (en esta carpeta):

| Archivo | Qué es | Para qué se usa |
|---|---|---|
| `217426dc-49c3-4ac3-8bbf-39a1f0f320f1.png` | Plano por secciones de Decathlon San Sebastián de los Reyes, con leyenda de colores | **Fuente principal**: distribución, adyacencias, pasillos, entrada y colores de familia de los carteles (`world/StoreArt` `SIGN_FAMILIES`) |
| `08556bb0-b853-4ef1-aca3-85134542b140.png` | Foto de la pared de bicis de Segunda Vida | Soportes de bicis de colores (`bike-stand`) y el pro shop de arriba a la derecha |
| `b0844631-862f-4426-932b-9fb0ee2dc9cc.png` | Foto de un mural de textil doblado («clima cálido», 9,99) | Mural de Sportswear (texto del `look`) y densidad de las baldas |
| `31edf852-d902-4cd5-a69f-b6379e47d7d0.png` | Foto de raqueta y textil: murales densos, expositor azul y cubo amarillo de promoción | Cubos `promo-bin` al borde del pasillo |
| `8b6496bb-10c4-4a32-98d1-d8938f97c296.png` | Foto de la fachada: listones de madera, franja azul y logotipo | **Aplicada en Alpha-09**: la calle Polígono Norte (`data/poligonoNorte.ts`), con la nave de listones, el rótulo blanco, la franja azul y la planta baja de cristal (`world/StoreArt` `drawMegastore`) |
| `97bd2945-76b3-4804-be43-c805731ff522.png` | Foto de camping: tienda blanca y gris montada en el suelo, techo oscuro con líneas de luz | Tercera variante de `camping-tent` (blanca con doble techo gris); tubos de luz en hilera sobre los pasillos |
| `9cb4e2ad-43b9-4b0d-83ed-3db1ae7a0898.png` | Foto de un pasillo de góndolas largas y llenas, suelo de hormigón claro | Góndolas `shelf-run` / `shelf-front` en tramos continuos, con producto denso y una gama por familia; suelo de pasillo `h` |
| `../references/uniforms/*.webp` | Fotos del uniforme (Alpha-07) | Chaleco del personal, sin cambios |

No hay foto de zapatillas ni de la pista de pádel: el calzado y la pista salen sólo del plano.

Ninguna imagen se usa como textura: todo se dibuja por código.

## Rejilla

Nave de 76 × 52 tiles (`data/decathlon.ts`; 76 × 46 hasta DEC-02, que añade debajo la línea de cajas: filas 0–43 sin
cambios, 44–49 nave sólo en x 41..74, 50 puerta, 51 muro). Distribución en datos: `data/decathlonLayout.ts`. El plano mide ~1230 × 685 px: 1 tile ≈ 16 px de plano en horizontal y
≈ 15 px en vertical. Las coordenadas son una lectura del plano, no una medida: se ha respetado primero el orden y la
adyacencia de las secciones y la posición de pasillos y entrada.

## Secciones

| Plano | Sector (`SECTORS`) | Tiles (x0,y0–x1,y1) |
|---|---|---|
| Raqueta (arriba izq., con el rectángulo alto) | `raqueta-padel` + pista de pádel 6 × 12 | 1,2–8,16 |
| Running | `running` | 9,2–17,10 |
| Probadores (proba.jpeg, probas.jpeg) | `probadores` (11 cabinas: 1–5, 1, accesible, 6–9; `fittingRooms` de decathlonLayout.ts, cabinas en x 19–29, fila 3) | 18,2–30,6 |
| Sportswear | `sportswear` (DEC-02: bajo los probadores) | 18,7–23,10 |
| Montaña JR | `montana-jr` (DEC-02: bajo los probadores) | 24,7–30,10 |
| Montaña mujer / Hombre | `montana-mujer`, `montana-hombre` | 31–44, 2–10 |
| Camping (arriba) | `camping` (DEC-02: se queda el hueco de mochilas y fútbol, sin muebles nuevos) | 45,2–60,10 |
| Pro shop de segunda vida | `segunda-vida` | 63,2–74,12 |
| Ciclismo | `ciclismo` | 63,15–74,33 |
| Raqueta (banda central) | `raqueta` | 11,14–20,20 |
| Dep. Agua | `agua` | 21,14–29,20 |
| ESCALADA | `escalada` | 32,14–33,20 |
| Calzado Mujer / Hombre | `calzado-mujer`, `calzado-hombre` | 34–44, 14–20 |
| Camping (banda central) | `camping-2` | 47,14–53,20 |
| mochilas | `mochilas` (DEC-02: antes 55,2–58,10) | 54,14–56,20 |
| accesorios | `accesorios` (DEC-02: comparte el bloque con mochilas) | 57,14–60,20 |
| Kids / Underwear | `kids` | 11,23–20,28 |
| Roller | `roller` | 21,23–24,28 |
| Baloncesto | `baloncesto` | 25,23–29,25 |
| Fútbol | `futbol` (DEC-02: antes 59,2–60,10; junto a roller y baloncesto) | 25,26–29,28 |
| Minoritarios | `minoritarios` | 32,23–38,28 |
| Caza | `caza` | 39,23–44,28 |
| Pesca | `pesca` | 47,23–53,28 |
| Colectivos (bloque derecho) | `colectivos` | 54,23–60,28 |
| Fitness mujer | `fitness-mujer` | 1,18–8,32 |
| Fitness Mat | `fitness-mat` (suelo de goma) | 1,34–8,40 |
| Fitness Hombre | `fitness-hombre` | 11,33–19,40 |
| Barco + kayak | `kayak` | 20,33–25,40 |
| Golf / Golf Textil | `golf` | 28,33–35,40 |
| Equitación | `equitacion` | 36,33–39,40 |
| Salud y accesorios | `salud` | 40,33–47,40 |
| SWIM PRO | `natacion` | 51,33–60,40 |
| Cajas (abajo der., flechas I1/I2 del plano) | DEC-02: 6 con cajero (cliente c, mostrador c+1, cajero c+2, c = 47…62, fila 46; cola c,44–45) y 2 de autopago (42 y 44, máquina en la fila 47) | 41–66, 44–49 |
| Salida y puerta | pasillo `salida` 45,47–66,49; puerta 67,50 (entrada y salida); taquilla 72,40, información 66–67,40 | 45–74, 40–50 |

## Interpretaciones y diferencias

- **Pista de pádel:** el plano no la rotula. Se lee como el rectángulo alto dentro de Raqueta, arriba a la izquierda.
- **Golf Textil** se ha juntado con Golf, y la **Equitación** de la banda central, con la de abajo: en el plano son
  tiras muy estrechas que a 1 tile por persona no caben como sección propia.
- **Fútbol** (DEC-02) baja a la banda central, junto a roller y baloncesto; **mochilas**, al bloque de accesorios.
- **Pasillo sur:** en el plano está a ~0,75 de la altura; aquí, a ~0,65, para dar a la banda de abajo sitio para
  máquinas de fitness y kayaks.
- **Entrada:** abajo a la derecha, como en el plano. La fila inferior del plano es el pasillo de cajas, de punta a punta
  (`cajas-acceso`, 1,41–74,43); debajo, desde DEC-02, la línea de cajas y la salida. Una sola puerta, de entrada y de
  salida: la segunda puerta del plano queda fuera de alcance.
