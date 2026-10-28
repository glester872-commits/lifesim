# Decathlon · correspondencia plano → juego (Alpha-08)

Fuentes que se han abierto de verdad (en esta carpeta):

| Archivo | Qué es | Para qué se usa |
|---|---|---|
| `217426dc-49c3-4ac3-8bbf-39a1f0f320f1.png` | Plano por secciones de Decathlon San Sebastián de los Reyes, con leyenda de colores | **Fuente principal**: distribución, adyacencias, pasillos, entrada y colores de familia de los carteles (`world/StoreArt` `SIGN_FAMILIES`) |
| `08556bb0-b853-4ef1-aca3-85134542b140.png` | Foto de la pared de bicis de Segunda Vida | Soportes de bicis de colores (`bike-stand`) y el pro shop de arriba a la derecha |
| `b0844631-862f-4426-932b-9fb0ee2dc9cc.png` | Foto de un mural de textil doblado («clima cálido», 9,99) | Mural de Sportswear (texto del `look`) y densidad de las baldas |
| `31edf852-d902-4cd5-a69f-b6379e47d7d0.png` | Foto de raqueta y textil: murales densos, expositor azul y cubo amarillo de promoción | Cubos `promo-bin` al borde del pasillo |
| `8b6496bb-10c4-4a32-98d1-d8938f97c296.png` | Foto de la fachada: listones de madera, franja azul y logotipo | **Sin aplicar**: la tienda no tiene calle (se entra desde el menú de la parada); queda para cuando tenga mapa |
| `97bd2945-76b3-4804-be43-c805731ff522.png` | Foto de camping: tienda blanca y gris montada en el suelo, techo oscuro con líneas de luz | Tercera variante de `camping-tent` (blanca con doble techo gris); tubos de luz en hilera sobre los pasillos |
| `9cb4e2ad-43b9-4b0d-83ed-3db1ae7a0898.png` | Foto de un pasillo de góndolas largas y llenas, suelo de hormigón claro | Góndolas `shelf-run` / `shelf-front` en tramos continuos, con producto denso y una gama por familia; suelo de pasillo `h` |
| `../references/uniforms/*.webp` | Fotos del uniforme (Alpha-07) | Chaleco del personal, sin cambios |

No hay foto de zapatillas ni de la pista de pádel: el calzado y la pista salen sólo del plano.

Ninguna imagen se usa como textura: todo se dibuja por código.

## Rejilla

Nave de 76 × 46 tiles (`data/decathlon.ts`). El plano mide ~1230 × 685 px: 1 tile ≈ 16 px de plano en horizontal y
≈ 15 px en vertical. Las coordenadas son una lectura del plano, no una medida: se ha respetado primero el orden y la
adyacencia de las secciones y la posición de pasillos y entrada.

## Secciones

| Plano | Sector (`SECTORS`) | Tiles (x0,y0–x1,y1) |
|---|---|---|
| Raqueta (arriba izq., con el rectángulo alto) | `raqueta-padel` + pista de pádel 6 × 12 | 1,2–8,16 |
| Running | `running` | 9,2–17,10 |
| Sportswear | `sportswear` | 18,2–20,10 |
| Probadores | `probadores` (5 cabinas) | 21,2–25,10 |
| Montaña JR / mujer / Hombre | `montana-jr`, `montana-mujer`, `montana-hombre` | 26–44, 2–10 |
| Camping (arriba) | `camping` | 45,2–54,10 |
| mochilas | `mochilas` | 55,2–58,10 |
| Fútbol | `futbol` | 59,2–60,10 |
| Pro shop de segunda vida | `segunda-vida` | 63,2–74,12 |
| Ciclismo | `ciclismo` | 63,15–74,33 |
| Raqueta (banda central) | `raqueta` | 11,14–20,20 |
| Dep. Agua | `agua` | 21,14–29,20 |
| ESCALADA | `escalada` | 32,14–33,20 |
| Calzado Mujer / Hombre | `calzado-mujer`, `calzado-hombre` | 34–44, 14–20 |
| Camping (banda central) | `camping-2` | 47,14–53,20 |
| accesorios | `accesorios` | 54,14–60,20 |
| Kids / Underwear | `kids` | 11,23–20,28 |
| Roller | `roller` | 21,23–24,28 |
| Baloncesto | `baloncesto` | 25,23–29,28 |
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
| Cajas (abajo der., flechas I1/I2 del plano) | mostradores, taquilla y puerta | 63–74, 36–44 |

## Interpretaciones y diferencias

- **Pista de pádel:** el plano no la rotula. Se lee como el rectángulo alto dentro de Raqueta, arriba a la izquierda.
- **Golf Textil** se ha juntado con Golf, y la **Equitación** de la banda central, con la de abajo: en el plano son
  tiras muy estrechas que a 1 tile por persona no caben como sección propia.
- **Fútbol** va arriba, junto a mochilas. En el plano su etiqueta cae algo más abajo, en la cuña que baja hacia «accesorios».
- **Pasillo sur:** en el plano está a ~0,75 de la altura; aquí, a ~0,65, para dar a la banda de abajo sitio para
  máquinas de fitness y kayaks.
- **Entrada:** abajo a la derecha, como en el plano. La fila inferior del plano es el pasillo de cajas, de punta a punta.
