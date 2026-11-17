# Ángel

Plantilla: `angel.jpeg`. Es sólo una referencia de diseño y el juego no la carga. En el rótulo pone «AMIGO»; el usuario confirmó que se llama Ángel.

## Lo que ya está en el juego

**Aspecto** (`src/data/npcs.ts`, id `angel`). Se dibuja por código con NpcLook, como los demás personajes con nombre:

| Campo | Color | De dónde sale |
|---|---|---|
| cloth / clothDark | `#f2efe8` / `#cfc8bc` | Camiseta blanca. La sombra guarda la misma relación que en Sara. |
| cap | `#e8628e` | Gorra rosa, el rosa de la paleta de la hoja. |
| bag | `#232329` | Mochila negra. |
| trousers | `#232329` | Pantalón corto negro del outfit casual. |
| hair / hairStyle | `#3a2a20` / `short` | Castaño oscuro, corto bajo la gorra. |
| skin | `#d9a27c` | Tono cálido claro, de los anaranjados de la paleta. |

**Identidad** (`src/data/namedPeople.ts`). Datos fijados por el usuario:

- 26 años, hombre, masculino, heterosexual.
- Temperamento extrovertido.
- Intereses: fútbol y música.
- Estilo streetwear.
- Trabajo: «estudiante / creativo».
- Vive fuera del barrio.

**Casa.** Viene de fuera, así que su `home` es `METRO_ENTRANCE`. Empieza el día llegando en metro y lo termina yéndose por la misma boca. No ocupa ninguna vivienda de Vallesco.

**Rutina** (`src/data/characters.ts`). Usa los puntos de la plantilla, cambiados donde chocaban con Sara:

| Plantilla | Punto |
|---|---|
| 09:00 casa | en el metro, fuera del barrio |
| 10:30 cafetería | `CAFE_TABLE_06` (alt. `_07`) |
| 12:00 parque / paseo | `PARK_BENCH_01` entre semana; `PARK_BENCH_04` el finde; `PLAZA_BENCH_01` los días de paseo |
| 14:00 comida | `RESTAURANT_TABLE_07` (alt. `_15`) |
| 17:00 tienda de moda | `CLOTHING_STORE_RACK_04` |
| 19:00 gym | `GYM_TREADMILL_03` (alt. `_04`) |
| 21:00 centro / paseo | `PLAZA_BENCH_05`; `PLAZA_BENCH_04` los días de paseo |
| 23:00 casa | `METRO_ENTRANCE` |

Tiene tres rutinas: `angel-semana`, `angel-finde` y `angel-paseo`.

**Frases.** Todas salen de la plantilla. Cada una va en la parada donde tiene sentido: «Tengo que pasar por la tienda un momento.» cuando va a la tienda, «Después caigo al gym.» cuando está en la tienda y «Te escribo cuando llegue.» cuando vuelve al metro.

**Reconocimiento y móvil.** Funcionan con el mecanismo común de los personajes con nombre sin historia propia, como Noa o Yasmin: el perfil social que se guarda y `contactsOf`. Aparece en la agenda en cuanto le conoces, pero su número sólo se consigue hablando con él.

## Pendiente

- Estampado negro de la camiseta.
- Reloj, gafas, auriculares, móvil y llaves como objetos visibles.
- Outfits alternativos: hoodie, streetwear, gym y noche.
- Retrato y expresiones de diálogo.
- Voz propia en el chat (`NAMED_VOICES`) y frases por relación: necesitarían texto que la plantilla no da.
