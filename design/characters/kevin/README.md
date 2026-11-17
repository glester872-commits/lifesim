# Kevin

Plantilla: `kevin.jpeg`. Es sólo una referencia de diseño y el juego no la carga.

## Lo que ya está en el juego

**Aspecto** (`src/data/npcs.ts`, id `kevin`). Se dibuja por código con NpcLook, como los demás personajes con nombre. Los colores salen de la imagen (retrato, sprite y paleta):

| Campo | Color | De dónde sale |
|---|---|---|
| cloth / clothDark | `#ece4d4` / `#c9bfae` | Sobrecamisa crema, con su sombra crema. |
| plaid | `#7a4e30` | Los cuadros marrones, a 16 px sólo como dos líneas finas verticales (de frente y de espaldas; de perfil, una), en un tono mezclado con el crema. Las horizontales se leían como una valla. |
| innerLayer | `#b08a5e` | El jersey beige de cuello alto: un cuello vuelto de 4 px bajo la barba y una franja por el centro de la camisa abierta. |
| chain | `#d8d8d8` | Cadena plateada, como el pendiente; de espaldas no se ve. |
| skin | `#c68a62` | Piel cálida de los naranjas de la paleta. |
| hair / hairStyle | `#1e1712` / `short` | Pelo casi negro, corto. |
| facialHair | `beard` | Barba corta. |
| trousers | `#1f1f24` | Pantalón negro del smart casual. |
| earrings | `#d8d8d8` | Pendiente plateado. |

**Identidad** (`src/data/namedPeople.ts`). Datos fijados por el usuario:

- 31 años, hombre, masculino, heterosexual.
- Temperamento bromista.
- Intereses: fútbol y fitness.
- Estilo designer.
- Trabajo: «creativo / lifestyle».
- Vive en Ribera Norte (`from: 'ribera'`).

**Casa.** `RB_RES_2_ENTRANCE`, el portal de Ribera 2 (vivienda moderna de Ribera Norte, sin interior).

**Rutina** (`src/data/characters.ts`). Todo el día en Ribera Norte, con locales abiertos a su hora (`src/data/places.ts`):

| Plantilla | Punto |
|---|---|
| 09:00 casa | en casa hasta salir hacia el café |
| 10:30 cafetería | Café del Río, `CAFE_RIO_TABLE_01` (alt. `_02`) |
| 12:00 parque / paseo | Paseo de la Ribera, `RB_BENCH_03` / `_06` / `_04` según la rutina |
| 14:00 comida | Casa Mar, `CASAMAR_TABLE_01` (alt. `_02`) |
| 16:00 tienda de moda | Ribera Sport, `SPORT_RACK_01` o `SPORT_TABLE_01`; el domingo, que cierra, `RB_BENCH_08` |
| 19:00 gym | Calistenia de la pista, `CALI_MAT_01` (alt. `PULLUP_01`) |
| 21:00 centro / paseo | Miradores del paseo, `RB_VIEW_01` / `_03` / `_02` |
| 23:00 cena / copas | Bar Ribera, `BAR_TABLE_01` (alt. `_03`); abre hasta las 02:00 |
| 00:30 casa | `RB_RES_2_ENTRANCE` |

Tiene tres rutinas: `kevin-semana` y `kevin-paseo` (lunes a sábado) y `kevin-domingo`.

**Frases.** Todas salen de la plantilla. «Dale, vamos a ver qué plan sale hoy.» es su frase al hablar con él.

**Reconocimiento y móvil.** Usa el mecanismo común de los personajes con nombre: el perfil social que se guarda y `contactsOf`. Sale en la agenda en cuanto le conoces, pero su número sólo se consigue hablando con él.

## Pendiente

- El degradado del pelo: se usa `short`.
- Llaves, auriculares, móvil y mochila como objetos visibles.
- Tienda de moda y gimnasio cubierto en Ribera Norte. Hoy van a Ribera Sport y a la calistenia al aire libre (con lluvia sigue allí).
- Outfits alternativos: casual rojo, gym, noche y verano.
- Retrato y expresiones de diálogo.
- Voz propia en el chat (`NAMED_VOICES`). Haría falta texto que la plantilla no da.
- El carácter muy cachondo y bromista que describe el usuario. Sólo está en el temperamento: la plantilla no trae chistes.
